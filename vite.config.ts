import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The checkout is exposed through a Windows path alias while Node resolves the
// files on another drive. Give Vite the same real root it sees for HTML inputs
// so emitted page names remain relative.
const root = realpathSync(process.cwd());

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
    if (extension !== ".webp" && !(isPwaIcon && extension === ".png")) continue;
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
  base: "./",
  publicDir: false,
  plugins: [react(), copyQuestForgeRuntime],
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
