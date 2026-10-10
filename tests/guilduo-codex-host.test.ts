import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFreshGuilduoSchemas } from '../tools/verify-guilduo-codex-host.mts';

test('native Codex acceptance rejects cached schemas without concurrency or selected-Agent fields', () => {
  const current: Record<string, { inputSchema: { properties: Record<string, unknown> } }> = Object.fromEntries([
    ['update_quest', ['expectedUpdatedAt', 'actingAgentId']],
    ['get_current_agent_context', ['actingAgentId']],
    ['get_quest', ['actingAgentId']],
    ['list_human_requests', ['actingAgentId']],
    ['request_human_review', ['expectedUpdatedAt', 'actingAgentId']],
  ].map(([name, fields]) => [name, { inputSchema: { properties: Object.fromEntries((fields as string[]).map(field => [field, { type:'string' }])) } }]));
  assert.doesNotThrow(() => assertFreshGuilduoSchemas(current));
  for (const [name, tool] of Object.entries(current)) for (const field of Object.keys(tool.inputSchema.properties)) {
    const stale = structuredClone(current);
    delete stale[name]!.inputSchema.properties[field];
    assert.throws(() => assertFreshGuilduoSchemas(stale), new RegExp(`stale-native-schema:${name}`));
  }
  assert.throws(() => assertFreshGuilduoSchemas({}), /stale-native-schema/);
});
