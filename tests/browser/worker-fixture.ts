import { createServer } from "node:http";
import { once } from "node:events";
import worker from "../../worker/src/index.ts";
import { createAgent } from "../../worker/src/agent-store.ts";
import { upsertProfile } from "../../worker/src/social-store.ts";
import { getKv, sha256 } from "../../worker/src/security.ts";
import { readState, writeState } from "../../worker/src/appwrite-store.ts";
import { migrateState } from "../../server/questforge-domain.ts";
import type { WorkerEnv } from "../../worker/src/worker-types.ts";
import type { Quest, QuestForgeState } from "../../types/questforge.ts";

/** A real Worker HTTP bridge using isolated in-memory stores and test credentials. */
export async function startRelayWorkerFixture(origin: string) {
  const uid = `relay-browser-${crypto.randomUUID()}`;
  const humanToken = "local-relay-human-test-token";
  const agentToken = "local-relay-agent-test-token";
  const env: WorkerEnv = { DEV_BEARER_TOKEN: humanToken, DEV_USER_ID: uid, ALLOWED_ORIGINS: origin };
  const context = { waitUntil(promise: Promise<unknown>) { promise.catch(() => {}); } };
  const state = migrateState({ schemaVersion: 7 } as QuestForgeState);
  const previous = await readState(env, uid);
  await writeState(env, uid, { state, schemaVersion: 7, clientUpdatedAt: new Date().toISOString() }, previous.etag);
  await upsertProfile(env, uid, { displayName: "Review Human", handle: `review_${uid.slice(-8)}` });
  await createAgent(env, uid, { agentId: "review-agent", displayName: "My Review Agent", allowedScopes: ["quests:read", "quests:write", "agents:read"] });
  const grant = { uid, email: "browser@example.test", clientId: `browser-${uid}`, clientName: "Local MCP client", scopes: ["quests:read", "quests:write", "agents:read", "agents:write"], firstConnectedAt: new Date().toISOString(), lastUsedAt: "", revokedAt: "" };
  const kv = getKv(env);
  await kv.put(`user-client:${uid}:${grant.clientId}`, JSON.stringify(grant));
  await kv.put(`access:${await sha256(agentToken)}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 3600000 }));
  let baseUrl = "";
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const request = new Request(`${baseUrl}${incoming.url}`, { method: incoming.method, headers, ...(["GET", "HEAD"].includes(incoming.method || "GET") ? {} : { body: Buffer.concat(chunks) }) });
      const response = await worker.fetch(request, env, context);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500); outgoing.end(error instanceof Error ? error.message : "Fixture failed"); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture address missing");
  baseUrl = `http://127.0.0.1:${address.port}`;
  async function web(path: string, method = "GET", body?: unknown) {
    const response = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${humanToken}`, origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`Fixture REST ${response.status}: ${await response.text()}`);
    return await response.json() as { quest: Quest };
  }
  async function mcp(name: string, args: Record<string, unknown>) {
    const response = await fetch(baseUrl + "/mcp", { method: "POST", headers: { authorization: `Bearer ${agentToken}`, origin, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } }) });
    const result = await response.json() as { result: { isError?: boolean; structuredContent: { quest: Quest; quests: Quest[] } } };
    if (result.result.isError) throw new Error(`Fixture MCP failed: ${JSON.stringify(result)}`);
    return result.result.structuredContent;
  }
  await mcp("link_agent", { agentId: "review-agent" });
  async function receive(key: string) {
    const { quest: source } = await web("/v1/quests", "POST", { kind: "todo", title: `Work ${key}`, assignee: { type: "agent", id: "review-agent", label: "My Review Agent", handoffState: "working" } });
    const { quest } = await mcp("request_human_review", { questId: source.id, title: `Review ${key}`, requestKey: key, reason: "The actual user's experience is needed.", checkTarget: "Check the menu and send text feedback.", completionCriteria: "Describe any required changes.", artifactUrl: "https://example.test/menu", expectedUpdatedAt: source.updatedAt, dryRun: false });
    return { source, quest };
  }
  const first = await receive("first");
  return { baseUrl, uid, first, receive, mcp, web, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
