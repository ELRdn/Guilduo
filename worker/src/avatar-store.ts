/**
 * Shared private avatar byte store.
 *
 * Agent and user-profile images use the same R2 binding and validation rules,
 * but different prefixes and different D1 ownership records. Keeping the
 * byte-level boundary here prevents one surface from quietly accepting a
 * weaker MIME or size policy than the other.
 */

import type { R2ObjectLike, WorkerEnv, WorkerError } from "./worker-types.ts";

export const MAX_AVATAR_BYTES = 300 * 1024;

function avatarError(status: number, code: string, message: string): WorkerError {
  return Object.assign(new Error(message), { status, code });
}

type ImageFormat = "webp" | "png" | "jpeg";

/** Real image signature detection; the request Content-Type is never trusted. */
export function sniffAvatarFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

export interface PutAvatarResult {
  readonly assetId: string;
  readonly contentType: string;
}

function avatarKey(prefix: string, assetId: string): string {
  return `${prefix}${assetId}`;
}

export function assetIdFromAvatarKey(prefix: string, key: string): string | null {
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

/** Validate and store bytes under a fresh random key in the requested namespace. */
export async function putAvatar(env: WorkerEnv, bytes: Uint8Array, prefix: string): Promise<PutAvatarResult> {
  if (!env.AGENT_AVATARS) throw avatarError(503, "avatar_storage_unavailable", "Avatar storage is not configured. The image was not saved.");
  if (bytes.byteLength === 0) throw avatarError(400, "avatar_empty", "The uploaded image is empty.");
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw avatarError(413, "avatar_too_large", "Avatar must be 300 KB or smaller.");
  const format = sniffAvatarFormat(bytes);
  if (format === null) throw avatarError(415, "avatar_format_invalid", "Avatar must be a real PNG, JPEG, or WebP image.");
  const contentType = `image/${format}`;
  const assetId = crypto.randomUUID();
  await env.AGENT_AVATARS.put(avatarKey(prefix, assetId), bytes, { httpMetadata: { contentType } });
  return { assetId, contentType };
}

export async function getAvatarObject(env: WorkerEnv, assetId: string, prefix: string): Promise<R2ObjectLike | null> {
  if (!env.AGENT_AVATARS) return null;
  return env.AGENT_AVATARS.get(avatarKey(prefix, assetId));
}

export async function deleteAvatarAsset(env: WorkerEnv, assetId: string, prefix: string): Promise<void> {
  if (!env.AGENT_AVATARS) return;
  await env.AGENT_AVATARS.delete(avatarKey(prefix, assetId));
}
