/**
 * Party — the responsibility roster.
 *
 * The question: "誰が何を担当し、どの程度の余力と信頼性があるか".
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
import { actorAvatar } from "../primitives/avatar.ts";
import { el } from "../primitives/dom.ts";
import {
  type PartyMemberView,
  type PartyModel,
  type Workload,
} from "./party-model.ts";
import {
  elapsedLabel,
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

export function initialPartyState(): PartyState {
  return { selectedActorId: null, filter: "all", mobileDetailOpen: false };
}

function visibleMembers(model: PartyModel, state: PartyState): readonly PartyMemberView[] {
  if (state.filter === "all") return model.members;
  return model.members.filter((member) => (state.filter === "human" ? member.kind === "human" : member.kind !== "human"));
}

const KIND_LABEL: Readonly<Record<Actor["kind"], string>> = {
  human: "Human",
  agent: "Agent",
  system: "System",
  companion: "Companion",
};

const HELD_CHIP = {
  working: { label: "実行中", mark: ">>", tone: "working" },
  review: { label: "レビュー待ち", mark: "!?", tone: "review" },
  blocked: { label: "停止", mark: "//", tone: "blocked" },
  waiting: { label: "待機", mark: "..", tone: "waiting" },
} as const;

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
        title: `${HELD_CHIP[kind].label} ${count}件`,
      }, el("span", { class: "rf-visually-hidden" }, `${HELD_CHIP[kind].label} ${count}件`));

  return el(
    "div",
    { class: "rf-p-workload" },
    el(
      "div",
      { class: "rf-p-bar", role: "img", "aria-label": `保持 ${workload.total}件（実行中 ${workload.working} / レビュー待ち ${workload.review} / 停止 ${workload.blocked} / 待機 ${workload.waiting}）` },
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
      el("span", { class: "rf-p-count", "data-kind": "total" }, `保持 ${workload.total}`),
      workload.working === 0 ? null : el("span", { class: "rf-p-count", "data-kind": "working" }, `実行 ${workload.working}`),
      workload.review === 0 ? null : el("span", { class: "rf-p-count", "data-kind": "review" }, `レビュー ${workload.review}`),
      workload.blocked === 0 ? null : el("span", { class: "rf-p-count", "data-kind": "blocked" }, `停止 ${workload.blocked}`),
      workload.waiting === 0 ? null : el("span", { class: "rf-p-count", "data-kind": "waiting" }, `待機 ${workload.waiting}`),
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
        ? el("span", { class: "rf-srow-sub" }, "受け渡しなし")
        : el("span", { class: "rf-srow-sub" }, instantLabel(member.lastHandoffAt)),
      member.reviewRequired ? stateChip({ tone: "review", label: "要レビュー", mark: "!?" }) : null,
    ),
    selected ? el("span", { class: "rf-visually-hidden" }, "選択中") : null,
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
  onAssign: (actorId: string) => void,
): HTMLElement {
  const member = model.members.find((entry) => entry.actorId === state.selectedActorId) ?? null;
  if (member === null) {
    return screenRegion(
      "選択中のActor",
      { variant: "detail" },
      screenEmpty("Actorを選んでください", "左の一覧から1人選ぶと、保持中のQuest、直近の受け渡し、権限がここに出ます。"),
    );
  }
  const actor = context.actors.get(member.actorId);
  const assign = el("button", { type: "button", class: "rf-primary-button" }, "このActorのQuestを開く");
  assign.addEventListener("click", () => onAssign(member.actorId));

  return screenRegion(
    "選択中のActor",
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
    el("h4", { class: "rf-p-detail-label" }, "現在の負荷"),
    workloadBar(member.workload, model.busiestTotal),
    el(
      "p",
      { class: "rf-p-scale-note" },
      model.busiestTotal === 0
        ? "保持中のQuestはありません。"
        : `棒の長さは、この一覧で最も多いActor（${model.busiestTotal}件）との相対比較です。上限値ではありません。`,
    ),
    el("h4", { class: "rf-p-detail-label" }, `保持中のQuest ${member.held.length}件`),
    member.held.length === 0
      ? el("p", { class: "rf-p-detail-empty" }, "保持中のQuestはありません。")
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
    el("h4", { class: "rf-p-detail-label" }, "直近の受け渡し"),
    member.lastHandoffAt === ""
      ? el("p", { class: "rf-p-detail-empty" }, "この期間に受け渡しの記録はありません。")
      : el(
        "p",
        { class: "rf-p-detail-handoff" },
        el("span", { class: "rf-srow-sub" }, instantLabel(member.lastHandoffAt)),
        el("span", null, member.lastHandoffSummary),
      ),
    el("h4", { class: "rf-p-detail-label" }, member.kind === "human" ? "プロフィール" : "権限とCapability"),
    el(
      "dl",
      { class: "rf-p-capabilities" },
      ...member.capabilities.flatMap((capability) => [
        el("dt", null, capability.label),
        el("dd", null, capability.value),
      ]),
    ),
    member.reviewRequired
      ? el("p", { class: "rf-p-detail-note" }, "このAgentの出力は、受け入れ前に必ず人間のレビューが必要です。")
      : null,
    el("div", { class: "rf-p-detail-actions" }, assign),
    ...model.unavailable.map((entry) => unavailableAction(entry.what, entry.why)),
  );
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

function partyMetrics(model: PartyModel): readonly Metric[] {
  const humans = model.members.filter((member) => member.kind === "human").length;
  const agents = model.members.filter((member) => member.kind !== "human").length;
  const review = model.members.reduce((total, member) => total + member.workload.review, 0);
  const blocked = model.members.reduce((total, member) => total + member.workload.blocked, 0);
  const idle = model.members.filter((member) => member.workload.total === 0).length;
  return [
    { label: "Human", value: String(humans), tone: "neutral" },
    { label: "Agent", value: String(agents), tone: "neutral" },
    { label: "レビュー待ち", value: String(review), note: "人間の判断が要る保持", tone: "review" },
    { label: "停止中", value: String(blocked), note: "進めない保持", tone: "blocked" },
    { label: "保持ゼロ", value: String(idle), note: "いま何も持っていない", tone: "done" },
  ];
}

export function renderPartyDesktop(
  model: PartyModel,
  state: PartyState,
  context: ScreenContext,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const members = visibleMembers(model, state);
  if (state.selectedActorId === null && members.length > 0) {
    state.selectedActorId = members[0]?.actorId ?? null;
  }

  const roster = el(
    "div",
    { class: "rf-p-roster", role: "list" },
    ...members.map((member) => rosterRow(member, model, context, member.actorId === state.selectedActorId, () => {
      state.selectedActorId = member.actorId;
      context.rerender();
      context.announce(`${context.actors.get(member.actorId)?.name ?? member.actorId} を選択しました`);
    })),
  );

  roster.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (members.length === 0) return;
    event.preventDefault();
    const at = members.findIndex((member) => member.actorId === state.selectedActorId);
    const next = Math.min(members.length - 1, Math.max(0, (at === -1 ? 0 : at) + (event.key === "ArrowDown" ? 1 : -1)));
    state.selectedActorId = members[next]?.actorId ?? state.selectedActorId;
    context.rerender();
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--party" },
    screenHeader({
      title: "Party",
      question: "誰が何を担当し、どの程度の余力と信頼性があるか。",
      meta: [
        { label: "パーティ", value: model.partyName === "" ? "未設定" : model.partyName },
        { label: "在籍", value: String(model.members.length) },
      ],
      actions: [
        segmentControl(
          "種別で絞り込む",
          [
            { id: "all", label: "すべて", count: model.members.length },
            { id: "human", label: "Human", count: model.members.filter((member) => member.kind === "human").length },
            { id: "agent", label: "Agent", count: model.members.filter((member) => member.kind !== "human").length },
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
        "責任の分担",
        { scroll: true, variant: "roster" },
        el(
          "div",
          { class: "rf-p-head" },
          el("span", { class: "rf-col-label" }, "Actor"),
          el("span", { class: "rf-col-label" }, "種別"),
          el("span", { class: "rf-col-label" }, "負荷（相対比較）"),
          el("span", { class: "rf-col-label" }, "直近の受け渡し"),
        ),
        loading
          ? screenSkeleton(5, "row")
          : members.length === 0
            ? screenEmpty("この種別のActorはいません", "種別タブを切り替えるか、Agent を登録してください。")
            : roster,
      ),
      detailRail(model, state, context, (actorId) => {
        context.onNavigate("quests");
        context.announce(`${context.actors.get(actorId)?.name ?? actorId} の Quest を Quests で表示します`);
      }),
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
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const members = visibleMembers(model, state);

  if (state.mobileDetailOpen && state.selectedActorId !== null) {
    const back = el("button", { type: "button", class: "rf-secondary-button rf-p-back" }, "一覧へ戻る");
    const returnTo = state.selectedActorId;
    back.addEventListener("click", () => {
      state.mobileDetailOpen = false;
      context.rerender();
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`.rf-p-card[data-actor-id="${returnTo}"]`)?.focus();
      });
    });
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--party", "data-mobile-view": "detail" },
        el("div", { class: "rf-p-mobile-bar" }, back),
        detailRail(model, state, context, () => context.onNavigate("quests")),
      ),
    };
  }

  const main = el(
    "div",
    { class: "rf-screen rf-screen--party", "data-mobile-view": "roster" },
    screenHeader({
      title: "Party",
      question: "誰が何を担当し、どの程度の余力と信頼性があるか。",
      meta: [{ label: "在籍", value: String(model.members.length) }],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    segmentControl(
      "種別で絞り込む",
      [
        { id: "all", label: "すべて", count: model.members.length },
        { id: "human", label: "Human", count: model.members.filter((member) => member.kind === "human").length },
        { id: "agent", label: "Agent", count: model.members.filter((member) => member.kind !== "human").length },
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
        ? screenEmpty("この種別のActorはいません", "種別タブを切り替えてください。")
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
            });
            return card;
          }),
        ),
  );

  return { main };
}
