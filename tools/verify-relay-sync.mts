import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { SUPPORTED_LOCALES } from "../i18n.ts";

const base = process.argv[2] || "http://localhost:5183";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
await mkdir(".qa-artifacts/workspace-sync", { recursive:true });
const browser = await chromium.launch({ executablePath:process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless:true });
const fixture = await startRelayWorkerFixture(new URL(base).origin);
const results: string[] = [];
const errors: string[] = [];
let release: (() => void) | undefined;
try {
  const task = (await fixture.web("/v1/quests", "POST", { kind:"todo", title:"Shared real task", estimatedMinutes:2000 })).quest;
  const working = (await fixture.web("/v1/quests", "POST", { kind:"todo", title:"Review draft task", assignee:{ type:"agent", id:"review-agent", label:"My Review Agent", handoffState:"working" } })).quest;
  const review = (await fixture.web(`/v1/quests/${working.id}/handoff`, "POST", { state:"review_required", expectedState:"working", dryRun:false })).quest;
  const pages: Page[] = [];
  for (const width of [1440, 412]) {
    const page = await browser.newPage({ viewport:{ width, height:1000 }, reducedMotion:"reduce" });
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
    await page.locator(".rf-shell").waitFor();
    if (width > 900) { await page.locator(`.rf-spine-row[data-quest-id="${task.id}"]`).click(); await page.keyboard.press("Escape"); }
    else { await page.locator(".rf-m-questflow").click(); await page.locator(`.rf-sheet-panel .rf-spine-row[data-quest-id="${task.id}"]`).click(); }
    pages.push(page);
  }
  const [desktop, mobile] = pages;
  const title = (page: Page) => page.locator(page.viewportSize()!.width <= 900 ? ".rf-m-quest-title" : ".rf-selected-title");
  const resume = (page: Page) => page.evaluate("window.dispatchEvent(new Event('focus'))");
  const synced = (page: Page) => page.locator('.rf-shell[data-sync-state="synced"]').waitFor();
  const navigate = (domain: string) => desktop.locator(domain === "settings" ? ".rf-rail-utility:has(.rf-settings-mark)" : `.rf-nav-item:has([data-domain="${domain}"])`).click();
  await desktop.locator('[data-quest-action="start"]:visible').click();
  await desktop.locator('.rf-decision-result[data-tone="success"]:visible').first().waitFor();
  await mobile.clock.fastForward(30001);
  await mobile.locator('[data-quest-action="stop"]:visible').waitFor();
  assert.equal(await title(mobile).textContent(), task.title);
  results.push("Desktop write reaches mobile through the real Worker and scheduled refresh without reload");

  await mobile.locator('[data-quest-action="stop"]:visible').click();
  await mobile.locator('.rf-decision-result[data-tone="success"]:visible').waitFor();
  await resume(desktop);
  await desktop.locator('[data-quest-action="start"]:visible').waitFor();
  results.push("Mobile write reaches desktop on focus without changing selection");

  await desktop.locator('[data-quest-action="edit"]:visible').click();
  await desktop.locator('dialog[open] input[name="title"]').fill("My unsaved title");
  await fixture.web(`/v1/quests/${task.id}`, "PATCH", { title:"Changed outside this tab" });
  await resume(desktop);
  await desktop.clock.fastForward(30001);
  assert.equal(await desktop.locator('dialog[open] input[name="title"]').inputValue(), "My unsaved title");
  await desktop.keyboard.press("Escape");
  await resume(desktop);
  await assert.doesNotReject(() => desktop.waitForFunction("document.querySelector('.rf-selected-title')?.textContent === 'Changed outside this tab'"));
  results.push("Automatic reads defer while an editor is open and keep its draft, then resume after close");

  await resume(mobile);
  await synced(mobile);
  for (const page of [desktop, mobile]) await page.locator('[data-quest-action="edit"]:visible').click();
  await desktop.locator('dialog[open] input[name="title"]').fill("Desktop draft must survive conflict");
  await mobile.locator('dialog[open] input[name="title"]').fill("Saved on the other device");
  assert.equal(await mobile.locator('dialog[open] input[name="title"]').getAttribute("maxlength"), "80");
  await mobile.locator('dialog[open] .rf-create-submit').click();
  await mobile.locator('dialog[open]').waitFor({ state:"hidden" });
  const conflictingSave = desktop.waitForResponse(response => response.url() === `${fixture.baseUrl}/v1/quests/${task.id}` && response.request().method() === "PATCH");
  await desktop.locator('dialog[open] .rf-create-submit').click();
  assert.equal((await conflictingSave).status(), 409, "Stale editing must not overwrite another device's saved title");
  assert.equal(await desktop.locator('dialog[open] input[name="title"]').inputValue(), "Desktop draft must survive conflict");
  assert.equal((await fixture.web(`/v1/quests/${task.id}`)).quest.title, "Saved on the other device");
  assert.equal((await fixture.web(`/v1/quests/${task.id}`)).quest.estimatedMinutes, 2000, "Editing must preserve valid estimates above one day");
  await desktop.locator('dialog[open] .rf-create-error').getByText(relayText("questEditConflict", "ja"), { exact:true }).waitFor();
  assert.equal(await desktop.locator('dialog[open] .rf-create-submit').isDisabled(), true);
  for (const width of [320, 412, 1440]) for (const locale of SUPPORTED_LOCALES) {
    await desktop.setViewportSize({ width, height:1000 });
    await desktop.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
    assert.equal(await desktop.locator('dialog[open] .rf-create-error').textContent(), relayText("questEditConflict", locale));
    assert.equal(await desktop.locator('dialog[open] input[name="title"]').inputValue(), "Desktop draft must survive conflict");
    assert.equal(await desktop.evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog[open]').scrollWidth <= document.querySelector('dialog[open]').clientWidth"), true, `${locale}/${width}: conflict overflow`);
    if (locale === "de" && width === 320) await desktop.screenshot({ path:".qa-artifacts/workspace-sync/edit-conflict-de-320.png" });
  }
  await desktop.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'ja' }))");
  await desktop.screenshot({ path:".qa-artifacts/workspace-sync/edit-conflict.png" });
  await desktop.keyboard.press("Escape");
  await desktop.waitForFunction("document.querySelector('.rf-selected-title')?.textContent === 'Saved on the other device'");
  await synced(desktop);
  await fixture.web(`/v1/quests/${task.id}`, "PATCH", { title:"Changed outside this tab" });
  await resume(desktop);
  await synced(desktop);
  results.push("Two real browser editors reject stale saves without losing the draft or overwriting the winning device");

  let reads = 0;
  let writes = 0;
  await desktop.route(`${fixture.baseUrl}/v1/quests/${task.id}`, async route => { if (route.request().method() === "PATCH") writes++; await route.continue(); });
  await desktop.route(`${fixture.baseUrl}/v1/workspace/bootstrap`, async route => {
    reads++;
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response });
  });
  await resume(desktop);
  await desktop.locator('.rf-shell[data-sync-state="syncing"]').waitFor();
  assert.equal(await title(desktop).textContent(), "Changed outside this tab");
  assert.equal(await desktop.locator('[data-quest-action="start"]:visible').isDisabled(), true);
  assert.equal(await desktop.locator(".rf-create").isDisabled(), true);
  await desktop.evaluate("document.querySelector('.rf-create').click()");
  assert.equal(await desktop.locator("dialog[open]").count(), 0);
  await desktop.evaluate("document.querySelector('[data-quest-action=start]').click()");
  await resume(desktop);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  release!();
  await synced(desktop);
  await desktop.unroute(`${fixture.baseUrl}/v1/workspace/bootstrap`);
  results.push("Delayed reads preserve visible data and reject duplicate reads and synthetic writes");

  await mobile.context().setOffline(true);
  await mobile.evaluate("window.dispatchEvent(new Event('offline'))");
  await mobile.locator('.rf-shell[data-sync-state="error"]').waitFor();
  assert.equal(await mobile.locator('[data-quest-action="start"]:visible').isDisabled(), true);
  assert.equal(await title(mobile).textContent(), "Saved on the other device");
  for (const width of [320, 412]) {
    await mobile.setViewportSize({ width, height:1000 });
    for (const locale of SUPPORTED_LOCALES) {
      await mobile.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
      assert.equal(await mobile.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${locale}/${width}: offline overflow`);
      const sync = mobile.locator("button.rf-m-sync");
      assert.ok((await sync.boundingBox())!.height >= 44);
      assert.ok((await sync.getAttribute("aria-label"))?.includes(relayText("refresh", locale)));
      assert.equal(await mobile.locator(".rf-screen-notice").getByRole("button", { name:relayText("retry", locale), exact:true }).count(), 1);
      if (locale === "de" && width === 320 || locale === "ru" && width === 412) await mobile.screenshot({ path:`.qa-artifacts/workspace-sync/offline-${locale}-${width}.png`, fullPage:true });
    }
  }
  await mobile.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'ja' }))");
  results.push("Offline recovery notice and real refresh button fit nine languages at 320 and 412px with 44px targets");
  await fixture.web(`/v1/quests/${task.id}`, "PATCH", { title:"Recovered remote update" });
  await mobile.context().setOffline(false);
  await mobile.evaluate("window.dispatchEvent(new Event('online'))");
  await mobile.waitForFunction("document.querySelector('.rf-m-quest-title')?.textContent === 'Recovered remote update'");
  results.push("Offline keeps the old snapshot and holds writes; online recovery applies remote changes through reads only");

  await desktop.route(`${fixture.baseUrl}/v1/workspace/bootstrap`, route => route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ error:{ code:"unavailable", message:"private-token https://secret.invalid" } }) }));
  await resume(desktop);
  await desktop.locator('.rf-shell[data-sync-state="error"]').waitFor();
  assert.equal(await title(desktop).textContent(), "Changed outside this tab");
  assert.equal((await desktop.locator(".rf-screen-notice").innerText()).includes("private-token"), false);
  await desktop.unroute(`${fixture.baseUrl}/v1/workspace/bootstrap`);
  await desktop.locator(".rf-screen-notice").getByRole("button", { name:relayText("retry", "ja"), exact:true }).click();
  await desktop.waitForFunction("document.querySelector('.rf-selected-title')?.textContent === 'Recovered remote update'");
  assert.equal(await desktop.locator('[data-slot="health"]').evaluate(element => element === element.ownerDocument.activeElement), true);
  results.push("HTTP failure retains selection and data, hides raw payloads, and offers successful read-only retry");

  await desktop.locator(`.rf-spine-row[data-quest-id="${review.id}"]`).click();
  await desktop.locator(".rf-lens .rf-external-check input").check();
  await desktop.locator(".rf-lens").getByRole("button", { name:relayText("requestRevision", "ja"), exact:true }).click();
  const revision = desktop.locator(".rf-revision-input:visible");
  await revision.fill("Keep my revision draft");
  await revision.evaluate(element => (element as unknown as { setSelectionRange(start:number, end:number):void }).setSelectionRange(3, 8));
  await fixture.web(`/v1/quests/${review.id}`, "PATCH", { notes:"External notes changed" });
  await resume(desktop);
  await synced(desktop);
  assert.equal(await revision.inputValue(), "Keep my revision draft");
  assert.deepEqual(await revision.evaluate(element => {
    const field = element as unknown as { selectionStart:number; selectionEnd:number };
    return [element.ownerDocument.activeElement === element, field.selectionStart, field.selectionEnd];
  }), [true, 3, 8]);
  assert.equal(await desktop.locator(".rf-lens .rf-external-check input").isChecked(), false);
  results.push("Remote review updates preserve revision focus and caret while invalidating the previous explicit check");

  await desktop.keyboard.press("Escape");
  await navigate("settings");
  const name = desktop.locator('.rf-set-profile-form input[name="displayName"]');
  await name.fill("Unsaved profile draft");
  await name.evaluate(element => (element as unknown as { setSelectionRange(start:number, end:number):void }).setSelectionRange(2, 9));
  await resume(desktop);
  await synced(desktop);
  assert.equal(await name.inputValue(), "Unsaved profile draft");
  assert.deepEqual(await name.evaluate(element => {
    const field = element as unknown as { selectionStart:number; selectionEnd:number };
    return [element.ownerDocument.activeElement === element, field.selectionStart, field.selectionEnd];
  }), [true, 2, 9]);
  results.push("Settings draft and input focus and selection survive automatic refresh");

  for (const page of [desktop, mobile]) await page.route(`${fixture.baseUrl}/v1/workspace/bootstrap`, async route => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({ response, json:{ ...snapshot, profile:null, agents:[], panelErrors:[{ index:3, message:"Isolated profile failure" }, { index:5, message:"Isolated Agent failure" }] } });
  });
  await resume(desktop);
  await desktop.locator(".rf-screen-notice").getByRole("button", { name:relayText("retry", "ja"), exact:true }).waitFor();
  assert.equal(await name.inputValue(), "Unsaved profile draft");
  assert.equal(await desktop.locator(".rf-set-agent-name").textContent(), "My Review Agent");
  await resume(mobile);
  await mobile.locator('.rf-m-sync[data-state="stale"]').waitFor();
  await mobile.unroute(`${fixture.baseUrl}/v1/workspace/bootstrap`);
  await resume(mobile);
  await mobile.locator('.rf-m-sync[data-state="synced"]').waitFor();
  await desktop.unroute(`${fixture.baseUrl}/v1/workspace/bootstrap`);
  await desktop.locator(".rf-screen-notice").getByRole("button", { name:relayText("retry", "ja"), exact:true }).click();
  await desktop.waitForFunction("!document.querySelector('.rf-screen-notice') && document.querySelector('.rf-shell')?.getAttribute('data-sync-state') === 'synced'");
  assert.equal(await desktop.evaluate("document.activeElement?.matches('h1, h2')"), true);
  await desktop.context().setOffline(true);
  await desktop.evaluate("window.dispatchEvent(new Event('offline'))");
  assert.equal(await desktop.locator(".rf-set-agent-row button").isDisabled(), true);
  await desktop.evaluate("document.querySelector('.rf-set-agent-row button').click()");
  assert.equal(await desktop.locator("dialog[open]").count(), 0);
  await desktop.context().setOffline(false);
  await desktop.evaluate("window.dispatchEvent(new Event('online'))");
  await desktop.waitForFunction("!document.querySelector('.rf-screen-notice') && document.querySelector('.rf-shell')?.getAttribute('data-sync-state') === 'synced'");
  results.push("Failed optional identity panels retain previous profile and Agents; offline Agent actions hold, and recovery returns focus to the screen heading");

  await navigate("command");
  const completion = (await fixture.web("/v1/quests", "POST", { kind:"todo", title:"Complete once across devices" })).quest;
  for (const page of [desktop, mobile]) {
    await resume(page);
    await synced(page);
    if (page === mobile) await page.locator(".rf-m-questflow").click();
    await page.locator(`${page === mobile ? ".rf-sheet-panel " : ""}.rf-spine-row[data-quest-id="${completion.id}"]`).click();
    if (page === desktop) await page.keyboard.press("Escape");
  }
  const firstCompletion = desktop.waitForResponse(response => response.url() === `${fixture.baseUrl}/v1/quests/${completion.id}/score` && response.request().method() === "POST");
  await desktop.locator('[data-quest-action="complete"]:visible').first().click();
  assert.equal((await firstCompletion).status(), 200);
  const repeatedCompletion = mobile.waitForResponse(response => response.url() === `${fixture.baseUrl}/v1/quests/${completion.id}/score` && response.request().method() === "POST");
  await mobile.locator('[data-quest-action="complete"]:visible').click();
  assert.equal((await repeatedCompletion).status(), 409);
  await mobile.locator('.rf-shell[data-sync-state="error"]').waitFor();
  assert.equal((await fixture.web(`/v1/quests/${completion.id}`)).quest.done, true);
  assert.equal(await mobile.locator('[data-quest-action="complete"]:visible').isDisabled(), true);
  await mobile.locator(".rf-screen-notice").getByRole("button", { name:relayText("retry", "ja"), exact:true }).click();
  await synced(mobile);
  assert.equal(await mobile.locator('[data-quest-action="complete"]:visible').count(), 0);
  assert.equal((await fixture.web(`/v1/quests/${completion.id}`)).quest.done, true);
  results.push("Stale mobile completion cannot reopen desktop-completed work; read-only recovery preserves completion");

  let createRequests = 0;
  await desktop.route(`${fixture.baseUrl}/v1/quests`, async route => {
    if (route.request().method() === "POST") {
      createRequests++;
      await route.fetch(); // Commit, then lose only the response reaching the browser.
      await route.abort("failed");
    } else await route.continue();
  });
  await desktop.locator(".rf-create").click();
  await desktop.locator('dialog[open] input[name="title"]').fill("Saved despite a lost response");
  await desktop.locator('dialog[open] .rf-create-submit').click();
  await desktop.locator('dialog[open] .rf-create-error').waitFor();
  assert.equal(await desktop.locator('dialog[open] .rf-create-submit').isDisabled(), true, "Uncertain creation must not offer another POST");
  await desktop.locator('dialog[open] form').dispatchEvent("submit");
  assert.equal(createRequests, 1);
  assert.equal(await desktop.locator('dialog[open] input[name="title"]').inputValue(), "Saved despite a lost response");
  for (const width of [320, 412, 1440]) for (const locale of SUPPORTED_LOCALES) {
    await desktop.setViewportSize({ width, height:1000 });
    await desktop.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
    assert.equal(await desktop.locator('dialog[open] .rf-create-error').textContent(), relayText("questSaveUncertain", locale));
    assert.equal(await desktop.evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog[open]').scrollWidth <= document.querySelector('dialog[open]').clientWidth"), true, `${locale}/${width}: uncertain save overflow`);
    if (locale === "ja" && width === 412) await desktop.screenshot({ path:".qa-artifacts/workspace-sync/save-uncertain-ja-412.png" });
  }
  await desktop.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'ja' }))");
  await desktop.keyboard.press("Escape");
  await desktop.locator(".rf-spine-row").filter({ hasText:"Saved despite a lost response" }).waitFor();
  await desktop.unroute(`${fixture.baseUrl}/v1/quests`);
  const savedOnce = await fixture.web("/v1/quests?view=all") as unknown as { quests:Array<{ title:string }> };
  assert.equal(savedOnce.quests.filter(quest => quest.title === "Saved despite a lost response").length, 1);
  results.push("A committed create with a lost response retains its draft, blocks duplicate POSTs and recovers through reads");

  for (let index = 0; index < 205; index++) await fixture.web("/v1/quests", "POST", { kind:"todo", title:`Pagination task ${index}` });
  const firstPage = await fixture.web("/v1/quests?view=all&limit=200") as unknown as { quests:Array<{ id:string; title:string }>; nextCursor:string };
  assert.equal(firstPage.quests.length, 200);
  assert.ok(firstPage.nextCursor);
  const secondPage = await fixture.web(`/v1/quests?view=all&limit=200&cursor=${encodeURIComponent(firstPage.nextCursor)}`) as unknown as { quests:Array<{ id:string; title:string }> };
  const beyond = secondPage.quests.find(quest => !firstPage.quests.some(first => first.id === quest.id))!;
  assert.ok(beyond);
  await resume(desktop);
  await synced(desktop);
  assert.equal(await desktop.locator(`.rf-spine-row[data-quest-id="${beyond.id}"]`).count(), 1);
  await mobile.reload();
  await mobile.locator(".rf-shell").waitFor();
  await mobile.locator(".rf-m-questflow").click();
  await mobile.locator(`.rf-sheet-panel .rf-spine-row[data-quest-id="${beyond.id}"]`).click();
  assert.equal(await title(mobile).textContent(), beyond.title);
  results.push("More than 200 real Worker Quests are retained by desktop refresh and fresh mobile bootstrap; a Quest outside the first page is selectable");

  release = undefined;
  await desktop.route(`${fixture.baseUrl}/v1/workspace/bootstrap`, async route => {
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response });
  });
  await resume(desktop);
  await desktop.locator('.rf-shell[data-sync-state="syncing"]').waitFor();
  await desktop.evaluate("window.dispatchEvent(new Event('test:unmount'))");
  release!();
  await desktop.waitForTimeout(200);
  await desktop.clock.fastForward(60001);
  assert.equal(await desktop.locator("#relay-forge-root").textContent(), "Signed out");
  results.push("Unmount cancels periodic listeners and late responses cannot restore the previous owner's snapshot");
  assert.deepEqual(errors, []);
  await mobile.screenshot({ path:".qa-artifacts/workspace-sync/recovered-mobile.png", fullPage:true });
  await writeFile(".qa-artifacts/workspace-sync/results.json", JSON.stringify({ results, errors, scope:"Two isolated Chrome clients and the real HTTP Worker. Physical devices and production OAuth remain unverified." }, null, 2));
  console.log(`PASS ${results.length} workspace sync scenarios`);
} finally { release?.(); await browser.close(); await fixture.close(); }
