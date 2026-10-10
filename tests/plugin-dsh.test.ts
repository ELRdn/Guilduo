import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const plugin = new URL('../plugins/guilduo-dsh/', import.meta.url);
const canonical = new URL('../skills/guilduo-workflows/', import.meta.url);
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

test('DSH PoC manifest isolates fixed dependencies and excludes runtime tests/credentials from tarball', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', plugin), 'utf8'));
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.version, '0.6.0-beta.17');
  assert.equal(manifest.license, 'AGPL-3.0-only');
  assert.equal(manifest.dependencies['@modelcontextprotocol/client'], '2.0.0');
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-mcp-client'], '0.2.0-rc.2');
  assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '4.0.4');
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-agent'], '0.2.0-rc.2');
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-api-session-controller'], '0.2.0-rc.2');
  for (const patch of ['cordis.patch.yml', 'dsh.bundle.patch.yml']) {
    assert.match(await readFile(new URL(patch, plugin), 'utf8'), /inject: \[tools, skills, credentials, agents, sessions, sessionController\]/);
  }
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.deepEqual(manifest.publishConfig, { access: 'public', tag: 'beta', registry: 'https://registry.npmjs.org/' });
  assert.ok(manifest.keywords.includes('dsh'));
  assert.equal(manifest.repository.directory, 'plugins/guilduo-dsh');
  assert.deepEqual(manifest.files, ['lib', 'src', 'skills/guilduo-workflows', 'stage.mjs', 'README.md', 'NOTICE', 'LICENSE', 'cordis.patch.yml', 'dsh.bundle.patch.yml', 'tsconfig.json', 'build-client.mjs', 'tsconfig.client.json']);
  assert.match(manifest.scripts.test, /tests\/persistence\.test\.ts/);
  assert.deepEqual(manifest.dsh.client, { platform: 'web' });
  assert.equal(manifest.exports['./client'], './lib/client.js');
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-typert-protocol'], '0.2.0-rc.2');
  assert.ok(manifest.devDependencies.tsx);
  const source = await readFile(new URL('src/adapter.ts', plugin), 'utf8');
  const authFetch = /const authFetch: typeof fetch = \(input, init\) => fetch\(input, \{ \.\.\.init,\s*signal: AbortSignal\.any\(\[lifecycle\.signal, \.\.\.\(init\?\.signal \? \[init\.signal\] : \[\]\)\]\) \}\);/.exec(source);
  assert.ok(authFetch, 'Only the SDK OAuth fetch wrapper may call fetch, with the lifecycle signal');
  const rest = source.replace(authFetch[0], '');
  assert.equal([...rest.matchAll(/deps\.authorize\(provider,\s*\{\s*serverUrl: MCP_URL,\s*fetchFn: authFetch/g)].length, 2);
  assert.doesNotMatch(rest, /writeFile|readFile|fetch\(|authFetch\(|stop_hook_active|agent\/run/);
});

test('DSH packaged canonical Skill, full Markdown references, metadata and AGPL hashes match without isolated dependencies', async () => {
  assert.deepEqual(await readdir(new URL('skills/', plugin)), ['guilduo-workflows']);
  assert.match(await readFile(new URL('skills/guilduo-workflows/SKILL.md', plugin), 'utf8'), /^---\r?\nname: guilduo-workflows\r?\n/);
  const references = await readdir(new URL('references/', canonical));
  assert.ok(references.includes('local-hooks.md'));
  assert.deepEqual((await readdir(new URL('skills/guilduo-workflows/references/', plugin))).sort(), references.sort());
  for (const path of ['SKILL.md', 'agents/openai.yaml', ...references.map((name) => `references/${name}`)]) {
    assert.equal(hash(await readFile(new URL(`skills/guilduo-workflows/${path}`, plugin))), hash(await readFile(new URL(path, canonical))), path);
  }
  assert.equal(hash(await readFile(new URL('LICENSE', plugin))), hash(await readFile(new URL('../LICENSE', import.meta.url))));
  assert.match(await readFile(new URL('NOTICE', plugin), 'utf8'), /5badb15009ae1756c3afe0ae0cef1faafc290ccc/);
});
