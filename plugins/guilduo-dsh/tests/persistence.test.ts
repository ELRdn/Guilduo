// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Context } from '@deepseek-ai/cordis';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import type { OAuthClientProvider } from '@modelcontextprotocol/client';
import { auth } from '@modelcontextprotocol/client';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createHostControl, inject, installAutoRestore, RESTORE_TIMEOUT_MS } from '../src/index.js';
import { createSettingsBridge } from '../src/settings.js';
import { createGrantStore, createSharedConnections, SHARED_KEY, windowsProtection } from '../src/persistence.js';
import type { Grant, Protection } from '../src/persistence.js';
import type { Dependencies } from '../src/adapter.js';

const fakeProtection: Protection = {
  async protect(value, owner) { return JSON.stringify({ owner, value }); },
  async unprotect(value, owner) { const parsed = JSON.parse(value); assert.equal(parsed.owner, owner); return parsed.value; },
};
class MemoryStore {
  records = new Map<CredentialKey, CredentialRecord>(); reads: CredentialKey[] = [];
  tail: Promise<unknown> = Promise.resolve();
  async readRecord(key: CredentialKey) { this.reads.push(key); return structuredClone(this.records.get(key)); }
  modifyRecord(key: CredentialKey, mutate: (record: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
    const task = this.tail.then(async () => {
      const next = await mutate(structuredClone(this.records.get(key)));
      if (next) this.records.set(key, structuredClone(next));
      return structuredClone(this.records.get(key));
    }); this.tail = task.catch(() => {}); return task;
  }
  async deleteRecord(key: CredentialKey) {
    const task = this.tail.then(() => { this.records.delete(key); }); this.tail = task.catch(() => {}); return task;
  }
}
function fixture(store = new MemoryStore(), protection = fakeProtection, context = new Context(), id = 'synthetic-persistence-main') {
  const ctx = context;
  const session = { id, header: { id, createdAt: 1234567, isSeeded: false } };
  const agent = { id: session.id, session };
  let liveSession = session;
  const operator = {};
  const agents = new Map([[agent.id, agent]]);
  const roots = new Set([agent.id]);
  const definitions = new Map<string, ToolDefinition>();
  let provider: OAuthClientProvider; let exchanges = 0; let redirects = 0;
  let call: (() => Promise<void>) | undefined;
  let connect: (() => Promise<void>) | undefined;
  let resolveOwner = async () => ({ agent });
  if (!ctx.get('credentials')) ctx.provide('credentials', store);
  ctx.provide('agents', { get: (id: string) => agents.get(id), roots: () => [...agents.values()].filter(agent => roots.has(agent.id)) });
  ctx.provide('sessions', { get: (id: string) => id === agent.id && agents.has(id) ? liveSession : agents.get(id)?.session });
  ctx.provide('sessionController', { resolveAgent: (id: string) => id === agent.id ? resolveOwner() : Promise.resolve({ error: 'unavailable' }) });
  ctx.provide('connection', { operator });
  ctx.provide('tools', { register(tool: ToolDefinition) {
    definitions.set(tool.name, tool); return () => { definitions.delete(tool.name); };
  } });
  const deps: Dependencies = {
    protection,
    async authorize(value, options) {
      provider = value;
      if (options.authorizationCode) {
        exchanges++;
        await value.saveTokens({ access_token: 'SYNTHETIC_ACCESS', refresh_token: 'SYNTHETIC_REFRESH', token_type: 'Bearer', issuer: 'https://synthetic-issuer.invalid' });
        return 'AUTHORIZED';
      }
      await value.saveClientInformation!({ client_id: 'synthetic-client', issuer: 'https://synthetic-issuer.invalid',
        redirect_uris: [String(value.redirectUrl)] });
      await value.saveDiscoveryState!({ authorizationServerUrl: 'https://synthetic-issuer.invalid',
        authorizationServerMetadata: { issuer: 'https://synthetic-issuer.invalid', token_endpoint: 'https://synthetic-issuer.invalid/token',
          authorization_endpoint: 'https://synthetic-issuer.invalid/authorize', response_types_supported: ['code'] },
        resourceMetadata: { resource: 'https://mcp.guilduo.com/mcp' } });
      await value.saveCodeVerifier('SYNTHETIC_PKCE');
      const url = new URL('https://mcp.guilduo.com/oauth/authorize');
      url.searchParams.set('state', await value.state!()); redirects++;
      await value.redirectToAuthorization(url); return 'REDIRECT';
    },
    transport(value) { provider = value; return { async start() {}, async send() {}, async close() {} }; },
    client: () => ({ async connect() { await connect?.(); }, async close() {},
      async listTools() { return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] }; },
      async callTool() { await call?.(); return { content: [] }; } }),
  };
  const control = createHostControl(ctx, deps);
  const bridge = createSettingsBridge(ctx, control);
  const status = () => bridge.handle('guilduo/status', { sessionId: agent.id }, new AbortController().signal, operator as never);
  const execute = () => definitions.get('mcp__guilduo__get_agent_context')!.execute({},
    { agent, signal: new AbortController().signal } as unknown as ToolRunContext);
  return { ctx, store, agent, session, agents, roots, control, bridge, deps, definitions, status, execute,
    provider: () => provider, exchanges: () => exchanges, redirects: () => redirects,
    onCall: (value: () => Promise<void>) => { call = value; },
    onConnect: (value: () => Promise<void>) => { connect = value; },
    resolveOwner: (value: typeof resolveOwner) => { resolveOwner = value; },
    replaceSession: () => { liveSession = { ...session }; },
    async dispose() { await bridge.dispose(); await control.dispose(); await ctx.fiber.dispose(); } };
}
async function seedLegacy(f: ReturnType<typeof fixture>) {
  await createGrantStore(f.store, f.agent.id, f.session.header.createdAt, () => true, fakeProtection).save({
    tokens: { access_token: 'SYNTHETIC_ACCESS', refresh_token: 'SYNTHETIC_REFRESH', token_type: 'Bearer' },
  });
}
async function disconnected(store: MemoryStore) {
  const retained = [...store.records.values()].filter(record => !isDeepStrictEqual(record, { kind: 'grant', payload: { discarded: true } }));
  assert.equal(retained.length, 1, 'Only the global disconnected tombstone and optional empty legacy marker remain');
  assert.equal((await createSharedConnections(store).read())?.state, 'disconnected');
  assert.doesNotMatch(JSON.stringify([...store.records]), /ciphertext|ACCESS|REFRESH|PKCE|callback/);
}
async function login(f: ReturnType<typeof fixture>) {
  let url: URL | undefined;
  await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
  await f.control.finish(f.agent.id, `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`);
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

test('Cordis sibling services require parent injection before Settings can restore and complete OAuth', { timeout: 5000 }, async () => {
  const ctx = new Context(); const store = new MemoryStore(); const operator = {};
  const id = SessionId('synthetic-scoped-owner');
  const session = Session.create(id); const agent = { id, session };
  let liveAgent: typeof agent | undefined = agent; let liveSession = session; let resolvedAgent = agent;
  let authorizations = 0; let exchanges = 0; let redirect = '';
  const deps: Dependencies = {
    protection: fakeProtection,
    async authorize(provider, options) {
      authorizations++;
      if (options.authorizationCode) {
        exchanges++; await provider.saveTokens({ access_token: 'SYNTHETIC_SCOPED_ACCESS', token_type: 'Bearer' });
        return 'AUTHORIZED';
      }
      redirect = String(provider.redirectUrl); await provider.saveCodeVerifier('SYNTHETIC_SCOPED_PKCE');
      const url = new URL('https://mcp.guilduo.com/oauth/authorize');
      url.searchParams.set('state', await provider.state!());
      await provider.redirectToAuthorization(url); return 'REDIRECT';
    },
    transport: () => ({ async start() {}, async send() {}, async close() {} }),
    client: () => ({ async connect() {}, async close() {},
      async listTools() { return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] }; },
      async callTool() { return { content: [] }; } }),
  };
  const services = {
    credentials: store, skills: {}, tools: { register: () => () => {} }, connection: { operator },
    agents: { get: (key: string) => key === id ? liveAgent : undefined, roots: () => liveAgent ? [liveAgent] : [] },
    sessions: { get: (key: string) => key === id ? liveSession : undefined },
    sessionController: { resolveAgent: async () => ({ agent: resolvedAgent }) },
  };
  const mount = async (declared: string[]) => {
    let control!: ReturnType<typeof createHostControl>; let bridge!: ReturnType<typeof createSettingsBridge>;
    const fiber = await ctx.plugin({ name: 'scoped-consumer', inject: declared, async apply(parent) {
      control = createHostControl(parent, deps);
      // The Gateway child must not grant its captured parent extra service access.
      await parent.inject(['connection', 'agents', 'sessionController'], child => {
        bridge = createSettingsBridge(child, control);
      });
    } });
    return { control, bridge,
      status: () => bridge.handle('guilduo/status', { sessionId: id }, new AbortController().signal, operator as never),
      async dispose() { await bridge.dispose(); await control.dispose(); await fiber.dispose(); } };
  };
  try {
    for (const [key, value] of Object.entries(services)) {
      await ctx.plugin({ name: `sibling-${key}`, apply(sibling) { sibling.provide(key, value); } });
    }
    for (const declared of [['tools', 'skills'], ['tools', 'skills', 'credentials']]) {
      const old = await mount(declared);
      try {
        await assert.rejects(old.control.restore(id), /cannot get property "sessionController" without inject/);
        assert.deepEqual(await old.status(), { ok: true, value: { state: 'failed', tools: 0, scope: 'none', canShare: false } });
        assert.ok(store.reads.every(key => key === SHARED_KEY), 'Missing injections must never read a protected grant');
        assert.equal(store.records.size, 0); assert.equal(authorizations, 0);
      } finally { await old.dispose(); }
    }

    const declarations: string[][] = [];
    for (const filename of ['cordis.patch.yml', 'dsh.bundle.patch.yml']) {
      const patch = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
      const match = /inject:\s*\[([^\]]+)\]/.exec(patch); assert.ok(match, `${filename} must declare its service scope`);
      const declared = match[1].split(',').map(name => name.trim());
      assert.deepEqual([...declared].sort(), [...inject].sort(), `${filename} must match exported inject`);
      declarations.push(declared);
    }
    let fixed = await mount(declarations[0]);
    try {
      const readsBefore = store.reads.length;
      assert.deepEqual(await fixed.status(), { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
      assert.equal(store.reads.slice(readsBefore).filter(key => key !== SHARED_KEY).length, 1); assert.equal(authorizations, 0);
      const started = await fixed.bridge.handle('guilduo/connect', { sessionId: id }, new AbortController().signal, operator as never);
      assert.ok(started.ok && started.value && typeof started.value === 'object' && 'authorizationUrl' in started.value);
      assert.ok(typeof started.value.authorizationUrl === 'string');
      const callback = new URL(redirect); assert.equal(callback.hostname, '127.0.0.1');
      callback.searchParams.set('state', new URL(started.value.authorizationUrl).searchParams.get('state')!);
      callback.searchParams.set('code', 'SYNTHETIC_SCOPED_CODE');
      assert.equal(await new Promise<number>((resolve, reject) => {
        const req = request(callback, { agent: false }, response => {
          response.resume(); response.on('end', () => resolve(response.statusCode!));
        });
        req.on('error', reject); req.setTimeout(1000, () => req.destroy(new Error('Synthetic callback timeout'))); req.end();
      }), 200);
      assert.equal(exchanges, 1); assert.equal(store.records.size, 2);
      assert.deepEqual(await fixed.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
      await fixed.dispose(); fixed = await mount(declarations[1]);
      assert.deepEqual(await fixed.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
      assert.equal(authorizations, 2, 'Restoring a grant must not start OAuth again');
      await fixed.control.release(id);

      for (const mode of ['missing', 'forged', 'replaced', 'subagent']) {
        liveAgent = agent; liveSession = session; resolvedAgent = agent;
        if (mode === 'missing') liveAgent = undefined;
        if (mode === 'forged') resolvedAgent = { ...agent };
        if (mode === 'replaced') liveSession = Session.create(id);
        if (mode === 'subagent') {
          liveSession = Session.create(id, undefined, { ...session.header, origin: 'subagent' });
          liveAgent = resolvedAgent = { id, session: liveSession };
        }
        const reads: number = store.reads.length;
        await assert.rejects(fixed.control.restore(id), /Exact live credential owner unavailable|Exact ordinary native Session/);
        assert.ok(store.reads.slice(reads).every(key => key === SHARED_KEY), `${mode} owner must not read a grant`);
        assert.equal(fixed.control.status(id).connected, false); assert.equal(authorizations, 2);
      }
    } finally { await fixed.dispose(); }
  } finally { await ctx.fiber.dispose(); }
});

test('Windows DPAPI current-user roundtrip rejects tampering and a different exact owner', { timeout: 30000 }, async () => {
  if (process.platform !== 'win32') {
    await assert.rejects(windowsProtection.protect('SYNTHETIC_ONLY', 'A'), /Windows DPAPI/);
    assert.throws(() => createGrantStore(new MemoryStore(), 'A', 1, () => true), /login was not started/); return;
  }
  const cipher = await windowsProtection.protect('SYNTHETIC_ONLY', 'A\0birth');
  assert.ok(!cipher.includes('SYNTHETIC_ONLY'));
  assert.equal(await windowsProtection.unprotect(cipher, 'A\0birth'), 'SYNTHETIC_ONLY');
  await assert.rejects(windowsProtection.unprotect(cipher, 'B\0birth'), /protection failed/);
  const tampered = Buffer.from(cipher, 'base64'); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(windowsProtection.unprotect(tampered.toString('base64'), 'A\0birth'), /protection failed/);
});

test('grant stays absent until successful discovery; snapshot excludes PKCE/state/callback and registration URI', async () => {
  const f = fixture();
  try {
    let url: URL | undefined;
    await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
    assert.equal(f.store.records.size, 0);
    await assert.rejects(f.control.finish(f.agent.id, 'http://127.0.0.1:43123/callback?state=wrong&code=denied'));
    assert.equal(f.store.records.size, 0);
    await f.control.finish(f.agent.id, `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`);
    assert.equal(f.store.records.size, 2);
    const pointer = f.store.records.get(SHARED_KEY)!;
    assert.equal(pointer.kind, 'grant');
    assert.deepEqual(Object.keys(pointer.payload!).sort(), ['connectionId', 'createdAt', 'owner', 'state', 'version']);
    assert.equal((await createSharedConnections(f.store).read())?.state, 'active');
    assert.doesNotMatch(JSON.stringify(pointer), /SYNTHETIC_|PKCE|callback|redirect_uris|tokens|clientInfo/);
    const [key, record] = [...f.store.records].find(([key]) => key !== SHARED_KEY)!;
    assert.match(key, /^guilduo-dsh-oauth-poc\/session-[a-f0-9]{64}$/);
    assert.equal(record.kind, 'grant');
    assert.doesNotMatch(JSON.stringify(record), /PKCE|state|callback|redirect_uris|SYNTHETIC_CODE/);
    assert.match(JSON.stringify(record), /SYNTHETIC_ACCESS|synthetic-client|synthetic-issuer/);
  } finally { await f.dispose(); }
});

test('restart restores a shared connection without interactive OAuth and logout leaves only a tombstone', async () => {
  const store = new MemoryStore(); const first = fixture(store);
  await login(first); await first.dispose(); assert.equal(store.records.size, 2);
  const second = fixture(store);
  try {
    assert.deepEqual(await second.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    assert.equal(second.exchanges(), 0); assert.equal(second.redirects(), 0);
    await assert.rejects(Promise.resolve().then(() => second.provider().state!()), /explicit host login/);
    assert.throws(() => second.provider().codeVerifier(), /No pending PKCE/);
    await second.execute();
    await assert.rejects(Promise.resolve().then(() => second.definitions.get('mcp__guilduo__get_agent_context')!.execute({},
      { agent: { id: second.agent.id }, signal: new AbortController().signal } as ToolRunContext)));
    await second.control.logout(second.agent.id); await disconnected(store);
    assert.equal(await second.control.restore(second.agent.id), false);
  } finally { await second.dispose(); }
});

test('legacy grants stay isolated from unavailable, forged, forked, replaced, child, seeded and reused-id Sessions', async () => {
  const store = new MemoryStore(); const first = fixture(store); await seedLegacy(first); await first.dispose();
  for (const mode of ['missing', 'forged', 'fork', 'replaced', 'child', 'seeded', 'subagent', 'new-birth']) {
    const f = fixture(store); const reads = store.reads.length;
    try {
      if (mode === 'missing') f.agents.delete(f.agent.id);
      if (mode === 'forged') f.resolveOwner(async () => ({ agent: { ...f.agent } }));
      if (mode === 'fork') Object.assign(f.session.header, { parentSession: 'synthetic-parent', isSeeded: true });
      if (mode === 'seeded') f.session.header.isSeeded = true;
      if (mode === 'subagent') Object.assign(f.session.header, { origin: 'subagent' });
      if (mode === 'child') f.roots.delete(f.agent.id);
      if (mode === 'replaced') f.replaceSession();
      if (mode === 'new-birth') f.session.header.createdAt++;
      if (mode === 'fork') {
        assert.equal(await f.control.restore(f.agent.id), false, 'A live fork without shared OAuth must stay disconnected');
        assert.deepEqual(await f.status(), { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
        assert.equal(f.control.status(f.agent.id).failed, false);
      } else await assert.rejects(f.control.restore(f.agent.id));
      assert.equal(f.control.status(f.agent.id).connected, false);
      if (mode !== 'new-birth') assert.ok(store.reads.slice(reads).every(key => key === SHARED_KEY), 'Denied owner must not read the protected credential record');
      assert.equal(store.records.size, 1); assert.equal(store.records.has(SHARED_KEY), false);
      assert.equal(f.exchanges(), 0); assert.equal(f.redirects(), 0);
    } finally { await f.dispose(); }
  }
});

test('shared OAuth admits live ordinary roots and top-level forks, including reused IDs with a new birth', async () => {
  const store = new MemoryStore(); const first = fixture(store); await login(first); await first.dispose();
  for (const mode of ['normal', 'fork', 'new-birth', 'missing', 'forged', 'replaced', 'subagent', 'child', 'seeded']) {
    const f = fixture(store, fakeProtection, new Context(), mode === 'new-birth' ? first.agent.id : `synthetic-${mode}`);
    try {
      if (mode === 'fork') Object.assign(f.session.header, { parentSession: 'synthetic-parent', isSeeded: true });
      if (mode === 'new-birth') f.session.header.createdAt++;
      if (mode === 'missing') f.agents.delete(f.agent.id);
      if (mode === 'forged') f.resolveOwner(async () => ({ agent: { ...f.agent } }));
      if (mode === 'replaced') f.replaceSession();
      if (mode === 'subagent') Object.assign(f.session.header, { origin: 'subagent' });
      if (mode === 'child') f.roots.delete(f.agent.id);
      if (mode === 'seeded') f.session.header.isSeeded = true;
      const reads = store.reads.length;
      if (['normal', 'fork', 'new-birth'].includes(mode)) {
        assert.equal(await f.control.restore(f.agent.id), true, mode);
        assert.deepEqual(await f.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
        await f.execute();
      } else {
        await assert.rejects(f.control.restore(f.agent.id), /Exact live credential owner unavailable|Exact ordinary native Session/);
        assert.ok(store.reads.slice(reads).every(key => key === SHARED_KEY), `${mode} must not read protected grants`);
        assert.equal(f.control.status(f.agent.id).connected, false);
        assert.equal(f.definitions.size, 0);
      }
      assert.equal(f.exchanges(), 0); assert.equal(f.redirects(), 0); assert.equal(store.records.size, 2);
    } finally { await f.dispose(); }
  }
});

test('legacy OAuth is shared only by explicit migration and the global tombstone blocks legacy fallback', async () => {
  const store = new MemoryStore(); const owner = fixture(store);
  const other = fixture(store, fakeProtection, new Context(), 'synthetic-other-root');
  try {
    await seedLegacy(owner);
    assert.equal(await owner.control.restore(owner.agent.id), true);
    assert.deepEqual(await owner.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'session', canShare: true } });
    assert.equal(await other.control.restore(other.agent.id), false);
    await assert.rejects(other.control.share(other.agent.id), /No legacy connection to share/);
    assert.equal(store.records.has(SHARED_KEY), false);
    await owner.control.share(owner.agent.id);
    assert.equal(store.records.size, 2);
    assert.deepEqual(await owner.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    assert.equal(await other.control.restore(other.agent.id), true); await other.execute();
    await assert.rejects(owner.control.share(owner.agent.id), /No legacy connection to share/);
    await other.control.cancelLogin(other.agent.id);
    assert.equal(other.control.status(other.agent.id).connected, true); assert.equal(store.records.size, 2);
    await other.control.logout(other.agent.id); await disconnected(store);
    assert.equal(await owner.control.restore(owner.agent.id), false);
    assert.equal(await other.control.restore(other.agent.id), false);
    await seedLegacy(owner);
    assert.equal(await owner.control.restore(owner.agent.id), false, 'A tombstone must prevent silently reviving a legacy login');
    assert.equal(owner.redirects(), 0); assert.equal(other.redirects(), 0);
  } finally { await owner.dispose(); await other.dispose(); }
});

test('activation and Agent creation restore shared OAuth only for exact native roots without opening login', async () => {
  const first = fixture(); await login(first); await first.dispose();
  const f = fixture(first.store);
  try {
    for (const mode of ['fork', 'subagent', 'seeded', 'child']) {
      const id = `synthetic-auto-${mode}`;
      const agent = { id, session: { id, header: { id, createdAt: 2345678,
        isSeeded: mode === 'fork' || mode === 'seeded',
        ...(mode === 'fork' ? { parentSession: 'synthetic-parent' } : {}),
        ...(mode === 'subagent' ? { origin: 'subagent' } : {}),
      } } };
      f.agents.set(id, agent);
      if (mode !== 'child') f.roots.add(id);
    }
    await installAutoRestore(f.ctx, f.control);
    assert.equal(f.control.status(f.agent.id).connected, true);
    assert.equal(f.control.status('synthetic-auto-fork').connected, true);
    for (const mode of ['subagent', 'seeded', 'child']) assert.equal(f.control.status(`synthetic-auto-${mode}`).connected, false, mode);
    const id = 'synthetic-auto-new-root';
    const agent = { id, session: { id, header: { id, createdAt: 3456789, isSeeded: false } } };
    f.agents.set(id, agent); f.roots.add(id);
    await f.ctx.parallel('agent/created', { agent } as never);
    assert.equal(f.control.status(id).connected, true);
    const reads = f.store.reads.length;
    await f.ctx.parallel('agent/created', { agent: { ...agent } } as never);
    await f.ctx.parallel('agent/created', { agent: f.agents.get('synthetic-auto-child') } as never);
    assert.ok(f.store.reads.slice(reads).every(key => key === SHARED_KEY), 'Forged and child creation must not access protected grants');
    assert.equal(f.exchanges(), 0); assert.equal(f.redirects(), 0); assert.equal(f.store.records.size, 2);
  } finally { await f.dispose(); }
});

test('shared credential update restores every native root and global disconnect removes their access', async () => {
  const owner = fixture(); const f = fixture(owner.store, fakeProtection, new Context(), 'synthetic-watching-root');
  try {
    const forkId = 'synthetic-watching-fork';
    const fork = { id: forkId, session: { id: forkId,
      header: { id: forkId, createdAt: 2345678, isSeeded: true, parentSession: owner.agent.id },
    } };
    f.agents.set(forkId, fork); f.roots.add(forkId);
    await installAutoRestore(f.ctx, f.control);
    assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.control.status(forkId).connected, false);
    await login(owner);
    const grantKey = [...owner.store.records.keys()].find(key => key !== SHARED_KEY)!;
    await f.ctx.parallel('credentials/record-updated', grantKey);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.control.status(f.agent.id).connected, false, 'Only the shared pointer triggers auto restore');
    await f.ctx.parallel('credentials/record-updated', SHARED_KEY);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.control.status(f.agent.id).connected, true); assert.equal(f.control.status(forkId).connected, true);
    await f.execute();
    await owner.control.logout(owner.agent.id);
    await f.ctx.parallel('credentials/record-updated', SHARED_KEY);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.control.status(forkId).connected, false);
    await assert.rejects(f.execute()); await disconnected(owner.store);
    assert.equal(f.exchanges(), 0); assert.equal(f.redirects(), 0);
  } finally { await owner.dispose(); await f.dispose(); }
});

test('reconnecting the same Session creates a different protected source and stale deletion cannot erase it', async () => {
  const f = fixture(); const shared = createSharedConnections(f.store);
  try {
    await login(f);
    const previous = (await shared.read())!;
    assert.match(previous.owner, /^connection-[0-9a-f-]{36}$/); assert.notEqual(previous.owner, f.agent.id);
    const stale = createGrantStore(f.store, previous.owner, previous.createdAt, () => true, fakeProtection,
      () => shared.admit(previous));
    await f.control.logout(f.agent.id); await disconnected(f.store);
    await login(f);
    const current = (await shared.read())!;
    assert.notEqual(current.owner, previous.owner); assert.notEqual(current.connectionId, previous.connectionId);
    assert.equal(await shared.deactivate(previous.connectionId), undefined, 'Stale SDK invalidation must not cancel the replacement epoch');
    assert.deepEqual(await shared.read(), current);
    await assert.rejects(stale.read(), /Shared Guilduo connection is no longer active/);
    await stale.delete();
    assert.deepEqual(await shared.read(), current); assert.equal(f.store.records.size, 2);
    await f.execute(); assert.equal(f.control.status(f.agent.id).connected, true);
  } finally { await f.dispose(); }
});

test('OAuth stays unconnected and uncallable until the shared grant publication completes', { timeout: 3000 }, async () => {
  const f = fixture(); const entered = deferred(); const release = deferred();
  try {
    let url: URL | undefined;
    await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
    const modify = f.store.modifyRecord.bind(f.store);
    f.store.modifyRecord = async (key, mutate) => {
      if (key === SHARED_KEY) { entered.resolve(); await release.promise; }
      return modify(key, mutate);
    };
    const finishing = f.control.finish(f.agent.id,
      `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`);
    await entered.promise;
    try {
      assert.equal(f.control.status(f.agent.id).connected, false, 'The browser must keep polling while publication is pending');
      assert.equal(f.control.status(f.agent.id).scope, 'none');
      await assert.rejects(Promise.resolve().then(f.execute), /has not authenticated/);
    } finally { release.resolve(); await finishing; }
    assert.deepEqual(await f.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    await f.execute();
  } finally { release.resolve(); await f.dispose(); }
});

test('global logout between reconnect grant commit and shared publication removes the pending protected source', { timeout: 3000 }, async () => {
  const f = fixture(); const entered = deferred(); const release = deferred();
  try {
    await login(f); await f.control.logout(f.agent.id); await disconnected(f.store);
    let url: URL | undefined;
    await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
    const modify = f.store.modifyRecord.bind(f.store); let pause = true;
    f.store.modifyRecord = async (key, mutate) => {
      if (key === SHARED_KEY && pause) { pause = false; entered.resolve(); await release.promise; }
      return modify(key, mutate);
    };
    const finishing = assert.rejects(f.control.finish(f.agent.id,
      `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`));
    await entered.promise;
    assert.equal(f.store.records.size, 2, 'The replacement grant was committed before the shared pointer');
    await f.control.logout(f.agent.id);
    release.resolve(); await finishing;
    await disconnected(f.store);
    assert.equal(await f.control.restore(f.agent.id), false);
  } finally { release.resolve(); await f.dispose(); }
});

test('a different host global disconnect invalidates a pending login epoch even with no grant or an existing tombstone', { timeout: 3000 }, async () => {
  for (const initial of ['absent', 'disconnected']) {
    const f = fixture(); const other = fixture(f.store, fakeProtection, new Context(), 'synthetic-disconnecting-root');
    const shared = createSharedConnections(f.store);
    try {
      if (initial === 'disconnected') { await login(f); await f.control.logout(f.agent.id); }
      let url: URL | undefined;
      await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
      const before = await shared.read();
      await other.control.logout(other.agent.id);
      const cancelled = await shared.read();
      assert.equal(cancelled?.state, 'disconnected');
      assert.notEqual(cancelled?.connectionId, before?.connectionId, 'Global disconnect must advance the cancellation epoch');
      await assert.rejects(f.control.finish(f.agent.id,
        `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`));
      await disconnected(f.store);
      assert.deepEqual(await shared.read(), cancelled);
      assert.equal(f.control.status(f.agent.id).connected, false);
      assert.equal(await f.control.restore(f.agent.id), false);
    } finally { await f.dispose(); await other.dispose(); }
  }
});

test('finish rejects when the newly published shared connection cannot be restored', async () => {
  const f = fixture();
  try {
    let url: URL | undefined;
    await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
    let restores = 0;
    f.control.restore = async () => { restores++; return false; };
    await assert.rejects(f.control.finish(f.agent.id,
      `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`));
    assert.equal(restores, 1); assert.equal(f.control.status(f.agent.id).connected, false);
    assert.equal(f.exchanges(), 1);
  } finally { await f.dispose(); }
});

test('shared restore discovery timeout wins over a noncooperative client and permits a clean retry', { timeout: 3000 }, async t => {
  const first = fixture(); await login(first); await first.dispose();
  const f = fixture(first.store); const entered = deferred(); const release = deferred();
  try {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    f.onConnect(async () => { entered.resolve(); await release.promise; });
    const restoring = assert.rejects(f.control.restore(f.agent.id), /restoration timed out/);
    await entered.promise;
    t.mock.timers.tick(RESTORE_TIMEOUT_MS); await restoring;
    assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.control.status(f.agent.id).failed, true);
    assert.equal(f.store.records.size, 2, 'A discovery timeout must retain the protected shared grant');
    assert.equal(f.definitions.size, 0);
    f.onConnect(async () => {});
    const retry = f.control.restore(f.agent.id); release.resolve();
    assert.equal(await retry, true);
    assert.deepEqual(await f.status(), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    await f.execute(); assert.equal(f.exchanges(), 0); assert.equal(f.redirects(), 0);
  } finally { release.resolve(); t.mock.timers.reset(); await f.dispose(); }
});

test('plugin dispose during deferred shared publication discards the committed source without reviving login', { timeout: 3000 }, async () => {
  for (const mode of ['fresh', 'reconnect']) {
    const f = fixture(); const entered = deferred(); const release = deferred();
    try {
      if (mode === 'reconnect') { await login(f); await f.control.logout(f.agent.id); }
      const before = structuredClone([...f.store.records]);
      let url: URL | undefined;
      await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
      const modify = f.store.modifyRecord.bind(f.store); let pause = true;
      f.store.modifyRecord = async (key, mutate) => {
        if (key === SHARED_KEY && pause) { pause = false; entered.resolve(); await release.promise; }
        return modify(key, mutate);
      };
      const finishing = assert.rejects(f.control.finish(f.agent.id,
        `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`));
      await entered.promise;
      assert.equal(f.exchanges(), mode === 'fresh' ? 1 : 2);
      assert.equal(f.store.records.size, before.length + 1, 'The protected grant is saved before shared publication');
      await f.control.dispose();
      assert.deepEqual([...f.store.records], before, 'Dispose removes only the unpublished source');
      assert.equal(f.definitions.size, 0); assert.equal(f.control.status(f.agent.id).connected, false);
      release.resolve(); await finishing;
      assert.deepEqual([...f.store.records], before, 'Late publication must neither recreate the source nor activate global OAuth');
      const next = fixture(f.store);
      try { assert.equal(await next.control.restore(next.agent.id), false); assert.equal(next.redirects(), 0); }
      finally { await next.dispose(); }
    } finally { release.resolve(); await f.dispose(); }
  }
});

test('unpublished-source cleanup preserves the exact active published grant and its rotated credentials', async () => {
  const f = fixture(); const shared = createSharedConnections(f.store);
  try {
    await login(f);
    f.onCall(async () => { await f.provider().saveTokens({ access_token: 'ROTATED_ACCESS', refresh_token: 'ROTATED_REFRESH', token_type: 'Bearer' }); });
    await f.execute();
    const connection = (await shared.read())!; const before = structuredClone([...f.store.records]);
    await shared.discardUnpublished(connection.owner, connection.createdAt);
    assert.deepEqual([...f.store.records], before, 'A successfully published source must survive pending-login cleanup');
    await f.dispose();
    const next = fixture(f.store);
    try {
      assert.equal(await next.control.restore(next.agent.id), true);
      assert.equal((await next.provider().tokens())!.refresh_token, 'ROTATED_REFRESH');
    } finally { await next.dispose(); }
  } finally { await f.dispose(); }
});

test('cancelLogin after shared descriptor commit but before publication resolves retains the published source for another root', { timeout: 3000 }, async () => {
  for (const mode of ['fresh', 'reconnect']) {
    const f = fixture(); const other = fixture(f.store, fakeProtection, new Context(), 'synthetic-published-other-root');
    const written = deferred(); const release = deferred();
    try {
      if (mode === 'reconnect') { await login(f); await f.control.logout(f.agent.id); }
      let url: URL | undefined;
      await f.control.begin(f.agent.id, 'http://127.0.0.1:43123/callback', value => { url = value; });
      const modify = f.store.modifyRecord.bind(f.store); let pause = true;
      f.store.modifyRecord = async (key, mutate) => {
        const result = await modify(key, mutate);
        if (key === SHARED_KEY && pause) { pause = false; written.resolve(); await release.promise; }
        return result;
      };
      const finishing = Promise.allSettled([f.control.finish(f.agent.id,
        `http://127.0.0.1:43123/callback?state=${url!.searchParams.get('state')}&code=SYNTHETIC_CODE`)]);
      await written.promise;
      const published = (await createSharedConnections(f.store).read())!;
      assert.equal(published.state, 'active'); assert.equal(f.store.records.size, 2);
      const before = structuredClone([...f.store.records]);
      await f.control.cancelLogin(f.agent.id);
      assert.equal(f.control.status(f.agent.id).connected, false);
      assert.deepEqual([...f.store.records], before, 'Cancelling a pending caller must preserve an already published grant');
      assert.equal(await other.control.restore(other.agent.id), true);
      assert.equal((await other.provider().tokens())!.refresh_token, 'SYNTHETIC_REFRESH');
      await other.execute();
      release.resolve(); await finishing;
      assert.deepEqual(await createSharedConnections(f.store).read(), published);
      assert.equal(f.store.records.size, 2, 'Late publication completion must retain the published protected source');
      await other.control.release(other.agent.id);
      assert.equal(await other.control.restore(other.agent.id), true);
      assert.equal(other.exchanges(), 0); assert.equal(other.redirects(), 0);
    } finally { release.resolve(); await f.dispose(); await other.dispose(); }
  }
});

test('SDK refresh writes atomically and keeps a rotated token even if the following tool request fails', async () => {
  const f = fixture();
  try {
    await login(f);
    f.onCall(async () => {
      await f.provider().saveTokens({ access_token: 'ROTATED_ACCESS', refresh_token: 'ROTATED_REFRESH', token_type: 'Bearer', issuer: 'https://synthetic-issuer.invalid' });
      throw new Error('Synthetic MCP request failure after refresh');
    });
    await assert.rejects(f.execute(), /Guilduo could not complete this call/);
    await f.dispose();
    const restored = fixture(f.store);
    try { assert.equal(await restored.control.restore(restored.agent.id), true);
      assert.equal((await restored.provider().tokens())!.refresh_token, 'ROTATED_REFRESH');
    } finally { await restored.dispose(); }
  } finally { await f.dispose(); }
});

test('logout while refresh is in flight cannot resurrect its grant or admit a late result', async () => {
  const f = fixture(); const started = deferred(); const release = deferred();
  try {
    await login(f);
    f.onCall(async () => { started.resolve(); await release.promise;
      await f.provider().saveTokens({ access_token: 'LATE_ACCESS', token_type: 'Bearer' }); });
    const calling = assert.rejects(f.execute()); await started.promise;
    const loggingOut = f.control.logout(f.agent.id);
    release.resolve(); await calling; await loggingOut;
    await disconnected(f.store);
  } finally { release.resolve(); await f.dispose(); }
});

test('serialized grant operations reload the latest rotated refresh token for another admitted owner', async () => {
  const store = new MemoryStore(); const first = fixture(store); const second = fixture(store);
  const started = deferred(); const release = deferred(); let secondEntered = false;
  try {
    await login(first); assert.equal(await second.control.restore(second.agent.id), true);
    first.onCall(async () => { started.resolve(); await release.promise;
      await first.provider().saveTokens({ access_token: 'SERIAL_ACCESS', refresh_token: 'SERIAL_REFRESH', token_type: 'Bearer' }); });
    second.onCall(async () => { secondEntered = true; assert.equal((await second.provider().tokens())!.refresh_token, 'SERIAL_REFRESH'); });
    const a = first.execute(); await started.promise;
    const b = second.execute(); await Promise.resolve(); assert.equal(secondEntered, false);
    release.resolve(); await Promise.all([a, b]); assert.equal(secondEntered, true);
  } finally { release.resolve(); await first.dispose(); await second.dispose(); }
});

test('plugin unload drains an admitted refresh and retains the rotated grant for restart', async () => {
  const f = fixture(); const started = deferred(); const release = deferred();
  try {
    await login(f);
    f.onCall(async () => { started.resolve(); await release.promise;
      await f.provider().saveTokens({ access_token: 'UNLOAD_ROTATED_ACCESS', refresh_token: 'UNLOAD_ROTATED_REFRESH', token_type: 'Bearer' }); });
    const calling = f.execute(); await started.promise;
    const disposing = f.control.dispose(); release.resolve(); await calling; await disposing;
    await f.bridge.dispose(); assert.equal(f.store.records.size, 2);
    const next = fixture(f.store);
    try { assert.equal(await next.control.restore(next.agent.id), true);
      assert.equal((await next.provider().tokens())!.refresh_token, 'UNLOAD_ROTATED_REFRESH');
    } finally { await next.dispose(); }
  } finally { release.resolve(); await f.dispose(); }
});

test('SDK credential invalidation removes the durable grant instead of retrying stale tokens', async () => {
  const f = fixture();
  try {
    await login(f);
    f.onCall(async () => { await f.provider().invalidateCredentials!('all'); throw new Error('Synthetic refresh denial'); });
    await assert.rejects(f.execute()); await disconnected(f.store);
  } finally { await f.dispose(); }
});

test('legacy Session unload and missing persistence retain grants across restart until explicit logout', async () => {
  const f = fixture();
  try {
    await seedLegacy(f); assert.equal(await f.control.restore(f.agent.id), true);
    let shuttingDown = false;
    f.ctx.provide('sessionPersistence', { async stat() {
      if (shuttingDown) throw new Error('Synthetic backend shutdown');
      return { header: f.session.header };
    } });
    await f.control.sessionDisposed(f.agent.id); assert.equal(f.store.records.size, 1);
    assert.equal(await f.control.restore(f.agent.id), true);
    shuttingDown = true;
    await f.control.sessionDisposed(f.agent.id); assert.equal(f.store.records.size, 1);
    assert.equal(await f.control.restore(f.agent.id), true);
    await f.control.dispose(); await f.bridge.dispose(); assert.equal(f.store.records.size, 1);
  } finally { await f.dispose(); }
  const next = fixture(f.store);
  try {
    next.ctx.provide('sessionPersistence', { async stat() { return undefined; } });
    assert.equal(await next.control.restore(next.agent.id), true);
    const before = structuredClone([...next.store.records]);
    await next.control.sessionDisposed(next.agent.id);
    assert.equal(next.control.status(next.agent.id).connected, false);
    assert.deepEqual([...next.store.records], before, 'An invisible backend entry is not proof of user deletion');
    next.agents.delete(next.agent.id);
    await assert.rejects(next.control.restore(next.agent.id), /Exact live credential owner unavailable/);
    const restarted = fixture(next.store);
    try {
      assert.equal(await restarted.control.restore(restarted.agent.id), true);
      await restarted.execute();
      assert.equal(restarted.exchanges(), 0); assert.equal(restarted.redirects(), 0);
      await restarted.control.logout(restarted.agent.id); await disconnected(restarted.store);
      assert.equal(await restarted.control.restore(restarted.agent.id), false);
    } finally { await restarted.dispose(); }
  } finally { await next.dispose(); }
});

test('deleting the original shared Session retains global OAuth until another root explicitly logs out', async () => {
  const f = fixture(); const other = fixture(f.store, fakeProtection, new Context(), 'synthetic-surviving-root');
  try {
    await login(f);
    f.ctx.provide('sessionPersistence', { async stat() { return undefined; } });
    await f.control.sessionDisposed(f.agent.id);
    f.agents.delete(f.agent.id);
    assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.store.records.size, 2);
    assert.equal(await other.control.restore(other.agent.id), true); await other.execute();
    await other.control.logout(other.agent.id); await disconnected(f.store);
    assert.equal(await other.control.restore(other.agent.id), false);
  } finally { await f.dispose(); await other.dispose(); }
});

test('installed native Credentials synthetic file survives a fresh provider and refresh then deletes on logout',
  { timeout: 45000, skip: process.platform !== 'win32' }, async () => {
  const installedEntry = resolve(process.env.APPDATA!, 'npm/node_modules/@deepseek-ai/dsh/lib/bin.js');
  const installed = createRequire(installedEntry);
  assert.equal(installed('@deepseek-ai/dsh/package.json').version, '0.2.0-rc.2');
  const { Context: NativeContext } = await import(pathToFileURL(installed.resolve('@deepseek-ai/cordis')).href);
  const { LocalCredentialProvider } = await import(pathToFileURL(installed.resolve('@deepseek-ai/dsh-credentials-local')).href);
  const base = fileURLToPath(new URL('./', import.meta.url));
  const directory = await mkdtemp(join(base, '.persistence-fixture-'));
  const filename = join(directory, 'synthetic-credentials.yaml');
  const open = async () => {
    const ctx = new NativeContext();
    await ctx.plugin(LocalCredentialProvider, { path: filename, watch: false });
    return fixture(ctx.credentials as MemoryStore, windowsProtection, ctx as Context);
  };
  let f: ReturnType<typeof fixture> | undefined;
  try {
    f = await open(); await login(f); await f.dispose();
    assert.doesNotMatch(await readFile(filename, 'utf8'), /SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|synthetic-client|PKCE|callback/);
    f = await open(); assert.equal(await f.control.restore(f.agent.id), true);
    assert.equal(f.exchanges(), 0);
    let refreshes = 0;
    f.onCall(async () => {
      assert.equal(await auth(f!.provider(), { serverUrl: 'https://mcp.guilduo.com/mcp', fetchFn: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.href, 'https://synthetic-issuer.invalid/token', 'Restored SDK discovery stays bound to the original issuer');
        const params = new URLSearchParams(String(init?.body));
        assert.equal(params.get('grant_type'), 'refresh_token'); assert.equal(params.get('refresh_token'), 'SYNTHETIC_REFRESH');
        assert.equal(params.get('client_id'), 'synthetic-client'); assert.equal(params.get('resource'), 'https://mcp.guilduo.com/mcp');
        refreshes++;
        return new Response(JSON.stringify({ access_token: 'NATIVE_ROTATED_ACCESS', refresh_token: 'NATIVE_ROTATED_REFRESH', token_type: 'Bearer' }),
          { headers: { 'content-type': 'application/json' } });
      } }), 'AUTHORIZED');
    });
    await f.execute(); await f.dispose();
    assert.equal(refreshes, 1);
    f = await open(); assert.equal(await f.control.restore(f.agent.id), true);
    assert.equal((await f.provider().tokens())!.refresh_token, 'NATIVE_ROTATED_REFRESH');
    await f.control.logout(f.agent.id);
    const records = await (f.ctx.credentials as CredentialProvider).listRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].key, SHARED_KEY);
    assert.equal((await createSharedConnections(f.ctx.credentials).read())?.state, 'disconnected');
    assert.doesNotMatch(await readFile(filename, 'utf8'), /ciphertext|NATIVE_ROTATED/);
  } finally {
    await f?.dispose();
    assert.ok(directory.startsWith(join(base, '.persistence-fixture-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy explicit logout after Session memory detachment removes its grant without restoring first', async () => {
  const f = fixture();
  try {
    await seedLegacy(f); assert.equal(await f.control.restore(f.agent.id), true);
    await f.control.sessionDisposed(f.agent.id);
    assert.equal(f.control.status(f.agent.id).connected, false);
    assert.equal(f.store.records.size, 1, 'Memory detachment must retain the legacy grant');
    await f.control.logout(f.agent.id);
    assert.equal((await createSharedConnections(f.store).read())?.state, 'disconnected');
    assert.doesNotMatch(JSON.stringify([...f.store.records]), /ciphertext|SYNTHETIC_ACCESS|SYNTHETIC_REFRESH/);
    assert.equal(await f.control.restore(f.agent.id), false);
  } finally { await f.dispose(); }
});

test('old legacy logout preserves a different-birth source shared while its client close is pending', { timeout: 3000 }, async () => {
  const first = fixture(); const next = fixture(first.store);
  next.session.header.createdAt++;
  const entered = deferred(); const resume = deferred();
  const client = first.deps.client;
  first.deps.client = () => {
    const previous = client();
    return { ...previous, async close() { entered.resolve(); await resume.promise; await previous.close(); } };
  };
  let loggingOut: Promise<void> | undefined;
  try {
    await seedLegacy(first); assert.equal(await first.control.restore(first.agent.id), true);
    loggingOut = first.control.logout(first.agent.id); await entered.promise;
    first.agents.delete(first.agent.id);
    // The replacement host imports a legacy grant for the reused ID, then explicitly shares it.
    await seedLegacy(next); assert.equal(await next.control.restore(next.agent.id), true);
    await next.control.share(next.agent.id);
    const replacement = await createSharedConnections(next.store).read();
    assert.equal(replacement?.state, 'active');
    assert.equal(replacement?.createdAt, next.session.header.createdAt);
    await next.execute();
    const replacementRecords = structuredClone([...next.store.records]);
    resume.resolve(); await loggingOut;
    assert.deepEqual(await createSharedConnections(next.store).read(), replacement);
    assert.deepEqual([...next.store.records], replacementRecords, 'Old logout must preserve the replacement authentication bytes');
    await next.execute();
  } finally {
    resume.resolve(); await loggingOut?.catch(() => {});
    await first.dispose(); await next.dispose();
  }
});

test('legacy clear delayed after its atomic marker write preserves newly shared different-birth authentication bytes', { timeout: 3000 }, async () => {
  const first = fixture(); const next = fixture(first.store);
  next.session.header.createdAt++;
  const entered = deferred(); const resume = deferred();
  const modify = first.store.modifyRecord.bind(first.store);
  const remove = first.store.deleteRecord.bind(first.store);
  let clearing: Promise<void> | undefined; let grantDeletes = 0;
  try {
    await seedLegacy(first);
    const grantKey = [...first.store.records.keys()][0]!;
    first.store.modifyRecord = async (key, mutate) => {
      const result = await modify(key, mutate);
      if (key === grantKey && result?.kind === 'grant' && JSON.stringify(result.payload) === '{"discarded":true}') {
        entered.resolve(); await resume.promise;
      }
      return result;
    };
    first.store.deleteRecord = async key => {
      if (key === grantKey) grantDeletes++;
      await remove(key);
    };
    clearing = createGrantStore(first.store, first.agent.id, first.session.header.createdAt, () => true, fakeProtection).clear();
    // The file lock has been released, but the old clear's completion is delayed.
    await entered.promise;
    first.agents.delete(first.agent.id);
    await seedLegacy(next); assert.equal(await next.control.restore(next.agent.id), true);
    await next.control.share(next.agent.id);
    const replacement = await createSharedConnections(next.store).read();
    assert.equal(replacement?.state, 'active');
    assert.equal(replacement?.createdAt, next.session.header.createdAt);
    await next.execute();
    const replacementRecords = structuredClone([...next.store.records]);
    resume.resolve(); await clearing;
    assert.deepEqual(await createSharedConnections(next.store).read(), replacement);
    assert.deepEqual([...next.store.records], replacementRecords, 'Delayed legacy clear must preserve the replacement authentication bytes');
    assert.equal(grantDeletes, 0, 'Legacy clear must not physically delete a reused source key');
    await next.execute();
  } finally {
    resume.resolve(); await clearing?.catch(() => {});
    first.store.modifyRecord = modify;
    first.store.deleteRecord = remove;
    await first.dispose(); await next.dispose();
  }
});

test('legacy clear preserves different-birth authentication bytes when exact decoding rejects the source', async () => {
  const first = fixture(); const next = fixture(first.store);
  next.session.header.createdAt++;
  const stale = createGrantStore(first.store, first.agent.id, first.session.header.createdAt, () => true, fakeProtection);
  try {
    await seedLegacy(first);
    first.agents.delete(first.agent.id);
    await seedLegacy(next); assert.equal(await next.control.restore(next.agent.id), true);
    await next.execute();
    const replacementRecords = structuredClone([...next.store.records]);
    await stale.clear();
    assert.deepEqual([...next.store.records], replacementRecords, 'A decode birth mismatch must preserve the current authentication bytes');
    await next.execute();
  } finally { await first.dispose(); await next.dispose(); }
});
