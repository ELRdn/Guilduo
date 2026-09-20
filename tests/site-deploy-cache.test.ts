import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { assertSiteDeployCacheSafe } from "../tools/check-site-deploy-cache.mts";

test("deployment guard rejects cached and cacheable HTML, including a cold MISS", async () => {
  for (const status of ["HIT", "MISS", "EXPIRED", "STALE", "UPDATING", "REVALIDATED", "unknown"]) {
    await assert.rejects(assertSiteDeployCacheSafe("https://example.test", async () => new Response("shell", {
      headers: { "cf-cache-status": status },
    })), /CDN-cacheable/);
  }
});

test("deployment guard checks both public and compatibility HTML without auth or cache-busting", async () => {
  const paths: string[] = [];
  await assertSiteDeployCacheSafe("https://example.test/", async (input, options) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(url.search, "");
    assert.equal(options?.headers, undefined);
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    return new Response("shell", { headers: { "cf-cache-status": paths.length === 1 ? "DYNAMIC" : "BYPASS" } });
  });
  assert.deepEqual(paths, ["/", "/next/relay-forge/"]);
});

test("deployment guard blocks failed probes, cached compatibility HTML and non-origin inputs", async () => {
  await assert.rejects(assertSiteDeployCacheSafe("https://example.test", async () => new Response("error", { status: 503 })), /HTTP 503/);
  await assert.rejects(assertSiteDeployCacheSafe("https://example.test", async () => { throw new Error("network unavailable"); }), /network unavailable/);
  await assert.rejects(assertSiteDeployCacheSafe("https://example.test", async (input) => new Response("shell", {
    headers: { "cf-cache-status": new URL(String(input)).pathname === "/" ? "DYNAMIC" : "HIT" },
  })), /CDN-cacheable/);
  for (const url of ["https://example.test/path", "https://example.test/?q=1", "https://user:secret@example.test/", "file:///tmp/"]) {
    await assert.rejects(assertSiteDeployCacheSafe(url, async () => { throw new Error("must not fetch"); }), /HTTP\(S\) origin/);
  }
});

test("non-Cloudflare origins remain supported and the guard precedes deployment upload", async () => {
  await assertSiteDeployCacheSafe("https://example.test", async () => new Response("shell"));
  const script = readFileSync("tools/deploy-appwrite-site.sh", "utf8");
  assert.ok(script.indexOf("check-site-deploy-cache.mts") < script.indexOf('while (( offset < total_size ))'));
});
