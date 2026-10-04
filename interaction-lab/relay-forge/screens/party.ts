/**
 * Party — the responsibility roster.
 *
 * The question: who owns what, and how much work are they holding?
 *
 * Two decisions shape this screen.
 *
 * First, Humans and Agents sit on one responsibility model — the same workload
 * columns, the same relay language, the same "holding since" clock — because
 * orchestration only makes sense if both sides are measured the same way. What
 * stays different is identity: the avatar shape, the type word and the
 * capability block are never interchangeable, so nobody mistakes an Agent for a
 * person.
 *
 * Second, and this is a deliberate omission: **there is no capacity meter.**
 * The QuestForge domain stores no availability, concurrency limit or capacity
 * field for either a Party member or a RegisteredAgent. Inventing a ceiling in
 * the UI would put a number on screen that nothing can validate, so this screen
 * shows measured workload only — real counts of Quests actually held — and
 * compares actors against each other rather than against a fabricated maximum.
 *
 * Scroll ownership: the roster scrolls; the detail rail is fixed.
 */

import type { Actor } from "../model.ts";
import { relayText } from "../relay-copy.ts";
import { actorAvatar } from "../primitives/avatar.ts";
import { el } from "../primitives/dom.ts";
import {
  type PartyMemberView,
  type PartyModel,
  type Workload,
} from "./party-model.ts";
import {
  elapsedLabel,
  countLabel,
  instantLabel,
  type Metric,
  metricRow,
  type ScreenContext,
  type ScreenRender,
  screenEmpty,
  screenHeader,
  screenNotice,
  screenRegion,
  screenSkeleton,
  segmentControl,
  stateChip,
  unavailableAction,
} from "./runtime.ts";

export * from "./party-model.ts";

/* ------------------------------------------------------------------ *
 * Screen state
 * ------------------------------------------------------------------ */

export interface PartyState {
  selectedActorId: string | null;
  filter: "all" | "human" | "agent";
  mobileDetailOpen: boolean;
}

export interface PartyCallbacks {
  readonly canManageAgents: boolean;
  readonly onCreateAgent: () => void;
  readonly onEditAgent: (agentId: string) => void;
}

export function initialPartyState(): PartyState {
  return { selectedActorId: null, filter: "all", mobileDetailOpen: false };
}

function visibleMembers(model: PartyModel, state: PartyState): readonly PartyMemberView[] {
  if (state.filter === "all") return model.members;
  return model.members.filter((member) => (state.filter === "human" ? member.kind === "human" : member.kind === "agent"));
}

const KIND_LABEL: Readonly<Record<Actor["kind"], string>> = {
  human: "Human",
  agent: "Agent",
  system: "System",
  companion: "Companion",
};

const HELD_CHIP = {
  working: { get label() { return relayText("stateWorking"); }, mark: ">>", tone: "working" },
  review: { get label() { return relayText("stateReview"); }, mark: "!?", tone: "review" },
  blocked: { get label() { return relayText("stateBlocked"); }, mark: "//", tone: "blocked" },
  waiting: { get label() { return relayText("waiting"); }, mark: "..", tone: "waiting" },
} as const;

function focusActor(actorId: string): void {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`.rf-screen--party [data-actor-id="${CSS.escape(actorId)}"]`)?.focus();
  });
}

/* ------------------------------------------------------------------ *
 * Workload bar
 * ------------------------------------------------------------------ */

/**
 * A segmented bar scaled to the busiest actor on screen, NOT to an invented
 * capacity. The caption says so in words, and every segment carries its own
 * number, so the bar is a comparison aid and the counts are the truth.
 */
function workloadBar(workload: Workload, busiest: number): HTMLElement {
  const scale = busiest === 0 ? 1 : busiest;
  const segment = (kind: keyof typeof HELD_CHIP, count: number): HTMLElement | null =>
    count === 0
      ? null
      : el("span", {
        class: "rf-p-bar-seg",
        "data-kind": kind,
        style: `flex-grow:${count}`,
        title: `${HELD_CHIP[kind].label} ${countLabel(count)}`,
      }, el("span", { class: "rf-visually-hidden" }, `${HELD_CHIP[kind].label} ${countLabel(count)}`));

  return el(
    "div",
    { class: "rf-p-workload" },
    el(
      "div",
      { class: "rf-p-bar", role: "img", "aria-label": `${relayText("partyHolding")} ${countLabel(workload.total)} (${HELD_CHIP.working.label} ${workload.working} / ${HELD_CHIP.review.label} ${workload.review} / ${HELD_CHIP.blocked.label} ${workload.blocked} / ${HELD_CHIP.waiting.label} ${workload.waiting})` },
      el(
        "span",
        { class: "rf-p-bar-fill", style: `width:${Math.round((workload.total / scale) * 100)}%` },
        segment("working", workload.working),
        segment("review", workload.review),
        segment("blocked", workload.blocked),
        segment("waiting", workload.waiting),
      ),
    ),
    el(
      "div",
      { class: "rf-p-counts" },
      el("span", { class: "rf-p-count", "data-kind": "total" }, `${relayText("partyHolding")} ${workload.total}`),
      ...(["working", "review", "blocked", "waiting"] as const).map(kind => workload[kind] === 0 ? null : el("span", { class: "rf-p-count", "data-kind": kind }, `${HELD_CHIP[kind].label} ${workload[kind]}`)),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

function rosterRow(
  member: PartyMemberView,
  model: PartyModel,
  context: ScreenContext,
  selected: boolean,
  onSelect: () => void,
): HTMLElement {
  const actor = context.actors.get(member.actorId);
  const row = el(
    "button",
    {
      type: "button",
      class: "rf-srow rf-p-row",
      "data-selected": selected ? "true" : "false",
      "data-kind": member.kind,
      "data-actor-id": member.actorId,
      "aria-current": selected ? "true" : null,
      tabindex: selected ? "0" : "-1",
    },
    el(
      "span",
      { class: "rf-p-identity" },
      actor === undefined
        ? el("span", { class: "rf-p-identity-missing" }, "?")
        : actorAvatar(actor, { size: "shelf", state: member.workload.review > 0 ? "review" : member.workload.blocked > 0 ? "blocked" : "idle" }),
      el(
        "span",
        { class: "rf-p-identity-copy" },
        el("span", { class: "rf-srow-title" }, actor?.name ?? member.actorId),
        el("span", { class: "rf-srow-sub" }, actor?.role ?? ""),
      ),
    ),
    el(
      "span",
      { class: "rf-p-kind" },
      el("span", { class: "rf-p-kind-label", "data-kind": member.kind }, KIND_LABEL[member.kind]),
      el("span", { class: "rf-srow-sub" }, member.standing),
    ),
    el("span", { class: "rf-p-workload-cell" }, workloadBar(member.workload, model.busiestTotal)),
    el(
      "span",
      { class: "rf-p-last" },
      member.lastHandoffAt === ""
        ? el("span", { class: "rf-srow-sub" }, relayText("partyNoHandoff"))
        : el("span", { class: "rf-srow-sub" }, instantLabel(member.lastHandoffAt)),
      member.reviewRequired ? stateChip({ tone: "review", label: relayText("partyReviewPolicy"), mark: "!?" }) : null,
    ),
    selected ? el("span", { class: "rf-visually-hidden" }, relayText("selected")) : null,
  );
  row.addEventListener("click", () => onSelect());
  return row;
}

/* ------------------------------------------------------------------ *
 * Detail rail
 * ------------------------------------------------------------------ */

function detailRail(
  model: PartyModel,
  state: PartyState,
  context: ScreenContext,
  onOpenQuests: () => void,
  callbacks: PartyCallbacks,
): HTMLElement {
  const member = model.members.find((entry) => entry.actorId === state.selectedActorId) ?? null;
  if (member === null) {
    return screenRegion(
      relayText("partySelectedActor"),
      { variant: "detail" },
      screenEmpty(relayText("partyChooseActor"), relayText("partyChooseHint")),
    );
  }
  const actor = context.actors.get(member.actorId);
  const assign = el("button", { type: "button", class: "rf-primary-button" }, relayText("partyOpenQuests"));
  assign.addEventListener("click", onOpenQuests);
  const edit = member.kind === "agent" && callbacks.canManageAgents
    ? el("button", {
      type: "button",
      class: "rf-secondary-button",
      disabled: context.writeLocked,
    }, relayText("agentEdit"))
    : null;
  edit?.addEventListener("click", () => callbacks.onEditAgent(member.actorId));

  return screenRegion(
    relayText("partySelectedActor"),
    { variant: "detail", scroll: true },
    el(
      "div",
      { class: "rf-p-detail-identity" },
      actor === undefined ? null : actorAvatar(actor, { size: "profile" }),
      el(
        "div",
        { class: "rf-p-detail-copy" },
        el("h3", { class: "rf-p-detail-name" }, actor?.name ?? member.actorId),
        el("p", { class: "rf-p-detail-role" }, actor?.role ?? ""),
        el(
          "p",
          { class: "rf-p-detail-kind" },
          el("span", { class: "rf-p-kind-label", "data-kind": member.kind }, KIND_LABEL[member.kind]),
          el("span", null, member.standing),
        ),
      ),
    ),
    el("h4", { class: "rf-p-detail-label" }, relayText("partyWorkload")),
    workloadBar(member.workload, model.busiestTotal),
    el(
      "p",
      { class: "rf-p-scale-note" },
      model.busiestTotal === 0
        ? relayText("partyNoHeld")
        : `${relayText("partyScale")} (${countLabel(model.busiestTotal)})`,
    ),
    el("h4", { class: "rf-p-detail-label" }, `${relayText("partyHeldQuests")} ${countLabel(member.held.length)}`),
    member.held.length === 0
      ? el("p", { class: "rf-p-detail-empty" }, relayText("partyNoHeld"))
      : el(
        "ul",
        { class: "rf-p-held" },
        ...member.held.map((quest) => {
          const chip = HELD_CHIP[quest.state];
          const row = el(
            "button",
            { type: "button", class: "rf-p-held-row", "data-state": quest.state },
            el(
              "span",
              { class: "rf-p-held-top" },
              el("span", { class: "rf-srow-id" }, quest.ref),
              stateChip({ tone: chip.tone, label: chip.label, mark: chip.mark }),
              el("span", { class: "rf-srow-sub" }, elapsedLabel(quest.heldForMinutes)),
            ),
            el("span", { class: "rf-p-held-title" }, quest.title),
          );
          row.addEventListener("click", () => {
            context.onSelectQuest(quest.id);
            context.onNavigate(quest.state === "review" || quest.state === "blocked" ? "command" : "quests", quest.id);
          });
          return el("li", null, row);
        }),
      ),
    el("h4", { class: "rf-p-detail-label" }, relayText("partyRecentHandoff")),
    member.lastHandoffAt === ""
      ? el("p", { class: "rf-p-detail-empty" }, relayText("partyNoHandoffRecord"))
      : el(
        "p",
        { class: "rf-p-detail-handoff" },
        el("span", { class: "rf-srow-sub" }, instantLabel(member.lastHandoffAt)),
        el("span", null, member.lastHandoffSummary),
      ),
    el("h4", { class: "rf-p-detail-label" }, member.kind === "human" ? relayText("partyProfile") : relayText("partyCapabilities")),
    el(
      "dl",
      { class: "rf-p-capabilities" },
      ...member.capabilities.flatMap((capability) => [
        el("dt", null, capability.label),
        el("dd", null, capability.value),
      ]),
    ),
    member.reviewRequired
      ? el("p", { class: "rf-p-detail-note" }, relayText("partyReviewNote"))
      : null,
    el("div", { class: "rf-p-detail-actions" }, assign, edit),
    ...model.unavailable.map((entry) => unavailableAction(entry.what, entry.why)),
  );
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

function partyMetrics(model: PartyModel): readonly Metric[] {
  const humans = model.members.filter((member) => member.kind === "human").length;
  const agents = model.members.filter((member) => member.kind === "agent").length;
  const review = model.members.reduce((total, member) => total + member.workload.review, 0);
  const blocked = model.members.reduce((total, member) => total + member.workload.blocked, 0);
  const idle = model.members.filter((member) => member.workload.total === 0).length;
  return [
    { label: "Human", value: String(humans), tone: "neutral" },
    { label: "Agent", value: String(agents), tone: "neutral" },
    { label: relayText("stateReview"), value: String(review), note: relayText("partyReviewMetric"), tone: "review" },
    { label: relayText("stateBlocked"), value: String(blocked), note: relayText("partyBlockedMetric"), tone: "blocked" },
    { label: relayText("partyIdle"), value: String(idle), note: relayText("partyIdleMetric"), tone: "done" },
  ];
}

export function renderPartyDesktop(
  model: PartyModel,
  state: PartyState,
  context: ScreenContext,
  callbacks: PartyCallbacks,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const members = visibleMembers(model, state);
  if (!members.some(member => member.actorId === state.selectedActorId)) {
    state.selectedActorId = members[0]?.actorId ?? null;
  }

  const selectActor = (actorId: string) => {
    state.selectedActorId = actorId;
    context.rerender();
    focusActor(actorId);
    context.announce(`${relayText("selected")}: ${context.actors.get(actorId)?.name ?? actorId}`);
  };

  const roster = el(
    "div",
    { class: "rf-p-roster" },
    ...members.map((member) => rosterRow(member, model, context, member.actorId === state.selectedActorId, () => selectActor(member.actorId))),
  );

  roster.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (members.length === 0) return;
    event.preventDefault();
    const at = members.findIndex((member) => member.actorId === state.selectedActorId);
    const next = event.key === "Home" ? 0 : event.key === "End" ? members.length - 1 : Math.min(members.length - 1, Math.max(0, (at === -1 ? 0 : at) + (event.key === "ArrowDown" ? 1 : -1)));
    const actorId = members[next]?.actorId;
    if (actorId !== undefined) selectActor(actorId);
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--party" },
    screenHeader({
      title: "Party",
      question: relayText("partyQuestion"),
      meta: [
        { label: relayText("partyName"), value: model.partyName === "" ? relayText("missing") : model.partyName },
        { label: relayText("partyMembers"), value: String(model.members.length) },
      ],
      actions: [
        ...(callbacks.canManageAgents
          ? [(() => {
            const button = el("button", {
              type: "button",
              class: "rf-primary-button rf-agent-create",
              disabled: context.writeLocked,
            }, relayText("agentRegister"));
            button.addEventListener("click", callbacks.onCreateAgent);
            return button;
          })()]
          : []),
        segmentControl(
          relayText("partyFilter"),
          [
            { id: "all", label: relayText("all"), count: model.members.length },
            { id: "human", label: "Human", count: model.members.filter((member) => member.kind === "human").length },
            { id: "agent", label: "Agent", count: model.members.filter((member) => member.kind === "agent").length },
          ],
          state.filter,
          (id) => {
            state.filter = id as PartyState["filter"];
            state.selectedActorId = null;
            context.rerender();
          },
        ),
      ],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    metricRow(partyMetrics(model)),
    el(
      "div",
      { class: "rf-p-workspace" },
      screenRegion(
        relayText("partyResponsibility"),
        { scroll: true, variant: "roster" },
        el(
          "div",
          { class: "rf-p-head" },
          el("span", { class: "rf-col-label" }, "Actor"),
          el("span", { class: "rf-col-label" }, relayText("partyType")),
          el("span", { class: "rf-col-label" }, relayText("partyWorkloadRelative")),
          el("span", { class: "rf-col-label" }, relayText("partyRecentHandoff")),
        ),
        loading
          ? screenSkeleton(5, "row")
          : members.length === 0
            ? screenEmpty(
              relayText("partyEmpty"),
              relayText("partyEmptyHint"),
              callbacks.canManageAgents && state.filter !== "human"
                ? { label: relayText("agentRegister"), onAct: callbacks.onCreateAgent }
                : undefined,
            )
            : roster,
      ),
      detailRail(model, state, context, () => context.onNavigate("quests"), callbacks),
    ),
  );

  return { main };
}

/* ------------------------------------------------------------------ *
 * Mobile
 * ------------------------------------------------------------------ */

export function renderPartyMobile(
  model: PartyModel,
  state: PartyState,
  context: ScreenContext,
  callbacks: PartyCallbacks,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const members = visibleMembers(model, state);

  if (state.mobileDetailOpen && state.selectedActorId !== null) {
    const back = el("button", { type: "button", class: "rf-secondary-button rf-p-back" }, relayText("backToList"));
    const returnTo = state.selectedActorId;
    back.addEventListener("click", () => {
      state.mobileDetailOpen = false;
      context.rerender();
      focusActor(returnTo);
    });
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--party", "data-mobile-view": "detail" },
        el("div", { class: "rf-p-mobile-bar" }, back),
        detailRail(model, state, context, () => context.onNavigate("quests"), callbacks),
      ),
    };
  }

  const main = el(
    "div",
    { class: "rf-screen rf-screen--party", "data-mobile-view": "roster" },
    screenHeader({
      title: "Party",
      question: relayText("partyQuestion"),
      meta: [{ label: relayText("partyMembers"), value: String(model.members.length) }],
      actions: callbacks.canManageAgents
        ? [(() => {
          const button = el("button", {
            type: "button",
            class: "rf-primary-button rf-agent-create",
            disabled: context.writeLocked,
          }, relayText("agentRegister"));
          button.addEventListener("click", callbacks.onCreateAgent);
          return button;
        })()]
        : [],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    segmentControl(
      relayText("partyFilter"),
      [
        { id: "all", label: relayText("all"), count: model.members.length },
        { id: "human", label: "Human", count: model.members.filter((member) => member.kind === "human").length },
        { id: "agent", label: "Agent", count: model.members.filter((member) => member.kind === "agent").length },
      ],
      state.filter,
      (id) => {
        state.filter = id as PartyState["filter"];
        context.rerender();
      },
    ),
    loading
      ? screenSkeleton(4, "card")
      : members.length === 0
        ? screenEmpty(
          relayText("partyEmpty"),
          relayText("partyEmptyHint"),
          callbacks.canManageAgents && state.filter !== "human"
            ? { label: relayText("agentRegister"), onAct: callbacks.onCreateAgent }
            : undefined,
        )
        : el(
          "div",
          { class: "rf-p-cards" },
          ...members.map((member) => {
            const actor = context.actors.get(member.actorId);
            const card = el(
              "button",
              {
                type: "button",
                class: "rf-p-card",
                "data-kind": member.kind,
                "data-actor-id": member.actorId,
              },
              el(
                "span",
                { class: "rf-p-card-top" },
                actor === undefined ? null : actorAvatar(actor, { size: "shelf", state: member.workload.review > 0 ? "review" : "idle" }),
                el(
                  "span",
                  { class: "rf-p-card-copy" },
                  el("span", { class: "rf-srow-title" }, actor?.name ?? member.actorId),
                  el("span", { class: "rf-srow-sub" }, `${KIND_LABEL[member.kind]} · ${member.standing}`),
                ),
              ),
              workloadBar(member.workload, model.busiestTotal),
            );
            card.addEventListener("click", () => {
              state.selectedActorId = member.actorId;
              state.mobileDetailOpen = true;
              context.rerender();
              window.requestAnimationFrame(() => {
                document.querySelector<HTMLElement>(".rf-p-back")?.focus();
              });
            });
            return card;
          }),
        ),
  );

  return { main };
}
