// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = await readFile(new URL('src/index.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
await mkdir(new URL('lib/', import.meta.url), { recursive: true });
await writeFile(new URL('lib/index.js', import.meta.url), compiled);
