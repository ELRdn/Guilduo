import "../runtime-config.js";
import { applyDocumentTranslations, getLocale, setLocale, t, SUPPORTED_LOCALES, LOCALE_METADATA } from "../i18n.ts";
import {
  QuestForgeRepository,
  QuestForgeApiError,
  gatewayDefaultUrl,
  readAutoConnectPreference,
  readLocalBackup,
  readLabState,
  readRemoteSnapshot,
  hasAutoConnectPreference,
  removeRemoteSnapshot,
  writeAutoConnectPreference,
  writeLabState,
  writeLocalBackup,
  writeRemoteSnapshot,
} from "./repository.ts";
import { currentUser, getIdToken, observeAuth, signIn, signOutUser } from "./auth.ts";
import { installQuestForgeIconObserver } from "../ui/icon-system.ts";
import type {
  FormationMember,
  IntegrationControlPlaneViewModel,
  IntegrationNodeStatus,
  IslandHandle,
  PartyFormationViewModel,
  QuestGraphNode,
  QuestGraphViewModel,
} from "../ui/islands/types.ts";

installQuestForgeIconObserver();

type LabLocale = (typeof SUPPORTED_LOCALES)[number];
type JsonRecord = Record<string, unknown>;
type LabTelemetryConsent = "unknown" | "granted" | "denied";
type LabView = "today" | "quests" | "tree" | "agents" | "reviews" | "battle" | "party" | "integrations" | "profile" | "settings";

interface LabQuest {
  id: string;
  code: string;
  kind: string;
  title: string;
  note: string;
  progress: number;
  owner: string;
  mark: string;
  state: string;
  due: string;
  focus: number;
  reward: number;
  xp: number;
  difficulty: number;
  children?: string[];
  parent?: string;
  raw?: { assignee?: { handoffState?: string; [key: string]: unknown }; [key: string]: unknown };
  lifecycleState?: string;
  completedAt?: string;
  archivedAt?: string;
  [key: string]: unknown;
}

interface LabAgent {
  agentId: string;
  displayName: string;
  provider: string;
  role: string;
  instructions?: string;
  status: string;
  updatedAt?: string;
  defaultHandoffState?: string;
  [key: string]: unknown;
}

interface LabMcpClient {
  clientId: string;
  clientName: string;
  scopes?: string[];
  lastUsedAt?: string;
  [key: string]: unknown;
}

interface LabAgentConnection {
  clientId: string;
  agentId: string;
  revokedAt?: string;
  clientName?: string;
  scopes?: string[];
  lastUsedAt?: string;
  [key: string]: unknown;
}

interface LabProfile {
  uid?: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarRole?: string;
  avatarVariant?: string;
  avatarUrl?: string;
  [key: string]: unknown;
}

interface LabPerson {
  uid: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  [key: string]: unknown;
}

interface LabParty {
  id?: string;
  name?: string;
  members?: LabPerson[];
  [key: string]: unknown;
}

interface LabIntegration {
  id: string;
  providerId: string;
  name: string;
  short: string;
  stateKey: string;
  copyKey: string;
  titleKey: string;
  detailKey: string;
  activityKeys: string[];
  lastSync: string;
  scope: string;
  nextStepKey: string;
  status?: string;
  [key: string]: unknown;
}

interface LabPanelError {
  index: number;
  message: string;
}

interface LabBattleSession extends JsonRecord {
  message?: string;
  battle?: JsonRecord;
}

interface LabSettings {
  typeScale: boolean;
  density: boolean;
  motion: boolean;
  sound: boolean;
  theme: "arcane" | "soft-ops" | "retro";
  mode: "light" | "dark" | "system";
}

interface LabState {
  view: LabView;
  mp: number;
  bossHp: number;
  selectedQuestId: string;
  selectedQuestIds: string[];
  selectionAnchorId: string;
  expanded: Set<string>;
  mobileSheetOpen: boolean;
  mobileMoreOpen: boolean;
  showArchived: boolean;
  detailMode: "sheet" | "modal";
  priorityOnly: boolean;
  sort: string;
  timerSeconds: number;
  timerId: number | null;
  integration: string;
  agentFocusId: string;
  dataSource: string;
  syncStatus: string;
  gatewayUrl: string;
  lastSyncAt: string;
  authUser: { uid: string; email: string; displayName: string } | null;
  remoteMode: boolean;
  remoteOwnerUid: string;
  remoteConnectionState: string;
  remoteSnapshotAvailable: boolean;
  autoConnectEnabled: boolean;
  remoteIntegrations: LabIntegration[];
  registeredAgents: LabAgent[];
  agentConnections: { authorizedClients: LabMcpClient[]; connections: LabAgentConnection[] };
  profile: LabProfile | null;
  avatarDataUrl: string;
  remoteParty: LabParty | null;
  panelErrors: LabPanelError[];
  battleSession: LabBattleSession | null;
  battleTurn: number;
  settings: LabSettings;
  battleLog: string[];
  quests: LabQuest[];
  [key: string]: unknown;
}

type PartyMember = { name: string; identity: string; role: string; mark: string; state: string; task: string; avatar?: string; agentId?: string };
interface RemoteSnapshot {
  quests: JsonRecord[];
  total: number;
  character: JsonRecord;
  battle: JsonRecord;
  integrations: LabIntegration[];
  profile: LabProfile | null;
  party: LabParty | null;
  agents: LabAgent[];
  agentConnections: { authorizedClients: LabMcpClient[]; connections: LabAgentConnection[] };
  panelErrors: LabPanelError[];
}
type LabElement = HTMLElement & {
  value: string;
  checked: boolean;
  disabled: boolean;
  files: FileList | null;
  src: string;
  alt: string;
  close(): void;
  showModal(): void;
  reset(): void;
  select(): void;
  closest(selectors: string): LabElement | null;
  addEventListener(type: string, listener: (event: LabEvent) => unknown, options?: boolean | AddEventListenerOptions): void;
};

type LabEvent = Event & {
  currentTarget: LabElement;
  target: LabElement;
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  clientX: number;
  clientY: number;
};

const getTelemetryConsent = (): LabTelemetryConsent => globalThis.QuestForgeTelemetry?.getConsent?.() || "unknown";
const setTelemetryConsent = (value: LabTelemetryConsent): LabTelemetryConsent => globalThis.QuestForgeTelemetry?.setConsent?.(value) || value;
const trackTelemetry = (...args: unknown[]): void => { globalThis.QuestForgeTelemetry?.track?.(...args); };
const telemetryReady = import("../telemetry.ts").then(({ initializeTelemetry }) => {
  initializeTelemetry({ surface: "next" });
  globalThis.dispatchEvent?.(new CustomEvent("questforge:telemetry-ready"));
}).catch(() => {});

const state: LabState = {
  view: "today",
  mp: 68,
  bossHp: 71,
  selectedQuestId: "qf-ui",
  selectedQuestIds: [],
  selectionAnchorId: "",
  expanded: new Set(["qf-ui"]),
  mobileSheetOpen: false,
  mobileMoreOpen: false,
  showArchived: false,
  detailMode: "sheet",
  priorityOnly: false,
  sort: "due",
  timerSeconds: 25 * 60,
  timerId: null,
  integration: "calendar",
  agentFocusId: "",
  dataSource: "local",
  syncStatus: "local-only",
  gatewayUrl: gatewayDefaultUrl(),
  lastSyncAt: "",
  authUser: null,
  remoteMode: false,
  remoteOwnerUid: "",
  remoteConnectionState: "local",
  remoteSnapshotAvailable: false,
  autoConnectEnabled: false,
  remoteIntegrations: [],
  registeredAgents: [],
  agentConnections: { authorizedClients: [], connections: [] },
  profile: null,
  avatarDataUrl: "",
  remoteParty: null,
  panelErrors: [],
  battleSession: null,
  battleTurn: 1,
  settings: {
    typeScale: false,
    density: false,
    motion: true,
    sound: true,
    theme: "soft-ops",
    mode: "dark"
  },
  battleLog: ["Questを完了するとMPを獲得できる。", "Deadline Wraithが待ち構えている。"],
  quests: [
    { id: "qf-ui", code: "01", kind: "main", title: "Guilduoの操作設計を固める", note: "Relay Forgeの操作原型を試して、採用する流れを決める。", progress: 72, owner: "Astra", mark: "AS", state: "working", due: "今日 18:00", focus: 45, reward: 20, xp: 120, difficulty: 4, children: ["qf-desktop", "qf-mobile"] },
    { id: "qf-desktop", code: "01.1", kind: "sub", parent: "qf-ui", title: "PCの司令室を試す", note: "一覧、担当、レビュー、ボス圧を一画面で判断する。", progress: 100, owner: "Cyan", mark: "C/", state: "completed", due: "完了済み", focus: 30, reward: 14, xp: 72, difficulty: 2 },
    { id: "qf-mobile", code: "01.2", kind: "sub", parent: "qf-ui", title: "Pixel 9の操作を試す", note: "縦長画面で、今日のQuestを選んで完了まで進める。", progress: 45, owner: "Cyan", mark: "C/", state: "review", due: "今日 20:00", focus: 60, reward: 20, xp: 96, difficulty: 3 },
    { id: "toggl", code: "02", kind: "side", title: "Toggl Focusの連携導線を確認する", note: "接続、対象選択、プレビュー、確定の順番を検証する。", progress: 38, owner: "Astra", mark: "AS", state: "blocked", due: "明日 13:00", focus: 25, reward: 20, xp: 108, difficulty: 4 },
    { id: "locale", code: "03", kind: "side", title: "10言語の表示長を確認する", note: "長いラベルでもテーブルとモバイル表示が崩れないようにする。", progress: 15, owner: "Archivist", mark: "A", state: "ready", due: "8/22 11:00", focus: 30, reward: 14, xp: 68, difficulty: 2 }
  ]
};

const labLabels: Readonly<Record<LabLocale, Readonly<Record<string, string>>>> = Object.freeze({
  ja: { today: "今日の作戦", tree: "Quest Tree", battle: "バトル", party: "パーティ", integrations: "連携", profile: "プロフィール", settings: "設定", more: "その他", detail: "詳細", close: "閉じる", reconnect: "再接続する", earlyAccess: "外部サービス連携は公開βに向けて準備中です。GuilduoログインとMCP接続は利用できます。" },
  en: { today: "Today's Ops", tree: "Quest Tree", battle: "Battle", party: "Party", integrations: "Connections", profile: "Profile", settings: "Settings", more: "More", detail: "Details", close: "Close", reconnect: "Reconnect", earlyAccess: "External service connections are in preparation for the public beta. Guilduo login and MCP remain available." },
  es: { today: "Operación de hoy", tree: "Árbol de Quests", battle: "Batalla", party: "Grupo", integrations: "Conexiones", profile: "Perfil", settings: "Ajustes", more: "Más", detail: "Detalles", close: "Cerrar", reconnect: "Reconectar", earlyAccess: "Las conexiones externas están en preparación para la beta pública. El inicio de sesión Firebase y MCP siguen disponibles." },
  "pt-BR": { today: "Operação de hoje", tree: "Árvore de Quests", battle: "Batalha", party: "Grupo", integrations: "Conexões", profile: "Perfil", settings: "Configurações", more: "Mais", detail: "Detalhes", close: "Fechar", reconnect: "Reconectar", earlyAccess: "As conexões externas estão em preparação para a beta pública. O login Firebase e o MCP continuam disponíveis." },
  fr: { today: "Opération du jour", tree: "Arbre des Quests", battle: "Bataille", party: "Équipe", integrations: "Connexions", profile: "Profil", settings: "Réglages", more: "Plus", detail: "Détails", close: "Fermer", reconnect: "Reconnecter", earlyAccess: "Les connexions externes sont en préparation pour la bêta publique. La connexion Firebase et MCP reste disponible." },
  de: { today: "Heutiger Einsatz", tree: "Quest-Baum", battle: "Kampf", party: "Party", integrations: "Verbindungen", profile: "Profil", settings: "Einstellungen", more: "Mehr", detail: "Details", close: "Schließen", reconnect: "Neu verbinden", earlyAccess: "Externe Verbindungen werden für die öffentliche Beta vorbereitet. Firebase-Login und MCP bleiben verfügbar." },
  ko: { today: "오늘의 작전", tree: "Quest 트리", battle: "전투", party: "파티", integrations: "연결", profile: "프로필", settings: "설정", more: "더 보기", detail: "상세", close: "닫기", reconnect: "다시 연결", earlyAccess: "외부 서비스 연결은 공개 베타를 위해 준비 중입니다. Firebase 로그인과 MCP는 계속 사용할 수 있습니다." },
  "zh-Hans": { today: "今日行动", tree: "Quest 树", battle: "战斗", party: "队伍", integrations: "连接", profile: "个人资料", settings: "设置", more: "更多", detail: "详情", close: "关闭", reconnect: "重新连接", earlyAccess: "外部服务连接正在为公开测试版准备。Firebase 登录和 MCP 仍可使用。" },
  ru: { today: "Операция на сегодня", tree: "Дерево Quest", battle: "Бой", party: "Партия", integrations: "Подключения", profile: "Профиль", settings: "Настройки", more: "Ещё", detail: "Подробности", close: "Закрыть", reconnect: "Переподключить", earlyAccess: "Внешние подключения готовятся к публичной бета-версии. Вход Firebase и MCP доступны." },
});

const labTranslationKeys: Readonly<Record<string, string>> = Object.freeze({
  all: "task.filter.all",
  treeHeading: "questTree.title",
  battleHeading: "battle.subtitle",
  partyHeading: "party.roadmapTitle",
  integrationHeading: "integration.title",
  preview: "integration.previewLive",
  sync: "integration.confirmSync",
  close: "common.close",
  signIn: "sync.signIn",
  signOut: "sync.signOut",
  loadData: "common.refresh",
  localOnly: "sync.local",
  synced: "sync.synced",
  syncing: "sync.syncing",
  error: "sync.error.connection",
  language: "locale.label",
  telemetryTitle: "telemetry.title",
  telemetryCopy: "telemetry.copy",
  telemetryOptIn: "telemetry.optIn",
  agentHeading: "task.agentGroup",
  taskAssignee: "task.assignee",
  dueLabel: "task.date",
  save: "common.save",
});

const labExtraLabels: Readonly<Record<LabLocale, Readonly<Record<string, string>>>> = Object.freeze({
  ja: Object.freeze({ priority: "優先のみ", showArchived: "保管済みを表示", sortDue: "期限順", sortProgress: "進捗順", sortOwner: "担当順", hideArchived: "保管済みを隠す", collapse: "すべて閉じる", clearSelection: "選択解除", selectedSuffix: "件選択", complete: "完了", confirm: "確認", edit: "編集", archive: "保管", restore: "戻す", reconnecting: "再接続中…", authChecking: "Googleログインを確認中…", loginBefore: "Googleログイン前。ローカルモードで利用中", useLocal: "ローカルへ戻す", settingsHeading: "表示と運用の設定", displayHeading: "読みやすさ", feedbackHeading: "操作の手応え", shortcutsHeading: "よく使う場所", connectionHeading: "Guilduo本体と接続", agentHeadingFallback: "AIエージェント台帳", languageNote: "この端末だけで表示言語を切り替えます。Questデータは変わりません。", typeScale: "文字を大きめにする", typeScaleNote: "一覧・詳細・操作ボタンを読みやすくします。", density: "表示密度", densityNote: "情報を詰めすぎず、行間を少し広くします。", mobileDetail: "スマホのQuest詳細", mobileDetailNote: "下部シートとポップアップを切り替えて表示できます。", motion: "モーション", motionNote: "画面遷移と完了時の短い反応を表示します。", sound: "効果音", soundNote: "本体へ移植するときにテーマ別SEを使用します。", profileShortcut: "プロフィール", partyShortcut: "パーティ", integrationShortcut: "連携", on: "オン", off: "オフ", standard: "標準", sheet: "下から表示", modal: "ポップアップ", autoConnect: "起動時に本体へ自動接続", newAgent: "新規入力", link: "紐付け", unlink: "解除", agentSelect: "Agentを選択", mcpSelect: "MCPクライアントを選択", noAgent: "まだAgentが登録されていません。", noClients: "紐付け済みのMCPクライアントはありません。" }),
  en: Object.freeze({ priority: "Priority only", showArchived: "Show stored", sortDue: "Due date", sortProgress: "Progress", sortOwner: "Assignee", hideArchived: "Hide stored", collapse: "Collapse all", clearSelection: "Clear selection", selectedSuffix: " selected", complete: "Complete", confirm: "Review", edit: "Edit", archive: "Store", restore: "Restore", reconnecting: "Reconnecting…", authChecking: "Checking Google sign-in…", loginBefore: "Not signed in. Using local mode", useLocal: "Use local mode", settingsHeading: "Display and workflow settings", displayHeading: "Readability", feedbackHeading: "Interaction feedback", shortcutsHeading: "Shortcuts", connectionHeading: "Connect to QuestForge", agentHeadingFallback: "AI Agent Registry", languageNote: "Change the display language on this device only. Quest data is unchanged.", typeScale: "Larger text", typeScaleNote: "Make lists, details, and action buttons easier to read.", density: "Display density", densityNote: "Use more breathing room between information.", mobileDetail: "Mobile Quest details", mobileDetailNote: "Compare the bottom sheet and centered popup presentations.", motion: "Motion", motionNote: "Show short responses for navigation and completion.", sound: "Sound effects", soundNote: "Theme-based effects will be used in the main app.", profileShortcut: "Profile", partyShortcut: "Party", integrationShortcut: "Connections", on: "On", off: "Off", standard: "Standard", sheet: "Bottom sheet", modal: "Popup", autoConnect: "Reconnect on startup", newAgent: "New entry", link: "Link", unlink: "Unlink", agentSelect: "Select an Agent", mcpSelect: "Select an MCP client", noAgent: "No Agents registered yet.", noClients: "No linked MCP clients." }),
  es: Object.freeze({ complete: "Hecho", confirm: "Revisar", edit: "Editar", archive: "Archivar", restore: "Restaurar" }),
  "pt-BR": Object.freeze({ complete: "Concluído", confirm: "Revisar", edit: "Editar", archive: "Arquivar", restore: "Restaurar" }),
  fr: Object.freeze({ complete: "Terminé", confirm: "Vérifier", edit: "Modifier", archive: "Archiver", restore: "Rouvrir" }),
  de: Object.freeze({ complete: "Erledigt", confirm: "Prüfen", edit: "Bearbeiten", archive: "Archivieren", restore: "Wieder öffnen" }),
  ko: Object.freeze({ complete: "완료", confirm: "확인", edit: "수정", archive: "보관", restore: "복원" }),
  "zh-Hans": Object.freeze({ complete: "完成", confirm: "确认", edit: "编辑", archive: "归档", restore: "恢复" }),
  ru: Object.freeze({ complete: "Готово", confirm: "Проверить", edit: "Изменить", archive: "В архив", restore: "Вернуть" }),
});

const labContentLabels: Readonly<Record<LabLocale, Readonly<Record<string, string>>>> = Object.freeze({
  ja: Object.freeze({
    dueUnset: "期限未設定", todayWord: "今日", tomorrowWord: "明日", minutesSuffix: "分", difficultyLabel: "難易度",
    selectQuest: "選択", questListAria: "今日のQuest一覧。フォーカスするとこの欄だけスクロールできます", selectQuestTitle: "Questを選択",
    selectQuestCopy: "行を選ぶと、完了・確認・編集の操作をここから試せます。", open: "開く", openDetails: "Quest詳細を開く", closeDetails: "Quest詳細を閉じる",
    treeCompanion: "Astra / 相棒キャラクター", treeCached: "前回同期したQuestを表示中。再接続が完了するまで変更は保留されます。", treeRules: "親Questを完了にしても、子Questは勝手に完了しない。",
    battleQueueEmpty: "MPになるQuestはありません。", partyCurrentQuest: "現在のQuest", unassigned: "割り当てなし", statusLabel: "状態", estimate: "見積", partyCheckQuest: "担当Questを確認",
    profileTitleSuffix: "のプロフィール", accountPrefix: "アカウント: ", avatarAlt: "のSentinelアバター", avatarLocal: "この端末で設定中", avatarDefault: "初期アイコンを使用中",
    agentPrivateEmpty: "Googleログイン後に本体データを読み込むと、本人専用Agent台帳を管理できます。", agentStatusActive: "利用中", agentStatusDisabled: "停止中", agentStatusArchived: "保管済み",
    unlinked: "未接続", noInstructions: "作業指示なし", connectedLabel: "接続", lastUpdated: "最終更新", neverUpdated: "未更新", archiveAgent: "保管",
    agentHintMany: "件の認可済みMCPクライアントが見つかりました。紐付け済みの接続は名前の横に表示されます。", agentHintNone: "認可済みMCPクライアントがありません。同じアカウントでMCP接続を完了するとここへ表示されます。",
    scopesUsed: "権限", lastUsed: "最終利用", neverUsed: "未使用", panelLoadFailed: "一部の情報を読み込めませんでした", panelKeep: "Quest一覧は保持されています。", retry: "再試行", extraInfo: "追加情報",
    integrationPreparing: "準備中", settingsLarge: "大きめ", settingsRelaxed: "ゆったり", ariaLanguage: "表示言語"
  }),
  en: Object.freeze({
    dueUnset: "No deadline", todayWord: "Today", tomorrowWord: "Tomorrow", minutesSuffix: " min", difficultyLabel: "Difficulty",
    selectQuest: "Select", questListAria: "Today's Quest list. Focus this region to scroll only the task list", selectQuestTitle: "Select a Quest",
    selectQuestCopy: "Select a row to complete, review, or edit it here.", open: "Open", openDetails: "Open Quest details", closeDetails: "Close Quest details",
    treeCompanion: "Astra / Companion character", treeCached: "Showing the last synced Quests. Changes stay paused until reconnect finishes.", treeRules: "Completing a parent Quest never completes its child Quests automatically.",
    battleQueueEmpty: "No Quests can grant MP.", partyCurrentQuest: "Current Quest", unassigned: "Unassigned", statusLabel: "Status", estimate: "Estimate", partyCheckQuest: "View assigned Quest",
    profileTitleSuffix: "'s Profile", accountPrefix: "Account: ", avatarAlt: "'s Sentinel avatar", avatarLocal: "Set on this device", avatarDefault: "Using the default icon",
    agentPrivateEmpty: "Sign in with Google and load your QuestForge data to manage your private Agent registry.", agentStatusActive: "Active", agentStatusDisabled: "Disabled", agentStatusArchived: "Stored",
    unlinked: "Not linked", noInstructions: "No work instructions", connectedLabel: "Connection", lastUpdated: "Updated", neverUpdated: "Not updated", archiveAgent: "Store",
    agentHintMany: " authorized MCP client(s) found. Linked Agents appear beside each connection.", agentHintNone: "No authorized MCP clients found. Complete an MCP connection with this account to show it here.",
    scopesUsed: "scopes", lastUsed: "last used", neverUsed: "never", panelLoadFailed: "Some information could not be loaded", panelKeep: "Quest list is still available.", retry: "Retry", extraInfo: "Additional information",
    integrationPreparing: "Preparing", settingsLarge: "Large", settingsRelaxed: "Relaxed", ariaLanguage: "Display language"
  }),
  es: Object.freeze({ dueUnset: "Sin fecha límite", todayWord: "Hoy", tomorrowWord: "Mañana", minutesSuffix: " min", difficultyLabel: "Dificultad", selectQuest: "Seleccionar", questListAria: "Lista de Quests de hoy. Enfoca esta zona para desplazar solo las tareas", selectQuestTitle: "Selecciona una Quest", selectQuestCopy: "Selecciona una fila para completarla, revisarla o editarla aquí.", open: "Abrir", openDetails: "Abrir detalles de la Quest", closeDetails: "Cerrar detalles de la Quest", treeCompanion: "Astra / Personaje compañero", treeCached: "Se muestran las Quests sincronizadas anteriormente. Los cambios esperan hasta reconectar.", treeRules: "Completar una Quest padre no completa automáticamente sus hijas.", battleQueueEmpty: "No hay Quests que otorguen MP.", partyCurrentQuest: "Quest actual", unassigned: "Sin asignar", statusLabel: "Estado", estimate: "Estimación", partyCheckQuest: "Ver Quest asignada", profileTitleSuffix: " - Perfil", accountPrefix: "Cuenta: ", avatarAlt: " - avatar Sentinel", avatarLocal: "Configurado en este dispositivo", avatarDefault: "Usando el icono predeterminado", agentPrivateEmpty: "Inicia sesión con Google y carga tus datos para gestionar tu registro privado de Agents.", agentStatusActive: "Activo", agentStatusDisabled: "Desactivado", agentStatusArchived: "Archivado", unlinked: "Sin conexión", noInstructions: "Sin instrucciones", connectedLabel: "Conexión", lastUpdated: "Última actualización", neverUpdated: "Sin actualizar", archiveAgent: "Archivar", agentHintMany: " cliente(s) MCP autorizados encontrados.", agentHintNone: "No hay clientes MCP autorizados. Completa una conexión MCP con esta cuenta para verlos aquí.", scopesUsed: "permisos", lastUsed: "último uso", neverUsed: "nunca", panelLoadFailed: "No se pudo cargar parte de la información", panelKeep: "La lista de Quests se conserva.", retry: "Reintentar", extraInfo: "Información adicional", integrationPreparing: "Preparando", settingsLarge: "Grande", settingsRelaxed: "Espaciado", ariaLanguage: "Idioma de pantalla" }),
  "pt-BR": Object.freeze({ dueUnset: "Sem prazo", todayWord: "Hoje", tomorrowWord: "Amanhã", minutesSuffix: " min", difficultyLabel: "Dificuldade", selectQuest: "Selecionar", questListAria: "Lista de Quests de hoje. Foque nesta área para rolar apenas as tarefas", selectQuestTitle: "Selecione uma Quest", selectQuestCopy: "Selecione uma linha para concluir, revisar ou editar aqui.", open: "Abrir", openDetails: "Abrir detalhes da Quest", closeDetails: "Fechar detalhes da Quest", treeCompanion: "Astra / Personagem companheiro", treeCached: "Mostrando as Quests sincronizadas anteriormente. Alterações aguardam a reconexão.", treeRules: "Concluir uma Quest pai não conclui as filhas automaticamente.", battleQueueEmpty: "Nenhuma Quest concede MP.", partyCurrentQuest: "Quest atual", unassigned: "Não atribuída", statusLabel: "Status", estimate: "Estimativa", partyCheckQuest: "Ver Quest atribuída", profileTitleSuffix: " - Perfil", accountPrefix: "Conta: ", avatarAlt: " - avatar Sentinel", avatarLocal: "Definido neste dispositivo", avatarDefault: "Usando o ícone padrão", agentPrivateEmpty: "Entre com o Google e carregue seus dados para gerenciar seu registro privado de Agents.", agentStatusActive: "Ativo", agentStatusDisabled: "Desativado", agentStatusArchived: "Arquivado", unlinked: "Não conectado", noInstructions: "Sem instruções", connectedLabel: "Conexão", lastUpdated: "Última atualização", neverUpdated: "Não atualizado", archiveAgent: "Arquivar", agentHintMany: " cliente(s) MCP autorizado(s) encontrado(s).", agentHintNone: "Nenhum cliente MCP autorizado. Conclua uma conexão MCP com esta conta para exibi-los.", scopesUsed: "escopos", lastUsed: "último uso", neverUsed: "nunca", panelLoadFailed: "Não foi possível carregar parte das informações", panelKeep: "A lista de Quests foi mantida.", retry: "Tentar novamente", extraInfo: "Informações adicionais", integrationPreparing: "Preparando", settingsLarge: "Grande", settingsRelaxed: "Espaçado", ariaLanguage: "Idioma da tela" }),
  fr: Object.freeze({ dueUnset: "Sans échéance", todayWord: "Aujourd’hui", tomorrowWord: "Demain", minutesSuffix: " min", difficultyLabel: "Difficulté", selectQuest: "Sélectionner", questListAria: "Liste des Quests du jour. Focalisez cette zone pour ne faire défiler que les tâches", selectQuestTitle: "Sélectionnez une Quest", selectQuestCopy: "Sélectionnez une ligne pour la terminer, la vérifier ou la modifier ici.", open: "Ouvrir", openDetails: "Ouvrir les détails de la Quest", closeDetails: "Fermer les détails de la Quest", treeCompanion: "Astra / Personnage compagnon", treeCached: "Dernières Quests synchronisées affichées. Les modifications attendent la reconnexion.", treeRules: "Terminer une Quest parent ne termine jamais automatiquement ses enfants.", battleQueueEmpty: "Aucune Quest ne peut donner de MP.", partyCurrentQuest: "Quest actuelle", unassigned: "Non attribuée", statusLabel: "État", estimate: "Estimation", partyCheckQuest: "Voir la Quest attribuée", profileTitleSuffix: " - Profil", accountPrefix: "Compte : ", avatarAlt: " - avatar Sentinel", avatarLocal: "Défini sur cet appareil", avatarDefault: "Icône par défaut utilisée", agentPrivateEmpty: "Connectez-vous avec Google et chargez vos données pour gérer votre registre privé d’Agents.", agentStatusActive: "Actif", agentStatusDisabled: "Désactivé", agentStatusArchived: "Archivé", unlinked: "Non connecté", noInstructions: "Aucune instruction", connectedLabel: "Connexion", lastUpdated: "Dernière mise à jour", neverUpdated: "Non mis à jour", archiveAgent: "Archiver", agentHintMany: " client(s) MCP autorisé(s) trouvé(s).", agentHintNone: "Aucun client MCP autorisé. Terminez une connexion MCP avec ce compte pour les afficher.", scopesUsed: "autorisations", lastUsed: "dernière utilisation", neverUsed: "jamais", panelLoadFailed: "Certaines informations n’ont pas pu être chargées", panelKeep: "La liste des Quests est conservée.", retry: "Réessayer", extraInfo: "Informations supplémentaires", integrationPreparing: "Préparation", settingsLarge: "Grande", settingsRelaxed: "Aérée", ariaLanguage: "Langue d’affichage" }),
  de: Object.freeze({ dueUnset: "Kein Termin", todayWord: "Heute", tomorrowWord: "Morgen", minutesSuffix: " Min.", difficultyLabel: "Schwierigkeit", selectQuest: "Auswählen", questListAria: "Quest-Liste für heute. Fokussiere diesen Bereich, um nur die Aufgaben zu scrollen", selectQuestTitle: "Quest auswählen", selectQuestCopy: "Wähle eine Zeile, um sie hier abzuschließen, zu prüfen oder zu bearbeiten.", open: "Öffnen", openDetails: "Quest-Details öffnen", closeDetails: "Quest-Details schließen", treeCompanion: "Astra / Begleiterfigur", treeCached: "Zuletzt synchronisierte Quests. Änderungen warten, bis die Verbindung wieder steht.", treeRules: "Das Abschließen einer Eltern-Quest schließt Unter-Quests nicht automatisch ab.", battleQueueEmpty: "Keine Quests können MP geben.", partyCurrentQuest: "Aktuelle Quest", unassigned: "Nicht zugewiesen", statusLabel: "Status", estimate: "Schätzung", partyCheckQuest: "Zugewiesene Quest öffnen", profileTitleSuffix: "s Profil", accountPrefix: "Konto: ", avatarAlt: "s Sentinel-Avatar", avatarLocal: "Auf diesem Gerät eingestellt", avatarDefault: "Standardsymbol wird verwendet", agentPrivateEmpty: "Melde dich mit Google an und lade deine Daten, um dein privates Agent-Register zu verwalten.", agentStatusActive: "Aktiv", agentStatusDisabled: "Deaktiviert", agentStatusArchived: "Archiviert", unlinked: "Nicht verbunden", noInstructions: "Keine Arbeitsanweisung", connectedLabel: "Verbindung", lastUpdated: "Zuletzt aktualisiert", neverUpdated: "Nicht aktualisiert", archiveAgent: "Archivieren", agentHintMany: " autorisierte MCP-Client(s) gefunden.", agentHintNone: "Keine autorisierten MCP-Clients. Schließe eine MCP-Verbindung mit diesem Konto ab, damit sie hier erscheinen.", scopesUsed: "Berechtigungen", lastUsed: "zuletzt verwendet", neverUsed: "nie", panelLoadFailed: "Einige Informationen konnten nicht geladen werden", panelKeep: "Die Quest-Liste bleibt erhalten.", retry: "Erneut versuchen", extraInfo: "Zusätzliche Informationen", integrationPreparing: "Vorbereitung", settingsLarge: "Groß", settingsRelaxed: "Locker", ariaLanguage: "Anzeigesprache" }),
  ko: Object.freeze({ dueUnset: "기한 없음", todayWord: "오늘", tomorrowWord: "내일", minutesSuffix: "분", difficultyLabel: "난이도", selectQuest: "선택", questListAria: "오늘의 Quest 목록. 이 영역에 포커스하면 작업 목록만 스크롤됩니다", selectQuestTitle: "Quest 선택", selectQuestCopy: "행을 선택하면 여기서 완료, 확인 또는 수정할 수 있습니다.", open: "열기", openDetails: "Quest 상세 열기", closeDetails: "Quest 상세 닫기", treeCompanion: "Astra / 동료 캐릭터", treeCached: "마지막으로 동기화한 Quest를 표시합니다. 재연결 전까지 변경이 보류됩니다.", treeRules: "상위 Quest를 완료해도 하위 Quest가 자동으로 완료되지는 않습니다.", battleQueueEmpty: "MP를 얻을 수 있는 Quest가 없습니다.", partyCurrentQuest: "현재 Quest", unassigned: "할당되지 않음", statusLabel: "상태", estimate: "예상", partyCheckQuest: "할당된 Quest 확인", profileTitleSuffix: "의 프로필", accountPrefix: "계정: ", avatarAlt: "의 Sentinel 아바타", avatarLocal: "이 기기에 설정됨", avatarDefault: "기본 아이콘 사용 중", agentPrivateEmpty: "Google로 로그인하고 데이터를 불러오면 개인 Agent 목록을 관리할 수 있습니다.", agentStatusActive: "사용 중", agentStatusDisabled: "중지됨", agentStatusArchived: "보관됨", unlinked: "연결 안 됨", noInstructions: "작업 지시 없음", connectedLabel: "연결", lastUpdated: "최근 업데이트", neverUpdated: "업데이트 없음", archiveAgent: "보관", agentHintMany: "개의 승인된 MCP 클라이언트를 찾았습니다.", agentHintNone: "승인된 MCP 클라이언트가 없습니다. 이 계정으로 MCP 연결을 완료하면 여기에 표시됩니다.", scopesUsed: "권한", lastUsed: "최근 사용", neverUsed: "사용 안 함", panelLoadFailed: "일부 정보를 불러오지 못했습니다", panelKeep: "Quest 목록은 유지됩니다.", retry: "다시 시도", extraInfo: "추가 정보", integrationPreparing: "준비 중", settingsLarge: "크게", settingsRelaxed: "여유롭게", ariaLanguage: "표시 언어" }),
  "zh-Hans": Object.freeze({ dueUnset: "未设置期限", todayWord: "今天", tomorrowWord: "明天", minutesSuffix: "分钟", difficultyLabel: "难度", selectQuest: "选择", questListAria: "今日 Quest 列表。聚焦此区域即可只滚动任务列表", selectQuestTitle: "选择一个 Quest", selectQuestCopy: "选择一行后，可在这里完成、确认或编辑。", open: "打开", openDetails: "打开 Quest 详情", closeDetails: "关闭 Quest 详情", treeCompanion: "Astra / 伙伴角色", treeCached: "正在显示上次同步的 Quest。重新连接完成前不会保存修改。", treeRules: "完成父 Quest 不会自动完成子 Quest。", battleQueueEmpty: "没有可以获得 MP 的 Quest。", partyCurrentQuest: "当前 Quest", unassigned: "未分配", statusLabel: "状态", estimate: "预计", partyCheckQuest: "查看分配的 Quest", profileTitleSuffix: "的个人资料", accountPrefix: "账户：", avatarAlt: "的 Sentinel 头像", avatarLocal: "已在此设备设置", avatarDefault: "正在使用默认图标", agentPrivateEmpty: "使用 Google 登录并加载数据，即可管理你的专属 Agent 列表。", agentStatusActive: "使用中", agentStatusDisabled: "已停用", agentStatusArchived: "已归档", unlinked: "未连接", noInstructions: "没有工作说明", connectedLabel: "连接", lastUpdated: "最后更新", neverUpdated: "未更新", archiveAgent: "归档", agentHintMany: "个已授权 MCP 客户端。", agentHintNone: "没有已授权的 MCP 客户端。使用此账户完成 MCP 连接后即可显示。", scopesUsed: "权限", lastUsed: "最后使用", neverUsed: "从未", panelLoadFailed: "部分信息无法加载", panelKeep: "Quest 列表仍然保留。", retry: "重试", extraInfo: "其他信息", integrationPreparing: "准备中", settingsLarge: "大号", settingsRelaxed: "宽松", ariaLanguage: "显示语言" }),
  ru: Object.freeze({ dueUnset: "Без срока", todayWord: "Сегодня", tomorrowWord: "Завтра", minutesSuffix: " мин", difficultyLabel: "Сложность", selectQuest: "Выбрать", questListAria: "Список Quest на сегодня. Переведите фокус сюда, чтобы прокручивать только задачи", selectQuestTitle: "Выберите Quest", selectQuestCopy: "Выберите строку, чтобы завершить, проверить или изменить её здесь.", open: "Открыть", openDetails: "Открыть сведения о Quest", closeDetails: "Закрыть сведения о Quest", treeCompanion: "Astra / персонаж-спутник", treeCached: "Показаны последние синхронизированные Quest. Изменения ждут переподключения.", treeRules: "Завершение родительского Quest не завершает дочерние автоматически.", battleQueueEmpty: "Нет Quest, которые дают MP.", partyCurrentQuest: "Текущий Quest", unassigned: "Не назначено", statusLabel: "Статус", estimate: "Оценка", partyCheckQuest: "Открыть назначенный Quest", profileTitleSuffix: " — профиль", accountPrefix: "Аккаунт: ", avatarAlt: " — аватар Sentinel", avatarLocal: "Настроено на этом устройстве", avatarDefault: "Используется значок по умолчанию", agentPrivateEmpty: "Войдите через Google и загрузите данные, чтобы управлять личным реестром Agent.", agentStatusActive: "Активен", agentStatusDisabled: "Отключён", agentStatusArchived: "В архиве", unlinked: "Не подключён", noInstructions: "Нет инструкции", connectedLabel: "Подключение", lastUpdated: "Обновлено", neverUpdated: "Не обновлялось", archiveAgent: "В архив", agentHintMany: " авторизованных MCP-клиентов найдено.", agentHintNone: "Авторизованных MCP-клиентов нет. Подключите MCP с этим аккаунтом, чтобы увидеть их здесь.", scopesUsed: "прав", lastUsed: "последнее использование", neverUsed: "никогда", panelLoadFailed: "Не удалось загрузить часть данных", panelKeep: "Список Quest сохранён.", retry: "Повторить", extraInfo: "Дополнительные данные", integrationPreparing: "Подготовка", settingsLarge: "Крупный", settingsRelaxed: "Свободный", ariaLanguage: "Язык интерфейса" })
});

const labFieldLabels: Readonly<Record<LabLocale, Readonly<Record<string, string>>>> = Object.freeze({
  ja: Object.freeze({ progressLabel: "進捗", rewardLabel: "報酬" }),
  en: Object.freeze({ progressLabel: "Progress", rewardLabel: "Rewards" }),
  es: Object.freeze({ progressLabel: "Progreso", rewardLabel: "Recompensa" }),
  "pt-BR": Object.freeze({ progressLabel: "Progresso", rewardLabel: "Recompensa" }),
  fr: Object.freeze({ progressLabel: "Progression", rewardLabel: "Récompense" }),
  de: Object.freeze({ progressLabel: "Fortschritt", rewardLabel: "Belohnung" }),
  ko: Object.freeze({ progressLabel: "진행률", rewardLabel: "보상" }),
  "zh-Hans": Object.freeze({ progressLabel: "进度", rewardLabel: "奖励" }),
  ru: Object.freeze({ progressLabel: "Прогресс", rewardLabel: "Награда" }),
});

const labStaticLabels: Readonly<Record<LabLocale, Readonly<Record<string, string>>>> = Object.freeze({
  ja: Object.freeze({ tasksHeading: "今やるQuestを選ぶ", demoData: "デモデータ", notSynced: "未同期", localDevice: "この端末", remoteMode: "Guilduo本体", remoteStale: "Guilduo本体（再接続待ち）", profileSettings: "表示と通知を設定", profileRoleNote: "Astraは操作するキャラクター。アカウント名はあなた自身です。", changeAvatar: "キャラクターアイコンを変更", campaignTitle: "Guilduoの公開準備", campaignProgress: "72% / 3つの子Questのうち1つを完了", openTree: "Quest Treeを開く", accountStatus: "同期と安全性", storageLocation: "保存先", firebaseSync: "Appwrite同期", externalConnections: "外部連携", aiConnection: "AI接続", checkConnections: "連携を確認", autoConnectTitle: "起動時に本体へ自動接続", autoConnectCopy: "この端末のGuilduo起動時に自動で同期します。", lastSync: "最終同期", currentStorage: "現在の保存先" }),
  en: Object.freeze({ tasksHeading: "Choose today's Quests", demoData: "Demo data", notSynced: "Not synced yet", localDevice: "This device", remoteMode: "Guilduo", remoteStale: "Guilduo (reconnecting)", profileSettings: "Display and notification settings", profileRoleNote: "Astra is the character you operate. The account name is you.", changeAvatar: "Change character icon", campaignTitle: "Guilduo public beta", campaignProgress: "72% / 1 of 3 child Quests complete", openTree: "Open Quest Tree", accountStatus: "Sync and safety", storageLocation: "Storage", firebaseSync: "Appwrite sync", externalConnections: "External connections", aiConnection: "AI connection", checkConnections: "Check connections", autoConnectTitle: "Reconnect Guilduo on startup", autoConnectCopy: "Sync automatically when Guilduo starts on this device.", lastSync: "Last sync", currentStorage: "Current storage" }),
  es: Object.freeze({ tasksHeading: "Elige las Quests de hoy", demoData: "Datos de demo", notSynced: "Aún no sincronizado", localDevice: "Este dispositivo", remoteMode: "QuestForge", remoteStale: "QuestForge (reconectando)", profileSettings: "Ajustes de pantalla y avisos", profileRoleNote: "Astra es el personaje que manejas. El nombre de la cuenta eres tú.", changeAvatar: "Cambiar icono del personaje", campaignTitle: "Beta pública de QuestForge", campaignProgress: "72% / 1 de 3 sub-Quests completada", openTree: "Abrir árbol de Quests", accountStatus: "Sincronización y seguridad", storageLocation: "Almacenamiento", firebaseSync: "Sincronización Firebase", externalConnections: "Conexiones externas", aiConnection: "Conexión de IA", checkConnections: "Comprobar conexiones", autoConnectTitle: "Reconectar QuestForge al iniciar", autoConnectCopy: "Sincroniza automáticamente al iniciar QuestForge en este dispositivo.", lastSync: "Última sincronización", currentStorage: "Almacenamiento actual" }),
  "pt-BR": Object.freeze({ tasksHeading: "Escolha as Quests de hoje", demoData: "Dados de demonstração", notSynced: "Ainda não sincronizado", localDevice: "Este dispositivo", remoteMode: "QuestForge", remoteStale: "QuestForge (reconectando)", profileSettings: "Configurações de tela e avisos", profileRoleNote: "A Astra é a personagem que você controla. O nome da conta é você.", changeAvatar: "Alterar ícone da personagem", campaignTitle: "Beta pública do QuestForge", campaignProgress: "72% / 1 de 3 sub-Quests concluída", openTree: "Abrir árvore de Quests", accountStatus: "Sincronização e segurança", storageLocation: "Armazenamento", firebaseSync: "Sincronização Firebase", externalConnections: "Conexões externas", aiConnection: "Conexão de IA", checkConnections: "Verificar conexões", autoConnectTitle: "Reconectar QuestForge ao iniciar", autoConnectCopy: "Sincronize automaticamente ao iniciar o QuestForge neste dispositivo.", lastSync: "Última sincronização", currentStorage: "Armazenamento atual" }),
  fr: Object.freeze({ tasksHeading: "Choisissez les Quests du jour", demoData: "Données de démo", notSynced: "Pas encore synchronisé", localDevice: "Cet appareil", remoteMode: "QuestForge", remoteStale: "QuestForge (reconnexion)", profileSettings: "Réglages d’affichage et de notifications", profileRoleNote: "Astra est le personnage que vous contrôlez. Le nom du compte, c’est vous.", changeAvatar: "Changer l’icône du personnage", campaignTitle: "Bêta publique de QuestForge", campaignProgress: "72 % / 1 des 3 sous-Quests terminée", openTree: "Ouvrir l’arbre des Quests", accountStatus: "Synchronisation et sécurité", storageLocation: "Stockage", firebaseSync: "Synchronisation Firebase", externalConnections: "Connexions externes", aiConnection: "Connexion IA", checkConnections: "Vérifier les connexions", autoConnectTitle: "Reconnecter QuestForge au démarrage", autoConnectCopy: "Synchroniser automatiquement au démarrage de QuestForge sur cet appareil.", lastSync: "Dernière synchronisation", currentStorage: "Stockage actuel" }),
  de: Object.freeze({ tasksHeading: "Heutige Quests auswählen", demoData: "Demodaten", notSynced: "Noch nicht synchronisiert", localDevice: "Dieses Gerät", remoteMode: "QuestForge", remoteStale: "QuestForge (Verbindung wird hergestellt)", profileSettings: "Anzeige- und Benachrichtigungseinstellungen", profileRoleNote: "Astra ist die Figur, die du steuerst. Der Kontoname bist du.", changeAvatar: "Charakter-Icon ändern", campaignTitle: "Öffentliche QuestForge-Beta", campaignProgress: "72 % / 1 von 3 Unter-Quests abgeschlossen", openTree: "Quest-Baum öffnen", accountStatus: "Synchronisierung und Sicherheit", storageLocation: "Speicher", firebaseSync: "Firebase-Synchronisierung", externalConnections: "Externe Verbindungen", aiConnection: "KI-Verbindung", checkConnections: "Verbindungen prüfen", autoConnectTitle: "QuestForge beim Start verbinden", autoConnectCopy: "Beim Start von QuestForge auf diesem Gerät automatisch synchronisieren.", lastSync: "Letzte Synchronisierung", currentStorage: "Aktueller Speicher" }),
  ko: Object.freeze({ tasksHeading: "오늘 할 Quest 선택", demoData: "데모 데이터", notSynced: "아직 동기화되지 않음", localDevice: "이 기기", remoteMode: "QuestForge", remoteStale: "QuestForge (재연결 중)", profileSettings: "화면 및 알림 설정", profileRoleNote: "Astra는 사용자가 조작하는 캐릭터입니다. 계정 이름은 사용자 본인입니다.", changeAvatar: "캐릭터 아이콘 변경", campaignTitle: "QuestForge 공개 베타", campaignProgress: "72% / 하위 Quest 3개 중 1개 완료", openTree: "Quest 트리 열기", accountStatus: "동기화 및 보안", storageLocation: "저장 위치", firebaseSync: "Firebase 동기화", externalConnections: "외부 연결", aiConnection: "AI 연결", checkConnections: "연결 확인", autoConnectTitle: "시작할 때 QuestForge 자동 연결", autoConnectCopy: "이 기기에서 QuestForge를 시작하면 자동으로 동기화합니다.", lastSync: "최근 동기화", currentStorage: "현재 저장 위치" }),
  "zh-Hans": Object.freeze({ tasksHeading: "选择今天要做的 Quest", demoData: "演示数据", notSynced: "尚未同步", localDevice: "此设备", remoteMode: "QuestForge", remoteStale: "QuestForge（正在重新连接）", profileSettings: "显示与通知设置", profileRoleNote: "Astra 是你操作的角色。账户名称代表你本人。", changeAvatar: "更换角色图标", campaignTitle: "QuestForge 公开测试版", campaignProgress: "72% / 3 个子 Quest 完成 1 个", openTree: "打开 Quest 树", accountStatus: "同步与安全", storageLocation: "存储位置", firebaseSync: "Firebase 同步", externalConnections: "外部连接", aiConnection: "AI 连接", checkConnections: "检查连接", autoConnectTitle: "启动时自动连接 QuestForge", autoConnectCopy: "在此设备启动 QuestForge 时自动同步。", lastSync: "上次同步", currentStorage: "当前存储" }),
  ru: Object.freeze({ tasksHeading: "Выберите Quest на сегодня", demoData: "Демо-данные", notSynced: "Ещё не синхронизировано", localDevice: "Это устройство", remoteMode: "QuestForge", remoteStale: "QuestForge (переподключение)", profileSettings: "Настройки отображения и уведомлений", profileRoleNote: "Astra — персонаж, которым вы управляете. Имя аккаунта — это вы.", changeAvatar: "Изменить значок персонажа", campaignTitle: "Публичная бета QuestForge", campaignProgress: "72% / 1 из 3 дочерних Quest завершён", openTree: "Открыть дерево Quest", accountStatus: "Синхронизация и безопасность", storageLocation: "Хранилище", firebaseSync: "Синхронизация Firebase", externalConnections: "Внешние подключения", aiConnection: "Подключение ИИ", checkConnections: "Проверить подключения", autoConnectTitle: "Подключать QuestForge при запуске", autoConnectCopy: "Автоматически синхронизировать при запуске QuestForge на этом устройстве.", lastSync: "Последняя синхронизация", currentStorage: "Текущее хранилище" })
});

function labText(key: string, variables: Record<string, unknown> = {}): string {
  const translationKey = labTranslationKeys[key];
  if (translationKey) {
    const translated = t(translationKey, variables);
    if (translated !== translationKey) return translated;
  }
  return labLabels[getLocale()]?.[key] || labExtraLabels[getLocale()]?.[key] || labContentLabels[getLocale()]?.[key] || labFieldLabels[getLocale()]?.[key] || labStaticLabels[getLocale()]?.[key] || labExtraLabels.en[key] || labContentLabels.en[key] || labFieldLabels.en[key] || labStaticLabels.en[key] || labLabels.en[key] || key;
}

function applyLabLocale() {
  const locale = getLocale();
  applyDocumentTranslations();
  document.documentElement.lang = LOCALE_METADATA[locale]?.tag || locale;
  const select = $("#labLocaleSelect");
  if (select) select.value = locale;
  const labels: Record<LabView, string> = { today: "today", quests: "tasksHeading", tree: "tree", agents: "agentHeading", reviews: "confirm", battle: "battle", party: "party", integrations: "integrations", profile: "profile", settings: "settings" };
  const referenceNavLabels: Partial<Record<LabView, string>> = {
    today: "今日の作戦",
    quests: "クエスト",
    tree: "探索 / ツリー",
    agents: "エージェント",
    reviews: "レビュー",
    battle: "戦闘・報酬",
    party: "パーティ",
    integrations: "統合・連携",
    profile: "プロフィール",
    settings: "設定",
  };
  const moreLabel = $("#mobileMoreToggle b");
  if (moreLabel) moreLabel.textContent = labText("more");
  $$('[data-view]').forEach((button) => {
    const view = button.dataset.view;
    const key = view && view in labels ? labels[view as LabView] : undefined;
    const textNode = button.querySelector("b") || button.querySelector("span:last-child");
    if (textNode && visualFixtureEnabled && view && referenceNavLabels[view as LabView]) textNode.textContent = referenceNavLabels[view as LabView] || "";
    else if (key && textNode) textNode.textContent = labText(key);
  });
  const titleKey = labels[state.view];
  if (titleKey && $("#pageTitle")) $("#pageTitle").textContent = labText(titleKey);
  if ($("#todayTitle")) $("#todayTitle").textContent = labText("tasksHeading");
  if ($("#treeTitle")) $("#treeTitle").textContent = labText("treeHeading");
  if ($("#battleTitle")) $("#battleTitle").textContent = labText("battleHeading");
  if ($("#partyTitle")) $("#partyTitle").textContent = labText("partyHeading");
  if ($("#integrationsTitle")) $("#integrationsTitle").textContent = labText("integrationHeading");
  const agentsKicker = $("#agentsKicker");
  if (agentsKicker) agentsKicker.textContent = visualFixtureEnabled && state.view === "agents"
    ? "AIエージェントのリアルタイム運用状況と連携を監視・制御します。"
    : "AGENT OPERATIONS / STATUS";
  const targets = {
    "#filterAll": "all", "#filterPriority": "priority", "#sortButton": "sortDue", "#toggleArchived": "showArchived", "#toggleArchivedTree": "showArchived",
    "#clearSelection": "clearSelection", "#bulkCompleteButton": "complete", "#bulkArchiveButton": "archive", "#bulkRestoreButton": "restore", "#collapseTree": "collapse",
    "#completeButton": "complete", "#reviewButton": "confirm", "#editQuestButton": "edit", "#archiveQuestButton": "archive", "#previewButton": "preview", "#syncButton": "sync", "#signInButton": "signIn", "#signOutButton": "signOut", "#loadRemoteButton": "loadData",
    "#useLocalButton": "useLocal", "#reconnectButton": "reconnect", "#settingsTitle": "settingsHeading", "#displayHeading": "displayHeading",
    "#feedbackHeading": "feedbackHeading", "#shortcutsHeading": "shortcutsHeading", "#connectionHeading": "connectionHeading", "#agentHeading": "agentHeadingFallback",
    "#languageLabel": "language", "#languageNote": "languageNote", "#typeScaleLabel": "typeScale", "#typeScaleNote": "typeScaleNote", "#densityLabel": "density", "#densityNote": "densityNote", "#mobileDetailLabel": "mobileDetail", "#mobileDetailNote": "mobileDetailNote",
    "#motionLabel": "motion", "#motionNote": "motionNote", "#soundLabel": "sound", "#soundNote": "soundNote", "#profileShortcut": "profileShortcut", "#partyShortcut": "partyShortcut", "#integrationShortcut": "integrationShortcut", "#agentFormReset": "newAgent", "#linkAgentClient": "link",
    "#telemetryTitle": "telemetryTitle", "#telemetryCopy": "telemetryCopy", "#telemetryOptIn": "telemetryOptIn",
    "#profileSettingsButton": "profileSettings", "#profileRoleNote": "profileRoleNote", "#changeAvatarLabel": "changeAvatar", "#campaignTitle": "campaignTitle", "#campaignProgress": "campaignProgress", "#openTreeButton": "openTree", "#accountStatusTitle": "accountStatus", "#storageLocationLabel": "storageLocation", "#externalConnectionsLabel": "externalConnections", "#aiConnectionLabel": "aiConnection", "#checkConnectionsButton": "checkConnections", "#autoConnectTitle": "autoConnectTitle", "#autoConnectCopy": "autoConnectCopy", "#lastSyncLabel": "lastSync", "#currentStorageLabel": "currentStorage",
  };
  Object.entries(targets).forEach(([selector, key]) => { const node = $(selector); if (node) node.textContent = labText(key); });
  if ($("#integrationPublicBetaNote") && !externalOAuthEnabled) $("#integrationPublicBetaNote").textContent = labText("earlyAccess");
  if ($("#reconnectButton")) $("#reconnectButton").textContent = labText("reconnect");
}

const savedLabState = readLabState();
const savedRemoteState = Boolean(savedLabState?.dataSource === "remote" || savedLabState?.remoteMode === true);
const savedAuthUser = asJsonRecord(savedLabState?.authUser);
const savedRemoteOwnerUid = String(savedLabState?.remoteOwnerUid || savedAuthUser.uid || "").trim();
const savedRemoteStatePayload = savedRemoteState && savedLabState ? JSON.parse(JSON.stringify(savedLabState)) : null;
if (savedLabState) {
  Object.assign(state, savedLabState);
  state.expanded = new Set(savedLabState.expanded || ["qf-ui"]);
  state.selectedQuestIds = Array.isArray(savedLabState.selectedQuestIds) ? savedLabState.selectedQuestIds.slice(0, 100) : [];
  state.selectionAnchorId = String(savedLabState.selectionAnchorId || "");
  state.timerId = null;
}
try {
  const savedGatewayUrl = localStorage.getItem("questforge-interaction-lab-gateway-url");
  if (savedGatewayUrl) state.gatewayUrl = savedGatewayUrl;
} catch {
  // Keep the configured default when local storage is unavailable.
}

// Appwrite Auth restores asynchronously. Keep a remote cache candidate, but do not expose it
// until the restored UID matches the owner recorded with the cache.
state.dataSource = "local";
state.syncStatus = state.remoteSnapshotAvailable ? "reconnecting" : "local-only";
state.remoteMode = false;
state.remoteOwnerUid = savedRemoteState ? savedRemoteOwnerUid : "";
state.remoteSnapshotAvailable = savedRemoteState && Boolean(savedRemoteOwnerUid);
state.remoteConnectionState = state.remoteSnapshotAvailable ? "auth-checking" : "local";
state.autoConnectEnabled = false;
state.authUser = null;
if (savedRemoteState) {
  const localBackup = readLocalBackup();
  if (localBackup?.quests && Array.isArray(localBackup.quests)) {
    Object.assign(state, localBackup, { authUser: null, remoteMode: false, dataSource: "local", syncStatus: "local-only" });
    state.expanded = new Set(localBackup.expanded || ["qf-ui"]);
    state.selectedQuestIds = Array.isArray(localBackup.selectedQuestIds) ? localBackup.selectedQuestIds.slice(0, 100) : [];
    state.selectionAnchorId = String(localBackup.selectionAnchorId || "");
    state.timerId = null;
    state.remoteIntegrations = [];
    state.remoteOwnerUid = savedRemoteOwnerUid;
    state.remoteSnapshotAvailable = Boolean(savedRemoteOwnerUid);
    state.remoteConnectionState = savedRemoteOwnerUid ? "auth-checking" : "local";
    state.syncStatus = savedRemoteOwnerUid ? "reconnecting" : "local-only";
  } else {
    state.quests = [];
    state.selectedQuestId = "";
    state.selectedQuestIds = [];
    state.selectionAnchorId = "";
    state.remoteIntegrations = [];
    state.registeredAgents = [];
    state.agentConnections = { authorizedClients: [], connections: [] };
    state.profile = null;
    state.avatarDataUrl = "";
    state.remoteParty = null;
    state.panelErrors = [];
    state.battleSession = null;
    state.mp = 68;
    state.bossHp = 71;
  }
}

try {
  const savedSettings = JSON.parse(localStorage.getItem("questforge-interaction-settings") || "null");
  if (savedSettings && typeof savedSettings === "object") {
    state.settings = { ...state.settings, ...savedSettings };
    if (!["arcane", "soft-ops", "retro"].includes(state.settings.theme)) state.settings.theme = "soft-ops";
    if (!["light", "dark", "system"].includes(state.settings.mode)) state.settings.mode = "dark";
  }
} catch {
  // Keep the safe defaults when a local setting payload is malformed.
}
try {
  const savedDetailMode = localStorage.getItem("questforge-interaction-detail-mode");
  if (savedDetailMode === "sheet" || savedDetailMode === "modal") state.detailMode = savedDetailMode;
  state.showArchived = localStorage.getItem("questforge-interaction-archive-visible") === "true";
  state.avatarDataUrl = localStorage.getItem("questforge-interaction-avatar") || "";
} catch {
  // Keep the default view when local storage is unavailable.
}

const partyMembers: PartyMember[] = [
  { name: "Astra", identity: "HUMAN / PLAYER", role: "相棒キャラ Astra / Sentinel", mark: "AS", state: "working", task: "Forge Opsの採用フローを決める", avatar: "../assets/avatar-role-femme-sentinel.webp" },
  { name: "Cyan", identity: "AGENT / ENGINEER", role: "UI / 実装", mark: "C/", state: "review", task: "Pixel 9の操作を返却" },
  { name: "Archivist", identity: "AGENT / ARCHIVIST", role: "翻訳 / 記録", mark: "A", state: "working", task: "長い表示文を確認中" },
  { name: "Operator", identity: "AGENT / OPERATOR", role: "MCP / 連携", mark: "O", state: "blocked", task: "接続設定を待機中" }
];

/* Reference Golden capture fixture. It is enabled only by visual:capture in DEV; production/local state never reads it. */
const visualFixtureEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get("visualFixture") === "v3";
const referenceCaptureMembers: PartyMember[] = [
  { name: "You", identity: "HUMAN / PLAYER", role: "Commander", mark: "YO", state: "working", task: "QuestForge operation", avatar: "../assets/avatar-role-femme-sentinel.webp" },
  { name: "Astra", identity: "AGENT / SENTINEL", role: "Companion", mark: "AS", state: "working", task: "Quest prioritization" },
  { name: "Codex", identity: "AGENT / ENGINEER", role: "Implementation", mark: "CX", state: "working", task: "README improvement" },
  { name: "Scout", identity: "AGENT / RESEARCH", role: "Research", mark: "SC", state: "working", task: "Reference review" },
  { name: "Ops", identity: "AGENT / OPERATOR", role: "MCP / Sync", mark: "OP", state: "review", task: "Connection review" },
  { name: "Echo", identity: "AGENT / REVIEW", role: "Review", mark: "EC", state: "ready", task: "Return queue" }
];

const integrations: LabIntegration[] = [
  { id: "calendar", providerId: "google-calendar", name: "Google Calendar", short: "GC", stateKey: "integration.status.connected", copyKey: "service.google-calendar.description", titleKey: "service.google-calendar.type", detailKey: "service.google-calendar.rule1", activityKeys: ["service.google-calendar.rule1", "service.google-calendar.rule2", "service.google-calendar.rule3"], lastSync: "2026-08-14T16:30:00", scope: "2 calendars", nextStepKey: "integration.preview" },
  { id: "tasks", providerId: "google-tasks", name: "Google Tasks", short: "GT", stateKey: "integration.status.admin_setup_required", copyKey: "service.google-tasks.description", titleKey: "service.google-tasks.type", detailKey: "service.google-tasks.rule3", activityKeys: ["service.google-tasks.rule1", "service.google-tasks.rule2", "service.google-tasks.rule3"], lastSync: "", scope: "1 task list", nextStepKey: "integration.resource" },
  { id: "notion", providerId: "notion", name: "Notion", short: "N", stateKey: "integration.status.planned", copyKey: "service.notion.description", titleKey: "service.notion.type", detailKey: "service.notion.rule1", activityKeys: ["service.notion.rule1", "service.notion.rule2", "service.notion.rule3"], lastSync: "", scope: "QuestForge Logs", nextStepKey: "integration.resource" },
  { id: "focus", providerId: "toggl-focus", name: "Toggl Focus", short: "TF", stateKey: "integration.status.connected", copyKey: "service.toggl-focus.description", titleKey: "service.toggl-focus.type", detailKey: "service.toggl-focus.rule3", activityKeys: ["service.toggl-focus.rule1", "service.toggl-focus.rule2", "service.toggl-focus.rule3"], lastSync: "2026-08-14T16:20:00", scope: "Focus session", nextStepKey: "integration.preview" }
];

const $ = <T extends Element = LabElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Interaction Lab element not found: ${selector}`);
  return element;
};
const $$ = <T extends Element = LabElement>(selector: string): T[] => [...document.querySelectorAll<T>(selector)];
const quest = (id: string): LabQuest | undefined => state.quests.find((item) => item.id === id);
const repository = new QuestForgeRepository({ baseUrl: state.gatewayUrl, getToken: getIdToken });
const externalOAuthEnabled = globalThis.QuestForgeConfig?.externalOAuthEnabled === true;
let remoteLoadPromise: Promise<boolean> | null = null;
let observedUid = "";
let partyFormationIslandHandle: IslandHandle<PartyFormationViewModel> | null = null;
let partyFormationIslandModule: Promise<typeof import("../ui/islands/PartyFormation.tsx")> | null = null;
let integrationControlPlaneIslandHandle: IslandHandle<IntegrationControlPlaneViewModel> | null = null;
let integrationControlPlaneIslandModule: Promise<typeof import("../ui/islands/IntegrationControlPlane.tsx")> | null = null;
let questDependencyGraphIslandHandle: IslandHandle<QuestGraphViewModel> | null = null;
let questDependencyGraphIslandModule: Promise<typeof import("../ui/islands/QuestDependencyGraph.tsx")> | null = null;

function persistState() {
  writeLabState(state);
}

function formatSyncTime(value: string | number | Date = new Date()): string {
  return new Intl.DateTimeFormat(getLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function setSyncStatus(status: string, message = ""): void {
  state.syncStatus = status;
  const statusNode = $("#dataSourceStatus");
  const userNode = $("#connectionUser");
  if (statusNode) {
    const labels: Record<string, string> = {
      "local-only": labText("localOnly"),
      synced: labText("synced"),
      syncing: labText("syncing"),
      reconnecting: labText("reconnecting"),
      error: labText("error"),
    };
    statusNode.textContent = message || labels[status] || status;
    statusNode.dataset.status = status;
  }
  if (userNode) userNode.textContent = state.authUser?.email
    ? state.authUser.email
    : state.remoteConnectionState === "auth-checking" ? labText("authChecking") : labText("loginBefore");
  const signInButton = $("#signInButton");
  const signOutButton = $("#signOutButton");
  const loadButton = $("#loadRemoteButton");
  const autoConnectToggle = $("#autoConnectToggle");
  if (signInButton) signInButton.hidden = Boolean(state.authUser);
  if (signOutButton) signOutButton.hidden = !state.authUser;
  if (loadButton) loadButton.disabled = !state.authUser || ["syncing", "reconnecting"].includes(status);
  if (autoConnectToggle) {
    autoConnectToggle.disabled = !state.authUser;
    autoConnectToggle.checked = Boolean(state.authUser && state.autoConnectEnabled);
  }
  const reconnectButton = $("#reconnectButton");
  if (reconnectButton) {
    reconnectButton.hidden = !state.authUser;
    reconnectButton.disabled = ["syncing", "reconnecting"].includes(status);
    reconnectButton.textContent = status === "syncing" || status === "reconnecting" ? labText("reconnecting") : labText("reconnect");
  }
  document.body.classList.toggle("is-syncing", Boolean(state.authUser && ["syncing", "reconnecting"].includes(status)));
}

function remoteWritable() {
  return Boolean(state.remoteMode && state.remoteConnectionState === "synced");
}

function ensureRemoteWritable() {
  if (!state.remoteMode || remoteWritable()) return true;
  notify("本体データを再接続中です。同期が完了してから操作できます。");
  return false;
}

function localMode(message = "ローカルモードで利用中") {
  remoteLoadGeneration += 1;
  if (state.authUser?.uid) writeAutoConnectPreference(state.authUser.uid, false);
  state.remoteMode = false;
  state.dataSource = "local";
  state.remoteOwnerUid = "";
  state.remoteSnapshotAvailable = false;
  state.remoteConnectionState = "local";
  state.autoConnectEnabled = false;
  setSyncStatus("local-only", message);
  persistState();
}

function restoreLocalBackupState() {
  const backup = readLocalBackup();
  if (!backup || !Array.isArray(backup.quests)) return false;
  const authUser = state.authUser;
  Object.assign(state, backup, {
    authUser,
    remoteMode: false,
    dataSource: "local",
    syncStatus: "local-only",
    remoteOwnerUid: "",
    remoteConnectionState: "local",
    remoteSnapshotAvailable: false,
    autoConnectEnabled: false,
  });
  state.expanded = new Set(backup.expanded || ["qf-ui"]);
  state.selectedQuestIds = Array.isArray(backup.selectedQuestIds) ? backup.selectedQuestIds.slice(0, 100) : [];
  state.selectionAnchorId = String(backup.selectionAnchorId || "");
  state.timerId = null;
  state.remoteIntegrations = [];
  return true;
}

function restoreRemoteCacheForUser(uid: string): boolean {
  const ownerUid = String(uid || "").trim();
  if (!ownerUid) return false;
  if (savedRemoteStatePayload && savedRemoteOwnerUid === ownerUid) {
    const authUser = state.authUser;
    const autoConnectEnabled = state.autoConnectEnabled;
    Object.assign(state, savedRemoteStatePayload, {
      authUser,
      remoteMode: true,
      dataSource: "remote",
      remoteOwnerUid: ownerUid,
      remoteSnapshotAvailable: true,
      remoteConnectionState: "reconnecting",
      syncStatus: "reconnecting",
    });
    state.autoConnectEnabled = autoConnectEnabled;
    state.expanded = new Set(savedRemoteStatePayload.expanded || ["qf-ui"]);
    state.selectedQuestIds = Array.isArray(savedRemoteStatePayload.selectedQuestIds) ? savedRemoteStatePayload.selectedQuestIds.slice(0, 100) : [];
    state.selectionAnchorId = String(savedRemoteStatePayload.selectionAnchorId || "");
    state.timerId = null;
    return true;
  }
  const cached = readRemoteSnapshot(ownerUid);
  if (!cached?.snapshot) return false;
  if (typeof cached.gatewayUrl === "string" && cached.gatewayUrl) {
    state.gatewayUrl = cached.gatewayUrl;
    repository.setBaseUrl(cached.gatewayUrl);
  }
  hydrateRemoteSnapshot(normalizeRemoteSnapshot(cached.snapshot), { saveLocalBackup: false, connectionState: "reconnecting" });
  if (typeof cached.savedAt === "string" && cached.savedAt) state.lastSyncAt = formatSyncTime(cached.savedAt);
  return true;
}

let remoteLoadGeneration = 0;

function escapeHtml(value: unknown): string {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  return String(value ?? "").replace(/[&<>'"]/g, (character) => replacements[character] || character);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isLabView(value: string | undefined): value is LabView {
  return value === "today" || value === "quests" || value === "tree" || value === "agents" || value === "reviews" || value === "battle" || value === "party" || value === "integrations" || value === "profile" || value === "settings";
}

function closestLabElement(event: LabEvent, selector: string): LabElement | null {
  return (event.target as Element).closest(selector) as LabElement | null;
}

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asJsonRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asJsonRecord) : [];
}

function stringField(record: JsonRecord, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function numberField(record: JsonRecord, key: string, fallback = 0): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeRemoteSnapshot(value: unknown): RemoteSnapshot {
  const record = asJsonRecord(value);
  const integrations = asJsonRecordArray(record.integrations).map((item) => ({
    id: stringField(item, "id"),
    providerId: stringField(item, "providerId"),
    name: stringField(item, "name"),
    short: stringField(item, "short"),
    stateKey: stringField(item, "stateKey"),
    copyKey: stringField(item, "copyKey"),
    titleKey: stringField(item, "titleKey"),
    detailKey: stringField(item, "detailKey"),
    activityKeys: Array.isArray(item.activityKeys) ? item.activityKeys.map(String) : [],
    lastSync: stringField(item, "lastSync"),
    scope: stringField(item, "scope"),
    nextStepKey: stringField(item, "nextStepKey"),
    status: typeof item.status === "string" ? item.status : undefined,
  }));
  const profileValue = record.profile;
  const profileRecord = profileValue && typeof profileValue === "object" && !Array.isArray(profileValue) ? asJsonRecord(profileValue) : null;
  const profile: LabProfile | null = profileRecord ? {
    displayName: stringField(profileRecord, "displayName"),
    handle: stringField(profileRecord, "handle"),
    bio: stringField(profileRecord, "bio"),
    avatarRole: stringField(profileRecord, "avatarRole"),
    avatarVariant: stringField(profileRecord, "avatarVariant"),
    avatarUrl: stringField(profileRecord, "avatarUrl"),
    ...profileRecord,
  } : null;
  const agents = asJsonRecordArray(record.agents).map((item) => ({
    agentId: stringField(item, "agentId"),
    displayName: stringField(item, "displayName", stringField(item, "agentId")),
    provider: stringField(item, "provider", "generic"),
    role: stringField(item, "role", "assistant"),
    instructions: stringField(item, "instructions"),
    status: stringField(item, "status", "active"),
    updatedAt: stringField(item, "updatedAt"),
    defaultHandoffState: stringField(item, "defaultHandoffState", "ready"),
    ...item,
  }));
  const connectionRecord = asJsonRecord(record.agentConnections);
  const authorizedClients = asJsonRecordArray(connectionRecord.authorizedClients).map((item) => ({
    clientId: stringField(item, "clientId"),
    clientName: stringField(item, "clientName", stringField(item, "clientId")),
    scopes: Array.isArray(item.scopes) ? item.scopes.map(String) : [],
    lastUsedAt: stringField(item, "lastUsedAt"),
    ...item,
  }));
  const connections = asJsonRecordArray(connectionRecord.connections).map((item) => ({
    clientId: stringField(item, "clientId"),
    agentId: stringField(item, "agentId"),
    revokedAt: stringField(item, "revokedAt"),
    ...item,
  }));
  const partyValue = record.party;
  const party = partyValue && typeof partyValue === "object" && !Array.isArray(partyValue) ? asJsonRecord(partyValue) as LabParty : null;
  const panelErrors = asJsonRecordArray(record.panelErrors).map((item) => ({ index: numberField(item, "index"), message: stringField(item, "message", "読み込みに失敗しました。") }));
  return {
    quests: asJsonRecordArray(record.quests),
    total: numberField(record, "total"),
    character: asJsonRecord(record.character),
    battle: asJsonRecord(record.battle),
    integrations,
    profile,
    party,
    agents,
    agentConnections: { authorizedClients, connections },
    panelErrors,
  };
}

function difficultyValue(value: unknown): number {
  if (typeof value === "number") return Math.max(1, Math.min(5, value));
  return { trivial: 1, easy: 2, medium: 3, hard: 4, very_hard: 5 }[String(value || "").toLowerCase()] || 2;
}

function displayDue(value: unknown): string {
  if (!value) return labText("dueUnset");
  const raw = String(value);
  const datePart = raw.slice(0, 10);
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const prefix = datePart === todayKey ? labText("todayWord") : datePart === tomorrowKey ? labText("tomorrowWord") : `${date.getMonth() + 1}/${date.getDate()}`;
  if (raw.length === 10) return prefix;
  return `${prefix} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isDueSoon(value: unknown): boolean {
  const task = value && typeof value === "object" ? value as LabQuest : null;
  const rawRecord = asJsonRecord(task?.raw);
  const raw = String(rawRecord.dueDate || rawRecord.scheduledDate || task?.due || value || "");
  if (!raw) return false;
  const datePart = raw.slice(0, 10);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return datePart === todayKey || datePart === tomorrow.toISOString().slice(0, 10);
}

function remoteState(task: JsonRecord): string {
  const assignee = asJsonRecord(task.assignee);
  const handoff = stringField(assignee, "handoffState", stringField(asJsonRecord(task.handoff), "state", stringField(task, "handoffState")));
  const lifecycleState = stringField(task, "lifecycleState");
  if (lifecycleState === "archived") return "archived";
  if (lifecycleState === "completed" || task.done === true) return "completed";
  if (handoff === "review_required") return "review";
  if (handoff === "blocked") return "blocked";
  if (handoff === "working") return "working";
  return "ready";
}

function remoteQuestToLab(task: JsonRecord, index = 0): LabQuest {
  const assignee = asJsonRecord(task.assignee);
  const summary = asJsonRecord(task.childrenSummary);
  const rewardObject = asJsonRecord(task.reward);
  const parent = stringField(task, "parentQuestId");
  const progress = numberField(task, "progressPercent", numberField(task, "progress", numberField(summary, "progressPercent")));
  const owner = stringField(assignee, "label", stringField(assignee, "displayName", stringField(assignee, "name", stringField(assignee, "id", stringField(assignee, "agentId", "Astra")))));
  const sourceKind = stringField(task, "kind");
  const kind = parent ? "sub" : sourceKind === "todo" ? "side" : "main";
  const defaultReward = sourceKind === "habit" ? 6 : sourceKind === "daily" ? 14 : 20;
  const reward = numberField(task, "mpGain", numberField(rewardObject, "mp", numberField(task, "reward", defaultReward)));
  const done = task.done === true;
  const lifecycleState = stringField(task, "lifecycleState", done ? "completed" : "active");
  return {
    id: stringField(task, "id", `quest-${index + 1}`),
    code: stringField(task, "code", parent ? `01.${index + 1}` : String(index + 1).padStart(2, "0")),
    kind,
    parent,
    title: stringField(task, "title", "名称未設定のQuest"),
    note: stringField(task, "notes"),
    progress: lifecycleState === "completed" || done ? 100 : Math.max(0, Math.min(100, Math.round(progress))),
    owner,
    mark: partyMember(owner)?.mark || owner.slice(0, 2).toUpperCase(),
    state: remoteState(task),
    due: displayDue(stringField(task, "dueDate", stringField(task, "scheduledDate"))),
    focus: numberField(task, "estimatedMinutes", 30),
    reward: Number.isFinite(reward) ? reward : 14,
    xp: numberField(task, "xpGain", numberField(task, "xp", 60)),
    difficulty: difficultyValue(task.difficulty),
    children: [],
    lifecycleState,
    parentQuestId: parent,
    updatedAt: stringField(task, "updatedAt"),
    raw: task,
    remote: true,
  };
}

function hydrateRemoteSnapshot(snapshot: RemoteSnapshot, { saveLocalBackup = true, connectionState = "synced" }: { saveLocalBackup?: boolean; connectionState?: string } = {}): void {
  if (saveLocalBackup) writeLocalBackup(state);
  const remoteQuests = (snapshot.quests || []).map((item: JsonRecord, index: number) => remoteQuestToLab(item, index));
  remoteQuests.forEach((item: LabQuest) => {
    item.children = remoteQuests.filter((child: LabQuest) => child.parent === item.id).map((child: LabQuest) => child.id);
  });
  state.quests = remoteQuests;
  state.remoteIntegrations = snapshot.integrations || [];
  state.registeredAgents = snapshot.agents || [];
  state.agentConnections = snapshot.agentConnections || { authorizedClients: [], connections: [] };
  state.profile = snapshot.profile || null;
  if (snapshot.profile) state.avatarDataUrl = snapshot.profile.avatarUrl || "";
  state.remoteParty = snapshot.party || null;
  state.panelErrors = snapshot.panelErrors || [];
  state.battleSession = snapshot.battle as LabBattleSession;
  const battleRecord = asJsonRecord(snapshot.battle.battle);
  const bossRecord = asJsonRecord(snapshot.battle.boss);
  state.battleTurn = numberField(battleRecord, "turn", 1);
  state.battleLog = Array.isArray(battleRecord.log) ? battleRecord.log.map(String) : state.battleLog;
  state.mp = numberField(battleRecord, "mp", numberField(snapshot.character, "mp", state.mp));
  state.bossHp = numberField(bossRecord, "hp", numberField(asJsonRecord(snapshot.character.boss), "hp", state.bossHp));
  state.remoteMode = true;
  state.dataSource = "remote";
  state.remoteOwnerUid = state.authUser?.uid || state.remoteOwnerUid;
  state.remoteSnapshotAvailable = true;
  state.remoteConnectionState = connectionState;
  state.lastSyncAt = formatSyncTime();
  state.expanded = new Set([...state.expanded].filter((id) => remoteQuests.some((item) => item.id === id)));
  const remoteIds = new Set(remoteQuests.map((item) => item.id));
  state.selectedQuestIds = (Array.isArray(state.selectedQuestIds) ? state.selectedQuestIds : []).filter((id) => remoteIds.has(id)).slice(0, 100);
  if (!remoteIds.has(state.selectionAnchorId)) state.selectionAnchorId = "";
  if (!quest(state.selectedQuestId)) state.selectedQuestId = remoteQuests[0]?.id || "";
}

async function performRemoteLoad({ announce = true, source = "manual" } = {}) {
  if (!state.authUser) {
    notify("先にGoogleログインを完了してください。ローカルモードはそのまま使えます。");
    return false;
  }
  const generation = remoteLoadGeneration;
  const inputUrl = $("#gatewayUrlInput")?.value.trim() || state.gatewayUrl || gatewayDefaultUrl();
  state.gatewayUrl = inputUrl;
  repository.setBaseUrl(inputUrl);
  try {
    localStorage.setItem("questforge-interaction-lab-gateway-url", inputUrl);
  } catch {
    // A private browsing storage failure must not block the live connection.
  }
  state.remoteConnectionState = state.remoteMode ? "reconnecting" : "syncing";
  setSyncStatus(state.remoteMode ? "reconnecting" : "syncing");
  try {
    const health = await repository.health();
    if (Number(health?.schemaVersion || 0) < 7) {
      throw new QuestForgeApiError(409, "gateway_outdated", "接続先Workerが旧版です。Workerを最新版へデプロイしてから本体データを読み込んでください。");
    }
    const snapshot = await repository.loadSnapshot();
    if (generation !== remoteLoadGeneration || !state.authUser) return false;
    hydrateRemoteSnapshot(normalizeRemoteSnapshot(snapshot), { connectionState: "synced" });
    writeRemoteSnapshot(state.authUser.uid, snapshot, inputUrl);
    if (source === "manual") {
      writeAutoConnectPreference(state.authUser.uid, true);
    }
    state.autoConnectEnabled = readAutoConnectPreference(state.authUser.uid);
    setSyncStatus("synced");
    trackTelemetry("sync_success", { source: "gateway" });
    persistState();
    renderAll({ full: true });
    if (announce) notify(`本体のQuest ${snapshot.total || snapshot.quests.length}件を読み込みました。`);
    return true;
  } catch (error) {
    if (generation !== remoteLoadGeneration || !state.authUser) return false;
    if (state.remoteSnapshotAvailable && state.remoteOwnerUid === state.authUser.uid) {
      state.remoteMode = true;
      state.dataSource = "remote";
      state.remoteConnectionState = "stale";
      setSyncStatus("error", "再接続できません。前回同期した本体データを表示中です。");
    } else {
      state.remoteMode = false;
      state.dataSource = "local";
      state.remoteConnectionState = "error";
      setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "APIへ接続できませんでした。ローカルデータを維持しています。");
    }
    trackTelemetry("sync_failure", { source: "gateway", status: error instanceof QuestForgeApiError ? String(error.status || "error") : "error" });
    renderAll({ full: true });
    if (announce) notify(error instanceof QuestForgeApiError ? error.message : "APIへ接続できませんでした。再試行できます。");
    return false;
  }
}

async function loadRemoteData(options = {}) {
  if (remoteLoadPromise) return remoteLoadPromise;
  const pending = performRemoteLoad(options);
  remoteLoadPromise = pending;
  try {
    return await pending;
  } finally {
    if (remoteLoadPromise === pending) remoteLoadPromise = null;
    renderConnection();
  }
}

function applyRemoteResponse(response: JsonRecord): void {
  if (response?.quest) {
    const responseQuest = asJsonRecord(response.quest);
    const index = state.quests.findIndex((item: LabQuest) => item.id === stringField(responseQuest, "id"));
    const next = remoteQuestToLab(responseQuest, Math.max(0, index));
    if (index >= 0) {
      // Single-quest responses do not include the full tree. Keep the existing child links until the next snapshot.
      next.children = state.quests[index].children || [];
      state.quests[index] = { ...state.quests[index], ...next };
    }
  }
  if (Array.isArray(response?.quests)) {
    response.quests.forEach((value: unknown) => {
      const remoteQuest = asJsonRecord(value);
      const index = state.quests.findIndex((item: LabQuest) => item.id === stringField(remoteQuest, "id"));
      const next = remoteQuestToLab(remoteQuest, Math.max(0, index));
      if (index >= 0) {
        next.children = state.quests[index].children || [];
        state.quests[index] = { ...state.quests[index], ...next };
      } else {
        state.quests.push(next);
      }
    });
    state.quests.forEach((item) => { item.children = state.quests.filter((child) => child.parent === item.id).map((child) => child.id); });
  }
  const session = asJsonRecord(response.session);
  const responseBattle = asJsonRecord(response.battle);
  const battle = asJsonRecord(session.battle || responseBattle.battle || response.battle);
  const boss = asJsonRecord(session.boss || responseBattle.boss || response.boss);
  if (battle) {
    state.battleSession = session as LabBattleSession;
    state.battleTurn = Number(battle.turn || state.battleTurn);
    state.battleLog = Array.isArray(battle.log) ? battle.log.map(String) : state.battleLog;
    state.mp = Number(battle.mp ?? state.mp);
  }
  if (boss) state.bossHp = Number(boss.hp ?? state.bossHp);
  const responseCharacter = asJsonRecord(response.character);
  if (responseCharacter.mp != null) state.mp = Number(responseCharacter.mp);
  state.lastSyncAt = formatSyncTime();
  setSyncStatus("synced");
  persistState();
  renderAll({ full: true });
}

function renderConnection() {
  const input = $("#gatewayUrlInput");
  if (input && document.activeElement !== input) input.value = state.gatewayUrl || gatewayDefaultUrl();
  const syncTime = $("#lastSyncAt");
  if (syncTime) syncTime.textContent = state.lastSyncAt || labText("notSynced");
  const mode = $("#connectionMode");
  if (mode) mode.textContent = state.remoteMode
    ? state.remoteConnectionState === "synced" ? labText("remoteMode") : labText("remoteStale")
    : labText("localDevice");
  const demoBadge = $("#demoDataBadge");
  if (demoBadge) { demoBadge.hidden = state.remoteMode || state.remoteConnectionState === "auth-checking"; demoBadge.textContent = labText("demoData"); }
  setSyncStatus(state.syncStatus);
  const topbarSync = document.querySelector<HTMLElement>("#topbarSyncState");
  const topbarSyncNote = document.querySelector<HTMLElement>("#topbarSyncNote");
  if (topbarSync) topbarSync.textContent = visualFixtureEnabled ? "Synced" : state.remoteMode ? "Synced" : "Local";
  if (topbarSyncNote) topbarSyncNote.textContent = visualFixtureEnabled ? "Just now" : state.remoteMode ? state.remoteConnectionState : state.syncStatus;
  if (visualFixtureEnabled) {
    const setFixtureText = (selector: string, value: string): void => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.textContent = value;
    };
    setFixtureText("#topbarLevel", "42");
    setFixtureText("#topbarXp", "7,842 / 11,000 XP");
    setFixtureText("#timerValue", "Execution");
    setFixtureText("#topbarFocusNote", "+25% XP");
    setFixtureText("#topbarQuestLine", "The Gloom Protocol");
    setFixtureText("#topbarQuestNote", "Phase 2: Sever the Nodes");
    setFixtureText("#topbarMp", "64");
    setFixtureText("#topbarMpMax", "/ 120");
    setFixtureText("#topbarPressure", "34%");
    setFixtureText("#topbarPressureNote", "Rising ↗");
    const topbarMeter = document.querySelector<HTMLMeterElement>("#topbarMpMeter");
    if (topbarMeter) { topbarMeter.value = 64; topbarMeter.setAttribute("value", "64"); }
  }
}

function stateLabel(value: string): string {
  const keys: Record<string, string> = { ready: "task.handoffStates.ready", working: "task.handoffStates.working", blocked: "task.handoffStates.blocked", review: "task.handoffStates.review_required", completed: "task.done", archived: "task.summary.archive" };
  const key = keys[value] || keys.ready;
  const translated = t(key);
  return translated === key ? (labLabels[getLocale()]?.[value] || labLabels.ja[value] || value) : translated;
}

function pill(value: string): string {
  return '<span class="state-pill" data-state="' + value + '">' + stateLabel(value) + "</span>";
}

function partyMember(name: string): PartyMember | undefined {
  const members = activePartyMembers();
  return members.find((member) => member.name === name) || members.find((member) => member.identity === "HUMAN / PLAYER" && ["self", "自分", "Astra"].includes(String(name || "")));
}

function activePartyMembers(): PartyMember[] {
  if (!state.remoteMode) return partyMembers.map((member) => member.name === "Astra" && state.avatarDataUrl ? { ...member, avatar: state.avatarDataUrl } : member);
  const playerName = state.profile?.displayName || state.authUser?.displayName || "あなた";
  const player: PartyMember = { name: playerName, identity: "HUMAN / PLAYER", role: "相棒キャラ Astra / Sentinel", mark: playerName.slice(0, 2).toUpperCase(), state: "working", task: "QuestForgeを運用中", avatar: state.avatarDataUrl || state.profile?.avatarUrl || "../assets/avatar-role-femme-sentinel.webp" };
  return [player, ...(state.registeredAgents || []).filter((agent) => agent.status !== "archived").map((agent) => {
    const assigned = state.quests.find((item) => item.raw?.assignee?.id === agent.agentId);
    return { name: agent.displayName, agentId: agent.agentId, identity: `AGENT / ${String(agent.provider || "generic").toUpperCase()}`, role: agent.role || "assistant", mark: agent.displayName.slice(0, 2).toUpperCase(), state: assigned?.state || (agent.status === "disabled" ? "blocked" : "ready"), task: assigned?.title || agent.instructions || "割り当て待ち" } satisfies PartyMember;
  })];
}

function formationStateLabel(value: string): string {
  if (value === "blocked") return stateLabel("blocked");
  if (value === "review") return stateLabel("review");
  if (value === "working") return stateLabel("working");
  if (value === "completed") return stateLabel("completed");
  return stateLabel("ready");
}

function buildPartyFormationViewModel(): PartyFormationViewModel {
  const actualRemoteMembers = state.remoteMode ? activePartyMembers() : visualFixtureEnabled ? referenceCaptureMembers : [];
  const remotePlayer = actualRemoteMembers.find((member) => member.identity === "HUMAN / PLAYER");
  const player: FormationMember = {
    id: "human",
    name: remotePlayer?.name || state.profile?.displayName || state.authUser?.displayName || "あなた",
    identity: "human",
    identityLabel: "HUMAN / PLAYER",
    role: "Commander",
    avatarSrc: state.avatarDataUrl || state.profile?.avatarUrl || undefined,
    state: remotePlayer?.state || (state.remoteMode ? "ready" : "blocked"),
    stateLabel: formationStateLabel(remotePlayer?.state || (state.remoteMode ? "ready" : "blocked")),
    metrics: [],
  };
  const astra: FormationMember = {
    id: "astra",
    name: "Astra",
    identity: "astra",
    identityLabel: "ASTRA / COMPANION",
    role: "Sentinel",
    avatarSrc: state.avatarDataUrl || state.profile?.avatarUrl || "../assets/avatar-role-femme-sentinel.webp",
    state: "ready",
    stateLabel: formationStateLabel("ready"),
    metrics: [],
  };
  const agentRecords: Array<{ id: string; name: string; provider: string; role: string; state: string; capabilities: string[] }> = state.remoteMode
    ? (state.registeredAgents || []).filter((agent) => agent.status !== "archived").map((agent) => ({
      id: agent.agentId,
      name: agent.displayName,
      provider: String(agent.provider || "generic"),
      role: agent.role || "assistant",
      state: agent.status === "disabled" ? "blocked" : "ready",
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.map(String).filter(Boolean) : [],
    }))
    : visualFixtureEnabled
      ? referenceCaptureMembers.filter((member) => member.identity !== "HUMAN / PLAYER").map((member) => ({
        id: member.agentId || member.name,
        name: member.name,
        provider: member.identity.replace(/^AGENT /, ""),
        role: member.role,
        state: member.state,
        capabilities: [],
      }))
      : [];
  const agents: FormationMember[] = agentRecords.map((agent) => {
    const assigned = state.quests.filter((item) => item.raw?.assignee?.id === agent.id || item.owner === agent.name);
    const activeQuest = assigned.find((item) => !["completed", "archived"].includes(item.state));
    const handoffLoad = assigned.filter((item) => ["working", "review", "blocked"].includes(item.state)).length;
    const agentState = activeQuest?.state || agent.state;
    const capabilities = agent.capabilities;
    return {
      id: agent.id,
      name: agent.name,
      identity: "agent",
      identityLabel: `AGENT / ${agent.provider.toUpperCase()}`,
      role: agent.role,
      avatarSrc: undefined,
      state: agentState,
      stateLabel: formationStateLabel(agentState),
      currentQuest: activeQuest?.title,
      metrics: [
        { label: "ASSIGNED QUEST", value: String(assigned.length), tone: "agent" },
        { label: "QUEUE", value: String(Math.max(0, assigned.length - (activeQuest ? 1 : 0))), tone: "neutral" },
        { label: "HANDOFF LOAD", value: String(handoffLoad), tone: handoffLoad ? "rpg" : "neutral" },
      ],
      capabilities,
    } satisfies FormationMember;
  });
  const remotePartyMembers = state.remoteParty?.members?.length || 0;
  const connectionLabel = state.remoteMode
    ? state.remoteConnectionState === "synced" ? "QuestForge / synced" : `QuestForge / ${state.remoteConnectionState}`
    : "Local state only";
  return {
    title: "Formation",
    subtitle: "表示中の編成は正規のPlayer・Agent Registryから導出された非永続ビューです。",
    connectionLabel,
    members: [player, astra, ...agents],
    socialMemberCount: remotePartyMembers,
    registeredAgentCount: agents.length,
    emptyAgentCopy: state.remoteMode
      ? "Agent Registryに登録済みのAgentがいないため、架空のメンバーは表示していません。"
      : "QuestForge本体へ接続すると、登録済みAgentの割当・Queue・Handoff Loadを表示します。",
  };
}

function disposePartyFormationIsland(): void {
  partyFormationIslandHandle?.unmount();
  partyFormationIslandHandle = null;
  const host = document.querySelector<HTMLElement>("#partyFormationIsland");
  if (host) host.replaceChildren();
}

function renderPartyFormationIsland(): void {
  const host = document.querySelector<HTMLElement>("#partyFormationIsland");
  if (!host || state.view !== "party") return;
  const model = buildPartyFormationViewModel();
  partyFormationIslandModule ||= import("../ui/islands/PartyFormation.tsx");
  void partyFormationIslandModule.then(({ partyFormationIsland }) => {
    if (state.view !== "party" || !host.isConnected) return;
    if (partyFormationIslandHandle) partyFormationIslandHandle.update(model);
    else partyFormationIslandHandle = partyFormationIsland.mount(host, model, {
      onOpenAgentRegistry: () => { setView("agents"); const mount = document.querySelector<HTMLElement>("#agentRegistryMount"); if (mount) mount.hidden = false; document.querySelector("#toggleAgentRegistry")?.setAttribute("aria-expanded", "true"); document.querySelector("#agentRegistryList")?.scrollIntoView({ behavior: "smooth", block: "start" }); },
      onOpenMemberQuest: (memberId: string) => {
        const member = buildPartyFormationViewModel().members.find((item) => item.id === memberId);
        const target = member ? state.quests.find((item) => item.owner === member.name) : undefined;
        if (target) { selectQuest(target.id); setView("today"); }
        else notify((member?.name || memberId) + "に割り当てられたQuestはありません。");
      },
    });
  }).catch(() => { host.dataset.islandLoad = "error"; });
}

function integrationStatus(raw: unknown, hasRemoteRecord: boolean): IntegrationNodeStatus {
  const value = String(raw || "").toLowerCase().replace(/_/g, "-");
  if (["connected", "active", "synced", "ready"].includes(value)) return "connected";
  if (["syncing", "pending", "in-progress"].includes(value)) return "syncing";
  if (["error", "failed", "failure"].includes(value)) return "error";
  if (["unsupported", "not-supported"].includes(value)) return "unsupported";
  if (["early-access", "preparing", "planned"].includes(value)) return "early-access";
  return hasRemoteRecord || externalOAuthEnabled ? "not-configured" : "early-access";
}

function integrationStatusText(status: IntegrationNodeStatus): string {
  return { connected: "接続済み", syncing: "同期中", "early-access": "準備中", error: "エラー", "not-configured": "未設定", unsupported: "未対応" }[status];
}

function buildIntegrationControlPlaneViewModel(): IntegrationControlPlaneViewModel {
  const remoteByKey = new Map<string, LabIntegration>();
  (state.remoteIntegrations || []).forEach((remote) => {
    remoteByKey.set(remote.id, remote);
    remoteByKey.set(remote.providerId, remote);
  });
  const nodes = integrations.map((item) => {
    const remote = remoteByKey.get(item.id) || remoteByKey.get(item.providerId);
    const remoteRecord = remote as (LabIntegration & JsonRecord) | undefined;
    const status = integrationStatus(remoteRecord?.status, Boolean(remote));
    const endpoint = String(remoteRecord?.resource || remoteRecord?.scope || remoteRecord?.target || item.providerId);
    const latencyValue = remoteRecord?.latencyMs ?? remoteRecord?.latency;
    return {
      id: item.id,
      name: item.name,
      type: item.providerId,
      endpoint,
      status,
      statusLabel: integrationStatusText(status),
      latency: latencyValue === undefined || latencyValue === null || latencyValue === "" ? undefined : String(latencyValue).match(/^\d+$/) ? `${latencyValue} ms` : String(latencyValue),
      auth: String(remoteRecord?.accountEmail || remoteRecord?.email || "") || undefined,
    };
  });
  const selectedId = nodes.some((node) => node.id === state.integration) ? state.integration : nodes[0]?.id || "";
  return {
    title: "Integration Control Plane",
    subtitle: "QuestForgeと実在するAdapterの接続状態を、既存の同期状態から描画します。",
    selectedId,
    nodes,
    tableRows: nodes,
    connectedCount: nodes.filter((node) => node.status === "connected").length,
    previewCount: 0,
    safeRuleCount: 0,
  };
}

function disposeIntegrationControlPlaneIsland(): void {
  integrationControlPlaneIslandHandle?.unmount();
  integrationControlPlaneIslandHandle = null;
  const host = document.querySelector<HTMLElement>("#integrationControlPlaneIsland");
  if (host) host.replaceChildren();
}

function renderIntegrationControlPlane(): void {
  const host = document.querySelector<HTMLElement>("#integrationControlPlaneIsland");
  if (!host || state.view !== "integrations") return;
  const model = buildIntegrationControlPlaneViewModel();
  integrationControlPlaneIslandModule ||= import("../ui/islands/IntegrationControlPlane.tsx");
  void integrationControlPlaneIslandModule.then(({ integrationControlPlaneIsland }) => {
    if (state.view !== "integrations" || !host.isConnected) return;
    if (integrationControlPlaneIslandHandle) integrationControlPlaneIslandHandle.update(model);
    else integrationControlPlaneIslandHandle = integrationControlPlaneIsland.mount(host, model, {
      onSelect: (id) => { state.integration = id; renderIntegrations(); renderIntegrationControlPlane(); },
      onOpenSettings: (id) => { state.integration = id; renderIntegrations(); document.querySelector(".integration-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); },
    });
  }).catch(() => { host.dataset.islandLoad = "error"; });
}

function graphOrder(raw: JsonRecord): number | undefined {
  const value = raw.order ?? raw.sortOrder ?? raw.position;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function buildQuestGraphViewModel(): QuestGraphViewModel {
  const nodes: QuestGraphNode[] = state.quests.filter((item) => state.showArchived || item.lifecycleState !== "archived").map((item) => {
    const raw = asJsonRecord(item.raw);
    const dependencyIds = Array.isArray(raw.dependencyIds) ? raw.dependencyIds.map(String).filter(Boolean) : Array.isArray(item.dependencyIds) ? item.dependencyIds.map(String).filter(Boolean) : [];
    const parentQuestId = String(item.parentQuestId || item.parent || raw.parentQuestId || "");
    return {
      id: item.id,
      code: item.code,
      title: item.title,
      summary: item.note,
      kind: questKind(item),
      status: item.state,
      statusLabel: stateLabel(item.state),
      progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
      createdAt: String(raw.createdAt || raw.updatedAt || item.id),
      order: graphOrder(raw),
      parentQuestId,
      dependencyIds,
    };
  });
  return { title: "Quest Dependency Graph", subtitle: "親子関係と依存関係から毎回決定的に配置します。座標は保存しません。", nodes, selectedId: state.selectedQuestId, hideCompleted: false, statusFilter: "all" };
}

function disposeQuestDependencyGraphIsland(): void {
  questDependencyGraphIslandHandle?.unmount();
  questDependencyGraphIslandHandle = null;
  const host = document.querySelector<HTMLElement>("#questDependencyGraphIsland");
  if (host) host.replaceChildren();
}

function renderQuestDependencyGraph(): void {
  const host = document.querySelector<HTMLElement>("#questDependencyGraphIsland");
  if (!host || state.view !== "tree") return;
  const model = buildQuestGraphViewModel();
  questDependencyGraphIslandModule ||= import("../ui/islands/QuestDependencyGraph.tsx");
  void questDependencyGraphIslandModule.then(({ questDependencyGraphIsland }) => {
    if (state.view !== "tree" || !host.isConnected) return;
    if (questDependencyGraphIslandHandle) questDependencyGraphIslandHandle.update(model);
    else questDependencyGraphIslandHandle = questDependencyGraphIsland.mount(host, model, { onSelect: (id) => { selectQuest(id); renderQuestDependencyGraph(); } });
  }).catch(() => { host.dataset.islandLoad = "error"; });
}

function questKind(item: LabQuest): string {
  return item.kind || (item.parent ? "sub" : "side");
}

function questKindLabel(item: LabQuest): string {
  const labels: Record<string, string> = { main: "MAIN", sub: "SUB", side: "SIDE" };
  return labels[questKind(item)] || "SIDE";
}

function questGameMeta(item: LabQuest): string {
  const difficulty = Math.max(1, Math.min(5, Number(item.difficulty) || 2));
  return '<div class="quest-game-meta">' +
    '<span class="difficulty" aria-label="' + escapeHtml(labText("difficultyLabel")) + ' ' + difficulty + ' / 5">' + "◆".repeat(difficulty) + "◇".repeat(5 - difficulty) + "</span>" +
    '<span>XP +' + escapeHtml(item.xp || 60) + "</span><span>MP +" + escapeHtml(item.reward || 0) + "</span>" +
  "</div>";
}

let notifyTimer: number | null = null;

function notify(message: string): void {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  if (notifyTimer !== null) window.clearTimeout(notifyTimer);
  notifyTimer = window.setTimeout(() => { toast.hidden = true; notifyTimer = null; }, 2600);
}

function visibleQuests(): LabQuest[] {
  const archiveFiltered = state.quests.filter((item) => state.showArchived || item.lifecycleState !== "archived");
  const visibleIds = new Set(archiveFiltered.map((item) => item.id));
  let items = archiveFiltered.filter((item) => (!item.parent || visibleIds.has(item.parent)) && (!item.parent || state.expanded.has(item.parent)));
  if (state.priorityOnly) {
    items = items.filter((item) => !item.parent || item.state === "review" || item.state === "blocked");
  }
  if (state.sort === "progress") items.sort((a, b) => b.progress - a.progress);
  if (state.sort === "owner") items.sort((a, b) => a.owner.localeCompare(b.owner, "ja"));
  return items;
}

function sourceQuestKind(item: LabQuest): string {
  const sourceKind = item.raw?.kind;
  return typeof sourceKind === "string" ? sourceKind : (item.kind === "side" || item.kind === "sub" ? "todo" : item.kind);
}

function isOneOffTodo(item: LabQuest): boolean {
  return sourceQuestKind(item) === "todo" && (item?.raw?.repeat || "none") === "none";
}

function normalizeLabQuestStates() {
  let changed = false;
  state.quests.forEach((item) => {
    if (!isOneOffTodo(item) || item.state !== "completed" || item.lifecycleState === "archived") return;
    item.lifecycleState = "archived";
    item.archivedAt ||= item.completedAt || new Date().toISOString();
    changed = true;
  });
  if (changed) persistState();
}

function selectionItems(): LabQuest[] {
  const visibleIds = new Set(visibleQuests().map((item) => item.id));
  return state.quests.filter((item) => state.selectedQuestIds.includes(item.id) && visibleIds.has(item.id));
}

function updateSelection(ids: string[]): void {
  state.selectedQuestIds = [...new Set(ids)].filter(Boolean).slice(0, 100);
  persistState();
  renderQuestList();
  renderBulkSelection();
}

function toggleQuestSelection(id: string | undefined, event: Pick<LabEvent, "shiftKey" | "ctrlKey" | "metaKey"> = { shiftKey: false, ctrlKey: false, metaKey: false }): void {
  if (!id) return;
  const items = visibleQuests();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return;
  const selected = new Set(state.selectedQuestIds);
  if (event.shiftKey && state.selectionAnchorId) {
    const anchorIndex = items.findIndex((item) => item.id === state.selectionAnchorId);
    if (anchorIndex >= 0) {
      const [from, to] = anchorIndex <= index ? [anchorIndex, index] : [index, anchorIndex];
      const range = items.slice(from, to + 1).map((item) => item.id);
      if (event.ctrlKey || event.metaKey) {
        range.forEach((itemId) => selected.add(itemId));
        updateSelection([...selected]);
      } else updateSelection(range);
      state.selectionAnchorId = id;
      persistState();
      return;
    }
  }
  if (event.ctrlKey || event.metaKey) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  } else {
    selected.clear();
    selected.add(id);
  }
  state.selectionAnchorId = id;
  updateSelection([...selected]);
}

function renderBulkSelection() {
  const bar = $("#bulkSelectionBar");
  if (!bar) return;
  const selected = selectionItems();
  const completeable = selected.filter((item) => ["todo"].includes(sourceQuestKind(item)) && item.state !== "completed" && item.state !== "archived");
  const archivable = selected.filter((item) => isOneOffTodo(item) && ["completed", "archived"].includes(item.lifecycleState || item.state));
  const restorable = selected.filter((item) => isOneOffTodo(item) && (item.lifecycleState === "archived" || item.state === "archived"));
  bar.hidden = selected.length === 0;
  const count = $("#selectionCount");
  if (count) count.textContent = `${selected.length}${labText("selectedSuffix")}`;
  const complete = $("#bulkCompleteButton");
  const archive = $("#bulkArchiveButton");
  const restore = $("#bulkRestoreButton");
  const remoteLocked = state.remoteMode && !remoteWritable();
  if (complete) complete.disabled = remoteLocked || completeable.length === 0;
  if (archive) archive.disabled = remoteLocked || archivable.length === 0;
  if (restore) restore.disabled = remoteLocked || restorable.length === 0;
}

function clearQuestSelection() {
  state.selectedQuestIds = [];
  state.selectionAnchorId = "";
  persistState();
  renderQuestList();
  renderBulkSelection();
}

function reconcileSelectedQuest() {
  const selected = quest(state.selectedQuestId);
  if (selected && (state.showArchived || selected.lifecycleState !== "archived")) return;
  state.selectedQuestId = state.quests.find((item) => state.showArchived || item.lifecycleState !== "archived")?.id || "";
  state.mobileSheetOpen = false;
}

function renderArchiveControl() {
  const count = $("#archiveCount");
  const archivedCount = state.quests.filter((item) => item.lifecycleState === "archived").length;
  $$('[data-archive-toggle]').forEach((toggle) => {
    toggle.setAttribute("aria-pressed", String(state.showArchived));
    toggle.textContent = state.showArchived ? labText("hideArchived") : labText("showArchived");
  });
  if (count) count.textContent = archivedCount ? t("task.archiveCount", { count: archivedCount }) : "";
}

function renderQuestList() {
  const items = visibleQuests();
  const visibleIds = new Set(items.map((item) => item.id));
  state.selectedQuestIds = state.selectedQuestIds.filter((id) => visibleIds.has(id));
  const list = $("#questList");
  list.setAttribute("aria-label", labText("questListAria"));
  const loading = Boolean(state.authUser && !items.length && ["syncing", "reconnecting"].includes(state.remoteConnectionState));
  list.setAttribute("aria-busy", String(loading));
  if (loading) {
    list.innerHTML = '<div class="quest-skeleton-list" aria-label="' + escapeHtml(labText("syncing")) + '"><span class="quest-skeleton-row"></span><span class="quest-skeleton-row"></span><span class="quest-skeleton-row"></span><span class="quest-skeleton-row"></span><span class="quest-skeleton-row"></span></div>';
    renderBulkSelection();
    return;
  }
  list.innerHTML = items.map((item) => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const toggle = hasChildren
      ? '<button class="quest-toggle" type="button" data-toggle="' + item.id + '">' + (state.expanded.has(item.id) ? "-" : "+") + "</button>"
      : '<span class="quest-toggle is-placeholder" aria-hidden="true"></span>';
    const selected = item.id === state.selectedQuestId ? "is-selected" : "";
    const bulkSelected = state.selectedQuestIds.includes(item.id) ? "is-bulk-selected" : "";
    const attention = !["completed", "archived"].includes(item.state) && isDueSoon(item) ? "is-attention" : "";
    const member = partyMember(item.owner);
    return '<article class="quest-row ' + selected + " " + bulkSelected + " is-" + item.state + " " + attention + '" data-quest="' + escapeHtml(item.id) + '" data-depth="' + (item.parent ? 1 : 0) + '" data-kind="' + questKind(item) + '" aria-selected="' + String(state.selectedQuestIds.includes(item.id)) + '" tabindex="0">' +
      '<div class="quest-code"><i class="rail-marker is-' + questKind(item) + '" aria-hidden="true"></i>' + toggle + '<input class="quest-select" type="checkbox" data-select-quest="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(item.title + " " + labText("selectQuest")) + '" ' + (state.selectedQuestIds.includes(item.id) ? "checked" : "") + ' /><span class="quest-number">' + escapeHtml(item.code) + "</span></div>" +
      '<div class="quest-summary"><div class="quest-title-line"><b class="quest-kind">' + questKindLabel(item) + "</b><strong>" + escapeHtml(item.title) + "</strong></div><small>" + escapeHtml(item.note) + "</small>" + questGameMeta(item) + "</div>" +
      '<div class="quest-progress"><b>' + escapeHtml(item.progress) + '%</b><div class="progress-line"><span style="width:' + Math.max(0, Math.min(100, Number(item.progress) || 0)) + '%"></span></div></div>' +
      '<div class="agent-chip"><span class="agent-avatar">' + escapeHtml(member?.mark || item.mark) + '</span><div><strong>' + escapeHtml(item.owner) + "</strong><small>" + escapeHtml(member?.identity || "PARTY MEMBER") + " · " + stateLabel(item.state) + "</small></div></div>" +
      pill(item.state) +
      '<span class="quest-due">' + escapeHtml(item.due) + '</span><span class="quest-focus">' + escapeHtml(item.focus) + "分</span>" +
    "</article>";
  }).join("");
  renderBulkSelection();
}

function renderSelected() {
  const item = quest(state.selectedQuestId);
  const sheet = $(".selected-panel");
  if (!item) {
    $("#selectedTitle").textContent = labText("selectQuestTitle");
    $("#selectedDescription").textContent = labText("selectQuestCopy");
    $("#selectedMeta").innerHTML = "";
    $("#completeButton").disabled = true;
    $("#reviewButton").disabled = true;
    $("#editQuestButton").disabled = true;
    $("#archiveQuestButton").disabled = true;
    sheet?.classList.remove("is-mobile-open");
    document.body.classList.remove("is-detail-modal");
    const backdrop = $("#selectedBackdrop");
    if (backdrop) backdrop.hidden = true;
    return;
  }
  $("#selectedTitle").textContent = item.title;
  const badge = $("#selectedState");
  badge.textContent = stateLabel(item.state);
  badge.dataset.state = item.state;
  $("#selectedDescription").textContent = item.note;
  $("#selectedMeta").innerHTML =
    "<div><dt>" + escapeHtml(labText("taskAssignee")) + "</dt><dd>" + escapeHtml(item.owner) + "</dd></div>" +
    "<div><dt>" + escapeHtml(labText("progressLabel")) + "</dt><dd>" + escapeHtml(item.progress) + "%</dd></div>" +
    "<div><dt>" + escapeHtml(labText("dueLabel")) + "</dt><dd>" + escapeHtml(item.due) + "</dd></div>" +
    "<div><dt>" + escapeHtml(labText("estimate")) + "</dt><dd>" + escapeHtml(item.focus) + escapeHtml(labText("minutesSuffix")) + "</dd></div>" +
    "<div><dt>" + escapeHtml(labText("difficultyLabel")) + "</dt><dd>" + "◆".repeat(item.difficulty || 2) + "◇".repeat(5 - (item.difficulty || 2)) + "</dd></div>" +
    "<div><dt>" + escapeHtml(labText("rewardLabel")) + "</dt><dd>XP +" + (item.xp || 60) + " / MP +" + item.reward + "</dd></div>";
  const remoteLocked = state.remoteMode && !remoteWritable();
  $("#completeButton").disabled = remoteLocked || item.state === "completed" || item.state === "archived";
  $("#completeButton").textContent = labText("complete");
  $("#reviewButton").disabled = remoteLocked || item.state === "archived";
  $("#reviewButton").textContent = labText("confirm");
  $("#editQuestButton").disabled = remoteLocked;
  $("#editQuestButton").textContent = labText("edit");
  $("#archiveQuestButton").disabled = remoteLocked || !isOneOffTodo(item);
  $("#archiveQuestButton").textContent = isOneOffTodo(item) && item.lifecycleState === "archived" ? labText("restore") : labText("archive");
  sheet.classList.toggle("is-mobile-open", state.mobileSheetOpen);
  const isDetailModal = state.detailMode === "modal" && state.mobileSheetOpen;
  document.body.classList.toggle("is-detail-modal", isDetailModal);
  sheet.setAttribute("aria-modal", String(isDetailModal));
  const backdrop = $("#selectedBackdrop");
  if (backdrop) backdrop.hidden = !(state.detailMode === "modal" && state.mobileSheetOpen);
  $("#selectedSheetToggle").setAttribute("aria-expanded", String(state.mobileSheetOpen));
  $("#selectedSheetToggle").textContent = state.mobileSheetOpen ? labText("close") : state.detailMode === "modal" ? labText("open") : labText("detail");
  $("#selectedSheetToggle").setAttribute("aria-label", state.mobileSheetOpen ? labText("closeDetails") : labText("openDetails"));
}

function memberAvatar(member: PartyMember): string {
  return member.avatar
    ? '<span class="agent-avatar has-avatar"><img src="' + member.avatar + '" alt="" /></span>'
    : '<span class="agent-avatar">' + member.mark + "</span>";
}

function renderAgents() {
  $("#agentList").innerHTML = activePartyMembers().map((member) =>
    '<article class="agent-row">' + memberAvatar(member) +
    "<div><strong>" + member.name + "</strong><small>" + member.identity + " · " + member.role + "</small></div>" +
    '<button type="button" data-agent="' + member.name + '">' + stateLabel(member.state) + "</button></article>"
  ).join("");
  const count = state.quests.filter((item) => item.state === "review").length;
  $("#reviewCounter").textContent = String(count);
}

function renderTreeNote(treeQuests: LabQuest[]): void {
  const profile: LabProfile = state.profile || { displayName: "", handle: "", bio: "" };
  const accountName = state.remoteMode
    ? profile.displayName || state.authUser?.displayName || "あなた"
    : state.authUser?.displayName || "ゲスト";
  const identity = state.remoteMode
    ? state.remoteConnectionState === "synced" ? "本人アカウント" : "本人アカウント · 前回同期データ"
    : state.remoteConnectionState === "auth-checking" ? "アカウント確認中" : "デモデータ";
  const avatar = state.remoteMode
    ? state.avatarDataUrl || profile.avatarUrl || "../assets/avatar-role-femme-sentinel.webp"
    : state.avatarDataUrl || "../assets/avatar-role-femme-sentinel.webp";
  const working = treeQuests.filter((item) => item.state === "working").length;
  const review = treeQuests.filter((item) => item.state === "review").length;
  const blocked = treeQuests.filter((item) => item.state === "blocked").length;
  const active = treeQuests.filter((item) => !["completed", "archived"].includes(item.state)).length;
  const account = $("#treeNoteAccount");
  const identityNode = $("#treeNoteIdentity");
  const companion = $("#treeNoteCompanion");
  const description = $("#treeNoteDescription");
  if (account) account.textContent = accountName;
  if (identityNode) identityNode.textContent = identity;
  if (companion) companion.textContent = labText("treeCompanion");
  if (description) description.textContent = state.remoteMode && state.remoteConnectionState !== "synced"
    ? labText("treeCached")
    : labText("treeRules");
  $("#treeWorkingCount").textContent = String(working);
  $("#treeReviewCount").textContent = String(review);
  $("#treeBlockedCount").textContent = String(blocked);
  $("#treeActiveCount").textContent = String(active);
  const avatarNode = $("#treeNoteAvatar");
  if (avatarNode) {
    avatarNode.replaceChildren();
    if (avatar) {
      const image = document.createElement("img");
      image.src = avatar;
      image.alt = "";
      avatarNode.append(image);
    } else {
      avatarNode.textContent = accountName.slice(0, 2).toUpperCase();
    }
  }
}

function renderTree() {
  const treeQuests = state.quests.filter((item) => state.showArchived || item.lifecycleState !== "archived");
  const roots = treeQuests.filter((item) => !item.parent);
  const ordered = roots.flatMap((root) => [root, ...treeQuests.filter((item) => item.parent === root.id)]);
  $("#treeList").innerHTML = ordered.map((item) =>
    '<article class="tree-node is-' + item.state + '" data-depth="' + (item.parent ? 1 : 0) + '" data-kind="' + questKind(item) + '">' +
      '<span class="tree-code"><i class="rail-marker is-' + questKind(item) + '" aria-hidden="true"></i>' + escapeHtml(item.code) + "</span>" +
      "<div><div class=\"tree-title-line\"><b class=\"quest-kind\">" + questKindLabel(item) + "</b><strong>" + escapeHtml(item.title) + "</strong></div><small>" + escapeHtml(item.note) + "</small>" + questGameMeta(item) + "</div>" +
      pill(item.state) +
      '<button type="button" data-tree-select="' + item.id + '">' + escapeHtml(labText("open")) + '</button>' +
    "</article>"
  ).join("");
  renderTreeNote(treeQuests);
}

function renderBattle() {
  const battleTitle = document.querySelector<HTMLElement>("#battleTitle");
  if (battleTitle && visualFixtureEnabled) battleTitle.textContent = "Battle / Rewards";
  const queue = state.quests.filter((item) => !item.parent && item.state !== "completed" && item.state !== "archived");
  $("#battleQueue").innerHTML = queue.length
    ? queue.map((item) => '<div class="battle-queue-row"><strong>' + escapeHtml(item.title) + "</strong><span>+" + escapeHtml(item.reward) + " MP</span></div>").join("")
    : "<p>" + escapeHtml(labText("battleQueueEmpty")) + "</p>";
  $("#battleLog").innerHTML = state.battleLog.slice(0, 4).map((entry) => "<li>" + escapeHtml(entry) + "</li>").join("");
  $("#battleBossHp").textContent = String(state.bossHp);
  $("#battleBossMeter").value = String(state.bossHp);
  $("#battleMp").textContent = String(state.mp);
  $("#battleMpMeter").value = String(state.mp);
  $("#topbarMp").textContent = String(state.mp);
  $("#sidebarMp").textContent = state.mp + " / 100";
  $("#bossMp").textContent = String(state.mp);
  $("#topbarMpMeter").value = String(state.mp);
  const costs: Record<string, number> = { attack: 0, skill: 18, guard: 6, heal: 14, burst: 40 };
  $$(`[data-command]`).forEach((button) => { button.disabled = state.bossHp <= 0 || state.mp < (costs[button.dataset.command || ""] || 0); });
}

function renderParty() {
  const partyTitle = document.querySelector<HTMLElement>("#partyTitle");
  const partyReferenceCopy = document.querySelector<HTMLElement>("#partyReferenceCopy");
  if (partyTitle && visualFixtureEnabled) partyTitle.textContent = "パーティ / Workforce";
  if (partyReferenceCopy) partyReferenceCopy.textContent = visualFixtureEnabled ? "HumanとAI Agentの役割・負荷・現在Holderを横断して編成します。" : "";
  const members = visualFixtureEnabled ? referenceCaptureMembers.filter((member) => member.name !== "Echo") : activePartyMembers();
  // Member roster cards (formerly #partyList) now render inside the PartyFormation Island's
  // "Members" segment — see ui/islands/PartyFormation.tsx. This avoids the double-rendering
  // where both the Island scene and a separate vanilla card grid showed the same roster.
  $("#partyCount").textContent = String(members.length);
  $("#partyWorking").textContent = String(members.filter((member) => member.state === "working").length);
  $("#partyReview").textContent = String(members.filter((member) => member.state === "review").length);
  $("#partyActivity").innerHTML = [
    ["Cyan", "PCの司令室を試す", "レビュー待ちへ返却"],
    ["Astra", "Toggl Focusの連携導線を確認する", "接続設定を確認中"],
    ["Archivist", "10言語の表示長を確認する", "文言レビューを開始"]
  ].map((item) => '<li><b>' + item[0] + "</b><span>" + item[1] + "</span><small>" + item[2] + "</small></li>").join("");
}

function renderProfile(): void {
  const profile: LabProfile = state.profile || { displayName: "", handle: "", bio: "" };
  const accountName = profile.displayName || state.authUser?.displayName || "ひろなお";
  const characterName = "Astra";
  const avatar = state.avatarDataUrl || state.profile?.avatarUrl || "../assets/avatar-role-femme-sentinel.webp";
  const title = $("#profileTitle");
  const kicker = document.querySelector<HTMLElement>("#profileKicker");
  const referenceCopy = document.querySelector<HTMLElement>("#profileReferenceCopy");
  const image = $("#profileAvatarImage");
  const character = $("#profileCharacterName");
  const account = $("#profileAccountLine");
  const status = $("#profileAvatarStatus");
  if (title) title.textContent = visualFixtureEnabled ? "Human Operator Dashboard" : `${accountName}${labText("profileTitleSuffix")}`;
  if (kicker) kicker.textContent = visualFixtureEnabled ? "" : "PROFILE / ACCOUNT";
  if (referenceCopy) referenceCopy.textContent = visualFixtureEnabled ? "あなたのオペレーション全体と、エージェントチームとの協働状況を可視化します。" : "";
  if (image) { image.src = avatar; image.alt = `${accountName}${labText("avatarAlt")}`; }
  if (character) character.textContent = characterName;
  if (account) account.textContent = `${labText("accountPrefix")}${accountName}`;
  if (status) status.textContent = state.avatarDataUrl ? labText("avatarLocal") : labText("avatarDefault");
  const profileName = $("#profile-name");
  if (profileName) profileName.textContent = characterName;
  const profileButton = document.querySelector(".profile-button");
  if (profileButton) profileButton.setAttribute("aria-label", `${characterName}${labText("profileTitleSuffix")} (${labText("accountPrefix")}${accountName})`);
  const sidebarImage = $(".sidebar-profile .profile-avatar img");
  if (sidebarImage) { sidebarImage.src = avatar; sidebarImage.alt = ""; }
}

function renderAgentRegistry() {
  const list = $("#agentRegistryList");
  if (!list) return;
  if (!state.remoteMode) {
    list.innerHTML = '<p class="empty-note">' + escapeHtml(labText("agentPrivateEmpty")) + '</p>';
    return;
  }
  const connections = state.agentConnections?.connections || [];
  const statusText: Record<string, string> = { active: labText("agentStatusActive"), disabled: labText("agentStatusDisabled"), archived: labText("agentStatusArchived") };
  list.innerHTML = (state.registeredAgents || []).map((agent) => {
    const linked = connections.filter((connection) => connection.agentId === agent.agentId && !connection.revokedAt);
    const linkedText = linked.length ? linked.map((connection) => escapeHtml(connection.clientName || connection.clientId)).join("、") : labText("unlinked");
    return '<article class="registry-agent"><div class="registry-agent-title"><span class="registry-agent-mark">AI</span><div><strong>' + escapeHtml(agent.displayName) + '</strong><small>' + escapeHtml(agent.agentId) + ' · ' + escapeHtml(agent.provider || "generic") + ' · ' + escapeHtml(agent.role || "assistant") + '</small></div></div>' +
      '<span class="state-pill" data-state="' + (agent.status === "active" ? "working" : agent.status === "archived" ? "archived" : "blocked") + '">' + escapeHtml(statusText[agent.status] || agent.status || "利用中") + '</span>' +
      '<p>' + escapeHtml(agent.instructions || labText("noInstructions")) + '</p><small>' + escapeHtml(labText("connectedLabel")) + ': ' + linkedText + ' · ' + escapeHtml(labText("lastUpdated")) + ' ' + escapeHtml(agent.updatedAt ? formatSyncTime(agent.updatedAt) : labText("neverUpdated")) + '</small>' +
      '<div class="registry-actions"><button type="button" data-agent-edit="' + escapeHtml(agent.agentId) + '">' + escapeHtml(labText("edit")) + '</button>' +
      (agent.status !== "archived" ? '<button type="button" data-agent-archive="' + escapeHtml(agent.agentId) + '">' + escapeHtml(labText("archiveAgent")) + '</button>' : '') + '</div></article>';
  }).join("") || '<p class="empty-note">' + escapeHtml(labText("noAgent")) + '</p>';
  const clientSelect = $("#agentClientInput");
  const agentSelect = $("#agentLinkInput");
  const authorizedClients = (state.agentConnections?.authorizedClients || []).filter((client) => !client.revokedAt);
  const linkedByClient = new Map(connections.filter((connection) => !connection.revokedAt).map((connection) => [connection.clientId, connection]));
  if (clientSelect) clientSelect.innerHTML = '<option value="">' + escapeHtml(labText("mcpSelect")) + '</option>' + authorizedClients.map((client) => {
    const linked = linkedByClient.get(client.clientId);
    const label = `${client.clientName || client.clientId}${linked ? `（${linked.agentId}に紐付け済み）` : ""}`;
    return '<option value="' + escapeHtml(client.clientId) + '">' + escapeHtml(label) + '</option>';
  }).join("");
  if (agentSelect) agentSelect.innerHTML = '<option value="">' + escapeHtml(labText("agentSelect")) + '</option>' + (state.registeredAgents || []).filter((agent) => agent.status === "active").map((agent) => '<option value="' + escapeHtml(agent.agentId) + '">' + escapeHtml(agent.displayName) + '</option>').join("");
  const connectionList = $("#agentConnectionList");
  const hint = $("#agentConnectionHint");
  if (hint) hint.textContent = authorizedClients.length ? `${authorizedClients.length}${labText("agentHintMany")}` : labText("agentHintNone");
  if (connectionList) connectionList.innerHTML = connections.filter((connection) => !connection.revokedAt).map((connection) => '<div class="agent-connection-row"><div><strong>' + escapeHtml(connection.clientName || connection.clientId) + '</strong><small>' + escapeHtml(connection.agentId) + ' · ' + escapeHtml((connection.scopes || []).length) + ' ' + escapeHtml(labText("scopesUsed")) + ' · ' + escapeHtml(labText("lastUsed")) + ' ' + escapeHtml(connection.lastUsedAt ? formatSyncTime(connection.lastUsedAt) : labText("neverUsed")) + '</small></div><button type="button" data-agent-unlink="' + escapeHtml(connection.agentId) + '" data-client-unlink="' + escapeHtml(connection.clientId) + '">' + escapeHtml(labText("unlink")) + '</button></div>').join("") || '<p class="empty-note">' + escapeHtml(labText("noClients")) + '</p>';
}

function renderAgentOperations(): void {
  const grid = $("#agentOperationsGrid");
  const inspector = $("#agentOperationsInspector");
  const members = visualFixtureEnabled
    ? referenceCaptureMembers.filter((member) => member.identity !== "HUMAN / PLAYER")
    : state.remoteMode
      ? activePartyMembers().filter((member) => member.identity !== "HUMAN / PLAYER")
      : [];
  if (!members.length) {
    grid.innerHTML = '<div class="agent-operations-empty"><strong>表示できるAgentがいません</strong><p>本体へ接続すると、稼働中のAgentの負荷・キュー・レビュー状況がここに表示されます。</p></div>';
    inspector.innerHTML = '<p class="agent-operations-inspector-empty">Agentを選択すると詳細がここに表示されます。</p>';
    return;
  }
  const selectedId = state.agentFocusId || members[0].agentId || members[0].name;
  const selected = members.find((member) => (member.agentId || member.name) === selectedId) || members[0];
  const fixtureCards: Record<string, { load: number; assigned: number; queue: number; review: number; success: number; current: string; tags: string[] }> = {
    Astra: { load: 72, assigned: 3, queue: 1, review: 0, success: 98, current: "価格ページA/Bテスト設計", tags: ["MCP", "Git", "Docs"] },
    Codex: { load: 58, assigned: 2, queue: 0, review: 1, success: 97, current: "README改善", tags: ["MCP", "Git", "Docs"] },
    Scout: { load: 41, assigned: 2, queue: 0, review: 0, success: 96, current: "営業候補調査", tags: ["MCP", "Git", "Docs"] },
    Ops: { load: 85, assigned: 1, queue: 1, review: 0, success: 95, current: "ログ解析とアラート設計", tags: ["MCP", "Git", "Docs"] },
    Echo: { load: 8, assigned: 1, queue: 0, review: 0, success: 94, current: "待機中", tags: ["MCP", "Git", "Docs"] },
  };
  grid.innerHTML = members.map((member) => {
    const assigned = state.quests.filter((item) => item.owner === member.name || item.raw?.assignee?.id === member.agentId);
    const fixture = visualFixtureEnabled ? fixtureCards[member.name] : undefined;
    const load = fixture?.load ?? Math.min(100, assigned.filter((item) => !["completed", "archived"].includes(item.state)).length * 28 + (member.state === "blocked" ? 16 : 8));
    const assignedCount = fixture?.assigned ?? assigned.length;
    const queueCount = fixture?.queue ?? assigned.filter((item) => item.state === "ready").length;
    const reviewCount = fixture?.review ?? assigned.filter((item) => item.state === "review").length;
    const success = fixture?.success ?? Math.max(0, Math.min(100, 100 - reviewCount * 4));
    const currentQuest = fixture?.current ?? assigned[0]?.title ?? "Waiting";
    const tags = fixture?.tags ?? ["Capability"];
    const roleLabel = visualFixtureEnabled ? "AI Agent" : member.identity;
    const currentLabel = visualFixtureEnabled ? "現在のクエスト" : "CURRENT QUEST";
    const statLabels = visualFixtureEnabled ? ["キュー", "レビュー待ち", "成功率"] : ["QUEUE", "REVIEWS", "SUCCESS"];
    return '<button type="button" class="agent-operation-card ' + ((member.agentId || member.name) === selectedId ? "is-selected" : "") + '" data-agent-operation="' + escapeHtml(member.agentId || member.name) + '"><span class="agent-operation-mark">' + escapeHtml(member.mark) + '</span><span class="agent-operation-main"><strong>' + escapeHtml(member.name) + '</strong><small class="agent-operation-role">' + escapeHtml(roleLabel) + '</small><span class="agent-operation-current">' + currentLabel + '</span><b class="agent-operation-quest">' + escapeHtml(currentQuest) + '</b></span><span class="agent-operation-load"><i style="width:' + load + '%"></i></span><span class="agent-operation-stats"><span><small>' + statLabels[0] + '</small><b>' + queueCount + '</b></span><span><small>' + statLabels[1] + '</small><b>' + reviewCount + '</b></span><span><small>' + statLabels[2] + '</small><b>' + success + '%</b></span></span><span class="agent-operation-tags">' + tags.map((tag) => '<em>' + escapeHtml(tag) + '</em>').join('') + '</span><em class="agent-operation-state">' + assignedCount + ' Quest / ' + escapeHtml(stateLabel(member.state)) + '</em><span class="agent-operation-trend" aria-hidden="true"><svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="0,28 12,19 24,25 36,10 48,18 60,5 72,15 84,1 100,8"></polyline></svg></span></button>';
  }).join("") + (visualFixtureEnabled ? '<button type="button" class="agent-operation-add" data-agent-add="true"><span>＋</span><b>エージェントを追加</b></button>' : "");
  const selectedQuests = state.quests.filter((item) => item.owner === selected.name || item.raw?.assignee?.id === selected.agentId);
  const selectedFixture = visualFixtureEnabled ? fixtureCards[selected.name] : undefined;
  const selectedQueue = selectedFixture?.queue ?? selectedQuests.filter((item) => item.state === "ready").length;
  const selectedReview = selectedFixture?.review ?? selectedQuests.filter((item) => item.state === "review").length;
  const selectedActive = selectedFixture?.assigned ?? selectedQuests.filter((item) => !["completed", "archived"].includes(item.state)).length;
  const selectedLoad = selectedFixture?.load ?? 0;
  inspector.innerHTML = '<p>' + (visualFixtureEnabled ? "選択中のエージェント" : "SELECTED AGENT") + '</p><h2>' + escapeHtml(selected.name) + '</h2><span>' + escapeHtml(visualFixtureEnabled ? "Companion" : selected.role) + '</span>' + (visualFixtureEnabled ? '<strong class="agent-inspector-load">' + selectedLoad + '%</strong>' : '') + '<dl><div><dt>' + (visualFixtureEnabled ? "キュー" : "QUEUE") + '</dt><dd>' + selectedQueue + '</dd></div><div><dt>' + (visualFixtureEnabled ? "レビュー" : "REVIEW") + '</dt><dd>' + selectedReview + '</dd></div><div><dt>' + (visualFixtureEnabled ? "担当Quest" : "ACTIVE") + '</dt><dd>' + selectedActive + '</dd></div></dl><button type="button" data-agent-open-quest="' + escapeHtml(selectedQuests[0]?.id || "") + '">' + (visualFixtureEnabled ? "Handoff" : "担当Questを開く") + '</button>';
}

function renderReviewQueue(): void {
  const queue = $("#reviewQueue");
  const reviews = state.quests.filter((item) => item.state === "review" && item.lifecycleState !== "archived");
  $("#reviewQueueCount").textContent = String(reviews.length);
  queue.innerHTML = reviews.length ? reviews.map((item) => '<button type="button" class="review-queue-row" role="listitem" data-review-quest="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.code) + '</span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.owner) + ' → HUMAN REVIEW</small><b>' + item.progress + '%</b></button>').join("") : '<p class="empty-note">レビュー待ちのQuestはありません。</p>';
}

function mountAgentRegistry(): void {
  const mount = $("#agentRegistryMount");
  const card = document.querySelector<HTMLElement>(".settings-agent-card");
  if (card && card.parentElement !== mount) mount.append(card);
}

function renderPanelErrors() {
  const panel = $("#panelErrorList");
  if (!panel) return;
  if (!state.remoteMode || !state.panelErrors?.length) { panel.hidden = true; panel.innerHTML = ""; return; }
  const labels = [labText("profile"), labText("battle"), labText("integrations"), labText("profile"), labText("party"), labText("agentHeadingFallback"), "MCP"];
  panel.hidden = false;
  panel.innerHTML = '<div><strong>' + escapeHtml(labText("panelLoadFailed")) + '</strong><small>' + escapeHtml(labText("panelKeep")) + '</small></div>' + state.panelErrors.map((error) => '<span>' + escapeHtml(labels[error.index] || labText("extraInfo")) + '</span>').join("") + '<button type="button" id="retryPanelsButton">' + escapeHtml(labText("retry")) + '</button>';
  $("#retryPanelsButton")?.addEventListener("click", () => loadRemoteData());
}

function renderProfileReference(): void {
  const set = (id: string, value: string): void => {
    const element = document.querySelector<HTMLElement>("#" + id);
    if (element) element.textContent = value;
  };
  const values = visualFixtureEnabled
    ? { completion: "28 / 120件", success: "71%", cleared: "84件", average: "2.4件/時", focus: "18.6h", review: "62%", quality: "4.6/5", rate: "68%" }
    : { completion: String(state.quests.filter((item) => item.state === "completed").length) + " / " + String(state.quests.length), success: Math.round(state.quests.filter((item) => item.progress >= 70).length / Math.max(1, state.quests.length) * 100) + "%", cleared: String(state.quests.filter((item) => item.state === "completed").length), average: Math.round(state.quests.reduce((sum, item) => sum + item.focus, 0) / Math.max(1, state.quests.length)) + "m", focus: Math.round(state.quests.reduce((sum, item) => sum + item.focus, 0) / 60 * 10) / 10 + "h", review: Math.round(state.quests.filter((item) => item.state === "review").length / Math.max(1, state.quests.length) * 100) + "%", quality: "4.0 / 5", rate: Math.round(state.quests.reduce((sum, item) => sum + item.progress, 0) / Math.max(1, state.quests.length)) + "%" };
  set("profileRefCompletion", values.completion);
  set("profileRefSuccess", values.success);
  set("profileRefCleared", values.cleared);
  set("profileRefAverage", values.average);
  set("profileRefFocusTime", values.focus);
  set("profileRefReviewRate", values.review);
  set("profileRefInputQuality", values.quality);
  set("profileRefCompletionRate", values.rate);
  if (visualFixtureEnabled) {
    const kpiLabels = ["レビュー負荷", "実績比率", "Quest完了数", "承認スループット"];
    const kpiNotes = ["23%", "+8pp", "+12", "+0.5"];
    document.querySelectorAll<HTMLElement>(".profile-ref-kpis > section > span").forEach((element, index) => { element.textContent = kpiLabels[index] || element.textContent; });
    document.querySelectorAll<HTMLElement>(".profile-ref-kpis > section > small").forEach((element, index) => { element.textContent = kpiNotes[index] || element.textContent; });
    const mainLabels = ["ウィークリーアクティビティ・今週", "エージェントとの協働 (Top 5)"];
    document.querySelectorAll<HTMLElement>(".profile-ref-main .profile-ref-card > p").forEach((element, index) => { element.textContent = mainLabels[index] || element.textContent; });
    document.querySelectorAll<HTMLElement>(".profile-ref-main .profile-ref-card h3").forEach((element) => { element.textContent = ""; });
    const bottomLabels = ["フォーカス指標", "最近の介入"];
    document.querySelectorAll<HTMLElement>(".profile-ref-bottom .profile-ref-card > p").forEach((element, index) => { element.textContent = bottomLabels[index] || element.textContent; });
    const miniLabels = ["集中時間", "深いレビュー率", "介入インパクト", "戦略時間比率"];
    document.querySelectorAll<HTMLElement>(".profile-ref-mini-grid > div > span").forEach((element, index) => { element.textContent = miniLabels[index] || element.textContent; });
    document.querySelectorAll<HTMLElement>(".profile-ref-mini-grid > div > small").forEach((element) => { element.textContent = ""; });
  }
  const bars = visualFixtureEnabled ? [44, 31, 56, 42, 72, 58, 67, 53, 54, 40, 61, 48, 36, 23] : state.quests.slice(0, 5).flatMap((item) => [Math.max(10, item.progress), Math.max(8, item.progress - 18)]);
  const barGroup = document.querySelector<SVGGElement>("#profileRefBars");
  if (barGroup) barGroup.innerHTML = bars.map((value, index) => {
    const group = Math.floor(index / 2);
    const x = visualFixtureEnabled ? (index % 2 ? 43.5 + group * 71.5 : 16.5 + group * 71.5) : 18 + index * 50;
    const scale = visualFixtureEnabled ? 1.2 : 1.6;
    const baseline = visualFixtureEnabled ? 175 : 160;
    return '<rect x="' + x + '" y="' + (baseline - value * scale) + '" width="' + (visualFixtureEnabled ? 24.5 : 28) + '" height="' + (value * scale) + '" class="' + (index % 2 ? "bar-green" : "bar-blue") + '"></rect>';
  }).join("");
  const members = visualFixtureEnabled ? referenceCaptureMembers.filter((member) => member.identity !== "HUMAN / PLAYER") : state.remoteMode ? activePartyMembers().filter((member) => member.identity !== "HUMAN / PLAYER") : [];
  const agentRows = document.querySelector<HTMLElement>("#profileRefAgentRows");
  if (agentRows) {
    const fixtureStats = [[28, 26, 96], [23, 22, 94], [18, 18, 92], [13, 14, 90], [8, 10, 88]];
    agentRows.innerHTML = members.slice(0, 5).map((member, index) => {
      const stats = visualFixtureEnabled ? fixtureStats[index] : [Math.max(0, 28 - index * 5), 0, Math.max(0, 96 - index * 2)];
      return '<div class="profile-ref-agent-row"><span class="status-agent-avatar status-agent-avatar--' + ["green", "blue", "gold", "red", "violet"][index % 5] + '">' + escapeHtml(member.mark) + '</span><strong>' + escapeHtml(member.name) + '</strong><small>' + escapeHtml(visualFixtureEnabled ? "AI Agent" : member.role) + '</small><b>' + stats[0] + (visualFixtureEnabled ? ' 委譲' : ' assigned') + '</b><b>' + stats[1] + (visualFixtureEnabled ? ' 完了' : '') + '</b><em>' + stats[2] + '%</em></div>';
    }).join("") || '<p class="empty-note">No registered Agents.</p>';
  }
  const logRows = visualFixtureEnabled ? ["UI設計リファイン", "ログ解析とアラート設計", "営業候補調査", "セキュリティ脆弱性スキャン"] : state.quests.slice(0, 3).map((item) => item.title);
  const logs = document.querySelector<HTMLElement>("#profileRefLogRows");
  if (logs) logs.innerHTML = visualFixtureEnabled
    ? logRows.map((label, index) => '<div class="profile-ref-log-row"><span>' + ["今日 13:42", "今日 10:15", "昨日 16:50", "昨日 11:08"][index] + '</span><strong>' + escapeHtml(label) + '</strong><b>' + ["Astra", "Ops", "Scout", "Codex"][index] + '</b><em>' + ["方針修正", "優先度変更", "追加情報要求", "設定調整"][index] + '</em></div>').join("")
    : logRows.map((label, index) => '<div class="profile-ref-log-row"><span>' + escapeHtml(label) + '</span><b>' + (index + 1) + 'd ago</b><em>completed</em></div>').join("");
}

function renderIntegrations() {
  const remoteByService = new Map((state.remoteIntegrations || []).map((item) => [item.id, item]));
  $("#integrationList").innerHTML = integrations.map((item) =>
    '<button type="button" class="integration-card ' + (item.id === state.integration ? "is-selected" : "") + '" data-integration="' + item.id + '">' +
      "<span>" + item.short + "</span><strong>" + item.name + "</strong><small>" + escapeHtml(t(item.copyKey)) + "</small><b>" + escapeHtml(externalOAuthEnabled ? (remoteByService.get(item.providerId)?.status || t(item.stateKey)) : labText("integrationPreparing")) + "</b></button>"
  ).join("");
  const selected = integrations.find((item) => item.id === state.integration) || integrations[0];
  $("#integrationKicker").textContent = selected.name.toUpperCase();
  $("#integrationTitle").textContent = t(selected.titleKey);
  $("#integrationDescription").textContent = t(selected.detailKey);
  $("#integrationContextTitle").textContent = selected.name;
  $("#integrationLastSync").textContent = selected.lastSync ? formatSyncTime(selected.lastSync) : t("integration.status.not_connected");
  $("#integrationScope").textContent = selected.scope;
  $("#integrationNextStep").textContent = t(selected.nextStepKey);
  $("#integrationActivity").innerHTML = selected.activityKeys.map((key) => "<li>" + escapeHtml(t(key)) + "</li>").join("");
  const statusNote = $("#integrationPublicBetaNote");
  if (statusNote) {
    statusNote.hidden = externalOAuthEnabled;
    statusNote.textContent = labText("earlyAccess");
  }
  $("#previewButton").disabled = !externalOAuthEnabled;
  $("#syncButton").disabled = !externalOAuthEnabled;
}

// Mount/dispose the three React Golden Islands based on the active view. Extracted out of
// renderTree/renderParty/renderIntegrations so those panel renderers can be skipped when their
// panel isn't active (see renderAll) without ever forgetting to unmount a leaving Island.
function syncIslands(): void {
  if (state.view === "tree") renderQuestDependencyGraph();
  else disposeQuestDependencyGraphIsland();
  if (state.view === "party") renderPartyFormationIsland();
  else disposePartyFormationIsland();
  if (state.view === "integrations") renderIntegrationControlPlane();
  else disposeIntegrationControlPlaneIsland();
}

function renderBattleReport(): void {
  const set = (id: string, value: string): void => {
    const element = document.querySelector<HTMLElement>("#" + id);
    if (element) element.textContent = value;
  };
  const values = visualFixtureEnabled
    ? { quests: "18件", focus: "6h 42m", xp: "42件", success: "87%", gold: "2,655", average: "-6.2%", value: "+2.4%", agents: "6 / 6", completed: "2,655", pressure: "34%", reward: "Victory", rewardCopy: "Keep the chain moving with a high-value handoff." }
    : { quests: String(state.quests.length), focus: Math.floor(state.timerSeconds / 60) + "m", xp: String(state.quests.reduce((sum, item) => sum + item.xp, 0)), success: Math.round(state.quests.filter((item) => item.progress >= 70).length / Math.max(1, state.quests.length) * 100) + "%", gold: String(state.quests.reduce((sum, item) => sum + item.reward, 0)), average: Math.round(state.quests.reduce((sum, item) => sum + item.focus, 0) / Math.max(1, state.quests.length)) + "m", value: "+0%", agents: String(activePartyMembers().filter((member) => member.identity !== "HUMAN / PLAYER").length), completed: String(state.quests.filter((item) => item.state === "completed").length), pressure: Math.max(0, 100 - state.bossHp) + "%", reward: state.bossHp <= 0 ? "Victory" : "In progress", rewardCopy: "Quest rewards are derived from the current local state." };
  set("battleReportQuestCount", values.quests);
  set("battleReportFocus", values.focus);
  set("battleReportXp", values.xp);
  set("battleReportSuccess", values.success);
  set("battleReportGold", values.gold);
  set("battleReportAvgFocus", values.average);
  set("battleReportValue", values.value);
  set("battleReportDonutTotal", values.gold);
  set("battleReportFocusSummary", values.focus);
  set("battleReportAgents", values.agents);
  set("battleReportCompleted", values.completed);
  set("battleReportBossPressure", values.pressure);
  set("battleReportRewardTitle", values.reward);
  set("battleReportRewardCopy", values.rewardCopy);
  if (visualFixtureEnabled) {
    set("battleKicker", "");
    set("battleTitle", "戦闘・報酬");
    set("battleCopy", "生産性インパクトを戦果に変換し、ボスプレッシャーを低減する");
    const metricLabels = ["完了クエスト", "フォーカス時間", "レビュー処理", "エージェント性能", "戦闘貢献スコア", "Boss Pressure", "Campaign"];
    const metricNotes = ["+12%", "+1h 28m", "+15", "+5%", "+18%", "34% → 27.8%", "Phase 2"];
    document.querySelectorAll<HTMLElement>(".battle-reference-dashboard .battle-report-metric > span").forEach((element, index) => { element.textContent = metricLabels[index] || element.textContent; });
    document.querySelectorAll<HTMLElement>(".battle-reference-dashboard .battle-report-metric > small").forEach((element, index) => { element.textContent = metricNotes[index] || element.textContent; });
    const mainCards = [...document.querySelectorAll<HTMLElement>(".battle-reference-dashboard .battle-report-main-grid > .battle-report-card")];
    const mainLabels = ["インパクトの内訳", "戦闘トレンド（7日間）", "戦闘サマリー", "戦果評価"];
    const mainTitles = ["", "", "", "勝利"];
    mainCards.forEach((card, index) => {
      const kicker = card.querySelector<HTMLElement>(".battle-report-kicker");
      const title = card.querySelector<HTMLElement>("h3");
      if (kicker) kicker.textContent = mainLabels[index] || kicker.textContent;
      if (title && mainTitles[index]) title.textContent = mainTitles[index];
    });
    const bottomCards = [...document.querySelectorAll<HTMLElement>(".battle-reference-dashboard .battle-report-bottom-grid > .battle-report-card")];
    const bottomLabels = ["敵勢力 / Boss", "ドロップ予測", "最近の戦闘ログ"];
    const bottomTitles = ["Gloom Node Overseer", "", ""];
    bottomCards.forEach((card, index) => {
      const kicker = card.querySelector<HTMLElement>(".battle-report-kicker");
      const title = card.querySelector<HTMLElement>("h3");
      if (kicker) kicker.textContent = bottomLabels[index] || kicker.textContent;
      if (title && bottomTitles[index]) title.textContent = bottomTitles[index];
    });
  } else {
    set("battleCopy", "");
  }
  const bossHp = visualFixtureEnabled ? 34 : state.bossHp;
  set("battleReportBossHp", bossHp + "%");
  const meter = document.querySelector<HTMLMeterElement>("#battleReportBossMeter");
  if (meter) { meter.value = bossHp; meter.setAttribute("value", String(bossHp)); }
  const dropRows = visualFixtureEnabled ? ["Node Core Fragment", "Gloom Data Shard", "Protocol Override Key", "Adaptive Schema Core"] : state.quests.slice(0, 4).map((item) => item.title);
  const drops = document.querySelector<HTMLElement>("#battleReportDrops");
  if (drops) drops.innerHTML = dropRows.map((label, index) => '<div class="battle-report-drop-row"><strong>' + escapeHtml(label) + '</strong><span>' + (visualFixtureEnabled ? [24, 28, 18, 12][index] : 24 - index * 6) + '%</span><b>' + (visualFixtureEnabled ? [360, 420, 270, 180][index] : 360 - index * 90) + ' XP</b></div>').join("");
  const logs = document.querySelector<HTMLElement>("#battleReportLog");
  const logRows = visualFixtureEnabled ? ["Goblin Skirmish", "Data Slime", "Spam Imp"] : state.battleLog.slice(0, 3);
  if (logs) logs.innerHTML = logRows.map((label, index) => '<div class="battle-report-log-row">' + (visualFixtureEnabled ? '<time>' + ["08:45", "07:30", "06:10"][index] + '</time>' : '') + '<span>' + escapeHtml(label) + '</span><b>Victory</b></div>').join("");
}

function renderTimer() {
  const min = Math.floor(state.timerSeconds / 60);
  const sec = state.timerSeconds % 60;
  $("#timerValue").textContent = String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}

function renderSidebarOpsContext(): void {
  const setText = (id: string, value: string): void => {
    const element = document.querySelector<HTMLElement>('#' + id);
    if (element) element.textContent = value;
  };
  const selected = visualFixtureEnabled
    ? { title: 'The Gloom Protocol', note: 'Phase 2: Sever the Nodes', progress: 60 }
    : state.quests.find((item) => item.id === state.selectedQuestId) || state.quests[0];
  const pressure = visualFixtureEnabled ? 34 : Math.max(0, 100 - state.bossHp);
  const mp = visualFixtureEnabled ? 64 : state.mp;
  const syncState = visualFixtureEnabled ? 'Synced' : state.remoteMode ? state.remoteConnectionState : state.syncStatus || 'local-only';
  const syncTime = visualFixtureEnabled ? 'Just now' : state.lastSyncAt || 'local-only';
  setText('sidebarSyncState', syncState);
  setText('sidebarSyncTime', syncTime);
  setText('sidebarContextTitle', selected?.title || 'No active Quest');
  setText('sidebarContextCopy', selected?.note || 'No active context');
  setText('sidebarBossPressure', pressure + '%');
  setText('sidebarMpReserve', mp + (visualFixtureEnabled ? ' / 120' : ' / 100'));
  const bossMeter = document.querySelector<HTMLMeterElement>('#sidebarBossMeter');
  if (bossMeter) { bossMeter.value = pressure; bossMeter.setAttribute('value', String(pressure)); }
  const mpMeter = document.querySelector<HTMLMeterElement>('#sidebarMpMeter');
  if (mpMeter) { mpMeter.value = mp; mpMeter.setAttribute('value', String(mp)); }
  const mcpNames = visualFixtureEnabled
    ? ['mcp.questforge.local', 'Astra MCP', 'S3 (Logs)', 'Datadog']
    : state.remoteMode
      ? (state.agentConnections?.authorizedClients || []).map((client) => client.clientName || client.clientId)
      : ['Local storage'];
  const mcpList = document.querySelector<HTMLElement>('#sidebarMcpList');
  if (mcpList) mcpList.innerHTML = mcpNames.map((name) => '<div class="sidebar-mcp-row"><span>' + escapeHtml(name) + '</span><b>' + escapeHtml(visualFixtureEnabled || state.remoteMode ? 'Connected' : 'Local only') + '</b></div>').join('');
}

function renderStatusRail(): void {
  const grid = document.querySelector<HTMLElement>("#statusRailAgents");
  if (!grid) return;
  const members = visualFixtureEnabled
    ? referenceCaptureMembers.slice().sort((a, b) => ["Astra", "Codex", "Scout", "Ops", "Echo", "You"].indexOf(a.name) - ["Astra", "Codex", "Scout", "Ops", "Echo", "You"].indexOf(b.name))
    : state.remoteMode ? activePartyMembers() : [];
  const fixtureStats: Record<string, { load: number; quests: number; queue: number; reviews: number }> = {
    Astra: { load: 72, quests: 3, queue: 1, reviews: 0 },
    Codex: { load: 58, quests: 2, queue: 0, reviews: 1 },
    Scout: { load: 41, quests: 2, queue: 0, reviews: 0 },
    Ops: { load: 85, quests: 1, queue: 1, reviews: 0 },
    Echo: { load: 8, quests: 0, queue: 0, reviews: 0 },
    You: { load: 65, quests: 4, queue: 0, reviews: 4 },
  };
  const fixtureAvatarPaths: Record<string, string> = {
    Astra: "../assets/avatar-role-sentinel.png",
    Codex: "../assets/avatar-role-artificer.png",
    Scout: "../assets/avatar-role-ranger.png",
    Ops: "../assets/avatar-role-operator.png",
    Echo: "../assets/avatar-role-archivist.png",
    You: "../assets/avatar-role-femme-sentinel.png",
  };
  grid.innerHTML = members.length ? members.map((member, index) => {
    const assigned = state.quests.filter((item) => item.owner === member.name || item.raw?.assignee?.id === member.agentId);
    const active = assigned.filter((item) => !["completed", "archived"].includes(item.state)).length;
    const fixture = visualFixtureEnabled ? fixtureStats[member.name] : undefined;
    const load = fixture?.load ?? Math.min(100, Math.max(12, active * 24 + (member.state === "working" ? 48 : member.state === "review" ? 68 : 24)));
    const quests = fixture?.quests ?? assigned.length;
    const queue = fixture?.queue ?? assigned.filter((item) => item.state === "ready").length;
    const reviews = fixture?.reviews ?? assigned.filter((item) => item.state === "review").length;
    const tones = ["green", "blue", "gold", "red", "violet", "mint"];
    const avatar = visualFixtureEnabled && fixtureAvatarPaths[member.name]
      ? '<img src="' + fixtureAvatarPaths[member.name] + '" alt="" />'
      : escapeHtml(member.mark);
    return '<article class="status-agent-card"><span class="status-agent-avatar status-agent-avatar--' + tones[index % tones.length] + '">' + avatar + '</span><div><strong>' + escapeHtml(member.name) + '</strong><small>' + quests + ' quests</small><i><b style="width:' + load + '%"></b></i><span class="status-agent-meta">queue: ' + queue + ' - reviews: ' + reviews + '</span></div><em>' + load + '%</em></article>';
  }).join("") : '<p class="empty-note">No registered Agents.</p>';
  const selected: LabQuest | undefined = visualFixtureEnabled
    ? { id: "reference-readme", code: "2025-0519-003", kind: "main", title: "README改善", note: "初めての参照でREADMEへ新しい導入線を最適化する", progress: 60, owner: "Codex", mark: "CX", state: "working", due: "today", focus: 45, reward: 0, xp: 0, difficulty: 1 }
    : state.quests.find((item) => item.id === state.selectedQuestId) || state.quests[0];
  const setText = (selector: string, value: string): void => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  };
  setText("#statusRailQuestId", selected ? "QF-" + selected.code : "-");
  setText("#statusRailQuestTitle", selected?.title || "Select a Quest");
  setText("#statusRailQuestCopy", selected?.note || "Selected Quest");
  setText("#statusRailQuestState", selected ? stateLabel(selected.state) : "-");
  setText("#statusRailQuestProgress", selected ? selected.progress + (visualFixtureEnabled ? "% (3/5)" : "%") : "-");
  const progress = document.querySelector<HTMLElement>("#statusRailProgressBar");
  if (progress) progress.style.width = (selected?.progress || 0) + "%";
  const dots = document.querySelector<HTMLElement>("#statusRailHandoff");
  const dotCount = selected ? selected.state === "completed" ? 5 : selected.state === "working" ? 3 : 2 : 0;
  if (dots) dots.innerHTML = Array.from({ length: 5 }, (_, index) => '<span class="status-handoff-dot ' + (index < dotCount ? "is-done" : index === dotCount ? "is-current" : "") + '"></span>').join("");
  const owner = selected ? (visualFixtureEnabled ? referenceCaptureMembers.find((member) => member.name === selected.owner) : partyMember(selected.owner)) : undefined;
  const ownerElement = document.querySelector<HTMLElement>("#statusRailOwner");
  if (ownerElement) {
    const ownerAvatar = visualFixtureEnabled && fixtureAvatarPaths[owner?.name || ""]
      ? '<img src="' + fixtureAvatarPaths[owner?.name || ""] + '" alt="" />'
      : escapeHtml(owner?.mark || "");
    ownerElement.innerHTML = owner ? '<span class="status-agent-avatar status-agent-avatar--blue">' + ownerAvatar + '</span><div><strong>' + escapeHtml(owner.name) + '</strong><small>' + escapeHtml(visualFixtureEnabled ? "AI Agent" : owner.role) + '</small></div><em>' + selected.focus + 'm</em>' : '<small>Owner not set</small>';
  }
  setText("#statusRailReferenceDue", visualFixtureEnabled ? "今日 14:00 · Docs" : "-");
  setText("#statusRailReferenceRisk", visualFixtureEnabled ? "● 中" : "-");
  setText("#statusRailSyncState", "SYNC " + (state.remoteMode ? state.remoteConnectionState : state.syncStatus || "local-only"));
  setText("#statusRailSyncTime", "Last sync " + (state.lastSyncAt || "-"));
  document.querySelectorAll<HTMLButtonElement>("[data-rail-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.railMode === (state.settings.mode === "system" ? "dark" : state.settings.mode)));
}

// Only the active panel's renderers run on a plain navigation; renderAll({ full: true }) still
// rebuilds every panel for state-mutating paths (remote load, sign-in/out, settings import,
// Quest CRUD) so a panel the user isn't looking at is never stale when they switch to it.
const PANEL_RENDERERS: Record<LabView, Array<() => void>> = {
  today: [renderQuestList, renderArchiveControl, renderSelected],
  quests: [renderQuestList, renderArchiveControl, renderSelected],
  tree: [renderTree],
  agents: [renderAgents, renderAgentOperations, renderAgentRegistry],
  reviews: [renderReviewQueue],
  battle: [renderBattle, renderBattleReport],
  party: [renderParty],
  integrations: [renderIntegrations],
  profile: [renderProfile, renderProfileReference],
  settings: [renderAgentRegistry],
};

function renderAll(options: { full?: boolean } = {}): void {
  mountAgentRegistry();
  normalizeLabQuestStates();
  reconcileSelectedQuest();
  if (options.full) {
    (Object.keys(PANEL_RENDERERS) as LabView[]).forEach((view) => PANEL_RENDERERS[view].forEach((render) => render()));
  } else {
    PANEL_RENDERERS[state.view].forEach((render) => render());
  }
  renderTimer();
  renderConnection();
  renderPanelErrors();
  renderSidebarOpsContext();
  renderStatusRail();
  syncIslands();
}

function applyVisualPreferences(): void {
  const root = document.documentElement;
  document.body.classList.toggle("is-reference-fixture", visualFixtureEnabled);
  root.dataset.qfTheme = state.settings.theme;
  const resolvedMode = state.settings.mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : state.settings.mode;
  root.dataset.qfMode = state.settings.mode;
  root.dataset.qfResolvedMode = resolvedMode;
  const controls = $("#designLabControls");
  if (controls) controls.hidden = !import.meta.env.DEV;
  const themeSelect = $("#labThemeSelect");
  const modeSelect = $("#labModeSelect");
  if (themeSelect) themeSelect.value = state.settings.theme;
  if (modeSelect) modeSelect.value = state.settings.mode;
}

function applySettings() {
  applyVisualPreferences();
  document.body.classList.toggle("is-large-type", state.settings.typeScale);
  document.body.classList.toggle("is-relaxed-density", state.settings.density);
  document.body.classList.toggle("is-motion-reduced", !state.settings.motion);
  $$('[data-setting="typeScale"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.typeScale));
    button.textContent = state.settings.typeScale ? labText("settingsLarge") : labText("standard");
  });
  $$('[data-setting="density"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.density));
    button.textContent = state.settings.density ? labText("settingsRelaxed") : labText("standard");
  });
  $$('[data-setting="motion"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.motion));
    button.textContent = state.settings.motion ? labText("on") : labText("off");
  });
  $$('[data-setting="sound"]').forEach((button) => {
    button.setAttribute("aria-pressed", String(state.settings.sound));
    button.textContent = state.settings.sound ? labText("on") : labText("off");
  });
  $$('[data-detail-mode]').forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.detailMode === state.detailMode));
    button.textContent = button.dataset.detailMode === "modal" ? labText("modal") : labText("sheet");
  });
  const telemetryConsent = getTelemetryConsent();
  const telemetryToggle = $("#telemetryConsentToggle");
  const telemetryStatus = $("#telemetryConsentStatus");
  if (telemetryToggle) telemetryToggle.checked = telemetryConsent === "granted";
  if (telemetryStatus) telemetryStatus.textContent = t(`telemetry.${telemetryConsent}`);
  renderSelected();
}

function setMobileMore(open: boolean): void {
  state.mobileMoreOpen = open;
  const menu = $("#mobileMoreMenu");
  const toggle = $("#mobileMoreToggle");
  if (!menu || !toggle) return;
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
}

function setView(view: LabView, options: { syncHash?: boolean; replaceHistory?: boolean } = {}): void {
  const { syncHash = true, replaceHistory = false } = options;
  if (syncHash && window.location.hash !== `#${view}`) {
    if (replaceHistory) window.history.replaceState(null, "", `#${view}`);
    else window.history.pushState(null, "", `#${view}`);
  }
  state.view = view;
  state.mobileSheetOpen = false;
  document.body.classList.remove("is-detail-modal");
  document.body.classList.toggle("is-today-view", view === "today" || view === "quests");
  document.body.classList.toggle("is-tree-view", view === "tree");
  const titles: Record<LabView, string> = { today: "today", quests: "today", tree: "tree", agents: "agentHeading", reviews: "confirm", battle: "battle", party: "party", integrations: "integrations", profile: "profile", settings: "settings" };
  const panelView = view === "quests" ? "today" : view;
  $("#pageTitle").textContent = labText(titles[view]);
  $$("[data-panel]").forEach((panel) => {
    const active = panel.dataset.panel === panelView;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  setMobileMore(false);
  renderSelected();
  applyLabLocale();
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAll();
}

function selectQuest(id: string | undefined): void {
  if (!id) return;
  state.selectedQuestId = id;
  state.selectionAnchorId = id;
  state.mobileSheetOpen = state.detailMode === "modal";
  renderQuestList();
  renderSelected();
}

async function completeSelectedQuest() {
  const item = quest(state.selectedQuestId);
  if (!item || item.state === "completed" || item.state === "archived") return;
  if (!ensureRemoteWritable()) return;
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
  const oneOff = isOneOffTodo(item);
  item.state = oneOff ? "archived" : "completed";
  item.lifecycleState = oneOff ? "archived" : "active";
  item.completedAt = new Date().toISOString();
  if (oneOff) item.archivedAt = item.completedAt;
  item.progress = 100;
  state.mp = Math.min(100, state.mp + item.reward);
  state.battleLog.unshift(item.title + "を完了。+" + item.reward + " MPを獲得。");
  notify(item.title + "を完了。+" + item.reward + " MPを獲得しました。");
  persistState();
  renderAll({ full: true });
}

function confirmBulkAction(action: string, items: LabQuest[], preview: JsonRecord): boolean {
  const count = Number(preview?.count ?? items.length);
  return window.confirm(`${count}件を「${action}」します。報酬・状態を確認して実行しますか？`);
}

async function bulkCompleteQuests() {
  const items = selectionItems().filter((item) => sourceQuestKind(item) === "todo" && item.state !== "completed" && item.state !== "archived");
  if (!items.length) {
    notify("完了できるTo Doが選択されていません。");
    return;
  }
  try {
    if (!ensureRemoteWritable()) return;
    if (state.remoteMode) {
      setSyncStatus("syncing");
      const ids = items.map((item) => item.id);
      const preview = await repository.batchScoreQuests(ids, "up", true);
      if (!confirmBulkAction("完了", items, preview)) {
        setSyncStatus("synced");
        return;
      }
      applyRemoteResponse(await repository.batchScoreQuests(ids, "up", false));
    } else {
      if (!confirmBulkAction("完了", items, { count: items.length })) return;
      items.forEach((item) => {
        const now = new Date().toISOString();
        item.state = isOneOffTodo(item) ? "archived" : "completed";
        item.lifecycleState = isOneOffTodo(item) ? "archived" : "active";
        item.progress = 100;
        item.completedAt = now;
        if (isOneOffTodo(item)) item.archivedAt = now;
        state.mp = Math.min(100, state.mp + Number(item.reward || 0));
      });
      persistState();
      renderAll({ full: true });
    }
    clearQuestSelection();
    notify(`${items.length}件を完了しました。`);
  } catch (error) {
    setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "一括完了に失敗しました。");
    notify(error instanceof QuestForgeApiError ? error.message : "一括完了に失敗しました。データは変更していません。");
  }
}

async function bulkLifecycleQuests(action: "archive" | "restore"): Promise<void> {
  const restoring = action === "restore";
  const items = selectionItems().filter((item) => isOneOffTodo(item) && (restoring
    ? item.lifecycleState === "archived" || item.state === "archived"
    : item.lifecycleState === "completed" || item.lifecycleState === "archived" || item.state === "completed" || item.state === "archived"));
  const label = restoring ? "戻す" : "保管";
  if (!items.length) {
    notify(`${label}できる単発To Doが選択されていません。`);
    return;
  }
  try {
    if (!ensureRemoteWritable()) return;
    if (state.remoteMode) {
      setSyncStatus("syncing");
      const ids = items.map((item) => item.id);
      const preview = await repository.batchUpdateQuests(ids, { lifecycleState: restoring ? "active" : "archived" }, true);
      if (!confirmBulkAction(label, items, preview)) {
        setSyncStatus("synced");
        return;
      }
      applyRemoteResponse(await repository.batchUpdateQuests(ids, { lifecycleState: restoring ? "active" : "archived" }, false));
    } else {
      if (!confirmBulkAction(label, items, { count: items.length })) return;
      items.forEach((item) => {
        item.lifecycleState = restoring ? "active" : "archived";
        item.state = restoring ? "ready" : "archived";
        if (restoring) {
          item.completedAt = "";
          item.archivedAt = "";
          item.progress = 0;
        } else {
          const now = new Date().toISOString();
          item.completedAt ||= now;
          item.archivedAt = now;
          item.progress = 100;
        }
      });
      persistState();
      renderAll({ full: true });
    }
    clearQuestSelection();
    notify(`${items.length}件を${label}しました。`);
  } catch (error) {
    setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : `一括${label}に失敗しました。`);
    notify(error instanceof QuestForgeApiError ? error.message : `一括${label}に失敗しました。データは変更していません。`);
  }
}

type LabBattleCommand = "attack" | "skill" | "guard" | "heal" | "burst";

async function battleCommand(command: string | undefined): Promise<void> {
  if (!command || !["attack", "skill", "guard", "heal", "burst"].includes(command)) return;
  const commands: Record<LabBattleCommand, { cost: number; damage: number; label: string }> = {
    attack: { cost: 0, damage: 9, label: "たたかう" },
    skill: { cost: 18, damage: 24, label: "Aegis Break" },
    guard: { cost: 6, damage: 0, label: "まもる" },
    heal: { cost: 14, damage: 0, label: "かいふく" },
    burst: { cost: 40, damage: 46, label: "バースト" }
  };
  const current = commands[command as LabBattleCommand];
  if (!current || state.mp < current.cost || state.bossHp <= 0) return;
  if (!ensureRemoteWritable()) return;
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const response = await repository.battleCommand(command, state.battleTurn, `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      applyRemoteResponse(response);
      const effects = asJsonRecord(response.effects);
      const sessionBattle = asJsonRecord(asJsonRecord(response.session).battle);
      $("#battleMessage").textContent = stringField(effects, "message") || (sessionBattle.ended ? "勝利。次のボスを選ぼう。" : current.label + "を実行しました。");
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
  state.timerId = window.setInterval(() => {
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
  const ownerInput = $("#questOwnerInput");
  ownerInput.innerHTML = '<option value="">自分で担当</option>' + (state.remoteMode ? (state.registeredAgents || []).filter((agent) => agent.status === "active").map((agent) => '<option value="' + escapeHtml(agent.agentId) + '">' + escapeHtml(agent.displayName) + '</option>').join("") : '<option value="Cyan">Cyan</option><option value="Archivist">Archivist</option>');
  $("#addDialog").showModal();
  $("#questNameInput").focus();
}

function openEdit() {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  $("#editQuestId").value = item.id;
  $("#editQuestTitle").value = item.title;
  $("#editQuestNotes").value = item.note || "";
  $("#editQuestDue").value = String(item.raw?.dueDate || "");
  $("#editQuestParent").innerHTML = '<option value="">ルートQuest</option>' + state.quests.filter((candidate) => candidate.id !== item.id && !candidate.parent).map((candidate) => '<option value="' + escapeHtml(candidate.id) + '">' + escapeHtml(candidate.title) + '</option>').join("");
  $("#editQuestParent").value = item.parent || "";
  $("#editQuestAgent").innerHTML = '<option value="">自分で担当</option>' + (state.registeredAgents || []).filter((agent) => agent.status === "active").map((agent) => '<option value="' + escapeHtml(agent.agentId) + '">' + escapeHtml(agent.displayName) + '</option>').join("");
  $("#editQuestAgent").value = String(item.raw?.assignee?.id || "");
  $("#editQuestHandoff").value = String(item.raw?.assignee?.handoffState || "none");
  $("#editDialog").showModal();
}

async function refreshAgentRegistry() {
  const [agents, connections] = await Promise.all([repository.listAgents(true), repository.listAgentConnections()]);
  state.registeredAgents = normalizeRemoteSnapshot({ agents: asJsonRecord(agents).agents }).agents;
  const normalizedConnections = normalizeRemoteSnapshot({ agentConnections: connections }).agentConnections;
  state.agentConnections = normalizedConnections;
  if (normalizedConnections.authorizedClients.length || normalizedConnections.connections.length) trackTelemetry("mcp_connection_success", { source: "next" });
  renderAll({ full: true });
}

function openReview() {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  $("#reviewTitle").textContent = item.code + " / " + item.title;
  $("#reviewNote").value = item.note;
  $("#reviewDialog").showModal();
  $("#reviewNote").focus();
}

async function addQuest(data: FormData): Promise<void> {
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const owner = String(data.get("owner") || "");
  const focus = Number(data.get("focus") || 30);
  const dueInput = String(data.get("due") || "");
  if (!ensureRemoteWritable()) return;
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const selectedAgent = (state.registeredAgents || []).find((agent) => agent.agentId === owner);
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
        ...(selectedAgent ? { assignee: { type: "agent", id: selectedAgent.agentId, label: selectedAgent.displayName, handoffState: selectedAgent.defaultHandoffState || "ready" } } : {}),
      });
      if (response?.quest) {
        const created = remoteQuestToLab(asJsonRecord(response.quest), state.quests.length);
        state.quests.push(created);
        state.selectedQuestId = created.id;
      }
      state.lastSyncAt = formatSyncTime();
      setSyncStatus("synced");
      trackTelemetry("sync_success", { source: "gateway" });
      if (selectedAgent) trackTelemetry("agent_assignment_success", { source: "next" });
      persistState();
      renderAll({ full: true });
      notify(title + "をQuestForge本体へ追加しました。");
    } catch (error) {
      trackTelemetry("sync_failure", { source: "gateway", status: error instanceof QuestForgeApiError ? String(error.status || "error") : "error" });
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
    owner: owner || "Astra",
    mark: partyMember(owner || "Astra")?.mark || "AS",
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
  renderAll({ full: true });
  notify(title + "を追加しました。");
}

$$<LabElement>("[data-view]").forEach((button) => button.addEventListener("click", () => {
  if (isLabView(button.dataset.view)) setView(button.dataset.view);
}));

$("#questList").addEventListener("click", (event: LabEvent) => {
  const checkbox = closestLabElement(event, "[data-select-quest]");
  if (checkbox) {
    event.preventDefault();
    event.stopPropagation();
    toggleQuestSelection(checkbox.dataset.selectQuest, event);
    return;
  }
  const toggle = closestLabElement(event, "[data-toggle]");
  if (toggle) {
    const id = toggle.dataset.toggle;
    if (!id) return;
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
    renderQuestList();
    return;
  }
  const row = closestLabElement(event, "[data-quest]");
  if (row) {
    if (event.shiftKey || event.ctrlKey || event.metaKey) toggleQuestSelection(row.dataset.quest, event);
    else selectQuest(row.dataset.quest);
  }
});

$("#questList").addEventListener("keydown", (event: LabEvent) => {
  if ((event.key === "Enter" || event.key === " ") && (event.target as Element).matches("[data-quest]")) {
    event.preventDefault();
    selectQuest((event.target as LabElement).dataset.quest);
  }
});

$("#treeList").addEventListener("click", (event: LabEvent) => {
  const button = closestLabElement(event, "[data-tree-select]");
  if (!button) return;
  selectQuest(button.dataset.treeSelect);
  setView("today");
});

$("#agentList").addEventListener("click", (event: LabEvent) => {
  const button = closestLabElement(event, "[data-agent]");
  if (!button) return;
  const member = partyMembers.find((item) => item.name === button.dataset.agent);
  if (member) notify(member.name + ": " + member.task);
});

$("#toggleAgentRegistry").addEventListener("click", (event: LabEvent) => {
  const button = event.currentTarget;
  const mount = $("#agentRegistryMount");
  mount.hidden = !mount.hidden;
  button.setAttribute("aria-expanded", String(!mount.hidden));
});

$("#agentOperationsGrid").addEventListener("click", (event: LabEvent) => {
  const button = closestLabElement(event, "[data-agent-operation]");
  if (!button) return;
  state.agentFocusId = button.dataset.agentOperation || "";
  renderAgentOperations();
});

$("#agentOperationsInspector").addEventListener("click", (event: LabEvent) => {
  const button = closestLabElement(event, "[data-agent-open-quest]");
  const target = button?.dataset.agentOpenQuest;
  if (!target) return;
  selectQuest(target);
  setView("quests");
});

$("#reviewQueue").addEventListener("click", (event: LabEvent) => {
  const button = closestLabElement(event, "[data-review-quest]");
  if (!button?.dataset.reviewQuest) return;
  selectQuest(button.dataset.reviewQuest);
  setView("quests");
});

$("#integrationList").addEventListener("click", (event: LabEvent) => {
  const card = closestLabElement(event, "[data-integration]");
  if (!card) return;
  state.integration = card.dataset.integration || state.integration;
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

$("#clearSelection")?.addEventListener("click", clearQuestSelection);
$("#bulkCompleteButton")?.addEventListener("click", bulkCompleteQuests);
$("#bulkArchiveButton")?.addEventListener("click", () => bulkLifecycleQuests("archive"));
$("#bulkRestoreButton")?.addEventListener("click", () => bulkLifecycleQuests("restore"));

$("#sortButton").addEventListener("click", (event: LabEvent) => {
  const values = ["due", "progress", "owner"];
  state.sort = values[(values.indexOf(state.sort) + 1) % values.length];
  const sortLabels: Record<string, string> = { due: labText("sortDue"), progress: labText("sortProgress"), owner: labText("sortOwner") };
  event.currentTarget.textContent = sortLabels[state.sort] || labText("sortDue");
  renderQuestList();
});

$("#collapseTree").addEventListener("click", () => {
  state.expanded.clear();
  persistState();
  renderQuestList();
  notify("今日の一覧のサブQuestを閉じました。");
});

$("#resetBattle").addEventListener("click", () => {
  if (state.remoteMode && !ensureRemoteWritable()) return;
  if (state.remoteMode) {
    notify("本体バトルのリセットAPIはまだ公開していません。ローカルへ戻ると試せます。");
    return;
  }
  state.mp = 68;
  state.bossHp = 71;
  state.battleLog = ["戦闘をリセットしました。", "Questを完了するとMPを獲得できる。"];
  $("#battleMessage").textContent = t("battle.intro");
  persistState();
  renderBattle();
});

async function runIntegrationAction(dryRun: boolean): Promise<void> {
  const selected = integrations.find((item) => item.id === state.integration) || integrations[0];
  if (!selected) return;
  if (!externalOAuthEnabled) {
    notify("外部サービス連携は公開βでは準備中です。接続APIは次のロードマップで有効化します。");
    return;
  }
  if (!state.remoteMode) {
    notify(selected.name + (dryRun ? "の同期内容をプレビューしました。外部データは変更していません。" : "の同期は、本体へ接続すると実行できます。"));
    return;
  }
  if (!ensureRemoteWritable()) return;
  const serviceMap: Record<string, string> = { calendar: "google-calendar", tasks: "google-tasks", notion: "notion", focus: "toggl-focus" };
  const service = serviceMap[state.integration];
  if (!service || service === "toggl-focus") {
    notify(selected.name + "はこの画面の同期API対象外です。連携画面から設定してください。");
    return;
  }
  try {
    setSyncStatus("syncing");
    const directionMap: Record<string, string> = { "google-calendar": "import", "google-tasks": "bidirectional", notion: "export" };
    const direction = directionMap[service] || "import";
    const response = dryRun ? await repository.previewSync(service, direction) : await repository.syncService(service, direction);
    const summary = asJsonRecord(response.summary);
    const changes = Array.isArray(response.changes) ? response.changes : [];
    const count = summary.created ?? summary.updated ?? changes.length;
    state.lastSyncAt = formatSyncTime();
    setSyncStatus("synced");
    persistState();
    renderAll({ full: true });
    notify(`${selected.name}の${dryRun ? "プレビュー" : "同期"}を完了しました${Number.isFinite(count) ? `（${count}件）` : ""}。`);
  } catch (error) {
    setSyncStatus("error", error instanceof QuestForgeApiError ? error.message : "外部同期に失敗しました。");
    notify(error instanceof QuestForgeApiError ? error.message : "外部同期に失敗しました。外部データは変更していません。");
  }
}

$("#previewButton").addEventListener("click", () => runIntegrationAction(true));
$("#syncButton").addEventListener("click", () => runIntegrationAction(false));


$("#labThemeSelect")?.addEventListener("change", (event: LabEvent) => {
  const value = (event.currentTarget as LabElement).value;
  if (value !== "arcane" && value !== "soft-ops" && value !== "retro") return;
  state.settings.theme = value;
  localStorage.setItem("questforge-interaction-settings", JSON.stringify(state.settings));
  applySettings();
  notify("Theme changed to " + value + ".");
});

$("#labModeSelect")?.addEventListener("change", (event: LabEvent) => {
  const value = (event.currentTarget as LabElement).value;
  if (value !== "light" && value !== "dark" && value !== "system") return;
  state.settings.mode = value;
  localStorage.setItem("questforge-interaction-settings", JSON.stringify(state.settings));
  applySettings();
  notify("Color mode changed to " + value + ".");
});

$("#statusRailAgentsButton")?.addEventListener("click", () => setView("agents"));
$("#statusRailOpenQuest")?.addEventListener("click", () => { if (state.selectedQuestId) selectQuest(state.selectedQuestId); setView("quests"); });
$("#statusRailEdit")?.addEventListener("click", () => setView("settings"));
$("#statusRailMcp")?.addEventListener("click", () => setView("integrations"));
document.querySelectorAll<HTMLButtonElement>("[data-rail-mode]").forEach((button) => button.addEventListener("click", () => {
  const mode = button.dataset.railMode;
  if (mode !== "light" && mode !== "dark") return;
  state.settings.mode = mode;
  localStorage.setItem("questforge-interaction-settings", JSON.stringify(state.settings));
  applySettings();
  renderStatusRail();
}));

const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
colorSchemeQuery.addEventListener("change", () => {
  if (state.settings.mode === "system") applySettings();
});

$$("[data-setting]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.setting as keyof Pick<LabSettings, "typeScale" | "density" | "motion" | "sound"> | undefined;
  if (!key) return;
  state.settings[key] = !state.settings[key];
  localStorage.setItem("questforge-interaction-settings", JSON.stringify(state.settings));
  applySettings();
  notify({ typeScale: "文字サイズを切り替えました。", density: "表示密度を切り替えました。", motion: "モーション設定を切り替えました。", sound: "効果音設定を切り替えました。" }[key]);
}));

$$('[data-detail-mode]').forEach((button) => button.addEventListener("click", () => {
  state.detailMode = button.dataset.detailMode === "modal" ? "modal" : "sheet";
  state.mobileSheetOpen = false;
  localStorage.setItem("questforge-interaction-detail-mode", state.detailMode);
  applySettings();
  notify(state.detailMode === "modal" ? "Quest詳細をポップアップ表示にしました。" : "Quest詳細を下から表示に戻しました。");
}));

$$('[data-archive-toggle]').forEach((toggle) => toggle.addEventListener("click", () => {
  state.showArchived = !state.showArchived;
  localStorage.setItem("questforge-interaction-archive-visible", String(state.showArchived));
  renderAll({ full: true });
  notify(state.showArchived ? "保管済みQuestを表示しました。" : "保管済みQuestを隠しました。");
}));

$("#completeButton").addEventListener("click", completeSelectedQuest);
$("#selectedSheetToggle").addEventListener("click", () => {
  state.mobileSheetOpen = !state.mobileSheetOpen;
  renderSelected();
});
$("#selectedBackdrop").addEventListener("click", () => {
  state.mobileSheetOpen = false;
  renderSelected();
});
document.addEventListener("keydown", ((event: LabEvent) => {
  if (event.key === "Escape" && state.detailMode === "modal" && state.mobileSheetOpen) {
    state.mobileSheetOpen = false;
    renderSelected();
  }
}) as EventListener);
$("#timerButton").addEventListener("click", toggleTimer);
$("#openAddDialog").addEventListener("click", openAdd);
$("#mobileAdd").addEventListener("click", openAdd);
$("#mobileMoreToggle").addEventListener("click", () => setMobileMore(!state.mobileMoreOpen));
$("#cancelAdd").addEventListener("click", () => $("#addDialog").close());
$("#reviewButton").addEventListener("click", openReview);
$("#editQuestButton").addEventListener("click", openEdit);
$("#archiveQuestButton").addEventListener("click", async () => {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  const restoring = item.lifecycleState === "archived";
  if (!ensureRemoteWritable()) return;
  if (state.remoteMode) {
    try {
      const response = await repository.updateQuest(item.id, { lifecycleState: restoring ? "active" : "archived" });
      applyRemoteResponse(response);
      if (!restoring && !state.showArchived) reconcileSelectedQuest();
      renderAll({ full: true });
      notify(item.title + (restoring ? "を戻しました。" : "を保管しました。"));
    } catch (error) { notify(errorMessage(error, "保管操作に失敗しました。")); }
    return;
  }
  item.lifecycleState = restoring ? "active" : "archived";
  item.state = restoring ? "ready" : "archived";
  if (restoring) {
    item.completedAt = "";
    item.archivedAt = "";
    item.progress = 0;
  } else {
    const now = new Date().toISOString();
    item.completedAt ||= now;
    item.archivedAt = now;
    item.progress = 100;
  }
  if (!restoring && !state.showArchived) reconcileSelectedQuest();
  renderAll({ full: true }); persistState();
});
$("#cancelEdit").addEventListener("click", () => $("#editDialog").close());
$("#editForm").addEventListener("submit", async (event: LabEvent) => {
  event.preventDefault();
  const item = quest($("#editQuestId").value);
  if (!item) return;
  const agentId = $("#editQuestAgent").value;
  const agent = (state.registeredAgents || []).find((candidate) => candidate.agentId === agentId);
  const patch = { title: $("#editQuestTitle").value.trim(), notes: $("#editQuestNotes").value.trim(), dueDate: $("#editQuestDue").value, parentQuestId: $("#editQuestParent").value, assignee: agent ? { type: "agent", id: agent.agentId, label: agent.displayName, handoffState: $("#editQuestHandoff").value } : { type: "self", id: "self", label: "自分", handoffState: "none" } };
  try {
    if (!ensureRemoteWritable()) return;
    if (state.remoteMode) {
      applyRemoteResponse(await repository.updateQuest(item.id, patch));
      if (agent) trackTelemetry("agent_assignment_success", { source: "next" });
    }
    else Object.assign(item, { title: patch.title, note: patch.notes, parent: patch.parentQuestId, owner: agent?.displayName || "Astra", state: remoteState(asJsonRecord({ assignee: patch.assignee })) });
    $("#editDialog").close(); renderAll({ full: true }); persistState(); notify("Questを更新しました。");
  } catch (error) { notify(errorMessage(error, "Questの更新に失敗しました。")); }
});

function resetAgentForm() {
  $("#agentForm").reset();
  $("#agentEditingId").value = "";
  $("#agentIdInput").disabled = false;
}

function resizeAvatar(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("アイコンを読み込めませんでした。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("画像形式を確認してください。"));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("画像編集用のキャンバスを初期化できませんでした。"));
          return;
        }
        context.clearRect(0, 0, size, size);
        const scale = Math.min(size / image.width, size / image.height);
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
        const result = canvas.toDataURL("image/webp", 0.82);
        if (result.length > 700000) reject(new Error("画像を小さくしてから設定してください。"));
        else resolve(result);
      };
      if (typeof reader.result !== "string") {
        reject(new Error("画像データを読み込めませんでした。"));
        return;
      }
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

$("#profileAvatarInput").addEventListener("change", async (event: LabEvent) => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) {
    notify("画像は4MB以下のPNG・JPG・WebPを選んでください。");
    event.currentTarget.value = "";
    return;
  }
  try {
    state.avatarDataUrl = await resizeAvatar(file);
    localStorage.setItem("questforge-interaction-avatar", state.avatarDataUrl);
    if (state.remoteMode && !ensureRemoteWritable()) return;
    if (state.remoteMode && state.profile?.handle) {
      try {
        const response = await repository.updateProfile({
          displayName: state.profile.displayName || state.authUser?.displayName || "ひろなお",
          handle: state.profile.handle,
          avatarRole: state.profile?.avatarRole || "sentinel",
          avatarVariant: state.profile?.avatarVariant || "femme",
          avatarUrl: state.avatarDataUrl,
        });
        state.profile = normalizeRemoteSnapshot({ profile: response.profile }).profile || state.profile;
      } catch (error) {
        notify(errorMessage(error, "アイコンは端末に保存しましたが、本体同期に失敗しました。"));
      }
    }
    renderProfile();
    renderAgents();
    renderParty();
    notify("相棒キャラのアイコンをこの端末に設定しました。");
  } catch (error) {
    notify(errorMessage(error, "アイコンの設定に失敗しました。"));
  } finally {
    event.currentTarget.value = "";
  }
});

$("#agentConnectionList").addEventListener("click", async (event: LabEvent) => {
  const button = closestLabElement(event, "[data-agent-unlink]");
  if (!button || !state.remoteMode) return;
  if (!ensureRemoteWritable()) return;
  try {
    const agentId = button.dataset.agentUnlink;
    const clientId = button.dataset.clientUnlink;
    if (!agentId || !clientId) return;
    await repository.unlinkAgentConnection(agentId, clientId);
    await refreshAgentRegistry();
    notify("MCPクライアントの紐付けを解除しました。");
  } catch (error) {
    notify(errorMessage(error, "MCP接続の紐付けを解除できませんでした。"));
  }
});

$("#agentFormReset").addEventListener("click", resetAgentForm);
$("#agentRegistryList").addEventListener("click", async (event: LabEvent) => {
  const edit = closestLabElement(event, "[data-agent-edit]");
  const archive = closestLabElement(event, "[data-agent-archive]");
  const agentId = edit?.dataset.agentEdit || archive?.dataset.agentArchive;
  const agent = (state.registeredAgents || []).find((item) => item.agentId === agentId);
  if (!agent) return;
  if (edit) {
    $("#agentEditingId").value = agent.agentId; $("#agentIdInput").value = agent.agentId; $("#agentIdInput").disabled = true;
    $("#agentNameInput").value = agent.displayName; $("#agentProviderInput").value = agent.provider; $("#agentRoleInput").value = agent.role; $("#agentInstructionsInput").value = agent.instructions || "";
  } else {
    if (!ensureRemoteWritable()) return;
    try { await repository.updateAgent(agent.agentId, { status: "archived", expectedUpdatedAt: agent.updatedAt }); await refreshAgentRegistry(); notify("Agentと関連MCP接続をアーカイブしました。"); } catch (error) { notify(errorMessage(error, "Agentをアーカイブできませんでした。")); }
  }
});
$("#agentForm").addEventListener("submit", async (event: LabEvent) => {
  event.preventDefault();
  if (!state.remoteMode) { notify("Agent登録はQuestForge本体へ接続後に利用できます。"); return; }
  if (!ensureRemoteWritable()) return;
  const editingId = $("#agentEditingId").value;
  const input = { agentId: $("#agentIdInput").value.trim().toLowerCase(), displayName: $("#agentNameInput").value.trim(), provider: $("#agentProviderInput").value.trim() || "generic", role: $("#agentRoleInput").value.trim() || "assistant", instructions: $("#agentInstructionsInput").value.trim(), reviewRequired: true, dryRunDefault: true };
  try {
    if (editingId) {
      const current = state.registeredAgents.find((agent) => agent.agentId === editingId);
      if (!current) throw new Error("編集対象のAgentが見つかりません。");
      const { agentId: _immutable, ...patch } = input;
      await repository.updateAgent(editingId, { ...patch, expectedUpdatedAt: current.updatedAt });
    } else await repository.createAgent(input);
    resetAgentForm(); await refreshAgentRegistry(); notify("Agent台帳を保存しました。");
  } catch (error) { notify(errorMessage(error, "Agent台帳を保存できませんでした。")); }
});
$("#linkAgentClient").addEventListener("click", async () => {
  const agentId = $("#agentLinkInput").value;
  const clientId = $("#agentClientInput").value;
  if (!agentId || !clientId) { notify("AgentとMCPクライアントを選んでください。"); return; }
  if (!ensureRemoteWritable()) return;
  const existing = (state.agentConnections?.connections || []).find((connection) => connection.clientId === clientId && !connection.revokedAt);
  if (existing && existing.agentId !== agentId) {
    notify(`このMCPクライアントは${existing.agentId}に紐付いています。先に現在の紐付けを解除してください。`);
    return;
  }
  try { await repository.linkAgentConnection(agentId, clientId); await refreshAgentRegistry(); notify("MCPクライアントをAgentへ紐付けました。"); } catch (error) { notify(errorMessage(error, "MCP接続を紐付けできませんでした。")); }
});

$("#addForm").addEventListener("submit", (event: LabEvent) => {
  event.preventDefault();
  addQuest(new FormData($("#addForm")));
  $("#addDialog").close();
});

async function updateReview(accepted: boolean): Promise<void> {
  const item = quest(state.selectedQuestId);
  if (!item) return;
  const note = $("#reviewNote").value.trim();
  if (!ensureRemoteWritable()) return;
  if (state.remoteMode) {
    try {
      setSyncStatus("syncing");
      const currentState = item.raw?.assignee?.handoffState || "review_required";
      const response = await repository.transitionHandoff(item.id, { state: accepted ? "accepted" : "working", expectedState: currentState, note: note || item.note, dryRun: false });
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
  renderAll({ full: true });
}

$("#reviewForm").addEventListener("submit", async (event: LabEvent) => {
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
    setSyncStatus("error", errorMessage(error, "Googleログインに失敗しました。"));
  }
});

$("#signOutButton").addEventListener("click", async () => {
  try {
    const uid = state.authUser?.uid;
    remoteLoadGeneration += 1;
    if (uid) {
      writeAutoConnectPreference(uid, false);
      removeRemoteSnapshot(uid);
    }
    await signOutUser();
    notify("ログアウトしました。ローカルモードへ戻りました。");
  } catch {
    notify("ログアウトに失敗しました。");
  }
});

$("#loadRemoteButton").addEventListener("click", () => loadRemoteData({ source: "manual" }));
$("#reconnectButton")?.addEventListener("click", async () => {
  if (!state.authUser) {
    notify("先にGoogleログインを完了してください。");
    return;
  }
  state.remoteConnectionState = state.remoteMode ? "reconnecting" : "syncing";
  setSyncStatus(state.remoteMode ? "reconnecting" : "syncing");
  renderAll({ full: true });
  await loadRemoteData({ announce: true, source: "manual" });
});
$("#useLocalButton").addEventListener("click", () => {
  restoreLocalBackupState();
  localMode("この端末に保存中");
  renderAll({ full: true });
  notify("ローカルモードへ戻りました。リモートの変更は保持されています。");
});
$("#autoConnectToggle").addEventListener("change", async (event: LabEvent) => {
  const enabled = Boolean(event.currentTarget.checked);
  const uid = state.authUser?.uid;
  if (!uid) {
    event.currentTarget.checked = false;
    return;
  }
  state.autoConnectEnabled = enabled;
  writeAutoConnectPreference(uid, enabled);
  if (!enabled) {
    remoteLoadGeneration += 1;
    if (state.remoteMode && state.remoteConnectionState !== "synced") {
      state.remoteConnectionState = "stale";
      setSyncStatus("error", "自動接続をオフにしました。前回データを表示中です。");
    }
    renderAll({ full: true });
    notify("起動時の本体自動接続をオフにしました。");
    return;
  }
  const hasCache = state.remoteMode || restoreRemoteCacheForUser(uid);
  if (!hasCache) state.remoteSnapshotAvailable = false;
  state.remoteConnectionState = "reconnecting";
  setSyncStatus("reconnecting");
  renderAll({ full: true });
  await loadRemoteData({ announce: false, source: "auto" });
  if (state.remoteConnectionState === "synced") notify("起動時の本体自動接続をオンにしました。");
});
$("#gatewayUrlInput").addEventListener("change", (event: LabEvent) => {
  state.gatewayUrl = event.currentTarget.value.trim() || gatewayDefaultUrl();
  repository.setBaseUrl(state.gatewayUrl);
  try {
    localStorage.setItem("questforge-interaction-lab-gateway-url", state.gatewayUrl);
  } catch {
    // Keep the current URL in memory when browser storage is unavailable.
  }
  renderConnection();
});

$("#labLocaleSelect")?.addEventListener("change", (event: LabEvent) => {
  setLocale(event.currentTarget.value);
});

$("#telemetryConsentToggle")?.addEventListener("change", (event: LabEvent) => {
  setTelemetryConsent(event.currentTarget.checked ? "granted" : "denied");
  applySettings();
});

window.addEventListener("questforge:locale-changed", () => {
  applyLabLocale();
  applySettings();
  renderAll({ full: true });
});
window.addEventListener("questforge:telemetry-ready", () => applySettings());

try {
  observeAuth(async (user) => {
    const nextUser = user ? { uid: user.uid, email: user.email || "", displayName: user.displayName || "" } : null;
    if (!nextUser) {
      remoteLoadGeneration += 1;
      observedUid = "";
      state.authUser = null;
      restoreLocalBackupState();
      state.remoteMode = false;
      state.dataSource = "local";
      state.remoteOwnerUid = "";
      state.remoteSnapshotAvailable = false;
      state.remoteConnectionState = "local";
      state.autoConnectEnabled = false;
      setSyncStatus("local-only", "ログアウト済み。この端末に保存中");
      persistState();
      renderAll({ full: true });
      return;
    }

    if (observedUid && observedUid !== nextUser.uid) {
      remoteLoadGeneration += 1;
      restoreLocalBackupState();
    }
    observedUid = nextUser.uid;
    state.authUser = nextUser;
    const hasStoredAutoConnect = hasAutoConnectPreference(nextUser.uid);
    const storedAutoConnect = hasStoredAutoConnect ? readAutoConnectPreference(nextUser.uid) : true;
    state.autoConnectEnabled = storedAutoConnect;
    if (!hasStoredAutoConnect) writeAutoConnectPreference(nextUser.uid, true);

    if (!state.autoConnectEnabled) {
      restoreLocalBackupState();
      setSyncStatus("local-only", "ログイン済み。必要なときに本体データを読み込めます");
      persistState();
      renderAll({ full: true });
      return;
    }

    if (state.remoteMode && state.remoteOwnerUid === nextUser.uid && state.remoteConnectionState === "synced") {
      setSyncStatus("synced");
      renderAll({ full: true });
      return;
    }
    const hasCache = restoreRemoteCacheForUser(nextUser.uid);
    if (!hasCache) {
      // Do not show the previous device user's local/remote Quest list while this account loads.
      state.quests = [];
      state.selectedQuestId = "";
      state.selectedQuestIds = [];
      state.selectionAnchorId = "";
    }
    state.remoteConnectionState = hasCache ? "reconnecting" : "syncing";
    setSyncStatus("reconnecting");
    renderAll({ full: true });
    await loadRemoteData({ announce: false, source: "auto" });
  });
} catch {
  // A local-only build may omit Appwrite config; the Lab still works without an account.
  localMode("Appwrite未設定。この端末に保存中");
}

applySettings();
const hashView = window.location.hash.slice(1);
setView(isLabView(hashView) ? hashView : "today", { replaceHistory: !isLabView(hashView) });
window.addEventListener("hashchange", () => {
  const nextView = window.location.hash.slice(1);
  if (isLabView(nextView)) {
    setView(nextView, { syncHash: false });
    return;
  }
  setView("today", { replaceHistory: true });
});
