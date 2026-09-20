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
