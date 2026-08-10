const test = require("node:test");
const assert = require("node:assert/strict");

const env = {
  DEV_BEARER_TOKEN: "integration-test-key",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  NOTION_CLIENT_ID: "notion-client-id",
  NOTION_CLIENT_SECRET: "notion-client-secret",
  PUBLIC_BASE_URL: "https://worker.example",
  WEB_APP_URL: "https://app.example",
};

function state() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 4, createdAt: now, updatedAt: now, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 },
    battle: { mp: 0, maxMp: 80 }, boss: { hp: 100, maxHp: 100 },
  };
}

test("integration vault encrypts provider tokens and isolates users", async () => {
  const { decryptSecret, encryptSecret, getIntegrationAccount, saveIntegrationAccount } = await import("../worker/src/integration-store.mjs");
  const encrypted = await encryptSecret(env, "top-secret-token");
  assert.doesNotMatch(encrypted, /top-secret-token/);
  assert.equal(await decryptSecret(env, encrypted), "top-secret-token");

  await saveIntegrationAccount(env, "vault-user-a", "google-calendar", { accessToken: "token-a", refreshToken: "refresh-a", settings: { autoSync: true } });
  assert.equal((await getIntegrationAccount(env, "vault-user-a", "google-calendar", { includeTokens: true })).accessToken, "token-a");
  assert.equal(await getIntegrationAccount(env, "vault-user-b", "google-calendar"), null);
});

test("provider connect creates a short-lived Google OAuth request with minimum scopes", async () => {
  const { beginIntegrationConnect } = await import("../worker/src/provider-oauth.mjs");
  const result = await beginIntegrationConnect(env, { uid: "oauth-user", email: "test@example.com" }, "google-calendar");
  const url = new URL(result.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://worker.example/oauth/callback/google");
  assert.match(url.searchParams.get("scope"), /calendar\.events\.readonly/);
  assert.match(url.searchParams.get("scope"), /\/auth\/tasks/);

  const callback = await (await import("../worker/src/provider-oauth.mjs")).handleProviderCallback(new Request("https://worker.example/oauth/callback/google?state=changed&code=nope"), env, "google");
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get("location"), /result=error/);
});

test("Calendar sync caches schedule blocks without creating quests", async () => {
  const { saveIntegrationAccount } = await import("../worker/src/integration-store.mjs");
  const { calendarSchedule, syncIntegration } = await import("../worker/src/integrations.mjs");
  const uid = "calendar-user";
  await saveIntegrationAccount(env, uid, "google-calendar", { accessToken: "calendar-token", tokenExpiresAt: Date.now() + 3600000, settings: { calendarIds: ["primary"], autoSync: false } });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/users/me/calendarList")) return Response.json({ items: [{ id: "primary", summary: "Main", primary: true }] });
    if (value.includes("/calendars/primary/events")) return Response.json({ items: [{ id: "event-1", summary: "Design review", start: { dateTime: "2026-08-02T10:00:00+09:00" }, end: { dateTime: "2026-08-02T11:00:00+09:00" }, status: "confirmed", htmlLink: "https://calendar.google.com/event" }] });
    throw new Error(`Unexpected fetch: ${value}`);
  };
  try {
    const current = state();
    const preview = await syncIntegration(env, { uid }, current, "google-calendar", "import", true);
    assert.equal(preview.preview[0].action, "schedule");
    assert.equal(current.tasks.length, 0);
    await syncIntegration(env, { uid }, current, "google-calendar", "import", false);
    const schedule = await calendarSchedule(env, { uid }, "2026-08-02");
    assert.equal(schedule.events[0].title, "Design review");
    assert.equal(current.tasks.length, 0);
  } finally { global.fetch = originalFetch; }
});

test("Google Tasks dry-run is immutable and live sync imports without deleting", async () => {
  const { saveIntegrationAccount } = await import("../worker/src/integration-store.mjs");
  const { syncIntegration } = await import("../worker/src/integrations.mjs");
  const uid = "tasks-user";
  await saveIntegrationAccount(env, uid, "google-tasks", { accessToken: "tasks-token", tokenExpiresAt: Date.now() + 3600000, settings: { taskListId: "list-1", autoSync: false } });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/lists/list-1/tasks")) return Response.json({ items: [{ id: "remote-1", title: "Remote task", notes: "Keep it", due: "2026-08-05T00:00:00.000Z", status: "needsAction", updated: "2026-08-02T01:00:00.000Z", etag: "etag-1" }] });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const current = state();
    const preview = await syncIntegration(env, { uid }, current, "google-tasks", "bidirectional", true);
    assert.equal(preview.created, 1);
    assert.equal(current.tasks.length, 0);
    await syncIntegration(env, { uid }, current, "google-tasks", "bidirectional", false);
    assert.equal(current.tasks.length, 1);
    assert.equal(current.tasks[0].externalLinks[0].syncStatus, "synced");
  } finally { global.fetch = originalFetch; }
});

test("Google Tasks conflict stays pending until the user chooses a side", async () => {
  const { saveIntegrationAccount } = await import("../worker/src/integration-store.mjs");
  const { resolveGoogleTaskConflict, syncIntegration } = await import("../worker/src/integrations.mjs");
  const uid = "tasks-conflict-user";
  await saveIntegrationAccount(env, uid, "google-tasks", { accessToken: "tasks-token", tokenExpiresAt: Date.now() + 3600000, settings: { taskListId: "list-conflict", autoSync: false } });
  const originalFetch = global.fetch;
  let remote = { id: "remote-conflict", title: "Original", notes: "", status: "needsAction", updated: "2026-08-02T01:00:00.000Z", etag: "etag-1" };
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (!value.includes("/lists/list-conflict/tasks")) throw new Error(`Unexpected fetch: ${value}`);
    if ((options.method || "GET") === "PATCH") {
      remote = { ...remote, ...JSON.parse(options.body), updated: "2026-08-02T05:00:00.000Z", etag: "etag-3" };
      return Response.json(remote);
    }
    if (value.endsWith("/remote-conflict")) return Response.json(remote);
    return Response.json({ items: [remote] });
  };
  try {
    const current = state();
    await syncIntegration(env, { uid }, current, "google-tasks", "bidirectional", false);
    current.tasks[0].title = "Local edit";
    current.tasks[0].updatedAt = "2099-08-02T03:00:00.000Z";
    remote = { ...remote, title: "Remote edit", updated: "2099-08-02T04:00:00.000Z", etag: "etag-2" };
    const result = await syncIntegration(env, { uid }, current, "google-tasks", "bidirectional", false);
    assert.equal(result.conflicts, 1);
    assert.equal(current.tasks[0].title, "Local edit");
    assert.equal(current.tasks[0].externalLinks[0].syncStatus, "conflict");
    await resolveGoogleTaskConflict(env, { uid }, current, current.tasks[0].id, "remote");
    assert.equal(current.tasks[0].title, "Remote edit");
    assert.equal(current.tasks[0].externalLinks[0].syncStatus, "synced");
  } finally { global.fetch = originalFetch; }
});

test("Notion daily export previews before creating one log row", async () => {
  const { saveIntegrationAccount } = await import("../worker/src/integration-store.mjs");
  const { syncIntegration } = await import("../worker/src/integrations.mjs");
  const uid = "notion-user";
  await saveIntegrationAccount(env, uid, "notion", { accessToken: "notion-token", tokenExpiresAt: 0, settings: { notionDataSourceId: "source-1", notionDatabaseId: "db-1", autoSync: false } });
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET" });
    if (String(url).includes("/data_sources/source-1/query")) return Response.json({ results: [] });
    if (String(url).endsWith("/v1/pages")) return Response.json({ id: "page-1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const current = state();
    const preview = await syncIntegration(env, { uid }, current, "notion", "export", true);
    assert.equal(preview.created, 1);
    assert.equal(requests.filter((item) => item.url.endsWith("/v1/pages")).length, 0);
    await syncIntegration(env, { uid }, current, "notion", "export", false);
    assert.equal(requests.filter((item) => item.url.endsWith("/v1/pages")).length, 1);
  } finally { global.fetch = originalFetch; }
});
