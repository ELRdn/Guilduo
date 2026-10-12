import type { TestContext } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createQuest, migrateState } from "../server/questforge-domain.ts";
import { createAgent, updateAgent } from "../worker/src/agent-store.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { acquireBillingSync, applyBillingSnapshot, getBillingStatus, grantCredits, releaseBillingSync, selectFreeAgents } from "../worker/src/billing-store.ts";
import { applyDecision, buildJevRequest, estimateDecision, executeDecision, getDecision, getJevConfig, getDecisionReconciliationReport, reconcileDecisionSettlement, JEV_ENDPOINT, JEV_MODEL, normalizeDecisionInput, parseJevResult, type DecisionInput, type JevEnv, type JevRequest, type JevResult } from "../worker/src/jev.ts";
import { asQuestForgeState, hasErrorCode, required, SqliteD1Database } from "./test-helpers.ts";
import type { D1DatabaseLike } from "../worker/src/worker-types.ts";

const test = require("node:test");
const assert = require("node:assert/strict");
const UID = "jev-owner";
const BILLING_CONFIG = JSON.stringify({ approved: true, currency: "usd", monthlyPriceId: "price_monthly", annualPriceId: "price_annual", monthlyCredits: 100, annualMonthlyCredits: 100, creditLifetimeDays: 30, decisionCredits: 3, referralCredits: 5 });
function providerEnv(): JevEnv {
  return { JEV_ENABLED: "true", JEV_MODEL, TYPESAFE_API_KEY: "synthetic-test-key", JEV_INPUT_USD_PER_MILLION: "0.042", JEV_OUTPUT_USD_PER_MILLION: "0", JEV_DATA_POLICY_APPROVED: "true", JEV_EVALUATION_BUDGET_USD: "1" };
}
async function pro(env: JevEnv, enabled = true): Promise<void> {
  const token = await acquireBillingSync(env, UID);
  await applyBillingSnapshot(env, UID, token, enabled ? { id: "sub_test", status: "active", periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z", interval: "monthly", invoiceId: "in_test", invoicePaid: true, cancelAtPeriodEnd: false, monthlyCredits: 100, lifetimeDays: 30 } : null, [], []);
  await releaseBillingSync(env, UID, token);
}
async function fixture(t: TestContext, database?: D1DatabaseLike) {
  const db = new SqliteD1Database();
  t.after(() => db.close());
  const env: JevEnv = { ...providerEnv(), QUESTFORGE_DB: database ?? db, BILLING_ENABLED: "true", BILLING_MODE: "test", BILLING_CONFIG, BILLING_NOW: "2026-10-03T00:00:00.000Z" };
  await pro(env);
  await grantCredits(env, UID, "synthetic-seed", 100, "2026-11-01T00:00:00.000Z");
  const agent = required(await createAgent(env, UID, { agentId: "engineer", displayName: "Engineer", role: "Implement software", instructions: "secret=not-for-provider", defaultHandoffState: "accepted" }));
  const state = migrateState(asQuestForgeState({ schemaVersion: 7, tasks: [], character: {}, battle: {}, boss: {}, createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" }));
  const quest = createQuest(state, { kind: "todo", title: "Implement a parser", completionCriteria: "Tests pass", nextAction: "Write the parser", notes: "private notes", externalLinks: [] });
  await writeState(env, UID, { state });
  const input: DecisionInput = { questId: quest.id, expectedUpdatedAt: quest.updatedAt, agentIds: [agent.agentId], requestId: "request-1", consent: true };
  return { db, env, input, quest, state, agent };
}
function responseFor(request: JevRequest, confidence = 0.95, agentChoice = "agent:engineer"): JevResult {
  const agentOptions = Object.keys(request.questions.agent.criteria);
  return { model: JEV_MODEL, answers: {
    agent: { type: "choice", choice: agentChoice, confidence, probabilities: Object.fromEntries(agentOptions.map(key => [key, key === agentChoice ? 1 : 0])) },
    action: { type: "choice", choice: "continue", confidence, probabilities: { continue: 1, ask_human: 0, review: 0, wait: 0 } },
  }, usage: { input_tokens: 400, output_tokens: 40 } };
}
function mockProvider(t: TestContext, transform?: (result: JevResult, request: JevRequest) => unknown) {
  let calls = 0;
  const requests: JevRequest[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | Request | URL, init?: RequestInit) => {
    assert.equal(String(url), JEV_ENDPOINT);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-test-key");
    assert.ok(init?.signal);
    const request = JSON.parse(String(init?.body)) as JevRequest;
    calls++; requests.push(request);
    return new Response(JSON.stringify(transform ? transform(responseFor(request), request) : responseFor(request)), { headers: { "content-type": "application/json", "x-request-id": "provider-123" } });
  });
  return { get calls() { return calls; }, requests };
}
async function reject(promise: Promise<unknown>, code: string) { await assert.rejects(promise, (error: unknown) => hasErrorCode(error, code)); }
function budget(db: SqliteD1Database): number { return Number((db.raw.prepare("SELECT used_nano_usd FROM jev_budget").get() as { used_nano_usd: number }).used_nano_usd); }

async function interruptBeforeStatus(f: Awaited<ReturnType<typeof fixture>>, status: "reserved" | "sending") {
  f.db.raw.exec(`CREATE TRIGGER interrupt_jev BEFORE UPDATE OF status ON jev_decisions WHEN NEW.status='${status}' BEGIN SELECT RAISE(ABORT,'synthetic interrupted worker'); END;`);
  await assert.rejects(executeDecision(f.env, UID, f.input), /synthetic interrupted worker/);
  f.db.raw.exec("DROP TRIGGER interrupt_jev;");
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  const config = getJevConfig(f.env);
  const held = config.commercial ? f.db.raw.prepare("SELECT used_nano_usd FROM jev_commercial_budgets WHERE id=?").get(config.budgetId)?.used_nano_usd : budget(f.db);
  assert.equal(held, config.maxCostNanoUsd);
}

for (const checkpoint of ["reserved", "sending"] as const) test(`unsent reservation interrupted before ${checkpoint} recovers once across concurrent operators`, async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  await interruptBeforeStatus(f, checkpoint);
  const report = await getDecisionReconciliationReport(f.env);
  assert.equal(report.decisions[0]?.status, checkpoint === "reserved" ? "created" : "reserved");
  assert.equal(report.decisions[0]?.credit_outcome, null);
  await reject(reconcileDecisionSettlement(f.env, "other-owner", f.input.requestId!), "jev_decision_not_found");
  await reject(reconcileDecisionSettlement({ ...f.env, BILLING_MODE: "live" }, UID, f.input.requestId!), "jev_decision_not_found");
  const recovered = await Promise.all([reconcileDecisionSettlement(f.env, UID, f.input.requestId!), reconcileDecisionSettlement(f.env, UID, f.input.requestId!)]);
  assert.ok(recovered.every(d => d.status === "error" && d.errorCode === "jev_interrupted_before_send" && d.estimatedCostUsd === 0));
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
  assert.equal(budget(f.db), 0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE kind='return'").get()?.n, 1);
  assert.equal((await getDecisionReconciliationReport(f.env)).total, 0);
  assert.equal((await executeDecision({ ...f.env }, UID, f.input)).status, "error");
  assert.equal(mock.calls, 0);
});

for (const checkpoint of ["reserved", "sending"] as const) test(`operator recovery fences a paused sender before its ${checkpoint} transition`, async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  const prepare = f.db.prepare.bind(f.db);
  let paused!: () => void; let resume!: () => void;
  const atSending = new Promise<void>(resolve => { paused = resolve; });
  const continued = new Promise<void>(resolve => { resume = resolve; });
  t.mock.method(f.db, "prepare", (sql: string) => {
    const statement = prepare(sql); const bind = statement.bind.bind(statement);
    statement.bind = (...values: unknown[]) => {
      const bound = bind(...values);
      if (sql.includes("UPDATE jev_decisions SET status") && (values[0] === checkpoint || sql.includes(`SET status='${checkpoint}'`))) {
        const run = bound.run.bind(bound);
        bound.run = async () => { paused(); await continued; return run(); };
      }
      return bound;
    };
    return statement;
  });
  const running = executeDecision(f.env, UID, f.input);
  try {
    await atSending;
    const recovered = await reconcileDecisionSettlement(f.env, UID, f.input.requestId!);
    assert.equal(recovered.status, "error");
    assert.equal(recovered.errorCode, "jev_interrupted_before_send");
  } finally { resume(); await running; }
  assert.equal((await running).status, "error");
  assert.equal(mock.calls, 0);
  assert.equal(budget(f.db), 0);
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE kind='return'").get()?.n, 1);
});

async function workerdDatabase(t: TestContext) {
  // Wrangler's already-installed Miniflare runs the actual local D1 binding; no remote resources.
  const { Miniflare } = require("miniflare") as typeof import("miniflare");
  const runtime = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('isolated test'); } };", compatibilityDate: "2026-08-06", d1Databases: ["DB"] });
  t.after(() => runtime.dispose());
  const d1 = await runtime.getD1Database("DB");
  const schema = new SqliteD1Database();
  try {
    const statements = schema.raw.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all() as { sql: string }[];
    await d1.batch(statements.map(row => d1.prepare(row.sql)));
    await d1.prepare("INSERT INTO jev_budget(id) VALUES ('official')").run();
  } finally { schema.close(); }
  return d1;
}

test("unsent recovery runs on workerd D1 with concurrent operators and resumable settlement", async (t: TestContext) => {
  const d1 = await workerdDatabase(t);
  const f = await fixture(t, d1); const mock = mockProvider(t);
  await d1.prepare("CREATE TRIGGER interrupt_jev BEFORE UPDATE OF status ON jev_decisions WHEN NEW.status='reserved' BEGIN SELECT RAISE(ABORT,'synthetic interrupted worker'); END").run();
  await assert.rejects(executeDecision(f.env, UID, f.input), /synthetic interrupted worker/);
  await d1.prepare("DROP TRIGGER interrupt_jev").run();
  const original = await d1.prepare("SELECT status,credit_outcome FROM jev_decisions").first();
  assert.deepEqual(original, { status: "created", credit_outcome: null });
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  await d1.prepare("CREATE TRIGGER hold_return BEFORE INSERT ON billing_credit_ledger WHEN NEW.kind='return' BEGIN SELECT RAISE(ABORT,'synthetic return outage'); END").run();
  await assert.rejects(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), /synthetic return outage/);
  assert.equal((await d1.prepare("SELECT status FROM jev_decisions").first())?.status, "settling");
  assert.equal((await d1.prepare("SELECT used_nano_usd FROM jev_budget").first())?.used_nano_usd, getJevConfig(f.env).maxCostNanoUsd);
  await d1.prepare("DROP TRIGGER hold_return").run();
  const results = await Promise.all([reconcileDecisionSettlement(f.env, UID, f.input.requestId!), reconcileDecisionSettlement(f.env, UID, f.input.requestId!)]);
  assert.ok(results.every(d => d.status === "error" && d.errorCode === "jev_interrupted_before_send"));
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
  assert.equal((await d1.prepare("SELECT used_nano_usd FROM jev_budget").first())?.used_nano_usd, 0);
  assert.equal((await d1.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE kind='return'").first())?.n, 1);
  assert.equal(mock.calls, 0);
});

test("workerd D1 recovers absent Credit reservations and fences concurrent reservation writes", async (t: TestContext) => {
  const d1 = await workerdDatabase(t);
  const db: D1DatabaseLike = d1;
  const f = await fixture(t, d1); const mock = mockProvider(t);
  Object.assign(f.env, { JEV_BUDGET_SCOPE: "commercial", JEV_COMMERCIAL_CONFIG: JSON.stringify({ approved: true, mode: "test", periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z", limitUsd: 1 }) });
  await t.test("failed reservation releases only the original budget without a Credit return", async () => {
    await d1.prepare("CREATE TRIGGER fail_reserve BEFORE INSERT ON billing_credit_ledger WHEN NEW.kind='reserve' BEGIN SELECT RAISE(ABORT,'synthetic reservation outage'); END").run();
    const pending = await executeDecision(f.env, UID, f.input);
    assert.equal(pending.errorCode, "jev_reservation_unknown");
    assert.equal((await d1.prepare("SELECT COUNT(*) AS n FROM billing_credit_reservations").first())?.n, 0);
    assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
    assert.equal((await d1.prepare("SELECT used_nano_usd FROM jev_commercial_budgets").first())?.used_nano_usd, getJevConfig(f.env).maxCostNanoUsd);
    await d1.prepare("DROP TRIGGER fail_reserve").run();
    await reject(reconcileDecisionSettlement(f.env, "other-owner", f.input.requestId!), "jev_decision_not_found");
    await reject(reconcileDecisionSettlement({ ...f.env, BILLING_MODE: "live" }, UID, f.input.requestId!), "jev_decision_not_found");
    await d1.prepare("CREATE TRIGGER hold_budget BEFORE UPDATE ON jev_commercial_budgets BEGIN SELECT RAISE(ABORT,'synthetic budget outage'); END").run();
    try { await assert.rejects(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), /synthetic budget outage/); }
    finally { await d1.prepare("DROP TRIGGER hold_budget").run(); }
    const next = { ...f.env, BILLING_NOW: "2026-11-02T00:00:00.000Z", JEV_COMMERCIAL_CONFIG: JSON.stringify({ approved: true, mode: "test", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", limitUsd: 1 }) };
    await d1.prepare("INSERT INTO jev_commercial_budgets(id,mode,period_start,period_end,limit_nano_usd,used_nano_usd) VALUES ('test:2026-11-01T00:00:00.000Z','test','2026-11-01T00:00:00.000Z','2026-12-01T00:00:00.000Z',1000000000,7)").run();
    const results = await Promise.all([reconcileDecisionSettlement(next, UID, f.input.requestId!), reconcileDecisionSettlement(next, UID, f.input.requestId!)]);
    assert.ok(results.every(d => d.status === "error" && d.errorCode === "jev_reservation_not_created" && d.estimatedCostUsd === 0));
    assert.equal((await d1.prepare("SELECT SUM(used_nano_usd) AS used FROM jev_commercial_budgets").first())?.used, 7);
    assert.equal((await d1.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE kind IN ('reserve','return','commit')").first())?.n, 0);
    assert.equal((await executeDecision(f.env, UID, f.input)).status, "error");
  });
  for (const checkpoint of ["before", "after"] as const) await t.test(`recovery ${checkpoint} the reservation batch prevents the paused sender from resuming`, async () => {
    const input = { ...f.input, requestId: `reserve-race-${checkpoint}` };
    let reached!: () => void; let resume!: () => void; let paused = false;
    const atReservation = new Promise<void>(resolve => { reached = resolve; });
    const continued = new Promise<void>(resolve => { resume = resolve; });
    const pausedDb: D1DatabaseLike = {
      prepare: sql => db.prepare(sql),
      async batch(statements) {
        const row = await d1.prepare("SELECT status,budget_reserved FROM jev_decisions WHERE mode='test' AND uid=? AND id=?").bind(UID, input.requestId).first<{ status: string; budget_reserved: number }>();
        const stop = !paused && row?.status === "created" && row.budget_reserved === 1;
        if (stop) { paused = true; if (checkpoint === "before") { reached(); await continued; } }
        const results = await db.batch(statements);
        if (stop && checkpoint === "after") { reached(); await continued; }
        return results;
      },
    };
    const running = executeDecision({ ...f.env, QUESTFORGE_DB: pausedDb }, UID, input);
    try {
      await atReservation;
      const results = await Promise.all([reconcileDecisionSettlement(f.env, UID, input.requestId), reconcileDecisionSettlement(f.env, UID, input.requestId)]);
      assert.ok(results.every(d => d.status === "error" && d.errorCode === (checkpoint === "before" ? "jev_reservation_not_created" : "jev_interrupted_before_send")));
    } finally { resume(); await running; }
    assert.equal((await running).status, "error");
    assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
    assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
    assert.equal((await d1.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE mode='test' AND uid=? AND request_id=? AND kind='reserve'").bind(UID, `jev:${input.requestId}`).first())?.n, checkpoint === "before" ? 0 : 1);
    assert.equal((await d1.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE mode='test' AND uid=? AND request_id=? AND kind='return'").bind(UID, `jev:${input.requestId}`).first())?.n, checkpoint === "before" ? 0 : 1);
    assert.equal((await d1.prepare("SELECT SUM(used_nano_usd) AS used FROM jev_commercial_budgets").first())?.used, 7);
  });
  assert.equal(mock.calls, 0);
  assert.equal((await getDecisionReconciliationReport(f.env)).total, 0);
});

test("unsent recovery refuses missing, mismatched, committed or provider-evidenced reservations", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  await interruptBeforeStatus(f, "sending");
  const reservation = required(f.db.raw.prepare("SELECT payload FROM billing_credit_reservations").get() as { payload: string } | undefined).payload;
  for (const patch of [{ amount: 4 }, { status: "commit" }, { requestId: "jev:other" }]) {
    f.db.raw.prepare("UPDATE billing_credit_reservations SET payload=?").run(JSON.stringify({ ...JSON.parse(reservation), ...patch }));
    await reject(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), "jev_provider_reconciliation_required");
    assert.equal(budget(f.db), getJevConfig(f.env).maxCostNanoUsd);
  }
  f.db.raw.prepare("UPDATE billing_credit_reservations SET payload=?").run(reservation);
  f.db.raw.exec("UPDATE jev_decisions SET provider_request_id='possible-send';");
  await reject(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), "jev_provider_reconciliation_required");
  f.db.raw.exec("UPDATE jev_decisions SET provider_request_id=NULL; DELETE FROM billing_credit_reservations;");
  await reject(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), "jev_provider_reconciliation_required");
  f.db.raw.exec("UPDATE jev_decisions SET status='created';");
  await reject(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), "jev_provider_reconciliation_required");
  assert.equal(budget(f.db), getJevConfig(f.env).maxCostNanoUsd);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE kind='return'").get()?.n, 0);
  assert.equal(mock.calls, 0);
});

test("a sender that wins the CAS retains sending and unknown reservations", async (t: TestContext) => {
  const f = await fixture(t);
  let sent!: () => void; let resume!: () => void; let calls = 0;
  const atProvider = new Promise<void>(resolve => { sent = resolve; });
  const continued = new Promise<void>(resolve => { resume = resolve; });
  t.mock.method(globalThis, "fetch", async () => { calls++; sent(); await continued; throw new Error("isolated unknown send"); });
  const running = executeDecision(f.env, UID, f.input);
  try {
    await atProvider;
    assert.equal(f.db.raw.prepare("SELECT status FROM jev_decisions").get()?.status, "sending");
    await reject(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), "jev_provider_reconciliation_required");
  } finally { resume(); await running; }
  assert.equal((await running).status, "pending");
  await reject(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), "jev_provider_reconciliation_required");
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  assert.equal(budget(f.db), getJevConfig(f.env).maxCostNanoUsd);
  assert.equal(calls, 1);
});

test("a committed reservation with a lost acknowledgement can be recovered from reservation_unknown", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  const batch = f.db.batch.bind(f.db); let interrupted = false;
  t.mock.method(f.db, "batch", async (statements: Parameters<typeof batch>[0]) => {
    const results = await batch(statements);
    if (!interrupted && f.db.raw.prepare("SELECT COUNT(*) AS n FROM billing_credit_reservations").get()?.n === 1) {
      interrupted = true; throw new Error("synthetic lost reservation acknowledgement");
    }
    return results;
  });
  const pending = await executeDecision(f.env, UID, f.input);
  assert.equal(pending.errorCode, "jev_reservation_unknown");
  assert.equal((await reconcileDecisionSettlement(f.env, UID, f.input.requestId!)).status, "error");
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal(budget(f.db), 0);
  assert.equal(mock.calls, 0);
});

test("unsent recovery interrupted after Credit return releases only its original commercial period", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  const period = { approved: true, mode: "test", periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z", limitUsd: 1 };
  Object.assign(f.env, { JEV_BUDGET_SCOPE: "commercial", JEV_COMMERCIAL_CONFIG: JSON.stringify(period) });
  await interruptBeforeStatus(f, "sending");
  f.db.raw.exec("CREATE TRIGGER interrupt_budget BEFORE UPDATE ON jev_commercial_budgets BEGIN SELECT RAISE(ABORT,'synthetic budget outage'); END;");
  await assert.rejects(reconcileDecisionSettlement(f.env, UID, f.input.requestId!), /synthetic budget outage/);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
  assert.equal(f.db.raw.prepare("SELECT status FROM jev_decisions").get()?.status, "settling");
  f.db.raw.exec("DROP TRIGGER interrupt_budget;");
  const next = { ...f.env, BILLING_NOW: "2026-11-02T00:00:00.000Z", JEV_COMMERCIAL_CONFIG: JSON.stringify({ ...period, periodStart: period.periodEnd, periodEnd: "2026-12-01T00:00:00.000Z" }) };
  await estimateDecision(next, UID, f.input);
  const results = await Promise.all([reconcileDecisionSettlement(next, UID, f.input.requestId!), reconcileDecisionSettlement(next, UID, f.input.requestId!)]);
  assert.ok(results.every(d => d.status === "error"));
  assert.equal(f.db.raw.prepare("SELECT SUM(used_nano_usd) AS used FROM jev_commercial_budgets").get()?.used, 0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE kind='return'").get()?.n, 1);
  assert.equal(budget(f.db), 0);
  assert.equal(mock.calls, 0);
});

test("operator settlement repairs a database failure once without another Jev call; unknown outcomes remain held", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  f.db.raw.exec("CREATE TRIGGER fail_credit_commit BEFORE INSERT ON billing_credit_ledger WHEN NEW.kind='commit' BEGIN SELECT RAISE(ABORT,'synthetic unavailable ledger'); END;");
  const failed = await executeDecision(f.env, UID, f.input);
  assert.equal(failed.status, "pending"); assert.equal(failed.errorCode, "jev_settlement_pending");
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  const report = await getDecisionReconciliationReport(f.env);
  assert.equal(report.total, 1); assert.equal(report.decisions[0]?.credit_outcome, "commit");
  assert.ok(!JSON.stringify(report).includes(f.quest.title));
  f.db.raw.exec("DROP TRIGGER fail_credit_commit;");
  const cost = budget(f.db);
  const results = await Promise.all([reconcileDecisionSettlement(f.env, UID, f.input.requestId!), reconcileDecisionSettlement(f.env, UID, f.input.requestId!)]);
  assert.ok(results.every(result => result.status === "suggestion"));
  assert.equal(mock.calls, 1); assert.equal(budget(f.db), cost);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
  assert.equal((await getDecisionReconciliationReport(f.env)).total, 0);
  t.mock.method(globalThis, "fetch", async () => { throw new DOMException("timeout", "TimeoutError"); });
  await executeDecision(f.env, UID, { ...f.input, requestId: "unknown" });
  await reject(reconcileDecisionSettlement(f.env, UID, "unknown"), "jev_provider_reconciliation_required");
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  await reject(reconcileDecisionSettlement(f.env, "other-owner", "unknown"), "jev_decision_not_found");
});

test("availability requires explicitly approved official prices, fixed model and at-most-$1 budget", () => {
  const env = providerEnv();
  assert.equal(getJevConfig(env).maxCostNanoUsd, 65_536 * 42);
  for (const bad of [{ JEV_MODEL: "jev-latest" }, { JEV_MODEL: "jev-preview" }, { JEV_MODEL: "jev-99.0.0" }, { JEV_INPUT_USD_PER_MILLION: undefined }, { JEV_INPUT_USD_PER_MILLION: "0" }, { JEV_INPUT_USD_PER_MILLION: "0.043" }, { JEV_OUTPUT_USD_PER_MILLION: undefined }, { JEV_OUTPUT_USD_PER_MILLION: " " }, { JEV_OUTPUT_USD_PER_MILLION: "1" }, { JEV_DATA_POLICY_APPROVED: undefined }, { JEV_ENABLED: "false" }, { JEV_EVALUATION_BUDGET_USD: "1.01" }, { JEV_EVALUATION_BUDGET_USD: "0" }, { JEV_EVALUATION_BUDGET_USD: "NaN" }, { TYPESAFE_API_KEY: "" }]) {
    assert.throws(() => getJevConfig({ ...env, ...bad }), (error: unknown) => hasErrorCode(error, "jev_unavailable"));
  }
});

test("normalization rejects coercion, unknown fields, unbounded and duplicate candidates", () => {
  const valid = { questId: "quest-1", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" };
  for (const input of [null, [], { ...valid, token: "secret" }, { ...valid, questId: 3 }, { ...valid, expectedUpdatedAt: "bad" }, { ...valid, consent: "true" }, { ...valid, agentIds: [] }, { ...valid, agentIds: ["a", "a"] }, { ...valid, agentIds: new Array(255).fill("agent") }, { ...valid, requestId: "x".repeat(101) }, { ...valid, requestId: "not URL safe" }]) assert.throws(() => normalizeDecisionInput(input));
  assert.deepEqual(normalizeDecisionInput({ ...valid, agentIds: ["b", "a"] }).agentIds, ["a", "b"]);
});

test("estimate has no provider call, no reservation, no raw context persistence, and exposes candidate selection", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  const estimate = await estimateDecision(f.env, UID, f.input);
  assert.equal(estimate.available, true); assert.equal(estimate.credits, 3); assert.equal(estimate.requiresConsent, true);
  assert.deepEqual(estimate.actions, ["continue", "ask_human", "review", "wait"]);
  assert.deepEqual(estimate.candidateAgentIds, ["engineer"]);
  assert.equal(mock.calls, 0); assert.equal(budget(f.db), 0);
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM jev_decisions").get()?.n, 0);
});

test("execute sends two official Choices, reserves/commits once and apply returns assignment without writes", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  f.state.tasks[0].title = "Parser https://private.invalid/token apiKey=secret user@example.test";
  await writeState(f.env, UID, { state: f.state });
  const result = await executeDecision(f.env, UID, f.input);
  assert.equal(result.status, "suggestion"); assert.equal(result.agentId, "engineer"); assert.equal(result.action, "continue");
  assert.equal(result.providerRequestId, "provider-123"); assert.equal(result.estimatedCostUsd, 400 * 42 / 1e9);
  const request = mock.requests[0];
  assert.equal(request.model, JEV_MODEL); assert.deepEqual(Object.keys(request.questions), ["agent", "action"]);
  const body = JSON.stringify(request);
  for (const text of ["private.invalid", "apiKey=secret", "user@example.test", "private notes", "not-for-provider", UID]) assert.equal(body.includes(text), false);
  const before = await readState(f.env, UID);
  const mutation = await applyDecision(f.env, UID, result.id, { expectedUpdatedAt: f.input.expectedUpdatedAt });
  assert.deepEqual(mutation, { questId: f.quest.id, expectedUpdatedAt: f.quest.updatedAt, agentId: "engineer", action: "continue", handoffState: "ready", dryRun: false });
  assert.deepEqual(await readState(f.env, UID), before);
  await reject(applyDecision(f.env, UID, result.id, { expectedUpdatedAt: f.input.expectedUpdatedAt, handoffState: "accepted" }), "jev_invalid_input");
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 97); assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
  assert.equal(budget(f.db), 400 * 42);
  const saved = JSON.stringify(f.db.raw.prepare("SELECT * FROM jev_decisions").get());
  for (const text of ["Implement a parser", "private notes", "not-for-provider", "synthetic-test-key"]) assert.equal(saved.includes(text), false);
  assert.equal(mock.calls, 1);
});

test("explicit consent, Pro and sufficient credits are enforced before provider or reservation", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  await reject(executeDecision(f.env, UID, { ...f.input, consent: false }), "jev_consent_required");
  await reject(executeDecision(f.env, UID, { ...f.input, requestId: undefined }), "jev_request_id_required");
  const unapproved = { ...f.env, BILLING_CONFIG: JSON.stringify({ ...JSON.parse(BILLING_CONFIG), approved: false }) };
  await reject(executeDecision(unapproved, UID, f.input), "billing_not_configured");
  await reject(executeDecision({ ...f.env, BILLING_CONFIG: JSON.stringify({ ...JSON.parse(BILLING_CONFIG), decisionCredits: 0 }) }, UID, f.input), "jev_credit_price_required");
  await pro(f.env, false); await reject(executeDecision(f.env, UID, f.input), "pro_required");
  await pro(f.env); await reject(executeDecision({ ...f.env, BILLING_CONFIG: JSON.stringify({ ...JSON.parse(BILLING_CONFIG), decisionCredits: 101 }) }, UID, f.input), "insufficient_credits");
  assert.equal(mock.calls, 0); assert.equal(budget(f.db), 0);
});

test("request ID deduplicates concurrently, survives fresh env and forbids mismatched normalized input", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  const decisions = await Promise.all([executeDecision(f.env, UID, f.input), executeDecision(f.env, UID, { ...f.input })]);
  assert.ok(decisions.some(d => d.status === "suggestion")); assert.equal(mock.calls, 1);
  const replay = await executeDecision({ ...f.env }, UID, f.input);
  assert.equal(replay.status, "suggestion"); assert.equal(mock.calls, 1);
  await reject(executeDecision(f.env, UID, { ...f.input, expectedUpdatedAt: "2026-10-04T00:00:00.000Z" }), "jev_request_conflict");
  await reject(getDecision(f.env, "another-owner", f.input.requestId!), "jev_decision_not_found");
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 97);
});

test("unknown/timeout/malformed result stays pending with durable Credit and full worst-case budget", async (t: TestContext) => {
  const f = await fixture(t); let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new DOMException("Synthetic timeout", "TimeoutError"); });
  const decision = await executeDecision(f.env, UID, f.input);
  assert.equal(decision.status, "pending"); assert.equal(decision.errorCode, "jev_outcome_unknown");
  assert.equal(budget(f.db), getJevConfig(f.env).maxCostNanoUsd);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  await executeDecision({ ...f.env }, UID, f.input); assert.equal(calls, 1);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response("bad-json", { headers: { "x-request-id": "unknown-body" } }));
  const malformed = await executeDecision(f.env, UID, { ...f.input, requestId: "malformed" });
  assert.equal(malformed.status, "pending"); assert.equal(malformed.providerRequestId, "unknown-body");
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 6);
});

test("known rejected request returns Credits; unknown 5xx remains reserved", async (t: TestContext) => {
  const f = await fixture(t);
  for (const status of [401, 422, 429, 500]) {
    t.mock.method(globalThis, "fetch", async () => new Response("not retained", { status, headers: { "x-request-id": `rejected-${status}` } }));
    const decision = await executeDecision(f.env, UID, { ...f.input, requestId: `http-${status}` });
    assert.equal(decision.status, status === 500 ? "pending" : "error");
    assert.equal(decision.providerRequestId, `rejected-${status}`);
    if (status !== 500) assert.equal(decision.estimatedCostUsd, 0);
    t.mock.restoreAll();
  }
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 97);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 3);
  assert.equal(budget(f.db), getJevConfig(f.env).maxCostNanoUsd);
});

test("Quest changed after Credit reservation is known unsent: return Credits and release provider budget", async (t: TestContext) => {
  const f = await fixture(t); let stateReads = 0; let providerCalls = 0;
  Object.assign(f.env, { APPWRITE_ENDPOINT: "https://appwrite.test/v1", APPWRITE_PROJECT_ID: "synthetic-project", APPWRITE_DATABASE_ID: "synthetic-db", APPWRITE_STATE_TABLE_ID: "user_states", APPWRITE_API_KEY: "synthetic-appwrite-key" });
  t.mock.method(globalThis, "fetch", async (url: string | Request | URL) => {
    if (String(url) === JEV_ENDPOINT) { providerCalls++; throw new Error("Must not send changed Quest"); }
    assert.ok(String(url).startsWith("https://appwrite.test/v1/tablesdb/"));
    stateReads++;
    const state = structuredClone(f.state);
    if (stateReads >= 3) state.tasks[0].updatedAt = "2026-10-04T00:00:00.000Z";
    return Response.json({ stateJson: JSON.stringify(state), revision: stateReads, schemaVersion: 7 });
  });
  const result = await executeDecision(f.env, UID, f.input);
  assert.equal(result.status, "error"); assert.equal(result.errorCode, "jev_changed_before_send");
  assert.equal(providerCalls, 0); assert.equal(budget(f.db), 0);
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal((await getBillingStatus(f.env, UID)).credits.reserved, 0);
});

test("invalid Choice with known usage returns user Credits but preserves real external cost", async (t: TestContext) => {
  const f = await fixture(t);
  mockProvider(t, result => ({ ...result, answers: { ...result.answers, agent: { ...result.answers.agent, choice: "agent:foreign" } } }));
  const result = await executeDecision(f.env, UID, f.input);
  assert.equal(result.status, "error"); assert.equal(result.errorCode, "jev_protocol_error");
  assert.equal(result.usage?.input_tokens, 400); assert.equal(result.result, null);
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 100);
  assert.equal(budget(f.db), 400 * 42);
});

test("low-confidence and explicit manual Choices commit once but never become an applicable assignment", async (t: TestContext) => {
  const f = await fixture(t);
  mockProvider(t, (_result, request) => responseFor(request, 0.2));
  const low = await executeDecision(f.env, UID, f.input); assert.equal(low.status, "manual"); assert.equal(low.agentId, null);
  await reject(applyDecision(f.env, UID, low.id, { expectedUpdatedAt: f.input.expectedUpdatedAt }), "jev_manual_required");
  t.mock.restoreAll(); mockProvider(t, (_result, request) => responseFor(request, 1, "manual"));
  const manual = await executeDecision(f.env, UID, { ...f.input, requestId: "manual" }); assert.equal(manual.status, "manual");
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 94);
});

test("Choice validates closed set, confidence, probabilities, sum, argmax and usage/model", () => {
  const request = buildJevRequest(JEV_MODEL, { title: "Test", completionCriteria: "Pass", nextAction: "Test", lifecycleState: "active", planningState: "backlog" }, [{ agentId: "engineer", role: "Engineer" }]);
  const good = responseFor(request);
  assert.deepEqual(parseJevResult({ ...good, unsolicited_text: "discard" }, request), good);
  for (const patch of [
    { confidence: -1 }, { confidence: 1.1 }, { confidence: NaN }, { confidence: "0.9" }, { type: "score" }, { choice: "foreign" },
    { probabilities: { "agent:engineer": 0.1, manual: 0.9 } }, { probabilities: { "agent:engineer": 1.1, manual: -0.1 } },
    { probabilities: { "agent:engineer": 0.8, manual: 0.1 } }, { probabilities: { "agent:engineer": 1 } }, { probabilities: { "agent:engineer": 1, manual: 0, foreign: 0 } },
  ]) assert.throws(() => parseJevResult({ ...good, answers: { ...good.answers, agent: { ...good.answers.agent, ...patch } } }, request));
  for (const patch of [{ model: "jev-latest" }, { usage: { input_tokens: 65_537, output_tokens: 1 } }, { usage: { input_tokens: 1.5, output_tokens: 0 } }, { usage: { input_tokens: -1, output_tokens: 0 } }, { usage: { input_tokens: 1, output_tokens: "3" } }]) assert.throws(() => parseJevResult({ ...good, ...patch }, request));
});

test("current Quest version and Agent access are rechecked on application; no bypass after downgrade", async (t: TestContext) => {
  const f = await fixture(t); mockProvider(t);
  const result = await executeDecision(f.env, UID, f.input);
  await reject(applyDecision(f.env, UID, result.id, { expectedUpdatedAt: "2026-10-04T00:00:00.000Z" }), "stale_quest");
  await updateAgent(f.env, UID, "engineer", { status: "disabled", expectedUpdatedAt: f.agent.updatedAt });
  await reject(applyDecision(f.env, UID, result.id, { expectedUpdatedAt: f.input.expectedUpdatedAt }), "jev_agent_unavailable");
  f.state.tasks[0].updatedAt = "2026-10-04T00:00:00.000Z"; await writeState(f.env, UID, { state: f.state });
  await reject(applyDecision(f.env, UID, result.id, { expectedUpdatedAt: f.input.expectedUpdatedAt }), "stale_quest");
  await reject(estimateDecision(f.env, UID, f.input), "stale_quest");
});

test("candidates enforce owner, active status, scopes and the Free selected two", async (t: TestContext) => {
  const f = await fixture(t); const mock = mockProvider(t);
  await createAgent(f.env, "foreign-owner", { agentId: "foreign", displayName: "Foreign" });
  await createAgent(f.env, UID, { agentId: "readonly", displayName: "Reader", allowedScopes: ["quests:read"] });
  await createAgent(f.env, UID, { agentId: "second", displayName: "Second" });
  await createAgent(f.env, UID, { agentId: "third", displayName: "Third" });
  await reject(estimateDecision(f.env, UID, { ...f.input, agentIds: ["foreign"] }), "jev_agent_unavailable");
  await reject(estimateDecision(f.env, UID, { ...f.input, agentIds: ["readonly"] }), "jev_agent_unavailable");
  await pro(f.env, false);
  await reject(estimateDecision(f.env, UID, f.input), "jev_agent_unavailable");
  await selectFreeAgents(f.env, UID, ["engineer", "second"]);
  const estimate = await estimateDecision(f.env, UID, f.input); assert.equal(estimate.reason, "pro_required");
  await reject(estimateDecision(f.env, UID, { ...f.input, agentIds: ["third"] }), "jev_agent_unavailable");
  assert.equal(mock.calls, 0);
});

test("persistent worst-case budget is atomic across concurrent requests and survives env recreation", async (t: TestContext) => {
  const f = await fixture(t); let calls = 0;
  f.env.JEV_EVALUATION_BUDGET_USD = "0.002752512";
  const prepare = f.db.prepare.bind(f.db);
  let snapshots = 0;
  let release!: () => void;
  const bothEstimated = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(f.db, "prepare", (sql: string) => {
    const statement = prepare(sql);
    if (sql === "SELECT used_nano_usd FROM jev_budget WHERE id='official'") {
      const first = statement.first.bind(statement);
      statement.first = async <T,>() => {
        const snapshot = await first<T>();
        snapshots++;
        if (snapshots === 2) release();
        if (snapshots <= 2) await bothEstimated;
        return snapshot;
      };
    }
    return statement;
  });
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("Synthetic unknown transport result"); });
  const decisions = await Promise.all([executeDecision(f.env, UID, f.input), executeDecision(f.env, UID, { ...f.input, requestId: "concurrent" })]);
  assert.equal(calls, 1); assert.equal(decisions.filter(d => d.status === "pending").length, 1);
  assert.equal(decisions.filter(d => d.errorCode === "jev_budget_exhausted").length, 1);
  await reject(executeDecision({ ...f.env }, UID, { ...f.input, requestId: "third" }), "jev_budget_exhausted");
  assert.equal(budget(f.db), getJevConfig(f.env).maxCostNanoUsd);
});

test("254 Agent candidates plus manual fit one Choice; larger default selection requires narrowing", async (t: TestContext) => {
  const f = await fixture(t);
  for (let i = 1; i <= 254; i++) await createAgent(f.env, UID, { agentId: `agent-${i}`, displayName: `Agent ${i}`, role: "Engineer" });
  const ids = ["engineer", ...Array.from({ length: 253 }, (_, i) => `agent-${i + 1}`)];
  const estimate = await estimateDecision(f.env, UID, { ...f.input, agentIds: ids });
  assert.equal(estimate.candidateAgentIds.length, 254);
  await reject(estimateDecision(f.env, UID, { ...f.input, agentIds: undefined }), "jev_candidate_limit");
});

test("Test and Live decision IDs cannot share results or reservations", async (t: TestContext) => {
  const f = await fixture(t); mockProvider(t);
  await executeDecision(f.env, UID, f.input);
  const live = { ...f.env, BILLING_MODE: "live", JEV_BUDGET_SCOPE: "commercial", JEV_COMMERCIAL_CONFIG: JSON.stringify({approved:true,mode:"live",periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limitUsd:1}) };
  await reject(getDecision(live, UID, f.input.requestId!), "jev_decision_not_found");
  await pro(live); await grantCredits(live, UID, "live-seed", 100, "2026-11-01T00:00:00.000Z");
  const result = await executeDecision(live, UID, f.input); assert.equal(result.status, "suggestion");
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM jev_decisions").get()?.n, 2);
  assert.equal((await getBillingStatus(live, UID)).credits.available, 97);
  assert.equal((await getBillingStatus(f.env, UID)).credits.available, 97);
});

test("commercial period budget is separate, immutable, concurrent-safe and cannot consume evaluation funds", async (t: TestContext) => {
  const f=await fixture(t);const mock=mockProvider(t);
  const commercial={approved:true,mode:"test",periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limitUsd:2*getJevConfig(f.env).maxCostNanoUsd/1e9};
  const env={...f.env,JEV_BUDGET_SCOPE:"commercial",JEV_COMMERCIAL_CONFIG:JSON.stringify(commercial)};
  await executeDecision(env,UID,f.input);assert.equal(mock.calls,1);assert.equal(budget(f.db),0);
  const row=f.db.raw.prepare("SELECT used_nano_usd FROM jev_commercial_budgets").get() as {used_nano_usd:number};assert.equal(row.used_nano_usd,400*42);
  await reject(estimateDecision({...env,JEV_COMMERCIAL_CONFIG:JSON.stringify({...commercial,limitUsd:2})},UID,f.input),"jev_budget_config_conflict");
  await reject(estimateDecision({...env,JEV_COMMERCIAL_CONFIG:JSON.stringify({...commercial,mode:"live"})},UID,f.input),"jev_commercial_budget_required");
  await reject(estimateDecision({...env,BILLING_NOW:"2026-11-01T00:00:00.000Z"},UID,f.input),"jev_commercial_budget_required");
  // Conservatively hold an unknown outcome at the full worst-case estimate.
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("isolated timeout");});
  const attempts=await Promise.allSettled([executeDecision(env,UID,{...f.input,requestId:"pending-1"}),executeDecision(env,UID,{...f.input,requestId:"pending-2"})]);
  assert.equal(attempts.filter(a=>a.status==="fulfilled"&&a.value.status==="pending").length,1);
  const total=f.db.raw.prepare("SELECT used_nano_usd,limit_nano_usd FROM jev_commercial_budgets").get() as {used_nano_usd:number;limit_nano_usd:number};
  assert.equal(total.used_nano_usd,getJevConfig(f.env).maxCostNanoUsd+400*42);assert.ok(total.used_nano_usd<=total.limit_nano_usd);
  assert.equal(budget(f.db),0);
  await executeDecision(f.env,UID,{...f.input,requestId:"evaluation-only"});assert.equal(budget(f.db),getJevConfig(f.env).maxCostNanoUsd);
});

test("commercial pending reservations retain their original period during operator settlement", async (t: TestContext) => {
  const f=await fixture(t);mockProvider(t);
  const env={...f.env,JEV_BUDGET_SCOPE:"commercial",JEV_COMMERCIAL_CONFIG:JSON.stringify({approved:true,mode:"test",periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limitUsd:1})};
  f.db.raw.exec("CREATE TRIGGER hold_settlement BEFORE INSERT ON billing_credit_ledger WHEN NEW.kind='commit' BEGIN SELECT RAISE(ABORT,'isolated outage'); END;");
  const pending=await executeDecision(env,UID,f.input);assert.equal(pending.status,"pending");assert.equal(budget(f.db),0);
  f.db.raw.exec("DROP TRIGGER hold_settlement;");
  const nextPeriod={...env,BILLING_NOW:"2026-11-02T00:00:00.000Z",JEV_COMMERCIAL_CONFIG:JSON.stringify({approved:true,mode:"test",periodStart:"2026-11-01T00:00:00.000Z",periodEnd:"2026-12-01T00:00:00.000Z",limitUsd:1})};
  await reconcileDecisionSettlement(nextPeriod,UID,f.input.requestId!);assert.equal(budget(f.db),0);
  assert.equal((f.db.raw.prepare("SELECT used_nano_usd FROM jev_commercial_budgets").get() as {used_nano_usd:number}).used_nano_usd,400*42);
});

test("evaluation default dry-run has zero calls and keeps cumulative budget evidence; explicit execute stops before cap", async (t: TestContext) => {
  const { runEvaluation, evaluationBudgetUsed, summarizeEvaluation } = await import("../tools/evaluate-jev.mts");
  const directory = mkdtempSync(join(tmpdir(), "guilduo-jev-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const mock = mockProvider(t);
  const dry = await runEvaluation({}, false, directory); assert.equal(dry.externalCallsThisRun, 0); assert.equal(mock.calls, 0);
  assert.equal(dry.quality.agentAccuracy, null); assert.equal(dry.latency.p95Ms, null);
  const env = providerEnv(); env.JEV_EVALUATION_BUDGET_USD = "0.002752512";
  const result = await runEvaluation(env, true, directory); assert.equal(result.externalCallsThisRun, 1);
  const evidence = JSON.parse(readFileSync(result.evidencePath, "utf8"));
  assert.equal(evidence.entries.length, 1); assert.equal(evidence.entries[0].status, "success");
  assert.equal(JSON.stringify(evidence).includes("synthetic-test-key"), false);
  assert.equal(evaluationBudgetUsed([{ caseId: "unknown", startedAt: "now", status: "pending", maxCostNanoUsd: 9 }]), 9);
  assert.equal(summarizeEvaluation([]).invoiceVerified, false);
  const again = await runEvaluation(env, true, directory); assert.equal(again.externalCallsThisRun, 0);
  await runEvaluation({}, false, directory);
  assert.equal(JSON.parse(readFileSync(result.evidencePath, "utf8")).mode, "execute");
  await assert.rejects(runEvaluation({ ...env, JEV_DATA_POLICY_APPROVED: undefined }, true, directory));
});

test("evaluation CLI accepts native --env-file and runs through workspace path aliases without leaking credentials", (t: TestContext) => {
  const directory = mkdtempSync(join(tmpdir(), "guilduo-jev-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const envFile = join(directory, ".dev.vars");
  writeFileSync(envFile, "TYPESAFE_API_KEY=synthetic-cli-never-print\nJEV_DATA_POLICY_APPROVED=false\n");
  const preloadIndex = process.execArgv.indexOf("--require");
  const preloadArgs = preloadIndex >= 0 ? ["--require", resolve(process.execArgv[preloadIndex + 1])] : [];
  const stdout = execFileSync(process.execPath, [...preloadArgs, `--env-file=${envFile}`, "--import", pathToFileURL(require.resolve("tsx")).href, resolve("tools/evaluate-jev.mts")], { cwd: directory, encoding: "utf8" });
  assert.equal(stdout.includes("synthetic-cli-never-print"), false);
  const evidence = JSON.parse(stdout);
  assert.equal(evidence.externalCallsThisRun, 0); assert.equal(evidence.attempts, 0);
  assert.equal(JSON.parse(readFileSync(evidence.evidencePath, "utf8")).mode, "dry-run");
});
