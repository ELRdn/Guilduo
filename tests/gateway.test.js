const test = require("node:test");
const assert = require("node:assert/strict");

const env = {
  DEV_BEARER_TOKEN: "test-token",
  DEV_USER_ID: "test-user",
  FIREBASE_PROJECT_ID: "questforge-test",
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

test("MCP advertises v2 quest, social, and battle tools and calls the same REST domain", async () => {
  const toolsResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const tools = await toolsResponse.json();
  assert.equal(tools.result.tools.length, 29);
  assert.ok(tools.result.tools.some((tool) => tool.name === "create_quest"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "list_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "batch_update_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "archive_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "find_profile_by_handle"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "get_party"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "battle_command"));

  const createResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_quest", arguments: { kind: "habit", title: "水を飲む" } } }),
  });
  const result = await createResponse.json();
  assert.equal(result.result.structuredContent.quest.title, "水を飲む");
  assert.equal(result.result.isError, false);
});

test("REST v2 supports views, dry-run batches, archives, external links, and no quest deletion", async () => {
  const created = await (await call("/v1/quests", {
    method: "POST",
    body: JSON.stringify({
      kind: "todo",
      title: "API v2 task",
      dueDate: "2026-08-05",
      scheduledDate: "2026-08-01",
      planningMode: "until_due",
      estimatedMinutes: 30,
      actualMinutes: 12,
      impact: "high",
      isBlockingOthers: true,
    }),
  })).json();

  const today = await (await call("/v1/quests?view=today&date=2026-08-01")).json();
  assert.equal(today.total, 1);
  assert.equal(today.quests[0].id, created.quest.id);

  const preview = await (await call("/v1/quests/batch-update", {
    method: "POST",
    body: JSON.stringify({ questIds: [created.quest.id], postponeDays: 1 }),
  })).json();
  assert.equal(preview.dryRun, true);
  assert.equal(preview.quests[0].scheduledDate, "2026-08-02");
  const unchanged = await (await call("/v1/quests?view=all")).json();
  assert.equal(unchanged.quests[0].scheduledDate, "2026-08-01");

  const linked = await (await call(`/v1/quests/${created.quest.id}/external-links`, {
    method: "POST",
    body: JSON.stringify({ service: "toggl-track", externalId: "entry-1", type: "time_entry", durationMinutes: 44 }),
  })).json();
  assert.equal(linked.quest.actualMinutes, 44);

  await call(`/v1/quests/${created.quest.id}/score`, { method: "POST", body: JSON.stringify({ direction: "up" }) });
  const archivePreview = await (await call("/v1/quests/archive", {
    method: "POST",
    body: JSON.stringify({ questIds: [created.quest.id] }),
  })).json();
  assert.equal(archivePreview.dryRun, true);
  assert.equal(archivePreview.count, 1);

  const archived = await (await call("/v1/quests/archive", {
    method: "POST",
    body: JSON.stringify({ questIds: [created.quest.id], dryRun: false }),
  })).json();
  assert.equal(archived.quests[0].lifecycleState, "archived");

  const deleteResponse = await call(`/v1/quests/${created.quest.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 404);
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

test("OAuth tokens carry and rotate the delegated Firebase session", async () => {
  const { authenticateRequest, getKv, sha256 } = await import("../worker/src/security.mjs");
  const { revokeToken, tokenEndpoint } = await import("../worker/src/oauth.mjs");
  const oauthEnv = { ...env, FIREBASE_API_KEY: "test-firebase-key" };
  const verifier = "questforge-pkce-verifier";
  const code = "questforge-test-code";
  const kv = getKv(oauthEnv);
  await kv.put(`code:${await sha256(code)}`, JSON.stringify({
    clientId: "test-client",
    redirectUri: "https://example.com/callback",
    challenge: await sha256(verifier),
    uid: "test-user",
    email: "test@example.com",
    scopes: ["quests:read", "quests:write"],
    firebaseIdToken: "initial-firebase-id-token",
    firebaseRefreshToken: "initial-firebase-refresh-token",
  }), { expirationTtl: 300 });

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://securetoken.googleapis.com/")) {
      return new Response(JSON.stringify({ id_token: "fresh-firebase-id-token", refresh_token: "rotated-firebase-refresh-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(url, options);
  };

  try {
    const issued = await tokenEndpoint(new Request("http://worker.test/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "test-client",
        redirect_uri: "https://example.com/callback",
        code_verifier: verifier,
      }),
    }), oauthEnv);
    assert.equal(issued.status, 200);
    const tokens = await issued.json();
    const identity = await authenticateRequest(new Request("http://worker.test/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }), oauthEnv);
    assert.equal(identity.uid, "test-user");
    assert.equal(identity.firebaseIdToken, "fresh-firebase-id-token");

    await revokeToken(new Request("http://worker.test/oauth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.access_token }),
    }), oauthEnv);
    const revokedRefresh = await tokenEndpoint(new Request("http://worker.test/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }),
    }), oauthEnv);
    assert.equal(revokedRefresh.status, 400);
  } finally {
    global.fetch = originalFetch;
  }
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
