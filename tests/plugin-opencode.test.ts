import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const plugin = new URL('../plugins/guilduo-opencode/', import.meta.url);
const canonical = new URL('../skills/guilduo-workflows/', import.meta.url);
test('OpenCode native package keeps dependencies isolated and publishes only explicit artifacts', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', plugin), 'utf8'));
  assert.equal(manifest.name, '@guilduo/opencode-plugin');
  assert.equal(manifest.version, '0.6.0-beta.16');
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'AGPL-3.0-only');
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies['@opencode-ai/plugin'], '1.18.32');
  assert.deepEqual(manifest.exports, { '.': './lib/index.js' });
  assert.deepEqual(manifest.files, ['lib', 'src', 'skills/guilduo-workflows', 'README.md', 'README.jp.md', 'LICENSE', 'NOTICE', 'stage.mjs', 'tsconfig.json']);
  const source = await readFile(new URL('src/index.ts', plugin), 'utf8');
  assert.doesNotMatch(source, /fetch\(|writeFile|readFile|process\.env|export\s+(?:const|function|class)/);
  assert.match(source, /export default guilduo/);
  for (const name of ['README.md', 'README.jp.md']) {
    const text = await readFile(new URL(name, plugin), 'utf8');
    assert.doesNotMatch(text, /\]\(\.\.\/|not yet published|npm公開は未実施/);
    assert.match(text, /https:\/\/github\.com\/ELRdn\/Guilduo\/blob\/main\/docs\/guilduo-host-extensions-status\.md/);
  }
});
test('OpenCode Skill and all references equal the canonical source', async () => {
  assert.deepEqual(await readdir(new URL('skills/', plugin)), ['guilduo-workflows']);
  assert.match(await readFile(new URL('skills/guilduo-workflows/SKILL.md', plugin), 'utf8'), /^---\r?\nname: guilduo-workflows\r?\n/);
  const references = await readdir(new URL('references/', canonical));
  assert.deepEqual((await readdir(new URL('skills/guilduo-workflows/references/', plugin))).sort(), references.sort());
  for (const name of ['SKILL.md', ...references.map(name => `references/${name}`)]) {
    assert.deepEqual(await readFile(new URL(`skills/guilduo-workflows/${name}`, plugin)), await readFile(new URL(name, canonical)), name);
  }
  assert.deepEqual(await readFile(new URL('LICENSE', plugin)), await readFile(new URL('../LICENSE', import.meta.url)));
});
