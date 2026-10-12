/**
 * Attention Shelf — NEWDESIGNv2.md section 4.
 *
 * Up to three intervention candidates across the top of the Workfield. Only the
 * selected one is emphasised; Blocked and Waiting stay comparable but recede.
 * The Shelf is a selection surface, not the star of Command, so it uses a
 * restrained selected tint and a leading edge — never glow, shadow or scale.
 */

import { type Actor, formatWaiting, type Intervention } from "../model.ts";
import { actorAvatar } from "./avatar.ts";
import { el } from "./dom.ts";
import { relayText } from "../relay-copy.ts";
import { countLabel } from "../screens/screen-state.ts";

const SEVERITY_ORDER: Readonly<Record<Intervention["severity"], number>> = {
  blocked: 0,
  review: 1,
  waiting: 2,
};

const SEVERITY_LABEL = { blocked:"stateBlocked", review:"stateReview", waiting:"waiting" } as const;

/** Non-colour state marks (section 4): each severity owns a distinct glyph. */
function severityMark(severity: Intervention["severity"]): HTMLElement {
  return el("span", { class: "rf-shelf-mark", "data-severity": severity, "aria-hidden": "true" });
}

export interface AttentionShelfOptions {
  readonly selectedQuestId: string | null;
  readonly onSelect: (questId: string, trigger: HTMLElement) => void;
}

export function attentionShelf(
  interventions: readonly Intervention[],
  actors: ReadonlyMap<string, Actor>,
  options: AttentionShelfOptions,
): HTMLElement {
  const ordered = [...interventions]
    .sort((left, right) => {
      const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
      return bySeverity !== 0 ? bySeverity : right.waitingMinutes - left.waitingMinutes;
    })
    .slice(0, 3);

  const cards = ordered.map((intervention) => {
    const selected = options.selectedQuestId === intervention.questId;
    const owner = actors.get(intervention.ownerActorId);
    const card = el(
      "button",
      {
        type: "button",
        class: "rf-shelf-card",
        "data-severity": intervention.severity,
        "data-selected": selected ? "true" : "false",
        "aria-pressed": selected ? "true" : "false",
        "data-quest-id": intervention.questId,
      },
      el(
        "span",
        { class: "rf-shelf-head" },
        severityMark(intervention.severity),
        el("span", { class: "rf-shelf-severity" }, relayText(SEVERITY_LABEL[intervention.severity])),
        selected ? el("span", { class: "rf-shelf-selected" }, relayText("selected")) : null,
        el("span", { class: "rf-shelf-age" }, formatWaiting(intervention.waitingMinutes)),
      ),
      el(
        "span",
        { class: "rf-shelf-body" },
        el("span", { class: "rf-shelf-reason" }, intervention.reason),
        el(
          "span",
          { class: "rf-shelf-foot" },
          el("span", { class: "rf-shelf-ref" }, intervention.questRef),
          intervention.affectedCount > 1
            ? el("span", { class: "rf-shelf-count" }, countLabel(intervention.affectedCount))
            : null,
        ),
      ),
      el(
        "span",
        { class: "rf-shelf-actor" },
        owner === undefined ? null : actorAvatar(owner, { size: "shelf" }),
        el("span", { class: "rf-shelf-actor-name" }, owner?.name ?? ""),
      ),
    );
    card.addEventListener("click", () => options.onSelect(intervention.questId, card));
    return card;
  });

  return el(
    "section",
    { class: "rf-shelf", "aria-label": relayText("commandAttention") },
    el(
      "div",
      { class: "rf-shelf-header" },
      el("h2", { class: "rf-region-label" }, relayText("commandAttention")),
      el("span", { class: "rf-region-count" }, countLabel(interventions.length)),
    ),
    el("div", { class: "rf-shelf-track" }, ...cards),
  );
}
