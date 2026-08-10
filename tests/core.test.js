const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../questforge-core.js");

test("a todo completion reward can only be claimed once", () => {
  const task = { id: "todo-1", kind: "todo", repeat: "none", difficulty: "medium" };
  const first = core.claimCompletion({}, task, "2026-07-11", "2026-07-11T09:00:00.000Z");
  const second = core.claimCompletion(first.rewardClaims, task, "2026-07-12", "2026-07-12T09:00:00.000Z");

  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(first.key, "todo-1:todo:once");
});

test("a daily completion can grant once per calendar day", () => {
  const task = { id: "daily-1", kind: "daily", repeat: "daily", difficulty: "easy" };
  const first = core.claimCompletion({}, task, "2026-07-11", "2026-07-11T09:00:00.000Z");
  const sameDay = core.claimCompletion(first.rewardClaims, task, "2026-07-11", "2026-07-11T12:00:00.000Z");
  const nextDay = core.claimCompletion(first.rewardClaims, task, "2026-07-12", "2026-07-12T09:00:00.000Z");

  assert.equal(sameDay.granted, false);
  assert.equal(nextDay.granted, true);
});

test("weekday rollover skips a weekend", () => {
  const task = { id: "daily-2", kind: "daily", repeat: "weekdays", dueDate: "2026-07-11" };
  assert.equal(core.nextDueDateForTask(task, "2026-07-11"), "2026-07-13");
});

test("monthly rollover clamps to the final day of a short month", () => {
  const task = { id: "todo-2", kind: "todo", repeat: "monthly", dueDate: "2026-01-31" };
  assert.equal(core.nextDueDateForTask(task, "2026-02-01"), "2026-02-28");
});

test("battle MP and command costs use the shared production rules", () => {
  const reward = core.taskRewardDelta({ kind: "todo", difficulty: "hard" }, "todo");
  assert.deepEqual(reward, { gems: 18, xp: 30, mp: 54 });
  assert.equal(core.battleCommandCost("skill", 18), 18);
  assert.equal(core.battleCommandCost("burst", 18), 40);
});

test("task events keep newest entries and respect the history limit", () => {
  const events = core.appendTaskEvent([{ id: "old" }], { id: "new" }, 2);
  assert.deepEqual(events.map((event) => event.id), ["new", "old"]);
});

test("completed and archived lifecycle states remain distinct", () => {
  assert.equal(core.isCompletedTask({ lifecycleState: "completed" }), true);
  assert.equal(core.isArchivedTask({ lifecycleState: "archived" }), true);
  assert.equal(core.isArchivedTask({ lifecycleState: "completed" }), false);
  assert.equal(core.isArchivedTask({ kind: "todo", done: true }), false);
});

test("battle eligibility ignores optional notes and excludes inactive quests", () => {
  assert.equal(core.isBattleTaskEligible({ kind: "todo", title: "メモなし", notes: "", done: false, lifecycleState: "active" }), true);
  assert.equal(core.isBattleTaskEligible({ kind: "daily", title: "日課", notes: "", done: false, lifecycleState: "active" }), true);
  assert.equal(core.isBattleTaskEligible({ kind: "todo", title: "完了済み", notes: "", done: true, lifecycleState: "completed" }), false);
  assert.equal(core.isBattleTaskEligible({ kind: "todo", title: "保管済み", notes: "", done: false, lifecycleState: "archived" }), false);
  assert.equal(core.isBattleTaskEligible({ kind: "reward", title: "ごほうび", notes: "", done: false, lifecycleState: "active" }), false);
  assert.equal(core.isBattleTaskEligible({ kind: "habit", title: "マイナス習慣", notes: "", negativeOnly: true, lifecycleState: "active" }), false);
});
