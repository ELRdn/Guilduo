// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../../../', import.meta.url)));
const artifacts = resolve(root, '.qa-artifacts/guilduo-dsh-stage');
await mkdir(artifacts, { recursive: true });
const owned = relative(root, await realpath(artifacts));
assert.ok(owned && !owned.startsWith('..') && !isAbsolute(owned));
const run = promisify(execFile);
for (const mode of ['regular', 'skill-hardlink', 'license-hardlink', 'license-directory', 'parent-junction', 'source-hardlink']) {
  test(`DSH stage protects canonical copies: ${mode}`, async () => {
    const fixture = await mkdtemp(resolve(artifacts, 'case-'));
    const base = resolve(fixture, 'plugins/guilduo-dsh');
    const canonical = resolve(fixture, 'skills/guilduo-workflows');
    try {
      await mkdir(base, { recursive: true });
      await mkdir(resolve(canonical, 'agents'), { recursive: true });
      await mkdir(resolve(canonical, 'references'));
      await writeFile(resolve(canonical, 'SKILL.md'), 'canonical Skill');
      await writeFile(resolve(canonical, 'agents/openai.yaml'), 'canonical metadata');
      await writeFile(resolve(canonical, 'references/tools.md'), 'canonical tools');
      await writeFile(resolve(fixture, 'LICENSE'), 'canonical license');
      await writeFile(resolve(fixture, 'protected.txt'), 'must survive');
      await copyFile(new URL('../stage.mjs', import.meta.url), resolve(base, 'stage.mjs'));
      const protectedFile = resolve(fixture, 'protected.txt');
      if (mode === 'parent-junction') {
        await mkdir(resolve(fixture, 'unowned'));
        await symlink(resolve(fixture, 'unowned'), resolve(base, 'skills'), 'junction');
      } else await mkdir(resolve(base, 'skills/guilduo-workflows'), { recursive: true });
      if (mode === 'skill-hardlink') await link(protectedFile, resolve(base, 'skills/guilduo-workflows/SKILL.md'));
      if (mode === 'license-hardlink') await link(protectedFile, resolve(base, 'LICENSE'));
      if (mode === 'license-directory') await mkdir(resolve(base, 'LICENSE'));
      if (mode === 'source-hardlink') await link(resolve(canonical, 'SKILL.md'), resolve(fixture, 'alias.md'));
      const staging = run(process.execPath, [resolve(base, 'stage.mjs')], { timeout: 10_000, windowsHide: true });
      if (mode === 'regular') {
        await staging;
        for (const name of ['SKILL.md', 'agents/openai.yaml', 'references/tools.md']) {
          assert.deepEqual(await readFile(resolve(base, 'skills/guilduo-workflows', name)), await readFile(resolve(canonical, name)));
        }
        assert.deepEqual(await readFile(resolve(base, 'LICENSE')), await readFile(resolve(fixture, 'LICENSE')));
      } else await assert.rejects(staging, /Linked|linked/);
      assert.equal(await readFile(protectedFile, 'utf8'), 'must survive');
      if (mode === 'parent-junction') {
        await assert.rejects(readFile(resolve(fixture, 'unowned/guilduo-workflows/SKILL.md')), { code: 'ENOENT' });
      }
    } finally {
      const checked = relative(artifacts, await realpath(fixture));
      assert.ok(checked && !checked.startsWith('..') && !isAbsolute(checked));
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
