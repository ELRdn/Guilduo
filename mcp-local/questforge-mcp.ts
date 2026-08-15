#!/usr/bin/env node

const endpoint = process.env.QUESTFORGE_MCP_URL || "http://127.0.0.1:8787/mcp";
const token = process.env.QUESTFORGE_TOKEN || "";
let buffer = "";
type JsonRpcMessage = Record<string, unknown>;

async function forward(message: JsonRpcMessage): Promise<void> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(message),
  });
  if (response.status === 202 || response.status === 204) return;
  if (!response.ok) throw new Error(`QuestForge MCP returned ${response.status}: ${await response.text()}`);
  process.stdout.write(`${JSON.stringify(await response.json())}\n`);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let message: JsonRpcMessage;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object required");
      message = parsed as JsonRpcMessage;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Invalid MCP JSON: ${reason}\n`);
      continue;
    }
    forward(message).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${reason}\n`);
      if (message.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: reason } })}\n`);
    });
  }
});
process.stdin.resume();
