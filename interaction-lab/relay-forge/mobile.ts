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
  type Intervention,
  type SelectedQuestView,
} from "./model.ts";
import { actorAvatar } from "./primitives/avatar.ts";
import { el } from "./primitives/dom.ts";
import { externalCheck } from "./primitives/external-check.ts";
import { questContext } from "./primitives/quest-context.ts";
import { relayText } from "./relay-copy.ts";
import { questActionLabel, type QuestActionId, type QuestActionState } from "./quest-actions.ts";
import { t } from "../../i18n.ts";
import { countLabel, elapsedLabel } from "./screens/screen-state.ts";

export interface MobileCallbacks {
  readonly onRefreshWorkspace?: () => void;
  readonly onExternalChecked?: (value: boolean) => void;
  readonly onInbox?: (trigger: HTMLElement) => void;
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
  readonly externalChecked?: boolean;
  readonly humanPending?: number;
  readonly model: CommandModel;
  readonly selectedQuestId: string | null;
  readonly view: SelectedQuestView | null;
  readonly intervention: Intervention | null;
  readonly questActions: QuestActionState;
  readonly evidenceOpen: boolean;
  readonly supportingOpen: boolean;
  readonly chronicleOpen: boolean;
  readonly writeLocked: boolean;
  readonly syncState?: CommandModel["syncState"];
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

const SEVERITY_LABEL = {
  blocked: "stateBlocked",
  review: "stateReview",
  waiting: "waiting",
} as const;

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function mobileHeader(state: MobileState, callbacks: MobileCallbacks): HTMLElement {
  const attention = state.model.interventions.length;
  const syncState = state.syncState ?? state.model.syncState;
  const syncLabel = syncState === "stale" ? relayText("statusStale") : syncState === "error" ? relayText("loadFailed") : t(`sync.${syncState}`);
  const inbox = el("button", { type: "button", class: "rf-quiet-button rf-human-inbox-trigger" }, `${relayText("inbox")} · ${state.humanPending || 0}`);
  inbox.addEventListener("click", () => callbacks.onInbox?.(inbox));
  const sync = el(callbacks.onRefreshWorkspace ? "button" : "span", { class:"rf-m-sync", "data-state":syncState, ...(callbacks.onRefreshWorkspace ? { type:"button", title:relayText("refresh"), "aria-label":`${relayText("refresh")} · ${syncLabel}`, disabled:syncState === "syncing" } : {}) }, `${syncLabel} · ${state.model.lastSyncLabel}`);
  if (callbacks.onRefreshWorkspace) sync.addEventListener("click", callbacks.onRefreshWorkspace);
  return el(
    "header",
    { class: "rf-m-header" },
    el("h1", { class: "rf-m-title" }, "Command"),
    inbox,
    el(
      "div",
      { class: "rf-m-status" },
      el(
        "span",
        { class: "rf-m-attention" },
        el("span", { class: "rf-m-attention-count" }, String(attention)),
        el("span", { class: "rf-m-attention-label" }, relayText("awaitingDecision")),
      ),
      sync,
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
  const selectedIndex = ordered.findIndex(item => item.questId === state.selectedQuestId);
  const tabIndex = Math.max(0, selectedIndex);

  const track = el(
    "ul",
    {
      class: "rf-m-shelf-track",
      role: "listbox",
      "aria-label": relayText("commandAttention"),
    },
    ...ordered.map((intervention, index) => {
      const owner = state.model.actors.get(intervention.ownerActorId);
      const selected = state.selectedQuestId === intervention.questId;
      const card = el(
        "button",
        {
          type: "button",
          class: "rf-m-shelf-card",
          role: "option",
          id: `rf-m-shelf-${intervention.questId}`,
          tabindex: index === tabIndex ? 0 : -1,
          "data-severity": intervention.severity,
          "data-selected": selected ? "true" : "false",
          "aria-selected": selected ? "true" : "false",
          "data-quest-id": intervention.questId,
        },
        el(
          "span",
          { class: "rf-m-shelf-head" },
          el("span", { class: "rf-shelf-mark", "data-severity": intervention.severity, "aria-hidden": "true" }),
          el("span", { class: "rf-shelf-severity" }, relayText(SEVERITY_LABEL[intervention.severity])),
          selected ? el("span", { class: "rf-shelf-selected" }, relayText("selected")) : null,
          el("span", { class: "rf-shelf-age" }, elapsedLabel(intervention.waitingMinutes)),
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
      card.addEventListener("keydown", event => {
        const target = event.key === "Home" ? 0 : event.key === "End" ? ordered.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown" ? Math.min(ordered.length - 1, index + 1)
          : event.key === "ArrowLeft" || event.key === "ArrowUp" ? Math.max(0, index - 1) : null;
        if (target === null) return;
        event.preventDefault();
        track.querySelectorAll<HTMLButtonElement>(".rf-m-shelf-card")[target]?.click();
      });
      return el("li", { class: "rf-m-shelf-item", role: "presentation" }, card);
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
    { type: "button", class: "rf-icon-button", disabled: ordered.length === 0 || selectedIndex === 0, title: relayText("commandPrevious") },
    el("span", { class: "rf-visually-hidden" }, relayText("commandPrevious")),
    el("span", { class: "rf-chevron-inline rf-m-prev", "aria-hidden": "true" }),
  );
  previous.addEventListener("click", () => step(-1));
  const forward = el(
    "button",
    { type: "button", class: "rf-icon-button", disabled: ordered.length === 0 || selectedIndex === ordered.length - 1, title: relayText("commandNext") },
    el("span", { class: "rf-visually-hidden" }, relayText("commandNext")),
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  forward.addEventListener("click", () => step(1));

  return el(
    "section",
    { class: "rf-m-shelf", "aria-label": relayText("commandAttention") },
    el(
      "div",
      { class: "rf-m-section-head" },
      el("h2", { class: "rf-region-label" }, relayText("commandAttention")),
      el("span", { class: "rf-region-count" }, countLabel(ordered.length)),
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
  const holder = view.responsibility.find((step) => step.state === "review" || step.state === "blocked" || step.state === "executing")
    ?? view.responsibility[view.responsibility.length - 1];
  const holderActor = state.model.actors.get(holder?.actorId ?? "");
  const hasPreview = view.evidence.find(artifact => artifact.primary)?.preview !== undefined;

  const questFlow = el(
    "button",
    { type: "button", class: "rf-secondary-button rf-m-questflow", "aria-haspopup": "dialog" },
    relayText("commandFlow"),
  );
  questFlow.addEventListener("click", () => callbacks.onOpenQuestFlow(questFlow));

  const reviewOutput = el(
    "button",
    { type: "button", class: "rf-review-button rf-m-review", id: "rf-m-review", "aria-expanded": hasPreview ? String(state.evidenceOpen) : null, "aria-controls": hasPreview ? "rf-m-output" : null, disabled: !hasPreview },
    el("span", { class: "rf-review-glyph", "aria-hidden": "true" }),
    relayText(state.evidenceOpen ? "commandHideOutput" : "commandReviewOutput"),
  );
  reviewOutput.addEventListener("click", callbacks.onToggleEvidence);

  return el(
    "section",
    { class: "rf-m-selected", "aria-label": `${relayText("selectedQuest")} ${view.ref}` },
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
        el("span", { class: "rf-m-holder-name" }, holderActor?.name ?? relayText("unassigned")),
        el("span", { class: "rf-m-holder-state" }, holder?.stateLabel ?? ""),
      ),
    ),
    el("div", { class: "rf-m-actions" }, view.externalReview ? null : reviewOutput, questFlow),
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
    { class: "rf-m-relay", "aria-label": relayText("commandResponsibility") },
    el("h2", { class: "rf-region-label" }, relayText("commandResponsibility")),
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
      id: "rf-m-supporting-toggle",
      "aria-controls": "rf-m-supporting",
      "aria-expanded": state.supportingOpen ? "true" : "false",
      disabled: supporting.length === 0 ? true : null,
    },
    `${relayText("commandSupportingEvidence")} (${countLabel(supporting.length)})`,
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  supportingToggle.addEventListener("click", callbacks.onToggleSupporting);

  return el(
    "section",
    { class: "rf-m-evidence", "aria-label": relayText("commandPrimaryEvidence") },
    el("h2", { class: "rf-region-label" }, relayText("commandPrimaryEvidence")),
    primary === null
      ? el("p", { class: "rf-m-evidence-empty" }, relayText("commandNoOutput"))
      : el(
        "div",
        { class: "rf-m-evidence-primary", "data-verdict": preview?.verdict ?? "none" },
        el(
          "div",
          { class: "rf-m-evidence-head" },
          el("span", { class: "rf-evidence-badge" }, relayText("commandPrimary")),
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
        preview === undefined
          ? null
          : el(
            "div",
            { class: "rf-m-evidence-detail", id: "rf-m-output", hidden: !state.evidenceOpen },
            el("p", { class: "rf-details-sub" }, relayText("commandChangedFields")),
            preview.changed.length === 0
              ? el("p", { class: "rf-preview-empty" }, relayText("commandNoChanges"))
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
            el("p", { class: "rf-details-sub" }, relayText("commandChecks")),
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
              ? relayText("noWaitingQuests")
              : relayText("commandAffectedWaiting").replace("{quests}", preview.affected.join(", "))),
          ),
      ),
    supportingToggle,
    el("ul", { class: "rf-m-evidence-list", id: "rf-m-supporting", hidden: !state.supportingOpen || supporting.length === 0 }, ...supporting.map(evidenceLine)),
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
      id: "rf-m-chronicle-toggle",
      "aria-controls": "rf-m-history",
      "aria-expanded": state.chronicleOpen ? "true" : "false",
    },
    relayText(state.chronicleOpen ? "commandHideHistory" : "commandShowHistory"),
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  toggle.addEventListener("click", callbacks.onToggleChronicle);

  return el(
    "section",
    { class: "rf-m-chronicle", "aria-label": relayText("commandHistory") },
    el(
      "div",
      { class: "rf-m-section-head" },
      el("h2", { class: "rf-region-label" }, relayText("commandHistory")),
      toggle,
    ),
    latest === undefined
      ? el("p", { class: "rf-m-evidence-empty" }, relayText("battleNoHistory"))
      : el(
        "div",
        { class: "rf-m-chronicle-latest" },
        actor === undefined ? null : actorAvatar(actor, { size: "row" }),
        el("span", { class: "rf-chronicle-time" }, latest.timeLabel),
        el(
          "span",
          { class: "rf-chronicle-sentence" },
          el("b", { class: "rf-chronicle-name" }, actor?.name ?? relayText("unknown")),
          el("span", { class: "rf-chronicle-verb" }, ` ${latest.verb} `),
          el("span", { class: "rf-chronicle-object" }, latest.object),
        ),
      ),
    el(
        "ol",
        { class: "rf-m-chronicle-list", id: "rf-m-history", hidden: !state.chronicleOpen },
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
      ),
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
      { class: "rf-m-decision", "data-shape": "compact", role: "region", "aria-label": relayText("decisionTitle") },
      el("p", { class: "rf-decision-status" }, relayText("chooseQuest")),
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
    const buttons = state.questActions.actions.map((action, index) => {
      const button = el("button", {
        type: "button",
        class: index === 0 ? "rf-decision-approve" : "rf-secondary-button",
        disabled: state.submitting || state.writeLocked ? true : null,
        "data-quest-action": action,
      }, questActionLabel(action));
      button.addEventListener("click", () => callbacks.onQuestAction(action));
      return button;
    });
    return el(
      "div",
      { class: "rf-m-decision", "data-shape": buttons.length > 0 ? "ready" : "compact", role: "region", "aria-label": relayText("taskActions") },
      el("div", { class: "rf-m-decision-copy" }, el("p", { class: "rf-decision-status" }, state.submitting ? state.resultMessage : state.questActions.statusLabel)),
      result,
      buttons.length === 0 ? null : el("div", { class: "rf-decision-actions rf-task-actions" }, ...buttons),
    );
  }
  if (state.revisionOpen) {
    const field = el("textarea", {
      class: "rf-revision-input",
      id: "rf-m-revision-reason",
      rows: 2,
      disabled: state.submitting,
      maxlength: 500,
      placeholder: relayText("revisionPlaceholder"),
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
        disabled: state.submitting || reason !== null ? true : null,
        "aria-busy": state.submitting ? "true" : null,
      },
      state.submitting ? relayText("sending") : relayText("sendRevision"),
    );
    send.addEventListener("click", callbacks.onSubmitRevision);

    const cancel = el("button", { type: "button", class: "rf-secondary-button", disabled: state.submitting }, relayText("dialogCancel"));
    cancel.addEventListener("click", callbacks.onCancelRevision);

    return el(
      "div",
      { class: "rf-m-decision", "data-shape": "revision", role: "region", "aria-label": relayText("decisionTitle") },
      externalCheck(state.externalChecked === true, state.submitting || state.writeLocked, callbacks.onExternalChecked),
      el("label", { class: "rf-revision-label", for: "rf-m-revision-reason" }, relayText("revisionContent")),
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
    return el(
      "div",
      { class: "rf-m-decision", "data-shape": "checking", role: "region", "aria-label": relayText("decisionTitle") },
      el(
        "div",
        { class: "rf-m-decision-copy" },
        el("p", { class: "rf-decision-status" }, relayText("humanDecision")),
        el("p", { class: "rf-decision-blocked", role: "status" }, reason),
      ),
      result,
      externalCheck(state.externalChecked === true, state.submitting || state.writeLocked, callbacks.onExternalChecked),
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
    state.submitting ? relayText("sending") : relayText("approveHandoff"),
  );
  approve.addEventListener("click", callbacks.onApprove);

  const revise = el(
    "button",
    { type: "button", class: "rf-secondary-button", disabled: state.submitting ? true : null },
    relayText("requestRevision"),
  );
  revise.addEventListener("click", callbacks.onRequestRevision);

  return el(
    "div",
    { class: "rf-m-decision", "data-shape": "ready", role: "region", "aria-label": relayText("decisionTitle") },
    externalCheck(state.externalChecked === true, state.submitting || state.writeLocked, callbacks.onExternalChecked),
    el(
      "div",
      { class: "rf-m-decision-copy" },
      el("p", { class: "rf-decision-status" }, relayText("humanDecision")),
      state.verification === null
        ? el("p", { class: "rf-decision-impact" }, relayText("handoffApprovalImpact"))
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
  const body: (HTMLElement | null)[] = [mobileHeader(state, callbacks), mobileShelf(state, callbacks)];

  if (state.loading) {
    body.push(el(
      "section",
      { class: "rf-m-selected", "aria-busy": "true" },
      el("div", { class: "rf-skeleton", "data-variant": "queue", "aria-hidden": "true" },
        el("span", { class: "rf-skeleton-row" }),
        el("span", { class: "rf-skeleton-row" })),
      el("p", { class: "rf-visually-hidden", role: "status" }, relayText("statusLoading")),
    ));
  } else if (state.model.interventions.length === 0 && state.view === null) {
    body.push(el(
      "section",
      { class: "rf-m-selected" },
      el("p", { class: "rf-state-title" }, relayText("commandNoAttention")),
      el("p", { class: "rf-state-body" }, relayText("commandBrowseHint")),
    ));
  } else if (state.view !== null) {
    body.push(mobileSelected(state.view, state, callbacks));
    body.push(mobileRelay(state.view, state.model.actors));
    const context = questContext(state.view);
    body.push(context || mobileEvidence(state.view, state, callbacks));
  }

  body.push(mobileChronicle(state, callbacks));

  return el("div", { class: "rf-m-page" }, ...body);
}
