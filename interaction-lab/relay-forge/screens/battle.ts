/**
 * Battle — the execution theatre.
 *
 * The question: "今どの実行が進み、どこで問題が起き、人間が介入すべきか".
 *
 * IMPORTANT — what this screen is:
 *
 * QuestForge's Battle domain is a deterministic, turn-based command battle
 * (`shared/battle-rules.ts`): a boss with HP, a player with HP and MP, five
 * commands with MP costs, one turn per command, and a ten-entry log. It is NOT
 * an agent-execution monitor, and this screen does not pretend otherwise. The
 * information hierarchy the brief asks for maps onto the real domain like this:
 *
 *   objective        the boss and its remaining HP
 *   phase            `battle.turn`
 *   participants     the character and the boss
 *   progress         boss HP, player HP, MP
 *   blocker          not enough MP / the battle has ended / the turn moved
 *   output           the effects of the last command, and the battle log
 *   intervention     choose a command — previewed with `dryRun`, then executed
 *                    against `expectedTurn`
 *
 * Actions the domain does not have — pausing, retrying a turn, handing a battle
 * to another actor — are absent, not disabled. A greyed-out "停止" would claim a
 * capability that does not exist.
 *
 * Scroll ownership: the timeline scrolls; the objective, phase and command deck
 * are fixed, because those are what an intervention needs to be visible.
 */

import { el } from "../primitives/dom.ts";
import type { BattleSession } from "../../../types/questforge.ts";
import {
  type BattleModel,
  type BattleOutcome,
  type BattlePort,
  explainBattleFailure,
  type TimelineEvent,
} from "./battle-model.ts";
import {
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
  stateChip,
} from "./runtime.ts";

export * from "./battle-model.ts";

/* ------------------------------------------------------------------ *
 * Screen state
 * ------------------------------------------------------------------ */

export type BattlePhase = "idle" | "previewing" | "previewed" | "submitting" | "failed";

export interface BattleState {
  /** The command the human is considering. Null until one is chosen. */
  pendingCommand: string | null;
  phase: BattlePhase;
  preview: BattleOutcome | null;
  failure: { code: string; message: string } | null;
  /** Session-local record of what the human actually did. */
  decisions: TimelineEvent[];
  /** Mobile only: the full timeline is collapsed by default. */
  timelineOpen: boolean;
  /** Increments per execution so a replayed commandId is never reused. */
  sequence: number;
}

export function initialBattleState(): BattleState {
  return {
    pendingCommand: null,
    phase: "idle",
    preview: null,
    failure: null,
    decisions: [],
    timelineOpen: false,
    sequence: 0,
  };
}

export interface BattleCallbacks {
  readonly port: BattlePort;
  /** Called with the session the domain returned after a real execution. */
  readonly onSession: (session: BattleSession) => void;
}

/**
 * Preview then execute — the same shape as Command's Handoff decision.
 *
 * A preview is required before an execution: `pendingCommand` is only armed by
 * a successful dry run, so the user always sees the exact effects the domain
 * computed before anything is written.
 */
export async function previewCommand(
  model: BattleModel,
  state: BattleState,
  callbacks: BattleCallbacks,
  commandId: string,
  rerender: () => void,
): Promise<void> {
  if (state.phase === "submitting" || state.phase === "previewing") return;
  if (model.writeHeld) {
    state.failure = { code: "offline", message: explainBattleFailure("offline") };
    state.phase = "failed";
    rerender();
    return;
  }
  state.pendingCommand = commandId;
  state.phase = "previewing";
  state.preview = null;
  state.failure = null;
  rerender();
  const outcome = await callbacks.port.runCommand({
    command: commandId,
    expectedTurn: model.turn,
    commandId: "preview",
    dryRun: true,
  });
  if (!outcome.ok) {
    state.phase = "failed";
    state.failure = { code: outcome.code, message: outcome.message };
    rerender();
    return;
  }
  state.preview = outcome;
  state.phase = "previewed";
  rerender();
}

export async function executeCommand(
  model: BattleModel,
  state: BattleState,
  callbacks: BattleCallbacks,
  rerender: () => void,
  announce: (message: string) => void,
): Promise<void> {
  const command = state.pendingCommand;
  // A double submit is refused rather than queued, and an unpreviewed command
  // never reaches the domain.
  if (command === null || state.phase !== "previewed") return;
  state.phase = "submitting";
  state.failure = null;
  rerender();
  state.sequence += 1;
  const outcome = await callbacks.port.runCommand({
    command,
    expectedTurn: model.turn,
    commandId: `relay-forge-${model.turn}-${state.sequence}`,
    dryRun: false,
  });
  if (!outcome.ok) {
    state.phase = "failed";
    state.failure = { code: outcome.code, message: outcome.message };
    rerender();
    announce(outcome.message);
    return;
  }
  state.decisions.push({
    channel: "decision",
    text: `${command} を実行しました（ターン ${outcome.before?.turn ?? model.turn}、MP -${outcome.cost}）`,
    tone: "info",
    at: new Date().toISOString(),
  });
  state.pendingCommand = null;
  state.preview = null;
  state.phase = "idle";
  if (outcome.session !== null) callbacks.onSession(outcome.session);
  rerender();
  announce(`${command} を実行しました。ターン ${outcome.after?.turn ?? ""}。`);
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function meter(label: string, value: number, max: number, tone: string, detail?: string): HTMLElement {
  const percent = max === 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return el(
    "div",
    { class: "rf-b-meter", "data-tone": tone },
    el(
      "div",
      { class: "rf-b-meter-head" },
      el("span", { class: "rf-b-meter-label" }, label),
      el("span", { class: "rf-b-meter-value" }, `${value} / ${max}`),
    ),
    el(
      "div",
      {
        class: "rf-b-meter-track",
        role: "meter",
        "aria-valuenow": String(value),
        "aria-valuemin": "0",
        "aria-valuemax": String(max),
        "aria-label": `${label} ${value} / ${max}`,
      },
      el("span", { class: "rf-b-meter-fill", style: `width:${percent}%` }),
    ),
    detail === undefined ? null : el("span", { class: "rf-b-meter-detail" }, detail),
  );
}

function objectiveBanner(model: BattleModel): HTMLElement {
  return el(
    "section",
    { class: "rf-b-objective", "data-ended": model.ended ? "true" : "false", "aria-label": "目的" },
    el(
      "div",
      { class: "rf-b-objective-copy" },
      el("p", { class: "rf-b-objective-label" }, "目的"),
      el("h2", { class: "rf-b-objective-title" }, model.objective),
      el(
        "p",
        { class: "rf-b-objective-sub" },
        model.bossLabel,
        model.weakKind === "" ? null : el("span", { class: "rf-b-weak" }, `弱点: ${model.weakKind}`),
      ),
    ),
    el(
      "div",
      { class: "rf-b-objective-meters" },
      meter("ボス HP", model.bossHp, model.bossMaxHp, "boss"),
      el(
        "div",
        { class: "rf-b-phase" },
        el("span", { class: "rf-b-phase-label" }, "フェーズ"),
        el("strong", { class: "rf-b-phase-value" }, `ターン ${model.turn}`),
        model.ended ? stateChip({ tone: "done", label: "終了", mark: "OK" }) : stateChip({ tone: "working", label: "進行中", mark: ">>" }),
      ),
    ),
  );
}

function participants(model: BattleModel): HTMLElement {
  return screenRegion(
    "現在のフェーズと参加者",
    { variant: "phase" },
    el(
      "div",
      { class: "rf-b-actors" },
      el(
        "div",
        { class: "rf-b-actor", "data-side": "player" },
        el("span", { class: "rf-b-actor-kind" }, "Human"),
        el("strong", { class: "rf-b-actor-name" }, model.playerName),
        el("span", { class: "rf-b-actor-role" }, model.playerRole),
      ),
      el("span", { class: "rf-b-actor-vs", "aria-hidden": "true" }),
      el(
        "div",
        { class: "rf-b-actor", "data-side": "boss" },
        el("span", { class: "rf-b-actor-kind" }, "System"),
        el("strong", { class: "rf-b-actor-name" }, model.bossName),
        el("span", { class: "rf-b-actor-role" }, model.bossLabel),
      ),
    ),
    el(
      "div",
      { class: "rf-b-meters" },
      meter("自分 HP", model.playerHp, model.playerMaxHp, "player"),
      meter("MP", model.mp, model.maxMp, "mp", "MPはQuestの完了で回復します"),
    ),
    el(
      "div",
      { class: "rf-b-statuses" },
      model.statuses.length === 0
        ? el("span", { class: "rf-b-status-empty" }, "継続効果はありません")
        : null,
      ...model.statuses.map((status) => stateChip({ tone: status.tone, label: `${status.label} ${status.value}`, mark: "*" })),
    ),
  );
}

function previewPanel(model: BattleModel, state: BattleState): HTMLElement | null {
  if (state.phase === "previewing") {
    return el(
      "div",
      { class: "rf-b-preview", "data-phase": "previewing", role: "status" },
      el("p", { class: "rf-b-preview-title" }, "この手の結果を確認しています…"),
    );
  }
  if (state.phase === "failed" && state.failure !== null) {
    return el(
      "div",
      { class: "rf-b-preview", "data-phase": "failed", role: "alert" },
      el("p", { class: "rf-b-preview-title" }, "実行できません"),
      el("p", { class: "rf-b-preview-body" }, state.failure.message),
    );
  }
  const preview = state.preview;
  if (preview === null || preview.before === null || preview.after === null) return null;
  /* `invert` marks a value where going down is the good outcome (boss HP).
   * `neutral` marks one where neither direction is good or bad (the turn), so
   * the screen never editorialises a fact. */
  const delta = (label: string, before: number, after: number, sense: "up" | "down" | "neutral" = "up"): HTMLElement => {
    const change = after - before;
    const direction = change === 0 || sense === "neutral"
      ? "flat"
      : (sense === "down" ? change < 0 : change > 0) ? "good" : "bad";
    return el(
      "li",
      { class: "rf-b-delta", "data-direction": direction },
      el("span", { class: "rf-b-delta-label" }, label),
      el("span", { class: "rf-b-delta-value" }, `${before} → ${after}`),
      el("span", { class: "rf-b-delta-change" }, change === 0 ? "変化なし" : `${change > 0 ? "+" : ""}${change}`),
    );
  };
  return el(
    "div",
    { class: "rf-b-preview", "data-phase": "previewed", role: "status" },
    el("p", { class: "rf-b-preview-title" }, `${preview.command} を実行するとこうなります`),
    el(
      "ul",
      { class: "rf-b-deltas" },
      delta("ボス HP", preview.before.bossHp, preview.after.bossHp, "down"),
      delta("自分 HP", preview.before.playerHp, preview.after.playerHp, "up"),
      delta("MP", preview.before.mp, preview.after.mp, "up"),
      delta("ターン", preview.before.turn, preview.after.turn, "neutral"),
    ),
    preview.effects.length === 0
      ? null
      : el(
        "ul",
        { class: "rf-b-effects" },
        ...preview.effects.map((effect) => el(
          "li",
          { class: "rf-b-effect", "data-type": effect.type },
          el("span", { class: "rf-b-effect-type" }, effect.type),
          el("span", { class: "rf-b-effect-copy" }, `${effect.source} ${effect.amount}`),
        )),
      ),
    el("p", { class: "rf-b-preview-note" }, "ここまでは確認のみで、まだ何も書き込まれていません。"),
  );
}

function commandDeck(
  model: BattleModel,
  state: BattleState,
  callbacks: BattleCallbacks,
  context: ScreenContext,
): HTMLElement {
  const execute = el(
    "button",
    {
      type: "button",
      class: "rf-primary-button rf-b-execute",
      disabled: state.phase === "previewed" ? null : true,
    },
    state.phase === "submitting" ? "実行中…" : "この手を実行",
  );
  execute.addEventListener("click", () => {
    void executeCommand(model, state, callbacks, context.rerender, context.announce);
  });

  const cancel = el("button", { type: "button", class: "rf-secondary-button" }, "選び直す");
  cancel.addEventListener("click", () => {
    state.pendingCommand = null;
    state.preview = null;
    state.failure = null;
    state.phase = "idle";
    context.rerender();
  });

  return screenRegion(
    "介入 — 次の一手",
    { variant: "deck" },
    el(
      "div",
      { class: "rf-b-commands", role: "group", "aria-label": "コマンド" },
      ...model.commands.map((command) => {
        const button = el(
          "button",
          {
            type: "button",
            class: "rf-b-command",
            "data-command": command.id,
            "data-selected": state.pendingCommand === command.id ? "true" : "false",
            disabled: command.enabled && !model.writeHeld ? null : true,
            "aria-describedby": command.enabled ? null : `rf-b-why-${command.id}`,
          },
          el("span", { class: "rf-b-command-label" }, command.label),
          el("span", { class: "rf-b-command-cost" }, `MP ${command.mpCost}`),
          command.enabled
            ? null
            : el("span", { class: "rf-b-command-why", id: `rf-b-why-${command.id}` }, command.blockedReason),
        );
        button.addEventListener("click", () => {
          void previewCommand(model, state, callbacks, command.id, context.rerender);
        });
        return button;
      }),
    ),
    model.writeHeld
      ? el("p", { class: "rf-b-held" }, "接続または鮮度の問題により、実行は保留されています。")
      : null,
    previewPanel(model, state),
    state.phase === "idle" && state.pendingCommand === null
      ? el("p", { class: "rf-b-deck-hint" }, "コマンドを選ぶと、実行前に結果を確認できます。")
      : el("div", { class: "rf-b-deck-actions" }, cancel, execute),
  );
}

function timelineRegion(model: BattleModel, context: ScreenContext): HTMLElement {
  return screenRegion(
    "実行と判断の記録",
    { scroll: true, variant: "timeline" },
    model.timeline.length === 0
      ? el("p", { class: "rf-b-timeline-empty" }, "まだ記録はありません。最初の一手を実行すると、ここに残ります。")
      : el(
        "ol",
        { class: "rf-b-timeline" },
        ...model.timeline.map((event) => el(
          "li",
          { class: "rf-b-event", "data-channel": event.channel, "data-tone": event.tone },
          el(
            "span",
            { class: "rf-b-event-channel" },
            event.channel === "decision" ? "判断" : "実行",
          ),
          el("span", { class: "rf-b-event-text" }, event.text),
          el("span", { class: "rf-b-event-at" }, instantLabel(event.at)),
        )),
      ),
    el("h4", { class: "rf-b-sources-label" }, "MPを回復するQuest"),
    model.mpSources.length === 0
      ? el("p", { class: "rf-b-timeline-empty" }, "MPを回復できるQuestは残っていません。")
      : el(
        "ul",
        { class: "rf-b-sources" },
        ...model.mpSources.slice(0, 6).map((source) => {
          const row = el(
            "button",
            { type: "button", class: "rf-b-source" },
            el("span", { class: "rf-b-source-title" }, source.title),
            el("span", { class: "rf-b-source-gain" }, `MP +${source.mpGain}`),
          );
          row.addEventListener("click", () => context.onNavigate("quests", source.id));
          return el("li", null, row);
        }),
      ),
  );
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

function battleMetrics(model: BattleModel): readonly Metric[] {
  const blocked = model.commands.filter((command) => !command.enabled).length;
  return [
    { label: "ターン", value: String(model.turn), note: model.ended ? "終了済み" : "進行中", tone: model.ended ? "done" : "working" },
    { label: "ボス HP", value: `${model.bossHp}`, note: `/ ${model.bossMaxHp}`, tone: "blocked" },
    { label: "MP", value: `${model.mp}`, note: `/ ${model.maxMp}`, tone: "waiting" },
    { label: "選べない手", value: String(blocked), note: blocked === 0 ? "すべて実行できます" : "理由は各ボタンに表示", tone: blocked === 0 ? "done" : "danger" },
  ];
}

export function renderBattleDesktop(
  model: BattleModel,
  state: BattleState,
  context: ScreenContext,
  callbacks: BattleCallbacks,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  if (loading || model.bossMaxHp === 0) {
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--battle" },
        screenHeader({ title: "Battle", question: "今どの実行が進み、どこで問題が起き、人間が介入すべきか。" }),
        ...model.notices.map((notice) => screenNotice(notice)),
        loading
          ? screenSkeleton(3, "tile")
          : screenEmpty(
            "進行中の戦闘はありません",
            "Questを完了してMPを蓄えると、次の戦闘を開始できます。",
            { label: "Questを見る", onAct: () => context.onNavigate("quests") },
          ),
      ),
    };
  }

  const main = el(
    "div",
    { class: "rf-screen rf-screen--battle" },
    screenHeader({
      title: "Battle",
      question: "今どの実行が進み、どこで問題が起き、人間が介入すべきか。",
      meta: [
        { label: "フェーズ", value: `ターン ${model.turn}` },
        { label: "担当", value: model.playerName },
      ],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    objectiveBanner(model),
    metricRow(battleMetrics(model)),
    el(
      "div",
      { class: "rf-b-workspace" },
      el("div", { class: "rf-b-left" }, participants(model), commandDeck(model, state, callbacks, context)),
      timelineRegion(model, context),
    ),
  );

  return { main };
}

/* ------------------------------------------------------------------ *
 * Mobile — objective, current phase, latest events, next intervention
 * ------------------------------------------------------------------ */

export function renderBattleMobile(
  model: BattleModel,
  state: BattleState,
  context: ScreenContext,
  callbacks: BattleCallbacks,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  if (loading || model.bossMaxHp === 0) {
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--battle" },
        screenHeader({ title: "Battle", question: "今どの実行が進み、どこで問題が起き、人間が介入すべきか。" }),
        ...model.notices.map((notice) => screenNotice(notice)),
        loading ? screenSkeleton(3, "card") : screenEmpty("進行中の戦闘はありません", "Questを完了してMPを蓄えてください。"),
      ),
    };
  }

  const latest = model.timeline.slice(0, 3);
  const toggle = el(
    "button",
    { type: "button", class: "rf-b-m-toggle", "aria-expanded": state.timelineOpen ? "true" : "false" },
    state.timelineOpen ? "記録を閉じる" : `記録をすべて見る（${model.timeline.length}）`,
  );
  toggle.addEventListener("click", () => {
    state.timelineOpen = !state.timelineOpen;
    context.rerender();
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--battle", "data-mobile-view": "theatre" },
    screenHeader({
      title: "Battle",
      question: "今どの実行が進み、どこで問題が起き、人間が介入すべきか。",
      meta: [{ label: "フェーズ", value: `ターン ${model.turn}` }],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    objectiveBanner(model),
    el(
      "div",
      { class: "rf-b-m-vitals" },
      meter("自分 HP", model.playerHp, model.playerMaxHp, "player"),
      meter("MP", model.mp, model.maxMp, "mp"),
    ),
    model.statuses.length === 0
      ? null
      : el("div", { class: "rf-b-statuses" }, ...model.statuses.map((status) => stateChip({ tone: status.tone, label: `${status.label} ${status.value}`, mark: "*" }))),
    commandDeck(model, state, callbacks, context),
    el(
      "section",
      { class: "rf-b-m-latest", "aria-label": "最新のイベント" },
      el("h3", { class: "rf-b-m-latest-title" }, "最新のイベント"),
      latest.length === 0
        ? el("p", { class: "rf-b-timeline-empty" }, "まだ記録はありません。")
        : el(
          "ol",
          { class: "rf-b-timeline" },
          ...latest.map((event) => el(
            "li",
            { class: "rf-b-event", "data-channel": event.channel, "data-tone": event.tone },
            el("span", { class: "rf-b-event-channel" }, event.channel === "decision" ? "判断" : "実行"),
            el("span", { class: "rf-b-event-text" }, event.text),
          )),
        ),
      toggle,
      !state.timelineOpen
        ? null
        : el(
          "ol",
          { class: "rf-b-timeline" },
          ...model.timeline.slice(3).map((event) => el(
            "li",
            { class: "rf-b-event", "data-channel": event.channel, "data-tone": event.tone },
            el("span", { class: "rf-b-event-channel" }, event.channel === "decision" ? "判断" : "実行"),
            el("span", { class: "rf-b-event-text" }, event.text),
          )),
        ),
    ),
  );

  /* The sticky bar carries only the commitment, and only once a preview has
   * been produced. The deck itself stays in the page: a phone-height bar that
   * held five commands plus a preview would cover the log it is about to
   * change. Before that, the bar states what is holding the turn instead. */
  const execute = el(
    "button",
    { type: "button", class: "rf-primary-button", disabled: state.phase === "previewed" ? null : true },
    state.phase === "submitting" ? "実行中…" : "この手を実行",
  );
  execute.addEventListener("click", () => {
    void executeCommand(model, state, callbacks, context.rerender, context.announce);
  });

  const sticky = state.phase === "previewed" || state.phase === "submitting"
    ? el(
      "div",
      { class: "rf-b-m-bar", "data-shape": "ready" },
      el("span", { class: "rf-b-m-bar-copy" }, `${state.pendingCommand ?? ""} — MP ${state.preview?.cost ?? 0} 消費`),
      execute,
    )
    : el(
      "div",
      { class: "rf-b-m-bar", "data-shape": "compact" },
      el(
        "span",
        { class: "rf-b-m-bar-copy" },
        model.ended
          ? "この戦闘は終了しています"
          : model.writeHeld
            ? "実行は保留中です"
            : state.phase === "failed" && state.failure !== null
              ? state.failure.message
              : "コマンドを選ぶと結果を確認できます",
      ),
    );

  return { main, sticky };
}
