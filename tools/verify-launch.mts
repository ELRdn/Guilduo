import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import sharp from "sharp";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { relayCopy, relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import type { BattleSession } from "../types/questforge.ts";

// Isolated local data and browser profile only; never touch a production account.
const base = process.argv[2] || "http://127.0.0.1:5183";
const built = process.argv.includes("--built");
const appPath = built ? "/next/relay-forge/" : "/interaction-lab/relay-forge/";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = join(process.cwd(), ".qa-artifacts", "launch", ...(built ? ["built"] : []));
await mkdir(output, { recursive: true });
const results: string[] = [];
const errors: string[] = [];
for (const [key, values] of Object.entries(relayCopy)) {
  assert.equal(values.length, SUPPORTED_LOCALES.length, key);
  assert.ok(values.every(value => value.trim()), key);
}
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
const fits = async (page: Page) => assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "No horizontal overflow");
try {
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  for (const [route, title] of [["privacy", "Privacy Notice"], ["terms", "Terms Of Use"]]) {
    for (const width of [320, 1440]) {
      await staticPage.setViewportSize({ width, height: 915 });
      const response = await staticPage.goto(`${base}/${route}/`);
      assert.equal(response?.status(), 200);
      assert.equal(await staticPage.locator("h1").textContent(), title);
      assert.ok((await staticPage.locator("main").innerText()).includes("Effective date: 2026-10-02"));
      assert.ok((await staticPage.locator("main").innerText()).includes("operated by Radon"));
      if (built) assert.match(await response!.text(), /<!--email_off-->[\s\S]*<!--\/email_off-->/);
      const contact = staticPage.locator('main a[href="mailto:el2radon2official@gmail.com"]');
      assert.equal(await contact.textContent(), "el2radon2official@gmail.com");
      assert.equal(await staticPage.locator('main a[href="https://github.com/ELRdn/Guilduo/issues"]').textContent(), "Guilduo GitHub Issues");
      assert.equal(await staticPage.locator('link[rel="canonical"]').getAttribute("href"), `https://guilduo.com/${route}/`);
      assert.equal((await staticPage.locator("main").innerHTML()).includes("__GUILDUO_"), false);
      await fits(staticPage);
      if (width === 320) {
        await staticPage.screenshot({ path: join(output, `${route}-nojs.png`), fullPage: true });
        await staticPage.screenshot({ path: join(output, `${route}-contact-nojs.png`) });
      }
      results.push(`${route} ${width}: policy content and canonical, no JS required, no overflow`);
    }
  }
  await staticContext.close();
  for (const locale of SUPPORTED_LOCALES) {
    const context = await browser.newContext({ locale, reducedMotion: "reduce" });
    // Exercise the real composition root without a real Appwrite account.
    await context.route("**/v1/account**", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: 401, type: "user_unauthorized", message: "Local signed-out fixture" }) }));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    for (const width of [320, 412, 1440]) {
      await page.setViewportSize({ width, height: 915 });
      await page.goto(`${base}${appPath}`);
      await page.locator('.rf-bootstrap[data-state="actionable"]').waitFor();
      assert.equal(await page.locator("h1").textContent(), relayText("signInTitle", locale));
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
      await page.getByRole("button", { name: relayText("signIn", locale), exact: true }).waitFor();
      await fits(page);
      if (width === 412 && (locale === "ja" || locale === "en")) await page.screenshot({ path: join(output, `signin-${locale}.png`) });
      results.push(`${locale} ${width}: localized sign-in, language metadata, no overflow`);
    }
    await page.getByRole("combobox").selectOption("en");
    assert.equal(await page.locator("h1").textContent(), relayText("signInTitle", "en"));
    assert.equal(await page.getByRole("combobox").evaluate(element => element === element.ownerDocument.activeElement), true);
    await page.getByRole("button", { name: relayText("demoButton", "en"), exact: true }).click();
    await page.locator(".rf-demo-label").waitFor();
    assert.equal(await page.locator(".rf-lens-scrim").isVisible(), false, "Demo opens without blocking the workspace");
    await page.locator(".rf-account-trigger").click();
    const login = page.getByRole("link", { name: relayText("signIn", "en"), exact: true });
    assert.equal(await login.getAttribute("href"), appPath);
    await login.click();
    await page.getByRole("button", { name: relayText("signIn", "en"), exact: true }).waitFor();
    await page.setViewportSize({ width: 412, height: 915 });
    await page.getByRole("button", { name: relayText("demoButton", "en"), exact: true }).click();
    await page.locator('.rf-nav-more').click();
    await page.locator('.rf-nav-more-panel').getByRole("link", { name: relayText("signIn", "en"), exact: true }).click();
    await page.getByRole("button", { name: relayText("signIn", "en"), exact: true }).waitFor();
    results.push(`${locale}: language switch keeps focus; desktop and mobile demo return to sign-in`);
    await context.close();
  }
  if (!built) {
  const fixture = await startRelayWorkerFixture(new URL(base).origin);
  try {
    const { quest } = await fixture.web("/v1/quests", "POST", {
      kind: "todo", title: "Launch scheduled task", estimatedMinutes: 0,
      planningState: "scheduled", planningMode: "on_date", scheduledDate: "2026-10-03", dueDate: "2026-10-08",
      assignee: { type: "self", id: fixture.uid, label: "Review Human", handoffState: "working" },
    });
    const before = await fixture.web("/v1/battle/session") as unknown as { session: BattleSession };
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}`);
    await page.locator(".rf-shell").waitFor();
    assert.equal(await page.locator(".rf-lens-scrim").isVisible(), false);
    await page.locator(".rf-search-trigger").click();
    let search = page.getByRole("searchbox", { name: relayText("questSearch", "ja"), exact: true });
    await search.pressSequentially("Launch");
    assert.equal(await search.inputValue(), "Launch", "Typing more than one character survives rerender");
    assert.equal(await search.evaluate(element => element === element.ownerDocument.activeElement), true);
    await search.evaluate((element: { setSelectionRange(start: number, end: number): void }) => element.setSelectionRange(2, 2));
    await page.keyboard.type("!");
    assert.equal(await search.inputValue(), "La!unch", "Caret position survives rerender");
    await search.evaluate(element => {
      const win = element.ownerDocument.defaultView!;
      element.dispatchEvent(new win.CompositionEvent("compositionstart", { bubbles: true }));
      element.value = "確認";
      element.dispatchEvent(new win.InputEvent("input", { bubbles: true, isComposing: true }));
      if (!element.isConnected) throw new Error("IME input was replaced during conversion");
      element.dispatchEvent(new win.CompositionEvent("compositionend", { bubbles: true, data: "確認" }));
    });
    assert.equal(await search.inputValue(), "確認");
    assert.equal(await search.evaluate(element => element === element.ownerDocument.activeElement), true);
    await search.fill("Launch");
    await page.locator(`.rf-q-row[data-quest-id="${quest.id}"]`).click();
    await page.locator('.rf-rail .rf-nav-item').first().click();
    await page.locator('[data-quest-action="edit"]').first().click();
    await page.locator('.rf-create-form input[name="title"]').fill("Launch edited task");
    let releaseQuest!: () => void;
    let startedQuest!: () => void;
    const questGate = new Promise<void>(resolve => { releaseQuest = resolve; });
    const questStarted = new Promise<void>(resolve => { startedQuest = resolve; });
    await page.route(`${fixture.baseUrl}/v1/quests/${quest.id}`, async route => {
      if (route.request().method() === "PATCH") { startedQuest(); await questGate; }
      await route.continue();
    });
    await page.locator('dialog[open] .rf-create-submit').click();
    await questStarted;
    try {
      assert.equal(await page.locator('dialog[open] input[name="title"]').isDisabled(), true);
      assert.equal(await page.locator('dialog[open] select[name="assignee"]').isDisabled(), true);
      await page.locator('dialog[open] form').dispatchEvent("submit");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator('dialog[open]').count(), 1);
    } finally { releaseQuest(); }
    await page.locator('dialog[open]').waitFor({ state: "hidden" });
    const edited = (await fixture.web(`/v1/quests/${quest.id}`)).quest;
    assert.equal(edited.scheduledDate, quest.scheduledDate);
    assert.equal(edited.planningMode, quest.planningMode);
    assert.equal(edited.planningState, quest.planningState);
    assert.equal(edited.rolloverCount, quest.rolloverCount);
    assert.equal(edited.estimatedMinutes, 0);
    assert.equal(edited.assignee.type, quest.assignee.type);
    assert.equal(edited.assignee.id, quest.assignee.id);
    assert.equal(edited.assignee.handoffState, quest.assignee.handoffState);
    results.push("HTTP edit preserves schedule, rollover, zero estimate and active assignee");
    await page.locator('[data-quest-action="complete"]').first().click();
    await page.locator('[data-quest-action="complete"]').waitFor({ state: "hidden" });
    const completed = (await fixture.web(`/v1/quests/${quest.id}`)).quest;
    const after = await fixture.web("/v1/battle/session") as unknown as { session: BattleSession };
    assert.equal(completed.done, true);
    assert.equal(completed.lifecycleState, "archived");
    assert.ok(after.session.battle.mp > before.session.battle.mp, "Completion grants MP");
    assert.ok(Number(after.session.character.gems) > Number(before.session.character.gems), "Completion grants gems");
    await page.getByRole("button", { name: "Battle", exact: true }).click();
    assert.match(await page.locator('.rf-b-meter[data-tone="mp"] .rf-b-meter-value').textContent() || "", new RegExp(`^${after.session.battle.mp}`));
    await page.screenshot({ path: join(output, "earned-mp.png") });
    results.push("HTTP completion archives once, grants rewards, refreshes Battle MP without reload");
    await page.reload();
    await page.locator(".rf-shell").waitFor();
    assert.equal((await fixture.web(`/v1/quests/${quest.id}`)).quest.done, true);
    const reloaded = await fixture.web("/v1/battle/session") as unknown as { session: BattleSession };
    assert.equal(reloaded.session.battle.mp, after.session.battle.mp);
    results.push("Reload retains completion and does not grant rewards again");
    for (const assignee of [
      { type: "human", id: "review-human", label: "Reviewer", handoffState: "working" },
      { type: "agent", id: "review-agent", label: "My Review Agent", handoffState: "working" },
    ]) {
      const assigned = (await fixture.web("/v1/quests", "POST", { kind: "todo", title: "Assigned launch task", assignee })).quest;
      if (assignee.type === "agent") {
        const agentRecord = await fixture.web(`/v1/agents/${assignee.id}`) as unknown as { agent: { updatedAt: string } };
        await fixture.web(`/v1/agents/${assignee.id}`, "PATCH", { status: "disabled", expectedUpdatedAt: agentRecord.agent.updatedAt });
      }
      await page.reload();
      await page.locator(".rf-shell").waitFor();
      await page.locator(".rf-search-trigger").click();
      await page.locator(`.rf-q-row[data-quest-id="${assigned.id}"]`).click();
      await page.locator('.rf-rail .rf-nav-item').first().click();
      await page.locator('[data-quest-action="edit"]').first().click();
      assert.equal(await page.locator('dialog[open] select[name="assignee"]').inputValue(), ":current");
      await page.locator('dialog[open] input[name="title"]').fill("Assigned edited task");
      await page.locator('dialog[open] .rf-create-submit').click();
      await page.locator('dialog[open]').waitFor({ state: "hidden" });
      assert.deepEqual((await fixture.web(`/v1/quests/${assigned.id}`)).quest.assignee, assigned.assignee);
      results.push(`${assignee.type}: title edit preserves Human or disabled Agent assignee and working state`);
    }
    await page.keyboard.press("Control+k");
    search = page.getByRole("searchbox", { name: relayText("questSearch", "ja"), exact: true });
    assert.equal(await search.evaluate(element => element === element.ownerDocument.activeElement), true);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.locator('.rf-shell[data-mobile="true"]').waitFor();
    await page.keyboard.press("Control+k");
    await search.pressSequentially("task");
    assert.equal(await search.inputValue(), "task");
    assert.equal(await search.evaluate(element => element === element.ownerDocument.activeElement), true);
    await fits(page);
    results.push("Ctrl K and mobile search focus survive navigation and typing");
    await page.locator(".rf-nav-more").click();
    await page.locator(".rf-nav-more-panel").getByRole("button", { name: "Settings", exact: true }).click();
    const upload = page.locator(".rf-set-avatar-trigger");
    assert.equal(await upload.evaluate(element => element.tagName), "BUTTON");
    await upload.focus();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await chooser;
    results.push("Profile image upload opens with keyboard Enter");
    await page.locator('.rf-set-profile-form input[name="displayName"]').fill("あなた");
    const originalHandle = await page.locator('.rf-set-profile-form input[name="handle"]').inputValue();
    let releaseProfile!: () => void;
    let startedProfile!: () => void;
    const profileGate = new Promise<void>(resolve => { releaseProfile = resolve; });
    const profileStarted = new Promise<void>(resolve => { startedProfile = resolve; });
    let profileWrites = 0;
    let avatarWrites = 0;
    await page.route(`${fixture.baseUrl}/v1/profile`, async route => {
      if (route.request().method() === "PATCH") { profileWrites += 1; startedProfile(); await profileGate; }
      await route.continue();
    });
    await page.route(`${fixture.baseUrl}/v1/profile/avatar`, async route => {
      if (route.request().method() === "PUT") avatarWrites += 1;
      await route.continue();
    });
    await page.locator('.rf-set-profile-submit').click();
    await profileStarted;
    try {
      await page.locator('.rf-set-profile-form').dispatchEvent("submit");
      await page.locator('.rf-set-profile-form').dispatchEvent("submit");
      assert.equal(await page.locator('.rf-set-profile-submit').isDisabled(), true);
      assert.equal(await page.locator('.rf-set-avatar-trigger').isDisabled(), true);
      await page.locator('#rf-set-avatar-input').setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==", "base64") });
    } finally { releaseProfile(); }
    await page.locator('.rf-set-profile-submit').waitFor({ state: "visible" });
    await page.waitForFunction("!document.querySelector('.rf-set-profile-submit').disabled");
    await page.waitForLoadState("networkidle");
    assert.equal(profileWrites, 1);
    assert.equal(avatarWrites, 0);
    const savedProfile = await fixture.web("/v1/profile") as unknown as { profile: { displayName: string; handle: string } };
    assert.equal(savedProfile.profile.displayName, "あなた");
    assert.equal(savedProfile.profile.handle.replace(/^@/, ""), originalHandle);
    assert.equal(await page.locator('.rf-set-profile-form input[name="displayName"]').inputValue(), "あなた");
    results.push("Profile saves once despite repeated submit; blocks avatar overlap and preserves literal user name");
    for (const locale of SUPPORTED_LOCALES) {
      await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
      assert.equal(await page.locator('.rf-set-profile-status').textContent(), relayText("profileSaved", locale));
      assert.equal(await page.locator('.rf-set-profile-form input[name="displayName"]').inputValue(), "あなた");
    }
    await page.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'ja' }))");
    await page.locator('.rf-set-profile-form input[name="handle"]').fill("launch_profile");
    await page.locator('.rf-set-profile-submit').click();
    await page.getByText(relayText("handleCooldown", "ja"), { exact: true }).waitFor();
    assert.equal(await page.locator('.rf-set-profile-form input[name="handle"]').inputValue(), "launch_profile");
    assert.deepEqual((await fixture.web("/v1/profile") as unknown as { profile: unknown }).profile, savedProfile.profile);
    results.push("Real Worker handle cooldown shows localized feedback, retains draft and leaves saved profile unchanged");
    for (const locale of SUPPORTED_LOCALES) {
      await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
      assert.equal(await page.locator('.rf-set-profile-status').textContent(), relayText("handleCooldown", locale));
      assert.equal(await page.locator('.rf-set-profile-form input[name="handle"]').inputValue(), "launch_profile");
    }
    await page.locator('#rf-set-avatar-input').setInputFiles({ name:'broken.png', mimeType:'image/png', buffer:Buffer.from('not an image') });
    await page.getByText(relayText("imageReadError", "ru"), { exact:true }).waitFor();
    for (const locale of SUPPORTED_LOCALES) {
      await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
      await page.getByText(relayText("imageReadError", locale), { exact:true }).waitFor();
    }
    results.push("Stored profile success, cooldown and invalid-image errors follow nine locales without changing saved user data");
    await page.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'ja' }))");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Party", exact: true }).click();
    await page.locator(".rf-agent-create").click();
    const agentDialog = page.locator('dialog[open]');
    await agentDialog.locator('input[name="agentId"]').fill("launch-agent");
    await agentDialog.locator('input[name="displayName"]').fill("Launch Agent");
    const agentChooser = page.waitForEvent("filechooser");
    await agentDialog.getByRole("button", { name: "画像を選択", exact: true }).focus();
    await page.keyboard.press("Enter");
    await agentChooser;
    await page.evaluate(`(() => {
      const original = window.createImageBitmap;
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      window.createImageBitmap = async (...args) => { await gate; return original(...args); };
      window.releaseAvatarDecode = () => { window.createImageBitmap = original; release(); };
    })()`);
    await agentDialog.locator('input[type="file"]').setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: await sharp({ create: { width: 16, height: 16, channels: 4, background: "#4F8A6D" } }).png().toBuffer() });
    try {
      assert.equal(await agentDialog.locator('.rf-create-submit').isDisabled(), true);
      assert.equal(await agentDialog.getByRole("button", { name: "画像を選択", exact: true }).isDisabled(), true);
      await agentDialog.locator('form').dispatchEvent("submit");
      await page.keyboard.press("Escape");
      assert.equal(await agentDialog.count(), 1);
    } finally { await page.evaluate("window.releaseAvatarDecode()"); }
    await page.waitForFunction("!document.querySelector('dialog[open] .rf-create-submit').disabled");
    assert.equal(await agentDialog.locator('.rf-agent-avatar-image').isVisible(), true);
    const validPreview = await agentDialog.locator('.rf-agent-avatar-image').getAttribute('src');
    await agentDialog.locator('input[type="file"]').setInputFiles({ name:'broken.png', mimeType:'image/png', buffer:Buffer.from('not an image') });
    await agentDialog.getByText(relayText('imageReadError', 'ja'), { exact:true }).waitFor();
    assert.equal(await agentDialog.locator('.rf-create-submit').isDisabled(), false);
    assert.equal(await agentDialog.locator('.rf-agent-avatar-image').getAttribute('src'), validPreview);
    await page.keyboard.press("Escape");
    await page.locator(".rf-agent-create").click();
    assert.equal(await agentDialog.locator('.rf-agent-avatar-image').isVisible(), false);
    assert.equal(await agentDialog.locator('input[name="agentId"]').inputValue(), "");
    await agentDialog.locator('input[name="agentId"]').fill("launch-agent");
    await agentDialog.locator('input[name="displayName"]').fill("Launch Agent");
    results.push("Delayed Agent image processing blocks save, reselection and close; invalid replacement reports failure and new dialog clears pending image");
    let releaseAgent!: () => void;
    let startedAgent!: () => void;
    const agentGate = new Promise<void>(resolve => { releaseAgent = resolve; });
    const agentStarted = new Promise<void>(resolve => { startedAgent = resolve; });
    let writes = 0;
    await page.route(`${fixture.baseUrl}/v1/agents`, async route => {
      if (route.request().method() === "POST") { writes += 1; startedAgent(); await agentGate; }
      await route.continue();
    });
    await agentDialog.locator('.rf-create-submit').click();
    await agentStarted;
    await agentDialog.locator('form').dispatchEvent("submit");
    await agentDialog.locator('form').dispatchEvent("submit");
    await page.keyboard.press("Escape");
    assert.equal(await agentDialog.isVisible(), true);
    assert.equal(await agentDialog.getByRole("button", { name: "キャンセル", exact: true }).isDisabled(), true);
    assert.equal(await agentDialog.locator('input[name="displayName"]').isDisabled(), true);
    assert.equal(await agentDialog.locator('textarea[name="instructions"]').isDisabled(), true);
    releaseAgent();
    await agentDialog.waitFor({ state: "hidden" });
    assert.equal(writes, 1);
    const savedAgents = await fixture.web("/v1/agents") as unknown as { agents: { agentId: string }[] };
    assert.equal(savedAgents.agents.filter(agent => agent.agentId === "launch-agent").length, 1);
    results.push("Agent keyboard upload; pending save blocks close and duplicate submissions, persists once");
    const linkFixture = await startRelayWorkerFixture(new URL(base).origin);
    try {
    await linkFixture.web('/v1/agents', 'POST', { agentId: 'launch-agent', displayName: 'Launch Agent' });
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(linkFixture.baseUrl)}&uid=${linkFixture.uid}`);
    await page.locator('.rf-shell').waitFor();
    await page.locator('.rf-rail-utility').last().click();
    const card = page.locator('.rf-set-connection-card');
    const changeAgent = card.getByRole("button", { name: relayText("agentChange", "ja"), exact: true });
    await changeAgent.click();
    assert.equal(await card.locator('button[aria-pressed="true"]').evaluate(element => element === element.ownerDocument.activeElement), true);
    await card.locator('.rf-set-agent-picker-actions .rf-secondary-button').click();
    assert.equal(await changeAgent.evaluate(element => element === element.ownerDocument.activeElement), true);
    await changeAgent.click();
    const option = card.locator('button[data-agent-id="launch-agent"]');
    await option.focus();
    await page.keyboard.press("Enter");
    assert.equal(await option.getAttribute("aria-pressed"), "true");
    assert.equal(await option.evaluate(element => element === element.ownerDocument.activeElement), true);
    let releaseLink!: () => void;
    let startedLink!: () => void;
    const linkGate = new Promise<void>(resolve => { releaseLink = resolve; });
    const linkStarted = new Promise<void>(resolve => { startedLink = resolve; });
    let linkWrites = 0;
    await page.route(`${linkFixture.baseUrl}/v1/agents/launch-agent/connections/*`, async route => {
      if (route.request().method() === "PUT") { linkWrites += 1; startedLink(); await linkGate; }
      await route.continue();
    });
    await card.locator('.rf-set-agent-picker-actions .rf-primary-button').click();
    await linkStarted;
    try {
      assert.equal(await option.isDisabled(), true);
      assert.equal(await card.locator('.rf-set-agent-picker-actions .rf-secondary-button').isDisabled(), true);
      await option.dispatchEvent("click");
      await card.locator('.rf-set-agent-picker-actions .rf-primary-button').dispatchEvent("click");
    } finally { releaseLink(); }
    await card.locator('.rf-set-agent-picker').waitFor({ state: "hidden" });
    assert.equal(linkWrites, 1);
    assert.equal(await card.getAttribute("data-linked"), "true");
    assert.equal(await card.locator('.rf-set-connection-agent-copy strong').textContent(), "Launch Agent");
    assert.equal(await changeAgent.evaluate(element => element === element.ownerDocument.activeElement), true);
    results.push("Linked Agent native button preserves keyboard focus and blocks duplicate HTTP writes while saving");
    } finally { await linkFixture.close(); }
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}`);
    await page.locator('.rf-shell').waitFor();
    await page.locator('.rf-rail-utility').last().click();
    const avatarFile = { name:'avatar.png', mimeType:'image/png', buffer:await sharp({ create:{ width:32, height:32, channels:4, background:'#4F8A6D' } }).png().toBuffer() };
    await page.locator('#rf-set-avatar-input').setInputFiles(avatarFile);
    await page.locator('.rf-set-account').getByText(relayText('avatarUpdated', 'ja'), { exact:true }).waitFor();
    await page.waitForFunction("document.querySelector('.rf-set-avatar-block img')?.src.startsWith('blob:') && document.querySelector('.rf-set-avatar-block img')?.naturalWidth > 0");
    const avatarProfile = await fixture.web('/v1/profile') as unknown as { profile:{ hasCustomAvatar:boolean; avatarVersion:number } };
    assert.equal(avatarProfile.profile.hasCustomAvatar, true);
    assert.equal(avatarProfile.profile.avatarVersion, 1);
    await page.reload();
    await page.locator('.rf-shell').waitFor();
    await page.locator('.rf-rail-utility').last().click();
    await page.waitForFunction("document.querySelector('.rf-set-avatar-block img')?.src.startsWith('blob:') && document.querySelector('.rf-set-avatar-block img')?.naturalWidth > 0");
    await page.locator('.rf-set-avatar-remove').click();
    await page.locator('.rf-set-account').getByText(relayText('avatarRemoved', 'ja'), { exact:true }).waitFor();
    assert.equal((await fixture.web('/v1/profile') as unknown as { profile:{ hasCustomAvatar:boolean } }).profile.hasCustomAvatar, false);
    results.push('Profile image reaches isolated R2, displays as authenticated Blob after reload and can be removed');
    const launchAgentRow = page.locator('.rf-set-agent-row').filter({ has:page.locator('.rf-set-agent-name', { hasText:'Launch Agent' }) });
    await launchAgentRow.getByRole('button').click();
    await page.locator('dialog[open] input[type="file"]').setInputFiles(avatarFile);
    await page.waitForFunction("!document.querySelector('dialog[open] .rf-create-submit').disabled");
    let avatarAttempts = 0;
    await page.route(`${fixture.baseUrl}/v1/agents/launch-agent/avatar`, async route => {
      if (route.request().method() === 'PUT' && ++avatarAttempts === 1) {
        await route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ code:'avatar_storage_unavailable', message:'Storage unavailable' }) });
      } else await route.continue();
    });
    await page.locator('dialog[open] .rf-create-submit').click();
    await page.locator('dialog[open]').getByText(relayText('agentImageFailed', 'ja'), { exact:true }).waitFor();
    assert.equal(await page.locator('dialog[open] input[name="agentId"]').isDisabled(), true);
    assert.equal(await page.locator('dialog[open] input[name="displayName"]').inputValue(), 'Launch Agent');
    await page.locator('dialog[open] .rf-create-submit').click();
    await page.locator('dialog[open]').waitFor({ state:'hidden' });
    assert.equal(avatarAttempts, 2);
    const avatarAgent = await fixture.web('/v1/agents/launch-agent') as unknown as { agent:{ hasCustomAvatar:boolean; avatarVersion:number } };
    assert.equal(avatarAgent.agent.hasCustomAvatar, true);
    assert.equal(avatarAgent.agent.avatarVersion, 1);
    await page.waitForFunction("Array.from(document.querySelectorAll('.rf-set-agent-row img')).some(img => img.src.startsWith('blob:') && img.naturalWidth > 0)");
    await page.reload();
    await page.locator('.rf-shell').waitFor();
    await page.locator('.rf-rail-utility').last().click();
    await page.waitForFunction("Array.from(document.querySelectorAll('.rf-set-agent-row img')).some(img => img.src.startsWith('blob:') && img.naturalWidth > 0)");
    results.push('Agent metadata survives image failure; retry uploads image to isolated R2 and authenticated preview survives reload');
    await page.close();
  } finally { await fixture.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "results.json"), JSON.stringify({ results, errors, built, scope: "Isolated local HTTP/browser fixtures; no production, physical Pixel 9 or external client acceptance." }, null, 2));
  console.log(`PASS ${results.length} launch scenarios; no page errors`);
} finally { await browser.close(); }
