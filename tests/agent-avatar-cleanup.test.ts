const test = require("node:test");
const assert = require("node:assert/strict");
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { FakeR2Bucket, SqliteD1Database } from "./test-helpers.ts";

type AgentStore = typeof import("../worker/src/agent-store.ts");
type AvatarStore = typeof import("../worker/src/agent-avatar-store.ts");
type CleanupModule = typeof import("../worker/src/agent-avatar-cleanup.ts");

let agents: AgentStore;
let avatarStore: AvatarStore;
let cleanup: CleanupModule;

test.before(async () => {
  agents = await import("../worker/src/agent-store.ts");
  avatarStore = await import("../worker/src/agent-avatar-store.ts");
  cleanup = await import("../worker/src/agent-avatar-cleanup.ts");
});

const HOUR = 60 * 60 * 1000;

test("no R2 binding: cleanup is blocked and never crashes", async () => {
  const env: WorkerEnv = {};
  const report = await cleanup.planAgentAvatarCleanup(env);
  assert.equal(report.status, "blocked");
  assert.equal(report.blockedReason, "r2_unavailable");
  assert.equal(report.mode, "dry-run");
  assert.equal(report.scannedObjects, 0);
  assert.deepEqual(report.candidates, []);
});

test("R2 without D1: execute mode fails closed and never deletes an object", async () => {
  const bucket = new FakeR2Bucket();
  const env: WorkerEnv = { AGENT_AVATARS: bucket };
  const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
  bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));

  const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 1 });
  assert.equal(report.status, "blocked");
  assert.equal(report.blockedReason, "d1_unavailable");
  assert.equal(report.deleted.length, 0);
  assert.ok(await avatarStore.getAgentAvatarObject(env, assetId));
});

test("invalid cleanup bounds are rejected before any storage operation", async () => {
  const env: WorkerEnv = { QUESTFORGE_DB: new SqliteD1Database(), AGENT_AVATARS: new FakeR2Bucket() };
  try {
    await assert.rejects(cleanup.planAgentAvatarCleanup(env, { graceHours: -1 }), /graceHours/);
    await assert.rejects(cleanup.planAgentAvatarCleanup(env, { graceHours: Number.NaN }), /graceHours/);
    await assert.rejects(cleanup.planAgentAvatarCleanup(env, { maxPages: 0 }), /maxPages/);
    await assert.rejects(cleanup.planAgentAvatarCleanup(env, { maxPages: 1.5 }), /maxPages/);
  } finally {
    (env.QUESTFORGE_DB as SqliteD1Database).close();
  }
});

test("an asset actively referenced by an Agent's avatar_asset_id is always skipped, even old and even with execute:true", async () => {
  agents.resetAgentMemoryForTests();
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    await agents.createAgent(env, "alpha", { agentId: "main", displayName: "Main" });
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    await agents.bumpAgentAvatarVersion(env, "alpha", "main", assetId);
    // Backdate it far past any reasonable grace period — active reference
    // must still win over age.
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 365 * 24 * HOUR));

    const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 1, now: new Date() });
    assert.equal(report.scannedObjects, 1);
    assert.equal(report.activeReferences, 1);
    assert.equal(report.candidates.length, 0);
    assert.equal(report.skipped.length, 1);
    assert.equal(report.skipped[0].reason, "active_reference");
    // And the object must still be retrievable — nothing was deleted.
    assert.ok(await avatarStore.getAgentAvatarObject(env, assetId));
  } finally {
    db.close();
  }
});

test("an unreferenced asset within the grace period is reported as a skip, not a deletable candidate", async () => {
  agents.resetAgentMemoryForTests();
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    // No agent ever references it — freshly orphaned, e.g. from a losing
    // upload race that is still mid-cleanup.
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 1 * HOUR));

    const report = await cleanup.planAgentAvatarCleanup(env, { graceHours: 24 });
    assert.equal(report.candidates.length, 0);
    assert.equal(report.skipped.length, 1);
    assert.equal(report.skipped[0].reason, "within_grace_period");
  } finally {
    db.close();
  }
});

test("an unreferenced asset past the grace period is a reported candidate in dry-run, and is not deleted without execute:true", async () => {
  agents.resetAgentMemoryForTests();
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));

    const report = await cleanup.planAgentAvatarCleanup(env, { graceHours: 24 });
    assert.equal(report.mode, "dry-run");
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].assetId, assetId);
    assert.ok(report.candidates[0].checksum.length > 0);
    assert.ok(report.candidates[0].ageHours >= 47);
    assert.equal(report.deleted.length, 0);
    // Dry-run must never touch storage.
    assert.ok(await avatarStore.getAgentAvatarObject(env, assetId));
  } finally {
    db.close();
  }
});

test("execute:true deletes only the reported candidates, and reports what was actually removed", async () => {
  agents.resetAgentMemoryForTests();
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    await agents.createAgent(env, "alpha", { agentId: "main", displayName: "Main" });
    const { assetId: activeAsset } = await avatarStore.putAgentAvatar(env, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
    await agents.bumpAgentAvatarVersion(env, "alpha", "main", activeAsset);
    bucket.setUploadedAt(`agents/avatars/${activeAsset}`, new Date(Date.now() - 48 * HOUR));

    const { assetId: orphanAsset } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    bucket.setUploadedAt(`agents/avatars/${orphanAsset}`, new Date(Date.now() - 48 * HOUR));

    const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 24 });
    assert.equal(report.mode, "execute");
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].assetId, orphanAsset);
    assert.deepEqual(report.deleted, [`agents/avatars/${orphanAsset}`]);
    assert.equal(report.deletionErrors.length, 0);

    assert.equal(await avatarStore.getAgentAvatarObject(env, orphanAsset), null);
    assert.ok(await avatarStore.getAgentAvatarObject(env, activeAsset), "the actively-referenced asset must survive execute:true");
  } finally {
    db.close();
  }
});

test("execute rechecks D1 and preserves a candidate that became referenced after the inventory scan", async () => {
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    await agents.createAgent(env, "alpha", { agentId: "main", displayName: "Main" });
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));
    const originalList = bucket.list.bind(bucket);
    bucket.list = async (options) => {
      const page = await originalList(options);
      db.raw.prepare("UPDATE agent_registry_agents SET avatar_asset_id = ?, has_custom_avatar = 1, avatar_version = 1 WHERE uid = ? AND agent_id = ?").run(assetId, "alpha", "main");
      return page;
    };

    const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 1 });
    assert.equal(report.candidates.length, 1, "the initial snapshot saw an orphan candidate");
    assert.equal(report.deleted.length, 0);
    assert.equal(report.skipped.at(-1)?.reason, "active_reference_recheck");
    assert.ok(await avatarStore.getAgentAvatarObject(env, assetId));
  } finally {
    db.close();
  }
});

test("a D1 failure during the delete-time reference check preserves the R2 candidate", async () => {
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  let dbClosed = false;
  const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
  try {
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));
    const originalList = bucket.list.bind(bucket);
    bucket.list = async (options) => {
      const page = await originalList(options);
      db.close();
      dbClosed = true;
      return page;
    };

    const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 1 });
    assert.equal(report.deleted.length, 0);
    assert.equal(report.referenceCheckErrors.length, 1);
    assert.ok(bucket.store.has(`agents/avatars/${assetId}`));
  } finally {
    if (!dbClosed) db.close();
  }
});

test("an archived Agent's avatar reference is still treated as active — archival retains, it does not orphan", async () => {
  agents.resetAgentMemoryForTests();
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    await agents.createAgent(env, "alpha", { agentId: "main", displayName: "Main" });
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    await agents.bumpAgentAvatarVersion(env, "alpha", "main", assetId);
    await agents.updateAgent(env, "alpha", "main", { status: "archived" });
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));

    const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 24 });
    assert.equal(report.candidates.length, 0);
    assert.equal(report.skipped[0]?.reason, "active_reference");
    assert.ok(await avatarStore.getAgentAvatarObject(env, assetId));
  } finally {
    db.close();
  }
});

test("a delete failure during execute is reported per-key, not thrown, and does not remove the candidate from the record silently", async () => {
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));
    bucket.delete = async () => { throw new Error("simulated R2 delete failure"); };

    const report = await cleanup.planAgentAvatarCleanup(env, { execute: true, graceHours: 24 });
    assert.equal(report.candidates.length, 1);
    assert.equal(report.deleted.length, 0);
    assert.equal(report.deletionErrors.length, 1);
    assert.equal(report.deletionErrors[0].key, `agents/avatars/${assetId}`);
  } finally {
    db.close();
  }
});

test("the report never contains a token, secret, API key, or full request body — only key/size/age/checksum", async () => {
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  try {
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_AVATARS: bucket };
    const { assetId } = await avatarStore.putAgentAvatar(env, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    bucket.setUploadedAt(`agents/avatars/${assetId}`, new Date(Date.now() - 48 * HOUR));

    const report = await cleanup.planAgentAvatarCleanup(env, { graceHours: 24 });
    const serialized = JSON.stringify(report).toLowerCase();
    for (const forbidden of ["token", "secret", "apikey", "bearer"]) {
      assert.equal(serialized.includes(forbidden), false, `report must not contain "${forbidden}"`);
    }
  } finally {
    db.close();
  }
});
