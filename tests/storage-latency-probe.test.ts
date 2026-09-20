import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { probeStorageLatency } from "../tools/probe-storage-latency.mts";
import type { ProbeReport } from "../tools/probe-storage-latency.mts";

type Obj = Record<string, unknown>;
function provider(fault = "") {
  let row: Obj | undefined;
  let id = "", revisionClock = 0, txCount = 0;
  const transactions = new Map<string, Obj[]>();
  const requests: { method: string; path: string }[] = [];
  const response = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    requests.push({ method, path: url.pathname });
    assert.equal(url.origin, "https://api.guilduo.com");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("x-appwrite-project"), "6a8ed1ca002537cfedab");
    const body = init?.body ? JSON.parse(String(init.body)) as Obj : {};
    if (url.pathname === "/v1/tablesdb/guilduo/tables/user_states/rows" && method === "POST") {
      id = String(body.rowId);
      assert.match(id, /^latency-probe-[a-f0-9]{20}$/);
      assert.deepEqual(body.permissions, []);
      if (fault === "create-conflict") return response({}, 409);
      row = { ...(body.data as Obj), $id: id, $permissions: [], $updatedAt: "0" };
      if (fault === "uncertain-create") throw new Error("secret provider error");
      if (fault === "foreign-owner") row.ownerId = "not-our-row";
      return response(row, 201);
    }
    if (url.pathname === `/v1/tablesdb/guilduo/tables/user_states/rows/${id}` && id) {
      if (method === "GET") return response(row || {}, row ? 200 : 404);
      if (method === "DELETE") { row = undefined; return response(null, 204); }
      if (method === "PATCH") {
        assert.ok(transactions.has(String(body.transactionId)));
        transactions.get(String(body.transactionId))!.push({ action: "update", data: body.data });
        return response(row);
      }
    }
    if (url.pathname === "/v1/tablesdb/transactions" && method === "POST") {
      assert.equal(body.ttl, 120);
      const tx = `tx-${++txCount}`;
      transactions.set(tx, []);
      return response({ $id: tx }, 201);
    }
    const tx = url.pathname.split("/")[4];
    assert.ok(transactions.has(tx), "Unexpected resource or non-owned transaction");
    if (method === "DELETE") {
      if (fault === "cleanup-transaction") return response({}, 503);
      transactions.delete(tx); return response(null, 204);
    }
    if (method === "POST" && url.pathname.endsWith("/operations")) {
      if (fault === "stage") return response({ type: "bad_request" }, 400);
      const ops = body.operations as Obj[];
      for (const op of ops) {
        assert.equal(op.databaseId, "guilduo");
        assert.equal(op.tableId, "user_states");
        assert.equal(op.rowId, id);
      }
      transactions.set(tx, ops); return response({ $id: tx });
    }
    assert.equal(method, "PATCH");
    assert.equal(body.commit, true);
    await new Promise(resolve => setTimeout(resolve, 1));
    const next = structuredClone(row!);
    for (const op of transactions.get(tx)!) {
      const data = op.data as Obj;
      if (op.action === "update") Object.assign(next, data);
      else {
        const value = Number(next.revision) + (op.action === "increment" ? 1 : -1);
        if (value > Number(data.max ?? Infinity) || value < Number(data.min ?? -Infinity)) {
          return response({ type: "attribute_limit_exceeded" }, 400);
        }
        next.revision = value;
      }
    }
    row = { ...next, $updatedAt: String(++revisionClock) };
    return response({ $id: tx, status: "committed" });
  };
  return { fetcher, requests, transactions, row: () => row };
}

test("probe confines all writes to its own row, verifies persistence/concurrency, then removes every resource", async () => {
  const api = provider();
  const result = await probeStorageLatency({ apiKey: "test-only", fetcher: api.fetcher });
  assert.equal(result.checks.length, 4);
  assert.deepEqual(result.concurrent, { statuses: [200, 400], overlapping: true });
  assert.equal(result.samples.filter(s => s.mode === "current").length, 3);
  assert.equal(result.samples.filter(s => s.mode === "batch").length, 3);
  assert.equal(result.cleaned, true);
  assert.equal(api.row(), undefined);
  assert.equal(api.transactions.size, 0);
  assert.ok(api.requests.at(-1)?.method === "GET");
});

test("probe cleans up a created row even when creation's response is lost", async () => {
  const api = provider("uncertain-create");
  let report: ProbeReport | undefined;
  await assert.rejects(probeStorageLatency({ apiKey: "test-only", fetcher: api.fetcher, progress: r => { report = r; } }), /timed out/);
  assert.equal(api.row(), undefined);
  assert.equal(report?.cleaned, true);
});

test("probe cleans up after staging errors and attempts row deletion even when transaction cleanup fails", async () => {
  for (const fault of ["stage", "cleanup-transaction"]) {
    const api = provider(fault);
    let report: ProbeReport | undefined;
    await assert.rejects(probeStorageLatency({ apiKey: "test-only", fetcher: api.fetcher, progress: r => { report = r; } }));
    assert.equal(api.row(), undefined);
    assert.equal(report?.cleaned, fault !== "cleanup-transaction");
  }
});

test("probe never deletes a conflicting existing row or a row whose ownership/payload cannot be established", async () => {
  for (const fault of ["create-conflict", "foreign-owner"]) {
    const api = provider(fault);
    await assert.rejects(probeStorageLatency({ apiKey: "test-only", fetcher: api.fetcher }));
    assert.equal(api.requests.filter(r => r.method === "DELETE").length, 0);
  }
});

test("diagnostic is manual, serialized, limited to the existing API secret, and cannot deploy the candidate", () => {
  const workflow = readFileSync(".github/workflows/probe-storage-latency.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:|wrangler|CLOUDFLARE|APPWRITE_REVISION_BATCH/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /secrets\.APPWRITE_API_KEY/);
  assert.ok(workflow.indexOf("Verify diagnostic safety offline") < workflow.indexOf("APPWRITE_API_KEY:"));
});
