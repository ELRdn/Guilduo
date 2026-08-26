const test = require("node:test");
const assert = require("node:assert/strict");
import type { JsonRecord, WorkerEnv } from "../worker/src/worker-types.ts";
import type { AgentRecord } from "../worker/src/agent-store.ts";
import { hasErrorCode, required } from "./test-helpers.ts";

type AgentStore = typeof import("../worker/src/agent-store.ts");

let agents: AgentStore;

test.before(async () => {
  agents = await import("../worker/src/agent-store.ts");
});

test.beforeEach(() => agents?.resetAgentMemoryForTests());

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => hasErrorCode(error, code));
}

function defaultAgent(agentId = "assistant") {
  return {
    agentId,
    displayName: "Quest Assistant",
    provider: "anthropic",
    role: "assistant",
    instructions: "Help the user focus.",
    allowedScopes: ["quests:read", "quests:write", "webhooks:manage"],
    defaultHandoffState: "ready",
    reviewRequired: true,
    dryRunDefault: false,
  };
}

test("new agents default to user-equivalent approved scopes", async () => {
  const env: WorkerEnv = {};
  const created = required(await agents.createAgent(env, "alpha", {
    agentId: "codex",
    displayName: "Codex",
  }));
  assert.ok(created.allowedScopes.includes("quests:write"));
  assert.ok(created.allowedScopes.includes("agents:read"));
  assert.ok(created.allowedScopes.includes("webhooks:manage"));
});

async function create(env: WorkerEnv, uid: string, agentId = "assistant", extra: JsonRecord = {}): Promise<AgentRecord> {
  const created = await agents.createAgent(env, uid, { ...defaultAgent(agentId), ...extra });
  return required(created);
}

test("agent IDs are validated as lowercase ASCII slugs and are create-only", async () => {
  const env: WorkerEnv = {};
  assert.equal(agents.validateAgentId("  My-Agent "), "my-agent");
  assert.equal(agents.validateAgentId("UPPER"), "upper");
  assert.throws(() => agents.validateAgentId("has space"), (error: unknown) => hasErrorCode(error, "agent_id_invalid"));
  assert.throws(() => agents.validateAgentId("-leading"), (error: unknown) => hasErrorCode(error, "agent_id_invalid"));
  assert.throws(() => agents.validateAgentId("trailing-"), (error: unknown) => hasErrorCode(error, "agent_id_invalid"));
  assert.throws(() => agents.validateAgentId(""), (error: unknown) => hasErrorCode(error, "agent_id_required"));
  assert.throws(() => agents.validateAgentId("a".repeat(81)), (error: unknown) => hasErrorCode(error, "agent_id_too_long"));

  const created = await create(env, "alpha");
  assert.equal(created.agentId, "assistant");
  const updated = await agents.updateAgent(env, "alpha", "assistant", { displayName: "Renamed" });
  assert.equal(updated.agentId, "assistant");
  await expectCode(agents.updateAgent(env, "alpha", "assistant", { agentId: "renamed" }), "agent_unknown_field");
});

test("create, update, and link reject unknown and secret-like fields", async () => {
  const env: WorkerEnv = {};
  await expectCode(create(env, "alpha", "good", { apiKey: "sk-123" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { token: "abc" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { password: "hunter2" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { webhookUrl: "https://example.test/hook" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { endpointUrl: "https://example.test/api" }), "agent_secret_field_rejected");
  await expectCode(create(env, "alpha", "good", { favoriteColor: "red" }), "agent_unknown_field");
  await expectCode(create(env, "alpha", "good", { createdAt: "2026-01-01T00:00:00.000Z" }), "agent_unknown_field");

  await create(env, "alpha", "good");
  await expectCode(agents.updateAgent(env, "alpha", "good", { apiKey: "sk-123" }), "agent_secret_field_rejected");
  await expectCode(agents.updateAgent(env, "alpha", "good", { instructions: "fine", randomField: 1 }), "agent_unknown_field");
  await expectCode(
    agents.linkAgentConnection(env, "alpha", "good", { clientId: "c1", clientName: "MCP", clientSecret: "x" }),
    "agent_secret_field_rejected",
  );
});

test("agents expose only approved fields and archived agents are readable only with includeArchived", async () => {
  const env: WorkerEnv = {};
  const created = await create(env, "alpha", "main");
  assert.deepEqual(Object.keys(created).sort(), [
    "agentId", "allowedScopes", "createdAt", "defaultHandoffState", "displayName", "dryRunDefault",
    "instructions", "provider", "reviewRequired", "role", "status", "uid", "updatedAt",
  ].sort());
  assert.equal("apiKey" in created, false);
  assert.equal("token" in created, false);
  assert.equal(created.status, "active");
  assert.equal(created.reviewRequired, true);
  assert.deepEqual(created.allowedScopes, ["quests:read", "quests:write", "webhooks:manage"]);

  await create(env, "alpha", "second");
  assert.equal((await agents.listAgents(env, "alpha")).length, 2);

  const archived = await agents.updateAgent(env, "alpha", "second", { status: "archived" });
  assert.equal(archived.status, "archived");
  const visible = await agents.listAgents(env, "alpha");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].agentId, "main");
  const all = await agents.listAgents(env, "alpha", { includeArchived: true });
  assert.equal(all.length, 2);
  await expectCode(agents.getAgent(env, "alpha", "second"), "agent_not_found");
  assert.equal((await agents.getAgent(env, "alpha", "second", { includeArchived: true })).agentId, "second");
  await expectCode(agents.updateAgent(env, "alpha", "second", { displayName: "Late" }), "agent_archived");
});

test("archiving frees a slot and the limit counts only non-archived agents", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-01-01T00:00:00.000Z" };
  for (let i = 0; i < 20; i += 1) await create(env, "alpha", `agent-${String(i).padStart(2, "0")}`);
  await expectCode(create(env, "alpha", "overflow"), "agent_limit_reached");

  env.AGENT_NOW = "2026-01-02T00:00:00.000Z";
  await agents.updateAgent(env, "alpha", "agent-00", { status: "archived" });
  const created = await create(env, "alpha", "overflow");
  assert.equal(created.agentId, "overflow");
  await expectCode(create(env, "alpha", "one-more"), "agent_limit_reached");
});

test("agents are fully isolated per user", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await expectCode(agents.getAgent(env, "beta", "main"), "agent_not_found");
  assert.equal((await agents.listAgents(env, "beta")).length, 0);
  await expectCode(agents.updateAgent(env, "beta", "main", { displayName: "Stolen" }), "agent_not_found");
  await expectCode(agents.listAgentConnections(env, "beta", "main"), "agent_not_found");

  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "client-alpha", clientName: "Alpha MCP" });
  await expectCode(agents.unlinkAgentConnection(env, "beta", "client-alpha"), "agent_connection_not_found");
  await expectCode(agents.noteAgentConnectionUse(env, "beta", "client-alpha"), "agent_connection_not_found");
  assert.equal((await agents.listAgentConnections(env, "alpha", "main")).length, 1);
});

test("update supports expectedUpdatedAt and returns a conflict on mismatch", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-02-01T00:00:00.000Z" };
  const created = await create(env, "alpha", "main");
  await expectCode(
    agents.updateAgent(env, "alpha", "main", { displayName: "New", expectedUpdatedAt: "wrong-timestamp" }),
    "agent_conflict",
  );
  env.AGENT_NOW = "2026-02-02T00:00:00.000Z";
  const updated = await agents.updateAgent(env, "alpha", "main", { displayName: "New", expectedUpdatedAt: created.updatedAt });
  assert.equal(updated.displayName, "New");
  assert.equal(updated.updatedAt, "2026-02-02T00:00:00.000Z");
  await expectCode(
    agents.updateAgent(env, "alpha", "main", { displayName: "Stale", expectedUpdatedAt: created.updatedAt }),
    "agent_conflict",
  );
});

test("disable and archive revoke all linked connections; unlink is idempotent", async () => {
  const env: WorkerEnv = { AGENT_NOW: "2026-03-01T00:00:00.000Z" };
  await create(env, "alpha", "main");
  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c1", clientName: "One", scopes: ["quests:read"] });
  await agents.linkAgentConnection(env, "alpha", "main", { clientId: "c2", clientName: "Two" });

  env.AGENT_NOW = "2026-03-02T00:00:00.000Z";
  const disabled = await agents.updateAgent(env, "alpha", "main", { status: "disabled" });
  assert.equal(disabled.status, "disabled");
  const afterDisable = await agents.listAgentConnections(env, "alpha", "main");
  assert.equal(afterDisable.length, 2);
  assert.equal(afterDisable.every((connection) => connection.revokedAt === "2026-03-02T00:00:00.000Z"), true);
  assert.equal(await agents.getAgentForClient(env, "alpha", "c1"), null);

  await expectCode(agents.noteAgentConnectionUse(env, "alpha", "c1"), "agent_connection_revoked");
  const firstUnlink = required(await agents.unlinkAgentConnection(env, "alpha", "c1"));
  assert.equal(firstUnlink.revokedAt, "2026-03-02T00:00:00.000Z");
  const secondUnlink = required(await agents.unlinkAgentConnection(env, "alpha", "c1"));
  assert.equal(secondUnlink.revokedAt, "2026-03-02T00:00:00.000Z");

  env.AGENT_NOW = "2026-03-03T00:00:00.000Z";
  await create(env, "alpha", "other");
  await agents.linkAgentConnection(env, "alpha", "other", { clientId: "c3", clientName: "Three" });
  env.AGENT_NOW = "2026-03-04T00:00:00.000Z";
  const archived = await agents.updateAgent(env, "alpha", "other", { status: "archived" });
  assert.equal(archived.status, "archived");
  const afterArchive = await agents.listAgentConnections(env, "alpha", "other");
  assert.equal(afterArchive[0].revokedAt, "2026-03-04T00:00:00.000Z");
});

test("connections track client metadata without credentials and client IDs are unique per user", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await create(env, "alpha", "second");

  const linked = required(await agents.linkAgentConnection(env, "alpha", "main", {
    clientId: "client-1",
    clientName: "Local MCP",
    scopes: ["quests:read"],
  }));
  assert.deepEqual(Object.keys(linked).sort(), [
    "agentId", "clientId", "clientName", "createdAt", "firstConnectedAt", "lastUsedAt", "revokedAt",
    "scopes", "uid", "updatedAt",
  ].sort());
  assert.equal(JSON.stringify(linked).includes("token"), false);
  assert.equal(linked.revokedAt, null);

  const reused = required(await agents.linkAgentConnection(env, "alpha", "main", { clientId: "client-1", clientName: "Local MCP" }));
  assert.equal(reused.clientId, "client-1");
  await expectCode(
    agents.linkAgentConnection(env, "alpha", "second", { clientId: "client-1", clientName: "Local MCP" }),
    "agent_client_linked",
  );

  const used = required(await agents.noteAgentConnectionUse(env, "alpha", "client-1", { at: "2026-04-01T00:00:00.000Z" }));
  assert.equal(used.lastUsedAt, "2026-04-01T00:00:00.000Z");
  const agent = required(await agents.getAgentForClient(env, "alpha", "client-1"));
  assert.equal(agent.agentId, "main");
  assert.equal(await agents.getAgentForClient(env, "alpha", "missing-client"), null);

  await create(env, "beta", "main");
  const sameClientForAnotherUser = required(await agents.linkAgentConnection(env, "beta", "main", { clientId: "client-1", clientName: "Local MCP" }));
  assert.equal(sameClientForAnotherUser.uid, "beta");
});

test("connections cannot be linked to archived agents", async () => {
  const env: WorkerEnv = {};
  await create(env, "alpha", "main");
  await agents.updateAgent(env, "alpha", "main", { status: "archived" });
  await expectCode(
    agents.linkAgentConnection(env, "alpha", "main", { clientId: "late-client", clientName: "Late" }),
    "agent_archived",
  );
});
