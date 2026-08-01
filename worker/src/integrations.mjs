import { createQuest, createId, touch } from "../../server/questforge-domain.mjs";

export const INTEGRATIONS = [
  { id: "google-calendar", name: "Google Calendar", auth: "OAuth 2.0", capabilities: ["import", "export", "watch"] },
  { id: "google-tasks", name: "Google Tasks", auth: "OAuth 2.0", capabilities: ["import", "export", "bidirectional"] },
  { id: "toggl-track", name: "Toggl Track", auth: "API token", capabilities: ["import", "timer_read", "timer_write"] },
  { id: "todoist", name: "Todoist", auth: "OAuth 2.0", capabilities: ["import", "export", "bidirectional", "webhooks"] },
  { id: "notion", name: "Notion", auth: "OAuth/Bearer", capabilities: ["import", "export"] },
  { id: "discord-slack", name: "Discord / Slack", auth: "Webhook/OAuth", capabilities: ["export"] },
];

function configured(env, id) {
  return {
    "google-calendar": Boolean(env.GOOGLE_ACCESS_TOKEN),
    "google-tasks": Boolean(env.GOOGLE_ACCESS_TOKEN),
    "toggl-track": Boolean(env.TOGGL_API_TOKEN),
    todoist: Boolean(env.TODOIST_ACCESS_TOKEN),
    notion: Boolean(env.NOTION_ACCESS_TOKEN && env.NOTION_DATABASE_ID),
    "discord-slack": Boolean(env.CHAT_WEBHOOK_URL),
  }[id];
}

export function listIntegrations(env) {
  return INTEGRATIONS.map((integration) => ({
    ...integration,
    status: configured(env, integration.id) ? "connected" : "not_connected",
  }));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`External service returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export async function fetchExternalRecords(env, service) {
  if (!configured(env, service)) {
    const error = new Error(`${service} credentials are not configured in Worker secrets.`);
    error.status = 409;
    error.code = "integration_not_configured";
    throw error;
  }
  if (service === "google-calendar") {
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "50");
    const data = await fetchJson(url, { headers: { authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` } });
    return (data.items || []).map((item) => ({
      service,
      externalId: item.id,
      sourceType: "calendar.event",
      title: item.summary || "Google Calendar event",
      notes: item.description || "",
      dueDate: (item.start?.date || item.start?.dateTime || "").slice(0, 10),
      tags: ["google-calendar"],
      mapTo: { kind: item.recurrence ? "daily" : "todo", repeat: item.recurrence ? "daily" : "none", difficulty: "easy" },
    }));
  }
  if (service === "google-tasks") {
    const data = await fetchJson("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&maxResults=100", { headers: { authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` } });
    return (data.items || []).map((item) => ({
      service, externalId: item.id, sourceType: "tasks.task", title: item.title, notes: item.notes || "",
      dueDate: (item.due || "").slice(0, 10), completed: item.status === "completed", tags: ["google-tasks"],
      mapTo: { kind: "todo", repeat: "none", difficulty: "easy" },
    }));
  }
  if (service === "toggl-track") {
    const auth = btoa(`${env.TOGGL_API_TOKEN}:api_token`);
    const data = await fetchJson("https://api.track.toggl.com/api/v9/me/time_entries", { headers: { authorization: `Basic ${auth}` } });
    return (data || []).filter((item) => item.duration > 0).map((item) => ({
      service, externalId: String(item.id), sourceType: "toggl.time_entry", title: item.description || "Toggl focus session",
      notes: `${Math.round(item.duration / 60)} minutes`, durationMinutes: Math.round(item.duration / 60),
      dueDate: (item.start || "").slice(0, 10), tags: ["toggl-track", ...(item.tags || [])],
      mapTo: { kind: "habit", repeat: "none", difficulty: item.duration >= 3600 ? "medium" : "easy" },
    }));
  }
  if (service === "todoist") {
    const data = await fetchJson("https://api.todoist.com/api/v1/tasks", { headers: { authorization: `Bearer ${env.TODOIST_ACCESS_TOKEN}` } });
    const items = Array.isArray(data) ? data : data.results || [];
    return items.map((item) => ({
      service, externalId: item.id, sourceType: "todoist.task", title: item.content, notes: item.description || "",
      dueDate: item.due?.date || "", tags: ["todoist", ...(item.labels || [])],
      mapTo: { kind: "todo", repeat: item.due?.is_recurring ? "daily" : "none", difficulty: "easy" },
    }));
  }
  if (service === "notion") return [];
  return [];
}

function findLinkedTask(state, service, externalId) {
  return state.tasks.find((task) => task.externalLinks?.some((link) => link.service === service && link.externalId === externalId));
}

export async function syncIntegration(env, state, service, direction, dryRun = true) {
  if (!INTEGRATIONS.some((item) => item.id === service)) {
    const error = new Error("Unknown integration"); error.status = 404; error.code = "integration_not_found"; throw error;
  }
  if (direction === "export" && service === "discord-slack") {
    const preview = { title: "QuestForge progress", completed: state.tasks.filter((task) => task.done).length };
    if (!dryRun) await fetchJson(env.CHAT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `QuestForge: ${preview.completed} quests completed.` }) });
    return { service, direction, dryRun, created: 0, updated: 0, skipped: 0, preview: [preview] };
  }
  if (direction === "export" && service === "notion") {
    const completed = state.tasks.filter((task) => task.done).slice(0, 20);
    if (!dryRun) {
      for (const task of completed) {
        await fetchJson("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { authorization: `Bearer ${env.NOTION_ACCESS_TOKEN}`, "content-type": "application/json", "notion-version": "2022-06-28" },
          body: JSON.stringify({ parent: { database_id: env.NOTION_DATABASE_ID }, properties: { Name: { title: [{ text: { content: task.title } }] } } }),
        });
      }
    }
    return { service, direction, dryRun, created: completed.length, updated: 0, skipped: 0, preview: completed };
  }

  const records = await fetchExternalRecords(env, service);
  if (dryRun) return { service, direction, dryRun, created: 0, updated: 0, skipped: 0, preview: records.slice(0, 25) };
  let created = 0; let updated = 0; let skipped = 0;
  for (const record of records) {
    const existing = findLinkedTask(state, service, record.externalId);
    if (existing) {
      existing.title = record.title;
      existing.notes = record.notes;
      existing.dueDate = record.dueDate || existing.dueDate;
      existing.done = record.completed ?? existing.done;
      existing.updatedAt = new Date().toISOString();
      updated += 1;
    } else {
      const quest = createQuest(state, { ...record.mapTo, title: record.title, notes: record.notes, dueDate: record.dueDate, tags: record.tags }, { source: service });
      quest.externalLinks = [{ service, externalId: record.externalId, sourceType: record.sourceType, direction, syncedAt: new Date().toISOString() }];
      created += 1;
    }
  }
  const syncEvent = { id: createId("sync"), integrationId: service, service, direction, created, updated, skipped, dryRun: false, at: new Date().toISOString(), createdAt: new Date().toISOString() };
  state.syncEvents = [syncEvent, ...(state.syncEvents || [])].slice(0, 50);
  touch(state);
  return { ...syncEvent, preview: records.slice(0, 25) };
}

