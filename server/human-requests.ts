import type { HumanRequest, Quest, QuestForgeState, QuestRequester } from "../types/questforge.ts";
import { normalizeRequester } from "../shared/relay.ts";
import { createId, createQuest, DomainError, getQuest, migrateState, scoreQuest, type DomainContext, type DomainEvent, type DomainInput, type DomainRecord } from "./questforge-domain.ts";

export interface RelayContext extends DomainContext {
  ownerId: string;
  requester: QuestRequester | null;
}

export interface HumanReviewResult extends DomainRecord {
  dryRun: boolean;
  reused: boolean;
  quest: Quest;
  events: DomainEvent[];
}

function text(input: DomainInput, key: string, max: number, required = false): string {
  const value = input[key];
  if (value !== undefined && typeof value !== "string") throw new DomainError(400, `invalid_${key}`, `${key} must be text.`);
  const result = String(value || "").trim();
  if ((required && !result) || result.length > max) throw new DomainError(400, `invalid_${key}`, `${key} must contain ${required ? "1" : "0"} to ${max} characters.`);
  return result;
}

function expected(quest: Quest, input: DomainInput, dryRun: boolean): void {
  if (!dryRun && !input.expectedUpdatedAt) throw new DomainError(400, "expected_updated_at_required", "Read this Quest and include expectedUpdatedAt before writing.");
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== quest.updatedAt) throw new DomainError(409, "quest_conflict", "The Quest changed. Read it again before retrying.");
}

function timestamp(previous: string): string {
  return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
}

function humanEvent(state: QuestForgeState, quest: Quest, type: string, context: RelayContext): DomainEvent {
  const event = { id: createId("evt"), type, taskId: quest.id, taskKind: quest.kind, at: quest.updatedAt, createdAt: quest.updatedAt, source: context.source || "api", details: { sourceQuestId: quest.humanRequest?.sourceQuestId, status: quest.humanRequest?.status, outcome: quest.humanRequest?.outcome }, payload: { taskId: quest.id } };
  state.taskEvents = [event, ...state.taskEvents];
  state.updatedAt = quest.updatedAt;
  return event;
}

export function requestHumanReview(state: QuestForgeState, sourceQuestId: string, input: DomainInput, context: RelayContext): HumanReviewResult {
  const dryRun = input.dryRun !== false;
  const target = dryRun ? structuredClone(state) : state;
  migrateState(target);
  const source = getQuest(target, sourceQuestId).quest;
  if (source.kind === "reward" || source.assignee.type !== "agent") throw new DomainError(409, "agent_assignee_required", "A confirmation request must refer to an Agent-assigned work Quest.");
  const requester = normalizeRequester(context.requester);
  if (!requester || !context.ownerId) throw new DomainError(403, "requester_required", "Link this connection to a registered Agent before requesting a human review.");
  if (requester.type === "agent" && requester.id !== source.assignee.id) throw new DomainError(403, "quest_assignee_mismatch", "Only the assigned Agent may request this review.");
  const requestKey = text(input, "requestKey", 120, true);
  const reason = text(input, "reason", 1000, true);
  const checkTarget = text(input, "checkTarget", 1000, true);
  const title = text(input, "title", 80, true);
  const completionCriteria = text(input, "completionCriteria", 300, true);
  const artifactUrl = text(input, "artifactUrl", 500);
  if (artifactUrl) {
    let valid = false;
    try { const url = new URL(artifactUrl); valid = url.protocol === "https:" && !url.username && !url.password; } catch { /* Reject malformed URLs. */ }
    if (!valid) throw new DomainError(400, "invalid_artifact_url", "The external review link must use HTTPS without credentials.");
  }
  const existing = target.tasks.find((quest) => quest.humanRequest?.sourceQuestId === sourceQuestId && quest.humanRequest.requestKey === requestKey);
  if (existing) {
    const previous = existing.humanRequest!;
    if (existing.title !== title || existing.completionCriteria !== completionCriteria || previous.reason !== reason || previous.checkTarget !== checkTarget || previous.artifactUrl !== artifactUrl || existing.requester?.id !== requester.id || existing.requester.type !== requester.type) {
      throw new DomainError(409, "request_key_conflict", "This requestKey already identifies a different request.");
    }
    return { dryRun, reused: true, quest: getQuest(target, existing.id).quest, events: [] };
  }
  expected(source, input, dryRun);
  if (source.done || source.lifecycleState !== "active") throw new DomainError(409, "source_quest_closed", "Reopen the work Quest before requesting another review.");
  if (target.tasks.some((quest) => quest.humanRequest?.sourceQuestId === sourceQuestId && quest.humanRequest.status !== "answered")) {
    throw new DomainError(409, "human_request_pending", "A pending or deferred request already exists for this work. Resume that request.");
  }
  const result = createQuest(target, { kind: "todo", title, notes: reason.slice(0, 180), category: source.category, completionCriteria, planningState: "backlog", difficulty: "easy", tags: [...source.tags.filter((tag) => tag !== "human-review").slice(0, 5), "human-review"], assignee: { type: "self", id: "self", label: "自分", handoffState: "none" } }, { ...context, requester, returnEvent: true });
  const quest = target.tasks.find((item) => item.id === result.quest.id)!;
  quest.humanRequest = { sourceQuestId, requestKey, recipientId: context.ownerId, reason, checkTarget, artifactUrl, status: "pending", seenAt: "", respondedAt: "", response: "", outcome: "" };
  const event = humanEvent(target, quest, "quest.human_request.created", context);
  return { dryRun, reused: false, quest: getQuest(target, quest.id).quest, events: [...result.events, event] };
}

export function listHumanRequests(state: QuestForgeState, input: DomainInput = {}): DomainRecord {
  migrateState(state);
  const status = String(input.status || "pending");
  if (!["pending", "deferred", "answered", "all"].includes(status)) throw new DomainError(400, "invalid_request_status", "Unknown human request status.");
  let quests = state.tasks.filter((quest) => quest.humanRequest && (status === "all" || quest.humanRequest.status === status));
  if (input.sourceQuestId) quests = quests.filter((quest) => quest.humanRequest?.sourceQuestId === input.sourceQuestId);
  quests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 50));
  const offset = Math.max(0, Number(input.cursor) || 0);
  return { quests: quests.slice(offset, offset + limit).map((quest) => getQuest(state, quest.id).quest), total: quests.length, limit, nextCursor: offset + limit < quests.length ? String(offset + limit) : null };
}

export function respondHumanReview(state: QuestForgeState, questId: string, input: DomainInput, context: RelayContext): HumanReviewResult {
  const dryRun = input.dryRun !== false;
  const target = dryRun ? structuredClone(state) : state;
  migrateState(target);
  const quest = target.tasks.find((item) => item.id === questId);
  if (!quest?.humanRequest) throw new DomainError(404, "human_request_not_found", "Human request not found.");
  const request = quest.humanRequest;
  if (context.requester?.type !== "human" || context.requester.id !== request.recipientId || context.ownerId !== request.recipientId) throw new DomainError(403, "human_response_required", "Only the intended human may answer this request.");
  const action = String(input.action || "");
  if (!["seen", "defer", "resume", "approve", "revise"].includes(action)) throw new DomainError(400, "invalid_response_action", "Unknown human response action.");
  const response = text(input, "response", 2000, action === "revise");
  const outcome: HumanRequest["outcome"] = action === "approve" ? "approved" : action === "revise" ? "changes_requested" : "";
  if (outcome && input.confirmed !== true) throw new DomainError(400, "human_confirmation_required", "Explicitly confirm that you checked the requested work.");
  if (request.status === "answered") {
    if (outcome && request.outcome === outcome && request.response === response) return { dryRun, reused: true, quest: getQuest(target, quest.id).quest, events: [] };
    throw new DomainError(409, "human_request_answered", "This request is already answered. Request a new review for a new round.");
  }
  expected(quest, input, dryRun);
  if ((action === "seen" && request.seenAt) || (action === "defer" && request.status === "deferred") || (action === "resume" && request.status === "pending")) return { dryRun, reused: true, quest: getQuest(target, quest.id).quest, events: [] };
  const now = timestamp(quest.updatedAt);
  request.seenAt ||= now;
  quest.updatedAt = now;
  if (action === "defer") request.status = "deferred";
  if (action === "resume") request.status = "pending";
  const events: DomainEvent[] = [];
  if (outcome) {
    request.status = "answered";
    request.response = response;
    request.outcome = outcome;
    request.respondedAt = now;
    const scored = scoreQuest(target, quest.id, "up", { ...context, allowHumanResponse: true });
    events.push(scored.event);
  }
  const stored = target.tasks.find((item) => item.id === quest.id)!;
  stored.updatedAt = now;
  events.push(humanEvent(target, stored, `quest.human_request.${outcome ? "answered" : action}`, context));
  return { dryRun, reused: false, quest: getQuest(target, quest.id).quest, events };
}

/** Preserve server-owned relay fields and review records when an older client uploads a snapshot. */
export function preserveRelayState(incoming: QuestForgeState, current: QuestForgeState | null): QuestForgeState {
  if (!Array.isArray(incoming.tasks) || incoming.tasks.some((quest) => !quest || typeof quest !== "object" || typeof quest.id !== "string")) throw new DomainError(400, "invalid_state", "State must contain a Quest array.");
  const result = structuredClone(incoming);
  result.rewardClaims ||= {};
  const currentById = new Map((current?.tasks || []).map((quest) => [quest.id, quest]));
  result.tasks = result.tasks.map((quest) => {
    const previous = currentById.get(quest.id);
    if (previous?.humanRequest) return structuredClone(previous);
    return { ...quest, requester: normalizeRequester(previous?.requester), humanRequest: null };
  });
  const present = new Set(result.tasks.map((quest) => quest.id));
  for (const quest of current?.tasks || []) if (quest.humanRequest && !present.has(quest.id)) result.tasks.push(structuredClone(quest));
  const reviewIds = new Set((current?.tasks || []).filter((quest) => quest.humanRequest).map((quest) => quest.id));
  const protectedEvents = (current?.taskEvents || []).filter((event) => reviewIds.has(String(event.taskId || "")));
  const protectedIds = new Set(protectedEvents.map((event) => event.id));
  result.taskEvents = [...protectedEvents, ...(result.taskEvents || []).filter((event) => !protectedIds.has(event.id))];
  // Confirmation rewards cannot be undone by a stale client's snapshot.
  if (current) for (const quest of current.tasks) if (quest.humanRequest) {
    for (const [key, value] of Object.entries(current.rewardClaims || {})) if (key.startsWith(`${quest.id}:`)) {
      if (result.rewardClaims[key] !== value) throw new DomainError(409, "state_conflict", "A human response was saved after this snapshot. Refresh before synchronizing.");
    }
  }
  return result;
}
