// SPDX-License-Identifier: AGPL-3.0-only
// No profile boot or inference: use the installed CLI's package manager and config discovery only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = resolve(process.argv[2]);
const archive = resolve(process.argv[3]);
const previousArchive = process.argv[4] ? resolve(process.argv[4]) : undefined;
const installed = JSON.parse(await readFile(join(dirname(entry), '../package.json'), 'utf8'));
assert.equal(installed.version, '0.2.0-rc.2');
const artifactRoot = join(root, '.qa-artifacts/guilduo-dsh-host');
await mkdir(artifactRoot, { recursive: true });
const run = await mkdtemp(join(artifactRoot, 'install-'));
const home = join(run, 'home'); const profile = join(home, 'dsh/profiles/guilduo-isolated');
for (const path of [profile, join(home, 'appdata'), join(home, 'local'), join(run, 'tmp')]) await mkdir(path, { recursive: true });
const env = Object.fromEntries(['PATH', 'SystemRoot', 'SystemDrive', 'ComSpec', 'PATHEXT', 'windir'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(env, {
  DSH_HOME: join(home, 'dsh'), HOME: home, USERPROFILE: home,
  APPDATA: join(home, 'appdata'), LOCALAPPDATA: join(home, 'local'),
  XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'),
  TEMP: join(run, 'tmp'), TMP: join(run, 'tmp'), CI: 'true', NO_COLOR: '1',
  NPM_CONFIG_USERCONFIG: join(home, '.npmrc'), NPM_CONFIG_GLOBALCONFIG: join(home, 'global.npmrc'),
});
await writeFile(env.NPM_CONFIG_USERCONFIG, `registry=https://registry.npmjs.org/\nstore-dir=${join(run, 'store').replaceAll('\\', '/')}\nignore-scripts=true\nupdate-notifier=false\n`);
await writeFile(env.NPM_CONFIG_GLOBALCONFIG, '');
const existingName = 'dsh-host-existing';
const existingPackage = join(run, existingName);
await mkdir(existingPackage);
const existingDependency = `file:${existingPackage.replaceAll('\\', '/')}`;
const existingPatch = '- insert:\n    - id: existing-bundle\n      name: dsh-host-existing\n      config:\n        marker: bundle-preserved\n';
const profilePatch = '# Existing operator configuration\n- insert:\n    - id: existing-profile-config\n      name: dsh-host-existing\n      config:\n        marker: profile-preserved\n';
await writeFile(join(existingPackage, 'package.json'), JSON.stringify({ name: existingName, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2));
await writeFile(join(existingPackage, 'cordis.patch.yml'), existingPatch);
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'guilduo-isolated', private: true, dependencies: { [existingName]: existingDependency }, dsh: { profile: { bundles: [existingName] } } }, null, 2));
await writeFile(join(profile, 'cordis.patch.yml'), profilePatch);
await writeFile(join(profile, 'pnpm-workspace.yaml'), 'packages: []\n');
const archiveHash = createHash('sha256').update(await readFile(archive)).digest('hex');
const evidence = {
  hostVersion: installed.version, nodeVersion: process.version, platform: process.platform,
  archive: { path: archive, sha256: archiveHash, status: 'archive supplied to verifier' },
  run, isolatedHome: env.DSH_HOME, checks: [], modelCalls: 0, publicOAuth: 'not attempted',
  providerConfigurationRead: false, userProfileWrites: false, packOrStage: false,
};
async function cli(label, args, commandEntry = entry) {
  const child = spawn(process.execPath, [commandEntry, ...args], { cwd: run, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', resolveExit); });
  await writeFile(join(run, `${label}.log`), output);
  evidence.checks.push({ label, entry: commandEntry, args, exitCode: code });
  await writeFile(join(run, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  assert.equal(code, 0, `${label}: see ${join(run, `${label}.log`)}`);
  return output;
}
const flags = ['--reporter=append-only', '--config.manage-package-manager-versions=false', '--config.update-notifier=false'];
async function preserved(label, manifest, guilduoCount) {
  assert.equal(manifest.dependencies[existingName], existingDependency, `${label}: existing dependency`);
  assert.deepEqual(manifest.dsh.profile.bundles, [existingName, ...Array(guilduoCount).fill('@guilduo/dsh-oauth-poc')], `${label}: bundle count/order`);
  assert.equal(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'), profilePatch, `${label}: existing config bytes`);
  assert.equal(await readFile(join(profile, 'node_modules', existingName, 'cordis.patch.yml'), 'utf8'), existingPatch, `${label}: installed existing bundle`);
  evidence.checks.push({ label, existingDependencyPreserved: true, existingBundlePreserved: true, profileConfigPreserved: true, guilduoBundleCount: guilduoCount });
}
try {
  await cli('version', ['--version']);
  await cli('existing-install', ['plugin', '--profile', 'guilduo-isolated', 'install', '--ignore-scripts', ...flags]);
  await preserved('existing-baseline', JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')), 0);
  const existingDump = await cli('existing-discovery', ['--profile', 'guilduo-isolated', '--dump-config']);
  assert.match(existingDump, /marker: bundle-preserved/);
  assert.match(existingDump, /marker: profile-preserved/);
  if (previousArchive) {
    await cli('previous-version-add', ['plugin', '--profile', 'guilduo-isolated', 'add', previousArchive, '--ignore-scripts', ...flags]);
    await preserved('previous-version-preservation', JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')), 1);
    const previous = JSON.parse(await readFile(join(profile, 'node_modules/@guilduo/dsh-oauth-poc/package.json'), 'utf8'));
    assert.equal(previous.version, '0.6.0-beta.14');
    evidence.upgradeFrom = previous.version;
  }
  await cli('add', ['plugin', '--profile', 'guilduo-isolated', 'add', archive, '--ignore-scripts', ...flags]);
  let manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
  assert.ok(manifest.dependencies['@guilduo/dsh-oauth-poc']);
  assert.ok(manifest.dsh.profile.bundles.includes('@guilduo/dsh-oauth-poc'));
  await preserved('add-preservation', manifest, 1);
  const dump = await cli('discovery', ['--profile', 'guilduo-isolated', '--dump-config']);
  assert.match(dump, /name: '@guilduo\/dsh-oauth-poc'/);
  assert.match(dump, /marker: bundle-preserved/);
  assert.match(dump, /marker: profile-preserved/);
  await cli('readd', ['plugin', '--profile', 'guilduo-isolated', 'add', archive, '--ignore-scripts', ...flags]);
  manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
  assert.ok(manifest.dependencies['@guilduo/dsh-oauth-poc']);
  await preserved('readd-preservation', manifest, 1);
  const readded = await cli('readded-discovery', ['--profile', 'guilduo-isolated', '--dump-config']);
  assert.equal(readded, dump, 'readd: unchanged composed config');
  evidence.reinstallVerified = true;
  const listed = await cli('list', ['plugin', '--profile', 'guilduo-isolated', 'list', '--depth', '0', '--json']);
  const listedPackages = JSON.parse(listed);
  assert.ok(listedPackages.some((item) => item.dependencies?.['@guilduo/dsh-oauth-poc']));
  const packagePath = join(profile, 'node_modules/@guilduo/dsh-oauth-poc');
  assert.ok((await stat(join(packagePath, 'lib/index.js'))).isFile());
  const candidate = join(root, 'plugins/guilduo-dsh');
  const candidateManifest = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
  assert.equal(JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8')).version, candidateManifest.version);
  if (previousArchive) {
    assert.notEqual(candidateManifest.version, evidence.upgradeFrom);
    evidence.upgradeTo = candidateManifest.version;
  }
  assert.equal(candidateManifest.dsh.client.platform, 'web');
  assert.ok((await stat(join(packagePath, 'lib/client.js'))).isFile());
  evidence.installedFileHashes = {};
  async function compare(path) {
    if ((await stat(join(candidate, path))).isDirectory()) {
      for (const name of await readdir(join(candidate, path))) await compare(join(path, name));
    } else {
      const current = await readFile(join(candidate, path));
      assert.deepEqual(await readFile(join(packagePath, path)), current, `Installed archive differs from candidate: ${path}`);
      evidence.installedFileHashes[path.replaceAll('\\', '/')] = createHash('sha256').update(current).digest('hex');
    }
  }
  for (const path of ['package.json', ...candidateManifest.files]) await compare(path);
  evidence.archive.status = 'current candidate; every declared package file matches installed archive';
  await cli('native-discovery', [packagePath], fileURLToPath(new URL('native-discovery.mjs', import.meta.url)));
  await cli('candidate-native-discovery', [join(root, 'plugins/guilduo-dsh')], fileURLToPath(new URL('native-discovery.mjs', import.meta.url)));
  await cli('remove', ['plugin', '--profile', 'guilduo-isolated', 'remove', '@guilduo/dsh-oauth-poc', ...flags]);
  manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies?.['@guilduo/dsh-oauth-poc'], undefined);
  assert.ok(!manifest.dsh.profile.bundles.includes('@guilduo/dsh-oauth-poc'));
  await preserved('remove-preservation', manifest, 0);
  evidence.dependencyRemoved = true;
  evidence.bundleRemoved = true;
  const removed = await cli('removed-discovery', ['--profile', 'guilduo-isolated', '--dump-config']);
  assert.doesNotMatch(removed, /@guilduo\/dsh-oauth-poc/);
  assert.equal(removed, existingDump, 'remove: restored existing config discovery');
  assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'), archiveHash);
  evidence.result = 'PASS: actual CLI add/readd/remove, single Guilduo bundle, existing bundle/dependency/config preserved, native Skill discovery/unload; no profile boot';
} catch (error) {
  evidence.result = 'FAIL'; evidence.failure = error.message;
  process.exitCode = 1;
} finally {
  if (evidence.result === 'FAIL') {
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
    if (manifest.dependencies?.['@guilduo/dsh-oauth-poc']) {
      try { await cli('failure-cleanup', ['plugin', '--profile', 'guilduo-isolated', 'remove', '@guilduo/dsh-oauth-poc', ...flags]); }
      catch { evidence.cleanup = 'failed; inspect isolated profile only'; }
    }
  }
  await writeFile(join(run, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ result: evidence.result, evidence: join(run, 'evidence.json') }));
}
