import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import workerModule, { MCP_TOOLS } from '../worker/src/index.ts';
import { createAgent } from '../worker/src/agent-store.ts';
import { readState, writeState } from '../worker/src/appwrite-store.ts';
import { getKv, sha256 } from '../worker/src/security.ts';
import { migrateState } from '../server/questforge-domain.ts';
import type { Quest, QuestForgeState } from '../types/questforge.ts';
import type { WorkerEnv } from '../worker/src/worker-types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
// tsx exposes this repository's CommonJS .ts default one level below an ESM .mts import.
const worker = 'fetch' in workerModule ? workerModule : (workerModule as unknown as { default: typeof workerModule }).default;
const output = resolve(root, '.qa-artifacts/guilduo-worker-candidate');
const candidateFiles = ['worker/src/index.ts', 'worker/src/mcp-transport.ts', 'worker/src/security.ts',
  'worker/src/oauth.ts', 'worker/src/oauth-record-store.ts', 'worker/src/mcp-origin.ts',
  'worker/src/agent-store.ts', 'worker/src/appwrite-store.ts',
  'server/questforge-domain.ts', 'api/mcp-tools.json'];

async function fingerprints() {
  return Object.fromEntries(await Promise.all(candidateFiles.map(async file =>
    [file, createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')])));
}

/** Real SDK -> loopback HTTP -> current Worker; never loads Wrangler or ambient credentials. */
export async function verifyCandidate() {
  const evidence: Record<string, unknown> = {
    acceptance: 'local-sdk-http-only', status: 'running', startedAt: new Date().toISOString(),
    aliases: { owner: 'owner-A', connection: 'connection-A', agent: 'agent-A', quest: 'quest-A' },
    boundaries: { publicOAuth: 'not-tested', humanRoundtrip: 'not-tested', cloudflareRuntime: 'not-tested',
      publicWrites: 0, modelCalls: 0, deploys: 0, ambientCredentialsLoaded: false, state: 'isolated-memory' },
  };
  const checks: string[] = [];
  const wire: Array<Record<string, unknown>> = [];
  const pending = new Set<Promise<unknown>>();
  const backgroundFailures: string[] = [];
  const sdkErrors: Array<{ kind: string; expected: boolean }> = [];
  let expectingSchemaRejection = false;
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { if (args[0] !== 'guilduo_request_timing') originalLog(...args); };
  let baseUrl = '';
  let client: { close(): Promise<void> } | undefined;
  let blockedOutbound = 0;
  let adapterFailures = 0;
  const adapterDiagnostics: Array<Record<string, unknown>> = [];
  const uid = `candidate-${randomUUID()}`;
  const token = randomUUID();
  const humanToken = randomUUID();
  const clientId = `candidate-${randomUUID()}`;
  let receivedOAuthCallback: URL | undefined;
  const oauthClients: Array<{ close(): Promise<void> }> = [];
  const env: WorkerEnv = {};
  const context = { waitUntil(promise: Promise<unknown>) {
    pending.add(promise);
    void promise.catch(() => backgroundFailures.push('background-task-failed')).finally(() => pending.delete(promise));
  } };
  // Fail closed for every fetch, including any optional Worker integration side effect.
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!baseUrl || url.origin !== baseUrl) {
      blockedOutbound++;
      throw new Error('Candidate verifier blocked a non-fixture fetch');
    }
    return originalFetch(input, { ...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(15_000) });
  };
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 1_048_576) throw new Error('Fixture request too large');
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      let rpc: Record<string, unknown> = {};
      try { rpc = JSON.parse(body.toString()) as Record<string, unknown>; } catch { /* malformed JSON probe */ }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const method = incoming.method || 'GET';
      const request = new Request(baseUrl + incoming.url, { method, headers,
        ...(['GET', 'HEAD'].includes(method) ? {} : { body }) });
      const requestUrl = new URL(request.url);
      let response: Response;
      if (requestUrl.pathname === '/fixture-appwrite/v1/account') {
        const valid = method === 'GET' && headers.get('x-appwrite-jwt') === humanToken
          && headers.get('x-appwrite-project') === 'candidate-fixture-project';
        response = new Response(JSON.stringify(valid ? { $id: uid, email: 'synthetic@example.test' } : { error: 'invalid_fixture_identity' }),
          { status: valid ? 200 : 401, headers: { 'content-type': 'application/json' } });
      } else if (requestUrl.pathname === '/fixture/oauth-callback' && method === 'GET') {
        receivedOAuthCallback = requestUrl;
        response = new Response(null, { status: 204 });
      } else response = await worker.fetch(request, env, context);
      const bytes = Buffer.from(await response.arrayBuffer());
      let result: Record<string, unknown> = {};
      try { result = JSON.parse(bytes.toString()) as Record<string, unknown>; } catch { /* empty notification / HTTP rejection */ }
      const params = rpc.params as { name?: string; protocolVersion?: string } | undefined;
      const error = result.error as { code?: number } | undefined;
      const payload = result.result as { protocolVersion?: string; isError?: boolean;
        structuredContent?: { error?: { code?: string } } } | undefined;
      const form = headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ? new URLSearchParams(body.toString()) : undefined;
      wire.push({ sequence: wire.length + 1, method, surface: requestUrl.pathname,
        rpc: typeof rpc.method === 'string' ? rpc.method : 'invalid-or-none', tool: params?.name,
        requestIdPresent: Object.hasOwn(rpc, 'id'), status: response.status, responseBytes: bytes.length,
        requestedProtocol: params?.protocolVersion, requestProtocol: headers.get('mcp-protocol-version'),
        negotiatedProtocol: payload?.protocolVersion, responseProtocol: response.headers.get('mcp-protocol-version'),
        rpcErrorCode: error?.code, toolErrorCode: payload?.structuredContent?.error?.code, isError: payload?.isError,
        oauthErrorCode: typeof result.error === 'string' ? result.error : undefined,
        grantType: form?.get('grant_type') ?? undefined, scope: form?.get('scope') ?? undefined,
        resourceMatchesFixture: form?.has('resource') ? form.get('resource') === `${baseUrl}/mcp`
          : requestUrl.searchParams.has('resource') ? requestUrl.searchParams.get('resource') === `${baseUrl}/mcp` : undefined,
        pkceMethod: requestUrl.searchParams.get('code_challenge_method') ?? undefined });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(bytes);
    } catch (error) {
      adapterFailures++;
      adapterDiagnostics.push({ kind: error instanceof Error ? error.name : 'unknown' });
      outgoing.writeHead(500);
      outgoing.end('Candidate adapter failed');
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  const snapshot = async () => JSON.stringify(await readState(env, uid));
  try {
    evidence.candidateHashes = await fingerprints();
    const pluginRequire = createRequire(resolve(root, 'plugins/guilduo-dsh/package.json'));
    const sdkEntry = pluginRequire.resolve('@modelcontextprotocol/client');
    const sdkPackage = JSON.parse(await readFile(resolve(dirname(sdkEntry), '../package.json'), 'utf8'));
    assert.equal(sdkPackage.version, '2.0.0', 'Acceptance requires the pinned real SDK 2.0.0');
    const pluginPackage = JSON.parse(await readFile(resolve(root, 'plugins/guilduo-dsh/package.json'), 'utf8'));
    assert.equal(pluginPackage.dependencies['@modelcontextprotocol/client'], '2.0.0');
    const { Client, StreamableHTTPClientTransport, auth, exchangeAuthorization, refreshAuthorization } = await import(pathToFileURL(sdkEntry).href);
    evidence.sdk = { name: sdkPackage.name, version: sdkPackage.version, source: 'isolated-plugin-dependency' };
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
    evidence.endpoint = 'loopback-A/mcp';
    const initial = await readState(env, uid);
    assert.equal(await writeState(env, uid, { schemaVersion: 7,
      state: migrateState({ schemaVersion: 7 } as QuestForgeState), clientUpdatedAt: new Date().toISOString() }, initial.etag), true);
    const scopes = ['quests:read', 'quests:write', 'agents:read', 'agents:write'];
    const grant = { uid, clientId, clientName: 'Candidate SDK fixture', scopes,
      firstConnectedAt: new Date().toISOString(), lastUsedAt: '', revokedAt: '' };
    const kv = getKv(env);
    await kv.put(`user-client:${uid}:${clientId}`, JSON.stringify(grant));
    await kv.put(`access:${await sha256(token)}`, JSON.stringify({ ...grant,
      resource: `${baseUrl}/mcp`, expiresAt: Date.now() + 600_000 }));
    await createAgent(env, uid, { agentId: 'candidate-agent', displayName: 'Candidate Agent',
      allowedScopes: ['quests:read', 'quests:write', 'agents:read'] });
    const sdkClient = new Client({ name: 'guilduo-candidate-verifier', version: '1.0.0' });
    client = sdkClient;
    sdkClient.onerror = (error: Error) => sdkErrors.push({ kind: error.name, expected: expectingSchemaRejection });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    const beforeConnect = await snapshot();
    await sdkClient.connect(transport, { timeout: 15_000 });
    assert.equal(await snapshot(), beforeConnect);
    checks.push('sdk-initialize-and-initialized-notification-no-state-write');
    const initialize = wire.find(row => row.rpc === 'initialize');
    assert.ok(initialize);
    assert.ok(initialize.negotiatedProtocol);
    const negotiatedProtocol = String(initialize.negotiatedProtocol);
    assert.ok(wire.some(row => row.rpc === 'notifications/initialized' && row.status === 202 && row.responseBytes === 0));
    evidence.protocol = { requested: initialize.requestedProtocol, negotiated: initialize.negotiatedProtocol };
    evidence.server = sdkClient.getServerVersion();
    const capabilities = sdkClient.getServerCapabilities();
    assert.deepEqual(capabilities.tools, {});
    evidence.capabilities = capabilities;
    const health = await (await fetch(`${baseUrl}/health`)).json() as { schemaVersion: number; mcp: { tools: number } };
    assert.equal(health.schemaVersion, 7);
    evidence.schemaVersion = health.schemaVersion;
    const discovery = await sdkClient.listTools();
    assert.equal(discovery.nextCursor, undefined);
    assert.equal(discovery.tools.length, MCP_TOOLS.length);
    assert.equal(discovery.tools.length, health.mcp.tools);
    assert.equal(new Set(discovery.tools.map((tool: { name: string }) => tool.name)).size, MCP_TOOLS.length);
    assert.deepEqual(discovery.tools, MCP_TOOLS);
    const contract = JSON.parse(await readFile(resolve(root, 'api/mcp-tools.json'), 'utf8'));
    assert.deepEqual(discovery.tools, contract.tools);
    assert.equal(sdkClient.getServerVersion().version, contract.version);
    evidence.toolCount = discovery.tools.length;
    evidence.tools = discovery.tools.map((tool: { name: string }) => tool.name);
    assert.equal(await snapshot(), beforeConnect);
    checks.push('sdk-discovery-exact-candidate-contract-and-health-schema');
    await sdkClient.ping({ timeout: 15_000 });
    checks.push('sdk-ping');
    async function call(name: string, args: Record<string, unknown> = {}) {
      return sdkClient.callTool({ name, arguments: args }, { timeout: 15_000 });
    }
    async function success(name: string, args: Record<string, unknown> = {}) {
      const result = await call(name, args);
      assert.equal(result.isError, false, `${name}: expected successful tool result`);
      assert.ok(result.structuredContent);
      return result.structuredContent as { quest: Quest; quests: Quest[]; linked: boolean; error?: { code: string } };
    }
    assert.equal((await success('link_agent', { agentId: 'candidate-agent' })).linked, true);
    await success('get_current_agent_context');
    const empty = await success('list_quests', { view: 'all' });
    assert.equal(empty.quests.length, 0);
    checks.push('sdk-link-isolated-agent-and-read-empty-workspace');
    const quest = (await success('create_quest', { kind: 'todo', title: 'Candidate task', notes: 'Keep original evidence' })).quest;
    assert.equal(quest.done, false);
    assert.equal(quest.lifecycleState, 'active');
    assert.equal(quest.requester?.type, 'agent');
    assert.equal(quest.requester?.id, 'candidate-agent');
    const read = (await success('get_quest', { questId: quest.id })).quest;
    for (const key of ['id', 'title', 'notes', 'done', 'lifecycleState', 'updatedAt', 'requester'] as const) {
      assert.deepEqual(read[key], quest[key]);
    }
    checks.push('sdk-create-and-readback-with-agent-requester');
    const patch = { questId: quest.id, nextAction: 'Review next phase', handoff: { note: 'Local SDK HTTP checks passed' },
      expectedUpdatedAt: read.updatedAt };
    const saved = (await success('update_quest', patch)).quest;
    const readback = (await success('get_quest', { questId: quest.id })).quest;
    assert.deepEqual(readback, saved);
    assert.equal(saved.nextAction, patch.nextAction);
    assert.equal(saved.handoff.note, patch.handoff.note);
    assert.equal(saved.title, quest.title);
    assert.equal(saved.notes, quest.notes);
    assert.equal(saved.done, false);
    assert.equal(saved.lifecycleState, 'active');
    assert.equal(saved.assignee.handoffState, quest.assignee.handoffState);
    assert.notEqual(saved.updatedAt, quest.updatedAt);
    checks.push('sdk-guarded-narrow-update-and-readback-no-completion');
    const stable = await snapshot();
    const stale = await call('update_quest', { ...patch, nextAction: 'Must not apply' });
    assert.equal(stale.isError, true);
    assert.equal(stale.structuredContent.error.code, 'quest_conflict');
    assert.equal(await snapshot(), stable);
    checks.push('sdk-stale-conflict-tool-error-preserves-state-revision-history');
    const invalidUpdates = [
      { ...patch, expectedUpdatedAt: saved.updatedAt, dryRun: true },
      { ...patch, nextAction: 42 }, { ...patch, nextAction: 'x'.repeat(181) },
      { ...patch, unexpected: true }, { ...patch, handoff: { note: 'x'.repeat(501) } },
      { ...patch, expectedUpdatedAt: 'invalid' }, { ...patch, actingAgentId: '../other' }, {},
    ];
    for (const args of invalidUpdates) {
      const start = wire.length;
      expectingSchemaRejection = true;
      try { await assert.rejects(() => call('update_quest', args)); }
      finally { expectingSchemaRejection = false; }
      assert.ok(wire.slice(start).some(row => row.tool === 'update_quest' && row.status === 400 && row.rpcErrorCode === -32602),
        'Must reach Worker schema validation over HTTP, not only a client-side rejection');
      assert.equal(await snapshot(), stable);
    }
    checks.push(`sdk-schema-rejections-${invalidUpdates.length}-preserve-state-revision-history`);
    await sdkClient.notification({ method: 'notifications/progress', params: { progressToken: 'probe', progress: 1 } });
    await sdkClient.notification({ method: 'notifications/cancelled', params: { requestId: 'probe', reason: 'fixture' } });
    await sdkClient.notification({ method: 'notifications/tools/call', params: { name: 'update_quest', arguments: patch } });
    for (const method of ['notifications/progress', 'notifications/cancelled', 'notifications/tools/call']) {
      assert.ok(wire.some(row => row.rpc === method && row.status === 202 && row.responseBytes === 0 && !row.requestIdPresent));
    }
    assert.equal(await snapshot(), stable);
    checks.push('sdk-notifications-acknowledged-without-tool-dispatch');
    async function raw(body: unknown, extraHeaders: Record<string, string> = {}, method = 'POST') {
      return fetch(`${baseUrl}/mcp`, { method, headers: { authorization: `Bearer ${token}`,
        'content-type': 'application/json', 'mcp-protocol-version': negotiatedProtocol, ...extraHeaders },
        ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body) }) });
    }
    const idless = await raw({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'update_quest', arguments: patch } });
    assert.equal(idless.status, 400);
    assert.equal((await idless.json() as { error: { code: number } }).error.code, -32600);
    for (const method of ['GET', 'PUT', 'DELETE', 'HEAD']) {
      const response = await raw({}, {}, method);
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'POST');
    }
    assert.equal((await raw({}, { origin: 'https://untrusted.example.test' })).status, 403);
    assert.equal((await raw({}, { 'mcp-protocol-version': '1999-01-01' })).status, 400);
    assert.equal((await raw({}, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await raw({}, { authorization: 'Bearer invalid-local-fixture' })).status, 401);
    assert.equal(await snapshot(), stable);
    checks.push('raw-idless-mutation-method-origin-protocol-content-type-auth-rejections-no-write');
    const finalList = await success('list_quests', { view: 'all' });
    assert.equal(finalList.quests.length, 1);
    assert.equal(finalList.quests[0].done, false);
    const finalState = (await readState(env, uid)).payload.state!;
    const originalState = JSON.parse(beforeConnect).payload.state as QuestForgeState;
    assert.deepEqual(finalState.character, originalState.character, 'No accidental reward/MP change');
    assert.deepEqual(finalState.battle, originalState.battle, 'No accidental battle/completion effect');
    checks.push('final-one-active-quest-character-and-battle-unchanged');

    // Additional lane: SDK-created client/code/tokens; only the Human account verifier is mocked.
    const oauthChecks: string[] = [];
    const oauthEvidence: Record<string, unknown> = { acceptance: 'local-sdk-oauth-mock-human', status: 'running',
      humanIdentity: 'synthetic-DEV-owner-via-local-mock-Appwrite-account', connection: 'connection-B', checks: oauthChecks };
    evidence.oauth = oauthEvidence;
    const oauthSnapshot = await snapshot();
    env.DEV_BEARER_TOKEN = humanToken;
    env.DEV_USER_ID = uid;
    env.APPWRITE_ENDPOINT = `${baseUrl}/fixture-appwrite/v1`;
    env.APPWRITE_PROJECT_ID = 'candidate-fixture-project';
    const resource = new URL(`${baseUrl}/mcp`);
    const redirectUrl = new URL(`${baseUrl}/fixture/oauth-callback`);
    const requestedScope = 'quests:read agents:read';
    const state = randomUUID();
    let registered: { client_id: string; issuer?: string } | undefined;
    type LocalTokens = { access_token: string; refresh_token?: string; scope?: string; issuer?: string; token_type: string };
    let oauthTokens: LocalTokens | undefined;
    let verifier: string | undefined;
    let authorizationUrl: URL | undefined;
    let discoveryState: { authorizationServerMetadata?: Record<string, unknown>; resourceMetadata?: { resource?: string } } | undefined;
    const provider = {
      redirectUrl,
      clientMetadata: { client_name: 'Candidate SDK OAuth fixture', redirect_uris: [redirectUrl.href],
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: requestedScope },
      state: () => state,
      clientInformation: () => registered,
      saveClientInformation: (value: NonNullable<typeof registered>) => { registered = structuredClone(value); },
      tokens: () => oauthTokens,
      saveTokens: (value: LocalTokens) => { oauthTokens = structuredClone(value); },
      saveCodeVerifier: (value: string) => { verifier = value; },
      codeVerifier: () => { assert.ok(verifier); return verifier; },
      discoveryState: () => discoveryState,
      saveDiscoveryState: (value: NonNullable<typeof discoveryState>) => { discoveryState = structuredClone(value); },
      redirectToAuthorization: (url: URL) => {
        assert.equal(url.origin, baseUrl);
        assert.equal(url.pathname, '/oauth/authorize');
        authorizationUrl = new URL(url);
      },
      invalidateCredentials: (scope: string) => {
        if (scope === 'all' || scope === 'client') registered = undefined;
        if (scope === 'all' || scope === 'tokens') oauthTokens = undefined;
        if (scope === 'all' || scope === 'verifier') verifier = undefined;
        if (scope === 'all' || scope === 'discovery') discoveryState = undefined;
      },
    };
    const challenge = await fetch(resource, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'oauth-challenge', method: 'ping' }) });
    assert.equal(challenge.status, 401);
    const metadataUrl = challenge.headers.get('www-authenticate')?.match(/resource_metadata="([^"]+)"/)?.[1];
    assert.equal(metadataUrl, `${baseUrl}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(await auth(provider, { serverUrl: resource, scope: requestedScope, resourceMetadataUrl: new URL(metadataUrl!) }), 'REDIRECT');
    assert.ok(registered);
    assert.ok(authorizationUrl);
    assert.ok(verifier);
    assert.equal(registered.issuer, baseUrl);
    assert.equal(discoveryState?.resourceMetadata?.resource, resource.href);
    assert.equal(authorizationUrl.searchParams.get('resource'), resource.href);
    assert.equal(authorizationUrl.searchParams.get('scope'), requestedScope);
    assert.equal(authorizationUrl.searchParams.get('state'), state);
    assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorizationUrl.searchParams.get('code_challenge'), await sha256(verifier));
    assert.ok(wire.some(row => row.surface === '/oauth/register' && row.status === 201));
    oauthChecks.push('sdk-resource-and-issuer-discovery-dcr-state-and-s256-pkce');
    const consent = await fetch(authorizationUrl);
    assert.equal(consent.status, 200);
    const html = await consent.text();
    const requestId = html.match(/requestId:"([A-Za-z0-9._~-]+)"/)?.[1];
    assert.ok(requestId, 'Authorization page must provide the route-contract approval request ID');
    async function approve(jwt: string) {
      return fetch(`${baseUrl}/oauth/approve`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, jwt }) });
    }
    assert.equal((await approve('invalid-synthetic-identity')).status, 401);
    const approval = await approve(humanToken);
    assert.equal(approval.status, 200);
    const callback = new URL((await approval.json() as { redirect: string }).redirect);
    assert.equal(callback.origin, redirectUrl.origin);
    assert.equal(callback.pathname, redirectUrl.pathname);
    assert.deepEqual(callback.searchParams.getAll('state'), [state]);
    assert.equal(callback.searchParams.getAll('code').length, 1);
    assert.equal((await fetch(callback)).status, 204);
    assert.equal(receivedOAuthCallback?.href, callback.href);
    const code = callback.searchParams.get('code')!;
    const metadata = discoveryState!.authorizationServerMetadata;
    const exchangeOptions = { metadata, clientInformation: registered, authorizationCode: code, codeVerifier: verifier, redirectUri: redirectUrl, resource };
    let start = wire.length;
    await assert.rejects(() => exchangeAuthorization(baseUrl, { ...exchangeOptions, codeVerifier: 'x'.repeat(43) }));
    assert.ok(wire.slice(start).some(row => row.surface === '/oauth/token' && row.oauthErrorCode === 'invalid_grant'));
    start = wire.length;
    await assert.rejects(() => exchangeAuthorization(baseUrl, { ...exchangeOptions, resource: new URL(`${baseUrl}/v1/quests`) }));
    assert.ok(wire.slice(start).some(row => row.surface === '/oauth/token' && row.oauthErrorCode === 'invalid_target'));
    assert.equal(await auth(provider, { serverUrl: resource, authorizationCode: code, scope: requestedScope }), 'AUTHORIZED');
    assert.ok(oauthTokens);
    const initialTokens = structuredClone(oauthTokens);
    assert.equal(initialTokens.issuer, baseUrl);
    assert.deepEqual(initialTokens.scope?.split(' ').sort(), requestedScope.split(' ').sort());
    assert.ok(initialTokens.refresh_token);
    assert.equal((await approve(humanToken)).status, 400);
    await assert.rejects(() => exchangeAuthorization(baseUrl, exchangeOptions));
    oauthChecks.push('local-mock-human-approval-http-callback-sdk-code-exchange-pkce-resource-and-replay-guards');
    const oauthClient = new Client({ name: 'guilduo-candidate-oauth-verifier', version: '1.0.0' });
    oauthClients.push(oauthClient);
    oauthClient.onerror = (error: Error) => sdkErrors.push({ kind: error.name, expected: false });
    await oauthClient.connect(new StreamableHTTPClientTransport(resource, { authProvider: provider, onInsufficientScope: 'throw' }), { timeout: 15_000 });
    assert.equal((await oauthClient.listTools()).tools.length, MCP_TOOLS.length);
    async function oauthRead() {
      const read = await oauthClient.callTool({ name: 'get_quest', arguments: { questId: quest.id } }, { timeout: 15_000 });
      assert.equal(read.isError, false);
      assert.deepEqual(read.structuredContent.quest, readback);
    }
    await oauthRead();
    const denied = await oauthClient.callTool({ name: 'create_quest', arguments: { kind: 'todo', title: 'Must not persist' } }, { timeout: 15_000 });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error.code, 'insufficient_scope');
    const wrongSurface = await fetch(`${baseUrl}/v1/quests`, { headers: { authorization: `Bearer ${initialTokens.access_token}` } });
    assert.equal(wrongSurface.status, 401);
    assert.equal(await snapshot(), oauthSnapshot);
    oauthChecks.push('sdk-issued-scoped-resource-token-read-succeeds-write-and-rest-replay-denied');
    start = wire.length;
    assert.equal(await auth(provider, { serverUrl: resource, scope: requestedScope }), 'AUTHORIZED');
    const refreshedTokens = structuredClone(oauthTokens!);
    assert.notEqual(refreshedTokens.access_token, initialTokens.access_token);
    assert.equal(refreshedTokens.refresh_token, initialTokens.refresh_token);
    assert.equal(refreshedTokens.scope, initialTokens.scope);
    assert.ok(wire.slice(start).some(row => row.surface === '/oauth/token' && row.grantType === 'refresh_token'
      && row.status === 200 && row.resourceMatchesFixture === true));
    await oauthRead();
    start = wire.length;
    await assert.rejects(() => refreshAuthorization(baseUrl, { metadata, clientInformation: registered,
      refreshToken: initialTokens.refresh_token, resource: new URL(`${baseUrl}/v1/quests`) }));
    assert.ok(wire.slice(start).some(row => row.oauthErrorCode === 'invalid_target'));
    const widening = await fetch(`${baseUrl}/oauth/token`, { method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: initialTokens.refresh_token!, client_id: registered.client_id,
      resource: resource.href, scope: requestedScope + ' quests:write' }) });
    assert.equal(widening.status, 400);
    assert.equal((await widening.json() as { error: string }).error, 'invalid_scope');
    oauthChecks.push('sdk-resource-bound-refresh-works-retargeting-and-scope-widening-rejected');
    const revoke = await fetch(`${baseUrl}/oauth/revoke`, { method: 'POST', body: new URLSearchParams({
      token: refreshedTokens.access_token, client_id: registered.client_id, token_type_hint: 'access_token' }) });
    assert.equal(revoke.status, 200);
    for (const tokens of [initialTokens, refreshedTokens]) {
      const response = await fetch(resource, { method: 'POST', headers: { 'content-type': 'application/json',
        authorization: `Bearer ${tokens.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 'revoked', method: 'ping' }) });
      assert.equal(response.status, 401);
    }
    start = wire.length;
    await assert.rejects(() => refreshAuthorization(baseUrl, { metadata, clientInformation: registered,
      refreshToken: refreshedTokens.refresh_token, resource }));
    assert.ok(wire.slice(start).some(row => row.oauthErrorCode === 'invalid_grant'));
    assert.equal(await snapshot(), oauthSnapshot);
    oauthChecks.push('http-access-token-revocation-invalidates-family-and-sdk-refresh-without-quest-writes');
    oauthEvidence.status = 'passed';
    oauthEvidence.scope = requestedScope.split(' ');
    oauthEvidence.resource = 'loopback-A/mcp';
    checks.push('additional-sdk-oauth-mock-human-lane');
    assert.equal(adapterFailures, 0);
    assert.equal(blockedOutbound, 0);
    assert.deepEqual(sdkErrors.filter(error => !error.expected), []);
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed';
    const oauth = evidence.oauth as { status: string; checks: string[] } | undefined;
    if (oauth?.status === 'running') oauth.status = 'failed';
    // Fixed check labels and exception classes only: no Quest IDs, tokens, payloads or stack traces.
    evidence.failure = { afterCheck: checks.at(-1) ?? 'setup', lastOAuthCheck: oauth?.checks.at(-1),
      kind: error instanceof Error ? error.name : 'unknown' };
    throw error;
  } finally {
    let sdkClosed = false;
    try {
      await client?.close();
      await Promise.all(oauthClients.map(client => client.close()));
      sdkClosed = true;
      await Promise.allSettled([...pending]);
    } catch {
      evidence.status = 'failed';
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        if (!server.listening) { resolveClose(); return; }
        server.close(error => error ? reject(error) : resolveClose());
        server.closeAllConnections();
      });
      globalThis.fetch = originalFetch;
      console.log = originalLog;
      evidence.shutdown = { sdkClosed, listenerClosed: !server.listening, pendingBackgroundTasks: pending.size };
      evidence.finishedAt = new Date().toISOString();
      evidence.checks = checks;
      evidence.wire = wire;
      evidence.safety = { blockedOutbound, adapterFailures, adapterDiagnostics, backgroundFailures, sdkErrors };
      const finalHashes = await fingerprints();
      evidence.candidateChangedDuringRun = JSON.stringify(finalHashes) !== JSON.stringify(evidence.candidateHashes);
      if (evidence.candidateChangedDuringRun || backgroundFailures.length) evidence.status = 'failed';
      await mkdir(output, { recursive: true });
      await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    }
  }
  assert.equal(evidence.status, 'passed', 'Candidate changed during run or background task failed');
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await verifyCandidate();
    console.log(JSON.stringify({ status: evidence.status, acceptance: evidence.acceptance,
      sdk: evidence.sdk, schemaVersion: evidence.schemaVersion, toolCount: evidence.toolCount,
      oauth: evidence.oauth,
      checks: (evidence.checks as string[]).length, evidence: '.qa-artifacts/guilduo-worker-candidate/evidence.json' }));
  } catch {
    console.error('Local candidate SDK HTTP acceptance failed; inspect alias-only evidence.json.');
    process.exitCode = 1;
  }
}
