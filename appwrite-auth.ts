import appwriteConfig from "./appwrite-config.js";

export type GuilduoUser = { uid: string; email: string; displayName: string; photoURL?: string };
type AppwriteAccount = { $id?: string; email?: string; name?: string; prefs?: Record<string, unknown> };

const endpoint = String(appwriteConfig.endpoint || "").replace(/\/$/, "");
const projectId = String(appwriteConfig.projectId || "");
let cachedUser: GuilduoUser | null = null;
let cachedJwt = "";
let jwtExpiresAt = 0;

function assertConfigured(): void {
  if (!endpoint || !projectId || projectId === "YOUR_APPWRITE_PROJECT_ID") throw new Error("Appwrite is not configured");
}

async function appwriteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  assertConfigured();
  return fetch(`${endpoint}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", "x-appwrite-project": projectId, ...(init.headers || {}) },
  });
}

function normalizeAccount(account: AppwriteAccount): GuilduoUser {
  const avatar = typeof account.prefs?.avatarUrl === "string" ? account.prefs.avatarUrl : "";
  return { uid: String(account.$id || ""), email: String(account.email || ""), displayName: String(account.name || account.email || ""), ...(avatar ? { photoURL: avatar } : {}) };
}

export async function refreshAccount(): Promise<GuilduoUser | null> {
  try {
    const response = await appwriteFetch("/account");
    if (response.status === 401) { cachedUser = null; cachedJwt = ""; return null; }
    if (!response.ok) throw new Error(`Appwrite account read failed: ${response.status}`);
    cachedUser = normalizeAccount(await response.json() as AppwriteAccount);
    return cachedUser;
  } catch (error) {
    if (error instanceof Error && error.message === "Appwrite is not configured") return null;
    throw error;
  }
}

export function currentAccount(): GuilduoUser | null { return cachedUser; }

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!cachedUser) await refreshAccount();
  if (!cachedUser) return "";
  if (!forceRefresh && cachedJwt && jwtExpiresAt > Date.now() + 30_000) return cachedJwt;
  const response = await appwriteFetch("/account/jwts", { method: "POST", body: "{}" });
  if (!response.ok) throw new Error(`Appwrite JWT creation failed: ${response.status}`);
  cachedJwt = String((await response.json() as { jwt?: string }).jwt || "");
  jwtExpiresAt = Date.now() + 14 * 60 * 1000;
  return cachedJwt;
}

export function beginGoogleSignIn(): never {
  assertConfigured();
  const returnUrl = `${location.origin}${location.pathname}${location.search}${location.hash}`;
  const target = new URL(`${endpoint}/account/sessions/oauth2/google`);
  target.searchParams.set("project", projectId);
  target.searchParams.set("success", returnUrl);
  target.searchParams.set("failure", `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}auth=failed`);
  location.assign(target.toString());
  throw new Error("Redirecting to Appwrite OAuth");
}

export async function signOutAccount(): Promise<void> {
  const response = await appwriteFetch("/account/sessions/current", { method: "DELETE" });
  if (!response.ok && response.status !== 401) throw new Error(`Appwrite sign out failed: ${response.status}`);
  cachedUser = null; cachedJwt = ""; jwtExpiresAt = 0;
}
