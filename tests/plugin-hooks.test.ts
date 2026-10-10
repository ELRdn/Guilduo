import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../plugins/questforge/hooks/lifecycle.mjs', import.meta.url));
const pluginRoot = dirname(dirname(script));
const configuration = JSON.parse(readFileSync(join(dirname(script), 'hooks.json'), 'utf8')) as {
  hooks: Record<string, { hooks: { type: string; command: string }[] }[]>;
};

function fixture(t: TestContext) {
  const temporaryParent = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryParent, 'guilduo-hooks-'));
  const cwd = join(root, 'workspace with spaces');
  const otherCwd = join(root, 'other');
  const data = join(root, 'plugin data');
  mkdirSync(cwd); mkdirSync(otherCwd);
  const env = { ...process.env, PLUGIN_ROOT: pluginRoot, PLUGIN_DATA: data };
  t.after(() => {
    // Verify the resolved deletion target remains inside this owned temp parent.
    const target = realpathSync(root);
    const contained = relative(temporaryParent, target);
    assert.ok(contained && contained !== '..' && !contained.startsWith(`..${sep}`) && !isAbsolute(contained));
    assert.equal(target, resolve(root));
    assert.ok(!lstatSync(root).isSymbolicLink());
    rmSync(target, { recursive: true, force: true });
  });
  const run = (args: string[], input?: string, workingDirectory = cwd, environment: NodeJS.ProcessEnv = env) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      input, cwd: workingDirectory, env: environment, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    return result;
  };
  const event = (hook_event_name: string, extra: Record<string, unknown> = {}) => JSON.stringify({
    hook_event_name, session_id: 'session-one', turn_id: 'turn-one', permission_mode: 'default', cwd, stop_hook_active: false,
    transcript_path: join(root, 'must-not-open-transcript'), ...extra,
  });
  const hook = (name: string, extra: Record<string, unknown> = {}, workingDirectory = cwd) => {
    const result = run([name, '--codex'], event(name, extra), workingDirectory);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout) as Record<string, unknown>;
  };
  const bind = (session = 'session-one', quest = 'quest-exact', agent = 'agent-exact', workingDirectory = cwd) => {
    const result = run(['bind', session, quest, agent, workingDirectory], undefined, workingDirectory);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { bound: true });
  };
  const bindingFile = (session = 'session-one') => join(data, 'guilduo-bindings', `${createHash('sha256').update(session).digest('hex')}.json`);
  return { root, cwd, otherCwd, data, env, run, event, hook, bind, bindingFile };
}

test('SessionStart gives exact literal CLI context without binding or opening transcripts', t => {
  const f = fixture(t);
  const output = f.hook('SessionStart') as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  const context = output.hookSpecificOutput.additionalContext;
  for (const literal of ['session-one', JSON.stringify(f.cwd), JSON.stringify(f.data), JSON.stringify(script), '"bind"', '"unbind"', 'explicit standing permission', 'read-only/unrelated']) {
    assert.ok(context.includes(literal), literal);
  }
  assert.equal(existsSync(f.data), false);
  assert.deepEqual(f.hook('Stop'), {});
  assert.equal(existsSync(join(f.root, 'must-not-open-transcript')), false);
});

test('SessionStart CLI metadata binds and unbinds from normal exec without plugin environment', t => {
  const f = fixture(t);
  const output = f.hook('SessionStart') as { hookSpecificOutput: { additionalContext: string } };
  const lines = output.hookSpecificOutput.additionalContext.split('\n');
  const argumentsFor = (prefix: string) => JSON.parse(lines.find(line => line.startsWith(prefix))!.slice(prefix.length)) as string[];
  const bindArgs = argumentsFor('Binding CLI literal arguments: ');
  const unbindArgs = argumentsFor('Unbind CLI literal arguments: ');
  assert.equal(bindArgs[0], script);
  assert.equal(bindArgs.at(-1), f.data);
  const normalEnv: NodeJS.ProcessEnv = { ...f.env };
  delete normalEnv.PLUGIN_DATA;
  delete normalEnv.PLUGIN_ROOT;
  bindArgs[3] = 'quest-verified'; bindArgs[4] = 'agent-verified';
  const bound = f.run(bindArgs.slice(1), undefined, f.cwd, normalEnv);
  assert.equal(bound.status, 0, bound.stderr);
  assert.deepEqual(JSON.parse(bound.stdout), { bound: true });
  assert.match(String(f.hook('Stop').reason), /"questId":"quest-verified","actingAgentId":"agent-verified"/);
  const unbound = f.run(unbindArgs.slice(1), undefined, f.cwd, normalEnv);
  assert.equal(unbound.status, 0, unbound.stderr);
  assert.deepEqual(f.hook('Stop'), {});
});

test('bindings isolate exact session, Quest, Agent, cwd and PLUGIN_DATA', t => {
  const f = fixture(t);
  f.bind();
  f.bind();
  f.bind('session-two', 'quest-two', 'agent-two');
  assert.deepEqual(JSON.parse(readFileSync(f.bindingFile(), 'utf8')), {
    session_id: 'session-one', questId: 'quest-exact', actingAgentId: 'agent-exact', cwd: realpathSync(f.cwd),
  });
  const stop = f.hook('Stop');
  assert.equal(stop.decision, 'block');
  assert.match(String(stop.reason), /"questId":"quest-exact","actingAgentId":"agent-exact"/);
  for (const phrase of ['meaningful phase', 'existing explicit standing permission', 'guilduo-workflows', 'connected Guilduo MCP', 'Read current', 'preview', 'concurrency', 'read-only', 'unrelated', 'revoked', 'no meaningful change', 'Never fake completion', 'unavailable', 'uncertain']) {
    assert.ok(String(stop.reason).toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
  assert.match(String(f.hook('Stop', { session_id: 'session-two' }).reason), /quest-two/);
  assert.deepEqual(f.hook('Stop', { session_id: 'session-three' }), {});
  assert.deepEqual(f.hook('Stop', { cwd: f.otherCwd }, f.otherCwd), {});
  assert.deepEqual(f.hook('Stop', { cwd: f.otherCwd }), {});
  const wrongUnbind = f.run(['unbind', 'session-one', f.otherCwd], undefined, f.otherCwd);
  assert.equal(wrongUnbind.status, 1);
  assert.equal(existsSync(f.bindingFile()), true);
  const move = f.run(['bind', 'session-one', 'quest-move', 'agent-move', f.otherCwd], undefined, f.otherCwd);
  assert.equal(move.status, 1);
  assert.equal(JSON.parse(readFileSync(f.bindingFile(), 'utf8')).questId, 'quest-exact');
  const separateData = f.run(['Stop'], f.event('Stop'), f.cwd, { ...f.env, PLUGIN_DATA: join(f.root, 'other-data') });
  assert.equal(separateData.status, 0);
  assert.deepEqual(JSON.parse(separateData.stdout), {});
  assert.deepEqual(readdirSync(join(f.data, 'guilduo-bindings')).sort(), [f.bindingFile(), f.bindingFile('session-two')].map(path => path.slice(path.lastIndexOf(sep) + 1)).sort());
});

test('recursion flag must be exactly false; unbind is isolated and idempotent', t => {
  const f = fixture(t);
  f.bind(); f.bind('session-two');
  for (const stop_hook_active of [true, 'false', 0, null, undefined]) {
    assert.deepEqual(f.hook('Stop', { stop_hook_active }), {});
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.run(['unbind', 'session-one', f.cwd]);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { bound: false });
  }
  assert.deepEqual(f.hook('Stop'), {});
  assert.equal(f.hook('Stop', { session_id: 'session-two' }).decision, 'block');
});

test('plan/read-only events and Muse subagent threads cannot trigger a phase reminder', t => {
  const f = fixture(t);
  f.bind();
  for (const extra of [{ permission_mode: 'plan' }, { permission_mode: 'read-only' }, { permission_mode: 'readonly' }, { read_only: true }, { plan_mode: true }]) {
    f.bind();
    assert.deepEqual(f.hook('Stop', extra), {});
  }
  const subagent = f.run(['Stop'], f.event('Stop'), f.cwd, { ...f.env, MUSE_THREAD_ID: 'another-thread' });
  assert.deepEqual(JSON.parse(subagent.stdout), {});
});

test('Claude and Muse storage/root aliases execute the common hook through the host shell', t => {
  const f = fixture(t);
  f.bind();
  for (const [rootName, dataName] of [['CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA'], ['MUSE_PLUGIN_ROOT', 'MUSE_PLUGIN_DATA_DIR']]) {
    const environment: NodeJS.ProcessEnv = { ...f.env, [rootName!]: resolve(dirname(script), '..'), [dataName!]: f.data };
    delete environment.PLUGIN_ROOT; delete environment.PLUGIN_DATA;
    const command = configuration.hooks.Stop![0]!.hooks[0]!.command;
    const result = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { input: f.event('Stop', { turn_id: rootName }), cwd: f.cwd, env: environment, encoding: 'utf8', timeout: 10000 })
      : spawnSync('/bin/sh', ['-c', command], { input: f.event('Stop', { turn_id: rootName }), cwd: f.cwd, env: environment, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).decision, 'block');
  }
});

test('malformed events, IDs, CLI arguments and paths fail without echoing input', t => {
  const f = fixture(t);
  const sentinel = 'PRIVATE_EVENT_SENTINEL';
  for (const input of ['', '{', 'null', '[]', JSON.stringify(sentinel), f.event('Other'), f.event('Stop', { session_id: '../escape' }), f.event('Stop', { session_id: 'x\\..\\escape' }), f.event('Stop', { session_id: sentinel + '\n' }), f.event('Stop', { cwd: 'relative' }), f.event('Stop', { cwd: join(f.cwd, '..', '..', sentinel) }), ' '.repeat(1024 * 1024 + 1)]) {
    const result = f.run(['Stop'], input);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{}\n');
    assert.equal(result.stderr, '');
  }
  for (const args of [[], ['other', sentinel], ['bind'], ['bind', '../escape', 'quest', 'agent', f.cwd], ['bind', 'session', 'quest/../escape', 'agent', f.cwd], ['bind', 'session', 'quest', 'agent\n' + sentinel, f.cwd], ['bind', 'session', 'quest', 'agent', 'relative'], ['bind', 'session', 'quest', 'agent', f.cwd, sentinel], ['unbind', 'session']]) {
    const result = f.run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Guilduo hook: invalid input or unavailable local binding storage.\n');
  }
  for (const PLUGIN_DATA of ['', 'relative', f.root + '/../../' + sentinel]) {
    const result = f.run(['bind', 'session', 'quest', 'agent', f.cwd], undefined, f.cwd, { ...f.env, PLUGIN_DATA });
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes(sentinel));
  }
  assert.equal(existsSync(f.data), false);
});

test('corrupt or swapped binding files never continue or delete another binding', t => {
  const f = fixture(t);
  f.bind();
  const original = readFileSync(f.bindingFile(), 'utf8');
  for (const content of ['{PRIVATE_SENTINEL', 'null', '[]', 'x'.repeat(4097), JSON.stringify({ ...JSON.parse(original), session_id: 'session-other' }), JSON.stringify({ ...JSON.parse(original), questId: '../escape' }), JSON.stringify({ ...JSON.parse(original), extra: 'private' })]) {
    writeFileSync(f.bindingFile(), content);
    assert.deepEqual(f.hook('Stop'), {});
    assert.equal(f.run(['unbind', 'session-one', f.cwd]).status, 1);
    assert.equal(existsSync(f.bindingFile()), true);
  }
});

test('junction and symlink escapes are rejected without touching targets', t => {
  const f = fixture(t);
  const outside = join(f.root, 'outside');
  mkdirSync(outside); mkdirSync(f.data);
  const directory = join(f.data, 'guilduo-bindings');
  symlinkSync(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => { if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) unlinkSync(directory); });
  assert.equal(f.run(['bind', 'session-one', 'quest', 'agent', f.cwd]).status, 1);
  assert.deepEqual(f.hook('Stop'), {});
  assert.deepEqual(readdirSync(outside), []);
  unlinkSync(directory);
  f.bind();
  const file = f.bindingFile();
  const marker = join(outside, 'binding.json');
  writeFileSync(marker, readFileSync(file));
  unlinkSync(file);
  // Directory links work without Windows Developer Mode, including at the file path.
  symlinkSync(outside, file, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => { if (existsSync(file) && lstatSync(file).isSymbolicLink()) unlinkSync(file); });
  assert.deepEqual(f.hook('Stop'), {});
  assert.equal(f.run(['unbind', 'session-one', f.cwd]).status, 1);
  assert.equal(f.run(['bind', 'session-one', 'quest', 'agent', f.cwd]).status, 1);
  assert.equal(existsSync(marker), true);
  unlinkSync(file);
  rmdirSync(directory);
  rmdirSync(f.data);
  symlinkSync(outside, f.data, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => { if (existsSync(f.data) && lstatSync(f.data).isSymbolicLink()) unlinkSync(f.data); });
  assert.equal(f.run(['bind', 'session-one', 'quest', 'agent', f.cwd]).status, 1);
  assert.deepEqual(readdirSync(outside), ['binding.json']);
});

test('bundled command handlers run through the actual host shell with stdin', t => {
  const f = fixture(t);
  f.bind();
  for (const name of ['SessionStart', 'Stop']) {
    const handler = configuration.hooks[name]![0]!.hooks[0]!;
    assert.equal(handler.type, 'command');
    const result = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', handler.command], { input: f.event(name), cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 10_000 })
      : spawnSync('/bin/sh', ['-c', handler.command], { input: f.event(name), cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 10_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout);
    assert.equal(name === 'Stop' ? output.decision : output.hookSpecificOutput.hookEventName, name === 'Stop' ? 'block' : 'SessionStart');
  }
});

test('Codex receipts are exclusive across concurrent Stops and survive rebinding and cwd changes', async t => {
  const f = fixture(t);
  f.bind();
  const stops = await Promise.all(Array.from({ length: 8 }, () => new Promise<Record<string, unknown>>((resolveOutput, reject) => {
    const child = spawn(process.execPath, [script, 'Stop', '--codex'], { cwd: f.cwd, env: f.env, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      try { assert.equal(code, 0); assert.equal(stderr, ''); resolveOutput(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.end(f.event('Stop'));
  })));
  assert.equal(stops.filter(output => output.decision === 'block').length, 1);
  const key = createHash('sha256').update(JSON.stringify(['session-one', 'turn-one'])).digest('hex');
  const receipt = join(f.data, 'guilduo-receipts', `${key}.json`);
  assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), { session_id: 'session-one', turn_id: 'turn-one' });
  assert.equal(f.run(['unbind', 'session-one', f.cwd]).status, 0);
  f.bind('session-one', 'quest-changed', 'agent-changed', f.otherCwd);
  assert.deepEqual(f.hook('Stop', { cwd: f.otherCwd }, f.otherCwd), {});
  assert.equal(f.hook('Stop', { cwd: f.otherCwd, turn_id: 'next-turn' }, f.otherCwd).decision, 'block');
  assert.equal(existsSync(receipt), true);
});

test('Codex missing mode/turn, unsafe events and Interrupt fail closed without affecting legacy hosts', t => {
  const f = fixture(t);
  for (const extra of [{ turn_id: undefined }, { permission_mode: undefined }, { permission_mode: 'unknown' },
    { permission_revoked: true }, { interrupted: true }, { source: 'fork' }, { parent_session_id: 'parent' }, { forked_from: 'parent' }]) {
    f.bind();
    assert.deepEqual(f.hook('Stop', extra), {});
  }
  f.bind();
  assert.deepEqual(f.hook('SessionStart', { permission_mode: undefined }), {});
  assert.equal(existsSync(f.bindingFile()), false);
  f.bind();
  assert.deepEqual(f.hook('Interrupt'), {});
  assert.equal(existsSync(f.bindingFile()), false);
  f.bind();
  assert.deepEqual(f.hook('Stop'), {});
  const legacyEvent = f.event('Stop', { turn_id: undefined, permission_mode: undefined });
  for (const dataName of ['CLAUDE_PLUGIN_DATA', 'MUSE_PLUGIN_DATA_DIR']) {
    const env: NodeJS.ProcessEnv = { ...f.env, [dataName]: f.data }; delete env.PLUGIN_DATA;
    assert.equal(JSON.parse(f.run(['Stop'], legacyEvent, f.cwd, env).stdout).decision, 'block');
    assert.equal(JSON.parse(f.run(['Stop'], legacyEvent, f.cwd, env).stdout).decision, 'block');
    assert.deepEqual(JSON.parse(f.run(['Interrupt'], f.event('Interrupt'), f.cwd, env).stdout), {});
    assert.equal(existsSync(f.bindingFile()), true);
    const context = JSON.parse(f.run(['SessionStart'], f.event('SessionStart', { permission_mode: undefined }), f.cwd, env).stdout);
    assert.ok(!context.hookSpecificOutput.additionalContext.includes('turn_id'));
  }
});

test('Codex receipt hardlinks and linked directories never overwrite or escape storage', t => {
  const f = fixture(t);
  f.bind();
  const outside = join(f.root, 'outside'); mkdirSync(outside);
  const receipts = join(f.data, 'guilduo-receipts');
  symlinkSync(outside, receipts, process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(f.hook('Stop'), {});
  assert.deepEqual(readdirSync(outside), []);
  unlinkSync(receipts); mkdirSync(receipts);
  const key = createHash('sha256').update(JSON.stringify(['session-one', 'turn-one'])).digest('hex');
  const marker = join(outside, 'marker'); writeFileSync(marker, 'private marker');
  const receipt = join(receipts, `${key}.json`); linkSync(marker, receipt);
  assert.deepEqual(f.hook('Stop'), {});
  assert.equal(readFileSync(marker, 'utf8'), 'private marker');
  unlinkSync(receipt);
  symlinkSync(outside, receipt, process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(f.hook('Stop'), {});
  assert.deepEqual(readdirSync(outside), ['marker']);
  unlinkSync(receipt);
});
