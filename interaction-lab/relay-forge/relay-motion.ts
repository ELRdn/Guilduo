/** Feedback follows a confirmed write. Never run this for previews or polling. */
export function relaySuccess(element: HTMLElement): void {
  let enabled = true;
  try { enabled = localStorage.getItem("questforge-relay-motion") !== "off"; } catch { /* Preference storage is optional. */ }
  if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.animate?.([{ opacity: 0.45 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
}
