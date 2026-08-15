import { getKv, randomToken } from "./security.ts";
import {
  deleteIntegrationAccount,
  getIntegrationAccount,
  saveIntegrationAccount,
} from "./integration-store.ts";
import type { JsonRecord, WorkerEnv, WorkerError } from "./worker-types.ts";

const GOOGLE_SERVICES = ["google-calendar", "google-tasks"];
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/tasks",
];

type ProviderAccount = {
  uid: string;
  service: string;
  status: string;
  tokenExpiresAt: number;
  providerAccountId: string;
  providerAccountName: string;
  settings: JsonRecord;
  cursor: JsonRecord;
  lastSyncedAt: string;
  lastError: string;
  lockUntil: number;
  createdAt: string;
  updatedAt: string;
  accessToken?: string;
  refreshToken?: string;
};

type OAuthPending = {
  uid: string;
  email: string;
  provider: string;
  requestedService: string;
  createdAt: number;
};

function integrationError(status: number, code: string, message: string): WorkerError {
  return Object.assign(new Error(message), { status, code }) as WorkerError;
}

function callbackUrl(env: WorkerEnv, service: string): string {
  return `${String(env.PUBLIC_BASE_URL || "").replace(/\/$/, "")}/oauth/callback/${service}`;
}

function appReturnUrl(env: WorkerEnv, service: string, result: string, message = ""): string {
  const url = new URL(env.WEB_APP_URL || "http://localhost:5173");
  url.searchParams.set("view", "integrations");
  url.searchParams.set("integration", service);
  url.searchParams.set("result", result);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return url.toString();
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asPending(value: unknown): OAuthPending | null {
  const item = asRecord(value);
  if (!item || typeof item.uid !== "string" || typeof item.provider !== "string" || typeof item.requestedService !== "string") return null;
  return {
    uid: item.uid,
    email: typeof item.email === "string" ? item.email : "",
    provider: item.provider,
    requestedService: item.requestedService,
    createdAt: Number(item.createdAt || 0),
  };
}

function asProviderAccount(value: unknown): ProviderAccount | null {
  const item = asRecord(value);
  if (!item || typeof item.uid !== "string" || typeof item.service !== "string") return null;
  return {
    uid: item.uid,
    service: item.service,
    status: typeof item.status === "string" ? item.status : "not_connected",
    tokenExpiresAt: Number(item.tokenExpiresAt || 0),
    providerAccountId: typeof item.providerAccountId === "string" ? item.providerAccountId : "",
    providerAccountName: typeof item.providerAccountName === "string" ? item.providerAccountName : "",
    settings: asRecord(item.settings) || {},
    cursor: asRecord(item.cursor) || {},
    lastSyncedAt: typeof item.lastSyncedAt === "string" ? item.lastSyncedAt : "",
    lastError: typeof item.lastError === "string" ? item.lastError : "",
    lockUntil: Number(item.lockUntil || 0),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    accessToken: typeof item.accessToken === "string" ? item.accessToken : undefined,
    refreshToken: typeof item.refreshToken === "string" ? item.refreshToken : undefined,
  };
}

function stringField(value: JsonRecord, key: string): string {
  return typeof value[key] === "string" ? value[key] as string : "";
}

function numberField(value: JsonRecord, key: string, fallback = 0): number {
  return Number(value[key] || fallback);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function providerJson(url: string, options: RequestInit = {}): Promise<JsonRecord> {
  const response = await fetch(url, options);
  const value = await response.json().catch(() => ({} as unknown));
  const body = asRecord(value) || {};
  if (!response.ok) {
    throw integrationError(
      response.status === 401 ? 401 : 502,
      response.status === 401 ? "provider_unauthorized" : "provider_error",
      stringField(body, "error_description") || stringField(body, "message") || stringField(body, "error") || `Provider HTTP ${response.status}`,
    );
  }
  return body;
}

export async function beginIntegrationConnect(env: WorkerEnv, identity: { uid: string; email?: string }, service: string) {
  if (![...GOOGLE_SERVICES, "notion"].includes(service)) {
    if (service === "toggl-track") throw integrationError(409, "integration_planned", "Toggl Track connection will be enabled after Google and Notion validation.");
    throw integrationError(404, "integration_not_found", "Unknown integration.");
  }
  const state = randomToken("qfoauth");
  const provider = GOOGLE_SERVICES.includes(service) ? "google" : "notion";
  await getKv(env).put(`provider-oauth:${state}`, JSON.stringify({ uid: identity.uid, email: identity.email || "", provider, requestedService: service, createdAt: Date.now() }), { expirationTtl: 600 });

  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw integrationError(503, "provider_not_configured", "Google OAuth client is not configured.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", callbackUrl(env, "google"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return { service, provider, authorizationUrl: url.toString() };
  }

  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) throw integrationError(503, "provider_not_configured", "Notion OAuth client is not configured.");
  const url = new URL(env.NOTION_AUTH_URL || "https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("owner", "user");
  url.searchParams.set("client_id", env.NOTION_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl(env, "notion"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return { service, provider, authorizationUrl: url.toString() };
}

async function exchangeGoogleCode(env: WorkerEnv, code: string): Promise<JsonRecord> {
  const token = await providerJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID || "", client_secret: env.GOOGLE_CLIENT_SECRET || "", redirect_uri: callbackUrl(env, "google"), grant_type: "authorization_code" }),
  });
  const profile = await providerJson("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${stringField(token, "access_token")}` } });
  return { ...token, profile };
}

async function exchangeNotionCode(env: WorkerEnv, code: string): Promise<JsonRecord> {
  const authorization = btoa(`${env.NOTION_CLIENT_ID || ""}:${env.NOTION_CLIENT_SECRET || ""}`);
  return providerJson("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { authorization: `Basic ${authorization}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(env, "notion") }),
  });
}

export async function handleProviderCallback(request: Request, env: WorkerEnv, service: string): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const pending = asPending(await getKv(env).get(`provider-oauth:${state}`, "json"));
  if (!pending || pending.provider !== service || Date.now() - pending.createdAt > 600000) {
    return Response.redirect(appReturnUrl(env, service, "error", "OAuth request expired or was changed."), 302);
  }
  await getKv(env).delete(`provider-oauth:${state}`);
  if (url.searchParams.get("error")) return Response.redirect(appReturnUrl(env, pending.requestedService, "cancelled", url.searchParams.get("error_description") || url.searchParams.get("error") || ""), 302);
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(appReturnUrl(env, pending.requestedService, "error", "Authorization code is missing."), 302);
  try {
    if (service === "google") {
      const token = await exchangeGoogleCode(env, code);
      const profile = asRecord(token.profile) || {};
      for (const id of GOOGLE_SERVICES) {
        const existing = asProviderAccount(await getIntegrationAccount(env, pending.uid, id));
        await saveIntegrationAccount(env, pending.uid, id, {
          status: "connected",
          accessToken: stringField(token, "access_token"),
          refreshToken: stringField(token, "refresh_token") || undefined,
          tokenExpiresAt: Date.now() + numberField(token, "expires_in", 3600) * 1000,
          providerAccountId: stringField(profile, "sub"),
          providerAccountName: stringField(profile, "email") || pending.email,
          settings: existing?.settings || { autoSync: false },
          lastError: "",
        });
      }
    } else {
      const token = await exchangeNotionCode(env, code);
      const owner = asRecord(token.owner);
      const ownerUser = asRecord(owner?.user);
      await saveIntegrationAccount(env, pending.uid, "notion", {
        status: "connected",
        accessToken: stringField(token, "access_token"),
        refreshToken: stringField(token, "refresh_token"),
        tokenExpiresAt: token.expires_in ? Date.now() + numberField(token, "expires_in") * 1000 : 0,
        providerAccountId: stringField(token, "bot_id") || stringField(ownerUser || {}, "id"),
        providerAccountName: stringField(token, "workspace_name") || pending.email,
        settings: { autoSync: false, workspaceId: stringField(token, "workspace_id") },
        lastError: "",
      });
    }
    return Response.redirect(appReturnUrl(env, pending.requestedService, "connected"), 302);
  } catch (error: unknown) {
    return Response.redirect(appReturnUrl(env, pending.requestedService, "error", errorMessage(error)), 302);
  }
}

async function refreshGoogleToken(env: WorkerEnv, uid: string, _service: string, account: ProviderAccount): Promise<string> {
  if (!account.refreshToken) throw integrationError(401, "reconnect_required", "Google refresh token is missing. Reconnect Google.");
  const token = await providerJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID || "", client_secret: env.GOOGLE_CLIENT_SECRET || "", refresh_token: account.refreshToken, grant_type: "refresh_token" }),
  });
  for (const id of GOOGLE_SERVICES) {
    if (await getIntegrationAccount(env, uid, id)) await saveIntegrationAccount(env, uid, id, { accessToken: stringField(token, "access_token"), tokenExpiresAt: Date.now() + numberField(token, "expires_in", 3600) * 1000, status: "connected", lastError: "" });
  }
  return stringField(token, "access_token");
}

async function refreshNotionToken(env: WorkerEnv, uid: string, account: ProviderAccount): Promise<string> {
  if (!account.refreshToken) throw integrationError(401, "reconnect_required", "Notion refresh token is missing. Reconnect Notion.");
  const token = await providerJson("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID || ""}:${env.NOTION_CLIENT_SECRET || ""}`)}`, "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: account.refreshToken }),
  });
  await saveIntegrationAccount(env, uid, "notion", { accessToken: stringField(token, "access_token"), refreshToken: stringField(token, "refresh_token") || account.refreshToken, tokenExpiresAt: token.expires_in ? Date.now() + numberField(token, "expires_in") * 1000 : 0, status: "connected", lastError: "" });
  return stringField(token, "access_token");
}

export async function getIntegrationAccessToken(env: WorkerEnv, uid: string, service: string): Promise<string> {
  const account = asProviderAccount(await getIntegrationAccount(env, uid, service, { includeTokens: true }));
  if (!account || account.status === "not_connected") throw integrationError(409, "integration_not_connected", `${service} is not connected.`);
  if (account.status === "reconnect_required") throw integrationError(401, "reconnect_required", `${service} must be reconnected.`);
  if (!account.accessToken) throw integrationError(401, "reconnect_required", `${service} access token is missing.`);
  if (!account.tokenExpiresAt || account.tokenExpiresAt > Date.now() + 60000) return account.accessToken;
  try {
    return GOOGLE_SERVICES.includes(service) ? await refreshGoogleToken(env, uid, service, account) : await refreshNotionToken(env, uid, account);
  } catch (error: unknown) {
    await saveIntegrationAccount(env, uid, service, { status: "reconnect_required", lastError: errorMessage(error) });
    throw error;
  }
}

export async function disconnectIntegration(env: WorkerEnv, uid: string, service: string): Promise<{ disconnected: string[] }> {
  const services = GOOGLE_SERVICES.includes(service) ? GOOGLE_SERVICES : [service];
  const account = asProviderAccount(await getIntegrationAccount(env, uid, service, { includeTokens: true }));
  if (account?.accessToken) {
    try {
      if (GOOGLE_SERVICES.includes(service)) await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: account.accessToken }) });
      else if (service === "notion") await fetch("https://api.notion.com/v1/oauth/revoke", { method: "POST", headers: { authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID || ""}:${env.NOTION_CLIENT_SECRET || ""}`)}`, "content-type": "application/json" }, body: JSON.stringify({ token: account.accessToken }) });
    } catch { /* Local disconnect must still succeed if provider revocation is unavailable. */ }
  }
  await Promise.all(services.map((id) => deleteIntegrationAccount(env, uid, id)));
  return { disconnected: services };
}
