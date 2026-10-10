// SPDX-License-Identifier: AGPL-3.0-only
import { copyFile, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const base = await realpath(fileURLToPath(new URL('./', import.meta.url)));
// Canonical Markdown references and OpenAI metadata only; never copy workspace settings or credentials.
const references = await readdir(resolve(root, 'skills/guilduo-workflows/references'), { withFileTypes: true });
if (references.some((entry) => !entry.isFile() || !/^[a-z0-9-]+\.md$/.test(entry.name))) {
  throw new Error('Canonical references must be regular Markdown files');
}
for (const name of ['SKILL.md', 'agents/openai.yaml', ...references.map((entry) => `references/${entry.name}`)]) {
  const source = await realpath(resolve(root, 'skills/guilduo-workflows', name));
  const child = relative(resolve(root, 'skills/guilduo-workflows'), source);
  if (child.startsWith('..') || isAbsolute(child)) throw new Error('Skill source escapes canonical directory');
  const target = resolve(base, 'skills/guilduo-workflows', name);
  const parent = resolve(target, '..');
  await mkdir(parent, { recursive: true });
  const owned = relative(base, await realpath(parent));
  if (owned.startsWith('..') || isAbsolute(owned)) throw new Error('Skill output escapes plugin');
  const existing = await lstat(target).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  if (existing?.isSymbolicLink()) throw new Error('Refuse linked Skill output');
  await copyFile(source, target);
}
await copyFile(resolve(root, 'LICENSE'), resolve(base, 'LICENSE'));
await mkdir(resolve(root, '.qa-artifacts/guilduo-dsh'), { recursive: true });
const artifact = relative(root, await realpath(resolve(root, '.qa-artifacts/guilduo-dsh')));
if (artifact.startsWith('..') || isAbsolute(artifact)) throw new Error('Artifact output escapes repository');
