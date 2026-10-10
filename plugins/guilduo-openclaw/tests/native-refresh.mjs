// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOAuthFixture } from './oauth-fixture.mjs';

const host = resolve(process.argv[2] ?? '');
const build = JSON.parse(await readFile(join(dirname(host), 'dist/build-info.json'), 'utf8'));
assert.equal(build.commit, 'bcfc88812a35243893585dbeca87ca41b48272ca');
const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qa = join(base, '.qa-artifacts');
assert.ok((await realpath(qa)).startsWith((await realpath(base)) + sep));
const root = await mkdtemp(join(qa, 'refresh-'));
for (const name of ['home', 'state', 'tmp', 'cache', 'config', 'data', 'workspace']) await mkdir(join(root, name));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), OPENCLAW_HOME: join(root, 'home'), OPENCLAW_STATE_DIR: join(root, 'state'), OPENCLAW_CONFIG_PATH: join(root, 'state/openclaw.json'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'), OPENCLAW_NO_RESPAWN: '1', OPENCLAW_HIDE_BANNER: '1', OPENCLAW_SKIP_UPDATE_CHECK: '1',
});
const commands = [];
async function run(args, onOutput) {
  const child = spawn(process.execPath, [host, ...args], { cwd: join(root, 'workspace'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; onOutput?.(stdout); }); child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 60000);
  const status = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res); }).finally(() => clearTimeout(timer));
  commands.push({ args, status });
  assert.equal(status, 0, `${args[0]} ${args[1]} failed; native output is not logged`);
  return stdout;
}
const fixture = await startOAuthFixture({ expiresIn: 1 });
try {
  await writeFile(env.OPENCLAW_CONFIG_PATH, JSON.stringify({ mcp: { servers: { guilduo: { url: `${fixture.origin}/mcp`, transport: 'streamable-http', auth: 'oauth' } } } }));
  let authorize;
  await run(['mcp', 'login', 'guilduo'], output => {
    const match = output.match(new RegExp(`${fixture.origin}/authorize[^\\s]+`));
    if (match && !authorize) authorize = fixture.authorize(match[0]);
  });
  await authorize; assert.ok(fixture.pkceVerified());
  await run(['mcp', 'probe', 'guilduo', '--json']);
  const first = fixture.rotation();
  assert.ok(first.consumed.length >= 1);
  assert.ok(first.acceptedAccess.includes(first.currentAccess), 'Native probe must use refreshed access token');
  await run(['mcp', 'probe', 'guilduo', '--json']);
  const second = fixture.rotation();
  assert.ok(second.consumed.includes(first.currentRefresh), 'Fresh native process must consume the stored rotated refresh token');
  assert.ok(second.acceptedAccess.includes(second.currentAccess), 'Second probe must use the next refreshed access token');
  assert.equal(new Set(second.consumed).size, second.consumed.length, 'No consumed refresh token may be reused');
  await run(['mcp', 'logout', 'guilduo']);
  const status = JSON.parse(await run(['mcp', 'status', '--json']));
  assert.equal(status.servers[0].authStatus.state, 'unauthenticated');
  const receipt = join(root, 'receipt.json');
  await writeFile(receipt, JSON.stringify({ host: build, node: process.version, expiresIn: 1, refreshCount: second.consumed.length, distinctRefreshes: new Set(second.consumed).size, commands, result: 'passed' }, null, 2));
  console.log(`PASS native expired-token refresh and rotation; receipt: ${receipt}`);
} finally { await fixture.close(); }
