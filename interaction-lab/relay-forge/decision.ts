/**
 * Decision controller — the one place either decision is executed.
 *
 * Both decisions go through the same gate so neither can bypass a guard:
 *
 *   evidence reviewed? → permission? → not stale? → not already submitting?
 *     → dry run against the existing Handoff Command
 *     → execute with `expectedState`
 *     → apply the Quest the server returned
 *
 * `Approve handoff` is `review_required -> accepted`. `Request revision` is
 * `review_required -> working` and requires a non-empty reason, which travels
 * as the `note` field the endpoint already accepts. Neither ever sets the Quest
 * lifecycle: an accepted handoff is not a completed Quest.
 *
 * The UI never synthesises success. If the server refuses, the previous state
 * stays on screen and the reason is shown.
 */

import type { HandoffState, Quest } from "../../types/questforge.ts";
import { relayText } from "./relay-copy.ts";
import { explainFailure, type HandoffOutcome, type HandoffPort, runHandoff } from "./adapter.ts";

export type DecisionKind = "approve" | "revise";

export type DecisionPhase = "idle" | "submitting" | "succeeded" | "failed";

export interface DecisionGate {
  /** Explicit human check of the external work. Opening a preview never sets this. */
  readonly evidenceReviewed: boolean;
  readonly writeLocked: boolean;
  readonly permissionMissing: string | null;
  readonly conflict: string | null;
}

export interface DecisionRequest {
  readonly kind: DecisionKind;
  readonly questId: string;
  readonly expectedState: HandoffState;
  readonly reason: string;
}

export interface DecisionResult {
  readonly phase: DecisionPhase;
  readonly kind: DecisionKind | null;
  /** Message shown to the user; never contains a token or a raw URL. */
  readonly message: string;
  /** Domain error code when the phase is `failed`. */
  readonly code: string;
  /** The Quest the server returned; `null` unless the phase is `succeeded`. */
  readonly quest: Quest | null;
}

export const IDLE_DECISION: DecisionResult = {
  phase: "idle",
  kind: null,
  message: "",
  code: "",
  quest: null,
};

/**
 * Returns why the decision cannot run yet, or `null` when it may proceed. The
 * order matches the section 6.10 state precedence: permission, then conflict,
 * then stale, then in-flight, then the evidence requirement.
 */
export function blockingReason(gate: DecisionGate, phase: DecisionPhase): string | null {
  if (gate.permissionMissing !== null) return gate.permissionMissing;
  if (gate.conflict !== null) return gate.conflict;
  if (gate.writeLocked) return "再接続まで書き込みは保留中です";
  if (phase === "submitting") return "送信中です";
  if (!gate.evidenceReviewed) return relayText("checkFirst");
  return null;
}

const TARGET_STATE: Readonly<Record<DecisionKind, HandoffState>> = {
  approve: "accepted",
  revise: "working",
};

/**
 * Runs one decision. `onPhase` fires with `submitting` before the request so the
 * caller can disable the control; a second call while submitting is refused
 * rather than queued, which is the double-submit guard.
 */
export async function submitDecision(
  port: HandoffPort,
  request: DecisionRequest,
  gate: DecisionGate,
  phase: DecisionPhase,
  onPhase: (result: DecisionResult) => void,
): Promise<DecisionResult> {
  const blocked = blockingReason(gate, phase);
  if (blocked !== null) {
    const refused: DecisionResult = {
      phase: "failed",
      kind: request.kind,
      message: blocked,
      code: "blocked",
      quest: null,
    };
    onPhase(refused);
    return refused;
  }

  if (request.kind === "revise" && request.reason.trim() === "") {
    const refused: DecisionResult = {
      phase: "failed",
      kind: "revise",
      message: "修正内容を入力してください",
      code: "reason_required",
      quest: null,
    };
    onPhase(refused);
    return refused;
  }

  onPhase({ phase: "submitting", kind: request.kind, message: "送信中です", code: "", quest: null });

  const outcome: HandoffOutcome = await runHandoff(port, {
    questId: request.questId,
    state: TARGET_STATE[request.kind],
    expectedState: request.expectedState,
    ...(request.kind === "revise" ? { note: request.reason.trim() } : {}),
    dryRun: false,
  });

  const result: DecisionResult = outcome.ok
    ? {
      phase: "succeeded",
      kind: request.kind,
      message: request.kind === "approve" ? "Handoff を承認しました" : "修正を依頼しました",
      code: outcome.code,
      quest: outcome.quest,
    }
    : {
      phase: "failed",
      kind: request.kind,
      message: explainFailure(outcome.code),
      code: outcome.code,
      quest: null,
    };

  onPhase(result);
  return result;
}
