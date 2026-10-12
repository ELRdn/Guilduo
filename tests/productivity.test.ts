import test from "node:test";
import assert from "node:assert/strict";
import { productivityRoute } from "../worker/src/productivity.ts";
import { calendarItems, clockTime, snapTimeRange, wallClockInstant, splitEntryDays, timeTotals, type NoteRecord, type TimeEntry } from "../shared/productivity.ts";
import { createQuest, migrateState } from "../server/questforge-domain.ts";
import { SqliteD1Database } from "./test-helpers.ts";
import type { QuestForgeState } from "../types/questforge.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { productivityTranslations } from "../interaction-lab/relay-forge/productivity-copy.ts";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import worker from "../worker/src/index.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { getOAuthRecordStore } from "../worker/src/oauth-record-store.ts";
import { sha256 } from "../worker/src/security.ts";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

function setup() {
  const db = new SqliteD1Database(), env: WorkerEnv = { QUESTFORGE_DB: db };
  const state = migrateState({ schemaVersion: 7, tasks: [] } as unknown as QuestForgeState);
  const quest = createQuest(state, { title: "Work", kind: "todo", scheduledDate: "2026-10-12", dueDate: "2026-10-15", planningMode: "until_due" });
  const other = createQuest(state, { title: "Other", kind: "daily" });
  const call = async <T = Record<string, unknown>>(path: string, input?: Record<string, unknown>, method = input ? "POST" : "GET", uid = "owner", existing = true): Promise<T> => {
    const response = await productivityRoute(new Request(`http://test/v1/productivity${path}`, { method }), env, uid, state.tasks, existing, input);
    assert.equal(response.headers.get("cache-control"), "no-store"); return response.json() as Promise<T>;
  };
  return { db, env, state, quest, other, call };
}

test("calendar selection snaps reverse drags and day bounds, preserving real DST instants", () => {
  assert.deepEqual(snapTimeRange(617, 550), { from: 540, to: 630 });
  assert.deepEqual(snapTimeRange(-20, 0), { from: 0, to: 15 });
  assert.deepEqual(snapTimeRange(1440, 1460), { from: 1425, to: 1440 });
  assert.equal(wallClockInstant("2026-10-12", 600, "Asia/Tokyo"), "2026-10-12T01:00:00.000Z");
  assert.equal(wallClockInstant("2026-10-12", 1440, "Asia/Tokyo"), "2026-10-12T15:00:00.000Z");
  assert.throws(() => wallClockInstant("2026-03-08", 150, "America/New_York"), RangeError);
  assert.equal(wallClockInstant("2026-11-01", 90, "America/New_York"), "2026-11-01T05:30:00.000Z");
  assert.equal(wallClockInstant("2026-10-12", 600, "Asia/Kathmandu"), "2026-10-12T04:15:00.000Z");
});

test("touch selection waits for a hold, leaves ordinary scrolling alone and cleans up on disposal", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  class Axis extends EventTarget {
    style: Record<string, string> = {}; textContent = ""; isConnected = false; tabIndex = -1; child: Axis | null = null;
    setAttribute() {} closest() { return null; } focus() {} hasPointerCapture() { return false; } releasePointerCapture() {}
    getBoundingClientRect() { return { top: 0, height: 1440 }; }
    append(child: Axis) { this.child = child; child.isConnected = true; } remove() { this.isConnected = false; }
  }
  // Match the entry test's VM harness: run actual browser logic without adding DOM libraries to Node.
  const script = stripTypeScriptTypes(readFileSync(new URL("../interaction-lab/relay-forge/screens/calendar-selection.ts", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "").replace("export function", "function") + "\ncalendarSelection;";
  const calendarSelection = runInNewContext(script, { el: () => new Axis(), snapTimeRange, clockTime, Element: Axis, window: { setTimeout, clearTimeout } }) as (axis: Axis, options: { label: string; busy: (active: boolean) => void; select: (from: number, to: number) => void }) => () => void;
  const axis = new Axis(), selected: [number, number][] = []; let busy = false;
  const dispose = calendarSelection(axis, { label: "Time", busy: active => { busy = active; }, select: (from, to) => selected.push([from, to]) });
  const touch = (type: string, y?: number) => { const event = Object.assign(new Event(type, { cancelable: true }), { touches: y === undefined ? [] : [{ clientY: y }] }); axis.dispatchEvent(event); return event; };
  try {
    touch("touchstart", 540); t.mock.timers.tick(399); assert.ok(busy); assert.ok(!axis.child?.isConnected);
    assert.equal(touch("touchmove", 570).defaultPrevented, false); t.mock.timers.tick(100); assert.equal(busy, false); assert.ok(!axis.child?.isConnected); touch("touchend"); assert.equal(selected.length, 0);
    touch("touchstart", 540); t.mock.timers.tick(400); assert.ok(axis.child?.isConnected);
    assert.equal(touch("touchmove", 600).defaultPrevented, true); touch("touchend"); assert.deepEqual(selected, [[540, 600]]); assert.equal(busy, false);
    touch("touchstart", 700); dispose(); t.mock.timers.tick(500); assert.ok(!axis.child?.isConnected); assert.equal(busy, false);
    touch("touchstart", 700); t.mock.timers.tick(500); assert.equal(selected.length, 1);
  } finally {
    dispose();
  }
});

test("native timer CAS serializes concurrent starts and idempotent operations on real SQLite", async () => {
  const { db, state, quest, other, call } = setup();
  try {
    const before = JSON.stringify(state);
    const attempts = await Promise.allSettled([call("/timer/start", { operationId: "startA", questId: quest.id, expectedEntryId: "" }), call("/timer/start", { operationId: "startB", questId: other.id, expectedEntryId: "" })]);
    assert.equal(attempts.filter(a => a.status === "fulfilled").length, 1);
    const current = (await call<{ current: TimeEntry }>("/timer")).current;
    const stop = { operationId: "stopA", expectedEntryId: current.id, expectedUpdatedAt: current.updatedAt };
    const [first, duplicate] = await Promise.all([call("/timer/stop", stop), call("/timer/stop", stop)]);
    assert.deepEqual(first, duplicate);
    assert.equal((await call<{ items: TimeEntry[] }>("/entries")).items.length, 1);
    await assert.rejects(call("/timer/start", { operationId: "stopA", questId: quest.id, expectedEntryId: "" }), { code: "operation_conflict" });
    assert.equal(JSON.stringify(state), before, "timer must not score or change the Appwrite Quest");
    const started = (await call<{ current: TimeEntry }>("/timer/start", { operationId: "startC", questId: quest.id, expectedEntryId: "" })).current;
    await assert.rejects(call("/timer/stop", { operationId: "staleStop", expectedEntryId: current.id, expectedUpdatedAt: current.updatedAt }), { code: "productivity_conflict" });
    const switched = (await call<{ current: TimeEntry }>("/timer/start", { operationId: "switch", questId: other.id, expectedEntryId: started.id, expectedUpdatedAt: started.updatedAt })).current;
    assert.equal(switched.questId, other.id);
    assert.equal((await call<{ items: TimeEntry[] }>("/entries")).items.filter(e => !e.stopAt).length, 1);
    await assert.rejects(call("/import", { operationId: "restoreRunning", expectedRevision: 4, backup: {} }), { code: "timer_running" });
  } finally { db.close(); }
});

test("notes retain long text, reject stale/cross-owner writes, paginate with revisions, archive and restore", async () => {
  const { db, quest, call } = setup();
  try {
    const input = { operationId: "create", title: "Spec", body: "長文".repeat(5000), questId: quest.id };
    const note = (await call<{ note: NoteRecord }>("/notes", input)).note;
    assert.equal(note.body, input.body); assert.deepEqual((await call("/notes", input)), { note });
    await assert.rejects(call(`/notes/${note.id}`, { operationId: "wrongOwner", expectedUpdatedAt: note.updatedAt, title: "oops" }, "PATCH", "other"), { code: "record_not_found" });
    const archived = (await call<{ note: NoteRecord }>(`/notes/${note.id}`, { operationId: "archive", expectedUpdatedAt: note.updatedAt, archived: true }, "PATCH")).note;
    assert.equal((await call<{ items: NoteRecord[] }>("/notes")).items.length, 0);
    await assert.rejects(call(`/notes/${note.id}`, { operationId: "stale", expectedUpdatedAt: note.updatedAt, archived: false }, "PATCH"), { code: "productivity_conflict" });
    await call(`/notes/${note.id}`, { operationId: "restore", expectedUpdatedAt: archived.updatedAt, archived: false }, "PATCH");
    await call("/notes", { operationId: "second", title: "Another", body: "", questId: "" });
    const page = await call<{ items: NoteRecord[]; revision: number; nextCursor: string }>("/notes?limit=1");
    assert.equal(page.items.length, 1);
    assert.equal((await call<{ items: NoteRecord[] }>(`/notes?limit=1&revision=${page.revision}&cursor=${page.nextCursor}`)).items.length, 1);
    await call("/notes", { operationId: "third", title: "Third", body: "", questId: "" });
    await assert.rejects(call(`/notes?limit=1&revision=${page.revision}&cursor=${page.nextCursor}`), { code: "productivity_conflict" });
  } finally { db.close(); }
});

test("zero records, defaults, timezone, export/restore and confirmed deletion preserve compatibility", async () => {
  const { db, quest, call } = setup();
  try {
    assert.equal((await call<{ preferences: { timeSource: string } }>("/preferences")).preferences.timeSource, "toggl");
    assert.equal((await call<{ preferences: { timeSource: string } }>("/preferences", undefined, "GET", "new", false)).preferences.timeSource, "native");
    assert.equal((await call<{ preferences: { timeSource: string } }>("/preferences", undefined, "GET", "new", true)).preferences.timeSource, "native", "first-access preference remains stable after Quest creation");
    const result = await call<{ entry: TimeEntry }>("/entries", { operationId: "manual", questId: quest.id, note: "", startAt: "2026-01-01T00:00:00Z", stopAt: "2026-01-01T00:00:00Z" });
    assert.equal(timeTotals(quest, [result.entry], "native").selectedMinutes, 0);
    quest.manualActualMinutes = 10; quest.togglActualMinutes = 20; quest.actualMinutes = 20;
    assert.equal(timeTotals(quest, [result.entry], "native").selectedMinutes, 10);
    assert.equal(timeTotals(quest, [result.entry], "toggl").selectedMinutes, 20);
    assert.equal(timeTotals(quest, [result.entry], "separate").selectedMinutes, null);
    assert.equal(quest.actualMinutes, 20);
    quest.manualActualMinutes = 0;
    assert.equal(timeTotals(quest, [result.entry], "native").selectedMinutes, 0, "a present zero native entry overrides Toggl in native-first mode");
    assert.equal(timeTotals(quest, [], "native").selectedMinutes, 20, "absence falls back to Toggl");
    quest.togglActualMinutes = 0;
    assert.equal(timeTotals(quest, [], "native").selectedMinutes, null, "absence remains distinct from zero");
    await call("/preferences", { operationId: "prefs", expectedUpdatedAt: "", timeSource: "native", timezone: "America/New_York" }, "PUT");
    const backup = await call<{ revision: number }>("/export");
    await assert.rejects(call("", { operationId: "deleteWithoutConfirm", expectedRevision: backup.revision }, "DELETE"), { code: "productivity_conflict" });
    await call("", { operationId: "delete", expectedRevision: backup.revision, confirm: "delete-productivity" }, "DELETE");
    assert.equal((await call<{ items: TimeEntry[] }>("/entries")).items.length, 0);
    const empty = await call<{ revision: number }>("/export");
    await assert.rejects(call("/import", { operationId: "staleImport", expectedRevision: backup.revision, backup }), { code: "productivity_conflict" });
    await call("/import", { operationId: "import", expectedRevision: empty.revision, backup });
    assert.equal((await call<{ items: TimeEntry[] }>("/entries")).items.length, 1);
    await assert.rejects(call("/preferences", { operationId: "badTZ", expectedUpdatedAt: "", timeSource: "native", timezone: "bad" }, "PUT"), { code: "productivity_conflict" });
  } finally { db.close(); }
});

test("work days split correctly at DST midnights; recurrence projects without modifying Quests", () => {
  const { db, quest } = setup();
  try {
    const entry: TimeEntry = { id: "e", questId: quest.id, note: "", startAt: "2026-03-08T05:00:00Z", stopAt: "2026-03-09T04:00:00Z", archived: false, updatedAt: "" };
    assert.deepEqual(splitEntryDays(entry, "America/New_York"), { "2026-03-08": 23 * 60 });
    entry.startAt = "2026-11-01T04:00:00Z"; entry.stopAt = "2026-11-02T05:00:00Z";
    assert.deepEqual(splitEntryDays(entry, "America/New_York"), { "2026-11-01": 25 * 60 });
    entry.startAt = "2026-01-01T14:30:00Z"; entry.stopAt = "2026-01-01T15:30:00Z";
    assert.deepEqual(splitEntryDays(entry, "Asia/Tokyo"), { "2026-01-01": 30, "2026-01-02": 30 });
    const recurring = { ...quest, kind: "daily" as const, repeat: "weekdays" as const, scheduledDate: "2026-10-12", dueDate: "2026-10-12", scheduledTime: "10:00", estimatedMinutes: 0 };
    const before = JSON.stringify(recurring), events = calendarItems([recurring], [], "2026-10-12", "2026-10-18", "Asia/Tokyo");
    assert.equal(events.filter(e => e.kind === "schedule").length, 5);
    assert.ok(events.every(e => e.minutes === 0)); assert.equal(JSON.stringify(recurring), before);
    for (const locale of SUPPORTED_LOCALES) assert.ok(productivityTranslations[locale] && Object.values(productivityTranslations[locale]!).every(Boolean));
  } finally { db.close(); }
});

test("running backups restore at most one timer and deletion removes content without permitting late resurrection", async () => {
  const { db, call, quest } = setup();
  try {
    const input = { operationId: "privateCreate", title: "private-title", body: "private-body", questId: quest.id };
    await call("/notes", input);
    const started = (await call<{ current: TimeEntry }>("/timer/start", { operationId: "timer", questId: quest.id, expectedEntryId: "" })).current;
    const backup = await call<{ entries: TimeEntry[] }>("/export");
    await call("/timer/stop", { operationId: "stop", expectedEntryId: started.id, expectedUpdatedAt: started.updatedAt });
    let current = await call<{ revision: number }>("/export");
    await call("/import", { operationId: "restoreTimer", expectedRevision: current.revision, backup });
    const restored = (await call<{ current: TimeEntry }>("/timer")).current;
    assert.equal(restored.id, started.id); assert.ok(restored.updatedAt > started.updatedAt);
    await call("/timer/stop", { operationId: "stopRestored", expectedEntryId: restored.id, expectedUpdatedAt: restored.updatedAt });
    current = await call<{ revision: number }>("/export");
    const invalid = { ...backup, entries: [backup.entries[0], { ...backup.entries[0], id: "second-running" }] };
    await assert.rejects(call("/import", { operationId: "invalidRunning", expectedRevision: current.revision, backup: invalid }), { code: "invalid_productivity_input" });
    assert.equal((await call<{ revision: number }>("/export")).revision, current.revision);
    await call("", { operationId: "deleteAll", expectedRevision: current.revision, confirm: "delete-productivity" }, "DELETE");
    const stored = await db.prepare("SELECT value_json FROM productivity_workspaces WHERE uid='owner'").first<{ value_json: string }>();
    assert.ok(!stored!.value_json.includes("private-title") && !stored!.value_json.includes("private-body"));
    await assert.rejects(call("/notes", input), { code: "operation_conflict" });
    assert.equal((await call<{ items: NoteRecord[] }>("/notes")).items.length, 0);
  } finally { db.close(); }
});

test("productivity REST is private Human-only, validates inputs and fails closed without D1", async () => {
  const { db, env, state, quest } = setup();
  try {
    Object.assign(env, { DEV_BEARER_TOKEN: "human", DEV_USER_ID: "api-owner", ALLOWED_ORIGINS: "http://localhost:5173" });
    const previous = await readState(env, "api-owner"); await writeState(env, "api-owner", { state, schemaVersion: 7, clientUpdatedAt: "2026-01-01T00:00:00Z" }, previous.etag);
    const call = (path: string, input?: unknown, token = "human") => worker.fetch(new Request(`http://worker.test/v1/productivity${path}`, { method: input ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, origin: "http://localhost:5173", "content-type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) }), env, { waitUntil: () => {} });
    assert.equal((await call("/notes")).status, 200);
    const response = await call("/entries", { operationId: "zero", questId: quest.id, startAt: "2026-01-01T00:00:00Z", stopAt: "2026-01-01T00:00:00Z" });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await call("/notes", { operationId: "bad", title: "T", body: "", uid: "another" })).status, 400);
    assert.equal((await call("/entries", { operationId: "badDate", questId: quest.id, startAt: "bad", stopAt: "bad" })).status, 400);
    const store = getOAuthRecordStore(env); await store.put(`access:${await sha256("agent")}`, JSON.stringify({ uid: "api-owner", scopes: ["quests:read", "quests:write"], expiresAt: Date.now() + 60000 }));
    assert.equal((await call("/notes", undefined, "agent")).status, 403);
    env.QUESTFORGE_DB = undefined; assert.equal((await call("/timer")).status, 503);
  } finally { db.close(); }
});
