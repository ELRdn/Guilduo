import type { Quest, QuestDifficulty, QuestKind, QuestRepeat } from "./types/questforge.ts";

type CoreTask = Pick<Quest, "id" | "kind" | "difficulty" | "repeat" | "dueDate" | "negativeOnly" | "done" | "lifecycleState">;
type TaskEvent = Record<string, unknown>;
type RewardClaimResult = {
  granted: boolean;
  key: string;
  rewardClaims: Record<string, string>;
};

interface QuestForgeCoreApi {
  CURRENT_SCHEMA_VERSION: number;
  TASK_EVENT_LIMIT: number;
  appendTaskEvent(events: TaskEvent[] | null | undefined, event: TaskEvent, limit?: number): TaskEvent[];
  battleCommandCost(command: string, skillCost?: number): number;
  claimCompletion(rewardClaims: Record<string, string> | null | undefined, task: CoreTask, dateText: string, claimedAt: string): RewardClaimResult;
  completionClaimKey(task: CoreTask, dateText: string): string;
  difficultyScale(difficulty: QuestDifficulty): number;
  isBattleTaskEligible(task: CoreTask | null | undefined): boolean;
  isArchivedTask(task: CoreTask | null | undefined): boolean;
  isCompletedTask(task: CoreTask | null | undefined): boolean;
  nextDueDateForTask(task: CoreTask, fromDateText: string): string;
  taskRewardDelta(task: CoreTask, weakKind?: string): { gems: number; xp: number; mp: number };
}

interface QuestForgeCoreRoot {
  QuestForgeCore?: QuestForgeCoreApi;
}

declare const module: { exports: QuestForgeCoreApi };

const CURRENT_SCHEMA_VERSION = 7;
const TASK_EVENT_LIMIT = 250;

function difficultyScale(difficulty: QuestDifficulty): number {
  const scales: Record<QuestDifficulty, number> = {
    trivial: 0.5,
    easy: 1,
    medium: 1.5,
    hard: 2.5,
  };
  return scales[difficulty] || 1;
}

function completionClaimKey(task: CoreTask, dateText: string): string {
  if (task.kind === "daily") {
    return `${task.id}:daily:${dateText}`;
  }
  if (task.kind === "todo" && task.repeat && task.repeat !== "none") {
    return `${task.id}:todo:${task.dueDate || dateText}`;
  }
  return `${task.id}:todo:once`;
}

function claimCompletion(
  rewardClaims: Record<string, string> | null | undefined,
  task: CoreTask,
  dateText: string,
  claimedAt: string,
): RewardClaimResult {
  const key = completionClaimKey(task, dateText);
  const claims = rewardClaims && typeof rewardClaims === "object" ? rewardClaims : {};
  if (claims[key]) {
    return { granted: false, key, rewardClaims: { ...claims } };
  }
  return {
    granted: true,
    key,
    rewardClaims: { ...claims, [key]: claimedAt },
  };
}

function taskRewardDelta(task: CoreTask, weakKind = ""): { gems: number; xp: number; mp: number } {
  const scale = difficultyScale(task.difficulty);
  const baseMp: Record<QuestKind, number> = {
    habit: 6,
    daily: 14,
    todo: 20,
    reward: 0,
  };
  const weakBonus = weakKind === task.kind ? 4 : 0;
  const base = baseMp[task.kind] || 0;
  return {
    gems: Math.round(7 * scale),
    xp: Math.round(12 * scale),
    mp: base ? Math.max(1, Math.round(base * scale + weakBonus)) : 0,
  };
}

function appendTaskEvent(events: TaskEvent[] | null | undefined, event: TaskEvent, limit = TASK_EVENT_LIMIT): TaskEvent[] {
  const current = Array.isArray(events) ? events : [];
  return [event, ...current].slice(0, limit);
}

function isArchivedTask(task: CoreTask | null | undefined): boolean {
  return Boolean(task && task.lifecycleState === "archived");
}

function isCompletedTask(task: CoreTask | null | undefined): boolean {
  return Boolean(task && task.lifecycleState === "completed");
}

// function isBattleTaskEligible(task)
function isBattleTaskEligible(task: CoreTask | null | undefined): boolean {
  if (!task || !["habit", "daily", "todo"].includes(task.kind)) return false;
  if (task.negativeOnly) return false;
  if (["completed", "archived"].includes(task.lifecycleState)) return false;
  return task.kind === "habit" || !task.done;
}

function battleCommandCost(command: string, skillCost = 0): number {
  const costs: Record<string, number> = {
    attack: 0,
    skill: skillCost,
    guard: 6,
    heal: 14,
    burst: 40,
  };
  return costs[command] || 0;
}

function nextDueDateForTask(task: CoreTask, fromDateText: string): string {
  const repeat: QuestRepeat = task.repeat || (task.kind === "daily" ? "daily" : "none");
  if (repeat === "none") {
    return task.dueDate || fromDateText;
  }
  let cursor = task.dueDate && task.dueDate >= fromDateText
    ? parseLocalDate(task.dueDate)
    : parseLocalDate(fromDateText);

  if (repeat === "daily") {
    return formatDateInput(cursor);
  }
  if (repeat === "weekdays") {
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor = addDays(cursor, 1);
    }
    return formatDateInput(cursor);
  }
  if (repeat === "weekly") {
    const base = task.dueDate ? parseLocalDate(task.dueDate) : cursor;
    const weekday = base.getDay();
    while (cursor.getDay() !== weekday || formatDateInput(cursor) < fromDateText) {
      cursor = addDays(cursor, 1);
    }
    return formatDateInput(cursor);
  }
  if (repeat === "monthly") {
    const base = task.dueDate ? parseLocalDate(task.dueDate) : cursor;
    const day = base.getDate();
    let candidate = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, daysInMonth(cursor)));
    while (formatDateInput(candidate) < fromDateText) {
      const nextMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 1);
      candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(day, daysInMonth(nextMonth)));
    }
    return formatDateInput(candidate);
  }
  return task.dueDate || fromDateText;
}

function parseLocalDate(dateText: string): Date {
  return new Date(`${dateText}T00:00:00`);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const api: QuestForgeCoreApi = {
  CURRENT_SCHEMA_VERSION,
  TASK_EVENT_LIMIT,
  appendTaskEvent,
  battleCommandCost,
  claimCompletion,
  completionClaimKey,
  difficultyScale,
  isBattleTaskEligible,
  isArchivedTask,
  isCompletedTask,
  nextDueDateForTask,
  taskRewardDelta,
};

const runtimeRoot = globalThis as unknown as QuestForgeCoreRoot;
runtimeRoot.QuestForgeCore = api;

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

export {
  CURRENT_SCHEMA_VERSION,
  TASK_EVENT_LIMIT,
  appendTaskEvent,
  battleCommandCost,
  claimCompletion,
  completionClaimKey,
  difficultyScale,
  isBattleTaskEligible,
  isArchivedTask,
  isCompletedTask,
  nextDueDateForTask,
  taskRewardDelta,
};
