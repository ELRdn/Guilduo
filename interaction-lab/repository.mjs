const defaultGatewayUrl = "https://questforge-gateway.guangchuannaito.workers.dev";

export const LAB_STATE_KEY = "questforge-interaction-lab-state";
export const LAB_LOCAL_BACKUP_KEY = "questforge-interaction-lab-local-backup";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
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

  async linkAgentConnection(agentId, clientId) {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/connections/${encodeURIComponent(clientId)}`, { method: "PUT" });
  }

  async unlinkAgentConnection(agentId, clientId) {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/connections/${encodeURIComponent(clientId)}`, { method: "DELETE" });
  }
}
