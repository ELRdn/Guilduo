// @ts-nocheck
const encoder = new TextEncoder();
const memoryKv = new Map();
let firebaseJwks = null;
let firebaseJwksExpiresAt = 0;
let serviceAccessToken = null;
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

export function getKv(env) {
  if (env.QUESTFORGE_KV) return env.QUESTFORGE_KV;
  return {
    async get(key, type) {
      const item = memoryKv.get(key);
      if (!item || (item.expiresAt && item.expiresAt < Date.now())) {
        memoryKv.delete(key);
        return null;
      }
      if (type === "json") return JSON.parse(item.value);
      return item.value;
    },
    async put(key, value, options = {}) {
      memoryKv.set(key, {
        value: String(value),
        expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0,
      });
    },
    async delete(key) { memoryKv.delete(key); },
    async list({ prefix = "" } = {}) {
      return { keys: [...memoryKv.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
    },
  };
}

export function randomToken(prefix = "qf") {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}_${base64Url(bytes)}`;
}

export async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function loadFirebaseJwks() {
  if (firebaseJwks && firebaseJwksExpiresAt > Date.now()) return firebaseJwks;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("Unable to load Firebase signing keys");
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  firebaseJwks = await response.json();
  firebaseJwksExpiresAt = Date.now() + maxAge * 1000;
  return firebaseJwks;
}

export async function verifyFirebaseIdToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid Firebase token");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Firebase token");
  const projectId = env.FIREBASE_PROJECT_ID;
  const now = Math.floor(Date.now() / 1000);
  if (!projectId || payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Firebase token audience mismatch");
  }
  if (!payload.sub || payload.exp <= now || payload.iat > now + 60) throw new Error("Expired Firebase token");
  const jwks = await loadFirebaseJwks();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Unknown Firebase signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Invalid Firebase token signature");
  return { uid: payload.sub, email: payload.email || "", scopes: ALL_SCOPES, authType: "firebase", firebaseIdToken: token };
}

export async function authenticateRequest(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  if (env.DEV_BEARER_TOKEN && token === env.DEV_BEARER_TOKEN) {
    return { uid: env.DEV_USER_ID || "local-dev", email: "local@questforge.dev", scopes: ALL_SCOPES, authType: "dev" };
  }
  const kv = getKv(env);
  const oauth = await kv.get(`access:${await sha256(token)}`, "json");
  if (oauth && oauth.expiresAt > Date.now()) return { ...oauth, authType: "oauth" };
  try {
    return await verifyFirebaseIdToken(token, env);
  } catch {
    return null;
  }
}

function pemToBytes(pem) {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

export async function getFirebaseServiceAccessToken(env) {
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
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claims}`)));
  const assertion = `${header}.${claims}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Firebase service authentication failed: ${response.status}`);
  const result = await response.json();
  serviceAccessToken = result.access_token;
  serviceAccessTokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
  return serviceAccessToken;
}
