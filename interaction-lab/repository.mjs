const defaultGatewayUrl = "https://questforge-gateway.guangchuannaito.workers.dev";

export const LAB_STATE_KEY = "questforge-interaction-lab-state";
export const LAB_LOCAL_BACKUP_KEY = "questforge-interaction-lab-local-backup";
export const LAB_AUTO_CONNECT_KEY = "questforge-interaction-auto-connect";
export const LAB_REMOTE_SNAPSHOT_KEY = "questforge-interaction-remote-snapshot";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function userStorageKey(prefix, uid) {
  const normalizedUid = String(uid || "").trim();
  return normalizedUid ? `${prefix}:${encodeURIComponent(normalizedUid)}` : "";
}

function readJsonStorage(key) {
  if (!key) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function readAutoConnectPreference(uid) {
  const key = userStorageKey(LAB_AUTO_CONNECT_KEY, uid);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function hasAutoConnectPreference(uid) {
  const key = userStorageKey(LAB_AUTO_CONNECT_KEY, uid);
  if (!key) return false;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function writeAutoConnectPreference(uid, enabled) {
  const key = userStorageKey(LAB_AUTO_CONNECT_KEY, uid);
  if (!key) return;
  try {
    localStorage.setItem(key, enabled ? "true" : "false");
  } catch {
    // A private browsing quota failure must not break the application.
  }
}

export function readRemoteSnapshot(uid) {
  const saved = readJsonStorage(userStorageKey(LAB_REMOTE_SNAPSHOT_KEY, uid));
  return saved?.ownerUid === String(uid || "") && saved.snapshot && typeof saved.snapshot === "object"
    ? saved
    : null;
}

export function writeRemoteSnapshot(uid, snapshot, gatewayUrl = "") {
  const ownerUid = String(uid || "").trim();
  const key = userStorageKey(LAB_REMOTE_SNAPSHOT_KEY, ownerUid);
  if (!key || !snapshot || typeof snapshot !== "object") return;
  try {
    localStorage.setItem(key, JSON.stringify({
      ownerUid,
      savedAt: new Date().toISOString(),
      gatewayUrl: cleanUrl(gatewayUrl),
      snapshot: clone(snapshot),
    }));
  } catch {
    // The live API remains the source of truth when the cache cannot be written.
  }
}

export function removeRemoteSnapshot(uid) {
  const key = userStorageKey(LAB_REMOTE_SNAPSHOT_KEY, uid);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function readLabState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAB_STATE_KEY) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function writeLabState(state) {
  const snapshot = clone(state);
  snapshot.expanded = [...(state.expanded instanceof Set ? state.expanded : new Set(state.expanded || []))];
  snapshot.selectedQuestIds = [...new Set(Array.isArray(state.selectedQuestIds) ? state.selectedQuestIds : [])];
  snapshot.timerId = null;
  localStorage.setItem(LAB_STATE_KEY, JSON.stringify(snapshot));
}

export function readLocalBackup() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAB_LOCAL_BACKUP_KEY) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function writeLocalBackup(state) {
  const snapshot = clone(state);
  snapshot.expanded = [...(state.expanded instanceof Set ? state.expanded : new Set(state.expanded || []))];
  snapshot.selectedQuestIds = [...new Set(Array.isArray(state.selectedQuestIds) ? state.selectedQuestIds : [])];
  snapshot.timerId = null;
  snapshot.dataSource = "local";
  snapshot.syncStatus = "local-only";
  snapshot.remoteMode = false;
  snapshot.remoteIntegrations = [];
  localStorage.setItem(LAB_LOCAL_BACKUP_KEY, JSON.stringify(snapshot));
}

export function gatewayDefaultUrl() {
  return cleanUrl(globalThis.QuestForgeConfig?.gatewayUrl || defaultGatewayUrl);
}

export class QuestForgeApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "QuestForgeApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class QuestForgeRepository {
  constructor({ baseUrl = gatewayDefaultUrl, getToken = async () => "" } = {}) {
    this.baseUrl = cleanUrl(baseUrl);
    this.getToken = getToken;
  }

  setBaseUrl(value) {
    this.baseUrl = cleanUrl(value);
  }

  async request(path, options = {}) {
    if (!this.baseUrl) throw new QuestForgeApiError(0, "gateway_url_missing", "API Gateway URLを設定してください。すぐにローカルモードへ戻せます。");
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
    if (!response.ok) {
      const error = body?.error || body?.details?.error || {};
      throw new QuestForgeApiError(response.status, error.code || body?.code || `http_${response.status}`, error.message || body?.message || `QuestForge API error (${response.status})`, error.details || body?.details || null);
    }
    return body;
  }

  async health() {
    return this.request("/health");
  }

  async loadSnapshot() {
    const questPage = await this.request("/v1/quests?view=all&limit=200");
    const optionalEntries = await Promise.allSettled([
      this.request("/v1/character"),
      this.request("/v1/battle/session"),
      this.request("/v1/integrations"),
      this.request("/v1/profile"),
      this.request("/v1/party"),
      this.request("/v1/agents?includeArchived=true"),
      this.request("/v1/agent-connections"),
    ]);
    const value = (index, fallback) => optionalEntries[index].status === "fulfilled" ? optionalEntries[index].value : fallback;
    return {
      quests: questPage?.quests || [],
      total: questPage?.total || 0,
      character: value(0, {})?.character || {},
      battle: value(1, {})?.session || {},
      integrations: value(2, {})?.integrations || [],
      profile: value(3, {})?.profile || null,
      party: value(4, {})?.party || null,
      agents: value(5, {})?.agents || [],
      agentConnections: value(6, { authorizedClients: [], connections: [] }),
      panelErrors: optionalEntries.map((entry, index) => entry.status === "rejected" ? ({ index, message: entry.reason?.message || "読み込みに失敗しました。" }) : null).filter(Boolean),
    };
  }

  async createQuest(input) {
    return this.request("/v1/quests", { method: "POST", body: JSON.stringify(input) });
  }

  async updateQuest(questId, patch) {
    return this.request(`/v1/quests/${encodeURIComponent(questId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async scoreQuest(questId, direction = "up") {
    return this.request(`/v1/quests/${encodeURIComponent(questId)}/score`, { method: "POST", body: JSON.stringify({ direction, source: "interaction-lab" }) });
  }

  async batchScoreQuests(questIds, direction = "up", dryRun = true) {
    return this.request("/v1/quests/batch-score", { method: "POST", body: JSON.stringify({ questIds, direction, dryRun, source: "interaction-lab" }) });
  }

  async batchUpdateQuests(questIds, patch = {}, dryRun = true) {
    return this.request("/v1/quests/batch-update", { method: "POST", body: JSON.stringify({ questIds, patch, dryRun, source: "interaction-lab" }) });
  }

  async transitionHandoff(questId, input) {
    return this.request(`/v1/quests/${encodeURIComponent(questId)}/handoff`, { method: "POST", body: JSON.stringify(input) });
  }

  async battleCommand(command, expectedTurn, commandId) {
    return this.request("/v1/battle/commands", {
      method: "POST",
      body: JSON.stringify({ command, expectedTurn, commandId, dryRun: false, source: "interaction-lab" }),
    });
  }

  async listIntegrations() {
    return this.request("/v1/integrations");
  }

  async previewSync(service, direction = "import") {
    return this.request("/v1/integrations/" + encodeURIComponent(service) + "/sync", {
      method: "POST",
      body: JSON.stringify({ direction, dryRun: true }),
    });
  }

  async syncService(service, direction = "import") {
    return this.request("/v1/integrations/" + encodeURIComponent(service) + "/sync", {
      method: "POST",
      body: JSON.stringify({ direction, dryRun: false }),
    });
  }

  async listAgents(includeArchived = true) {
    return this.request(`/v1/agents?includeArchived=${includeArchived}`);
  }

  async createAgent(input) {
    return this.request("/v1/agents", { method: "POST", body: JSON.stringify(input) });
  }

  async updateAgent(agentId, patch) {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async listAgentConnections() {
    return this.request("/v1/agent-connections");
  }

  async updateProfile(input) {
    return this.request("/v1/profile", { method: "PATCH", body: JSON.stringify(input) });
  }

  async linkAgentConnection(agentId, clientId) {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/connections/${encodeURIComponent(clientId)}`, { method: "PUT" });
  }

  async unlinkAgentConnection(agentId, clientId) {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/connections/${encodeURIComponent(clientId)}`, { method: "DELETE" });
  }
}
