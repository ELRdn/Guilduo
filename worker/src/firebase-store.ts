// @ts-nocheck
import { getFirebaseServiceAccessToken } from "./security.ts";

const localStates = new Map();

function normalizeIdentity(identity) {
  return typeof identity === "string" ? { uid: identity } : identity;
}

function databaseUrl(env, identity) {
  const { uid } = normalizeIdentity(identity);
  const base = String(env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
  return `${base}/users/${encodeURIComponent(uid)}/state/current.json`;
}

async function authUrl(env, identity, targetUrl) {
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

async function mirrorStateEntities(env, identity, state) {
  if (!env.FIREBASE_DATABASE_URL) return;
  const { uid } = normalizeIdentity(identity);
  const base = String(env.FIREBASE_DATABASE_URL).replace(/\/$/, "");
  const url = await authUrl(env, identity, `${base}/users/${encodeURIComponent(uid)}/entities.json`);
  const quests = Object.fromEntries((state.tasks || []).map((task) => [task.id, task]));
  const taskEvents = Object.fromEntries((state.taskEvents || []).map((event) => [event.id, event]));
  const syncEvents = Object.fromEntries((state.syncEvents || []).map((event) => [event.id, event]));
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

function localPayload(uid) {
  if (!localStates.has(uid)) {
    localStates.set(uid, {
      etag: '"local-0"',
      revision: 0,
      value: { schemaVersion: 3, clientUpdatedAt: "", deviceId: "worker-local", state: null },
    });
  }
  return localStates.get(uid);
}

export async function readState(env, identity) {
  const { uid } = normalizeIdentity(identity);
  if (!env.FIREBASE_DATABASE_URL) {
    const local = localPayload(uid);
    return { payload: structuredClone(local.value), etag: local.etag };
  }
  const response = await fetch(await authUrl(env, identity), { headers: { "X-Firebase-ETag": "true" } });
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return { payload: await response.json(), etag: response.headers.get("etag") };
}

export async function writeState(env, identity, payload, etag) {
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

export async function mutateState(env, identity, mutator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { payload, etag } = await readState(env, identity);
    if (!payload?.state) {
      const error = new Error("QuestForge state has not been synchronized yet.");
      error.status = 409;
      error.code = "state_unavailable";
      throw error;
    }
    const state = structuredClone(payload.state);
    const result = await mutator(state);
    const nextPayload = {
      ...payload,
      schemaVersion: state.schemaVersion || 3,
      clientUpdatedAt: state.updatedAt || new Date().toISOString(),
      deviceId: "questforge-worker",
      state,
      serverUpdatedAt: { ".sv": "timestamp" },
    };
    if (await writeState(env, identity, nextPayload, etag)) {
      await mirrorStateEntities(env, identity, state);
      return { state, result };
    }
  }
  const error = new Error("The state changed on another device. Retry the request.");
  error.status = 409;
  error.code = "state_conflict";
  throw error;
}
