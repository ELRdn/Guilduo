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
  assert.deepEqual(manifest.shortcuts.map((shortcut) => shortcut.url), ["/#tasks", "/#battle"]);
});

test("service worker uses the root navigation fallback", () => {
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  assert.match(worker, /const NAVIGATION_FALLBACK = "\/index\.html"/);
  assert.match(worker, /caches\.match\(NAVIGATION_FALLBACK\)/);
});

test("service worker upgrades an existing QuestForge client once", () => {
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const firebase = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));

  assert.match(worker, /const CACHE_PREFIX = "questforge-pwa-"/);
  assert.match(worker, /hadPriorQuestForgeCache/);
  assert.match(worker, /QUESTFORGE_UPDATE_READY/);
  assert.match(worker, /client\.navigate\(client\.url\)/);
  assert.match(worker, /fetch\(NAVIGATION_FALLBACK, \{ cache: "reload" \}\)/);
  assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(app, /updateViaCache: "none"/);
  assert.match(app, /showAppUpdateAvailable/);
  const noCachePaths = firebase.hosting.headers
    .filter((entry) => entry.headers.some((header) => header.value.includes("no-store")))
    .map((entry) => entry.source);
  assert.deepEqual(noCachePaths, ["/", "/index.html"]);
});
