import test from "node:test";
import assert from "node:assert/strict";
import { createQuest, getQuest, migrateState, patchQuest, scoreQuest } from "../server/questforge-domain.ts";
import { listHumanRequests, preserveRelayState, requestHumanReview, respondHumanReview, type RelayContext } from "../server/human-requests.ts";
import { asQuestForgeState, hasErrorCode } from "./test-helpers.ts";

const human: RelayContext = { ownerId: "owner", requester: { type: "human", id: "owner", label: "Owner" }, source: "web" };
const agent: RelayContext = { ownerId: "owner", requester: { type: "agent", id: "cyan", label: "Cyan" }, source: "mcp" };
function fixture() {
  const state = asQuestForgeState({ schemaVersion: 7, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {}, character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] }, battle: { mp: 0, maxMp: 80 }, boss: { hp: 100, maxHp: 100 } });
  migrateState(state);
  const source = createQuest(state, { kind: "todo", title: "Implement navigation", assignee: { type: "agent", id: "cyan", label: "Cyan", handoffState: "working" } }, { ...human, returnEvent: true }).quest;
  const input = { requestKey: "menu-review-1", title: "Check the menu on your phone", reason: "Touch target comfort needs your feedback.", checkTarget: "Open the mobile menu, then close it with one hand.", completionCriteria: "Report whether it feels comfortable and any needed changes.", artifactUrl: "https://preview.example/menu", expectedUpdatedAt: source.updatedAt, dryRun: false };
  return { state, source, input };
}

test("requester is trusted metadata and legacy authors stay unknown", () => {
  const { state, source } = fixture();
  assert.deepEqual(source.requester, human.requester);
  assert.throws(() => createQuest(state, { kind: "todo", title: "forged", requester: agent.requester }), (e) => hasErrorCode(e, "relay_metadata_readonly"));
  delete state.tasks[0].requester;
  assert.equal(getQuest(state, source.id).quest.requester, null);
});

test("request preview is isolated; execute/retry preserves one independent Quest", () => {
  const { state, source, input } = fixture();
  const before = structuredClone(state);
  assert.equal(requestHumanReview(state, source.id, { ...input, dryRun: true }, agent).dryRun, true);
  assert.deepEqual(state, before);
  const first = requestHumanReview(state, source.id, input, agent);
  const after = structuredClone(state);
  const replay = requestHumanReview(state, source.id, input, agent);
  assert.equal(replay.reused, true);
  assert.equal(replay.quest.id, first.quest.id);
  assert.deepEqual(state, after);
  assert.equal(first.quest.parentQuestId, "");
  assert.equal(first.quest.humanRequest?.sourceQuestId, source.id);
  assert.deepEqual(first.quest.requester, agent.requester);
  assert.equal(getQuest(state, source.id).quest.done, false);
  assert.throws(() => requestHumanReview(state, source.id, { ...input, title: "Changed" }, agent), (e) => hasErrorCode(e, "request_key_conflict"));
  assert.throws(() => requestHumanReview(state, source.id, { ...input, requestKey: "another" }, agent), (e) => hasErrorCode(e, "human_request_pending"));
});

test("stale writes, unlinked/wrong Agents, and unsafe artifact links are rejected", () => {
  const { state, source, input } = fixture();
  assert.throws(() => requestHumanReview(state, source.id, { ...input, expectedUpdatedAt: "stale" }, agent), (e) => hasErrorCode(e, "quest_conflict"));
  assert.throws(() => requestHumanReview(state, source.id, input, { ...agent, requester: null }), (e) => hasErrorCode(e, "requester_required"));
  assert.throws(() => requestHumanReview(state, source.id, input, { ...agent, requester: { type: "agent", id: "other", label: "Other" } }), (e) => hasErrorCode(e, "quest_assignee_mismatch"));
  for (const artifactUrl of ["javascript:alert(1)", "https://user:password@example.com/", "http://example.com/"]) assert.throws(() => requestHumanReview(state, source.id, { ...input, artifactUrl }, agent), (e) => hasErrorCode(e, "invalid_artifact_url"));
  assert.equal(state.tasks.length, 1);
});

test("seen, deferred, and resumed requests stay open and persist across serialization", () => {
  const { state, source, input } = fixture();
  let quest = requestHumanReview(state, source.id, input, agent).quest;
  for (const action of ["seen", "defer", "resume"]) {
    quest = respondHumanReview(state, quest.id, { action, expectedUpdatedAt: quest.updatedAt, dryRun: false }, human).quest;
    assert.equal(quest.done, false);
    assert.ok(quest.humanRequest?.seenAt);
    assert.equal(quest.humanRequest?.status, action === "defer" ? "deferred" : "pending");
  }
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(listHumanRequests(reloaded).total, 1);
  assert.equal(listHumanRequests(reloaded, { status: "answered" }).total, 0);
});

test("only an explicit human response completes a request; original work remains separate", () => {
  const { state, source, input } = fixture();
  const quest = requestHumanReview(state, source.id, input, agent).quest;
  const response = { action: "approve", confirmed: true, expectedUpdatedAt: quest.updatedAt, dryRun: false, response: "Checked on my phone." };
  assert.throws(() => respondHumanReview(state, quest.id, response, agent), (e) => hasErrorCode(e, "human_response_required"));
  assert.throws(() => respondHumanReview(state, quest.id, { ...response, confirmed: false }, human), (e) => hasErrorCode(e, "human_confirmation_required"));
  assert.throws(() => patchQuest(state, quest.id, { assignee: { type: "agent", id: "cyan", label: "Cyan" } }), (e) => hasErrorCode(e, "human_request_managed"));
  assert.throws(() => scoreQuest(state, quest.id, "up"), (e) => hasErrorCode(e, "human_response_required"));
  const result = respondHumanReview(state, quest.id, response, human);
  assert.equal(result.quest.done, true);
  assert.equal(result.quest.humanRequest?.status, "answered");
  assert.equal(getQuest(state, source.id).quest.done, false);
  assert.equal(getQuest(state, source.id).quest.assignee.handoffState, "working");
  const after = structuredClone(state);
  assert.equal(respondHumanReview(state, quest.id, response, human).reused, true);
  assert.deepEqual(state, after, "replayed answers must not grant another reward or event");
});

test("text feedback survives a new review round without rewriting the previous answer", () => {
  const { state, source, input } = fixture();
  const quest = requestHumanReview(state, source.id, input, agent).quest;
  assert.throws(() => respondHumanReview(state, quest.id, { action: "revise", confirmed: true, response: "", dryRun: false, expectedUpdatedAt: quest.updatedAt }, human), (e) => hasErrorCode(e, "invalid_response"));
  const feedback = "Please increase the close button.\n".repeat(25);
  respondHumanReview(state, quest.id, { action: "revise", confirmed: true, response: feedback, dryRun: false, expectedUpdatedAt: quest.updatedAt }, human);
  const second = requestHumanReview(state, source.id, { ...input, requestKey: "menu-review-2" }, agent).quest;
  assert.notEqual(second.id, quest.id);
  assert.equal(getQuest(state, quest.id).quest.humanRequest?.response, feedback.trim());
  assert.equal(listHumanRequests(state, { status: "all", sourceQuestId: source.id }).total, 2);
});

test("old client snapshots preserve review records and cannot forge requester metadata", () => {
  const { state, source, input } = fixture();
  const oldSnapshot = structuredClone(state);
  const quest = requestHumanReview(state, source.id, input, agent).quest;
  oldSnapshot.tasks[0].requester = agent.requester;
  const merged = preserveRelayState(oldSnapshot, state);
  assert.deepEqual(getQuest(merged, source.id).quest.requester, human.requester);
  assert.deepEqual(getQuest(merged, quest.id).quest.humanRequest, quest.humanRequest);
  assert.ok(merged.taskEvents.some((event) => event.type === "quest.human_request.created"));
  const forged = structuredClone(state);
  forged.tasks.find((item) => item.id === quest.id)!.humanRequest!.status = "answered";
  assert.equal(getQuest(preserveRelayState(forged, state), quest.id).quest.humanRequest?.status, "pending");
  assert.throws(() => preserveRelayState(asQuestForgeState({ tasks: null }), state), (e) => hasErrorCode(e, "invalid_state"));
});
