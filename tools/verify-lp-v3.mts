/**
 * Public LPv3 browser acceptance:
 *   tsx tools/verify-lp-v3.mts [origin]   (default http://127.0.0.1:5189)
 * Also runs through npm run lp:verify. QF_CHROME_PATH follows existing QA tools.
 * Screenshots: .qa-artifacts/lp-v3/. No login, inference or network writes.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

type Locale = "ja" | "en";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:5189");
assert.ok(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "base must be an HTTP(S) origin without credentials");
assert.equal(base.pathname, "/", "base must be an origin");
const origin = base.origin;
const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".qa-artifacts/lp-v3");
await mkdir(output, { recursive: true });
const contract = JSON.parse(await readFile(resolve(root, "api/mcp-tools.json"), "utf8")) as { tools: unknown[] };
const browser = await chromium.launch({
  executablePath: process.env.QF_CHROME_PATH ?? (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"),
  headless: true,
});
const errors: string[] = [];
const unsafeRequests: string[] = [];
const badResponses: string[] = [];
let checks = 0;
let failures = 0;
const pathFor = (locale: Locale): string => locale === "en" ? "/lp/en/" : "/lp/";
const canonicalFor = (locale: Locale): string => `https://guilduo.com${locale === "en" ? "/lp/en/" : "/"}`;
const docsFor = (locale: Locale): string => `/docs/${locale === "en" ? "en/" : ""}`;
const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

async function scenario(name: string, page: Page | undefined, run: () => Promise<void>): Promise<void> {
  checks += 1;
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, `failure-${name}.png`), fullPage: true }).catch(() => undefined);
  }
}
async function instrument(context: BrowserContext): Promise<void> {
  // Block unexpected remote requests and writes before sending them.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      unsafeRequests.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    // Cloudflare rewrites the official JA root to /lp/. Local Vite serves the
    // legacy app at root, so emulate only this route for language-link testing.
    if (local && request.isNavigationRequest() && url.pathname === "/") {
      await route.fulfill({ status: 302, headers: { location: `/lp/${url.search}` }, body: "" });
      return;
    }
    await route.continue();
  });
}
function watch(page: Page): void {
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`); });
  page.on("response", response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
}
async function fits(page: Page, phase: string): Promise<void> {
  const sizes = await page.evaluate("({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth})") as { width: number; html: number; body: number };
  assert.ok(sizes.html <= sizes.width + 1 && sizes.body <= sizes.width + 1, `${phase}: horizontal overflow ${JSON.stringify(sizes)}`);
}
async function visit(page: Page, locale: Locale, js = true): Promise<void> {
  const response = await page.goto(new URL(pathFor(locale), base).href, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "LP response");
  assert.equal(await page.locator("html").getAttribute("lang"), locale);
  if (js) await page.locator('html[data-demo-ready="true"]').waitFor();
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), canonicalFor(locale));
  assert.equal(await page.locator('meta[property="og:url"]').getAttribute("content"), canonicalFor(locale));
  assert.equal(await page.locator('meta[name="twitter:url"]').getAttribute("content"), canonicalFor(locale));
  for (const lang of ["ja", "en", "x-default"] as const) {
    assert.equal(await page.locator(`link[rel="alternate"][hreflang="${lang}"]`).getAttribute("href"), canonicalFor(lang === "en" ? "en" : "ja"));
  }
  const robots = await page.locator('meta[name="robots"]').all();
  for (const meta of robots) assert.doesNotMatch(await meta.getAttribute("content") ?? "", /noindex|nofollow/i);
  assert.equal(await page.locator("main h1").count(), 1);
  assert.match(await page.locator("#hero-title").innerText(), locale === "ja" ? /人間だけが/ : /Humans aren’t/);
  for (const id of ["experience-title", "mcp-title", "guild-title", "open-title", "final-title"]) {
    assert.ok(normalize(await page.locator(`#${id}`).textContent() ?? ""), `static ${id}`);
  }
  assert.equal(await page.locator(".hero-v3").count(), 1, "LPv3 hero, not an app fallback");
  assert.equal(await page.locator("[data-relay-scene]").count(), 1, "LPv3 relay scene");
  // Vite hashes image names in the built HTML; dev retains the source path.
  const brandSelector = 'img[src*="guilduo-mark-gold"][src$=".svg"]';
  const brands = page.locator(brandSelector);
  assert.ok(await brands.count() >= 4, "approved brand marks");
  const loaded = await page.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(brandSelector)})).every(image => image.complete && image.naturalWidth > 0)`) as boolean;
  assert.ok(loaded, "brand images load");
  assert.equal(await page.locator('meta[property="og:image"]').getAttribute("content"), "https://guilduo.com/assets/brand/og-guilduo.png");
  assert.match(await page.locator(".demo-caption").innerText(), locale === "ja" ? /保存|接続/ : /nothing connects|saves data/i);
  for (const link of await page.locator("[data-join-cta]").all()) assert.equal(await link.getAttribute("href"), "https://app.guilduo.com/");
  if (js) for (const count of await page.locator("[data-tool-count]").all()) assert.equal((await count.innerText()).trim(), String(contract.tools.length));
  await fits(page, "initial");
}
async function docsLinks(page: Page, locale: Locale): Promise<void> {
  const path = docsFor(locale);
  assert.equal(await page.locator(`.site-nav nav a[href="${path}"]`).count(), 1, "header Docs entry");
  const footer = page.locator(`.site-footer a[href="${path}"]`);
  assert.equal(await footer.count(), 1, "footer Docs entry");
  assert.ok(await footer.isVisible(), "Docs entry visible on mobile too");
  const response = await page.context().request.get(new URL(path, base).href);
  assert.equal(response.status(), 200, "Docs destination response");
  const html = await response.text();
  assert.match(html, /<main\b[^>]*class="doc-main"/, "Docs destination contains static article, not fallback");
  assert.ok(html.includes(`rel="canonical" href="https://guilduo.com${path}"`), "Docs canonical");
}
async function settled(page: Page, state: string): Promise<void> {
  await page.locator(`#experience[data-state="${state}"][data-busy="false"]`).waitFor({ state: "attached" });
  await fits(page, state);
}
async function action(page: Page, name: string, reply?: string): Promise<void> {
  const scope = reply ? page.locator(`[data-reply-for="${reply}"]`) : page.locator(".demo-caption");
  const button = name === "start" ? page.locator('[data-action="start"]') : scope.locator(`[data-action="${name}"]`);
  await button.click();
}
async function restart(page: Page): Promise<void> {
  await action(page, "restart");
  await settled(page, "intro");
  assert.equal(await page.locator("[data-phone]").getAttribute("data-phone"), "bug");
  assert.equal(await page.locator("[data-phone]").getAttribute("data-safe"), "false");
  for (const card of ["choose", "pushback", "device"]) assert.notEqual(await page.locator(`[data-card="${card}"]`).getAttribute("hidden"), null);
  assert.equal(await page.locator("[data-log] .xp-idle").count(), 1, "restart restores idle log");
  assert.equal(await page.locator('[data-option][data-picked="true"]').count(), 0);
  assert.equal(await page.locator('[data-option][data-declined="true"]').count(), 0);
  assert.equal(await page.locator("[data-reply]:not([hidden])").count(), 0, "restart clears replies");
}

try {
  for (const js of [true, false]) for (const width of [320, 375, 414, 768, 1280, 1440]) for (const locale of ["ja", "en"] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: js, reducedMotion: "reduce" });
    try {
      await instrument(context);
      const page = await context.newPage(); watch(page);
      await scenario(`${js ? "responsive" : "nojs"}-${locale}-${width}`, page, async () => {
        await visit(page, locale, js);
        await docsLinks(page, locale);
        if (!js) {
          assert.ok(await page.locator("#experience noscript p").isVisible(), "visible no-JS demo explanation");
          assert.ok(normalize(await page.locator("#experience noscript p").innerText()).length > 40);
          assert.equal(await page.locator("html").getAttribute("data-demo-ready"), null);
        }
        await page.screenshot({ path: resolve(output, `${js ? "responsive" : "nojs"}-${locale}-${width}.png`), fullPage: true });
      });
    } finally { await context.close(); }
  }

  for (const width of [320, 1440]) for (const locale of ["ja", "en"] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    try {
      await instrument(context);
      const page = await context.newPage(); watch(page);
      const label = `${locale}-${width}`;
      await scenario(`language-theme-${label}`, page, async () => {
        await visit(page, locale);
        const theme = page.locator("[data-theme-control]");
        await theme.selectOption("light");
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await theme.inputValue(), "light");
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
        const other: Locale = locale === "ja" ? "en" : "ja";
        const link = page.locator(`.lang-switch a[hreflang="${other}"]`);
        assert.equal(await link.getAttribute("href"), other === "en" ? "/lp/en/" : "/");
        await link.focus();
        await Promise.all([page.waitForURL(url => url.pathname === (other === "ja" && !local ? "/" : pathFor(other))), link.press("Enter")]);
        await page.locator('html[data-demo-ready="true"]').waitFor();
        assert.equal(await page.locator("html").getAttribute("lang"), other);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), canonicalFor(other));
        assert.equal(await theme.inputValue(), "light", "theme persists across language switch");
        await fits(page, "language-light");
        await page.screenshot({ path: resolve(output, `light-language-${label}.png`), fullPage: true });
        await theme.selectOption("system");
        await page.emulateMedia({ colorScheme: "light" });
        await page.waitForFunction('document.documentElement.dataset.theme === "light"');
        await page.emulateMedia({ colorScheme: "dark" });
        await page.waitForFunction('document.documentElement.dataset.theme === "dark"');
        await theme.selectOption("dark");
      });

      for (const choice of ["a", "b", "c"] as const) await scenario(`demo-${choice}-${label}`, page, async () => {
        await visit(page, locale);
        await action(page, "start");
        await settled(page, "choose");
        assert.equal(await page.locator("[data-reply-for=choose]").isVisible(), true);
        await action(page, `choose_${choice}`, "choose");
        if (choice === "c") {
          await settled(page, "pushback");
          assert.equal(await page.locator("[data-card=pushback]").isVisible(), true);
          assert.equal(await page.locator("[data-option=c]").getAttribute("data-declined"), "true");
          assert.equal(await page.locator('[data-reply-for=pushback] [data-action=choose_c]').count(), 0, "pushback requires safer choice");
          await page.locator("#experience").screenshot({ path: resolve(output, `pushback-${label}.png`) });
          await action(page, "choose_a", "pushback");
        }
        await settled(page, "device_check");
        const selected = choice === "b" ? "b" : "a";
        assert.equal(await page.locator("[data-phone]").getAttribute("data-phone"), `fix-${selected}`);
        assert.equal(await page.locator(`[data-option=${selected}]`).getAttribute("data-picked"), "true");
        await page.waitForTimeout(250);
        assert.equal(await page.locator("#experience").getAttribute("data-state"), "device_check", "agent waits for real-device reply");
        if (width === 320) {
          await page.locator('button[data-view="agent"]').click();
          assert.equal(await page.locator(".xp").getAttribute("data-view"), "agent");
          assert.equal(await page.locator(".xp-agent").isVisible(), true);
          await fits(page, "agent tab");
          await page.locator('button[data-view="guilduo"]').click();
          assert.equal(await page.locator(".xp-guilduo").isVisible(), true);
        }
        if (choice === "c") {
          await action(page, "broken", "device");
          await settled(page, "recheck");
          assert.equal(await page.locator("[data-phone]").getAttribute("data-safe"), "true");
          assert.match(await page.locator("[data-device-key]").textContent() ?? "", /REVIEW \/ 004/);
          assert.equal(await page.locator('[data-action="broken"]').isVisible(), false);
          await page.locator("#experience").screenshot({ path: resolve(output, `recheck-${label}.png`) });
        }
        await action(page, "works", "device");
        await settled(page, "complete");
        // Completing switches to the agent log on phones. Replay lives in the
        // Guilduo pane, reached through the visible tab just like a user.
        if (width === 320) await page.locator('button[data-view="guilduo"]').click();
        assert.equal(await page.locator("[data-replay]").isVisible(), true);
        assert.match(await page.locator("[data-phone-version]").textContent() ?? "", choice === "c" ? /^v3/ : /^v2/);
        const log = await page.locator("[data-log]").textContent() ?? "";
        for (const tool of ["get_quest", "request_human_review", "list_human_requests", "update_quest"]) assert.ok(log.includes(tool), `demo tool ${tool}`);
        assert.match(log, /lifecycleState:\s*"completed"/);
        await page.locator("#experience").screenshot({ path: resolve(output, `complete-${choice}-${label}.png`) });
        await restart(page);
        // Restart during pending work must also cancel delayed agent progress.
        await action(page, "start");
        await page.locator('#experience[data-state="investigating"]').waitFor({ state: "attached" });
        await restart(page);
        await page.waitForTimeout(650);
        assert.equal(await page.locator("#experience").getAttribute("data-state"), "intro");
        assert.equal(await page.locator("[data-log] .xp-idle").count(), 1);
      });
    } finally { await context.close(); }
  }
  await scenario("zero-js-errors", undefined, async () => assert.deepEqual([...new Set(errors)], []));
  await scenario("zero-remote-or-write-requests", undefined, async () => assert.deepEqual([...new Set(unsafeRequests)], []));
  await scenario("zero-http-errors", undefined, async () => assert.deepEqual([...new Set(badResponses)], []));
} finally { await browser.close(); }
console.log(`Public LPv3: ${checks - failures}/${checks} checks passed; screenshots: ${output}`);
if (failures) process.exitCode = 1;
