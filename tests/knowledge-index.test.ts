import test from "node:test";
import assert from "node:assert/strict";
import { SqliteD1Database, hasErrorCode } from "./test-helpers.ts";
import { captureKnowledge, deleteKnowledge, searchKnowledge } from "../worker/src/knowledge-store.ts";
import { dispatchKnowledgeIndex, processKnowledgeIndex, semanticKnowledgeCandidates } from "../worker/src/knowledge-index.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import type { AuthIdentity } from "../worker/src/security.ts";
const human: AuthIdentity = { uid: "owner", email: "", authType: "dev", scopes: ["knowledge:read", "knowledge:write"] };
const input = (content: string, extra = {}) => ({ requestId: crypto.randomUUID(), title: "decision", content, kind: "decision", scope: "global", epistemic: "agent_observation", reason: "observed result", sources: [{ reference: "test:fixture", version: "1", excerpt: "evidence", availability: "reported" }], ...extra });
function setup() {
  const db = new SqliteD1Database(), vectors = new Map<string, { metadata: { knowledgeId: string; revision: number }; namespace: string }>();
  let calls = 0, failAi = false;
  const sent: unknown[] = [];
  const env: WorkerEnv = { QUESTFORGE_DB: db, KNOWLEDGE_ENABLED: "true", KNOWLEDGE_OWNER_UID: human.uid, KNOWLEDGE_EXTERNAL_APPROVED: "true", KNOWLEDGE_BUDGET_ID: "fixture-only", KNOWLEDGE_MAX_EMBEDDING_REQUESTS: "30", KNOWLEDGE_EMBEDDING_MODEL: "@cf/baai/bge-m3", KNOWLEDGE_EMBEDDING_DIMENSIONS: "2",
    KNOWLEDGE_AI: { async run() { calls++; if (failAi) throw new Error("offline"); return { data: [[1, 0]] }; } },
    KNOWLEDGE_VECTOR: {
      async upsert(items) { for (const item of items) vectors.set(item.id, item); },
      async deleteByIds(ids) { for (const id of ids) vectors.delete(id); },
      async getByIds(ids) { return ids.filter(id => vectors.has(id)).map(id => ({ id })); },
      async query(_vector, options) { return { matches: [...vectors].filter(([, value]) => value.namespace === options.namespace).map(([id, value]) => ({ id, metadata: value.metadata })) }; },
    }, KNOWLEDGE_QUEUE: { async send(body) { sent.push(body); } },
  };
  return { db, env, vectors, sent, calls: () => calls, fail: () => { failAi = true; } };
}
test("external indexing and queue dispatch make no calls without separate approval", async () => {
  const fixture = setup(), { env } = fixture; env.KNOWLEDGE_EXTERNAL_APPROVED = "false";
  const item = (await captureKnowledge(env, human, input("saved locally"))).knowledge;
  await dispatchKnowledgeIndex(env); await processKnowledgeIndex(env, { uid: human.uid, knowledgeId: item.id });
  assert.equal(fixture.calls(), 0); assert.equal(fixture.sent.length, 0); assert.equal(fixture.vectors.size, 0);
  assert.equal((await searchKnowledge(env, human, { query: "locally" })).items.length, 1);
});
test("durable jobs survive dispatch failure and duplicate/out-of-order queue hints process current revision", async () => {
  const { env, db, vectors, sent } = setup();
  const first = (await captureKnowledge(env, human, input("old"))).knowledge;
  env.KNOWLEDGE_QUEUE = { async send() { throw new Error("queue down"); } };
  await dispatchKnowledgeIndex(env);
  assert.equal((await db.prepare("SELECT count(*) n FROM knowledge_index_jobs").first<{ n: number }>())?.n, 1);
  env.KNOWLEDGE_QUEUE = { async send(body) { sent.push(body); } };
  await dispatchKnowledgeIndex(env); assert.equal(sent.length, 1);
  await captureKnowledge(env, human, input("current", { knowledgeId: first.id, expectedRevision: 1, change: "explicit" }));
  for (let n = 0; n < 2; n++) await processKnowledgeIndex(env, { uid: human.uid, knowledgeId: first.id });
  assert.equal(vectors.size, 1); assert.equal([...vectors.values()][0].metadata.revision, 2);
  assert.equal((await db.prepare("SELECT count(*) n FROM knowledge_index_jobs").first<{ n: number }>())?.n, 0);
});
test("semantic results are revalidated against D1 owner, revision and deletion", async () => {
  const { env, vectors } = setup(), first = (await captureKnowledge(env, human, input("unrelated text"))).knowledge;
  await processKnowledgeIndex(env, { uid: human.uid, knowledgeId: first.id });
  assert.equal((await searchKnowledge(env, human, { query: "semantic-only" })).items[0].id, first.id);
  await captureKnowledge(env, human, input("changed", { knowledgeId: first.id, expectedRevision: 1, change: "explicit" }));
  assert.equal((await searchKnowledge(env, human, { query: "semantic-only" })).items.length, 0);
  // Bypass the namespace filter to simulate a bad provider/index response; D1 ownership still wins.
  env.KNOWLEDGE_VECTOR!.query = async () => ({ matches: [...vectors].map(([id, value]) => ({ id, metadata: value.metadata })) });
  await assert.rejects(searchKnowledge(env, { ...human, uid: "stranger" }, { query: "semantic-only" }), e => hasErrorCode(e, "knowledge_owner_beta_only"));
  await deleteKnowledge(env, human.uid, first.id, 2);
  assert.equal((await searchKnowledge(env, human, { query: "semantic-only" })).items.length, 0);
  await processKnowledgeIndex(env, { uid: human.uid, knowledgeId: first.id }); assert.equal(vectors.size, 0);
});
test("deletion during in-flight upsert cannot restore searchable knowledge or lose the delete job", async () => {
  const { env, vectors } = setup(), item = (await captureKnowledge(env, human, input("to delete"))).knowledge;
  const original = env.KNOWLEDGE_VECTOR!.upsert;
  env.KNOWLEDGE_VECTOR!.upsert = async items => { await deleteKnowledge(env, human.uid, item.id, 1); return original(items); };
  await processKnowledgeIndex(env, { uid: human.uid, knowledgeId: item.id });
  assert.equal(vectors.size, 0); assert.equal((await searchKnowledge(env, human, {})).items.length, 0);
  await processKnowledgeIndex(env, { uid: human.uid, knowledgeId: item.id }); assert.equal(vectors.size, 0);
});
test("unknown provider responses consume the finite campaign budget, preserve jobs and fall back to lexical", async () => {
  const fixture = setup(), { env, db } = fixture; env.KNOWLEDGE_MAX_EMBEDDING_REQUESTS = "1";
  const item = (await captureKnowledge(env, human, input("fallback"))).knowledge; fixture.fail();
  await assert.rejects(processKnowledgeIndex(env, { uid: human.uid, knowledgeId: item.id }));
  assert.equal((await db.prepare("SELECT requests FROM knowledge_embedding_budget").first<{ requests: number }>())?.requests, 1);
  const result = await searchKnowledge(env, human, { query: "fallback" });
  assert.equal(result.semantic, "unavailable"); assert.equal(result.items[0].id, item.id); assert.equal(fixture.calls(), 1);
  assert.equal((await db.prepare("SELECT count(*) n FROM knowledge_index_jobs").first<{ n: number }>())?.n, 1);
});
test("embedding model and dimensions cannot silently change within a frozen index", async () => {
  const { env } = setup(); await semanticKnowledgeCandidates(env, human.uid, "query");
  env.KNOWLEDGE_EMBEDDING_MODEL = "@cf/pfnet/plamo-embedding-1b";
  await assert.rejects(semanticKnowledgeCandidates(env, human.uid, "query"), e => hasErrorCode(e, "knowledge_index_model_changed"));
});
test("semantic candidate revalidation respects D1's bound-parameter limit and relevance order", async () => {
  const { env, db } = setup(), ids: string[] = [];
  for (let n = 0; n < 25; n++) ids.push((await captureKnowledge(env, human, input(`fact ${n}`))).knowledge.id);
  env.KNOWLEDGE_VECTOR!.query = async () => ({ matches: ids.map(id => ({ id, metadata: { knowledgeId: id, revision: 1 } })) });
  const prepare = db.prepare.bind(db);
  db.prepare = query => {
    const statement = prepare(query), bind = statement.bind.bind(statement);
    statement.bind = (...values) => { assert(values.length <= 100, "D1 SQL accepts at most 100 bound parameters"); return bind(...values); };
    return statement;
  };
  const result = await searchKnowledge(env, human, { query: "semantic-only", limit: 50 });
  assert.equal(result.semantic, "available"); assert.deepEqual(result.items.map(item => item.id), ids.slice(0, 20));
});

test("concurrent hints reserve one embedding for the same revision", async () => {
  const { env, calls } = setup(), item = (await captureKnowledge(env, human, input("one revision"))).knowledge;
  const hint = { uid: human.uid, knowledgeId: item.id };
  await Promise.all([processKnowledgeIndex(env, hint), processKnowledgeIndex(env, hint)]);
  assert.equal(calls(), 1);
});

test("uncertain async indexing leaves a durable cleanup job for deleted knowledge", async () => {
  const { env, vectors, db } = setup(), item = (await captureKnowledge(env, human, input("temporary fact"))).knowledge;
  const upsert = env.KNOWLEDGE_VECTOR!.upsert;
  env.KNOWLEDGE_VECTOR!.upsert = async items => {
    await deleteKnowledge(env, human.uid, item.id, 1);
    await upsert(items);
    throw new Error("Provider outcome not received");
  };
  const hint = { uid: human.uid, knowledgeId: item.id };
  await assert.rejects(processKnowledgeIndex(env, hint));
  assert.equal(vectors.size, 1);
  assert.deepEqual((await searchKnowledge(env, human, {})).items, []);
  await processKnowledgeIndex(env, hint);
  assert.equal(vectors.size, 0);
  assert.equal((await db.prepare("SELECT count(*) n FROM knowledge_index_jobs").first<{ n: number }>())?.n, 0);
});
