import { strict as assert } from "node:assert";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { resolvePublicUrl } from "../lp/config.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ja = read("lp/index.html");
const en = read("lp/en/index.html");

test("LP publishes first-class Japanese and English documents", () => {
  assert.match(ja, /<html lang="ja"/);
  assert.match(en, /<html lang="en"/);
  assert.match(ja, /name="guilduo:canonical-path" content="\/lp\/"/);
  assert.match(en, /name="guilduo:canonical-path" content="\/lp\/en\/"/);
  assert.match(read("lp/main.ts"), /hydrateSeoLinks/);
  assert.match(read("lp/main.ts"), /hreflang: "x-default"/);
});

test("LP narrative keeps the required section order", () => {
  const ids = ["hero-title", "relationship", "product", "relay", "mcp", "control", "guild", "open", "comparison", "join"];
  let previous = -1;
  for (const id of ids) {
    const index = ja.indexOf(id === "hero-title" ? 'id="hero-title"' : `id="${id}"`);
    assert.ok(index > previous, `${id} must follow the previous section`);
    previous = index;
  }
});

test("LP display copy keeps intentional phrase boundaries", () => {
  const css = read("lp/styles.css");
  assert.match(ja, /<span class="display-line">人間だけが、<\/span><span class="display-line">依頼主じゃない。<\/span>/);
  assert.match(ja, /<span class="display-line"><span class="phrase-lock">判断すべき<\/span><span class="phrase-lock">仕事だけ、<\/span><\/span><span class="display-line">あなたへ。<\/span>/);
  assert.match(ja, /仕事は、<span class="phrase-lock">どちらからでも。<\/span>/);
  assert.match(ja + en, /<span class="display-line">Work together\.<\/span><span class="display-line">Level up together\.<\/span>/);
  assert.match(ja, /<span class="display-line">会話ではなく、<\/span><span class="display-line"><span class="phrase-lock">仕事の流れを<\/span><span class="phrase-lock">共有する。<\/span><\/span>/);
  assert.match(ja, /<footer class="site-footer page-shell">\s*<p class="motto-stack"><span class="display-line">2者。1チーム。<\/span><span class="display-line">仕事は、どちらからでも。<\/span>/);
  assert.match(css, /html\[lang="ja"\] h2 \{[^}]*max-width: 16em/s);
  assert.match(css, /html\[lang="ja"\] \.site-footer > p \{[^}]*font-size: clamp\(1\.25rem, 6vw, var\(--text-2xl\)\)/s);
  assert.match(css, /word-break: auto-phrase/);
  assert.match(css, /\.hero \.display-line \{[^}]*white-space: nowrap/s);
});

test("LP uses real product captures with dimensions, alt text, and deferred loading", () => {
  for (const path of ["command-dark.webp", "command-light.webp", "command-evidence-dark.webp", "party-dark.webp", "battle-dark.webp"]) {
    const stat = statSync(new URL(`../assets/lp/${path}`, import.meta.url));
    assert.ok(stat.size > 0, `${path} must exist`);
    assert.ok(stat.size < 220_000, `${path} must remain web-sized`);
  }
  assert.doesNotMatch(ja, /fake browser|traffic-light|macOS toolbar/i);
  assert.match(ja, /loading="lazy" width="1920" height="1080"/);
  assert.match(ja, /data-deferred-src="\/assets\/lp\/command-dark\.webp"/);
});

test("LP facts remain source-backed and avoid invented proof", () => {
  const contract = JSON.parse(read("api/mcp-tools.json")) as { tools?: unknown[] } | unknown[];
  const count = Array.isArray(contract) ? contract.length : contract.tools?.length ?? 0;
  assert.equal(count, 51);
  assert.match(read("lp/main.ts"), /contractToolCount/);
  assert.doesNotMatch(ja, /trusted by|conversion|10×|first ever|only AI platform/i);
});

test("public CTA URL policy allows same-origin and HTTPS only", () => {
  const href = "https://guilduo.example/lp/";
  const origin = "https://guilduo.example";
  assert.equal(resolvePublicUrl("/next/", href, origin), "https://guilduo.example/next/");
  assert.equal(resolvePublicUrl("https://github.com/example/repo", href, origin), "https://github.com/example/repo");
  assert.equal(resolvePublicUrl("http://other.example/", href, origin), null);
  assert.equal(resolvePublicUrl("javascript:alert(1)", href, origin), null);
  assert.equal(resolvePublicUrl("", href, origin), null);
});

test("build and Appwrite Sites output include isolated LP routes", () => {
  const vite = read("vite.config.ts");
  assert.match(vite, /landingJa: resolve\(root, "lp\/index\.html"\)/);
  assert.match(vite, /landingEn: resolve\(root, "lp\/en\/index\.html"\)/);
  assert.match(read(".github/workflows/release.yml"), /Deploy Appwrite Site/);
  assert.match(read("RELEASE_SETUP.md"), /APPWRITE_SITE_ID/);
});

test("LP visual language avoids prohibited AI-template effects", () => {
  const css = read("lp/styles.css");
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur|text-shadow/i);
  assert.doesNotMatch(ja + en, /WebGL|canvas id=/i);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /overflow-x: clip/);
});
