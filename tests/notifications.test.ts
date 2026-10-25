const test = require("node:test");
const assert = require("node:assert/strict");
import type { Quest, QuestForgeState } from "../types/questforge.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState, hasErrorCode, SqliteD1Database } from "./test-helpers.ts";
import { b64url, encryptPayload, fromB64url, vapidHeader, vapidKeys } from "../worker/src/web-push.ts";
import { agentJobs, dailyJob, DEFAULT_SETTINGS, handleNotifications, localToUtc, reminderJobs, sendDueNotifications } from "../worker/src/notifications.ts";

const settings = { ...DEFAULT_SETTINGS, timeZone: "Asia/Tokyo" };
const NOW = Date.parse("2026-10-26T00:00:00Z"); // 09:00 in Tokyo

function quest(id: string, patch: Partial<Quest> = {}): Quest {
  return { id, kind: "todo", title: id, done: false, lifecycleState: "active", scheduledDate: "2026-10-26", scheduledTime: "10:00", icon: "",
    assignee: { type: "self", id: "self", label: "me", handoffState: "none" }, humanRequest: null, proposal: null, updatedAt: "u1", ...patch } as Quest;
}
const state = (...tasks: Quest[]): QuestForgeState => asQuestForgeState({ tasks });

async function receiver() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as { publicKey: CryptoKey; privateKey: CryptoKey };
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), auth: b64url(auth) };
}

// RFC 8291 from the browser's side: undo what encryptPayload did.
async function decrypt(body: Uint8Array<ArrayBuffer>, target: Awaited<ReturnType<typeof receiver>>): Promise<string> {
  const hkdf = async (salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string | Uint8Array<ArrayBuffer>, bytes: number) => new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: typeof info === "string" ? new TextEncoder().encode(info) : info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));
  const salt = body.slice(0, 16), idLength = body[20]!, senderPublic = body.slice(21, 21 + idLength);
  const sender = await crypto.subtle.importKey("raw", senderPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: sender }, target.pair.privateKey, 256));
  const receiverPublic = fromB64url(target.p256dh);
  const info = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...receiverPublic, ...senderPublic]);
  const ikm = await hkdf(fromB64url(target.auth), shared, info, 32);
  const key = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16), "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12) }, key, body.slice(21 + idLength)));
  assert.equal(plain.at(-1), 2, "a single record ends with the last-record delimiter");
  return new TextDecoder().decode(plain.slice(0, -1));
}

test("a push payload decrypts on the receiving side, and the VAPID token verifies with the stored key", async () => {
  const target = await receiver();
  assert.equal(await decrypt(await encryptPayload(target, '{"title":"歯医者"}'), target), '{"title":"歯医者"}');

  const db = new SqliteD1Database();
  const env: WorkerEnv = { QUESTFORGE_DB: db };
  const keys = await vapidKeys(env);
  assert.equal((await vapidKeys(env)).publicKey, keys.publicKey, "the key is created once and kept");
  const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", keys, "https://app.guilduo.com", NOW);
  const [, token, k] = /^vapid t=(.+), k=(.+)$/.exec(header)!;
  assert.equal(k, keys.publicKey);
  const [head, claims, signature] = token!.split(".");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromB64url(claims!))), { aud: "https://fcm.googleapis.com", exp: NOW / 1000 + 12 * 3600, sub: "https://app.guilduo.com" });
  const verifier = await crypto.subtle.importKey("raw", fromB64url(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifier, fromB64url(signature!), new TextEncoder().encode(`${head}.${claims}`)));
  db.close();
});

test("local times convert in the person's zone, across daylight saving", () => {
  assert.equal(new Date(localToUtc("2026-10-26", "09:00", "Asia/Tokyo")).toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(new Date(localToUtc("2026-07-01", "09:00", "America/New_York")).toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(new Date(localToUtc("2026-12-01", "09:00", "America/New_York")).toISOString(), "2026-12-01T14:00:00.000Z");
});

test("reminders come from the settings unless a task sets its own, and only for my own open timed tasks", () => {
  const jobs = reminderJobs("u", state(
    quest("plain"),
    quest("own", { reminders: [30] }),
    quest("silent", { reminders: [] }),
    quest("agent", { assignee: { type: "agent", id: "a", label: "Astra", handoffState: "working" } }),
    quest("done", { done: true }),
    quest("untimed", { scheduledTime: "" }),
    quest("far", { scheduledDate: "2026-10-30" }),
  ), settings, NOW);
  assert.deepEqual(jobs.map(job => [job.id.split(":")[2], new Date(job.fireAt).toISOString().slice(11, 16), job.payload.body]), [
    ["plain", "00:50", "10分後に始まります"], ["plain", "01:00", "始める時間です"], ["own", "00:30", "30分後に始まります"]]);
  assert.equal(reminderJobs("u", state(quest("past", { scheduledTime: "08:00" })), settings, NOW).length, 0, "a reminder in the past is skipped");

  assert.equal(new Date(dailyJob("u", settings, NOW).fireAt).toISOString(), "2026-10-26T23:00:00.000Z", "08:00 already passed, so tomorrow");
  assert.equal(new Date(dailyJob("u", { ...settings, summary: "" }, NOW).fireAt).toISOString(), "2026-10-26T18:00:00.000Z", "without a summary it still runs at 03:00");
});

test("Agent events fire once per transition and respect the settings", () => {
  const agent = { type: "agent" as const, id: "a", label: "Astra", handoffState: "working" as const };
  const before = state(quest("r", { assignee: agent }), quest("p"), quest("d", { assignee: agent }));
  const after = state(
    quest("r", { assignee: { ...agent, handoffState: "review_required" }, updatedAt: "u2" }),
    quest("p", { proposal: { agentId: "a", label: "Scribe", date: "2026-10-26", time: "14:00", minutes: 30, note: "", createdAt: "c1" } }),
    quest("d", { assignee: agent, done: true, updatedAt: "u2" }),
  );
  assert.deepEqual(agentJobs("u", before, after, settings, NOW).map(job => job.payload.title),
    ["Astra が確認を待っています", "Scribe から時間の提案", "Astra が終えました"]);
  assert.equal(agentJobs("u", after, after, settings, NOW).length, 0, "nothing changed, nothing sent");
  assert.equal(agentJobs("u", before, after, { ...settings, review: false, proposal: false, report: false }, NOW).length, 0);
});

test("a task's reminders are validated, and null returns it to the settings", async () => {
  const { createQuest, patchQuest } = await import("../server/questforge-domain.ts");
  const s = asQuestForgeState({ schemaVersion: 7, createdAt: "", updatedAt: "", tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {}, character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 }, battle: { mp: 0, maxMp: 80 } });
  const created = createQuest(s, { kind: "todo", title: "Call", reminders: [0, 15, 15] });
  assert.deepEqual(created.reminders, [15, 0]);
  for (const reminders of [[1, 2, 3, 4], [-5], [2000], "10"]) {
    assert.throws(() => patchQuest(s, created.id, { reminders }), (error: unknown) => hasErrorCode(error, "invalid_reminders"));
  }
  assert.deepEqual(patchQuest(s, created.id, { reminders: [] }).reminders, []);
  assert.equal(Object.hasOwn(patchQuest(s, created.id, { reminders: null }), "reminders"), false);
});

test("the cron sends due jobs once, and forgets devices the push service says are gone", async () => {
  const db = new SqliteD1Database();
  const env: WorkerEnv = { QUESTFORGE_DB: db };
  const target = await receiver();
  const identity = { uid: "u", authType: "appwrite" };
  // Subscribing schedules from the real clock, so the appointment is tomorrow in Tokyo.
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(Date.now() + 24 * 3_600_000);
  const saved = async () => state(quest("dentist", { title: "歯医者", icon: "🦷", scheduledDate: tomorrow }));
  const call = (method: string, path: string, body?: unknown) => handleNotifications(new Request(`https://api.example${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), env, identity, saved);

  await assert.rejects(call("POST", "/v1/notifications/subscriptions", { endpoint: "https://evil.example/push", keys: { p256dh: target.p256dh, auth: target.auth } }), (error: unknown) => hasErrorCode(error, "invalid_push_endpoint"));
  await assert.rejects(handleNotifications(new Request("https://api.example/v1/notifications"), env, { uid: "u", authType: "oauth" }, async () => null), (error: unknown) => hasErrorCode(error, "notifications_web_only"));
  const created = await call("POST", "/v1/notifications/subscriptions", { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", keys: { p256dh: target.p256dh, auth: target.auth }, settings: { timeZone: "Asia/Tokyo", locale: "ja" } });
  assert.equal(created.status, 201);
  const loaded = await (await call("GET", "/v1/notifications")).json() as { devices: number; settings: { timeZone: string } };
  assert.deepEqual([loaded.devices, loaded.settings.timeZone], [1, "Asia/Tokyo"]);

  const sent: { url: string; body: string }[] = [];
  const realFetch = globalThis.fetch;
  let status = 201;
  globalThis.fetch = (async (url: string, init: RequestInit) => { sent.push({ url, body: await decrypt(init.body as Uint8Array<ArrayBuffer>, target) }); return new Response(null, { status }); }) as typeof fetch;
  try {
    const start = localToUtc(tomorrow, "10:00", "Asia/Tokyo"), due = start - 9 * 60_000;
    const times = (db.raw.prepare("SELECT fire_at FROM notification_jobs WHERE kind = 'reminder' ORDER BY fire_at").all() as { fire_at: number }[]).map(row => row.fire_at);
    assert.deepEqual(times, [start - 10 * 60_000, start], "subscribing scheduled the dentist's reminders");
    await sendDueNotifications(env, saved, due);
    await sendDueNotifications(env, saved, due);
    // The 08:00 summary was due too; its rescheduling must not drop the reminder that is already due.
    assert.deepEqual(sent.map(item => JSON.parse(item.body)), [
      { title: "今日の予定", body: "1件。最初は 10:00 🦷 歯医者", tag: "summary", url: "/next/all-for-adhd/#plan" },
      { title: "🦷 歯医者", body: "10分後に始まります", tag: "quest-dentist", url: "/next/all-for-adhd/#now" },
    ], "each due job is sent once, even when the cron runs twice");

    status = 410;
    assert.equal((await (await call("POST", "/v1/notifications/test")).json() as { sent: number }).sent, 0);
    assert.equal((db.raw.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number }).n, 0, "a gone device is removed");
  } finally {
    globalThis.fetch = realFetch;
    db.close();
  }
});
