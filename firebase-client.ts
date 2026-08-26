import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  get,
  getDatabase,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
  type DatabaseReference,
} from "firebase/database";
import firebaseConfig from "./firebase-config.js";
import { trackTelemetry } from "./telemetry.ts";
import type { QuestForgeState } from "./types/questforge.ts";

type RemoteStatePayload = {
  clientUpdatedAt?: string;
  state?: unknown;
  [key: string]: unknown;
};

type SyncStatus = "local" | "syncing" | "synced" | "error";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const provider = new GoogleAuthProvider();

const syncPanel = document.querySelector<HTMLElement>("#syncPanel");
const syncStatus = document.querySelector<HTMLElement>("#syncStatus");
const syncSignInButton = document.querySelector<HTMLButtonElement>("#syncSignInButton");
const syncSignOutButton = document.querySelector<HTMLButtonElement>("#syncSignOutButton");
const i18n = globalThis.QuestForgeI18n;

let currentUser: User | null = null;
let currentStateRef: DatabaseReference | null = null;
let stopStateSubscription: (() => void) | null = null;
let uploadTimer: number | null = null;
let lastUploadedAt = "";
let lastEntityFingerprints = new Map<string, string>();
let currentSyncMessageKey = "sync.local";

globalThis.QuestForgeFirebase = {
  async getIdToken(forceRefresh = false): Promise<string> {
    return currentUser ? currentUser.getIdToken(forceRefresh) : "";
  },
  getUser() {
    return currentUser ? { uid: currentUser.uid, email: currentUser.email || "", displayName: currentUser.displayName || "" } : null;
  },
  async flushState(): Promise<boolean> {
    const bridge = getBridge();
    if (!currentUser || !currentStateRef || !bridge) return false;
    clearUploadTimer();
    await uploadState(bridge.getSyncSnapshot().state);
    return true;
  },
};

function getBridge(): NonNullable<typeof globalThis.QuestForgeBridge> | null {
  return globalThis.QuestForgeBridge || null;
}

function setSyncUi(status: SyncStatus, messageKey: string): void {
  if (syncPanel) syncPanel.dataset.syncState = status;
  currentSyncMessageKey = messageKey;
  if (syncStatus) syncStatus.textContent = i18n?.t?.(messageKey) || messageKey;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toRemotePayload(value: unknown): RemoteStatePayload {
  return asRecord(value) as RemoteStatePayload || {};
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stateUpdatedAt(value: unknown): string {
  return readText(asRecord(value)?.updatedAt);
}

function describeFirebaseError(error: unknown): string {
  const code = readText(asRecord(error)?.code);
  if (code === "auth/popup-closed-by-user") return "sync.error.cancelled";
  if (code === "auth/popup-blocked") return "sync.error.popupBlocked";
  if (code === "auth/unauthorized-domain") return "sync.error.domain";
  if (code === "PERMISSION_DENIED" || code === "permission-denied") return "sync.error.permission";
  return "sync.error.connection";
}

function cloudUpdatedAt(payload: RemoteStatePayload): string {
  return payload.clientUpdatedAt || stateUpdatedAt(payload.state);
}

async function uploadState(state: QuestForgeState): Promise<void> {
  if (!currentUser || !currentStateRef) return;
  if (state.updatedAt && state.updatedAt === lastUploadedAt) return;
  setSyncUi("syncing", "sync.syncing");
  await set(currentStateRef, {
    schemaVersion: state.schemaVersion || 1,
    clientUpdatedAt: state.updatedAt || new Date().toISOString(),
    deviceId: getBridge()?.deviceId || "unknown",
    state,
    serverUpdatedAt: serverTimestamp(),
  });
  await mirrorStateEntities(state);
  lastUploadedAt = state.updatedAt || "";
  setSyncUi("synced", "sync.synced");
  trackTelemetry("sync_success", { source: "firebase" });
}

function entityFingerprint(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function mirrorStateEntities(state: QuestForgeState): Promise<void> {
  if (!currentUser) return;
  const updates: Record<string, unknown> = {};
  const nextFingerprints = new Map<string, string>();
  const writeIfChanged = (path: string, value: unknown): void => {
    const fingerprint = entityFingerprint(value);
    nextFingerprints.set(path, fingerprint);
    if (lastEntityFingerprints.get(path) !== fingerprint) updates[path] = value;
  };

  (state.tasks || []).forEach((task) => writeIfChanged(`entities/quests/${task.id}`, task));
  for (const path of lastEntityFingerprints.keys()) {
    if (path.startsWith("entities/quests/") && !nextFingerprints.has(path)) updates[path] = null;
  }
  writeIfChanged("entities/character/current", { ...state.character, battle: state.battle, boss: state.boss });
  writeIfChanged("entities/settings/current", {
    schemaVersion: state.schemaVersion,
    theme: state.theme,
    preferences: state.preferences,
    sortMode: state.sortMode,
    taskFilter: state.taskFilter,
    integrations: state.integrations,
    updatedAt: state.updatedAt,
  });
  writeIfChanged("entities/events/task", Object.fromEntries((state.taskEvents || []).map((event) => [String(event.id || ""), event])));
  writeIfChanged("entities/events/sync", Object.fromEntries((state.syncEvents || []).map((event) => [String(event.id || ""), event])));
  updates["entities/meta/updatedAt"] = serverTimestamp();
  updates["entities/meta/schemaVersion"] = state.schemaVersion || 3;

  if (Object.keys(updates).length > 2) await update(ref(db, `users/${currentUser.uid}`), updates);
  lastEntityFingerprints = nextFingerprints;
}

async function preserveLegacySnapshot(user: User, remote: RemoteStatePayload): Promise<void> {
  const backupRef = ref(db, `users/${user.uid}/state/legacyBackupV3`);
  const backup = await get(backupRef);
  if (!backup.exists() && asRecord(remote.state)) {
    await set(backupRef, { ...remote, preservedAt: serverTimestamp() });
  }
}

function clearUploadTimer(): void {
  if (uploadTimer !== null) window.clearTimeout(uploadTimer);
  uploadTimer = null;
}

function scheduleUpload(state: QuestForgeState | undefined): void {
  if (!state) return;
  clearUploadTimer();
  uploadTimer = window.setTimeout(() => {
    uploadState(state).catch((error: unknown) => {
      console.warn("QuestForge Firebase upload failed:", error);
      setSyncUi("error", describeFirebaseError(error));
      trackTelemetry("sync_failure", { source: "firebase" });
    });
  }, 900);
}

function applyCloudState(payload: RemoteStatePayload): void {
  const bridge = getBridge();
  if (!bridge || !payload.state || typeof payload.state !== "object") return;
  bridge.applyCloudState(payload.state);
  lastUploadedAt = stateUpdatedAt(payload.state) || payload.clientUpdatedAt || "";
  setSyncUi("synced", "sync.synced");
  trackTelemetry("sync_success", { source: "firebase" });
}

async function startStateSync(user: User): Promise<void> {
  const bridge = getBridge();
  if (!bridge) throw new Error("QuestForge bridge is not ready");

  currentStateRef = ref(db, `users/${user.uid}/state/current`);
  const local = bridge.getSyncSnapshot();
  const remoteSnapshot = await get(currentStateRef);

  if (!remoteSnapshot.exists()) {
    await uploadState(local.state);
  } else {
    const remote = toRemotePayload(remoteSnapshot.val() as unknown);
    await preserveLegacySnapshot(user, remote);
    const remoteDate = cloudUpdatedAt(remote);
    const localDate = local.state?.updatedAt || "";
    if (!local.hadLocalStateAtStartup || remoteDate > localDate) {
      applyCloudState(remote);
    } else if (localDate > remoteDate) {
      await uploadState(local.state);
    } else {
      lastUploadedAt = localDate;
      setSyncUi("synced", "sync.synced");
    }
  }

  stopStateSubscription?.();
  stopStateSubscription = onValue(currentStateRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const remote = toRemotePayload(snapshot.val() as unknown);
    const remoteDate = cloudUpdatedAt(remote);
    const localDate = getBridge()?.getSyncSnapshot().state?.updatedAt || "";
    if (remoteDate > localDate && remoteDate !== lastUploadedAt) {
      applyCloudState(remote);
    } else {
      setSyncUi("synced", "sync.synced");
    }
  }, (error: Error) => {
    console.warn("QuestForge Firebase subscription failed:", error);
    setSyncUi("error", describeFirebaseError(error));
    trackTelemetry("sync_failure", { source: "firebase" });
  });
}

if (syncSignInButton) {
  syncSignInButton.addEventListener("click", async () => {
    setSyncUi("syncing", "sync.connecting");
    syncSignInButton.disabled = true;
    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      console.warn("QuestForge Firebase sign-in failed:", error);
      setSyncUi("error", describeFirebaseError(error));
    } finally {
      syncSignInButton.disabled = false;
    }
  });
}

if (syncSignOutButton) {
  syncSignOutButton.addEventListener("click", async () => {
    syncSignOutButton.disabled = true;
    try {
      await signOut(auth);
    } finally {
      syncSignOutButton.disabled = false;
    }
  });
}

window.addEventListener("questforge:state-saved", (event) => {
  if (!currentUser) return;
  scheduleUpload(event.detail?.state);
});

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      window.dispatchEvent(new CustomEvent("questforge:auth-changed", {
        detail: { user: globalThis.QuestForgeFirebase?.getUser() || null },
      }));
      stopStateSubscription?.();
      stopStateSubscription = null;
      currentStateRef = null;
      lastEntityFingerprints = new Map();
      clearUploadTimer();

      if (!user) {
        if (syncSignInButton) syncSignInButton.hidden = false;
        if (syncSignOutButton) {
          syncSignOutButton.hidden = true;
          syncSignOutButton.title = "";
        }
        setSyncUi("local", "sync.local");
        return;
      }

      if (syncSignInButton) syncSignInButton.hidden = true;
      if (syncSignOutButton) {
        syncSignOutButton.hidden = false;
        syncSignOutButton.title = user.email || user.displayName || i18n?.t("sync.signOut") || "";
      }
      setSyncUi("syncing", "sync.initial");
      try {
        await startStateSync(user);
      } catch (error: unknown) {
        console.warn("QuestForge Firebase sync startup failed:", error);
        setSyncUi("error", describeFirebaseError(error));
      }
    });
  })
  .catch((error: unknown) => {
    console.warn("QuestForge Firebase persistence failed:", error);
    setSyncUi("error", describeFirebaseError(error));
  });

window.addEventListener("questforge:locale-changed", () => {
  setSyncUi((syncPanel?.dataset.syncState as SyncStatus | undefined) || "local", currentSyncMessageKey);
});
