// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
const plugin = new URL('../', import.meta.url);
const json = async url => JSON.parse(await readFile(url, 'utf8'));
async function tree(url, prefix = '') {
  const names = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) names.push(...await tree(new URL(`${entry.name}/`, url), `${name}/`));
    else names.push(name);
  }
  return names.sort();
}

test('marketplace lists exactly this plugin under a matching name', async () => {
  const marketplace = await json(new URL('.claude-plugin/marketplace.json', root));
  const manifest = await json(new URL('.claude-plugin/plugin.json', plugin));
  assert.equal(marketplace.name, 'guilduo');
  assert.deepEqual(marketplace.plugins.map(entry => [entry.name, entry.source]), [[manifest.name, './plugins/guilduo-claude']]);
  assert.equal(manifest.name, 'guilduo');
});

test('only the official OAuth MCP endpoint is declared, with no credentials', async () => {
  const mcp = await json(new URL('.mcp.json', plugin));
  assert.deepEqual(mcp, { mcpServers: { guilduo: { type: 'http', url: 'https://mcp.guilduo.com/mcp' } } });
  const manifest = await json(new URL('.claude-plugin/plugin.json', plugin));
  for (const key of ['mcpServers', 'hooks', 'agents', 'commands', 'monitors', 'channels', 'userConfig', 'settings', 'experimental']) assert.equal(manifest[key], undefined, key);
});

test('distribution contains only MCP, the canonical Skill and documentation', async () => {
  const skill = (await tree(new URL('../../../skills/guilduo-workflows/', import.meta.url))).filter(name => !name.startsWith('agents/'));
  assert.deepEqual((await tree(plugin)).filter(name => !name.startsWith('tests/')), [
    '.claude-plugin/plugin.json', '.mcp.json', 'LICENSE', 'NOTICE', 'README.jp.md', 'README.md',
    ...skill.map(name => `skills/guilduo-workflows/${name}`), 'stage.mjs',
  ].sort());
});

test('staged Skill and license are byte-identical to the canonical sources', async () => {
  const canonical = new URL('skills/guilduo-workflows/', root);
  const names = (await tree(canonical)).filter(name => !name.startsWith('agents/'));
  for (const name of names) assert.deepEqual(await readFile(new URL(`skills/guilduo-workflows/${name}`, plugin)), await readFile(new URL(name, canonical)), name);
  assert.deepEqual(await readFile(new URL('LICENSE', plugin)), await readFile(new URL('LICENSE', root)));
});

test('external links in READMEs point only to the public repository or official sites', async () => {
  for (const name of ['README.md', 'README.jp.md']) {
    const text = await readFile(fileURLToPath(new URL(name, plugin)), 'utf8');
    for (const [url] of text.matchAll(/https?:\/\/[^\s)>`"]+/g)) {
      assert.match(url, /^https:\/\/(github\.com\/ELRdn\/Guilduo|guilduo\.com\/|app\.guilduo\.com\/|mcp\.guilduo\.com\/mcp|code\.claude\.com\/docs\/)/, `${name}: ${url}`);
    }
  }
});
