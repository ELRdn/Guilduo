const test = require("node:test");
const assert = require("node:assert/strict");
import type { Quest, QuestForgeState } from "../types/questforge.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState, json, required, type TestContext, type TestRequestOptions } from "./test-helpers.ts";

type ApiQuestResponse = { quest: Quest };
type ApiQuestListResponse = { quests: Quest[]; total?: number };
type ApiBatchResponse = { dryRun: boolean; count: number; quests: Quest[] };
type ApiScoreResponse = { quest: Quest; rewardGranted: boolean; reward: { gems: number; xp: number; mp: number } };
type McpStructuredContent = { dryRun: boolean; quest: Quest; quests: Quest[]; summary: unknown };
type McpCallResponse = { result: { structuredContent: McpStructuredContent; isError?: boolean } };
type McpTool = { name: string; title?: string; outputSchema?: unknown };
type McpListResponse = { result: { tools: McpTool[] } };
type McpResourcesResponse = { resources: Array<{ uri: string }>; resourceTemplates?: Array<{ uriTemplate: string }> };
type McpPromptsResponse = { prompts: Array<{ name: string }> };

const env: WorkerEnv = {
  DEV_BEARER_TOKEN: "test-token",
  DEV_USER_ID: "test-user",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

function initialState(): QuestForgeState {
  const now = new Date().toISOString();
  return asQuestForgeState({
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
  });
}

function context(): TestContext {
  return { waitUntil(promise: Promise<unknown>): void { promise.catch(() => {}); } };
}

async function call(path: string, options: TestRequestOptions = {}): Promise<Response> {
  const worker = (await import("../worker/src/index.ts")).default;
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
  const { writeState, readState } = await import("../worker/src/appwrite-store.ts");
  const current = await readState(env, "test-user");
  await writeState(env, "test-user", { schemaVersion: 3, state: initialState(), clientUpdatedAt: new Date().toISOString() }, current.etag);
});

test("REST create and score share production state and reward claims", async () => {
  const createdResponse = await call("/v1/quests", {
    method: "POST",
    body: JSON.stringify({ kind: "todo", title: "APIを確認", difficulty: "medium", dueDate: "2026-07-31" }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await json<ApiQuestResponse>(createdResponse);

  const scoreResponse = await call(`/v1/quests/${created.quest.id}/score`, {
    method: "POST",
    body: JSON.stringify({ direction: "up" }),
  });
  assert.equal(scoreResponse.status, 200);
  const scored = await json<ApiScoreResponse>(scoreResponse);
  assert.equal(scored.quest.done, true);
  assert.equal(scored.rewardGranted, true);
  assert.equal(scored.reward.gems, 11);
  assert.equal(scored.reward.mp, 30);
  assert.equal(scored.quest.lifecycleState, "archived");

  const listed = await json<ApiQuestListResponse>(await call("/v1/quests?done=true"));
  assert.equal(listed.quests.length, 1);
  assert.equal(listed.quests[0].id, created.quest.id);
});

test("REST batch-score previews atomically and archives one-off todos", async () => {
  const first = await json<ApiQuestResponse>(await call("/v1/quests", { method: "POST", body: JSON.stringify({ kind: "todo", title: "一括To Do" }) }));
  const daily = await json<ApiQuestResponse>(await call("/v1/quests", { method: "POST", body: JSON.stringify({ kind: "daily", title: "一括日課" }) }));
  const preview = await json<ApiBatchResponse>(await call("/v1/quests/batch-score", { method: "POST", body: JSON.stringify({ questIds: [first.quest.id, daily.quest.id], direction: "up" }) }));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.count, 2);
  assert.equal((await json<ApiQuestListResponse>(await call("/v1/quests?view=all"))).quests.every((quest: Quest) => !quest.done), true);
  const applied = await json<ApiBatchResponse>(await call("/v1/quests/batch-score", { method: "POST", body: JSON.stringify({ questIds: [first.quest.id, daily.quest.id], direction: "up", dryRun: false }) }));
  const byId = new Map(applied.quests.map((quest: Quest) => [quest.id, quest]));
  assert.equal(required(byId.get(first.quest.id)).lifecycleState, "archived");
  assert.equal(required(byId.get(daily.quest.id)).lifecycleState, "active");
});

test("MCP batch-score uses the same automatic archive transition", async () => {
  const created = await json<ApiQuestResponse>(await call("/v1/quests", {
    method: "POST",
    body: JSON.stringify({ kind: "todo", title: "MCP一括完了" }),
  }));
  const previewResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "batch_score_quests", arguments: { questIds: [created.quest.id], direction: "up" } } }),
  });
  const preview = await json<McpCallResponse>(previewResponse);
  assert.equal(preview.result.structuredContent.dryRun, true);
  const appliedResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "batch_score_quests", arguments: { questIds: [created.quest.id], direction: "up", dryRun: false } } }),
  });
  const applied = await json<McpCallResponse>(appliedResponse);
  assert.equal(applied.result.structuredContent.quests[0].lifecycleState, "archived");
});

test("MCP advertises quest, social, battle, and Toggl Focus tools and calls the same REST domain", async () => {
  const toolsResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const tools = await json<McpListResponse>(toolsResponse);
  assert.equal(tools.result.tools.length, 51);
  assert.ok(tools.result.tools.some((tool) => tool.name === "create_quest"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "list_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "batch_update_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "batch_score_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "archive_quests"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "get_quest_tree"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "transition_quest_handoff"));
  for (const name of ["list_registered_agents", "get_current_agent_context", "assign_quest_to_agent"]) assert.ok(tools.result.tools.some((tool) => tool.name === name), name);
  assert.ok(tools.result.tools.some((tool) => tool.name === "find_profile_by_handle"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "get_party"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "battle_command"));
  for (const name of ["get_toggl_focus_status", "list_toggl_focus_entries", "sync_quest_to_toggl_focus", "get_toggl_focus_tracking", "start_toggl_focus_tracking", "stop_toggl_focus_tracking", "preview_toggl_attribution", "apply_toggl_attribution", "get_toggl_estimate_insights"]) {
    const tool = required(tools.result.tools.find((candidate: McpTool) => candidate.name === name));
    assert.ok(tool.outputSchema, `${name} output schema`);
  }
  for (const name of ["get_quest", "get_daily_brief", "get_review_summary", "list_agent_handoffs", "list_activity_events", "get_calendar_schedule", "convert_calendar_event_to_quest"]) {
    const tool = required(tools.result.tools.find((candidate: McpTool) => candidate.name === name));
    assert.ok(tool.title, `${name} title`);
    assert.ok(tool.outputSchema, `${name} output schema`);
  }

  const createResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_quest", arguments: { kind: "habit", title: "水を飲む" } } }),
  });
  const result = await json<McpCallResponse>(createResponse);
  assert.equal(result.result.structuredContent.quest.title, "水を飲む");
  assert.equal(result.result.isError, false);
});

function parseMcpSse<T>(text: string): T {
  const line = text.split("\n").find((item: string) => item.startsWith("data: "));
  const dataLine = required(line, "MCP SSE data line");
  return JSON.parse(dataLine.slice(6)) as T;
}

test("MCP v2.7 SDK lane exposes Agent resources, Focus resources, and workflow prompts", async () => {
  const headers = { host: "worker.test", accept: "application/json, text/event-stream" };
  const mcpCall = async <T>(method: string): Promise<T> => {
    const response = await call("/mcp-next", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params: {} }),
    });
    assert.equal(response.status, 200, method);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    return (parseMcpSse<{ result: T }>(await response.text())).result;
  };

  const tools = await mcpCall<{ tools: McpTool[] }>("tools/list");
  assert.equal(tools.tools.length, 51);
  assert.equal(tools.tools.filter((tool) => tool.outputSchema).length, 51);

  const resources = await mcpCall<McpResourcesResponse>("resources/list");
  assert.deepEqual(resources.resources.map((resource) => resource.uri).sort(), [
    "questforge://activity",
    "questforge://agent-handoffs",
    "questforge://agents/current",
    "questforge://agents/registered",
    "questforge://character",
    "questforge://quests/backlog",
    "questforge://quests/today",
    "questforge://quests/tree",
    "questforge://toggl-focus/estimate-insights",
    "questforge://toggl-focus/status",
  ]);
  const templates = await mcpCall<McpResourcesResponse>("resources/templates/list");
  assert.ok((templates.resourceTemplates || []).some((resource) => resource.uriTemplate === "questforge://quest/{questId}"));

  const prompts = await mcpCall<McpPromptsResponse>("prompts/list");
  assert.deepEqual(prompts.prompts.map((prompt) => prompt.name).sort(), [
    "assign_registered_agent",
    "capture_quest",
    "plan_today",
    "process_agent_handoffs",
    "review_day",
    "review_focus_time",
    "review_week",
  ]);
});

test("REST v2 supports views, dry-run batches, archives, external links, and no quest deletion", async () => {
  const created = await json<ApiQuestResponse>(await call("/v1/quests", {
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
  }));

  const today = await json<ApiQuestListResponse & { total: number }>(await call("/v1/quests?view=today&date=2026-08-01"));
  assert.equal(today.total, 1);
  assert.equal(today.quests[0].id, created.quest.id);

  const preview = await json<ApiBatchResponse>(await call("/v1/quests/batch-update", {
    method: "POST",
    body: JSON.stringify({ questIds: [created.quest.id], postponeDays: 1 }),
  }));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.quests[0].scheduledDate, "2026-08-02");
  const unchanged = await json<ApiQuestListResponse>(await call("/v1/quests?view=all"));
  assert.equal(unchanged.quests[0].scheduledDate, "2026-08-01");

  const linked = await json<ApiQuestResponse>(await call(`/v1/quests/${created.quest.id}/external-links`, {
    method: "POST",
    body: JSON.stringify({ service: "toggl-track", externalId: "entry-1", type: "time_entry", durationMinutes: 44 }),
  }));
  assert.equal(linked.quest.actualMinutes, 44);

  await call(`/v1/quests/${created.quest.id}/score`, { method: "POST", body: JSON.stringify({ direction: "up" }) });
  const archivePreview = await json<ApiBatchResponse>(await call("/v1/quests/archive", {
    method: "POST",
    body: JSON.stringify({ questIds: [created.quest.id] }),
  }));
  assert.equal(archivePreview.dryRun, true);
  assert.equal(archivePreview.count, 1);

  const archived = await json<ApiBatchResponse>(await call("/v1/quests/archive", {
    method: "POST",
    body: JSON.stringify({ questIds: [created.quest.id], dryRun: false }),
  }));
  assert.equal(archived.quests[0].lifecycleState, "archived");

  const deleteResponse = await call(`/v1/quests/${created.quest.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 404);
});

test("REST and MCP share Quest Tree and Agent Handoff state transitions", async () => {
  const root = await json<ApiQuestResponse>(await call("/v1/quests", {
    method: "POST",
    body: JSON.stringify({ kind: "todo", title: "Phase 2 parent", assignee: { type: "agent", id: "OpenAI-Codex", label: "Codex", handoffState: "ready" } }),
  }));
  const child = await json<ApiQuestResponse>(await call("/v1/quests", {
    method: "POST",
    body: JSON.stringify({ kind: "todo", title: "Phase 2 child", parentQuestId: root.quest.id }),
  }));

  const treeResponse = await call("/v1/quests/tree");
  const tree = await json<{ roots: Array<{ quest: Quest; children: Array<{ quest: Quest }> }>; summary: unknown }>(treeResponse);
  assert.equal(tree.roots[0].quest.id, root.quest.id);
  assert.equal(tree.roots[0].children[0].quest.id, child.quest.id);

  const mcpTreeResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_quest_tree", arguments: {} } }),
  });
  const mcpTree = await json<McpCallResponse>(mcpTreeResponse);
  assert.deepEqual(mcpTree.result.structuredContent.summary, tree.summary);

  const preview = await json<McpCallResponse["result"]["structuredContent"]>(await call(`/v1/quests/${root.quest.id}/handoff`, {
    method: "POST",
    body: JSON.stringify({ state: "working" }),
  }));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.quest.assignee.handoffState, "working");

  const applied = await json<McpCallResponse["result"]["structuredContent"]>(await call(`/v1/quests/${root.quest.id}/handoff`, {
    method: "POST",
    body: JSON.stringify({ state: "working", expectedState: "ready", dryRun: false }),
  }));
  assert.equal(applied.quest.assignee.handoffState, "working");

  const mcpHandoffResponse = await call("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "transition_quest_handoff", arguments: { questId: root.quest.id, state: "review_required", expectedState: "working" } } }),
  });
  const mcpHandoff = await json<McpCallResponse>(mcpHandoffResponse);
  assert.equal(mcpHandoff.result.structuredContent.quest.assignee.handoffState, "review_required");
  assert.equal(mcpHandoff.result.structuredContent.dryRun, true);
});

test("gateway rejects unauthenticated API and publishes OAuth metadata", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const unauthorized = await worker.fetch(new Request("http://worker.test/v1/quests"), env, context());
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("www-authenticate"), /resource_metadata/);

  const metadata = await worker.fetch(new Request("http://worker.test/.well-known/oauth-authorization-server"), env, context());
  const body = await json<{ code_challenge_methods_supported: string[]; scopes_supported: string[] }>(metadata);
  assert.equal(body.code_challenge_methods_supported[0], "S256");
  assert.ok(body.scopes_supported.includes("quests:write"));
});

test("OAuth tokens carry and rotate the delegated Guilduo session", async () => {
  const { authenticateRequest, getKv, sha256 } = await import("../worker/src/security.ts");
  const { revokeToken, tokenEndpoint } = await import("../worker/src/oauth.ts");
  const oauthEnv = { ...env };
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
  }), { expirationTtl: 300 });

  const originalFetch = global.fetch;
  global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
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
    const tokens = await json<{ access_token: string; refresh_token: string }>(issued);
    const identity = await authenticateRequest(new Request("http://worker.test/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }), oauthEnv);
    if (!identity) throw new Error("OAuth identity was unexpectedly empty.");
    assert.equal(identity.uid, "test-user");
    assert.equal(identity.authType, "oauth");

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
  const { validateManifest } = await import("../worker/src/extensions.ts");
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
