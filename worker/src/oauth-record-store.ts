import { getKv } from "./kv-store.ts";
import type { JsonRecord, KvNamespaceLike, WorkerEnv } from "./worker-types.ts";

type OAuthRecordRow = {
  record_key: string;
  value_json: string;
  expires_at: number;
  is_deleted: number;
};

function parseJson<T>(value: string): T | null {
  try { return JSON.parse(value) as T; } catch { return null; }
}

function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

class D1OAuthRecordStore implements KvNamespaceLike {
  constructor(private readonly env: WorkerEnv) {}

  private async row(key: string): Promise<OAuthRecordRow | null> {
    return this.env.QUESTFORGE_DB!.prepare(
      "SELECT record_key, value_json, expires_at, is_deleted FROM oauth_records WHERE record_key = ?",
    ).bind(key).first<OAuthRecordRow>();
  }

  async get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null> {
    const row = await this.row(key);
    if (row) {
      if (Number(row.is_deleted) === 1 || (Number(row.expires_at) > 0 && Number(row.expires_at) <= Date.now())) return null;
      return (type === "json" ? parseJson<T>(row.value_json) : row.value_json as T);
    }
    return getKv(this.env).get<T>(key, type);
  }

  async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
    const ttl = Number(options.expirationTtl || 0);
    const now = Date.now();
    const expiresAt = Number.isFinite(ttl) && ttl > 0 ? now + Math.ceil(ttl * 1000) : 0;
    await this.env.QUESTFORGE_DB!.prepare(`INSERT INTO oauth_records
      (record_key, value_json, expires_at, is_deleted, updated_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(record_key) DO UPDATE SET
        value_json = excluded.value_json,
        expires_at = excluded.expires_at,
        is_deleted = 0,
        updated_at = excluded.updated_at`)
      .bind(key, String(value), expiresAt, now)
      .run();
  }

  async delete(key: string): Promise<void> {
    const now = Date.now();
    await this.env.QUESTFORGE_DB!.prepare(`INSERT INTO oauth_records
      (record_key, value_json, expires_at, is_deleted, updated_at)
      VALUES (?, '', 0, 1, ?)
      ON CONFLICT(record_key) DO UPDATE SET
        value_json = '',
        expires_at = 0,
        is_deleted = 1,
        updated_at = excluded.updated_at`)
      .bind(key, now)
      .run();
  }

  async list({ prefix = "" }: { prefix?: string } = {}): Promise<{ keys: Array<{ name: string }> }> {
    const rows = (await this.env.QUESTFORGE_DB!.prepare(
      "SELECT record_key, value_json, expires_at, is_deleted FROM oauth_records WHERE record_key LIKE ? ESCAPE '\\'",
    ).bind(`${escapeLikePrefix(prefix)}%`).all<OAuthRecordRow>()).results || [];
    const now = Date.now();
    const masked = new Set(rows.map((row) => row.record_key));
    const active = rows
      .filter((row) => Number(row.is_deleted) !== 1 && !(Number(row.expires_at) > 0 && Number(row.expires_at) <= now))
      .map((row) => row.record_key);
    const legacy = await getKv(this.env).list({ prefix });
    const names = new Set([...active, ...legacy.keys.map((item) => item.name).filter((name) => !masked.has(name))]);
    return { keys: [...names].sort().map((name) => ({ name })) };
  }
}

export function getOAuthRecordStore(env: WorkerEnv): KvNamespaceLike {
  return env.QUESTFORGE_DB ? new D1OAuthRecordStore(env) : getKv(env);
}

/**
 * Permanently removes user-owned OAuth records after a grant has already been
 * revoked. D1 normally uses tombstones so legacy KV data cannot reappear on a
 * read-through miss; a hard delete must remove the legacy KV copy first and
 * only then remove the D1 rows. The revocation tombstone is deliberately not
 * included by callers, so a replayed refresh credential remains denied.
 */
export async function purgeOAuthRecordKeys(env: WorkerEnv, keys: readonly string[]): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter((key): key is string => typeof key === "string" && key.length > 0))];
  if (uniqueKeys.length === 0) return;

  const legacy = getKv(env);
  await Promise.all(uniqueKeys.map((key) => legacy.delete(key)));
  if (!env.QUESTFORGE_DB) return;

  await env.QUESTFORGE_DB.batch(uniqueKeys.map((key) => env.QUESTFORGE_DB!.prepare(
    "DELETE FROM oauth_records WHERE record_key = ?",
  ).bind(key)));
}

export function oauthStorageKind(env: WorkerEnv): "d1" | "kv" | "ephemeral" {
  if (env.QUESTFORGE_DB) return "d1";
  return env.QUESTFORGE_KV ? "kv" : "ephemeral";
}

export function oauthStorageLogContext(error: unknown): JsonRecord {
  const value = error && typeof error === "object" ? error as JsonRecord : {};
  return {
    oauthStage: typeof value.oauthStage === "string" ? value.oauthStage : "unhandled",
    storage: typeof value.storage === "string" ? value.storage : null,
    storageOperation: typeof value.storageOperation === "string" ? value.storageOperation : null,
  };
}
