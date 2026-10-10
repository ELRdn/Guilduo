/** Read-only static-page checks. No login, inference, MCP writes or analytics uploads. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { readDocsContent, solutionPath, solutionSlugs } from "../public-docs/build.ts";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:4173");
assert.ok(["http:", "https:"].includes(base.protocol) && !base.username && !base.password && base.pathname === "/", "HTTP origin required");
const output = resolve(import.meta.dirname, "../.qa-artifacts/solutions");
await mkdir(output, { recursive: true });
const pages = (["ja", "en"] as const).flatMap(locale => solutionSlugs.map(slug => ({ locale, slug, path: solutionPath(locale, slug) })));
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
const results: object[] = [];
let blockedRum = 0;
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, reducedMotion: "reduce" });
    await context.route("**/*", async route => {
      const r = route.request(); const url = new URL(r.url());
      if (url.origin === base.origin && url.pathname === "/cdn-cgi/rum" && r.method() === "POST") { blockedRum++; await route.fulfill({ status: 204, body: "" }); }
      else { assert.ok(["GET", "HEAD"].includes(r.method()), "unexpected write " + r.method()); await route.continue(); }
    });
    for (const item of pages) {
      const page = await context.newPage();
      const errors: string[] = []; const responses: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("response", r => { if (r.status() >= 400) responses.push(r.status() + " " + r.url()); });
      const response = await page.goto(base.origin + item.path, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, item.path);
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator("html").getAttribute("lang"), item.locale);
      const text = await page.locator("main").innerText();
      assert.ok(text.length > 1200, "substantive static body");
      assert.ok(await page.locator("main a[href*='/docs/']").count() >= 2);
      assert.equal(await page.locator("link[rel=canonical]").getAttribute("href"), "https://guilduo.com" + item.path);
      for (const lang of ["ja", "en", "x-default"] as const) assert.equal(await page.locator('link[hreflang="' + lang + '"]').getAttribute("href"), "https://guilduo.com" + solutionPath(lang === "en" ? "en" : "ja", item.slug));
      assert.equal(await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false, "viewport overflow " + width + " " + item.path);
      for (const link of await page.locator('a[href^="#"]').all()) {
        const id = (await link.getAttribute("href"))!.slice(1);
        if (id) assert.equal(await page.locator('[id="' + id + '"]').count(), 1, "missing local fragment " + id);
      }
      if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(output, item.locale + "-" + item.slug + "-" + width + ".png"), fullPage: true });
      await page.keyboard.press("Tab");
      assert.ok(await page.locator("a:focus").count(), "keyboard skip link");
      await page.keyboard.press("Enter");
      assert.ok(page.url().endsWith("#main"), "keyboard skip target");
      const longLink = page.locator("main a[href*='github.com/']").first();
      if (await longLink.count()) {
        await longLink.evaluate(el => { el.textContent = "https://github.com/ELRdn/Guilduo/blob/42caab0fa1f396f15e4e1277f6e36dda1ac9bd04/skills/questforge-workflows/references/tools.md"; });
        assert.equal(await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false, "long source URL overflow");
      }
      assert.ok(await page.evaluate("Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)"), "images loaded");
      assert.deepEqual(errors, []); assert.deepEqual(responses, []);
      results.push({ test: "browser", path: item.path, width, javaScript: false, pass: true });
      await page.close();
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: true });
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === base.origin && url.pathname === "/cdn-cgi/rum" && request.method() === "POST") { blockedRum++; await route.fulfill({ status: 204, body: "" }); }
    else { assert.ok(["GET", "HEAD"].includes(request.method()), "unexpected write"); await route.continue(); }
  });
  for (const item of pages) {
    const page = await context.newPage(); const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base.origin + item.path, { waitUntil: "networkidle" });
    await page.locator('header a[hreflang="' + (item.locale === "ja" ? "en" : "ja") + '"]').click();
    assert.equal(new URL(page.url()).pathname, solutionPath(item.locale === "ja" ? "en" : "ja", item.slug));
    assert.equal(await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false);
    assert.deepEqual(errors, []);
    results.push({ test: "language", path: item.path, javaScript: true, pass: true });
    await page.close();
  }
  await context.close();
  const sitemap = await fetch(new URL("/sitemap.xml", base), { signal: AbortSignal.timeout(20000) });
  assert.equal(sitemap.status, 200);
  const sitemapText = await sitemap.text();
  const urls = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  const content = readDocsContent();
  assert.equal(urls.length, 4 + pages.length + content.ja.length + content.en.length);
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) {
    assert.equal(new URL(url).origin, "https://guilduo.com");
    const path = new URL(url).pathname;
    const servedPath = path === "/" && ["127.0.0.1", "localhost"].includes(base.hostname) ? "/lp/" : path;
    const served = await fetch(new URL(servedPath, base), { signal: AbortSignal.timeout(20000) });
    assert.equal(served.status, 200, path);
    const html = await served.text();
    assert.ok(html.includes('rel="canonical" href="' + url + '"'), "canonical body " + path);
    assert.match(html, /<h1\b/);
    if (path.startsWith("/solutions/")) assert.ok(html.includes('class="solution-main shell"'), "actual solution body");
    results.push({ test: "sitemap-url", path, pass: true });
  }
  for (const ua of ["Googlebot", "bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot"]) for (const item of pages) {
    const r = await fetch(new URL(item.path, base), { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(20000) });
    assert.equal(r.status, 200); assert.ok((await r.text()).includes('class="solution-main shell"'));
    results.push({ test: "user-agent-probe", ua, path: item.path, pass: true });
  }
  if (!["127.0.0.1", "localhost"].includes(base.hostname)) {
    for (const path of ["/solutions/not-a-page-seo-verification/", "/docs/not-a-page-seo-verification/"]) {
      const r = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
      assert.equal(r.status, 404, "real missing-page 404 " + path);
      results.push({ test: "real-404", path, pass: true });
    }
  }
  console.log("Solutions verified: " + results.length + " scenarios; blocked Cloudflare RUM uploads: " + blockedRum + ". User-agent probes are not verified crawler-IP visits.");
} finally {
  await writeFile(resolve(output, "results.json"), JSON.stringify({ base: base.origin, checkedAt: new Date().toISOString(), results, blockedRum }, null, 2));
  await browser.close();
}
