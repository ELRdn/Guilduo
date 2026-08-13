const debuggerUrl = process.env.QF_LAB_DEBUG_URL || "http://127.0.0.1:9222";
const labUrl = process.env.QF_LAB_URL || "http://127.0.0.1:5191/interaction-lab/";

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

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

await new Promise((resolve) => setTimeout(resolve, 300));
await evaluate('localStorage.removeItem("questforge-interaction-settings"); localStorage.removeItem("questforge-interaction-lab-state"); localStorage.removeItem("questforge-interaction-lab-local-backup"); location.reload()');
await new Promise((resolve) => setTimeout(resolve, 300));

await click('[data-quest="qf-mobile"]');
await click("#reviewButton");
await evaluate('document.querySelector("#reviewNote").value = "Pixel 9で選択バーから詳細を開けることを確認"');
await click('#reviewForm button[type="submit"]');
const reviewState = await evaluate('document.querySelector("[data-quest=\\"qf-mobile\\"] .state-pill").textContent');
if (reviewState !== "完了") throw new Error(`レビュー承認の状態が不正です: ${reviewState}`);

await click("#openAddDialog");
await evaluate('document.querySelector("#questNameInput").value = "検証用の新規Quest"');
await click('#addForm button[type="submit"]');
const addedTitle = await evaluate('document.querySelector("#selectedTitle").textContent');
if (addedTitle !== "検証用の新規Quest") throw new Error(`新規Questの選択が不正です: ${addedTitle}`);
await evaluate('location.reload()');
await new Promise((resolve) => setTimeout(resolve, 300));
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
await click('[data-setting="typeScale"]');
const largeType = await evaluate('document.body.classList.contains("is-large-type")');
if (!largeType) throw new Error("文字サイズ設定が反映されていません。");
await click('[data-setting="density"]');
const retainedLargeType = await evaluate('document.body.classList.contains("is-large-type") && document.body.classList.contains("is-relaxed-density")');
if (!retainedLargeType) throw new Error("設定を複数変更したときに表示設定が保持されません。");
await evaluate('location.reload()');
await new Promise((resolve) => setTimeout(resolve, 300));
const persistedSettings = await evaluate('document.body.classList.contains("is-large-type") && document.body.classList.contains("is-relaxed-density")');
if (!persistedSettings) throw new Error("再読み込み後に表示設定が保持されません。");
await click('[data-view="profile"]');
const profileTitle = await evaluate('document.querySelector("#profileTitle").textContent');
if (!profileTitle.includes("Astra")) throw new Error(`プロフィールへの移動が不正です: ${profileTitle}`);

const desktopOverflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
if (desktopOverflow) throw new Error("デスクトップで横スクロールが発生しています。");

await send("Emulation.setDeviceMetricsOverride", {
  width: 412,
  height: 915,
  deviceScaleFactor: 1,
  mobile: false
});
await new Promise((resolve) => setTimeout(resolve, 100));
await click('[data-view="today"]');
await click('[data-quest="qf-ui"]');
const sheetClosed = await evaluate('!document.querySelector(".selected-panel").classList.contains("is-mobile-open")');
if (!sheetClosed) throw new Error("モバイルのQuest選択時に詳細シートが閉じていません。");
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

await evaluate('localStorage.removeItem("questforge-interaction-settings"); localStorage.removeItem("questforge-interaction-lab-state"); localStorage.removeItem("questforge-interaction-lab-local-backup"); location.reload()');

console.log("Interaction Lab verification passed: review, add, battle, integration, profile, settings, desktop and mobile flows.");
socket.close();
