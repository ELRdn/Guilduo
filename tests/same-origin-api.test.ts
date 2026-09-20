import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { QuestForgeRepository, repositoryRequestUrl } from "../interaction-lab/repository.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState } from "./test-helpers.ts";

const web = "https://app.example.test", mcp = "https://mcp.example.test";
const config = { gatewayUrl: mcp, webApiBaseUrl: `${web}/api` };
const env: WorkerEnv = { DEV_BEARER_TOKEN: "web-route", DEV_USER_ID: "same-origin-owner", WEB_APP_URL: web, WEB_API_ENABLED: "true", ALLOWED_ORIGINS: web };
const context = { waitUntil(p: Promise<unknown>) { void p.catch(() => {}); } };
const request = (url: string, init: RequestInit = {}, environment = env) => worker.fetch(new Request(url, {
  ...init, headers: { authorization: "Bearer web-route", ...init.headers },
}), environment, context);

test("only configured, same-origin REST requests use Web transport", () => {
  assert.equal(repositoryRequestUrl(mcp, "/v1/quests?q=a%20b", config, web), `${web}/api/v1/quests?q=a%20b`);
  for (const path of ["/health", "/mcp", "/mcp-next", "/oauth/token", "/openapi.json"]) {
    assert.equal(repositoryRequestUrl(mcp, path, config, web), `${mcp}${path}`);
  }
  for (const invalid of ["https://evil.test/api", `${web}/other`, `${web}/api?q=1`, `${web}/api#x`, `https://user@app.example.test/api`, "http://app.example.test/api"]) {
    assert.equal(repositoryRequestUrl(mcp, "/v1/quests", { ...config, webApiBaseUrl: invalid }, web), `${mcp}/v1/quests`);
  }
  assert.equal(repositoryRequestUrl(mcp, "/v1/quests", config, "http://localhost:5173"), `${mcp}/v1/quests`);
  assert.equal(repositoryRequestUrl("https://custom.test", "/v1/quests", config, web), "https://custom.test/v1/quests");
  assert.equal(repositoryRequestUrl(mcp, "/v1/../../oauth/token", config, web), `${mcp}/v1/../../oauth/token`);
});

test("repository preserves bearer/method/body and never retries a failed write on another host", async () => {
  const originalFetch = globalThis.fetch, originalConfig = globalThis.QuestForgeConfig;
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  const calls: { url: string; init?: RequestInit }[] = [];
  try {
    Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: web } });
    globalThis.QuestForgeConfig = config;
    globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init }); return Response.json({}, { status: 503 }); };
    const repository = new QuestForgeRepository({ baseUrl: mcp, getToken: async () => "test-token" });
    await assert.rejects(repository.updateQuest("specific", { title: "kept" }), { status: 503 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${web}/api/v1/quests/specific`);
    assert.equal(calls[0].init?.method, "PATCH");
    assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer test-token");
    assert.equal(calls[0].init?.redirect, "error");
    assert.equal(calls[0].init?.credentials, "omit");
    assert.equal(JSON.parse(String(calls[0].init?.body)).title, "kept");
    assert.equal(repository.baseUrl, mcp);
  } finally {
    globalThis.fetch = originalFetch; globalThis.QuestForgeConfig = originalConfig;
    if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor);
    else Reflect.deleteProperty(globalThis, "location");
  }
});

test("Web route preserves read queries, creates once, and cannot alias auth/static/MCP routes", async () => {
  const stored = await readState(env, "same-origin-owner");
  await writeState(env, "same-origin-owner", { state: asQuestForgeState({
    schemaVersion: 7, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] },
    battle: { mp: 0, maxMp: 80 }, boss: { hp: 100, maxHp: 100 },
  }) }, stored.etag);
  const created = await request(`${web}/api/v1/quests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "same-origin measurement", kind: "todo" }) });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  assert.match(created.headers.get("server-timing") || "", /tx_|route;dur=/);
  const viaWeb = await request(`${web}/api/v1/quests?view=all&limit=1`);
  const viaMcp = await request(`${mcp}/v1/quests?view=all&limit=1`);
  assert.deepEqual(await viaWeb.json(), await viaMcp.json());
  assert.equal((await readState(env, "same-origin-owner")).payload.state?.tasks.length, 1);
  for (const target of [`${web}/api/mcp`, `${web}/api/oauth/token`, `${web}/api/openapi.json`, `${mcp}/api/v1/quests`, `http://app.example.test/api/v1/quests`]) {
    assert.equal((await request(target)).status, 404, target);
  }
  assert.equal((await request(`${web}/api/v1/quests`, {}, { ...env, WEB_API_ENABLED: "false" })).status, 404);
  const anonymous = await worker.fetch(new Request(`${web}/api/v1/quests`, { headers: { cookie: "session=ignored", "sec-fetch-site": "same-origin" } }), env, context);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("cache-control"), "no-store");
});

test("same-origin GET metadata admits Web settings but never overrides an untrusted Origin", async () => {
  const original = globalThis.fetch;
  const accountEnv = { ...env, APPWRITE_ENDPOINT: "https://account.invalid/v1", APPWRITE_PROJECT_ID: "test" };
  globalThis.fetch = async () => Response.json({ $id: "same-origin-owner" });
  try {
    const token = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature";
    for (const [headers, status] of [
      [{ "sec-fetch-site": "same-origin" }, 200], [{}, 403],
      [{ "sec-fetch-site": "cross-site" }, 403],
      [{ "sec-fetch-site": "same-origin", origin: "https://evil.test" }, 403],
      [{ origin: web }, 200],
    ] as [Record<string, string>, number][]) {
      const response = await request(`${web}/api/v1/agent-connections`, { headers: { authorization: token, ...headers } }, accountEnv);
      assert.equal(response.status, status);
    }
    const legacy = await request(`${mcp}/v1/agent-connections`, { headers: { authorization: token, "sec-fetch-site": "same-origin" } }, accountEnv);
    assert.equal(legacy.status, 403);
  } finally { globalThis.fetch = original; }
});
