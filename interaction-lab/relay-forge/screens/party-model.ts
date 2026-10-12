/**
 * Party — ViewModel and production adapter.
 *
 * DOM-free. Note what is absent: there is no capacity or availability field,
 * because the domain has none. See the header of `party.ts`.
 */

import type { Quest } from "../../../types/questforge.ts";
import type { Actor } from "../model.ts";
import { t } from "../../../i18n.ts";
import { relayText } from "../relay-copy.ts";
import { instantLabel, type ScreenNotice } from "./screen-state.ts";

/* ------------------------------------------------------------------ *
 * ViewModel
 * ------------------------------------------------------------------ */

/** Workload buckets. Every one is a count of real Quests, never a score. */
export interface Workload {
  readonly working: number;
  readonly review: number;
  readonly blocked: number;
  readonly waiting: number;
  readonly total: number;
}

export interface HeldQuest {
  readonly id: string;
  readonly ref: string;
  readonly title: string;
  readonly state: "working" | "review" | "blocked" | "waiting";
  /** Minutes since this actor took the Quest, from `handoff.startedAt`. */
  readonly heldForMinutes: number;
}

/**
 * What an actor is permitted to do. For an Agent these are the RegisteredAgent
 * fields verbatim; for a Human they are the party role and profile fields. No
 * capability is synthesised — an absent field is shown as absent.
 */
export interface Capability {
  readonly label: string;
  readonly value: string;
}

export interface PartyMemberView {
  readonly actorId: string;
  readonly kind: Actor["kind"];
  /** owner / member for a party human; active / disabled / archived for an Agent. */
  readonly standing: string;
  readonly workload: Workload;
  readonly held: readonly HeldQuest[];
  /** Most recent handoff this actor was part of. Empty when there is none. */
  readonly lastHandoffAt: string;
  readonly lastHandoffSummary: string;
  readonly capabilities: readonly Capability[];
  /** True when the domain marks the Agent as requiring human review. */
  readonly reviewRequired: boolean;
}

export interface PartyModel {
  readonly members: readonly PartyMemberView[];
  /** The largest total across members, used as the comparison scale. */
  readonly busiestTotal: number;
  readonly partyName: string;
  readonly notices: readonly ScreenNotice[];
  readonly unavailable: ReadonlyArray<{ readonly what: string; readonly why: string }>;
}

/* ------------------------------------------------------------------ *
 * Production adapter
 * ------------------------------------------------------------------ */

export interface PartyMemberRecord {
  readonly uid: string;
  readonly displayName: string;
  readonly handle: string;
  readonly role: "owner" | "member";
  readonly joinedAt: string;
  readonly level: number;
}

export interface AgentRecord {
  readonly agentId: string;
  readonly displayName: string;
  readonly provider?: string;
  readonly role?: string;
  readonly instructions?: string;
  readonly status?: string;
  readonly allowedScopes?: readonly string[];
  readonly reviewRequired?: boolean;
  readonly dryRunDefault?: boolean;
  readonly defaultHandoffState?: string;
  readonly updatedAt?: string;
  /** True when the server has an R2 image for this Agent (`avatar_asset_id` set). */
  readonly hasCustomAvatar?: boolean;
  readonly avatarVersion?: number;
  /**
   * Blob object URL, set client-side once the shell has fetched the image
   * bytes over the authenticated avatar route — never present on the server
   * response itself. Absent until the background fetch lands, even when
   * `hasCustomAvatar` is true.
   */
  readonly avatarUrl?: string;
}

export interface NormalizePartyOptions {
  readonly quests: readonly Quest[];
  readonly actors: ReadonlyMap<string, Actor>;
  readonly members: readonly PartyMemberRecord[];
  readonly agents: readonly AgentRecord[];
  readonly selfUid: string;
  readonly partyName: string;
  readonly notices?: readonly ScreenNotice[];
  readonly unavailable?: ReadonlyArray<{ readonly what: string; readonly why: string }>;
  readonly now?: number;
}

function ownerId(quest: Quest, selfUid: string): string {
  if (quest.assignee.type === "agent") return quest.assignee.id;
  if (quest.assignee.type === "human") return `u-${quest.assignee.id}`;
  return selfUid === "" ? "u-self" : `u-${selfUid}`;
}

function heldState(quest: Quest, unmet: number): HeldQuest["state"] {
  if (quest.assignee.handoffState === "review_required") return "review";
  if (quest.assignee.handoffState === "blocked" || unmet > 0) return "blocked";
  if (quest.assignee.handoffState === "working") return "working";
  return "waiting";
}

function questRef(id: string): string {
  return id.toUpperCase().startsWith("QF-") ? id.toUpperCase() : `QF-${id.replace(/^q-/i, "").toUpperCase()}`;
}

/**
 * Builds the roster. Workload is computed from the same Quest array the other
 * screens use, so a count here can never disagree with a count in Quests.
 */
export function normalizePartyModel(options: NormalizePartyOptions): PartyModel {
  const now = options.now ?? Date.now();
  const done = new Set(
    options.quests.filter((quest) => quest.done || quest.lifecycleState === "completed").map((quest) => quest.id),
  );

  const held = new Map<string, HeldQuest[]>();
  const lastHandoff = new Map<string, { at: string; summary: string }>();
  for (const quest of options.quests) {
    if (quest.lifecycleState === "archived") continue;
    const id = ownerId(quest, options.selfUid);
    const stamp = quest.handoff.reviewedAt || quest.handoff.reviewRequestedAt || quest.handoff.startedAt;
    if (stamp !== "") {
      const previous = lastHandoff.get(id);
      if (previous === undefined || previous.at < stamp) {
        lastHandoff.set(id, {
          at: stamp,
          summary: `${questRef(quest.id)} · ${t(`task.handoffStates.${quest.assignee.handoffState}`)}`,
        });
      }
    }
    if (quest.done || quest.lifecycleState === "completed") continue;
    const unmet = quest.dependencyIds.filter((dependency) => !done.has(dependency)).length;
    const startedAt = quest.handoff.startedAt !== "" ? quest.handoff.startedAt : quest.updatedAt;
    const at = new Date(startedAt).getTime();
    const entry: HeldQuest = {
      id: quest.id,
      ref: questRef(quest.id),
      title: quest.title,
      state: heldState(quest, unmet),
      heldForMinutes: Number.isNaN(at) ? 0 : Math.max(0, (now - at) / 60000),
    };
    const list = held.get(id);
    if (list === undefined) held.set(id, [entry]);
    else list.push(entry);

  }

  const workloadOf = (id: string): Workload => {
    const list = held.get(id) ?? [];
    return {
      working: list.filter((entry) => entry.state === "working").length,
      review: list.filter((entry) => entry.state === "review").length,
      blocked: list.filter((entry) => entry.state === "blocked").length,
      waiting: list.filter((entry) => entry.state === "waiting").length,
      total: list.length,
    };
  };

  const members: PartyMemberView[] = [];

  for (const record of options.members) {
    const actorId = `u-${record.uid}`;
    const actor = options.actors.get(actorId);
    const handoff = lastHandoff.get(actorId);
    members.push({
      actorId,
      kind: actor?.kind ?? "human",
      standing: relayText(record.role === "owner" ? "partyOwner" : "partyMember"),
      workload: workloadOf(actorId),
      held: (held.get(actorId) ?? []).slice().sort((left, right) => right.heldForMinutes - left.heldForMinutes),
      lastHandoffAt: handoff?.at ?? "",
      lastHandoffSummary: handoff?.summary ?? "",
      capabilities: [
        { label: relayText("partyHandle"), value: record.handle === "" ? "—" : `@${record.handle}` },
        { label: relayText("partyJoined"), value: instantLabel(record.joinedAt) },
        { label: relayText("partyLevel"), value: String(record.level) },
      ],
      reviewRequired: false,
    });
  }

  for (const record of options.agents) {
    const actor = options.actors.get(record.agentId);
    const handoff = lastHandoff.get(record.agentId);
    const scopes = record.allowedScopes ?? [];
    members.push({
      actorId: record.agentId,
      kind: actor?.kind ?? "agent",
      standing: relayText(record.status === "disabled" ? "disabled" : record.status === "archived" ? "partyArchived" : "partyActive"),
      workload: workloadOf(record.agentId),
      held: (held.get(record.agentId) ?? []).slice().sort((left, right) => right.heldForMinutes - left.heldForMinutes),
      lastHandoffAt: handoff?.at ?? "",
      lastHandoffSummary: handoff?.summary ?? "",
      capabilities: [
        { label: "Provider", value: record.provider === undefined || record.provider === "" ? "—" : record.provider },
        { label: t("character.role"), value: record.role === undefined || record.role === "" ? "—" : record.role },
        { label: relayText("partyScopes"), value: scopes.length === 0 ? relayText("partyNoScopes") : scopes.join(", ") },
        { label: relayText("agentDefaultHandoff"), value: record.defaultHandoffState === undefined ? "—" : t(`task.handoffStates.${record.defaultHandoffState}`) },
        { label: relayText("partyDryRun"), value: relayText(record.dryRunDefault === true ? "partyEnabled" : "disabled") },
      ],
      reviewRequired: record.reviewRequired === true,
    });
  }

  /* Humans first, then Agents, then anything else; within a group, the busiest
   * first, because "who is overloaded" is the question this ordering answers. */
  const kindWeight: Readonly<Record<Actor["kind"], number>> = { human: 0, agent: 1, companion: 2, system: 3 };
  members.sort((left, right) => {
    const byKind = kindWeight[left.kind] - kindWeight[right.kind];
    if (byKind !== 0) return byKind;
    return right.workload.total - left.workload.total;
  });

  return {
    members,
    busiestTotal: members.reduce((max, member) => Math.max(max, member.workload.total), 0),
    partyName: options.partyName,
    notices: options.notices ?? [],
    unavailable: options.unavailable ?? [],
  };
}
