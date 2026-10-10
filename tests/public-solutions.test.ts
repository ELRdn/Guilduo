import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildDocsAssets, readDocsContent, solutionPath, solutionSlugs } from "../public-docs/build.ts";
const root = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");
const origin = "https://guilduo.com";

test("static solutions have unique metadata, reciprocal languages and sourced navigation", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const assets = buildDocsAssets();
  const sitemap = assets.get("sitemap.xml")!;
  const content = readDocsContent();
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 4 + 2 * solutionSlugs.length + content.ja.length + content.en.length);
  for (const locale of ["ja", "en"] as const) for (const slug of solutionSlugs) {
    const path = solutionPath(locale, slug);
    const html = read(path.slice(1) + "index.html").replaceAll("__GUILDUO_PUBLIC_ORIGIN__", origin);
    assert.match(html, /<!doctype html>/i);
    assert.ok(html.includes('lang="' + locale + '"'));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/)?.[1];
    assert.ok(title && description);
    assert.ok(!titles.has(title) && !descriptions.has(description));
    titles.add(title); descriptions.add(description);
    assert.ok(html.includes('rel="canonical" href="' + origin + path + '"'));
    for (const lang of ["ja", "en", "x-default"] as const) {
      const alternate = origin + solutionPath(lang === "en" ? "en" : "ja", slug);
      assert.ok(html.includes('hreflang="' + lang + '" href="' + alternate + '"'));
    }
    const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    assert.ok(blocks.length > 0, "parseable JSON-LD");
    assert.ok(JSON.stringify(blocks).includes("BreadcrumbList"));
    assert.ok(JSON.stringify(blocks).includes(origin + path));
    assert.doesNotMatch(html, /<script(?![^>]*type="application\/ld\+json")/);
    assert.doesNotMatch(html, /noindex|workers\.dev|docs\.guilduo\.com/);
    assert.ok(html.includes('href="https://app.guilduo.com/"'));
    assert.ok(html.includes('/docs/' + (locale === "en" ? 'en/' : '')));
    assert.ok(html.includes('/blob/42caab0fa1f396f15e4e1277f6e36dda1ac9bd04/'));
    for (const m of html.matchAll(/href="([^"#]+)"/g)) {
      const url = new URL(m[1], origin + path);
      if (url.origin !== origin || ["/", "/sitemap.xml"].includes(url.pathname)) continue;
      if (/\.[a-z0-9]+$/i.test(url.pathname)) continue;
      assert.ok(assets.has(url.pathname.slice(1) + "index.html") || existsSync(resolve(root, url.pathname.slice(1), "index.html")), "missing page " + url.pathname);
    }
    const entry = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].find(m => m[1].includes('<loc>' + origin + path + '</loc>'))?.[1];
    assert.ok(entry);
    assert.ok(entry.includes("<lastmod>2026-10-06</lastmod>"));
    assert.equal((entry.match(/<xhtml:link/g) ?? []).length, 3);
    assert.ok(read(locale === "ja" ? "lp/index.html" : "lp/en/index.html").includes('href="' + path + '"'));
    assert.ok(read(locale === "ja" ? "README.jp.md" : "README.md").includes(origin + path));
  }
});
