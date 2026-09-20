import type { Quest, QuestDifficulty, QuestForgeState } from "./questforge";

interface QuestForgeUser {
  uid: string;
  email: string;
  displayName: string;
}

interface QuestForgeTranslationElement {
  textContent: string | null;
  dataset: Record<string, string | undefined>;
  placeholder?: string;
  title?: string;
  label?: string;
  value?: string;
  href?: string;
  classList: { contains: (name: string) => boolean };
  setAttribute: (name: string, value: string) => void;
  querySelector: (selector: string) => QuestForgeTranslationElement | null;
}

interface QuestForgeTranslationRoot {
  documentElement: { lang: string; dir: string };
  querySelectorAll: (selector: string) => QuestForgeTranslationElement[];
  querySelector: (selector: string) => QuestForgeTranslationElement | null;
}

interface QuestForgeI18nApi {
  SUPPORTED_LOCALES: readonly string[];
  LOCALE_STORAGE_KEY: string;
  resolveLocale: (tag: unknown) => string | null;
  getLocale: () => string;
  t: (key: string, variables?: Record<string, unknown>) => string;
  formatDate: (value: unknown, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: unknown, options?: Intl.NumberFormatOptions) => string;
  compareText: (a: unknown, b: unknown) => number;
  applyDocumentTranslations: (root?: QuestForgeTranslationRoot) => void;
  setLocale: (locale: unknown) => string;
  resetLocaleForTests: () => void;
}

interface GuilduoAuthApi {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getUser: () => QuestForgeUser | null;
  flushState: () => Promise<boolean>;
}

interface QuestForgeTelemetryApi {
  getConsent?: () => "unknown" | "granted" | "denied";
  setConsent?: (value: "unknown" | "granted" | "denied") => "unknown" | "granted" | "denied";
  track?: (...args: unknown[]) => void;
}

interface QuestForgeSyncSnapshot {
  state: QuestForgeState;
  hadLocalStateAtStartup: boolean;
}

interface QuestForgeBridgeApi {
  version: number;
  deviceId: string;
  getSyncSnapshot: () => QuestForgeSyncSnapshot;
  applyCloudState: (nextState: unknown) => void;
}

type QuestForgeBattleRulesApi = typeof import("../shared/battle-rules.ts");

interface QuestForgeCoreApi {
  CURRENT_SCHEMA_VERSION: number;
  TASK_EVENT_LIMIT: number;
  appendTaskEvent: (events: Array<Record<string, unknown>>, event: Record<string, unknown>, limit?: number) => Array<Record<string, unknown>>;
  battleCommandCost: (command: string, skillCost?: number) => number;
  claimCompletion: (rewardClaims: Record<string, string>, task: Quest, dateText: string, claimedAt: string) => {
    granted: boolean;
    key: string;
    rewardClaims: Record<string, string>;
  };
  completionClaimKey: (task: Quest, dateText: string) => string;
  difficultyScale: (difficulty: QuestDifficulty) => number;
  isBattleTaskEligible: (task: Quest | null | undefined) => boolean;
  isArchivedTask: (task: Quest | null | undefined) => boolean;
  isCompletedTask: (task: Quest | null | undefined) => boolean;
  nextDueDateForTask: (task: Quest, fromDateText: string) => string;
  taskRewardDelta: (task: Quest, weakKind?: string) => { gems: number; xp: number; mp: number };
}

declare global {
  interface QuestForgeRuntimeConfig {
    gatewayUrl?: string;
    webApiBaseUrl?: string;
    joinGuildUrl?: string;
    sourceUrl?: string;
    externalOAuthEnabled?: boolean;
    telemetryEndpoint?: string;
    appwriteEndpoint?: string;
    appwriteProjectId?: string;
  }

  interface Window {
    webkitAudioContext?: typeof AudioContext;
    QuestForgeFirebase?: GuilduoAuthApi;
    GuilduoAuth?: GuilduoAuthApi;
  }

  interface Navigator {
    standalone?: boolean;
  }

  var QuestForgeConfig: QuestForgeRuntimeConfig | undefined;
  var QuestForgeI18n: QuestForgeI18nApi | undefined;
  var QuestForgeCore: QuestForgeCoreApi | undefined;
  var QuestForgeBattleRules: QuestForgeBattleRulesApi | undefined;
  var QuestForgeBridge: QuestForgeBridgeApi | undefined;
  var QuestForgeTelemetry: QuestForgeTelemetryApi | undefined;
  var QuestForgeFirebase: GuilduoAuthApi | undefined;
  var GuilduoAuth: GuilduoAuthApi | undefined;

  interface WindowEventMap {
    "questforge:state-saved": CustomEvent<{ state?: QuestForgeState }>;
    "questforge:auth-changed": CustomEvent<{ user: unknown }>;
    "questforge:locale-changed": CustomEvent<{ locale: string }>;
    "questforge:telemetry-ready": CustomEvent<void>;
  }
}

export {};
