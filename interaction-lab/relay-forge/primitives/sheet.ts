/**
 * Bottom sheet — the mobile overlay contract (brief B3).
 *
 * A sheet is a modal surface, so it owns the full contract rather than just a
 * drag handle: an explicit close button, Escape, a focus trap, focus return to
 * the trigger, `aria-modal`, and a scrim that dismisses. Nothing here depends
 * on a gesture, because a gesture cannot be reached from a keyboard.
 */

import { el } from "./dom.ts";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

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
  /** Detaches the document-level key handler. Call before removing the sheet. */
  readonly release: () => void;
}

export function bottomSheet(options: SheetOptions, ...content: (Node | null)[]): SheetHandle {
  const titleId = `rf-sheet-title-${options.title.replace(/\s+/g, "-").toLowerCase()}`;

  const close = el(
    "button",
    { type: "button", class: "rf-icon-button rf-sheet-close", title: "閉じる" },
    el("span", { class: "rf-visually-hidden" }, "閉じる"),
    el("span", { class: "rf-close-mark", "aria-hidden": "true" }),
  );

  const panel = el(
    "div",
    {
      class: "rf-sheet-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
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
  const element = el("div", { class: "rf-sheet" }, scrim, panel);

  let released = false;
  const finish = (): void => {
    if (released) return;
    released = true;
    document.removeEventListener("keydown", onKeyDown, true);
    options.onClose();
    // The panel is detached inside onClose, so restore focus once the removal
    // has settled; focusing while the active element is still inside a node
    // being removed can leave focus on <body>.
    queueMicrotask(() => options.returnFocusTo()?.focus());
  };

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key !== "Tab") return;
    // Focus trap: Tab cycles inside the panel and never escapes to the page.
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((item) => item.offsetParent !== null || item === document.activeElement);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  close.addEventListener("click", finish);
  scrim.addEventListener("click", finish);
  document.addEventListener("keydown", onKeyDown, true);

  // Opening moves focus into the sheet so the trap has somewhere to start.
  queueMicrotask(() => {
    const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target.focus();
  });

  return {
    element,
    release: () => {
      released = true;
      document.removeEventListener("keydown", onKeyDown, true);
    },
  };
}
