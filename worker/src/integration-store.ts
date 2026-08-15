import { randomToken } from "./security.ts";
import type { D1StatementLike, JsonRecord, WorkerEnv, WorkerError } from "./worker-types.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
type RawRow = JsonRecord;
type StoredRow = RawRow & { uid: string; service?: string; entry_id?: string; quest_id?: string };

export interface IntegrationAccount {
  uid: string;
  service: string;
  status: string;
  tokenExpiresAt: number;
  providerAccountId: string;
  providerAccountName: string;
  settings: JsonRecord;
  cursor: JsonRecord;
  lastSyncedAt: string;
  lastError: string;
  lockUntil: number;
  createdAt: string;
  updatedAt: string;
  accessToken?: string;
  refreshToken?: string;
}

export type IntegrationAccountPatch = Partial<Pick<IntegrationAccount, "status" | "accessToken" | "refreshToken" | "tokenExpiresAt" | "providerAccountId" | "providerAccountName" | "settings" | "cursor" | "lastSyncedAt" | "lastError" | "lockUntil">>;

export interface CalendarEvent {
  externalId: string;
  calendarId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  calendarName: string;
  htmlUrl: string;
  status: string;
  payload?: JsonRecord;
}

export interface FocusAttribution {
  uid: string;
  entryId: string;
  questId: string;
  focusTaskId: string;
  durationMinutes: number;
  source: string;
  status: string;
  entryUpdatedAt: string;
  entryStartAt: string;
  entryStopAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FocusAttributionInput {
  entryId?: string;
  questId?: string;
  focusTaskId?: string;
  durationMinutes?: number;
  source?: string;
  entryUpdatedAt?: string;
  entryStartAt?: string;
  entryStopAt?: string;
}

export interface FocusTaskLink {
  uid: string;
  questId: string;
  focusTaskId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FocusTaskLinkInput {
  questId?: string;
  focusTaskId?: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
}

export interface IntegrationLog {
  id: string;
  uid: string;
  service: string;
  direction: string;
  status: string;
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  message: string;
  createdAt: string;
}

type CryptoSubtleCompat = {
  digest(algorithm: string, data: unknown): Promise<ArrayBuffer>;
  importKey(format: string, keyData: unknown, algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<unknown>;
  encrypt(algorithm: unknown, key: unknown, data: unknown): Promise<ArrayBuffer>;
  decrypt(algorithm: unknown, key: unknown, data: unknown): Promise<ArrayBuffer>;
};
const subtle = crypto.subtle as unknown as CryptoSubtleCompat;

const memoryAccounts = new Map<string, StoredRow>();
const memoryEvents = new Map<string, StoredRow>();
const memoryLogs: IntegrationLog[] = [];
const memoryFocusAttributions = new Map<string, StoredRow>();
const memoryFocusTaskLinks = new Map<string, StoredRow>();

function accountKey(uid: string, service: string): string {
  return `${uid}:${service}`;
}

function focusAttributionKey(uid: string, entryId: string): string {
  return `${uid}:toggl-focus:${entryId}`;
}

function focusTaskLinkKey(uid: string, questId: string): string {
  return `${uid}:toggl-focus-task:${questId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(value: unknown): Uint8Array {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(env: WorkerEnv): Promise<unknown> {
  const configured = String(env.INTEGRATION_TOKEN_KEY || "");
  let raw: Uint8Array;
  if (configured) raw = decodeBase64(configured);
  else if (env.DEV_BEARER_TOKEN) raw = new Uint8Array(await subtle.digest("SHA-256", encoder.encode(env.DEV_BEARER_TOKEN)));
  else throw Object.assign(new Error("Integration token encryption is not configured."), { status: 503, code: "integration_vault_unavailable" }) as WorkerError;
  if (raw.byteLength !== 32) throw Object.assign(new Error("INTEGRATION_TOKEN_KEY must decode to 32 bytes."), { status: 503, code: "integration_vault_invalid" }) as WorkerError;
  return subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(env: WorkerEnv, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encoder.encode(value)));
  return `v1.${encodeBase64(iv)}.${encodeBase64(encrypted)}`;
}

export async function decryptSecret(env: WorkerEnv, value: unknown): Promise<string> {
  if (!value) return "";
  const [version, ivValue, encryptedValue] = String(value).split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw Object.assign(new Error("Stored integration token is invalid."), { status: 500, code: "integration_token_invalid" }) as WorkerError;
  const decrypted = await subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(ivValue) }, await encryptionKey(env), decodeBase64(encryptedValue));
  return decoder.decode(decrypted);
}

function asRecord(value: unknown): RawRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRow : {};
}

function parseJson(value: unknown, fallback: JsonRecord = {}): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  try {
    const parsed = value ? JSON.parse(String(value)) as unknown : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : fallback;
  } catch { return fallback; }
}

function text(row: RawRow, ...keys: string[]): string {
  for (const key of keys) if (typeof row[key] === "string") return row[key] as string;
  return "";
}

function number(row: RawRow, ...keys: string[]): number {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return Number(row[key]);
  return 0;
}

function normalizeAccount(row: unknown): IntegrationAccount | null {
  const item = asRecord(row);
  if (!text(item, "uid") || !text(item, "service")) return null;
  return {
    uid: text(item, "uid"),
    service: text(item, "service"),
    status: text(item, "status") || "not_connected",
    tokenExpiresAt: number(item, "token_expires_at", "tokenExpiresAt"),
    providerAccountId: text(item, "provider_account_id", "providerAccountId"),
    providerAccountName: text(item, "provider_account_name", "providerAccountName"),
    settings: parseJson(item.settings_json, parseJson(item.settings)),
    cursor: parseJson(item.cursor_json, parseJson(item.cursor)),
    lastSyncedAt: text(item, "last_synced_at", "lastSyncedAt"),
    lastError: text(item, "last_error", "lastError"),
    lockUntil: number(item, "lock_until", "lockUntil"),
    createdAt: text(item, "created_at", "createdAt"),
    updatedAt: text(item, "updated_at", "updatedAt"),
  };
}

export async function getIntegrationAccount(env: WorkerEnv, uid: string, service: string, { includeTokens = false }: { includeTokens?: boolean } = {}): Promise<IntegrationAccount | null> {
  let row: unknown;
  if (env.QUESTFORGE_DB) {
    row = await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE uid = ? AND service = ?").bind(uid, service).first();
  } else row = memoryAccounts.get(accountKey(uid, service));
  const account = normalizeAccount(row);
  if (!account || !includeTokens) return account;
  const raw = asRecord(row);
  return {
    ...account,
    accessToken: await decryptSecret(env, raw.access_token || raw.accessToken),
    refreshToken: await decryptSecret(env, raw.refresh_token || raw.refreshToken),
  };
}

export async function listIntegrationAccounts(env: WorkerEnv, uid: string): Promise<IntegrationAccount[]> {
  let rows: unknown[];
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE uid = ? ORDER BY service").bind(uid).all<RawRow>()).results || [];
  } else rows = [...memoryAccounts.values()].filter((row) => row.uid === uid);
  return rows.map(normalizeAccount).filter((account): account is IntegrationAccount => Boolean(account));
}

export async function saveIntegrationAccount(env: WorkerEnv, uid: string, service: string, patch: IntegrationAccountPatch): Promise<IntegrationAccount | null> {
  const previousRaw: unknown = env.QUESTFORGE_DB
    ? await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE uid = ? AND service = ?").bind(uid, service).first()
    : memoryAccounts.get(accountKey(uid, service));
  const previous = normalizeAccount(previousRaw) || null;
  const raw = asRecord(previousRaw);
  const createdAt = previous?.createdAt || nowIso();
  const updatedAt = nowIso();
  const row: StoredRow = {
    uid,
    service,
    status: patch.status || previous?.status || "connected",
    access_token: patch.accessToken !== undefined ? await encryptSecret(env, patch.accessToken) : raw.access_token || raw.accessToken || null,
    refresh_token: patch.refreshToken !== undefined ? await encryptSecret(env, patch.refreshToken) : raw.refresh_token || raw.refreshToken || null,
    token_expires_at: patch.tokenExpiresAt ?? previous?.tokenExpiresAt ?? 0,
    provider_account_id: patch.providerAccountId ?? previous?.providerAccountId ?? "",
    provider_account_name: patch.providerAccountName ?? previous?.providerAccountName ?? "",
    settings_json: JSON.stringify(patch.settings ?? previous?.settings ?? {}),
    cursor_json: JSON.stringify(patch.cursor ?? previous?.cursor ?? {}),
    last_synced_at: patch.lastSyncedAt ?? previous?.lastSyncedAt ?? "",
    last_error: patch.lastError ?? previous?.lastError ?? "",
    lock_until: patch.lockUntil ?? previous?.lockUntil ?? 0,
    created_at: createdAt,
    updated_at: updatedAt,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO integration_accounts
      (uid, service, status, access_token, refresh_token, token_expires_at, provider_account_id, provider_account_name, settings_json, cursor_json, last_synced_at, last_error, lock_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, service) DO UPDATE SET status=excluded.status, access_token=excluded.access_token, refresh_token=excluded.refresh_token,
      token_expires_at=excluded.token_expires_at, provider_account_id=excluded.provider_account_id, provider_account_name=excluded.provider_account_name,
      settings_json=excluded.settings_json, cursor_json=excluded.cursor_json, last_synced_at=excluded.last_synced_at,
      last_error=excluded.last_error, lock_until=excluded.lock_until, updated_at=excluded.updated_at`)
      .bind(uid, service, row.status, row.access_token, row.refresh_token, row.token_expires_at, row.provider_account_id, row.provider_account_name,
        row.settings_json, row.cursor_json, row.last_synced_at, row.last_error, row.lock_until, row.created_at, row.updated_at).run();
  } else memoryAccounts.set(accountKey(uid, service), row);
  return normalizeAccount(row);
}

export async function deleteIntegrationAccount(env: WorkerEnv, uid: string, service: string): Promise<void> {
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.batch([
      env.QUESTFORGE_DB.prepare("DELETE FROM integration_accounts WHERE uid = ? AND service = ?").bind(uid, service),
      env.QUESTFORGE_DB.prepare("DELETE FROM integration_calendar_events WHERE uid = ? AND service = ?").bind(uid, service),
    ]);
  } else {
    memoryAccounts.delete(accountKey(uid, service));
    for (const key of memoryEvents.keys()) if (key.startsWith(`${uid}:${service}:`)) memoryEvents.delete(key);
  }
}

export async function acquireIntegrationLock(env: WorkerEnv, uid: string, service: string, ttlSeconds = 120): Promise<boolean> {
  const now = Date.now();
  const account = await getIntegrationAccount(env, uid, service);
  if (!account || account.lockUntil > now) return false;
  if (env.QUESTFORGE_DB) {
    const result = await env.QUESTFORGE_DB.prepare("UPDATE integration_accounts SET lock_until = ? WHERE uid = ? AND service = ? AND lock_until < ?")
      .bind(now + ttlSeconds * 1000, uid, service, now).run();
    return Number(result.meta?.changes || 0) === 1;
  }
  await saveIntegrationAccount(env, uid, service, { lockUntil: now + ttlSeconds * 1000 });
  return true;
}

export async function releaseIntegrationLock(env: WorkerEnv, uid: string, service: string): Promise<void> {
  if (await getIntegrationAccount(env, uid, service)) await saveIntegrationAccount(env, uid, service, { lockUntil: 0 });
}

export async function listDueIntegrationAccounts(env: WorkerEnv, limit = 20): Promise<IntegrationAccount[]> {
  if (env.QUESTFORGE_DB) {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE status = 'connected' AND json_extract(settings_json, '$.autoSync') = 1 AND (last_synced_at = '' OR last_synced_at < ?) ORDER BY last_synced_at LIMIT ?")
      .bind(cutoff, limit).all<RawRow>()).results || [];
    return rows.map(normalizeAccount).filter((account): account is IntegrationAccount => Boolean(account));
  }
  return [...memoryAccounts.values()].map(normalizeAccount).filter((account): account is IntegrationAccount => Boolean(account && account.status === "connected" && account.settings.autoSync)).slice(0, limit);
}

export async function replaceCalendarEvents(env: WorkerEnv, uid: string, service: string, calendarId: string, events: CalendarEvent[]): Promise<void> {
  const updatedAt = nowIso();
  if (env.QUESTFORGE_DB) {
    const statements: D1StatementLike[] = [env.QUESTFORGE_DB.prepare("DELETE FROM integration_calendar_events WHERE uid = ? AND service = ? AND calendar_id = ?").bind(uid, service, calendarId)];
    events.forEach((event) => statements.push(env.QUESTFORGE_DB?.prepare(`INSERT INTO integration_calendar_events
      (uid, service, external_id, calendar_id, title, description, start_at, end_at, all_day, calendar_name, html_url, status, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid, service, event.externalId, calendarId, event.title, event.description || "", event.startAt, event.endAt,
        event.allDay ? 1 : 0, event.calendarName || "", event.htmlUrl || "", event.status || "confirmed", JSON.stringify(event.payload || {}), updatedAt) as D1StatementLike));
    await env.QUESTFORGE_DB.batch(statements);
  } else {
    for (const key of memoryEvents.keys()) if (key.startsWith(`${uid}:${service}:`) && memoryEvents.get(key)?.calendarId === calendarId) memoryEvents.delete(key);
    events.forEach((event) => memoryEvents.set(`${uid}:${service}:${event.externalId}`, { ...event, uid, service, calendarId, updatedAt }));
  }
}

export async function listCalendarEvents(env: WorkerEnv, uid: string, from: string, to: string): Promise<CalendarEvent[]> {
  let rows: RawRow[];
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_calendar_events WHERE uid = ? AND end_at >= ? AND start_at <= ? ORDER BY start_at")
      .bind(uid, from, to).all<RawRow>()).results || [];
  } else rows = [...memoryEvents.values()].filter((event) => event.uid === uid && text(event, "endAt", "end_at") >= from && text(event, "startAt", "start_at") <= to).sort((a, b) => text(a, "startAt", "start_at").localeCompare(text(b, "startAt", "start_at")));
  return rows.map((row) => ({
    externalId: text(row, "external_id", "externalId"),
    calendarId: text(row, "calendar_id", "calendarId"),
    title: text(row, "title"),
    description: text(row, "description"),
    startAt: text(row, "start_at", "startAt"),
    endAt: text(row, "end_at", "endAt"),
    allDay: Boolean(row.all_day ?? row.allDay),
    calendarName: text(row, "calendar_name", "calendarName"),
    htmlUrl: text(row, "html_url", "htmlUrl"),
    status: text(row, "status") || "confirmed",
  }));
}

function normalizeFocusAttribution(row: unknown): FocusAttribution | null {
  const item = asRecord(row);
  if (!text(item, "uid")) return null;
  return {
    uid: text(item, "uid"),
    entryId: text(item, "entry_id", "entryId"),
    questId: text(item, "quest_id", "questId"),
    focusTaskId: text(item, "focus_task_id", "focusTaskId"),
    durationMinutes: number(item, "duration_minutes", "durationMinutes"),
    source: text(item, "source") || "direct",
    status: text(item, "status") || "confirmed",
    entryUpdatedAt: text(item, "entry_updated_at", "entryUpdatedAt"),
    entryStartAt: text(item, "entry_start_at", "entryStartAt"),
    entryStopAt: text(item, "entry_stop_at", "entryStopAt"),
    createdAt: text(item, "created_at", "createdAt"),
    updatedAt: text(item, "updated_at", "updatedAt"),
  };
}

export async function getTogglFocusAttribution(env: WorkerEnv, uid: string, entryId: string): Promise<FocusAttribution | null> {
  let row: unknown;
  if (env.QUESTFORGE_DB) row = await env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_attributions WHERE uid = ? AND entry_id = ?").bind(uid, String(entryId)).first();
  else row = memoryFocusAttributions.get(focusAttributionKey(uid, entryId));
  return normalizeFocusAttribution(row);
}

export async function listTogglFocusAttributions(env: WorkerEnv, uid: string, { questId = "" }: { questId?: string } = {}): Promise<FocusAttribution[]> {
  let rows: RawRow[];
  if (env.QUESTFORGE_DB) {
    const query = questId
      ? env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_attributions WHERE uid = ? AND quest_id = ? ORDER BY entry_start_at DESC").bind(uid, String(questId))
      : env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_attributions WHERE uid = ? ORDER BY entry_start_at DESC").bind(uid);
    rows = (await query.all<RawRow>()).results || [];
  } else rows = [...memoryFocusAttributions.values()].filter((row) => row.uid === uid && (!questId || row.quest_id === String(questId)));
  return rows.map(normalizeFocusAttribution).filter((item): item is FocusAttribution => Boolean(item));
}

export async function saveTogglFocusAttribution(env: WorkerEnv, uid: string, value: FocusAttributionInput): Promise<FocusAttribution | null> {
  const entryId = String(value.entryId || "").trim();
  const questId = String(value.questId || "").trim();
  if (!entryId || !questId) throw Object.assign(new Error("Focus time entry and Quest are required."), { status: 400, code: "invalid_focus_attribution" }) as WorkerError;
  const previous = await getTogglFocusAttribution(env, uid, entryId);
  if (previous && previous.questId !== questId) throw Object.assign(new Error("This Focus time entry is already attributed to another Quest."), { status: 409, code: "time_entry_already_attributed", details: { entryId, questId: previous.questId } }) as WorkerError;
  const now = nowIso();
  const row: StoredRow = {
    uid,
    entry_id: entryId,
    quest_id: questId,
    focus_task_id: String(value.focusTaskId || ""),
    duration_minutes: Math.max(0, Math.round(Number(value.durationMinutes || 0))),
    source: String(value.source || "direct").slice(0, 40),
    status: "confirmed",
    entry_updated_at: String(value.entryUpdatedAt || ""),
    entry_start_at: String(value.entryStartAt || ""),
    entry_stop_at: String(value.entryStopAt || ""),
    created_at: previous?.createdAt || now,
    updated_at: now,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO toggl_focus_attributions
      (uid, entry_id, quest_id, focus_task_id, duration_minutes, source, status, entry_updated_at, entry_start_at, entry_stop_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, entry_id) DO UPDATE SET quest_id=excluded.quest_id, focus_task_id=excluded.focus_task_id,
      duration_minutes=excluded.duration_minutes, source=excluded.source, status=excluded.status, entry_updated_at=excluded.entry_updated_at,
      entry_start_at=excluded.entry_start_at, entry_stop_at=excluded.entry_stop_at, updated_at=excluded.updated_at`)
      .bind(row.uid, row.entry_id, row.quest_id, row.focus_task_id, row.duration_minutes, row.source, row.status, row.entry_updated_at, row.entry_start_at, row.entry_stop_at, row.created_at, row.updated_at).run();
  } else memoryFocusAttributions.set(focusAttributionKey(uid, entryId), row);
  return normalizeFocusAttribution(row);
}

export async function purgeTogglFocusAttributions(env: WorkerEnv, uid: string): Promise<void> {
  if (env.QUESTFORGE_DB) await env.QUESTFORGE_DB.prepare("DELETE FROM toggl_focus_attributions WHERE uid = ?").bind(uid).run();
  else for (const key of memoryFocusAttributions.keys()) if (key.startsWith(`${uid}:toggl-focus:`)) memoryFocusAttributions.delete(key);
}

export async function deleteTogglFocusAttribution(env: WorkerEnv, uid: string, entryId: string): Promise<void> {
  if (env.QUESTFORGE_DB) await env.QUESTFORGE_DB.prepare("DELETE FROM toggl_focus_attributions WHERE uid = ? AND entry_id = ?").bind(uid, String(entryId)).run();
  else memoryFocusAttributions.delete(focusAttributionKey(uid, entryId));
}

function normalizeFocusTaskLink(row: unknown): FocusTaskLink | null {
  const item = asRecord(row);
  if (!text(item, "uid")) return null;
  return {
    uid: text(item, "uid"),
    questId: text(item, "quest_id", "questId"),
    focusTaskId: text(item, "focus_task_id", "focusTaskId"),
    organizationId: text(item, "organization_id", "organizationId"),
    workspaceId: text(item, "workspace_id", "workspaceId"),
    projectId: text(item, "project_id", "projectId"),
    createdAt: text(item, "created_at", "createdAt"),
    updatedAt: text(item, "updated_at", "updatedAt"),
  };
}

export async function getTogglFocusTaskLink(env: WorkerEnv, uid: string, questId: string): Promise<FocusTaskLink | null> {
  let row: unknown;
  if (env.QUESTFORGE_DB) row = await env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_task_links WHERE uid = ? AND quest_id = ?").bind(uid, String(questId)).first();
  else row = memoryFocusTaskLinks.get(focusTaskLinkKey(uid, questId));
  return normalizeFocusTaskLink(row);
}

export async function listTogglFocusTaskLinks(env: WorkerEnv, uid: string): Promise<FocusTaskLink[]> {
  let rows: RawRow[];
  if (env.QUESTFORGE_DB) rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_task_links WHERE uid = ? ORDER BY updated_at DESC").bind(uid).all<RawRow>()).results || [];
  else rows = [...memoryFocusTaskLinks.values()].filter((row) => row.uid === uid);
  return rows.map(normalizeFocusTaskLink).filter((item): item is FocusTaskLink => Boolean(item));
}

export async function saveTogglFocusTaskLink(env: WorkerEnv, uid: string, value: FocusTaskLinkInput): Promise<FocusTaskLink | null> {
  const questId = String(value.questId || "").trim();
  const focusTaskId = String(value.focusTaskId || "").trim();
  if (!questId || !focusTaskId) throw Object.assign(new Error("Focus task and Quest are required."), { status: 400, code: "invalid_focus_task_link" }) as WorkerError;
  const previous = await getTogglFocusTaskLink(env, uid, questId);
  const now = nowIso();
  const row: StoredRow = {
    uid,
    quest_id: questId,
    focus_task_id: focusTaskId,
    organization_id: String(value.organizationId || ""),
    workspace_id: String(value.workspaceId || ""),
    project_id: String(value.projectId || ""),
    created_at: previous?.createdAt || now,
    updated_at: now,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO toggl_focus_task_links
      (uid, quest_id, focus_task_id, organization_id, workspace_id, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, quest_id) DO UPDATE SET focus_task_id=excluded.focus_task_id, organization_id=excluded.organization_id,
      workspace_id=excluded.workspace_id, project_id=excluded.project_id, updated_at=excluded.updated_at`)
      .bind(row.uid, row.quest_id, row.focus_task_id, row.organization_id, row.workspace_id, row.project_id, row.created_at, row.updated_at).run();
  } else memoryFocusTaskLinks.set(focusTaskLinkKey(uid, questId), row);
  return normalizeFocusTaskLink(row);
}

export async function purgeTogglFocusTaskLinks(env: WorkerEnv, uid: string): Promise<void> {
  if (env.QUESTFORGE_DB) await env.QUESTFORGE_DB.prepare("DELETE FROM toggl_focus_task_links WHERE uid = ?").bind(uid).run();
  else for (const key of memoryFocusTaskLinks.keys()) if (key.startsWith(`${uid}:toggl-focus-task:`)) memoryFocusTaskLinks.delete(key);
}

export async function addIntegrationLog(env: WorkerEnv, uid: string, service: string, value: Partial<IntegrationLog>): Promise<IntegrationLog> {
  const log: IntegrationLog = { id: randomToken("sync"), uid, service, direction: value.direction || "import", status: value.status || "success", dryRun: Boolean(value.dryRun), created: value.created || 0, updated: value.updated || 0, skipped: value.skipped || 0, conflicts: value.conflicts || 0, message: value.message || "", createdAt: nowIso() };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO integration_sync_logs
      (id, uid, service, direction, status, dry_run, created_count, updated_count, skipped_count, conflict_count, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(log.id, uid, service, log.direction, log.status, log.dryRun ? 1 : 0, log.created, log.updated, log.skipped, log.conflicts, log.message, log.createdAt).run();
  } else memoryLogs.unshift(log);
  return log;
}
