// SPDX-License-Identifier: AGPL-3.0-only
// Recheck the final archive after documented README/helper-formatting edits.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [archiveArg, hostArg, evidenceArg, priorArg] = process.argv.slice(2);
const verifyGitIndex = process.argv.slice(6).includes('--git-index');
assert.ok(archiveArg && hostArg && evidenceArg && priorArg, 'Pass final archive, host entry, completed native receipt and its immutable archive');
const archive = resolve(archiveArg), host = resolve(hostArg), priorArchive = resolve(priorArg);
const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qa = join(base, '.qa-artifacts');
assert.ok((await realpath(qa)).startsWith((await realpath(base)) + sep));
const evidence = JSON.parse(await readFile(resolve(evidenceArg), 'utf8'));
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
assert.equal(await digest(priorArchive), evidence.sha256, 'Prior suite receipt must identify the archived package');
const tar = createRequire(host)('tar');
async function contents(file) {
  const result = new Map();
  await tar.t({ file, onReadEntry(entry) {
    assert.equal(entry.type, 'File');
    const chunks = []; entry.on('data', chunk => chunks.push(chunk)); entry.on('end', () => result.set(entry.path, Buffer.concat(chunks)));
  } });
  return result;
}
const before = await contents(priorArchive), after = await contents(archive);
assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort());
const differences = [];
for (const [path, bytes] of after) if (!bytes.equals(before.get(path))) differences.push(path);
const documentationOnlyDifferences = differences.filter(path => ['package/README.md', 'package/README.jp.md'].includes(path));
const helperFormattingOnlyDifferences = differences.filter(path => path === 'package/stage.mjs');
const normalizedHelper = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n').replace(/\n+$/, '\n');
for (const path of helperFormattingOnlyDifferences) {
  assert.equal(normalizedHelper(after.get(path)), normalizedHelper(before.get(path)), `Helper changed beyond EOL/terminal blank lines: ${path}`);
}
assert.ok(differences.every(path => documentationOnlyDifferences.includes(path) || helperFormattingOnlyDifferences.includes(path)), `Runtime changed after native suite: ${differences.join(', ')}`);
const root = await mkdtemp(join(qa, 'final-'));
for (const name of ['home', 'state', 'tmp', 'cache', 'config', 'data', 'workspace']) await mkdir(join(root, name));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), OPENCLAW_HOME: join(root, 'home'), OPENCLAW_STATE_DIR: join(root, 'state'), OPENCLAW_CONFIG_PATH: join(root, 'state/openclaw.json'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
  OPENCLAW_NO_RESPAWN: '1', OPENCLAW_HIDE_BANNER: '1', OPENCLAW_SKIP_UPDATE_CHECK: '1',
  npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_ignore_scripts: 'true', npm_config_package_lock: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'),
});
await writeFile(env.npm_config_userconfig, 'ignore-scripts=true\npackage-lock=false\n'); await writeFile(env.GIT_CONFIG_GLOBAL, '');
await writeFile(env.OPENCLAW_CONFIG_PATH, '{}');
const commands = [];
async function run(entry, args) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: join(root, 'workspace'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 60000);
  const status = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res); }).finally(() => clearTimeout(timer));
  commands.push({ entry, args, status });
  assert.equal(status, 0, `${args[0]} ${args[1]} failed; native output is not logged`);
  return stdout;
}
const artifact = JSON.parse(await run(join(base, 'tests/artifact-check.mjs'), [archive, host, ...verifyGitIndex ? ['--git-index'] : []]));
await run(host, ['plugins', 'install', archive, '--force', '--accept-capabilities']);
const inspectionOutput = await run(host, ['plugins', 'inspect', 'guilduo', '--runtime', '--json']);
const inspection = JSON.parse(inspectionOutput.slice(inspectionOutput.indexOf('{')));
assert.equal(inspection.plugin.status, 'loaded'); assert.equal(inspection.plugin.imported, true); assert.deepEqual(inspection.diagnostics, []);
assert.match(await run(host, ['skills', 'list', '--json']), /guilduo-workflows/);
await run(host, ['plugins', 'uninstall', 'guilduo', '--force']);
const receipt = join(root, 'receipt.json');
await writeFile(receipt, JSON.stringify({ artifact, priorNativeReceipt: resolve(evidenceArg), priorSha256: evidence.sha256, documentationOnlyDifferences, helperFormattingOnlyDifferences, nativeFinalSmoke: 'passed', commands }, null, 2));
console.log(`Final archive receipt: ${receipt}`);
