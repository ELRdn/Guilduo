const test = require("node:test");
const assert = require("node:assert/strict");

const env = {
  DEV_BEARER_TOKEN: "test-token",
  DEV_USER_ID: "test-user",
  FIREBASE_PROJECT_ID: "questforge-cb6ba",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

function initialState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    taskEvents: [],
    syncEvents: [],
    rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] },
    battle: { mp: 0, maxMp: 80 },
    boss: { hp: 100, maxHp: 100 },
  };
}

function context() {
  return { waitUntil(promise) { promise.catch(() => {}); } };
}

async function call(path, options = {}) {
  const worker = (await import("../worker/src/index.mjs")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, {
    ...options,
    headers: {
      authorization: "Bearer test-token",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  }), env, context());
}

test.beforeEach(async () => {
  const { writeState, readState } = await import("../worker/src/firebase-store.mjs");
  const current = await readState(env, "test-user");
  await writeState(env, "test-user", { schemaVersion: 3, state: initialState(), clientUpdatedAt: new Date().toISOString() }, current.etag);
});

test("REST create and score share production state and reward claims", async () => {
  const createdResponse = await call("/v1/quests", {
    method: "POST",
    body: JSON.stringify({ kind: "todo", title: "APIを確認", difficulty: "medium", dueDate: "2026-07-31" }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();

  const scoreResponse = await call(`/v1/quests/${created.quest.id}/score`, {
    method: "POST",
    body: JSON.stringify({ direction: "up" }),
  });
  assert.equal(scoreResponse.status, 200);
  const scored = await scoreResponse.json();
  assert.equal(scored.quest.done, true);
  assert.equal(scored.rewardGranted, true);
  assert.equal(scored.reward.gems, 11);
  assert.equal(scored.reward.mp, 30);

  const listed = await (await call("/v1/quests?done=true")).json();
  assert.equal(listed.quests.length, 1);
  assert.equal(listed.quests[0].id, created.quest.id);
});

test("MCP advertises eight tools and calls the same REST domain", async () => {
  const toolsResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const tools = await toolsResponse.json();
  assert.equal(tools.result.tools.length, 8);
  assert.ok(tools.result.tools.some((tool) => tool.name === "create_quest"));

  const createResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_quest", arguments: { kind: "habit", title: "水を飲む" } } }),
  });
  const result = await createResponse.json();
  assert.equal(result.result.structuredContent.quest.title, "水を飲む");
  assert.equal(result.result.isError, false);
});

test("gateway rejects unauthenticated API and publishes OAuth metadata", async () => {
  const worker = (await import("../worker/src/index.mjs")).default;
  const unauthorized = await worker.fetch(new Request("http://worker.test/v1/quests"), env, context());
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("www-authenticate"), /resource_metadata/);

  const metadata = await worker.fetch(new Request("http://worker.test/.well-known/oauth-authorization-server"), env, context());
  const body = await metadata.json();
  assert.equal(body.code_challenge_methods_supported[0], "S256");
  assert.ok(body.scopes_supported.includes("quests:write"));
});

test("plugin validation blocks unsafe UI entries", async () => {
  const { validateManifest } = await import("../worker/src/extensions.mjs");
  const invalid = validateManifest({
    manifestVersion: "0.1",
    id: "unsafe-plugin",
    name: "Unsafe",
    permissions: ["quests:read"],
    uiSlots: [{ slot: "dashboard.sidecar", entry: "javascript:alert(1)" }],
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /HTTPS/);
});

