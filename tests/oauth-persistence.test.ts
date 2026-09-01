const test = require("node:test");
const assert = require("node:assert/strict");
import { authenticateRequest, sha256 } from "../worker/src/security.ts";
import { approveAuthorization, authorizePage, registerClient, revokeToken, tokenEndpoint } from "../worker/src/oauth.ts";
import type { KvNamespaceLike, WorkerEnv } from "../worker/src/worker-types.ts";

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly maxKeyBytes = Number.POSITIVE_INFINITY) {}

  private checkKey(key: string): void {
    if (new TextEncoder().encode(key).byteLength > this.maxKeyBytes) throw new Error(`KV GET failed: 414 UTF-8 encoded length exceeds key length limit of ${this.maxKeyBytes}.`);
  }

  async get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null> {
    this.checkKey(key);
    const item = this.values.get(key);
    if (!item || (item.expiresAt && item.expiresAt <= Date.now())) {
      this.values.delete(key);
      return null;
    }
    return (type === "json" ? JSON.parse(item.value) : item.value) as T;
  }

  async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
    this.checkKey(key);
    this.values.set(key, { value: String(value), expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0 });
  }

  async delete(key: string): Promise<void> {
    this.checkKey(key);
    this.values.delete(key);
  }

  async list({ prefix = "" }: { prefix?: string } = {}): Promise<{ keys: Array<{ name: string }> }> {
    this.checkKey(prefix);
    return { keys: [...this.values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
  }
}

const baseEnv: WorkerEnv = { ALLOWED_ORIGINS: "http://localhost:5173" };

function context(): { waitUntil(promise: Promise<unknown>): void } {
  return { waitUntil(promise: Promise<unknown>): void { promise.catch(() => {}); } };
}

test("OAuth authorize rejects an oversized client_id before it can become an invalid KV key", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const env: WorkerEnv = { ...baseEnv, QUESTFORGE_KV: new MemoryKv(512) };
  const clientId = `qfc_${"x".repeat(600)}`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://localhost:8787/callback",
    code_challenge: "x".repeat(43),
    code_challenge_method: "S256",
  });

  const response = await worker.fetch(new Request(`http://worker.test/oauth/authorize?${params}`), env, context());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
});

function formRequest(path: string, values: Record<string, string>): Request {
  return new Request(`http://worker.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
}

test("OAuth grants persist across a simulated deployment and concurrent refresh keeps one stable session", async () => {
  const kv = new MemoryKv();
  const env: WorkerEnv = {
    ...baseEnv,
    QUESTFORGE_KV: kv,
    APPWRITE_ENDPOINT: "https://api.guilduo.com/v1",
    APPWRITE_PROJECT_ID: "test-project",
  };
  const verifier = "questforge-pkce-verifier";
  const redirectUri = "http://localhost:8787/callback";
  const registration = await registerClient(new Request("http://worker.test/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Persistent MCP", redirect_uris: [redirectUri] }),
  }), env);
  assert.equal(registration.status, 201);
  const registered = await registration.json() as { client_id: string };
  const authorizationParams = new URLSearchParams({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: redirectUri,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
    state: "state-1",
  });
  const authorization = await authorizePage(new Request(`http://worker.test/oauth/authorize?${authorizationParams}`), env);
  assert.equal(authorization.status, 200);
  const authorizationKeys = await kv.list({ prefix: "authorize:" });
  assert.equal(authorizationKeys.keys.length, 1);
  const requestId = authorizationKeys.keys[0].name.replace("authorize:", "");

  const originalFetch = global.fetch;
  global.fetch = async (input: string | URL | Request, options?: RequestInit) => {
    if (String(input) === "https://api.guilduo.com/v1/account") {
      assert.equal(new Headers(options?.headers).get("x-appwrite-jwt"), "appwrite-jwt");
      return new Response(JSON.stringify({ $id: "oauth-user", email: "oauth@example.com" }), { status: 200 });
    }
    return originalFetch(input, options);
  };

  try {
    const approval = await approveAuthorization(new Request("http://worker.test/oauth/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, jwt: "appwrite-jwt" }),
    }), env);
    assert.equal(approval.status, 200);
    const approvalBody = await approval.json() as { redirect: string };
    const authorizationCode = new URL(approvalBody.redirect).searchParams.get("code");
    if (!authorizationCode) throw new Error("OAuth approval did not return an authorization code.");

    const issued = await tokenEndpoint(formRequest("/oauth/token", {
      grant_type: "authorization_code",
      code: authorizationCode,
      client_id: registered.client_id,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }), env);
    assert.equal(issued.status, 200);
    const initialTokens = await issued.json() as { access_token: string; refresh_token: string };
    assert.ok(initialTokens.access_token);
    assert.ok(initialTokens.refresh_token);

    const accessHash = await sha256(initialTokens.access_token);
    const accessRecord = await kv.get<Record<string, unknown>>(`access:${accessHash}`, "json");
    assert.ok(accessRecord);
    await kv.put(`access:${accessHash}`, JSON.stringify({ ...accessRecord, expiresAt: Date.now() - 1 }));
    const authEnv: WorkerEnv = { ...env, APPWRITE_ENDPOINT: "", APPWRITE_PROJECT_ID: "" };
    assert.equal(await authenticateRequest(new Request("http://worker.test/mcp", { headers: { authorization: `Bearer ${initialTokens.access_token}` } }), authEnv), null);

    const restartedEnv: WorkerEnv = { ...env, QUESTFORGE_KV: kv };
    const refreshed = await tokenEndpoint(formRequest("/oauth/token", { grant_type: "refresh_token", refresh_token: initialTokens.refresh_token }), restartedEnv);
    assert.equal(refreshed.status, 200);
    const refreshedTokens = await refreshed.json() as { access_token: string; refresh_token: string };
    assert.equal(refreshedTokens.refresh_token, initialTokens.refresh_token);

    const repeated = await tokenEndpoint(formRequest("/oauth/token", { grant_type: "refresh_token", refresh_token: initialTokens.refresh_token }), restartedEnv);
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json() as { refresh_token: string }).refresh_token, initialTokens.refresh_token);

    const concurrent = await Promise.all([
      tokenEndpoint(formRequest("/oauth/token", { grant_type: "refresh_token", refresh_token: initialTokens.refresh_token }), restartedEnv),
      tokenEndpoint(formRequest("/oauth/token", { grant_type: "refresh_token", refresh_token: initialTokens.refresh_token }), restartedEnv),
    ]);
    assert.deepEqual(concurrent.map((response) => response.status), [200, 200]);
    const concurrentTokens = await Promise.all(concurrent.map(async (response) => await response.json() as { access_token: string; refresh_token: string }));
    assert.equal(concurrentTokens[0].refresh_token, initialTokens.refresh_token);
    assert.equal(concurrentTokens[1].refresh_token, initialTokens.refresh_token);
    assert.notEqual(concurrentTokens[0].access_token, concurrentTokens[1].access_token);

    await revokeToken(formRequest("/oauth/revoke", { token: concurrentTokens[0].access_token }), restartedEnv);
    assert.equal((await tokenEndpoint(formRequest("/oauth/token", { grant_type: "refresh_token", refresh_token: initialTokens.refresh_token }), restartedEnv)).status, 400);
    assert.equal(await authenticateRequest(new Request("http://worker.test/mcp", { headers: { authorization: `Bearer ${concurrentTokens[0].access_token}` } }), authEnv), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("OAuth protocol failures are explicit and unexpected downstream errors are logged without secrets", async () => {
  const malformed = await tokenEndpoint(new Request("http://worker.test/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), baseEnv);
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "invalid_request" });

  class FailingKv extends MemoryKv {
    async get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null> {
      if (key.startsWith("client:")) throw Object.assign(new Error("KV GET failed: 503 token=qfr_do-not-log"), { code: "kv_unavailable", type: "CloudflareKV" });
      return super.get<T>(key, type);
    }
  }

  const worker = (await import("../worker/src/index.ts")).default;
  const clientId = "bounded-client";
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "http://localhost:8787/callback", code_challenge: "x".repeat(43), code_challenge_method: "S256" });
  const calls: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { calls.push(args); };
  let response: Response;
  try {
    response = await worker.fetch(new Request(`http://worker.test/oauth/authorize?${params}`), { ...baseEnv, QUESTFORGE_KV: new FailingKv() }, context());
  } finally {
    console.error = originalError;
  }
  assert.equal(response.status, 500);
  const log = calls.find((args) => args[0] === "oauth_operation_failed");
  if (!log) throw new Error("OAuth failure was not emitted to structured logging.");
  const details = log[1] as { operation: string; downstreamStatus: number | null; errorCode: string; errorType: string; message: string };
  assert.equal(details.operation, "oauth.authorize");
  assert.equal(details.downstreamStatus, 503);
  assert.equal(details.errorCode, "kv_unavailable");
  assert.equal(details.errorType, "CloudflareKV");
  assert.doesNotMatch(details.message, /qfr_do-not-log/);
});

test("the web Connection revoke route is owner-scoped and does not delete the Agent relation", async () => {
  const kv = new MemoryKv();
  const env: WorkerEnv = { ...baseEnv, DEV_BEARER_TOKEN: "owner-token", DEV_USER_ID: "owner", QUESTFORGE_KV: kv };
  const grantKey = "user-client:owner:client-1";
  await kv.put(grantKey, JSON.stringify({ uid: "owner", clientId: "client-1", clientName: "MCP", scopes: ["quests:read"], accessHash: "access-hash", refreshHash: "refresh-hash" }));
  await kv.put("access:access-hash", JSON.stringify({ uid: "owner", clientId: "client-1", refreshHash: "refresh-hash", expiresAt: Date.now() + 60_000 }));
  await kv.put("refresh:refresh-hash", JSON.stringify({ uid: "owner", clientId: "client-1", scopes: ["quests:read"], accessHash: "access-hash", refreshHash: "refresh-hash" }));
  const worker = (await import("../worker/src/index.ts")).default;
  const revoke = await worker.fetch(new Request("http://worker.test/v1/agent-connections/client-1", { method: "DELETE", headers: { authorization: "Bearer owner-token", origin: "http://localhost:5173" } }), env, context());
  assert.equal(revoke.status, 200);
  assert.equal((await kv.get("refresh:refresh-hash")), null);
  assert.ok(await kv.get("refresh-revoked:refresh-hash"));
  const stored = await kv.get<Record<string, unknown>>(grantKey, "json");
  assert.equal(stored?.revokedAt !== "", true);
  assert.equal(await kv.get("agent-registry:owner:client-1"), null);

  const foreignEnv: WorkerEnv = { ...env, DEV_USER_ID: "other-user" };
  const foreign = await worker.fetch(new Request("http://worker.test/v1/agent-connections/client-1", { method: "DELETE", headers: { authorization: "Bearer owner-token", origin: "http://localhost:5173" } }), foreignEnv, context());
  assert.equal(foreign.status, 404);
  const unauthenticated = await worker.fetch(new Request("http://worker.test/v1/agent-connections/client-1", { method: "DELETE", headers: { origin: "http://localhost:5173" } }), env, context());
  assert.equal(unauthenticated.status, 401);
});
