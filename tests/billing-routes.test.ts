import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.ts";
import { createAgent, relinkAgentConnection } from "../worker/src/agent-store.ts";
import { selectFreeAgents } from "../worker/src/billing-store.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { migrateState } from "../server/questforge-domain.ts";
import { getOAuthRecordStore } from "../worker/src/oauth-record-store.ts";
import { sha256 } from "../worker/src/security.ts";
import { SqliteD1Database } from "./test-helpers.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import type { QuestForgeState } from "../types/questforge.ts";

const context = { waitUntil(promise: Promise<unknown>) { void promise.catch(() => {}); } };
function fixture() {
  const db = new SqliteD1Database();
  const env: WorkerEnv = { QUESTFORGE_DB: db, DEV_BEARER_TOKEN: "human-test", DEV_USER_ID: "owner", BILLING_MODE: "test", PUBLIC_BASE_URL: "http://worker.test", MCP_ALLOWED_ORIGINS: "http://worker.test", ALLOWED_ORIGINS: "http://localhost:5173" };
  const call = (path: string, method = "GET", input?: unknown, token = "human-test") => worker.fetch(new Request(`http://worker.test${path}`, {
    method, headers: { authorization: `Bearer ${token}`, origin: "http://localhost:5173", "content-type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  }), env, context);
  return { db, env, call };
}

test("billing routes reject OAuth purchasing, malformed input and unavailable sales; responses are private", async () => {
  const { db, env, call } = fixture();
  try {
    env.BILLING_ENABLED = "true";
    const grant = { uid: "owner", clientId: "test-client", clientName: "Test", scopes: ["agents:read", "quests:read"], revokedAt: "" };
    const store = getOAuthRecordStore(env);
    await store.put(`user-client:owner:${grant.clientId}`, JSON.stringify(grant));
    await store.put(`access:${await sha256("agent-token")}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 60000 }));
    assert.equal((await call("/v1/billing", "GET", undefined, "agent-token")).status, 403);
    assert.equal((await call("/v1/billing/checkout", "POST", { interval: "monthly" })).status, 503);
    assert.equal((await call("/v1/billing/checkout", "POST", { interval: "month" })).status, 400);
    assert.equal((await call("/v1/billing/agents", "PUT", { agentIds: [], plan: "pro" })).status, 400);
    const status = await call("/v1/billing");
    assert.equal(status.status, 200);
    assert.equal(status.headers.get("cache-control"), "no-store");
    assert.equal((await status.json() as { plan: string }).plan, "free");
    assert.equal((await call("/v1/billing/admin/report")).status, 403);
    assert.equal((await call("/v1/billing/admin/decisions")).status, 403);
    assert.equal((await call("/v1/billing/admin/decisions/reconcile", "POST", { uid: "owner", requestId: "unknown" })).status, 403);
    env.BILLING_ADMIN_TOKEN = "separate-operator-token";
    const pending = await call("/v1/billing/admin/decisions", "GET", undefined, env.BILLING_ADMIN_TOKEN);
    assert.equal(pending.status, 200); assert.equal(pending.headers.get("cache-control"), "no-store");
    assert.equal((await call("/v1/billing/admin/decisions/reconcile", "POST", { uid: "owner", requestId: "unknown", outcome: "return" }, env.BILLING_ADMIN_TOKEN)).status, 400);
    assert.equal((await call("/v1/billing/admin/decisions/reconcile", "POST", { uid: "owner", requestId: "unknown" }, env.BILLING_ADMIN_TOKEN)).status, 404);
  } finally { db.close(); }
});

test("retained Free Agents cannot bypass access through Quest creation, snapshots or shared MCP", async () => {
  const { db, env, call } = fixture();
  try {
    for (const agentId of ["one", "two", "three"]) await createAgent(env, "owner", { agentId, displayName: agentId });
    const state = migrateState({ schemaVersion: 7 } as QuestForgeState);
    const previous = await readState(env, "owner");
    await writeState(env, "owner", { state, schemaVersion: 7, clientUpdatedAt: new Date().toISOString() }, previous.etag);
    const grant = { uid: "owner", clientId: "shared", clientName: "Shared", scopes: ["agents:read", "quests:read", "quests:write"], revokedAt: "" };
    const store = getOAuthRecordStore(env);
    await store.put("user-client:owner:shared", JSON.stringify(grant));
    await store.put(`access:${await sha256("shared-token")}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 60000 }));
    await relinkAgentConnection(env, "owner", "one", { clientId: "shared", clientName: "Shared", scopes: grant.scopes, allowedAgentIds: ["one", "two", "three"] });
    env.BILLING_ENABLED = "true";
    await selectFreeAgents(env, "owner", ["two", "three"]);
    const input = { kind: "todo", title: "Restricted", assignee: { type: "agent", id: "one", label: "one", handoffState: "ready" } };
    assert.equal((await call("/v1/quests", "POST", input)).status, 403);
    const allowed = await call("/v1/quests", "POST", { ...input, assignee: { ...input.assignee, id: "two" } });
    assert.equal(allowed.status, 201);
    const snapshot = (await readState(env, "owner")).payload.state!;
    snapshot.tasks[0]!.assignee = { ...snapshot.tasks[0]!.assignee!, id: "one", type: "agent" };
    assert.equal((await call("/v1/state", "PUT", { state: snapshot })).status, 403);
    for (const [actingAgentId, isError] of [["one", true], ["two", false]] as const) {
      const response = await call("/mcp", "POST", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_quests", arguments: { actingAgentId } } }, "shared-token");
      assert.equal((await response.json() as { result: { isError: boolean } }).result.isError, isError);
    }
    const page = await call("/v1/agents?limit=1&includeArchived=true");
    const first = await page.json() as { agents: Array<{ planAllowed: boolean }>; nextCursor: string | null };
    assert.equal(first.agents.length, 1);
    assert.equal(typeof first.agents[0]!.planAllowed, "boolean");
    assert.ok(first.nextCursor);
    const saved = (await readState(env, "owner")).payload.state!;
    assert.equal(saved.tasks[0]!.assignee?.id, "two");
    const disabled = await call("/v1/agents/one", "PATCH", { status: "disabled" });
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json() as { agent: { planAllowed: boolean } }).agent.planAllowed, false);
    const shared = await call("/mcp", "POST", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_quests", arguments: { actingAgentId: "two" } } }, "shared-token");
    assert.equal(shared.status, 200, "disabling one Agent must preserve the shared OAuth grant");
    assert.equal((await shared.json() as { result: { isError: boolean } }).result.isError, false);
    assert.equal((await call("/v1/agents/three", "PATCH", { status: "disabled" })).status, 200);
    saved.tasks[0]!.assignee = { ...saved.tasks[0]!.assignee!, id: "three", type: "agent" };
    assert.equal((await call("/v1/state", "PUT", { state: saved })).status, 409, "snapshots cannot assign a selected but disabled Agent");
  } finally { db.close(); }
});
