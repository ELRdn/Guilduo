/**
 * LPv2 demo state machine (pure, deterministic).
 *
 * Page UI, timers, DOM, and network live outside this module.
 * This module only maps (state, event) -> next state.
 */

export type DemoState =
  | "intro"
  | "delegated"
  | "first_result"
  | "human_task"
  | "paused"
  | "feedback"
  | "revised"
  | "no_change"
  | "completing"
  | "complete";

export type DemoEvent =
  | "start"
  | "advance"
  | "hold"
  | "resume"
  | "feedback"
  | "approve"
  | "restart";

export const initialState: DemoState = "intro";

export function transition(state: DemoState, event: DemoEvent): DemoState {
  if (event === "restart") {
    return "intro";
  }

  switch (state) {
    case "intro":
      return event === "start" ? "delegated" : state;
    case "delegated":
      return event === "advance" ? "first_result" : state;
    case "first_result":
      return event === "advance" ? "human_task" : state;
    case "human_task":
      if (event === "hold") return "paused";
      if (event === "feedback") return "feedback";
      if (event === "approve") return "no_change";
      return state;
    case "paused":
      return event === "resume" ? "human_task" : state;
    case "feedback":
      return event === "advance" ? "revised" : state;
    case "no_change":
      return event === "advance" ? "completing" : state;
    case "revised":
      return event === "approve" ? "completing" : state;
    case "completing":
      return event === "advance" ? "complete" : state;
    case "complete":
      return state;
    default:
      return state;
  }
}
