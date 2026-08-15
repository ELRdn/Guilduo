import { getFirebaseServiceAccessToken } from "./security.ts";
import type { AuthIdentity } from "./security.ts";
import type { JsonRecord, WorkerEnv } from "./worker-types.ts";
import type { QuestForgeState } from "../../types/questforge.ts";

type Identity = string | Pick<AuthIdentity, "uid" | "firebaseIdToken">;
type NormalizedIdentity = { uid: string; firebaseIdToken?: string };
type StatePayload = JsonRecord & {
  schemaVersion?: number;
  clientUpdatedAt?: string;
  state?: QuestForgeState | null;
};
type LocalState = { etag: string; revision: number; value: StatePayload };
type StateMutation = (state: QuestForgeState) => unknown | Promise<unknown>;

const localStates = new Map<string, LocalState>();

function normalizeIdentity(identity: Identity): NormalizedIdentity {
  return typeof identity === "string" ? { uid: identity } : identity;
}

function asStatePayload(value: unknown): StatePayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StatePayload : {};
}

function asState(value: unknown): QuestForgeState | null {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  return record && Array.isArray(record.tasks) && record.character && record.battle ? value as QuestForgeState : null;
}

function databaseUrl(env: WorkerEnv, identity: Identity): string {
  const { uid } = normalizeIdentity(identity);
  const base = String(env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
  return `${base}/users/${encodeURIComponent(uid)}/state/current.json`;
}

async function authUrl(env: WorkerEnv, identity: Identity, targetUrl?: string): Promise<URL> {
  const normalized = normalizeIdentity(identity);
  const url = new URL(targetUrl || databaseUrl(env, normalized));
  if (normalized.firebaseIdToken) {
    url.searchParams.set("auth", normalized.firebaseIdToken);
    return url;
  }
  const serviceToken = await getFirebaseServiceAccessToken(env);
  if (serviceToken) url.searchParams.set("access_token", serviceToken);
  return url;
}

async function mirrorStateEntities(env: WorkerEnv, identity: Identity, state: QuestForgeState): Promise<void> {
  if (!env.FIREBASE_DATABASE_URL) return;
  const { uid } = normalizeIdentity(identity);
  const base = String(env.FIREBASE_DATABASE_URL).replace(/\/$/, "");
  const url = await authUrl(env, identity, `${base}/users/${encodeURIComponent(uid)}/entities.json`);
  const quests = Object.fromEntries((state.tasks || []).map((task) => [task.id, task]));
  const taskEvents = Object.fromEntries((state.taskEvents || []).map((event) => [String(event.id || ""), event]));
  const syncEvents = Object.fromEntries((state.syncEvents || []).map((event) => [String(event.id || ""), event]));
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quests,
      character: { current: { ...state.character, battle: state.battle, boss: state.boss } },
      settings: { current: { schemaVersion: state.schemaVersion, theme: state.theme, preferences: state.preferences, sortMode: state.sortMode, taskFilter: state.taskFilter, integrations: state.integrations, updatedAt: state.updatedAt } },
      events: { task: taskEvents, sync: syncEvents },
      meta: { schemaVersion: state.schemaVersion || 3, updatedAt: Date.now() },
    }),
  });
  if (!response.ok) throw new Error(`Firebase entity mirror failed: ${response.status}`);
}

function localPayload(uid: string): LocalState {
  if (!localStates.has(uid)) {
    localStates.set(uid, {
      etag: '"local-0"',
      revision: 0,
      value: { schemaVersion: 3, clientUpdatedAt: "", deviceId: "worker-local", state: null },
    });
  }
  return localStates.get(uid) as LocalState;
}

export async function readState(env: WorkerEnv, identity: Identity): Promise<{ payload: StatePayload; etag: string | null }> {
  const { uid } = normalizeIdentity(identity);
  if (!env.FIREBASE_DATABASE_URL) {
    const local = localPayload(uid);
    return { payload: structuredClone(local.value), etag: local.etag };
  }
  const response = await fetch(await authUrl(env, identity), { headers: { "X-Firebase-ETag": "true" } });
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return { payload: asStatePayload(await response.json()), etag: response.headers.get("etag") };
}

export async function writeState(env: WorkerEnv, identity: Identity, payload: StatePayload, etag?: string | null): Promise<boolean> {
  const { uid } = normalizeIdentity(identity);
  if (!env.FIREBASE_DATABASE_URL) {
    const local = localPayload(uid);
    if (etag && etag !== local.etag) return false;
    local.revision += 1;
    local.etag = `"local-${local.revision}"`;
    local.value = structuredClone(payload);
    return true;
  }
  const response = await fetch(await authUrl(env, identity), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(etag ? { "if-match": etag } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 412) return false;
  if (!response.ok) throw new Error(`Firebase write failed: ${response.status}`);
  return true;
}

export async function mutateState(env: WorkerEnv, identity: Identity, mutator: StateMutation): Promise<{ state: QuestForgeState; result: unknown }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { payload, etag } = await readState(env, identity);
    const state = asState(payload.state);
    if (!state) {
      throw Object.assign(new Error("QuestForge state has not been synchronized yet."), { status: 409, code: "state_unavailable" });
    }
    const nextState = structuredClone(state);
    const result = await mutator(nextState);
    const nextPayload: StatePayload = {
      ...payload,
      schemaVersion: nextState.schemaVersion || 3,
      clientUpdatedAt: nextState.updatedAt || new Date().toISOString(),
      deviceId: "questforge-worker",
      state: nextState,
      serverUpdatedAt: { ".sv": "timestamp" },
    };
    if (await writeState(env, identity, nextPayload, etag)) {
      await mirrorStateEntities(env, identity, nextState);
      return { state: nextState, result };
    }
  }
  throw Object.assign(new Error("The state changed on another device. Retry the request."), { status: 409, code: "state_conflict" });
}
