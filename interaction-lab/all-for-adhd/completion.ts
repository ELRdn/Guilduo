import type { Quest } from "../../types/questforge.ts";
import { isRecurringQuest, occursOnDate } from "../../shared/quest-schedule.ts";

/** The scoring API toggles the stored flag: reopen yesterday's daily before scoring today. */
export async function completeToday<T>(
  shown: Quest, current: Quest, today: string,
  update: (quest: Quest, patch: Record<string, unknown>) => Promise<Quest>,
  score: (quest: Quest) => Promise<T>,
): Promise<T> {
  if (shown.id !== current.id || shown.updatedAt !== current.updatedAt) throw new Error("quest_conflict");
  if (current.lifecycleState === "archived" || (current.done && (!isRecurringQuest(current) || current.lastCompletedDate === today))) throw new Error("already_completed");
  if (isRecurringQuest(current) && !occursOnDate(current, today)) throw new Error("quest_not_due");
  let quest = current;
  if (quest.kind === "daily" && quest.done && quest.lastCompletedDate !== today && quest.lifecycleState !== "archived") {
    quest = await update(quest, { lifecycleState: "active", expectedUpdatedAt: quest.updatedAt });
  }
  return score(quest);
}
