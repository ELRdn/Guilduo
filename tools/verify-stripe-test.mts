import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright-core";
import type { BillingConfig, BillingEnv, BillingStatus } from "../worker/src/billing-store.ts";

/** Parent/operator runs this, never CI automatically:
 * node --env-file=.dev.vars --import tsx tools/verify-stripe-test.mts [--execute]
 * Native Node loads secrets; STRIPE_SECRET_KEY must be sk_test_* or rk_test_*.
 * Credit settings below are isolated Test fixtures, NOT approved sale terms.
 * No screenshots, raw events, signatures, hosted URLs or secret output are saved.
 * CLI child overrides STRIPE_API_KEY (the user's value may be a publishable key).
 * An ambiguous external POST is journaled and NEVER retried automatically.
 * --fixture-subscriptions permits lifecycle-only fallback after blocked Hosted UI.
 * Hosted gates remain blocked; challenges are never bypassed. Overall exit stays nonzero.
 */
type RecordValue = Record<string, unknown>;
type StepState = "pending" | "running" | "pass" | "blocked" | "fail";
export const STRIPE_TEST_STEPS = ["setup", "monthly_checkout", "monthly_subscription", "referral_once", "webhook_signature_replay", "portal", "annual_checkout", "annual_checkout_reverse_order", "renewal", "payment_failure", "cancel_at_period_end", "expiry", "refund", "cleanup"] as const;
export const STRIPE_TEST_CREDITS = { monthlyCredits: 100, annualMonthlyCredits: 100, decisionCredits: 1, referralCredits: 25, creditLifetimeDays: 30 } as const;
const API = "https://api.stripe.com/v1";
const EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible", "charge.refunded", "refund.created", "refund.updated"].join(",");
export class AcceptanceFailure extends Error {
  constructor(readonly code: string, readonly blocked = false) { super(code); }
}
function record(value: unknown): RecordValue { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
function identifier(value: unknown): string { return typeof value === "string" ? value : typeof record(value).id === "string" ? record(value).id as string : ""; }
export function requireId(value: unknown, prefix: string): string {
  const id = identifier(value);
  const pattern = prefix === "cs" ? /^cs_test_[a-zA-Z0-9]+$/ : new RegExp(`^${prefix}_[a-zA-Z0-9]+$`);
  if (!pattern.test(id)) throw new AcceptanceFailure("stripe_object_invalid");
  return id;
}
export function requireTestSecret(value: unknown): string {
  if (typeof value !== "string" || !/^(?:sk|rk)_test_[a-zA-Z0-9_]+$/.test(value)) throw new AcceptanceFailure("stripe_test_secret_required");
  return value;
}
export function redactStripeOutput(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\b(?:(?:sk|rk|pk)_(?:test|live)_[a-zA-Z0-9_]+|whsec_[a-zA-Z0-9_]+|cs_test_[a-zA-Z0-9_]+)\b/g, "[redacted]")
    .replace(/https:\/\/(?:checkout|billing)\.stripe\.com\/\S+/g, "[hosted-url]")
    .replace(/(?:Bearer|Authorization[:=])\s+\S+/gi, "[authorization]");
}
export function safeFailure(error: unknown): { code: string; blocked: boolean } {
  return error instanceof AcceptanceFailure ? { code: error.code, blocked: error.blocked } : { code: "stripe_test_runner_failed", blocked: false };
}
export function parseTestPrices(value: unknown) {
  const source = record(value);
  if (source.mode !== "test" || !Array.isArray(source.prices)) throw new AcceptanceFailure("test_prices_invalid");
  const prices = source.prices.map(record);
  const match = (interval: "month" | "year", amount: number) => {
    const matches = prices.filter(price => price.livemode === false && price.currency === "usd" && price.amount === amount && record(price.recurring).interval === interval && record(price.recurring).interval_count === 1);
    if (matches.length !== 1) throw new AcceptanceFailure("test_prices_invalid");
    return requireId(matches[0].id, "price");
  };
  return { monthly: match("month", 1000), annual: match("year", 9600) };
}
export function invoicePaymentIntent(value: unknown): string {
  const list = record(value);
  if (!Array.isArray(list.data) || list.has_more !== false) throw new AcceptanceFailure("invoice_payment_ambiguous", true);
  const intents = [...new Set(list.data.map(record).filter(payment => payment.status === "paid" && record(payment.payment).type === "payment_intent")
    .map(payment => identifier(record(payment.payment).payment_intent)).filter(id => /^pi_[a-zA-Z0-9]+$/.test(id)))];
  if (intents.length !== 1) throw new AcceptanceFailure("invoice_payment_ambiguous", true);
  return intents[0];
}
export function signatureFresh(signature: string, nowMs = Date.now()): boolean {
  const timestamps = signature.split(",").filter(part => /^t=\d+$/.test(part));
  return timestamps.length === 1 && Math.abs(nowMs / 1000 - Number(timestamps[0].slice(2))) <= 300;
}
export function cliListenArguments(baseUrl: string, configPath: string): string[] {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new AcceptanceFailure("localhost_required");
  return ["listen", "--latest", "--events", EVENTS, "--forward-to", `${url.origin}/v1/billing/webhook`, "--config", configPath, "--skip-update"];
}
/** Only completed CLI messages are trusted. Never persist CLI output, even redacted fragments. */
export function listenerReadySecret(output: string): string | null {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const match = clean.match(/\bReady[^\r\n]*\b(whsec_[a-zA-Z0-9_]+)(?=[^a-zA-Z0-9_])/i);
  return match?.[1] || null;
}
export function canUseFixtureSubscription(explicit: boolean, error: unknown): boolean {
  const failure = safeFailure(error);
  return explicit && failure.blocked && /^checkout_(?:card_number_missing|card_expiry_missing|card_cvc_missing|submit_missing|navigation_requires_human|fields_requires_human|return_or_challenge_requires_human)$/.test(failure.code);
}
export function portalCleanupDisposition(value: unknown, runId: string): "deactivate" | "retain" {
  const portal = record(value);
  if (portal.livemode !== false || record(portal.metadata).guilduo_test_run !== runId || typeof portal.is_default !== "boolean") throw new AcceptanceFailure("cleanup_ownership_failed");
  return portal.is_default ? "retain" : "deactivate";
}
interface Resource { kind: "customer" | "clock" | "portal"; id: string; uid?: string; clockId?: string; cleanup: "pending" | "done" | "retained" | "fail" }
interface Operation { path: string; method: string; requestId: string; state: "pending" | "done" | "unknown" | "rejected"; httpStatus?: number; objectId?: string }
interface Evidence {
  schemaVersion: 1; runId: string; mode: "test"; execute: boolean; startedAt: string; updatedAt: string;
  status: "dry-run" | "running" | "pass" | "blocked" | "fail"; externalRequests: number;
  failure?: { code: string; blocked: boolean };
  provisionalCredits: typeof STRIPE_TEST_CREDITS; formalCreditTermsApproved: false;
  prices: { monthly: string; annual: string } | null; apiVersion: string | null;
  steps: Array<{ name: typeof STRIPE_TEST_STEPS[number]; status: StepState; code?: string; details?: RecordValue }>;
  operations: Operation[]; resources: Resource[]; events: Array<{ id: string; type: string; apiVersion: string; receivedAt: string; statuses: number[]; held: boolean }>;
  cli: { ready: boolean; unexpectedExit: boolean; sanitizedTail: string }; cleanupErrors: string[]; cleanupWarnings: string[];
}
function persist(path: string, evidence: Evidence) {
  evidence.updatedAt = new Date().toISOString();
  writeFileSync(`${path}.tmp`, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flush: true });
  renameSync(`${path}.tmp`, path);
}
interface Capture { id: string; type: string; raw: string; signature: string; customerId: string; receivedAt: number; created: number; evidence: Evidence["events"][number] }

async function fillHostedCheckout(page: Page): Promise<void> {
  // Stripe hosted fields may be inside Elements frames. Never capture page HTML/screenshots.
  const fill = async (selectors: string, value: string, required: boolean, field = "optional") => {
    for (const frame of page.frames()) {
      const input = frame.locator(selectors).first();
      if (await input.isVisible().catch(() => false)) { await input.fill(value, { timeout: 5000 }); return; }
    }
    if (required) throw new AcceptanceFailure(`checkout_${field}_missing`, true);
  };
  await fill('input[type="email"]', "guilduo-test@example.test", false);
  const cardMethod = page.getByText("Card", { exact: true }).first();
  if (await cardMethod.isVisible().catch(() => false)) await cardMethod.click();
  await fill('input[name="cardNumber"], #cardNumber, input[autocomplete="cc-number"]', "4242424242424242", true, "card_number");
  await fill('input[name="cardExpiry"], #cardExpiry, input[autocomplete="cc-exp"]', "1234", true, "card_expiry");
  await fill('input[name="cardCvc"], #cardCvc, input[autocomplete="cc-csc"]', "123", true, "card_cvc");
  await fill('input[name="billingName"], #billingName, input[autocomplete="cc-name"]', "Guilduo Test Only", false);
  await fill('input[name="billingPostalCode"], #billingPostalCode, input[autocomplete="postal-code"]', "10001", false);
  const terms = page.locator('input[name="termsOfServiceConsent"]');
  if (await terms.isVisible().catch(() => false)) await terms.check();
  const submit = page.locator('button[type="submit"]').filter({ hasText: /subscribe|pay|支払|登録/i }).first();
  if (!(await submit.isVisible())) throw new AcceptanceFailure("checkout_submit_missing", true);
  await submit.click({ timeout: 10_000 });
}

export async function runStripeTest(options: { execute?: boolean; fixtureSubscriptions?: boolean; root?: string; secret?: string; chromePath?: string; interactive?: boolean } = {}) {
  const root = resolve(options.root ?? process.cwd());
  const runId = `test-${new Date().toISOString().replace(/[^0-9]/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const directory = join(root, ".qa-artifacts", "stripe", "acceptance", runId);
  mkdirSync(directory, { recursive: true });
  const evidencePath = join(directory, "evidence.json");
  const evidence: Evidence = { schemaVersion: 1, runId, mode: "test", execute: options.execute === true, startedAt: new Date().toISOString(), updatedAt: "", status: options.execute ? "running" : "dry-run", externalRequests: 0,
    provisionalCredits: STRIPE_TEST_CREDITS, formalCreditTermsApproved: false, prices: null, apiVersion: null,
    steps: STRIPE_TEST_STEPS.map(name => ({ name, status: "pending" })), operations: [], resources: [], events: [], cli: { ready: false, unexpectedExit: false, sanitizedTail: "" }, cleanupErrors: [], cleanupWarnings: [] };
  const save = () => persist(evidencePath, evidence);
  save();
  if (!options.execute) return { evidencePath, status: "dry-run", externalRequests: 0 };

  let active: Evidence["steps"][number] | undefined;
  const step = async (name: typeof STRIPE_TEST_STEPS[number], work: () => Promise<RecordValue | void>) => {
    active = evidence.steps.find(item => item.name === name)!; active.status = "running"; save();
    try { active.details = await work() || undefined; active.status = "pass"; save(); }
    catch (error) { const failure = safeFailure(error); active.status = failure.blocked ? "blocked" : "fail"; active.code = failure.code; save(); throw error; }
  };
  let browser: Browser | undefined;
  let stopServer: (() => Promise<void>) | undefined;
  let stopCli: (() => Promise<void>) | undefined;
  let db: import("../tests/test-helpers.ts").SqliteD1Database | undefined;
  let api: ((path: string, method?: string, fields?: URLSearchParams) => Promise<RecordValue>) | undefined;
  const nativeFetch = globalThis.fetch;
  let restoreFetch = () => {};
  try {
    const secret = requireTestSecret(options.secret ?? process.env.STRIPE_SECRET_KEY);
    const [{ default: worker }, billing, stripe, helpers] = await Promise.all([import("../worker/src/index.ts"), import("../worker/src/billing-store.ts"), import("../worker/src/stripe-billing.ts"), import("../tests/test-helpers.ts")]);
    evidence.apiVersion = stripe.STRIPE_API_VERSION;
    const prices = parseTestPrices(JSON.parse(readFileSync(join(root, ".qa-artifacts", "stripe", "existing-prices.json"), "utf8")));
    evidence.prices = prices;
    const cliPath = join(root, ".qa-artifacts", "stripe", "cli", "stripe.exe");
    if (!existsSync(cliPath)) throw new AcceptanceFailure("stripe_cli_missing", true);
    db = new helpers.SqliteD1Database();
    let sequence = 0;
    api = async (path, method = "GET", fields) => {
      if (!/^\/[a-z_]+(?:\/[a-zA-Z0-9_]+)*(?:\?[^\s]*)?$/.test(path)) throw new AcceptanceFailure("stripe_path_invalid");
      const requestId = `${runId}-${++sequence}`;
      const operation: Operation | undefined = method === "GET" ? undefined : { path: path.split("?")[0], method, requestId, state: "pending" };
      if (operation) { evidence.operations.push(operation); save(); }
      let response: Response;
      evidence.externalRequests++; save();
      try { response = await nativeFetch(`${API}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${secret}`, "stripe-version": stripe.STRIPE_API_VERSION, ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded", "idempotency-key": requestId } : {}) }, ...(fields ? { body: fields } : {}) }); }
      catch { if (operation) { operation.state = "unknown"; save(); } throw new AcceptanceFailure("stripe_outcome_unknown", true); }
      if (operation) operation.httpStatus = response.status;
      if (!response.ok) { if (operation) { operation.state = response.status >= 500 ? "unknown" : "rejected"; save(); } throw new AcceptanceFailure(response.status === 403 ? "stripe_permissions_required" : "stripe_request_rejected", response.status === 403); }
      let value: RecordValue;
      try { value = record(await response.json()); } catch { if (operation) { operation.state = "unknown"; save(); } throw new AcceptanceFailure("stripe_outcome_unknown", true); }
      if (value.livemode === true) throw new AcceptanceFailure("stripe_live_object_rejected");
      if (operation) { operation.state = "done"; operation.objectId = identifier(value) || undefined; save(); }
      return value;
    };
    const call = api;
    const form = (values: Record<string, string>) => new URLSearchParams(values);
    const customers = new Map<string, { uid: string; env: BillingEnv; clockId: string }>();
    const owners = new Map<string, BillingEnv>();
    const tokens = new Map<string, string>();
    const held = new Set<string>();
    const knownCharges = new Map<string, string>();
    const captures = new Map<string, Capture>();
    let cliHealthy = false;
    const healthy = () => { if (!cliHealthy || evidence.cli.unexpectedExit) throw new AcceptanceFailure("stripe_listener_stopped"); };
    const baseEnv: BillingEnv = { QUESTFORGE_DB: db, BILLING_ENABLED: "true", BILLING_MODE: "test", STRIPE_SECRET_KEY: secret, BILLING_ADMIN_TOKEN: crypto.randomUUID(), BILLING_CONFIG: JSON.stringify({ approved: true, currency: "usd", monthlyPriceId: prices.monthly, annualPriceId: prices.annual, ...STRIPE_TEST_CREDITS } satisfies BillingConfig) };
    let baseUrl = "";
    let queue = Promise.resolve();
    let portalConfigurationSent: string | null = null;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
      if (url.origin === "https://api.stripe.com") {
        evidence.externalRequests++;
        if (url.pathname === "/v1/billing_portal/sessions" && init?.method === "POST") portalConfigurationSent = new URLSearchParams(String(init.body)).get("configuration");
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        const operation: Operation | undefined = method === "GET" ? undefined : { path: url.pathname.slice(3), method, requestId: `${runId}-worker-${++sequence}`, state: "pending" };
        if (operation) evidence.operations.push(operation);
        save();
        try {
          const response = await nativeFetch(input, init);
          if (operation) {
            operation.httpStatus = response.status;
            operation.state = response.ok ? "done" : response.status >= 500 ? "unknown" : "rejected";
            try { operation.objectId = identifier(await response.clone().json()) || undefined; } catch { operation.state = "unknown"; }
            save();
          }
          return response;
        } catch (error) { if (operation) { operation.state = "unknown"; save(); } throw error; }
      }
      return nativeFetch(input, init);
    };
    restoreFetch = () => { globalThis.fetch = nativeFetch; };
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of incoming) { bytes += Buffer.byteLength(chunk); if (bytes > 1_048_576) { outgoing.writeHead(413); outgoing.end(); return; } chunks.push(Buffer.from(chunk)); }
        const raw = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(",") : value);
        const url = new URL(incoming.url || "/", baseUrl);
        if (url.pathname === "/") { outgoing.writeHead(200, { "content-type": "text/plain" }); outgoing.end("Isolated Guilduo Stripe Test return. Entitlement requires verified webhooks."); return; }
        let env = baseEnv;
        let capture: Capture | undefined;
        if (url.pathname === "/v1/billing/webhook") {
          let event: RecordValue; try { event = record(JSON.parse(raw.toString("utf8"))); } catch { outgoing.writeHead(400); outgoing.end(); return; }
          if (event.livemode !== false) { outgoing.writeHead(400); outgoing.end(); return; }
          const object = record(record(event.data).object);
          const customerId = identifier(object.customer) || knownCharges.get(identifier(object.charge)) || knownCharges.get(identifier(object)) || "";
          const customer = customers.get(customerId);
          if (!customer) { outgoing.writeHead(200); outgoing.end('{"ignored":true}'); return; }
          env = customer.env;
          const eventId = requireId(event.id, "evt");
          capture = captures.get(eventId);
          if (!capture) {
            const summary = { id: eventId, type: String(event.type), apiVersion: String(event.api_version || ""), receivedAt: new Date().toISOString(), statuses: [] as number[], held: held.has(customerId) };
            capture = { id: eventId, type: String(event.type), raw: raw.toString("utf8"), signature: headers.get("stripe-signature") || "", customerId, receivedAt: Date.now(), created: Number(event.created), evidence: summary };
            captures.set(eventId, capture); evidence.events.push(summary); save();
          }
          if (held.has(customerId)) { outgoing.writeHead(200); outgoing.end('{"held":true}'); return; }
        } else {
          const uid = tokens.get(headers.get("authorization")?.replace(/^Bearer /, "") || "");
          if (!uid || !owners.has(uid)) { outgoing.writeHead(401); outgoing.end(); return; }
          env = owners.get(uid)!;
        }
        const execute = async () => {
          const request = new Request(url, { method: incoming.method, headers, ...(["GET", "HEAD"].includes(incoming.method || "GET") ? {} : { body: raw }) });
          const response = await worker.fetch(request, env, { waitUntil(promise: Promise<unknown>) { promise.catch(() => {}); } });
          if (capture) { capture.evidence.statuses.push(response.status); save(); }
          outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
        };
        const pending = queue.then(execute); queue = pending.catch(() => {}); await pending;
      } catch { if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end('{"error":"local_test_bridge_failed"}'); }
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new AcceptanceFailure("localhost_failed");
    baseUrl = `http://127.0.0.1:${address.port}`; baseEnv.WEB_APP_URL = `${baseUrl}/`; baseEnv.ALLOWED_ORIGINS = baseUrl;
    stopServer = () => new Promise<void>((resolveClose, reject) => { server.close(error => error ? reject(error) : resolveClose()); server.closeAllConnections(); });
    const owner = (uid: string) => {
      const token = crypto.randomUUID(); tokens.set(token, uid);
      const env = { ...baseEnv, DEV_USER_ID: uid, DEV_BEARER_TOKEN: token }; owners.set(uid, env); return env;
    };
    const rest = async (uid: string, path: string, body?: RecordValue) => {
      healthy(); const env = owners.get(uid)!;
      const response = await nativeFetch(baseUrl + path, { method: body ? "POST" : "GET", signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${env.DEV_BEARER_TOKEN}`, origin: baseUrl, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new AcceptanceFailure(`local_rest_${response.status}`);
      return record(await response.json());
    };
    const poll = async <T,>(get: () => Promise<T>, accept: (value: T) => boolean, code: string, timeoutMs = 120_000): Promise<T> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) { healthy(); const value = await get(); if (accept(value)) return value; await delay(1000); }
      throw new AcceptanceFailure(code, true);
    };
    const statuses = (uid: string) => billing.getBillingStatus(owners.get(uid)!, uid);
    const grants = async (uid: string) => (await billing.listCreditLedger(owners.get(uid)!, uid, { limit: 100 })).entries.filter(entry => entry.kind === "grant");
    const addResource = (resource: Omit<Resource, "cleanup">) => { evidence.resources.push({ ...resource, cleanup: "pending" }); save(); };
    let monthly!: { uid: string; customerId: string; clockId: string; env: BillingEnv };
    let annual!: typeof monthly;
    let portalId = "";
    let createdDefault = false;
    let priorPortalIds: string[] = [];
    const createTestOwner = async (label: string) => {
      const clock = await call("/test_helpers/test_clocks", "POST", form({ frozen_time: String(Math.floor(Date.now() / 1000)), name: `${runId}-${label}` }));
      const clockId = requireId(clock.id, "clock"); addResource({ kind: "clock", id: clockId });
      const uid = `${runId}-${label}`; const env = owner(uid); env.BILLING_NOW = new Date(Number(clock.frozen_time) * 1000).toISOString();
      const customer = await call("/customers", "POST", form({ test_clock: clockId, email: "guilduo-test@example.test", "metadata[guilduo_uid]": uid, "metadata[guilduo_mode]": "test", "metadata[guilduo_test_run]": runId }));
      const customerId = requireId(customer.id, "cus"); addResource({ kind: "customer", id: customerId, uid, clockId });
      customers.set(customerId, { uid, env, clockId }); await billing.setBillingCustomer(env, uid, customerId);
      return { uid, customerId, clockId, env };
    };
    const replay = async (capture: Capture, signature = capture.signature) => {
      healthy(); if (!signatureFresh(capture.signature)) throw new AcceptanceFailure("captured_signature_expired", true);
      return nativeFetch(`${baseUrl}/v1/billing/webhook`, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "stripe-signature": signature, "content-type": "application/json" }, body: capture.raw });
    };
    const subscription = async (customer: typeof monthly): Promise<RecordValue> => {
      const result = await call(`/subscriptions?customer=${customer.customerId}&status=all&limit=100`);
      if (!Array.isArray(result.data) || result.has_more !== false || result.data.length !== 1) throw new AcceptanceFailure("subscription_ambiguous", true);
      const sub = record(result.data[0]); if (identifier(sub.customer) !== customer.customerId || sub.livemode !== false) throw new AcceptanceFailure("stripe_ownership_failed"); return sub;
    };
    const periodEnd = (sub: RecordValue) => Number(sub.current_period_end ?? record((record(sub.items).data as unknown[])?.[0]).current_period_end);
    const advance = async (customer: typeof monthly, timestamp: number) => {
      if (!Number.isSafeInteger(timestamp)) throw new AcceptanceFailure("clock_timestamp_invalid");
      customer.env.BILLING_NOW = new Date(timestamp * 1000).toISOString();
      await call(`/test_helpers/test_clocks/${customer.clockId}/advance`, "POST", form({ frozen_time: String(timestamp) }));
      await poll(() => call(`/test_helpers/test_clocks/${customer.clockId}`), clock => clock.status === "ready", "clock_not_ready");
    };
    const advanceInvoiceCollection = async (customer: typeof monthly, invoiceId: string) => {
      const invoice = await call(`/invoices/${invoiceId}`);
      if (invoice.status !== "draft") return;
      // Invoice creation may use the just-advanced frozen time, so inspect its
      // actual finalization timestamp rather than adding an hour to period end.
      const clock = await call(`/test_helpers/test_clocks/${customer.clockId}`);
      const frozen = Number(clock.frozen_time);
      const finalization = Number(invoice.automatically_finalizes_at);
      await advance(customer, Math.max(frozen + 3600, Number.isSafeInteger(finalization) ? finalization : 0) + 60);
    };
    const checkout = async (customer: typeof monthly, interval: "monthly" | "annual", referralCode?: string) => {
      const before = await statuses(customer.uid); assert.equal(before.entitlement.plan, "free");
      const result = await rest(customer.uid, "/v1/billing/checkout", { interval, requestId: `${runId}-${interval}`, ...(referralCode ? { referralCode } : {}) });
      const url = new URL(String(result.url)); if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new AcceptanceFailure("checkout_url_invalid");
      const stillFree = await statuses(customer.uid); assert.equal(stillFree.entitlement.plan, "free");
      const page = await browser!.newPage(); page.setDefaultTimeout(10_000);
      let stage = "navigation";
      try {
        await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (options.interactive) {
          console.log(`Complete the ${interval} Stripe TEST Checkout in the opened browser using a Test card. No Live payment is allowed.`);
        } else {
          stage = "fields";
          await page.locator('input[name="cardNumber"], #cardNumber, iframe').first().waitFor({ timeout: 20_000 });
          await fillHostedCheckout(page);
        }
        stage = "return_or_challenge";
        await page.waitForURL(`${baseUrl}/**`, { timeout: options.interactive ? 600_000 : 90_000 });
      } catch (error) { throw error instanceof AcceptanceFailure ? error : new AcceptanceFailure(`checkout_${stage}_requires_human`, true); }
      finally { await page.close(); }
    };
    // Explicit fallback creates a separate Test fixture. It never proves Hosted Checkout acceptance.
    const fixtureSubscription = async (customer: typeof monthly, interval: "monthly" | "annual") => {
      healthy();
      const existing = await call(`/subscriptions?customer=${customer.customerId}&status=all&limit=100`);
      if (!Array.isArray(existing.data) || existing.has_more !== false) throw new AcceptanceFailure("fixture_subscription_lookup_incomplete", true);
      if (existing.data.length) {
        const sub = await subscription(customer);
        if (sub.status !== "active") throw new AcceptanceFailure("fixture_existing_subscription_requires_reconciliation", true);
        return "authoritative_existing_subscription";
      }
      const sessions = await call(`/checkout/sessions?customer=${customer.customerId}&limit=100`);
      if (!Array.isArray(sessions.data) || sessions.has_more !== false) throw new AcceptanceFailure("fixture_checkout_lookup_incomplete", true);
      for (const value of sessions.data) {
        const session = record(value);
        if (session.livemode !== false || identifier(session.customer) !== customer.customerId || record(session.metadata).guilduo_request_id !== `${runId}-${interval}`) throw new AcceptanceFailure("fixture_checkout_ownership_failed");
        if (session.status === "complete") throw new AcceptanceFailure("fixture_completed_checkout_requires_reconciliation", true);
        if (session.status === "open") await call(`/checkout/sessions/${requireId(session.id, "cs")}/expire`, "POST", form({}));
        else if (session.status !== "expired") throw new AcceptanceFailure("fixture_checkout_state_unknown", true);
      }
      const method = await call("/payment_methods/pm_card_visa/attach", "POST", form({ customer: customer.customerId }));
      const pm = requireId(method.id, "pm");
      await call(`/customers/${customer.customerId}`, "POST", form({ "invoice_settings[default_payment_method]": pm }));
      const sub = await call("/subscriptions", "POST", form({ customer: customer.customerId, "items[0][price]": prices[interval === "monthly" ? "monthly" : "annual"], default_payment_method: pm, payment_behavior: "error_if_incomplete", "metadata[guilduo_uid]": customer.uid, "metadata[guilduo_mode]": "test", "metadata[guilduo_test_run]": runId }));
      if (sub.livemode !== false || identifier(sub.customer) !== customer.customerId || sub.status !== "active") throw new AcceptanceFailure("fixture_subscription_not_active", true);
      return "explicit_test_card_subscription";
    };
    const hostedOrFixture = async (name: "monthly_checkout" | "annual_checkout", customer: typeof monthly, interval: "monthly" | "annual", referralCode?: string) => {
      try { await step(name, async () => { await checkout(customer, interval, referralCode); return { hostedCompleted: true }; }); return "hosted_checkout"; }
      catch (error) {
        if (!canUseFixtureSubscription(options.fixtureSubscriptions === true, error)) throw error;
        const gate = evidence.steps.find(item => item.name === name)!;
        gate.details = { hostedCompleted: false, explicitFixtureFallback: true, humanAction: "Open Test Checkout manually; complete missing fields or challenge. Do not bypass challenges." }; save();
        return fixtureSubscription(customer, interval);
      }
    };
    const referrerUid = `${runId}-referrer`;
    await step("setup", async () => {
      const executablePath = options.chromePath ?? process.env.QF_CHROME_PATH ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
      browser = await chromium.launch({ executablePath, headless: options.interactive !== true });
      const existing = await call("/billing_portal/configurations?limit=100");
      if (!Array.isArray(existing.data) || existing.has_more !== false) throw new AcceptanceFailure("portal_inventory_incomplete", true);
      priorPortalIds = existing.data.map(value => requireId(record(value).id, "bpc"));
      const configuration = await call("/billing_portal/configurations", "POST", form({ "business_profile[headline]": "Guilduo isolated Test acceptance", "features[invoice_history][enabled]": "true", "features[payment_method_update][enabled]": "true", "features[subscription_cancel][enabled]": "true", "features[subscription_cancel][mode]": "at_period_end", "metadata[guilduo_test_run]": runId }));
      portalId = requireId(configuration.id, "bpc"); addResource({ kind: "portal", id: portalId });
      if (priorPortalIds.includes(portalId)) throw new AcceptanceFailure("portal_ownership_failed");
      createdDefault = configuration.is_default === true;
      baseEnv.BILLING_CONFIG = JSON.stringify({ ...JSON.parse(baseEnv.BILLING_CONFIG!), portalConfigurationId: portalId });
      let intentionalStop = false; let rawTail = "";
      const child = spawn(cliPath, cliListenArguments(`${baseUrl}/`, join(directory, "stripe.toml")), { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, STRIPE_API_KEY: secret, STRIPE_SECRET_KEY: secret } });
      const ready = new Promise<void>((resolveReady, rejectReady) => {
        const receive = (chunk: Buffer) => {
          rawTail = (rawTail + chunk.toString("utf8")).slice(-8000);
          evidence.cli.sanitizedTail = "CLI output suppressed";
          const webhookSecret = listenerReadySecret(rawTail);
          if (webhookSecret && !evidence.cli.ready) { baseEnv.STRIPE_WEBHOOK_SECRET = webhookSecret; evidence.cli.ready = true; evidence.cli.sanitizedTail = "Ready; credentials suppressed"; cliHealthy = true; save(); resolveReady(); }
        };
        child.stdout.on("data", receive); child.stderr.on("data", receive);
        child.once("error", () => { evidence.cli.unexpectedExit = true; cliHealthy = false; save(); rejectReady(new AcceptanceFailure("stripe_listener_failed")); });
        child.once("exit", () => { cliHealthy = false; if (!intentionalStop) { evidence.cli.unexpectedExit = true; save(); rejectReady(new AcceptanceFailure("stripe_listener_stopped")); } });
      });
      stopCli = async () => { intentionalStop = true; if (child.exitCode === null && child.signalCode === null) { child.kill(); await Promise.race([once(child, "exit").catch(() => {}), delay(5000)]); } };
      await Promise.race([ready, delay(30_000, undefined, { ref: false }).then(() => { throw new AcceptanceFailure("stripe_listener_not_ready", true); })]);
      owner(referrerUid);
      monthly = await createTestOwner("monthly"); annual = await createTestOwner("annual");
      return { localhostOnly: true, persistentStore: "real SQLite", cliVersionExpected: "1.53.0", provisionalCreditTerms: true, priorPortalIds, createdDefaultConfiguration: createdDefault };
    });
    const referralCode = (await statuses(referrerUid)).referral.code;
    const monthlyPath = await hostedOrFixture("monthly_checkout", monthly, "monthly", referralCode);
    await step("monthly_subscription", async () => {
      const state = await poll(() => statuses(monthly.uid), value => value.entitlement.plan === "pro" && value.credits.available === 100, "checkout_webhook_not_accepted");
      const accepted = [...captures.values()].some(capture => capture.customerId === monthly.customerId && capture.evidence.statuses.includes(200));
      assert.equal(accepted, true); return { plan: state.entitlement.plan, credits: state.credits.available, verifiedWebhook: true, subscriptionPath: monthlyPath, hostedAcceptance: monthlyPath === "hosted_checkout" };
    });
    await step("referral_once", async () => {
      const state = await poll(() => statuses(referrerUid), value => value.credits.available === 25, "referral_not_granted");
      assert.equal((await grants(referrerUid)).filter(entry => entry.source.startsWith("referral:")).length, 1);
      return { referrerCredits: state.credits.available, grants: 1, provisional: true };
    });
    await step("webhook_signature_replay", async () => {
      const paid = [...captures.values()].find(capture => capture.customerId === monthly.customerId && ["invoice.paid", "invoice.payment_succeeded"].includes(capture.type) && capture.evidence.statuses.includes(200));
      if (!paid) throw new AcceptanceFailure("paid_webhook_missing", true);
      const before = await grants(monthly.uid); const referralBefore = await grants(referrerUid);
      const duplicate = await replay(paid); assert.equal(duplicate.status, 200); assert.equal(record(await duplicate.json()).duplicate, true);
      const invalid = await replay(paid, `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`); assert.equal(invalid.status, 400);
      assert.deepEqual(await grants(monthly.uid), before); assert.deepEqual(await grants(referrerUid), referralBefore);
      return { originalSignatureVerified: true, duplicateStatus: 200, invalidStatus: 400, duplicateGrants: 0 };
    });
    try { await step("portal", async () => {
      const result = await rest(monthly.uid, "/v1/billing/portal", {});
      if (portalConfigurationSent !== portalId) throw new AcceptanceFailure("portal_configuration_not_supported", true);
      const url = new URL(String(result.url)); if (url.hostname !== "billing.stripe.com" || url.protocol !== "https:") throw new AcceptanceFailure("portal_url_invalid");
      const page = await browser!.newPage();
      active!.details = { serverSessionCreated: true, isolatedConfiguration: portalId, preexistingConfigurationsModified: false }; save();
      try {
        // Hosted Portal can render while third-party deferred resources still delay DOMContentLoaded.
        // Wait for the authoritative document response and visible body; human return is a separate gate.
        const response = await page.goto(url.toString(), { waitUntil: "commit", timeout: 45_000 });
        if (!response?.ok()) throw new AcceptanceFailure("portal_start_failed", true);
        await page.locator("body").waitFor();
        if (options.interactive) {
          active!.details = { ...active!.details, documentResponseAccepted: true, interactiveReady: true }; save();
          console.log("Inspect the Stripe TEST Portal plan, invoice history and cancellation controls, then use Return to go back to the local verification page.");
          await page.waitForURL(`${baseUrl}/**`, { timeout: 600_000 });
        }
      }
      catch (error) { if (error instanceof AcceptanceFailure) throw error; throw new AcceptanceFailure("portal_navigation_requires_human", true); }
      finally { await page.close(); }
      return { httpStarted: true, isolatedConfiguration: portalId, defaultConfigurationChanged: createdDefault, preexistingConfigurationsModified: false, interactiveReturnConfirmed: options.interactive === true };
    }); } catch (error) { if (!options.fixtureSubscriptions || !(error instanceof AcceptanceFailure) || !error.blocked) throw error; }
    held.add(annual.customerId);
    const annualPath = await hostedOrFixture("annual_checkout", annual, "annual", referralCode);
    await step("annual_checkout_reverse_order", async () => {
      assert.equal((await statuses(annual.uid)).entitlement.plan, "free");
      await poll(async () => [...captures.values()].filter(capture => capture.customerId === annual.customerId), values => (annualPath !== "hosted_checkout" || values.some(capture => capture.type === "checkout.session.completed")) && values.some(capture => capture.type === "invoice.paid"), "annual_webhooks_missing");
      held.delete(annual.customerId);
      const reversed = [...captures.values()].filter(capture => capture.customerId === annual.customerId).sort((a, b) => b.created - a.created || b.receivedAt - a.receivedAt);
      for (const capture of reversed) { const response = await replay(capture); if (response.status !== 200) throw new AcceptanceFailure("reversed_webhook_failed"); }
      const state = await poll(() => statuses(annual.uid), value => value.entitlement.plan === "pro" && value.credits.available === 100, "annual_acceptance_failed");
      assert.equal((await grants(annual.uid)).length, 1); return { plan: state.entitlement.plan, credits: state.credits.available, firstDeliveryOrderReversed: true, events: reversed.length, subscriptionPath: annualPath, hostedAcceptance: annualPath === "hosted_checkout" };
    });
    let initialInvoice = "";
    await step("renewal", async () => {
      const before = await subscription(monthly); initialInvoice = requireId(before.latest_invoice, "in");
      // Renewal invoices are finalized after Stripe's one-hour collection delay.
      await advance(monthly, periodEnd(before) + 3610);
      const renewed = await poll(() => subscription(monthly), sub => identifier(sub.latest_invoice) !== initialInvoice && sub.status === "active", "renewal_not_paid");
      await advanceInvoiceCollection(monthly, requireId(renewed.latest_invoice, "in"));
      await poll(() => grants(monthly.uid), entries => entries.length === 2, "renewal_credit_not_granted");
      await poll(async () => [...captures.values()], values => values.some(capture => capture.customerId === monthly.customerId && ["invoice.paid", "invoice.payment_succeeded"].includes(capture.type) && identifier(record(record(JSON.parse(capture.raw)).data).object) === identifier(renewed.latest_invoice) && capture.evidence.statuses.includes(200)), "renewal_webhook_missing");
      const state = await poll(() => statuses(monthly.uid), value => value.entitlement.plan === "pro", "renewal_webhook_not_accepted");
      assert.equal((await grants(monthly.uid)).length, 2); return { plan: state.entitlement.plan, invoiceGrants: 2, availableCredits: state.credits.available };
    });
    let failureGrantCount = 0;
    await step("payment_failure", async () => {
      const sub = await subscription(monthly); const subId = requireId(sub.id, "sub"); failureGrantCount = (await grants(monthly.uid)).length;
      // This card can be attached; only the subsequent invoice charge fails.
      const paymentMethod = await call("/payment_methods/pm_card_chargeCustomerFail/attach", "POST", form({ customer: monthly.customerId }));
      const pm = requireId(paymentMethod.id, "pm");
      await call(`/subscriptions/${subId}`, "POST", form({ default_payment_method: pm }));
      await advance(monthly, periodEnd(sub) + 3610);
      const failedCycle = await poll(() => subscription(monthly), value => identifier(value.latest_invoice) !== identifier(sub.latest_invoice), "failed_cycle_invoice_missing");
      await advanceInvoiceCollection(monthly, requireId(failedCycle.latest_invoice, "in"));
      await poll(() => subscription(monthly), value => ["past_due", "unpaid"].includes(String(value.status)), "payment_failure_not_observed");
      await poll(async () => [...captures.values()], values => values.some(capture => capture.customerId === monthly.customerId && capture.type === "invoice.payment_failed" && capture.evidence.statuses.includes(200)), "payment_failure_webhook_missing");
      const state = await poll(() => statuses(monthly.uid), value => value.entitlement.plan === "free", "failure_entitlement_not_revoked");
      assert.equal((await grants(monthly.uid)).length, failureGrantCount); return { plan: state.entitlement.plan, noUnpaidCreditGrant: true };
    });
    await step("cancel_at_period_end", async () => {
      const sub = await subscription(monthly);
      await call(`/subscriptions/${requireId(sub.id, "sub")}`, "POST", form({ cancel_at_period_end: "true" }));
      const state = await poll(() => statuses(monthly.uid), value => value.cancelAtPeriodEnd, "cancel_flag_not_synced");
      const paid = await subscription(annual);
      await call(`/subscriptions/${requireId(paid.id, "sub")}`, "POST", form({ cancel_at_period_end: "true" }));
      const paidState = await poll(() => statuses(annual.uid), value => value.cancelAtPeriodEnd && value.entitlement.plan === "pro", "paid_cancellation_access_not_retained");
      return { cancelAtPeriodEnd: state.cancelAtPeriodEnd, startingSubscriptionStatus: sub.status, paidActiveCancellationCovered: true, paidPlanRetained: paidState.entitlement.plan };
    });
    await step("expiry", async () => {
      const sub = await subscription(monthly); await advance(monthly, periodEnd(sub) + 60);
      await poll(() => subscription(monthly), value => value.status === "canceled", "expiry_not_observed");
      const state = await poll(() => statuses(monthly.uid), value => value.entitlement.plan === "free" && value.subscriptionStatus === "canceled", "expiry_not_synced");
      assert.equal((await grants(monthly.uid)).length, failureGrantCount); return { plan: state.entitlement.plan, subscriptionStatus: state.subscriptionStatus };
    });
    await step("refund", async () => {
      const referrerBefore = (await statuses(referrerUid)).credits.available;
      const sub = await subscription(annual); const invoiceId = requireId(sub.latest_invoice, "in");
      const payments = await call(`/invoice_payments?invoice=${invoiceId}&status=paid&limit=100`);
      const intentId = invoicePaymentIntent(payments);
      const intent = await call(`/payment_intents/${intentId}?expand[]=latest_charge`);
      if (identifier(intent.customer) !== annual.customerId || intent.livemode !== false) throw new AcceptanceFailure("refund_ownership_failed");
      const chargeId = requireId(intent.latest_charge, "ch"); knownCharges.set(chargeId, annual.customerId);
      const refund = await call("/refunds", "POST", form({ payment_intent: intentId, "metadata[guilduo_test_run]": runId }));
      assert.equal(refund.status, "succeeded");
      const state = await poll(() => statuses(annual.uid), value => value.entitlement.plan === "free" && value.credits.available === 0, "refund_benefits_not_reversed");
      const referrerAfter = await poll(() => statuses(referrerUid), value => value.credits.available === referrerBefore - STRIPE_TEST_CREDITS.referralCredits, "refund_referral_not_reversed");
      return { separateCustomer: true, invoiceId, refundId: requireId(refund.id, "re"), plan: state.entitlement.plan, availableCredits: state.credits.available, invoicePaymentsShape: true, referrerCreditsBefore: referrerBefore, referrerCreditsAfter: referrerAfter.credits.available };
    });
    healthy(); evidence.status = "pass";
  } catch (error) {
    const failure = safeFailure(error); evidence.status = failure.blocked ? "blocked" : "fail";
    evidence.failure = failure;
    if (!active || active.status === "pass") { active = evidence.steps.find(item => item.status === "pending"); if (active) { active.status = failure.blocked ? "blocked" : "fail"; active.code = failure.code; } }
    save();
  } finally {
    await browser?.close().catch(() => {});
    await stopCli?.().catch(() => { evidence.cli.unexpectedExit = true; });
    await stopServer?.().catch(() => { evidence.cleanupErrors.push("local_server_cleanup_failed"); });
    restoreFetch();
    const cleanup = evidence.steps.find(item => item.name === "cleanup")!; cleanup.status = "running"; save();
    if (api) for (const resource of [...evidence.resources].sort((a, b) => (a.kind === "clock" ? 1 : 0) - (b.kind === "clock" ? 1 : 0))) {
      try {
        if (resource.kind === "customer") {
          const customer = await api(`/customers/${resource.id}`);
          if (customer.deleted !== true) {
            if (customer.livemode !== false || record(customer.metadata).guilduo_test_run !== runId || identifier(customer.test_clock) !== resource.clockId) throw new AcceptanceFailure("cleanup_ownership_failed");
            await api(`/customers/${resource.id}`, "DELETE");
          }
        } else if (resource.kind === "portal") {
          const portal = await api(`/billing_portal/configurations/${resource.id}`);
          if (portalCleanupDisposition(portal, runId) === "retain") { resource.cleanup = "retained"; evidence.cleanupWarnings.push("owned_default_portal_cannot_be_deactivated"); save(); continue; }
          await api(`/billing_portal/configurations/${resource.id}`, "POST", new URLSearchParams({ active: "false" }));
        } else {
          const clock = await api(`/test_helpers/test_clocks/${resource.id}`);
          if (clock.livemode !== false || !String(clock.name).startsWith(`${runId}-`)) throw new AcceptanceFailure("cleanup_ownership_failed");
          const customers = await api(`/customers?test_clock=${resource.id}&limit=100`);
          if (customers.has_more !== false || !Array.isArray(customers.data) || customers.data.map(record).some(customer => record(customer.metadata).guilduo_test_run !== runId)) throw new AcceptanceFailure("cleanup_ownership_failed");
          await api(`/test_helpers/test_clocks/${resource.id}`, "DELETE");
        }
        resource.cleanup = "done";
      } catch (error) { resource.cleanup = "fail"; evidence.cleanupErrors.push(safeFailure(error).code); }
      save();
    }
    db?.close();
    cleanup.status = evidence.cleanupErrors.length ? "fail" : evidence.cleanupWarnings.length ? "blocked" : "pass";
    if (cleanup.status === "blocked" && evidence.status === "pass") evidence.status = "blocked";
    if (evidence.cli.unexpectedExit || cleanup.status === "fail") evidence.status = "fail";
    if (evidence.status === "pass" && evidence.steps.some(item => item.status !== "pass")) evidence.status = evidence.steps.some(item => item.status === "blocked") ? "blocked" : "fail";
    save();
  }
  return { evidencePath, status: evidence.status, externalRequests: evidence.externalRequests, steps: evidence.steps.map(({ name, status, code }) => ({ name, status, ...(code ? { code } : {}) })) };
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--execute", "--fixture-subscriptions", "--interactive"].includes(arg))) { console.error("Usage: verify-stripe-test.mts [--execute] [--fixture-subscriptions] [--interactive]"); process.exitCode = 1; }
  else {
    const result = await runStripeTest({ execute: args.includes("--execute"), fixtureSubscriptions: args.includes("--fixture-subscriptions"), interactive: args.includes("--interactive") });
    console.log(JSON.stringify(result, null, 2));
    if (!["pass", "dry-run"].includes(result.status)) process.exitCode = 1;
  }
}
