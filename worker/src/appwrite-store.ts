import type { AuthIdentity } from "./security.ts";
import { sha256 } from "./security.ts";
import type { JsonRecord, WorkerEnv } from "./worker-types.ts";
import type { QuestForgeState } from "../../types/questforge.ts";

type Identity = string | Pick<AuthIdentity, "uid"> & Partial<Pick<AuthIdentity, "email">>;
type StatePayload = JsonRecord & { schemaVersion?: number; clientUpdatedAt?: string; state?: QuestForgeState | null };
type LocalState = { revision: number; value: StatePayload };
type StateMutation = (state: QuestForgeState) => unknown | Promise<unknown>;
type AppwriteRow = JsonRecord & { $id?: string; stateJson?: string; revision?: number; clientUpdatedAt?: string; schemaVersion?: number; deviceId?: string };

const localStates = new Map<string, LocalState>();
const APPWRITE_TRANSACTION_TTL_SECONDS = 60;
const uidOf = (identity: Identity): string => typeof identity === "string" ? identity : identity.uid;
const asState = (value: unknown): QuestForgeState | null => {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  return record && Array.isArray(record.tasks) && record.character && record.battle ? value as QuestForgeState : null;
};

function configured(env: WorkerEnv): boolean {
  return Boolean(env.APPWRITE_ENDPOINT && env.APPWRITE_PROJECT_ID && env.APPWRITE_DATABASE_ID && env.APPWRITE_STATE_TABLE_ID && env.APPWRITE_API_KEY);
}

function localPayload(uid: string): LocalState {
  if (!localStates.has(uid)) localStates.set(uid, { revision: 0, value: { schemaVersion: 3, clientUpdatedAt: "", deviceId: "worker-local", state: null } });
  return localStates.get(uid)!;
}

function rowsUrl(env: WorkerEnv): string {
  const endpoint = String(env.APPWRITE_ENDPOINT).replace(/\/$/, "");
  return `${endpoint}/tablesdb/${encodeURIComponent(String(env.APPWRITE_DATABASE_ID))}/tables/${encodeURIComponent(String(env.APPWRITE_STATE_TABLE_ID))}/rows`;
}

function rowUrl(env: WorkerEnv, uid: string): string {
  return `${rowsUrl(env)}/${encodeURIComponent(uid)}`;
}

function tableRowUrl(env: WorkerEnv, tableId: string, rowId: string): string {
  const endpoint = String(env.APPWRITE_ENDPOINT).replace(/\/$/, "");
  return `${endpoint}/tablesdb/${encodeURIComponent(String(env.APPWRITE_DATABASE_ID))}/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`;
}

function appwriteHeaders(env: WorkerEnv): Record<string, string> {
  return { "content-type": "application/json", "x-appwrite-project": String(env.APPWRITE_PROJECT_ID), "x-appwrite-key": String(env.APPWRITE_API_KEY) };
}

function safeAppwriteIdentifier(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^[a-z0-9._-]{1,80}$/i.test(text) ? text : "unknown";
}

function sanitizedAppwriteMessage(value: unknown): string {
  const text = typeof value === "string" ? value : "Appwrite returned a non-JSON error response.";
  return text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(?:x-appwrite-key|authorization|api[-_ ]?key|bearer|token|secret|password)\s*[:=]\s*[^,;\s]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

async function throwAppwritePersistenceFailure(response: Response, operation: string): Promise<never> {
  let body: JsonRecord = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as JsonRecord;
  } catch {
    // Keep the log useful without retaining or emitting an arbitrary response body.
  }
  console.error("appwrite_state_persistence_failed", {
    operation,
    downstreamStatus: response.status,
    appwriteCode: safeAppwriteIdentifier(body.code),
    appwriteType: safeAppwriteIdentifier(body.type),
    message: sanitizedAppwriteMessage(body.message),
  });
  throw Object.assign(new Error("Appwrite state persistence failed."), { status: 500, code: "state_persistence_failed" });
}

function transactionsUrl(env: WorkerEnv, transactionId = ""): string {
  const endpoint = String(env.APPWRITE_ENDPOINT).replace(/\/$/, "");
  const base = `${endpoint}/tablesdb/transactions`;
  return transactionId ? `${base}/${encodeURIComponent(transactionId)}` : base;
}

async function createStateTransaction(env: WorkerEnv): Promise<string> {
  const response = await fetch(transactionsUrl(env), {
    method: "POST", headers: appwriteHeaders(env),
    body: JSON.stringify({ ttl: APPWRITE_TRANSACTION_TTL_SECONDS }),
  });
  if (!response.ok) return throwAppwritePersistenceFailure(response, "create_state_transaction");
  const transaction = await response.json() as JsonRecord;
  const id = String(transaction.$id || "");
  if (!id) throw new Error("Appwrite transaction did not return an ID.");
  return id;
}

async function discardStateTransaction(env: WorkerEnv, id: string): Promise<void> {
  // Cleanup must not hide the original error; the bounded transaction TTL is a fallback.
  try { await fetch(transactionsUrl(env, id), { method: "DELETE", headers: appwriteHeaders(env) }); } catch { /* expires */ }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encodeState(state: QuestForgeState | null): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(state));
  const rawBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const compressed = await new Response(new Blob([rawBuffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  // stateJson is a required longtext column; the former 60,000-character string cap does not apply.
  return `gzip:${bytesToBase64(new Uint8Array(compressed))}`;
}

async function decodeState(value: string): Promise<QuestForgeState | null> {
  if (!value.startsWith("gzip:")) return asState(JSON.parse(value || "null"));
  const compressed = base64ToBytes(value.slice(5));
  const compressedBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
  const decompressed = await new Response(new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return asState(JSON.parse(new TextDecoder().decode(decompressed)));
}

async function payloadFromRow(row: AppwriteRow): Promise<StatePayload> {
  let state: QuestForgeState | null = null;
  try { state = await decodeState(String(row.stateJson || "null")); } catch { state = null; }
  return { schemaVersion: Number(row.schemaVersion || state?.schemaVersion || 3), clientUpdatedAt: String(row.clientUpdatedAt || state?.updatedAt || ""), deviceId: String(row.deviceId || ""), state };
}

export async function readState(env: WorkerEnv, identity: Identity): Promise<{ payload: StatePayload; etag: string | null }> {
  const uid = uidOf(identity);
  if (!configured(env)) {
    const local = localPayload(uid);
    return { payload: structuredClone(local.value), etag: String(local.revision) };
  }
  const response = await fetch(rowUrl(env, uid), { headers: appwriteHeaders(env) });
  if (response.status === 404) {
    const email = typeof identity === "string" ? "" : identity.email;
    if (email && env.APPWRITE_LEGACY_TABLE_ID) {
      const legacyId = (await sha256(email.trim().toLowerCase())).slice(0, 36);
      const legacyUrl = tableRowUrl(env, env.APPWRITE_LEGACY_TABLE_ID, legacyId);
      const legacyResponse = await fetch(legacyUrl, { headers: appwriteHeaders(env) });
      if (legacyResponse.ok) {
        const legacyRow = await legacyResponse.json() as AppwriteRow;
        const legacyPayload = await payloadFromRow(legacyRow);
        if (legacyPayload.state && await writeState(env, identity, legacyPayload, null)) {
          await fetch(legacyUrl, { method: "DELETE", headers: appwriteHeaders(env) });
          return readState(env, identity);
        }
      }
    }
    return { payload: { state: null }, etag: null };
  }
  if (!response.ok) throw new Error(`Appwrite state read failed: ${response.status}`);
  const row = await response.json() as AppwriteRow;
  return { payload: await payloadFromRow(row), etag: String(Number(row.revision || 0)) };
}

export async function writeState(env: WorkerEnv, identity: Identity, payload: StatePayload, etag?: string | null, preparedTransactionId?: string): Promise<boolean> {
  const uid = uidOf(identity);
  if (!configured(env)) {
    const local = localPayload(uid);
    if (etag !== undefined && etag !== null && etag !== String(local.revision)) return false;
    local.revision += 1;
    local.value = structuredClone(payload);
    return true;
  }
  const currentRevision = Number(etag || 0);
  const data = {
    ownerId: uid,
    schemaVersion: Number(payload.schemaVersion || payload.state?.schemaVersion || 3),
    revision: currentRevision + 1,
    clientUpdatedAt: String(payload.clientUpdatedAt || payload.state?.updatedAt || new Date().toISOString()),
    deviceId: String(payload.deviceId || "unknown"),
    stateJson: await encodeState(payload.state || null),
  };
  const create = etag === null || etag === undefined;
  if (!create) {
    const transactionId = preparedTransactionId ?? await createStateTransaction(env);
    const transactionalRow = new URL(rowUrl(env, uid));
    transactionalRow.searchParams.set("transactionId", transactionId);
    const current = await fetch(transactionalRow, { headers: appwriteHeaders(env) });
    if (current.status === 404) {
      if (!preparedTransactionId) await discardStateTransaction(env, transactionId);
      return false;
    }
    if (!current.ok) return throwAppwritePersistenceFailure(current, "read_state_transaction_row");
    const currentRow = await current.json() as AppwriteRow;
    if (String(Number(currentRow.revision || 0)) !== String(etag)) {
      if (!preparedTransactionId) await discardStateTransaction(env, transactionId);
      return false;
    }
    const staged = await fetch(rowUrl(env, uid), {
      method: "PATCH",
      headers: appwriteHeaders(env),
      body: JSON.stringify({ data, transactionId }),
    });
    if (!staged.ok) return throwAppwritePersistenceFailure(staged, "stage_state_update");
    const committed = await fetch(transactionsUrl(env, transactionId), {
      method: "PATCH",
      headers: appwriteHeaders(env),
      body: JSON.stringify({ commit: true }),
    });
    if (committed.status === 409) return false;
    if (!committed.ok) return throwAppwritePersistenceFailure(committed, "commit_state_transaction");
    return true;
  }
  const response = await fetch(create ? rowsUrl(env) : rowUrl(env, uid), {
    method: "POST",
    headers: appwriteHeaders(env),
    body: JSON.stringify({ rowId: uid, data }),
  });
  if (response.status === 409) return false;
  if (!response.ok) return throwAppwritePersistenceFailure(response, create ? "create_state_row" : "upsert_state_row");
  return true;
}

export async function mutateState(env: WorkerEnv, identity: Identity, mutator: StateMutation): Promise<{ state: QuestForgeState; result: unknown }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // Neither operation depends on the other. Keep the transactional revision
    // recheck below: a concurrent update between these reads must still conflict.
    const [read, transaction] = await Promise.allSettled([
      readState(env, identity),
      configured(env) ? createStateTransaction(env) : Promise.resolve(undefined),
    ]);
    const transactionId = transaction.status === "fulfilled" ? transaction.value : undefined;
    let committed = false;
    try {
      if (read.status === "rejected") throw read.reason;
      if (transaction.status === "rejected") throw transaction.reason;
      const { payload, etag } = read.value;
      const state = asState(payload.state);
      if (!state) throw Object.assign(new Error("Guilduo state has not been synchronized yet."), { status: 409, code: "state_unavailable" });
      const nextState = structuredClone(state);
      const result = await mutator(nextState);
      const nextPayload: StatePayload = { ...payload, schemaVersion: nextState.schemaVersion || 3, clientUpdatedAt: nextState.updatedAt || new Date().toISOString(), deviceId: "guilduo-worker", state: nextState };
      if (await writeState(env, identity, nextPayload, etag, transactionId)) {
        committed = true;
        return { state: nextState, result };
      }
    } finally {
      if (transactionId && !committed) await discardStateTransaction(env, transactionId);
    }
  }
  throw Object.assign(new Error("The state changed on another device. Retry the request."), { status: 409, code: "state_conflict" });
}
