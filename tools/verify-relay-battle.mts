import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { fixtureBattleState } from "../interaction-lab/relay-forge/screens/battle-port.ts";

const base = process.argv[2] || "http://127.0.0.1:5183";
const built = process.argv.includes("--built");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const results: string[] = [], errors: string[] = [];
await mkdir(".qa-artifacts/relay-battle", { recursive:true });
const browser = await chromium.launch({ executablePath:process.env.QF_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless:true });
try {
  if (!process.argv.includes("--http-only")) for (const locale of SUPPORTED_LOCALES) for (const width of [320, 412, 1024, 1440]) {
    console.log(`Checking ${locale}/${width}`);
    const context = await browser.newContext({ viewport:{ width, height:900 }, locale, reducedMotion:"reduce" });
    const page = await context.newPage();
    try {
      await context.addInitScript(value => localStorage.setItem("questforge-locale", value), locale);
      page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
      await page.goto(`${base}${built ? "/next/relay-forge/" : "/interaction-lab/relay-forge/"}?fixture=1&theme=dark`);
      await page.locator(".rf-rail .rf-nav-item").first().waitFor();
      await page.keyboard.press("Escape");
      if (width < 901) await page.locator(".rf-nav-more").click();
      await page.locator('.rf-nav-item:has(.rf-nav-glyph[data-domain="battle"])').click();
      assert.equal(await page.locator(".rf-screen-question").textContent(), relayText("battleQuestion", locale));
      await page.locator('[data-command="attack"]').click();
      await page.locator('.rf-b-preview[data-phase="previewed"]').waitFor();
      await page.waitForFunction('document.activeElement?.getAttribute("data-battle-action") === "execute"');
      assert.ok((await page.locator(".rf-b-preview-note").textContent())?.includes(relayText("battlePreviewOnly", locale)));
      const clipping = await page.evaluate("(() => Array.from(document.querySelectorAll('.rf-b-command,.rf-b-preview,.rf-b-objective,.rf-b-event,.rf-b-deck-actions button,.rf-b-m-bar')).filter(element => element.getClientRects().length).flatMap(element => {\n        const r = element.getBoundingClientRect();\n        return r.left < -1 || r.right > innerWidth+1 || element.scrollWidth > element.clientWidth+1 ? [element.className] : [];\n      }))()");
      assert.deepEqual(clipping, [], `${locale}/${width}: overflow`);
      assert.equal(await page.evaluate("(() => Array.from(document.querySelectorAll('.rf-b-deck-actions button,.rf-b-m-bar button')).every(button => {\n        const range = document.createRange(); range.selectNodeContents(button);\n        const text = range.getBoundingClientRect(), r = button.getBoundingClientRect();\n        return text.top >= r.top && text.bottom <= r.bottom && text.left >= r.left && text.right <= r.right;\n      }))()"), true, `${locale}/${width}: clipped button text`);
      assert.equal(await page.locator('[role="meter"]').count(), 3);
      if (["de", "ru"].includes(locale)) await page.screenshot({ path:`.qa-artifacts/relay-battle/${locale}-${width}${built ? "-built" : ""}.png`, fullPage:true });
      await page.locator('[data-battle-action="execute"]').click();
      await page.locator('.rf-b-phase-value').filter({ hasText:"8" }).waitFor();
      assert.ok((await page.locator('.rf-b-event[data-channel="decision"]').first().textContent())?.includes(relayText("battleDecision", locale)));
      if (width < 901) {
        await page.locator('[data-battle-action="timeline"]').click();
        assert.equal(await page.locator("#rf-b-history").isVisible(), true);
        assert.equal(await page.locator('[data-battle-action="timeline"]').evaluate(el => el.ownerDocument.activeElement === el), true);
        await page.locator('[data-battle-action="timeline"]').click();
        assert.equal(await page.locator("#rf-b-history").isVisible(), false);
        assert.ok(await page.locator(".rf-b-source").count());
      }
      results.push(`${locale}/${width}: preview, execute, localized copy, focus, meters, MP sources, fit`);
    } catch (error) {
      await page.screenshot({ path:`.qa-artifacts/relay-battle/failure-${locale}-${width}.png`, fullPage:true });
      console.error(await page.locator("body").innerText());
      throw error;
    } finally { await context.close(); }
  }
  if (!built && !process.argv.includes("--matrix-only")) {
    const fixture = await startRelayWorkerFixture(new URL(base).origin);
    const context = await browser.newContext({ viewport:{ width:1440, height:900 }, reducedMotion:"reduce" });
    const page = await context.newPage();
    try {
      const original = await readState(fixture.env, fixture.uid);
      await writeState(fixture.env, fixture.uid, { state:fixtureBattleState(original.payload.state!.tasks), schemaVersion:7, clientUpdatedAt:new Date().toISOString() }, original.etag);
      page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
      await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
      await page.getByRole("button", { name:"Battle", exact:true }).click();
      await page.locator('[data-command="attack"]').waitFor();
      const commandsUrl = `${fixture.baseUrl}/v1/battle/commands`;
      let release!: () => void;
      let gate = new Promise<void>(done => { release = done; });
      const requests: Record<string, unknown>[] = [];
      await page.route(commandsUrl, async route => { requests.push(route.request().postDataJSON()); await gate; await route.continue(); });
      await page.locator('[data-command="attack"]').click();
      await page.waitForFunction('document.querySelector(".rf-b-preview")?.getAttribute("data-phase") === "previewing"');
      await page.locator('[data-battle-action="cancel"]').dispatchEvent("click");
      await page.locator('[data-command="guard"]').dispatchEvent("click");
      await page.locator('[data-battle-action="execute"]').dispatchEvent("click");
      assert.equal(await page.locator('[data-command="attack"]').getAttribute("aria-pressed"), "true");
      assert.equal(requests.length, 1);
      release(); await page.locator('.rf-b-preview[data-phase="previewed"]').waitFor();
      gate = new Promise<void>(done => { release = done; });
      await page.locator('[data-battle-action="execute"]').click();
      await page.waitForFunction('document.querySelector(".rf-screen--battle")?.getAttribute("aria-busy") === "true"');
      await page.locator('[data-battle-action="cancel"]').dispatchEvent("click");
      await page.locator('[data-battle-action="execute"]').dispatchEvent("click");
      await page.locator('[data-command="guard"]').dispatchEvent("click");
      assert.equal(requests.length, 2);
      release(); await page.locator('.rf-b-phase-value').filter({ hasText:"8" }).waitFor();
      assert.equal(requests[1]!.expectedTurn, 7);
      assert.match(String(requests[1]!.commandId), /^relay-forge-[0-9a-f-]{36}$/);
      await page.unroute(commandsUrl);
      results.push("HTTP Worker: pending preview/execution rejects cancel, switch and synthetic duplicate submit; execution uses preview turn and unique ID");

      await page.locator('[data-command="attack"]').click();
      await page.locator('.rf-b-preview[data-phase="previewed"]').waitFor();
      await fixture.web("/v1/battle/commands", "POST", { command:"guard", expectedTurn:8, commandId:crypto.randomUUID(), dryRun:false });
      await page.locator('[data-battle-action="execute"]').click();
      await page.locator('.rf-b-preview[role="alert"]').waitFor();
      assert.ok((await page.locator('.rf-b-preview-body').textContent())?.includes(relayText("battleStale", "ja")));
      assert.equal(await page.locator('[data-command="attack"]').isDisabled(), true);
      await page.locator('[data-battle-action="refresh"]').click();
      await page.locator('.rf-b-phase-value').filter({ hasText:"9" }).waitFor();
      assert.equal(await page.locator('[data-command="attack"]').isEnabled(), true);
      assert.equal(await page.locator('.rf-b-preview').count(), 0);
      results.push("HTTP Worker: another client advances turn; stale execution is refused and read refresh recovers without repeating a write");

      const sessionUrl = `${fixture.baseUrl}/v1/battle/session`;
      gate = new Promise<void>(done => { release = done; });
      let reads = 0;
      await page.route(sessionUrl, async route => { reads++; await gate; await route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ error:{ code:"unavailable", message:"Isolated read failure" } }) }); });
      const readRequest = page.waitForRequest(sessionUrl);
      await page.locator('[data-battle-action="refresh"]').click(); await readRequest;
      await page.locator('[data-battle-action="refresh"]').dispatchEvent("click");
      assert.equal(reads, 1);
      release();
      await page.locator('.rf-deferred-panel [role="alert"]').waitFor();
      assert.equal(await page.locator('[data-battle-action="status"]').evaluate(el => el.ownerDocument.activeElement === el), true);
      await page.unroute(sessionUrl);
      await page.locator('[data-battle-action="refresh"]').click();
      await page.locator('[data-command="attack"]:enabled').waitFor();
      assert.equal(await page.locator('[data-command="attack"]').evaluate(el => el.ownerDocument.activeElement === el), true);
      results.push("HTTP Worker: read refresh cannot duplicate; failed read keeps writes held and keyboard focus survives retry/recovery");

      await page.route(commandsUrl, route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ command:"attack", dryRun:true, session:{}, effects:[] }) }));
      await page.locator('[data-command="attack"]').click();
      await page.locator('.rf-b-preview[role="alert"]').waitFor();
      assert.ok((await page.locator('.rf-b-preview-body').textContent())?.includes(relayText("connectionInvalidResponse", "ja")));
      assert.equal(await page.locator('[data-battle-action="execute"]').isDisabled(), true);
      await page.unroute(commandsUrl);
      await page.locator('[data-command="attack"]').click();
      await page.locator('.rf-b-preview[data-phase="previewed"]').waitFor();
      await page.route(commandsUrl, async route => { await route.fetch(); await route.abort("failed"); });
      await page.locator('[data-battle-action="execute"]').click();
      await page.locator('.rf-b-preview[role="alert"]').waitFor();
      assert.equal(await page.locator('[data-command="attack"]').isDisabled(), true);
      let reviewWrites = 0;
      await page.route(`${fixture.baseUrl}/v1/quests/*/review-response`, async route => { reviewWrites++; await route.continue(); });
      await page.locator('.rf-human-inbox-trigger').first().click();
      const requestCard = page.locator('.rf-human-request').first();
      await requestCard.locator('summary').click();
      assert.equal(await requestCard.locator('.rf-human-request-actions button:enabled').count(), 0);
      await requestCard.locator('.rf-human-request-actions button').first().dispatchEvent("click");
      assert.equal(reviewWrites, 0);
      await page.locator('.rf-human-inbox header button').click();
      await page.unroute(commandsUrl);
      await page.locator('[data-battle-action="refresh"]').click();
      await page.locator('.rf-b-phase-value').filter({ hasText:"10" }).waitFor();
      assert.equal(await page.locator('[data-command="attack"]').isEnabled(), true);
      await page.reload();
      await page.getByRole("button", { name:"Battle", exact:true }).click();
      await page.locator('.rf-b-phase-value').filter({ hasText:"10" }).waitFor();
      results.push("HTTP Worker: malformed preview rejected; lost response after real execution holds writes, read recovers and reload preserves exactly one turn");

      for (const result of ["victory", "defeat"] as const) {
        const stored = await readState(fixture.env, fixture.uid);
        stored.payload.state!.battle.ended = true;
        if (result === "victory") stored.payload.state!.boss.hp = 0; else { stored.payload.state!.boss.hp = 100; stored.payload.state!.character.hp = 0; }
        await writeState(fixture.env, fixture.uid, { state:stored.payload.state!, schemaVersion:7, clientUpdatedAt:new Date().toISOString() }, stored.etag);
        await page.locator('[data-battle-action="refresh"]').click();
        await page.locator(`.rf-b-objective[data-result="${result}"]`).waitFor();
        assert.equal(await page.locator('.rf-b-command:enabled').count(), 0);
      }
      results.push("HTTP Worker: ended victory and defeat have distinct state labels and disabled moves");
      await page.route(sessionUrl, route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ session:{ schemaVersion:1, boss:{} } }) }));
      for (const locale of ["ja", "en", "ru"] as const) {
        await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=${locale}`);
        await page.getByRole("button", { name:"Battle", exact:true }).click();
        await page.locator('.rf-deferred-panel [role="alert"]').waitFor();
        assert.equal(await page.locator('.rf-deferred-panel [role="alert"]').textContent(), relayText("connectionInvalidResponse", locale));
        assert.equal(await page.locator('[data-command]').count(), 0);
      }
      results.push("HTTP Worker: malformed initial Battle session becomes a localized error in ja/en/ru without fabricated meters or commands");
    } catch (error) {
      await page.screenshot({ path:".qa-artifacts/relay-battle/failure-http.png", fullPage:true });
      console.error(await page.locator("body").innerText());
      throw error;
    } finally { await context.close(); await fixture.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(`.qa-artifacts/relay-battle/results${built ? "-built" : process.argv.includes("--http-only") ? "-http" : ""}.json`, JSON.stringify({ results, errors, scope:"Local Chrome and isolated HTTP Worker. No live account writes or deployment." }, null, 2));
  console.log(`PASS ${results.length} Battle checks`);
} finally { await browser.close(); }
