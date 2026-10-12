import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, Response as MiniflareResponse, type Request as MiniflareRequest } from "miniflare";
import { oauthClientDisconnectKey } from "../worker/src/security.ts";

const artifactDir = resolve(".qa-artifacts/guilduo-oauth-workerd");
const verifier = "disposable-workerd-pkce-verifier-0123456789abcdef";
const redirectUri = "http://127.0.0.1:8989/callback";
const jwt = "synthetic.local.jwt";
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
type Tokens = { access_token: string; refresh_token: string; scope: string };

async function fixture(t: TestContext) {
  // Same actual-D1 lifecycle as tests/jev.test.ts: Miniflare, getD1Database,
  // t.after(dispose). Its workerdDatabase helper is private to that test file.
  const bundle = await build({ entryPoints: [resolve("tests/fixtures/oauth-workerd.ts")], bundle: true,
    format: "esm", platform: "browser", target: "es2022", write: false, metafile: true });
  const sourceHashes = Object.fromEntries([...Object.keys(bundle.metafile.inputs), "migrations/0010_oauth_records.sql"]
    .map(path => [path, createHash("sha256").update(readFileSync(resolve(path))).digest("hex")]));
  let acceptedChecks: string[] = [];
  let observations: Record<string, unknown> | undefined;
  let publicRequests = 0;
  let syntheticAccountRequests = 0;
  let overlapAccounts = false;
  let accountArrivals = 0;
  let releaseAccounts!: () => void;
  const accountsReady = new Promise<void>(resolve => { releaseAccounts = resolve; });
  let revocationArrived!: () => void;
  let releaseRevoke!: () => void;
  const revokeReady = new Promise<void>(resolve => { revocationArrived = resolve; });
  const revokeGate = new Promise<void>(resolve => { releaseRevoke = resolve; });
  let fixtureControlRequests = 0;
  const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-08-06", host: "127.0.0.1", port: 0, cf: false,
    d1Databases: ["QUESTFORGE_DB"],
    bindings: { APPWRITE_ENDPOINT: "https://appwrite.fixture.test/v1", APPWRITE_PROJECT_ID: "disposable-test",
      MCP_ALLOWED_ORIGINS: "https://alias.fixture.test" },
    outboundService: async (request: MiniflareRequest) => {
      if (request.url === "https://control.fixture.test/revoke") {
        fixtureControlRequests++;
        revocationArrived();
        await revokeGate;
        return new MiniflareResponse("released");
      }
      if (request.url === "https://appwrite.fixture.test/v1/account") {
        syntheticAccountRequests++;
        assert.equal(request.headers.get("x-appwrite-project"), "disposable-test");
        const token = request.headers.get("x-appwrite-jwt");
        if (token !== jwt && token !== "synthetic.other.jwt") return new MiniflareResponse("Invalid synthetic JWT", { status: 401 });
        if (overlapAccounts) {
          if (++accountArrivals === 2) { overlapAccounts = false; releaseAccounts(); }
          await accountsReady;
        }
        return MiniflareResponse.json({ $id: token === jwt ? "workerd-owner" : "other-owner", email: "owner@fixture.test" });
      }
      publicRequests++;
      // No request is ever forwarded to the network.
      return new MiniflareResponse("Unexpected outbound request blocked", { status: 502 });
    },
  });
  t.after(async () => {
    releaseAccounts();
    releaseRevoke();
    await runtime.dispose();
    mkdirSync(artifactDir, { recursive: true });
    const evidenceName = t.name.startsWith("one-time") ? "consumption" : t.name.startsWith("Disconnect") ? "disconnect-regression" : "revocation";
    writeFileSync(resolve(artifactDir, `${evidenceName}-evidence.json`),
      JSON.stringify({ test: t.name, status: acceptedChecks.length && publicRequests === 0 ? "passed" : "incomplete",
        regressionClosed: evidenceName === "disconnect-regression" && acceptedChecks.length > 0 && publicRequests === 0,
        recordedAt: new Date().toISOString(), nodeVersion: process.version, compatibilityDate: "2026-08-06",
        miniflareVersion: JSON.parse(readFileSync(resolve("node_modules/miniflare/package.json"), "utf8")).version,
        sourceHashes, acceptedChecks, observations, publicRequests, syntheticAccountRequests, fixtureControlRequests,
        networkForwardedRequests: 0, credentialEgressRequests: 0 }, null, 2));
    assert.equal(publicRequests, 0, "no attempted public/out-of-fixture requests");
  });
  const origin = (await runtime.ready).origin;
  const db = await runtime.getD1Database("QUESTFORGE_DB");
  // Execute the real OAuth migration on D1; no SQLite adapter is involved.
  const migration = readFileSync(resolve("migrations/0010_oauth_records.sql"), "utf8");
  await db.batch(migration.split(";").map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  const request = (path: string, init?: RequestInit) => fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  const form = (path: string, values: Record<string, string>, headers?: Record<string, string>) => request(path, { method: "POST", body: new URLSearchParams(values), headers });
  const register = async () => {
    const registered = await request("/oauth/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Disposable workerd client", redirect_uris: [redirectUri] }) });
    assert.equal(registered.status, 201);
    return (await registered.json() as { client_id: string }).client_id;
  };
  const clientId = await register();
  const resource = `${origin}/mcp`;
  const authorize = async (scope = "quests:read", requestedClient = clientId) => {
    const response = await request(`/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: requestedClient,
      redirect_uri: redirectUri, code_challenge: hash(verifier), code_challenge_method: "S256", scope, resource })}`);
    assert.equal(response.status, 200);
    await response.text();
    const pending = await db.prepare("SELECT record_key FROM oauth_records WHERE record_key LIKE 'authorize:%' AND is_deleted=0").all<{ record_key: string }>();
    assert.equal(pending.results.length, 1);
    return pending.results[0].record_key.slice("authorize:".length);
  };
  const approve = (requestId: string, token = jwt) => request("/oauth/approve", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, jwt: token }) });
  const codeFrom = async (response: Response) => {
    assert.equal(response.status, 200);
    const { redirect } = await response.json() as { redirect: string };
    const code = new URL(redirect).searchParams.get("code");
    assert.ok(code);
    return code;
  };
  const exchange = (code: string, requestedClient = clientId) => form("/oauth/token", { grant_type: "authorization_code", code, client_id: requestedClient,
    redirect_uri: redirectUri, code_verifier: verifier, resource });
  const refresh = (token: string, extra: Record<string, string> = {}) => form("/oauth/token", {
    grant_type: "refresh_token", refresh_token: token, client_id: clientId, resource, ...extra });
  const tokensFrom = async (response: Response): Promise<Tokens> => {
    assert.equal(response.status, 200);
    const tokens = await response.json() as Tokens;
    assert.ok(tokens.access_token && tokens.refresh_token);
    return tokens;
  };
  const grantKey = `user-client:workerd-owner:${clientId}`;
  const row = (key: string) => db.prepare("SELECT value_json,expires_at,is_deleted,updated_at FROM oauth_records WHERE record_key=?").bind(key).first();
  const issue = async (scope = "quests:read", owner = "workerd-owner", requestedClient = clientId) => tokensFrom(await exchange(
    await codeFrom(await approve(await authorize(scope, requestedClient), owner === "workerd-owner" ? jwt : "synthetic.other.jwt")), requestedClient));
  const identity = (token: string, path = "/mcp") => request(path, { headers: { authorization: `Bearer ${token}` } });
  return { db, request, form, resource, clientId, register, authorize, approve, codeFrom, exchange, refresh, tokensFrom, row, grantKey, issue, identity,
    revokeReady, releaseRevoke, overlapAccounts() { overlapAccounts = true; }, accept(checks: string[]) { acceptedChecks = checks; },
    recordObservations(value: Record<string, unknown>) { observations = value; } };
}

test("one-time consent and code consumption use actual workerd D1 over concurrent HTTP", { timeout: 90_000 }, async t => {
  const f = await fixture(t);
  const requestId = await f.authorize();
  f.overlapAccounts();
  const approvals = await Promise.all([f.approve(requestId), f.approve(requestId)]);
  assert.deepEqual(approvals.map(r => r.status).sort(), [200, 400]);
  assert.deepEqual(await approvals.find(r => r.status === 400)!.json(), { error: "authorization_request_expired" });
  const code = await f.codeFrom(approvals.find(r => r.status === 200)!);
  assert.equal((await f.approve(requestId)).status, 400);
  assert.equal((await f.row(`authorize:${requestId}`))?.is_deleted, 1);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM oauth_records WHERE record_key LIKE 'code:%' AND is_deleted=0").first())?.n, 1);
  const responses = await Promise.all([f.exchange(code), f.exchange(code)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  assert.deepEqual(await responses.find(r => r.status === 400)!.json(), { error: "invalid_grant" });
  const issued = await f.tokensFrom(responses.find(r => r.status === 200)!);
  assert.equal((await f.exchange(code)).status, 400);
  assert.equal((await f.row(`code:${hash(code)}`))?.is_deleted, 1);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM oauth_records WHERE record_key LIKE 'refresh:%' AND is_deleted=0").first())?.n, 1);
  const refreshKey = `refresh:${hash(issued.refresh_token)}`;
  const before = [await f.row(refreshKey), await f.row(f.grantKey)];
  const refreshed = await f.tokensFrom(await f.refresh(issued.refresh_token));
  assert.equal(refreshed.scope, "quests:read");
  assert.equal(refreshed.refresh_token, issued.refresh_token);
  assert.deepEqual([await f.row(refreshKey), await f.row(f.grantKey)], before, "refresh preserves grant and absolute expiry");
  const identity = await f.identity(refreshed.access_token);
  assert.equal(identity.status, 200);
  assert.deepEqual((await identity.json() as { scopes: string[] }).scopes, ["quests:read"]);
  assert.equal((await f.identity(refreshed.access_token, "/v1/quests")).status, 401);
  assert.equal((await f.identity(refreshed.access_token, `/__fixture/auth?url=${encodeURIComponent("https://alias.fixture.test/mcp")}`)).status, 401);
  for (const [extra, error] of [[{ resource: "https://alias.fixture.test/mcp" }, "invalid_target"], [{ scope: "quests:write" }, "invalid_scope"]] as const) {
    const denied = await f.refresh(issued.refresh_token, extra);
    assert.equal(denied.status, 400);
    assert.deepEqual(await denied.json(), { error });
  }
  assert.deepEqual([await f.row(refreshKey), await f.row(f.grantKey)], before);
  f.accept(["concurrent consent approvals: 200/400; one live code", "concurrent code exchanges: 200/400; one live refresh",
    "consent/code replay denied; consumed D1 tombstones", "refresh retains quests:read, stable credential, absolute expiry and unchanged grant",
    "bound access denied on REST and trusted alternate MCP origin", "refresh resource mismatch and scope escalation rejected"]);
});

test("Disconnect regression: latest-family access, reconsent, hard delete and owner/client isolation on workerd D1", { timeout: 90_000 }, async t => {
  const f = await fixture(t);
  const agentMigration = readFileSync(resolve("migrations/0004_agent_registry.sql"), "utf8");
  await f.db.batch(agentMigration.split(";").map(sql => sql.trim()).filter(Boolean).map(sql => f.db.prepare(sql)));
  const links = await f.db.prepare("SELECT COUNT(*) AS n FROM agent_registry_connections WHERE uid=? AND client_id=?")
    .bind("workerd-owner", f.clientId).first<{ n: number }>();
  assert.equal(links?.n, 0, "never-linked legacy client has no Agent relation to revoke");

  const otherOwner = await f.issue("quests:read", "other-owner");
  const otherClientId = await f.register();
  const otherClient = await f.issue("quests:read", "workerd-owner", otherClientId);
  // Host-side fixture seed on the same actual D1 binding; no worker seed route.
  const legacy: Tokens = { access_token: "synthetic-never-indexed-access", refresh_token: "synthetic-never-indexed-refresh", scope: "quests:read" };
  const legacyClient = "never-indexed-client";
  const legacyRecord = { uid: "workerd-owner", email: "owner@fixture.test", clientId: legacyClient, scopes: ["quests:read"],
    resource: f.resource, expiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 3_600_000,
    refreshHash: hash(legacy.refresh_token), accessHash: hash(legacy.access_token) };
  await f.db.batch([`access:${hash(legacy.access_token)}`, `refresh:${hash(legacy.refresh_token)}`].map(key =>
    f.db.prepare("INSERT INTO oauth_records(record_key,value_json,expires_at,is_deleted,updated_at) VALUES (?,?,0,0,?)")
      .bind(key, JSON.stringify(legacyRecord), Date.now())));
  assert.equal(await f.row(`user-client:workerd-owner:${legacyClient}`), null);
  const checkIsolation = async () => {
    for (const [tokens, uid, clientId] of [[otherOwner, "other-owner", f.clientId], [otherClient, "workerd-owner", otherClientId],
      [legacy, "workerd-owner", legacyClient]] as const) {
      const authenticated = await f.identity(tokens.access_token);
      assert.equal(authenticated.status, 200);
      assert.equal((await authenticated.json() as { uid: string }).uid, uid);
      await f.tokensFrom(await f.refresh(tokens.refresh_token, { client_id: clientId }));
    }
  };
  const checkDenied = async (tokens: Tokens[]) => {
    const statuses = [];
    for (const token of tokens) {
      const access = await f.identity(token.access_token);
      const refresh = await f.refresh(token.refresh_token);
      assert.equal(access.status, 401);
      assert.equal(refresh.status, 400);
      assert.deepEqual(await refresh.json(), { error: "invalid_grant" });
      statuses.push({ access: access.status, refresh: refresh.status });
    }
    return statuses;
  };

  // Contrast exact token-family revocation with connection-wide Disconnect.
  const familyA = await f.issue();
  const familyB = await f.issue();
  const familyBRow = await f.row(f.grantKey);
  assert.equal((await f.form("/oauth/revoke", { token: familyA.access_token, client_id: f.clientId })).status, 200);
  assert.equal((await f.identity(familyA.access_token)).status, 401);
  assert.equal((await f.refresh(familyA.refresh_token)).status, 400);
  assert.deepEqual(await f.row(f.grantKey), familyBRow);
  assert.equal((await f.identity(familyB.access_token)).status, 200);
  await f.tokensFrom(await f.refresh(familyB.refresh_token));

  // Fresh A -> B consent: approved latest-family semantics reject A now.
  const old = await f.issue();
  const oldRefreshed = await f.tokensFrom(await f.refresh(old.refresh_token));
  const latest = await f.issue();
  const latestRefreshed = await f.tokensFrom(await f.refresh(latest.refresh_token));
  const before = { oldAccess: (await f.identity(old.access_token)).status,
    oldRefresh: (await f.refresh(old.refresh_token)).status,
    latestAccess: (await f.identity(latest.access_token)).status,
    latestRefresh: (await f.refresh(latest.refresh_token)).status };
  assert.deepEqual(before, { oldAccess: 401, oldRefresh: 400, latestAccess: 200, latestRefresh: 200 });
  const disconnect = async () => {
    const response = await f.request("/__fixture/disconnect", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: f.clientId }) });
    assert.equal(response.status, 200);
    assert.ok((await response.json() as { revokedAt: string }).revokedAt);
  };
  const oldFamilies = [old, oldRefreshed, latest, latestRefreshed];
  const disconnectKey = await oauthClientDisconnectKey("workerd-owner", f.clientId);
  await disconnect();
  const marker = await f.row(disconnectKey);
  assert.equal(marker?.is_deleted, 0);
  assert.equal(marker?.expires_at, 0, "Disconnect boundary does not expire");
  const afterDisconnect = await checkDenied(oldFamilies);
  await checkIsolation();
  const consentC = await f.issue();
  const consentCRefreshed = await f.tokensFrom(await f.refresh(consentC.refresh_token));
  assert.equal((await f.identity(consentC.access_token)).status, 200);
  const afterConsentC = await checkDenied(oldFamilies);
  await checkIsolation();

  // Existing history deletion requires Disconnect first; call it directly
  // from the disposable wrapper, with no production router changes.
  await disconnect();
  const deleted = await f.request("/__fixture/hard-delete", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: f.clientId }) });
  assert.equal(deleted.status, 200);
  assert.ok(await deleted.json());
  assert.equal(await f.row(f.grantKey), null, "grant history physically deleted");
  const survivingOldRefresh = await f.row(`refresh:${hash(old.refresh_token)}`);
  assert.equal(survivingOldRefresh?.is_deleted, 0, "superseded A refresh survives latest-family cleanup");
  const allOld = [...oldFamilies, consentC, consentCRefreshed];
  const afterHardDelete = await checkDenied(allOld);
  assert.equal(await f.row(f.grantKey), null, "denied old refresh cannot recreate the grant index before fresh code consent");
  const markerAfterHardDelete = await f.row(disconnectKey);
  assert.equal(markerAfterHardDelete?.is_deleted, 0);
  assert.equal(markerAfterHardDelete?.expires_at, 0);
  await checkIsolation();
  assert.equal(await f.row(f.grantKey), null, "isolated owner/client refreshes cannot recreate the deleted index");
  const consentD = await f.issue();
  assert.equal((await f.identity(consentD.access_token)).status, 200);
  const refreshedD = await f.tokensFrom(await f.refresh(consentD.refresh_token));
  assert.equal((await f.identity(refreshedD.access_token)).status, 200);
  const afterConsentD = await checkDenied(allOld);
  assert.equal((await f.row(disconnectKey))?.is_deleted, 0, "new consent retains the permanent Disconnect boundary");
  await checkIsolation();
  assert.equal(await f.row(`user-client:workerd-owner:${legacyClient}`), null, "legacy compatibility never creates an index");
  f.recordObservations({ agentMigrationSha256: createHash("sha256").update(agentMigration).digest("hex"), agentConnectionCount: links?.n,
    beforeDisconnect: before, afterDisconnect, afterConsentC, afterHardDelete, afterConsentD,
    freshConsentCAccess: 200, freshConsentDAccess: 200, freshConsentDRefresh: 200,
    grantAbsentAfterHardDelete: true, grantAbsentAfterOldRefreshAttemptsBeforeFreshConsent: true,
    supersededOldRefreshRecordSurvivesCleanup: true, permanentDisconnectMarkerRetained: true,
    distinctOwnerSameClientAllowed: true, sameOwnerDistinctClientAllowed: true,
    neverIndexedNeverDisconnectedLegacyAllowed: true, exactFamilyRevocationPreservesNewConsent: true });
  f.accept(["latest B consent rejects old A access and refresh", "explicit Disconnect denies all A/B credentials",
    "explicit consent C accepted; all A/B remain denied", "Disconnect and physical hard delete cannot revive A/B/C",
    "surviving A refresh denied with missing index; denied attempts never recreate index before fresh code consent",
    "hashed owner/client Disconnect marker persists without expiry across history deletion and new consent",
    "explicit consent D access/refresh accepted; all old families remain denied", "distinct owner/client remain allowed",
    "never-indexed never-disconnected legacy access/refresh retain compatibility", "exact token-family revoke preserves newer consent"]);
});

test("family revocation and reauthorization preservation execute candidate SQL on workerd D1", { timeout: 90_000 }, async t => {
  const f = await fixture(t);
  const old = await f.issue();
  const oldRefreshed = await f.tokensFrom(await f.refresh(old.refresh_token));
  // Exercise the normal json_set/ON CONFLICT revocation on real D1 first.
  const revoked = await f.form("/oauth/revoke", { token: oldRefreshed.access_token, client_id: f.clientId });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.headers.get("x-fixture-revoke-changes"), "1");
  assert.ok(JSON.parse(String((await f.row(f.grantKey))?.value_json)).revokedAt);
  assert.equal((await f.refresh(old.refresh_token)).status, 400);
  for (const tokens of [old, oldRefreshed]) assert.equal((await f.identity(tokens.access_token)).status, 401);
  const current = await f.issue();
  const currentRow = await f.row(f.grantKey);
  assert.equal((await f.form("/oauth/revoke", { token: old.access_token, client_id: f.clientId })).status, 200);
  assert.deepEqual(await f.row(f.grantKey), currentRow, "old family cannot mark a new consent revoked");
  assert.equal((await f.refresh(old.refresh_token)).status, 400);
  assert.equal((await f.identity(current.access_token)).status, 200);
  await f.tokensFrom(await f.refresh(current.refresh_token));

  // Deterministically replace a grant after revocation reads it but before
  // its conditional D1 write, proving the SQL family guard itself holds.
  const revoking = f.form("/oauth/revoke", { token: current.access_token, client_id: f.clientId }, { "x-fixture-pause-revoke": "1" });
  let replacement!: Tokens;
  let replacementRow;
  try {
    await Promise.race([f.revokeReady, revoking.then(() => { throw new Error("revocation never reached its SQL barrier"); })]);
    replacement = await f.issue();
    replacementRow = await f.row(f.grantKey);
  } finally {
    f.releaseRevoke();
    const staleRevocation = await revoking;
    assert.equal(staleRevocation.status, 200);
    assert.equal(staleRevocation.headers.get("x-fixture-revoke-changes"), "0");
  }
  assert.deepEqual(await f.row(f.grantKey), replacementRow, "stale SQL cannot revoke the replacement grant");
  const denied = await f.refresh(current.refresh_token);
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), { error: "invalid_grant" });
  assert.equal((await f.identity(current.access_token)).status, 401);
  assert.equal((await f.identity(replacement.access_token)).status, 200);
  await f.tokensFrom(await f.refresh(replacement.refresh_token));
  f.accept(["normal family revocation: D1 meta.changes=1", "all old family access tokens and refresh denied",
    "old-family revocation preserves reauthorized grant", "reauthorization between stale read and SQL: D1 meta.changes=0",
    "replacement grant byte-for-byte preserved; replacement access/refresh accepted"]);
});
