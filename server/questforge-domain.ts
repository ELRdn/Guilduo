// @ts-nocheck
import { createBattleSession, executeBattleCommand, normalizeBattleState } from "../shared/battle-rules.ts";

const CURRENT_SCHEMA_VERSION = 7;
const TASK_KINDS = new Set(["habit", "daily", "todo", "reward"]);
const DIFFICULTIES = new Set(["trivial", "easy", "medium", "hard"]);
const REPEATS = new Set(["none", "daily", "weekdays", "weekly", "monthly"]);
const PLANNING_STATES = new Set(["scheduled", "backlog"]);
const LIFECYCLE_STATES = new Set(["active", "completed", "archived"]);
const PLANNING_MODES = new Set(["on_date", "until_due"]);
const IMPACTS = new Set(["low", "medium", "high"]);
const QUEST_VIEWS = new Set(["today", "week", "future", "backlog", "completed", "archive", "all"]);
const ASSIGNEE_TYPES = new Set(["self", "human", "agent"]);
const HANDOFF_STATES = new Set(["none", "ready", "working", "blocked", "review_required", "accepted"]);
const TREE_KINDS = new Set(["habit", "daily", "todo"]);
const MAX_TREE_DEPTH = 8;
const HANDOFF_TRANSITIONS = new Map([
  ["none", new Set(["ready"])],
  ["ready", new Set(["working", "blocked"])],
  ["working", new Set(["blocked", "review_required"])],
  ["blocked", new Set(["working", "none"])],
  ["review_required", new Set(["accepted", "working"])],
  ["accepted", new Set(["none"])],
]);
const AGENT_ALIASES = new Map([
  ["chat-gpt", "chatgpt"], ["gpt", "chatgpt"], ["gpt-chat", "chatgpt"],
  ["gpt-codex", "codex"], ["openai-codex", "codex"], ["codex-cli", "codex"],
  ["claude-code", "claude"], ["anthropic-claude", "claude"],
  ["gemini-cli", "gemini"], ["google-gemini", "gemini"],
  ["open-claw", "openclaw"], ["openclaw-agent", "openclaw"],
  ["hermes-agent", "hermes"],
]);

export class DomainError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function todayText(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function createId(prefix = "q") {
  let value = globalThis.crypto?.randomUUID?.();
  if (!value && globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  if (!value) throw new DomainError(500, "secure_random_unavailable", "Secure random generation is unavailable.");
  return `${prefix}-${value}`;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function addDays(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return todayText(date);
}

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value) {
  return !value || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function normalizeExternalLink(link) {
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;
  const service = String(link.service || "").trim().slice(0, 40);
  const externalId = String(link.externalId || "").trim().slice(0, 160);
  if (!service || !externalId) return null;
  return {
    service,
    externalId,
    type: String(link.type || link.sourceType || "record").trim().slice(0, 80),
    sourceType: String(link.sourceType || link.type || "record").trim().slice(0, 80),
    url: String(link.url || "").trim().slice(0, 500),
    projectId: String(link.projectId || "").trim().slice(0, 160),
    organizationId: String(link.organizationId || "").trim().slice(0, 80),
    workspaceId: String(link.workspaceId || "").trim().slice(0, 80),
    taskId: String(link.taskId || "").trim().slice(0, 160),
    entryStartAt: String(link.entryStartAt || "").trim().slice(0, 40),
    entryStopAt: String(link.entryStopAt || "").trim().slice(0, 40),
    durationMinutes: nonNegativeInteger(link.durationMinutes),
    direction: String(link.direction || "").trim().slice(0, 30),
    syncedAt: String(link.syncedAt || "").trim().slice(0, 40),
    remoteUpdatedAt: String(link.remoteUpdatedAt || "").trim().slice(0, 40),
    localUpdatedAt: String(link.localUpdatedAt || "").trim().slice(0, 40),
    remoteEtag: String(link.remoteEtag || "").trim().slice(0, 240),
    syncStatus: ["synced", "conflict", "remote_missing", "unverified"].includes(link.syncStatus) ? link.syncStatus : "synced",
  };
}

function togglMinutes(task) {
  const entryLinks = (task.externalLinks || [])
    .filter((link) => link.type === "time_entry" || link.sourceType === "toggl.time_entry" || link.sourceType === "focus.time_entry");
  const focus = entryLinks
    .filter((link) => link.service === "toggl-focus")
    .reduce((sum, link) => sum + nonNegativeInteger(link.durationMinutes), 0);
  if (focus > 0) return focus;
  const linked = entryLinks
    .filter((link) => link.service === "toggl-track")
    .reduce((sum, link) => sum + nonNegativeInteger(link.durationMinutes), 0);
  return linked || nonNegativeInteger(task.togglActualMinutes);
}

function refreshActualMinutes(task) {
  task.manualActualMinutes = nonNegativeInteger(task.manualActualMinutes ?? task.actualMinutes);
  task.togglActualMinutes = togglMinutes(task);
  task.actualMinutes = task.togglActualMinutes > 0 ? task.togglActualMinutes : task.manualActualMinutes;
  return task;
}

function slugAgentId(value, label = "agent") {
  const raw = String(value || "").trim().toLocaleLowerCase();
  const slug = raw.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const fallbackRaw = String(label || "agent").trim().toLocaleLowerCase();
  const fallbackSlug = fallbackRaw.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "agent";
  return AGENT_ALIASES.get(slug) || slug || `custom-${fallbackSlug}`;
}

function customAgentId(rawId, label) {
  const source = String(rawId || "").trim().toLocaleLowerCase().startsWith("custom:")
    ? String(rawId).trim().slice(7)
    : label;
  const slug = String(source || "agent").trim().toLocaleLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "agent";
  return `custom:${slug}`;
}

function normalizeHandoff(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    note: String(input.note || "").trim().slice(0, 500),
    blockedReason: String(input.blockedReason || "").trim().slice(0, 500),
    artifactUrl: String(input.artifactUrl || "").trim().slice(0, 500),
    startedAt: String(input.startedAt || "").trim().slice(0, 40),
    reviewRequestedAt: String(input.reviewRequestedAt || "").trim().slice(0, 40),
    reviewedAt: String(input.reviewedAt || "").trim().slice(0, 40),
    reviewedBy: String(input.reviewedBy || "").trim().slice(0, 120),
  };
}

function normalizeAssignee(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !ASSIGNEE_TYPES.has(value.type)) {
    return { type: "self", id: "self", label: "自分", handoffState: "none" };
  }
  const type = value.type;
  const label = String(value.label || (type === "self" ? "自分" : value.id || "Agent")).trim().slice(0, 80);
  const rawId = String(value.id || "").trim();
  const id = type === "agent"
    ? (rawId === "custom" || rawId.startsWith("custom:") ? customAgentId(rawId, label) : slugAgentId(rawId, label))
    : String(value.id || (type === "self" ? "self" : "")).trim().slice(0, 120);
  if (!id) return { type: "self", id: "self", label: "自分", handoffState: "none" };
  return {
    type,
    id,
    label: type === "self" ? "自分" : label,
    handoffState: HANDOFF_STATES.has(value.handoffState) ? value.handoffState : "none",
  };
}

function normalizeQuest(task, index, previousVersion, migrationDate) {
  const createdAt = String(task.createdAt || new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString());
  const kind = TASK_KINDS.has(task.kind) ? task.kind : "todo";
  const repeat = REPEATS.has(task.repeat) ? task.repeat : kind === "daily" ? "daily" : "none";
  const dueDate = validDate(String(task.dueDate || "")) ? String(task.dueDate || "") : "";
  let lifecycleState = LIFECYCLE_STATES.has(task.lifecycleState) ? task.lifecycleState : "active";
  if (kind === "todo" && repeat === "none" && (lifecycleState === "completed" || task.done)) lifecycleState = "archived";
  if (kind === "daily") lifecycleState = "active";
  let planningState = PLANNING_STATES.has(task.planningState) ? task.planningState : "scheduled";
  if (previousVersion < 4 && kind === "todo" && !dueDate && lifecycleState === "active") planningState = "backlog";
  const planningMode = PLANNING_MODES.has(task.planningMode) ? task.planningMode : dueDate ? "until_due" : "on_date";
  let scheduledDate = validDate(String(task.scheduledDate || "")) ? String(task.scheduledDate || "") : "";
  if (previousVersion < 4 && planningState === "scheduled" && dueDate && !scheduledDate) {
    scheduledDate = dueDate < migrationDate ? dueDate : migrationDate;
  }
  if (planningState === "backlog") scheduledDate = "";
  const externalLinks = Array.isArray(task.externalLinks) ? task.externalLinks.map(normalizeExternalLink).filter(Boolean).slice(0, 30) : [];
  const normalized = {
    ...task,
    id: String(task.id || `imported-${index}-${Date.now()}`),
    kind,
    title: String(task.title || "Untitled quest").trim().slice(0, 80),
    notes: String(task.notes || "").slice(0, 180),
    category: String(task.category || "").trim().slice(0, 40),
    dueDate,
    repeat,
    difficulty: DIFFICULTIES.has(task.difficulty) ? task.difficulty : "easy",
    tags: Array.isArray(task.tags) ? [...new Set(task.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 6) : [],
    planningState,
    lifecycleState,
    planningMode,
    scheduledDate,
    scheduledTime: validTime(String(task.scheduledTime || "")) ? String(task.scheduledTime || "") : "",
    estimatedMinutes: nonNegativeInteger(task.estimatedMinutes),
    manualActualMinutes: nonNegativeInteger(task.manualActualMinutes ?? task.actualMinutes),
    togglActualMinutes: nonNegativeInteger(task.togglActualMinutes),
    completionCriteria: String(task.completionCriteria || "").slice(0, 300),
    nextAction: String(task.nextAction || "").slice(0, 180),
    impact: IMPACTS.has(task.impact) ? task.impact : "medium",
    isBlockingOthers: Boolean(task.isBlockingOthers),
    rolloverCount: nonNegativeInteger(task.rolloverCount),
    dependencyIds: Array.isArray(task.dependencyIds) ? [...new Set(task.dependencyIds.map(String).filter(Boolean))].slice(0, 20) : [],
    parentQuestId: String(task.parentQuestId || "").trim().slice(0, 120),
    completedAt: String(task.completedAt || ""),
    archivedAt: String(task.archivedAt || (lifecycleState === "archived" ? (previousVersion < 7 && kind === "todo" && repeat === "none" ? new Date().toISOString() : task.updatedAt || createdAt) : "")),
    externalLinks,
    assignee: normalizeAssignee(task.assignee),
    handoff: normalizeHandoff(task.handoff),
    assignmentReadyFor: String(task.assignmentReadyFor || "").slice(0, 240),
    createdAt,
    updatedAt: String(task.updatedAt || createdAt),
    lastCompletedDate: String(task.lastCompletedDate || ""),
    lastRolledOverDate: String(task.lastRolledOverDate || ""),
  };
  if (kind === "daily" || kind === "todo") normalized.done = Boolean(task.done);
  if (kind === "todo" && ["completed", "archived"].includes(lifecycleState)) normalized.done = true;
  if (kind === "daily") normalized.streak = nonNegativeInteger(task.streak);
  if (kind === "habit") normalized.value = Number(task.value || 0);
  return refreshActualMinutes(normalized);
}

function descendantDepth(state, questId, seen = new Set()) {
  if (seen.has(questId)) return MAX_TREE_DEPTH + 1;
  seen.add(questId);
  const children = state.tasks.filter((task) => task.parentQuestId === questId);
  if (!children.length) return 1;
  return 1 + Math.max(...children.map((child) => descendantDepth(state, child.id, new Set(seen))));
}

function validateParentQuest(state, questId, parentQuestId) {
  const parentId = String(parentQuestId || "").trim();
  if (!parentId) return;
  const quest = state.tasks.find((task) => task.id === questId);
  const parent = state.tasks.find((task) => task.id === parentId);
  if (!quest || !parent) throw new DomainError(404, "parent_quest_not_found", "Parent quest not found.");
  if (quest.kind === "reward" || parent.kind === "reward" || !TREE_KINDS.has(quest.kind) || !TREE_KINDS.has(parent.kind)) {
    throw new DomainError(400, "invalid_parent_quest", "Only habit, daily, and todo quests can participate in a Quest Tree.");
  }
  if (questId === parentId) throw new DomainError(400, "circular_parent_quest", "A quest cannot be its own parent.");
  let current = parent;
  const visited = new Set([questId]);
  let parentDepth = 1;
  while (current) {
    if (visited.has(current.id)) throw new DomainError(400, "circular_parent_quest", "Quest Tree parents cannot contain a cycle.");
    visited.add(current.id);
    parentDepth += 1;
    current = current.parentQuestId ? state.tasks.find((task) => task.id === current.parentQuestId) : null;
  }
  if (parentDepth + descendantDepth(state, questId) - 1 > MAX_TREE_DEPTH) {
    throw new DomainError(400, "quest_tree_too_deep", `Quest Tree depth cannot exceed ${MAX_TREE_DEPTH}.`);
  }
}

function repairParentQuestLinks(state) {
  for (const task of state.tasks) {
    if (!task.parentQuestId) continue;
    try {
      validateParentQuest(state, task.id, task.parentQuestId);
    } catch {
      task.parentQuestId = "";
    }
  }
}

export function migrateState(state, migrationDate = todayText()) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new DomainError(409, "state_unavailable", "QuestForge state is not available for this user.");
  }
  const previousVersion = Number(state.schemaVersion || 0);
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  state.taskEvents = Array.isArray(state.taskEvents) ? state.taskEvents : [];
  state.syncEvents = Array.isArray(state.syncEvents) ? state.syncEvents : [];
  state.rewardClaims = state.rewardClaims && typeof state.rewardClaims === "object" ? state.rewardClaims : {};
  state.character = state.character && typeof state.character === "object" ? state.character : {};
  state.battle = state.battle && typeof state.battle === "object" ? state.battle : {};
  state.migrationSnapshots = state.migrationSnapshots && typeof state.migrationSnapshots === "object" ? state.migrationSnapshots : {};
  if (previousVersion < 4 && !state.migrationSnapshots.schema3To4) {
    state.migrationSnapshots.schema3To4 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousVersion,
      tasks: clone(state.tasks),
      rewardClaims: clone(state.rewardClaims),
    };
  }
  if (previousVersion < 5 && !state.migrationSnapshots.schema4To5) {
    state.migrationSnapshots.schema4To5 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousVersion,
      tasks: clone(state.tasks),
    };
  }
  if (previousVersion < 6 && !state.migrationSnapshots.schema5To6) {
    state.migrationSnapshots.schema5To6 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousVersion,
      tasks: clone(state.tasks),
      rewardClaims: clone(state.rewardClaims),
    };
  }
  if (previousVersion < 7 && !state.migrationSnapshots.schema6To7) {
    state.migrationSnapshots.schema6To7 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousVersion,
      tasks: clone(state.tasks),
      rewardClaims: clone(state.rewardClaims),
    };
  }
  state.tasks = state.tasks.filter((task) => task && typeof task === "object" && !Array.isArray(task))
    .map((task, index) => normalizeQuest(task, index, previousVersion, migrationDate));
  repairParentQuestLinks(state);
  state.character.gems = Number(state.character.gems || 0);
  state.character.xp = Number(state.character.xp || 0);
  state.character.hp = Number(state.character.hp || 0);
  state.character.maxHp = Number(state.character.maxHp || 50);
  state.battle.mp = Number(state.battle.mp || 0);
  state.battle.maxMp = Number(state.battle.maxMp || 80);
  normalizeBattleState(state);
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  return state;
}

function ensureState(state) {
  return migrateState(state);
}

function difficultyScale(difficulty) {
  return { trivial: 0.5, easy: 1, medium: 1.5, hard: 2.5 }[difficulty] || 1;
}

function rewardDelta(task) {
  const scale = difficultyScale(task.difficulty);
  const baseMp = { habit: 6, daily: 14, todo: 20 }[task.kind] || 0;
  return { gems: Math.round(7 * scale), xp: Math.round(12 * scale), mp: Math.round(baseMp * scale) };
}

function completionKey(task, date) {
  if (task.kind === "daily") return `${task.id}:daily:${date}`;
  if (task.kind === "todo" && task.repeat && task.repeat !== "none") return `${task.id}:todo:${task.dueDate || date}`;
  return `${task.id}:todo:once`;
}

function isOneOffTodo(task) {
  return task?.kind === "todo" && (task.repeat || "none") === "none";
}

function appendEvent(state, type, task, details, source) {
  const at = new Date().toISOString();
  const event = {
    id: createId("evt"), type, taskId: task?.id || "", taskKind: task?.kind || "", at, createdAt: at, source,
    details, payload: { taskId: task?.id || "", ...details },
  };
  state.taskEvents = [event, ...state.taskEvents].slice(0, 250);
  return event;
}

function validateString(input, key, maxLength) {
  if (!Object.hasOwn(input, key)) return undefined;
  return String(input[key] || "").trim().slice(0, maxLength);
}

function validateQuestInput(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainError(400, "invalid_body", "A JSON object is required.");
  const next = {};
  if (!partial || Object.hasOwn(input, "kind")) {
    if (!TASK_KINDS.has(input.kind)) throw new DomainError(400, "invalid_kind", "Unknown quest kind.");
    next.kind = input.kind;
  }
  if (!partial || Object.hasOwn(input, "title")) {
    const title = String(input.title || "").trim();
    if (!title || title.length > 80) throw new DomainError(400, "invalid_title", "Title must contain 1 to 80 characters.");
    next.title = title;
  }
  for (const [key, maxLength] of [["notes", 180], ["category", 40], ["completionCriteria", 300], ["nextAction", 180]]) {
    const value = validateString(input, key, maxLength);
    if (value !== undefined) next[key] = value;
  }
  for (const key of ["dueDate", "scheduledDate"]) {
    if (!Object.hasOwn(input, key)) continue;
    const value = String(input[key] || "");
    if (!validDate(value)) throw new DomainError(400, `invalid_${key}`, `${key} must use YYYY-MM-DD.`);
    next[key] = value;
  }
  if (Object.hasOwn(input, "scheduledTime")) {
    const value = String(input.scheduledTime || "");
    if (!validTime(value)) throw new DomainError(400, "invalid_scheduled_time", "scheduledTime must use HH:MM.");
    next.scheduledTime = value;
  }
  for (const [key, allowed] of [["repeat", REPEATS], ["difficulty", DIFFICULTIES], ["planningState", PLANNING_STATES], ["lifecycleState", LIFECYCLE_STATES], ["planningMode", PLANNING_MODES], ["impact", IMPACTS]]) {
    if (!Object.hasOwn(input, key)) continue;
    if (!allowed.has(input[key])) throw new DomainError(400, `invalid_${key}`, `Unknown ${key} value.`);
    next[key] = input[key];
  }
  if (Object.hasOwn(input, "tags")) {
    if (!Array.isArray(input.tags)) throw new DomainError(400, "invalid_tags", "tags must be an array.");
    next.tags = [...new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 6);
  }
  if (Object.hasOwn(input, "dependencyIds")) {
    if (!Array.isArray(input.dependencyIds)) throw new DomainError(400, "invalid_dependencies", "dependencyIds must be an array.");
    next.dependencyIds = [...new Set(input.dependencyIds.map(String).filter(Boolean))];
    if (next.dependencyIds.length > 20) throw new DomainError(400, "too_many_dependencies", "A quest can have at most 20 dependencies.");
  }
  if (Object.hasOwn(input, "parentQuestId")) {
    const value = input.parentQuestId == null ? "" : String(input.parentQuestId).trim();
    if (value.length > 120) throw new DomainError(400, "invalid_parent_quest", "parentQuestId must contain at most 120 characters.");
    next.parentQuestId = value;
  }
  for (const key of ["estimatedMinutes", "manualActualMinutes", "actualMinutes"]) {
    if (!Object.hasOwn(input, key)) continue;
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < 0 || value > 100000) throw new DomainError(400, `invalid_${key}`, `${key} must be an integer from 0 to 100000.`);
    next[key === "actualMinutes" ? "manualActualMinutes" : key] = value;
  }
  if (Object.hasOwn(input, "isBlockingOthers")) next.isBlockingOthers = Boolean(input.isBlockingOthers);
  if (Object.hasOwn(input, "assignee")) {
    if (!input.assignee || typeof input.assignee !== "object" || Array.isArray(input.assignee)) {
      throw new DomainError(400, "invalid_assignee", "assignee must be an object.");
    }
    const type = input.assignee.type;
    if (!ASSIGNEE_TYPES.has(type)) throw new DomainError(400, "invalid_assignee_type", "Unknown assignee type.");
    const rawId = String(input.assignee.id || (type === "self" ? "self" : "")).trim();
    const label = String(input.assignee.label || (type === "self" ? "自分" : rawId)).trim();
    const id = type === "agent"
      ? (rawId === "custom" || rawId.startsWith("custom:") ? customAgentId(rawId, label) : slugAgentId(rawId, label))
      : rawId;
    if (!id || id.length > 120) throw new DomainError(400, "invalid_assignee_id", "assignee.id must contain 1 to 120 characters.");
    if (!label || label.length > 80) throw new DomainError(400, "invalid_assignee_label", "assignee.label must contain 1 to 80 characters.");
    const handoffState = input.assignee.handoffState || "none";
    if (!HANDOFF_STATES.has(handoffState)) throw new DomainError(400, "invalid_handoff_state", "Unknown handoffState.");
    next.assignee = { type, id, label, handoffState };
  }
  if (Object.hasOwn(input, "handoff")) {
    if (!input.handoff || typeof input.handoff !== "object" || Array.isArray(input.handoff)) {
      throw new DomainError(400, "invalid_handoff", "handoff must be an object.");
    }
    const handoff = normalizeHandoff(input.handoff);
    if (handoff.artifactUrl && !handoff.artifactUrl.startsWith("https://")) {
      throw new DomainError(400, "invalid_artifact_url", "artifactUrl must use HTTPS.");
    }
    next.handoff = handoff;
  }
  return next;
}

function validateHandoffPatch(currentQuest, nextAssignee) {
  if (!nextAssignee || nextAssignee.type !== "agent") return;
  const currentState = currentQuest.assignee?.type === "agent" ? currentQuest.assignee.handoffState || "none" : "none";
  const nextState = nextAssignee.handoffState || "none";
  if (currentState === nextState) return;
  if (!HANDOFF_TRANSITIONS.get(currentState)?.has(nextState)) {
    throw new DomainError(409, "invalid_handoff_transition", `Cannot move handoff from ${currentState} to ${nextState}.`);
  }
}

function validateDependencies(state, questId, dependencyIds) {
  if (dependencyIds.includes(questId)) throw new DomainError(400, "circular_dependency", "A quest cannot depend on itself.");
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  for (const dependencyId of dependencyIds) {
    if (!byId.has(dependencyId)) throw new DomainError(400, "dependency_not_found", `Dependency not found: ${dependencyId}`);
    const visited = new Set();
    const stack = [dependencyId];
    while (stack.length) {
      const current = stack.pop();
      if (current === questId) throw new DomainError(400, "circular_dependency", "Quest dependencies cannot contain a cycle.");
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(byId.get(current)?.dependencyIds || []));
    }
  }
}

function childrenSummary(state, questId, includeArchived = false) {
  const children = state.tasks.filter((task) => task.parentQuestId === questId && (includeArchived || task.lifecycleState !== "archived"));
  const completed = children.filter((task) => ["completed", "archived"].includes(task.lifecycleState) || task.done).length;
  return {
    total: children.length,
    completed,
    progressPercent: children.length ? Math.round((completed / children.length) * 100) : 0,
  };
}

function questOutput(task, state = null) {
  const output = refreshActualMinutes({ ...task, externalLinks: (task.externalLinks || []).map((link) => ({ ...link })), handoff: normalizeHandoff(task.handoff) });
  if (state) output.childrenSummary = childrenSummary(state, task.id);
  return output;
}

export function getQuest(state, questId) {
  ensureState(state);
  const task = state.tasks.find((item) => item.id === questId);
  if (!task) throw new DomainError(404, "quest_not_found", "Quest not found.");
  return { quest: questOutput(task, state) };
}

function treeSort(a, b) {
  return relevantDate(a).localeCompare(relevantDate(b))
    || a.dueDate.localeCompare(b.dueDate)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id);
}

export function getQuestTree(state, query = {}) {
  ensureState(state);
  const includeArchived = query.includeArchived === true || query.includeArchived === "true";
  const requestedDepth = query.maxDepth === undefined ? MAX_TREE_DEPTH : nonNegativeInteger(query.maxDepth, MAX_TREE_DEPTH);
  const maxDepth = Math.max(1, Math.min(MAX_TREE_DEPTH, requestedDepth));
  const rootQuestId = String(query.rootQuestId || "").trim();
  if (rootQuestId && !state.tasks.some((task) => task.id === rootQuestId)) throw new DomainError(404, "quest_not_found", "Root quest not found.");
  const candidates = state.tasks.filter((task) => TREE_KINDS.has(task.kind) && (includeArchived || task.lifecycleState !== "archived"));
  const allowed = new Set(candidates.map((task) => task.id));
  const children = new Map();
  candidates.forEach((task) => {
    const parentId = allowed.has(task.parentQuestId) ? task.parentQuestId : "";
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(task);
  });
  children.forEach((list) => list.sort(treeSort));
  const root = rootQuestId ? candidates.find((task) => task.id === rootQuestId) : null;
  if (rootQuestId && !root) return { roots: [], nodes: [], total: 0, summary: { childrenTotal: 0, childrenCompleted: 0, progressPercent: 0 } };
  const roots = root ? [root] : (children.get("") || []);
  const nodes = [];
  const build = (task, depth) => {
    const node = { quest: questOutput(task, state), children: [] };
    nodes.push({ ...questOutput(task, state), depth });
    if (depth >= maxDepth) return node;
    node.children = (children.get(task.id) || []).map((child) => build(child, depth + 1));
    return node;
  };
  const nestedRoots = roots.map((task) => build(task, 1));
  const childNodes = nodes.filter((node) => node.id !== rootQuestId && !(!rootQuestId && node.parentQuestId === ""));
  const completed = childNodes.filter((task) => ["completed", "archived"].includes(task.lifecycleState) || task.done).length;
  return {
    roots: nestedRoots,
    nodes,
    total: nodes.length,
    summary: {
      childrenTotal: childNodes.length,
      childrenCompleted: completed,
      progressPercent: childNodes.length ? Math.round((completed / childNodes.length) * 100) : 0,
    },
  };
}

export function listAgentHandoffs(state, query = {}) {
  ensureState(state);
  const filter = String(query.state || "all");
  const supported = new Set(["none", "ready", "working", "blocked", "review_required", "accepted", "pending", "all"]);
  if (!supported.has(filter)) throw new DomainError(400, "invalid_handoff_state", "Unknown handoff filter.");
  let handoffs = state.tasks.filter((task) => task.assignee?.type === "agent");
  if (query.assigneeId) {
    const assigneeId = String(query.assigneeId).trim();
    const normalizedAssigneeId = assigneeId.startsWith("custom:") ? customAgentId(assigneeId, assigneeId) : slugAgentId(assigneeId);
    handoffs = handoffs.filter((task) => task.assignee.id === normalizedAssigneeId);
  }
  if (filter === "pending") handoffs = handoffs.filter((task) => task.assignee.handoffState !== "ready");
  else if (filter !== "all") handoffs = handoffs.filter((task) => task.assignee.handoffState === filter);
  handoffs.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
  const total = handoffs.length;
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 25));
  const offset = Math.max(0, nonNegativeInteger(query.cursor));
  return { handoffs: handoffs.slice(offset, offset + limit).map((task) => questOutput(task, state)), total, limit, nextCursor: offset + limit < total ? String(offset + limit) : null };
}

export function transitionQuestHandoff(state, questId, input = {}, context = {}) {
  const dryRun = input.dryRun !== false;
  const target = dryRun ? clone(state) : state;
  ensureState(target);
  const quest = target.tasks.find((item) => item.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  if (quest.assignee?.type !== "agent") throw new DomainError(409, "agent_assignee_required", "Only agent-assigned quests can use handoff states.");
  const nextState = String(input.state || input.handoffState || "");
  if (!HANDOFF_STATES.has(nextState)) throw new DomainError(400, "invalid_handoff_state", "A handoff transition must target none, ready, working, blocked, review_required, or accepted.");
  const currentState = quest.assignee.handoffState || "none";
  if (input.expectedState && input.expectedState !== currentState) throw new DomainError(409, "stale_handoff_state", "The handoff changed before this update was applied.", { expectedState: input.expectedState, actualState: currentState });
  if (currentState !== nextState && !HANDOFF_TRANSITIONS.get(currentState)?.has(nextState)) {
    throw new DomainError(409, "invalid_handoff_transition", `Cannot move handoff from ${currentState} to ${nextState}.`);
  }
  const artifactUrl = String(input.artifactUrl || quest.handoff?.artifactUrl || "").trim();
  if (artifactUrl && !artifactUrl.startsWith("https://")) throw new DomainError(400, "invalid_artifact_url", "artifactUrl must use HTTPS.");
  const now = new Date().toISOString();
  quest.assignee.handoffState = nextState;
  quest.handoff = normalizeHandoff({ ...quest.handoff, ...input, artifactUrl });
  if (nextState === "working") quest.handoff.startedAt ||= now;
  if (nextState === "review_required") quest.handoff.reviewRequestedAt = now;
  if (nextState === "accepted") {
    quest.handoff.reviewedAt = now;
    quest.handoff.reviewedBy = String(context.reviewedBy || input.reviewedBy || "user").slice(0, 120);
  }
  quest.assignmentReadyFor = nextState === "ready" ? `${quest.assignee.type}:${quest.assignee.id}` : "";
  quest.updatedAt = now;
  const event = appendEvent(target, "quest.handoff.transitioned", quest, { from: currentState, to: nextState, handoff: clone(quest.handoff) }, context.source || "api");
  touch(target);
  return { dryRun, quest: questOutput(quest, target), event, events: [event] };
}
function isActiveOpen(task) {
  return task.lifecycleState === "active" && !(task.done && ["daily", "todo"].includes(task.kind));
}

function isOverdue(task, date) {
  return isActiveOpen(task) && task.dueDate && task.dueDate < date;
}

function visibleOnDate(task, date) {
  if (!isActiveOpen(task) || task.planningState !== "scheduled" || task.kind === "reward") return false;
  if (isOverdue(task, date)) return true;
  if (task.kind === "habit") return true;
  if (task.kind === "daily" && !task.scheduledDate) return true;
  if (task.planningMode === "on_date") return task.scheduledDate === date;
  return !task.scheduledDate || task.scheduledDate <= date;
}

function relevantDate(task) {
  return task.scheduledDate || task.dueDate || "9999-12-31";
}

function matchesView(task, view, date) {
  if (view === "all") return true;
  if (view === "backlog") return task.lifecycleState === "active" && task.planningState === "backlog";
  if (view === "completed") return task.lifecycleState === "completed";
  if (view === "archive") return task.lifecycleState === "archived";
  if (view === "today") return visibleOnDate(task, date);
  const weekEnd = addDays(date, 6);
  if (view === "week") {
    if (!isActiveOpen(task) || task.planningState !== "scheduled" || task.kind === "reward") return false;
    if (isOverdue(task, date)) return true;
    if (task.planningMode === "until_due") return (!task.scheduledDate || task.scheduledDate <= weekEnd) && (!task.dueDate || task.dueDate >= date);
    return relevantDate(task) >= date && relevantDate(task) <= weekEnd;
  }
  if (view === "future") return isActiveOpen(task) && task.planningState === "scheduled" && relevantDate(task) > weekEnd;
  return true;
}

export function listQuestPage(state, query = {}) {
  ensureState(state);
  const date = validDate(String(query.date || "")) && query.date ? String(query.date) : todayText();
  const view = query.view || (query.due === "today" ? "today" : query.due === "overdue" ? "all" : "all");
  if (!QUEST_VIEWS.has(view)) throw new DomainError(400, "invalid_view", "Unknown quest view.");
  let quests = state.tasks.filter((task) => matchesView(task, view, date));
  if (query.due === "overdue") quests = quests.filter((task) => isOverdue(task, date));
  if (query.kind) quests = quests.filter((task) => task.kind === query.kind);
  if (query.category) quests = quests.filter((task) => task.category === query.category);
  if (query.tag) quests = quests.filter((task) => task.tags.includes(query.tag));
  if (query.planningState) quests = quests.filter((task) => task.planningState === query.planningState);
  if (query.lifecycleState) quests = quests.filter((task) => task.lifecycleState === query.lifecycleState);
  if (query.parentQuestId !== undefined) {
    const parentQuestId = String(query.parentQuestId || "").trim();
    quests = quests.filter((task) => task.parentQuestId === parentQuestId);
  }
  if (query.rootOnly === "true" || query.rootOnly === true) quests = quests.filter((task) => !task.parentQuestId);
  if (query.done === "true" || query.done === true) quests = quests.filter((task) => task.done === true);
  if (query.done === "false" || query.done === false) quests = quests.filter((task) => !task.done);
  if (query.from) quests = quests.filter((task) => relevantDate(task) >= query.from);
  if (query.to) quests = quests.filter((task) => relevantDate(task) <= query.to);
  if (query.search) {
    const term = String(query.search).toLocaleLowerCase();
    quests = quests.filter((task) => `${task.title} ${task.notes} ${task.category} ${task.tags.join(" ")}`.toLocaleLowerCase().includes(term));
  }
  quests.sort((a, b) => relevantDate(a).localeCompare(relevantDate(b)) || a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt));
  const total = quests.length;
  const limit = Math.max(1, Math.min(200, nonNegativeInteger(query.limit, 100) || 100));
  const offset = Math.max(0, nonNegativeInteger(query.cursor));
  const page = quests.slice(offset, offset + limit).map((task) => questOutput(task, state));
  return { quests: page, total, limit, nextCursor: offset + limit < total ? String(offset + limit) : null };
}

export function listQuests(state, query = {}) {
  return listQuestPage(state, query).quests;
}

export function createQuest(state, input, context = {}) {
  ensureState(state);
  const clean = validateQuestInput(input);
  const now = new Date().toISOString();
  const date = context.date || todayText();
  const planningState = clean.planningState || (clean.kind === "todo" && !clean.dueDate ? "backlog" : "scheduled");
  const quest = {
    id: createId("quest"), kind: clean.kind, title: clean.title, notes: clean.notes || "", category: clean.category || "",
    dueDate: clean.dueDate || "", repeat: clean.repeat || (clean.kind === "daily" ? "daily" : "none"),
    difficulty: clean.difficulty || "easy", tags: clean.tags || [], planningState, lifecycleState: "active",
    planningMode: clean.planningMode || (clean.dueDate ? "until_due" : "on_date"),
    scheduledDate: planningState === "scheduled" ? clean.scheduledDate || (clean.dueDate ? date : clean.kind === "daily" ? date : "") : "",
    scheduledTime: planningState === "scheduled" ? clean.scheduledTime || "" : "", estimatedMinutes: clean.estimatedMinutes || 0,
    manualActualMinutes: clean.manualActualMinutes || 0, togglActualMinutes: 0, actualMinutes: clean.manualActualMinutes || 0,
    completionCriteria: clean.completionCriteria || "", nextAction: clean.nextAction || "", impact: clean.impact || "medium",
    isBlockingOthers: Boolean(clean.isBlockingOthers), rolloverCount: 0, dependencyIds: clean.dependencyIds || [],
    parentQuestId: clean.parentQuestId || "",
    completedAt: "", archivedAt: "", externalLinks: [], createdAt: now, updatedAt: now,
    assignee: clean.assignee || { type: "self", id: "self", label: "自分", handoffState: "none" },
    handoff: normalizeHandoff(clean.handoff),
    assignmentReadyFor: "",
  };
  validateDependencies(state, quest.id, quest.dependencyIds);
  state.tasks.push(quest);
  try {
    if (quest.parentQuestId) validateParentQuest(state, quest.id, quest.parentQuestId);
  } catch (error) {
    state.tasks.pop();
    throw error;
  }
  if (quest.kind === "daily" || quest.kind === "todo") quest.done = false;
  if (quest.kind === "daily") quest.streak = 0;
  if (quest.kind === "habit") quest.value = 0;
  if (quest.kind === "reward") quest.cost = Number(input.cost || Math.round(15 * difficultyScale(quest.difficulty)));
  const events = [appendEvent(state, "quest.created", quest, {}, context.source || "api")];
  if (quest.assignee.type === "agent" && quest.assignee.handoffState === "ready") {
    quest.assignmentReadyFor = `${quest.assignee.type}:${quest.assignee.id}`;
    events.push(appendEvent(state, "quest.assignment.ready", quest, { assignee: clone(quest.assignee) }, context.source || "api"));
  }
  touch(state);
  const output = questOutput(quest, state);
  return context.returnEvent ? { quest: output, event: events[0], events } : output;
}

export function patchQuest(state, questId, input, context = {}) {
  ensureState(state);
  const quest = state.tasks.find((item) => item.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  const clean = validateQuestInput(input, true);
  if (clean.dependencyIds) validateDependencies(state, questId, clean.dependencyIds);
  if (clean.parentQuestId !== undefined) validateParentQuest(state, questId, clean.parentQuestId);
  if (clean.assignee) validateHandoffPatch(quest, clean.assignee);
  if (clean.handoff) clean.handoff = normalizeHandoff({ ...quest.handoff, ...input.handoff });
  const previousScheduledDate = quest.scheduledDate;
  const previousAssignee = clone(quest.assignee);
  Object.assign(quest, clean);
  if (quest.planningState === "backlog") {
    quest.scheduledDate = "";
    quest.scheduledTime = "";
  } else if (!quest.scheduledDate && quest.kind === "todo") {
    quest.scheduledDate = quest.dueDate || context.date || todayText();
  }
  if (clean.scheduledDate && previousScheduledDate && clean.scheduledDate > previousScheduledDate && quest.kind === "todo" && context.countRollover !== false) {
    quest.rolloverCount = nonNegativeInteger(quest.rolloverCount) + 1;
    quest.lastRolledOverDate = context.date || todayText();
  }
  if (clean.lifecycleState) {
    const now = new Date().toISOString();
    if (clean.lifecycleState === "active") { quest.done = false; quest.completedAt = ""; quest.archivedAt = ""; }
    if (clean.lifecycleState === "completed") {
      quest.done = true;
      quest.completedAt ||= now;
      if (isOneOffTodo(quest)) {
        quest.lifecycleState = "archived";
        quest.archivedAt ||= now;
      } else {
        quest.lifecycleState = "active";
        quest.archivedAt = "";
      }
    }
    if (clean.lifecycleState === "archived") {
      if (isOneOffTodo(quest)) {
        quest.done = true;
        quest.completedAt ||= now;
        quest.archivedAt ||= now;
      } else {
        quest.done = false;
        quest.lifecycleState = "active";
        quest.completedAt = "";
        quest.archivedAt = "";
      }
    }
  }
  quest.updatedAt = new Date().toISOString();
  refreshActualMinutes(quest);
  const event = appendEvent(state, "quest.updated", quest, { fields: Object.keys(clean) }, context.source || "api");
  const events = [event];
  if (clean.assignee) {
    const assignmentKey = `${quest.assignee.type}:${quest.assignee.id}`;
    const becameReady = quest.assignee.type === "agent"
      && quest.assignee.handoffState === "ready"
      && quest.assignmentReadyFor !== assignmentKey;
    if (becameReady) {
      quest.assignmentReadyFor = assignmentKey;
      events.push(appendEvent(state, "quest.assignment.ready", quest, { assignee: clone(quest.assignee), previousAssignee }, context.source || "api"));
    }
  }
  touch(state);
  const output = questOutput(quest, state);
  if (context.returnEvent) return { quest: output, event, events };
  return output;
}

export function batchUpdateQuests(state, input, context = {}) {
  ensureState(state);
  const questIds = [...new Set((input?.questIds || []).map(String).filter(Boolean))];
  if (!questIds.length) throw new DomainError(400, "quest_ids_required", "At least one questId is required.");
  if (questIds.length > 100) throw new DomainError(400, "batch_too_large", "A batch can update at most 100 quests.");
  const dryRun = input.dryRun !== false;
  const target = clone(state);
  const postponeDays = input.postponeDays === undefined ? 0 : Number(input.postponeDays);
  if (!Number.isInteger(postponeDays) || postponeDays < -365 || postponeDays > 365) throw new DomainError(400, "invalid_postpone_days", "postponeDays must be an integer from -365 to 365.");
  const quests = questIds.map((questId) => {
    const current = target.tasks.find((task) => task.id === questId);
    if (!current) throw new DomainError(404, "quest_not_found", `Quest not found: ${questId}`);
    const patch = { ...(input.patch || {}) };
    if (postponeDays) patch.scheduledDate = addDays(current.scheduledDate || context.date || todayText(), postponeDays);
    return patchQuest(target, questId, patch, { ...context, returnEvent: false });
  });
  if (!dryRun) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, target);
  }
  return { dryRun, count: quests.length, quests };
}

export function archiveQuests(state, input = {}, context = {}) {
  ensureState(state);
  const dryRun = input.dryRun !== false;
  const requested = [...new Set((input.questIds || []).map(String).filter(Boolean))];
  if (requested.length > 100) throw new DomainError(400, "batch_too_large", "A batch can archive at most 100 quests.");
  const throughDate = String(input.throughDate || "");
  if (throughDate && !validDate(throughDate)) throw new DomainError(400, "invalid_through_date", "throughDate must use YYYY-MM-DD.");
  const candidates = state.tasks.filter((task) => {
    if (!isOneOffTodo(task) || !["completed", "archived"].includes(task.lifecycleState)) return false;
    if (task.lifecycleState === "archived" && !requested.length) return false;
    if (requested.length && !requested.includes(task.id)) return false;
    if (throughDate && String(task.completedAt || task.lastCompletedDate || "9999-12-31").slice(0, 10) > throughDate) return false;
    return true;
  });
  if (requested.length) {
    const candidateIds = new Set(candidates.map((task) => task.id));
    const invalid = requested.filter((id) => !candidateIds.has(id));
    if (invalid.length) throw new DomainError(409, "quest_not_archivable", "Only completed one-off todo quests can be archived.", { questIds: invalid });
  }
  if (dryRun) return { dryRun: true, count: candidates.length, quests: candidates.map(questOutput) };
  const now = new Date().toISOString();
  const events = [];
  for (const task of candidates) {
    if (task.lifecycleState === "archived") continue;
    task.lifecycleState = "archived";
    task.completedAt ||= now;
    task.archivedAt = now;
    task.updatedAt = now;
    events.push(appendEvent(state, "quest.archived", task, {}, context.source || "api"));
  }
  touch(state);
  return { dryRun: false, count: candidates.length, quests: candidates.map(questOutput), events };
}

export function linkExternalRecord(state, questId, input, context = {}) {
  ensureState(state);
  const quest = state.tasks.find((task) => task.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  const link = normalizeExternalLink({ ...input, syncedAt: input?.syncedAt || new Date().toISOString() });
  if (!link) throw new DomainError(400, "invalid_external_link", "service and externalId are required.");
  if (link.service === "toggl-focus" && context.allowManagedFocus !== true) {
    throw new DomainError(403, "managed_focus_link_required", "Toggl Focus time entries must be linked through the verified Focus integration.");
  }
  if (link.url && !link.url.startsWith("https://")) throw new DomainError(400, "invalid_external_url", "External record URLs must use HTTPS.");
  const index = quest.externalLinks.findIndex((item) => item.service === link.service && item.externalId === link.externalId && item.type === link.type);
  if (index >= 0) quest.externalLinks[index] = link;
  else quest.externalLinks = [...quest.externalLinks, link].slice(-30);
  refreshActualMinutes(quest);
  quest.updatedAt = new Date().toISOString();
  const event = appendEvent(state, "quest.external_linked", quest, { service: link.service, externalId: link.externalId, type: link.type }, context.source || "api");
  touch(state);
  return { quest: questOutput(quest), link, event };
}

export function removeManagedFocusEntry(state, questId, entryId, context = {}) {
  ensureState(state);
  const quest = state.tasks.find((task) => task.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  const before = quest.externalLinks.length;
  quest.externalLinks = quest.externalLinks.filter((link) => !(link.service === "toggl-focus" && link.externalId === String(entryId) && (link.type === "time_entry" || link.sourceType === "focus.time_entry")));
  if (quest.externalLinks.length === before) return { quest: questOutput(quest), removed: false, event: null };
  refreshActualMinutes(quest);
  quest.updatedAt = new Date().toISOString();
  const event = appendEvent(state, "quest.external_unlinked", quest, { service: "toggl-focus", externalId: String(entryId), type: "time_entry" }, context.source || "api");
  touch(state);
  return { quest: questOutput(quest), removed: true, event };
}

export function purgeManagedFocusLinks(state, input = {}, context = {}) {
  ensureState(state);
  const dryRun = input.dryRun !== false;
  const affected = state.tasks.filter((task) => task.externalLinks.some((link) => link.service === "toggl-focus"));
  if (dryRun) return { dryRun: true, count: affected.length, quests: affected.map(questOutput) };
  const events = [];
  const now = new Date().toISOString();
  for (const task of affected) {
    task.externalLinks = task.externalLinks.filter((link) => link.service !== "toggl-focus");
    refreshActualMinutes(task);
    task.updatedAt = now;
    events.push(appendEvent(state, "quest.external_purged", task, { service: "toggl-focus" }, context.source || "api"));
  }
  if (affected.length) touch(state);
  return { dryRun: false, count: affected.length, quests: affected.map(questOutput), events };
}

function grantXp(character, amount) {
  character.xp = Number(character.xp || 0) + amount;
  character.nextXp = Number(character.nextXp || 100);
  character.level = Number(character.level || 1);
  while (character.xp >= character.nextXp) {
    character.xp -= character.nextXp;
    character.level += 1;
    character.nextXp = Math.round(character.nextXp * 1.25);
    character.maxHp = Number(character.maxHp || 50) + 5;
    character.hp = character.maxHp;
  }
}

export function scoreQuest(state, questId, direction = "up", context = {}) {
  ensureState(state);
  if (!["up", "down"].includes(direction)) throw new DomainError(400, "invalid_direction", "direction must be up or down.");
  const quest = state.tasks.find((item) => item.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  if (quest.kind === "reward") return buyReward(state, questId, context);
  const positive = direction === "up";
  const scale = difficultyScale(quest.difficulty);
  let reward = { gems: 0, xp: 0, mp: 0 };
  let rewardGranted = false;
  let eventType = "quest.scored";
  const now = new Date().toISOString();
  if (quest.kind === "daily" || quest.kind === "todo") {
    if (!positive) {
      quest.done = false;
      quest.lifecycleState = "active";
      quest.completedAt = "";
      quest.archivedAt = "";
      state.character.hp = Math.max(0, state.character.hp - Math.round(5 * scale));
      eventType = "quest.failed";
    } else if (quest.done) {
      quest.done = false;
      quest.lifecycleState = "active";
      quest.completedAt = "";
      quest.archivedAt = "";
      eventType = "quest.reopened";
    } else {
      quest.done = true;
      quest.lastCompletedDate = context.date || todayText();
      const key = completionKey(quest, quest.lastCompletedDate);
      if (!state.rewardClaims[key]) {
        state.rewardClaims[key] = now;
        reward = rewardDelta(quest);
        state.character.gems += reward.gems;
        grantXp(state.character, reward.xp);
        state.battle.mp = Math.min(state.battle.maxMp, state.battle.mp + reward.mp);
        rewardGranted = true;
      }
      if (quest.kind === "daily") {
        quest.lifecycleState = "active";
        if (rewardGranted) quest.streak = Number(quest.streak || 0) + 1;
      } else if (isOneOffTodo(quest)) {
        quest.lifecycleState = "archived";
        quest.completedAt = now;
        quest.archivedAt = now;
      } else {
        quest.lifecycleState = "active";
      }
    }
  } else if (quest.kind === "habit") {
    quest.value = Math.max(-20, Math.min(20, Number(quest.value || 0) + (positive ? 1 : -1)));
    if (positive) {
      reward = rewardDelta(quest);
      state.character.gems += reward.gems;
      grantXp(state.character, reward.xp);
      state.battle.mp = Math.min(state.battle.maxMp, state.battle.mp + reward.mp);
      rewardGranted = true;
    } else state.character.hp = Math.max(0, state.character.hp - Math.round(4 * scale));
  }
  quest.updatedAt = now;
  const event = appendEvent(state, eventType, quest, { direction, reward, rewardGranted }, context.source || "api");
  touch(state);
  return { quest: questOutput(quest), reward, rewardGranted, character: characterState(state), battle: state.battle, event };
}

export function batchScoreQuests(state, input = {}, context = {}) {
  ensureState(state);
  const questIds = [...new Set((input.questIds || []).map(String).filter(Boolean))];
  if (!questIds.length) throw new DomainError(400, "quest_ids_required", "At least one questId is required.");
  if (questIds.length > 100) throw new DomainError(400, "batch_too_large", "A batch can score at most 100 quests.");
  const direction = input.direction || "up";
  if (!["up", "down"].includes(direction)) throw new DomainError(400, "invalid_direction", "direction must be up or down.");
  const dryRun = input.dryRun !== false;
  const target = clone(state);
  for (const questId of questIds) {
    const quest = target.tasks.find((item) => item.id === questId);
    if (!quest) throw new DomainError(404, "quest_not_found", `Quest not found: ${questId}`);
    if (!["habit", "daily", "todo"].includes(quest.kind)) throw new DomainError(400, "invalid_batch_score_quest", "Batch scoring only supports habit, daily, and todo quests.", { questId });
  }
  const results = questIds.map((questId) => scoreQuest(target, questId, direction, { ...context, source: context.source || "api" }));
  if (!dryRun) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, target);
  }
  return {
    dryRun,
    count: results.length,
    quests: results.map((result) => result.quest),
    rewards: results.map((result) => ({ questId: result.quest.id, reward: result.reward, rewardGranted: result.rewardGranted })),
    character: characterState(target),
    battle: target.battle,
    events: results.map((result) => result.event),
  };
}

export function buyReward(state, questId, context = {}) {
  ensureState(state);
  const quest = state.tasks.find((item) => item.id === questId && item.kind === "reward");
  if (!quest) throw new DomainError(404, "reward_not_found", "Reward quest not found.");
  const cost = Number(quest.cost || 0);
  if (state.character.gems < cost) throw new DomainError(409, "insufficient_gems", "Not enough gems.");
  state.character.gems -= cost;
  quest.lastPurchasedAt = new Date().toISOString();
  const event = appendEvent(state, "reward.purchased", quest, { cost }, context.source || "api");
  touch(state);
  return { quest: questOutput(quest), cost, character: characterState(state), event };
}

export function characterState(state) {
  ensureState(state);
  return { ...state.character, mp: state.battle.mp, maxMp: state.battle.maxMp, boss: state.boss };
}

export function getBattleSession(state) {
  ensureState(state);
  return createBattleSession(state);
}

export function battleCommand(state, input, context = {}) {
  if (input?.dryRun !== false) {
    const previewState = clone(state);
    ensureState(previewState);
    return executeBattleCommand(previewState, { ...input, dryRun: true });
  }
  ensureState(state);
  const result = executeBattleCommand(state, input);
  if (result.dryRun || result.replayed) return result;
  const event = appendEvent(state, "battle.commanded", null, {
    commandId: result.commandId,
    command: result.command,
    expectedTurn: result.expectedTurn,
    turn: result.turn,
    cost: result.cost,
  }, context.source || "api");
  touch(state);
  return { ...result, event, events: [event] };
}

export function listEvents(state, limit = 50) {
  ensureState(state);
  return state.taskEvents.slice(0, Math.max(1, Math.min(250, Number(limit) || 50)));
}

export function touch(state) {
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  state.updatedAt = new Date().toISOString();
  return state;
}

export function assertScope(scopes, required) {
  if (!scopes?.includes(required)) throw new DomainError(403, "insufficient_scope", `Required scope: ${required}`);
}

export { CURRENT_SCHEMA_VERSION };
