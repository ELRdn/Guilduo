/**
 * Relay Forge — shared screen grammar.
 *
 * This module is deliberately small. It carries only what every destination
 * must share so the destination screens read as one product:
 *
 *   - the screen frame (title, the 5-second question, meta, primary actions)
 *   - one status vocabulary  (loading / empty / partial / error / permission /
 *     offline / stale / conflict) with one presentation per meaning
 *   - one state-chip grammar, legible without colour
 *   - one dense metric row
 *   - one filter/segment control
 *   - one confirmation surface for dangerous work
 *
 * What it does NOT carry: layout. Command's Loom, Lens and Shelf stay in
 * `../primitives/`; each screen owns its own composition, scroll ownership and
 * mobile re-composition. Nothing here is allowed to grow into a generic
 * "screen template" — that is how distinct screens become one screen repeated.
 */

import type { Actor } from "../model.ts";
import { el } from "../primitives/dom.ts";
import {
  countLabel,
  elapsedLabel,
  instantLabel,
  type ScreenNotice,
  type ScreenStatus,
} from "./screen-state.ts";

/* The state vocabulary and the formatters are DOM-free and live in
 * `screen-state.ts`; they are re-exported here so a presentation module has one
 * import for the whole grammar. */
export { countLabel, elapsedLabel, instantLabel } from "./screen-state.ts";
export type { ScreenId, ScreenNotice, ScreenStatus } from "./screen-state.ts";

/* ------------------------------------------------------------------ *
 * Screen contract
 * ------------------------------------------------------------------ */

/**
 * Everything a screen renderer is allowed to reach. Notably it does NOT get the
 * shell's state object: a screen cannot mutate selection or navigation directly,
 * it asks through these callbacks, which keeps the single-selection rule of
 * NEWDESIGNv2 section 10 intact across destinations instead of one.
 */
export interface ScreenContext {
  /** The one identity map, shared with Command. Screens never build their own. */
  readonly actors: ReadonlyMap<string, Actor>;
  readonly isMobile: boolean;
  /** True while a write is in flight anywhere in the shell. */
  readonly writeLocked: boolean;
  /** Ask the shell to select a Quest. Shared with Command's selection. */
  readonly onSelectQuest: (questId: string) => void;
  /** Ask the shell to navigate. `questId` deep-links a selection at the target. */
  readonly onNavigate: (domain: string, questId?: string) => void;
  /** Politely announce a state change to assistive technology. */
  readonly announce: (message: string) => void;
  /** Re-render after mutating a screen's own view state. */
  readonly rerender: () => void;
}

/** Desktop and mobile both return this, so the shell mounts them identically. */
export interface ScreenRender {
  readonly main: HTMLElement;
  /**
   * Optional element pinned above the mobile bottom navigation. The shell keeps
   * it clear of the nav and the safe area; a screen must not position it itself.
   */
  readonly sticky?: HTMLElement | null;
}

/* ------------------------------------------------------------------ *
 * Screen frame
 * ------------------------------------------------------------------ */

export interface ScreenHeaderOptions {
  /** The destination name, matching the Forge Rail label exactly. */
  readonly title: string;
  /** The question this screen answers in five seconds. Always visible. */
  readonly question: string;
  /** Short factual counters. Numbers only — never a synthesised score. */
  readonly meta?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly actions?: readonly HTMLElement[];
}

export function screenHeader(options: ScreenHeaderOptions): HTMLElement {
  return el(
    "header",
    { class: "rf-screen-header" },
    el(
      "div",
      { class: "rf-screen-heading" },
      el("h1", { class: "rf-screen-title" }, options.title),
      el("p", { class: "rf-screen-question" }, options.question),
    ),
    options.meta === undefined || options.meta.length === 0
      ? null
      : el(
        "dl",
        { class: "rf-screen-meta" },
        ...options.meta.flatMap((entry) => [
          el("dt", null, entry.label),
          el("dd", null, entry.value),
        ]),
      ),
    options.actions === undefined || options.actions.length === 0
      ? null
      : el("div", { class: "rf-screen-actions" }, ...options.actions),
  );
}

/**
 * A screen region. `scroll` marks the one region that owns vertical scrolling,
 * which every screen must declare exactly once on desktop (section 3.2's rule,
 * applied beyond Command).
 */
export function screenRegion(
  label: string,
  options: { readonly scroll?: boolean; readonly variant?: string } = {},
  ...children: Array<Node | string | null>
): HTMLElement {
  return el(
    "section",
    {
      class: "rf-screen-region",
      "data-scroll": options.scroll === true ? "true" : "false",
      "data-variant": options.variant ?? null,
      "aria-label": label,
    },
    el("h2", { class: "rf-region-label" }, label),
    ...children,
  );
}

/* ------------------------------------------------------------------ *
 * Status presentation — one look per meaning, across all six screens
 * ------------------------------------------------------------------ */

const STATUS_TITLE: Readonly<Record<Exclude<ScreenStatus, "ready">, string>> = {
  loading: "読み込み中",
  empty: "まだありません",
  partial: "一部だけ読み込めました",
  error: "読み込みに失敗しました",
  permission: "権限が足りません",
  offline: "オフラインです",
  stale: "表示が古くなっています",
  conflict: "ほかで更新されました",
};

/**
 * `error`, `permission` and `conflict` interrupt; the rest inform. The role
 * follows that split so a screen reader is not shouted at for a stale badge.
 */
function noticeRole(status: Exclude<ScreenStatus, "ready">): string {
  return status === "error" || status === "permission" || status === "conflict" ? "alert" : "status";
}

/** The banner every screen uses for a non-ready condition. Never a spinner. */
export function screenNotice(notice: ScreenNotice): HTMLElement {
  const action = notice.action === undefined
    ? null
    : el("button", { type: "button", class: "rf-secondary-button" }, notice.action.label);
  if (action !== null && notice.action !== undefined) {
    const onAct = notice.action.onAct;
    action.addEventListener("click", () => onAct());
  }
  return el(
    "div",
    { class: "rf-screen-notice", "data-status": notice.status, role: noticeRole(notice.status) },
    el("span", { class: "rf-screen-notice-mark", "aria-hidden": "true" }),
    el(
      "div",
      { class: "rf-screen-notice-copy" },
      el("strong", null, STATUS_TITLE[notice.status]),
      el("span", null, notice.detail),
    ),
    action,
  );
}

/**
 * A skeleton shaped like the rows it replaces. `count` and `variant` come from
 * the region that is loading, so the region does not resize when data lands.
 * There is no indeterminate spinner anywhere in this design language.
 */
export function screenSkeleton(count: number, variant: "row" | "card" | "node" | "tile"): HTMLElement {
  return el(
    "div",
    { class: "rf-screen-skeleton", "data-variant": variant, "aria-hidden": "true" },
    ...Array.from({ length: count }, () => el("span", { class: "rf-screen-skeleton-item" })),
  );
}

/**
 * Empty is a starting point. It names the object, the consequence of it being
 * empty, and exactly one action — never a decorative illustration with no verb.
 */
export function screenEmpty(
  object: string,
  consequence: string,
  action?: { readonly label: string; readonly onAct: () => void },
): HTMLElement {
  const button = action === undefined
    ? null
    : el("button", { type: "button", class: "rf-primary-button" }, action.label);
  if (button !== null && action !== undefined) button.addEventListener("click", () => action.onAct());
  return el(
    "div",
    { class: "rf-screen-empty", role: "status" },
    el("p", { class: "rf-screen-empty-title" }, object),
    el("p", { class: "rf-screen-empty-body" }, consequence),
    button,
  );
}

/* ------------------------------------------------------------------ *
 * State chips — the same grammar Command uses, reusable off-Command
 * ------------------------------------------------------------------ */

/**
 * Every chip carries a glyph and a word, so state survives greyscale, colour
 * vision deficiency and a printed screenshot. Colour is the third signal, never
 * the first.
 */
export interface ChipOptions {
  readonly tone: "review" | "blocked" | "waiting" | "working" | "done" | "scheduled" | "neutral" | "danger";
  readonly label: string;
  /** Non-colour mark. Two characters at most so the chip stays one line. */
  readonly mark: string;
  readonly title?: string;
}

export function stateChip(options: ChipOptions): HTMLElement {
  return el(
    "span",
    { class: "rf-chip", "data-tone": options.tone, title: options.title ?? null },
    el("span", { class: "rf-chip-mark", "aria-hidden": "true" }, options.mark),
    el("span", { class: "rf-chip-label" }, options.label),
  );
}

/* ------------------------------------------------------------------ *
 * Dense metrics
 * ------------------------------------------------------------------ */

export interface Metric {
  readonly label: string;
  readonly value: string;
  /** Supporting line. Use it for the denominator, never for a slogan. */
  readonly note?: string;
  readonly tone?: ChipOptions["tone"];
  readonly onAct?: () => void;
}

/**
 * The counter strip each screen opens with. Every value is a real count from
 * the ViewModel; there are no derived scores, indexes or health percentages
 * unless the domain actually produces them.
 */
export function metricRow(metrics: readonly Metric[]): HTMLElement {
  return el(
    "div",
    { class: "rf-metric-row" },
    ...metrics.map((metric) => {
      const body = [
        el("span", { class: "rf-metric-label" }, metric.label),
        el("strong", { class: "rf-metric-value" }, metric.value),
        metric.note === undefined ? null : el("span", { class: "rf-metric-note" }, metric.note),
      ];
      if (metric.onAct === undefined) {
        return el("div", { class: "rf-metric", "data-tone": metric.tone ?? "neutral" }, ...body);
      }
      const button = el(
        "button",
        { type: "button", class: "rf-metric", "data-tone": metric.tone ?? "neutral", "data-actionable": "true" },
        ...body,
      );
      button.addEventListener("click", () => metric.onAct?.());
      return button;
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Segments and filters
 * ------------------------------------------------------------------ */

export interface Segment {
  readonly id: string;
  readonly label: string;
  /** Shown after the label. Always the real count, including zero. */
  readonly count: number;
}

/**
 * A single-select segment control. Rendered as a radio group rather than a row
 * of buttons so arrow keys move between options and the current option is
 * announced as "selected" without extra ARIA.
 */
export function segmentControl(
  name: string,
  segments: readonly Segment[],
  selected: string,
  onSelect: (id: string) => void,
): HTMLElement {
  return el(
    "div",
    { class: "rf-segments", role: "radiogroup", "aria-label": name },
    ...segments.map((segment) => {
      const button = el(
        "button",
        {
          type: "button",
          class: "rf-segment",
          role: "radio",
          "aria-checked": segment.id === selected ? "true" : "false",
          "data-selected": segment.id === selected ? "true" : "false",
        },
        el("span", { class: "rf-segment-label" }, segment.label),
        el("span", { class: "rf-segment-count" }, String(segment.count)),
      );
      button.addEventListener("click", () => onSelect(segment.id));
      return button;
    }),
  );
}

/** A labelled search box. The label is visible on mobile and hidden on desktop. */
export function searchField(
  label: string,
  value: string,
  placeholder: string,
  onInput: (value: string) => void,
): HTMLElement {
  const input = el("input", {
    type: "search",
    class: "rf-search-input",
    value,
    placeholder,
    "aria-label": label,
    autocomplete: "off",
    // The value never leaves the browser: it filters an already-loaded list and
    // is not written to the URL, a log or any request.
    enterkeyhint: "search",
  }) as HTMLInputElement;
  input.addEventListener("input", () => onInput(input.value));
  return el("div", { class: "rf-search" }, input);
}

/* ------------------------------------------------------------------ *
 * Dangerous work
 * ------------------------------------------------------------------ */

export interface ConfirmOptions {
  /** The verb, e.g. "接続を解除". */
  readonly action: string;
  /** Precisely what will change, listed. Never "この操作は元に戻せません" alone. */
  readonly impact: readonly string[];
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly busy?: boolean;
}

/**
 * Inline confirmation for an irreversible or outward-facing action. It states
 * the blast radius before the button, and the confirm control is never the
 * default focus target.
 */
export function confirmPanel(options: ConfirmOptions): HTMLElement {
  const cancel = el("button", { type: "button", class: "rf-secondary-button" }, "やめる");
  const confirm = el(
    "button",
    { type: "button", class: "rf-danger-button", disabled: options.busy === true ? true : null },
    options.busy === true ? "実行中…" : options.confirmLabel,
  );
  cancel.addEventListener("click", () => options.onCancel());
  confirm.addEventListener("click", () => options.onConfirm());
  return el(
    "div",
    { class: "rf-confirm", role: "group", "aria-label": `${options.action}の確認` },
    el("p", { class: "rf-confirm-title" }, `${options.action}すると次が起きます`),
    el("ul", { class: "rf-confirm-impact" }, ...options.impact.map((line) => el("li", null, line))),
    el("div", { class: "rf-confirm-actions" }, cancel, confirm),
  );
}

/**
 * An action the domain does not expose yet. Shown as text, never as a disabled
 * button: a greyed-out control implies the feature exists and is merely locked,
 * which is a lie the user cannot act on.
 */
export function unavailableAction(what: string, why: string): HTMLElement {
  return el(
    "p",
    { class: "rf-unavailable" },
    el("span", { class: "rf-unavailable-tag" }, "未接続"),
    el("span", null, `${what} — ${why}`),
  );
}
