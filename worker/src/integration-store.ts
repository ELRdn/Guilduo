// @ts-nocheck
import { randomToken } from "./security.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const memoryAccounts = new Map();
const memoryEvents = new Map();
const memoryLogs = [];
const memoryFocusAttributions = new Map();
const memoryFocusTaskLinks = new Map();

function accountKey(uid, service) {
  return `${uid}:${service}`;
}

function focusAttributionKey(uid, entryId) {
  return `${uid}:toggl-focus:${entryId}`;
}

function focusTaskLinkKey(uid, questId) {
  return `${uid}:toggl-focus-task:${questId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function encodeBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(env) {
  const configured = String(env.INTEGRATION_TOKEN_KEY || "");
  let raw;
  if (configured) raw = decodeBase64(configured);
  else if (env.DEV_BEARER_TOKEN) raw = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(env.DEV_BEARER_TOKEN)));
  else throw Object.assign(new Error("Integration token encryption is not configured."), { status: 503, code: "integration_vault_unavailable" });
  if (raw.byteLength !== 32) throw Object.assign(new Error("INTEGRATION_TOKEN_KEY must decode to 32 bytes."), { status: 503, code: "integration_vault_invalid" });
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(env, value) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encoder.encode(value)));
  return `v1.${encodeBase64(iv)}.${encodeBase64(encrypted)}`;
}

export async function decryptSecret(env, value) {
  if (!value) return "";
  const [version, ivValue, encryptedValue] = String(value).split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw Object.assign(new Error("Stored integration token is invalid."), { status: 500, code: "integration_token_invalid" });
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(ivValue) }, await encryptionKey(env), decodeBase64(encryptedValue));
  return decoder.decode(decrypted);
}

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function normalizeAccount(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    service: row.service,
    status: row.status,
    tokenExpiresAt: Number(row.token_expires_at || row.tokenExpiresAt || 0),
    providerAccountId: row.provider_account_id || row.providerAccountId || "",
    providerAccountName: row.provider_account_name || row.providerAccountName || "",
    settings: parseJson(row.settings_json, row.settings || {}),
    cursor: parseJson(row.cursor_json, row.cursor || {}),
    lastSyncedAt: row.last_synced_at || row.lastSyncedAt || "",
    lastError: row.last_error || row.lastError || "",
    lockUntil: Number(row.lock_until || row.lockUntil || 0),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

export async function getIntegrationAccount(env, uid, service, { includeTokens = false } = {}) {
  let row;
  if (env.QUESTFORGE_DB) {
    row = await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE uid = ? AND service = ?").bind(uid, service).first();
  } else row = memoryAccounts.get(accountKey(uid, service));
  const account = normalizeAccount(row);
  if (!account || !includeTokens) return account;
  return {
    ...account,
    accessToken: await decryptSecret(env, row.access_token || row.accessToken),
    refreshToken: await decryptSecret(env, row.refresh_token || row.refreshToken),
  };
}

export async function listIntegrationAccounts(env, uid) {
  let rows;
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE uid = ? ORDER BY service").bind(uid).all()).results || [];
  } else rows = [...memoryAccounts.values()].filter((row) => row.uid === uid);
  return rows.map(normalizeAccount);
}

export async function saveIntegrationAccount(env, uid, service, patch) {
  const previousRaw = env.QUESTFORGE_DB
    ? await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE uid = ? AND service = ?").bind(uid, service).first()
    : memoryAccounts.get(accountKey(uid, service));
  const previous = normalizeAccount(previousRaw) || {};
  const createdAt = previous.createdAt || nowIso();
  const updatedAt = nowIso();
  const row = {
    uid,
    service,
    status: patch.status || previous.status || "connected",
    access_token: patch.accessToken !== undefined ? await encryptSecret(env, patch.accessToken) : previousRaw?.access_token || previousRaw?.accessToken || null,
    refresh_token: patch.refreshToken !== undefined ? await encryptSecret(env, patch.refreshToken) : previousRaw?.refresh_token || previousRaw?.refreshToken || null,
    token_expires_at: patch.tokenExpiresAt ?? previous.tokenExpiresAt ?? 0,
    provider_account_id: patch.providerAccountId ?? previous.providerAccountId ?? "",
    provider_account_name: patch.providerAccountName ?? previous.providerAccountName ?? "",
    settings_json: JSON.stringify(patch.settings ?? previous.settings ?? {}),
    cursor_json: JSON.stringify(patch.cursor ?? previous.cursor ?? {}),
    last_synced_at: patch.lastSyncedAt ?? previous.lastSyncedAt ?? "",
    last_error: patch.lastError ?? previous.lastError ?? "",
    lock_until: patch.lockUntil ?? previous.lockUntil ?? 0,
    created_at: createdAt,
    updated_at: updatedAt,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO integration_accounts
      (uid, service, status, access_token, refresh_token, token_expires_at, provider_account_id, provider_account_name, settings_json, cursor_json, last_synced_at, last_error, lock_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, service) DO UPDATE SET status=excluded.status, access_token=excluded.access_token, refresh_token=excluded.refresh_token,
      token_expires_at=excluded.token_expires_at, provider_account_id=excluded.provider_account_id, provider_account_name=excluded.provider_account_name,
      settings_json=excluded.settings_json, cursor_json=excluded.cursor_json, last_synced_at=excluded.last_synced_at,
      last_error=excluded.last_error, lock_until=excluded.lock_until, updated_at=excluded.updated_at`)
      .bind(uid, service, row.status, row.access_token, row.refresh_token, row.token_expires_at, row.provider_account_id, row.provider_account_name,
        row.settings_json, row.cursor_json, row.last_synced_at, row.last_error, row.lock_until, row.created_at, row.updated_at).run();
  } else memoryAccounts.set(accountKey(uid, service), row);
  return normalizeAccount(row);
}

export async function deleteIntegrationAccount(env, uid, service) {
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.batch([
      env.QUESTFORGE_DB.prepare("DELETE FROM integration_accounts WHERE uid = ? AND service = ?").bind(uid, service),
      env.QUESTFORGE_DB.prepare("DELETE FROM integration_calendar_events WHERE uid = ? AND service = ?").bind(uid, service),
    ]);
  } else {
    memoryAccounts.delete(accountKey(uid, service));
    for (const key of memoryEvents.keys()) if (key.startsWith(`${uid}:${service}:`)) memoryEvents.delete(key);
  }
}

export async function acquireIntegrationLock(env, uid, service, ttlSeconds = 120) {
  const now = Date.now();
  const account = await getIntegrationAccount(env, uid, service);
  if (!account || account.lockUntil > now) return false;
  if (env.QUESTFORGE_DB) {
    const result = await env.QUESTFORGE_DB.prepare("UPDATE integration_accounts SET lock_until = ? WHERE uid = ? AND service = ? AND lock_until < ?")
      .bind(now + ttlSeconds * 1000, uid, service, now).run();
    return Number(result.meta?.changes || 0) === 1;
  }
  await saveIntegrationAccount(env, uid, service, { lockUntil: now + ttlSeconds * 1000 });
  return true;
}

export async function releaseIntegrationLock(env, uid, service) {
  if (await getIntegrationAccount(env, uid, service)) await saveIntegrationAccount(env, uid, service, { lockUntil: 0 });
}

export async function listDueIntegrationAccounts(env, limit = 20) {
  if (env.QUESTFORGE_DB) {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_accounts WHERE status = 'connected' AND json_extract(settings_json, '$.autoSync') = 1 AND (last_synced_at = '' OR last_synced_at < ?) ORDER BY last_synced_at LIMIT ?")
      .bind(cutoff, limit).all()).results || [];
    return rows.map(normalizeAccount);
  }
  return [...memoryAccounts.values()].map(normalizeAccount).filter((account) => account.status === "connected" && account.settings.autoSync).slice(0, limit);
}

export async function replaceCalendarEvents(env, uid, service, calendarId, events) {
  const updatedAt = nowIso();
  if (env.QUESTFORGE_DB) {
    const statements = [env.QUESTFORGE_DB.prepare("DELETE FROM integration_calendar_events WHERE uid = ? AND service = ? AND calendar_id = ?").bind(uid, service, calendarId)];
    events.forEach((event) => statements.push(env.QUESTFORGE_DB.prepare(`INSERT INTO integration_calendar_events
      (uid, service, external_id, calendar_id, title, description, start_at, end_at, all_day, calendar_name, html_url, status, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid, service, event.externalId, calendarId, event.title, event.description || "", event.startAt, event.endAt,
        event.allDay ? 1 : 0, event.calendarName || "", event.htmlUrl || "", event.status || "confirmed", JSON.stringify(event.payload || {}), updatedAt)));
    await env.QUESTFORGE_DB.batch(statements);
  } else {
    for (const key of memoryEvents.keys()) if (key.startsWith(`${uid}:${service}:`) && memoryEvents.get(key).calendarId === calendarId) memoryEvents.delete(key);
    events.forEach((event) => memoryEvents.set(`${uid}:${service}:${event.externalId}`, { ...event, uid, service, calendarId, updatedAt }));
  }
}

export async function listCalendarEvents(env, uid, from, to) {
  let rows;
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM integration_calendar_events WHERE uid = ? AND end_at >= ? AND start_at <= ? ORDER BY start_at")
      .bind(uid, from, to).all()).results || [];
  } else rows = [...memoryEvents.values()].filter((event) => event.uid === uid && event.endAt >= from && event.startAt <= to).sort((a, b) => a.startAt.localeCompare(b.startAt));
  return rows.map((row) => ({
    externalId: row.external_id || row.externalId,
    calendarId: row.calendar_id || row.calendarId,
    title: row.title,
    description: row.description || "",
    startAt: row.start_at || row.startAt,
    endAt: row.end_at || row.endAt,
    allDay: Boolean(row.all_day ?? row.allDay),
    calendarName: row.calendar_name || row.calendarName || "",
    htmlUrl: row.html_url || row.htmlUrl || "",
    status: row.status || "confirmed",
  }));
}

function normalizeFocusAttribution(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    entryId: String(row.entry_id || row.entryId || ""),
    questId: String(row.quest_id || row.questId || ""),
    focusTaskId: String(row.focus_task_id || row.focusTaskId || ""),
    durationMinutes: Number(row.duration_minutes ?? row.durationMinutes ?? 0),
    source: row.source || "direct",
    status: row.status || "confirmed",
    entryUpdatedAt: row.entry_updated_at || row.entryUpdatedAt || "",
    entryStartAt: row.entry_start_at || row.entryStartAt || "",
    entryStopAt: row.entry_stop_at || row.entryStopAt || "",
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

export async function getTogglFocusAttribution(env, uid, entryId) {
  let row;
  if (env.QUESTFORGE_DB) {
    row = await env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_attributions WHERE uid = ? AND entry_id = ?").bind(uid, String(entryId)).first();
  } else row = memoryFocusAttributions.get(focusAttributionKey(uid, entryId));
  return normalizeFocusAttribution(row);
}

export async function listTogglFocusAttributions(env, uid, { questId = "" } = {}) {
  let rows;
  if (env.QUESTFORGE_DB) {
    const query = questId
      ? env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_attributions WHERE uid = ? AND quest_id = ? ORDER BY entry_start_at DESC").bind(uid, String(questId))
      : env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_attributions WHERE uid = ? ORDER BY entry_start_at DESC").bind(uid);
    rows = (await query.all()).results || [];
  } else {
    rows = [...memoryFocusAttributions.values()].filter((row) => row.uid === uid && (!questId || row.quest_id === String(questId)));
  }
  return rows.map(normalizeFocusAttribution);
}

export async function saveTogglFocusAttribution(env, uid, value) {
  const entryId = String(value.entryId || "").trim();
  const questId = String(value.questId || "").trim();
  if (!entryId || !questId) throw Object.assign(new Error("Focus time entry and Quest are required."), { status: 400, code: "invalid_focus_attribution" });
  const previous = await getTogglFocusAttribution(env, uid, entryId);
  if (previous && previous.questId !== questId) {
    throw Object.assign(new Error("This Focus time entry is already attributed to another Quest."), { status: 409, code: "time_entry_already_attributed", details: { entryId, questId: previous.questId } });
  }
  const now = nowIso();
  const row = {
    uid,
    entry_id: entryId,
    quest_id: questId,
    focus_task_id: String(value.focusTaskId || ""),
    duration_minutes: Math.max(0, Math.round(Number(value.durationMinutes || 0))),
    source: String(value.source || "direct").slice(0, 40),
    status: "confirmed",
    entry_updated_at: String(value.entryUpdatedAt || ""),
    entry_start_at: String(value.entryStartAt || ""),
    entry_stop_at: String(value.entryStopAt || ""),
    created_at: previous?.createdAt || now,
    updated_at: now,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO toggl_focus_attributions
      (uid, entry_id, quest_id, focus_task_id, duration_minutes, source, status, entry_updated_at, entry_start_at, entry_stop_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, entry_id) DO UPDATE SET quest_id=excluded.quest_id, focus_task_id=excluded.focus_task_id,
      duration_minutes=excluded.duration_minutes, source=excluded.source, status=excluded.status, entry_updated_at=excluded.entry_updated_at,
      entry_start_at=excluded.entry_start_at, entry_stop_at=excluded.entry_stop_at, updated_at=excluded.updated_at`)
      .bind(row.uid, row.entry_id, row.quest_id, row.focus_task_id, row.duration_minutes, row.source, row.status, row.entry_updated_at, row.entry_start_at, row.entry_stop_at, row.created_at, row.updated_at).run();
  } else memoryFocusAttributions.set(focusAttributionKey(uid, entryId), row);
  return normalizeFocusAttribution(row);
}

export async function purgeTogglFocusAttributions(env, uid) {
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("DELETE FROM toggl_focus_attributions WHERE uid = ?").bind(uid).run();
  } else {
    for (const key of memoryFocusAttributions.keys()) if (key.startsWith(`${uid}:toggl-focus:`)) memoryFocusAttributions.delete(key);
  }
}

export async function deleteTogglFocusAttribution(env, uid, entryId) {
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("DELETE FROM toggl_focus_attributions WHERE uid = ? AND entry_id = ?").bind(uid, String(entryId)).run();
  } else memoryFocusAttributions.delete(focusAttributionKey(uid, entryId));
}

function normalizeFocusTaskLink(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    questId: String(row.quest_id || row.questId || ""),
    focusTaskId: String(row.focus_task_id || row.focusTaskId || ""),
    organizationId: String(row.organization_id || row.organizationId || ""),
    workspaceId: String(row.workspace_id || row.workspaceId || ""),
    projectId: String(row.project_id || row.projectId || ""),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

export async function getTogglFocusTaskLink(env, uid, questId) {
  let row;
  if (env.QUESTFORGE_DB) {
    row = await env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_task_links WHERE uid = ? AND quest_id = ?").bind(uid, String(questId)).first();
  } else row = memoryFocusTaskLinks.get(focusTaskLinkKey(uid, questId));
  return normalizeFocusTaskLink(row);
}

export async function listTogglFocusTaskLinks(env, uid) {
  let rows;
  if (env.QUESTFORGE_DB) {
    rows = (await env.QUESTFORGE_DB.prepare("SELECT * FROM toggl_focus_task_links WHERE uid = ? ORDER BY updated_at DESC").bind(uid).all()).results || [];
  } else {
    rows = [...memoryFocusTaskLinks.values()].filter((row) => row.uid === uid);
  }
  return rows.map(normalizeFocusTaskLink);
}

export async function saveTogglFocusTaskLink(env, uid, value) {
  const questId = String(value.questId || "").trim();
  const focusTaskId = String(value.focusTaskId || "").trim();
  if (!questId || !focusTaskId) throw Object.assign(new Error("Focus task and Quest are required."), { status: 400, code: "invalid_focus_task_link" });
  const previous = await getTogglFocusTaskLink(env, uid, questId);
  const now = nowIso();
  const row = {
    uid,
    quest_id: questId,
    focus_task_id: focusTaskId,
    organization_id: String(value.organizationId || ""),
    workspace_id: String(value.workspaceId || ""),
    project_id: String(value.projectId || ""),
    created_at: previous?.createdAt || now,
    updated_at: now,
  };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO toggl_focus_task_links
      (uid, quest_id, focus_task_id, organization_id, workspace_id, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, quest_id) DO UPDATE SET focus_task_id=excluded.focus_task_id, organization_id=excluded.organization_id,
      workspace_id=excluded.workspace_id, project_id=excluded.project_id, updated_at=excluded.updated_at`)
      .bind(row.uid, row.quest_id, row.focus_task_id, row.organization_id, row.workspace_id, row.project_id, row.created_at, row.updated_at).run();
  } else memoryFocusTaskLinks.set(focusTaskLinkKey(uid, questId), row);
  return normalizeFocusTaskLink(row);
}

export async function purgeTogglFocusTaskLinks(env, uid) {
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare("DELETE FROM toggl_focus_task_links WHERE uid = ?").bind(uid).run();
  } else {
    for (const key of memoryFocusTaskLinks.keys()) if (key.startsWith(`${uid}:toggl-focus-task:`)) memoryFocusTaskLinks.delete(key);
  }
}

export async function addIntegrationLog(env, uid, service, value) {
  const log = { id: randomToken("sync"), uid, service, direction: value.direction || "import", status: value.status || "success", dryRun: Boolean(value.dryRun), created: value.created || 0, updated: value.updated || 0, skipped: value.skipped || 0, conflicts: value.conflicts || 0, message: value.message || "", createdAt: nowIso() };
  if (env.QUESTFORGE_DB) {
    await env.QUESTFORGE_DB.prepare(`INSERT INTO integration_sync_logs
      (id, uid, service, direction, status, dry_run, created_count, updated_count, skipped_count, conflict_count, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(log.id, uid, service, log.direction, log.status, log.dryRun ? 1 : 0, log.created, log.updated, log.skipped, log.conflicts, log.message, log.createdAt).run();
  } else memoryLogs.unshift(log);
  return log;
}
