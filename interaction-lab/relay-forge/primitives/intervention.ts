/**
 * Intervention Queue — NEWDESIGN.md section 14.5 `InterventionItem`.
 *
 * Each item is 64px collapsed and exposes reason, affected Quest, waiting
 * duration, owner and one next action. Severity changes ordering and the
 * connector treatment, never the card size, and there is no card: items sit on
 * the Workfield separated by hairlines (section 16 of the implementation brief).
 */

import { type Actor, formatWaiting, type Intervention } from "../model.ts";
import { actorNode } from "./actor.ts";
import { el } from "./dom.ts";

const SEVERITY_ORDER: Readonly<Record<Intervention["severity"], number>> = {
  blocked: 0,
  review: 1,
  waiting: 2,
};

const SEVERITY_LABEL: Readonly<Record<Intervention["severity"], string>> = {
  blocked: "Blocked",
  review: "Review",
  waiting: "Waiting",
};

export interface InterventionQueueOptions {
  readonly selectedId: string | null;
  readonly onSelect: (interventionId: string) => void;
  /** Section 6.10: writes are locked while the workspace is stale. */
  readonly writeLocked: boolean;
}

function interventionItem(
  intervention: Intervention,
  actors: ReadonlyMap<string, Actor>,
  options: InterventionQueueOptions,
): HTMLElement {
  const owner = actors.get(intervention.ownerActorId);
  const selected = options.selectedId === intervention.id;
  const item = el(
    "li",
    { class: "rf-intervention-item" },
    el(
      "button",
      {
        type: "button",
        class: "rf-intervention-button",
        "data-severity": intervention.severity,
        "data-selected": selected ? "true" : "false",
        "aria-pressed": selected ? "true" : "false",
      },
      el(
        "span",
        { class: "rf-intervention-head" },
        el("span", { class: "rf-intervention-severity" }, SEVERITY_LABEL[intervention.severity]),
        el("span", { class: "rf-intervention-age" }, formatWaiting(intervention.waitingMinutes)),
      ),
      el("span", { class: "rf-intervention-reason" }, intervention.reason),
      el(
        "span",
        { class: "rf-intervention-foot" },
        owner === undefined ? null : actorNode(owner, { state: "idle" }),
        el("span", { class: "rf-intervention-object" }, intervention.questRef),
        intervention.affectedCount > 1
          ? el("span", { class: "rf-intervention-count" }, `${intervention.affectedCount} Quests`)
          : null,
        el("span", { class: "rf-intervention-next" }, intervention.actionLabel),
      ),
    ),
  );
  const button = item.querySelector<HTMLButtonElement>(".rf-intervention-button");
  button?.addEventListener("click", () => options.onSelect(intervention.id));
  if (options.writeLocked && button !== null) button.setAttribute("data-write-locked", "true");
  return item;
}

export function interventionQueue(
  interventions: readonly Intervention[],
  actors: ReadonlyMap<string, Actor>,
  options: InterventionQueueOptions,
): HTMLElement {
  const ordered = [...interventions].sort((left, right) => {
    const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    return bySeverity !== 0 ? bySeverity : right.waitingMinutes - left.waitingMinutes;
  });
  return el(
    "ul",
    { class: "rf-intervention-queue", "aria-label": "Intervention queue" },
    ...ordered.map((intervention) => interventionItem(intervention, actors, options)),
    // Terminal row: the queue is a finite list, so the space below it is
    // explained rather than left as unaccounted whitespace (section 26.2).
    el(
      "li",
      { class: "rf-intervention-end" },
      ordered.length === 0
        ? "介入待ちの作業はありません。"
        : "これ以上の介入待ちはありません。新しい判断が必要になるとここに追加されます。",
    ),
  );
}
