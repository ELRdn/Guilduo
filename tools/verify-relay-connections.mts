import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { saveIntegrationAccount } from "../worker/src/integration-store.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { migrateState } from "../server/questforge-domain.ts";

const base = process.argv[2] || "http://127.0.0.1:5183";
const built = process.argv.includes("--built");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const results: string[] = [], errors: string[] = [];
await mkdir(".qa-artifacts/relay-connections", { recursive:true });
const browser = await chromium.launch({ executablePath:process.env.QF_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless:true });
try {
  for (const locale of SUPPORTED_LOCALES) {
    for (const width of [320, 412, 1024, 1440]) {
      const context = await browser.newContext({ viewport:{ width, height:900 }, locale, reducedMotion:"reduce" });
      await context.addInitScript(value => localStorage.setItem("questforge-locale", value), locale);
      const page = await context.newPage();
      console.log(`Checking ${locale}/${width}`);
      page.on("pageerror", error => { errors.push(error.message); console.error("Page error:", error.message); });
      await page.goto(`${base}${built ? "/next/relay-forge/" : "/interaction-lab/relay-forge/"}?fixture=1&theme=dark`);
      await page.locator(".rf-rail .rf-nav-item").first().waitFor();
      await page.keyboard.press("Escape");
      if (width < 901) await page.locator(".rf-nav-more").click();
      await page.locator('.rf-nav-item:has(.rf-nav-glyph[data-domain="connections"])').click();
      assert.equal(await page.locator(".rf-screen-question").textContent(), relayText("connectionQuestion", locale));
      const filter = page.getByRole("radiogroup", { name:relayText("filterStatus", locale) });
      await filter.getByRole("radio").first().focus();
      await page.keyboard.press("End");
      assert.equal(await filter.getByRole("radio").last().getAttribute("aria-checked"), "true");
      assert.equal(await filter.getByRole("radio").last().evaluate(el => el.ownerDocument.activeElement === el), true);
      await page.keyboard.press("Home");
      assert.equal(await filter.getByRole("radio").first().evaluate(el => el.ownerDocument.activeElement === el), true);
      if (width >= 901) {
        assert.equal(await page.locator('.rf-c-row[tabindex="0"]').count(), 1);
        await page.locator('.rf-c-row[tabindex="0"]').focus();
        for (const key of ["End", "Home", "ArrowDown", "ArrowUp"]) {
          await page.keyboard.press(key);
          await page.waitForFunction('document.activeElement?.matches(".rf-c-row[data-selected=true]") === true');
          assert.equal(await page.locator('.rf-c-row[data-selected="true"]').evaluate(el => el.ownerDocument.activeElement === el), true);
        }
        await page.locator('.rf-c-row[data-connection-id="google-tasks"]').click();
      } else {
        await page.locator('.rf-c-card[data-connection-id="google-tasks"]').click();
        await page.waitForFunction('document.activeElement?.matches(".rf-c-back") === true');
      }
      await page.locator('[data-connection-action="preview"]').click();
      await page.locator('.rf-c-result[data-tone="preview"]').waitFor();
      assert.ok((await page.locator(".rf-c-preview-list").textContent())?.includes(relayText("connectionCreated", locale)));
      assert.equal(await page.locator('.rf-c-scope[data-state="satisfied"]').count(), 0);
      assert.equal(await page.locator('[data-connection-action="sync"]').isEnabled(), true);
      await page.locator('[data-connection-action="disconnect"]').click();
      assert.ok((await page.locator(".rf-confirm-impact").textContent())?.includes(relayText("connectionGoogleRevoke", locale)));
      assert.equal(await page.locator(".rf-danger-button").evaluate(el => el.ownerDocument.activeElement === el), false);
      assert.equal(await page.evaluate('(function(){return document.documentElement.scrollWidth <= innerWidth && Array.from(document.querySelectorAll(".rf-c-row,.rf-c-cell,.rf-c-detail-name,.rf-c-actions button,.rf-confirm,.rf-c-card")).every(el => { const r=el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; });})()'), true, `${locale}/${width}: clipping or overflow`);
      assert.equal(await page.evaluate('(function(){return Array.from(document.querySelectorAll(".rf-c-actions button")).every(button => {const range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect(),rect=button.getBoundingClientRect();return text.top >= rect.top && text.bottom <= rect.bottom && text.left >= rect.left && text.right <= rect.right;});})()'), true, `${locale}/${width}: action text exceeds its button`);
      if (["de", "ru"].includes(locale)) await page.screenshot({ path:`.qa-artifacts/relay-connections/${locale}-${width}${built ? "-built" : ""}.png`, fullPage:true });
      if (width < 901) {
        await page.locator(".rf-c-back").click();
        await page.waitForFunction('document.activeElement?.getAttribute("data-connection-id") === "google-tasks"');
        await page.locator('.rf-c-card[data-connection-id="google-calendar"]').click();
      } else await page.locator('.rf-c-row[data-connection-id="google-calendar"]').click();
      assert.equal(await page.locator('.rf-confirm').count(), 0);
      assert.equal(await page.locator('[data-connection-action="sync"]').isDisabled(), true);
      results.push(`${locale}/${width}: localized controls, roving focus, scope semantics, confirmation, isolated preview and fit`);
      await context.close();
    }
  }
  if (!built) {
    const fixture = await startRelayWorkerFixture(base);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === "https://tasks.googleapis.com" && url.pathname === "/tasks/v1/lists/test-list/tasks") return Response.json({ items:[{ id:"remote-task", title:"Imported Worker task", status:"needsAction", updated:"2026-10-02T00:00:00.000Z", etag:"test-etag" }] });
      if (url.origin === "https://oauth2.googleapis.com" && url.pathname === "/revoke") return new Response(null, { status:200 });
      if (url.hostname.endsWith("googleapis.com")) throw new Error("Unexpected isolated provider request");
      return originalFetch(input, init);
    };
    const context = await browser.newContext({ viewport:{ width:1440, height:900 }, reducedMotion:"reduce" });
    try {
      fixture.env.GOOGLE_CLIENT_ID = "isolated-test-client";
      fixture.env.GOOGLE_CLIENT_SECRET = "isolated-test-secret";
      for (const id of ["google-calendar", "google-tasks"]) await saveIntegrationAccount(fixture.env, fixture.uid, id, { status:"connected", accessToken:"isolated-provider-test-token", tokenExpiresAt:Date.now()+3600000, settings:{ taskListId:"test-list", autoSync:false } });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
      await page.getByRole("button", { name:"Connections", exact:true }).click();
      await page.locator('.rf-c-row[data-connection-id="google-tasks"]').click();
      await page.evaluate('window.dispatchEvent(new CustomEvent("test:connection-preview-failure", { detail:true }))');
      await page.locator('[data-connection-action="preview"]').click();
      await page.locator('.rf-c-result[role="alert"]').waitFor();
      assert.equal(await page.locator('.rf-c-result').textContent(), relayText("connectionFailed", "ja"));
      assert.equal(await page.locator('[data-connection-action="preview"]').isEnabled(), true);
      await page.evaluate('window.dispatchEvent(new CustomEvent("test:connection-preview-failure", { detail:false }))');
      results.push("HTTP runtime: rejected port Promise is localized and releases action guard");
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let syncRequests = 0;
      await page.route(`${fixture.baseUrl}/v1/integrations/google-tasks/sync`, async route => { syncRequests++; await gate; await route.continue(); });
      await page.locator('[data-connection-action="preview"]').click();
      await page.waitForFunction('document.querySelector(".rf-c-result[data-tone=busy]") !== null');
      await page.locator('.rf-c-row[data-connection-id="google-calendar"]').click();
      await page.evaluate('window.dispatchEvent(new CustomEvent("test:locale", { detail:"en" }))');
      assert.equal(await page.locator('.rf-c-row[data-selected="true"]').evaluate(el => el.ownerDocument.activeElement === el), true);
      await page.evaluate('(function(){document.querySelector("[data-connection-action=preview]").dispatchEvent(new MouseEvent("click",{bubbles:true}));document.querySelector("[data-connection-action=disconnect]").dispatchEvent(new MouseEvent("click",{bubbles:true}));})()');
      assert.equal(await page.locator('.rf-confirm').count(), 0);
      release();
      await page.waitForFunction('document.querySelector("[data-connection-action=preview]")?.disabled === false');
      assert.equal(syncRequests, 1);
      assert.equal(await page.locator('.rf-c-result').count(), 0);
      assert.equal(await page.locator('[data-connection-action="sync"]').isDisabled(), true);
      await page.evaluate('window.dispatchEvent(new CustomEvent("test:locale", { detail:"ja" }))');
      results.push("HTTP Worker: delayed preview cannot unlock another connection or permit duplicate actions");
      await page.unroute(`${fixture.baseUrl}/v1/integrations/google-tasks/sync`);
      await page.locator('.rf-c-row[data-connection-id="google-tasks"]').click();
      await page.locator('[data-connection-action="preview"]').click();
      await page.locator('.rf-c-result[data-tone="preview"]').waitFor();
      assert.ok((await page.locator('.rf-c-preview-list').textContent())?.includes("1"));
      let failRefresh = true, mutations = 0;
      await page.route(`${fixture.baseUrl}/v1/integrations`, route => failRefresh ? route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ error:{ code:"offline", message:"isolated refresh failure" } }) }) : route.continue());
      await page.route(`${fixture.baseUrl}/v1/integrations/google-tasks/sync`, async route => { if (!route.request().postDataJSON().dryRun) mutations++; await route.continue(); });
      await page.locator('[data-connection-action="sync"]').click();
      await page.locator('[data-connection-action="reload"]').waitFor();
      assert.equal(mutations, 1);
      await page.locator('.rf-c-row[data-connection-id="google-calendar"]').click();
      assert.equal(await page.locator('[data-connection-action="reload"]').count(), 1);
      assert.equal(await page.locator('[data-connection-action="preview"]').isDisabled(), true);
      let reviewWrites = 0;
      await page.route(`${fixture.baseUrl}/v1/quests/*/review-response`, async route => { reviewWrites++; await route.continue(); });
      await page.locator('.rf-human-inbox-trigger').first().click();
      const requestCard = page.locator('.rf-human-request').first();
      await requestCard.locator('summary').click();
      assert.equal(await requestCard.locator('.rf-human-request-actions button:enabled').count(), 0);
      await requestCard.locator('.rf-human-request-actions button').first().dispatchEvent("click");
      assert.equal(reviewWrites, 0);
      await page.locator('.rf-human-inbox header button').click();
      results.push("HTTP Worker: refresh failure also holds Human feedback writes, including synthetic clicks");
      failRefresh = false;
      const stored = await readState(fixture.env, fixture.uid);
      assert.ok(stored.payload.state);
      const storedState = migrateState(stored.payload.state);
      storedState.tasks.push(...Array.from({ length:201 }, (_, index) => ({ ...structuredClone(fixture.first.source), id:`connections-pagination-${index}`, title:`Pagination ${index}` })));
      await writeState(fixture.env, fixture.uid, { state:storedState, schemaVersion:7, clientUpdatedAt:new Date().toISOString() }, stored.etag);
      const cursors: string[] = [];
      page.on("request", request => { const url = new URL(request.url()); if (url.pathname === "/v1/quests" && url.searchParams.has("cursor")) cursors.push(url.searchParams.get("cursor")!); });
      await page.locator('[data-connection-action="reload"]').click();
      await page.waitForFunction('document.querySelector("[data-connection-action=reload]") === null');
      assert.equal(mutations, 1);
      await page.getByRole("button", { name:"Quests", exact:true }).click();
      await page.getByText("Imported Worker task", { exact:true }).first().waitFor();
      await page.getByText("Pagination 200", { exact:true }).first().waitFor();
      assert.ok(cursors.includes("200"));
      results.push("HTTP Worker: sync imports real task, failed refresh holds writes across selection, read retry applies data without repeating mutation");
      results.push("HTTP Worker: read recovery follows real pagination beyond 200 Quests and preserves later records");
      await page.getByRole("button", { name:"Connections", exact:true }).click();
      await page.locator('.rf-c-row[data-connection-id="google-tasks"]').click();
      await page.locator('[data-connection-action="disconnect"]').click();
      await page.locator('.rf-confirm .rf-danger-button').click();
      await page.waitForFunction('document.querySelector("[data-connection-action=reconnect]") !== null', undefined, { timeout:10000 }).catch(async error => { await page.screenshot({ path:".qa-artifacts/relay-connections/disconnect-failure.png" }); console.log(await page.locator(".rf-screen--connections").textContent()); throw error; });
      for (const id of ["google-calendar", "google-tasks"]) assert.equal(await page.locator(`.rf-c-row[data-connection-id="${id}"]`).getAttribute("data-health"), "not_connected");
      let redirected = false;
      await page.route("https://accounts.google.com/o/oauth2/v2/auth?*", async route => { redirected = Boolean(new URL(route.request().url()).searchParams.get("state")); await route.fulfill({ status:200, contentType:"text/html", body:"<p>Isolated provider consent</p>" }); });
      await page.locator('[data-connection-action="reconnect"]').click();
      await page.waitForURL("https://accounts.google.com/o/oauth2/v2/auth?*");
      assert.equal(redirected, true);
      results.push("HTTP Worker: shared Google disconnect refreshes both services; reconnect reaches intercepted consent with state");
    } finally { globalThis.fetch = originalFetch; await context.close(); await fixture.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(`.qa-artifacts/relay-connections/results${built ? "-built" : ""}.json`, JSON.stringify({ results, errors, scope:"Local Chrome with isolated Worker; provider responses and consent intercepted. Real OAuth/device acceptance pending." }, null, 2));
  console.log(`PASS ${results.length} Connections checks`);
} finally { await browser.close(); }
