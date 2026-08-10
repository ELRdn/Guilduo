const test = require("node:test");
const assert = require("node:assert/strict");

function legacyState(tasks = []) {
  const now = "2026-08-01T00:00:00.000Z";
  return {
    schemaVersion: 3,
    createdAt: now,
    updatedAt: now,
    tasks,
    taskEvents: [],
    syncEvents: [],
    rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 },
    battle: { mp: 0, maxMp: 80 },
  };
}

test("schema v3 migration preserves history and separates planning from lifecycle", async () => {
  const { migrateState } = await import("../server/questforge-domain.mjs");
  const state = legacyState([
    { id: "due", kind: "todo", title: "期限あり", dueDate: "2026-08-05", difficulty: "easy", done: false },
    { id: "backlog", kind: "todo", title: "期限なし", dueDate: "", difficulty: "easy", done: false },
    { id: "finished", kind: "todo", title: "旧完了", dueDate: "2026-07-30", difficulty: "easy", done: true },
    { id: "daily", kind: "daily", title: "日課", dueDate: "2026-08-01", difficulty: "easy", done: true },
  ]);

  migrateState(state, "2026-08-01");

  assert.equal(state.schemaVersion, 5);
  assert.equal(state.migrationSnapshots.schema3To4.tasks.length, 4);
  assert.deepEqual(state.rewardClaims, {});
  assert.equal(state.tasks.find((task) => task.id === "due").planningMode, "until_due");
  assert.equal(state.tasks.find((task) => task.id === "due").scheduledDate, "2026-08-01");
  assert.equal(state.tasks.find((task) => task.id === "backlog").planningState, "backlog");
  assert.equal(state.tasks.find((task) => task.id === "finished").lifecycleState, "archived");
  assert.equal(state.tasks.find((task) => task.id === "daily").lifecycleState, "active");
});

test("quest views distinguish today, week, future, backlog, completed, and archive", async () => {
  const { archiveQuests, createQuest, listQuestPage, scoreQuest } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const today = createQuest(state, { kind: "todo", title: "継続表示", dueDate: "2026-08-05", planningMode: "until_due" }, { date: "2026-08-01" });
  createQuest(state, { kind: "todo", title: "今週の指定日", dueDate: "2026-08-03", scheduledDate: "2026-08-03", planningMode: "on_date" }, { date: "2026-08-01" });
  createQuest(state, { kind: "todo", title: "将来", dueDate: "2026-08-20", scheduledDate: "2026-08-20", planningMode: "on_date" }, { date: "2026-08-01" });
  createQuest(state, { kind: "todo", title: "バックログ" }, { date: "2026-08-01" });

  assert.deepEqual(listQuestPage(state, { view: "today", date: "2026-08-01" }).quests.map((task) => task.title), ["継続表示"]);
  assert.deepEqual(listQuestPage(state, { view: "week", date: "2026-08-01" }).quests.map((task) => task.title), ["継続表示", "今週の指定日"]);
  assert.deepEqual(listQuestPage(state, { view: "future", date: "2026-08-01" }).quests.map((task) => task.title), ["将来"]);
  assert.deepEqual(listQuestPage(state, { view: "backlog", date: "2026-08-01" }).quests.map((task) => task.title), ["バックログ"]);

  scoreQuest(state, today.id, "up", { date: "2026-08-01" });
  assert.equal(listQuestPage(state, { view: "completed" }).quests[0].id, today.id);
  archiveQuests(state, { questIds: [today.id], dryRun: false });
  assert.equal(listQuestPage(state, { view: "archive" }).quests[0].id, today.id);
});

test("batch updates are dry-run by default, atomic, and count explicit postponements", async () => {
  const { batchUpdateQuests, createQuest } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const quest = createQuest(state, { kind: "todo", title: "延期対象", dueDate: "2026-08-10", scheduledDate: "2026-08-01" }, { date: "2026-08-01" });

  const preview = batchUpdateQuests(state, { questIds: [quest.id], postponeDays: 1 });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.quests[0].scheduledDate, "2026-08-02");
  assert.equal(state.tasks.find((task) => task.id === quest.id).scheduledDate, "2026-08-01");

  assert.throws(() => batchUpdateQuests(state, { questIds: [quest.id, "missing"], postponeDays: 1, dryRun: false }), /Quest not found/);
  assert.equal(state.tasks.find((task) => task.id === quest.id).scheduledDate, "2026-08-01");

  const updated = batchUpdateQuests(state, { questIds: [quest.id], postponeDays: 1, dryRun: false });
  assert.equal(updated.quests[0].scheduledDate, "2026-08-02");
  assert.equal(updated.quests[0].rolloverCount, 1);
});

test("dependencies reject missing ids and cycles", async () => {
  const { createQuest, patchQuest } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const first = createQuest(state, { kind: "todo", title: "First" });
  const second = createQuest(state, { kind: "todo", title: "Second", dependencyIds: [first.id] });

  assert.throws(() => patchQuest(state, first.id, { dependencyIds: ["missing"] }), /Dependency not found/);
  assert.throws(() => patchQuest(state, first.id, { dependencyIds: [second.id] }), /cannot contain a cycle/);
});

test("Toggl time entries override manual actual minutes", async () => {
  const { createQuest, linkExternalRecord } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const quest = createQuest(state, { kind: "todo", title: "計測", actualMinutes: 15 });
  assert.equal(quest.actualMinutes, 15);

  const first = linkExternalRecord(state, quest.id, { service: "toggl-track", externalId: "te-1", type: "time_entry", durationMinutes: 42 });
  assert.equal(first.quest.actualMinutes, 42);
  const second = linkExternalRecord(state, quest.id, { service: "toggl-track", externalId: "te-2", type: "time_entry", durationMinutes: 10 });
  assert.equal(second.quest.actualMinutes, 52);
  assert.equal(second.quest.manualActualMinutes, 15);
});
