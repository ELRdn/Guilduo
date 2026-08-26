/**
 * Selected Quest workspace — NEWDESIGNv2.md section 6, plus brief items A3-A5.
 *
 * The centre region is the star of Command. Reading order is fixed:
 *
 *   state + Quest ID → title → intervention reason → Review output
 *   → Responsibility Relay → Details / Evidence Summary → Evidence preview
 *
 * Role split (A4). The centre is where output is *inspected*:
 *
 *   `Review output`     opens the Primary Evidence preview here
 *   `Request revision`  moves focus to the Lens decision control; it does not
 *                       run a second copy of the revision command
 *   `Approve handoff`   exists only in the Lens Decision Bar
 *
 * Header (A3). The header is a sibling of the scrolling region, never inside
 * it, so the Quest title cannot be clipped by an inherited scroll offset. Only
 * `.rf-selected-scroll` scrolls, and the shell resets it on selection change.
 */

import {
  type Actor,
  type EvidenceArtifact,
  type EvidencePreview,
  type ResponsibilityStep,
  type SelectedQuestView,
} from "../model.ts";
import { actorAvatar } from "./avatar.ts";
import { el, svg } from "./dom.ts";

export interface SelectedQuestOptions {
  readonly writeLocked: boolean;
  /** Artifact whose preview is open, or `null` while the preview is closed. */
  readonly previewArtifactId: string | null;
  readonly onReviewOutput: (artifactId: string) => void;
  readonly onClosePreview: () => void;
  readonly onRequestRevision: () => void;
}

/* ------------------------------------------------------------------ *
 * Responsibility Relay
 * ------------------------------------------------------------------ */

/** Arrow between two Actor steps. Geometry only; state lives on the nodes. */
function relayArrow(state: ResponsibilityStep["state"]): HTMLElement {
  return el(
    "span",
    { class: "rf-resp-arrow", "data-state": state, "aria-hidden": "true" },
    svg(
      "svg",
      { viewBox: "0 0 32 12", class: "rf-resp-arrow-shape", focusable: "false" },
      svg("path", { d: "M0 6 H24", class: "rf-resp-arrow-line" }),
      svg("path", { d: "M22 2 L27 6 L22 10", class: "rf-resp-arrow-head", fill: "none" }),
    ),
  );
}

const NODE_STATE: Readonly<Record<ResponsibilityStep["state"], "completed" | "current" | "review" | "blocked" | "idle">> = {
  completed: "completed",
  executing: "current",
  review: "review",
  blocked: "blocked",
  pending: "idle",
};

function responsibilityStep(
  step: ResponsibilityStep,
  actors: ReadonlyMap<string, Actor>,
): HTMLElement {
  const actor = actors.get(step.actorId);
  const isHalt = step.state === "review" || step.state === "blocked";
  return el(
    "div",
    { class: "rf-resp-step", "data-state": step.state, "data-halt": isHalt ? "true" : "false" },
    el(
      "span",
      { class: "rf-resp-portrait" },
      actor === undefined ? null : actorAvatar(actor, { size: "relay", state: NODE_STATE[step.state] }),
    ),
    el(
      "span",
      { class: "rf-resp-copy" },
      el("span", { class: "rf-resp-name" }, actor?.name ?? "—"),
      el("span", { class: "rf-resp-role" }, step.roleLabel),
      el("span", { class: "rf-resp-state" }, step.stateLabel),
      el("span", { class: "rf-resp-time" }, step.timeLabel),
    ),
  );
}

function responsibilityRelay(
  steps: readonly ResponsibilityStep[],
  actors: ReadonlyMap<string, Actor>,
): HTMLElement {
  const parts: HTMLElement[] = [];
  steps.forEach((step, index) => {
    parts.push(responsibilityStep(step, actors));
    if (index < steps.length - 1) parts.push(relayArrow(steps[index + 1].state));
  });
  return el(
    "section",
    { class: "rf-resp", "aria-label": "Responsibility relay" },
    el("h3", { class: "rf-region-label" }, "Responsibility"),
    el("div", { class: "rf-resp-track" }, ...parts),
  );
}

/* ------------------------------------------------------------------ *
 * Evidence rows and preview
 * ------------------------------------------------------------------ */

function evidenceRow(
  artifact: EvidenceArtifact,
  options: SelectedQuestOptions,
): HTMLElement {
  const open = options.previewArtifactId === artifact.id;
  const row = el(
    "button",
    {
      type: "button",
      class: "rf-evidence-row",
      "data-primary": artifact.primary ? "true" : "false",
      "data-open": open ? "true" : "false",
      "aria-expanded": artifact.preview === undefined ? null : open ? "true" : "false",
      "data-artifact-id": artifact.id,
    },
    el("span", { class: "rf-evidence-icon", "aria-hidden": "true" }),
    artifact.primary ? el("span", { class: "rf-evidence-badge" }, "PRIMARY") : null,
    el("span", { class: "rf-evidence-name" }, artifact.name),
    el("span", { class: "rf-evidence-summary" }, artifact.summary),
    // Verification is rendered only from a real result (v2 section 6.4).
    artifact.verified === null
      ? null
      : el(
        "span",
        { class: "rf-evidence-verified", "data-ok": artifact.verified ? "true" : "false" },
        artifact.verifiedLabel,
      ),
    el("span", { class: "rf-evidence-time" }, artifact.timeLabel),
  );
  row.addEventListener("click", () => {
    if (artifact.preview === undefined) return;
    if (open) options.onClosePreview();
    else options.onReviewOutput(artifact.id);
  });
  return row;
}

type EvidenceChange = EvidencePreview["changed"][number];

const CHANGE_LABEL: Readonly<Record<EvidenceChange["kind"], string>> = {
  added: "追加",
  changed: "変更",
  removed: "削除",
};

/**
 * The decision-grade preview: what changed, what was checked, and what the
 * decision propagates to. An `unavailable` verdict states the reason instead of
 * dressing a missing result up as a pass (A5).
 */
function evidencePreview(
  artifact: EvidenceArtifact,
  preview: EvidencePreview,
  options: SelectedQuestOptions,
): HTMLElement {
  const close = el(
    "button",
    { type: "button", class: "rf-quiet-button rf-preview-close" },
    "Close preview",
  );
  close.addEventListener("click", options.onClosePreview);

  return el(
    "section",
    {
      class: "rf-preview",
      "data-verdict": preview.verdict,
      "aria-label": `Output preview ${artifact.name}`,
    },
    el(
      "header",
      { class: "rf-preview-header" },
      el("h3", { class: "rf-region-label" }, "Output preview"),
      el("span", { class: "rf-preview-artifact" }, artifact.name),
      el("span", { class: "rf-preview-verdict", "data-verdict": preview.verdict }, preview.verdictLabel),
      close,
    ),
    preview.verdict === "unavailable"
      ? el("p", { class: "rf-preview-unavailable", role: "status" }, preview.unavailableReason)
      : null,
    el(
      "div",
      { class: "rf-preview-body" },
      el(
        "div",
        { class: "rf-preview-column" },
        el("p", { class: "rf-details-sub" }, "変更された field"),
        preview.changed.length === 0
          ? el("p", { class: "rf-preview-empty" }, "差分はありません")
          : el(
            "ul",
            { class: "rf-preview-changes" },
            ...preview.changed.map((change) => el(
              "li",
              { class: "rf-preview-change", "data-kind": change.kind },
              el("span", { class: "rf-preview-change-kind" }, CHANGE_LABEL[change.kind]),
              el("span", { class: "rf-preview-change-path" }, change.path),
              el("span", { class: "rf-preview-change-detail" }, change.detail),
            )),
          ),
      ),
      el(
        "div",
        { class: "rf-preview-column" },
        el("p", { class: "rf-details-sub" }, "検証結果"),
        el(
          "ul",
          { class: "rf-preview-checks" },
          ...preview.checks.map((check) => el(
            "li",
            {
              class: "rf-preview-check",
              "data-passed": check.passed === null ? "unknown" : check.passed ? "true" : "false",
            },
            el("span", { class: "rf-preview-check-mark", "aria-hidden": "true" }),
            el("span", { class: "rf-preview-check-label" }, check.label),
            el("span", { class: "rf-preview-check-result" }, check.result),
          )),
        ),
        el("p", { class: "rf-details-sub" }, "影響と互換性"),
        el(
          "p",
          { class: "rf-preview-affected" },
          preview.affected.length === 0
            ? "影響を受ける Quest はありません"
            : `${preview.affected.join(", ")} が待機中`,
        ),
        el("p", { class: "rf-preview-compat" }, preview.compatibility),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

export function selectedQuestWorkspace(
  view: SelectedQuestView,
  actors: ReadonlyMap<string, Actor>,
  options: SelectedQuestOptions,
): HTMLElement {
  const primary = view.evidence.find((artifact) => artifact.primary) ?? null;
  const previewArtifact = options.previewArtifactId === null
    ? null
    : view.evidence.find((artifact) => artifact.id === options.previewArtifactId) ?? null;

  const reviewOutput = el(
    "button",
    {
      type: "button",
      class: "rf-review-button",
      "aria-expanded": previewArtifact !== null ? "true" : "false",
      disabled: primary === null || primary.preview === undefined ? true : null,
    },
    el("span", { class: "rf-review-glyph", "aria-hidden": "true" }),
    "Review output",
  );
  reviewOutput.addEventListener("click", () => {
    if (primary === null || primary.preview === undefined) return;
    if (previewArtifact !== null) options.onClosePreview();
    else options.onReviewOutput(primary.id);
  });

  const requestRevision = el(
    "button",
    { type: "button", class: "rf-secondary-button" },
    "Request revision",
  );
  requestRevision.addEventListener("click", options.onRequestRevision);

  const header = el(
    "header",
    { class: "rf-selected-header" },
    el(
      "div",
      { class: "rf-selected-eyebrow" },
      el("span", { class: "rf-selected-state", "data-kind": view.stateKind }, view.stateLabel),
      el("span", { class: "rf-selected-ref" }, view.ref),
    ),
    el(
      "div",
      { class: "rf-selected-title-row" },
      el("h2", { class: "rf-selected-title" }, view.title),
      el(
        "div",
        { class: "rf-selected-actions" },
        reviewOutput,
        requestRevision,
        el(
          "button",
          { type: "button", class: "rf-icon-button", title: "More actions" },
          el("span", { class: "rf-visually-hidden" }, "More actions"),
          el("span", { class: "rf-overflow-mark", "aria-hidden": "true" }),
        ),
      ),
    ),
    el("p", { class: "rf-selected-reason" }, `理由: ${view.reason}`),
  );

  const details = el(
    "section",
    { class: "rf-details", "aria-label": "Details" },
    el("h3", { class: "rf-region-label" }, "Details"),
    el("p", { class: "rf-details-headline" }, view.details.headline),
    el("p", { class: "rf-details-sub" }, "差分の要点"),
    el(
      "ul",
      { class: "rf-details-list" },
      ...view.details.points.map((point) => el("li", { class: "rf-details-point" }, point)),
    ),
    view.details.outputs.length === 0
      ? null
      : el(
        "div",
        { class: "rf-details-outputs" },
        el("p", { class: "rf-details-sub" }, "出力アーティファクト"),
        ...view.details.outputs.map((artifact) => evidenceRow(artifact, options)),
      ),
  );

  const evidence = el(
    "section",
    { class: "rf-evidence-summary", "aria-label": "Evidence summary" },
    el("h3", { class: "rf-region-label" }, "Evidence Summary"),
    el("p", { class: "rf-details-headline" }, view.evidenceHeadline),
    el(
      "ul",
      { class: "rf-details-list" },
      ...view.evidencePoints.map((point) => el("li", { class: "rf-details-point" }, point)),
    ),
    el("p", { class: "rf-details-sub" }, "出力テスト結果"),
    el(
      "div",
      { class: "rf-evidence-list" },
      ...view.evidence.map((artifact) => evidenceRow(artifact, options)),
    ),
  );

  return el(
    "section",
    { class: "rf-selected", "aria-label": `Selected Quest ${view.ref}` },
    header,
    // A3: the only scrolling region, kept as a sibling of the header so the
    // title can never be clipped by an inherited scroll offset.
    el(
      "div",
      { class: "rf-selected-scroll" },
      responsibilityRelay(view.responsibility, actors),
      el("div", { class: "rf-selected-lower" }, details, evidence),
      previewArtifact === null || previewArtifact.preview === undefined
        ? null
        : evidencePreview(previewArtifact, previewArtifact.preview, options),
    ),
  );
}
