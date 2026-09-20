export interface KvNamespaceLike {
  get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<Array<{ meta?: { changes?: number } }>>;
}

export interface R2ObjectLike {
  readonly httpEtag?: string;
  readonly etag?: string;
  readonly size?: number;
  /** `null` only for a HEAD-style response; a real `get()` result always has a body. */
  readonly body: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2ListedObjectLike {
  readonly key: string;
  readonly size: number;
  readonly uploaded: Date;
  readonly httpEtag?: string;
  readonly etag?: string;
}

export interface R2ListResultLike {
  readonly objects: R2ListedObjectLike[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

export interface R2BucketLike {
  /**
   * Every caller in this codebase writes to a freshly generated key
   * (`crypto.randomUUID()` — see `agent-avatar-store.ts`), so this is always
   * an insert in practice. Nothing here enforces overwrite-refusal at the
   * storage layer; uniqueness comes from the caller never reusing a key.
   */
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ httpEtag?: string; etag?: string } | null>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
  /** Used only by the orphan inventory/cleanup pass (`agent-avatar-cleanup.ts`) — never on the request-serving path. */
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2ListResultLike>;
}

export interface WorkerEnv {
  QUESTFORGE_KV?: KvNamespaceLike;
  QUESTFORGE_DB?: D1DatabaseLike;
  /** Private Agent and profile avatar image bytes. Namespace prefixes and D1 metadata keep ownership separate. */
  AGENT_AVATARS?: R2BucketLike;
  APPWRITE_ENDPOINT?: string;
  APPWRITE_PROJECT_ID?: string;
  APPWRITE_DATABASE_ID?: string;
  APPWRITE_STATE_TABLE_ID?: string;
  APPWRITE_LEGACY_TABLE_ID?: string;
  APPWRITE_API_KEY?: string;
  APPWRITE_REVISION_BATCH?: string;
  PUBLIC_BASE_URL?: string;
  /** Provider OAuth callback origin; falls back to PUBLIC_BASE_URL for compatibility. */
  PROVIDER_OAUTH_BASE_URL?: string;
  /** Comma/space separated exact origins allowed to identify the MCP server. */
  MCP_ALLOWED_ORIGINS?: string;
  WEB_APP_URL?: string;
  ALLOWED_ORIGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  NOTION_AUTH_URL?: string;
  NOTION_CLIENT_ID?: string;
  NOTION_CLIENT_SECRET?: string;
  INTEGRATION_TOKEN_KEY?: string;
  DEV_BEARER_TOKEN?: string;
  DEV_USER_ID?: string;
  AGENT_NOW?: string;
  SOCIAL_NOW?: string;
  /** Opt-in switch for the scheduled orphan avatar cleanup (agent-avatar-cleanup.ts): unset or anything other than exactly "true" stays report-only. */
  AGENT_AVATAR_CLEANUP_EXECUTE?: string;
}

export type WorkerError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

export type JsonRecord = Record<string, unknown>;
