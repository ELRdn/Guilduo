// SPDX-License-Identifier: AGPL-3.0-only
// Exercise the installed native Accounts status projection, without UI/provider setup.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [host, expected] = process.argv.slice(2);
const qa = resolve(fileURLToPath(new URL('../.qa-artifacts/', import.meta.url)));
for (const key of ['HOME', 'USERPROFILE', 'OPENCLAW_HOME', 'OPENCLAW_STATE_DIR', 'OPENCLAW_CONFIG_PATH', 'TEMP', 'TMP']) assert.ok(resolve(process.env[key] ?? '').startsWith(qa + sep), `${key} must be under package QA`);
const fetchNative = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Public network forbidden in UI carrier fixture');
  return fetchNative(input, init);
};
const dist = resolve(host, '../dist');
const file = (await readdir(dist)).find(name => /^management-service-.*\.mjs$/.test(name));
assert.ok(file);
const { t: inspectManagedPlugin } = await import(pathToFileURL(resolve(dist, file)).href);
const config = JSON.parse(await readFile(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
const result = await inspectManagedPlugin({ pluginId: 'guilduo', config });
assert.equal(result.ok, true);
assert.deepEqual(result.mcpAuth, expected === 'absent' ? undefined : [{ serverName: 'guilduo', state: expected }]);
console.log(JSON.stringify({ nativeAccountsProjection: result.mcpAuth ?? null, expected, render: 'unverified' }));
