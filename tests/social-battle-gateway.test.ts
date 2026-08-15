const test = require("node:test");
const assert = require("node:assert/strict");
import type { BattleSession, QuestForgeState } from "../types/questforge.ts";
import type { PublicProfile, Party } from "../worker/src/social-store.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState, json, type TestContext, type TestRequestOptions } from "./test-helpers.ts";

const env: WorkerEnv = {
  DEV_BEARER_TOKEN: "social-token",
  DEV_USER_ID: "alpha",
  FIREBASE_PROJECT_ID: "questforge-test",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

function context(): TestContext {
  return { waitUntil(promise: Promise<unknown>): void { promise.catch(() => {}); } };
}

async function call(path: string, options: TestRequestOptions = {}, uid = env.DEV_USER_ID || "alpha"): Promise<Response> {
  env.DEV_USER_ID = uid;
  const worker = (await import("../worker/src/index.ts")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, {
    ...options,
    headers: {
      authorization: "Bearer social-token",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  }), env, context());
}

async function patchProfile(uid: string, handle: string): Promise<{ profile: PublicProfile }> {
  const response = await call("/v1/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName: uid.toUpperCase(), handle, bio: `Bio ${uid}`, avatarRole: "sentinel", avatarVariant: "femme", level: 2 }),
  }, uid);
  assert.equal(response.status, 200);
  return json<{ profile: PublicProfile }>(response);
}

test.beforeEach(async () => {
  const { resetSocialMemoryForTests } = await import("../worker/src/social-store.ts");
  resetSocialMemoryForTests();
});

test("REST supports exact profile lookup and the friend request lifecycle", async () => {
  await patchProfile("alpha", "alpha_user");
  await patchProfile("beta", "beta_user");

  const found = await json<{ profile: PublicProfile }>(await call("/v1/profiles/%40BETA_USER", {}, "alpha"));
  assert.equal(found.profile.uid, "beta");
  assert.equal(found.profile.handle, "@beta_user");
  assert.equal("email" in found.profile, false);

  const sent = await json<{ request: { id: string; direction: string } }>(await call("/v1/friend-requests", {
    method: "POST",
    body: JSON.stringify({ receiverUid: "beta" }),
  }, "alpha"));
  assert.equal(sent.request.direction, "outgoing");

  const pending = await json<{ requests: Array<{ direction: string }> }>(await call("/v1/friend-requests", {}, "beta"));
  assert.equal(pending.requests[0].direction, "incoming");
  const accepted = await json<{ friends: PublicProfile[] }>(await call(`/v1/friend-requests/${sent.request.id}/accept`, { method: "POST" }, "beta"));
  assert.equal(accepted.friends[0].uid, "alpha");
  const friends = await json<{ friends: PublicProfile[] }>(await call("/v1/friends", {}, "alpha"));
  assert.equal(friends.friends[0].uid, "beta");
});

test("REST party flow enforces owner actions and shared membership", async () => {
  await patchProfile("owner", "owner_user");
  await patchProfile("member", "member_user");
  const created = await json<{ party: Party }>(await call("/v1/party", { method: "POST", body: JSON.stringify({ name: "API Party" }) }, "owner"));
  assert.equal(created.party.ownerUid, "owner");
  const issued = await json<{ token: string }>(await call("/v1/party/invites", { method: "POST", body: JSON.stringify({ inviteeUid: "member" }) }, "owner"));
  assert.match(issued.token, /^party_invite_/);
  const joined = await json<{ party: Party }>(await call("/v1/party/invites/accept", { method: "POST", body: JSON.stringify({ token: issued.token }) }, "member"));
  assert.equal(joined.party.members.length, 2);
  const visible = await json<{ party: Party }>(await call("/v1/party", {}, "owner"));
  assert.equal(visible.party.members.some((item) => item.uid === "member"), true);
});

test("MCP social tools use the same store as REST", async () => {
  await patchProfile("alpha", "alpha_user");
  const response = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_my_profile", arguments: {} } }),
  }, "alpha");
  const result = await json<{ result: { isError: boolean; structuredContent: { profile: PublicProfile } } }>(response);
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.profile.handle, "@alpha_user");
});

test("REST and MCP battle commands share state and idempotency", async () => {
  const { writeState, readState } = await import("../worker/src/firebase-store.ts");
  const battleState: QuestForgeState = asQuestForgeState({
    schemaVersion: 5,
    tasks: [{ id: "plain", kind: "todo", title: "No notes", notes: "", difficulty: "easy", lifecycleState: "active", planningState: "scheduled", done: false }],
    taskEvents: [], syncEvents: [], rewardClaims: {},
    character: { name: "Astra", role: "sentinel", variant: "femme", level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 },
    boss: { currentId: "h3", hp: 100, maxHp: 100, defeatedIds: [], defeatCount: 0, battleLog: [] },
    battle: { turn: 1, mp: 20, maxMp: 80, focus: 0, guard: 0, shield: 0, rage: 0, vulnerable: 0, poison: 0, ended: false, log: [] },
  });
  const current = await readState(env, "fighter");
  await writeState(env, "fighter", { schemaVersion: 5, state: battleState, clientUpdatedAt: new Date().toISOString() }, current.etag);

  const session = await json<{ session: BattleSession }>(await call("/v1/battle/session", {}, "fighter"));
  assert.equal(session.session.quests[0].notes, "");

  const preview = await json<{ dryRun: boolean }>(await call("/v1/battle/commands", {
    method: "POST",
    body: JSON.stringify({ command: "attack", expectedTurn: 1 }),
  }, "fighter"));
  assert.equal(preview.dryRun, true);

  const executed = await json<{ result: { structuredContent: { replayed: boolean; session: BattleSession } } }>(await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "battle_command", arguments: { command: "attack", expectedTurn: 1, commandId: "api-mcp-command", dryRun: false } } }),
  }, "fighter"));
  assert.equal(executed.result.structuredContent.replayed, false);
  const hp = executed.result.structuredContent.session.boss.hp;

  const replay = await json<{ replayed: boolean; session: BattleSession }>(await call("/v1/battle/commands", {
    method: "POST",
    body: JSON.stringify({ command: "attack", expectedTurn: 1, commandId: "api-mcp-command", dryRun: false }),
  }, "fighter"));
  assert.equal(replay.replayed, true);
  assert.equal(replay.session.boss.hp, hp);
});
