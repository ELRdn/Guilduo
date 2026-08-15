// @ts-nocheck
const test = require("node:test");
const assert = require("node:assert/strict");

const env = {
  DEV_BEARER_TOKEN: "toggl-focus-test-key",
};

function state() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 6,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    taskEvents: [],
    syncEvents: [],
    rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 },
    battle: { mp: 0, maxMp: 80 },
    boss: { hp: 100, maxHp: 100 },
  };
}

async function connectableAccount(uid, settings = {}) {
  const { saveIntegrationAccount } = await import("../worker/src/integration-store.ts");
  return saveIntegrationAccount(env, uid, "toggl-focus", {
    status: "connected",
    accessToken: "toggl_sk_test_123456789",
    providerAccountId: "focus-user",
    providerAccountName: "Focus Test User",
    settings: {
      organizationId: "123",
      workspaceId: "456",
      projectId: "",
      autoCreateTasks: false,
      ...settings,
    },
  });
}

test("Toggl Focus API keys stay encrypted and never appear in the public connection result", async () => {
  const { connectTogglFocus } = await import("../worker/src/toggl-focus.ts");
  const { getIntegrationAccount } = await import("../worker/src/integration-store.ts");
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/users\/me\/settings$/);
    assert.equal(options.headers.authorization, "Bearer toggl_sk_test_123456789");
    return Response.json({ user: { id: 17, email: "focus@example.test" } });
  };
  try {
    const result = await connectTogglFocus(env, { uid: "focus-connect-user" }, { apiKey: "toggl_sk_test_123456789" });
    assert.equal(result.service, "toggl-focus");
    assert.equal(JSON.stringify(result).includes("toggl_sk_test_123456789"), false);
    const privateAccount = await getIntegrationAccount(env, "focus-connect-user", "toggl-focus", { includeTokens: true });
    assert.equal(privateAccount.accessToken, "toggl_sk_test_123456789");
    const publicAccount = await getIntegrationAccount(env, "focus-connect-user", "toggl-focus");
    assert.equal(Object.hasOwn(publicAccount, "accessToken"), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Focus task creation is idempotent across a Firebase retry and keeps completed To Dos out", async () => {
  const { createQuest, scoreQuest } = await import("../server/questforge-domain.ts");
  const { syncQuestToTogglFocus } = await import("../worker/src/toggl-focus.ts");
  const uid = "focus-sync-user";
  await connectableAccount(uid);
  const current = state();
  const quest = createQuest(current, {
    kind: "todo", title: "Focusへ送る", notes: "仕様を確認", dueDate: "2026-08-30",
    scheduledDate: "2026-08-20", estimatedMinutes: 45, impact: "high",
  });
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    requests.push({ url: value, method: options.method || "GET", body: options.body || "" });
    if (value.includes("/tasks") && (options.method || "GET") === "POST") return Response.json({ id: 501, name: "Focusへ送る", updated_at: "2026-08-20T00:00:00.000Z" });
    if (value.includes("/tasks/501") && options.method === "PATCH") return Response.json({ id: 501, name: "Focusへ送る", updated_at: "2026-08-20T01:00:00.000Z" });
    throw new Error(`Unexpected Focus request: ${value}`);
  };
  try {
    const preview = await syncQuestToTogglFocus(env, { uid }, current, quest.id, { dryRun: true });
    assert.equal(preview.operation, "create");
    assert.equal(preview.task.estimated_mins, 45);
    assert.equal(preview.task.priority, "high");

    await syncQuestToTogglFocus(env, { uid }, current, quest.id, { dryRun: false });
    // Simulate the retry state before Firebase stored the external link. The durable mapping must PATCH.
    current.tasks[0].externalLinks = [];
    const retry = await syncQuestToTogglFocus(env, { uid }, current, quest.id, { dryRun: false });
    assert.equal(retry.operation, "update");
    assert.equal(requests.filter((request) => request.method === "POST").length, 1);
    assert.equal(requests.filter((request) => request.method === "PATCH").length, 1);

    scoreQuest(current, quest.id, "up");
    await assert.rejects(
      () => syncQuestToTogglFocus(env, { uid }, current, quest.id, { dryRun: true }),
      (error) => error.code === "focus_quest_not_eligible",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("Focus timers require the exact current entry before another task can replace or stop it", async () => {
  const { createQuest, linkExternalRecord } = await import("../server/questforge-domain.ts");
  const { startTogglFocusTracking, stopTogglFocusTracking } = await import("../worker/src/toggl-focus.ts");
  const uid = "focus-timer-user";
  await connectableAccount(uid);
  const current = state();
  const quest = createQuest(current, { kind: "todo", title: "タイマー対象" });
  linkExternalRecord(current, quest.id, { service: "toggl-focus", externalId: "501", type: "task", sourceType: "focus.task" }, { allowManagedFocus: true });
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    requests.push({ url: value, method: options.method || "GET" });
    if (value.endsWith("/tracking/current")) return Response.json({ id: "entry-other", task_id: "999", description: "Other work", duration: -120 });
    if (value.endsWith("/tracking/start")) return Response.json({ id: "entry-new", task_id: "501", description: "タイマー対象", duration: -1 });
    if (value.endsWith("/tracking/stop")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected Focus request: ${value}`);
  };
  try {
    const preview = await startTogglFocusTracking(env, { uid }, current, { questId: quest.id, dryRun: false });
    assert.equal(preview.action, "confirmation_required");
    assert.equal(requests.some((request) => request.url.endsWith("/tracking/start")), false);
    const started = await startTogglFocusTracking(env, { uid }, current, { questId: quest.id, expectedCurrentEntryId: "entry-other", dryRun: false });
    assert.equal(started.action, "started");
    assert.equal(requests.filter((request) => request.url.endsWith("/tracking/start")).length, 1);
    const stopPreview = await stopTogglFocusTracking(env, { uid }, { expectedEntryId: "wrong-entry", dryRun: false });
    assert.equal(stopPreview.action, "confirmation_required");
    assert.equal(requests.some((request) => request.url.endsWith("/tracking/stop")), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Focus time entries are attributed once, override Track totals, and cannot be manually spoofed", async () => {
  const { createQuest, linkExternalRecord } = await import("../server/questforge-domain.ts");
  const { applyTogglFocusAttribution, previewTogglFocusAttribution } = await import("../worker/src/toggl-focus.ts");
  const { saveTogglFocusAttribution } = await import("../worker/src/integration-store.ts");
  const uid = "focus-attribution-user";
  await connectableAccount(uid);
  const current = state();
  const first = createQuest(current, { kind: "todo", title: "直接紐づけ" });
  const second = createQuest(current, { kind: "todo", title: "別のQuest" });
  linkExternalRecord(current, first.id, { service: "toggl-track", externalId: "track-1", type: "time_entry", durationMinutes: 99 });
  linkExternalRecord(current, first.id, { service: "toggl-focus", externalId: "501", type: "task", sourceType: "focus.task" }, { allowManagedFocus: true });
  assert.throws(
    () => linkExternalRecord(current, second.id, { service: "toggl-focus", externalId: "spoofed", type: "time_entry", durationMinutes: 60 }),
    (error) => error.code === "managed_focus_link_required",
  );
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /\/time-entries\?/);
    return Response.json({ data: [{ id: "entry-1", task_id: "501", duration: 1800, start: "2026-08-19T10:00:00Z", stop: "2026-08-19T10:30:00Z", updated_at: "2026-08-19T10:31:00Z" }] });
  };
  try {
    const preview = await previewTogglFocusAttribution(env, { uid }, current, { days: 30 });
    assert.equal(preview.summary.ready, 1);
    const applied = await applyTogglFocusAttribution(env, { uid }, current, { dryRun: false, days: 30 });
    assert.equal(applied.count, 1);
    assert.equal(current.tasks.find((task) => task.id === first.id).actualMinutes, 30);
    await applyTogglFocusAttribution(env, { uid }, current, { dryRun: false, days: 30 });
    assert.equal(current.tasks.find((task) => task.id === first.id).actualMinutes, 30);
    await assert.rejects(
      () => saveTogglFocusAttribution(env, uid, { entryId: "entry-1", questId: second.id, durationMinutes: 30 }),
      (error) => error.code === "time_entry_already_attributed",
    );
  } finally {
    global.fetch = originalFetch;
  }
});
