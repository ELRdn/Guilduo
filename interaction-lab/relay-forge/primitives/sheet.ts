/**
 * Bottom sheet — the mobile overlay contract (brief B3).
 *
 * A sheet is a modal surface, so it owns the full contract rather than just a
 * drag handle: a native modal dialog, an explicit close button, Escape, focus
 * return to the trigger, and a scrim that dismisses. Nothing here depends
 * on a gesture, because a gesture cannot be reached from a keyboard.
 */

import { el } from "./dom.ts";
import { relayText } from "../relay-copy.ts";

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";

export interface SheetOptions {
  readonly title: string;
  /**
   * Resolves the element focus returns to. It is a function rather than a node
   * because a re-render can replace the trigger while the sheet is open.
   */
  readonly returnFocusTo: () => HTMLElement | null;
  readonly onClose: () => void;
}

export interface SheetHandle {
  readonly element: HTMLElement;
  /** Closes the native modal. Call before removing the sheet. */
  readonly release: () => void;
}

export function bottomSheet(options: SheetOptions, ...content: (Node | null)[]): SheetHandle {
  const titleId = `rf-sheet-title-${options.title.replace(/\s+/g, "-").toLowerCase()}`;

  const close = el(
    "button",
    { type: "button", class: "rf-icon-button rf-sheet-close", title: relayText("close") },
    el("span", { class: "rf-visually-hidden" }, relayText("close")),
    el("span", { class: "rf-close-mark", "aria-hidden": "true" }),
  );

  const panel = el(
    "div",
    {
      class: "rf-sheet-panel",
    },
    el(
      "header",
      { class: "rf-sheet-header" },
      el("span", { class: "rf-sheet-grip", "aria-hidden": "true" }),
      el("h2", { class: "rf-region-label", id: titleId }, options.title),
      close,
    ),
    el("div", { class: "rf-sheet-body" }, ...content),
  );

  const scrim = el("div", { class: "rf-sheet-scrim" });
  const element = el("dialog", { class: "rf-sheet", "aria-modal": "true", "aria-labelledby": titleId }, scrim, panel);

  let released = false;
  const finish = (): void => {
    if (released) return;
    released = true;
    if (element.open) element.close();
    options.onClose();
    // The panel is detached inside onClose, so restore focus once the removal
    // has settled; focusing while the active element is still inside a node
    // being removed can leave focus on <body>.
    queueMicrotask(() => options.returnFocusTo()?.focus());
  };

  close.addEventListener("click", finish);
  scrim.addEventListener("click", finish);
  element.addEventListener("cancel", event => { event.preventDefault(); finish(); });
  element.addEventListener("close", finish);
  // Native modality isolates the page; keep Tab from moving into browser chrome.
  element.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.offsetParent !== null || item === document.activeElement);
    const first = items[0];
    const last = items[items.length - 1];
    if (first && event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (last && !event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Native modality moves focus inside and excludes the background.
  queueMicrotask(() => {
    if (!released && element.isConnected) element.showModal();
  });

  return {
    element,
    release: () => {
      released = true;
      if (element.open) element.close();
    },
  };
}
