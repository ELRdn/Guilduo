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
  [key: string]: unknown;
}

export interface CharacterState {
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
  [key: string]: unknown;
}

export interface QuestForgeState {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  tasks: Quest[];
  character: CharacterState;
  battle: BattleState;
  [key: string]: unknown;
}

export function isQuestKind(value: unknown): value is QuestKind {
  return value === "habit" || value === "daily" || value === "todo" || value === "reward";
}

export function isQuest(value: unknown): value is Quest {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string");
}
