import { randomToken, sha256 } from "./security.ts";
import type { JsonRecord, WorkerEnv, WorkerError } from "./worker-types.ts";

type SocialValue = string | number | boolean | null | undefined | SocialRow | SocialRow[];
type SocialRow = { [key: string]: SocialValue };
type SocialInput = JsonRecord;

export interface PublicProfile {
  uid: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarRole: string;
  avatarVariant: string;
  /** Kept as an empty compatibility field; image bytes are never embedded in profile JSON. */
  avatarUrl: string;
  hasCustomAvatar: boolean;
  avatarVersion: number;
  level: number;
}

export interface OwnProfile extends PublicProfile {
  handleChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileAvatarState {
  readonly assetId: string | null;
  readonly version: number;
}

export interface ProfileAvatarMutation {
  readonly profile: OwnProfile;
  readonly previousAssetId: string | null;
}

type FriendRequest = { id: string; senderUid: string; receiverUid: string; status: string; createdAt: string; updatedAt: string };
type Friendship = { userLow: string; userHigh: string; createdAt: string };
type PartyMember = PublicProfile & { role: string; joinedAt: string };
export type Party = { id: string; name: string; ownerUid: string; maxMembers: number; createdAt: string; updatedAt: string; members: PartyMember[] };
type StoredParty = Omit<Party, "members">;
type StoredMember = { partyId: string; uid: string; role: string; joinedAt: string };
type StoredInvite = { id: string; partyId: string; inviterUid: string; inviteeUid: string | null; tokenHash: string; status: string; expiresAt: string; createdAt: string; updatedAt: string };
type PublicInvite = { id: string; partyId: string; inviterUid: string; inviteeUid: string | null; status: string; expiresAt: string; createdAt: string; updatedAt: string };
type SocialMemory = {
  profiles: Map<string, SocialRow>;
  requests: Map<string, FriendRequest>;
  friendships: Map<string, Friendship>;
  parties: Map<string, StoredParty>;
  membersByUid: Map<string, StoredMember>;
  invites: Map<string, StoredInvite>;
};

const RESERVED_HANDLES = new Set(["admin", "api", "mcp", "questforge", "support", "system"]);
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
const HANDLE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let memoryByEnv = new WeakMap<object, SocialMemory>();

function socialError(status: number, code: string, message: string): WorkerError {
  return Object.assign(new Error(message), { status, code });
}

function nowDate(env: WorkerEnv): Date {
  return env?.SOCIAL_NOW ? new Date(env.SOCIAL_NOW) : new Date();
}

function nowIso(env: WorkerEnv): string {
  return nowDate(env).toISOString();
}

function memory(env: WorkerEnv): SocialMemory {
  if (!env || (typeof env !== "object" && typeof env !== "function")) {
    throw socialError(500, "social_env_invalid", "Social storage requires an environment object.");
  }
  if (!memoryByEnv.has(env)) {
    memoryByEnv.set(env, {
      profiles: new Map<string, SocialRow>(),
      requests: new Map<string, FriendRequest>(),
      friendships: new Map<string, Friendship>(),
      parties: new Map<string, StoredParty>(),
      membersByUid: new Map<string, StoredMember>(),
      invites: new Map<string, StoredInvite>(),
    });
  }
  return memoryByEnv.get(env) as SocialMemory;
}

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairKey(a: string, b: string): string {
  return canonicalPair(a, b).join(":");
}

function cleanString(value: unknown, maxLength: number, field: string, { required = false }: { required?: boolean } = {}): string {
  const result = String(value ?? "").trim();
  if (required && !result) throw socialError(400, `${field}_required`, `${field} is required.`);
  if (result.length > maxLength) throw socialError(400, `${field}_too_long`, `${field} is too long.`);
  return result;
}

function asRow(value: unknown): SocialRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SocialRow : {};
}

function publicProfile(row: unknown): PublicProfile | null {
  if (!row || typeof row !== "object") return null;
  const item = asRow(row);
  const handle = String(item.handle || "");
  const assetId = String(item.avatar_asset_id ?? item.avatarAssetId ?? "").trim();
  const rawVersion = Number(item.avatar_version ?? item.avatarVersion ?? 0);
  const avatarVersion = Number.isSafeInteger(rawVersion) && rawVersion > 0 ? rawVersion : 0;
  return {
    uid: String(item.uid || ""),
    displayName: String(item.display_name ?? item.displayName ?? ""),
    handle: handle ? `@${handle.replace(/^@/, "")}` : "",
    bio: String(item.bio || ""),
    avatarRole: String(item.avatar_role ?? item.avatarRole ?? "sentinel"),
    avatarVariant: String(item.avatar_variant ?? item.avatarVariant ?? "femme"),
    // Legacy data URLs may still exist in old rows, but are intentionally not
    // emitted. Image bytes are fetched only through the authenticated avatar
    // route using the version and the private R2 asset reference.
    avatarUrl: "",
    hasCustomAvatar: Boolean(assetId && avatarVersion > 0),
    avatarVersion,
    level: Number(item.level || 1),
  };
}

function ownProfile(row: unknown): OwnProfile | null {
  const result = publicProfile(row);
  if (!result) return null;
  const item = asRow(row);
  return {
    ...result,
    handleChangedAt: String(item.handle_changed_at ?? item.handleChangedAt ?? ""),
    createdAt: String(item.created_at ?? item.createdAt ?? ""),
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ""),
  };
}

interface FriendRequestSummary extends JsonRecord {
  id: string;
  direction: string;
  senderUid: string;
  receiverUid: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  profile: PublicProfile | null;
}

function normalizeRequest(row: unknown, uid: string, counterpart: PublicProfile | null): FriendRequestSummary {
  const item = asRow(row);
  return {
    id: String(item.id || ""),
    direction: item.sender_uid === uid || item.senderUid === uid ? "outgoing" : "incoming",
    senderUid: String(item.sender_uid ?? item.senderUid ?? ""),
    receiverUid: String(item.receiver_uid ?? item.receiverUid ?? ""),
    status: String(item.status || ""),
    createdAt: String(item.created_at ?? item.createdAt ?? ""),
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ""),
    profile: publicProfile(counterpart),
  };
}

function publicInvite(row: unknown): PublicInvite {
  const item = asRow(row);
  return {
    id: String(item.id || ""),
    partyId: String(item.party_id ?? item.partyId ?? ""),
    inviterUid: String(item.inviter_uid ?? item.inviterUid ?? ""),
    inviteeUid: item.invitee_uid !== undefined && item.invitee_uid !== null
      ? String(item.invitee_uid)
      : item.inviteeUid !== undefined && item.inviteeUid !== null ? String(item.inviteeUid) : null,
    status: String(item.status || ""),
    expiresAt: String(item.expires_at ?? item.expiresAt ?? ""),
    createdAt: String(item.created_at ?? item.createdAt ?? ""),
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ""),
  };
}

async function requireProfile(env: WorkerEnv, uid: string): Promise<PublicProfile> {
  const profile = await getPublicProfile(env, uid);
  if (!profile) throw socialError(404, "profile_not_found", "Profile was not found.");
  return profile;
}

export function normalizeHandle(value: unknown): string {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export function isReservedHandle(value: unknown): boolean {
  return RESERVED_HANDLES.has(normalizeHandle(value));
}

export function validateHandle(value: unknown): string {
  const handle = normalizeHandle(value);
  if (!HANDLE_PATTERN.test(handle)) {
    throw socialError(400, "handle_invalid", "Handle must be 3-20 lowercase letters, numbers, or underscores.");
  }
  if (isReservedHandle(handle)) throw socialError(400, "handle_reserved", "This handle is reserved.");
  return handle;
}

async function storedProfileRow(env: WorkerEnv, uid: string): Promise<SocialRow | null> {
  if (env.QUESTFORGE_DB) {
    return env.QUESTFORGE_DB.prepare("SELECT * FROM social_profiles WHERE uid = ?").bind(uid).first<SocialRow>();
  }
  const row = memory(env).profiles.get(uid);
  return row ? { ...row } : null;
}

function profileAvatarState(row: SocialRow | null): ProfileAvatarState | null {
  if (!row) return null;
  const assetId = String(row.avatar_asset_id ?? row.avatarAssetId ?? "").trim();
  const rawVersion = Number(row.avatar_version ?? row.avatarVersion ?? 0);
  return {
    assetId: assetId || null,
    version: Number.isSafeInteger(rawVersion) && rawVersion > 0 ? rawVersion : 0,
  };
}

export async function getOwnProfile(env: WorkerEnv, uid: string): Promise<OwnProfile | null> {
  return ownProfile(await storedProfileRow(env, uid));
}

export async function getPublicProfile(env: WorkerEnv, uid: string): Promise<PublicProfile | null> {
  return publicProfile(await storedProfileRow(env, uid));
}

export async function findProfileByHandle(env: WorkerEnv, value: unknown): Promise<PublicProfile | null> {
  const handle = validateHandle(value);
  if (env.QUESTFORGE_DB) {
    return publicProfile(await env.QUESTFORGE_DB.prepare("SELECT * FROM social_profiles WHERE handle = ? COLLATE NOCASE").bind(handle).first());
  }
  return publicProfile([...memory(env).profiles.values()].find((profile) => String(profile.handle || "").toLowerCase() === handle));
}

export async function getOwnProfileAvatarState(env: WorkerEnv, uid: string): Promise<ProfileAvatarState | null> {
  return profileAvatarState(await storedProfileRow(env, uid));
}

async function mutateProfileAvatar(env: WorkerEnv, uid: string, assetId: string | null): Promise<ProfileAvatarMutation> {
  const before = await storedProfileRow(env, uid);
  const previousState = profileAvatarState(before);
  if (!previousState) throw socialError(404, "profile_not_found", "Profile was not found. Save your profile before adding an avatar.");
  if (previousState.version >= Number.MAX_SAFE_INTEGER) {
    throw socialError(409, "avatar_version_exhausted", "Avatar version could not be advanced safely.");
  }
  const updatedAt = nowIso(env);

  if (env.QUESTFORGE_DB) {
    const result = await env.QUESTFORGE_DB.prepare(`UPDATE social_profiles
      SET avatar_asset_id = ?, avatar_version = avatar_version + 1, avatar_url = '', updated_at = ?
      WHERE uid = ? AND avatar_version = ?`).bind(assetId, updatedAt, uid, previousState.version).run();
    if (Number(result.meta?.changes || 0) !== 1) throw socialError(409, "profile_avatar_conflict", "Profile Avatar changed elsewhere. Reload and try again.");
  } else {
    const row = memory(env).profiles.get(uid);
    if (!row) throw socialError(404, "profile_not_found", "Profile was not found.");
    const currentVersion = Number(row.avatarVersion ?? row.avatar_version ?? 0);
    if (!Number.isSafeInteger(currentVersion) || currentVersion >= Number.MAX_SAFE_INTEGER) {
      throw socialError(409, "avatar_version_exhausted", "Avatar version could not be advanced safely.");
    }
    if (currentVersion !== previousState.version) throw socialError(409, "profile_avatar_conflict", "Profile Avatar changed elsewhere. Reload and try again.");
    row.avatarAssetId = assetId;
    row.avatar_asset_id = assetId;
    row.avatarVersion = currentVersion + 1;
    row.avatar_version = currentVersion + 1;
    row.avatarUrl = "";
    row.avatar_url = "";
    row.updatedAt = updatedAt;
    row.updated_at = updatedAt;
  }
  const profile = await getOwnProfile(env, uid);
  if (!profile) throw socialError(404, "profile_not_found", "Profile was not found.");
  return { profile, previousAssetId: previousState.assetId };
}

export function activateProfileAvatar(env: WorkerEnv, uid: string, assetId: string): Promise<ProfileAvatarMutation> {
  const normalizedAssetId = String(assetId || "").trim();
  if (!normalizedAssetId || normalizedAssetId.length > 120 || /[\\/]/.test(normalizedAssetId)) {
    return Promise.reject(socialError(400, "avatar_asset_invalid", "Avatar asset is invalid."));
  }
  return mutateProfileAvatar(env, uid, normalizedAssetId);
}

export function removeProfileAvatar(env: WorkerEnv, uid: string): Promise<ProfileAvatarMutation> {
  return mutateProfileAvatar(env, uid, null);
}

export async function upsertProfile(env: WorkerEnv, uid: string, patch: SocialInput = {}): Promise<OwnProfile | null> {
  const allowedFields = new Set(["displayName", "handle", "bio", "avatarRole", "avatarVariant", "level"]);
  for (const key of Object.keys(patch)) {
    if (key === "avatarUrl") throw socialError(400, "avatar_url_unsupported", "Avatar images must be uploaded through /v1/profile/avatar.");
    if (!allowedFields.has(key)) throw socialError(400, "profile_field_invalid", `Unsupported profile field: ${key}.`);
  }
  const previous = await getOwnProfile(env, uid);
  const handle = patch.handle === undefined && previous ? normalizeHandle(previous.handle) : validateHandle(patch.handle);
  const displayName = patch.displayName === undefined && previous
    ? previous.displayName
    : cleanString(patch.displayName, 60, "display_name", { required: true });
  const bio = patch.bio === undefined ? previous?.bio || "" : cleanString(patch.bio, 160, "bio");
  const avatarRole = patch.avatarRole === undefined ? previous?.avatarRole || "sentinel" : cleanString(patch.avatarRole, 40, "avatar_role", { required: true });
  const avatarVariant = patch.avatarVariant === undefined ? previous?.avatarVariant || "femme" : cleanString(patch.avatarVariant, 40, "avatar_variant", { required: true });
  const level = patch.level === undefined ? previous?.level || 1 : Number(patch.level);
  if (!Number.isInteger(level) || level < 1) throw socialError(400, "level_invalid", "Level must be a positive integer.");

  const changedHandle = Boolean(previous && normalizeHandle(previous.handle) !== handle);
  const now = nowDate(env);
  if (previous && changedHandle && previous.handleChangedAt && now.getTime() - new Date(previous.handleChangedAt).getTime() < HANDLE_COOLDOWN_MS) {
    throw socialError(409, "handle_cooldown", "Handle can only be changed once every 30 days.");
  }
  const createdAt = previous?.createdAt || now.toISOString();
  const handleChangedAt = previous && !changedHandle ? previous.handleChangedAt : now.toISOString();
  const updatedAt = now.toISOString();

  if (env.QUESTFORGE_DB) {
    const owner = await env.QUESTFORGE_DB.prepare("SELECT uid FROM social_profiles WHERE handle = ? COLLATE NOCASE AND uid <> ?").bind(handle, uid).first();
    if (owner) throw socialError(409, "handle_taken", "This handle is already in use.");
    try {
      await env.QUESTFORGE_DB.prepare(`INSERT INTO social_profiles
        (uid, display_name, handle, bio, avatar_role, avatar_variant, avatar_url, avatar_version, avatar_asset_id, level, handle_changed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '', 0, NULL, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET display_name=excluded.display_name, handle=excluded.handle, bio=excluded.bio,
          avatar_role=excluded.avatar_role, avatar_variant=excluded.avatar_variant, level=excluded.level,
          handle_changed_at=excluded.handle_changed_at, updated_at=excluded.updated_at`)
        .bind(uid, displayName, handle, bio, avatarRole, avatarVariant, level, handleChangedAt, createdAt, updatedAt).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (/unique/i.test(message)) throw socialError(409, "handle_taken", "This handle is already in use.");
      throw error;
    }
  } else {
    const store = memory(env);
    const owner = [...store.profiles.values()].find((profile) => profile.uid !== uid && String(profile.handle || "").toLowerCase() === handle);
    if (owner) throw socialError(409, "handle_taken", "This handle is already in use.");
    const current = store.profiles.get(uid);
    store.profiles.set(uid, {
      ...(current || {}),
      uid, displayName, handle, bio, avatarRole, avatarVariant, avatarUrl: "",
      avatarAssetId: current?.avatarAssetId ?? null,
      avatarVersion: current?.avatarVersion ?? 0,
      handleChangedAt, createdAt, updatedAt,
    });
  }
  return getOwnProfile(env, uid);
}

export async function sendFriendRequest(env: WorkerEnv, senderUid: string, receiverUid: string): Promise<FriendRequestSummary> {
  if (senderUid === receiverUid) throw socialError(400, "friend_self", "You cannot send a friend request to yourself.");
  await requireProfile(env, senderUid);
  await requireProfile(env, receiverUid);
  const [low, high] = canonicalPair(senderUid, receiverUid);
  if (env.QUESTFORGE_DB) {
    if (await env.QUESTFORGE_DB.prepare("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?").bind(low, high).first()) {
      throw socialError(409, "already_friends", "You are already friends.");
    }
    if (await env.QUESTFORGE_DB.prepare("SELECT 1 FROM friend_requests WHERE status = 'pending' AND ((sender_uid = ? AND receiver_uid = ?) OR (sender_uid = ? AND receiver_uid = ?))")
      .bind(senderUid, receiverUid, receiverUid, senderUid).first()) {
      throw socialError(409, "friend_request_pending", "A friend request is already pending.");
    }
  } else {
    const store = memory(env);
    if (store.friendships.has(pairKey(senderUid, receiverUid))) throw socialError(409, "already_friends", "You are already friends.");
    if ([...store.requests.values()].some((request) => request.status === "pending" && new Set([request.senderUid, request.receiverUid]).has(senderUid) && new Set([request.senderUid, request.receiverUid]).has(receiverUid))) {
      throw socialError(409, "friend_request_pending", "A friend request is already pending.");
    }
  }
  const id = randomToken("friend");
  const createdAt = nowIso(env);
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("INSERT INTO friend_requests (id, sender_uid, receiver_uid, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
      .bind(id, senderUid, receiverUid, createdAt, createdAt).run();
  } else memory(env).requests.set(id, { id, senderUid, receiverUid, status: "pending", createdAt, updatedAt: createdAt });
  const counterpart = await getPublicProfile(env, receiverUid);
  return normalizeRequest({ id, senderUid, receiverUid, status: "pending", createdAt, updatedAt: createdAt }, senderUid, counterpart);
}

export async function listFriendRequests(env: WorkerEnv, uid: string): Promise<FriendRequestSummary[]> {
  if (env.QUESTFORGE_DB) {
    const rows = (await env.QUESTFORGE_DB.prepare(`SELECT r.*, p.uid AS p_uid, p.display_name AS p_display_name, p.handle AS p_handle,
      p.bio AS p_bio, p.avatar_role AS p_avatar_role, p.avatar_variant AS p_avatar_variant, p.avatar_url AS p_avatar_url,
      p.avatar_version AS p_avatar_version, p.avatar_asset_id AS p_avatar_asset_id, p.level AS p_level
      FROM friend_requests r JOIN social_profiles p ON p.uid = CASE WHEN r.sender_uid = ? THEN r.receiver_uid ELSE r.sender_uid END
      WHERE (r.sender_uid = ? OR r.receiver_uid = ?) AND r.status = 'pending' ORDER BY r.created_at DESC`).bind(uid, uid, uid).all<SocialRow>()).results || [];
    return rows.map((row: SocialRow) => normalizeRequest(row, uid, publicProfile({
      uid: row.p_uid, display_name: row.p_display_name, handle: row.p_handle, bio: row.p_bio,
      avatar_role: row.p_avatar_role, avatar_variant: row.p_avatar_variant, avatar_url: row.p_avatar_url,
      avatar_version: row.p_avatar_version, avatar_asset_id: row.p_avatar_asset_id, level: row.p_level,
    })));
  }
  const store = memory(env);
  return [...store.requests.values()]
    .filter((request) => request.status === "pending" && (request.senderUid === uid || request.receiverUid === uid))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((request) => normalizeRequest(request, uid, publicProfile(store.profiles.get(request.senderUid === uid ? request.receiverUid : request.senderUid) || null)));
}

function decideFriendRequest(env: WorkerEnv, uid: string, requestId: string, status: "accepted"): Promise<PublicProfile[]>;
function decideFriendRequest(env: WorkerEnv, uid: string, requestId: string, status: "declined"): Promise<JsonRecord[]>;
async function decideFriendRequest(env: WorkerEnv, uid: string, requestId: string, status: "accepted" | "declined"): Promise<PublicProfile[] | JsonRecord[]> {
  if (env.QUESTFORGE_DB) {
    const request = await env.QUESTFORGE_DB.prepare("SELECT * FROM friend_requests WHERE id = ?").bind(requestId).first<SocialRow>();
    if (!request) throw socialError(404, "friend_request_not_found", "Friend request was not found.");
    if (String(request.receiver_uid) !== uid) throw socialError(403, "friend_request_forbidden", "Only the receiver can respond to this request.");
    if (String(request.status) !== "pending") throw socialError(409, "friend_request_closed", "Friend request is no longer pending.");
    const updatedAt = nowIso(env);
    if (status === "accepted") {
      const [low, high] = canonicalPair(String(request.sender_uid), String(request.receiver_uid));
      try {
        await env.QUESTFORGE_DB.batch([
          env.QUESTFORGE_DB.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ? AND receiver_uid = ? AND status = 'pending'").bind(updatedAt, requestId, uid),
          env.QUESTFORGE_DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)").bind(low, high, updatedAt),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (/unique/i.test(message)) throw socialError(409, "already_friends", "You are already friends.");
        throw error;
      }
    } else {
      const result = await env.QUESTFORGE_DB.prepare("UPDATE friend_requests SET status = 'declined', updated_at = ? WHERE id = ? AND receiver_uid = ? AND status = 'pending'")
        .bind(updatedAt, requestId, uid).run();
      if (Number(result.meta?.changes || 0) !== 1) throw socialError(409, "friend_request_closed", "Friend request is no longer pending.");
    }
  } else {
    const store = memory(env);
    const request = store.requests.get(requestId);
    if (!request) throw socialError(404, "friend_request_not_found", "Friend request was not found.");
    if (request.receiverUid !== uid) throw socialError(403, "friend_request_forbidden", "Only the receiver can respond to this request.");
    if (request.status !== "pending") throw socialError(409, "friend_request_closed", "Friend request is no longer pending.");
    request.status = status;
    request.updatedAt = nowIso(env);
    if (status === "accepted") store.friendships.set(pairKey(request.senderUid, request.receiverUid), { userLow: canonicalPair(request.senderUid, request.receiverUid)[0], userHigh: canonicalPair(request.senderUid, request.receiverUid)[1], createdAt: request.updatedAt });
  }
  return status === "accepted" ? listFriends(env, uid) : listFriendRequests(env, uid);
}

export function acceptFriendRequest(env: WorkerEnv, uid: string, requestId: string): Promise<PublicProfile[]> {
  return decideFriendRequest(env, uid, requestId, "accepted");
}

export function declineFriendRequest(env: WorkerEnv, uid: string, requestId: string): Promise<JsonRecord[]> {
  return decideFriendRequest(env, uid, requestId, "declined");
}

export async function listFriends(env: WorkerEnv, uid: string): Promise<PublicProfile[]> {
  if (env.QUESTFORGE_DB) {
    const rows = (await env.QUESTFORGE_DB.prepare(`SELECT p.* FROM friendships f JOIN social_profiles p
      ON p.uid = CASE WHEN f.user_low = ? THEN f.user_high ELSE f.user_low END
      WHERE f.user_low = ? OR f.user_high = ? ORDER BY p.display_name COLLATE NOCASE`).bind(uid, uid, uid).all<SocialRow>()).results || [];
    return rows.map((row: SocialRow) => publicProfile(row)).filter((profile): profile is PublicProfile => Boolean(profile));
  }
  const store = memory(env);
  const ids = [...store.friendships.values()].filter((friendship) => friendship.userLow === uid || friendship.userHigh === uid)
    .map((friendship) => friendship.userLow === uid ? friendship.userHigh : friendship.userLow);
  return ids.map((id) => publicProfile(store.profiles.get(id) || null)).filter((profile): profile is PublicProfile => Boolean(profile)).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function removeFriend(env: WorkerEnv, uid: string, friendUid: string): Promise<JsonRecord> {
  const [low, high] = canonicalPair(uid, friendUid);
  if (env.QUESTFORGE_DB) {
    const result = await env.QUESTFORGE_DB.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?").bind(low, high).run();
    if (Number(result.meta?.changes || 0) !== 1) throw socialError(404, "friendship_not_found", "Friendship was not found.");
  } else if (!memory(env).friendships.delete(pairKey(uid, friendUid))) {
    throw socialError(404, "friendship_not_found", "Friendship was not found.");
  }
  return { removed: true, friendUid };
}

export async function createParty(env: WorkerEnv, uid: string, input: SocialInput = {}): Promise<Party | null> {
  await requireProfile(env, uid);
  if (await getParty(env, uid)) throw socialError(409, "party_membership_exists", "You already belong to a party.");
  const name = cleanString(input.name, 40, "party_name", { required: true });
  const id = randomToken("party");
  const createdAt = nowIso(env);
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.batch([
      env.QUESTFORGE_DB.prepare("INSERT INTO parties (id, name, owner_uid, max_members, created_at, updated_at) VALUES (?, ?, ?, 4, ?, ?)").bind(id, name, uid, createdAt, createdAt),
      env.QUESTFORGE_DB.prepare("INSERT INTO party_members (party_id, uid, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(id, uid, createdAt),
    ]);
  } else {
    const store = memory(env);
    store.parties.set(id, { id, name, ownerUid: uid, maxMembers: 4, createdAt, updatedAt: createdAt });
    store.membersByUid.set(uid, { partyId: id, uid, role: "owner", joinedAt: createdAt });
  }
  return getParty(env, uid);
}

export async function getParty(env: WorkerEnv, uid: string): Promise<Party | null> {
  if (env.QUESTFORGE_DB) {
    const party = await env.QUESTFORGE_DB.prepare(`SELECT p.* FROM parties p JOIN party_members m ON m.party_id = p.id WHERE m.uid = ?`).bind(uid).first<SocialRow>();
    if (!party) return null;
    const rows = (await env.QUESTFORGE_DB.prepare(`SELECT m.role, m.joined_at, p.* FROM party_members m JOIN social_profiles p ON p.uid = m.uid
      WHERE m.party_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.joined_at`).bind(String(party.id)).all<SocialRow>()).results || [];
    return {
      id: String(party.id || ""), name: String(party.name || ""), ownerUid: String(party.owner_uid || ""), maxMembers: Number(party.max_members),
      createdAt: String(party.created_at || ""), updatedAt: String(party.updated_at || ""),
      members: rows.map((row: SocialRow) => {
        const profile = publicProfile(row);
        if (!profile) throw socialError(500, "party_profile_invalid", "Party member profile is invalid.");
        return { ...profile, role: String(row.role || "member"), joinedAt: String(row.joined_at || "") };
      }),
    };
  }
  const store = memory(env);
  const membership = store.membersByUid.get(uid);
  if (!membership) return null;
  const party = store.parties.get(membership.partyId);
  if (!party) return null;
  const members = [...store.membersByUid.values()].filter((item) => item.partyId === party.id)
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.joinedAt.localeCompare(b.joinedAt)))
    .map((item) => {
      const profile = publicProfile(store.profiles.get(item.uid) || null);
      if (!profile) throw socialError(500, "party_profile_invalid", "Party member profile is invalid.");
      return { ...profile, role: item.role, joinedAt: item.joinedAt };
    });
  return { ...party, members };
}

export async function inviteToParty(env: WorkerEnv, uid: string, input: SocialInput = {}): Promise<{ invite: PublicInvite; token: string }> {
  const party = await getParty(env, uid);
  if (!party) throw socialError(404, "party_not_found", "Party was not found.");
  if (party.ownerUid !== uid) throw socialError(403, "party_owner_required", "Only the party owner can invite members.");
  if (party.members.length >= party.maxMembers) throw socialError(409, "party_full", "Party is full.");
  const inviteeUid = input.inviteeUid ? String(input.inviteeUid) : null;
  if (inviteeUid) {
    await requireProfile(env, inviteeUid);
    if (party.members.some((member) => member.uid === inviteeUid)) throw socialError(409, "party_member_exists", "This user is already in the party.");
  }
  const token = randomToken("party_invite");
  const tokenHash = await sha256(token);
  const id = randomToken("invite");
  const createdAt = nowIso(env);
  const expiresAt = new Date(nowDate(env).getTime() + INVITE_TTL_MS).toISOString();
  const row = { id, partyId: party.id, inviterUid: uid, inviteeUid, tokenHash, status: "pending", expiresAt, createdAt, updatedAt: createdAt };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO party_invites
      (id, party_id, inviter_uid, invitee_uid, token_hash, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).bind(id, party.id, uid, inviteeUid, tokenHash, expiresAt, createdAt, createdAt).run();
  } else memory(env).invites.set(id, row);
  return { invite: publicInvite(row), token };
}

async function findInvite(env: WorkerEnv, input: SocialInput = {}): Promise<SocialRow | StoredInvite | null> {
  const id = input.inviteId ? String(input.inviteId) : "";
  const tokenHash = input.token ? await sha256(String(input.token)) : "";
  if (!id && !tokenHash) throw socialError(400, "party_invite_required", "Invite ID or token is required.");
  if (env.QUESTFORGE_DB) {
    return env.QUESTFORGE_DB.prepare(`SELECT * FROM party_invites WHERE ${id ? "id = ?" : "token_hash = ?"}`).bind(id || tokenHash).first<SocialRow>();
  }
  return id ? memory(env).invites.get(id) ?? null : [...memory(env).invites.values()].find((invite) => invite.tokenHash === tokenHash) ?? null;
}

export async function acceptPartyInvite(env: WorkerEnv, uid: string, input: SocialInput = {}): Promise<Party | null> {
  await requireProfile(env, uid);
  if (await getParty(env, uid)) throw socialError(409, "party_membership_exists", "You already belong to a party.");
  const invite = await findInvite(env, input);
  if (!invite) throw socialError(404, "party_invite_not_found", "Party invite was not found.");
  const normalized = publicInvite(invite);
  if (normalized.status !== "pending") throw socialError(409, "party_invite_closed", "Party invite is no longer pending.");
  if (normalized.inviteeUid && normalized.inviteeUid !== uid) throw socialError(403, "party_invite_forbidden", "This invite belongs to another user.");
  if (new Date(normalized.expiresAt).getTime() <= nowDate(env).getTime()) {
    if (env.QUESTFORGE_DB) await env.QUESTFORGE_DB.prepare("UPDATE party_invites SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(env), normalized.id).run();
    else {
      const memoryInvite = invite as StoredInvite;
      memoryInvite.status = "expired";
      memoryInvite.updatedAt = nowIso(env);
    }
    throw socialError(410, "party_invite_expired", "Party invite has expired.");
  }
  const partyId = normalized.partyId;
  const joinedAt = nowIso(env);
  if (env.QUESTFORGE_DB) {
    try {
      const results = await env.QUESTFORGE_DB.batch([
        env.QUESTFORGE_DB.prepare("UPDATE party_invites SET status = 'accepted', updated_at = ? WHERE id = ? AND status = 'pending'").bind(joinedAt, normalized.id),
        env.QUESTFORGE_DB.prepare(`INSERT INTO party_members (party_id, uid, role, joined_at)
          SELECT ?, ?, 'member', ? WHERE EXISTS (
            SELECT 1 FROM party_invites WHERE id = ? AND status = 'accepted' AND updated_at = ?
          )`).bind(partyId, uid, joinedAt, normalized.id, joinedAt),
      ]);
      const batchResults = Array.isArray(results) ? results as Array<{ meta?: { changes?: number } }> : [];
      if (Number(batchResults[0]?.meta?.changes || 0) !== 1 || Number(batchResults[1]?.meta?.changes || 0) !== 1) {
        throw socialError(409, "party_invite_closed", "Party invite is no longer pending.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (/party_full/i.test(message)) throw socialError(409, "party_full", "Party is full.");
      if (/unique/i.test(message)) throw socialError(409, "party_membership_exists", "You already belong to a party.");
      throw error;
    }
  } else {
    const store = memory(env);
    const party = store.parties.get(partyId);
    if (!party) throw socialError(404, "party_not_found", "Party was not found.");
    const count = [...store.membersByUid.values()].filter((member) => member.partyId === partyId).length;
    if (count >= party.maxMembers) throw socialError(409, "party_full", "Party is full.");
    store.membersByUid.set(uid, { partyId, uid, role: "member", joinedAt });
    const memoryInvite = invite as StoredInvite;
    memoryInvite.status = "accepted";
    memoryInvite.updatedAt = joinedAt;
  }
  return getParty(env, uid);
}

export async function leaveParty(env: WorkerEnv, uid: string): Promise<{ left: boolean; partyId: string; nextOwnerUid: string | null }> {
  const party = await getParty(env, uid);
  if (!party) throw socialError(404, "party_not_found", "Party was not found.");
  const remaining = party.members.filter((member) => member.uid !== uid);
  const updatedAt = nowIso(env);
  if (env.QUESTFORGE_DB) {
    if (party.ownerUid === uid && remaining.length) {
      const nextOwner = remaining.slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
      await env.QUESTFORGE_DB.batch([
        env.QUESTFORGE_DB.prepare("UPDATE parties SET owner_uid = ?, updated_at = ? WHERE id = ? AND owner_uid = ?").bind(nextOwner.uid, updatedAt, party.id, uid),
        env.QUESTFORGE_DB.prepare("UPDATE party_members SET role = 'owner' WHERE party_id = ? AND uid = ?").bind(party.id, nextOwner.uid),
        env.QUESTFORGE_DB.prepare("DELETE FROM party_members WHERE party_id = ? AND uid = ?").bind(party.id, uid),
      ]);
    } else if (party.ownerUid === uid) {
      await env.QUESTFORGE_DB.batch([
        env.QUESTFORGE_DB.prepare("UPDATE party_invites SET status = 'revoked', updated_at = ? WHERE party_id = ? AND status = 'pending'").bind(updatedAt, party.id),
        env.QUESTFORGE_DB.prepare("DELETE FROM party_invites WHERE party_id = ?").bind(party.id),
        env.QUESTFORGE_DB.prepare("DELETE FROM party_members WHERE party_id = ? AND uid = ?").bind(party.id, uid),
        env.QUESTFORGE_DB.prepare("DELETE FROM parties WHERE id = ? AND owner_uid = ?").bind(party.id, uid),
      ]);
    } else {
      const result = await env.QUESTFORGE_DB.prepare("DELETE FROM party_members WHERE party_id = ? AND uid = ?").bind(party.id, uid).run();
      if (Number(result.meta?.changes || 0) !== 1) throw socialError(409, "party_membership_changed", "Party membership changed. Please retry.");
    }
  } else {
    const store = memory(env);
    store.membersByUid.delete(uid);
    if (party.ownerUid === uid && remaining.length) {
      const nextOwner = remaining.slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
      if (!nextOwner) throw socialError(500, "party_owner_missing", "A next party owner could not be selected.");
      const storedMember = store.membersByUid.get(nextOwner.uid);
      if (!storedMember) throw socialError(500, "party_member_missing", "The next party owner is missing.");
      storedMember.role = "owner";
      const storedParty = store.parties.get(party.id);
      if (!storedParty) throw socialError(500, "party_missing", "The party is missing.");
      storedParty.ownerUid = nextOwner.uid;
      storedParty.updatedAt = updatedAt;
    } else if (party.ownerUid === uid) {
      store.parties.delete(party.id);
      for (const invite of store.invites.values()) if (invite.partyId === party.id && invite.status === "pending") { invite.status = "revoked"; invite.updatedAt = updatedAt; }
    }
  }
  return { left: true, partyId: party.id, nextOwnerUid: remaining.length && party.ownerUid === uid ? remaining.slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0].uid : null };
}

export async function removePartyMember(env: WorkerEnv, uid: string, memberUid: string): Promise<Party | null> {
  const party = await getParty(env, uid);
  if (!party) throw socialError(404, "party_not_found", "Party was not found.");
  if (party.ownerUid !== uid) throw socialError(403, "party_owner_required", "Only the party owner can remove members.");
  if (memberUid === uid) throw socialError(400, "party_owner_remove_self", "Use leave party to transfer ownership.");
  if (!party.members.some((member) => member.uid === memberUid)) throw socialError(404, "party_member_not_found", "Party member was not found.");
  if (env.QUESTFORGE_DB) {
    const result = await env.QUESTFORGE_DB.prepare("DELETE FROM party_members WHERE party_id = ? AND uid = ? AND role = 'member'").bind(party.id, memberUid).run();
    if (Number(result.meta?.changes || 0) !== 1) throw socialError(409, "party_membership_changed", "Party membership changed. Please retry.");
  } else memory(env).membersByUid.delete(memberUid);
  return getParty(env, uid);
}

export function resetSocialMemoryForTests() {
  memoryByEnv = new WeakMap();
}
