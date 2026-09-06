import { strict as assert } from "node:assert";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { resolvePublicUrl } from "../lp/config.ts";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ja = read("lp/index.html"), en = read("lp/en/index.html");

test("official LP documents preserve public canonical and language URLs", () => {
  for (const [html, lang, path] of [[ja, "ja", "/"], [en, "en", "/lp/en/"]]) {
    assert.ok(html.includes(`<html lang="${lang}"`));
    assert.ok(html.includes(`name="guilduo:canonical-path" content="${path}"`));
    assert.ok(html.includes(`rel="canonical" href="__GUILDUO_PUBLIC_ORIGIN__${path}"`));
    assert.ok(html.includes(`property="og:url" content="__GUILDUO_PUBLIC_ORIGIN__${path}"`));
    assert.ok(html.includes(`name="twitter:url" content="__GUILDUO_PUBLIC_ORIGIN__${path}"`));
    assert.match(html, /hreflang="ja" href="__GUILDUO_PUBLIC_ORIGIN__\/"/);
    assert.match(html, /hreflang="en" href="__GUILDUO_PUBLIC_ORIGIN__\/lp\/en\/"/);
    assert.match(html, /hreflang="x-default" href="__GUILDUO_PUBLIC_ORIGIN__\/"/);
    assert.doesNotMatch(html, /class="edition"|name="robots" content="noindex/);
  }
  assert.match(ja, /class="language" href="\/lp\/en\/"/);
  assert.match(en, /class="language" href="\/"/);
  assert.match(ja, /<a class="wordmark" href="\/"/);
});
test("Web App metadata and host routing stay separate from the LP", () => {
  for (const file of ["index.html", "interaction-lab/index.html", "interaction-lab/relay-forge/index.html"]) assert.match(read(file), /__GUILDUO_WEB_APP_ORIGIN__\//);
  assert.match(read("vite.config.ts"), /PUBLIC_SITE_URL/);
  assert.match(read("site-routing.ts"), /LP_ENTRY_PATH = "\/lp\/"/);
  assert.match(read("site-routing.ts"), /RELAY_FORGE_ENTRY_PATH = "\/next\/relay-forge\/"/);
});
test("official LP shares the approved demo and motion implementation", () => {
  assert.match(read("lp/main.ts"), /import "\.\.\/lpv2-1\/main"/);
  assert.match(read("lp/styles.css"), /@import "\.\.\/lpv2-1\/styles.css"/);
  assert.match(read("lpv2-1/main.ts"), /import "\.\.\/lpv2\/main"/);
  for (const html of [ja,en]) {
    let previous = -1;
    for (const id of ["hero-title", "experience-title", "relationship-title", "mcp-title", "control-title", "guild-title", "open-title", "final-title"]) {
      const index = html.indexOf(`id="${id}"`);assert.ok(index > previous, id);previous=index;
    }
    assert.match(html, /<details class="mcp-details" open>/);
  }
});
test("approved copy and text-only Guilduo boundary remain explicit", () => {
  assert.match(ja, /<span>人間だけが、<\/span><span>依頼主じゃない。<\/span>/);
  assert.match(ja, /人もAIも、依頼主。人もAIも、担当者。/);
  assert.match(ja, /Work together\.<br>Level up together\./);
  assert.match(ja, /AIに任せる。<br>判断まで任せない。/);
  assert.match(ja, /実際のAIへの接続やタスクの保存は行いません/);
  assert.match(ja, /外部の作業画面/);assert.match(en, /external workspace/i);
  assert.doesNotMatch(ja+en, /assets\/lp\/|data-deferred-src/);
  const textArea=ja.slice(ja.indexOf('class="guilduo-workspace"'),ja.indexOf('class="external-workspace"'));
  assert.match(textArea,/data-quest="original"/);assert.match(textArea,/data-quest="review"/);assert.doesNotMatch(textArea,/data-preview="/);
});
test("official branding uses existing approved delivery assets", () => {
  for(const asset of ["assets/brand/guilduo-mark-gold.svg","assets/brand/og-guilduo.png","assets/icons/favicon-48.png","assets/icons/apple-touch-icon-180.png"]) assert.ok(statSync(new URL(`../${asset}`,import.meta.url)).size>0);
  for(const html of [ja,en]) {
    assert.match(html,/property="og:image" content="__GUILDUO_PUBLIC_ORIGIN__\/assets\/brand\/og-guilduo.png"/);
    assert.match(html,/rel="apple-touch-icon"/);assert.match(html,/assets\/brand\/guilduo-mark-gold.svg/);
  }
});
test("MCP facts come from the shared contract", () => {
  const contract=JSON.parse(read("api/mcp-tools.json")) as {tools: unknown[]};assert.ok(contract.tools.length>0);
  assert.match(read("lpv2/main.ts"),/import contract from "\.\.\/api\/mcp-tools.json"/);
  assert.match(read("lpv2/main.ts"),/contract.tools.length/);
});
test("public CTA URL policy allows only same-origin or HTTPS", () => {
  const href="https://guilduo.example/lp/",origin="https://guilduo.example";
  assert.equal(resolvePublicUrl("/next/",href,origin),"https://guilduo.example/next/");
  assert.equal(resolvePublicUrl("https://github.com/example/repo",href,origin),"https://github.com/example/repo");
  for(const unsafe of ["http://other.example/","javascript:alert(1)",""])assert.equal(resolvePublicUrl(unsafe,href,origin),null);
});
test("comparison routes remain available with noindex", () => {
  for(const dir of ["lpv2","lpv2-1"])for(const lang of ["","en/"])assert.match(read(`${dir}/${lang}index.html`),/name="robots" content="noindex,follow"/);
  assert.match(read("vite.config.ts"),/landingJa: resolve\(root, "lp\/index.html"\)/);
  assert.match(read("vite.config.ts"),/landingV21En: resolve\(root, "lpv2-1\/en\/index.html"\)/);
});
test("motion preserves palette and accessible off switch", () => {
  const css=read("lpv2/styles.css")+read("lpv2-1/styles.css");
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur|text-shadow/i);
  assert.match(css,/prefers-reduced-motion: reduce/);assert.match(css,/data-motion="off"/);
  assert.match(ja+en,/data-motion-toggle aria-pressed/);assert.doesNotMatch(ja+en,/WebGL|canvas id=/i);
});
