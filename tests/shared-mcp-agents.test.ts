import test from "node:test";
import assert from "node:assert/strict";
import { Validator } from "@cfworker/json-schema";
import worker, { MCP_TOOLS } from "../worker/src/index.ts";
import { createAgent, getAgentConnection, linkAgentConnection, listAgentConnections, relinkAgentConnection, updateAgent } from "../worker/src/agent-store.ts";
import { getKv, sha256 } from "../worker/src/security.ts";
import { SqliteD1Database, hasErrorCode, asQuestForgeState } from "./test-helpers.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { migrateState } from "../server/questforge-domain.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

test("shared Agent membership migrates existing D1 connections and validates owned active IDs", async () => {
  const db = new SqliteD1Database({ throughMigration:"0010_oauth_records.sql" });
  const env: WorkerEnv = { QUESTFORGE_DB:db };
  try {
    for (const agentId of ["chat", "codex", "dots"]) await createAgent(env, "owner", { agentId, displayName:agentId });
    await createAgent(env, "other-owner", { agentId:"foreign", displayName:"Foreign" });
    await linkAgentConnection(env, "owner", "chat", { clientId:"openai", clientName:"OpenAI" });
    const before = await getAgentConnection(env, "owner", "openai");
    db.applyMigration("0011_shared_mcp_agents.sql");
    assert.deepEqual(await getAgentConnection(env, "owner", "openai"), before);
    const linked = await relinkAgentConnection(env, "owner", "chat", { clientId:"openai", clientName:"OpenAI", allowedAgentIds:["chat", "codex", "dots", "codex"] });
    assert.deepEqual(linked?.allowedAgentIds, ["chat", "codex", "dots"]);
    assert.equal(linked?.firstConnectedAt, before?.firstConnectedAt);
    assert.deepEqual((await getAgentConnection(env, "owner", "openai"))?.allowedAgentIds, ["chat", "codex", "dots"]);
    assert.equal((await listAgentConnections(env, "owner", "codex")).length, 1, "secondary Agents also see their shared connection");
    for (const [allowedAgentIds, code] of [[null, "invalid_allowed_agents"], [["foreign"], "agent_not_found"], [["bad/id"], "invalid_allowed_agents"], [Array(21).fill("chat"), "invalid_allowed_agents"]] as const) {
      await assert.rejects(relinkAgentConnection(env, "owner", "chat", { clientId:"openai", clientName:"OpenAI", allowedAgentIds }), error => hasErrorCode(error, code));
    }
    await updateAgent(env, "owner", "dots", { status:"disabled" });
    await assert.rejects(relinkAgentConnection(env, "owner", "chat", { clientId:"openai", clientName:"OpenAI", allowedAgentIds:["dots"] }), error => hasErrorCode(error, "agent_inactive"));
    assert.deepEqual((await getAgentConnection(env, "owner", "openai"))?.allowedAgentIds, ["chat", "codex", "dots"], "failed changes leave the saved membership intact");
    await updateAgent(env, "owner", "chat", { status:"disabled" });
    assert.equal((await getAgentConnection(env, "owner", "openai"))?.revokedAt, null, "disabling one Agent must not disconnect the others");
  } finally { db.close(); }
});

test("one OAuth connection isolates concurrent MCP actors without widening scopes or changing the shared link", async () => {
  const env: WorkerEnv = { DEV_BEARER_TOKEN:"web-test-token", DEV_USER_ID:"owner", ALLOWED_ORIGINS:"http://localhost:5173" };
  const current = await readState(env, "owner");
  await writeState(env, "owner", { schemaVersion:7, state:migrateState(asQuestForgeState({ schemaVersion:7 })), clientUpdatedAt:new Date().toISOString() }, current.etag);
  for (const agentId of ["chat", "codex", "dots", "unlisted"]) await createAgent(env, "owner", { agentId, displayName:agentId, allowedScopes:agentId === "codex" ? ["quests:read", "quests:write", "agents:read", "battle:write"] : ["quests:read", "agents:read"] });
  const grant = { uid:"owner", email:"owner@example.test", clientId:"shared-openai", clientName:"OpenAI", scopes:["agents:read", "agents:write", "quests:read", "quests:write"], firstConnectedAt:new Date().toISOString(), lastUsedAt:"", revokedAt:"" };
  const token = "shared-mcp-test-token";
  await getKv(env).put(`user-client:owner:${grant.clientId}`, JSON.stringify(grant));
  await getKv(env).put(`access:${await sha256(token)}`, JSON.stringify({ ...grant, expiresAt:Date.now() + 600000 }));
  const context = { waitUntil:(promise: Promise<unknown>) => { void promise.catch(() => {}); } };
  const configure = (body?: unknown) => worker.fetch(new Request(`http://worker.test/v1/agents/chat/connections/${grant.clientId}`, { method:"PUT", headers:{ authorization:"Bearer web-test-token", origin:"http://localhost:5173", "content-type":"application/json" }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) }), env, context);
  assert.equal((await configure()).status, 200, "legacy body-less PUT is compatible");
  type Result = { isError:boolean; structuredContent:{ agent?:{ agentId:string }; allowedAgentIds?:string[]; requiresAgentSelection?:boolean; effectiveExecutionScopes?:string[]; quest?:{ id:string; requester:{ id:string } }; error?:{ code:string } } };
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
    const response = await worker.fetch(new Request("http://worker.test/mcp", { method:"POST", headers:{ authorization:`Bearer ${token}`, "content-type":"application/json" }, body:JSON.stringify({ jsonrpc:"2.0", id:crypto.randomUUID(), method:"tools/call", params:{ name, arguments:args } }) }), env, context);
    const body = await response.json() as { result:Result };
    return body.result;
  };
  const legacy = await call("get_current_agent_context");
  assert.equal(legacy.isError, false, JSON.stringify(legacy));
  assert.equal(legacy.structuredContent.agent?.agentId, "chat", "legacy single-Agent calls need no new argument");
  assert.equal((await configure({ allowedAgentIds:["chat", "codex", "dots"] })).status, 200);
  assert.equal((await configure({ allowedAgentIds:["missing"] })).status, 404);
  const discovery = await call("get_current_agent_context");
  assert.deepEqual(discovery.structuredContent.allowedAgentIds, ["chat", "codex", "dots"]);
  assert.equal(discovery.structuredContent.requiresAgentSelection, true);
  assert.equal((await call("list_quests")).structuredContent.error?.code, "acting_agent_required");
  assert.equal((await call("list_quests", { actingAgentId:"unlisted" })).structuredContent.error?.code, "agent_not_allowed");
  assert.equal((await call("list_quests", { actingAgentId:null })).structuredContent.error?.code, "invalid_acting_agent");
  assert.equal((await call("link_agent", { agentId:"dots" })).structuredContent.error?.code, "shared_connection_managed");
  for (const result of await Promise.all(["chat", "codex", "dots"].map(async actingAgentId => ({ actingAgentId, value:await call("get_current_agent_context", { actingAgentId }) })))) {
    assert.equal(result.value.structuredContent.agent?.agentId, result.actingAgentId);
    assert.equal(result.value.structuredContent.effectiveExecutionScopes?.includes("battle:write"), false, "Agent policy cannot exceed OAuth grant");
    assert.equal(new Validator(MCP_TOOLS.find(tool => tool.name === "get_current_agent_context")!.outputSchema as Record<string, unknown>).validate(result.value.structuredContent).valid, true);
  }
  assert.equal((await call("create_quest", { actingAgentId:"chat", kind:"todo", title:"Must not write" })).structuredContent.error?.code, "insufficient_scope");
  const created = await call("create_quest", { actingAgentId:"codex", kind:"todo", title:"Codex-owned request" });
  assert.equal(created.isError, false, JSON.stringify(created));
  assert.equal(created.structuredContent.quest?.requester.id, "codex");
  const sdkResponse = await worker.fetch(new Request("http://worker.test/mcp-next", { method:"POST", headers:{ authorization:`Bearer ${token}`, accept:"application/json, text/event-stream", host:"worker.test", "content-type":"application/json" }, body:JSON.stringify({ jsonrpc:"2.0", id:"shared-sdk", method:"tools/call", params:{ name:"get_current_agent_context", arguments:{ actingAgentId:"dots" } } }) }), env, context);
  assert.equal(sdkResponse.status, 200);
  const sdkData = (await sdkResponse.text()).split("\n").find(line => line.startsWith("data:"));
  assert.ok(sdkData);
  const sdk = JSON.parse(sdkData.slice(5)) as { result:Result };
  assert.equal(sdk.result.structuredContent.agent?.agentId, "dots", "the SDK MCP lane selects the same per-call identity");
  assert.equal((await getAgentConnection(env, "owner", grant.clientId))?.agentId, "chat", "per-call identity never rewrites the connection");
  await updateAgent(env, "owner", "dots", { status:"disabled" });
  assert.equal((await call("list_quests", { actingAgentId:"dots" })).structuredContent.error?.code, "agent_inactive");
  assert.equal((await call("get_current_agent_context", { actingAgentId:"codex" })).structuredContent.agent?.agentId, "codex");
  await updateAgent(env, "owner", "chat", { status:"disabled" });
  assert.equal((await call("list_quests", { actingAgentId:"chat" })).structuredContent.error?.code, "agent_inactive");
  assert.equal((await call("get_current_agent_context", { actingAgentId:"codex" })).structuredContent.agent?.agentId, "codex");
  for (const tool of MCP_TOOLS) assert.equal(tool.inputSchema.properties.actingAgentId.type, "string");
  await call("unlink_agent");
  assert.equal((await call("list_quests", { actingAgentId:"codex" })).structuredContent.error?.code, "agent_not_allowed");
});
