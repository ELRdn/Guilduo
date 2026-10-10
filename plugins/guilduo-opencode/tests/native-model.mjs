// SPDX-License-Identifier: AGPL-3.0-only
// Explicit paid acceptance: archive, executable, pinned version, native auth file, --accept-model-cost.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectedGoKey } from './native-key.mjs';
import { requiredPhaseReads } from './native-phase-reads.mjs';

assert.equal(process.argv[6], '--accept-model-cost', 'Explicit authorization for real Go model requests is required');
assert.ok(process.argv[2] && process.argv[3] && process.argv[4] && process.argv[5], 'Pass archive, host, pinned version and selected native auth file');
const archive = resolve(process.argv[2]), executable = resolve(process.argv[3]), version = process.argv[4];
const model = { providerID: 'opencode-go', modelID: 'deepseek-v4.1-flash' };
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const root = await realpath(await mkdtemp(join(artifacts, `native-model-${version}-`)));
const cwd = join(root, 'workspace');
for (const name of ['home', 'config', 'data', 'cache', 'state', 'tmp', 'workspace']) await mkdir(join(root, name));
const key = await selectedGoKey(resolve(process.argv[5]));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), OPENCODE_TEST_HOME: join(root, 'home'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), OPENCODE_CONFIG_DIR: join(root, 'config'),
  OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OPENCODE_DISABLE_EXTERNAL_SKILLS: 'true',
  OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
  OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true', OPENCODE_SERVER_USERNAME: 'model-fixture', OPENCODE_SERVER_PASSWORD: 'public-isolated-fixture',
  GIT_DIR: join(root, 'no-git'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'),
  npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'empty.npmrc'),
  OPENCODE_MODELS_PATH: join(root, 'models.json'), OPENCODE_API_KEY: key,
});
await writeFile(env.GIT_CONFIG_GLOBAL, '');
await writeFile(env.npm_config_userconfig, 'registry=https://registry.npmjs.org/\nignore-scripts=true\npackage-lock=false\n');
await assert.rejects(access(env.GIT_DIR), { code: 'ENOENT' });
const evidence = { hostVersion: version, model, archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'), publicOAuth: 'NOT_RUN', publicQuestWrites: 'NOT_RUN', cases: [], result: 'FAIL' };
let child, sessionID, hostURL, fixture, caseAbort, diagnostic = '';
const headers = { authorization: `Basic ${Buffer.from('model-fixture:public-isolated-fixture').toString('base64')}`, 'content-type': 'application/json' };
const request = async (path, method = 'GET', body, signal = caseAbort?.signal) => {
  const response = await fetch(hostURL + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ?? AbortSignal.timeout(60000),
  });
  assert.ok(response.ok, `Native ${method} ${path} returned HTTP ${response.status}`);
  return response.status === 204 ? undefined : response.json();
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const stopHost = async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (sessionID && hostURL) await request(`/session/${sessionID}/abort`, 'POST', undefined, AbortSignal.timeout(5000)).catch(() => {});
  const exited = once(child, 'exit'); child.kill();
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await Promise.race([exited, delay(5000)]); }
  assert.ok(child.exitCode !== null || child.signalCode !== null, 'Owned host must exit');
};
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, 'Isolated native command failed');
  assert.ok(!result.stdout.includes(key) && !result.stderr.includes(key), 'Credential appeared in native output');
  return result.stdout;
};
const startHost = async () => {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  hostURL = `http://127.0.0.1:${port}`;
  // No raw host output or provider errors are captured in receipts.
  child = spawn(executable, ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--print-logs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-65536); });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, 'Owned host exited during startup');
    try { if ((await fetch(hostURL + '/global/health', { headers, signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Native startup exceeded 60 seconds');
};
let contextReads = 0, questReads = 0, writes = 0;
try {
  assert.equal(run(executable, ['--version']).trim(), version);
  for (const line of run(executable, ['debug', 'paths']).trim().split(/\r?\n/)) assert.ok(resolve(line.replace(/^\S+\s+/, '')).startsWith(root + sep), 'Native path escaped isolation');
  const metadataURL = 'https://models.opencode.ai/api.json';
  const response = await fetch(metadataURL, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, 'Official current model metadata unavailable');
  const provider = (await response.json())[model.providerID];
  assert.ok(provider?.models?.[model.modelID], 'Exact authorized Go model is not advertised; no fallback');
  assert.deepEqual(provider.env, ['OPENCODE_API_KEY']);
  assert.equal(provider.api, 'https://opencode.ai/zen/go/v1');
  provider.models = { [model.modelID]: provider.models[model.modelID] };
  await writeFile(env.OPENCODE_MODELS_PATH, JSON.stringify({ [model.providerID]: provider }));
  evidence.advertisedModel = { metadataURL, checkedAt: new Date().toISOString(), nativeListing: run(executable, ['models', model.providerID]).trim().split(/\r?\n/) };
  assert.ok(evidence.advertisedModel.nativeListing.includes(`${model.providerID}/${model.modelID}`));
  const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const prefix = join(cwd, '.opencode/guilduo');
  run(process.execPath, [npmCli, 'install', '--prefix', prefix, archive, '--ignore-scripts', '--no-package-lock', '--no-save', '--no-audit', '--no-fund']);
  const installed = join(prefix, 'node_modules/@guilduo/opencode-plugin');
  evidence.candidate = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version;
  assert.equal(evidence.candidate, '0.6.0-beta.16');
  const inputSchema = { type: 'object', properties: { actingAgentId: { type: 'string' }, questId: { type: 'string' } }, additionalProperties: false };
  fixture = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/mcp') { res.writeHead(405); res.end('{}'); return; }
    try {
      let bytes = ''; for await (const part of req) { bytes += part; assert.ok(bytes.length < 65536); }
      const rpc = JSON.parse(bytes);
      if (rpc.id === undefined) { res.writeHead(202); res.end(); return; }
      let result;
      if (rpc.method === 'initialize') result = { protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic-phase-fixture', version: '1' } };
      else if (rpc.method === 'tools/list') result = { tools: ['get_current_agent_context', 'get_quest', 'update_quest'].map(name => ({ name, description: name === 'update_quest' ? 'No verified changes in this fixture: do not call.' : 'Read the authorized synthetic fixture.', inputSchema })) };
      else if (rpc.method === 'tools/call') {
        const args = rpc.params.arguments ?? {};
        assert.equal(args.actingAgentId, 'fixture-agent');
        if (rpc.params.name === 'update_quest') { writes++; throw new Error('Fixture has no changed progress'); }
        assert.ok(['get_current_agent_context', 'get_quest'].includes(rpc.params.name));
        if (rpc.params.name === 'get_quest') { assert.equal(args.questId, 'fixture-quest'); questReads++; }
        else contextReads++;
        result = { content: [{ type: 'text', text: JSON.stringify(rpc.params.name === 'get_quest'
          ? { id: 'fixture-quest', updatedAt: 'fixture-version', nextAction: 'No verified change; no update is necessary.' }
          : { actingAgentId: 'fixture-agent', active: true, allowedAgentIds: ['fixture-agent'], effectiveScopes: ['quests:read', 'quests:write'] }) }] };
        if (rpc.params.name === 'get_quest') assert.equal(JSON.parse(result.content[0].text).id, 'fixture-quest');
      } else { assert.equal(rpc.method, 'ping'); result = {}; }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
    } catch { res.writeHead(400); res.end('{"error":"Synthetic fixture rejected the request"}'); }
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  const fixtureURL = `http://127.0.0.1:${fixture.address().port}/mcp`;
  const observer = join(root, 'loopback-only.mjs');
  // Test-only final config hook redirects transport after the candidate recognizes the official alias.
  await writeFile(observer, `export default async () => ({config: async config => {
    if(config.mcp?.guilduo?.url !== 'https://mcp.guilduo.com/mcp') throw new Error('Expected official alias');
    config.mcp.guilduo = {type:'remote',url:${JSON.stringify(fixtureURL)},enabled:true,oauth:false};
  }});\n`);
  const configFile = join(root, 'config/opencode.json');
  const writeConfig = async phaseSync => writeFile(configFile, JSON.stringify({
    $schema: 'https://opencode.ai/config.json', autoupdate: false, snapshot: false, share: 'disabled',
    model: `${model.providerID}/${model.modelID}`, small_model: `${model.providerID}/${model.modelID}`, enabled_providers: [model.providerID],
    provider: { [model.providerID]: { options: { maxRetries: 0 } } },
    permission: { bash: 'deny', read: 'deny', task: 'deny', webfetch: 'deny', external_directory: 'deny', 'guilduo_*': 'allow' },
    plugin: [phaseSync ? [pathToFileURL(join(installed, 'lib/index.js')).href, { phaseSync }] : pathToFileURL(join(installed, 'lib/index.js')).href, pathToFileURL(observer).href],
  }, null, 2));
  evidence.stage = 'initial native startup';
  await writeConfig(); await startHost();
  evidence.stage = 'initial native config bootstrap';
  // Fresh native profiles may install their own config dependencies before first instance readiness.
  // This inference-free bootstrap is separate from each paid case's strict 120-second budget.
  console.log('Native config bootstrap (180-second limit; no model request)');
  await request('/config', 'GET', undefined, AbortSignal.timeout(180000));
  evidence.stage = 'initial native session creation';
  const session = await request('/session', 'POST', { title: 'Authorized Go synthetic phase acceptance' });
  sessionID = session.id;
  assert.equal(session.projectID, 'global');
  assert.equal(await realpath(session.directory), cwd);
  const inspect = async () => {
    const messages = await request(`/session/${sessionID}/message`);
    for (const message of messages.filter(m => m.info.role === 'assistant')) {
      assert.equal(message.info.providerID, model.providerID, 'Provider fallback is forbidden');
      assert.equal(message.info.modelID, model.modelID, 'Model fallback is forbidden');
      assert.ok(!message.info.error, 'Native model response failed; no automatic rerun');
    }
    return messages;
  };
  const synthetic = messages => messages.filter(m => m.info.role === 'user' && m.parts.some(p => p.type === 'text' && p.synthetic));
  const caseRun = async (name, action, expected, expectedNewAssistants) => {
    evidence.stage = name;
    console.log(`Native model case: ${name}`);
    caseAbort = new AbortController();
    const timer = setTimeout(() => caseAbort.abort(), 120000);
    try {
      const before = await inspect(), start = Date.now();
      await action();
      let last, quiet = 0;
      while (true) {
        caseAbort.signal.throwIfAborted();
        const messages = await inspect();
        assert.equal(synthetic(messages).length <= expected, true, 'Unexpected extra or recursive continuation');
        const assistants = messages.filter(m => m.info.role === 'assistant');
        const users = messages.filter(m => m.info.role === 'user');
        const done = synthetic(messages).length === expected && assistants.length >= before.filter(m => m.info.role === 'assistant').length + expectedNewAssistants && assistants.every(m => m.info.time.completed) && users.every(user => assistants.filter(m => m.info.parentID === user.info.id).at(-1)?.info.finish === 'stop');
        const ids = messages.map(m => m.info.id).join(',');
        quiet = done && ids === last ? quiet + 1 : 0; last = ids;
        if (quiet >= 20) {
          evidence.cases.push({ name, result: 'PASS', elapsedMs: Date.now() - start, syntheticMessages: synthetic(messages).length, completedAssistants: assistants.length, cost: assistants.reduce((sum, m) => sum + (m.info.cost ?? 0), 0) });
          return;
        }
        await delay(250);
      }
    } finally {
      clearTimeout(timer);
      if (caseAbort.signal.aborted) await request(`/session/${sessionID}/abort`, 'POST', undefined, AbortSignal.timeout(5000)).catch(() => {});
    }
  };
  const prompt = text => request(`/session/${sessionID}/prompt_async`, 'POST', { agent: 'build', model, parts: [{ type: 'text', text }] });
  const first = 'This is an isolated synthetic fixture, not public Guilduo. I authorize ongoing progress checks for fixture-quest with actingAgentId fixture-agent. No progress changed. For this original input, do not call tools; reply READY only. If a later synthetic Guilduo phase check arrives, use guilduo_get_current_agent_context and guilduo_get_quest with that actingAgentId, then report no change. Never update, complete, score, or start another request.';
  await caseRun('default OFF', () => prompt(first), 0, 1);
  await stopHost();
  const binding = { sessionId: sessionID, questId: 'fixture-quest', actingAgentId: 'fixture-agent', cwd };
  await writeConfig(binding); await startHost();
  await caseRun('opt-in ON exactly once; no recursion', () => prompt(first), 1, 2);
  assert.ok(contextReads >= 1, 'Actual continuation must read Agent context');
  assert.ok(questReads >= 1, 'Actual continuation must read the exact Quest');
  const verifiedReads = requiredPhaseReads((await inspect()).flatMap(message => message.parts));
  assert.equal(writes, 0, 'No-change fixture must not be mutated');
  await caseRun('native sync-off command', () => request(`/session/${sessionID}/command`, 'POST', { command: 'guilduo-sync-off', arguments: '', model: `${model.providerID}/${model.modelID}` }), 1, 1);
  await caseRun('after sync-off: no continuation', () => prompt('No work or progress changed. Reply STOPPED only, without tools.'), 1, 1);
  evidence.loopback = { contextReads, questReads, nativeHistory: verifiedReads, writes, transport: 'test-only final config hook redirect; no public OAuth', noRecursionObservationMs: 5000 };
  evidence.binding = 'Create the exact native session without a binding; fully stop, set its canonical cwd/session tuple, restart. No wildcard/new-session auto-binding.';
  evidence.result = 'PASS_REAL_MODEL_LOOPBACK';
} catch (error) {
  // Never serialize host/provider error bodies, keys, transcripts or real fixture identities.
  evidence.failure = { name: error.name, message: String(error.message).replaceAll(key, '[REDACTED]').slice(0, 300) };
  evidence.nativeErrors = diagnostic.split(/\r?\n/).filter(line => /(?:level=ERROR|^ERROR)/.test(line)).map(() => 'Native ERROR observed (body withheld)').slice(-3);
  process.exitCode = 1;
} finally {
  await stopHost();
  evidence.hostStopped = !child || child.exitCode !== null || child.signalCode !== null;
  if (fixture) { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); }
  delete env.OPENCODE_API_KEY;
  // Remove any native diagnostic containing the selected key; fail the acceptance rather than retaining it.
  let leaked = false;
  async function check(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await check(path);
      else if (entry.isFile() && (await readFile(path)).includes(Buffer.from(key))) { leaked = true; await rm(path); }
    }
  }
  await check(root);
  evidence.credentialPersistence = leaked ? 'FAIL: contaminated diagnostic removed' : 'NONE';
  if (leaked) { evidence.result = 'FAIL'; process.exitCode = 1; }
  await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ result: evidence.result, artifactDirectory: root, cases: evidence.cases.map(c => ({ name: c.name, result: c.result })), failure: evidence.failure }, null, 2));
}
