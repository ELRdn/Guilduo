import test from "node:test";
import { strict as assert } from "node:assert";
import { initialState, transition } from "../lpv2/demo.ts";
import type { DemoState } from "../lpv2/demo.ts";

const allStates: DemoState[] = [
  "intro",
  "delegated",
  "first_result",
  "human_task",
  "paused",
  "feedback",
  "revised",
  "no_change",
  "completing",
  "complete",
];

test("initial state is intro", () => {
  assert.equal(initialState, "intro");
});

test("main revised path reaches complete", () => {
  assert.equal(transition("intro", "start"), "delegated");
  assert.equal(transition("delegated", "advance"), "first_result");
  assert.equal(transition("first_result", "advance"), "human_task");
  assert.equal(transition("human_task", "feedback"), "feedback");
  assert.equal(transition("feedback", "advance"), "revised");
  assert.equal(transition("revised", "approve"), "completing");
  assert.equal(transition("completing", "advance"), "complete");
});

test("no change path reaches complete", () => {
  let state: DemoState = initialState;
  state = transition(state, "start");
  state = transition(state, "advance");
  state = transition(state, "advance");
  assert.equal(state, "human_task");
  state = transition(state, "approve");
  assert.equal(state, "no_change");
  state = transition(state, "advance");
  assert.equal(state, "completing");
  state = transition(state, "advance");
  assert.equal(state, "complete");
});

test("hold and resume round-trips through paused", () => {
  assert.equal(transition("human_task", "hold"), "paused");
  assert.equal(transition("paused", "resume"), "human_task");
  let state: DemoState = "human_task";
  state = transition(state, "hold");
  state = transition(state, "resume");
  state = transition(state, "feedback");
  state = transition(state, "advance");
  assert.equal(state, "revised");
});

test("paused ignores unrelated events", () => {
  assert.equal(transition("paused", "advance"), "paused");
  assert.equal(transition("paused", "feedback"), "paused");
  assert.equal(transition("paused", "approve"), "paused");
  assert.equal(transition("paused", "hold"), "paused");
  assert.equal(transition("paused", "start"), "paused");
});

test("restart returns every state to intro", () => {
  for (const state of allStates) {
    assert.equal(transition(state, "restart"), "intro");
  }
});

test("invalid and duplicate events leave state unchanged", () => {
  assert.equal(transition("intro", "advance"), "intro");
  assert.equal(transition("intro", "feedback"), "intro");
  assert.equal(transition("intro", "approve"), "intro");
  assert.equal(transition("intro", "hold"), "intro");
  assert.equal(transition("intro", "resume"), "intro");
  assert.equal(transition("delegated", "start"), "delegated");
  assert.equal(transition("delegated", "feedback"), "delegated");
  assert.equal(transition("delegated", "approve"), "delegated");
  assert.equal(transition("first_result", "start"), "first_result");
  assert.equal(transition("first_result", "feedback"), "first_result");
  assert.equal(transition("human_task", "start"), "human_task");
  assert.equal(transition("human_task", "advance"), "human_task");
  assert.equal(transition("human_task", "resume"), "human_task");
  assert.equal(transition("feedback", "feedback"), "feedback");
  assert.equal(transition("feedback", "approve"), "feedback");
  assert.equal(transition("feedback", "start"), "feedback");
  assert.equal(transition("revised", "advance"), "revised");
  assert.equal(transition("revised", "feedback"), "revised");
  assert.equal(transition("no_change", "approve"), "no_change");
  assert.equal(transition("no_change", "feedback"), "no_change");
  assert.equal(transition("completing", "approve"), "completing");
  assert.equal(transition("completing", "start"), "completing");
  assert.equal(transition("complete", "start"), "complete");
  assert.equal(transition("complete", "advance"), "complete");
  assert.equal(transition("complete", "approve"), "complete");
  assert.equal(transition("complete", "feedback"), "complete");
  assert.equal(transition("complete", "hold"), "complete");
  assert.equal(transition("complete", "resume"), "complete");
});

test("transition is deterministic for repeated calls", () => {
  assert.equal(transition("human_task", "feedback"), transition("human_task", "feedback"));
  assert.equal(transition("paused", "resume"), transition("paused", "resume"));
  assert.equal(transition("revised", "approve"), transition("revised", "approve"));
});
