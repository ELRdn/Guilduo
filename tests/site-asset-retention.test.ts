import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSET_RETENTION_MS, RETAINED_ASSET_MANIFEST, PREVIOUS_SHELL_PATH, PREVIOUS_SHELL_META_PATH, previousShellProbe, retainSiteAssets } from "../tools/retain-site-assets.mts";

const now = Date.UTC(2026, 8, 21);
const oldName = "app-OldHash01.js", newName = "app-NewHash02.js";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const entry = (name: string, content: string, retiredAt: number | null = null) => ({ name, sha256: sha(content), size: Buffer.byteLength(content), retiredAt });

async function fixture(t: { after: (fn: () => Promise<void>) => void }, files: Record<string, string> = { [newName]: "new" }) {
  const dist = await mkdtemp(join(tmpdir(), "guilduo-assets-"));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await mkdir(join(dist, "assets"));
  for (const [name, content] of Object.entries(files)) await writeFile(join(dist, "assets", name), content);
  return dist;
}
function server(assets: unknown[] | null, files: Record<string, string>, active = oldName, modify?: (path: string) => Response | undefined): typeof fetch {
  return async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://app.example.test");
    assert.equal(url.search, "");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.headers, undefined);
    const custom = modify?.(url.pathname);
    if (custom) return custom;
    if (url.pathname === RETAINED_ASSET_MANIFEST) return assets === null
      ? new Response("fallback", { headers: { "content-type": "text/html" } })
      : Response.json({ version: 1, generatedAt: now - 1, assets });
    if (url.pathname === "/" || url.pathname === "/next/relay-forge/") return new Response(`<html><head><script type="module" src="/assets/${active}"></script></head><body></body></html>`, { headers: { "content-type": "text/html" } });
    const body = files[url.pathname.slice("/assets/".length)];
    return body === undefined ? new Response("fallback", { headers: { "content-type": "text/html" } }) : new Response(body, { headers: { "content-type": "text/javascript" } });
  };
}
const opts = (dist: string, fetcher: typeof fetch) => ({ siteUrl: "https://app.example.test", dist, now, fetcher });

test("retention preserves previous imports and starts retirement at replacement, even for an old deployment", async t => {
  const dist = await fixture(t);
  const files = { [oldName]: 'import "./dependency-Hash0001.js"', "dependency-Hash0001.js": "export default 1" };
  const result = await retainSiteAssets(opts(dist, server(Object.entries(files).map(([n, s]) => entry(n, s)), files)));
  assert.equal(result.retained, 2);
  for (const [n, s] of Object.entries(files)) assert.equal(await readFile(join(dist, "assets", n), "utf8"), s);
  const manifest = JSON.parse(await readFile(join(dist, "assets/retained-releases.json"), "utf8"));
  assert.equal(manifest.assets.find((a: { name: string }) => a.name === oldName).retiredAt, now);
  assert.equal(manifest.assets.find((a: { name: string }) => a.name === newName).retiredAt, null);
  const probe = await readFile(join(dist, PREVIOUS_SHELL_PATH), "utf8");
  const metadata = JSON.parse(await readFile(join(dist, PREVIOUS_SHELL_META_PATH), "utf8"));
  assert.match(probe, /noindex,nofollow/);
  assert.match(probe, new RegExp(oldName));
  assert.doesNotMatch(probe, new RegExp(newName));
  assert.equal(metadata.probeSha256, sha(probe));
  assert.equal(metadata.capturedAt, now);
});

test("old-shell probe preserves reference destinations and changes only indexing metadata", () => {
  const origin = new URL("https://app.example.test");
  const html = '<html><head><script src="../../assets/app-OldHash01.js"></script></head><body><a href="#content">skip</a></body></html>';
  assert.equal(previousShellProbe(html, origin), html.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">'));
  for (const bad of ['<script src="/assets/app-OldHash01.js"></script>', '<head><base href="https://other.test/"></head>', '<head><script src="./app-OldHash01.js"></script></head>']) {
    assert.throws(() => previousShellProbe(bad, origin), /head|base|location-dependent/);
  }
});

test("multiple deployments preserve original retirement time and prune only after 48 hours", async t => {
  const dist = await fixture(t);
  const recent = entry(oldName, "old", now - ASSET_RETENTION_MS + 1);
  const expired = entry("gone-OldHash03.js", "gone", now - ASSET_RETENTION_MS);
  await retainSiteAssets(opts(dist, server([recent, expired], { [oldName]: "old" })));
  const manifest = JSON.parse(await readFile(join(dist, "assets/retained-releases.json"), "utf8"));
  assert.equal(manifest.assets.length, 2);
  assert.deepEqual(manifest.assets.find((a: { name: string }) => a.name === oldName), recent);
  await assert.rejects(readFile(join(dist, "assets", expired.name)), /ENOENT/);
});

test("missing manifest cannot silently reset the retention chain; first bootstrap verifies active bytes", async t => {
  const dist = await fixture(t);
  const fetcher = server(null, { [newName]: "new" }, newName);
  await assert.rejects(retainSiteAssets(opts(dist, fetcher)), /explicit first-release/);
  const result = await retainSiteAssets({ ...opts(dist, fetcher), bootstrap: true });
  assert.equal(result.bootstrapped, true);
  await assert.rejects(retainSiteAssets({ ...opts(dist, fetcher), bootstrap: true }), /fresh build/);
});

test("bootstrap fails if the currently active entry is absent or has different bytes", async t => {
  for (const active of [oldName, newName]) {
    const dist = await fixture(t);
    await assert.rejects(retainSiteAssets({ ...opts(dist, server(null, { [active]: "wrong" }, active)), bootstrap: true }), /unretained asset|must match/);
  }
});

test("query strings cannot hide a missing stylesheet from active-shell verification", async t => {
  const dist = await fixture(t);
  const fetcher = server(null, { [newName]: "new" }, newName, p => p === "/" ? new Response(
    `<script src="/assets/${newName}?v=1"></script><link href="/assets/missing-Hash0001.css?v=1">`,
    { headers: { "content-type": "text/html" } },
  ) : undefined);
  await assert.rejects(retainSiteAssets({ ...opts(dist, fetcher), bootstrap: true }), /unretained asset/);
});

test("HTML fallbacks and checksum errors in old chunks stop deployment preparation", async t => {
  for (const files of [{}, { [oldName]: "corrupted" }] as Record<string, string>[]) {
    const dist = await fixture(t);
    await assert.rejects(retainSiteAssets(opts(dist, server([entry(oldName, "old")], files))), /returned HTML|checksum/);
    await assert.rejects(readFile(join(dist, "assets/retained-releases.json")), /ENOENT/);
  }
});

test("manifest rejects traversal, duplicate names, invalid dates and oversized entries", async t => {
  for (const assets of [
    [entry("../escape-Hash0001.js", "x")],
    [entry(oldName, "old"), entry(oldName, "old")],
    [{ ...entry(oldName, "old"), retiredAt: now + 1 }],
    [{ ...entry(oldName, "old"), size: 33 * 1024 * 1024 }],
  ]) {
    const dist = await fixture(t);
    await assert.rejects(retainSiteAssets(opts(dist, server(assets, {}))), /Invalid retained asset/);
  }
});

test("same-name changed content, missing active references and malformed JSON fail closed", async t => {
  const collision = await fixture(t, { [oldName]: "new" });
  await assert.rejects(retainSiteAssets(opts(collision, server([entry(oldName, "old")], {}))), /collision/);
  const absent = await fixture(t);
  await assert.rejects(retainSiteAssets(opts(absent, server([], {}))), /unretained asset/);
  const malformed = await fixture(t);
  await assert.rejects(retainSiteAssets(opts(malformed, server([], {}, newName, p => p === RETAINED_ASSET_MANIFEST ? new Response("{bad", { headers: { "content-type": "application/json" } }) : undefined))), SyntaxError);
});

test("network failure, redirects and non-HTTPS origins cannot create a ready manifest", async t => {
  const dist = await fixture(t);
  await assert.rejects(retainSiteAssets(opts(dist, async () => { throw new Error("network failed"); })), /network failed/);
  await assert.rejects(retainSiteAssets(opts(dist, async () => new Response(null, { status: 302 }))), /Cannot read/);
  for (const origin of ["http://example.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test/?secret=x"]) {
    await assert.rejects(retainSiteAssets({ ...opts(dist, server([], {})), siteUrl: origin }), /HTTPS origin/);
  }
});

test("oversized streamed manifests stop before any retention file is published", async t => {
  const dist = await fixture(t);
  let cancelled = false;
  const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } });
  await assert.rejects(retainSiteAssets(opts(dist, fetcher)), /retention limit/);
  assert.equal(cancelled, true);
  await assert.rejects(readFile(join(dist, "assets/retained-releases.json")), /ENOENT/);
});
