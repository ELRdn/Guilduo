type ResourceSample = { name: string; startTime: number; duration: number; responseEnd: number };

/** ResourceTiming belongs to this navigation, unlike reused CDP response timing on memory cache hits. */
export function reloadResourceTiming(entries: ResourceSample[], origin: string): Record<string, unknown> {
  const phases: Record<string, { startMs: number; durationMs: number }[]> = { account: [], token: [], workspace: [] };
  let assets = 0, lastAssetResponseMs = 0;
  for (const entry of entries) {
    try {
      const url = new URL(entry.name);
      const phase = url.pathname === "/v1/account" ? "account" : url.pathname === "/v1/account/jwts" ? "token"
        : ["/api/v1/workspace/bootstrap", "/v1/workspace/bootstrap"].includes(url.pathname) ? "workspace" : null;
      if (phase && phases[phase].length < 5) phases[phase].push({ startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration) });
      if (url.origin === origin && url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname)) {
        assets++; lastAssetResponseMs = Math.max(lastAssetResponseMs, Math.round(entry.responseEnd));
      }
    } catch { /* Ignore non-URL resource names; never log them. */ }
  }
  return { ...phases, assets, lastAssetResponseMs };
}

