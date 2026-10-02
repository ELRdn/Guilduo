/**
 * Battle — port, ViewModel and production adapter.
 *
 * DOM-free. The port interface lives here so both `battle-port.ts` and the node
 * tests can reach it without pulling the renderer in.
 */

import type { BattleSession } from "../../../types/questforge.ts";
import type { ScreenNotice } from "./screen-state.ts";
import { t } from "../../../i18n.ts";
import { relayText } from "../relay-copy.ts";

/* ------------------------------------------------------------------ *
 * Port — the same shape `QuestForgeRepository` can satisfy
 * ------------------------------------------------------------------ */

export interface BattleEffectView {
  readonly type: string;
  readonly amount: number;
  readonly source: string;
}

export interface BattleOutcome {
  readonly ok: boolean;
  /** Domain error code when `ok` is false: battle_turn_stale, battle_ended, … */
  readonly code: string;
  readonly message: string;
  readonly dryRun: boolean;
  readonly command: string;
  readonly cost: number;
  readonly before: { readonly turn: number; readonly mp: number; readonly playerHp: number; readonly bossHp: number } | null;
  readonly after: { readonly turn: number; readonly mp: number; readonly playerHp: number; readonly bossHp: number } | null;
  readonly effects: readonly BattleEffectView[];
  /** The session the domain returned. The UI never synthesises one. */
  readonly session: BattleSession | null;
  readonly replayed?: boolean;
}

export interface BattlePort {
  /**
   * `dryRun: true` must not write. Both the fixture port and
   * `QuestForgeRepository.battleCommand` reach `executeBattleCommand`, so the
   * preview a user sees is produced by the same rules the execution applies.
   */
  runCommand(input: { command: string; expectedTurn: number; commandId: string; dryRun: boolean }): Promise<BattleOutcome>;
}

export function explainBattleFailure(code: string): string {
  switch (code) {
    case "battle_turn_stale": return relayText("battleStale");
    case "battle_ended": return relayText("battleEnded");
    case "battle_mp_insufficient": return t("battle.mpInsufficient");
    case "battle_command_invalid": return relayText("battleUnavailable");
    case "insufficient_scope": return relayText("battleScope");
    case "offline": return relayText("battleHeld");
    case "invalid_response": return relayText("connectionInvalidResponse");
    case "load_failed": return relayText("loadFailed");
    default: return t("battle.commandFailed");
  }
}

export function battleCommandLabel(command: string, fallback = command): string {
  return ["attack", "guard", "heal", "burst"].includes(command) ? t(`battle.${command}`) : fallback;
}

/* ------------------------------------------------------------------ *
 * ViewModel
 * ------------------------------------------------------------------ */

export interface BattleCommandView {
  readonly id: string;
  readonly label: string;
  readonly mpCost: number;
  /** The domain's own flag. False when the command cannot be issued now. */
  readonly enabled: boolean;
  /** Why it cannot be issued, when the reason is knowable from the session. */
  readonly blockedReason: string;
}

export interface BattleStatusEffect {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly tone: "working" | "review" | "blocked" | "waiting" | "done";
}

export interface TimelineEvent {
  /** `execution` comes from the domain log; `decision` is what the human did. */
  readonly channel: "execution" | "decision";
  readonly text: string;
  readonly tone: "info" | "success" | "danger";
  readonly at: string;
}

/** A Quest that would restore MP, linking Battle back to the portfolio. */
export interface MpSource {
  readonly id: string;
  readonly title: string;
  readonly mpGain: number;
  readonly kind: string;
}

export interface BattleModel {
  readonly objective: string;
  readonly bossName: string;
  readonly bossLabel: string;
  readonly bossHp: number;
  readonly bossMaxHp: number;
  readonly weakKind: string;
  readonly turn: number;
  readonly ended: boolean;
  readonly playerName: string;
  readonly playerRole: string;
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly mp: number;
  readonly maxMp: number;
  readonly statuses: readonly BattleStatusEffect[];
  readonly commands: readonly BattleCommandView[];
  readonly timeline: readonly TimelineEvent[];
  readonly mpSources: readonly MpSource[];
  readonly notices: readonly ScreenNotice[];
  readonly writeHeld: boolean;
}

/* ------------------------------------------------------------------ *
 * Production adapter
 * ------------------------------------------------------------------ */

function num(record: Record<string, unknown> | undefined, key: string): number {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

export interface NormalizeBattleOptions {
  readonly session: BattleSession | null;
  readonly notices?: readonly ScreenNotice[];
  readonly writeHeld?: boolean;
  /** Decision events recorded by this session's own interventions. */
  readonly decisions?: readonly TimelineEvent[];
}

/**
 * Maps one `BattleSession` onto the screen. Every number is read from the
 * session; nothing is recomputed here, so what the screen shows is exactly what
 * the domain would act on.
 */
export function normalizeBattleModel(options: NormalizeBattleOptions): BattleModel {
  const session = options.session;
  if (session === null) {
    return {
      objective: "", bossName: "", bossLabel: "", bossHp: 0, bossMaxHp: 0, weakKind: "",
      turn: 0, ended: false, playerName: "", playerRole: "", playerHp: 0, playerMaxHp: 0,
      mp: 0, maxMp: 0, statuses: [], commands: [], timeline: [], mpSources: [],
      notices: options.notices ?? [], writeHeld: options.writeHeld ?? false,
    };
  }

  const boss = session.boss as unknown as Record<string, unknown>;
  const battle = session.battle as unknown as Record<string, unknown>;
  const character = session.character as unknown as Record<string, unknown>;
  const mp = num(battle, "mp");

  const statusOf = (id: string, label: string, tone: BattleStatusEffect["tone"]): BattleStatusEffect | null => {
    const value = num(battle, id);
    return value > 0 ? { id, label, value, tone } : null;
  };

  const statuses = [
    statusOf("focus", relayText("battleFocus"), "working"),
    statusOf("guard", t("battle.guard"), "done"),
    statusOf("shield", relayText("battleShield"), "done"),
    statusOf("rage", relayText("battleRage"), "blocked"),
    statusOf("vulnerable", relayText("battleVulnerable"), "review"),
    statusOf("poison", relayText("battlePoison"), "blocked"),
  ].filter((entry): entry is BattleStatusEffect => entry !== null);

  const ended = battle.ended === true;
  const commands = session.commands.map((entry): BattleCommandView => {
    const record = entry as unknown as Record<string, unknown>;
    const cost = num(record, "mpCost");
    const enabled = record.enabled === true && !ended;
    return {
      id: text(record, "id"),
      label: battleCommandLabel(text(record, "id"), text(record, "label")),
      mpCost: cost,
      enabled,
      blockedReason: ended
        ? relayText("battleEnded")
        : cost > mp
          ? t("battle.mpInsufficient")
          : record.enabled === true ? "" : relayText("battleUnavailable"),
    };
  });

  const log = Array.isArray(battle.log) ? battle.log as Array<Record<string, unknown>> : [];
  const execution = log.map((entry): TimelineEvent => {
    const kind = text(entry, "kind");
    return {
      channel: "execution",
      // The root UI stores log entries as inline HTML; this surface renders plain text.
      text: text(entry, "text").replace(/<[^>]*>/g, ""),
      tone: kind === "success" ? "success" : kind === "danger" ? "danger" : "info",
      at: text(entry, "at"),
    };
  });

  const timeline = [...execution, ...(options.decisions ?? [])]
    .slice()
    .sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));

  return {
    objective: relayText("battleDefeatBoss").replace("{boss}", text(boss, "name")),
    bossName: text(boss, "name"),
    bossLabel: ["d", "e", "h", "g3", "h3"].includes(text(boss, "id")) ? t(`boss.${text(boss, "id")}.label`) : text(boss, "label"),
    bossHp: num(boss, "hp"),
    bossMaxHp: num(boss, "maxHp"),
    weakKind: text(boss, "weakKind"),
    turn: num(battle, "turn"),
    ended,
    playerName: text(character, "name"),
    playerRole: t(`role.${text(character, "role")}.label`),
    playerHp: num(character, "hp"),
    playerMaxHp: num(character, "maxHp"),
    mp,
    maxMp: num(battle, "maxMp"),
    statuses,
    commands,
    timeline,
    mpSources: session.quests.filter(quest => quest.eligible).map((quest) => ({
      id: quest.id,
      title: quest.title,
      mpGain: quest.mpGain,
      kind: quest.kind,
    })),
    notices: options.notices ?? [],
    writeHeld: options.writeHeld ?? false,
  };
}

export type BattlePhase = "idle" | "previewing" | "previewed" | "submitting" | "refreshing" | "failed";

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
  /** An uncertain write must be reconciled by a read before another move. */
  needsRefresh: boolean;
}

export function initialBattleState(): BattleState {
  return {
    pendingCommand: null,
    phase: "idle",
    preview: null,
    failure: null,
    decisions: [],
    timelineOpen: false,
    needsRefresh: false,
  };
}

export interface BattleCallbacks {
  readonly port: BattlePort;
  /** Called with the session the domain returned after a real execution. */
  readonly onSession: (session: BattleSession) => void;
  readonly isDisposed?: () => boolean;
  readonly onRefresh?: () => Promise<boolean>;
}

export function battleBusy(state: BattleState): boolean {
  return state.phase === "previewing" || state.phase === "submitting" || state.phase === "refreshing";
}

export function battlePreviewCurrent(model: BattleModel, state: BattleState): boolean {
  const before = state.preview?.before;
  return before !== undefined && before !== null && before.turn === model.turn && before.mp === model.mp && before.playerHp === model.playerHp && before.bossHp === model.bossHp;
}

export function cancelBattlePreview(state: BattleState): boolean {
  if (battleBusy(state) || state.needsRefresh) return false;
  state.pendingCommand = null;
  state.preview = null;
  state.failure = null;
  state.phase = "idle";
  return true;
}

function failBattle(state: BattleState, code: string): void {
  state.phase = "failed";
  state.failure = { code, get message() { return explainBattleFailure(code); } };
  if (code === "battle_turn_stale" || code === "battle_ended") state.needsRefresh = true;
}

export async function refreshBattle(state: BattleState, callbacks: BattleCallbacks, rerender: () => void): Promise<void> {
  if (battleBusy(state) || !callbacks.onRefresh || callbacks.isDisposed?.()) return;
  state.phase = "refreshing";
  rerender();
  let refreshed = false;
  try { refreshed = await callbacks.onRefresh(); } catch { /* Keep writes held until a successful read. */ }
  if (callbacks.isDisposed?.()) return;
  if (refreshed) { state.needsRefresh = false; state.phase = "idle"; cancelBattlePreview(state); }
  else { state.needsRefresh = true; failBattle(state, "load_failed"); }
  rerender();
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
  if (battleBusy(state) || state.needsRefresh || callbacks.isDisposed?.()) return;
  if (model.writeHeld) {
    failBattle(state, "offline");
    rerender();
    return;
  }
  if (!model.commands.some(command => command.id === commandId && command.enabled)) {
    failBattle(state, "battle_command_invalid"); rerender(); return;
  }
  state.pendingCommand = commandId;
  state.phase = "previewing";
  state.preview = null;
  state.failure = null;
  rerender();
  let outcome: BattleOutcome;
  try { outcome = await callbacks.port.runCommand({
    command: commandId,
    expectedTurn: model.turn,
    commandId: "preview",
    dryRun: true,
  }); } catch { if (!callbacks.isDisposed?.()) { failBattle(state, "failed"); rerender(); } return; }
  if (callbacks.isDisposed?.()) return;
  if (!outcome.ok) {
    failBattle(state, outcome.code);
    rerender();
    return;
  }
  if (!outcome.dryRun || outcome.command !== commandId || outcome.before === null || outcome.after === null || outcome.session === null || outcome.before.turn !== model.turn) {
    failBattle(state, "invalid_response"); rerender(); return;
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
  if (callbacks.isDisposed?.()) return;
  if (model.writeHeld || !model.commands.some(entry => entry.id === command && entry.enabled) || !battlePreviewCurrent(model, state)) {
    failBattle(state, model.writeHeld ? "offline" : "battle_turn_stale"); rerender(); return;
  }
  const expectedTurn = state.preview!.before!.turn;
  state.phase = "submitting";
  state.needsRefresh = true;
  state.failure = null;
  rerender();
  let outcome: BattleOutcome;
  try { outcome = await callbacks.port.runCommand({
    command,
    expectedTurn,
    commandId: `relay-forge-${crypto.randomUUID()}`,
    dryRun: false,
  }); } catch { if (!callbacks.isDisposed?.()) { failBattle(state, "failed"); rerender(); announce(state.failure!.message); } return; }
  if (callbacks.isDisposed?.()) return;
  if (!outcome.ok) {
    failBattle(state, outcome.code);
    rerender();
    announce(state.failure!.message);
    return;
  }
  if (outcome.dryRun || outcome.command !== command || outcome.before?.turn !== expectedTurn || outcome.after === null || outcome.session === null) {
    failBattle(state, "invalid_response"); rerender(); announce(state.failure!.message); return;
  }
  state.decisions.push({
    channel: "decision",
    get text() { return relayText("battleDone").replace("{command}", battleCommandLabel(command, model.commands.find(entry => entry.id === command)?.label)).replace("{turn}", String(expectedTurn)).replace("{cost}", String(outcome.cost)); },
    tone: "info",
    at: new Date().toISOString(),
  });
  state.pendingCommand = null;
  state.preview = null;
  state.phase = "idle";
  state.needsRefresh = false;
  if (outcome.session !== null) callbacks.onSession(outcome.session);
  rerender();
  announce(state.decisions.at(-1)!.text);
}
