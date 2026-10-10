import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, copyFile, cp, symlink, link, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { planSetup, setup, endpoint } from '../plugins/guilduo-openclaw/setup.mjs';

const plugin = new URL('../plugins/guilduo-openclaw/', import.meta.url);
const canonical = new URL('../skills/guilduo-workflows/', import.meta.url);
const native = { url: endpoint, transport: 'streamable-http', auth: 'oauth' };

test('OpenClaw external package and manifest follow the pinned public contracts', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', plugin), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('openclaw.plugin.json', plugin), 'utf8'));
  assert.equal(pkg.name, '@guilduo/openclaw-plugin');
  assert.equal(pkg.version, '0.6.0-beta.16');
  assert.equal(pkg.license, 'AGPL-3.0-only');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.deepEqual(pkg.peerDependencies, { openclaw: '2026.9.9' });
  assert.equal(pkg.engines.node, '>=24.16.0 <25 || >=26.1.0');
  assert.deepEqual(pkg.openclaw, { extensions: ['./lib/index.js'], compat: { pluginApi: '2026.9.9', minGatewayVersion: '2026.9.9' }, build: { openclawVersion: '2026.9.9' } });
  assert.equal(manifest.id, 'guilduo');
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.configSchema, { type: 'object', properties: {}, additionalProperties: false });
  assert.deepEqual(manifest.skills, ['./skills']);
  assert.deepEqual(manifest.mcpServers, { guilduo: native });
  for (const file of ['src/index.ts', 'lib/index.js']) {
    const source = await readFile(new URL(file, plugin), 'utf8');
    assert.match(source, /import \{ definePluginEntry \} from 'openclaw\/plugin-sdk\/plugin-entry'/);
    assert.match(source, /register\(\) \{\}/);
    assert.doesNotMatch(source, /fetch\(|process\.env|registerHttp|registerTool|registerHook|readFile|writeFile|token|bridge/);
  }
  assert.ok(!pkg.files.includes('tests') && !pkg.files.includes('.qa-artifacts'));
  assert.ok(pkg.files.includes('skills/guilduo-workflows') && !pkg.files.includes('skills'));
});

test('staged Skill, agents metadata, references and license match canonical bytes', async () => {
  assert.deepEqual(await readdir(new URL('skills/', plugin)), ['guilduo-workflows']);
  assert.match(await readFile(new URL('skills/guilduo-workflows/SKILL.md', plugin), 'utf8'), /^---\r?\nname: guilduo-workflows\r?\n/);
  for (const directory of ['', 'references/', 'agents/']) {
    const entries = await readdir(new URL(directory, canonical), { withFileTypes: true });
    const expected = entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
    const staged = (await readdir(new URL(`skills/guilduo-workflows/${directory}`, plugin), { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name).sort();
    assert.deepEqual(staged, expected);
    for (const name of expected) assert.deepEqual(await readFile(new URL(`${directory}${name}`, canonical)), await readFile(new URL(`skills/guilduo-workflows/${directory}${name}`, plugin)), name);
  }
  assert.deepEqual(await readFile(new URL('LICENSE', plugin)), await readFile(new URL('../LICENSE', import.meta.url)));
});

test('setup uses create-only native add without probing or replacing config', () => {
  const calls: string[][] = [];
  const other = { existing: { command: 'native-existing-server', args: ['keep'] } };
  const before = JSON.stringify(other);
  const plan = setup((args: string[]) => { calls.push(args); return args[1] === 'show' ? JSON.stringify(other) : ''; });
  assert.deepEqual(plan, { name: 'guilduo', add: true, ready: true, accounts: true });
  assert.deepEqual(calls, [['mcp', 'show', '--json'], ['mcp', 'add', 'guilduo', '--url', endpoint, '--transport', 'streamable-http', '--auth', 'oauth', '--no-probe']]);
  assert.equal(JSON.stringify(other), before);
});

test('reinstall and alternate aliases preserve existing settings', () => {
  for (const name of ['guilduo', 'existing-guilduo']) {
    const entry = { ...native, toolFilter: { exclude: ['*write*'] }, requestTimeoutMs: 19000 };
    const servers = { [name]: entry };
    const before = structuredClone(servers);
    assert.deepEqual(planSetup(servers), { name, add: false, ready: true, accounts: name === 'guilduo' });
    assert.deepEqual(servers, before);
    let calls = 0;
    setup(() => { calls++; return JSON.stringify(servers); });
    assert.equal(calls, 1);
  }
});

test('disabled, wrong transport/auth, requester and profile entries are never repaired silently', () => {
  for (const delta of [{ enabled: false }, { auth: undefined }, { transport: 'sse' }, { command: 'existing' }, { oauth: { identity: 'per-requester' } }, { oauth: { authProfileId: 'existing-profile' } }]) {
    const servers = { guilduo: { ...native, ...delta } };
    const before = structuredClone(servers);
    assert.deepEqual(planSetup(servers), { name: 'guilduo', add: false, ready: false, accounts: false });
    assert.deepEqual(servers, before);
  }
});

test('occupied names, malformed native output and command failures stop before mutation', () => {
  for (const guilduo of [null, 'bad', { command: 'existing' }, { url: 'https://other.example/mcp' }]) assert.throws(() => planSetup({ guilduo }), /occupied/);
  for (const malformed of [null, [], 'bad', 1]) assert.throws(() => planSetup(malformed), /Invalid/);
  assert.throws(() => setup(() => '{invalid'), { message: 'Invalid native MCP config output; no changes made.' });
  let calls = 0;
  assert.throws(() => setup(() => { calls++; throw new Error('Native failure'); }), /Native failure/);
  assert.equal(calls, 1);
});

test('malformed native JSON never exposes header secrets through the CLI error boundary', () => {
  let calls = 0;
  const sensitiveOutput = '{"guilduo":{"headers":{"Authorization":S3CR3T}}}';
  assert.throws(() => setup(() => { calls++; return sensitiveOutput; }), error => {
    assert.equal((error as Error).message, 'Invalid native MCP config output; no changes made.');
    assert.doesNotMatch(String(error), /S3CR3T|Authorization|headers/);
    return true;
  });
  assert.equal(calls, 1);
});

test('stage rejects linked destination ancestors before creating any external child', async () => {
  const qa = new URL('.qa-artifacts/', plugin);
  await mkdir(qa, { recursive: true });
  const root = await mkdtemp(join(fileURLToPath(qa), 'stage-links-'));
  const destination = join(root, 'repo/plugins/guilduo-openclaw');
  const outside = join(root, 'outside');
  await mkdir(destination, { recursive: true });
  await mkdir(outside);
  await cp(fileURLToPath(canonical), join(root, 'repo/skills/guilduo-workflows'), { recursive: true });
  await copyFile(new URL('../LICENSE', import.meta.url), join(root, 'repo/LICENSE'));
  await copyFile(new URL('stage.mjs', plugin), join(destination, 'stage.mjs'));
  await symlink(outside, join(destination, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = spawnSync(process.execPath, [join(destination, 'stage.mjs')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Linked output directory/);
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(access(join(destination, 'LICENSE')));
});

test('stage refuses a hard-linked destination file without changing its other owner', async () => {
  const root = await mkdtemp(join(fileURLToPath(new URL('.qa-artifacts/', plugin)), 'stage-files-'));
  const destination = join(root, 'repo/plugins/guilduo-openclaw');
  await mkdir(destination, { recursive: true });
  await cp(fileURLToPath(canonical), join(root, 'repo/skills/guilduo-workflows'), { recursive: true });
  await copyFile(new URL('../LICENSE', import.meta.url), join(root, 'repo/LICENSE'));
  await copyFile(new URL('stage.mjs', plugin), join(destination, 'stage.mjs'));
  const owner = join(root, 'owner');
  await copyFile(new URL('NOTICE', plugin), owner);
  const before = await readFile(owner);
  await link(owner, join(destination, 'LICENSE'));
  const result = spawnSync(process.execPath, [join(destination, 'stage.mjs')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Linked output/);
  assert.deepEqual(await readFile(owner), before);
});
