const test = require("node:test");
const assert = require("node:assert/strict");
import type { QuestForgeState } from "../types/questforge.ts";
import { asQuestForgeState, hasErrorCode } from "./test-helpers.ts";

function emptyState(): QuestForgeState {
  const now = "2026-10-01T00:00:00.000Z";
  return asQuestForgeState({ schemaVersion: 7, createdAt: now, updatedAt: now, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 }, battle: { mp: 0, maxMp: 80 } });
}

test("a Quest's emoji is one grapheme and an Agent never replaces the person's choice", async () => {
  const { createQuest, patchQuest } = await import("../server/questforge-domain.ts");
  const state = emptyState();
  const auto = createQuest(state, { kind: "todo", title: "Dentist", icon: "🦷", iconSource: "auto" });
  assert.deepEqual([auto.icon, auto.iconSource], ["🦷", "auto"]);
  assert.equal(createQuest(state, { kind: "todo", title: "Plain" }).icon, "");
  for (const icon of ["🦷🦷", "a", "犬", "🦷".repeat(9)]) {
    assert.throws(() => createQuest(state, { kind: "todo", title: "Bad", icon }), (error: unknown) => hasErrorCode(error, "invalid_icon"));
  }
  assert.equal(createQuest(state, { kind: "todo", title: "Cook", icon: "👩‍🍳" }).iconSource, "user");

  const byAgent = patchQuest(state, auto.id, { icon: "🏥" }, { source: "mcp" });
  assert.deepEqual([byAgent.icon, byAgent.iconSource], ["🏥", "agent"]);
  const byPerson = patchQuest(state, auto.id, { icon: "🪥", iconSource: "user" });
  assert.equal(byPerson.iconSource, "user");
  assert.throws(() => patchQuest(state, auto.id, { icon: "💊" }, { source: "mcp" }), (error: unknown) => hasErrorCode(error, "icon_set_by_user"));
  assert.equal(patchQuest(state, auto.id, { icon: "" }).iconSource, "");
});

test("an Agent proposes a slot; the person can only clear it", async () => {
  const { createQuest, patchQuest, proposeQuestSlot } = await import("../server/questforge-domain.ts");
  const state = emptyState();
  const quest = createQuest(state, { kind: "todo", title: "Return the book" });
  const agent = { id: "astra", label: "Astra" };
  for (const [input, code] of [[{ date: "2026-10-26", time: "14:00", minutes: 2 }, "invalid_minutes"], [{ date: "26/10", time: "14:00", minutes: 30 }, "invalid_date"], [{ date: "2026-10-26", time: "", minutes: 30 }, "invalid_time"]] as const) {
    assert.throws(() => proposeQuestSlot(state, quest.id, input, { agent }), (error: unknown) => hasErrorCode(error, code));
  }
  const proposed = proposeQuestSlot(state, quest.id, { date: "2026-10-26", time: "14:00", minutes: 30, note: "Library is quiet then", expectedUpdatedAt: quest.updatedAt }, { source: "mcp", agent }).quest;
  assert.deepEqual({ ...proposed.proposal, createdAt: "" }, { agentId: "astra", label: "Astra", date: "2026-10-26", time: "14:00", minutes: 30, note: "Library is quiet then", createdAt: "" });
  assert.equal(proposed.scheduledTime, "", "nothing is scheduled until the person accepts");
  assert.throws(() => patchQuest(state, quest.id, { proposal: { date: "2026-10-27" } }), (error: unknown) => hasErrorCode(error, "proposal_readonly"));
  const accepted = patchQuest(state, quest.id, { scheduledDate: "2026-10-26", scheduledTime: "14:00", planningState: "scheduled", proposal: null });
  assert.equal(accepted.proposal, null);
  assert.equal(accepted.scheduledTime, "14:00");
});
