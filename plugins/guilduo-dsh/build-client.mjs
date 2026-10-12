// SPDX-License-Identifier: AGPL-3.0-only
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const directory = fileURLToPath(new URL('.', import.meta.url));
const { name } = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

export function buildClient(write = true) {
  return build({
    absWorkingDir: directory,
    entryPoints: ['src/client.tsx'], outfile: 'lib/client.js', bundle: true,
    platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@deepseek-ai/*'],
    banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
    footer: { js: 'return module.exports;}});' },
    write, metafile: true,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildClient();
