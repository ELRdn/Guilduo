import test from "node:test";
import assert from "node:assert/strict";
import { assertAgentAccess, createAgent, getAgent, getAgentAccess, getAgentAccessMap, getAgentConnection, getAgentForClient, linkAgentConnection, listAgentPage, listAgents, relinkAgentConnection, updateAgent } from "../worker/src/agent-store.ts";
import { acquireBillingSync, applyBillingSnapshot, getEntitlement, releaseBillingSync, selectFreeAgents } from "../worker/src/billing-store.ts";
import { SqliteD1Database, hasErrorCode, required } from "./test-helpers.ts";
import type { D1StatementLike, WorkerEnv } from "../worker/src/worker-types.ts";

const create = (env: WorkerEnv, agentId: string, uid = "owner") => createAgent(env, uid, { agentId, displayName: agentId });
const reject = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => hasErrorCode(error, code));
const billingEnv = (db?: SqliteD1Database): WorkerEnv => ({ QUESTFORGE_DB: db, BILLING_ENABLED: "true", BILLING_MODE: "test", BILLING_NOW: "2026-10-03T00:00:00.000Z", AGENT_NOW: "2026-10-03T00:00:00.000Z" });
async function plan(env: WorkerEnv, pro: boolean, uid = "owner") {
  const token = await acquireBillingSync(env, uid);
  await applyBillingSnapshot(env, uid, token, pro ? { id: "sub_test", status: "active", periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z", interval: "monthly", invoiceId: "in_test", invoicePaid: true, cancelAtPeriodEnd: false, monthlyCredits: 0, lifetimeDays: 30 } : null, [], []);
  await releaseBillingSync(env, uid, token);
}

for (const storage of ["memory", "sqlite"] as const) {
  test(`${storage}: overlimit Free needs two valid selected registrations; archiving invalidates selection until count reaches two`, async () => {
    const db = storage === "sqlite" ? new SqliteD1Database() : undefined;
    const env = billingEnv(db);
    try {
      await plan(env, true);
      for (const id of ["a", "b", "c", "d"]) await create(env, id);
      await plan(env, false);
      await selectFreeAgents(env, "owner", ["a"]);
      assert.equal((await getEntitlement(env, "owner")).selectionRequired, true);
      const page = await listAgentPage(env, "owner", { limit: 1 });
      assert.ok([...(await getAgentAccessMap(env, "owner", page.agents)).values()].every(access => access.restrictionReason === "free_agent_selection_required"));
      for (const id of ["a", "b", "c", "d"]) await reject(assertAgentAccess(env, "owner", id), "free_agent_selection_required");
      await reject(linkAgentConnection(env, "owner", "a", { clientId: "new", clientName: "New" }), "free_agent_selection_required");
      await selectFreeAgents(env, "owner", ["a", "b"]);
      await updateAgent(env, "owner", "b", { status: "disabled" });
      assert.equal((await getEntitlement(env, "owner")).selectionRequired, false);
      await assertAgentAccess(env, "owner", "a");
      assert.equal((await getAgentAccess(env, "owner", "b")).planAllowed, true, "disabled still counts as a registered selection; execution status remains separate");
      await updateAgent(env, "owner", "b", { status: "archived" });
      assert.equal((await getEntitlement(env, "owner")).selectionRequired, true);
      for (const id of ["a", "c", "d"]) await reject(assertAgentAccess(env, "owner", id), "free_agent_selection_required");
      await reject(relinkAgentConnection(env, "owner", "a", { clientId: "new", clientName: "New" }), "free_agent_selection_required");
      await selectFreeAgents(env, "owner", ["a", "c"]);
      assert.equal((await getEntitlement(env, "owner")).selectionRequired, false);
      await assertAgentAccess(env, "owner", "a");
      await assertAgentAccess(env, "owner", "c");
      await reject(assertAgentAccess(env, "owner", "d"), "free_agent_not_selected");
      await updateAgent(env, "owner", "c", { status: "archived" });
      await assertAgentAccess(env, "owner", "a");
      await assertAgentAccess(env, "owner", "d");
      await selectFreeAgents(env, "owner", []);
      assert.equal((await getEntitlement(env, "owner")).selectionRequired, false);
      await assertAgentAccess(env, "owner", "a");
      await assertAgentAccess(env, "owner", "d");
    } finally { db?.close(); }
  });

  test(`${storage}: Free concurrent registration cannot create a third Agent; disabling counts, archiving reclaims`, async () => {
    const db = storage === "sqlite" ? new SqliteD1Database() : undefined;
    const env = billingEnv(db);
    try {
      await create(env, "a");
      const results = await Promise.allSettled([create(env, "b"), create(env, "c")]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const loser = required(results.find(result => result.status === "rejected")) as PromiseRejectedResult;
      assert.equal(hasErrorCode(loser.reason, "agent_limit_reached"), true);
      assert.equal((await listAgents(env, "owner")).length, 2);
      await updateAgent(env, "owner", "a", { status: "disabled" });
      await reject(create(env, "overflow"), "agent_limit_reached");
      await updateAgent(env, "owner", "a", { status: "archived" });
      await create(env, "overflow");
      assert.equal((await listAgents(env, "owner", { includeArchived: true })).length, 3);
      await reject(create(env, "overflow"), "agent_exists");
      await reject(createAgent(env, "owner", { agentId: "cheat", displayName: "Cheat", plan: "pro" }), "agent_unknown_field");
    } finally { db?.close(); }
  });

  test(`${storage}: downgrade gates execution, keeps selected IDs and original policies/statuses across Pro resume`, async () => {
    const db = storage === "sqlite" ? new SqliteD1Database() : undefined;
    const env = billingEnv(db);
    try {
      await plan(env, true);
      for (const id of ["a", "b", "c", "d"]) await create(env, id);
      await updateAgent(env, "owner", "d", { status: "disabled", allowedScopes: ["quests:read"], dryRunDefault: false });
      const before = await listAgents(env, "owner");
      await plan(env, false);
      for (const agent of before) await reject(assertAgentAccess(env, "owner", agent.agentId), "free_agent_selection_required");
      await selectFreeAgents(env, "owner", ["a", "b"]);
      await assertAgentAccess(env, "owner", "a");
      await assertAgentAccess(env, "owner", "b");
      await reject(assertAgentAccess(env, "owner", "c"), "free_agent_not_selected");
      await reject(create(env, "fifth"), "agent_limit_reached");
      await reject(getAgentAccess(env, "intruder", "a"), "agent_not_found");
      await reject(selectFreeAgents(env, "intruder", ["a"]), "agent_not_found");
      await reject(selectFreeAgents(env, "owner", ["a", "missing"]), "agent_not_found");
      assert.deepEqual(await listAgents(env, "owner"), before, "plan and selection never rewrite Agent policy/status/CAS");
      await plan(env, true);
      for (const agent of before) assert.equal((await getAgentAccess(env, "owner", agent.agentId)).planAllowed, true);
      assert.deepEqual(await listAgents(env, "owner"), before);
      await plan(env, false);
      await assertAgentAccess(env, "owner", "a");
      await reject(assertAgentAccess(env, "owner", "c"), "free_agent_not_selected");
      await updateAgent(env, "owner", "c", { status: "archived" });
      await updateAgent(env, "owner", "d", { status: "archived" });
      await assertAgentAccess(env, "owner", "b");
      await reject(selectFreeAgents(env, "owner", ["a", "c"]), "agent_not_found");
    } finally { db?.close(); }
  });

  test(`${storage}: Pro 205 registrations paginate at 200 while shared transport stays capped at 20`, async () => {
    const db = storage === "sqlite" ? new SqliteD1Database() : undefined;
    const env = billingEnv(db);
    try {
      await plan(env, true);
      const ids = Array.from({ length: 205 }, (_, n) => `agent-${String(n).padStart(3, "0")}`);
      await Promise.all(ids.map(id => create(env, id)));
      assert.equal((await listAgents(env, "owner")).length, 205);
      const page = await listAgentPage(env, "owner", { limit: 999 });
      assert.equal(page.total, 205);
      assert.equal(page.agents.length, 200);
      const end = await listAgentPage(env, "owner", { cursor: required(page.nextCursor), limit: 200 });
      assert.equal(end.agents.length, 5);
      assert.equal(end.nextCursor, null);
      assert.equal(new Set([...page.agents, ...end.agents].map(agent => agent.agentId)).size, 205);
      await relinkAgentConnection(env, "owner", ids[0], { clientId: "shared", clientName: "Shared", allowedAgentIds: ids.slice(0, 20) });
      await reject(relinkAgentConnection(env, "owner", ids[0], { clientId: "shared", clientName: "Shared", allowedAgentIds: ids.slice(0, 21) }), "invalid_allowed_agents");
      await updateAgent(env, "owner", ids[0], { status: "disabled" });
      assert.equal((await getAgentConnection(env, "owner", "shared"))?.revokedAt, null);
      assert.equal((await getAgentAccess(env, "owner", ids[0])).planAllowed, true, "plan access is separate from disabled status");
    } finally { db?.close(); }
  });

  test(`${storage}: restricted Agent links fail server-side, leaving shared memberships and OAuth identity intact`, async () => {
    const db = storage === "sqlite" ? new SqliteD1Database() : undefined;
    const env = billingEnv(db);
    try {
      await plan(env, true);
      for (const id of ["a", "b", "c"]) await create(env, id);
      const linked = await relinkAgentConnection(env, "owner", "c", { clientId: "shared", clientName: "Shared", allowedAgentIds: ["a", "b", "c"] });
      await plan(env, false);
      await selectFreeAgents(env, "owner", ["a", "b"]);
      await reject(linkAgentConnection(env, "owner", "c", { clientId: "new", clientName: "New" }), "free_agent_not_selected");
      await reject(relinkAgentConnection(env, "owner", "a", { clientId: "shared", clientName: "Shared", allowedAgentIds: ["c"] }), "free_agent_not_selected");
      assert.deepEqual(await getAgentConnection(env, "owner", "shared"), linked);
      assert.equal((await getAgentForClient(env, "owner", "shared"))?.agentId, "c", "a denied identity must not become unlinked and gain wider scopes");
      await reject(assertAgentAccess(env, "owner", "c"), "free_agent_not_selected");
      await relinkAgentConnection(env, "owner", "a", { clientId: "shared", clientName: "Shared", allowedAgentIds: ["a", "b"] });
      await updateAgent(env, "owner", "a", { status: "disabled" });
      assert.equal((await getAgentConnection(env, "owner", "shared"))?.revokedAt, null);
      await assertAgentAccess(env, "owner", "b");
    } finally { db?.close(); }
  });
}

test("SQLite: access metadata reads entitlement and total registrations once, including Agents outside the page", async () => {
  const db = new SqliteD1Database();
  const env = billingEnv(db);
  try {
    await plan(env, true);
    for (const id of ["a", "b", "c"]) await create(env, id);
    const page = await listAgentPage(env, "owner", { limit: 2 });
    await plan(env, false);
    db.preparedSql.length = 0;
    const access = await getAgentAccessMap(env, "owner", page.agents);
    assert.equal(db.preparedSql.length, 1);
    assert.ok([...access.values()].every(value => value.restrictionReason === "free_agent_selection_required"));
    await selectFreeAgents(env, "owner", ["a", "c"]);
    const chosen = await getAgentAccessMap(env, "owner", page.agents);
    assert.equal(chosen.get("c")?.planAllowed, true);
    assert.equal(chosen.get("b")?.planAllowed, false);
  } finally { db.close(); }
});

class BeforeInsert implements D1StatementLike {
  constructor(private inner: D1StatementLike, private before: () => void) {}
  bind(...values: unknown[]): D1StatementLike { return new BeforeInsert(this.inner.bind(...values), this.before); }
  first<T = Record<string, unknown>>(): Promise<T | null> { return this.inner.first<T>(); }
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> { return this.inner.all<T>(); }
  run(): Promise<{ meta?: { changes?: number } }> { this.before(); return this.inner.run(); }
}

test("SQLite: a downgrade committed immediately before registration is evaluated by the INSERT itself", async () => {
  const db = new SqliteD1Database();
  const env = billingEnv(db);
  try {
    await plan(env, true);
    await create(env, "a"); await create(env, "b");
    env.QUESTFORGE_DB = {
      prepare(sql) {
        const statement = db.prepare(sql);
        return /^INSERT INTO agent_registry_agents/.test(sql) ? new BeforeInsert(statement, () => {
          db.raw.prepare("UPDATE billing_accounts SET plan='free',period_end=NULL WHERE mode=? AND uid=?").run("test", "owner");
        }) : statement;
      },
      batch: db.batch.bind(db),
    };
    await reject(create(env, "third"), "agent_limit_reached");
    assert.equal((await listAgents(env, "owner")).length, 2);
    assert.ok(db.preparedSql.some(sql => /^INSERT INTO agent_registry_agents/.test(sql) && /SELECT.*WHERE/s.test(sql) && /billing_accounts/.test(sql)));
  } finally { db.close(); }
});

test("memory: Pro expiry between request start and commit rejects creation without changing Agent statuses", async () => {
  const env = billingEnv();
  await plan(env, true);
  await create(env, "a"); await create(env, "b");
  const pending = create(env, "third");
  env.BILLING_NOW = "2026-11-01T00:00:00.000Z";
  await reject(pending, "agent_limit_reached");
  assert.equal((await listAgents(env, "owner")).length, 2);
});

test("memory: concurrent billing downgrade wins before creation commit and the plan is recomputed", async () => {
  const env = billingEnv();
  await plan(env, true);
  await create(env, "a"); await create(env, "b");
  const token = await acquireBillingSync(env, "owner");
  const downgrade = applyBillingSnapshot(env, "owner", token, null, [], []);
  const creation = create(env, "third");
  const results = await Promise.allSettled([downgrade, creation]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(hasErrorCode((results[1] as PromiseRejectedResult).reason, "agent_limit_reached"), true);
  assert.equal((await listAgents(env, "owner")).length, 2);
});

test("SQLite: Test and Live entitlement rows are isolated and expiry is an exclusive boundary", async () => {
  const db = new SqliteD1Database();
  const env = billingEnv(db);
  try {
    env.BILLING_MODE = "live";
    await plan(env, true);
    env.BILLING_MODE = "test";
    await create(env, "a"); await create(env, "b");
    await reject(create(env, "third"), "agent_limit_reached");
    env.BILLING_MODE = "live";
    await create(env, "third");
    env.BILLING_NOW = "2026-11-01T00:00:00.000Z";
    await reject(create(env, "fourth"), "agent_limit_reached");
    await reject(assertAgentAccess(env, "owner", "a"), "free_agent_selection_required");
  } finally { db.close(); }
});

test("legacy rollout off works before billing migration and keeps the 20 registration limit", async () => {
  for (const enabled of [undefined, "false", "TRUE"]) {
    const db = new SqliteD1Database({ throughMigration: "0011_shared_mcp_agents.sql" });
    const env: WorkerEnv = { QUESTFORGE_DB: db, BILLING_ENABLED: enabled, BILLING_MODE: "invalid" };
    try {
      await Promise.all(Array.from({ length: 20 }, (_, n) => create(env, `agent-${n}`)));
      await reject(create(env, "twenty-first"), "agent_limit_reached");
      const agents = await listAgents(env, "owner");
      db.preparedSql.length = 0;
      assert.ok([...(await getAgentAccessMap(env, "owner", agents)).values()].every(access => access.planAllowed));
      assert.equal(db.preparedSql.length, 0, "off must never query billing metadata");
    } finally { db.close(); }
  }
});

test("billing-enabled production without D1 fails closed instead of using memory", async () => {
  const env: WorkerEnv = { ...billingEnv(), APPWRITE_PROJECT_ID: "production" };
  await reject(create(env, "a"), "billing_d1_required");
});

for (const storage of ["memory", "sqlite"] as const) {
  test(`${storage}: keyset pages order timestamp ties, exclude archives and isolate owners`, async () => {
    const db = storage === "sqlite" ? new SqliteD1Database() : undefined;
    const env: WorkerEnv = { QUESTFORGE_DB: db, AGENT_NOW: "2026-10-03T00:00:00.000Z" };
    try {
      for (const id of ["a", "c", "b"]) await create(env, id);
      await create(env, "foreign", "other");
      env.AGENT_NOW = "2026-10-04T00:00:00.000Z";
      await create(env, "newer");
      await create(env, "archived");
      await updateAgent(env, "owner", "archived", { status: "archived" });
      const first = await listAgentPage(env, "owner", { limit: 2 });
      assert.equal(first.total, 4);
      assert.deepEqual(first.agents.map(agent => agent.agentId), ["newer", "c"]);
      const second = await listAgentPage(env, "owner", { limit: 2, cursor: required(first.nextCursor) });
      assert.equal(second.total, 4);
      assert.deepEqual(second.agents.map(agent => agent.agentId), ["b", "a"]);
      assert.equal(second.nextCursor, null);
      const all = await listAgentPage(env, "owner", { includeArchived: true });
      assert.equal(all.total, 5);
      assert.equal(all.agents.some(agent => agent.agentId === "archived"), true);
      assert.equal((await listAgents(env, "owner")).length, 4, "legacy internal list stays complete");
      assert.deepEqual(await listAgentPage(env, "empty"), { agents: [], nextCursor: null, total: 0 });
    } finally { db?.close(); }
  });
}

test("pagination validates bounds and untrusted cursor tuples", async () => {
  const env: WorkerEnv = {};
  for (const limit of [0, -1, 1.5, NaN, Infinity]) await reject(listAgentPage(env, "owner", { limit }), "agent_page_limit_invalid");
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const cursor of ["", "!", "a".repeat(513), encode({ createdAt: "2026-10-03" }), encode(["2026-10-03", "a"]), encode(["invalid", "a"]), encode(["2026-10-03T00:00:00.000Z", "bad/id"]), encode(["2026-10-03T00:00:00.000Z", "a", "extra"])]) {
    await reject(listAgentPage(env, "owner", { cursor }), "agent_page_cursor_invalid");
  }
  assert.equal((await listAgentPage(env, "owner", { limit: 999 })).agents.length, 0);
});

test("legacy archived rows keep their identity and cannot be restored to bypass registration", async () => {
  const env: WorkerEnv = {};
  await create(env, "a");
  await updateAgent(env, "owner", "a", { status: "archived" });
  await reject(updateAgent(env, "owner", "a", { status: "active" }), "agent_archived");
  await reject(create(env, "a"), "agent_exists");
  assert.equal((await getAgent(env, "owner", "a", { includeArchived: true })).status, "archived");
});
