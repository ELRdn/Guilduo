import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { QuestForgeState } from "../types/questforge.ts";
import type { D1DatabaseLike, D1StatementLike, R2BucketLike, R2ObjectLike } from "../worker/src/worker-types.ts";

export type TestRequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

export type TestContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type JsonRecord = Record<string, unknown>;

export type ErrorWithCode = Error & {
  code?: string;
};

export function asQuestForgeState<T>(state: T): QuestForgeState {
  return state as unknown as QuestForgeState;
}

export async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

export function asError(error: unknown): ErrorWithCode {
  return error instanceof Error ? error as ErrorWithCode : new Error(String(error));
}

export function required<T>(value: T | null | undefined, label = "value"): T {
  if (value === null || value === undefined) throw new Error(`${label} was unexpectedly empty.`);
  return value;
}

interface FakeR2StoredObject {
  bytes: Uint8Array;
  contentType?: string;
  uploaded: Date;
}

/**
 * A minimal in-memory stand-in for an R2 bucket, for tests that need to
 * exercise real put/get/delete behaviour (streamed body, ETag, content-type)
 * without a live Cloudflare binding. Each `put()` calls a real Web Streams
 * body on `get()` rather than buffering, matching the production contract in
 * `agent-avatar-store.ts`.
 */
export class FakeR2Bucket implements R2BucketLike {
  readonly store = new Map<string, FakeR2StoredObject>();
  putCalls = 0;

  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<{ httpEtag?: string; etag?: string } | null> {
    this.putCalls += 1;
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.store.set(key, { bytes, contentType: options?.httpMetadata?.contentType, uploaded: new Date() });
    const etag = `"fake-etag-${key}"`;
    return { httpEtag: etag, etag };
  }

  async get(key: string): Promise<R2ObjectLike | null> {
    const stored = this.store.get(key);
    if (!stored) return null;
    const etag = `"fake-etag-${key}"`;
    return {
      httpEtag: etag,
      etag,
      size: stored.bytes.byteLength,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(stored.bytes);
          controller.close();
        },
      }),
      async arrayBuffer(): Promise<ArrayBuffer> {
        return stored.bytes.buffer as ArrayBuffer;
      },
      writeHttpMetadata(headers: Headers): void {
        if (stored.contentType) headers.set("content-type", stored.contentType);
      },
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: Array<{ key: string; size: number; uploaded: Date; httpEtag?: string; etag?: string }>; truncated: boolean; cursor?: string }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const allKeys = [...this.store.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = options?.cursor ? Number(options.cursor) : 0;
    const page = allKeys.slice(start, start + limit);
    const objects = page.map((key) => {
      const stored = this.store.get(key) as FakeR2StoredObject;
      const etag = `"fake-etag-${key}"`;
      return { key, size: stored.bytes.byteLength, uploaded: stored.uploaded, httpEtag: etag, etag };
    });
    const truncated = start + limit < allKeys.length;
    return { objects, truncated, cursor: truncated ? String(start + limit) : undefined };
  }

  /** Test-only: backdates an already-`put()` object's upload time, for exercising the cleanup pass's grace period without a real clock wait. */
  setUploadedAt(key: string, uploaded: Date): void {
    const stored = this.store.get(key);
    if (stored) stored.uploaded = uploaded;
  }
}

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

function migrationFileNames(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
}

/** SQLite `db.exec()` binds no parameters — every value here is a fixed migration filename from the repository. */
function readMigrationSql(name: string): string {
  if (!migrationFileNames().includes(name)) throw new Error(`Unknown migration: ${name}`);
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

function loadMigrationsSql(throughMigration?: string): string {
  const files = migrationFileNames();
  if (throughMigration !== undefined && !files.includes(throughMigration)) throw new Error(`Unknown migration: ${throughMigration}`);
  const selected = throughMigration === undefined ? files : files.filter((name) => name <= throughMigration);
  return selected.map(readMigrationSql).join("\n");
}

class SqliteStatement implements D1StatementLike {
  constructor(private readonly db: DatabaseSync, private readonly sql: string, private readonly params: unknown[] = []) {}

  bind(...values: unknown[]): D1StatementLike {
    return new SqliteStatement(this.db, this.sql, values);
  }

  /**
   * Synchronous on purpose, and called directly (never through `await`)
   * inside `SqliteD1Database.batch()`. `node:sqlite` itself is fully
   * synchronous, but `await`-ing an `async` method still yields at least one
   * microtask turn — enough for a second, genuinely-concurrent `.batch()`
   * call (the exact scenario the CAS regression tests below exercise) to
   * interleave its own `BEGIN` between this one's statements. Calling this
   * synchronous form from `batch()` keeps a whole batch inside one JS turn,
   * matching D1's real single-writer serialization instead of accidentally
   * modeling something looser.
   */
  execRunSync(): { meta?: { changes?: number } } {
    const info = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { meta: { changes: Number(info.changes) } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows as T[] };
  }

  async run(): Promise<{ meta?: { changes?: number } }> {
    return this.execRunSync();
  }
}

/**
 * A real SQLite-backed stand-in for D1, built from the actual migration
 * files in `migrations/` (applied in filename order, exactly like
 * `wrangler d1 migrations apply`). Unlike `agent-store.ts`'s in-memory Map
 * fallback — which every existing test exercises and which has no
 * network-call boundary to race across — this runs the real SQL text against
 * a real single-writer SQLite engine, so `.batch()` atomicity and `changes()`
 * gating (see `updateAgent` in agent-store.ts) are verified against actual
 * SQLite semantics rather than a JS reimplementation of them. In-memory
 * only; never touches any file on disk or any real D1/Cloudflare resource.
 */
export class SqliteD1Database implements D1DatabaseLike {
  readonly raw: DatabaseSync;
  readonly preparedSql: string[] = [];

  constructor(options: { throughMigration?: string } = {}) {
    this.raw = new DatabaseSync(":memory:");
    this.raw.exec(loadMigrationsSql(options.throughMigration));
  }

  applyMigration(name: string): void {
    this.raw.exec(readMigrationSql(name));
  }

  prepare(sql: string): D1StatementLike {
    this.preparedSql.push(sql);
    return new SqliteStatement(this.raw, sql);
  }

  /**
   * D1's `.batch()` runs its statements sequentially inside one implicit
   * transaction: all statements commit together, or (on a genuine SQL error)
   * none do. A `changes = 0` UPDATE is not an error — it commits like any
   * other successful statement — which is exactly the behaviour `updateAgent`
   * relies on `changes()`-gating the connection-revoke statement against.
   *
   * Deliberately has no `await` in its body (see `execRunSync` above): the
   * whole BEGIN..COMMIT sequence runs in one synchronous JS turn, so two
   * `.batch()` calls issued concurrently via `Promise.all` can never
   * interleave their statements against each other, exactly like D1's real
   * single-writer serialization.
   */
  async batch(statements: D1StatementLike[]): Promise<Array<{ meta?: { changes?: number } }>> {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => (statement as SqliteStatement).execRunSync());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.raw.close();
  }
}
