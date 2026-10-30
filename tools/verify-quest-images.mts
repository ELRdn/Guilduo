import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { fakeImages } from "../tests/image-fixture.ts";
import { SqliteD1Database } from "../tests/test-helpers.ts";
import type { QuestImage } from "../types/questforge.ts";

const origin = process.argv[2] || "http://127.0.0.1:4319";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const output = resolve(".qa-artifacts/practical-v1"); await mkdir(output, { recursive: true });
const fixture = await startRelayWorkerFixture(origin, { QUESTFORGE_DB: new SqliteD1Database(), IMAGES: fakeImages() });
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errors: string[] = []; const checks: string[] = [];
const png = await sharp(Buffer.from('<svg width="1800" height="700"><rect width="1800" height="700" fill="#13352f"/><text x="80" y="200" fill="#e7e3da" font-size="100">CYAN IMAGE 42</text><text x="80" y="350" fill="#b89a5e" font-size="60">Private reference image</text></svg>')).png().toBuffer();
await writeFile(resolve(output, "reference.png"), png);
try {
  for (const width of [390, 1440]) for (const theme of ["light", "dark"]) for (const lang of ["ja", "en"]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const originalReads: string[] = []; page.on("request", request => { if (request.url().includes("variant=original")) originalReads.push(request.url()); });
    await page.goto(`${origin}/tests/browser/quest-images.html?api=${encodeURIComponent(fixture.baseUrl)}&quest=${fixture.first.source.id}&theme=${theme}&lang=${lang}`);
    await page.locator(".a4-images input[type=file]").setInputFiles({ name: `${lang}-${theme}-${width}.png`, mimeType: "image/png", buffer: png });
    if (width === 390 && theme === "light" && lang === "ja") {
      let failed = false;
      let previewFailed = false;
      await page.route("**/v1/quest-images/*?variant=preview", route => { if (!previewFailed) { previewFailed = true; return route.abort(); } return route.continue(); });
      await page.route("**/v1/quest-images/uploads/**", route => { if (!failed) { failed = true; return route.abort(); } return route.continue(); });
      await page.getByRole("button", { name: "Save fixture" }).click();
      await page.locator("#fixture-status").filter({ hasText: "Failed" }).waitFor({ timeout: 5000 }).catch(async error => {
        console.log(JSON.stringify({ fixtureStatus: await page.locator("#fixture-status").textContent(), rows: await page.locator(".a4-image-row").count(), imageStatus: await page.locator(".a4-images p[role=status]").textContent() }));
        await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true }); throw error;
      });
      assert.ok(await page.locator(".a4-image-row").filter({ hasText: "ja-light-390.png" }).count());
      checks.push("HTTP failure retains the selected file and retries the same upload");
    }
    await page.getByRole("button", { name: "Save fixture" }).click();
    await page.locator("#fixture-status").filter({ hasText: "Saved" }).waitFor();
    if (width === 390 && theme === "light" && lang === "ja") {
      await page.getByRole("button", { name: "再試行", exact: true }).click();
      checks.push("a failed thumbnail has an explicit retry that restores its image");
    }
    await page.waitForFunction("Array.from(document.querySelectorAll('.a4-image-row img')).some(img => img.complete && img.naturalWidth > 0)");
    assert.equal(originalReads.length, 0, "The original is never prefetched");
    const open = page.locator(".a4-image-row button").filter({ has: page.locator("img") }).first(); await open.click();
    await page.locator("dialog.a4-image-viewer").waitFor();
    await page.locator("dialog.a4-image-viewer button").nth(1).click();
    await page.waitForFunction("document.querySelector('dialog img')?.naturalWidth === 1800");
    await page.keyboard.press("Escape"); assert.equal(await open.evaluate(node => node.matches(":focus")), true);
    const overflow = await page.evaluate("document.documentElement.scrollWidth > innerWidth"); assert.equal(overflow, false);
    await page.screenshot({ path: resolve(output, `${lang}-${theme}-${width}.png`), fullPage: true });
    checks.push(`${lang} ${theme} ${width}: upload, preview, original, modal focus and width`);
    await context.close();
  }
  const images = await fixture.mcp("list_quest_images", { questId: fixture.first.source.id }) as unknown as { images: QuestImage[] };
  assert.equal(images.images.length, 8);
  await fixture.web(`/v1/quests/${fixture.first.quest.id}/review-response`, "POST", { action: "approve", response: "OK", confirmed: true, expectedUpdatedAt: fixture.first.quest.updatedAt, dryRun: false });
  const source = await fixture.web(`/v1/quests/${fixture.first.source.id}`);
  const review = await fixture.mcp("request_human_review", { questId: source.quest.id, requestKey: "image-feedback", title: "Check attached image", reason: "Image feedback", checkTarget: "Inspect the reference", completionCriteria: "Send image feedback", attachmentIds: [images.images[0]!.id], expectedUpdatedAt: source.quest.updatedAt, dryRun: false });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/tests/browser/quest-images.html?api=${encodeURIComponent(fixture.baseUrl)}&quest=${review.quest.id}&context=response`);
  await page.locator(".a4-images input[type=file]").setInputFiles({ name: "human-correction.png", mimeType: "image/png", buffer: png });
  const before = await fixture.mcp("list_quest_images", { questId: source.quest.id }) as unknown as { images: QuestImage[] }; assert.equal(before.images.length, 8);
  await page.getByRole("button", { name: "Save fixture" }).click(); await page.locator("#fixture-status").filter({ hasText: "Saved" }).waitFor();
  const after = await fixture.mcp("list_human_requests", { sourceQuestId: source.quest.id, status: "answered" });
  assert.ok(after.quests.some(q => q.humanRequest?.responseAttachmentIds?.length === 1 && q.humanRequest.response === "Please use the marked image."));
  checks.push("Web image correction persists and is returned to the MCP Agent only with the saved response");
  await context.close();
  const appContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" });
  const app = await appContext.newPage(); app.on("pageerror", error => errors.push(error.message));
  await app.goto(`${origin}/interaction-lab/all-for-adhd/?demo`);
  await app.locator(".a4-focus-title button").first().click();
  await app.locator('.a4-sheet summary').filter({ hasText: "繰り返し" }).click();
  await app.getByRole("combobox", { name: "繰り返し", exact: true }).selectOption("daily");
  await app.locator('.a4-sheet button[form="a4-sheet-form"]').click();
  await app.locator(".a4-sheet").waitFor({ state: "detached" });
  await app.locator(".a4-focus-title button").first().click();
  await app.locator('.a4-sheet summary').filter({ hasText: "繰り返し" }).click();
  assert.equal(await app.getByRole("combobox", { name: "繰り返し", exact: true }).inputValue(), "daily");
  await app.screenshot({ path: resolve(output, "afa-detail-390.png"), fullPage: true });
  checks.push("actual AFA task detail saves and restores the recurring value without losing the sheet");
  await appContext.close();
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "browser.json"), JSON.stringify({ status: "LOCAL_HTTP_BROWSER_PASS", checks, physicalDevice: "not_run", production: "not_run" }, null, 2));
  console.log(JSON.stringify({ status: "LOCAL_HTTP_BROWSER_PASS", checks: checks.length, output }));
} finally { await browser.close(); await fixture.close(); }
