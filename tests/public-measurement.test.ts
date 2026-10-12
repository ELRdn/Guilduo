import test from "node:test";
import assert from "node:assert/strict";
import { classifyPublicSource, publicPageLabel, validPublicEvent } from "../shared/public-measurement.ts";
import { buildDocsAssets, readDocsContent } from "../public-docs/build.ts";

test("only known public pages have finite labels", () => {
  for (const locale of ["ja", "en"] as const) for (const page of readDocsContent()[locale]) {
    assert.ok(publicPageLabel(`/docs/${locale === "en" ? "en/" : ""}${page.slug ? page.slug + "/" : ""}`));
  }
  assert.equal(publicPageLabel("/lp/en/"), "home");
  assert.equal(publicPageLabel("/solutions/en/ai-agent-handoff/"), "solution_ai-agent-handoff");
  for (const path of ["/next/", "/private/", "/docs/secret/", "/api/"]) assert.equal(publicPageLabel(path), undefined);
});

test("classifies known sources without labeling paid campaigns as organic", () => {
  const base = "https://guilduo.com/docs/";
  for (const [referrer, source] of [
    ["https://www.google.co.jp/search?q=private", "organic_search"],
    ["https://chatgpt.com/c/private", "ai_referral"],
    ["https://www.perplexity.ai/search/private", "ai_referral"],
    ["https://google.com.attacker.example/", "referral"],
    ["https://guilduo.com/", "direct_unknown"],
    ["", "direct_unknown"],
  ]) assert.equal(classifyPublicSource(base, referrer), source);
  for (const query of ["?gclid=secret", "?utm_source=google&utm_medium=cpc", "?utm_source=chatgpt&utm_medium=paid", "?utm_source=arbitrary-private-text"]) {
    assert.equal(classifyPublicSource(base + query, "https://google.com/"), "campaign");
  }
  assert.equal(classifyPublicSource(base + "?utm_source=google&utm_medium=organic", ""), "organic_search");
  assert.equal(classifyPublicSource(base + "?utm_source=chatgpt&utm_medium=referral", ""), "ai_referral");
});

test("Worker public event validation rejects arbitrary labels and mismatched surfaces", () => {
  const good = { kind: "docs_codex", source: "ai_referral", status: "ja", surface: "public_docs" };
  assert.ok(validPublicEvent(good));
  for (const patch of [{kind:"private-quest"}, {source:"https://secret.example"}, {status:"uid"}, {surface:"relay-forge"}]) {
    assert.equal(validPublicEvent({...good,...patch}), false);
  }
});

test("only reviewed articles get refreshed dates; crawlers can read App noindex", () => {
  const assets = buildDocsAssets();
  const content = readDocsContent();
  const codex = assets.get("docs/codex/index.html")!;
  const other = assets.get("docs/claude/index.html")!;
  assert.ok(codex.includes('datetime="2026-10-12"'));
  assert.ok(other.includes(`datetime="${content.reviewedAt}"`));
  const entries = [...assets.get("sitemap.xml")!.matchAll(/<url>([\s\S]*?)<\/url>/g)];
  assert.equal(entries.length, 44);
  assert.ok(entries.find(m => m[1].includes("<loc>https://guilduo.com/docs/codex/</loc>"))![1].includes("<lastmod>2026-10-12</lastmod>"));
  assert.ok(!entries.find(m => m[1].includes("<loc>https://guilduo.com/docs/claude/</loc>"))![1].includes("2026-10-12"));
  assert.ok(!assets.get("robots.txt")!.includes("Disallow: /next/"));
});
