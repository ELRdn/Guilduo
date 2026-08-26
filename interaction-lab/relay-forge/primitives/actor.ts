/**
 * Actor primitives — NEWDESIGN.md section 13.
 *
 * Actor type is carried by geometry first and colour second, so a grayscale
 * capture still distinguishes Human, Agent, System and Companion:
 *
 *   Human      24px circle
 *   Agent      24x24 clipped-corner rectangle
 *   System     22x22 hollow bracket node
 *   Companion  28px crest silhouette
 *
 * The SVG path coordinates below are the mathematical description of those
 * shapes, which section 25.1 point 3 admits as the one place raw numbers are
 * allowed. No colour, spacing or type value is hard-coded anywhere in this file.
 */

import { type Actor, type ActorKind, actorTypeLabel } from "../model.ts";
import { el, svg } from "./dom.ts";

export type ActorNodeState = "idle" | "current" | "completed" | "blocked" | "review";

interface ActorNodeOptions {
  readonly state?: ActorNodeState;
  /** Adds the section 13.2 filled treatment used for the current holder. */
  readonly filled?: boolean;
}

/** Viewbox is 28x28 for every actor so nodes share one optical centre. */
function actorGeometry(kind: ActorKind, filled: boolean): SVGElement {
  const fill = filled ? "currentColor" : "none";
  switch (kind) {
    case "human":
      return svg("circle", { cx: 14, cy: 14, r: 11, fill, "stroke-width": 1.5, stroke: "currentColor" });
    case "agent":
      // 24x24 square with the top-right corner clipped by 9px.
      return svg("path", {
        d: "M3 3 H16 L25 12 V25 H3 Z",
        fill,
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linejoin": "miter",
      });
    case "system":
      // 22x22 hollow bracket: two opposing corner brackets, never filled.
      return svg("path", {
        d: "M10 3 H3 V10 M18 3 H25 V10 M25 18 V25 H18 M10 25 H3 V18",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "square",
      });
    case "companion":
      // 28px crest: shield silhouette with a notched shoulder line.
      return svg("path", {
        d: "M14 2 L25 6 V15 C25 21 20 25 14 27 C8 25 3 21 3 15 V6 Z",
        fill,
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linejoin": "round",
      });
  }
}

/**
 * Section 13.2 state markers. Each is a line/shape treatment, never colour only.
 */
function stateMarker(state: ActorNodeState): SVGElement | null {
  switch (state) {
    case "completed":
      return svg("path", {
        d: "M9 14.5 L12.5 18 L19 10.5",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.75,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: "rf-actor-mark",
      });
    case "review":
      return svg("path", {
        d: "M14 8 V15 M14 18.5 V20",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.75,
        "stroke-linecap": "round",
        class: "rf-actor-mark",
      });
    case "blocked":
      return svg("path", {
        d: "M9 9 L19 19 M19 9 L9 19",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.75,
        "stroke-linecap": "round",
        class: "rf-actor-mark",
      });
    default:
      return null;
  }
}

export function actorNode(actor: Actor, options: ActorNodeOptions = {}): HTMLElement {
  const state = options.state ?? "idle";
  const filled = options.filled ?? state === "current";
  const graphic = svg(
    "svg",
    { viewBox: "0 0 28 28", "aria-hidden": "true", focusable: "false", class: "rf-actor-shape" },
    actorGeometry(actor.kind, filled),
    stateMarker(state),
  );
  return el(
    "span",
    {
      class: "rf-actor-node",
      "data-actor-kind": actor.kind,
      "data-actor-state": state,
      "data-filled": filled ? "true" : "false",
    },
    graphic,
  );
}

interface ActorIdentityOptions {
  readonly state?: ActorNodeState;
  /** Compact form drops the role line but never the geometry or type label. */
  readonly compact?: boolean;
  readonly showType?: boolean;
}

/**
 * `ActorIdentity` — section 14.4. The accessible name always carries both the
 * actor name and the actor type so screen readers get the same distinction the
 * geometry gives sighted users.
 */
export function actorIdentity(actor: Actor, options: ActorIdentityOptions = {}): HTMLElement {
  const compact = options.compact ?? false;
  const showType = options.showType ?? true;
  const typeLabel = actorTypeLabel(actor.kind);
  return el(
    "span",
    {
      class: "rf-actor-identity",
      "data-compact": compact ? "true" : "false",
      "data-actor-kind": actor.kind,
    },
    actorNode(actor, { state: options.state }),
    el(
      "span",
      { class: "rf-actor-copy" },
      el("span", { class: "rf-actor-name" }, actor.name),
      showType && !compact ? el("span", { class: "rf-actor-type" }, typeLabel) : null,
      compact ? null : el("span", { class: "rf-actor-role" }, actor.role),
    ),
    el("span", { class: "rf-visually-hidden" }, ` (${typeLabel})`),
  );
}

/** Avatar-free initials fallback that keeps geometry and label (section 13.1). */
export function actorInitials(actor: Actor): HTMLElement {
  return el("span", { class: "rf-actor-initials", "data-actor-kind": actor.kind }, actor.initials);
}
