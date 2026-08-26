import {
  linkExternalRecord,
  purgeManagedFocusLinks,
  removeManagedFocusEntry,
} from "../../server/questforge-domain.ts";
import type {
  ExternalLink,
  Quest,
  QuestForgeState,
} from "../../types/questforge.ts";
import {
  deleteTogglFocusAttribution,
  getIntegrationAccount,
  getTogglFocusTaskLink,
  listTogglFocusAttributions,
  listTogglFocusTaskLinks,
  purgeTogglFocusAttributions,
  purgeTogglFocusTaskLinks,
  saveIntegrationAccount,
  saveTogglFocusAttribution,
  saveTogglFocusTaskLink,
} from "./integration-store.ts";
import type {
  FocusAttribution,
  FocusTaskLink,
  IntegrationAccount,
} from "./integration-store.ts";
import type { AuthIdentity } from "./security.ts";
import type { JsonRecord, WorkerEnv, WorkerError } from "./worker-types.ts";

const SERVICE = "toggl-focus";
const API_BASE = "https://focus.toggl.com/api";
const MAX_ENTRY_DAYS = 30;
const FOCUS_TASK_TYPE = "focus.task";
const FOCUS_ENTRY_TYPE = "focus.time_entry";
type Identity = string | Pick<AuthIdentity, "uid">;

type FocusRecord = JsonRecord & {
  data?: unknown;
  items?: unknown;
  results?: unknown;
  id?: string | number;
  name?: string;
  title?: string;
  updated_at?: string;
  updatedAt?: string;
  task_id?: string | number;
  task?: FocusRecord;
  duration_minutes?: number;
  duration_mins?: number;
  duration?: number;
  start?: string;
  start_at?: string;
  stop?: string;
  end?: string;
  end_at?: string;
  tracked_at?: string;
  deleted_at?: string;
  project_id?: string | number;
  running?: boolean;
  time_entry?: FocusRecord;
  entry?: FocusRecord;
  current?: FocusRecord;
  task_name?: string;
  description?: string;
  message?: string;
  error?: string | FocusRecord;
  details?: FocusRecord;
  user?: FocusRecord;
  user_id?: string | number;
  email?: string;
};

export type FocusInput = {
  apiKey?: string;
  organizationId?: string | number;
  workspaceId?: string | number;
  projectId?: string | number;
  autoCreateTasks?: boolean;
  days?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  includeTaskless?: boolean;
  entryIds?: Array<string | number>;
  questId?: string;
  dryRun?: boolean;
  expectedCurrentEntryId?: string;
  expectedEntryId?: string;
  end?: string;
  [key: string]: unknown;
};

type FocusConfiguration = {
  organizationId: string;
  workspaceId: string;
  projectId: string;
  autoCreateTasks: boolean;
};

type FocusRequestOptions = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

type ActivityContext = {
  id: string;
  label: string;
  description: string;
};

type NormalizedFocusEntry = {
  id: string;
  taskId: string;
  taskName: string;
  description: string;
  durationMinutes: number;
  startAt: string;
  stopAt: string;
  updatedAt: string;
  deletedAt: string;
  projectId: string;
  running: boolean;
  attribution?: FocusAttribution | null;
};

type FocusExternalLink = Pick<ExternalLink, "externalId"> & Partial<ExternalLink>;

const ACTIVITY_CONTEXTS: readonly ActivityContext[] = Object.freeze([
  { id: "development", label: "Development", description: "コード、設計、デバッグ" },
  { id: "creative", label: "Creative", description: "デザイン、編集、制作" },
  { id: "ai-generation", label: "AI Generation", description: "生成、検証、プロンプト作業" },
  { id: "research", label: "Research", description: "調査、読書、比較" },
]);

function integrationError(status: number, code: string, message: string, details: unknown = undefined): WorkerError {
  return Object.assign(new Error(message), { status, code, details });
}

function normalizeIdentity(identity: Identity): { uid: string } {
  return typeof identity === "string" ? { uid: identity } : identity;
}

function asItems(value: unknown): FocusRecord[] {
  if (Array.isArray(value)) return value.map(asObject).filter((item): item is FocusRecord => Boolean(item));
  if (!value || typeof value !== "object") return [];
  const record = value as JsonRecord;
  for (const key of ["data", "items", "results"]) {
    const items = record[key];
    if (Array.isArray(items)) return items.map(asObject).filter((item): item is FocusRecord => Boolean(item));
  }
  return [];
}

function asObject(value: unknown): FocusRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data as FocusRecord;
  return record as FocusRecord;
}

function errorDetails(error: unknown): FocusRecord {
  if (!error || typeof error !== "object" || Array.isArray(error)) return {};
  return asObject((error as JsonRecord).details) || {};
}

function responseMessage(value: unknown, fallback: string): string {
  const record = asObject(value);
  const error = record?.error;
  const nested = typeof error === "object" ? asObject(error) : null;
  return String(record?.message || nested?.message || (typeof error === "string" ? error : "") || fallback);
}

function settingText(settings: JsonRecord, key: string): string {
  const value = settings[key];
  return value === undefined || value === null ? "" : String(value);
}

function settingBool(settings: JsonRecord, key: string): boolean {
  return Boolean(settings[key]);
}

function numericId(value: unknown, field: string, { required = true }: { required?: boolean } = {}): string {
  const id = String(value || "").trim();
  if (!id && !required) return "";
  if (!/^\d+$/.test(id)) throw integrationError(400, `invalid_focus_${field}`, `${field} must be a Toggl Focus numeric ID.`);
  return id;
}

function compact(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && !value.length)));
}

function dateIso(dateText: unknown, end = false): string {
  const date = String(dateText || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return `${date}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function daysWindow(input: FocusInput = {}): { days: number; dateFrom: string; dateTo: string } {
  const days = Math.max(1, Math.min(MAX_ENTRY_DAYS, Math.round(Number(input.days || MAX_ENTRY_DAYS))));
  const to = input.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(String(input.dateTo)) ? String(input.dateTo) : new Date().toISOString().slice(0, 10);
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = input.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(String(input.dateFrom))
    ? String(input.dateFrom)
    : fromDate.toISOString().slice(0, 10);
  return { days, dateFrom: from, dateTo: to };
}

async function focusJson(token: string, path: string, options: FocusRequestOptions = {}, attempt = 0): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * (2 ** attempt))));
    return focusJson(token, path, options, attempt + 1);
  }
  const value: unknown = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = response.status === 401 ? "reconnect_required"
      : response.status === 403 ? "provider_permission_denied"
        : response.status === 429 ? "provider_rate_limited"
          : "provider_error";
    throw integrationError(response.status === 401 ? 401 : response.status === 429 ? 429 : 502, code, responseMessage(value, `Toggl Focus returned HTTP ${response.status}`), { providerStatus: response.status });
  }
  return value;
}

async function focusAccount(env: WorkerEnv, identity: Identity, { requireConfiguration = true }: { requireConfiguration?: boolean } = {}): Promise<{ uid: string; account: IntegrationAccount; token: string; configuration: FocusConfiguration }> {
  const { uid } = normalizeIdentity(identity);
  const account = await getIntegrationAccount(env, uid, SERVICE, { includeTokens: true });
  if (!account) throw integrationError(409, "integration_not_connected", "Connect Toggl Focus from the QuestForge web app first.");
  if (account.status === "reconnect_required") throw integrationError(401, "reconnect_required", "Reconnect Toggl Focus in QuestForge.");
  if (!account.accessToken) throw integrationError(503, "integration_vault_unavailable", "The Toggl Focus key could not be loaded.");
  const settings = account.settings || {};
  const configuration: FocusConfiguration = {
    organizationId: settingText(settings, "organizationId"),
    workspaceId: settingText(settings, "workspaceId"),
    projectId: settingText(settings, "projectId"),
    autoCreateTasks: settingBool(settings, "autoCreateTasks"),
  };
  if (requireConfiguration) {
    numericId(configuration.organizationId, "organizationId");
    numericId(configuration.workspaceId, "workspaceId");
    numericId(configuration.projectId, "projectId", { required: false });
  }
  return { uid, account, token: account.accessToken, configuration };
}

function focusPath(configuration: FocusConfiguration, suffix = ""): string {
  return `/organizations/${encodeURIComponent(configuration.organizationId)}/workspaces/${encodeURIComponent(configuration.workspaceId)}${suffix}`;
}

function publicAccount(account: IntegrationAccount | null): Record<string, unknown> | null {
  if (!account) return null;
  return {
    status: account.status,
    providerAccountId: account.providerAccountId,
    providerAccountName: account.providerAccountName,
    settings: account.settings,
    lastSyncedAt: account.lastSyncedAt,
    lastError: account.lastError,
  };
}

function focusTaskLink(task: Quest): ExternalLink | undefined {
  return (task.externalLinks || []).find((link) => link.service === SERVICE && (link.type === "task" || link.sourceType === FOCUS_TASK_TYPE));
}

function configuredFocusTaskLink(task: Quest, configuration: FocusConfiguration): ExternalLink | undefined {
  const link = focusTaskLink(task);
  if (!link) return undefined;
  const hasConnectionContext = Boolean(link.organizationId || link.workspaceId);
  if (hasConnectionContext && (link.organizationId !== configuration.organizationId || link.workspaceId !== configuration.workspaceId)) return undefined;
  return link;
}

function storedFocusTaskLink(link: FocusTaskLink | null | undefined, configuration: FocusConfiguration): FocusExternalLink | null {
  if (!link || !link.focusTaskId) return null;
  if (link.organizationId !== configuration.organizationId || link.workspaceId !== configuration.workspaceId) return null;
  return {
    service: SERVICE,
    externalId: link.focusTaskId,
    type: "task",
    sourceType: FOCUS_TASK_TYPE,
    organizationId: link.organizationId,
    workspaceId: link.workspaceId,
    projectId: link.projectId,
  };
}

function focusEntryLink(task: Quest, entryId: string): ExternalLink | undefined {
  return (task.externalLinks || []).find((link) => link.service === SERVICE && link.externalId === String(entryId) && (link.type === "time_entry" || link.sourceType === FOCUS_ENTRY_TYPE));
}

function focusTaskEligible(task: Quest | undefined): task is Quest {
  if (!task) return false;
  return ["todo", "daily"].includes(task.kind)
    && task.lifecycleState !== "archived"
    && task.lifecycleState !== "completed"
    && !task.done;
}

function attributionEligibleQuest(task: Quest | undefined): task is Quest {
  if (!task) return false;
  return ["todo", "daily"].includes(task.kind) && task.lifecycleState !== "archived";
}

function taskPayload(task: Quest, configuration: FocusConfiguration, tagIds: number[] = []): Record<string, unknown> {
  const priority = task.impact === "high" ? "high" : task.impact === "low" ? "low" : "medium";
  const notes = [task.notes, task.nextAction ? `Next action: ${task.nextAction}` : "", task.completionCriteria ? `Done when: ${task.completionCriteria}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1500);
  return compact({
    name: task.title,
    description: task.notes || "",
    notes,
    estimated_mins: Number(task.estimatedMinutes || 0) || undefined,
    start_date: task.scheduledDate || undefined,
    end_date: task.dueDate || undefined,
    priority,
    project_id: configuration.projectId ? Number(configuration.projectId) : undefined,
    tag_ids: tagIds,
  });
}

function normalizedTask(remote: unknown): { id: string; name: string; updatedAt: string } {
  const value = asObject(remote) || {};
  return { id: String(value.id || value.task_id || ""), name: String(value.name || value.title || ""), updatedAt: String(value.updated_at || value.updatedAt || "") };
}

function entryDurationMinutes(entry: FocusRecord): number {
  if (entry.duration_minutes != null) return Math.max(0, Math.round(Number(entry.duration_minutes) || 0));
  if (entry.duration_mins != null) return Math.max(0, Math.round(Number(entry.duration_mins) || 0));
  const seconds = Number(entry.duration || 0);
  return Math.max(0, Math.round(seconds / 60));
}

function normalizeEntry(raw: unknown): NormalizedFocusEntry {
  const entry = asObject(raw) || {};
  const task = entry.task && typeof entry.task === "object" ? entry.task : {};
  return {
    id: String(entry.id || entry.time_entry_id || ""),
    taskId: String(entry.task_id || task.id || ""),
    taskName: String(entry.task_name || task.name || ""),
    description: String(entry.description || ""),
    durationMinutes: entryDurationMinutes(entry),
    startAt: String(entry.start || entry.start_at || entry.tracked_at || ""),
    stopAt: String(entry.stop || entry.end || entry.end_at || ""),
    updatedAt: String(entry.updated_at || entry.updatedAt || ""),
    deletedAt: String(entry.deleted_at || ""),
    projectId: String(entry.project_id || task.project_id || ""),
    running: Boolean(entry.running || (!entry.stop && !entry.end && !entry.end_at && Number(entry.duration || 0) < 0)),
  };
}

function normalizeTracking(value: unknown): NormalizedFocusEntry | null {
  const raw = asObject(value);
  if (!raw || !Object.keys(raw).length) return null;
  const candidate = raw.time_entry || raw.entry || raw.current || raw;
  const entry = normalizeEntry(candidate);
  return entry.id ? entry : null;
}

async function currentFocusTracking(token: string, configuration: FocusConfiguration): Promise<NormalizedFocusEntry | null> {
  try {
    return normalizeTracking(await focusJson(token, focusPath(configuration, "/tracking/current")));
  } catch (error) {
    if (errorDetails(error).providerStatus === 404) return null;
    throw error;
  }
}

async function focusTags(token: string, configuration: FocusConfiguration, task: Quest): Promise<number[]> {
  const tags = (task.tags || []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6);
  if (!tags.length) return [];
  const response = await focusJson(token, `/workspaces/${encodeURIComponent(configuration.workspaceId)}/tags?per_page=100`);
  const known = new Map<string, FocusRecord>(asItems(response).map((tag) => [String(tag.name || "").toLocaleLowerCase(), tag]));
  const ids: number[] = [];
  for (const name of tags) {
    let tag = known.get(name.toLocaleLowerCase());
    if (!tag) {
      tag = asObject(await focusJson(token, `/workspaces/${encodeURIComponent(configuration.workspaceId)}/tags`, { method: "POST", body: JSON.stringify({ name }) })) || undefined;
      if (tag?.id) known.set(name.toLocaleLowerCase(), tag);
    }
    if (tag?.id != null) ids.push(Number(tag.id));
  }
  return ids;
}

function configuredTaskPreview(task: Quest, configuration: FocusConfiguration, operation: string, link: FocusExternalLink | null | undefined = focusTaskLink(task)): Record<string, unknown> {
  return {
    operation,
    questId: task.id,
    focusTaskId: link?.externalId || "",
    task: taskPayload(task, configuration),
    tagNames: task.tags || [],
    willCreateTags: (task.tags || []).length > 0,
  };
}

/* Legacy implementation below is replaced by the typed declarations above. */
/*
 * The original untyped helpers were kept in this patch context only so that
 * the behavior can be compared while the rest of this file is migrated.
 */
export async function connectTogglFocus(env: WorkerEnv, identity: Identity, input: FocusInput = {}) {
  const { uid } = normalizeIdentity(identity);
  const apiKey = String(input.apiKey || "").trim();
  if (!/^toggl_sk_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
    throw integrationError(400, "invalid_focus_api_key", "Paste a Toggl Focus personal API key beginning with toggl_sk_.");
  }
  const settings = asObject(await focusJson(apiKey, "/users/me/settings")) || {};
  const existing = await getIntegrationAccount(env, uid, SERVICE);
  const savedSettings = {
    organizationId: input.organizationId !== undefined ? numericId(input.organizationId, "organizationId", { required: false }) : settingText(existing?.settings || {}, "organizationId"),
    workspaceId: input.workspaceId !== undefined ? numericId(input.workspaceId, "workspaceId", { required: false }) : settingText(existing?.settings || {}, "workspaceId"),
    projectId: input.projectId !== undefined ? numericId(input.projectId, "projectId", { required: false }) : settingText(existing?.settings || {}, "projectId"),
    autoCreateTasks: input.autoCreateTasks !== undefined ? Boolean(input.autoCreateTasks) : settingBool(existing?.settings || {}, "autoCreateTasks"),
  };
  const account = await saveIntegrationAccount(env, uid, SERVICE, {
    status: "connected",
    accessToken: apiKey,
    refreshToken: "",
    tokenExpiresAt: 0,
    providerAccountId: String(settings.user_id || settings.id || settings.user?.id || ""),
    providerAccountName: String(settings.email || settings.user?.email || settings.name || settings.user?.name || "Toggl Focus"),
    settings: savedSettings,
    lastError: "",
  });
  return { service: SERVICE, account: publicAccount(account), configurationRequired: !(savedSettings.organizationId && savedSettings.workspaceId) };
}

export async function configureTogglFocus(env: WorkerEnv, identity: Identity, input: FocusInput = {}) {
  const { uid, account, token } = await focusAccount(env, identity, { requireConfiguration: false });
  const settings = {
    organizationId: input.organizationId !== undefined ? numericId(input.organizationId, "organizationId", { required: false }) : settingText(account.settings, "organizationId"),
    workspaceId: input.workspaceId !== undefined ? numericId(input.workspaceId, "workspaceId", { required: false }) : settingText(account.settings, "workspaceId"),
    projectId: input.projectId !== undefined ? numericId(input.projectId, "projectId", { required: false }) : settingText(account.settings, "projectId"),
    autoCreateTasks: input.autoCreateTasks !== undefined ? Boolean(input.autoCreateTasks) : settingBool(account.settings, "autoCreateTasks"),
  };
  if (settings.organizationId && settings.workspaceId) {
    await focusJson(token, focusPath(settings, "/tasks?per_page=1"));
  } else if (settings.organizationId || settings.workspaceId) {
    throw integrationError(400, "incomplete_focus_configuration", "Enter both the organization ID and workspace ID, or leave both blank.");
  }
  const updated = await saveIntegrationAccount(env, uid, SERVICE, { settings, status: "connected", lastError: "" });
  return { service: SERVICE, account: publicAccount(updated), configurationRequired: !(settings.organizationId && settings.workspaceId) };
}

export async function listTogglFocusResources(env: WorkerEnv, identity: Identity) {
  const { account, token, configuration } = await focusAccount(env, identity, { requireConfiguration: false });
  const resources: Array<{ id: string; type: "project" | "tag"; name: string; selected?: boolean }> = [];
  if (configuration.organizationId && configuration.workspaceId) {
    const [projectsResult, tagsResult] = await Promise.all([
      focusJson(token, focusPath(configuration, "/projects?per_page=100")),
      focusJson(token, `/workspaces/${encodeURIComponent(configuration.workspaceId)}/tags?per_page=100`),
    ]);
    for (const project of asItems(projectsResult)) resources.push({ id: String(project.id), type: "project", name: project.name || `Project ${project.id}`, selected: String(project.id) === configuration.projectId });
    for (const tag of asItems(tagsResult)) resources.push({ id: String(tag.id), type: "tag", name: tag.name || `Tag ${tag.id}` });
  }
  return {
    service: SERVICE,
    account: publicAccount(account),
    resources,
    configuration,
    configurationRequired: !(configuration.organizationId && configuration.workspaceId),
    instructions: "Toggl Focus requires the numeric organization ID and workspace ID shown in its workspace URL or API context. QuestForge never stores desktop activity or window titles.",
  };
}

export async function syncQuestToTogglFocus(env: WorkerEnv, identity: Identity, state: QuestForgeState, questId: string, input: FocusInput = {}) {
  const { uid, token, configuration } = await focusAccount(env, identity);
  const task = state.tasks.find((item: Quest) => item.id === questId);
  if (!focusTaskEligible(task)) throw integrationError(409, "focus_quest_not_eligible", "Only active To Do and Daily quests can be sent to Toggl Focus.");
  const durableLink = await getTogglFocusTaskLink(env, uid, task.id);
  const link = configuredFocusTaskLink(task, configuration) || storedFocusTaskLink(durableLink, configuration);
  const dryRun = input.dryRun !== false;
  const operation = link ? "update" : "create";
  if (dryRun) return { dryRun: true, ...configuredTaskPreview(task, configuration, operation, link) };

  const tagIds = await focusTags(token, configuration, task);
  const payload = taskPayload(task, configuration, tagIds);
  let effectiveOperation = operation;
  let remote;
  if (link) {
    try {
      remote = asObject(await focusJson(token, focusPath(configuration, `/tasks/${encodeURIComponent(link.externalId)}`), { method: "PATCH", body: JSON.stringify(payload) }));
    } catch (error) {
      if (errorDetails(error).providerStatus !== 404) throw error;
      effectiveOperation = "recreate";
      remote = asObject(await focusJson(token, focusPath(configuration, "/tasks"), { method: "POST", body: JSON.stringify(payload) }));
    }
  } else {
    remote = asObject(await focusJson(token, focusPath(configuration, "/tasks"), { method: "POST", body: JSON.stringify(payload) }));
  }
  const normalized = normalizedTask(remote);
  if (!normalized.id) throw integrationError(502, "provider_invalid_response", "Toggl Focus did not return a task ID.");
  // Save the remote ID first, so a cloud-sync retry updates this task instead of creating another one.
  await saveTogglFocusTaskLink(env, uid, {
    questId: task.id,
    focusTaskId: normalized.id,
    organizationId: configuration.organizationId,
    workspaceId: configuration.workspaceId,
    projectId: configuration.projectId,
  });
  if (effectiveOperation === "recreate" || (effectiveOperation === "create" && focusTaskLink(task))) {
    task.externalLinks = (task.externalLinks || []).filter((item) => !(item.service === SERVICE && (item.type === "task" || item.sourceType === FOCUS_TASK_TYPE)));
  }
  const result = linkExternalRecord(state, task.id, {
    service: SERVICE,
    externalId: normalized.id,
    type: "task",
    sourceType: FOCUS_TASK_TYPE,
    organizationId: configuration.organizationId,
    workspaceId: configuration.workspaceId,
    projectId: configuration.projectId,
    remoteUpdatedAt: normalized.updatedAt,
    direction: "export",
  }, { source: SERVICE, allowManagedFocus: true });
  return { dryRun: false, operation: effectiveOperation, quest: result.quest, external: { id: normalized.id, name: normalized.name }, event: result.event };
}

export async function getTogglFocusTracking(env: WorkerEnv, identity: Identity) {
  const { token, configuration } = await focusAccount(env, identity, { requireConfiguration: false });
  if (!(configuration.organizationId && configuration.workspaceId)) {
    return { service: SERVICE, tracking: null, configuration, configurationRequired: true, activityContexts: ACTIVITY_CONTEXTS };
  }
  const current = await currentFocusTracking(token, configuration);
  return { service: SERVICE, tracking: current, configuration, configurationRequired: false, activityContexts: ACTIVITY_CONTEXTS };
}

export async function startTogglFocusTracking(env: WorkerEnv, identity: Identity, state: QuestForgeState, input: FocusInput = {}) {
  const { uid, token, configuration } = await focusAccount(env, identity);
  const quest = state.tasks.find((task) => task.id === input.questId);
  if (!focusTaskEligible(quest)) throw integrationError(409, "focus_quest_not_eligible", "Only active To Do and Daily quests can start a Focus timer.");
  const link = configuredFocusTaskLink(quest, configuration) || storedFocusTaskLink(await getTogglFocusTaskLink(env, uid, quest.id), configuration);
  if (!link) throw integrationError(409, "focus_task_not_linked", "Create or sync this Quest to Toggl Focus before starting a timer.");
  const current = await currentFocusTracking(token, configuration);
  const dryRun = input.dryRun !== false;
  if (current?.taskId === link.externalId) return { dryRun, action: "already_running", tracking: current, questId: quest.id };
  if (current && input.expectedCurrentEntryId !== current.id) {
    return {
      dryRun: true,
      action: "confirmation_required",
      questId: quest.id,
      current,
      expectedCurrentEntryId: current.id,
      message: "Another Focus timer is running. Confirm that it may be stopped before starting this Quest.",
    };
  }
  if (dryRun) return { dryRun: true, action: "start", questId: quest.id, focusTaskId: link.externalId, current };
  const started = normalizeTracking(await focusJson(token, focusPath(configuration, "/tracking/start"), {
    method: "POST",
    body: JSON.stringify(compact({ task_id: Number(link.externalId), project_id: configuration.projectId ? Number(configuration.projectId) : undefined, description: quest.title })),
  }));
  return { dryRun: false, action: "started", questId: quest.id, tracking: started };
}

export async function stopTogglFocusTracking(env: WorkerEnv, identity: Identity, input: FocusInput = {}) {
  const { token, configuration } = await focusAccount(env, identity);
  const current = await currentFocusTracking(token, configuration);
  const dryRun = input.dryRun !== false;
  if (!current) return { dryRun, action: "nothing_running", tracking: null };
  if (String(input.expectedEntryId || "") !== current.id) {
    return {
      dryRun: true,
      action: "confirmation_required",
      current,
      expectedEntryId: current.id,
      message: "The running timer changed. Refresh and confirm the exact Focus entry before stopping it.",
    };
  }
  if (dryRun) return { dryRun: true, action: "stop", current, expectedEntryId: current.id };
  await focusJson(token, focusPath(configuration, "/tracking/stop"), { method: "POST", body: JSON.stringify(compact({ end: input.end })) });
  return { dryRun: false, action: "stopped", stoppedEntryId: current.id };
}

export async function listTogglFocusEntries(env: WorkerEnv, identity: Identity, input: FocusInput = {}) {
  const { token, configuration } = await focusAccount(env, identity);
  const window = daysWindow(input);
  const query = new URLSearchParams({ date_from: dateIso(window.dateFrom), date_to: dateIso(window.dateTo, true), per_page: String(Math.max(1, Math.min(200, Number(input.limit || 100)))) });
  if (input.includeTaskless === true) query.set("include_taskless", "true");
  const response = await focusJson(token, focusPath(configuration, `/time-entries?${query.toString()}`));
  const entries = asItems(response).map(normalizeEntry).filter((entry) => entry.id);
  const attributions = new Map((await listTogglFocusAttributions(env, normalizeIdentity(identity).uid)).map((entry) => [entry.entryId, entry]));
  return {
    service: SERVICE,
    ...window,
    configuration,
    entries: entries.map((entry) => ({ ...entry, attribution: attributions.get(entry.id) || null })),
    total: entries.length,
  };
}

function linkedQuestForFocusTask(state: QuestForgeState, focusTaskId: string, configuration: FocusConfiguration, storedLink: FocusTaskLink | null | undefined = null): Quest | undefined {
  return state.tasks.find((task) => attributionEligibleQuest(task) && configuredFocusTaskLink(task, configuration)?.externalId === String(focusTaskId))
    || (storedLink ? state.tasks.find((task) => task.id === storedLink.questId && attributionEligibleQuest(task)) : undefined);
}

function linkedQuestForFocusEntry(state: QuestForgeState, entryId: string): Quest | undefined {
  return state.tasks.find((task) => focusEntryLink(task, entryId));
}

async function attributionCandidates(env: WorkerEnv, identity: Identity, state: QuestForgeState, input: FocusInput = {}) {
  const listing = await listTogglFocusEntries(env, identity, input);
  const durableTaskLinks = new Map((await listTogglFocusTaskLinks(env, normalizeIdentity(identity).uid))
    .filter((link) => link.organizationId === listing.configuration.organizationId && link.workspaceId === listing.configuration.workspaceId)
    .map((link) => [link.focusTaskId, link]));
  const wanted = new Set((input.entryIds || []).map(String).filter(Boolean));
  const explicitQuest = input.questId ? state.tasks.find((task) => task.id === input.questId) : undefined;
  if (input.questId && !attributionEligibleQuest(explicitQuest)) throw integrationError(409, "focus_quest_not_eligible", "Choose a non-archived To Do or Daily Quest for manual attribution.");
  const candidates = [];
  for (const entry of listing.entries.filter((entry) => !wanted.size || wanted.has(entry.id))) {
    const linked = linkedQuestForFocusEntry(state, entry.id);
    const direct = linkedQuestForFocusTask(state, entry.taskId, listing.configuration, durableTaskLinks.get(entry.taskId));
    const stored = entry.attribution?.questId ? state.tasks.find((task) => task.id === entry.attribution?.questId) : undefined;
    const target = linked || direct || stored || explicitQuest;
    const mode = linked || direct ? "direct" : stored ? "stored" : explicitQuest ? "manual" : "candidate";
    candidates.push({
      entry,
      questId: target?.id || "",
      questTitle: target?.title || "",
      mode,
      status: entry.deletedAt ? "deleted" : target ? (entry.attribution && entry.attribution.questId !== target.id ? "conflict" : "ready") : "unlinked",
    });
  }
  return { listing, candidates };
}

export async function previewTogglFocusAttribution(env: WorkerEnv, identity: Identity, state: QuestForgeState, input: FocusInput = {}) {
  const { listing, candidates } = await attributionCandidates(env, identity, state, input);
  const ready = candidates.filter((candidate) => candidate.status === "ready");
  return {
    dryRun: true,
    service: SERVICE,
    dateFrom: listing.dateFrom,
    dateTo: listing.dateTo,
    candidates,
    summary: { total: candidates.length, ready: ready.length, unlinked: candidates.filter((candidate) => candidate.status === "unlinked").length, conflicts: candidates.filter((candidate) => candidate.status === "conflict").length },
  };
}

export async function applyTogglFocusAttribution(env: WorkerEnv, identity: Identity, state: QuestForgeState, input: FocusInput = {}) {
  const dryRun = input.dryRun !== false;
  const preview = await previewTogglFocusAttribution(env, identity, state, input);
  if (dryRun) return preview;
  const { uid, configuration } = await focusAccount(env, identity);
  const results = [];
  const events = [];
  for (const candidate of preview.candidates) {
    const { entry } = candidate;
    if (candidate.status === "unlinked") continue;
    if (candidate.status === "conflict") throw integrationError(409, "time_entry_already_attributed", "One or more Focus entries are already attributed to another Quest.", { entryId: entry.id, questId: entry.attribution?.questId });
    const target = state.tasks.find((task) => task.id === candidate.questId);
    if (!target) continue;
    if (entry.deletedAt) {
      const removed = removeManagedFocusEntry(state, target.id, entry.id, { source: SERVICE });
      await deleteTogglFocusAttribution(env, uid, entry.id);
      if (removed.event) events.push(removed.event);
      results.push({ entryId: entry.id, questId: target.id, action: "removed" });
      continue;
    }
    const existingOwner = linkedQuestForFocusEntry(state, entry.id);
    if (existingOwner && existingOwner.id !== target.id) throw integrationError(409, "time_entry_already_attributed", "This Focus entry already belongs to another Quest.", { entryId: entry.id, questId: existingOwner.id });
    await saveTogglFocusAttribution(env, uid, {
      entryId: entry.id,
      questId: target.id,
      focusTaskId: entry.taskId,
      durationMinutes: entry.durationMinutes,
      source: candidate.mode,
      entryUpdatedAt: entry.updatedAt,
      entryStartAt: entry.startAt,
      entryStopAt: entry.stopAt,
    });
    const linked = linkExternalRecord(state, target.id, {
      service: SERVICE,
      externalId: entry.id,
      type: "time_entry",
      sourceType: FOCUS_ENTRY_TYPE,
      taskId: entry.taskId,
      organizationId: configuration.organizationId,
      workspaceId: configuration.workspaceId,
      projectId: entry.projectId || configuration.projectId,
      durationMinutes: entry.durationMinutes,
      entryStartAt: entry.startAt,
      entryStopAt: entry.stopAt,
      remoteUpdatedAt: entry.updatedAt,
      direction: "import",
    }, { source: SERVICE, allowManagedFocus: true });
    events.push(linked.event);
    const linkedQuest = linked.quest as Quest;
    results.push({ entryId: entry.id, questId: target.id, action: "attributed", actualMinutes: linkedQuest.actualMinutes });
  }
  return { dryRun: false, service: SERVICE, results, events, count: results.length };
}

export async function getTogglFocusEstimateInsights(env: WorkerEnv, identity: Identity, state: QuestForgeState) {
  await focusAccount(env, identity);
  const samples = state.tasks.filter((task) => ["completed", "archived"].includes(task.lifecycleState)
    && Number(task.actualMinutes || 0) > 0
    && (task.externalLinks || []).some((link) => link.service === SERVICE));
  if (samples.length < 3) return { available: false, sampleSize: samples.length, minimumSampleSize: 3, suggestions: [] };
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  };
  const groups = new Map<string, number[]>();
  for (const task of samples) {
    const keys = [`difficulty:${task.difficulty}`, `kind:${task.kind}`, ...(task.category ? [`category:${task.category}`] : [])];
    for (const key of keys) groups.set(key, [...(groups.get(key) || []), Number(task.actualMinutes)]);
  }
  const suggestions = [...groups.entries()]
    .filter(([, values]) => values.length >= 3)
    .map(([group, values]) => ({ group, sampleSize: values.length, suggestedMinutes: median(values), basis: "completed Toggl Focus-linked Quests" }))
    .sort((a, b) => b.sampleSize - a.sampleSize || a.group.localeCompare(b.group));
  return { available: true, sampleSize: samples.length, suggestions, note: "Suggestions only. Quest estimates are never changed automatically." };
}

export async function purgeTogglFocus(env: WorkerEnv, identity: Identity, state: QuestForgeState, input: FocusInput = {}) {
  const dryRun = input.dryRun !== false;
  const result = purgeManagedFocusLinks(state, { dryRun }, { source: SERVICE });
  if (!dryRun) {
    const { uid } = normalizeIdentity(identity);
    await Promise.all([
      purgeTogglFocusAttributions(env, uid),
      purgeTogglFocusTaskLinks(env, uid),
    ]);
  }
  return result;
}

export async function isTogglFocusAutoCreateEnabled(env: WorkerEnv, identity: Identity): Promise<boolean> {
  try {
    const { account, configuration } = await focusAccount(env, identity, { requireConfiguration: false });
    return Boolean(account?.status === "connected" && configuration.autoCreateTasks && configuration.organizationId && configuration.workspaceId);
  } catch { return false; }
}

export function isTogglFocusService(service: string): boolean {
  return service === SERVICE;
}
