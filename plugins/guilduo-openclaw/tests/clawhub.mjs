// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qa = join(base, '.qa-artifacts');
assert.ok((await realpath(qa)).startsWith((await realpath(base)) + sep));
const root = await mkdtemp(join(qa, 'clawhub-0.23.3-'));
for (const name of ['home', 'config', 'cache', 'tmp', 'cli']) await mkdir(join(root, name));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'cache'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
  npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'user.npmrc'), npm_config_globalconfig: join(root, 'global.npmrc'),
  npm_config_ignore_scripts: 'true', npm_config_package_lock: 'false', npm_config_audit: 'false', npm_config_fund: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'), CI: '1', NO_COLOR: '1',
});
await writeFile(env.npm_config_userconfig, 'registry=https://registry.npmjs.org/\n');
await writeFile(env.npm_config_globalconfig, '');
await writeFile(env.GIT_CONFIG_GLOBAL, '');
const commands = [];
async function run(entry, args, label) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const timer = setTimeout(() => child.kill(), 300000);
  const status = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res); }).finally(() => clearTimeout(timer));
  // This fresh environment has no registry credential; never inspect the real CLI profile.
  commands.push({ label, args, status, stdout, stderr });
  await writeFile(join(root, 'receipt.json'), JSON.stringify({ cliVersion: '0.23.3', globalCliChanged: false, root, commands }, null, 2));
  console.log(`${label}: exit ${status}`);
  return { status, stdout, stderr };
}
const npmEntry = resolve(process.argv[2]);
assert.equal((await run(npmEntry, ['install', '--prefix', join(root, 'cli'), '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund', 'clawhub@0.23.3'], 'isolated-install')).status, 0);
const cliPackage = JSON.parse(await readFile(join(root, 'cli/node_modules/clawhub/package.json'), 'utf8'));
assert.equal(cliPackage.version, '0.23.3');
const entry = join(root, 'cli/node_modules/clawhub', typeof cliPackage.bin === 'string' ? cliPackage.bin : cliPackage.bin.clawhub);
await run(entry, ['--cli-version'], 'version');
await run(entry, ['package', 'validate', base, '--openclaw-version', '2026.9.9', '--json'], 'static-validate');
await run(entry, ['package', 'publish', join(qa, 'guilduo-openclaw-plugin-0.6.0-beta.16.tgz'), '--family', 'code-plugin', '--owner', 'guilduo', '--dry-run'], 'publish-dry-run');
console.log(`ClawHub receipt: ${join(root, 'receipt.json')}`);
