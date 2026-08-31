/**
 * Theme decision logic — deliberately DOM-free and `window`-free at module
 * scope, unlike shell.ts, so it can be unit-tested directly under `node:test`
 * (shell.ts touches `window.matchMedia` at import time and cannot be
 * imported outside a browser).
 *
 * The bug this exists to fix: the old Rail quick-toggle cycled
 * `dark → light → system → dark` without looking at what was actually on
 * screen. Starting from `system` while the OS is dark, the cycle's next
 * step was `dark` — the same thing already rendered — so the click did
 * nothing visible. `nextQuickToggleTheme` always returns the explicit
 * opposite of the *effective* theme, so a click is never a no-op; returning
 * to `system` is a Settings action, not part of this cycle.
 */

export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

export const THEME_KEY = "qf-relay-forge-theme";

/** The theme actually on screen right now, resolving `system` against the OS. */
export function effectiveTheme(preference: ThemePreference, osPrefersDark: boolean): EffectiveTheme {
  if (preference === "light" || preference === "dark") return preference;
  return osPrefersDark ? "dark" : "light";
}

/** What the Rail's quick toggle switches to. Always explicit light/dark, never `system`. */
export function nextQuickToggleTheme(preference: ThemePreference, osPrefersDark: boolean): EffectiveTheme {
  return effectiveTheme(preference, osPrefersDark) === "dark" ? "light" : "dark";
}

/** Guards an untrusted string (URL param, localStorage) back to a valid preference, defaulting to `system`. */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
