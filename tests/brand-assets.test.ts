import { strict as assert } from "node:assert";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const pngOutputs = [
  ["assets/icons/favicon-32.png", 32, 32],
  ["assets/icons/favicon-48.png", 48, 48],
  ["assets/icons/apple-touch-icon-180.png", 180, 180],
  ["assets/icons/icon-192.png", 192, 192],
  ["assets/icons/icon-512.png", 512, 512],
  ["assets/icons/icon-maskable-512.png", 512, 512],
  ["assets/brand/og-guilduo.png", 1200, 630],
  ["assets/brand/github-social-preview.png", 1280, 640],
] as const;

test("Guilduo E2 SVGs are self-contained and share one traced path", () => {
  const master = read("assets/brand/guilduo-mark-master.svg");
  const masterPath = master.match(/<path\b[^>]*\bd="([^"]+)"/s)?.[1];
  assert.ok(masterPath);
  assert.match(master, /#13352F/);
  assert.match(master, /#B89A5E/);
  for (const name of ["guilduo-mark-gold.svg", "guilduo-mark-ink.svg", "guilduo-mark-ivory.svg"]) {
    const svg = read(`assets/brand/${name}`);
    assert.doesNotMatch(svg, /<(?:image|foreignObject|use)\b|@font-face|font-family=|href=["'](?:https?:|data:)/i, name);
    assert.equal(svg.match(/<path\b[^>]*\bd="([^"]+)"/s)?.[1], masterPath, name);
  }
});

test("brand PNG outputs have the required dimensions and are non-empty", () => {
  for (const [path, width, height] of pngOutputs) {
    const absolute = join(root, path);
    assert.equal(existsSync(absolute), true, path);
    assert.ok(statSync(absolute).size > 0, path);
    const png = PNG.sync.read(readFileSync(absolute));
    assert.equal(png.width, width, path);
    assert.equal(png.height, height, path);
  }
});

test("both manifests preserve identity and reference the generated PWA icons", () => {
  const japanese = JSON.parse(read("manifest.webmanifest")) as { id: string; name: string; lang: string; icons: { src: string }[] };
  const english = JSON.parse(read("manifest.en.webmanifest")) as { id: string; name: string; lang: string; icons: { src: string }[] };
  assert.equal(japanese.id, "/index.html");
  assert.equal(english.id, japanese.id);
  assert.equal(japanese.name, "Guilduo");
  assert.equal(english.name, japanese.name);
  assert.equal(japanese.lang, "ja");
  assert.equal(english.lang, "en");
  assert.deepEqual(japanese.icons.map((icon) => icon.src), [
    "/assets/icons/icon-192.png",
    "/assets/icons/icon-512.png",
    "/assets/icons/icon-maskable-512.png",
  ]);
  assert.deepEqual(english.icons.map((icon) => icon.src), japanese.icons.map((icon) => icon.src));
});

test("public surfaces reference the new brand assets without changing the Golden Reference fixture", () => {
  const rootHtml = read("index.html");
  const labHtml = read("interaction-lab/index.html");
  const relayHtml = read("interaction-lab/relay-forge/index.html");
  const lpHtml = read("lp/index.html");
  const englishLpHtml = read("lp/en/index.html");
  for (const html of [rootHtml, labHtml, relayHtml, lpHtml, englishLpHtml]) {
    assert.match(html, /favicon-32\.png/);
    assert.match(html, /og-guilduo\.png/);
  }
  assert.match(rootHtml, /guilduo-mark-gold\.svg/);
  assert.match(labHtml, /guilduo-mark-gold\.svg/);
  assert.match(relayHtml, /<title>Guilduo/);
  assert.match(lpHtml, /guilduo-mark-gold\.svg/);
  assert.match(englishLpHtml, /guilduo-mark-gold\.svg/);
  assert.doesNotMatch(rootHtml, />QF</);
  assert.doesNotMatch(labHtml.slice(0, labHtml.indexOf('class="reference-brand"')), />QF</);
  assert.doesNotMatch(read("interaction-lab/relay-forge/shell.ts"), /class: "rf-mark"[\s\S]{0,300}["']GD["']/);
  assert.match(labHtml, /class="reference-brand"/);
  assert.match(labHtml, /QUESTFORGE/);
  assert.match(read("vite.config.ts"), /isBrandAssetFile/);
  assert.match(read("vite.config.ts"), /renameSync\(generatedLab, betaDestination\)/);
});

test("static OG metadata uses the build-time public-origin marker", () => {
  for (const path of ["index.html", "lp/index.html", "lp/en/index.html", "interaction-lab/relay-forge/index.html"]) {
    assert.match(read(path), /property="og:image" content="__GUILDUO_PUBLIC_ORIGIN__\/assets\/brand\/og-guilduo\.png"/);
  }
  assert.match(read("vite.config.ts"), /PUBLIC_SITE_URL/);
  assert.match(read("vite.config.ts"), /replaceAll\("__GUILDUO_PUBLIC_ORIGIN__"/);
  assert.match(read("vite.config.ts"), /__GUILDUO_WEB_APP_ORIGIN__/);
});
