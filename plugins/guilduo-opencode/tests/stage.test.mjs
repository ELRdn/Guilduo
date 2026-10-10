import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { selectedGoKey } from './native-key.mjs';
import { requiredPhaseReads } from './native-phase-reads.mjs';

const artifacts = new URL('../artifacts/', import.meta.url);
test('native acceptance requires distinct successful context and exact returned Quest reads', () => {
  const part = (tool, id = 'fixture-quest', status = 'completed') => ({ type: 'tool', tool, state: { status, input: { actingAgentId: 'fixture-agent', questId: 'fixture-quest' }, output: JSON.stringify({ id }) } });
  const context = part('guilduo_get_current_agent_context'), quest = part('guilduo_get_quest');
  assert.throws(() => requiredPhaseReads([context, context]), /exact Quest/);
  assert.throws(() => requiredPhaseReads([context, part('guilduo_get_quest', 'wrong-quest')]), /exact Quest/);
  assert.throws(() => requiredPhaseReads([context, part('guilduo_get_quest', 'fixture-quest', 'error')]), /exact Quest/);
  assert.throws(() => requiredPhaseReads([quest]), /context read/);
  assert.deepEqual(requiredPhaseReads([context, quest]), { contextReads: 1, questReads: 1, returnedQuestIdMatch: true });
});
async function fixture(t) {
  await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(fileURLToPath(new URL('stage-test-', artifacts)));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), plugin = join(repo, 'plugins/guilduo-opencode');
  await mkdir(join(plugin, 'skills'), { recursive: true });
  await mkdir(join(repo, 'skills/guilduo-workflows/references'), { recursive: true });
  await writeFile(join(repo, 'LICENSE'), 'license');
  await writeFile(join(repo, 'skills/guilduo-workflows/SKILL.md'), 'skill');
  await writeFile(join(repo, 'skills/guilduo-workflows/references/tools.md'), 'tools');
  await copyFile(new URL('../stage.mjs', import.meta.url), join(plugin, 'stage.mjs'));
  const run = () => spawnSync(process.execPath, [join(plugin, 'stage.mjs')], { encoding: 'utf8' });
  return { root, repo, plugin, run };
}
test('stage copies canonical files into missing ordinary directories', async t => {
  const f = await fixture(t); const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(f.plugin, 'skills/guilduo-workflows/SKILL.md'), 'utf8'), 'skill');
  assert.equal(await readFile(join(f.plugin, 'LICENSE'), 'utf8'), 'license');
});
test('stage rejects directory links before creating paths or copying outside the package', async t => {
  const f = await fixture(t), outside = join(f.root, 'outside');
  await mkdir(outside); await rm(join(f.plugin, 'skills'), { recursive: true });
  await symlink(outside, join(f.plugin, 'skills'), 'junction');
  assert.notEqual(f.run().status, 0);
  await assert.rejects(readFile(join(outside, 'guilduo-workflows/SKILL.md')), { code: 'ENOENT' });
});
test('stage rejects linked canonical directories and hardlinked output files', async t => {
  const f = await fixture(t), original = join(f.root, 'retained');
  await writeFile(original, 'do not replace'); await link(original, join(f.plugin, 'LICENSE'));
  assert.notEqual(f.run().status, 0);
  assert.equal(await readFile(original, 'utf8'), 'do not replace');
  await rm(join(f.plugin, 'LICENSE'));
  await rm(join(f.repo, 'skills/guilduo-workflows'), { recursive: true });
  await symlink(join(f.plugin, 'skills'), join(f.repo, 'skills/guilduo-workflows'), 'junction');
  assert.notEqual(f.run().status, 0);
});
test('only the selected native API entry is decoded, including escaped strings and nested metadata', async t => {
  const f = await fixture(t), path = join(f.root, 'synthetic-auth.json');
  await writeFile(path, JSON.stringify({ unrelated: { key: 'unrelated-public-fixture' }, 'opencode-go': { type: 'api', key: 'public-fixture-"\\-key', metadata: { nested: [] } }, other: { type: 'api', key: 'never-use' } }));
  assert.equal(await selectedGoKey(path), 'public-fixture-"\\-key');
  await writeFile(path, '{"other":{"key":"public-fixture"}}');
  await assert.rejects(selectedGoKey(path), /not found/);
  await writeFile(path, '{"opencode-go":{"type":"oauth","key":"public-fixture"}}');
  await assert.rejects(selectedGoKey(path), /missing/);
});
