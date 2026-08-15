import { createId } from "../../server/questforge-domain.ts";
import { getKv, randomToken } from "./security.ts";
import type { WorkerEnv, WorkerError } from "./worker-types.ts";

const PERMISSIONS = new Set(["quests:read", "quests:write", "character:read", "rewards:write", "integrations:read", "integrations:sync", "events:read", "events:subscribe", "webhooks:manage", "ui:mount"]);
const EVENTS = new Set(["quest.created", "quest.updated", "quest.scored", "quest.failed", "quest.reopened", "quest.archived", "quest.external_linked", "quest.rolled_over", "integration.sync_completed", "integration.sync_failed", "reward.purchased"]);
const UI_SLOTS = new Set(["dashboard.sidecar", "quest.detail", "integration.settings"]);

type PluginManifest = {
  manifestVersion?: string;
  id?: string;
  name?: string;
  permissions?: string[];
  events?: string[];
  uiSlots?: Array<{ slot?: string; entry?: string }>;
  [key: string]: unknown;
};

type WebhookRecord = {
  id: string;
  uid?: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret: string;
  failures: number;
  lastDeliveredAt?: string;
  lastError?: string;
  [key: string]: unknown;
};

export type WebhookEvent = {
  id: string;
  type: string;
  [key: string]: unknown;
};

function asPluginManifest(value: unknown): PluginManifest {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PluginManifest : {};
}

function asWebhook(value: unknown): WebhookRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.url !== "string" || !Array.isArray(item.events)) return null;
  return {
    ...item,
    id: item.id,
    uid: String(item.uid || ""),
    url: item.url,
    events: item.events.filter((event): event is string => typeof event === "string"),
    enabled: item.enabled !== false,
    secret: String(item.secret || ""),
    failures: Number(item.failures || 0),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function validateManifest(manifest: unknown) {
  const input = asPluginManifest(manifest);
  const errors: string[] = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) errors.push("Manifest must be an object.");
  if (input.manifestVersion !== "0.1") errors.push("manifestVersion must be 0.1.");
  if (!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(input.id || "")) errors.push("id is invalid.");
  if (!String(input.name || "").trim()) errors.push("name is required.");
  for (const permission of input.permissions || []) if (!PERMISSIONS.has(permission)) errors.push(`Unknown permission: ${permission}`);
  for (const event of input.events || []) if (!EVENTS.has(event)) errors.push(`Unknown event: ${event}`);
  for (const item of input.uiSlots || []) {
    if (!UI_SLOTS.has(item.slot || "")) errors.push(`Unknown UI slot: ${item.slot}`);
    if (!String(item.entry || "").startsWith("https://")) errors.push(`UI entry for ${item.slot} must use HTTPS.`);
  }
  return { valid: errors.length === 0, errors };
}

export async function listPlugins(env: WorkerEnv, uid: string): Promise<unknown[]> {
  const kv = getKv(env); const result = await kv.list({ prefix: `plugin:${uid}:` });
  return Promise.all(result.keys.map((item: { name: string }) => kv.get(item.name, "json")));
}

export async function installPlugin(env: WorkerEnv, uid: string, manifest: unknown) {
  const input = asPluginManifest(manifest);
  const validation = validateManifest(manifest);
  if (!validation.valid) { const error = Object.assign(new Error("Invalid plugin manifest"), { status: 400, code: "invalid_manifest", details: validation.errors }) as WorkerError; throw error; }
  const installed = { id: String(input.id || ""), manifest: input, enabled: true, installedAt: new Date().toISOString() };
  await getKv(env).put(`plugin:${uid}:${installed.id}`, JSON.stringify(installed));
  return installed;
}

export async function listWebhooks(env: WorkerEnv, uid: string): Promise<unknown[]> {
  const kv = getKv(env); const result = await kv.list({ prefix: `webhook:${uid}:` });
  const hooks = await Promise.all(result.keys.map((item: { name: string }) => kv.get(item.name, "json")));
  return hooks.filter((hook): hook is WebhookRecord => Boolean(hook)).map(({ secret: _secret, ...hook }) => hook);
}

export async function createWebhook(env: WorkerEnv, uid: string, input: { url?: string; events?: string[] }): Promise<WebhookRecord> {
  const url = String(input?.url || "");
  if (!url.startsWith("https://")) { const error = Object.assign(new Error("Webhook URL must use HTTPS."), { status: 400, code: "invalid_webhook_url" }) as WorkerError; throw error; }
  const events = (input.events || []).filter((event) => EVENTS.has(event));
  if (!events.length) { const error = Object.assign(new Error("At least one supported event is required."), { status: 400, code: "invalid_webhook_events" }) as WorkerError; throw error; }
  const secret = randomToken("whsec");
  const hook = { id: createId("wh"), url, events, enabled: true, secret, createdAt: new Date().toISOString(), failures: 0 };
  await getKv(env).put(`webhook:${uid}:${hook.id}`, JSON.stringify(hook));
  return { ...hook, secret };
}

export async function deleteWebhook(env: WorkerEnv, uid: string, id: string): Promise<void> {
  await getKv(env).delete(`webhook:${uid}:${id}`);
}

async function signature(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deliverEvent(env: WorkerEnv, uid: string, event: WebhookEvent): Promise<Array<{ webhookId: string; ok: boolean; error?: string }>> {
  const kv = getKv(env); const hooks = await listRawWebhooks(env, uid);
  const deliveries: Array<{ webhookId: string; ok: boolean; error?: string }> = [];
  for (const hook of hooks.filter((item): item is WebhookRecord => Boolean(item)).filter((item) => item.enabled && item.events.includes(event.type))) {
    const body = JSON.stringify(event); const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetch(hook.url, { method: "POST", headers: { "content-type": "application/json", "x-questforge-event": event.type, "x-questforge-delivery": event.id, "x-questforge-timestamp": timestamp, "x-questforge-signature": `v1=${await signature(hook.secret, timestamp, body)}` }, body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      hook.failures = 0; hook.lastDeliveredAt = new Date().toISOString();
      deliveries.push({ webhookId: hook.id, ok: true });
    } catch (error: unknown) {
      hook.failures = Number(hook.failures || 0) + 1; hook.lastError = errorMessage(error); hook.enabled = hook.failures < 10;
      const delivery = { id: createId("delivery"), uid, webhookId: hook.id, event, attempt: 1, nextAttemptAt: Date.now() + 60000, createdAt: Date.now() };
      await kv.put(`delivery:${uid}:${delivery.id}`, JSON.stringify(delivery), { expirationTtl: 86400 });
      deliveries.push({ webhookId: hook.id, ok: false, error: hook.lastError });
    }
    await kv.put(`webhook:${uid}:${hook.id}`, JSON.stringify(hook));
  }
  return deliveries;
}

async function listRawWebhooks(env: WorkerEnv, uid: string): Promise<WebhookRecord[]> {
  const kv = getKv(env); const result = await kv.list({ prefix: `webhook:${uid}:` });
  const values = await Promise.all(result.keys.map((item: { name: string }) => kv.get(item.name, "json")));
  return values.map(asWebhook).filter((hook): hook is WebhookRecord => Boolean(hook));
}

export async function retryDeliveries(env: WorkerEnv): Promise<void> {
  const kv = getKv(env); const result = await kv.list({ prefix: "delivery:" });
  for (const key of result.keys) {
    const delivery = await kv.get(key.name, "json");
    const item = delivery && typeof delivery === "object" && !Array.isArray(delivery) ? delivery as Record<string, unknown> : null;
    if (!item || Number(item.nextAttemptAt || 0) > Date.now()) continue;
    await kv.delete(key.name);
    const event = item.event && typeof item.event === "object" && !Array.isArray(item.event) ? item.event as WebhookEvent : null;
    if (event) await deliverEvent(env, String(item.uid || ""), event);
  }
}
