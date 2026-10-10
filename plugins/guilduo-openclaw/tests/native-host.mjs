// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOAuthFixture } from './oauth-fixture.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv[2] && process.argv[3], 'Usage: node tests/native-host.mjs <candidate.tgz> <installed-openclaw.mjs>');
const archive = resolve(process.argv[2]);
const host = resolve(process.argv[3]);
const installedHost = dirname(host);
const hostPackage = JSON.parse(await readFile(join(installedHost, 'package.json'), 'utf8'));
const buildInfo = JSON.parse(await readFile(join(installedHost, 'dist/build-info.json'), 'utf8'));
assert.equal(hostPackage.version, '2026.9.9');
assert.equal(buildInfo.commit, 'bcfc88812a35243893585dbeca87ca41b48272ca');
const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'));
assert.equal(pkg.engines.node, hostPackage.engines.node);
assert.equal(hostPackage.exports['./plugin-sdk/plugin-entry'].default, './dist/plugin-sdk/plugin-entry.js');
const qa = join(base, '.qa-artifacts');
await mkdir(qa, { recursive: true });
assert.ok((await realpath(qa)).startsWith((await realpath(base)) + sep));
const root = await mkdtemp(join(qa, 'native-'));
for (const name of ['home', 'state', 'tmp', 'cache', 'config', 'data', 'workspace', 'logs']) await mkdir(join(root, name));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), OPENCLAW_HOME: join(root, 'home'),
  OPENCLAW_STATE_DIR: join(root, 'state'), OPENCLAW_CONFIG_PATH: join(root, 'state/openclaw.json'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
  OPENCLAW_NO_RESPAWN: '1', OPENCLAW_HIDE_BANNER: '1', OPENCLAW_SKIP_UPDATE_CHECK: '1',
  npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'empty.npmrc'),
  npm_config_ignore_scripts: 'true', npm_config_package_lock: 'false', npm_config_audit: 'false', npm_config_fund: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'),
});
await writeFile(env.npm_config_userconfig, 'registry=https://registry.npmjs.org/\nignore-scripts=true\npackage-lock=false\n');
await writeFile(env.GIT_CONFIG_GLOBAL, '');
await writeFile(env.OPENCLAW_CONFIG_PATH, JSON.stringify({ mcp: { servers: { keep: { url: 'https://example.invalid/mcp', transport: 'streamable-http', enabled: false } } } }));
const commands = [];
async function run(args, { expected = 0, entry = host, onOutput } = {}) {
  const child = spawn(process.execPath, [entry, ...args], { env, cwd: join(root, 'workspace'), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; onOutput?.(stdout); });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 60000);
  const status = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', resolveExit); }).finally(() => clearTimeout(timer));
  commands.push({ args, status });
  await writeFile(join(root, 'logs', `${commands.length}.json`), JSON.stringify({ args, status }, null, 2));
  assert.equal(status, expected, `${args[0]} ${args[1]} failed; native output is not logged`);
  return stdout;
}
function parseJson(output) { return JSON.parse(output.slice(output.indexOf('{'))); }
const config = async () => JSON.parse(await readFile(env.OPENCLAW_CONFIG_PATH, 'utf8'));
const artifact = parseJson(await run([archive, host], { entry: join(base, 'tests/artifact-check.mjs') }));
const keep = (await config()).mcp.servers.keep;
const authoring = parseJson(await run(['plugins', 'validate', '--root', base, '--json'], { expected: 1 }));
assert.deepEqual(authoring.errors, ['plugin entry does not expose tool or feature authoring metadata: ./lib/index.js']);
await run(['plugins', 'install', archive, '--force', '--accept-capabilities']);
console.log('PASS native archive install');
const inspection = parseJson(await run(['plugins', 'inspect', 'guilduo', '--runtime', '--json']));
assert.match(JSON.stringify(inspection), /guilduo/);
assert.equal(inspection.plugin.status, 'loaded');
assert.equal(inspection.plugin.imported, true);
assert.equal(inspection.plugin.httpRoutes, 0);
assert.deepEqual(inspection.diagnostics, []);
const installed = join(root, 'state/extensions/guilduo');
assert.deepEqual(await readFile(join(installed, 'lib/index.js')), await readFile(join(base, 'lib/index.js')));
const skills = await run(['skills', 'list', '--json']);
assert.match(skills, /guilduo-workflows/);
assert.doesNotMatch(skills, /questforge-workflows/);
assert.equal((await config()).mcp.servers.guilduo, undefined, 'manifest must not silently create saved config');
await run([host], { entry: join(installed, 'setup.mjs') });
assert.deepEqual((await config()).mcp.servers.guilduo, { url: 'https://mcp.guilduo.com/mcp', transport: 'streamable-http', auth: 'oauth' });
assert.deepEqual((await config()).mcp.servers.keep, keep);
await run([], { entry: join(installed, 'setup.mjs') });
console.log('PASS helper explicit-path and user-friendly PATH invocation');
const matching = parseJson(await run(['plugins', 'inspect', 'guilduo', '--json']));
assert.equal(matching.plugin.mcpServers.guilduo.url, (await config()).mcp.servers.guilduo.url);
await run([host, 'unauthenticated'], { entry: join(base, 'tests/ui-carrier.mjs') });
await run(['plugins', 'install', archive], { expected: 1 });
await run(['plugins', 'install', archive, '--force', '--accept-capabilities']);
assert.deepEqual((await config()).mcp.servers.keep, keep);
console.log('PASS duplicate rejection and native replacement reinstall');
const priorArchive = resolve(process.argv[4] ?? join(base, '.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.15.tgz'));
const beforeUpdate = (await config()).mcp;
await run(['plugins', 'install', priorArchive, '--force', '--accept-capabilities']);
assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, '0.6.0-beta.15');
const previousSkills = await run(['skills', 'list', '--json']);
assert.match(previousSkills, /guilduo-workflows/);
assert.doesNotMatch(previousSkills, /questforge-workflows/);
await run(['plugins', 'install', archive, '--force', '--accept-capabilities']);
assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, pkg.version);
const migratedSkills = await run(['skills', 'list', '--json']);
assert.match(migratedSkills, /guilduo-workflows/);
assert.doesNotMatch(migratedSkills, /questforge-workflows/);
assert.deepEqual((await config()).mcp, beforeUpdate);
console.log('PASS native archive version update from immutable beta.15 to beta.16, new Skill only');
await run(['plugins', 'update', 'guilduo', '--dry-run']);
const status = parseJson(await run(['mcp', 'status', '--json']));
assert.ok(status.servers.some(server => server.name === 'guilduo' && server.authStatus.state === 'unauthenticated'));

const fixture = await startOAuthFixture();
try {
  // Only the isolated installed test copy changes URL for synthetic OAuth/Accounts tests.
  const manifestFile = join(installed, 'openclaw.plugin.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.mcpServers.guilduo.url = `${fixture.origin}/mcp`;
  await writeFile(manifestFile, JSON.stringify(manifest));
  await run(['mcp', 'set', 'guilduo', JSON.stringify({ url: `${fixture.origin}/mcp`, transport: 'streamable-http', auth: 'oauth' })]);
  let authorize;
  await run(['mcp', 'login', 'guilduo'], { onOutput(output) {
    const match = output.match(new RegExp(`${fixture.origin}/authorize[^\\s]+`));
    if (match && !authorize) authorize = fixture.authorize(match[0]);
  } });
  await authorize;
  assert.ok(fixture.pkceVerified(), 'host token exchange must verify real S256 PKCE');
  const authStatus = parseJson(await run(['mcp', 'status', '--json']));
  assert.equal(authStatus.servers.find(server => server.name === 'guilduo').authStatus.state, 'authorized');
  const connected = parseJson(await run(['plugins', 'inspect', 'guilduo', '--json']));
  assert.equal(connected.plugin.mcpServers.guilduo.url, `${fixture.origin}/mcp`);
  await run([host, 'authorized'], { entry: join(base, 'tests/ui-carrier.mjs') });
  await run(['mcp', 'doctor', 'guilduo', '--probe', '--json']);
  assert.ok(fixture.probed(), 'real host must initialize and discover fixture tools');
  await run(['mcp', 'logout', 'guilduo']);
  const loggedOut = parseJson(await run(['mcp', 'status', '--json']));
  assert.equal(loggedOut.servers.find(server => server.name === 'guilduo').authStatus.state, 'unauthenticated');
  console.log('PASS synthetic OAuth login/callback/PKCE/persisted status/probe/logout');
} finally { await fixture.close(); }

await run(['mcp', 'unset', 'guilduo']);
await run(['mcp', 'add', 'existing-alias', '--url', 'https://mcp.guilduo.com/mcp', '--transport', 'streamable-http', '--auth', 'oauth', '--no-probe']);
await run([], { entry: join(installed, 'setup.mjs') });
assert.equal((await config()).mcp.servers.guilduo, undefined);
assert.ok((await config()).mcp.servers['existing-alias']);
await run(['mcp', 'add', 'guilduo', '--url', 'https://occupied.invalid/mcp', '--transport', 'streamable-http', '--no-probe']);
await run([], { entry: join(installed, 'setup.mjs'), expected: 1 });
assert.equal((await config()).mcp.servers.guilduo.url, 'https://occupied.invalid/mcp');
await run(['plugins', 'uninstall', 'guilduo', '--force']);
assert.ok(!(await readdir(join(root, 'state/extensions'))).includes('guilduo'));
assert.deepEqual((await config()).mcp.servers.keep, keep);
assert.equal((await config()).mcp.servers.guilduo.url, 'https://occupied.invalid/mcp', 'uninstall must preserve explicit MCP registry');
console.log('PASS alias/conflict preservation and native removal');
await writeFile(join(root, 'evidence.json'), JSON.stringify({ host: buildInfo, node: process.version, artifact, archive, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), root, commands, publicOAuth: 'unverified', renderedUI: 'unverified', realQuestWrites: 'unverified', humanRelay: 'unverified' }, null, 2));
console.log(`Evidence: ${join(root, 'evidence.json')}`);
