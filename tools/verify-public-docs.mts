/**
 * Run against Vite dev or a preview of the production build:
 *   DOCS_BASE_URL=http://127.0.0.1:5173 node --import tsx tools/verify-public-docs.mts
 * QF_CHROME_PATH follows verify-lp.mts. Screenshots: .qa-artifacts/public-docs/.
 * Reads public pages only; never signs in or invokes inference/MCP/API writes.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

type Locale = "ja" | "en";
interface Article {
  slug: string;
  title: string;
  lead: string;
  sections: { id: string; title: string; code?: { language: string; text: string } }[];
}
const root = resolve(import.meta.dirname, "..");
const content = JSON.parse(await readFile(resolve(root, "public-docs/content.json"), "utf8")) as Record<Locale, Article[]>;
const base = new URL(process.argv[2] ?? process.env.DOCS_BASE_URL ?? "http://127.0.0.1:5173");
assert.ok(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "DOCS_BASE_URL must be an HTTP(S) URL without credentials");
const pathFor = (locale: Locale, slug: string): string => `/docs/${locale === "en" ? "en/" : ""}${slug ? `${slug}/` : ""}`;
const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
const output = resolve(root, ".qa-artifacts/public-docs");
await mkdir(output, { recursive: true });
const chromePath = process.env.QF_CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const results: string[] = [];
const errors: string[] = [];
const badResponses: string[] = [];
const forbiddenRequests: string[] = [];
let failures = 0;
function watch(page: Page): void {
  page.on("pageerror", error => errors.push(`${new URL(page.url()).pathname}: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`${new URL(page.url()).pathname}: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) forbiddenRequests.push(`${request.method()} ${request.url()}`);
  });
}
async function scenario(name: string, run: () => Promise<void>, page?: Page): Promise<void> {
  try {
    await run();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    if (page && !page.isClosed()) {
      await page.screenshot({ path: resolve(output, `failure-${name.replace(/[^a-z0-9-]/gi, "-")}.png`), fullPage: true }).catch(() => undefined);
    }
  }
  console.log(results.at(-1));
}
async function fits(page: Page): Promise<void> {
  const sizes = await page.evaluate("({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})") as { viewport: number; document: number; body: number };
  assert.ok(sizes.document <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `horizontal overflow ${JSON.stringify(sizes)}`);
}
async function visit(page: Page, locale: Locale, article: Article): Promise<void> {
  const path = pathFor(locale, article.slug);
  const response = await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${path} static response`);
  assert.equal(new URL(page.url()).pathname, path, "article path is preserved");
  assert.equal(await page.locator("html").getAttribute("lang"), locale);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://guilduo.com${path}`);
  const main = page.locator("main");
  assert.equal(await main.locator("h1").count(), 1);
  assert.equal(normalize(await main.locator("h1").innerText()), normalize(article.title));
  assert.ok(normalize(await main.innerText()).includes(normalize(article.lead)), "visible article lead");
  for (const section of article.sections) {
    assert.equal(await main.locator(`[id="${section.id}"]`).count(), 1, `section #${section.id}`);
    assert.ok(normalize(await main.innerText()).includes(normalize(section.title)), `visible ${section.id} heading`);
  }
  await fits(page);
}

try {
  // Entire static route matrix: neither rendering nor navigation needs JavaScript.
  for (const width of [320, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      watch(page);
      for (const locale of ["ja", "en"] as const) for (const article of content[locale]) {
        await scenario(`nojs-${locale}-${article.slug || "home"}-${width}`, async () => {
          await visit(page, locale, article);
          for (const section of article.sections.filter(section => section.code)) {
            const blocks = await page.locator("main pre code").allTextContents();
            assert.ok(blocks.includes(section.code!.text), "exact code survives without JS");
          }
          await page.screenshot({ path: resolve(output, `nojs-${locale}-${article.slug || "home"}-${width}.png`), fullPage: true });
        }, page);
      }
    } finally {
      await context.close();
    }
  }

  // Each interaction runs independently, preserving diagnostics when one fails.
  for (const width of [320, 768, 1440]) for (const locale of ["ja", "en"] as const) {
    const article = content[locale].find(candidate => candidate.slug && candidate.sections.some(section => section.code));
    assert.ok(article, `${locale} needs an article containing a copyable example`);
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
    try {
      const page = await context.newPage();
      watch(page);
      const label = `${locale}-${width}`;
      await scenario(`js-article-${label}`, async () => {
        await visit(page, locale, article);
        await page.screenshot({ path: resolve(output, `article-${label}.png`), fullPage: true });
      }, page);

      if (width <= 768) await scenario(`keyboard-menu-${label}`, async () => {
        const menu = page.locator("details.doc-nav");
        assert.equal(await menu.count(), 1, "native mobile navigation details");
        const summary = menu.locator("summary");
        await summary.focus();
        assert.equal(await page.evaluate("document.activeElement.matches('details.doc-nav summary')"), true);
        if (await menu.getAttribute("open") !== null) await summary.press("Enter");
        assert.equal(await menu.getAttribute("open"), null, "keyboard closes menu");
        await summary.press("Enter");
        assert.notEqual(await menu.getAttribute("open"), null, "keyboard opens menu");
        await summary.press("Tab");
        assert.equal(await page.evaluate("Boolean(document.activeElement && document.activeElement !== document.body && document.activeElement.closest('details.doc-nav'))"), true, "Tab reaches menu control");
        await fits(page);
        await page.screenshot({ path: resolve(output, `menu-${label}.png`), fullPage: true });
      }, page);

      await scenario(`search-${label}`, async () => {
        const search = page.locator("#docs-search");
        if (!await search.isVisible() && width === 320) {
          const summary = page.locator("details.doc-nav summary");
          await summary.press("Enter");
        }
        const status = page.locator('#docs-search-status[role="status"]');
        assert.equal(await status.count(), 1, "search has live status");
        await search.focus();
        await search.pressSequentially("MCP");
        const hits = page.locator("#docs-search-results a[href]");
        await hits.first().waitFor({ state: "visible", timeout: 10000 });
        const links = await Promise.all((await hits.all()).map(async link => {
          const href = await link.getAttribute("href");
          assert.ok(href, "search result href");
          return href;
        }));
        const prefix = pathFor(locale, "");
        for (const href of links) {
          const url = new URL(href, base);
          assert.ok(url.pathname.startsWith(prefix) && (locale === "en" || !url.pathname.startsWith("/docs/en/")), "search remains in selected language");
          assert.ok(content[locale].some(candidate => pathFor(locale, candidate.slug) === url.pathname), `known search result ${href}`);
          assert.equal((await context.request.get(url.href)).status(), 200, "search result serves static page");
        }
        assert.ok(links.some(href => {
          const path = new URL(href, base).pathname;
          return content[locale].some(candidate => pathFor(locale, candidate.slug) === path && /MCP/i.test(JSON.stringify(candidate)));
        }), "MCP results are backed by article content");
        const hitsStatus = normalize(await status.innerText());
        assert.ok(hitsStatus, "announced search hits");
        await fits(page);
        await page.screenshot({ path: resolve(output, `search-${label}.png`), fullPage: true });
        await search.fill("zzqfdocs_no_result_193847");
        await page.waitForFunction("document.querySelectorAll('#docs-search-results a[href]').length === 0 && /見つか|該当|一致.*(?:ない|ません)|no matching|no results|not found/i.test(document.querySelector('#docs-search-status')?.textContent || '')", undefined, { timeout: 10000 });
        assert.ok(normalize(await status.innerText()), "no-results status visible");
        await fits(page);
        await page.screenshot({ path: resolve(output, `search-empty-${label}.png`), fullPage: true });
        await search.fill("");
      }, page);

      await scenario(`copy-${label}`, async () => {
        await visit(page, locale, article);
        const button = page.locator("button[data-copy]").first();
        await button.waitFor({ state: "visible" });
        const expected = article.sections.find(section => section.code)!.code!.text;
        await button.focus();
        await button.press("Enter");
        await page.waitForFunction(`navigator.clipboard.readText().then(text => text === ${JSON.stringify(expected)})`, undefined, { timeout: 10000 });
        assert.equal(await page.evaluate("navigator.clipboard.readText()"), expected, "clipboard contains exact example");
        assert.ok(normalize(await page.locator('#docs-copy-status[role="status"]').textContent() ?? ""), "copy announces success");
        await fits(page);
        await page.screenshot({ path: resolve(output, `copy-${label}.png`), fullPage: true });
      }, page);

      await scenario(`language-${label}`, async () => {
        await visit(page, locale, article);
        const other: Locale = locale === "ja" ? "en" : "ja";
        const target = content[other].find(candidate => candidate.slug === article.slug);
        assert.ok(target, "article translation exists");
        const link = page.locator(`a[data-language-switch][href="${pathFor(other, article.slug)}"]`);
        if (!await link.isVisible() && width === 320) await page.locator("details.doc-nav summary").press("Enter");
        await link.focus();
        await Promise.all([page.waitForURL(url => url.pathname === pathFor(other, article.slug)), link.press("Enter")]);
        assert.equal(await page.locator("html").getAttribute("lang"), other);
        assert.equal(normalize(await page.locator("main h1").innerText()), normalize(target.title));
        await fits(page);
        await page.screenshot({ path: resolve(output, `language-${label}.png`), fullPage: true });
      }, page);

      await scenario(`theme-${label}`, async () => {
        await visit(page, locale, article);
        await page.locator("#docs-theme").selectOption("light");
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator("#docs-theme").inputValue(), "light", "theme preference persists");
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
        await fits(page);
        await page.screenshot({ path: resolve(output, `theme-light-${label}.png`), fullPage: true });
        await page.locator("#docs-theme").selectOption("dark");
        assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
      }, page);
    } finally {
      await context.close();
    }
  }
  // Expected transport and clipboard failures must leave the article usable.
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(`failure-path: ${error.message}`));
      let indexAttempts = 0;
      await context.route("**/docs/search-index.json", async route => {
        indexAttempts += 1;
        if (indexAttempts === 1) await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
        else await route.continue();
      });
      await scenario("search-failure-retry", async () => {
        const article = content.ja.find(candidate => candidate.slug === "");
        assert.ok(article);
        await visit(page, "ja", article);
        await page.locator("#docs-search").fill("MCP");
        await page.waitForFunction("document.querySelector('#docs-search-status')?.textContent === JSON.parse(document.querySelector('#docs-strings').textContent).searchError");
        assert.equal(await page.locator("main h1").isVisible(), true, "search failure preserves the article");
        await page.locator("details.doc-nav summary").click();
        assert.ok(await page.locator("details.doc-nav a[href]").first().isVisible(), "navigation remains available");
        await page.locator("details.doc-nav summary").click();
        await page.locator("#docs-search").fill("ＭＣＰ");
        await page.locator("#docs-search-results a").first().waitFor({ state: "visible" });
        assert.equal(indexAttempts, 2, "next query retries transport and normalizes full-width text");
        await fits(page);
      }, page);
      await scenario("clipboard-failure-manual-fallback", async () => {
        await page.addInitScript("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Test clipboard denied'); } } });");
        const article = content.ja.find(candidate => candidate.sections.some(section => section.code));
        assert.ok(article);
        await visit(page, "ja", article);
        await page.locator("button[data-copy]").first().click();
        await page.waitForFunction("document.querySelector('#docs-copy-status')?.textContent === JSON.parse(document.querySelector('#docs-strings').textContent).copyError");
        assert.equal(await page.locator("main pre code").first().textContent(), article.sections.find(section => section.code)!.code!.text);
        assert.equal(await page.locator("main pre").first().getAttribute("tabindex"), "0", "code remains keyboard reachable");
      }, page);
    } finally { await context.close(); }
  }
  await scenario("no-console-or-page-errors", async () => assert.deepEqual([...new Set(errors)], []));
  await scenario("no-failed-page-or-asset-responses", async () => assert.deepEqual([...new Set(badResponses)], []));
  await scenario("no-write-requests", async () => assert.deepEqual([...new Set(forbiddenRequests)], []));
} finally {
  await browser.close();
}
console.log(`Public Docs: ${results.length - failures}/${results.length} checks passed; screenshots: ${output}`);
if (failures) process.exitCode = 1;
