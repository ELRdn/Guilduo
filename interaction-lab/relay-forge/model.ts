/**
 * Relay Forge view model.
 *
 * NEWDESIGN.md section 13 (Actor grammar), 15 (Handoff system) and 14.3 (Quest
 * primitives) describe what the UI must render. This module is the adapter layer
 * between those visual requirements and the existing domain types in
 * `types/questforge.ts`. It deliberately introduces no new domain semantics:
 * every state below is derived from `Quest.assignee.handoffState` and
 * `Quest.lifecycleState` as they already exist.
 */

import type {
  AssigneeType,
  HandoffState,
  Impact,
  LifecycleState,
  Quest,
} from "../../types/questforge.ts";

export type ActorKind = "human" | "agent" | "system" | "companion";

export interface Actor {
  readonly id: string;
  readonly kind: ActorKind;
  /** Display name. For System actors this is the automation name, not a person. */
  readonly name: string;
  /** Role or capability line shown under the name in Lens and Party contexts. */
  readonly role: string;
  /** Two-character fallback used when portrait art is absent (section 14.4). */
  readonly initials: string;
  /**
   * Identity image resolution inputs. These mirror the existing domain contract
   * and are never invented here:
 *   avatarUrl / avatarRole / avatarVariant  authenticated profile display fields
   *   provider                                AgentRecord.provider
   */
  readonly avatarUrl?: string;
  readonly avatarRole?: string;
  readonly avatarVariant?: "femme" | "masc";
  readonly provider?: string;
}

/**
 * Relay connector state. Section 13.2 requires each of these to be legible
 * without colour, so every value maps to a distinct line treatment.
 */
export type ConnectorState =
  | "completed"
  | "active"
  | "waiting"
  | "review"
  | "blocked"
  | "pending"
  | "automated";

/** Node treatments defined by section 13.2. */
export type RelayNodeState = "idle" | "current" | "completed" | "blocked" | "review";

/** One leg of a Relay Spine: an Actor node plus the connector leaving it. */
export interface RelayLeg {
  readonly actorId: string;
  /** Connector leaving this node toward the next leg. `null` on the final leg. */
  readonly connector: ConnectorState | null;
  /** Plain-language reason attached to a waiting or blocked connector. */
  readonly connectorNote?: string;
  /**
   * Explicit node treatment. Normally derived from the leg's position relative
   * to `currentIndex`; a completed Quest sets it so the terminal Human node
   * shows the filled success endpoint required by section 13.2.
   */
  readonly nodeState?: RelayNodeState;
}

export interface RelaySpine {
  readonly legs: readonly RelayLeg[];
  /** Index into `legs` of the Actor that currently holds the work. */
  readonly currentIndex: number;
  /** Legs elided before the first visible one; rendered as +N (section 15.4). */
  readonly hiddenBefore: number;
}

/**
 * Visual Quest state. Section 7.2 maps each of these to a colour plus a required
 * non-colour signal. `review_required` is never merged into `completed`
 * (section 15.2).
 */
export type QuestVisualState =
  | "planned"
  | "ready"
  | "working"
  | "review_required"
  | "waiting"
  | "blocked"
  | "completed"
  | "archived";

export interface QuestDependency {
  readonly questId: string;
  readonly ref: string;
  /** Critical path edges own the track nearest the title (section 14.3). */
  readonly critical: boolean;
  readonly blocking: boolean;
}

export interface LoomQuest {
  readonly id: string;
  /** Short operational identifier, for example QF-184. */
  readonly ref: string;
  readonly title: string;
  /** Single 13px context line under the title. */
  readonly context: string;
  readonly startLabel: string;
  readonly dueLabel: string;
  readonly state: QuestVisualState;
  /** Verb-first status text, for example "Astra is executing" (section 13.2). */
  readonly stateLabel: string;
  /** Quiet trailing action label, for example "Review output". */
  readonly actionLabel: string;
  readonly relay: RelaySpine;
  readonly dependencies: readonly QuestDependency[];
  readonly priority: "P0" | "P1" | "P2" | "P3";
  /**
   * Rows sharing a blocker id and sitting consecutively gain one shared blocker
   * rail (section 14.3, "Loom intervention and congestion").
   */
  readonly blockerGroupId: string | null;
  /** True when this row exposes an outbound intervention notch toward Lens. */
  readonly needsIntervention: boolean;
}

export type InterventionSeverity = "review" | "blocked" | "waiting";

export interface Intervention {
  readonly id: string;
  readonly questId: string;
  readonly severity: InterventionSeverity;
  /** Why intervention is needed. First line of the Lens (section 22.2). */
  readonly reason: string;
  readonly questRef: string;
  readonly questTitle: string;
  /** How long the work has been waiting on a human, in minutes. */
  readonly waitingMinutes: number;
  readonly ownerActorId: string;
  readonly actionLabel: string;
  /** Number of Quests sharing this remediation, for grouped blockers. */
  readonly affectedCount: number;
}

export interface Evidence {
  readonly label: string;
  readonly value: string;
  /** Rendered in the mono operational role when true (IDs, durations, counts). */
  readonly operational: boolean;
}

/**
 * Evidence Summary rows for the Selected Quest workspace (v2 section 6.4).
 * Exactly one row carries `primary`; the rest are Supporting Evidence and sit a
 * hierarchy level lower. Verification state is only set from a real result.
 */
export interface EvidenceArtifact {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly timeLabel: string;
  readonly primary: boolean;
  /** `null` when no verification result exists; never faked as passing. */
  readonly verified: boolean | null;
  readonly verifiedLabel: string;
  /** Decision-grade preview opened by `Review output` (brief A5). */
  readonly preview?: EvidencePreview;
}

/**
 * What a reviewer needs to see before deciding: the change, the checks and the
 * blast radius. Never a raw log or full JSON — those open from here on demand.
 */
export interface EvidencePreview {
  /** `pass` / `fail` / `unavailable`; `unavailable` never renders as success. */
  readonly verdict: "pass" | "fail" | "unavailable";
  readonly verdictLabel: string;
  /** Reason shown when the verdict is `unavailable`. */
  readonly unavailableReason: string;
  readonly changed: readonly EvidenceChange[];
  readonly checks: readonly EvidenceCheck[];
  /** Quest refs the decision propagates to. */
  readonly affected: readonly string[];
  readonly compatibility: string;
}

export interface EvidenceChange {
  readonly kind: "added" | "changed" | "removed";
  readonly path: string;
  readonly detail: string;
}

export interface EvidenceCheck {
  readonly label: string;
  readonly result: string;
  readonly passed: boolean | null;
}

/** Details block: the decision-relevant diff, not raw logs (v2 section 6.3). */
export interface QuestDetails {
  readonly headline: string;
  readonly points: readonly string[];
  readonly outputs: readonly EvidenceArtifact[];
}

/** One Actor step of the Responsibility Relay (v2 section 6.2). */
export interface ResponsibilityStep {
  readonly actorId: string;
  /** Role within this relay, e.g. "Human Review" — not the actor's job title. */
  readonly roleLabel: string;
  /** Verb-first state, e.g. "handed off", "executing", "review required". */
  readonly stateLabel: string;
  readonly timeLabel: string;
  readonly state: "completed" | "executing" | "review" | "blocked" | "pending";
}

/**
 * Decision gate for the Lens Decision Bar (v2 section 7.4). `blockedReason` is
 * non-null whenever approval must stay disabled, and its text is shown.
 */
export interface DecisionState {
  readonly statusLabel: string;
  readonly approveLabel: string;
  readonly reviseLabel: string;
  readonly impactLabel: string;
  readonly blockedReason: string | null;
}

/** Everything the centre workspace renders for the selected Quest. */
export interface SelectedQuestView {
  readonly requester?: Quest["requester"];
  readonly externalReview?: { readonly url: string; readonly note: string; readonly criteria: string };
  readonly questId: string;
  readonly ref: string;
  readonly title: string;
  readonly stateLabel: string;
  readonly stateKind: InterventionSeverity;
  readonly reason: string;
  readonly responsibility: readonly ResponsibilityStep[];
  readonly details: QuestDetails;
  readonly evidence: readonly EvidenceArtifact[];
  readonly evidenceHeadline: string;
  /** Decision-relevant summary lines shown above the artifact list. */
  readonly evidencePoints: readonly string[];
  readonly decision: DecisionState;
}

export type ChronicleKind =
  | "human_action"
  | "agent_execution"
  | "system_event"
  | "handoff"
  | "blocked"
  | "review_request"
  | "review_result";

export interface ChronicleEvent {
  readonly id: string;
  readonly timeLabel: string;
  readonly actorId: string;
  readonly kind: ChronicleKind;
  /** Verb phrase: what the actor did. */
  readonly verb: string;
  /** The object acted upon, usually a Quest ref plus title. */
  readonly object: string;
  readonly detail: string;
}

/** Section 6.3: four stable slots, never a KPI strip. */
export interface CapacitySlot {
  readonly id: "attention" | "execution" | "constraint" | "health";
  readonly label: string;
  /** Shorter label used below 1600px so the value never truncates. */
  readonly shortLabel: string;
  readonly value: string;
  readonly tone: "neutral" | "review" | "agent" | "danger" | "success" | "warning";
  /** Where selecting the slot navigates, expressed as an intervention filter. */
  readonly filter: InterventionSeverity | "health" | null;
}

export type SyncState = "synced" | "syncing" | "stale" | "error";

export interface CommandModel {
  readonly actors: ReadonlyMap<string, Actor>;
  readonly quests: readonly LoomQuest[];
  readonly interventions: readonly Intervention[];
  readonly chronicle: readonly ChronicleEvent[];
  readonly capacity: readonly CapacitySlot[];
  readonly syncState: SyncState;
  readonly lastSyncLabel: string;
  /** Centre workspace view per Quest id. */
  readonly selectedViews: ReadonlyMap<string, SelectedQuestView>;
}

/* ------------------------------------------------------------------ *
 * Domain adapters
 * ------------------------------------------------------------------ */

/**
 * Maps the existing HandoffState plus lifecycle to the visual state defined by
 * section 15.2. Quest lifecycle and Handoff state stay distinct: an accepted
 * handoff on an active Quest is `ready`, not `completed`.
 */
export function toVisualState(
  handoffState: HandoffState,
  lifecycleState: LifecycleState,
): QuestVisualState {
  if (lifecycleState === "archived") return "archived";
  if (lifecycleState === "completed") return "completed";
  switch (handoffState) {
    case "working":
      return "working";
    case "review_required":
      return "review_required";
    case "blocked":
      return "blocked";
    case "ready":
    case "accepted":
      return "ready";
    case "none":
      return "planned";
  }
}

/** Section 7.2 requires a non-colour signal for every state. */
export function stateSignal(state: QuestVisualState): string {
  switch (state) {
    case "planned":
      return "hollow";
    case "ready":
      return "notch";
    case "working":
      return "filled";
    case "review_required":
      return "converge";
    case "waiting":
      return "pause";
    case "blocked":
      return "break";
    case "completed":
      return "check";
    case "archived":
      return "archive";
  }
}

export function actorKindFromAssignee(type: AssigneeType): ActorKind {
  return type === "agent" ? "agent" : "human";
}

/** Section 13.1 label text. Uppercase Latin only, never applied to Japanese. */
export function actorTypeLabel(kind: ActorKind): string {
  switch (kind) {
    case "human":
      return "HUMAN";
    case "agent":
      return "AGENT";
    case "system":
      return "SYSTEM";
    case "companion":
      return "COMPANION";
  }
}

export function priorityFromImpact(impact: Impact, blocking: boolean): LoomQuest["priority"] {
  if (blocking && impact === "high") return "P0";
  if (impact === "high") return "P1";
  if (impact === "medium") return "P2";
  return "P3";
}

/**
 * Derives the Loom row for a domain Quest. The caller supplies the Relay Spine
 * and dependency refs because those come from handoff history and the dependency
 * graph, which live outside a single Quest record.
 */
export interface LoomQuestInput {
  readonly quest: Quest;
  readonly relay: RelaySpine;
  readonly dependencies: readonly QuestDependency[];
  readonly stateLabel: string;
  readonly actionLabel: string;
  readonly context: string;
  readonly blockerGroupId?: string | null;
  /**
   * `waiting` has no distinct HandoffState in the domain model; it is a working
   * handoff whose connector is paused on an external condition. The caller sets
   * it explicitly so the adapter never guesses.
   */
  readonly overrideState?: QuestVisualState;
}

export function toLoomQuest(input: LoomQuestInput): LoomQuest {
  const { quest } = input;
  const state = input.overrideState
    ?? (quest.done ? "completed" : toVisualState(quest.assignee.handoffState, quest.lifecycleState));
  return {
    id: quest.id,
    ref: questRef(quest.id),
    title: quest.title,
    context: input.context,
    startLabel: formatDayTime(quest.scheduledDate, quest.scheduledTime),
    dueLabel: formatDay(quest.dueDate),
    state,
    stateLabel: input.stateLabel,
    actionLabel: input.actionLabel,
    relay: input.relay,
    dependencies: input.dependencies,
    priority: priorityFromImpact(quest.impact, quest.isBlockingOthers),
    blockerGroupId: input.blockerGroupId ?? null,
    needsIntervention: state === "review_required" || state === "blocked" || state === "waiting",
  };
}

export function questRef(id: string): string {
  const digits = id.replace(/\D/g, "");
  return digits.length > 0 ? `QF-${digits}` : `QF-${id.slice(0, 3).toUpperCase()}`;
}

function formatDay(iso: string): string {
  if (iso === "") return "—";
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : iso;
}

function formatDayTime(iso: string, time: string): string {
  const day = formatDay(iso);
  return time === "" ? day : `${day} ${time}`;
}

/** Section 14.5: waiting duration is an operational duration, not a date. */
export function formatWaiting(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/* ------------------------------------------------------------------ *
 * Derived workspace view
 * ------------------------------------------------------------------ */

const STATE_SUMMARY: Readonly<Record<QuestVisualState, string>> = {
  planned: "まだ着手していません",
  ready: "着手できる状態です",
  working: "Agent が実行中です",
  review_required: "人間の承認を待っています",
  waiting: "外部の応答を待っています",
  blocked: "上流の Quest によって停止しています",
  completed: "完了しています",
  archived: "アーカイブ済みです",
};

const STATE_ROLE: Readonly<Record<ConnectorState | "終端", string>> = {
  completed: "handed off",
  active: "executing",
  waiting: "waiting",
  review: "review required",
  blocked: "blocked",
  pending: "next",
  automated: "automated",
  終端: "holds the work",
};

function stepStateFor(connector: ConnectorState | null, isCurrent: boolean): ResponsibilityStep["state"] {
  if (connector === "blocked") return "blocked";
  if (connector === "review") return "review";
  if (connector === "active") return "executing";
  if (connector === "completed") return "completed";
  return isCurrent ? "executing" : "pending";
}

/**
 * Builds a workspace view for a Quest that has no curated intervention view.
 *
 * Everything here is derived from the Quest that is already on screen — its
 * relay, state and dependencies. Nothing is invented: a Quest with no pending
 * human decision says so, and its approval control stays disabled rather than
 * offering an action the domain does not have.
 */
export function deriveSelectedQuestView(quest: LoomQuest): SelectedQuestView {
  const responsibility: ResponsibilityStep[] = quest.relay.legs.map((leg, index) => ({
    actorId: leg.actorId,
    roleLabel: "Actor",
    stateLabel: leg.connectorNote
      ?? (leg.connector === null ? STATE_ROLE.終端 : STATE_ROLE[leg.connector]),
    timeLabel: index === quest.relay.currentIndex ? quest.startLabel : "—",
    state: stepStateFor(leg.connector, index === quest.relay.currentIndex),
  }));

  const dependencyPoints = quest.dependencies.length === 0
    ? ["依存している Quest はありません"]
    : quest.dependencies.map((dependency) =>
      `${dependency.ref}${dependency.blocking ? " (停止中)" : ""}${dependency.critical ? " · critical path" : ""}`);

  const pending = quest.state === "review_required" || quest.state === "blocked" || quest.state === "waiting";

  return {
    questId: quest.id,
    ref: quest.ref,
    title: quest.title,
    stateLabel: quest.state === "completed" ? "Completed" : quest.stateLabel,
    stateKind: quest.state === "blocked" ? "blocked" : quest.state === "waiting" ? "waiting" : "review",
    reason: STATE_SUMMARY[quest.state],
    responsibility,
    details: {
      headline: quest.context,
      points: [`予定 ${quest.startLabel} · 期限 ${quest.dueLabel}`, `優先度 ${quest.priority}`, ...dependencyPoints],
      outputs: [],
    },
    evidenceHeadline: "この Quest の Evidence",
    evidencePoints: ["提出された成果物はまだありません"],
    evidence: [],
    decision: {
      statusLabel: pending ? "Human decision required" : "判断待ちではありません",
      approveLabel: "Approve handoff",
      reviseLabel: "Request revision",
      impactLabel: pending
        ? "この Quest は人間の判断を待っています"
        : "この Quest は現在人間の判断を必要としていません",
      blockedReason: pending ? null : "承認できる Handoff がありません",
    },
  };
}
