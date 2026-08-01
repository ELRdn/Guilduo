import { ALL_SCOPES, getKv, randomToken, sha256, verifyFirebaseIdToken } from "./security.mjs";

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
}

function oauthBase(request, env) {
  return env.PUBLIC_BASE_URL || new URL(request.url).origin;
}

function allowedScopes(value) {
  const requested = String(value || "").split(/\s+/).filter(Boolean);
  return (requested.length ? requested : ALL_SCOPES).filter((scope) => ALL_SCOPES.includes(scope));
}

export function oauthMetadata(request, env) {
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

export function protectedResourceMetadata(request, env) {
  const base = oauthBase(request, env);
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

export async function registerClient(request, env) {
  const input = await request.json();
  const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((uri) => /^https?:\/\//.test(uri)) : [];
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

export async function authorizePage(request, env) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const challenge = url.searchParams.get("code_challenge");
  const client = await getKv(env).get(`client:${clientId}`, "json");
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
  const firebaseConfig = {
    apiKey: env.FIREBASE_API_KEY || "",
    authDomain: env.FIREBASE_AUTH_DOMAIN || `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: env.FIREBASE_PROJECT_ID || "",
  };
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuestForge 接続許可</title><style>body{font-family:system-ui;margin:0;background:#eef1ed;color:#202a32}.box{max-width:520px;margin:8vh auto;background:white;border:1px solid #d7ddd8;padding:24px;border-radius:8px;box-shadow:0 18px 45px #20302a20}button{width:100%;padding:13px;border:0;border-radius:7px;background:#526b5c;color:white;font-weight:800}.scopes{padding:12px;background:#f4f6f3;border-radius:7px;line-height:1.8}small{color:#66716b}</style></head><body><main class="box"><h1>QuestForgeへ接続</h1><p><strong>${escapeHtml(client.clientName)}</strong>が次の操作を要求しています。</p><div class="scopes">${authorizationRequest.scopes.map(escapeHtml).join("<br>")}</div><p><small>Googleログイン後に許可します。パスワードはAIクライアントへ共有されません。</small></p><button id="approve">Googleでログインして許可</button><p id="status" role="status"></p></main><script src="https://www.gstatic.com/firebasejs/12.1.0/firebase-app-compat.js"></script><script src="https://www.gstatic.com/firebasejs/12.1.0/firebase-auth-compat.js"></script><script>firebase.initializeApp(${JSON.stringify(firebaseConfig)});document.querySelector('#approve').onclick=async()=>{const status=document.querySelector('#status');status.textContent='Googleへ接続中...';try{const result=await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());const idToken=await result.user.getIdToken();const response=await fetch('/oauth/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:${JSON.stringify(requestId)},idToken})});const data=await response.json();if(!response.ok)throw new Error(data.error||'authorization_failed');location.href=data.redirect;}catch(error){status.textContent='接続できませんでした: '+error.message;}};</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function approveAuthorization(request, env) {
  const { requestId, idToken } = await request.json();
  const kv = getKv(env);
  const pending = await kv.get(`authorize:${requestId}`, "json");
  if (!pending) return json({ error: "authorization_request_expired" }, 400);
  let identity;
  try { identity = await verifyFirebaseIdToken(idToken, env); } catch { return json({ error: "invalid_firebase_token" }, 401); }
  const code = randomToken("qfcode");
  await kv.put(`code:${await sha256(code)}`, JSON.stringify({ ...pending, uid: identity.uid, email: identity.email }), { expirationTtl: 300 });
  await kv.delete(`authorize:${requestId}`);
  const redirect = new URL(pending.redirectUri);
  redirect.searchParams.set("code", code);
  if (pending.state) redirect.searchParams.set("state", pending.state);
  return json({ redirect: redirect.toString() });
}

async function issueTokens(env, grant) {
  const kv = getKv(env);
  const accessToken = randomToken("qf");
  const refreshToken = randomToken("qfr");
  const expiresIn = 3600;
  const record = { uid: grant.uid, email: grant.email, scopes: grant.scopes, clientId: grant.clientId };
  await kv.put(`access:${await sha256(accessToken)}`, JSON.stringify({ ...record, expiresAt: Date.now() + expiresIn * 1000 }), { expirationTtl: expiresIn });
  await kv.put(`refresh:${await sha256(refreshToken)}`, JSON.stringify(record), { expirationTtl: 2592000 });
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: expiresIn, scope: grant.scopes.join(" ") };
}

export async function tokenEndpoint(request, env) {
  const body = await request.formData();
  const grantType = body.get("grant_type");
  const kv = getKv(env);
  if (grantType === "authorization_code") {
    const code = String(body.get("code") || "");
    const grant = await kv.get(`code:${await sha256(code)}`, "json");
    if (!grant || grant.clientId !== body.get("client_id") || grant.redirectUri !== body.get("redirect_uri")) return json({ error: "invalid_grant" }, 400);
    if (await sha256(String(body.get("code_verifier") || "")) !== grant.challenge) return json({ error: "invalid_grant" }, 400);
    await kv.delete(`code:${await sha256(code)}`);
    return json(await issueTokens(env, grant), 200, { "cache-control": "no-store" });
  }
  if (grantType === "refresh_token") {
    const refreshToken = String(body.get("refresh_token") || "");
    const grant = await kv.get(`refresh:${await sha256(refreshToken)}`, "json");
    if (!grant) return json({ error: "invalid_grant" }, 400);
    await kv.delete(`refresh:${await sha256(refreshToken)}`);
    return json(await issueTokens(env, grant), 200, { "cache-control": "no-store" });
  }
  return json({ error: "unsupported_grant_type" }, 400);
}

export async function revokeToken(request, env) {
  const body = await request.formData();
  const token = String(body.get("token") || "");
  const hash = await sha256(token);
  const kv = getKv(env);
  await Promise.all([kv.delete(`access:${hash}`), kv.delete(`refresh:${hash}`)]);
  return new Response(null, { status: 200 });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

