import test from "node:test";
import assert from "node:assert/strict";
import { createQuest, getQuest, listQuestPage, migrateState, scoreQuest } from "../server/questforge-domain.ts";
import { forDay, onDay, bucketOf } from "../interaction-lab/all-for-adhd/model.ts";
import { calendarItems } from "../shared/productivity.ts";
import { occursOnDate } from "../shared/quest-schedule.ts";
import { reminderJobs, DEFAULT_SETTINGS } from "../worker/src/notifications.ts";
import { asQuestForgeState } from "./test-helpers.ts";

test("weekday, weekly and month-end projections agree across UI, MCP views, calendar and reminders", () => {
  const state = asQuestForgeState({ schemaVersion: 7 }); migrateState(state);
  const weekday = createQuest(state, { kind: "todo", title: "Weekdays", planningState: "scheduled", scheduledDate: "2026-10-30", scheduledTime: "10:00", repeat: "weekdays" });
  assert.equal(occursOnDate(weekday, "2026-10-31"), false); assert.equal(onDay(weekday, "2026-11-02"), true);
  assert.equal(bucketOf(weekday, "2026-10-31"), "later");
  assert.equal(listQuestPage(state, { view: "today", date: "2026-10-31" }).quests.length, 0);
  assert.equal(listQuestPage(state, { view: "today", date: "2026-11-02" }).quests.length, 1);
  const weekly = createQuest(state, { kind: "todo", title: "Friday", planningState: "scheduled", scheduledDate: "2026-10-30", repeat: "weekly" });
  assert.equal(occursOnDate(weekly, "2026-11-06"), true); assert.equal(occursOnDate(weekly, "2026-11-05"), false);
  const monthly = createQuest(state, { kind: "todo", title: "Month end", planningState: "scheduled", scheduledDate: "2026-01-31", repeat: "monthly" });
  assert.equal(occursOnDate(monthly, "2026-02-28"), true); assert.equal(occursOnDate(monthly, "2026-03-31"), true);
  const days = calendarItems([weekday], [], "2026-10-30", "2026-11-03", "Asia/Tokyo").map(item => item.date);
  assert.deepEqual(days, ["2026-10-30", "2026-11-02", "2026-11-03"]);
  const jobs = reminderJobs("owner", state, { ...DEFAULT_SETTINGS, timeZone: "Asia/Tokyo" }, Date.parse("2026-11-01T00:00:00Z"));
  assert.ok(jobs.some(job => job.fireAt === Date.parse("2026-11-02T01:00:00Z")));
});

test("recurring To Dos return on their next date and reward once per completed occurrence, preserving old claims", () => {
  const state = asQuestForgeState({ schemaVersion: 7 }); migrateState(state);
  const quest = createQuest(state, { kind: "todo", title: "Weekly", planningState: "scheduled", scheduledDate: "2026-10-23", dueDate: "2026-10-23", repeat: "weekly" });
  assert.equal(scoreQuest(state, quest.id, "up", { date: "2026-10-23" }).rewardGranted, true);
  const next = getQuest(state, quest.id).quest;
  assert.equal(forDay(next, "2026-10-30").done, false);
  assert.equal(scoreQuest(state, quest.id, "up", { date: "2026-10-30" }).rewardGranted, true);
  scoreQuest(state, quest.id, "up", { date: "2026-10-30" });
  assert.equal(scoreQuest(state, quest.id, "up", { date: "2026-10-30" }).rewardGranted, false);
  delete state.rewardClaims[`${quest.id}:todo:2026-10-30`];
  scoreQuest(state, quest.id, "up", { date: "2026-10-30" });
  assert.equal(scoreQuest(state, quest.id, "up", { date: "2026-10-30" }).rewardGranted, false);
});
