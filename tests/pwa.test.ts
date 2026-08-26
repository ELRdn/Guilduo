const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("manifest has a stable root-scoped PWA identity", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

  assert.equal(manifest.id, "/index.html");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url), ["/#tasks", "/#battle"]);
});

test("English manifest keeps the same PWA identity and localized shortcuts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.en.webmanifest"), "utf8"));
  assert.equal(manifest.lang, "en");
  assert.equal(manifest.id, "/index.html");
  assert.deepEqual(manifest.shortcuts.map((shortcut: { name: string }) => shortcut.name), ["Quests", "Battle"]);
});

test("service worker uses the root navigation fallback", () => {
  const worker = fs.readFileSync(path.join(root, "service-worker.ts"), "utf8");

  assert.match(worker, /const NAVIGATION_FALLBACK = "\/index\.html"/);
  assert.match(worker, /caches\.match\(NAVIGATION_FALLBACK\)/);
  assert.match(worker, /BETA_NAVIGATION_PATH/);
  assert.match(worker, /requestUrl\.pathname === "\/next"/);
});

test("service worker upgrades an existing Guilduo client once", () => {
  const worker = fs.readFileSync(path.join(root, "service-worker.ts"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");

  assert.match(worker, /const CACHE_PREFIX = "questforge-pwa-"/);
  assert.match(worker, /hadPriorQuestForgeCache/);
  assert.match(worker, /QUESTFORGE_UPDATE_READY/);
  assert.match(worker, /client\.navigate\(client\.url\)/);
  assert.match(worker, /fetch\(NAVIGATION_FALLBACK, \{ cache: "reload" \}\)/);
  assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(app, /updateViaCache: "none"/);
  assert.match(app, /showAppUpdateAvailable/);
  assert.match(fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8"), /Deploy Appwrite Site/);
});

test("Vite emits the LP and beta UI as Appwrite Sites static routes", () => {
  const vite = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
  assert.match(vite, /landingJa: resolve\(root, "lp\/index\.html"\)/);
  assert.match(vite, /landingEn: resolve\(root, "lp\/en\/index\.html"\)/);
  assert.match(vite, /next: resolve\(root, "interaction-lab\/index\.html"\)/);
  assert.match(vite, /renameSync\(generatedLab, betaDestination\)/);
});
