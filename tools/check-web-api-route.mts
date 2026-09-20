import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Public, unauthenticated probe; never obtain credentials or mutate data. */
export async function assertWebApiRoute(origin: string, fetcher: typeof fetch = fetch): Promise<void> {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Expected Web App HTTPS origin.");
  const response = await fetcher(`${url.origin}/api/v1/workspace/bootstrap`, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (response.status !== 401 || !response.headers.get("content-type")?.includes("application/json") || response.headers.get("cache-control") !== "no-store") throw new Error("Web API route is missing or unsafe.");
  const body = await response.json() as { error?: { code?: string } };
  if (body.error?.code !== "unauthorized") throw new Error("Unexpected Web API authentication response.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assertWebApiRoute(process.argv[2] || "").then(() => console.log("Web API route authentication/cache probe passed.")).catch(() => {
    console.error("Web API route probe failed. Verify the exact /api/v1/* Worker Route before enabling or deploying the browser transport.");
    process.exitCode = 1;
  });
}
