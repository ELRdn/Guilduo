// SPDX-License-Identifier: AGPL-3.0-only
// Installed code only. Never launch DSH or read an existing profile/credential/history.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

assert.ok(process.argv[2], 'Supply installed DSH lib/bin.js as resolver anchor; it is never executed');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const candidate = fileURLToPath(new URL('../', import.meta.url));
const artifacts = join(root, '.qa-artifacts/guilduo-dsh-lifetime-beta16');
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(join(artifacts, 'native-'));
const inside = path => {
  const part = relative(run, resolve(path));
  assert.ok(part && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`), 'Writes must stay in this new run');
  return path;
};
for (const name of ['home', 'tmp', 'appdata', 'local', 'config', 'cache', 'data']) await mkdir(inside(join(run, name)));
const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'SystemDrive', 'ComSpec', 'PATHEXT', 'windir'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, inherited);
Object.assign(process.env, {
  DSH_HOME: join(run, 'home/dsh'), HOME: join(run, 'home'), USERPROFILE: join(run, 'home'),
  APPDATA: join(run, 'appdata'), LOCALAPPDATA: join(run, 'local'), TEMP: join(run, 'tmp'), TMP: join(run, 'tmp'),
  XDG_CONFIG_HOME: join(run, 'config'), XDG_CACHE_HOME: join(run, 'cache'), XDG_DATA_HOME: join(run, 'data'),
});
let modelCalls = 0, networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw new Error('Network forbidden in synthetic lifetime fixture'); };
const hostRequire = createRequire(resolve(process.argv[2]));
const pluginRequire = createRequire(join(candidate, 'package.json'));
assert.equal(hostRequire('@deepseek-ai/dsh/package.json').version, '0.2.0-rc.2');
const load = name => import(pathToFileURL(hostRequire.resolve(`@deepseek-ai/${name}`)).href);
const hashes = {}, contracts = {}, results = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
hashes.harness = digest(await readFile(fileURLToPath(import.meta.url)));
for (const name of ['dsh-session', 'dsh-session-persistence', 'dsh-session-persistence-jsonl', 'dsh-agent', 'dsh-credentials-local']) {
  const manifestPath = hostRequire.resolve(`@deepseek-ai/${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.version, '0.2.0-rc.2');
  for (const file of [manifest.main, manifest.types]) {
    const path = resolve(dirname(manifestPath), file);
    hashes[`${name}/${file}`] = digest(await readFile(path));
  }
}
const { Context } = await load('cordis');
const { LocalCredentialProvider } = await load('dsh-credentials-local');
const sessionTypes = await load('dsh-session');
const { SessionId } = sessionTypes;
const { credentialKey } = await load('dsh-credentials');
const nativePlugins = await Promise.all(['dsh-agent', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm', 'dsh-agent-loop', 'dsh-session-persistence-jsonl'].map(load));
contracts.excerpts = [];
for (const [name, marker] of [
  ['dsh-session', 'detachEntered(entry) {'],
  ['dsh-session-persistence-jsonl', 'async stat(id, options) {'],
  ['dsh-session-persistence-jsonl', 'if (!materialized) this.pending.delete(handle.id);'],
  ['dsh-session-persistence', 'abstract stat(id: SessionId'],
]) {
  const manifestPath = hostRequire.resolve(`@deepseek-ai/${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const file = marker.startsWith('abstract') ? manifest.types : manifest.main;
  const source = await readFile(resolve(dirname(manifestPath), file), 'utf8');
  const at = source.indexOf(marker); assert.ok(at >= 0, `Reinspect native contract: ${marker}`);
  contracts.excerpts.push({ path: `${name}/${file}`, line: source.slice(0, at).split('\n').length, text: source.slice(at, at + 500) });
}
contracts.sessionDisposed = 'Memory detachment, also emitted by ordinary unload';
contracts.storageEmpty = 'Unmaterialized pending writer vanishes when closed; flushed header-only artifact survives';
const grantKey = owner => credentialKey('guilduo-dsh-oauth-poc', `session-${createHash('sha256').update(owner).digest('hex')}`);
const grant = { tokens: { access_token: 'SYNTHETIC_ACCESS', refresh_token: 'SYNTHETIC_REFRESH', token_type: 'Bearer' } };
const files = ['package.json', 'lib/index.js', 'lib/adapter.js', 'lib/persistence.js', 'lib/settings-gateway.js', 'lib/settings.js'];
const archive = resolve(process.argv[3] ?? join(root, '.qa-artifacts/guilduo-dsh/guilduo-dsh-oauth-poc-0.6.0-beta.14.tgz'));
hashes['beta14/archive'] = digest(await readFile(archive));
const versions = [];
for (const name of ['beta14', ...(process.argv.includes('--baseline-only') ? [] : ['candidate'])]) {
  const directory = inside(join(run, name));
  await mkdir(join(directory, 'lib'), { recursive: true });
  if (name === 'candidate') for (const file of ['src/index.ts', 'src/persistence.ts']) hashes[`candidate/${file}`] = digest(await readFile(join(candidate, file)));
  for (const file of files) {
    const bytes = name === 'beta14'
      ? (await promisify(execFile)('tar', ['-xOf', archive, `package/${file}`], { encoding: 'buffer', maxBuffer: 2_000_000 })).stdout
      : await readFile(join(candidate, file));
    hashes[`${name}/${file}`] = digest(bytes);
    await writeFile(inside(join(directory, file)), bytes, { flag: 'wx' });
  }
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(pathToFileURL(directory + sep).href) && !specifier.startsWith('.') && !specifier.startsWith('node:')) {
      return { url: pathToFileURL((specifier.startsWith('@deepseek-ai/') ? hostRequire : pluginRequire).resolve(specifier)).href, shortCircuit: true };
    }
    return next(specifier, context);
  } });
  try {
    const control = await import(pathToFileURL(join(directory, 'lib/index.js')).href);
    const persistence = await import(pathToFileURL(join(directory, 'lib/persistence.js')).href);
    const version = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).version;
    if (name === 'beta14') assert.equal(version, '0.6.0-beta.14');
    versions.push({ ...control, ...persistence, name, version });
  } finally { hooks.deregister(); }
}

const bounded = async (operation, label) => {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: 10000ms deadline`)), 10_000);
  })]); } finally { clearTimeout(timer); }
};
async function fixture(v, label, withBackend = true, storageDirectory) {
  const directory = inside(join(run, `${v.name}-${label}`));
  await mkdir(directory);
  const dataDirectory = inside(storageDirectory ?? directory);
  const ctx = new Context();
  const handles = [];
  let control, backendFiber;
  const events = [], tasks = [];
  try {
    await ctx.plugin(LocalCredentialProvider, { path: join(dataDirectory, 'synthetic-credentials.json'), watch: false });
    for (const p of nativePlugins.slice(0, 6)) await ctx.plugin(p.default);
    for (const method of ['stream', 'prepareCall']) ctx.llm[method] = () => { modelCalls++; throw new Error('Inference forbidden'); };
    await ctx.plugin(nativePlugins[6].default, { agents: [] });
    const mountBackend = async () => backendFiber = await ctx.plugin(nativePlugins[7].default, { root: join(dataDirectory, 'synthetic-sessions'), compression: 'none' });
    if (withBackend) await mountBackend();
    ctx.provide('skills', {});
    ctx.provide('sessionController', { async resolveAgent(id) {
      const agent = ctx.agents.get(id); return agent ? { agent } : { error: 'unavailable' };
    } });
    const dependencies = {
      protection: v.windowsProtection,
      async authorize() { throw new Error('OAuth login forbidden; seed synthetic grant directly'); },
      transport: () => ({ async start() {}, async send() {}, async close() {} }),
      client: () => ({ async connect() {}, async close() {},
        async listTools() { return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] }; },
        async callTool() { throw new Error('MCP calls forbidden in lifetime fixture'); } }),
    };
    await ctx.plugin({ inject: v.inject, apply(host) { control = v.createHostControl(host, dependencies); } });
    ctx.on('session/disposed', session => {
      events.push(session.id);
      // Native observers contain asynchronous listener failures. Await the captured work explicitly.
      const task = Promise.resolve().then(() => control.sessionDisposed(session.id));
      task.catch(() => {}); tasks.push(task); return task;
    });
    return { ctx, control, events, directory, mountBackend,
      async create(id, options = {}) {
        const handle = await ctx.agents.create({ sessionId: SessionId(`synthetic-${label}-${id}`), ...options });
        handles.push(handle); return handle.agent;
      },
      async resume(id) {
        const handle = await ctx.agents.resume({ resumeSessionId: SessionId(id) });
        handles.push(handle); return handle.agent;
      },
      async seed(agent) {
        await v.createGrantStore(ctx.credentials, agent.id, agent.session.header.createdAt, () => true, v.windowsProtection).save(grant);
        assert.equal(await control.restore(agent.id), true);
        assert.equal(control.status(agent.id).connected, true);
      },
      record: agent => ctx.credentials.readRecord(grantKey(agent.id)),
      async unload(agent) {
        const handle = handles.find(item => item.agent === agent);
        await handle.dispose();
        await bounded(Promise.all(tasks), 'disposed listener');
        assert.ok(events.includes(agent.id), 'Real registry disposal must deliver session/disposed');
        assert.equal(ctx.sessions.get(agent.id), undefined);
        assert.equal(ctx.agents.get(agent.id), undefined);
      },
      unloadBackend: () => backendFiber.dispose(),
      async dispose() {
        try { await control.dispose(); } finally {
          try { for (const handle of handles.reverse()) await handle.dispose(); await Promise.all(tasks); }
          finally { await ctx.fiber.dispose(); }
        }
      },
    };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
async function check(v, name, body) {
  try { const detail = await body(); results.push({ version: v.version, name, status: 'PASS', ...detail }); }
  catch (error) { results.push({ version: v.version, name, status: 'FAIL', error: String(error.stack ?? error) }); }
  console.log(`${results.at(-1).status} ${v.version} ${name}`);
  await writeFile(inside(join(run, 'evidence.json')), JSON.stringify({
    dsh: '0.2.0-rc.2', node: process.version, syntheticOnly: true, realCredentials: false, realProfiles: false,
    realHistory: false, modelCalls, networkCalls, hashes, contracts, results,
  }, null, 2));
}
for (const v of versions) {
  const baseline = v.name === 'beta14';
  for (const scenario of ['empty', 'late-backend', 'durable', 'backend-unloaded', 'no-backend']) {
    await check(v, `legacy-${scenario}-unload`, async () => {
      const f = await fixture(v, scenario, !['late-backend', 'no-backend'].includes(scenario));
      try {
        const agent = await f.create('owner');
        await f.seed(agent);
        if (scenario === 'late-backend') await f.mountBackend();
        const backend = f.ctx.get('sessionPersistence');
        contracts.statArgument = 'SessionId';
        contracts.sessionPathExport = typeof sessionTypes.SessionPath;
        if (backend) contracts.removeMethod = typeof backend.remove;
        if (scenario === 'durable') await f.ctx.sessions.flush(agent.session);
        const before = await backend?.stat(agent.id);
        if (scenario === 'empty') assert.ok(before, 'An unmaterialized writer is visible before close');
        if (scenario === 'empty') assert.equal(before.sizeBytes, undefined, 'Empty writer has no physical artifact yet');
        if (scenario === 'late-backend') assert.equal(before, undefined, 'Late backend has never stored the live session');
        if (scenario === 'backend-unloaded') { await f.unloadBackend(); assert.equal(f.ctx.get('sessionPersistence'), undefined); }
        await f.unload(agent);
        const after = scenario === 'backend-unloaded' ? undefined : await backend?.stat(agent.id);
        const retained = !!await f.record(agent);
        const deletionExpected = baseline && ['empty', 'late-backend'].includes(scenario);
        assert.equal(retained, !deletionExpected, 'Only old baseline may erase an invisible ordinary session grant');
        if (['empty', 'late-backend'].includes(scenario)) assert.equal(after, undefined);
        if (scenario === 'durable') assert.ok(after, 'Unload must keep explicitly flushed header-only storage');
        return { beforeVisible: !!before, afterVisible: !!after, grantRetained: retained, oldGrantLossReproduced: deletionExpected };
      } finally { await f.dispose(); }
    });
  }
  await check(v, 'durable-grant-reload-and-session-resume', async () => {
    const first = await fixture(v, 'restart-source');
    let source;
    try {
      source = await first.create('owner'); await first.seed(source);
      await first.ctx.sessions.flush(source.session); await first.unload(source);
      assert.ok(await first.record(source));
    } finally { await first.dispose(); }
    const second = await fixture(v, 'restart-reader', true, first.directory);
    try {
      const resumed = await second.resume(source.id);
      assert.equal(resumed.session.header.createdAt, source.session.header.createdAt);
      assert.equal(await second.control.restore(resumed.id), true);
      assert.equal(second.control.status(resumed.id).connected, true);
      return { freshNativeCredentialProvider: true, freshNativeBackend: true, resumedExactOwner: true };
    } finally { await second.dispose(); }
  });
  await check(v, 'legacy-explicit-logout', async () => {
    const f = await fixture(v, 'legacy-logout');
    try {
      const agent = await f.create('owner'); await f.seed(agent);
      await f.control.logout(agent.id);
      const record = await f.record(agent);
      const retained = !!record;
      if (baseline) assert.equal(retained, true, 'Historical logout leaves the legacy ciphertext record');
      else {
        assert.doesNotMatch(JSON.stringify(record ?? null), /ciphertext|SYNTHETIC_ACCESS|SYNTHETIC_REFRESH/, 'Fixed logout must clear legacy secrets even when an empty marker remains');
        assert.doesNotMatch(await readFile(join(f.directory, 'synthetic-credentials.json'), 'utf8'), /ciphertext|SYNTHETIC_ACCESS|SYNTHETIC_REFRESH/, 'Native persistence must contain no legacy ciphertext after logout');
        assert.equal(await f.control.restore(agent.id), false, 'Disconnected legacy owner cannot restore');
      }
      assert.equal((await v.createSharedConnections(f.ctx.credentials).read()).state, 'disconnected');
      assert.equal(f.control.status(agent.id).connected, false);
      return { grantRetained: retained, ciphertextPresent: typeof record?.payload?.ciphertext === 'string',
        restoreRejected: !baseline, oldCiphertextResidualReproduced: baseline };
    } finally { await f.dispose(); }
  });
  await check(v, 'shared-source-unload-restore-and-explicit-logout', async () => {
    const f = await fixture(v, 'shared');
    try {
      const source = await f.create('source'); await f.seed(source); await f.control.share(source.id);
      const shared = v.createSharedConnections(f.ctx.credentials);
      const descriptor = await shared.read(); assert.equal(descriptor.state, 'active');
      const consumer = await f.create('consumer'); assert.equal(await f.control.restore(consumer.id), true);
      await f.unload(source);
      assert.ok(await f.record(source), 'Shared source must survive source session unload');
      assert.deepEqual(await shared.read(), descriptor);
      assert.equal(f.control.status(consumer.id).connected, true);
      await f.control.release(consumer.id); assert.equal(await f.control.restore(consumer.id), true);
      await f.control.logout(consumer.id);
      assert.equal(await f.record(source), undefined, 'Global explicit logout removes shared source ciphertext');
      assert.equal((await shared.read()).state, 'disconnected');
      return { sourceRetainedAfterUnload: true, restoredConsumer: true, explicitLogoutDeletedSource: true };
    } finally { await f.dispose(); }
  });
}
const corrected = versions.find(v => v.name === 'candidate');
if (corrected) await check(corrected, 'snapshot-matches-current-build-and-source', async () => {
  for (const file of [...files, 'src/index.ts', 'src/persistence.ts']) assert.equal(digest(await readFile(join(candidate, file))), hashes[`candidate/${file}`], `Candidate changed during execution: ${file}`);
  return { candidateMatchesCurrentBuild: true, candidateIndexSha256: hashes['candidate/lib/index.js'], candidatePersistenceSha256: hashes['candidate/lib/persistence.js'] };
});
assert.equal(modelCalls, 0); assert.equal(networkCalls, 0);
console.log(`Evidence: ${join(run, 'evidence.json')}`);
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
