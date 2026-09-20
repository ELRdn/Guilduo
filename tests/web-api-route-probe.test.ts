import test from "node:test";
import assert from "node:assert/strict";
import { assertWebApiRoute } from "../tools/check-web-api-route.mts";

test("route probe fails closed on HTML fallback, exposed data, wrong auth, cache or redirect", async () => {
  const good = () => Response.json({ error: { code: "unauthorized" } }, { status: 401, headers: { "cache-control": "no-store" } });
  await assertWebApiRoute("https://app.example.test", async (url, init) => {
    assert.equal(url, "https://app.example.test/api/v1/workspace/bootstrap");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.headers, undefined);
    return good();
  });
  for (const response of [new Response("<html>", { headers: { "content-type": "text/html" } }), Response.json({ tasks: [] }), Response.json({ error: { code: "not_found" } }, { status: 401, headers: { "cache-control": "no-store" } }), Response.json({ error: { code: "unauthorized" } }, { status: 401 }), new Response(null, { status: 302, headers: { location: "/" } })]) {
    await assert.rejects(assertWebApiRoute("https://app.example.test", async () => response));
  }
  await assert.rejects(assertWebApiRoute("http://app.example.test", async () => good()));
});
