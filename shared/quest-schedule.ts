import type { Quest } from "../types/questforge.ts";
import { nextDueDateForTask } from "../questforge-core.ts";

export const isRecurringQuest = (quest: Pick<Quest, "kind" | "repeat">): boolean => quest.kind === "daily" || quest.kind === "todo" && Boolean(quest.repeat && quest.repeat !== "none");

/** Calendar dates, not UTC instants; retain the existing due-date recurrence anchor. */
export function occursOnDate(quest: Quest, date: string): boolean {
  if (!isRecurringQuest(quest)) return false;
  if (quest.scheduledDate && quest.scheduledDate > date) return false;
  const anchor = quest.dueDate || quest.scheduledDate || quest.createdAt?.slice(0, 10) || date;
  return nextDueDateForTask({ ...quest, repeat: quest.repeat && quest.repeat !== "none" ? quest.repeat : "daily", dueDate: anchor }, date) === date;
}
