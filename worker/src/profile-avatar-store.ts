/** Private profile avatar objects. Metadata and ownership remain in social-store.ts. */

import { deleteAvatarAsset, getAvatarObject, putAvatar, type PutAvatarResult } from "./avatar-store.ts";
import type { R2ObjectLike, WorkerEnv } from "./worker-types.ts";

export const PROFILE_AVATAR_KEY_PREFIX = "profiles/avatars/";
export { MAX_AVATAR_BYTES, type PutAvatarResult } from "./avatar-store.ts";

export function putProfileAvatar(env: WorkerEnv, bytes: Uint8Array): Promise<PutAvatarResult> {
  return putAvatar(env, bytes, PROFILE_AVATAR_KEY_PREFIX);
}

export function getProfileAvatarObject(env: WorkerEnv, assetId: string): Promise<R2ObjectLike | null> {
  return getAvatarObject(env, assetId, PROFILE_AVATAR_KEY_PREFIX);
}

export function deleteProfileAvatarAsset(env: WorkerEnv, assetId: string): Promise<void> {
  return deleteAvatarAsset(env, assetId, PROFILE_AVATAR_KEY_PREFIX);
}
