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
  batch(statements: D1StatementLike[]): Promise<unknown>;
}

export interface WorkerEnv {
  QUESTFORGE_KV?: KvNamespaceLike;
  QUESTFORGE_DB?: D1DatabaseLike;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_URL?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  PUBLIC_BASE_URL?: string;
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
}

export type WorkerError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

export type JsonRecord = Record<string, unknown>;
