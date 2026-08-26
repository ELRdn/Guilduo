/**
 * Empty / loading / error / stale primitives — NEWDESIGN.md section 14.10.
 *
 * Skeletons mirror the final geometry so shell regions never shift while data
 * loads (section 6.7). The stale state is not a component here: section 6.10
 * requires it to be carried by Capacity Band slot D, the Lens write lock and
 * disabled actions so no region is covered or displaced.
 */

import { el } from "./dom.ts";

export function emptyState(
  object: string,
  consequence: string,
  actionLabel: string,
  onAct?: () => void,
): HTMLElement {
  const action = el("button", { type: "button", class: "rf-primary-button" }, actionLabel);
  if (onAct !== undefined) action.addEventListener("click", onAct);
  return el(
    "div",
    { class: "rf-state rf-state--empty", role: "status" },
    el("p", { class: "rf-state-title" }, object),
    el("p", { class: "rf-state-body" }, consequence),
    action,
  );
}

/** Rows-shaped skeleton: `count` blocks at the caller's row height. */
export function skeletonRows(count: number, variant: "loom" | "queue" | "chronicle"): HTMLElement {
  return el(
    "div",
    { class: "rf-skeleton", "data-variant": variant, "aria-hidden": "true" },
    ...Array.from({ length: count }, () => el("span", { class: "rf-skeleton-row" })),
  );
}

export function errorState(what: string, safe: string, retryLabel: string, onRetry?: () => void): HTMLElement {
  const action = el("button", { type: "button", class: "rf-secondary-button" }, retryLabel);
  if (onRetry !== undefined) action.addEventListener("click", onRetry);
  return el(
    "div",
    { class: "rf-state rf-state--error", role: "alert" },
    el("p", { class: "rf-state-title" }, what),
    el("p", { class: "rf-state-body" }, safe),
    action,
  );
}
