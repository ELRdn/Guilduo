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

  assert.equal(state.schemaVersion, 7);
  assert.equal(state.migrationSnapshots.schema3To4.tasks.length, 4);
  assert.deepEqual(state.rewardClaims, {});
  assert.equal(state.tasks.find((task) => task.id === "due").planningMode, "until_due");
  assert.equal(state.tasks.find((task) => task.id === "due").scheduledDate, "2026-08-01");
  assert.equal(state.tasks.find((task) => task.id === "backlog").planningState, "backlog");
  assert.equal(state.tasks.find((task) => task.id === "finished").lifecycleState, "archived");
  assert.equal(state.tasks.find((task) => task.id === "daily").lifecycleState, "active");
  assert.equal(state.tasks.every((task) => task.parentQuestId === ""), true);
  assert.equal(state.tasks.every((task) => task.handoff && task.handoff.note === ""), true);
  assert.equal(state.migrationSnapshots.schema5To6.schemaVersion, 3);
  assert.equal(state.migrationSnapshots.schema6To7.schemaVersion, 3);
});

test("quest views distinguish today, week, future, backlog, completed, and archive", async () => {
  const { createQuest, listQuestPage, scoreQuest } = await import("../server/questforge-domain.mjs");
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
  assert.equal(state.tasks.find((task) => task.id === today.id).lifecycleState, "archived");
  assert.equal(listQuestPage(state, { view: "completed" }).quests.length, 0);
  assert.equal(listQuestPage(state, { view: "archive" }).quests[0].id, today.id);
});

test("single todos archive on completion while recurring work stays active", async () => {
  const { createQuest, patchQuest, scoreQuest } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const oneOff = createQuest(state, { kind: "todo", title: "単発" });
  const recurring = createQuest(state, { kind: "todo", title: "毎週", repeat: "weekly" });
  const daily = createQuest(state, { kind: "daily", title: "日課" });

  scoreQuest(state, oneOff.id, "up", { date: "2026-08-01" });
  scoreQuest(state, recurring.id, "up", { date: "2026-08-01" });
  scoreQuest(state, daily.id, "up", { date: "2026-08-01" });
  assert.equal(state.tasks.find((task) => task.id === oneOff.id).lifecycleState, "archived");
  assert.equal(state.tasks.find((task) => task.id === recurring.id).lifecycleState, "active");
  assert.equal(state.tasks.find((task) => task.id === daily.id).lifecycleState, "active");

  scoreQuest(state, oneOff.id, "down", { date: "2026-08-01" });
  assert.equal(state.tasks.find((task) => task.id === oneOff.id).lifecycleState, "active");
  assert.equal(state.tasks.find((task) => task.id === oneOff.id).archivedAt, "");
  const patched = patchQuest(state, oneOff.id, { lifecycleState: "completed" });
  assert.equal(patched.lifecycleState, "archived");
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

test("Quest Tree validates parents, reports progress, and keeps the parent active", async () => {
  const { createQuest, getQuestTree, patchQuest, scoreQuest } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const parent = createQuest(state, { kind: "todo", title: "公開準備" });
  const child = createQuest(state, { kind: "todo", title: "READMEを更新", parentQuestId: parent.id });
  const secondChild = createQuest(state, { kind: "daily", title: "毎日レビュー", parentQuestId: parent.id });

  let tree = getQuestTree(state);
  assert.equal(tree.total, 3);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].children.length, 2);
  assert.deepEqual(tree.summary, { childrenTotal: 2, childrenCompleted: 0, progressPercent: 0 });

  scoreQuest(state, child.id, "up", { date: "2026-08-01" });
  tree = getQuestTree(state);
  assert.equal(tree.summary.childrenTotal, 1);
  assert.equal(tree.summary.childrenCompleted, 0);
  assert.equal(tree.summary.progressPercent, 0);
  assert.equal(state.tasks.find((task) => task.id === parent.id).lifecycleState, "active");

  assert.equal(getQuestTree(state, { includeArchived: true }).summary.childrenTotal, 2);
  assert.equal(getQuestTree(state, { includeArchived: true }).summary.childrenCompleted, 1);
  assert.throws(() => patchQuest(state, parent.id, { parentQuestId: secondChild.id }), /cycle|circular/i);
  assert.throws(() => patchQuest(state, parent.id, { parentQuestId: parent.id }), /own parent|own/i);
  const reward = createQuest(state, { kind: "reward", title: "休憩" });
  assert.throws(() => patchQuest(state, reward.id, { parentQuestId: parent.id }), /Only habit, daily, and todo/);
});

test("Agent Handoff transitions support dry-run, expected state, and normalized aliases", async () => {
  const { createQuest, listAgentHandoffs, transitionQuestHandoff } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const created = createQuest(state, {
    kind: "todo",
    title: "エージェント作業",
    assignee: { type: "agent", id: "OpenAI-Codex", label: "Codex", handoffState: "ready" },
  });
  assert.equal(created.assignee.id, "codex");

  const preview = transitionQuestHandoff(state, created.id, { state: "working" });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.quest.assignee.handoffState, "working");
  assert.equal(state.tasks[0].assignee.handoffState, "ready");

  transitionQuestHandoff(state, created.id, { state: "working", dryRun: false, expectedState: "ready" }, { source: "test" });
  transitionQuestHandoff(state, created.id, { state: "review_required", dryRun: false, expectedState: "working", artifactUrl: "https://example.com/result" }, { source: "test" });
  assert.equal(state.tasks[0].handoff.artifactUrl, "https://example.com/result");
  assert.throws(() => transitionQuestHandoff(state, created.id, { state: "accepted", dryRun: false, expectedState: "working" }), /changed before|stale/i);
  transitionQuestHandoff(state, created.id, { state: "accepted", dryRun: false, expectedState: "review_required" }, { source: "test", reviewedBy: "human" });
  assert.equal(state.tasks[0].handoff.reviewedBy, "human");
  assert.equal(listAgentHandoffs(state, { state: "accepted" }).total, 1);
  transitionQuestHandoff(state, created.id, { state: "none", dryRun: false, expectedState: "accepted" }, { source: "test" });
  assert.equal(state.tasks[0].assignee.handoffState, "none");
});

test("Quest input persists handoff metadata and rejects invalid tree depth or transitions", async () => {
  const { createQuest, patchQuest } = await import("../server/questforge-domain.mjs");
  const state = legacyState();
  const root = createQuest(state, { kind: "todo", title: "深いツリーの根" });
  let parent = root;
  for (let depth = 2; depth <= 8; depth += 1) {
    parent = createQuest(state, { kind: "todo", title: `階層${depth}`, parentQuestId: parent.id });
  }
  assert.throws(() => createQuest(state, { kind: "todo", title: "9階層目", parentQuestId: parent.id }), /depth cannot exceed/i);

  const assigned = createQuest(state, {
    kind: "todo",
    title: "成果物付き",
    assignee: { type: "agent", id: "codex", label: "Codex", handoffState: "ready" },
    handoff: { note: "最初のメモ", artifactUrl: "https://example.com/initial" },
  });
  assert.equal(assigned.handoff.note, "最初のメモ");
  const patched = patchQuest(state, assigned.id, { handoff: { blockedReason: "入力待ち" } });
  assert.equal(patched.handoff.note, "最初のメモ");
  assert.equal(patched.handoff.blockedReason, "入力待ち");
  assert.throws(() => patchQuest(state, assigned.id, { handoff: { artifactUrl: "http://example.com/insecure" } }), /HTTPS/i);
  assert.throws(() => patchQuest(state, assigned.id, { assignee: { type: "agent", id: "codex", label: "Codex", handoffState: "accepted" } }), /Cannot move handoff/i);
  const { transitionQuestHandoff } = await import("../server/questforge-domain.mjs");
  assert.throws(() => transitionQuestHandoff(state, assigned.id, { state: "accepted", dryRun: false }), /Cannot move handoff/i);
});
