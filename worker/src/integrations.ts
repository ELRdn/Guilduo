import { createQuest, linkExternalRecord, patchQuest, touch } from "../../server/questforge-domain.ts";
import {
  acquireIntegrationLock,
  addIntegrationLog,
  getIntegrationAccount,
  listCalendarEvents,
  listIntegrationAccounts,
  releaseIntegrationLock,
  replaceCalendarEvents,
  saveIntegrationAccount,
} from "./integration-store.ts";
import { getIntegrationAccessToken } from "./provider-oauth.ts";
import { isQuest } from "../../types/questforge.ts";
import type { CalendarEvent, IntegrationAccount } from "./integration-store.ts";
import type { AuthIdentity } from "./security.ts";
import type { JsonRecord, WorkerEnv, WorkerError } from "./worker-types.ts";
import type { ExternalLink, Quest, QuestForgeState } from "../../types/questforge.ts";

export const INTEGRATIONS = [
  { id: "google-calendar", name: "Google Calendar", auth: "OAuth 2.0", capabilities: ["import"], phase: 1 },
  { id: "google-tasks", name: "Google Tasks", auth: "OAuth 2.0", capabilities: ["import", "export", "bidirectional"], phase: 1 },
  { id: "notion", name: "Notion", auth: "OAuth 2.0", capabilities: ["export"], phase: 1 },
  { id: "toggl-focus", name: "Toggl Focus", auth: "Personal API key", capabilities: ["task_export", "timer_read", "timer_write", "time_entry_import"], phase: 1 },
  { id: "toggl-track", name: "Toggl Track", auth: "API token", capabilities: ["import", "timer_read", "timer_write"], phase: 2 },
 ] as const;

type Identity = string | Pick<AuthIdentity, "uid">;
type IntegrationInput = JsonRecord;
type IntegrationSettings = JsonRecord & {
  autoSync?: boolean;
  calendarIds?: string[];
  taskListId?: string;
  parentPageId?: string;
  notionDatabaseId?: string;
  notionDataSourceId?: string;
  notionDatabaseUrl?: string;
};
type RequestOptions = { method?: string; headers?: Record<string, string>; body?: string };
type ProviderRecord = JsonRecord & {
  id?: string;
  title?: string;
  name?: string;
  summary?: string;
  summaryOverride?: string;
  url?: string;
  htmlLink?: string;
  description?: string;
  status?: string;
  updated?: string;
  notes?: string;
  deleted?: boolean;
  etag?: string;
  webViewLink?: string;
  due?: string;
  completed?: string;
  nextPageToken?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  start?: ProviderRecord;
  end?: ProviderRecord;
  date?: string;
  dateTime?: string;
  recurringEventId?: string;
  items?: ProviderRecord[];
  results?: ProviderRecord[];
  data_sources?: ProviderRecord[];
  initial_data_source?: ProviderRecord;
  properties?: JsonRecord;
};

type CalendarResource = { id: string; name: string; primary?: boolean; selected?: boolean; accessRole?: string };
type IntegrationResult = { created: number; updated: number; skipped: number; conflicts: number; preview: unknown[] };
type DailyLog = { date: string; title: string; completed: number; xp: number; gem: number; mp: number; focusMinutes: number; review: string };

function asRecord(value: unknown): ProviderRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ProviderRecord : {};
}

function asRecords(value: unknown): ProviderRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function settingsOf(account: IntegrationAccount): IntegrationSettings {
  return account.settings as IntegrationSettings;
}

function errorInfo(error: unknown): { message: string; code: string } {
  const item = error && typeof error === "object" ? error as JsonRecord : {};
  return { message: String(item.message || "Integration sync failed."), code: String(item.code || "") };
}

function integrationError(status: number, code: string, message: string, details: unknown = undefined): WorkerError {
  return Object.assign(new Error(message), { status, code, details });
}

function normalizeIdentity(identity: Identity): { uid: string } {
  return typeof identity === "string" ? { uid: identity } : identity;
}

function publicAccount(account: IntegrationAccount | null | undefined): JsonRecord | null {
  if (!account) return null;
  return {
    status: account.status,
    providerAccountName: account.providerAccountName,
    settings: account.settings,
    lastSyncedAt: account.lastSyncedAt,
    lastError: account.lastError,
  };
}

function providerConfigurationStatus(env: WorkerEnv, service: string): string {
  if (service === "google-calendar" || service === "google-tasks") {
    return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "ready" : "admin_setup_required";
  }
  if (service === "notion") {
    return env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET ? "ready" : "admin_setup_required";
  }
  if (service === "toggl-focus") return "ready";
  return "planned";
}

export async function listIntegrations(env: WorkerEnv, identity: Identity): Promise<JsonRecord[]> {
  const uid = normalizeIdentity(identity).uid;
  const accounts = new Map((await listIntegrationAccounts(env, uid)).map((account) => [account.service, account]));
  return INTEGRATIONS.map((integration) => ({
    ...integration,
    status: integration.phase === 2 ? "planned" : accounts.get(integration.id)?.status || "not_connected",
    configurationStatus: providerConfigurationStatus(env, integration.id),
    account: publicAccount(accounts.get(integration.id)),
  }));
}

async function fetchJson(url: string, options: RequestOptions = {}, attempt = 0): Promise<ProviderRecord | null> {
  const response = await fetch(url, options);
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
    return fetchJson(url, options, attempt + 1);
  }
  const value: ProviderRecord | null = response.status === 204 ? null : asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    const code = response.status === 401 ? "reconnect_required" : response.status === 429 ? "provider_rate_limited" : "provider_error";
    const providerError = value?.error && typeof value.error === "object" ? asRecord(value.error).message : "";
    throw integrationError(response.status === 401 ? 401 : 502, code, String(providerError || value?.message || `External service returned ${response.status}`));
  }
  return value;
}

async function googleJson(env: WorkerEnv, uid: string, service: string, url: string, options: RequestOptions = {}): Promise<ProviderRecord | null> {
  const accessToken = await getIntegrationAccessToken(env, uid, service);
  return fetchJson(url, { ...options, headers: { authorization: `Bearer ${accessToken}`, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
}

async function notionJson(env: WorkerEnv, uid: string, url: string, options: RequestOptions = {}): Promise<ProviderRecord | null> {
  const accessToken = await getIntegrationAccessToken(env, uid, "notion");
  return fetchJson(url, { ...options, headers: { authorization: `Bearer ${accessToken}`, "notion-version": "2026-03-11", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
}

export async function listIntegrationResources(env: WorkerEnv, identity: Identity, service: string): Promise<JsonRecord> {
  const { uid } = normalizeIdentity(identity);
  if (service === "google-calendar") {
    const data = (await googleJson(env, uid, service, "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250")) || {};
    return { service, resources: (data.items || []).map((item) => ({ id: String(item.id || ""), name: String(item.summaryOverride || item.summary || item.id || "Calendar"), primary: Boolean(item.primary), selected: Boolean(item.selected), accessRole: String(item.accessRole || "") })) };
  }
  if (service === "google-tasks") {
    const data = (await googleJson(env, uid, service, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100")) || {};
    return { service, resources: (data.items || []).map((item) => ({ id: String(item.id || ""), name: String(item.title || "Google Tasks"), updatedAt: String(item.updated || "") })) };
  }
  if (service === "notion") {
    const data = (await notionJson(env, uid, "https://api.notion.com/v1/search", { method: "POST", body: JSON.stringify({ filter: { property: "object", value: "page" }, page_size: 100, sort: { direction: "descending", timestamp: "last_edited_time" } }) })) || {};
    return { service, resources: (data.results || []).map((page) => ({ id: String(page.id || ""), name: String(page.url || "Notion page"), url: String(page.url || "") })) };
  }
  throw integrationError(service === "toggl-track" ? 409 : 404, service === "toggl-track" ? "integration_planned" : "integration_not_found", service === "toggl-track" ? "Toggl Track is planned for phase 2." : "Unknown integration.");
}

async function ensureNotionDatabase(env: WorkerEnv, uid: string, settings: IntegrationSettings): Promise<IntegrationSettings> {
  if (settings.notionDatabaseId && settings.notionDataSourceId) return settings;
  if (!settings.parentPageId) throw integrationError(400, "notion_parent_required", "Choose a Notion parent page first.");
  const created = (await notionJson(env, uid, "https://api.notion.com/v1/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: settings.parentPageId },
      title: [{ type: "text", text: { content: "QuestForge Logs" } }],
      initial_data_source: {
        title: [{ type: "text", text: { content: "QuestForge Logs" } }],
        properties: {
          Title: { title: {} }, Date: { date: {} }, Completed: { number: {} }, XP: { number: {} }, Gem: { number: {} }, MP: { number: {} },
          "Focus Minutes": { number: {} }, Review: { rich_text: {} },
        },
      },
    }),
  })) || {};
  const dataSourceId = created.data_sources?.[0]?.id || created.initial_data_source?.id || "";
  if (!dataSourceId) throw integrationError(502, "notion_database_invalid", "Notion did not return a data source ID.");
  return { ...settings, notionDatabaseId: created.id, notionDataSourceId: dataSourceId, notionDatabaseUrl: created.url || "" };
}

export async function configureIntegration(env: WorkerEnv, identity: Identity, service: string, input: IntegrationInput): Promise<JsonRecord> {
  const { uid } = normalizeIdentity(identity);
  const account = await getIntegrationAccount(env, uid, service);
  if (!account) throw integrationError(409, "integration_not_connected", `${service} is not connected.`);
  let settings: IntegrationSettings = { ...settingsOf(account), autoSync: Boolean(input.autoSync ?? settingsOf(account).autoSync) };
  if (service === "google-calendar") settings.calendarIds = [...new Set(stringArray(input.calendarIds || settings.calendarIds))].slice(0, 20);
  if (service === "google-tasks") settings.taskListId = String(input.taskListId || settings.taskListId || "");
  if (service === "notion") {
    if (input.parentPageId && input.parentPageId !== settings.parentPageId) settings = { ...settings, parentPageId: String(input.parentPageId), notionDatabaseId: "", notionDataSourceId: "", notionDatabaseUrl: "" };
    if (input.createDatabase !== false) settings = await ensureNotionDatabase(env, uid, settings);
  }
  await saveIntegrationAccount(env, uid, service, { settings, lastError: "" });
  return { service, account: publicAccount(await getIntegrationAccount(env, uid, service)) };
}

function calendarRange() {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 62);
  return { from: from.toISOString(), to: to.toISOString() };
}

function mapCalendarEvent(item: ProviderRecord, calendar: { id: string; name: string }): CalendarEvent {
  const allDay = Boolean(item.start?.date);
  const start = item.start || {};
  const end = item.end || {};
  return {
    externalId: String(item.id || ""),
    calendarId: calendar.id,
    title: String(item.summary || "Google Calendar event"),
    description: String(item.description || ""),
    startAt: allDay ? `${String(start.date || "")}T00:00:00` : String(start.dateTime || ""),
    endAt: allDay ? `${String(end.date || start.date || "")}T00:00:00` : String(end.dateTime || start.dateTime || ""),
    allDay,
    calendarName: calendar.name,
    htmlUrl: String(item.htmlLink || ""),
    status: String(item.status || "confirmed"),
    payload: { updated: String(item.updated || ""), recurringEventId: String(item.recurringEventId || "") },
  };
}

async function fetchCalendarRecords(env: WorkerEnv, uid: string, account: IntegrationAccount): Promise<Array<{ calendarId: string; events: CalendarEvent[] }>> {
  const calendarIds = settingsOf(account).calendarIds || [];
  if (!calendarIds.length) throw integrationError(409, "integration_configuration_required", "Choose at least one Google Calendar.");
  const resources = await listIntegrationResources(env, { uid }, "google-calendar");
  const calendarResources = Array.isArray(resources.resources) ? resources.resources as CalendarResource[] : [];
  const byId = new Map(calendarResources.map((item) => [item.id, item]));
  const range = calendarRange();
  const result = [];
  for (const calendarId of calendarIds) {
    const events: CalendarEvent[] = [];
    let pageToken = "";
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("timeMin", range.from);
      url.searchParams.set("timeMax", range.to);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "true");
      url.searchParams.set("maxResults", "2500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const data = (await googleJson(env, uid, "google-calendar", url.toString())) || {};
      events.push(...(data.items || []).filter((item) => item.status !== "cancelled").map((item) => mapCalendarEvent(item, byId.get(calendarId) || { id: calendarId, name: calendarId })));
      pageToken = String(data.nextPageToken || "");
    } while (pageToken);
    result.push({ calendarId, events });
  }
  return result;
}

function findGoogleTaskLink(task: Quest): ExternalLink | undefined {
  return (task.externalLinks || []).find((link) => link.service === "google-tasks" && link.type === "tasks.task");
}

function replaceTaskLink(task: Quest, link: ExternalLink): void {
  task.externalLinks = [...(task.externalLinks || []).filter((item) => !(item.service === link.service && item.externalId === link.externalId)), link].slice(-30);
}

function taskLink(remote: ProviderRecord, localUpdatedAt: string, overrides: Partial<ExternalLink> = {}): ExternalLink {
  return {
    service: "google-tasks", externalId: String(remote.id || ""), type: "tasks.task", sourceType: "tasks.task", direction: "bidirectional",
    url: String(remote.webViewLink || ""), projectId: "", organizationId: "", workspaceId: "", taskId: "", entryStartAt: "", entryStopAt: "", durationMinutes: 0,
    syncedAt: new Date().toISOString(), remoteUpdatedAt: String(remote.updated || ""), localUpdatedAt,
    remoteEtag: String(remote.etag || ""), syncStatus: "synced", ...overrides,
  };
}

async function fetchGoogleTasks(env: WorkerEnv, uid: string, account: IntegrationAccount): Promise<ProviderRecord[]> {
  const listId = settingsOf(account).taskListId || "";
  if (!listId) throw integrationError(409, "integration_configuration_required", "Choose one Google Tasks list.");
  const items: ProviderRecord[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`);
    url.searchParams.set("showCompleted", "true");
    url.searchParams.set("showHidden", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = (await googleJson(env, uid, "google-tasks", url.toString())) || {};
    items.push(...(data.items || []));
    pageToken = String(data.nextPageToken || "");
  } while (pageToken);
  return items;
}

function remoteTaskPatch(task: Quest): Record<string, unknown> {
  return { title: task.title, notes: task.notes || "", due: task.dueDate ? `${task.dueDate}T00:00:00.000Z` : null, status: task.done ? "completed" : "needsAction", ...(task.done ? { completed: task.completedAt || new Date().toISOString() } : {}) };
}

async function syncGoogleTasks(env: WorkerEnv, uid: string, sourceState: QuestForgeState, account: IntegrationAccount, dryRun: boolean): Promise<IntegrationResult & { state: QuestForgeState }> {
  const state: QuestForgeState = dryRun ? structuredClone(sourceState) : sourceState;
  const remotes = await fetchGoogleTasks(env, uid, account);
  let created = 0; let updated = 0; let skipped = 0; let conflicts = 0;
  const preview: unknown[] = [];
  for (const remote of remotes) {
    const existing = state.tasks.find((task) => findGoogleTaskLink(task)?.externalId === remote.id);
    if (remote.deleted) {
      if (existing) {
        const link = findGoogleTaskLink(existing);
        if (!link) throw integrationError(500, "quest_link_invalid", "The linked Google Task record could not be loaded.");
        replaceTaskLink(existing, { ...link, syncStatus: "remote_missing", syncedAt: new Date().toISOString() });
        existing.updatedAt = new Date().toISOString();
        conflicts += 1;
        preview.push({ action: "conflict", title: existing.title, reason: "Google task was deleted; QuestForge kept it." });
      } else skipped += 1;
      continue;
    }
    if (!existing) {
      const createdQuest = createQuest(state, { kind: "todo", title: remote.title || "Google Task", notes: remote.notes || "", dueDate: (remote.due || "").slice(0, 10), difficulty: "easy", tags: ["google-tasks"] }, { source: "google-tasks" });
      if (!isQuest(createdQuest)) throw integrationError(500, "quest_sync_failed", "Google Task could not be converted into a Quest.");
      if (remote.status === "completed") patchQuest(state, createdQuest.id, { lifecycleState: "completed" }, { source: "google-tasks", countRollover: false });
      const task = state.tasks.find((item) => item.id === createdQuest.id);
      if (!task) throw integrationError(500, "quest_sync_failed", "Quest created from Google Tasks could not be loaded.");
      replaceTaskLink(task, taskLink(remote, task.updatedAt));
      created += 1;
      preview.push({ action: "create", title: task.title, dueDate: task.dueDate, sourceType: "tasks.task" });
      continue;
    }
    const link = findGoogleTaskLink(existing);
    if (!link) throw integrationError(500, "quest_link_invalid", "The linked Google Task record could not be loaded.");
    const localChanged = Boolean(link.localUpdatedAt && existing.updatedAt > link.localUpdatedAt);
    const remoteChanged = Boolean(link.remoteUpdatedAt && remote.updated && remote.updated > link.remoteUpdatedAt);
    if (localChanged && remoteChanged) {
      replaceTaskLink(existing, { ...link, syncStatus: "conflict", syncedAt: new Date().toISOString() });
      conflicts += 1;
      preview.push({ action: "conflict", title: existing.title, remoteTitle: remote.title, reason: "Both sides changed." });
      continue;
    }
    if (localChanged) {
      if (!dryRun) {
        const result = (await googleJson(env, uid, "google-tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(settingsOf(account).taskListId || "")}/tasks/${encodeURIComponent(String(remote.id || ""))}`, { method: "PATCH", headers: link.remoteEtag ? { "if-match": link.remoteEtag } : {}, body: JSON.stringify(remoteTaskPatch(existing)) })) || {};
        replaceTaskLink(existing, taskLink(result, existing.updatedAt));
      }
      updated += 1;
      preview.push({ action: "export", title: existing.title, sourceType: "tasks.task" });
      continue;
    }
    if (remoteChanged || !link.remoteUpdatedAt) {
      patchQuest(state, existing.id, { title: remote.title || existing.title, notes: remote.notes || "", dueDate: (remote.due || "").slice(0, 10), lifecycleState: remote.status === "completed" ? "completed" : "active" }, { source: "google-tasks", countRollover: false });
      const changed = state.tasks.find((task) => task.id === existing.id);
      if (!changed) throw integrationError(500, "quest_sync_failed", "Google Tasks update target could not be loaded.");
      replaceTaskLink(changed, taskLink(remote, changed.updatedAt));
      updated += 1;
      preview.push({ action: "import", title: changed.title, sourceType: "tasks.task" });
    } else skipped += 1;
  }
  touch(state);
  return { state, created, updated, skipped, conflicts, preview: preview.slice(0, 50) };
}

function dailyLog(state: QuestForgeState, date: string): DailyLog {
  const completed = (state.tasks || []).filter((task: Quest) => (task.completedAt || task.lastCompletedDate || "").slice(0, 10) === date);
  const reviews = Array.isArray(state.dailyReviews) ? state.dailyReviews as Array<JsonRecord> : [];
  const review = String(reviews.find((item) => item.date === date)?.review || completed.map((task: Quest) => task.title).join(" / ").slice(0, 1800));
  return {
    date,
    title: `QuestForge ${date}`,
    completed: completed.length,
    xp: Number(state.character?.xp || 0), gem: Number(state.character?.gems || 0), mp: Number(state.battle?.mp || 0),
    focusMinutes: completed.reduce((sum: number, task: Quest) => sum + Number(task.actualMinutes || task.manualActualMinutes || 0), 0),
    review,
  };
}

async function findNotionLog(env: WorkerEnv, uid: string, dataSourceId: string, date: string): Promise<ProviderRecord | null> {
  const data = (await notionJson(env, uid, `https://api.notion.com/v1/data_sources/${encodeURIComponent(dataSourceId)}/query`, { method: "POST", body: JSON.stringify({ filter: { property: "Date", date: { equals: date } }, page_size: 2 }) })) || {};
  return data.results?.[0] || null;
}

function notionProperties(log: DailyLog): Record<string, unknown> {
  return {
    Title: { title: [{ type: "text", text: { content: log.title } }] }, Date: { date: { start: log.date } }, Completed: { number: log.completed },
    XP: { number: log.xp }, Gem: { number: log.gem }, MP: { number: log.mp }, "Focus Minutes": { number: log.focusMinutes },
    Review: { rich_text: log.review ? [{ type: "text", text: { content: log.review.slice(0, 2000) } }] : [] },
  };
}

async function syncNotion(env: WorkerEnv, uid: string, state: QuestForgeState, account: IntegrationAccount, dryRun: boolean): Promise<IntegrationResult> {
  const settings = settingsOf(account);
  if (!settings.notionDataSourceId) throw integrationError(409, "integration_configuration_required", "Create the QuestForge Logs database first.");
  const date = new Date().toISOString().slice(0, 10);
  const log = dailyLog(state, date);
  const existing = await findNotionLog(env, uid, settings.notionDataSourceId, date);
  if (!dryRun) {
    if (existing) await notionJson(env, uid, `https://api.notion.com/v1/pages/${encodeURIComponent(String(existing.id || ""))}`, { method: "PATCH", body: JSON.stringify({ properties: notionProperties(log) }) });
    else await notionJson(env, uid, "https://api.notion.com/v1/pages", { method: "POST", body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: settings.notionDataSourceId }, properties: notionProperties(log) }) });
  }
  return { created: existing ? 0 : 1, updated: existing ? 1 : 0, skipped: 0, conflicts: 0, preview: [{ action: existing ? "update" : "create", ...log }] };
}

export async function syncIntegration(env: WorkerEnv, identity: Identity, state: QuestForgeState, service: string, direction: string, dryRun = true): Promise<JsonRecord> {
  const { uid } = normalizeIdentity(identity);
  const adapter = INTEGRATIONS.find((item) => item.id === service);
  if (!adapter) throw integrationError(404, "integration_not_found", "Unknown integration.");
  if (!["google-calendar", "google-tasks", "notion"].includes(service)) {
    throw integrationError(409, "integration_uses_dedicated_api", service === "toggl-focus"
      ? "Toggl Focus uses dedicated task, timer, and attribution endpoints."
      : "This integration is planned for a later phase.");
  }
  const account = await getIntegrationAccount(env, uid, service);
  if (!account) throw integrationError(409, "integration_not_connected", `${service} is not connected.`);
  if (!dryRun && !(await acquireIntegrationLock(env, uid, service))) throw integrationError(409, "integration_busy", `${service} sync is already running.`);
  try {
    let result: IntegrationResult & { state?: QuestForgeState };
    if (service === "google-calendar") {
      const groups = await fetchCalendarRecords(env, uid, account);
      const records = groups.flatMap((group) => group.events);
      if (!dryRun) for (const group of groups) await replaceCalendarEvents(env, uid, service, group.calendarId, group.events);
      result = { created: records.length, updated: 0, skipped: 0, conflicts: 0, preview: records.slice(0, 50).map((event) => ({ action: "schedule", ...event })) };
    } else if (service === "google-tasks") {
      result = await syncGoogleTasks(env, uid, state, account, dryRun);
      if (!dryRun && result.state !== state && result.state) Object.assign(state, result.state);
    } else result = await syncNotion(env, uid, state, account, dryRun);
    const output = { service, direction, dryRun, created: result.created || 0, updated: result.updated || 0, skipped: result.skipped || 0, conflicts: result.conflicts || 0, preview: result.preview || [] };
    if (!dryRun) {
      const at = new Date().toISOString();
      await saveIntegrationAccount(env, uid, service, { lastSyncedAt: at, lastError: "", status: "connected" });
      await addIntegrationLog(env, uid, service, { ...output, status: "success" });
      state.syncEvents = [{ id: `sync-${Date.now()}`, integrationId: service, ...output, at, createdAt: at }, ...(state.syncEvents || [])].slice(0, 50);
      touch(state);
    }
    return output;
  } catch (error: unknown) {
    if (!dryRun) {
      const info = errorInfo(error);
      await saveIntegrationAccount(env, uid, service, { lastError: info.message, status: info.code === "reconnect_required" ? "reconnect_required" : account.status });
      await addIntegrationLog(env, uid, service, { direction, status: "failed", message: info.message });
    }
    throw error;
  } finally {
    if (!dryRun) await releaseIntegrationLock(env, uid, service);
  }
}

export async function calendarSchedule(env: WorkerEnv, identity: Identity, date: unknown): Promise<{ date: string; events: CalendarEvent[] }> {
  const { uid } = normalizeIdentity(identity);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : new Date().toISOString().slice(0, 10);
  return { date: day, events: await listCalendarEvents(env, uid, `${day}T00:00:00`, `${day}T23:59:59.999`) };
}

export async function convertCalendarEvent(env: WorkerEnv, identity: Identity, state: QuestForgeState, externalId: string): Promise<JsonRecord> {
  const schedule = await calendarSchedule(env, identity, new Date().toISOString().slice(0, 10));
  const event = schedule.events.find((item) => item.externalId === externalId);
  if (!event) throw integrationError(404, "calendar_event_not_found", "Calendar event is not available in today's schedule cache.");
  const startDate = event.startAt.slice(0, 10);
  const quest = createQuest(state, { kind: "todo", title: event.title, notes: event.description, category: "Calendar", planningState: "scheduled", planningMode: "on_date", scheduledDate: startDate, scheduledTime: event.allDay ? "" : event.startAt.slice(11, 16), dueDate: startDate, difficulty: "easy", tags: ["google-calendar"] }, { source: "google-calendar" });
  if (!isQuest(quest)) throw integrationError(500, "quest_conversion_failed", "Calendar event could not be converted into a Quest.");
  return linkExternalRecord(state, quest.id, { service: "google-calendar", externalId: event.externalId, type: "calendar.event", url: event.htmlUrl, direction: "import" }, { source: "google-calendar" });
}

export async function exportQuestToGoogleTasks(env: WorkerEnv, identity: Identity, state: QuestForgeState, questId: string): Promise<JsonRecord> {
  const { uid } = normalizeIdentity(identity);
  const account = await getIntegrationAccount(env, uid, "google-tasks");
  const settings = account ? settingsOf(account) : {};
  if (!settings.taskListId) throw integrationError(409, "integration_configuration_required", "Choose one Google Tasks list first.");
  const task = state.tasks.find((item) => item.id === questId);
  if (!task || task.kind !== "todo") throw integrationError(404, "quest_not_found", "A To Do quest is required.");
  if (findGoogleTaskLink(task)) throw integrationError(409, "quest_already_linked", "This quest is already linked to Google Tasks.");
  const remote = (await googleJson(env, uid, "google-tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(settings.taskListId)}/tasks`, { method: "POST", body: JSON.stringify(remoteTaskPatch(task)) })) || {};
  task.updatedAt = new Date().toISOString();
  replaceTaskLink(task, taskLink(remote, task.updatedAt));
  touch(state);
  return { quest: task, external: { id: remote.id, updated: remote.updated || "" } };
}

export async function resolveGoogleTaskConflict(env: WorkerEnv, identity: Identity, state: QuestForgeState, questId: string, strategy: string): Promise<JsonRecord> {
  const { uid } = normalizeIdentity(identity);
  if (!["local", "remote"].includes(strategy)) throw integrationError(400, "invalid_conflict_strategy", "Choose local or remote.");
  const account = await getIntegrationAccount(env, uid, "google-tasks");
  const settings = account ? settingsOf(account) : {};
  if (!settings.taskListId) throw integrationError(409, "integration_configuration_required", "Choose one Google Tasks list first.");
  const task = state.tasks.find((item) => item.id === questId);
  const link = task && findGoogleTaskLink(task);
  if (!task || !link) throw integrationError(404, "linked_quest_not_found", "A Google Tasks linked quest is required.");
  const baseUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(settings.taskListId)}/tasks`;

  if (strategy === "local") {
    const remote = (link.syncStatus === "remote_missing"
      ? await googleJson(env, uid, "google-tasks", baseUrl, { method: "POST", body: JSON.stringify(remoteTaskPatch(task)) })
      : await googleJson(env, uid, "google-tasks", `${baseUrl}/${encodeURIComponent(link.externalId)}`, { method: "PATCH", body: JSON.stringify(remoteTaskPatch(task)) })) || {};
    task.externalLinks = (task.externalLinks || []).filter((item) => item.service !== "google-tasks");
    replaceTaskLink(task, taskLink(remote, task.updatedAt));
  } else {
    const remote = (await googleJson(env, uid, "google-tasks", `${baseUrl}/${encodeURIComponent(link.externalId)}`)) || {};
    if (remote.deleted) throw integrationError(409, "remote_task_missing", "The Google task no longer exists. Choose QuestForge to recreate it.");
    patchQuest(state, task.id, {
      title: remote.title || task.title,
      notes: remote.notes || "",
      dueDate: (remote.due || "").slice(0, 10),
      lifecycleState: remote.status === "completed" ? "completed" : "active",
    }, { source: "google-tasks", countRollover: false });
    const changed = state.tasks.find((item) => item.id === task.id);
    if (!changed) throw integrationError(500, "quest_sync_failed", "The Google Tasks conflict target could not be loaded.");
    replaceTaskLink(changed, taskLink(remote, changed.updatedAt));
  }
  touch(state);
  return { quest: state.tasks.find((item) => item.id === questId), strategy };
}
