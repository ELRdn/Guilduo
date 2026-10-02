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
import { t } from "../../../i18n.ts";
import { relayText } from "../relay-copy.ts";
import {
  type BattleModel,
  type BattleState,
  type BattleCallbacks,
  previewCommand,
  executeCommand,
  battleBusy,
  battlePreviewCurrent,
  cancelBattlePreview,
  refreshBattle,
  battleCommandLabel,
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
    { class: "rf-b-objective", "data-ended": model.ended ? "true" : "false", "data-result": model.ended ? model.bossHp === 0 ? "victory" : "defeat" : "ongoing", "aria-label": relayText("battleObjective") },
    el(
      "div",
      { class: "rf-b-objective-copy" },
      el("p", { class: "rf-b-objective-label" }, relayText("battleObjective")),
      el("h2", { class: "rf-b-objective-title" }, model.objective),
      el(
        "p",
        { class: "rf-b-objective-sub" },
        model.bossLabel,
        model.weakKind === "" ? null : el("span", { class: "rf-b-weak" }, t("boss.weakness", { kind:t(`kind.${model.weakKind}`) })),
      ),
    ),
    el(
      "div",
      { class: "rf-b-objective-meters" },
      meter(relayText("battleBossHp"), model.bossHp, model.bossMaxHp, "boss"),
      el(
        "div",
        { class: "rf-b-phase" },
        el("span", { class: "rf-b-phase-label" }, relayText("battleTurn")),
        el("strong", { class: "rf-b-phase-value" }, `${relayText("battleTurn")} ${model.turn}`),
        model.ended ? stateChip({ tone: model.bossHp === 0 ? "done" : "blocked", label: t(model.bossHp === 0 ? "battle.victory" : "battle.defeat"), mark: model.bossHp === 0 ? "OK" : "!" }) : stateChip({ tone: "working", label: t("battle.ongoing"), mark: ">>" }),
      ),
    ),
  );
}

function participants(model: BattleModel): HTMLElement {
  return screenRegion(
    relayText("battleParticipants"),
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
      meter(relayText("battlePlayerHp"), model.playerHp, model.playerMaxHp, "player"),
      meter("MP", model.mp, model.maxMp, "mp", t("battle.intro")),
    ),
    el(
      "div",
      { class: "rf-b-statuses" },
      model.statuses.length === 0
        ? el("span", { class: "rf-b-status-empty" }, relayText("battleNoStatuses"))
        : null,
      ...model.statuses.map((status) => stateChip({ tone: status.tone, label: `${status.label} ${status.value}`, mark: "*" })),
    ),
  );
}

function previewPanel(model: BattleModel, state: BattleState): HTMLElement | null {
  if (state.phase === "previewing" || state.phase === "refreshing") {
    return el(
      "div",
      { class: "rf-b-preview", "data-phase": state.phase, role: "status", tabindex:"-1" },
      el("p", { class: "rf-b-preview-title" }, relayText(state.phase === "refreshing" ? "statusLoading" : "battlePreviewing")),
    );
  }
  if (state.phase === "failed" && state.failure !== null) {
    return el(
      "div",
      { class: "rf-b-preview", "data-phase": "failed", role: "alert", tabindex:"-1" },
      el("p", { class: "rf-b-preview-title" }, relayText("battleUnavailable")),
      el("p", { class: "rf-b-preview-body" }, state.failure.message),
    );
  }
  if (state.phase === "previewed" && !battlePreviewCurrent(model, state)) return el("p", { class:"rf-b-preview-body", role:"alert" }, relayText("battleStale"));
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
      el("span", { class: "rf-b-delta-change" }, change === 0 ? relayText("battleNoChange") : `${change > 0 ? "+" : ""}${change}`),
    );
  };
  return el(
    "div",
    { class: "rf-b-preview", "data-phase": "previewed", role: "status" },
    el("p", { class: "rf-b-preview-title" }, relayText("battlePreview").replace("{command}", battleCommandLabel(preview.command, model.commands.find(command => command.id === preview.command)?.label))),
    el(
      "ul",
      { class: "rf-b-deltas" },
      delta(relayText("battleBossHp"), preview.before.bossHp, preview.after.bossHp, "down"),
      delta(relayText("battlePlayerHp"), preview.before.playerHp, preview.after.playerHp, "up"),
      delta("MP", preview.before.mp, preview.after.mp, "up"),
      delta(relayText("battleTurn"), preview.before.turn, preview.after.turn, "neutral"),
    ),
    preview.effects.length === 0
      ? null
      : el(
        "ul",
        { class: "rf-b-effects" },
        ...preview.effects.map((effect) => el(
          "li",
          { class: "rf-b-effect", "data-type": effect.type },
          el("span", { class: "rf-b-effect-type" }, ({ boss_damage:relayText("battleBossHp"), player_damage:relayText("battlePlayerHp"), mp_gain:"MP +", mp_drain:"MP -", mp_spend:"MP -", heal:t("battle.heal"), guard:t("battle.guard") } as Record<string, string>)[effect.type] ?? effect.type),
          el("span", { class: "rf-b-effect-copy" }, `${battleCommandLabel(effect.source, effect.source === "rage" ? relayText("battleRage") : effect.source)} ${effect.amount}`),
        )),
      ),
    el("p", { class: "rf-b-preview-note" }, relayText("battlePreviewOnly")),
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
      "data-battle-action":"execute",
      disabled: state.phase === "previewed" && !model.writeHeld && battlePreviewCurrent(model, state) ? null : true,
    },
    state.phase === "submitting" ? relayText("executing") : relayText("battleExecute"),
  );
  execute.addEventListener("click", () => {
    void executeCommand(model, state, callbacks, context.rerender, context.announce);
  });

  const cancel = el("button", { type: "button", class: "rf-secondary-button", "data-battle-action":"cancel", disabled:battleBusy(state) || state.needsRefresh }, relayText("battleChooseAgain"));
  cancel.addEventListener("click", () => {
    if (cancelBattlePreview(state)) context.rerender();
  });

  const refresh = callbacks.onRefresh ? el("button", { type:"button", class:"rf-secondary-button", "data-battle-action":"refresh", disabled:battleBusy(state) }, relayText("refresh")) : null;
  refresh?.addEventListener("click", () => { void refreshBattle(state, callbacks, context.rerender); });

  return screenRegion(
    relayText("battleNextMove"),
    { variant: "deck" },
    el(
      "div",
      { class: "rf-b-commands", role: "group", "aria-label": t("battle.classPanel") },
      ...model.commands.map((command) => {
        const button = el(
          "button",
          {
            type: "button",
            class: "rf-b-command",
            "data-command": command.id,
            "aria-pressed": state.pendingCommand === command.id ? "true" : "false",
            "data-selected": state.pendingCommand === command.id ? "true" : "false",
            disabled: command.enabled && !model.writeHeld && !state.needsRefresh && !battleBusy(state) ? null : true,
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
      ? el("p", { class: "rf-b-held" }, relayText("battleHeld"))
      : null,
    previewPanel(model, state),
    refresh,
    state.phase === "idle" && state.pendingCommand === null
      ? el("p", { class: "rf-b-deck-hint" }, relayText("battleChooseHint"))
      : el("div", { class: "rf-b-deck-actions" }, cancel, execute),
  );
}

function timelineRegion(model: BattleModel, context: ScreenContext): HTMLElement {
  return screenRegion(
    relayText("battleHistory"),
    { scroll: true, variant: "timeline" },
    model.timeline.length === 0
      ? el("p", { class: "rf-b-timeline-empty" }, relayText("battleNoHistory"))
      : el(
        "ol",
        { class: "rf-b-timeline" },
        ...model.timeline.map((event) => el(
          "li",
          { class: "rf-b-event", "data-channel": event.channel, "data-tone": event.tone },
          el(
            "span",
            { class: "rf-b-event-channel" },
            event.channel === "decision" ? relayText("battleDecision") : relayText("battleExecution"),
          ),
          el("span", { class: "rf-b-event-text" }, event.text),
          el("span", { class: "rf-b-event-at" }, instantLabel(event.at)),
        )),
      ),
    mpSources(model, context),
  );
}

function mpSources(model: BattleModel, context: ScreenContext): HTMLElement {
  return el("div", { class:"rf-b-mp-sources" },
    el("h4", { class: "rf-b-sources-label" }, t("battle.questPanel")),
    model.mpSources.length === 0
      ? el("p", { class: "rf-b-timeline-empty" }, t("battle.empty"))
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
    { label: relayText("battleTurn"), value: String(model.turn), note: t(model.ended ? model.bossHp === 0 ? "battle.victory" : "battle.defeat" : "battle.ongoing"), tone: model.ended ? model.bossHp === 0 ? "done" : "blocked" : "working" },
    { label: relayText("battleBossHp"), value: `${model.bossHp}`, note: `/ ${model.bossMaxHp}`, tone: "blocked" },
    { label: "MP", value: `${model.mp}`, note: `/ ${model.maxMp}`, tone: "waiting" },
    { label: relayText("battleBlockedMoves"), value: String(blocked), note: blocked === 0 ? relayText("battleAllAvailable") : relayText("battleReasons"), tone: blocked === 0 ? "done" : "danger" },
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
        { class: "rf-screen rf-screen--battle", "aria-busy":battleBusy(state) ? "true" : "false" },
        screenHeader({ title: "Battle", question: relayText("battleQuestion") }),
        ...model.notices.map((notice) => screenNotice(notice)),
        loading
          ? screenSkeleton(3, "tile")
          : screenEmpty(
            relayText("battleNoSession"),
            relayText("battleNoSessionHint"),
            { label: t("nav.tasks"), onAct: () => context.onNavigate("quests") },
          ),
      ),
    };
  }

  const main = el(
    "div",
    { class: "rf-screen rf-screen--battle", "aria-busy":battleBusy(state) ? "true" : "false" },
    screenHeader({
      title: "Battle",
      question: relayText("battleQuestion"),
      meta: [
        { label: relayText("battleTurn"), value: `${relayText("battleTurn")} ${model.turn}` },
        { label: t("task.assignee"), value: model.playerName },
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
        { class: "rf-screen rf-screen--battle", "aria-busy":battleBusy(state) ? "true" : "false" },
        screenHeader({ title: "Battle", question: relayText("battleQuestion") }),
        ...model.notices.map((notice) => screenNotice(notice)),
        loading ? screenSkeleton(3, "card") : screenEmpty(relayText("battleNoSession"), relayText("battleNoSessionHint")),
      ),
    };
  }

  const latest = model.timeline.slice(0, 3);
  const toggle = el(
    "button",
    { type: "button", class: "rf-b-m-toggle", "data-battle-action":"timeline", "aria-controls":"rf-b-history", "aria-expanded": state.timelineOpen ? "true" : "false" },
    state.timelineOpen ? relayText("close") : relayText("battleShowHistory").replace("{count}", String(model.timeline.length)),
  );
  toggle.addEventListener("click", () => {
    state.timelineOpen = !state.timelineOpen;
    context.rerender();
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--battle", "aria-busy":battleBusy(state) ? "true" : "false", "data-mobile-view": "theatre" },
    screenHeader({
      title: "Battle",
      question: relayText("battleQuestion"),
      meta: [{ label: relayText("battleTurn"), value: `${relayText("battleTurn")} ${model.turn}` }],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    objectiveBanner(model),
    el(
      "div",
      { class: "rf-b-m-vitals" },
      meter(relayText("battlePlayerHp"), model.playerHp, model.playerMaxHp, "player"),
      meter("MP", model.mp, model.maxMp, "mp"),
    ),
    model.statuses.length === 0
      ? null
      : el("div", { class: "rf-b-statuses" }, ...model.statuses.map((status) => stateChip({ tone: status.tone, label: `${status.label} ${status.value}`, mark: "*" }))),
    commandDeck(model, state, callbacks, context),
    mpSources(model, context),
    el(
      "section",
      { class: "rf-b-m-latest", "aria-label": relayText("battleLatest") },
      el("h3", { class: "rf-b-m-latest-title" }, relayText("battleLatest")),
      latest.length === 0
        ? el("p", { class: "rf-b-timeline-empty" }, relayText("battleNoHistory"))
        : el(
          "ol",
          { class: "rf-b-timeline" },
          ...latest.map((event) => el(
            "li",
            { class: "rf-b-event", "data-channel": event.channel, "data-tone": event.tone },
            el("span", { class: "rf-b-event-channel" }, event.channel === "decision" ? relayText("battleDecision") : relayText("battleExecution")),
            el("span", { class: "rf-b-event-text" }, event.text),
          )),
        ),
      toggle,
      el(
          "ol",
          { class: "rf-b-timeline", id:"rf-b-history", hidden:!state.timelineOpen },
          ...model.timeline.slice(3).map((event) => el(
            "li",
            { class: "rf-b-event", "data-channel": event.channel, "data-tone": event.tone },
            el("span", { class: "rf-b-event-channel" }, event.channel === "decision" ? relayText("battleDecision") : relayText("battleExecution")),
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
    { type: "button", class: "rf-primary-button", "data-battle-action":"execute-sticky", disabled: state.phase === "previewed" && !model.writeHeld && battlePreviewCurrent(model, state) ? null : true },
    state.phase === "submitting" ? relayText("executing") : relayText("battleExecute"),
  );
  execute.addEventListener("click", () => {
    void executeCommand(model, state, callbacks, context.rerender, context.announce);
  });

  const sticky = state.phase === "previewed" || state.phase === "submitting"
    ? el(
      "div",
      { class: "rf-b-m-bar", "data-shape": "ready" },
      el("span", { class: "rf-b-m-bar-copy" }, `${battleCommandLabel(state.pendingCommand ?? "", model.commands.find(command => command.id === state.pendingCommand)?.label)} · MP -${state.preview?.cost ?? 0}`),
      execute,
    )
    : el(
      "div",
      { class: "rf-b-m-bar", "data-shape": "compact" },
      el(
        "span",
        { class: "rf-b-m-bar-copy" },
        model.ended
          ? relayText("battleEnded")
          : model.writeHeld
            ? relayText("battleHeld")
            : state.phase === "failed" && state.failure !== null
              ? state.failure.message
              : relayText("battleChooseHint"),
      ),
    );

  return { main, sticky };
}
