const test = require("node:test");
const assert = require("node:assert/strict");
import { Validator } from "@cfworker/json-schema";
import { getKv, sha256 } from "../worker/src/security.ts";
import type { AuthIdentity } from "../worker/src/security.ts";
import type { D1DatabaseLike, D1StatementLike, WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState, FakeR2Bucket, hasErrorCode, json, SqliteD1Database, type TestContext, type TestRequestOptions } from "./test-helpers.ts";

const env: WorkerEnv = { DEV_BEARER_TOKEN: "agent-test-token", DEV_USER_ID: "agent-user", ALLOWED_ORIGINS: "http://localhost:5173" };
const context: TestContext = { waitUntil(promise: Promise<unknown>): void { promise.catch(() => {}); } };

async function workerCall(path: string, options: TestRequestOptions = {}): Promise<Response> {
  const worker = (await import("../worker/src/index.ts")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, {
    ...options,
    headers: { authorization: "Bearer agent-test-token", origin: "http://localhost:5173", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  }), env, context);
}

async function workerCallUnauthenticated(path: string, options: TestRequestOptions = {}): Promise<Response> {
  const worker = (await import("../worker/src/index.ts")).default;
  return worker.fetch(new Request(`http://worker.test${path}`, { ...options, headers: { origin: "http://localhost:5173", ...(options.headers || {}) } }), env, context);
}

async function seedOAuthConnection(clientId: string, scopes: string[], token = `oauth-${clientId}`): Promise<string> {
  const firstConnectedAt = "2026-05-01T00:00:00.000Z";
  const grant = {
    uid: "agent-user",
    email: "agent@example.com",
    clientId,
    clientName: "Test MCP",
    scopes,
    firstConnectedAt,
    lastUsedAt: firstConnectedAt,
    revokedAt: "",
  };
  const kv = getKv(env);
  await kv.put(`user-client:agent-user:${clientId}`, JSON.stringify(grant));
  await kv.put(`access:${await sha256(token)}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 60 * 60 * 1000 }));
  return token;
}

async function mcpOAuthCall(token: string, name: string, args: Record<string, unknown> = {}): Promise<Response> {
  return mcpOAuthRequest(token, "tools/call", { name, arguments: args });
}

async function mcpOAuthRequest(token: string, method: string, params: Record<string, unknown> = {}): Promise<Response> {
  const worker = (await import("../worker/src/index.ts")).default;
  return worker.fetch(new Request("http://worker.test/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, origin: "http://localhost:5173", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  }), env, context);
}

type McpToolContract = { name: string; outputSchema?: Record<string, unknown> };
type McpToolResult = { result: { isError?: boolean; structuredContent: unknown } };

function assertMatchesDeclaredOutput(tool: McpToolContract, response: McpToolResult): void {
  if (!tool.outputSchema) throw new Error(`${tool.name} must declare an outputSchema`);
  const validation = new Validator(tool.outputSchema).validate(response.result.structuredContent);
  assert.equal(validation.valid, true, `${tool.name} structuredContent must match outputSchema: ${JSON.stringify(validation.errors)}`);
}

const WEBP_MAGIC = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
const NOT_AN_IMAGE = new TextEncoder().encode("<script>alert(1)</script>");

test.beforeEach(async () => {
  delete env.AGENT_AVATARS;
  delete env.QUESTFORGE_DB;
  const agentStore = await import("../worker/src/agent-store.ts");
  agentStore.resetAgentMemoryForTests();
  const { writeState, readState } = await import("../worker/src/appwrite-store.ts");
  const current = await readState(env, "agent-user");
  await writeState(env, "agent-user", { schemaVersion: 6, state: asQuestForgeState({ schemaVersion: 6, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {}, character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] }, battle: { mp: 0, maxMp: 80 }, boss: { hp: 100, maxHp: 100 } }), clientUpdatedAt: new Date().toISOString() }, current.etag);
});

test("MCP Agent link tools persist, authorize, unlink, and relink the current OAuth connection", async () => {
  const agentStore = await import("../worker/src/agent-store.ts");
  await agentStore.createAgent(env, "agent-user", { agentId: "first", displayName: "First Agent" });
  await agentStore.createAgent(env, "agent-user", { agentId: "second", displayName: "Second Agent" });
  const token = await seedOAuthConnection("mcp-link-client", ["agents:read", "agents:write"]);

  const before = await json<{ result: { structuredContent: { linked: boolean; connection: { clientName: string } } } }>(await mcpOAuthCall(token, "get_agent_link"));
  assert.equal(before.result.structuredContent.linked, false);
  assert.equal(before.result.structuredContent.connection.clientName, "Test MCP");

  const linked = await json<{ result: { structuredContent: { linked: boolean; relinked: boolean; agent: { agentId: string; displayName: string } } } }>(await mcpOAuthCall(token, "link_agent", { agentId: "first" }));
  assert.equal(linked.result.structuredContent.linked, true);
  assert.equal(linked.result.structuredContent.relinked, false);
  assert.equal(linked.result.structuredContent.agent.agentId, "first");
  assert.equal(linked.result.structuredContent.agent.displayName, "First Agent");

  const relinked = await json<{ result: { structuredContent: { linked: boolean; relinked: boolean; agent: { agentId: string } } } }>(await mcpOAuthCall(token, "link_agent", { agentId: "second" }));
  assert.equal(relinked.result.structuredContent.linked, true);
  assert.equal(relinked.result.structuredContent.relinked, true);
  assert.equal(relinked.result.structuredContent.agent.agentId, "second");

  const unlinked = await json<{ result: { structuredContent: { linked: boolean; unlinked: boolean; agent: { agentId: string } | null } } }>(await mcpOAuthCall(token, "unlink_agent"));
  assert.equal(unlinked.result.structuredContent.linked, false);
  assert.equal(unlinked.result.structuredContent.unlinked, true);
  assert.equal(unlinked.result.structuredContent.agent?.agentId, "second");
  assert.equal((await agentStore.getAgentConnection(env, "agent-user", "mcp-link-client"))?.revokedAt !== null, true);
  const stillAuthenticated = await (await import("../worker/src/security.ts")).authenticateRequest(new Request("http://worker.test/mcp", {
    headers: { authorization: `Bearer ${token}` },
  }), env);
  assert.equal(stillAuthenticated?.clientId, "mcp-link-client", "unlinking must not revoke the OAuth grant");
});

test("Agent-link MCP structuredContent passes strict declared outputSchema validation", async () => {
  const agentStore = await import("../worker/src/agent-store.ts");
  await agentStore.createAgent(env, "agent-user", {
    agentId: "openclaw",
    displayName: "OpenClaw",
    provider: "openclaw",
    allowedScopes: ["quests:read"],
  });
  const token = await seedOAuthConnection("openclaw-client", ["agents:read", "agents:write", "quests:read", "quests:write"]);
  const listedTools = await json<{ result: { tools: McpToolContract[] } }>(await mcpOAuthRequest(token, "tools/list"));
  const contracts = new Map(listedTools.result.tools.map((tool) => [tool.name, tool]));
  const callAndValidate = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await json<McpToolResult>(await mcpOAuthCall(token, name, args));
    assert.equal(response.result.isError, false, `${name} should succeed`);
    const contract = contracts.get(name);
    if (!contract) throw new Error(`${name} must be listed`);
    assertMatchesDeclaredOutput(contract, response);
    return response.result.structuredContent as Record<string, unknown>;
  };

  const before = await callAndValidate("get_current_agent_context");
  assert.deepEqual(before.connectionScopes, ["agents:read", "agents:write", "quests:read", "quests:write"]);
  assert.deepEqual(before.effectiveExecutionScopes, before.connectionScopes);
  assert.equal(before.linked, false);

  await callAndValidate("list_registered_agents");
  await callAndValidate("link_agent", { agentId: "openclaw" });
  await callAndValidate("get_agent_link");
  const after = await callAndValidate("get_current_agent_context");
  assert.deepEqual(after.connectionScopes, before.connectionScopes, "linking must not mutate the OAuth connection grant");
  assert.deepEqual(after.agentAllowedScopes, ["quests:read"]);
  assert.deepEqual(after.effectiveExecutionScopes, ["quests:read"]);
  assert.equal((after.effectiveExecutionScopes as string[]).includes("agents:write"), false);

  await callAndValidate("link_agent", { agentId: "openclaw" });
  await callAndValidate("unlink_agent");
});

test("linked Agent control-plane reads use connection scopes while execution uses the scope intersection", async () => {
  const agentStore = await import("../worker/src/agent-store.ts");
  await agentStore.createAgent(env, "agent-user", {
    agentId: "restricted",
    displayName: "Restricted Agent",
    allowedScopes: ["quests:read"],
  });
  const token = await seedOAuthConnection("mcp-control-scopes", ["agents:read", "agents:write", "quests:read", "quests:write"]);
  await agentStore.linkAgentConnection(env, "agent-user", "restricted", {
    clientId: "mcp-control-scopes",
    clientName: "Test MCP",
    scopes: ["agents:read", "agents:write", "quests:read", "quests:write"],
  });

  const contextResponse = await json<{ result: { isError: boolean; structuredContent: {
    linked: boolean;
    connectionScopes: string[];
    agentAllowedScopes: string[];
    effectiveExecutionScopes: string[];
    effectiveScopes: string[];
  } } }>(await mcpOAuthCall(token, "get_current_agent_context"));
  assert.equal(contextResponse.result.isError, false);
  assert.equal(contextResponse.result.structuredContent.linked, true);
  assert.deepEqual(contextResponse.result.structuredContent.connectionScopes, ["agents:read", "agents:write", "quests:read", "quests:write"]);
  assert.deepEqual(contextResponse.result.structuredContent.agentAllowedScopes, ["quests:read"]);
  assert.deepEqual(contextResponse.result.structuredContent.effectiveExecutionScopes, ["quests:read"]);
  assert.deepEqual(contextResponse.result.structuredContent.effectiveScopes, ["quests:read"]);

  const listed = await json<{ result: { isError: boolean; structuredContent: { agents: Array<{ agentId: string }> } } }>(await mcpOAuthCall(token, "list_registered_agents"));
  assert.equal(listed.result.isError, false);
  assert.ok(listed.result.structuredContent.agents.some((agent) => agent.agentId === "restricted"));

  const linkInfo = await json<{ result: { isError: boolean; structuredContent: { linked: boolean } } }>(await mcpOAuthCall(token, "get_agent_link"));
  assert.equal(linkInfo.result.isError, false);
  assert.equal(linkInfo.result.structuredContent.linked, true);

  const executionDenied = await json<{ result: { isError: boolean; structuredContent: { error: { code: string } } } }>(await mcpOAuthCall(token, "create_quest", { kind: "todo", title: "should be denied" }));
  assert.equal(executionDenied.result.isError, true);
  assert.equal(executionDenied.result.structuredContent.error.code, "insufficient_scope");
});

test("MCP Agent linking rejects foreign or nonexistent Agents and preserves old unlinked connections", async () => {
  const agentStore = await import("../worker/src/agent-store.ts");
  await agentStore.createAgent(env, "other-user", { agentId: "private", displayName: "Private Agent" });
  const token = await seedOAuthConnection("mcp-read-only", ["agents:read"]);

  const current = await json<{ result: { structuredContent: { linked: boolean } } }>(await mcpOAuthCall(token, "get_agent_link"));
  assert.equal(current.result.structuredContent.linked, false);

  const writeToken = await seedOAuthConnection("mcp-write-foreign", ["agents:read", "agents:write"]);
  const foreign = await json<{ result: { isError: boolean; structuredContent: { error: { code: string } } } }>(await mcpOAuthCall(writeToken, "link_agent", { agentId: "private" }));
  assert.equal(foreign.result.isError, true);
  assert.equal(foreign.result.structuredContent.error.code, "agent_not_found");

  const readOnlyLinkAttempt = await json<{ result: { isError: boolean; structuredContent: { error: { code: string } } } }>(await mcpOAuthCall(token, "link_agent", { agentId: "private" }));
  assert.equal(readOnlyLinkAttempt.result.isError, true);
  assert.equal(readOnlyLinkAttempt.result.structuredContent.error.code, "insufficient_scope");

  const nonexistent = await json<{ result: { isError: boolean; structuredContent: { error: { code: string } } } }>(await mcpOAuthCall(writeToken, "link_agent", { agentId: "missing" }));
  assert.equal(nonexistent.result.isError, true);
  assert.equal(nonexistent.result.structuredContent.error.code, "agent_not_found");
});

test("MCP Agent link tools require an authenticated OAuth connection", async () => {
  const response = await workerCallUnauthenticated("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_agent_link", arguments: {} } }) });
  assert.equal(response.status, 401);
});

class ThrowAfterAvatarCommitStatement implements D1StatementLike {
  constructor(private readonly inner: D1StatementLike, private readonly throwAfterRun: boolean) {}

  bind(...values: unknown[]): D1StatementLike {
    return new ThrowAfterAvatarCommitStatement(this.inner.bind(...values), this.throwAfterRun);
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.inner.first<T>();
  }

  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
    return this.inner.all<T>();
  }

  async run(): Promise<{ meta?: { changes?: number } }> {
    const result = await this.inner.run();
    if (this.throwAfterRun) throw Object.assign(new Error("simulated ambiguous D1 result"), { code: "d1_result_unknown" });
    return result;
  }
}

class ThrowAfterAvatarCommitDatabase implements D1DatabaseLike {
  constructor(private readonly inner: D1DatabaseLike) {}

  prepare(query: string): D1StatementLike {
    const avatarUpdate = /^UPDATE agent_registry_agents SET avatar_version/i.test(query.trim());
    return new ThrowAfterAvatarCommitStatement(this.inner.prepare(query), avatarUpdate);
  }

  async batch(): Promise<Array<{ meta?: { changes?: number } }>> {
    throw new Error("batch is not used by the avatar activation route");
  }
}

test("REST Agent Registry and MCP assignment share one registered Agent", async () => {
  const registeredResponse = await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan", provider: "openai", role: "engineer" }) });
  assert.equal(registeredResponse.status, 201);
  const registered = await json<{ agent: { agentId: string; allowedScopes: string[] } }>(registeredResponse);
  assert.equal(registered.agent.agentId, "codex");
  assert.equal(registered.agent.allowedScopes.includes("quests:write"), true);

  const created = await json<{ quest: { id: string; updatedAt: string } }>(await workerCall("/v1/quests", { method: "POST", body: JSON.stringify({ kind: "todo", title: "Agentへ渡す" }) }));
  const listCall = await workerCall("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_registered_agents", arguments: {} } }) });
  const listed = await json<{ result: { structuredContent: { agents: Array<{ agentId: string }> } } }>(listCall);
  assert.equal(listed.result.structuredContent.agents[0].agentId, "codex");

  const previewCall = await workerCall("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "assign_quest_to_agent", arguments: { questId: created.quest.id, agentId: "codex" } } }) });
  const preview = await json<{ result: { structuredContent: { dryRun: boolean; quest: { assignee: { id: string } } } } }>(previewCall);
  assert.equal(preview.result.structuredContent.dryRun, true);
  assert.equal(preview.result.structuredContent.quest.assignee.id, "codex");

  const executeCall = await workerCall("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "assign_quest_to_agent", arguments: { questId: created.quest.id, agentId: "codex", expectedUpdatedAt: created.quest.updatedAt, dryRun: false } } }) });
  const executed = await json<{ result: { structuredContent: { dryRun: boolean; quest: { assignee: { label: string } } } } }>(executeCall);
  assert.equal(executed.result.structuredContent.dryRun, false);
  assert.equal(executed.result.structuredContent.quest.assignee.label, "Cyan");
});

test("OAuth identities cannot change Agent Registry settings", async () => {
  const { routeApi } = await import("../worker/src/index.ts");
  await assert.rejects(
    routeApi(new Request("http://worker.test/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "unsafe", displayName: "Unsafe" }) }), env, context, { uid: "agent-user", email: "test@example.com", authType: "oauth", scopes: ["agents:read"] } as AuthIdentity, "/v1/agents"),
    (error: unknown) => hasErrorCode(error, "agent_registry_web_required"),
  );
});

test("avatar GET requires a Bearer token; a plain unauthenticated request is rejected", async () => {
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  const response = await workerCallUnauthenticated("/v1/agents/codex/avatar");
  assert.equal(response.status, 401);
});

test("avatar GET on another user's Agent 404s rather than leaking existence", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });

  const { routeApi } = await import("../worker/src/index.ts");
  await assert.rejects(
    routeApi(new Request("http://worker.test/v1/agents/codex/avatar", { method: "GET" }), env, context,
      { uid: "someone-else", email: "other@example.com", authType: "dev", scopes: ["agents:read"] } as AuthIdentity, "/v1/agents/codex/avatar"),
    (error: unknown) => hasErrorCode(error, "agent_not_found"),
  );
});

test("without an R2 binding, an avatar upload fails closed with 503 and leaves the Agent's hasCustomAvatar untouched", async () => {
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  const putResponse = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });
  assert.equal(putResponse.status, 503);
  const body = await json<{ error: { code: string } }>(putResponse);
  assert.equal(body.error.code, "avatar_storage_unavailable");

  const agentResponse = await json<{ agent: { hasCustomAvatar: boolean; avatarVersion: number } }>(await workerCall("/v1/agents/codex"));
  assert.equal(agentResponse.agent.hasCustomAvatar, false);
  assert.equal(agentResponse.agent.avatarVersion, 0);
});

test("owner + correct version gets the image back with the right content-type; a stale version 404s", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  const putResponse = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });
  assert.equal(putResponse.status, 200);
  const { avatarVersion } = await json<{ avatarVersion: number }>(putResponse);
  assert.equal(avatarVersion, 1);

  const getResponse = await workerCall(`/v1/agents/codex/avatar?v=${avatarVersion}`);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("content-type"), "image/webp");
  assert.equal(getResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await getResponse.arrayBuffer()), WEBP_MAGIC);

  const staleResponse = await workerCall(`/v1/agents/codex/avatar?v=${avatarVersion + 1}`);
  assert.equal(staleResponse.status, 404);
  const staleBody = await json<{ error: { code: string } }>(staleResponse);
  assert.equal(staleBody.error.code, "avatar_version_stale");
});

test("an upload of exactly 300 KB succeeds; one byte over is rejected with 413", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });

  const exact = new Uint8Array(300 * 1024);
  exact.set(WEBP_MAGIC);
  const exactResponse = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: exact, headers: { "content-type": "application/octet-stream" } });
  assert.equal(exactResponse.status, 200);

  const oversized = new Uint8Array(300 * 1024 + 1);
  oversized.set(WEBP_MAGIC);
  const oversizedResponse = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: oversized, headers: { "content-type": "application/octet-stream" } });
  assert.equal(oversizedResponse.status, 413);
});

test("a chunked upload with no declared Content-Length is still cancelled mid-stream once it exceeds the cap", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });

  const chunkSize = 64 * 1024;
  const chunk = new Uint8Array(chunkSize);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent > 300 * 1024) { controller.close(); return; }
      controller.enqueue(chunk);
      sent += chunkSize;
    },
  });
  const response = await workerCall("/v1/agents/codex/avatar", {
    method: "PUT",
    body: stream,
    duplex: "half",
    headers: { "content-type": "application/octet-stream" },
  });
  assert.equal(response.status, 413);
});

test("a declared MIME that does not match the real magic bytes is rejected with 415", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  const response = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: NOT_AN_IMAGE, headers: { "content-type": "image/png" } });
  assert.equal(response.status, 415);
});

test("avatar GET fails closed (400) on a missing, zero, negative, decimal, or otherwise malformed v — none of them get the immutable cache header", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });

  const noVersion = await workerCall("/v1/agents/codex/avatar");
  assert.equal(noVersion.status, 400);
  assert.equal((await json<{ error: { code: string } }>(noVersion)).error.code, "avatar_version_required");
  assert.equal(noVersion.headers.get("cache-control"), null);

  for (const malformed of ["0", "-1", "1.5", "abc", "1e2", "01", "+1", "NaN", "Infinity", " 1", "1 ", ""]) {
    const response = await workerCall(`/v1/agents/codex/avatar?v=${encodeURIComponent(malformed)}`);
    assert.equal(response.status, 400, `v=${JSON.stringify(malformed)} should be 400 avatar_version_required, got ${response.status}`);
    assert.equal((await json<{ error: { code: string } }>(response)).error.code, "avatar_version_required", `v=${JSON.stringify(malformed)}`);
    assert.equal(response.headers.get("cache-control"), null, `v=${JSON.stringify(malformed)} must never get a cache header`);
  }
});

test("avatar GET rejects an absurdly large v as a stale version (404), not a crash or a cache hit", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });

  const response = await workerCall(`/v1/agents/codex/avatar?v=${"9".repeat(40)}`);
  assert.equal(response.status, 404);
  assert.equal((await json<{ error: { code: string } }>(response)).error.code, "avatar_version_stale");
  assert.equal(response.headers.get("cache-control"), null);
});

test("avatar GET with the correct positive-integer version is the only shape that gets the immutable cache header", async () => {
  env.AGENT_AVATARS = new FakeR2Bucket();
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  const putResponse = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });
  const { avatarVersion } = await json<{ avatarVersion: number }>(putResponse);

  const correct = await workerCall(`/v1/agents/codex/avatar?v=${avatarVersion}`);
  assert.equal(correct.status, 200);
  assert.match(correct.headers.get("cache-control") || "", /immutable/);

  const oneAhead = await workerCall(`/v1/agents/codex/avatar?v=${avatarVersion + 1}`);
  assert.equal(oneAhead.status, 404);
  assert.equal(oneAhead.headers.get("cache-control"), null);
});

test("a 409 from a stale X-Expected-Updated-At deletes the orphaned R2 candidate and leaves the previous image servable", async () => {
  const bucket = new FakeR2Bucket();
  env.AGENT_AVATARS = bucket;
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  const firstPut = await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });
  assert.equal(firstPut.status, 200);
  assert.equal(bucket.store.size, 1);

  const conflictResponse = await workerCall("/v1/agents/codex/avatar", {
    method: "PUT", body: WEBP_MAGIC,
    headers: { "content-type": "application/octet-stream", "x-expected-updated-at": "2000-01-01T00:00:00.000Z" },
  });
  assert.equal(conflictResponse.status, 409);
  // The losing candidate's R2 object must be cleaned up, not left orphaned.
  assert.equal(bucket.store.size, 1);

  const getResponse = await workerCall("/v1/agents/codex/avatar?v=1");
  assert.equal(getResponse.status, 200);
  assert.deepEqual(new Uint8Array(await getResponse.arrayBuffer()), WEBP_MAGIC);
});

test("when the orphan-cleanup R2 delete itself fails, the failure is logged (not swallowed) and the original 409 still reaches the caller", async () => {
  const bucket = new FakeR2Bucket();
  let deleteAttempts = 0;
  bucket.delete = async () => {
    deleteAttempts += 1;
    throw new Error("simulated R2 delete failure");
  };
  env.AGENT_AVATARS = bucket;
  await workerCall("/v1/agents", { method: "POST", body: JSON.stringify({ agentId: "codex", displayName: "Cyan" }) });
  await workerCall("/v1/agents/codex/avatar", { method: "PUT", body: WEBP_MAGIC, headers: { "content-type": "application/octet-stream" } });

  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const conflictResponse = await workerCall("/v1/agents/codex/avatar", {
      method: "PUT", body: WEBP_MAGIC,
      headers: { "content-type": "application/octet-stream", "x-expected-updated-at": "2000-01-01T00:00:00.000Z" },
    });
    // The cleanup failure must never mask or replace the real result.
    assert.equal(conflictResponse.status, 409);
    assert.equal((await json<{ error: { code: string } }>(conflictResponse)).error.code, "agent_conflict");
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(deleteAttempts, 1);
  const orphanLog = logged.find((entry) => entry[0] === "agent_avatar_orphan_cleanup_failed");
  assert.ok(orphanLog, "the failed cleanup must be logged, not silently discarded");
  const payload = orphanLog?.[1] as { operation: string; assetId: string; agentId: string; errorCode: string };
  assert.equal(payload.operation, "delete_orphaned_avatar_asset");
  assert.equal(payload.agentId, "codex");
  assert.equal(typeof payload.assetId, "string");
  assert.ok(payload.assetId.length > 0);
  // No token, secret, API key, or full request body ever reaches the log.
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ["token", "secret", "apikey", "bearer", "webp"]) {
    assert.equal(serialized.includes(forbidden), false, `log payload must not contain "${forbidden}"`);
  }
});

test("an ambiguous D1 result after avatar activation never deletes the R2 object that D1 may reference", async () => {
  const db = new SqliteD1Database();
  const bucket = new FakeR2Bucket();
  const agentStore = await import("../worker/src/agent-store.ts");
  await agentStore.createAgent({ QUESTFORGE_DB: db }, "agent-user", { agentId: "codex", displayName: "Cyan" });
  env.QUESTFORGE_DB = new ThrowAfterAvatarCommitDatabase(db);
  env.AGENT_AVATARS = bucket;

  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const response = await workerCall("/v1/agents/codex/avatar", {
      method: "PUT",
      body: WEBP_MAGIC,
      headers: { "content-type": "application/octet-stream" },
    });
    assert.equal(response.status, 500);
    const row = db.raw.prepare("SELECT avatar_asset_id FROM agent_registry_agents WHERE uid = ? AND agent_id = ?").get("agent-user", "codex") as { avatar_asset_id: string };
    assert.equal(typeof row.avatar_asset_id, "string");
    assert.ok(bucket.store.has(`agents/avatars/${row.avatar_asset_id}`), "an ambiguously committed active asset must be retained");
    const outcomeLog = logged.find((entry) => entry[0] === "agent_avatar_activation_outcome_unknown");
    assert.ok(outcomeLog);
    const payload = outcomeLog?.[1] as { errorCode: string; agentId: string; assetId: string };
    assert.equal(payload.errorCode, "d1_result_unknown");
    assert.equal(payload.agentId, "codex");
    assert.equal(payload.assetId, row.avatar_asset_id);
  } finally {
    console.error = originalConsoleError;
    delete env.QUESTFORGE_DB;
    db.close();
  }
});
