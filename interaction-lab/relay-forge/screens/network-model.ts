/**
 * Network — ViewModel and production adapter.
 *
 * DOM-free: the graph is built from the domain's own relations here, and drawn
 * in `network.ts`. Keeping the two apart is what lets the edge rules be tested
 * without a browser.
 */

import type { Quest } from "../../../types/questforge.ts";
import { type Actor, questRef } from "../model.ts";
import type { ScreenNotice } from "./screen-state.ts";
import { countLabel } from "./screen-state.ts";
import { relayText, type RelayCopyKey } from "../relay-copy.ts";

/* ------------------------------------------------------------------ *
 * ViewModel
 * ------------------------------------------------------------------ */

export type NodeKind = "quest" | "actor" | "connection";

/** Why two nodes are joined. The label is shown; the kind drives the drawing. */
export type EdgeKind =
  /** `dependencyIds`: the target cannot proceed until the source completes. */
  | "dependency"
  /** `parentQuestId`: containment, not blocking. */
  | "contains"
  /** `assignee`: an Actor currently holds the Quest. */
  | "assignment"
  /** `externalLinks[].service`: an integration supplies or receives the Quest. */
  | "sync";

export interface NetworkNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly ref: string;
  readonly label: string;
  readonly sub: string;
  /** Quest state, or connection health. Drives the chip, never colour alone. */
  readonly state: "review" | "blocked" | "working" | "scheduled" | "done" | "healthy" | "degraded" | "neutral";
  /** Set for quest nodes that cannot proceed. */
  readonly blocked: boolean;
  /** The domain destination this node opens in. */
  readonly destination: "command" | "quests" | "party" | "connections";
}

export interface NetworkEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: EdgeKind;
  /** One sentence explaining the edge, shown in the rail and the outline. */
  readonly reason: string;
  /** True when this edge is what is currently holding the target back. */
  readonly blocking: boolean;
}

/** A run of blocked Quests traceable to one root cause. */
export interface BlockedChain {
  readonly rootId: string;
  readonly rootRef: string;
  readonly reason: string;
  /** Everything downstream of the root that is waiting, nearest first. */
  readonly waitingIds: readonly string[];
}

export interface NetworkModel {
  readonly nodes: ReadonlyMap<string, NetworkNode>;
  readonly edges: readonly NetworkEdge[];
  readonly chains: readonly BlockedChain[];
  readonly notices: readonly ScreenNotice[];
}

/* ------------------------------------------------------------------ *
 * Production adapter
 * ------------------------------------------------------------------ */

export const EDGE_LABEL: Readonly<Record<EdgeKind, string>> = {
  get dependency() { return relayText("networkDependency"); },
  get contains() { return relayText("networkContains"); },
  get assignment() { return relayText("networkAssignment"); },
  get sync() { return relayText("networkSync"); },
};

function relationText(key: RelayCopyKey, values: Readonly<Record<string, string>>): string {
  return relayText(key).replace(/\{(\w+)\}/g, (token: string, name: string) => values[name] ?? token);
}

function questState(quest: Quest, unmet: number): NetworkNode["state"] {
  if (quest.done || quest.lifecycleState === "completed") return "done";
  if (quest.assignee.handoffState === "review_required") return "review";
  if (quest.assignee.handoffState === "blocked" || unmet > 0) return "blocked";
  if (quest.assignee.handoffState === "working" || quest.assignee.handoffState === "ready") return "working";
  return "scheduled";
}

export interface ConnectionNodeInput {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  /** Quest ids this integration is linked to, via `externalLinks[].service`. */
  readonly questIds: readonly string[];
}

export interface NormalizeNetworkOptions {
  readonly quests: readonly Quest[];
  readonly actors: ReadonlyMap<string, Actor>;
  readonly connections: readonly ConnectionNodeInput[];
  readonly selfUid: string;
  readonly notices?: readonly ScreenNotice[];
}

function ownerId(quest: Quest, selfUid: string): string {
  if (quest.assignee.type === "agent") return quest.assignee.id;
  if (quest.assignee.type === "human") return `u-${quest.assignee.id}`;
  return selfUid === "" ? "u-self" : `u-${selfUid}`;
}

/**
 * Builds the heterogeneous graph from the domain's own relations. Nothing is
 * inferred from text: dependency edges come from `dependencyIds`, containment
 * from `parentQuestId`, assignment from `assignee` and sync from
 * `externalLinks[].service`. An edge with no domain field behind it is not drawn.
 */
export function normalizeNetworkModel(options: NormalizeNetworkOptions): NetworkModel {
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  const active = options.quests.filter(quest => quest.lifecycleState !== "archived");
  const byId = new Map(options.quests.map((quest) => [quest.id, quest]));
  const isDone = (id: string): boolean => {
    const quest = byId.get(id);
    return quest !== undefined && (quest.done || quest.lifecycleState === "completed");
  };

  for (const quest of active) {
    const unmet = quest.dependencyIds.filter((id) => !isDone(id));
    const state = questState(quest, unmet.length);
    nodes.set(quest.id, {
      id: quest.id,
      kind: "quest",
      ref: questRef(quest.id),
      label: quest.title,
      sub: quest.assignee.label,
      state,
      blocked: state === "blocked",
      destination: state === "review" || state === "blocked" ? "command" : "quests",
    });
  }

  /* Actor nodes are added only for actors that actually hold a Quest here, so
   * the graph never shows an Agent with nothing attached to it. */
  const holders = new Set(active.map((quest) => ownerId(quest, options.selfUid)));
  for (const id of holders) {
    const actor = options.actors.get(id);
    if (actor === undefined) continue;
    nodes.set(id, {
      id,
      kind: "actor",
      ref: actor.kind === "human" ? "HUMAN" : actor.kind === "agent" ? "AGENT" : actor.kind === "system" ? "SYSTEM" : "COMPANION",
      label: actor.name,
      sub: actor.role,
      state: "neutral",
      blocked: false,
      destination: "party",
    });
  }

  for (const connection of options.connections) {
    if (!connection.questIds.some(id => nodes.get(id)?.kind === "quest")) continue;
    nodes.set(connection.id, {
      id: connection.id,
      kind: "connection",
      ref: "SYNC",
      label: connection.name,
      get sub() { return relayText(connection.status === "connected" ? "networkConnected" : connection.status === "reconnect_required" ? "networkReconnectRequired" : connection.status === "disconnected" ? "unconnected" : "networkAttention"); },
      state: connection.status === "connected" ? "healthy" : "degraded",
      blocked: false,
      destination: "connections",
    });
  }

  for (const quest of active) {
    for (const dependencyId of quest.dependencyIds) {
      if (!nodes.has(dependencyId)) continue;
      const blocking = !isDone(quest.id) && !isDone(dependencyId);
      edges.push({
        fromId: dependencyId,
        toId: quest.id,
        kind: "dependency",
        get reason() { return relationText(isDone(quest.id) ? "networkDependencyClosed" : blocking ? "networkDependencyBlocked" : "networkDependencyDone", { source:questRef(dependencyId), target:questRef(quest.id) }); },
        blocking,
      });
    }
    if (quest.parentQuestId !== "" && nodes.has(quest.parentQuestId)) {
      edges.push({
        fromId: quest.parentQuestId,
        toId: quest.id,
        kind: "contains",
        get reason() { return relationText("networkContainsReason", { target:questRef(quest.id), source:questRef(quest.parentQuestId) }); },
        blocking: false,
      });
    }
    const owner = ownerId(quest, options.selfUid);
    if (nodes.has(owner)) {
      const actor = options.actors.get(owner);
      edges.push({
        fromId: owner,
        toId: quest.id,
        kind: "assignment",
        get reason() { return relationText("networkAssignmentReason", { actor:actor?.name ?? owner, quest:questRef(quest.id) }); },
        blocking: false,
      });
    }
  }

  for (const connection of options.connections) {
    for (const questId of connection.questIds) {
      if (!nodes.has(questId) || !nodes.has(connection.id)) continue;
      edges.push({
        fromId: connection.id,
        toId: questId,
        kind: "sync",
        get reason() { return relationText(connection.status === "connected" ? "networkSyncReason" : "networkSyncStopped", { connection:connection.name, quest:questRef(questId) }); },
        blocking: connection.status !== "connected" && !isDone(questId),
      });
    }
  }

  /* Blocked chains: every quest that is blocked with no blocked upstream is a
   * root cause; everything reachable downstream of it is what the block costs. */
  const downstreamOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "dependency" || !edge.blocking) continue;
    const list = downstreamOf.get(edge.fromId);
    if (list === undefined) downstreamOf.set(edge.fromId, [edge.toId]);
    else list.push(edge.toId);
  }
  const chains: BlockedChain[] = [];
  for (const quest of active) {
    const node = nodes.get(quest.id);
    if (node === undefined || !node.blocked) continue;
    const upstreamBlocked = quest.dependencyIds.some((id) => nodes.get(id)?.blocked === true);
    if (upstreamBlocked) continue;
    const waiting: string[] = [];
    const seen = new Set<string>([quest.id]);
    const queue = [...(downstreamOf.get(quest.id) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      waiting.push(next);
      for (const child of downstreamOf.get(next) ?? []) if (!seen.has(child)) queue.push(child);
    }
    chains.push({
      rootId: quest.id,
      rootRef: questRef(quest.id),
      get reason() { return quest.handoff.blockedReason !== ""
        ? quest.handoff.blockedReason
        : quest.dependencyIds.some(id => !isDone(id))
          ? relationText("networkDependenciesPending", { count:countLabel(quest.dependencyIds.filter((id) => !isDone(id)).length) })
          : relayText("networkUnknownBlockCause"); },
      waitingIds: waiting,
    });
  }
  chains.sort((left, right) => right.waitingIds.length - left.waitingIds.length);

  return { nodes, edges, chains, notices: options.notices ?? [] };
}
