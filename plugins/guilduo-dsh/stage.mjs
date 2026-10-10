// SPDX-License-Identifier: AGPL-3.0-only
import { copyFile, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const base = await realpath(fileURLToPath(new URL('./', import.meta.url)));
async function directory(anchor, path, create = false) {
  let current = anchor;
  for (const segment of path.split('/').filter(Boolean)) {
    current = resolve(current, segment);
    let info = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (!info && create) { await mkdir(current); info = await lstat(current); }
    if (!info?.isDirectory() || info.isSymbolicLink() || await realpath(current) !== current) throw new Error('Linked or missing staging directory');
  }
  return current;
}
// Canonical Markdown references and OpenAI metadata only; never copy workspace settings or credentials.
await directory(root, 'skills/guilduo-workflows/references');
await directory(root, 'skills/guilduo-workflows/agents');
const references = await readdir(resolve(root, 'skills/guilduo-workflows/references'), { withFileTypes: true });
if (references.some((entry) => !entry.isFile() || !/^[a-z0-9-]+\.md$/.test(entry.name))) {
  throw new Error('Canonical references must be regular Markdown files');
}
for (const [source, target, anchor] of [
  ...['SKILL.md', 'agents/openai.yaml', ...references.map((entry) => `references/${entry.name}`)]
    .map(name => [resolve(root, 'skills/guilduo-workflows', name), resolve(base, 'skills/guilduo-workflows', name), resolve(root, 'skills/guilduo-workflows')]),
  [resolve(root, 'LICENSE'), resolve(base, 'LICENSE'), root],
]) {
  const child = relative(anchor, await realpath(source));
  if (child.startsWith('..') || isAbsolute(child)) throw new Error('Skill source escapes canonical directory');
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('Linked canonical file');
  const parent = await directory(base, relative(base, resolve(target, '..')).replaceAll('\\', '/'), true);
  const owned = relative(base, await realpath(parent));
  if (owned.startsWith('..') || isAbsolute(owned)) throw new Error('Skill output escapes plugin');
  const existing = await lstat(target).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error('Refuse linked staging output');
  await copyFile(source, target);
}
await directory(root, '.qa-artifacts/guilduo-dsh', true);
const artifact = relative(root, await realpath(resolve(root, '.qa-artifacts/guilduo-dsh')));
if (artifact.startsWith('..') || isAbsolute(artifact)) throw new Error('Artifact output escapes repository');
