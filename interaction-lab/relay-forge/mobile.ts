/**
 * Command Mobile — a re-composition for 390x844, not a shrunken desktop.
 *
 * Desktop puts the decision in a right-hand Lens beside the workspace. At
 * 390px there is no beside, so the same information is re-ordered down the
 * page and the decision is hoisted out of the Lens into a bar fixed above the
 * bottom navigation (brief B2):
 *
 *   Command header  (attention count + sync, not the four-slot Capacity Band)
 *   Attention Shelf (snap carousel with prev/next controls, not swipe-only)
 *   Selected Quest  (state, ID, title, why, holder, Review output)
 *   Responsibility  (vertical Human -> Agent -> Human Review)
 *   Primary Evidence(one emphasised, supporting behind an accordion)
 *   Chronicle       (collapsed summary)
 *   Decision Bar    (fixed; Approve handoff / Request revision / reason)
 *
 * Quest Loom is not on this page. It opens as a modal bottom sheet from
 * `Quest flow`, so周辺Quest and dependency stay one tap away without competing
 * with the single decision the screen exists for.
 */

import {
  type Actor,
  type CommandModel,
  type EvidenceArtifact,
  formatWaiting,
  type Intervention,
  type SelectedQuestView,
} from "./model.ts";
import { actorAvatar } from "./primitives/avatar.ts";
import { el } from "./primitives/dom.ts";
import type { QuestActionId, QuestActionState } from "./quest-actions.ts";

export interface MobileCallbacks {
  readonly onSelect: (questId: string, trigger: HTMLElement) => void;
  readonly onOpenQuestFlow: (trigger: HTMLElement) => void;
  readonly onToggleEvidence: () => void;
  readonly onToggleSupporting: () => void;
  readonly onToggleChronicle: () => void;
  readonly onApprove: () => void;
  readonly onRequestRevision: () => void;
  readonly onRevisionInput: (value: string) => void;
  readonly onSubmitRevision: () => void;
  readonly onCancelRevision: () => void;
  readonly onQuestAction: (action: QuestActionId) => void;
}

export interface MobileState {
  readonly model: CommandModel;
  readonly selectedQuestId: string | null;
  readonly view: SelectedQuestView | null;
  readonly intervention: Intervention | null;
  readonly questActions: QuestActionState;
  readonly evidenceOpen: boolean;
  readonly supportingOpen: boolean;
  readonly chronicleOpen: boolean;
  readonly writeLocked: boolean;
  /** `null` when the decision may run; otherwise the reason it may not. */
  readonly blockedReason: string | null;
  /** Short verification summary derived from the real Evidence result. */
  readonly verification: string | null;
  readonly revisionOpen: boolean;
  readonly revisionReason: string;
  readonly revisionError: string | null;
  readonly resultTone: "success" | "error" | null;
  readonly resultMessage: string;
  /** Set while a write is in flight; blocks a second submission. */
  readonly submitting: boolean;
  readonly permissionMissing: string | null;
  readonly conflict: string | null;
  readonly loading: boolean;
}

const SEVERITY_LABEL: Readonly<Record<Intervention["severity"], string>> = {
  blocked: "Blocked",
  review: "Review",
  waiting: "Waiting",
};

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function mobileHeader(state: MobileState): HTMLElement {
  const attention = state.model.interventions.length;
  return el(
    "header",
    { class: "rf-m-header" },
    el("h1", { class: "rf-m-title" }, "Command"),
    el(
      "div",
      { class: "rf-m-status" },
      el(
        "span",
        { class: "rf-m-attention" },
        el("span", { class: "rf-m-attention-count" }, String(attention)),
        el("span", { class: "rf-m-attention-label" }, "要判断"),
      ),
      el(
        "span",
        { class: "rf-m-sync", "data-state": state.writeLocked ? "stale" : state.model.syncState },
        state.writeLocked ? `Stale · ${state.model.lastSyncLabel}` : `Synced · ${state.model.lastSyncLabel}`,
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Attention Shelf carousel
 * ------------------------------------------------------------------ */

function mobileShelf(state: MobileState, callbacks: MobileCallbacks): HTMLElement {
  const ordered = [...state.model.interventions].sort((left, right) => {
    const rank: Record<Intervention["severity"], number> = { blocked: 0, review: 1, waiting: 2 };
    return rank[left.severity] - rank[right.severity];
  });

  const track = el(
    "ul",
    {
      class: "rf-m-shelf-track",
      role: "listbox",
      "aria-label": "Attention Shelf",
      "aria-activedescendant": state.selectedQuestId === null ? null : `rf-m-shelf-${state.selectedQuestId}`,
    },
    ...ordered.map((intervention) => {
      const owner = state.model.actors.get(intervention.ownerActorId);
      const selected = state.selectedQuestId === intervention.questId;
      const card = el(
        "button",
        {
          type: "button",
          class: "rf-m-shelf-card",
          role: "option",
          id: `rf-m-shelf-${intervention.questId}`,
          "data-severity": intervention.severity,
          "data-selected": selected ? "true" : "false",
          "aria-selected": selected ? "true" : "false",
          "data-quest-id": intervention.questId,
        },
        el(
          "span",
          { class: "rf-m-shelf-head" },
          el("span", { class: "rf-shelf-mark", "data-severity": intervention.severity, "aria-hidden": "true" }),
          el("span", { class: "rf-shelf-severity" }, SEVERITY_LABEL[intervention.severity]),
          selected ? el("span", { class: "rf-shelf-selected" }, "SELECTED") : null,
          el("span", { class: "rf-shelf-age" }, formatWaiting(intervention.waitingMinutes)),
        ),
        el("span", { class: "rf-m-shelf-reason" }, intervention.reason),
        el(
          "span",
          { class: "rf-m-shelf-foot" },
          owner === undefined ? null : actorAvatar(owner, { size: "row" }),
          el("span", { class: "rf-shelf-ref" }, intervention.questRef),
        ),
      );
      card.addEventListener("click", () => callbacks.onSelect(intervention.questId, card));
      return el("li", { class: "rf-m-shelf-item" }, card);
    }),
  );

  // Prev / next buttons so the carousel is operable without a swipe.
  const step = (direction: -1 | 1): void => {
    const cards = [...track.querySelectorAll<HTMLElement>(".rf-m-shelf-card")];
    const current = cards.findIndex((card) => card.dataset.selected === "true");
    const next = cards[Math.min(cards.length - 1, Math.max(0, current + direction))];
    next?.scrollIntoView({ inline: "center", block: "nearest" });
    next?.click();
  };
  const previous = el(
    "button",
    { type: "button", class: "rf-icon-button", title: "前の介入" },
    el("span", { class: "rf-visually-hidden" }, "前の介入"),
    el("span", { class: "rf-chevron-inline rf-m-prev", "aria-hidden": "true" }),
  );
  previous.addEventListener("click", () => step(-1));
  const forward = el(
    "button",
    { type: "button", class: "rf-icon-button", title: "次の介入" },
    el("span", { class: "rf-visually-hidden" }, "次の介入"),
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  forward.addEventListener("click", () => step(1));

  return el(
    "section",
    { class: "rf-m-shelf", "aria-label": "Attention Shelf" },
    el(
      "div",
      { class: "rf-m-section-head" },
      el("h2", { class: "rf-region-label" }, "Attention Shelf"),
      el("span", { class: "rf-region-count" }, `${state.model.interventions.length} interventions`),
      el("span", { class: "rf-m-shelf-controls" }, previous, forward),
    ),
    track,
  );
}

/* ------------------------------------------------------------------ *
 * Selected Quest, vertical Relay, Evidence
 * ------------------------------------------------------------------ */

function mobileSelected(
  view: SelectedQuestView,
  state: MobileState,
  callbacks: MobileCallbacks,
): HTMLElement {
  const holder = view.responsibility.find((step) => step.state === "review" || step.state === "blocked")
    ?? view.responsibility[view.responsibility.length - 1];
  const holderActor = state.model.actors.get(holder?.actorId ?? "");

  const questFlow = el(
    "button",
    { type: "button", class: "rf-secondary-button rf-m-questflow", "aria-haspopup": "dialog" },
    "Quest flow",
  );
  questFlow.addEventListener("click", () => callbacks.onOpenQuestFlow(questFlow));

  const reviewOutput = el(
    "button",
    { type: "button", class: "rf-review-button rf-m-review", "aria-expanded": state.evidenceOpen ? "true" : "false" },
    el("span", { class: "rf-review-glyph", "aria-hidden": "true" }),
    state.evidenceOpen ? "Hide output" : "Review output",
  );
  reviewOutput.addEventListener("click", callbacks.onToggleEvidence);

  return el(
    "section",
    { class: "rf-m-selected", "aria-label": `Selected Quest ${view.ref}` },
    el(
      "div",
      { class: "rf-selected-eyebrow" },
      el("span", { class: "rf-selected-state", "data-kind": view.stateKind }, view.stateLabel),
      el("span", { class: "rf-selected-ref" }, view.ref),
    ),
    el("h2", { class: "rf-m-quest-title" }, view.title),
    el("p", { class: "rf-m-reason" }, view.reason),
    el(
      "div",
      { class: "rf-m-holder" },
      holderActor === undefined ? null : actorAvatar(holderActor, { size: "shelf" }),
      el(
        "span",
        { class: "rf-m-holder-copy" },
        el("span", { class: "rf-m-holder-name" }, holderActor?.name ?? "未割当"),
        el("span", { class: "rf-m-holder-state" }, holder?.stateLabel ?? ""),
      ),
    ),
    el("div", { class: "rf-m-actions" }, reviewOutput, questFlow),
  );
}

function mobileRelay(view: SelectedQuestView, actors: ReadonlyMap<string, Actor>): HTMLElement {
  const NODE_STATE = {
    completed: "completed",
    executing: "current",
    review: "review",
    blocked: "blocked",
    pending: "idle",
  } as const;
  return el(
    "section",
    { class: "rf-m-relay", "aria-label": "Responsibility relay" },
    el("h2", { class: "rf-region-label" }, "Responsibility"),
    el(
      "ol",
      { class: "rf-m-relay-list" },
      ...view.responsibility.map((step) => {
        const actor = actors.get(step.actorId);
        return el(
          "li",
          { class: "rf-m-relay-step", "data-state": step.state },
          el("span", { class: "rf-m-relay-thread", "aria-hidden": "true" }),
          actor === undefined ? null : actorAvatar(actor, { size: "shelf", state: NODE_STATE[step.state] }),
          el(
            "span",
            { class: "rf-m-relay-copy" },
            el("span", { class: "rf-m-relay-name" }, actor?.name ?? "—"),
            el("span", { class: "rf-m-relay-role" }, step.roleLabel),
            el("span", { class: "rf-m-relay-state" }, step.stateLabel),
          ),
          el("span", { class: "rf-m-relay-time" }, step.timeLabel),
        );
      }),
    ),
  );
}

function evidenceLine(artifact: EvidenceArtifact): HTMLElement {
  return el(
    "li",
    { class: "rf-m-evidence-row", "data-primary": artifact.primary ? "true" : "false" },
    el("span", { class: "rf-evidence-name" }, artifact.name),
    el("span", { class: "rf-evidence-summary" }, artifact.summary),
    artifact.verified === null
      ? null
      : el(
        "span",
        { class: "rf-evidence-verified", "data-ok": artifact.verified ? "true" : "false" },
        artifact.verifiedLabel,
      ),
  );
}

function mobileEvidence(
  view: SelectedQuestView,
  state: MobileState,
  callbacks: MobileCallbacks,
): HTMLElement {
  const primary = view.evidence.find((artifact) => artifact.primary) ?? null;
  const supporting = view.evidence.filter((artifact) => !artifact.primary);
  const preview = primary?.preview;

  const supportingToggle = el(
    "button",
    {
      type: "button",
      class: "rf-quiet-button rf-m-supporting-toggle",
      "aria-expanded": state.supportingOpen ? "true" : "false",
      disabled: supporting.length === 0 ? true : null,
    },
    `Supporting evidence (${supporting.length})`,
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  supportingToggle.addEventListener("click", callbacks.onToggleSupporting);

  return el(
    "section",
    { class: "rf-m-evidence", "aria-label": "Primary evidence" },
    el("h2", { class: "rf-region-label" }, "Primary Evidence"),
    primary === null
      ? el("p", { class: "rf-m-evidence-empty" }, "この Quest に提出された成果物はまだありません")
      : el(
        "div",
        { class: "rf-m-evidence-primary", "data-verdict": preview?.verdict ?? "none" },
        el(
          "div",
          { class: "rf-m-evidence-head" },
          el("span", { class: "rf-evidence-badge" }, "PRIMARY"),
          el("span", { class: "rf-evidence-name" }, primary.name),
          primary.verified === null
            ? null
            : el(
              "span",
              { class: "rf-evidence-verified", "data-ok": primary.verified ? "true" : "false" },
              primary.verifiedLabel,
            ),
        ),
        el("p", { class: "rf-m-evidence-summary" }, primary.summary),
        preview === undefined
          ? null
          : el(
            "p",
            { class: "rf-preview-verdict", "data-verdict": preview.verdict },
            preview.verdict === "unavailable" ? preview.unavailableReason : preview.verdictLabel,
          ),
        // The expanded body is the same decision-grade content desktop shows.
        !state.evidenceOpen || preview === undefined
          ? null
          : el(
            "div",
            { class: "rf-m-evidence-detail" },
            el("p", { class: "rf-details-sub" }, "変更された field"),
            preview.changed.length === 0
              ? el("p", { class: "rf-preview-empty" }, "差分はありません")
              : el(
                "ul",
                { class: "rf-preview-changes" },
                ...preview.changed.map((change) => el(
                  "li",
                  { class: "rf-preview-change", "data-kind": change.kind },
                  el("span", { class: "rf-preview-change-path" }, change.path),
                  el("span", { class: "rf-preview-change-detail" }, change.detail),
                )),
              ),
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
            el("p", { class: "rf-preview-affected" }, preview.affected.length === 0
              ? "影響を受ける Quest はありません"
              : `${preview.affected.join(", ")} が待機中`),
          ),
      ),
    supportingToggle,
    state.supportingOpen && supporting.length > 0
      ? el("ul", { class: "rf-m-evidence-list" }, ...supporting.map(evidenceLine))
      : null,
  );
}

function mobileChronicle(state: MobileState, callbacks: MobileCallbacks): HTMLElement {
  const latest = state.model.chronicle[0];
  const actor = latest === undefined ? undefined : state.model.actors.get(latest.actorId);
  const toggle = el(
    "button",
    {
      type: "button",
      class: "rf-quiet-button rf-m-chronicle-toggle",
      "aria-expanded": state.chronicleOpen ? "true" : "false",
    },
    state.chronicleOpen ? "Hide history" : "View history",
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  toggle.addEventListener("click", callbacks.onToggleChronicle);

  return el(
    "section",
    { class: "rf-m-chronicle", "aria-label": "Execution Chronicle" },
    el(
      "div",
      { class: "rf-m-section-head" },
      el("h2", { class: "rf-region-label" }, "Execution Chronicle"),
      toggle,
    ),
    latest === undefined
      ? el("p", { class: "rf-m-evidence-empty" }, "履歴はまだありません")
      : el(
        "div",
        { class: "rf-m-chronicle-latest" },
        actor === undefined ? null : actorAvatar(actor, { size: "row" }),
        el("span", { class: "rf-chronicle-time" }, latest.timeLabel),
        el(
          "span",
          { class: "rf-chronicle-sentence" },
          el("b", { class: "rf-chronicle-name" }, actor?.name ?? "Unknown"),
          el("span", { class: "rf-chronicle-verb" }, ` ${latest.verb} `),
          el("span", { class: "rf-chronicle-object" }, latest.object),
        ),
      ),
    state.chronicleOpen
      ? el(
        "ol",
        { class: "rf-m-chronicle-list" },
        ...state.model.chronicle.slice(1, 7).map((event) => {
          const eventActor = state.model.actors.get(event.actorId);
          return el(
            "li",
            { class: "rf-m-chronicle-item", "data-kind": event.kind },
            eventActor === undefined ? null : actorAvatar(eventActor, { size: "row" }),
            el("span", { class: "rf-chronicle-time" }, event.timeLabel),
            el("span", { class: "rf-chronicle-sentence" }, `${eventActor?.name ?? ""} ${event.verb} ${event.object}`),
          );
        }),
      )
      : null,
  );
}

/* ------------------------------------------------------------------ *
 * Decision Bar
 * ------------------------------------------------------------------ */

/**
 * Fixed above the bottom navigation, inside the safe area. Approval is blocked
 * whenever the domain says it must be, and the reason is always visible rather
 * than left as a silent disabled control.
 */
/**
 * Decision Bar. Two shapes, so judged and not-yet-judgeable are distinguishable
 * by form and not only by a disabled colour (brief 1.3):
 *
 *   compact  evidence not reviewed — one line plus a jump to Review output
 *   ready    evidence reviewed — verification summary plus both actions
 *   revision reason field, impact line, send / cancel
 */
export function mobileDecisionBar(
  view: SelectedQuestView | null,
  state: MobileState,
  callbacks: MobileCallbacks,
): HTMLElement {
  if (view === null) {
    return el(
      "div",
      { class: "rf-m-decision", "data-shape": "compact", role: "region", "aria-label": "Decision" },
      el("p", { class: "rf-decision-status" }, "Quest を選択してください"),
    );
  }

  const reason = state.blockedReason ?? view.decision.blockedReason;
  const result = state.resultTone === null
    ? null
    : el(
      "p",
      {
        class: "rf-decision-result",
        "data-tone": state.resultTone,
        role: state.resultTone === "error" ? "alert" : "status",
      },
      state.resultMessage,
    );

  if (state.questActions.mode !== "handoff-decision") {
    const labels: Readonly<Record<QuestActionId, string>> = {
      start: "Start Quest", edit: "Edit", complete: "Complete", stop: "Stop", archive: "Archive",
    };
    const buttons = state.questActions.actions.map((action, index) => {
      const button = el("button", {
        type: "button",
        class: index === 0 ? "rf-decision-approve" : "rf-secondary-button",
        disabled: state.submitting || state.writeLocked ? true : null,
        "data-quest-action": action,
      }, labels[action]);
      button.addEventListener("click", () => callbacks.onQuestAction(action));
      return button;
    });
    return el(
      "div",
      { class: "rf-m-decision", "data-shape": buttons.length > 0 ? "ready" : "compact", role: "region", "aria-label": "Task actions" },
      el("div", { class: "rf-m-decision-copy" }, el("p", { class: "rf-decision-status" }, state.questActions.statusLabel)),
      result,
      buttons.length === 0 ? null : el("div", { class: "rf-decision-actions rf-task-actions" }, ...buttons),
    );
  }
  if (state.revisionOpen) {
    const field = el("textarea", {
      class: "rf-revision-input",
      id: "rf-m-revision-reason",
      rows: 2,
      maxlength: 500,
      placeholder: "どこを修正してほしいかを書いてください",
      "aria-invalid": state.revisionError === null ? null : "true",
      "aria-describedby": state.revisionError === null ? null : "rf-m-revision-error",
    }) as HTMLTextAreaElement;
    field.value = state.revisionReason;
    field.addEventListener("input", () => callbacks.onRevisionInput(field.value));

    const send = el(
      "button",
      {
        type: "button",
        class: "rf-revision-submit",
        disabled: state.submitting ? true : null,
        "aria-busy": state.submitting ? "true" : null,
      },
      state.submitting ? "送信中…" : "Send revision request",
    );
    send.addEventListener("click", callbacks.onSubmitRevision);

    const cancel = el("button", { type: "button", class: "rf-secondary-button" }, "Cancel");
    cancel.addEventListener("click", callbacks.onCancelRevision);

    return el(
      "div",
      { class: "rf-m-decision", "data-shape": "revision", role: "region", "aria-label": "Decision" },
      el("label", { class: "rf-revision-label", for: "rf-m-revision-reason" }, "修正内容"),
      field,
      state.revisionError === null
        ? null
        : el("p", { class: "rf-revision-error", id: "rf-m-revision-error", role: "alert" }, state.revisionError),
      result,
      el("div", { class: "rf-decision-actions" }, send, cancel),
    );
  }

  // Compact: the decision is not yet available, so the bar stays one line and
  // points at what unblocks it instead of occupying the viewport.
  if (reason !== null) {
    const jump = el(
      "button",
      { type: "button", class: "rf-quiet-button rf-m-decision-jump" },
      state.evidenceOpen ? "Evidence へ移動" : "Review output",
    );
    jump.addEventListener("click", callbacks.onToggleEvidence);
    return el(
      "div",
      { class: "rf-m-decision", "data-shape": "compact", role: "region", "aria-label": "Decision" },
      el(
        "div",
        { class: "rf-m-decision-copy" },
        el("p", { class: "rf-decision-status" }, view.decision.statusLabel),
        el("p", { class: "rf-decision-blocked", role: "status" }, reason),
      ),
      result,
      jump,
    );
  }

  const approve = el(
    "button",
    {
      type: "button",
      class: "rf-decision-approve",
      disabled: state.submitting ? true : null,
      "aria-busy": state.submitting ? "true" : null,
    },
    el("span", { class: "rf-review-glyph", "aria-hidden": "true" }),
    state.submitting ? "送信中…" : view.decision.approveLabel,
  );
  approve.addEventListener("click", callbacks.onApprove);

  const revise = el(
    "button",
    { type: "button", class: "rf-secondary-button", disabled: state.submitting ? true : null },
    view.decision.reviseLabel,
  );
  revise.addEventListener("click", callbacks.onRequestRevision);

  return el(
    "div",
    { class: "rf-m-decision", "data-shape": "ready", role: "region", "aria-label": "Decision" },
    el(
      "div",
      { class: "rf-m-decision-copy" },
      el("p", { class: "rf-decision-status" }, view.decision.statusLabel),
      state.verification === null
        ? el("p", { class: "rf-decision-impact" }, view.decision.impactLabel)
        : el("p", { class: "rf-decision-verified" }, state.verification),
    ),
    result,
    el("div", { class: "rf-decision-actions" }, approve, revise),
  );
}

/* ------------------------------------------------------------------ *
 * Page composition
 * ------------------------------------------------------------------ */

export function mobileCommand(state: MobileState, callbacks: MobileCallbacks): HTMLElement {
  const body: (HTMLElement | null)[] = [mobileHeader(state), mobileShelf(state, callbacks)];

  if (state.loading) {
    body.push(el(
      "section",
      { class: "rf-m-selected", "aria-busy": "true" },
      el("div", { class: "rf-skeleton", "data-variant": "queue", "aria-hidden": "true" },
        el("span", { class: "rf-skeleton-row" }),
        el("span", { class: "rf-skeleton-row" })),
      el("p", { class: "rf-visually-hidden", role: "status" }, "Quest を読み込んでいます"),
    ));
  } else if (state.model.interventions.length === 0 && state.view === null) {
    body.push(el(
      "section",
      { class: "rf-m-selected" },
      el("p", { class: "rf-state-title" }, "介入待ちの作業はありません"),
      el("p", { class: "rf-state-body" }, "Agent の実行は継続しています。Quest flow から進行中の Quest を確認できます。"),
    ));
  } else if (state.view !== null) {
    body.push(mobileSelected(state.view, state, callbacks));
    body.push(mobileRelay(state.view, state.model.actors));
    body.push(mobileEvidence(state.view, state, callbacks));
  }

  body.push(mobileChronicle(state, callbacks));

  return el("div", { class: "rf-m-page" }, ...body);
}
