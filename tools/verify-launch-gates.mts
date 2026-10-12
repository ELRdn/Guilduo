import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const GATE_KINDS = {
  "LA-01": "source-review", "LA-02": "real-acceptance", "LA-03": "real-acceptance",
  "LA-04": "real-acceptance", "LA-05": "real-acceptance", "LA-06": "operations-drill",
  "LA-07": "real-acceptance", "LA-08": "release-approval", "LA-09": "published-announcement",
  "LA-10": "elapsed-observation", "BM-01": "product-approval", "BM-02": "stripe-test",
  "BM-03": "jev-cost-and-credit-acceptance", "BM-04": "stripe-test", "BM-05": "live-sale-acceptance",
  "LA-11": "audience-and-activation-approval", "LA-12": "measurement-contract-approval",
  "LA-13": "consent-attribution-acceptance", "LA-14": "funnel-reconciliation-acceptance",
  "LA-15": "first-use-acceptance", "LA-16": "capacity-and-cost-acceptance",
} as const;
export const LAUNCH_PLAN_VERSION = "2026-10-04";
type GateId = keyof typeof GATE_KINDS;
type Evidence = { path: string; sha256: string };
export type Candidate = {
  schemaVersion: 2;
  planVersion: typeof LAUNCH_PLAN_VERSION;
  source: { repository: string; targetSha: string; treeSha: string; baselineSha: string; dirty: false;
    apiVersion: string; schemaVersion: number; additiveMigrations: Evidence[] };
  approval: { approvedBy: string; approvedAt: string; expiresAt: string; scope: "deploy" | "release" | "complete" };
  unresolvedCritical: number;
  billing: { enabled: boolean; mode: "test" | "live"; approvedConfig: Evidence | null };
  jev: { enabled: boolean; approvedConfig: Evidence | null };
  analytics: { enabled: boolean; approvedConfig: Evidence | null };
  gates: Partial<Record<GateId, { status: "passed"; kind: string; targetSha: string; checkedAt: string;
    verifiedBy: string; evidence: Evidence[] }>>;
  observation?: { announcedAt: string; startedAt: string; latestCriticalFixAt: string | null;
    checks: { hour: number; checkedAt: string; targetSha: string; status: "passed"; evidence: Evidence[] }[];
    finalApprovedBy: string; finalApprovedAt: string };
};
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const nonblank = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const timestamp = (value: unknown, now: number) => {
  assert.ok(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), "UTC timestamp required");
  const time = Date.parse(value);
  assert.ok(Number.isFinite(time) && time <= now, "Invalid or future timestamp");
  return time;
};
export function verifyEvidence(root: string, entry: Evidence) {
  assert.ok(entry && typeof entry.path === "string" && !isAbsolute(entry.path) && !entry.path.includes("\\"), "Relative evidence path required");
  assert.match(entry.sha256, /^[a-f0-9]{64}$/, "Evidence SHA-256 required");
  const base = realpathSync(root);
  const file = realpathSync(resolve(base, entry.path));
  const rel = relative(base, file);
  assert.ok(rel && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel), "Evidence escapes repository");
  const bytes = readFileSync(file);
  assert.ok(bytes.length > 0, "Empty evidence");
  assert.equal(digest(bytes), entry.sha256, `Evidence changed: ${entry.path}`);
}
export function verifyCandidate(options: { root: string; bytes: Buffer; signature: Buffer; publicKey: string;
  targetSha: string; treeSha: string; repository: string; mode: "deploy" | "release" | "complete"; now?: number }): Candidate {
  const { root, bytes, signature, publicKey, targetSha, treeSha, repository, mode } = options;
  const now = options.now ?? Date.now();
  const key = createPublicKey(publicKey);
  assert.equal(key.asymmetricKeyType, "ed25519", "Trusted Ed25519 approval key required");
  assert.ok(verify(null, bytes, key, signature), "Approval signature mismatch");
  const c = JSON.parse(bytes.toString("utf8")) as Candidate;
  assert.equal(c.schemaVersion, 2, "Legacy launch manifest; all 21 gates require schemaVersion 2");
  assert.equal(c.planVersion, LAUNCH_PLAN_VERSION, "Manifest targets another launch plan");
  assert.match(c.source.targetSha, /^[a-f0-9]{40}$/);
  assert.match(c.source.treeSha, /^[a-f0-9]{40}$/);
  assert.match(c.source.baselineSha, /^[a-f0-9]{40}$/);
  assert.equal(c.source.targetSha, targetSha, "Stale source SHA");
  assert.equal(c.source.treeSha, treeSha, "Stale tree SHA");
  assert.equal(c.source.repository, repository, "Wrong source repository");
  assert.equal(c.source.dirty, false, "Dirty worktree is not a release source");
  assert.ok(nonblank(c.source.apiVersion) && Number.isSafeInteger(c.source.schemaVersion) && c.source.schemaVersion > 0);
  assert.ok(Array.isArray(c.source.additiveMigrations));
  assert.equal(c.unresolvedCritical, 0, "Unresolved critical defects");
  assert.ok(nonblank(c.approval.approvedBy), "Named human approval required");
  const approved = timestamp(c.approval.approvedAt, now);
  const expires = Date.parse(c.approval.expiresAt);
  assert.ok(Number.isFinite(expires) && expires > now && expires > approved && expires - approved <= 7 * 86400000, "Approval expired or exceeds seven days");
  const scopes = mode === "deploy" ? ["deploy", "release", "complete"] : mode === "release" ? ["release", "complete"] : ["complete"];
  assert.ok(scopes.includes(c.approval.scope), "Approval does not authorize this operation");
  const required = mode === "deploy" ? ["LA-01"] : Object.keys(GATE_KINDS).filter(id => mode === "complete" || !["LA-09", "LA-10"].includes(id));
  assert.ok(c.gates && typeof c.gates === "object" && !Array.isArray(c.gates), "Acceptance map required");
  assert.ok(Object.keys(c.gates).every(id => Object.hasOwn(GATE_KINDS, id)), "Unknown launch gate; advertising requires separate approval");
  for (const id of required as GateId[]) {
    const gate = c.gates[id];
    assert.ok(gate, `Missing acceptance: ${id}`);
    assert.equal(gate.status, "passed", `Failed/pending acceptance: ${id}`);
    assert.equal(gate.kind, GATE_KINDS[id], `Local tests cannot substitute for ${id}`);
    assert.equal(gate.targetSha, targetSha, `Stale acceptance: ${id}`);
    assert.ok(nonblank(gate.verifiedBy), `Verifier required: ${id}`);
    const checked = timestamp(gate.checkedAt, now);
    assert.ok(now - checked <= 7 * 86400000 && checked <= approved, `Stale or unapproved acceptance: ${id}`);
    assert.ok(Array.isArray(gate.evidence) && gate.evidence.length > 0, `Missing evidence: ${id}`);
    gate.evidence.forEach(entry => verifyEvidence(root, entry));
  }
  assert.equal(typeof c.billing.enabled, "boolean");
  assert.ok(["test", "live"].includes(c.billing.mode));
  assert.equal(typeof c.jev.enabled, "boolean");
  assert.equal(typeof c.analytics?.enabled, "boolean", "Signed analytics switch required");
  // A paid launch remains blocked even when deployment is permitted with billing off.
  if (mode !== "deploy") {
    assert.equal(c.billing.enabled, true, "Paid launch not approved; revise the roadmap for a free launch");
    assert.equal(c.billing.mode, "live", "Test mode cannot establish a paid launch");
    assert.equal(c.jev.enabled, true, "Paid Jev capability must be accepted before sale");
    assert.equal(c.analytics.enabled, true, "Launch funnel measurement must be accepted before Release");
  }
  if (c.billing.enabled) {
    assert.ok(c.billing.approvedConfig, "Approved sale configuration required");
    verifyEvidence(root, c.billing.approvedConfig);
  }
  if (c.jev.enabled) {
    assert.ok(c.jev.approvedConfig, "Approved official Jev configuration required");
    verifyEvidence(root, c.jev.approvedConfig);
  }
  if (c.analytics.enabled) {
    assert.ok(c.analytics.approvedConfig, "Approved measurement and data policy required");
    verifyEvidence(root, c.analytics.approvedConfig);
  }
  if (mode === "complete") {
    const o = c.observation;
    assert.ok(o, "72-hour observation missing");
    const announced = timestamp(o.announcedAt, now);
    const start = timestamp(o.startedAt, now);
    assert.ok(start >= announced, "Observation cannot precede announcement");
    assert.ok(now - start >= 72 * 3600000, "72 real elapsed hours required");
    if (o.latestCriticalFixAt !== null) assert.ok(timestamp(o.latestCriticalFixAt, now) <= start, "Critical fix resets observation");
    assert.ok(Array.isArray(o.checks) && o.checks.length === 4, "Require start/24/48/72 checks");
    let last = start - 1;
    for (const [i, hour] of [0, 24, 48, 72].entries()) {
      const check: NonNullable<Candidate["observation"]>["checks"][number] = o.checks[i];
      assert.equal(check.hour, hour);
      assert.equal(check.status, "passed", "Observation failed");
      assert.equal(check.targetSha, targetSha, "Observation from another source");
      const checked = timestamp(check.checkedAt, now);
      assert.ok(checked >= start + hour * 3600000 && checked <= start + (hour + 2) * 3600000 && checked > last, "Missing timely observation");
      assert.ok(Array.isArray(check.evidence) && check.evidence.length > 0, "Observation evidence required");
      check.evidence.forEach(entry => verifyEvidence(root, entry));
      last = checked;
    }
    assert.ok(nonblank(o.finalApprovedBy), "Final operator approval required");
    const final = timestamp(o.finalApprovedAt, now);
    assert.ok(final >= last && final <= approved, "Final approval must follow 72-hour check and precede signature");
  }
  return c;
}

export function verifyOrigins(env: NodeJS.ProcessEnv) {
  for (const [name, expected] of Object.entries({ WEB_APP_URL: "https://app.guilduo.com", PUBLIC_SITE_URL: "https://guilduo.com",
    MCP_BASE_URL: "https://mcp.guilduo.com", APPWRITE_ENDPOINT: "https://api.guilduo.com/v1" })) {
    assert.equal(env[name]?.replace(/\/$/, ""), expected, `Canonical prerequisite: ${name}`);
  }
  for (const name of ["WORKER_BASE_URL", "APPWRITE_SITE_ENDPOINT"]) {
    const url = new URL(env[name] || "");
    assert.ok(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, `Invalid ${name}`);
    if (name === "WORKER_BASE_URL") assert.equal(url.pathname, "/");
  }
  assert.ok(["false", "true"].includes(env.BILLING_ENABLED || "false"), "Invalid BILLING_ENABLED");
}
export function verifyAdditiveMigrations(root: string, c: Candidate) {
  const changes = execFileSync("git", ["diff", "--name-status", c.source.baselineSha, c.source.targetSha, "--", "migrations"], { cwd: root, encoding: "utf8" }).trim();
  const paths = changes ? changes.split(/\r?\n/).map(line => {
    const [status, path] = line.split("\t");
    assert.equal(status, "A", "Only new additive migrations permitted; existing migrations are immutable");
    return path;
  }).sort() : [];
  assert.deepEqual(c.source.additiveMigrations.map(e => e.path).sort(), paths, "Unreviewed migration inventory");
  for (const entry of c.source.additiveMigrations) {
    verifyEvidence(root, entry);
    const sql = readFileSync(resolve(root, entry.path), "utf8").replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, "");
    assert.ok(!/\b(?:DROP|TRUNCATE|REPLACE)\b|(?:^|;)\s*(?:DELETE|UPDATE)\b/i.test(sql), "Destructive migration requires a separate rollout");
  }
}

export function verifyConfiguration(c: Candidate, vars: Record<string, string>, root = process.cwd()) {
  assert.equal(vars.BILLING_ENABLED || "false", String(c.billing.enabled), "Unapproved billing switch");
  assert.equal(vars.BILLING_MODE || "test", c.billing.mode, "Unapproved billing mode");
  assert.equal(vars.JEV_ENABLED || "false", String(c.jev.enabled), "Unapproved Jev switch");
  assert.equal(vars.ANALYTICS_ENABLED || "false", String(c.analytics?.enabled || false), "Unapproved analytics switch");
  assert.ok(!vars.ANALYTICS_ALLOW_LOCAL && !vars.ANALYTICS_NOW, "Test analytics settings cannot be deployed");
  if (c.analytics?.enabled) {
    assert.ok(c.analytics.approvedConfig);
    const approved = JSON.parse(readFileSync(resolve(root, c.analytics.approvedConfig.path), "utf8"));
    assert.deepEqual({ ANALYTICS_CONFIG: JSON.parse(vars.ANALYTICS_CONFIG || "null"), ANALYTICS_DATA_POLICY_APPROVED: vars.ANALYTICS_DATA_POLICY_APPROVED }, approved, "Unapproved measurement configuration");
    assert.equal(vars.ANALYTICS_DATA_POLICY_APPROVED, "true");
  }
  if (c.billing.enabled) {
    assert.ok(c.billing.approvedConfig);
    const approved = JSON.parse(readFileSync(resolve(root, c.billing.approvedConfig.path), "utf8"));
    assert.deepEqual(JSON.parse(vars.BILLING_CONFIG || "null"), approved, "Unapproved billing configuration");
  }
  if (c.jev.enabled) {
    assert.ok(c.jev.approvedConfig);
    const approved = JSON.parse(readFileSync(resolve(root, c.jev.approvedConfig.path), "utf8"));
    const keys = ["JEV_MODEL", "JEV_INPUT_USD_PER_MILLION", "JEV_OUTPUT_USD_PER_MILLION", "JEV_DATA_POLICY_APPROVED", "JEV_EVALUATION_BUDGET_USD", "JEV_BUDGET_SCOPE", "JEV_COMMERCIAL_CONFIG"];
    assert.deepEqual(Object.fromEntries(keys.map(k => [k, vars[k]])), approved, "Unapproved Jev configuration");
    assert.ok(nonblank(vars.JEV_MODEL) && !/latest/i.test(vars.JEV_MODEL), "Pinned official Jev model required");
    for (const k of keys.slice(1, 3)) assert.ok(nonblank(vars[k]) && Number.isFinite(Number(vars[k])) && Number(vars[k]) >= 0, "Verified Jev price required");
    assert.equal(vars.JEV_DATA_POLICY_APPROVED, "true");
    const budget = Number(vars.JEV_EVALUATION_BUDGET_USD);
    assert.ok(budget > 0 && budget <= 1, "Jev evaluation budget must be at most USD 1");
    if(c.billing.enabled && c.billing.mode==="live") {
      assert.equal(vars.JEV_BUDGET_SCOPE,"commercial","Live Jev must use a commercial expense ceiling");
      const config=JSON.parse(vars.JEV_COMMERCIAL_CONFIG || "null");
      assert.ok(config?.approved===true && config.mode==="live" && Number.isFinite(config.limitUsd) && config.limitUsd>0,"Approved Live commercial budget required");
    }
  }
}

export async function verifyWorker(c: Candidate, env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch,
  configuration?: { name: string; vars: Record<string, string> }) {
  verifyOrigins(env);
  const request = async <T,>(url: string, headers?: Record<string, string>): Promise<T> => {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
    assert.ok(response.ok, "Worker prerequisite request failed");
    return response.json() as Promise<T>;
  };
  assert.ok(nonblank(env.CLOUDFLARE_ACCOUNT_ID) && nonblank(env.CLOUDFLARE_API_TOKEN), "Cloudflare read credentials required");
  const config = configuration ?? JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
  assert.equal(config.vars.WEB_APP_URL, "https://app.guilduo.com");
  verifyConfiguration(c, config.vars);
  const api = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID!)}/workers/scripts/${encodeURIComponent(config.name)}`;
  const headers = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
  const deployments = await request<{ success: boolean; result: { deployments: { versions: { version_id: string; percentage: number }[] }[] } }>(`${api}/deployments`, headers);
  assert.equal(deployments.success, true);
  const deployment = deployments.result.deployments[0];
  assert.ok(deployment && deployment.versions.length === 1 && deployment.versions[0].percentage === 100, "Worker must serve one candidate at 100%");
  const version = await request<{ success: boolean; result: { annotations?: Record<string, string>; resources?: { bindings?: { type: string; name: string; text: string }[] } } }>(`${api}/versions/${encodeURIComponent(deployment.versions[0].version_id)}`, headers);
  assert.equal(version.success, true);
  assert.equal(version.result.annotations?.["workers/tag"], c.source.targetSha, "Active Worker source differs from Site candidate");
  const liveVars = Object.fromEntries((version.result.resources?.bindings ?? []).filter((b: { type: string }) => b.type === "plain_text")
    .map((b: { name: string; text: string }) => [b.name, b.text]));
  assert.equal(liveVars.WEB_APP_URL, "https://app.guilduo.com", "Active Worker canonical origin mismatch");
  verifyConfiguration(c, liveVars);
  const h = await request<{ ok: boolean; version: string; schemaVersion: number; agentStorage: string }>(`${env.WORKER_BASE_URL!.replace(/\/$/, "")}/health`);
  assert.ok(h.ok === true && h.version === c.source.apiVersion && h.schemaVersion === c.source.schemaVersion && h.agentStorage === "d1", "Worker expected version/storage mismatch");
  const mcp = "https://mcp.guilduo.com";
  const metadata = await request<{ issuer: string; authorization_endpoint: string; token_endpoint: string }>(`${mcp}/.well-known/oauth-authorization-server`);
  const resource = await request<{ resource: string; authorization_servers?: string[] }>(`${mcp}/.well-known/oauth-protected-resource/mcp`);
  assert.ok(metadata.issuer === mcp && metadata.authorization_endpoint === `${mcp}/oauth/authorize`
    && metadata.token_endpoint === `${mcp}/oauth/token` && resource.resource === `${mcp}/mcp`
    && resource.authorization_servers?.includes(mcp), "Canonical MCP metadata mismatch");
  const anonymous = await fetcher(`${mcp}/mcp`, { method: "POST", signal: AbortSignal.timeout(15000), redirect: "error" });
  assert.equal(anonymous.status, 401, "MCP must reject unauthenticated calls");
  console.log(`Worker prerequisite passed: ${deployment.versions[0].version_id}, source ${c.source.targetSha}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--origins") { verifyOrigins(process.env); console.log("Canonical prerequisites passed"); return; }
  assert.ok(["deploy", "release", "complete"].includes(mode), "Usage: verify-launch-gates.mts deploy|release|complete [--worker] [--migrations] [--configuration] | --origins");
  const root = process.cwd();
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  if (process.env.GITHUB_SHA) assert.equal(process.env.GITHUB_SHA, git("rev-parse", "HEAD"), "Checkout differs from requested source");
  assert.equal(git("status", "--porcelain", "--untracked-files=normal"), "", "Commit candidate before public operations; dirty tree is preserved locally");
  assert.ok(nonblank(process.env.LAUNCH_APPROVAL_PUBLIC_KEY), "Trusted approval public key is missing");
  assert.ok(nonblank(process.env.GITHUB_REPOSITORY), "GITHUB_REPOSITORY source identity required");
  const path = resolve(root, ".qa-artifacts/launch-candidate.json");
  const c = verifyCandidate({ root, bytes: readFileSync(path), signature: readFileSync(`${path}.sig`), publicKey: process.env.LAUNCH_APPROVAL_PUBLIC_KEY!,
    targetSha: process.env.GITHUB_SHA || git("rev-parse", "HEAD"), treeSha: git("rev-parse", "HEAD^{tree}"), repository: process.env.GITHUB_REPOSITORY!,
    mode: mode as "deploy" | "release" | "complete" });
  if (process.argv.includes("--migrations")) verifyAdditiveMigrations(root, c);
  if (process.argv.includes("--configuration")) verifyConfiguration(c, JSON.parse(readFileSync("wrangler.jsonc", "utf8")).vars);
  if (process.argv.includes("--worker")) await verifyWorker(c, process.env);
  console.log(`Launch ${mode} gate passed for ${c.source.targetSha}; this verifies signed records, not the truth of human testimony.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Launch gate refused: ${error.message}`); process.exitCode = 1; });
}
