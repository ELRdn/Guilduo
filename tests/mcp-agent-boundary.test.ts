import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { MCP_TOOLS } from '../worker/src/index.ts';
import { createAgent, relinkAgentConnection, unlinkAgentConnection, updateAgent } from '../worker/src/agent-store.ts';
import { getKv, sha256 } from '../worker/src/security.ts';
import { readState, writeState } from '../worker/src/appwrite-store.ts';
import { migrateState } from '../server/questforge-domain.ts';
import { asQuestForgeState } from './test-helpers.ts';
import type { WorkerEnv } from '../worker/src/worker-types.ts';

test('invalid single-Agent links cannot fall back to the OAuth grant; recovery and never-linked legacy remain available', async () => {
  const env: WorkerEnv = {};
  const grant = { uid: 'boundary-owner', clientId: 'boundary-client', clientName: 'Test', scopes: ['agents:read', 'agents:write', 'quests:read', 'quests:write'], revokedAt: '' };
  const token = 'isolated-boundary-token';
  await getKv(env).put(`user-client:${grant.uid}:${grant.clientId}`, JSON.stringify(grant));
  await getKv(env).put(`access:${await sha256(token)}`, JSON.stringify({ ...grant, expiresAt: Date.now() + 600000 }));
  const initial = await readState(env, grant.uid);
  await writeState(env, grant.uid, { schemaVersion: 7, state: migrateState(asQuestForgeState({ schemaVersion: 7 })), clientUpdatedAt: new Date().toISOString() }, initial.etag);
  const context = { waitUntil: (p: Promise<unknown>) => { void p.catch(() => {}); } };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await worker.fetch(new Request('http://worker.test/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), env, context);
    return (await response.json() as { result: { isError: boolean; structuredContent: { effectiveExecutionScopes?: string[]; error?: { code: string } } } }).result;
  };
  assert.equal((await call('list_quests')).isError, false, 'never-linked legacy grant still works');
  await createAgent(env, grant.uid, { agentId: 'limited', displayName: 'Limited', allowedScopes: ['agents:read', 'quests:read'] });
  await relinkAgentConnection(env, grant.uid, 'limited', { clientId: grant.clientId, clientName: grant.clientName, scopes: grant.scopes });
  assert.equal((await call('create_quest', { kind: 'todo', title: 'Denied' })).structuredContent.error?.code, 'insufficient_scope');
  await updateAgent(env, grant.uid, 'limited', { status: 'disabled' });
  const before = (await readState(env, grant.uid)).payload;
  for (const name of ['list_quests', 'create_quest']) {
    const args = name === 'create_quest' ? { kind: 'todo', title: 'Must not persist' } : {};
    assert.equal((await call(name, args)).structuredContent.error?.code, 'agent_not_allowed');
  }
  assert.deepEqual((await call('get_current_agent_context')).structuredContent.effectiveExecutionScopes, []);
  assert.equal((await call('list_registered_agents')).isError, false, 'discovery uses the original grant');
  assert.deepEqual((await readState(env, grant.uid)).payload, before);
  await updateAgent(env, grant.uid, 'limited', { status: 'active' });
  assert.equal((await call('link_agent', { agentId: 'limited' })).isError, false, 'explicit connection recovery works');
  assert.equal((await call('list_quests')).isError, false);
  await unlinkAgentConnection(env, grant.uid, grant.clientId);
  assert.equal((await call('create_quest', { kind: 'todo', title: 'Revoked' })).structuredContent.error?.code, 'agent_not_allowed');
  assert.equal((await call('list_quests', { actingAgentId: 'limited' })).structuredContent.error?.code, 'agent_not_allowed');
  assert.deepEqual((await readState(env, grant.uid)).payload, before);
});

test('modifying MCP tools preserve confirmation annotations across hosts', () => {
  for (const tool of MCP_TOOLS) {
    if (!tool.annotations.readOnlyHint) assert.equal(tool.annotations.destructiveHint, true, tool.name);
  }
});
