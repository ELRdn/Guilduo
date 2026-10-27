import { test } from "node:test";
import assert from "node:assert/strict";
import type { Quest } from "../types/questforge.ts";
import { setLocale } from "../i18n.ts";
import { forDay, agentSummary, blockers, bucketOf, dayPlan, fitForGap, freeAhead, habitDays, proposalFor, stepsOf, groups, isWorking, minutesLabel, nextCandidates, plannedMinutes, weekReview } from "../interaction-lab/all-for-adhd/model.ts";

// The labels below are the Japanese source copy; CI runs in an English locale.
setLocale("ja");

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
  assert.deepEqual(nextCandidates(list, TODAY).map(q => q.id), ["running", "today-09", "today-10"]);
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
  const parent = quest("parent", { scheduledDate: TODAY });
  const first = quest("first", { parentQuestId: "parent", createdAt: "2026-10-01" } as Partial<Quest>);
  const second = quest("second", { parentQuestId: "parent", createdAt: "2026-10-02", dependencyIds: ["first"] } as Partial<Quest>);
  const list = [parent, second, first];
  assert.deepEqual(blockers(second, list).map(q => q.id), ["first"]);
  assert.deepEqual(stepsOf(parent, list).map(q => q.id), ["first", "second"]);
  assert.deepEqual(nextCandidates(list, TODAY).map(q => q.id), ["first"]);
  assert.deepEqual(blockers(second, [parent, second, { ...first, done: true } as Quest]), []);
});

test("free stretches ahead are clipped to now and at least 15 minutes", () => {
  const timed = [
    quest("a", { scheduledDate: TODAY, scheduledTime: "09:00", estimatedMinutes: 30 }),
    quest("b", { scheduledDate: TODAY, scheduledTime: "10:00", estimatedMinutes: 30 }),
    quest("c", { scheduledDate: TODAY, scheduledTime: "10:40", estimatedMinutes: 20 }),
    quest("d", { scheduledDate: TODAY, scheduledTime: "12:00", estimatedMinutes: 30 }),
  ];
  // 09:30–10:00 is past, 10:30–10:40 is too short, 11:00–12:00 starts at now (11:10).
  assert.deepEqual(freeAhead(timed, 11 * 60 + 10), [{ start: 11 * 60 + 10, minutes: 50, before: "d" }]);
});

test("a free stretch is offered one undated task of mine that fits", () => {
  const list = [
    quest("too-long", { estimatedMinutes: 60 }),
    quest("no-estimate"),
    quest("agent", { owner: "agent", estimatedMinutes: 15 }),
    quest("dated", { scheduledDate: TODAY, estimatedMinutes: 15 }),
    quest("old", { estimatedMinutes: 15, createdAt: "2026-10-01T00:00:00Z" }),
    quest("newer", { estimatedMinutes: 30, createdAt: "2026-10-05T00:00:00Z" }),
    quest("due", { estimatedMinutes: 15, createdAt: "2026-09-01T00:00:00Z", dueDate: "2026-10-30" }),
  ];
  assert.equal(fitForGap(list.filter(q => q.id !== "old"), 30, TODAY)?.id, "newer");
  assert.equal(fitForGap(list, 20, TODAY)?.id, "old");
  assert.equal(fitForGap(list, 10, TODAY), null);
});

test("an Agent's proposal is offered only in the free stretch it fits", () => {
  const proposal = (time: string, minutes: number, date = TODAY) => ({ agentId: "a", label: "Astra", date, time, minutes, note: "", createdAt: "" });
  const fits = quest("fits", { proposal: proposal("14:00", 30) });
  const gap = { start: 13 * 60 + 30, minutes: 150 };
  assert.equal(proposalFor([fits], gap, TODAY), fits);
  assert.equal(proposalFor([quest("long", { proposal: proposal("15:30", 60) })], gap, TODAY), null);
  assert.equal(proposalFor([quest("early", { proposal: proposal("13:00", 15) })], gap, TODAY), null);
  assert.equal(proposalFor([quest("tomorrow", { proposal: proposal("14:00", 30, "2026-10-19") })], gap, TODAY), null);
  assert.equal(proposalFor([quest("done", { proposal: proposal("14:00", 30), done: true })], gap, TODAY), null);
});

test("habit dots fill the current streak ending on the last done day", () => {
  const days = habitDays(quest("walk", { kind: "daily", lastCompletedDate: "2026-10-17", streak: 3 }), TODAY, 7);
  assert.deepEqual(days, [false, false, false, true, true, true, false]);
  assert.deepEqual(habitDays(quest("new", { kind: "daily" }), TODAY, 3), [false, false, false]);
});

test("the week review counts this week's finished, planned and moved work", () => {
  // TODAY (2026-10-18) is a Sunday, so the week starts on 2026-10-12.
  const review = weekReview([
    quest("done", { done: true, completedAt: "2026-10-14T09:00:00Z", scheduledDate: "2026-10-14", estimatedMinutes: 30 }),
    quest("old", { done: true, completedAt: "2026-10-05T09:00:00Z" }),
    quest("daily", { kind: "daily", lastCompletedDate: TODAY, scheduledDate: "2026-10-01" }),
    quest("planned", { scheduledDate: "2026-10-16", estimatedMinutes: 60 }),
    quest("moved", { lastRolledOverDate: "2026-10-13" }),
    quest("agent", { owner: "agent", done: true, completedAt: "2026-10-14T09:00:00Z" }),
  ], TODAY);
  assert.deepEqual(review, { done: 2, planned: 90, moved: 1 });
});

test("daily completion agrees across home, groups and candidates, without reviving archived tasks", () => {
  const daily = quest("daily", { kind: "daily", done: true, lifecycleState: "completed", lastCompletedDate: "2026-10-17", state: "working" });
  assert.equal(forDay(daily, TODAY).done, false);
  assert.equal(isWorking(forDay(daily, TODAY)), false);
  assert.equal(groups([daily], TODAY).today.length, 1);
  assert.equal(nextCandidates([daily], TODAY)[0]?.id, "daily");
  assert.equal(dayPlan([daily], TODAY).anytime[0]?.done, false);
  assert.equal(groups([{ ...daily, lastCompletedDate: TODAY }], TODAY).today.length, 0);
  assert.equal(nextCandidates([{ ...daily, lifecycleState: "archived" }], TODAY).length, 0);
  assert.equal(nextCandidates([{ ...daily, scheduledDate: "2026-10-20" }], TODAY).length, 0);
});
test("Agent summary excludes completed and archived work and distinguishes ownership from running", () => {
  const items = ["none", "ready", "working", "blocked", "review_required"].map(state => quest(state, { owner: "agent", state }));
  items.push(quest("done", { owner: "agent", state: "working", done: true }), quest("archived", { owner: "agent", state: "blocked", lifecycleState: "archived" }));
  const summary = agentSummary(items, TODAY);
  assert.deepEqual(summary.visible.map(q => q.id), ["review_required", "blocked", "working"]);
  assert.equal(summary.working.length, 1);
  assert.equal(summary.ready.length, 1);
});
test("overnight calendar segments keep source ids and split the next day's duration", () => {
  const late = quest("overnight", { scheduledDate: TODAY, scheduledTime: "23:30", estimatedMinutes: 90 });
  const next = dayPlan([late], "2026-10-19").timed;
  assert.equal(next[0]?.id, late.id);
  assert.equal(next[0]?.scheduledTime, "00:00");
  assert.equal(next[0]?.estimatedMinutes, 60);
  assert.equal(late.scheduledDate, TODAY);
  assert.equal(dayPlan([{ ...late, lifecycleState: "archived" }], "2026-10-19").timed.length, 0);
});

test("daily completion reopens stale persisted flags before scoring and refuses a stale revision", async () => {
  const { completeToday } = await import("../interaction-lab/all-for-adhd/completion.ts");
  const yesterday = quest("daily", { kind: "daily", done: true, lastCompletedDate: "2026-10-17" });
  const writes: string[] = [];
  const update = async (q: Quest) => { writes.push("reset"); return { ...q, done: false, updatedAt: "new-version" }; };
  const score = async (q: Quest) => { writes.push("score:" + q.updatedAt); return { ...q, done: !q.done, lastCompletedDate: TODAY }; };
  const saved = await completeToday(forDay(yesterday, TODAY), yesterday, TODAY, update, score);
  assert.equal(saved.done, true);
  assert.deepEqual(writes, ["reset", "score:new-version"]);
  await assert.rejects(completeToday(yesterday, { ...yesterday, updatedAt: "new-version" }, TODAY, update, score), /quest_conflict/);
  assert.equal(writes.length, 2);
  await assert.rejects(completeToday({ ...yesterday, lastCompletedDate: TODAY }, { ...yesterday, lastCompletedDate: TODAY }, TODAY, update, score), /already_completed/);
  await assert.rejects(completeToday(yesterday, yesterday, TODAY, async () => { throw new Error("offline"); }, score), /offline/);
  assert.equal(writes.length, 2);
});
test("the calendar keeps scored one-off completions but excludes manually archived tasks", () => {
  const scored = quest("scored", { scheduledDate: TODAY, done: true, lifecycleState: "archived", lastCompletedDate: TODAY });
  const putAway = quest("put-away", { scheduledDate: TODAY, done: true, lifecycleState: "archived", lastCompletedDate: "" });
  assert.deepEqual(dayPlan([scored, putAway], TODAY).anytime.map(q => q.id), ["scored"]);
});
