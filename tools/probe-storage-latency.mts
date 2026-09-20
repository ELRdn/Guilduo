import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Intentionally no user-supplied URL, row ID, queries, or operations.
const endpoint = "https://api.guilduo.com/v1";
const project = "6a8ed1ca002537cfedab";
const rows = "/tablesdb/guilduo/tables/user_states/rows";
type RecordValue = Record<string, unknown>;
type Result = { status: number; value: RecordValue; started: number; finished: number; ms: number };
export type ProbeReport = {
  rowId: string;
  checks: string[];
  samples: { mode: string; totalMs: number; phases: Record<string, number> }[];
  concurrent?: { statuses: number[]; overlapping: boolean };
  cleaned: boolean;
};

export async function probeStorageLatency(options: {
  apiKey: string;
  fetcher?: typeof fetch;
  progress?: (report: ProbeReport) => void;
}): Promise<ProbeReport> {
  assert.ok(options.apiKey, "APPWRITE_API_KEY is required");
  const fetcher = options.fetcher ?? fetch;
  const rowId = `latency-probe-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const rowPath = `${rows}/${rowId}`;
  const stateJson = JSON.stringify({ probe: randomBytes(32768).toString("base64") });
  const report: ProbeReport = { rowId, checks: [], samples: [], cleaned: false };
  const transactions = new Set<string>();
  let attemptedCreate = false;
  let createConflict = false;

  async function request(path: string, method = "GET", body?: unknown): Promise<Result> {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetcher(endpoint + path, {
        method, redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json", "x-appwrite-project": project, "x-appwrite-key": options.apiKey },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let value: RecordValue = {};
      try { value = JSON.parse(text) as RecordValue; } catch { /* Empty DELETE body. */ }
      const finished = performance.now();
      return { status: response.status, value, started, finished, ms: Math.round(finished - started) };
    } catch {
      // Never propagate request headers, URL queries, provider bodies or errors.
      throw new Error("Probe request failed or timed out; cleanup will be attempted");
    }
  }
  function ok(result: Result): Result {
    assert.ok(result.status >= 200 && result.status < 300, `Probe HTTP ${result.status}`);
    return result;
  }
  function data(revision: number, marker: string): RecordValue {
    return { ownerId: rowId, schemaVersion: 7, revision, clientUpdatedAt: new Date().toISOString(), deviceId: marker, stateJson };
  }
  async function begin(): Promise<string> {
    const result = ok(await request("/tablesdb/transactions", "POST", { ttl: 120 }));
    const id = result.value.$id;
    assert.ok(typeof id === "string" && /^[a-zA-Z0-9._-]{1,36}$/.test(id), "Invalid transaction ID");
    transactions.add(id);
    return id;
  }
  function txPath(id: string): string {
    assert.ok(transactions.has(id), "Only transactions created by this run may be used");
    return `/tablesdb/transactions/${id}`;
  }
  async function read(): Promise<RecordValue> { return ok(await request(rowPath)).value; }
  function assertRow(row: RecordValue, revision: number, marker: string): void {
    assert.equal(row.$id, rowId);
    assert.equal(row.ownerId, rowId);
    assert.equal(row.revision, revision);
    assert.equal(row.deviceId, marker);
    assert.equal(row.stateJson, stateJson);
    assert.deepEqual(row.$permissions, []);
  }
  async function batch(id: string, expected: number, marker: string): Promise<Result> {
    const target = { databaseId: "guilduo", tableId: "user_states", rowId };
    return ok(await request(`${txPath(id)}/operations`, "POST", { operations: [
      { ...target, action: "increment", data: { column: "revision", value: 1, max: expected + 1 } },
      { ...target, action: "decrement", data: { column: "revision", value: 1, min: expected } },
      { ...target, action: "update", data: data(expected + 1, marker) },
    ] }));
  }
  async function commit(id: string): Promise<Result> { return request(txPath(id), "PATCH", { commit: true }); }
  async function discard(id: string): Promise<void> {
    const result = await request(txPath(id), "DELETE");
    assert.ok(result.status === 204 || result.status === 404, "Transaction cleanup failed");
    transactions.delete(id);
  }
  async function rejection(expected: number): Promise<void> {
    const before = await read();
    const id = await begin();
    await batch(id, expected, "must-not-save");
    const result = await commit(id);
    assert.equal(result.status, 400, "Expected numeric-bound rejection");
    assert.equal(result.value.type, "attribute_limit_exceeded");
    const after = await read();
    assertRow(after, Number(before.revision), String(before.deviceId));
    assert.equal(after.$updatedAt, before.$updatedAt, "Failed transaction changed updatedAt");
    await discard(id);
  }
  try {
    // Emit the exact synthetic ID before a write, even if CI is interrupted.
    options.progress?.(structuredClone(report));
    attemptedCreate = true;
    const created = await request(rows, "POST", { rowId, permissions: [], data: data(4, "original") });
    createConflict = created.status === 409;
    ok(created);
    assertRow(await read(), 4, "original");
    const normal = await begin();
    await batch(normal, 4, "match");
    ok(await commit(normal));
    assertRow(await read(), 5, "match");
    await discard(normal);
    report.checks.push("matching revision committed and persisted");
    await rejection(4);
    report.checks.push("stale revision rejected without changes");
    await rejection(6);
    report.checks.push("future revision rejected and prior increment rolled back");

    const left = await begin(), right = await begin();
    await batch(left, 5, "left");
    await batch(right, 5, "right");
    // Both requests start before either response is awaited.
    const pending = await Promise.allSettled([commit(left), commit(right)]);
    if (pending[0].status === "rejected") throw pending[0].reason;
    if (pending[1].status === "rejected") throw pending[1].reason;
    const contenders = [pending[0].value, pending[1].value];
    assert.equal(contenders.filter(r => r.status >= 200 && r.status < 300).length, 1, "Exactly one commit must win");
    const loser = contenders.find(r => r.status >= 300)!;
    assert.ok((loser.status === 400 && loser.value.type === "attribute_limit_exceeded") || loser.status === 409, "Unexpected loser response");
    const overlapping = Math.max(...contenders.map(r => r.started)) < Math.min(...contenders.map(r => r.finished));
    assert.ok(overlapping, "Requests did not overlap; concurrency unverified");
    assertRow(await read(), 6, contenders[0].status < 300 ? "left" : "right");
    report.concurrent = { statuses: contenders.map(r => r.status), overlapping };
    report.checks.push("overlapping commits: one winner with matching persisted payload");
    await discard(left); await discard(right);

    for (const mode of ["current", "batch", "batch", "current", "current", "batch"]) {
      const started = performance.now();
      const phases: Record<string, number> = {};
      const initial = await Promise.allSettled([request(rowPath), begin()]);
      if (initial[0].status === "rejected") throw initial[0].reason;
      if (initial[1].status === "rejected") throw initial[1].reason;
      phases.readAndBegin = Math.round(performance.now() - started);
      const expected = Number(ok(initial[0].value).value.revision);
      const id = initial[1].value;
      const marker = `${mode}-${expected}`;
      if (mode === "current") {
        const reread = ok(await request(`${rowPath}?transactionId=${id}`));
        assert.equal(reread.value.revision, expected);
        phases.transactionRead = reread.ms;
        phases.stage = ok(await request(rowPath, "PATCH", { data: data(expected + 1, marker), transactionId: id })).ms;
      } else {
        phases.stage = (await batch(id, expected, marker)).ms;
      }
      phases.commit = ok(await commit(id)).ms;
      const totalMs = Math.round(performance.now() - started);
      assertRow(await read(), expected + 1, marker);
      report.samples.push({ mode, totalMs, phases });
      options.progress?.(structuredClone(report));
      await discard(id);
    }
  } finally {
    const failures: string[] = [];
    for (const id of [...transactions]) {
      try { await discard(id); } catch { failures.push("transaction cleanup failed"); }
    }
    if (attemptedCreate && !createConflict) {
      try {
        const remaining = await request(rowPath);
        if (remaining.status !== 404) {
          ok(remaining);
          // Even after uncertain create/save, never delete a row that is not ours.
          assert.equal(remaining.value.$id, rowId);
          assert.equal(remaining.value.ownerId, rowId);
          assert.equal(remaining.value.stateJson, stateJson);
          assert.deepEqual(remaining.value.$permissions, []);
          assert.equal((await request(rowPath, "DELETE")).status, 204);
          assert.equal((await request(rowPath)).status, 404);
        }
      } catch { failures.push("row cleanup failed; inspect only the reported probe row ID"); }
    }
    report.cleaned = failures.length === 0;
    options.progress?.(structuredClone(report));
    assert.equal(failures.length, 0, failures.join("; "));
  }
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] !== "--execute") {
    console.log("Dry run: creates one private synthetic row, tests revision guards/concurrency, measures 3 pairs, and deletes its own resources. Use --execute in the manual production diagnostic workflow.");
  } else {
    probeStorageLatency({ apiKey: process.env.APPWRITE_API_KEY || "", progress: report => console.log(JSON.stringify(report)) }).catch(() => {
      console.error("Storage probe failed; inspect the safe progress report and cleanup status. No raw service errors or credentials are logged.");
      process.exitCode = 1;
    });
  }
}
