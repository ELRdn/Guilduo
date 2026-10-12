// SPDX-License-Identifier: AGPL-3.0-only
// Installed public runtime only; synthetic credentials stay in memory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

assert.ok(process.argv[2], 'Supply installed DSH lib/bin.js; no profile is booted');
const entry = resolve(process.argv[2]);
const require = createRequire(entry);
const hostRoot = resolve(dirname(entry), '..');
const host = JSON.parse(await readFile(resolve(hostRoot, 'package.json'), 'utf8'));
assert.equal(host.name, '@deepseek-ai/dsh');
assert.equal(host.version, '0.2.0-rc.2');
const candidate = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(candidate.version, '0.6.0-beta.16');
const physicalCarrierPackages = (await readdir(resolve(hostRoot, 'node_modules/@deepseek-ai'))).filter(name => /^dsh-.*(?:electron|worker|desktop)/.test(name));
assert.deepEqual(physicalCarrierPackages, [], 'Reinspect physical carriers if installed host contents change');
const hashes = {};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
hashes['dsh/package.json'] = digest(await readFile(resolve(hostRoot, 'package.json')));
hashes['dsh/lib/bin.js'] = digest(await readFile(entry));
async function load(name) {
  const manifestPath = require.resolve(`@deepseek-ai/${name}/package.json`);
  const withinHost = relative(hostRoot, manifestPath);
  assert.ok(!withinHost.startsWith('..') && !isAbsolute(withinHost), 'Module must belong to installed host');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (name.startsWith('dsh-')) assert.equal(manifest.version, host.version);
  for (const file of ['package.json', manifest.main, manifest.types]) {
    hashes[`${name}/${file}`] = digest(await readFile(resolve(dirname(manifestPath), file)));
  }
  return import(pathToFileURL(require.resolve(`@deepseek-ai/${name}`)).href);
}

let port;
let networkRequests = 0;
let blockedNetwork = 0;
const connect = net.Socket.prototype.connect;
const listen = net.Server.prototype.listen;
const fetch = globalThis.fetch;
// Guard all TCP dialing, including host imports; only our OS-assigned listener is allowed.
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (!port || typeof options !== 'object' || options.host !== '127.0.0.1' || Number(options.port) !== port) {
    blockedNetwork++;
    throw new Error('Probe forbids non-owned TCP connections');
  }
  return connect.apply(this, args);
};
net.Server.prototype.listen = function (...args) {
  assert.equal(args[0], 0, 'Only ephemeral listeners allowed');
  assert.equal(args[1], '127.0.0.1', 'Only loopback listeners allowed');
  return listen.apply(this, args);
};
globalThis.fetch = async () => { blockedNetwork++; throw new Error('Use owned loopback HTTP fixture only'); };
syncBuiltinESMExports();

const mounted = [];
const checks = [];
const findings = [];
let result;
try {
  const { Context, Service } = await load('cordis');
  const { WebServer } = await load('dsh-host-webserver');
  const Connection = await load('dsh-client-connection');
  const { TypertRegistry } = await load('dsh-typert-registry');
  const { TypertGatewayService } = await load('dsh-api-gateway');
  const { TypertRemoteService, Remote } = await load('dsh-typert-protocol');
  const ctx = new Context();
  let record;
  let credentialModifications = 0;
  class SyntheticCredentials extends Service {
    constructor(ctx) { super(ctx, 'credentials'); }
    async modifyRecord(key, modify) {
      assert.equal(key, 'client-connection/browser-session');
      credentialModifications++;
      const replacement = await modify(record);
      if (replacement !== undefined) record = replacement;
      return record;
    }
  }
  mounted.push(await ctx.plugin(SyntheticCredentials));
  mounted.push(await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }));
  port = ctx.webServer.port;
  assert.ok(port > 0);
  mounted.push(await ctx.plugin(Connection));
  const connection = ctx.connection;
  const authority = `127.0.0.1:${port}`;
  const origin = `http://${authority}`;
  ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
    if (connection.authorizeIndex(req, res)) { res.writeHead(200); res.end('synthetic index'); }
  } });
  function http(path, { method = 'POST', headers = {}, body } = {}) {
    networkRequests++;
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, agent: false, headers }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      });
      req.setTimeout(5000, () => req.destroy(new Error('Loopback probe timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }
  const envelope = method => JSON.stringify({ type: 'client-request', rpcId: 'synthetic-rpc', method, payload: { synthetic: true } });
  let calls = 0;
  let matches = 0;
  const remove = connection.rpc.intercept('/api', endpoint => {
    matches++;
    return endpoint.startsWith('guilduo/');
  }, async (endpoint, payload, signal, peer) => {
    calls++;
    assert.equal(endpoint, 'guilduo/probe');
    assert.deepEqual(payload, { synthetic: true });
    assert.ok(signal instanceof AbortSignal);
    assert.equal(peer, connection.operator, 'Exact operator object is the fourth argument');
    assert.ok(peer.ctx instanceof Context);
    return { ok: true, value: 'synthetic-ok' };
  });
  assert.throws(() => connection.rpc.intercept('/api', () => false, async () => ({ ok: true })), /already has an interceptor/);
  findings.push('Only one /api interceptor exists; standard TypertGatewayService already claims it. A separate Guilduo interceptor cannot coexist.');
  async function denied(label, headers, status, path = '/api/guilduo/probe') {
    const before = [calls, matches];
    const response = await http(path, { headers: { 'content-type': 'application/json', ...headers }, body: envelope('guilduo/probe') });
    assert.equal(response.status, status, label);
    assert.deepEqual([calls, matches], before, `${label}: neither matcher nor handler runs`);
    checks.push({ label, status, handlerUncalled: true, matcherUncalled: true });
  }
  await denied('unauthenticated', {}, 401);
  const launch = new URL(connection.authenticatedUrl(`${origin}/`));
  await denied('launch token is not RPC authentication', {}, 401, `/api/guilduo/probe${launch.search}`);
  assert.equal((await http('/', { method: 'GET' })).status, 401);
  assert.equal((await http('/?token=synthetic-invalid', { method: 'GET' })).status, 401);
  const login = await http(`/${launch.search}`, { method: 'GET' });
  assert.equal(login.status, 303);
  assert.equal(login.headers.location, './');
  assert.equal(login.headers['cache-control'], 'no-store');
  assert.equal(login.headers['referrer-policy'], 'no-referrer');
  const setCookie = login.headers['set-cookie'][0];
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(';', 1)[0];
  assert.equal((await http('/', { method: 'GET', headers: { cookie } })).status, 200);
  checks.push({ label: 'synthetic launch-token exchange and authenticated index', status: 303 });
  await denied('tampered cookie', { cookie: `${cookie}x` }, 401);
  await denied('untrusted Host with valid cookie', { cookie, host: 'synthetic-attacker.invalid' }, 403);
  await denied('untrusted Host without cookie', { host: 'synthetic-attacker.invalid' }, 403);
  await denied('cross Origin with valid cookie', { cookie, origin: 'http://synthetic-attacker.invalid' }, 403);
  await denied('cross Origin without cookie', { origin: 'http://synthetic-attacker.invalid' }, 403);
  await denied('null Origin', { cookie, origin: 'null' }, 403);
  await denied('cookie bound to authority', { cookie, host: `localhost:${port}` }, 401);
  assert.equal(connection.admit({ headers: { host: authority, cookie, origin } }).peer, connection.operator);
  for (const headers of [{ cookie }, { cookie, origin }]) {
    const response = await http('/api/guilduo/probe', { headers: { 'content-type': 'application/json', ...headers }, body: envelope('guilduo/probe') });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { type: 'server-response', rpcId: 'synthetic-rpc', result: { ok: true, value: 'synthetic-ok' } });
  }
  assert.equal(calls, 2);
  checks.push({ label: 'authenticated HTTP with/without Origin', exactOperator: true, calls });
  const schemeOrigin = await http('/api/guilduo/probe', {
    headers: { cookie, origin: `https://${authority}`, 'content-type': 'application/json' }, body: envelope('guilduo/probe'),
  });
  assert.equal(schemeOrigin.status, 200, 'Installed fence compares authority, not full Origin');
  checks.push({ label: 'different Origin scheme with same authority is accepted', status: 200 });
  findings.push('Host/Origin fence compares URL.host only: https Origin is accepted on this http listener when host:port matches. It does not enforce full scheme/host/port same-origin.');
  const shared = connection.createSharedFetchHandler('/api');
  // ponytail: this is an already-trusted logical fixture, not an Electron/worker physical admission test.
  const response = await shared.fetch(new Request(`${origin}/api/guilduo/probe`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: envelope('guilduo/probe'),
  }));
  assert.equal(response.status, 200);
  assert.equal(calls, 4);
  checks.push({ label: 'shared logical Fetch dispatch', exactOperator: true, browserAuthApplied: false });
  findings.push('createSharedFetchHandler().fetch() performs no authentication: every physical HTTP/worker/IPC carrier must admit the request before dispatch.');
  const beforeInvalid = calls;
  assert.equal((await http('/api/guilduo/probe', { headers: { cookie, 'content-type': 'application/json' }, body: '{' })).status, 400);
  const mismatch = await http('/api/guilduo/probe', { headers: { cookie, 'content-type': 'application/json' }, body: envelope('guilduo/other') });
  assert.equal(JSON.parse(mismatch.body).result.error.code, 'gateway/bad-request');
  assert.equal((await http('/api/other/probe', { headers: { cookie, 'content-type': 'application/json' }, body: envelope('other/probe') })).status, 404);
  assert.equal(calls, beforeInvalid);
  await remove();
  assert.equal((await shared.fetch(new Request(`${origin}/api/guilduo/probe`, { method: 'POST' }))).status, 404);
  checks.push({ label: 'invalid JSON, mismatched method, foreign endpoint and disposer', handlerUncalled: true });

  const initializers = [];
  class SyntheticRemote extends TypertRemoteService {
    constructor(ctx) { super(ctx, 'syntheticCarrier'); initializers.forEach(init => init.call(this)); }
    probe() { return this.ctx.invocation.peer; }
    async *stream() { yield this.ctx.invocation.peer; }
  }
  Remote(SyntheticRemote.prototype.probe, { kind: 'method', name: 'probe', static: false, private: false, addInitializer(init) { initializers.push(init); } });
  Remote({ mode: 'stream' })(SyntheticRemote.prototype.stream, { kind: 'method', name: 'stream', static: false, private: false, addInitializer(init) { initializers.push(init); } });
  mounted.push(await ctx.plugin(TypertRegistry));
  mounted.push(await ctx.plugin(SyntheticRemote));
  mounted.push(await ctx.plugin(TypertGatewayService));
  const invocation = { namespace: 'syntheticCarrier', method: 'probe', args: {} };
  assert.equal(await ctx.typertGateway.invoke(invocation), connection.operator);
  const connectionStreamPeers = [];
  for await (const peer of await ctx.typertGateway.stream({ ...invocation, method: 'stream' })) connectionStreamPeers.push(peer);
  assert.equal(connectionStreamPeers.length, 1);
  assert.equal(connectionStreamPeers[0], connection.operator);
  await assert.rejects(ctx.typertGateway.invoke({ namespace: 'guilduo', method: 'probe', args: {} }), error => error.code === 'gateway/invocation-unavailable');
  findings.push('A Connection interceptor alone does not register a Gateway Remote endpoint. In-process carriers need a Typert Remote binding for Guilduo methods, through the existing Gateway.');
  assert.throws(() => connection.rpc.intercept('/api', endpoint => endpoint.startsWith('guilduo/'), async () => ({ ok: true })), /already has an interceptor/);
  const helperUrl = new URL('../lib/settings-gateway.js', import.meta.url).href;
  const pluginLib = new URL('../lib/', import.meta.url).href;
  for (const file of ['settings-gateway.js', 'settings.js']) {
    hashes[`guilduo-dsh/lib/${file}`] = digest(await readFile(new URL(file, pluginLib)));
  }
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(pluginLib)) {
        if (specifier.startsWith('@deepseek-ai/')) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
  let installSettingsGateway;
  try { ({ installSettingsGateway } = await import(helperUrl)); }
  finally { hooks.deregister(); }
  // The real bridge is used with a synthetic unavailable session: connect cannot start OAuth.
  const controlCalls = [];
  ctx.provide('agents', { get() { return undefined; }, roots() { return []; } });
  ctx.provide('sessionController', { async resolveAgent(id) {
    assert.equal(id, 'synthetic-session');
    controlCalls.push('resolve');
    return { error: 'synthetic unavailable session' };
  } });
  const control = {
    status(id) { assert.equal(id, 'synthetic-session'); controlCalls.push('status'); return { connected: false, tools: 0, scope: 'none', canShare: false }; },
    async restore(id) { assert.equal(id, 'synthetic-session'); controlCalls.push('restore'); return false; },
    begin() { throw new Error('Probe forbids OAuth'); }, finish() { throw new Error('Probe forbids OAuth'); },
    async logout(id) { assert.equal(id, 'synthetic-session'); controlCalls.push('logout'); },
    async cancelLogin(id) { assert.equal(id, 'synthetic-session'); controlCalls.push('cancelLogin'); },
    async share(id) { assert.equal(id, 'synthetic-session'); controlCalls.push('share'); },
  };
  const settings = await installSettingsGateway(ctx, control);
  mounted.push(settings);
  const settingsRequest = method => ({ namespace: 'guilduo', method, args: { sessionId: 'synthetic-session' } });
  for (const action of ['status', 'connect', 'disconnect', 'cancel', 'share']) {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'synthetic-settings', method: `guilduo/${action}`, payload: { args: { sessionId: 'synthetic-session' } } });
    const before = controlCalls.length;
    assert.equal((await http(`/api/guilduo/${action}`, { headers: { 'content-type': 'application/json' }, body })).status, 401);
    assert.equal((await http(`/api/guilduo/${action}`, { headers: { cookie, origin: 'http://synthetic-attacker.invalid', 'content-type': 'application/json' }, body })).status, 403);
    assert.equal(controlCalls.length, before);
    const accepted = await http(`/api/guilduo/${action}`, { headers: { cookie, origin, 'content-type': 'application/json' }, body });
    assert.equal(accepted.status, 200);
    const wire = JSON.parse(accepted.body);
    assert.equal(wire.result.ok, true);
    const business = wire.result.value;
    if (action === 'connect') assert.equal(business.error.code, 'guilduo/session-unavailable');
    else assert.deepEqual(business, { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
    if (action === 'cancel') assert.ok(controlCalls.slice(before).includes('cancelLogin'));
    if (action === 'share') assert.ok(controlCalls.slice(before).includes('share'));
    const forged = await ctx.typertGateway.invoke({ ...settingsRequest(action), peer: { id: connection.operator.id, ctx: connection.operator.ctx } });
    assert.equal(forged.error.code, 'guilduo/unauthorized', 'Same identity fields cannot substitute for the operator object');
  }
  assert.equal((await ctx.typertGateway.invoke(settingsRequest('status'))).ok, true);
  const beforeDirect = controlCalls.length;
  assert.equal((await ctx.get('guilduoSettings').status('synthetic-session')).error.code, 'guilduo/unauthorized');
  assert.equal(controlCalls.length, beforeDirect);
  await assert.rejects(ctx.typertGateway.invoke({ ...settingsRequest('status'), args: { sessionId: 'synthetic-session', peer: 'synthetic' } }), error => error.code === 'gateway/arguments-invalid');
  await settings.dispose();
  await assert.rejects(ctx.typertGateway.invoke(settingsRequest('status')), error => error.code === 'gateway/invocation-unavailable');
  checks.push({ label: 'settings-gateway helper with real settings bridge', methods: ['status', 'connect', 'disconnect', 'cancel', 'share'], authenticatedHttp: true,
    unauthorizedHttpAndCrossOriginBlocked: true, forgedPeerRejected: true, directUnscopedCallRejected: true, disposer: true });
  findings.push('UI call: connection.rpc.call("/api", "guilduo/<status|connect|disconnect|cancel|share>", { args: { sessionId } }, signal). Gateway result.value contains the bridge {ok,value/error} result.');
  const local = new Context();
  mounted.push(await local.plugin(TypertRegistry));
  mounted.push(await local.plugin(SyntheticRemote));
  mounted.push(await local.plugin(TypertGatewayService));
  const fallback = await local.typertGateway.invoke(invocation);
  assert.ok(fallback.ctx instanceof Context);
  assert.equal(await local.typertGateway.invoke(invocation), fallback, 'Gateway owns a stable fallback operator without Connection');
  const fallbackStreamPeers = [];
  for await (const peer of await local.typertGateway.stream({ ...invocation, method: 'stream' })) fallbackStreamPeers.push(peer);
  assert.equal(fallbackStreamPeers.length, 1);
  assert.equal(fallbackStreamPeers[0], fallback);
  local.provide('agents', { get() { return undefined; }, roots() { return []; } });
  local.provide('sessionController', { resolveAgent() { throw new Error('Unadmitted settings must not resolve a session'); } });
  const waitingSettings = installSettingsGateway(local, control);
  assert.equal(local.get('guilduoSettings'), undefined, 'No Connection: settings stay unregistered instead of trusting a Gateway fallback');
  await waitingSettings.dispose();
  findings.push('Settings helper requires real connection, typertGateway, agents, sessionController. Gateway exposes no public operator accessor; a Connection-absent Desktop cannot use the current bridge and settings registration remains inactive.');
  checks.push({ label: 'in-process Gateway invoke/stream without explicit Peer', connectionOperator: true, stableFallbackOperatorWithoutConnection: true, interceptorAloneIsNotGatewayRemote: true });
  findings.push('Electron/worker logical Gateway invoke/stream requests without peer receive Connection.operator, or a Gateway-owned operator when Connection is absent; this is trusted in-process authority, not browser authentication. Physical Electron/worker carrier packages are absent from this npm host; their admission was not executed.');
  assert.equal(credentialModifications, 1);
  assert.equal(blockedNetwork, 0);
  for (const file of ['settings-gateway.js', 'settings.js']) {
    assert.equal(digest(await readFile(new URL(file, pluginLib))), hashes[`guilduo-dsh/lib/${file}`],
      'Parent changed built lib during this run; rerun against the completed build');
  }
  result = { result: 'PASS_NATIVE_UI_CARRIER_WITH_COMPOSITION_FINDINGS', checkedAt: new Date().toISOString(), hostVersion: host.version, candidate: candidate.version, nodeVersion: process.version,
    checks, findings, networkRequests, blockedNetwork, credentialProvider: 'synthetic in-memory only', credentialModifications,
    profileBoot: false, realCredentialProfileSessionAccess: false, publicOAuth: false, modelCalls: 0,
    electronWorkerPhysicalAdmission: 'not executed; packages absent from specified npm host', physicalCarrierPackages, hashes };
} finally {
  try { for (const fiber of mounted.reverse()) await fiber.dispose(); }
  finally {
    net.Socket.prototype.connect = connect;
    net.Server.prototype.listen = listen;
    globalThis.fetch = fetch;
    syncBuiltinESMExports();
  }
}
const probe = fileURLToPath(import.meta.url);
result.hashes['guilduo-dsh/tests/native-ui-carrier.mjs'] = digest(await readFile(probe));
const artifacts = resolve(dirname(probe), '../../../.qa-artifacts/guilduo-dsh-shared-beta14');
await mkdir(artifacts, { recursive: true });
const report = resolve(artifacts, `native-ui-carrier-${new Date().toISOString().replaceAll(':', '-')}.json`);
await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...result, report }, null, 2));
