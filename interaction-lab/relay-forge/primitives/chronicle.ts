/**
 * Execution Chronicle — NEWDESIGN.md sections 14.4 and 22.5.
 *
 * Append-only operational history that reads as "who did what, when, to which
 * object, and what happened next". It is not a chat feed: there is no bubble, no
 * card, and no avatar-led layout. Contiguous low-risk System events collapse;
 * review, blocked, failed, Human and Handoff events never do.
 *
 * Row minimum 40px, timestamp column 72px, Actor node 24px (section 14.4).
 */

import { type Actor, type ChronicleEvent } from "../model.ts";
import { actorAvatar } from "./avatar.ts";
import { el } from "./dom.ts";

/** Section 14.4: only low-risk System noise may be grouped. */
const COLLAPSIBLE: ReadonlySet<ChronicleEvent["kind"]> = new Set(["system_event"]);

type Entry =
  | { readonly type: "event"; readonly event: ChronicleEvent }
  | { readonly type: "group"; readonly events: readonly ChronicleEvent[] };

function group(events: readonly ChronicleEvent[]): readonly Entry[] {
  const entries: Entry[] = [];
  let index = 0;
  while (index < events.length) {
    const event = events[index];
    if (!COLLAPSIBLE.has(event.kind)) {
      entries.push({ type: "event", event });
      index += 1;
      continue;
    }
    let length = 1;
    while (index + length < events.length && COLLAPSIBLE.has(events[index + length].kind)) length += 1;
    if (length >= 2) {
      entries.push({ type: "group", events: events.slice(index, index + length) });
    } else {
      entries.push({ type: "event", event });
    }
    index += length;
  }
  return entries;
}

function eventRow(event: ChronicleEvent, actors: ReadonlyMap<string, Actor>): HTMLElement {
  const actor = actors.get(event.actorId);
  return el(
    "li",
    { class: "rf-chronicle-row", "data-kind": event.kind },
    el("span", { class: "rf-chronicle-time" }, event.timeLabel),
    el(
      "span",
      { class: "rf-chronicle-actor" },
      actor === undefined ? null : actorAvatar(actor, { size: "lens" }),
    ),
    el(
      "span",
      { class: "rf-chronicle-copy" },
      el(
        "span",
        { class: "rf-chronicle-sentence" },
        el("b", { class: "rf-chronicle-name" }, actor?.name ?? "Unknown"),
        el("span", { class: "rf-chronicle-verb" }, ` ${event.verb} `),
        el("span", { class: "rf-chronicle-object" }, event.object),
      ),
      el("span", { class: "rf-chronicle-detail" }, event.detail),
    ),
  );
}

function groupRow(events: readonly ChronicleEvent[], actors: ReadonlyMap<string, Actor>): HTMLElement {
  const first = events[0];
  const actor = actors.get(first.actorId);
  const details = el("ul", { class: "rf-chronicle-nested" }, ...events.map((event) => eventRow(event, actors)));
  const summary = el(
    "summary",
    { class: "rf-chronicle-row rf-chronicle-row--group", "data-kind": "system_event" },
    el("span", { class: "rf-chronicle-time" }, `${events[events.length - 1].timeLabel}–${first.timeLabel}`),
    el(
      "span",
      { class: "rf-chronicle-actor" },
      actor === undefined ? null : actorAvatar(actor, { size: "lens" }),
    ),
    el(
      "span",
      { class: "rf-chronicle-copy" },
      el(
        "span",
        { class: "rf-chronicle-sentence" },
        el("b", { class: "rf-chronicle-name" }, actor?.name ?? "System"),
        el("span", { class: "rf-chronicle-verb" }, " recorded "),
        el("span", { class: "rf-chronicle-object" }, `${events.length} system events`),
      ),
      el("span", { class: "rf-chronicle-detail" }, "低リスクのため折りたたみ済み"),
    ),
  );
  return el("li", { class: "rf-chronicle-item" }, el("details", { class: "rf-chronicle-group" }, summary, details));
}

export function executionChronicle(
  events: readonly ChronicleEvent[],
  actors: ReadonlyMap<string, Actor>,
): HTMLElement {
  return el(
    "ol",
    { class: "rf-chronicle", "aria-label": "Execution Chronicle", "aria-live": "polite" },
    ...group(events).map((entry) => (
      entry.type === "group"
        ? groupRow(entry.events, actors)
        : el("li", { class: "rf-chronicle-item" }, eventRow(entry.event, actors))
    )),
  );
}

/**
 * Desktop Chronicle strip — NEWDESIGNv2.md section 8.
 *
 * A single fixed line at the bottom of Command carrying the latest important
 * event plus `View all`. It is history, not a monitoring ticker: nothing here
 * animates, and it must not compete with the Selected Quest for attention.
 */
export function chronicleStrip(
  events: readonly ChronicleEvent[],
  actors: ReadonlyMap<string, Actor>,
  options: { readonly newCount: number; readonly expanded: boolean; readonly onToggle: () => void },
): HTMLElement {
  const latest = events[0];
  const actor = latest === undefined ? undefined : actors.get(latest.actorId);

  const toggle = el(
    "button",
    {
      type: "button",
      class: "rf-icon-button rf-chronicle-toggle",
      "aria-expanded": options.expanded ? "true" : "false",
      title: options.expanded ? "Collapse Execution Chronicle" : "Expand Execution Chronicle",
    },
    el("span", { class: "rf-visually-hidden" }, options.expanded ? "Collapse Execution Chronicle" : "Expand Execution Chronicle"),
    el("span", { class: "rf-chevron-mark", "aria-hidden": "true" }),
  );
  toggle.addEventListener("click", options.onToggle);

  const viewAll = el(
    "button",
    { type: "button", class: "rf-quiet-button rf-chronicle-viewall" },
    "View all",
    el("span", { class: "rf-chevron-inline", "aria-hidden": "true" }),
  );
  viewAll.addEventListener("click", options.onToggle);

  return el(
    "section",
    { class: "rf-chronicle-strip", "aria-label": "Execution Chronicle" },
    toggle,
    el("span", { class: "rf-region-label" }, "Execution Chronicle"),
    options.newCount > 0
      ? el("span", { class: "rf-chronicle-new" }, `${options.newCount} new`)
      : null,
    latest === undefined
      ? el("span", { class: "rf-chronicle-empty" }, "履歴はまだありません")
      : el(
        "span",
        { class: "rf-chronicle-latest" },
        el("span", { class: "rf-chronicle-time" }, latest.timeLabel),
        actor === undefined ? null : actorAvatar(actor, { size: "row" }),
        el(
          "span",
          { class: "rf-chronicle-sentence" },
          el("b", { class: "rf-chronicle-name" }, actor?.name ?? "Unknown"),
          el("span", { class: "rf-chronicle-verb" }, ` ${latest.verb} `),
          el("span", { class: "rf-chronicle-object" }, latest.object),
        ),
        el("span", { class: "rf-chronicle-detail" }, latest.detail),
      ),
    viewAll,
  );
}
