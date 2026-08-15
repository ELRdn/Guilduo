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
type FirebaseJwk = JsonRecord & { kid?: string };
let firebaseJwks: { keys: FirebaseJwk[] } | null = null;
let firebaseJwksExpiresAt = 0;
let serviceAccessToken: string | null = null;
let serviceAccessTokenExpiresAt = 0;

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
];

export interface AuthIdentity {
  uid: string;
  email: string;
  scopes: string[];
  authType: "firebase" | "dev" | "oauth";
  firebaseIdToken?: string;
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

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJwtPart(value: string): JsonRecord {
  const decoded = jsonValue(new TextDecoder().decode(decodeBase64Url(value)));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Invalid Firebase token payload");
  return decoded as JsonRecord;
}

function stringField(value: JsonRecord, key: string): string {
  return typeof value[key] === "string" ? value[key] as string : "";
}

function numberField(value: JsonRecord, key: string): number {
  return Number(value[key] || 0);
}

async function loadFirebaseJwks(): Promise<{ keys: FirebaseJwk[] }> {
  if (firebaseJwks && firebaseJwksExpiresAt > Date.now()) return firebaseJwks;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("Unable to load Firebase signing keys");
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  const value = await response.json().catch(() => ({} as unknown));
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  const keys = Array.isArray(record.keys) ? record.keys.filter((key): key is FirebaseJwk => Boolean(key && typeof key === "object" && !Array.isArray(key))) : [];
  firebaseJwks = { keys };
  firebaseJwksExpiresAt = Date.now() + maxAge * 1000;
  return firebaseJwks;
}

export async function verifyFirebaseIdToken(token: string, env: WorkerEnv): Promise<AuthIdentity> {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid Firebase token");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (stringField(header, "alg") !== "RS256" || !stringField(header, "kid")) throw new Error("Unsupported Firebase token");
  const projectId = env.FIREBASE_PROJECT_ID || "";
  const now = Math.floor(Date.now() / 1000);
  if (!projectId || stringField(payload, "aud") !== projectId || stringField(payload, "iss") !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Firebase token audience mismatch");
  }
  if (!stringField(payload, "sub") || numberField(payload, "exp") <= now || numberField(payload, "iat") > now + 60) throw new Error("Expired Firebase token");
  const jwks = await loadFirebaseJwks();
  const jwk = jwks.keys.find((key) => key.kid === stringField(header, "kid"));
  if (!jwk) throw new Error("Unknown Firebase signing key");
  const key = await subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Invalid Firebase token signature");
  return { uid: stringField(payload, "sub"), email: stringField(payload, "email"), scopes: [...ALL_SCOPES], authType: "firebase", firebaseIdToken: token };
}

function asAuthIdentity(value: unknown): AuthIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as JsonRecord;
  if (typeof item.uid !== "string") return null;
  const authType = item.authType === "dev" || item.authType === "oauth" || item.authType === "firebase" ? item.authType : "oauth";
  const scopes = Array.isArray(item.scopes) ? item.scopes.filter((scope): scope is string => typeof scope === "string") : [];
  return { uid: item.uid, email: typeof item.email === "string" ? item.email : "", scopes, authType, firebaseIdToken: typeof item.firebaseIdToken === "string" ? item.firebaseIdToken : undefined, clientId: typeof item.clientId === "string" ? item.clientId : undefined };
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
  if (oauth && record && numberField(record, "expiresAt") > Date.now()) return { ...oauth, authType: "oauth" };
  try {
    return await verifyFirebaseIdToken(token, env);
  } catch {
    return null;
  }
}

function pemToBytes(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

export async function getFirebaseServiceAccessToken(env: WorkerEnv): Promise<string | null> {
  if (serviceAccessToken && serviceAccessTokenExpiresAt > Date.now() + 60000) return serviceAccessToken;
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const key = await subtle.importKey(
    "pkcs8",
    pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claims}`)));
  const assertion = `${header}.${claims}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Firebase service authentication failed: ${response.status}`);
  const value = await response.json().catch(() => ({} as unknown));
  const result = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  serviceAccessToken = stringField(result, "access_token") || null;
  serviceAccessTokenExpiresAt = Date.now() + numberField(result, "expires_in") * 1000;
  return serviceAccessToken;
}
