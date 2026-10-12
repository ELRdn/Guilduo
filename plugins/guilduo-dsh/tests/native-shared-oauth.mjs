// SPDX-License-Identifier: AGPL-3.0-only
// Installed SDK only; no launcher, profile, persisted history, public OAuth, or model requests.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

assert.ok(process.argv[2], 'Supply installed DSH lib/bin.js as a resolver anchor, never execute it');
assert.equal(process.platform, 'win32', 'This native fixture verifies Windows DPAPI');
globalThis.fetch = () => { throw new Error('Public fetch forbidden in native shared OAuth fixture'); };
const entry = resolve(process.argv[2]);
const hostRequire = createRequire(entry);
assert.equal(hostRequire('@deepseek-ai/dsh/package.json').version, '0.2.0-rc.2');
const load = name => import(pathToFileURL(hostRequire.resolve(`@deepseek-ai/${name}`)).href);
const candidate = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(candidate, '../../.qa-artifacts/guilduo-dsh-shared-beta14');
const self = fileURLToPath(import.meta.url);
const inside = (base, path) => {
  const part = relative(base, resolve(path));
  assert.ok(part && !isAbsolute(part) && !part.startsWith(`..${sep}`) && part !== '..' && !resolve(path).startsWith('\\\\'), 'Fixture path must stay inside owned artifacts');
};
const deferred = () => Promise.withResolvers();
let modelCalls = 0;
const bounded = async (promise, label, ms = 8000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  })]); } finally { clearTimeout(timer); }
};

const buildDeadline = Date.now() + 60_000;
while (true) {
  const index = await readFile(join(candidate, 'lib/index.js'), 'utf8');
  const persistence = await readFile(join(candidate, 'lib/persistence.js'), 'utf8');
  if (/export (?:async )?function installAutoRestore\b/.test(index) && /createSharedConnections/.test(persistence)) break;
  assert.ok(Date.now() < buildDeadline, 'Parent must build lib with installAutoRestore and shared persistence');
  await delay(500);
}
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(new URL('../lib/', import.meta.url).href) && specifier.startsWith('@deepseek-ai/')) {
    return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
let createHostControl, installAutoRestore, inject, createGrantStore, createSharedConnections, SHARED_KEY, windowsProtection;
try {
  ({ createHostControl, installAutoRestore, inject } = await import('../lib/index.js'));
  ({ createGrantStore, createSharedConnections, SHARED_KEY, windowsProtection } = await import('../lib/persistence.js'));
} finally { hooks.deregister(); }
assert.equal(typeof installAutoRestore, 'function');
const { Context } = await load('cordis');
const { LocalCredentialProvider } = await load('dsh-credentials-local');
const { SessionId, SessionLogOffset } = await load('dsh-session');
const { credentialKey } = await load('dsh-credentials');
const { createUserMessage } = await load('dsh-llm');
const pluginRequire = createRequire(join(candidate, 'package.json'));
const { auth } = await import(pathToFileURL(pluginRequire.resolve('@modelcontextprotocol/client')).href);
const toolName = 'mcp__guilduo__get_agent_context';
const grantKey = owner => credentialKey('guilduo-dsh-oauth-poc', `session-${createHash('sha256').update(owner).digest('hex')}`);
const initialGrant = () => ({
  tokens: { access_token: 'SYNTHETIC_ACCESS', refresh_token: 'SYNTHETIC_REFRESH', token_type: 'Bearer', issuer: 'https://synthetic-issuer.invalid' },
  clientInfo: { client_id: 'synthetic-client', issuer: 'https://synthetic-issuer.invalid' },
  discovery: { authorizationServerUrl: 'https://synthetic-issuer.invalid',
    authorizationServerMetadata: { issuer: 'https://synthetic-issuer.invalid', token_endpoint: 'https://synthetic-issuer.invalid/token',
      authorization_endpoint: 'https://synthetic-issuer.invalid/authorize', response_types_supported: ['code'] },
    resourceMetadata: { resource: 'https://mcp.guilduo.com/mcp' } },
});

async function fixture(filename, native = false) {
  inside(output, filename);
  const ctx = new Context();
  const agents = new Map(), definitions = new Map(), handles = [], clients = [];
  const counters = { authorizations: 0, exchanges: 0, calls: 0, connects: 0, closes: 0, decrypts: 0, modelCalls: 0 };
  let onConnect = async () => {}, onCall = async () => {};
  const protection = { protect: windowsProtection.protect, async unprotect(...args) {
    counters.decrypts++; return windowsProtection.unprotect(...args);
  } };
  const dependencies = {
    protection,
    async authorize(provider, options) {
      counters.authorizations++;
      if (options.authorizationCode) {
        assert.equal(options.authorizationCode, 'SYNTHETIC_CODE'); counters.exchanges++;
        const grant = initialGrant();
        await provider.saveTokens(grant.tokens);
        await provider.saveClientInformation(grant.clientInfo);
        await provider.saveDiscoveryState(grant.discovery);
        return 'AUTHORIZED';
      }
      await provider.saveCodeVerifier('SYNTHETIC_PKCE');
      const url = new URL('https://synthetic-issuer.invalid/authorize');
      url.searchParams.set('state', await provider.state());
      await provider.redirectToAuthorization(url); return 'REDIRECT';
    },
    transport(provider, signal) { return { provider, signal, async start() {}, async send() {}, async close() {} }; },
    client() {
      const client = { provider: undefined, signal: undefined,
        async connect(transport) {
          client.provider = transport.provider; client.signal = transport.signal;
          counters.connects++; await onConnect(client);
        },
        async close() { counters.closes++; },
        async listTools() { return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] }; },
        async callTool(_params, options) {
          counters.calls++; await onCall(client.provider, options); return { content: [] };
        },
      };
      clients.push(client); return client;
    },
  };
  let control;
  try {
    await ctx.plugin(LocalCredentialProvider, { path: filename, watch: false });
    if (native) {
      const packages = await Promise.all(['dsh-agent', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm', 'dsh-agent-loop'].map(load));
      for (const plugin of packages.slice(0, -1)) await ctx.plugin(plugin.default);
      for (const method of ['stream', 'prepareCall']) ctx.llm[method] = () => {
        counters.modelCalls++; modelCalls++; throw new Error('Inference forbidden in native fixture');
      };
      await ctx.plugin(packages.at(-1).default, { agents: [] });
    } else {
      ctx.provide('agents', { get: id => agents.get(id), roots: () => [...agents.values()].filter(agent => !agent.parent) });
      ctx.provide('sessions', { get: id => agents.get(id)?.session });
      ctx.provide('tools', { register(tool) { definitions.set(tool.name, tool); return () => definitions.delete(tool.name); } });
    }
    ctx.provide('skills', {});
    ctx.provide('sessionController', { async resolveAgent(id) {
      const agent = ctx.agents.get(id); return agent ? { agent } : { error: 'unavailable' };
    } });
    await ctx.plugin({ inject, apply(host) { control = createHostControl(host, dependencies); } });
    return { ctx, control, counters, clients, agents,
      credentials: ctx.credentials, shared: createSharedConnections(ctx.credentials),
      onConnect(value) { onConnect = value; }, onCall(value) { onCall = value; },
      mock(id, meta = {}) {
        const session = { id, header: { id, createdAt: 1234567, isSeeded: false, ...meta } };
        const agent = { id, session }; agents.set(id, agent); return agent;
      },
      async create(id, options = {}) {
        const handle = await ctx.agents.create({ sessionId: SessionId(id), ...options });
        handles.push(handle); return handle.agent;
      },
      execute(agent, signal = new AbortController().signal) {
        const tool = native ? ctx.tools.get(toolName, agent) : definitions.get(toolName);
        assert.ok(tool, 'Discovered native tool must exist');
        return Promise.resolve().then(() => tool.execute({}, { agent, signal }));
      },
      async login(agent) {
        let url;
        await control.begin(agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
        await control.finish(agent.id, `http://127.0.0.1:43123/callback?state=${url.searchParams.get('state')}&code=SYNTHETIC_CODE`);
      },
      async dispose() {
        try { await control.dispose(); } finally {
          try { for (const handle of handles.reverse()) await handle.dispose(); }
          finally { await ctx.fiber.dispose(); }
        }
      },
    };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}

async function refresh(provider, expected, suffix) {
  assert.equal(await auth(provider, { serverUrl: 'https://mcp.guilduo.com/mcp', fetchFn: async (input, init) => {
    assert.equal(String(input), 'https://synthetic-issuer.invalid/token');
    const params = new URLSearchParams(String(init?.body));
    assert.equal(params.get('grant_type'), 'refresh_token');
    assert.equal(params.get('refresh_token'), expected);
    assert.equal(params.get('client_id'), 'synthetic-client');
    assert.equal(params.get('resource'), 'https://mcp.guilduo.com/mcp');
    return new Response(JSON.stringify({ access_token: `SYNTHETIC_ACCESS_${suffix}`, refresh_token: `SYNTHETIC_REFRESH_${suffix}`, token_type: 'Bearer' }),
      { headers: { 'content-type': 'application/json' } });
  } }), 'AUTHORIZED');
}

if (process.argv[3] === '--worker') {
  assert.ok(process.send, 'Subprocess mode requires an owned IPC channel');
  const filename = resolve(process.argv[4]); inside(output, filename);
  const f = await fixture(filename), agent = f.mock('synthetic-child-root');
  const releases = new Map();
  const send = message => process.send(message);
  const release = name => { releases.get(name)?.resolve(); releases.delete(name); };
  await f.control.restore(agent.id);
  const originalConnection = await f.shared.read();
  send({ event: 'ready', pid: process.pid });
  process.on('message', message => {
    if (message.command === 'release') { release(message.name); return; }
    void (async () => {
      if (message.command === 'hold-refresh') {
        const gate = deferred(); releases.set('refresh', gate);
        f.onCall(async provider => {
          send({ event: 'refresh-entered' }); await gate.promise;
          await refresh(provider, 'SYNTHETIC_REFRESH', 'ROTATED');
        });
        await f.execute(agent); f.onCall(async () => {});
      } else if (message.command === 'denied-call') {
        const calls = f.counters.calls;
        await assert.rejects(f.execute(agent));
        assert.equal(f.counters.calls, calls, 'Stale shared client must fail before MCP call');
      } else if (message.command === 'late-deactivate') {
        assert.equal(await f.shared.deactivate(originalConnection.connectionId), undefined);
      } else if (message.command === 'pause-logout') {
        const modify = f.credentials.modifyRecord.bind(f.credentials), gate = deferred();
        releases.set('logout', gate);
        f.credentials.modifyRecord = async (key, mutate) => {
          if (key === SHARED_KEY) { send({ event: 'logout-paused' }); await gate.promise; }
          return modify(key, mutate);
        };
        try { await f.control.logout(agent.id); } finally { f.credentials.modifyRecord = modify; }
      } else if (message.command === 'stop') {
        for (const name of [...releases.keys()]) release(name);
        await f.dispose(); send({ id: message.id, ok: true }); process.disconnect(); return;
      } else throw new Error('Unknown native worker command');
      send({ id: message.id, ok: true });
    })().catch(error => send({ id: message.id, ok: false, error: error.message }));
  });
  process.on('disconnect', () => {
    for (const name of [...releases.keys()]) release(name);
    void f.dispose().finally(() => process.exit());
  });
} else {
  await mkdir(output, { recursive: true });
  const runDirectory = await mkdtemp(join(output, 'native-'));
  const results = [], children = new Set();
  const hashes = {};
  for (const name of ['index', 'persistence', 'adapter']) hashes[name] = createHash('sha256').update(await readFile(join(candidate, `lib/${name}.js`))).digest('hex');
  const candidateVersion = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8')).version;
  const deadline = setTimeout(() => {
    for (const child of children) child.kill();
    process.stderr.write('Owned native harness exceeded 120 seconds\n'); process.exit(1);
  }, 120_000);
  async function worker(filename) {
    inside(runDirectory, filename);
    const child = fork(self, [entry, '--worker', filename], { cwd: runDirectory,
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, DSH_HOME: runDirectory },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    children.add(child);
    const messages = [], listeners = new Set(); let serial = 0, diagnostic = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
    const exited = deferred();
    child.once('exit', (code, signal) => {
      children.delete(child); exited.resolve({ code, signal });
      for (const listener of listeners) listener.reject(new Error(`Owned worker exited (${code ?? signal}): ${diagnostic}`));
    });
    child.on('error', error => { for (const listener of listeners) listener.reject(error); });
    child.on('message', message => {
      const listener = [...listeners].find(value => value.match(message));
      if (listener) { listeners.delete(listener); listener.resolve(message); } else messages.push(message);
    });
    const wait = async match => {
      const index = messages.findIndex(match);
      if (index >= 0) return messages.splice(index, 1)[0];
      const result = deferred(), listener = { ...result, match }; listeners.add(listener);
      try { return await bounded(result.promise, 'native worker IPC'); } finally { listeners.delete(listener); }
    };
    const command = command => {
      const id = ++serial;
      const result = wait(message => message.id === id).then(message => { assert.equal(message.ok, true, message.error); return message; });
      result.catch(() => {}); child.send({ command, id }); return result;
    };
    try { await wait(message => message.event === 'ready'); }
    catch (error) { child.kill(); await exited.promise; throw error; }
    return { child, command, event: name => wait(message => message.event === name),
      release(name) { if (child.connected) child.send({ command: 'release', name }); },
      async stop() {
        try { if (child.connected) await command('stop'); }
        finally { if (child.connected) child.kill(); await bounded(exited.promise, 'owned worker exit'); }
      } };
  }
  async function check(name, operation) {
    const filename = join(runDirectory, `${results.length}-synthetic-credentials.yaml`);
    const started = Date.now();
    try { await operation(filename); results.push({ name, result: 'PASS', durationMs: Date.now() - started }); }
    catch (error) { results.push({ name, result: 'FAIL', durationMs: Date.now() - started, error: error.stack }); }
    console.log(`${results.at(-1).result}: ${name}`);
  }
  try {
    await check('legacy sharing references one DPAPI grant without token cloning; restart retains sharing', async filename => {
      let f = await fixture(filename);
      try {
        const source = f.mock('synthetic-legacy-root');
        const store = createGrantStore(f.credentials, source.id, source.session.header.createdAt, () => true);
        await store.save(initialGrant());
        assert.equal(await f.control.restore(source.id), true);
        assert.equal(f.control.status(source.id).scope, 'session'); assert.equal(f.control.status(source.id).canShare, true);
        await bounded(f.control.share(source.id), 'native share without nested file lock');
        const pointer = await f.shared.read(); assert.equal(pointer.owner, source.id);
        assert.equal(pointer.createdAt, source.session.header.createdAt);
        assert.deepEqual(Object.keys(pointer).sort(), ['connectionId', 'createdAt', 'owner', 'state', 'version']);
        const other = f.mock('synthetic-other-root'), forked = f.mock('synthetic-root-fork', { parentSession: source.id, isSeeded: true });
        for (const agent of [other, forked]) assert.equal(await f.control.restore(agent.id), true);
        assert.equal((await f.credentials.listRecords()).length, 2);
        assert.ok(await f.credentials.readRecord(grantKey(source.id)));
        assert.equal(f.counters.authorizations, 0);
        assert.doesNotMatch(await readFile(filename, 'utf8'), /SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|PKCE|callback|synthetic-client/);
        await f.control.sessionDisposed(source.id);
        assert.equal((await f.shared.read()).state, 'active');
        await f.dispose(); f = await fixture(filename);
        const root = f.mock('synthetic-restarted-root');
        assert.equal(await f.control.restore(root.id), true);
        assert.equal(f.control.status(root.id).scope, 'shared'); assert.equal(f.control.status(root.id).canShare, false);
      } finally { await f.dispose(); }
    });

    await check('native AgentLoop awaits auto restore before first assembly; root/fork admission', async filename => {
      const f = await fixture(filename, true), entered = deferred(), gate = deferred();
      try {
        const source = createGrantStore(f.credentials, 'synthetic-native-source', 1234567, () => true);
        await source.save(initialGrant());
        await f.shared.publish('synthetic-native-source', 1234567, undefined, async () => { assert.ok(await source.read()); });
        const assemblies = [];
        f.ctx.on('agent/created', ({ agent }) => { agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic assembly probe' }], source: { kind: 'user' } })); });
        f.ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
          const value = await next(); assemblies.push({ id: context.agent.id, tools: value.tools.map(tool => tool.name) }); return value;
        });
        f.ctx.on('agent/pre-step', async () => ({ kind: 'reject' }));
        f.onConnect(async () => { entered.resolve(); await gate.promise; });
        await installAutoRestore(f.ctx, f.control);
        let created = false;
        const creating = f.create('synthetic-native-root').then(agent => { created = true; return agent; });
        await bounded(entered.promise, 'native creation reached restore');
        await delay(100); assert.equal(created, false); assert.equal(assemblies.length, 0);
        gate.resolve(); const root = await bounded(creating, 'native created listeners settle');
        await bounded(root.whenIdle(), 'native first assembly idle');
        assert.deepEqual(assemblies.find(value => value.id === root.id)?.tools, [toolName]);
        f.onConnect(async () => {});
        const modes = [
          ['ordinary', {}, true],
          ['fork', { seed: [], inheritedEventCount: SessionLogOffset(0), meta: { parentSession: root.id, isSeeded: true } }, true],
          ['subagent-origin', { meta: { origin: 'subagent' } }, false],
          ['runtime-child', { parentAgent: root }, false],
          ['independent-seeded', { seed: [], inheritedEventCount: SessionLogOffset(0), meta: { isSeeded: true } }, false],
        ];
        for (const [name, options, admitted] of modes) {
          const decrypts = f.counters.decrypts, connects = f.counters.connects;
          const agent = await f.create(`synthetic-native-${name}`, options);
          await bounded(agent.whenIdle(), `native ${name} idle`);
          assert.equal(f.control.status(agent.id).connected, admitted, name);
          const tools = assemblies.find(value => value.id === agent.id)?.tools;
          if (admitted) assert.ok(tools?.includes(toolName), `${name} sees shared tool in its first assembly`);
          else {
            assert.equal(f.counters.decrypts, decrypts, `${name} must not decrypt shared grant`);
            assert.equal(f.counters.connects, connects, `${name} must not connect to MCP`);
            await assert.rejects(f.execute(agent));
          }
        }
        await assert.rejects(f.control.restore(root.id, { ...root }));
        assert.equal(f.counters.modelCalls, 0); assert.equal(f.counters.authorizations, 0);
      } finally { gate.resolve(); await f.dispose(); }
    });

    await check('two processes serialize SDK refresh; global disconnect denies cached clients and restart', async filename => {
      const f = await fixture(filename); let child;
      try {
        const root = f.mock('synthetic-parent-root'); await f.login(root);
        assert.equal(f.control.status(root.id).scope, 'shared'); assert.equal(f.control.status(root.id).canShare, false);
        const other = f.mock('synthetic-parent-other'), forked = f.mock('synthetic-parent-fork', { parentSession: root.id, isSeeded: true });
        for (const agent of [other, forked]) assert.equal(await f.control.restore(agent.id), true);
        child = await worker(filename);
        const held = child.command('hold-refresh'); await child.event('refresh-entered');
        assert.equal(Number((await readFile(`${filename}.lock`, 'utf8')).trim()), child.child.pid);
        let entered = false, otherKeyEntered = false;
        const otherKey = f.credentials.modifyRecord(credentialKey('guilduo-dsh-oauth-poc', 'synthetic-lock-probe'), async () => {
          otherKeyEntered = true; return undefined;
        });
        f.onCall(async provider => { entered = true; assert.equal((await provider.tokens()).refresh_token, 'SYNTHETIC_REFRESH_ROTATED'); });
        const pending = f.execute(root);
        await delay(150); assert.equal(entered, false, 'Parent must wait for the child file lock');
        assert.equal(otherKeyEntered, false, 'Different credential keys share the same document lock');
        child.release('refresh'); await bounded(Promise.all([held, otherKey, pending]), 'two-process rotated refresh');
        assert.equal(entered, true); assert.equal(otherKeyEntered, true);
        await f.control.logout(root.id);
        assert.equal((await f.shared.read()).state, 'disconnected');
        for (const agent of [root, other, forked]) {
          assert.equal(f.control.status(agent.id).connected, false, 'Global disconnect clears every local shared binding');
          await assert.rejects(f.execute(agent));
        }
        await child.command('denied-call'); await child.stop(); child = undefined;
        const restarted = await fixture(filename);
        try { assert.equal(await restarted.control.restore(restarted.mock('synthetic-after-logout').id), false); }
        finally { await restarted.dispose(); }
      } finally { child?.release('refresh'); if (child) await child.stop(); await f.dispose(); }
    });

    await check('abort while queued on native file lock cannot enter a late MCP call', async filename => {
      const f = await fixture(filename); let child, held, calling;
      try {
        const root = f.mock('synthetic-aborted-root'); await f.login(root); child = await worker(filename);
        held = child.command('hold-refresh'); await child.event('refresh-entered');
        const controller = new AbortController(), calls = f.counters.calls;
        calling = assert.rejects(f.execute(root, controller.signal));
        await delay(100); assert.equal(f.counters.calls, calls);
        controller.abort(new Error('Synthetic cancellation while queued'));
        child.release('refresh'); await bounded(Promise.all([held, calling]), 'cancelled queued operation settles');
        assert.equal(f.counters.calls, calls, 'Recheck the request signal after acquiring the file lock, before calling MCP');
      } finally {
        child?.release('refresh'); await Promise.allSettled([held, calling]);
        if (child) await child.stop(); await f.dispose();
      }
    });

    await check('reconnect ABA rejects old refresh/admission/deactivate without changing the new grant', async filename => {
      const f = await fixture(filename); let child;
      try {
        const root = f.mock('synthetic-aba-root'); await f.login(root);
        const first = await f.shared.read(); child = await worker(filename);
        await f.control.logout(root.id); await f.login(root);
        const second = await f.shared.read(); assert.notEqual(first.connectionId, second.connectionId);
        const before = await f.credentials.readRecord(grantKey(second.owner));
        await child.command('denied-call'); await child.command('late-deactivate');
        await f.credentials.modifyRecord(SHARED_KEY, async () => undefined);
        assert.deepEqual(await f.shared.read(), second);
        assert.deepEqual(await f.credentials.readRecord(grantKey(second.owner)), before);
      } finally { if (child) await child.stop(); await f.dispose(); }
    });

    await check('paused old global disconnect cannot deactivate a reconnected shared pointer', async filename => {
      const f = await fixture(filename); let child, oldLogout;
      try {
        const root = f.mock('synthetic-logout-aba-root'); await f.login(root); child = await worker(filename);
        oldLogout = child.command('pause-logout'); await child.event('logout-paused');
        await f.control.logout(root.id); await f.login(root);
        const second = await f.shared.read();
        child.release('logout'); await oldLogout;
        await f.credentials.modifyRecord(SHARED_KEY, async () => undefined);
        assert.deepEqual(await f.shared.read(), second, 'Old global disconnect must be conditional on its captured connectionId');
        assert.ok(await f.credentials.readRecord(grantKey(second.owner)));
      } finally { child?.release('logout'); await oldLogout?.catch(() => {}); if (child) await child.stop(); await f.dispose(); }
    });

    await check('15s restore timeout closes transport, releases late file lock, and cannot publish tokens', async filename => {
      const f = await fixture(filename), entered = deferred(), gate = deferred();
      try {
        const root = f.mock('synthetic-timeout-root'); await f.login(root); await f.control.release(root.id);
        const pointer = await f.shared.read(), before = await f.credentials.readRecord(grantKey(pointer.owner));
        let rejectedLateToken = false;
        f.onConnect(async client => {
          entered.resolve(); await gate.promise;
          await assert.rejects(Promise.resolve().then(() => client.provider.saveTokens({ access_token: 'SYNTHETIC_LATE_TOKEN', token_type: 'Bearer' })));
          rejectedLateToken = true;
        });
        const closes = f.counters.closes, started = Date.now();
        const restoring = assert.rejects(f.control.restore(root.id), /timed out/);
        await bounded(entered.promise, 'timeout restore entered');
        await bounded(restoring, 'native 15s restoration deadline', 18_000);
        assert.ok(Date.now() - started >= 14_500);
        assert.equal(f.control.status(root.id).connected, false); assert.equal(f.control.status(root.id).failed, true);
        assert.ok(f.counters.closes > closes); assert.equal(f.clients.at(-1).signal?.aborted, true);
        gate.resolve();
        await bounded(f.credentials.modifyRecord(SHARED_KEY, async () => undefined), 'late restore releases native lock');
        assert.equal(rejectedLateToken, true);
        assert.deepEqual(await f.credentials.readRecord(grantKey(pointer.owner)), before);
        await assert.rejects(access(`${filename}.lock`), { code: 'ENOENT' });
      } finally { gate.resolve(); await f.dispose(); }
    });
  } finally {
    clearTimeout(deadline);
    for (const child of children) child.kill();
    const evidence = { result: results.every(value => value.result === 'PASS') ? 'PASS_NATIVE_SHARED_OAUTH' : 'FAIL_NATIVE_SHARED_OAUTH',
      dsh: '0.2.0-rc.2', candidate: candidateVersion, node: process.version, hashes, results,
      realCredentials: false, realProfileAccess: false, realHistoryAccess: false, publicOAuth: false, modelCalls };
    await writeFile(join(runDirectory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    // Retain only evidence; every disposable Credentials path belongs to this generated run.
    for (let index = 0; index < results.length; index++) {
      const filename = join(runDirectory, `${index}-synthetic-credentials.yaml`); inside(runDirectory, filename);
      await rm(filename, { force: true });
    }
    console.log(JSON.stringify({ result: evidence.result, evidence: join(runDirectory, 'evidence.json') }));
    if (evidence.result !== 'PASS_NATIVE_SHARED_OAUTH') process.exitCode = 1;
  }
}
