import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://127.0.0.1:5183";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = join(process.cwd(), ".qa-artifacts", "latency-investigation", "browser");
await mkdir(output, { recursive: true });
// Synthetic fixtures only, with an isolated temporary browser profile.
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
const errors: string[] = [];
const results: string[] = [];
try {
  for (const width of [320, 412, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 915 }, locale: "ja" });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/tests/browser/latency-relay.html`);
    await page.keyboard.press("Escape");
    await page.locator('[data-quest-action="edit"]:visible').first().click();
    await page.locator('dialog[open] input[name="title"]').fill("補助情報より先に保存したQuest");
    await page.locator("dialog[open] .rf-create-submit").click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    if (!await page.getByRole("button", { name: "Party", exact: true }).isVisible()) await page.locator(".rf-nav-more").click();
    await page.getByRole("button", { name: "Party", exact: true }).click();
    await page.getByText("この画面の情報を読み込んでいます。タスクはそのまま操作できます。", { exact: true }).waitFor();
    const overflow = await page.evaluate("document.documentElement.scrollWidth > innerWidth");
    assert.equal(overflow, false, `loading panel fits ${width}px`);
    await page.screenshot({ path: join(output, `pending-${width}.png`) });
    await page.getByRole("button", { name: "補助情報を返す", exact: true }).click();
    await page.getByText("補助処理完了", { exact: true }).waitFor();
    await page.locator(".rf-deferred-panel").waitFor({ state: "hidden" });
    await page.locator('.rf-nav-item:has(.rf-nav-glyph[data-domain="command"])').click();
    await page.getByRole("heading", { name: "補助情報より先に保存したQuest", exact: true }).waitFor();
    results.push(`${width}: edit during auxiliary loading, loading state, responsive, no stale overwrite`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 915 }, locale: "ja" });
  const guiTimings: string[] = [];
  page.on("console", message => { if (message.text().startsWith("guilduo_gui_timing")) guiTimings.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/tests/browser/latency-relay.html?failure`);
  await page.keyboard.press("Escape");
  if (!await page.getByRole("button", { name: "Party", exact: true }).isVisible()) await page.locator(".rf-nav-more").click();
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.getByRole("button", { name: "補助情報を返す", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "計測用の一時エラー" }).waitFor();
  await page.locator(".rf-deferred-panel .rf-secondary-button").click();
  await page.getByText("読み込み済みのParty", { exact: true }).waitFor();
  results.push("auxiliary failure and retry recover without a full reload");

  await page.goto(`${base}/tests/browser/latency-relay.html`);
  await page.keyboard.press("Escape");
  await page.locator('[data-quest-action="edit"]:visible').first().click();
  await page.locator('dialog[open] input[name="title"]').fill("入力途中を保持");
  // The fixture control is outside the modal; click DOM button to release only
  // synthetic transport, without reaching into runtime state.
  await page.locator("#release-panels").evaluate((button: { click(): void }) => button.click());
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  assert.equal(await page.locator('dialog[open] input[name="title"]').inputValue(), "入力途中を保持");
  await page.locator("dialog[open]").getByRole("button", { name: "キャンセル", exact: true }).click();
  if (!await page.getByRole("button", { name: "Party", exact: true }).isVisible()) await page.locator(".rf-nav-more").click();
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.getByText("読み込み済みのParty", { exact: true }).waitFor();
  results.push("late auxiliary response preserves the open editor draft");

  await page.goto(`${base}/tests/browser/latency-relay.html?saving`);
  guiTimings.length = 0;
  await page.locator('[data-quest-action="complete"]:visible').last().click();
  await page.getByText("完了を保存しています…", { exact: true }).last().waitFor();
  assert.equal(await page.locator('[data-quest-action="complete"]:visible').first().isDisabled(), true);
  assert.equal((await page.locator("body").innerText()).includes("Questを完了しました"), false);
  assert.deepEqual(guiTimings, [], "no completed latency before the durable save response");
  const timingLogged = page.waitForEvent("console", { predicate: message => message.text().startsWith("guilduo_gui_timing") });
  await page.locator("#release-save").evaluate((button: { click(): void }) => button.click());
  await page.getByText("Questを完了しました", { exact: true }).first().waitFor();
  const timingMessage = await timingLogged;
  const timing = JSON.parse(timingMessage.text().slice("guilduo_gui_timing ".length));
  assert.equal(timing.action, "complete");
  assert.equal(typeof timing.durationMs, "number");
  assert.deepEqual(Object.keys(timing).sort(), ["action", "durationMs"]);
  results.push("completion shows pending state, blocks duplicate submit, confirms only after response");

  await page.goto(`${base}/tests/browser/latency-relay.html?battle-delay`);
  await page.locator('[data-quest-action="complete"]:visible').last().click();
  await page.getByText("Questを完了しました", { exact: true }).first().waitFor();
  await page.locator("#release-panels").click();
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Battle", exact: true }).isVisible()) await page.locator(".rf-nav-more").click();
    await page.getByRole("button", { name: "Battle", exact: true }).click();
  await page.locator('.rf-b-meter[data-tone="mp"] .rf-b-meter-value').waitFor();
  assert.match(await page.locator('.rf-b-meter[data-tone="mp"] .rf-b-meter-value').textContent() || "", /^20/);
  results.push("late initial Battle snapshot cannot overwrite MP earned by completion");

  await page.goto(`${base}/tests/browser/latency-relay.html?battle-empty`);
  await page.locator("#release-panels").click();
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Battle", exact: true }).isVisible()) await page.locator(".rf-nav-more").click();
    await page.getByRole("button", { name: "Battle", exact: true }).click();
  await page.locator(".rf-screen-empty").waitFor();
  assert.equal(await page.locator(".rf-b-meter").count(), 0);
  results.push("missing production Battle session remains empty instead of showing demo state");

  await page.goto(`${base}/tests/browser/latency-relay.html?battle-refresh-failure`);
  await page.locator("#release-panels").click();
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  await page.locator('[data-quest-action="complete"]:visible').last().click();
  await page.getByText("Questを完了しました", { exact: true }).first().waitFor();
  if (!await page.getByRole("button", { name: "Battle", exact: true }).isVisible()) await page.locator(".rf-nav-more").click();
    await page.getByRole("button", { name: "Battle", exact: true }).click();
  await page.locator(".rf-deferred-panel [role=alert]").waitFor();
  await page.locator(".rf-deferred-panel button").click();
  await page.locator('.rf-b-meter[data-tone="mp"] .rf-b-meter-value').waitFor();
  assert.match(await page.locator('.rf-b-meter[data-tone="mp"] .rf-b-meter-value').textContent() || "", /^20/);
  results.push("Battle refresh failure keeps completion and retries only the Battle read");

  await page.goto(`${base}/tests/browser/latency-relay.html`);
  await page.locator('[data-quest-action="edit"]:visible').first().waitFor();
  await page.locator("#dispose-shell").evaluate((button: { click(): void }) => button.click());
  await page.getByRole("button", { name: "補助情報を返す", exact: true }).click();
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  assert.equal(await page.locator("#relay-forge-root").innerHTML(), "");
  results.push("late auxiliary response does not remount a disposed shell");
  assert.deepEqual(errors, []);
  await writeFile(join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS ${results.length} GUI latency browser scenarios; no page errors`);
} finally { await browser.close(); }
