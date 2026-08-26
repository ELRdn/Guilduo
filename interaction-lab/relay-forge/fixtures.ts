/**
 * FIXTURE DATA — NOT PRODUCTION CONTENT.
 *
 * NEWDESIGN.md section 25.7 requires golden-screen content to be deterministic
 * and identifiable as fixture data in source. Every export in this module is
 * fixture material used only to prove that each visual state defined by
 * sections 7.2, 13.2, 15.2 and 28.1 renders correctly. Names, counts, durations
 * and Agent outputs here are illustrative and make no claim about real usage.
 *
 * The Quest records are built as genuine `types/questforge.ts` Quest values and
 * pushed through the real adapter in `model.ts`, so the fixture exercises the
 * same mapping production data would take.
 */

import type { Quest } from "../../types/questforge.ts";
import {
  type Actor,
  type CapacitySlot,
  type ChronicleEvent,
  type CommandModel,
  type Evidence,
  type Intervention,
  type EvidenceArtifact,
  type LoomQuest,
  type RelayNodeState,
  type RelaySpine,
  type SelectedQuestView,
  toLoomQuest,
} from "./model.ts";

/** Marks every value in this module as fixture-sourced for review tooling. */
export const FIXTURE_ORIGIN = "fixture" as const;
export const FIXTURE_REVISION = "relay-forge-golden-1" as const;

/**
 * Fixture actors carry the same identity fields a real profile or Agent record
 * carries, so the avatar resolution chain is exercised end to end:
 *   Hironao / Mika  role crest from assets/avatar-role-*.webp
 *   Astra           companion crest
 *   Agents          no image asset ships for a provider, so they resolve to
 *                   initials, which is the production behaviour today
 *   System          initials
 */
const ACTOR_LIST: readonly Actor[] = [
  { id: "u-hironao", kind: "human", name: "Hironao", role: "Operator / reviewer", initials: "HN", avatarRole: "operator", avatarVariant: "masc" },
  { id: "u-mika", kind: "human", name: "Mika", role: "Integrations owner", initials: "MK", avatarRole: "archivist", avatarVariant: "femme" },
  { id: "a-astra", kind: "companion", name: "Astra", role: "Companion planner", initials: "AS", avatarRole: "sentinel", avatarVariant: "femme" },
  { id: "a-forge", kind: "agent", name: "Forge Runner", role: "Build and test executor", initials: "FR", provider: "generic" },
  { id: "a-scribe", kind: "agent", name: "Scribe", role: "Document synthesiser", initials: "SC", provider: "generic" },
  { id: "a-warden", kind: "agent", name: "Warden", role: "Contract checker", initials: "WD", provider: "generic" },
  { id: "s-sync", kind: "system", name: "Sync", role: "Appwrite replication", initials: "SY" },
  { id: "s-oauth", kind: "system", name: "OAuth", role: "Connection broker", initials: "OA" },
];

export const fixtureActors: ReadonlyMap<string, Actor> = new Map(
  ACTOR_LIST.map((actor) => [actor.id, actor]),
);

/**
 * Raw domain Quests behind the Loom rows. The fixture HandoffPort operates on
 * these, so the local demo runs the same transition rules the server applies.
 */
const RAW_QUESTS: Quest[] = [];

export const fixtureRawQuests: readonly Quest[] = RAW_QUESTS;

/** Builds a complete domain Quest so the adapter runs against real field shapes. */
function fixtureQuest(overrides: Partial<Quest> & Pick<Quest, "id" | "title">): Quest {
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
    scheduledDate: "2026-08-25",
    scheduledTime: "",
    dueDate: "2026-08-27",
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
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-25T09:00:00.000Z",
    done: false,
    assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "working" },
    handoff: {
      note: "",
      blockedReason: "",
      artifactUrl: "",
      startedAt: "",
      reviewRequestedAt: "",
      reviewedAt: "",
      reviewedBy: "",
    },
    externalLinks: [],
  };
  const quest = { ...base, ...overrides };
  RAW_QUESTS.push(quest);
  return quest;
}

type FixtureLeg = readonly [
  string,
  RelaySpine["legs"][number]["connector"],
  string?,
  RelayNodeState?,
];

function spine(legs: readonly FixtureLeg[], currentIndex: number, hiddenBefore = 0): RelaySpine {
  return {
    legs: legs.map(([actorId, connector, note, nodeState]) => ({
      actorId,
      connector,
      ...(note === undefined ? {} : { connectorNote: note }),
      ...(nodeState === undefined ? {} : { nodeState }),
    })),
    currentIndex,
    hiddenBefore,
  };
}

/**
 * Nine Loom rows covering the section 28.1 fixture composition: Human to Agent,
 * Agent to Agent, Agent to Human review, working, waiting, three blocked rows
 * sharing one cause, and one completed endpoint.
 */
export const fixtureQuests: readonly LoomQuest[] = [
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-184",
      title: "Worker REST の handoff 契約を確定する",
      impact: "high",
      isBlockingOthers: true,
      scheduledTime: "09:20",
      dueDate: "2026-08-25",
      dependencyIds: ["q-186", "q-187"],
      assignee: { type: "agent", id: "a-warden", label: "Warden", handoffState: "review_required" },
      handoff: {
        note: "契約差分を3件検出",
        blockedReason: "",
        artifactUrl: "/artifacts/qf-184/contract-diff.json",
        startedAt: "2026-08-25T09:20:00.000Z",
        reviewRequestedAt: "2026-08-25T10:52:00.000Z",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["u-hironao", "completed"],
      ["a-warden", "review"],
      ["u-hironao", null],
    ], 1),
    dependencies: [
      { questId: "q-186", ref: "QF-186", critical: true, blocking: false },
      { questId: "q-187", ref: "QF-187", critical: false, blocking: false },
    ],
    stateLabel: "Warden requested review",
    actionLabel: "Review output",
    context: "契約差分 3件 / 出力 2 ファイル",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-186",
      title: "Loom の依存ルーティングを実装する",
      impact: "high",
      scheduledTime: "10:05",
      assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "working" },
      handoff: {
        note: "",
        blockedReason: "",
        artifactUrl: "",
        startedAt: "2026-08-25T10:05:00.000Z",
        reviewRequestedAt: "",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["a-scribe", "completed"],
      ["a-forge", "active"],
      ["u-hironao", null],
    ], 1),
    dependencies: [],
    stateLabel: "Forge Runner is executing",
    actionLabel: "Inspect",
    context: "経過 47m / 推定 60m",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-187",
      title: "Capacity Band の制約スロットを配線する",
      impact: "medium",
      scheduledTime: "10:40",
      assignee: { type: "agent", id: "a-scribe", label: "Scribe", handoffState: "working" },
      handoff: {
        note: "",
        blockedReason: "",
        artifactUrl: "",
        startedAt: "2026-08-25T10:40:00.000Z",
        reviewRequestedAt: "",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["u-hironao", "completed"],
      ["a-scribe", "active"],
      ["a-warden", null],
    ], 1),
    dependencies: [],
    stateLabel: "Scribe is executing",
    actionLabel: "Inspect",
    context: "経過 12m / 推定 30m",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-190",
      title: "Toggl 連携の再認証を通す",
      impact: "medium",
      scheduledTime: "11:00",
      assignee: { type: "agent", id: "a-scribe", label: "Scribe", handoffState: "working" },
      handoff: {
        note: "",
        blockedReason: "",
        artifactUrl: "",
        startedAt: "2026-08-25T11:00:00.000Z",
        reviewRequestedAt: "",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["a-scribe", "waiting", "Waiting for OAuth"],
      ["s-oauth", "pending"],
      ["u-mika", null],
    ], 0),
    dependencies: [],
    stateLabel: "Waiting for OAuth",
    actionLabel: "Open connection",
    context: "スコープ再同意が必要",
    overrideState: "waiting",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-191",
      title: "Chronicle のイベント整形を移す",
      impact: "medium",
      scheduledTime: "11:30",
      assignee: { type: "agent", id: "a-scribe", label: "Scribe", handoffState: "blocked" },
      dependencyIds: ["q-184"],
      handoff: {
        note: "",
        blockedReason: "QF-184 の契約が未確定",
        artifactUrl: "",
        startedAt: "2026-08-25T11:30:00.000Z",
        reviewRequestedAt: "",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["a-scribe", "blocked", "Blocked by QF-184"],
      ["u-hironao", null],
    ], 0),
    dependencies: [{ questId: "q-184", ref: "QF-184", critical: true, blocking: true }],
    stateLabel: "Blocked by QF-184",
    actionLabel: "Resolve",
    context: "契約確定まで実行不可",
    blockerGroupId: "blk-184",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-192",
      title: "Relay Spine の履歴表示を移す",
      impact: "medium",
      scheduledTime: "11:45",
      assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "blocked" },
      dependencyIds: ["q-184"],
      handoff: {
        note: "",
        blockedReason: "QF-184 の契約が未確定",
        artifactUrl: "",
        startedAt: "2026-08-25T11:45:00.000Z",
        reviewRequestedAt: "",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["a-forge", "blocked", "Blocked by QF-184"],
      ["u-hironao", null],
    ], 0),
    dependencies: [{ questId: "q-184", ref: "QF-184", critical: true, blocking: true }],
    stateLabel: "Blocked by QF-184",
    actionLabel: "Resolve",
    context: "契約確定まで実行不可",
    blockerGroupId: "blk-184",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-193",
      title: "Handoff evidence の保存先を決める",
      impact: "low",
      scheduledTime: "12:10",
      assignee: { type: "agent", id: "a-warden", label: "Warden", handoffState: "blocked" },
      dependencyIds: ["q-184"],
      handoff: {
        note: "",
        blockedReason: "QF-184 の契約が未確定",
        artifactUrl: "",
        startedAt: "2026-08-25T12:10:00.000Z",
        reviewRequestedAt: "",
        reviewedAt: "",
        reviewedBy: "",
      },
    }),
    relay: spine([
      ["a-warden", "blocked", "Blocked by QF-184"],
      ["u-hironao", null],
    ], 0),
    dependencies: [{ questId: "q-184", ref: "QF-184", critical: true, blocking: true }],
    stateLabel: "Blocked by QF-184",
    actionLabel: "Resolve",
    context: "契約確定まで実行不可",
    blockerGroupId: "blk-184",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-195",
      title: "夜間同期のリトライ設定を見直す",
      impact: "low",
      scheduledTime: "13:00",
      assignee: { type: "self", id: "s-sync", label: "Sync", handoffState: "ready" },
    }),
    relay: spine([
      ["s-sync", "automated"],
      ["u-mika", null],
    ], 0),
    dependencies: [],
    stateLabel: "Sync will retry at 02:00",
    actionLabel: "Open schedule",
    context: "自動実行 / 監視のみ",
  }),
  toLoomQuest({
    quest: fixtureQuest({
      id: "q-181",
      title: "Token 生成を CI ゲートへ載せる",
      impact: "high",
      scheduledTime: "08:30",
      lifecycleState: "completed",
      done: true,
      completedAt: "2026-08-25T09:05:00.000Z",
      assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "accepted" },
      handoff: {
        note: "承認済み",
        blockedReason: "",
        artifactUrl: "/artifacts/qf-181/ci-run.txt",
        startedAt: "2026-08-25T08:30:00.000Z",
        reviewRequestedAt: "2026-08-25T08:58:00.000Z",
        reviewedAt: "2026-08-25T09:05:00.000Z",
        reviewedBy: "u-hironao",
      },
    }),
    relay: spine([
      ["a-forge", "completed", undefined, "completed"],
      ["u-hironao", null, undefined, "completed"],
    ], 1, 1),
    dependencies: [],
    stateLabel: "Hironao accepted the output",
    actionLabel: "Open evidence",
    context: "CI 3 ジョブ緑 / 09:05 承認",
  }),
];

export const fixtureInterventions: readonly Intervention[] = [
  {
    id: "iv-1",
    questId: "q-184",
    severity: "review",
    reason: "Warden の契約差分を人が承認する必要があります",
    questRef: "QF-184",
    questTitle: "Worker REST の handoff 契約を確定する",
    waitingMinutes: 98,
    ownerActorId: "u-hironao",
    actionLabel: "Review output",
    affectedCount: 1,
  },
  {
    id: "iv-2",
    questId: "q-191",
    severity: "blocked",
    reason: "QF-184 の契約未確定で 3 件が停止しています",
    questRef: "QF-191",
    questTitle: "Chronicle のイベント整形を移す",
    waitingMinutes: 62,
    ownerActorId: "u-hironao",
    actionLabel: "Resolve blocker",
    affectedCount: 3,
  },
  {
    id: "iv-3",
    questId: "q-190",
    severity: "waiting",
    reason: "Toggl の OAuth スコープ再同意を待っています",
    questRef: "QF-190",
    questTitle: "Toggl 連携の再認証を通す",
    waitingMinutes: 34,
    ownerActorId: "u-mika",
    actionLabel: "Open connection",
    affectedCount: 1,
  },
];

/** Evidence shown in the Lens for the selected intervention. */
export const fixtureEvidence: Readonly<Record<string, readonly Evidence[]>> = {
  "iv-1": [
    { label: "Artifact", value: "contract-diff.json", operational: true },
    { label: "変更", value: "3 fields changed, 0 removed", operational: true },
    { label: "実行", value: "Warden / 92m elapsed", operational: true },
    { label: "影響", value: "QF-191, QF-192, QF-193 が待機中", operational: false },
    { label: "検証", value: "contract tests 12/12 passed", operational: true },
  ],
  "iv-2": [
    { label: "Blocker", value: "QF-184 contract undecided", operational: false },
    { label: "影響", value: "3 Quests / 62m stalled", operational: true },
    { label: "Owner", value: "Hironao", operational: false },
  ],
  "iv-3": [
    { label: "Connection", value: "Toggl Track", operational: false },
    { label: "Scope", value: "workspace:read time_entries:write", operational: true },
    { label: "最終同期", value: "2026-08-25 10:26", operational: true },
  ],
};

export const fixtureChronicle: readonly ChronicleEvent[] = [
  {
    id: "ev-9",
    timeLabel: "10:52",
    actorId: "a-warden",
    kind: "review_request",
    verb: "requested review of",
    object: "QF-184 Worker REST handoff contract",
    detail: "contract-diff.json / 3 fields changed",
  },
  {
    id: "ev-8",
    timeLabel: "10:41",
    actorId: "a-forge",
    kind: "blocked",
    verb: "stopped on",
    object: "QF-193 Handoff evidence storage",
    detail: "Blocked by QF-184",
  },
  {
    id: "ev-7",
    timeLabel: "10:05",
    actorId: "a-scribe",
    kind: "handoff",
    verb: "handed off",
    object: "QF-186 Loom dependency routing",
    detail: "Scribe → Forge Runner",
  },
  {
    id: "ev-6",
    timeLabel: "09:47",
    actorId: "s-sync",
    kind: "system_event",
    verb: "replicated",
    object: "12 Quest records",
    detail: "Appwrite / 240ms",
  },
  {
    id: "ev-5",
    timeLabel: "09:46",
    actorId: "s-sync",
    kind: "system_event",
    verb: "replicated",
    object: "4 handoff records",
    detail: "Appwrite / 118ms",
  },
  {
    id: "ev-4",
    timeLabel: "09:20",
    actorId: "a-warden",
    kind: "agent_execution",
    verb: "started",
    object: "QF-184 Worker REST handoff contract",
    detail: "contract check / dry-run off",
  },
  {
    id: "ev-3",
    timeLabel: "09:05",
    actorId: "u-hironao",
    kind: "review_result",
    verb: "accepted",
    object: "QF-181 Token generation CI gate",
    detail: "CI 3 jobs green",
  },
  {
    id: "ev-2",
    timeLabel: "08:58",
    actorId: "a-forge",
    kind: "review_request",
    verb: "requested review of",
    object: "QF-181 Token generation CI gate",
    detail: "ci-run.txt",
  },
  {
    id: "ev-1",
    timeLabel: "08:30",
    actorId: "u-hironao",
    kind: "human_action",
    verb: "delegated",
    object: "QF-181 Token generation CI gate",
    detail: "Hironao → Forge Runner",
  },
];

/** Section 6.3 slot C for Command is blocked count and oldest age; MP is absent. */
export const fixtureCapacity: readonly CapacitySlot[] = [
  { id: "attention", label: "Human attention", shortLabel: "Attention", value: "1 review · 1 waiting", tone: "review", filter: "review" },
  { id: "execution", label: "Execution", shortLabel: "Execution", value: "2 executing · 1 queued", tone: "agent", filter: null },
  { id: "constraint", label: "Blocked", shortLabel: "Blocked", value: "3 Quests · oldest 62m", tone: "danger", filter: "blocked" },
  { id: "health", label: "System", shortLabel: "System", value: "Synced · 10:52", tone: "success", filter: "health" },
];

export const fixtureCapacityStale: readonly CapacitySlot[] = [
  { id: "attention", label: "Human attention", shortLabel: "Attention", value: "1 review · 1 waiting", tone: "review", filter: "review" },
  { id: "execution", label: "Execution", shortLabel: "Execution", value: "2 executing · 1 queued", tone: "agent", filter: null },
  { id: "constraint", label: "Blocked", shortLabel: "Blocked", value: "3 Quests · oldest 62m", tone: "danger", filter: "blocked" },
  { id: "health", label: "System", shortLabel: "System", value: "Stale since 10:26 · writes locked", tone: "warning", filter: "health" },
];

/**
 * Centre workspace views. Only Quests that can currently be selected from the
 * Attention Shelf or the Loom need one; the Loom falls back to a read-only
 * summary for the rest.
 */
const SELECTED_VIEWS: readonly SelectedQuestView[] = [
  {
    questId: "q-184",
    ref: "QF-184",
    title: "Worker REST の handoff 契約を確定する",
    stateLabel: "Review",
    stateKind: "review",
    reason: "Warden の契約差分を人が承認する必要があります",
    responsibility: [
      { actorId: "u-hironao", roleLabel: "Human", stateLabel: "handed off", timeLabel: "10:05", state: "completed" },
      { actorId: "a-forge", roleLabel: "Agent", stateLabel: "executing", timeLabel: "10:05–10:41", state: "executing" },
      { actorId: "a-warden", roleLabel: "Human Review", stateLabel: "review required", timeLabel: "since 10:41", state: "review" },
    ],
    details: {
      headline: "契約差分 3 件 / 出力 2 ファイル",
      points: [
        "fields: 追加 3 / 変更 0 / 削除 0",
        "権限: 変更なし",
        "互換性: 後方互換あり",
      ],
      outputs: [
        { id: "o-1", name: "contract-diff.json", summary: "変更 3 / fields changed", timeLabel: "92m ago", primary: false, verified: null, verifiedLabel: "" },
        { id: "o-2", name: "contract-tests.md", summary: "12/12 passed", timeLabel: "92m ago", primary: false, verified: null, verifiedLabel: "" },
      ],
    },
    evidenceHeadline: "契約テスト (2026-08-25 10:05)",
    evidencePoints: [
      "Artifact: contract-tests.md",
      "Tests: 12/12 passed",
      "Validation: contract tests 12/12 passed",
      "Environment: relay-forge-prod",
    ],
    evidence: [
      {
        id: "e-1",
        name: "contract-diff.json",
        summary: "3 fields changed",
        timeLabel: "10:41",
        primary: true,
        verified: true,
        verifiedLabel: "Verified",
        preview: {
          verdict: "pass",
          verdictLabel: "contract tests 12/12 passed",
          unavailableReason: "",
          changed: [
            { kind: "added", path: "handoff.expectedUpdatedAt", detail: "string | null" },
            { kind: "added", path: "handoff.dryRun", detail: "boolean, default false" },
            { kind: "added", path: "handoff.reviewedBy", detail: "string" },
          ],
          checks: [
            { label: "Contract tests", result: "12 / 12 passed", passed: true },
            { label: "Schema validation", result: "0 warnings", passed: true },
            { label: "Permission diff", result: "変更なし", passed: true },
          ],
          affected: ["QF-191", "QF-192", "QF-193"],
          compatibility: "後方互換あり / 既存クライアントの再デプロイ不要",
        },
      },
      { id: "e-2", name: "contract-tests.md", summary: "12/12 passed", timeLabel: "92m ago", primary: false, verified: null, verifiedLabel: "" },
      { id: "e-3", name: "contract-validation.log", summary: "0 warnings", timeLabel: "10:41", primary: false, verified: null, verifiedLabel: "" },
    ],
    decision: {
      statusLabel: "Human decision required",
      approveLabel: "Approve handoff",
      reviseLabel: "Request revision",
      impactLabel: "Decision will notify all related parties",
      blockedReason: null,
    },
  },
  {
    questId: "q-191",
    ref: "QF-191",
    title: "Chronicle のイベント整形を移す",
    stateLabel: "Blocked",
    stateKind: "blocked",
    reason: "QF-184 の契約が確定するまで実行できません",
    responsibility: [
      { actorId: "u-hironao", roleLabel: "Human", stateLabel: "handed off", timeLabel: "11:30", state: "completed" },
      { actorId: "a-scribe", roleLabel: "Agent", stateLabel: "blocked by QF-184", timeLabel: "since 11:32", state: "blocked" },
      { actorId: "u-hironao", roleLabel: "Human", stateLabel: "resolve blocker", timeLabel: "pending", state: "pending" },
    ],
    details: {
      headline: "上流 1 件 / 同一原因 3 件",
      points: [
        "blocker: QF-184 contract undecided",
        "同一原因: QF-191, QF-192, QF-193",
        "経過: 62m",
      ],
      outputs: [],
    },
    evidenceHeadline: "停止時の実行記録",
    evidencePoints: [
      "Halt: scribe-run.log",
      "Stage: before write",
      "Blocker: QF-184 contract undecided",
    ],
    evidence: [
      {
        id: "e-b1",
        name: "scribe-run.log",
        summary: "halted before write",
        timeLabel: "11:32",
        primary: true,
        verified: null,
        verifiedLabel: "",
        preview: {
          verdict: "unavailable",
          verdictLabel: "検証結果なし",
          unavailableReason: "上流 QF-184 が未確定のため、実行は書き込み前に停止しました。検証は行われていません。",
          changed: [],
          checks: [{ label: "Contract tests", result: "未実行", passed: null }],
          affected: ["QF-191", "QF-192", "QF-193"],
          compatibility: "判定不可",
        },
      },
    ],
    decision: {
      statusLabel: "Blocked upstream",
      approveLabel: "Approve handoff",
      reviseLabel: "Resolve blocker",
      impactLabel: "QF-184 を確定すると 3 件が再開します",
      blockedReason: "上流 QF-184 が未確定のため承認できません",
    },
  },
  {
    questId: "q-190",
    ref: "QF-190",
    title: "Toggl 連携の再認証を通す",
    stateLabel: "Waiting",
    stateKind: "waiting",
    reason: "Toggl の OAuth スコープ再同意を待っています",
    responsibility: [
      { actorId: "a-scribe", roleLabel: "Agent", stateLabel: "waiting for OAuth", timeLabel: "since 11:00", state: "executing" },
      { actorId: "s-oauth", roleLabel: "System", stateLabel: "consent pending", timeLabel: "34m", state: "pending" },
      { actorId: "u-mika", roleLabel: "Human", stateLabel: "grant scope", timeLabel: "pending", state: "pending" },
    ],
    details: {
      headline: "スコープ 2 件 / 再同意が必要",
      points: [
        "scope: workspace:read, time_entries:write",
        "権限: 追加同意が必要",
        "最終同期: 2026-08-25 10:26",
      ],
      outputs: [],
    },
    evidenceHeadline: "接続状態",
    evidencePoints: [
      "Connection: Toggl Track",
      "Scope: workspace:read, time_entries:write",
      "Status: consent required",
    ],
    evidence: [
      {
        id: "e-w1",
        name: "toggl-connection.json",
        summary: "consent required",
        timeLabel: "10:26",
        primary: true,
        verified: false,
        verifiedLabel: "Unavailable",
        preview: {
          verdict: "unavailable",
          verdictLabel: "接続を検証できません",
          unavailableReason: "OAuth スコープの再同意が完了していないため、接続を検証できません。",
          changed: [],
          checks: [
            { label: "Scope check", result: "workspace:read 不足", passed: false },
            { label: "Token", result: "有効", passed: true },
          ],
          affected: ["QF-190"],
          compatibility: "判定不可",
        },
      },
    ],
    decision: {
      statusLabel: "Waiting on external consent",
      approveLabel: "Approve handoff",
      reviseLabel: "Open connection",
      impactLabel: "同意が完了すると Scribe が実行を再開します",
      blockedReason: "OAuth 同意が完了するまで承認できません",
    },
  },
];

export const fixtureSelectedViews: ReadonlyMap<string, SelectedQuestView> = new Map(
  SELECTED_VIEWS.map((view) => [view.questId, view]),
);

/** Supporting outputs shown under DETAILS when a Quest has no artifacts. */
export const FIXTURE_NO_OUTPUTS: readonly EvidenceArtifact[] = [];

export function createFixtureCommandModel(): CommandModel {
  return {
    actors: fixtureActors,
    quests: fixtureQuests,
    interventions: fixtureInterventions,
    chronicle: fixtureChronicle,
    capacity: fixtureCapacity,
    syncState: "synced",
    lastSyncLabel: "10:52",
    selectedViews: fixtureSelectedViews,
  };
}
