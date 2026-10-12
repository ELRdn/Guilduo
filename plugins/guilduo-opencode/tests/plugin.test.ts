import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import type { Hooks, PluginInput } from '@opencode-ai/plugin';
import plugin from '../src/index.js';

const endpoint = 'https://mcp.guilduo.com/mcp';
async function fixture(t: TestContext, enabled = true) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'guilduo-opencode-test-')));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const prompts: unknown[] = [];
  let reads = 0;
  let data: Record<string, unknown> = { id: 'ses-test', directory: cwd };
  let beforeRead: (() => Promise<void>) | undefined;
  let fail = false;
  const input = { directory: cwd, client: { session: {
    get: async () => { reads++; await beforeRead?.(); if (fail) throw new Error('offline'); return { data }; },
    promptAsync: async (value: unknown) => { prompts.push(value); },
  } } } as unknown as PluginInput;
  const binding = { sessionId: 'ses-test', questId: 'quest-test', actingAgentId: 'agent-test', cwd };
  const hooks = await plugin(input, enabled ? { phaseSync: binding } : {});
  const call = async (key: keyof Hooks, value: unknown, output?: unknown) => {
    const handler = hooks[key] as ((value: unknown, output: unknown) => Promise<void>) | undefined;
    assert.ok(handler, key); await handler(value, output);
  };
  const event = async (type: string, properties: unknown) => call('event', { event: { type, properties } });
  const message = async (id = 'msg-user', overrides: Record<string, unknown> = {}, synthetic = false) =>
    call('chat.message', { sessionID: 'ses-test' }, { message: { id, agent: 'build', ...overrides }, parts: [{ type: 'text', text: 'work', synthetic }] });
  const complete = async (overrides: Record<string, unknown> = {}) => event('message.updated', {
    info: { sessionID: 'ses-test', role: 'assistant', parentID: 'msg-user', mode: 'build', path: { cwd }, finish: 'stop', time: { completed: 1 }, ...overrides },
  });
  const idle = async () => event('session.idle', { sessionID: 'ses-test' });
  await call('config', {});
  return { cwd, input, binding, call, event, message, complete, idle, prompts, get reads() { return reads; },
    setData: (value: Record<string, unknown>) => { data = value; },
    delay: (value: () => Promise<void>) => { beforeRead = value; }, offline: () => { fail = true; } };
}

test('native config preserves existing MCP, Skill paths and user commands', async t => {
  const f = await fixture(t, false);
  const config = { mcp: { other: { type: 'local', command: ['other'] }, alias: { type: 'remote', url: endpoint, enabled: false } },
    skills: { paths: ['user-skills'], urls: ['https://example.org/skills'] },
    command: { 'guilduo-sync-off': { template: 'user command' } } };
  await f.call('config', config); await f.call('config', config);
  assert.deepEqual(Object.keys(config.mcp), ['other', 'alias']);
  assert.equal(config.skills.paths.length, 2);
  assert.equal(config.skills.paths[0], 'user-skills');
  assert.deepEqual(config.skills.urls, ['https://example.org/skills']);
  assert.equal(config.command['guilduo-sync-off'].template, 'user command');
  const occupied = { mcp: { guilduo: { type: 'remote', url: 'https://example.org/mcp' } } };
  await f.call('config', occupied);
  assert.equal(occupied.mcp.guilduo.url, 'https://example.org/mcp');
});

test('default integration discovers OAuth MCP and guidance without any continuation or session reads', async t => {
  const f = await fixture(t, false);
  const config: { mcp?: unknown } = {};
  await f.call('config', config);
  assert.deepEqual(config.mcp, { guilduo: { type: 'remote', url: endpoint, enabled: true } });
  const output = { system: ['native instructions'] };
  await f.call('experimental.chat.system.transform', {}, output);
  await f.call('experimental.chat.system.transform', {}, output);
  assert.equal(output.system.length, 2);
  await f.message(); await f.complete(); await f.idle();
  assert.equal(f.reads, 0); assert.deepEqual(f.prompts, []);
});

test('binding must contain only exact identifiers and canonical cwd', async t => {
  const f = await fixture(t, false);
  for (const phaseSync of [{}, { ...f.binding, cwd: 'other' }, { ...f.binding, extra: true }, { ...f.binding, questId: '\nmalformed' }]) {
    await assert.rejects(plugin(f.input, { phaseSync }), /exact session/);
  }
});

test('a verified completed turn permits exactly one synthetic reminder and duplicates never rearm it', async t => {
  const f = await fixture(t);
  await f.message(); await f.idle(); assert.equal(f.reads, 0);
  await f.complete(); await Promise.all([f.idle(), f.idle()]);
  assert.equal(f.reads, 1); assert.equal(f.prompts.length, 1);
  const prompt = f.prompts[0] as { body: { parts: { synthetic: boolean; text: string }[] } };
  assert.equal(prompt.body.parts[0].synthetic, true);
  assert.match(prompt.body.parts[0].text, /quest-test, actingAgentId agent-test/);
  await f.message('msg-continuation', {}, true); await f.complete({ parentID: 'msg-continuation' }); await f.idle();
  await f.message(); await f.complete(); await f.idle();
  assert.equal(f.prompts.length, 1);
  await f.message('msg-next'); await f.complete({ parentID: 'msg-next' }); await f.idle();
  assert.equal(f.prompts.length, 2);
});

test('plan, read-only, disabled OAuth, failed or unfinished assistants do not start a check', async t => {
  for (const config of [ { permission: { edit: 'deny' } }, { agent: { build: { permission: { '*': 'deny' } } } },
    { mcp: { guilduo: { type: 'remote', url: endpoint, oauth: false } } },
    { mcp: { guilduo: { type: 'remote', url: endpoint, enabled: false } } } ]) {
    const f = await fixture(t); await f.call('config', config); await f.message(); await f.complete(); await f.idle();
    assert.equal(f.reads, 0);
  }
  for (const message of [{ agent: 'plan' }, { tools: { guilduo_update_quest: false } }]) {
    const f = await fixture(t); await f.message('msg-user', message); await f.complete(); await f.idle(); assert.equal(f.reads, 0);
  }
  for (const assistant of [{ error: { message: 'cancelled' } }, { mode: 'plan' }, { finish: 'tool-calls' },
    { time: {} }, { summary: true }, { parentID: 'other' }, { path: { cwd: 'other' } }]) {
    const f = await fixture(t); await f.message(); await f.complete(assistant); await f.idle(); assert.equal(f.prompts.length, 0);
  }
});

test('fork, cwd change, mismatched identity and live permission fences reject continuation', async t => {
  for (const patch of [{ parentID: 'ses-parent' }, { directory: tmpdir() }, { id: 'ses-other' },
    { agent: 'plan' }, { permission: [{ action: 'deny', permission: 'guilduo_update_quest', pattern: '*' }] }]) {
    const f = await fixture(t); f.setData({ id: 'ses-test', directory: f.cwd, ...patch });
    await f.message(); await f.complete(); await f.idle(); assert.equal(f.prompts.length, 0);
  }
});

test('revocation, deletion, compaction, errors and disposal invalidate pending work', async t => {
  for (const cancel of [async (f: Awaited<ReturnType<typeof fixture>>) => f.call('command.execute.before', { sessionID: 'ses-test', command: 'guilduo-sync-off' }),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.event('session.deleted', { info: { id: 'ses-test' } }),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.event('session.compacted', { sessionID: 'ses-test' }),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.event('session.error', { sessionID: 'ses-test' }),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.event('server.instance.disposed', {}),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.call('dispose', {})]) {
    const f = await fixture(t); await f.message(); await f.complete(); await cancel(f); await f.idle(); assert.equal(f.reads, 0);
  }
});

test('new input or revocation during metadata lookup invalidates the old check', async t => {
  for (const cancel of [async (f: Awaited<ReturnType<typeof fixture>>) => f.message('msg-new'),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.call('command.execute.before', { sessionID: 'ses-test', command: 'guilduo-sync-off' }),
    async (f: Awaited<ReturnType<typeof fixture>>) => f.call('config', { permission: 'deny' })]) {
    const f = await fixture(t); let release!: () => void;
    f.delay(() => new Promise<void>(resolve => { release = resolve; }));
    await f.message(); await f.complete(); const check = f.idle();
    await cancel(f); release(); await check; assert.equal(f.prompts.length, 0);
  }
});

test('unavailable host metadata is contained and never retried', async t => {
  const f = await fixture(t); f.offline(); await f.message(); await f.complete(); await f.idle(); await f.idle();
  assert.equal(f.reads, 1); assert.equal(f.prompts.length, 0);
});

test('custom native MCP aliases fence config, build, per-message tools and live session permissions', async t => {
  for (const alias of ['work', 'work.guilduo']) {
    const prefix = alias.replace(/[^a-zA-Z0-9_-]/g, '_');
    for (const fence of ['config', 'agent', 'tools', 'session']) {
      for (const suffix of ['*', 'update_quest']) {
        const f = await fixture(t);
        const key = `${prefix}_${suffix}`;
        const config = { mcp: { [alias]: { type: 'remote', url: endpoint } },
          ...(fence === 'config' ? { permission: { [key]: { '*': 'deny' } } } : {}),
          ...(fence === 'agent' ? { agent: { build: { permission: { [key]: 'deny' } } } } : {}) };
        await f.call('config', config);
        if (fence === 'session') f.setData({ id: 'ses-test', directory: f.cwd, permission: [{ permission: key, pattern: '*', action: 'deny' }] });
        await f.message('msg-user', fence === 'tools' ? { tools: { [`${prefix}_update_quest`]: false } } : {});
        await f.complete(); await f.idle();
        assert.equal(f.prompts.length, 0, `${alias}: ${fence} ${key}`);
      }
    }
    const f = await fixture(t);
    await f.call('config', { mcp: { [alias]: { type: 'remote', url: endpoint }, guilduo: { type: 'remote', url: 'https://example.org/mcp' } }, permission: { guilduo_update_quest: 'deny' } });
    await f.message('msg-user', { tools: { guilduo_update_quest: false } }); await f.complete(); await f.idle();
    assert.equal(f.prompts.length, 1, 'Unrelated guilduo key must not fence the official alias');
  }
});

test('sync-off is registered only for a binding and never intercepts user-owned commands or other sessions', async t => {
  const unbound = await fixture(t, false);
  const plain: { command?: unknown } = {};
  await unbound.call('config', plain);
  assert.equal(plain.command, undefined);
  assert.equal((await plugin(unbound.input))['command.execute.before'], undefined);
  for (const conflict of [true, false]) {
    const f = await fixture(t);
    const config = { command: conflict ? { 'guilduo-sync-off': { template: 'user command' } } : {} };
    await f.call('config', config); await f.call('config', config);
    if (!conflict) assert.match(config.command['guilduo-sync-off']!.template, /does not abort model execution/);
    await f.message(); await f.complete();
    await f.call('command.execute.before', { sessionID: conflict ? 'ses-test' : 'ses-other', command: 'guilduo-sync-off' });
    await f.idle(); assert.equal(f.prompts.length, 1);
    if (conflict) assert.equal(config.command['guilduo-sync-off']!.template, 'user command');
  }
  const f = await fixture(t);
  const config: { command?: Record<string, { template: string }> } = {};
  await f.call('config', config);
  config.command = { 'guilduo-sync-off': { template: 'later user command' } };
  await f.message(); await f.complete();
  await f.call('command.execute.before', { sessionID: 'ses-test', command: 'guilduo-sync-off' });
  await f.idle(); assert.equal(f.prompts.length, 1, 'A later command owner must not be intercepted');
});
