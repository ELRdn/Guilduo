/**
 * Intervention Lens — NEWDESIGNv2.md section 7.
 *
 * A Decision Surface, not an Inspector. Its order is fixed and may not be
 * rearranged per screen:
 *
 *   WHY → AFFECTED QUEST → RELAY → EVIDENCE → DECISION
 *
 * RELAY renders the same `ResponsibilityStep[]` the centre workspace renders, so
 * actor order, state and timestamps can never disagree between the two
 * (section 7.2). DECISION is sticky at the bottom and is where the final Human
 * judgement happens — `Approve handoff` here is a different command from the
 * centre's `Review output`, which only inspects evidence.
 */

import {
  type Actor,
  formatWaiting,
  type Intervention,
  type SelectedQuestView,
} from "../model.ts";
import { actorAvatar } from "./avatar.ts";
import { el } from "./dom.ts";
import { externalCheck } from "./external-check.ts";
import { relayText } from "../relay-copy.ts";
import { t } from "../../../i18n.ts";
import { countLabel } from "../screens/screen-state.ts";
import { questActionLabel, type QuestActionId, type QuestActionState } from "../quest-actions.ts";

export type LensState = "closed" | "peek" | "open" | "pinned";

export interface LensContent {
  /** `null` when the selected Quest is not queued for intervention. */
  readonly intervention: Intervention | null;
  readonly view: SelectedQuestView;
}

export interface LensOptions {
  readonly externalChecked?: boolean;
  readonly onExternalChecked?: (value: boolean) => void;
  readonly state: LensState;
  readonly writeLocked: boolean;
  /** `null` when the decision may run; otherwise the reason it may not. */
  readonly blockedReason: string | null;
  readonly submitting: boolean;
  /** Short verification summary derived from the real Evidence result. */
  readonly verification: string | null;
  /** Open state and current text of the revision reason field. */
  readonly revisionOpen: boolean;
  readonly revisionReason: string;
  readonly revisionError: string | null;
  /** Result banner after a decision returns. */
  readonly resultTone: "success" | "error" | null;
  readonly resultMessage: string;
  readonly onClose: () => void;
  readonly onTogglePin: () => void;
  readonly onApprove: () => void;
  readonly onOpenRevision: () => void;
  readonly onCancelRevision: () => void;
  readonly onRevisionInput: (value: string) => void;
  readonly onSubmitRevision: () => void;
  readonly questActions: QuestActionState;
  readonly onQuestAction: (action: QuestActionId) => void;
}

function section(title: string, ...children: (Node | string | null)[]): HTMLElement {
  return el(
    "section",
    { class: "rf-lens-section" },
    el("h3", { class: "rf-region-label" }, title),
    ...children,
  );
}

const NODE_STATE = {
  completed: "completed",
  executing: "current",
  review: "review",
  blocked: "blocked",
  pending: "idle",
} as const;

/** Trailing state glyph per relay step: check, cross, alert or pending dot. */
function stepMark(state: SelectedQuestView["responsibility"][number]["state"]): HTMLElement {
  return el("span", { class: "rf-lens-relay-mark", "data-state": state, "aria-hidden": "true" });
}

function lensRelay(view: SelectedQuestView, actors: ReadonlyMap<string, Actor>): HTMLElement {
  return el(
    "ol",
    { class: "rf-lens-relay" },
    ...view.responsibility.map((step) => {
      const actor = actors.get(step.actorId);
      return el(
        "li",
        { class: "rf-lens-relay-row", "data-state": step.state },
        actor === undefined ? null : actorAvatar(actor, { size: "lens", state: NODE_STATE[step.state], showMarker: false }),
        el(
          "span",
          { class: "rf-lens-relay-copy" },
          el("span", { class: "rf-lens-relay-name" }, actor?.name ?? "—"),
          el("span", { class: "rf-lens-relay-state" }, step.stateLabel),
        ),
        el(
          "span",
          { class: "rf-lens-relay-meta" },
          stepMark(step.state),
          el("span", { class: "rf-lens-relay-time" }, step.timeLabel),
        ),
      );
    }),
  );
}

export function interventionLens(
  content: LensContent | null,
  actors: ReadonlyMap<string, Actor>,
  options: LensOptions,
): HTMLElement {
  const header = el(
    "header",
    { class: "rf-lens-header" },
    el("p", { class: "rf-region-label" }, relayText("commandLens")),
    el(
      "div",
      { class: "rf-lens-controls" },
      (() => {
        const pin = el(
          "button",
          {
            type: "button",
            class: "rf-icon-button",
            "data-command-control": "lens-pin",
            "aria-pressed": options.state === "pinned" ? "true" : "false",
            title: options.state === "pinned" ? relayText("unpinLens") : relayText("pinLens"),
          },
          el("span", { class: "rf-visually-hidden" }, options.state === "pinned" ? relayText("unpinLens") : relayText("pinLens")),
          el("span", { class: "rf-pin-mark", "aria-hidden": "true" }),
        );
        pin.addEventListener("click", options.onTogglePin);
        return pin;
      })(),
      (() => {
        const close = el(
          "button",
          { type: "button", class: "rf-icon-button", title: relayText("closeLens"), "data-command-control": "lens-close" },
          el("span", { class: "rf-visually-hidden" }, relayText("closeLens")),
          el("span", { class: "rf-close-mark", "aria-hidden": "true" }),
        );
        close.addEventListener("click", options.onClose);
        return close;
      })(),
    ),
  );

  if (content === null) {
    return el(
      "aside",
      { class: "rf-lens", "data-state": options.state, "aria-label": relayText("commandLens") },
      header,
      el(
        "div",
        { class: "rf-lens-body" },
        el(
          "div",
          { class: "rf-state rf-state--empty", role: "status" },
          el("p", { class: "rf-state-title" }, relayText("shellChooseQuest")),
          el("p", { class: "rf-state-body" }, relayText("shellChooseHint")),
        ),
      ),
    );
  }

  const { intervention, view } = content;
  const owner = intervention === null ? null : actors.get(intervention.ownerActorId) ?? null;
  const holder = view.responsibility.find(step => step.state === "review" || step.state === "blocked" || step.state === "executing") ?? view.responsibility.at(-1);
  const primary = view.evidence.find((artifact) => artifact.primary) ?? null;
  const blockedReason = options.blockedReason ?? view.decision.blockedReason;

  const approve = el(
    "button",
    {
      type: "button",
      class: "rf-decision-approve",
      disabled: blockedReason === null && !options.submitting ? null : true,
      "aria-busy": options.submitting ? "true" : null,
    },
    el("span", { class: "rf-review-glyph", "aria-hidden": "true" }),
    options.submitting ? relayText("sending") : relayText("approveHandoff"),
  );
  approve.addEventListener("click", options.onApprove);

  const revise = el(
    "button",
    {
      type: "button",
      class: "rf-secondary-button",
      "aria-expanded": options.revisionOpen ? "true" : "false",
      disabled: options.submitting ? true : null,
    },
    relayText("requestRevision"),
  );
  revise.addEventListener("click", options.onOpenRevision);

  /* Revision reason. The field is required, and its text travels only as the
   * `note` field of the Handoff request — never to a URL, log or analytics. */
  const reasonField = el("textarea", {
    class: "rf-revision-input",
    id: "rf-revision-reason",
    rows: 3,
    disabled: options.submitting,
    maxlength: 500,
    placeholder: relayText("revisionPlaceholder"),
    "aria-invalid": options.revisionError === null ? null : "true",
    "aria-describedby": options.revisionError === null ? null : "rf-revision-error",
  }) as HTMLTextAreaElement;
  reasonField.value = options.revisionReason;
  reasonField.addEventListener("input", () => options.onRevisionInput(reasonField.value));

  const submitRevision = el(
    "button",
    {
      type: "button",
      class: "rf-revision-submit",
      disabled: options.submitting || blockedReason !== null ? true : null,
      "aria-busy": options.submitting ? "true" : null,
    },
    options.submitting ? relayText("sending") : relayText("sendRevision"),
  );
  submitRevision.addEventListener("click", options.onSubmitRevision);

  const cancelRevision = el("button", { type: "button", class: "rf-secondary-button", disabled: options.submitting }, relayText("dialogCancel"));
  cancelRevision.addEventListener("click", options.onCancelRevision);

  const revisionPanel = el(
    "div",
    { class: "rf-revision" },
    el("label", { class: "rf-revision-label", for: "rf-revision-reason" }, relayText("revisionContent")),
    reasonField,
    el(
      "p",
      { class: "rf-revision-impact" },
      relayText("revisionImpact").replace("{ref}", view.ref).replace("{actor}", actors.get(holder?.actorId ?? "")?.name ?? relayText("unassigned")),
    ),
    options.revisionError === null
      ? null
      : el("p", { class: "rf-revision-error", id: "rf-revision-error", role: "alert" }, options.revisionError),
    el("div", { class: "rf-decision-actions" }, submitRevision, cancelRevision),
  );

  const taskFooter = el(
    "footer",
    { class: "rf-decision", "data-phase": options.submitting ? "submitting" : "idle" },
    el("div", { class: "rf-decision-head" },
      el("h3", { class: "rf-region-label" }, relayText("taskActions")),
      el("span", { class: "rf-decision-info", "aria-hidden": "true" }),
    ),
    el("p", { class: "rf-decision-status" }, options.questActions.statusLabel),
    options.resultTone === null && !options.submitting ? null : el("p", {
      class: "rf-decision-result", "data-tone": options.resultTone,
      role: options.resultTone === "error" ? "alert" : "status",
    }, options.resultMessage),
    el("div", { class: "rf-decision-actions rf-task-actions" },
      ...options.questActions.actions.map((action, index) => {
        const button = el("button", {
          type: "button",
          class: index === 0 ? "rf-decision-approve" : "rf-secondary-button",
          disabled: options.submitting || options.writeLocked ? true : null,
          "data-quest-action": action,
        }, questActionLabel(action));
        button.addEventListener("click", () => options.onQuestAction(action));
        return button;
      }),
    ),
    options.writeLocked ? el("p", { class: "rf-decision-blocked", role: "status" }, relayText("writePaused")) : null,
  );
  return el(
    "aside",
    { class: "rf-lens", "data-state": options.state, "aria-label": relayText("commandLens") },
    header,
    el(
      "div",
      { class: "rf-lens-body" },
      section(
        relayText("commandReason"),
        el("p", { class: "rf-lens-reason" }, view.reason),
        el(
          "p",
          { class: "rf-lens-age" },
          intervention === null
            ? `${t("task.assignee")}: ${actors.get(holder?.actorId ?? "")?.name ?? relayText("unassigned")}`
            : `${relayText("held")} ${formatWaiting(intervention.waitingMinutes)} · ${t("task.assignee")}: ${owner?.name ?? relayText("unassigned")}`,
        ),
      ),
      section(
        relayText("commandAffected"),
        el("p", { class: "rf-lens-ref" }, view.ref),
        el("p", { class: "rf-lens-object-title" }, view.title),
        el("p", { class: "rf-lens-state" }, intervention === null ? view.reason : intervention.reason),
        intervention !== null && intervention.affectedCount > 1
          ? el("p", { class: "rf-lens-scope" }, relayText("commandSameBlocker").replace("{count}", countLabel(intervention.affectedCount)))
          : null,
      ),
      section("Relay", lensRelay(view, actors)),
      section(
        relayText("evidence"),
        primary === null
          ? el("p", { class: "rf-lens-state" }, relayText("evidenceMissing"))
          : el(
            "dl",
            { class: "rf-evidence" },
            el("dt", { class: "rf-evidence-label" }, relayText("commandArtifacts")),
            el("dd", { class: "rf-evidence-value", "data-operational": "true" }, primary.name),
            el("dt", { class: "rf-evidence-label" }, relayText("commandChanged")),
            el("dd", { class: "rf-evidence-value", "data-operational": "true" }, primary.summary),
            el("dt", { class: "rf-evidence-label" }, relayText("battleExecution")),
            el("dd", { class: "rf-evidence-value", "data-operational": "true" }, view.details.headline),
            el("dt", { class: "rf-evidence-label" }, relayText("commandChecks")),
            el(
              "dd",
              { class: "rf-evidence-value", "data-operational": "true" },
              primary.verified === null ? relayText("commandUnverified") : primary.verifiedLabel,
            ),
          ),
      ),
    ),
    options.questActions.mode !== "handoff-decision" ? taskFooter : el(
      "footer",
      { class: "rf-decision", "data-phase": options.submitting ? "submitting" : "idle" },
      el(
        "div",
        { class: "rf-decision-head" },
        el("h3", { class: "rf-region-label" }, relayText("decisionTitle")),
        el("span", { class: "rf-decision-info", "aria-hidden": "true" }),
      ),
      el("p", { class: "rf-decision-status" }, relayText("humanDecision")),
      externalCheck(options.externalChecked === true, options.submitting || options.writeLocked, options.onExternalChecked),
      // Verification summary only appears when a real Evidence result says so.
      blockedReason === null && options.verification !== null
        ? el("p", { class: "rf-decision-verified" }, options.verification)
        : null,
      blockedReason === null
        ? null
        : el("p", { class: "rf-decision-blocked", role: "status" }, blockedReason),
      options.resultTone === null
        ? null
        : el(
          "p",
          {
            class: "rf-decision-result",
            "data-tone": options.resultTone,
            role: options.resultTone === "error" ? "alert" : "status",
          },
          options.resultMessage,
        ),
      options.revisionOpen
        ? revisionPanel
        : el("div", { class: "rf-decision-actions" }, approve, revise),
      options.revisionOpen ? null : el("p", { class: "rf-decision-impact" }, relayText("handoffApprovalImpact")),
      primary === null || primary.verified !== false
        ? null
        : el("p", { class: "rf-decision-impact" }, relayText("commandVerificationFailed")),
    ),
  );
}
