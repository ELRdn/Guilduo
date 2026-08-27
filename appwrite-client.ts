import { beginGoogleSignIn, clearOAuthFailure, currentAccount, getAccessToken, resolveAuthState, signOutAccount, type GuilduoUser } from "./appwrite-auth.ts";
import { trackTelemetry } from "./telemetry.ts";
import type { QuestForgeState } from "./types/questforge.ts";

type RemoteStatePayload = { clientUpdatedAt?: string; state?: QuestForgeState };
type SyncStatus = "local" | "syncing" | "synced" | "error";

const syncPanel = document.querySelector<HTMLElement>("#syncPanel");
const syncStatus = document.querySelector<HTMLElement>("#syncStatus");
const syncSignInButton = document.querySelector<HTMLButtonElement>("#syncSignInButton");
const syncSignOutButton = document.querySelector<HTMLButtonElement>("#syncSignOutButton");
const i18n = globalThis.QuestForgeI18n;
let user: GuilduoUser | null = null;
let uploadTimer: number | null = null;
let pollTimer: number | null = null;
let lastUploadedAt = "";
let currentSyncMessageKey = "sync.local";

function bridge(): NonNullable<typeof globalThis.QuestForgeBridge> | null { return globalThis.QuestForgeBridge || null; }
function gatewayUrl(): string { return String(globalThis.QuestForgeConfig?.gatewayUrl || "").replace(/\/$/, ""); }
function setSyncUi(status: SyncStatus, key: string): void {
  if (syncPanel) syncPanel.dataset.syncState = status;
  currentSyncMessageKey = key;
  if (syncStatus) syncStatus.textContent = i18n?.t?.(key) || key;
}

async function stateRequest(method: "GET" | "PUT", state?: QuestForgeState): Promise<RemoteStatePayload> {
  const token = await getAccessToken();
  if (!token || !gatewayUrl()) throw new Error("Guilduo cloud sync is unavailable");
  const response = await fetch(`${gatewayUrl()}/v1/state`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(state ? { body: JSON.stringify({ state, clientUpdatedAt: state.updatedAt || new Date().toISOString(), deviceId: bridge()?.deviceId || "unknown" }) } : {}),
  });
  if (!response.ok) throw new Error(`Guilduo state ${method} failed: ${response.status}`);
  return response.json() as Promise<RemoteStatePayload>;
}

async function uploadState(state: QuestForgeState): Promise<void> {
  if (!user || (state.updatedAt && state.updatedAt === lastUploadedAt)) return;
  setSyncUi("syncing", "sync.syncing");
  await stateRequest("PUT", state);
  lastUploadedAt = state.updatedAt || "";
  setSyncUi("synced", "sync.synced");
  trackTelemetry("sync_success", { source: "appwrite" });
}

function applyRemote(payload: RemoteStatePayload): void {
  if (!payload.state || !bridge()) return;
  bridge()?.applyCloudState(payload.state);
  lastUploadedAt = payload.state.updatedAt || payload.clientUpdatedAt || "";
  setSyncUi("synced", "sync.synced");
}

async function reconcile(): Promise<void> {
  const local = bridge()?.getSyncSnapshot();
  if (!local) throw new Error("Guilduo bridge is not ready");
  try {
    const remote = await stateRequest("GET");
    const remoteDate = remote.state?.updatedAt || remote.clientUpdatedAt || "";
    const localDate = local.state.updatedAt || "";
    if (remote.state && (!local.hadLocalStateAtStartup || remoteDate > localDate)) applyRemote(remote);
    else if (!remote.state || localDate > remoteDate) await uploadState(local.state);
    else { lastUploadedAt = localDate; setSyncUi("synced", "sync.synced"); }
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) await uploadState(local.state);
    else throw error;
  }
}

function scheduleUpload(state?: QuestForgeState): void {
  if (!state) return;
  if (uploadTimer !== null) window.clearTimeout(uploadTimer);
  uploadTimer = window.setTimeout(() => uploadState(state).catch(() => {
    setSyncUi("error", "sync.error.connection");
    trackTelemetry("sync_failure", { source: "appwrite" });
  }), 900);
}

async function pollRemote(): Promise<void> {
  if (!user) return;
  try {
    const remote = await stateRequest("GET");
    const remoteDate = remote.state?.updatedAt || remote.clientUpdatedAt || "";
    const localDate = bridge()?.getSyncSnapshot().state.updatedAt || "";
    if (remote.state && remoteDate > localDate && remoteDate !== lastUploadedAt) applyRemote(remote);
  } finally {
    if (user) pollTimer = window.setTimeout(() => void pollRemote(), 10_000);
  }
}

const authApi = {
  getIdToken: getAccessToken,
  getUser: currentAccount,
  async flushState(): Promise<boolean> {
    if (!user || !bridge()) return false;
    if (uploadTimer !== null) window.clearTimeout(uploadTimer);
    await uploadState(bridge()!.getSyncSnapshot().state);
    return true;
  },
};
globalThis.GuilduoAuth = authApi;
// Legacy global retained as a compatibility contract; authentication is provided by Appwrite.
globalThis.QuestForgeFirebase = authApi;

syncSignInButton?.addEventListener("click", () => { setSyncUi("syncing", "sync.connecting"); beginGoogleSignIn(); });
syncSignOutButton?.addEventListener("click", async () => { await signOutAccount(); location.reload(); });
window.addEventListener("questforge:state-saved", (event) => { if (user) scheduleUpload(event.detail?.state); });
window.addEventListener("questforge:locale-changed", () => setSyncUi((syncPanel?.dataset.syncState as SyncStatus) || "local", currentSyncMessageKey));

void resolveAuthState().then(async (authState) => {
  if (authState.status === "oauth-failed") {
    clearOAuthFailure();
    setSyncUi("error", "sync.error.cancelled");
    return;
  }
  if (authState.status === "connection-error") {
    setSyncUi("error", "sync.error.connection");
    return;
  }
  user = authState.status === "authenticated" ? authState.user : null;
  window.dispatchEvent(new CustomEvent("questforge:auth-changed", { detail: { user } }));
  if (!user) { setSyncUi("local", "sync.local"); return; }
  if (syncSignInButton) syncSignInButton.hidden = true;
  if (syncSignOutButton) { syncSignOutButton.hidden = false; syncSignOutButton.title = user.email || user.displayName; }
  setSyncUi("syncing", "sync.initial");
  await reconcile();
  void pollRemote();
}).catch(() => setSyncUi("error", "sync.error.connection"));

window.addEventListener("beforeunload", () => { if (pollTimer !== null) window.clearTimeout(pollTimer); });
