import type { JsonRecord, WorkerEnv, WorkerError } from "./worker-types.ts";

type AgentStatus = "active" | "disabled" | "archived";
type HandoffState = "none" | "ready" | "working" | "blocked" | "review_required" | "accepted";

export interface AgentRecord {
  uid: string;
  agentId: string;
  displayName: string;
  provider: string;
  role: string;
  instructions: string;
  status: AgentStatus;
  allowedScopes: string[];
  defaultHandoffState: HandoffState | string;
  reviewRequired: boolean;
  dryRunDefault: boolean;
  createdAt: string;
  updatedAt: string;
  /** Metadata only — the image bytes live in `agent-avatar-store.ts`, not D1. */
  avatarVersion: number;
  hasCustomAvatar: boolean;
  /** The R2 key suffix of the currently-active avatar asset, or `null`. Never serialized in any API response — see `toPublicAgent` in index.ts. */
  avatarAssetId: string | null;
  /**
   * Monotonic CAS guard, always advancing by exactly 1 on every successful
   * write. `updatedAt` alone cannot serve this role: two writes landing in
   * the same millisecond can compute an identical "new" timestamp, so a
   * losing writer's WHERE clause can still match after the winner commits.
   * Internal only — never serialized in any API response, same as
   * `avatarAssetId` (see `toPublicAgent` in index.ts).
   */
  revision: number;
}

export interface AgentConnectionRecord {
  clientId: string;
  uid: string;
  agentId: string;
  clientName: string;
  scopes: string[];
  firstConnectedAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type AgentInput = JsonRecord;
type AgentMemory = {
  agents: Map<string, AgentRecord>;
  connections: Map<string, AgentConnectionRecord>;
};

const MAX_AGENTS = 20;
const AGENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const AGENT_STATUSES = new Set(["active", "disabled", "archived"]);
const HANDOFF_STATES = new Set(["none", "ready", "working", "blocked", "review_required", "accepted"]);
const ALLOWED_AGENT_SCOPES = new Set([
  "quests:read", "quests:write", "character:read", "rewards:write",
  "integrations:read", "integrations:sync", "events:read", "profiles:read",
  "friends:read", "friends:write", "parties:read", "parties:write",
  "battle:read", "battle:write", "agents:read",
  "profiles:write", "webhooks:manage", "plugins:manage",
]);
const ALLOWED_CONNECTION_SCOPES = new Set([...ALLOWED_AGENT_SCOPES, "agents:write"]);
const SECRET_KEY_PATTERN = /(token|secret|password|passwd|apikey|webhook|endpoint|credential)/i;

const CREATE_AGENT_KEYS = [
  "agentId", "displayName", "provider", "role", "instructions", "status",
  "allowedScopes", "defaultHandoffState", "reviewRequired", "dryRunDefault",
];
const UPDATE_AGENT_KEYS = [
  "displayName", "provider", "role", "instructions", "status",
  "allowedScopes", "defaultHandoffState", "reviewRequired", "dryRunDefault", "expectedUpdatedAt",
];
const LINK_CONNECTION_KEYS = ["clientId", "clientName", "scopes", "firstConnectedAt", "lastUsedAt"];

let memoryByEnv = new WeakMap<object, AgentMemory>();

function agentError(status: number, code: string, message: string): WorkerError {
  return Object.assign(new Error(message), { status, code });
}

function nowDate(env: WorkerEnv): Date {
  return env?.AGENT_NOW ? new Date(env.AGENT_NOW) : new Date();
}

function nowIso(env: WorkerEnv): string {
  return nowDate(env).toISOString();
}

/**
 * Keeps the public `expectedUpdatedAt` token useful even when two writes land
 * in the same millisecond (or a test freezes the clock). `revision` remains
 * the internal D1 CAS source of truth, while this value is the client-visible
 * generation token and therefore must advance after every successful write.
 */
function nextUpdatedAt(env: WorkerEnv, previousUpdatedAt: string): string {
  const currentMs = nowDate(env).getTime();
  const previousMs = Date.parse(previousUpdatedAt);
  const nextMs = Number.isFinite(previousMs) ? Math.max(currentMs, previousMs + 1) : currentMs;
  return new Date(nextMs).toISOString();
}

function memory(env: WorkerEnv): AgentMemory {
  if (!env || (typeof env !== "object" && typeof env !== "function")) {
    throw agentError(500, "agent_env_invalid", "Agent storage requires an environment object.");
  }
  if (!memoryByEnv.has(env)) {
    memoryByEnv.set(env, {
      agents: new Map<string, AgentRecord>(),
      connections: new Map<string, AgentConnectionRecord>(),
    });
  }
  return memoryByEnv.get(env) as AgentMemory;
}

function agentKey(uid: string, agentId: string): string {
  return `${uid}:${agentId}`;
}

function cleanString(value: unknown, maxLength: number, field: string, { required = false }: { required?: boolean } = {}): string {
  const result = String(value ?? "").trim();
  if (required && !result) throw agentError(400, `${field}_required`, `${field} is required.`);
  if (result.length > maxLength) throw agentError(400, `${field}_too_long`, `${field} is too long.`);
  return result;
}

function assertSafeKeys(input: AgentInput, allowed: readonly string[], context: string): void {
  for (const key of Object.keys(input)) {
    if (allowed.includes(key)) continue;
    if (SECRET_KEY_PATTERN.test(key)) {
      throw agentError(400, "agent_secret_field_rejected", `${context} cannot include field "${key}".`);
    }
    throw agentError(400, "agent_unknown_field", `Unknown field "${key}" in ${context}.`);
  }
}

function parseScopes(value: unknown, fallback: readonly string[] = []): string[] {
  if (value === undefined || value === null) return [...fallback];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  try {
    const parsed: unknown = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [...fallback];
  } catch {
    return [...fallback];
  }
}

function validateScopes(value: unknown, fallback: readonly string[] = [], allowed = ALLOWED_AGENT_SCOPES): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) throw agentError(400, "scopes_invalid", "Scopes must be an array of strings.");
  if (value.length > 100) throw agentError(400, "scopes_too_many", "Scopes must contain at most 100 entries.");
  const result: string[] = [];
  for (const item of value) {
    const scope = cleanString(item, 80, "scope", { required: true });
    if (!allowed.has(scope)) throw agentError(400, "scope_invalid", `Unsupported agent scope: ${scope}`);
    if (!result.includes(scope)) result.push(scope);
  }
  return result;
}

function coerceBoolean(value: unknown, field: string): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw agentError(400, `${field}_invalid`, `${field} must be a boolean.`);
}

function validateStatus(value: unknown): AgentStatus {
  if (typeof value !== "string" || !AGENT_STATUSES.has(value)) throw agentError(400, "agent_status_invalid", "Status must be active, disabled, or archived.");
  return value as AgentStatus;
}

export function validateAgentId(value: unknown): string {
  const agentId = String(value ?? "").trim().toLowerCase();
  if (!agentId) throw agentError(400, "agent_id_required", "Agent ID is required.");
  if (agentId.length > 80) throw agentError(400, "agent_id_too_long", "Agent ID must be at most 80 characters.");
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw agentError(400, "agent_id_invalid", "Agent ID must be a lowercase ASCII slug of letters, numbers, and hyphens.");
  }
  return agentId;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalizeAgent(row: unknown): AgentRecord | null {
  if (!row || typeof row !== "object") return null;
  const item = asRecord(row);
  return {
    uid: String(item.uid || ""),
    agentId: String(item.agent_id ?? item.agentId ?? ""),
    displayName: String(item.display_name ?? item.displayName ?? ""),
    provider: String(item.provider ?? "generic"),
    role: String(item.role ?? "assistant"),
    instructions: String(item.instructions ?? ""),
    status: validateStatus(item.status),
    allowedScopes: parseScopes(item.allowed_scopes ?? item.allowedScopes, []),
    defaultHandoffState: String(item.default_handoff_state ?? item.defaultHandoffState ?? ""),
    reviewRequired: Boolean(item.review_required ?? item.reviewRequired ?? 0),
    dryRunDefault: Boolean(item.dry_run_default ?? item.dryRunDefault ?? 0),
    createdAt: String(item.created_at ?? item.createdAt ?? ""),
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ""),
    avatarVersion: Number(item.avatar_version ?? item.avatarVersion ?? 0),
    hasCustomAvatar: Boolean(item.has_custom_avatar ?? item.hasCustomAvatar ?? 0),
    avatarAssetId: (item.avatar_asset_id ?? item.avatarAssetId) != null ? String(item.avatar_asset_id ?? item.avatarAssetId) : null,
    revision: Number(item.revision ?? 1) || 1,
  };
}

function normalizeConnection(row: unknown): AgentConnectionRecord | null {
  if (!row || typeof row !== "object") return null;
  const item = asRecord(row);
  return {
    clientId: String(item.client_id ?? item.clientId ?? ""),
    uid: String(item.uid || ""),
    agentId: String(item.agent_id ?? item.agentId ?? ""),
    clientName: String(item.client_name ?? item.clientName ?? ""),
    scopes: parseScopes(item.scopes, []),
    firstConnectedAt: String(item.first_connected_at ?? item.firstConnectedAt ?? ""),
    lastUsedAt: String(item.last_used_at ?? item.lastUsedAt ?? ""),
    revokedAt: item.revoked_at ?? item.revokedAt ? String(item.revoked_at ?? item.revokedAt) : null,
    createdAt: String(item.created_at ?? item.createdAt ?? ""),
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ""),
  };
}

/**
 * The in-memory fallback's Map holds the live, mutable record — unlike a
 * real D1 `SELECT`, which reflects a snapshot taken at query time. Every
 * caller here awaits before doing anything with the result, and a
 * concurrent writer can mutate that same object during the wait; returning
 * a shallow copy freezes the read at the moment this function actually ran,
 * matching real D1 semantics and keeping a "stale" CAS read stale even
 * under genuine (Promise.all) concurrency, not just sequential calls.
 */
async function getAgentRow(env: WorkerEnv, uid: string, agentId: string): Promise<unknown> {
  if (env.QUESTFORGE_DB) {
    return env.QUESTFORGE_DB.prepare("SELECT * FROM agent_registry_agents WHERE uid = ? AND agent_id = ?").bind(uid, agentId).first();
  }
  const stored = memory(env).agents.get(agentKey(uid, agentId));
  return stored === undefined ? undefined : { ...stored };
}

async function getConnectionRow(env: WorkerEnv, uid: string, clientId: string): Promise<unknown> {
  if (env.QUESTFORGE_DB) {
    return env.QUESTFORGE_DB.prepare("SELECT * FROM agent_registry_connections WHERE uid = ? AND client_id = ?").bind(uid, clientId).first();
  }
  const stored = memory(env).connections.get(`${uid}:${clientId}`);
  return stored === undefined ? undefined : { ...stored };
}

async function countActiveAgents(env: WorkerEnv, uid: string): Promise<number> {
  if (env.QUESTFORGE_DB) {
    const row = await env.QUESTFORGE_DB.prepare("SELECT COUNT(*) AS count FROM agent_registry_agents WHERE uid = ? AND status <> 'archived'").bind(uid).first<JsonRecord>();
    return Number(row?.count || 0);
  }
  return [...memory(env).agents.values()].filter((agent) => agent.uid === uid && agent.status !== "archived").length;
}

async function revokeAgentConnections(env: WorkerEnv, uid: string, agentId: string, revokedAt: string): Promise<void> {
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("UPDATE agent_registry_connections SET revoked_at = ?, updated_at = ? WHERE uid = ? AND agent_id = ? AND revoked_at IS NULL")
      .bind(revokedAt, revokedAt, uid, agentId).run();
  } else {
    for (const connection of memory(env).connections.values()) {
      if (connection.uid === uid && connection.agentId === agentId && !connection.revokedAt) {
        connection.revokedAt = revokedAt;
        connection.updatedAt = revokedAt;
      }
    }
  }
}

export async function listAgents(env: WorkerEnv, uid: string, { includeArchived = false }: { includeArchived?: boolean } = {}): Promise<AgentRecord[]> {
  let rows: unknown[];
  if (env.QUESTFORGE_DB) {
    const statement = includeArchived
      ? env.QUESTFORGE_DB.prepare("SELECT * FROM agent_registry_agents WHERE uid = ? ORDER BY created_at DESC").bind(uid)
      : env.QUESTFORGE_DB.prepare("SELECT * FROM agent_registry_agents WHERE uid = ? AND status <> 'archived' ORDER BY created_at DESC").bind(uid);
    rows = (await statement.all<JsonRecord>()).results || [];
  } else {
    rows = [...memory(env).agents.values()]
      .filter((agent) => agent.uid === uid && (includeArchived || agent.status !== "archived"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return rows.map(normalizeAgent).filter((agent): agent is AgentRecord => Boolean(agent));
}

export async function getAgent(env: WorkerEnv, uid: string, agentId: string, { includeArchived = false }: { includeArchived?: boolean } = {}): Promise<AgentRecord> {
  const agent = normalizeAgent(await getAgentRow(env, uid, agentId));
  if (!agent || (agent.status === "archived" && !includeArchived)) {
    throw agentError(404, "agent_not_found", "Agent was not found.");
  }
  return agent;
}

export async function createAgent(env: WorkerEnv, uid: string, input: AgentInput = {}): Promise<AgentRecord | null> {
  assertSafeKeys(input, CREATE_AGENT_KEYS, "agent creation");
  const agentId = validateAgentId(input.agentId);
  const displayName = cleanString(input.displayName, 40, "display_name", { required: true });
  const provider = cleanString(input.provider, 40, "provider") || "generic";
  const role = cleanString(input.role, 60, "role") || "assistant";
  const instructions = cleanString(input.instructions, 4000, "instructions");
  const status = input.status === undefined ? "active" : validateStatus(input.status);
  if (status !== "active") throw agentError(400, "agent_status_invalid", "New agents must start as active.");
  const allowedScopes = validateScopes(input.allowedScopes, [...ALLOWED_AGENT_SCOPES]);
  const defaultHandoffState = cleanString(input.defaultHandoffState, 20, "default_handoff_state") || "ready";
  if (!HANDOFF_STATES.has(defaultHandoffState)) throw agentError(400, "default_handoff_state_invalid", "Default handoff state is invalid.");
  const reviewRequired = input.reviewRequired === undefined ? true : coerceBoolean(input.reviewRequired, "review_required");
  const dryRunDefault = input.dryRunDefault === undefined ? true : coerceBoolean(input.dryRunDefault, "dry_run_default");

  if (await getAgentRow(env, uid, agentId)) {
    throw agentError(409, "agent_exists", "An agent with this ID already exists.");
  }
  if ((await countActiveAgents(env, uid)) >= MAX_AGENTS) {
    throw agentError(409, "agent_limit_reached", "You can have at most 20 agents.");
  }

  const createdAt = nowIso(env);
  const row = {
    uid,
    agent_id: agentId,
    display_name: displayName,
    provider,
    role,
    instructions,
    status,
    allowed_scopes: JSON.stringify(allowedScopes),
    default_handoff_state: defaultHandoffState,
    review_required: reviewRequired ? 1 : 0,
    dry_run_default: dryRunDefault ? 1 : 0,
    created_at: createdAt,
    updated_at: createdAt,
    avatar_version: 0,
    has_custom_avatar: 0,
    avatar_asset_id: null,
    revision: 1,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO agent_registry_agents
      (uid, agent_id, display_name, provider, role, instructions, status, allowed_scopes, default_handoff_state, review_required, dry_run_default, created_at, updated_at, avatar_version, has_custom_avatar, avatar_asset_id, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(row.uid, row.agent_id, row.display_name, row.provider, row.role, row.instructions, row.status, row.allowed_scopes,
        row.default_handoff_state, row.review_required, row.dry_run_default, row.created_at, row.updated_at,
        row.avatar_version, row.has_custom_avatar, row.avatar_asset_id, row.revision).run();
  } else {
    memory(env).agents.set(agentKey(uid, agentId), {
      uid,
      agentId,
      displayName,
      provider,
      role,
      instructions,
      status,
      allowedScopes,
      defaultHandoffState,
      reviewRequired,
      dryRunDefault,
      createdAt,
      updatedAt: createdAt,
      avatarVersion: 0,
      hasCustomAvatar: false,
      avatarAssetId: null,
      revision: 1,
    });
  }
  return normalizeAgent(row);
}

export async function updateAgent(env: WorkerEnv, uid: string, agentId: string, patch: AgentInput = {}): Promise<AgentRecord> {
  assertSafeKeys(patch, UPDATE_AGENT_KEYS, "agent update");
  const agent = normalizeAgent(await getAgentRow(env, uid, agentId));
  if (!agent) throw agentError(404, "agent_not_found", "Agent was not found.");
  if (agent.status === "archived") throw agentError(409, "agent_archived", "Archived agents cannot be updated.");
  if (patch.expectedUpdatedAt !== undefined && patch.expectedUpdatedAt !== agent.updatedAt) {
    throw agentError(409, "agent_conflict", "Agent changed since it was last read. Please retry.");
  }

  const displayName = patch.displayName === undefined ? agent.displayName : cleanString(patch.displayName, 40, "display_name", { required: true });
  const provider = patch.provider === undefined ? agent.provider : cleanString(patch.provider, 40, "provider") || "generic";
  const role = patch.role === undefined ? agent.role : cleanString(patch.role, 60, "role") || "assistant";
  const instructions = patch.instructions === undefined ? agent.instructions : cleanString(patch.instructions, 4000, "instructions");
  const status = patch.status === undefined ? agent.status : validateStatus(patch.status);
  const allowedScopes = patch.allowedScopes === undefined ? agent.allowedScopes : validateScopes(patch.allowedScopes);
  const defaultHandoffState = patch.defaultHandoffState === undefined ? agent.defaultHandoffState : cleanString(patch.defaultHandoffState, 20, "default_handoff_state");
  if (!HANDOFF_STATES.has(defaultHandoffState)) throw agentError(400, "default_handoff_state_invalid", "Default handoff state is invalid.");
  const reviewRequired = patch.reviewRequired === undefined ? agent.reviewRequired : coerceBoolean(patch.reviewRequired, "review_required");
  const dryRunDefault = patch.dryRunDefault === undefined ? agent.dryRunDefault : coerceBoolean(patch.dryRunDefault, "dry_run_default");

  const updatedAt = nextUpdatedAt(env, agent.updatedAt);
  const revoke = status === "disabled" || status === "archived";
  if (env.QUESTFORGE_DB) {
    // Compare-and-swap on `revision`, the monotonic counter read at the top
    // of this call — not `updated_at`. A timestamp guard can be defeated when
    // two writes land in the same millisecond, because the "new" value a
    // racer computes can equal the "old" value it also uses as its guard,
    // leaving the WHERE clause perpetually satisfied. `revision` always
    // advances by exactly 1 on a real write, so a second write racing this
    // one always sees a changed guard and changes zero rows here — not just
    // the pre-check above. This is what keeps an avatar upload
    // (`bumpAgentAvatarVersion`) and a metadata PATCH from both succeeding
    // when they race each other.
    //
    // The connection-revoke statement below cannot simply ride along in the
    // same `.batch()` unconditionally: D1's batch is one implicit
    // transaction, but a `changes = 0` UPDATE is not a SQL error, so the
    // batch still commits even when the agent CAS above matched nothing —
    // see https://developers.cloudflare.com/d1/worker-api/d1-database/#batch.
    // Gating it on `changes() = 1` (SQLite's own "rows touched by the
    // statement that just ran on this connection" function) makes the revoke
    // itself conditional on the *actual* result of the immediately preceding
    // statement, not on a value guessed in JS ahead of time — which is what a
    // "does revision now equal what I expected to write" check would be, and
    // which two racers reading the same stale revision could both guess
    // identically. Verified against a local D1 instance: a losing CAS leaves
    // both the agent row and any connections untouched; a winning one
    // revokes them in the same batch. `.batch()` runs its statements
    // sequentially on one connection, so `changes()` at statement N reflects
    // statement N-1, not some interleaved write from another request.
    const statements = [
      env.QUESTFORGE_DB.prepare(`UPDATE agent_registry_agents
        SET display_name = ?, provider = ?, role = ?, instructions = ?, status = ?, allowed_scopes = ?, default_handoff_state = ?, review_required = ?, dry_run_default = ?, updated_at = ?, revision = revision + 1
        WHERE uid = ? AND agent_id = ? AND status <> 'archived' AND revision = ?`)
        .bind(displayName, provider, role, instructions, status, JSON.stringify(allowedScopes), defaultHandoffState,
          reviewRequired ? 1 : 0, dryRunDefault ? 1 : 0, updatedAt, uid, agentId, agent.revision),
    ];
    if (revoke) {
      statements.push(env.QUESTFORGE_DB.prepare(
        "UPDATE agent_registry_connections SET revoked_at = ?, updated_at = ? WHERE uid = ? AND agent_id = ? AND revoked_at IS NULL AND changes() = 1",
      ).bind(updatedAt, updatedAt, uid, agentId));
    }
    const results = await env.QUESTFORGE_DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) {
      throw agentError(409, "agent_conflict", "Agent changed since it was last read. Please retry.");
    }
  } else {
    const stored = memory(env).agents.get(agentKey(uid, agentId));
    if (!stored) throw agentError(404, "agent_not_found", "Agent was not found.");
    if (stored.revision !== agent.revision) throw agentError(409, "agent_conflict", "Agent changed since it was last read. Please retry.");
    stored.displayName = displayName;
    stored.provider = provider;
    stored.role = role;
    stored.instructions = instructions;
    stored.status = status;
    stored.allowedScopes = allowedScopes;
    stored.defaultHandoffState = defaultHandoffState;
    stored.reviewRequired = reviewRequired;
    stored.dryRunDefault = dryRunDefault;
    stored.updatedAt = updatedAt;
    stored.revision += 1;
    if (revoke) await revokeAgentConnections(env, uid, agentId, updatedAt);
  }
  return getAgent(env, uid, agentId, { includeArchived: true });
}

/**
 * Activates a newly-uploaded avatar asset in D1 after `agent-avatar-store.ts`
 * has already written it to R2 under `newAssetId`. This is the compare-and-
 * swap that decides whether that asset becomes "current": the WHERE clause
 * binds the `revision` read at the top of this call, so a concurrent
 * metadata PATCH or a second avatar upload racing this one causes zero rows
 * to change here rather than either silently overwriting the other —
 * `revision`, not `updated_at`, because a timestamp guard can stay satisfied
 * across an unbounded number of same-millisecond racers (see `updateAgent`).
 * On a 409 the caller (index.ts) is responsible for deleting the
 * now-orphaned R2 object this call never activated — this function only
 * ever touches D1.
 */
export async function bumpAgentAvatarVersion(env: WorkerEnv, uid: string, agentId: string, newAssetId: string, expectedUpdatedAt?: string): Promise<AgentRecord> {
  const agent = normalizeAgent(await getAgentRow(env, uid, agentId));
  if (!agent) throw agentError(404, "agent_not_found", "Agent was not found.");
  if (agent.status === "archived") throw agentError(409, "agent_archived", "Archived agents cannot be updated.");
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== agent.updatedAt) {
    throw agentError(409, "agent_conflict", "Agent changed since it was last read. Please retry.");
  }
  const nextVersion = agent.avatarVersion + 1;
  const updatedAt = nextUpdatedAt(env, agent.updatedAt);
  if (env.QUESTFORGE_DB) {
    const result = await env.QUESTFORGE_DB.prepare(
      "UPDATE agent_registry_agents SET avatar_version = ?, has_custom_avatar = 1, avatar_asset_id = ?, updated_at = ?, revision = revision + 1 WHERE uid = ? AND agent_id = ? AND status <> 'archived' AND revision = ?",
    ).bind(nextVersion, newAssetId, updatedAt, uid, agentId, agent.revision).run();
    if ((result.meta?.changes ?? 0) !== 1) {
      throw agentError(409, "agent_conflict", "Agent changed since it was last read. Please retry.");
    }
  } else {
    const stored = memory(env).agents.get(agentKey(uid, agentId));
    if (!stored) throw agentError(404, "agent_not_found", "Agent was not found.");
    if (stored.revision !== agent.revision) throw agentError(409, "agent_conflict", "Agent changed since it was last read. Please retry.");
    stored.avatarVersion = nextVersion;
    stored.hasCustomAvatar = true;
    stored.avatarAssetId = newAssetId;
    stored.updatedAt = updatedAt;
    stored.revision += 1;
  }
  // The successful CAS above already determines this exact committed
  // generation. Avoid a second SELECT: if that follow-up read failed after
  // the UPDATE committed, the HTTP caller could misclassify the active R2
  // object as an orphan and delete it.
  return {
    ...agent,
    avatarVersion: nextVersion,
    hasCustomAvatar: true,
    avatarAssetId: newAssetId,
    updatedAt,
    revision: agent.revision + 1,
  };
}

export async function listAgentConnections(env: WorkerEnv, uid: string, agentId: string): Promise<AgentConnectionRecord[]> {
  if (!(await getAgentRow(env, uid, agentId))) {
    throw agentError(404, "agent_not_found", "Agent was not found.");
  }
  let rows;
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM agent_registry_connections WHERE uid = ? AND agent_id = ? ORDER BY first_connected_at DESC").bind(uid, agentId).all<JsonRecord>()).results || [];
  } else {
    rows = [...memory(env).connections.values()]
      .filter((connection) => connection.uid === uid && connection.agentId === agentId)
      .sort((a, b) => b.firstConnectedAt.localeCompare(a.firstConnectedAt));
  }
  return rows.map(normalizeConnection).filter((connection): connection is AgentConnectionRecord => Boolean(connection));
}

/**
 * Reads one relation without treating a revoked relation as absent.  The
 * distinction is useful to the connection-management UI and to MCP's
 * idempotent link/unlink tools: a revoked relation can be safely reactivated
 * without creating a second row.
 */
export async function getAgentConnection(env: WorkerEnv, uid: string, clientId: string): Promise<AgentConnectionRecord | null> {
  const connection = normalizeConnection(await getConnectionRow(env, uid, clientId));
  return connection && connection.uid === uid ? connection : null;
}

/**
 * Lists every relation for an owner, including revoked or legacy rows whose
 * Agent is no longer active.  The foreign key and soft-archive policy keep
 * new data consistent, while this all-owner view lets the UI report legacy
 * dangling references instead of silently losing connection history.
 */
export async function listAllAgentConnections(env: WorkerEnv, uid: string): Promise<AgentConnectionRecord[]> {
  let rows: unknown[];
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM agent_registry_connections WHERE uid = ? ORDER BY first_connected_at DESC").bind(uid).all<JsonRecord>()).results || [];
  } else {
    rows = [...memory(env).connections.values()]
      .filter((connection) => connection.uid === uid)
      .sort((a, b) => b.firstConnectedAt.localeCompare(a.firstConnectedAt));
  }
  return rows.map(normalizeConnection).filter((connection): connection is AgentConnectionRecord => Boolean(connection));
}

export async function linkAgentConnection(env: WorkerEnv, uid: string, agentId: string, input: AgentInput = {}): Promise<AgentConnectionRecord | null> {
  assertSafeKeys(input, LINK_CONNECTION_KEYS, "agent connection");
  const agent = normalizeAgent(await getAgentRow(env, uid, agentId));
  if (!agent) throw agentError(404, "agent_not_found", "Agent was not found.");
  if (agent.status === "archived") throw agentError(409, "agent_archived", "Archived agents cannot be linked to clients.");
  const clientId = cleanString(input.clientId, 200, "client_id", { required: true });
  const clientName = cleanString(input.clientName, 80, "client_name", { required: true });
  const scopes = validateScopes(input.scopes, [], ALLOWED_CONNECTION_SCOPES);
  const firstConnectedAt = String(input.firstConnectedAt || nowIso(env));
  const lastUsedAt = String(input.lastUsedAt || "");

  const existing = normalizeConnection(await getConnectionRow(env, uid, clientId));
  if (existing) {
    if (existing.uid === uid && existing.agentId === agentId) {
      return normalizeConnection(existing);
    }
    throw agentError(409, "agent_client_linked", "This client is already linked to another agent.");
  }

  const createdAt = nowIso(env);
  const row = {
    client_id: clientId,
    uid,
    agent_id: agentId,
    client_name: clientName,
    scopes: JSON.stringify(scopes),
    first_connected_at: firstConnectedAt,
    last_used_at: lastUsedAt,
    revoked_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO agent_registry_connections
      (client_id, uid, agent_id, client_name, scopes, first_connected_at, last_used_at, revoked_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(clientId, uid, agentId, clientName, row.scopes, firstConnectedAt, lastUsedAt, null, createdAt, createdAt).run();
  } else {
    memory(env).connections.set(`${uid}:${clientId}`, {
      clientId,
      uid,
      agentId,
      clientName,
      scopes,
      firstConnectedAt,
      lastUsedAt,
      revokedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return normalizeConnection(row);
}

/**
 * Explicitly selects the Agent for an already-authorized OAuth client.  This
 * is intentionally separate from `linkAgentConnection`: existing callers
 * relied on that function rejecting a client that is already linked to a
 * different Agent, while the new UI/MCP action is the deliberate relink path.
 * A revoked relation is reactivated in place so the one-row-per-user/client
 * invariant and the original connection timestamps are preserved.
 */
export async function relinkAgentConnection(env: WorkerEnv, uid: string, agentId: string, input: AgentInput = {}): Promise<AgentConnectionRecord | null> {
  assertSafeKeys(input, LINK_CONNECTION_KEYS, "agent connection");
  const agent = normalizeAgent(await getAgentRow(env, uid, agentId));
  if (!agent) throw agentError(404, "agent_not_found", "Agent was not found.");
  if (agent.status === "archived") throw agentError(409, "agent_archived", "Archived agents cannot be linked to clients.");
  if (agent.status !== "active") throw agentError(409, "agent_inactive", "Only an active Agent can be linked to a client.");

  const clientId = cleanString(input.clientId, 200, "client_id", { required: true });
  const clientName = cleanString(input.clientName, 80, "client_name", { required: true });
  const scopes = validateScopes(input.scopes, [], ALLOWED_CONNECTION_SCOPES);
  const existing = normalizeConnection(await getConnectionRow(env, uid, clientId));
  const updatedAt = nowIso(env);
  const firstConnectedAt = existing?.firstConnectedAt || String(input.firstConnectedAt || updatedAt);
  const lastUsedAt = String(input.lastUsedAt || existing?.lastUsedAt || "");
  const createdAt = existing?.createdAt || updatedAt;
  const row = {
    client_id: clientId,
    uid,
    agent_id: agentId,
    client_name: clientName,
    scopes: JSON.stringify(scopes),
    first_connected_at: firstConnectedAt,
    last_used_at: lastUsedAt,
    revoked_at: null,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  if (env.QUESTFORGE_DB) {
    if (existing) {
      await env.QUESTFORGE_DB.prepare(`UPDATE agent_registry_connections
        SET agent_id = ?, client_name = ?, scopes = ?, first_connected_at = ?, last_used_at = ?, revoked_at = NULL, updated_at = ?
        WHERE uid = ? AND client_id = ?`)
        .bind(agentId, clientName, row.scopes, firstConnectedAt, lastUsedAt, updatedAt, uid, clientId).run();
    } else {
      await env.QUESTFORGE_DB.prepare(`INSERT INTO agent_registry_connections
        (client_id, uid, agent_id, client_name, scopes, first_connected_at, last_used_at, revoked_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(clientId, uid, agentId, clientName, row.scopes, firstConnectedAt, lastUsedAt, null, createdAt, updatedAt).run();
    }
  } else {
    memory(env).connections.set(`${uid}:${clientId}`, {
      clientId,
      uid,
      agentId,
      clientName,
      scopes,
      firstConnectedAt,
      lastUsedAt,
      revokedAt: null,
      createdAt,
      updatedAt,
    });
  }
  return normalizeConnection(row);
}

export async function unlinkAgentConnection(env: WorkerEnv, uid: string, clientId: string): Promise<AgentConnectionRecord | null> {
  const connection = normalizeConnection(await getConnectionRow(env, uid, clientId));
  if (!connection || connection.uid !== uid) {
    throw agentError(404, "agent_connection_not_found", "Agent connection was not found.");
  }
  if (connection.revokedAt) return connection;
  const revokedAt = nowIso(env);
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("UPDATE agent_registry_connections SET revoked_at = ?, updated_at = ? WHERE uid = ? AND client_id = ? AND revoked_at IS NULL")
      .bind(revokedAt, revokedAt, uid, clientId).run();
  } else {
    const stored = memory(env).connections.get(`${uid}:${clientId}`);
    if (!stored) throw agentError(404, "agent_connection_not_found", "Agent connection was not found.");
    stored.revokedAt = revokedAt;
    stored.updatedAt = revokedAt;
  }
  return normalizeConnection({ ...connection, revokedAt, updatedAt: revokedAt });
}

/** Permanently removes only the owner-scoped connection relation. The Agent
 * Registry row itself is never touched, and the caller must enforce the
 * OAuth lifecycle rule before invoking this function. */
export async function deleteAgentConnection(env: WorkerEnv, uid: string, clientId: string): Promise<AgentConnectionRecord | null> {
  const connection = normalizeConnection(await getConnectionRow(env, uid, clientId));
  if (!connection || connection.uid !== uid) return null;
  if (!connection.revokedAt) {
    throw agentError(409, "agent_connection_active", "Disconnect the active Agent connection before deleting its history.");
  }
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("DELETE FROM agent_registry_connections WHERE uid = ? AND client_id = ?")
      .bind(uid, clientId).run();
  } else {
    memory(env).connections.delete(`${uid}:${clientId}`);
  }
  return connection;
}

export async function noteAgentConnectionUse(env: WorkerEnv, uid: string, clientId: string, { at }: { at?: string } = {}): Promise<AgentConnectionRecord | null> {
  const connection = normalizeConnection(await getConnectionRow(env, uid, clientId));
  if (!connection || connection.uid !== uid) {
    throw agentError(404, "agent_connection_not_found", "Agent connection was not found.");
  }
  if (connection.revokedAt) throw agentError(409, "agent_connection_revoked", "This client connection has been revoked.");
  const lastUsedAt = at || nowIso(env);
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("UPDATE agent_registry_connections SET last_used_at = ?, updated_at = ? WHERE uid = ? AND client_id = ? AND revoked_at IS NULL")
      .bind(lastUsedAt, lastUsedAt, uid, clientId).run();
  } else {
    const stored = memory(env).connections.get(`${uid}:${clientId}`);
    if (!stored) throw agentError(404, "agent_connection_not_found", "Agent connection was not found.");
    stored.lastUsedAt = lastUsedAt;
    stored.updatedAt = lastUsedAt;
  }
  return normalizeConnection({ ...connection, lastUsedAt, updatedAt: lastUsedAt });
}

export async function getAgentForClient(env: WorkerEnv, uid: string, clientId: string): Promise<AgentRecord | null> {
  const connection = normalizeConnection(await getConnectionRow(env, uid, clientId));
  if (!connection || connection.revokedAt) return null;
  const agent = normalizeAgent(await getAgentRow(env, connection.uid, connection.agentId));
  if (!agent || agent.status !== "active") return null;
  return agent;
}

export function resetAgentMemoryForTests() {
  memoryByEnv = new WeakMap<object, AgentMemory>();
}
