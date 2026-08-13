const test = require("node:test");
const assert = require("node:assert/strict");

const env = { DEV_BEARER_TOKEN: "agent-test-token", DEV_USER_ID: "agent-user", FIREBASE_PROJECT_ID: "questforge-test", ALLOWED_ORIGINS: "http://localhost:5173" };
const context = { waitUntil(promise) { promise.catch(() => {}); } };

async function workerCall(path, options = {}) {
  const worker = (await import("../worker/src/index.mjs")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, {
    ...options,
    headers: { authorization: "Bearer agent-test-token", origin: "http://localhost:5173", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  }), env, context);
}

test.beforeEach(async () => {
  const agentStore = await import("../worker/src/agent-store.mjs");
  agentStore.resetAgentMemoryForTests();
  const { writeState, readState } = await import("../worker/src/firebase-store.mjs");
  const current = await readState(env, "agent-user");
  await writeState(env, "agent-user", { schemaVersion: 6, state: { schemaVersion: 6, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {}, character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] }, battle: { mp: 0, maxMp: 80 }, boss: { hp: 100, maxHp: 100 } }, clientUpdatedAt: new Date().toISOString() }, current.etag);
});

test("REST Agent Registry and MCP assignment share one registered Agent", async () => {
  const registeredResponse = await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan", provider: "openai", role: "engineer" }) });
  assert.equal(registeredResponse.status, 201);
  const registered = await registeredResponse.json();
  assert.equal(registered.agent.agentId, "codex");
  assert.equal(registered.agent.allowedScopes.includes("quests:write"), true);

  const created = await (await workerCall("/v1/quests", { method: "POST", body: JSON.stringify({ kind: "todo", title: "Agentへ渡す" }) })).json();
  const listCall = await workerCall("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_registered_agents", arguments: {} } }) });
  const listed = await listCall.json();
  assert.equal(listed.result.structuredContent.agents[0].agentId, "codex");

  const previewCall = await workerCall("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "assign_quest_to_agent", arguments: { questId: created.quest.id, agentId: "codex" } } }) });
  const preview = await previewCall.json();
  assert.equal(preview.result.structuredContent.dryRun, true);
  assert.equal(preview.result.structuredContent.quest.assignee.id, "codex");

  const executeCall = await workerCall("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "assign_quest_to_agent", arguments: { questId: created.quest.id, agentId: "codex", expectedUpdatedAt: created.quest.updatedAt, dryRun: false } } }) });
  const executed = await executeCall.json();
  assert.equal(executed.result.structuredContent.dryRun, false);
  assert.equal(executed.result.structuredContent.quest.assignee.label, "Cyan");
});

test("OAuth identities cannot change Agent Registry settings", async () => {
  const { routeApi } = await import("../worker/src/index.mjs");
  await assert.rejects(
    routeApi(new Request("http://worker.test/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "unsafe", displayName: "Unsafe" }) }), env, context, { uid: "agent-user", authType: "oauth", scopes: ["agents:read"] }, "/v1/agents"),
    (error) => error?.code === "agent_registry_web_required",
  );
});
