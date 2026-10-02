import type { Quest } from "../../types/questforge.ts";
import { relayText, type RelayCopyKey } from "./relay-copy.ts";

export type QuestActionId = "start" | "edit" | "complete" | "stop" | "archive" | "reply";

export interface QuestActionState {
  readonly mode: "handoff-decision" | "self-task" | "read-only";
  readonly statusLabel: string;
  readonly actions: readonly QuestActionId[];
}

const ACTION_COPY: Readonly<Record<QuestActionId, RelayCopyKey>> = {
  start:"taskStart", edit:"taskEdit", complete:"taskComplete", stop:"taskStop", archive:"taskArchive", reply:"inbox",
};
export function questActionLabel(action: QuestActionId): string { return relayText(ACTION_COPY[action]); }

/** Selects the command surface from the real Quest owner and lifecycle. */
export function questActionState(quest: Quest | null): QuestActionState {
  if (quest === null) return { mode:"read-only", statusLabel:relayText("chooseQuest"), actions:[] };
  if (quest.lifecycleState === "archived") return { mode:"read-only", statusLabel:relayText("taskArchived"), actions:quest.humanRequest ? ["reply"] : [] };
  if (quest.done || quest.lifecycleState === "completed") return { mode:"read-only", statusLabel:relayText("taskClosed"), actions:quest.humanRequest ? ["reply"] : [] };
  if (quest.humanRequest) return { mode:"read-only", statusLabel:relayText("replyHint"), actions:["reply"] };
  if (quest.assignee.type === "agent" && quest.assignee.handoffState === "review_required") {
    return { mode:"handoff-decision", statusLabel:relayText("humanDecision"), actions:[] };
  }
  if (quest.assignee.type !== "self") {
    const statusLabel = quest.assignee.type === "agent" && quest.assignee.handoffState === "accepted"
      ? relayText("taskAgentAccepted")
      : relayText(quest.assignee.type === "human" ? "taskHumanHolding" : "taskAgentHolding");
    return { mode:"read-only", statusLabel, actions:["edit"] };
  }
  if (quest.assignee.handoffState === "working") {
    return { mode:"self-task", statusLabel:relayText("taskSelfWorking"), actions:["complete", "edit", "stop"] };
  }
  return { mode:"self-task", statusLabel:relayText("taskSelf"), actions:["start", "edit", "complete", "archive"] };
}
