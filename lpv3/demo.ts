/**
 * LPv3 demo state machine (pure, deterministic).
 *
 * Scenario: a bug report handed to an agent. The agent asks the human to pick
 * a fix, pushes back on a risky choice, then asks for a real-device check that
 * only the human can do. Page UI, timers and DOM live in experience.ts.
 */

export type DemoState =
  | "intro"
  | "investigating"
  | "choose"
  | "pushback"
  | "fixing"
  | "device_check"
  | "refixing"
  | "recheck"
  | "completing"
  | "complete";

export type DemoEvent = "start" | "advance" | "choose_a" | "choose_b" | "choose_c" | "works" | "broken" | "restart";

export const initialState: DemoState = "intro";

/** States that move on by themselves once the agent finishes its log. */
export const automaticStates: readonly DemoState[] = ["investigating", "fixing", "refixing", "completing"];

export function transition(state: DemoState, event: DemoEvent): DemoState {
  if (event === "restart") return "intro";
  switch (state) {
    case "intro":
      return event === "start" ? "investigating" : state;
    case "investigating":
      return event === "advance" ? "choose" : state;
    case "choose":
      if (event === "choose_c") return "pushback";
      return event === "choose_a" || event === "choose_b" ? "fixing" : state;
    case "pushback":
      return event === "choose_a" || event === "choose_b" ? "fixing" : state;
    case "fixing":
      return event === "advance" ? "device_check" : state;
    case "device_check":
      if (event === "broken") return "refixing";
      return event === "works" ? "completing" : state;
    case "refixing":
      return event === "advance" ? "recheck" : state;
    case "recheck":
      return event === "works" ? "completing" : state;
    case "completing":
      return event === "advance" ? "complete" : state;
    default:
      return state;
  }
}
