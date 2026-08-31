const defaultGatewayUrl = "https://mcp.guilduo.com";

type JsonRecord = Record<string, unknown>;
type LabState = JsonRecord & {
  expanded?: Set<string> | string[];
  selectedQuestIds?: string[];
  timerId?: number | null;
  dataSource?: string;
  syncStatus?: string;
  remoteMode?: boolean;
  remoteIntegrations?: unknown[];
};
type RequestOptions = { method?: string; body?: string; headers?: Record<string, string> };
type TokenProvider = (forceRefresh?: boolean) => Promise<string>;
type UploadProgressEvent = { readonly lengthComputable: boolean; readonly loaded: number; readonly total: number };
type UploadTarget = { addEventListener(type: "progress", listener: (event: UploadProgressEvent) => void): void };
type UploadXhr = {
  status: number;
  responseType: string;
  responseText: string;
  upload: UploadTarget;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  addEventListener(type: "load" | "error" | "abort", listener: () => void): void;
  send(body: Blob): void;
};

function createUploadXhr(): UploadXhr {
  const constructor = (globalThis as unknown as { XMLHttpRequest?: new () => UploadXhr }).XMLHttpRequest;
  if (!constructor) throw new QuestForgeApiError(0, "upload_unsupported", "この環境では画像アップロードを利用できません。");
  return new constructor();
}
type Snapshot = JsonRecord & {
  quests: unknown[];
  total: number;
  character: JsonRecord;
  battle: JsonRecord;
  integrations: unknown[];
  profile: JsonRecord | null;
  party: JsonRecord | null;
  agents: unknown[];
  agentConnections: JsonRecord;
  mcpTools: unknown[];
  panelErrors: Array<{ index: number; message: string }>;
};

export const LAB_STATE_KEY = "questforge-interaction-lab-state";
export const LAB_LOCAL_BACKUP_KEY = "questforge-interaction-lab-local-backup";
export const LAB_AUTO_CONNECT_KEY = "questforge-interaction-auto-connect";
export const LAB_REMOTE_SNAPSHOT_KEY = "questforge-interaction-remote-snapshot";

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function cleanUrl(value: unknown): string {
  return String(value || "").trim().replace(/\/$/, "");
}

function userStorageKey(prefix: string, uid: unknown): string {
  const normalizedUid = String(uid || "").trim();
  return normalizedUid ? `${prefix}:${encodeURIComponent(normalizedUid)}` : "";
}

function readJsonStorage(key: string): JsonRecord | null {
  if (!key) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function readAutoConnectPreference(uid: string): boolean {
  const key = userStorageKey(LAB_AUTO_CONNECT_KEY, uid);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function hasAutoConnectPreference(uid: string): boolean {
  const key = userStorageKey(LAB_AUTO_CONNECT_KEY, uid);
  if (!key) return false;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function writeAutoConnectPreference(uid: string, enabled: boolean): void {
  const key = userStorageKey(LAB_AUTO_CONNECT_KEY, uid);
  if (!key) return;
  try {
    localStorage.setItem(key, enabled ? "true" : "false");
  } catch {
    // A private browsing quota failure must not break the application.
  }
}

export function readRemoteSnapshot(uid: string): JsonRecord | null {
  const saved = readJsonStorage(userStorageKey(LAB_REMOTE_SNAPSHOT_KEY, uid));
  return saved?.ownerUid === String(uid || "") && saved.snapshot && typeof saved.snapshot === "object"
    ? saved
    : null;
}

export function writeRemoteSnapshot(uid: string, snapshot: unknown, gatewayUrl = ""): void {
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

export function removeRemoteSnapshot(uid: string): void {
  const key = userStorageKey(LAB_REMOTE_SNAPSHOT_KEY, uid);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function readLabState(): LabState | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LAB_STATE_KEY) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function writeLabState(state: LabState): void {
  const snapshot = clone(state);
  snapshot.expanded = [...(state.expanded instanceof Set ? state.expanded : new Set(state.expanded || []))];
  snapshot.selectedQuestIds = [...new Set(Array.isArray(state.selectedQuestIds) ? state.selectedQuestIds : [])];
  snapshot.timerId = null;
  localStorage.setItem(LAB_STATE_KEY, JSON.stringify(snapshot));
}

export function readLocalBackup(): LabState | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LAB_LOCAL_BACKUP_KEY) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function writeLocalBackup(state: LabState): void {
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

export function gatewayDefaultUrl(): string {
  return cleanUrl(globalThis.QuestForgeConfig?.gatewayUrl || defaultGatewayUrl);
}

export class QuestForgeApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "QuestForgeApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class QuestForgeRepository {
  baseUrl: string;
  getToken: TokenProvider;

  constructor({ baseUrl = gatewayDefaultUrl(), getToken = async () => "" }: { baseUrl?: string; getToken?: TokenProvider } = {}) {
    this.baseUrl = cleanUrl(baseUrl);
    this.getToken = getToken;
  }

  setBaseUrl(value: unknown): void {
    this.baseUrl = cleanUrl(value);
  }

  async request<T = JsonRecord>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!this.baseUrl) throw new QuestForgeApiError(0, "gateway_url_missing", "API Gateway URLを設定してください。すぐにローカルモードへ戻せます。");
    const send = (token: string): Promise<Response> => fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
    const token = await this.getToken(false);
    let response = await send(token);
    if (response.status === 401 && token) {
      const refreshedToken = await this.getToken(true);
      if (refreshedToken) response = await send(refreshedToken);
    }
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
    if (!response.ok) {
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
      const error = bodyRecord.error && typeof bodyRecord.error === "object" && !Array.isArray(bodyRecord.error) ? bodyRecord.error as JsonRecord : {};
      const details = bodyRecord.details && typeof bodyRecord.details === "object" && !Array.isArray(bodyRecord.details) ? bodyRecord.details as JsonRecord : {};
      throw new QuestForgeApiError(response.status, String(error.code || bodyRecord.code || `http_${response.status}`), String(error.message || bodyRecord.message || `QuestForge API error (${response.status})`), error.details || details || null);
    }
    return body as T;
  }

  async health(): Promise<JsonRecord> {
    return this.request("/health");
  }

  async loadSnapshot(): Promise<Snapshot> {
    const questPage = await this.request<JsonRecord>("/v1/quests?view=all&limit=200");
    const optionalEntries = await Promise.allSettled([
      this.request("/v1/character"),
      this.request("/v1/battle/session"),
      this.request("/v1/integrations"),
      this.request("/v1/profile"),
      this.request("/v1/party"),
      this.request("/v1/agents?includeArchived=true"),
      this.request("/v1/agent-connections"),
      this.listMcpTools(),
    ]);
    const value = (index: number, fallback: JsonRecord): JsonRecord => {
      const entry = optionalEntries[index];
      return entry?.status === "fulfilled" && entry.value && typeof entry.value === "object" && !Array.isArray(entry.value)
        ? entry.value as JsonRecord
        : fallback;
    };
    const panelErrors = optionalEntries
      .map((entry, index) => entry.status === "rejected" ? ({ index, message: entry.reason instanceof Error ? entry.reason.message : "読み込みに失敗しました。" }) : null)
      .filter((entry): entry is { index: number; message: string } => Boolean(entry));
    const objectField = (index: number, key: string, fallback: JsonRecord = {}): JsonRecord => {
      const field = value(index, {})[key];
      return field && typeof field === "object" && !Array.isArray(field) ? field as JsonRecord : fallback;
    };
    const nullableObjectField = (index: number, key: string): JsonRecord | null => {
      const field = value(index, {})[key];
      return field && typeof field === "object" && !Array.isArray(field) ? field as JsonRecord : null;
    };
    const arrayField = (index: number, key: string): unknown[] => Array.isArray(value(index, {})[key]) ? value(index, {})[key] as unknown[] : [];
    return {
      quests: Array.isArray(questPage.quests) ? questPage.quests : [],
      total: Number(questPage.total || 0),
      character: objectField(0, "character"),
      battle: objectField(1, "session"),
      integrations: arrayField(2, "integrations"),
      profile: nullableObjectField(3, "profile"),
      party: nullableObjectField(4, "party"),
      agents: arrayField(5, "agents"),
      agentConnections: value(6, { authorizedClients: [], connections: [] }),
      mcpTools: arrayField(7, "tools"),
      panelErrors,
    };
  }

  async listMcpTools(): Promise<JsonRecord> {
    const response = await this.request<JsonRecord>("/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: "relay-forge-tools", method: "tools/list", params: {} }),
    });
    const rpcError = response.error && typeof response.error === "object" && !Array.isArray(response.error)
      ? response.error as JsonRecord
      : null;
    if (rpcError !== null) {
      throw new QuestForgeApiError(502, String(rpcError.code || "mcp_tools_error"), String(rpcError.message || "MCP Tool一覧を取得できませんでした."), null);
    }
    const result = response.result && typeof response.result === "object" && !Array.isArray(response.result)
      ? response.result as JsonRecord
      : {};
    return { tools: Array.isArray(result.tools) ? result.tools : [] };
  }

  async createQuest(input: JsonRecord): Promise<JsonRecord> {
    return this.request("/v1/quests", { method: "POST", body: JSON.stringify(input) });
  }

  async updateQuest(questId: string, patch: JsonRecord): Promise<JsonRecord> {
    return this.request(`/v1/quests/${encodeURIComponent(questId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async scoreQuest(questId: string, direction: "up" | "down" = "up"): Promise<JsonRecord> {
    return this.request(`/v1/quests/${encodeURIComponent(questId)}/score`, { method: "POST", body: JSON.stringify({ direction, source: "interaction-lab" }) });
  }

  async batchScoreQuests(questIds: string[], direction: "up" | "down" = "up", dryRun = true): Promise<JsonRecord> {
    return this.request("/v1/quests/batch-score", { method: "POST", body: JSON.stringify({ questIds, direction, dryRun, source: "interaction-lab" }) });
  }

  async batchUpdateQuests(questIds: string[], patch: JsonRecord = {}, dryRun = true): Promise<JsonRecord> {
    return this.request("/v1/quests/batch-update", { method: "POST", body: JSON.stringify({ questIds, patch, dryRun, source: "interaction-lab" }) });
  }

  async transitionHandoff(questId: string, input: JsonRecord): Promise<JsonRecord> {
    return this.request(`/v1/quests/${encodeURIComponent(questId)}/handoff`, { method: "POST", body: JSON.stringify(input) });
  }

  async battleCommand(command: string, expectedTurn: number, commandId: string): Promise<JsonRecord> {
    return this.request("/v1/battle/commands", {
      method: "POST",
      body: JSON.stringify({ command, expectedTurn, commandId, dryRun: false, source: "interaction-lab" }),
    });
  }

  async listIntegrations(): Promise<JsonRecord> {
    return this.request("/v1/integrations");
  }

  async previewSync(service: string, direction = "import"): Promise<JsonRecord> {
    return this.request("/v1/integrations/" + encodeURIComponent(service) + "/sync", {
      method: "POST",
      body: JSON.stringify({ direction, dryRun: true }),
    });
  }

  async syncService(service: string, direction = "import"): Promise<JsonRecord> {
    return this.request("/v1/integrations/" + encodeURIComponent(service) + "/sync", {
      method: "POST",
      body: JSON.stringify({ direction, dryRun: false }),
    });
  }

  /**
   * Start the provider consent flow for one integration.
   * `POST /v1/integrations/{id}/connect` is already part of the published
   * contract (api/openapi.json); this only exposes it to the client. The
   * response carries the provider redirect the caller must follow — it is never
   * logged and never rendered as text by any screen.
   */
  async connectIntegration(service: string): Promise<JsonRecord> {
    return this.request(`/v1/integrations/${encodeURIComponent(service)}/connect`, { method: "POST", body: JSON.stringify({ source: "interaction-lab" }) });
  }

  /**
   * Revoke and remove a provider connection. Per the contract this does not
   * delete Quests, which is what the confirmation surface tells the user.
   */
  async disconnectIntegration(service: string): Promise<JsonRecord> {
    return this.request(`/v1/integrations/${encodeURIComponent(service)}/disconnect`, { method: "POST", body: JSON.stringify({ source: "interaction-lab" }) });
  }

  /**
   * Preview one battle turn. Same endpoint and same body as `battleCommand`
   * with `dryRun: true`, which `BattleCommandInput` already allows; the domain
   * computes the result on a clone and writes nothing.
   */
  async previewBattleCommand(command: string, expectedTurn: number): Promise<JsonRecord> {
    return this.request("/v1/battle/commands", {
      method: "POST",
      body: JSON.stringify({ command, expectedTurn, dryRun: true, source: "interaction-lab" }),
    });
  }

  async listAgents(includeArchived = true): Promise<JsonRecord> {
    return this.request(`/v1/agents?includeArchived=${includeArchived}`);
  }

  async createAgent(input: JsonRecord): Promise<JsonRecord> {
    return this.request("/v1/agents", { method: "POST", body: JSON.stringify(input) });
  }

  async updateAgent(agentId: string, patch: JsonRecord): Promise<JsonRecord> {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async listAgentConnections(): Promise<JsonRecord> {
    return this.request("/v1/agent-connections");
  }

  async getProfile(): Promise<JsonRecord> {
    return this.request("/v1/profile");
  }

  async updateProfile(input: JsonRecord): Promise<JsonRecord> {
    return this.request("/v1/profile", { method: "PATCH", body: JSON.stringify(input) });
  }

  /**
   * Uploads the profile image as raw bytes. XHR is intentional here: browser
   * fetch has no upload-progress event, while the Account screen promises a
   * real progress state. The token refresh and JSON error shape match
   * `request()` and the Agent avatar port.
   */
  async uploadProfileAvatar(blob: Blob, onProgress: (loaded: number, total: number) => void = () => {}): Promise<JsonRecord> {
    if (!this.baseUrl) throw new QuestForgeApiError(0, "gateway_url_missing", "API Gateway URLを設定してください。すぐにローカルモードへ戻せます。");
    const path = "/v1/profile/avatar";
    const send = (token: string): Promise<{ status: number; text: string }> => new Promise((resolve, reject) => {
      const xhr = createUploadXhr();
      xhr.open("PUT", `${this.baseUrl}${path}`);
      xhr.responseType = "text";
      xhr.setRequestHeader("accept", "application/json");
      xhr.setRequestHeader("content-type", blob.type || "application/octet-stream");
      if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
      onProgress(0, blob.size);
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      });
      xhr.addEventListener("load", () => {
        onProgress(blob.size, blob.size);
        resolve({ status: xhr.status, text: xhr.responseText || "" });
      });
      xhr.addEventListener("error", () => reject(new QuestForgeApiError(0, "network_error", "画像のアップロードに失敗しました。接続を確認してください。")));
      xhr.addEventListener("abort", () => reject(new QuestForgeApiError(0, "upload_aborted", "画像のアップロードをキャンセルしました。")));
      xhr.send(blob);
    });
    const parse = (text: string): unknown => {
      try { return text ? JSON.parse(text) : null; } catch { return { message: text }; }
    };
    const asApiError = (status: number, text: string): QuestForgeApiError => {
      const body = parse(text);
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
      const error = bodyRecord.error && typeof bodyRecord.error === "object" && !Array.isArray(bodyRecord.error) ? bodyRecord.error as JsonRecord : {};
      return new QuestForgeApiError(status, String(error.code || bodyRecord.code || `http_${status}`), String(error.message || bodyRecord.message || `QuestForge API error (${status})`), error.details || null);
    };
    const token = await this.getToken(false);
    let result = await send(token);
    if (result.status === 401 && token) {
      const refreshedToken = await this.getToken(true);
      if (refreshedToken) result = await send(refreshedToken);
    }
    if (result.status < 200 || result.status >= 300) throw asApiError(result.status, result.text);
    return parse(result.text) as JsonRecord;
  }

  async deleteProfileAvatar(): Promise<JsonRecord> {
    return this.request("/v1/profile/avatar", { method: "DELETE" });
  }

  /** Fetches a private profile avatar with Bearer auth; callers own the Blob URL lifecycle. */
  async fetchProfileAvatar(version: number): Promise<Blob> {
    if (!this.baseUrl) throw new QuestForgeApiError(0, "gateway_url_missing", "API Gateway URLを設定してください。すぐにローカルモードへ戻せます。");
    const path = `/v1/profile/avatar?v=${encodeURIComponent(String(version))}`;
    const send = (token: string): Promise<Response> => fetch(`${this.baseUrl}${path}`, {
      headers: {
        accept: "image/*",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    const token = await this.getToken(false);
    let response = await send(token);
    if (response.status === 401 && token) {
      const refreshedToken = await this.getToken(true);
      if (refreshedToken) response = await send(refreshedToken);
    }
    if (!response.ok) {
      const text = await response.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
      const error = bodyRecord.error && typeof bodyRecord.error === "object" && !Array.isArray(bodyRecord.error) ? bodyRecord.error as JsonRecord : {};
      throw new QuestForgeApiError(response.status, String(error.code || bodyRecord.code || `http_${response.status}`), String(error.message || bodyRecord.message || `QuestForge API error (${response.status})`), error.details || null);
    }
    return response.blob();
  }

  /**
   * Uploads the raw image bytes for one Agent's avatar. This bypasses
   * `request()` because the body is binary, not JSON — everything else
   * (auth header, 401 retry, error shape) mirrors it exactly.
   */
  async uploadAgentAvatar(agentId: string, blob: Blob, expectedUpdatedAt?: string): Promise<JsonRecord> {
    if (!this.baseUrl) throw new QuestForgeApiError(0, "gateway_url_missing", "API Gateway URLを設定してください。すぐにローカルモードへ戻せます。");
    const path = `/v1/agents/${encodeURIComponent(agentId)}/avatar`;
    const send = (token: string): Promise<Response> => fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      body: blob,
      headers: {
        accept: "application/json",
        "content-type": blob.type || "application/octet-stream",
        ...(expectedUpdatedAt ? { "x-expected-updated-at": expectedUpdatedAt } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    const token = await this.getToken(false);
    let response = await send(token);
    if (response.status === 401 && token) {
      const refreshedToken = await this.getToken(true);
      if (refreshedToken) response = await send(refreshedToken);
    }
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
    if (!response.ok) {
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
      const error = bodyRecord.error && typeof bodyRecord.error === "object" && !Array.isArray(bodyRecord.error) ? bodyRecord.error as JsonRecord : {};
      throw new QuestForgeApiError(response.status, String(error.code || bodyRecord.code || `http_${response.status}`), String(error.message || bodyRecord.message || `QuestForge API error (${response.status})`), error.details || null);
    }
    return body as JsonRecord;
  }

  /**
   * Fetches the raw image bytes for one Agent's avatar as a Blob, for the
   * caller to turn into an object URL. This bypasses `request()` because the
   * response is binary, not JSON — everything else (auth header, 401 retry,
   * error shape) mirrors it exactly. `version` is `avatarVersion` from the
   * Agent record; the server 404s `avatar_version_stale` on a mismatch.
   */
  async fetchAgentAvatar(agentId: string, version: number): Promise<Blob> {
    if (!this.baseUrl) throw new QuestForgeApiError(0, "gateway_url_missing", "API Gateway URLを設定してください。すぐにローカルモードへ戻せます。");
    const path = `/v1/agents/${encodeURIComponent(agentId)}/avatar?v=${encodeURIComponent(String(version))}`;
    const send = (token: string): Promise<Response> => fetch(`${this.baseUrl}${path}`, {
      headers: {
        accept: "image/*",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    const token = await this.getToken(false);
    let response = await send(token);
    if (response.status === 401 && token) {
      const refreshedToken = await this.getToken(true);
      if (refreshedToken) response = await send(refreshedToken);
    }
    if (!response.ok) {
      const text = await response.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
      const error = bodyRecord.error && typeof bodyRecord.error === "object" && !Array.isArray(bodyRecord.error) ? bodyRecord.error as JsonRecord : {};
      throw new QuestForgeApiError(response.status, String(error.code || bodyRecord.code || `http_${response.status}`), String(error.message || bodyRecord.message || `QuestForge API error (${response.status})`), error.details || null);
    }
    return response.blob();
  }

  async linkAgentConnection(agentId: string, clientId: string): Promise<JsonRecord> {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/connections/${encodeURIComponent(clientId)}`, { method: "PUT" });
  }

  async unlinkAgentConnection(agentId: string, clientId: string): Promise<JsonRecord> {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/connections/${encodeURIComponent(clientId)}`, { method: "DELETE" });
  }
}
