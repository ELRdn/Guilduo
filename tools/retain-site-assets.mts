import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RETAINED_ASSET_MANIFEST = "/assets/retained-releases.json";
export const ASSET_RETENTION_MS = 48 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const hashedName = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;
type Asset = { name: string; sha256: string; size: number; retiredAt: number | null };
type Manifest = { version: 1; generatedAt: number; assets: Asset[] };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function boundedBody(response: Response, max: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Public asset exceeds retention limit.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error("Public asset exceeds retention limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

function parseManifest(bytes: Buffer, now: number): Manifest {
  const value = JSON.parse(bytes.toString("utf8")) as Manifest;
  if (value.version !== 1 || !Number.isSafeInteger(value.generatedAt) || value.generatedAt < 0 || value.generatedAt > now + 60_000
    || !Array.isArray(value.assets) || value.assets.length > 10_000) throw new Error("Invalid retained asset manifest.");
  const names = new Set<string>();
  let size = 0;
  for (const asset of value.assets) {
    if (!asset || typeof asset.name !== "string" || !hashedName.test(asset.name) || names.has(asset.name)
      || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > MAX_FILE_BYTES
      || (asset.retiredAt !== null && (!Number.isSafeInteger(asset.retiredAt) || asset.retiredAt < 0 || asset.retiredAt > value.generatedAt))) {
      throw new Error("Invalid retained asset entry.");
    }
    names.add(asset.name);
    size += asset.size;
    if (size > MAX_TOTAL_BYTES) throw new Error("Retained assets exceed deployment budget.");
  }
  return value;
}

/** Retain public Vite output only. Never read user state, credentials, or arbitrary URLs. */
export async function retainSiteAssets(options: {
  siteUrl: string; dist: string; now?: number; fetcher?: typeof fetch; bootstrap?: boolean;
}): Promise<{ current: number; retained: number; bytes: number; bootstrapped: boolean }> {
  const origin = new URL(options.siteUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Asset source must be an HTTPS origin.");
  }
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid retention time.");
  const fetcher = options.fetcher ?? fetch;
  const directory = resolve(options.dist, "assets");
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("Expected a real build assets directory.");
  if (await lstat(resolve(directory, "retained-releases.json")).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) throw new Error("Asset retention requires a fresh build directory.");
  const request = (path: string) => fetcher(new URL(path, origin), { redirect: "error", signal: AbortSignal.timeout(20_000) });
  const current = new Map<string, Asset>();
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!hashedName.test(entry.name)) continue;
    if (!entry.isFile()) throw new Error("Build asset must be a regular file.");
    const info = await lstat(resolve(directory, entry.name));
    if (info.size > MAX_FILE_BYTES) throw new Error("Build asset exceeds retention limit.");
    const data = await readFile(resolve(directory, entry.name));
    bytes += data.byteLength;
    if (bytes > MAX_TOTAL_BYTES) throw new Error("Build assets exceed deployment budget.");
    current.set(entry.name, { name: entry.name, sha256: digest(data), size: data.byteLength, retiredAt: null });
  }
  if (!current.size) throw new Error("No hashed build assets found.");

  const manifestResponse = await request(RETAINED_ASSET_MANIFEST);
  const manifestBytes = await boundedBody(manifestResponse, MAX_MANIFEST_BYTES);
  const contentType = manifestResponse.headers.get("content-type") ?? "";
  // Before the first retention release, Appwrite may return its HTML fallback with HTTP 200.
  const bootstrapped = manifestResponse.status === 404 || (manifestResponse.ok && contentType.includes("text/html"));
  if (bootstrapped && !options.bootstrap) throw new Error("Missing retention manifest; explicit first-release bootstrap is required.");
  if (!bootstrapped && (!manifestResponse.ok || !contentType.includes("application/json"))) throw new Error("Cannot read retained asset manifest.");
  const previous = bootstrapped ? [] : parseManifest(manifestBytes, now).assets;
  const output = new Map(current);
  for (const previousAsset of previous) {
    const built = current.get(previousAsset.name);
    if (built) {
      if (built.sha256 !== previousAsset.sha256 || built.size !== previousAsset.size) throw new Error("Hashed asset name collision.");
      continue;
    }
    // Retirement starts when a release first stops shipping this asset, not at its original build date.
    const retiredAt = previousAsset.retiredAt ?? now;
    if (now - retiredAt >= ASSET_RETENTION_MS) continue;
    bytes += previousAsset.size;
    if (bytes > MAX_TOTAL_BYTES) throw new Error("Retained assets exceed deployment budget.");
    const response = await request(`/assets/${previousAsset.name}`);
    if (!response.ok || (response.headers.get("content-type") ?? "").includes("text/html")) throw new Error("Retained asset is missing or returned HTML.");
    const data = await boundedBody(response, MAX_FILE_BYTES);
    if (data.byteLength !== previousAsset.size || digest(data) !== previousAsset.sha256) throw new Error("Retained asset checksum mismatch.");
    await writeFile(resolve(directory, previousAsset.name), data, { flag: "wx" });
    output.set(previousAsset.name, { ...previousAsset, retiredAt });
  }

  // Validate the currently published shell even when a manifest exists: manual/old deployments
  // must not silently reset the retained-release chain. On the first run it must be the same build.
  for (const path of ["/", "/next/relay-forge/"]) {
    const response = await request(path);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) throw new Error("Cannot verify active public shell.");
    const html = (await boundedBody(response, MAX_MANIFEST_BYTES)).toString("utf8");
    let scripts = 0;
    for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+\.(?:js|css))["']/g)) {
      const url = new URL(match[1], new URL(path, origin));
      if (url.origin !== origin.origin || !url.pathname.startsWith("/assets/")) continue;
      const name = url.pathname.slice("/assets/".length);
      const asset = output.get(name);
      if (!asset) throw new Error("Active shell references an unretained asset. Seed retention from the currently deployed build first.");
      if (name.endsWith(".js")) scripts++;
      if (bootstrapped) {
        const active = await request(url.pathname);
        if (!active.ok) throw new Error("Cannot verify initial build asset.");
        const data = await boundedBody(active, MAX_FILE_BYTES);
        if (digest(data) !== asset.sha256) throw new Error("Initial retention release must match the active build.");
      }
    }
    if (!scripts) throw new Error("Active shell has no verifiable asset entry.");
  }
  const manifest: Manifest = { version: 1, generatedAt: now, assets: [...output.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  await writeFile(resolve(directory, "retained-releases.json"), JSON.stringify(manifest));
  return { current: current.size, retained: output.size - current.size, bytes, bootstrapped };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  retainSiteAssets({ siteUrl: process.argv[2] || "", dist: process.argv[3] || "dist", bootstrap: process.argv[4] === "--bootstrap" }).then(result => {
    console.log("Public asset retention prepared", result);
  }).catch(() => {
    console.error("Asset retention failed; do not upload this build. Check the active release and public asset manifest.");
    process.exitCode = 1;
  });
}
