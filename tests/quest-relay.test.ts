import test from "node:test";
import assert from "node:assert/strict";
import { createQuest, getQuest, migrateState, patchQuest } from "../server/questforge-domain.ts";
import { setQuestRelay, advanceQuestRelay } from "../server/quest-relay.ts";
import { preserveRelayState, respondHumanReview } from "../server/human-requests.ts";
import { asQuestForgeState, hasErrorCode } from "./test-helpers.ts";

const policies = [{ agentId: "cyan", displayName: "Cyan", reviewRequired: false }, { agentId: "scarlet", displayName: "Scarlet", reviewRequired: false }];
const human = { ownerId: "owner", requester: { type: "human" as const, id: "owner", label: "Owner" }, agents: policies };
const agent = (id: string) => ({ ...human, requester: { type: "agent" as const, id, label: id }, source: "mcp" });
function fixture(check = false) {
  const state = asQuestForgeState({ schemaVersion: 7, tasks: [], taskEvents: [], character: {}, battle: {}, boss: {} }); migrateState(state);
  const quest = createQuest(state, { kind: "todo", title: "Build", assignee: { type: "agent", id: "cyan", label: "Cyan", handoffState: "working" } });
  const configured = setQuestRelay(state, quest.id, { legs: [{ agentId: "cyan", ask: "Build", check }, { agentId: "scarlet", ask: "Review", check: false }], dryRun: false, expectedUpdatedAt: quest.updatedAt }, human).quest;
  return { state, quest: configured };
}

test("a sequential relay persists reports and advances once, with a final real human check", () => {
  const { state, quest } = fixture();
  const input = { legId: quest.relay!.legs[0]!.id, operationId: "build", note: "Built", expectedUpdatedAt: quest.updatedAt, dryRun: false };
  const preview = advanceQuestRelay(state, quest.id, { ...input, dryRun: true }, agent("cyan"));
  assert.equal(preview.quest.relay!.at, 1); assert.equal(getQuest(state, quest.id).quest.relay!.at, 0);
  const next = advanceQuestRelay(state, quest.id, input, agent("cyan")).quest;
  assert.equal(next.assignee.id, "scarlet"); assert.equal(next.assignee.handoffState, "ready"); assert.equal(next.relay!.legs[0]!.note, "Built");
  assert.equal(advanceQuestRelay(state, quest.id, input, agent("cyan")).reused, true);
  const submitted = advanceQuestRelay(state, quest.id, { legId: next.relay!.legs[1]!.id, operationId: "review", note: "Reviewed", expectedUpdatedAt: next.updatedAt, dryRun: false }, agent("scarlet"));
  assert.equal(submitted.reviewRequired, true); assert.equal(submitted.quest.assignee.handoffState, "review_required");
  const request = state.tasks.find(q => q.id === submitted.quest.relay!.legs[1]!.reviewQuestId)!;
  respondHumanReview(state, request.id, { action: "approve", response: "OK", confirmed: true, expectedUpdatedAt: request.updatedAt, dryRun: false }, human);
  const approved = getQuest(state, quest.id).quest;
  const finished = advanceQuestRelay(state, quest.id, { legId: approved.relay!.legs[1]!.id, operationId: "accepted", expectedUpdatedAt: approved.updatedAt, dryRun: false }, agent("scarlet")).quest;
  assert.equal(finished.relay!.at, 2); assert.equal(finished.assignee.handoffState, "accepted"); assert.equal(finished.done, false);
});

test("started stages and legacy snapshots cannot rewrite relay identity or reports", () => {
  const { state, quest } = fixture();
  assert.throws(() => setQuestRelay(state, quest.id, { legs: [{ agentId: "scarlet", ask: "changed", check: false }], dryRun: false, expectedUpdatedAt: quest.updatedAt }, human), e => hasErrorCode(e, "relay_stage_started"));
  assert.throws(() => advanceQuestRelay(state, quest.id, { legId: quest.relay!.legs[0]!.id, operationId: "wrong", note: "bad", expectedUpdatedAt: quest.updatedAt, dryRun: false }, agent("scarlet")), e => hasErrorCode(e, "quest_assignee_mismatch"));
  const incoming = structuredClone(state); delete incoming.tasks[0]!.relay; incoming.tasks[0]!.assignee.id = "forged";
  incoming.tasks[0]!.done = true; incoming.tasks[0]!.lifecycleState = "completed";
  const preserved = preserveRelayState(incoming, state);
  assert.deepEqual(preserved.tasks[0]!.relay, state.tasks[0]!.relay); assert.equal(preserved.tasks[0]!.assignee.id, "cyan");
  assert.equal(preserved.tasks[0]!.done, false); assert.equal(preserved.tasks[0]!.lifecycleState, "active");
  assert.throws(() => patchQuest(state, quest.id, { lifecycleState: "completed" }), e => hasErrorCode(e, "relay_incomplete"));
  assert.ok(preserveRelayState({ ...incoming, tasks: [] }, state).tasks.some(q => q.id === quest.id));
});

test("legacy snapshots retain original Quests referenced by private images", () => {
  const { state } = fixture();
  const source = createQuest(state, { kind: "todo", title: "Image source" });
  const incoming = structuredClone(state); incoming.tasks = incoming.tasks.filter(quest => quest.id !== source.id);
  assert.ok(preserveRelayState(incoming, state, [source.id]).tasks.some(quest => quest.id === source.id));
});

test("Registry review requirements override an unchecked stage and revisions retain earlier answers", () => {
  const { state, quest } = fixture();
  const context = { ...agent("cyan"), agents: policies.map(p => ({ ...p, reviewRequired: true })) };
  const first = advanceQuestRelay(state, quest.id, { legId: quest.relay!.legs[0]!.id, operationId: "r1", note: "first", expectedUpdatedAt: quest.updatedAt, dryRun: false }, context);
  const request = state.tasks.find(q => q.id === first.quest.relay!.legs[0]!.reviewQuestId)!;
  respondHumanReview(state, request.id, { action: "revise", response: "Change it", confirmed: true, expectedUpdatedAt: request.updatedAt, dryRun: false }, human);
  const current = getQuest(state, quest.id).quest;
  const second = advanceQuestRelay(state, quest.id, { legId: current.relay!.legs[0]!.id, operationId: "r2", note: "fixed", expectedUpdatedAt: current.updatedAt, dryRun: false }, context);
  assert.notEqual(second.quest.relay!.legs[0]!.reviewQuestId, request.id);
  assert.equal(state.tasks.find(q => q.id === request.id)!.humanRequest!.response, "Change it");
});
