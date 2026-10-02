import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.ts";
import { getKv, sha256 } from "../worker/src/security.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { createAgent } from "../worker/src/agent-store.ts";
import { QuestForgeRepository } from "../interaction-lab/repository.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState } from "./test-helpers.ts";

const context = { waitUntil(p: Promise<unknown>) { void p.catch(() => {}); } };
const env: WorkerEnv = { DEV_BEARER_TOKEN: "bootstrap-web", DEV_USER_ID: "bootstrap-owner" };
const request = (path: string, token = "bootstrap-web", environment = env) => worker.fetch(
  new Request(`http://worker.test${path}`, { headers: { authorization: `Bearer ${token}` } }), environment, context,
);

test("bootstrap matches legacy reads, is owner-scoped and does not mutate state", async () => {
  const prior = await readState(env, "bootstrap-owner");
  await writeState(env, "bootstrap-owner", { state: asQuestForgeState({ schemaVersion: 7, tasks: [], taskEvents: [] }) }, prior.etag);
  await createAgent(env, "bootstrap-owner", { agentId: "bootstrap-cyan", displayName: "Cyan" });
  await createAgent(env, "bootstrap-other", { agentId: "bootstrap-private", displayName: "Other owner" });
  const before = await readState(env, "bootstrap-owner");
  const response = await request("/v1/workspace/bootstrap");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as Record<string, unknown>;
  const quests = await (await request("/v1/quests?view=all&limit=200")).json() as Record<string, unknown>;
  const profile = await (await request("/v1/profile")).json() as Record<string, unknown>;
  const agents = await (await request("/v1/agents?includeArchived=true")).json() as Record<string, unknown>;
  assert.deepEqual(body, { ...quests, ...profile, ...agents, panelErrors: [] });
  assert.ok(!JSON.stringify(body).includes("bootstrap-private"));
  assert.deepEqual(await readState(env, "bootstrap-owner"), before);
});

test("bootstrap denies anonymous and OAuth callers and reports unavailable state", async () => {
  assert.equal((await request("/v1/workspace/bootstrap", "invalid")).status, 401);
  const token = "bootstrap-agent-token";
  await getKv(env).put(`access:${await sha256(token)}`, JSON.stringify({ uid: "bootstrap-owner", clientId: "bootstrap-client", scopes: ["quests:read", "profiles:read", "agents:read"], expiresAt: Date.now() + 60000 }));
  assert.equal((await request("/v1/workspace/bootstrap", token)).status, 403);
  const unavailable = await request("/v1/workspace/bootstrap", "bootstrap-web", { ...env, DEV_USER_ID: "bootstrap-empty" });
  assert.equal(unavailable.status, 409);
});

test("optional store failures remain explicit without hiding Quests or leaking error text", async () => {
  const broken = { ...env, QUESTFORGE_DB: { prepare() { throw new Error("private database failure detail"); } } } as unknown as WorkerEnv;
  const response = await request("/v1/workspace/bootstrap", "bootstrap-web", broken);
  assert.equal(response.status, 200);
  const body = await response.json() as { quests: unknown[]; profile: null; agents: unknown[]; panelErrors: { index: number }[] };
  assert.deepEqual(body.quests, []);
  assert.equal(body.profile, null);
  assert.deepEqual(body.agents, []);
  assert.deepEqual(body.panelErrors.map(e => e.index), [3, 5]);
  assert.ok(!JSON.stringify(body).includes("private database"));
});

test("client falls back only for an older Worker and retains optional panel errors", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  const repo = new QuestForgeRepository({ baseUrl: "https://worker.test", getToken: async () => "web" });
  try {
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname; paths.push(path);
      if (path === "/v1/workspace/bootstrap") return Response.json({}, { status: 404 });
      if (path === "/v1/quests") return Response.json({ quests: [], total: 0 });
      if (path === "/v1/profile") return Response.json({ profile: null });
      return Response.json({ agents: [] });
    };
    assert.equal((await repo.loadSnapshot({ deferPanels: true })).total, 0);
    assert.deepEqual(paths.sort(), ["/v1/agents", "/v1/profile", "/v1/quests", "/v1/workspace/bootstrap"]);
    for (const status of [401, 403, 409, 503]) {
      paths.length = 0;
      globalThis.fetch = async input => { paths.push(String(input)); return Response.json({}, { status }); };
      await assert.rejects(repo.loadSnapshot({ deferPanels: true }), { status });
      assert.ok(paths.every(p => p.endsWith("/v1/workspace/bootstrap")));
    }
    globalThis.fetch = async () => Response.json({ quests: [], total: 0, profile: null, agents: [], panelErrors: [{ index: 3, message: "profile unavailable" }] });
    const snapshot = await repo.loadSnapshot({ deferPanels: true });
    assert.deepEqual(snapshot.panelErrors, [{ index: 3, message: "profile unavailable" }]);
    assert.equal(snapshot.profile, null);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(repo.loadSnapshot({ deferPanels: true }), { code: "invalid_workspace_bootstrap" });
  } finally { globalThis.fetch = original; }
});

test("bootstrap and legacy snapshots read every Quest page and never turn malformed pages into empty data", async () => {
  const original = globalThis.fetch;
  const repo = new QuestForgeRepository({ baseUrl:"https://worker.test", getToken:async () => "web" });
  try {
    for (const legacy of [false, true]) {
      const cursors: string[] = [];
      globalThis.fetch = async input => {
        const url = new URL(String(input));
        if (url.pathname === "/v1/workspace/bootstrap" && legacy) return Response.json({}, { status:404 });
        if (url.pathname === "/v1/workspace/bootstrap" || url.pathname === "/v1/quests") {
          const cursor = url.searchParams.get("cursor") || "";
          cursors.push(cursor);
          return Response.json({ quests:Array.from({ length:cursor ? 7 : 200 }, (_, i) => ({ id:`q-${cursor ? 200+i : i}` })), total:207, nextCursor:cursor ? null : "next page", profile:null, agents:[], panelErrors:[] });
        }
        return Response.json({});
      };
      const snapshot = await repo.loadSnapshot({ deferPanels:true });
      assert.equal(snapshot.quests.length, 207);
      assert.equal(snapshot.total, 207);
      assert.deepEqual(cursors, ["", "next page"]);
      assert.equal((await snapshot.loadDeferred!()).quests.length, 207);
    }
    globalThis.fetch = async () => Response.json({ quests:[{ id:"repeat" }], nextCursor:"again" });
    await assert.rejects(repo.listAllQuests(), { code:"invalid_quest_page" });
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(repo.loadSnapshot(), { code:"invalid_quest_page" });
  } finally { globalThis.fetch = original; }
});

test("new Appwrite accounts bootstrap once, preserve competing state, and fail closed on existing or legacy errors", async () => {
  const original = globalThis.fetch;
  const accountEnv: WorkerEnv = {
    APPWRITE_ENDPOINT: "https://appwrite.test/v1", APPWRITE_PROJECT_ID: "test-project",
    APPWRITE_DATABASE_ID: "guilduo", APPWRITE_STATE_TABLE_ID: "user_states",
    APPWRITE_LEGACY_TABLE_ID: "legacy_states", APPWRITE_API_KEY: "fake-server-key",
  };
  const token = "new.account.jwt";
  let row: Record<string, unknown> | null = null;
  let legacyStatus = 404;
  let legacyState: unknown = null;
  let creates = 0;
  let compete = false;
  let createStatus = 201;
  const saved = asQuestForgeState({ schemaVersion: 7, tasks: [{ id: "retained-quest", title: "Keep existing work" }], character: {}, battle: {}, taskEvents: [] });
  const call = () => request("/v1/workspace/bootstrap", token, accountEnv);
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || "GET";
      assert.equal(url.hostname, "appwrite.test");
      if (url.pathname === "/v1/account") return Response.json({ $id: "fresh-owner", email: "new@example.test" });
      if (url.pathname.includes("/legacy_states/rows/")) {
        if (method === "DELETE") return new Response(null, { status: 204 });
        return Response.json({ stateJson: JSON.stringify(legacyState), schemaVersion: 7 }, { status: legacyStatus });
      }
      if (url.pathname.endsWith("/rows/fresh-owner")) return row ? Response.json(row) : Response.json({}, { status: 404 });
      if (url.pathname.endsWith("/user_states/rows") && method === "POST") {
        creates += 1;
        const body = JSON.parse(String(init?.body)) as { rowId: string; data: Record<string, unknown> };
        assert.equal(body.rowId, "fresh-owner");
        assert.equal(body.data.ownerId, "fresh-owner");
        assert.equal(body.data.revision, 1);
        assert.ok(String(body.data.stateJson).startsWith("gzip:"));
        if (compete) { row = { stateJson: JSON.stringify(saved), revision: 9 }; return Response.json({}, { status: 409 }); }
        if (createStatus !== 201) return Response.json({}, { status: createStatus });
        row = body.data;
        return Response.json(row, { status: 201 });
      }
      throw new Error("Unexpected bootstrap persistence call: " + method + " " + url.pathname);
    };
    assert.equal((await call()).status, 200, "a new account must receive an empty persisted Workspace");
    assert.equal(creates, 1);
    const firstRow = structuredClone(row);
    const state = (await readState(accountEnv, { uid: "fresh-owner" })).payload.state!;
    assert.deepEqual(state.tasks, []);
    assert.equal(state.schemaVersion, 7);
    assert.ok(state.createdAt);
    assert.ok(state.updatedAt);
    assert.equal(state.character.level, 1);
    assert.equal((await call()).status, 200);
    assert.equal(creates, 1, "reload must not initialize again");
    assert.deepEqual(row, firstRow);
    row = null; compete = true;
    const racing = await call();
    assert.equal(racing.status, 200);
    assert.equal((await racing.json() as { quests: { id: string }[] }).quests[0].id, "retained-quest");
    assert.equal((row as unknown as Record<string, unknown>).revision, 9, "another device's saved state must win");
    compete = false;
    for (const malformed of ["null", "invalid JSON"]) {
      row = { stateJson: malformed, revision: 3 };
      const before: number = creates;
      assert.equal((await call()).status, 409);
      assert.equal(creates, before, "existing unreadable rows must never be initialized over");
    }
    row = null;
    for (const status of [401, 403, 500]) {
      legacyStatus = status;
      const before: number = creates;
      assert.equal((await call()).status, 500);
      assert.equal(creates, before, "a failed migration lookup must not become an empty Workspace");
    }
    legacyStatus = 200; legacyState = null;
    const before: number = creates;
    assert.equal((await call()).status, 409);
    assert.equal(creates, before, "an unreadable legacy row must remain recoverable");
    legacyState = saved;
    assert.equal((await call()).status, 200);
    assert.equal((await readState(accountEnv, "fresh-owner")).payload.state!.tasks[0].id, "retained-quest");
    row = null; legacyStatus = 404; createStatus = 403;
    assert.equal((await call()).status, 500, "initialization must not succeed before persistence succeeds");
    assert.equal(row, null);
    const kv = getKv(accountEnv);
    const agentToken = "fresh-agent-token";
    await kv.put("access:" + await sha256(agentToken), JSON.stringify({ uid: "fresh-owner", clientId: "fresh-agent", scopes: ["quests:read"], expiresAt: Date.now() + 60000 }));
    const agentBefore = creates;
    assert.equal((await request("/v1/workspace/bootstrap", agentToken, accountEnv)).status, 403);
    assert.equal(creates, agentBefore, "Agent credentials must not initialize human state");
  } finally { globalThis.fetch = original; }
});
