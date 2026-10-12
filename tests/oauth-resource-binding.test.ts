const test = require("node:test");
const assert = require("node:assert/strict");
import { authorizePage, deleteAuthorizedClient, revokeAuthorizedClient, revokeToken, tokenEndpoint } from "../worker/src/oauth.ts";
import { ALL_SCOPES, authenticateRequest, oauthClientDisconnectKey, sha256 } from "../worker/src/security.ts";
import type { KvNamespaceLike, WorkerEnv } from "../worker/src/worker-types.ts";

const origin = "https://mcp.guilduo.com";
const resource = `${origin}/mcp`;
const alias = "https://compat.example.com";
const clientId = "resource-test-client";
const redirectUri = "http://127.0.0.1:8989/callback";
const verifier = "resource-test-verifier";
type Tokens = { access_token: string; refresh_token: string; scope: string };

function fixture() {
  const records = new Map<string, string>();
  const kv: KvNamespaceLike = {
    async get<T>(key: string, type?: "text" | "json"): Promise<T | null> {
      const value = records.get(key);
      return value === undefined ? null : (type === "json" ? JSON.parse(value) : value) as T;
    },
    async put(key, value) { records.set(key, value); },
    async delete(key) { records.delete(key); },
    async list({ prefix = "" } = {}) { return { keys: [...records.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })) }; },
  };
  const env: WorkerEnv = { QUESTFORGE_KV: kv, PUBLIC_BASE_URL: origin, MCP_ALLOWED_ORIGINS: alias };
  const form = (values: Record<string, string>) => new Request(`${origin}/oauth/token`, {
    method: "POST", body: new URLSearchParams(values),
  });
  const identity = (token: string, url = resource) => authenticateRequest(new Request(url, {
    headers: { authorization: `Bearer ${token}` },
  }), env);
  const exchange = async (boundResource = "", overrides: Record<string, string> = {}) => {
    const code = "test-code";
    await kv.put(`code:${await sha256(code)}`, JSON.stringify({
      uid: "resource-user", clientId, redirectUri, challenge: await sha256(verifier),
      scopes: ["quests:read", "quests:write"], resource: boundResource,
    }));
    return tokenEndpoint(form({ grant_type: "authorization_code", code, client_id: clientId,
      redirect_uri: redirectUri, code_verifier: verifier, ...overrides }), env);
  };
  return { records, kv, env, form, identity, exchange };
}

test("authorize validates exact trusted resource before storing a request", async () => {
  const f = fixture();
  await f.kv.put(`client:${clientId}`, JSON.stringify({ clientId, clientName: "Resource test", redirectUris: [redirectUri] }));
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri,
    code_challenge: await sha256(verifier), code_challenge_method: "S256" });
  for (const value of ["https://attacker.example/mcp", `${origin}/v1/quests`, `${resource}?x=1`, `${resource}#x`, `${origin}/mcp/`, ""]) {
    params.set("resource", value);
    const response = await authorizePage(new Request(`${origin}/oauth/authorize?${params}`), f.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_target" });
    assert.equal([...f.records.keys()].some(key => key.startsWith("authorize:")), false);
  }
  params.set("resource", resource);
  params.append("resource", `${alias}/mcp`);
  assert.equal((await authorizePage(new Request(`${origin}/oauth/authorize?${params}`), f.env)).status, 400);
  params.set("resource", resource);
  assert.equal((await authorizePage(new Request(`${origin}/oauth/authorize?${params}`), f.env)).status, 200);
  const pending = [...f.records].find(([key]) => key.startsWith("authorize:"))!;
  assert.equal(JSON.parse(pending[1]).resource, resource);
});

test("code exchange binds the consented audience, preserves PKCE/client checks and rejects retargeting", async () => {
  const f = fixture();
  for (const overrides of [{ resource: `${alias}/mcp` }, { resource: "https://attacker.example/mcp" }]) {
    const response = await f.exchange(resource, overrides);
    assert.deepEqual(await response.json(), { error: "invalid_target" });
    assert.ok(f.records.has(`code:${await sha256("test-code")}`));
    assert.equal([...f.records.keys()].some(key => key.startsWith("access:")), false);
  }
  for (const overrides of [{ client_id: "other-client" }, { code_verifier: "wrong-verifier" }] as Array<Record<string, string>>) {
    assert.deepEqual(await (await f.exchange(resource, overrides)).json(), { error: "invalid_grant" });
  }
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  for (const [key, value] of f.records) {
    if (/^(access:|refresh:|user-client:)/.test(key)) assert.equal(JSON.parse(value).resource, resource);
  }
  assert.equal((await f.identity(tokens.access_token))?.clientId, clientId);
  assert.ok(await f.identity(tokens.access_token, `${origin}/mcp-next`));
  for (const url of [`${alias}/mcp`, "https://attacker.example/mcp", `${origin}/v1/quests`, `${origin}/oauth/token`]) {
    assert.equal(await f.identity(tokens.access_token, url), null);
  }
});

test("refresh cannot change client, audience or widen scope; narrowed access keeps the original refresh grant", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const refreshKey = `refresh:${await sha256(tokens.refresh_token)}`;
  const original = f.records.get(refreshKey);
  const request = (extra: Record<string, string>) => tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, ...extra }), f.env);
  for (const [extra, error] of [
    [{ client_id: "other-client" }, "invalid_grant"], [{ client_id: "" }, "invalid_grant"],
    [{ resource: `${alias}/mcp` }, "invalid_target"], [{ resource: "https://attacker.example/mcp" }, "invalid_target"],
    [{ scope: "quests:read agents:write" }, "invalid_scope"], [{ scope: "" }, "invalid_scope"],
  ] as Array<[Record<string, string>, string]>) {
    assert.deepEqual(await (await request(extra)).json(), { error });
  }
  const narrowed = await request({ client_id: clientId, resource, scope: "quests:read quests:read" });
  assert.equal(narrowed.status, 200);
  const access = await narrowed.json() as Tokens;
  assert.equal(access.refresh_token, tokens.refresh_token);
  assert.deepEqual((await f.identity(access.access_token))?.scopes, ["quests:read"]);
  assert.equal(f.records.get(refreshKey), original);
  const full = await (await request({})).json() as Tokens;
  assert.deepEqual((await f.identity(full.access_token))?.scopes, ["quests:read", "quests:write"]);
  const grantsBefore = [...f.records].filter(([key]) => /^(refresh:|user-client:)/.test(key));
  const parallel = await Promise.all([request({ scope: "quests:read" }), request({ scope: "quests:write" }), request({}), request({ scope: "agents:write" })]);
  assert.deepEqual(parallel.map(response => response.status), [200, 200, 200, 400]);
  for (const [response, scopes] of parallel.slice(0, 3).map((response, index) => [response, [["quests:read"], ["quests:write"], ["quests:read", "quests:write"]][index]] as const)) {
    const issued = await response.json() as Tokens;
    assert.equal(issued.refresh_token, tokens.refresh_token);
    assert.deepEqual((await f.identity(issued.access_token))?.scopes, scopes);
  }
  assert.deepEqual([...f.records].filter(([key]) => /^(refresh:|user-client:)/.test(key)), grantsBefore);
});

test("authorization_code rejects repeated client_id without consuming the code or issuing tokens", async () => {
  const f = fixture();
  await f.exchange(resource, { code_verifier: "wrong-verifier" });
  for (const repeated of [clientId, "other-client"]) {
    const body = new URLSearchParams({ grant_type: "authorization_code", code: "test-code", client_id: clientId,
      redirect_uri: redirectUri, code_verifier: verifier });
    body.append("client_id", repeated);
    const response = await tokenEndpoint(new Request(`${origin}/oauth/token`, { method: "POST", body }), f.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
    assert.ok(f.records.has(`code:${await sha256("test-code")}`));
    assert.equal([...f.records.keys()].some(key => /^(access:|refresh:|user-client:)/.test(key)), false);
  }
});

test("bound refresh retains concurrent retries, absolute expiry and complete revocation", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const refresh = () => tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, resource }), f.env);
  const responses = await Promise.all([refresh(), refresh()]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const issued = await Promise.all(responses.map(response => response.json() as Promise<Tokens>));
  assert.notEqual(issued[0].access_token, issued[1].access_token);
  assert.ok(issued.every(token => token.refresh_token === tokens.refresh_token));
  const refreshKey = `refresh:${await sha256(tokens.refresh_token)}`;
  const stored = JSON.parse(f.records.get(refreshKey)!);
  await f.kv.put(refreshKey, JSON.stringify({ ...stored, refreshExpiresAt: Date.now() - 1 }));
  assert.equal((await refresh()).status, 400);
  await f.kv.put(refreshKey, JSON.stringify(stored));
  await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST", body: new URLSearchParams({ token: issued[0].access_token }) }), f.env);
  assert.equal((await refresh()).status, 400);
  for (const token of [tokens, ...issued]) assert.equal(await f.identity(token.access_token), null);
});

test("never-resource legacy tokens retain compatibility and can request a narrower bound access token", async () => {
  const f = fixture();
  const tokens = await (await f.exchange()).json() as Tokens;
  assert.ok(await f.identity(tokens.access_token, `${origin}/v1/quests`));
  assert.ok(await f.identity(tokens.access_token, `${alias}/mcp`));
  const bound = await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource, scope: "quests:read" }), f.env);
  const narrowed = await bound.json() as Tokens;
  assert.deepEqual((await f.identity(narrowed.access_token))?.scopes, ["quests:read"]);
  assert.equal(await f.identity(narrowed.access_token, `${alias}/mcp`), null);
  const accessKey = `access:${await sha256(narrowed.access_token)}`;
  await f.kv.put(accessKey, JSON.stringify({ ...JSON.parse(f.records.get(accessKey)!), resource: 123 }));
  assert.equal(await f.identity(narrowed.access_token), null);
  const deferred = await (await f.exchange("", { resource })).json() as Tokens;
  assert.ok(await f.identity(deferred.access_token));
  assert.equal(await f.identity(deferred.access_token, `${alias}/mcp`), null);
});

test("stored empty-resource legacy grants remain usable, while explicitly empty requests are rejected", async () => {
  const f = fixture();
  const tokens = await (await f.exchange()).json() as Tokens;
  const refreshKey = `refresh:${await sha256(tokens.refresh_token)}`;
  const accessKey = `access:${await sha256(tokens.access_token)}`;
  for (const key of [accessKey, refreshKey]) await f.kv.put(key, JSON.stringify({ ...JSON.parse(f.records.get(key)!), resource: "" }));
  assert.ok(await f.identity(tokens.access_token, `${origin}/v1/quests`));
  const before = [...f.records];
  const invalid = await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource: "" }), f.env);
  assert.deepEqual(await invalid.json(), { error: "invalid_target" });
  assert.deepEqual([...f.records], before);
  const omitted = await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), f.env);
  assert.equal(omitted.status, 200);
  const refreshed = await omitted.json() as Tokens;
  assert.deepEqual((await f.identity(refreshed.access_token, `${alias}/mcp`))?.scopes, ["quests:read", "quests:write"]);
  assert.equal(JSON.parse(f.records.get(`access:${await sha256(refreshed.access_token)}`)!).resource, undefined);
  assert.equal(f.records.get(refreshKey), before.find(([key]) => key === refreshKey)![1]);
});

test("authorize rejects explicit empty or repeated scopes and ambiguous binding parameters before persistence", async () => {
  const f = fixture();
  await f.kv.put(`client:${clientId}`, JSON.stringify({ clientId, clientName: "Resource test", redirectUris: [redirectUri] }));
  const base = { response_type: "code", client_id: clientId, redirect_uri: redirectUri,
    code_challenge: await sha256(verifier), code_challenge_method: "S256" };
  for (const scope of ["", "   ", "\t\n"]) {
    const response = await authorizePage(new Request(`${origin}/oauth/authorize?${new URLSearchParams({ ...base, scope })}`), f.env);
    assert.deepEqual(await response.json(), { error: "invalid_scope" });
  }
  for (const key of [...Object.keys(base), "scope", "state"]) {
    const params = new URLSearchParams({ ...base, scope: "quests:read", state: "test-state" });
    params.append(key, params.get(key)!);
    const response = await authorizePage(new Request(`${origin}/oauth/authorize?${params}`), f.env);
    assert.deepEqual(await response.json(), { error: "invalid_request" }, key);
  }
  assert.equal([...f.records.keys()].some(key => key.startsWith("authorize:")), false);
  const omitted = await authorizePage(new Request(`${origin}/oauth/authorize?${new URLSearchParams(base)}`), f.env);
  assert.equal(omitted.status, 200);
  assert.deepEqual(JSON.parse([...f.records].find(([key]) => key.startsWith("authorize:"))![1]).scopes, ALL_SCOPES);
});

test("token endpoint rejects repeated single-valued parameters without consuming a grant", async () => {
  const f = fixture();
  await f.exchange(resource, { code_verifier: "wrong-verifier" });
  const params = { grant_type: "authorization_code", code: "test-code", client_id: clientId,
    redirect_uri: redirectUri, code_verifier: verifier, resource };
  const before = [...f.records];
  for (const key of ["grant_type", "code", "redirect_uri", "code_verifier"]) {
    const body = new URLSearchParams(params);
    body.append(key, params[key as keyof typeof params]);
    const response = await tokenEndpoint(new Request(`${origin}/oauth/token`, { method: "POST", body }), f.env);
    assert.deepEqual(await response.json(), { error: "invalid_request" }, key);
    assert.deepEqual([...f.records], before);
  }
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  body.append("refresh_token", tokens.refresh_token);
  const snapshot = [...f.records];
  assert.deepEqual(await (await tokenEndpoint(new Request(`${origin}/oauth/token`, { method: "POST", body }), f.env)).json(), { error: "invalid_request" });
  assert.deepEqual([...f.records], snapshot);
});

test("revocation enforces a supplied client and rejects ambiguous tokens without changing stored authorization", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  for (const token of [tokens.access_token, tokens.refresh_token]) {
    for (const value of ["other-client", "", " "]) {
      const before = [...f.records];
      const response = await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST",
        body: new URLSearchParams({ token, client_id: value }) }), f.env);
      assert.deepEqual(await response.json(), { error: "invalid_client" });
      assert.deepEqual([...f.records], before);
    }
  }
  for (const key of ["token", "client_id", "token_type_hint"]) {
    const body = new URLSearchParams({ token: tokens.access_token, client_id: clientId, token_type_hint: "access_token" });
    body.append(key, body.get(key)!);
    const before = [...f.records];
    const response = await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST", body }), f.env);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
    assert.deepEqual([...f.records], before);
  }
  assert.equal((await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST",
    body: new URLSearchParams({ token: tokens.access_token, client_id: clientId }) }), f.env)).status, 200);
  assert.equal(await f.identity(tokens.access_token), null);
});

test("revoking a superseded token invalidates its own family and preserves the newly consented connection", async () => {
  for (const type of ["access_token", "refresh_token"] as const) {
    const f = fixture();
    const old = await (await f.exchange(resource)).json() as Tokens;
    const sibling = await (await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: old.refresh_token }), f.env)).json() as Tokens;
    const current = await (await f.exchange(resource)).json() as Tokens;
    const currentGrant = f.records.get(`user-client:resource-user:${clientId}`);
    const response = await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST",
      body: new URLSearchParams({ token: old[type], client_id: clientId }) }), f.env);
    assert.equal(response.status, 200);
    assert.equal(f.records.get(`user-client:resource-user:${clientId}`), currentGrant);
    assert.equal(await f.kv.get(await oauthClientDisconnectKey("resource-user", clientId)), null, "exact-token revocation must not create an owner/client Disconnect boundary");
    assert.equal(await f.identity(old.access_token), null);
    assert.equal(await f.identity(sibling.access_token), null);
    assert.ok(await f.identity(current.access_token));
    assert.equal((await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: current.refresh_token }), f.env)).status, 200);
  }
});

test("an orphaned grant can still revoke all access tokens in its refresh family", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const sibling = await (await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), f.env)).json() as Tokens;
  f.records.delete(`user-client:resource-user:${clientId}`);
  await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST", body: new URLSearchParams({ token: tokens.refresh_token }) }), f.env);
  assert.equal(await f.identity(sibling.access_token), null);
  assert.equal(await f.identity(tokens.access_token), null);
});

test("revocation establishes its family tombstone before a token deletion can fail", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const sibling = await (await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), f.env)).json() as Tokens;
  const originalDelete = f.kv.delete.bind(f.kv);
  f.kv.delete = async key => {
    if (key.startsWith("refresh:")) throw new Error("simulated delete failure");
    await originalDelete(key);
  };
  await assert.rejects(revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST",
    body: new URLSearchParams({ token: sibling.access_token }) }), f.env), /simulated delete failure/);
  assert.equal(await f.identity(tokens.access_token), null);
  assert.equal(await f.identity(sibling.access_token), null);
  assert.deepEqual(await (await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), f.env)).json(), { error: "invalid_grant" });
});

test("malformed persisted code audiences cannot be normalized into an unrestricted grant", async () => {
  const f = fixture();
  await f.exchange(resource, { code_verifier: "wrong-verifier" });
  const key = `code:${await sha256("test-code")}`;
  const code = JSON.parse(f.records.get(key)!);
  for (const audience of [null, 123, [resource], { resource }]) {
    await f.kv.put(key, JSON.stringify({ ...code, resource: audience }));
    const before = [...f.records];
    const response = await tokenEndpoint(f.form({ grant_type: "authorization_code", code: "test-code",
      client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }), f.env);
    assert.deepEqual(await response.json(), { error: "invalid_grant" });
    assert.deepEqual([...f.records], before);
  }
});

test("a refresh that finishes after revocation cannot resurrect its authorization family", { timeout: 5000 }, async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  let release!: () => void;
  let writing!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const reachedWrite = new Promise<void>(resolve => { writing = resolve; });
  const put = f.kv.put.bind(f.kv);
  f.kv.put = async (key, value, options) => {
    if (key.startsWith("access:")) {
      writing();
      await paused;
    }
    await put(key, value, options);
  };
  const refreshing = tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token,
    client_id: clientId, resource, scope: "quests:read" }), f.env);
  await reachedWrite;
  await revokeToken(new Request(`${origin}/oauth/revoke`, { method: "POST",
    body: new URLSearchParams({ token: tokens.refresh_token, client_id: clientId }) }), f.env);
  const revokedGrant = f.records.get(`user-client:resource-user:${clientId}`);
  release();
  const response = await refreshing;
  assert.equal(response.status, 200, "an in-flight response may finish, but its credential must already be unusable");
  const refreshed = await response.json() as Tokens;
  assert.equal(await f.identity(refreshed.access_token), null);
  assert.equal(await f.identity(tokens.access_token), null);
  assert.equal(f.records.get(`user-client:resource-user:${clientId}`), revokedGrant);
  assert.deepEqual(await (await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: refreshed.refresh_token }), f.env)).json(), { error: "invalid_grant" });
});

test("indexed access uses only the latest consented family and requires the token's exact family", async () => {
  const f = fixture();
  const a = await (await f.exchange(resource)).json() as Tokens;
  const b = await (await f.exchange(resource)).json() as Tokens;
  assert.equal(await f.identity(a.access_token), null, "superseded access is denied at reconsent, before Disconnect");
  assert.ok(await f.identity(b.access_token));
  const key = `access:${await sha256(b.access_token)}`;
  const stored = JSON.parse(f.records.get(key)!);
  for (const refreshHash of [undefined, "", null, 123, "another-family"]) {
    await f.kv.put(key, JSON.stringify({ ...stored, refreshHash }));
    assert.equal(await f.identity(b.access_token), null);
  }
  await f.kv.put(key, JSON.stringify(stored));
  assert.deepEqual((await f.identity(b.access_token))?.scopes, ["quests:read", "quests:write"]);
});

test("invalid or foreign client indexes fail closed for both access and refresh, instead of legacy fallback", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const key = `user-client:resource-user:${clientId}`;
  const original = f.records.get(key)!;
  const grant = JSON.parse(original);
  const invalid = ["invalid-json", "null", "[]", "{}", ...[
    { uid: "other-user" }, { clientId: "other-client" }, { scopes: undefined }, { scopes: [123] },
    { scopes: ["unknown:scope"] }, { refreshHash: null }, { refreshHash: 123 }, { revokedAt: null },
    { revokedAt: 123 }, { revokedAt: "2026-10-06T00:00:00.000Z" },
  ].map(patch => JSON.stringify({ ...grant, ...patch }))];
  for (const value of invalid) {
    await f.kv.put(key, value);
    const before = [...f.records];
    assert.equal(await f.identity(tokens.access_token), null, value);
    const response = await tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), f.env);
    assert.deepEqual(await response.json(), { error: "invalid_grant" });
    assert.deepEqual([...f.records], before);
  }
  await f.kv.put(key, original);
  assert.ok(await f.identity(tokens.access_token));
});

test("never-indexed legacy access and refresh require no identified Disconnect boundary; unidentified access stays compatible", async () => {
  const f = fixture();
  const uid = "resource-user";
  const legacyAccess = "never-indexed-access";
  const legacyRefresh = "never-indexed-refresh";
  const refreshHash = await sha256(legacyRefresh);
  await f.kv.put(`access:${await sha256(legacyAccess)}`, JSON.stringify({ uid, clientId, scopes: ["quests:read"], refreshHash, expiresAt: Date.now() + 60_000 }));
  await f.kv.put(`refresh:${refreshHash}`, JSON.stringify({ uid, clientId, scopes: ["quests:read"], refreshHash }));
  const unidentified = "unidentified-access";
  await f.kv.put(`access:${await sha256(unidentified)}`, JSON.stringify({ uid, scopes: ["quests:read"], expiresAt: Date.now() + 60_000 }));
  assert.ok(await f.identity(legacyAccess));
  assert.ok(await f.identity(unidentified));
  const refresh = () => tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: legacyRefresh }), f.env);
  assert.equal((await refresh()).status, 200);
  assert.equal(await revokeAuthorizedClient(f.env, uid, clientId), null, "identified legacy Disconnect persists a boundary even without an index");
  assert.equal(await f.identity(legacyAccess), null);
  assert.equal((await refresh()).status, 400);
  assert.ok(await f.identity(unidentified), "no client ID means no identified owner/client boundary");
  const fresh = await (await f.exchange()).json() as Tokens;
  assert.ok(await f.identity(fresh.access_token), "a durable boundary does not deny a matching new indexed grant");
  assert.equal(await f.identity(legacyAccess), null);
});

test("permanent deletion retains a private hashed Disconnect boundary without mutating a refused active grant", async () => {
  const f = fixture();
  const tokens = await (await f.exchange(resource)).json() as Tokens;
  const key = await oauthClientDisconnectKey("resource-user", clientId);
  assert.match(key, /^client-disconnected:[A-Za-z0-9_-]{43}$/);
  assert.notEqual(key, await oauthClientDisconnectKey("other-user", clientId));
  assert.notEqual(await oauthClientDisconnectKey("a:b", "c"), await oauthClientDisconnectKey("a", "b:c"));
  await assert.rejects(deleteAuthorizedClient(f.env, "resource-user", clientId), { code: "oauth_connection_active" });
  assert.equal(await f.kv.get(key), null);
  const grantKey = `user-client:resource-user:${clientId}`;
  await f.kv.put(grantKey, JSON.stringify({ ...JSON.parse(f.records.get(grantKey)!), revokedAt: "2026-10-06T00:00:00.000Z" }));
  await deleteAuthorizedClient(f.env, "resource-user", clientId);
  assert.equal(await f.kv.get(key), "1", "legacy revoked history deletion creates its own durable boundary");
  assert.equal(await f.identity(tokens.access_token), null);
  assert.equal(await f.kv.get(grantKey), null);
  await deleteAuthorizedClient(f.env, "resource-user", clientId);
  assert.equal(await f.kv.get(key), "1");
});

test("a Disconnect boundary can be bypassed only by a valid current family, never by a familyless legacy index", async () => {
  const f = fixture();
  const tokens = await (await f.exchange()).json() as Tokens;
  const key = `user-client:resource-user:${clientId}`;
  const original = f.records.get(key)!;
  for (const refreshHash of [undefined, ""]) {
    await f.kv.put(key, JSON.stringify({ ...JSON.parse(original), refreshHash }));
    const refresh = () => tokenEndpoint(f.form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }), f.env);
    assert.ok(await f.identity(tokens.access_token), "a familyless legacy index without a boundary stays compatible");
    assert.equal((await refresh()).status, 200);
    await f.kv.put(await oauthClientDisconnectKey("resource-user", clientId), "1");
    assert.equal(await f.identity(tokens.access_token), null, "missing indexed family cannot override a durable Disconnect");
    const before = [...f.records];
    assert.deepEqual(await (await refresh()).json(), { error: "invalid_grant" });
    assert.deepEqual([...f.records], before);
    await f.kv.delete(await oauthClientDisconnectKey("resource-user", clientId));
  }
  await f.kv.put(key, original);
  await f.kv.put(await oauthClientDisconnectKey("resource-user", clientId), "1");
  assert.ok(await f.identity(tokens.access_token), "the valid original indexed family remains permitted");
});
