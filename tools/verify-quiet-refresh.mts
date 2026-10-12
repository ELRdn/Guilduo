import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";

const base = process.argv[2] || "http://127.0.0.1:5193";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".qa-artifacts/quiet-refresh-2026-10-02";
await mkdir(output, { recursive:true });
const fixture = await startRelayWorkerFixture(new URL(base).origin);
const browser = await chromium.launch({ executablePath:process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless:true });
const results: string[] = [];
const errors: string[] = [];
let release: (() => void) | undefined;
try {
  for (const agentId of ["codex", "dots"]) await fixture.web("/v1/agents", "POST", { agentId, displayName:agentId, allowedScopes:["quests:read", "agents:read"] });
  await fixture.mcp("link_agent", { agentId:"review-agent" });
  for (let i = 0; i < 30; i++) await fixture.web("/v1/quests", "POST", { kind:"todo", title:`Scroll task ${String(i).padStart(2, "0")}`, nextAction:"Keep the current reading position." });
  for (const width of [1440, 412]) {
    const page = await browser.newPage({ viewport:{ width, height:800 }, hasTouch:width <= 900, isMobile:width <= 900, reducedMotion:"reduce" });
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
    await page.locator(".rf-shell").waitFor();
    await page.keyboard.press("Escape");
    await page.locator('.rf-nav-item:has([data-domain="quests"]):visible').click();
    const scroll = () => page.evaluate<{ page:number; list:number; host:number }>(`(() => {
      const region = document.querySelector('.rf-screen-region[data-variant="portfolio"]');
      return { page:window.scrollY, list:region?.scrollTop ?? 0, host:document.querySelector(".rf-screen-host")?.scrollTop ?? 0 };
    })()`);
    await page.evaluate(`(() => {
      const region = document.querySelector('.rf-screen-region[data-variant="portfolio"]');
      if (innerWidth > 900) region.scrollTop = 450;
      else { window.scrollTo(0, 450); document.querySelector(".rf-screen-host").scrollTop = 450; }
    })()`);
    const before = await scroll();
    assert.ok(before.page > 100 || before.list > 100 || before.host > 100, `${width}: scroll fixture must be long enough`);
    await page.clock.fastForward(30001);
    await page.locator('.rf-shell[data-sync-state="synced"]').waitFor();
    assert.deepEqual(await scroll(), before, `${width}: scheduled refresh must preserve the reading position`);
    results.push(`${width}: scheduled refresh preserves document and portfolio scroll`);
    release = undefined;
    await page.route(`${fixture.baseUrl}/v1/workspace/bootstrap`, async route => {
      const response = await route.fetch();
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ response });
    });
    await page.evaluate("window.dispatchEvent(new Event('focus'))");
    await page.locator('.rf-shell[data-sync-state="syncing"]').waitFor();
    const deadline = Date.now() + 10000;
    while (!release && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(release, "the delayed read must reach the Worker");
    await page.evaluate(`(() => {
      const region = document.querySelector(innerWidth > 900 ? '.rf-screen-region[data-variant="portfolio"]' : '.rf-screen-host');
      region.scrollTop = 670;
    })()`);
    const moved = await scroll();
    (release as () => void)();
    await page.locator('.rf-shell[data-sync-state="synced"]').waitFor();
    assert.deepEqual(await scroll(), moved, `${width}: late response must retain movement made during the request`);
    await page.unroute(`${fixture.baseUrl}/v1/workspace/bootstrap`);
    results.push(`${width}: late responses keep the user's latest scroll position`);
    await page.screenshot({ path:`${output}/quests-${width}.png` });
    if (width > 900) {
      await page.locator(".rf-rail-utility:has(.rf-settings-mark)").click();
      const card = page.locator('.rf-set-connection-card[data-authorized="true"]').first();
      await card.locator(".rf-set-connection-actions button").first().click();
      await card.locator('button[data-agent-id="codex"]').click();
      await card.locator('button[data-agent-id="dots"]').click();
      assert.equal(await card.locator('.rf-set-agent-picker-option[aria-pressed="true"]').count(), 3);
      await page.clock.fastForward(30001);
      assert.equal(await card.locator('.rf-set-agent-picker-option[aria-pressed="true"]').count(), 3, "polling does not erase the membership draft");
      const save = page.waitForResponse(response => response.request().method() === "PUT" && response.url().includes("/connections/"));
      await card.locator(".rf-set-agent-picker-actions .rf-primary-button").click();
      assert.equal((await save).status(), 200);
      await card.locator(".rf-set-agent-picker").waitFor({ state:"hidden" });
      const context = await fixture.mcp("get_current_agent_context", {}) as unknown as { allowedAgentIds:string[]; requiresAgentSelection:boolean };
      assert.deepEqual(context.allowedAgentIds, ["review-agent", "codex", "dots"]);
      assert.equal(context.requiresAgentSelection, true);
      for (const testWidth of [320, 412, 1440]) for (const locale of SUPPORTED_LOCALES) {
        await page.setViewportSize({ width:testWidth, height:800 });
        await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
        assert.equal(await card.locator(".rf-set-connection-permissions").textContent(), relayText("sharedAgentScopes", locale));
        assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('.rf-set-connection-card').scrollWidth <= document.querySelector('.rf-set-connection-card').clientWidth"), true, `${locale}/${testWidth}: shared Agent card overflow`);
        if (testWidth === 320 && locale === "de") await card.screenshot({ path:`${output}/shared-agents-de-320.png` });
      }
      await page.setViewportSize({ width, height:800 });
      await page.reload();
      await page.locator(".rf-rail-utility:has(.rf-settings-mark)").click();
      await card.locator(".rf-set-connection-actions button").first().click();
      assert.equal(await card.locator('.rf-set-agent-picker-option[aria-pressed="true"]').count(), 3);
      await page.screenshot({ path:`${output}/shared-agent-picker.png` });
      results.push("Settings saves three allowed Agents through the real Worker, preserves the edit draft, restores membership after reload, and fits 9 languages at 3 widths");
    }
    if (width <= 900) {
      await page.evaluate('window.scrollTo(0, 0); document.querySelector(".rf-screen-host").scrollTop = 0');
      const cdp = await page.context().newCDPSession(page);
      const heading = await page.locator(".rf-screen-host h1").first().boundingBox();
      assert.ok(heading);
      const x = Math.round(heading.x + heading.width / 2);
      const y = Math.round(heading.y + heading.height / 2);
      let reads = 0;
      let navigations = 0;
      page.on("request", request => { if (request.url().endsWith("/v1/workspace/bootstrap")) reads++; });
      page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
      const drag = async (dx: number, dy: number, cancelled = false) => {
        await cdp.send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{ x, y }] });
        for (let step = 1; step <= 5; step++) await cdp.send("Input.dispatchTouchEvent", { type:"touchMove", touchPoints:[{ x:x + Math.round(dx * step / 5), y:y + Math.round(dy * step / 5) }] });
        if (!cancelled && dx === 0 && dy === 110) {
          assert.equal(await page.locator(".rf-pull-refresh").textContent(), relayText("releaseToRefresh", "ja"));
          await page.screenshot({ path:`${output}/pull-release-412.png` });
        }
        await cdp.send("Input.dispatchTouchEvent", { type:cancelled ? "touchCancel" : "touchEnd", touchPoints:[] });
      };
      await drag(0, 36);
      await drag(90, 20);
      await drag(0, 110, true);
      assert.equal(reads, 0, "short, horizontal and cancelled gestures do not refresh");
      const response = page.waitForResponse(response => response.url().endsWith("/v1/workspace/bootstrap"));
      await drag(0, 110);
      await response;
      await page.locator('.rf-shell[data-sync-state="synced"]').waitFor();
      assert.equal(reads, 1, "one completed pull starts one read");
      assert.equal(navigations, 0, "pull never navigates or reloads the page");
      await page.locator(".rf-pull-refresh").waitFor({ state:"hidden" });
      results.push("Native Chrome touch: one pull reads once; short, horizontal and cancelled gestures are ignored without navigation");
      await page.locator(".rf-nav-more").click();
      await page.locator("[data-workspace-refresh]").focus();
      const keyboardRefresh = page.waitForResponse(response => response.url().endsWith("/v1/workspace/bootstrap"));
      await page.keyboard.press("Enter");
      await keyboardRefresh;
      await page.locator('.rf-shell[data-sync-state="synced"]').waitFor();
      assert.equal(reads, 2, "keyboard alternative uses the same read path");
      assert.equal(await page.evaluate("document.activeElement?.matches('.rf-nav-more')"), true);
      assert.equal(navigations, 0);
      results.push("More offers a keyboard-operable refresh, restores focus and never navigates");
      await cdp.detach();
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS ${results.length} quiet refresh scenarios`);
} finally { release?.(); await browser.close(); await fixture.close(); }
