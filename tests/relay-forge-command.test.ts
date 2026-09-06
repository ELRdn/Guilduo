import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canTransition,
  explainFailure,
  normalizeCommandModel,
  placeholderActor,
  resolveActors,
  runHandoff,
} from "../interaction-lab/relay-forge/adapter.ts";
import { blockingReason, submitDecision } from "../interaction-lab/relay-forge/decision.ts";
import type { Quest } from "../types/questforge.ts";
import { transitionQuestHandoff } from "../server/questforge-domain.ts";
import { questActionState } from "../interaction-lab/relay-forge/quest-actions.ts";
import { weaveQuestRows } from "../interaction-lab/relay-forge/primitives/spine-model.ts";

/**
 * These tests run the Command adapter against the real domain, not against the
 * screen fixtures: identity comes from the same profile/agent record shapes the
 * repository returns, and the Handoff port is backed by
 * `server/questforge-domain.ts` so the transition rules under test are the ones
 * production enforces.
 */

function buildQuest(overrides: Partial<Quest> & Pick<Quest, "id" | "title">): Quest {
  return {
    kind: "todo",
    notes: "",
    category: "delivery",
    tags: [],
    difficulty: "medium",
    repeat: "none",
    planningState: "scheduled",
    lifecycleState: "active",
    planningMode: "on_date",
    scheduledDate: "2026-08-25",
    scheduledTime: "",
    dueDate: "2026-08-27",
    estimatedMinutes: 60,
    actualMinutes: 0,
    manualActualMinutes: 0,
    togglActualMinutes: 0,
    completionCriteria: "",
    nextAction: "",
    impact: "medium",
    isBlockingOthers: false,
    rolloverCount: 0,
    dependencyIds: [],
    parentQuestId: "",
    completedAt: "",
    archivedAt: "",
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-25T09:00:00.000Z",
    done: false,
    assignee: { type: "agent", id: "forge-runner", label: "Forge Runner", handoffState: "review_required" },
    handoff: {
      note: "",
      blockedReason: "",
      artifactUrl: "",
      startedAt: "2026-08-25T09:20:00.000Z",
      reviewRequestedAt: "2026-08-25T10:52:00.000Z",
      reviewedAt: "",
      reviewedBy: "",
    },
    externalLinks: [],
    ...overrides,
  };
}

/** A HandoffPort backed by the real domain function, not by screen fixtures. */
function domainPort(quests: Quest[]) {
  const state = {
    schemaVersion: 5,
    tasks: quests,
    events: [] as unknown[],
  } as unknown as Parameters<typeof transitionQuestHandoff>[0];
  const current = (questId: string): Quest =>
    (state as unknown as { tasks: Quest[] }).tasks.find((task) => task.id === questId) as Quest;
  return {
    state,
    current,
    async transitionHandoff(questId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
      try {
        return transitionQuestHandoff(state, questId, input) as unknown as Record<string, unknown>;
      } catch (error) {
        // Mirrors how QuestForgeRepository surfaces a domain error.
        const domainError = error as { status?: number; code?: string; message?: string };
        throw { status: domainError.status, code: domainError.code, message: domainError.message };
      }
    },
  };
}

test("identity resolves from the profile and Agent registry, not from screen fixtures", () => {
  const actors = resolveActors(
    {
      uid: "uid-1",
      displayName: "Hironao",
      handle: "hironao",
      avatarUrl: "data:image/webp;base64,AAAA",
      avatarRole: "operator",
      avatarVariant: "masc",
    },
    [{ agentId: "forge-runner", displayName: "Forge Runner", provider: "generic", role: "builder" }],
  );

  const human = actors.get("u-uid-1");
  assert.ok(human, "the signed-in profile becomes an actor");
  assert.equal(human.kind, "human");
  assert.equal(human.avatarUrl, "data:image/webp;base64,AAAA");
  assert.equal(human.avatarRole, "operator");
  assert.equal(human.avatarVariant, "masc");
  assert.equal(human.initials, "ME", "the signed-in Human uses a stable self marker instead of clipped name text");

  const agent = actors.get("forge-runner");
  assert.ok(agent, "registered agents become actors");
  assert.equal(agent.kind, "agent");
  assert.equal(agent.provider, "generic");
  assert.equal(agent.avatarUrl, undefined, "an agent never borrows a human portrait");
});

test("Quest Loom keeps the source order when the selected hub changes", () => {
  const model = normalizeCommandModel({
    profile: { uid: "uid-1", displayName: "Hironao" },
    agents: [],
    quests: [
      buildQuest({ id: "q-a", title: "A", dependencyIds: [] }),
      buildQuest({ id: "q-b", title: "B", dependencyIds: ["q-a"] }),
      buildQuest({ id: "q-c", title: "C", dependencyIds: ["q-b"] }),
      buildQuest({ id: "q-d", title: "D", dependencyIds: [] }),
    ],
    syncLabel: "10:52",
  });
  const source = model.quests.map((quest) => quest.id);
  assert.deepEqual(weaveQuestRows(model.quests, "q-b").map((row) => row.quest.id), source);
  assert.deepEqual(weaveQuestRows(model.quests, "q-c").map((row) => row.quest.id), source);
  assert.equal(weaveQuestRows(model.quests, "q-b").find((row) => row.quest.id === "q-b")?.relation, "hub");
});

test("Relay Forge loading bootstrap announces status without focusing its heading", () => {
  const main = readFileSync(new URL("../interaction-lab/relay-forge/main.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../interaction-lab/relay-forge/foundation.css", import.meta.url), "utf8");
  assert.match(main, /kind === "loading"[\s\S]*role", "status"/);
  assert.match(main, /if \(kind !== "loading"\) heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /\.rf-bootstrap h1:focus\s*\{\s*outline:\s*none;/);
  assert.doesNotMatch(css, /\.rf-bootstrap button:focus[^}]*outline:\s*none/s, "real controls keep their focus ring");
});

test("an actor with no profile or registry entry gets a placeholder, never a portrait", () => {
  const actor = placeholderActor("s-sync", "system");
  assert.equal(actor.kind, "system");
  assert.equal(actor.avatarUrl, undefined);
  assert.equal(actor.avatarRole, undefined);
  assert.ok(actor.initials.length > 0);
});

test("only one identity entry exists per actor id across every surface", () => {
  const model = normalizeCommandModel({
    profile: { uid: "uid-1", displayName: "Hironao", avatarRole: "operator", avatarVariant: "masc" },
    agents: [{ agentId: "forge-runner", displayName: "Forge Runner", provider: "generic" }],
    quests: [buildQuest({ id: "q-1", title: "Contract" })],
    syncLabel: "10:52",
  });
  const ids = [...model.actors.keys()];
  assert.equal(new Set(ids).size, ids.length, "the identity map has no duplicate ids");
  const quest = model.quests[0];
  for (const leg of quest.relay.legs) {
    assert.ok(model.actors.has(leg.actorId), `relay actor ${leg.actorId} resolves from the same map`);
  }
});

test("an archived Quest is excluded from the operational Command model", () => {
  const model = normalizeCommandModel({
    profile: { uid: "uid-1", displayName: "Hironao" },
    agents: [],
    quests: [buildQuest({
      id: "q-archived",
      title: "Archived completion",
      done: true,
      lifecycleState: "archived",
      assignee: { type: "self", id: "uid-1", label: "Hironao", handoffState: "none" },
    })],
    syncLabel: "10:52",
  });

  assert.equal(model.quests.length, 0);
  assert.equal(model.interventions.length, 0);
});

test("accepting a Handoff keeps unfinished work open and uses the registered identities", () => {
  const quest = buildQuest({ id: "q-open", title: "Still needs final delivery", assignee: { type: "agent", id: "my-codex", label: "My Codex", handoffState: "accepted" }, done: false, lifecycleState: "active" });
  const model = normalizeCommandModel({ profile: { uid: "real-user", displayName: "My Name" }, agents: [{ agentId: "my-codex", displayName: "My Codex" }], quests: [quest], syncLabel: "Now" });
  assert.equal(model.quests[0]?.state, "ready");
  assert.notEqual(model.quests[0]?.relay.legs.at(-1)?.nodeState, "completed");
  assert.ok([...model.actors.values()].some((actor) => actor.name === "My Name"));
  assert.ok([...model.actors.values()].some((actor) => actor.name === "My Codex"));
});
test("a self-owned planned Quest exposes task actions instead of Handoff decisions", () => {
  const quest = buildQuest({
    id: "q-self",
    title: "Daily review",
    assignee: { type: "self", id: "uid-1", label: "Hironao", handoffState: "none" },
  });
  assert.deepEqual(questActionState(quest), {
    mode: "self-task",
    statusLabel: "あなたの担当 Quest です",
    actions: ["start", "edit", "complete", "archive"],
  });
});

test("Request revision remains exclusive to Agent review", () => {
  const review = buildQuest({ id: "q-review", title: "Review" });
  assert.equal(questActionState(review).mode, "handoff-decision");
  const working = buildQuest({
    id: "q-agent",
    title: "Working",
    assignee: { type: "agent", id: "forge-runner", label: "Forge Runner", handoffState: "working" },
  });
  assert.deepEqual(questActionState(working), {
    mode: "read-only",
    statusLabel: "Agent がこの Quest を保持しています",
    actions: ["edit"],
  });
});
test("the transition table matches the domain", () => {
  assert.equal(canTransition("review_required", "accepted"), true);
  assert.equal(canTransition("review_required", "working"), true);
  assert.equal(canTransition("review_required", "ready"), false);
  assert.equal(canTransition("accepted", "accepted"), false);
});

test("approve runs a dry run before it writes, and the domain applies it", async () => {
  const port = domainPort([buildQuest({ id: "q-1", title: "Contract" })]);

  const preview = await runHandoff(port, {
    questId: "q-1",
    state: "accepted",
    expectedState: "review_required",
    dryRun: true,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.dryRun, true);
  assert.equal(port.current("q-1").assignee.handoffState, "review_required", "a preview must not write");

  const applied = await runHandoff(port, {
    questId: "q-1",
    state: "accepted",
    expectedState: "review_required",
    dryRun: false,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.dryRun, false);
  assert.ok(applied.quest, "the Quest comes back from the domain, not from the UI");
  const after = port.current("q-1");
  assert.equal(after.assignee.handoffState, "accepted");
  assert.equal(after.done, false, "an accepted handoff is not a completed Quest");
  assert.equal(after.lifecycleState, "active");
});

test("expectedState mismatch is refused as a conflict and writes nothing", async () => {
  const port = domainPort([buildQuest({ id: "q-1", title: "Contract" })]);
  const outcome = await runHandoff(port, {
    questId: "q-1",
    state: "accepted",
    expectedState: "working",
    dryRun: false,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "invalid_handoff_transition", "the guard rejects before a request is sent");
  assert.equal(port.current("q-1").assignee.handoffState, "review_required");
});

test("a stale expectedState reaching the domain returns stale_handoff_state", async () => {
  const port = domainPort([buildQuest({ id: "q-1", title: "Contract", assignee: { type: "agent", id: "forge-runner", label: "Forge Runner", handoffState: "working" } })]);
  const outcome = await runHandoff(port, {
    questId: "q-1",
    state: "accepted",
    expectedState: "review_required",
    dryRun: false,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "stale_handoff_state");
  assert.equal(port.current("q-1").assignee.handoffState, "working", "a conflict leaves the Quest untouched");
});

test("a non-agent Quest cannot be handed off", async () => {
  const quest = buildQuest({
    id: "q-2",
    title: "Self work",
    assignee: { type: "self", id: "me", label: "Me", handoffState: "review_required" },
  });
  const port = domainPort([quest]);
  const outcome = await runHandoff(port, {
    questId: "q-2",
    state: "accepted",
    expectedState: "review_required",
    dryRun: false,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "agent_assignee_required");
});

test("request revision carries its reason as the handoff note", async () => {
  const port = domainPort([buildQuest({ id: "q-1", title: "Contract" })]);
  const result = await submitDecision(
    port,
    { kind: "revise", questId: "q-1", expectedState: "review_required", reason: "権限セクションを直してください" },
    { evidenceReviewed: true, writeLocked: false, permissionMissing: null, conflict: null },
    "idle",
    () => undefined,
  );
  assert.equal(result.phase, "succeeded");
  const revised = port.current("q-1");
  assert.equal(revised.assignee.handoffState, "working");
  assert.equal(revised.handoff.note, "権限セクションを直してください");
});

test("an empty revision reason never reaches the domain", async () => {
  const port = domainPort([buildQuest({ id: "q-1", title: "Contract" })]);
  const result = await submitDecision(
    port,
    { kind: "revise", questId: "q-1", expectedState: "review_required", reason: "   " },
    { evidenceReviewed: true, writeLocked: false, permissionMissing: null, conflict: null },
    "idle",
    () => undefined,
  );
  assert.equal(result.phase, "failed");
  assert.equal(result.code, "reason_required");
  assert.equal(port.current("q-1").assignee.handoffState, "review_required");
});

test("every gate blocks a write, in the documented precedence", async () => {
  const base = { evidenceReviewed: true, writeLocked: false, permissionMissing: null, conflict: null };
  assert.equal(blockingReason(base, "idle"), null);
  assert.match(String(blockingReason({ ...base, evidenceReviewed: false }, "idle")), /確認|checked/);
  assert.match(String(blockingReason({ ...base, writeLocked: true }, "idle")), /再接続/);
  assert.match(String(blockingReason({ ...base, conflict: "conflict" }, "idle")), /conflict/);
  assert.equal(blockingReason({ ...base, permissionMissing: "scope" }, "idle"), "scope");
  assert.match(String(blockingReason(base, "submitting")), /送信中/);

  const port = domainPort([buildQuest({ id: "q-1", title: "Contract" })]);
  const result = await submitDecision(
    port,
    { kind: "approve", questId: "q-1", expectedState: "review_required", reason: "" },
    { ...base, writeLocked: true },
    "idle",
    () => undefined,
  );
  assert.equal(result.phase, "failed");
  assert.equal(port.current("q-1").assignee.handoffState, "review_required", "a blocked decision writes nothing");
});

test("a double submit is refused rather than queued", async () => {
  const port = domainPort([buildQuest({ id: "q-1", title: "Contract" })]);
  const result = await submitDecision(
    port,
    { kind: "approve", questId: "q-1", expectedState: "review_required", reason: "" },
    { evidenceReviewed: true, writeLocked: false, permissionMissing: null, conflict: null },
    "submitting",
    () => undefined,
  );
  assert.equal(result.phase, "failed");
  assert.equal(port.current("q-1").assignee.handoffState, "review_required");
});

test("failure explanations never leak a token, URL or raw payload", () => {
  for (const code of ["stale_handoff_state", "insufficient_scope", "http_401", "quest_not_found", "unknown"]) {
    const message = explainFailure(code);
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /https?:\/\//, "no URL in a user-facing failure message");
    assert.doesNotMatch(message, /Bearer|token|authorization/i, "no credential in a user-facing failure message");
  }
});
