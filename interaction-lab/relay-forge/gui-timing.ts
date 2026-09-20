import { reloadResourceTiming } from "./gui-resource-timing.ts";

/** Local console only. No IDs, task text, URLs, credentials, or analytics upload. */
export function reportGuiTiming(action: "reload" | "connect" | "create" | "edit" | "complete", start: number, isCurrent: () => boolean): void {
  if (document.visibilityState !== "visible") return;
  // Called after a confirmed save and render. Two frames include the first
  // paint opportunity, without putting measurement in the operation's await chain.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!isCurrent() || document.visibilityState !== "visible") return;
    console.info("guilduo_gui_timing", JSON.stringify({ action, durationMs: Math.round(performance.now() - start) }));
    if (action === "reload") {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      console.info("guilduo_gui_resource_timing", JSON.stringify({
        htmlResponseMs: Math.round(navigation?.responseEnd ?? 0),
        ...reloadResourceTiming(performance.getEntriesByType("resource") as PerformanceResourceTiming[], location.origin),
      }));
    }
  }));
}
