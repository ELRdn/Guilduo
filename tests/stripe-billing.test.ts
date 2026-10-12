import test from "node:test";
import assert from "node:assert/strict";
import { createCheckout, createPortal, getPublicBillingPrices, handleStripeWebhook, reconcileBilling, runBillingMaintenance } from "../worker/src/stripe-billing.ts";
import { acquireBillingSync, attributeReferral, getBillingAccount, getBillingStatus, getEntitlement, grantCredits, listCreditLedger, releaseBillingSync, reserveCredits, setBillingCustomer, settleCredits } from "../worker/src/billing-store.ts";
import type { BillingConfig, BillingEnv } from "../worker/src/billing-store.ts";
import type { JsonRecord } from "../worker/src/worker-types.ts";
import { SqliteD1Database, hasErrorCode } from "./test-helpers.ts";

const NOW = "2026-01-31T12:00:00.000Z";
const stamp = (iso: string) => Date.parse(iso) / 1000;
const config: BillingConfig = { approved: true, currency: "usd", monthlyPriceId: "price_month", annualPriceId: "price_year", monthlyCredits: 100, annualMonthlyCredits: 90, creditLifetimeDays: 30, decisionCredits: 2, referralCredits: 25 };
type Call = { path: string; method: string; form: URLSearchParams; key: string | null };
function fixture() {
  const db = new SqliteD1Database();
  const env: BillingEnv = { QUESTFORGE_DB: db, BILLING_ENABLED: "true", BILLING_MODE: "test", BILLING_CONFIG: JSON.stringify(config), BILLING_NOW: NOW, STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture" };
  const customers = new Map<string, JsonRecord>(); const subscriptions = new Map<string, JsonRecord>(); const invoices = new Map<string, JsonRecord>();
  const charges = new Map<string, JsonRecord>(); const sessions = new Map<string, JsonRecord>(); const invoicePayments = new Map<string, JsonRecord>(); const intents = new Map<string, JsonRecord>(); const calls: Call[] = []; const posted = new Map<string, JsonRecord>();
  const prices = new Map<string, JsonRecord>([["price_month", { id: "price_month", active: true, livemode: false, currency: "usd", unit_amount: 1000, tax_behavior: "inclusive", recurring: { interval: "month", interval_count: 1 } }], ["price_year", { id: "price_year", active: true, livemode: false, currency: "usd", unit_amount: 9600, tax_behavior: "inclusive", recurring: { interval: "year", interval_count: 1 } }]]);
  const coupons = new Map<string, JsonRecord>();
  const original = globalThis.fetch;
  let override: ((call: Call, url: URL) => Promise<Response | undefined>) | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, "https://api.stripe.com");
    const headers = new Headers(init?.headers); assert.equal(headers.get("stripe-version"), "2026-08-26.dahlia"); assert.equal(headers.get("authorization"), `Bearer ${env.STRIPE_SECRET_KEY}`);
    const call = { path: url.pathname.slice(3), method: init?.method || "GET", form: new URLSearchParams(String(init?.body || "")), key: headers.get("idempotency-key") }; calls.push(call);
    const intercepted = await override?.(call, url); if (intercepted) return intercepted;
    let value: JsonRecord | undefined;
    if (call.method === "POST") {
      const previous = call.key && posted.get(call.key); if (previous) return Response.json(previous);
      if (call.path === "/customers") {
        const customerId = `cus_${customers.size + 1}`;
        value = { id: customerId, livemode: false, metadata: { guilduo_uid: call.form.get("metadata[guilduo_uid]"), guilduo_mode: call.form.get("metadata[guilduo_mode]") } }; customers.set(customerId, value);
      }
      if (call.path === "/checkout/sessions") {
        const sessionId = `cs_${sessions.size + 1}`;
        value = { id: sessionId, livemode: false, customer: call.form.get("customer"), status: "open", url: `https://checkout.stripe.com/c/pay/${sessionId}`, metadata: { guilduo_request_id: call.form.get("metadata[guilduo_request_id]"), guilduo_interval: call.form.get("metadata[guilduo_interval]") } }; sessions.set(sessionId, value);
      }
      if (call.path === "/billing_portal/sessions") value = { id: "bps_one", url: "https://billing.stripe.com/p/session/one" };
      if (value && call.key) posted.set(call.key, value);
    } else {
      const [collection, entry] = call.path.slice(1).split("/");
      const map = collection === "customers" ? customers : collection === "subscriptions" ? subscriptions : collection === "invoices" ? invoices : collection === "charges" ? charges : collection === "prices" ? prices : collection === "coupons" ? coupons : collection === "checkout" ? sessions : collection === "invoice_payments" ? invoicePayments : collection === "payment_intents" ? intents : null;
      if (entry && collection !== "checkout") value = map?.get(entry);
      else if (collection === "checkout" && call.path.startsWith("/checkout/sessions/")) value = sessions.get(call.path.split("/").at(-1)!);
      else if (map) value = { data: [...map.values()].filter(v => collection === "invoice_payments" ? v.invoice === url.searchParams.get("invoice") : v.customer === url.searchParams.get("customer")), has_more: false };
    }
    if (!value) throw new Error(`Unhandled fake Stripe request: ${call.method} ${call.path}`);
    return Response.json(value);
  };
  async function owner(uid = "owner", customerId = "cus_owner") {
    customers.set(customerId, { id: customerId, livemode: false, metadata: { guilduo_uid: uid, guilduo_mode: "test" } }); await setBillingCustomer(env, uid, customerId);
  }
  function paid(options: { invoiceId?: string; subscriptionId?: string; customerId?: string; annual?: boolean; paid?: boolean; amount?: number; refunded?: boolean; disputed?: boolean; created?: number; modern?: boolean; periodStart?: string; periodEnd?: string } = {}) {
    const invoiceId = options.invoiceId || "in_one"; const subscriptionId = options.subscriptionId || "sub_one"; const customer = options.customerId || "cus_owner";
    const chargeId = `ch_${invoiceId.replaceAll("_", "")}`; const annual = options.annual || false; const price = prices.get(annual ? "price_year" : "price_month")!;
    const start = stamp(options.periodStart || NOW); const end = stamp(options.periodEnd || (annual ? "2027-01-31T12:00:00.000Z" : "2026-02-28T12:00:00.000Z"));
    const invoice: JsonRecord = { id: invoiceId, livemode: false, customer, subscription: subscriptionId, currency: "usd", status: options.paid === false ? "open" : "paid", paid: options.paid !== false, amount_paid: options.amount ?? 1000, charge: options.paid === false ? null : chargeId, created: options.created ?? start, status_transitions: { paid_at: options.created ?? start }, lines: { data: [{ price, quantity: 1, proration: false, period: { start, end } }], has_more: false } };
    const sub: JsonRecord = { id: subscriptionId, livemode: false, customer, status: "active", current_period_start: start, current_period_end: end, created: start, latest_invoice: invoiceId, cancel_at_period_end: false, items: { data: [{ price, quantity: 1 }] } };
    const charge: JsonRecord = { id: chargeId, livemode: false, customer, invoice: invoiceId, paid: true, amount_refunded: options.refunded ? 1000 : 0, refunded: options.refunded || false, disputed: options.disputed || false };
    if (options.modern) {
      delete invoice.paid; delete invoice.charge; delete invoice.subscription;
      invoice.parent = { type: "subscription_details", subscription_details: { subscription: subscriptionId } };
      invoice.lines = { data: [{ currency: "usd", quantity: 1, pricing: { type: "price_details", price_details: { price: price.id } }, parent: { type: "subscription_item_details", subscription_item_details: { subscription: subscriptionId, proration: false } }, period: { start, end } }], has_more: false };
      delete sub.current_period_start; delete sub.current_period_end;
      sub.items = { data: [{ price, quantity: 1, current_period_start: start, current_period_end: end }] };
      const intentId = `pi_${invoiceId.replaceAll("_", "")}`;
      delete charge.invoice; charge.payment_intent = intentId;
      intents.set(intentId, { id: intentId, customer, livemode: false, currency: "usd", status: options.paid === false ? "processing" : "succeeded", latest_charge: chargeId });
      invoicePayments.set(`inpay_${invoiceId}`, { id: `inpay_${invoiceId}`, invoice: invoiceId, livemode: false, currency: "usd", amount_paid: options.amount ?? 1000, status: options.paid === false ? "open" : "paid", payment: { type: "payment_intent", payment_intent: intentId } });
    }
    subscriptions.set(subscriptionId, sub); invoices.set(invoiceId, invoice); charges.set(chargeId, charge); return { invoice, sub, charge };
  }
  return { env, db, calls, customers, subscriptions, invoices, charges, sessions, invoicePayments, intents, prices, coupons, owner, paid,
    override(fn: typeof override) { override = fn; }, close() { globalThis.fetch = original; db.close(); } };
}
async function signed(env: BillingEnv, type: string, object: JsonRecord, eventId = "evt_one", options: { raw?: string; timestamp?: number; bad?: boolean; live?: boolean } = {}): Promise<Request> {
  const raw = options.raw || JSON.stringify({ id: eventId, type, livemode: options.live || false, created: stamp(env.BILLING_NOW!), data: { object } });
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://worker.test/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${options.bad ? "0".repeat(64) : signature}` }, body: raw });
}
const code = (expected: string) => (error: unknown) => hasErrorCode(error, expected);
test("Checkout/Portal owner mapping, approved actual prices, replay, expired session and return URL never grant Pro", async () => {
  const f = fixture();
  try {
    const result = await createCheckout(f.env, "owner", { interval: "monthly", requestId: "purchase1" }); assert.match(result.url, /^https:\/\/checkout.stripe.com\//);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    const call = f.calls.find(c => c.path === "/checkout/sessions" && c.method === "POST")!;
    assert.equal(call.form.get("line_items[0][price]"), "price_month"); assert.equal(call.form.get("customer"), "cus_1");
    assert.equal(call.form.get("success_url"), "https://app.guilduo.com/?billing=return"); assert.ok(call.key);
    assert.deepEqual(await createCheckout(f.env, "owner", { interval: "monthly", requestId: "purchase1" }), result);
    assert.equal(f.calls.filter(c => c.path === "/checkout/sessions" && c.method === "POST").length, 1);
    await assert.rejects(createCheckout(f.env, "owner", { interval: "annual", requestId: "purchase1" }), code("billing_checkout_conflict"));
    const prices = await getPublicBillingPrices(f.env); assert.equal(prices?.month.amount, 1000); assert.equal(prices?.year.amount, 9600); assert.equal(prices?.annual.creditsPerMonth, 90);
    assert.equal((await getBillingStatus(f.env, "owner")).salesReady, true);
    assert.match((await createPortal(f.env, "owner")).url, /^https:\/\/billing.stripe.com\//);
    await assert.rejects(createPortal(f.env, "foreign"), code("billing_customer_missing"));
    f.sessions.get("cs_1")!.status = "expired";
    await createCheckout(f.env, "owner", { interval: "annual", requestId: "purchase2" }); assert.equal(f.sessions.size, 2);
  } finally { f.close(); }
});
test("unapproved/invalid price, currency, interval, tax and Live terms fail before sales", async () => {
  const f = fixture();
  try {
    f.env.BILLING_CONFIG = JSON.stringify({ ...config, approved: false });
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("billing_not_configured")); assert.equal(f.calls.length, 0);
    f.env.BILLING_CONFIG = JSON.stringify(config); f.prices.get("price_month")!.currency = "eur";
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("stripe_price_invalid"));
    f.prices.get("price_month")!.currency = "usd"; f.prices.get("price_month")!.recurring = { interval: "day", interval_count: 1 };
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("stripe_price_invalid"));
    f.env.BILLING_MODE = "live"; f.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    await assert.rejects(createCheckout(f.env, "owner", { interval: "annual" }), code("billing_live_terms_required"));
    f.env.BILLING_CONFIG = JSON.stringify({ ...config, refundPolicy: "revoke_invoice_benefits", taxBehavior: "exclusive", automaticTax: true });
    await assert.rejects(createCheckout(f.env, "owner", { interval: "annual" }), code("stripe_mode_mismatch"));
    assert.equal((await getBillingStatus(f.env, "owner")).salesReady, false);
    assert.equal(f.calls.some(c => c.method === "POST"), false);
  } finally { f.close(); }
});
test("published coupons contain actual discount and end terms; read cache and owner-safe status", async () => {
  const f = fixture();
  try {
    f.env.BILLING_CONFIG = JSON.stringify({ ...config, launchCouponId: "launch", referralCouponId: "refer", refundPolicy: "revoke_invoice_benefits", taxBehavior: "inclusive", automaticTax: false });
    f.coupons.set("launch", { id: "launch", livemode: false, valid: true, percent_off: 20, amount_off: null, duration: "repeating", duration_in_months: 3, redeem_by: stamp("2026-03-01T00:00:00.000Z") });
    f.coupons.set("refer", { id: "refer", livemode: false, valid: true, percent_off: null, amount_off: 200, currency: "usd", duration: "once" });
    const value = await getPublicBillingPrices(f.env); assert.equal(value?.launchDiscount?.percentOff, 20); assert.equal(value?.launchDiscount?.durationMonths, 3); assert.equal(value?.referralDiscount?.amountOff, 200);
    assert.equal(value?.launchDiscount?.redeemBy, "2026-03-01T00:00:00.000Z");
    const count = f.calls.length; await getPublicBillingPrices(f.env); assert.equal(f.calls.length, count);
    const status = await getBillingStatus(f.env, "owner"); assert.equal(status.pricing?.creditLifetimeDays, 30); assert.equal(status.pricing?.autoTopUp, false); assert.equal(JSON.stringify(status).includes("sk_test"), false);
  } finally { f.close(); }
});
test("raw HMAC signature, timestamp, mode, body bound and malformed event rejects without Stripe effects", async () => {
  const f = fixture();
  try {
    for (const [options, status] of [[{ bad: true }, 400], [{ timestamp: Math.floor(Date.now() / 1000) - 301 }, 400], [{ live: true }, 409], [{ raw: "{" }, 400]] as const) {
      assert.equal((await handleStripeWebhook(await signed(f.env, "invoice.paid", {}, "evt_bad", options), f.env)).status, status);
    }
    const raw = '{ "id": "evt_spaces", "type": "unhandled.test", "livemode": false, "data": { "object": {} } }';
    assert.equal((await handleStripeWebhook(await signed(f.env, "unhandled.test", {}, "evt_spaces", { raw }), f.env)).status, 200);
    const tooBig = await signed(f.env, "unhandled.test", {}, "evt_large", { raw: " ".repeat(1048577) }); assert.equal((await handleStripeWebhook(tooBig, f.env)).status, 413);
    assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});
test("Webhook signature uses wall time while an advanced Test clock controls paid benefits", async () => {
  const f = fixture();
  try {
    await f.owner();
    const future = Math.floor(Date.now() / 1000) + 90 * 86400;
    f.env.BILLING_NOW = new Date(future * 1000).toISOString();
    const paid = f.paid({ modern: true, created: future });
    const period = { start: future, end: future + 30 * 86400 };
    (paid.invoice.lines as { data: JsonRecord[] }).data[0]!.period = period;
    Object.assign((paid.sub.items as { data: JsonRecord[] }).data[0]!, { current_period_start: period.start, current_period_end: period.end });
    const accepted = await handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }, "evt_clock"), f.env);
    assert.equal(accepted.status, 200);
    const status = await getBillingStatus(f.env, "owner");
    assert.equal(status.plan, "pro"); assert.equal(status.credits.available, 100);
    assert.equal(status.periodEnd, new Date(period.end * 1000).toISOString());
    const calls = f.calls.length;
    for (const timestamp of [future, Math.floor(Date.now() / 1000) - 601, Math.floor(Date.now() / 1000) + 601]) {
      const rejected = await handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }, "evt_clock", { timestamp }), f.env);
      assert.equal(rejected.status, 400);
      assert.equal(((await rejected.json()) as { error: { code: string } }).error.code, "stripe_signature_expired");
    }
    assert.equal(f.calls.length, calls, "expired signatures fail before replay or authoritative Stripe reads");
  } finally { f.close(); }
});
test("paid invoice authoritative fetch, replay/races and customer identity validate before benefits", async () => {
  const f = fixture();
  try {
    await f.owner(); f.paid();
    const replies = await Promise.all([handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }), f.env), handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }), f.env)]);
    assert.ok(replies.some(r => r.status === 200)); assert.ok(replies.every(r => [200, 503].includes(r.status)));
    assert.equal((await handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }), f.env)).status, 200);
    const status = await getBillingStatus(f.env, "owner"); assert.equal(status.plan, "pro"); assert.equal(status.credits.available, 100);
    assert.equal((await listCreditLedger(f.env, "owner")).entries.filter(e => e.kind === "grant").length, 1);
    f.customers.get("cus_owner")!.metadata = { guilduo_uid: "foreign", guilduo_mode: "test" };
    await assert.rejects(reconcileBilling(f.env, "owner"), code("stripe_customer_identity"));
    assert.equal((await getBillingAccount(f.env, "owner")).state.syncToken, null);
  } finally { f.close(); }
});
test("month-end anchored monthly renewal Feb28 to Mar31 grants once in legacy and Dahlia shapes", async () => {
  for (const modern of [false, true]) {
    const f = fixture();
    try {
      await f.owner(); f.paid({ modern }); await reconcileBilling(f.env, "owner");
      f.env.BILLING_NOW = "2026-02-28T12:00:00.000Z";
      f.paid({ modern, invoiceId: "in_renewal", periodStart: f.env.BILLING_NOW, periodEnd: "2026-03-31T12:00:00.000Z" });
      const status = await reconcileBilling(f.env, "owner");
      assert.equal(status.plan, "pro"); assert.equal(status.periodEnd, "2026-03-31T12:00:00.000Z");
      assert.equal(status.credits.available, 200);
      await reconcileBilling(f.env, "owner");
      assert.equal((await listCreditLedger(f.env, "owner")).entries.filter(e => e.kind === "grant").length, 2);
      assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 200);
    } finally { f.close(); }
  }
});
test("recurring period bounds accept leap-year anchors and daylight-saving time offsets", async () => {
  for (const [annual, start, end] of [
    [true, "2023-02-28T12:00:00.000Z", "2024-02-29T12:00:00.000Z"],
    [true, "2023-02-28T12:00:00.000Z", "2024-02-29T13:00:00.000Z"],
    [false, "2026-10-31T12:00:00.000Z", "2026-11-30T13:00:00.000Z"],
  ] as const) {
    const f = fixture();
    try {
      await f.owner(); f.env.BILLING_NOW = start;
      f.paid({ modern: true, annual, periodStart: start, periodEnd: end });
      const status = await reconcileBilling(f.env, "owner");
      assert.equal(status.plan, "pro"); assert.equal(status.periodEnd, end);
      assert.equal(status.credits.available, annual ? config.annualMonthlyCredits : config.monthlyCredits);
    } finally { f.close(); }
  }
});
test("unreasonable recurring periods reject even when paid invoice and Subscription match exactly", async () => {
  for (const annual of [false, true]) {
    for (const seconds of [0, -1, (annual ? 367 : 32) * 86400 + 1]) {
      const f = fixture();
      try {
        await f.owner();
        f.paid({ modern: true, annual, periodEnd: new Date(Date.parse(NOW) + seconds * 1000).toISOString() });
        await assert.rejects(reconcileBilling(f.env, "owner"), code("stripe_period_invalid"));
        const status = await getBillingStatus(f.env, "owner");
        assert.equal(status.plan, "free"); assert.equal(status.credits.available, 0);
        assert.equal((await listCreditLedger(f.env, "owner")).entries.length, 0);
        assert.equal((await getBillingAccount(f.env, "owner")).state.syncToken, null);
      } finally { f.close(); }
    }
  }
});
test("old events cannot revive canceled/refunded/disputed subscription; spent invoice reversal produces debt", async () => {
  const f = fixture();
  try {
    await f.owner(); const first = f.paid(); await reconcileBilling(f.env, "owner");
    await reserveCredits(f.env, "owner", "spent", 80); await settleCredits(f.env, "owner", "spent", "commit"); first.charge.refunded = true; first.charge.amount_refunded = 1000;
    assert.equal((await handleStripeWebhook(await signed(f.env, "charge.refunded", { id: first.charge.id, customer: "cus_owner" }, "evt_refund"), f.env)).status, 200);
    assert.equal((await getBillingStatus(f.env, "owner")).credits.debt, 80); assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    first.charge.refunded = false; first.charge.amount_refunded = 0; // Adversarial stale snapshot: terminal invoice marker wins.
    assert.equal((await handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }, "evt_old"), f.env)).status, 200);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free"); assert.equal((await getBillingStatus(f.env, "owner")).credits.debt, 80);
    const next = f.paid({ invoiceId: "in_two" }); await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 20);
    next.charge.disputed = true; await handleStripeWebhook(await signed(f.env, "charge.dispute.created", { id: "dp_one", charge: next.charge.id }, "evt_dispute"), f.env);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    const third = f.paid({ invoiceId: "in_three" }); third.sub.status = "canceled"; await reconcileBilling(f.env, "owner");
    third.sub.status = "active"; await handleStripeWebhook(await signed(f.env, "customer.subscription.updated", { id: "sub_one", customer: "cus_owner" }, "evt_cancel_old"), f.env);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
  } finally { f.close(); }
});
test("free invoice, wrong currency/price and unpaid renewal do not grant or restore; cancellation at period end retains paid access", async () => {
  const f = fixture();
  try {
    await f.owner(); const first = f.paid({ amount: 0 }); await reconcileBilling(f.env, "owner"); assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    first.invoice.amount_paid = 1000; first.invoice.currency = "eur"; await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 0);
    first.invoice.currency = "usd"; first.sub.cancel_at_period_end = true; await reconcileBilling(f.env, "owner");
    assert.equal((await getEntitlement(f.env, "owner")).plan, "pro"); assert.equal((await getBillingStatus(f.env, "owner")).nextRenewal, null);
    f.paid({ invoiceId: "in_failed", paid: false }); await handleStripeWebhook(await signed(f.env, "invoice.payment_failed", { id: "in_failed", customer: "cus_owner" }, "evt_failed"), f.env);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free"); assert.equal((await listCreditLedger(f.env, "owner")).entries.filter(e => e.kind === "grant").length, 1);
  } finally { f.close(); }
});
test("referral only first positive paid invoice once; refund revokes source even after referrer spent it", async () => {
  const f = fixture();
  try {
    await f.owner(); const referrer = await getBillingStatus(f.env, "referrer"); await attributeReferral(f.env, "owner", referrer.referral.code);
    const free = f.paid({ invoiceId: "in_free", amount: 0, created: stamp(NOW) - 10 });
    const first = f.paid({ invoiceId: "in_first" }); await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "referrer")).credits.available, 25);
    f.paid({ invoiceId: "in_next", created: stamp(NOW) + 1 }); await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "referrer")).credits.available, 25);
    await reserveCredits(f.env, "referrer", "refspent", 20); await settleCredits(f.env, "referrer", "refspent", "commit");
    first.charge.amount_refunded = 1000; first.charge.refunded = true; await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "referrer")).credits.debt, 20);
    assert.equal(free.invoice.amount_paid, 0);
  } finally { f.close(); }
});
test("unknown Checkout outcome never blindly retries; customer/checkout idempotency retained and recovered by authoritative list", async () => {
  const f = fixture();
  try {
    let timeout = true;
    f.override(async call => { if (call.path === "/checkout/sessions" && call.method === "POST" && timeout) { timeout = false; throw new TypeError("network timeout"); } return undefined; });
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly", requestId: "unknown" }), code("stripe_outcome_unknown"));
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("stripe_checkout_reconciliation_required"));
    const result = await createCheckout(f.env, "owner", { interval: "monthly", requestId: "unknown" }); assert.match(result.url, /stripe.com/);
    const attempts = f.calls.filter(c => c.path === "/checkout/sessions" && c.method === "POST"); assert.equal(attempts[0]!.key, attempts[1]!.key);
    f.env.BILLING_NOW = "2026-02-02T12:00:00.000Z";
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly", requestId: "unknown" }), code("stripe_checkout_reconciliation_required"));
  } finally { f.close(); }
});
test("scheduled maintenance rotates fairly including failed owners, mode isolates, recovers expired leases and annual anniversaries", async () => {
  const f = fixture();
  try {
    for (const uid of ["a", "b", "c", "d"]) await f.owner(uid, `cus_${uid}`);
    const annual = f.paid({ customerId: "cus_d", annual: true }); await reconcileBilling(f.env, "d");
    const held = await acquireBillingSync(f.env, "a");
    const first = await runBillingMaintenance(f.env, { limit: 2 }); assert.equal(first.failed[0]?.uid, "a"); assert.equal(first.failed[0]?.code, "billing_sync_busy");
    const second = await runBillingMaintenance(f.env, { limit: 2 }); assert.equal(second.processed, 2);
    assert.ok(f.calls.some(c => c.path === "/customers/cus_d"));
    f.env.BILLING_NOW = "2026-02-28T12:00:00.000Z";
    for (let i = 0; i < 2; i++) await runBillingMaintenance(f.env, { limit: 2 });
    assert.equal((await getBillingStatus(f.env, "d")).credits.available, 180); assert.equal((await getBillingAccount(f.env, "a")).state.syncToken, null);
    await releaseBillingSync(f.env, "a", held); assert.equal(annual.sub.status, "active");
    f.env.BILLING_CONFIG = JSON.stringify({ ...config, approved: false }); assert.equal((await runBillingMaintenance(f.env)).skipped, true);
  } finally { f.close(); }
});
test("Dahlia invoice payments and item periods verify positive payment, refund, dispute and replay without removed fields", async () => {
  const f = fixture();
  try {
    await f.owner(); const paid = f.paid({ modern: true });
    assert.equal(paid.invoice.paid, undefined); assert.equal(paid.charge.invoice, undefined); assert.equal(paid.sub.current_period_end, undefined);
    await reconcileBilling(f.env, "owner"); assert.equal((await getEntitlement(f.env, "owner")).plan, "pro");
    assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 100);
    await reserveCredits(f.env, "owner", "modernSpent", 80); await settleCredits(f.env, "owner", "modernSpent", "commit");
    paid.charge.amount_refunded = 10;
    const response = await handleStripeWebhook(await signed(f.env, "refund.updated", { id: "re_modern", charge: paid.charge.id }, "evt_modernrefund"), f.env);
    assert.equal(response.status, 200); assert.equal((await getBillingStatus(f.env, "owner")).credits.debt, 80);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    paid.charge.amount_refunded = 0;
    await handleStripeWebhook(await signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_owner" }, "evt_modernstale"), f.env);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    const renewed = f.paid({ invoiceId: "in_modernnext", modern: true }); await reconcileBilling(f.env, "owner");
    renewed.charge.disputed = true; await handleStripeWebhook(await signed(f.env, "charge.dispute.created", { id: "dp_modern", charge: renewed.charge.id }, "evt_moderndispute"), f.env);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
  } finally { f.close(); }
});
test("Dahlia payment allocation identity/currency and service period mismatches fail closed", async () => {
  const f = fixture();
  try {
    await f.owner(); const paid = f.paid({ modern: true }); const payment = f.invoicePayments.get("inpay_in_one")!;
    payment.invoice = "in_other";
    // Embedded foreign payment must not be trusted even when the aggregate invoice says paid.
    paid.invoice.payments = { data: [payment], has_more: false };
    await assert.rejects(reconcileBilling(f.env, "owner"), code("stripe_invoice_payment_invalid"));
    payment.invoice = "in_one"; payment.currency = "eur";
    await assert.rejects(reconcileBilling(f.env, "owner"), code("stripe_invoice_payment_invalid"));
    payment.currency = "usd"; payment.amount_paid = 500;
    await reconcileBilling(f.env, "owner"); assert.equal((await getEntitlement(f.env, "owner")).plan, "free", "unverified remainder cannot mint full benefits");
    payment.amount_paid = 1000;
    const line = (paid.invoice.lines as { data: JsonRecord[] }).data[0]!;
    line.period = { start: stamp(NOW) - 100, end: stamp("2026-02-28T12:00:00.000Z") };
    await reconcileBilling(f.env, "owner"); assert.equal((await getEntitlement(f.env, "owner")).plan, "free", "old invoice cannot fund a new service period");
    line.period = { start: stamp(NOW), end: stamp("2026-02-28T12:00:00.000Z") };
    await reconcileBilling(f.env, "owner"); assert.equal((await getEntitlement(f.env, "owner")).plan, "pro");
    assert.equal((await listCreditLedger(f.env, "owner")).entries.filter(e => e.kind === "grant").length, 1);
  } finally { f.close(); }
});
test("unverified off-Stripe records and prorated invoice lines cannot grant Credits or Pro", async () => {
  const f = fixture();
  try {
    await f.owner(); const paid = f.paid({ modern: true }); const payment = f.invoicePayments.get("inpay_in_one")!;
    payment.payment = { type: "payment_record", payment_record: "pyr_one" };
    await reconcileBilling(f.env, "owner"); assert.equal((await getEntitlement(f.env, "owner")).plan, "free");
    payment.payment = { type: "payment_intent", payment_intent: "pi_inone" };
    const line = (paid.invoice.lines as { data: JsonRecord[] }).data[0]!;
    (line.parent as { subscription_item_details: JsonRecord }).subscription_item_details.proration = true;
    await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 0);
  } finally { f.close(); }
});
test("dedicated Portal configuration is read-only validated and rejects inactive or wrong mode", async () => {
  const f = fixture();
  try {
    await f.owner(); f.env.BILLING_CONFIG = JSON.stringify({ ...config, portalConfigurationId: "bpc_dedicated" });
    const portal: JsonRecord = { id: "bpc_dedicated", active: true, livemode: false };
    f.override(async call => call.path === "/billing_portal/configurations/bpc_dedicated" ? Response.json(portal) : undefined);
    await createPortal(f.env, "owner");
    assert.equal(f.calls.find(c => c.path === "/billing_portal/sessions")?.form.get("configuration"), "bpc_dedicated");
    portal.active = false; await assert.rejects(createPortal(f.env, "owner"), code("stripe_portal_configuration_invalid"));
    portal.active = true; portal.livemode = true; await assert.rejects(createPortal(f.env, "owner"), code("stripe_mode_mismatch"));
    assert.equal(f.calls.filter(c => c.path.startsWith("/billing_portal/configurations/")).every(c => c.method === "GET"), true);
    assert.equal(f.calls.filter(c => c.path === "/billing_portal/sessions").length, 1);
  } finally { f.close(); }
});
test("Webhook Secret gates direct Checkout; restricted keys work; random integration identifier remains stable on retry", async () => {
  const f = fixture();
  try {
    delete f.env.STRIPE_WEBHOOK_SECRET;
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("stripe_webhook_not_configured")); assert.equal(f.calls.length, 0);
    await assert.rejects(createPortal(f.env, "owner"), code("stripe_webhook_not_configured"));
    f.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture"; f.env.STRIPE_SECRET_KEY = "pk_test_fixture";
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("stripe_not_configured"));
    f.env.STRIPE_SECRET_KEY = "rk_test_fixture"; let failed = true;
    f.override(async call => { if (call.path === "/checkout/sessions" && call.method === "POST" && failed) { failed = false; throw new TypeError("timeout"); } return undefined; });
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly", requestId: "identifier" }), code("stripe_outcome_unknown"));
    await createCheckout(f.env, "owner", { interval: "monthly", requestId: "identifier" });
    const attempts = f.calls.filter(c => c.path === "/checkout/sessions" && c.method === "POST");
    assert.match(attempts[0]!.form.get("integration_identifier")!, /^guilduo_checkout_[a-z]{8}$/);
    assert.equal(attempts[0]!.form.get("integration_identifier"), attempts[1]!.form.get("integration_identifier"));
    await assert.rejects(createCheckout(f.env, "owner", { interval: "annual" }), code("billing_checkout_conflict"));
  } finally { f.close(); }
});
test("prior paid history cannot receive retrospective referral, even when D1 subscription was never synchronized", async () => {
  const f = fixture();
  try {
    await f.owner(); const paid = f.paid(); f.subscriptions.clear();
    const referrer = await getBillingStatus(f.env, "referrer");
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly", referralCode: referrer.referral.code }), code("referral_ineligible"));
    await reconcileBilling(f.env, "owner");
    await assert.rejects(attributeReferral(f.env, "owner", referrer.referral.code), code("referral_ineligible"));
    assert.equal((await getBillingStatus(f.env, "referrer")).credits.available, 0); assert.equal(paid.invoice.status, "paid");
  } finally { f.close(); }
});
test("unknown owned-customer webhook mapping asks retry and remains unprocessed until recovered", async () => {
  const f = fixture();
  try {
    f.customers.set("cus_pending", { id: "cus_pending", livemode: false, metadata: { guilduo_uid: "owner", guilduo_mode: "test" } });
    f.paid({ customerId: "cus_pending", modern: true });
    const send = () => signed(f.env, "invoice.paid", { id: "in_one", customer: "cus_pending" }, "evt_pendingmap");
    assert.equal((await handleStripeWebhook(await send(), f.env)).status, 503);
    assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS count FROM billing_stripe_events WHERE event_id='evt_pendingmap'").get()?.count, 0);
    await setBillingCustomer(f.env, "owner", "cus_pending");
    assert.equal((await handleStripeWebhook(await send(), f.env)).status, 200); assert.equal((await getEntitlement(f.env, "owner")).plan, "pro");
  } finally { f.close(); }
});
test("automatic tax without active registration fails before customer or Checkout creation", async () => {
  const f = fixture();
  try {
    f.env.BILLING_CONFIG = JSON.stringify({ ...config, automaticTax: true }); let registered = false;
    f.override(async call => call.path === "/tax/registrations" ? Response.json({ data: registered ? [{ id: "taxreg_one", livemode: false, status: "active" }] : [], has_more: false }) : undefined);
    await assert.rejects(createCheckout(f.env, "owner", { interval: "monthly" }), code("stripe_tax_registration_required"));
    assert.equal(f.calls.some(c => c.method === "POST"), false);
    registered = true; await createCheckout(f.env, "owner", { interval: "monthly" });
    assert.equal(f.calls.find(c => c.path === "/checkout/sessions" && c.method === "POST")?.form.get("automatic_tax[enabled]"), "true");
  } finally { f.close(); }
});
test("Dahlia split Invoice Payments verify every allocation and a refund of either charge revokes the source", async () => {
  const f = fixture();
  try {
    await f.owner(); const paid = f.paid({ modern: true });
    f.invoicePayments.get("inpay_in_one")!.amount_paid = 400;
    f.invoicePayments.set("inpay_split", { id: "inpay_split", invoice: "in_one", livemode: false, currency: "usd", amount_paid: 600, status: "paid", payment: { type: "payment_intent", payment_intent: "pi_split" } });
    f.intents.set("pi_split", { id: "pi_split", customer: "cus_owner", livemode: false, currency: "usd", status: "succeeded", latest_charge: "ch_split" });
    f.charges.set("ch_split", { id: "ch_split", customer: "cus_owner", livemode: false, payment_intent: "pi_split", paid: true, refunded: false, amount_refunded: 0, disputed: false });
    await reconcileBilling(f.env, "owner"); assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 100);
    f.charges.get("ch_split")!.amount_refunded = 1;
    await handleStripeWebhook(await signed(f.env, "charge.refunded", { id: "ch_split", customer: "cus_owner" }, "evt_splitrefund"), f.env);
    assert.equal((await getEntitlement(f.env, "owner")).plan, "free"); assert.equal((await getBillingStatus(f.env, "owner")).credits.available, 0);
    assert.equal(paid.charge.refunded, false, "refund on the second charge still revokes the invoice");
  } finally { f.close(); }
});
test("a first payment already refunded at initial reconciliation never briefly grants referral Credits", async () => {
  const f = fixture();
  try {
    await f.owner(); const referrer = await getBillingStatus(f.env, "referrer"); await attributeReferral(f.env, "owner", referrer.referral.code);
    f.paid({ modern: true, refunded: true });
    await reconcileBilling(f.env, "owner"); await reconcileBilling(f.env, "owner");
    assert.equal((await listCreditLedger(f.env, "referrer")).entries.length, 0);
    assert.equal((await getBillingStatus(f.env, "owner")).referral.rewarded, false);
  } finally { f.close(); }
});
