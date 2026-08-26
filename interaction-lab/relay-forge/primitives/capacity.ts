/**
 * Capacity Band — NEWDESIGN.md sections 6.3 and 22.4.
 *
 * A 32px, four-slot operational status layer. Slot position and meaning are
 * fixed across every domain; only slot C's content follows domain context. It is
 * not a KPI strip: no large numerals, no sparkline, and every slot leads to the
 * queue or resource it constrains.
 */

import { type CapacitySlot } from "../model.ts";
import { el } from "./dom.ts";

export interface CapacityBandOptions {
  readonly onSelect: (slot: CapacitySlot) => void;
  /** Slot D expands while the workspace is stale or reconnecting (section 6.7). */
  readonly expandHealth: boolean;
}

export function capacityBand(
  slots: readonly CapacitySlot[],
  options: CapacityBandOptions,
): HTMLElement {
  const band = el(
    "div",
    { class: "rf-capacity", role: "group", "aria-label": "Capacity" },
    ...slots.map((slot) => {
      const button = el(
        "button",
        {
          type: "button",
          class: "rf-capacity-slot",
          "data-slot": slot.id,
          "data-tone": slot.tone,
          "data-expanded": options.expandHealth && slot.id === "health" ? "true" : "false",
          disabled: slot.filter === null ? true : null,
        },
        el("span", { class: "rf-capacity-label rf-capacity-label--full" }, slot.label),
        el("span", { class: "rf-capacity-label rf-capacity-label--short" }, slot.shortLabel),
        el("span", { class: "rf-capacity-value" }, slot.value),
      );
      if (slot.filter !== null) button.addEventListener("click", () => options.onSelect(slot));
      return button;
    }),
  );
  return band;
}
