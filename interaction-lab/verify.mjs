import fs from "node:fs/promises";
import path from "node:path";

const debuggerUrl = process.env.QF_LAB_DEBUG_URL || "http://127.0.0.1:9222";
const labUrl = process.env.QF_LAB_URL || "http://127.0.0.1:5191/interaction-lab/";
const screenshotDir = process.env.QF_LAB_SCREENSHOT_DIR || path.join(process.cwd(), "screenshots");

const target = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(labUrl)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: labUrl });
await new Promise((resolve) => setTimeout(resolve, 700));

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function reloadPage() {
  await send("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

async function screenshot(name) {
  await fs.mkdir(screenshotDir, { recursive: true });
  const result = await send("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(path.join(screenshotDir, name), Buffer.from(result.data, "base64"));
}

await new Promise((resolve) => setTimeout(resolve, 300));
console.log("Interaction Lab target:", await evaluate("({ href: location.href, origin: location.origin, readyState: document.readyState })"));
await evaluate('localStorage.removeItem("questforge-interaction-settings"); localStorage.removeItem("questforge-interaction-lab-state"); localStorage.removeItem("questforge-interaction-lab-local-backup"); localStorage.removeItem("questforge-interaction-auto-connect"); localStorage.removeItem("questforge-interaction-archive-visible")');
await reloadPage();

for (let index = 0; index < 14; index += 1) {
  await click("#openAddDialog");
  await evaluate(`document.querySelector("#questNameInput").value = "スクロール検証Quest ${index + 1}"`);
  await click('#addForm button[type="submit"]');
  await new Promise((resolve) => setTimeout(resolve, 25));
}

await click('[data-view="tree"]');
await new Promise((resolve) => setTimeout(resolve, 200));
const treeScroll = await evaluate(`(() => {
  const list = document.querySelector("#treeList");
  const note = document.querySelector(".tree-note");
  const before = note.getBoundingClientRect().top;
  list.scrollTop = 9999;
  return {
    bodyOverflow: getComputedStyle(document.body).overflowY,
    workspaceOverflow: getComputedStyle(document.querySelector(".workspace")).overflowY,
    listOverflow: getComputedStyle(list).overflowY,
    listScrollTop: list.scrollTop,
    listHasRoom: list.scrollHeight <= list.clientHeight || list.scrollTop > 0,
    pageOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
    noteTopStable: Math.abs(before - note.getBoundingClientRect().top) < 1,
    account: document.querySelector("#treeNoteAccount")?.textContent,
    active: document.querySelector("#treeActiveCount")?.textContent
  };
})()`);
if (treeScroll.bodyOverflow !== "hidden" || treeScroll.workspaceOverflow !== "hidden" || treeScroll.listOverflow !== "auto" || treeScroll.pageOverflow || !treeScroll.noteTopStable || !treeScroll.listHasRoom) {
  throw new Error(`Quest Treeのスクロール境界が不正です: ${JSON.stringify(treeScroll)}`);
}
await screenshot("interaction-lab-tree-desktop.png");
await click('[data-view="today"]');
await new Promise((resolve) => setTimeout(resolve, 150));

const desktopScroll = await evaluate(`(() => {
  const list = document.querySelector("#questList");
  list.scrollTop = 9999;
  return {
    bodyOverflow: getComputedStyle(document.body).overflowY,
    workspaceOverflow: getComputedStyle(document.querySelector(".workspace")).overflowY,
    listOverflow: getComputedStyle(list).overflowY,
    listFocusedRegion: list.getAttribute("role") === "region" && list.tabIndex === 0,
    listScrollTop: list.scrollTop
  };
})()`);
if (desktopScroll.bodyOverflow !== "hidden" || desktopScroll.workspaceOverflow !== "hidden" || desktopScroll.listOverflow !== "auto") {
  throw new Error(`デスクトップのスクロール境界が不正です: ${JSON.stringify(desktopScroll)}`);
}
if (!desktopScroll.listFocusedRegion || desktopScroll.listScrollTop < 0) throw new Error("タスク欄のアクセシブルなスクロール領域が不正です。");

await click('[data-quest="qf-mobile"]');
await click("#reviewButton");
await evaluate('document.querySelector("#reviewNote").value = "Pixel 9で選択バーから詳細を開けることを確認"');
await click('#reviewForm button[type="submit"]');
await click('[data-archive-toggle]');
const reviewState = await evaluate('document.querySelector("[data-quest=\\"qf-mobile\\"] .state-pill")?.textContent || document.querySelector("#selectedState")?.textContent || ""');
if (reviewState !== "完了") throw new Error(`レビュー承認の状態が不正です: ${reviewState}`);

await click("#openAddDialog");
await evaluate('document.querySelector("#questNameInput").value = "検証用の新規Quest"');
await click('#addForm button[type="submit"]');
const addedTitle = await evaluate('document.querySelector("#selectedTitle").textContent');
if (addedTitle !== "検証用の新規Quest") throw new Error(`新規Questの選択が不正です: ${addedTitle}`);
await reloadPage();
const persistedQuest = await evaluate('document.querySelector("#selectedTitle").textContent');
if (persistedQuest !== "検証用の新規Quest") throw new Error(`再読み込み後にQuestが保持されません: ${persistedQuest}`);

await click('[data-view="battle"]');
const beforeBattle = await evaluate('document.querySelector("#battleBossHp").textContent');
await click('[data-command="attack"]');
const afterBattle = await evaluate('document.querySelector("#battleBossHp").textContent');
if (Number(afterBattle) !== Number(beforeBattle) - 9) throw new Error(`バトルダメージが不正です: ${beforeBattle} -> ${afterBattle}`);

await click('[data-view="integrations"]');
await click('[data-integration="focus"]');
const integrationTitle = await evaluate('document.querySelector("#integrationTitle").textContent');
if (!integrationTitle.includes("集中時間")) throw new Error(`連携切替が不正です: ${integrationTitle}`);

await click('[data-view="settings"]');
await evaluate('document.querySelector(".settings-connection-card").scrollIntoView({ block: "center" })');
await screenshot("interaction-lab-settings-autoconnect.png");
await click('[data-setting="typeScale"]');
const largeType = await evaluate('document.body.classList.contains("is-large-type")');
if (!largeType) throw new Error("文字サイズ設定が反映されていません。");
await click('[data-setting="density"]');
const retainedLargeType = await evaluate('document.body.classList.contains("is-large-type") && document.body.classList.contains("is-relaxed-density")');
if (!retainedLargeType) throw new Error("設定を複数変更したときに表示設定が保持されません。");
await reloadPage();
const persistedSettings = await evaluate('document.body.classList.contains("is-large-type") && document.body.classList.contains("is-relaxed-density")');
if (!persistedSettings) throw new Error("再読み込み後に表示設定が保持されません。");
await click('[data-detail-mode="modal"]');
const modalSetting = await evaluate('document.querySelector("[data-detail-mode=modal]").getAttribute("aria-pressed") === "true"');
if (!modalSetting) throw new Error("ポップアップ表示設定が反映されていません。");
await reloadPage();
const persistedDetailMode = await evaluate('document.querySelector("[data-detail-mode=modal]").getAttribute("aria-pressed") === "true"');
if (!persistedDetailMode) throw new Error("再読み込み後にQuest詳細表示設定が保持されません。");
await click('[data-view="profile"]');
const profileTitle = await evaluate('document.querySelector("#profileTitle").textContent');
if (!profileTitle.includes("プロフィール")) throw new Error(`プロフィールへの移動が不正です: ${profileTitle}`);

const desktopOverflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
if (desktopOverflow) throw new Error("デスクトップで横スクロールが発生しています。");

await send("Emulation.setDeviceMetricsOverride", {
  width: 412,
  height: 915,
  deviceScaleFactor: 1,
  mobile: false
});
await new Promise((resolve) => setTimeout(resolve, 100));
await click('[data-view="tree"]');
const mobileTreeScroll = await evaluate(`(() => {
  const list = document.querySelector("#treeList");
  return {
    bodyOverflow: getComputedStyle(document.body).overflowY,
    listOverflow: getComputedStyle(list).overflowY,
    pageScroll: document.documentElement.scrollHeight > window.innerHeight
  };
})()`);
if (mobileTreeScroll.bodyOverflow !== "auto" || mobileTreeScroll.listOverflow !== "visible" || !mobileTreeScroll.pageScroll) {
  throw new Error(`モバイルQuest Treeのスクロール設定が不正です: ${JSON.stringify(mobileTreeScroll)}`);
}
await screenshot("interaction-lab-tree-mobile.png");
await click('[data-view="today"]');
const mobileScroll = await evaluate(`(() => {
  const list = document.querySelector("#questList");
  return {
    bodyOverflow: getComputedStyle(document.body).overflowY,
    workspaceOverflow: getComputedStyle(document.querySelector(".workspace")).overflowY,
    listOverflow: getComputedStyle(list).overflowY
  };
})()`);
if (mobileScroll.bodyOverflow !== "auto" || mobileScroll.workspaceOverflow !== "visible" || mobileScroll.listOverflow !== "visible") {
  throw new Error(`モバイルのページスクロール設定が不正です: ${JSON.stringify(mobileScroll)}`);
}
await click('[data-quest="qf-ui"]');
const popupOpen = await evaluate('document.body.classList.contains("is-detail-modal") && document.querySelector(".selected-panel").classList.contains("is-mobile-open")');
if (!popupOpen) throw new Error("モバイルのQuest選択時に詳細ポップアップが開きません。");
await click("#selectedSheetToggle");
const popupClosed = await evaluate('!document.body.classList.contains("is-detail-modal") && !document.querySelector(".selected-panel").classList.contains("is-mobile-open")');
if (!popupClosed) throw new Error("モバイルの詳細ポップアップを閉じられません。");
await click('[data-view="settings"]');
await click('[data-detail-mode="sheet"]');
await click('[data-view="today"]');
await click('[data-quest="qf-ui"]');
const sheetClosed = await evaluate('!document.querySelector(".selected-panel").classList.contains("is-mobile-open")');
if (!sheetClosed) throw new Error("モバイルのQuest選択時に詳細シートが開いたままです。");
await click("#selectedSheetToggle");
const sheetOpen = await evaluate('document.querySelector(".selected-panel").classList.contains("is-mobile-open")');
if (!sheetOpen) throw new Error("モバイルの詳細シートを開けません。");
await click("#mobileMoreToggle");
await click('.mobile-more-menu [data-view="integrations"]');
const integrationPanelOpen = await evaluate('!document.querySelector("[data-panel=\\"integrations\\"]").hidden');
if (!integrationPanelOpen) throw new Error("モバイルの連携タブを開けません。");
await click("#mobileMoreToggle");
await click('.mobile-more-menu [data-view="settings"]');
const settingsPanelOpen = await evaluate('!document.querySelector("[data-panel=\\"settings\\"]").hidden');
if (!settingsPanelOpen) throw new Error("モバイルの設定タブを開けません。");
const mobileOverflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
if (mobileOverflow) throw new Error("モバイルで横スクロールが発生しています。");

await evaluate('localStorage.removeItem("questforge-interaction-settings"); localStorage.removeItem("questforge-interaction-lab-state"); localStorage.removeItem("questforge-interaction-lab-local-backup"); localStorage.removeItem("questforge-interaction-auto-connect"); localStorage.removeItem("questforge-interaction-archive-visible"); location.reload()');

console.log("Interaction Lab verification passed: review, add, battle, integration, profile, settings, desktop and mobile flows.");
socket.close();
