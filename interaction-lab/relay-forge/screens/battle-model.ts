/**
 * Battle — port, ViewModel and production adapter.
 *
 * DOM-free. The port interface lives here so both `battle-port.ts` and the node
 * tests can reach it without pulling the renderer in.
 */

import type { BattleSession } from "../../../types/questforge.ts";
import type { ScreenNotice } from "./screen-state.ts";

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
}

export interface BattlePort {
  /**
   * `dryRun: true` must not write. Both the fixture port and
   * `QuestForgeRepository.battleCommand` reach `executeBattleCommand`, so the
   * preview a user sees is produced by the same rules the execution applies.
   */
  runCommand(input: { command: string; expectedTurn: number; commandId: string; dryRun: boolean }): Promise<BattleOutcome>;
}

const FAILURE_COPY: Readonly<Record<string, string>> = {
  battle_turn_stale: "ターンが進んでいます。最新の状態を読み込んでからやり直してください。",
  battle_ended: "この戦闘は終了しています。実行できる手はありません。",
  battle_mp_insufficient: "MPが足りません。Questを完了してMPを回復してください。",
  battle_command_invalid: "そのコマンドは選べません。",
  insufficient_scope: "battle:write のスコープが付与されていません。",
  offline: "接続がありません。復帰するまで実行は保留されます。",
};

export function explainBattleFailure(code: string): string {
  return FAILURE_COPY[code] ?? "実行できませんでした。時間をおいて再試行してください。";
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
    statusOf("focus", "集中", "working"),
    statusOf("guard", "防御", "done"),
    statusOf("shield", "シールド", "done"),
    statusOf("rage", "激昂", "blocked"),
    statusOf("vulnerable", "脆弱", "review"),
    statusOf("poison", "毒", "blocked"),
  ].filter((entry): entry is BattleStatusEffect => entry !== null);

  const ended = battle.ended === true;
  const commands = session.commands.map((entry): BattleCommandView => {
    const record = entry as unknown as Record<string, unknown>;
    const cost = num(record, "mpCost");
    const enabled = record.enabled === true && !ended;
    return {
      id: text(record, "id"),
      label: text(record, "label"),
      mpCost: cost,
      enabled,
      blockedReason: ended
        ? "戦闘は終了しています"
        : cost > mp
          ? `MPが${cost - mp}足りません`
          : record.enabled === true ? "" : "いまは選べません",
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
    objective: `${text(boss, "name")} を撃破する`,
    bossName: text(boss, "name"),
    bossLabel: text(boss, "label"),
    bossHp: num(boss, "hp"),
    bossMaxHp: num(boss, "maxHp"),
    weakKind: text(boss, "weakKind"),
    turn: num(battle, "turn"),
    ended,
    playerName: text(character, "name"),
    playerRole: text(character, "role"),
    playerHp: num(character, "hp"),
    playerMaxHp: num(character, "maxHp"),
    mp,
    maxMp: num(battle, "maxMp"),
    statuses,
    commands,
    timeline,
    mpSources: session.quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      mpGain: quest.mpGain,
      kind: quest.kind,
    })),
    notices: options.notices ?? [],
    writeHeld: options.writeHeld ?? false,
  };
}
