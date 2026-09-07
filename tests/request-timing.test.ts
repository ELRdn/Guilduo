const test = require("node:test");
const assert = require("node:assert/strict");
import { timePhase, withRequestTiming } from "../worker/src/request-timing.ts";

const request = (path: string) => new Request(`https://worker.invalid${path}?secret=private-query`, {
  method: "PATCH", headers: { authorization: "Bearer private-token" }, body: "private-body",
});

test("overlapping request timings stay isolated and contain no user input", async () => {
  const original = console.log;
  const logs: unknown[][] = [];
  console.log = (...args: unknown[]) => { logs.push(args); };
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  try {
    const first = withRequestTiming(request("/v1/quests/private-id"), async () => {
      await timePhase("tx_commit", async () => { started(); await gate; });
      return Response.json({ saved: true });
    });
    await entered;
    const second = await withRequestTiming(request("/v1/state"), async () => {
      await timePhase("auth", async () => undefined);
      return new Response(null, { status: 401 });
    });
    release();
    const firstResponse = await first;
    assert.match(firstResponse.headers.get("server-timing"), /tx_commit;dur=/);
    assert.doesNotMatch(firstResponse.headers.get("server-timing"), /auth;/);
    assert.match(second.headers.get("server-timing"), /auth;dur=/);
    assert.doesNotMatch(second.headers.get("server-timing"), /tx_commit;/);
    assert.deepEqual(await firstResponse.json(), { saved: true });
    assert.equal(second.status, 401);
    assert.equal(logs.length, 2);
    assert.doesNotMatch(JSON.stringify(logs), /private-|authorization|Bearer/);
    assert.match(JSON.stringify(logs), /"route":"quests"/);
  } finally { release(); console.log = original; }
});

test("failed phases retain timing without logging exception contents or changing the error", async () => {
  const original = console.log;
  const logs: unknown[][] = [];
  console.log = (...args: unknown[]) => { logs.push(args); };
  const failure = new Error("private-failure-token");
  try {
    const response = await withRequestTiming(request("/v1/state"), async () => {
      try { await timePhase("tx_commit", async () => { throw failure; }); }
      catch (error) { assert.equal(error, failure); }
      return new Response(null, { status: 500 });
    });
    assert.equal(response.status, 500);
    assert.match(response.headers.get("server-timing"), /tx_commit;dur=/);
    assert.doesNotMatch(JSON.stringify(logs), /private-/);
  } finally { console.log = original; }
});

test("public requests and work outside a request remain uninstrumented", async () => {
  let calls = 0;
  assert.equal(await timePhase("state_read", async () => ++calls), 1);
  for (const path of ["/health", "/oauth/token", "/v1/quests"]) {
    const response = await withRequestTiming(new Request(`https://worker.invalid${path}`), async () => Response.json({ ok: true }));
    assert.equal(response.headers.get("server-timing"), null);
  }
});
