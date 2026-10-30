import type { Quest, QuestForgeState, QuestRelayLeg } from "../types/questforge.ts";
import { imageIds, nextQuestTimestamp } from "../shared/relay.ts";
import { createId, DomainError, getQuest, migrateState, type DomainEvent, type DomainInput } from "./questforge-domain.ts";
import { requestHumanReview, type RelayContext } from "./human-requests.ts";
import { TASK_EVENT_LIMIT } from "../questforge-core.ts";

export interface RelayAgentPolicy { agentId: string; displayName: string; reviewRequired: boolean }
type Context = RelayContext & { agents: RelayAgentPolicy[] };

function work(state: QuestForgeState, id: string): Quest {
  const quest = state.tasks.find(item => item.id === id);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  if (quest.kind === "reward" || quest.humanRequest || quest.lifecycleState !== "active" || quest.done) throw new DomainError(409, "relay_quest_closed", "Use an active work Quest for a relay.");
  return quest;
}

function guard(quest: Quest, input: DomainInput): void {
  if (input.dryRun === false && !input.expectedUpdatedAt) throw new DomainError(400, "expected_updated_at_required", "Read the Quest before changing its relay.");
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== quest.updatedAt) throw new DomainError(409, "quest_conflict", "The relay changed. Read it again.");
}

function event(state: QuestForgeState, quest: Quest, type: string, context: Context): DomainEvent {
  quest.updatedAt = nextQuestTimestamp(quest.updatedAt);
  state.updatedAt = quest.updatedAt;
  const item = { id: createId("evt"), type, taskId: quest.id, taskKind: quest.kind, at: quest.updatedAt, createdAt: quest.updatedAt,
    source: context.source || "api", details: { at: quest.relay?.at, assignee: quest.assignee, actor: context.requester }, payload: { taskId: quest.id } };
  state.taskEvents = [item, ...state.taskEvents].slice(0, TASK_EVENT_LIMIT);
  return item;
}

function actor(quest: Quest, context: Context): void {
  if (!context.requester || (context.requester.type === "agent" && context.requester.id !== quest.assignee.id)) throw new DomainError(403, "quest_assignee_mismatch", "Only the current Agent or the owner may advance this relay.");
}

export function setQuestRelay(state: QuestForgeState, questId: string, input: DomainInput, context: Context) {
  const dryRun = input.dryRun !== false;
  const target = dryRun ? structuredClone(state) : state;
  migrateState(target);
  const quest = work(target, questId);
  guard(quest, input);
  actor(quest, context);
  if (!Array.isArray(input.legs) || input.legs.length > 6) throw new DomainError(400, "invalid_relay", "Use at most six relay stages.");
  const old = quest.relay;
  if (context.requester?.type === "agent" && !old && (input.legs[0] as Record<string, unknown> | undefined)?.agentId !== context.requester.id) throw new DomainError(403, "quest_assignee_mismatch", "The current Agent must remain the first stage.");
  const legs: QuestRelayLeg[] = input.legs.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DomainError(400, "invalid_relay", "A relay stage must be an object.");
    const leg = raw as Record<string, unknown>;
    if (old && index <= old.at) {
      const previous = old.legs[index];
      if (!previous || previous.agentId !== leg.agentId || previous.ask !== leg.ask || previous.check !== leg.check) throw new DomainError(409, "relay_stage_started", "Current and completed stages cannot be changed.");
      return structuredClone(previous);
    }
    const agent = context.agents.find(item => item.agentId === leg.agentId);
    if (!agent || typeof leg.ask !== "string" || leg.ask.length > 500 || typeof leg.check !== "boolean") throw new DomainError(400, "invalid_relay_stage", "Choose an active registered Agent and a request of at most 500 characters.");
    return { id: createId("leg"), agentId: agent.agentId, ask: leg.ask.trim(), check: leg.check, round: 0 };
  });
  if (old && legs.length <= old.at) throw new DomainError(409, "relay_stage_started", "Do not remove a started stage.");
  if (old && old.at >= old.legs.length) throw new DomainError(409, "relay_finished", "This relay has already finished.");
  quest.relay = legs.length ? { legs, at: old?.at || 0 } : null;
  if (!old && legs.length) {
    const first = context.agents.find(item => item.agentId === legs[0]!.agentId)!;
    quest.assignee = { type: "agent", id: first.agentId, label: first.displayName, handoffState: "ready" };
    quest.handoff = { note: legs[0]!.ask, blockedReason: "", artifactUrl: "", startedAt: "", reviewRequestedAt: "", reviewedAt: "", reviewedBy: "" };
    quest.assignmentReadyFor = `agent:${first.agentId}`;
  } else if (!old && !legs.length) {
    quest.assignee = { type: "self", id: "self", label: "Human", handoffState: "none" };
    quest.assignmentReadyFor = "";
  }
  const savedEvent = event(target, quest, "quest.relay.configured", context);
  return { dryRun, quest: getQuest(target, questId).quest, events: [savedEvent] };
}

export function advanceQuestRelay(state: QuestForgeState, questId: string, input: DomainInput, context: Context) {
  const dryRun = input.dryRun !== false;
  const target = dryRun ? structuredClone(state) : state;
  migrateState(target);
  const quest = work(target, questId);
  const relay = quest.relay;
  if (!relay) throw new DomainError(409, "relay_missing", "Configure this Quest's relay first.");
  const operationId = String(input.operationId || "");
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(operationId)) throw new DomainError(400, "operation_id_required", "Use a stable operationId for this submission.");
  const prior = relay.legs.find(leg => leg.id === input.legId && leg.operationId === operationId);
  if (prior && (input.note !== undefined && input.note !== prior.note || input.attachmentIds !== undefined && JSON.stringify(input.attachmentIds) !== JSON.stringify(prior.attachmentIds || []))) throw new DomainError(409, "relay_operation_conflict", "Use a new operationId for a changed report.");
  if (prior?.completedAt) {
    if (context.requester?.type !== "human" && context.requester?.id !== prior.agentId) throw new DomainError(403, "quest_assignee_mismatch", "This submission belongs to another Agent.");
    return { dryRun, reused: true, quest: getQuest(target, questId).quest, events: [] };
  }
  if (prior?.reviewQuestId) {
    const request = target.tasks.find(item => item.id === prior.reviewQuestId)?.humanRequest;
    if (request && (request.status !== "answered" || request.outcome === "changes_requested")) {
      actor(quest, context);
      return { dryRun, reused: true, reviewRequired: request.status !== "answered", changesRequested: request.outcome === "changes_requested", quest: getQuest(target, questId).quest, events: [] };
    }
  }
  guard(quest, input);
  actor(quest, context);
  const leg = relay.legs[relay.at];
  if (!leg || leg.id !== input.legId || leg.agentId !== quest.assignee.id) throw new DomainError(409, "relay_stage_conflict", "Read the current relay stage before submitting work.");
  const policy = context.agents.find(agent => agent.agentId === leg.agentId);
  if (!policy) throw new DomainError(409, "agent_inactive", "The current Agent is unavailable.");
  let reviewed = false;
  const review = leg.reviewQuestId ? target.tasks.find(item => item.id === leg.reviewQuestId)?.humanRequest : null;
  if (review) {
    if (review.status !== "answered") {
      if (leg.operationId !== operationId) throw new DomainError(409, "human_request_pending", "Wait for the human's saved answer.");
      return { dryRun, reused: true, reviewRequired: true, quest: getQuest(target, questId).quest, events: [] };
    }
    if (review.outcome === "approved") reviewed = true;
    else {
      if (leg.operationId === operationId) return { dryRun, reused: true, changesRequested: true, quest: getQuest(target, questId).quest, events: [] };
      leg.round += 1;
      delete leg.reviewQuestId;
    }
  }
  if (!reviewed) {
    if (typeof input.note !== "string" || !input.note.trim() || input.note.length > 500) throw new DomainError(400, "relay_report_required", "Describe the result in 1 to 500 characters.");
    leg.note = input.note.trim();
    leg.attachmentIds = imageIds(input.attachmentIds);
    leg.operationId = operationId;
    if (leg.check || policy.reviewRequired || relay.at === relay.legs.length - 1) {
      quest.assignee.handoffState = "review_required";
      quest.handoff.note = leg.note;
      quest.handoff.reviewRequestedAt = nextQuestTimestamp(quest.updatedAt);
      const staged = event(target, quest, "quest.handoff.transitioned", context);
      const request = requestHumanReview(target, questId, { requestKey: `relay:${leg.id}:${leg.round}`, title: quest.title.slice(0, 60) + " · Review",
        reason: leg.note, checkTarget: leg.ask || quest.title, completionCriteria: "Approve the result or describe the changes needed.", attachmentIds: leg.attachmentIds,
        expectedUpdatedAt: quest.updatedAt, dryRun: false }, context);
      leg.reviewQuestId = request.quest.id;
      // requestHumanReview normalizes all Quests; update its saved copy, not the detached one.
      target.tasks.find(item => item.id === questId)!.relay!.legs[relay.at]!.reviewQuestId = request.quest.id;
      return { dryRun, reused: false, reviewRequired: true, quest: getQuest(target, questId).quest, request: request.quest, events: [staged, ...request.events] };
    }
  }
  leg.operationId = operationId;
  leg.completedAt = nextQuestTimestamp(quest.updatedAt);
  leg.completedBy = context.requester!;
  relay.at += 1;
  const next = relay.legs[relay.at];
  if (next) {
    const agent = context.agents.find(item => item.agentId === next.agentId);
    if (!agent) throw new DomainError(409, "agent_inactive", "The next Agent is unavailable. Edit the unstarted stages first.");
    quest.assignee = { type: "agent", id: agent.agentId, label: agent.displayName, handoffState: "ready" };
    quest.handoff = { note: next.ask, blockedReason: "", artifactUrl: "", startedAt: "", reviewRequestedAt: "", reviewedAt: "", reviewedBy: "" };
    quest.assignmentReadyFor = `agent:${agent.agentId}`;
  } else {
    quest.assignee.handoffState = "accepted";
    quest.handoff.reviewedAt = leg.completedAt;
    quest.handoff.reviewedBy = context.ownerId;
    quest.assignmentReadyFor = "";
  }
  const savedEvent = event(target, quest, "quest.relay.advanced", context);
  return { dryRun, reused: false, quest: getQuest(target, questId).quest, events: [savedEvent] };
}
