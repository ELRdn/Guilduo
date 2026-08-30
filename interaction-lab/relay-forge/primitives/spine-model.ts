import type { LoomQuest } from "../model.ts";

export type LoomRelation = "upstream" | "hub" | "branch" | "standalone";

export interface WovenRow {
  readonly quest: LoomQuest;
  readonly relation: LoomRelation;
  readonly first: boolean;
  readonly last: boolean;
  readonly branchHead: boolean;
}

/**
 * Annotates the selected Quest and its direct relations without changing the
 * source order. Selection must never move the row a person just clicked.
 */
export function weaveQuestRows(quests: readonly LoomQuest[], selectedId: string | null): readonly WovenRow[] {
  const hub = quests.find((quest) => quest.id === selectedId) ?? null;
  const upstreamIds = new Set(hub?.dependencies.map((dependency) => dependency.questId) ?? []);
  const ordered = quests.map((quest): { quest: LoomQuest; relation: LoomRelation } => ({
    quest,
    relation: hub === null
      ? "standalone"
      : quest.id === hub.id
        ? "hub"
        : upstreamIds.has(quest.id)
          ? "upstream"
          : quest.dependencies.some((dependency) => dependency.questId === hub.id)
            ? "branch"
            : "standalone",
  }));

  return ordered.map((entry, index) => ({
    quest: entry.quest,
    relation: entry.relation,
    first: index === 0,
    last: index === ordered.length - 1,
    branchHead: entry.relation === "branch" && ordered[index - 1]?.relation !== "branch",
  }));
}
