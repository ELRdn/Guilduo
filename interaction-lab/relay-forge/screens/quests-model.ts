/**
 * Quests — ViewModel and production adapter.
 *
 * DOM-free on purpose: this is the `domain -> screen adapter -> ViewModel`
 * layer, so it can be unit-tested under the node project and can never reach
 * for a document. All rendering lives in `quests.ts`.
 */

import type { HandoffState, Impact, Quest } from "../../../types/questforge.ts";
import type { ScreenNotice } from "./screen-state.ts";

/* ------------------------------------------------------------------ *
 * ViewModel
 * ------------------------------------------------------------------ */

/**
 * The portfolio buckets. These are derived from the domain's own fields, not
 * invented: `blocked` is `handoffState === "blocked"` or a dependency that is
 * not yet done; `review` is `review_required`; `working` covers an in-flight
 * agent or an active self-assigned Quest; `scheduled` is planned but not
 * started; `done` is `lifecycleState === "completed"`.
 */
export type PortfolioBucket = "review" | "blocked" | "working" | "scheduled" | "done";

export interface QuestRelayView {
  /** Who handed the Quest over. Empty when it has never been handed off. */
  readonly fromActorId: string;
  /** Who holds it now. */
  readonly toActorId: string;
  /** Who must review it, when the domain says a review is required. */
  readonly reviewerActorId: string;
  readonly handoffState: HandoffState;
  /** Minutes since the current leg began, from `handoff.startedAt`. */
  readonly heldForMinutes: number;
}

export interface QuestRow {
  readonly humanRequest?: boolean;
  readonly id: string;
  readonly ref: string;
  readonly title: string;
  readonly bucket: PortfolioBucket;
  readonly archived: boolean;
  readonly nextAction: string;
  readonly ownerActorId: string;
  readonly relay: QuestRelayView;
  readonly impact: Impact;
  readonly dueDate: string;
  /** True when `dueDate` is before today and the Quest is not completed. */
  readonly overdue: boolean;
  /** Quests this one waits on that are not done yet. */
  readonly blockedByIds: readonly string[];
  readonly blockedReason: string;
  /** Quests that wait directly on this one. */
  readonly downstreamIds: readonly string[];
  /** Everything reachable downstream, so the cost of a block is honest. */
  readonly downstreamTotal: number;
  /** The domain's own flag, kept separate from the derived downstream count. */
  readonly isBlockingOthers: boolean;
  readonly hasEvidence: boolean;
  readonly hasChronicle: boolean;
  /** True when this Quest would appear in Command's Attention Shelf. */
  readonly interventionCandidate: boolean;
  readonly updatedAt: string;
}

export interface QuestsModel {
  readonly rows: readonly QuestRow[];
  /** Non-ready conditions, in the order they should be shown. */
  readonly notices: readonly ScreenNotice[];
  /** True while writes must be held (offline / stale / missing permission). */
  readonly writeHeld: boolean;
  /** Set when the domain does not expose an action this screen would offer. */
  readonly unavailable: ReadonlyArray<{ readonly what: string; readonly why: string }>;
}

/* ------------------------------------------------------------------ *
 * Production adapter
 * ------------------------------------------------------------------ */

export const BUCKET_LABEL: Readonly<Record<PortfolioBucket, string>> = {
  review: "要判断",
  blocked: "停止",
  working: "進行中",
  scheduled: "予定",
  done: "完了",
};

export const BUCKET_MARK: Readonly<Record<PortfolioBucket, string>> = {
  review: "!?",
  blocked: "//",
  working: ">>",
  scheduled: "..",
  done: "OK",
};

export const BUCKET_TONE = {
  review: "review",
  blocked: "blocked",
  working: "working",
  scheduled: "scheduled",
  done: "done",
} as const;

/** Actor id for a Quest assignee, matching the ids `resolveActors` produces. */
function assigneeActorId(quest: Quest, selfUid: string): string {
  if (quest.assignee.type === "agent") return quest.assignee.id;
  if (quest.assignee.type === "human") return `u-${quest.assignee.id}`;
  return selfUid === "" ? "u-self" : `u-${selfUid}`;
}

function minutesSince(iso: string, now: number): number {
  if (iso === "") return 0;
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? 0 : Math.max(0, (now - at) / 60000);
}

function bucketOf(quest: Quest, unmetDependencies: number): PortfolioBucket {
  if (quest.lifecycleState === "completed" || quest.done) return "done";
  const handoff = quest.assignee.handoffState;
  if (handoff === "review_required") return "review";
  if (handoff === "blocked" || unmetDependencies > 0) return "blocked";
  if (handoff === "working" || handoff === "ready") return "working";
  return quest.planningState === "scheduled" ? "scheduled" : "working";
}

export interface NormalizeQuestsOptions {
  readonly quests: readonly Quest[];
  /** uid of the signed-in profile, used to resolve `self` assignees. */
  readonly selfUid: string;
  readonly notices?: readonly ScreenNotice[];
  readonly writeHeld?: boolean;
  readonly unavailable?: ReadonlyArray<{ readonly what: string; readonly why: string }>;
  /** Injected so fixtures and tests are deterministic. */
  readonly now?: number;
  /** `YYYY-MM-DD` used for the overdue comparison. */
  readonly today?: string;
}

/**
 * Turns the domain's Quest records into portfolio rows.
 *
 * Two things are computed here rather than read: the unmet-dependency set (the
 * domain stores `dependencyIds` but not whether they are satisfied) and the
 * downstream closure (the cost of a block, which is the whole point of this
 * screen). Both are derived from the same Quest array, never fetched separately,
 * so they cannot disagree with the rows on screen.
 */
export function normalizeQuestsModel(options: NormalizeQuestsOptions): QuestsModel {
  const now = options.now ?? Date.now();
  const today = options.today ?? new Date(now).toISOString().slice(0, 10);
  const quests = options.quests;
  const byId = new Map(quests.map((quest) => [quest.id, quest]));

  const completed = (id: string): boolean => {
    const quest = byId.get(id);
    return quest !== undefined && (quest.done || quest.lifecycleState === "completed");
  };

  /* Direct downstream edges, inverted from `dependencyIds`. */
  const downstream = new Map<string, string[]>();
  for (const quest of quests) {
    for (const dependencyId of quest.dependencyIds) {
      const list = downstream.get(dependencyId);
      if (list === undefined) downstream.set(dependencyId, [quest.id]);
      else list.push(quest.id);
    }
  }

  /* Transitive closure, guarded against a cycle in the stored data. */
  const closureSize = (id: string): number => {
    const seen = new Set<string>();
    const queue = [...(downstream.get(id) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      for (const child of downstream.get(next) ?? []) if (!seen.has(child)) queue.push(child);
    }
    return seen.size;
  };

  const rows = quests.map((quest): QuestRow => {
    const blockedByIds = quest.dependencyIds.filter((id) => !completed(id));
    const bucket = bucketOf(quest, blockedByIds.length);
    const ownerActorId = assigneeActorId(quest, options.selfUid);
    const reviewerActorId = quest.handoff.reviewedBy !== ""
      ? `u-${quest.handoff.reviewedBy}`
      : (options.selfUid === "" ? "u-self" : `u-${options.selfUid}`);
    const started = quest.handoff.startedAt !== "" ? quest.handoff.startedAt : quest.updatedAt;
    return {
      id: quest.id,
      humanRequest: Boolean(quest.humanRequest),
      ref: quest.id.toUpperCase().startsWith("QF-") ? quest.id.toUpperCase() : `QF-${quest.id.replace(/^q-/i, "").toUpperCase()}`,
      title: quest.title,
      bucket,
      archived: quest.lifecycleState === "archived",
      nextAction: quest.nextAction,
      ownerActorId,
      relay: {
        // The handing-over side is the human who owns the board unless the
        // domain recorded a reviewer; it is never guessed from the label text.
        fromActorId: quest.assignee.type === "agent" ? reviewerActorId : "",
        toActorId: ownerActorId,
        reviewerActorId,
        handoffState: quest.assignee.handoffState,
        heldForMinutes: minutesSince(started, now),
      },
      impact: quest.impact,
      dueDate: quest.dueDate,
      overdue: quest.dueDate !== "" && quest.dueDate < today && bucket !== "done",
      blockedByIds,
      blockedReason: quest.handoff.blockedReason,
      downstreamIds: downstream.get(quest.id) ?? [],
      downstreamTotal: closureSize(quest.id),
      isBlockingOthers: quest.isBlockingOthers,
      hasEvidence: quest.handoff.artifactUrl !== "" || quest.externalLinks.length > 0,
      hasChronicle: quest.handoff.startedAt !== "" || quest.handoff.reviewRequestedAt !== "",
      interventionCandidate: bucket === "review" || bucket === "blocked",
      updatedAt: quest.updatedAt,
    };
  });

  return {
    rows,
    notices: options.notices ?? [],
    writeHeld: options.writeHeld ?? false,
    unavailable: options.unavailable ?? [],
  };
}
