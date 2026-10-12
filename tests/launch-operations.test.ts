import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function rehearse(injection = "") {
  const preload = `
    import fs from "node:fs/promises";
    import { syncBuiltinESMExports } from "node:module";
    globalThis.fetch = () => { throw Error("External requests are forbidden in the local rehearsal"); };
    const write = fs.writeFile;
    fs.writeFile = async (file, data, ...options) => {
      ${injection}
      return write(file, data, ...options);
    };
    syncBuiltinESMExports();
  `;
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "--import", "tsx", "tools/verify-launch-operations.mts"], {
    encoding: "utf8", timeout: 30_000,
  });
}

test("operations rehearsal produces fresh synthetic evidence with persisted R2 metadata and no provider calls", async () => {
  const started = Date.now();
  const execution = rehearse();
  assert.equal(execution.status, 0, execution.stderr || String(execution.error));
  const directory = execution.stdout.match(/zero provider calls\. (.+)/)?.[1].trim();
  assert.ok(directory, execution.stdout);
  assert.equal(dirname(directory), resolve(".qa-artifacts/launch-implementation/operations"));
  const result = JSON.parse(await readFile(resolve(directory, "result.json"), "utf8"));
  assert.equal(result.status, "LOCAL_SYNTHETIC_PASS");
  assert.ok(Date.parse(result.at) >= started && Date.parse(result.at) <= Date.now());
  assert.equal(result.providerCalls, 0);
  assert.equal(result.productionAcceptance, false);
  assert.equal(result.checks.length, 4);
  assert.deepEqual(result.financialTableCounts, {
    billing_accounts: 2, billing_credit_ledger: 6, billing_credit_lots: 4,
    billing_credit_reservations: 2, billing_referrals: 2, billing_stripe_events: 2,
  });
  const snapshot = new DatabaseSync(resolve(directory, "synthetic-d1.sqlite"), { readOnly: true });
  try {
    const owners = snapshot.prepare("SELECT uid FROM billing_accounts ORDER BY uid").all() as {uid: string}[];
    for (const {uid} of owners) {
      assert.equal(snapshot.prepare("SELECT COUNT(*) AS n FROM billing_credit_ledger WHERE uid=?").get(uid)?.n, 3);
      const reservation = snapshot.prepare("SELECT payload FROM billing_credit_reservations WHERE uid=?").get(uid);
      assert.ok(reservation);
      assert.equal(JSON.parse(String(reservation.payload)).status, "reserved");
      const referral = snapshot.prepare("SELECT invoice_id,reward_amount FROM billing_referrals WHERE referred_uid=?").get(uid);
      assert.ok(referral);
      assert.match(String(referral.invoice_id), /^in_synthetic_/);
      assert.equal(referral.reward_amount, 5);
    }
  } finally { snapshot.close(); }
  assert.ok(result.limitations.some((item: string) => item.includes("RPO/RTO")));
  assert.equal(result.snapshotSha256, createHash("sha256").update(await readFile(resolve(directory, "synthetic-d1.sqlite"))).digest("hex"));
  const manifest = JSON.parse(await readFile(resolve(directory, "synthetic-r2-manifest.json"), "utf8"));
  const bytes = await readFile(resolve(directory, "synthetic-r2-object.bin"));
  assert.equal(manifest.key, "agents/avatars/synthetic-asset");
  assert.equal(manifest.contentType, "application/x-guilduo-fixture");
  assert.equal(manifest.size, bytes.length);
  assert.equal(manifest.sha256, createHash("sha256").update(bytes).digest("hex"));
});

for (const field of ["key", "contentType"] as const) {
  test(`operations rehearsal refuses corrupted R2 ${field} instead of recreating it from constants`, () => {
    const execution = rehearse(`
      if (String(file).endsWith("synthetic-r2-manifest.json")) {
        const manifest = JSON.parse(data);
        manifest.${field} = "corrupted";
        data = JSON.stringify(manifest);
      }
    `);
    assert.equal(execution.status, 1, execution.stderr || String(execution.error));
    assert.match(execution.stderr, /AssertionError/);
    assert.doesNotMatch(execution.stdout, /rehearsal PASS/);
  });
}

test("operations rehearsal refuses corrupted R2 backup bytes", () => {
  const execution = rehearse(`if (String(file).endsWith("synthetic-r2-object.bin")) data = Buffer.from("corrupted-object");`);
  assert.equal(execution.status, 1, execution.stderr || String(execution.error));
  assert.match(execution.stderr, /AssertionError/);
  assert.doesNotMatch(execution.stdout, /rehearsal PASS/);
});

for (const table of ["billing_credit_ledger", "billing_credit_reservations", "billing_referrals"] as const) {
  test(`operations rehearsal refuses ${table} loss during optional deletion`, () => {
    const execution = rehearse(`
      if (String(file).endsWith("synthetic-r2-manifest.json")) {
        const { DatabaseSync } = await import("node:sqlite");
        const prepare = DatabaseSync.prototype.prepare;
        DatabaseSync.prototype.prepare = function(sql, ...args) {
          const statement = prepare.call(this, sql, ...args);
          if (sql === "DELETE FROM launch_analytics_preferences WHERE uid=?") {
            const database = this, run = statement.run;
            statement.run = function(owner, ...parameters) {
              const result = run.call(this, owner, ...parameters);
              prepare.call(database, "DELETE FROM ${table} WHERE ${table === "billing_referrals" ? "referred_uid" : "uid"}=?").run(owner);
              return result;
            };
          }
          return statement;
        };
      }
    `);
    assert.equal(execution.status, 1, execution.stderr || String(execution.error));
    assert.match(execution.stderr, /Optional deletion must preserve every financial table and record/);
    assert.doesNotMatch(execution.stdout, /rehearsal PASS/);
  });
}
