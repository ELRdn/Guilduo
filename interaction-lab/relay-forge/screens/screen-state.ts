/**
 * Screen state vocabulary and formatting helpers — DOM-free.
 *
 * These live apart from `runtime.ts` so an adapter can describe a non-ready
 * condition, or format a count, without importing anything that touches the
 * document. That is what lets the five adapters be unit-tested under the node
 * project.
 */

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

/**
 * Everything a screen renderer is allowed to reach. Notably it does NOT get the
 * shell's state object: a screen cannot mutate selection or navigation directly,
 * it asks through these callbacks, which keeps the single-selection rule of
 * NEWDESIGNv2 section 10 intact across six screens instead of one.
 */

/** `12` → `12件`. Kept here so counts read identically on every screen. */
export function countLabel(value: number): string {
  return `${value}件`;
}

/** Minutes since an event, phrased the way Command's Attention Shelf phrases it. */
export function elapsedLabel(minutes: number): string {
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${Math.round(minutes)}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間${Math.round(minutes % 60)}分`;
  return `${Math.floor(hours / 24)}日`;
}

/** ISO instant → `MM/DD HH:MM`, or `—` when the field is genuinely absent. */
export function instantLabel(iso: string): string {
  if (iso === "") return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
