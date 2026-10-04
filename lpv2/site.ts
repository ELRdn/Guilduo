// Page chrome shared by LPv2 and later editions: theme choice and public CTA links.
import "../runtime-config.js";
import { resolvePublicUrl } from "../lp/config";

const en = document.documentElement.lang === "en";
const text = (ja: string, english: string): string => en ? english : ja;
const theme = document.querySelector<HTMLSelectElement>("[data-theme-control]")!;
const systemDark = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(choice: string): void {
  theme.value = ["dark", "light", "system"].includes(choice) ? choice : "dark";
  document.documentElement.dataset.theme = theme.value === "system" ? (systemDark.matches ? "dark" : "light") : theme.value;
}
try { applyTheme(localStorage.getItem("guilduo-lpv2-theme") ?? "dark"); } catch { applyTheme("dark"); }
theme.addEventListener("change", () => {
  applyTheme(theme.value);
  try { localStorage.setItem("guilduo-lpv2-theme", theme.value); } catch { /* Theme still applies for this view. */ }
});
systemDark.addEventListener("change", () => applyTheme(theme.value));

for (const [selector, value] of [
  ["[data-join-cta]", globalThis.QuestForgeConfig?.joinGuildUrl],
  ["[data-source-cta]", globalThis.QuestForgeConfig?.sourceUrl],
] as const) {
  document.querySelectorAll<HTMLAnchorElement>(selector).forEach(link => {
    // Fall back to the published URL written in the HTML when runtime config omits it.
    const url = resolvePublicUrl(value, location.href, location.origin)
      ?? resolvePublicUrl(link.getAttribute("href"), location.href, location.origin);
    if (url) { link.href = url; }
    else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.title = text("公開準備中", "Available soon");
      link.append(document.createTextNode(text("（準備中）", " (soon)")));
    }
  });
}
