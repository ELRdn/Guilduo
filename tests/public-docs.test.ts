import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import test from "node:test";
import { buildDocsAssets, renderDocsPage } from "../public-docs/build.ts";
import { applyPublicHostRewrite, OFFICIAL_SITE_ORIGIN } from "../site-routing.ts";

type DocPage = Parameters<typeof renderDocsPage>[1];
type DocsContent = Parameters<typeof renderDocsPage>[2];
const root = resolve(import.meta.dirname, "..");
const content = JSON.parse(readFileSync(resolve(root, "public-docs/content.json"), "utf8")) as DocsContent;
const assets = buildDocsAssets();
const locales = ["ja", "en"] as const;
const pathFor = (locale: "ja" | "en", slug: string): string =>
  `/docs/${locale === "en" ? "en/" : ""}${slug ? `${slug}/` : ""}`;
const decode = (value: string): string => value.replace(/&#(?:x([\da-f]+)|(\d+));|&(amp|lt|gt|quot|apos);/gi,
  (_, hex: string, decimal: string, named: string) => hex || decimal
    ? String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))
    : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()] ?? ""));
const text = (html: string): string => decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attributes = (tag: string): Record<string, string> => Object.fromEntries(
  [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]),
);
const tags = (html: string, name: string): Record<string, string>[] =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(match => attributes(match[0]));
const scripts = (html: string): unknown[] => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => attributes(match[1]).type === "application/ld+json").map(match => JSON.parse(match[2]));
function structuredNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(structuredNodes);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(structuredNodes)];
}
function htmlFor(locale: "ja" | "en", page: DocPage): string {
  const key = `${pathFor(locale, page.slug).slice(1)}index.html`;
  const html = assets.get(key);
  assert.ok(html, `missing static page: ${key}`);
  return html;
}
function mainFor(html: string): string {
  const match = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  assert.ok(match, "indexable main landmark");
  return match[1];
}

test("public Docs emit a real bilingual static page tree", () => {
  assert.ok(assets instanceof Map);
  assert.ok(content.ja.length > 1 && content.en.length > 1, "home and articles in both languages");
  assert.deepEqual(content.ja.map(page => page.slug).sort(), content.en.map(page => page.slug).sort());
  for (const locale of locales) {
    assert.ok(content[locale].some(page => page.slug === ""), `${locale} Docs home`);
    const slugs = content[locale].map(page => page.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${locale} unique paths`);
    for (const page of content[locale]) {
      assert.match(page.slug, /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/);
      const html = htmlFor(locale, page);
      assert.match(html, /^\s*<!doctype html>/i);
      assert.equal(tags(html, "html")[0]?.lang, locale);
      assert.equal((mainFor(html).match(/<h1\b/gi) ?? []).length, 1);
      assert.ok(text(mainFor(html)).includes(page.title), page.slug);
      assert.doesNotMatch(html, /__(?:GUILDUO|DOCS)_[A-Z_]+__/);
    }
  }
});

test("canonical, alternate languages and metadata identify each article uniquely", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const locale of locales) for (const page of content[locale]) {
    const html = htmlFor(locale, page);
    const url = OFFICIAL_SITE_ORIGIN + pathFor(locale, page.slug);
    const links = tags(html, "link");
    assert.deepEqual(links.filter(link => link.rel === "canonical").map(link => link.href), [url]);
    for (const alternate of ["ja", "en", "x-default"] as const) {
      assert.deepEqual(links.filter(link => link.rel === "alternate" && link.hreflang === alternate).map(link => link.href),
        [OFFICIAL_SITE_ORIGIN + pathFor(alternate === "en" ? "en" : "ja", page.slug)]);
    }
    const title = text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    assert.ok(title.includes(page.title) && title.includes("Guilduo"));
    assert.ok(!titles.has(title), `duplicate title ${title}`);
    titles.add(title);
    const metadata = tags(html, "meta");
    const description = metadata.filter(meta => meta.name === "description");
    assert.equal(description.length, 1);
    assert.equal(description[0].content, page.description);
    assert.ok(!descriptions.has(page.description), `duplicate description ${page.slug}`);
    descriptions.add(page.description);
    assert.equal(metadata.find(meta => meta.property === "og:url")?.content, url);
    assert.equal(metadata.find(meta => meta.property === "og:title")?.content, title);
    assert.equal(metadata.find(meta => meta.property === "og:description")?.content, page.description);
    assert.ok(metadata.every(meta => meta.name !== "robots" || !/noindex|nofollow/i.test(meta.content)));
  }
});

test("parseable JSON-LD breadcrumbs end at the canonical article", () => {
  for (const locale of locales) for (const page of content[locale]) {
    const breadcrumbs = scripts(htmlFor(locale, page)).flatMap(structuredNodes)
      .filter(node => node["@type"] === "BreadcrumbList");
    assert.equal(breadcrumbs.length, 1, `${locale}/${page.slug}`);
    const items = breadcrumbs[0].itemListElement as Record<string, unknown>[];
    assert.ok(Array.isArray(items) && items.length >= 2);
    assert.deepEqual(items.map(item => item.position), items.map((_, index) => index + 1));
    const last = items.at(-1)!;
    const item = typeof last.item === "string" ? last.item : (last.item as Record<string, unknown>)["@id"];
    assert.equal(item, OFFICIAL_SITE_ORIGIN + pathFor(locale, page.slug));
    if (page.slug) assert.equal(last.name, page.title);
    else assert.ok(typeof last.name === "string" && last.name.length > 0, "named Documentation root");
  }
});

test("the complete sourced article, sections, tables and code exist before JavaScript", () => {
  for (const locale of locales) for (const page of content[locale]) {
    const main = mainFor(htmlFor(locale, page));
    const body = text(main);
    assert.ok(body.includes(page.lead.replace(/\s+/g, " ")), `${locale}/${page.slug} lead`);
    const ids = tags(main, "[a-z][\\w:-]*").map(tag => tag.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${locale}/${page.slug} duplicate main IDs`);
    for (const section of page.sections) {
      assert.ok(ids.includes(section.id), `${page.slug} anchor #${section.id}`);
      for (const value of [section.title, ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? []),
        ...(section.table?.headers ?? []), ...(section.table?.rows.flat() ?? [])]) {
        assert.ok(body.includes(value.replace(/\s+/g, " ")), `${locale}/${page.slug} missing source text: ${value.slice(0, 100)}`);
      }
      if (section.steps?.length) assert.match(main, /<ol\b/);
      if (section.bullets?.length) assert.match(main, /<ul\b/);
      if (section.table) assert.match(main, /<table\b[\s\S]*?<th\b/);
      if (section.code) {
        const code = [...main.matchAll(/<pre\b[^>]*>[\s\S]*?<code\b[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi)];
        assert.ok(code.some(match => decode(match[1].replace(/<[^>]*>/g, "")) === section.code!.text), `${page.slug} exact code`);
      }
    }
    assert.ok(page.sources.length > 0, `${page.slug} source references`);
    for (const source of page.sources) {
      const path = resolve(root, source.path);
      assert.ok(path.startsWith(root + sep), `source stays in repository: ${source.path}`);
      assert.ok(statSync(path).isFile(), source.path);
      assert.ok(body.includes(source.label), `${page.slug} source label ${source.label}`);
      assert.ok(tags(main, "a").some(link => link.href === `https://github.com/ELRdn/Guilduo/blob/${content.sourceRevision ?? "main"}/${source.path}`), `${page.slug} published source ${source.path}`);
    }
    for (const related of page.related) {
      assert.ok(content[locale].some(candidate => candidate.slug === related), `${page.slug} known related ${related}`);
      assert.ok(tags(main, "a").some(link => link.href === pathFor(locale, related)), `${page.slug} related article link`);
    }
  }
});

test("all Docs links and fragments resolve and public service links retain their boundaries", () => {
  const allHrefs: string[] = [];
  for (const locale of locales) for (const page of content[locale]) {
    const current = OFFICIAL_SITE_ORIGIN + pathFor(locale, page.slug);
    for (const anchor of tags(htmlFor(locale, page), "a")) {
      assert.ok(anchor.href, `${current} anchor with href`);
      assert.doesNotMatch(anchor.href, /^\s*(?:javascript|data|vbscript):/i);
      const url = new URL(anchor.href, current);
      allHrefs.push(url.href);
      assert.doesNotMatch(url.href, /workers\.dev|appwrite\.(?:network|io)|docs\.guilduo\.com|\/interaction-lab\/|\/next\/relay-forge\//i);
      if (url.origin === OFFICIAL_SITE_ORIGIN && url.pathname.startsWith("/docs/")) {
        const target = assets.get(`${url.pathname.slice(1)}index.html`);
        assert.ok(target, `${current} broken Docs link ${anchor.href}`);
        if (url.hash) assert.ok(tags(target, "[a-z][\\w:-]*").some(tag => tag.id === decodeURIComponent(url.hash.slice(1))), `missing fragment ${url.href}`);
      }
      if (url.hostname === "app.guilduo.com") assert.equal(url.pathname, "/", "public app entry");
      if (url.hostname === "mcp.guilduo.com") assert.equal(url.pathname, "/mcp", "public MCP endpoint");
      if (url.hostname === "api.guilduo.com") assert.equal(url.pathname, "/v1", "Appwrite API endpoint");
    }
    assert.equal(applyPublicHostRewrite(current).href, current, "Docs bypass root host rewrite");
  }
  assert.ok(allHrefs.includes("https://app.guilduo.com/"), "official app CTA");
});

test("sitemap and robots expose every canonical Docs URL without private surfaces", () => {
  const sitemap = assets.get("sitemap.xml");
  const robots = assets.get("robots.txt");
  assert.ok(sitemap && robots);
  assert.match(sitemap, /<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => decode(match[1]));
  assert.equal(new Set(urls).size, urls.length, "sitemap unique URLs");
  for (const locale of locales) for (const page of content[locale]) assert.ok(urls.includes(OFFICIAL_SITE_ORIGIN + pathFor(locale, page.slug)));
  assert.ok(urls.every(url => new URL(url).origin === OFFICIAL_SITE_ORIGIN));
  assert.ok(urls.every(url => !/\/next\/|\/interaction-lab\/|\/lpv2(?:-1)?\//.test(url)));
  assert.match(robots, /^User-agent:\s*\*/mi);
  assert.match(robots, /^Sitemap:\s*https:\/\/guilduo\.com\/sitemap\.xml\s*$/mi);
  assert.doesNotMatch(robots, /^Disallow:\s*\/(?:\s*$|docs(?:\/|\s*$))/mi);
});

test("the search index parses and includes every localized article with no compatibility URL", () => {
  const serialized = assets.get("docs/search-index.json");
  assert.ok(serialized);
  const index = JSON.parse(serialized) as Record<"ja" | "en", { title: string; description: string; path: string; text: string }[]>;
  for (const locale of locales) {
    assert.ok(Array.isArray(index[locale]));
    assert.equal(index[locale].length, content[locale].length);
    assert.equal(new Set(index[locale].map(entry => entry.path)).size, index[locale].length, "unique localized search entries");
    for (const page of content[locale]) {
      const entry = index[locale].find(candidate => candidate.path === pathFor(locale, page.slug));
      assert.ok(entry, `${locale}/${page.slug} indexed article URL`);
      assert.equal(entry.title, page.title);
      assert.equal(entry.description, page.description);
      assert.ok(entry.text.includes(page.lead), "search includes the article lead");
      for (const section of page.sections) assert.ok(entry.text.includes(section.title), "search includes section content");
    }
  }
  assert.doesNotMatch(serialized, /workers\.dev|docs\.guilduo\.com|\/next\/relay-forge\//);
});

test("renderer escapes hostile text in metadata, article fields, code and JSON-LD", () => {
  const hostile = `QA <img src=x onerror="alert(1)"> & ' </script><script>alert(2)</script>`;
  const template = content.ja.find(page => page.slug !== "")!;
  const page: DocPage = {
    ...template, title: hostile, description: hostile, lead: hostile,
    sections: [{ id: "escaping", title: hostile, paragraphs: [hostile], steps: [hostile], bullets: [hostile],
      code: { language: "text", text: hostile }, table: { headers: [hostile], rows: [[hostile]] } }],
    sources: [{ ...template.sources[0], label: hostile }],
  };
  const html = renderDocsPage("ja", page, { ...content, ja: content.ja.map(candidate => candidate.slug === page.slug ? page : candidate) });
  assert.doesNotMatch(html, /<img\s+src=x|<script>alert\(2\)<\/script>/i);
  assert.ok(tags(html, "[a-z][\\w:-]*").every(tag => !Object.keys(tag).some(name => /^on/i.test(name))), "no injected event attributes");
  assert.equal(tags(html, "meta").find(meta => meta.name === "description")?.content, hostile);
  assert.ok(text(mainFor(html)).includes(hostile));
  assert.ok(scripts(html).length > 0, "escaped JSON-LD remains parseable");
  assert.ok(scripts(html).flatMap(structuredNodes).some(node => node.name === hostile));
});

test("custom origin updates metadata and discovery consistently", () => {
  const origin = "https://docs-preview.example";
  const preview = buildDocsAssets(origin);
  const page = content.en.find(candidate => candidate.slug !== "")!;
  const html = renderDocsPage("en", page, content, origin);
  assert.equal(tags(html, "link").find(link => link.rel === "canonical")?.href, origin + pathFor("en", page.slug));
  for (const locale of locales) for (const article of content[locale]) {
    const document = preview.get(`${pathFor(locale, article.slug).slice(1)}index.html`)!;
    assert.equal(tags(document, "link").find(link => link.rel === "canonical")?.href, origin + pathFor(locale, article.slug));
  }
  assert.ok(preview.get("sitemap.xml")?.includes(origin + "/docs/"));
  assert.ok(preview.get("robots.txt")?.includes(`Sitemap: ${origin}/sitemap.xml`));
});

test("FAQ structured answers match the visible questions and answers exactly", () => {
  for (const locale of locales) for (const page of content[locale]) {
    const faqNodes = scripts(htmlFor(locale, page)).flatMap(structuredNodes).filter(node => node["@type"] === "FAQPage");
    assert.equal(faqNodes.length, page.slug === "faq" ? 1 : 0);
    if (page.slug !== "faq") continue;
    const questions = faqNodes[0].mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    const sections = page.sections.filter(section => section.paragraphs?.length);
    assert.equal(questions.length, sections.length);
    questions.forEach((question, index) => {
      assert.equal(question.name, sections[index].title);
      assert.equal(question.acceptedAnswer.text, sections[index].paragraphs!.join("\n\n"));
    });
  }
});

test("review provenance is visible and machine navigation covers all canonical guides", () => {
  assert.match(content.reviewedAt ?? "", /^\d{4}-\d{2}-\d{2}$/);
  const navigation = assets.get("llms.txt");
  assert.ok(navigation);
  assert.ok(navigation.startsWith("# Guilduo\n"));
  assert.ok(navigation.includes(content.sourceRevision!));
  for (const locale of locales) for (const page of content[locale]) {
    const html = htmlFor(locale, page);
    assert.ok(tags(html, "time").some(tag => tag.datetime === content.reviewedAt));
    const article = scripts(html).flatMap(structuredNodes).find(node => node["@type"] === "TechArticle");
    assert.equal(article?.dateModified, content.reviewedAt);
    assert.equal(article?.isAccessibleForFree, true);
    assert.ok(navigation.includes(OFFICIAL_SITE_ORIGIN + pathFor(locale, page.slug)));
  }
});
