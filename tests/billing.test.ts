import test from "node:test";
import assert from "node:assert/strict";
import { createAgent, updateAgent } from "../worker/src/agent-store.ts";
import {
  acquireBillingSync, addBillingMonths, applyBillingSnapshot, attributeReferral, getBillingConfig, getBillingStatus, getEntitlement,
  getBillingAdminReport, getMemoryEntitlement, grantCredits, grantPeriodicCredits, listCreditLedger, releaseBillingSync,
  reserveCredits, reverseCreditSource, reverseReferral, rewardReferral, selectFreeAgents, setBillingCustomer, settleCredits,
} from "../worker/src/billing-store.ts";
import type { BillingConfig, BillingEnv, SubscriptionSnapshot } from "../worker/src/billing-store.ts";
import { SqliteD1Database, hasErrorCode } from "./test-helpers.ts";

// Fixture values are test data, never sales defaults.
const config: BillingConfig = { approved: true, currency: "usd", monthlyPriceId: "price_month", annualPriceId: "price_year", monthlyCredits: 100, annualMonthlyCredits: 90, creditLifetimeDays: 30, decisionCredits: 2, referralCredits: 25 };
function environment(db?: SqliteD1Database): BillingEnv { return { ...(db ? { QUESTFORGE_DB: db } : {}), BILLING_ENABLED: "true", BILLING_MODE: "test", BILLING_CONFIG: JSON.stringify(config), BILLING_NOW: "2026-01-31T12:00:00.000Z" }; }
function code(expected: string): (error: unknown) => boolean { return error => hasErrorCode(error, expected); }
function subscription(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return { id: "sub_one", status: "active", periodStart: "2026-01-31T12:00:00.000Z", periodEnd: "2027-01-31T12:00:00.000Z", interval: "annual", invoiceId: "in_one", invoicePaid: true, cancelAtPeriodEnd: false, monthlyCredits: 90, lifetimeDays: 30, ...overrides };
}

test("adopted 1000 monthly / 1 decision / 100 referral / 30 days work with real D1 and replay",async()=>{
  const database=new SqliteD1Database();const env=environment(database);
  // Adopted quantities, isolated provider IDs. Not a production activation config.
  env.BILLING_CONFIG=JSON.stringify({...config,monthlyCredits:1000,annualMonthlyCredits:1000,decisionCredits:1,referralCredits:100});
  try{
    await snapshot(env,"adopted-owner",subscription({monthlyCredits:1000}));
    await Promise.all([grantPeriodicCredits(env,"adopted-owner"),grantPeriodicCredits(env,"adopted-owner")]);
    assert.equal((await getBillingStatus(env,"adopted-owner")).credits.available,1000);
    await reserveCredits(env,"adopted-owner","adopted-decision",1);
    await settleCredits(env,"adopted-owner","adopted-decision","commit");
    assert.equal((await getBillingStatus(env,"adopted-owner")).credits.available,999);
    const referral=(await getBillingStatus(env,"adopted-referrer")).referral.code;
    await attributeReferral(env,"adopted-referred",referral);
    await Promise.all([rewardReferral(env,"adopted-referred","in_adopted",env.BILLING_NOW!),rewardReferral(env,"adopted-referred","in_adopted",env.BILLING_NOW!)]);
    assert.equal((await getBillingStatus(env,"adopted-referrer")).credits.available,100);
    env.BILLING_NOW="2026-02-28T12:00:00.000Z";await grantPeriodicCredits(env,"adopted-owner");
    assert.equal((await getBillingStatus(env,"adopted-owner")).credits.available,1999);
    env.BILLING_NOW="2026-03-02T12:00:00.000Z";
    assert.equal((await getBillingStatus(env,"adopted-owner")).credits.available,1000);
    assert.equal((await getBillingStatus(env,"adopted-referrer")).credits.available,0);
    assert.equal((await listCreditLedger(env,"adopted-owner")).entries.filter(e=>e.kind==="grant").length,2);
  }finally{database.close();}
});
async function snapshot(env: BillingEnv, uid: string, sub: SubscriptionSnapshot | null): Promise<void> {
  const lease = await acquireBillingSync(env, uid); await applyBillingSnapshot(env, uid, lease, sub, [], []); await releaseBillingSync(env, uid, lease);
}
test("billing disabled retains unlimited entitlement; invalid/unapproved config never permits grants", async () => {
  const env = environment(); env.BILLING_ENABLED = "false";
  assert.equal((await getEntitlement(env, "owner")).agentLimit, null);
  await assert.rejects(grantCredits(env, "owner", "source", 10), code("billing_not_configured"));
  env.BILLING_ENABLED = "true"; env.BILLING_CONFIG = JSON.stringify({ ...config, approved: false });
  assert.equal(getBillingConfig(env), null);
  await assert.rejects(reserveCredits(env, "owner", "request", 1), code("billing_not_configured"));
  for (const invalid of [{ ...config, creditLifetimeDays: 0 }, { ...config, monthlyCredits: -1 }, { ...config, monthlyPriceId: config.annualPriceId }, { ...config, monthlyCredits: "100" }]) {
    env.BILLING_CONFIG = JSON.stringify(invalid); assert.equal(getBillingConfig(env), null);
  }
  await assert.rejects(getBillingStatus({ APPWRITE_PROJECT_ID: "production", BILLING_MODE: "test" }, "owner"), code("billing_d1_required"));
});
test("real D1 migration and atomic owned nonarchived Agent selection are mode isolated", async () => {
  const db = new SqliteD1Database(); const env = environment(db); env.BILLING_ENABLED = "false";
  try {
    for (const id of ["a", "b", "c", "d"]) await createAgent(env, "owner", { agentId: id, displayName: id });
    await createAgent(env, "other", { agentId: "foreign", displayName: "Foreign" });
    await updateAgent(env, "owner", "b", { status: "disabled" }); env.BILLING_ENABLED = "true";
    assert.equal((await getEntitlement(env, "owner")).selectionRequired, true);
    await selectFreeAgents(env, "owner", ["a"]);
    assert.equal((await getEntitlement(env, "owner")).selectionRequired, true, "exactly two owned nonarchived selections are required");
    await selectFreeAgents(env, "owner", ["a", "b"]);
    assert.deepEqual((await getBillingStatus(env, "owner")).selectedAgentIds, ["a", "b"]);
    await assert.rejects(selectFreeAgents(env, "owner", ["foreign"]), code("agent_not_found"));
    await assert.rejects(selectFreeAgents(env, "owner", ["a", "a"]), code("invalid_free_agents"));
    await updateAgent(env, "owner", "b", { status: "archived" });
    assert.equal((await getEntitlement(env, "owner")).selectionRequired, true, "archived selection does not count toward the required two");
    assert.deepEqual((await getEntitlement(env, "owner")).selectedAgentIds, ["a", "b"], "invalid selection is retained for owner correction");
    await assert.rejects(selectFreeAgents(env, "owner", ["b"]), code("agent_not_found"));
    await snapshot(env, "owner", subscription());
    assert.equal((await getEntitlement(env, "owner")).plan, "pro");
    const row = db.raw.prepare("SELECT plan,period_end,selected_agent_ids FROM billing_accounts WHERE uid=? AND mode=?").get("owner", "test");
    assert.equal(row?.plan, "pro"); assert.equal(row?.period_end, subscription().periodEnd); assert.equal(row?.selected_agent_ids, '["a","b"]');
    env.BILLING_MODE = "live";
    assert.equal((await getEntitlement(env, "owner")).plan, "free"); assert.deepEqual((await getEntitlement(env, "owner")).selectedAgentIds, []);
  } finally { db.close(); }
});
for (const storage of ["sqlite", "memory"] as const) test(`${storage}: grants/reserve/settle races, conflicting replay, expiration and refund debt`, async () => {
  const db = storage === "sqlite" ? new SqliteD1Database() : undefined; const env = environment(db);
  try {
    await Promise.all(Array.from({ length: 8 }, () => grantCredits(env, "owner", "invoice:in_1:0", 100)));
    assert.equal((await getBillingStatus(env, "owner")).credits.available, 100);
    await assert.rejects(grantCredits(env, "owner", "invoice:in_1:0", 99), code("credit_source_conflict"));
    const attempts = await Promise.allSettled([reserveCredits(env, "owner", "reqA", 70), reserveCredits(env, "owner", "reqB", 70)]);
    assert.equal(attempts.filter(a => a.status === "fulfilled").length, 1);
    const successful = attempts[0]?.status === "fulfilled" ? "reqA" : "reqB";
    await Promise.all([reserveCredits(env, "owner", successful, 70), reserveCredits(env, "owner", successful, 70)]);
    assert.equal((await getBillingStatus(env, "owner")).credits.reserved, 70);
    await assert.rejects(reserveCredits(env, "owner", successful, 69), code("credit_request_conflict"));
    await Promise.all([settleCredits(env, "owner", successful, "commit"), settleCredits(env, "owner", successful, "commit")]);
    await assert.rejects(settleCredits(env, "owner", successful, "return"), code("credit_outcome_conflict"));
    await Promise.all([reverseCreditSource(env, "owner", "invoice:in_1:0"), reverseCreditSource(env, "owner", "invoice:in_1:0")]);
    assert.equal((await getBillingStatus(env, "owner")).credits.debt, 70);
    await grantCredits(env, "owner", "invoice:in_2:0", 80);
    assert.equal((await getBillingStatus(env, "owner")).credits.available, 10);
    env.BILLING_NOW = "2026-03-03T12:00:00.000Z";
    assert.equal((await getBillingStatus(env, "owner")).credits.balance, 0, "only available credits expire, debt repayment stays paid");
    const entries = (await listCreditLedger(env, "owner")).entries;
    assert.equal(entries.filter(e => e.kind === "grant").length, 2); assert.equal(entries.filter(e => e.kind === "commit").length, 1); assert.equal(entries.filter(e => e.kind === "reserve").length, 1);
  } finally { db?.close(); }
});
test("held credits never auto-return; refund followed by commit creates debt; expired return cannot mint balance", async () => {
  const db = new SqliteD1Database(); const env = environment(db);
  try {
    await grantCredits(env, "owner", "held", 20); await reserveCredits(env, "owner", "unknown", 20);
    env.BILLING_NOW = "2026-04-01T12:00:00.000Z";
    assert.equal((await getBillingStatus(env, "owner")).credits.reserved, 20);
    await reverseCreditSource(env, "owner", "held"); assert.equal((await getBillingStatus(env, "owner")).credits.balance, 0);
    await settleCredits(env, "owner", "unknown", "commit"); assert.equal((await getBillingStatus(env, "owner")).credits.debt, 20);
    await grantCredits(env, "other", "expired", 20); await reserveCredits(env, "other", "return", 20);
    env.BILLING_NOW = "2026-05-02T12:00:00.000Z";
    await settleCredits(env, "other", "return", "return"); assert.equal((await getBillingStatus(env, "other")).credits.available, 0);
    await reverseCreditSource(env, "other", "expired"); assert.equal((await getBillingStatus(env, "other")).credits.debt, 0);
    await assert.rejects(grantCredits(env, "owner", "badexpiry", 10, "bad"), code("credit_expiry_invalid"));
    await assert.rejects(grantCredits(env, "owner", "toolong", 10, "2029-01-01T00:00:00Z"), code("credit_expiry_invalid"));
  } finally { db.close(); }
});
test("D1 batch rollback leaves neither balance nor ledger; cursor is owner-scoped and stable with frozen timestamp", async () => {
  const db = new SqliteD1Database(); const env = environment(db);
  try {
    const original = db.batch.bind(db); let fail = true;
    db.batch = async statements => { if (fail) { fail = false; return original([...statements, db.prepare("INSERT INTO no_such_table VALUES (1)")]); } return original(statements); };
    await assert.rejects(grantCredits(env, "owner", "rollback", 5));
    assert.equal((await getBillingStatus(env, "owner")).credits.available, 0); assert.equal((await listCreditLedger(env, "owner")).entries.length, 0);
    for (const source of ["one", "two", "three", "four"]) await grantCredits(env, "owner", source, 5);
    await grantCredits(env, "other", "secret", 99);
    const first = await listCreditLedger(env, "owner", { limit: 2 }); const second = await listCreditLedger(env, "owner", { limit: 2, cursor: first.nextCursor! });
    assert.equal(new Set([...first.entries, ...second.entries].map(e => e.id)).size, 4); assert.equal(second.nextCursor, null);
    assert.equal([...first.entries, ...second.entries].some(e => e.source === "secret"), false);
    await assert.rejects(listCreditLedger(env, "owner", { cursor: btoa("null") }), code("invalid_cursor"));
  } finally { db.close(); }
});
test("annual monthly grants use clamped anniversaries, cancellation/lease prevents stale revival", async () => {
  const db = new SqliteD1Database(); const env = environment(db);
  try {
    assert.equal(addBillingMonths(env.BILLING_NOW!, 1), "2026-02-28T12:00:00.000Z");
    await snapshot(env, "owner", subscription()); await grantPeriodicCredits(env, "owner");
    env.BILLING_NOW = "2026-02-28T12:00:00.000Z";
    await Promise.all([grantPeriodicCredits(env, "owner"), grantPeriodicCredits(env, "owner")]);
    assert.equal((await getBillingStatus(env, "owner")).credits.available, 180);
    assert.equal((await listCreditLedger(env, "owner")).entries.filter(e => e.kind === "grant").length, 2);
    const lease = await acquireBillingSync(env, "owner"); await assert.rejects(acquireBillingSync(env, "owner"), code("billing_sync_busy"));
    env.BILLING_NOW = "2026-02-28T12:03:00.000Z"; const newer = await acquireBillingSync(env, "owner");
    await assert.rejects(applyBillingSnapshot(env, "owner", lease, subscription(), [], []), code("billing_sync_stale"));
    await applyBillingSnapshot(env, "owner", newer, subscription(), ["in_one"], ["sub_one"]); await releaseBillingSync(env, "owner", newer);
    await snapshot(env, "owner", subscription()); assert.equal((await getEntitlement(env, "owner")).plan, "free");
    await grantPeriodicCredits(env, "owner"); assert.equal((await listCreditLedger(env, "owner")).entries.filter(e => e.kind === "grant").length, 2);
    const memoryEnv = environment(); await snapshot(memoryEnv, "owner", subscription()); assert.equal(getMemoryEntitlement(memoryEnv, "owner").plan, "pro");
    memoryEnv.BILLING_NOW = "2027-02-01T00:00:00Z"; assert.equal(getMemoryEntitlement(memoryEnv, "owner").plan, "free");
  } finally { db.close(); }
});
test("referral ownership, first-invoice idempotency, spent refund reversal and separate admin credential", async () => {
  const db = new SqliteD1Database(); const env = environment(db);
  try {
    const referrer = await getBillingStatus(env, "referrer"); const own = await getBillingStatus(env, "referred");
    await assert.rejects(attributeReferral(env, "referred", own.referral.code), code("referral_invalid"));
    await attributeReferral(env, "referred", referrer.referral.code);
    await Promise.all([rewardReferral(env, "referred", "in_first", env.BILLING_NOW!), rewardReferral(env, "referred", "in_first", env.BILLING_NOW!)]);
    await rewardReferral(env, "referred", "in_second", env.BILLING_NOW!); assert.equal((await getBillingStatus(env, "referrer")).credits.available, 25);
    await reserveCredits(env, "referrer", "spent", 20); await settleCredits(env, "referrer", "spent", "commit");
    await reverseReferral(env, "referred", "in_first"); assert.equal((await getBillingStatus(env, "referrer")).credits.debt, 20);
    await rewardReferral(env, "referred", "in_first", env.BILLING_NOW!); assert.equal((await getBillingStatus(env, "referrer")).credits.debt, 20);
    await setBillingCustomer(env, "referred", "cus_one"); await assert.rejects(setBillingCustomer(env, "other", "cus_one"));
    env.BILLING_ADMIN_TOKEN = "separate-admin-token";
    await assert.rejects(getBillingAdminReport(env, "wrong"), code("billing_admin_forbidden"));
    const report = await getBillingAdminReport(env, env.BILLING_ADMIN_TOKEN); assert.equal(report.accounts.find(a => a.uid === "referrer")?.debt, 20);
    assert.equal(JSON.stringify(own).includes("customerId"), false);
  } finally { db.close(); }
});
test("returned credits pay refund debt once and expiration cannot revive paid debt", async () => {
  const db = new SqliteD1Database(); const env = environment(db);
  try {
    await grantCredits(env, "owner", "refunded", 10); await reserveCredits(env, "owner", "spentRefund", 10); await settleCredits(env, "owner", "spentRefund", "commit");
    await grantCredits(env, "owner", "returnable", 20); await reserveCredits(env, "owner", "returnableRequest", 20);
    await reverseCreditSource(env, "owner", "refunded"); assert.equal((await getBillingStatus(env, "owner")).credits.debt, 10);
    await settleCredits(env, "owner", "returnableRequest", "return"); assert.equal((await getBillingStatus(env, "owner")).credits.available, 10);
    env.BILLING_NOW = "2026-03-03T12:00:00.000Z";
    assert.deepEqual((await getBillingStatus(env, "owner")).credits, { balance: 0, available: 0, debt: 0, reserved: 0 });
    await reverseCreditSource(env, "owner", "returnable"); assert.equal((await getBillingStatus(env, "owner")).credits.debt, 10, "only the 10 credits used to repay the original debt are reversed");
  } finally { db.close(); }
});
test("referral amount/expiry are frozen at first payment and first-observed refunded invoices never mint rewards", async () => {
  const db = new SqliteD1Database(); const env = environment(db);
  try {
    const code = (await getBillingStatus(env, "referrer")).referral.code;
    await attributeReferral(env, "referred", code); await rewardReferral(env, "referred", "in_frozen", env.BILLING_NOW!);
    env.BILLING_CONFIG = JSON.stringify({ ...config, referralCredits: 80, creditLifetimeDays: 5 });
    await rewardReferral(env, "referred", "in_frozen", env.BILLING_NOW!);
    assert.equal((await getBillingStatus(env, "referrer")).credits.available, 25);
    assert.equal((await listCreditLedger(env, "referrer")).entries.filter(e => e.kind === "grant").length, 1);
    await attributeReferral(env, "alreadyRefunded", code);
    await rewardReferral(env, "alreadyRefunded", "in_revoked", env.BILLING_NOW!, { reversed: true });
    await rewardReferral(env, "alreadyRefunded", "in_revoked", env.BILLING_NOW!);
    assert.equal((await listCreditLedger(env, "referrer")).entries.some(e => e.source === "referral:in_revoked"), false);
    const row = db.raw.prepare("SELECT reward_amount,reward_expires_at FROM billing_referrals WHERE referred_uid=? AND mode='test'").get("referred");
    assert.equal(row?.reward_amount, 25); assert.equal(row?.reward_expires_at, "2026-03-02T12:00:00.000Z");
  } finally { db.close(); }
});
