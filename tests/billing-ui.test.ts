import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { BILLING_COPY, billingText } from "../interaction-lab/relay-forge/billing-copy.ts";
import { normalizeBillingStatus, safeStripeUrl, validFreeAgentSelection, billingPurchaseAvailable, formatBillingMoney, billingDiscountedAmount, eligibleDecisionAgent } from "../interaction-lab/relay-forge/screens/settings-model.ts";
import { QuestForgeRepository } from "../interaction-lab/repository.ts";
import { billingPricingFixture } from "./browser/billing-pricing-fixture.ts";

const saleStatus = () => ({ enabled: true, configured: true, salesReady: true, mode: "test", pricing: billingPricingFixture() });

test("billing normalization fails closed for absent config and preserves nested/flat entitlements", () => {
  const unavailable = normalizeBillingStatus({ configured: "true", pricing: { monthlyPriceId: "price_pending" }, credits: { available: -1 } });
  assert.equal(unavailable.configured, false);
  assert.equal(unavailable.pricing.approved, false);
  assert.equal(unavailable.pricing.month, null);
  assert.equal(unavailable.credits.available, null);
  const live = normalizeBillingStatus({ ...saleStatus(), entitlement: { plan: "pro", agentLimit: null, selectedAgentIds: ["a", "a"], periodEnd: "2026-12-01" }, credits: { available: 42, reserved: 4, debt: 0 } });
  assert.equal(live.plan, "pro"); assert.equal(live.agentLimit, null);
  assert.deepEqual(live.selectedAgentIds, ["a"]);
  assert.equal(live.pricing.month?.amount, 1234);
  assert.equal(live.pricing.launchDiscount?.percentOff, 25);
  assert.equal(live.pricing.complete, true, "empty terms[] is replaced by localized typed conditions");
  assert.equal(billingPurchaseAvailable(live), true);
  assert.equal(normalizeBillingStatus({ plan: "free", agentLimit: null }).agentLimit, 2);
  assert.equal(normalizeBillingStatus({ pricing: { approved: true, month: { amount: 10, currency: "usd", discountAmount: 1 } } }).pricing.month, null);
});

test("purchase requires complete approved prices, conditions, mode and backend sales readiness", () => {
  for (const key of ["enabled", "configured", "salesReady"] as const) assert.equal(billingPurchaseAvailable(normalizeBillingStatus({ ...saleStatus(), [key]: false })), false, key);
  for (const mode of [undefined, "preview", "Test"]) assert.equal(billingPurchaseAvailable(normalizeBillingStatus({ ...saleStatus(), mode })), false);
  for (const patch of [
    { approved: false }, { refundPolicy: null }, { taxBehavior: null }, { automaticTax: undefined }, { autoTopUp: true }, { creditLifetimeDays: 0 },
    { decisionCredits: -1 }, { referralCredits: undefined }, { currency: "eur" }, { launchDiscount: undefined }, { launchDiscount: { percentOff: 25, amountOff: 222 } },
  ]) assert.equal(billingPurchaseAvailable(normalizeBillingStatus({ ...saleStatus(), pricing: { ...billingPricingFixture(), ...patch } })), false, JSON.stringify(patch));
  for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: 1.1 }, { interval: "year" }, { intervalCount: 2 }, { taxBehavior: "inclusive" }, { creditsPerMonth: undefined }]) {
    const pricing = billingPricingFixture(); pricing.month = { ...pricing.month, ...patch } as typeof pricing.month;
    assert.equal(billingPurchaseAvailable(normalizeBillingStatus({ ...saleStatus(), pricing })), false, JSON.stringify(patch));
  }
  const aliases = billingPricingFixture();
  const { month: _month, year: _year, ...legacy } = aliases;
  assert.equal(normalizeBillingStatus({ ...saleStatus(), pricing: legacy }).pricing.complete, true, "monthly/annual aliases share the same contract");
});

test("coupon duration, currency, expiry and minor currency units match Stripe's published terms", () => {
  for (const patch of [{ duration: "unknown" }, { durationMonths: 0 }, { percentOff: 101 }, { percentOff: -1 }, { amountOff: 0 }, { currency: "eur" }, { redeemBy: "invalid" }]) {
    const pricing = billingPricingFixture(); pricing.launchDiscount = { ...pricing.launchDiscount!, ...patch };
    assert.equal(billingPurchaseAvailable(normalizeBillingStatus({ ...saleStatus(), pricing })), false, JSON.stringify(patch));
  }
  const pricing = billingPricingFixture();
  const status = normalizeBillingStatus(saleStatus());
  assert.equal(billingDiscountedAmount(status.pricing.month!, status.pricing.launchDiscount!), 925);
  assert.equal(billingDiscountedAmount(status.pricing.month!, status.pricing.referralDiscount!), 1012);
  assert.equal(billingDiscountedAmount(status.pricing.month!, { ...status.pricing.referralDiscount!, amountOff: 9999 }), 0);
  assert.equal(formatBillingMoney(1234, "USD", "en"), "$12.34");
  assert.equal(formatBillingMoney(1234, "JPY", "en"), "¥1,234");
  assert.equal(billingPurchaseAvailable(status, Date.parse("2100-01-01")), false);
  for (const duration of ["once", "repeating", "forever"]) {
    pricing.launchDiscount = { ...pricing.launchDiscount!, duration };
    assert.equal(normalizeBillingStatus({ ...saleStatus(), pricing }).pricing.complete, true);
  }
});

test("Free selection counts disabled agents and rejects duplicates, unknown and archived IDs", () => {
  const agents = ["active", "disabled", "active", "archived"].map((status, i) => ({ agentId: String(i), displayName: `Agent ${i}`, status, role: "", provider: "" }));
  assert.equal(validFreeAgentSelection(["0", "1"], agents), true);
  for (const ids of [["0"], ["0", "0"], ["0", "1", "2"], ["0", "3"], ["0", "missing"]]) assert.equal(validFreeAgentSelection(ids, agents), false);
  assert.equal(validFreeAgentSelection(["0"], agents.slice(0, 1)), true);
});

test("Jev candidate permission matches the server's read AND write boundary", () => {
  const agent = { agentId: "eligible", displayName: "Eligible", role: "", provider: "", status: "active", allowedScopes: ["quests:read", "quests:write"] };
  assert.equal(eligibleDecisionAgent(agent), true);
  for (const allowedScopes of [undefined, [], ["quests:read"], ["quests:write"]]) assert.equal(eligibleDecisionAgent({ ...agent, allowedScopes }), false);
  assert.equal(eligibleDecisionAgent({ ...agent, status: "disabled" }), false);
  assert.equal(eligibleDecisionAgent({ ...agent, planAllowed: false }), false);
});

test("external payment URLs permit only the exact Stripe host for the operation", () => {
  assert.equal(safeStripeUrl("https://checkout.stripe.com/c/pay/test", "checkout"), "https://checkout.stripe.com/c/pay/test");
  assert.equal(safeStripeUrl("https://billing.stripe.com/p/session/test", "portal"), "https://billing.stripe.com/p/session/test");
  for (const url of ["javascript:alert(1)", "http://checkout.stripe.com/", "https://checkout.stripe.com.attacker.test/", "https://attacker.test/?url=https://checkout.stripe.com", "https://user:pass@checkout.stripe.com/", "https://checkout.stripe.com:8443/", "https://billing.stripe.com/"]) assert.equal(safeStripeUrl(url, "checkout"), null);
});

test("all nine billing dictionaries have the same complete translated keys", () => {
  const keys = Object.keys(BILLING_COPY.en);
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(BILLING_COPY[locale]), keys);
    for (const text of Object.values(BILLING_COPY[locale])) assert.ok(text.trim());
    if (locale !== "en") assert.notEqual(billingText("consent", locale), billingText("consent", "en"));
  }
});

test("repository exposes billing/Jev only as explicit owner operations, preserving wire inputs", async () => {
  const repository = new QuestForgeRepository();
  const calls: { path: string; method?: string; body?: string }[] = [];
  repository.request = async <T,>(path: string, options: { method?: string; body?: string } = {}) => { calls.push({ path, ...options }); return {} as T; };
  assert.equal(calls.length, 0);
  await repository.getBilling(); await repository.getBillingCredits();
  await repository.createCheckout({ interval: "annual", referralCode: "friend" });
  await repository.createBillingPortal(); await repository.selectBillingAgents(["a", "b"]);
  const input = { questId: "q", expectedUpdatedAt: "2026-10-03T00:00:00.000Z", agentIds: ["a"], consent: true as const };
  await repository.estimateDecision(input); await repository.createDecision({ ...input, requestId: "request" });
  await repository.getDecision("decision/one"); await repository.applyDecision("decision/one", input.expectedUpdatedAt);
  assert.deepEqual(calls.map(call => call.path), ["/v1/billing", "/v1/billing/credits", "/v1/billing/checkout", "/v1/billing/portal", "/v1/billing/agents", "/v1/decisions/estimate", "/v1/decisions", "/v1/decisions/decision%2Fone", "/v1/decisions/decision%2Fone/apply"]);
  assert.deepEqual(JSON.parse(calls[5]!.body!), input);
  assert.equal(JSON.parse(calls[2]!.body!).interval, "annual");
  assert.equal(calls[6]!.method, "POST");
  await repository.getBillingCredits({ cursor: "opaque/+cursor=", limit: 50 });
  assert.equal(calls.at(-1)!.path, "/v1/billing/credits?cursor=opaque%2F%2Bcursor%3D&limit=50");
});
