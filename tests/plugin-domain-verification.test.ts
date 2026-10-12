import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

const origin = "https://mcp.guilduo.com";
const path = "/.well-known/openai-apps-challenge";
const env: WorkerEnv = { PUBLIC_BASE_URL: origin };
const context = { waitUntil(): void { assert.fail("Domain verification must not schedule work"); } };

test("public domain challenge returns exact raw text without authentication or cached rotation", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  // Local test fixtures only; no portal-issued value is stored in this repository.
  for (const token of ["test-only.challenge+one/=", " test-only.challenge-two "]) {
    const response = await worker.fetch(new Request(`${origin}${path}`), { ...env, OPENAI_APPS_CHALLENGE_TOKEN: token }, context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("www-authenticate"), null);
    assert.equal(await response.text(), token);
  }
  const removed = await worker.fetch(new Request(`${origin}${path}`), env, context);
  assert.equal(removed.status, 404);
  assert.equal(await removed.text(), "Not found");
});

test("absent or malformed challenge settings return a public noncached 404 without echoing configuration", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  for (const token of [undefined, "", "   ", "test\nvalue", "test\rvalue", "test\tvalue", "test\0value", "test\u001fvalue", "test\u007fvalue", "test\u0085value", "test\u009fvalue"]) {
    const response = await worker.fetch(new Request(`${origin}${path}`), { ...env, OPENAI_APPS_CHALLENGE_TOKEN: token }, context);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("www-authenticate"), null);
    assert.equal(await response.text(), "Not found");
  }
});

test("challenge non-GET methods never authenticate, read the body or return the challenge", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  for (const token of [undefined, "test-only.challenge"]) {
    for (const method of ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const request = new Request(`${origin}${path}`, { method, body: ["HEAD", "OPTIONS"].includes(method) ? undefined : "not-json" });
      const response = await worker.fetch(request, { ...env, OPENAI_APPS_CHALLENGE_TOKEN: token }, context);
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "GET");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.equal(await response.text(), "Method not allowed");
      assert.equal(request.bodyUsed, false);
    }
  }
});

test("challenge does not change authentication on MCP, REST or neighboring paths", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const configured = { ...env, OPENAI_APPS_CHALLENGE_TOKEN: "test-only.challenge" };
  for (const endpoint of ["/mcp", "/mcp-next", "/v1/state", `${path}/`, "/.well-known/openai-apps-challenge-extra"]) {
    const response = await worker.fetch(new Request(`${origin}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), configured, context);
    assert.equal(response.status, 401, endpoint);
    assert.match(response.headers.get("www-authenticate") || "", /^Bearer /);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "unauthorized");
  }
  for (const endpoint of ["/health", "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource"]) {
    const response = await worker.fetch(new Request(`${origin}${endpoint}`), configured, context);
    assert.equal(response.status, 200, endpoint);
    assert.match(response.headers.get("content-type") || "", /^application\/json/);
  }
});
