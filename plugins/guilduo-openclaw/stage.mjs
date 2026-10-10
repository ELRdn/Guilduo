// SPDX-License-Identifier: AGPL-3.0-only
import { copyFile, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const base = await realpath(fileURLToPath(new URL('./', import.meta.url)));
async function ensureDirectory(path) {
  const within = relative(base, path);
  if (within.startsWith('..') || isAbsolute(within)) throw new Error('Output escapes plugin');
  // Check every existing ancestor before mkdir can follow a junction outside the package.
  for (let current = path; current !== base; current = resolve(current, '..')) {
    const info = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Linked output directory');
  }
  await mkdir(path, { recursive: true });
}
const canonical = resolve(root, 'skills/guilduo-workflows');
const references = await readdir(resolve(canonical, 'references'), { withFileTypes: true });
if (references.some(entry => !entry.isFile() || !/^[a-z0-9-]+\.md$/.test(entry.name))) throw new Error('Invalid canonical references');
const agents = await readdir(resolve(canonical, 'agents'), { withFileTypes: true });
if (agents.some(entry => !entry.isFile() || !/^[a-z0-9-]+\.yaml$/.test(entry.name))) throw new Error('Invalid canonical agents metadata');
for (const [source, target] of [
  ...['SKILL.md', ...references.map(entry => `references/${entry.name}`), ...agents.map(entry => `agents/${entry.name}`)].map(name => [resolve(canonical, name), resolve(base, 'skills/guilduo-workflows', name)]),
  [resolve(root, 'LICENSE'), resolve(base, 'LICENSE')],
]) {
  const actual = await realpath(source);
  if (relative(root, actual).startsWith('..') || isAbsolute(relative(root, actual))) throw new Error('Source escapes repository');
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Linked canonical file');
  const parent = resolve(target, '..'); await ensureDirectory(parent);
  if (relative(base, await realpath(parent)).startsWith('..') || isAbsolute(relative(base, await realpath(parent)))) throw new Error('Output escapes plugin');
  const existing = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error('Linked output');
  await copyFile(source, target);
}
const artifacts = resolve(base, '.qa-artifacts'); await ensureDirectory(artifacts);
if (relative(base, await realpath(artifacts)).startsWith('..')) throw new Error('Artifact output escapes plugin');
