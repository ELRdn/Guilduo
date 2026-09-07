import { Account, Client, OAuthProvider } from "appwrite";
import appwriteConfig from "./appwrite-config.js";

export type GuilduoUser = { uid: string; email: string; displayName: string; photoURL?: string };
type AppwriteAccount = { $id?: string; email?: string; name?: string; prefs?: Record<string, unknown> };
type AppwriteAccountPort = {
  get: () => Promise<AppwriteAccount>;
  createJWT: (params?: { duration?: number }) => Promise<{ jwt?: string }>;
  createOAuth2Token: (params: { provider: OAuthProvider; success?: string; failure?: string; scopes?: string[] }) => void | string;
  createSession: (params: { userId: string; secret: string }) => Promise<unknown>;
  deleteSession: (params: { sessionId: string }) => Promise<unknown>;
};

export type GuilduoAuthState =
  | { status: "authenticated"; user: GuilduoUser }
  | { status: "signed-out" }
  | { status: "oauth-failed" }
  | { status: "connection-error"; error: unknown };

type AuthOptions = {
  account: AppwriteAccountPort;
  getReturnUrl?: () => string;
  getOAuthCallback?: () => { userId: string; secret: string } | null;
  clearOAuthCallback?: () => void;
  now?: () => number;
};
type BrowserLocation = { origin: string; pathname: string; search: string; hash: string; href: string };
type BrowserHistory = { state: unknown; replaceState: (data: unknown, unused: string, url?: string | URL | null) => void };

const endpoint = String(appwriteConfig.endpoint || "").replace(/\/$/, "");
const projectId = String(appwriteConfig.projectId || "");

function assertConfigured(): void {
  if (!endpoint || !projectId || projectId === "YOUR_APPWRITE_PROJECT_ID") throw new Error("Appwrite is not configured");
}

function normalizeAccount(account: AppwriteAccount): GuilduoUser {
  const avatar = typeof account.prefs?.avatarUrl === "string" ? account.prefs.avatarUrl : "";
  return { uid: String(account.$id || ""), email: String(account.email || ""), displayName: String(account.name || account.email || ""), ...(avatar ? { photoURL: avatar } : {}) };
}

function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === 401 || candidate.status === 401;
}

function browserReturnUrl(): string {
  const browserLocation = (globalThis as unknown as { location?: BrowserLocation }).location;
  if (!browserLocation) throw new Error("Browser location is unavailable");
  const target = new URL(browserLocation.href);
  for (const key of ["auth", "userId", "secret"]) target.searchParams.delete(key);
  return target.toString();
}

function browserOAuthCallback(): { userId: string; secret: string } | null {
  const browserLocation = (globalThis as unknown as { location?: BrowserLocation }).location;
  const params = new URLSearchParams(browserLocation?.search || "");
  const userId = params.get("userId") || "";
  const secret = params.get("secret") || "";
  return userId && secret ? { userId, secret } : null;
}

function clearBrowserAuthParameters(): void {
  const browser = globalThis as unknown as { location?: BrowserLocation; history?: BrowserHistory };
  if (!browser.location || !browser.history) return;
  const current = new URL(browser.location.href);
  for (const key of ["auth", "userId", "secret"]) current.searchParams.delete(key);
  browser.history.replaceState(browser.history.state, "", `${current.pathname}${current.search}${current.hash}`);
}

function failureUrl(returnUrl: string): string {
  const target = new URL(returnUrl);
  target.searchParams.set("auth", "failed");
  return target.toString();
}

export function createGuilduoAuth(options: AuthOptions) {
  const now = options.now || Date.now;
  const getReturnUrl = options.getReturnUrl || browserReturnUrl;
  const getOAuthCallback = options.getOAuthCallback || browserOAuthCallback;
  const clearOAuthCallback = options.clearOAuthCallback || clearBrowserAuthParameters;
  let cachedUser: GuilduoUser | null = null;
  let cachedJwt = "";
  let jwtExpiresAt = 0;
  let jwtInFlight: Promise<string> | null = null;
  let authGeneration = 0;

  async function refreshAccount(): Promise<GuilduoUser> {
    cachedUser = normalizeAccount(await options.account.get());
    return cachedUser;
  }

  async function resolveAuthState(): Promise<GuilduoAuthState> {
    const callback = getOAuthCallback();
    let callbackError: unknown = null;
    if (callback) {
      try {
        await options.account.createSession(callback);
      } catch (error) {
        callbackError = error;
      } finally {
        clearOAuthCallback();
      }
    }

    try {
      return { status: "authenticated", user: await refreshAccount() };
    } catch (error) {
      cachedUser = null;
      cachedJwt = "";
      jwtExpiresAt = 0;
      if (callback) {
        if (callbackError && !isUnauthorized(callbackError)) return { status: "connection-error", error: callbackError };
        if (isUnauthorized(error)) return { status: "oauth-failed" };
      }
      if (isUnauthorized(error)) return { status: "signed-out" };
      return { status: "connection-error", error };
    }
  }

  async function getAccessToken(forceRefresh = false): Promise<string> {
    if (!cachedUser) {
      const state = await resolveAuthState();
      if (state.status !== "authenticated") return "";
    }
    if (jwtInFlight) return jwtInFlight;
    if (!forceRefresh && cachedJwt && jwtExpiresAt > now() + 30_000) return cachedJwt;
    const generation = authGeneration;
    const pending = options.account.createJWT({ duration: 900 }).then((result) => {
      if (generation !== authGeneration) return "";
      cachedJwt = String(result.jwt || "");
      jwtExpiresAt = now() + 14 * 60 * 1000;
      return cachedJwt;
    });
    jwtInFlight = pending;
    try { return await pending; } finally { if (jwtInFlight === pending) jwtInFlight = null; }
  }

  function beginGoogleSignIn(): void {
    const returnUrl = getReturnUrl();
    options.account.createOAuth2Token({
      provider: OAuthProvider.Google,
      success: returnUrl,
      failure: failureUrl(returnUrl),
    });
  }

  async function signOutAccount(): Promise<void> {
    authGeneration += 1;
    jwtInFlight = null;
    try {
      await options.account.deleteSession({ sessionId: "current" });
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }
    cachedUser = null;
    cachedJwt = "";
    jwtExpiresAt = 0;
  }

  return {
    refreshAccount,
    resolveAuthState,
    currentAccount: (): GuilduoUser | null => cachedUser,
    getAccessToken,
    beginGoogleSignIn,
    signOutAccount,
  };
}

let productionAuth: ReturnType<typeof createGuilduoAuth> | null = null;

function auth(): ReturnType<typeof createGuilduoAuth> {
  assertConfigured();
  if (!productionAuth) {
    const client = new Client().setEndpoint(endpoint).setProject(projectId);
    productionAuth = createGuilduoAuth({ account: new Account(client) });
  }
  return productionAuth;
}

export function hasOAuthFailure(search = (globalThis as unknown as { location?: BrowserLocation }).location?.search || ""): boolean {
  return new URLSearchParams(search).get("auth") === "failed";
}

export function clearOAuthFailure(): void {
  clearBrowserAuthParameters();
}

export async function resolveAuthState(): Promise<GuilduoAuthState> {
  if (hasOAuthFailure()) return { status: "oauth-failed" };
  try {
    return await auth().resolveAuthState();
  } catch (error) {
    if (error instanceof Error && error.message === "Appwrite is not configured") return { status: "signed-out" };
    return { status: "connection-error", error };
  }
}

export async function refreshAccount(): Promise<GuilduoUser | null> {
  const state = await resolveAuthState();
  if (state.status === "authenticated") return state.user;
  if (state.status === "connection-error") throw state.error;
  return null;
}

export function currentAccount(): GuilduoUser | null {
  return productionAuth?.currentAccount() || null;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  try {
    return await auth().getAccessToken(forceRefresh);
  } catch (error) {
    if (error instanceof Error && error.message === "Appwrite is not configured") return "";
    throw error;
  }
}

export function beginGoogleSignIn(): void {
  auth().beginGoogleSignIn();
}

export async function signOutAccount(): Promise<void> {
  if (!productionAuth) {
    try { auth(); } catch { return; }
  }
  await productionAuth?.signOutAccount();
}
