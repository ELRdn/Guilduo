const test = require("node:test");
const assert = require("node:assert/strict");
import { authenticateRequest, sha256 } from "../worker/src/security.ts";
import { approveAuthorization, authorizePage, noteAuthorizedClientUse, registerClient, revokeToken, tokenEndpoint } from "../worker/src/oauth.ts";
import type { KvNamespaceLike, WorkerEnv } from "../worker/src/worker-types.ts";
import { SqliteD1Database } from "./test-helpers.ts";

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

class CountingKv extends MemoryKv {
  reads = 0;
  puts = 0;
  deletes = 0;
  lists = 0;

  reset(): void {
    this.reads = 0;
    this.puts = 0;
    this.deletes = 0;
    this.lists = 0;
  }

  async get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null> {
    this.reads += 1;
    return super.get<T>(key, type);
  }

  async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
    this.puts += 1;
    return super.put(key, value, options);
  }

  async delete(key: string): Promise<void> {
    this.deletes += 1;
    return super.delete(key);
  }

  async list(options: { prefix?: string } = {}): Promise<{ keys: Array<{ name: string }> }> {
    this.lists += 1;
    return super.list(options);
  }
}

class QuotaBlockedKv extends CountingKv {
  writesBlocked = false;

  async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
    this.puts += 1;
    if (this.writesBlocked) throw new Error("KV put() limit exceeded for the day.");
    return MemoryKv.prototype.put.call(this, key, value, options);
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

test("OAuth authorize persists through D1 when the production KV write quota is exhausted", async () => {
  const kv = new QuotaBlockedKv();
  const db = new SqliteD1Database();
  const clientId = "qfc_legacy-client";
  const redirectUri = "http://127.0.0.1:8989/oauth/callback";
  const verifier = `production-pkce-verifier-${"x".repeat(32)}`;
  await kv.put(`client:${clientId}`, JSON.stringify({
    clientId,
    clientName: "Legacy MCP client",
    redirectUris: [redirectUri],
    createdAt: Date.now(),
  }));
  kv.reset();
  kv.writesBlocked = true;
  const env: WorkerEnv = {
    ...baseEnv,
    QUESTFORGE_DB: db,
    QUESTFORGE_KV: kv,
    MCP_ALLOWED_ORIGINS: "https://mcp.guilduo.com",
    APPWRITE_ENDPOINT: "https://api.guilduo.com/v1",
    APPWRITE_PROJECT_ID: "test-project",
  };
  const originalFetch = global.fetch;

  try {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "production-repro",
      code_challenge: await sha256(verifier),
      code_challenge_method: "S256",
      resource: "https://mcp.guilduo.com/mcp",
    });
    const response = await authorizePage(new Request(`https://mcp.guilduo.com/oauth/authorize?${params}`), env);

    assert.equal(response.status, 200);
    const stored = db.raw.prepare("SELECT record_key FROM oauth_records WHERE record_key LIKE 'authorize:%' AND is_deleted = 0").get() as { record_key: string };
    assert.ok(stored);
    const requestId = stored.record_key.replace("authorize:", "");

    global.fetch = async (input: string | URL | Request, options?: RequestInit) => {
      if (String(input) === "https://api.guilduo.com/v1/account") {
        assert.equal(new Headers(options?.headers).get("x-appwrite-jwt"), "appwrite-jwt");
        return new Response(JSON.stringify({ $id: "oauth-user", email: "oauth@example.com" }), { status: 200 });
      }
      return originalFetch(input, options);
    };
    const approval = await approveAuthorization(new Request("https://mcp.guilduo.com/oauth/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, jwt: "appwrite-jwt" }),
    }), env);
    assert.equal(approval.status, 200);
    const code = new URL((await approval.json() as { redirect: string }).redirect).searchParams.get("code");
    assert.ok(code);

    const issued = await tokenEndpoint(formRequest("/oauth/token", {
      grant_type: "authorization_code",
      code: code!,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }), env);
    assert.equal(issued.status, 200);
    const initial = await issued.json() as { access_token: string; refresh_token: string };
    assert.equal((await authenticateRequest(new Request("https://mcp.guilduo.com/mcp", {
      headers: { authorization: `Bearer ${initial.access_token}` },
    }), { ...env, APPWRITE_ENDPOINT: "", APPWRITE_PROJECT_ID: "" }))?.clientId, clientId);

    const refreshed = await tokenEndpoint(formRequest("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: initial.refresh_token,
    }), env);
    assert.equal(refreshed.status, 200);
    const refreshedTokens = await refreshed.json() as { access_token: string; refresh_token: string };
    assert.equal(refreshedTokens.refresh_token, initial.refresh_token);

    await revokeToken(formRequest("/oauth/revoke", { token: initial.refresh_token }), env);
    assert.equal((await tokenEndpoint(formRequest("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: initial.refresh_token,
    }), env)).status, 400);
    assert.equal(kv.puts, 0, "the complete D1 OAuth lifecycle must never attempt a legacy KV write");
  } finally {
    global.fetch = originalFetch;
    db.close();
  }
});

test("OAuth client activity coalesces identical last-used writes within fifteen minutes", async () => {
  const kv = new CountingKv();
  const identity = { uid: "activity-user", email: "", scopes: ["quests:read"], authType: "oauth" as const, clientId: "activity-client" };
  await kv.put(`user-client:${identity.uid}:${identity.clientId}`, JSON.stringify({
    uid: identity.uid,
    clientId: identity.clientId,
    scopes: identity.scopes,
    lastUsedAt: new Date().toISOString(),
  }));
  kv.puts = 0;

  await noteAuthorizedClientUse({ QUESTFORGE_KV: kv }, identity);
  await noteAuthorizedClientUse({ QUESTFORGE_KV: kv }, identity);
  assert.equal(kv.puts, 0);

  await kv.put(`user-client:${identity.uid}:${identity.clientId}`, JSON.stringify({
    uid: identity.uid,
    clientId: identity.clientId,
    scopes: identity.scopes,
    lastUsedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
  }));
  kv.puts = 0;
  await noteAuthorizedClientUse({ QUESTFORGE_KV: kv }, identity);
  assert.equal(kv.puts, 1);
});

test("normal MCP initialize, tools/list, and ordinary tool calls perform zero KV writes with legacy OAuth tokens", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const kv = new QuotaBlockedKv();
  const db = new SqliteD1Database();
  const token = "legacy-oauth-access-token";
  const clientId = "legacy-mcp-client";
  const uid = "legacy-mcp-user";
  const refreshHash = await sha256("legacy-refresh-token");
  const grant = {
    uid,
    email: "legacy@example.com",
    clientId,
    clientName: "Legacy MCP client",
    scopes: ["agents:read"],
    firstConnectedAt: "2026-08-01T00:00:00.000Z",
    lastUsedAt: "2026-08-01T00:00:00.000Z",
    revokedAt: "",
    refreshHash,
  };
  await kv.put(`access:${await sha256(token)}`, JSON.stringify({
    ...grant,
    authType: "oauth",
    expiresAt: Date.now() + 60 * 60 * 1000,
  }));
  await kv.put(`user-client:${uid}:${clientId}`, JSON.stringify(grant));
  kv.reset();
  kv.writesBlocked = true;
  const env: WorkerEnv = {
    ...baseEnv,
    QUESTFORGE_DB: db,
    QUESTFORGE_KV: kv,
    MCP_ALLOWED_ORIGINS: "http://worker.test",
  };

  const call = async (id: number, method: string, params: Record<string, unknown> = {}): Promise<Response> => worker.fetch(new Request("http://worker.test/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }), env, context());

  try {
    const initialized = await call(1, "initialize");
    assert.equal(initialized.status, 200);
    assert.equal(kv.puts, 0, "initialize must not attempt a KV write");

    const listed = await call(2, "tools/list");
    assert.equal(listed.status, 200);
    assert.equal(kv.puts, 0, "tools/list must not attempt a KV write");

    const tool = await call(3, "tools/call", { name: "get_agent_link", arguments: {} });
    assert.equal(tool.status, 200);
    const payload = await tool.json() as { result: { isError: boolean } };
    assert.equal(payload.result.isError, false);
    assert.equal(kv.puts, 0, "ordinary tool calls must not attempt a KV write");

    assert.equal((await authenticateRequest(new Request("http://worker.test/mcp", {
      headers: { authorization: `Bearer ${token}` },
    }), env))?.clientId, clientId, "legacy KV access tokens must remain valid through D1 read-through");
  } finally {
    db.close();
  }
});

test("lastUsedAt storage failure cannot make an authenticated MCP request fail", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const kv = new QuotaBlockedKv();
  const token = "activity-failure-access-token";
  const clientId = "activity-failure-client";
  const uid = "activity-failure-user";
  const grant = {
    uid,
    email: "",
    clientId,
    clientName: "Activity failure client",
    scopes: ["agents:read"],
    firstConnectedAt: "2026-08-01T00:00:00.000Z",
    lastUsedAt: "2026-08-01T00:00:00.000Z",
    revokedAt: "",
  };
  await kv.put(`access:${await sha256(token)}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 60 * 60 * 1000 }));
  await kv.put(`user-client:${uid}:${clientId}`, JSON.stringify(grant));
  kv.reset();
  kv.writesBlocked = true;
  const env: WorkerEnv = { ...baseEnv, QUESTFORGE_KV: kv, MCP_ALLOWED_ORIGINS: "http://worker.test" };
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };

  try {
    const response = await worker.fetch(new Request("http://worker.test/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }), env, context());
    assert.equal(response.status, 200);
    assert.equal(kv.puts, 1, "the simulated lastUsedAt write must have reached the blocked KV boundary");
    assert.equal(logs.some(([event, details]) => event === "oauth_client_activity_update_failed"
      && (details as Record<string, unknown>).operation === "oauth.note_client_use"
      && (details as Record<string, unknown>).reason === "quota_exceeded"), true);
  } finally {
    console.error = originalError;
  }
});

test("the legacy KV lifecycle operation budget is explicit at every OAuth seam", async () => {
  const kv = new CountingKv();
  const env: WorkerEnv = {
    ...baseEnv,
    QUESTFORGE_KV: kv,
    APPWRITE_ENDPOINT: "https://api.guilduo.com/v1",
    APPWRITE_PROJECT_ID: "test-project",
  };
  const redirectUri = "http://127.0.0.1:8989/oauth/callback";
  const verifier = `operation-count-verifier-${"x".repeat(32)}`;
  const originalFetch = global.fetch;

  try {
    kv.reset();
    const registration = await registerClient(new Request("http://worker.test/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Operation count", redirect_uris: [redirectUri] }),
    }), env);
    const clientId = (await registration.json() as { client_id: string }).client_id;
    assert.deepEqual({ reads: kv.reads, puts: kv.puts, deletes: kv.deletes }, { reads: 0, puts: 1, deletes: 0 });

    kv.reset();
    const authorization = await authorizePage(new Request(`http://worker.test/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: await sha256(verifier),
      code_challenge_method: "S256",
    })}`), env);
    assert.equal(authorization.status, 200);
    assert.deepEqual({ reads: kv.reads, puts: kv.puts, deletes: kv.deletes }, { reads: 1, puts: 1, deletes: 0 });
    const requestId = (await kv.list({ prefix: "authorize:" })).keys[0].name.replace("authorize:", "");

    global.fetch = async (input: string | URL | Request) => {
      if (String(input) === "https://api.guilduo.com/v1/account") {
        return new Response(JSON.stringify({ $id: "count-user", email: "count@example.com" }), { status: 200 });
      }
      return originalFetch(input);
    };
    kv.reset();
    const approval = await approveAuthorization(new Request("http://worker.test/oauth/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, jwt: "appwrite-jwt" }),
    }), env);
    const code = new URL((await approval.json() as { redirect: string }).redirect).searchParams.get("code")!;
    assert.deepEqual({ reads: kv.reads, puts: kv.puts, deletes: kv.deletes }, { reads: 1, puts: 1, deletes: 1 });

    kv.reset();
    const issued = await tokenEndpoint(formRequest("/oauth/token", {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }), env);
    const initial = await issued.json() as { access_token: string; refresh_token: string };
    assert.deepEqual({ reads: kv.reads, puts: kv.puts, deletes: kv.deletes }, { reads: 3, puts: 3, deletes: 1 });

    kv.reset();
    const refreshed = await tokenEndpoint(formRequest("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: initial.refresh_token,
    }), env);
    const current = await refreshed.json() as { access_token: string; refresh_token: string };
    assert.deepEqual({ reads: kv.reads, puts: kv.puts, deletes: kv.deletes }, { reads: 3, puts: 1, deletes: 0 });

    const grantKey = `user-client:count-user:${clientId}`;
    const grant = await kv.get<Record<string, unknown>>(grantKey, "json");
    await kv.put(grantKey, JSON.stringify({ ...grant, lastUsedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() }));
    kv.reset();
    const identity = await authenticateRequest(new Request("http://worker.test/mcp", {
      headers: { authorization: `Bearer ${current.access_token}` },
    }), { ...env, APPWRITE_ENDPOINT: "", APPWRITE_PROJECT_ID: "" });
    assert.ok(identity);
    await noteAuthorizedClientUse(env, identity!);
    assert.deepEqual({ reads: kv.reads, puts: kv.puts, deletes: kv.deletes }, { reads: 3, puts: 1, deletes: 0 });
  } finally {
    global.fetch = originalFetch;
  }
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
    response = await worker.fetch(new Request(`http://worker.test/oauth/authorize?${params}`, {
      headers: { "cf-ray": "test-ray" },
    }), { ...baseEnv, QUESTFORGE_KV: new FailingKv() }, context());
  } finally {
    console.error = originalError;
  }
  assert.equal(response.status, 500);
  const log = calls.find((args) => args[0] === "oauth_operation_failed");
  if (!log) throw new Error("OAuth failure was not emitted to structured logging.");
  const details = log[1] as { operation: string; cfRay: string; clientIdHash: string; oauthStage: string; storage: string; storageOperation: string; reason: string; downstreamStatus: number | null; errorCode: string; errorType: string; message: string };
  assert.equal(details.operation, "oauth.authorize");
  assert.equal(details.cfRay, "test-ray");
  assert.equal(details.clientIdHash, (await sha256(clientId)).slice(0, 16));
  assert.equal(details.oauthStage, "client_load");
  assert.equal(details.storage, "KV");
  assert.equal(details.storageOperation, "get");
  assert.equal(details.reason, "storage_error");
  assert.equal(details.downstreamStatus, 503);
  assert.equal(details.errorCode, "kv_unavailable");
  assert.equal(details.errorType, "CloudflareKV");
  assert.doesNotMatch(details.message, /qfr_do-not-log/);
});

test("OAuth authorize logs KV quota exhaustion as a sanitized storage put failure", async () => {
  class QuotaKv extends MemoryKv {
    blockWrites = false;

    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
      if (this.blockWrites) throw new Error("KV put() limit exceeded for the day.");
      return super.put(key, value, options);
    }
  }

  const kv = new QuotaKv();
  const clientId = "quota-client";
  const redirectUri = "http://127.0.0.1:8989/oauth/callback";
  await kv.put(`client:${clientId}`, JSON.stringify({ clientId, clientName: "Quota client", redirectUris: [redirectUri], createdAt: Date.now() }));
  kv.blockWrites = true;
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: "x".repeat(43), code_challenge_method: "S256" });
  const calls: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { calls.push(args); };
  try {
    const worker = (await import("../worker/src/index.ts")).default;
    const response = await worker.fetch(new Request(`http://worker.test/oauth/authorize?${params}`), { ...baseEnv, QUESTFORGE_KV: kv }, context());
    assert.equal(response.status, 500);
  } finally {
    console.error = originalError;
  }
  const log = calls.find((args) => args[0] === "oauth_operation_failed");
  if (!log) throw new Error("OAuth quota failure was not logged.");
  const details = log[1] as { storage: string; storageOperation: string; reason: string; message: string };
  assert.equal(details.storage, "KV");
  assert.equal(details.storageOperation, "put");
  assert.equal(details.reason, "quota_exceeded");
  assert.equal(details.message, "KV put() limit exceeded for the day.");
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
