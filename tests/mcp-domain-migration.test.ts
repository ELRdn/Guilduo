const test = require("node:test");
const assert = require("node:assert/strict");
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { mcpHostRules, mcpOriginForRequest, primaryMcpOrigin, providerOAuthOriginForRequest } from "../worker/src/mcp-origin.ts";

const oldOrigin = "https://questforge-gateway.guangchuannaito.workers.dev";
const newOrigin = "https://mcp.guilduo.com";
const env: WorkerEnv = {
  PUBLIC_BASE_URL: oldOrigin,
  MCP_ALLOWED_ORIGINS: `${oldOrigin},${newOrigin}`,
  ALLOWED_ORIGINS: "http://localhost:5173",
};

function context(): { waitUntil(promise: Promise<unknown>): void } {
  return { waitUntil(promise: Promise<unknown>): void { promise.catch(() => {}); } };
}

async function body<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test("MCP origin allowlist emits request-origin metadata for both old and new domains", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  assert.equal(primaryMcpOrigin(env), oldOrigin);
  assert.equal(mcpOriginForRequest(new Request(`${newOrigin}/mcp`), env), newOrigin);
  assert.equal(mcpOriginForRequest(new Request(`${oldOrigin}/mcp`), env), oldOrigin);
  assert.equal(mcpOriginForRequest(new Request("https://attacker.example/mcp"), env), null);

  for (const origin of [oldOrigin, newOrigin]) {
    const metadataResponse = await worker.fetch(new Request(`${origin}/.well-known/oauth-authorization-server`), env, context());
    assert.equal(metadataResponse.status, 200, origin);
    const metadata = await body<{ issuer: string; authorization_endpoint: string; token_endpoint: string }>(metadataResponse);
    assert.equal(metadata.issuer, origin);
    assert.equal(metadata.authorization_endpoint, `${origin}/oauth/authorize`);
    assert.equal(metadata.token_endpoint, `${origin}/oauth/token`);

    const resourceResponse = await worker.fetch(new Request(`${origin}/.well-known/oauth-protected-resource`), env, context());
    assert.equal(resourceResponse.status, 200, origin);
    const resource = await body<{ resource: string; authorization_servers: string[] }>(resourceResponse);
    assert.equal(resource.resource, `${origin}/mcp`);
    assert.deepEqual(resource.authorization_servers, [origin]);

    const unauthorized = await worker.fetch(new Request(`${origin}/mcp`, { method: "POST", body: "{}" }), env, context());
    assert.equal(unauthorized.status, 401, origin);
    assert.match(unauthorized.headers.get("www-authenticate") || "", new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.well-known/oauth-protected-resource/mcp`));
  }
});

test("MCP metadata and endpoints reject an unconfigured host instead of trusting Host", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource", "/mcp", "/mcp-next"]) {
    const response = await worker.fetch(new Request(`https://attacker.example${path}`, { method: path === "/mcp" ? "POST" : "GET", body: path === "/mcp" ? "{}" : undefined }), env, context());
    assert.equal(response.status, 421, path);
    const error = await body<{ error: { code: string } }>(response);
    assert.equal(error.error.code, "mcp_host_not_allowed");
  }
  const rules = mcpHostRules(env);
  assert.ok(rules.allowedHostnames.includes("mcp.guilduo.com"));
  assert.ok(rules.allowedHostnames.includes("questforge-gateway.guangchuannaito.workers.dev"));
});

test("MCP origin configuration ignores URLs that contain a path or credentials", async () => {
  const { configuredMcpOrigins } = await import("../worker/src/mcp-origin.ts");
  const configured = configuredMcpOrigins({
    PUBLIC_BASE_URL: oldOrigin,
    MCP_ALLOWED_ORIGINS: "https://mcp.guilduo.com/mcp,https://user:secret@attacker.example,https://mcp.example.com",
  });
  assert.deepEqual(configured, [oldOrigin, "https://mcp.example.com"]);
});

test("Provider OAuth callback remains on its dedicated legacy origin during MCP migration", async () => {
  const { beginIntegrationConnect } = await import("../worker/src/provider-oauth.ts");
  const result = await beginIntegrationConnect({
    ...env,
    PROVIDER_OAUTH_BASE_URL: oldOrigin,
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  }, { uid: "migration-user", email: "migration@example.com" }, "google-calendar");
  assert.equal(new URL(result.authorizationUrl).searchParams.get("redirect_uri"), `${oldOrigin}/oauth/callback/google`);
});

test("a dedicated Provider OAuth origin is accepted without becoming an MCP origin", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const providerOrigin = "https://oauth.guilduo.com";
  const providerEnv: WorkerEnv = {
    ...env,
    PROVIDER_OAUTH_BASE_URL: providerOrigin,
    MCP_ALLOWED_ORIGINS: `${oldOrigin},${newOrigin}`,
  };
  assert.equal(providerOAuthOriginForRequest(new Request(`${providerOrigin}/oauth/callback/google`), providerEnv), providerOrigin);
  assert.equal(mcpOriginForRequest(new Request(`${providerOrigin}/mcp`), providerEnv), null);
  const response = await worker.fetch(new Request(`${providerOrigin}/oauth/callback/google?state=expired`), providerEnv, context());
  assert.notEqual(response.status, 421);
});
