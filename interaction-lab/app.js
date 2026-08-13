import {
  QuestForgeRepository,
  QuestForgeApiError,
  gatewayDefaultUrl,
  readLabState,
  writeLabState,
  writeLocalBackup,
} from "./repository.mjs";
import { currentUser, getIdToken, observeAuth, signIn, signOutUser } from "./auth.mjs";

const state = {
  view: "today",
  mp: 68,
  bossHp: 71,
  selectedQuestId: "qf-ui",
  expanded: new Set(["qf-ui"]),
  mobileSheetOpen: false,
  mobileMoreOpen: false,
  priorityOnly: false,
  sort: "due",
  timerSeconds: 25 * 60,
  timerId: null,
  integration: "calendar",
  dataSource: "local",
  syncStatus: "local-only",
  gatewayUrl: gatewayDefaultUrl(),
  lastSyncAt: "",
  authUser: null,
  remoteMode: false,
  remoteIntegrations: [],
  battleSession: null,
  battleTurn: 1,
  settings: {
    typeScale: false,
    density: false,
    motion: true,
    sound: true
  },
  battleLog: ["Questを完了するとMPを獲得できる。", "Deadline Wraithが待ち構えている。"],
  quests: [
    { id: "qf-ui", code: "01", kind: "main", title: "QuestForgeの操作設計を固める", note: "Forge Opsの操作原型を試して、採用する流れを決める。", progress: 72, owner: "Astra", mark: "AS", state: "working", due: "今日 18:00", focus: 45, reward: 20, xp: 120, difficulty: 4, children: ["qf-desktop", "qf-mobile"] },
    { id: "qf-desktop", code: "01.1", kind: "sub", parent: "qf-ui", title: "PCの司令室を試す", note: "一覧、担当、レビュー、ボス圧を一画面で判断する。", progress: 100, owner: "Cyan", mark: "C/", state: "completed", due: "完了済み", focus: 30, reward: 14, xp: 72, difficulty: 2 },
    { id: "qf-mobile", code: "01.2", kind: "sub", parent: "qf-ui", title: "Pixel 9の操作を試す", note: "縦長画面で、今日のQuestを選んで完了まで進める。", progress: 45, owner: "Cyan", mark: "C/", state: "review", due: "今日 20:00", focus: 60, reward: 20, xp: 96, difficulty: 3 },
    { id: "toggl", code: "02", kind: "side", title: "Toggl Focusの連携導線を確認する", note: "接続、対象選択、プレビュー、確定の順番を検証する。", progress: 38, owner: "Astra", mark: "AS", state: "blocked", due: "明日 13:00", focus: 25, reward: 20, xp: 108, difficulty: 4 },
    { id: "locale", code: "03", kind: "side", title: "10言語の表示長を確認する", note: "長いラベルでもテーブルとモバイル表示が崩れないようにする。", progress: 15, owner: "Archivist", mark: "A", state: "ready", due: "8/22 11:00", focus: 30, reward: 14, xp: 68, difficulty: 2 }
  ]
};

const savedLabState = readLabState();
if (savedLabState) {
  Object.assign(state, savedLabState);
  state.expanded = new Set(savedLabState.expanded || ["qf-ui"]);
  state.timerId = null;
}
try {
  const savedGatewayUrl = localStorage.getItem("questforge-interaction-lab-gateway-url");
  if (savedGatewayUrl) state.gatewayUrl = savedGatewayUrl;
} catch {
  // Keep the configured default when local storage is unavailable.
}

// Reloading never silently mutates the live account. The user explicitly reconnects from Settings.
state.dataSource = "local";
state.syncStatus = "local-only";
state.remoteMode = false;
state.authUser = null;

try {
  const savedSettings = JSON.parse(localStorage.getItem("questforge-interaction-settings") || "null");
  if (savedSettings && typeof savedSettings === "object") {
    state.settings = { ...state.settings, ...savedSettings };
  }
} catch {
  // Keep the safe defaults when a local setting payload is malformed.
}

const partyMembers = [
  { name: "Astra", identity: "HUMAN / SENTINEL", role: "Player / 操作設計", mark: "AS", state: "working", task: "Forge Opsの採用フローを決める", avatar: "../assets/avatar-role-femme-sentinel.png" },
  { name: "Cyan", identity: "AGENT / ENGINEER", role: "UI / 実装", mark: "C/", state: "review", task: "Pixel 9の操作を返却" },
  { name: "Archivist", identity: "AGENT / ARCHIVIST", role: "翻訳 / 記録", mark: "A", state: "working", task: "長い表示文を確認中" },
  { name: "Operator", identity: "AGENT / OPERATOR", role: "MCP / 連携", mark: "O", state: "blocked", task: "接続設定を待機中" }
];

const integrations = [
  { id: "calendar", name: "Google Calendar", short: "GC", state: "接続済み", copy: "予定を読み取り専用で作戦画面へ表示", title: "予定を読み取り専用で表示", detail: "Questを勝手に作らず、今日の作戦に予定枠として置きます。", lastSync: "今日 16:30", scope: "2 calendars", nextStep: "予定枠を確認", activity: ["予定 6件を読み取り", "Questへの変換は未実行", "次回の差分確認は 16:45"] },
  { id: "tasks", name: "Google Tasks", short: "GT", state: "準備完了", copy: "削除なしでQuestと同期", title: "削除なしの双方向同期", detail: "タイトル、期限、完了状態だけを同期し、QuestForge固有の情報は守ります。", lastSync: "未接続", scope: "1 task list", nextStep: "同期先リストを選択", activity: ["削除は同期しない", "タイトル・期限・完了状態だけ対象", "初回は必ずプレビュー"] },
  { id: "notion", name: "Notion", short: "N", state: "計画中", copy: "日次ログをQuestForge Logsへ出力", title: "日次ログをまとめて出力", detail: "一日一行の記録として、XP・Gem・MP・集中時間をNotionへ送ります。", lastSync: "未接続", scope: "QuestForge Logs", nextStep: "親ページを選択", activity: ["日次ログは1日1行", "失敗分は再試行キューへ", "Quest本体は変更しない"] },
  { id: "focus", name: "Toggl Focus", short: "TF", state: "接続済み", copy: "時間をQuestの集中実績へ変換", title: "集中時間をQuestの実績へ変換", detail: "対象アプリの情報を保存せず、時間だけをQuestの実績として確認します。", lastSync: "今日 16:20", scope: "Focus session", nextStep: "45分をQuestへ反映", activity: ["直近セッション: 25分", "対象アプリの詳細は保存しない", "MP換算は確認後に実行"] }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const quest = (id) => state.quests.find((item) => item.id === id);
const repository = new QuestForgeRepository({ baseUrl: state.gatewayUrl, getToken: getIdToken });

function persistState() {
  writeLabState(state);
}

function formatSyncTime(value = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function setSyncStatus(status, message = "") {
  state.syncStatus = status;
  const statusNode = $("#dataSourceStatus");
  const userNode = $("#connectionUser");
  if (statusNode) {
    const labels = { "local-only": "この端末に保存中", synced: "QuestForge本体と同期済み", syncing: "QuestForge本体を確認中…", error: "接続エラー。ローカルデータを維持中" };
    statusNode.textContent = message || labels[status] || status;
    statusNode.dataset.status = status;
  }
  if (userNode) userNode.textContent = state.authUser?.email ? state.authUser.email : "Googleログイン前。ローカルモードで利用中";
  const signInButton = $("#signInButton");
  const signOutButton = $("#signOutButton");
  const loadButton = $("#loadRemoteButton");
  if (signInButton) signInButton.hidden = Boolean(state.authUser);
  if (signOutButton) signOutButton.hidden = !state.authUser;
  if (loadButton) loadButton.disabled = !state.authUser || status === "syncing";
}

function localMode(message = "ローカルモードで利用中") {
  state.remoteMode = false;
  state.dataSource = "local";
  setSyncStatus("local-only", message);
  persistState();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function difficultyValue(value) {
  if (typeof value === "number") return Math.max(1, Math.min(5, value));
  return { trivial: 1, easy: 2, medium: 3, hard: 4, very_hard: 5 }[String(value || "").toLowerCase()] || 2;
}

function displayDue(value) {
  if (!value) return "期限未設定";
  const raw = String(value);
  const datePart = raw.slice(0, 10);
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const prefix = datePart === todayKey ? "今日" : datePart === tomorrowKey ? "明日" : `${date.getMonth() + 1}/${date.getDate()}`;
  if (raw.length === 10) return prefix;
  return `${prefix} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function remoteState(task) {
  const handoff = task.assignee?.handoffState || task.handoff?.state || task.handoffState;
  if (task.lifecycleState === "completed" || task.lifecycleState === "archived" || task.done) return "completed";
  if (handoff === "review_required") return "review";
  if (handoff === "blocked") return "blocked";
  if (handoff === "working") return "working";
  return "ready";
}

function remoteQuestToLab(task, index = 0) {
  const parent = task.parentQuestId || "";
  const progress = Number(task.progressPercent ?? task.progress ?? task.childrenSummary?.progressPercent ?? 0);
  const owner = task.assignee?.displayName || task.assignee?.name || task.assignee?.agentId || "Astra";
  const kind = parent ? "sub" : task.kind === "todo" ? "side" : "main";
  const reward = Number(task.mpGain ?? task.reward?.mp ?? task.reward ?? (task.kind === "habit" ? 6 : task.kind === "daily" ? 14 : 20));
  return {
    id: task.id,
    code: task.code || (parent ? `01.${index + 1}` : String(index + 1).padStart(2, "0")),
    kind,
    parent,
    title: task.title || "名称未設定のQuest",
    note: task.notes || "",
    progress: task.lifecycleState === "completed" || task.done ? 100 : Math.max(0, Math.min(100, Math.round(progress))),
    owner,
    mark: partyMember(owner)?.mark || owner.slice(0, 2).toUpperCase(),
    state: remoteState(task),
    due: displayDue(task.dueDate || task.scheduledDate),
    focus: Number(task.estimatedMinutes || 30),
    reward: Number.isFinite(reward) ? reward : 14,
    xp: Number(task.xpGain || task.xp || 60),
    difficulty: difficultyValue(task.difficulty),
    children: [],
    remote: true,
  };
}

function hydrateRemoteSnapshot(snapshot) {
  writeLocalBackup(state);
  const remoteQuests = (snapshot.quests || []).map((item, index) => remoteQuestToLab(item, index));
  remoteQuests.forEach((item) => {
    item.children = remoteQuests.filter((child) => child.parent === item.id).map((child) => child.id);
  });
  state.quests = remoteQuests;
  state.remoteIntegrations = snapshot.integrations || [];
  state.battleSession = snapshot.battle || null;
  state.battleTurn = Number(snapshot.battle?.battle?.turn || 1);
  state.battleLog = snapshot.battle?.battle?.log || state.battleLog;
  state.mp = Number(snapshot.battle?.battle?.mp ?? snapshot.character?.mp ?? state.mp);
  state.bossHp = Number(snapshot.battle?.boss?.hp ?? snapshot.character?.boss?.hp ?? state.bossHp);
  state.remoteMode = true;
  state.dataSource = "remote";
  state.lastSyncAt = formatSyncTime();
  state.expanded = new Set([...state.expanded].filter((id) => remoteQuests.some((item) => item.id === id)));
  if (!quest(state.selectedQuestId)) state.selectedQuestId = remoteQuests[0]?.id || "";
}

async function loadRemoteData({ announce = true } = {}) {
  if (!state.authUser) {
    notify("先にGoogleログインを完了してください。ローカルモードはそのまま使えます。");
    return false;
  }
  const inputUrl = $("#gatewayUrlInput")?.value.trim() || state.gatewayUrl || gatewayDefaultUrl();
  state.gatewayUrl = inputUrl;
  repository.setBaseUrl(inputUrl);
  localStorage.setItem("questforge-interaction-lab-gateway-url", inputUrl);
  setSyncStatus("syncing");
  try {
    const health = await repository.health();
    if (Number(health?.schemaVersion || 0) < 6) {
      throw new QuestForgeApiError(409, "gateway_outdated", "接続先Workerが旧版です。Workerを最新版へデプロイしてから本体データを読み込んでください。");
    }
    const snapshot = await repository.loadSnapshot();
    hydrateRemoteSnapshot(snapshot);
    setSyncStatus("synced");
    persistState();
    renderAll();
    if (announce) notify(`本体のQuest ${snapshot.total || snapshot.quests.length}件を読み込みました。`);
    return true;
  } catch (error) {
    state.lastSyncAt = "";
    setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "APIへ接続できませんでした。ローカルデータを維持しています。");
    renderConnection();
    notify(error instanceof QuestForgeApiError ? error.message : "APIへ接続できませんでした。ローカルモードを維持します。");
    return false;
  }
}

function applyRemoteResponse(response) {
  if (response?.quest) {
    const index = state.quests.findIndex((item) => item.id === response.quest.id);
    const next = remoteQuestToLab(response.quest, Math.max(0, index));
    if (index >= 0) {
      // Single-quest responses do not include the full tree. Keep the existing child links until the next snapshot.
      next.children = state.quests[index].children || [];
      state.quests[index] = { ...state.quests[index], ...next };
    }
  }
  const battle = response?.session?.battle || response?.battle?.battle || response?.battle;
  const boss = response?.session?.boss || response?.battle?.boss || response?.boss;
  if (battle) {
    state.battleSession = response.session || state.battleSession;
    state.battleTurn = Number(battle.turn || state.battleTurn);
    state.battleLog = battle.log || state.battleLog;
    state.mp = Number(battle.mp ?? state.mp);
  }
  if (boss) state.bossHp = Number(boss.hp ?? state.bossHp);
  if (response?.character?.mp != null) state.mp = Number(response.character.mp);
  state.lastSyncAt = formatSyncTime();
  setSyncStatus("synced");
  persistState();
  renderAll();
}

function renderConnection() {
  const input = $("#gatewayUrlInput");
  if (input && document.activeElement !== input) input.value = state.gatewayUrl || gatewayDefaultUrl();
  const syncTime = $("#lastSyncAt");
  if (syncTime) syncTime.textContent = state.lastSyncAt || "未同期";
  const mode = $("#connectionMode");
  if (mode) mode.textContent = state.remoteMode ? "QuestForge本体" : "この端末";
  setSyncStatus(state.syncStatus);
}

function stateLabel(value) {
  return { ready: "作業待ち", working: "作業中", blocked: "ブロック中", review: "レビュー待ち", completed: "完了" }[value] || "作業待ち";
}

function pill(value) {
  return '<span class="state-pill" data-state="' + value + '">' + stateLabel(value) + "</span>";
}

function partyMember(name) {
  return partyMembers.find((member) => member.name === name);
}

function questKind(item) {
  return item.kind || (item.parent ? "sub" : "side");
}

function questKindLabel(item) {
  return { main: "MAIN", sub: "SUB", side: "SIDE" }[questKind(item)] || "SIDE";
}

function questGameMeta(item) {
  const difficulty = Math.max(1, Math.min(5, Number(item.difficulty) || 2));
  return '<div class="quest-game-meta">' +
    '<span class="difficulty" aria-label="難易度 ' + difficulty + ' / 5">' + "◆".repeat(difficulty) + "◇".repeat(5 - difficulty) + "</span>" +
    '<span>XP +' + escapeHtml(item.xp || 60) + "</span><span>MP +" + escapeHtml(item.reward || 0) + "</span>" +
  "</div>";
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function visibleQuests() {
  let items = state.quests.filter((item) => !item.parent || state.expanded.has(item.parent));
  if (state.priorityOnly) {
    items = items.filter((item) => !item.parent || item.state === "review" || item.state === "blocked");
  }
  if (state.sort === "progress") items.sort((a, b) => b.progress - a.progress);
  if (state.sort === "owner") items.sort((a, b) => a.owner.localeCompare(b.owner, "ja"));
  return items;
}

function renderQuestList() {
  $("#questList").innerHTML = visibleQuests().map((item) => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const toggle = hasChildren
      ? '<button class="quest-toggle" type="button" data-toggle="' + item.id + '">' + (state.expanded.has(item.id) ? "-" : "+") + "</button>"
      : '<span class="quest-toggle is-placeholder" aria-hidden="true"></span>';
    const selected = item.id === state.selectedQuestId ? "is-selected" : "";
    const attention = item.state !== "completed" && /今日|明日/.test(item.due) ? "is-attention" : "";
    const member = partyMember(item.owner);
    return '<article class="quest-row ' + selected + " is-" + item.state + " " + attention + '" data-quest="' + escapeHtml(item.id) + '" data-depth="' + (item.parent ? 1 : 0) + '" data-kind="' + questKind(item) + '" tabindex="0">' +
      '<div class="quest-code"><i class="rail-marker is-' + questKind(item) + '" aria-hidden="true"></i>' + toggle + '<span class="quest-number">' + escapeHtml(item.code) + "</span></div>" +
      '<div class="quest-summary"><div class="quest-title-line"><b class="quest-kind">' + questKindLabel(item) + "</b><strong>" + escapeHtml(item.title) + "</strong></div><small>" + escapeHtml(item.note) + "</small>" + questGameMeta(item) + "</div>" +
      '<div class="quest-progress"><b>' + escapeHtml(item.progress) + '%</b><div class="progress-line"><span style="width:' + Math.max(0, Math.min(100, Number(item.progress) || 0)) + '%"></span></div></div>' +
      '<div class="agent-chip"><span class="agent-avatar">' + escapeHtml(member?.mark || item.mark) + '</span><div><strong>' + escapeHtml(item.owner) + "</strong><small>" + escapeHtml(member?.identity || "PARTY MEMBER") + " · " + stateLabel(item.state) + "</small></div></div>" +
      pill(item.state) +
      '<span class="quest-due">' + escapeHtml(item.due) + '</span><span class="quest-focus">' + escapeHtml(item.focus) + "分</span>" +
    "</article>";
  }).join("");
}

function renderSelected() {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  $("#selectedTitle").textContent = item.title;
  const badge = $("#selectedState");
  badge.textContent = stateLabel(item.state);
  badge.dataset.state = item.state;
  $("#selectedDescription").textContent = item.note;
  $("#selectedMeta").innerHTML =
    "<div><dt>担当</dt><dd>" + escapeHtml(item.owner) + "</dd></div>" +
    "<div><dt>進捗</dt><dd>" + escapeHtml(item.progress) + "%</dd></div>" +
    "<div><dt>期限</dt><dd>" + escapeHtml(item.due) + "</dd></div>" +
    "<div><dt>見積</dt><dd>" + escapeHtml(item.focus) + "分</dd></div>" +
    "<div><dt>難易度</dt><dd>" + "◆".repeat(item.difficulty || 2) + "◇".repeat(5 - (item.difficulty || 2)) + "</dd></div>" +
    "<div><dt>報酬</dt><dd>XP +" + (item.xp || 60) + " / MP +" + item.reward + "</dd></div>";
  $("#completeButton").disabled = item.state === "completed";
  $("#completeButton").textContent = item.state === "completed" ? "完了済み" : "完了にする";
  const sheet = document.querySelector(".selected-panel");
  sheet.classList.toggle("is-mobile-open", state.mobileSheetOpen);
  $("#selectedSheetToggle").setAttribute("aria-expanded", String(state.mobileSheetOpen));
  $("#selectedSheetToggle").textContent = state.mobileSheetOpen ? "閉じる" : "詳細";
}

function memberAvatar(member) {
  return member.avatar
    ? '<span class="agent-avatar has-avatar"><img src="' + member.avatar + '" alt="" /></span>'
    : '<span class="agent-avatar">' + member.mark + "</span>";
}

function renderAgents() {
  $("#agentList").innerHTML = partyMembers.map((member) =>
    '<article class="agent-row">' + memberAvatar(member) +
    "<div><strong>" + member.name + "</strong><small>" + member.identity + " · " + member.role + "</small></div>" +
    '<button type="button" data-agent="' + member.name + '">' + stateLabel(member.state) + "</button></article>"
  ).join("");
  const count = state.quests.filter((item) => item.state === "review").length;
  $("#reviewCounter").textContent = String(count);
  $("#treeReviewCount").textContent = String(count);
}

function renderTree() {
  const roots = state.quests.filter((item) => !item.parent);
  const ordered = roots.flatMap((root) => [root, ...state.quests.filter((item) => item.parent === root.id)]);
  $("#treeList").innerHTML = ordered.map((item) =>
    '<article class="tree-node is-' + item.state + '" data-depth="' + (item.parent ? 1 : 0) + '" data-kind="' + questKind(item) + '">' +
      '<span class="tree-code"><i class="rail-marker is-' + questKind(item) + '" aria-hidden="true"></i>' + escapeHtml(item.code) + "</span>" +
      "<div><div class=\"tree-title-line\"><b class=\"quest-kind\">" + questKindLabel(item) + "</b><strong>" + escapeHtml(item.title) + "</strong></div><small>" + escapeHtml(item.note) + "</small>" + questGameMeta(item) + "</div>" +
      pill(item.state) +
      '<button type="button" data-tree-select="' + item.id + '">開く</button>' +
    "</article>"
  ).join("");
}

function renderBattle() {
  const queue = state.quests.filter((item) => !item.parent && item.state !== "completed");
  $("#battleQueue").innerHTML = queue.length
    ? queue.map((item) => '<div class="battle-queue-row"><strong>' + escapeHtml(item.title) + "</strong><span>+" + escapeHtml(item.reward) + " MP</span></div>").join("")
    : "<p>MPになるQuestはありません。</p>";
  $("#battleLog").innerHTML = state.battleLog.slice(0, 4).map((entry) => "<li>" + escapeHtml(entry) + "</li>").join("");
  $("#battleBossHp").textContent = String(state.bossHp);
  $("#battleBossMeter").value = state.bossHp;
  $("#battleMp").textContent = String(state.mp);
  $("#battleMpMeter").value = state.mp;
  $("#topbarMp").textContent = String(state.mp);
  $("#sidebarMp").textContent = state.mp + " / 100";
  $("#bossMp").textContent = String(state.mp);
  $("#topbarMpMeter").value = state.mp;
  const costs = { attack: 0, skill: 18, guard: 6, heal: 14, burst: 40 };
  $$("[data-command]").forEach((button) => { button.disabled = state.bossHp <= 0 || state.mp < costs[button.dataset.command]; });
}

function renderParty() {
  const assignments = partyMembers.map((member) => ({ member, quest: state.quests.find((item) => item.owner === member.name) }));
  $("#partyList").innerHTML = assignments.map(({ member, quest: assignedQuest }) =>
    '<article class="party-card"><div class="party-card-head"><div class="party-mark ' + (member.avatar ? "has-avatar" : "") + '">' + (member.avatar ? '<img src="' + member.avatar + '" alt="" />' : member.mark) + "</div><div>" +
      "<p>" + member.identity + "</p><h2>" + member.name + "</h2>" + pill(member.state) +
    "</div></div>" +
      '<p class="party-task">' + escapeHtml(member.task) + "</p>" +
      '<dl class="party-card-meta"><div><dt>現在のQuest</dt><dd>' + (assignedQuest ? escapeHtml(assignedQuest.title) : "割り当てなし") + "</dd></div>" +
      "<div><dt>状態</dt><dd>" + stateLabel(member.state) + "</dd></div>" +
      "<div><dt>見積</dt><dd>" + (assignedQuest ? assignedQuest.focus + "分" : "-") + "</dd></div></dl>" +
      '<button type="button" data-party-agent="' + member.name + '">担当Questを確認</button>' +
    "</article>"
  ).join("");
  $("#partyCount").textContent = String(partyMembers.length);
  $("#partyWorking").textContent = String(partyMembers.filter((member) => member.state === "working").length);
  $("#partyReview").textContent = String(partyMembers.filter((member) => member.state === "review").length);
  $("#partyActivity").innerHTML = [
    ["Cyan", "PCの司令室を試す", "レビュー待ちへ返却"],
    ["Astra", "Toggl Focusの連携導線を確認する", "接続設定を確認中"],
    ["Archivist", "10言語の表示長を確認する", "文言レビューを開始"]
  ].map((item) => '<li><b>' + item[0] + "</b><span>" + item[1] + "</span><small>" + item[2] + "</small></li>").join("");
}

function renderIntegrations() {
  const remoteByService = new Map((state.remoteIntegrations || []).map((item) => [item.id, item]));
  $("#integrationList").innerHTML = integrations.map((item) =>
    '<button type="button" class="integration-card ' + (item.id === state.integration ? "is-selected" : "") + '" data-integration="' + item.id + '">' +
      "<span>" + item.short + "</span><strong>" + item.name + "</strong><small>" + item.copy + "</small><b>" + escapeHtml(remoteByService.get({ calendar: "google-calendar", tasks: "google-tasks", notion: "notion", focus: "toggl-focus" }[item.id])?.status || item.state) + "</b></button>"
  ).join("");
  const selected = integrations.find((item) => item.id === state.integration);
  $("#integrationKicker").textContent = selected.name.toUpperCase();
  $("#integrationTitle").textContent = selected.title;
  $("#integrationDescription").textContent = selected.detail;
  $("#integrationContextTitle").textContent = selected.name;
  $("#integrationLastSync").textContent = selected.lastSync;
  $("#integrationScope").textContent = selected.scope;
  $("#integrationNextStep").textContent = selected.nextStep;
  $("#integrationActivity").innerHTML = selected.activity.map((entry) => "<li>" + entry + "</li>").join("");
}

function renderTimer() {
  const min = Math.floor(state.timerSeconds / 60);
  const sec = state.timerSeconds % 60;
  $("#timerValue").textContent = String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}

function renderAll() {
  renderQuestList();
  renderSelected();
  renderAgents();
  renderTree();
  renderBattle();
  renderParty();
  renderIntegrations();
  renderTimer();
  renderConnection();
}

function applySettings() {
  document.body.classList.toggle("is-large-type", state.settings.typeScale);
  document.body.classList.toggle("is-relaxed-density", state.settings.density);
  document.body.classList.toggle("is-motion-reduced", !state.settings.motion);
  $$('[data-setting="typeScale"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.typeScale));
    button.textContent = state.settings.typeScale ? "大きめ" : "標準";
  });
  $$('[data-setting="density"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.density));
    button.textContent = state.settings.density ? "ゆったり" : "標準";
  });
  $$('[data-setting="motion"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.motion));
    button.textContent = state.settings.motion ? "オン" : "オフ";
  });
  $$('[data-setting="sound"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.sound));
    button.textContent = state.settings.sound ? "オン" : "オフ";
  });
}

function setMobileMore(open) {
  state.mobileMoreOpen = open;
  const menu = $("#mobileMoreMenu");
  const toggle = $("#mobileMoreToggle");
  if (!menu || !toggle) return;
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
}

function setView(view) {
  state.view = view;
  const titles = { today: "今日の作戦", tree: "Quest Tree", battle: "バトル", party: "パーティ", integrations: "連携", profile: "プロフィール", settings: "設定" };
  $("#pageTitle").textContent = titles[view];
  $$("[data-panel]").forEach((panel) => {
    const active = panel.dataset.panel === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  setMobileMore(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectQuest(id) {
  state.selectedQuestId = id;
  state.mobileSheetOpen = false;
  renderQuestList();
  renderSelected();
}

async function completeSelectedQuest() {
  const item = quest(state.selectedQuestId);
  if (!item || item.state === "completed") return;
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const response = await repository.scoreQuest(item.id, "up");
      applyRemoteResponse(response);
      notify(item.title + "を本体へ完了登録しました。報酬を反映しました。");
    } catch (error) {
      setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "完了登録に失敗しました。");
      notify(error instanceof QuestForgeApiError ? error.message : "完了登録に失敗しました。データは変更していません。");
    }
    return;
  }
  item.state = "completed";
  item.progress = 100;
  state.mp = Math.min(100, state.mp + item.reward);
  state.battleLog.unshift(item.title + "を完了。+" + item.reward + " MPを獲得。");
  notify(item.title + "を完了。+" + item.reward + " MPを獲得しました。");
  persistState();
  renderAll();
}

async function battleCommand(command) {
  const commands = {
    attack: { cost: 0, damage: 9, label: "たたかう" },
    skill: { cost: 18, damage: 24, label: "Aegis Break" },
    guard: { cost: 6, damage: 0, label: "まもる" },
    heal: { cost: 14, damage: 0, label: "かいふく" },
    burst: { cost: 40, damage: 46, label: "バースト" }
  };
  const current = commands[command];
  if (!current || state.mp < current.cost || state.bossHp <= 0) return;
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const response = await repository.battleCommand(command, state.battleTurn, `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      applyRemoteResponse(response);
      $("#battleMessage").textContent = response?.effects?.message || (response?.session?.battle?.ended ? "勝利。次のボスを選ぼう。" : current.label + "を実行しました。");
    } catch (error) {
      setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "バトルコマンドに失敗しました。");
      notify(error instanceof QuestForgeApiError ? error.message : "バトルコマンドに失敗しました。データは変更していません。");
    }
    return;
  }
  state.mp -= current.cost;
  state.bossHp = Math.max(0, state.bossHp - current.damage);
  const message = current.damage
    ? current.label + "。Deadline Wraithに" + current.damage + "ダメージ。"
    : current.label + "。次のターンに備えた。";
  state.battleLog.unshift(message);
  $("#battleMessage").textContent = state.bossHp === 0 ? "勝利。次のボスを選ぼう。" : message;
  persistState();
  renderBattle();
}

function toggleTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
    $("#timerButton").setAttribute("aria-pressed", "false");
    notify("集中タイマーを一時停止しました。");
    return;
  }
  state.timerId = setInterval(() => {
    state.timerSeconds = Math.max(0, state.timerSeconds - 1);
    renderTimer();
    if (!state.timerSeconds) {
      toggleTimer();
      notify("集中タイマーが終わりました。");
    }
  }, 1000);
  $("#timerButton").setAttribute("aria-pressed", "true");
  notify("集中タイマーを開始しました。");
}

function openAdd() {
  $("#addForm").reset();
  $("#addDialog").showModal();
  $("#questNameInput").focus();
}

function openReview() {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  $("#reviewTitle").textContent = item.code + " / " + item.title;
  $("#reviewNote").value = item.note;
  $("#reviewDialog").showModal();
  $("#reviewNote").focus();
}

async function addQuest(data) {
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const owner = String(data.get("owner") || "Astra");
  const focus = Number(data.get("focus") || 30);
  const dueInput = String(data.get("due") || "");
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const response = await repository.createQuest({
        kind: "todo",
        title,
        notes: "",
        estimatedMinutes: focus,
        dueDate: dueInput ? dueInput.slice(0, 10) : "",
        scheduledDate: dueInput ? dueInput.slice(0, 10) : "",
        planningMode: dueInput ? "until_due" : "on_date",
        difficulty: "medium",
        planningState: dueInput ? "scheduled" : "backlog",
        lifecycleState: "active",
      });
      if (response?.quest) {
        const created = remoteQuestToLab(response.quest, state.quests.length);
        state.quests.push(created);
        state.selectedQuestId = created.id;
      }
      state.lastSyncAt = formatSyncTime();
      setSyncStatus("synced");
      persistState();
      renderAll();
      notify(title + "をQuestForge本体へ追加しました。");
    } catch (error) {
      setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "Quest追加に失敗しました。");
      notify(error instanceof QuestForgeApiError ? error.message : "Quest追加に失敗しました。データは変更していません。");
    }
    return;
  }
  const rootCodes = state.quests.filter((item) => !item.parent).map((item) => Number(item.code));
  const item = {
    id: "quest-" + Date.now(),
    code: String(Math.max(...rootCodes) + 1).padStart(2, "0"),
    title,
    note: "Interaction Labで追加したQuest。保存先はこの端末です。",
    progress: 0,
    owner,
    mark: partyMember(owner)?.mark || "AS",
    state: "ready",
    due: displayDue(dueInput),
    focus,
    reward: 14,
    xp: 60,
    difficulty: 2,
    kind: "side"
  };
  state.quests.push(item);
  state.selectedQuestId = item.id;
  persistState();
  renderAll();
  notify(title + "を追加しました。");
}

$$("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

$("#questList").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    const id = toggle.dataset.toggle;
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
    renderQuestList();
    return;
  }
  const row = event.target.closest("[data-quest]");
  if (row) selectQuest(row.dataset.quest);
});

$("#questList").addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-quest]")) {
    event.preventDefault();
    selectQuest(event.target.dataset.quest);
  }
});

$("#treeList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tree-select]");
  if (!button) return;
  selectQuest(button.dataset.treeSelect);
  setView("today");
});

$("#agentList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-agent]");
  if (!button) return;
  const member = partyMembers.find((item) => item.name === button.dataset.agent);
  if (member) notify(member.name + ": " + member.task);
});

$("#partyList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-party-agent]");
  if (!button) return;
  const target = state.quests.find((item) => item.owner === button.dataset.partyAgent);
  if (target) {
    selectQuest(target.id);
    setView("today");
  } else {
    notify(button.dataset.partyAgent + "に割り当てられたQuestはありません。");
  }
});

$("#integrationList").addEventListener("click", (event) => {
  const card = event.target.closest("[data-integration]");
  if (!card) return;
  state.integration = card.dataset.integration;
  renderIntegrations();
});

$$("[data-command]").forEach((button) => button.addEventListener("click", () => battleCommand(button.dataset.command)));

$("#filterAll").addEventListener("click", () => {
  state.priorityOnly = false;
  $("#filterAll").setAttribute("aria-pressed", "true");
  $("#filterPriority").setAttribute("aria-pressed", "false");
  $("#filterAll").classList.add("is-active");
  $("#filterPriority").classList.remove("is-active");
  renderQuestList();
});

$("#filterPriority").addEventListener("click", () => {
  state.priorityOnly = true;
  $("#filterAll").setAttribute("aria-pressed", "false");
  $("#filterPriority").setAttribute("aria-pressed", "true");
  $("#filterAll").classList.remove("is-active");
  $("#filterPriority").classList.add("is-active");
  renderQuestList();
});

$("#sortButton").addEventListener("click", (event) => {
  const values = ["due", "progress", "owner"];
  state.sort = values[(values.indexOf(state.sort) + 1) % values.length];
  event.currentTarget.textContent = { due: "期限順", progress: "進捗順", owner: "担当順" }[state.sort];
  renderQuestList();
});

$("#collapseTree").addEventListener("click", () => {
  state.expanded.clear();
  persistState();
  renderQuestList();
  notify("今日の一覧のサブQuestを閉じました。");
});

$("#resetBattle").addEventListener("click", () => {
  if (state.remoteMode) {
    notify("本体バトルのリセットAPIはまだ公開していません。ローカルへ戻ると試せます。");
    return;
  }
  state.mp = 68;
  state.bossHp = 71;
  state.battleLog = ["戦闘をリセットしました。", "Questを完了するとMPを獲得できる。"];
  $("#battleMessage").textContent = "Questを完了してMPをためよう。";
  persistState();
  renderBattle();
});

async function runIntegrationAction(dryRun) {
  const selected = integrations.find((item) => item.id === state.integration);
  if (!selected) return;
  if (!state.remoteMode) {
    notify(selected.name + (dryRun ? "の同期内容をプレビューしました。外部データは変更していません。" : "の同期は、本体へ接続すると実行できます。"));
    return;
  }
  const service = { calendar: "google-calendar", tasks: "google-tasks", notion: "notion", focus: "toggl-focus" }[state.integration];
  if (!service || service === "toggl-focus") {
    notify(selected.name + "はこの画面の同期API対象外です。連携画面から設定してください。");
    return;
  }
  try {
    setSyncStatus("syncing");
    const direction = { "google-calendar": "import", "google-tasks": "bidirectional", notion: "export" }[service] || "import";
    const response = dryRun ? await repository.previewSync(service, direction) : await repository.syncService(service, direction);
    const count = response?.summary?.created ?? response?.summary?.updated ?? response?.changes?.length;
    state.lastSyncAt = formatSyncTime();
    setSyncStatus("synced");
    persistState();
    renderAll();
    notify(`${selected.name}の${dryRun ? "プレビュー" : "同期"}を完了しました${Number.isFinite(count) ? `（${count}件）` : ""}。`);
  } catch (error) {
    setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "外部同期に失敗しました。");
    notify(error instanceof QuestForgeApiError ? error.message : "外部同期に失敗しました。外部データは変更していません。");
  }
}

$("#previewButton").addEventListener("click", () => runIntegrationAction(true));
$("#syncButton").addEventListener("click", () => runIntegrationAction(false));

$$("[data-setting]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.setting;
  state.settings[key] = !state.settings[key];
  localStorage.setItem("questforge-interaction-settings", JSON.stringify(state.settings));
  applySettings();
  notify({ typeScale: "文字サイズを切り替えました。", density: "表示密度を切り替えました。", motion: "モーション設定を切り替えました。", sound: "効果音設定を切り替えました。" }[key]);
}));

$("#completeButton").addEventListener("click", completeSelectedQuest);
$("#selectedSheetToggle").addEventListener("click", () => {
  state.mobileSheetOpen = !state.mobileSheetOpen;
  renderSelected();
});
$("#timerButton").addEventListener("click", toggleTimer);
$("#openAddDialog").addEventListener("click", openAdd);
$("#mobileAdd").addEventListener("click", openAdd);
$("#mobileMoreToggle").addEventListener("click", () => setMobileMore(!state.mobileMoreOpen));
$("#cancelAdd").addEventListener("click", () => $("#addDialog").close());
$("#reviewButton").addEventListener("click", openReview);

$("#addForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addQuest(new FormData($("#addForm")));
  $("#addDialog").close();
});

async function updateReview(accepted) {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  const note = $("#reviewNote").value.trim();
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const response = await repository.updateQuest(item.id, { notes: note || item.note, lifecycleState: accepted ? "completed" : "active" });
      applyRemoteResponse(response);
      notify(item.title + (accepted ? "を本体で承認しました。" : "を本体で作業中へ戻しました。"));
    } catch (error) {
      setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "レビュー更新に失敗しました。");
      notify(error instanceof QuestForgeApiError ? error.message : "レビュー更新に失敗しました。データは変更していません。");
    }
    return;
  }
  item.note = note || item.note;
  item.state = accepted ? "completed" : "working";
  item.progress = accepted ? 100 : item.progress;
  persistState();
  notify(item.title + (accepted ? "を承認しました。" : "を作業中へ戻しました。"));
  renderAll();
}

$("#reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await updateReview(true);
  $("#reviewDialog").close();
});

$("#returnReview").addEventListener("click", async () => {
  await updateReview(false);
  $("#reviewDialog").close();
});

$("#signInButton").addEventListener("click", async () => {
  try {
    await signIn();
    notify("Googleログインが完了しました。本体データを読み込めます。");
  } catch (error) {
    notify("Googleログインを完了できませんでした。ローカルモードはそのまま使えます。");
    setSyncStatus("error", error?.message || "Googleログインに失敗しました。");
  }
});

$("#signOutButton").addEventListener("click", async () => {
  try {
    await signOutUser();
    localMode("ログアウト済み。この端末に保存中");
    renderAll();
    notify("ログアウトしました。ローカルモードへ戻りました。");
  } catch {
    notify("ログアウトに失敗しました。");
  }
});

$("#loadRemoteButton").addEventListener("click", () => loadRemoteData());
$("#useLocalButton").addEventListener("click", () => {
  try {
    const backup = JSON.parse(localStorage.getItem("questforge-interaction-lab-local-backup") || "null");
    if (backup?.quests?.length) {
      Object.assign(state, backup, { remoteMode: false, dataSource: "local", syncStatus: "local-only", authUser: state.authUser });
      state.expanded = new Set(backup.expanded || ["qf-ui"]);
      state.timerId = null;
      state.remoteIntegrations = [];
    }
  } catch {
    // Keep the current local state when the optional backup is malformed.
  }
  localMode("この端末に保存中");
  renderAll();
  notify("ローカルモードへ戻りました。リモートの変更は保持されています。");
});
$("#gatewayUrlInput").addEventListener("change", (event) => {
  state.gatewayUrl = event.currentTarget.value.trim() || gatewayDefaultUrl();
  repository.setBaseUrl(state.gatewayUrl);
  localStorage.setItem("questforge-interaction-lab-gateway-url", state.gatewayUrl);
  renderConnection();
});

try {
  observeAuth((user) => {
    state.authUser = user ? { uid: user.uid, email: user.email || "", displayName: user.displayName || "" } : null;
    setSyncStatus(state.remoteMode ? state.syncStatus : "local-only");
    renderConnection();
  });
} catch {
  // A local-only build may omit Firebase config; the Lab still works without an account.
  localMode("Firebase未設定。この端末に保存中");
}

applySettings();
renderAll();
