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
const canonical = resolve(root, 'skills/guilduo-workflows');
await directory(root, 'skills/guilduo-workflows/references');
const references = await readdir(resolve(canonical, 'references'), { withFileTypes: true });
if (references.some(entry => !entry.isFile() || !/^[a-z0-9-]+\.md$/.test(entry.name))) throw new Error('Invalid canonical references');
for (const [source, target] of [
  ...['SKILL.md', ...references.map(entry => `references/${entry.name}`)].map(name => [resolve(canonical, name), resolve(base, 'skills/guilduo-workflows', name)]),
  [resolve(root, 'LICENSE'), resolve(base, 'LICENSE')],
]) {
  const actual = await realpath(source);
  if (relative(root, actual).startsWith('..') || isAbsolute(relative(root, actual))) throw new Error('Source escapes repository');
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('Linked canonical file');
  const parent = await directory(base, relative(base, resolve(target, '..')).replaceAll('\\', '/'), true);
  if (relative(base, await realpath(parent)).startsWith('..') || isAbsolute(relative(base, await realpath(parent)))) throw new Error('Output escapes plugin');
  const existing = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error('Linked output');
  await copyFile(source, target);
}
