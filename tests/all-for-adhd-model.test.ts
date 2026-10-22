import { test } from "node:test";
import assert from "node:assert/strict";
import type { Quest } from "../types/questforge.ts";
import { blockers, bucketOf, dayPlan, stepsOf, groups, isWorking, minutesLabel, nextCandidates, plannedMinutes } from "../interaction-lab/all-for-adhd/model.ts";

const TODAY = "2026-10-18";
function quest(id: string, patch: Partial<Quest> & { owner?: "self" | "agent"; state?: string } = {}): Quest {
  const { owner = "self", state = "none", ...rest } = patch;
  return {
    id, kind: "todo", title: id, lifecycleState: "active", done: false, planningMode: "on_date",
    scheduledDate: "", scheduledTime: "", dueDate: "", estimatedMinutes: 0, updatedAt: "2026-10-01T00:00:00Z",
    assignee: { type: owner, id: owner, label: owner, handoffState: state }, ...rest,
  } as unknown as Quest;
}

test("buckets follow date, owner and decisions", () => {
  assert.equal(bucketOf(quest("a"), TODAY), "inbox");
  assert.equal(bucketOf(quest("b", { scheduledDate: TODAY }), TODAY), "today");
  assert.equal(bucketOf(quest("c", { dueDate: "2026-10-10" }), TODAY), "review");
  assert.equal(bucketOf(quest("d", { scheduledDate: "2026-10-20" }), TODAY), "later");
  assert.equal(bucketOf(quest("e", { scheduledDate: "2026-10-15", dueDate: "2026-10-20", planningMode: "until_due" }), TODAY), "today");
  assert.equal(bucketOf(quest("f", { owner: "agent", state: "working" }), TODAY), "agent");
  assert.equal(bucketOf(quest("g", { owner: "agent", state: "review_required" }), TODAY), "decision");
});

test("next candidates put running work first and never offer Agent work", () => {
  const list = [
    quest("inbox", { updatedAt: "2026-10-17T00:00:00Z" }),
    quest("late", { dueDate: "2026-10-01" }),
    quest("today-10", { scheduledDate: TODAY, scheduledTime: "10:00" }),
    quest("today-09", { scheduledDate: TODAY, scheduledTime: "09:00" }),
    quest("running", { state: "working" }),
    quest("agent", { owner: "agent", state: "working" }),
    quest("done", { lifecycleState: "completed" }),
  ];
  assert.deepEqual(nextCandidates(list, TODAY).map(q => q.id), ["running", "today-09", "today-10", "late", "inbox"]);
  assert.equal(groups(list, TODAY).agent.length, 1);
});

test("time totals read naturally", () => {
  assert.equal(plannedMinutes([quest("a", { estimatedMinutes: 30 }), quest("b", { estimatedMinutes: 45 })]), 75);
  assert.equal(minutesLabel(75), "1時間15分");
  assert.equal(minutesLabel(60), "1時間");
  assert.equal(minutesLabel(0), "0分");
});

test("day plan splits timed and anytime work and finds free time", async () => {
  const { dayPlan, gaps, weekOf, clock } = await import("../interaction-lab/all-for-adhd/model.ts");
  const at = (id: string, time: string, minutes: number, extra: Record<string, unknown> = {}) => quest(id, { scheduledDate: "2026-10-18", scheduledTime: time, estimatedMinutes: minutes, ...extra } as Partial<Quest>);
  const plan = dayPlan([at("b", "10:00", 30), at("a", "09:00", 0), at("free", "", 0), at("other", "09:00", 30, { scheduledDate: "2026-10-19" })], "2026-10-18");
  assert.deepEqual(plan.timed.map(q => q.id), ["a", "b"]);
  assert.deepEqual(plan.anytime.map(q => q.id), ["free"]);
  assert.deepEqual(gaps(plan.timed), [{ start: 9 * 60 + 15, minutes: 45, before: "b" }]);
  assert.equal(weekOf("2026-10-18")[0], "2026-10-12");
  assert.equal(clock(25 * 60 + 5), "01:05");
});

test("answered or deferred review requests leave the task lists", async () => {
  const { groups, needsDecision } = await import("../interaction-lab/all-for-adhd/model.ts");
  const request = (status: string) => ({ sourceQuestId: "s", requestKey: "k", recipientId: "self", reason: "", checkTarget: "", artifactUrl: "", status, seenAt: "", respondedAt: "", response: "", outcome: "" });
  const pending = quest("p", { humanRequest: request("pending") } as Partial<Quest>);
  const answered = quest("a", { humanRequest: request("answered") } as Partial<Quest>);
  const deferred = quest("d", { humanRequest: request("deferred") } as Partial<Quest>);
  assert.equal(needsDecision(pending), true);
  assert.equal(needsDecision(answered), false);
  const all = groups([pending, answered, deferred], TODAY);
  assert.deepEqual(all.decision.map(q => q.id), ["p"]);
  assert.equal(Object.values(all).flat().length, 1);
});

test("dailies return every day and a finished task never counts as running", () => {
  const daily = quest("daily", { kind: "daily", scheduledDate: "2026-08-02", dueDate: "2026-08-16", planningMode: "until_due", lastCompletedDate: "2026-10-17" } as Partial<Quest>);
  assert.equal(bucketOf(daily, TODAY), "today");
  assert.equal(dayPlan([daily], TODAY).anytime.length, 1);
  assert.equal(dayPlan([daily], "2026-10-17").anytime[0]?.done, true);
  assert.equal(dayPlan([daily], TODAY).anytime[0]?.done, false);
  assert.equal(isWorking(quest("ran", { state: "working" })), true);
  assert.equal(isWorking(quest("finished", { state: "working", done: true })), false);
});

test("steps run in order: waiting steps and their parent are not offered as next", () => {
  const parent = quest("parent");
  const first = quest("first", { parentQuestId: "parent", createdAt: "2026-10-01" } as Partial<Quest>);
  const second = quest("second", { parentQuestId: "parent", createdAt: "2026-10-02", dependencyIds: ["first"] } as Partial<Quest>);
  const list = [parent, second, first];
  assert.deepEqual(blockers(second, list).map(q => q.id), ["first"]);
  assert.deepEqual(stepsOf(parent, list).map(q => q.id), ["first", "second"]);
  assert.deepEqual(nextCandidates(list, TODAY).map(q => q.id), ["first"]);
  assert.deepEqual(blockers(second, [parent, second, { ...first, done: true } as Quest]), []);
});
