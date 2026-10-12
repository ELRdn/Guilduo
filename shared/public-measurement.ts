export const PUBLIC_EVENT_NAMES = new Set(["public_page_view", "app_cta_click"]);
export const PUBLIC_SOURCES = new Set(["organic_search", "ai_referral", "campaign", "referral", "direct_unknown"]);
export const PUBLIC_PAGES = new Set([
  "home", "docs_index", "docs_getting-started", "docs_mcp-connection", "docs_codex",
  "docs_claude", "docs_dsh", "docs_opencode", "docs_openclaw", "docs_quests",
  "docs_agents", "docs_human-relay", "docs_permissions", "docs_troubleshooting",
  "docs_faq", "docs_api", "docs_openai", "docs_grok", "docs_muse",
  "solution_mcp-task-management", "solution_ai-agent-handoff",
]);

export function publicPageLabel(path: string): string | undefined {
  if (typeof path !== "string") return undefined;
  if (["/", "/lp/", "/lp/en/"].includes(path)) return "home";
  const docs = path.match(/^\/docs\/(?:en\/)?(?:([a-z-]+)\/)?$/);
  const solution = path.match(/^\/solutions\/(?:en\/)?([a-z-]+)\/$/);
  if (docs?.[1] === "index") return undefined;
  const label = docs ? `docs_${docs[1] || "index"}` : solution ? `solution_${solution[1]}` : "";
  return PUBLIC_PAGES.has(label) ? label : undefined;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

export function classifyPublicSource(href: string, referrer: string): string {
  if (typeof href !== "string") return "direct_unknown";
  let url: URL;
  try { url = new URL(href); } catch { return "direct_unknown"; }
  if (!["http:", "https:"].includes(url.protocol)) return "direct_unknown";
  const medium = (url.searchParams.get("utm_medium") || "").toLowerCase();
  const source = (url.searchParams.get("utm_source") || "").toLowerCase();
  if (["gclid", "dclid", "msclkid", "fbclid"].some(key => url.searchParams.has(key))) return "campaign";
  let referring: URL | undefined;
  try { if (typeof referrer === "string") referring = new URL(referrer); } catch { /* Missing or malformed referrer. */ }
  if (referring && (!["http:", "https:"].includes(referring.protocol) || referring.origin === url.origin)) referring = undefined;
  const host = referring?.hostname.replace(/\.$/, "") || "";
  const searchReferrer = ["google.com", "google.co.jp", "bing.com", "search.yahoo.com", "search.yahoo.co.jp", "duckduckgo.com", "search.brave.com"].some(domain => hostMatches(host, domain));
  if (["googleadservices.com", "googlesyndication.com", "doubleclick.net"].some(domain => hostMatches(host, domain)) || (searchReferrer && referring?.pathname === "/aclk")) return "campaign";
  const tags = ["utm_medium", "utm_source", "utm_campaign"];
  if (tags.some(key => url.searchParams.getAll(key).length > 1)) return "campaign";
  if (tags.some(key => url.searchParams.has(key))) {
    if (["organic", "organic_search"].includes(medium) && ["google", "bing", "yahoo", "duckduckgo", "brave"].includes(source)) return "organic_search";
    if (["chatgpt", "perplexity", "claude", "copilot", "gemini"].includes(source) && ["", "referral", "ai", "ai_referral"].includes(medium)) return "ai_referral";
    return "campaign";
  }
  if (!referring) return "direct_unknown";
  if (["chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "copilot.microsoft.com", "gemini.google.com"].some(domain => hostMatches(host, domain))) return "ai_referral";
  if (searchReferrer) return "organic_search";
  return "referral";
}

export function validPublicEvent(event: Record<string, unknown>): boolean {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  if (!["kind", "source", "status", "surface"].every(key => typeof event[key] === "string")) return false;
  return PUBLIC_PAGES.has(String(event.kind)) && PUBLIC_SOURCES.has(String(event.source))
    && ["ja", "en"].includes(String(event.status))
    && event.surface === (event.kind === "home" ? "public_lp" : String(event.kind).startsWith("docs_") ? "public_docs" : "public_solutions");
}
