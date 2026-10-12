import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const sdkAvailable = existsSync(resolve(root, 'plugins/guilduo-dsh/node_modules/@modelcontextprotocol/client/package.json'));

test('candidate Worker accepts the real pinned MCP SDK and mock-Human OAuth over isolated loopback HTTP', {
  skip: sdkAvailable ? false : 'Install the isolated plugins/guilduo-dsh dependencies to run SDK HTTP acceptance',
  timeout: 30_000,
}, () => {
  // A child keeps the fixture fetch guard, SDK and in-memory stores out of the root test process.
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'tools/verify-guilduo-mcp-candidate.mts'], {
    cwd: root, encoding: 'utf8', timeout: 25_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout.trim());
  assert.equal(summary.status, 'passed');
  assert.equal(summary.acceptance, 'local-sdk-http-only');
  assert.equal(summary.sdk.version, '2.0.0');
  assert.equal(summary.schemaVersion, 7);
  assert.ok(summary.toolCount > 0);
  assert.ok(summary.checks >= 11);
  assert.equal(summary.oauth.acceptance, 'local-sdk-oauth-mock-human');
  assert.equal(summary.oauth.status, 'passed');
  assert.deepEqual(summary.oauth.scope, ['quests:read', 'agents:read']);
  assert.ok(summary.oauth.checks.length >= 5);
});
