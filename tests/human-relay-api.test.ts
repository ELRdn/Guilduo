import test from "node:test";
import assert from "node:assert/strict";
import { Validator } from "@cfworker/json-schema";
import worker, { MCP_TOOLS } from "../worker/src/index.ts";
import { getKv, sha256 } from "../worker/src/security.ts";
import { createAgent, resetAgentMemoryForTests } from "../worker/src/agent-store.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import type { Quest } from "../types/questforge.ts";
import { asQuestForgeState } from "./test-helpers.ts";

const env: WorkerEnv = { DEV_BEARER_TOKEN: "relay-web", DEV_USER_ID: "relay-owner", ALLOWED_ORIGINS: "http://localhost:5173" };
const context = { waitUntil(promise: Promise<unknown>) { promise.catch(() => {}); } };
type RecordValue = Record<string, unknown>;
async function request(path: string, method = "GET", value?: unknown, token = "relay-web") {
  return worker.fetch(new Request(`http://worker.test${path}`, { method, headers: { authorization: `Bearer ${token}`, origin: "http://localhost:5173", "content-type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) }), env, context);
}
type McpResponse = { result: { isError?: boolean; structuredContent: { quest: Quest; total: number; reused: boolean; events: unknown[]; quests: Quest[] } }; error?: unknown };
async function mcp(name: string, args: RecordValue, token: string): Promise<McpResponse> {
  return await (await request("/mcp", "POST", { jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } }, token)).json() as McpResponse;
}
async function connection(clientId: string, scopes: string[]) {
  const token = `relay-${clientId}`;
  const grant = { uid: "relay-owner", email: "relay@example.test", clientId, clientName: clientId, scopes, firstConnectedAt: "2026-09-07T00:00:00.000Z", lastUsedAt: "", revokedAt: "" };
  const kv = getKv(env);
  await kv.put(`user-client:relay-owner:${clientId}`, JSON.stringify(grant));
  await kv.put(`access:${await sha256(token)}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 3600000 }));
  return token;
}
async function setup() {
  resetAgentMemoryForTests();
  const stored = await readState(env, "relay-owner");
  const state = asQuestForgeState({ schemaVersion: 7, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {}, character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] }, battle: { mp: 0, maxMp: 80 }, boss: { hp: 100, maxHp: 100 } });
  await writeState(env, "relay-owner", { schemaVersion: 7, state, clientUpdatedAt: new Date().toISOString() }, stored.etag);
  await createAgent(env, "relay-owner", { agentId: "cyan", displayName: "Cyan", allowedScopes: ["quests:read", "quests:write", "agents:read"] });
  const token = await connection(crypto.randomUUID(), ["quests:read", "quests:write", "agents:read", "agents:write"]);
  const linked = await mcp("link_agent", { agentId: "cyan" }, token);
  assert.equal(Boolean(linked.result.isError), false);
  const createdResponse = await request("/v1/quests", "POST", { kind: "todo", title: "Vibe coding: mobile menu", assignee: { type: "agent", id: "cyan", label: "Cyan", handoffState: "working" } });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { quest: Quest };
  const source = created.quest;
  assert.equal(source.requester?.type, "human");
  return { token, source, input: { questId: source.id, requestKey: "mobile-v1", title: "Check on a phone", reason: "Touch comfort needs your feedback", checkTarget: "Open and close the menu with one hand", completionCriteria: "Describe any discomfort", artifactUrl: "https://preview.example/mobile", expectedUpdatedAt: source.updatedAt } };
}

test("real Worker MCP to Web response to MCP loop preserves all outcomes and declared schemas", async () => {
  const { token, source, input } = await setup();
  const preview = await mcp("request_human_review", input, token);
  assert.equal(Boolean(preview.result.isError), false);
  assert.equal((await mcp("list_human_requests", { status: "all" }, token)).result.structuredContent.total, 0);
  for (const action of ["revise", "approve"] as const) {
    const key = { ...input, requestKey: action, dryRun: false };
    const created = await mcp("request_human_review", key, token);
    assert.equal(Boolean(created.result.isError), false, JSON.stringify(created));
    const tool = MCP_TOOLS.find((entry) => entry.name === "request_human_review")!;
    assert.equal(new Validator(tool.outputSchema as ConstructorParameters<typeof Validator>[0]).validate(created.result.structuredContent).valid, true);
    const quest = created.result.structuredContent.quest;
    assert.equal(quest.requester?.id, "cyan");
    assert.equal((await mcp("request_human_review", key, token)).result.structuredContent.quest.id, quest.id);
    const inputResponse = { action, confirmed: true, response: action === "revise" ? "Increase the close button." : "No further changes.", expectedUpdatedAt: quest.updatedAt, dryRun: false };
    assert.equal((await request(`/v1/quests/${quest.id}/review-response`, "POST", inputResponse, token)).status, 403, "Agent cannot impersonate the human");
    assert.equal((await request(`/v1/quests/${quest.id}/score`, "POST", { direction: "up" }, token)).status, 409);
    const answeredResponse = await request(`/v1/quests/${quest.id}/review-response`, "POST", inputResponse);
    assert.equal(answeredResponse.status, 200);
    const after = (await readState(env, "relay-owner")).payload.state!;
    const rewards = JSON.stringify(after.rewardClaims);
    const character = JSON.stringify(after.character);
    assert.equal((await request(`/v1/quests/${quest.id}/review-response`, "POST", inputResponse)).status, 200);
    const repeated = (await readState(env, "relay-owner")).payload.state!;
    assert.equal(JSON.stringify(repeated.rewardClaims), rewards);
    assert.equal(JSON.stringify(repeated.character), character);
    const page = await mcp("list_human_requests", { status: "answered", sourceQuestId: source.id }, token);
    assert.equal(new Validator(MCP_TOOLS.find((entry) => entry.name === "list_human_requests")!.outputSchema as ConstructorParameters<typeof Validator>[0]).validate(page.result.structuredContent).valid, true);
    assert.equal(page.result.structuredContent.quests.find((item) => item.id === quest.id)?.humanRequest?.response, inputResponse.response);
    const original = await (await request(`/v1/quests/${source.id}`)).json() as { quest: Quest };
    assert.equal(original.quest.done, false);
    assert.equal(original.quest.assignee.handoffState, "working");
  }
});

test("Worker persists defer/resume and rejects stale responses without losing the request", async () => {
  const { token, input } = await setup();
  let quest = (await mcp("request_human_review", { ...input, dryRun: false }, token)).result.structuredContent.quest;
  const previous = quest.updatedAt;
  for (const action of ["seen", "defer", "resume"] as const) {
    const response = await request(`/v1/quests/${quest.id}/review-response`, "POST", { action, expectedUpdatedAt: quest.updatedAt, dryRun: false });
    assert.equal(response.status, 200);
    quest = (await response.json() as { quest: Quest }).quest;
    assert.equal(quest.done, false);
  }
  const stale = await request(`/v1/quests/${quest.id}/review-response`, "POST", { action: "approve", confirmed: true, expectedUpdatedAt: previous, dryRun: false });
  assert.equal(stale.status, 409);
  assert.equal((await mcp("list_human_requests", {}, token)).result.structuredContent.total, 1);
});

test("restricted/unlinked MCP clients cannot request work or overwrite human snapshot metadata", async () => {
  const { token, input } = await setup();
  const readonly = await connection(crypto.randomUUID(), ["quests:read"]);
  const blocked = await mcp("request_human_review", { ...input, dryRun: false }, readonly);
  assert.ok(blocked.result?.isError || blocked.error);
  const unlinked = await connection(crypto.randomUUID(), ["quests:read", "quests:write"]);
  const noLink = await mcp("request_human_review", { ...input, dryRun: false }, unlinked);
  assert.ok(noLink.result?.isError || noLink.error);
  const snapshot = (await readState(env, "relay-owner")).payload;
  assert.equal((await request("/v1/state", "PUT", snapshot, token)).status, 403);
  assert.equal((await mcp("list_human_requests", {}, token)).result.structuredContent.total, 0);
});

test("concurrent retries create one human request and publish its creation once", async () => {
  const { token, input } = await setup();
  const replies = await Promise.all([mcp("request_human_review", { ...input, dryRun: false }, token), mcp("request_human_review", { ...input, dryRun: false }, token)]);
  for (const reply of replies) assert.equal(Boolean(reply.result?.isError), false, JSON.stringify(reply));
  assert.equal(replies[0].result.structuredContent.quest.id, replies[1].result.structuredContent.quest.id);
  const stored = (await readState(env, "relay-owner")).payload.state!;
  assert.equal(stored.tasks.filter((quest) => quest.humanRequest).length, 1);
  assert.equal(stored.taskEvents.filter((event) => event.type === "quest.human_request.created").length, 1);
});
