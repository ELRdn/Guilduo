import { getOAuthRecordStore } from "./oauth-record-store.ts";
import { mcpOriginForRequest } from "./mcp-origin.ts";
import type { JsonRecord, WorkerEnv } from "./worker-types.ts";

export { getKv } from "./kv-store.ts";

const encoder = new TextEncoder();
type CryptoSubtleCompat = {
  digest(algorithm: string, data: unknown): Promise<ArrayBuffer>;
  importKey(format: string, keyData: unknown, algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<unknown>;
  verify(algorithm: string, key: unknown, signature: unknown, data: unknown): Promise<boolean>;
  sign(algorithm: string, key: unknown, data: unknown): Promise<ArrayBuffer>;
};
const subtle = crypto.subtle as unknown as CryptoSubtleCompat;

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
  /** Verified Appwrite account creation time, never inferred from workspace creation. */
  accountCreatedAt?: string;
}

export function randomToken(prefix = "qf"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}_${base64Url(bytes)}`;
}

export async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await subtle.digest("SHA-256", encoder.encode(value))));
}

/** Durable Disconnect boundary without raw owner/client identifiers in the key. */
export async function oauthClientDisconnectKey(uid: string, clientId: string): Promise<string> {
  return `client-disconnected:${await sha256(JSON.stringify([uid, clientId]))}`;
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

/** Resource indicators are exact, explicitly trusted MCP URLs. */
export function isAllowedOAuthResource(resource: unknown, env: WorkerEnv): resource is string {
  if (typeof resource !== "string" || !resource || resource.length > 2048) return false;
  try {
    const origin = mcpOriginForRequest(new Request(resource), env);
    return Boolean(origin && resource === `${origin}/mcp`);
  } catch {
    return false;
  }
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
  const createdAt = stringField(account, "$createdAt");
  return { uid, email: stringField(account, "email"), scopes: [...ALL_SCOPES], authType: "appwrite", appwriteJwt: token,
    ...(Number.isFinite(Date.parse(createdAt)) ? { accountCreatedAt: new Date(createdAt).toISOString() } : {}) };
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
  // Shape selects a verifier only; identity and scopes still require Appwrite.
  // Guilduo OAuth tokens are opaque (qf_...), never compact JWTs.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    try { return await verifyAppwriteJwt(token, env); } catch { return null; }
  }
  const kv = getOAuthRecordStore(env);
  const record = await kv.get<JsonRecord>(`access:${await sha256(token)}`, "json");
  // Old records without an audience retain compatibility. Bound MCP tokens
  // cannot be replayed on another host or on unrelated REST surfaces.
  if (record && record.resource !== undefined && record.resource !== "") {
    const url = new URL(request.url);
    if (!isAllowedOAuthResource(record.resource, env)
      || record.resource !== `${mcpOriginForRequest(request, env)}/mcp`
      || !["/mcp", "/mcp-next"].includes(url.pathname)) return null;
  }
  const oauth = asAuthIdentity(record);
  const refreshHash = typeof record?.refreshHash === "string" ? record.refreshHash : "";
  const revoked = refreshHash ? await kv.get(`refresh-revoked:${refreshHash}`) : null;
  if (oauth && record && numberField(record, "expiresAt") > Date.now() && !revoked) {
    if (record.clientId !== undefined && (typeof record.clientId !== "string" || !record.clientId)) return null;
    if (oauth.clientId) {
      const value = await kv.get<string>(`user-client:${oauth.uid}:${oauth.clientId}`);
      if (value !== null) {
        let grant: JsonRecord;
        try {
          const parsed: unknown = JSON.parse(value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
          grant = parsed as JsonRecord;
        } catch { return null; }
        if (grant.uid !== oauth.uid || grant.clientId !== oauth.clientId || !Array.isArray(grant.scopes)
          || grant.scopes.some(scope => typeof scope !== "string" || !ALL_SCOPES.includes(scope))
          || (grant.revokedAt !== undefined && (typeof grant.revokedAt !== "string" || grant.revokedAt !== ""))
          || (grant.refreshHash !== undefined && (typeof grant.refreshHash !== "string"
            || (grant.refreshHash !== "" && grant.refreshHash !== refreshHash)))) return null;
        if (!grant.refreshHash && await kv.get(await oauthClientDisconnectKey(oauth.uid, oauth.clientId))) return null;
      } else if (await kv.get(await oauthClientDisconnectKey(oauth.uid, oauth.clientId))) return null;
    }
    return { ...oauth, authType: "oauth" };
  }
  try {
    return await verifyAppwriteJwt(token, env);
  } catch {
    return null;
  }
}
