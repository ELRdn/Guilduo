/**
 * Battle ports.
 *
 * `FixtureBattlePort` runs the real `executeBattleCommand` from
 * `shared/battle-rules.ts` against an in-memory `QuestForgeState`, so the local
 * screen enforces exactly the rules the gateway enforces: MP costs, the enemy
 * turn, the ten-entry log, `expectedTurn` staleness and the `commandId` replay
 * guard. Nothing about the battle is simulated by the screen.
 *
 * `RepositoryBattlePort` wraps `QuestForgeRepository.battleCommand`, which posts
 * to the same `POST /v1/battle/commands` contract. Both satisfy `BattlePort`, so
 * swapping one for the other changes no screen code.
 */

import { createBattleSession, executeBattleCommand } from "../../../shared/battle-rules.ts";
import type { BattleSession, Quest, QuestForgeState } from "../../../types/questforge.ts";
import type { BattleEffectView, BattleOutcome, BattlePort } from "./battle-model.ts";
import { explainBattleFailure } from "./battle-model.ts";

/** The failure a fixture is asked to reproduce, for the state matrix. */
export type BattleFailure = "none" | "stale" | "ended" | "mp" | "permission" | "network";

interface DomainError {
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

function effectsOf(value: unknown): readonly BattleEffectView[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalidResponse();
    const record = entry as Record<string, unknown>;
    if (typeof record.type !== "string" || !record.type || typeof record.source !== "string") throw invalidResponse();
    return {
      type: record.type,
      amount: record.amount === undefined ? 0 : integer(record.amount),
      source: record.source,
    };
  });
}

function snapshotOf(value: unknown): BattleOutcome["before"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  const record = value as Record<string, unknown>;
  const read = (key: string): number => integer(record[key], key === "turn" ? 1 : 0);
  return { turn: read("turn"), mp: read("mp"), playerHp: read("playerHp"), bossHp: read("bossHp") };
}

function invalidResponse(): Error & { code: string } {
  return Object.assign(new Error(), { code:"invalid_response" });
}

function integer(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw invalidResponse();
  return value;
}

export function validateBattleSession(value: unknown): asserts value is BattleSession {
  const session = value as BattleSession | null;
  if (!session || session.schemaVersion !== 1 || !session.character || !session.boss || !session.battle || !Array.isArray(session.commands) || !Array.isArray(session.quests) || !Array.isArray(session.battle.log)) throw invalidResponse();
  integer(session.character.hp); integer(session.character.maxHp, 1);
  integer(session.boss.hp); integer(session.boss.maxHp, 1);
  integer(session.battle.mp); integer(session.battle.maxMp, 1); integer(session.battle.turn, 1);
  if (typeof session.battle.ended !== "boolean" || Number(session.character.hp) > Number(session.character.maxHp) || session.boss.hp > session.boss.maxHp || session.battle.mp > session.battle.maxMp) throw invalidResponse();
  for (const command of session.commands) {
    if (!command || typeof command.id !== "string" || typeof command.label !== "string" || typeof command.enabled !== "boolean") throw invalidResponse();
    integer(command.mpCost);
  }
  for (const quest of session.quests) {
    if (!quest || typeof quest.id !== "string" || typeof quest.title !== "string" || typeof quest.eligible !== "boolean") throw invalidResponse();
    integer(quest.mpGain);
  }
  for (const key of ["focus", "guard", "shield", "rage", "vulnerable", "poison"]) integer(session.battle[key]);
  for (const [record, keys] of [[session.character, ["name", "role"]], [session.boss, ["id", "name", "label", "weakKind"]]] as const) {
    for (const key of keys) if (typeof record[key] !== "string") throw invalidResponse();
  }
  const commandIds = session.commands.map(command => command.id);
  if (new Set(commandIds).size !== commandIds.length || commandIds.some(id => !["attack", "skill", "guard", "heal", "burst"].includes(id))) throw invalidResponse();
  if (session.quests.some(quest => !["habit", "daily", "todo", "reward"].includes(quest.kind))) throw invalidResponse();
  for (const entry of session.battle.log as unknown[]) {
    if (!entry || typeof entry !== "object" || typeof (entry as Record<string, unknown>).text !== "string") throw invalidResponse();
  }
}

function outcomeFrom(result: Record<string, unknown>): BattleOutcome {
  if (typeof result.command !== "string" || !["attack", "skill", "guard", "heal", "burst"].includes(result.command) || typeof result.dryRun !== "boolean" || typeof result.replayed !== "boolean") throw invalidResponse();
  const before = snapshotOf(result.before)!;
  const after = snapshotOf(result.after)!;
  validateBattleSession(result.session);
  const session = result.session;
  if (after.turn !== before.turn + 1 || (!result.replayed && (session.battle.turn !== after.turn || session.battle.mp !== after.mp || session.character.hp !== after.playerHp || session.boss.hp !== after.bossHp))) throw invalidResponse();
  return {
    ok: true,
    code: "",
    message: "",
    dryRun: result.dryRun === true,
    command: typeof result.command === "string" ? result.command : "",
    cost: integer(result.cost),
    before,
    after,
    effects: effectsOf(result.effects),
    session,
    replayed: result.replayed,
  };
}

function failureOutcome(code: string): BattleOutcome {
  return {
    ok: false,
    code,
    // Domain messages are English and technical; the user-facing copy is ours.
    // A raw payload, URL or token is never surfaced.
    get message() { return explainBattleFailure(code); },
    dryRun: false,
    command: "",
    cost: 0,
    before: null,
    after: null,
    effects: [],
    session: null,
  };
}

export class FixtureBattlePort implements BattlePort {
  private state: QuestForgeState;
  private readonly failure: BattleFailure;
  /** True while a request is in flight, so a double submit is refused. */
  private inFlight = false;

  constructor(state: QuestForgeState, options: { readonly failure?: BattleFailure } = {}) {
    this.state = state;
    this.failure = options.failure ?? "none";
  }

  session(): BattleSession {
    return createBattleSession(this.state);
  }

  async runCommand(input: {
    command: string;
    expectedTurn: number;
    commandId: string;
    dryRun: boolean;
  }): Promise<BattleOutcome> {
    if (this.failure === "permission") return failureOutcome("insufficient_scope");
    if (this.failure === "network") return failureOutcome("offline");
    if (!input.dryRun) {
      if (this.inFlight) return failureOutcome("busy");
      this.inFlight = true;
    }
    try {
      /* `stale` forces the expectedTurn the domain will reject, rather than
       * faking a 409 in the UI: the refusal must come from the rules. */
      const expectedTurn = this.failure === "stale" ? input.expectedTurn + 1 : input.expectedTurn;
      const result = executeBattleCommand(this.state, {
        command: input.command,
        expectedTurn,
        commandId: input.commandId,
        dryRun: input.dryRun,
      }) as unknown as Record<string, unknown>;
      // `executeBattleCommand` mutates `state` in place for a real execution and
      // works on a clone for a dry run, so nothing has to be copied back here.
      return outcomeFrom(result);
    } catch (error) {
      const domain = error as DomainError | null;
      return failureOutcome(domain?.code ?? "battle_command_invalid");
    } finally {
      if (!input.dryRun) this.inFlight = false;
    }
  }
}

/** The port a signed-in deployment uses. Same interface, same preview rule. */
export interface BattleCommandRepository {
  battleCommand(command: string, expectedTurn: number, commandId: string): Promise<Record<string, unknown>>;
  /** Added for the preview leg: the same endpoint with `dryRun: true`. */
  previewBattleCommand(command: string, expectedTurn: number): Promise<Record<string, unknown>>;
}

export class RepositoryBattlePort implements BattlePort {
  constructor(private readonly repository: BattleCommandRepository) {}

  async runCommand(input: {
    command: string;
    expectedTurn: number;
    commandId: string;
    dryRun: boolean;
  }): Promise<BattleOutcome> {
    try {
      const result = input.dryRun
        ? await this.repository.previewBattleCommand(input.command, input.expectedTurn)
        : await this.repository.battleCommand(input.command, input.expectedTurn, input.commandId);
      const outcome = outcomeFrom(result);
      if (outcome.command !== input.command || outcome.dryRun !== input.dryRun || outcome.before?.turn !== input.expectedTurn || (!input.dryRun && result.commandId !== input.commandId)) throw invalidResponse();
      return outcome;
    } catch (error) {
      const domain = error as DomainError | null;
      return failureOutcome(domain?.code ?? "failed");
    }
  }
}

/**
 * A minimal but complete `QuestForgeState` for the fixture port.
 * `normalizeBattleState` fills the rest of the defaults, so this only carries
 * what the screen's fixture needs to be deterministic.
 */
export function fixtureBattleState(quests: readonly Quest[], overrides: Partial<QuestForgeState> = {}): QuestForgeState {
  const base = {
    schemaVersion: 7,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-08-26T11:20:00.000Z",
    tasks: quests.map((quest) => ({ ...quest })),
    character: {
      id: "questforge-player",
      name: "Astra",
      className: "Operator",
      role: "operator",
      level: 24,
      hp: 74,
      maxHp: 110,
      xp: 320,
      nextXp: 600,
      gems: 48,
      streak: 6,
      variant: "femme",
      personality: "focused",
    },
    battle: {
      turn: 7,
      mp: 18,
      maxMp: 40,
      focus: 2,
      guard: 0,
      shield: 4,
      rage: 0,
      vulnerable: 1,
      poison: 0,
      ended: false,
      log: [
        { text: "たたかう: 11 damage", kind: "info", at: "2026-08-26T11:12:00.000Z" },
        { text: "Sentinel Strike: HP -6", kind: "danger", at: "2026-08-26T11:12:30.000Z" },
        { text: "まもる: 次の被ダメージを半減。", kind: "info", at: "2026-08-26T11:15:00.000Z" },
        { text: "たたかう: 14 damage", kind: "info", at: "2026-08-26T11:18:00.000Z" },
      ],
    },
    boss: {
      // One of the ids in BATTLE_BOSSES; an unknown id would fall back silently.
      currentId: "d",
      hp: 68,
      maxHp: 125,
      defeatedIds: [],
      defeatCount: 2,
      battleLog: [],
    },
    rewardClaims: {},
    taskEvents: [],
    migrationSnapshots: {},
  } as unknown as QuestForgeState;
  return { ...base, ...overrides } as QuestForgeState;
}
