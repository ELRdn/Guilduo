import {
  DomainError,
  assertScope,
  buyReward,
  characterState,
  createQuest,
  listEvents,
  listQuests,
  patchQuest,
  scoreQuest,
} from "../../server/questforge-domain.mjs";
import { mutateState, readState } from "./firebase-store.mjs";
import { authenticateRequest } from "./security.mjs";
import {
  approveAuthorization,
  authorizePage,
  oauthMetadata,
  protectedResourceMetadata,
  registerClient,
  revokeToken,
  tokenEndpoint,
} from "./oauth.mjs";
import { listIntegrations, syncIntegration } from "./integrations.mjs";
import {
  createWebhook,
  deleteWebhook,
  deliverEvent,
  installPlugin,
  listPlugins,
  listWebhooks,
  retryDeliveries,
  validateManifest,
} from "./extensions.mjs";

const MCP_TOOLS = [
  { name: "list_today_quests", description: "List active QuestForge quests due today or overdue.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "create_quest", description: "Create a QuestForge habit, daily, todo, or reward.", inputSchema: { type: "object", required: ["kind", "title"], properties: { kind: { type: "string", enum: ["habit", "daily", "todo", "reward"] }, title: { type: "string" }, notes: { type: "string" }, dueDate: { type: "string" }, repeat: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] }, difficulty: { type: "string", enum: ["trivial", "easy", "medium", "hard"] }, tags: { type: "array", items: { type: "string" } } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "score_quest", description: "Complete, reopen, or score a quest and apply its HP, XP, Gem, and MP effects.", inputSchema: { type: "object", required: ["questId", "direction"], properties: { questId: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "get_character_state", description: "Return the current character, MP, equipment, and boss state.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "buy_reward", description: "Redeem a reward quest using Gems.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "list_integrations", description: "List QuestForge integration adapters and connection status.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "preview_external_sync", description: "Preview external records without changing QuestForge data.", inputSchema: { type: "object", required: ["service"], properties: { service: { type: "string" }, direction: { type: "string", enum: ["import", "export", "bidirectional"] } } }, annotations: { readOnlyHint: true } },
  { name: "sync_external_service", description: "Run an external service sync. dryRun defaults to true.", inputSchema: { type: "object", required: ["service", "direction"], properties: { service: { type: "string" }, direction: { type: "string", enum: ["import", "export", "bidirectional"] }, dryRun: { type: "boolean", default: true } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
];

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function errorResponse(error) {
  const status = Number(error.status || (error instanceof DomainError ? error.status : 500));
  return json({ error: { code: error.code || "internal_error", message: status >= 500 ? "QuestForge server error." : error.message, details: error.details } }, status);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = String(env.ALLOWED_ORIGINS || "https://questforge-cb6ba.web.app,http://localhost:5173,http://127.0.0.1:5173").split(",").map((item) => item.trim());
  const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
  return origin && (allowed.includes(origin) || localDevelopmentOrigin)
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : {};
}

function withCors(response, request, env) {
  const next = new Response(response.body, response);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => next.headers.set(key, value));
  next.headers.set("access-control-allow-headers", "authorization,content-type,mcp-protocol-version");
  next.headers.set("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  return next;
}

async function stateFor(env, identity) {
  const { payload } = await readState(env, identity.uid);
  if (!payload?.state) { const error = new Error("Open QuestForge and complete Firebase sync before connecting an AI client."); error.status = 409; error.code = "state_unavailable"; throw error; }
  return payload.state;
}

async function mutateAndNotify(env, identity, context, mutation) {
  const { result } = await mutateState(env, identity.uid, mutation);
  const event = result?.event;
  if (event) context.waitUntil(deliverEvent(env, identity.uid, event));
  return result;
}

async function routeApi(request, env, context, identity, path) {
  const method = request.method;
  if (path === "/v1/quests" && method === "GET") {
    assertScope(identity.scopes, "quests:read");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return json({ quests: listQuests(await stateFor(env, identity), query) });
  }
  if (path === "/v1/quests" && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json({ quest: await mutateAndNotify(env, identity, context, (state) => createQuest(state, input, { source: "api" })) }, 201);
  }
  const questMatch = path.match(/^\/v1\/quests\/([^/]+)$/);
  if (questMatch && method === "PATCH") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json({ quest: await mutateAndNotify(env, identity, context, (state) => patchQuest(state, decodeURIComponent(questMatch[1]), input, { source: "api" })) });
  }
  const scoreMatch = path.match(/^\/v1\/quests\/([^/]+)\/score$/);
  if (scoreMatch && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json(await mutateAndNotify(env, identity, context, (state) => scoreQuest(state, decodeURIComponent(scoreMatch[1]), input.direction || "up", { source: "api" })));
  }
  if (path === "/v1/character" && method === "GET") {
    assertScope(identity.scopes, "character:read");
    return json({ character: characterState(await stateFor(env, identity)) });
  }
  if (path === "/v1/integrations" && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
    return json({ integrations: listIntegrations(env) });
  }
  const syncMatch = path.match(/^\/v1\/integrations\/([^/]+)\/sync$/);
  if (syncMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    const dryRun = input.dryRun !== false;
    if (dryRun) return json(await syncIntegration(env, await stateFor(env, identity), decodeURIComponent(syncMatch[1]), input.direction || "import", true));
    const result = await mutateAndNotify(env, identity, context, (state) => syncIntegration(env, state, decodeURIComponent(syncMatch[1]), input.direction || "import", false));
    return json(result);
  }
  if (path === "/v1/sync-events" && method === "GET") {
    assertScope(identity.scopes, "events:read");
    return json({ events: (await stateFor(env, identity)).syncEvents || [] });
  }
  if (path === "/v1/events" && method === "GET") {
    assertScope(identity.scopes, "events:read");
    return json({ events: listEvents(await stateFor(env, identity), new URL(request.url).searchParams.get("limit")) });
  }
  if (path === "/v1/webhooks" && method === "GET") { assertScope(identity.scopes, "webhooks:manage"); return json({ webhooks: await listWebhooks(env, identity.uid) }); }
  if (path === "/v1/webhooks" && method === "POST") { assertScope(identity.scopes, "webhooks:manage"); return json({ webhook: await createWebhook(env, identity.uid, await request.json()) }, 201); }
  const webhookMatch = path.match(/^\/v1\/webhooks\/([^/]+)$/);
  if (webhookMatch && method === "DELETE") { assertScope(identity.scopes, "webhooks:manage"); await deleteWebhook(env, identity.uid, decodeURIComponent(webhookMatch[1])); return new Response(null, { status: 204 }); }
  if (path === "/v1/plugins/validate" && method === "POST") { assertScope(identity.scopes, "plugins:manage"); return json(validateManifest(await request.json())); }
  if (path === "/v1/plugins" && method === "GET") { assertScope(identity.scopes, "plugins:manage"); return json({ plugins: await listPlugins(env, identity.uid) }); }
  if (path === "/v1/plugins" && method === "POST") { assertScope(identity.scopes, "plugins:manage"); return json({ plugin: await installPlugin(env, identity.uid, await request.json()) }, 201); }
  return json({ error: { code: "not_found", message: "Endpoint not found." } }, 404);
}

async function callMcpTool(name, args, env, context, identity) {
  if (name === "list_today_quests") { assertScope(identity.scopes, "quests:read"); return { quests: listQuests(await stateFor(env, identity), { due: "today" }) }; }
  if (name === "create_quest") { assertScope(identity.scopes, "quests:write"); return { quest: await mutateAndNotify(env, identity, context, (state) => createQuest(state, args, { source: "mcp" })) }; }
  if (name === "score_quest") { assertScope(identity.scopes, "quests:write"); return mutateAndNotify(env, identity, context, (state) => scoreQuest(state, args.questId, args.direction, { source: "mcp" })); }
  if (name === "get_character_state") { assertScope(identity.scopes, "character:read"); return { character: characterState(await stateFor(env, identity)) }; }
  if (name === "buy_reward") { assertScope(identity.scopes, "rewards:write"); return mutateAndNotify(env, identity, context, (state) => buyReward(state, args.questId, { source: "mcp" })); }
  if (name === "list_integrations") { assertScope(identity.scopes, "integrations:read"); return { integrations: listIntegrations(env) }; }
  if (name === "preview_external_sync") { assertScope(identity.scopes, "integrations:read"); return syncIntegration(env, await stateFor(env, identity), args.service, args.direction || "import", true); }
  if (name === "sync_external_service") {
    assertScope(identity.scopes, "integrations:sync");
    if (args.dryRun !== false) return syncIntegration(env, await stateFor(env, identity), args.service, args.direction || "import", true);
    return mutateAndNotify(env, identity, context, (state) => syncIntegration(env, state, args.service, args.direction || "import", false));
  }
  throw new DomainError(404, "tool_not_found", `Unknown MCP tool: ${name}`);
}

async function handleMcp(request, env, context, identity) {
  if (request.method === "GET") return json({ name: "questforge-mcp", transport: "streamable-http", protocol: "2025-06-18" });
  const message = await request.json();
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  let result;
  if (message.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "questforge-mcp", version: "1.0.0" }, instructions: "Use QuestForge tools to plan and score real user quests. Preview external sync before running it. Ask for confirmation before buying rewards or writing external services." };
  else if (message.method === "tools/list") result = { tools: MCP_TOOLS };
  else if (message.method === "tools/call") {
    try {
      const value = await callMcpTool(message.params?.name, message.params?.arguments || {}, env, context, identity);
      result = { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false };
    } catch (error) {
      result = {
        content: [{ type: "text", text: error.message || "QuestForge tool failed." }],
        structuredContent: { error: { code: error.code || "tool_error", message: error.message } },
        isError: true,
      };
    }
  } else return json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: "Method not found" } });
  return json({ jsonrpc: "2.0", id: message.id ?? null, result }, 200, { "mcp-protocol-version": "2025-06-18" });
}

async function handleRequest(request, env, context) {
  const url = new URL(request.url); const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "/health") return json({ ok: true, service: "questforge-gateway", version: "1.0.0", oauthStorage: env.QUESTFORGE_KV ? "persistent" : "ephemeral" });
  if (path === "/.well-known/oauth-authorization-server") return json(oauthMetadata(request, env));
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") return json(protectedResourceMetadata(request, env));
  if (path === "/oauth/register" && request.method === "POST") return registerClient(request, env);
  if (path === "/oauth/authorize" && request.method === "GET") return authorizePage(request, env);
  if (path === "/oauth/approve" && request.method === "POST") return approveAuthorization(request, env);
  if (path === "/oauth/token" && request.method === "POST") return tokenEndpoint(request, env);
  if (path === "/oauth/revoke" && request.method === "POST") return revokeToken(request, env);
  if (path === "/openapi.json") return fetch(new URL("/api/openapi.json", env.WEB_APP_URL || "https://questforge-cb6ba.web.app"));

  const identity = await authenticateRequest(request, env);
  if (!identity) return json({ error: { code: "unauthorized", message: "A valid OAuth or Firebase bearer token is required." } }, 401, { "www-authenticate": `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp"` });
  if (path === "/mcp") return handleMcp(request, env, context, identity);
  if (path.startsWith("/v1/")) return routeApi(request, env, context, identity, path);
  return json({ error: { code: "not_found", message: "Route not found." } }, 404);
}

export default {
  async fetch(request, env, context) {
    try { return withCors(await handleRequest(request, env, context), request, env); }
    catch (error) { console.error(error); return withCors(errorResponse(error), request, env); }
  },
  async scheduled(_controller, env, context) { context.waitUntil(retryDeliveries(env)); },
};

export { MCP_TOOLS, handleMcp, routeApi };
