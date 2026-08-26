const CONSENT_KEY = "questforge-telemetry-consent";
const FIRST_QUEST_KEY = "questforge-telemetry-first-quest-sent";
const ALLOWED_CONSENTS = new Set(["unknown", "granted", "denied"]);
const ALLOWED_EVENTS = new Set([
  "web_vitals",
  "js_error",
  "sync_success",
  "sync_failure",
  "first_quest_complete",
  "mcp_connection_success",
  "agent_assignment_success",
]);

type TelemetryData = Record<string, unknown>;
type TelemetryEvent = TelemetryData & { name: string; surface: string; at: string };
type TelemetryListener = [string, TelemetryEventListener];
type MetricEntry = PerformanceEntry & { hadRecentInput?: boolean; value?: number };
type TelemetryEventListener = (...args: unknown[]) => void;
type ExtendedObserverInit = { type?: string; buffered?: boolean; durationThreshold?: number };
type TelemetryGlobal = {
  QuestForgeConfig?: QuestForgeRuntimeConfig;
  QuestForgeTelemetry?: Record<string, unknown>;
  location?: { origin?: string };
  navigator?: { sendBeacon?: (url: string, data?: unknown) => boolean };
  dispatchEvent?: (event: unknown) => boolean;
  addEventListener?: (type: string, listener: TelemetryEventListener) => void;
  removeEventListener?: (type: string, listener: TelemetryEventListener) => void;
  fetch?: typeof fetch;
  PerformanceObserver?: typeof PerformanceObserver;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

const runtimeGlobal = globalThis as unknown as TelemetryGlobal;

const telemetryState = {
  initialized: false,
  surface: "unknown",
  queue: [] as TelemetryEvent[],
  flushTimer: 0 as ReturnType<typeof setTimeout> | 0,
  lcp: 0,
  cls: 0,
  inp: 0,
  vitalTimer: 0 as ReturnType<typeof setTimeout> | 0,
  observers: [] as PerformanceObserver[],
  listeners: [] as TelemetryListener[],
};

function storageGet(key: string): string {
  try { return globalThis.localStorage?.getItem(key) || ""; } catch { return ""; }
}

function storageSet(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* Optional device storage. */ }
}

function configuredEndpoint() {
  const raw = runtimeGlobal.QuestForgeConfig?.telemetryEndpoint;
  if (!raw) return "";
  try {
    const url = new URL(String(raw), runtimeGlobal.location?.origin || "http://localhost");
    if (!(url.protocol === "https:" || (url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)))) return "";
    return url.href;
  } catch { return ""; }
}

export function getTelemetryConsent() {
  const value = storageGet(CONSENT_KEY);
  return ALLOWED_CONSENTS.has(value) ? value : "unknown";
}

export function setTelemetryConsent(value: string): string {
  const normalized = ALLOWED_CONSENTS.has(value) ? value : "unknown";
  storageSet(CONSENT_KEY, normalized);
  runtimeGlobal.dispatchEvent?.(new CustomEvent("questforge:telemetry-consent-changed", { detail: { consent: normalized } }));
  if (normalized === "granted") initializeTelemetry({ surface: telemetryState.surface });
  return normalized;
}

function safePayload(name: string, data: TelemetryData = {}): TelemetryData & { name: string; surface: string } {
  const payload: TelemetryData & { name: string; surface: string } = { name, surface: telemetryState.surface };
  for (const [key, value] of Object.entries(data || {})) {
    if (["lcp", "cls", "inp", "duration", "count"].includes(key) && Number.isFinite(Number(value))) payload[key] = Math.round(Number(value) * 100) / 100;
    if (["kind", "source", "status"].includes(key) && typeof value === "string" && value.length <= 40) payload[key] = value;
  }
  return payload;
}

function sendBatch() {
  telemetryState.flushTimer = 0;
  if (getTelemetryConsent() !== "granted" || !telemetryState.queue.length) return;
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    telemetryState.queue.length = 0;
    return;
  }
  const body = JSON.stringify({ schemaVersion: 1, events: telemetryState.queue.splice(0, 20) });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (runtimeGlobal.navigator?.sendBeacon?.(endpoint, blob)) return;
  } catch { /* Fall through to keepalive fetch. */ }
  globalThis.fetch?.(endpoint, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, credentials: "omit" }).catch(() => {});
}

function queueEvent(name: string, data: TelemetryData = {}): void {
  if (getTelemetryConsent() !== "granted" || !ALLOWED_EVENTS.has(name)) return;
  telemetryState.queue.push({ ...safePayload(name, data), at: new Date().toISOString() });
  if (!telemetryState.flushTimer) telemetryState.flushTimer = globalThis.setTimeout(sendBatch, 1500);
}

export function trackTelemetry(name: string, data: TelemetryData = {}): void {
  if (name === "first_quest_complete" && storageGet(FIRST_QUEST_KEY) === "1") return;
  if (name === "first_quest_complete") storageSet(FIRST_QUEST_KEY, "1");
  queueEvent(name, data);
}

function flushVitals() {
  if (!telemetryState.lcp && !telemetryState.cls && !telemetryState.inp) return;
  queueEvent("web_vitals", { lcp: telemetryState.lcp, cls: telemetryState.cls, inp: telemetryState.inp });
}

function observePerformance() {
  const Observer = globalThis.PerformanceObserver;
  if (!Observer) return;
  try {
    const lcp = new Observer((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) telemetryState.lcp = Number(last.startTime || 0);
    });
    lcp.observe({ type: "largest-contentful-paint", buffered: true } as unknown as Parameters<PerformanceObserver["observe"]>[0]);
    telemetryState.observers.push(lcp);
  } catch { /* Browser does not expose LCP. */ }
  try {
    const cls = new Observer((list) => {
      for (const entry of list.getEntries() as MetricEntry[]) if (!entry.hadRecentInput) telemetryState.cls += Number(entry.value || 0);
    });
    cls.observe({ type: "layout-shift", buffered: true } as unknown as Parameters<PerformanceObserver["observe"]>[0]);
    telemetryState.observers.push(cls);
  } catch { /* Browser does not expose layout shift. */ }
  try {
    const inp = new Observer((list) => {
      for (const entry of list.getEntries() as MetricEntry[]) telemetryState.inp = Math.max(telemetryState.inp, Number(entry.duration || 0));
    });
    inp.observe({ type: "event", buffered: true, durationThreshold: 40 } as unknown as Parameters<PerformanceObserver["observe"]>[0]);
    telemetryState.observers.push(inp);
  } catch { /* Browser does not expose event timing. */ }
}

export function initializeTelemetry({ surface = "unknown" }: { surface?: string } = {}): void {
  telemetryState.surface = String(surface || "unknown").slice(0, 24);
  if (telemetryState.initialized || getTelemetryConsent() !== "granted") return;
  telemetryState.initialized = true;
  observePerformance();
  const errorListener = () => queueEvent("js_error", { kind: "error" });
  const rejectionListener = () => queueEvent("js_error", { kind: "unhandled_rejection" });
  runtimeGlobal.addEventListener?.("error", errorListener);
  runtimeGlobal.addEventListener?.("unhandledrejection", rejectionListener);
  telemetryState.listeners.push(["error", errorListener], ["unhandledrejection", rejectionListener]);
  telemetryState.vitalTimer = globalThis.setTimeout(flushVitals, 5000);
}

export function resetTelemetryForTests() {
  for (const observer of telemetryState.observers) observer.disconnect?.();
  for (const [name, listener] of telemetryState.listeners) runtimeGlobal.removeEventListener?.(name, listener);
  if (telemetryState.flushTimer) globalThis.clearTimeout(telemetryState.flushTimer);
  if (telemetryState.vitalTimer) globalThis.clearTimeout(telemetryState.vitalTimer);
  telemetryState.initialized = false;
  telemetryState.observers = [];
  telemetryState.listeners = [];
  telemetryState.queue = [];
  telemetryState.flushTimer = 0;
  telemetryState.vitalTimer = 0;
}

runtimeGlobal.QuestForgeTelemetry = Object.freeze({
  getConsent: getTelemetryConsent,
  setConsent: setTelemetryConsent,
  initialize: initializeTelemetry,
  track: trackTelemetry,
});
