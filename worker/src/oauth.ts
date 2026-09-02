import { getOAuthRecordStore, oauthStorageKind, oauthStorageLogContext } from "./oauth-record-store.ts";
import { ALL_SCOPES, randomToken, sha256, verifyAppwriteJwt } from "./security.ts";
import type { AuthIdentity } from "./security.ts";
import { mcpOriginForRequest, primaryMcpOrigin } from "./mcp-origin.ts";
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
type ClientGrant = { uid: string; clientId: string; clientName?: string; scopes: string[]; firstConnectedAt?: string; lastUsedAt?: string; revokedAt?: string; accessHash?: string; refreshHash?: string; refreshExpiresAt?: number; email?: string; redirectUri?: string; challenge?: string };

const MAX_CLIENT_ID_LENGTH = 128;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CODE_CHALLENGE_LENGTH = 128;
const MAX_STATE_LENGTH = 2048;
const MAX_RESOURCE_LENGTH = 2048;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_JWT_LENGTH = 16384;
const MAX_SCOPE_LENGTH = 4096;
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;
const CLIENT_LAST_USED_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const OPAQUE_VALUE_PATTERN = /^[A-Za-z0-9._~-]+$/;
const CLIENT_ID_PATTERN = new RegExp(`^[A-Za-z0-9._~-]{1,${MAX_CLIENT_ID_LENGTH}}$`);
const PKCE_CHALLENGE_PATTERN = new RegExp(`^[A-Za-z0-9._~-]{43,${MAX_CODE_CHALLENGE_LENGTH}}$`);

type OAuthScopeCopy = { label: string; description: string };
type OAuthScopePresentation = { en: OAuthScopeCopy; ja: OAuthScopeCopy };

const OAUTH_SCOPE_PRESENTATION: Readonly<Record<string, OAuthScopePresentation>> = {
  "quests:read": { en: { label: "Quest data", description: "Read your quests and progress." }, ja: { label: "Questの閲覧", description: "Questと進捗を読み取ります。" } },
  "quests:write": { en: { label: "Quest management", description: "Create, update, and progress quests." }, ja: { label: "Questの管理", description: "Questの作成・更新・進行を行います。" } },
  "character:read": { en: { label: "Character state", description: "Read character, MP, equipment, and boss state." }, ja: { label: "キャラクター情報", description: "キャラクター、MP、装備、ボス状態を読み取ります。" } },
  "rewards:write": { en: { label: "Reward redemption", description: "Redeem reward quests using Gems." }, ja: { label: "報酬の利用", description: "Gemを使って報酬を引き換えます。" } },
  "integrations:read": { en: { label: "Integration data", description: "Read connected service settings and data." }, ja: { label: "連携データの閲覧", description: "接続済みサービスの設定とデータを読み取ります。" } },
  "integrations:sync": { en: { label: "Integration sync", description: "Run synchronization with connected services." }, ja: { label: "連携の同期", description: "外部サービスとの同期を実行します。" } },
  "events:read": { en: { label: "Activity history", description: "Read Quest and activity event history." }, ja: { label: "アクティビティ履歴", description: "Questや操作のイベント履歴を読み取ります。" } },
  "webhooks:manage": { en: { label: "Webhook management", description: "Manage Guilduo webhook registrations." }, ja: { label: "Webhook管理", description: "GuilduoのWebhook登録を管理します。" } },
  "plugins:manage": { en: { label: "Plugin management", description: "Manage Guilduo Plugin settings." }, ja: { label: "Plugin管理", description: "Guilduo Pluginの設定を管理します。" } },
  "profiles:read": { en: { label: "Profile data", description: "Read Guilduo profile information." }, ja: { label: "プロフィールの閲覧", description: "Guilduoのプロフィール情報を読み取ります。" } },
  "profiles:write": { en: { label: "Profile management", description: "Create and update Guilduo profile information." }, ja: { label: "プロフィールの管理", description: "Guilduoのプロフィールを作成・更新します。" } },
  "friends:read": { en: { label: "Friends", description: "Read friends and friend requests." }, ja: { label: "フレンドの閲覧", description: "フレンドと申請情報を読み取ります。" } },
  "friends:write": { en: { label: "Friend management", description: "Change friend requests and relationships." }, ja: { label: "フレンドの管理", description: "フレンド申請と関係を変更します。" } },
  "parties:read": { en: { label: "Party data", description: "Read your Party and its members." }, ja: { label: "Partyの閲覧", description: "所属Partyとメンバーを読み取ります。" } },
  "parties:write": { en: { label: "Party management", description: "Change your Party and its members." }, ja: { label: "Partyの管理", description: "Partyとメンバーを変更します。" } },
  "battle:read": { en: { label: "Battle state", description: "Read the current Battle state." }, ja: { label: "Battleの閲覧", description: "Battle状態を読み取ります。" } },
  "battle:write": { en: { label: "Battle actions", description: "Execute Battle commands." }, ja: { label: "Battleの操作", description: "Battleコマンドを実行します。" } },
  "agents:read": { en: { label: "Agent profiles", description: "Read registered Agents and the current Agent context." }, ja: { label: "Agentプロフィールの閲覧", description: "登録済みAgentと現在のAgent contextを読み取ります。" } },
  "agents:write": { en: { label: "Agent connection management", description: "Link, unlink, or relink this MCP connection to a registered Agent." }, ja: { label: "Agent接続の管理", description: "このMCP接続をAgentへlink、unlink、relinkします。" } },
};

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

function oauthError(code: string, status = 400): Response {
  return json({ error: code }, status, { "cache-control": "no-store" });
}

async function atOAuthStage<T>(stage: string, env: WorkerEnv, storageOperation: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const source = error && typeof error === "object" ? error as JsonRecord : {};
    const wrapped = new Error(error instanceof Error ? error.message : String(error));
    wrapped.name = error instanceof Error ? error.name : "Error";
    throw Object.assign(wrapped, {
      ...(typeof source.code === "string" ? { code: source.code } : {}),
      ...(typeof source.type === "string" ? { type: source.type } : {}),
      ...(typeof source.status === "number" ? { status: source.status } : {}),
      oauthStage: stage,
      storage: oauthStorageKind(env).toUpperCase(),
      storageOperation,
    });
  }
}

function isSafeClientId(value: unknown): value is string {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value);
}

function isSafeOpaqueValue(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && OPAQUE_VALUE_PATTERN.test(value);
}

function isSafePkceChallenge(value: unknown): value is string {
  return typeof value === "string" && PKCE_CHALLENGE_PATTERN.test(value);
}

function formText(body: FormData, key: string): string {
  const value = body.get(key);
  return typeof value === "string" ? value : "";
}

function oauthBase(request: Request, env: WorkerEnv): string {
  return mcpOriginForRequest(request, env) || primaryMcpOrigin(env);
}

function allowedScopes(value: unknown): string[] | null {
  if (typeof value === "string" && value.length > MAX_SCOPE_LENGTH) return null;
  const requested = typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean) : [];
  // An explicit scope is the snapshot for this authorization request. Never
  // merge it with an existing grant: OAuth permissions are not escalated
  // silently. Missing scope keeps the backwards-compatible full-scope default
  // for a new authorization request.
  const scopes = requested.length ? [...new Set(requested)] : [...ALL_SCOPES];
  return scopes.every((scope) => ALL_SCOPES.includes(scope)) ? scopes : null;
}

function scopeConsentRows(scopes: string[], locale: "ja" | "en"): string {
  return scopes.map((scope) => {
    const presentation = OAUTH_SCOPE_PRESENTATION[scope]?.[locale] || {
      label: locale === "ja" ? `権限: ${scope}` : `Permission: ${scope}`,
      description: locale === "ja" ? "このMCPクライアントが要求する権限です。" : "Permission requested by this MCP client.",
    };
    return `<div class="scope-row"><strong>${escapeHtml(presentation.label)}</strong><span class="scope-description">${escapeHtml(presentation.description)}</span><code>${escapeHtml(scope)}</code></div>`;
  }).join("");
}

function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REDIRECT_URI_LENGTH) return false;
  try {
    const uri = new URL(value);
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
  let input: JsonRecord;
  try {
    input = asRecord(await request.json());
  } catch {
    return oauthError("invalid_request");
  }
  const redirectValues = Array.isArray(input.redirect_uris) ? input.redirect_uris : [];
  const redirectUris = [...new Set(redirectValues.filter(isAllowedRedirectUri))];
  if (!redirectUris.length || redirectUris.length !== redirectValues.length || redirectUris.length > 20) return oauthError("invalid_redirect_uri");
  const clientId = randomToken("qfc");
  const clientName = typeof input.client_name === "string" && input.client_name.trim() ? input.client_name.trim().slice(0, 100) : "Guilduo MCP client";
  await atOAuthStage("client_registration", env, "put", () => getOAuthRecordStore(env).put(`client:${clientId}`, JSON.stringify({
    clientId,
    clientName,
    redirectUris,
    createdAt: Date.now(),
  })));
  return json({ client_id: clientId, client_name: clientName, redirect_uris: redirectUris, token_endpoint_auth_method: "none" }, 201);
}

export async function authorizePage(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const requestedLanguage = url.searchParams.get("lang") || request.headers.get("accept-language") || "ja";
  const locale = requestedLanguage.toLowerCase().startsWith("ja") ? "ja" : "en";
  const copy = locale === "ja" ? {
    title: "Guilduo 接続許可",
    heading: "Guilduoへ接続",
    request: "が次の操作を要求しています。",
    permissions: "要求された権限",
    privacy: "Googleログイン後に許可します。パスワードはAIクライアントへ共有されません。",
    reauthorize: "追加の権限が必要な場合は、この接続を再認証してください。既存のOAuth権限は自動で拡張されません。",
    approve: "Googleでログインして許可",
    connecting: "Googleへ接続中...",
    failed: "接続できませんでした: ",
  } : {
    title: "Authorize Guilduo",
    heading: "Connect to Guilduo",
    request: "is requesting the following permissions.",
    permissions: "Requested permissions",
    privacy: "You will approve after Google sign-in. Your password is never shared with the AI client.",
    reauthorize: "If you need additional permissions, re-authorize this connection. Existing OAuth grants are never upgraded automatically.",
    approve: "Sign in with Google and approve",
    connecting: "Connecting to Google...",
    failed: "Could not connect: ",
  };
  const responseType = url.searchParams.get("response_type") || "";
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const challenge = url.searchParams.get("code_challenge");
  const state = url.searchParams.get("state") || "";
  const resource = url.searchParams.get("resource") || "";
  const scopes = allowedScopes(url.searchParams.get("scope"));
  if (responseType !== "code" || !isSafeClientId(clientId) || !isAllowedRedirectUri(redirectUri) || !isSafePkceChallenge(challenge) || url.searchParams.get("code_challenge_method") !== "S256" || state.length > MAX_STATE_LENGTH || resource.length > MAX_RESOURCE_LENGTH) return oauthError("invalid_request");
  if (!scopes) return oauthError("invalid_scope");
  const store = getOAuthRecordStore(env);
  const client = asClient(await atOAuthStage("client_load", env, "get", () => store.get(`client:${clientId}`, "json")));
  if (!client) return oauthError("invalid_client");
  if (!client.redirectUris.includes(redirectUri)) return oauthError("invalid_redirect_uri");
  const requestId = randomToken("req");
  const authorizationRequest = {
    clientId,
    redirectUri,
    challenge,
    state,
    resource,
    scopes,
  };
  await atOAuthStage("authorization_request_persist", env, "put", () => store.put(`authorize:${requestId}`, JSON.stringify(authorizationRequest), { expirationTtl: 600 }));
  const appwriteEndpoint = String(env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
  const appwriteProjectId = env.APPWRITE_PROJECT_ID || "";
  const scopeRows = scopeConsentRows(scopes, locale);
  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(copy.title)}</title>
  <style>body{font-family:system-ui;margin:0;background:#eef1ed;color:#202a32}.box{max-width:520px;margin:8vh auto;background:white;border:1px solid #d7ddd8;padding:24px;border-radius:8px;box-shadow:0 18px 45px #20302a20}button{width:100%;padding:13px;border:0;border-radius:7px;background:#526b5c;color:white;font-weight:800}.scopes{padding:12px;background:#f4f6f3;border-radius:7px}.scope-row{padding:10px 0;border-bottom:1px solid #d7ddd8}.scope-row:last-child{border-bottom:0}.scope-row strong,.scope-description{display:block}.scope-description{color:#66716b;font-size:.92rem;line-height:1.4;margin:.15rem 0}.scope-row code{font-size:.82rem;color:#526b5c}small{color:#66716b;line-height:1.5}@media(prefers-color-scheme:dark){body{background:#171c1a;color:#edf2ee}.box{background:#222a26;border-color:#3b4741}.scopes{background:#18201c}.scope-row{border-color:#3b4741}.scope-description,small{color:#b7c2bb}.scope-row code{color:#b8d2bf}}</style>
</head>
<body>
  <main class="box">
    <h1>${escapeHtml(copy.heading)}</h1>
    <p><strong>${escapeHtml(client.clientName)}</strong> ${escapeHtml(copy.request)}</p>
    <h2>${escapeHtml(copy.permissions)}</h2>
    <div class="scopes">${scopeRows}</div>
    <p><small>${escapeHtml(copy.privacy)}</small></p>
    <p><small>${escapeHtml(copy.reauthorize)}</small></p>
    <button id="approve">${escapeHtml(copy.approve)}</button>
    <p id="status" role="status"></p>
  </main>
  <script>const endpoint=${JSON.stringify(appwriteEndpoint)},project=${JSON.stringify(appwriteProjectId)};const headers={'content-type':'application/json','x-appwrite-project':project};document.querySelector('#approve').onclick=async()=>{const status=document.querySelector('#status');status.textContent=${JSON.stringify(copy.connecting)};try{const account=await fetch(endpoint+'/account',{credentials:'include',headers});if(account.status===401){const oauth=new URL(endpoint+'/account/sessions/oauth2/google');oauth.searchParams.set('project',project);oauth.searchParams.set('success',location.href);oauth.searchParams.set('failure',location.href);location.href=oauth.toString();return;}if(!account.ok)throw new Error('account_'+account.status);const jwtResponse=await fetch(endpoint+'/account/jwts',{method:'POST',credentials:'include',headers,body:'{}'});if(!jwtResponse.ok)throw new Error('jwt_'+jwtResponse.status);const jwt=(await jwtResponse.json()).jwt;const response=await fetch('/oauth/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:${JSON.stringify(requestId)},jwt})});const data=await response.json();if(!response.ok)throw new Error(data.error||'authorization_failed');location.href=data.redirect;}catch(error){status.textContent=${JSON.stringify(copy.failed)}+error.message;}};</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function approveAuthorization(request: Request, env: WorkerEnv): Promise<Response> {
  let input: JsonRecord;
  try {
    input = asRecord(await request.json());
  } catch {
    return oauthError("invalid_request");
  }
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  const jwt = typeof input.jwt === "string" ? input.jwt : "";
  if (!isSafeOpaqueValue(requestId, MAX_REQUEST_ID_LENGTH) || !jwt || jwt.length > MAX_JWT_LENGTH) return oauthError("invalid_request");
  const kv = getOAuthRecordStore(env);
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
  return asClientGrant(await getOAuthRecordStore(env).get(`user-client:${uid}:${clientId}`, "json"));
}

async function writeClientGrantIndex(env: WorkerEnv, grant: ClientGrant, tokenHashes: { accessHash: string; refreshHash: string; refreshExpiresAt: number }): Promise<void> {
  const kv = getOAuthRecordStore(env);
  const client = asClient(await kv.get(`client:${grant.clientId}`, "json"));
  const key = `user-client:${grant.uid}:${grant.clientId}`;
  const existing = asRecord(await kv.get(key, "json"));
  const now = new Date().toISOString();
  await kv.put(key, JSON.stringify({
    uid: grant.uid,
    clientId: grant.clientId,
    clientName: client?.clientName || "Guilduo MCP client",
    scopes: grant.scopes || [],
    firstConnectedAt: existing?.firstConnectedAt || now,
    lastUsedAt: now,
    revokedAt: "",
    accessHash: tokenHashes.accessHash,
    refreshHash: tokenHashes.refreshHash,
    refreshExpiresAt: tokenHashes.refreshExpiresAt,
  }));
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
  const kv = getOAuthRecordStore(env);
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
  try {
    const kv = getOAuthRecordStore(env);
    const key = `user-client:${identity.uid}:${identity.clientId}`;
    const record = await readClientGrantIndex(env, identity.uid, identity.clientId);
    if (!record || record.revokedAt) return;
    const now = Date.now();
    const previous = Date.parse(record.lastUsedAt || "");
    if (Number.isFinite(previous) && now - previous < CLIENT_LAST_USED_WRITE_INTERVAL_MS) return;
    record.lastUsedAt = new Date(now).toISOString();
    await kv.put(key, JSON.stringify(record));
  } catch (error) {
    // Activity metadata is observability, not authorization state. A quota or
    // storage outage must not turn a valid MCP request into an authentication
    // failure. Do not log the user, client id, token, or grant payload.
    console.error("oauth_client_activity_update_failed", {
      operation: "oauth.note_client_use",
      storage: oauthStorageKind(env),
      storageOperation: "read_or_upsert",
      reason: storageFailureReason(error),
      errorCode: logValue(errorProperty(error, "code"), "internal_error"),
      errorType: logValue(errorProperty(error, "type") || errorProperty(error, "name") || (error instanceof Error ? error.constructor.name : "Error"), "Error"),
      message: sanitizedErrorMessage(error),
    });
  }
}

export async function revokeAuthorizedClient(env: WorkerEnv, uid: string, clientId: string): Promise<JsonRecord | null> {
  const kv = getOAuthRecordStore(env);
  const key = `user-client:${uid}:${clientId}`;
  const record = await readClientGrantIndex(env, uid, clientId);
  if (!record) return null;
  if (record.refreshHash) await kv.put(`refresh-revoked:${record.refreshHash}`, "1");
  await Promise.all([
    record.accessHash ? kv.delete(`access:${record.accessHash}`) : Promise.resolve(),
    record.refreshHash ? kv.delete(`refresh:${record.refreshHash}`) : Promise.resolve(),
  ]);
  record.revokedAt ||= new Date().toISOString();
  record.accessHash = "";
  record.refreshHash = "";
  await kv.put(key, JSON.stringify(record));
  return publicClientGrant(record);
}

type TokenIssueOptions = { refreshToken?: string; refreshHash?: string; refreshExpiresAt?: number };

async function issueTokens(env: WorkerEnv, grant: ClientGrant, options: TokenIssueOptions = {}): Promise<JsonRecord> {
  const kv = getOAuthRecordStore(env);
  const accessToken = randomToken("qf");
  const refreshToken = options.refreshToken || randomToken("qfr");
  const expiresIn = ACCESS_TOKEN_TTL_SECONDS;
  const now = Date.now();
  const accessHash = await sha256(accessToken);
  const refreshHash = options.refreshHash || await sha256(refreshToken);
  const refreshExpiresAt = Number.isFinite(options.refreshExpiresAt) && Number(options.refreshExpiresAt) > now
    ? Number(options.refreshExpiresAt)
    : now + REFRESH_TOKEN_TTL_SECONDS * 1000;
  const record = { uid: grant.uid, email: grant.email, scopes: grant.scopes, clientId: grant.clientId };
  await kv.put(`access:${accessHash}`, JSON.stringify({ ...record, refreshHash, expiresAt: now + expiresIn * 1000 }), { expirationTtl: expiresIn });
  // Keep the refresh credential stable across refreshes. This makes retries and
  // concurrent refresh requests idempotent; revocation is represented by the
  // refresh-revoked tombstone instead of deleting a token that another request
  // may already be using.
  // A refresh keeps the same refresh credential and absolute expiry. Rewriting
  // both its record and the grant on every refresh added two writes without
  // changing authorization. Revocation remains complete because every access
  // record carries refreshHash and authenticateRequest checks its tombstone.
  if (!options.refreshToken) {
    const refreshTtl = Math.max(1, Math.ceil((refreshExpiresAt - now) / 1000));
    await kv.put(`refresh:${refreshHash}`, JSON.stringify({ ...record, accessHash, refreshHash, refreshExpiresAt }), { expirationTtl: refreshTtl });
    await writeClientGrantIndex(env, grant, { accessHash, refreshHash, refreshExpiresAt });
  }
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: expiresIn, scope: grant.scopes.join(" ") };
}

export async function tokenEndpoint(request: Request, env: WorkerEnv): Promise<Response> {
  let body: FormData;
  try {
    body = await request.formData();
  } catch {
    return oauthError("invalid_request");
  }
  const grantType = formText(body, "grant_type");
  const kv = getOAuthRecordStore(env);
  if (grantType === "authorization_code") {
    const code = formText(body, "code");
    const clientId = formText(body, "client_id");
    const redirectUri = formText(body, "redirect_uri");
    const codeVerifier = formText(body, "code_verifier");
    if (!code || !isSafeClientId(clientId) || !isAllowedRedirectUri(redirectUri) || !isSafeOpaqueValue(codeVerifier, MAX_CODE_CHALLENGE_LENGTH)) return oauthError("invalid_grant");
    const codeHash = await sha256(code);
    const pending = asAuthorizationRequest(await kv.get(`code:${codeHash}`, "json"));
    if (!pending || !pending.uid || pending.clientId !== clientId || pending.redirectUri !== redirectUri) return oauthError("invalid_grant");
    const grant: ClientGrant = { ...pending, uid: pending.uid };
    if (await sha256(codeVerifier) !== grant.challenge) return oauthError("invalid_grant");
    await kv.delete(`code:${codeHash}`);
    return json(await issueTokens(env, grant), 200, { "cache-control": "no-store" });
  }
  if (grantType === "refresh_token") {
    const refreshToken = formText(body, "refresh_token");
    if (!refreshToken || refreshToken.length > MAX_JWT_LENGTH) return oauthError("invalid_grant");
    const refreshHash = await sha256(refreshToken);
    if (await kv.get(`refresh-revoked:${refreshHash}`)) return oauthError("invalid_grant");
    const grant = asClientGrant(await kv.get(`refresh:${refreshHash}`, "json"));
    if (!grant || grant.revokedAt) return oauthError("invalid_grant");
    const refreshExpiresAt = Number(grant.refreshExpiresAt || 0);
    if (!Number.isFinite(refreshExpiresAt) || refreshExpiresAt < 0 || (refreshExpiresAt > 0 && refreshExpiresAt <= Date.now())) return oauthError("invalid_grant");
    const current = await readClientGrantIndex(env, grant.uid, grant.clientId);
    if (current?.revokedAt || (current?.refreshHash && current.refreshHash !== refreshHash)) return oauthError("invalid_grant");
    return json(await issueTokens(env, grant, { refreshToken, refreshHash, refreshExpiresAt: refreshExpiresAt || undefined }), 200, { "cache-control": "no-store" });
  }
  return oauthError(grantType ? "unsupported_grant_type" : "invalid_request");
}

export async function revokeToken(request: Request, env: WorkerEnv): Promise<Response> {
  let body: FormData;
  try {
    body = await request.formData();
  } catch {
    return oauthError("invalid_request");
  }
  const token = formText(body, "token");
  if (!token || token.length > MAX_JWT_LENGTH) return new Response(null, { status: 200 });
  const hash = await sha256(token);
  const kv = getOAuthRecordStore(env);
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

function errorProperty(error: unknown, key: string): unknown {
  return error && typeof error === "object" && key in error ? (error as JsonRecord)[key] : undefined;
}

function logValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
  return normalized || fallback;
}

function errorText(error: unknown): string {
  const value = error instanceof Error ? error.message : errorProperty(error, "message");
  return typeof value === "string" ? value : "Unknown OAuth failure";
}

function sanitizedErrorMessage(error: unknown): string {
  return errorText(error)
    .replace(/https?:\/\/[^\s'"<>]+/gi, "[redacted-url]")
    .replace(/(?:bearer|token|secret|password|api[-_ ]?key|authorization)\s*[:=]\s*[^,;\s]+/gi, "$1=[redacted]")
    .replace(/\bqf(?:r|code)?_[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-value]")
    .slice(0, 240);
}

function downstreamStatus(error: unknown): number | null {
  const explicit = errorProperty(error, "status");
  if (typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 400 && explicit <= 599) return explicit;
  const match = errorText(error).match(/\b([45]\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function storageFailureReason(error: unknown): string {
  const message = errorText(error);
  if (/\bKV\s+put\(\)\s+limit exceeded\b/i.test(message) || /\bquota[_ -]?exceeded\b/i.test(message)) return "quota_exceeded";
  return "storage_error";
}

export function oauthOperationForRequest(request: Request): string | null {
  const path = new URL(request.url).pathname;
  const operations: Record<string, string> = {
    "/oauth/register": "oauth.register_client",
    "/oauth/authorize": "oauth.authorize",
    "/oauth/approve": "oauth.approve_authorization",
    "/oauth/token": "oauth.token",
    "/oauth/revoke": "oauth.revoke",
  };
  return operations[path] || null;
}

export async function logOAuthFailure(operation: string, request: Request, error: unknown): Promise<void> {
  const url = new URL(request.url);
  const clientId = url.pathname === "/oauth/authorize" ? url.searchParams.get("client_id") || "" : "";
  const storage = oauthStorageLogContext(error);
  let clientIdHash: string | null = null;
  try { clientIdHash = clientId ? (await sha256(clientId)).slice(0, 16) : null; } catch { /* Logging must never replace the original OAuth response. */ }
  console.error("oauth_operation_failed", {
    operation,
    method: request.method,
    path: url.pathname,
    cfRay: request.headers.get("cf-ray") || null,
    clientIdHash,
    oauthStage: storage.oauthStage,
    storage: storage.storage,
    storageOperation: storage.storageOperation,
    reason: storageFailureReason(error),
    downstreamStatus: downstreamStatus(error),
    errorCode: logValue(errorProperty(error, "code"), "internal_error"),
    errorType: logValue(errorProperty(error, "type") || errorProperty(error, "name") || (error instanceof Error ? error.constructor.name : "Error"), "Error"),
    message: sanitizedErrorMessage(error),
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
