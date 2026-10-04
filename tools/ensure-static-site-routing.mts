import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Appwrite's optional SPA fallback turns missing static documents into HTTP 200.
// Guilduo's app views use hash navigation; every public entry has a real HTML file.
const mutableFields = ["name", "framework", "enabled", "logging", "timeout",
  "installCommand", "buildCommand", "startCommand", "outputDirectory", "buildRuntime",
  "adapter", "fallbackFile", "installationId", "providerRepositoryId", "providerBranch",
  "providerSilentMode", "providerRootDirectory", "providerBranches", "providerPaths",
  "buildSpecification", "runtimeSpecification", "deploymentRetention", "scopes"] as const;
type Site = Record<string, unknown>;

export function staticRoutingPayload(site: Site, siteId: string): Site | undefined {
  assert.equal(site.$id, siteId, "Site identity mismatch");
  assert.equal(site.adapter, "static", "Only the reviewed static Site can be configured");
  assert.equal(typeof site.name, "string");
  assert.equal(typeof site.framework, "string");
  if (site.fallbackFile === "") return undefined;
  assert.equal(site.fallbackFile, "index.html", "Unexpected fallback; configuration left unchanged");
  const payload: Site = {};
  for (const field of mutableFields) if (Object.hasOwn(site, field)) payload[field] = site[field];
  payload.fallbackFile = "";
  return payload;
}

export async function ensureStaticSiteRouting(
  env: NodeJS.ProcessEnv = process.env, directory = "dist", fetcher: typeof fetch = fetch,
): Promise<"unchanged" | "updated"> {
  // Do not apply this setting to an archive that depends on arbitrary SPA paths.
  for (const file of ["index.html", "lp/index.html", "lp/en/index.html", "next/index.html",
    "next/relay-forge/index.html", "privacy/index.html", "terms/index.html",
    "docs/index.html", "docs/en/index.html"]) await access(resolve(directory, file));
  const endpoint = new URL(env.APPWRITE_SITE_ENDPOINT ?? "");
  assert.equal(endpoint.protocol, "https:");
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash);
  const siteId = env.APPWRITE_SITE_ID;
  assert.ok(siteId && env.APPWRITE_PROJECT_ID && env.APPWRITE_DEPLOY_KEY, "Missing Site deployment configuration");
  const url = `${endpoint.href.replace(/\/$/, "")}/sites/${encodeURIComponent(siteId)}`;
  const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": env.APPWRITE_DEPLOY_KEY, "Content-Type": "application/json" };
  const read = async (): Promise<Site> => {
    const response = await fetcher(url, { headers, redirect: "error", signal: AbortSignal.timeout(20_000) });
    assert.ok(response.ok, `Site configuration read failed: HTTP ${response.status}`);
    return await response.json() as Site;
  };
  const before = await read();
  const payload = staticRoutingPayload(before, siteId);
  if (!payload) return "unchanged";
  const response = await fetcher(url, { method: "PUT", headers, body: JSON.stringify(payload),
    redirect: "error", signal: AbortSignal.timeout(20_000) });
  assert.ok(response.ok, `Site configuration update failed: HTTP ${response.status}`);
  await response.arrayBuffer();
  const after = await read();
  assert.equal(after.$id, before.$id);
  assert.equal(after.fallbackFile, "", "Static not-found configuration did not persist");
  for (const field of mutableFields) if (field !== "fallbackFile" && Object.hasOwn(before, field)) {
    assert.deepEqual(after[field], before[field], `Unrelated Site field changed: ${field}`);
  }
  assert.equal(after.deploymentId, before.deploymentId, "Active deployment changed during configuration");
  return "updated";
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  ensureStaticSiteRouting(process.env, process.argv[2]).then(result => {
    console.log(`Static Site not-found routing: ${result}; no SPA fallback.`);
  }).catch(() => {
    // Never print API bodies, headers, keys or provider configuration.
    console.error("Static Site routing verification failed. Review the Site's adapter and fallback configuration.");
    process.exitCode = 1;
  });
}
