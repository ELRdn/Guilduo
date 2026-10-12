import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import workerModule from '../worker/src/index.ts';
import { createAgent, relinkAgentConnection } from '../worker/src/agent-store.ts';
import { readState, writeState } from '../worker/src/appwrite-store.ts';
import { getKv, sha256 } from '../worker/src/security.ts';
import { migrateState } from '../server/questforge-domain.ts';
import { respondHumanReview } from '../server/human-requests.ts';
import type { WorkerEnv } from '../worker/src/worker-types.ts';
import { asQuestForgeState } from './test-helpers.ts';
import { validateLiveOptions, verifyGuilduoLive } from '../tools/verify-guilduo-live.mts';

const worker = 'fetch' in workerModule ? workerModule : (workerModule as unknown as { default: typeof workerModule }).default;

test('live acceptance rejects credential forwarding and unscoped execution before connecting', () => {
  for (const endpoint of ['https://other.example/mcp', 'https://mcp.guilduo.com/mcp?token=secret',
    'http://localhost/mcp', 'http://user:secret@127.0.0.1/mcp', 'http://127.0.0.1/other']) {
    assert.throws(() => validateLiveOptions({ endpoint }), /untrusted-endpoint/);
  }
  assert.throws(() => validateLiveOptions({ endpoint: 'https://mcp.guilduo.com/mcp', execute: true }), /stdin-token/);
  assert.throws(() => validateLiveOptions({ endpoint: 'https://mcp.guilduo.com/mcp', nextAction: 'write' }), /requires-execute/);
  assert.throws(() => validateLiveOptions({ endpoint: 'https://mcp.guilduo.com/mcp', token: 'token\nsecret' }), /invalid-token/);
});

test('live acceptance uses the actual SDK and Worker, guards writes and never replays uncertain results', { timeout: 60_000 }, async () => {
  for (const scenario of ['public-only', 'read-only', 'write', 'legacy-schema', 'read-only-agent', 'disabled-agent',
    'lost-response', 'conflict', 'already-matched', 'pending-human', 'answered-human']) {
    const uid = randomUUID();
    const token = randomUUID();
    const clientId = randomUUID();
    const env: WorkerEnv = {};
    const context = { waitUntil(promise: Promise<unknown>) { void promise.catch(() => undefined); } };
    const initial = await readState(env, uid);
    assert.equal(await writeState(env, uid, { schemaVersion: 7,
      state: migrateState(asQuestForgeState({ schemaVersion: 7 })), clientUpdatedAt: new Date().toISOString() }, initial.etag), true);
    const scopes = ['agents:read', 'quests:read', 'quests:write'];
    const grant = { uid, clientId, clientName: 'Synthetic fixture', scopes, firstConnectedAt: new Date().toISOString(), revokedAt: '' };
    await createAgent(env, uid, { agentId: 'fixture-agent', displayName: 'Synthetic fixture', allowedScopes: scopes });
    await relinkAgentConnection(env, uid, 'fixture-agent', { clientId, clientName: 'Synthetic fixture', scopes });
    let base = '';
    let updateCalls = 0;
    let questId = '';
    const direct = async (name: string, args: Record<string, unknown>) => {
      const response = await worker.fetch(new Request(`${base}/mcp`, { method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), env, context);
      return await response.json() as { result: { structuredContent: { quest: { id: string; updatedAt: string; nextAction: string; notes: string } } } };
    };
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks);
        const request = new Request(`${base}${incoming.url}`, { method: incoming.method,
          headers: incoming.headers as Record<string, string>,
          ...(['GET', 'HEAD'].includes(incoming.method ?? '') ? {} : { body: bytes }) });
        const rpc = bytes.length ? JSON.parse(bytes.toString()) as { method: string; params?: { name: string } } : undefined;
        if (rpc?.params?.name === 'update_quest') {
          updateCalls++;
          if (scenario === 'conflict') await direct('update_quest', { questId, notes: 'Concurrent Human note' });
        }
        const response = await worker.fetch(request, env, context);
        if (scenario === 'lost-response' && rpc?.params?.name === 'update_quest') {
          await response.body?.cancel();
          outgoing.destroy();
          return;
        }
        if (scenario === 'legacy-schema' && rpc?.method === 'tools/list') {
          const payload = await response.json() as { result: { tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }> } };
          const tool = payload.result.tools.find(item => item.name === 'update_quest')!;
          delete tool.inputSchema.properties.expectedUpdatedAt;
          delete tool.inputSchema.properties.actingAgentId;
          outgoing.writeHead(200, { 'content-type': 'application/json' });
          outgoing.end(JSON.stringify(payload));
          return;
        }
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(500); outgoing.end(); }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
    env.PUBLIC_BASE_URL = base;
    await getKv(env).put(`access:${await sha256(token)}`, JSON.stringify({ ...grant, resource: `${base}/mcp`, expiresAt: Date.now() + 60_000 }));
    try {
      questId = (await direct('create_quest', { kind: 'todo', title: 'Dedicated synthetic acceptance', notes: 'Keep note',
        nextAction: scenario === 'already-matched' ? 'Verify next phase' : '',
        assignee: { type: 'agent', id: 'fixture-agent', label: 'Synthetic fixture', handoffState: 'ready' } })).result.structuredContent.quest.id;
      if (scenario === 'read-only-agent' || scenario === 'disabled-agent') {
        const { updateAgent } = await import('../worker/src/agent-store.ts');
        await updateAgent(env, uid, 'fixture-agent', scenario === 'disabled-agent'
          ? { status: 'disabled' } : { allowedScopes: ['agents:read', 'quests:read'] });
      }
      let humanRequestId: string | undefined;
      if (scenario.endsWith('-human')) {
        const source = (await direct('get_quest', { questId })).result.structuredContent.quest;
        humanRequestId = (await direct('request_human_review', { questId, title: 'Synthetic Human check',
          requestKey: randomUUID(), reason: 'Isolated verifier acceptance', checkTarget: 'Synthetic work',
          completionCriteria: 'Read the saved synthetic feedback', dryRun: false, expectedUpdatedAt: source.updatedAt })).result.structuredContent.quest.id;
        if (scenario === 'answered-human') {
          const record = await readState(env, uid);
          const state = record.payload.state!;
          const human = state.tasks.find(item => item.id === humanRequestId)!;
          respondHumanReview(state, human.id, { action: 'revise', response: 'Synthetic private feedback', confirmed: true,
            dryRun: false, expectedUpdatedAt: human.updatedAt }, { ownerId: uid, requester: { type: 'human', id: uid, label: 'Synthetic Human' } });
          assert.equal(await writeState(env, uid, { ...record.payload, state }, record.etag), true);
        }
      }
      const execute = !['public-only', 'read-only', 'pending-human', 'answered-human'].includes(scenario);
      const evidence = await verifyGuilduoLive({ endpoint: `${base}/mcp`, ...(scenario === 'public-only' ? {} : { token, questId, actingAgentId: 'fixture-agent' }),
        humanRequestId,
        execute, ...(execute ? { nextAction: 'Verify next phase' } : {}) });
      const blocked = ['public-only', 'legacy-schema', 'read-only-agent', 'disabled-agent', 'conflict'].includes(scenario);
      assert.equal(evidence.status, blocked ? 'blocked' : 'passed', `${scenario}: ${JSON.stringify(evidence)}`);
      assert.equal(updateCalls, ['write', 'lost-response', 'conflict'].includes(scenario) ? 1 : 0, scenario);
      assert.equal(evidence.writeAttempts, updateCalls, scenario);
      const saved = (await readState(env, uid)).payload.state!.tasks.find(item => item.id === questId)!;
      assert.equal(saved.notes, scenario === 'conflict' ? 'Concurrent Human note' : 'Keep note');
      if (scenario === 'lost-response') {
        assert.equal(evidence.writeOutcome, 'response-unknown-or-rejected');
        assert.equal(evidence.readbackMatched, true);
      }
      if (scenario === 'already-matched') assert.equal(evidence.writeOutcome, 'already-matched-no-write');
      if (scenario === 'pending-human') { assert.equal(evidence.humanStatus, 'pending'); assert.equal(evidence.humanAnswerRead, false); }
      if (scenario === 'answered-human') { assert.equal(evidence.humanStatus, 'answered'); assert.equal(evidence.humanAnswerRead, true); }
      assert.equal(evidence.humanResumption, 'not-run');
      if (!blocked && execute) assert.equal(evidence.repeatNoop, true);
      const text = JSON.stringify(evidence);
      for (const privateValue of [uid, clientId, token, questId, 'Keep note', 'Verify next phase', 'Synthetic private feedback']) assert.ok(!text.includes(privateValue));
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});
