const test = require("node:test");
const assert = require("node:assert/strict");

const env = {
  DEV_BEARER_TOKEN: "social-token",
  DEV_USER_ID: "alpha",
  FIREBASE_PROJECT_ID: "questforge-test",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

function context() {
  return { waitUntil(promise) { promise.catch(() => {}); } };
}

async function call(path, options = {}, uid = env.DEV_USER_ID) {
  env.DEV_USER_ID = uid;
  const worker = (await import("../worker/src/index.mjs")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, {
    ...options,
    headers: {
      authorization: "Bearer social-token",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  }), env, context());
}

async function patchProfile(uid, handle) {
  const response = await call("/v1/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName: uid.toUpperCase(), handle, bio: `Bio ${uid}`, avatarRole: "sentinel", avatarVariant: "femme", level: 2 }),
  }, uid);
  assert.equal(response.status, 200);
  return response.json();
}

test.beforeEach(async () => {
  const { resetSocialMemoryForTests } = await import("../worker/src/social-store.mjs");
  resetSocialMemoryForTests();
});

test("REST supports exact profile lookup and the friend request lifecycle", async () => {
  await patchProfile("alpha", "alpha_user");
  await patchProfile("beta", "beta_user");

  const found = await (await call("/v1/profiles/%40BETA_USER", {}, "alpha")).json();
  assert.equal(found.profile.uid, "beta");
  assert.equal(found.profile.handle, "@beta_user");
  assert.equal("email" in found.profile, false);

  const sent = await (await call("/v1/friend-requests", {
    method: "POST",
    body: JSON.stringify({ receiverUid: "beta" }),
  }, "alpha")).json();
  assert.equal(sent.request.direction, "outgoing");

  const pending = await (await call("/v1/friend-requests", {}, "beta")).json();
  assert.equal(pending.requests[0].direction, "incoming");
  const accepted = await (await call(`/v1/friend-requests/${sent.request.id}/accept`, { method: "POST" }, "beta")).json();
  assert.equal(accepted.friends[0].uid, "alpha");
  const friends = await (await call("/v1/friends", {}, "alpha")).json();
  assert.equal(friends.friends[0].uid, "beta");
});

test("REST party flow enforces owner actions and shared membership", async () => {
  await patchProfile("owner", "owner_user");
  await patchProfile("member", "member_user");
  const created = await (await call("/v1/party", { method: "POST", body: JSON.stringify({ name: "API Party" }) }, "owner")).json();
  assert.equal(created.party.ownerUid, "owner");
  const issued = await (await call("/v1/party/invites", { method: "POST", body: JSON.stringify({ inviteeUid: "member" }) }, "owner")).json();
  assert.match(issued.token, /^party_invite_/);
  const joined = await (await call("/v1/party/invites/accept", { method: "POST", body: JSON.stringify({ token: issued.token }) }, "member")).json();
  assert.equal(joined.party.members.length, 2);
  const visible = await (await call("/v1/party", {}, "owner")).json();
  assert.equal(visible.party.members.some((item) => item.uid === "member"), true);
});

test("MCP social tools use the same store as REST", async () => {
  await patchProfile("alpha", "alpha_user");
  const response = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_my_profile", arguments: {} } }),
  }, "alpha");
  const result = await response.json();
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.profile.handle, "@alpha_user");
});

test("REST and MCP battle commands share state and idempotency", async () => {
  const { writeState, readState } = await import("../worker/src/firebase-store.mjs");
  const battleState = {
    schemaVersion: 5,
    tasks: [{ id: "plain", kind: "todo", title: "No notes", notes: "", difficulty: "easy", lifecycleState: "active", planningState: "scheduled", done: false }],
    taskEvents: [], syncEvents: [], rewardClaims: {},
    character: { name: "Astra", role: "sentinel", variant: "femme", level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0 },
    boss: { currentId: "h3", hp: 100, maxHp: 100, defeatedIds: [], defeatCount: 0, battleLog: [] },
    battle: { turn: 1, mp: 20, maxMp: 80, focus: 0, guard: 0, shield: 0, rage: 0, vulnerable: 0, poison: 0, ended: false, log: [] },
  };
  const current = await readState(env, "fighter");
  await writeState(env, "fighter", { schemaVersion: 5, state: battleState, clientUpdatedAt: new Date().toISOString() }, current.etag);

  const session = await (await call("/v1/battle/session", {}, "fighter")).json();
  assert.equal(session.session.quests[0].notes, "");

  const preview = await (await call("/v1/battle/commands", {
    method: "POST",
    body: JSON.stringify({ command: "attack", expectedTurn: 1 }),
  }, "fighter")).json();
  assert.equal(preview.dryRun, true);

  const executed = await (await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "battle_command", arguments: { command: "attack", expectedTurn: 1, commandId: "api-mcp-command", dryRun: false } } }),
  }, "fighter")).json();
  assert.equal(executed.result.structuredContent.replayed, false);
  const hp = executed.result.structuredContent.session.boss.hp;

  const replay = await (await call("/v1/battle/commands", {
    method: "POST",
    body: JSON.stringify({ command: "attack", expectedTurn: 1, commandId: "api-mcp-command", dryRun: false }),
  }, "fighter")).json();
  assert.equal(replay.replayed, true);
  assert.equal(replay.session.boss.hp, hp);
});
