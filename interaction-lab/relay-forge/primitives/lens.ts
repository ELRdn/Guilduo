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

export type LensState = "closed" | "peek" | "open" | "pinned";

export interface LensContent {
  /** `null` when the selected Quest is not queued for intervention. */
  readonly intervention: Intervention | null;
  readonly view: SelectedQuestView;
}

export interface LensOptions {
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
    el("p", { class: "rf-region-label" }, "Intervention Lens"),
    el(
      "div",
      { class: "rf-lens-controls" },
      (() => {
        const pin = el(
          "button",
          {
            type: "button",
            class: "rf-icon-button",
            "aria-pressed": options.state === "pinned" ? "true" : "false",
            title: options.state === "pinned" ? "Unpin Lens" : "Pin Lens",
          },
          el("span", { class: "rf-visually-hidden" }, options.state === "pinned" ? "Unpin Lens" : "Pin Lens"),
          el("span", { class: "rf-pin-mark", "aria-hidden": "true" }),
        );
        pin.addEventListener("click", options.onTogglePin);
        return pin;
      })(),
      (() => {
        const close = el(
          "button",
          { type: "button", class: "rf-icon-button", title: "Close Lens" },
          el("span", { class: "rf-visually-hidden" }, "Close Lens"),
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
      { class: "rf-lens", "data-state": options.state, "aria-label": "Intervention Lens" },
      header,
      el(
        "div",
        { class: "rf-lens-body" },
        el(
          "div",
          { class: "rf-state rf-state--empty", role: "status" },
          el("p", { class: "rf-state-title" }, "介入対象が選択されていません"),
          el("p", { class: "rf-state-body" }, "Attention Shelf または Quest Loom の行を選ぶと、判断に必要な理由と証拠がここに集まります。"),
        ),
      ),
    );
  }

  const { intervention, view } = content;
  const owner = intervention === null ? null : actors.get(intervention.ownerActorId) ?? null;
  const holder = view.responsibility[view.responsibility.length - 1];
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
    options.submitting ? "送信中…" : view.decision.approveLabel,
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
    view.decision.reviseLabel,
  );
  revise.addEventListener("click", options.onOpenRevision);

  /* Revision reason. The field is required, and its text travels only as the
   * `note` field of the Handoff request — never to a URL, log or analytics. */
  const reasonField = el("textarea", {
    class: "rf-revision-input",
    id: "rf-revision-reason",
    rows: 3,
    maxlength: 500,
    placeholder: "どこを修正してほしいかを書いてください",
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
      disabled: options.submitting ? true : null,
      "aria-busy": options.submitting ? "true" : null,
    },
    options.submitting ? "送信中…" : "Send revision request",
  );
  submitRevision.addEventListener("click", options.onSubmitRevision);

  const cancelRevision = el("button", { type: "button", class: "rf-secondary-button" }, "Cancel");
  cancelRevision.addEventListener("click", options.onCancelRevision);

  const revisionPanel = el(
    "div",
    { class: "rf-revision" },
    el("label", { class: "rf-revision-label", for: "rf-revision-reason" }, "修正内容"),
    reasonField,
    el(
      "p",
      { class: "rf-revision-impact" },
      `${view.ref} は ${actors.get(holder?.actorId ?? "")?.name ?? "担当"} へ差し戻され、実行中状態に戻ります`,
    ),
    options.revisionError === null
      ? null
      : el("p", { class: "rf-revision-error", id: "rf-revision-error", role: "alert" }, options.revisionError),
    el("div", { class: "rf-decision-actions" }, submitRevision, cancelRevision),
  );

  return el(
    "aside",
    { class: "rf-lens", "data-state": options.state, "aria-label": "Intervention Lens" },
    header,
    el(
      "div",
      { class: "rf-lens-body" },
      section(
        "Why",
        el("p", { class: "rf-lens-reason" }, view.reason),
        el(
          "p",
          { class: "rf-lens-age" },
          intervention === null
            ? `担当 ${actors.get(holder?.actorId ?? "")?.name ?? "未割当"}`
            : `${formatWaiting(intervention.waitingMinutes)} 待機 · 担当 ${owner?.name ?? "未割当"}`,
        ),
      ),
      section(
        "Affected Quest",
        el("p", { class: "rf-lens-ref" }, view.ref),
        el("p", { class: "rf-lens-object-title" }, view.title),
        el("p", { class: "rf-lens-state" }, intervention === null ? view.reason : intervention.reason),
        intervention !== null && intervention.affectedCount > 1
          ? el("p", { class: "rf-lens-scope" }, `同じ原因で ${intervention.affectedCount} 件が停止しています`)
          : null,
      ),
      section("Relay", lensRelay(view, actors)),
      section(
        "Evidence",
        primary === null
          ? el("p", { class: "rf-lens-state" }, "Evidence を取得できません")
          : el(
            "dl",
            { class: "rf-evidence" },
            el("dt", { class: "rf-evidence-label" }, "Artifact"),
            el("dd", { class: "rf-evidence-value", "data-operational": "true" }, primary.name),
            el("dt", { class: "rf-evidence-label" }, "変更"),
            el("dd", { class: "rf-evidence-value", "data-operational": "true" }, primary.summary),
            el("dt", { class: "rf-evidence-label" }, "実行"),
            el("dd", { class: "rf-evidence-value", "data-operational": "true" }, view.details.headline),
            el("dt", { class: "rf-evidence-label" }, "検証"),
            el(
              "dd",
              { class: "rf-evidence-value", "data-operational": "true" },
              primary.verified === null ? "未検証" : primary.verifiedLabel,
            ),
          ),
      ),
    ),
    el(
      "footer",
      { class: "rf-decision", "data-phase": options.submitting ? "submitting" : "idle" },
      el(
        "div",
        { class: "rf-decision-head" },
        el("h3", { class: "rf-region-label" }, "Decision"),
        el("span", { class: "rf-decision-info", "aria-hidden": "true" }),
      ),
      el("p", { class: "rf-decision-status" }, view.decision.statusLabel),
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
      options.revisionOpen ? null : el("p", { class: "rf-decision-impact" }, view.decision.impactLabel),
      primary === null || primary.verified !== false
        ? null
        : el("p", { class: "rf-decision-impact" }, "Evidence を検証できていません"),
    ),
  );
}
