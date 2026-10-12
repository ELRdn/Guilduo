import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import test, { type TestContext } from 'node:test';
import phaseSync, { type SyncAPI, type SyncContext } from '../plugins/questforge/pi/phase-sync.ts';

function fixture(t: TestContext) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'guilduo-pi-'));
  const cwd = join(root, 'workspace with spaces');
  const other = join(root, 'other');
  mkdirSync(cwd); mkdirSync(other);
  t.after(() => {
    const target = realpathSync(root);
    const inside = relative(parent, target);
    assert.ok(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside));
    rmSync(target, { recursive: true, force: true });
  });
  const records: { type: string; customType: string; data: unknown }[] = [];
  const notices: string[] = [];
  let sessionId = 'session-one';
  let storageFails = false;
  const ctx: SyncContext = {
    mode: 'tui', cwd: realpathSync(cwd), isIdle: () => true, isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => sessionId, getBranch: () => records },
    ui: { notify: (message) => { notices.push(message); } },
  };
  type Handler = (event: never, ctx: SyncContext) => unknown;
  let handlers = new Map<string, Handler>();
  let command: (args: string, context: SyncContext) => Promise<void>;
  const api: SyncAPI = {
    on(event, handler) { handlers.set(event, handler as Handler); },
    registerCommand(name, options) { assert.equal(name, 'guilduo-sync'); command = options.handler; },
    appendEntry(customType, data) {
      if (storageFails) throw new Error('Unavailable session storage');
      records.push({ type: 'custom', customType, data });
    },
  };
  const emit = (name: string, event: object = {}) => handlers.get(name)?.(event as never, ctx);
  const load = (reason = 'startup') => {
    handlers = new Map();
    phaseSync(api);
    emit('session_start', { reason });
  };
  const bind = (ids = [sessionId, 'quest-exact', 'agent-exact', realpathSync(cwd)]) =>
    command(`bind ${JSON.stringify(ids)}`, ctx);
  const input = (source = 'interactive') => emit('input', { source });
  const settle = (outcome = 'completed', entries: unknown[] = []) => {
    const result = emit('agent_before_settle', { outcome, entries });
    return { result, entries };
  };
  load();
  return { ctx, records, notices, load, bind, input, settle, emit, other,
    command: (args: string) => command(args, ctx),
    setSessionId: (value: string) => { sessionId = value; },
    failStorage: () => { storageFails = true; },
  };
}

test('Pi reminder requires exact binding and interactive input; consumption precedes one continuation', async t => {
  const f = fixture(t);
  f.input();
  assert.equal(f.settle().result, undefined);
  await f.bind();
  assert.equal(f.settle().result, undefined);
  for (const source of ['rpc', 'extension']) {
    f.input(source);
    assert.equal(f.settle().result, undefined);
  }
  f.input();
  const prior = { type: 'custom', customType: 'other-extension', data: { retained: true } };
  const first = f.settle('completed', [prior]);
  assert.deepEqual(first.result, { continue: true });
  assert.equal(first.entries[0], prior);
  assert.equal(first.entries.length, 2);
  const reminder = first.entries[1] as { content: string };
  assert.match(reminder.content, /quest-exact, actingAgentId agent-exact/);
  assert.match(reminder.content, /Plan Mode\/read-only\/revocation/);
  assert.match(reminder.content, /expectedUpdatedAt/);
  assert.equal((f.records.at(-1)?.data as { state: string }).state, 'consumed');
  f.emit('agent_start'); // Native continuation must not reset the input budget.
  f.input('extension');
  assert.equal(f.settle().result, undefined);
  f.input();
  assert.deepEqual(f.settle().result, { continue: true });
  assert.equal(f.settle().result, undefined);
});

test('reload restores exact binding metadata but never restores an armed or consumed input budget', async t => {
  const f = fixture(t);
  await f.bind();
  f.input();
  f.load('reload');
  assert.equal(f.settle().result, undefined);
  f.input();
  assert.deepEqual(f.settle().result, { continue: true });
  f.load('startup');
  assert.equal(f.settle().result, undefined);
  // Non-plugin metadata and messages must not be read or interpreted as instructions.
  f.records.push({ type: 'message', customType: 'irrelevant', get data() { throw new Error('Transcript read'); } });
  f.load('reload');
  f.input();
  assert.deepEqual(f.settle().result, { continue: true });
});

test('reload rejects a valid turn receipt whose scope differs from its binding', async t => {
  for (const field of ['sessionId', 'questId', 'actingAgentId', 'cwd']) {
    const f = fixture(t);
    await f.bind();
    f.input();
    const receipt = f.records.at(-1)?.data as Record<string, unknown>;
    f.records.push({ type: 'custom', customType: 'guilduo-phase-sync-v1',
      data: { ...receipt, [field]: field === 'cwd' ? realpathSync(f.other) : 'different-scope' } });
    f.load('reload'); f.input();
    assert.equal(f.settle().result, undefined, field);
  }
});

test('resume, fork, session tree and cwd changes invalidate binding and require explicit rebind', async t => {
  for (const reason of ['resume', 'fork', 'new']) {
    const f = fixture(t);
    await f.bind(); f.input(); f.load(reason); f.input();
    assert.equal(f.settle().result, undefined, reason);
    await f.bind(); f.input();
    assert.deepEqual(f.settle().result, { continue: true });
  }
  const f = fixture(t);
  await f.bind(); f.input(); f.emit('session_tree'); f.input();
  assert.equal(f.settle().result, undefined);
  const originalCwd = f.ctx.cwd;
  await f.bind(); f.input(); f.ctx.cwd = f.other;
  assert.equal(f.settle().result, undefined);
  f.ctx.cwd = originalCwd;
  f.input();
  assert.equal(f.settle().result, undefined);
  await f.bind(); f.input(); f.setSessionId('forked-session'); f.load('startup'); f.input();
  assert.equal(f.settle().result, undefined);
});

test('revocation/read-only/plan, abort and error consume or disable reminders', async t => {
  for (const action of ['off', 'unbind', 'readonly', 'plan']) {
    const f = fixture(t);
    await f.bind(); f.input(); await f.command(action); f.input();
    assert.equal(f.settle().result, undefined, action);
    f.load('reload'); f.input();
    assert.equal(f.settle().result, undefined);
  }
  for (const outcome of ['aborted', 'error']) {
    const f = fixture(t);
    await f.bind(); f.input();
    assert.equal(f.settle(outcome).result, undefined);
    assert.equal(f.settle().result, undefined);
  }
  const f = fixture(t);
  await f.bind(); f.input();
  f.ctx.signal = AbortSignal.abort();
  assert.equal(f.settle().result, undefined);
  f.ctx.signal = undefined;
  assert.equal(f.settle().result, undefined);
});

test('invalid replacement, unavailable storage, untrusted projects and non-TUI mode fail closed', async t => {
  const f = fixture(t);
  await f.bind(); f.input();
  await f.bind(['wrong-session', 'quest-exact', 'agent-exact', f.ctx.cwd]);
  f.input(); assert.equal(f.settle().result, undefined);
  await f.bind(); f.input(); f.failStorage();
  assert.equal(f.settle().result, undefined);
  f.input(); assert.equal(f.settle().result, undefined);
  for (const mode of ['rpc', 'print']) {
    const blocked = fixture(t);
    blocked.ctx.mode = mode;
    await blocked.bind(); blocked.input();
    assert.equal(blocked.settle().result, undefined);
  }
  const untrusted = fixture(t);
  untrusted.ctx.isProjectTrusted = () => false;
  await untrusted.bind(); untrusted.input();
  assert.equal(untrusted.settle().result, undefined);
  const invalidMetadata = fixture(t);
  await invalidMetadata.bind();
  invalidMetadata.records.push({ type: 'custom', customType: 'guilduo-phase-sync-v1',
    data: { version: 1, kind: 'turn', turnId: 'invalid-receipt' } });
  invalidMetadata.load('reload'); invalidMetadata.input();
  assert.equal(invalidMetadata.settle().result, undefined);
});
