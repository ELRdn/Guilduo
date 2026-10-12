const test = require("node:test");
const assert = require("node:assert/strict");
import { MCP_TOOLS } from "../worker/src/index.ts";
import {
  validateMcpHttpRequest, validateMcpEnvelope, negotiateMcpProtocolVersion,
  mcpPingResponse, validateMcpToolInput,
} from "../worker/src/mcp-transport.ts";

function request(method = "POST", headers: Record<string, string> = {}): Request {
  return new Request("https://mcp.example.test/mcp", { method, headers: { "content-type": "application/json", ...headers } });
}

test("stable MCP HTTP boundary rejects unsupported methods, protocol and supplied origins", () => {
  const allowed = "https://app.example.test,http://localhost:5173";
  assert.equal(validateMcpHttpRequest(request(), allowed), null);
  assert.equal(validateMcpHttpRequest(request("POST", { origin: "https://app.example.test" }), allowed), null);
  for (const method of ["GET", "PUT", "DELETE", "HEAD"]) {
    const result = validateMcpHttpRequest(request(method), allowed);
    assert.equal(result?.status, 405);
    assert.equal(result?.headers.get("allow"), "POST");
  }
  for (const origin of ["null", "https://attacker.test", "https://app.example.test.attacker.test", "http://localhost:9999"]) {
    assert.equal(validateMcpHttpRequest(request("POST", { origin }), allowed)?.status, 403);
  }
  assert.equal(validateMcpHttpRequest(request("POST", { origin: "https://app.example.test" }), ["https://user:secret@app.example.test"])?.status, 403);
  for (const version of ["2025-06-18", "2025-03-26"]) {
    assert.equal(validateMcpHttpRequest(request("POST", { "mcp-protocol-version": version }), allowed), null);
  }
  assert.equal(validateMcpHttpRequest(request("POST", { "mcp-protocol-version": "1999-01-01" }), allowed)?.status, 400);
  assert.equal(validateMcpHttpRequest(request("POST", { "mcp-protocol-version": "" }), allowed)?.status, 400);
  assert.equal(validateMcpHttpRequest(request("POST", { "content-type": "text/plain" }), allowed)?.status, 415);
});

test("envelope rejects malformed versions, IDs, params and IDless tool mutations before dispatch", () => {
  const valid = { jsonrpc: "2.0", id: 0, method: "tools/call", params: { name: "update_quest", arguments: { questId: "q" } } };
  assert.equal(validateMcpEnvelope(valid).kind, "request");
  for (const invalid of [null, [], [valid], { ...valid, jsonrpc: "1.0" }, { ...valid, method: "" },
    { ...valid, id: null }, { ...valid, id: false }, { ...valid, id: {} }, { ...valid, id: 1.5 },
    { ...valid, id: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, params: [] }, { ...valid, params: null },
    { ...valid, params: { name: "update_quest", arguments: [] } }, { ...valid, params: {} },
    { ...valid, result: {} }, { jsonrpc: "2.0", method: "tools/call", params: valid.params }]) {
    let mutationCount = 0;
    const checked = validateMcpEnvelope(invalid);
    if (checked.kind === "request") mutationCount += 1;
    assert.equal(checked.kind, "error", JSON.stringify(invalid));
    assert.equal(mutationCount, 0);
  }
  const badArgs = validateMcpEnvelope({ ...valid, id: "safe-id", params: { name: "update_quest", arguments: null } });
  assert.deepEqual(badArgs, { kind: "error", id: "safe-id", error: { code: -32602, message: "tools/call requires a name and object arguments" } });
});

test("initialized and other notifications never become requests; ping and negotiation are finite", () => {
  for (const method of ["notifications/initialized", "notifications/cancelled", "notifications/progress"]) {
    assert.equal(validateMcpEnvelope({ jsonrpc: "2.0", method }).kind, "notification");
    assert.equal(validateMcpEnvelope({ jsonrpc: "2.0", id: 1, method }).kind, "error");
  }
  assert.deepEqual(mcpPingResponse(7), { jsonrpc: "2.0", id: 7, result: {} });
  assert.equal(validateMcpEnvelope({ jsonrpc: "2.0", id: 7, method: "ping" }).kind, "request");
  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } };
  assert.equal(validateMcpEnvelope(initialize).kind, "request");
  assert.equal(validateMcpEnvelope({ ...initialize, params: {} }).kind, "error");
  assert.equal(negotiateMcpProtocolVersion("2025-03-26"), "2025-03-26");
  assert.equal(negotiateMcpProtocolVersion("unsupported"), "2025-06-18");
  assert.equal(validateMcpEnvelope({ jsonrpc: "2.0", id: "x", method: "unknown" }).kind, "request");
});

test("declared tool schemas reject unsupported dryRun and enforce types, limits and nested fields", () => {
  const update = MCP_TOOLS.find(tool => tool.name === "update_quest")!;
  const valid = { questId: "q", nextAction: "Continue", handoff: { note: "Tests passed" }, expectedUpdatedAt: "2026-10-06T00:00:00.000Z", actingAgentId: "cyan" };
  const before = JSON.stringify(valid);
  assert.equal(validateMcpToolInput(update.inputSchema, valid).valid, true);
  assert.equal(JSON.stringify(valid), before);
  for (const args of [{ ...valid, dryRun: true }, { ...valid, extra: true }, { ...valid, nextAction: 3 },
    { ...valid, nextAction: "x".repeat(181) }, { ...valid, handoff: { note: "x".repeat(501) } },
    { ...valid, expectedUpdatedAt: "invalid" }, { ...valid, actingAgentId: "../other" }, {}, null, []]) {
    assert.equal(validateMcpToolInput(update.inputSchema, args).valid, false);
  }
  const human = MCP_TOOLS.find(tool => tool.name === "request_human_review")!;
  const review = { questId: "q", requestKey: "r", title: "Check", reason: "Verify", checkTarget: "Artifact", completionCriteria: "Pass", dryRun: true };
  assert.equal(validateMcpToolInput(human.inputSchema, review).valid, true);
  assert.equal(validateMcpToolInput(human.inputSchema, { ...review, dryRun: "true" }).valid, false);
  assert.equal(validateMcpToolInput({ type: "object", properties: { patch: { type: "object", properties: { note: { type: "string" } }, additionalProperties: false } }, additionalProperties: false }, { patch: { unknown: true } }).valid, false);
});
