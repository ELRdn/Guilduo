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
    const page = await browser.newPage({ viewport: { width, height: 915 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/tests/browser/latency-relay.html`);
    const closeLens = page.getByRole("button", { name: "Close Lens", exact: true });
    if (await closeLens.isVisible()) await closeLens.click();
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Quest名", exact: true }).fill("補助情報より先に保存したQuest");
    await page.getByRole("button", { name: "変更を保存", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Party", exact: true }).click();
    await page.getByText("この画面の情報を読み込んでいます。タスクはそのまま操作できます。", { exact: true }).waitFor();
    const overflow = await page.evaluate("document.documentElement.scrollWidth > innerWidth");
    assert.equal(overflow, false, `loading panel fits ${width}px`);
    await page.screenshot({ path: join(output, `pending-${width}.png`) });
    await page.getByRole("button", { name: "補助情報を返す", exact: true }).click();
    await page.getByText("補助処理完了", { exact: true }).waitFor();
    await page.locator(".rf-deferred-panel").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /^Command/ }).first().click();
    await page.getByRole("heading", { name: "補助情報より先に保存したQuest", exact: true }).waitFor();
    results.push(`${width}: edit during auxiliary loading, loading state, responsive, no stale overwrite`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 915 } });
  const guiTimings: string[] = [];
  page.on("console", message => { if (message.text().startsWith("guilduo_gui_timing")) guiTimings.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/tests/browser/latency-relay.html?failure`);
  await page.getByRole("button", { name: "Close Lens", exact: true }).click();
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.getByRole("button", { name: "補助情報を返す", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "計測用の一時エラー" }).waitFor();
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await page.getByText("読み込み済みのParty", { exact: true }).waitFor();
  results.push("auxiliary failure and retry recover without a full reload");

  await page.goto(`${base}/tests/browser/latency-relay.html`);
  await page.getByRole("button", { name: "Close Lens", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Quest名", exact: true }).fill("入力途中を保持");
  // The fixture control is outside the modal; click DOM button to release only
  // synthetic transport, without reaching into runtime state.
  await page.locator("#release-panels").evaluate((button: { click(): void }) => button.click());
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Quest名", exact: true }).inputValue(), "入力途中を保持");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.getByText("読み込み済みのParty", { exact: true }).waitFor();
  results.push("late auxiliary response preserves the open editor draft");

  await page.goto(`${base}/tests/browser/latency-relay.html?saving`);
  guiTimings.length = 0;
  await page.getByRole("button", { name: "Complete", exact: true }).last().click();
  await page.getByText("完了を保存しています…", { exact: true }).last().waitFor();
  assert.equal(await page.getByRole("button", { name: "Complete", exact: true }).first().isDisabled(), true);
  assert.equal((await page.locator("body").innerText()).includes("Questを完了しました"), false);
  assert.deepEqual(guiTimings, [], "no completed latency before the durable save response");
  const timingLogged = page.waitForEvent("console", { predicate: message => message.text().startsWith("guilduo_gui_timing") });
  await page.locator("#release-save").evaluate((button: { click(): void }) => button.click());
  await page.getByText("Questを完了しました", { exact: true }).first().waitFor();
  const timingMessage = await timingLogged;
  const timing = await timingMessage.args()[1].jsonValue();
  assert.equal(timing.action, "complete");
  assert.equal(typeof timing.durationMs, "number");
  assert.deepEqual(Object.keys(timing).sort(), ["action", "durationMs"]);
  results.push("completion shows pending state, blocks duplicate submit, confirms only after response");

  await page.goto(`${base}/tests/browser/latency-relay.html`);
  await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor();
  await page.locator("#dispose-shell").evaluate((button: { click(): void }) => button.click());
  await page.getByRole("button", { name: "補助情報を返す", exact: true }).click();
  await page.getByText("補助処理完了", { exact: true }).waitFor();
  assert.equal(await page.locator("#relay-forge-root").innerHTML(), "");
  results.push("late auxiliary response does not remount a disposed shell");
  assert.deepEqual(errors, []);
  await writeFile(join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS ${results.length} GUI latency browser scenarios; no page errors`);
} finally { await browser.close(); }
