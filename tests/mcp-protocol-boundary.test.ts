import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { migrateState } from "../server/questforge-domain.ts";
import { asQuestForgeState, json } from "./test-helpers.ts";
import type { Quest } from "../types/questforge.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

const env: WorkerEnv = {
  DEV_BEARER_TOKEN: "mcp-protocol-test-token",
  DEV_USER_ID: "mcp-protocol-boundary-owner",
  MCP_ALLOWED_ORIGINS: "http://worker.test",
  ALLOWED_ORIGINS: "http://localhost:5173",
};
const context = { waitUntil: (promise: Promise<unknown>): void => { void promise.catch(() => {}); } };

function call(path: string, body?: unknown, headers: Record<string, string> = {}, method = "POST"): Promise<Response> {
  return worker.fetch(new Request(`http://worker.test${path}`, {
    method,
    headers: { authorization: "Bearer mcp-protocol-test-token", "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, context);
}

function tool(name: string, args: Record<string, unknown>, id: string | number = 1): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

async function seedQuest(): Promise<Quest> {
  const response = await call("/v1/quests", { kind: "todo", title: "Keep this title", notes: "Keep this evidence" });
  assert.equal(response.status, 201);
  return (await json<{ quest: Quest }>(response)).quest;
}

async function snapshot(): Promise<string> {
  return JSON.stringify(await readState(env, env.DEV_USER_ID!));
}

test.beforeEach(async () => {
  const current = await readState(env, env.DEV_USER_ID!);
  await writeState(env, env.DEV_USER_ID!, {
    schemaVersion: 7,
    state: migrateState(asQuestForgeState({ schemaVersion: 7 })),
    clientUpdatedAt: new Date().toISOString(),
  }, current.etag);
});

test("stable worker transport rejects GET and PUT without changing Quest state", async () => {
  const quest = await seedQuest();
  const before = await snapshot();
  const get = await call("/mcp", undefined, {}, "GET");
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  const put = await call("/mcp", tool("update_quest", { questId: quest.id, nextAction: "Must not apply" }), {}, "PUT");
  assert.equal(put.status, 405);
  assert.equal(put.headers.get("allow"), "POST");
  assert.equal(await snapshot(), before);
});

test("malformed RPC and notification-shaped mutations are rejected before writing", async () => {
  const quest = await seedQuest();
  const valid = tool("update_quest", { questId: quest.id, nextAction: "Must not apply" });
  const before = await snapshot();
  const invalidRequests: Array<{ body: unknown; code: number }> = [
    { body: { ...valid, jsonrpc: "1.0" }, code: -32600 },
    { body: { ...valid, id: null }, code: -32600 },
    { body: { ...valid, id: 1.5 }, code: -32600 },
    { body: { jsonrpc: "2.0", method: "tools/call", params: valid.params }, code: -32600 },
    { body: { ...valid, params: [] }, code: -32602 },
    { body: { ...valid, params: { name: "update_quest", arguments: null } }, code: -32602 },
    { body: [valid], code: -32600 },
    { body: { ...valid, method: "notifications/initialized" }, code: -32600 },
  ];
  for (const { body, code } of invalidRequests) {
    const response = await call("/mcp", body);
    const parsed = await json<{ error?: { code: number }; result?: unknown }>(response);
    assert.equal(parsed.error?.code, code, JSON.stringify(body));
    assert.equal(parsed.result, undefined);
    assert.equal(await snapshot(), before, "Rejected requests must preserve state, history and revision");
  }
  const malformed = await worker.fetch(new Request("http://worker.test/mcp", {
    method: "POST",
    headers: { authorization: "Bearer mcp-protocol-test-token", "content-type": "application/json" },
    body: "{",
  }), env, context);
  assert.equal((await json<{ error: { code: number } }>(malformed)).error.code, -32700);
  assert.equal(await snapshot(), before);
  const unknownNotification = await call("/mcp", { jsonrpc: "2.0", method: "notifications/tools/call", params: valid.params });
  assert.equal(unknownNotification.status, 202);
  assert.equal(await snapshot(), before, "Notifications never dispatch tool mutations");
});

test("initialize, initialized and ping use valid MCP envelopes without state writes", async () => {
  const before = await snapshot();
  for (const requested of ["2025-03-26", "2025-06-18", "unsupported-version"]) {
    const initialized = await call("/mcp", {
      jsonrpc: "2.0", id: "initialize", method: "initialize",
      params: { protocolVersion: requested, capabilities: {}, clientInfo: { name: "Boundary test", version: "1.0" } },
    });
    assert.equal(initialized.status, 200);
    const body = await json<{ id: string; result: { protocolVersion: string; capabilities: { tools: Record<string, unknown> } } }>(initialized);
    assert.equal(body.id, "initialize");
    assert.equal(body.result.protocolVersion, requested === "unsupported-version" ? "2025-06-18" : requested);
    assert.deepEqual(body.result.capabilities.tools, {}, "No tool-change notification capability without SSE");
    assert.equal(initialized.headers.get("mcp-protocol-version"), body.result.protocolVersion);
  }
  const acknowledged = await call("/mcp", { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(acknowledged.status, 202);
  assert.equal(await acknowledged.text(), "");
  const ping = await call("/mcp", { jsonrpc: "2.0", id: 0, method: "ping" });
  assert.equal(ping.status, 200);
  assert.deepEqual(await ping.json(), { jsonrpc: "2.0", id: 0, result: {} });
  assert.equal(await snapshot(), before);
});

test("unsupported protocol and untrusted supplied Origin cannot mutate state", async () => {
  const quest = await seedQuest();
  const before = await snapshot();
  const mutation = tool("update_quest", { questId: quest.id, nextAction: "Must not apply" });
  const unsupported = await call("/mcp", mutation, { "mcp-protocol-version": "1999-01-01" });
  assert.equal(unsupported.status, 400);
  assert.equal(await snapshot(), before);
  for (const origin of ["https://attacker.example", "http://localhost:5173.attacker.example", "http://localhost:9999", "null"]) {
    assert.equal((await call("/mcp", mutation, { origin })).status, 403);
    assert.equal(await snapshot(), before);
  }
  const trusted = await call("/mcp", { jsonrpc: "2.0", id: 5, method: "ping" }, { origin: "http://localhost:5173", "mcp-protocol-version": "2025-06-18" });
  assert.equal(trusted.status, 200);
  assert.equal(trusted.headers.get("mcp-protocol-version"), "2025-06-18");
  const legacy = await call("/mcp", { jsonrpc: "2.0", id: 6, method: "ping" }, { "mcp-protocol-version": "2025-03-26" });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.headers.get("mcp-protocol-version"), "2025-03-26");
  assert.equal(await snapshot(), before);
});

test("narrow update saves progress without completing work; unsupported dryRun is rejected", async () => {
  const quest = await seedQuest();
  const patch = { questId: quest.id, nextAction: "Review the next phase", handoff: { note: "Isolated checks passed" }, expectedUpdatedAt: quest.updatedAt };
  const response = await call("/mcp", tool("update_quest", patch));
  assert.equal(response.status, 200);
  const body = await json<{ result: { isError: boolean; structuredContent: { quest: Quest } } }>(response);
  assert.equal(body.result.isError, false);
  assert.equal(body.result.structuredContent.quest.nextAction, patch.nextAction);
  const saved = await json<{ quest: Quest }>(await call(`/v1/quests/${quest.id}`, undefined, {}, "GET"));
  assert.equal(saved.quest.handoff.note, patch.handoff.note);
  assert.equal(saved.quest.nextAction, patch.nextAction);
  assert.equal(saved.quest.title, quest.title);
  assert.equal(saved.quest.notes, quest.notes);
  assert.equal(saved.quest.done, false);
  assert.equal(saved.quest.lifecycleState, "active");
  const before = await snapshot();
  const rejected = await call("/mcp", tool("update_quest", {
    ...patch, nextAction: "Must not apply", expectedUpdatedAt: saved.quest.updatedAt, dryRun: true,
  }, "bad-dry-run"));
  const error = await json<{ id: string; error?: { code: number }; result?: unknown }>(rejected);
  assert.equal(rejected.status, 400);
  assert.equal(error.id, "bad-dry-run");
  assert.equal(error.error?.code, -32602);
  assert.equal(error.result, undefined);
  assert.equal(await snapshot(), before, "Schema rejection must precede any persistence");
  const unknown = await call("/mcp", tool("unknown_tool", {}, "unknown-tool"));
  assert.equal(unknown.status, 400);
  assert.equal((await json<{ error: { code: number } }>(unknown)).error.code, -32602);
  const stale = await call("/mcp", tool("update_quest", {
    ...patch, nextAction: "Must not apply", expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
  }, "stale-update"));
  assert.equal(stale.status, 200, "Semantic conflicts retain the MCP tool-result contract");
  const conflict = await json<{ error?: unknown; result: { isError: boolean } }>(stale);
  assert.equal(conflict.error, undefined);
  assert.equal(conflict.result.isError, true);
  assert.equal(await snapshot(), before, "Rejected tools and semantic conflicts preserve history");
});

test("declared-valid Unicode phase fields survive create, partial update and readback", async () => {
  const nextAction = "a" + "\u{1F600}".repeat(179);
  const note = "a" + "\u{1F600}".repeat(499);
  const created = await call("/mcp", tool("create_quest", {
    kind: "todo", title: "Unicode phase boundary", nextAction, handoff: { note },
  }));
  assert.equal(created.status, 200);
  const body = await json<{ result: { isError: boolean; structuredContent: { quest: Quest } } }>(created);
  assert.equal(body.result.isError, false, "The real declared schema accepts 180/500 Unicode code points");
  const quest = body.result.structuredContent.quest;
  assert.equal(quest.nextAction, nextAction, "Creating a Quest must not split or truncate a valid nextAction");
  assert.equal(quest.handoff.note, note, "Creating a Quest must not split or truncate a valid note");

  const updated = await call("/mcp", tool("update_quest", {
    questId: quest.id, handoff: { startedAt: "2026-10-06T00:00:00.000Z" }, expectedUpdatedAt: quest.updatedAt,
  }));
  assert.equal(updated.status, 200);
  assert.equal((await json<{ result: { isError: boolean } }>(updated)).result.isError, false);
  const read = await call("/mcp", tool("get_quest", { questId: quest.id }));
  const saved = (await json<{ result: { structuredContent: { quest: Quest } } }>(read)).result.structuredContent.quest;
  assert.equal(saved.nextAction, nextAction, "Migration on update/read must preserve an unrelated nextAction");
  assert.equal(saved.handoff.note, note, "A partial handoff patch must preserve its unrelated note");
  assert.equal(saved.handoff.startedAt, "2026-10-06T00:00:00.000Z");
  assert.equal(saved.done, false);
  assert.equal(saved.lifecycleState, "active");
});

test("Unicode nextAction-only phase patch preserves the original unrelated stored note", async () => {
  const quest = await seedQuest();
  const nextAction = "a" + "\u{1F600}".repeat(179);
  const note = "a" + "\u{1F600}".repeat(499);
  const current = await readState(env, env.DEV_USER_ID!);
  assert.ok(current.payload.state);
  const original = current.payload.state.tasks.find(task => task.id === quest.id);
  assert.ok(original);
  original.handoff.note = note;
  assert.equal(await writeState(env, env.DEV_USER_ID!, current.payload, current.etag), true);

  const response = await call("/mcp", tool("update_quest", {
    questId: quest.id, nextAction, expectedUpdatedAt: quest.updatedAt,
  }));
  assert.equal(response.status, 200);
  assert.equal((await json<{ result: { isError: boolean } }>(response)).result.isError, false);
  const stored = (await readState(env, env.DEV_USER_ID!)).payload.state!.tasks.find(task => task.id === quest.id)!;
  assert.equal(stored.handoff.note, note, "An unrelated stored note must survive ensureState/migrateState");
  assert.equal(stored.nextAction, nextAction, "The schema-valid patch must persist without splitting a surrogate pair");
  assert.equal(stored.title, quest.title);
  assert.equal(stored.notes, quest.notes);
  const saved = (await json<{ quest: Quest }>(await call(`/v1/quests/${quest.id}`, undefined, {}, "GET"))).quest;
  assert.equal(saved.handoff.note, note);
  assert.equal(saved.nextAction, nextAction);
  const before = await snapshot();
  for (const patch of [{ nextAction: nextAction + "x" }, { handoff: { note: note + "x" } }]) {
    const rejected = await call("/mcp", tool("update_quest", {
      questId: quest.id, expectedUpdatedAt: saved.updatedAt, ...patch,
    }));
    assert.equal(rejected.status, 400, "The existing public 180/500 code-point limits remain enforced");
    assert.equal((await json<{ error: { code: number } }>(rejected)).error.code, -32602);
    assert.equal(await snapshot(), before, "Over-limit rejection must preserve state, history and revision");
  }
});
