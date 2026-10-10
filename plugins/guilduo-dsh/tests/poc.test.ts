import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { OAuthClientProvider, Tool } from '@modelcontextprotocol/client';
import { auth, Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createSession, MCP_URL } from '../src/adapter.js';
import type { Dependencies } from '../src/adapter.js';
import { apply, createHostControl } from '../src/index.js';

function mock() {
  const providers: OAuthClientProvider[] = [];
  const requests: unknown[] = [];
  const calls: unknown[] = [];
  const transports: OAuthClientProvider[] = [];
  let closes = 0;
  const tool: Tool = { name: 'get_agent_context', description: 'Read context', inputSchema: { type: 'object' } };
  const deps: Dependencies = {
    async authorize(provider, options) {
      requests.push(options); providers.push(provider);
      assert.equal(options.serverUrl, MCP_URL);
      if (options.authorizationCode) {
        await provider.saveTokens({ access_token: 'MOCK_ONLY_ACCESS', token_type: 'Bearer', refresh_token: 'MOCK_ONLY_REFRESH' });
        return 'AUTHORIZED';
      }
      await provider.saveClientInformation?.({ client_id: 'mock-public-client' });
      await provider.saveCodeVerifier('MOCK_ONLY_PKCE');
      const url = new URL('https://mcp.guilduo.com/oauth/authorize');
      url.searchParams.set('state', await provider.state!());
      await provider.redirectToAuthorization(url);
      return 'REDIRECT';
    },
    transport(provider) {
      transports.push(provider);
      return { async start() {}, async send() {}, async close() {} };
    },
    client: () => ({
      async connect() {}, async close() { closes++; },
      async listTools() { return { tools: [tool] }; },
      async callTool(params, options) { calls.push({ params, options }); return { content: [{ type: 'text', text: 'mock context' }] }; },
    }),
  };
  return { deps, providers, requests, transports, calls, tool, closes: () => closes };
}
async function login(session: ReturnType<typeof createSession>) {
  let authorization: URL | undefined;
  assert.equal(await session.begin((url) => { authorization = url; }), 'REDIRECT');
  assert.ok(authorization);
  const callback = new URL('http://127.0.0.1:43123/callback');
  callback.searchParams.set('state', authorization.searchParams.get('state')!);
  callback.searchParams.set('code', 'MOCK_ONLY_CODE');
  return callback.href;
}

test('DSH adapter discovers through SDK transport with session-memory authProvider; request bound to exact session', async () => {
  const m = mock();
  const first = createSession('host-A', 'http://127.0.0.1:43123/callback', m.deps);
  const other = createSession('host-B', 'http://127.0.0.1:43123/callback', m.deps);
  await other.begin(() => {});
  const callback = await login(first);
  assert.deepEqual(await first.finish(callback), [m.tool]);
  assert.equal(m.transports[0], m.providers[1]);
  assert.equal(await m.providers[0].tokens(), undefined);
  assert.equal((await m.providers[1].tokens())?.access_token, 'MOCK_ONLY_ACCESS');
  const signal = new AbortController().signal;
  await assert.rejects(first.call('host-B', m.tool.name, {}, signal));
  await assert.rejects(other.call('host-B', m.tool.name, {}, signal));
  await assert.rejects(first.call('host-A', 'undiscovered', {}, signal));
  assert.equal(m.calls.length, 0);
  await first.call('host-A', m.tool.name, { actingAgentId: 'authorized-agent' }, signal);
  const call = m.calls[0] as { params: unknown; options: { signal: AbortSignal; timeout: number } };
  assert.deepEqual(call.params, { name: m.tool.name, arguments: { actingAgentId: 'authorized-agent' } });
  assert.equal(call.options.timeout, 60_000);
  assert.equal(call.options.signal.aborted, false);
  await assert.rejects(first.finish(callback));
  await first.close(); await other.close();
  assert.throws(() => m.providers[1].tokens(), /closed/);
  await assert.rejects(first.call('host-A', m.tool.name, {}, signal));
  assert.equal(m.closes(), 1);
});

test('logout during browser opening cannot delete a replacement login with the same host ID', { timeout: 2000 }, async () => {
  const m = mock(); const ctx = new Context();
  ctx.provide('tools', { register() { return () => {}; } });
  const host = createHostControl(ctx, m.deps);
  const opened = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const old = host.begin('A', 'http://127.0.0.1:43123/callback', async () => {
    opened.resolve(); await release.promise; throw new Error('mock opener failed after logout');
  });
  const rejected = assert.rejects(old, /mock opener failed/);
  await opened.promise;
  await host.logout('A');
  let url: URL | undefined;
  await host.begin('A', 'http://127.0.0.1:43123/callback', (value) => { url = value; });
  release.resolve(); await rejected;
  assert.ok(await m.providers[1].clientInformation());
  assert.equal(await host.finish('A', `http://127.0.0.1:43123/callback?code=MOCK_ONLY_CODE&state=${url!.searchParams.get('state')}`), 1);
  await host.logout('A');
  assert.throws(() => m.providers[1].clientInformation(), /closed/);
  await host.dispose();
});

test('partial paginated discovery never admits tools before the full catalog succeeds', { timeout: 2000 }, async () => {
  const m = mock(); const nextPage = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const factory = m.deps.client;
  m.deps.client = () => ({ ...factory(), async listTools(params) {
    if (!params?.cursor) return { tools: [m.tool], nextCursor: 'page-2' };
    nextPage.resolve(); await release.promise;
    return { tools: [] };
  } });
  const session = createSession('A', 'http://127.0.0.1:43123/callback', m.deps);
  const finishing = session.finish(await login(session));
  await nextPage.promise;
  await assert.rejects(session.call('A', m.tool.name, {}, new AbortController().signal), /exact authenticated/);
  assert.equal(m.calls.length, 0);
  release.resolve(); await finishing;
  await session.call('A', m.tool.name, {}, new AbortController().signal);
  assert.equal(m.calls.length, 1);
  await session.close();
});

test('registration failure cannot delete a replacement login or skip cleanup when a disposer throws', { timeout: 2000 }, async () => {
  for (const replace of [true, false]) {
    const m = mock(); const ctx = new Context(); let host: ReturnType<typeof createHostControl>;
    let registered = 0; let replacement: Promise<unknown> | undefined; let url: URL | undefined;
    const factory = m.deps.client;
    m.deps.client = () => ({ ...factory(), async listTools() { return { tools: [m.tool, { ...m.tool, name: 'second_tool' }] }; } });
    ctx.provide('tools', { register() {
      registered++;
      if (registered === 2) {
        if (replace) {
          void host.logout('A');
          replacement = host.begin('A', 'http://127.0.0.1:43123/callback', (value) => { url = value; });
        }
        throw new Error('mock registration failure');
      }
      return () => { if (!replace) throw new Error('mock disposer failure'); };
    } });
    host = createHostControl(ctx, m.deps);
    await host.begin('A', 'http://127.0.0.1:43123/callback', (value) => { url = value; });
    const callback = () => `http://127.0.0.1:43123/callback?code=MOCK_ONLY_CODE&state=${url!.searchParams.get('state')}`;
    await assert.rejects(host.finish('A', callback()), /mock registration failure/);
    assert.equal(m.closes(), 1);
    assert.throws(() => m.transports[0].tokens(), /closed/);
    if (replace) {
      await replacement;
      assert.equal(await host.finish('A', callback()), 2);
    } else {
      await host.begin('A', 'http://127.0.0.1:43123/callback', () => {});
    }
    await host.dispose();
  }
});

test('logout cancels in-flight calls and rejects late results even if a transport ignores cancellation', { timeout: 2000 }, async () => {
  const m = mock(); const entered = Promise.withResolvers<AbortSignal>(); const release = Promise.withResolvers<void>();
  let attemptedCalls = 0;
  const factory = m.deps.client;
  m.deps.client = () => ({ ...factory(), async callTool(_params, options) {
    if (++attemptedCalls > 1) return { content: [] };
    entered.resolve(options!.signal!); await release.promise;
    return { content: [{ type: 'text', text: 'late private result' }] };
  } });
  const session = createSession('A', 'http://127.0.0.1:43123/callback', m.deps);
  await session.finish(await login(session));
  const caller = new AbortController();
  const calling = session.call('A', m.tool.name, {}, caller.signal);
  const rejected = assert.rejects(calling, /closed/);
  const signal = await entered.promise;
  await assert.rejects(session.call('A', m.tool.name, {}, caller.signal), /in flight/);
  await Promise.all([session.close(), session.close()]);
  assert.equal(signal.aborted, true);
  assert.equal(caller.signal.aborted, false);
  assert.equal(m.closes(), 1);
  release.resolve(); await rejected;
});

test('real SDK auth retains redirect-time issuer discovery and rejects mismatched callback before exchange (mock HTTP)', { timeout: 2000 }, async () => {
  const m = mock(); let provider: OAuthClientProvider | undefined; let exchanges = 0; let refreshes = 0;
  const refreshing = Promise.withResolvers<void>(); const releaseRefresh = Promise.withResolvers<void>();
  const issuer = 'https://isolated-auth.example';
  const requests: string[] = [];
  const fixture: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url.pathname);
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (url.pathname.includes('oauth-protected-resource')) return json({ resource: MCP_URL, authorization_servers: [issuer] });
    if (url.pathname.includes('oauth-authorization-server')) return json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`, response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true,
    });
    if (url.pathname === '/register') return json({ ...JSON.parse(String(init?.body)), client_id: 'MOCK_ONLY_CLIENT' });
    if (url.pathname === '/token') {
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get('resource'), MCP_URL);
      if (params.get('grant_type') === 'refresh_token') {
        assert.equal(params.get('refresh_token'), 'MOCK_ONLY_REFRESH');
        refreshes++; refreshing.resolve(); await releaseRefresh.promise;
        return json({ access_token: 'MOCK_ONLY_ROTATED_ACCESS', token_type: 'Bearer', refresh_token: 'MOCK_ONLY_ROTATED_REFRESH' });
      }
      assert.ok(params.get('code_verifier'));
      exchanges++;
      return json({ access_token: 'MOCK_ONLY_ACCESS', token_type: 'Bearer', refresh_token: 'MOCK_ONLY_REFRESH' });
    }
    throw new Error('Unexpected fixture request');
  };
  m.deps.authorize = (value, options) => { provider = value; return auth(value, { ...options, fetchFn: fixture }); };
  const factory = m.deps.client;
  m.deps.client = () => ({ ...factory(), async callTool() {
    assert.equal(await auth(provider!, { serverUrl: MCP_URL, fetchFn: fixture }), 'AUTHORIZED');
    return { content: [{ type: 'text', text: 'mock refreshed context' }] };
  } });
  const session = createSession('A', 'http://127.0.0.1:43123/callback', m.deps);
  const callback = new URL(await login(session));
  const discovery = await provider!.discoveryState!();
  assert.equal(discovery?.authorizationServerMetadata?.issuer, issuer);
  discovery!.authorizationServerMetadata!.issuer = 'https://altered-copy.example';
  assert.equal((await provider!.discoveryState!())?.authorizationServerMetadata?.issuer, issuer);
  callback.searchParams.set('iss', 'https://wrong-issuer.example');
  await assert.rejects(session.finish(callback.href), /issuer/i);
  assert.equal(exchanges, 0);
  assert.equal(await provider!.discoveryState!(), undefined);
  const valid = new URL(await login(session)); valid.searchParams.set('iss', issuer);
  const discoveries = requests.filter((path) => path.includes('.well-known/')).length;
  await session.finish(valid.href);
  assert.equal(requests.filter((path) => path.includes('.well-known/')).length, discoveries);
  assert.equal(exchanges, 1);
  assert.equal((await provider!.tokens())?.issuer, issuer);
  const signal = new AbortController().signal;
  const calling = session.call('A', m.tool.name, {}, signal);
  await refreshing.promise;
  await assert.rejects(session.call('A', m.tool.name, {}, signal), /in flight/);
  releaseRefresh.resolve(); await calling;
  assert.equal(refreshes, 1);
  assert.equal((await provider!.tokens())?.refresh_token, 'MOCK_ONLY_ROTATED_REFRESH');
  await assert.rejects(Promise.resolve().then(() => provider!.state!()), /explicit host login/);
  await session.close();
  assert.throws(() => provider!.discoveryState!(), /closed/);
});

test('registry teardown failures cannot prevent every session from clearing credentials', { timeout: 2000 }, async () => {
  const m = mock(); const ctx = new Context();
  ctx.provide('tools', { register() { return () => { throw new Error('mock registry teardown failure'); }; } });
  const host = createHostControl(ctx, m.deps);
  for (const id of ['A', 'B']) {
    let url: URL | undefined;
    await host.begin(id, 'http://127.0.0.1:43123/callback', (value) => { url = value; });
    await host.finish(id, `http://127.0.0.1:43123/callback?code=MOCK_ONLY_CODE&state=${url!.searchParams.get('state')}`);
  }
  const failure = await host.dispose().then(() => undefined, (error: unknown) => error);
  assert.equal(m.closes(), 2);
  for (const provider of m.transports) assert.throws(() => provider.tokens(), /closed/);
  assert.ok(failure instanceof AggregateError);
  assert.match(failure.message, /Plugin cleanup failed/);
  await assert.rejects(host.begin('C', 'http://127.0.0.1:43123/callback', () => {}), /disposed/);
});

test('OAuth callback/resource trust boundaries reject before token exchange; implicit login is disabled', async () => {
  const m = mock();
  assert.throws(() => createSession('', 'http://127.0.0.1:43123/callback', m.deps));
  assert.throws(() => createSession('A', 'http://remote.example/callback', m.deps));
  const session = createSession('A', 'http://127.0.0.1:43123/callback', m.deps);
  const callback = await login(session);
  const altered = new URL(callback); altered.searchParams.set('state', 'other-session');
  await assert.rejects(session.finish(altered.href));
  altered.href = callback; altered.hostname = 'localhost';
  await assert.rejects(session.finish(altered.href));
  altered.href = callback; altered.searchParams.append('code', 'duplicate');
  await assert.rejects(session.finish(altered.href));
  assert.equal(m.requests.length, 1);
  const provider = m.providers[0];
  await assert.rejects(Promise.resolve().then(() => provider.redirectToAuthorization(new URL('https://mcp.guilduo.com/oauth/authorize'))));
  await assert.rejects(provider.validateResourceURL!(MCP_URL, 'https://other.example/mcp'));
  assert.equal((await provider.validateResourceURL!(MCP_URL, MCP_URL))?.href, MCP_URL);
  await session.finish(callback);
  await session.close();
});

test('Cordis native helper registers callable tools, denies unauthed/fork sessions and unregisters on disposal', async () => {
  const m = mock(); const ctx = new Context();
  const definitions = new Map<string, ToolDefinition>();
  ctx.provide('tools', { register(definition: ToolDefinition) {
    assert.ok(!definitions.has(definition.name)); definitions.set(definition.name, definition);
    return () => { definitions.delete(definition.name); };
  } });
  const host = createHostControl(ctx, m.deps);
  let url: URL | undefined;
  await host.begin('A', 'http://127.0.0.1:43123/callback', (value) => { url = value; });
  const callback = `http://127.0.0.1:43123/callback?code=MOCK_ONLY_CODE&state=${url!.searchParams.get('state')}`;
  assert.equal(await host.finish('A', callback), 1);
  const definition = definitions.get('mcp__guilduo__get_agent_context')!;
  const execution = (id: string) => ({ agent: { id }, signal: new AbortController().signal }) as unknown as ToolRunContext;
  await assert.rejects(Promise.resolve().then(() => definition.execute({}, execution('fork-A'))));
  const result = await definition.execute({}, execution('A'));
  assert.deepEqual(result, { content: [{ type: 'text', text: 'mock context' }] });
  await host.begin('B', 'http://127.0.0.1:43123/callback', (value) => { url = value; });
  assert.equal(await host.finish('B', `http://127.0.0.1:43123/callback?code=MOCK_ONLY_CODE&state=${url!.searchParams.get('state')}`), 1);
  assert.equal(definitions.size, 1);
  assert.notEqual(m.transports[0], m.transports[1]);
  await host.logout('A');
  await assert.rejects(Promise.resolve().then(() => definition.execute({}, execution('A'))));
  assert.deepEqual(await definition.execute({}, execution('B')), result);
  await host.dispose(); assert.equal(definitions.size, 0);
  await assert.rejects(host.begin('A', 'http://127.0.0.1:43123/callback', () => {}));
});

test('failed discovery clears session credentials and releases the failed client before explicit re-login', async () => {
  const m = mock();
  const factory = m.deps.client;
  m.deps.client = () => ({ ...factory(), async listTools() { throw new Error('mock discovery failure'); } });
  const session = createSession('A', 'http://127.0.0.1:43123/callback', m.deps);
  await assert.rejects(session.finish(await login(session)), /mock discovery failure/);
  assert.equal(await m.providers[0].tokens(), undefined);
  assert.equal(await m.providers[0].clientInformation(), undefined);
  assert.equal(m.closes(), 1);
  await assert.rejects(session.call('A', m.tool.name, {}, new AbortController().signal));
  m.deps.client = factory;
  assert.equal((await session.finish(await login(session))).length, 1);
  await session.close();
});

test('plugin loads canonical Skill via native register without network and ships exact reference copies', async () => {
  const ctx = new Context(); const skills: unknown[] = [];
  ctx.provide('skills', { register(value: unknown) { skills.push(value); return () => {}; } });
  ctx.provide('tools', { register() { throw new Error('No tool registration before authentication'); } });
  await apply(ctx);
  assert.equal(skills.length, 1);
  const source = await readFile(new URL('../../../skills/guilduo-workflows/SKILL.md', import.meta.url), 'utf8');
  const registered = skills[0] as { name: string; content: string; resourceBase: { path: string } };
  assert.equal(registered.name, 'guilduo-workflows');
  assert.equal(registered.content, source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  const referenceNames = await readdir(new URL('../../../skills/guilduo-workflows/references/', import.meta.url));
  assert.ok(referenceNames.includes('local-hooks.md'));
  assert.deepEqual((await readdir(new URL('../skills/guilduo-workflows/references/', import.meta.url))).sort(), referenceNames.sort());
  for (const name of ['SKILL.md', 'agents/openai.yaml', ...referenceNames.map((name) => `references/${name}`)]) {
    const canonical = await readFile(new URL(`../../../skills/guilduo-workflows/${name}`, import.meta.url));
    const staged = await readFile(new URL(`../skills/guilduo-workflows/${name}`, import.meta.url));
    assert.deepEqual(staged, canonical);
  }
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.private, undefined); assert.equal(manifest.version, '0.6.0-beta.17');
  assert.equal(manifest.dependencies['@modelcontextprotocol/client'], '2.0.0');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  for (const filename of await readdir(new URL('../src/', import.meta.url))) {
    let body = await readFile(new URL(`../src/${filename}`, import.meta.url), 'utf8');
    if (filename === 'adapter.ts') {
      const authFetch = /const authFetch: typeof fetch = \(input, init\) => fetch\(input, \{ \.\.\.init,\s*signal: AbortSignal\.any\(\[lifecycle\.signal, \.\.\.\(init\?\.signal \? \[init\.signal\] : \[\]\)\]\) \}\);/.exec(body);
      assert.ok(authFetch, 'Only lifecycle-bound SDK OAuth plumbing may use fetch');
      body = body.replace(authFetch[0], '');
      assert.equal([...body.matchAll(/deps\.authorize\(provider,\s*\{\s*serverUrl: MCP_URL,\s*fetchFn: authFetch/g)].length, 2);
    }
    assert.doesNotMatch(body, /writeFile|readFile.*auth|fetch\(|authFetch\(|stop_hook_active|agent\/run/);
  }
  await ctx.guilduoDshOAuth.dispose();
});

test('actual SDK 2.0 StreamableHTTP negotiates stable 2025-06-18 and sends it on later requests (loopback, mock auth only)', async () => {
  const seen: { method: string; version?: string }[] = [];
  const failures: string[] = [];
  const m = mock();
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number | string; method: string };
      seen.push({ method: message.method, version: request.headers['mcp-protocol-version'] as string | undefined });
      assert.equal(request.headers.authorization, 'Bearer MOCK_ONLY_ACCESS');
      if (message.method === 'notifications/initialized') { response.writeHead(202); response.end(); return; }
      const result = message.method === 'initialize'
        ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'isolated-fixture', version: '0' } }
        : message.method === 'tools/list' ? { tools: [m.tool] }
        : { content: [{ type: 'text', text: 'mock context' }] };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    } catch {
      failures.push('Isolated HTTP fixture rejected SDK request');
      response.writeHead(500); response.end();
    }
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const session = createSession('native-sdk-session', 'http://127.0.0.1:43123/callback', {
    authorize: m.deps.authorize,
    client: () => new Client({ name: 'isolated-sdk-fixture', version: '0' }),
    transport: (authProvider) => new StreamableHTTPClientTransport(endpoint, { authProvider }),
  });
  try {
    await session.finish(await login(session));
    await session.call('native-sdk-session', m.tool.name, {}, new AbortController().signal);
    assert.deepEqual(failures, []);
    assert.ok(seen.some((entry) => entry.method === 'initialize'));
    for (const method of ['notifications/initialized', 'tools/list', 'tools/call']) {
      assert.equal(seen.find((entry) => entry.method === method)?.version, '2025-06-18');
    }
  } finally {
    await session.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
