const test = require("node:test");
const assert = require("node:assert/strict");
import { FakeR2Bucket, json, SqliteD1Database, type TestContext, type TestRequestOptions } from "./test-helpers.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

const env: WorkerEnv = {
  DEV_BEARER_TOKEN: "profile-test-token",
  DEV_USER_ID: "profile-owner",
  ALLOWED_ORIGINS: "http://localhost:5173",
};
const context: TestContext = { waitUntil(promise: Promise<unknown>): void { promise.catch(() => {}); } };
const WEBP_MAGIC = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);

async function call(path: string, options: TestRequestOptions = {}, uid = env.DEV_USER_ID || "profile-owner"): Promise<Response> {
  env.DEV_USER_ID = uid;
  const worker = (await import("../worker/src/index.ts")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, {
    ...options,
    headers: {
      authorization: "Bearer profile-test-token",
      origin: "http://localhost:5173",
      ...(options.body instanceof Uint8Array ? { "content-type": "application/octet-stream" } : {}),
      ...(options.body && !(options.body instanceof Uint8Array) ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  }), env, context);
}

async function unauthenticated(path: string, options: TestRequestOptions = {}): Promise<Response> {
  const worker = (await import("../worker/src/index.ts")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, { ...options, headers: { origin: "http://localhost:5173", ...(options.headers || {}) } }), env, context);
}

async function createProfile(uid = "profile-owner"): Promise<void> {
  const response = await call("/v1/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName: "Profile Owner", handle: "profile_owner", bio: "Ready" }),
  }, uid);
  assert.equal(response.status, 200);
}

test.beforeEach(async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  delete env.QUESTFORGE_DB;
  const social = await import("../worker/src/social-store.ts");
  social.resetSocialMemoryForTests();
  env.DEV_USER_ID = "profile-owner";
});

test("profile=null is a normal REST state and REST/MCP share profile metadata", async () => {
  const empty = await json<{ profile: null }>(await call("/v1/profile"));
  assert.equal(empty.profile, null);

  await createProfile();
  const mcpRead = await json<{ result: { isError: boolean; structuredContent: { profile: { displayName: string; handle: string } } } }>(await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_my_profile", arguments: {} } }),
  }));
  assert.equal(mcpRead.result.isError, false);
  assert.equal(mcpRead.result.structuredContent.profile.displayName, "Profile Owner");

  const mcpWrite = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "update_profile", arguments: { displayName: "Updated by MCP", handle: "profile_owner", bio: "Changed" } } }),
  });
  assert.equal((await json<{ result: { isError: boolean } }>(mcpWrite)).result.isError, false);
  const rest = await json<{ profile: { displayName: string; bio: string } }>(await call("/v1/profile"));
  assert.equal(rest.profile.displayName, "Updated by MCP");
  assert.equal(rest.profile.bio, "Changed");
});

test("profile avatar upload, exact-version fetch, change, remove, and auth boundary work", async () => {
  await createProfile();
  const bucket = env.AGENT_AVATARS as FakeR2Bucket;

  const first = await json<{ profile: { hasCustomAvatar: boolean; avatarVersion: number; avatarUrl: string } }>(await call("/v1/profile/avatar", {
    method: "PUT",
    body: WEBP_MAGIC,
    headers: { "content-type": "image/webp" },
  }));
  assert.equal(first.profile.hasCustomAvatar, true);
  assert.equal(first.profile.avatarVersion, 1);
  assert.equal(first.profile.avatarUrl, "");
  assert.equal(bucket.store.size, 1);

  const image = await call("/v1/profile/avatar?v=1");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.equal(image.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), WEBP_MAGIC);
  const stale = await json<{ error: { code: string } }>(await call("/v1/profile/avatar?v=2"));
  assert.equal(stale.error.code, "avatar_version_stale");

  const second = await json<{ profile: { avatarVersion: number } }>(await call("/v1/profile/avatar", {
    method: "PUT",
    body: WEBP_MAGIC,
  }));
  assert.equal(second.profile.avatarVersion, 2);
  assert.equal(bucket.store.size, 1, "the replaced private object is cleaned after activation");

  const removed = await json<{ profile: { hasCustomAvatar: boolean; avatarVersion: number } }>(await call("/v1/profile/avatar", { method: "DELETE" }));
  assert.equal(removed.profile.hasCustomAvatar, false);
  assert.equal(removed.profile.avatarVersion, 3);
  assert.equal(bucket.store.size, 0);
  const afterRemove = await json<{ error: { code: string } }>(await call("/v1/profile/avatar?v=2"));
  assert.equal(afterRemove.error.code, "avatar_not_found");

  assert.equal((await unauthenticated("/v1/profile/avatar?v=1")).status, 401);
});

test("profile avatar endpoints cannot read or mutate another user's profile", async () => {
  await createProfile("profile-owner");
  await call("/v1/profile/avatar", { method: "PUT", body: WEBP_MAGIC }, "profile-owner");
  const foreignRead = await json<{ error: { code: string } }>(await call("/v1/profile/avatar?v=1", {}, "someone-else"));
  assert.equal(foreignRead.error.code, "avatar_not_found");
  const foreignWrite = await json<{ error: { code: string } }>(await call("/v1/profile/avatar", { method: "PUT", body: WEBP_MAGIC }, "someone-else"));
  assert.equal(foreignWrite.error.code, "profile_not_found");
});

test("profile avatar metadata persists through the D1 schema", async () => {
  const db = new SqliteD1Database();
  env.QUESTFORGE_DB = db;
  try {
    await createProfile();
    const uploaded = await json<{ profile: { avatarVersion: number; hasCustomAvatar: boolean } }>(await call("/v1/profile/avatar", {
      method: "PUT",
      body: WEBP_MAGIC,
      headers: { "content-type": "image/webp" },
    }));
    assert.equal(uploaded.profile.avatarVersion, 1);
    assert.equal(uploaded.profile.hasCustomAvatar, true);

    const stored = await json<{ profile: { avatarVersion: number; hasCustomAvatar: boolean } }>(await call("/v1/profile"));
    assert.equal(stored.profile.avatarVersion, 1);
    assert.equal(stored.profile.hasCustomAvatar, true);

    const removed = await json<{ profile: { avatarVersion: number; hasCustomAvatar: boolean } }>(await call("/v1/profile/avatar", { method: "DELETE" }));
    assert.equal(removed.profile.avatarVersion, 2);
    assert.equal(removed.profile.hasCustomAvatar, false);
  } finally {
    delete env.QUESTFORGE_DB;
    db.close();
  }
});

test("concurrent profile avatar uploads use version CAS and clean the losing object", async () => {
  const db = new SqliteD1Database();
  env.QUESTFORGE_DB = db;
  try {
    await createProfile();
    const responses = await Promise.all([
      call("/v1/profile/avatar", { method: "PUT", body: WEBP_MAGIC }),
      call("/v1/profile/avatar", { method: "PUT", body: WEBP_MAGIC }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const conflict = responses.find((response) => response.status === 409);
    if (!conflict) throw new Error("Expected one concurrent upload to lose the profile avatar CAS.");
    assert.equal((await json<{ error: { code: string } }>(conflict)).error.code, "profile_avatar_conflict");
    assert.equal((env.AGENT_AVATARS as FakeR2Bucket).store.size, 1);
    const current = await json<{ profile: { avatarVersion: number; hasCustomAvatar: boolean } }>(await call("/v1/profile"));
    assert.equal(current.profile.avatarVersion, 1);
    assert.equal(current.profile.hasCustomAvatar, true);
  } finally {
    delete env.QUESTFORGE_DB;
    db.close();
  }
});

test("profile avatar storage fails closed and validates bytes and size", async () => {
  await createProfile();
  delete env.AGENT_AVATARS;
  const noStorage = await json<{ error: { code: string } }>(await call("/v1/profile/avatar", { method: "PUT", body: WEBP_MAGIC }));
  assert.equal(noStorage.error.code, "avatar_storage_unavailable");

  env.AGENT_AVATARS = new FakeR2Bucket();
  const invalid = await json<{ error: { code: string } }>(await call("/v1/profile/avatar", { method: "PUT", body: new TextEncoder().encode("not an image") }));
  assert.equal(invalid.error.code, "avatar_format_invalid");
  const oversized = new Uint8Array(300 * 1024 + 1);
  oversized.set(WEBP_MAGIC);
  const tooLarge = await json<{ error: { code: string } }>(await call("/v1/profile/avatar", { method: "PUT", body: oversized }));
  assert.equal(tooLarge.error.code, "avatar_too_large");
});
