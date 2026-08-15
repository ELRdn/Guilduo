import type {
  BattleBossProfile,
  BattleCommandId,
  BattleCommandInput,
  BattleEffect,
  BattleRoleId,
  BattleSession,
  BattleSkill,
  BossState,
  CharacterState,
  Quest,
  QuestForgeState,
} from "../types/questforge.ts";

type MutableCharacter = CharacterState & {
  id?: string;
  role: string;
  level: number;
  hp: number;
  maxHp: number;
  gems: number;
  xp: number;
  nextXp: number;
};

type BattleSummary = {
  commandId: string;
  command: string;
  expectedTurn: number;
  turn: number;
  cost: number;
  before: Record<string, number>;
  after: Record<string, number>;
  effects: BattleEffect[];
  replayed: boolean;
  dryRun: boolean;
  [key: string]: unknown;
};

type BattleClaim = BattleSummary;

type MutableBattle = QuestForgeState["battle"] & {
  turn: number;
  mp: number;
  maxMp: number;
  focus: number;
  guard: number;
  shield: number;
  rage: number;
  vulnerable: number;
  poison: number;
  ended: boolean;
  log: Array<Record<string, unknown>>;
  commandClaims: Record<string, BattleClaim>;
  commandClaimOrder: string[];
};

type MutableBoss = BossState & {
  currentId: string;
  hp: number;
  maxHp: number;
  defeatedIds: string[];
  defeatCount: number;
  battleLog: Array<Record<string, unknown>>;
};

type MutableBattleState = QuestForgeState & {
  character: MutableCharacter;
  boss: MutableBoss;
  battle: MutableBattle;
  tasks: Quest[];
};

type BattleCommandResult = BattleSummary & {
  session: BattleSession;
};

const COMMANDS: ReadonlySet<BattleCommandId> = new Set(["attack", "skill", "guard", "heal", "burst"]);

function isBattleCommand(value: string): value is BattleCommandId {
  return COMMANDS.has(value as BattleCommandId);
}

export const BATTLE_SKILLS: Readonly<Record<BattleRoleId, BattleSkill>> = Object.freeze({
  sentinel: { id: "aegis-break", name: "Aegis Break", cost: 18 },
  archivist: { id: "weakness-note", name: "Weakness Note", cost: 16 },
  operator: { id: "protocol-spike", name: "Protocol Spike", cost: 20 },
  alchemist: { id: "bloom-tonic", name: "Bloom Tonic", cost: 18 },
  ranger: { id: "twin-shot", name: "Twin Shot", cost: 18 },
  artificer: { id: "gear-cannon", name: "Gear Cannon", cost: 22 },
});

export const BATTLE_BOSSES: Readonly<Record<string, BattleBossProfile>> = Object.freeze({
  d: { id: "d", name: "Dark Quest Knight", label: "暗黒騎士", maxHp: 125, rewardGems: 26, rewardXp: 36, weakKind: "todo" },
  e: { id: "e", name: "Deadline Wraith", label: "締切レイス", maxHp: 115, rewardGems: 24, rewardXp: 34, weakKind: "daily" },
  h: { id: "h", name: "Deadline Wraith Lite", label: "小型レイス", maxHp: 95, rewardGems: 18, rewardXp: 26, weakKind: "habit" },
  g3: { id: "g3", name: "Shadow Knight", label: "影騎士", maxHp: 110, rewardGems: 22, rewardXp: 32, weakKind: "todo" },
  h3: { id: "h3", name: "Compact Deadline Wraith", label: "締切の影", maxHp: 100, rewardGems: 20, rewardXp: 30, weakKind: "daily" },
});

class BattleError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BattleError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function battleError(status: number, code: string, message: string, details?: unknown): BattleError {
  return new BattleError(status, code, message, details);
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function integer(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isBattleRole(value: unknown): value is BattleRoleId {
  return typeof value === "string" && value in BATTLE_SKILLS;
}

function roleOf(state: { character?: { role?: unknown } }): BattleRoleId {
  return isBattleRole(state.character?.role) ? state.character.role : "sentinel";
}

export function battleSkill(role: string): BattleSkill {
  return BATTLE_SKILLS[isBattleRole(role) ? role : "sentinel"];
}

export function battleBoss(state: { boss?: { currentId?: unknown; maxHp?: unknown } }): BattleBossProfile {
  const currentId = state.boss?.currentId;
  const profile = typeof currentId === "string" ? BATTLE_BOSSES[currentId] : undefined;
  return profile || {
    ...BATTLE_BOSSES.h3,
    id: typeof currentId === "string" && currentId ? currentId : "h3",
    maxHp: Math.max(1, integer(state.boss?.maxHp, 100)),
  };
}

export function battleCommandCost(command: string, role = "sentinel"): number {
  if (!isBattleCommand(command)) throw battleError(400, "battle_command_invalid", "Unknown battle command.");
  const costs: Record<BattleCommandId, number> = { attack: 0, skill: battleSkill(role).cost, guard: 6, heal: 14, burst: 40 };
  return costs[command as BattleCommandId];
}

export function isBattleQuestEligible(task: Quest): boolean {
  if (!task || !["habit", "daily", "todo"].includes(task.kind)) return false;
  if (task.negativeOnly) return false;
  if (["completed", "archived"].includes(task.lifecycleState)) return false;
  return task.kind === "habit" || !task.done;
}

export function battleMpForQuest(task: Quest, weakKind: string = ""): number {
  if (!isBattleQuestEligible(task)) return 0;
  const scale = { trivial: 0.5, easy: 1, medium: 1.5, hard: 2.5 }[task.difficulty] || 1;
  const base = { habit: 6, daily: 14, todo: 20 }[task.kind as "habit" | "daily" | "todo"] || 0;
  return base ? Math.max(1, Math.round(base * scale + (task.kind === weakKind ? 4 : 0))) : 0;
}

export function normalizeBattleState(state: QuestForgeState): MutableBattleState {
  const rawCharacter = state.character && typeof state.character === "object" ? state.character : {};
  state.character = {
    name: "Astra",
    className: "Sentinel",
    role: "sentinel",
    level: 1,
    hp: 50,
    maxHp: 50,
    xp: 0,
    nextXp: 100,
    gems: 0,
    streak: 0,
    variant: "femme",
    personality: "",
    ...rawCharacter,
  };
  const character = state.character as MutableCharacter;
  character.level = Math.max(1, integer(character.level, 1));
  character.hp = Math.max(0, integer(character.hp, 50));
  character.maxHp = Math.max(1, integer(character.maxHp, 50));
  character.gems = Math.max(0, integer(character.gems));
  character.xp = Math.max(0, integer(character.xp));
  character.nextXp = Math.max(1, integer(character.nextXp, 100));
  character.role = roleOf(state);

  const rawBoss = state.boss && typeof state.boss === "object" ? state.boss : {};
  state.boss = { hp: 100, maxHp: 100, defeatedIds: [], defeatCount: 0, battleLog: [], ...rawBoss };
  const bossState = state.boss as MutableBoss;
  const boss = battleBoss(state);
  bossState.currentId = boss.id;
  bossState.maxHp = Math.max(1, integer(bossState.maxHp, boss.maxHp));
  bossState.hp = clamp(integer(bossState.hp, bossState.maxHp), 0, bossState.maxHp);
  bossState.defeatedIds = Array.isArray(bossState.defeatedIds) ? [...new Set(bossState.defeatedIds.map(String))] : [];
  bossState.defeatCount = Math.max(0, integer(bossState.defeatCount));
  bossState.battleLog = Array.isArray(bossState.battleLog) ? bossState.battleLog.slice(0, 8) : [];

  const rawBattle = state.battle && typeof state.battle === "object" ? state.battle : {};
  state.battle = { turn: 1, mp: 0, maxMp: 80, focus: 0, guard: 0, shield: 0, rage: 0, vulnerable: 0, poison: 0, ended: false, log: [], ...rawBattle };
  const battle = state.battle as MutableBattle;
  battle.turn = Math.max(1, integer(battle.turn, 1));
  battle.maxMp = Math.max(1, integer(battle.maxMp, 80));
  battle.mp = clamp(integer(battle.mp), 0, battle.maxMp);
  for (const key of ["focus", "guard", "shield", "rage", "vulnerable", "poison"] as const) battle[key] = Math.max(0, integer(battle[key]));
  battle.ended = Boolean(battle.ended || character.hp <= 0 || bossState.hp <= 0);
  battle.log = Array.isArray(battle.log) ? battle.log.slice(0, 10) : [];
  battle.commandClaims = battle.commandClaims && typeof battle.commandClaims === "object" && !Array.isArray(battle.commandClaims)
    ? battle.commandClaims as Record<string, BattleClaim>
    : {};
  battle.commandClaimOrder = Array.isArray(battle.commandClaimOrder) ? battle.commandClaimOrder.slice(-100) : [];
  return state as MutableBattleState;
}

function appendLog(state: MutableBattleState, text: string, kind = "info"): void {
  state.battle.log = [{ text, kind, at: new Date().toISOString() }, ...state.battle.log].slice(0, 10);
}

function grantXp(character: MutableCharacter, amount: number): void {
  character.xp += amount;
  while (character.xp >= character.nextXp) {
    character.xp -= character.nextXp;
    character.level += 1;
    character.maxHp += 5;
    character.hp = character.maxHp;
    character.nextXp += 25;
  }
}

function defeatBoss(state: MutableBattleState, boss: BattleBossProfile, source: string, damage: number): void {
  if (!state.boss.defeatedIds.includes(boss.id)) state.boss.defeatedIds.push(boss.id);
  state.boss.defeatCount += 1;
  state.character.gems += boss.rewardGems;
  grantXp(state.character, boss.rewardXp);
  state.boss.lastReward = `+${boss.rewardGems} Gem / +${boss.rewardXp} XP`;
  state.boss.battleLog = [{
    id: `battle-${state.battle.turn}-${state.boss.defeatCount}`,
    at: new Date().toISOString(),
    boss: boss.label,
    task: source,
    kind: "battle",
    damage,
    weak: false,
    defeated: true,
    reward: state.boss.lastReward,
  }, ...state.boss.battleLog].slice(0, 8);
  state.battle.ended = true;
  appendLog(state, `勝利: ${source}で${damage}ダメージ。ボスを撃破しました。`, "success");
}

function dealBossDamage(state: MutableBattleState, amount: number, source: string, effects: BattleEffect[]): number {
  const boss = battleBoss(state);
  let damage = Math.max(0, integer(amount));
  if (state.battle.vulnerable > 0) {
    damage = Math.round(damage * 1.35);
    state.battle.vulnerable -= 1;
  }
  state.boss.hp = Math.max(0, state.boss.hp - damage);
  effects.push({ type: "boss_damage", amount: damage, source });
  appendLog(state, `${source}: ${damage} damage`);
  if (state.boss.hp <= 0) defeatBoss(state, boss, source, damage);
  return damage;
}

function takePlayerDamage(state: MutableBattleState, amount: number, source: string, effects: BattleEffect[]): void {
  let damage = Math.max(0, integer(amount));
  if (state.battle.guard > 0) {
    damage = Math.ceil(damage / 2);
    state.battle.guard -= 1;
  }
  if (state.battle.shield > 0) {
    const blocked = Math.min(state.battle.shield, damage);
    damage -= blocked;
    state.battle.shield -= blocked;
  }
  state.character.hp = Math.max(0, state.character.hp - damage);
  effects.push({ type: "player_damage", amount: damage, source });
  appendLog(state, `${source}: HP -${damage}`, "danger");
  if (state.character.hp <= 0) {
    state.battle.ended = true;
    appendLog(state, "敗北: HPが尽きました。", "danger");
  }
}

function useRoleSkill(state: MutableBattleState, role: BattleRoleId, effects: BattleEffect[]): void {
  const skill = battleSkill(role);
  if (role === "sentinel") {
    dealBossDamage(state, 22, skill.name, effects);
    state.battle.guard += 1;
  } else if (role === "archivist") {
    state.battle.vulnerable += 2;
    dealBossDamage(state, 12, skill.name, effects);
    state.battle.mp = Math.min(state.battle.maxMp, state.battle.mp + 8);
    effects.push({ type: "mp_gain", amount: 8, source: skill.name });
  } else if (role === "operator") {
    dealBossDamage(state, 28, skill.name, effects);
    state.battle.rage = Math.max(0, state.battle.rage - 1);
  } else if (role === "alchemist") {
    const healed = Math.min(14, state.character.maxHp - state.character.hp);
    state.character.hp += healed;
    state.battle.poison += 3;
    effects.push({ type: "heal", amount: healed, source: skill.name });
    dealBossDamage(state, 12, skill.name, effects);
  } else if (role === "ranger") {
    dealBossDamage(state, 13 + state.battle.focus, `${skill.name} 1`, effects);
    if (!state.battle.ended) dealBossDamage(state, 13 + state.battle.focus, `${skill.name} 2`, effects);
  } else if (role === "artificer") {
    dealBossDamage(state, 32, skill.name, effects);
    state.battle.shield += 8;
  }
}

function runEnemyTurn(state: MutableBattleState, effects: BattleEffect[]): void {
  if (state.battle.poison > 0) {
    dealBossDamage(state, state.battle.poison, "毒", effects);
    state.battle.poison -= 1;
    if (state.battle.ended) return;
  }
  state.battle.turn += 1;
  const baseDamage = 8 + state.battle.rage * 2;
  if (state.battle.turn % 3 === 0) {
    state.battle.rage += 1;
    takePlayerDamage(state, baseDamage + 5, "ボスの強攻撃", effects);
  } else takePlayerDamage(state, baseDamage, "ボスの攻撃", effects);
  if (state.battle.rage >= 3 && state.battle.mp > 0) {
    const drain = Math.min(6, state.battle.mp);
    state.battle.mp -= drain;
    effects.push({ type: "mp_drain", amount: drain, source: "rage" });
    appendLog(state, `Rage効果: MP -${drain}`, "danger");
  }
}

function commandDescriptors(state: MutableBattleState): Array<{ id: string; label: string; mpCost: number; enabled: boolean }> {
  const role = roleOf(state);
  const skill = battleSkill(role);
  return [
    { id: "attack", label: "たたかう", mpCost: 0, enabled: !state.battle.ended },
    { id: "skill", label: skill.name, mpCost: skill.cost, enabled: !state.battle.ended && state.battle.mp >= skill.cost },
    { id: "guard", label: "まもる", mpCost: 6, enabled: !state.battle.ended && state.battle.mp >= 6 },
    { id: "heal", label: "かいふく", mpCost: 14, enabled: !state.battle.ended && state.battle.mp >= 14 },
    { id: "burst", label: "バースト", mpCost: 40, enabled: !state.battle.ended && state.battle.mp >= 40 },
  ];
}

export function createBattleSession(rawState: QuestForgeState): BattleSession {
  const state = normalizeBattleState(rawState);
  const boss = battleBoss(state);
  return {
    schemaVersion: 1,
    character: {
      id: state.character.id || "questforge-player",
      name: state.character.name || "Astra",
      role: roleOf(state),
      variant: state.character.variant || "femme",
      level: state.character.level,
      hp: state.character.hp,
      maxHp: state.character.maxHp,
      gems: state.character.gems,
      xp: state.character.xp,
    },
    boss: {
      id: boss.id,
      name: boss.name,
      label: boss.label,
      hp: state.boss.hp,
      maxHp: state.boss.maxHp,
      weakKind: boss.weakKind,
      rewardGems: boss.rewardGems,
      rewardXp: boss.rewardXp,
    },
    battle: {
      turn: state.battle.turn,
      mp: state.battle.mp,
      maxMp: state.battle.maxMp,
      focus: state.battle.focus,
      guard: state.battle.guard,
      shield: state.battle.shield,
      rage: state.battle.rage,
      vulnerable: state.battle.vulnerable,
      poison: state.battle.poison,
      ended: state.battle.ended,
      log: clone(state.battle.log),
    },
    quests: (state.tasks || []).filter(isBattleQuestEligible).map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes || "",
      kind: task.kind,
      difficulty: task.difficulty,
      mpGain: battleMpForQuest(task, boss.weakKind),
      eligible: true,
    })),
    commands: commandDescriptors(state),
  };
}

export function executeBattleCommand(rawState: QuestForgeState, input: BattleCommandInput = {}): BattleCommandResult {
  const state = normalizeBattleState(rawState);
  const command = String(input.command || "");
  if (!isBattleCommand(command)) throw battleError(400, "battle_command_invalid", "Unknown battle command.");
  const dryRun = input.dryRun !== false;
  const expectedTurn = input.expectedTurn === undefined ? state.battle.turn : Number(input.expectedTurn);
  if (!Number.isInteger(expectedTurn) || expectedTurn < 1) throw battleError(400, "battle_turn_invalid", "expectedTurn must be a positive integer.");
  const commandId = String(input.commandId || "").trim();
  if (!dryRun && !commandId) throw battleError(400, "battle_command_id_required", "commandId is required when executing a battle command.");
  if (commandId.length > 120) throw battleError(400, "battle_command_id_invalid", "commandId is too long.");
  if (!dryRun && state.battle.commandClaims[commandId]) {
    const claim = state.battle.commandClaims[commandId];
    if (claim.command !== command || claim.expectedTurn !== expectedTurn) {
      throw battleError(409, "battle_command_id_conflict", "commandId was already used for another battle command.");
    }
    return { ...clone(claim), replayed: true, dryRun: false, session: createBattleSession(state) };
  }
  if (expectedTurn !== state.battle.turn) throw battleError(409, "battle_turn_stale", "Battle turn changed. Refresh the battle session.", { expectedTurn, currentTurn: state.battle.turn });
  if (state.battle.ended) throw battleError(409, "battle_ended", "Battle has ended. Reset or change the boss in QuestForge.");

  const target = dryRun ? clone(state) : state;
  normalizeBattleState(target);
  const role = roleOf(target);
  const cost = battleCommandCost(command, role);
  if (target.battle.mp < cost) throw battleError(409, "battle_mp_insufficient", "Not enough MP for this command.", { required: cost, current: target.battle.mp });

  const before = { turn: target.battle.turn, mp: target.battle.mp, playerHp: target.character.hp, bossHp: target.boss.hp };
  const effects = [];
  target.battle.mp -= cost;
  if (cost) effects.push({ type: "mp_spend", amount: cost, source: command });
  if (command === "attack") dealBossDamage(target, 9 + Math.min(6, target.battle.focus), "たたかう", effects);
  if (command === "skill") useRoleSkill(target, role, effects);
  if (command === "guard") {
    target.battle.guard += 1;
    effects.push({ type: "guard", amount: 1, source: command });
    appendLog(target, "まもる: 次の被ダメージを半減。");
  }
  if (command === "heal") {
    const healed = Math.min(22, target.character.maxHp - target.character.hp);
    target.character.hp += healed;
    effects.push({ type: "heal", amount: healed, source: command });
    appendLog(target, `かいふく: HP +${healed}`);
  }
  if (command === "burst") {
    const focusBonus = Math.min(24, target.battle.focus * 4);
    dealBossDamage(target, 46 + focusBonus, "バースト", effects);
    target.battle.focus = Math.max(0, target.battle.focus - 2);
  }
  if (!target.battle.ended && target.boss.hp > 0) runEnemyTurn(target, effects);

  const summary = {
    commandId: commandId || "preview",
    command,
    expectedTurn,
    turn: target.battle.turn,
    cost,
    before,
    after: { turn: target.battle.turn, mp: target.battle.mp, playerHp: target.character.hp, bossHp: target.boss.hp },
    effects,
    replayed: false,
    dryRun,
  };
  if (!dryRun) {
    target.battle.commandClaims[commandId] = clone(summary);
    target.battle.commandClaimOrder.push(commandId);
    while (target.battle.commandClaimOrder.length > 100) {
      const expiredId = target.battle.commandClaimOrder.shift();
      if (expiredId) delete target.battle.commandClaims[expiredId];
    }
  }
  return { ...summary, session: createBattleSession(target) };
}
