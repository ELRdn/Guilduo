/**
 * Agent avatar image bytes — kept entirely separate from D1. D1
 * (`agent-store.ts`) holds `avatar_version` / `has_custom_avatar` /
 * `avatar_asset_id`; this module only ever reads or writes R2 objects keyed
 * by that asset ID. D1 alone decides which asset is "current" for an Agent —
 * this store never overwrites an object and never maps uid/agentId to a key
 * itself, which is what keeps the asset ID unguessable and the ownership
 * check entirely in the caller's hands (index.ts reads the Agent row first).
 */

import type { R2ObjectLike, WorkerEnv, WorkerError } from "./worker-types.ts";

export const MAX_AVATAR_BYTES = 300 * 1024; // Generous headroom above a 256x256 WebP.

function avatarError(status: number, code: string, message: string): WorkerError {
  return Object.assign(new Error(message), { status, code });
}

type ImageFormat = "webp" | "png" | "jpeg";

/**
 * Real magic-byte sniffing, independent of the request's declared
 * Content-Type — a mislabeled or spoofed header cannot smuggle another format
 * through. Only the three formats this product accepts are recognized; any
 * other input is `null`, invalid file included.
 */
function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/** Shared with `agent-avatar-cleanup.ts`, which lists every object under this prefix to find candidates no `avatar_asset_id` in D1 points at any more. */
export const AVATAR_KEY_PREFIX = "agents/avatars/";

function avatarKey(assetId: string): string {
  return `${AVATAR_KEY_PREFIX}${assetId}`;
}

/** The inverse of `avatarKey` — recovers the asset ID D1 stores from a full R2 key, or `null` for a key outside this prefix. */
export function assetIdFromAvatarKey(key: string): string | null {
  return key.startsWith(AVATAR_KEY_PREFIX) ? key.slice(AVATAR_KEY_PREFIX.length) : null;
}

export interface PutAvatarResult {
  readonly assetId: string;
  readonly contentType: string;
}

/**
 * Validates and stores one Agent avatar under a brand-new, random key.
 * Every upload gets its own `crypto.randomUUID()` asset ID — this store never
 * overwrites an existing object, and never accepts a caller-chosen key.
 * Deciding which asset is "current" for an Agent, and cleaning up an asset a
 * losing D1 write orphaned, is entirely `agent-store.ts` / `index.ts`'s job.
 *
 * Byte size and real image format are validated here regardless of what the
 * request claimed — this is the actual security boundary; client-side
 * resizing (brief Phase 3) is only a UX optimization, not something this
 * function trusts. When no bucket is bound, this fails closed (503) rather
 * than silently accepting an upload nothing will ever be able to read back.
 */
export async function putAgentAvatar(env: WorkerEnv, bytes: Uint8Array): Promise<PutAvatarResult> {
  if (!env.AGENT_AVATARS) throw avatarError(503, "avatar_storage_unavailable", "Avatar storage is not configured. The image was not saved.");
  if (bytes.byteLength === 0) throw avatarError(400, "avatar_empty", "The uploaded image is empty.");
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw avatarError(413, "avatar_too_large", "Avatar must be 300 KB or smaller.");
  const format = sniffFormat(bytes);
  if (format === null) throw avatarError(415, "avatar_format_invalid", "Avatar must be a real PNG, JPEG, or WebP image.");
  const contentType = `image/${format}`;
  const assetId = crypto.randomUUID();
  await env.AGENT_AVATARS.put(avatarKey(assetId), bytes, { httpMetadata: { contentType } });
  return { assetId, contentType };
}

/**
 * The raw R2 object for one previously-stored asset, or `null` when it does
 * not exist (or no bucket is bound). Returned as-is — including its
 * `.body` stream — so the caller can respond without buffering the whole
 * image into memory.
 */
export async function getAgentAvatarObject(env: WorkerEnv, assetId: string): Promise<R2ObjectLike | null> {
  if (!env.AGENT_AVATARS) return null;
  return env.AGENT_AVATARS.get(avatarKey(assetId));
}

/**
 * Deletes one asset. Used only to clean up an object a request just wrote
 * to R2 when the paired D1 activation step (`bumpAgentAvatarVersion`) loses
 * a concurrency race — the object was never made "current," so nothing else
 * can be pointing at it.
 */
export async function deleteAgentAvatarAsset(env: WorkerEnv, assetId: string): Promise<void> {
  if (!env.AGENT_AVATARS) return;
  await env.AGENT_AVATARS.delete(avatarKey(assetId));
}
