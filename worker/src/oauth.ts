import { ALL_SCOPES, getKv, randomToken, sha256, verifyAppwriteJwt } from "./security.ts";
import type { AuthIdentity } from "./security.ts";
import type { JsonRecord, WorkerEnv } from "./worker-types.ts";

type ClientRecord = { clientId: string; clientName: string; redirectUris: string[]; createdAt: number };
type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  resource: string;
  scopes: string[];
  uid?: string;
  email?: string;
};
type ClientGrant = { uid: string; clientId: string; clientName?: string; scopes: string[]; firstConnectedAt?: string; lastUsedAt?: string; revokedAt?: string; accessHash?: string; refreshHash?: string; email?: string; redirectUri?: string; challenge?: string };

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asClient(value: unknown): ClientRecord | null {
  const item = asRecord(value);
  if (typeof item.clientId !== "string" || typeof item.clientName !== "string" || !Array.isArray(item.redirectUris)) return null;
  return { clientId: item.clientId, clientName: item.clientName, redirectUris: item.redirectUris.filter((uri): uri is string => typeof uri === "string"), createdAt: Number(item.createdAt || 0) };
}

function asAuthorizationRequest(value: unknown): AuthorizationRequest | null {
  const item = asRecord(value);
  if (typeof item.clientId !== "string" || typeof item.redirectUri !== "string" || typeof item.challenge !== "string") return null;
  return {
    clientId: item.clientId,
    redirectUri: item.redirectUri,
    challenge: item.challenge,
    state: typeof item.state === "string" ? item.state : "",
    resource: typeof item.resource === "string" ? item.resource : "",
    scopes: Array.isArray(item.scopes) ? item.scopes.filter((scope): scope is string => typeof scope === "string") : [],
    ...(typeof item.uid === "string" ? { uid: item.uid } : {}),
    ...(typeof item.email === "string" ? { email: item.email } : {}),
  };
}

function asClientGrant(value: unknown): ClientGrant | null {
  const item = asRecord(value);
  if (typeof item.uid !== "string" || typeof item.clientId !== "string" || !Array.isArray(item.scopes)) return null;
  return {
    ...item,
    uid: item.uid,
    clientId: item.clientId,
    scopes: item.scopes.filter((scope): scope is string => typeof scope === "string"),
  } as ClientGrant;
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
}

function oauthBase(request: Request, env: WorkerEnv): string {
  return env.PUBLIC_BASE_URL || new URL(request.url).origin;
}

function allowedScopes(value: unknown): string[] {
  const requested = String(value || "").split(/\s+/).filter(Boolean);
  return (requested.length ? requested : ALL_SCOPES).filter((scope) => ALL_SCOPES.includes(scope));
}

function isAllowedRedirectUri(value: unknown): value is string {
  try {
    const uri = new URL(String(value));
    if (uri.hash || uri.username || uri.password) return false;
    if (uri.protocol === "https:") return true;
    return uri.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname);
  } catch {
    return false;
  }
}

export function oauthMetadata(request: Request, env: WorkerEnv) {
  const base = oauthBase(request, env);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ALL_SCOPES,
  };
}

export function protectedResourceMetadata(request: Request, env: WorkerEnv) {
  const base = oauthBase(request, env);
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

export async function registerClient(request: Request, env: WorkerEnv): Promise<Response> {
  const input = asRecord(await request.json());
  const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter(isAllowedRedirectUri) : [];
  if (!redirectUris.length) return json({ error: "invalid_redirect_uri" }, 400);
  const clientId = randomToken("qfc");
  await getKv(env).put(`client:${clientId}`, JSON.stringify({
    clientId,
    clientName: String(input.client_name || "QuestForge MCP client").slice(0, 100),
    redirectUris,
    createdAt: Date.now(),
  }));
  return json({ client_id: clientId, client_name: input.client_name, redirect_uris: redirectUris, token_endpoint_auth_method: "none" }, 201);
}

export async function authorizePage(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const requestedLanguage = url.searchParams.get("lang") || request.headers.get("accept-language") || "ja";
  const locale = requestedLanguage.toLowerCase().startsWith("ja") ? "ja" : "en";
  const copy = locale === "ja" ? {
    title: "QuestForge 接続許可",
    heading: "QuestForgeへ接続",
    request: "が次の操作を要求しています。",
    privacy: "Googleログイン後に許可します。パスワードはAIクライアントへ共有されません。",
    approve: "Googleでログインして許可",
    connecting: "Googleへ接続中...",
    failed: "接続できませんでした: ",
  } : {
    title: "Authorize QuestForge",
    heading: "Connect to QuestForge",
    request: "is requesting the following permissions.",
    privacy: "You will approve after Google sign-in. Your password is never shared with the AI client.",
    approve: "Sign in with Google and approve",
    connecting: "Connecting to Google...",
    failed: "Could not connect: ",
  };
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const challenge = url.searchParams.get("code_challenge");
  const client = asClient(await getKv(env).get(`client:${clientId}`, "json"));
  if (!client || !client.redirectUris.includes(redirectUri) || !challenge || url.searchParams.get("code_challenge_method") !== "S256") {
    return new Response("Invalid OAuth request", { status: 400 });
  }
  const requestId = randomToken("req");
  const authorizationRequest = {
    clientId,
    redirectUri,
    challenge,
    state: url.searchParams.get("state") || "",
    resource: url.searchParams.get("resource") || "",
    scopes: allowedScopes(url.searchParams.get("scope")),
  };
  await getKv(env).put(`authorize:${requestId}`, JSON.stringify(authorizationRequest), { expirationTtl: 600 });
  const appwriteEndpoint = String(env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
  const appwriteProjectId = env.APPWRITE_PROJECT_ID || "";
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><style>body{font-family:system-ui;margin:0;background:#eef1ed;color:#202a32}.box{max-width:520px;margin:8vh auto;background:white;border:1px solid #d7ddd8;padding:24px;border-radius:8px;box-shadow:0 18px 45px #20302a20}button{width:100%;padding:13px;border:0;border-radius:7px;background:#526b5c;color:white;font-weight:800}.scopes{padding:12px;background:#f4f6f3;border-radius:7px;line-height:1.8}small{color:#66716b}@media(prefers-color-scheme:dark){body{background:#171c1a;color:#edf2ee}.box{background:#222a26;border-color:#3b4741}.scopes{background:#18201c}small{color:#b7c2bb}}</style></head><body><main class="box"><h1>${escapeHtml(copy.heading)}</h1><p><strong>${escapeHtml(client.clientName)}</strong> ${escapeHtml(copy.request)}</p><div class="scopes">${authorizationRequest.scopes.map(escapeHtml).join("<br>")}</div><p><small>${escapeHtml(copy.privacy)}</small></p><button id="approve">${escapeHtml(copy.approve)}</button><p id="status" role="status"></p></main><script>const endpoint=${JSON.stringify(appwriteEndpoint)},project=${JSON.stringify(appwriteProjectId)};const headers={'content-type':'application/json','x-appwrite-project':project};document.querySelector('#approve').onclick=async()=>{const status=document.querySelector('#status');status.textContent=${JSON.stringify(copy.connecting)};try{const account=await fetch(endpoint+'/account',{credentials:'include',headers});if(account.status===401){const oauth=new URL(endpoint+'/account/sessions/oauth2/google');oauth.searchParams.set('project',project);oauth.searchParams.set('success',location.href);oauth.searchParams.set('failure',location.href);location.href=oauth.toString();return;}if(!account.ok)throw new Error('account_'+account.status);const jwtResponse=await fetch(endpoint+'/account/jwts',{method:'POST',credentials:'include',headers,body:'{}'});if(!jwtResponse.ok)throw new Error('jwt_'+jwtResponse.status);const jwt=(await jwtResponse.json()).jwt;const response=await fetch('/oauth/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:${JSON.stringify(requestId)},jwt})});const data=await response.json();if(!response.ok)throw new Error(data.error||'authorization_failed');location.href=data.redirect;}catch(error){status.textContent=${JSON.stringify(copy.failed)}+error.message;}};</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function approveAuthorization(request: Request, env: WorkerEnv): Promise<Response> {
  const input = asRecord(await request.json());
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  const jwt = typeof input.jwt === "string" ? input.jwt : "";
  const kv = getKv(env);
  const pending = asAuthorizationRequest(await kv.get(`authorize:${requestId}`, "json"));
  if (!pending) return json({ error: "authorization_request_expired" }, 400);
  let identity;
  try { identity = await verifyAppwriteJwt(jwt, env); } catch { return json({ error: "invalid_appwrite_token" }, 401); }
  const code = randomToken("qfcode");
  await kv.put(`code:${await sha256(code)}`, JSON.stringify({ ...pending, uid: identity.uid, email: identity.email }), { expirationTtl: 300 });
  await kv.delete(`authorize:${requestId}`);
  const redirect = new URL(pending.redirectUri);
  redirect.searchParams.set("code", code);
  if (pending.state) redirect.searchParams.set("state", pending.state);
  return json({ redirect: redirect.toString() });
}

async function readClientGrantIndex(env: WorkerEnv, uid: string, clientId: string): Promise<ClientGrant | null> {
  return asClientGrant(await getKv(env).get(`user-client:${uid}:${clientId}`, "json"));
}

async function writeClientGrantIndex(env: WorkerEnv, grant: ClientGrant, tokenHashes: { accessHash: string; refreshHash: string }): Promise<void> {
  const kv = getKv(env);
  const client = asClient(await kv.get(`client:${grant.clientId}`, "json"));
  const key = `user-client:${grant.uid}:${grant.clientId}`;
  const existing = asRecord(await kv.get(key, "json"));
  const now = new Date().toISOString();
  await kv.put(key, JSON.stringify({
    uid: grant.uid,
    clientId: grant.clientId,
    clientName: client?.clientName || "QuestForge MCP client",
    scopes: grant.scopes || [],
    firstConnectedAt: existing?.firstConnectedAt || now,
    lastUsedAt: now,
    revokedAt: "",
    accessHash: tokenHashes.accessHash,
    refreshHash: tokenHashes.refreshHash,
  }), { expirationTtl: 2592000 });
}

function publicClientGrant(record: ClientGrant | null): JsonRecord | null {
  if (!record) return null;
  return {
    clientId: record.clientId,
    clientName: record.clientName,
    scopes: record.scopes || [],
    firstConnectedAt: record.firstConnectedAt || "",
    lastUsedAt: record.lastUsedAt || "",
    revokedAt: record.revokedAt || null,
  };
}

export async function listAuthorizedClients(env: WorkerEnv, uid: string): Promise<JsonRecord[]> {
  const kv = getKv(env);
  const result = await kv.list({ prefix: `user-client:${uid}:` });
  const records = await Promise.all(result.keys.map((item: { name: string }) => readClientGrantIndex(env, uid, item.name.replace(`user-client:${uid}:`, ""))));
  return records.filter((record): record is ClientGrant => Boolean(record)).map(publicClientGrant).filter((record): record is JsonRecord => Boolean(record)).sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")));
}

export async function getAuthorizedClient(env: WorkerEnv, uid: string, clientId: string): Promise<JsonRecord | null> {
  const record = await readClientGrantIndex(env, uid, clientId);
  return record && !record.revokedAt ? publicClientGrant(record) : null;
}

export async function noteAuthorizedClientUse(env: WorkerEnv, identity: AuthIdentity): Promise<void> {
  if (identity?.authType !== "oauth" || !identity.uid || !identity.clientId) return;
  const kv = getKv(env);
  const key = `user-client:${identity.uid}:${identity.clientId}`;
  const record = await readClientGrantIndex(env, identity.uid, identity.clientId);
  if (!record || record.revokedAt) return;
  record.lastUsedAt = new Date().toISOString();
  await kv.put(key, JSON.stringify(record), { expirationTtl: 2592000 });
}

export async function revokeAuthorizedClient(env: WorkerEnv, uid: string, clientId: string): Promise<JsonRecord | null> {
  const kv = getKv(env);
  const key = `user-client:${uid}:${clientId}`;
  const record = await readClientGrantIndex(env, uid, clientId);
  if (!record) return null;
  await Promise.all([
    record.accessHash ? kv.delete(`access:${record.accessHash}`) : Promise.resolve(),
    record.refreshHash ? kv.delete(`refresh:${record.refreshHash}`) : Promise.resolve(),
  ]);
  record.revokedAt ||= new Date().toISOString();
  record.accessHash = "";
  record.refreshHash = "";
  await kv.put(key, JSON.stringify(record), { expirationTtl: 2592000 });
  return publicClientGrant(record);
}

async function issueTokens(env: WorkerEnv, grant: ClientGrant): Promise<JsonRecord> {
  const kv = getKv(env);
  const accessToken = randomToken("qf");
  const refreshToken = randomToken("qfr");
  const expiresIn = 3600;
  const accessHash = await sha256(accessToken);
  const refreshHash = await sha256(refreshToken);
  const record = { uid: grant.uid, email: grant.email, scopes: grant.scopes, clientId: grant.clientId };
  await kv.put(`access:${accessHash}`, JSON.stringify({ ...record, refreshHash, expiresAt: Date.now() + expiresIn * 1000 }), { expirationTtl: expiresIn });
  await kv.put(`refresh:${refreshHash}`, JSON.stringify({ ...record, accessHash }), { expirationTtl: 2592000 });
  await writeClientGrantIndex(env, grant, { accessHash, refreshHash });
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: expiresIn, scope: grant.scopes.join(" ") };
}

export async function tokenEndpoint(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await request.formData();
  const grantType = body.get("grant_type");
  const kv = getKv(env);
  if (grantType === "authorization_code") {
    const code = String(body.get("code") || "");
    const pending = asAuthorizationRequest(await kv.get(`code:${await sha256(code)}`, "json"));
    if (!pending || !pending.uid || pending.clientId !== body.get("client_id") || pending.redirectUri !== body.get("redirect_uri")) return json({ error: "invalid_grant" }, 400);
    const grant: ClientGrant = { ...pending, uid: pending.uid };
    if (await sha256(String(body.get("code_verifier") || "")) !== grant.challenge) return json({ error: "invalid_grant" }, 400);
    await kv.delete(`code:${await sha256(code)}`);
    return json(await issueTokens(env, grant), 200, { "cache-control": "no-store" });
  }
  if (grantType === "refresh_token") {
    const refreshToken = String(body.get("refresh_token") || "");
    const grant = asClientGrant(await kv.get(`refresh:${await sha256(refreshToken)}`, "json"));
    if (!grant) return json({ error: "invalid_grant" }, 400);
    await kv.delete(`refresh:${await sha256(refreshToken)}`);
    return json(await issueTokens(env, grant), 200, { "cache-control": "no-store" });
  }
  return json({ error: "unsupported_grant_type" }, 400);
}

export async function revokeToken(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await request.formData();
  const token = String(body.get("token") || "");
  const hash = await sha256(token);
  const kv = getKv(env);
  const [accessRecord, refreshRecord] = await Promise.all([
    kv.get<JsonRecord>(`access:${hash}`, "json"),
    kv.get<JsonRecord>(`refresh:${hash}`, "json"),
  ]);
  await Promise.all([
    kv.delete(`access:${hash}`),
    kv.delete(`refresh:${hash}`),
    accessRecord?.refreshHash ? kv.delete(`refresh:${accessRecord.refreshHash}`) : Promise.resolve(),
    refreshRecord?.accessHash ? kv.delete(`access:${refreshRecord.accessHash}`) : Promise.resolve(),
  ]);
  const record = accessRecord || refreshRecord;
  if (record?.uid && record?.clientId) {
    await revokeAuthorizedClient(env, String(record.uid), String(record.clientId));
  }
  return new Response(null, { status: 200 });
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
