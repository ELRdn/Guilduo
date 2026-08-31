/**
 * FIXTURE DATA — NOT PRODUCTION CONTENT.
 *
 * Deterministic material for the six non-Command screens. Every record here is
 * built as a genuine domain value (`types/questforge.ts` Quest, the OpenAPI
 * Integration / Party / RegisteredAgent / BattleSession shapes) and pushed
 * through the same production adapters, so a fixture cannot pass a case the
 * real data would fail.
 *
 * Nothing in this module ships to a production build: it is imported only by
 * `../shell.ts` behind the interaction-lab surface and by the capture tooling.
 * No fixture Actor is ever added to the identity map that Command builds from
 * `/v1/profile` and `/v1/agents` — the screens reuse Command's map as-is.
 */

import type { ExternalLink, Quest } from "../../../types/questforge.ts";
import { fixtureRawQuests } from "../fixtures.ts";
import type { ScreenNotice } from "./screen-state.ts";

export const SCREEN_FIXTURE_ORIGIN = "fixture" as const;

/** The deterministic "now" every screen fixture is written against. */
export const FIXTURE_NOW = Date.parse("2026-08-26T11:20:00.000Z");
export const FIXTURE_TODAY = "2026-08-26";

/**
 * The state matrix from the brief's section 6. Each screen must render every
 * one of these deterministically, and the capture set takes one frame per state.
 */
export type ScreenVariant =
  | "default"
  | "loading"
  | "empty"
  | "partial"
  | "error"
  | "permission"
  | "offline"
  | "stale"
  | "conflict"
  | "long"
  | "dense";

export const SCREEN_VARIANTS: readonly ScreenVariant[] = [
  "default",
  "loading",
  "empty",
  "partial",
  "error",
  "permission",
  "offline",
  "stale",
  "conflict",
  "long",
  "dense",
];

export function isScreenVariant(value: string | null): value is ScreenVariant {
  return value !== null && (SCREEN_VARIANTS as readonly string[]).includes(value);
}

/**
 * The notice set for a variant. Kept in one place so all six screens speak with
 * the same voice for the same condition, with only the object name changing.
 */
export function noticesFor(variant: ScreenVariant, object: string, onRetry: () => void): readonly ScreenNotice[] {
  switch (variant) {
    case "loading":
      return [{ status: "loading", detail: `${object}を読み込んでいます。表示中の値はまだ確定していません。` }];
    case "partial":
      return [{
        status: "partial",
        detail: `${object}の一部が読み込めませんでした。読み込めた範囲はそのまま操作できます。`,
        action: { label: "再読み込み", onAct: onRetry },
      }];
    case "error":
      return [{
        status: "error",
        detail: `${object}を読み込めませんでした。前回の内容は表示していません。`,
        action: { label: "再試行", onAct: onRetry },
      }];
    case "permission":
      return [{
        status: "permission",
        detail: `${object}を読むスコープが付与されていません。Connections から必要なスコープを確認してください。`,
      }];
    case "offline":
      return [{
        status: "offline",
        detail: `接続がありません。最後に取得した${object}を表示し、書き込みは保留しています。`,
        action: { label: "再接続を試す", onAct: onRetry },
      }];
    case "stale":
      return [{
        status: "stale",
        detail: `${object}は5分以上更新されていません。書き込みは保留しています。`,
        action: { label: "最新に更新", onAct: onRetry },
      }];
    case "conflict":
      return [{
        status: "conflict",
        detail: `別のセッションが${object}を更新しました。最新を読み込むまで書き込みは行えません。`,
        action: { label: "最新を読み込む", onAct: onRetry },
      }];
    default:
      return [];
  }
}

/** Writes are held for every condition where the screen cannot trust its state. */
export function writeHeldFor(variant: ScreenVariant): boolean {
  return variant === "offline" || variant === "stale" || variant === "conflict"
    || variant === "permission" || variant === "loading" || variant === "error";
}

/* ------------------------------------------------------------------ *
 * Quests
 * ------------------------------------------------------------------ */

/** A complete `ExternalLink`; only the fields a screen reads are varied. */
function link(
  service: string,
  externalId: string,
  syncStatus: ExternalLink["syncStatus"],
  syncedAt: string,
): ExternalLink {
  return {
    service,
    externalId,
    type: "task",
    sourceType: "provider",
    url: "",
    projectId: "",
    organizationId: "",
    workspaceId: "",
    taskId: "",
    entryStartAt: "",
    entryStopAt: "",
    durationMinutes: 0,
    direction: "import",
    syncedAt,
    remoteUpdatedAt: syncedAt,
    localUpdatedAt: syncedAt,
    remoteEtag: "",
    syncStatus,
  };
}

function quest(overrides: Partial<Quest> & Pick<Quest, "id" | "title">): Quest {
  const base: Quest = {
    id: overrides.id,
    kind: "todo",
    title: overrides.title,
    notes: "",
    category: "delivery",
    tags: [],
    difficulty: "medium",
    repeat: "none",
    planningState: "scheduled",
    lifecycleState: "active",
    planningMode: "on_date",
    scheduledDate: "2026-08-26",
    scheduledTime: "",
    dueDate: "2026-08-28",
    estimatedMinutes: 60,
    actualMinutes: 0,
    manualActualMinutes: 0,
    togglActualMinutes: 0,
    completionCriteria: "",
    nextAction: "",
    impact: "medium",
    isBlockingOthers: false,
    rolloverCount: 0,
    dependencyIds: [],
    parentQuestId: "",
    completedAt: "",
    archivedAt: "",
    createdAt: "2026-08-18T09:00:00.000Z",
    updatedAt: "2026-08-26T09:00:00.000Z",
    done: false,
    assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "working" },
    handoff: {
      note: "",
      blockedReason: "",
      artifactUrl: "",
      startedAt: "2026-08-26T08:40:00.000Z",
      reviewRequestedAt: "",
      reviewedAt: "",
      reviewedBy: "",
    },
    externalLinks: [],
  };
  return { ...base, ...overrides };
}

/**
 * Portfolio rows beyond the nine Command already carries, so the table is dense
 * enough to prove comparison works: multiple owners, a completed tail, an
 * overdue Quest, a Quest with no due date and a deep downstream chain.
 */
const EXTRA_QUESTS: readonly Quest[] = [
  quest({
    id: "q-160", title: "設計トークンの命名規則を確定する",
    assignee: { type: "self", id: "self", label: "自分", handoffState: "none" },
    planningState: "scheduled", impact: "high", dueDate: "2026-08-24",
    nextAction: "COMPONENTS.md の差分を確定する", updatedAt: "2026-08-25T18:12:00.000Z",
  }),
  quest({
    id: "q-166", title: "Toggl Focus の時間配分を Quest へ紐づける",
    assignee: { type: "agent", id: "a-scribe", label: "Scribe", handoffState: "working" },
    impact: "low", dueDate: "2026-09-02", nextAction: "先週分の time entry を確認する",
    externalLinks: [link("toggl-focus", "we-2026-34", "synced", "2026-08-26T07:10:00.000Z")],
  }),
  quest({
    id: "q-171", title: "Agent Registry の権限表記を統一する",
    assignee: { type: "agent", id: "a-warden", label: "Warden", handoffState: "review_required" },
    impact: "medium", dueDate: "2026-08-27",
    externalLinks: [link("notion", "page-registry-scope", "unverified", "2026-08-24T21:12:00.000Z")],
    handoff: { note: "", blockedReason: "", artifactUrl: "artifact://registry-scope-diff", startedAt: "2026-08-26T06:05:00.000Z", reviewRequestedAt: "2026-08-26T10:31:00.000Z", reviewedAt: "", reviewedBy: "" },
    nextAction: "スコープ表記の差分を確認する",
  }),
  quest({
    id: "q-174", title: "Quest Tree の親子表示を Network と揃える",
    assignee: { type: "human", id: "mika", label: "Mika", handoffState: "working" },
    parentQuestId: "q-160", impact: "medium", dueDate: "2026-08-31",
    externalLinks: [link("google-tasks", "task-tree-parity", "synced", "2026-08-26T11:05:00.000Z")],
  }),
  quest({
    id: "q-176", title: "OAuth の再接続導線を Connections に置く",
    assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "blocked" },
    dependencyIds: ["q-171"], impact: "high", dueDate: "2026-08-29",
    externalLinks: [link("notion", "page-oauth-flow", "unverified", "2026-08-24T21:12:00.000Z")],
    handoff: { note: "", blockedReason: "Notion のスコープが不足しています", artifactUrl: "", startedAt: "2026-08-26T05:20:00.000Z", reviewRequestedAt: "", reviewedAt: "", reviewedBy: "" },
    isBlockingOthers: true,
  }),
  quest({
    id: "q-178", title: "Party の担当分布をダッシュボードに出す",
    assignee: { type: "agent", id: "a-scribe", label: "Scribe", handoffState: "ready" },
    dependencyIds: ["q-176"], impact: "low", dueDate: "",
  }),
  quest({
    id: "q-179", title: "Battle のターン制御を contract に合わせる",
    assignee: { type: "human", id: "mika", label: "Mika", handoffState: "working" },
    dependencyIds: ["q-176"], impact: "medium", dueDate: "2026-09-04",
    externalLinks: [link("google-calendar", "event-battle-contract", "synced", "2026-08-26T06:40:00.000Z")],
  }),
  quest({
    id: "q-183", title: "Chronicle の保持期間を決める",
    assignee: { type: "self", id: "self", label: "自分", handoffState: "none" },
    planningState: "backlog", impact: "low", dueDate: "",
  }),
  quest({
    id: "q-196", title: "9言語のラベル伸長を確認する",
    assignee: { type: "agent", id: "a-warden", label: "Warden", handoffState: "working" },
    impact: "medium", dueDate: "2026-09-08",
  }),
  quest({
    id: "q-197", title: "Reduced Motion での遷移を確認する",
    assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "working" },
    impact: "low", dueDate: "2026-09-10",
  }),
  quest({
    id: "q-150", title: "v3 Reference の凍結手順を文書化する",
    lifecycleState: "completed", done: true, completedAt: "2026-08-21T14:00:00.000Z",
    assignee: { type: "self", id: "self", label: "自分", handoffState: "accepted" },
    impact: "medium", dueDate: "2026-08-21", updatedAt: "2026-08-21T14:00:00.000Z",
  }),
  quest({
    id: "q-152", title: "Interaction Lab の route 分離を確認する",
    lifecycleState: "completed", done: true, completedAt: "2026-08-22T11:30:00.000Z",
    assignee: { type: "agent", id: "a-warden", label: "Warden", handoffState: "accepted" },
    impact: "low", dueDate: "2026-08-22", updatedAt: "2026-08-22T11:30:00.000Z",
  }),
  quest({
    id: "q-155", title: "型ポリシーの検査を CI に入れる",
    lifecycleState: "completed", done: true, completedAt: "2026-08-23T09:15:00.000Z",
    assignee: { type: "self", id: "self", label: "自分", handoffState: "accepted" },
    impact: "high", dueDate: "2026-08-23", updatedAt: "2026-08-23T09:15:00.000Z",
  }),
];

/** A title and an owner label at the length a 9-locale expansion produces. */
const LONG_TITLE =
  "Handoff の受け渡し状態と Evidence 検証結果を Command / Quests / Network の三画面で同じ語彙に揃えるための表記統一と、それに伴う既存ラベルの再翻訳";

/** Enough rows that the portfolio must scroll and stay comparable. */
function densify(base: readonly Quest[]): readonly Quest[] {
  const extra: Quest[] = [];
  for (let index = 0; index < 24; index += 1) {
    extra.push(quest({
      id: `q-3${String(index).padStart(2, "0")}`,
      title: `依存グラフの整合チェック ${index + 1}`,
      assignee: index % 3 === 0
        ? { type: "agent", id: "a-scribe", label: "Scribe", handoffState: "working" }
        : index % 3 === 1
          ? { type: "human", id: "mika", label: "Mika", handoffState: "working" }
          : { type: "self", id: "self", label: "自分", handoffState: "none" },
      impact: index % 4 === 0 ? "high" : index % 4 === 1 ? "medium" : "low",
      dueDate: `2026-09-${String((index % 27) + 1).padStart(2, "0")}`,
    }));
  }
  return [...base, ...extra];
}

export function fixtureQuestsFor(variant: ScreenVariant): readonly Quest[] {
  const base = [...fixtureRawQuests, ...EXTRA_QUESTS];
  switch (variant) {
    case "empty":
    case "error":
    case "permission":
      return [];
    case "loading":
      return [];
    case "partial":
      // The Quest page loaded; the Agent registry did not, so agent-assigned
      // rows are present but their owner resolves to a placeholder.
      return base;
    case "long":
      return base.map((entry, index) => (index === 0 ? { ...entry, title: LONG_TITLE, nextAction: LONG_TITLE } : entry));
    case "dense":
      return densify(base);
    default:
      return base;
  }
}

/* ------------------------------------------------------------------ *
 * Integrations
 *
 * Shaped exactly like `listIntegrations` in `worker/src/integrations.ts`:
 * the adapter metadata from `api/integration-adapters.json` plus a per-user
 * `account` record. No token, secret, refresh value or provider URL appears
 * here or anywhere the screen can render — the account carries only the fields
 * `publicAccount()` actually returns.
 * ------------------------------------------------------------------ */

export interface FixtureIntegrationAccount {
  readonly status: string;
  readonly providerAccountName: string;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly lastSyncedAt: string;
  readonly lastError: string;
}

export interface FixtureIntegration {
  readonly id: string;
  readonly name: string;
  readonly auth: string;
  readonly status: string;
  readonly capabilities: readonly string[];
  readonly configurationStatus: string;
  readonly account: FixtureIntegrationAccount | null;
}

const INTEGRATIONS: readonly FixtureIntegration[] = [
  {
    id: "google-tasks", name: "Google Tasks", auth: "oauth2", status: "connected",
    capabilities: ["import", "export", "bidirectional"], configurationStatus: "ready",
    account: {
      status: "connected", providerAccountName: "hironao@example.test", settings: { taskList: "Guilduo" },
      lastSyncedAt: "2026-08-26T11:05:00.000Z", lastError: "",
    },
  },
  {
    id: "google-calendar", name: "Google Calendar", auth: "oauth2", status: "connected",
    capabilities: ["import", "convert_to_quest"], configurationStatus: "ready",
    account: {
      status: "connected", providerAccountName: "hironao@example.test", settings: { calendar: "primary" },
      lastSyncedAt: "2026-08-26T06:40:00.000Z", lastError: "同期は成功しましたが、3件の予定が変換対象外でした。",
    },
  },
  {
    id: "notion", name: "Notion", auth: "oauth2", status: "reconnect_required",
    capabilities: ["import", "export"], configurationStatus: "ready",
    account: {
      status: "reconnect_required", providerAccountName: "Guilduo Workspace", settings: {},
      lastSyncedAt: "2026-08-24T21:12:00.000Z",
      lastError: "アクセス権が失効しました。再接続が必要です。",
    },
  },
  {
    id: "toggl-focus", name: "Toggl Focus", auth: "personal_api_key", status: "connected",
    capabilities: ["task_export", "timer_read", "timer_write", "time_entry_import"], configurationStatus: "ready",
    account: {
      status: "connected", providerAccountName: "workspace 4821", settings: { organizationId: "1204" },
      lastSyncedAt: "2026-08-26T10:58:00.000Z", lastError: "",
    },
  },
  {
    id: "toggl-track", name: "Toggl Track", auth: "basic_api_token", status: "not_connected",
    capabilities: ["import", "timer_read", "timer_write"], configurationStatus: "ready",
    account: null,
  },
  {
    id: "linear", name: "Linear", auth: "oauth2", status: "planned",
    capabilities: ["import"], configurationStatus: "planned",
    account: null,
  },
];

export function fixtureIntegrationsFor(variant: ScreenVariant): readonly FixtureIntegration[] {
  switch (variant) {
    case "empty":
    case "error":
    case "permission":
    case "loading":
      return [];
    case "partial":
      // The adapter list loaded; the per-user accounts did not.
      return INTEGRATIONS.map((entry) => ({ ...entry, account: null, status: entry.status === "planned" ? "planned" : "not_connected" }));
    case "long":
      return INTEGRATIONS.map((entry, index) => (index === 0
        ? {
          ...entry,
          name: "Google Tasks（Guilduo 用の双方向同期。タスクリスト単位で対象を選択し、15分ごとに自動で取り込みます）",
          account: entry.account === null ? null : { ...entry.account, lastError: LONG_TITLE },
        }
        : entry));
    case "dense":
      return [
        ...INTEGRATIONS,
        ...Array.from({ length: 8 }, (_unused, index) => ({
          id: `adapter-${index}`,
          name: `検証用アダプタ ${index + 1}`,
          auth: "oauth2",
          status: index % 3 === 0 ? "connected" : index % 3 === 1 ? "reconnect_required" : "not_connected",
          capabilities: ["import"],
          configurationStatus: "ready",
          account: index % 3 === 2 ? null : {
            status: index % 3 === 0 ? "connected" : "reconnect_required",
            providerAccountName: `account-${index}`,
            settings: {},
            lastSyncedAt: "2026-08-26T09:00:00.000Z",
            lastError: index % 3 === 1 ? "アクセス権が失効しました。" : "",
          },
        })),
      ];
    default:
      return INTEGRATIONS;
  }
}

/* ------------------------------------------------------------------ *
 * Party and Agent Registry
 *
 * `members` mirrors the `Party.members[]` shape (PublicProfile + role +
 * joinedAt); `agents` mirrors `RegisteredAgent`. Neither carries a token, an
 * instruction body or a private URL — only the fields the roster renders.
 * ------------------------------------------------------------------ */

export interface FixturePartyMember {
  readonly uid: string;
  readonly displayName: string;
  readonly handle: string;
  readonly role: "owner" | "member";
  readonly joinedAt: string;
  readonly level: number;
}

export interface FixtureAgent {
  readonly agentId: string;
  readonly displayName: string;
  readonly provider: string;
  readonly role: string;
  readonly status: "active" | "disabled" | "archived";
  readonly allowedScopes: readonly string[];
  readonly reviewRequired: boolean;
  readonly dryRunDefault: boolean;
  readonly defaultHandoffState: string;
}

const PARTY_MEMBERS: readonly FixturePartyMember[] = [
  { uid: "hironao", displayName: "Hironao", handle: "hironao", role: "owner", joinedAt: "2026-05-02T08:00:00.000Z", level: 24 },
  { uid: "mika", displayName: "Mika", handle: "mika", role: "member", joinedAt: "2026-06-14T10:30:00.000Z", level: 17 },
];

const AGENTS: readonly FixtureAgent[] = [
  {
    agentId: "a-forge", displayName: "Forge Runner", provider: "generic", role: "Build and test executor",
    status: "active", allowedScopes: ["quests:read", "quests:write", "handoff:write"],
    reviewRequired: true, dryRunDefault: true, defaultHandoffState: "working",
  },
  {
    agentId: "a-scribe", displayName: "Scribe", provider: "generic", role: "Document synthesiser",
    status: "active", allowedScopes: ["quests:read", "quests:write"],
    reviewRequired: true, dryRunDefault: true, defaultHandoffState: "ready",
  },
  {
    agentId: "a-warden", displayName: "Warden", provider: "generic", role: "Contract checker",
    status: "active", allowedScopes: ["quests:read", "handoff:write", "integrations:read"],
    reviewRequired: true, dryRunDefault: false, defaultHandoffState: "review_required",
  },
  {
    agentId: "a-astra", displayName: "Astra", provider: "generic", role: "Companion planner",
    status: "active", allowedScopes: ["quests:read"],
    reviewRequired: false, dryRunDefault: true, defaultHandoffState: "none",
  },
];

export function fixturePartyMembersFor(variant: ScreenVariant): readonly FixturePartyMember[] {
  switch (variant) {
    case "empty":
    case "error":
    case "permission":
    case "loading":
      return [];
    case "partial":
      // The profile loaded but the party did not: the signed-in human is all
      // the roster can prove exists.
      return PARTY_MEMBERS.slice(0, 1);
    case "long":
      return PARTY_MEMBERS.map((entry, index) => (index === 0
        ? { ...entry, displayName: "Hironao（Guilduo Relay Forge のオペレーターかつレビュー担当）", handle: "hironao-relay-forge-operator" }
        : entry));
    default:
      return PARTY_MEMBERS;
  }
}

export function fixtureAgentsFor(variant: ScreenVariant): readonly FixtureAgent[] {
  switch (variant) {
    case "empty":
    case "error":
    case "permission":
    case "loading":
      return [];
    case "partial":
      // Section 6 "partial": the Agent registry request failed, so agent-held
      // Quests still appear in the counts but their capabilities cannot.
      return [];
    case "long":
      return AGENTS.map((entry, index) => (index === 0
        ? {
          ...entry,
          role: "ビルドとテストの実行、失敗時の再試行、成果物の要約作成までを担当する実行系エージェント",
          allowedScopes: [...entry.allowedScopes, "integrations:read", "integrations:write", "battle:read", "party:read"],
        }
        : entry));
    case "dense":
      return [
        ...AGENTS,
        ...Array.from({ length: 10 }, (_unused, index) => ({
          agentId: `a-probe-${index}`,
          displayName: `Probe ${index + 1}`,
          provider: "generic",
          role: "検証用エージェント",
          status: (index % 5 === 4 ? "disabled" : "active") as FixtureAgent["status"],
          allowedScopes: ["quests:read"],
          reviewRequired: index % 2 === 0,
          dryRunDefault: true,
          defaultHandoffState: "ready",
        })),
      ];
    default:
      return AGENTS;
  }
}

export function fixturePartyNameFor(variant: ScreenVariant): string {
  if (variant === "empty" || variant === "error" || variant === "permission" || variant === "loading") return "";
  return "Relay Forge";
}
