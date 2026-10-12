import { DomainError } from "../../server/questforge-domain.ts";
import { timeTotals, type NoteRecord, type TimeEntry, type ProductivityData, type TimeSource } from "../../shared/productivity.ts";
import type { Quest } from "../../types/questforge.ts";
import type { WorkerEnv, JsonRecord } from "./worker-types.ts";
import { sha256 } from "./security.ts";

type Stored = Omit<ProductivityData, "revision"> & { receipts: Record<string, { fingerprint: string; result: unknown }> };
// shortcut: owner JSON is bounded to 1 MB; normalize storage before high-volume rollout.
const MAX_BYTES = 1000000;
const fail = (code: string, message: string, status = 400): never => { throw new DomainError(status, code, message); };
function database(env: WorkerEnv) { return env.QUESTFORGE_DB ?? fail("productivity_storage_unavailable", "Private D1 storage is required.", 503); }
function text(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== "string" || Array.from(value).length > max || (required && !value.trim())) return fail("invalid_productivity_input", `Invalid ${name}.`);
  return value;
}
function fields(input: JsonRecord, keys: string[]): void { if (Object.keys(input).some(k => !keys.includes(k))) fail("invalid_productivity_input", "Unknown fields."); }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") return fail("invalid_productivity_input", "Boolean required."); return value; }
function instant(value: unknown, required = true): string {
  if (!required && value === "") return "";
  const at = text(value, "timestamp", 40, true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(at) || !Number.isFinite(Date.parse(at))) return fail("invalid_productivity_input", "An ISO instant with timezone is required.");
  if (new Date(`${at.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== at.slice(0, 10) || Number(at.slice(11, 13)) > 23) return fail("invalid_productivity_input", "Invalid calendar date or time.");
  const date = new Date(at);
  if (date.getUTCFullYear() < 1970 || date.getUTCFullYear() > 9999) return fail("invalid_productivity_input", "Timestamp out of range.");
  return date.toISOString();
}
function timezone(value: unknown): string {
  const zone = text(value, "timezone", 80, true);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { return fail("invalid_productivity_input", "Unknown timezone."); }
  return zone;
}
function source(value: unknown): TimeSource { if (!["native", "toggl", "separate"].includes(String(value))) return fail("invalid_productivity_input", "Unknown time source."); return value as TimeSource; }
function questId(value: unknown, quests: readonly Quest[], optional = false): string {
  const id = text(value, "questId", 120, !optional);
  if (id && !quests.some(q => q.id === id)) return fail("quest_not_found", "Linked Quest does not exist.", 404);
  return id;
}
function version(input: JsonRecord, current: { updatedAt: string }): void {
  if (input.expectedUpdatedAt !== current.updatedAt) fail("productivity_conflict", "Record changed; reload before saving.", 409);
}
function stamp(previous = ""): string { return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString(); }
function initial(existing: boolean): Stored { return { notes: [], entries: [], preferences: { timeSource: existing ? "toggl" : "native", timezone: "", updatedAt: "" }, receipts: {} }; }
async function read(env: WorkerEnv, uid: string, existing: boolean): Promise<{ revision: number; data: Stored }> {
  const db = database(env);
  let row = await db.prepare("SELECT revision,value_json FROM productivity_workspaces WHERE uid=?").bind(uid).first<{ revision: number; value_json: string }>();
  if (!row) {
    await db.prepare("INSERT INTO productivity_workspaces(uid,revision,value_json,updated_at) VALUES (?,0,?,?) ON CONFLICT(uid) DO NOTHING").bind(uid, JSON.stringify(initial(existing)), stamp()).run();
    row = await db.prepare("SELECT revision,value_json FROM productivity_workspaces WHERE uid=?").bind(uid).first<{ revision: number; value_json: string }>();
  }
  if (!row) return fail("productivity_storage_unavailable", "Private storage is unavailable.", 503);
  return { revision: row.revision, data: JSON.parse(row.value_json) as Stored };
}
async function mutate(env: WorkerEnv, uid: string, existing: boolean, action: string, input: JsonRecord, run: (data: Stored, revision: number) => unknown): Promise<unknown> {
  const operationId = text(input.operationId, "operationId", 120, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(operationId)) return fail("invalid_productivity_input", "Invalid operation ID.");
  const fingerprint = await sha256(JSON.stringify({ action, ...input }));
  const db = database(env);
  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await read(env, uid, existing);
    const prior = Object.hasOwn(snapshot.data.receipts, operationId) ? snapshot.data.receipts[operationId] : undefined;
    if (prior) { if (prior.fingerprint !== fingerprint) return fail("operation_conflict", "Operation ID already used with different content.", 409); return prior.result; }
    const result = run(snapshot.data, snapshot.revision);
    snapshot.data.receipts = { ...snapshot.data.receipts, [operationId]: { fingerprint, result } };
    const serialized = JSON.stringify(snapshot.data);
    // Reserve space for stopping the timer even when ordinary writes fill the workspace.
    if (new TextEncoder().encode(serialized).length > (action === "POST:/timer/stop" ? MAX_BYTES : MAX_BYTES - 100000)) return fail("productivity_capacity", "Workspace capacity exceeded. Export and delete unused work data before continuing.", 413);
    const updated = await db.prepare("INSERT INTO productivity_workspaces(uid,revision,value_json,updated_at) VALUES (?,1,?,?) ON CONFLICT(uid) DO UPDATE SET revision=revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at WHERE revision=?")
      .bind(uid, serialized, stamp(), snapshot.revision).run();
    if (updated.meta?.changes === 1) return result;
  }
  return fail("productivity_conflict", "Workspace changed; reload before saving.", 409);
}
function page<T extends { id: string; updatedAt: string; archived: boolean }>(items: T[], query: URLSearchParams, revision: number) {
  const limit = Number(query.get("limit") ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail("invalid_productivity_input", "Limit must be 1–200.");
  if (query.has("revision") && query.get("revision") !== String(revision)) return fail("productivity_conflict", "List changed; restart pagination.", 409);
  let filtered = items.filter(i => query.get("archived") === "true" || !i.archived);
  if (query.has("questId")) filtered = filtered.filter(i => "questId" in i && i.questId === query.get("questId"));
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const cursor = query.get("cursor"); const at = cursor ? filtered.findIndex(i => i.id === cursor) : -1;
  if (cursor && at < 0) return fail("productivity_conflict", "Cursor no longer exists.", 409);
  const result = filtered.slice(at + 1, at + 1 + limit);
  return { items: result, revision, nextCursor: at + 1 + limit < filtered.length ? result.at(-1)!.id : null };
}
function note(input: JsonRecord, quests: readonly Quest[], previous?: NoteRecord): NoteRecord {
  const title = text(input.title, "title", 120, true).trim();
  return { id: previous?.id ?? crypto.randomUUID(), title, body: text(input.body, "body", 50000), questId: questId(input.questId ?? "", quests, true), archived: input.archived === undefined ? previous?.archived ?? false : boolean(input.archived), updatedAt: stamp(previous?.updatedAt) };
}
function entry(input: JsonRecord, quests: readonly Quest[], previous?: TimeEntry, allowRunning = false): TimeEntry {
  const startAt = instant(input.startAt), stopAt = instant(input.stopAt, !allowRunning);
  if (Date.parse(startAt) > Date.now() + 60000 || (stopAt && (Date.parse(stopAt) < Date.parse(startAt) || Date.parse(stopAt) > Date.now() + 60000))) return fail("invalid_productivity_input", "End must follow start and cannot be in the future.");
  if (stopAt && Date.parse(stopAt) - Date.parse(startAt) > 366 * 86400000) return fail("invalid_productivity_input", "A single work entry may span at most 366 days.");
  if (!stopAt && input.archived === true) return fail("invalid_productivity_input", "A running entry cannot be archived.");
  return { id: previous?.id ?? crypto.randomUUID(), questId: questId(input.questId, quests), note: text(input.note ?? "", "note", 1000), startAt, stopAt, archived: input.archived === undefined ? previous?.archived ?? false : boolean(input.archived), updatedAt: stamp(previous?.updatedAt) };
}

export async function productivityRoute(request: Request, env: WorkerEnv, uid: string, quests: readonly Quest[], existing: boolean, input: JsonRecord = {}): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.slice("/v1/productivity".length), method = request.method;
  const reply = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const loaded = await read(env, uid, existing);
  const { data, revision } = loaded;
  if (method === "GET") {
    if (path === "/notes") return reply(page(data.notes, url.searchParams, revision));
    if (path === "/entries") return reply(page(data.entries, url.searchParams, revision));
    if (path === "/timer") return reply({ current: data.entries.find(e => !e.stopAt && !e.archived) ?? null, revision });
    if (path === "/preferences") return reply({ preferences: data.preferences, revision });
    if (path === "/totals") return reply({ totals: quests.map(q => ({ questId: q.id, ...timeTotals(q, data.entries, data.preferences.timeSource) })), revision });
    if (path === "/export") return reply({ format: "guilduo-productivity", schemaVersion: 1, revision, notes: data.notes, entries: data.entries, preferences: data.preferences });
    const receipt = path.match(/^\/operations\/([a-zA-Z0-9_-]{1,120})$/);
    if (receipt) return reply({ result: Object.hasOwn(data.receipts, receipt[1]!) ? data.receipts[receipt[1]!]!.result : null });
  }
  const match = path.match(/^\/(notes|entries)\/([a-zA-Z0-9_-]{1,120})$/);
  const result = await mutate(env, uid, existing, `${method}:${path}`, input, (current, currentRevision) => {
    if (path === "/notes" && method === "POST") {
      fields(input, ["operationId", "title", "body", "questId"]); const record = note(input, quests); current.notes.push(record); return { note: record };
    }
    if (path === "/entries" && method === "POST") {
      fields(input, ["operationId", "questId", "note", "startAt", "stopAt"]); const record = entry(input, quests); current.entries.push(record); return { entry: record };
    }
    if (match && method === "PATCH") {
      const records = match[1] === "notes" ? current.notes : current.entries;
      const index = records.findIndex(r => r.id === match[2]);
      if (index < 0) return fail("record_not_found", "Record not found.", 404);
      const previous = records[index]!; version(input, previous);
      if (match[1] === "entries" && !(previous as TimeEntry).stopAt) return fail("timer_running", "Stop this timer before editing.", 409);
      fields(input, ["operationId", "expectedUpdatedAt", ...(match[1] === "notes" ? ["title", "body", "questId", "archived"] : ["questId", "note", "startAt", "stopAt", "archived"])]);
      const record = match[1] === "notes" ? note({ ...previous, ...input }, quests, previous as NoteRecord) : entry({ ...previous, ...input }, quests, previous as TimeEntry);
      if (match[1] === "notes") current.notes[index] = record as NoteRecord; else current.entries[index] = record as TimeEntry;
      return match[1] === "notes" ? { note: record } : { entry: record };
    }
    if (["/timer/start", "/timer/stop"].includes(path) && method === "POST") {
      fields(input, ["operationId", "questId", "expectedEntryId", "expectedUpdatedAt", "note"]);
      const running = current.entries.find(e => !e.stopAt && !e.archived);
      if (input.expectedEntryId !== (running?.id ?? "")) return fail("productivity_conflict", "Current timer changed.", 409);
      if (running) version(input, running);
      const at = stamp(running && running.startAt > running.updatedAt ? running.startAt : running?.updatedAt);
      if (running) { running.stopAt = at; running.updatedAt = at; }
      if (path === "/timer/stop") { if (!running) return fail("timer_not_running", "No timer is running.", 409); return { current: null, entry: { ...running } }; }
      const id = questId(input.questId, quests); const quest = quests.find(q => q.id === id)!;
      if (quest.lifecycleState !== "active" || quest.kind === "reward") return fail("quest_not_active", "Choose an active work Quest.", 409);
      const started: TimeEntry = { id: crypto.randomUUID(), questId: id, note: text(input.note ?? "", "note", 1000), startAt: at, stopAt: "", archived: false, updatedAt: at };
      current.entries.push(started); return { current: started };
    }
    if (path === "/preferences" && method === "PUT") {
      fields(input, ["operationId", "expectedUpdatedAt", "timeSource", "timezone"]); version(input, current.preferences);
      current.preferences = { timeSource: source(input.timeSource), timezone: timezone(input.timezone), updatedAt: stamp(current.preferences.updatedAt) }; return { preferences: current.preferences };
    }
    if (path === "/import" && method === "POST") {
      fields(input, ["operationId", "expectedRevision", "backup"]);
      if (input.expectedRevision !== currentRevision) return fail("productivity_conflict", "Workspace changed before restore.", 409);
      if (current.entries.some(e => !e.stopAt)) return fail("timer_running", "Stop the timer before restoring.", 409);
      const backup = input.backup as JsonRecord | undefined;
      if (!backup || backup.format !== "guilduo-productivity" || backup.schemaVersion !== 1 || !Array.isArray(backup.notes) || !Array.isArray(backup.entries)) return fail("invalid_productivity_input", "Invalid productivity backup. Legacy Quest backups use their existing import.");
      const ids = new Set<string>();
      const previousNotes = new Map(current.notes.map(n => [n.id, n]));
      const previousEntries = new Map(current.entries.map(e => [e.id, e]));
      current.notes = backup.notes.map(raw => { if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("invalid_productivity_input", "Invalid note."); const item = raw as JsonRecord; boolean(item.archived); const id = text(item.id, "id", 120, true); if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) return fail("invalid_productivity_input", "Duplicate or invalid ID."); ids.add(id); return { ...note(item, quests, previousNotes.get(id)), id }; });
      ids.clear();
      current.entries = backup.entries.map(raw => { if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("invalid_productivity_input", "Invalid entry."); const item = raw as JsonRecord; boolean(item.archived); const id = text(item.id, "id", 120, true); if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) return fail("invalid_productivity_input", "Duplicate or invalid ID."); ids.add(id); return { ...entry(item, quests, previousEntries.get(id), true), id }; });
      if (current.entries.filter(e => !e.stopAt).length > 1) return fail("invalid_productivity_input", "A backup may contain only one running timer.");
      const preferences = backup.preferences as JsonRecord;
      current.preferences = { timeSource: source(preferences?.timeSource), timezone: preferences?.timezone === "" ? "" : timezone(preferences?.timezone), updatedAt: stamp(current.preferences.updatedAt) };
      return { restored: true };
    }
    if (path === "" && method === "DELETE") {
      fields(input, ["operationId", "expectedRevision", "confirm"]);
      if (input.confirm !== "delete-productivity" || input.expectedRevision !== currentRevision) return fail("productivity_conflict", "Confirm deletion against the current workspace revision.", 409);
      if (current.entries.some(e => !e.stopAt)) return fail("timer_running", "Stop the timer before deletion.", 409);
      current.notes = []; current.entries = []; current.preferences = initial(existing).preferences;
      // Keep only receipt tombstones so delayed pre-deletion writes cannot recreate private content.
      current.receipts = Object.fromEntries(Object.keys(current.receipts).map(id => [id, { fingerprint: "deleted", result: null }])); return { deleted: true };
    }
    return fail("not_found", "Route not found.", 404);
  });
  return reply(result);
}
