import type {
  BattleState,
  BossState,
  CharacterState,
  Quest,
  QuestForgeState,
} from "./types/questforge.ts";
import { iconMarkup } from "./ui/icon-system.ts";
import type { QuestForgeIconName } from "./ui/icon-system.ts";
import type { IslandHandle, PartyFormationViewModel } from "./ui/islands/types.ts";

type JsonRecord = Record<string, unknown>;

interface CurrentRefMission {
  id: string;
  title: string;
  notes: string;
  time: string;
  progress: number;
  state: "done" | "working" | "blocked" | "queued";
  assignee: string;
  handoff: string;
  reward: string;
  category: string;
}

interface EquipmentOffset {
  x: number;
  y: number;
  scale: number;
}

interface AppState extends QuestForgeState {
  sortMode: string;
  taskFilter: string;
  theme: string;
  preferences: {
    soundEnabled: boolean;
    motionEnabled: boolean;
    [key: string]: unknown;
  };
  lastProcessedDate: string;
  lastRolloverSummary: {
    date: string;
    reset: number;
    advanced: number;
  };
  storage: {
    driver: string;
    syncStatus: string;
    lastSavedAt: string;
    lastLoadedAt: string;
    cloudProvider: string;
    [key: string]: unknown;
  };
  integrations: {
    selectedService: string;
    direction: string;
    connected: JsonRecord;
    [key: string]: unknown;
  };
  character: CharacterState & {
    nextXp: number;
    ownedItems: string[];
    equippedItems: string[];
    equipmentOffsets: Record<string, EquipmentOffset>;
    motion: string;
  };
  boss: BossState & {
    currentId: string;
    rotationEnabled: boolean;
  };
  battle: BattleState;
  party: JsonRecord[];
  inventory: JsonRecord[];
  syncEvents: JsonRecord[];
  taskEvents: JsonRecord[];
  rewardClaims: Record<string, string>;
}

interface StorageDriver {
  id: string;
  label: string;
  enabled?: boolean;
  load: () => unknown;
  save: (nextState: AppState) => void;
}

interface GatewayRecord extends JsonRecord {
  id?: string;
  uid?: string;
  status?: string;
  account?: GatewayRecord;
  url?: string;
  events?: string[];
  enabled?: boolean;
  manifest?: JsonRecord;
  level?: number;
  displayName?: string;
  handle?: string;
  bio?: string;
  name?: string;
  role?: string;
  power?: string;
  ownerUid?: string;
  maxMembers?: number;
  members?: GatewayRecord[];
  profile?: GatewayRecord;
  party?: GatewayRecord & { members?: GatewayRecord[] };
  friends?: GatewayRecord[];
  requests?: GatewayRecord[];
  integrations?: GatewayIntegration[];
  webhooks?: GatewayRecord[];
  plugins?: GatewayRecord[];
}

interface GatewayIntegration extends GatewayRecord {
  id: string;
  status?: string;
}

interface GatewayRuntime {
  status: string;
  webhooks: GatewayRecord[];
  plugins: GatewayRecord[];
  integrations: GatewayIntegration[];
  integrationResources: Record<string, unknown>;
  integrationPreviewed: Record<string, boolean>;
  calendarEvents: GatewayRecord[];
  profile: GatewayRecord | null;
  friends: GatewayRecord[];
  friendRequests: GatewayRecord[];
  party: (GatewayRecord & { members?: GatewayRecord[] }) | null;
  friendSearchResult: GatewayRecord | null;
  socialError: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface AppAudioNote {
  frequency: number;
  duration: number;
  gain: number;
  offset?: number;
}

interface AppAudioProfile {
  wave: OscillatorType;
  press: AppAudioNote[];
  theme: AppAudioNote[];
  success: AppAudioNote[];
  restore: AppAudioNote[];
  battle: AppAudioNote[];
}

interface BossDefinition {
  id: string;
  name: string;
  label: string;
  threat: string;
  src: string;
  maxHp: number;
  rewardGems: number;
  rewardXp: number;
  weakKind: Quest["kind"];
  description: string;
}

interface ClassOption {
  id: string;
  name: string;
  label: string;
  description: string;
  defaultMotion: string;
}

interface BattleSkillOption {
  name: string;
  cost: number;
  description: string;
}

interface AvatarVariant {
  id: string;
  name: string;
  baseSrc: string;
  lineupSrc: string;
}

interface MotionOption {
  id: string;
  name: string;
  className: string;
}

interface IntegrationAdapter {
  id: string;
  name: string;
  shortName: string;
  type: string;
  auth: string;
  status: string;
  recommendedDirection: string;
  scope: string;
  description: string;
  rules: string[];
}

interface ShopItem {
  id: string;
  slot: string;
  type: string;
  name: string;
  price: number;
  asset?: string;
  affinity: string;
  description: string;
}

interface AppError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
}

interface PreviewFeedbackOptions {
  sound?: boolean;
  motion?: boolean;
}

interface BattleOptions {
  resetHp?: boolean;
  resetBoss?: boolean;
  autoRotate?: boolean;
  rotationEnabled?: boolean;
}

interface PendingBossEffect {
  damage: number;
  defeated: boolean;
  reward: string;
}

interface TaskFormValues {
  kind: Quest["kind"];
  title: string;
  notes: string;
  dueDate: string;
  difficulty: Quest["difficulty"];
  repeat: Quest["repeat"];
  tags: string[];
  assignee: unknown;
  parentQuestId: string;
  handoff: unknown;
}

type TaskDialogInput = Partial<Quest>;
type EquipmentPlacement = { x?: number; y?: number; size?: number };

interface GatewayFetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

interface SaveStateOptions {
  emitCloud?: boolean;
}

interface ToastOptions {
  onAction?: () => void;
  actionLabel?: string;
  duration?: number;
}

interface AppViewOptions {
  render?: boolean;
}

interface AppEvent extends Event {
  currentTarget: AppElement;
  target: EventTarget & Element;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
}

type AppElement = HTMLElement & {
  value: string;
  checked: boolean;
  disabled: boolean;
  files: FileList | null;
  src: string;
  alt: string;
  href: string;
  content: string;
  open: boolean;
  options: HTMLOptionsCollection;
  selectedOptions: HTMLCollectionOf<HTMLOptionElement>;
  showModal: () => void;
  close: () => void;
  reset: () => void;
  select: () => void;
};

function q<T extends Element = AppElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Guilduo UI element not found: ${selector}`);
  return element;
}

function qa<T extends Element = AppElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asJsonRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))) : [];
}

const storageKey = "questforge-prototype-state";
const trackTelemetry = (...args: unknown[]) => globalThis.QuestForgeTelemetry?.track?.(...args);
const appearanceStorageKey = "questforge-appearance-mode";
const appearanceModes = ["light", "dark", "system"];
const appVersion = "2026.08.29-brand-beta";
const productionGatewayUrl = String(globalThis.QuestForgeConfig?.gatewayUrl || "").replace(/\/$/, "");
const externalOAuthEnabled = globalThis.QuestForgeConfig?.externalOAuthEnabled === true;
const hadLocalStateAtStartup = Boolean(localStorage.getItem(storageKey));
const core = globalThis.QuestForgeCore ?? (() => { throw new Error("Guilduo core is not ready"); })();
const battleRules = globalThis.QuestForgeBattleRules ?? (() => { throw new Error("Guilduo battle rules are not ready"); })();
const i18n = globalThis.QuestForgeI18n ?? (() => { throw new Error("Guilduo i18n is not ready"); })();
const currentSchemaVersion = core.CURRENT_SCHEMA_VERSION || 2;
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
      title: i18n.t("seed.hydrate.title"),
      notes: i18n.t("seed.hydrate.notes"),
      difficulty: "easy",
      dueDate: "",
      createdAt: "2026-06-23T00:01:00.000Z",
      value: 8,
    },
    {
      id: "h2",
      kind: "habit",
      title: i18n.t("seed.socialLimit.title"),
      notes: i18n.t("seed.socialLimit.notes"),
      difficulty: "medium",
      dueDate: "",
      createdAt: "2026-06-23T00:02:00.000Z",
      value: -3,
      negativeOnly: true,
    },
    {
      id: "d1",
      kind: "daily",
      title: i18n.t("seed.tidy.title"),
      notes: i18n.t("seed.tidy.notes"),
      difficulty: "easy",
      dueDate: "2026-06-23",
      createdAt: "2026-06-23T00:03:00.000Z",
      done: false,
      streak: 4,
    },
    {
      id: "d2",
      kind: "daily",
      title: i18n.t("seed.plan.title"),
      notes: i18n.t("seed.plan.notes"),
      difficulty: "medium",
      dueDate: "2026-06-23",
      createdAt: "2026-06-23T00:04:00.000Z",
      done: false,
      streak: 2,
    },
    {
      id: "r1",
      kind: "reward",
      title: i18n.t("seed.break.title"),
      notes: i18n.t("seed.break.notes"),
      difficulty: "easy",
      dueDate: "",
      createdAt: "2026-06-23T00:07:00.000Z",
      cost: 20,
    },
    {
      id: "r2",
      kind: "reward",
      title: i18n.t("seed.drink.title"),
      notes: i18n.t("seed.drink.notes"),
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
} as unknown as AppState;

let state: AppState;

const storageDrivers: Record<string, StorageDriver> = {
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
    label: "Appwrite同期",
    enabled: false,
    load() {
      return null;
    },
    save() {
      // The legacy driver id is a compatibility boundary; Appwrite owns persistence now.
    },
  },
};

function getStorageDriver(driverId = "local"): StorageDriver {
  const driver = storageDrivers[driverId] || storageDrivers.local;
  return driver.enabled === false ? storageDrivers.local : driver;
}

const els = {
  hpValue: q("#hpValue"),
  xpValue: q("#xpValue"),
  gemValue: q("#gemValue"),
  streakValue: q("#streakValue"),
  characterName: q("#characterName"),
  characterClass: q("#characterClass"),
  avatarImage: q("#avatarImage"),
  characterPreviewImage: q("#characterPreviewImage"),
  gemBalance: q("#gemBalance"),
  shopGemBalance: q("#shopGemBalance"),
  variantSelect: q("#variantSelect"),
  classSelect: q("#classSelect"),
  personalitySelect: q("#personalitySelect"),
  motionSelect: q("#motionSelect"),
  classLineupImage: q("#classLineupImage"),
  classGrid: q("#classGrid"),
  avatarStage: q(".avatar-stage"),
  avatarPreviewStage: q(".avatar-preview-stage"),
  avatarStack: q("#avatarStack"),
  avatarPreviewStack: q("#avatarPreviewStack"),
  avatarEquipChips: q("#avatarEquipChips"),
  previewEquipChips: q("#previewEquipChips"),
  equipmentCalibrator: q("#equipmentCalibrator"),
  equipmentDragToggle: q("#equipmentDragToggle"),
  equipmentAdjustSelect: q("#equipmentAdjustSelect"),
  equipmentOffsetX: q("#equipmentOffsetX"),
  equipmentOffsetY: q("#equipmentOffsetY"),
  equipmentScale: q("#equipmentScale"),
  equipmentResetButton: q("#equipmentResetButton"),
  equipmentResetAllButton: q("#equipmentResetAllButton"),
  shopGrid: q("#shopGrid"),
  randomizeCharacter: q("#randomizeCharacter"),
  brandTagline: q("#brandTagline"),
  themeKicker: q("#themeKicker"),
  themeHeroTitle: q("#themeHeroTitle"),
  themeHeroCopy: q("#themeHeroCopy"),
  themeOptions: qa("[data-theme-option]"),
  appearanceControl: q("#appearanceControl"),
  appearanceButton: q("#appearanceButton"),
  appearanceIcon: q("#appearanceIcon"),
  appearanceMenu: q("#appearanceMenu"),
  appearanceOptions: qa("[data-appearance-option]"),
  localeSelect: q("#localeSelect"),
  themeColorMeta: q('meta[name="theme-color"]'),
  feedbackSettingsButton: q("#feedbackSettingsButton"),
  feedbackDialog: q("#feedbackDialog"),
  closeFeedbackDialog: q("#closeFeedbackDialog"),
  soundEnabledToggle: q("#soundEnabledToggle"),
  motionEnabledToggle: q("#motionEnabledToggle"),
  previewSoundButton: q("#previewSoundButton"),
  previewMotionButton: q("#previewMotionButton"),
  audioDiagnosticStatus: q("#audioDiagnosticStatus"),
  testWebAudioButton: q("#testWebAudioButton"),
  testMediaAudioButton: q("#testMediaAudioButton"),
  telemetryConsentToggle: q("#telemetryConsentToggle"),
  telemetryConsentStatus: q("#telemetryConsentStatus"),
  feedbackPreviewCard: q("#feedbackPreviewCard"),
  installAppButton: q("#installAppButton"),
  bossImage: q("#bossImage"),
  bossName: q("#bossName"),
  bossReward: q("#bossReward"),
  bossHitText: q("#bossHitText"),
  bossMeter: q("#bossMeter"),
  bossPreviewImage: q("#bossPreviewImage"),
  bossPreviewName: q("#bossPreviewName"),
  bossPreviewDescription: q("#bossPreviewDescription"),
  bossThreatLabel: q("#bossThreatLabel"),
  bossHpText: q("#bossHpText"),
  bossRewardText: q("#bossRewardText"),
  bossDefeatCount: q("#bossDefeatCount"),
  bossGrid: q("#bossGrid"),
  bossRotationStatus: q("#bossRotationStatus"),
  randomBossButton: q("#randomBossButton"),
  lockBossButton: q("#lockBossButton"),
  habitList: q("#habitList"),
  dailyList: q("#dailyList"),
  todoList: q("#todoList"),
  rewardList: q("#rewardList"),
  archiveButton: q("#archiveButton"),
  archiveCount: q("#archiveCount"),
  archiveDialog: q("#archiveDialog"),
  archiveList: q("#archiveList"),
  closeArchiveDialog: q("#closeArchiveDialog"),
  partyGrid: q("#partyGrid"),
  publicHandle: q("#publicHandle"),
  sourceCodeLink: q("#sourceCodeLink"),
  socialConnectionStatus: q("#socialConnectionStatus"),
  socialAuthMessage: q("#socialAuthMessage"),
  profileForm: q("#profileForm"),
  profileDisplayName: q("#profileDisplayName"),
  profileHandle: q("#profileHandle"),
  profileBio: q("#profileBio"),
  profileFormMessage: q("#profileFormMessage"),
  friendSearchForm: q("#friendSearchForm"),
  friendHandleSearch: q("#friendHandleSearch"),
  friendSearchResult: q("#friendSearchResult"),
  friendRequestList: q("#friendRequestList"),
  friendList: q("#friendList"),
  partyHeading: q("#partyHeading"),
  partyCreateForm: q("#partyCreateForm"),
  partyNameInput: q("#partyNameInput"),
  partyInviteForm: q("#partyInviteForm"),
  partyInviteHandle: q("#partyInviteHandle"),
  partyInviteResult: q("#partyInviteResult"),
  partyInviteLink: q("#partyInviteLink"),
  copyPartyInviteButton: q("#copyPartyInviteButton"),
  partyAcceptForm: q("#partyAcceptForm"),
  partyInviteToken: q("#partyInviteToken"),
  leavePartyButton: q("#leavePartyButton"),
  partyMessage: q("#partyMessage"),
  inventoryGrid: q("#inventoryGrid"),
  taskDialog: q("#taskDialog"),
  taskForm: q("#taskForm"),
  dialogTitle: q("#dialogTitle"),
  editingTaskId: q("#editingTaskId"),
  taskKind: q("#taskKind"),
  taskTitle: q("#taskTitle"),
  taskNotes: q("#taskNotes"),
  taskDueDate: q("#taskDueDate"),
  taskRepeat: q("#taskRepeat"),
  taskTags: q("#taskTags"),
  taskDifficulty: q("#taskDifficulty"),
  taskAssignee: q("#taskAssignee"),
  taskHumanOptions: q("#taskHumanOptions"),
  taskAssigneeCustomRow: q("#taskAssigneeCustomRow"),
  taskAssigneeCustomLabel: q("#taskAssigneeCustomLabel"),
  taskHandoffRow: q("#taskHandoffRow"),
  taskHandoffReady: q("#taskHandoffReady"),
  taskParentQuest: q("#taskParentQuest"),
  taskChildrenList: q("#taskChildrenList"),
  taskChildrenItems: q("#taskChildrenItems"),
  taskHandoffStateRow: q("#taskHandoffStateRow"),
  taskHandoffState: q("#taskHandoffState"),
  taskHandoffDetails: q("#taskHandoffDetails"),
  taskHandoffNote: q("#taskHandoffNote"),
  taskBlockedReason: q("#taskBlockedReason"),
  taskArtifactUrl: q("#taskArtifactUrl"),
  questTreePanel: q("#questTreePanel"),
  questTreeList: q("#questTreeList"),
  questTreeIncludeArchived: q("#questTreeIncludeArchived"),
  refreshQuestTreeButton: q("#refreshQuestTreeButton"),
  cancelDialog: q("#cancelDialog"),
  archiveTaskButton: q("#archiveTaskButton"),
  importButton: q("#importButton"),
  importFileInput: q("#importFileInput"),
  exportButton: q("#exportButton"),
  mobileMenuButton: q("#mobileMenuButton"),
  mobileMoreButton: q("#mobileMoreButton"),
  sidebar: q(".sidebar"),
  undoToast: q("#undoToast"),
  undoToastMessage: q("#undoToastMessage"),
  toastActionButton: q("#toastActionButton"),
  closeToastButton: q("#closeToastButton"),
  sortMode: q("#sortMode"),
  taskSummaryRow: q("#taskSummaryRow"),
  taskFilterOptions: qa("[data-task-filter]"),
  viewTitle: q("#viewTitle"),
  currentDateLabel: q("#currentDateLabel"),
  rolloverStatus: q("#rolloverStatus"),
  runRolloverButton: q("#runRolloverButton"),
  battleLogList: q("#battleLogList"),
  battlePlayerName: q("#battlePlayerName"),
  battlePlayerSprite: q("#battlePlayerSprite"),
  battlePlayerHpText: q("#battlePlayerHpText"),
  battlePlayerMpText: q("#battlePlayerMpText"),
  battlePlayerHpBar: q("#battlePlayerHpBar"),
  battlePlayerMpBar: q("#battlePlayerMpBar"),
  battlePlayerStatusRow: q("#battlePlayerStatusRow"),
  battleBossName: q("#battleBossName"),
  battleBossSprite: q("#battleBossSprite"),
  battleBossHpText: q("#battleBossHpText"),
  battleBossHpBar: q("#battleBossHpBar"),
  battleBossRageText: q("#battleBossRageText"),
  battleBossStatusRow: q("#battleBossStatusRow"),
  battleDamageText: q("#battleDamageText"),
  battleResourceText: q("#battleResourceText"),
  battlePlayerDamageText: q("#battlePlayerDamageText"),
  battleTurnValue: q("#battleTurnValue"),
  battleMainMessage: q("#battleMainMessage"),
  battleCombatLog: q("#battleCombatLog"),
  battleResultText: q("#battleResultText"),
  battleSkillCommandName: q("#battleSkillCommandName"),
  battleSkillCommandCost: q("#battleSkillCommandCost"),
  battleClassSkillText: q("#battleClassSkillText"),
  battleTaskQueue: q("#battleTaskQueue"),
  battleClassGrid: q("#battleClassGrid"),
  battleContractPreview: q("#battleContractPreview"),
  battleCommandButtons: qa("[data-battle-command]"),
  battleResetButton: q("#battleResetButton"),
  battleRandomBossButton: q("#battleRandomBossButton"),
  integrationOnboarding: q("#integrationOnboarding"),
  integrationOnboardingDescription: q("#integrationOnboardingDescription"),
  integrationLoginButton: q("#integrationLoginButton"),
  integrationStepLogin: q("#integrationStepLogin"),
  integrationStepConnect: q("#integrationStepConnect"),
  integrationStepResource: q("#integrationStepResource"),
  integrationStepSync: q("#integrationStepSync"),
  integrationSetupMessage: q("#integrationSetupMessage"),
  integrationHubGrid: q("#integrationHubGrid"),
  syncServiceSelect: q("#syncServiceSelect"),
  syncDirectionSelect: q("#syncDirectionSelect"),
  syncRuleSummary: q("#syncRuleSummary"),
  syncPreviewList: q("#syncPreviewList"),
  syncLogList: q("#syncLogList"),
  connectIntegrationButton: q("#connectIntegrationButton"),
  disconnectIntegrationButton: q("#disconnectIntegrationButton"),
  previewLiveSyncButton: q("#previewLiveSyncButton"),
  runLiveSyncButton: q("#runLiveSyncButton"),
  integrationResourcePanel: q("#integrationResourcePanel"),
  integrationResourceTitle: q("#integrationResourceTitle"),
  integrationResourceList: q("#integrationResourceList"),
  integrationAccountLabel: q("#integrationAccountLabel"),
  integrationAutoSync: q("#integrationAutoSync"),
  saveIntegrationSettingsButton: q("#saveIntegrationSettingsButton"),
  togglFocusConnectDialog: q("#togglFocusConnectDialog"),
  togglFocusConnectForm: q("#togglFocusConnectForm"),
  togglFocusApiKey: q("#togglFocusApiKey"),
  togglFocusConnectMessage: q("#togglFocusConnectMessage"),
  cancelTogglFocusConnect: q("#cancelTogglFocusConnect"),
  cancelTogglFocusConnectButton: q("#cancelTogglFocusConnectButton"),
  saveTogglFocusConnect: q("#saveTogglFocusConnect"),
  calendarAgenda: q("#calendarAgenda"),
  calendarAgendaList: q("#calendarAgendaList"),
  refreshCalendarAgendaButton: q("#refreshCalendarAgendaButton"),
  integrationModeLabel: q("#integrationModeLabel"),
  apiGatewayStatus: q("#apiGatewayStatus"),
  mcpEndpointInput: q("#mcpEndpointInput"),
  copyMcpUrlButton: q("#copyMcpUrlButton"),
  checkMcpConnectionButton: q("#checkMcpConnectionButton"),
  mcpConnectionNote: q("#mcpConnectionNote"),
  gatewayUrlInput: q("#gatewayUrlInput"),
  saveGatewayButton: q("#saveGatewayButton"),
  openMcpEndpointLink: q("#openMcpEndpointLink"),
  gatewayOutput: q("#gatewayOutput"),
  webhookUrlInput: q("#webhookUrlInput"),
  webhookEventSelect: q("#webhookEventSelect"),
  createWebhookButton: q("#createWebhookButton"),
  webhookList: q("#webhookList"),
  pluginManifestInput: q("#pluginManifestInput"),
  installPluginButton: q("#installPluginButton"),
  pluginList: q("#pluginList"),
  pluginDashboardSlot: q("#pluginDashboardSlot"),
  pluginIntegrationSlot: q("#pluginIntegrationSlot"),
  pluginQuestDetailSlot: q("#pluginQuestDetailSlot"),
};

const viewTitles: Record<string, string> = {
  tasks: "今日のクエスト",
  bosses: "ボス図鑑",
  battle: "MPコマンドバトル",
  character: "相棒カスタム",
  shop: "Gem店",
  party: "仲間とチャレンジ",
  inventory: "装備とコレクション",
  integrations: "AI・サービス連携",
};

const difficultyLabels: Record<string, string> = {
  trivial: "軽い",
  easy: "易しい",
  medium: "普通",
  hard: "重い",
};

const taskKindLabels: Record<string, string> = {
  habit: "習慣ログ",
  daily: "今日の約束",
  todo: "一回クエスト",
  reward: "ごほうび交換",
};

const repeatLabels: Record<string, string> = {
  none: "繰り返しなし",
  daily: "毎日",
  weekdays: "平日",
  weekly: "毎週",
  monthly: "毎月",
};

const syncDirectionLabels: Record<string, string> = {
  import: "インポート",
  export: "エクスポート",
  bidirectional: "双方向",
};

const classOptions: ClassOption[] = [
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

const battleSkillOptions: Record<string, BattleSkillOption> = {
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

const avatarVariants: AvatarVariant[] = [
  { id: "masc", name: "Masc base", baseSrc: "./assets/avatar-masc-48.webp", lineupSrc: "./assets/class-lineup-48.webp" },
  { id: "femme", name: "Femme base", baseSrc: "./assets/avatar-femme-48.webp", lineupSrc: "./assets/class-lineup-femme-48.webp" },
];

const personalityTypes: string[] = [
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

const motionOptions: MotionOption[] = [
  { id: "calm", name: "静かにぷかぷか", className: "float-calm" },
  { id: "spark", name: "きらっと浮遊", className: "float-spark" },
  { id: "focus", name: "集中スキャン", className: "float-focus" },
  { id: "bouncy", name: "元気にぽよん", className: "float-bouncy" },
];

const integrationAdapters: IntegrationAdapter[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    shortName: "Calendar",
    type: "予定",
    auth: "OAuth 2.0",
    status: "not_connected",
    recommendedDirection: "import",
    scope: "calendar.events.readonly / calendarlist.readonly",
    description: "複数カレンダーを読み取り専用の予定枠として表示する。",
    rules: [
      "予定は自動でQuest化せず今日の予定枠へ表示",
      "必要な予定だけQuestへ変換",
      "外部削除で変換済みQuestは削除しない",
    ],
  },
  {
    id: "google-tasks",
    name: "Google Tasks",
    shortName: "Tasks",
    type: "タスク",
    auth: "OAuth 2.0",
    status: "not_connected",
    recommendedDirection: "bidirectional",
    scope: "tasks",
    description: "選択した1リストと、削除なしで双方向同期する。",
    rules: [
      "dueは日付のみ。時刻はCalendar側に任せる",
      "needsActionは未完了、completedは完了へ対応",
      "リンク済みQuestだけ削除なしで双方向同期",
    ],
  },
  {
    id: "toggl-focus",
    name: "Toggl Focus",
    shortName: "Focus",
    type: "実績・タイマー",
    auth: "Personal API key",
    status: "not_connected",
    recommendedDirection: "bidirectional",
    scope: "Focus tasks / tracking / 30-day entries",
    description: "QuestをFocusタスクにして、確定済みの作業時間だけを実績へ取り込む。",
    rules: [
      "To Doと日課をFocusタスクへ明示的に作成・更新",
      "開始中タイマーは確認してから切り替え、実績は1件につき1つのQuestへ",
      "アプリ名やウィンドウ名はGuilduoへ保存しない",
    ],
  },
  {
    id: "toggl-track",
    name: "Toggl Track",
    shortName: "Toggl",
    type: "時間記録",
    auth: "Basic Auth API token",
    status: "planned",
    recommendedDirection: "import",
    scope: "time_entries / workspaces",
    description: "実作業時間をXP、Gem、ボスダメージに変換する。",
    rules: [
      "time entryのdurationを集中ログとして取り込む",
      "Project/TagをGuilduoタグへ対応",
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
    auth: "OAuth 2.0",
    status: "not_connected",
    recommendedDirection: "export",
    scope: "pages / databases",
    description: "実績、振り返り、戦闘ログをNotion DBへ保存する。",
    rules: [
      "Guilduo Logs専用DBを自動作成",
      "同じ日付の行は更新して重複を防止",
      "日次サマリーをエクスポート",
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

const slotLabels: Record<string, string> = {
  back: "背中",
  hand: "手持ち",
  chest: "胸",
  head: "頭",
  species: "種族",
  aura: "オーラ",
};

const shopItems: ShopItem[] = [
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

const equipmentBasePlacements: Record<string, { x: number; y: number; size: number }> = {
  "cloak-sage": { x: 50, y: 61, size: 66 },
  journal: { x: 76, y: 63, size: 27 },
  "gem-brooch": { x: 50, y: 52, size: 13 },
  "operator-headset": { x: 51, y: 25, size: 30 },
  "ranger-tail": { x: 70, y: 68, size: 42 },
  "clockwork-arm": { x: 28, y: 66, size: 27 },
};

const equipmentRolePlacements: Record<string, Record<string, EquipmentPlacement>> = {
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

const equipmentVariantPlacements: Record<string, Record<string, EquipmentPlacement>> = {
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

const bossOptions: BossDefinition[] = [
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
let bossRotationTimer: number | null = null;
let pendingBossEffect: PendingBossEffect | null = null;
let selectedEquipmentId = "";
let equipmentDragState: {
  itemId: string;
  startX: number;
  startY: number;
  offset: EquipmentOffset;
} | null = null;
const currentVisualParams = new URLSearchParams(window.location.search);
const currentVisualFixtureEnabled = import.meta.env.DEV && currentVisualParams.get("visualFixture") === "v3";
let currentPresentationMode: "mission" | "campaign" = currentVisualParams.get("vfScreen") === "campaign" ? "campaign" : "mission";
document.body.classList.add("current-v4-shell");
document.body.classList.toggle("current-reference-fixture", currentVisualFixtureEnabled);

const currentReferenceFixtureMissions: CurrentRefMission[] = [
  { id: "QF-001", title: "UI設計", notes: "ダッシュボードの情報設計とワイヤーフレームを更新する", time: "09:00", progress: 100, state: "done", assignee: "Astra", handoff: "accepted", reward: "+20 MP · Boss +3%", category: "DESIGN" },
  { id: "QF-002", title: "営業候補調査", notes: "ターゲット企業リストを作成し、優先度付けまで進める", time: "10:30", progress: 100, state: "done", assignee: "Scout", handoff: "accepted", reward: "+18 MP · Boss +4%", category: "RESEARCH" },
  { id: "QF-003", title: "README改善", notes: "初めても理解できるREADMEへ刷新し、導入導線を最適化する", time: "12:00", progress: 60, state: "working", assignee: "Codex", handoff: "working", reward: "+24 MP · Boss +7%", category: "BUILD" },
  { id: "QF-004", title: "ログ解析とアラート設計", notes: "エラーログ分析とアラートルールを設計する", time: "14:00", progress: 25, state: "blocked", assignee: "Ops", handoff: "blocked", reward: "+30 MP · Boss +9%", category: "OPS" },
];

const currentReferenceFixtureCampaign: CurrentRefMission[] = [
  { id: "QF-001", title: "ギルドの設立", notes: "Guild foundation", time: "—", progress: 100, state: "done", assignee: "Astra", handoff: "accepted", reward: "", category: "QUEST" },
  { id: "QF-002", title: "最初のメンバー", notes: "First members", time: "—", progress: 100, state: "done", assignee: "Astra", handoff: "accepted", reward: "", category: "QUEST" },
  { id: "QF-003", title: "拠点の整備", notes: "Build the base", time: "—", progress: 100, state: "done", assignee: "Astra", handoff: "accepted", reward: "", category: "QUEST" },
  { id: "QF-004", title: "初任務の達成", notes: "First assignment", time: "—", progress: 100, state: "done", assignee: "Astra", handoff: "accepted", reward: "", category: "QUEST" },
  { id: "QF-005", title: "森の調査", notes: "Survey the forest", time: "—", progress: 100, state: "done", assignee: "Scout", handoff: "accepted", reward: "", category: "QUEST" },
  { id: "QF-006", title: "素材の収集", notes: "Gather materials", time: "—", progress: 62, state: "working", assignee: "Codex", handoff: "working", reward: "", category: "QUEST" },
  { id: "QF-007", title: "薬草の知識", notes: "Learn the herbs", time: "—", progress: 60, state: "working", assignee: "Scout", handoff: "working", reward: "", category: "QUEST" },
  { id: "QF-008", title: "森の守護者", notes: "Forest guardian", time: "—", progress: 0, state: "queued", assignee: "Ops", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-009", title: "洞窟の探索", notes: "Explore the cave", time: "—", progress: 0, state: "queued", assignee: "Echo", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-010", title: "古代の記録", notes: "Ancient records", time: "—", progress: 0, state: "queued", assignee: "Codex", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-011", title: "失われた技術", notes: "Lost technology", time: "—", progress: 0, state: "queued", assignee: "Ops", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-012", title: "知識の継承", notes: "Pass on knowledge", time: "—", progress: 0, state: "queued", assignee: "Astra", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-013", title: "山道の開拓", notes: "Open the mountain path", time: "—", progress: 0, state: "queued", assignee: "Scout", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-014", title: "試練の準備", notes: "Prepare the trial", time: "—", progress: 0, state: "queued", assignee: "Codex", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-015", title: "頂への挑戦", notes: "Challenge the summit", time: "—", progress: 0, state: "queued", assignee: "Ops", handoff: "ready", reward: "", category: "QUEST" },
  { id: "QF-016", title: "試練の終幕", notes: "Complete the trial", time: "—", progress: 0, state: "queued", assignee: "Echo", handoff: "ready", reward: "", category: "QUEST" },
];

let activeViewId = "tasks";
let partyFormationIslandHandle: IslandHandle<PartyFormationViewModel> | null = null;
let partyFormationIslandModule: Promise<typeof import("./ui/islands/PartyFormation.tsx")> | null = null;
let undoToastTimer: number | null = null;
let toastActionHandler: (() => void) | null = null;
let feedbackPreviewTimer: number | null = null;
let appUpdateFallbackTimer: number | null = null;
let lastStateFingerprint = "";
let suppressCloudSaveEvent = false;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let interactionAudioContext: AudioContext | null = null;
const gatewayStorageKey = "questforge-api-gateway-url";
const focusAutoSyncQueueKey = "questforge-toggl-focus-sync-queue";
let gatewayRuntime: GatewayRuntime = {
  status: "offline",
  webhooks: [],
  plugins: [],
  integrations: [],
  integrationResources: {},
  integrationPreviewed: {},
  calendarEvents: [],
  profile: null,
  friends: [],
  friendRequests: [],
  party: null,
  friendSearchResult: null,
  socialError: "",
};
let lastAudioDiagnostic: { route: string; status: string; at: string } = { route: "none", status: "not-tested", at: "" };

state = loadState();
if (els.sourceCodeLink && globalThis.QuestForgeConfig?.sourceUrl) {
  els.sourceCodeLink.href = globalThis.QuestForgeConfig.sourceUrl;
  els.sourceCodeLink.hidden = false;
}
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

function readFocusAutoSyncQueue(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(focusAutoSyncQueueKey) || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  } catch { return []; }
}

function writeFocusAutoSyncQueue(ids: string[]): void {
  sessionStorage.setItem(focusAutoSyncQueueKey, JSON.stringify([...new Set(ids)].slice(-50)));
}

function shouldAutoCreateFocusTask(task: Quest | null | undefined): boolean {
  const focus = gatewayRuntime.integrations?.find((item) => item.id === "toggl-focus");
  const settings = asJsonRecord(focus?.account?.settings);
  const hasCurrentFocusTask = (task?.externalLinks || []).some((link) => link.service === "toggl-focus"
    && (link.type === "task" || link.sourceType === "focus.task")
    && (!link.organizationId || (link.organizationId === settings.organizationId && link.workspaceId === settings.workspaceId)));
  return Boolean(task && ["todo", "daily"].includes(task.kind) && focus?.status === "connected"
    && settings.autoCreateTasks
    && settings.organizationId
    && settings.workspaceId
    && !hasCurrentFocusTask);
}

async function flushFocusAutoSyncQueue() {
  if (!externalOAuthEnabled) return;
  const queue = readFocusAutoSyncQueue();
  if (!queue.length || !globalThis.QuestForgeFirebase?.getUser?.() || !getGatewayUrl()) return;
  await globalThis.QuestForgeFirebase?.flushState?.();
  const remaining = [];
  for (const questId of queue) {
    try {
      await gatewayFetch(`/v1/quests/${encodeURIComponent(questId)}/toggl-focus-task`, { method: "POST", body: JSON.stringify({ dryRun: false }) });
    } catch (error) {
      remaining.push(questId);
      console.warn("Guilduo Focus task auto-create failed:", error);
    }
  }
  writeFocusAutoSyncQueue(remaining);
  if (remaining.length !== queue.length) await refreshGatewayRuntime();
}

function queueFocusAutoSync(task: Quest): void {
  if (!externalOAuthEnabled) return;
  if (!shouldAutoCreateFocusTask(task)) return;
  writeFocusAutoSyncQueue([...readFocusAutoSyncQueue(), task.id]);
  window.setTimeout(() => { flushFocusAutoSyncQueue().catch(() => {}); }, 1200);
}

const themePresets: Record<string, { label: string; tagline: string; heroTitle: string; heroCopy: string }> = {
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

const feedbackProfiles: Record<string, AppAudioProfile> = {
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

function getInteractionAudioContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!interactionAudioContext) interactionAudioContext = new AudioContextClass();
  return interactionAudioContext;
}

type AudioCue = "press" | "theme" | "success" | "restore" | "battle";

function playInteractionCue(cue: AudioCue): void {
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

function scheduleAudioNotes(context: AudioContext, profile: Pick<AppAudioProfile, "wave">, notes: AppAudioNote[]): void {
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

function updateAudioDiagnostic(route: string, status: string): void {
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
  const writeText = (offset: number, text: string): void => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
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

function applyButtonPressFeedback(button: AppElement): void {
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
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button") as AppElement | null;
    if (button && !button.hasAttribute("data-feedback-silent")) {
      applyButtonPressFeedback(button);
    }
  }, true);
}

function previewFeedback(options: PreviewFeedbackOptions = {}): void {
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

  if (feedbackPreviewTimer !== null) window.clearTimeout(feedbackPreviewTimer);
  els.feedbackPreviewCard.classList.remove("is-previewing");
  void els.feedbackPreviewCard.offsetWidth;
  els.feedbackPreviewCard.classList.add("is-previewing");
  feedbackPreviewTimer = window.setTimeout(() => {
    els.feedbackPreviewCard.classList.remove("is-previewing");
  }, 620);
}

function loadState(): AppState {
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

function cloneDefaultState(): AppState {
  if (typeof structuredClone === "function") {
    return structuredClone(defaultState);
  }
  return JSON.parse(JSON.stringify(defaultState));
}

function cloneStateValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function stateSyncFingerprint(value: AppState): string {
  const snapshot = cloneStateValue(value) as Partial<AppState>;
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

function saveState(options: SaveStateOptions = {}): void {
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

function normalizeState(rawState: unknown): AppState {
  let nextState = rawState as AppState;
  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    nextState = cloneDefaultState();
  }
  const previousSchemaVersion = Number(nextState.schemaVersion || 0);
  nextState.migrationSnapshots = nextState.migrationSnapshots && typeof nextState.migrationSnapshots === "object"
    ? nextState.migrationSnapshots
    : {};
  if (previousSchemaVersion < 4 && !nextState.migrationSnapshots.schema3To4) {
    nextState.migrationSnapshots.schema3To4 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousSchemaVersion,
      tasks: cloneStateValue(Array.isArray(nextState.tasks) ? nextState.tasks : []),
      rewardClaims: cloneStateValue(nextState.rewardClaims || {}),
    };
  }
  if (previousSchemaVersion < 5 && !nextState.migrationSnapshots.schema4To5) {
    nextState.migrationSnapshots.schema4To5 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousSchemaVersion,
      tasks: cloneStateValue(Array.isArray(nextState.tasks) ? nextState.tasks : []),
    };
  }
  if (previousSchemaVersion < 6 && !nextState.migrationSnapshots.schema5To6) {
    nextState.migrationSnapshots.schema5To6 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousSchemaVersion,
      tasks: cloneStateValue(Array.isArray(nextState.tasks) ? nextState.tasks : []),
      rewardClaims: cloneStateValue(nextState.rewardClaims || {}),
    };
  }
  if (previousSchemaVersion < 7 && !nextState.migrationSnapshots.schema6To7) {
    nextState.migrationSnapshots.schema6To7 = {
      createdAt: new Date().toISOString(),
      schemaVersion: previousSchemaVersion,
      tasks: cloneStateValue(Array.isArray(nextState.tasks) ? nextState.tasks : []),
      rewardClaims: cloneStateValue(nextState.rewardClaims || {}),
    };
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
    const currentValue = Number(nextState.battle[key]);
    nextState.battle[key] = Number.isFinite(currentValue)
      ? Math.max(0, currentValue)
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
    const repeat = repeatLabels[task.repeat] ? task.repeat : task.kind === "daily" && !hadRepeat ? "daily" : "none";
    const createdAt = task.createdAt || new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString();
    const dueDate = task.dueDate || "";
    let lifecycleState = ["active", "completed", "archived"].includes(task.lifecycleState)
      ? task.lifecycleState
      : previousSchemaVersion < 4 && task.kind === "todo" && task.done
        ? "archived"
        : "active";
    if (task.kind === "todo" && repeat === "none" && (lifecycleState === "completed" || task.done)) lifecycleState = "archived";
    const planningState = ["scheduled", "backlog"].includes(task.planningState)
      ? task.planningState
      : task.kind === "todo" && !dueDate && lifecycleState === "active"
        ? "backlog"
        : "scheduled";
    const externalLinks = Array.isArray(task.externalLinks) ? task.externalLinks : [];
    const entryLinks = externalLinks
      .filter((link) => link.type === "time_entry" || link.sourceType === "toggl.time_entry" || link.sourceType === "focus.time_entry");
    const focusMinutes = entryLinks
      .filter((link) => link.service === "toggl-focus")
      .reduce((sum, link) => sum + Math.max(0, Math.round(Number(link.durationMinutes || 0))), 0);
    const linkedTogglMinutes = focusMinutes || entryLinks
      .filter((link) => link.service === "toggl-track")
      .reduce((sum, link) => sum + Math.max(0, Math.round(Number(link.durationMinutes || 0))), 0);
    const manualActualMinutes = Math.max(0, Math.round(Number(task.manualActualMinutes ?? task.actualMinutes ?? 0)));
    return {
      ...task,
      id: String(task.id || `imported-${index}-${Date.now()}`),
      kind: ["habit", "daily", "todo", "reward"].includes(task.kind) ? task.kind : "todo",
      title: String(task.title || "無題のクエスト").slice(0, 80),
      notes: String(task.notes || "").slice(0, 180),
      difficulty: difficultyLabels[task.difficulty] ? task.difficulty : "easy",
      category: String(task.category || "").slice(0, 40),
      dueDate,
      repeat,
      tags: Array.isArray(task.tags) ? task.tags.slice(0, 6) : parseTags(task.tags || ""),
      planningState,
      lifecycleState: task.kind === "daily" ? "active" : lifecycleState,
      planningMode: ["on_date", "until_due"].includes(task.planningMode) ? task.planningMode : dueDate ? "until_due" : "on_date",
      scheduledDate: planningState === "backlog"
        ? ""
        : task.scheduledDate || (dueDate ? (dueDate < currentDateText() ? dueDate : currentDateText()) : task.kind === "daily" ? currentDateText() : ""),
      scheduledTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(task.scheduledTime || "") ? task.scheduledTime : "",
      estimatedMinutes: Math.max(0, Math.round(Number(task.estimatedMinutes || 0))),
      manualActualMinutes,
      togglActualMinutes: linkedTogglMinutes || Math.max(0, Math.round(Number(task.togglActualMinutes || 0))),
      actualMinutes: linkedTogglMinutes || Math.max(0, Math.round(Number(task.togglActualMinutes || 0))) || manualActualMinutes,
      completionCriteria: String(task.completionCriteria || "").slice(0, 300),
      nextAction: String(task.nextAction || "").slice(0, 180),
      impact: ["low", "medium", "high"].includes(task.impact) ? task.impact : "medium",
      isBlockingOthers: Boolean(task.isBlockingOthers),
      rolloverCount: Math.max(0, Math.round(Number(task.rolloverCount || 0))),
      dependencyIds: Array.isArray(task.dependencyIds) ? [...new Set(task.dependencyIds.map(String))].slice(0, 20) : [],
      parentQuestId: String(task.parentQuestId || "").trim().slice(0, 120),
      completedAt: task.completedAt || "",
      archivedAt: task.archivedAt || (lifecycleState === "archived" ? task.updatedAt || createdAt : ""),
      externalLinks,
      assignee: normalizeTaskAssignee(task.assignee),
      handoff: normalizeTaskHandoff(task.handoff),
      assignmentReadyFor: String(task.assignmentReadyFor || "").slice(0, 240),
      createdAt,
      updatedAt: task.updatedAt || createdAt,
      lastCompletedDate: task.lastCompletedDate || "",
      lastRolledOverDate: task.lastRolledOverDate || "",
    };
  });
  repairTaskParentLinks(nextState);
  nextState.tasks.filter((task) => task.done && (task.kind === "daily" || task.kind === "todo")).forEach((task) => {
    const claimDate = task.lastCompletedDate || nextState.lastProcessedDate || currentDateText();
    const claimKey = core.completionClaimKey(task, claimDate);
    if (!nextState.rewardClaims[claimKey]) {
      nextState.rewardClaims[claimKey] = "migrated";
    }
  });
  battleRules?.normalizeBattleState(nextState);
  return nextState;
}

function normalizeTaskAssignee(value: unknown): Quest["assignee"] {
  const input = asJsonRecord(value);
  if (!value || typeof value !== "object" || !["self", "human", "agent"].includes(String(input.type))) {
    return { type: "self", id: "self", label: "自分", handoffState: "none" };
  }
  const type = String(input.type) as Quest["assignee"]["type"];
  const label = String(input.label || (type === "self" ? "自分" : input.id || "Agent")).trim().slice(0, 80);
  const rawId = String(input.id || (type === "self" ? "self" : "")).trim();
  const id = type === "agent" && (rawId === "custom" || rawId.startsWith("custom:"))
    ? normalizeCustomAgentId(rawId, label)
    : type === "agent" ? normalizeAgentId(rawId, label) : rawId.slice(0, 120);
  if (!id) return { type: "self", id: "self", label: "自分", handoffState: "none" };
  return {
    type,
    id,
    label: type === "self" ? "自分" : label,
    handoffState: ["none", "ready", "working", "blocked", "review_required", "accepted"].includes(String(input.handoffState))
      ? String(input.handoffState) as Quest["assignee"]["handoffState"]
      : "none",
  };
}

function normalizeAgentId(value: unknown, label = "agent"): string {
  const aliases: Record<string, string> = {
    "chat-gpt": "chatgpt", gpt: "chatgpt", "gpt-chat": "chatgpt",
    "gpt-codex": "codex", "openai-codex": "codex", "codex-cli": "codex",
    "claude-code": "claude", "anthropic-claude": "claude",
    "gemini-cli": "gemini", "google-gemini": "gemini",
    "open-claw": "openclaw", "openclaw-agent": "openclaw", "hermes-agent": "hermes",
  };
  const slug = String(value || "").trim().toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const customSlug = String(label).trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "agent";
  return aliases[slug] || slug || `custom:${customSlug}`;
}

function normalizeCustomAgentId(rawId: unknown, label = "agent"): string {
  const source = String(rawId || "").trim().toLocaleLowerCase().startsWith("custom:")
    ? String(rawId).trim().slice(7)
    : label;
  const slug = String(source || "agent").trim().toLocaleLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "agent";
  return `custom:${slug}`;
}

function normalizeTaskHandoff(value: unknown): Quest["handoff"] {
  const input = asJsonRecord(value);
  return {
    note: String(input.note || "").trim().slice(0, 500),
    blockedReason: String(input.blockedReason || "").trim().slice(0, 500),
    artifactUrl: String(input.artifactUrl || "").trim().slice(0, 500),
    startedAt: String(input.startedAt || "").trim().slice(0, 40),
    reviewRequestedAt: String(input.reviewRequestedAt || "").trim().slice(0, 40),
    reviewedAt: String(input.reviewedAt || "").trim().slice(0, 40),
    reviewedBy: String(input.reviewedBy || "").trim().slice(0, 120),
  };
}

function taskTreeEligible(task: Quest | null | undefined): boolean {
  return Boolean(task && ["habit", "daily", "todo"].includes(task.kind));
}

function taskIsDescendant(candidateId: string, ancestorId: string, seen: Set<string> = new Set()): boolean {
  if (!candidateId || seen.has(candidateId)) return false;
  seen.add(candidateId);
  const candidate = state.tasks.find((task) => task.id === candidateId);
  if (!candidate?.parentQuestId) return false;
  return candidate.parentQuestId === ancestorId || taskIsDescendant(candidate.parentQuestId, ancestorId, seen);
}

function validParentForTask(task: Quest, parentQuestId: string): boolean {
  if (!parentQuestId) return true;
  const parent = state.tasks.find((item) => item.id === parentQuestId);
  const subtreeHeight = task?.id && task.id !== "__new_quest__" ? taskTreeHeight(task.id) : 1;
  return Boolean(task && parent && task.id !== parentQuestId && taskTreeEligible(task) && taskTreeEligible(parent)
    && !taskIsDescendant(parentQuestId, task.id)
    && taskTreeDepth(parentQuestId) + subtreeHeight <= 8);
}

function taskTreeDepth(taskId: string, seen: Set<string> = new Set()): number {
  if (!taskId || seen.has(taskId)) return 9;
  seen.add(taskId);
  const task = state.tasks.find((item) => item.id === taskId);
  return task?.parentQuestId ? taskTreeDepth(task.parentQuestId, seen) + 1 : 1;
}

function taskTreeHeight(taskId: string, seen: Set<string> = new Set()): number {
  if (!taskId || seen.has(taskId)) return 9;
  seen.add(taskId);
  const children = state.tasks.filter((task) => task.parentQuestId === taskId && taskTreeEligible(task));
  return children.length ? 1 + Math.max(...children.map((child) => taskTreeHeight(child.id, new Set(seen)))) : 1;
}

function repairTaskParentLinks(nextState: AppState): void {
  const byId = new Map(nextState.tasks.map((task) => [task.id, task]));
  nextState.tasks.forEach((task) => {
    if (!task.parentQuestId || !byId.has(task.parentQuestId) || !taskTreeEligible(task) || !taskTreeEligible(byId.get(task.parentQuestId))) {
      task.parentQuestId = "";
      return;
    }
    const seen = new Set([task.id]);
    let current: Quest | undefined = task;
    let depth = 1;
    while (current?.parentQuestId) {
      if (seen.has(current.parentQuestId) || depth >= 8) {
        task.parentQuestId = "";
        break;
      }
      seen.add(current.parentQuestId);
      current = byId.get(current.parentQuestId);
      depth += 1;
    }
  });
}

function normalizeEquipmentOffsets(offsets: unknown): Record<string, EquipmentOffset> {
  if (!offsets || typeof offsets !== "object") return {};
  return Object.entries(asJsonRecord(offsets)).reduce<Record<string, EquipmentOffset>>((normalized, [itemId, value]) => {
    const item = shopItems.find((entry) => entry.id === itemId && entry.asset);
    if (!item || !value || typeof value !== "object") return normalized;
    const input = asJsonRecord(value);
    normalized[itemId] = {
      x: clampNumber(Number(input.x) || 0, -30, 30),
      y: clampNumber(Number(input.y) || 0, -30, 30),
      scale: clampNumber(Number(input.scale) || 0, -25, 40),
    };
    return normalized;
  }, {});
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyScheduledRollover(nextState: AppState, options: { force?: boolean } = {}): AppState {
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

function difficultyScale(difficulty: Quest["difficulty"]): number {
  return core.difficultyScale(difficulty);
}

function localizedTaskLabel(group: string, value: string, fallback = value): string {
  const translated = i18n?.t?.(`${group}.${value}`);
  return translated && translated !== `${group}.${value}` ? translated : fallback;
}

function recordTaskEvent(type: string, task: Quest, details: JsonRecord = {}): JsonRecord {
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

function scoreTask(taskId: string, direction: string): void {
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
      task.lifecycleState = "active";
      task.completedAt = "";
      task.archivedAt = "";
      state.character.hp = Math.max(0, state.character.hp - Math.round(5 * scale));
      applyBattlePenalty(task, scale);
      recordTaskEvent("task.failed", task, { hpPenalty: Math.round(5 * scale) });
    } else if (task.done) {
      task.done = false;
      task.lifecycleState = "active";
      task.completedAt = "";
      task.archivedAt = "";
      recordTaskEvent("task.reopened", task, { rewardReversed: false });
      showToast("未完了へ戻しました。受取済みの報酬は再付与されません。");
    } else {
      task.done = true;
      task.lastCompletedDate = currentDateText();
      task.updatedAt = new Date().toISOString();
      if (task.kind === "todo" && (task.repeat || "none") === "none") {
        task.lifecycleState = "archived";
        task.completedAt = task.updatedAt;
        task.archivedAt = task.updatedAt;
      } else {
        task.lifecycleState = "active";
      }
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
    completeTaskFeedback(completedTask);
    return;
  }
  render();
}

function completeTaskFeedback(task: Quest): void {
  trackTelemetry("first_quest_complete", { source: "root" });
  playInteractionCue("success");
  saveState();
  renderTaskSummary();
  renderArchiveDialog();
  showToast(`「${task.title}」を完了して保管しました。`, { duration: 4200 });

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

function grantProgress(scale: number): void {
  state.character.gems += Math.round(7 * scale);
  grantXp(Math.round(12 * scale));
}

function grantXp(amount: number): void {
  state.character.xp += amount;
  while (state.character.xp >= state.character.nextXp) {
    state.character.xp -= state.character.nextXp;
    state.character.level += 1;
    state.character.maxHp += 5;
    state.character.hp = state.character.maxHp;
    state.character.nextXp += 25;
  }
}

function bossDamageForTask(task: Quest, scale: number): number {
  const baseDamage = ({
    habit: 5,
    daily: 10,
    todo: 12,
  } as Record<string, number>)[task.kind] || 0;
  const currentBoss = getBossOption(state.boss.currentId);
  const weakMultiplier = currentBoss.weakKind === task.kind ? 1.35 : 1;
  return Math.max(1, Math.round(baseDamage * scale * weakMultiplier));
}

function dealBossDamage(amount: number, task: { title: string; kind: string }, options: BattleOptions = {}): void {
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

function addBattleLog(entry: JsonRecord): void {
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

function getBattleSkill(roleId = state.character.role): BattleSkillOption {
  const resolvedRole = battleSkillOptions[roleId] ? roleId : "sentinel";
  const skill = battleSkillOptions[resolvedRole];
  return {
    ...skill,
    description: i18n?.t?.(`battle.skill.${resolvedRole}`) || skill.description,
  };
}

function battleMpForTask(task: Quest, _scale: number): number {
  const currentBoss = getBossOption(state.boss.currentId);
  return battleRules?.battleMpForQuest(task, currentBoss.weakKind) ?? core.taskRewardDelta(task, currentBoss.weakKind).mp;
}

function gainBattleMp(amount: number, task: Quest): void {
  const battle = ensureBattleState();
  const before = battle.mp;
  battle.mp = Math.min(battle.maxMp, Math.max(0, battle.mp + amount));
  const actualGain = battle.mp - before;
  const focusGain = ({
    habit: 1,
    daily: 1,
    todo: 2,
  } as Record<string, number>)[task.kind] || 0;
  battle.focus += focusGain;
  if (actualGain > 0 && activeViewId === "battle") {
    showBattleFloat(els.battleResourceText, `+${actualGain} MP`, "gain");
  }
  addCommandBattleLog(
    `<strong>${localizedTaskLabel("kind", task.kind, taskKindLabels[task.kind] || "Quest")}</strong> MP +${actualGain}${focusGain ? ` / Focus +${focusGain}` : ""}`
  );
}

function applyBattlePenalty(task: Quest, scale: number): void {
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

function addCommandBattleLog(text: string, kind = "info"): void {
  const battle = ensureBattleState();
  battle.log = [{ text, kind }, ...(battle.log || [])].slice(0, 10);
}

function resetCommandBattle(options: BattleOptions = {}): void {
  const currentBoss = getBossOption(state.boss.currentId);
  state.battle = cloneDefaultState().battle;
  state.boss.rotationEnabled = false;
  if (options.resetBoss !== false) {
    state.boss.maxHp = currentBoss.maxHp;
    state.boss.hp = currentBoss.maxHp;
  }
  render();
}

function useBattleCommand(command: string): void {
  const battle = ensureBattleState();
  state.boss.rotationEnabled = false;
  try {
    const result = battleRules.executeBattleCommand(state, {
      command,
      expectedTurn: battle.turn,
      commandId: globalThis.crypto?.randomUUID?.() || createId(),
      dryRun: false,
    });
    flashBattleSprite(els.battlePlayerSprite, "jrpg-sprite-cast");
    if (result.cost > 0) showBattleFloat(els.battleResourceText, `-${result.cost} MP`, "spend");
    const bossDamage = result.effects.find((effect) => effect.type === "boss_damage");
    const playerDamage = result.effects.find((effect) => effect.type === "player_damage");
    const heal = result.effects.find((effect) => effect.type === "heal");
    if (bossDamage) {
      flashBattleSprite(els.battleBossSprite, "jrpg-sprite-hit");
      showBattleFloat(els.battleDamageText, `-${bossDamage.amount}`, state.boss.hp <= 0 ? "critical" : "damage");
    }
    if (playerDamage) {
      flashBattleSprite(els.battlePlayerSprite, "jrpg-sprite-hit");
      showBattleFloat(els.battlePlayerDamageText, `-${playerDamage.amount} HP`, "damage");
    }
    if (heal) showBattleFloat(els.battleResourceText, `+${heal.amount} HP`, "heal");
    playInteractionCue(command === "burst" || state.boss.hp <= 0 ? "success" : "battle");
    flashBattleCommandFeedback();
  } catch (error) {
    const appError = error as AppError;
    addCommandBattleLog(appError.code === "battle_mp_insufficient"
      ? i18n.t("battle.mpInsufficient")
      : appError.message || i18n.t("battle.commandFailed"), "danger");
  }
  render();
}

function flashBattleCommandFeedback(): void {
  const field = q(".jrpg-field");
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

function dealCommandBattleDamage(amount: number, source: string): void {
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

function takeCommandBattleDamage(amount: number, source: string): void {
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
  els.battleTurnValue.textContent = String(battle.turn);

  els.battleBossName.textContent = currentBoss.name;
  els.battleBossSprite.src = currentBoss.src;
  els.battleBossHpText.textContent = `${state.boss.hp}/${currentBoss.maxHp}`;
  els.battleBossHpBar.style.width = `${Math.max(0, Math.min(100, bossHpRatio * 100))}%`;
  els.battleBossRageText.textContent = String(battle.rage);

  els.battleSkillCommandName.textContent = skill.name;
  els.battleSkillCommandCost.textContent = `${skill.cost} MP / ${skill.description}`;
  els.battleClassSkillText.textContent = skill.name;
  els.battleResultText.textContent = battleEnded
    ? state.boss.hp <= 0 ? i18n.t("battle.victory") : i18n.t("battle.defeat")
    : i18n.t("battle.ongoing");

  renderBattleStatus(els.battlePlayerStatusRow, [
    battle.focus ? `Focus ${battle.focus}` : "",
    battle.guard ? `Guard ${battle.guard}` : "",
    battle.shield ? `Shield ${battle.shield}` : "",
  ]);
  renderBattleStatus(els.battleBossStatusRow, [
    battle.vulnerable ? `Weak ${battle.vulnerable}` : "",
    battle.poison ? `Poison ${battle.poison}` : "",
  ]);

  els.battleMainMessage.innerHTML = localizeBattleLogText(String(battle.log[0]?.text || "")) || i18n.t("battle.chooseCommand");
  els.battleCombatLog.innerHTML = "";
  (battle.log || []).slice(1).forEach((entry) => {
    const item = document.createElement("div");
    item.className = String(entry.kind || "");
    item.innerHTML = localizeBattleLogText(String(entry.text || ""));
    els.battleCombatLog.appendChild(item);
  });

  els.battleCommandButtons.forEach((button) => {
    const command = button.dataset.battleCommand;
    button.disabled = battleEnded || battle.mp < core.battleCommandCost(command || "", skill.cost);
  });

  renderBattleTaskQueue();
  renderBattleClassGrid();
  els.battleContractPreview.textContent = JSON.stringify(createBattleContractPreview(), null, 2);
}

function renderBattleStatus(target: AppElement, values: string[]): void {
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
    .filter((task) => core.isBattleTaskEligible(task))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return i18n?.compareText?.(a.title, b.title) ?? a.title.localeCompare(b.title);
    });

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "empty-task";
    empty.textContent = i18n.t("battle.empty");
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
    meta.appendChild(pill(localizedTaskLabel("kind", task.kind, taskKindLabels[task.kind] || task.kind)));
    meta.appendChild(pill(localizedTaskLabel("difficulty", task.difficulty, difficultyLabels[task.difficulty] || task.difficulty)));
    if (task.dueDate) {
      const due = pill(formatDueDate(task.dueDate));
      due.classList.add(isOverdue(task) ? "overdue" : "due");
      meta.appendChild(due);
    }

    const title = document.createElement("strong");
    title.textContent = task.title;

    const notes = document.createElement("p");
    notes.className = task.notes ? "battle-task-notes" : "battle-task-notes is-empty";
    notes.textContent = task.notes || i18n.t("battle.noNotes");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button";
    button.textContent = i18n.t("battle.completeForMp", { mp: mpGain });
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
      addCommandBattleLog(i18n.t("battle.roleChanged", { role: role.name, skill: skill.name }));
      render();
    });
    els.battleClassGrid.appendChild(button);
  });
}

function createBattleContractPreview() {
  const session = battleRules.createBattleSession(state);
  const boss = getBossOption(state.boss.currentId);
  session.boss.label = localizedBossField(boss, "label");
  const battleLog = Array.isArray(session.battle.log) ? session.battle.log : [];
  session.battle.log = battleLog.map((entry) => ({
    ...entry,
    text: localizeBattleLogText(String(entry.text || "")),
  }));
  session.commands = (session.commands || []).map((command) => ({
    ...command,
    label: command.id === "skill" ? command.label : i18n.t(`battle.${command.id}`),
  }));
  return session;
}

function localizeBattleLogText(text = "") {
  if (i18n?.getLocale?.() !== "en") return text;
  if (text === "タスクでMPをためて、コマンドで戦います。") return i18n.t("battle.intro");
  return String(text)
    .replace(/^たたかう:/, `${i18n.t("battle.attack")}:`)
    .replace(/^ボスの攻撃:/, "Boss attack:")
    .replace(/^ボスの強攻撃:/, "Boss heavy attack:")
    .replace(/^かいふく:/, `${i18n.t("battle.heal")}:`)
    .replace(/^Rage効果:/, "Rage effect:")
    .replace(/^勝利:/, `${i18n.t("battle.victory")}:`)
    .replace(/^敗北:/, `${i18n.t("battle.defeat")}:`);
}

function flashBattleSprite(element: AppElement, className: string): void {
  if (!element || !canPlayMotion()) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 380);
}

function showBattleFloat(element: AppElement, text: string, kind = "damage"): void {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
  if (!canPlayMotion()) return;
  element.classList.remove("is-visible");
  void element.offsetWidth;
  element.classList.add("is-visible");
  window.setTimeout(() => element.classList.remove("is-visible"), 760);
}

function redeemReward(task: Quest): void {
  const cost = task.cost || rewardCost(task.difficulty);
  if (state.character.gems < cost) {
    flashTask(task.id);
    return;
  }
  state.character.gems -= cost;
  render();
}

function rewardCost(difficulty: Quest["difficulty"]): number {
  return Math.round(25 * difficultyScale(difficulty));
}

function addTask(
  kind: Quest["kind"],
  title: string,
  notes: string,
  dueDate: string,
  difficulty: Quest["difficulty"],
  repeat: Quest["repeat"] = "none",
  tags: string[] | string = [],
  assignee: unknown = null,
  parentQuestId = "",
  handoff: unknown = {},
): Quest | null {
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
    category: "",
    planningState: kind === "todo" && !dueDate ? "backlog" : "scheduled",
    lifecycleState: "active",
    planningMode: dueDate ? "until_due" : "on_date",
    scheduledDate: dueDate ? currentDateText() : kind === "daily" ? currentDateText() : "",
    scheduledTime: "",
    estimatedMinutes: 0,
    manualActualMinutes: 0,
    togglActualMinutes: 0,
    actualMinutes: 0,
    completionCriteria: "",
    nextAction: "",
    impact: "medium",
    isBlockingOthers: false,
    rolloverCount: 0,
    dependencyIds: [],
    parentQuestId: "",
    completedAt: "",
    archivedAt: "",
    externalLinks: [],
    assignee: normalizeTaskAssignee(assignee),
    handoff: normalizeTaskHandoff(handoff),
    assignmentReadyFor: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  } as unknown as Quest;

  if (kind === "daily" || kind === "todo") {
    task.done = false;
  }
  if (kind === "daily") {
    task.streak = 0;
  }
  if (kind === "reward") {
    task.cost = rewardCost(difficulty);
  }

  if (parentQuestId && validParentForTask(task, parentQuestId)) task.parentQuestId = parentQuestId;
  state.tasks.push(task);
  recordTaskEvent("task.created", task);
  recordAssignmentReadyEvent(task);
  queueFocusAutoSync(task);
  render();
  return task;
}

function updateTask(taskId: string, values: TaskFormValues): Quest | null {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !values.title.trim()) return null;

  const previousKind = task.kind;
  const previousAssignee = normalizeTaskAssignee(task.assignee);
  const candidate: Quest = { ...task, kind: values.kind };
  if (values.parentQuestId && !validParentForTask(candidate, values.parentQuestId)) {
    showToast("このQuestは親に設定できません。", { duration: 4200 });
    return null;
  }
  const nextAssignee = normalizeTaskAssignee(values.assignee);
  const currentHandoff = previousAssignee.type === "agent" ? previousAssignee.handoffState : "none";
  const nextHandoff = nextAssignee.type === "agent" ? nextAssignee.handoffState : "none";
  if (nextAssignee.type === "agent" && !canTransitionTaskHandoff(currentHandoff, nextHandoff)) {
    showToast("Handoffの順番に沿って状態を変更してください。", { duration: 4200 });
    return null;
  }
  task.kind = values.kind;
  task.title = values.title.trim();
  task.notes = values.notes.trim();
  task.dueDate = values.dueDate;
  task.difficulty = values.difficulty;
  task.repeat = values.repeat;
  task.tags = values.tags;
  task.assignee = nextAssignee;
  task.parentQuestId = values.parentQuestId || "";
  task.handoff = normalizeTaskHandoff(values.handoff);
  task.planningState = task.kind === "todo" && !values.dueDate && !task.scheduledDate ? "backlog" : task.planningState || "scheduled";
  task.planningMode = task.planningMode || (values.dueDate ? "until_due" : "on_date");
  task.updatedAt = new Date().toISOString();

  if ((task.kind === "daily" || task.kind === "todo") && typeof task.done !== "boolean") {
    task.done = false;
  }
  if (task.kind === "daily" && typeof task.streak !== "number") {
    task.streak = 0;
  }
  if (task.kind === "reward") {
    task.cost = rewardCost(task.difficulty);
    delete (task as Partial<Quest>).done;
    delete (task as Partial<Quest>).streak;
  }
  if (task.kind !== "reward") {
    delete (task as Partial<Quest>).cost;
  }
  if (previousKind !== task.kind && task.kind === "habit") {
    delete (task as Partial<Quest>).done;
    delete (task as Partial<Quest>).streak;
  }

  recordTaskEvent("task.updated", task, { previousKind });
  recordAssignmentReadyEvent(task, previousAssignee);
  render();
  return task;
}

function recordAssignmentReadyEvent(task: Quest, previousAssignee: Quest["assignee"] | null = null): void {
  const assignee = normalizeTaskAssignee(task.assignee);
  if (assignee.type !== "agent" || assignee.handoffState !== "ready") return;
  const assignmentKey = `${assignee.type}:${assignee.id}`;
  if (task.assignmentReadyFor === assignmentKey) return;
  task.assignmentReadyFor = assignmentKey;
  recordTaskEvent("quest.assignment.ready", task, { assignee, previousAssignee });
}

const handoffStateLabels: Record<string, string> = {
  none: "未設定",
  ready: "作業待ち",
  working: "作業中",
  blocked: "ブロック中",
  review_required: "レビュー待ち",
  accepted: "承認済み",
};

const handoffTransitions: Record<string, string[]> = {
  none: ["ready"],
  ready: ["working", "blocked"],
  working: ["blocked", "review_required"],
  blocked: ["working", "none"],
  review_required: ["accepted", "working"],
  accepted: ["none"],
};

function canTransitionTaskHandoff(current: string, next: string): boolean {
  return current === next || (handoffTransitions[current] || []).includes(next);
}

function handoffNextState(current: string, action: string): string {
  const transitions: Record<string, Record<string, string>> = {
    none: { ready: "ready" },
    ready: { start: "working", block: "blocked" },
    working: { review: "review_required", block: "blocked" },
    blocked: { resume: "working", clear: "none" },
    review_required: { accept: "accepted", revise: "working" },
    accepted: { clear: "none" },
  };
  return transitions[current]?.[action] || "";
}

function transitionTaskHandoff(task: Quest, nextState: string, details: unknown = {}): boolean {
  if (!task || task.assignee?.type !== "agent") return false;
  const current = task.assignee.handoffState || "none";
  const allowed = {
    none: ["ready"], ready: ["working", "blocked"], working: ["blocked", "review_required"],
    blocked: ["working", "none"], review_required: ["accepted", "working"], accepted: ["none"],
  }[current] || [];
  if (current !== nextState && !allowed.includes(nextState)) return false;
  const now = new Date().toISOString();
  task.assignee.handoffState = nextState as Quest["assignee"]["handoffState"];
  task.handoff = normalizeTaskHandoff({ ...task.handoff, ...asJsonRecord(details) });
  if (nextState === "working") task.handoff.startedAt ||= now;
  if (nextState === "review_required") task.handoff.reviewRequestedAt = now;
  if (nextState === "accepted") {
    task.handoff.reviewedAt = now;
    task.handoff.reviewedBy = globalThis.QuestForgeFirebase?.getUser?.()?.uid || "user";
  }
  task.assignmentReadyFor = nextState === "ready" ? `agent:${task.assignee.id}` : "";
  task.updatedAt = now;
  recordTaskEvent("quest.handoff.transitioned", task, { from: current, to: nextState, handoff: task.handoff });
  return true;
}

function archiveTask(taskId: string): Quest | null {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.kind !== "todo" || (task.repeat || "none") !== "none") return null;
  task.lifecycleState = "archived";
  task.archivedAt = new Date().toISOString();
  task.updatedAt = task.archivedAt;
  task.done = true;
  recordTaskEvent("task.archived", task, { source: "editor" });
  render();
  return task;
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getRole(roleId: string): ClassOption {
  return classOptions.find((role) => role.id === roleId) || classOptions[0];
}

function getVariant(variantId: string): AvatarVariant {
  return avatarVariants.find((variant) => variant.id === variantId) || avatarVariants[0];
}

function getAvatarSrc(roleId: string, variantId: string): string {
  if (variantId === "femme") {
    return `./assets/avatar-role-femme-${roleId}.webp`;
  }
  return `./assets/avatar-role-${roleId}.webp`;
}

function getMotion(motionId: string): MotionOption {
  return motionOptions.find((motion) => motion.id === motionId) || motionOptions[0];
}

function localizedRoleField(role: ClassOption, field: string): string {
  const translated = i18n?.t?.(`role.${role.id}.${field}`);
  const fallback = String((role as unknown as JsonRecord)[field] || "");
  return translated && translated !== `role.${role.id}.${field}` ? translated : fallback;
}

function localizedMotionName(motion: MotionOption): string {
  const key = motion.id === "bouncy" ? "bounce" : motion.id;
  const translated = i18n?.t?.(`motion.${key}`);
  return translated && translated !== `motion.${key}` ? translated : motion.name;
}

function localizedSlot(item: ShopItem): string {
  const translated = i18n?.t?.(`slot.${item.slot}`);
  return translated && translated !== `slot.${item.slot}` ? translated : slotLabels[item.slot] || item.type;
}

function localizedShopDescription(item: ShopItem): string {
  const translated = i18n?.t?.(`shop.${item.id}.description`);
  return translated && translated !== `shop.${item.id}.description` ? translated : item.description;
}

function getBossOption(bossId: string): BossDefinition {
  return bossOptions.find((boss) => boss.id === bossId) || bossOptions[0];
}

function localizedBossField(boss: BossDefinition, field: string): string {
  const translated = i18n?.t?.(`boss.${boss.id}.${field}`);
  const fallback = String((boss as unknown as JsonRecord)[field] || "");
  return translated && translated !== `boss.${boss.id}.${field}` ? translated : fallback;
}

function setCurrentBoss(bossId: string, options: BattleOptions = {}): void {
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

function pickRandomBossId(excludeId = ""): string {
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
  els.bossName.textContent = localizedBossField(boss, "label");
  els.bossReward.textContent = `Reward ${boss.rewardGems} Gem / ${i18n.t("boss.weakness", { kind: localizedTaskLabel("kind", boss.weakKind, taskKindLabels[boss.weakKind]) })}`;
  if (activeViewId === "bosses") {
    els.bossPreviewImage.src = boss.src;
    els.bossPreviewImage.alt = `${boss.name} preview`;
  }
  els.bossPreviewName.textContent = localizedBossField(boss, "label");
  els.bossPreviewDescription.textContent = localizedBossField(boss, "description");
  els.bossThreatLabel.textContent = localizedBossField(boss, "threat");
  els.bossHpText.textContent = `${state.boss.hp}/${state.boss.maxHp}`;
  els.bossRewardText.textContent = `${boss.rewardGems} Gem / ${boss.rewardXp} XP / ${i18n.t("boss.weakness", { kind: localizedTaskLabel("kind", boss.weakKind, taskKindLabels[boss.weakKind]) })}`;
  els.bossDefeatCount.textContent = String(state.boss.defeatCount);
  els.bossRotationStatus.textContent = i18n.t(state.boss.rotationEnabled ? "boss.rotation" : "boss.locked");
  els.lockBossButton.textContent = i18n.t(state.boss.rotationEnabled ? "boss.challengeThis" : "boss.locked");
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
        <span class="pill">${localizedBossField(boss, "threat")}</span>
        <span class="pill">${i18n.t("boss.weakness", { kind: localizedTaskLabel("kind", boss.weakKind, taskKindLabels[boss.weakKind]) })}</span>
      </div>
      <h4>${localizedBossField(boss, "label")}</h4>
      <p>${localizedBossField(boss, "description")}</p>
      <footer>
        <span class="shop-price">${boss.rewardGems} Gem</span>
        <button type="button">${i18n.t(active && !state.boss.rotationEnabled ? "boss.challenging" : "boss.challenge")}</button>
      </footer>
    `;
    const challengeButton = card.querySelector<HTMLButtonElement>("button");
    challengeButton?.addEventListener("click", () => {
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
    els.battleLogList.innerHTML = `<span class="empty-log">${i18n.t("boss.emptyLog")}</span>`;
    return;
  }
  els.battleLogList.innerHTML = "";
  logs.forEach((log) => {
    const row = document.createElement("div");
    row.className = "battle-log-row";
    const time = document.createElement("span");
    time.textContent = formatLogTime(String(log.at || ""));
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

function buyOrEquipItem(itemId: string): void {
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


function escapeCurrentRefText(value: unknown): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character] || character);
}

function currentRefMissionFromTask(task: Quest): CurrentRefMission {
  const complete = Boolean(task.done || task.lifecycleState === "completed" || task.lifecycleState === "archived");
  const handoff = String(task.assignee?.handoffState || "none");
  const missionState: CurrentRefMission["state"] = complete
    ? "done"
    : handoff === "blocked"
      ? "blocked"
      : handoff === "working"
        ? "working"
        : "queued";
  const estimated = Number(task.estimatedMinutes || 0);
  const actual = Number(task.actualMinutes || task.manualActualMinutes || 0);
  const progress = complete ? 100 : estimated > 0 ? Math.max(0, Math.min(99, Math.round(actual / estimated * 100))) : 0;
  const reward = typeof task.value === "number" && task.value !== 0
    ? (task.value > 0 ? "+" : "") + String(task.value) + " XP"
    : task.cost
      ? String(task.cost) + " Gem"
      : "—";
  return {
    id: task.id,
    title: task.title,
    notes: task.notes || task.nextAction || "詳細はQuest Inspectorで確認",
    time: task.scheduledTime || (task.dueDate ? task.dueDate.slice(5) : "—"),
    progress,
    state: missionState,
    assignee: task.assignee?.label || (task.assignee?.type === "self" ? state.character?.name || "本人" : "未割当"),
    handoff,
    reward,
    category: localizedTaskLabel("kind", task.kind, task.kind).toUpperCase(),
  };
}

function currentRefMissions(): CurrentRefMission[] {
  if (currentVisualFixtureEnabled) return currentReferenceFixtureMissions;
  return state.tasks
    .filter((task) => task.kind !== "reward" && task.lifecycleState !== "archived")
    .sort((left, right) => String(left.scheduledTime || left.dueDate || left.createdAt).localeCompare(String(right.scheduledTime || right.dueDate || right.createdAt)))
    .slice(0, 6)
    .map(currentRefMissionFromTask);
}

function currentRefCampaignMissions(): CurrentRefMission[] {
  if (currentVisualFixtureEnabled) return currentReferenceFixtureCampaign;
  return state.tasks
    .filter((task) => task.lifecycleState !== "archived")
    .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
    .slice(0, 12)
    .map(currentRefMissionFromTask);
}

function currentRefStateLabel(value: CurrentRefMission["state"]): string {
  return value === "done" ? "DONE" : value === "working" ? "WORKING" : value === "blocked" ? "BLOCKED" : "QUEUED";
}

function currentRefHandoffLabel(value: string): string {
  const labels: Record<string, string> = { accepted: "Accepted", working: "Working", ready: "Ready", blocked: "Blocked", review_required: "Review", none: "No handoff" };
  return labels[value] || value || "No handoff";
}

function renderCurrentSidebar(): void {
  const partyList = document.querySelector<HTMLElement>("#currentSidebarPartyList");
  if (!partyList) return;
  const referenceNav = document.querySelector<HTMLElement>(".current-reference-nav");
  if (referenceNav) referenceNav.hidden = !currentVisualFixtureEnabled;
  const fixtureMembers = [
    { name: "You", role: "Commander", state: "working", tone: "green" },
    { name: "Astra", role: "Writer Agent", state: "working", tone: "blue" },
    { name: "Codex", role: "Dev Agent", state: "working", tone: "blue" },
    { name: "Scout", role: "Research Agent", state: "ready", tone: "green" },
    { name: "Ops", role: "Infra Agent", state: "blocked", tone: "red" },
  ];
  const members = currentVisualFixtureEnabled
    ? fixtureMembers
    : (Array.isArray(state.party) ? state.party : []).slice(0, 5).map((member) => ({
      name: String(member.name || member.displayName || "Member"),
      role: String(member.role || "Party member"),
      state: "ready",
      tone: "blue",
    }));
  partyList.innerHTML = members.length
    ? members.map((member) => '<div class="current-sidebar-party-row"><span class="current-sidebar-party-mark is-' + member.tone + '">' + escapeCurrentRefText(member.name.slice(0, 2).toUpperCase()) + '</span><div><strong>' + escapeCurrentRefText(member.name) + '</strong><small>' + escapeCurrentRefText(member.role) + '</small></div><i class="current-sidebar-party-dot is-' + member.tone + '"></i></div>').join("")
    : '<p class="current-sidebar-empty">No registered members</p>';
  const count = document.querySelector<HTMLElement>("#currentSidebarPartyCount");
  if (count) count.textContent = String(members.length) + " / 5";
  const mp = currentVisualFixtureEnabled ? 82 : Number(state.battle.mp || 0);
  const maxMp = currentVisualFixtureEnabled ? 100 : Number(state.battle.maxMp || 80);
  const xp = currentVisualFixtureEnabled ? 6430 : Number(state.character.xp || 0);
  const nextXp = currentVisualFixtureEnabled ? 10000 : Number(state.character.nextXp || 100);
  const set = (id: string, value: string): void => {
    const element = document.querySelector<HTMLElement>("#" + id);
    if (element) element.textContent = value;
  };
  set("currentSidebarMp", mp + " / " + maxMp);
  set("currentSidebarMpNote", currentVisualFixtureEnabled ? "Full recovery at 18:32" : "Current battle reserve");
  set("currentSidebarXp", xp.toLocaleString() + " / " + nextXp.toLocaleString());
  set("currentSidebarXpNote", currentVisualFixtureEnabled ? "Lv.27 -> Lv.28" : "Character progression");
  set("currentSidebarGold", currentVisualFixtureEnabled ? "240" : String(state.character.gems || 0));
  set("currentSidebarXpReward", currentVisualFixtureEnabled ? "40" : String(state.character.xp || 0));
  set("currentSidebarShard", currentVisualFixtureEnabled ? "2" : String((state.inventory || []).length));
  const mpBar = document.querySelector<HTMLElement>("#currentSidebarMpBar");
  if (mpBar) mpBar.style.width = Math.min(100, mp / Math.max(1, maxMp) * 100) + "%";
  const xpBar = document.querySelector<HTMLElement>("#currentSidebarXpBar");
  if (xpBar) xpBar.style.width = Math.min(100, xp / Math.max(1, nextXp) * 100) + "%";
}

function renderCurrentReference(): void {
  const surface = document.querySelector<HTMLElement>("#currentReferenceSurface");
  const missionPanel = document.querySelector<HTMLElement>("#currentRefMission");
  const campaignPanel = document.querySelector<HTMLElement>("#currentRefCampaign");
  const campaignSummary = document.querySelector<HTMLElement>("#currentRefCampaignSummary");
  const summary = document.querySelector<HTMLElement>(".current-ref-summary");
  const missionList = document.querySelector<HTMLElement>("#currentRefMissionList");
  const campaignGrid = document.querySelector<HTMLElement>("#currentRefCampaignGrid");
  if (!surface || !missionPanel || !campaignPanel || !missionList || !campaignGrid) return;

  const mode = currentPresentationMode;
  const missions = currentRefMissions();
  const campaignMissions = currentRefCampaignMissions();
  document.body.classList.toggle("is-current-campaign", mode === "campaign");
  surface.dataset.vfId = mode === "mission" ? "MissionSpine" : "";
  missionPanel.hidden = mode !== "mission";
  campaignPanel.hidden = mode !== "campaign";
  if (campaignSummary) campaignSummary.hidden = mode !== "campaign";
  if (summary) summary.hidden = mode === "campaign";
  document.querySelectorAll<HTMLElement>("[data-current-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.currentMode === mode);
  });

  const title = document.querySelector<HTMLElement>("#currentRefTitle");
  const kicker = document.querySelector<HTMLElement>("#currentRefKicker");
  const copy = document.querySelector<HTMLElement>("#currentRefCopy");
  if (title) title.textContent = mode === "mission" ? "今日の攻略" : "探索";
  if (kicker) kicker.textContent = currentVisualFixtureEnabled
    ? mode === "mission" ? "TODAY'S ADVENTURE" : "QUEST TREE / 探索"
    : mode === "mission" ? "TODAY / MISSION SPINE" : "EXPLORE / CAMPAIGN MAP";
  if (copy) copy.textContent = currentVisualFixtureEnabled
    ? mode === "mission" ? "Human + AIで、今日というダンジョンを攻略しよう。" : "キャンペーンマップを探索し、新たなQuestを解放しよう。"
    : mode === "mission" ? "HumanとAgentの引き継ぎを、今日の流れに沿って見渡します。" : "Questの進行、依存関係、完了状態を同じ地図で確認します。";

  const active = missions.filter((mission) => mission.state !== "done").length;
  const total = currentVisualFixtureEnabled ? 12 : state.tasks.filter((task) => task.kind !== "reward" && task.lifecycleState !== "archived").length;
  const handoff = missions.filter((mission) => ["working", "blocked"].includes(mission.state)).length;
  const focusMinutes = currentVisualFixtureEnabled ? 134 : state.tasks.reduce((sum, task) => sum + Number(task.actualMinutes || task.manualActualMinutes || 0), 0);
  const activeValue = document.querySelector<HTMLElement>("#currentRefActive");
  const handoffValue = document.querySelector<HTMLElement>("#currentRefHandoff");
  const focusValue = document.querySelector<HTMLElement>("#currentRefFocus");
  if (activeValue) activeValue.textContent = currentVisualFixtureEnabled ? "8 / 12" : String(active) + " / " + String(total);
  if (handoffValue) handoffValue.textContent = String(currentVisualFixtureEnabled ? 3 : handoff);
  if (focusValue) focusValue.textContent = currentVisualFixtureEnabled
    ? "02:14:32"
    : String(Math.floor(focusMinutes / 60)).padStart(2, "0") + ":" + String(focusMinutes % 60).padStart(2, "0") + ":00";
  const missionCount = document.querySelector<HTMLElement>("#currentRefMissionCount");
  const campaignCount = document.querySelector<HTMLElement>("#currentRefCampaignCount");
  if (missionCount) missionCount.textContent = String(missions.length) + " visible";
  if (campaignCount) campaignCount.textContent = String(campaignMissions.length) + " nodes";

  missionList.innerHTML = missions.length
    ? missions.map((mission) => [
      '<article class="current-ref-mission is-', mission.state, '" data-current-task-id="', escapeCurrentRefText(mission.id), '">',
      '<span class="current-ref-time">', escapeCurrentRefText(mission.time), '</span>',
      '<button type="button" class="current-ref-mission-copy" data-current-task-id="', escapeCurrentRefText(mission.id), '">',
      '<small>', escapeCurrentRefText(mission.category), " · ", escapeCurrentRefText(currentRefStateLabel(mission.state)), '</small>',
      '<strong>', escapeCurrentRefText(mission.title), '</strong>',
      '<span>', escapeCurrentRefText(mission.notes), '</span></button>',
      '<div class="current-ref-progress"><b>', String(mission.progress), '%</b><i><em style="width:', String(mission.progress), '%"></em></i><small>', escapeCurrentRefText(mission.reward), '</small></div>',
      '<div class="current-ref-handoff"><small>HANDOFF</small>', currentVisualFixtureEnabled ? '<div class="current-ref-handoff-track"><i class="is-done"></i><b></b><i class="' + (mission.state === "queued" ? "is-current" : "is-done") + '"></i><b></b><i class="' + (mission.state === "blocked" ? "is-current is-error" : mission.state === "done" ? "is-done" : "") + '"></i><b></b><i></i></div>' : "", '<strong>', escapeCurrentRefText(currentRefHandoffLabel(mission.handoff)), '</strong><span>', escapeCurrentRefText(mission.assignee), '</span></div>',
      '<button type="button" class="current-ref-open" data-current-task-id="', escapeCurrentRefText(mission.id), '" aria-label="Quest詳細を開く">›</button></article>',
      currentVisualFixtureEnabled && mission.id === "QF-003" ? '<div class="current-ref-submissions" aria-label="サブQuest"><article><time>12:15</time><div><code>QF-2025-0519-003-A</code><strong>構成の見直し</strong><small>セクション構成と見出しを最適化</small></div><span><b>100%</b><i><em style="width:100%"></em></i></span><strong class="current-ref-submission-owner">YOU　 CODEX　 DONE</strong></article><article><time>12:45</time><div><code>QF-2025-0519-003-B</code><strong>クイックスタート追加</strong><small>初回利用者向けの手順を追加</small></div><span><b>20%</b><i><em style="width:20%"></em></i></span><strong class="current-ref-submission-owner">YOU　 CODEX　 —</strong></article></div>' : "",
    ].join("")).join("")
    : '<div class="current-ref-empty">表示できるQuestがありません。Questを追加してMission Spineを始めましょう。</div>';

  campaignGrid.innerHTML = campaignMissions.length
    ? campaignMissions.map((mission, index) => [
      '<article class="current-ref-campaign-node is-', mission.state, '" data-current-task-id="', escapeCurrentRefText(mission.id), '">',
      '<span>', String(index + 1).padStart(2, "0"), '</span><strong>', escapeCurrentRefText(mission.title), '</strong>',
      '<small>', escapeCurrentRefText(mission.category), " · ", String(mission.progress), '%</small><i><em style="width:', String(mission.progress), '%"></em></i></article>',
    ].join("")).join("")
    : '<div class="current-ref-empty">Questがありません。</div>';

  missionList.querySelectorAll<HTMLElement>("[data-current-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.currentTaskId);
      if (task) openTaskDialog(task);
    });
  });
  campaignGrid.querySelectorAll<HTMLElement>("[data-current-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.currentTaskId);
      if (task) openTaskDialog(task);
    });
  });
  renderCurrentStatusRail(missions);
}

function renderCurrentStatusRail(missions: CurrentRefMission[]): void {
  const boss = getBossOption(state.boss.currentId);
  const bossImage = document.querySelector<HTMLImageElement>("#currentRailBossImage");
  const bossName = document.querySelector<HTMLElement>("#currentRailBossName");
  const bossMeta = document.querySelector<HTMLElement>("#currentRailBossMeta");
  const bossLevel = document.querySelector<HTMLElement>("#currentRailBossLevel");
  const bossPressure = document.querySelector<HTMLElement>("#currentRailBossPressure");
  const bossProgress = document.querySelector<HTMLElement>("#currentRailBossProgress");
  const mpValue = document.querySelector<HTMLElement>("#currentRailMp");
  const mpProgress = document.querySelector<HTMLElement>("#currentRailMpProgress");
  if (bossImage) bossImage.src = boss.src;
  if (bossName) bossName.textContent = currentVisualFixtureEnabled ? "Goblin Skirmish" : boss.label;
  if (bossMeta) bossMeta.textContent = currentVisualFixtureEnabled ? "CURRENT BATTLE" : boss.threat;
  if (bossLevel) bossLevel.textContent = currentVisualFixtureEnabled ? "Lv.18 · Normal" : boss.name + " · " + boss.threat;
  const pressure = currentVisualFixtureEnabled ? 68 : Math.max(0, Math.min(100, Math.round((boss.maxHp - state.boss.hp) / boss.maxHp * 100)));
  const mp = currentVisualFixtureEnabled ? 82 : Number(state.battle.mp || 0);
  const maxMp = currentVisualFixtureEnabled ? 100 : Number(state.battle.maxMp || 100);
  if (bossPressure) bossPressure.textContent = String(pressure) + "%";
  if (bossProgress) bossProgress.style.width = String(pressure) + "%";
  if (mpValue) mpValue.textContent = String(mp) + " / " + String(maxMp);
  if (mpProgress) mpProgress.style.width = String(Math.max(0, Math.min(100, Math.round(mp / Math.max(1, maxMp) * 100)))) + "%";

  const log = document.querySelector<HTMLElement>("#currentRailBattleLog");
  if (log) {
    const rows: string[][] = currentVisualFixtureEnabled
      ? [["09:20", "Goblin Skirmish", "Victory"], ["10:40", "Data Slime", "Victory"], ["13:10", "Spam Imp", "Victory"]]
      : (Array.isArray(state.boss.battleLog) ? state.boss.battleLog.slice(-3).map((entry) => {
        const record = asJsonRecord(entry);
        return ["—", String(record.task || record.text || "Battle"), record.defeated ? "Victory" : "Retry"];
      }) : []);
    log.innerHTML = rows.length ? rows.map(([time, title, result]) => [
      "<div><time>", escapeCurrentRefText(time), "</time><span>", escapeCurrentRefText(title), "</span><b>", escapeCurrentRefText(result), "</b></div>",
    ].join("")).join("") : "<p>Battle log is empty.</p>";
  }

  const selected = missions.find((mission) => mission.state === "working") || missions.find((mission) => mission.state !== "done") || missions[0];
  const companion = document.querySelector<HTMLElement>("#currentRailCompanionCopy");
  if (companion) companion.textContent = selected
    ? selected.title + "を進めているね。次は" + selected.assignee + "の作業結果を確認すると良さそう。"
    : "進行中のQuestを選ぶと、Astraから次の一手を提案します。";
  const companionProgress = document.querySelector<HTMLElement>("#currentRailCompanionProgress");
  if (companionProgress) companionProgress.style.width = String(currentVisualFixtureEnabled ? 78 : selected?.progress || 0) + "%";

  const selectedTitle = document.querySelector<HTMLElement>("#currentRailSelectedTitle");
  const selectedId = document.querySelector<HTMLElement>("#currentRailSelectedId");
  const selectedState = document.querySelector<HTMLElement>("#currentRailSelectedState");
  const selectedOwner = document.querySelector<HTMLElement>("#currentRailSelectedOwner");
  const selectedHandoff = document.querySelector<HTMLElement>("#currentRailSelectedHandoff");
  if (selectedTitle) selectedTitle.textContent = selected?.title || "No mission selected";
  if (selectedId) selectedId.textContent = selected?.id || "—";
  if (selectedState) selectedState.textContent = selected ? currentRefStateLabel(selected.state) : "—";
  if (selectedOwner) selectedOwner.textContent = selected ? selected.assignee + " · " + selected.category : "—";
  if (selectedHandoff) selectedHandoff.innerHTML = selected
    ? ["done", "working", "queued", "blocked"].map((step, index) => {
      const active = (index === 0 && selected.state === "done") || (index === 1 && selected.state === "working") || (index === 3 && selected.state === "blocked");
      const completed = index === 0 && selected.state !== "queued";
      return '<i class="' + (active ? "is-current" : completed ? "is-done" : "") + '"></i>';
    }).join("")
    : "";
}

function render() {
  saveState();
  applyTheme();
  els.sortMode.value = state.sortMode;
  els.currentDateLabel.textContent = formatCurrentDateLabel();
  renderCharacter();
  renderCurrentSidebar();
  if (activeViewId === "tasks") {
    renderRolloverStatus();
    renderBoss();
    renderTasks();
    renderCurrentReference();
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
  if (activeViewId !== "party") disposePartyFormationIsland();
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
  els.themeHeroTitle.textContent = i18n?.t?.(`theme.${state.theme}.title`) || preset.heroTitle;
  els.themeHeroCopy.textContent = i18n?.t?.(`theme.${state.theme}.copy`) || preset.heroCopy;
  els.themeOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === state.theme);
  });
  applyAppearance();
  renderFeedbackSettings();
}

const appearanceIcons: Record<string, QuestForgeIconName> = {
  light: "sun",
  dark: "moon",
  system: "monitor",
};

const themeColorMap: Record<string, Record<string, string>> = {
  arcane: { light: "#202735", dark: "#10151c" },
  soft: { light: "#232b31", dark: "#111715" },
  retro: { light: "#171b25", dark: "#0b0e15" },
};

const colorSchemeQuery = typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;
let sessionAppearanceMode: string | null = null;

function normalizeAppearanceMode(value: unknown): string {
  return typeof value === "string" && appearanceModes.includes(value) ? value : "system";
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

  const label = i18n?.t?.(`appearance.${mode}`) || mode;
  if (els.appearanceIcon) {
    const icon = appearanceIcons[mode] || appearanceIcons.system;
    els.appearanceIcon.dataset.qfIcon = icon;
    els.appearanceIcon.innerHTML = iconMarkup(icon, { size: 16 });
    els.appearanceIcon.dataset.qfIconReady = icon;
  }
  if (els.appearanceButton) {
    els.appearanceButton.setAttribute("aria-label", i18n.t("appearance.change", { mode: label }));
    els.appearanceButton.title = i18n.t("appearance.title", { mode: label });
  }
  els.appearanceOptions.forEach((button) => {
    const active = button.dataset.appearanceOption === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });

  const themeColors = themeColorMap[state.theme] || themeColorMap.soft;
  els.themeColorMeta?.setAttribute("content", themeColors[resolved]);
}

function setAppearanceMenuOpen(open: boolean): void {
  if (!els.appearanceMenu || !els.appearanceButton) return;
  els.appearanceMenu.hidden = !open;
  els.appearanceButton.setAttribute("aria-expanded", String(open));
  if (open) {
    const activeOption = [...els.appearanceOptions].find((button) => button.classList.contains("active"));
    window.requestAnimationFrame(() => activeOption?.focus());
  }
}

function setAppearanceMode(mode: unknown): void {
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
  const telemetry = globalThis.QuestForgeTelemetry;
  const consent = telemetry?.getConsent?.() || "unknown";
  if (els.telemetryConsentToggle) els.telemetryConsentToggle.checked = consent === "granted";
  if (els.telemetryConsentStatus) els.telemetryConsentStatus.textContent = i18n?.t?.(`telemetry.${consent}`) || consent;
}

function renderRolloverStatus() {
  if (!els.rolloverStatus) return;
  const summary = state.lastRolloverSummary || { reset: 0, advanced: 0 };
  els.rolloverStatus.textContent = i18n.t("task.rolloverStatus", {
    date: formatCurrentDateLabel(),
    reset: summary.reset || 0,
    advanced: summary.advanced || 0,
  });
}

function renderCharacter() {
  const role = getRole(state.character.role);
  const motion = getMotion(state.character.motion);
  const variant = getVariant(state.character.variant);
  const avatarSrc = getAvatarSrc(state.character.role, state.character.variant);
  els.characterName.textContent = state.character.name;
  els.characterClass.textContent = `Level ${state.character.level} ${role.name} / ${state.character.personality}`;
  if (els.publicHandle) els.publicHandle.textContent = String(gatewayRuntime.profile?.handle || (globalThis.QuestForgeFirebase?.getUser?.() ? i18n.t("account.handleMissing") : i18n.t("account.loggedOut")));
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
  els.gemBalance.textContent = String(state.character.gems);
  if (!els.variantSelect.options.length) {
    avatarVariants.forEach((variant) => {
      els.variantSelect.appendChild(new Option(variant.name, variant.id));
    });
  }
  if (!els.classSelect.options.length) classOptions.forEach((role) => els.classSelect.appendChild(new Option("", role.id)));
  classOptions.forEach((role) => {
    const option = [...els.classSelect.options].find((entry) => entry.value === role.id);
    if (option) option.textContent = `${role.name} / ${localizedRoleField(role, "label")}`;
  });
  if (!els.personalitySelect.options.length) {
    personalityTypes.forEach((type) => {
      els.personalitySelect.appendChild(new Option(type, type));
    });
  }
  if (!els.motionSelect.options.length) motionOptions.forEach((motion) => els.motionSelect.appendChild(new Option("", motion.id)));
  motionOptions.forEach((motion) => {
    const option = [...els.motionSelect.options].find((entry) => entry.value === motion.id);
    if (option) option.textContent = localizedMotionName(motion);
  });

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
      <strong>${role.name} <span class="pill">${localizedRoleField(role, "label")}</span></strong>
      <p>${localizedRoleField(role, "description")}</p>
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
  els.shopGemBalance.textContent = String(state.character.gems);
  els.shopGrid.innerHTML = "";
  shopItems.forEach((item) => {
    const owned = state.character.ownedItems.includes(item.id);
    const equipped = state.character.equippedItems.includes(item.id);
    const recommended = isRecommendedShopItem(item);
    const card = document.createElement("article");
    card.className = "shop-card";
    card.classList.toggle("equipped", equipped);
    card.classList.toggle("recommended", recommended);
    const action = i18n.t(owned ? (equipped ? "shop.unequip" : "shop.equip") : "shop.obtain");
    const slotLabel = localizedSlot(item);
    const affinity = item.id === "warm-aura" ? i18n.t("shop.affinity.f") : item.id === "logic-sparks" ? i18n.t("shop.affinity.t") : item.affinity;
    const art = item.asset
      ? `<img class="item-art" src="${item.asset}" alt="${item.name}" loading="lazy" />`
      : `<span class="item-art item-art-aura" aria-hidden="true"></span>`;
    card.innerHTML = `
      ${art}
      <div class="shop-card-tags">
        <span class="pill">${slotLabel}</span>
        <span class="pill">${affinity}</span>
        ${recommended ? `<span class="pill">${i18n.t("shop.recommended")}</span>` : ""}
      </div>
      <strong>${item.name}</strong>
      <p>${localizedShopDescription(item)}</p>
      <footer>
        <span class="shop-price">${item.price} Gem</span>
        <button type="button">${action}</button>
      </footer>
    `;
    card.querySelector<HTMLButtonElement>("button")?.addEventListener("click", () => buyOrEquipItem(item.id));
    els.shopGrid.appendChild(card);
  });
}

function isRecommendedShopItem(item: ShopItem): boolean {
  const role = getRole(state.character.role);
  const personality = state.character.personality || "";
  if (item.affinity?.includes(role.name)) return true;
  if (item.id === "warm-aura" && personality.includes("F")) return true;
  if (item.id === "logic-sparks" && personality.includes("T")) return true;
  return false;
}

function updateAvatarMotion(image: AppElement, className: string): void {
  if (!image) return;
  image.classList.remove(...motionOptions.map((motion) => motion.className));
  image.classList.add(className);
}

function renderEquipmentEffects(): void {
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
    stage.querySelectorAll<AppElement>("[data-item-layer]").forEach((layer) => {
      const itemId = layer.dataset.itemLayer;
      const item = shopItems.find((entry) => entry.id === itemId);
      const equipped = Boolean(itemId && equippedIds.has(itemId));
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

function getEquippedItems(): ShopItem[] {
  return state.character.equippedItems
    .map((itemId) => shopItems.find((item) => item.id === itemId))
    .filter((item): item is ShopItem => Boolean(item));
}

function getAdjustableEquipmentItems(items: ShopItem[] = getEquippedItems()): ShopItem[] {
  return items.filter((item) => item.asset);
}

function getEquipmentPlacement(item: ShopItem): { x: number; y: number; size: number } {
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

function applyEquipmentPlacement(layer: AppElement, item: ShopItem): void {
  const placement = getEquipmentPlacement(item);
  layer.style.setProperty("--eq-x", `${placement.x}%`);
  layer.style.setProperty("--eq-y", `${placement.y}%`);
  layer.style.setProperty("--eq-size", `${placement.size}%`);
  layer.title = item.name;
}

function getEquipmentOffset(itemId: string): EquipmentOffset {
  return state.character.equipmentOffsets?.[itemId] || { x: 0, y: 0, scale: 0 };
}

function updateEquipmentOffset(itemId: string, partial: Partial<EquipmentOffset>): void {
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

  const optionSignature = `${i18n?.getLocale?.() || "ja"}:${adjustableItems.map((item) => item.id).join("|")}`;
  if (els.equipmentAdjustSelect.dataset.signature !== optionSignature) {
    els.equipmentAdjustSelect.innerHTML = "";
    adjustableItems.forEach((item) => {
      els.equipmentAdjustSelect.appendChild(new Option(`${localizedSlot(item)} / ${item.name}`, item.id));
    });
    els.equipmentAdjustSelect.dataset.signature = optionSignature;
  }
  els.equipmentAdjustSelect.value = selectedEquipmentId;
  const offset = getEquipmentOffset(selectedEquipmentId);
  els.equipmentOffsetX.value = String(offset.x || 0);
  els.equipmentOffsetY.value = String(offset.y || 0);
  els.equipmentScale.value = String(offset.scale || 0);
}

function renderEquipmentChips(target: AppElement, items: ShopItem[]): void {
  if (!target) return;
  target.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "equip-chip muted";
    empty.textContent = i18n.t("equipment.none");
    target.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "equip-chip";
    chip.textContent = `${localizedSlot(item)}: ${item.name}`;
    target.appendChild(chip);
  });
}

function renderTasks(): void {
  const buckets: Record<Quest["kind"], AppElement> = {
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
  renderQuestTree();
  renderCalendarAgenda();
  renderArchiveDialog();

  const visibleCounts: Record<Quest["kind"], number> = { habit: 0, daily: 0, todo: 0, reward: 0 };
  [...state.tasks].filter(taskMatchesFilter).sort(compareTasks).forEach((task) => {
    if (!buckets[task.kind]) return;
    buckets[task.kind].appendChild(createTaskCard(task));
    visibleCounts[task.kind] += 1;
  });

  Object.entries(buckets).forEach(([kind, bucket]) => {
    const taskKind = kind as Quest["kind"];
    if (visibleCounts[taskKind] === 0) {
      bucket.appendChild(createEmptyTaskMessage(taskKind));
    }
  });
}

function questTreeChildren(taskId: string, includeArchived: boolean): Quest[] {
  return state.tasks
    .filter((task) => task.parentQuestId === taskId && taskTreeEligible(task) && (includeArchived || task.lifecycleState !== "archived"))
    .sort(compareTasks);
}

function questTreeSummary(taskId: string, includeArchived: boolean): { total: number; completed: number; progress: number } {
  const children = questTreeChildren(taskId, includeArchived);
  const completed = children.filter((task) => ["completed", "archived"].includes(task.lifecycleState) || task.done).length;
  return { total: children.length, completed, progress: children.length ? Math.round((completed / children.length) * 100) : 0 };
}

function renderQuestTree(): void {
  if (!els.questTreeList) return;
  const includeArchived = Boolean(els.questTreeIncludeArchived?.checked);
  const roots = state.tasks
    .filter((task) => taskTreeEligible(task) && !task.parentQuestId && (includeArchived || task.lifecycleState !== "archived"))
    .sort(compareTasks);
  els.questTreeList.innerHTML = "";
  if (!roots.length) {
    const empty = document.createElement("p");
    empty.className = "quest-tree-empty";
    empty.textContent = "親Questを作ると、ここに目的とサブQuestが表示されます。";
    els.questTreeList.appendChild(empty);
    return;
  }
  const expanded = new Set(JSON.parse(localStorage.getItem("questforge-tree-expanded") || "[]"));
  const persistExpanded = () => localStorage.setItem("questforge-tree-expanded", JSON.stringify([...expanded]));
  const buildNode = (task: Quest, depth = 0): HTMLElement => {
    const children = questTreeChildren(task.id, includeArchived);
    const summary = questTreeSummary(task.id, includeArchived);
    const row = document.createElement("div");
    row.className = "quest-tree-node";
    row.style.setProperty("--tree-depth", String(Math.min(depth, 7)));
    const line = document.createElement("div");
    line.className = "quest-tree-line";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "quest-tree-toggle";
    toggle.innerHTML = iconMarkup(children.length && expanded.has(task.id) ? "minus" : "plus", { size: 14 });
    toggle.disabled = !children.length;
    toggle.setAttribute("aria-label", children.length ? "サブQuestを開閉" : "サブQuestなし");
    toggle.addEventListener("click", () => {
      if (expanded.has(task.id)) expanded.delete(task.id); else expanded.add(task.id);
      persistExpanded();
      renderQuestTree();
    });
    const title = document.createElement("button");
    title.type = "button";
    title.className = "quest-tree-title";
    title.textContent = task.title;
    title.addEventListener("click", () => openTaskDialog(task));
    line.append(toggle, title);
    const meta = document.createElement("span");
    meta.className = "quest-tree-meta";
    if (children.length) meta.textContent = `${summary.completed}/${summary.total} 完了`;
    if (task.assignee?.type === "agent") meta.textContent = `${meta.textContent ? `${meta.textContent} ・ ` : ""}${task.assignee.label} / ${handoffStateLabels[task.assignee.handoffState] || task.assignee.handoffState}`;
    line.appendChild(meta);
    if (children.length) {
      const progress = document.createElement("span");
      progress.className = "quest-tree-progress";
      progress.style.setProperty("--progress", `${summary.progress}%`);
      progress.setAttribute("aria-label", `${summary.progress}%完了`);
      line.appendChild(progress);
    }
    const addChild = document.createElement("button");
    addChild.type = "button";
    addChild.className = "quest-tree-add-child";
    addChild.innerHTML = iconMarkup("plus", { size: 16 });
    addChild.title = "子Questを追加";
    addChild.setAttribute("aria-label", `${task.title}の子Questを追加`);
    addChild.addEventListener("click", () => openTaskDialog({ kind: "todo", parentQuestId: task.id }));
    line.appendChild(addChild);
    row.appendChild(line);
    if (children.length && expanded.has(task.id)) {
      const childList = document.createElement("div");
      childList.className = "quest-tree-children";
      children.forEach((child) => childList.appendChild(buildNode(child, depth + 1)));
      row.appendChild(childList);
    }
    return row;
  };
  roots.forEach((task) => els.questTreeList.appendChild(buildNode(task)));
}

function renderCalendarAgenda(): void {
  if (!els.calendarAgenda || !els.calendarAgendaList) return;
  const connected = gatewayRuntime.integrations?.some((item) => item.id === "google-calendar" && item.status === "connected");
  els.calendarAgenda.hidden = !connected;
  if (!connected) return;
  els.calendarAgendaList.innerHTML = "";
  const events = gatewayRuntime.calendarEvents || [];
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-agenda-empty";
    const message = document.createElement("p");
    message.textContent = "今日の予定はありません。連携画面から同期対象を確認できます。";
    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "secondary-button";
    settings.textContent = "連携設定を開く";
    settings.addEventListener("click", () => setActiveView("integrations"));
    empty.append(message, settings);
    els.calendarAgendaList.appendChild(empty);
    return;
  }
  events.forEach((event) => {
    const eventRecord = asJsonRecord(event);
    const item = document.createElement("article");
    item.className = "calendar-agenda-item";
    const time = document.createElement("time");
    const startAt = String(eventRecord.startAt || "");
    const endAt = String(eventRecord.endAt || "");
    time.textContent = eventRecord.allDay ? "終日" : `${startAt.slice(11, 16)}-${endAt.slice(11, 16)}`;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = String(eventRecord.title || "");
    const meta = document.createElement("span");
    meta.textContent = String(eventRecord.calendarName || "Google Calendar");
    copy.append(title, meta);
    const convert = document.createElement("button");
    convert.type = "button";
    convert.className = "secondary-button";
    convert.textContent = "Questに変換";
    convert.addEventListener("click", async () => {
      convert.disabled = true;
      try {
        await gatewayFetch(`/v1/calendar/events/${encodeURIComponent(String(eventRecord.externalId || ""))}/convert`, { method: "POST" });
        showToast("予定からQuestを作成しました。");
      } catch (error) {
        showToast((error as Error).message, { duration: 6000 });
      } finally { convert.disabled = false; }
    });
    item.append(time, copy, convert);
    els.calendarAgendaList.appendChild(item);
  });
}

function renderTaskSummary(): void {
  if (!els.taskSummaryRow) return;
  const today = currentDateText();
  const activeTasks = state.tasks.filter((task) => task.lifecycleState === "active");
  const undone = activeTasks.filter((task) => task.kind !== "reward" && !task.done).length;
  const dueToday = activeTasks.filter((task) => task.kind !== "reward" && task.dueDate === today).length;
  const overdue = state.tasks.filter(isOverdue).length;
  const archived = getArchivedTasks().length;
  const rewards = state.tasks.filter((task) => task.kind === "reward").length;
  els.taskSummaryRow.innerHTML = `
    <span class="summary-chip"><strong>${undone}</strong> ${i18n.t("task.summary.open")}</span>
    <span class="summary-chip"><strong>${dueToday}</strong> ${i18n.t("task.summary.dueToday")}</span>
    <span class="summary-chip danger"><strong>${overdue}</strong> ${i18n.t("task.summary.overdue")}</span>
    <span class="summary-chip"><strong>${archived}</strong> ${i18n.t("task.summary.archive")}</span>
    <span class="summary-chip"><strong>${rewards}</strong> ${i18n.t("task.summary.rewards")}</span>
  `;
}

function taskMatchesFilter(task: Quest): boolean {
  if (["completed", "archived"].includes(task.lifecycleState)) return false;
  if (state.taskFilter === "today") {
    return task.kind !== "reward" && task.dueDate === currentDateText();
  }
  if (state.taskFilter === "overdue") {
    return isOverdue(task);
  }
  if (state.taskFilter === "upcoming") {
    return Boolean(task.kind !== "reward" && !task.done && task.dueDate && daysUntil(task.dueDate) >= 0 && daysUntil(task.dueDate) <= 7);
  }
  if (state.taskFilter === "undone") {
    return task.kind === "reward" || !task.done;
  }
  return true;
}

function getArchivedTasks(): Quest[] {
  return state.tasks
    .filter((task) => ["completed", "archived"].includes(task.lifecycleState))
    .sort((a, b) => archiveSortKey(b).localeCompare(archiveSortKey(a)));
}

function archiveSortKey(task: Quest): string {
  return task.lastCompletedDate || task.updatedAt || task.createdAt || "";
}

function renderArchiveDialog(): void {
  if (!els.archiveList || !els.archiveButton || !els.archiveCount) return;
  const tasks = getArchivedTasks();
  els.archiveCount.textContent = String(tasks.length);
  els.archiveButton.setAttribute("aria-label", i18n.t("task.archiveCount", { count: tasks.length }));
  els.archiveList.innerHTML = "";

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-task";
    empty.textContent = i18n.t("archive.empty");
    els.archiveList.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    els.archiveList.appendChild(createArchiveTaskCard(task));
  });
}

function createArchiveTaskCard(task: Quest): HTMLElement {
  const card = document.createElement("article");
  card.className = "archive-task-card";

  const heading = document.createElement("div");
  heading.className = "archive-task-heading";
  const title = document.createElement("strong");
  title.textContent = task.title;
  heading.appendChild(title);
  const type = pill(task.lifecycleState === "completed" ? i18n.t("archive.review") : i18n.t("task.archive"));
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
  restore.textContent = i18n.t("archive.restore");
  restore.addEventListener("click", () => restoreArchivedTask(task.id));
  actions.appendChild(restore);

  const edit = document.createElement("button");
  edit.className = "secondary-button";
  edit.type = "button";
  edit.textContent = i18n.t("common.edit");
  edit.addEventListener("click", () => {
    closeArchiveDialog();
    openTaskDialog(task);
  });
  actions.appendChild(edit);
  card.appendChild(actions);

  return card;
}

function formatArchiveCompletion(task: Quest): string {
  const dateText = task.lastCompletedDate || "";
  if (!dateText) return i18n.t("archive.completionMissing");
  const date = new Date(`${dateText}T00:00:00`);
  const shortDate = i18n?.formatDate?.(date, { year: undefined, month: "numeric", day: "numeric" }) || `${date.getMonth() + 1}/${date.getDate()}`;
  return i18n.t("archive.completedOn", { date: shortDate });
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

function restoreArchivedTask(taskId: string): void {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !["completed", "archived"].includes(task.lifecycleState)) return;
  task.done = false;
  task.lifecycleState = "active";
  task.completedAt = "";
  task.archivedAt = "";
  task.updatedAt = new Date().toISOString();
  recordTaskEvent("task.reopened", task, { rewardReversed: false, source: "archive" });
  playInteractionCue("restore");
  render();
  renderArchiveDialog();
  showToast(`「${task.title}」を未完了に戻しました。`, { duration: 3200 });
}

function createEmptyTaskMessage(kind: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "empty-task";
  const message = document.createElement("p");
  message.textContent = i18n.t("task.empty", { kind: localizedTaskLabel("kind", kind, taskKindLabels[kind]) });
  item.appendChild(message);
  if (kind === "todo") {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "secondary-button empty-task-action";
    add.textContent = i18n.t("task.emptyTodoAction");
    add.addEventListener("click", () => openTaskDialog({ kind: "todo", difficulty: "medium" }));
    item.appendChild(add);
  }
  return item;
}

function compareTasks(a: Quest, b: Quest): number {
  if (state.sortMode === "dueDate") {
    return compareDueDate(a, b) || compareCreated(a, b);
  }
  if (state.sortMode === "name") {
    return (i18n?.compareText?.(a.title, b.title) ?? a.title.localeCompare(b.title)) || compareCreated(a, b);
  }
  if (state.sortMode === "difficulty") {
    return difficultyScale(b.difficulty) - difficultyScale(a.difficulty) || compareCreated(a, b);
  }
  if (state.sortMode === "undone") {
    return Number(Boolean(a.done)) - Number(Boolean(b.done)) || compareDueDate(a, b) || compareCreated(a, b);
  }
  return compareCreated(a, b);
}

function compareDueDate(a: Quest, b: Quest): number {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function compareCreated(a: Quest, b: Quest): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function createTaskCard(task: Quest): HTMLElement {
  const card = document.createElement("article");
  card.className = "task-card";
  card.classList.add(`${task.kind}-card`);
  card.dataset.taskId = task.id;

  if (task.kind === "daily" || task.kind === "todo") {
    const completeMark = document.createElement("span");
    completeMark.className = "task-complete-mark";
    completeMark.setAttribute("aria-hidden", "true");
    completeMark.innerHTML = iconMarkup("check", { size: 16 });
    card.appendChild(completeMark);
  }

  const top = document.createElement("div");
  top.className = "task-topline";

  if (task.kind !== "reward") {
    const plus = document.createElement("button");
    plus.className = "score-button";
    plus.type = "button";
    plus.innerHTML = task.done ? iconMarkup("check", { size: 18 }) : iconMarkup("plus", { size: 18 });
    plus.setAttribute(
      "aria-label",
      i18n.t(task.kind === "habit" ? "task.positiveAction" : "task.completeAction", { title: task.title }),
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
    minus.innerHTML = iconMarkup("minus", { size: 18 });
    minus.setAttribute(
      "aria-label",
      i18n.t(task.kind === "habit" ? "task.negativeAction" : "task.failAction", { title: task.title }),
    );
    minus.addEventListener("click", () => scoreTask(task.id, "down"));
    top.appendChild(minus);
  }

  const edit = document.createElement("button");
  edit.className = "edit-button";
  edit.type = "button";
  edit.title = i18n.t("task.editAction", { title: task.title });
  edit.setAttribute("aria-label", i18n.t("task.editAction", { title: task.title }));
  edit.textContent = i18n.t("common.edit");
  edit.addEventListener("click", () => openTaskDialog(task));
  top.appendChild(edit);

  card.appendChild(top);

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.appendChild(pill(localizedTaskLabel("difficulty", task.difficulty, difficultyLabels[task.difficulty] || task.difficulty)));
  if (task.assignee?.type && task.assignee.type !== "self") {
    meta.appendChild(pill(`${i18n.t(task.assignee.type === "agent" ? "task.assignee.agent" : "task.assignee.human")}: ${task.assignee.label}`));
  }
  if (task.parentQuestId) {
    const parent = state.tasks.find((item) => item.id === task.parentQuestId);
    if (parent) meta.appendChild(pill(`親: ${parent.title}`));
  }
  if (task.assignee?.type === "agent" && task.assignee.handoffState !== "none") {
    const handoffPill = pill(handoffStateLabels[task.assignee.handoffState] || task.assignee.handoffState);
    handoffPill.classList.add(`handoff-${task.assignee.handoffState}`);
    meta.appendChild(handoffPill);
  }
  if (task.repeat && task.repeat !== "none") {
    meta.appendChild(pill(localizedTaskLabel("repeat", task.repeat, repeatLabels[task.repeat] || task.repeat)));
  }

  if (task.kind === "daily") {
    meta.appendChild(pill(i18n.t("task.streak", { count: task.streak || 0 })));
  }
  if (task.dueDate) {
    const due = pill(formatDueDate(task.dueDate));
    due.classList.add(isOverdue(task) ? "overdue" : "due");
    meta.appendChild(due);
  }
  if (task.done) {
    const done = pill(i18n.t("task.done"));
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
    const linkPill = pill(adapter ? adapter.shortName : link.service);
    if (["conflict", "remote_missing"].includes(link.syncStatus)) {
      linkPill.classList.add("overdue");
      linkPill.title = link.syncStatus === "conflict" ? "両方で変更されています" : "外部側で削除されています";
    }
    meta.appendChild(linkPill);
  });
  card.appendChild(meta);

  if (task.assignee?.type === "agent") {
    const handoffActions = document.createElement("div");
    handoffActions.className = "handoff-actions";
    const currentHandoff = task.assignee.handoffState || "none";
    const actions = currentHandoff === "none" ? [["ready", "AIへ渡す"]]
      : currentHandoff === "ready" ? [["working", "作業開始"]]
        : currentHandoff === "working" ? [["review_required", "レビューへ返す"]]
          : currentHandoff === "blocked" ? [["working", "作業を再開"]]
            : currentHandoff === "review_required" ? [["accepted", "承認"], ["working", "差し戻し"]]
              : [["none", "引き継ぎを解除"]];
    actions.forEach(([nextState, label]) => {
      const handoffButton = document.createElement("button");
      handoffButton.type = "button";
      handoffButton.className = "secondary-button task-external-action";
      handoffButton.textContent = label;
      handoffButton.addEventListener("click", () => {
        const details = nextState === "working" && currentHandoff === "review_required"
          ? { note: "人間がレビュー後に差し戻しました。" }
          : {};
        if (transitionTaskHandoff(task, nextState, details)) {
          playInteractionCue("success");
          render();
          showToast(`「${task.title}」を${handoffStateLabels[nextState]}にしました。`, { duration: 3200 });
        }
      });
      handoffActions.appendChild(handoffButton);
    });
    if (currentHandoff === "working") {
      const blockButton = document.createElement("button");
      blockButton.type = "button";
      blockButton.className = "secondary-button task-external-action";
      blockButton.textContent = "ブロック";
      blockButton.addEventListener("click", () => {
        if (transitionTaskHandoff(task, "blocked", { blockedReason: "画面からブロック" })) render();
      });
      handoffActions.appendChild(blockButton);
    }
    card.appendChild(handoffActions);
  }

  const tasksConnected = gatewayRuntime.integrations?.some((item) => item.id === "google-tasks" && item.status === "connected");
  const googleTasksLink = (task.externalLinks || []).find((link) => link.service === "google-tasks");
  const linkedToGoogleTasks = Boolean(googleTasksLink);
  if (task.kind === "todo" && tasksConnected && !linkedToGoogleTasks) {
    const exportButton = document.createElement("button");
    exportButton.className = "secondary-button task-external-action";
    exportButton.type = "button";
    exportButton.textContent = "Google Tasksへ同期";
    exportButton.addEventListener("click", async () => {
      exportButton.disabled = true;
      try {
        await gatewayFetch(`/v1/quests/${encodeURIComponent(task.id)}/google-tasks`, { method: "POST" });
        showToast("Google Tasksへ追加しました。");
      } catch (error) {
        showToast((error as Error).message, { duration: 6000 });
      } finally { exportButton.disabled = false; }
    });
    card.appendChild(exportButton);
  }
  if (task.kind === "todo" && tasksConnected && googleTasksLink && ["conflict", "remote_missing"].includes(googleTasksLink.syncStatus)) {
    const conflictActions = document.createElement("div");
    conflictActions.className = "task-external-conflict";
    const localButton = document.createElement("button");
    localButton.className = "secondary-button task-external-action";
    localButton.type = "button";
    localButton.textContent = googleTasksLink.syncStatus === "remote_missing" ? "Googleへ再作成" : "Guilduo側を採用";
    const remoteButton = document.createElement("button");
    remoteButton.className = "secondary-button task-external-action";
    remoteButton.type = "button";
    remoteButton.textContent = "Google側を採用";
    remoteButton.hidden = googleTasksLink.syncStatus === "remote_missing";
    const resolve = async (strategy: "local" | "remote"): Promise<void> => {
      localButton.disabled = true;
      remoteButton.disabled = true;
      try {
        await gatewayFetch(`/v1/quests/${encodeURIComponent(task.id)}/google-tasks/resolve`, { method: "POST", body: JSON.stringify({ strategy }) });
        showToast(strategy === "local" ? "Guilduo側の内容をGoogleへ反映しました。" : "Google側の内容を反映しました。");
      } catch (error) {
        showToast((error as Error).message, { duration: 6000 });
      } finally {
        localButton.disabled = false;
        remoteButton.disabled = false;
      }
    };
    localButton.addEventListener("click", () => resolve("local"));
    remoteButton.addEventListener("click", () => resolve("remote"));
    conflictActions.append(localButton, remoteButton);
    card.appendChild(conflictActions);
  }

  const focusRuntime = gatewayRuntime.integrations?.find((item) => item.id === "toggl-focus" && item.status === "connected");
  const focusSettings = asJsonRecord(focusRuntime?.account?.settings);
  const focusLink = (task.externalLinks || []).find((link) => link.service === "toggl-focus"
    && (link.type === "task" || link.sourceType === "focus.task")
    && (!link.organizationId || (link.organizationId === focusSettings.organizationId && link.workspaceId === focusSettings.workspaceId)));
  const canUseFocusTask = ["todo", "daily"].includes(task.kind) && task.lifecycleState === "active" && !task.done;
  if (canUseFocusTask && focusRuntime) {
    const focusActions = document.createElement("div");
    focusActions.className = "task-external-conflict focus-task-actions";
    const syncFocus = document.createElement("button");
    syncFocus.type = "button";
    syncFocus.className = "secondary-button task-external-action";
    syncFocus.textContent = focusLink ? "Focusタスクを更新" : "Focusタスクを作成";
    syncFocus.addEventListener("click", async () => {
      syncFocus.disabled = true;
      try {
        const preview = await gatewayFetch(`/v1/quests/${encodeURIComponent(task.id)}/toggl-focus-task`, { method: "POST", body: JSON.stringify({ dryRun: true }) });
        const action = preview.operation === "update" ? "更新" : "作成";
        if (!window.confirm(`Toggl Focusに「${task.title}」を${action}しますか？`)) return;
        await gatewayFetch(`/v1/quests/${encodeURIComponent(task.id)}/toggl-focus-task`, { method: "POST", body: JSON.stringify({ dryRun: false }) });
        await refreshGatewayRuntime();
        showToast(`Focusタスクを${action}しました。`);
      } catch (error) {
        showToast(describeIntegrationError(error), { duration: 6000 });
      } finally { syncFocus.disabled = false; }
    });
    focusActions.appendChild(syncFocus);
    if (focusLink) {
      const timer = document.createElement("button");
      timer.type = "button";
      timer.className = "secondary-button task-external-action";
      timer.textContent = "Focusタイマー";
      timer.addEventListener("click", async () => {
        timer.disabled = true;
        try {
          const status = await gatewayFetch("/v1/integrations/toggl-focus/tracking");
          const current = asJsonRecord(status.tracking);
          if (current?.taskId === focusLink.externalId) {
            const preview = await gatewayFetch("/v1/integrations/toggl-focus/tracking/stop", { method: "POST", body: JSON.stringify({ expectedEntryId: current.id, dryRun: true }) });
            if (preview.action === "stop" && window.confirm("このFocusタイマーを停止しますか？")) {
              await gatewayFetch("/v1/integrations/toggl-focus/tracking/stop", { method: "POST", body: JSON.stringify({ expectedEntryId: current.id, dryRun: false }) });
              showToast("Focusタイマーを停止しました。");
            }
          } else {
            const preview = await gatewayFetch("/v1/integrations/toggl-focus/tracking/start", { method: "POST", body: JSON.stringify({ questId: task.id, dryRun: true }) });
            const expectedCurrentEntryId = preview.expectedCurrentEntryId || "";
            const currentPreview = asJsonRecord(preview.current);
            const message = preview.action === "confirmation_required"
              ? `「${String(currentPreview.taskName || "別の作業")}」のタイマーを止めて開始しますか？`
              : `「${task.title}」のFocusタイマーを開始しますか？`;
            if (window.confirm(message)) {
              await gatewayFetch("/v1/integrations/toggl-focus/tracking/start", { method: "POST", body: JSON.stringify({ questId: task.id, expectedCurrentEntryId, dryRun: false }) });
              showToast("Focusタイマーを開始しました。");
            }
          }
        } catch (error) {
          showToast(describeIntegrationError(error), { duration: 6000 });
        } finally { timer.disabled = false; }
      });
      focusActions.appendChild(timer);
    }
    card.appendChild(focusActions);
  }

  if (task.kind === "reward") {
    const buy = document.createElement("button");
    buy.className = "primary-button reward-buy";
    buy.type = "button";
    buy.textContent = i18n.t("task.rewardExchange");
    buy.setAttribute("aria-label", i18n.t("task.rewardAction", { title: task.title, cost: task.cost || rewardCost(task.difficulty) }));
    buy.addEventListener("click", () => scoreTask(task.id, "up"));
    card.appendChild(buy);
  }

  return card;
}

function formatDueDate(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00`);
  const shortDate = i18n?.formatDate?.(date, { year: undefined, month: "numeric", day: "numeric" }) || `${date.getMonth() + 1}/${date.getDate()}`;
  return i18n.t("task.due", { date: shortDate });
}

function isOverdue(task: Quest): boolean {
  if (!task.dueDate || task.done || task.kind === "reward") return false;
  return task.dueDate < currentDateText();
}

function currentDateText(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatCurrentDateLabel(): string {
  const today = new Date(`${currentDateText()}T00:00:00`);
  return i18n?.formatDate?.(today) || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function nextDueDateForTask(task: Quest, fromDateText: string): string {
  return core.nextDueDateForTask(task, fromDateText);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateText: string): number {
  const today = new Date(`${currentDateText()}T00:00:00`);
  const target = new Date(`${dateText}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6);
  }
  return String(value || "")
    .split(/[,\s、]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function formatLogTime(dateText: string): string {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function pill(text: string): HTMLSpanElement {
  const item = document.createElement("span");
  item.className = "pill";
  item.textContent = text;
  return item;
}

function getSelectedIntegration(): IntegrationAdapter {
  return integrationAdapters.find((adapter) => adapter.id === state.integrations.selectedService) || integrationAdapters[0];
}

function getGatewayUrl(): string {
  const stored = localStorage.getItem(gatewayStorageKey) || "";
  if (stored) return stored.replace(/\/$/, "");
  return productionGatewayUrl;
}

async function gatewayFetch(path: string, options: GatewayFetchOptions = {}): Promise<JsonRecord> {
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
  const body = response.status === 204 ? {} : asJsonRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const error = Object.assign(new Error(String(asJsonRecord(body.error).message || `Gateway HTTP ${response.status}`)), {
      code: String(asJsonRecord(body.error).code || "gateway_error"),
      status: response.status,
    }) as AppError;
    throw error;
  }
  return body;
}

function describeIntegrationError(error: unknown): string {
  const appError = error as Partial<AppError>;
  if (appError?.code === "provider_not_configured") {
    return "この連携は管理者設定がまだ完了していません。OAuth設定を確認してください。";
  }
  if (appError?.code === "integration_configuration_required") {
    return "同期対象を選んでから設定を保存してください。";
  }
  if (appError?.code === "integration_not_connected") {
    return "先にこのサービスを接続してください。";
  }
  if (appError?.code === "reconnect_required") {
    return "外部サービスの許可が切れています。再接続してください。";
  }
  if (appError?.code === "invalid_focus_api_key") {
    return "Toggl FocusのPersonal API keyを確認してください。toggl_sk_で始まる値が必要です。";
  }
  if (["incomplete_focus_configuration", "invalid_focus_organizationId", "invalid_focus_workspaceId"].includes(appError?.code || "")) {
    return "Toggl Focusの組織IDとWorkspace IDは数字で入力してください。";
  }
  if (appError?.code === "focus_task_not_linked") {
    return "先にこのQuestのFocusタスクを作成してください。";
  }
  if (appError?.code === "focus_quest_not_eligible") {
    return "Focusへ送れるのは、未完了でアーカイブされていないTo Doまたは日課です。";
  }
  if (appError?.code === "time_entry_already_attributed") {
    return "このFocus実績はすでに別のQuestへ取り込まれています。";
  }
  return appError?.message || "連携処理に失敗しました。";
}

function setGatewayStatus(status: string, message: string): void {
  gatewayRuntime.status = status;
  if (els.apiGatewayStatus) {
    els.apiGatewayStatus.dataset.status = status;
    els.apiGatewayStatus.textContent = message;
  }
  if (els.integrationModeLabel) els.integrationModeLabel.textContent = i18n.t(status === "online" ? "integration.mode.online" : "integration.mode.preview");
}

async function refreshGatewayRuntime(): Promise<void> {
  const base = getGatewayUrl();
  if (els.gatewayUrlInput) els.gatewayUrlInput.value = base;
  if (els.mcpEndpointInput) els.mcpEndpointInput.value = `${base}/mcp`;
  if (els.openMcpEndpointLink) {
    els.openMcpEndpointLink.href = base ? `${base}/.well-known/oauth-authorization-server` : "#";
    els.openMcpEndpointLink.setAttribute("aria-disabled", base ? "false" : "true");
  }
  if (!base) {
    setGatewayStatus("offline", i18n.t("gateway.offline"));
    if (els.gatewayOutput) els.gatewayOutput.textContent = i18n.t("gateway.noEndpoint");
    if (els.mcpConnectionNote) els.mcpConnectionNote.textContent = i18n.t("gateway.mcpOffline");
    return;
  }
  setGatewayStatus("checking", i18n.t("gateway.checking"));
  try {
    const health = await gatewayFetch("/health");
    const user = globalThis.QuestForgeFirebase?.getUser?.();
    if (!user) {
      setGatewayStatus("online", i18n.t("gateway.available"));
      if (els.mcpConnectionNote) els.mcpConnectionNote.textContent = i18n.t("gateway.mcpHealthy");
      els.gatewayOutput.textContent = `${health.service} ${health.version}\n${i18n.t("gateway.loginForData")}`;
      await refreshSocialRuntime();
      return;
    }
    const [integrations, webhooks, plugins] = await Promise.all([
      gatewayFetch("/v1/integrations"),
      gatewayFetch("/v1/webhooks"),
      gatewayFetch("/v1/plugins"),
    ]);
    gatewayRuntime.integrations = Array.isArray(integrations.integrations) ? integrations.integrations : [];
    gatewayRuntime.webhooks = Array.isArray(webhooks.webhooks) ? webhooks.webhooks : [];
    gatewayRuntime.plugins = Array.isArray(plugins.plugins) ? plugins.plugins : [];
    setGatewayStatus("online", i18n.t("gateway.online"));
    if (els.mcpConnectionNote) els.mcpConnectionNote.textContent = i18n.t("gateway.mcpConnected");
    els.gatewayOutput.textContent = `${health.service} ${health.version}\nREST: ${base}/v1/quests\nMCP: ${base}/mcp\nOAuth: ${base}/.well-known/oauth-authorization-server`;
    renderRuntimeWebhooks();
    renderRuntimePlugins();
    renderIntegrationHub();
    await refreshSocialRuntime();
    const selectedIntegration = getSelectedIntegration();
    const selectedRuntime = selectedRuntimeIntegration();
    if (externalOAuthEnabled && selectedRuntime.status === "connected" && !gatewayRuntime.integrationResources[selectedIntegration.id]) {
      await loadIntegrationResources(selectedIntegration.id).catch((error) => {
        if (els.integrationSetupMessage) els.integrationSetupMessage.textContent = describeIntegrationError(error);
      });
      renderIntegrationHub();
    }
    if (externalOAuthEnabled) await refreshCalendarSchedule().catch(() => {});
    else {
      gatewayRuntime.calendarEvents = [];
      renderCalendarAgenda();
    }
    await flushFocusAutoSyncQueue().catch(() => {});
  } catch (error) {
    setGatewayStatus("error", i18n.t("gateway.error"));
    const message = (error as Error).message;
    if (els.mcpConnectionNote) els.mcpConnectionNote.textContent = i18n.t("gateway.checkFailed", { message });
    if (els.gatewayOutput) els.gatewayOutput.textContent = message;
  }
}

async function refreshCalendarSchedule(): Promise<void> {
  if (!externalOAuthEnabled) {
    gatewayRuntime.calendarEvents = [];
    renderCalendarAgenda();
    return;
  }
  const connected = gatewayRuntime.integrations?.some((item) => item.id === "google-calendar" && item.status === "connected");
  if (!connected) {
    gatewayRuntime.calendarEvents = [];
    renderCalendarAgenda();
    return;
  }
  const schedule = await gatewayFetch(`/v1/calendar/schedule?date=${encodeURIComponent(currentDateText())}`);
  gatewayRuntime.calendarEvents = asJsonRecordArray(schedule.events);
  renderCalendarAgenda();
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
    title.textContent = String(hook.url || "");
    const meta = document.createElement("p");
    const events = Array.isArray(hook.events) ? hook.events.map(String).join(", ") : "";
    meta.textContent = `${events} / ${hook.enabled ? "有効" : "停止"}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "削除";
    remove.addEventListener("click", async () => {
      await gatewayFetch(`/v1/webhooks/${encodeURIComponent(String(hook.id || ""))}`, { method: "DELETE" });
      gatewayRuntime.webhooks = hooks.filter((entry) => entry.id !== hook.id);
      renderRuntimeWebhooks();
    });
    item.append(title, meta, remove);
    els.webhookList.appendChild(item);
  });
}

function renderRuntimePlugins(): void {
  if (!els.pluginList) return;
  els.pluginList.innerHTML = "";
  const plugins = gatewayRuntime.plugins || [];
  if (!plugins.length) els.pluginList.textContent = "インストール済み拡張機能はありません。";
  plugins.forEach((plugin) => {
    const item = document.createElement("article");
    item.className = "runtime-list-item";
    const title = document.createElement("strong");
    const manifest = asJsonRecord(plugin.manifest);
    title.textContent = String(manifest.name || plugin.id || "");
    const meta = document.createElement("p");
    meta.textContent = Array.isArray(manifest.permissions) ? manifest.permissions.map(String).join(", ") : "";
    item.append(title, meta);
    els.pluginList.appendChild(item);
  });
  renderPluginSlots(plugins);
}

function renderPluginSlots(plugins: GatewayRecord[]): void {
  qa<AppElement>("[data-plugin-slot]").forEach((host) => {
    const content = (host.querySelector<AppElement>(".plugin-slot-content") || host);
    content.querySelectorAll<HTMLIFrameElement>(".plugin-frame").forEach((frame) => frame.remove());
    let mounted = 0;
    plugins.forEach((plugin) => {
      const manifest = asJsonRecord(plugin.manifest);
      asJsonRecordArray(manifest.uiSlots).filter((slot) => slot.slot === host.dataset.pluginSlot).forEach((slot) => {
        const frame = document.createElement("iframe");
        frame.className = "plugin-frame";
        frame.title = `${String(manifest.name || plugin.id || "Plugin")} / ${String(slot.slot || "")}`;
        frame.sandbox = "allow-scripts";
        frame.referrerPolicy = "no-referrer";
        frame.src = String(slot.entry || "");
        frame.dataset.pluginId = String(plugin.id || "");
        frame.dataset.permissions = JSON.stringify(Array.isArray(manifest.permissions) ? manifest.permissions : []);
        content.appendChild(frame);
        mounted += 1;
      });
    });
    host.hidden = mounted === 0;
  });
}

async function previewLiveIntegration(run = false) {
  if (!externalOAuthEnabled) {
    showToast("外部サービス連携は公開βでは準備中です。", { duration: 6000 });
    return;
  }
  const adapter = getSelectedIntegration();
  if (adapter.id === "toggl-focus") {
    throw Object.assign(new Error("Toggl Focusは専用の実績確認ボタンから操作してください。"), { code: "integration_uses_dedicated_api" });
  }
  const result = await gatewayFetch(`/v1/integrations/${encodeURIComponent(adapter.id)}/sync`, {
    method: "POST",
    body: JSON.stringify({ direction: state.integrations.direction, dryRun: !run }),
  });
  if (!run) {
    gatewayRuntime.integrationPreviewed[adapter.id] = true;
    els.syncPreviewList.innerHTML = "";
    asJsonRecordArray(result.preview).forEach((record) => {
      const item = document.createElement("article");
      item.className = "sync-preview-card";
      const title = document.createElement("strong");
      title.textContent = String(record.title || record.content || "External record");
      const detail = document.createElement("p");
      detail.textContent = [record.action, record.reason, record.dueDate || record.startAt, record.sourceType].filter(Boolean).map(String).join(" / ");
      item.append(title, detail);
      els.syncPreviewList.appendChild(item);
    });
    els.runLiveSyncButton.disabled = false;
    renderIntegrationOnboarding();
    showToast(`${adapter.name}の実データを確認しました。`);
    return;
  }
  gatewayRuntime.integrationPreviewed[adapter.id] = false;
  els.runLiveSyncButton.disabled = true;
  showToast(`${adapter.name}: 作成 ${result.created || 0} / 更新 ${result.updated || 0} / 競合 ${result.conflicts || 0}`);
  await refreshGatewayRuntime();
}

window.addEventListener("message", async (event: MessageEvent) => {
  const frame = qa<HTMLIFrameElement>(".plugin-frame").find((item) => item.contentWindow === event.source);
  if (!frame || !event.data || typeof event.data !== "object" || event.data.type !== "questforge:plugin-request") return;
  const parsedPermissions: unknown = JSON.parse(frame.dataset.permissions || "[]");
  const permissions = Array.isArray(parsedPermissions) ? parsedPermissions.map(String) : [];
  const actions: Record<string, { permission: string; path: string }> = {
    "quests.list": { permission: "quests:read", path: "/v1/quests" },
    "character.get": { permission: "character:read", path: "/v1/character" },
    "events.list": { permission: "events:read", path: "/v1/events" },
  };
  const action = actions[String(event.data.action)];
  let payload: JsonRecord;
  try {
    if (!action || !permissions.some((permission) => permission === action.permission)) throw new Error("拡張機能に必要な権限がありません。");
    payload = { ok: true, result: await gatewayFetch(action.path) };
  } catch (error) {
    payload = { ok: false, error: (error as Error).message };
  }
  if (event.source && "postMessage" in event.source) {
    event.source.postMessage({ type: "questforge:plugin-response", requestId: event.data.requestId, ...payload }, { targetOrigin: "*" });
  }
});

function integrationResourceConfigured(adapter: IntegrationAdapter, runtime: GatewayRecord): boolean {
  const settings = asJsonRecord(runtime?.account?.settings);
  if (adapter.id === "google-calendar") return Array.isArray(settings.calendarIds) && settings.calendarIds.length > 0;
  if (adapter.id === "google-tasks") return Boolean(settings.taskListId);
  if (adapter.id === "notion") return Boolean(settings.parentPageId);
  return false;
}

function renderIntegrationOnboarding(): void {
  if (!els.integrationOnboarding) return;
  const user = globalThis.QuestForgeFirebase?.getUser?.();
  const adapter = getSelectedIntegration();
  const runtime = selectedRuntimeIntegration();
  const configurationReady = runtime.configurationStatus !== "admin_setup_required";
  const connected = runtime.status === "connected";
  const resourceConfigured = connected && integrationResourceConfigured(adapter, runtime);
  const previewed = Boolean(gatewayRuntime.integrationPreviewed?.[adapter.id]);
  const publicBetaPaused = !externalOAuthEnabled;
  const steps: Array<[AppElement, boolean]> = [
    [els.integrationStepLogin, Boolean(user)],
    [els.integrationStepConnect, publicBetaPaused ? false : Boolean(user && configurationReady && connected)],
    [els.integrationStepResource, publicBetaPaused ? false : Boolean(resourceConfigured)],
    [els.integrationStepSync, publicBetaPaused ? false : Boolean(previewed)],
  ];
  steps.forEach(([element, complete], index) => {
    if (!element) return;
    const current = !complete && (index === 0 || steps[index - 1][1]);
    element.classList.toggle("is-complete", complete);
    element.classList.toggle("is-current", current);
    element.setAttribute("aria-current", current ? "step" : "false");
  });
  if (els.integrationLoginButton) els.integrationLoginButton.hidden = Boolean(user);

  if (!user) {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.loggedOut");
  } else if (publicBetaPaused) {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.earlyAccess", { service: adapter.name });
  } else if (!configurationReady) {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.admin", { service: adapter.name });
  } else if (!connected) {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.connect", { service: adapter.name });
  } else if (!resourceConfigured) {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.resource");
  } else if (!previewed) {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.preview");
  } else {
    els.integrationOnboardingDescription.textContent = i18n.t("integration.onboarding.ready");
  }
}

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
  state.integrations.direction = selected.recommendedDirection;
  els.syncDirectionSelect.value = selected.recommendedDirection;
  els.syncDirectionSelect.disabled = true;

  els.integrationHubGrid.innerHTML = "";
  integrationAdapters.forEach((adapter) => {
    const runtimeAdapter = gatewayRuntime.integrations?.find((item) => item.id === adapter.id);
    const runtimeStatus = runtimeAdapter?.status || adapter.status;
    const displayStatus = !externalOAuthEnabled
      ? "public_beta"
      : runtimeAdapter?.configurationStatus === "admin_setup_required"
      ? "admin_setup_required"
      : runtimeStatus;
    const card = document.createElement("article");
    card.className = "integration-service-card";
    card.classList.toggle("active", adapter.id === selected.id);
    card.innerHTML = `
      <div class="integration-service-top">
        <span class="service-mark">${adapter.shortName}</span>
        <span class="status-pill ${displayStatus}">${integrationStatusLabel(displayStatus)}</span>
      </div>
      <strong>${adapter.name}</strong>
      <p>${localizedIntegrationField(adapter, "description")}</p>
      <div class="service-meta">
        <span>${localizedIntegrationField(adapter, "type")}</span>
        <span>${adapter.auth}</span>
      </div>
      <button type="button">${i18n.t(adapter.id === selected.id ? "integration.selected" : "integration.select")}</button>
    `;
    card.querySelector<HTMLButtonElement>("button")?.addEventListener("click", () => {
      state.integrations.selectedService = adapter.id;
      state.integrations.direction = adapter.recommendedDirection;
      render();
    });
    els.integrationHubGrid.appendChild(card);
  });

  renderSyncRuleSummary(selected);
  renderSyncPreview(selected);
  renderSyncLogs();
  renderIntegrationResourcePanel(selected);
  renderIntegrationOnboarding();
}

function integrationStatusLabel(status: string): string {
  const translated = i18n.t(`integration.status.${status}`);
  return translated === `integration.status.${status}` ? status : translated;
}

function localizedIntegrationField(adapter: IntegrationAdapter, field: string): string {
  const translated = i18n.t(`service.${adapter.id}.${field}`);
  return translated === `service.${adapter.id}.${field}` ? String((adapter as unknown as JsonRecord)[field] || "") : translated;
}

function selectedRuntimeIntegration(): GatewayIntegration {
  const selected = getSelectedIntegration();
  return gatewayRuntime.integrations?.find((item) => item.id === selected.id) || { id: selected.id, status: selected.status };
}

async function loadIntegrationResources(service: string): Promise<JsonRecord[]> {
  const result = await gatewayFetch(`/v1/integrations/${encodeURIComponent(service)}/resources`);
  const resources = asJsonRecordArray(result.resources);
  gatewayRuntime.integrationResources[service] = resources;
  renderIntegrationResourcePanel(getSelectedIntegration());
  return resources;
}

function renderIntegrationResourcePanel(adapter: IntegrationAdapter): void {
  if (!els.integrationResourcePanel) return;
  const runtime = selectedRuntimeIntegration();
  const runtimeSettings = asJsonRecord(runtime.account?.settings);
  const connected = runtime.status === "connected";
  const isFocus = adapter.id === "toggl-focus";
  const supported = ["google-calendar", "google-tasks", "notion", "toggl-focus"].includes(adapter.id);
  const user = globalThis.QuestForgeFirebase?.getUser?.();
  const configurationReady = runtime.configurationStatus !== "admin_setup_required";
  const publicBetaPaused = !externalOAuthEnabled;
  els.connectIntegrationButton.hidden = connected || !supported || runtime.status === "planned";
  els.connectIntegrationButton.disabled = publicBetaPaused || !user || !configurationReady;
  els.connectIntegrationButton.textContent = publicBetaPaused ? i18n.t("integration.status.public_beta") : i18n.t(runtime.status === "reconnect_required" ? "integration.reconnect" : "integration.connect");
  els.disconnectIntegrationButton.hidden = !connected && runtime.status !== "reconnect_required";
  els.disconnectIntegrationButton.disabled = publicBetaPaused;
  els.previewLiveSyncButton.disabled = publicBetaPaused || !connected || isFocus;
  els.runLiveSyncButton.disabled = true;
  els.integrationResourcePanel.hidden = !connected;
  const autoSyncLabel = els.integrationAutoSync.closest("label");
  if (autoSyncLabel) autoSyncLabel.hidden = isFocus;
  if (els.integrationSetupMessage) {
    els.integrationSetupMessage.className = "integration-setup-message";
    if (publicBetaPaused) {
      els.integrationSetupMessage.className = "integration-setup-message is-warning";
      els.integrationSetupMessage.textContent = i18n.t("integration.setup.earlyAccess");
    } else if (!user) {
      els.integrationSetupMessage.textContent = i18n.t("integration.setup.loggedOut");
    } else if (!configurationReady) {
      els.integrationSetupMessage.className = "integration-setup-message is-warning";
      els.integrationSetupMessage.textContent = i18n.t("integration.setup.admin");
    } else if (!connected) {
      els.integrationSetupMessage.textContent = i18n.t("integration.setup.connect");
    } else if (isFocus && !(runtimeSettings.organizationId && runtimeSettings.workspaceId)) {
      els.integrationSetupMessage.textContent = "Focusの組織IDとWorkspace IDを入力して設定を保存してください。";
    } else {
      els.integrationSetupMessage.textContent = i18n.t("integration.setup.ready");
    }
  }
  if (!connected) return;

  els.integrationAccountLabel.textContent = String(runtime.account?.providerAccountName || i18n.t("integration.connectedAccount"));
  els.integrationAutoSync.checked = Boolean(runtimeSettings.autoSync);
  els.integrationResourceList.innerHTML = "";
  if (isFocus) {
    els.integrationResourceTitle.textContent = "Toggl Focusの接続先";
    const settings = runtimeSettings;
    const makeField = (label: string, key: string, placeholder: string, optional = false): HTMLLabelElement => {
      const field = document.createElement("label");
      field.className = "focus-config-field";
      const caption = document.createElement("span");
      caption.textContent = optional ? `${label}（任意）` : label;
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.pattern = "\\d*";
      input.dataset.focusSetting = key;
      input.value = String(settings[key] || "");
      input.placeholder = placeholder;
      field.append(caption, input);
      return field;
    };
    els.integrationResourceList.append(
      makeField("組織ID", "organizationId", "例: 123456"),
      makeField("Workspace ID", "workspaceId", "例: 654321"),
      makeField("Project ID", "projectId", "未指定ならFocusのInbox", true),
    );
    const automatic = document.createElement("label");
    automatic.className = "integration-auto-sync";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.focusSetting = "autoCreateTasks";
    checkbox.checked = Boolean(settings.autoCreateTasks);
    const copy = document.createElement("span");
    copy.textContent = "新しいTo Doと日課をFocusタスクにも自動作成する";
    automatic.append(checkbox, copy);
    els.integrationResourceList.appendChild(automatic);
    const note = document.createElement("p");
    note.className = "focus-privacy-note";
    note.textContent = "Focusのデスクトップ自動計測ルールやアプリ名・ウィンドウ名はGuilduoへ保存しません。";
    els.integrationResourceList.appendChild(note);
    return;
  }
  const resources = asJsonRecordArray(gatewayRuntime.integrationResources[adapter.id]);
  if (!resources.length) {
    const load = document.createElement("button");
    load.type = "button";
    load.className = "secondary-button";
    load.textContent = i18n.t("integration.loadResources");
    load.addEventListener("click", () => {
      load.disabled = true;
      loadIntegrationResources(adapter.id).catch((error) => showToast(describeIntegrationError(error), { duration: 6000 })).finally(() => { load.disabled = false; });
    });
    els.integrationResourceList.appendChild(load);
    return;
  }

  els.integrationResourceTitle.textContent = adapter.id === "google-calendar" ? "表示するカレンダー" : adapter.id === "google-tasks" ? "同期するTasksリスト" : "Guilduo Logsを作る親ページ";
  resources.forEach((resource) => {
    const label = document.createElement("label");
    label.className = "integration-resource-option";
    const input = document.createElement("input");
    input.type = adapter.id === "google-calendar" ? "checkbox" : "radio";
    input.name = `integration-resource-${adapter.id}`;
    input.value = String(resource.id || "");
    const settings = runtimeSettings;
    const calendarIds = Array.isArray(settings.calendarIds) ? settings.calendarIds.map(String) : [];
    input.checked = adapter.id === "google-calendar" ? calendarIds.includes(String(resource.id || "")) : adapter.id === "google-tasks" ? settings.taskListId === resource.id : settings.parentPageId === resource.id;
    const text = document.createElement("span");
    text.textContent = String(resource.name || "");
    label.append(input, text);
    els.integrationResourceList.appendChild(label);
  });
}

async function connectSelectedIntegration(): Promise<void> {
  if (!externalOAuthEnabled) throw new Error("外部サービス連携は公開βでは準備中です。");
  if (!globalThis.QuestForgeFirebase?.getUser?.()) throw new Error("先にGuilduoへGoogleログインしてください。");
  const adapter = getSelectedIntegration();
  if (adapter.id === "toggl-focus") {
    openTogglFocusConnectDialog();
    return;
  }
  const result = await gatewayFetch(`/v1/integrations/${encodeURIComponent(adapter.id)}/connect`, { method: "POST" });
  window.location.assign(String(result.authorizationUrl || ""));
}

function openTogglFocusConnectDialog(): void {
  if (!els.togglFocusConnectDialog) return;
  els.togglFocusConnectMessage.textContent = "";
  els.togglFocusApiKey.value = "";
  if (typeof els.togglFocusConnectDialog.showModal === "function") els.togglFocusConnectDialog.showModal();
  else els.togglFocusConnectDialog.setAttribute("open", "");
  window.setTimeout(() => els.togglFocusApiKey.focus(), 0);
}

function closeTogglFocusConnectDialog(): void {
  els.togglFocusApiKey.value = "";
  if (typeof els.togglFocusConnectDialog.close === "function") els.togglFocusConnectDialog.close();
  else els.togglFocusConnectDialog.removeAttribute("open");
}

async function disconnectSelectedIntegration(): Promise<void> {
  if (!externalOAuthEnabled) {
    showToast("外部サービス連携は公開βでは準備中です。", { duration: 6000 });
    return;
  }
  const adapter = getSelectedIntegration();
  if (!window.confirm(`${adapter.name}との接続を解除しますか？Questは削除されません。`)) return;
  await gatewayFetch(`/v1/integrations/${encodeURIComponent(adapter.id)}/disconnect`, { method: "POST" });
  delete gatewayRuntime.integrationResources[adapter.id];
  await refreshGatewayRuntime();
  showToast(`${adapter.name}の接続を解除しました。`);
}

async function saveSelectedIntegrationSettings(): Promise<void> {
  if (!externalOAuthEnabled) {
    showToast("外部サービス連携は公開βでは準備中です。", { duration: 6000 });
    return;
  }
  const adapter = getSelectedIntegration();
  const selected = Array.from(els.integrationResourceList.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => input.value);
  const body: JsonRecord = adapter.id === "toggl-focus" ? {} : { autoSync: els.integrationAutoSync.checked };
  if (adapter.id === "google-calendar") body.calendarIds = selected;
  if (adapter.id === "google-tasks") body.taskListId = selected[0] || "";
  if (adapter.id === "notion") { body.parentPageId = selected[0] || ""; body.createDatabase = true; }
  if (adapter.id === "toggl-focus") {
    els.integrationResourceList.querySelectorAll<HTMLInputElement>("[data-focus-setting]").forEach((input) => {
      const key = input.dataset.focusSetting;
      if (key) body[key] = input.type === "checkbox" ? input.checked : input.value.trim();
    });
  }
  const result = await gatewayFetch(`/v1/integrations/${encodeURIComponent(adapter.id)}`, { method: "PATCH", body: JSON.stringify(body) });
  const index = gatewayRuntime.integrations.findIndex((item) => item.id === adapter.id);
  if (index >= 0) {
    const account = asJsonRecord(result.account) as GatewayRecord;
    gatewayRuntime.integrations[index] = { ...gatewayRuntime.integrations[index], account, status: String(account.status || "connected") };
  }
  gatewayRuntime.integrationPreviewed[adapter.id] = false;
  renderIntegrationHub();
  showToast(adapter.id === "notion" ? "Guilduo Logsを準備しました。" : adapter.id === "toggl-focus" ? "Toggl Focusの接続先を保存しました。" : "同期設定を保存しました。");
}

function renderSyncRuleSummary(adapter: IntegrationAdapter): void {
  els.syncRuleSummary.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "sync-rule-heading";
  heading.innerHTML = `
    <span>${adapter.scope}</span>
    <strong>${adapter.name} / ${i18n.t("integration.recommended", { direction: i18n.t(`integration.direction.${adapter.recommendedDirection}`) })}</strong>
  `;
  els.syncRuleSummary.appendChild(heading);
  adapter.rules.forEach((rule, index) => {
    const item = document.createElement("div");
    item.className = "sync-rule-row";
    const translated = i18n.t(`service.${adapter.id}.rule${index + 1}`);
    item.textContent = translated === `service.${adapter.id}.rule${index + 1}` ? rule : translated;
    els.syncRuleSummary.appendChild(item);
  });
}

function renderSyncPreview(adapter: IntegrationAdapter): void {
  els.syncPreviewList.innerHTML = "";
  if (adapter.id === "toggl-focus") {
    const runtime = gatewayRuntime.integrations?.find((item) => item.id === adapter.id);
    const controls = document.createElement("div");
    controls.className = "focus-entry-controls";
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.className = "secondary-button";
    inspect.textContent = "30日分の実績を確認";
    inspect.disabled = runtime?.status !== "connected";
    inspect.addEventListener("click", async () => {
      inspect.disabled = true;
      try {
        const preview = await gatewayFetch("/v1/integrations/toggl-focus/attributions", { method: "POST", body: JSON.stringify({ dryRun: true, days: 30 }) });
        renderTogglFocusAttributionPreview(preview);
      } catch (error) {
        showToast(describeIntegrationError(error), { duration: 6000 });
      } finally { inspect.disabled = false; }
    });
    controls.appendChild(inspect);
    els.syncPreviewList.appendChild(controls);
    const message = document.createElement("div");
    message.className = "empty-sync-log";
    message.textContent = runtime?.status === "connected"
      ? "Focusタスクに直接ひもづく実績は、一括確認後に取り込めます。未ひもづけの記録は候補として残ります。"
      : "まずToggl Focusを接続してください。";
    els.syncPreviewList.appendChild(message);
    return;
  }
  const empty = document.createElement("div");
  empty.className = "empty-sync-log";
  const runtime = gatewayRuntime.integrations?.find((item) => item.id === adapter.id);
  empty.textContent = i18n.t(runtime?.status === "connected" ? "integration.preview.connected" : runtime?.status === "planned" ? "integration.preview.planned" : "integration.preview.disconnected");
  els.syncPreviewList.appendChild(empty);
}

function renderTogglFocusAttributionPreview(preview: JsonRecord): void {
  els.syncPreviewList.innerHTML = "";
  const candidates = asJsonRecordArray(preview.candidates);
  const ready = candidates.filter((candidate) => candidate.status === "ready");
  const heading = document.createElement("div");
  heading.className = "sync-rule-heading";
  const range = document.createElement("span");
  range.textContent = `${preview.dateFrom} - ${preview.dateTo}`;
  const headingTitle = document.createElement("strong");
  headingTitle.textContent = `取り込み候補 ${ready.length} 件`;
  heading.append(range, headingTitle);
  els.syncPreviewList.appendChild(heading);
  if (ready.length) {
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "primary-button";
    apply.textContent = "直接ひもづく実績を取り込む";
    apply.addEventListener("click", async () => {
      if (!window.confirm(`${ready.length}件のFocus実績をGuilduoへ取り込みますか？`)) return;
      apply.disabled = true;
      try {
        const result = await gatewayFetch("/v1/integrations/toggl-focus/attributions", { method: "POST", body: JSON.stringify({ dryRun: false, days: 30 }) });
        showToast(`${result.count || 0}件のFocus実績を取り込みました。`);
        render();
      } catch (error) {
        showToast(describeIntegrationError(error), { duration: 6000 });
      } finally { apply.disabled = false; }
    });
    els.syncPreviewList.appendChild(apply);
  }
  candidates.forEach((candidate) => {
    const item = document.createElement("article");
    item.className = "sync-preview-card";
    const entry = asJsonRecord(candidate.entry);
    const title = document.createElement("strong");
    title.textContent = String(entry.taskName || entry.description || "名前のないFocus記録");
    const details = document.createElement("p");
    details.textContent = `${entry.durationMinutes || 0}分 / ${candidate.questTitle || "未ひもづけ"}`;
    const footer = document.createElement("footer");
    const origin = document.createElement("span");
    origin.textContent = candidate.mode === "direct" ? "Focusタスクから自動候補" : "確認が必要な候補";
    const status = document.createElement("span");
    status.textContent = String(candidate.status || "");
    footer.append(origin, status);
    item.append(title, details, footer);
    if (candidate.status === "unlinked") {
      const assignment = document.createElement("div");
      assignment.className = "focus-entry-assignment";
      const select = document.createElement("select");
      select.appendChild(new Option("割り当てるQuestを選ぶ", ""));
      state.tasks
        .filter((task) => ["todo", "daily"].includes(task.kind) && task.lifecycleState !== "archived")
        .sort((left, right) => i18n?.compareText?.(left.title, right.title) ?? left.title.localeCompare(right.title))
        .forEach((task) => select.appendChild(new Option(task.title, task.id)));
      const assign = document.createElement("button");
      assign.type = "button";
      assign.className = "secondary-button";
      assign.textContent = "このQuestへ割り当て";
      assign.disabled = state.tasks.every((task) => !["todo", "daily"].includes(task.kind) || task.lifecycleState === "archived");
      assign.addEventListener("click", async () => {
        if (!select.value) {
          showToast("割り当てるQuestを選んでください。");
          return;
        }
        const selectedQuest = state.tasks.find((task) => task.id === select.value);
        if (!window.confirm(`Focus実績 ${entry.durationMinutes || 0}分を「${selectedQuest?.title || "このQuest"}」へ取り込みますか？`)) return;
        assign.disabled = true;
        try {
          const result = await gatewayFetch("/v1/integrations/toggl-focus/attributions", {
            method: "POST",
            body: JSON.stringify({ dryRun: false, days: 30, questId: select.value, entryIds: [entry.id] }),
          });
          showToast(`${result.count || 0}件のFocus実績を取り込みました。`);
          render();
        } catch (error) {
          showToast(describeIntegrationError(error), { duration: 6000 });
        } finally { assign.disabled = false; }
      });
      assignment.append(select, assign);
      item.appendChild(assignment);
    }
    els.syncPreviewList.appendChild(item);
  });
}

function renderSyncLogs(): void {
  els.syncLogList.innerHTML = "";
  const logs = state.syncEvents || [];
  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-sync-log";
    empty.textContent = i18n.t("integration.logEmpty");
    els.syncLogList.appendChild(empty);
    return;
  }
  logs.forEach((log) => {
    const adapter = integrationAdapters.find((item) => item.id === log.service);
    const item = document.createElement("article");
    item.className = "sync-log-card";
    item.innerHTML = `
      <span>${formatLogTime(String(log.at || ""))} / ${adapter?.name || String(log.service || "")}</span>
      <strong>${i18n.t(`integration.direction.${String(log.direction || "")}`) || syncDirectionLabels[String(log.direction || "")] || String(log.direction || "")}</strong>
      <p>作成 ${log.created} / 更新 ${log.updated} / スキップ ${log.skipped}</p>
    `;
    els.syncLogList.appendChild(item);
  });
}

function mergeTags(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))].slice(0, 8);
}

function buildPartyFormationViewModel(): PartyFormationViewModel {
  const authUser = globalThis.QuestForgeFirebase?.getUser?.() as { displayName?: string; photoURL?: string } | null;
  const profile = gatewayRuntime.profile;
  const humanName = String(profile?.displayName || authUser?.displayName || "あなた");
  const humanLevel = Number(profile?.level);
  const humanMetrics = Number.isFinite(humanLevel) && humanLevel > 0
    ? [{ label: "LEVEL", value: String(humanLevel), tone: "human" as const }]
    : [];
  const astraQuest = state.tasks.find((task) => task.assignee?.type === "self" || task.assignee?.label === state.character.name);
  const astraRole = getRole(state.character.role);
  const connected = Boolean(authUser);
  return {
    title: "作戦編成",
    subtitle: "Human・Astra・登録済みAgentを、既存データから一時的に配置します。",
    connectionLabel: gatewayRuntime.status === "online" ? "Gateway / online" : connected ? "Account / signed in" : "Local state only",
    members: [
      {
        id: "human",
        name: humanName,
        identity: "human",
        identityLabel: "HUMAN / PLAYER",
        role: "Commander",
        avatarSrc: String(profile?.avatarUrl || authUser?.photoURL || "") || undefined,
        state: connected ? "ready" : "blocked",
        stateLabel: connected ? i18n.t("task.handoffStates.ready") : i18n.t("social.loginRequired"),
        metrics: humanMetrics,
      },
      {
        id: "astra",
        name: state.character.name,
        identity: "astra",
        identityLabel: "ASTRA / COMPANION",
        role: astraRole.name,
        avatarSrc: getAvatarSrc(state.character.role, state.character.variant),
        state: "ready",
        stateLabel: i18n.t("task.handoffStates.ready"),
        currentQuest: astraQuest?.title,
        metrics: [
          { label: "HP", value: `${state.character.hp} / ${state.character.maxHp}`, tone: "human" },
          { label: "MP", value: `${state.battle.mp} / ${state.battle.maxMp}`, tone: "rpg" },
          { label: "LEVEL", value: String(state.character.level), tone: "rpg" },
        ],
        capabilities: [astraRole.name],
      },
    ],
    socialMemberCount: gatewayRuntime.party?.members?.length || 0,
    registeredAgentCount: 0,
    emptyAgentCopy: "登録済みAgentの正規データが見つかると、割当Quest・Queue・Handoff Load・Capabilityを表示します。",
  };
}

function disposePartyFormationIsland(): void {
  partyFormationIslandHandle?.unmount();
  partyFormationIslandHandle = null;
  const host = document.querySelector<HTMLElement>("#partyFormationIsland");
  if (host) host.replaceChildren();
}

async function renderPartyFormationIsland(): Promise<void> {
  const host = document.querySelector<HTMLElement>("#partyFormationIsland");
  if (!host || activeViewId !== "party") return;
  const model = buildPartyFormationViewModel();
  partyFormationIslandModule ||= import("./ui/islands/PartyFormation.tsx");
  const { partyFormationIsland } = await partyFormationIslandModule;
  if (activeViewId !== "party" || !host.isConnected) return;
  if (partyFormationIslandHandle) partyFormationIslandHandle.update(model);
  else partyFormationIslandHandle = partyFormationIsland.mount(host, model, {
    onOpenAgentRegistry: () => { window.location.href = "./interaction-lab/#settings"; },
  });
}

function renderParty(): void {
  if (!els.partyGrid) return;
  const user = globalThis.QuestForgeFirebase?.getUser?.();
  const profile = gatewayRuntime.profile;
  const party = gatewayRuntime.party;
  const connected = Boolean(user);
  els.socialConnectionStatus.textContent = connected
    ? profile ? i18n.t("status.connected") : i18n.t("status.profileMissing")
    : i18n.t("social.loginRequired");
  els.socialAuthMessage.textContent = !connected
    ? i18n.t("social.authCopy")
    : gatewayRuntime.socialError || (profile ? "@handleは完全一致で検索されます。公開範囲はこの画面の項目だけです。" : "まず公開プロフィールを保存してください。");
  els.profileForm.querySelectorAll<AppElement>("input, textarea, button").forEach((control) => { control.disabled = !connected; });
  if (!els.profileForm.contains(document.activeElement)) {
    els.profileDisplayName.value = profile?.displayName || user?.displayName || state.character.name || "";
    els.profileHandle.value = profile?.handle?.replace(/^@/, "") || "";
    els.profileBio.value = profile?.bio || "";
  }
  els.publicHandle.textContent = String(profile?.handle || (connected ? i18n.t("account.handleMissing") : i18n.t("account.loggedOut")));

  renderFriendRequests();
  renderFriendList();
  renderFriendSearchResult();
  els.partyGrid.innerHTML = "";
  els.partyCreateForm.hidden = Boolean(party) || !connected || !profile;
  els.partyAcceptForm.hidden = Boolean(party) || !connected || !profile;
  els.leavePartyButton.hidden = !party;
  els.partyInviteForm.hidden = !party || party.ownerUid !== user?.uid;
  els.partyHeading.textContent = party ? `${party.name || ""} (${party.members?.length || 0}/${party.maxMembers || 0})` : i18n.t("party.createTitle");
  (party?.members || []).forEach((member) => {
    const card = document.createElement("article");
    card.className = "party-card";
    const avatar = document.createElement("div");
    avatar.className = "party-mini";
    avatar.textContent = String(member.displayName || "").slice(0, 2);
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = String(member.displayName || "");
    const meta = document.createElement("p");
    meta.textContent = `${member.handle} / ${member.role === "owner" ? "オーナー" : "メンバー"} / Lv.${member.level}`;
    copy.append(name, meta);
    card.append(avatar, copy);
    if (party && user && party.ownerUid === user.uid && member.uid && member.uid !== user.uid) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button";
      remove.textContent = i18n.t("common.remove");
      remove.addEventListener("click", () => removeSocialPartyMember(member.uid || ""));
      card.appendChild(remove);
    }
    els.partyGrid.appendChild(card);
  });
  populateTaskAssigneeOptions();
  void renderPartyFormationIsland().catch(() => {
    const host = document.querySelector<HTMLElement>("#partyFormationIsland");
    if (host) host.dataset.islandLoad = "error";
  });
}

function socialPersonCopy(person: GatewayRecord, suffix = ""): HTMLDivElement {
  const copy = document.createElement("div");
  copy.className = "social-person-copy";
  const name = document.createElement("strong");
  name.textContent = String(person.displayName || "");
  const meta = document.createElement("span");
  meta.textContent = `${person.handle || ""}${suffix ? ` / ${suffix}` : ""}`;
  copy.append(name, meta);
  return copy;
}

function renderFriendRequests() {
  if (!els.friendRequestList) return;
  els.friendRequestList.innerHTML = "";
  const requests = gatewayRuntime.friendRequests || [];
  if (!requests.length) {
    els.friendRequestList.textContent = i18n.t("empty.requests");
    return;
  }
  requests.forEach((request) => {
    const row = document.createElement("div");
    row.className = "social-list-item";
    const requestProfile = request.profile || {};
    row.appendChild(socialPersonCopy(requestProfile, request.direction === "incoming" ? "受信" : "送信済み"));
    if (request.direction === "incoming") {
      const actions = document.createElement("div");
      actions.className = "social-actions";
      for (const [decision, label] of [["accept", "承認"], ["decline", "拒否"]] as Array<[string, string]>) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = decision === "accept" ? "primary-button" : "secondary-button";
        button.textContent = i18n.t(decision === "accept" ? "common.accept" : "common.decline");
        button.addEventListener("click", () => respondToFriendRequest(request.id || "", decision));
        actions.appendChild(button);
      }
      row.appendChild(actions);
    }
    els.friendRequestList.appendChild(row);
  });
}

function renderFriendList() {
  if (!els.friendList) return;
  els.friendList.innerHTML = "";
  const friends = gatewayRuntime.friends || [];
  if (!friends.length) {
    els.friendList.textContent = i18n.t("empty.friends");
    return;
  }
  friends.forEach((friend) => {
    const row = document.createElement("div");
    row.className = "social-list-item";
    row.appendChild(socialPersonCopy(friend, `Lv.${friend.level}`));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = i18n.t("common.remove");
    remove.addEventListener("click", () => removeSocialFriend(friend.uid || ""));
    row.appendChild(remove);
    els.friendList.appendChild(row);
  });
}

function renderFriendSearchResult() {
  if (!els.friendSearchResult) return;
  els.friendSearchResult.innerHTML = "";
  const person = gatewayRuntime.friendSearchResult;
  if (!person) return;
  const row = document.createElement("div");
  row.className = "social-search-card";
  row.appendChild(socialPersonCopy(person, `Lv.${person.level}`));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-button";
  button.textContent = "友達申請";
  button.disabled = (gatewayRuntime.friends || []).some((friend) => friend.uid === person.uid);
  button.addEventListener("click", () => sendSocialFriendRequest(person.uid || ""));
  row.appendChild(button);
  els.friendSearchResult.appendChild(row);
}

async function refreshSocialRuntime(): Promise<void> {
  const user = globalThis.QuestForgeFirebase?.getUser?.();
  if (!user) {
    Object.assign(gatewayRuntime, { profile: null, friends: [], friendRequests: [], party: null, friendSearchResult: null, socialError: "" });
    if (activeViewId === "party") renderParty();
    return;
  }
  try {
    const [profile, friends, requests, party] = await Promise.all([
      gatewayFetch("/v1/profile"),
      gatewayFetch("/v1/friends"),
      gatewayFetch("/v1/friend-requests"),
      gatewayFetch("/v1/party"),
    ]);
    gatewayRuntime.profile = profile.profile ? asJsonRecord(profile.profile) as GatewayRecord : null;
    gatewayRuntime.friends = Array.isArray(friends.friends) ? friends.friends.map((entry) => asJsonRecord(entry) as GatewayRecord) : [];
    gatewayRuntime.friendRequests = Array.isArray(requests.requests) ? requests.requests.map((entry) => asJsonRecord(entry) as GatewayRecord) : [];
    gatewayRuntime.party = party.party ? asJsonRecord(party.party) as GatewayRecord & { members?: GatewayRecord[] } : null;
    gatewayRuntime.socialError = "";
  } catch (error) {
    gatewayRuntime.socialError = `仲間機能へ接続できません: ${(error as Error).message}`;
  }
  if (activeViewId === "party") renderParty();
}

async function respondToFriendRequest(requestId: string, decision: string): Promise<void> {
  await gatewayFetch(`/v1/friend-requests/${encodeURIComponent(requestId)}/${decision}`, { method: "POST" });
  await refreshSocialRuntime();
}

async function sendSocialFriendRequest(receiverUid: string): Promise<void> {
  await gatewayFetch("/v1/friend-requests", { method: "POST", body: JSON.stringify({ receiverUid }) });
  gatewayRuntime.friendSearchResult = null;
  await refreshSocialRuntime();
  showToast("友達申請を送りました。");
}

async function removeSocialFriend(friendUid: string): Promise<void> {
  if (!window.confirm("この友達との接続を解除しますか？")) return;
  await gatewayFetch(`/v1/friends/${encodeURIComponent(friendUid)}`, { method: "DELETE" });
  await refreshSocialRuntime();
}

async function removeSocialPartyMember(memberUid: string): Promise<void> {
  if (!window.confirm("このメンバーをパーティから外しますか？")) return;
  await gatewayFetch(`/v1/party/members/${encodeURIComponent(memberUid)}`, { method: "DELETE" });
  await refreshSocialRuntime();
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

function flashTask(taskId: string): void {
  const card = q(`[data-task-id="${taskId}"]`);
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

function showToast(message: string, options: ToastOptions = {}): void {
  if (undoToastTimer !== null) window.clearTimeout(undoToastTimer);
  els.undoToastMessage.textContent = message;
  toastActionHandler = typeof options.onAction === "function" ? options.onAction : null;
  els.toastActionButton.hidden = !toastActionHandler;
  if (toastActionHandler) {
    els.toastActionButton.textContent = options.actionLabel || "実行";
  }
  els.undoToast.hidden = false;
  const duration = options.duration || (toastActionHandler ? 15000 : 8000);
  undoToastTimer = window.setTimeout(hideToast, duration);
}

function hideToast(): void {
  if (undoToastTimer !== null) window.clearTimeout(undoToastTimer);
  els.undoToast.hidden = true;
  els.toastActionButton.hidden = true;
  toastActionHandler = null;
}

function toggleMobileMenu(force?: boolean): void {
  const shouldOpen = typeof force === "boolean"
    ? force
    : !els.sidebar.classList.contains("mobile-open");
  els.sidebar.classList.toggle("mobile-open", shouldOpen);
  els.mobileMenuButton.setAttribute("aria-expanded", String(shouldOpen));
  els.mobileMenuButton.setAttribute("aria-label", i18n.t(shouldOpen ? "nav.closeMenu" : "nav.openMenu"));
}

qa<AppElement>("[data-add-kind]").forEach((button) => {
  button.addEventListener("click", () => {
    openTaskDialog({ kind: button.dataset.addKind as Quest["kind"] });
  });
});

q("#newTaskButton").addEventListener("click", () => {
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
    : addTask(values.kind, values.title, values.notes, values.dueDate, values.difficulty, values.repeat, values.tags, values.assignee, values.parentQuestId, values.handoff);
  if (!task) {
    els.taskTitle.focus();
    return;
  }
  closeTaskDialog();
  requestAnimationFrame(() => {
    q(`[data-task-id="${task.id}"]`).scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
});

els.archiveTaskButton.addEventListener("click", () => {
  const taskId = els.editingTaskId.value;
  if (!taskId) return;
  const archived = archiveTask(taskId);
  if (!archived) return;
  closeTaskDialog();
  showToast(`「${archived.title}」を保管しました。`, {
    actionLabel: "未完了に戻す",
    onAction: () => restoreArchivedTask(archived.id),
  });
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
    state.taskFilter = button.dataset.taskFilter || "all";
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
  button.addEventListener("click", () => useBattleCommand(button.dataset.battleCommand || ""));
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

els.integrationLoginButton?.addEventListener("click", () => {
  q("#syncSignInButton").click();
});

els.connectIntegrationButton.addEventListener("click", () => {
  connectSelectedIntegration().catch((error) => showToast(describeIntegrationError(error), { duration: 6000 }));
});

els.disconnectIntegrationButton.addEventListener("click", () => {
  disconnectSelectedIntegration().catch((error) => showToast(describeIntegrationError(error), { duration: 6000 }));
});

els.cancelTogglFocusConnect?.addEventListener("click", closeTogglFocusConnectDialog);
els.cancelTogglFocusConnectButton?.addEventListener("click", closeTogglFocusConnectDialog);
els.togglFocusConnectForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = els.togglFocusApiKey.value.trim();
  if (!apiKey) return;
  els.saveTogglFocusConnect.disabled = true;
  els.togglFocusConnectMessage.textContent = "接続を確認しています。";
  try {
    await gatewayFetch("/v1/integrations/toggl-focus/connect", { method: "POST", body: JSON.stringify({ apiKey }) });
    closeTogglFocusConnectDialog();
    await refreshGatewayRuntime();
    showToast("Toggl Focusを接続しました。次に組織IDとWorkspace IDを設定してください。");
  } catch (error) {
    els.togglFocusConnectMessage.textContent = describeIntegrationError(error);
  } finally {
    els.togglFocusApiKey.value = "";
    els.saveTogglFocusConnect.disabled = false;
  }
});

els.saveIntegrationSettingsButton.addEventListener("click", () => {
  saveSelectedIntegrationSettings().catch((error) => showToast(describeIntegrationError(error), { duration: 6000 }));
});

els.refreshCalendarAgendaButton.addEventListener("click", async () => {
  els.refreshCalendarAgendaButton.disabled = true;
  try {
    await refreshCalendarSchedule();
    showToast("保存済みの予定表示を更新しました。外部同期は連携画面でプレビュー後に実行できます。");
  } catch (error) {
    showToast(describeIntegrationError(error), { duration: 6000 });
  } finally { els.refreshCalendarAgendaButton.disabled = false; }
});

els.previewLiveSyncButton.addEventListener("click", () => {
  previewLiveIntegration(false).catch((error) => showToast(describeIntegrationError(error), { duration: 6000 }));
});

els.runLiveSyncButton.addEventListener("click", () => {
  previewLiveIntegration(true).catch((error) => showToast(describeIntegrationError(error), { duration: 6000 }));
});

async function copyMcpEndpoint() {
  const endpoint = `${getGatewayUrl()}/mcp`;
  try {
    await navigator.clipboard.writeText(endpoint);
  } catch {
    els.mcpEndpointInput?.select();
    document.execCommand("copy");
  }
  if (els.mcpConnectionNote) els.mcpConnectionNote.textContent = "MCP URLをコピーしました。AI側のMCPまたはコネクタ設定へ貼り付けてください。";
  showToast("MCP URLをコピーしました");
}

els.copyMcpUrlButton?.addEventListener("click", copyMcpEndpoint);
els.mcpEndpointInput?.addEventListener("click", () => els.mcpEndpointInput.select());
els.checkMcpConnectionButton?.addEventListener("click", async () => {
  if (els.mcpConnectionNote) els.mcpConnectionNote.textContent = "接続を確認しています。";
  await refreshGatewayRuntime();
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
    const webhook = asJsonRecord(result.webhook) as GatewayRecord;
    gatewayRuntime.webhooks = [webhook, ...(gatewayRuntime.webhooks || [])];
    els.webhookUrlInput.value = "";
    renderRuntimeWebhooks();
    showToast(`Webhookを登録しました。署名Secret: ${String(webhook.secret || "")}`, { duration: 12000 });
  } catch (error) {
    showToast((error as Error).message, { duration: 6000 });
  }
});

els.installPluginButton.addEventListener("click", async () => {
  try {
    const manifest = JSON.parse(els.pluginManifestInput.value);
    const result = await gatewayFetch("/v1/plugins", { method: "POST", body: JSON.stringify(manifest) });
    const plugin = asJsonRecord(result.plugin) as GatewayRecord;
    gatewayRuntime.plugins = [plugin, ...(gatewayRuntime.plugins || []).filter((entry) => entry.id !== plugin.id)];
    renderRuntimePlugins();
    showToast(`${String(asJsonRecord(plugin.manifest).name || "拡張機能")}をsandboxへインストールしました。`);
  } catch (error) {
    showToast(error instanceof SyntaxError ? "Manifest JSONを確認してください。" : (error as Error).message, { duration: 6000 });
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
    state.theme = button.dataset.themeOption || "soft";
    render();
    playInteractionCue("theme");
  });
});

els.appearanceButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setAppearanceMenuOpen(Boolean(els.appearanceMenu.hidden));
});

els.appearanceOptions.forEach((button) => {
  button.addEventListener("click", () => {
    setAppearanceMode(button.dataset.appearanceOption);
    playInteractionCue("theme");
  });
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Node ? event.target : null;
  if (!els.appearanceControl?.contains(target)) setAppearanceMenuOpen(false);
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

els.telemetryConsentToggle?.addEventListener("change", () => {
  globalThis.QuestForgeTelemetry?.setConsent?.(els.telemetryConsentToggle.checked ? "granted" : "denied");
  renderFeedbackSettings();
});

window.addEventListener("questforge:telemetry-consent-changed", () => renderFeedbackSettings());
window.addEventListener("questforge:telemetry-ready", () => renderFeedbackSettings());

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

function getFormValues(): TaskFormValues {
  return {
    kind: els.taskKind.value as Quest["kind"],
    title: els.taskTitle.value,
    notes: els.taskNotes.value,
    dueDate: els.taskDueDate.value,
    repeat: els.taskRepeat.value as Quest["repeat"],
    tags: parseTags(els.taskTags.value),
    difficulty: els.taskDifficulty.value as Quest["difficulty"],
    assignee: taskAssigneeFromForm(),
    parentQuestId: els.taskParentQuest?.value || "",
    handoff: normalizeTaskHandoff({
      note: els.taskHandoffNote?.value || "",
      blockedReason: els.taskBlockedReason?.value || "",
      artifactUrl: els.taskArtifactUrl?.value || "",
    }),
  };
}

function taskAssigneeFromForm(): Quest["assignee"] {
  const [type = "self", ...idParts] = String(els.taskAssignee?.value || "self:self").split(":");
  const id = idParts.join(":") || "self";
  const option = els.taskAssignee?.selectedOptions?.[0];
  const customLabel = String(els.taskAssigneeCustomLabel?.value || "").trim();
  const handoffState = els.taskHandoffState?.value || (els.taskHandoffReady?.checked ? "ready" : "none");
  return normalizeTaskAssignee({
    type,
    id,
    label: type === "agent" && (id === "custom" || id.startsWith("custom:")) ? customLabel || "カスタムAI" : option?.textContent || "自分",
    handoffState: type === "agent" ? handoffState : "none",
  });
}

function refreshTaskAssigneeFields(): void {
  if (!els.taskAssignee) return;
  const [type, ...idParts] = els.taskAssignee.value.split(":");
  const id = idParts.join(":");
  els.taskHandoffRow.hidden = type !== "agent";
  els.taskHandoffStateRow.hidden = type !== "agent";
  els.taskHandoffDetails.hidden = type !== "agent";
  els.taskAssigneeCustomRow.hidden = !(type === "agent" && (id === "custom" || id.startsWith("custom:")));
  if (type === "agent" && els.taskHandoffState && els.taskHandoffReady) {
    els.taskHandoffReady.checked = els.taskHandoffState.value === "ready";
  }
}

function populateTaskParentOptions(selectedTask: TaskDialogInput = {}) {
  if (!els.taskParentQuest) return;
  const currentId = selectedTask?.id || "";
  const candidate = (selectedTask?.id ? selectedTask : { id: "__new_quest__", kind: els.taskKind?.value || "todo" }) as Quest;
  els.taskParentQuest.innerHTML = "";
  els.taskParentQuest.appendChild(new Option("ルートQuest（親なし）", ""));
  state.tasks.filter((task) => taskTreeEligible(task)
    && task.id !== currentId
    && task.lifecycleState !== "archived"
    && validParentForTask(candidate, task.id))
    .sort(compareTasks)
    .forEach((task) => els.taskParentQuest.appendChild(new Option(task.title, task.id)));
  els.taskParentQuest.value = selectedTask?.parentQuestId || "";
}

function populateTaskAssigneeOptions(selectedAssignee: unknown = null): void {
  if (!els.taskHumanOptions || !els.taskAssignee) return;
  const current = normalizeTaskAssignee(selectedAssignee);
  const people = new Map<string, GatewayRecord>();
  (gatewayRuntime.friends || []).forEach((person) => { if (person.uid) people.set(person.uid, person); });
  const currentUser = globalThis.QuestForgeFirebase?.getUser?.();
  (gatewayRuntime.party?.members || []).forEach((person) => {
    if (person.uid && person.uid !== currentUser?.uid) people.set(person.uid, person);
  });
  els.taskHumanOptions.innerHTML = "";
  people.forEach((person) => {
    const option = document.createElement("option");
    option.value = `human:${person.uid}`;
    option.textContent = `${person.displayName} ${person.handle || ""}`.trim();
    els.taskHumanOptions.appendChild(option);
  });
  const value = `${current.type}:${current.id}`;
  if (![...els.taskAssignee.options].some((option) => option.value === value) && current.type !== "self") {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = current.label;
    const targetGroup = current.type === "agent" ? q("#taskAgentOptions") : els.taskHumanOptions;
    targetGroup?.appendChild(option);
  }
  els.taskAssignee.value = [...els.taskAssignee.options].some((option) => option.value === value) ? value : "self:self";
  els.taskAssigneeCustomLabel.value = current.type === "agent" && (current.id === "custom" || current.id.startsWith("custom:")) ? current.label : "";
  els.taskHandoffReady.checked = current.handoffState === "ready";
  refreshTaskAssigneeFields();
}

function openTaskDialog(task: TaskDialogInput = {}): void {
  const isEditing = Boolean(task.id);
  els.taskDialog.dataset.mode = isEditing ? "edit" : "create";
  els.dialogTitle.textContent = i18n?.t?.(isEditing ? "task.edit" : "task.add") || (isEditing ? "タスク編集" : "タスク追加");
  els.editingTaskId.value = task.id || "";
  els.taskKind.value = task.kind || "todo";
  els.taskTitle.value = task.title || "";
  els.taskNotes.value = task.notes || "";
  els.taskDueDate.value = task.dueDate || "";
  els.taskRepeat.value = task.repeat || (task.kind === "daily" ? "daily" : "none");
  els.taskTags.value = (task.tags || []).join(", ");
  els.taskDifficulty.value = task.difficulty || "easy";
  populateTaskParentOptions(task);
  renderTaskChildren(task);
  populateTaskAssigneeOptions(task.assignee);
  const handoff = normalizeTaskHandoff(task.handoff);
  const handoffState = task.assignee?.type === "agent" ? task.assignee.handoffState || "none" : "none";
  els.taskHandoffState.value = handoffState;
  els.taskHandoffNote.value = handoff.note;
  els.taskBlockedReason.value = handoff.blockedReason;
  els.taskArtifactUrl.value = handoff.artifactUrl;
  els.taskHandoffStateRow.hidden = task.assignee?.type !== "agent";
  els.taskHandoffDetails.hidden = task.assignee?.type !== "agent";
  els.archiveTaskButton.hidden = !isEditing;

  if (typeof els.taskDialog.showModal === "function") {
    els.taskDialog.showModal();
  } else {
    els.taskDialog.setAttribute("open", "");
  }
  requestAnimationFrame(() => els.taskTitle.focus());
}

function renderTaskChildren(task: TaskDialogInput = {}): void {
  if (!els.taskChildrenList || !els.taskChildrenItems) return;
  const children = task.id ? questTreeChildren(task.id, true) : [];
  els.taskChildrenItems.innerHTML = "";
  els.taskChildrenList.hidden = !children.length;
  children.forEach((child) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-child-link";
    button.textContent = child.title;
    button.addEventListener("click", () => {
      closeTaskDialog();
      openTaskDialog(child);
    });
    els.taskChildrenItems.appendChild(button);
  });
}

els.taskAssignee?.addEventListener("change", refreshTaskAssigneeFields);
els.taskHandoffState?.addEventListener("change", () => {
  if (els.taskHandoffReady) els.taskHandoffReady.checked = els.taskHandoffState.value === "ready";
});
els.taskHandoffReady?.addEventListener("change", () => {
  if (els.taskHandoffState) els.taskHandoffState.value = els.taskHandoffReady.checked ? "ready" : "none";
});
els.questTreeIncludeArchived?.addEventListener("change", renderQuestTree);
els.refreshQuestTreeButton?.addEventListener("click", renderQuestTree);
els.localeSelect?.addEventListener("change", () => i18n?.setLocale?.(els.localeSelect.value));
window.addEventListener("questforge:locale-changed", () => {
  i18n?.applyDocumentTranslations?.();
  els.viewTitle.textContent = i18n?.t?.(`view.${activeViewId}`) || viewTitles[activeViewId];
  render();
  if (activeViewId === "integrations") refreshGatewayRuntime().catch(() => {});
});

function describeSocialError(error: unknown): string {
  const appError = error as Partial<AppError>;
  const messages: Record<string, string> = {
    handle_invalid: "@handleは半角英小文字・数字・_の3〜20文字で入力してください。",
    handle_reserved: "この@handleは予約済みです。別の名前を選んでください。",
    handle_taken: "この@handleはすでに使われています。",
    handle_cooldown: "@handleを変更できるのは30日に1回です。",
    profile_not_found: "一致するプロフィールが見つかりません。",
    friend_request_pending: "この相手とは友達申請を確認中です。",
    already_friends: "すでに友達です。",
    party_full: "このパーティは4人で満員です。",
    party_invite_expired: "招待の有効期限が切れています。",
  };
  return messages[appError.code || ""] || appError.message || "処理を完了できませんでした。";
}

els.profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.profileFormMessage.textContent = "保存中...";
  try {
    const result = await gatewayFetch("/v1/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: els.profileDisplayName.value,
        handle: els.profileHandle.value,
        bio: els.profileBio.value,
        avatarRole: state.character.role,
        avatarVariant: state.character.variant,
        level: state.character.level,
      }),
    });
    gatewayRuntime.profile = result.profile ? asJsonRecord(result.profile) as GatewayRecord : null;
    els.profileFormMessage.textContent = "保存しました。";
    await refreshSocialRuntime();
  } catch (error) {
    els.profileFormMessage.textContent = describeSocialError(error);
  }
});

els.friendSearchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.friendSearchResult.textContent = i18n.t("status.searching");
  try {
    const result = await gatewayFetch(`/v1/profiles/${encodeURIComponent(els.friendHandleSearch.value)}`);
    gatewayRuntime.friendSearchResult = result.profile ? asJsonRecord(result.profile) as GatewayRecord : null;
    if (!result.profile) els.friendSearchResult.textContent = "一致するプロフィールが見つかりません。";
    else renderFriendSearchResult();
  } catch (error) {
    gatewayRuntime.friendSearchResult = null;
    els.friendSearchResult.textContent = describeSocialError(error);
  }
});

els.partyCreateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await gatewayFetch("/v1/party", { method: "POST", body: JSON.stringify({ name: els.partyNameInput.value }) });
    els.partyNameInput.value = "";
    await refreshSocialRuntime();
  } catch (error) {
    els.partyMessage.textContent = describeSocialError(error);
  }
});

els.partyInviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const profile = await gatewayFetch(`/v1/profiles/${encodeURIComponent(els.partyInviteHandle.value)}`);
    const profileRecord = profile.profile ? asJsonRecord(profile.profile) as GatewayRecord : null;
    if (!profileRecord?.uid) throw Object.assign(new Error("一致するプロフィールが見つかりません。"), { code: "profile_not_found" });
    const result = await gatewayFetch("/v1/party/invites", { method: "POST", body: JSON.stringify({ inviteeUid: profileRecord.uid }) });
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("partyInvite", String(result.token || ""));
    inviteUrl.hash = "party";
    els.partyInviteLink.value = inviteUrl.toString();
    els.partyInviteResult.hidden = false;
    els.partyMessage.textContent = "7日間有効な招待リンクを発行しました。";
  } catch (error) {
    els.partyMessage.textContent = describeSocialError(error);
  }
});

els.copyPartyInviteButton?.addEventListener("click", async () => {
  if (!els.partyInviteLink.value) return;
  await navigator.clipboard.writeText(els.partyInviteLink.value);
  els.partyMessage.textContent = "招待リンクをコピーしました。";
});

els.partyAcceptForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await gatewayFetch("/v1/party/invites/accept", { method: "POST", body: JSON.stringify({ token: els.partyInviteToken.value.trim() }) });
    els.partyInviteToken.value = "";
    const url = new URL(window.location.href);
    url.searchParams.delete("partyInvite");
    window.history.replaceState(null, "", `${url.pathname}${url.search}#party`);
    await refreshSocialRuntime();
    els.partyMessage.textContent = "パーティへ参加しました。";
  } catch (error) {
    els.partyMessage.textContent = describeSocialError(error);
  }
});

els.leavePartyButton?.addEventListener("click", async () => {
  if (!window.confirm("パーティから退出しますか？オーナーの場合は最初のメンバーへ引き継ぎます。")) return;
  try {
    await gatewayFetch("/v1/party/leave", { method: "POST" });
    await refreshSocialRuntime();
  } catch (error) {
    els.partyMessage.textContent = describeSocialError(error);
  }
});

function closeTaskDialog() {
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
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    updateInstallAppButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallAppButton();
    showToast("Guilduoをアプリとして追加しました。", { duration: 5000 });
  });

  els.installAppButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    updateInstallAppButton();
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === "accepted") {
      showToast("Guilduoをアプリとして追加中です。", { duration: 5000 });
    }
  });

  updateInstallAppButton();
}

function setActiveView(view: string, options: AppViewOptions = {}): void {
  const nextView = viewTitles[view] ? view : "tasks";
  activeViewId = nextView;
  qa<AppElement>("[data-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === nextView);
  });
  qa<AppElement>("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === nextView);
  });
  els.viewTitle.textContent = i18n?.t?.(`view.${nextView}`) || viewTitles[nextView];
  if (nextView === "battle") {
    state.boss.rotationEnabled = false;
  }
  if (options.render !== false) {
    render();
  }
}

function installPartyModeTabs(): void {
  const tabs = qa<AppElement>("[data-party-mode]");
  const panels = qa<AppElement>("[data-party-panel]");
  const sync = (mode: string): void => {
    tabs.forEach((tab) => {
      const active = tab.dataset.partyMode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.partyPanel !== mode; });
  };
  tabs.forEach((tab) => tab.addEventListener("click", () => sync(tab.dataset.partyMode || "formation")));
  sync("formation");
}

qa<AppElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view || "tasks";
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

qa<HTMLElement>("[data-current-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    currentPresentationMode = button.dataset.currentMode === "campaign" ? "campaign" : "mission";
    renderCurrentReference();
  });
});
document.querySelector<HTMLElement>("#currentRefAddMission")?.addEventListener("click", () => openTaskDialog({ kind: "todo", difficulty: "medium" }));
document.querySelector<HTMLElement>("#currentRailOpenBattle")?.addEventListener("click", () => setActiveView("battle"));
document.querySelector<HTMLElement>("#currentRailViewBattle")?.addEventListener("click", () => setActiveView("battle"));
document.querySelector<HTMLElement>("#currentRailOpenSelected")?.addEventListener("click", () => {
  const selected = currentRefMissions().find((mission) => mission.state === "working") || currentRefMissions().find((mission) => mission.state !== "done");
  const task = selected && state.tasks.find((item) => item.id === selected.id);
  if (task) openTaskDialog(task);
});
document.querySelector<HTMLElement>("#currentRailClose")?.addEventListener("click", () => {
  document.body.classList.toggle("is-current-rail-collapsed");
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
    if (!window.confirm("現在のGuilduoデータを、このバックアップで置き換えますか？")) {
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
    showToast("GuilduoのバックアップJSONを読み込めませんでした。");
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
    if (appUpdateFallbackTimer !== null) window.clearTimeout(appUpdateFallbackTimer);
    appUpdateFallbackTimer = window.setTimeout(() => {
      showAppUpdateAvailable(event.data.version);
    }, 1600);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerAtLoad) return;
    if (appUpdateFallbackTimer !== null) window.clearTimeout(appUpdateFallbackTimer);
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
      console.warn("Guilduo service worker registration failed:", error);
    }
  });
}

function consumeIntegrationOAuthResult() {
  const params = new URLSearchParams(window.location.search);
  const service = params.get("integration");
  const result = params.get("result");
  if (!service || !result) return;
  if (integrationAdapters.some((adapter) => adapter.id === service)) state.integrations.selectedService = service;
  window.history.replaceState(null, "", `${window.location.pathname}#integrations`);
  window.setTimeout(() => {
    if (result === "connected") showToast("外部サービスを接続しました。同期対象を選んでください。", { duration: 7000 });
    else if (result === "cancelled") showToast("外部サービスの接続をキャンセルしました。", { duration: 6000 });
    else {
      const rawMessage = params.get("message") || "";
      const message = /not configured|provider_not_configured/i.test(rawMessage)
        ? "この連携は管理者のOAuth設定待ちです。設定完了後にもう一度接続してください。"
        : rawMessage || "外部サービスへ接続できませんでした。";
      showToast(message, { duration: 8000 });
    }
  }, 300);
}

function consumePartyInvite() {
  const token = new URLSearchParams(window.location.search).get("partyInvite");
  if (!token || !els.partyInviteToken) return;
  els.partyInviteToken.value = token;
  if (window.location.hash !== "#party") window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#party`);
}

consumeIntegrationOAuthResult();
consumePartyInvite();
registerButtonFeedback();
registerInstallPrompt();
installPartyModeTabs();
setActiveView(window.location.hash.slice(1), { render: false });
registerServiceWorker();
render();
startBossRotation();
refreshGatewayRuntime();
window.addEventListener("questforge:auth-changed", () => {
  refreshGatewayRuntime();
  refreshSocialRuntime();
});
