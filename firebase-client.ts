// @ts-nocheck
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  get,
  getDatabase,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import firebaseConfig from "./firebase-config.js";
import { trackTelemetry } from "./telemetry.ts";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const provider = new GoogleAuthProvider();

const syncPanel = document.querySelector("#syncPanel");
const syncStatus = document.querySelector("#syncStatus");
const syncSignInButton = document.querySelector("#syncSignInButton");
const syncSignOutButton = document.querySelector("#syncSignOutButton");
const i18n = globalThis.QuestForgeI18n;

let currentUser = null;
let currentStateRef = null;
let stopStateSubscription = null;
let uploadTimer = null;
let lastUploadedAt = "";
let lastEntityFingerprints = new Map();
let currentSyncMessageKey = "sync.local";

globalThis.QuestForgeFirebase = {
  async getIdToken(forceRefresh = false) {
    return currentUser ? currentUser.getIdToken(forceRefresh) : "";
  },
  getUser() {
    return currentUser ? { uid: currentUser.uid, email: currentUser.email || "", displayName: currentUser.displayName || "" } : null;
  },
  async flushState() {
    const bridge = getBridge();
    if (!currentUser || !currentStateRef || !bridge) return false;
    window.clearTimeout(uploadTimer);
    await uploadState(bridge.getSyncSnapshot().state);
    return true;
  },
};

function getBridge() {
  return globalThis.QuestForgeBridge;
}

function setSyncUi(status, messageKey) {
  syncPanel.dataset.syncState = status;
  currentSyncMessageKey = messageKey;
  syncStatus.textContent = i18n?.t?.(messageKey) || messageKey;
}

function describeFirebaseError(error) {
  if (error?.code === "auth/popup-closed-by-user") return "sync.error.cancelled";
  if (error?.code === "auth/popup-blocked") return "sync.error.popupBlocked";
  if (error?.code === "auth/unauthorized-domain") return "sync.error.domain";
  if (error?.code === "PERMISSION_DENIED" || error?.code === "permission-denied") return "sync.error.permission";
  return "sync.error.connection";
}

function cloudUpdatedAt(payload) {
  return payload?.clientUpdatedAt || payload?.state?.updatedAt || "";
}

async function uploadState(state) {
  if (!currentUser || !currentStateRef || !state) return;
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

function entityFingerprint(value) {
  return JSON.stringify(value ?? null);
}

async function mirrorStateEntities(state) {
  if (!currentUser || !state) return;
  const updates = {};
  const nextFingerprints = new Map();
  const writeIfChanged = (path, value) => {
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
  writeIfChanged("entities/events/task", Object.fromEntries((state.taskEvents || []).map((event) => [event.id, event])));
  writeIfChanged("entities/events/sync", Object.fromEntries((state.syncEvents || []).map((event) => [event.id, event])));
  updates["entities/meta/updatedAt"] = serverTimestamp();
  updates["entities/meta/schemaVersion"] = state.schemaVersion || 3;

  if (Object.keys(updates).length > 2) await update(ref(db, `users/${currentUser.uid}`), updates);
  lastEntityFingerprints = nextFingerprints;
}

async function preserveLegacySnapshot(user, remote) {
  const backupRef = ref(db, `users/${user.uid}/state/legacyBackupV3`);
  const backup = await get(backupRef);
  if (!backup.exists() && remote?.state) {
    await set(backupRef, { ...remote, preservedAt: serverTimestamp() });
  }
}

function scheduleUpload(state) {
  window.clearTimeout(uploadTimer);
  uploadTimer = window.setTimeout(() => {
    uploadState(state).catch((error) => {
      console.warn("QuestForge Firebase upload failed:", error);
      setSyncUi("error", describeFirebaseError(error));
      trackTelemetry("sync_failure", { source: "firebase" });
    });
  }, 900);
}

function applyCloudState(payload) {
  const bridge = getBridge();
  if (!bridge || !payload?.state) return;
  bridge.applyCloudState(payload.state);
  lastUploadedAt = payload.state.updatedAt || payload.clientUpdatedAt || "";
  setSyncUi("synced", "sync.synced");
  trackTelemetry("sync_success", { source: "firebase" });
}

async function startStateSync(user) {
  const bridge = getBridge();
  if (!bridge) throw new Error("QuestForge bridge is not ready");

  currentStateRef = ref(db, `users/${user.uid}/state/current`);
  const local = bridge.getSyncSnapshot();
  const remoteSnapshot = await get(currentStateRef);

  if (!remoteSnapshot.exists()) {
    await uploadState(local.state);
  } else {
    const remote = remoteSnapshot.val();
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
    const remote = snapshot.val();
    const remoteDate = cloudUpdatedAt(remote);
    const localDate = getBridge()?.getSyncSnapshot().state?.updatedAt || "";
    if (remoteDate > localDate && remoteDate !== lastUploadedAt) {
      applyCloudState(remote);
    } else {
      setSyncUi("synced", "sync.synced");
    }
  }, (error) => {
    console.warn("QuestForge Firebase subscription failed:", error);
    setSyncUi("error", describeFirebaseError(error));
    trackTelemetry("sync_failure", { source: "firebase" });
  });
}

syncSignInButton.addEventListener("click", async () => {
  setSyncUi("syncing", "sync.connecting");
  syncSignInButton.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.warn("QuestForge Firebase sign-in failed:", error);
    setSyncUi("error", describeFirebaseError(error));
  } finally {
    syncSignInButton.disabled = false;
  }
});

syncSignOutButton.addEventListener("click", async () => {
  syncSignOutButton.disabled = true;
  try {
    await signOut(auth);
  } finally {
    syncSignOutButton.disabled = false;
  }
});

window.addEventListener("questforge:state-saved", (event) => {
  if (!currentUser) return;
  scheduleUpload(event.detail?.state);
});

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      window.dispatchEvent(new CustomEvent("questforge:auth-changed", {
        detail: { user: globalThis.QuestForgeFirebase.getUser() },
      }));
      stopStateSubscription?.();
      stopStateSubscription = null;
      currentStateRef = null;
      lastEntityFingerprints = new Map();
      window.clearTimeout(uploadTimer);

      if (!user) {
        syncSignInButton.hidden = false;
        syncSignOutButton.hidden = true;
        syncSignOutButton.title = "";
        setSyncUi("local", "sync.local");
        return;
      }

      syncSignInButton.hidden = true;
      syncSignOutButton.hidden = false;
      syncSignOutButton.title = user.email || user.displayName || i18n.t("sync.signOut");
      setSyncUi("syncing", "sync.initial");
      try {
        await startStateSync(user);
      } catch (error) {
        console.warn("QuestForge Firebase sync startup failed:", error);
        setSyncUi("error", describeFirebaseError(error));
      }
    });
  })
  .catch((error) => {
    console.warn("QuestForge Firebase persistence failed:", error);
    setSyncUi("error", describeFirebaseError(error));
  });

window.addEventListener("questforge:locale-changed", () => {
  setSyncUi(syncPanel.dataset.syncState || "local", currentSyncMessageKey);
});
