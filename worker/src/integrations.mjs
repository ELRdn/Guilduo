import { createQuest, linkExternalRecord, patchQuest, touch } from "../../server/questforge-domain.mjs";
import {
  acquireIntegrationLock,
  addIntegrationLog,
  getIntegrationAccount,
  listCalendarEvents,
  listIntegrationAccounts,
  releaseIntegrationLock,
  replaceCalendarEvents,
  saveIntegrationAccount,
} from "./integration-store.mjs";
import { getIntegrationAccessToken } from "./provider-oauth.mjs";

export const INTEGRATIONS = [
  { id: "google-calendar", name: "Google Calendar", auth: "OAuth 2.0", capabilities: ["import"], phase: 1 },
  { id: "google-tasks", name: "Google Tasks", auth: "OAuth 2.0", capabilities: ["import", "export", "bidirectional"], phase: 1 },
  { id: "notion", name: "Notion", auth: "OAuth 2.0", capabilities: ["export"], phase: 1 },
  { id: "toggl-focus", name: "Toggl Focus", auth: "Personal API key", capabilities: ["task_export", "timer_read", "timer_write", "time_entry_import"], phase: 1 },
  { id: "toggl-track", name: "Toggl Track", auth: "API token", capabilities: ["import", "timer_read", "timer_write"], phase: 2 },
];

function integrationError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function normalizeIdentity(identity) {
  return typeof identity === "string" ? { uid: identity } : identity;
}

function publicAccount(account) {
  if (!account) return null;
  return {
    status: account.status,
    providerAccountName: account.providerAccountName,
    settings: account.settings,
    lastSyncedAt: account.lastSyncedAt,
    lastError: account.lastError,
  };
}

function providerConfigurationStatus(env, service) {
  if (service === "google-calendar" || service === "google-tasks") {
    return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "ready" : "admin_setup_required";
  }
  if (service === "notion") {
    return env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET ? "ready" : "admin_setup_required";
  }
  if (service === "toggl-focus") return "ready";
  return "planned";
}

export async function listIntegrations(env, identity) {
  const uid = normalizeIdentity(identity).uid;
  const accounts = new Map((await listIntegrationAccounts(env, uid)).map((account) => [account.service, account]));
  return INTEGRATIONS.map((integration) => ({
    ...integration,
    status: integration.phase === 2 ? "planned" : accounts.get(integration.id)?.status || "not_connected",
    configurationStatus: providerConfigurationStatus(env, integration.id),
    account: publicAccount(accounts.get(integration.id)),
  }));
}

async function fetchJson(url, options = {}, attempt = 0) {
  const response = await fetch(url, options);
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
    return fetchJson(url, options, attempt + 1);
  }
  const value = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = response.status === 401 ? "reconnect_required" : response.status === 429 ? "provider_rate_limited" : "provider_error";
    throw integrationError(response.status === 401 ? 401 : 502, code, value?.error?.message || value?.message || `External service returned ${response.status}`);
  }
  return value;
}

async function googleJson(env, uid, service, url, options = {}) {
  const accessToken = await getIntegrationAccessToken(env, uid, service);
  return fetchJson(url, { ...options, headers: { authorization: `Bearer ${accessToken}`, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
}

async function notionJson(env, uid, url, options = {}) {
  const accessToken = await getIntegrationAccessToken(env, uid, "notion");
  return fetchJson(url, { ...options, headers: { authorization: `Bearer ${accessToken}`, "notion-version": "2026-03-11", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
}

export async function listIntegrationResources(env, identity, service) {
  const { uid } = normalizeIdentity(identity);
  if (service === "google-calendar") {
    const data = await googleJson(env, uid, service, "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250");
    return { service, resources: (data.items || []).map((item) => ({ id: item.id, name: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary), selected: Boolean(item.selected), accessRole: item.accessRole })) };
  }
  if (service === "google-tasks") {
    const data = await googleJson(env, uid, service, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100");
    return { service, resources: (data.items || []).map((item) => ({ id: item.id, name: item.title || "Google Tasks", updatedAt: item.updated || "" })) };
  }
  if (service === "notion") {
    const data = await notionJson(env, uid, "https://api.notion.com/v1/search", { method: "POST", body: JSON.stringify({ filter: { property: "object", value: "page" }, page_size: 100, sort: { direction: "descending", timestamp: "last_edited_time" } }) });
    return { service, resources: (data.results || []).map((page) => ({ id: page.id, name: page.properties?.title?.title?.[0]?.plain_text || page.url || "Notion page", url: page.url || "" })) };
  }
  throw integrationError(service === "toggl-track" ? 409 : 404, service === "toggl-track" ? "integration_planned" : "integration_not_found", service === "toggl-track" ? "Toggl Track is planned for phase 2." : "Unknown integration.");
}

async function ensureNotionDatabase(env, uid, settings) {
  if (settings.notionDatabaseId && settings.notionDataSourceId) return settings;
  if (!settings.parentPageId) throw integrationError(400, "notion_parent_required", "Choose a Notion parent page first.");
  const created = await notionJson(env, uid, "https://api.notion.com/v1/databases", {
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
  });
  const dataSourceId = created.data_sources?.[0]?.id || created.initial_data_source?.id || "";
  if (!dataSourceId) throw integrationError(502, "notion_database_invalid", "Notion did not return a data source ID.");
  return { ...settings, notionDatabaseId: created.id, notionDataSourceId: dataSourceId, notionDatabaseUrl: created.url || "" };
}

export async function configureIntegration(env, identity, service, input) {
  const { uid } = normalizeIdentity(identity);
  const account = await getIntegrationAccount(env, uid, service);
  if (!account) throw integrationError(409, "integration_not_connected", `${service} is not connected.`);
  let settings = { ...account.settings, autoSync: Boolean(input.autoSync ?? account.settings.autoSync) };
  if (service === "google-calendar") settings.calendarIds = [...new Set((input.calendarIds || settings.calendarIds || []).map(String).filter(Boolean))].slice(0, 20);
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

function mapCalendarEvent(item, calendar) {
  const allDay = Boolean(item.start?.date);
  return {
    externalId: item.id,
    title: item.summary || "Google Calendar event",
    description: item.description || "",
    startAt: allDay ? `${item.start.date}T00:00:00` : item.start?.dateTime || "",
    endAt: allDay ? `${item.end?.date || item.start.date}T00:00:00` : item.end?.dateTime || item.start?.dateTime || "",
    allDay,
    calendarName: calendar.name,
    htmlUrl: item.htmlLink || "",
    status: item.status || "confirmed",
    payload: { updated: item.updated || "", recurringEventId: item.recurringEventId || "" },
  };
}

async function fetchCalendarRecords(env, uid, account) {
  const calendarIds = account.settings.calendarIds || [];
  if (!calendarIds.length) throw integrationError(409, "integration_configuration_required", "Choose at least one Google Calendar.");
  const resources = await listIntegrationResources(env, { uid }, "google-calendar");
  const byId = new Map(resources.resources.map((item) => [item.id, item]));
  const range = calendarRange();
  const result = [];
  for (const calendarId of calendarIds) {
    const events = [];
    let pageToken = "";
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("timeMin", range.from);
      url.searchParams.set("timeMax", range.to);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "true");
      url.searchParams.set("maxResults", "2500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const data = await googleJson(env, uid, "google-calendar", url.toString());
      events.push(...(data.items || []).filter((item) => item.status !== "cancelled").map((item) => mapCalendarEvent(item, byId.get(calendarId) || { name: calendarId })));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    result.push({ calendarId, events });
  }
  return result;
}

function findGoogleTaskLink(task) {
  return (task.externalLinks || []).find((link) => link.service === "google-tasks" && link.type === "tasks.task");
}

function replaceTaskLink(task, link) {
  task.externalLinks = [...(task.externalLinks || []).filter((item) => !(item.service === link.service && item.externalId === link.externalId)), link].slice(-30);
}

function taskLink(remote, localUpdatedAt, overrides = {}) {
  return {
    service: "google-tasks", externalId: remote.id, type: "tasks.task", sourceType: "tasks.task", direction: "bidirectional",
    url: remote.webViewLink || "", syncedAt: new Date().toISOString(), remoteUpdatedAt: remote.updated || "", localUpdatedAt,
    remoteEtag: remote.etag || "", syncStatus: "synced", ...overrides,
  };
}

async function fetchGoogleTasks(env, uid, account) {
  const listId = account.settings.taskListId;
  if (!listId) throw integrationError(409, "integration_configuration_required", "Choose one Google Tasks list.");
  const items = [];
  let pageToken = "";
  do {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`);
    url.searchParams.set("showCompleted", "true");
    url.searchParams.set("showHidden", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await googleJson(env, uid, "google-tasks", url.toString());
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return items;
}

function remoteTaskPatch(task) {
  return { title: task.title, notes: task.notes || "", due: task.dueDate ? `${task.dueDate}T00:00:00.000Z` : null, status: task.done ? "completed" : "needsAction", ...(task.done ? { completed: task.completedAt || new Date().toISOString() } : {}) };
}

async function syncGoogleTasks(env, uid, sourceState, account, dryRun) {
  const state = dryRun ? structuredClone(sourceState) : sourceState;
  const remotes = await fetchGoogleTasks(env, uid, account);
  let created = 0; let updated = 0; let skipped = 0; let conflicts = 0;
  const preview = [];
  for (const remote of remotes) {
    const existing = state.tasks.find((task) => findGoogleTaskLink(task)?.externalId === remote.id);
    if (remote.deleted) {
      if (existing) {
        const link = findGoogleTaskLink(existing);
        replaceTaskLink(existing, { ...link, syncStatus: "remote_missing", syncedAt: new Date().toISOString() });
        existing.updatedAt = new Date().toISOString();
        conflicts += 1;
        preview.push({ action: "conflict", title: existing.title, reason: "Google task was deleted; QuestForge kept it." });
      } else skipped += 1;
      continue;
    }
    if (!existing) {
      const quest = createQuest(state, { kind: "todo", title: remote.title || "Google Task", notes: remote.notes || "", dueDate: (remote.due || "").slice(0, 10), difficulty: "easy", tags: ["google-tasks"] }, { source: "google-tasks" });
      if (remote.status === "completed") patchQuest(state, quest.id, { lifecycleState: "completed" }, { source: "google-tasks", countRollover: false });
      const task = state.tasks.find((item) => item.id === quest.id);
      replaceTaskLink(task, taskLink(remote, task.updatedAt));
      created += 1;
      preview.push({ action: "create", title: task.title, dueDate: task.dueDate, sourceType: "tasks.task" });
      continue;
    }
    const link = findGoogleTaskLink(existing);
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
        const result = await googleJson(env, uid, "google-tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(account.settings.taskListId)}/tasks/${encodeURIComponent(remote.id)}`, { method: "PATCH", headers: link.remoteEtag ? { "if-match": link.remoteEtag } : {}, body: JSON.stringify(remoteTaskPatch(existing)) });
        replaceTaskLink(existing, taskLink(result, existing.updatedAt));
      }
      updated += 1;
      preview.push({ action: "export", title: existing.title, sourceType: "tasks.task" });
      continue;
    }
    if (remoteChanged || !link.remoteUpdatedAt) {
      patchQuest(state, existing.id, { title: remote.title || existing.title, notes: remote.notes || "", dueDate: (remote.due || "").slice(0, 10), lifecycleState: remote.status === "completed" ? "completed" : "active" }, { source: "google-tasks", countRollover: false });
      const changed = state.tasks.find((task) => task.id === existing.id);
      replaceTaskLink(changed, taskLink(remote, changed.updatedAt));
      updated += 1;
      preview.push({ action: "import", title: changed.title, sourceType: "tasks.task" });
    } else skipped += 1;
  }
  touch(state);
  return { state, created, updated, skipped, conflicts, preview: preview.slice(0, 50) };
}

function dailyLog(state, date) {
  const completed = (state.tasks || []).filter((task) => (task.completedAt || task.lastCompletedDate || "").slice(0, 10) === date);
  const review = (state.dailyReviews || []).find((item) => item.date === date)?.review || completed.map((task) => task.title).join(" / ").slice(0, 1800);
  return {
    date,
    title: `QuestForge ${date}`,
    completed: completed.length,
    xp: Number(state.character?.xp || 0), gem: Number(state.character?.gems || 0), mp: Number(state.battle?.mp || 0),
    focusMinutes: completed.reduce((sum, task) => sum + Number(task.actualMinutes || task.manualActualMinutes || 0), 0),
    review,
  };
}

async function findNotionLog(env, uid, dataSourceId, date) {
  const data = await notionJson(env, uid, `https://api.notion.com/v1/data_sources/${encodeURIComponent(dataSourceId)}/query`, { method: "POST", body: JSON.stringify({ filter: { property: "Date", date: { equals: date } }, page_size: 2 }) });
  return data.results?.[0] || null;
}

function notionProperties(log) {
  return {
    Title: { title: [{ type: "text", text: { content: log.title } }] }, Date: { date: { start: log.date } }, Completed: { number: log.completed },
    XP: { number: log.xp }, Gem: { number: log.gem }, MP: { number: log.mp }, "Focus Minutes": { number: log.focusMinutes },
    Review: { rich_text: log.review ? [{ type: "text", text: { content: log.review.slice(0, 2000) } }] : [] },
  };
}

async function syncNotion(env, uid, state, account, dryRun) {
  if (!account.settings.notionDataSourceId) throw integrationError(409, "integration_configuration_required", "Create the QuestForge Logs database first.");
  const date = new Date().toISOString().slice(0, 10);
  const log = dailyLog(state, date);
  const existing = await findNotionLog(env, uid, account.settings.notionDataSourceId, date);
  if (!dryRun) {
    if (existing) await notionJson(env, uid, `https://api.notion.com/v1/pages/${encodeURIComponent(existing.id)}`, { method: "PATCH", body: JSON.stringify({ properties: notionProperties(log) }) });
    else await notionJson(env, uid, "https://api.notion.com/v1/pages", { method: "POST", body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: account.settings.notionDataSourceId }, properties: notionProperties(log) }) });
  }
  return { created: existing ? 0 : 1, updated: existing ? 1 : 0, skipped: 0, conflicts: 0, preview: [{ action: existing ? "update" : "create", title: log.title, ...log }] };
}

export async function syncIntegration(env, identity, state, service, direction, dryRun = true) {
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
    let result;
    if (service === "google-calendar") {
      const groups = await fetchCalendarRecords(env, uid, account);
      const records = groups.flatMap((group) => group.events);
      if (!dryRun) for (const group of groups) await replaceCalendarEvents(env, uid, service, group.calendarId, group.events);
      result = { created: records.length, updated: 0, skipped: 0, conflicts: 0, preview: records.slice(0, 50).map((event) => ({ action: "schedule", ...event })) };
    } else if (service === "google-tasks") {
      result = await syncGoogleTasks(env, uid, state, account, dryRun);
      if (!dryRun && result.state !== state) Object.assign(state, result.state);
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
  } catch (error) {
    if (!dryRun) {
      await saveIntegrationAccount(env, uid, service, { lastError: error.message, status: error.code === "reconnect_required" ? "reconnect_required" : account.status });
      await addIntegrationLog(env, uid, service, { direction, status: "failed", message: error.message });
    }
    throw error;
  } finally {
    if (!dryRun) await releaseIntegrationLock(env, uid, service);
  }
}

export async function calendarSchedule(env, identity, date) {
  const { uid } = normalizeIdentity(identity);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : new Date().toISOString().slice(0, 10);
  return { date: day, events: await listCalendarEvents(env, uid, `${day}T00:00:00`, `${day}T23:59:59.999`) };
}

export async function convertCalendarEvent(env, identity, state, externalId) {
  const schedule = await calendarSchedule(env, identity, new Date().toISOString().slice(0, 10));
  const event = schedule.events.find((item) => item.externalId === externalId);
  if (!event) throw integrationError(404, "calendar_event_not_found", "Calendar event is not available in today's schedule cache.");
  const startDate = event.startAt.slice(0, 10);
  const quest = createQuest(state, { kind: "todo", title: event.title, notes: event.description, category: "Calendar", planningState: "scheduled", planningMode: "on_date", scheduledDate: startDate, scheduledTime: event.allDay ? "" : event.startAt.slice(11, 16), dueDate: startDate, difficulty: "easy", tags: ["google-calendar"] }, { source: "google-calendar" });
  return linkExternalRecord(state, quest.id, { service: "google-calendar", externalId: event.externalId, type: "calendar.event", url: event.htmlUrl, direction: "import" }, { source: "google-calendar" });
}

export async function exportQuestToGoogleTasks(env, identity, state, questId) {
  const { uid } = normalizeIdentity(identity);
  const account = await getIntegrationAccount(env, uid, "google-tasks");
  if (!account?.settings.taskListId) throw integrationError(409, "integration_configuration_required", "Choose one Google Tasks list first.");
  const task = state.tasks.find((item) => item.id === questId);
  if (!task || task.kind !== "todo") throw integrationError(404, "quest_not_found", "A To Do quest is required.");
  if (findGoogleTaskLink(task)) throw integrationError(409, "quest_already_linked", "This quest is already linked to Google Tasks.");
  const remote = await googleJson(env, uid, "google-tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(account.settings.taskListId)}/tasks`, { method: "POST", body: JSON.stringify(remoteTaskPatch(task)) });
  task.updatedAt = new Date().toISOString();
  replaceTaskLink(task, taskLink(remote, task.updatedAt));
  touch(state);
  return { quest: task, external: { id: remote.id, updated: remote.updated || "" } };
}

export async function resolveGoogleTaskConflict(env, identity, state, questId, strategy) {
  const { uid } = normalizeIdentity(identity);
  if (!["local", "remote"].includes(strategy)) throw integrationError(400, "invalid_conflict_strategy", "Choose local or remote.");
  const account = await getIntegrationAccount(env, uid, "google-tasks");
  if (!account?.settings.taskListId) throw integrationError(409, "integration_configuration_required", "Choose one Google Tasks list first.");
  const task = state.tasks.find((item) => item.id === questId);
  const link = task && findGoogleTaskLink(task);
  if (!task || !link) throw integrationError(404, "linked_quest_not_found", "A Google Tasks linked quest is required.");
  const baseUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(account.settings.taskListId)}/tasks`;

  if (strategy === "local") {
    const remote = link.syncStatus === "remote_missing"
      ? await googleJson(env, uid, "google-tasks", baseUrl, { method: "POST", body: JSON.stringify(remoteTaskPatch(task)) })
      : await googleJson(env, uid, "google-tasks", `${baseUrl}/${encodeURIComponent(link.externalId)}`, { method: "PATCH", body: JSON.stringify(remoteTaskPatch(task)) });
    task.externalLinks = (task.externalLinks || []).filter((item) => item.service !== "google-tasks");
    replaceTaskLink(task, taskLink(remote, task.updatedAt));
  } else {
    const remote = await googleJson(env, uid, "google-tasks", `${baseUrl}/${encodeURIComponent(link.externalId)}`);
    if (remote.deleted) throw integrationError(409, "remote_task_missing", "The Google task no longer exists. Choose QuestForge to recreate it.");
    patchQuest(state, task.id, {
      title: remote.title || task.title,
      notes: remote.notes || "",
      dueDate: (remote.due || "").slice(0, 10),
      lifecycleState: remote.status === "completed" ? "completed" : "active",
    }, { source: "google-tasks", countRollover: false });
    const changed = state.tasks.find((item) => item.id === task.id);
    replaceTaskLink(changed, taskLink(remote, changed.updatedAt));
  }
  touch(state);
  return { quest: state.tasks.find((item) => item.id === questId), strategy };
}
