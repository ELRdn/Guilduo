/**
 * Screen state vocabulary and formatting helpers — DOM-free.
 *
 * These live apart from `runtime.ts` so an adapter can describe a non-ready
 * condition, or format a count, without importing anything that touches the
 * document. That is what lets the five adapters be unit-tested under the node
 * project.
 */

import { formatDate, getLocale, t } from "../../../i18n.ts";
import { relayText } from "../relay-copy.ts";

export type ScreenId = "quests" | "network" | "party" | "battle" | "connections" | "skills";

/**
 * One vocabulary for every non-ready condition. A screen never invents a new
 * word for an existing meaning, and never shows a full-screen spinner: each of
 * these states says what is known, what is not, and what to do next.
 */
export type ScreenStatus =
  | "ready"
  /** First load. Regions keep their final geometry so nothing shifts. */
  | "loading"
  /** Nothing exists yet — this is a starting point, not a failure. */
  | "empty"
  /** Some regions loaded, some did not. What loaded stays usable. */
  | "partial"
  | "error"
  /** The signed-in user lacks the scope this screen needs. */
  | "permission"
  /** No connection. Reads are served from the last snapshot; writes are held. */
  | "offline"
  /** Data is older than the freshness window. Reads fine, writes held. */
  | "stale"
  /** Someone or something changed the object under us. */
  | "conflict";

export interface ScreenNotice {
  readonly status: Exclude<ScreenStatus, "ready">;
  /** What is true right now, in one sentence. */
  readonly detail: string;
  /** What the user can do about it. Omitted when there is nothing to do. */
  readonly action?: { readonly label: string; readonly onAct: () => void };
}

/** Counts use the shared ICU catalogue, including locale-specific plurals. */
export function countLabel(value: number): string {
  return t("relay.count", { count: value });
}

/** Elapsed duration since an event, in the selected locale. */
export function elapsedLabel(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return relayText("justNow");
  const wholeMinutes = Math.round(minutes);
  const duration = (value: number, unit: "minute" | "hour" | "day") => new Intl.NumberFormat(getLocale(), { style: "unit", unit, unitDisplay: "short" }).format(value);
  if (wholeMinutes < 60) return duration(wholeMinutes, "minute");
  const hours = Math.floor(wholeMinutes / 60);
  if (hours >= 24) return duration(Math.floor(hours / 24), "day");
  return wholeMinutes % 60 === 0 ? duration(hours, "hour") : `${duration(hours, "hour")} ${duration(wholeMinutes % 60, "minute")}`;
}

/** Locale-aware month/day/time, or `—` when absent or invalid. */
export function instantLabel(iso: string): string {
  if (iso === "") return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return formatDate(at, { year: undefined, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
