import type { Quest } from "../../types/questforge.ts";
import { relayText } from "./relay-copy.ts";

export type QuestActionId = "start" | "edit" | "complete" | "stop" | "archive" | "reply";

export interface QuestActionState {
  readonly mode: "handoff-decision" | "self-task" | "read-only";
  readonly statusLabel: string;
  readonly actions: readonly QuestActionId[];
}

/** Selects the command surface from the real Quest owner and lifecycle. */
export function questActionState(quest: Quest | null): QuestActionState {
  if (quest === null) return { mode: "read-only", statusLabel: "Quest を選択してください", actions: [] };
  if (quest.humanRequest) return { mode: "read-only", statusLabel: relayText("replyHint"), actions: ["reply"] };
  if (quest.assignee.type === "agent" && quest.assignee.handoffState === "review_required") {
    return { mode: "handoff-decision", statusLabel: "Human decision required", actions: [] };
  }
  if (quest.assignee.type !== "self") {
    const statusLabel = quest.assignee.handoffState === "accepted"
      ? "Agent の成果物を承認済みです"
      : "Agent がこの Quest を保持しています";
    return { mode: "read-only", statusLabel, actions: ["edit"] };
  }
  if (quest.done || quest.lifecycleState !== "active") {
    return { mode: "read-only", statusLabel: "この Quest は完了しています", actions: [] };
  }
  if (quest.assignee.handoffState === "working") {
    return { mode: "self-task", statusLabel: "あなたが実行中です", actions: ["complete", "edit", "stop"] };
  }
  return { mode: "self-task", statusLabel: "あなたの担当 Quest です", actions: ["start", "edit", "complete", "archive"] };
}
