import type { QuestForgeState, QuestImage, QuestRequester } from "../../types/questforge.ts";
import { DomainError, getQuest } from "../../server/questforge-domain.ts";
import { imageIds } from "../../shared/relay.ts";
import { sniffAvatarFormat } from "./avatar-store.ts";
import { randomToken, sha256, type AuthIdentity } from "./security.ts";
import { getAuthorizedClient } from "./oauth.ts";
import { assertAgentAccess, getAgent, getAgentConnection } from "./agent-store.ts";
import type { JsonRecord, WorkerEnv } from "./worker-types.ts";

export const MAX_QUEST_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_QUEST_IMAGE_PREVIEW_BYTES = 1024 * 1024;
export const QUEST_IMAGE_QUOTA_BYTES = 500 * 1024 * 1024;
const PREFIX = "quests/images/";
const UPLOAD_TTL = 10 * 60 * 1000;
type ImageIdentity = AuthIdentity & { agent?: { agentId: string; displayName: string } | null };
interface Row { id: string; uid: string; quest_id: string; status: string; token_hash: string; expires_at: number; reserved_bytes: number; identity_json: string; metadata_json: string; updated_at: number }
type LoadState = (uid: string) => Promise<QuestForgeState>;
const key = (id: string, preview = false) => `${PREFIX}${id}/${preview ? "preview.webp" : "original"}`;
const fail = (status: number, code: string, message: string): never => { throw new DomainError(status, code, message); };
const metadata = (row: Row): QuestImage => JSON.parse(row.metadata_json) as QuestImage;

function database(env: WorkerEnv) {
  if (!env.QUESTFORGE_DB || !env.AGENT_AVATARS) return fail(503, "image_storage_unavailable", "Image storage is unavailable. Your file was not saved.");
  return env.QUESTFORGE_DB;
}

function text(value: unknown, max: number, required = false): string {
  if (value !== undefined && typeof value !== "string") return fail(400, "invalid_image_input", "Image metadata must be text.");
  const result = String(value || "").trim();
  if (result.length > max || (required && !result) || /[\u0000-\u001f\u007f]/.test(result)) return fail(400, "invalid_image_input", "Invalid image metadata.");
  return result;
}

function scope(identity: ImageIdentity, required: string) {
  if (!identity.scopes.includes(required)) fail(403, "insufficient_scope", `Requires ${required}.`);
}

function visible(image: QuestImage, state: QuestForgeState, human: boolean): boolean {
  if (image.context !== "response" || human) return true;
  const request = state.tasks.find(q => q.id === image.reviewQuestId)?.humanRequest;
  return Boolean(request?.status === "answered" && request.responseAttachmentIds?.includes(image.id));
}

async function rowFor(env: WorkerEnv, uid: string, id: string): Promise<Row> {
  const row = await database(env).prepare("SELECT * FROM quest_images WHERE uid = ? AND id = ?").bind(uid, id).first<Row>();
  if (!row) return fail(404, "quest_image_not_found", "Image not found.");
  return row;
}

export async function listQuestImages(env: WorkerEnv, identity: ImageIdentity, state: QuestForgeState, questId: string) {
  scope(identity, "quests:read");
  const quest = getQuest(state, questId).quest;
  const sourceId = quest.humanRequest?.sourceQuestId || questId;
  const rows = await database(env).prepare("SELECT * FROM quest_images WHERE uid = ? AND quest_id = ? AND status IN ('ready','deleted') ORDER BY updated_at, id").bind(identity.uid, sourceId).all<Row>();
  const images = (rows.results || []).map(metadata).filter(image => image.contentType && visible(image, state, identity.authType !== "oauth"));
  const usage = await database(env).prepare("SELECT COALESCE(SUM(reserved_bytes),0) AS bytes FROM quest_images WHERE uid = ? AND (status IN ('ready','uploading','deleted') OR (status = 'pending' AND expires_at > ?))").bind(identity.uid, Date.now()).first<{ bytes: number }>();
  return { images, usedBytes: usage?.bytes || 0, quotaBytes: QUEST_IMAGE_QUOTA_BYTES, maxImageBytes: MAX_QUEST_IMAGE_BYTES, maxImages: 10 };
}

export async function prepareQuestImage(env: WorkerEnv, identity: ImageIdentity, state: QuestForgeState, input: JsonRecord) {
  scope(identity, "quests:write");
  if (identity.authType === "oauth" && !identity.agent) return fail(403, "agent_link_required", "Link a registered Agent before uploading images.");
  const source = getQuest(state, text(input.questId, 120, true)).quest;
  const questId = source.humanRequest?.sourceQuestId || source.id;
  getQuest(state, questId);
  const context = String(input.context || "reference") as QuestImage["context"];
  if (!["reference", "result", "request", "response"].includes(context)) return fail(400, "invalid_image_context", "Unknown image context.");
  const reviewQuestId = text(input.reviewQuestId, 120) || (source.humanRequest ? source.id : "");
  if (context === "response") {
    if (identity.authType === "oauth") return fail(403, "human_response_required", "Only the human may upload a response image.");
    const request = state.tasks.find(q => q.id === reviewQuestId)?.humanRequest;
    if (!request || request.sourceQuestId !== questId || request.recipientId !== identity.uid || request.status === "answered") return fail(409, "human_request_closed", "Choose a pending human request.");
  } else if (reviewQuestId && state.tasks.find(q => q.id === reviewQuestId)?.humanRequest?.sourceQuestId !== questId) return fail(400, "invalid_image_context", "The review belongs to another Quest.");
  const size = Number(input.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_QUEST_IMAGE_BYTES) return fail(413, "quest_image_too_large", "Use an image of at most 10 MiB.");
  const digest = text(input.sha256, 64, true).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) return fail(400, "image_hash_required", "Provide the file's SHA-256 hexadecimal digest.");
  const filename = text(input.filename, 160, true).replace(/[\\/]/g, "_");
  const legId = text(input.legId, 120);
  if (legId && !state.tasks.find(q => q.id === questId)?.relay?.legs.some(leg => leg.id === legId)) return fail(400, "invalid_image_context", "The stage belongs to another Quest.");
  const createdBy: QuestRequester = identity.authType === "oauth"
    ? { type: "agent", id: identity.agent!.agentId, label: identity.agent!.displayName }
    : { type: "human", id: identity.uid, label: "Human" };
  const uploadId = input.uploadId === undefined ? crypto.randomUUID() : text(input.uploadId, 36, true);
  if (!/^[a-f0-9-]{36}$/.test(uploadId)) return fail(400, "invalid_upload_id", "Use a UUID for this upload.");
  const image: QuestImage = { id: uploadId, questId, context, reviewQuestId, legId, filename, caption: text(input.caption, 500), contentType: "", size,
    previewSize: 0, width: 0, height: 0, sha256: digest, createdAt: new Date().toISOString(), createdBy, deletedAt: "" };
  if (input.dryRun !== false) return { dryRun: true, image, expiresInSeconds: 600 };
  if (!env.IMAGES) return fail(503, "image_processing_unavailable", "Image processing is unavailable. Your file was not saved.");
  const db = database(env);
  const token = randomToken("qfi");
  const now = Date.now();
  const reserved = size + MAX_QUEST_IMAGE_PREVIEW_BYTES;
  const storedIdentity = { uid: identity.uid, authType: identity.authType, clientId: identity.clientId || "", agentId: identity.agent?.agentId || "" };
  const inserted = await db.prepare(`INSERT OR IGNORE INTO quest_images (id,uid,quest_id,status,token_hash,expires_at,reserved_bytes,identity_json,metadata_json,updated_at)
    SELECT ?,?,?,'pending',?,?,?,?,?,? WHERE
    (SELECT COUNT(*) FROM quest_images WHERE uid = ? AND quest_id = ? AND (status IN ('ready','uploading') OR (status = 'pending' AND expires_at > ?))) < 10 AND
    (SELECT COALESCE(SUM(reserved_bytes),0) FROM quest_images WHERE uid = ? AND (status IN ('ready','uploading','deleted') OR (status = 'pending' AND expires_at > ?))) + ? <= ?`)
    .bind(image.id, identity.uid, questId, await sha256(token), now + UPLOAD_TTL, reserved, JSON.stringify(storedIdentity), JSON.stringify(image), now,
      identity.uid, questId, now, identity.uid, now, reserved, QUEST_IMAGE_QUOTA_BYTES).run();
  if (!inserted.meta?.changes) {
    const previous = await db.prepare("SELECT * FROM quest_images WHERE uid = ? AND id = ?").bind(identity.uid, image.id).first<Row>();
    if (!previous) return fail(409, "quest_image_quota", "This Quest has ten images or your storage is full.");
    const before = metadata(previous);
    const fingerprint = (value: QuestImage) => JSON.stringify([value.questId, value.context, value.reviewQuestId, value.legId, value.filename, value.caption, value.size, value.sha256, value.createdBy]);
    if (fingerprint(before) !== fingerprint(image) || previous.identity_json !== JSON.stringify(storedIdentity) || previous.status === "deleted") return fail(409, "image_upload_conflict", "This uploadId belongs to a different file or context.");
    if (previous.status === "uploading") return fail(409, "image_upload_in_progress", "Read the image list before retrying an in-flight upload.");
    const renewed = await db.prepare(`UPDATE quest_images SET token_hash = ?, expires_at = ?, updated_at = ? WHERE uid = ? AND id = ? AND status IN ('pending','ready') AND
      (status = 'ready' OR ((SELECT COUNT(*) FROM quest_images WHERE uid = ? AND quest_id = ? AND id <> ? AND (status IN ('ready','uploading') OR (status = 'pending' AND expires_at > ?))) < 10 AND
      (SELECT COALESCE(SUM(reserved_bytes),0) FROM quest_images WHERE uid = ? AND id <> ? AND (status IN ('ready','uploading','deleted') OR (status = 'pending' AND expires_at > ?))) + reserved_bytes <= ?))`)
      .bind(await sha256(token), now + UPLOAD_TTL, now, identity.uid, image.id, identity.uid, questId, image.id, now, identity.uid, image.id, now, QUEST_IMAGE_QUOTA_BYTES).run();
    if (!renewed.meta?.changes) return fail(409, "quest_image_quota", "The upload cannot renew its storage reservation. Read the image list.");
  }
  return { dryRun: false, imageId: image.id, uploadPath: `/v1/quest-images/uploads/${image.id}`, uploadToken: token, expiresAt: new Date(now + UPLOAD_TTL).toISOString() };
}

async function authorizeUpload(env: WorkerEnv, row: Row): Promise<void> {
  const identity = JSON.parse(row.identity_json) as { uid: string; authType: string; clientId: string; agentId: string };
  if (identity.authType !== "oauth") return;
  const [grant, connection, agent] = await Promise.all([getAuthorizedClient(env, row.uid, identity.clientId), getAgentConnection(env, row.uid, identity.clientId), getAgent(env, row.uid, identity.agentId)]);
  const allowed = connection?.allowedAgentIds || (connection ? [connection.agentId] : []);
  if (!grant || !Array.isArray(grant.scopes) || !grant.scopes.includes("quests:write") || !connection || connection.revokedAt || !allowed.includes(identity.agentId) || agent.status !== "active" || !agent.allowedScopes.includes("quests:write")) return fail(403, "image_upload_revoked", "The Agent or connection no longer permits uploads.");
  if (env.BILLING_ENABLED === "true") await assertAgentAccess(env, row.uid, agent.agentId);
}

async function boundedBytes(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > limit) return fail(413, "quest_image_too_large", "The image exceeds its declared size.");
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "image_empty", "An image body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); return fail(413, "quest_image_too_large", "The image exceeds its declared size."); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

export async function uploadQuestImage(request: Request, env: WorkerEnv, id: string, loadState: LoadState) {
  if (request.method !== "PUT") return fail(405, "method_not_allowed", "Upload with PUT.");
  const db = database(env);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const row = await db.prepare("SELECT * FROM quest_images WHERE id = ? AND token_hash = ?").bind(id, await sha256(token)).first<Row>();
  if (!row || row.expires_at < Date.now()) return fail(401, "image_upload_expired", "Prepare a fresh image upload.");
  await authorizeUpload(env, row);
  const state = await loadState(row.uid);
  const image = metadata(row);
  getQuest(state, image.questId);
  if (image.context === "response" && state.tasks.find(q => q.id === image.reviewQuestId)?.humanRequest?.status === "answered" && row.status !== "ready") return fail(409, "human_request_closed", "The response has already been saved.");
  if (row.status === "ready") return { image, reused: true };
  const bytes = await boundedBytes(request, image.size);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.length !== image.size || digest !== image.sha256) return fail(400, "image_hash_mismatch", "The uploaded file does not match the prepared image.");
  const format = sniffAvatarFormat(bytes);
  if (!format) return fail(415, "image_format_invalid", "Use a real PNG, JPEG or WebP image.");
  if (!env.IMAGES) return fail(503, "image_processing_unavailable", "Image processing is unavailable.");
  const stream = () => new Blob([bytes]).stream();
  const info = await env.IMAGES.info(stream());
  if (!info.width || !info.height || info.width * info.height > 100_000_000 || ![format, `image/${format}`].includes(info.format)) return fail(415, "image_dimensions_invalid", "The image cannot be decoded or exceeds 100 megapixels.");
  const claimed = await db.prepare("UPDATE quest_images SET status = 'uploading', updated_at = ? WHERE id = ? AND status = 'pending' AND expires_at > ?").bind(Date.now(), id, Date.now()).run();
  if (!claimed.meta?.changes) return fail(409, "image_upload_in_progress", "Read the saved image list before retrying this upload.");
  try {
    const preview = async (edge: number) => {
      const result = await env.IMAGES!.input(stream()).transform({ width: edge, height: edge, fit: "scale-down" }).output({ format: "image/webp", quality: 80, anim: false });
      return boundedBytes(new Request("https://image.invalid", { method: "PUT", body: await result.response().arrayBuffer() }), MAX_QUEST_IMAGE_BYTES);
    };
    let small = await preview(1600);
    if (small.length > MAX_QUEST_IMAGE_PREVIEW_BYTES) small = await preview(1024);
    if (small.length > MAX_QUEST_IMAGE_PREVIEW_BYTES) return fail(413, "image_preview_too_large", "Could not create a lightweight preview.");
    const current = await rowFor(env, row.uid, id);
    if (current.status !== "uploading" || current.expires_at < Date.now()) return fail(403, "image_upload_expired", "The upload was revoked or expired.");
    await authorizeUpload(env, current);
    image.contentType = `image/${format}`;
    image.width = info.width; image.height = info.height; image.previewSize = small.length;
    await env.AGENT_AVATARS!.put(key(id), bytes, { httpMetadata: { contentType: image.contentType } });
    await env.AGENT_AVATARS!.put(key(id, true), small, { httpMetadata: { contentType: "image/webp" } });
    // A lost D1 response may have committed; keep the bytes until a read proves their status.
    await db.prepare("UPDATE quest_images SET status = 'ready', reserved_bytes = ?, metadata_json = ?, updated_at = ? WHERE id = ? AND status = 'uploading'")
      .bind(bytes.length + small.length, JSON.stringify(image), Date.now(), id).run();
    const stored = await rowFor(env, row.uid, id);
    if (stored.status !== "ready") return fail(409, "image_save_unverified", "Read the image list to verify this upload.");
    return { image: metadata(stored), reused: false };
  } catch (error) {
    const stored = await rowFor(env, row.uid, id);
    if (stored.status === "ready") return { image: metadata(stored), reused: true };
    await Promise.all([env.AGENT_AVATARS!.delete(key(id)), env.AGENT_AVATARS!.delete(key(id, true))]);
    await db.prepare("UPDATE quest_images SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'uploading'").bind(Date.now(), id).run();
    throw error;
  }
}

export async function readQuestImage(env: WorkerEnv, identity: ImageIdentity, state: QuestForgeState, id: string, original = false) {
  scope(identity, "quests:read");
  const row = await rowFor(env, identity.uid, id);
  const image = metadata(row);
  getQuest(state, image.questId);
  if (!visible(image, state, identity.authType !== "oauth")) return fail(404, "quest_image_not_found", "Image not found.");
  if (row.status === "deleted") return fail(410, "quest_image_deleted", "This image was deleted.");
  if (row.status !== "ready") return fail(409, "quest_image_pending", "This upload has not completed.");
  const object = await env.AGENT_AVATARS!.get(key(id, !original));
  if (!object?.body) return fail(503, "image_bytes_unavailable", "The image is temporarily unavailable.");
  return { image, object, contentType: original ? image.contentType : "image/webp" };
}

export async function removeQuestImage(env: WorkerEnv, identity: ImageIdentity, state: QuestForgeState, input: JsonRecord) {
  scope(identity, "quests:write");
  const row = await rowFor(env, identity.uid, text(input.imageId, 120, true));
  const image = metadata(row);
  getQuest(state, image.questId);
  if (identity.authType === "oauth" && (image.context === "response" || image.createdBy.type !== "agent" || image.createdBy.id !== identity.agent?.agentId)) return fail(403, "image_owner_required", "Only the human or the uploading Agent may remove this image.");
  if (input.dryRun !== false) return { dryRun: true, image };
  if (row.status !== "deleted") {
    if (row.status !== "ready") return fail(409, "quest_image_pending", "Wait for the current upload to finish.");
    image.deletedAt = new Date().toISOString();
    await database(env).prepare("UPDATE quest_images SET status = 'deleted', metadata_json = ?, updated_at = ? WHERE id = ? AND uid = ? AND status = 'ready'").bind(JSON.stringify(image), Date.now(), image.id, identity.uid).run();
  }
  await Promise.all([env.AGENT_AVATARS!.delete(key(image.id)), env.AGENT_AVATARS!.delete(key(image.id, true))]);
  await database(env).prepare("UPDATE quest_images SET reserved_bytes = 0 WHERE id = ? AND status = 'deleted'").bind(image.id).run();
  return { dryRun: false, image };
}

export async function validateImageReferences(env: WorkerEnv, identity: ImageIdentity, state: QuestForgeState, questId: string, value: unknown, responseQuestId?: string): Promise<void> {
  let ids: string[];
  try { ids = imageIds(value); } catch { return fail(400, "invalid_image_references", "Use at most ten unique image IDs."); }
  for (const id of ids) {
    const row = await rowFor(env, identity.uid, id);
    const image = metadata(row);
    if (row.status !== "ready" || image.questId !== questId || (!responseQuestId && !visible(image, state, identity.authType !== "oauth"))) return fail(400, "invalid_image_references", "Choose saved images from this Quest.");
    if (responseQuestId && (image.context !== "response" || image.reviewQuestId !== responseQuestId || identity.authType === "oauth")) return fail(403, "human_response_required", "Choose this human request's response images.");
  }
}

export async function cleanupQuestImages(env: WorkerEnv): Promise<void> {
  if (!env.QUESTFORGE_DB || !env.AGENT_AVATARS) return;
  const rows = await env.QUESTFORGE_DB.prepare("SELECT * FROM quest_images WHERE (status IN ('pending','uploading') AND expires_at < ?) OR (status = 'deleted' AND reserved_bytes > 0) LIMIT 50").bind(Date.now() - 24 * 60 * 60 * 1000).all<Row>();
  for (const row of rows.results || []) {
    const claimed = await env.QUESTFORGE_DB.prepare("UPDATE quest_images SET status = 'deleted' WHERE id = ? AND status = ? AND updated_at = ?").bind(row.id, row.status, row.updated_at).run();
    if (!claimed.meta?.changes) continue;
    await Promise.all([env.AGENT_AVATARS.delete(key(row.id)), env.AGENT_AVATARS.delete(key(row.id, true))]);
    await env.QUESTFORGE_DB.prepare("UPDATE quest_images SET reserved_bytes = 0 WHERE id = ? AND status = 'deleted'").bind(row.id).run();
  }
}

/** Operator/account-deletion step: exact owner, bounded batches, resumable after partial R2 failure. */
export async function deleteOwnerQuestImages(env: WorkerEnv, uid: string) {
  const db = database(env);
  await db.prepare("UPDATE quest_images SET expires_at = 0 WHERE uid = ?").bind(uid).run();
  const active = await db.prepare("SELECT COUNT(*) AS n FROM quest_images WHERE uid = ? AND status = 'uploading'").bind(uid).first<{ n: number }>();
  if (active?.n) return fail(409, "image_upload_in_progress", "Uploads were revoked. Retry account deletion after in-flight uploads settle.");
  const rows = await db.prepare("SELECT * FROM quest_images WHERE uid = ? ORDER BY id LIMIT 50").bind(uid).all<Row>();
  for (const row of rows.results || []) {
    await db.prepare("UPDATE quest_images SET status = 'deleted' WHERE uid = ? AND id = ?").bind(uid, row.id).run();
    await Promise.all([env.AGENT_AVATARS!.delete(key(row.id)), env.AGENT_AVATARS!.delete(key(row.id, true))]);
    await db.prepare("DELETE FROM quest_images WHERE uid = ? AND id = ? AND status = 'deleted'").bind(uid, row.id).run();
  }
  const remaining = await db.prepare("SELECT COUNT(*) AS n FROM quest_images WHERE uid = ?").bind(uid).first<{ n: number }>();
  return { deleted: rows.results?.length || 0, remaining: remaining?.n || 0 };
}

export async function exportOwnerQuestImages(env: WorkerEnv, uid: string, cursor = "") {
  const rows = await database(env).prepare("SELECT * FROM quest_images WHERE uid = ? AND id > ? AND status = 'ready' ORDER BY id LIMIT 101").bind(uid, cursor).all<Row>();
  const page = (rows.results || []).slice(0, 100);
  return { format: "guilduo-quest-images", schemaVersion: 1, images: page.map(row => ({ image: metadata(row), originalKey: key(row.id), previewKey: key(row.id, true) })), nextCursor: (rows.results?.length || 0) > 100 ? page[99]!.id : null };
}

const IMAGE_RESULT = Symbol("quest-image");
export async function questImageToolPayload(value: Awaited<ReturnType<typeof readQuestImage>>) {
  return { [IMAGE_RESULT]: { image: value.image, contentType: value.contentType, bytes: new Uint8Array(await value.object.arrayBuffer()) } };
}

export function questImageToolResult(value: unknown) {
  if (!value || typeof value !== "object" || !(IMAGE_RESULT in value)) return null;
  const item = (value as Awaited<ReturnType<typeof questImageToolPayload>>)[IMAGE_RESULT];
  let binary = "";
  for (let offset = 0; offset < item.bytes.length; offset += 8192) binary += String.fromCharCode(...item.bytes.subarray(offset, offset + 8192));
  return { content: [{ type: "text" as const, text: JSON.stringify({ image: item.image }) }, { type: "image" as const, mimeType: item.contentType, data: btoa(binary) }], structuredContent: { image: item.image }, isError: false };
}
