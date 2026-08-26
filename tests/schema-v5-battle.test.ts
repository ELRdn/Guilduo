const test = require("node:test");
const assert = require("node:assert/strict");
import type { QuestForgeState } from "../types/questforge.ts";
import { asQuestForgeState, hasErrorCode, required } from "./test-helpers.ts";

type Domain = typeof import("../server/questforge-domain.ts");
type BattleRules = typeof import("../shared/battle-rules.ts");
let domain: Domain;
let battleRules: BattleRules;

test.before(async () => {
  domain = await import("../server/questforge-domain.ts");
  battleRules = await import("../shared/battle-rules.ts");
});

function state(overrides: Record<string, unknown> = {}): QuestForgeState {
  return asQuestForgeState({
    schemaVersion: 4,
    tasks: [],
    taskEvents: [],
    syncEvents: [],
    rewardClaims: {},
    character: {
      name: "Astra", role: "sentinel", variant: "femme", level: 3,
      hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0,
    },
    boss: { currentId: "h3", hp: 100, maxHp: 100, defeatedIds: [], defeatCount: 0, battleLog: [] },
    battle: { turn: 1, mp: 80, maxMp: 80, focus: 0, guard: 0, shield: 0, rage: 0, vulnerable: 0, poison: 0, ended: false, log: [] },
    ...overrides,
  });
}

test("schema v6 migration assigns existing quests to self and preserves migration snapshots", () => {
  const current = state({ tasks: [{ id: "legacy", kind: "todo", title: "Legacy", difficulty: "easy", done: false }] });
  domain.migrateState(current, "2026-08-09");
  assert.equal(current.schemaVersion, 7);
  assert.deepEqual(current.tasks[0].assignee, { type: "self", id: "self", label: "自分", handoffState: "none" });
  assert.equal(required(current.migrationSnapshots.schema4To5).schemaVersion, 4);
  assert.equal(required(current.migrationSnapshots.schema5To6).schemaVersion, 4);
  assert.equal(required(current.migrationSnapshots.schema6To7).schemaVersion, 4);
  assert.equal(current.tasks[0].parentQuestId, "");
  assert.equal(current.tasks[0].handoff.note, "");
});

test("agent-ready assignment emits once per agent target", () => {
  const current = state();
  const created = domain.createQuest(current, {
    kind: "todo",
    title: "Delegate",
    assignee: { type: "agent", id: "codex", label: "Codex", handoffState: "ready" },
  }, { source: "test", returnEvent: true });
  assert.equal(created.events.filter((event) => event.type === "quest.assignment.ready").length, 1);

  const unchanged = domain.patchQuest(current, created.quest.id, {
    assignee: { type: "agent", id: "codex", label: "Codex", handoffState: "ready" },
  }, { source: "test", returnEvent: true });
  assert.equal(unchanged.events.filter((event) => event.type === "quest.assignment.ready").length, 0);

  const changed = domain.patchQuest(current, created.quest.id, {
    assignee: { type: "agent", id: "claude", label: "Claude", handoffState: "ready" },
  }, { source: "test", returnEvent: true });
  assert.equal(changed.events.filter((event) => event.type === "quest.assignment.ready").length, 1);
});

test("battle session includes note-free eligible quests and accurate command costs", () => {
  const current = state({
    tasks: [
      { id: "plain", kind: "todo", title: "No notes", notes: "", difficulty: "medium", lifecycleState: "active", done: false },
      { id: "reward", kind: "reward", title: "Break", difficulty: "easy", lifecycleState: "active" },
    ],
  });
  const session = domain.getBattleSession(current);
  assert.equal(session.quests.length, 1);
  assert.equal(session.quests[0].id, "plain");
  assert.equal(session.quests[0].mpGain, 30);
  assert.deepEqual(Object.fromEntries(session.commands.map((command) => [command.id, command.mpCost])), {
    attack: 0, skill: 18, guard: 6, heal: 14, burst: 40,
  });
});

test("battle dry-run leaves state unchanged", () => {
  const current = state();
  const before = structuredClone(current);
  const result = domain.battleCommand(current, { command: "attack", expectedTurn: 1 });
  assert.equal(result.dryRun, true);
  assert.deepEqual(current, before);
  assert.ok(result.session.boss.hp < before.boss.hp);
});

test("executed battle commands reject stale turns and replay command IDs safely", () => {
  const current = state();
  const first = domain.battleCommand(current, { command: "guard", expectedTurn: 1, commandId: "cmd-1", dryRun: false }, { source: "test" });
  assert.equal(first.dryRun, false);
  assert.equal(current.battle.turn, 2);
  const hpAfterFirst = current.character.hp;
  const replay = domain.battleCommand(current, { command: "guard", expectedTurn: 1, commandId: "cmd-1", dryRun: false }, { source: "test" });
  assert.equal(replay.replayed, true);
  assert.equal(current.character.hp, hpAfterFirst);
  assert.throws(() => domain.battleCommand(current, { command: "attack", expectedTurn: 1, commandId: "cmd-2", dryRun: false }), (error: unknown) => hasErrorCode(error, "battle_turn_stale"));
});

test("all six role skills execute with their declared MP cost", () => {
  for (const [role, skill] of Object.entries(battleRules.BATTLE_SKILLS)) {
    const current = state();
    current.character.role = role;
    const result = domain.battleCommand(current, { command: "skill", expectedTurn: 1, commandId: `skill-${role}`, dryRun: false }, { source: "test" });
    assert.equal(result.cost, skill.cost, role);
    assert.ok(result.effects.some((effect) => effect.type === "boss_damage"), role);
  }
});

test("battle execution requires a command ID and enough MP", () => {
  const current = state();
  assert.throws(() => domain.battleCommand(current, { command: "attack", expectedTurn: 1, dryRun: false }), (error: unknown) => hasErrorCode(error, "battle_command_id_required"));
  current.battle.mp = 0;
  assert.throws(() => domain.battleCommand(current, { command: "burst", expectedTurn: 1, commandId: "burst", dryRun: false }), (error: unknown) => hasErrorCode(error, "battle_mp_insufficient"));
});
