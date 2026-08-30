const test = require("node:test");
const assert = require("node:assert/strict");
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { FakeR2Bucket, hasErrorCode } from "./test-helpers.ts";

type AvatarStore = typeof import("../worker/src/agent-avatar-store.ts");

let store: AvatarStore;

test.before(async () => {
  store = await import("../worker/src/agent-avatar-store.ts");
});

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => hasErrorCode(error, code));
}

async function readAll(readable: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!readable) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

const WEBP_MAGIC = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const NOT_AN_IMAGE = new TextEncoder().encode("<script>alert(1)</script>");

test("without an R2 binding, an upload fails closed with avatar_storage_unavailable rather than silently succeeding", async () => {
  const env: WorkerEnv = {};
  await expectCode(store.putAgentAvatar(env, WEBP_MAGIC), "avatar_storage_unavailable");
});

test("a real WebP is stored under a brand-new random key and served back with a stable ETag and content-type", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  const { assetId, contentType } = await store.putAgentAvatar(env, WEBP_MAGIC);
  assert.equal(contentType, "image/webp");
  assert.ok(assetId.length > 0);

  const object = await store.getAgentAvatarObject(env, assetId);
  assert.ok(object);
  assert.deepEqual(await readAll(object!.body), WEBP_MAGIC);
  const headers = new Headers();
  object!.writeHttpMetadata(headers);
  assert.equal(headers.get("content-type"), "image/webp");
  assert.ok(object!.httpEtag);
});

test("PNG and JPEG are recognized by their own magic bytes, independent of what a caller might have claimed", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  const { assetId: pngId, contentType: pngType } = await store.putAgentAvatar(env, PNG_MAGIC);
  assert.equal(pngType, "image/png");
  const { assetId: jpegId, contentType: jpegType } = await store.putAgentAvatar(env, JPEG_MAGIC);
  assert.equal(jpegType, "image/jpeg");
  assert.notEqual(pngId, jpegId);
});

test("a file that is not really an image is rejected regardless of size or declared type", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  await expectCode(store.putAgentAvatar(env, NOT_AN_IMAGE), "avatar_format_invalid");
});

test("an empty upload and an oversized upload are both rejected", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  await expectCode(store.putAgentAvatar(env, new Uint8Array(0)), "avatar_empty");
  const oversized = new Uint8Array(store.MAX_AVATAR_BYTES + 1);
  oversized.set(WEBP_MAGIC);
  await expectCode(store.putAgentAvatar(env, oversized), "avatar_too_large");
});

test("exactly the maximum size is accepted", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  const exact = new Uint8Array(store.MAX_AVATAR_BYTES);
  exact.set(WEBP_MAGIC);
  const { assetId } = await store.putAgentAvatar(env, exact);
  assert.ok(assetId);
});

test("every upload gets its own random key — R2 objects are never overwritten, even for the same bytes", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  const first = await store.putAgentAvatar(env, WEBP_MAGIC);
  const second = await store.putAgentAvatar(env, WEBP_MAGIC);
  assert.notEqual(first.assetId, second.assetId);
  assert.equal((env.AGENT_AVATARS as FakeR2Bucket).putCalls, 2);
  assert.equal((env.AGENT_AVATARS as FakeR2Bucket).store.size, 2);
  assert.ok(await store.getAgentAvatarObject(env, first.assetId));
  assert.ok(await store.getAgentAvatarObject(env, second.assetId));
});

test("a missing asset, or any asset when no bucket is bound, reads as null rather than throwing", async () => {
  const bound: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  assert.equal(await store.getAgentAvatarObject(bound, "ghost-asset"), null);

  const unbound: WorkerEnv = {};
  assert.equal(await store.getAgentAvatarObject(unbound, "any-asset"), null);
});

test("deleteAgentAvatarAsset removes the object, and is a safe no-op without a bucket or for an unknown key", async () => {
  const env: WorkerEnv = { AGENT_AVATARS: new FakeR2Bucket() };
  const { assetId } = await store.putAgentAvatar(env, WEBP_MAGIC);
  assert.ok(await store.getAgentAvatarObject(env, assetId));
  await store.deleteAgentAvatarAsset(env, assetId);
  assert.equal(await store.getAgentAvatarObject(env, assetId), null);
  await store.deleteAgentAvatarAsset(env, "never-existed");
  await store.deleteAgentAvatarAsset({}, assetId);
});
