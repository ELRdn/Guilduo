/**
 * FIXTURE HANDOFF PORT — NOT PRODUCTION.
 *
 * Implements the same `HandoffPort` interface the real repository satisfies, so
 * the local demo exercises the identical `runHandoff` path: dry run first,
 * `expectedState` conflict guard, the domain transition table, and a returned
 * Quest that the UI applies rather than invents.
 *
 * The rules below are copied from `server/questforge-domain.ts`
 * `transitionQuestHandoff`. This port never writes anywhere real; it exists so
 * the failure modes (conflict, invalid transition, permission, network) can be
 * driven deterministically for capture and verification.
 */

import type { HandoffState, Quest } from "../../types/questforge.ts";
import { canTransition, type HandoffPort } from "./adapter.ts";

/** Matches `QuestForgeApiError` so `runHandoff` reads the same fields. */
class FixtureApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "FixtureApiError";
    this.status = status;
    this.code = code;
  }
}

export interface FixturePortOptions {
  /** Forces a specific failure so each error state can be captured. */
  readonly failure?: "permission" | "conflict" | "network" | "invalid" | null;
  /** Milliseconds the request takes, so the submitting state is observable. */
  readonly latencyMs?: number;
}

export class FixtureHandoffPort implements HandoffPort {
  private readonly quests: Map<string, Quest>;
  private readonly options: FixturePortOptions;
  /** Guards against a second write for the same Quest while one is in flight. */
  private readonly inFlight = new Set<string>();

  constructor(quests: readonly Quest[], options: FixturePortOptions = {}) {
    this.quests = new Map(quests.map((quest) => [quest.id, quest]));
    this.options = options;
  }

  async transitionHandoff(questId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dryRun = input.dryRun !== false;
    const latency = this.options.latencyMs ?? 0;
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));

    if (this.options.failure === "network") {
      throw new FixtureApiError(0, "network_error", "ネットワークに接続できませんでした。");
    }
    if (this.options.failure === "permission") {
      throw new FixtureApiError(403, "insufficient_scope", "quests:write スコープが不足しています。");
    }

    const quest = this.quests.get(questId);
    if (quest === undefined) {
      throw new FixtureApiError(404, "quest_not_found", "Quest not found.");
    }
    if (quest.assignee.type !== "agent") {
      throw new FixtureApiError(409, "agent_assignee_required", "Only agent-assigned quests can use handoff states.");
    }

    const current = this.options.failure === "conflict"
      ? "working" as HandoffState
      : quest.assignee.handoffState;
    const expected = input.expectedState as HandoffState | undefined;
    if (expected !== undefined && expected !== current) {
      throw new FixtureApiError(409, "stale_handoff_state", "The handoff changed before this update was applied.");
    }

    const next = input.state as HandoffState;
    if (this.options.failure === "invalid" || (current !== next && !canTransition(current, next))) {
      throw new FixtureApiError(409, "invalid_handoff_transition", `Cannot move handoff from ${current} to ${next}.`);
    }

    if (!dryRun) {
      if (this.inFlight.has(questId)) {
        throw new FixtureApiError(409, "duplicate_request", "同じ Handoff がすでに送信中です。");
      }
      this.inFlight.add(questId);
      try {
        const now = new Date().toISOString();
        const applied: Quest = {
          ...quest,
          updatedAt: now,
          assignee: { ...quest.assignee, handoffState: next },
          handoff: {
            ...quest.handoff,
            note: typeof input.note === "string" ? input.note : quest.handoff.note,
            ...(next === "accepted" ? { reviewedAt: now, reviewedBy: "u-hironao" } : {}),
          },
        };
        this.quests.set(questId, applied);
        return { dryRun: false, quest: applied, event: { type: "quest.handoff.transitioned", from: current, to: next } };
      } finally {
        this.inFlight.delete(questId);
      }
    }

    return { dryRun: true, quest, event: { type: "quest.handoff.preview", from: current, to: next } };
  }

  current(questId: string): Quest | undefined {
    return this.quests.get(questId);
  }
}
