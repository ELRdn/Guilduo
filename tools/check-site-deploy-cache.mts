import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Public HTML only: no credentials or API calls. Run before replacing hashed assets. */
export async function assertSiteDeployCacheSafe(siteUrl: string, fetcher: typeof fetch = fetch): Promise<void> {
  const origin = new URL(siteUrl);
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("APPWRITE_SITE_URL must be an HTTP(S) origin.");
  }
  for (const path of ["/", "/next/relay-forge/"]) {
    const response = await fetcher(new URL(path, origin), { redirect: "error", signal: AbortSignal.timeout(20_000) });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`Public shell check failed with HTTP ${response.status}; deployment not started.`);
    const status = response.headers.get("cf-cache-status")?.trim().toUpperCase();
    if (status && status !== "DYNAMIC" && status !== "BYPASS") {
      throw new Error("Public HTML is CDN-cacheable. Disable both Guilduo public app shell Cache and Cache Response Rules, wait for propagation, and retry. Re-enable them after verifying the deployment and shell expiry. See docs/appwrite-site-routing.md.");
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assertSiteDeployCacheSafe(process.argv[2] || "").then(() => {
    console.log("Public HTML cache deployment guard passed.");
  }).catch(() => {
    // Do not emit fetch errors or response bodies that may contain upstream data.
    console.error("Site deployment blocked: public HTML must be reachable and uncached before replacing assets. Disable both public app shell Cache and Cache Response Rules and retry after propagation. See docs/appwrite-site-routing.md.");
    process.exitCode = 1;
  });
}
