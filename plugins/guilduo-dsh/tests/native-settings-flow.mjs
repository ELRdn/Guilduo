// SPDX-License-Identifier: AGPL-3.0-only
// Actual host carrier + synthetic OAuth; never boot a profile or invoke a model.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { request } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

assert.ok(process.argv[2], 'Supply installed DSH lib/bin.js');
const hostRequire = createRequire(resolve(process.argv[2]));
assert.equal(hostRequire('@deepseek-ai/dsh/package.json').version, '0.2.0-rc.2');
const candidate = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(candidate.version, '0.6.0-beta.17');
const hashes = {};
for (const file of ['index.js', 'settings.js', 'settings-gateway.js', 'persistence.js']) {
  hashes[`lib/${file}`] = createHash('sha256').update(await readFile(new URL(`../lib/${file}`, import.meta.url))).digest('hex');
}
globalThis.fetch = () => { throw new Error('Public fetch forbidden; OAuth/MCP are synthetic'); };
const load = name => import(pathToFileURL(hostRequire.resolve(`@deepseek-ai/${name}`)).href);
const pluginLib = new URL('../lib/', import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(pluginLib) && specifier.startsWith('@deepseek-ai/')) {
    return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
let createHostControl, installAutoRestore, inject, installSettingsGateway;
try {
  ({ createHostControl, installAutoRestore, inject } = await import('../lib/index.js'));
  ({ installSettingsGateway } = await import('../lib/settings-gateway.js'));
} finally { hooks.deregister(); }
const { Context, Service } = await load('cordis');
const { WebServer } = await load('dsh-host-webserver');
const Connection = await load('dsh-client-connection');
const { TypertRegistry } = await load('dsh-typert-registry');
const { TypertGatewayService } = await load('dsh-api-gateway');
const ctx = new Context(); const mounted = []; const handles = [];
let agent, fork, other;
let cookie = ''; let redirect; let toolCalls = 0; let modelCalls = 0; let authorizations = 0;
let control;
const failures = [];
const httpRequests = [];
// Native callback commits and restores a grant; each DPAPI subprocess alone allows 10 seconds.
const HTTP_DEADLINE_MS = 30_000;
const artifacts = new URL('../../../.qa-artifacts/guilduo-dsh-shared-beta14/', import.meta.url);
const report = new URL(`native-settings-flow-${new Date().toISOString().replaceAll(':', '-')}.json`, artifacts);
let reported = false;
const check = (label, operation) => {
  try { operation(); } catch (error) { failures.push({ label, error: error.stack }); }
};
class MemoryCredentials extends Service {
  records = new Map();
  constructor(ctx) { super(ctx, 'credentials'); }
  async readRecord(key) { return this.records.get(key); }
  async modifyRecord(key, modify) { const next = await modify(this.records.get(key)); if (next) this.records.set(key, next); return this.records.get(key); }
  async deleteRecord(key) { this.records.delete(key); }
}
const dependencies = {
  async authorize(provider, options) {
    authorizations++;
    if (options.authorizationCode) {
      await provider.saveTokens({ access_token: 'SYNTHETIC_ONLY', token_type: 'Bearer' }); return 'AUTHORIZED';
    }
    redirect = String(provider.redirectUrl); await provider.saveCodeVerifier('SYNTHETIC_PKCE');
    const url = new URL('https://mcp.guilduo.com/oauth/authorize');
    url.searchParams.set('state', await provider.state());
    await provider.redirectToAuthorization(url); return 'REDIRECT';
  },
  client: () => ({ async connect() {}, async close() {}, async listTools() {
    return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] };
  }, async callTool() { toolCalls++; return { content: [] }; } }),
  transport: () => ({ async start() {}, async send() {}, async close() {} }),
};
function http(url, method = 'GET', body) {
  const endpoint = new URL(url);
  assert.equal(endpoint.hostname, '127.0.0.1', 'Owned loopback only');
  const started = performance.now();
  const record = result => httpRequests.push({ method, path: endpoint.pathname,
    durationMs: Math.round(performance.now() - started), ...result });
  return new Promise((resolve, reject) => {
    const req = request(url, { method, agent: false, signal: AbortSignal.timeout(HTTP_DEADLINE_MS),
      headers: { cookie, 'content-type': 'application/json' } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', value => { text += value; });
      res.on('error', error => { record({ error: error.code ?? error.name }); reject(error); });
      res.on('end', () => { record({ status: res.statusCode }); resolve({ status: res.statusCode, headers: res.headers, text }); });
    });
    req.on('error', error => { record({ error: error.code ?? error.name }); reject(error); });
    req.end(body);
  });
}
try {
  mounted.push(await ctx.plugin(MemoryCredentials));
  mounted.push(await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }));
  mounted.push(await ctx.plugin(Connection));
  for (const name of ['dsh-agent', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm']) {
    mounted.push(await ctx.plugin((await load(name)).default));
  }
  for (const method of ['stream', 'prepareCall']) ctx.llm[method] = () => {
    modelCalls++; throw new Error('Inference forbidden in native settings fixture');
  };
  mounted.push(await ctx.plugin((await load('dsh-agent-loop')).default, { agents: [] }));
  const create = async (id, options = {}) => {
    const handle = await ctx.agents.create({ sessionId: id, ...options }); handles.push(handle); return handle.agent;
  };
  agent = await create('synthetic-main');
  other = await create('synthetic-other');
  fork = await create('synthetic-root-fork', { seed: [], inheritedEventCount: 0,
    meta: { parentSession: agent.id, isSeeded: true } });
  assert.ok(ctx.agents.roots().includes(fork));
  assert.equal(ctx.sessions.get(fork.id), fork.session);
  ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
    if (ctx.connection.authorizeIndex(req, res)) res.writeHead(200).end('Fixture');
  } });
  mounted.push(await ctx.plugin({ inject: ['agents'], apply(host) {
    host.provide('sessionController', { async resolveAgent(id) {
      const owner = host.agents.get(id); return owner ? { agent: owner } : { error: 'unavailable' };
    } });
    host.provide('skills', {});
  } }));
  mounted.push(await ctx.plugin({ inject, apply(host) {
    control = createHostControl(host, dependencies);
  } }));
  assert.ok(control, 'Native Host control injection must run');
  mounted.push(await ctx.plugin(TypertRegistry));
  mounted.push(await ctx.plugin(TypertGatewayService));
  mounted.push(await installSettingsGateway(ctx, control));
  const origin = `http://127.0.0.1:${ctx.webServer.port}`;
  const action = async (method, id = agent.id) => {
    const wire = await http(`${origin}/api/guilduo/${method}`, 'POST', JSON.stringify({
      type: 'client-request', rpcId: 'fixture', method: `guilduo/${method}`, payload: { args: { sessionId: id } },
    }));
    assert.equal(wire.status, 200); const result = JSON.parse(wire.text).result;
    assert.equal(result.ok, true); return result.value;
  };
  const login = await http(ctx.connection.authenticatedUrl(`${origin}/`));
  assert.equal(login.status, 303); cookie = login.headers['set-cookie'][0].split(';', 1)[0];
  const connected = { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } };
  const disconnected = { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } };
  const execution = owner => ({ agent: owner, signal: new AbortController().signal });
  const initialLoginOwners = [];
  for (const owner of [agent, fork]) {
    const started = await action('connect', owner.id);
    assert.equal(started.ok, true, `Initial shared login from ${owner.id}: ${JSON.stringify(started)}`);
    const callback = new URL(redirect);
    callback.searchParams.set('state', new URL(started.value.authorizationUrl).searchParams.get('state'));
    callback.searchParams.set('code', 'SYNTHETIC_CODE');
    assert.equal((await http(callback.href)).status, 200, `Complete shared login from ${owner.id}`);
    const before = authorizations;
    if (owner === agent) await installAutoRestore(ctx, control);
    else for (const root of ctx.agents.roots()) await control.restore(root.id, root);
    assert.equal(authorizations, before, 'Restoration must not start OAuth');
    for (const root of [agent, other, fork]) {
      assert.equal(control.status(root.id).connected, true, 'Automatic status without Settings rendering');
      assert.equal(control.status(root.id).scope, 'shared');
      assert.deepEqual(await action('status', root.id), connected);
    }
    const tool = ctx.tools.get('mcp__guilduo__get_agent_context', agent); assert.ok(tool);
    for (const root of [agent, other, fork]) await tool.execute({}, execution(root));
    for (const invalid of [{ id: 'synthetic-fork' }, { id: fork.id, session: fork.session }]) {
      await assert.rejects(Promise.resolve().then(() => tool.execute({}, execution(invalid))), undefined, 'invalid-owner');
    }
    assert.equal((await action('connect', 'synthetic-fork')).ok, false, 'invalid-owner');
    assert.deepEqual(await action('cancel', owner.id), connected, 'Cancel preserves an established shared connection');
    assert.equal((await action('share', owner.id)).ok, false, 'Already shared cannot be promoted again');
    if (owner === agent) {
      const created = await create('synthetic-auto-root');
      assert.equal(control.status(created.id).connected, true, 'agent/created restores before Settings is rendered');
      assert.equal(control.status(created.id).scope, 'shared');
    }
    const disconnectedStatus = await action('disconnect', other.id);
    check('Shared disconnect status scope', () => assert.deepEqual(disconnectedStatus, disconnected));
    for (const root of [agent, other, fork]) {
      const rootStatus = await action('status', root.id);
      check(`Disconnected native root status: ${root.id}`, () => assert.deepEqual(rootStatus, disconnected, 'Disconnect applies to all registered roots'));
      await assert.rejects(Promise.resolve().then(() => tool.execute({}, execution(root))));
    }
    await assert.rejects(http(callback.href), { code: 'ECONNREFUSED' });
    initialLoginOwners.push(owner.id);
  }
  const pending = await action('connect'); assert.equal(pending.ok, true);
  const pendingCallback = redirect;
  const cancelledStatus = await action('cancel');
  check('Pending cancel status scope', () => assert.deepEqual(cancelledStatus, disconnected));
  await assert.rejects(http(pendingCallback), { code: 'ECONNREFUSED' });
  assert.equal(modelCalls, 0);
  for (const [file, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex'), hash,
      'Parent changed built lib during this run; rerun against the completed build');
  }
  hashes['tests/native-settings-flow.mjs'] = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
  const result = { result: failures.length ? 'FAIL_NATIVE_SETTINGS_FLOW' : 'PASS_NATIVE_SETTINGS_FLOW', failures,
    host: '0.2.0-rc.2', candidate: candidate.version,
    authenticatedCarrier: true, scopedCordisServices: true, protectedGrant: true, exactSessionToolAdmission: true,
    invalidOwnerDenied: true, registeredNativeRootForkAccepted: true, initialLoginOwners,
    autoStatusWithoutSettings: true, agentCreatedAutoRestore: true, sharedCancelPreservesConnection: true,
    disconnectAndCallbackCleanup: true, publicOAuth: false, modelCalls, toolCalls, realProfileAccess: false, hashes,
    httpDeadlineMs: HTTP_DEADLINE_MS, callbackCleanupRequires: 'ECONNREFUSED', httpRequests };
  await mkdir(artifacts, { recursive: true });
  await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  reported = true;
  console.log(JSON.stringify({ ...result, report: fileURLToPath(report) }, null, 2));
  assert.equal(failures.length, 0, 'Native shared status must satisfy the contract; see report for failures');
} catch (error) {
  if (!reported) {
    const result = { result: 'FAIL_NATIVE_SETTINGS_FLOW', candidate: candidate.version, hashes, failures, httpRequests,
      httpDeadlineMs: HTTP_DEADLINE_MS, error: { name: error.name, message: error.message, code: error.code },
      publicOAuth: false, modelCalls, realProfileAccess: false };
    await mkdir(artifacts, { recursive: true });
    await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    process.stderr.write(`${JSON.stringify({ ...result, report: fileURLToPath(report) })}\n`);
  }
  throw error;
} finally {
  for (const handle of handles.reverse()) await handle.dispose();
  for (const fiber of mounted.reverse()) await fiber.dispose();
  await control?.dispose();
  await ctx.fiber.dispose();
}
