import { chromium, type Page } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://127.0.0.1:5182";
const output = join(process.cwd(), ".qa-artifacts", "lpv2");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.QF_CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const errors: string[] = [];
const state = async (page: Page, value: string) => {
  await page.locator('#experience[data-state="' + value + '"]').waitFor({ timeout: 10000 });
};
const action = (page: Page, value: string) => page.locator('[data-action="' + value + '"]').click();
async function checkWidth(page: Page, label: string): Promise<void> {
  const sizes = await page.evaluate("({ width: innerWidth, scroll: document.documentElement.scrollWidth })") as { width: number; scroll: number };
  assert.ok(sizes.scroll <= sizes.width, label + ": overflow " + JSON.stringify(sizes));
}
try {
  for (const width of [320, 375, 390, 414, 768, 1024, 1440, 1920]) {
    for (const language of ["ja", "en"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text() + " " + msg.location().url); });
      await page.goto(base + (language === "en" ? "/lpv2/en/" : "/lpv2/"), { waitUntil: "networkidle" });
      await checkWidth(page, language + width);
      await action(page, "start");
      await state(page, "human_task");
      await checkWidth(page, language + width + " review");
      if (width === 390 || width === 1440) {
        await page.locator("#experience").screenshot({ path: join(output, language + "-" + width + "-review.png") });
      }
      await context.close();
    }
  }
  console.log("PASS responsive: JA/EN, 8 widths, initial and review states");

  for (const [language, width] of [["ja",1440],["ja",390],["en",390]] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const unsafeRequests: string[] = [];
    page.on("request", request => {
      if (!["GET","HEAD"].includes(request.method()) || new URL(request.url()).origin !== new URL(base).origin) {
        unsafeRequests.push(request.method() + " " + request.url());
      }
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + (language === "en" ? "/lpv2/en/" : "/lpv2/"), { waitUntil: "networkidle" });
    await action(page, "start");
    await state(page, "human_task");
    assert.equal(await page.locator('[data-quest="review"]').count(), 1);
    await action(page, "hold");
    await state(page, "paused");
    await page.waitForTimeout(1200);
    await state(page, "paused");
    await action(page, "resume");
    await state(page, "human_task");
    if (width < 760) await page.locator('button[data-view="external"]').click();
    await page.locator("[data-menu-toggle]").click();
    assert.equal(await page.locator("[data-menu-toggle]").getAttribute("aria-expanded"), "true");
    await page.locator('[data-sample-page="0"]').click();
    assert.equal(await page.locator("[data-menu-toggle]").getAttribute("aria-expanded"), "false");
    const before = await page.locator("[data-menu-toggle]").boundingBox();
    if (width < 760) await page.locator('[data-return-to-task]').click();
    await action(page, "feedback");
    await state(page, "revised");
    if (width < 760) await page.locator('button[data-view="external"]').click();
    const after = await page.locator("[data-menu-toggle]").boundingBox();
    assert.ok(before && after && after.width > before.width, "external button visibly grows");
    await page.locator("[data-menu-toggle]").click();
    await page.locator("[data-menu-toggle]").press("Escape");
    assert.equal(await page.locator("[data-menu-toggle]").getAttribute("aria-expanded"), "false");
    if (width < 760) await page.locator('button[data-view="guilduo"]').click();
    await action(page, "confirm");
    await state(page, "complete");
    await page.locator("#experience").screenshot({ path: join(output, language + "-" + width + "-complete.png") });
    await action(page, "replay");
    await state(page, "intro");
    assert.equal(await page.locator("[data-revision]").textContent(), "v0");
    await action(page, "start");
    await state(page, "human_task");
    await action(page, "approve");
    await state(page, "complete");
    assert.equal(await page.locator("[data-revision]").textContent(), "v1");
    await action(page, "restart");
    await action(page, "start");
    await page.locator("#mcp").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2100);
    await state(page, "delegated");
    await page.locator("#experience").scrollIntoViewIfNeeded();
    await state(page, "human_task");
    await action(page, "feedback");
    await action(page, "restart");
    await page.waitForTimeout(1800);
    await state(page, "intro");
    assert.equal(await page.locator('[data-quest="review"]').isVisible(), false);
    assert.deepEqual(unsafeRequests, [], "demo has no remote calls or writes");
    await context.close();
  }
  console.log("PASS interaction: revised/no-change, hold/resume, external menu, reset cancels timers, off-screen pauses, no remote writes");

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(base + "/lpv2/", { waitUntil: "networkidle" });
  const defaultJoin = await page.locator("[data-join-cta]").first().getAttribute("href");
  assert.equal(defaultJoin, await page.evaluate("globalThis.QuestForgeConfig.joinGuildUrl"));
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://guilduo.com/lpv2/");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('.skip-link')"), true);
  await page.selectOption("[data-theme-control]", "light");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.screenshot({ path: join(output, "ja-1440-light.png"), fullPage: true });
  await page.selectOption("[data-theme-control]", "system");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator('html[data-theme="dark"]').waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.selectOption("[data-theme-control]", "dark");
  await page.screenshot({ path: join(output, "ja-1440-dark.png"), fullPage: true });
  await action(page, "start");
  await state(page, "human_task");
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.review-quest')).animationName"), "none");
  assert.equal(await page.locator("#mcp details").getAttribute("open"), "");
  await page.locator("#mcp summary").click();
  assert.equal(await page.locator("#mcp details").getAttribute("open"), null);
  await page.locator("#mcp summary").click();
  assert.equal(await page.locator("#mcp details").getAttribute("open"), "");
  await context.close();

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  await staticPage.goto(base + "/lpv2/en/");
  assert.ok(await staticPage.locator("h1").isVisible());
  assert.ok(await staticPage.locator("noscript").isVisible());
  assert.equal(await staticPage.locator("[data-join-cta]").first().getAttribute("href"), "https://app.guilduo.com/");
  await noJs.close();
  assert.deepEqual(errors, [], "no browser errors");
  console.log("PASS theme persistence/system, keyboard entry, reduced motion, disclosure, no-JS fallback, CTA/metadata");
  console.log("LPv2 verification passed; screenshots: " + output);
} finally {
  await browser.close();
}
