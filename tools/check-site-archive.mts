import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASSET_RETENTION_MS, RETAINED_ASSET_MANIFEST, boundedBody, parseManifest } from "./retain-site-assets.mts";

type ArchivedFile = { size: number; sha256: string; text?: string };

/** Inspect the actual uploaded bytes, not the dist directory used to prepare them. */
export async function assertSiteArchiveSafe(options: {
  archive: string; siteUrl: string; now?: number; fetcher?: typeof fetch;
}): Promise<void> {
  const now = options.now ?? Date.now();
  const origin = new URL(options.siteUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Archive verification requires an HTTPS origin.");
  }
  const files = JSON.parse(execFileSync(process.platform === "win32" ? "python" : "python3", [
    fileURLToPath(new URL("./inspect-site-archive.py", import.meta.url)), resolve(options.archive),
  ], { encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })) as Record<string, ArchivedFile>;
  const manifestText = files[RETAINED_ASSET_MANIFEST.slice(1)]?.text;
  if (!manifestText) throw new Error("Archive has no retained asset manifest.");
  const manifest = parseManifest(Buffer.from(manifestText), now);
  if (now - manifest.generatedAt > 60 * 60 * 1000) throw new Error("Archive retention is stale; prepare a fresh build.");
  const included = new Map(manifest.assets.map(asset => [asset.name, asset]));
  for (const asset of included.values()) {
    const file = files[`assets/${asset.name}`];
    if (!file || file.size !== asset.size || file.sha256 !== asset.sha256) throw new Error("Archive asset is missing or corrupted.");
  }
  // Every built hashed file must join the manifest, including lazily imported chunks.
  for (const name of Object.keys(files)) {
    if (name !== RETAINED_ASSET_MANIFEST.slice(1) && /^assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(name) && !included.has(name.slice(7))) {
      throw new Error("Archive contains an untracked hashed asset.");
    }
  }
  const request = (path: string) => (options.fetcher ?? fetch)(new URL(path, origin), {
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  const response = await request(RETAINED_ASSET_MANIFEST);
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) {
    await response.body?.cancel();
    throw new Error("Cannot verify the published retention chain.");
  }
  const previous = parseManifest(await boundedBody(response, 2 * 1024 * 1024), now);
  if (manifest.generatedAt < previous.generatedAt) throw new Error("Archive predates the active deployment.");
  for (const asset of previous.assets) {
    if (asset.retiredAt !== null && now - asset.retiredAt >= ASSET_RETENTION_MS) continue;
    const kept = included.get(asset.name);
    if (!kept || kept.sha256 !== asset.sha256 || kept.size !== asset.size) throw new Error("Archive drops a required previous asset.");
    if (kept.retiredAt !== null && (asset.retiredAt === null
      ? kept.retiredAt !== manifest.generatedAt
      : kept.retiredAt !== asset.retiredAt)) throw new Error("Archive changed an asset retirement time.");
  }
  const checkShell = (html: string) => {
    let scripts = 0;
    for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
      const url = new URL(match[1], new URL("/next/relay-forge/", origin));
      if (url.origin !== origin.origin || !url.pathname.startsWith("/assets/") || !/\.(js|css)$/.test(url.pathname)) continue;
      if (!included.has(url.pathname.slice(8))) throw new Error("Shell references an asset absent from the archive.");
      if (url.pathname.endsWith(".js")) scripts++;
    }
    if (!scripts) throw new Error("Shell has no verifiable script entry.");
  };
  checkShell(files["next/relay-forge/index.html"]?.text ?? "");
  for (const path of ["/", "/next/relay-forge/"]) {
    const shell = await request(path);
    if (!shell.ok || !(shell.headers.get("content-type") ?? "").includes("text/html")) {
      await shell.body?.cancel();
      throw new Error("Cannot verify the active shell.");
    }
    checkShell((await boundedBody(shell, 2 * 1024 * 1024)).toString("utf8"));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assertSiteArchiveSafe({ archive: process.argv[2] || "", siteUrl: process.argv[3] || "" }).then(() => {
    console.log("Deployment archive retention verified.");
  }).catch(() => {
    console.error("Archive verification failed; rebuild with current retained assets before uploading.");
    process.exitCode = 1;
  });
}
