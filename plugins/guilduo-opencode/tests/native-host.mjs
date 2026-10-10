// SPDX-License-Identifier: AGPL-3.0-only
// Usage: node tests/native-host.mjs <candidate.tgz> <opencode executable> [pinned version] [immutable beta.15.tgz]
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { oauthLoopback } from './oauth-loopback.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
assert.ok(process.argv[2] && process.argv[3], 'Pass the parent-built npm archive and public host executable');
const archive = resolve(process.argv[2]);
const executable = resolve(process.argv[3]);
const version = process.argv[4] ?? '1.18.32';
const previous = resolve(process.argv[5] ?? join(repo, 'plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.15.tgz'));
await Promise.all([access(archive), access(executable), access(previous)]);
const checksum = text => createHash('sha256').update(text).digest('hex');
const previousSha256 = checksum(await readFile(previous));
const artifacts = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts');
await mkdir(artifacts, { recursive: true });
const root = await mkdtemp(join(artifacts, `native-host-${version}-`));
for (const name of ['home', 'config', 'data', 'cache', 'state', 'tmp', 'workspace', 'install', 'existing-skills']) {
  await mkdir(join(root, name), { recursive: true });
}
// Allowlist environment variables so provider keys, profile selectors and remote auth are never inherited.
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
  XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), OPENCODE_TEST_HOME: join(root, 'home'),
  OPENCODE_CONFIG_DIR: join(root, 'config'), OPENCODE_DISABLE_PROJECT_CONFIG: 'true',
  OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OPENCODE_DISABLE_EXTERNAL_SKILLS: 'true',
  OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true',
  OPENCODE_DISABLE_LSP_DOWNLOAD: 'true', OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
  OPENCODE_SERVER_USERNAME: 'native-test', OPENCODE_SERVER_PASSWORD: 'isolated-public-fixture',
  // Native project discovery otherwise writes its project-id cache into the ancestor repository.
  GIT_DIR: join(root, 'no-git'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'),
  npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'empty.npmrc'),
});
await writeFile(env.npm_config_userconfig, 'registry=https://registry.npmjs.org/\nignore-scripts=true\npackage-lock=false\n');
await writeFile(env.GIT_CONFIG_GLOBAL, '');
await assert.rejects(access(env.GIT_DIR), { code: 'ENOENT' });
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: join(root, 'workspace'), env, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
assert.equal(run(executable, ['--version']).trim(), version, 'Host must match the pinned version');
const paths = run(executable, ['debug', 'paths']);
for (const line of paths.trim().split(/\r?\n/)) {
  const path = resolve(line.replace(/^\S+\s+/, ''));
  assert.ok(path.startsWith(root + sep), `Host path escaped isolation: ${line}`);
}
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
await access(npmCli);
const shared = join(root, 'workspace/.opencode');
const prefix = join(shared, 'guilduo');
const unrelatedPackage = join(shared, 'node_modules/unrelated-unsaved-plugin');
await mkdir(unrelatedPackage, { recursive: true });
const unrelatedBytes = '{"name":"unrelated-unsaved-plugin","version":"1.0.0"}\n';
await writeFile(join(unrelatedPackage, 'package.json'), unrelatedBytes);
const unrelatedModule = 'export default async () => ({});\n';
await writeFile(join(unrelatedPackage, 'index.js'), unrelatedModule);
await writeFile(join(shared, 'package.json'), '{"private":true}\n');
const assertUnrelatedRetained = async () => {
  assert.equal(await readFile(join(unrelatedPackage, 'package.json'), 'utf8'), unrelatedBytes);
  assert.equal(await readFile(join(unrelatedPackage, 'index.js'), 'utf8'), unrelatedModule);
  assert.equal(await readFile(join(shared, 'package.json'), 'utf8'), '{"private":true}\n');
};
const installArgs = ['install', '--prefix', prefix, '--ignore-scripts', '--no-package-lock', '--no-save', '--no-audit', '--no-fund'];
run(process.execPath, [npmCli, ...installArgs, previous]);
await assertUnrelatedRetained();
const installed = join(prefix, 'node_modules/@guilduo/opencode-plugin');
const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
assert.equal(metadata.name, '@guilduo/opencode-plugin');
assert.equal(metadata.version, '0.6.0-beta.15');
const candidate = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
assert.equal(candidate.version, '0.6.0-beta.16');
const plugin = pathToFileURL(join(installed, metadata.main)).href;
const eventFile = join(root, 'events.jsonl');
const observer = join(root, 'observer.mjs');
// Observe actual native dispatch and disposal; the observer does not call candidate hooks itself.
await writeFile(observer, `import { appendFile } from 'node:fs/promises';
const record = (data) => appendFile(${JSON.stringify(eventFile)}, JSON.stringify(data) + '\\n');
export default async ({client, directory}) => ({
  config: async (config) => {
    await record({type:'observer.config', config:structuredClone(config)});
    // Disable only the public MCP fixture before native transport initializes.
    for (const value of Object.values(config.mcp ?? {})) {
      if (value.type === 'remote' && value.url === 'https://mcp.guilduo.com/mcp') value.enabled = false;
    }
  },
  event: async ({event}) => {
    if(event.type.startsWith('session.') || event.type.startsWith('message.') || event.type === 'tui.toast.show') await record(event);
    if(event.type === 'session.created') {
      const result = await client.session.get({path:{id:event.properties.info.id}, query:{directory}});
      await record({type:'observer.sdk-session', data:result.data, error:result.error});
    }
  },
  dispose: async () => { await record({type:'observer.disposed'}); }
});\n`);
const configFile = join(root, 'config/opencode.json');
const base = {
  $schema: 'https://opencode.ai/config.json',
  autoupdate: false, snapshot: false, share: 'disabled', enabled_providers: [],
  permission: { '*': 'deny' }, skills: { paths: [join(root, 'existing-skills')] },
  mcp: { unrelated: { type: 'remote', url: 'http://127.0.0.1:1/unused', enabled: false } },
};
const authFile = join(root, 'data/opencode/mcp-auth.json');
await mkdir(dirname(authFile), { recursive: true });
// Public dummy grant exercises native retention/logout only, not login, discovery or refresh.
const syntheticAuth = {
  guilduo: { serverUrl: 'https://mcp.guilduo.com/mcp', tokens: { accessToken: 'public-synthetic-access', refreshToken: 'public-synthetic-refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600 }, clientInfo: { clientId: 'public-synthetic-client' } },
  unrelated: { serverUrl: base.mcp.unrelated.url, tokens: { accessToken: 'public-unrelated-synthetic-access' } },
};
await writeFile(authFile, JSON.stringify(syntheticAuth));
const assertAuthRetained = async () => assert.deepEqual(JSON.parse(await readFile(authFile, 'utf8')), syntheticAuth);
const writeConfig = async (candidate, guilduo, options) => {
  const config = structuredClone(base);
  config.plugin = candidate ? [options ? [plugin, options] : plugin, pathToFileURL(observer).href] : [pathToFileURL(observer).href];
  if (guilduo) config.mcp.guilduo = guilduo;
  const bytes = JSON.stringify(config, null, 2) + '\n';
  await writeFile(configFile, bytes);
  return bytes;
};
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const url = `http://127.0.0.1:${port}`;
let logs = '';
let child;
const headers = { authorization: `Basic ${Buffer.from('native-test:isolated-public-fixture').toString('base64')}`, 'content-type': 'application/json' };
const request = async (path, method = 'GET', body) => {
  const response = await fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    .catch(error => { throw new Error(`${method} ${path}: ${error.message}`); });
  const text = await response.text();
  assert.equal(response.status, 200, `${method} ${path}: ${text}`);
  return JSON.parse(text);
};
const events = async () => {
  try { return (await readFile(eventFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out: ${label}\n${logs.slice(-3000)}`);
};
const startHost = async () => {
  child = spawn(executable, ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--print-logs'], { cwd: join(root, 'workspace'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  await waitFor(async () => {
    assert.equal(child.exitCode, null, `Host exited during startup: ${logs}`);
    try { return (await fetch(url + '/global/health', { headers, signal: AbortSignal.timeout(500) })).ok; } catch { return false; }
  }, 'native host startup');
};
const stopHost = async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000).unref())]);
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'Owned native host must exit');
  }
};
const disposeHost = async () => {
  const count = (await events()).filter(event => event.type === 'observer.disposed').length;
  await request('/instance/dispose', 'POST');
  await waitFor(async () => (await events()).filter(event => event.type === 'observer.disposed').length > count, 'native instance disposal');
  await stopHost();
};
let oauth;
const evidence = { hostVersion: version, candidate: `${candidate.name}@${candidate.version}`, archiveSha256: checksum(await readFile(archive)), previousSha256, isolation: 'PASS', modelInference: 'NOT_RUN', liveOAuth: 'NOT_RUN', syntheticOAuthLoginRefresh: 'NOT_RUN', positiveContinuation: 'NOT_RUN: would start model inference' };
try {
  const original = await writeConfig(true);
  await startHost();
  const config = await request('/config');
  const candidateConfig = (await events()).find(event => event.type === 'observer.config')?.config;
  assert.ok(candidateConfig, 'Native loader must invoke the config hook');
  assert.equal(config.mcp.guilduo.url, 'https://mcp.guilduo.com/mcp');
  assert.equal(config.mcp.guilduo.type, 'remote');
  assert.equal(candidateConfig.mcp.guilduo.enabled, true);
  assert.ok(candidateConfig.mcp.guilduo.oauth === undefined || JSON.stringify(candidateConfig.mcp.guilduo.oauth) === '{}', 'Default native OAuth must remain automatic');
  assert.equal(config.mcp.guilduo.enabled, false);
  assert.deepEqual(config.mcp.unrelated, base.mcp.unrelated);
  assert.ok(config.skills.paths.includes(base.skills.paths[0]));
  const skills = await request('/skill');
  const canonical = skills.find(skill => skill.name === 'guilduo-workflows');
  assert.ok(!skills.some(skill => skill.name === 'questforge-workflows'), 'Previous beta.15 archive must expose only the renamed Skill');
  assert.ok(canonical, 'Bundled canonical Skill must be discovered by the native host');
  const canonicalSource = await readFile(join(installed, 'skills/guilduo-workflows/SKILL.md'), 'utf8');
  assert.equal(checksum(await readFile(join(installed, 'skills/guilduo-workflows/SKILL.md'), 'utf8')), checksum(canonicalSource));
  assert.equal(checksum(canonical.content), checksum(canonicalSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')), 'Native Skill body must match canonical content after frontmatter parsing');
  assert.ok(resolve(canonical.location).startsWith(installed + sep), 'Skill must originate in the installed candidate');
  assert.equal(await readFile(configFile, 'utf8'), original, 'Config hook must not persist mutations');
  evidence.nativeDiscovery = 'PASS: config hook and installed canonical Skill';
  const session = await request('/session', 'POST', { title: 'No inference lifecycle smoke' });
  assert.equal(session.projectID, 'global', 'Native host must not attach to or modify the ancestor Git repository');
  evidence.nativeSessionFields = Object.keys(session).sort();
  assert.equal(await realpath(session.directory), await realpath(join(root, 'workspace')));
  await waitFor(async () => (await events()).some(event => event.type === 'observer.sdk-session' && event.data?.id === session.id), 'native PluginInput SDK session.get metadata');
  const sdkSession = (await events()).find(event => event.type === 'observer.sdk-session' && event.data?.id === session.id);
  assert.equal(sdkSession.error, undefined);
  assert.equal(sdkSession.data.directory, session.directory);
  evidence.nativeSdkMetadata = 'PASS: host-provided SDK1 session.get returns native id/directory metadata';
  await request(`/session/${session.id}/message`, 'POST', { noReply: true, agent: 'plan', model: { providerID: 'native-fixture', modelID: 'never-infer' }, parts: [{ type: 'text', text: 'Native lifecycle fixture; do not infer or execute any tools.' }] });
  await request(`/session/${session.id}/abort`, 'POST');
  await request(`/session/${session.id}/abort`, 'POST');
  await waitFor(async () => (await events()).filter(event => event.type === 'session.idle' && event.properties.sessionID === session.id).length >= 2, 'native idle event dispatch');
  const messages = await request(`/session/${session.id}/message`);
  assert.equal(messages.length, 1, 'Default reminder must not create another message or inference');
  assert.equal(messages[0].info.role, 'user');
  assert.equal(messages[0].info.agent, 'plan', 'Native plan agent metadata must remain available');
  evidence.nativeLifecycle = 'PASS: plan noReply, repeated native idle, default opt-out';
  await assertAuthRetained();
  evidence.nativePreviousInstall = 'PASS: immutable beta.15 archive installed, loaded and Skill discovered';
  await stopHost();
  run(process.execPath, [npmCli, ...installArgs, archive]);
  await assertUnrelatedRetained();
  assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, candidate.version);
  await startHost();
  const upgraded = await request('/config');
  assert.equal(upgraded.command?.['guilduo-sync-off'], undefined, 'Unbound candidate must not register a stop command');
  const upgradedSkills = await request('/skill');
  assert.equal(upgradedSkills.filter(skill => skill.name === 'guilduo-workflows').length, 1);
  assert.ok(!upgradedSkills.some(skill => skill.name === 'questforge-workflows'), 'Upgrade must remove the legacy Skill');
  const renamedSource = await readFile(join(repo, 'skills/guilduo-workflows/SKILL.md'), 'utf8');
  assert.equal(checksum(await readFile(join(installed, 'skills/guilduo-workflows/SKILL.md'), 'utf8')), checksum(renamedSource));
  assert.equal(checksum(upgradedSkills.find(skill => skill.name === 'guilduo-workflows').content), checksum(renamedSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')));
  assert.equal(await readFile(configFile, 'utf8'), original);
  await assertAuthRetained();
  assert.match(run(executable, ['mcp', 'auth', 'list']), /guilduo/);
  evidence.nativeUpgrade = 'PASS: beta.15 -> beta.16 npm replacement, full host restart, native reload/Skill, no unbound stop command, config and synthetic grant retained';
  // Actual native OAuth transport, against loopback only. Expiry is injected; grants are exchanged by the host.
  await disposeHost();
  oauth = await oauthLoopback();
  base.mcp.loopback = { type: 'remote', url: `${oauth.origin}/mcp`, enabled: false, oauth: { redirectUri: oauth.redirectUri } };
  const oauthBytes = await writeConfig(true);
  await startHost();
  const started = await request('/mcp/loopback/auth', 'POST');
  assert.equal(new URL(started.authorizationUrl).origin, oauth.origin);
  const authorized = await (await fetch(started.authorizationUrl, { signal: AbortSignal.timeout(5000) })).json();
  assert.equal(authorized.state, started.oauthState);
  const authenticated = await request('/mcp/loopback/auth/callback', 'POST', { code: authorized.code });
  assert.equal(authenticated.status, 'connected');
  assert.equal(oauth.exchanges, 1); assert.equal(oauth.refreshes, 0); assert.equal(oauth.error, undefined);
  const auth = JSON.parse(await readFile(authFile, 'utf8'));
  assert.equal(auth.loopback.tokens.accessToken, 'public-loopback-access-1');
  await disposeHost();
  oauth.expire(); auth.loopback.tokens.expiresAt = Math.floor(Date.now() / 1000) - 1;
  await writeFile(authFile, JSON.stringify(auth));
  await startHost();
  assert.deepEqual(JSON.parse(await readFile(authFile, 'utf8')).loopback, auth.loopback, 'Restart must retain the exchanged grant');
  await request('/mcp/loopback/connect', 'POST');
  assert.equal((await request('/mcp')).loopback.status, 'connected');
  assert.equal(oauth.exchanges, 1); assert.equal(oauth.refreshes, 1); assert.equal(oauth.error, undefined);
  assert.equal(JSON.parse(await readFile(authFile, 'utf8')).loopback.tokens.accessToken, 'public-loopback-access-2');
  assert.ok(oauth.toolsLists >= 2, 'Native host must discover the empty MCP catalog before and after restart');
  evidence.syntheticOAuthReceipt = { authorizationCodeExchanges: oauth.exchanges, refreshExchanges: oauth.refreshes, nativeToolLists: oauth.toolsLists, advertisedTools: 0, state: 'MATCH', resource: 'MATCH', redirectUri: 'MATCH', pkce: 'S256_VERIFIED', callback: 'native /mcp/loopback/auth/callback', restart: 'PASS', expiry: 'INJECTED' };
  assert.equal(await readFile(configFile, 'utf8'), oauthBytes);
  await request('/mcp/loopback/auth', 'DELETE');
  await assertAuthRetained();
  delete base.mcp.loopback;
  evidence.syntheticOAuthLoginRefresh = 'PASS: actual native DCR/discovery, authorization state/S256 PKCE, supported auth callback/code exchange, exchanged grant across full restart, injected expiry then actual refresh/rotation, empty MCP connection and native auth removal; loopback only, no browser login or public provider';
  const errors = (await events()).filter(event => event.type === 'session.error');
  assert.deepEqual(errors, [], 'Host must not silently skip an invalid candidate plugin');
  await disposeHost();
  const disabled = { type: 'remote', url: 'https://mcp.guilduo.com/mcp', enabled: false };
  const boundBytes = await writeConfig(true, disabled, { phaseSync: { sessionId: session.id, questId: 'fixture-quest', actingAgentId: 'fixture-agent', cwd: await realpath(join(root, 'workspace')) } });
  await startHost();
  const boundConfig = await request('/config');
  assert.match(boundConfig.command['guilduo-sync-off'].template, /does not abort model execution/);
  assert.ok((await request('/command')).some(command => command.name === 'guilduo-sync-off'), 'Bound stop must appear in native command discovery');
  await request(`/session/${session.id}/message`, 'POST', { noReply: true, agent: 'build', model: { providerID: 'native-fixture', modelID: 'never-infer' }, parts: [{ type: 'text', text: 'Opt-in bound session, disabled MCP, read-only fixture.' }] });
  await request(`/session/${session.id}/abort`, 'POST');
  await request(`/session/${session.id}/abort`, 'POST');
  await waitFor(async () => (await events()).filter(event => event.type === 'session.idle' && event.properties.sessionID === session.id).length >= 4, 'bound native idle dispatch');
  const boundMessages = await request(`/session/${session.id}/message`);
  assert.equal(boundMessages.length, 2, 'Bound read-only/disabled session must not continue');
  assert.ok(boundMessages.every(message => message.info.role === 'user'));
  assert.equal(await readFile(configFile, 'utf8'), boundBytes);
  evidence.nativeOptInGate = 'PASS: native options tuple accepted; bound disabled/read-only session cannot continue';
  const custom = { type: 'remote', url: 'http://127.0.0.1:1/user-owned', enabled: false, oauth: false, headers: { 'X-Fixture': 'retain' } };
  await disposeHost();
  const customBytes = await writeConfig(true, custom);
  await startHost();
  const retained = await request('/config');
  assert.deepEqual(retained.mcp.guilduo, custom, 'Existing user MCP settings must be retained exactly');
  assert.equal(await readFile(configFile, 'utf8'), customBytes);
  evidence.configRetention = 'PASS: existing MCP, Skills and config bytes retained';
  await disposeHost();
  const removedBytes = await writeConfig(false, custom);
  await startHost();
  const removed = await request('/config');
  assert.deepEqual(removed.mcp.guilduo, custom, 'Removing the plugin must retain user MCP config');
  assert.deepEqual(removed.skills.paths, base.skills.paths);
  assert.equal(removed.command?.['guilduo-sync-off'], undefined, 'Plugin removal must withdraw its stop command');
  assert.equal((await request('/skill')).some(skill => skill.name === 'guilduo-workflows'), false, 'Removing the plugin must stop bundled Skill discovery');
  assert.equal(await readFile(configFile, 'utf8'), removedBytes);
  await waitFor(async () => (await events()).filter(event => event.type === 'observer.disposed').length >= 3, 'native instance disposal');
  evidence.nativeUnload = 'PASS: instance disposal, plugin removal, Skill withdrawal, MCP retained';
  await assertAuthRetained();
  await stopHost();
  run(process.execPath, [npmCli, 'uninstall', '--prefix', prefix, '--ignore-scripts', '--no-package-lock', '--no-save', '--no-audit', '--no-fund', '@guilduo/opencode-plugin']);
  await assertUnrelatedRetained();
  evidence.unrelatedPackagePreservation = 'PASS: unrelated unsaved shared .opencode/node_modules package bytes survive dedicated .opencode/guilduo install, upgrade and uninstall';
  await assert.rejects(access(installed), { code: 'ENOENT' });
  await startHost();
  assert.deepEqual((await request('/config')).mcp.guilduo, custom);
  assert.equal((await request('/skill')).some(skill => skill.name === 'guilduo-workflows'), false);
  await assertAuthRetained();
  evidence.nativeUninstall = 'PASS: npm uninstall, full host restart, package absent, Skill absent, explicit MCP/config and synthetic grants retained';
  run(executable, ['mcp', 'logout', 'guilduo']);
  assert.deepEqual(JSON.parse(await readFile(authFile, 'utf8')), { unrelated: syntheticAuth.unrelated });
  assert.equal(await readFile(configFile, 'utf8'), removedBytes);
  run(executable, ['mcp', 'logout', 'guilduo']);
  assert.deepEqual(JSON.parse(await readFile(authFile, 'utf8')), { unrelated: syntheticAuth.unrelated });
  evidence.syntheticOAuthLifecycle = 'PASS: native auth list sees dummy grant; upgrade/restart/unload/uninstall retain it; native logout removes only target alias and repeated logout is safe. No login/token exchange/refresh/revocation performed';
  assert.equal(checksum(await readFile(previous)), previousSha256, 'Old beta.15 archive must stay immutable');
  evidence.previousArchiveImmutable = 'PASS';
} catch (error) {
  evidence.failure = error.stack;
  throw error;
} finally {
  if (child) {
    await stopHost();
    evidence.hostStopped = child.exitCode !== null || child.signalCode !== null;
  }
  await oauth?.close();
  await writeFile(join(root, 'host.log'), logs);
  await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  assert.equal(evidence.hostStopped, true, 'Owned native host must exit');
}
console.log(JSON.stringify({ ...evidence, artifactDirectory: root }, null, 2));
