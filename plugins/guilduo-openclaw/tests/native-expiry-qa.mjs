// SPDX-License-Identifier: AGPL-3.0-only
// QA only. Not a supported native operation, token bridge, or shipped feature.
import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const updateSql = `UPDATE mcp_oauth_stores
SET store_json = json_set(store_json, '$.tokenExpiresAt', 1)
WHERE store_key = ? AND format_version = 1
AND CASE WHEN json_valid(store_json) THEN
  json_type(store_json, '$.tokens') = 'object'
  AND json_type(store_json, '$.tokens.refresh_token') = 'text'
  AND json_type(store_json, '$.pendingAuthorizationChallenge.requiresAuthorization') IS NULL
ELSE 0 END
RETURNING json_extract(store_json, '$.tokenExpiresAt') AS expiresAt`;

function expireInsideDatabase(db, storeKey) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = db.prepare(updateSql).all(storeKey);
    assert.equal(rows.length, 1, 'Expected one initialized refresh-capable OAuth row');
    assert.equal(rows[0].expiresAt, 1);
    db.exec('COMMIT');
    return rows[0];
  } catch {
    db.exec('ROLLBACK');
    throw new Error('Expiry-only injection refused; no credential values are logged');
  }
}

if (process.argv[2] === '--self-test') {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE mcp_oauth_stores (store_key TEXT PRIMARY KEY, format_version INTEGER, store_json TEXT)');
    const fixture = { tokens: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }, tokenExpiresAt: 9999999999999, clientInformation: { client_id: 'synthetic-client' }, extra: { preserved: true } };
    const insert = db.prepare('INSERT INTO mcp_oauth_stores VALUES (?, ?, ?)');
    insert.run('target', 1, JSON.stringify(fixture));
    insert.run('other', 1, JSON.stringify(fixture));
    insert.run('unsupported', 2, JSON.stringify(fixture));
    insert.run('not-json', 1, 'opaque');
    expireInsideDatabase(db, 'target');
    // Only synthetic in-memory rows are read here; real credentials never leave SQLite.
    const result = JSON.parse(db.prepare('SELECT store_json FROM mcp_oauth_stores WHERE store_key = ?').get('target').store_json);
    assert.deepEqual(result, { ...fixture, tokenExpiresAt: 1 });
    assert.equal(db.prepare('SELECT store_json FROM mcp_oauth_stores WHERE store_key = ?').get('other').store_json, JSON.stringify(fixture));
    for (const key of ['missing', 'unsupported', 'not-json']) assert.throws(() => expireInsideDatabase(db, key));
    console.log('PASS expiry-only SQL isolation and fail-closed checks; no profile accessed');
  } finally { db.close(); }
} else {
  assert.deepEqual(process.argv.slice(4), ['--apply-only-expiry', '--profile-stopped'], 'Usage: node native-expiry-qa.mjs <isolated-QA-profile> <host.mjs> --apply-only-expiry --profile-stopped');
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const qa = await realpath(join(base, '.qa-artifacts'));
  const profile = await realpath(resolve(process.argv[2]));
  assert.ok(profile.startsWith(qa + sep), 'Only this package isolated QA profiles are accepted');
  const host = resolve(process.argv[3]);
  const build = JSON.parse(await readFile(join(dirname(host), 'dist/build-info.json'), 'utf8'));
  assert.equal(build.commit, 'bcfc88812a35243893585dbeca87ca41b48272ca');
  const { operatorMcpOAuthIdentity } = await import(pathToFileURL(join(dirname(host), 'dist/mcp-oauth-identity-n_Gpv27n.mjs')).href);
  const storeKey = operatorMcpOAuthIdentity('guilduo', 'https://mcp.guilduo.com/mcp').storeKey;
  const databasePath = join(profile, 'state', 'state', 'openclaw.sqlite');
  for (const path of [join(profile, 'state'), dirname(databasePath), databasePath]) {
    assert.equal(await realpath(path), path, 'Linked database ancestor refused');
    assert.equal((await lstat(path)).isSymbolicLink(), false);
  }
  const info = await lstat(databasePath);
  assert.ok(info.isFile() && info.nlink === 1, 'Database must be an existing unlinked regular file');
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA busy_timeout = 0');
    const result = expireInsideDatabase(db, storeKey);
    console.log(JSON.stringify({ kind: 'qa-injected-local-expiry', expiresAt: result.expiresAt, nativeRefreshExecuted: false }));
  } catch {
    throw new Error('Expiry-only QA operation failed; database details and credentials suppressed');
  } finally { db.close(); }
}
