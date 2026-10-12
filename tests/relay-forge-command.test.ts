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
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { setLocale, SUPPORTED_LOCALES, t } from "../i18n.ts";
import { countLabel } from "../interaction-lab/relay-forge/screens/screen-state.ts";

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

test("a cached Command snapshot follows locale changes while preserving real Quest and actor data", () => {
  const quest = buildQuest({ id:"q-cached", title:"実際の作業", notes:"Keep this 日本語 note", requester:{ type:"agent", id:"forge-runner", label:"Forge Runner" }, completionCriteria:"Real criteria" });
  const model = normalizeCommandModel({ profile:{ uid:"uid-1", displayName:"あなた", avatarUrl:"blob:real-avatar" }, agents:[{ agentId:"forge-runner", displayName:"Forge Runner" }], quests:[quest], syncLabel:"10:52" });
  const view = model.selectedViews.get(quest.id)!;
  const actors = model.actors;
  const unnamed = resolveActors({ uid:"unnamed", displayName:"", handle:"" }, []).get("u-unnamed")!;
  try {
    for (const locale of SUPPORTED_LOCALES) {
      setLocale(locale);
      assert.equal(model.quests[0].stateLabel, relayText("commandRequestedReview").replace("{actor}", "Forge Runner"));
      assert.equal(model.interventions[0].reason, model.quests[0].stateLabel);
      assert.equal(model.interventions[0].actionLabel, relayText("commandReviewOutput"));
      assert.equal(view.reason, relayText("commandSummaryReview"));
      assert.equal(view.responsibility[0].stateLabel, relayText("commandHandedOff"));
      assert.equal(view.responsibility.at(-1)?.stateLabel, relayText("commandNextHolder"));
      assert.ok(view.details.points[0].includes(relayText("due")));
      assert.equal(view.evidencePoints[0], relayText("commandNoOutput"));
      assert.equal(model.capacity[0].label, relayText("commandAttention"));
      assert.equal(model.capacity[0].value, countLabel(1));
      assert.equal(model.capacity[3].value, `${t("sync.synced")} · 10:52`);
      assert.equal(model.selectedViews.get(quest.id), view);
      assert.equal(model.actors, actors);
      assert.equal(model.actors.get("u-uid-1")?.name, "あなた");
      assert.equal(model.actors.get("u-uid-1")?.avatarUrl, "blob:real-avatar");
      assert.equal(unnamed.name, t("task.assignee.self"));
      assert.equal(unnamed.role, t("role.operator.label"));
      assert.equal(view.title, quest.title);
      assert.deepEqual(view.requester, quest.requester);
      assert.equal(view.externalReview?.note, quest.notes);
      assert.equal(view.externalReview?.criteria, quest.completionCriteria);
    }
  } finally { setLocale("ja"); }
});

test("completed Command work never claims it is executing, while an accepted active handoff remains open", () => {
  const finished = buildQuest({ id:"q-finished", title:"Finished", done:true, lifecycleState:"completed", assignee:{ type:"agent", id:"forge-runner", label:"Forge Runner", handoffState:"working" } });
  const accepted = buildQuest({ id:"q-accepted", title:"Accepted", assignee:{ type:"agent", id:"forge-runner", label:"Forge Runner", handoffState:"accepted" } });
  const model = normalizeCommandModel({ profile:{ uid:"uid-1", displayName:"Human" }, agents:[], quests:[finished, accepted], syncLabel:"10:52" });
  assert.equal(model.quests[0].stateLabel, relayText("stateDone"));
  assert.ok(model.selectedViews.get(finished.id)!.responsibility.every(step => step.state === "completed"));
  assert.equal(model.quests[1].state, "ready");
  assert.equal(model.quests[1].stateLabel, relayText("commandAccepted").replace("{actor}", model.actors.get("forge-runner")!.name));
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
test("self and Human work show their real single holder without invented handoffs", () => {
  for (const type of ["self", "human"] as const) {
    for (const handoffState of ["none", "working", "blocked"] as const) {
      for (const done of [false, true]) {
        const name = type === "self" ? "Real owner" : "External reviewer";
        const quest = buildQuest({ id:"holder-test", title:"Real work", done, lifecycleState:done ? "completed" : "active", assignee:{ type, id:type === "self" ? "owner" : "other-human", label:name, handoffState } });
        const model = normalizeCommandModel({ profile:{ uid:"owner", displayName:"Real owner", avatarUrl:"blob:owner-only" }, agents:[], quests:[quest], syncLabel:"Now" });
        const loom = model.quests[0];
        const view = model.selectedViews.get(quest.id)!;
        assert.equal(loom.relay.legs.length, 1);
        assert.equal(loom.relay.currentIndex, 0);
        const step = view.responsibility[0];
        const actor = model.actors.get(step.actorId)!;
        assert.equal(actor.kind, "human");
        assert.equal(actor.name, name);
        assert.equal(actor.avatarUrl, type === "self" ? "blob:owner-only" : undefined);
        assert.equal(step.state, done ? "completed" : handoffState === "none" ? "pending" : handoffState === "blocked" ? "blocked" : "executing");
        assert.notEqual(step.stateLabel, relayText("commandNextHolder"));
        assert.equal(loom.stateLabel, done ? relayText("stateDone") : handoffState === "working" ? relayText("commandExecuting").replace("{actor}", name) : handoffState === "blocked" ? relayText("stateBlocked") : relayText("commandPlanned"));
      }
    }
  }
});
test("a self-owned planned Quest exposes task actions instead of Handoff decisions", () => {
  const quest = buildQuest({
    id: "q-self",
    title: "Daily review",
    assignee: { type: "self", id: "uid-1", label: "Hironao", handoffState: "none" },
  });
  assert.deepEqual(questActionState(quest), {
    mode: "self-task",
    statusLabel: "あなたの担当Questです",
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
    statusLabel: "AgentがこのQuestを保持しています",
    actions: ["edit"],
  });
});
test("the transition table matches the domain", () => {
  assert.equal(canTransition("review_required", "accepted"), true);
  assert.equal(canTransition("review_required", "working"), true);
  assert.equal(canTransition("review_required", "ready"), false);
  assert.equal(canTransition("accepted", "accepted"), false);
});

test("closed and archived owners never expose mutation or Handoff decisions", () => {
  for (const type of ["agent", "human", "self"] as const) {
    for (const lifecycleState of ["completed", "archived"] as const) {
      const state = questActionState(buildQuest({ id:"closed", title:"Closed", done:true, lifecycleState,
        assignee:{ type, id:"owner", label:"Owner", handoffState:"review_required" } }));
      assert.equal(state.mode, "read-only");
      assert.deepEqual(state.actions, []);
      assert.equal(state.statusLabel, relayText(lifecycleState === "archived" ? "taskArchived" : "taskClosed"));
    }
  }
  const human = buildQuest({ id:"human", title:"Human work", assignee:{ type:"human", id:"human", label:"Human", handoffState:"working" } });
  assert.equal(questActionState(human).statusLabel, relayText("taskHumanHolding"));
  const history = { ...human, done:true, lifecycleState:"completed" as const, humanRequest:{ sourceQuestId:"source", requestKey:"review", recipientId:"human", reason:"Review", checkTarget:"Result", artifactUrl:"", status:"answered" as const, seenAt:"", respondedAt:"", response:"Approved", outcome:"approved" as const } };
  assert.deepEqual(questActionState(history).actions, ["reply"], "answered requests keep a read-only entry to their response history");
});

test("Handoff execution requires the requested Quest and confirmed target state", async () => {
  const accepted = buildQuest({ id:"q-1", title:"Accepted", assignee:{ type:"agent", id:"forge-runner", label:"Forge Runner", handoffState:"accepted" } });
  for (const quest of [undefined, null, [], {}, { ...accepted, id:"another" }, { ...accepted, assignee:{ ...accepted.assignee, handoffState:"review_required" } }]) {
    const calls: boolean[] = [];
    const result = await runHandoff({ async transitionHandoff(_id, input) { calls.push(input.dryRun === true); return input.dryRun ? {} : { quest }; } },
      { questId:"q-1", state:"accepted", expectedState:"review_required", dryRun:false });
    assert.deepEqual(calls, [true, false]);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_handoff_response");
    assert.equal(result.quest, null);
  }
});

test("stored decision feedback follows the current locale", async () => {
  const result = await submitDecision(domainPort([buildQuest({ id:"q-1", title:"Review" })]),
    { kind:"approve", questId:"q-1", expectedState:"review_required", reason:"" },
    { evidenceReviewed:true, writeLocked:false, permissionMissing:null, conflict:null }, "idle", () => {});
  try {
    for (const locale of SUPPORTED_LOCALES) {
      setLocale(locale);
      assert.equal(result.message, relayText("handoffApproved", locale));
      assert.equal(explainFailure("stale_handoff_state"), relayText("handoffConflict", locale));
    }
  } finally { setLocale("ja"); }
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
