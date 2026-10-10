// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [archive, host] = process.argv.slice(2);
const verifyGitIndex = process.argv.slice(4).includes('--git-index');
assert.ok(archive && host);
const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireHost = createRequire(host);
const tar = requireHost('tar');
const files = new Map();
await tar.t({ file: archive, onReadEntry(entry) {
  assert.equal(entry.type, 'File');
  assert.match(entry.path, /^package\/(?!.*(?:\.\.|node_modules|\.qa-artifacts|tests\/|package-lock))/);
  assert.ok(!files.has(entry.path));
  const chunks = []; entry.on('data', chunk => chunks.push(chunk));
  entry.on('end', () => files.set(entry.path, Buffer.concat(chunks)));
} });
const expected = ['LICENSE', 'NOTICE', 'README.md', 'README.jp.md', 'build.mjs', 'lib/index.js', 'src/index.ts', 'openclaw.plugin.json', 'package.json', 'setup.mjs', 'stage.mjs'];
for (const dir of ['', 'references/', 'agents/']) {
  for (const entry of await readdir(join(base, 'skills/guilduo-workflows', dir), { withFileTypes: true })) if (entry.isFile()) expected.push(`skills/guilduo-workflows/${dir}${entry.name}`);
}
assert.deepEqual([...files.keys()].sort(), expected.map(name => `package/${name}`).sort());
for (const name of expected) assert.deepEqual(files.get(`package/${name}`), await readFile(join(base, name)), name);
const stagedGitBlobs = [];
if (verifyGitIndex) {
  const repository = resolve(base, '../..');
  for (const name of expected) {
    const indexPath = `plugins/guilduo-openclaw/${name}`;
    // Read raw staged bytes without shell pipelines, text encoding or Git mutation.
    const result = spawnSync('git', ['-C', repository, 'show', `:${indexPath}`], { maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, `Staged Git blob is unavailable: ${indexPath}`);
    assert.deepEqual(files.get(`package/${name}`), result.stdout, `Archive differs from staged Git blob: ${indexPath}`);
    stagedGitBlobs.push({ path: indexPath, sha256: createHash('sha256').update(result.stdout).digest('hex') });
  }
}
const pkg = JSON.parse(files.get('package/package.json'));
const hostPackage = JSON.parse(await readFile(join(dirname(host), 'package.json'), 'utf8'));
const semver = requireHost('semver');
assert.equal(pkg.engines.node, hostPackage.engines.node);
assert.ok(semver.satisfies(process.version, pkg.engines.node));
assert.ok(semver.satisfies(hostPackage.version, pkg.openclaw.compat.pluginApi));
assert.ok(semver.gte(hostPackage.version, pkg.openclaw.compat.minGatewayVersion));
assert.ok(!semver.satisfies('2026.9.8', pkg.openclaw.compat.pluginApi));
assert.ok(!semver.satisfies('2026.9.10', pkg.openclaw.compat.pluginApi));
const entryUrl = pathToFileURL(join(base, 'lib/index.js')).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === entryUrl && specifier === 'openclaw/plugin-sdk/plugin-entry') return { url: pathToFileURL(requireHost.resolve(specifier)).href, shortCircuit: true };
  return next(specifier, context);
} });
try {
  const { default: entry } = await import(entryUrl);
  assert.equal(entry.id, 'guilduo');
  assert.ok(entry.configSchema);
  const trap = new Proxy({}, { get() { throw new Error('Unexpected plugin runtime API access'); } });
  assert.equal(entry.register(trap), undefined);
} finally { hooks.deregister(); }
console.log(JSON.stringify({ archive: resolve(archive), sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files: expected.sort(), stagedGitBlobs, sdk: requireHost.resolve('openclaw/plugin-sdk/plugin-entry'), node: process.version, compat: pkg.openclaw.compat, build: pkg.openclaw.build }));
