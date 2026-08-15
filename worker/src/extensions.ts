// @ts-nocheck
import { createId } from "../../server/questforge-domain.ts";
import { getKv, randomToken } from "./security.ts";

const PERMISSIONS = new Set(["quests:read", "quests:write", "character:read", "rewards:write", "integrations:read", "integrations:sync", "events:read", "events:subscribe", "webhooks:manage", "ui:mount"]);
const EVENTS = new Set(["quest.created", "quest.updated", "quest.scored", "quest.failed", "quest.reopened", "quest.archived", "quest.external_linked", "quest.rolled_over", "integration.sync_completed", "integration.sync_failed", "reward.purchased"]);
const UI_SLOTS = new Set(["dashboard.sidecar", "quest.detail", "integration.settings"]);

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") errors.push("Manifest must be an object.");
  if (manifest?.manifestVersion !== "0.1") errors.push("manifestVersion must be 0.1.");
  if (!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(manifest?.id || "")) errors.push("id is invalid.");
  if (!String(manifest?.name || "").trim()) errors.push("name is required.");
  for (const permission of manifest?.permissions || []) if (!PERMISSIONS.has(permission)) errors.push(`Unknown permission: ${permission}`);
  for (const event of manifest?.events || []) if (!EVENTS.has(event)) errors.push(`Unknown event: ${event}`);
  for (const item of manifest?.uiSlots || []) {
    if (!UI_SLOTS.has(item.slot)) errors.push(`Unknown UI slot: ${item.slot}`);
    if (!String(item.entry || "").startsWith("https://")) errors.push(`UI entry for ${item.slot} must use HTTPS.`);
  }
  return { valid: errors.length === 0, errors };
}

export async function listPlugins(env, uid) {
  const kv = getKv(env); const result = await kv.list({ prefix: `plugin:${uid}:` });
  return Promise.all(result.keys.map((item) => kv.get(item.name, "json")));
}

export async function installPlugin(env, uid, manifest) {
  const validation = validateManifest(manifest);
  if (!validation.valid) { const error = new Error("Invalid plugin manifest"); error.status = 400; error.code = "invalid_manifest"; error.details = validation.errors; throw error; }
  const installed = { id: manifest.id, manifest, enabled: true, installedAt: new Date().toISOString() };
  await getKv(env).put(`plugin:${uid}:${manifest.id}`, JSON.stringify(installed));
  return installed;
}

export async function listWebhooks(env, uid) {
  const kv = getKv(env); const result = await kv.list({ prefix: `webhook:${uid}:` });
  const hooks = await Promise.all(result.keys.map((item) => kv.get(item.name, "json")));
  return hooks.map(({ secret, ...hook }) => hook);
}

export async function createWebhook(env, uid, input) {
  const url = String(input?.url || "");
  if (!url.startsWith("https://")) { const error = new Error("Webhook URL must use HTTPS."); error.status = 400; error.code = "invalid_webhook_url"; throw error; }
  const events = (input.events || []).filter((event) => EVENTS.has(event));
  if (!events.length) { const error = new Error("At least one supported event is required."); error.status = 400; error.code = "invalid_webhook_events"; throw error; }
  const secret = randomToken("whsec");
  const hook = { id: createId("wh"), url, events, enabled: true, secret, createdAt: new Date().toISOString(), failures: 0 };
  await getKv(env).put(`webhook:${uid}:${hook.id}`, JSON.stringify(hook));
  return { ...hook, secret };
}

export async function deleteWebhook(env, uid, id) {
  await getKv(env).delete(`webhook:${uid}:${id}`);
}

async function signature(secret, timestamp, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deliverEvent(env, uid, event) {
  const kv = getKv(env); const hooks = await listRawWebhooks(env, uid);
  const deliveries = [];
  for (const hook of hooks.filter((item) => item.enabled && item.events.includes(event.type))) {
    const body = JSON.stringify(event); const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetch(hook.url, { method: "POST", headers: { "content-type": "application/json", "x-questforge-event": event.type, "x-questforge-delivery": event.id, "x-questforge-timestamp": timestamp, "x-questforge-signature": `v1=${await signature(hook.secret, timestamp, body)}` }, body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      hook.failures = 0; hook.lastDeliveredAt = new Date().toISOString();
      deliveries.push({ webhookId: hook.id, ok: true });
    } catch (error) {
      hook.failures = Number(hook.failures || 0) + 1; hook.lastError = String(error.message || error); hook.enabled = hook.failures < 10;
      const delivery = { id: createId("delivery"), uid, webhookId: hook.id, event, attempt: 1, nextAttemptAt: Date.now() + 60000, createdAt: Date.now() };
      await kv.put(`delivery:${uid}:${delivery.id}`, JSON.stringify(delivery), { expirationTtl: 86400 });
      deliveries.push({ webhookId: hook.id, ok: false, error: hook.lastError });
    }
    await kv.put(`webhook:${uid}:${hook.id}`, JSON.stringify(hook));
  }
  return deliveries;
}

async function listRawWebhooks(env, uid) {
  const kv = getKv(env); const result = await kv.list({ prefix: `webhook:${uid}:` });
  return Promise.all(result.keys.map((item) => kv.get(item.name, "json")));
}

export async function retryDeliveries(env) {
  const kv = getKv(env); const result = await kv.list({ prefix: "delivery:" });
  for (const key of result.keys) {
    const delivery = await kv.get(key.name, "json");
    if (!delivery || delivery.nextAttemptAt > Date.now()) continue;
    await kv.delete(key.name);
    await deliverEvent(env, delivery.uid, delivery.event);
  }
}
