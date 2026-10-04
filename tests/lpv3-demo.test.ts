import test from "node:test";
import { strict as assert } from "node:assert";
import { automaticStates, initialState, transition } from "../lpv3/demo.ts";
import type { DemoEvent, DemoState } from "../lpv3/demo.ts";

const allStates: DemoState[] = ["intro", "investigating", "choose", "pushback", "fixing", "device_check", "refixing", "recheck", "completing", "complete"];
const allEvents: DemoEvent[] = ["start", "advance", "choose_a", "choose_b", "choose_c", "works", "broken", "restart"];

function run(events: DemoEvent[]): DemoState {
  return events.reduce(transition, initialState);
}

test("shortest path: pick a fix, device works, complete", () => {
  assert.equal(run(["start", "advance", "choose_a", "advance", "works", "advance"]), "complete");
  assert.equal(run(["start", "advance", "choose_b", "advance", "works", "advance"]), "complete");
});

test("risky fix is pushed back and must be replaced by A or B", () => {
  assert.equal(run(["start", "advance", "choose_c"]), "pushback");
  assert.equal(transition("pushback", "choose_c"), "pushback");
  assert.equal(run(["start", "advance", "choose_c", "choose_b"]), "fixing");
});

test("a failed device check triggers one more fix and recheck", () => {
  const state = run(["start", "advance", "choose_a", "advance", "broken", "advance"]);
  assert.equal(state, "recheck");
  assert.equal(transition(state, "broken"), "recheck");
  assert.equal(transition(state, "works"), "completing");
});

test("automatic states only move on advance", () => {
  for (const state of automaticStates) {
    for (const event of allEvents) {
      if (event === "advance" || event === "restart") continue;
      assert.equal(transition(state, event), state, `${state} + ${event}`);
    }
    assert.notEqual(transition(state, "advance"), state);
  }
});

test("human states ignore advance, complete is terminal, restart always resets", () => {
  for (const state of ["intro", "choose", "pushback", "device_check", "recheck"] as DemoState[]) {
    assert.equal(transition(state, "advance"), state);
  }
  for (const event of allEvents) {
    if (event !== "restart") assert.equal(transition("complete", event), "complete");
  }
  for (const state of allStates) assert.equal(transition(state, "restart"), "intro");
});
