import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { validateMcpToolInput } from '../worker/src/mcp-transport.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const official = 'https://mcp.guilduo.com/mcp';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value: unknown): Record<string, unknown> => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'invalid-result');
  return value as Record<string, unknown>;
};

export function validateLiveOptions(options: {
  endpoint: string; token?: string; questId?: string; actingAgentId?: string; nextAction?: string; execute?: boolean;
}) {
  const url = new URL(options.endpoint);
  assert.ok(options.endpoint === official || (url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
    && url.pathname === '/mcp' && !url.search && !url.hash && !url.username && !url.password), 'untrusted-endpoint');
  if (options.token !== undefined) {
    assert.match(options.token, /^[A-Za-z0-9._~+\/-]+=*$/, 'invalid-token');
    assert.ok(options.token.length <= 8192, 'invalid-token');
    assert.match(options.questId ?? '', /^[A-Za-z0-9_-]{1,160}$/, 'invalid-quest');
    assert.match(options.actingAgentId ?? '', /^[A-Za-z0-9_-]{1,80}$/, 'invalid-agent');
  }
  if (options.execute) {
    assert.ok(options.token, 'execute-requires-stdin-token');
    assert.ok(options.nextAction?.trim() && [...options.nextAction].length <= 180, 'invalid-next-action');
  } else assert.equal(options.nextAction, undefined, 'next-action-requires-execute');
  return url;
}

/** Native credentials are supplied once on stdin; default operation never writes a Quest. */
export async function verifyGuilduoLive(options: {
  endpoint: string; token?: string; questId?: string; actingAgentId?: string; humanRequestId?: string;
  execute?: boolean; nextAction?: string;
}) {
  const endpoint = validateLiveOptions(options);
  if (options.humanRequestId) assert.match(options.humanRequestId, /^[A-Za-z0-9_-]{1,160}$/, 'invalid-human-request');
  const evidence = {
    checkedAt: new Date().toISOString(), endpoint: endpoint.href === official ? 'official' : 'loopback',
    mode: options.execute ? 'explicit-fixture-write' : 'read-only', status: 'running', blocker: '',
    credentialPersisted: false, oauthFlow: 'not-run', modelInitiative: 'not-run', deployedSourceVerified: false,
    contextRead: false, questRead: false, toolContractHash: '', guardedSchema: false,
    writeAttempts: 0, writeOutcome: 'not-attempted', readbackMatched: false, preservedFields: false,
    repeatNoop: false, humanStatus: 'not-checked', humanAnswerRead: false, humanResumption: 'not-run',
    publicChecks: [] as Array<{ route: string; status: number }>,
  };
  let client: Client | undefined;
  try {
    if (!options.token) {
      for (const path of ['/health', '/.well-known/oauth-authorization-server', '/.well-known/openai-apps-challenge']) {
        const response = await fetch(new URL(path, endpoint), { redirect: 'error', signal: AbortSignal.timeout(15_000) });
        evidence.publicChecks.push({ route: path, status: response.status });
        await response.body?.cancel();
      }
      evidence.status = 'blocked';
      evidence.blocker = 'native-oauth-credential-required';
      return evidence;
    }
    client = new Client({ name: 'guilduo-live-acceptance', version: '0.6.0-beta.10' });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { authorization: `Bearer ${options.token}` } },
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        assert.equal(url.href, endpoint.href, 'transport-endpoint-changed');
        return fetch(input, { ...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(15_000) });
      },
    });
    await client.connect(transport, { timeout: 15_000 });
    const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const page: Awaited<ReturnType<Client['listTools']>> = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor) {
        assert.ok(!cursors.has(cursor) && cursors.size < 20, 'discovery-pagination-loop');
        cursors.add(cursor);
      }
    } while (cursor);
    evidence.toolContractHash = digest(tools);
    const update = tools.find(tool => tool.name === 'update_quest');
    evidence.guardedSchema = !!update && ['questId', 'expectedUpdatedAt', 'actingAgentId', 'nextAction']
      .every(key => object(update.inputSchema.properties)[key]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const tool = tools.find(item => item.name === name);
      assert.ok(tool, 'missing-tool');
      assert.ok(validateMcpToolInput(tool.inputSchema, args).valid, 'tool-input-contract-mismatch');
      const result = await client!.callTool({ name, arguments: args }, { timeout: 15_000 });
      assert.ok(!result.isError, 'tool-call-rejected');
      return object(result.structuredContent);
    };
    const identity = { actingAgentId: options.actingAgentId };
    const context = async () => {
      const value = await call('get_current_agent_context', identity);
      const agent = object(value.agent);
      assert.ok(value.linked === true && agent.agentId === options.actingAgentId && agent.status === 'active', 'agent-not-authorized');
      assert.ok(Array.isArray(value.effectiveExecutionScopes)
        && ['agents:read', 'quests:read', ...(options.execute ? ['quests:write'] : [])]
          .every(scope => (value.effectiveExecutionScopes as unknown[]).includes(scope)), 'insufficient-agent-scope');
      evidence.contextRead = true;
    };
    const quest = async () => {
      const value = object((await call('get_quest', { questId: options.questId, ...identity })).quest);
      assert.equal(value.id, options.questId, 'unexpected-quest');
      evidence.questRead = true;
      return value;
    };
    await context();
    const before = await quest();
    if (options.humanRequestId) {
      const human = object((await call('get_quest', { questId: options.humanRequestId, ...identity })).quest);
      assert.equal(human.id, options.humanRequestId, 'unexpected-human-request');
      const request = object(human.humanRequest);
      assert.equal(request.sourceQuestId, options.questId, 'human-source-mismatch');
      assert.ok(['pending', 'deferred', 'answered'].includes(String(request.status)), 'invalid-human-status');
      evidence.humanStatus = String(request.status);
      evidence.humanAnswerRead = request.status === 'answered' && typeof request.response === 'string'
        && !!request.response.trim() && typeof request.respondedAt === 'string' && !!request.respondedAt;
    }
    if (options.execute) {
      assert.ok(evidence.guardedSchema, 'guarded-update-schema-missing');
      const assignee = object(before.assignee);
      assert.ok(assignee.type === 'agent' && assignee.id === options.actingAgentId
        && before.lifecycleState === 'active' && before.done === false && before.humanRequest === null, 'fixture-not-active-agent-work');
      assert.ok(typeof before.updatedAt === 'string' && !Number.isNaN(Date.parse(before.updatedAt)), 'missing-quest-version');
      const unchanged = (value: Record<string, unknown>) => {
        const { nextAction: _nextAction, updatedAt: _updatedAt, ...rest } = value;
        return digest(rest);
      };
      if (before.nextAction !== options.nextAction) {
        evidence.writeAttempts++;
        try {
          await call('update_quest', { questId: options.questId, ...identity,
            expectedUpdatedAt: before.updatedAt, nextAction: options.nextAction });
          evidence.writeOutcome = 'response-received';
        } catch {
          // Never replay a timed-out/conflicting write; recover only by reading the saved version.
          evidence.writeOutcome = 'response-unknown-or-rejected';
        }
        await context();
      }
      const saved = await quest();
      evidence.readbackMatched = saved.nextAction === options.nextAction;
      evidence.preservedFields = unchanged(before) === unchanged(saved);
      assert.ok(evidence.readbackMatched && evidence.preservedFields, 'write-not-confirmed-or-concurrent-change');
      await context();
      const repeated = await quest();
      evidence.repeatNoop = repeated.nextAction === options.nextAction && repeated.updatedAt === saved.updatedAt
        && unchanged(repeated) === unchanged(saved);
      assert.ok(evidence.repeatNoop, 'concurrent-change-before-noop');
      if (evidence.writeAttempts === 0) evidence.writeOutcome = 'already-matched-no-write';
    }
    evidence.status = 'passed';
    return evidence;
  } catch (error) {
    evidence.status = 'blocked';
    // SDK/HTTP errors can contain private server output. Only our fixed assertion codes leave the process.
    evidence.blocker = error instanceof assert.AssertionError ? String(error.message).split('\n')[0] : 'connection-or-protocol-failed';
    return evidence;
  } finally { await client?.close().catch(() => undefined); }
}

async function main() {
  const { values } = parseArgs({ options: {
    endpoint: { type: 'string', default: official }, 'token-stdin': { type: 'boolean', default: false },
    quest: { type: 'string' }, agent: { type: 'string' }, 'human-request': { type: 'string' },
    execute: { type: 'boolean', default: false }, 'next-action': { type: 'string' },
  } });
  let token: string | undefined;
  if (values['token-stdin']) {
    assert.ok(!process.stdin.isTTY, 'stdin-must-be-a-pipe');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += Buffer.byteLength(chunk);
      assert.ok(size <= 8192, 'invalid-token');
      chunks.push(Buffer.from(chunk));
    }
    token = Buffer.concat(chunks).toString('utf8').trim();
  }
  const evidence = await verifyGuilduoLive({ endpoint: values.endpoint, token,
    questId: values.quest, actingAgentId: values.agent, humanRequestId: values['human-request'],
    execute: values.execute, nextAction: values['next-action'] });
  const canonicalRoot = await realpath(root);
  const directory = resolve(canonicalRoot, '.qa-artifacts');
  await mkdir(directory, { recursive: true });
  assert.ok(!(await lstat(directory)).isSymbolicLink() && await realpath(directory) === directory, 'linked-evidence-directory');
  const path = resolve(directory, `guilduo-live-${randomUUID()}.json`);
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...evidence, evidencePath: path }));
  if (evidence.status !== 'passed') process.exitCode = 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  void main().catch(() => { console.error('Live verifier input or output validation failed; no credential was saved.'); process.exitCode = 1; });
}
