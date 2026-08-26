import type { Quest } from "../../types/questforge.ts";

export type QuestActionId = "start" | "edit" | "complete" | "stop" | "archive";

export interface QuestActionState {
  readonly mode: "handoff-decision" | "self-task" | "read-only";
  readonly statusLabel: string;
  readonly actions: readonly QuestActionId[];
}

/** Selects the command surface from the real Quest owner and lifecycle. */
export function questActionState(quest: Quest | null): QuestActionState {
  if (quest === null) return { mode: "read-only", statusLabel: "Quest を選択してください", actions: [] };
  if (quest.assignee.type === "agent" && quest.assignee.handoffState === "review_required") {
    return { mode: "handoff-decision", statusLabel: "Human decision required", actions: [] };
  }
  if (quest.assignee.type !== "self") {
    return { mode: "read-only", statusLabel: "Agent がこの Quest を保持しています", actions: ["edit"] };
  }
  if (quest.done || quest.lifecycleState !== "active") {
    return { mode: "read-only", statusLabel: "この Quest は完了しています", actions: [] };
  }
  if (quest.assignee.handoffState === "working") {
    return { mode: "self-task", statusLabel: "あなたが実行中です", actions: ["complete", "edit", "stop"] };
  }
  return { mode: "self-task", statusLabel: "あなたの担当 Quest です", actions: ["start", "edit", "complete", "archive"] };
}
