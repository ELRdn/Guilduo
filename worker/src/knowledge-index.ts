import { DomainError } from "../../server/questforge-domain.ts";
import { sha256 } from "./security.ts";
import type { WorkerEnv } from "./worker-types.ts";

type Job = { uid: string; knowledge_id: string; revision: number; action: string };
const MODELS = new Set(["@cf/baai/bge-m3", "@cf/pfnet/plamo-embedding-1b"]);
export function externalKnowledgeEnabled(env: WorkerEnv): boolean {
  return env.KNOWLEDGE_ENABLED === "true" && env.KNOWLEDGE_EXTERNAL_APPROVED === "true" && Boolean(env.KNOWLEDGE_VECTOR && env.KNOWLEDGE_AI && env.QUESTFORGE_DB
    && env.KNOWLEDGE_BUDGET_ID && MODELS.has(env.KNOWLEDGE_EMBEDDING_MODEL ?? "") && Number.isSafeInteger(Number(env.KNOWLEDGE_MAX_EMBEDDING_REQUESTS))
    && Number(env.KNOWLEDGE_MAX_EMBEDDING_REQUESTS) > 0 && Number.isSafeInteger(Number(env.KNOWLEDGE_EMBEDDING_DIMENSIONS)) && Number(env.KNOWLEDGE_EMBEDDING_DIMENSIONS) > 0);
}
async function embedding(env: WorkerEnv, text: string): Promise<number[]> {
  if (!externalKnowledgeEnabled(env)) throw new DomainError(503, "knowledge_external_disabled", "No bounded external knowledge campaign is approved.");
  const db = env.QUESTFORGE_DB!, model = env.KNOWLEDGE_EMBEDDING_MODEL!, dimensions = Number(env.KNOWLEDGE_EMBEDDING_DIMENSIONS);
  await db.prepare("INSERT INTO knowledge_index_config(id,model,dimensions) VALUES(1,?,?) ON CONFLICT(id) DO NOTHING").bind(model, dimensions).run();
  const frozen = await db.prepare("SELECT model,dimensions FROM knowledge_index_config WHERE id=1").first<{ model: string; dimensions: number }>();
  if (frozen?.model !== model || frozen.dimensions !== dimensions) throw new DomainError(409, "knowledge_index_model_changed", "The embedding model/index format is frozen. A deliberate rebuild is required.");
  await db.prepare("INSERT INTO knowledge_embedding_budget(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(env.KNOWLEDGE_BUDGET_ID).run();
  const reserved = await db.prepare("UPDATE knowledge_embedding_budget SET requests=requests+1 WHERE id=? AND requests<?").bind(env.KNOWLEDGE_BUDGET_ID, Number(env.KNOWLEDGE_MAX_EMBEDDING_REQUESTS)).run();
  if (!reserved.meta?.changes) throw new DomainError(429, "knowledge_budget_exhausted", "Approved embedding request limit reached; lexical knowledge remains available.");
  // Reserve before the external call: unknown responses are charged against the cap and never auto-refunded.
  const result = await env.KNOWLEDGE_AI!.run(model, { text: [text] }) as { data?: unknown };
  const values = Array.isArray(result?.data) ? result.data[0] : null;
  if (!Array.isArray(values) || values.length !== dimensions || values.some(n => typeof n !== "number" || !Number.isFinite(n))) throw new DomainError(502, "knowledge_embedding_invalid", "Embedding output does not match the frozen index.");
  return values as number[];
}
export async function semanticKnowledgeCandidates(env: WorkerEnv, uid: string, query: string): Promise<{ id: string; revision: number }[]> {
  const vector = await embedding(env, query);
  // Keep candidate revision checks and ordering within D1's SQL parameter budget.
  const result = await env.KNOWLEDGE_VECTOR!.query(vector, { topK: 20, namespace: await sha256(uid), returnMetadata: "all" });
  return result.matches.slice(0, 20).flatMap(match => typeof match.metadata?.knowledgeId === "string" && Number.isSafeInteger(match.metadata.revision)
    ? [{ id: match.metadata.knowledgeId, revision: Number(match.metadata.revision) }] : []);
}
export async function processKnowledgeIndex(env: WorkerEnv, hint: { uid: string; knowledgeId: string }): Promise<void> {
  if (!externalKnowledgeEnabled(env)) return;
  if (env.KNOWLEDGE_OWNER_UID && hint.uid !== env.KNOWLEDGE_OWNER_UID) return;
  const db = env.QUESTFORGE_DB!;
  const job = await db.prepare("SELECT * FROM knowledge_index_jobs WHERE uid=? AND knowledge_id=?").bind(hint.uid, hint.knowledgeId).first<Job>();
  if (!job) return;
  const current = await db.prepare("SELECT revision,status,title,content FROM knowledge_items WHERE uid=? AND id=?").bind(job.uid, job.knowledge_id).first<{ revision: number; status: string; title: string; content: string }>();
  if (!current || current.revision !== job.revision) return;
  const entries = await db.prepare("SELECT vector_id,revision FROM knowledge_index_entries WHERE uid=? AND knowledge_id=?").bind(job.uid, job.knowledge_id).all<{ vector_id: string; revision: number }>();
  const obsolete = (entries.results ?? []).filter(e => e.revision !== current.revision || current.status !== "active").map(e => e.vector_id);
  if (obsolete.length) {
    for (let offset = 0; offset < obsolete.length; offset += 100) await env.KNOWLEDGE_VECTOR!.deleteByIds(obsolete.slice(offset, offset + 100));
    // Keep content-free entry IDs for retry/reconciliation of asynchronous or late provider mutations.
  }
  if (current.status === "active" && job.action === "upsert") {
    const values = await embedding(env, `${current.title}\n${current.content}`);
    const vectorId = await sha256(JSON.stringify([job.uid, job.knowledge_id, job.revision]));
    await db.prepare("INSERT INTO knowledge_index_entries VALUES(?,?,?,?) ON CONFLICT(uid,knowledge_id,revision) DO NOTHING").bind(job.uid, job.knowledge_id, job.revision, vectorId).run();
    await env.KNOWLEDGE_VECTOR!.upsert([{ id: vectorId, values, namespace: await sha256(job.uid), metadata: { knowledgeId: job.knowledge_id, revision: job.revision } }]);
    const after = await db.prepare("SELECT revision,status FROM knowledge_items WHERE uid=? AND id=?").bind(job.uid, job.knowledge_id).first<{ revision: number; status: string }>();
    if (after?.revision !== job.revision || after.status !== "active") await env.KNOWLEDGE_VECTOR!.deleteByIds([vectorId]);
  }
  await db.prepare("DELETE FROM knowledge_index_jobs WHERE uid=? AND knowledge_id=? AND revision=?").bind(job.uid, job.knowledge_id, job.revision).run();
}
export async function dispatchKnowledgeIndex(env: WorkerEnv): Promise<void> {
  if (!externalKnowledgeEnabled(env) || !env.KNOWLEDGE_QUEUE) return;
  const jobs = await env.QUESTFORGE_DB!.prepare("SELECT * FROM knowledge_index_jobs WHERE (?='' OR uid=?) ORDER BY attempts,revision LIMIT 20").bind(env.KNOWLEDGE_OWNER_UID ?? "", env.KNOWLEDGE_OWNER_UID ?? "").all<Job>();
  let failures = 0;
  for (const job of jobs.results ?? []) {
    try {
      await env.KNOWLEDGE_QUEUE.send({ uid: job.uid, knowledgeId: job.knowledge_id, revision: job.revision });
      await env.QUESTFORGE_DB!.prepare("UPDATE knowledge_index_jobs SET attempts=attempts+1 WHERE uid=? AND knowledge_id=? AND revision=?").bind(job.uid, job.knowledge_id, job.revision).run();
    } catch { failures++; }
  }
  if (failures) console.error("knowledge_queue_dispatch_failed", { failures });
}
