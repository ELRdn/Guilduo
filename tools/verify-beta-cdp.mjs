import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const debuggerUrl = "http://127.0.0.1:9222";
const betaUrl = "http://127.0.0.1:5197/next/";
const outputDir = process.env.QF_BETA_SCREENSHOT_DIR || ".qa-artifacts/questforge-agent-beta";
await mkdir(outputDir, { recursive: true });

const target = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(betaUrl)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
let consoleErrors = [];

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails.text || "page exception");
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push("console error");
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(40); }
async function delay(ms = 250) { await new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(selector, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${selector}`);
}
async function screenshot(name) {
  const metrics = await send("Page.getLayoutMetrics");
  const size = metrics.cssContentSize;
  const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
  await writeFile(join(outputDir, name), Buffer.from(capture.data, "base64"));
}
async function noOverflow(label) {
  if (await evaluate("document.documentElement.scrollWidth > window.innerWidth")) throw new Error(`${label}: horizontal overflow`);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
await delay(500);
await evaluate("localStorage.clear(); location.reload()");
await waitFor(".beta-badge");
if (await evaluate('document.querySelector(".beta-badge").textContent') !== "BETA") throw new Error("BETA badge missing");
if (!String(await evaluate('document.querySelector(".legacy-link").textContent')).includes("現行版へ戻る")) throw new Error("Legacy link missing");
await noOverflow("desktop today");
await screenshot("01-desktop-today.png");

await click("#openAddDialog");
await evaluate('document.querySelector("#questNameInput").value="公開βブラウザ検証"');
await click('#addForm button[type="submit"]');
if (await evaluate('document.querySelector("#selectedTitle").textContent') !== "公開βブラウザ検証") throw new Error("Add failed");
await click("#editQuestButton");
await evaluate('document.querySelector("#editQuestTitle").value="公開βブラウザ検証・編集済み"; document.querySelector("#editQuestNotes").value="追加、編集、再読み込みを確認"');
await click('#editForm button[type="submit"]');
if (await evaluate('document.querySelector("#selectedTitle").textContent') !== "公開βブラウザ検証・編集済み") throw new Error("Edit failed");
await click("#archiveQuestButton");
await click("#toggleArchived");
if (await evaluate('document.querySelector("#toggleArchived").textContent') !== "保管済みを隠す") throw new Error("Archive visibility toggle failed");
await evaluate(`[...document.querySelectorAll("[data-quest]")].find((row) => row.textContent.includes("公開βブラウザ検証・編集済み"))?.click()`);
if (await evaluate('document.querySelector("#archiveQuestButton").textContent') !== "戻す") throw new Error("Archived Quest selection failed");
await click("#archiveQuestButton");
if (await evaluate('document.querySelector("#archiveQuestButton").textContent') !== "保管") throw new Error("Restore failed");
await click("#toggleArchived");
if (await evaluate('document.querySelector("#toggleArchived").textContent') !== "保管済みを表示") throw new Error("Archive hide toggle failed");
await evaluate(`document.querySelector('[data-quest="qf-ui"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))`);
await evaluate(`document.querySelector('[data-quest="qf-mobile"]').dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }))`);
if (await evaluate('document.querySelector("#selectionCount").textContent') !== "2件選択") throw new Error("Shift range selection failed");
await click("#clearSelection");
await evaluate("location.reload()"); await waitFor(".beta-badge");
if (await evaluate('document.querySelector("#selectedTitle").textContent') !== "公開βブラウザ検証・編集済み") throw new Error("Reload persistence failed");

await click('[data-view="settings"]');
if (!await evaluate('!document.querySelector("#agentForm").closest("[hidden]") && document.querySelector("#agentForm").offsetParent !== null')) throw new Error("Agent form hidden");
await click('[data-detail-mode="modal"]');
if (!await evaluate('document.querySelector("[data-detail-mode=modal]").getAttribute("aria-pressed") === "true"')) throw new Error("Detail mode setting failed");
await click('[data-setting="typeScale"]'); await click('[data-setting="density"]');
if (!await evaluate('document.body.classList.contains("is-large-type") && document.body.classList.contains("is-relaxed-density")')) throw new Error("Settings failed");
await noOverflow("desktop settings");
await screenshot("02-desktop-agent-settings.png");
for (const view of ["tree", "battle", "party", "integrations"]) { await click(`[data-view="${view}"]`); if (await evaluate(`document.querySelector('[data-panel="${view}"]').hidden`)) throw new Error(`${view} hidden`); await noOverflow(`desktop ${view}`); }
await screenshot("03-desktop-integrations.png");

for (const [width, file, view] of [[412, "04-pixel9-settings.png", "settings"], [360, "05-mobile-today.png", "today"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 915, deviceScaleFactor: 1, mobile: false });
  await evaluate("location.reload()"); await waitFor(".beta-badge");
  if (view === "settings") { await click("#mobileMoreToggle"); await click('.mobile-more-menu [data-view="settings"]'); }
  else await click('[data-view="today"]');
  if (view === "today") {
    await click('[data-quest="qf-ui"]');
    if (!await evaluate('document.body.classList.contains("is-detail-modal") && document.querySelector(".selected-panel").classList.contains("is-mobile-open")')) throw new Error("Mobile popup detail failed");
    await click("#selectedSheetToggle");
    if (await evaluate('document.body.classList.contains("is-detail-modal")')) throw new Error("Mobile popup close failed");
  }
  await noOverflow(`mobile ${width}`);
  await screenshot(file);
}

if (consoleErrors.length) throw new Error(consoleErrors.join("\n"));
await fetch(`${debuggerUrl}/json/close/${target.id}`, { method: "PUT" });
socket.close();
console.log(`QuestForge beta CDP verification passed. ${outputDir}`);
