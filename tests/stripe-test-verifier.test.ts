import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prices = () => ({ mode: "test", prices: [
  { id: "price_month", currency: "usd", amount: 1000, livemode: false, recurring: { interval: "month", interval_count: 1 } },
  { id: "price_year", currency: "usd", amount: 9600, livemode: false, recurring: { interval: "year", interval_count: 1 } },
] });
test("Stripe Test verifier local safeguards", async (t) => {
const { AcceptanceFailure, canUseFixtureSubscription, cliListenArguments, invoicePaymentIntent, listenerReadySecret, parseTestPrices, portalCleanupDisposition, redactStripeOutput, requireId, requireTestSecret, runStripeTest, safeFailure, signatureFresh, STRIPE_TEST_STEPS } = await import("../tools/verify-stripe-test.mts");
await t.test("Checkout IDs accept the Test namespace and reject Live or malformed IDs", () => {
  assert.equal(requireId("cs_test_sample123", "cs"), "cs_test_sample123");
  for (const id of ["cs_live_sample123", "cs_sample123", "cs_test_", "cs_test_a/path"]) assert.throws(() => requireId(id, "cs"));
});
await t.test("runner accepts only secret/restricted Test keys", () => {
  for (const key of ["sk_test_fixture", "rk_test_fixture"]) assert.equal(requireTestSecret(key), key);
  for (const key of ["sk_live_fixture", "rk_live_fixture", "pk_test_fixture", "", undefined, "sk_test_fixture\n"]) assert.throws(() => requireTestSecret(key));
});
await t.test("errors and output cannot expose credentials or hosted URLs", () => {
  const output = redactStripeOutput("sk_test_fixture rk_live_fixture pk_test_fixture whsec_fixture cs_test_fixture https://checkout.stripe.com/c/pay/private https://billing.stripe.com/p/private Bearer token");
  for (const privatePart of ["fixture", "/private", "token"]) assert.equal(output.includes(privatePart), false);
  assert.deepEqual(safeFailure(new Error("sk_test_fixture")), { code: "stripe_test_runner_failed", blocked: false });
});
await t.test("Ready requires a complete secret in its own CLI message", () => {
  assert.equal(listenerReadySecret("Ready! Your webhook signing secret is whsec_par"), null);
  assert.equal(listenerReadySecret("Ready! Your webhook signing secret is whsec_partial_tail (^C to quit)\n"), "whsec_partial_tail");
  assert.equal(listenerReadySecret("whsec_other\nReady!\n"), null);
});
await t.test("prices must match uniquely the existing Test USD monthly10 and annual96", () => {
  assert.deepEqual(parseTestPrices(prices()), { monthly: "price_month", annual: "price_year" });
  for (const invalid of [null, { ...prices(), mode: "live" }, { ...prices(), prices: [] }]) assert.throws(() => parseTestPrices(invalid));
  for (const field of ["livemode", "amount", "currency"] as const) {
    const fixture = prices(); Object.assign(fixture.prices[0], { [field]: field === "livemode" ? true : field === "amount" ? 999 : "jpy" });
    assert.throws(() => parseTestPrices(fixture));
  }
  const duplicate = prices(); duplicate.prices.push({ ...duplicate.prices[0]! }); assert.throws(() => parseTestPrices(duplicate));
});
await t.test("Invoice Payments requires one paid PaymentIntent and complete pagination", () => {
  const payment = (id: string) => ({ status: "paid", payment: { type: "payment_intent", payment_intent: id } });
  assert.equal(invoicePaymentIntent({ has_more: false, data: [payment("pi_one")] }), "pi_one");
  assert.equal(invoicePaymentIntent({ has_more: false, data: [payment("pi_one"), payment("pi_one")] }), "pi_one");
  for (const list of [{ has_more: true, data: [payment("pi_one")] }, { has_more: false, data: [] }, { has_more: false, data: [payment("pi_one"), payment("pi_two")] }, { has_more: false, data: [{ ...payment("pi_one"), status: "open" }] }]) assert.throws(() => invoicePaymentIntent(list));
});
await t.test("captured signatures expire rather than being rewritten", () => {
  assert.equal(signatureFresh("t=1000,v1=abc", 1300000), true);
  assert.equal(signatureFresh("t=1000,v1=abc", 1301000), false);
  assert.equal(signatureFresh("t=1000,t=1000,v1=abc", 1000000), false);
  assert.equal(signatureFresh("v1=abc", 1000000), false);
});
await t.test("CLI forwards only to localhost and requests lifecycle events/latest", () => {
  const args = cliListenArguments("http://127.0.0.1:1234/", "ignored-config.toml");
  assert.equal(args.includes("--latest"), true); assert.equal(args.includes("--skip-update"), true);
  assert.equal(args.includes("http://127.0.0.1:1234/v1/billing/webhook"), true);
  for (const url of ["https://127.0.0.1/", "http://example.com/", "http://127.0.0.1/path", "http://user@127.0.0.1/", "http://127.0.0.1/?x=1"]) assert.throws(() => cliListenArguments(url, "config.toml"));
});
await t.test("fixture fallback is opt-in and never accepts unknown external POST failure", () => {
  for (const code of ["checkout_card_number_missing", "checkout_card_expiry_missing", "checkout_card_cvc_missing", "checkout_submit_missing", "checkout_navigation_requires_human", "checkout_fields_requires_human", "checkout_return_or_challenge_requires_human"]) {
    const blocked = new AcceptanceFailure(code, true);
    assert.equal(canUseFixtureSubscription(true, blocked), true);
    assert.equal(canUseFixtureSubscription(false, blocked), false);
    assert.equal(canUseFixtureSubscription(true, new AcceptanceFailure(code)), false);
  }
  for (const code of ["stripe_outcome_unknown", "stripe_listener_stopped", "local_rest_502", "checkout_outcome_unknown", "fixture_checkout_state_unknown"]) assert.equal(canUseFixtureSubscription(true, new AcceptanceFailure(code, true)), false);
  let protocolError: unknown; try { invoicePaymentIntent({ has_more: false, data: [] }); } catch (error) { protocolError = error; }
  assert.equal(canUseFixtureSubscription(true, protocolError), false);
  assert.equal(canUseFixtureSubscription(true, new Error("checkout_card_number_missing")), false);
  assert.equal(canUseFixtureSubscription(false, protocolError), false);
});
await t.test("cleanup retains owned default Portal and refuses any preexisting or Live configuration", () => {
  const owned = { livemode: false, is_default: false, metadata: { guilduo_test_run: "this-run" } };
  assert.equal(portalCleanupDisposition(owned, "this-run"), "deactivate");
  assert.equal(portalCleanupDisposition({ ...owned, is_default: true }, "this-run"), "retain");
  for (const invalid of [{ ...owned, livemode: true }, { ...owned, metadata: {} }, { ...owned, is_default: true, metadata: { guilduo_test_run: "older-run" } }, { ...owned, is_default: undefined }, null]) assert.throws(() => portalCleanupDisposition(invalid, "this-run"));
});
await t.test("default dry-run and explicit Live rejection make zero external requests", async () => {
  const directory = mkdtempSync(join(tmpdir(), "guilduo-stripe-runner-"));
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("No external requests allowed"); };
  try {
    const result = await runStripeTest({ root: directory }); assert.equal(result.status, "dry-run"); assert.equal(result.externalRequests, 0);
    const evidence = JSON.parse(readFileSync(result.evidencePath, "utf8"));
    assert.equal(evidence.formalCreditTermsApproved, false); assert.deepEqual(evidence.steps.map((step: {name: string}) => step.name), STRIPE_TEST_STEPS);
    assert.equal(evidence.steps.every((step: {status: string}) => step.status === "pending"), true);
    const rejected = await runStripeTest({ root: directory, execute: true, secret: "sk_live_fixture" });
    assert.equal(rejected.status, "fail"); assert.equal(rejected.externalRequests, 0); assert.equal(calls, 0);
    assert.equal(readFileSync(rejected.evidencePath, "utf8").includes("sk_live_fixture"), false);
    const fixtureDry = await runStripeTest({ root: directory, fixtureSubscriptions: true, secret: "sk_test_fixture" });
    assert.equal(fixtureDry.status, "dry-run"); assert.equal(fixtureDry.externalRequests, 0); assert.equal(calls, 0);
  } finally { globalThis.fetch = original; rmSync(directory, { recursive: true, force: true }); }
});
});
