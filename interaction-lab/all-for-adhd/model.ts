import { tx } from "./copy.ts";
import type { Quest } from "../../types/questforge.ts";

/** Where a Quest belongs on the All for ADHD surface. */
export type Bucket = "review" | "today" | "later" | "inbox" | "agent" | "decision";

export const ESTIMATES = [5, 15, 30, 60] as const;

export function isOpen(quest: Quest): boolean {
  return quest.lifecycleState === "active" && !quest.done && quest.kind !== "reward";
}

/** A human decision is owed: an Agent finished and wants review, or someone asked for a reply. */
export function needsDecision(quest: Quest): boolean {
  return isOpen(quest) && (quest.humanRequest ? quest.humanRequest.status === "pending" : quest.assignee.type === "agent" && quest.assignee.handoffState === "review_required");
}

/** Review requests are conversations, not tasks: once answered or put off they leave the task lists. */
const isSettledRequest = (quest: Quest) => quest.humanRequest != null && quest.humanRequest.status !== "pending";

/** Agent handoff states in plain words. */
export const AGENT_STATE: Readonly<Record<string, string>> = {
  none: tx("担当"), ready: tx("受け取り待ち"), working: tx("作業中"), blocked: tx("止まっている"), review_required: tx("確認してほしい"), accepted: tx("受け取り済み"),
};
export const AGENT_STATE_ORDER = ["blocked", "working", "ready", "accepted", "none"] as const;

/** Completing a task does not reset its handoff state, so a finished task must not count as running. */
export function isWorking(quest: Quest): boolean {
  return isOpen(quest) && quest.assignee.type === "self" && quest.assignee.handoffState === "working";
}

/** Dailies come back every day; their dates only mark when they began. */
const isDaily = (quest: Quest) => quest.kind === "daily";

/** Open tasks this one waits for ("先にやるタスク"). */
export function blockers(quest: Quest, quests: readonly Quest[]): Quest[] {
  const ids = new Set(quest.dependencyIds ?? []);
  return ids.size === 0 ? [] : quests.filter(q => ids.has(q.id) && isOpen(q));
}

/** A parent's open steps in working order: ready ones first, each group by creation. */
export function stepsOf(parent: Quest, quests: readonly Quest[]): Quest[] {
  return quests.filter(q => q.parentQuestId === parent.id && isOpen(q))
    .sort((a, b) => Number(blockers(a, quests).length > 0) - Number(blockers(b, quests).length > 0) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.title.localeCompare(b.title));
}

export function bucketOf(quest: Quest, today: string): Bucket {
  if (needsDecision(quest)) return "decision";
  if (quest.assignee.type !== "self") return "agent";
  if (isDaily(quest)) return "today";
  const start = quest.scheduledDate || quest.dueDate;
  if (!start) return "inbox";
  // "until due" work stays on today from its start until the due date.
  if (quest.planningMode === "until_due" && quest.dueDate && start <= today && today <= quest.dueDate) return "today";
  if (start === today) return "today";
  return start < today ? "review" : "later";
}

const byTime = (a: Quest, b: Quest) => (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99");
const byDate = (a: Quest, b: Quest) => (a.scheduledDate || a.dueDate).localeCompare(b.scheduledDate || b.dueDate);
const byRecent = (a: Quest, b: Quest) => b.updatedAt.localeCompare(a.updatedAt);

/**
 * The order in which the Now screen offers work: what is already running,
 * then today's plan, then things to review, then the inbox, then later work.
 * Only the person's own open tasks are offered; Agent work is never "next".
 */
export function nextCandidates(quests: readonly Quest[], today: string): Quest[] {
  // A parent with open steps is a container: its steps are offered instead. Waiting steps are not offered yet.
  const containers = new Set(quests.filter(q => q.parentQuestId && isOpen(q)).map(q => q.parentQuestId));
  const mine = quests.filter(q => isOpen(q) && !needsDecision(q) && !isSettledRequest(q) && q.assignee.type === "self"
    && !containers.has(q.id) && blockers(q, quests).length === 0);
  const of = (bucket: Bucket) => mine.filter(q => !isWorking(q) && bucketOf(q, today) === bucket);
  return [
    ...mine.filter(isWorking),
    ...of("today").sort(byTime),
    ...of("review").sort(byDate),
    ...of("inbox").sort(byRecent),
    ...of("later").sort(byDate),
  ];
}

export function groups(quests: readonly Quest[], today: string): Record<Bucket, Quest[]> {
  const result: Record<Bucket, Quest[]> = { decision: [], review: [], today: [], later: [], inbox: [], agent: [] };
  // Undated steps are shown under their open parent, not again in the inbox.
  const parents = new Set(quests.filter(isOpen).map(q => q.id));
  for (const quest of quests) {
    if (!isOpen(quest) || isSettledRequest(quest) || (quest.parentQuestId && parents.has(quest.parentQuestId) && !quest.scheduledDate && !quest.dueDate)) continue;
    result[bucketOf(quest, today)].push(quest);
  }
  result.today.sort(byTime);
  result.review.sort(byDate);
  result.later.sort(byDate);
  result.inbox.sort(byRecent);
  return result;
}

export function plannedMinutes(quests: readonly Quest[]): number {
  return quests.reduce((sum, quest) => sum + (quest.estimatedMinutes > 0 ? quest.estimatedMinutes : 0), 0);
}

export function minutesLabel(total: number): string {
  if (total <= 0) return tx("0分");
  const hours = Math.floor(total / 60), minutes = total % 60;
  return hours === 0 ? tx("{count}分", { count: minutes }) : minutes === 0 ? tx("{count}時間", { count: hours }) : tx("{hours}時間{minutes}分", { hours, minutes });
}

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Whether a Quest sits on a calendar day: its planned day, or every day of an "until due" span. */
export function onDay(quest: Quest, date: string): boolean {
  if (isDaily(quest)) return !quest.scheduledDate || quest.scheduledDate <= date;
  const start = quest.scheduledDate || quest.dueDate;
  if (!start) return false;
  if (quest.planningMode === "until_due" && quest.dueDate && start <= date && date <= quest.dueDate) return true;
  return start === date;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function clock(minutes: number): string {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
}

/** Untimed tasks have no length on the timeline; a short default keeps the rail readable. */
export const DEFAULT_BLOCK = 15;
export const endOf = (quest: Quest) => toMinutes(quest.scheduledTime) + (quest.estimatedMinutes > 0 ? quest.estimatedMinutes : DEFAULT_BLOCK);

export interface DayPlan {
  readonly anytime: Quest[];
  readonly timed: Quest[];
}

/** One day of the timeline. Completed Quests stay visible (ticked) on the day they were planned for. */
export function dayPlan(quests: readonly Quest[], date: string): DayPlan {
  const visible = quests.filter(q => q.kind !== "reward" && q.lifecycleState !== "archived" && (isOpen(q) || q.done) && onDay(q, date))
    .map(q => isDaily(q) ? { ...q, done: q.lastCompletedDate === date } as Quest : q);
  const timed = visible.filter(q => q.scheduledTime && q.scheduledDate === date);
  return {
    anytime: visible.filter(q => !timed.includes(q)).sort((a, b) => Number(a.done) - Number(b.done)),
    timed: timed.sort(byTime),
  };
}

/** Free stretches of at least `min` minutes between timed tasks. */
export function gaps(timed: readonly Quest[], min = 30): { start: number; minutes: number; before: string }[] {
  const result: { start: number; minutes: number; before: string }[] = [];
  let cursor = -1;
  for (const quest of timed) {
    const start = toMinutes(quest.scheduledTime);
    if (cursor >= 0 && start - cursor >= min) result.push({ start: cursor, minutes: start - cursor, before: quest.id });
    cursor = Math.max(cursor, endOf(quest));
  }
  return result;
}

/** Free stretches still ahead today: clipped to `now`, at least 15 minutes. */
export function freeAhead(timed: readonly Quest[], now: number): { start: number; minutes: number; before: string }[] {
  return gaps(timed, 1)
    .map(gap => ({ ...gap, start: Math.max(gap.start, now), minutes: gap.start + gap.minutes - Math.max(gap.start, now) }))
    .filter(gap => gap.minutes >= 15);
}

/**
 * One inbox task worth offering for a free stretch: the person's own, undated, with an estimate that fits.
 * Oldest first, so nothing lingers. Tasks without an estimate are never offered.
 */
export function fitForGap(quests: readonly Quest[], minutes: number, today: string): Quest | null {
  const parents = new Set(quests.filter(isOpen).map(q => q.id));
  return quests
    .filter(q => isOpen(q) && q.kind !== "reward" && !isSettledRequest(q) && bucketOf(q, today) === "inbox" && !(q.parentQuestId && parents.has(q.parentQuestId))
      && q.estimatedMinutes > 0 && q.estimatedMinutes <= minutes && blockers(q, quests).length === 0)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))[0] ?? null;
}

/** Monday-first week containing `date`. */
export function weekOf(date: string): string[] {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - weekday));
}
