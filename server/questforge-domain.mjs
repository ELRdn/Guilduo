const TASK_KINDS = new Set(["habit", "daily", "todo", "reward"]);
const DIFFICULTIES = new Set(["trivial", "easy", "medium", "hard"]);
const REPEATS = new Set(["none", "daily", "weekdays", "weekly", "monthly"]);

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
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function difficultyScale(difficulty) {
  return { trivial: 0.5, easy: 1, medium: 1.5, hard: 2.5 }[difficulty] || 1;
}

function rewardDelta(task) {
  const scale = difficultyScale(task.difficulty);
  const baseMp = { habit: 6, daily: 14, todo: 20 }[task.kind] || 0;
  return {
    gems: Math.round(7 * scale),
    xp: Math.round(12 * scale),
    mp: Math.round(baseMp * scale),
  };
}

function completionKey(task, date) {
  if (task.kind === "daily") return `${task.id}:daily:${date}`;
  if (task.kind === "todo" && task.repeat && task.repeat !== "none") {
    return `${task.id}:todo:${task.dueDate || date}`;
  }
  return `${task.id}:todo:once`;
}

function appendEvent(state, type, task, details, source) {
  const at = new Date().toISOString();
  const event = {
    id: createId("evt"),
    type,
    taskId: task?.id || "",
    taskKind: task?.kind || "",
    at,
    createdAt: at,
    source,
    details,
    payload: { taskId: task?.id || "", ...details },
  };
  state.taskEvents = [event, ...(Array.isArray(state.taskEvents) ? state.taskEvents : [])].slice(0, 250);
  return event;
}

function ensureState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new DomainError(409, "state_unavailable", "QuestForge state is not available for this user.");
  }
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  state.taskEvents = Array.isArray(state.taskEvents) ? state.taskEvents : [];
  state.syncEvents = Array.isArray(state.syncEvents) ? state.syncEvents : [];
  state.rewardClaims = state.rewardClaims && typeof state.rewardClaims === "object" ? state.rewardClaims : {};
  state.character = state.character && typeof state.character === "object" ? state.character : {};
  state.battle = state.battle && typeof state.battle === "object" ? state.battle : {};
  state.character.gems = Number(state.character.gems || 0);
  state.character.xp = Number(state.character.xp || 0);
  state.character.hp = Number(state.character.hp || 0);
  state.character.maxHp = Number(state.character.maxHp || 50);
  state.battle.mp = Number(state.battle.mp || 0);
  state.battle.maxMp = Number(state.battle.maxMp || 80);
  return state;
}

function validateQuestInput(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError(400, "invalid_body", "A JSON object is required.");
  }
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
  if (Object.hasOwn(input, "notes")) next.notes = String(input.notes || "").slice(0, 180);
  if (Object.hasOwn(input, "dueDate")) {
    const dueDate = String(input.dueDate || "");
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new DomainError(400, "invalid_due_date", "dueDate must use YYYY-MM-DD.");
    next.dueDate = dueDate;
  }
  if (Object.hasOwn(input, "repeat")) {
    if (!REPEATS.has(input.repeat)) throw new DomainError(400, "invalid_repeat", "Unknown repeat value.");
    next.repeat = input.repeat;
  }
  if (Object.hasOwn(input, "difficulty")) {
    if (!DIFFICULTIES.has(input.difficulty)) throw new DomainError(400, "invalid_difficulty", "Unknown difficulty.");
    next.difficulty = input.difficulty;
  }
  if (Object.hasOwn(input, "tags")) {
    if (!Array.isArray(input.tags)) throw new DomainError(400, "invalid_tags", "tags must be an array.");
    next.tags = [...new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 6);
  }
  return next;
}

export function listQuests(state, query = {}) {
  ensureState(state);
  let quests = [...state.tasks];
  const date = query.date || todayText();
  if (query.kind) quests = quests.filter((task) => task.kind === query.kind);
  if (query.done === "true" || query.done === true) quests = quests.filter((task) => task.done === true);
  if (query.done === "false" || query.done === false) quests = quests.filter((task) => !task.done);
  if (query.due === "today") quests = quests.filter((task) => !task.done && (!task.dueDate || task.dueDate <= date));
  if (query.due === "overdue") quests = quests.filter((task) => !task.done && task.dueDate && task.dueDate < date);
  return quests;
}

export function createQuest(state, input, context = {}) {
  ensureState(state);
  const clean = validateQuestInput(input);
  const now = new Date().toISOString();
  const quest = {
    id: createId("quest"),
    kind: clean.kind,
    title: clean.title,
    notes: clean.notes || "",
    dueDate: clean.dueDate || "",
    repeat: clean.repeat || (clean.kind === "daily" ? "daily" : "none"),
    difficulty: clean.difficulty || "easy",
    tags: clean.tags || [],
    createdAt: now,
    updatedAt: now,
  };
  if (quest.kind === "daily" || quest.kind === "todo") quest.done = false;
  if (quest.kind === "daily") quest.streak = 0;
  if (quest.kind === "habit") quest.value = 0;
  if (quest.kind === "reward") quest.cost = Number(input.cost || Math.round(15 * difficultyScale(quest.difficulty)));
  state.tasks.push(quest);
  appendEvent(state, "quest.created", quest, {}, context.source || "api");
  touch(state);
  return quest;
}

export function patchQuest(state, questId, input, context = {}) {
  ensureState(state);
  const quest = state.tasks.find((item) => item.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  const clean = validateQuestInput(input, true);
  Object.assign(quest, clean, { updatedAt: new Date().toISOString() });
  appendEvent(state, "quest.updated", quest, { fields: Object.keys(clean) }, context.source || "api");
  touch(state);
  return quest;
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
  if (!['up', 'down'].includes(direction)) throw new DomainError(400, "invalid_direction", "direction must be up or down.");
  const quest = state.tasks.find((item) => item.id === questId);
  if (!quest) throw new DomainError(404, "quest_not_found", "Quest not found.");
  if (quest.kind === "reward") return buyReward(state, questId, context);

  const positive = direction === "up";
  const scale = difficultyScale(quest.difficulty);
  let reward = { gems: 0, xp: 0, mp: 0 };
  let rewardGranted = false;
  let eventType = "quest.scored";

  if (quest.kind === "daily" || quest.kind === "todo") {
    if (!positive) {
      quest.done = false;
      state.character.hp = Math.max(0, state.character.hp - Math.round(5 * scale));
      eventType = "quest.failed";
    } else if (quest.done) {
      quest.done = false;
      eventType = "quest.reopened";
    } else {
      quest.done = true;
      quest.lastCompletedDate = context.date || todayText();
      const key = completionKey(quest, quest.lastCompletedDate);
      if (!state.rewardClaims[key]) {
        state.rewardClaims[key] = new Date().toISOString();
        reward = rewardDelta(quest);
        state.character.gems += reward.gems;
        grantXp(state.character, reward.xp);
        state.battle.mp = Math.min(state.battle.maxMp, state.battle.mp + reward.mp);
        rewardGranted = true;
      }
      if (quest.kind === "daily" && rewardGranted) quest.streak = Number(quest.streak || 0) + 1;
      eventType = "quest.scored";
    }
  } else if (quest.kind === "habit") {
    quest.value = Math.max(-20, Math.min(20, Number(quest.value || 0) + (positive ? 1 : -1)));
    if (positive) {
      reward = rewardDelta(quest);
      state.character.gems += reward.gems;
      grantXp(state.character, reward.xp);
      state.battle.mp = Math.min(state.battle.maxMp, state.battle.mp + reward.mp);
      rewardGranted = true;
    } else {
      state.character.hp = Math.max(0, state.character.hp - Math.round(4 * scale));
    }
  }

  quest.updatedAt = new Date().toISOString();
  const event = appendEvent(state, eventType, quest, { direction, reward, rewardGranted }, context.source || "api");
  touch(state);
  return { quest, reward, rewardGranted, character: characterState(state), battle: state.battle, event };
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
  return { quest, cost, character: characterState(state), event };
}

export function characterState(state) {
  ensureState(state);
  return {
    ...state.character,
    mp: state.battle.mp,
    maxMp: state.battle.maxMp,
    boss: state.boss,
  };
}

export function listEvents(state, limit = 50) {
  ensureState(state);
  return state.taskEvents.slice(0, Math.max(1, Math.min(250, Number(limit) || 50)));
}

export function touch(state) {
  state.schemaVersion = Math.max(3, Number(state.schemaVersion || 0));
  state.updatedAt = new Date().toISOString();
  return state;
}

export function assertScope(scopes, required) {
  if (!scopes?.includes(required)) throw new DomainError(403, "insufficient_scope", `Required scope: ${required}`);
}

