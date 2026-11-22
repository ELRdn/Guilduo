import { DomainError } from "../../server/questforge-domain.ts";
import { sha256 } from "./security.ts";
import type { WorkerEnv } from "./worker-types.ts";

type Job = { uid: string; knowledge_id: string; revision: number; action: string };
const MODELS = new Set(["@cf/baai/bge-m3", "@cf/pfnet/plamo-embedding-1b"]);
export function externalKnowledgeEnabled(env: WorkerEnv): boolean {
  return env.KNOWLEDGE_ENABLED === "true" && env.KNOWLEDGE_EXTERNAL_APPROVED === "true" && Boolean(env.KNOWLEDGE_OWNER_UID?.trim() && env.KNOWLEDGE_VECTOR && env.KNOWLEDGE_AI && env.QUESTFORGE_DB
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
  if (uid !== env.KNOWLEDGE_OWNER_UID) return [];
  const vector = await embedding(env, query);
  // Keep candidate revision checks and ordering within D1's SQL parameter budget.
  const result = await env.KNOWLEDGE_VECTOR!.query(vector, { topK: 20, namespace: await sha256(uid), returnMetadata: "all" });
  return result.matches.slice(0, 20).flatMap(match => typeof match.metadata?.knowledgeId === "string" && Number.isSafeInteger(match.metadata.revision)
    ? [{ id: match.metadata.knowledgeId, revision: Number(match.metadata.revision) }] : []);
}
export async function processKnowledgeIndex(env: WorkerEnv, hint: { uid: string; knowledgeId: string }): Promise<void> {
  if (!externalKnowledgeEnabled(env) || hint.uid !== env.KNOWLEDGE_OWNER_UID) return;
  const db = env.QUESTFORGE_DB!, vector = env.KNOWLEDGE_VECTOR!;
  const uid = hint.uid, id = hint.knowledgeId, token = crypto.randomUUID(), now = Date.now();
  const lease = await db.prepare(`INSERT INTO knowledge_index_leases VALUES(?,?,?,?)
    ON CONFLICT(uid,knowledge_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE knowledge_index_leases.expires_at<=?`)
    .bind(uid, id, token, now + 120000, now).run();
  if (!lease.meta?.changes) return;
  try {
    const current = await db.prepare(`SELECT i.revision,i.status,i.title,i.content,j.action
      FROM knowledge_items i LEFT JOIN knowledge_index_jobs j ON j.uid=i.uid AND j.knowledge_id=i.id AND j.revision=i.revision
      WHERE i.uid=? AND i.id=? AND i.private_note_id IS NULL`).bind(uid, id).first<{ revision: number; status: string; title: string; content: string; action: string | null }>();
    if (!current) return;
    const entries = await db.prepare(`SELECT vector_id FROM knowledge_index_entries
      WHERE uid=? AND knowledge_id=? AND (revision!=? OR ?!='active')`)
      .bind(uid, id, current.revision, current.status).all<{ vector_id: string }>();
    const obsolete = (entries.results ?? []).map(entry => entry.vector_id);
    for (let offset = 0; offset < obsolete.length; offset += 100) {
      const ids = obsolete.slice(offset, offset + 100);
      await vector.deleteByIds(ids);
      if ((await vector.getByIds(ids)).length) {
        throw new DomainError(503, "knowledge_index_cleanup_pending", "Derived deletion has not been observed.");
      }
    }
    if (obsolete.length) {
      // Keep IDs for periodic reconciliation with asynchronous or late provider mutations.
      await db.prepare(`UPDATE knowledge_index_entries SET checked_at=? WHERE uid=? AND knowledge_id=? AND (revision!=? OR ?!='active')`)
        .bind(now, uid, id, current.revision, current.status).run();
    }
    if (current.status === "active" && current.action === "upsert") {
      const values = await embedding(env, `${current.title}\n${current.content}`);
      const vectorId = await sha256(JSON.stringify([uid, id, current.revision]));
      const namespace = await sha256(uid);
      // Record intent before contacting the external index and guard against jobs superseded during embedding.
      const registered = await db.prepare(`INSERT INTO knowledge_index_entries(uid,knowledge_id,revision,vector_id,checked_at)
        SELECT ?,?,?,?,0 WHERE EXISTS(SELECT 1 FROM knowledge_items WHERE uid=? AND id=? AND revision=? AND status='active')
          AND EXISTS(SELECT 1 FROM knowledge_index_leases WHERE uid=? AND knowledge_id=? AND token=? AND expires_at>?)
        ON CONFLICT(uid,knowledge_id,revision) DO UPDATE SET checked_at=0`)
        .bind(uid, id, current.revision, vectorId, uid, id, current.revision, uid, id, token, Date.now()).run();
      if (!registered.meta?.changes) return;
      await vector.upsert([{ id: vectorId, values, namespace, metadata: { knowledgeId: id, revision: current.revision } }]);
      const after = await db.prepare("SELECT revision,status FROM knowledge_items WHERE uid=? AND id=?")
        .bind(uid, id).first<{ revision: number; status: string }>();
      if (after?.revision !== current.revision || after.status !== "active") {
        await vector.deleteByIds([vectorId]);
        return;
      }
    }
    await db.prepare(`DELETE FROM knowledge_index_jobs WHERE uid=? AND knowledge_id=? AND revision=?
      AND EXISTS(SELECT 1 FROM knowledge_index_leases WHERE uid=? AND knowledge_id=? AND token=?)`)
      .bind(uid, id, current.revision, uid, id, token).run();
  } finally {
    await db.prepare("DELETE FROM knowledge_index_leases WHERE uid=? AND knowledge_id=? AND token=?").bind(uid, id, token).run();
  }
}
export async function dispatchKnowledgeIndex(env: WorkerEnv): Promise<void> {
  if (!externalKnowledgeEnabled(env) || !env.KNOWLEDGE_QUEUE) return;
  const now = Date.now();
  const db = env.QUESTFORGE_DB!;
  const jobs = await db.prepare(`SELECT j.uid,j.knowledge_id,j.revision,j.attempts FROM knowledge_index_jobs j
    WHERE j.uid=? AND NOT EXISTS(SELECT 1 FROM knowledge_index_leases l WHERE l.uid=j.uid AND l.knowledge_id=j.knowledge_id AND l.expires_at>?)
    ORDER BY j.attempts,j.revision LIMIT 20`).bind(env.KNOWLEDGE_OWNER_UID, now).all<Job>();
  const cleanup = await db.prepare(`SELECT e.uid,e.knowledge_id,i.revision FROM knowledge_index_entries e JOIN knowledge_items i ON i.uid=e.uid AND i.id=e.knowledge_id
    WHERE e.uid=? AND (e.revision!=i.revision OR i.status!='active') AND e.checked_at<=?
      AND NOT EXISTS(SELECT 1 FROM knowledge_index_jobs j WHERE j.uid=e.uid AND j.knowledge_id=e.knowledge_id)
      AND NOT EXISTS(SELECT 1 FROM knowledge_index_leases l WHERE l.uid=e.uid AND l.knowledge_id=e.knowledge_id AND l.expires_at>?)
    GROUP BY e.uid,e.knowledge_id,i.revision ORDER BY min(e.checked_at) LIMIT 5`)
    .bind(env.KNOWLEDGE_OWNER_UID, now - 86400000, now).all<Job>();
  let failures = 0;
  for (const job of [...jobs.results ?? [], ...cleanup.results ?? []]) {
    try {
      await env.KNOWLEDGE_QUEUE.send({ uid: job.uid, knowledgeId: job.knowledge_id, revision: job.revision });
      await db.prepare("UPDATE knowledge_index_jobs SET attempts=attempts+1 WHERE uid=? AND knowledge_id=? AND revision=?").bind(job.uid, job.knowledge_id, job.revision).run();
    } catch { failures++; }
  }
  if (failures) console.error("knowledge_queue_dispatch_failed", { failures });
}
