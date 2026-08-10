import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { defineConfig } from "vite";

const root = new URL(".", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");

function copyRuntimeAssets(source, destination) {
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
    cpSync(join(root, "service-worker.js"), join(dist, "service-worker.js"));
    cpSync(join(root, "api"), join(dist, "api"), { recursive: true });
    copyRuntimeAssets(join(root, "assets"), join(dist, "assets"));
  },
};

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [copyQuestForgeRuntime],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
