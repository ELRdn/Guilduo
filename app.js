const storageKey = "questforge-prototype-state";
const appearanceStorageKey = "questforge-appearance-mode";
const appearanceModes = ["light", "dark", "system"];
const appVersion = "2026.07.31-dark.1";
const hadLocalStateAtStartup = Boolean(localStorage.getItem(storageKey));
const core = globalThis.QuestForgeCore;
const currentSchemaVersion = core?.CURRENT_SCHEMA_VERSION || 2;
const initialTimestamp = new Date().toISOString();

const defaultState = {
  schemaVersion: currentSchemaVersion,
  createdAt: initialTimestamp,
  updatedAt: initialTimestamp,
  sortMode: "created",
  taskFilter: "all",
  theme: "soft",
  preferences: {
    soundEnabled: true,
    motionEnabled: true,
  },
  lastProcessedDate: "",
  lastRolloverSummary: {
    date: "",
    reset: 0,
    advanced: 0,
  },
  storage: {
    driver: "local",
    syncStatus: "local-only",
    lastSavedAt: "",
    lastLoadedAt: "",
    cloudProvider: "none",
  },
  integrations: {
    selectedService: "google-calendar",
    direction: "import",
    connected: {},
  },
  syncEvents: [],
  taskEvents: [],
  rewardClaims: {},
  character: {
    name: "Astra",
    className: "Sentinel",
    level: 3,
    hp: 47,
    maxHp: 50,
    xp: 72,
    nextXp: 100,
    gems: 128,
    streak: 5,
    variant: "masc",
    role: "sentinel",
    personality: "INFP",
    motion: "calm",
    ownedItems: ["cloak-sage", "journal", "gem-brooch"],
    equippedItems: ["cloak-sage", "journal", "gem-brooch"],
    equipmentOffsets: {},
  },
  boss: {
    hp: 71,
    maxHp: 100,
    currentId: "h3",
    rotationEnabled: true,
    defeatedIds: [],
    defeatCount: 0,
    lastReward: "",
    battleLog: [],
  },
  battle: {
    turn: 1,
    mp: 12,
    maxMp: 80,
    focus: 0,
    guard: 0,
    shield: 0,
    rage: 0,
    vulnerable: 0,
    poison: 0,
    ended: false,
    log: [
      {
        kind: "system",
        text: "タスクでMPをためて、コマンドで戦います。",
      },
    ],
  },
  tasks: [
    {
      id: "h1",
      kind: "habit",
      title: "水を飲む",
      notes: "コップ1杯。何回でも加点。",
      difficulty: "easy",
      dueDate: "",
      createdAt: "2026-06-23T00:01:00.000Z",
      value: 8,
    },
    {
      id: "h2",
      kind: "habit",
      title: "SNSを開きすぎた",
      notes: "無意識に開いたら減点。",
      difficulty: "medium",
      dueDate: "",
      createdAt: "2026-06-23T00:02:00.000Z",
      value: -3,
      negativeOnly: true,
    },
    {
      id: "d1",
      kind: "daily",
      title: "机を5分片付ける",
      notes: "小さい行動で連続記録を守る。",
      difficulty: "easy",
      dueDate: "2026-06-23",
      createdAt: "2026-06-23T00:03:00.000Z",
      done: false,
      streak: 4,
    },
    {
      id: "d2",
      kind: "daily",
      title: "今日の計画を3行で書く",
      notes: "朝か昼までに完了。",
      difficulty: "medium",
      dueDate: "2026-06-23",
      createdAt: "2026-06-23T00:04:00.000Z",
      done: false,
      streak: 2,
    },
    {
      id: "t1",
      kind: "todo",
      title: "拡張機能Manifest案を作る",
      notes: "permissions、events、ui slotsを決める。",
      difficulty: "hard",
      dueDate: "2026-06-28",
      createdAt: "2026-06-23T00:05:00.000Z",
      done: false,
    },
    {
      id: "t2",
      kind: "todo",
      title: "MCP tool一覧を精査",
      notes: "読み取り、作成、スコア、要約を分ける。",
      difficulty: "medium",
      dueDate: "2026-06-25",
      createdAt: "2026-06-23T00:06:00.000Z",
      done: false,
    },
    {
      id: "r1",
      kind: "reward",
      title: "15分休憩",
      notes: "現実報酬として交換。",
      difficulty: "easy",
      dueDate: "",
      createdAt: "2026-06-23T00:07:00.000Z",
      cost: 20,
    },
    {
      id: "r2",
      kind: "reward",
      title: "好きな飲み物",
      notes: "一日の区切りに使う。",
      difficulty: "medium",
      dueDate: "",
      createdAt: "2026-06-23T00:08:00.000Z",
      cost: 45,
    },
  ],
  party: [
    { name: "Mina", role: "Alchemist", hp: 42 },
    { name: "Ren", role: "Ranger", hp: 49 },
    { name: "Sora", role: "Archivist", hp: 37 },
    { name: "Astra", role: "Sentinel", hp: 47 },
  ],
  inventory: [
    { name: "Bronze Blade", type: "Weapon", power: "+4 STR" },
    { name: "Traveler Coat", type: "Armor", power: "+3 CON" },
    { name: "Focus Ring", type: "Trinket", power: "+2 WIS" },
    { name: "Daily Sigil", type: "Badge", power: "+5 Streak" },
  ],
};

let state;

const storageDrivers = {
  local: {
    id: "local",
    label: "この端末だけ",
    load() {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    },
    save(nextState) {
      localStorage.setItem(storageKey, JSON.stringify(nextState));
    },
  },
  firebase: {
    id: "firebase",
    label: "Firebase同期",
    enabled: false,
    load() {
      return null;
    },
    save() {
      // Firebase project config is user-owned, so this driver is wired later.
    },
  },
};

function getStorageDriver(driverId = "local") {
  const driver = storageDrivers[driverId] || storageDrivers.local;
  return driver.enabled === false ? storageDrivers.local : driver;
}

const els = {
  hpValue: document.querySelector("#hpValue"),
  xpValue: document.querySelector("#xpValue"),
  gemValue: document.querySelector("#gemValue"),
  streakValue: document.querySelector("#streakValue"),
  characterName: document.querySelector("#characterName"),
  characterClass: document.querySelector("#characterClass"),
  avatarImage: document.querySelector("#avatarImage"),
  characterPreviewImage: document.querySelector("#characterPreviewImage"),
  gemBalance: document.querySelector("#gemBalance"),
  shopGemBalance: document.querySelector("#shopGemBalance"),
  variantSelect: document.querySelector("#variantSelect"),
  classSelect: document.querySelector("#classSelect"),
  personalitySelect: document.querySelector("#personalitySelect"),
  motionSelect: document.querySelector("#motionSelect"),
  classLineupImage: document.querySelector("#classLineupImage"),
  classGrid: document.querySelector("#classGrid"),
  avatarStage: document.querySelector(".avatar-stage"),
  avatarPreviewStage: document.querySelector(".avatar-preview-stage"),
  avatarStack: document.querySelector("#avatarStack"),
  avatarPreviewStack: document.querySelector("#avatarPreviewStack"),
  avatarEquipChips: document.querySelector("#avatarEquipChips"),
  previewEquipChips: document.querySelector("#previewEquipChips"),
  equipmentCalibrator: document.querySelector("#equipmentCalibrator"),
  equipmentDragToggle: document.querySelector("#equipmentDragToggle"),
  equipmentAdjustSelect: document.querySelector("#equipmentAdjustSelect"),
  equipmentOffsetX: document.querySelector("#equipmentOffsetX"),
  equipmentOffsetY: document.querySelector("#equipmentOffsetY"),
  equipmentScale: document.querySelector("#equipmentScale"),
  equipmentResetButton: document.querySelector("#equipmentResetButton"),
  equipmentResetAllButton: document.querySelector("#equipmentResetAllButton"),
  shopGrid: document.querySelector("#shopGrid"),
  randomizeCharacter: document.querySelector("#randomizeCharacter"),
  brandTagline: document.querySelector("#brandTagline"),
  themeKicker: document.querySelector("#themeKicker"),
  themeHeroTitle: document.querySelector("#themeHeroTitle"),
  themeHeroCopy: document.querySelector("#themeHeroCopy"),
  themeOptions: document.querySelectorAll("[data-theme-option]"),
  appearanceControl: document.querySelector("#appearanceControl"),
  appearanceButton: document.querySelector("#appearanceButton"),
  appearanceIcon: document.querySelector("#appearanceIcon"),
  appearanceMenu: document.querySelector("#appearanceMenu"),
  appearanceOptions: document.querySelectorAll("[data-appearance-option]"),
  themeColorMeta: document.querySelector('meta[name="theme-color"]'),
  feedbackSettingsButton: document.querySelector("#feedbackSettingsButton"),
  feedbackDialog: document.querySelector("#feedbackDialog"),
  closeFeedbackDialog: document.querySelector("#closeFeedbackDialog"),
  soundEnabledToggle: document.querySelector("#soundEnabledToggle"),
  motionEnabledToggle: document.querySelector("#motionEnabledToggle"),
  previewSoundButton: document.querySelector("#previewSoundButton"),
  previewMotionButton: document.querySelector("#previewMotionButton"),
  audioDiagnosticStatus: document.querySelector("#audioDiagnosticStatus"),
  testWebAudioButton: document.querySelector("#testWebAudioButton"),
  testMediaAudioButton: document.querySelector("#testMediaAudioButton"),
  feedbackPreviewCard: document.querySelector("#feedbackPreviewCard"),
  installAppButton: document.querySelector("#installAppButton"),
  bossImage: document.querySelector("#bossImage"),
  bossName: document.querySelector("#bossName"),
  bossReward: document.querySelector("#bossReward"),
  bossHitText: document.querySelector("#bossHitText"),
  bossMeter: document.querySelector("#bossMeter"),
  bossPreviewImage: document.querySelector("#bossPreviewImage"),
  bossPreviewName: document.querySelector("#bossPreviewName"),
  bossPreviewDescription: document.querySelector("#bossPreviewDescription"),
  bossThreatLabel: document.querySelector("#bossThreatLabel"),
  bossHpText: document.querySelector("#bossHpText"),
  bossRewardText: document.querySelector("#bossRewardText"),
  bossDefeatCount: document.querySelector("#bossDefeatCount"),
  bossGrid: document.querySelector("#bossGrid"),
  bossRotationStatus: document.querySelector("#bossRotationStatus"),
  randomBossButton: document.querySelector("#randomBossButton"),
  lockBossButton: document.querySelector("#lockBossButton"),
  habitList: document.querySelector("#habitList"),
  dailyList: document.querySelector("#dailyList"),
  todoList: document.querySelector("#todoList"),
  rewardList: document.querySelector("#rewardList"),
  archiveButton: document.querySelector("#archiveButton"),
  archiveCount: document.querySelector("#archiveCount"),
  archiveDialog: document.querySelector("#archiveDialog"),
  archiveList: document.querySelector("#archiveList"),
  closeArchiveDialog: document.querySelector("#closeArchiveDialog"),
  partyGrid: document.querySelector("#partyGrid"),
  inventoryGrid: document.querySelector("#inventoryGrid"),
  taskDialog: document.querySelector("#taskDialog"),
  taskForm: document.querySelector("#taskForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  editingTaskId: document.querySelector("#editingTaskId"),
  taskKind: document.querySelector("#taskKind"),
  taskTitle: document.querySelector("#taskTitle"),
  taskNotes: document.querySelector("#taskNotes"),
  taskDueDate: document.querySelector("#taskDueDate"),
  taskRepeat: document.querySelector("#taskRepeat"),
  taskTags: document.querySelector("#taskTags"),
  taskDifficulty: document.querySelector("#taskDifficulty"),
  cancelDialog: document.querySelector("#cancelDialog"),
  deleteTaskButton: document.querySelector("#deleteTaskButton"),
  importButton: document.querySelector("#importButton"),
  importFileInput: document.querySelector("#importFileInput"),
  exportButton: document.querySelector("#exportButton"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  mobileMoreButton: document.querySelector("#mobileMoreButton"),
  sidebar: document.querySelector(".sidebar"),
  undoToast: document.querySelector("#undoToast"),
  undoToastMessage: document.querySelector("#undoToastMessage"),
  undoDeleteButton: document.querySelector("#undoDeleteButton"),
  toastActionButton: document.querySelector("#toastActionButton"),
  closeToastButton: document.querySelector("#closeToastButton"),
  sortMode: document.querySelector("#sortMode"),
  taskSummaryRow: document.querySelector("#taskSummaryRow"),
  taskFilterOptions: document.querySelectorAll("[data-task-filter]"),
  viewTitle: document.querySelector("#viewTitle"),
  currentDateLabel: document.querySelector("#currentDateLabel"),
  rolloverStatus: document.querySelector("#rolloverStatus"),
  runRolloverButton: document.querySelector("#runRolloverButton"),
  battleLogList: document.querySelector("#battleLogList"),
  battlePlayerName: document.querySelector("#battlePlayerName"),
  battlePlayerSprite: document.querySelector("#battlePlayerSprite"),
  battlePlayerHpText: document.querySelector("#battlePlayerHpText"),
  battlePlayerMpText: document.querySelector("#battlePlayerMpText"),
  battlePlayerHpBar: document.querySelector("#battlePlayerHpBar"),
  battlePlayerMpBar: document.querySelector("#battlePlayerMpBar"),
  battlePlayerStatusRow: document.querySelector("#battlePlayerStatusRow"),
  battleBossName: document.querySelector("#battleBossName"),
  battleBossSprite: document.querySelector("#battleBossSprite"),
  battleBossHpText: document.querySelector("#battleBossHpText"),
  battleBossHpBar: document.querySelector("#battleBossHpBar"),
  battleBossRageText: document.querySelector("#battleBossRageText"),
  battleBossStatusRow: document.querySelector("#battleBossStatusRow"),
  battleDamageText: document.querySelector("#battleDamageText"),
  battleResourceText: document.querySelector("#battleResourceText"),
  battlePlayerDamageText: document.querySelector("#battlePlayerDamageText"),
  battleTurnValue: document.querySelector("#battleTurnValue"),
  battleMainMessage: document.querySelector("#battleMainMessage"),
  battleCombatLog: document.querySelector("#battleCombatLog"),
  battleResultText: document.querySelector("#battleResultText"),
  battleSkillCommandName: document.querySelector("#battleSkillCommandName"),
  battleSkillCommandCost: document.querySelector("#battleSkillCommandCost"),
  battleClassSkillText: document.querySelector("#battleClassSkillText"),
  battleTaskQueue: document.querySelector("#battleTaskQueue"),
  battleClassGrid: document.querySelector("#battleClassGrid"),
  battleContractPreview: document.querySelector("#battleContractPreview"),
  battleCommandButtons: document.querySelectorAll("[data-battle-command]"),
  battleResetButton: document.querySelector("#battleResetButton"),
  battleRandomBossButton: document.querySelector("#battleRandomBossButton"),
  integrationHubGrid: document.querySelector("#integrationHubGrid"),
  syncServiceSelect: document.querySelector("#syncServiceSelect"),
  syncDirectionSelect: document.querySelector("#syncDirectionSelect"),
  syncRuleSummary: document.querySelector("#syncRuleSummary"),
  syncPreviewList: document.querySelector("#syncPreviewList"),
  syncLogList: document.querySelector("#syncLogList"),
  runMockSyncButton: document.querySelector("#runMockSyncButton"),
  previewLiveSyncButton: document.querySelector("#previewLiveSyncButton"),
  runLiveSyncButton: document.querySelector("#runLiveSyncButton"),
  integrationModeLabel: document.querySelector("#integrationModeLabel"),
  apiGatewayStatus: document.querySelector("#apiGatewayStatus"),
  gatewayUrlInput: document.querySelector("#gatewayUrlInput"),
  saveGatewayButton: document.querySelector("#saveGatewayButton"),
  openMcpEndpointLink: document.querySelector("#openMcpEndpointLink"),
  gatewayOutput: document.querySelector("#gatewayOutput"),
  webhookUrlInput: document.querySelector("#webhookUrlInput"),
  webhookEventSelect: document.querySelector("#webhookEventSelect"),
  createWebhookButton: document.querySelector("#createWebhookButton"),
  webhookList: document.querySelector("#webhookList"),
  pluginManifestInput: document.querySelector("#pluginManifestInput"),
  installPluginButton: document.querySelector("#installPluginButton"),
  pluginList: document.querySelector("#pluginList"),
  pluginDashboardSlot: document.querySelector("#pluginDashboardSlot"),
  pluginIntegrationSlot: document.querySelector("#pluginIntegrationSlot"),
  pluginQuestDetailSlot: document.querySelector("#pluginQuestDetailSlot"),
};

const viewTitles = {
  tasks: "今日のクエスト",
  bosses: "ボス図鑑",
  battle: "MPコマンドバトル",
  character: "相棒カスタム",
  shop: "Gem店",
  party: "仲間とチャレンジ",
  inventory: "装備とコレクション",
  integrations: "開発者向け連携",
};

const difficultyLabels = {
  trivial: "軽い",
  easy: "易しい",
  medium: "普通",
  hard: "重い",
};

const taskKindLabels = {
  habit: "習慣ログ",
  daily: "今日の約束",
  todo: "一回クエスト",
  reward: "ごほうび交換",
};

const repeatLabels = {
  none: "繰り返しなし",
  daily: "毎日",
  weekdays: "平日",
  weekly: "毎週",
  monthly: "毎月",
};

const syncDirectionLabels = {
  import: "インポート",
  export: "エクスポート",
  bidirectional: "双方向",
};

const classOptions = [
  {
    id: "sentinel",
    name: "Sentinel",
    label: "守護",
    description: "毎日の約束を守る防御型。安定した浮遊と盾モチーフ。",
    defaultMotion: "calm",
  },
  {
    id: "archivist",
    name: "Archivist",
    label: "記録",
    description: "ログ、振り返り、読書、学習向け。本とペンの静かな相棒。",
    defaultMotion: "calm",
  },
  {
    id: "operator",
    name: "Operator",
    label: "司令",
    description: "API/MCP/連携っぽい司令塔。端末とヘッドセット。",
    defaultMotion: "focus",
  },
  {
    id: "alchemist",
    name: "Alchemist",
    label: "調合",
    description: "習慣を混ぜて改善する。小瓶と粒子で少し賑やか。",
    defaultMotion: "spark",
  },
  {
    id: "ranger",
    name: "Ranger",
    label: "探索",
    description: "運動、外出、探索タスク向け。軽装で弾む動き。",
    defaultMotion: "bouncy",
  },
  {
    id: "artificer",
    name: "Artificer",
    label: "工作",
    description: "自動化、拡張機能、ツール作成向け。工具とゴーグル。",
    defaultMotion: "focus",
  },
];

const battleSkillOptions = {
  sentinel: {
    name: "Aegis Break",
    cost: 18,
    description: "中ダメージ + Guard",
  },
  archivist: {
    name: "Weakness Note",
    cost: 16,
    description: "弱点解析 + MP還元",
  },
  operator: {
    name: "Protocol Spike",
    cost: 20,
    description: "高ダメージ + Rage抑制",
  },
  alchemist: {
    name: "Bloom Tonic",
    cost: 18,
    description: "回復 + 毒ダメージ",
  },
  ranger: {
    name: "Twin Shot",
    cost: 18,
    description: "2連撃 + Focus倍率",
  },
  artificer: {
    name: "Gear Cannon",
    cost: 22,
    description: "大ダメージ + Shield",
  },
};

const avatarVariants = [
  { id: "masc", name: "Masc base", baseSrc: "./assets/avatar-masc-48.webp", lineupSrc: "./assets/class-lineup-48.webp" },
  { id: "femme", name: "Femme base", baseSrc: "./assets/avatar-femme-48.webp", lineupSrc: "./assets/class-lineup-femme-48.webp" },
];

const personalityTypes = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];

const motionOptions = [
  { id: "calm", name: "静かにぷかぷか", className: "float-calm" },
  { id: "spark", name: "きらっと浮遊", className: "float-spark" },
  { id: "focus", name: "集中スキャン", className: "float-focus" },
  { id: "bouncy", name: "元気にぽよん", className: "float-bouncy" },
];

const integrationAdapters = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    shortName: "Calendar",
    type: "予定",
    auth: "OAuth 2.0",
    status: "mock-ready",
    recommendedDirection: "import",
    scope: "calendar.events.readonly / calendar.events",
    description: "予定、時間ブロック、繰り返し予定をクエスト化する。",
    rules: [
      "予定の開始/終了時刻を時間ブロックとして保持",
      "繰り返し予定は今日の約束へ変換",
      "終日予定は一回クエストとして扱う",
    ],
  },
  {
    id: "google-tasks",
    name: "Google Tasks",
    shortName: "Tasks",
    type: "タスク",
    auth: "OAuth 2.0",
    status: "mock-ready",
    recommendedDirection: "bidirectional",
    scope: "tasks / tasks.readonly",
    description: "期限つきタスクを一回クエストとして同期する。",
    rules: [
      "dueは日付のみ。時刻はCalendar側に任せる",
      "needsActionは未完了、completedは完了へ対応",
      "QuestForge完了をGoogle Tasks完了へ反映可能",
    ],
  },
  {
    id: "toggl-track",
    name: "Toggl Track",
    shortName: "Toggl",
    type: "時間記録",
    auth: "Basic Auth API token",
    status: "mock-ready",
    recommendedDirection: "import",
    scope: "time_entries / workspaces",
    description: "実作業時間をXP、Gem、ボスダメージに変換する。",
    rules: [
      "time entryのdurationを集中ログとして取り込む",
      "Project/TagをQuestForgeタグへ対応",
      "MVPはmodified_since/期間指定ポーリングで同期",
    ],
  },
  {
    id: "todoist",
    name: "Todoist",
    shortName: "Todoist",
    type: "タスク",
    auth: "OAuth 2.0",
    status: "planned",
    recommendedDirection: "bidirectional",
    scope: "tasks / projects",
    description: "既存タスク管理からクエストへ移行/同期する。",
    rules: [
      "Todoist filter todayを今日のクエストへ対応",
      "Projectをタグまたはチャレンジへ対応",
      "Webhooksはバックエンド実装時に検討",
    ],
  },
  {
    id: "notion",
    name: "Notion",
    shortName: "Notion",
    type: "ログ",
    auth: "Bearer token / OAuth",
    status: "planned",
    recommendedDirection: "export",
    scope: "pages / databases",
    description: "実績、振り返り、戦闘ログをNotion DBへ保存する。",
    rules: [
      "日次サマリーをページまたはDB行として保存",
      "完了クエストとボス撃破を実績ログ化",
      "MVPではエクスポート優先",
    ],
  },
  {
    id: "discord-slack",
    name: "Discord / Slack",
    shortName: "Chat",
    type: "通知",
    auth: "Webhook / OAuth",
    status: "planned",
    recommendedDirection: "export",
    scope: "incoming webhook",
    description: "パーティ、ボス戦、リマインダーを通知する。",
    rules: [
      "ボス撃破や連続記録をチャンネル通知",
      "共同チャレンジの進捗を共有",
      "個人情報を含む通知は明示許可制",
    ],
  },
];

const mockExternalRecords = [
  {
    service: "google-calendar",
    externalId: "gcal-focus-20260630",
    title: "集中ブロック: QuestForge設計",
    sourceType: "calendar.event",
    dueDate: "2026-06-30",
    timeBlock: "10:00-11:30",
    tags: ["calendar", "focus"],
    mapTo: { kind: "todo", repeat: "none", difficulty: "medium" },
    notes: "Google Calendar予定から作成。時間ブロックを保持。",
  },
  {
    service: "google-calendar",
    externalId: "gcal-daily-review",
    title: "夜のレビュー",
    sourceType: "calendar.recurring_event",
    dueDate: "2026-06-30",
    timeBlock: "21:30-21:45",
    tags: ["calendar", "routine"],
    mapTo: { kind: "daily", repeat: "daily", difficulty: "easy" },
    notes: "繰り返し予定を今日の約束へ変換。",
  },
  {
    service: "google-tasks",
    externalId: "gtask-api-scope",
    title: "Google OAuthスコープを整理",
    sourceType: "tasks.task",
    dueDate: "2026-06-30",
    tags: ["google-tasks", "api"],
    mapTo: { kind: "todo", repeat: "none", difficulty: "medium" },
    notes: "Google Tasksの未完了タスク。dueは日付のみ。",
  },
  {
    service: "toggl-track",
    externalId: "toggl-45min-design",
    title: "QuestForge UI設計 45分",
    sourceType: "toggl.time_entry",
    durationMinutes: 45,
    dueDate: "2026-06-30",
    tags: ["toggl", "deep-work"],
    mapTo: { kind: "habit", repeat: "none", difficulty: "medium" },
    notes: "Toggl Trackの作業時間をXP/Gem/ボスダメージ候補へ変換。",
  },
  {
    service: "todoist",
    externalId: "todoist-plugin-route",
    title: "連携プラグインの権限設計",
    sourceType: "todoist.task",
    dueDate: "2026-07-01",
    tags: ["todoist", "plugin"],
    mapTo: { kind: "todo", repeat: "none", difficulty: "hard" },
    notes: "Todoistタスクの同期サンプル。",
  },
  {
    service: "notion",
    externalId: "notion-daily-log",
    title: "今日のQuestForge実績ログ",
    sourceType: "notion.page",
    dueDate: "2026-06-30",
    tags: ["notion", "log"],
    mapTo: { kind: "habit", repeat: "none", difficulty: "trivial" },
    notes: "Notionへエクスポートする日次ログのサンプル。",
  },
];

const slotLabels = {
  back: "背中",
  hand: "手持ち",
  chest: "胸",
  head: "頭",
  species: "種族",
  aura: "オーラ",
};

const shopItems = [
  {
    id: "cloak-sage",
    slot: "back",
    type: "マント",
    name: "Sage Cloak",
    price: 30,
    asset: "./assets/equipment/equipment-cloak-sage.webp",
    affinity: "Sentinel / INFJ",
    description: "Bテーマに合う柔らかい緑のマント。",
  },
  {
    id: "journal",
    slot: "hand",
    type: "手持ち",
    name: "Task Journal",
    price: 25,
    asset: "./assets/equipment/equipment-journal.webp",
    affinity: "Archivist / INTJ",
    description: "習慣ログを記録する小さな本。",
  },
  {
    id: "gem-brooch",
    slot: "chest",
    type: "アクセ",
    name: "Gem Brooch",
    price: 40,
    asset: "./assets/equipment/equipment-gem-brooch.webp",
    affinity: "Alchemist / ENFP",
    description: "胸元で光るGemのブローチ。",
  },
  {
    id: "operator-headset",
    slot: "head",
    type: "アクセ",
    name: "Operator Headset",
    price: 55,
    asset: "./assets/equipment/equipment-operator-headset.webp",
    affinity: "Operator / ENTJ",
    description: "司令塔っぽさを足す小型ヘッドセット。",
  },
  {
    id: "ranger-tail",
    slot: "species",
    type: "種族",
    name: "Beastkin Tail",
    price: 65,
    asset: "./assets/equipment/equipment-ranger-tail.webp",
    affinity: "Ranger / ESFP",
    description: "獣人カスタム用のしっぽ。開発中は無料解放候補。",
  },
  {
    id: "clockwork-arm",
    slot: "species",
    type: "種族",
    name: "Clockwork Arm",
    price: 70,
    asset: "./assets/equipment/equipment-clockwork-arm.webp",
    affinity: "Artificer / INTP",
    description: "Artificer向けの機械腕パーツ。",
  },
  { id: "warm-aura", slot: "aura", type: "オーラ", name: "Warm Aura", price: 45, affinity: "Fタイプ", description: "F寄りの柔らかい性格表現に合う光。" },
  { id: "logic-sparks", slot: "aura", type: "オーラ", name: "Logic Sparks", price: 45, affinity: "Tタイプ", description: "T寄りのシャープな性格表現に合う粒子。" },
];

const equipmentBasePlacements = {
  "cloak-sage": { x: 50, y: 61, size: 66 },
  journal: { x: 76, y: 63, size: 27 },
  "gem-brooch": { x: 50, y: 52, size: 13 },
  "operator-headset": { x: 51, y: 25, size: 30 },
  "ranger-tail": { x: 70, y: 68, size: 42 },
  "clockwork-arm": { x: 28, y: 66, size: 27 },
};

const equipmentRolePlacements = {
  sentinel: {
    "cloak-sage": { y: 1, size: -2 },
    journal: { x: 2, y: 2, size: -2 },
    "gem-brooch": { y: 1 },
  },
  archivist: {
    "cloak-sage": { x: -1, y: -1, size: -3 },
    journal: { x: -2, y: -3, size: 1 },
    "gem-brooch": { y: -1 },
  },
  operator: {
    "operator-headset": { y: -2, size: -2 },
    journal: { x: 1, y: 1, size: -3 },
    "gem-brooch": { x: 1, y: -1 },
  },
  alchemist: {
    "cloak-sage": { x: 1, y: -1, size: -4 },
    "gem-brooch": { x: 1, y: -2, size: 1 },
    journal: { x: 1, y: -1, size: -2 },
  },
  ranger: {
    "ranger-tail": { x: -3, y: -2, size: -2 },
    journal: { x: -1, y: 1, size: -2 },
    "cloak-sage": { y: -2, size: -5 },
  },
  artificer: {
    "clockwork-arm": { x: 2, y: -2, size: 1 },
    "operator-headset": { y: -1, size: -3 },
    journal: { x: 1, y: 2, size: -3 },
  },
};

const equipmentVariantPlacements = {
  femme: {
    "cloak-sage": { y: -1, size: -2 },
    journal: { x: -1, size: -2 },
    "gem-brooch": { y: -1, size: -1 },
    "operator-headset": { y: -2, size: -2 },
    "ranger-tail": { x: -2, y: -1, size: -2 },
    "clockwork-arm": { x: 1, y: -1, size: -2 },
  },
  masc: {
    "cloak-sage": { y: 1 },
    journal: { x: 1 },
    "clockwork-arm": { y: 1 },
  },
};

const bossOptions = [
  {
    id: "d",
    name: "Dark Quest Knight",
    label: "暗黒騎士",
    threat: "重装",
    src: "./assets/boss-d-transparent.webp",
    maxHp: 125,
    rewardGems: 26,
    rewardXp: 36,
    weakKind: "todo",
    description: "未処理の重いタスクを鎧にした騎士。",
  },
  {
    id: "e",
    name: "Deadline Wraith",
    label: "締切レイス",
    threat: "締切",
    src: "./assets/boss-e-transparent.webp",
    maxHp: 115,
    rewardGems: 24,
    rewardXp: 34,
    weakKind: "daily",
    description: "期限とカレンダー片をまとった影。",
  },
  {
    id: "h",
    name: "Deadline Wraith Lite",
    label: "小型レイス",
    threat: "時間",
    src: "./assets/boss-h-transparent.webp",
    maxHp: 95,
    rewardGems: 18,
    rewardXp: 26,
    weakKind: "habit",
    description: "紙片と紫煙で近づく小さな締切。",
  },
  {
    id: "g3",
    name: "Shadow Knight",
    label: "影騎士",
    threat: "集中",
    src: "./assets/boss-g3-transparent.webp",
    maxHp: 110,
    rewardGems: 22,
    rewardXp: 32,
    weakKind: "todo",
    description: "集中を試す、青い火を帯びた影の剣士。",
  },
  {
    id: "h3",
    name: "Compact Deadline Wraith",
    label: "締切の影",
    threat: "継続",
    src: "./assets/boss-h3-transparent.webp",
    maxHp: 100,
    rewardGems: 20,
    rewardXp: 30,
    weakKind: "daily",
    description: "未完了ログの気配を集める締切の影。",
  },
];

const bossRotationMs = 12000;
let bossRotationTimer;
let pendingBossEffect = null;
let selectedEquipmentId = "";
let equipmentDragState = null;
let activeViewId = "tasks";
let pendingDeletedTask = null;
let undoToastTimer = null;
let toastActionHandler = null;
let feedbackPreviewTimer = null;
let appUpdateFallbackTimer = null;
let deleteConfirmTimer = null;
let armedDeleteTaskId = "";
let lastStateFingerprint = "";
let suppressCloudSaveEvent = false;
let deferredInstallPrompt = null;
let interactionAudioContext = null;
const gatewayStorageKey = "questforge-api-gateway-url";
let gatewayRuntime = { status: "offline", webhooks: [], plugins: [] };
let lastAudioDiagnostic = { route: "none", status: "not-tested", at: "" };

state = loadState();
lastStateFingerprint = stateSyncFingerprint(state);

globalThis.QuestForgeBridge = {
  version: 1,
  deviceId: getDeviceId(),
  getSyncSnapshot() {
    return {
      state: cloneStateValue(state),
      hadLocalStateAtStartup,
    };
  },
  applyCloudState(nextState) {
    if (!nextState || typeof nextState !== "object") return;
    suppressCloudSaveEvent = true;
    state = applyScheduledRollover(normalizeState(cloneStateValue(nextState)));
    lastStateFingerprint = stateSyncFingerprint(state);
    saveState({ emitCloud: false });
    suppressCloudSaveEvent = false;
    render();
  },
};

const themePresets = {
  arcane: {
    label: "A / Calm Arcane OS",
    tagline: "Calm Arcane OS",
    heroTitle: "Archive of Small Spells",
    heroCopy:
      "静かな魔法研究所のように、習慣を小さな呪文として記録します。RPG感は残しつつ、画面は落ち着いた作業道具として使えます。",
  },
  soft: {
    label: "B / Soft Ops Companion",
    tagline: "Soft Ops Companion",
    heroTitle: "Deskside Companion",
    heroCopy:
      "小さな相棒AIと一緒に、今日の生活タスクを静かに整理します。ゲーム感は残しつつ、普段使いの道具に近い見た目です。",
  },
  retro: {
    label: "C / Neo-Retro Quest Console",
    tagline: "Neo-Retro Quest Console",
    heroTitle: "Mission Console",
    heroCopy:
      "古い携帯ゲーム機と現代のタスク基地を混ぜた方向です。懐かしい端末感でAIっぽさを隠しながら、ミッションボードとして使えます。",
  },
};

const feedbackProfiles = {
  arcane: {
    wave: "sine",
    press: [{ frequency: 622, duration: 0.055, gain: 0.026 }],
    theme: [
      { frequency: 523, duration: 0.07, gain: 0.028 },
      { frequency: 784, offset: 0.06, duration: 0.1, gain: 0.03 },
    ],
    success: [
      { frequency: 523, duration: 0.1, gain: 0.035 },
      { frequency: 659, offset: 0.08, duration: 0.12, gain: 0.035 },
      { frequency: 1047, offset: 0.16, duration: 0.2, gain: 0.03 },
    ],
    restore: [
      { frequency: 659, duration: 0.08, gain: 0.026 },
      { frequency: 523, offset: 0.07, duration: 0.11, gain: 0.024 },
    ],
    battle: [
      { frequency: 440, duration: 0.055, gain: 0.03 },
      { frequency: 659, offset: 0.05, duration: 0.1, gain: 0.03 },
    ],
  },
  soft: {
    wave: "sine",
    press: [{ frequency: 330, duration: 0.08, gain: 0.075 }],
    theme: [
      { frequency: 294, duration: 0.08, gain: 0.048 },
      { frequency: 392, offset: 0.07, duration: 0.13, gain: 0.05 },
    ],
    success: [
      { frequency: 440, duration: 0.13, gain: 0.11 },
      { frequency: 660, offset: 0.11, duration: 0.17, gain: 0.1 },
      { frequency: 880, offset: 0.24, duration: 0.22, gain: 0.09 },
    ],
    restore: [
      { frequency: 392, duration: 0.09, gain: 0.044 },
      { frequency: 294, offset: 0.08, duration: 0.12, gain: 0.04 },
    ],
    battle: [
      { frequency: 196, duration: 0.07, gain: 0.052 },
      { frequency: 294, offset: 0.06, duration: 0.11, gain: 0.05 },
    ],
  },
  retro: {
    wave: "square",
    press: [{ frequency: 392, duration: 0.045, gain: 0.018 }],
    theme: [
      { frequency: 440, duration: 0.06, gain: 0.02 },
      { frequency: 660, offset: 0.055, duration: 0.09, gain: 0.022 },
    ],
    success: [
      { frequency: 523, duration: 0.06, gain: 0.025 },
      { frequency: 659, offset: 0.07, duration: 0.08, gain: 0.025 },
      { frequency: 784, offset: 0.15, duration: 0.14, gain: 0.026 },
    ],
    restore: [
      { frequency: 659, duration: 0.06, gain: 0.02 },
      { frequency: 523, offset: 0.06, duration: 0.09, gain: 0.018 },
    ],
    battle: [
      { frequency: 147, duration: 0.055, gain: 0.025 },
      { frequency: 294, offset: 0.045, duration: 0.08, gain: 0.024 },
    ],
  },
};

function getInteractionAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!interactionAudioContext) interactionAudioContext = new AudioContextClass();
  return interactionAudioContext;
}

function playInteractionCue(cue) {
  if (!state.preferences?.soundEnabled) return;
  const context = getInteractionAudioContext();
  if (!context) return;
  const profile = feedbackProfiles[state.theme] || feedbackProfiles.soft;
  const notes = profile[cue] || profile.press;
  const schedule = () => scheduleAudioNotes(context, profile, notes);
  if (context.state === "suspended") {
    context.resume().then(schedule).catch(() => updateAudioDiagnostic("web-audio", "blocked"));
    return;
  }
  schedule();
}

function scheduleAudioNotes(context, profile, notes) {
  try {
    notes.forEach((note) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + (note.offset || 0);
      const endAt = startAt + note.duration;
      oscillator.type = profile.wave;
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(note.gain, startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    });
    updateAudioDiagnostic("web-audio", context.state);
  } catch {
    updateAudioDiagnostic("web-audio", "error");
  }
}

function updateAudioDiagnostic(route, status) {
  lastAudioDiagnostic = { route, status, at: new Date().toLocaleTimeString("ja-JP") };
  if (!els.audioDiagnosticStatus) return;
  const contextState = interactionAudioContext?.state || "未作成";
  els.audioDiagnosticStatus.textContent = `経路: ${route} / 結果: ${status} / AudioContext: ${contextState} / ${lastAudioDiagnostic.at}`;
}

async function testWebAudio() {
  const context = getInteractionAudioContext();
  if (!context) {
    updateAudioDiagnostic("web-audio", "unsupported");
    return;
  }
  try {
    await context.resume();
    scheduleAudioNotes(context, { wave: "sine" }, [
      { frequency: 660, duration: 0.24, gain: 0.14 },
      { frequency: 880, offset: 0.28, duration: 0.3, gain: 0.14 },
    ]);
  } catch {
    updateAudioDiagnostic("web-audio", "blocked");
  }
}

function createTestToneWavUrl() {
  const sampleRate = 22050;
  const duration = 0.75;
  const sampleCount = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const frequency = index < sampleCount / 2 ? 660 : 880;
    const fade = Math.min(1, index / 300, (sampleCount - index) / 300);
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.42 * fade;
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

async function testMediaAudio() {
  const url = createTestToneWavUrl();
  const audio = new Audio(url);
  audio.volume = 1;
  try {
    await audio.play();
    updateAudioDiagnostic("html-media", "playing");
    audio.addEventListener("ended", () => {
      updateAudioDiagnostic("html-media", "completed");
      URL.revokeObjectURL(url);
    }, { once: true });
  } catch {
    URL.revokeObjectURL(url);
    updateAudioDiagnostic("html-media", "blocked");
  }
}

function canPlayMotion() {
  return Boolean(state.preferences?.motionEnabled)
    && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function applyButtonPressFeedback(button) {
  if (!button || button.disabled) return;
  if (canPlayMotion()) {
    button.classList.remove("is-pressed");
    void button.offsetWidth;
    button.classList.add("is-pressed");
    window.setTimeout(() => button.classList.remove("is-pressed"), 140);
  }
  playInteractionCue("press");
}

function registerButtonFeedback() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("button");
    if (button && !button.hasAttribute("data-feedback-silent")) {
      applyButtonPressFeedback(button);
    }
  }, true);
}

function previewFeedback(options = {}) {
  if (options.sound) {
    if (state.preferences?.soundEnabled) {
      playInteractionCue("success");
    } else {
      showToast("効果音がオフです。オンにすると試聴できます。", { duration: 4000 });
    }
  }

  if (!options.motion) return;
  if (!canPlayMotion()) {
    showToast("モーションがオフ、または端末で動きを減らす設定が有効です。", { duration: 5000 });
    return;
  }

  window.clearTimeout(feedbackPreviewTimer);
  els.feedbackPreviewCard.classList.remove("is-previewing");
  void els.feedbackPreviewCard.offsetWidth;
  els.feedbackPreviewCard.classList.add("is-previewing");
  feedbackPreviewTimer = window.setTimeout(() => {
    els.feedbackPreviewCard.classList.remove("is-previewing");
  }, 620);
}

function loadState() {
  try {
    const driver = getStorageDriver("local");
    const loaded = driver.load();
    const nextState = applyScheduledRollover(normalizeState(loaded || cloneDefaultState()));
    nextState.storage = {
      ...nextState.storage,
      driver: driver.id,
      syncStatus: "local-only",
      lastLoadedAt: new Date().toISOString(),
    };
    return nextState;
  } catch {
    return applyScheduledRollover(normalizeState(cloneDefaultState()));
  }
}

function cloneDefaultState() {
  if (typeof structuredClone === "function") {
    return structuredClone(defaultState);
  }
  return JSON.parse(JSON.stringify(defaultState));
}

function cloneStateValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stateSyncFingerprint(value) {
  const snapshot = cloneStateValue(value);
  delete snapshot.updatedAt;
  delete snapshot.storage;
  return JSON.stringify(snapshot);
}

function getDeviceId() {
  const key = "questforge-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, next);
  return next;
}

function saveState(options = {}) {
  const driver = getStorageDriver(state.storage?.driver);
  const fingerprint = stateSyncFingerprint(state);
  const contentChanged = fingerprint !== lastStateFingerprint;
  state.schemaVersion = currentSchemaVersion;
  if (contentChanged) state.updatedAt = new Date().toISOString();
  state.storage = {
    ...state.storage,
    driver: driver.id,
    syncStatus: driver.id === "local" ? "local-only" : "cloud-ready",
    lastSavedAt: new Date().toISOString(),
  };
  driver.save(state);
  lastStateFingerprint = stateSyncFingerprint(state);
  if (contentChanged && options.emitCloud !== false && !suppressCloudSaveEvent) {
    const snapshot = cloneStateValue(state);
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("questforge:state-saved", {
        detail: { state: snapshot },
      }));
    });
  }
}

function normalizeState(nextState) {
  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    nextState = cloneDefaultState();
  }
  nextState.schemaVersion = currentSchemaVersion;
  nextState.createdAt = nextState.createdAt || new Date().toISOString();
  nextState.updatedAt = nextState.updatedAt || nextState.createdAt;
  nextState.sortMode = nextState.sortMode || "created";
  nextState.taskFilter = ["all", "today", "overdue", "upcoming", "undone"].includes(nextState.taskFilter)
    ? nextState.taskFilter
    : "all";
  nextState.theme = ["arcane", "soft", "retro"].includes(nextState.theme)
    ? nextState.theme
    : "soft";
  nextState.preferences = {
    ...cloneDefaultState().preferences,
    ...(nextState.preferences && typeof nextState.preferences === "object" ? nextState.preferences : {}),
  };
  nextState.preferences.soundEnabled = nextState.preferences.soundEnabled !== false;
  nextState.preferences.motionEnabled = nextState.preferences.motionEnabled !== false;
  nextState.lastProcessedDate = nextState.lastProcessedDate || "";
  nextState.lastRolloverSummary = {
    date: nextState.lastRolloverSummary?.date || "",
    reset: Number.isFinite(nextState.lastRolloverSummary?.reset) ? nextState.lastRolloverSummary.reset : 0,
    advanced: Number.isFinite(nextState.lastRolloverSummary?.advanced) ? nextState.lastRolloverSummary.advanced : 0,
  };
  nextState.storage = {
    ...cloneDefaultState().storage,
    ...(nextState.storage || {}),
  };
  nextState.storage.driver = storageDrivers[nextState.storage.driver] ? nextState.storage.driver : "local";
  nextState.storage.syncStatus = nextState.storage.driver === "local" ? "local-only" : nextState.storage.syncStatus;
  nextState.integrations = {
    selectedService: integrationAdapters.some((adapter) => adapter.id === nextState.integrations?.selectedService)
      ? nextState.integrations.selectedService
      : "google-calendar",
    direction: syncDirectionLabels[nextState.integrations?.direction] ? nextState.integrations.direction : "import",
    connected: typeof nextState.integrations?.connected === "object" && nextState.integrations.connected
      ? nextState.integrations.connected
      : {},
  };
  nextState.syncEvents = Array.isArray(nextState.syncEvents)
    ? nextState.syncEvents.slice(0, 12)
    : [];
  nextState.taskEvents = Array.isArray(nextState.taskEvents)
    ? nextState.taskEvents.slice(0, core?.TASK_EVENT_LIMIT || 250)
    : [];
  nextState.rewardClaims = nextState.rewardClaims && typeof nextState.rewardClaims === "object" && !Array.isArray(nextState.rewardClaims)
    ? nextState.rewardClaims
    : {};
  nextState.boss = {
    ...cloneDefaultState().boss,
    ...(nextState.boss || {}),
  };
  nextState.boss.currentId = bossOptions.some((boss) => boss.id === nextState.boss.currentId)
    ? nextState.boss.currentId
    : pickRandomBossId();
  const currentBoss = getBossOption(nextState.boss.currentId);
  nextState.boss.maxHp = currentBoss.maxHp;
  nextState.boss.hp = Number.isFinite(nextState.boss.hp)
    ? Math.min(currentBoss.maxHp, Math.max(0, nextState.boss.hp))
    : currentBoss.maxHp;
  nextState.boss.rotationEnabled = typeof nextState.boss.rotationEnabled === "boolean"
    ? nextState.boss.rotationEnabled
    : true;
  nextState.boss.defeatedIds = Array.isArray(nextState.boss.defeatedIds)
    ? nextState.boss.defeatedIds.filter((bossId) => bossOptions.some((boss) => boss.id === bossId))
    : [];
  nextState.boss.defeatCount = Number.isFinite(nextState.boss.defeatCount)
    ? nextState.boss.defeatCount
    : nextState.boss.defeatedIds.length;
  nextState.boss.lastReward = nextState.boss.lastReward || "";
  nextState.boss.battleLog = Array.isArray(nextState.boss.battleLog)
    ? nextState.boss.battleLog.slice(0, 8)
    : [];
  nextState.battle = {
    ...cloneDefaultState().battle,
    ...(nextState.battle || {}),
  };
  nextState.battle.turn = Number.isFinite(nextState.battle.turn) && nextState.battle.turn > 0
    ? nextState.battle.turn
    : 1;
  nextState.battle.maxMp = Number.isFinite(nextState.battle.maxMp) && nextState.battle.maxMp > 0
    ? nextState.battle.maxMp
    : 80;
  nextState.battle.mp = Number.isFinite(nextState.battle.mp)
    ? Math.min(nextState.battle.maxMp, Math.max(0, nextState.battle.mp))
    : 12;
  ["focus", "guard", "shield", "rage", "vulnerable", "poison"].forEach((key) => {
    nextState.battle[key] = Number.isFinite(nextState.battle[key])
      ? Math.max(0, nextState.battle[key])
      : 0;
  });
  nextState.battle.ended = Boolean(nextState.battle.ended);
  nextState.battle.log = Array.isArray(nextState.battle.log) && nextState.battle.log.length
    ? nextState.battle.log.slice(0, 10)
    : cloneDefaultState().battle.log;
  nextState.character = {
    ...cloneDefaultState().character,
    ...(nextState.character || {}),
  };
  if (typeof nextState.character.gems !== "number") {
    nextState.character.gems = typeof nextState.character.gold === "number" ? nextState.character.gold : 128;
  }
  delete nextState.character.gold;
  nextState.character.role = classOptions.some((item) => item.id === nextState.character.role)
    ? nextState.character.role
    : "sentinel";
  nextState.character.variant = avatarVariants.some((item) => item.id === nextState.character.variant)
    ? nextState.character.variant
    : "masc";
  nextState.character.personality = personalityTypes.includes(nextState.character.personality)
    ? nextState.character.personality
    : "INFP";
  nextState.character.motion = motionOptions.some((item) => item.id === nextState.character.motion)
    ? nextState.character.motion
    : getRole(nextState.character.role).defaultMotion;
  nextState.character.ownedItems = Array.isArray(nextState.character.ownedItems)
    ? nextState.character.ownedItems.filter((itemId) => shopItems.some((item) => item.id === itemId))
    : ["cloak-sage", "journal", "gem-brooch"];
  nextState.character.equippedItems = Array.isArray(nextState.character.equippedItems)
    ? nextState.character.equippedItems.filter((itemId) => shopItems.some((item) => item.id === itemId))
    : ["cloak-sage", "journal", "gem-brooch"];
  const equippedSlots = new Set();
  nextState.character.equippedItems = nextState.character.equippedItems.filter((itemId) => {
    const item = shopItems.find((candidate) => candidate.id === itemId);
    if (!item || equippedSlots.has(item.slot)) return false;
    equippedSlots.add(item.slot);
    return true;
  });
  nextState.character.equippedItems.forEach((itemId) => {
    if (!nextState.character.ownedItems.includes(itemId)) {
      nextState.character.ownedItems.push(itemId);
    }
  });
  nextState.character.equipmentOffsets = normalizeEquipmentOffsets(nextState.character.equipmentOffsets);
  const sourceTasks = Array.isArray(nextState.tasks) ? nextState.tasks : cloneDefaultState().tasks;
  nextState.tasks = sourceTasks.filter((task) => task && typeof task === "object").map((task, index) => {
    const hadRepeat = typeof task.repeat === "string" && task.repeat.length > 0;
    const createdAt = task.createdAt || new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString();
    return {
      ...task,
      id: String(task.id || `imported-${index}-${Date.now()}`),
      kind: ["habit", "daily", "todo", "reward"].includes(task.kind) ? task.kind : "todo",
      title: String(task.title || "無題のクエスト").slice(0, 80),
      notes: String(task.notes || "").slice(0, 180),
      difficulty: difficultyLabels[task.difficulty] ? task.difficulty : "easy",
      dueDate: task.dueDate || "",
      repeat: repeatLabels[task.repeat] ? task.repeat : task.kind === "daily" && !hadRepeat ? "daily" : "none",
      tags: Array.isArray(task.tags) ? task.tags.slice(0, 6) : parseTags(task.tags || ""),
      externalLinks: Array.isArray(task.externalLinks) ? task.externalLinks : [],
      createdAt,
      updatedAt: task.updatedAt || createdAt,
      lastCompletedDate: task.lastCompletedDate || "",
      lastRolledOverDate: task.lastRolledOverDate || "",
    };
  });
  nextState.tasks.filter((task) => task.done && (task.kind === "daily" || task.kind === "todo")).forEach((task) => {
    const claimDate = task.lastCompletedDate || nextState.lastProcessedDate || currentDateText();
    const claimKey = core.completionClaimKey(task, claimDate);
    if (!nextState.rewardClaims[claimKey]) {
      nextState.rewardClaims[claimKey] = "migrated";
    }
  });
  return nextState;
}

function normalizeEquipmentOffsets(offsets) {
  if (!offsets || typeof offsets !== "object") return {};
  return Object.entries(offsets).reduce((normalized, [itemId, value]) => {
    const item = shopItems.find((entry) => entry.id === itemId && entry.asset);
    if (!item || !value || typeof value !== "object") return normalized;
    normalized[itemId] = {
      x: clampNumber(Number(value.x) || 0, -30, 30),
      y: clampNumber(Number(value.y) || 0, -30, 30),
      scale: clampNumber(Number(value.scale) || 0, -25, 40),
    };
    return normalized;
  }, {});
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyScheduledRollover(nextState, options = {}) {
  const today = currentDateText();
  if (!options.force && nextState.lastProcessedDate === today) {
    return nextState;
  }

  let reset = 0;
  let advanced = 0;
  nextState.tasks.forEach((task) => {
    if (task.kind === "daily") {
      const nextDate = nextDueDateForTask(task, today);
      if (nextDate && task.dueDate !== nextDate) {
        task.dueDate = nextDate;
        advanced += 1;
      }
      if (task.done && task.lastCompletedDate !== task.dueDate) {
        task.done = false;
        reset += 1;
      }
      if (!task.dueDate && nextDate) {
        task.dueDate = nextDate;
      }
      task.lastRolledOverDate = today;
    }

    if (task.kind === "todo" && task.repeat !== "none" && task.done && task.dueDate && task.dueDate < today) {
      task.dueDate = nextDueDateForTask(task, today) || task.dueDate;
      task.done = false;
      task.lastRolledOverDate = today;
      advanced += 1;
    }
  });
  nextState.lastProcessedDate = today;
  nextState.lastRolloverSummary = { date: today, reset, advanced };
  return nextState;
}

function difficultyScale(difficulty) {
  return core.difficultyScale(difficulty);
}

function recordTaskEvent(type, task, details = {}) {
  const event = {
    id: createId(),
    type,
    taskId: task.id,
    taskKind: task.kind,
    at: new Date().toISOString(),
    source: "web",
    details,
  };
  state.taskEvents = core.appendTaskEvent(state.taskEvents, event);
  return event;
}

function scoreTask(taskId, direction) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const scale = difficultyScale(task.difficulty);
  const positive = direction === "up";
  let battleMpGain = 0;
  let completedTask = null;

  if (task.kind === "reward") {
    redeemReward(task);
    return;
  }

  if (task.kind === "daily" || task.kind === "todo") {
    if (!positive) {
      task.done = false;
      state.character.hp = Math.max(0, state.character.hp - Math.round(5 * scale));
      applyBattlePenalty(task, scale);
      recordTaskEvent("task.failed", task, { hpPenalty: Math.round(5 * scale) });
    } else if (task.done) {
      task.done = false;
      recordTaskEvent("task.reopened", task, { rewardReversed: false });
      showToast("未完了へ戻しました。受取済みの報酬は再付与されません。");
    } else {
      task.done = true;
      task.lastCompletedDate = currentDateText();
      task.updatedAt = new Date().toISOString();
      completedTask = task;
      const claim = core.claimCompletion(
        state.rewardClaims,
        task,
        currentDateText(),
        new Date().toISOString(),
      );
      state.rewardClaims = claim.rewardClaims;
      if (claim.granted) {
        const reward = core.taskRewardDelta(task, getBossOption(state.boss.currentId).weakKind);
        grantProgress(scale);
        battleMpGain += reward.mp;
        if (task.kind === "daily") {
          task.streak = (task.streak || 0) + 1;
          state.character.streak = Math.max(state.character.streak, task.streak);
        }
        recordTaskEvent("task.completed", task, {
          occurrenceKey: claim.key,
          rewardGranted: true,
          reward,
        });
      } else {
        recordTaskEvent("task.completed", task, {
          occurrenceKey: claim.key,
          rewardGranted: false,
        });
        showToast("完了にしました。この回の報酬は受取済みです。");
      }
    }
  }

  if (task.kind === "habit") {
    if (positive) {
      grantProgress(scale);
      battleMpGain += battleMpForTask(task, scale);
      task.value = Math.min(20, (task.value || 0) + 1);
      recordTaskEvent("habit.scored", task, { direction: "up" });
    } else {
      state.character.hp = Math.max(0, state.character.hp - Math.round(4 * scale));
      task.value = Math.max(-20, (task.value || 0) - 1);
      applyBattlePenalty(task, scale);
      recordTaskEvent("habit.scored", task, { direction: "down" });
    }
  }

  if (battleMpGain > 0) {
    gainBattleMp(battleMpGain, task);
  }
  if (completedTask) {
    completeTaskToArchive(completedTask);
    return;
  }
  render();
}

function completeTaskToArchive(task) {
  playInteractionCue("success");
  saveState();
  renderTaskSummary();
  renderArchiveDialog();
  showToast(`「${task.title}」を完了。アーカイブへ格納しました。`, { duration: 4200 });

  const card = document.querySelector(`.task-card[data-task-id="${task.id}"]`);
  if (!card || !canPlayMotion()) {
    render();
    return;
  }

  card.setAttribute("aria-busy", "true");
  card.classList.add("is-archiving");
  card.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  window.setTimeout(() => render(), 520);
}

function grantProgress(scale) {
  state.character.gems += Math.round(7 * scale);
  grantXp(Math.round(12 * scale));
}

function grantXp(amount) {
  state.character.xp += amount;
  while (state.character.xp >= state.character.nextXp) {
    state.character.xp -= state.character.nextXp;
    state.character.level += 1;
    state.character.maxHp += 5;
    state.character.hp = state.character.maxHp;
    state.character.nextXp += 25;
  }
}

function bossDamageForTask(task, scale) {
  const baseDamage = {
    habit: 5,
    daily: 10,
    todo: 12,
  }[task.kind] || 0;
  const currentBoss = getBossOption(state.boss.currentId);
  const weakMultiplier = currentBoss.weakKind === task.kind ? 1.35 : 1;
  return Math.max(1, Math.round(baseDamage * scale * weakMultiplier));
}

function dealBossDamage(amount, task, options = {}) {
  const currentBoss = getBossOption(state.boss.currentId);
  state.boss.maxHp = currentBoss.maxHp;
  state.boss.hp = Math.max(0, state.boss.hp - amount);
  pendingBossEffect = { damage: amount, defeated: false, reward: "" };

  if (state.boss.hp > 0) {
    addBattleLog({
      boss: currentBoss.label,
      task: task?.title || "タスク",
      kind: task?.kind || "",
      damage: amount,
      weak: task?.kind === currentBoss.weakKind,
      defeated: false,
      reward: "",
    });
    return;
  }

  if (!state.boss.defeatedIds.includes(currentBoss.id)) {
    state.boss.defeatedIds.push(currentBoss.id);
  }
  state.boss.defeatCount += 1;
  state.character.gems += currentBoss.rewardGems;
  grantXp(currentBoss.rewardXp);
  state.boss.lastReward = `+${currentBoss.rewardGems} Gem / +${currentBoss.rewardXp} XP`;
  addBattleLog({
    boss: currentBoss.label,
    task: task?.title || "タスク",
    kind: task?.kind || "",
    damage: amount,
    weak: task?.kind === currentBoss.weakKind,
    defeated: true,
    reward: state.boss.lastReward,
  });
  pendingBossEffect = {
    damage: amount,
    defeated: true,
    reward: `CLEAR +${currentBoss.rewardGems}G +${currentBoss.rewardXp}XP`,
  };
  if (options.autoRotate !== false) {
    setCurrentBoss(pickRandomBossId(currentBoss.id), {
      resetHp: true,
      rotationEnabled: state.boss.rotationEnabled,
    });
  }
}

function addBattleLog(entry) {
  state.boss.battleLog = [
    {
      id: createId(),
      at: new Date().toISOString(),
      ...entry,
    },
    ...(state.boss.battleLog || []),
  ].slice(0, 8);
}

function ensureBattleState() {
  if (!state.battle) {
    state.battle = cloneDefaultState().battle;
  }
  return state.battle;
}

function getBattleSkill(roleId = state.character.role) {
  return battleSkillOptions[roleId] || battleSkillOptions.sentinel;
}

function battleMpForTask(task, scale) {
  const currentBoss = getBossOption(state.boss.currentId);
  return core.taskRewardDelta(task, currentBoss.weakKind).mp;
}

function gainBattleMp(amount, task) {
  const battle = ensureBattleState();
  const before = battle.mp;
  battle.mp = Math.min(battle.maxMp, Math.max(0, battle.mp + amount));
  const actualGain = battle.mp - before;
  const focusGain = {
    habit: 1,
    daily: 1,
    todo: 2,
  }[task.kind] || 0;
  battle.focus += focusGain;
  if (actualGain > 0 && activeViewId === "battle") {
    showBattleFloat(els.battleResourceText, `+${actualGain} MP`, "gain");
  }
  addCommandBattleLog(
    `<strong>${taskKindLabels[task.kind] || "クエスト"}</strong> MP +${actualGain}${focusGain ? ` / Focus +${focusGain}` : ""}`
  );
}

function applyBattlePenalty(task, scale) {
  const battle = ensureBattleState();
  const hpLoss = task.kind === "habit"
    ? Math.round(4 * scale)
    : Math.round(5 * scale);
  battle.rage += 1;
  addCommandBattleLog(`<strong>失敗</strong> HP -${hpLoss} / Rage +1`, "danger");
  if (state.character.hp <= 0) {
    battle.ended = true;
    addCommandBattleLog("<strong>敗北</strong> HPが尽きました。戦闘リセットで再挑戦できます。", "danger");
  }
}

function addCommandBattleLog(text, kind = "info") {
  const battle = ensureBattleState();
  battle.log = [{ text, kind }, ...(battle.log || [])].slice(0, 10);
}

function resetCommandBattle(options = {}) {
  const currentBoss = getBossOption(state.boss.currentId);
  state.battle = cloneDefaultState().battle;
  state.boss.rotationEnabled = false;
  if (options.resetBoss !== false) {
    state.boss.maxHp = currentBoss.maxHp;
    state.boss.hp = currentBoss.maxHp;
  }
  render();
}

function useBattleCommand(command) {
  const battle = ensureBattleState();
  state.boss.rotationEnabled = false;
  if (battle.ended || state.boss.hp <= 0 || state.character.hp <= 0) {
    addCommandBattleLog("戦闘は終了しています。戦闘リセットかボス変更で続行できます。", "system");
    render();
    return;
  }

  const skill = getBattleSkill();
  const cost = core.battleCommandCost(command, skill.cost);
  if (battle.mp < cost) {
    addCommandBattleLog("MPが足りません。クエスト完了でMPをためてください。", "danger");
    render();
    return;
  }

  battle.mp -= cost;
  flashBattleSprite(els.battlePlayerSprite, "jrpg-sprite-cast");
  if (cost > 0) {
    showBattleFloat(els.battleResourceText, `-${cost} MP`, "spend");
  }

  if (command === "attack") {
    dealCommandBattleDamage(9 + Math.min(6, battle.focus), "たたかう");
  }
  if (command === "skill") {
    useBattleSkill();
  }
  if (command === "guard") {
    battle.guard += 1;
    showBattleFloat(els.battleResourceText, `${cost ? `-${cost} MP / ` : ""}GUARD`, "guard");
    addCommandBattleLog("<strong>まもる</strong> 次の被ダメージを半減。");
  }
  if (command === "heal") {
    const healed = Math.min(22, state.character.maxHp - state.character.hp);
    state.character.hp += healed;
    showBattleFloat(els.battleResourceText, `-${cost} MP / +${healed} HP`, "heal");
    addCommandBattleLog(`<strong>かいふく</strong> HP +${healed}`);
  }
  if (command === "burst") {
    const focusBonus = Math.min(24, battle.focus * 4);
    dealCommandBattleDamage(46 + focusBonus, "バースト");
    battle.focus = Math.max(0, battle.focus - 2);
  }

  playInteractionCue(command === "burst" ? "success" : "battle");
  flashBattleCommandFeedback();
  if (!battle.ended && state.boss.hp > 0) {
    runEnemyBattleTurn();
  }
  render();
}

function flashBattleCommandFeedback() {
  const field = document.querySelector(".jrpg-field");
  if (!field || !canPlayMotion()) return;
  field.classList.remove("is-commanding");
  void field.offsetWidth;
  field.classList.add("is-commanding");
  window.setTimeout(() => field.classList.remove("is-commanding"), 520);
}

function useBattleSkill() {
  const battle = ensureBattleState();
  const skill = getBattleSkill();

  if (state.character.role === "sentinel") {
    dealCommandBattleDamage(22, skill.name);
    battle.guard += 1;
  }
  if (state.character.role === "archivist") {
    battle.vulnerable += 2;
    dealCommandBattleDamage(12, skill.name);
    battle.mp = Math.min(battle.maxMp, battle.mp + 8);
    addCommandBattleLog("弱点解析: 次の攻撃が強化。MP +8");
  }
  if (state.character.role === "operator") {
    dealCommandBattleDamage(28, skill.name);
    battle.rage = Math.max(0, battle.rage - 1);
  }
  if (state.character.role === "alchemist") {
    const healed = Math.min(14, state.character.maxHp - state.character.hp);
    state.character.hp += healed;
    battle.poison += 3;
    dealCommandBattleDamage(12, skill.name);
    addCommandBattleLog(`調合効果: HP +${healed} / 毒3`);
  }
  if (state.character.role === "ranger") {
    dealCommandBattleDamage(13 + battle.focus, `${skill.name} 1`);
    if (!battle.ended) {
      dealCommandBattleDamage(13 + battle.focus, `${skill.name} 2`);
    }
  }
  if (state.character.role === "artificer") {
    dealCommandBattleDamage(32, skill.name);
    battle.shield += 8;
  }
}

function dealCommandBattleDamage(amount, source) {
  const battle = ensureBattleState();
  let damage = amount;
  if (battle.vulnerable > 0) {
    damage = Math.round(damage * 1.35);
    battle.vulnerable -= 1;
  }

  const willDefeat = state.boss.hp - damage <= 0;
  dealBossDamage(damage, { title: source, kind: "battle" }, { autoRotate: false });
  flashBattleSprite(els.battleBossSprite, "jrpg-sprite-hit");
  showBattleFloat(els.battleDamageText, `-${damage}`, willDefeat ? "critical" : "damage");
  addCommandBattleLog(`<strong>${source}</strong> ${damage} damage`);

  if (willDefeat) {
    battle.ended = true;
    addCommandBattleLog("<strong>勝利</strong> タスクでためたMPを使ってボスを撃破。", "success");
  }
}

function takeCommandBattleDamage(amount, source) {
  const battle = ensureBattleState();
  let damage = amount;
  if (battle.guard > 0) {
    damage = Math.ceil(damage / 2);
    battle.guard -= 1;
  }
  if (battle.shield > 0) {
    const blocked = Math.min(battle.shield, damage);
    damage -= blocked;
    battle.shield -= blocked;
  }
  state.character.hp = Math.max(0, state.character.hp - damage);
  flashBattleSprite(els.battlePlayerSprite, "jrpg-sprite-hit");
  showBattleFloat(els.battlePlayerDamageText, `-${damage} HP`, "damage");
  addCommandBattleLog(`${source} HP -${damage}`, "danger");
  if (state.character.hp <= 0) {
    battle.ended = true;
    addCommandBattleLog("<strong>敗北</strong> HPが尽きました。", "danger");
  }
}

function runEnemyBattleTurn() {
  const battle = ensureBattleState();
  if (battle.poison > 0) {
    dealCommandBattleDamage(battle.poison, "毒");
    battle.poison -= 1;
    if (battle.ended) return;
  }

  battle.turn += 1;
  const baseDamage = 8 + battle.rage * 2;
  if (battle.turn % 3 === 0) {
    battle.rage += 1;
    takeCommandBattleDamage(baseDamage + 5, "ボスの強攻撃");
  } else {
    takeCommandBattleDamage(baseDamage, "ボスの攻撃");
  }
  if (battle.rage >= 3 && battle.mp > 0) {
    const drain = Math.min(6, battle.mp);
    battle.mp -= drain;
    addCommandBattleLog(`Rage効果: MP -${drain}`, "danger");
  }
}

function renderCommandBattle() {
  if (!els.battlePlayerName) return;
  const battle = ensureBattleState();
  const role = getRole(state.character.role);
  const skill = getBattleSkill();
  const currentBoss = getBossOption(state.boss.currentId);
  const avatarSrc = getAvatarSrc(state.character.role, state.character.variant);
  const bossHpRatio = currentBoss.maxHp ? state.boss.hp / currentBoss.maxHp : 0;
  const hpRatio = state.character.maxHp ? state.character.hp / state.character.maxHp : 0;
  const mpRatio = battle.maxMp ? battle.mp / battle.maxMp : 0;
  const battleEnded = battle.ended || state.boss.hp <= 0 || state.character.hp <= 0;

  els.battlePlayerName.textContent = `${state.character.name} / ${role.name}`;
  els.battlePlayerSprite.src = avatarSrc;
  els.battlePlayerHpText.textContent = `${state.character.hp}/${state.character.maxHp}`;
  els.battlePlayerMpText.textContent = `${battle.mp}/${battle.maxMp}`;
  els.battlePlayerHpBar.style.width = `${Math.max(0, Math.min(100, hpRatio * 100))}%`;
  els.battlePlayerMpBar.style.width = `${Math.max(0, Math.min(100, mpRatio * 100))}%`;
  els.battleTurnValue.textContent = battle.turn;

  els.battleBossName.textContent = currentBoss.name;
  els.battleBossSprite.src = currentBoss.src;
  els.battleBossHpText.textContent = `${state.boss.hp}/${currentBoss.maxHp}`;
  els.battleBossHpBar.style.width = `${Math.max(0, Math.min(100, bossHpRatio * 100))}%`;
  els.battleBossRageText.textContent = battle.rage;

  els.battleSkillCommandName.textContent = skill.name;
  els.battleSkillCommandCost.textContent = `${skill.cost} MP / ${skill.description}`;
  els.battleClassSkillText.textContent = skill.name;
  els.battleResultText.textContent = battleEnded
    ? state.boss.hp <= 0 ? "勝利" : "敗北"
    : "進行中";

  renderBattleStatus(els.battlePlayerStatusRow, [
    battle.focus ? `Focus ${battle.focus}` : "",
    battle.guard ? `Guard ${battle.guard}` : "",
    battle.shield ? `Shield ${battle.shield}` : "",
  ]);
  renderBattleStatus(els.battleBossStatusRow, [
    battle.vulnerable ? `Weak ${battle.vulnerable}` : "",
    battle.poison ? `Poison ${battle.poison}` : "",
  ]);

  els.battleMainMessage.innerHTML = battle.log[0]?.text || "コマンドを選んでください。";
  els.battleCombatLog.innerHTML = "";
  (battle.log || []).slice(1).forEach((entry) => {
    const item = document.createElement("div");
    item.className = entry.kind;
    item.innerHTML = entry.text;
    els.battleCombatLog.appendChild(item);
  });

  els.battleCommandButtons.forEach((button) => {
    const command = button.dataset.battleCommand;
    button.disabled = battleEnded || battle.mp < core.battleCommandCost(command, skill.cost);
  });

  renderBattleTaskQueue();
  renderBattleClassGrid();
  els.battleContractPreview.textContent = JSON.stringify(createBattleContractPreview(), null, 2);
}

function renderBattleStatus(target, values) {
  target.innerHTML = "";
  values.filter(Boolean).forEach((value) => {
    const item = document.createElement("span");
    item.className = "pill";
    item.textContent = value;
    target.appendChild(item);
  });
}

function renderBattleTaskQueue() {
  els.battleTaskQueue.innerHTML = "";
  const candidates = state.tasks
    .filter((task) => task.kind !== "reward" && !task.negativeOnly)
    .filter((task) => task.kind === "habit" || !task.done)
    .sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return a.title.localeCompare(b.title, "ja");
    })
    .slice(0, 6);

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "empty-task";
    empty.textContent = "MPに変換できる未完了クエストがありません。クエスト画面で追加できます。";
    els.battleTaskQueue.appendChild(empty);
    return;
  }

  candidates.forEach((task) => {
    const scale = difficultyScale(task.difficulty);
    const mpGain = battleMpForTask(task, scale);
    const card = document.createElement("article");
    card.className = "battle-task-card";

    const meta = document.createElement("div");
    meta.className = "battle-task-meta";
    meta.appendChild(pill(taskKindLabels[task.kind] || task.kind));
    meta.appendChild(pill(difficultyLabels[task.difficulty] || task.difficulty));
    if (task.dueDate) {
      const due = pill(formatDueDate(task.dueDate));
      due.classList.add(isOverdue(task) ? "overdue" : "due");
      meta.appendChild(due);
    }

    const title = document.createElement("strong");
    title.textContent = task.title;

    const notes = document.createElement("p");
    notes.textContent = task.notes || "完了するとMPへ変換されます。";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button";
    button.textContent = `完了して MP +${mpGain}`;
    button.addEventListener("click", () => scoreTask(task.id, "up"));

    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(notes);
    card.appendChild(button);
    els.battleTaskQueue.appendChild(card);
  });
}

function renderBattleClassGrid() {
  els.battleClassGrid.innerHTML = "";
  classOptions.forEach((role) => {
    const skill = getBattleSkill(role.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "battle-class-button";
    button.classList.toggle("active", role.id === state.character.role);
    button.innerHTML = `<strong>${role.name}</strong><span>${skill.name} / ${skill.cost} MP</span>`;
    button.addEventListener("click", () => {
      state.character.role = role.id;
      state.character.motion = role.defaultMotion;
      addCommandBattleLog(`${role.name} に変更。スキル: ${skill.name}`);
      render();
    });
    els.battleClassGrid.appendChild(button);
  });
}

function createBattleContractPreview() {
  const battle = ensureBattleState();
  const skill = getBattleSkill();
  return {
    resourceModel: {
      hp: state.character.hp,
      mp: battle.mp,
      focus: battle.focus,
      role: state.character.role,
    },
    questEvent: {
      type: "quest.scored",
      payload: {
        result: "mp_gained",
        mpDelta: 14,
        focusDelta: 1,
      },
    },
    battleEvent: {
      type: "battle.commandUsed",
      payload: {
        command: "skill",
        mpCost: skill.cost,
        role: state.character.role,
      },
    },
  };
}

function flashBattleSprite(element, className) {
  if (!element || !canPlayMotion()) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 380);
}

function showBattleFloat(element, text, kind = "damage") {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
  if (!canPlayMotion()) return;
  element.classList.remove("is-visible");
  void element.offsetWidth;
  element.classList.add("is-visible");
  window.setTimeout(() => element.classList.remove("is-visible"), 760);
}

function redeemReward(task) {
  const cost = task.cost || rewardCost(task.difficulty);
  if (state.character.gems < cost) {
    flashTask(task.id);
    return;
  }
  state.character.gems -= cost;
  render();
}

function rewardCost(difficulty) {
  return Math.round(25 * difficultyScale(difficulty));
}

function addTask(kind, title, notes, dueDate, difficulty, repeat = "none", tags = []) {
  if (!title.trim()) return null;

  const timestamp = new Date().toISOString();
  const task = {
    id: createId(),
    kind,
    title: title.trim(),
    notes: notes.trim(),
    dueDate,
    difficulty,
    repeat,
    tags: Array.isArray(tags) ? tags : parseTags(tags),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (kind === "daily" || kind === "todo") {
    task.done = false;
  }
  if (kind === "daily") {
    task.streak = 0;
  }
  if (kind === "reward") {
    task.cost = rewardCost(difficulty);
  }

  state.tasks.push(task);
  recordTaskEvent("task.created", task);
  render();
  return task;
}

function updateTask(taskId, values) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !values.title.trim()) return null;

  const previousKind = task.kind;
  task.kind = values.kind;
  task.title = values.title.trim();
  task.notes = values.notes.trim();
  task.dueDate = values.dueDate;
  task.difficulty = values.difficulty;
  task.repeat = values.repeat;
  task.tags = values.tags;
  task.updatedAt = new Date().toISOString();

  if ((task.kind === "daily" || task.kind === "todo") && typeof task.done !== "boolean") {
    task.done = false;
  }
  if (task.kind === "daily" && typeof task.streak !== "number") {
    task.streak = 0;
  }
  if (task.kind === "reward") {
    task.cost = rewardCost(task.difficulty);
    delete task.done;
    delete task.streak;
  }
  if (task.kind !== "reward") {
    delete task.cost;
  }
  if (previousKind !== task.kind && task.kind === "habit") {
    delete task.done;
    delete task.streak;
  }

  recordTaskEvent("task.updated", task, { previousKind });
  render();
  return task;
}

function deleteTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const [task] = state.tasks.splice(index, 1);
  recordTaskEvent("task.deleted", task, { index });
  render();
  return { task, index };
}

function restoreDeletedTask(deleted) {
  if (!deleted?.task) return;
  const index = clampNumber(deleted.index, 0, state.tasks.length);
  state.tasks.splice(index, 0, deleted.task);
  recordTaskEvent("task.restored", deleted.task, { index });
  render();
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getRole(roleId) {
  return classOptions.find((role) => role.id === roleId) || classOptions[0];
}

function getVariant(variantId) {
  return avatarVariants.find((variant) => variant.id === variantId) || avatarVariants[0];
}

function getAvatarSrc(roleId, variantId) {
  if (variantId === "femme") {
    return `./assets/avatar-role-femme-${roleId}.webp`;
  }
  return `./assets/avatar-role-${roleId}.webp`;
}

function getMotion(motionId) {
  return motionOptions.find((motion) => motion.id === motionId) || motionOptions[0];
}

function getBossOption(bossId) {
  return bossOptions.find((boss) => boss.id === bossId) || bossOptions[0];
}

function setCurrentBoss(bossId, options = {}) {
  const previousPercent = state.boss.maxHp ? state.boss.hp / state.boss.maxHp : 1;
  const boss = getBossOption(bossId);
  state.boss.currentId = boss.id;
  state.boss.maxHp = boss.maxHp;
  state.boss.hp = options.resetHp
    ? boss.maxHp
    : Math.max(1, Math.round(boss.maxHp * previousPercent));
  if (typeof options.rotationEnabled === "boolean") {
    state.boss.rotationEnabled = options.rotationEnabled;
  }
}

function pickRandomBossId(excludeId = "") {
  const pool = bossOptions.filter((boss) => boss.id !== excludeId);
  const candidates = pool.length ? pool : bossOptions;
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

function renderBoss() {
  const boss = getBossOption(state.boss.currentId);
  if (activeViewId === "tasks") {
    els.bossImage.src = boss.src;
    els.bossImage.alt = `${boss.name} boss`;
    els.bossImage.dataset.bossId = boss.id;
  }
  els.bossName.textContent = boss.label;
  els.bossReward.textContent = `Reward ${boss.rewardGems} Gem / 弱点 ${taskKindLabels[boss.weakKind]}`;
  if (activeViewId === "bosses") {
    els.bossPreviewImage.src = boss.src;
    els.bossPreviewImage.alt = `${boss.name} preview`;
  }
  els.bossPreviewName.textContent = boss.label;
  els.bossPreviewDescription.textContent = boss.description;
  els.bossThreatLabel.textContent = boss.threat;
  els.bossHpText.textContent = `${state.boss.hp}/${state.boss.maxHp}`;
  els.bossRewardText.textContent = `${boss.rewardGems} Gem / ${boss.rewardXp} XP / 弱点 ${taskKindLabels[boss.weakKind]}`;
  els.bossDefeatCount.textContent = state.boss.defeatCount;
  els.bossRotationStatus.textContent = state.boss.rotationEnabled ? "ローテーション中" : "固定中";
  els.lockBossButton.textContent = state.boss.rotationEnabled ? "このボスに挑戦" : "固定中";
  els.bossMeter.style.width = `${Math.max(0, (state.boss.hp / state.boss.maxHp) * 100)}%`;
}

function rotateBoss() {
  if (!state.boss.rotationEnabled) return;
  setCurrentBoss(pickRandomBossId(state.boss.currentId));
  if (activeViewId === "tasks") els.bossImage.classList.add("is-rotating");
  window.setTimeout(() => {
    renderBoss();
    if (activeViewId === "bosses") renderBossGallery();
    saveState({ emitCloud: false });
    requestAnimationFrame(() => {
      els.bossImage.classList.remove("is-rotating");
    });
  }, 150);
}

function startBossRotation() {
  if (bossRotationTimer) return;
  bossRotationTimer = window.setInterval(rotateBoss, bossRotationMs);
}

function renderBossGallery() {
  els.bossGrid.innerHTML = "";
  bossOptions.forEach((boss) => {
    const defeated = state.boss.defeatedIds.includes(boss.id);
    const active = boss.id === state.boss.currentId;
    const card = document.createElement("article");
    card.className = "boss-card";
    card.classList.toggle("active", active);
    card.classList.toggle("defeated", defeated);
    card.innerHTML = `
      <div class="boss-card-stage">
        <img src="${boss.src}" alt="${boss.name}" loading="lazy" decoding="async" />
      </div>
      <div class="boss-card-tags">
        <span class="pill">${boss.threat}</span>
        <span class="pill">弱点 ${taskKindLabels[boss.weakKind]}</span>
      </div>
      <h4>${boss.label}</h4>
      <p>${boss.description}</p>
      <footer>
        <span class="shop-price">${boss.rewardGems} Gem</span>
        <button type="button">${active && !state.boss.rotationEnabled ? "挑戦中" : "挑戦"}</button>
      </footer>
    `;
    card.querySelector("button").addEventListener("click", () => {
      setCurrentBoss(boss.id, { resetHp: true, rotationEnabled: false });
      render();
    });
    els.bossGrid.appendChild(card);
  });
}

function renderBattleLog() {
  if (!els.battleLogList) return;
  const logs = state.boss.battleLog || [];
  if (!logs.length) {
    els.battleLogList.innerHTML = `<span class="empty-log">タスクを完了するとここに戦闘ログが残ります。</span>`;
    return;
  }
  els.battleLogList.innerHTML = "";
  logs.forEach((log) => {
    const row = document.createElement("div");
    row.className = "battle-log-row";
    const time = document.createElement("span");
    time.textContent = formatLogTime(log.at);
    const result = document.createElement("strong");
    result.textContent = log.defeated ? "撃破" : `${log.damage} dmg`;
    const detail = document.createElement("p");
    detail.textContent = `${log.task} ${log.weak ? "・弱点" : ""}${log.reward ? ` / ${log.reward}` : ""}`;
    row.append(time, result, detail);
    els.battleLogList.appendChild(row);
  });
}

function playPendingBossEffect() {
  if (!pendingBossEffect) return;
  const effect = pendingBossEffect;
  pendingBossEffect = null;
  const text = effect.defeated ? effect.reward : `-${effect.damage}`;

  [els.bossImage, els.bossPreviewImage].forEach((image) => {
    image.classList.remove("is-attacked");
    void image.offsetWidth;
    image.classList.add("is-attacked");
    window.setTimeout(() => image.classList.remove("is-attacked"), 420);
  });

  els.bossHitText.textContent = text;
  els.bossHitText.classList.remove("is-visible");
  void els.bossHitText.offsetWidth;
  els.bossHitText.classList.add("is-visible");
  window.setTimeout(() => {
    els.bossHitText.classList.remove("is-visible");
  }, 760);
}

function buyOrEquipItem(itemId) {
  const item = shopItems.find((entry) => entry.id === itemId);
  if (!item) return;
  const owned = state.character.ownedItems.includes(item.id);

  if (!owned) {
    if (state.character.gems < item.price) {
      return;
    }
    state.character.gems -= item.price;
    state.character.ownedItems.push(item.id);
  }

  if (state.character.equippedItems.includes(item.id)) {
    state.character.equippedItems = state.character.equippedItems.filter((entry) => entry !== item.id);
  } else {
    state.character.equippedItems = state.character.equippedItems.filter((entry) => {
      const equippedItem = shopItems.find((candidate) => candidate.id === entry);
      return !equippedItem || equippedItem.slot !== item.slot;
    });
    state.character.equippedItems.push(item.id);
  }
  render();
}

function render() {
  saveState();
  applyTheme();
  els.sortMode.value = state.sortMode;
  els.currentDateLabel.textContent = formatCurrentDateLabel();
  renderCharacter();
  if (activeViewId === "tasks") {
    renderRolloverStatus();
    renderBoss();
    renderTasks();
  }
  if (activeViewId === "bosses") {
    renderBoss();
    renderBossGallery();
    renderBattleLog();
  }
  if (activeViewId === "battle") renderCommandBattle();
  if (activeViewId === "character") renderCharacterCustomizer();
  if (activeViewId === "shop") renderShop();
  if (activeViewId === "party") renderParty();
  if (activeViewId === "inventory") renderInventory();
  if (activeViewId === "integrations") renderIntegrationHub();
  playPendingBossEffect();
}

function applyTheme() {
  const preset = themePresets[state.theme];
  document.body.dataset.theme = state.theme;
  document.body.dataset.motion = state.preferences?.motionEnabled ? "on" : "off";
  els.brandTagline.textContent = preset.tagline;
  els.themeKicker.textContent = preset.label;
  els.themeHeroTitle.textContent = preset.heroTitle;
  els.themeHeroCopy.textContent = preset.heroCopy;
  els.themeOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === state.theme);
  });
  applyAppearance();
  renderFeedbackSettings();
}

const appearanceLabels = {
  light: "ライト",
  dark: "ダーク",
  system: "システム設定",
};

const appearanceIcons = {
  light: "☀",
  dark: "☾",
  system: "◐",
};

const themeColorMap = {
  arcane: { light: "#202735", dark: "#10151c" },
  soft: { light: "#232b31", dark: "#111715" },
  retro: { light: "#171b25", dark: "#0b0e15" },
};

const colorSchemeQuery = typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;
let sessionAppearanceMode = null;

function normalizeAppearanceMode(value) {
  return appearanceModes.includes(value) ? value : "system";
}

function getAppearanceMode() {
  try {
    return normalizeAppearanceMode(localStorage.getItem(appearanceStorageKey) || sessionAppearanceMode);
  } catch {
    return normalizeAppearanceMode(sessionAppearanceMode);
  }
}

function getResolvedColorMode(mode = getAppearanceMode()) {
  if (mode !== "system") return mode;
  return colorSchemeQuery?.matches ? "dark" : "light";
}

function applyAppearance() {
  const mode = getAppearanceMode();
  const resolved = getResolvedColorMode(mode);
  document.documentElement.dataset.appearanceMode = mode;
  document.documentElement.dataset.colorMode = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.body.dataset.colorMode = resolved;

  const label = appearanceLabels[mode];
  if (els.appearanceIcon) els.appearanceIcon.textContent = appearanceIcons[mode];
  if (els.appearanceButton) {
    els.appearanceButton.setAttribute("aria-label", `表示モードを変更。現在は${label}`);
    els.appearanceButton.title = `表示モード: ${label}`;
  }
  els.appearanceOptions.forEach((button) => {
    const active = button.dataset.appearanceOption === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });

  const themeColors = themeColorMap[state.theme] || themeColorMap.soft;
  els.themeColorMeta?.setAttribute("content", themeColors[resolved]);
}

function setAppearanceMenuOpen(open) {
  if (!els.appearanceMenu || !els.appearanceButton) return;
  els.appearanceMenu.hidden = !open;
  els.appearanceButton.setAttribute("aria-expanded", String(open));
  if (open) {
    const activeOption = [...els.appearanceOptions].find((button) => button.classList.contains("active"));
    window.requestAnimationFrame(() => activeOption?.focus());
  }
}

function setAppearanceMode(mode) {
  const normalized = normalizeAppearanceMode(mode);
  sessionAppearanceMode = normalized;
  try {
    localStorage.setItem(appearanceStorageKey, normalized);
  } catch {
    // Keep the selected mode in memory when private storage is unavailable.
  }
  applyAppearance();
  setAppearanceMenuOpen(false);
}

function renderFeedbackSettings() {
  if (els.soundEnabledToggle) {
    els.soundEnabledToggle.checked = Boolean(state.preferences?.soundEnabled);
  }
  if (els.motionEnabledToggle) {
    els.motionEnabledToggle.checked = Boolean(state.preferences?.motionEnabled);
  }
}

function renderRolloverStatus() {
  if (!els.rolloverStatus) return;
  const summary = state.lastRolloverSummary || { reset: 0, advanced: 0 };
  els.rolloverStatus.textContent =
    `${formatCurrentDateLabel()} / 復活 ${summary.reset || 0}件 / 次回へ移動 ${summary.advanced || 0}件`;
}

function renderCharacter() {
  const role = getRole(state.character.role);
  const motion = getMotion(state.character.motion);
  const variant = getVariant(state.character.variant);
  const avatarSrc = getAvatarSrc(state.character.role, state.character.variant);
  els.characterName.textContent = state.character.name;
  els.characterClass.textContent = `Level ${state.character.level} ${role.name} / ${state.character.personality}`;
  els.hpValue.textContent = `${state.character.hp}/${state.character.maxHp}`;
  els.xpValue.textContent = `${state.character.xp}/${state.character.nextXp}`;
  els.gemValue.textContent = `${state.character.gems}`;
  els.streakValue.textContent = `${state.character.streak}`;
  els.avatarImage.src = avatarSrc;
  updateAvatarMotion(els.avatarStack || els.avatarImage, motion.className);
  if (activeViewId === "character") {
    els.characterPreviewImage.src = avatarSrc;
    els.classLineupImage.src = variant.lineupSrc;
    updateAvatarMotion(els.avatarPreviewStack || els.characterPreviewImage, motion.className);
  }
  renderEquipmentEffects();
}

function renderCharacterCustomizer() {
  els.gemBalance.textContent = state.character.gems;
  if (!els.variantSelect.options.length) {
    avatarVariants.forEach((variant) => {
      els.variantSelect.appendChild(new Option(variant.name, variant.id));
    });
  }
  if (!els.classSelect.options.length) {
    classOptions.forEach((role) => {
      els.classSelect.appendChild(new Option(`${role.name} / ${role.label}`, role.id));
    });
  }
  if (!els.personalitySelect.options.length) {
    personalityTypes.forEach((type) => {
      els.personalitySelect.appendChild(new Option(type, type));
    });
  }
  if (!els.motionSelect.options.length) {
    motionOptions.forEach((motion) => {
      els.motionSelect.appendChild(new Option(motion.name, motion.id));
    });
  }

  els.variantSelect.value = state.character.variant;
  els.classSelect.value = state.character.role;
  els.personalitySelect.value = state.character.personality;
  els.motionSelect.value = state.character.motion;

  els.classGrid.innerHTML = "";
  classOptions.forEach((role) => {
    const card = document.createElement("article");
    card.className = "class-card";
    card.classList.toggle("active", role.id === state.character.role);
    card.innerHTML = `
      <strong>${role.name} <span class="pill">${role.label}</span></strong>
      <p>${role.description}</p>
    `;
    card.addEventListener("click", () => {
      state.character.role = role.id;
      state.character.motion = role.defaultMotion;
      render();
    });
    els.classGrid.appendChild(card);
  });
  renderEquipmentCalibrator();
}

function renderShop() {
  els.shopGemBalance.textContent = state.character.gems;
  els.shopGrid.innerHTML = "";
  shopItems.forEach((item) => {
    const owned = state.character.ownedItems.includes(item.id);
    const equipped = state.character.equippedItems.includes(item.id);
    const recommended = isRecommendedShopItem(item);
    const card = document.createElement("article");
    card.className = "shop-card";
    card.classList.toggle("equipped", equipped);
    card.classList.toggle("recommended", recommended);
    const action = owned ? (equipped ? "外す" : "装備") : "入手";
    const slotLabel = slotLabels[item.slot] || item.type;
    const art = item.asset
      ? `<img class="item-art" src="${item.asset}" alt="${item.name}" loading="lazy" />`
      : `<span class="item-art item-art-aura" aria-hidden="true"></span>`;
    card.innerHTML = `
      ${art}
      <div class="shop-card-tags">
        <span class="pill">${slotLabel}</span>
        <span class="pill">${item.affinity}</span>
        ${recommended ? `<span class="pill">おすすめ</span>` : ""}
      </div>
      <strong>${item.name}</strong>
      <p>${item.description}</p>
      <footer>
        <span class="shop-price">${item.price} Gem</span>
        <button type="button">${action}</button>
      </footer>
    `;
    card.querySelector("button").addEventListener("click", () => buyOrEquipItem(item.id));
    els.shopGrid.appendChild(card);
  });
}

function isRecommendedShopItem(item) {
  const role = getRole(state.character.role);
  const personality = state.character.personality || "";
  if (item.affinity?.includes(role.name)) return true;
  if (item.id === "warm-aura" && personality.includes("F")) return true;
  if (item.id === "logic-sparks" && personality.includes("T")) return true;
  return false;
}

function updateAvatarMotion(image, className) {
  if (!image) return;
  image.classList.remove(...motionOptions.map((motion) => motion.className));
  image.classList.add(className);
}

function renderEquipmentEffects() {
  const equippedItems = getEquippedItems();
  const stages = [els.avatarStage, els.avatarPreviewStage].filter(Boolean);
  const effectClasses = shopItems.map((item) => `has-${item.id}`);
  const equippedIds = new Set(equippedItems.map((item) => item.id));
  const adjustableItems = getAdjustableEquipmentItems(equippedItems);

  if (!adjustableItems.some((item) => item.id === selectedEquipmentId)) {
    selectedEquipmentId = adjustableItems[0]?.id || "";
  }

  stages.forEach((stage) => {
    stage.classList.remove(...effectClasses);
    stage.classList.toggle("is-calibrating", Boolean(selectedEquipmentId && els.equipmentDragToggle?.checked));
    equippedItems.forEach((item) => stage.classList.add(`has-${item.id}`));
    stage.querySelectorAll("[data-item-layer]").forEach((layer) => {
      const itemId = layer.dataset.itemLayer;
      const item = shopItems.find((entry) => entry.id === itemId);
      const equipped = equippedIds.has(itemId);
      layer.dataset.equipped = String(equipped);
      layer.dataset.selected = String(stage === els.avatarPreviewStage && itemId === selectedEquipmentId);
      if (item?.asset) {
        applyEquipmentPlacement(layer, item);
      }
    });
  });
  renderEquipmentChips(els.avatarEquipChips, equippedItems.slice(0, 3));
  renderEquipmentChips(els.previewEquipChips, equippedItems);
}

function getEquippedItems() {
  return state.character.equippedItems
    .map((itemId) => shopItems.find((item) => item.id === itemId))
    .filter(Boolean);
}

function getAdjustableEquipmentItems(items = getEquippedItems()) {
  return items.filter((item) => item.asset);
}

function getEquipmentPlacement(item) {
  const base = equipmentBasePlacements[item.id] || { x: 50, y: 50, size: 30 };
  const role = equipmentRolePlacements[state.character.role]?.[item.id] || {};
  const variant = equipmentVariantPlacements[state.character.variant]?.[item.id] || {};
  const custom = state.character.equipmentOffsets?.[item.id] || {};
  return {
    x: clampNumber((base.x || 50) + (role.x || 0) + (variant.x || 0) + (custom.x || 0), 0, 100),
    y: clampNumber((base.y || 50) + (role.y || 0) + (variant.y || 0) + (custom.y || 0), 0, 100),
    size: clampNumber((base.size || 30) + (role.size || 0) + (variant.size || 0) + (custom.scale || 0), 6, 95),
  };
}

function applyEquipmentPlacement(layer, item) {
  const placement = getEquipmentPlacement(item);
  layer.style.setProperty("--eq-x", `${placement.x}%`);
  layer.style.setProperty("--eq-y", `${placement.y}%`);
  layer.style.setProperty("--eq-size", `${placement.size}%`);
  layer.title = item.name;
}

function getEquipmentOffset(itemId) {
  return state.character.equipmentOffsets?.[itemId] || { x: 0, y: 0, scale: 0 };
}

function updateEquipmentOffset(itemId, partial) {
  if (!itemId) return;
  state.character.equipmentOffsets = {
    ...(state.character.equipmentOffsets || {}),
    [itemId]: {
      ...getEquipmentOffset(itemId),
      ...partial,
    },
  };
  state.character.equipmentOffsets = normalizeEquipmentOffsets(state.character.equipmentOffsets);
}

function renderEquipmentCalibrator() {
  if (!els.equipmentCalibrator) return;
  const adjustableItems = getAdjustableEquipmentItems();
  els.equipmentCalibrator.hidden = adjustableItems.length === 0;
  if (!adjustableItems.length) {
    selectedEquipmentId = "";
    return;
  }
  if (!adjustableItems.some((item) => item.id === selectedEquipmentId)) {
    selectedEquipmentId = adjustableItems[0].id;
  }

  const optionSignature = adjustableItems.map((item) => item.id).join("|");
  if (els.equipmentAdjustSelect.dataset.signature !== optionSignature) {
    els.equipmentAdjustSelect.innerHTML = "";
    adjustableItems.forEach((item) => {
      els.equipmentAdjustSelect.appendChild(new Option(`${slotLabels[item.slot] || item.type} / ${item.name}`, item.id));
    });
    els.equipmentAdjustSelect.dataset.signature = optionSignature;
  }
  els.equipmentAdjustSelect.value = selectedEquipmentId;
  const offset = getEquipmentOffset(selectedEquipmentId);
  els.equipmentOffsetX.value = offset.x || 0;
  els.equipmentOffsetY.value = offset.y || 0;
  els.equipmentScale.value = offset.scale || 0;
}

function renderEquipmentChips(target, items) {
  if (!target) return;
  target.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "equip-chip muted";
    empty.textContent = "装備なし";
    target.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "equip-chip";
    chip.textContent = `${slotLabels[item.slot] || item.type}: ${item.name}`;
    target.appendChild(chip);
  });
}

function renderTasks() {
  const buckets = {
    habit: els.habitList,
    daily: els.dailyList,
    todo: els.todoList,
    reward: els.rewardList,
  };

  Object.values(buckets).forEach((bucket) => {
    bucket.innerHTML = "";
  });
  els.taskFilterOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.taskFilter === state.taskFilter);
  });
  renderTaskSummary();
  renderArchiveDialog();

  const visibleCounts = { habit: 0, daily: 0, todo: 0, reward: 0 };
  [...state.tasks].filter(taskMatchesFilter).sort(compareTasks).forEach((task) => {
    if (!buckets[task.kind]) return;
    buckets[task.kind].appendChild(createTaskCard(task));
    visibleCounts[task.kind] += 1;
  });

  Object.entries(buckets).forEach(([kind, bucket]) => {
    if (visibleCounts[kind] === 0) {
      bucket.appendChild(createEmptyTaskMessage(kind));
    }
  });
}

function renderTaskSummary() {
  if (!els.taskSummaryRow) return;
  const today = currentDateText();
  const activeTasks = state.tasks.filter((task) => !core.isArchivedTask(task));
  const undone = activeTasks.filter((task) => task.kind !== "reward" && !task.done).length;
  const dueToday = activeTasks.filter((task) => task.kind !== "reward" && task.dueDate === today).length;
  const overdue = state.tasks.filter(isOverdue).length;
  const archived = getArchivedTasks().length;
  const rewards = state.tasks.filter((task) => task.kind === "reward").length;
  els.taskSummaryRow.innerHTML = `
    <span class="summary-chip"><strong>${undone}</strong> 未完了</span>
    <span class="summary-chip"><strong>${dueToday}</strong> 今日まで</span>
    <span class="summary-chip danger"><strong>${overdue}</strong> 期限切れ</span>
    <span class="summary-chip"><strong>${archived}</strong> アーカイブ</span>
    <span class="summary-chip"><strong>${rewards}</strong> ごほうび</span>
  `;
}

function taskMatchesFilter(task) {
  if (core.isArchivedTask(task)) return false;
  if (state.taskFilter === "today") {
    return task.kind !== "reward" && task.dueDate === currentDateText();
  }
  if (state.taskFilter === "overdue") {
    return isOverdue(task);
  }
  if (state.taskFilter === "upcoming") {
    return task.kind !== "reward" && !task.done && task.dueDate && daysUntil(task.dueDate) >= 0 && daysUntil(task.dueDate) <= 7;
  }
  if (state.taskFilter === "undone") {
    return task.kind === "reward" || !task.done;
  }
  return true;
}

function getArchivedTasks() {
  return state.tasks
    .filter((task) => core.isArchivedTask(task))
    .sort((a, b) => archiveSortKey(b).localeCompare(archiveSortKey(a)));
}

function archiveSortKey(task) {
  return task.lastCompletedDate || task.updatedAt || task.createdAt || "";
}

function renderArchiveDialog() {
  if (!els.archiveList || !els.archiveButton || !els.archiveCount) return;
  const tasks = getArchivedTasks();
  els.archiveCount.textContent = String(tasks.length);
  els.archiveButton.setAttribute("aria-label", `アーカイブ ${tasks.length}件`);
  els.archiveList.innerHTML = "";

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-task";
    empty.textContent = "アーカイブはまだありません。";
    els.archiveList.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    els.archiveList.appendChild(createArchiveTaskCard(task));
  });
}

function createArchiveTaskCard(task) {
  const card = document.createElement("article");
  card.className = "archive-task-card";

  const heading = document.createElement("div");
  heading.className = "archive-task-heading";
  const title = document.createElement("strong");
  title.textContent = task.title;
  heading.appendChild(title);
  const type = pill(task.kind === "daily" ? "今日の約束" : "一回クエスト");
  type.classList.add("done");
  heading.appendChild(type);
  card.appendChild(heading);

  if (task.notes) {
    const notes = document.createElement("p");
    notes.className = "task-notes";
    notes.textContent = task.notes;
    card.appendChild(notes);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.appendChild(pill(formatArchiveCompletion(task)));
  if (task.dueDate) meta.appendChild(pill(formatDueDate(task.dueDate)));
  (task.tags || []).forEach((tag) => meta.appendChild(pill(`#${tag}`)));
  card.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "archive-task-actions";
  const restore = document.createElement("button");
  restore.className = "secondary-button";
  restore.type = "button";
  restore.textContent = "未完了に戻す";
  restore.addEventListener("click", () => restoreArchivedTask(task.id));
  actions.appendChild(restore);

  const edit = document.createElement("button");
  edit.className = "secondary-button";
  edit.type = "button";
  edit.textContent = "編集";
  edit.addEventListener("click", () => {
    closeArchiveDialog();
    openTaskDialog(task);
  });
  actions.appendChild(edit);
  card.appendChild(actions);

  return card;
}

function formatArchiveCompletion(task) {
  const dateText = task.lastCompletedDate || "";
  if (!dateText) return "完了日未記録";
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()} 完了`;
}

function openArchiveDialog() {
  renderArchiveDialog();
  if (typeof els.archiveDialog.showModal === "function") {
    els.archiveDialog.showModal();
  } else {
    els.archiveDialog.setAttribute("open", "");
  }
}

function closeArchiveDialog() {
  if (!els.archiveDialog?.open) return;
  if (typeof els.archiveDialog.close === "function") {
    els.archiveDialog.close();
  } else {
    els.archiveDialog.removeAttribute("open");
  }
}

function restoreArchivedTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !core.isArchivedTask(task)) return;
  task.done = false;
  task.updatedAt = new Date().toISOString();
  recordTaskEvent("task.reopened", task, { rewardReversed: false, source: "archive" });
  playInteractionCue("restore");
  render();
  renderArchiveDialog();
  showToast(`「${task.title}」を未完了に戻しました。`, { duration: 3200 });
}

function createEmptyTaskMessage(kind) {
  const item = document.createElement("div");
  item.className = "empty-task";
  item.textContent = `${taskKindLabels[kind]}はまだ表示対象がありません。`;
  return item;
}

function compareTasks(a, b) {
  if (state.sortMode === "dueDate") {
    return compareDueDate(a, b) || compareCreated(a, b);
  }
  if (state.sortMode === "name") {
    return a.title.localeCompare(b.title, "ja") || compareCreated(a, b);
  }
  if (state.sortMode === "difficulty") {
    return difficultyScale(b.difficulty) - difficultyScale(a.difficulty) || compareCreated(a, b);
  }
  if (state.sortMode === "undone") {
    return Number(Boolean(a.done)) - Number(Boolean(b.done)) || compareDueDate(a, b) || compareCreated(a, b);
  }
  return compareCreated(a, b);
}

function compareDueDate(a, b) {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function compareCreated(a, b) {
  return a.createdAt.localeCompare(b.createdAt);
}

function createTaskCard(task) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.classList.add(`${task.kind}-card`);
  card.dataset.taskId = task.id;

  if (task.kind === "daily" || task.kind === "todo") {
    const completeMark = document.createElement("span");
    completeMark.className = "task-complete-mark";
    completeMark.setAttribute("aria-hidden", "true");
    completeMark.textContent = "✓";
    card.appendChild(completeMark);
  }

  const top = document.createElement("div");
  top.className = "task-topline";

  if (task.kind !== "reward") {
    const plus = document.createElement("button");
    plus.className = "score-button";
    plus.type = "button";
    plus.textContent = task.done ? "✓" : "+";
    plus.setAttribute(
      "aria-label",
      task.kind === "habit" ? `${task.title}をプラス記録` : `${task.title}を完了`,
    );
    plus.addEventListener("click", () => scoreTask(task.id, "up"));
    top.appendChild(plus);
  }

  const body = document.createElement("div");
  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = task.title;
  body.appendChild(title);

  if (task.notes) {
    const notes = document.createElement("p");
    notes.className = "task-notes";
    notes.textContent = task.notes;
    body.appendChild(notes);
  }
  top.appendChild(body);

  if (task.kind === "habit" || task.kind === "daily") {
    const minus = document.createElement("button");
    minus.className = "score-button negative";
    minus.type = "button";
    minus.textContent = "-";
    minus.setAttribute(
      "aria-label",
      task.kind === "habit" ? `${task.title}をマイナス記録` : `${task.title}を失敗として記録`,
    );
    minus.addEventListener("click", () => scoreTask(task.id, "down"));
    top.appendChild(minus);
  }

  const edit = document.createElement("button");
  edit.className = "edit-button";
  edit.type = "button";
  edit.title = `${task.title}を編集`;
  edit.setAttribute("aria-label", `${task.title}を編集`);
  edit.textContent = "...";
  edit.addEventListener("click", () => openTaskDialog(task));
  top.appendChild(edit);

  card.appendChild(top);

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.appendChild(pill(difficultyLabels[task.difficulty] || task.difficulty));
  if (task.repeat && task.repeat !== "none") {
    meta.appendChild(pill(repeatLabels[task.repeat] || task.repeat));
  }

  if (task.kind === "daily") {
    meta.appendChild(pill(`連続 ${task.streak || 0}`));
  }
  if (task.dueDate) {
    const due = pill(formatDueDate(task.dueDate));
    due.classList.add(isOverdue(task) ? "overdue" : "due");
    meta.appendChild(due);
  }
  if (task.done) {
    const done = pill("完了");
    done.classList.add("done");
    meta.appendChild(done);
  }
  if (task.kind === "reward") {
    meta.appendChild(pill(`${task.cost || rewardCost(task.difficulty)} Gem`));
  }
  (task.tags || []).forEach((tag) => {
    meta.appendChild(pill(`#${tag}`));
  });
  (task.externalLinks || []).forEach((link) => {
    const adapter = integrationAdapters.find((item) => item.id === link.service);
    meta.appendChild(pill(adapter ? adapter.shortName : link.service));
  });
  card.appendChild(meta);

  if (task.kind === "reward") {
    const buy = document.createElement("button");
    buy.className = "primary-button reward-buy";
    buy.type = "button";
    buy.textContent = "交換";
    buy.setAttribute("aria-label", `${task.title}を${task.cost || rewardCost(task.difficulty)} Gemで交換`);
    buy.addEventListener("click", () => scoreTask(task.id, "up"));
    card.appendChild(buy);
  }

  return card;
}

function formatDueDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}まで`;
}

function isOverdue(task) {
  if (!task.dueDate || task.done || task.kind === "reward") return false;
  return task.dueDate < currentDateText();
}

function currentDateText() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatCurrentDateLabel() {
  const today = new Date(`${currentDateText()}T00:00:00`);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function nextDueDateForTask(task, fromDateText) {
  return core.nextDueDateForTask(task, fromDateText);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateText) {
  const today = new Date(`${currentDateText()}T00:00:00`);
  const target = new Date(`${dateText}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6);
  }
  return String(value || "")
    .split(/[,\s、]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function formatLogTime(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function pill(text) {
  const item = document.createElement("span");
  item.className = "pill";
  item.textContent = text;
  return item;
}

function getSelectedIntegration() {
  return integrationAdapters.find((adapter) => adapter.id === state.integrations.selectedService) || integrationAdapters[0];
}

function getGatewayUrl() {
  const stored = localStorage.getItem(gatewayStorageKey) || "";
  if (stored) return stored.replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return "http://127.0.0.1:8787";
  return "";
}

async function gatewayFetch(path, options = {}) {
  const base = getGatewayUrl();
  if (!base) throw new Error("Gateway URLを設定してください。");
  const token = await globalThis.QuestForgeFirebase?.getIdToken?.();
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `Gateway HTTP ${response.status}`);
  return body;
}

function setGatewayStatus(status, message) {
  gatewayRuntime.status = status;
  if (els.apiGatewayStatus) {
    els.apiGatewayStatus.dataset.status = status;
    els.apiGatewayStatus.textContent = message;
  }
  if (els.integrationModeLabel) els.integrationModeLabel.textContent = status === "online" ? "Gateway live" : "ローカルモック";
}

async function refreshGatewayRuntime() {
  const base = getGatewayUrl();
  if (els.gatewayUrlInput) els.gatewayUrlInput.value = base;
  if (els.openMcpEndpointLink) {
    els.openMcpEndpointLink.href = base ? `${base}/mcp` : "#";
    els.openMcpEndpointLink.setAttribute("aria-disabled", base ? "false" : "true");
  }
  if (!base) {
    setGatewayStatus("offline", "Gateway未接続");
    if (els.gatewayOutput) els.gatewayOutput.textContent = "Gateway URLを設定してください。";
    return;
  }
  setGatewayStatus("checking", "接続確認中");
  try {
    const health = await gatewayFetch("/health");
    const user = globalThis.QuestForgeFirebase?.getUser?.();
    if (!user) {
      setGatewayStatus("online", "Gateway稼働中");
      els.gatewayOutput.textContent = `${health.service} ${health.version}\nGoogleログイン後にAPIデータを確認できます。`;
      return;
    }
    const [integrations, webhooks, plugins] = await Promise.all([
      gatewayFetch("/v1/integrations"),
      gatewayFetch("/v1/webhooks"),
      gatewayFetch("/v1/plugins"),
    ]);
    gatewayRuntime.integrations = integrations.integrations || [];
    gatewayRuntime.webhooks = webhooks.webhooks || [];
    gatewayRuntime.plugins = plugins.plugins || [];
    setGatewayStatus("online", "API / MCP接続済み");
    els.gatewayOutput.textContent = `${health.service} ${health.version}\nREST: ${base}/v1/quests\nMCP: ${base}/mcp\nOAuth: ${base}/.well-known/oauth-authorization-server`;
    renderRuntimeWebhooks();
    renderRuntimePlugins();
    renderIntegrationHub();
  } catch (error) {
    setGatewayStatus("error", "Gateway接続エラー");
    if (els.gatewayOutput) els.gatewayOutput.textContent = error.message;
  }
}

function renderRuntimeWebhooks() {
  if (!els.webhookList) return;
  els.webhookList.innerHTML = "";
  const hooks = gatewayRuntime.webhooks || [];
  if (!hooks.length) {
    els.webhookList.textContent = "登録済みWebhookはありません。";
    return;
  }
  hooks.forEach((hook) => {
    const item = document.createElement("article");
    item.className = "runtime-list-item";
    const title = document.createElement("strong");
    title.textContent = hook.url;
    const meta = document.createElement("p");
    meta.textContent = `${(hook.events || []).join(", ")} / ${hook.enabled ? "有効" : "停止"}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "削除";
    remove.addEventListener("click", async () => {
      await gatewayFetch(`/v1/webhooks/${encodeURIComponent(hook.id)}`, { method: "DELETE" });
      gatewayRuntime.webhooks = hooks.filter((entry) => entry.id !== hook.id);
      renderRuntimeWebhooks();
    });
    item.append(title, meta, remove);
    els.webhookList.appendChild(item);
  });
}

function renderRuntimePlugins() {
  if (!els.pluginList) return;
  els.pluginList.innerHTML = "";
  const plugins = gatewayRuntime.plugins || [];
  if (!plugins.length) els.pluginList.textContent = "インストール済み拡張機能はありません。";
  plugins.forEach((plugin) => {
    const item = document.createElement("article");
    item.className = "runtime-list-item";
    const title = document.createElement("strong");
    title.textContent = plugin.manifest?.name || plugin.id;
    const meta = document.createElement("p");
    meta.textContent = (plugin.manifest?.permissions || []).join(", ");
    item.append(title, meta);
    els.pluginList.appendChild(item);
  });
  renderPluginSlots(plugins);
}

function renderPluginSlots(plugins) {
  document.querySelectorAll("[data-plugin-slot]").forEach((host) => {
    const content = host.querySelector(".plugin-slot-content") || host;
    content.querySelectorAll(".plugin-frame").forEach((frame) => frame.remove());
    let mounted = 0;
    plugins.forEach((plugin) => {
      (plugin.manifest?.uiSlots || []).filter((slot) => slot.slot === host.dataset.pluginSlot).forEach((slot) => {
        const frame = document.createElement("iframe");
        frame.className = "plugin-frame";
        frame.title = `${plugin.manifest.name} / ${slot.slot}`;
        frame.sandbox = "allow-scripts";
        frame.referrerPolicy = "no-referrer";
        frame.src = slot.entry;
        frame.dataset.pluginId = plugin.id;
        frame.dataset.permissions = JSON.stringify(plugin.manifest.permissions || []);
        content.appendChild(frame);
        mounted += 1;
      });
    });
    host.hidden = mounted === 0;
  });
}

async function previewLiveIntegration(run = false) {
  const adapter = getSelectedIntegration();
  const result = await gatewayFetch(`/v1/integrations/${encodeURIComponent(adapter.id)}/sync`, {
    method: "POST",
    body: JSON.stringify({ direction: state.integrations.direction, dryRun: !run }),
  });
  if (!run) {
    els.syncPreviewList.innerHTML = "";
    (result.preview || []).forEach((record) => {
      const item = document.createElement("article");
      item.className = "sync-preview-card";
      const title = document.createElement("strong");
      title.textContent = record.title || record.content || "External record";
      const detail = document.createElement("p");
      detail.textContent = record.notes || record.dueDate || record.sourceType || "";
      item.append(title, detail);
      els.syncPreviewList.appendChild(item);
    });
    els.runLiveSyncButton.disabled = false;
    showToast(`${adapter.name}の実データを確認しました。`);
    return;
  }
  els.runLiveSyncButton.disabled = true;
  showToast(`${adapter.name}: 作成 ${result.created || 0} / 更新 ${result.updated || 0}`);
  window.setTimeout(() => location.reload(), 900);
}

window.addEventListener("message", async (event) => {
  const frame = [...document.querySelectorAll(".plugin-frame")].find((item) => item.contentWindow === event.source);
  if (!frame || event.data?.type !== "questforge:plugin-request") return;
  const permissions = JSON.parse(frame.dataset.permissions || "[]");
  const actions = {
    "quests.list": { permission: "quests:read", path: "/v1/quests" },
    "character.get": { permission: "character:read", path: "/v1/character" },
    "events.list": { permission: "events:read", path: "/v1/events" },
  };
  const action = actions[event.data.action];
  let payload;
  try {
    if (!action || !permissions.includes(action.permission)) throw new Error("拡張機能に必要な権限がありません。");
    payload = { ok: true, result: await gatewayFetch(action.path) };
  } catch (error) {
    payload = { ok: false, error: error.message };
  }
  event.source.postMessage({ type: "questforge:plugin-response", requestId: event.data.requestId, ...payload }, "*");
});

function renderIntegrationHub() {
  if (!els.integrationHubGrid) return;
  const selected = getSelectedIntegration();
  if (els.syncServiceSelect.options.length !== integrationAdapters.length) {
    els.syncServiceSelect.innerHTML = "";
    integrationAdapters.forEach((adapter) => {
      els.syncServiceSelect.appendChild(new Option(adapter.name, adapter.id));
    });
  }
  els.syncServiceSelect.value = selected.id;
  els.syncDirectionSelect.value = state.integrations.direction;

  els.integrationHubGrid.innerHTML = "";
  integrationAdapters.forEach((adapter) => {
    const runtimeAdapter = gatewayRuntime.integrations?.find((item) => item.id === adapter.id);
    const runtimeStatus = runtimeAdapter?.status === "connected" ? "connected" : adapter.status;
    const card = document.createElement("article");
    card.className = "integration-service-card";
    card.classList.toggle("active", adapter.id === selected.id);
    card.innerHTML = `
      <div class="integration-service-top">
        <span class="service-mark">${adapter.shortName}</span>
        <span class="status-pill ${runtimeStatus}">${integrationStatusLabel(runtimeStatus)}</span>
      </div>
      <strong>${adapter.name}</strong>
      <p>${adapter.description}</p>
      <div class="service-meta">
        <span>${adapter.type}</span>
        <span>${adapter.auth}</span>
      </div>
      <button type="button">${adapter.id === selected.id ? "選択中" : "選択"}</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      state.integrations.selectedService = adapter.id;
      state.integrations.direction = adapter.recommendedDirection;
      render();
    });
    els.integrationHubGrid.appendChild(card);
  });

  renderSyncRuleSummary(selected);
  renderSyncPreview(selected);
  renderSyncLogs();
}

function integrationStatusLabel(status) {
  return {
    "mock-ready": "モック可",
    planned: "設計中",
    connected: "接続済み",
  }[status] || status;
}

function renderSyncRuleSummary(adapter) {
  els.syncRuleSummary.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "sync-rule-heading";
  heading.innerHTML = `
    <span>${adapter.scope}</span>
    <strong>${adapter.name} / 推奨 ${syncDirectionLabels[adapter.recommendedDirection]}</strong>
  `;
  els.syncRuleSummary.appendChild(heading);
  adapter.rules.forEach((rule) => {
    const item = document.createElement("div");
    item.className = "sync-rule-row";
    item.textContent = rule;
    els.syncRuleSummary.appendChild(item);
  });
}

function renderSyncPreview(adapter) {
  els.syncPreviewList.innerHTML = "";
  const records = state.integrations.direction === "export"
    ? []
    : mockExternalRecords.filter((record) => record.service === adapter.id);
  const previewItems = records.length ? records : createExportPreviewRecords(adapter);
  previewItems.forEach((record) => {
    const item = document.createElement("article");
    item.className = "sync-preview-card";
    const mapping = record.mapTo || { kind: "habit", repeat: "none", difficulty: "easy" };
    item.innerHTML = `
      <div>
        <span class="pill">${record.sourceType || "questforge.record"}</span>
        <span class="pill">${taskKindLabels[mapping.kind] || mapping.kind}</span>
      </div>
      <strong>${record.title}</strong>
      <p>${record.notes || ""}</p>
      <footer>
        <span>${record.timeBlock || `${record.dueDate || "日付なし"}`}</span>
        <span>${record.durationMinutes ? `${record.durationMinutes}分` : syncDirectionLabels[state.integrations.direction]}</span>
      </footer>
    `;
    els.syncPreviewList.appendChild(item);
  });
}

function createExportPreviewRecords(adapter) {
  return state.tasks
    .filter((task) => task.done || task.kind === "habit")
    .slice(0, 3)
    .map((task) => ({
      service: adapter.id,
      externalId: `export-${adapter.id}-${task.id}`,
      title: task.title,
      sourceType: "questforge.quest",
      dueDate: task.dueDate,
      tags: task.tags || [],
      mapTo: { kind: task.kind, repeat: task.repeat || "none", difficulty: task.difficulty },
      notes: `${adapter.name}へエクスポートする候補。`,
    }));
}

function renderSyncLogs() {
  els.syncLogList.innerHTML = "";
  const logs = state.syncEvents || [];
  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-sync-log";
    empty.textContent = "まだ同期ログはありません。モック同期を実行すると結果が残ります。";
    els.syncLogList.appendChild(empty);
    return;
  }
  logs.forEach((log) => {
    const adapter = integrationAdapters.find((item) => item.id === log.service);
    const item = document.createElement("article");
    item.className = "sync-log-card";
    item.innerHTML = `
      <span>${formatLogTime(log.at)} / ${adapter?.name || log.service}</span>
      <strong>${syncDirectionLabels[log.direction] || log.direction}</strong>
      <p>作成 ${log.created} / 更新 ${log.updated} / スキップ ${log.skipped}</p>
    `;
    els.syncLogList.appendChild(item);
  });
}

function runMockSync() {
  const adapter = getSelectedIntegration();
  const direction = state.integrations.direction;
  const sourceRecords = direction === "export"
    ? createExportPreviewRecords(adapter)
    : mockExternalRecords.filter((record) => record.service === adapter.id);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  sourceRecords.forEach((record) => {
    if (direction === "export") {
      skipped += 1;
      return;
    }
    const existing = findTaskByExternalLink(record.service, record.externalId);
    if (existing) {
      existing.title = record.title;
      existing.notes = record.notes;
      existing.dueDate = record.dueDate || existing.dueDate;
      existing.tags = mergeTags(existing.tags || [], record.tags || []);
      existing.updatedAt = new Date().toISOString();
      existing.externalLinks = updateExternalLink(existing.externalLinks, record, direction);
      updated += 1;
      return;
    }
    const task = createTaskFromExternalRecord(record, direction);
    state.tasks.push(task);
    created += 1;
    if (record.service === "toggl-track") {
      applyTogglMockReward(record, task);
    }
  });

  state.syncEvents = [
    {
      id: createId(),
      at: new Date().toISOString(),
      service: adapter.id,
      direction,
      created,
      updated,
      skipped,
    },
    ...(state.syncEvents || []),
  ].slice(0, 12);
  render();
}

function findTaskByExternalLink(service, externalId) {
  return state.tasks.find((task) =>
    (task.externalLinks || []).some((link) => link.service === service && link.externalId === externalId)
  );
}

function createTaskFromExternalRecord(record, direction) {
  const mapping = record.mapTo || {};
  const kind = mapping.kind || "todo";
  const difficulty = mapping.difficulty || "easy";
  const task = {
    id: createId(),
    kind,
    title: record.title,
    notes: record.notes || "",
    dueDate: record.dueDate || "",
    difficulty,
    repeat: mapping.repeat || (kind === "daily" ? "daily" : "none"),
    tags: mergeTags(record.tags || [], [record.service]),
    createdAt: new Date().toISOString(),
    externalLinks: updateExternalLink([], record, direction),
  };
  if (kind === "daily" || kind === "todo") {
    task.done = false;
  }
  if (kind === "daily") {
    task.streak = 0;
  }
  if (kind === "reward") {
    task.cost = rewardCost(difficulty);
  }
  return task;
}

function updateExternalLink(links = [], record, direction) {
  const rest = links.filter((link) => !(link.service === record.service && link.externalId === record.externalId));
  return [
    ...rest,
    {
      service: record.service,
      externalId: record.externalId,
      sourceType: record.sourceType,
      direction,
      syncedAt: new Date().toISOString(),
    },
  ];
}

function mergeTags(...groups) {
  return [...new Set(groups.flat().filter(Boolean))].slice(0, 8);
}

function applyTogglMockReward(record, task) {
  const minutes = record.durationMinutes || 0;
  const gems = Math.max(1, Math.round(minutes / 15));
  const xp = Math.max(1, Math.round(minutes / 2));
  const damage = Math.max(4, Math.round(minutes / 5));
  state.character.gems += gems;
  grantXp(xp);
  dealBossDamage(damage, task);
}

function renderParty() {
  els.partyGrid.innerHTML = "";
  state.party.forEach((member) => {
    const card = document.createElement("article");
    card.className = "party-card";
    card.innerHTML = `
      <div class="party-mini">${member.name.slice(0, 2)}</div>
      <div>
        <strong>${member.name}</strong>
        <p>${member.role} / HP ${member.hp}</p>
      </div>
    `;
    els.partyGrid.appendChild(card);
  });
}

function renderInventory() {
  els.inventoryGrid.innerHTML = "";
  state.inventory.forEach((item) => {
    const card = document.createElement("article");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-art"></div>
      <strong>${item.name}</strong>
      <p>${item.type} / ${item.power}</p>
    `;
    els.inventoryGrid.appendChild(card);
  });
}

function flashTask(taskId) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) return;
  card.animate(
    [
      { transform: "translateX(0)", borderColor: "#d9e0e8" },
      { transform: "translateX(-5px)", borderColor: "#c14f4f" },
      { transform: "translateX(5px)", borderColor: "#c14f4f" },
      { transform: "translateX(0)", borderColor: "#d9e0e8" },
    ],
    { duration: 260 }
  );
}

function showToast(message, options = {}) {
  window.clearTimeout(undoToastTimer);
  els.undoToastMessage.textContent = message;
  els.undoDeleteButton.hidden = !options.undo;
  toastActionHandler = typeof options.onAction === "function" ? options.onAction : null;
  els.toastActionButton.hidden = !toastActionHandler;
  if (toastActionHandler) {
    els.toastActionButton.textContent = options.actionLabel || "実行";
  }
  els.undoToast.hidden = false;
  const duration = options.duration || (options.undo || toastActionHandler ? 15000 : 8000);
  undoToastTimer = window.setTimeout(hideToast, duration);
}

function hideToast() {
  window.clearTimeout(undoToastTimer);
  els.undoToast.hidden = true;
  els.undoDeleteButton.hidden = true;
  els.toastActionButton.hidden = true;
  toastActionHandler = null;
  if (!pendingDeletedTask) return;
  pendingDeletedTask = null;
}

function resetDeleteConfirmation() {
  window.clearTimeout(deleteConfirmTimer);
  armedDeleteTaskId = "";
  els.deleteTaskButton.classList.remove("is-armed");
  els.deleteTaskButton.textContent = "削除";
}

function toggleMobileMenu(force) {
  const shouldOpen = typeof force === "boolean"
    ? force
    : !els.sidebar.classList.contains("mobile-open");
  els.sidebar.classList.toggle("mobile-open", shouldOpen);
  els.mobileMenuButton.setAttribute("aria-expanded", String(shouldOpen));
  els.mobileMenuButton.setAttribute("aria-label", shouldOpen ? "メニューを閉じる" : "メニューを開く");
}

document.querySelectorAll("[data-add-kind]").forEach((button) => {
  button.addEventListener("click", () => {
    openTaskDialog({ kind: button.dataset.addKind });
  });
});

document.querySelector("#newTaskButton").addEventListener("click", () => {
  openTaskDialog({ kind: "todo", difficulty: "medium" });
});

els.cancelDialog.addEventListener("click", () => {
  closeTaskDialog();
});

els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = getFormValues();
  const task = els.editingTaskId.value
    ? updateTask(els.editingTaskId.value, values)
    : addTask(values.kind, values.title, values.notes, values.dueDate, values.difficulty, values.repeat, values.tags);
  if (!task) {
    els.taskTitle.focus();
    return;
  }
  closeTaskDialog();
  requestAnimationFrame(() => {
    document.querySelector(`[data-task-id="${task.id}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
});

els.deleteTaskButton.addEventListener("click", () => {
  const taskId = els.editingTaskId.value;
  if (!taskId) return;
  if (armedDeleteTaskId !== taskId) {
    armedDeleteTaskId = taskId;
    els.deleteTaskButton.classList.add("is-armed");
    els.deleteTaskButton.textContent = "もう一度押して削除";
    window.clearTimeout(deleteConfirmTimer);
    deleteConfirmTimer = window.setTimeout(resetDeleteConfirmation, 4000);
    return;
  }
  const deleted = deleteTask(taskId);
  if (!deleted) return;
  pendingDeletedTask = deleted;
  closeTaskDialog();
  showToast(`「${deleted.task.title}」を削除しました。`, { undo: true });
});

els.undoDeleteButton.addEventListener("click", () => {
  const deleted = pendingDeletedTask;
  pendingDeletedTask = null;
  hideToast();
  if (!deleted) return;
  restoreDeletedTask(deleted);
  showToast(`「${deleted.task.title}」を元に戻しました。`, { duration: 4000 });
});

els.toastActionButton.addEventListener("click", () => {
  const action = toastActionHandler;
  hideToast();
  action?.();
});

els.closeToastButton.addEventListener("click", hideToast);

els.mobileMenuButton.addEventListener("click", () => toggleMobileMenu());
els.mobileMoreButton.addEventListener("click", () => toggleMobileMenu());

els.sortMode.addEventListener("change", () => {
  state.sortMode = els.sortMode.value;
  render();
});

els.taskFilterOptions.forEach((button) => {
  button.addEventListener("click", () => {
    state.taskFilter = button.dataset.taskFilter;
    render();
  });
});

els.archiveButton.addEventListener("click", () => {
  openArchiveDialog();
});

els.closeArchiveDialog.addEventListener("click", () => {
  closeArchiveDialog();
});

els.runRolloverButton.addEventListener("click", () => {
  state = applyScheduledRollover(state, { force: true });
  render();
});

els.battleCommandButtons.forEach((button) => {
  button.addEventListener("click", () => useBattleCommand(button.dataset.battleCommand));
});

els.battleResetButton.addEventListener("click", () => {
  resetCommandBattle({ resetBoss: true });
});

els.battleRandomBossButton.addEventListener("click", () => {
  setCurrentBoss(pickRandomBossId(state.boss.currentId), { resetHp: true, rotationEnabled: false });
  resetCommandBattle({ resetBoss: false });
});

els.syncServiceSelect.addEventListener("change", () => {
  state.integrations.selectedService = els.syncServiceSelect.value;
  const adapter = getSelectedIntegration();
  state.integrations.direction = adapter.recommendedDirection;
  render();
});

els.syncDirectionSelect.addEventListener("change", () => {
  state.integrations.direction = els.syncDirectionSelect.value;
  render();
});

els.runMockSyncButton.addEventListener("click", () => {
  runMockSync();
});

els.previewLiveSyncButton.addEventListener("click", () => {
  previewLiveIntegration(false).catch((error) => showToast(error.message, { duration: 6000 }));
});

els.runLiveSyncButton.addEventListener("click", () => {
  previewLiveIntegration(true).catch((error) => showToast(error.message, { duration: 6000 }));
});

els.saveGatewayButton.addEventListener("click", () => {
  const url = els.gatewayUrlInput.value.trim().replace(/\/$/, "");
  if (url && !/^https?:\/\//.test(url)) {
    showToast("Gateway URLはhttp://またはhttps://で入力してください。");
    return;
  }
  if (url) localStorage.setItem(gatewayStorageKey, url);
  else localStorage.removeItem(gatewayStorageKey);
  refreshGatewayRuntime();
});

els.createWebhookButton.addEventListener("click", async () => {
  try {
    const result = await gatewayFetch("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: els.webhookUrlInput.value.trim(), events: [els.webhookEventSelect.value] }),
    });
    gatewayRuntime.webhooks = [result.webhook, ...(gatewayRuntime.webhooks || [])];
    els.webhookUrlInput.value = "";
    renderRuntimeWebhooks();
    showToast(`Webhookを登録しました。署名Secret: ${result.webhook.secret}`, { duration: 12000 });
  } catch (error) {
    showToast(error.message, { duration: 6000 });
  }
});

els.installPluginButton.addEventListener("click", async () => {
  try {
    const manifest = JSON.parse(els.pluginManifestInput.value);
    const result = await gatewayFetch("/v1/plugins", { method: "POST", body: JSON.stringify(manifest) });
    gatewayRuntime.plugins = [result.plugin, ...(gatewayRuntime.plugins || []).filter((plugin) => plugin.id !== result.plugin.id)];
    renderRuntimePlugins();
    showToast(`${result.plugin.manifest.name}をsandboxへインストールしました。`);
  } catch (error) {
    showToast(error instanceof SyntaxError ? "Manifest JSONを確認してください。" : error.message, { duration: 6000 });
  }
});

els.equipmentAdjustSelect.addEventListener("change", () => {
  selectedEquipmentId = els.equipmentAdjustSelect.value;
  renderEquipmentCalibrator();
  renderEquipmentEffects();
});

[els.equipmentOffsetX, els.equipmentOffsetY, els.equipmentScale].forEach((input) => {
  input.addEventListener("input", () => {
    updateEquipmentOffset(selectedEquipmentId, {
      x: Number(els.equipmentOffsetX.value),
      y: Number(els.equipmentOffsetY.value),
      scale: Number(els.equipmentScale.value),
    });
    renderEquipmentEffects();
    saveState();
  });
});

els.equipmentDragToggle.addEventListener("change", () => {
  renderEquipmentEffects();
});

els.equipmentResetButton.addEventListener("click", () => {
  if (!selectedEquipmentId) return;
  delete state.character.equipmentOffsets[selectedEquipmentId];
  renderEquipmentCalibrator();
  renderEquipmentEffects();
  saveState();
});

els.equipmentResetAllButton.addEventListener("click", () => {
  state.character.equipmentOffsets = {};
  renderEquipmentCalibrator();
  renderEquipmentEffects();
  saveState();
});

els.avatarPreviewStack.addEventListener("pointerdown", (event) => {
  if (!els.equipmentDragToggle.checked || !selectedEquipmentId) return;
  const item = shopItems.find((entry) => entry.id === selectedEquipmentId && entry.asset);
  if (!item) return;
  const offset = getEquipmentOffset(selectedEquipmentId);
  equipmentDragState = {
    itemId: selectedEquipmentId,
    startX: event.clientX,
    startY: event.clientY,
    offset,
  };
  els.avatarPreviewStage.classList.add("is-dragging");
  event.preventDefault();
});

window.addEventListener("pointermove", (event) => {
  if (!equipmentDragState) return;
  const rect = els.avatarPreviewStack.getBoundingClientRect();
  const deltaX = ((event.clientX - equipmentDragState.startX) / rect.width) * 100;
  const deltaY = ((event.clientY - equipmentDragState.startY) / rect.height) * 100;
  updateEquipmentOffset(equipmentDragState.itemId, {
    x: clampNumber(equipmentDragState.offset.x + deltaX, -30, 30),
    y: clampNumber(equipmentDragState.offset.y + deltaY, -30, 30),
  });
  renderEquipmentCalibrator();
  renderEquipmentEffects();
  saveState();
});

window.addEventListener("pointerup", () => {
  if (!equipmentDragState) return;
  equipmentDragState = null;
  els.avatarPreviewStage.classList.remove("is-dragging");
});

els.variantSelect.addEventListener("change", () => {
  state.character.variant = els.variantSelect.value;
  render();
});

els.classSelect.addEventListener("change", () => {
  const role = getRole(els.classSelect.value);
  state.character.role = role.id;
  state.character.motion = role.defaultMotion;
  render();
});

els.personalitySelect.addEventListener("change", () => {
  state.character.personality = els.personalitySelect.value;
  render();
});

els.motionSelect.addEventListener("change", () => {
  state.character.motion = els.motionSelect.value;
  render();
});

els.randomizeCharacter.addEventListener("click", () => {
  const role = classOptions[Math.floor(Math.random() * classOptions.length)];
  const personality = personalityTypes[Math.floor(Math.random() * personalityTypes.length)];
  const variant = avatarVariants[Math.floor(Math.random() * avatarVariants.length)];
  state.character.variant = variant.id;
  state.character.role = role.id;
  state.character.personality = personality;
  state.character.motion = role.defaultMotion;
  render();
});

els.randomBossButton.addEventListener("click", () => {
  setCurrentBoss(pickRandomBossId(state.boss.currentId), { resetHp: true, rotationEnabled: true });
  render();
});

els.lockBossButton.addEventListener("click", () => {
  setCurrentBoss(state.boss.currentId, { resetHp: false, rotationEnabled: false });
  render();
});

els.themeOptions.forEach((button) => {
  button.addEventListener("click", () => {
    state.theme = button.dataset.themeOption;
    render();
    playInteractionCue("theme");
  });
});

els.appearanceButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setAppearanceMenuOpen(els.appearanceMenu.hidden);
});

els.appearanceOptions.forEach((button) => {
  button.addEventListener("click", () => {
    setAppearanceMode(button.dataset.appearanceOption);
    playInteractionCue("theme");
  });
});

document.addEventListener("click", (event) => {
  if (!els.appearanceControl?.contains(event.target)) setAppearanceMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || els.appearanceMenu?.hidden) return;
  setAppearanceMenuOpen(false);
  els.appearanceButton.focus();
});

const handleSystemColorChange = () => {
  if (getAppearanceMode() === "system") applyAppearance();
};

if (typeof colorSchemeQuery?.addEventListener === "function") {
  colorSchemeQuery.addEventListener("change", handleSystemColorChange);
} else if (typeof colorSchemeQuery?.addListener === "function") {
  colorSchemeQuery.addListener(handleSystemColorChange);
}

els.feedbackSettingsButton.addEventListener("click", () => {
  renderFeedbackSettings();
  if (typeof els.feedbackDialog.showModal === "function") {
    els.feedbackDialog.showModal();
  } else {
    els.feedbackDialog.setAttribute("open", "");
  }
});

els.closeFeedbackDialog.addEventListener("click", () => {
  if (typeof els.feedbackDialog.close === "function") {
    els.feedbackDialog.close();
  } else {
    els.feedbackDialog.removeAttribute("open");
  }
});

els.soundEnabledToggle.addEventListener("change", () => {
  state.preferences.soundEnabled = els.soundEnabledToggle.checked;
  render();
  if (state.preferences.soundEnabled) playInteractionCue("theme");
});

els.motionEnabledToggle.addEventListener("change", () => {
  state.preferences.motionEnabled = els.motionEnabledToggle.checked;
  render();
});

els.previewSoundButton.addEventListener("click", () => {
  previewFeedback({ sound: true });
});

els.previewMotionButton.addEventListener("click", () => {
  previewFeedback({ sound: true, motion: true });
});

els.testWebAudioButton.addEventListener("click", () => {
  testWebAudio();
});

els.testMediaAudioButton.addEventListener("click", () => {
  testMediaAudio();
});

function getFormValues() {
  return {
    kind: els.taskKind.value,
    title: els.taskTitle.value,
    notes: els.taskNotes.value,
    dueDate: els.taskDueDate.value,
    repeat: els.taskRepeat.value,
    tags: parseTags(els.taskTags.value),
    difficulty: els.taskDifficulty.value,
  };
}

function openTaskDialog(task = {}) {
  const isEditing = Boolean(task.id);
  resetDeleteConfirmation();
  els.taskDialog.dataset.mode = isEditing ? "edit" : "create";
  els.dialogTitle.textContent = isEditing ? "タスク編集" : "タスク追加";
  els.editingTaskId.value = task.id || "";
  els.taskKind.value = task.kind || "todo";
  els.taskTitle.value = task.title || "";
  els.taskNotes.value = task.notes || "";
  els.taskDueDate.value = task.dueDate || "";
  els.taskRepeat.value = task.repeat || (task.kind === "daily" ? "daily" : "none");
  els.taskTags.value = (task.tags || []).join(", ");
  els.taskDifficulty.value = task.difficulty || "easy";
  els.deleteTaskButton.hidden = !isEditing;

  if (typeof els.taskDialog.showModal === "function") {
    els.taskDialog.showModal();
  } else {
    els.taskDialog.setAttribute("open", "");
  }
  requestAnimationFrame(() => els.taskTitle.focus());
}

function closeTaskDialog() {
  resetDeleteConfirmation();
  if (typeof els.taskDialog.close === "function") {
    els.taskDialog.close();
  } else {
    els.taskDialog.removeAttribute("open");
  }
}

function updateInstallAppButton() {
  if (!els.installAppButton) return;
  const standalone = Boolean(
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator.standalone,
  );
  els.installAppButton.hidden = !deferredInstallPrompt || standalone;
}

function registerInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallAppButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallAppButton();
    showToast("QuestForgeをアプリとして追加しました。", { duration: 5000 });
  });

  els.installAppButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    updateInstallAppButton();
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === "accepted") {
      showToast("QuestForgeをアプリとして追加中です。", { duration: 5000 });
    }
  });

  updateInstallAppButton();
}

function setActiveView(view, options = {}) {
  const nextView = viewTitles[view] ? view : "tasks";
  activeViewId = nextView;
  document.querySelectorAll("[data-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === nextView);
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === nextView);
  });
  els.viewTitle.textContent = viewTitles[nextView];
  if (nextView === "battle") {
    state.boss.rotationEnabled = false;
  }
  if (options.render !== false) {
    render();
  }
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (window.location.hash !== `#${view}`) {
      window.history.replaceState(null, "", `#${view}`);
    }
    toggleMobileMenu(false);
    setActiveView(view);
  });
});

window.addEventListener("hashchange", () => {
  setActiveView(window.location.hash.slice(1));
});

els.exportButton.addEventListener("click", () => {
  saveState();
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "questforge-state.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

els.importButton.addEventListener("click", () => {
  els.importFileInput.click();
});

els.importFileInput.addEventListener("change", async () => {
  const file = els.importFileInput.files?.[0];
  els.importFileInput.value = "";
  if (!file) return;
  if (file.size > 2_000_000) {
    showToast("インポートできるJSONは2MBまでです。");
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
      throw new Error("invalid_state");
    }
    if (!window.confirm("現在のQuestForgeデータを、このバックアップで置き換えますか？")) {
      return;
    }
    state = applyScheduledRollover(normalizeState(parsed));
    state.schemaVersion = currentSchemaVersion;
    state.updatedAt = new Date().toISOString();
    saveState();
    setActiveView("tasks", { render: false });
    render();
    showToast(`${state.tasks.length}件のクエストを復元しました。`, { duration: 5000 });
  } catch {
    showToast("QuestForgeのバックアップJSONを読み込めませんでした。");
  }
});

function showAppUpdateAvailable(version = "new") {
  showToast("最新版があります。更新すると新しい画面へ切り替わります。", {
    duration: 30000,
    actionLabel: "今すぐ更新",
    onAction: () => window.location.reload(),
  });
  els.undoToast.dataset.appVersion = version;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;

  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "QUESTFORGE_UPDATE_READY") return;
    if (event.data.version === appVersion) return;
    window.clearTimeout(appUpdateFallbackTimer);
    appUpdateFallbackTimer = window.setTimeout(() => {
      showAppUpdateAvailable(event.data.version);
    }, 1600);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerAtLoad) return;
    window.clearTimeout(appUpdateFallbackTimer);
    appUpdateFallbackTimer = window.setTimeout(() => {
      showAppUpdateAvailable();
    }, 1800);
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none",
      });
      if (registration.waiting && navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      registration.update().catch(() => {});
    } catch (error) {
      console.warn("QuestForge service worker registration failed:", error);
    }
  });
}

registerButtonFeedback();
registerInstallPrompt();
setActiveView(window.location.hash.slice(1), { render: false });
registerServiceWorker();
render();
startBossRotation();
refreshGatewayRuntime();
window.addEventListener("questforge:auth-changed", () => refreshGatewayRuntime());
