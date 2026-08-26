/**
 * Production adapter — normalises the existing domain into the Command
 * ViewModel and connects the two decisions to the existing Handoff Command.
 *
 * Nothing here owns domain state. It reads what the repository already returns
 * and returns action callbacks that call the existing endpoint:
 *
 *   POST /v1/quests/{questId}/handoff
 *   { state, expectedState, note?, dryRun }
 *
 * The concurrency guard on this endpoint is `expectedState`, not
 * `expectedUpdatedAt` — that field belongs to `assign_quest_to_agent`. The
 * domain answers a mismatch with 409 `stale_handoff_state`, so that is the
 * conflict signal this adapter reads.
 *
 * Allowed transitions come from `server/questforge-domain.ts` and are mirrored
 * here only to keep a disabled control honest before a request is sent; the
 * server remains the authority and its rejection always wins.
 */

import type { HandoffState, Quest } from "../../types/questforge.ts";
import {
  type Actor,
  type ActorKind,
  actorTypeLabel,
  type CommandModel,
  deriveSelectedQuestView,
  type Intervention,
  type LoomQuest,
  type RelaySpine,
  toLoomQuest,
} from "./model.ts";

/* ------------------------------------------------------------------ *
 * Identity normalisation
 * ------------------------------------------------------------------ */

/** The subset of `/v1/profile` this screen reads. */
export interface ProfileRecord {
  readonly uid?: string;
  readonly displayName?: string;
  readonly handle?: string;
  readonly avatarUrl?: string;
  readonly avatarRole?: string;
  readonly avatarVariant?: string;
}

/** The subset of `/v1/agents` this screen reads. */
export interface AgentRecordView {
  readonly agentId?: string;
  readonly displayName?: string;
  readonly provider?: string;
  readonly role?: string;
  readonly status?: string;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * `avatarUrl` is a data URL owned by the signed-in profile. It is only ever
 * attached to that profile's own actor, so one viewer can never end up showing
 * another account's cached portrait.
 */
function humanActorFromProfile(profile: ProfileRecord): Actor {
  const name = String(profile.displayName ?? profile.handle ?? "You").trim() || "You";
  const variant = profile.avatarVariant === "masc" ? "masc" : "femme";
  return {
    id: `u-${String(profile.uid ?? profile.handle ?? "self")}`,
    kind: "human",
    name,
    role: profile.handle === undefined || profile.handle === "" ? "Operator" : `@${profile.handle}`,
    initials: initialsFor(name),
    ...(profile.avatarUrl !== undefined && profile.avatarUrl !== "" ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.avatarRole !== undefined && profile.avatarRole !== "" ? { avatarRole: profile.avatarRole } : {}),
    avatarVariant: variant,
  };
}

function agentActorFromRecord(record: AgentRecordView): Actor {
  const name = String(record.displayName ?? record.agentId ?? "Agent").trim() || "Agent";
  return {
    id: String(record.agentId ?? name),
    kind: "agent",
    name,
    role: String(record.role ?? record.provider ?? "Agent"),
    initials: initialsFor(name),
    ...(record.provider === undefined || record.provider === "" ? {} : { provider: record.provider }),
  };
}

/**
 * Builds the single identity map every Command surface reads. There is exactly
 * one entry per actor id, so Shelf, Loom, Relay, Lens and Chronicle can never
 * resolve the same actor differently.
 */
export function resolveActors(
  profile: ProfileRecord | null,
  agents: readonly AgentRecordView[],
  extra: readonly Actor[] = [],
): ReadonlyMap<string, Actor> {
  const actors = new Map<string, Actor>();
  if (profile !== null) {
    const human = humanActorFromProfile(profile);
    actors.set(human.id, human);
  }
  for (const record of agents) {
    const actor = agentActorFromRecord(record);
    if (!actors.has(actor.id)) actors.set(actor.id, actor);
  }
  for (const actor of extra) {
    if (!actors.has(actor.id)) actors.set(actor.id, actor);
  }
  return actors;
}

/**
 * Fallback identity for an actor referenced by a Quest that is not in the
 * profile or the Agent registry — a System automation, or an agent that has
 * since been archived. It never fabricates a portrait.
 */
export function placeholderActor(id: string, kind: ActorKind = "system"): Actor {
  const name = id.replace(/^[us]-/, "").replace(/[-_]/g, " ") || actorTypeLabel(kind);
  return { id, kind, name, role: actorTypeLabel(kind), initials: initialsFor(name) };
}

/* ------------------------------------------------------------------ *
 * Quest normalisation
 * ------------------------------------------------------------------ */

/** Verb-first state text derived from the Quest's own handoff state. */
function stateLabelFor(quest: Quest, holder: Actor | undefined): string {
  const holderName = holder?.name ?? quest.assignee.label ?? "Actor";
  switch (quest.assignee.handoffState) {
    case "working":
      return `${holderName} is executing`;
    case "review_required":
      return `${holderName} requested review`;
    case "blocked":
      return quest.handoff.blockedReason === "" ? "Blocked" : `Blocked: ${quest.handoff.blockedReason}`;
    case "ready":
      return "Ready to delegate";
    case "accepted":
      return `${holderName} accepted the output`;
    default:
      return quest.lifecycleState === "completed" ? "Completed" : "Not started";
  }
}

/** Relay derived from the Quest's own assignee and handoff record. */
function spineFor(quest: Quest, selfActorId: string): RelaySpine {
  const agentId = quest.assignee.type === "agent" ? quest.assignee.id : selfActorId;
  switch (quest.assignee.handoffState) {
    case "review_required":
      return {
        legs: [
          { actorId: selfActorId, connector: "completed" },
          { actorId: agentId, connector: "review" },
          { actorId: selfActorId, connector: null },
        ],
        currentIndex: 1,
        hiddenBefore: 0,
      };
    case "working":
      return {
        legs: [
          { actorId: selfActorId, connector: "completed" },
          { actorId: agentId, connector: "active" },
          { actorId: selfActorId, connector: null },
        ],
        currentIndex: 1,
        hiddenBefore: 0,
      };
    case "blocked":
      return {
        legs: [
          {
            actorId: agentId,
            connector: "blocked",
            ...(quest.handoff.blockedReason === "" ? {} : { connectorNote: quest.handoff.blockedReason }),
          },
          { actorId: selfActorId, connector: null },
        ],
        currentIndex: 0,
        hiddenBefore: 0,
      };
    case "accepted":
      return {
        legs: [
          { actorId: agentId, connector: "completed", nodeState: "completed" },
          { actorId: selfActorId, connector: null, nodeState: "completed" },
        ],
        currentIndex: 1,
        hiddenBefore: 0,
      };
    default:
      return {
        legs: [
          { actorId: selfActorId, connector: "pending" },
          { actorId: agentId, connector: null },
        ],
        currentIndex: 0,
        hiddenBefore: 0,
      };
  }
}

export interface NormalizeOptions {
  readonly profile: ProfileRecord | null;
  readonly agents: readonly AgentRecordView[];
  readonly quests: readonly Quest[];
  readonly syncLabel: string;
}

/**
 * Turns a repository snapshot into the Command ViewModel. Only Quests the
 * domain can actually act on become interventions, so the Attention Shelf never
 * offers a decision the server would reject.
 */
export function normalizeCommandModel(options: NormalizeOptions): CommandModel {
  const selfActor = options.profile === null
    ? placeholderActor("u-self", "human")
    : humanActorFromProfile(options.profile);
  const known = new Map(resolveActors(options.profile, options.agents, [selfActor]));

  const loomQuests: LoomQuest[] = [];
  const interventions: Intervention[] = [];

  for (const quest of options.quests) {
    if (quest.assignee.type === "agent" && !known.has(quest.assignee.id)) {
      known.set(quest.assignee.id, placeholderActor(quest.assignee.id, "agent"));
    }
    const holder = known.get(quest.assignee.type === "agent" ? quest.assignee.id : selfActor.id);
    const relay = spineFor(quest, selfActor.id);
    const loomQuest = toLoomQuest({
      quest,
      relay,
      dependencies: quest.dependencyIds.map((questId) => ({
        questId,
        ref: `QF-${questId.replace(/\D/g, "")}`,
        critical: quest.isBlockingOthers,
        blocking: quest.assignee.handoffState === "blocked",
      })),
      stateLabel: stateLabelFor(quest, holder),
      actionLabel: quest.assignee.handoffState === "review_required" ? "Review output" : "Inspect",
      context: quest.notes === "" ? quest.category : quest.notes,
    });
    loomQuests.push(loomQuest);

    if (loomQuest.needsIntervention) {
      interventions.push({
        id: `iv-${quest.id}`,
        questId: quest.id,
        severity: loomQuest.state === "blocked" ? "blocked" : loomQuest.state === "waiting" ? "waiting" : "review",
        reason: loomQuest.stateLabel,
        questRef: loomQuest.ref,
        questTitle: quest.title,
        waitingMinutes: minutesSince(quest.handoff.reviewRequestedAt || quest.handoff.startedAt || quest.updatedAt),
        ownerActorId: selfActor.id,
        actionLabel: loomQuest.actionLabel,
        affectedCount: 1,
      });
    }
  }

  const selectedViews = new Map(loomQuests.map((quest) => [quest.id, deriveSelectedQuestView(quest)]));

  return {
    actors: known,
    quests: loomQuests,
    interventions,
    chronicle: [],
    capacity: [
      {
        id: "attention",
        label: "Human attention",
        shortLabel: "Attention",
        value: `${interventions.filter((item) => item.severity === "review").length} review`,
        tone: "review",
        filter: "review",
      },
      {
        id: "execution",
        label: "Execution",
        shortLabel: "Execution",
        value: `${loomQuests.filter((quest) => quest.state === "working").length} executing`,
        tone: "agent",
        filter: null,
      },
      {
        id: "constraint",
        label: "Blocked",
        shortLabel: "Blocked",
        value: `${loomQuests.filter((quest) => quest.state === "blocked").length} Quests`,
        tone: "danger",
        filter: "blocked",
      },
      {
        id: "health",
        label: "System",
        shortLabel: "System",
        value: `Synced · ${options.syncLabel}`,
        tone: "success",
        filter: "health",
      },
    ],
    syncState: "synced",
    lastSyncLabel: options.syncLabel,
    selectedViews,
  };
}

function minutesSince(iso: string): number {
  if (iso === "") return 0;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 60000));
}

/* ------------------------------------------------------------------ *
 * Handoff Command connection
 * ------------------------------------------------------------------ */

/** Mirrors HANDOFF_TRANSITIONS in `server/questforge-domain.ts`. */
const ALLOWED_TRANSITIONS: ReadonlyMap<HandoffState, ReadonlySet<HandoffState>> = new Map([
  ["none", new Set<HandoffState>(["ready"])],
  ["ready", new Set<HandoffState>(["working", "blocked"])],
  ["working", new Set<HandoffState>(["blocked", "review_required"])],
  ["blocked", new Set<HandoffState>(["working", "none"])],
  ["review_required", new Set<HandoffState>(["accepted", "working"])],
  ["accepted", new Set<HandoffState>(["none"])],
]);

export function canTransition(from: HandoffState, to: HandoffState): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) === true;
}

export interface HandoffRequest {
  readonly questId: string;
  readonly state: HandoffState;
  readonly expectedState: HandoffState;
  readonly note?: string;
  readonly dryRun: boolean;
}

export interface HandoffOutcome {
  readonly ok: boolean;
  /** Domain error code, e.g. `stale_handoff_state`, when `ok` is false. */
  readonly code: string;
  readonly message: string;
  /** The Quest returned by the server; the UI never invents this. */
  readonly quest: Quest | null;
  readonly dryRun: boolean;
}

/** The one call this screen makes. Implemented over the existing repository. */
export interface HandoffPort {
  transitionHandoff(questId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function describe(error: unknown): { code: string; message: string } {
  if (error !== null && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown; status?: unknown };
    return {
      code: String(record.code ?? `http_${String(record.status ?? "error")}`),
      message: String(record.message ?? "Handoff could not be applied."),
    };
  }
  return { code: "unknown_error", message: "Handoff could not be applied." };
}

/**
 * Runs one handoff transition against the existing Command.
 *
 * A dry run is always sent first: the domain validates the transition and the
 * `expectedState` guard without writing, so an invalid or conflicting decision
 * is refused before anything changes. Only a successful preview is executed,
 * and the resulting Quest comes back from the server — the caller must not
 * synthesise it.
 */
export async function runHandoff(
  port: HandoffPort,
  request: HandoffRequest,
): Promise<HandoffOutcome> {
  if (!canTransition(request.expectedState, request.state)) {
    return {
      ok: false,
      code: "invalid_handoff_transition",
      message: `Cannot move handoff from ${request.expectedState} to ${request.state}.`,
      quest: null,
      dryRun: true,
    };
  }

  const body: Record<string, unknown> = {
    state: request.state,
    expectedState: request.expectedState,
    dryRun: true,
  };
  if (request.note !== undefined && request.note !== "") body.note = request.note;

  try {
    await port.transitionHandoff(request.questId, body);
  } catch (error) {
    const described = describe(error);
    return { ok: false, code: described.code, message: described.message, quest: null, dryRun: true };
  }

  if (request.dryRun) {
    return { ok: true, code: "preview_ok", message: "Preview succeeded.", quest: null, dryRun: true };
  }

  try {
    const result = await port.transitionHandoff(request.questId, { ...body, dryRun: false });
    const quest = result.quest !== undefined && result.quest !== null && typeof result.quest === "object"
      ? result.quest as Quest
      : null;
    return { ok: true, code: "applied", message: "Handoff applied.", quest, dryRun: false };
  } catch (error) {
    const described = describe(error);
    return { ok: false, code: described.code, message: described.message, quest: null, dryRun: false };
  }
}

/** Human-readable, non-leaking explanation for a failed decision. */
export function explainFailure(code: string): string {
  switch (code) {
    case "stale_handoff_state":
      return "他の Actor が先に状態を更新しました。最新の内容を確認してから再実行してください。";
    case "invalid_handoff_transition":
      return "この状態からは実行できない遷移です。最新の Relay を確認してください。";
    case "agent_assignee_required":
      return "Agent が担当していない Quest では Handoff を操作できません。";
    case "quest_not_found":
      return "Quest が見つかりません。一覧を再取得してください。";
    case "gateway_url_missing":
      return "API Gateway が未設定です。Connections で設定するとローカルモードから切り替わります。";
    case "http_401":
    case "unauthorized":
      return "サインインが必要です。";
    case "http_403":
    case "forbidden":
    case "insufficient_scope":
      return "この操作に必要な権限がありません。";
    default:
      return "実行できませんでした。時間をおいて再試行してください。";
  }
}
