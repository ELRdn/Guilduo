/**
 * Relay Spine / HandoffPath — NEWDESIGN.md sections 13.2, 14.4 and 22.1.
 *
 * The spine answers four questions without a status badge: who acted, who holds
 * the work, who is next, and where the transfer broke. Every connector state is
 * a distinct line treatment so the answer survives grayscale (section 26.2).
 *
 * SVG coordinates are mathematical geometry, permitted by section 25.1 point 3.
 * The rendered segment length is 28px minimum, matching section 14.4.
 */

import { type Actor, type ConnectorState, type RelaySpine } from "../model.ts";
import { actorNode } from "./actor.ts";
import { el, svg } from "./dom.ts";

/** Connector artwork is drawn in a 40x28 box; the line runs on the vertical mid. */
function connectorGraphic(state: ConnectorState): SVGElement {
  const mid = 14;
  const children: SVGElement[] = [];
  switch (state) {
    case "completed":
      children.push(svg("path", { d: `M0 ${mid} H40`, class: "rf-connector-line" }));
      break;
    case "active":
      children.push(svg("path", { d: `M0 ${mid} H40`, class: "rf-connector-line" }));
      children.push(svg("rect", { x: 0, y: mid - 1, width: 8, height: 2, class: "rf-connector-tracer" }));
      break;
    case "pending":
      children.push(svg("path", { d: `M0 ${mid} H40`, class: "rf-connector-line rf-connector-line--quiet" }));
      children.push(svg("path", { d: `M31 ${mid - 4} L36 ${mid} L31 ${mid + 4}`, class: "rf-connector-notch" }));
      break;
    case "automated":
      children.push(svg("path", {
        d: `M0 ${mid} H40`,
        class: "rf-connector-line rf-connector-line--dashed",
        "stroke-dasharray": "3 3",
      }));
      break;
    case "waiting":
      children.push(svg("path", { d: `M0 ${mid} H15`, class: "rf-connector-line" }));
      children.push(svg("path", { d: `M25 ${mid} H40`, class: "rf-connector-line rf-connector-line--quiet" }));
      // Pause marker: two 8px bars centred on the segment.
      children.push(svg("rect", { x: 17, y: mid - 4, width: 2, height: 8, class: "rf-connector-pause" }));
      children.push(svg("rect", { x: 21, y: mid - 4, width: 2, height: 8, class: "rf-connector-pause" }));
      break;
    case "review":
      // Two lines converge on the following Human node.
      children.push(svg("path", { d: `M0 ${mid - 4} H22 L34 ${mid}`, class: "rf-connector-line" }));
      children.push(svg("path", { d: `M0 ${mid + 4} H22 L34 ${mid}`, class: "rf-connector-line" }));
      children.push(svg("path", { d: `M34 ${mid} H40`, class: "rf-connector-line" }));
      break;
    case "blocked":
      // Section 13.2: connector breaks into two segments with a danger cross.
      children.push(svg("path", { d: `M0 ${mid} H14`, class: "rf-connector-line" }));
      children.push(svg("path", { d: `M26 ${mid} H40`, class: "rf-connector-line rf-connector-line--quiet" }));
      children.push(svg("path", {
        d: `M16 ${mid - 4} L24 ${mid + 4} M24 ${mid - 4} L16 ${mid + 4}`,
        class: "rf-connector-cross",
      }));
      break;
  }
  return svg(
    "svg",
    { viewBox: "0 0 40 28", "aria-hidden": "true", focusable: "false", class: "rf-connector-shape" },
    ...children,
  );
}

const CONNECTOR_DESCRIPTION: Readonly<Record<ConnectorState, string>> = {
  completed: "handed off",
  active: "executing",
  waiting: "waiting",
  review: "review required",
  blocked: "blocked",
  pending: "next",
  automated: "automated",
};

export interface RelaySpineOptions {
  /** Compact mode shows previous, current and next only (section 15.4). */
  readonly compact?: boolean;
  /** Nodes are focusable in chronological order when the spine is interactive. */
  readonly interactive?: boolean;
  readonly onSelectLeg?: (index: number) => void;
}

export function relaySpine(
  spine: RelaySpine,
  actors: ReadonlyMap<string, Actor>,
  options: RelaySpineOptions = {},
): HTMLElement {
  const interactive = options.interactive ?? false;
  const parts: HTMLElement[] = [];

  if (spine.hiddenBefore > 0) {
    parts.push(el(
      "span",
      { class: "rf-relay-hidden", title: `${spine.hiddenBefore} earlier legs` },
      `+${spine.hiddenBefore}`,
    ));
  }

  spine.legs.forEach((leg, index) => {
    const actor = actors.get(leg.actorId);
    if (actor === undefined) return;
    const isCurrent = index === spine.currentIndex;
    const isPast = index < spine.currentIndex;
    const state = leg.nodeState
      ?? (isCurrent
        ? (leg.connector === "blocked" ? "blocked" : leg.connector === "review" ? "review" : "current")
        : isPast ? "completed" : "idle");
    const node = actorNode(actor, { state, filled: isCurrent || state === "completed" });
    const wrapper = el(
      interactive ? "button" : "span",
      {
        class: "rf-relay-node",
        "data-current": isCurrent ? "true" : "false",
        type: interactive ? "button" : null,
        "aria-current": interactive && isCurrent ? "step" : null,
        title: `${actor.name} · ${actor.kind}`,
      },
      node,
      el("span", { class: "rf-visually-hidden" }, `${actor.name}, ${actor.kind}`),
    );
    if (interactive && options.onSelectLeg !== undefined) {
      const select = options.onSelectLeg;
      wrapper.addEventListener("click", () => select(index));
    }
    parts.push(wrapper);

    if (leg.connector !== null) {
      parts.push(el(
        "span",
        {
          class: "rf-relay-connector",
          "data-connector": leg.connector,
          title: leg.connectorNote ?? CONNECTOR_DESCRIPTION[leg.connector],
        },
        connectorGraphic(leg.connector),
        el("span", { class: "rf-visually-hidden" }, ` ${leg.connectorNote ?? CONNECTOR_DESCRIPTION[leg.connector]} `),
      ));
    }
  });

  return el(
    "span",
    {
      class: "rf-relay",
      "data-compact": (options.compact ?? false) ? "true" : "false",
      role: "group",
      "aria-label": "Relay path",
    },
    ...parts,
  );
}

/**
 * Vertical spine used in the Lens, where the full handoff history is listed with
 * its evidence rather than compressed into a row.
 */
export function relayHistory(spine: RelaySpine, actors: ReadonlyMap<string, Actor>): HTMLElement {
  const rows = spine.legs.map((leg, index) => {
    const actor = actors.get(leg.actorId);
    if (actor === undefined) return null;
    const isCurrent = index === spine.currentIndex;
    const isPast = index < spine.currentIndex;
    const state = leg.nodeState
      ?? (isCurrent
        ? (leg.connector === "blocked" ? "blocked" : leg.connector === "review" ? "review" : "current")
        : isPast ? "completed" : "idle");
    const description = leg.connector === null
      ? (isCurrent ? "holds the work" : "next expected holder")
      : (leg.connectorNote ?? CONNECTOR_DESCRIPTION[leg.connector]);
    return el(
      "li",
      { class: "rf-relay-history-row", "data-current": isCurrent ? "true" : "false" },
      actorNode(actor, { state, filled: isCurrent }),
      el(
        "span",
        { class: "rf-relay-history-copy" },
        el("span", { class: "rf-relay-history-actor" }, actor.name),
        el("span", { class: "rf-relay-history-state" }, description),
      ),
    );
  });
  return el("ol", { class: "rf-relay-history" }, ...rows);
}
