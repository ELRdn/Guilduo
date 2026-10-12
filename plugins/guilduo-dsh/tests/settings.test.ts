import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session';
import { auth } from '@modelcontextprotocol/client';
import { createHostControl } from '../src/index.js';
import { createSettingsBridge } from '../src/settings.js';
import type { Dependencies } from '../src/adapter.js';
import { createGrantStore, createSharedConnections, SHARED_KEY } from '../src/persistence.js';
import type { Protection } from '../src/persistence.js';

const protection: Protection = {
  async protect(value, owner) { return JSON.stringify({ owner, value }); },
  async unprotect(value, owner) { const parsed = JSON.parse(value); assert.equal(parsed.owner, owner); return parsed.value; },
};

function fixture(timeout = 5000) {
  const ctx = new Context(); const operator = {};
  const id = SessionId('session-A');
  const agent = { id, session: Session.create(id) } as Agent;
  const agents = new Map<string, Agent>([[agent.id, agent]]);
  const records = new Map<CredentialKey, CredentialRecord>();
  const credentials = {
    async readRecord(key: CredentialKey) { return structuredClone(records.get(key)); },
    async modifyRecord(key: CredentialKey, mutate: (record: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
      const next = await mutate(structuredClone(records.get(key)));
      if (next) records.set(key, structuredClone(next));
      return structuredClone(records.get(key));
    },
    async deleteRecord(key: CredentialKey) { records.delete(key); },
  };
  let redirect = ''; let finishes = 0; let resolve: (() => Promise<unknown>) | undefined;
  const registrations: unknown[] = [];
  ctx.provide('connection', { operator });
  ctx.provide('credentials', credentials);
  ctx.provide('agents', { get: (id: string) => agents.get(id), roots: () => [...agents.values()] });
  ctx.provide('sessions', { get: (id: string) => agents.get(id)?.session });
  ctx.provide('sessionController', { resolveAgent: async (id: string) =>
    resolve ? resolve() : agents.has(id) ? { agent: agents.get(id) } : { error: 'missing' } });
  ctx.provide('tools', { register(tool: unknown) { registrations.push(tool); return () => {}; } });
  const deps: Dependencies = {
    protection,
    async authorize(provider, options) {
      if (options.authorizationCode) {
        finishes++;
        await provider.saveTokens({ access_token: 'FIXTURE_SECRET', token_type: 'Bearer' });
        return 'AUTHORIZED';
      }
      redirect = String(provider.redirectUrl);
      await provider.saveCodeVerifier('FIXTURE_PKCE');
      const url = new URL('https://mcp.guilduo.com/oauth/authorize');
      url.searchParams.set('state', await provider.state!());
      await provider.redirectToAuthorization(url); return 'REDIRECT';
    },
    client: () => ({ async connect() {}, async close() {},
      async listTools() { return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] }; },
      async callTool() { return { content: [] }; } }),
    transport: () => ({ async start() {}, async send() {}, async close() {} }),
  };
  const control = createHostControl(ctx, deps);
  const bridge = createSettingsBridge(ctx, control, timeout);
  const call = (action: string, payload: unknown = { sessionId: agent.id }, peer: unknown = operator,
    signal = new AbortController().signal) => bridge.handle(`guilduo/${action}`, payload, signal, peer as never);
  return { ctx, agent, agents, bridge, control, call, registrations, credentials, records, deps,
    redirect: () => redirect, finishes: () => finishes,
    delayResolve: (value: () => Promise<unknown>) => { resolve = value; },
    async dispose() { await bridge.dispose(); await control.dispose(); await ctx.fiber.dispose(); } };
}
function http(url: string, options: { method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request(url, { ...options, agent: false }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', text => { body += text; });
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    }); req.on('error', reject); req.setTimeout(1000, () => req.destroy(new Error('fixture timeout'))); req.end();
  });
}
async function begin(f: ReturnType<typeof fixture>) {
  const result = await f.call('connect'); assert.equal(result.ok, true);
  const auth = new URL((result as { value: { authorizationUrl: string } }).value.authorizationUrl);
  const callback = new URL(f.redirect()); callback.searchParams.set('state', auth.searchParams.get('state')!);
  callback.searchParams.set('code', 'FIXTURE_CODE'); return callback;
}

test('settings admit only operator, exact payload and a live resolved Agent; no credential output', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call('connect', undefined, {})).ok, false);
    for (const payload of [null, [], {}, { sessionId: '' }, { sessionId: 12 },
      { sessionId: 'session-A', code: 'SECRET' }, { sessionId: 'fork-B' }]) {
      assert.equal((await f.call('connect', payload)).ok, false);
    }
    assert.equal(f.redirect(), '');
    const forkId = SessionId('synthetic-unconfigured-fork');
    const fork = { id: forkId, session: Session.create(forkId, [], {
      ...f.agent.session.header, id: forkId, parentSession: f.agent.id, isSeeded: true,
    }, SessionLogOffset(0)) } as Agent;
    f.agents.set(forkId, fork);
    assert.deepEqual(await f.call('status', { sessionId: forkId }),
      { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
    assert.equal(f.records.size, 0); assert.equal(f.registrations.length, 0); assert.equal(f.finishes(), 0);
    const callback = await begin(f);
    assert.equal((await f.call('connect')).ok, false);
    const response = await http(callback.href);
    assert.equal(response.status, 200); assert.match(response.body, /replaceState/);
    assert.match(String(response.headers['content-security-policy']), /sha256-/);
    assert.equal(response.headers['cache-control'], 'no-store');
    const status = await f.call('status');
    assert.deepEqual(status, { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    assert.doesNotMatch(JSON.stringify(status) + response.body, /FIXTURE_SECRET|FIXTURE_CODE|FIXTURE_PKCE/);
    assert.equal(f.finishes(), 1); assert.equal(f.registrations.length, 1);
    assert.deepEqual(await f.call('status', { sessionId: forkId }),
      { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    assert.deepEqual(await f.call('status', { sessionId: 'fork-B' }),
      { ok: true, value: { state: 'failed', tools: 0, scope: 'shared', canShare: false } });
    await f.call('disconnect'); assert.equal(f.control.status(f.agent.id).connected, false);
    assert.deepEqual(await f.call('status', { sessionId: forkId }),
      { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
    await assert.rejects(http(callback.href));
  } finally { await f.dispose(); }
});

test('callback rejects wrong host, method, path, state and duplicate params without consuming login', async () => {
  const f = fixture();
  try {
    const callback = await begin(f);
    for (const [url, options] of [
      [callback.href, { headers: { host: 'attacker.invalid' } }],
      [callback.href, { method: 'POST' }],
      [callback.href.replace('/callback?', '/other?'), {}],
      [callback.href.replace(/state=[^&]+/, 'state=wrong'), {}],
      [callback.href + '&code=duplicate', {}],
      [callback.href + '&state=duplicate', {}],
    ] as [string, Parameters<typeof http>[1]][]) assert.equal((await http(url, options)).status, 400);
    assert.equal(f.finishes(), 0);
    assert.equal((await http(callback.href)).status, 200);
    await assert.rejects(http(callback.href)); assert.equal(f.finishes(), 1);
  } finally { await f.dispose(); }
});

test('share, cancel and global disconnect require the exact operator and never return protected metadata', async () => {
  const f = fixture();
  try {
    await createGrantStore(f.credentials, f.agent.id, f.agent.session.header.createdAt, () => true, protection).save({
      tokens: { access_token: 'FIXTURE_SECRET', refresh_token: 'FIXTURE_REFRESH', token_type: 'Bearer' },
      clientInfo: { client_id: 'FIXTURE_CLIENT', client_secret: 'FIXTURE_CLIENT_SECRET' },
    });
    assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'connected', tools: 1, scope: 'session', canShare: true } });
    const before = structuredClone([...f.records]);
    for (const action of ['status', 'connect', 'share', 'cancel', 'disconnect']) {
      const denied = await f.call(action, undefined, {});
      assert.ok(!denied.ok && denied.error.code === 'guilduo/unauthorized', action);
      assert.deepEqual([...f.records], before, `${action} must not mutate credentials`);
    }
    for (const payload of [null, [], {}, { sessionId: f.agent.id, confirm: true }]) {
      assert.equal((await f.call('share', payload)).ok, false);
      assert.deepEqual([...f.records], before);
    }
    const shared = await f.call('share');
    assert.deepEqual(shared, { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    assert.doesNotMatch(JSON.stringify(shared), /FIXTURE_|ciphertext|clientInfo|tokens|connectionId|createdAt|owner/);
    assert.equal(f.finishes(), 0); assert.equal(f.redirect(), ''); assert.equal(f.records.size, 2);
    assert.equal((await f.call('share')).ok, false);
  } finally { await f.dispose(); }
});

test('cancel keeps connected global OAuth while disconnect from a different root logs every root out', async () => {
  const f = fixture();
  try {
    assert.equal((await http((await begin(f)).href)).status, 200);
    const id = SessionId('session-B'); const other = { id, session: Session.create(id) } as Agent;
    f.agents.set(id, other);
    const expected = { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } };
    assert.deepEqual(await f.call('status', { sessionId: id }), expected);
    const before = structuredClone([...f.records]);
    assert.deepEqual(await f.call('cancel'), expected);
    assert.deepEqual(await f.call('cancel', { sessionId: id }), expected);
    assert.deepEqual([...f.records], before);
    assert.deepEqual(await f.call('disconnect', { sessionId: id }),
      { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
    assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.control.status(id).connected, false);
    assert.equal(f.records.size, 1); assert.equal((await createSharedConnections(f.credentials).read())?.state, 'disconnected');
    assert.doesNotMatch(JSON.stringify([...f.records]), /FIXTURE_|ciphertext|PKCE|callback/);
    assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
    assert.equal(f.finishes(), 1);
  } finally { await f.dispose(); }
});

test('a stale connected Settings attempt permits reauthentication after external global logout, with or without a status poll', async () => {
  for (const poll of [false, true]) {
    const f = fixture();
    try {
      const callback = await begin(f); assert.equal((await http(callback.href)).status, 200);
      const previous = (await createSharedConnections(f.credentials).read())!;
      await f.control.logout(f.agent.id);
      assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.records.size, 1);
      if (poll) assert.deepEqual(await f.call('status'),
        { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } });
      const replacement = await begin(f);
      await assert.rejects(http(callback.href));
      assert.equal((await http(replacement.href)).status, 200);
      const current = (await createSharedConnections(f.credentials).read())!;
      assert.notEqual(current.connectionId, previous.connectionId); assert.notEqual(current.owner, previous.owner);
      const status = await f.call('status');
      assert.deepEqual(status, { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
      assert.doesNotMatch(JSON.stringify(status), /FIXTURE_|tokens|ciphertext|owner|connectionId/);
      assert.equal(f.records.size, 2); assert.equal(f.finishes(), 2); assert.equal(f.registrations.length, 1);
    } finally { await f.dispose(); }
  }
});

test('aborting share before publication or during the legacy grant read leaves the connection session-scoped', { timeout: 3000 }, async () => {
  for (const phase of ['before', 'during-read']) {
    const f = fixture(); const abort = new AbortController();
    const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
    try {
      await createGrantStore(f.credentials, f.agent.id, f.agent.session.header.createdAt, () => true, protection).save({
        tokens: { access_token: 'FIXTURE_SECRET', token_type: 'Bearer' },
      });
      await f.call('status');
      const before = structuredClone([...f.records]);
      const read = f.credentials.readRecord;
      if (phase === 'before') abort.abort();
      else f.credentials.readRecord = async key => {
        if (key !== SHARED_KEY) { entered.resolve(); await release.promise; }
        return read(key);
      };
      const sharing = f.call('share', undefined, undefined, abort.signal);
      if (phase === 'during-read') { await entered.promise; abort.abort(); release.resolve(); }
      assert.equal((await sharing).ok, false);
      assert.deepEqual([...f.records], before); assert.equal(f.records.has(SHARED_KEY), false);
      assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'connected', tools: 1, scope: 'session', canShare: true } });
      assert.equal(f.finishes(), 0); assert.equal(f.redirect(), '');
    } finally { release.resolve(); await f.dispose(); }
  }
});

test('cancellation and timeout of a fresh login leave legacy OAuth and an existing global tombstone intact', async () => {
  for (const mode of ['legacy-cancel', 'shared-timeout']) {
    const f = fixture(mode === 'shared-timeout' ? 40 : 5000);
    try {
      if (mode === 'legacy-cancel') {
        await createGrantStore(f.credentials, f.agent.id, f.agent.session.header.createdAt, () => true, protection).save({
          tokens: { access_token: 'FIXTURE_SECRET', token_type: 'Bearer' },
        });
      } else {
        assert.equal((await http((await begin(f)).href)).status, 200);
        await f.call('disconnect');
      }
      const before = structuredClone([...f.records]);
      const exchanges = f.finishes();
      const callback = await begin(f);
      if (mode === 'legacy-cancel') await f.call('cancel');
      else await new Promise(resolve => setTimeout(resolve, 70));
      await assert.rejects(http(callback.href));
      assert.equal(f.finishes(), exchanges); assert.deepEqual([...f.records], before);
      if (mode === 'legacy-cancel') {
        assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'connected', tools: 1, scope: 'session', canShare: true } });
      } else {
        assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'failed', tools: 0, scope: 'none', canShare: false } });
      }
    } finally { await f.dispose(); }
  }
});

test('denial, timeout, disconnect and session/Agent disposal clear credentials and close callback', async () => {
  for (const action of ['denial', 'timeout', 'cancel', 'disconnect', 'session', 'agent', 'dispose', 'replace']) {
    const f = fixture(action === 'timeout' ? 40 : 5000);
    try {
      const callback = await begin(f);
      if (action === 'denial') {
        callback.searchParams.delete('code'); callback.searchParams.set('error', 'access_denied');
        const response = await http(callback.href); assert.equal(response.status, 400);
        assert.match(response.body, /replaceState/);
      } else if (action === 'timeout') await new Promise(resolve => setTimeout(resolve, 70));
      else if (action === 'disconnect' || action === 'cancel') await f.call(action);
      else if (action === 'session') await f.ctx.parallel('session/disposed', { id: f.agent.id } as never);
      else if (action === 'agent') await f.ctx.parallel('agent/disposed', { agent: f.agent });
      else if (action === 'dispose') await f.bridge.dispose();
      else { f.agents.set(f.agent.id, { id: f.agent.id } as Agent); await f.call('status'); }
      await new Promise(resolve => setImmediate(resolve));
      await assert.rejects(http(callback.href));
      assert.equal(f.control.status(f.agent.id).connected, false); assert.equal(f.finishes(), 0);
      assert.equal(f.records.size, action === 'disconnect' ? 1 : 0, action);
      if (action === 'disconnect') {
        assert.equal((await createSharedConnections(f.credentials).read())?.state, 'disconnected');
        assert.doesNotMatch(JSON.stringify([...f.records]), /FIXTURE_|ciphertext|PKCE|callback/);
      }
    } finally { await f.dispose(); }
  }
});

test('disconnect/dispose/abort during session resolution prevents a late login', async () => {
  for (const action of ['cancel', 'disconnect', 'dispose', 'abort']) {
    const f = fixture(); const resolved = Promise.withResolvers<unknown>(); const abort = new AbortController();
    f.delayResolve(() => resolved.promise);
    try {
      const connecting = f.call('connect', undefined, undefined, abort.signal);
      if (action === 'disconnect' || action === 'cancel') await f.call(action);
      else if (action === 'dispose') await f.bridge.dispose();
      else abort.abort();
      resolved.resolve({ agent: f.agent });
      assert.equal((await connecting).ok, false); assert.equal(f.redirect(), '');
    } finally { await f.dispose(); }
  }
});

test('exchange failure returns safe scrubbed response and frees the attempt for retry', async () => {
  const f = fixture(); const original = f.control.finish;
  f.control.finish = async () => { throw new Error('secret error FIXTURE_SECRET'); };
  try {
    assert.equal((await http((await begin(f)).href)).status, 400);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'failed', tools: 0, scope: 'none', canShare: false } });
    f.control.finish = original;
    assert.equal((await http((await begin(f)).href)).status, 200);
  } finally { await f.dispose(); }
});

test('logout interrupting post-publication restore cannot produce a successful browser notification', async () => {
  const f = fixture(); const restore = f.control.restore; let interrupted = false;
  f.control.restore = async (...args) => {
    if (!interrupted) { interrupted = true; await f.control.logout(f.agent.id); }
    return restore(...args);
  };
  try {
    const response = await http((await begin(f)).href);
    assert.equal(response.status, 400); assert.match(response.body, /replaceState/);
    assert.doesNotMatch(response.body, /Guilduo connected|FIXTURE_|ciphertext|connectionId/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(interrupted, true); assert.equal(f.finishes(), 1); assert.equal(f.records.size, 1);
    assert.equal(f.control.status(f.agent.id).connected, false);
    assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'failed', tools: 0, scope: 'none', canShare: false } });
    f.control.restore = restore;
    assert.equal((await http((await begin(f)).href)).status, 200);
    assert.equal(f.finishes(), 2); assert.equal(f.records.size, 2);
  } finally { await f.dispose(); }
});

test('disconnect during authorization startup closes listener and cannot leave a late URL', async () => {
  const f = fixture(); const begun = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const original = f.control.begin;
  f.control.begin = async (...args) => { const result = await original(...args); begun.resolve(); await release.promise; return result; };
  try {
    const connecting = f.call('connect'); await begun.promise;
    await f.call('disconnect'); release.resolve();
    assert.equal((await connecting).ok, false);
    assert.equal(f.control.status(f.agent.id).connected, false);
    await assert.rejects(http(f.redirect()));
    f.control.begin = original;
    assert.equal((await http((await begin(f)).href)).status, 200);
  } finally { release.resolve(); await f.dispose(); }
});

test('SDK authorization startup timeout releases the busy state and its late completion cannot erase a replacement login', { timeout: 3000 }, async () => {
  const f = fixture(40); const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const settled = Promise.withResolvers<void>(); const authorize = f.deps.authorize;
  let redirect = ''; let timer: ReturnType<typeof setTimeout> | undefined;
  f.deps.authorize = async (...args) => {
    redirect = String(args[0].redirectUrl); entered.resolve(); await release.promise;
    try { return await authorize(...args); } finally { settled.resolve(); }
  };
  try {
    const connecting = f.call('connect'); await entered.promise;
    const result = await Promise.race([connecting, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Settings stayed busy after the SDK startup timeout')), 500);
    })]);
    clearTimeout(timer);
    assert.equal(result.ok, false); assert.equal(f.records.size, 0); assert.equal(f.finishes(), 0);
    await assert.rejects(http(redirect));
    f.deps.authorize = authorize;
    const callback = await begin(f);
    assert.equal((await http(callback.href)).status, 200);
    const before = structuredClone([...f.records]);
    release.resolve(); await settled.promise; await connecting;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([...f.records], before, 'Late SDK completion must not delete replacement credentials');
    assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'connected', tools: 1, scope: 'shared', canShare: false } });
    assert.equal(f.finishes(), 1);
  } finally { clearTimeout(timer); release.resolve(); await f.dispose(); }
});

test('login expiry aborts real SDK discovery through authFetch and permits reauthentication', { timeout: 3000 }, async t => {
  const f = fixture(40); const authorize = f.deps.authorize; const entered = Promise.withResolvers<AbortSignal>();
  const signals: AbortSignal[] = []; let redirect = ''; let timer: ReturnType<typeof setTimeout> | undefined;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(input).includes('.well-known/'), 'Only synthetic SDK metadata discovery is expected');
    const signal = init?.signal; assert.ok(signal); signals.push(signal); entered.resolve(signal);
    return new Promise<Response>((_, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  f.deps.authorize = (provider, options) => { redirect = String(provider.redirectUrl); return auth(provider, options); };
  try {
    const connecting = f.call('connect'); const signal = await entered.promise;
    assert.equal(signal.aborted, false);
    const result = await Promise.race([connecting, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Real SDK discovery did not expire')), 500);
    })]);
    clearTimeout(timer);
    assert.equal(result.ok, false); assert.ok(signals.every(signal => signal.aborted));
    assert.equal(f.records.size, 0); assert.equal(f.finishes(), 0);
    await assert.rejects(http(redirect));
    assert.deepEqual(await f.call('status'), { ok: true, value: { state: 'failed', tools: 0, scope: 'none', canShare: false } });
    f.deps.authorize = authorize;
    assert.equal((await http((await begin(f)).href)).status, 200);
    assert.equal(f.finishes(), 1); assert.equal(f.records.size, 2);
  } finally { clearTimeout(timer); await f.dispose(); }
});
