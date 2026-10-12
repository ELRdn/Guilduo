import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const base = new URL(process.env.BILLING_ADMIN_BASE_URL || "http://127.0.0.1:8787");
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))) throw new Error("Administration requires HTTPS or localhost.");
if (base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Use a plain Worker origin.");
const token = process.env.BILLING_ADMIN_TOKEN;
if (!token) throw new Error("Set the separate BILLING_ADMIN_TOKEN; do not pass secrets as arguments.");
const execute = args.includes("--execute");
const uid = args.includes("--uid") ? option("--uid") : undefined;
const decisions = args.includes("--decisions");
const requestId = args.includes("--request-id") ? option("--request-id") : undefined;
if (execute && !uid) throw new Error("Reconciliation requires --uid and --execute.");
if (execute && decisions && !requestId) throw new Error("Decision settlement requires --request-id.");
if (execute) {
  const response = await fetch(new URL(decisions ? "/v1/billing/admin/decisions/reconcile" : "/v1/billing/admin/reconcile", base), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ uid, ...(decisions ? { requestId } : {}) }),
  });
  if (!response.ok) throw new Error(`Reconciliation failed: HTTP ${response.status}.`);
}
const response = await fetch(new URL(decisions ? "/v1/billing/admin/decisions" : "/v1/billing/admin/report", base), {
  redirect: "error", signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`Report failed: HTTP ${response.status}.`);
const report = await response.json() as { mode: string; accounts?: Array<{ debt: number; syncPending: boolean }>; total?: number; truncated?: boolean; decisions?: unknown[] };
if (decisions ? !Array.isArray(report.decisions) : !Array.isArray(report.accounts)) throw new Error("Invalid report.");
if (args.includes("--output")) {
  const output = resolve(option("--output") || "");
  if (!option("--output")) throw new Error("An output path is required.");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(decisions ? { mode: report.mode, pendingDecisions: report.total, truncated: report.truncated, reconciled: execute }
  : { mode: report.mode, inspectedAccounts: report.accounts!.length, debtAccounts: report.accounts!.filter(a => a.debt > 0).length, pendingAccounts: report.accounts!.filter(a => a.syncPending).length, reconciled: execute }));
