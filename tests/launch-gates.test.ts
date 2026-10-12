import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { GATE_KINDS, LAUNCH_PLAN_VERSION, verifyCandidate, verifyConfiguration, verifyOrigins, verifyWorker, type Candidate } from "../tools/verify-launch-gates.mts";

const { parseDocument } = createRequire(import.meta.url)("yaml");
type WorkflowStep = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown>; "continue-on-error"?: boolean };
type Workflow = { concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { environment: string; steps: WorkflowStep[] }> };
const now = Date.parse("2026-10-07T12:00:00Z");
const sha = "a".repeat(40);
const tree = "b".repeat(40);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const stamp = (hoursAgo: number) => new Date(now - hoursAgo * 3600000).toISOString();
function fixture(run: (c: Candidate, check: (value?: Candidate) => Candidate, root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "guilduo-launch-"));
  try {
    writeFileSync(join(root, "evidence.txt"), "Operator's actual acceptance record (synthetic test fixture only)");
    const evidence = { path: "evidence.txt", sha256: createHash("sha256").update(readFileSync(join(root, "evidence.txt"))).digest("hex") };
    const c: Candidate = { schemaVersion: 2, planVersion: LAUNCH_PLAN_VERSION, source: { repository: "ELRdn/Guilduo", targetSha: sha, treeSha: tree, baselineSha: sha,
      dirty: false, apiVersion: "2.7.0", schemaVersion: 7, additiveMigrations: [] },
      approval: { approvedBy: "operator", approvedAt: stamp(0), expiresAt: stamp(-24), scope: "complete" }, unresolvedCritical: 0,
      billing: { enabled: true, mode: "live", approvedConfig: evidence }, jev: { enabled: true, approvedConfig: evidence },
      analytics: { enabled: true, approvedConfig: evidence },
      gates: Object.fromEntries(Object.entries(GATE_KINDS).map(([id, kind]) => [id, { status: "passed", kind, targetSha: sha, checkedAt: stamp(1), verifiedBy: "operator", evidence: [evidence] }])),
      observation: { announcedAt: stamp(74), startedAt: stamp(73), latestCriticalFixAt: null,
        checks: [0, 24, 48, 72].map(hour => ({ hour, checkedAt: stamp(73 - hour), targetSha: sha, status: "passed", evidence: [evidence] })),
        finalApprovedBy: "operator", finalApprovedAt: stamp(0.5) } };
    const check = (value = c) => {
      const bytes = Buffer.from(JSON.stringify(value));
      return verifyCandidate({ root, bytes, signature: sign(null, bytes, privateKey), publicKey: pem, repository: "ELRdn/Guilduo",
        targetSha: sha, treeSha: tree, mode: "complete", now });
    };
    run(c, check, root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("signed evidence passes only for the approved source and real observation", () => fixture((c, check) => {
  assert.equal(check().source.targetSha, sha);
  c.source.targetSha = "c".repeat(40);
  assert.throws(() => check(), /Stale source/);
}));
test("expanded launch rejects legacy plans and missing, stale, failed or substituted new gates", () => {
  assert.equal(Object.keys(GATE_KINDS).length, 21);
  for (const id of ["LA-11", "LA-12", "LA-13", "LA-14", "LA-15", "LA-16"] as const) {
    for (const mutate of [
      (c: Candidate) => { delete c.gates[id]; },
      (c: Candidate) => { c.gates[id]!.targetSha = "f".repeat(40); },
      (c: Candidate) => { c.gates[id]!.checkedAt = stamp(200); },
      (c: Candidate) => { c.gates[id]!.status = "pending" as "passed"; },
      (c: Candidate) => { c.gates[id]!.kind = "local-tests"; },
    ]) fixture((c, check) => { mutate(c); assert.throws(() => check(), new RegExp(id)); });
  }
  fixture((c, check) => { Object.assign(c, { schemaVersion: 1 }); assert.throws(() => check(), /Legacy launch/); });
  fixture((c, check) => { Object.assign(c, { planVersion: "2026-10-03" }); assert.throws(() => check(), /another launch plan/); });
  fixture((c, check) => { Object.assign(c.gates, { "AD-01": c.gates["LA-01"] }); assert.throws(() => check(), /separate approval/); });
  fixture((c, check) => { Object.assign(c.gates, { constructor: c.gates["LA-01"] }); assert.throws(() => check(), /Unknown launch gate/); });
});
test("missing, failed, stale and automated acceptance cannot close launch", () => {
  for (const mutation of [
    (c: Candidate) => { delete c.gates["LA-02"]; },
    (c: Candidate) => { c.gates["LA-03"]!.status = "failed" as "passed"; },
    (c: Candidate) => { c.gates["BM-02"]!.targetSha = "d".repeat(40); },
    (c: Candidate) => { c.gates["LA-04"]!.kind = "local-tests"; },
    (c: Candidate) => { c.gates["LA-05"]!.checkedAt = stamp(200); },
    (c: Candidate) => { c.gates["LA-06"]!.evidence = []; },
    (c: Candidate) => { c.gates["LA-07"]!.checkedAt = stamp(-1); },
    (c: Candidate) => { c.approval.expiresAt = stamp(1); },
    (c: Candidate) => { c.unresolvedCritical = 1; },
    (c: Candidate) => { c.billing.enabled = false; },
    (c: Candidate) => { c.billing.approvedConfig = null; },
  ]) fixture((c, check) => { mutation(c); assert.throws(() => check()); });
});
test("signature, evidence bytes and repository containment prevent altered approval", () => fixture((c, check, root) => {
  const bytes = Buffer.from(JSON.stringify(c));
  const options = { root, bytes, signature: sign(null, Buffer.from("different candidate"), privateKey), publicKey: pem,
    repository: "ELRdn/Guilduo", targetSha: sha, treeSha: tree, mode: "complete" as const, now };
  assert.throws(() => verifyCandidate(options), /signature/);
  writeFileSync(join(root, "evidence.txt"), "changed");
  assert.throws(() => check(), /Evidence changed/);
  c.gates["LA-01"]!.evidence[0].path = "../outside.txt";
  assert.throws(() => check());
}));
test("future checks, skipped 48h, 71 elapsed hours and critical fixes cannot fake 72h", () => {
  for (const mutation of [
    (c: Candidate) => { c.observation!.startedAt = stamp(71); },
    (c: Candidate) => { c.observation!.checks[3].checkedAt = stamp(-1); },
    (c: Candidate) => { c.observation!.checks.splice(2, 1); },
    (c: Candidate) => { c.observation!.latestCriticalFixAt = stamp(12); },
    (c: Candidate) => { c.observation!.checks[1].checkedAt = stamp(1); },
    (c: Candidate) => { c.observation!.checks[2].status = "failed" as "passed"; },
    (c: Candidate) => { c.observation!.checks[3].targetSha = "e".repeat(40); },
    (c: Candidate) => { c.observation!.finalApprovedAt = stamp(2); },
  ]) fixture((c, check) => { mutation(c); assert.throws(() => check()); });
});
test("pre-release does not require a future announcement; deployment alone cannot publish paid launch", () => fixture((c, _check, root) => {
  delete c.observation;
  delete c.gates["LA-09"];
  delete c.gates["LA-10"];
  const verifyMode = (mode: "deploy" | "release") => {
    const bytes = Buffer.from(JSON.stringify(c));
    return verifyCandidate({ root, bytes, signature: sign(null, bytes, privateKey), publicKey: pem, repository: "ELRdn/Guilduo", targetSha: sha, treeSha: tree, mode, now });
  };
  assert.doesNotThrow(() => verifyMode("release"));
  for (const id of Object.keys(c.gates)) if (id !== "LA-01") delete c.gates[id as keyof typeof GATE_KINDS];
  c.billing = { enabled: false, mode: "test", approvedConfig: null };
  c.jev = { enabled: false, approvedConfig: null };
  c.analytics = { enabled: false, approvedConfig: null };
  c.approval.scope = "deploy";
  assert.doesNotThrow(() => verifyMode("deploy"));
  assert.throws(() => verifyMode("release"));
}));

test("production workflows parse, share one lock, and stop before publication on failure", () => {
  const flows = ["release", "deploy-appwrite-site", "deploy-appwrite-worker"].map(name => {
    const doc = parseDocument(readFileSync(`.github/workflows/${name}.yml`, "utf8"), { uniqueKeys: true });
    assert.deepEqual(doc.errors, [], name);
    return doc.toJS() as Workflow;
  });
  for (const flow of flows) {
    assert.equal(flow.concurrency.group, "appwrite-site-production");
    assert.equal(flow.concurrency["cancel-in-progress"], false);
    const job = Object.values(flow.jobs)[0];
    assert.equal(job.environment, "production");
    assert.ok(job.steps.every(s => !s["continue-on-error"] && !String(s.if || "").includes("always()")));
    const index = (text: string) => job.steps.findIndex(s => JSON.stringify(s).includes(text));
    assert.ok(index("Verify signed source") > index("npm ci"));
    assert.ok(index("Verify canonical origins") < index("generate-release-config"));
    const activation = index("deploy-appwrite-site.sh");
    if (activation !== -1) {
      assert.ok(index("npm run build") < activation);
      assert.ok(index("Verify active Worker source before Site activation") < activation);
      assert.ok(index("Smoke test public routes") > activation);
      assert.ok(index("retain-site-assets.mts") === activation, "Old asset retention remains part of activation");
    }
    const migration = index("Apply additive D1 migrations");
    if (migration !== -1) {
      assert.equal(job.steps.find(s => s.uses === "actions/checkout@v4")?.with?.["fetch-depth"], 0, "Migration comparison needs the approved baseline history");
      assert.ok(index("npm test") < migration);
      assert.ok(index("Verify reviewed additive migration inventory") < migration);
      assert.ok(index("Deploy Worker") > migration);
      assert.ok(index("deploy --tag") > migration);
    }
  }
  const steps = flows[0].jobs.release.steps;
  const at = (text: string) => steps.findIndex(s => JSON.stringify(s).includes(text));
  assert.ok(at("Verify MCP custom domain") < at("Deploy Appwrite Site"));
  assert.ok(at("Verify active Worker source before Site activation") < at("Deploy Appwrite Site"));
  assert.ok(at("Recheck signed acceptance before final Release") > at("Smoke test public routes"));
  assert.ok(at("softprops/action-gh-release") > at("Recheck signed acceptance before final Release"));
  assert.ok(String(steps[at("Verify signed source")].run).endsWith(" deploy"));
  assert.ok(String(steps[at("Recheck signed acceptance before final Release")].run).includes(" release"));
});

const origins = { WEB_APP_URL: "https://app.guilduo.com", PUBLIC_SITE_URL: "https://guilduo.com", MCP_BASE_URL: "https://mcp.guilduo.com",
  APPWRITE_ENDPOINT: "https://api.guilduo.com/v1", APPWRITE_SITE_ENDPOINT: "https://region.cloud.appwrite.io/v1", WORKER_BASE_URL: "https://worker.example.workers.dev" };
test("canonical origins are required; billing defaults off and typos are refused", () => {
  assert.doesNotThrow(() => verifyOrigins(origins));
  assert.throws(() => verifyOrigins({ ...origins, WEB_APP_URL: "https://app.guilduo.com/next/" }));
  assert.throws(() => verifyOrigins({ ...origins, MCP_BASE_URL: "https://old.workers.dev" }));
  assert.throws(() => verifyOrigins({ ...origins, BILLING_ENABLED: "tru" }));
});
test("Site activation refuses an old, mixed or incompatible Worker deployment", async () => {
  const c = { source: { targetSha: sha, apiVersion: "2.7.0", schemaVersion: 7 }, billing: { enabled: false, mode: "test" }, jev: { enabled: false } } as Candidate;
  await assert.rejects(verifyWorker(c, origins), /Cloudflare read credentials/);
  const vars = { WEB_APP_URL: origins.WEB_APP_URL, BILLING_ENABLED: "false", BILLING_MODE: "test", JEV_ENABLED: "false" };
  const env = { ...origins, CLOUDFLARE_API_TOKEN: "synthetic-token", CLOUDFLARE_ACCOUNT_ID: "synthetic-account" };
  const config = { name: "questforge-gateway", vars };
  for (const scenario of ["old", "mixed", "health", "runtime"]) {
    const fetcher = (async (url: string) => {
      const result = url.endsWith("/deployments") ? { success: true, result: { deployments: [{ versions: scenario === "mixed" ? [{ version_id: "old", percentage: 50 }, { version_id: "new", percentage: 50 }] : [{ version_id: "new", percentage: 100 }] }] } }
        : url.includes("/versions/") ? { success: true, result: { annotations: { "workers/tag": scenario === "old" ? "c".repeat(40) : sha }, resources: { bindings: Object.entries(scenario === "runtime" ? { ...vars, BILLING_ENABLED: "true" } : vars).map(([name, text]) => ({ type: "plain_text", name, text })) } } }
        : { ok: true, version: scenario === "health" ? "2.6.0" : "2.7.0", schemaVersion: 7, agentStorage: "d1" };
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await assert.rejects(verifyWorker(c, env, fetcher, config), Error, scenario);
  }
});
test("runtime switches and configuration must match the signed approval", () => fixture((c, _check, root) => {
  c.billing = { enabled: false, mode: "test", approvedConfig: null };
  c.jev = { enabled: false, approvedConfig: null };
  c.analytics = { enabled: false, approvedConfig: null };
  assert.doesNotThrow(() => verifyConfiguration(c, {}, root));
  assert.throws(() => verifyConfiguration(c, { BILLING_ENABLED: "true" }, root), /Unapproved billing/);
  assert.throws(() => verifyConfiguration(c, { JEV_ENABLED: "true" }, root), /Unapproved Jev/);
}));
