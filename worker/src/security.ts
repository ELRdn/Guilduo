import type { JsonRecord, KvNamespaceLike, WorkerEnv } from "./worker-types.ts";

const encoder = new TextEncoder();
type CryptoSubtleCompat = {
  digest(algorithm: string, data: unknown): Promise<ArrayBuffer>;
  importKey(format: string, keyData: unknown, algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<unknown>;
  verify(algorithm: string, key: unknown, signature: unknown, data: unknown): Promise<boolean>;
  sign(algorithm: string, key: unknown, data: unknown): Promise<ArrayBuffer>;
};
const subtle = crypto.subtle as unknown as CryptoSubtleCompat;
type MemoryKvValue = { value: string; expiresAt: number };
const memoryKv = new Map<string, MemoryKvValue>();

export const ALL_SCOPES = [
  "quests:read",
  "quests:write",
  "character:read",
  "rewards:write",
  "integrations:read",
  "integrations:sync",
  "events:read",
  "webhooks:manage",
  "plugins:manage",
  "profiles:read",
  "profiles:write",
  "friends:read",
  "friends:write",
  "parties:read",
  "parties:write",
  "battle:read",
  "battle:write",
  "agents:read",
  "agents:write",
];

export interface AuthIdentity {
  uid: string;
  email: string;
  scopes: string[];
  authType: "appwrite" | "dev" | "oauth";
  appwriteJwt?: string;
  clientId?: string;
}

function jsonValue(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export function getKv(env: WorkerEnv): KvNamespaceLike {
  if (env.QUESTFORGE_KV) return env.QUESTFORGE_KV;
  return {
    async get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null> {
      const item = memoryKv.get(key);
      if (!item || (item.expiresAt && item.expiresAt < Date.now())) {
        memoryKv.delete(key);
        return null;
      }
      return (type === "json" ? jsonValue(item.value) : item.value) as T;
    },
    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
      memoryKv.set(key, {
        value: String(value),
        expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0,
      });
    },
    async delete(key: string): Promise<void> { memoryKv.delete(key); },
    async list({ prefix = "" }: { prefix?: string } = {}): Promise<{ keys: Array<{ name: string }> }> {
      return { keys: [...memoryKv.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
    },
  };
}

export function randomToken(prefix = "qf"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}_${base64Url(bytes)}`;
}

export async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await subtle.digest("SHA-256", encoder.encode(value))));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringField(value: JsonRecord, key: string): string {
  return typeof value[key] === "string" ? value[key] as string : "";
}

function numberField(value: JsonRecord, key: string): number {
  return Number(value[key] || 0);
}

export async function verifyAppwriteJwt(token: string, env: WorkerEnv): Promise<AuthIdentity> {
  const endpoint = String(env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
  if (!endpoint || !env.APPWRITE_PROJECT_ID) throw new Error("Appwrite is not configured");
  const response = await fetch(`${endpoint}/account`, {
    headers: { "x-appwrite-project": env.APPWRITE_PROJECT_ID, "x-appwrite-jwt": token },
  });
  if (!response.ok) throw new Error("Invalid Appwrite JWT");
  const value = await response.json().catch(() => ({} as unknown));
  const account = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  const uid = stringField(account, "$id");
  if (!uid) throw new Error("Invalid Appwrite account");
  return { uid, email: stringField(account, "email"), scopes: [...ALL_SCOPES], authType: "appwrite", appwriteJwt: token };
}

function asAuthIdentity(value: unknown): AuthIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as JsonRecord;
  if (typeof item.uid !== "string") return null;
  const authType = item.authType === "dev" || item.authType === "oauth" || item.authType === "appwrite" ? item.authType : "oauth";
  const scopes = Array.isArray(item.scopes) ? item.scopes.filter((scope): scope is string => typeof scope === "string") : [];
  return { uid: item.uid, email: typeof item.email === "string" ? item.email : "", scopes, authType, appwriteJwt: typeof item.appwriteJwt === "string" ? item.appwriteJwt : undefined, clientId: typeof item.clientId === "string" ? item.clientId : undefined };
}

export async function authenticateRequest(request: Request, env: WorkerEnv): Promise<AuthIdentity | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  if (env.DEV_BEARER_TOKEN && token === env.DEV_BEARER_TOKEN) {
    return { uid: env.DEV_USER_ID || "local-dev", email: "local@questforge.dev", scopes: [...ALL_SCOPES], authType: "dev" };
  }
  const kv = getKv(env);
  const record = await kv.get<JsonRecord>(`access:${await sha256(token)}`, "json");
  const oauth = asAuthIdentity(record);
  const refreshHash = typeof record?.refreshHash === "string" ? record.refreshHash : "";
  const revoked = refreshHash ? await kv.get(`refresh-revoked:${refreshHash}`) : null;
  if (oauth && record && numberField(record, "expiresAt") > Date.now() && !revoked) return { ...oauth, authType: "oauth" };
  try {
    return await verifyAppwriteJwt(token, env);
  } catch {
    return null;
  }
}
