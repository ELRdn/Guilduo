import {
  acquireBillingSync, applyBillingSnapshot, attributeReferral, billingError, billingMode, billingNow,
  findBillingCustomer, getBillingAccount, getBillingConfig, getBillingStatus, getReferral, grantPeriodicCredits,
  markStripeEventProcessed, releaseBillingSync, requireBillingDb, reverseInvoiceCredits, reverseReferral,
  rewardReferral, setBillingCustomer, stripeEventProcessed, listBillingMaintenanceOwners, markBillingMaintenanceAttempt, updateBillingOperation,
} from "./billing-store.ts";
import type { BillingConfig, BillingEnv, BillingPricing, BillingStatus, PublishedBillingDiscount, PublishedBillingPrice, SubscriptionSnapshot } from "./billing-store.ts";
import type { JsonRecord, WorkerError } from "./worker-types.ts";
import { analyticsBackground, recordAnalyticsPayment } from "./launch-analytics.ts";

export interface CheckoutInput { interval: "monthly" | "annual"; referralCode?: string; requestId?: string }
const API = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const encoder = new TextEncoder();
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function id(value: unknown): string { return typeof value === "string" ? value : typeof record(value).id === "string" ? record(value).id as string : ""; }
function iso(value: unknown): string {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw billingError(502, "stripe_response_invalid", "Stripe returned an invalid timestamp.");
  return new Date(Number(value) * 1000).toISOString();
}
async function hash(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))].map(b => b.toString(16).padStart(2, "0")).join(""); }
function requireStripe(env: BillingEnv): BillingConfig {
  requireBillingDb(env); const config = getBillingConfig(env, true)!; const mode = billingMode(env);
  if (!env.STRIPE_SECRET_KEY || !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9_]+$`).test(env.STRIPE_SECRET_KEY)) throw billingError(503, "stripe_not_configured", "Stripe secret or restricted key must match the configured mode.");
  if (mode === "live" && (!config.refundPolicy || !config.taxBehavior || typeof config.automaticTax !== "boolean")) throw billingError(503, "billing_live_terms_required", "Live requires approved refund, tax behavior and automatic-tax choices.");
  return config;
}
function requireSubscriptionConfig(env: BillingEnv): BillingConfig {
  const config = requireStripe(env);
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) throw billingError(503, "stripe_webhook_not_configured", "Subscription payment operations require a Webhook Secret.");
  return config;
}
async function stripe(env: BillingEnv, path: string, form?: URLSearchParams, requestKey?: string): Promise<JsonRecord> {
  requireStripe(env);
  // No automatic retry: a timed-out POST can already have succeeded at Stripe.
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { method: form ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "stripe-version": STRIPE_API_VERSION,
        ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...(requestKey ? { "idempotency-key": requestKey } : {}) }, body: form });
  } catch { throw billingError(503, "stripe_outcome_unknown", "Stripe outcome is unknown. Reconcile before retrying with the same request ID."); }
  if (!response.ok) throw billingError(response.status >= 500 || response.status === 429 ? 503 : 502, "stripe_request_failed", "Stripe rejected the operation.");
  const value = record(await response.json());
  if (!Object.keys(value).length) throw billingError(502, "stripe_response_invalid", "Stripe returned an invalid object.");
  return value;
}
function validateMode(env: BillingEnv, object: JsonRecord): void {
  if (object.livemode !== (billingMode(env) === "live")) throw billingError(409, "stripe_mode_mismatch", "Stripe object belongs to a different mode.");
}
function validateCustomerObject(env: BillingEnv, uid: string, customer: JsonRecord): void {
  validateMode(env, customer); const metadata = record(customer.metadata);
  if (customer.deleted || metadata.guilduo_uid !== uid || metadata.guilduo_mode !== billingMode(env)) throw billingError(409, "stripe_customer_identity", "Stripe customer identity does not match its owner.");
}
function webUrl(env: BillingEnv): string {
  const url = new URL(env.WEB_APP_URL || "https://app.guilduo.com/");
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && !env.APPWRITE_PROJECT_ID && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw billingError(503, "billing_web_url_invalid", "Billing requires a secure Web App URL.");
  return new URL("/", url).toString();
}
async function ensureCustomer(env: BillingEnv, uid: string, token: string): Promise<string> {
  const account = await getBillingAccount(env, uid); const existing = account.customerId;
  if (existing) { validateCustomerObject(env, uid, await stripe(env, `/customers/${encodeURIComponent(existing)}`)); return existing; }
  if (account.state.customerCreationStartedAt && billingNow(env).getTime() - Date.parse(account.state.customerCreationStartedAt) >= 23 * 3600000) throw billingError(409, "stripe_customer_reconciliation_required", "Ambiguous customer creation requires administrative reconciliation before the idempotency window expires.");
  await updateBillingOperation(env, uid, token, { customerCreationStartedAt: account.state.customerCreationStartedAt || billingNow(env).toISOString() });
  const customer = await stripe(env, "/customers", new URLSearchParams({ "metadata[guilduo_uid]": uid, "metadata[guilduo_mode]": billingMode(env) }), `guilduo-customer-${await hash(JSON.stringify([billingMode(env), uid]))}`);
  validateCustomerObject(env, uid, customer);
  if (!/^cus_[A-Za-z0-9]+$/.test(id(customer))) throw billingError(502, "stripe_response_invalid", "Invalid Stripe customer ID.");
  await setBillingCustomer(env, uid, id(customer)); return id(customer);
}
async function validatePrice(env: BillingEnv, priceId: string, interval: "monthly" | "annual", config: BillingConfig): Promise<PublishedBillingPrice> {
  const price = await stripe(env, `/prices/${encodeURIComponent(priceId)}`); validateMode(env, price);
  if (price.id !== priceId || price.active !== true || price.currency !== config.currency || !Number.isSafeInteger(price.unit_amount) || Number(price.unit_amount) <= 0
    || record(price.recurring).interval !== (interval === "monthly" ? "month" : "year") || record(price.recurring).interval_count !== 1
    || (config.taxBehavior !== undefined && price.tax_behavior !== config.taxBehavior)) throw billingError(409, "stripe_price_invalid", "Stripe price does not match approved currency, tax and recurrence.");
  return { priceId, amount: Number(price.unit_amount), interval: interval === "monthly" ? "month" : "year", intervalCount: 1,
    taxBehavior: String(price.tax_behavior || "unspecified"), creditsPerMonth: interval === "monthly" ? config.monthlyCredits : config.annualMonthlyCredits };
}
const priceCache = new WeakMap<object, { key: string; until: number; value: BillingPricing }>();
export async function getPublicBillingPrices(env: BillingEnv): Promise<BillingPricing | null> {
  if (env.BILLING_ENABLED !== "true" || !getBillingConfig(env)) return null;
  const config = requireStripe(env); const cacheKey = JSON.stringify([billingMode(env), config]); const cached = priceCache.get(env);
  if (cached && cached.key === cacheKey && cached.until > billingNow(env).getTime()) return structuredClone(cached.value);
  const discount = async (couponId: string | undefined): Promise<PublishedBillingDiscount | null> => {
    if (!couponId) return null;
    const coupon = await stripe(env, `/coupons/${encodeURIComponent(couponId)}`); validateMode(env, coupon);
    if (coupon.id !== couponId || coupon.valid !== true || (coupon.currency !== undefined && coupon.currency !== null && coupon.currency !== config.currency)
      || (coupon.redeem_by && iso(coupon.redeem_by) <= billingNow(env).toISOString()) || !["once", "forever", "repeating"].includes(String(coupon.duration))
      || !((typeof coupon.percent_off === "number" && coupon.percent_off > 0 && coupon.percent_off <= 100 && (coupon.amount_off === null || coupon.amount_off === undefined))
        || (Number.isSafeInteger(coupon.amount_off) && Number(coupon.amount_off) > 0 && coupon.currency === config.currency && (coupon.percent_off === null || coupon.percent_off === undefined)))
      || (coupon.duration === "repeating" && (!Number.isSafeInteger(coupon.duration_in_months) || Number(coupon.duration_in_months) <= 0))) throw billingError(409, "stripe_coupon_invalid", "Coupon does not match approved product terms.");
    return { couponId, percentOff: typeof coupon.percent_off === "number" ? coupon.percent_off : null, amountOff: typeof coupon.amount_off === "number" ? coupon.amount_off : null,
      currency: typeof coupon.currency === "string" ? coupon.currency : null, duration: String(coupon.duration), durationMonths: typeof coupon.duration_in_months === "number" ? coupon.duration_in_months : null, redeemBy: coupon.redeem_by ? iso(coupon.redeem_by) : null };
  };
  const [monthly, annual, launchDiscount, referralDiscount] = await Promise.all([validatePrice(env, config.monthlyPriceId, "monthly", config), validatePrice(env, config.annualPriceId, "annual", config), discount(config.launchCouponId), discount(config.referralCouponId)]);
  const value: BillingPricing = { approved: true, month: { ...monthly, currency: config.currency }, year: { ...annual, currency: config.currency }, terms: [], currency: config.currency, monthly, annual, launchDiscount, referralDiscount,
    creditLifetimeDays: config.creditLifetimeDays, decisionCredits: config.decisionCredits, referralCredits: config.referralCredits,
    refundPolicy: config.refundPolicy || null, taxBehavior: config.taxBehavior || null, automaticTax: config.automaticTax === true, autoTopUp: false };
  priceCache.set(env, { key: cacheKey, until: billingNow(env).getTime() + 60000, value }); return structuredClone(value);
}
function hostedUrl(value: unknown, kind: "checkout" | "portal"): string {
  if (typeof value !== "string") throw billingError(502, "stripe_response_invalid", "Stripe did not return a hosted URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com") || url.username || url.password || url.port) throw billingError(502, "stripe_response_invalid", "Invalid Stripe hosted URL.");
  return url.toString();
}
export async function createCheckout(env: BillingEnv, uid: string, input: CheckoutInput | JsonRecord): Promise<{ url: string }> {
  const config = requireSubscriptionConfig(env);
  if (!input || (input.interval !== "monthly" && input.interval !== "annual") || Object.keys(input).some(k => !["interval", "referralCode", "requestId"].includes(k))
    || (input.requestId !== undefined && (typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(input.requestId)))) throw billingError(400, "billing_checkout_invalid", "Invalid Checkout input.");
  const token = await acquireBillingSync(env, uid);
  try {
  await resolveCheckoutAttempt(env, uid, token);
  const account = await getBillingAccount(env, uid);
  const price = input.interval === "monthly" ? config.monthlyPriceId : config.annualPriceId;
  await validatePrice(env, price, input.interval, config); await getPublicBillingPrices(env);
  if (config.automaticTax) {
    const registrations = await listStripe(env, "/tax/registrations", new URLSearchParams({ status: "active" }));
    if (!registrations.some(r => r.status === "active" && (!r.active_from || iso(r.active_from) <= billingNow(env).toISOString()) && (!r.expires_at || iso(r.expires_at) > billingNow(env).toISOString()))) throw billingError(503, "stripe_tax_registration_required", "Automatic tax requires an active registration.");
    for (const registration of registrations) validateMode(env, registration);
  }
  const customer = await ensureCustomer(env, uid, token); const base = webUrl(env);
  const subscriptions = await listStripe(env, "/subscriptions", new URLSearchParams({ customer, status: "all" }));
  for (const subscription of subscriptions) {
    owned(env, subscription, customer);
    if (["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(String(subscription.status))) throw billingError(409, "billing_subscription_exists", "Manage the existing subscription in Customer Portal.");
  }
  if (input.referralCode !== undefined) {
    if (typeof input.referralCode !== "string") throw billingError(400, "referral_invalid", "Referral code must be a string.");
    const existingReferral = await getReferral(env, uid);
    if (!existingReferral) {
      const invoices = await listStripe(env, "/invoices", new URLSearchParams({ customer }));
      for (const invoice of invoices) owned(env, invoice, customer);
      if (invoices.some(positivePaid)) throw billingError(409, "referral_ineligible", "A previous paid invoice cannot receive referral attribution.");
    }
    await attributeReferral(env, uid, input.referralCode);
  }
  const form = new URLSearchParams({ mode: "subscription", customer, "line_items[0][price]": price, "line_items[0][quantity]": "1",
    success_url: `${base}?billing=return`, cancel_url: `${base}?billing=cancelled`,
    "subscription_data[metadata][guilduo_uid]": uid, "subscription_data[metadata][guilduo_mode]": billingMode(env) });
  form.set("automatic_tax[enabled]", String(config.automaticTax === true));
  const referral = await getReferral(env, uid);
  const coupon = referral ? config.referralCouponId : config.launchCouponId;
  if (coupon) { await getPublicBillingPrices(env); form.set("discounts[0][coupon]", coupon); }
  const previous = account.state.checkoutAttempt;
  if (previous && previous.interval !== input.interval) throw billingError(409, "billing_checkout_conflict", "Resolve the previous Checkout before changing its interval.");
  const requestId = typeof input.requestId === "string" ? input.requestId : previous?.requestId || crypto.randomUUID();
  if (previous && requestId !== previous.requestId) throw billingError(409, "stripe_checkout_reconciliation_required", "Resolve the previous Checkout before starting another.");
  if (previous && previous.startedAt && billingNow(env).getTime() - Date.parse(previous.startedAt) >= 23 * 3600000) throw billingError(409, "stripe_checkout_reconciliation_required", "Checkout must be reconciled before its idempotency window expires.");
  if (previous?.url) return { url: previous.url };
  if (previous && input.requestId === undefined) throw billingError(409, "stripe_checkout_reconciliation_required", "Unknown Checkout outcome requires reconciliation or an explicit retry with the same request ID.");
  const integrationIdentifier = previous?.integrationIdentifier || `guilduo_checkout_${[...crypto.getRandomValues(new Uint8Array(8))].map(b => String.fromCharCode(97 + b % 26)).join("")}`;
  form.set("integration_identifier", integrationIdentifier);
  await updateBillingOperation(env, uid, token, { checkoutAttempt: { requestId, interval: input.interval, startedAt: previous?.startedAt || billingNow(env).toISOString(), url: null, integrationIdentifier } });
  form.set("metadata[guilduo_request_id]", requestId); form.set("metadata[guilduo_interval]", input.interval);
  const session = await stripe(env, "/checkout/sessions", form, `guilduo-checkout-${await hash(JSON.stringify([billingMode(env), uid, requestId]))}`);
  validateMode(env, session);
  if (id(session.customer) !== customer) throw billingError(409, "stripe_customer_identity", "Checkout belongs to another customer.");
  const url = hostedUrl(session.url, "checkout");
  await updateBillingOperation(env, uid, token, { checkoutAttempt: { requestId, interval: input.interval, startedAt: previous?.startedAt || billingNow(env).toISOString(), url, sessionId: id(session), integrationIdentifier } });
  return { url };
  } finally { await releaseBillingSync(env, uid, token); }
}
async function resolveCheckoutAttempt(env: BillingEnv, uid: string, token: string): Promise<void> {
  const account = await getBillingAccount(env, uid); const attempt = account.state.checkoutAttempt;
  if (!attempt || !account.customerId) return;
  const sessions = attempt.sessionId ? [await stripe(env, `/checkout/sessions/${encodeURIComponent(attempt.sessionId)}`)]
    : await listStripe(env, "/checkout/sessions", new URLSearchParams({ customer: account.customerId }));
  const matching = sessions.filter(session => record(session.metadata).guilduo_request_id === attempt.requestId);
  if (matching.length > 1) throw billingError(409, "stripe_checkout_reconciliation_required", "Multiple Checkout sessions require administrative reconciliation.");
  const session = matching[0]; if (!session) return;
  owned(env, session, account.customerId);
  if (session.status === "complete" || session.status === "expired") await updateBillingOperation(env, uid, token, { checkoutAttempt: undefined });
  else if (session.status === "open") await updateBillingOperation(env, uid, token, { checkoutAttempt: { ...attempt, sessionId: id(session), url: hostedUrl(session.url, "checkout") } });
  else throw billingError(502, "stripe_response_invalid", "Invalid Checkout session status.");
}
export async function createPortal(env: BillingEnv, uid: string): Promise<{ url: string }> {
  const config = requireSubscriptionConfig(env); const customer = (await getBillingAccount(env, uid)).customerId;
  if (!customer) throw billingError(404, "billing_customer_missing", "No Stripe customer exists for this owner.");
  validateCustomerObject(env, uid, await stripe(env, `/customers/${encodeURIComponent(customer)}`));
  const form = new URLSearchParams({ customer, return_url: webUrl(env) });
  if (config.portalConfigurationId) {
    const portal = await stripe(env, `/billing_portal/configurations/${encodeURIComponent(config.portalConfigurationId)}`); validateMode(env, portal);
    if (portal.id !== config.portalConfigurationId || portal.active !== true) throw billingError(409, "stripe_portal_configuration_invalid", "Portal configuration must be active and match the approved ID.");
    form.set("configuration", config.portalConfigurationId);
  }
  const session = await stripe(env, "/billing_portal/sessions", form);
  return { url: hostedUrl(session.url, "portal") };
}
async function listStripe(env: BillingEnv, path: string, params: URLSearchParams): Promise<JsonRecord[]> {
  const all: JsonRecord[] = []; params.set("limit", "100");
  // Fail closed instead of silently ignoring old paid invoices/refunds.
  for (let page = 0; page < 20; page++) {
    const result = await stripe(env, `${path}?${params}`);
    if (!Array.isArray(result.data) || typeof result.has_more !== "boolean") throw billingError(502, "stripe_response_invalid", "Invalid Stripe list.");
    const values = result.data.map(record); all.push(...values);
    if (!result.has_more) return all;
    const last = values.at(-1); if (!last || !id(last)) break;
    params.set("starting_after", id(last));
  }
  throw billingError(503, "stripe_history_limit", "Stripe history requires a paginated administrative reconciliation.");
}
function owned(env: BillingEnv, value: JsonRecord, customerId: string): void {
  validateMode(env, value);
  if (id(value.customer) !== customerId) throw billingError(409, "stripe_customer_identity", "Stripe object belongs to another owner.");
}
function invoiceInterval(invoice: JsonRecord, config: BillingConfig): "monthly" | "annual" | null {
  const lines = record(invoice.lines);
  if (lines.has_more === true || !Array.isArray(lines.data) || lines.data.length !== 1) return null;
  const line = record(lines.data[0]); const price = record(line.price); const recurring = record(price.recurring);
  const parent = record(line.parent); const pricing = record(line.pricing);
  const prorated = line.proration === true || record(parent.subscription_item_details).proration === true || record(parent.invoice_item_details).proration === true;
  if (line.quantity !== 1 || prorated || invoice.currency !== config.currency || (line.currency !== undefined && line.currency !== config.currency)) return null;
  if (Object.hasOwn(line, "pricing")) {
    if (pricing.type !== "price_details") return null;
    const priceId = id(record(pricing.price_details).price);
    if (priceId === config.monthlyPriceId) return "monthly";
    if (priceId === config.annualPriceId) return "annual";
    return null;
  }
  if (price.currency !== config.currency || recurring.interval_count !== 1) return null;
  if (price.id === config.monthlyPriceId && recurring.interval === "month") return "monthly";
  if (price.id === config.annualPriceId && recurring.interval === "year") return "annual";
  return null;
}
function invoiceSubscription(invoice: JsonRecord): string { return id(record(record(invoice.parent).subscription_details).subscription) || id(invoice.subscription); }
function positivePaid(invoice: JsonRecord): boolean {
  return invoice.status === "paid" && (invoice.paid === undefined || invoice.paid === true) && Number.isSafeInteger(invoice.amount_paid) && Number(invoice.amount_paid) > 0;
}
async function inspectInvoicePayment(env: BillingEnv, invoice: JsonRecord, customer: string): Promise<{ verified: boolean; unsafe: boolean; refundedMinor: number; refundExact: boolean; disputed: boolean }> {
  let unsafe = false; let refundedMinor = 0; let refundExact = true; let disputed = false; const seenCharges = new Set<string>();
  const checkCharge = async (chargeId: string, intentId?: string, allocation?: number): Promise<JsonRecord> => {
    if (!chargeId) throw billingError(409, "stripe_invoice_charge_invalid", "Paid invoice has no verifiable charge.");
    const charge = await stripe(env, `/charges/${encodeURIComponent(chargeId)}`); owned(env, charge, customer);
    if (charge.paid !== true || (intentId && id(charge.payment_intent) !== intentId) || (!intentId && invoice.charge && id(charge.invoice) !== id(invoice))) throw billingError(409, "stripe_invoice_charge_invalid", "Charge does not match the paid invoice.");
    if (!Number.isSafeInteger(charge.amount_refunded) || Number(charge.amount_refunded)<0 || charge.currency!==invoice.currency || !Number.isSafeInteger(charge.amount) || Number(charge.amount)!==(allocation ?? Number(invoice.amount_paid))) refundExact=false;
    // Any partial refund/dispute conservatively revokes the invoice's benefits under the selected refund policy.
    unsafe ||= charge.disputed === true || charge.refunded === true || Number(charge.amount_refunded) > 0;
    if (!seenCharges.has(chargeId)) {
      seenCharges.add(chargeId);
      if (Number.isSafeInteger(charge.amount_refunded) && Number(charge.amount_refunded) >= 0) refundedMinor += Number(charge.amount_refunded);
      disputed ||= charge.disputed === true;
    }
    return charge;
  };
  if (invoice.charge) { await checkCharge(id(invoice.charge)); return { verified: true, unsafe, refundedMinor, refundExact, disputed }; }
  // Dahlia removed invoice.charge/payment_intent/paid and charge.invoice. Invoice Payments are now the linkage.
  const embedded = record(invoice.payments);
  const payments = Array.isArray(embedded.data) && embedded.has_more === false ? embedded.data.map(record)
    : await listStripe(env, "/invoice_payments", new URLSearchParams({ invoice: id(invoice) }));
  let allocated = 0;
  for (const payment of payments) {
    validateMode(env, payment);
    if (id(payment.invoice) !== id(invoice) || payment.currency !== invoice.currency) throw billingError(409, "stripe_invoice_payment_invalid", "Invoice Payment belongs to another invoice or currency.");
    if (payment.status !== "paid") continue;
    if (!Number.isSafeInteger(payment.amount_paid) || Number(payment.amount_paid) <= 0) throw billingError(409, "stripe_invoice_payment_invalid", "Invalid paid allocation.");
    const data = record(payment.payment);
    if (data.type === "payment_intent") {
      const intent = await stripe(env, `/payment_intents/${encodeURIComponent(id(data.payment_intent))}`); owned(env, intent, customer);
      if (intent.status !== "succeeded" || intent.currency !== invoice.currency) throw billingError(409, "stripe_invoice_payment_invalid", "Invoice Payment is not confirmed.");
      await checkCharge(id(intent.latest_charge), id(intent), Number(payment.amount_paid)); allocated += Number(payment.amount_paid);
    } else if (data.type === "charge") { await checkCharge(id(data.charge), undefined, Number(payment.amount_paid)); allocated += Number(payment.amount_paid); }
    // Off-Stripe payment records do not provide a confirmed refundable Stripe payment.
  }
  return { verified: allocated >= Number(invoice.amount_paid), unsafe, refundedMinor, refundExact, disputed };
}
interface ReconcileHint { invoiceId?: string; chargeId?: string; subscriptionId?: string }
async function reconcile(env: BillingEnv, uid: string, hint: ReconcileHint = {}): Promise<BillingStatus> {
  const config = requireStripe(env); const account = await getBillingAccount(env, uid);
  if (!account.customerId) return getBillingStatus(env, uid);
  const token = await acquireBillingSync(env, uid); const customer = account.customerId;
  try {
    validateCustomerObject(env, uid, await stripe(env, `/customers/${encodeURIComponent(customer)}`));
    await resolveCheckoutAttempt(env, uid, token);
    const subscriptions = await listStripe(env, "/subscriptions", new URLSearchParams({ customer, status: "all" }));
    for (const sub of subscriptions) owned(env, sub, customer);
    if (hint.subscriptionId && !subscriptions.some(s => id(s) === hint.subscriptionId)) {
      const sub = await stripe(env, `/subscriptions/${encodeURIComponent(hint.subscriptionId)}`); owned(env, sub, customer); subscriptions.push(sub);
    }
    const invoices = await listStripe(env, "/invoices", new URLSearchParams({ customer }));
    for (const invoice of invoices) owned(env, invoice, customer);
    if (hint.chargeId) {
      const charge = await stripe(env, `/charges/${encodeURIComponent(hint.chargeId)}`); owned(env, charge, customer);
      hint.invoiceId = id(charge.invoice) || undefined;
    }
    if (hint.invoiceId && !invoices.some(i => id(i) === hint.invoiceId)) {
      const invoice = await stripe(env, `/invoices/${encodeURIComponent(hint.invoiceId)}`); owned(env, invoice, customer); invoices.push(invoice);
    }
    const blockedInvoices = [...account.state.blockedInvoices]; const blockedSubscriptions = [...account.state.blockedSubscriptions];
    const paidInvoices: JsonRecord[] = [];
    const firstPositive = invoices.filter(positivePaid).sort((a, b) => Number(record(a.status_transitions).paid_at || a.created) - Number(record(b.status_transitions).paid_at || b.created) || id(a).localeCompare(id(b)))[0];
    for (const invoice of invoices) {
      const interval = invoiceInterval(invoice, config);
      // Inspect refunds even for historically-approved prices no longer in today's config.
      if (positivePaid(invoice)) {
        const payment = await inspectInvoicePayment(env, invoice, customer);
        if (payment.unsafe) blockedInvoices.push(id(invoice));
        if (payment.verified && interval) paidInvoices.push(invoice);
        if (payment.verified && interval && env.ANALYTICS_ENABLED === "true") {
          // Projection failure never changes payment entitlement; the next Stripe reconciliation repairs it.
          await analyticsBackground(env, recordAnalyticsPayment(env, uid, { invoiceId: id(invoice), paidAt: iso(record(invoice.status_transitions).paid_at || invoice.created),
            currency: String(invoice.currency), paidMinor: Number(invoice.amount_paid), refundedMinor: Math.min(Number(invoice.amount_paid), payment.refundedMinor), refundExact: payment.refundExact, disputed: payment.disputed, interval, initial: id(invoice)===id(firstPositive) }));
        }
      }
    }
    for (const sub of subscriptions) if (["canceled", "incomplete_expired"].includes(String(sub.status))) blockedSubscriptions.push(id(sub));
    let snapshot: SubscriptionSnapshot | null = null;
    for (const sub of subscriptions.sort((a, b) => Number(b.created) - Number(a.created))) {
      const items = record(sub.items); const item = Array.isArray(items.data) && items.data.length === 1 ? record(items.data[0]) : {};
      const price = record(item.price); const interval = price.id === config.monthlyPriceId ? "monthly" : price.id === config.annualPriceId ? "annual" : null;
      if (!interval || price.currency !== config.currency || record(price.recurring).interval !== (interval === "monthly" ? "month" : "year") || record(price.recurring).interval_count !== 1 || item.quantity !== 1) continue;
      const start = iso(item.current_period_start ?? sub.current_period_start); const end = iso(item.current_period_end ?? sub.current_period_end);
      const invoice = paidInvoices.find(invoice => {
        const line = record((record(invoice.lines).data as unknown[])[0]); const period = record(line.period);
        return id(invoice) === id(sub.latest_invoice) && invoiceSubscription(invoice) === id(sub) && invoiceInterval(invoice, config) === interval
          && period.start === Date.parse(start) / 1000 && period.end === Date.parse(end) / 1000;
      });
      const current: SubscriptionSnapshot = {
        id: id(sub), status: String(sub.status), periodStart: start, periodEnd: end, interval,
        invoiceId: id(sub.latest_invoice), invoicePaid: Boolean(invoice && !blockedInvoices.includes(id(invoice))), cancelAtPeriodEnd: sub.cancel_at_period_end === true,
        monthlyCredits: interval === "monthly" ? config.monthlyCredits : config.annualMonthlyCredits, lifetimeDays: config.creditLifetimeDays,
      };
      // Stripe keeps the original billing anchor after a short month; elapsed bounds also allow DST/leap shifts.
      // Price recurrence and the exact paid invoice service period are independently verified above.
      const duration = Date.parse(current.periodEnd) - Date.parse(current.periodStart);
      if (duration <= 0 || duration > (interval === "annual" ? 367 : 32) * 86400000) throw billingError(409, "stripe_period_invalid", "Invalid subscription period.");
      const previous = account.state.subscription;
      if (previous?.invoiceId === current.invoiceId) { current.monthlyCredits = previous.monthlyCredits; current.lifetimeDays = previous.lifetimeDays; }
      if (!snapshot || (current.status === "active" && current.invoicePaid && !blockedSubscriptions.includes(current.id))) snapshot = current;
      if (snapshot.status === "active" && snapshot.invoicePaid && !blockedSubscriptions.includes(snapshot.id)) break;
    }
    // Lease serializes network snapshots; terminal invoice/subscription markers are monotonic.
    await applyBillingSnapshot(env, uid, token, snapshot, blockedInvoices, blockedSubscriptions, firstPositive ? { id: id(firstPositive), paidAt: iso(record(firstPositive.status_transitions).paid_at) } : undefined);
    for (const invoiceId of new Set(blockedInvoices)) { await reverseInvoiceCredits(env, uid, invoiceId); await reverseReferral(env, uid, invoiceId); }
    await grantPeriodicCredits(env, uid);
    if (firstPositive && paidInvoices.some(invoice => id(invoice) === id(firstPositive))) {
      // First paid invoice is consumed even when refunded; later invoices cannot earn another referral.
      await rewardReferral(env, uid, id(firstPositive), iso(record(firstPositive.status_transitions).paid_at), { reversed: blockedInvoices.includes(id(firstPositive)) });
    }
    return await getBillingStatus(env, uid);
  } finally { await releaseBillingSync(env, uid, token); }
}
export async function reconcileBilling(env: BillingEnv, uid: string): Promise<BillingStatus> { return reconcile(env, uid); }
export async function runBillingMaintenance(env: BillingEnv, options: { limit?: number; afterUid?: string } = {}): Promise<{ skipped: boolean; processed: number; failed: Array<{ uid: string; code: string }>; nextCursor: string | null }> {
  if (env.BILLING_ENABLED !== "true" || !getBillingConfig(env)) return { skipped: true, processed: 0, failed: [], nextCursor: null };
  requireStripe(env); const page = await listBillingMaintenanceOwners(env, options); const failed: Array<{ uid: string; code: string }> = []; let processed = 0;
  for (const uid of page.uids) {
    try { await markBillingMaintenanceAttempt(env, uid); await reconcileBilling(env, uid); processed++; }
    catch (error) { failed.push({ uid, code: (error as WorkerError).code || "billing_maintenance_failed" }); }
  }
  return { skipped: false, processed, failed, nextCursor: page.nextCursor };
}

async function verifySignature(request: Request, env: BillingEnv): Promise<string> {
  if (!env.STRIPE_WEBHOOK_SECRET) throw billingError(503, "stripe_webhook_not_configured", "Stripe Webhook Secret is required.");
  const parts = (request.headers.get("stripe-signature") || "").split(",").map(part => part.trim()); const timestamps = parts.filter(part => part.startsWith("t="));
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3));
  if (timestamps.length !== 1 || !/^t=\d+$/.test(timestamps[0]!) || !signatures.length || signatures.length > 8 || signatures.some(s => !/^[0-9a-f]{64}$/.test(s))) throw billingError(400, "stripe_signature_invalid", "Invalid Stripe signature.");
  const timestamp = timestamps[0]!.slice(2);
  // Signature age follows Stripe's wall clock, independently of a subscription Test clock.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw billingError(400, "stripe_signature_expired", "Stripe signature timestamp is outside tolerance.");
  const chunks: Uint8Array[] = []; let size = 0; const reader = request.body?.getReader();
  if (!reader) throw billingError(400, "stripe_body_invalid", "Missing Stripe request body.");
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > 1048576) { await reader.cancel(); throw billingError(413, "stripe_body_too_large", "Stripe request is too large."); } chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const prefix = encoder.encode(`${timestamp}.`); const signed = new Uint8Array(prefix.length + bytes.length); signed.set(prefix); signed.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let valid = false;
  for (const signature of signatures) {
    const parsed = Uint8Array.from(signature.match(/../g)!, hex => parseInt(hex, 16));
    if (await crypto.subtle.verify("HMAC", key, parsed, signed)) valid = true;
  }
  if (!valid) throw billingError(400, "stripe_signature_invalid", "Invalid Stripe signature.");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw billingError(400, "stripe_body_invalid", "Invalid Stripe UTF-8 body."); }
}
export async function handleStripeWebhook(request: Request, env: BillingEnv): Promise<Response> {
  try {
    if (request.method !== "POST") return Response.json({ error: { code: "method_not_allowed" } }, { status: 405, headers: { allow: "POST" } });
    requireStripe(env); const raw = await verifySignature(request, env); let event: JsonRecord;
    try { event = record(JSON.parse(raw)); } catch { throw billingError(400, "stripe_body_invalid", "Invalid Stripe event JSON."); }
    validateMode(env, event);
    if (!/^evt_[A-Za-z0-9]+$/.test(id(event)) || typeof event.type !== "string") throw billingError(400, "stripe_event_invalid", "Invalid Stripe event.");
    if (await stripeEventProcessed(env, id(event))) return Response.json({ received: true, duplicate: true });
    const object = record(record(event.data).object); const type = event.type;
    const supported = type.startsWith("customer.subscription.") || ["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible", "checkout.session.completed", "checkout.session.async_payment_succeeded", "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "refund.created", "refund.updated"].includes(type);
    if (supported) {
      let customerId = id(object.customer);
      const chargeId = type.startsWith("charge.dispute.") || type.startsWith("refund.") ? id(object.charge) : type === "charge.refunded" ? id(object) : "";
      if (!customerId && chargeId) customerId = id((await stripe(env, `/charges/${encodeURIComponent(chargeId)}`)).customer);
      const uid = customerId ? await findBillingCustomer(env, customerId) : null;
      if (uid) await reconcile(env, uid, { invoiceId: type.startsWith("invoice.") ? id(object) : undefined, chargeId: chargeId || undefined, subscriptionId: type.startsWith("customer.subscription.") ? id(object) : undefined });
      else if (customerId) {
        const customer = await stripe(env, `/customers/${encodeURIComponent(customerId)}`); validateMode(env, customer);
        if (typeof record(customer.metadata).guilduo_uid === "string" && record(customer.metadata).guilduo_mode === billingMode(env)) throw billingError(503, "stripe_customer_mapping_pending", "Owned customer mapping must be recovered before acknowledging this event.");
      }
    }
    await markStripeEventProcessed(env, id(event)); return Response.json({ received: true });
  } catch (error) {
    const failure = error as WorkerError;
    // Busy/unknown outcomes ask Stripe to retry; failed events remain unprocessed.
    const status = failure.code === "billing_sync_busy" || failure.code === "billing_busy" || failure.code === "billing_sync_stale" ? 503 : failure.status || 500;
    return Response.json({ error: { code: failure.code || "stripe_webhook_failed" } }, { status });
  }
}
