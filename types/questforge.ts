export type QuestKind = "habit" | "daily" | "todo" | "reward";
export type QuestDifficulty = "trivial" | "easy" | "medium" | "hard";
export type QuestRepeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export type PlanningState = "scheduled" | "backlog";
export type LifecycleState = "active" | "completed" | "archived";
export type PlanningMode = "on_date" | "until_due";
export type Impact = "low" | "medium" | "high";
export type AssigneeType = "self" | "human" | "agent";
export type HandoffState = "none" | "ready" | "working" | "blocked" | "review_required" | "accepted";

export interface HandoffDetails {
  note: string;
  blockedReason: string;
  artifactUrl: string;
  startedAt: string;
  reviewRequestedAt: string;
  reviewedAt: string;
  reviewedBy: string;
}

export interface QuestAssignee {
  type: AssigneeType;
  id: string;
  label: string;
  handoffState: HandoffState;
}

export interface ExternalLink {
  service: string;
  externalId: string;
  type: string;
  sourceType: string;
  url: string;
  projectId: string;
  organizationId: string;
  workspaceId: string;
  taskId: string;
  entryStartAt: string;
  entryStopAt: string;
  durationMinutes: number;
  direction: string;
  syncedAt: string;
  remoteUpdatedAt: string;
  localUpdatedAt: string;
  remoteEtag: string;
  syncStatus: "synced" | "conflict" | "remote_missing" | "unverified";
}

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  notes: string;
  category: string;
  tags: string[];
  difficulty: QuestDifficulty;
  repeat: QuestRepeat;
  planningState: PlanningState;
  lifecycleState: LifecycleState;
  planningMode: PlanningMode;
  scheduledDate: string;
  scheduledTime: string;
  dueDate: string;
  estimatedMinutes: number;
  actualMinutes: number;
  manualActualMinutes: number;
  togglActualMinutes: number;
  completionCriteria: string;
  nextAction: string;
  impact: Impact;
  isBlockingOthers: boolean;
  rolloverCount: number;
  dependencyIds: string[];
  parentQuestId: string;
  completedAt: string;
  archivedAt: string;
  createdAt: string;
  updatedAt: string;
  done: boolean;
  negativeOnly?: boolean;
  assignee: QuestAssignee;
  handoff: HandoffDetails;
  externalLinks: ExternalLink[];
  streak?: number;
  value?: number;
  cost?: number;
  lastCompletedDate?: string;
  lastRolledOverDate?: string;
  lastPurchasedAt?: string;
  assignmentReadyFor?: string;
  [key: string]: unknown;
}

export interface CharacterState {
  id?: string;
  name: string;
  className: string;
  role: string;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
  nextXp: number;
  gems: number;
  streak: number;
  variant: string;
  personality: string;
  [key: string]: unknown;
}

export interface BattleState {
  turn: number;
  mp: number;
  maxMp: number;
  focus: number;
  guard: number;
  shield: number;
  rage: number;
  vulnerable: number;
  poison: number;
  ended: boolean;
  log: Array<Record<string, unknown>>;
  commandClaims?: Record<string, Record<string, unknown>>;
  commandClaimOrder?: string[];
  [key: string]: unknown;
}

export interface BossState {
  currentId?: string;
  hp: number;
  maxHp: number;
  defeatedIds: string[];
  defeatCount: number;
  battleLog: Array<Record<string, unknown>>;
  lastReward?: string;
  [key: string]: unknown;
}

export interface QuestForgeState {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  tasks: Quest[];
  character: CharacterState;
  battle: BattleState;
  boss: BossState;
  rewardClaims: Record<string, string>;
  taskEvents: Array<Record<string, unknown>>;
  migrationSnapshots: MigrationSnapshots;
  syncEvents?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type BattleCommandId = "attack" | "skill" | "guard" | "heal" | "burst";
export type BattleRoleId = "sentinel" | "archivist" | "operator" | "alchemist" | "ranger" | "artificer";

export interface BattleSkill {
  id: string;
  name: string;
  cost: number;
}

export interface BattleBossProfile {
  id: string;
  name: string;
  label: string;
  maxHp: number;
  rewardGems: number;
  rewardXp: number;
  weakKind: QuestKind;
}

export interface BattleEffect {
  type: string;
  amount?: number;
  source: string;
  [key: string]: unknown;
}

export interface BattleCommandInput {
  command?: string;
  commandId?: string;
  dryRun?: boolean;
  expectedTurn?: number;
}

export interface BattleSession {
  schemaVersion: 1;
  character: Record<string, unknown>;
  boss: Record<string, unknown>;
  battle: Record<string, unknown>;
  quests: Array<Record<string, unknown>>;
  commands: Array<Record<string, unknown>>;
}

export interface MigrationSnapshots {
  schema3To4?: Record<string, unknown>;
  schema4To5?: Record<string, unknown>;
  schema5To6?: Record<string, unknown>;
  schema6To7?: Record<string, unknown>;
  [key: string]: unknown;
}

export function isQuestKind(value: unknown): value is QuestKind {
  return value === "habit" || value === "daily" || value === "todo" || value === "reward";
}

export function isQuest(value: unknown): value is Quest {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string");
}
