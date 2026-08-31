const test = require("node:test");
const assert = require("node:assert/strict");
import type { JsonRecord, WorkerEnv } from "../worker/src/worker-types.ts";
import type { AgentRecord } from "../worker/src/agent-store.ts";
import { hasErrorCode, required, SqliteD1Database } from "./test-helpers.ts";

type AgentStore = typeof import("../worker/src/agent-store.ts");

let agents: AgentStore;

test.before(async () => {
  agents = await import("../worker/src/agent-store.ts");
});

test.beforeEach(() => agents?.resetAgentMemoryForTests());

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => hasErrorCode(error, code));
}

function defaultAgent(agentId = "assistant") {
  return {
    agentId,
    displayName: "Quest Assistant",
    provider: "anthropic",
    role: "assistant",
    instructions: "Help the user focus.",
    allowedScopes: ["quests:read", "quests:write", "webhooks:manage"],
    defaultHandoffState: "ready",
    reviewRequired: true,
    dryRunDefault: false,
  };
}

test("new agents default to user-equivalent approved scopes", async () => {
  const env: WorkerEnv = {};
  const created = required(await agents.createAgent(env, "alpha", {
    agentId: "codex",
    displayName: "Codex",
  }));
  assert.ok(created.allowedScopes.includes("quests:write"));
  assert.ok(created.allowedScopes.includes("agents:read"));
  assert.ok(created.allowedScopes.includes("webhooks:manage"));
});

async function create(env: WorkerEnv, uid: string, agentId = "assistant", extra: JsonRecord = {}): Promise<AgentRecord> {
  const created = await agents.createAgent(env, uid, { ...defaultAgent(agentId), ...extra });
  return required(created);
}

test("agent IDs are validated as lowercase ASCII slugs and are create-only", async () => {
  const env: WorkerEnv = {};
  assert.equal(agents.validateAgentId("  My-Agent "), "my-agent");
  assert.equal(agents.validateAgentId("UPPER"), "upper");
  assert.throws(() => agents.validateAgentId("has space"), (error: unknown) => hasErrorCode(error, "agent_id_invalid"));
  assert.throws(() => agents.validateAgentId("-leading"), (error: unknown) => hasErrorCode(error, "agent_id_invalid"));
  assert.throws(() => agents.validateAgentId("trailing-"), (error: unknown) => hasErrorCode(error, "agent_id_invalid"));
  assert.throws(() => agents.validateAgentId(""), (error: unknown) => hasErrorCode(error, "agent_id_required"));
  assert.throws(() => agents.validateAgentId("a".repeat(81)), (error: unknown) => hasErrorCode(error, "agent_id_too_long"));

  const created = await create(env, "alpha");
  assert.equal(created.agentId, "assistant");
  const updated = await agents.updateAgent(env, "alpha", "assistant", { displayName: "Renamed" });
  assert.equal(updated.agentId, "assistant");
  await expectCode(agents.updateAgent(env, "alpha", "assistant", { agentId: "renamed" }), "agent_unknown_field");
});

test("create, update, and link reject unknown and secret-like fields", async () => {
  const env: WorkerEnv = {};
  await expectCode(create(env, "alpha", "good", { apiKey: "sk-123" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { token: "abc" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { password: "hunter2" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { webhookUrl: "https://example.test/hook" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { endpointUrl: "https://example.test/api" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { favoriteColor: "red" }), "agent_unknown_field");
  await expectCode(create(env, "alpha", "good", { createdAt: "2026-01-01T00:00:00.000Z" }), "agent_unknown_field");

  await create(env, "alpha", "good");
  await expectCode(agents.updateAgent(env, "alpha", "good", { apiKey: "sk-123" }), "agent_secret_field_rejected");
  await expectCode(agents.updateAgent(env, "alpha", "good", { instructions: "fine", randomField: 1 }), "agent_unknown_field");
  await expectCode(
    agents.linkAgentConnection(env, "alpha", "good", { clientId: "c1", clientName: "MCP", clientSecret: "x" }),
    "agent_secret_field_rejected",
  );
});

test("agents expose only approved fields and archived agents are readable only with includeArchived", async () => {
  const env: WorkerEnv = {};
  const created = await create(env, "alpha", "main");
  assert.deepEqual(Object.keys(created).sort(), [
    "agentId", "allowedScopes", "avatarAssetId", "avatarVersion", "createdAt", "defaultHandoffState", "displayName", "dryRunDefault",
    "hasCustomAvatar", "instructions", "provider", "reviewRequired", "revision", "role", "status", "uid", "updatedAt",
  ].sort());
  assert.equal(created.revision, 1);
  assert.equal(created.avatarVersion, 0);
  assert.equal(created.hasCustomAvatar, false);
  assert.equal("apiKey" in created, false);
  assert.equal("token" in created, false);
  assert.equal(created.status, "active");
  assert.equal(created.reviewRequired, true);
  assert.deepEqual(created.allowedScopes, ["quests:read", "quests:write", "webhooks:manage"]);

  await create(env, "alpha", "second");
  assert.equal((await agents.listAgents(env, "alpha")).length, 2);

  const archived = await agents.updateAgent(env, "alpha", "second", { status: "archived" });
  assert.equal(archived.status, "archived");
  const visible = await agents.listAgents(env, "alpha");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].agentId, "main");
  const all = await agents.listAgents(env, "alpha", { includeArchived: true });
  assert.equal(all.length, 2);
  await expectCode(agents.getAgent(env, "alpha", "second"), "agent_not_found");
  assert.equal((await agents.getAgent(env, "alpha", "second", { includeArchived: true })).agentId, "second");
  await expectCode(agents.updateAgent(env, "alpha", "second", { displayName: "Late" }), "agent_archived");
});

test("archiving frees a slot and the limit counts only non-archived agents", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-01-01T00:00:00.000Z" };
  for (let i = 0; i < 20; i += 1) await create(env, "alpha", `agent-${String(i).padStart(2, "0")}`);
  await expectCode(create(env, "alpha", "overflow"), "agent_limit_reached");

  env.AGENT_NOW = "2026-01-02T00:00:00.000Z";
  await agents.updateAgent(env, "alpha", "agent-00", { status: "archived" });
  const created = await create(env, "alpha", "overflow");
  assert.equal(created.agentId, "overflow");
  await expectCode(create(env, "alpha", "one-more"), "agent_limit_reached");
});

test("agents are fully isolated per user", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await expectCode(agents.getAgent(env, "beta", "main"), "agent_not_found");
  assert.equal((await agents.listAgents(env, "beta")).length, 0);
  await expectCode(agents.updateAgent(env, "beta", "main", { displayName: "Stolen" }), "agent_not_found");
  await expectCode(agents.listAgentConnections(env, "beta", "main"), "agent_not_found");

  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "client-alpha", clientName: "Alpha MCP" });
  await expectCode(agents.unlinkAgentConnection(env, "beta", "client-alpha"), "agent_connection_not_found");
  await expectCode(agents.noteAgentConnectionUse(env, "beta", "client-alpha"), "agent_connection_not_found");
  assert.equal((await agents.listAgentConnections(env, "alpha", "main")).length, 1);
});

test("update supports expectedUpdatedAt and returns a conflict on mismatch", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-02-01T00:00:00.000Z" };
  const created = await create(env, "alpha", "main");
  await expectCode(
    agents.updateAgent(env, "alpha", "main", { displayName: "New", expectedUpdatedAt: "wrong-timestamp" }),
    "agent_conflict",
  );
  env.AGENT_NOW = "2026-02-02T00:00:00.000Z";
  const updated = await agents.updateAgent(env, "alpha", "main", { displayName: "New", expectedUpdatedAt: created.updatedAt });
  assert.equal(updated.displayName, "New");
  assert.equal(updated.updatedAt, "2026-02-02T00:00:00.000Z");
  await expectCode(
    agents.updateAgent(env, "alpha", "main", { displayName: "Stale", expectedUpdatedAt: created.updatedAt }),
    "agent_conflict",
  );
});

test("disable and archive revoke all linked connections; unlink is idempotent", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-03-01T00:00:00.000Z" };
  await create(env, "alpha", "main");
  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c1", clientName: "One", scopes: ["quests:read"] });
  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c2", clientName: "Two" });

  env.AGENT_NOW = "2026-03-02T00:00:00.000Z";
  const disabled = await agents.updateAgent(env, "alpha", "main", { status: "disabled" });
  assert.equal(disabled.status, "disabled");
  const afterDisable = await agents.listAgentConnections(env, "alpha", "main");
  assert.equal(afterDisable.length, 2);
  assert.equal(afterDisable.every((connection) => connection.revokedAt === "2026-03-02T00:00:00.000Z"), true);
  assert.equal(await agents.getAgentForClient(env, "alpha", "c1"), null);

  await expectCode(agents.noteAgentConnectionUse(env, "alpha", "c1"), "agent_connection_revoked");
  const firstUnlink = required(await agents.unlinkAgentConnection(env, "alpha", "c1"));
  assert.equal(firstUnlink.revokedAt, "2026-03-02T00:00:00.000Z");
  const secondUnlink = required(await agents.unlinkAgentConnection(env, "alpha", "c1"));
  assert.equal(secondUnlink.revokedAt, "2026-03-02T00:00:00.000Z");

  env.AGENT_NOW = "2026-03-03T00:00:00.000Z";
  await create(env, "alpha", "other");
  await agents.linkAgentConnection(env, "alpha", "other", { clientId: "c3", clientName: "Three" });
  env.AGENT_NOW = "2026-03-04T00:00:00.000Z";
  const archived = await agents.updateAgent(env, "alpha", "other", { status: "archived" });
  assert.equal(archived.status, "archived");
  const afterArchive = await agents.listAgentConnections(env, "alpha", "other");
  assert.equal(afterArchive[0].revokedAt, "2026-03-04T00:00:00.000Z");
});

test("connections track client metadata without credentials and client IDs are unique per user", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await create(env, "alpha", "second");

  const linked = required(await agents.linkAgentConnection(env, "alpha", "main", {
    clientId: "client-1",
    clientName: "Local MCP",
    scopes: ["quests:read"],
  }));
  assert.deepEqual(Object.keys(linked).sort(), [
    "agentId", "clientId", "clientName", "createdAt", "firstConnectedAt", "lastUsedAt", "revokedAt",
    "scopes", "uid", "updatedAt",
  ].sort());
  assert.equal(JSON.stringify(linked).includes("token"), false);
  assert.equal(linked.revokedAt, null);

  const reused = required(await agents.linkAgentConnection(env, "alpha", "main", { clientId: "client-1", clientName: "Local MCP" }));
  assert.equal(reused.clientId, "client-1");
  await expectCode(
    agents.linkAgentConnection(env, "alpha", "second", { clientId: "client-1", clientName: "Local MCP" }),
    "agent_client_linked",
  );

  const used = required(await agents.noteAgentConnectionUse(env, "alpha", "client-1", { at: "2026-04-01T00:00:00.000Z" }));
  assert.equal(used.lastUsedAt, "2026-04-01T00:00:00.000Z");
  const agent = required(await agents.getAgentForClient(env, "alpha", "client-1"));
  assert.equal(agent.agentId, "main");
  assert.equal(await agents.getAgentForClient(env, "alpha", "missing-client"), null);

  await create(env, "beta", "main");
  const sameClientForAnotherUser = required(await agents.linkAgentConnection(env, "beta", "main", { clientId: "client-1", clientName: "Local MCP" }));
  assert.equal(sameClientForAnotherUser.uid, "beta");
});

test("connections cannot be linked to archived agents", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await agents.updateAgent(env, "alpha", "main", { status: "archived" });
  await expectCode(
    agents.linkAgentConnection(env, "alpha", "main", { clientId: "late-client", clientName: "Late" }),
    "agent_archived",
  );
});

test("an avatar upload bumps the version, flips hasCustomAvatar, and activates the new assetId, without ever storing bytes in D1", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  const bumped = await agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-1");
  assert.equal(bumped.avatarVersion, 1);
  assert.equal(bumped.hasCustomAvatar, true);
  assert.equal(bumped.avatarAssetId, "asset-1");
  assert.equal("avatarBytes" in bumped, false);
  assert.equal("avatarUrl" in bumped, false);

  const bumpedAgain = await agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-2");
  assert.equal(bumpedAgain.avatarVersion, 2);
  assert.equal(bumpedAgain.avatarAssetId, "asset-2");
});

test("an avatar upload honours expectedUpdatedAt the same way a metadata PATCH does", async () => {
  const env: WorkerEnv = {};
  const created = await create(env, "alpha", "main");
  await expectCode(
    agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-1", "2000-01-01T00:00:00.000Z"),
    "agent_conflict",
  );
  const bumped = await agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-1", created.updatedAt);
  assert.equal(bumped.avatarVersion, 1);
  assert.equal(bumped.avatarAssetId, "asset-1");
});

test("an archived agent's avatar cannot be replaced, and a foreign uid cannot bump another owner's avatar", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await agents.updateAgent(env, "alpha", "main", { status: "archived" });
  await expectCode(agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-1"), "agent_archived");
  await expectCode(agents.bumpAgentAvatarVersion(env, "beta", "main", "asset-1"), "agent_not_found");
});

// These two tests are sequential by design — they check that the explicit,
// client-supplied `expectedUpdatedAt` header is honoured as a stale-read
// guard even after time has moved on, which is a different property from
// genuine concurrency. See the "genuinely concurrent" tests below for races
// where both requests are *started* before either finishes; a test named
// "concurrent" that instead awaits the winner before starting the loser
// would never actually exercise the race at all.
test("a frozen clock still advances updatedAt and rejects a second avatar write bound to the same stale read", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-05-01T00:00:00.000Z" };
  const created = await create(env, "alpha", "main");
  const readUpdatedAt = created.updatedAt;

  const winner = await agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-a", readUpdatedAt);
  assert.equal(winner.avatarAssetId, "asset-a");
  assert.notEqual(winner.updatedAt, readUpdatedAt);

  await expectCode(
    agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-b", readUpdatedAt),
    "agent_conflict",
  );
  const final = await agents.getAgent(env, "alpha", "main");
  assert.equal(final.avatarAssetId, "asset-a");
});

test("a frozen clock rejects stale metadata after an avatar upload moved the Agent on", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-05-02T00:00:00.000Z" };
  const created = await create(env, "alpha", "main");
  const readUpdatedAt = created.updatedAt;

  const avatarWinner = await agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-a", readUpdatedAt);
  assert.equal(avatarWinner.avatarAssetId, "asset-a");
  assert.notEqual(avatarWinner.updatedAt, readUpdatedAt);

  await expectCode(
    agents.updateAgent(env, "alpha", "main", { displayName: "Renamed", expectedUpdatedAt: readUpdatedAt }),
    "agent_conflict",
  );
  const final = await agents.getAgent(env, "alpha", "main");
  assert.equal(final.displayName, "Quest Assistant");
});

test("a frozen clock rejects a stale avatar upload after metadata moved the Agent on", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-05-03T00:00:00.000Z" };
  const created = await create(env, "alpha", "main");
  const readUpdatedAt = created.updatedAt;

  const metadataWinner = await agents.updateAgent(env, "alpha", "main", { displayName: "Renamed", expectedUpdatedAt: readUpdatedAt });
  assert.notEqual(metadataWinner.updatedAt, readUpdatedAt);
  await expectCode(
    agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-a", readUpdatedAt),
    "agent_conflict",
  );
  const final = await agents.getAgent(env, "alpha", "main");
  assert.equal(final.avatarAssetId, null);
});

/* ------------------------------------------------------------------ *
 * Genuine concurrency — both requests are *started* together (via
 * Promise.all, over a *frozen* AGENT_NOW that is never manually advanced
 * between them) and only their settled results are collected afterward.
 * This is what actually exercises the same-millisecond race: the old
 * `updated_at`-only CAS let both requests read the same guard value, then
 * both write the *same* new value back (the clock never ticked), so the
 * second write's WHERE clause kept matching — both calls fulfilled. The
 * monotonic `revision` counter closes that gap because a successful write
 * always advances it by exactly 1, regardless of the clock.
 * ------------------------------------------------------------------ */

test("genuinely concurrent avatar uploads on a frozen clock: exactly one fulfils, the other gets agent_conflict, final state is consistent", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-05-03T00:00:00.000Z" };
  await create(env, "alpha", "main");

  const settled = await Promise.allSettled([
    agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-a"),
    agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-b"),
  ]);
  const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<AgentRecord> => entry.status === "fulfilled");
  const rejected = settled.filter((entry) => entry.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(hasErrorCode((rejected[0] as PromiseRejectedResult).reason, "agent_conflict"), true);

  const final = await agents.getAgent(env, "alpha", "main");
  assert.equal(final.avatarVersion, 1);
  assert.equal(final.avatarAssetId, fulfilled[0].value.avatarAssetId);
  assert.ok(["asset-a", "asset-b"].includes(final.avatarAssetId as string));
});

test("genuinely concurrent metadata edits on a frozen clock: exactly one fulfils, the other gets agent_conflict", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-05-04T00:00:00.000Z" };
  await create(env, "alpha", "main");

  const settled = await Promise.allSettled([
    agents.updateAgent(env, "alpha", "main", { displayName: "Renamed A" }),
    agents.updateAgent(env, "alpha", "main", { displayName: "Renamed B" }),
  ]);
  const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<AgentRecord> => entry.status === "fulfilled");
  const rejected = settled.filter((entry) => entry.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(hasErrorCode((rejected[0] as PromiseRejectedResult).reason, "agent_conflict"), true);

  const final = await agents.getAgent(env, "alpha", "main");
  assert.equal(final.displayName, fulfilled[0].value.displayName);
  assert.ok(["Renamed A", "Renamed B"].includes(final.displayName));
});

test("a stale side of a genuinely concurrent disable race never revokes Connections — only the winner's revoke takes effect", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-05-05T00:00:00.000Z" };
  await create(env, "alpha", "main");
  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c1", clientName: "One" });
  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c2", clientName: "Two" });

  const settled = await Promise.allSettled([
    agents.updateAgent(env, "alpha", "main", { status: "disabled" }),
    agents.updateAgent(env, "alpha", "main", { status: "disabled" }),
  ]);
  const fulfilled = settled.filter((entry) => entry.status === "fulfilled");
  const rejected = settled.filter((entry) => entry.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(hasErrorCode((rejected[0] as PromiseRejectedResult).reason, "agent_conflict"), true);

  // Every connection is revoked exactly once — the loser's write never ran
  // a second, redundant (or worse, wrongly-timestamped) revoke.
  const connections = await agents.listAgentConnections(env, "alpha", "main");
  assert.equal(connections.length, 2);
  assert.ok(connections.every((connection) => connection.revokedAt !== null));
});

/* ------------------------------------------------------------------ *
 * SQLite-backed D1 contract — the in-memory Map fallback above has no
 * network-call boundary to race across, so it can never exercise D1's
 * actual `.batch()` semantics: a `changes = 0` UPDATE does not abort the
 * batch (see https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
 * which is exactly what let a stale Agent CAS commit its paired Connection
 * revoke anyway before this fix. `SqliteD1Database` (test-helpers.ts) runs
 * the real SQL text — including `changes()` — against a real SQLite engine
 * built from the actual migration files, so these tests prove the fix
 * against production SQL, not a JS reimplementation of it.
 * ------------------------------------------------------------------ */

/*
 * Note on why this is a *concurrency* test rather than a simpler sequential
 * "call updateAgent with a stale revision" test: the public API always
 * re-reads the Agent fresh at the top of `updateAgent`, with no way to hand
 * it a pre-captured stale read (that would only reach the early
 * `expectedUpdatedAt` pre-check, which short-circuits *before* the batch and
 * so would never actually exercise the `changes()`-gated batch this fix is
 * about). True concurrency is the only way to make the second call's
 * *internal* read stale by the time its own batch runs — which is exactly
 * the real-world scenario (two Worker requests racing) this fix targets.
 */
test("[SQLite-backed D1 contract] genuinely concurrent disable calls: exactly one wins, and Connections are revoked exactly once", async () => {
  const db = new SqliteD1Database();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_NOW: "2026-05-07T00:00:00.000Z" };
    await create(env, "alpha", "main");
    await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c1", clientName: "One" });
    await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c2", clientName: "Two" });

    const settled = await Promise.allSettled([
      agents.updateAgent(env, "alpha", "main", { status: "disabled" }),
      agents.updateAgent(env, "alpha", "main", { status: "disabled" }),
    ]);
    const fulfilled = settled.filter((entry) => entry.status === "fulfilled");
    const rejected = settled.filter((entry) => entry.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(hasErrorCode((rejected[0] as PromiseRejectedResult).reason, "agent_conflict"), true);

    const connections = await agents.listAgentConnections(env, "alpha", "main");
    assert.equal(connections.length, 2);
    assert.ok(connections.every((connection) => connection.revokedAt !== null));

    const final = await agents.getAgent(env, "alpha", "main");
    assert.equal(final.status, "disabled");
  } finally {
    db.close();
  }
});

test("[SQLite-backed D1 contract] genuinely concurrent avatar uploads: exactly one wins, final state is consistent", async () => {
  const db = new SqliteD1Database();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_NOW: "2026-05-08T00:00:00.000Z" };
    await create(env, "alpha", "main");

    const settled = await Promise.allSettled([
      agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-a"),
      agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-b"),
    ]);
    const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<AgentRecord> => entry.status === "fulfilled");
    const rejected = settled.filter((entry) => entry.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(hasErrorCode((rejected[0] as PromiseRejectedResult).reason, "agent_conflict"), true);

    const final = await agents.getAgent(env, "alpha", "main");
    assert.equal(final.avatarVersion, 1);
    assert.equal(final.avatarAssetId, fulfilled[0].value.avatarAssetId);
  } finally {
    db.close();
  }
});

test("[SQLite-backed D1 contract] avatar activation returns its committed snapshot without a post-commit SELECT", async () => {
  const db = new SqliteD1Database();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_NOW: "2026-05-09T00:00:00.000Z" };
    await create(env, "alpha", "main");
    db.preparedSql.length = 0;

    const updated = await agents.bumpAgentAvatarVersion(env, "alpha", "main", "asset-a");
    assert.equal(updated.avatarAssetId, "asset-a");
    const agentSelects = db.preparedSql.filter((sql) => /^SELECT \* FROM agent_registry_agents/i.test(sql.trim()));
    assert.equal(agentSelects.length, 1, "only the pre-CAS snapshot read is allowed");
  } finally {
    db.close();
  }
});

test("[SQLite-backed D1 contract] 0008 backfills revision=1 on a row that existed under 0007", async () => {
  const db = new SqliteD1Database({ throughMigration: "0007_agent_avatar.sql" });
  try {
    db.raw.exec(`INSERT INTO agent_registry_agents
      (uid, agent_id, display_name, provider, role, instructions, status, allowed_scopes, default_handoff_state, review_required, dry_run_default, created_at, updated_at, avatar_version, has_custom_avatar, avatar_asset_id)
      VALUES ('legacy-uid','legacy-agent','Legacy','p','r','','active','[]','ready',1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z',0,0,NULL)`);
    assert.throws(() => db.raw.prepare("SELECT revision FROM agent_registry_agents").get(), /revision/i);
    db.applyMigration("0008_agent_revision.sql");
    const migratedRow = db.raw.prepare("SELECT revision FROM agent_registry_agents WHERE uid = 'legacy-uid' AND agent_id = 'legacy-agent'").get() as { revision: number };
    assert.equal(migratedRow.revision, 1);
    const env: WorkerEnv = { QUESTFORGE_DB: db };
    const agent = await agents.getAgent(env, "legacy-uid", "legacy-agent");
    assert.equal(agent.updatedAt, "2025-01-01T00:00:00.000Z");
    const updated = await agents.updateAgent(env, "legacy-uid", "legacy-agent", { displayName: "Renamed Legacy" });
    assert.equal(updated.displayName, "Renamed Legacy");
  } finally {
    db.close();
  }
});
