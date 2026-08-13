const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("appearance menu exposes light, dark, and system modes accessibly", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(html, /id="appearanceButton"[^>]*aria-haspopup="menu"/);
  assert.match(html, /id="appearanceMenu"[^>]*role="menu"/);
  assert.match(html, /data-appearance-option="light"/);
  assert.match(html, /data-appearance-option="dark"/);
  assert.match(html, /data-appearance-option="system"/);
  assert.match(html, /role="menuitemradio"/);
});

test("appearance preference stays device-local and follows the OS in system mode", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(app, /const appearanceStorageKey = "questforge-appearance-mode"/);
  assert.match(app, /localStorage\.setItem\(appearanceStorageKey, normalized\)/);
  assert.match(app, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(app, /colorSchemeQuery\.addEventListener\("change", handleSystemColorChange\)/);
  assert.doesNotMatch(app, /preferences:\s*\{[^}]*appearance/s);
});

test("all three tastes define dedicated dark palettes and a readable battle stage", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

  for (const theme of ["arcane", "soft", "retro"]) {
    assert.match(css, new RegExp(`html\\[data-color-mode="dark"\\] body\\[data-theme="${theme}"\\]`));
  }
  assert.match(css, /html\[data-color-mode="dark"\] \.jrpg-field/);
  assert.match(css, /--battle-surface:/);
  assert.match(css, /background: var\(--panel\);/);
});

test("PWA cache and app version are bumped for the Toggl Focus release", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  assert.match(app, /const appVersion = "2026\.08\.12-toggl-focus"/);
  assert.match(worker, /const APP_VERSION = "2026\.08\.12-toggl-focus"/);
  assert.match(worker, /CACHE_PREFIX}v17/);
});
