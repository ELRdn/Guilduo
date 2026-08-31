/**
 * Public host routing for the single Appwrite Sites deployment.
 *
 * Appwrite serves one static file tree for a site's active deployment. The
 * host-aware part therefore lives at the Cloudflare edge as two URL Rewrite
 * rules. Keep the contract here so the rules, docs, and tests agree without
 * making the browser expose the compatibility paths as canonical URLs.
 */

export const OFFICIAL_SITE_ORIGIN = "https://guilduo.com";
export const WEB_APP_ORIGIN = "https://app.guilduo.com";

export const OFFICIAL_SITE_HOST = "guilduo.com";
export const WWW_HOST = "www.guilduo.com";
export const WEB_APP_HOST = "app.guilduo.com";

export const LP_ENTRY_PATH = "/lp/";
export const RELAY_FORGE_ENTRY_PATH = "/next/relay-forge/";

export const COMPATIBILITY_PATHS = Object.freeze([
  "/lp/",
  "/lp/en/",
  "/next/",
  "/next/relay-forge/",
] as const);

export type PublicHostRoute = Readonly<{
  host: typeof OFFICIAL_SITE_HOST | typeof WEB_APP_HOST;
  publicPath: "/";
  deploymentPath: typeof LP_ENTRY_PATH | typeof RELAY_FORGE_ENTRY_PATH;
}>;

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Resolve only the two root rewrites. Any other path is deliberately left to
 * Appwrite unchanged so assets and compatibility URLs cannot be accidentally
 * prefixed by a catch-all rewrite.
 */
export function resolvePublicHostRoute(hostname: string, pathname: string): PublicHostRoute | null {
  if (pathname !== "/") return null;
  const host = normalizeHostname(hostname);
  if (host === OFFICIAL_SITE_HOST) {
    return { host, publicPath: "/", deploymentPath: LP_ENTRY_PATH };
  }
  if (host === WEB_APP_HOST) {
    return { host, publicPath: "/", deploymentPath: RELAY_FORGE_ENTRY_PATH };
  }
  return null;
}

/** Apply the same internal path change as the edge rule, for local contract tests. */
export function applyPublicHostRewrite(input: URL | string): URL {
  const url = new URL(input.toString());
  const route = resolvePublicHostRoute(url.hostname, url.pathname);
  if (route) url.pathname = route.deploymentPath;
  return url;
}

/** Resolve the separate www-to-apex redirect while preserving path/query. */
export function resolveWwwRedirect(input: URL | string): URL | null {
  const source = new URL(input.toString());
  if (normalizeHostname(source.hostname) !== WWW_HOST) return null;
  const target = new URL(OFFICIAL_SITE_ORIGIN);
  target.pathname = source.pathname;
  target.search = source.search;
  return target;
}

export function isCompatibilityPath(pathname: string): boolean {
  return COMPATIBILITY_PATHS.includes(pathname as typeof COMPATIBILITY_PATHS[number]);
}

export const CLOUDFLARE_SITE_REWRITE_RULES = Object.freeze([
  {
    name: "Guilduo official root to LP",
    expression: `(http.host eq "${OFFICIAL_SITE_HOST}" and http.request.uri.path eq "/")`,
    deploymentPath: LP_ENTRY_PATH,
  },
  {
    name: "Guilduo app root to Relay Forge",
    expression: `(http.host eq "${WEB_APP_HOST}" and http.request.uri.path eq "/")`,
    deploymentPath: RELAY_FORGE_ENTRY_PATH,
  },
] as const);

export const CLOUDFLARE_WWW_REDIRECT_RULE = Object.freeze({
  name: "Guilduo www to apex",
  expression: `(http.host eq "${WWW_HOST}")`,
  targetOrigin: OFFICIAL_SITE_ORIGIN,
  statusCode: 308,
  preservePathAndQuery: true,
} as const);
