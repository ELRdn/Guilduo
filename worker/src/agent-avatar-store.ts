/**
 * Agent avatar image bytes — kept entirely separate from D1. D1
 * (`agent-store.ts`) holds `avatar_version` / `has_custom_avatar` /
 * `avatar_asset_id`; this module only ever reads or writes R2 objects keyed
 * by that asset ID. D1 alone decides which asset is "current" for an Agent —
 * this store never overwrites an object and never maps uid/agentId to a key
 * itself, which is what keeps the asset ID unguessable and the ownership
 * check entirely in the caller's hands (index.ts reads the Agent row first).
 */

import { assetIdFromAvatarKey as assetIdFromAvatarKeyInStore, deleteAvatarAsset, getAvatarObject, MAX_AVATAR_BYTES, putAvatar, type PutAvatarResult } from "./avatar-store.ts";
import type { R2ObjectLike, WorkerEnv } from "./worker-types.ts";

export { MAX_AVATAR_BYTES, type PutAvatarResult } from "./avatar-store.ts";

/** Shared with `agent-avatar-cleanup.ts`, which lists every object under this prefix to find candidates no `avatar_asset_id` in D1 points at any more. */
export const AVATAR_KEY_PREFIX = "agents/avatars/";

/** The inverse of `avatarKey` — recovers the asset ID D1 stores from a full R2 key, or `null` for a key outside this prefix. */
export function assetIdFromAvatarKey(key: string): string | null {
  return assetIdFromAvatarKeyInStore(AVATAR_KEY_PREFIX, key);
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
  return putAvatar(env, bytes, AVATAR_KEY_PREFIX);
}

/**
 * The raw R2 object for one previously-stored asset, or `null` when it does
 * not exist (or no bucket is bound). Returned as-is — including its
 * `.body` stream — so the caller can respond without buffering the whole
 * image into memory.
 */
export async function getAgentAvatarObject(env: WorkerEnv, assetId: string): Promise<R2ObjectLike | null> {
  return getAvatarObject(env, assetId, AVATAR_KEY_PREFIX);
}

/**
 * Deletes one asset. Used only to clean up an object a request just wrote
 * to R2 when the paired D1 activation step (`bumpAgentAvatarVersion`) loses
 * a concurrency race — the object was never made "current," so nothing else
 * can be pointing at it.
 */
export async function deleteAgentAvatarAsset(env: WorkerEnv, assetId: string): Promise<void> {
  await deleteAvatarAsset(env, assetId, AVATAR_KEY_PREFIX);
}
