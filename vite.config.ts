import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { OFFICIAL_SITE_ORIGIN, WEB_APP_ORIGIN } from "./site-routing.ts";

// The checkout is exposed through a Windows path alias while Node resolves the
// files on another drive. Give Vite the same real root it sees for HTML inputs
// so emitted page names remain relative.
const root = realpathSync(process.cwd());
// SEO/share metadata belongs to the official site, not to the currently active
// Appwrite Sites deployment. Keep the deployment origin in WEB_APP_URL for
// runtime/auth purposes and use PUBLIC_SITE_URL for the canonical public host.
const PUBLIC_SITE_ORIGIN_FALLBACK = OFFICIAL_SITE_ORIGIN;
const WEB_APP_ORIGIN_FALLBACK = WEB_APP_ORIGIN;

function getPublicSiteOrigin(): string {
  const configured = String(process.env.PUBLIC_SITE_URL || "").trim();
  if (!configured) return PUBLIC_SITE_ORIGIN_FALLBACK;
  try {
    const url = new URL(configured);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("invalid URL");
    return url.origin;
  } catch {
    throw new Error(`PUBLIC_SITE_URL must be an http or https origin: ${configured}`);
  }
}

function getWebAppOrigin(): string {
  const configured = String(process.env.WEB_APP_URL || "").trim();
  if (!configured) return WEB_APP_ORIGIN_FALLBACK;
  try {
    const url = new URL(configured);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("invalid URL");
    return url.origin;
  } catch {
    throw new Error(`WEB_APP_URL must be an http or https origin: ${configured}`);
  }
}

function injectPublicBrandMetadata(): Plugin {
  return {
    name: "inject-guilduo-public-brand-metadata",
    transformIndexHtml(html) {
      return html
        .replaceAll("__GUILDUO_PUBLIC_ORIGIN__", getPublicSiteOrigin())
        .replaceAll("__GUILDUO_WEB_APP_ORIGIN__", getWebAppOrigin());
    },
  };
}

function copyRuntimeAssets(source: string, destination: string): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyRuntimeAssets(sourcePath, destinationPath);
      continue;
    }
    const extension = extname(entry.name).toLowerCase();
    const relativeToIcons = relative(join(root, "assets", "icons"), sourcePath);
    const isPwaIcon = !relativeToIcons.startsWith("..") && !relativeToIcons.startsWith("/");
    const relativeToBrand = relative(join(root, "assets", "brand"), sourcePath);
    const isBrandAsset = relativeToBrand !== ""
      && !relativeToBrand.startsWith("..")
      && !isAbsolute(relativeToBrand);
    const isBrandAssetFile = isBrandAsset && [".png", ".svg"].includes(extension);
    if (extension !== ".webp" && !(isPwaIcon && extension === ".png") && !isBrandAssetFile) continue;
    mkdirSync(dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath);
  }
}

const copyQuestForgeRuntime = {
  name: "copy-questforge-runtime",
  closeBundle() {
    const dist = join(root, "dist");
    cpSync(join(root, "manifest.webmanifest"), join(dist, "manifest.webmanifest"));
    cpSync(join(root, "manifest.en.webmanifest"), join(dist, "manifest.en.webmanifest"));
    cpSync(join(root, "service-worker.ts"), join(dist, "service-worker.js"));
    cpSync(join(root, "api"), join(dist, "api"), { recursive: true });
    copyRuntimeAssets(join(root, "assets"), join(dist, "assets"));
    const generatedLab = join(dist, "interaction-lab");
    const betaDestination = join(dist, "next");
    if (existsSync(generatedLab)) {
      rmSync(betaDestination, { recursive: true, force: true });
      renameSync(generatedLab, betaDestination);
    }
  },
};

export default defineConfig({
  root,
  appType: "mpa",
  base: "./",
  publicDir: false,
  plugins: [react(), injectPublicBrandMetadata(), copyQuestForgeRuntime],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(root, "index.html"),
        landingJa: resolve(root, "lp/index.html"),
        landingEn: resolve(root, "lp/en/index.html"),
        next: resolve(root, "interaction-lab/index.html"),
        // Relay Forge successor shell. It builds into dist/interaction-lab/
        // relay-forge and is carried to dist/next/relay-forge by the rename in
        // copyQuestForgeRuntime, matching NEWDESIGN.md section 29 Phase 1.
        relayForge: resolve(root, "interaction-lab/relay-forge/index.html"),
      },
    },
  },
});
