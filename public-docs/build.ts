import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { z } from "zod";

export type DocsLocale = "ja" | "en";
export const solutionSlugs = ["mcp-task-management", "ai-agent-handoff"] as const;
export const solutionPath = (locale: DocsLocale, slug: typeof solutionSlugs[number]): string => `/solutions/${locale === "en" ? "en/" : ""}${slug}/`;
const slug = z.string().regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/);
const sectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), title: z.string().min(1),
  paragraphs: z.array(z.string()).optional(), steps: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
  code: z.object({ language: z.string(), text: z.string() }).optional(),
  table: z.object({ headers: z.array(z.string()).min(1), rows: z.array(z.array(z.string())) }).optional(),
});
const pageSchema = z.object({
  slug, group: z.enum(["start", "workflows", "integrations", "reference"]),
  title: z.string().min(1), navTitle: z.string().min(1).optional(), description: z.string().min(1), lead: z.string().min(1),
  sections: z.array(sectionSchema).min(1), related: z.array(slug),
  sources: z.array(z.object({ path: z.string().regex(/^[a-zA-Z0-9_./-]+$/), label: z.string().min(1) })).min(1),
});
const contentSchema = z.object({ sourceRevision: z.string().regex(/^[a-f0-9]{40}$/).optional(), reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), ja: z.array(pageSchema).min(1), en: z.array(pageSchema).min(1) });
export type DocPage = z.infer<typeof pageSchema>;
export type DocsContent = z.infer<typeof contentSchema>;

export function readDocsContent(): DocsContent {
  const content = contentSchema.parse(JSON.parse(readFileSync(new URL("./content.json", import.meta.url), "utf8")));
  const locales: DocsLocale[] = ["ja", "en"];
  for (const locale of locales) {
    const pages = content[locale];
    const slugs = new Set(pages.map(page => page.slug));
    if (!slugs.has("") || slugs.size !== pages.length) throw new Error(`Docs ${locale}: missing index or duplicate slug`);
    if (new Set(pages.map(page => page.title)).size !== pages.length || new Set(pages.map(page => page.description)).size !== pages.length) throw new Error(`Docs ${locale}: duplicate metadata`);
    for (const page of pages) {
      if (page.slug === "en") throw new Error("Docs: reserved language path");
      if (new Set(page.sections.map(section => section.id)).size !== page.sections.length) throw new Error(`Docs: duplicate section in ${page.slug}`);
      for (const related of page.related) if (!slugs.has(related) || related === page.slug) throw new Error(`Docs: invalid related article ${related}`);
      for (const source of page.sources) if (source.path.startsWith("/") || source.path.split("/").some(segment => segment === ".." || !segment)) throw new Error(`Docs: invalid source path ${source.path}`);
      for (const section of page.sections) if (section.table?.rows.some(row => row.length !== section.table!.headers.length)) throw new Error(`Docs: invalid table in ${page.slug}`);
    }
  }
  if (content.ja.some(page => !content.en.some(other => other.slug === page.slug)) || content.ja.length !== content.en.length) throw new Error("Docs: translations must share slugs");
  return content;
}

export const escapeHtml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const e = escapeHtml;
export const docsPath = (locale: DocsLocale, slug: string): string => `/docs/${locale === "en" ? "en/" : ""}${slug ? `${slug}/` : ""}`;
const copy = {
  ja: { home: "公式サイト", docs: "ドキュメント", start: "はじめる", workflows: "仕事を進める", integrations: "AIを接続する", reference: "リファレンス", menu: "記事を探す", toc: "このページの内容", search: "ドキュメントを検索", placeholder: "MCP、Quest、権限…", searchHint: "キーワードで使い方を探す。検索はこの端末内で処理します。", app: "Web Appを開く", theme: "表示テーマ", sources: "この記事の出典", sourceHint: "公開GitHubの資料をもとに編集しています。仕様の詳細は原文を確認できます。", related: "次に読む", copy: "コピー", copied: "コピーしました", copyError: "コピーできませんでした。コードを選択してコピーしてください。", loading: "検索を準備しています…", noResults: "一致する記事がありません。別の言葉で検索してください。", searchError: "検索を読み込めませんでした。再度入力するか、記事一覧から探してください。", count: "件の記事が見つかりました", clear: "検索をクリア", footer: "人もAIも、依頼主。人もAIも、担当者。", privacy: "プライバシー", terms: "利用規約", issues: "問題を報告", quick: "最初の一歩", quickHint: "やりたいことから、必要な手順へ。", read: "手順を読む", overview: "ガイド一覧", overviewHint: "接続から依頼、レビューまで。必要な記事から読めます。" },
  en: { home: "Official site", docs: "Documentation", start: "Get started", workflows: "Work together", integrations: "Connect your AI", reference: "Reference", menu: "Browse articles", toc: "On this page", search: "Search documentation", placeholder: "MCP, Quests, permissions…", searchHint: "Find a guide by keyword. Searches stay on your device.", app: "Open Web App", theme: "Theme", sources: "Sources for this article", sourceHint: "Edited from the public GitHub documentation. Read the original sources for specification details.", related: "Read next", copy: "Copy", copied: "Copied", copyError: "Could not copy. Select and copy the code manually.", loading: "Preparing search…", noResults: "No matching articles. Try another keyword.", searchError: "Could not load search. Try typing again, or browse the article list.", count: "matching articles", clear: "Clear search", footer: "Humans and AI can both ask, own, and review work.", privacy: "Privacy", terms: "Terms", issues: "Report an issue", quick: "Your first step", quickHint: "Start with what you want to do.", read: "Read the guide", overview: "Browse the guides", overviewHint: "From connecting to delegating and reviewing. Pick the guide you need." },
} as const;
const groups = ["start", "workflows", "integrations", "reference"] as const;

function articleLinks(locale: DocsLocale, pages: DocPage[], current: string): string {
  return pages.map(page => `<a href="${docsPath(locale, page.slug)}"${page.slug === current ? ' aria-current="page"' : ""}>${e(page.navTitle ?? page.title)}</a>`).join("");
}

function renderSection(section: DocPage["sections"][number], locale: DocsLocale): string {
  const t = copy[locale];
  return `<section class="doc-section" id="${e(section.id)}"><h2><a class="doc-anchor" href="#${e(section.id)}">${e(section.title)}</a></h2>
${(section.paragraphs ?? []).map(p => `<p>${e(p)}</p>`).join("")}
${section.steps ? `<ol class="doc-steps">${section.steps.map(p => `<li>${e(p)}</li>`).join("")}</ol>` : ""}
${section.bullets ? `<ul>${section.bullets.map(p => `<li>${e(p)}</li>`).join("")}</ul>` : ""}
${section.code ? `<div class="doc-code"><div class="doc-code-heading"><span>${e(section.code.language)}</span><button type="button" data-copy hidden>${t.copy}</button></div><pre tabindex="0" aria-label="${e(section.title)}"><code>${e(section.code.text)}</code></pre></div>` : ""}
${section.table ? `<div class="doc-table" role="region" aria-label="${e(section.title)}" tabindex="0"><table><thead><tr>${section.table.headers.map(h => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${e(cell)}</th>` : `<td>${e(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}</section>`;
}

function originUrl(origin: string): string {
  const url = new URL(origin);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Docs origin must be an http(s) origin");
  return url.origin;
}

export function renderDocsPage(locale: DocsLocale, page: DocPage, content: DocsContent, origin = "https://guilduo.com"): string {
  origin = originUrl(origin);
  const t = copy[locale];
  const path = docsPath(locale, page.slug);
  const title = `${page.title} | Guilduo Docs`;
  const sourceRevision = content.sourceRevision ?? "main";
  const breadcrumbs = [{ "@type": "ListItem", position: 1, name: "Guilduo", item: `${origin}/` }, { "@type": "ListItem", position: 2, name: t.docs, item: `${origin}${docsPath(locale, "")}` }];
  if (page.slug) breadcrumbs.push({ "@type": "ListItem", position: 3, name: page.title, item: `${origin}${path}` });
  const schemas = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: breadcrumbs },
    { "@type": "TechArticle", headline: page.title, description: page.description, inLanguage: locale, url: `${origin}${path}`, mainEntityOfPage: `${origin}${path}`, author: { "@type": "Organization", name: "Guilduo", url: `${origin}/` }, publisher: { "@type": "Organization", name: "Guilduo", url: `${origin}/` }, isAccessibleForFree: true, ...(content.reviewedAt ? { dateModified: content.reviewedAt } : {}), isPartOf: { "@type": "WebSite", name: "Guilduo Docs", url: `${origin}${docsPath(locale, "")}` }, citation: page.sources.map(source => `https://github.com/ELRdn/Guilduo/blob/${sourceRevision}/${source.path}`) },
    ...(page.slug === "faq" ? [{ "@type": "FAQPage", inLanguage: locale, url: `${origin}${path}`, mainEntity: page.sections.filter(section => section.paragraphs?.length).map(section => ({ "@type": "Question", name: section.title, acceptedAnswer: { "@type": "Answer", text: section.paragraphs!.join("\n\n") } })) }] : []),
  ] };
  const nav = groups.map(group => `<div class="doc-nav-group"><p>${t[group]}</p>${articleLinks(locale, content[locale].filter(item => item.group === group), page.slug)}</div>`).join("");
  const toc = page.sections.map(section => `<a href="#${e(section.id)}">${e(section.title)}</a>`).join("");
  const quick = !page.slug ? `<section class="doc-quick" aria-labelledby="quick-title"><p class="doc-eyebrow">START HERE</p><h2 id="quick-title">${t.quick}</h2><p>${t.quickHint}</p><div class="doc-quick-grid">${["getting-started", "mcp-connection", "human-relay"].map((name, i) => {
    const item = content[locale].find(candidate => candidate.slug === name);
    return item ? `<a class="doc-guide" href="${docsPath(locale, name)}"><span class="doc-guide-number">0${i + 1}</span><h3>${e(item.navTitle ?? item.title)}</h3><p>${e(item.description)}</p><span class="doc-guide-action">${t.read} →</span></a>` : "";
  }).join("")}</div></section>` : "";
  return `<!doctype html>
<html lang="${locale}" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light">
<title>${e(title)}</title><meta name="description" content="${e(page.description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${e(origin + path)}">
${(["ja", "en", "x-default"] as const).map(lang => `<link rel="alternate" hreflang="${lang}" href="${e(origin + docsPath(lang === "en" ? "en" : "ja", page.slug))}">`).join("")}
<meta property="og:type" content="article"><meta property="og:site_name" content="Guilduo"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(page.description)}"><meta property="og:url" content="${e(origin + path)}"><meta property="og:locale" content="${locale === "ja" ? "ja_JP" : "en_US"}"><meta property="og:locale:alternate" content="${locale === "ja" ? "en_US" : "ja_JP"}"><meta property="og:image" content="${e(origin)}/assets/brand/og-guilduo.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Guilduo"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(page.description)}"><meta name="twitter:image" content="${e(origin)}/assets/brand/og-guilduo.png">
<link rel="icon" href="/assets/icons/favicon-32.png" type="image/png"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon-180.png"><link rel="sitemap" href="/sitemap.xml" type="application/xml"><link rel="stylesheet" href="/public-docs/styles.css">
<script>try{var t=localStorage.getItem("guilduo-docs-theme")||"dark";document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):(t==="light"?"light":"dark")}catch{}</script>
<script type="application/ld+json">${JSON.stringify(schemas).replaceAll("<", "\\u003c")}</script><script type="module" src="/public-docs/client.ts"></script></head>
<body><a class="doc-skip" href="#main">${locale === "ja" ? "本文へスキップ" : "Skip to content"}</a>
<header class="doc-header"><a class="doc-brand" href="/"><img src="/assets/brand/guilduo-mark-gold.svg" width="30" height="40" alt="" aria-hidden="true">Guilduo<span>Docs</span></a><div class="doc-header-tools"><a class="doc-language" data-language-switch href="${docsPath(locale === "ja" ? "en" : "ja", page.slug)}" lang="${locale === "ja" ? "en" : "ja"}" hreflang="${locale === "ja" ? "en" : "ja"}">${locale === "ja" ? "English" : "日本語"}</a><label class="doc-theme" hidden>${t.theme}<select id="docs-theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label><a class="doc-app" href="https://app.guilduo.com/">${t.app} <span aria-hidden="true">↗</span></a></div></header>
<div class="doc-layout"><aside class="doc-sidebar"><details class="doc-nav" open><summary>${t.menu}</summary><nav aria-label="${t.docs}">${nav}</nav></details><a class="doc-github" href="https://github.com/ELRdn/Guilduo">GitHub ↗</a></aside>
<main id="main" class="doc-main" tabindex="-1"><nav class="doc-breadcrumbs" aria-label="${locale === "ja" ? "パンくず" : "Breadcrumb"}"><a href="/">Guilduo</a><span aria-hidden="true">/</span><a href="${docsPath(locale, "")}">Docs</a>${page.slug ? `<span aria-hidden="true">/</span><span>${e(page.title)}</span>` : ""}</nav>
<div class="doc-search" hidden><label for="docs-search">${t.search}</label><div class="doc-search-field"><input id="docs-search" type="search" placeholder="${t.placeholder}" maxlength="120" autocomplete="off" aria-controls="docs-search-results" aria-describedby="docs-search-status"><button id="docs-search-clear" type="button">${t.clear}</button></div><p id="docs-search-status" role="status" aria-live="polite">${t.searchHint}</p><ul id="docs-search-results" aria-label="${t.search}" hidden></ul></div>
<article class="doc-article"><div class="doc-article-heading"><p class="doc-eyebrow">${t[page.group]} <span aria-hidden="true">/</span> GUILDUO</p><h1>${e(page.title)}</h1><p class="doc-lead">${e(page.lead)}</p></div>
${quick}<nav class="doc-toc-inline" aria-label="${t.toc}"><p>${t.toc}</p>${toc}</nav>${page.sections.map(section => renderSection(section, locale)).join("\n")}
${!page.slug ? `<section class="doc-directory"><h2>${t.overview}</h2><p>${t.overviewHint}</p>${groups.map(group => `<h3>${t[group]}</h3><div>${content[locale].filter(item => item.group === group && item.slug).map(item => `<a href="${docsPath(locale, item.slug)}"><strong>${e(item.title)}</strong><span>${e(item.description)}</span></a>`).join("")}</div>`).join("")}</section>` : ""}
<section class="doc-sources"><h2>${t.sources}</h2><p>${t.sourceHint}</p>${content.reviewedAt ? `<p>${locale === "ja" ? "内容確認日" : "Content reviewed"}: <time datetime="${e(content.reviewedAt)}">${e(content.reviewedAt)}</time> · ${locale === "ja" ? "公開資料の版" : "Public source revision"}: <a href="https://github.com/ELRdn/Guilduo/commit/${sourceRevision}">${e(sourceRevision.slice(0, 7))}</a></p>` : ""}<ul>${page.sources.map(source => `<li><a href="https://github.com/ELRdn/Guilduo/blob/${sourceRevision}/${e(source.path)}">${e(source.label)} <span aria-hidden="true">↗</span></a></li>`).join("")}</ul></section>
${["", "mcp-connection", "quests", "agents", "human-relay"].includes(page.slug) ? `<nav class="doc-related" aria-label="${locale === "ja" ? "活用例" : "Use cases"}"><h2>${locale === "ja" ? "Guilduoの活用例" : "Guilduo use cases"}</h2>${solutionSlugs.filter(slug => !["mcp-connection", "quests"].includes(page.slug) || slug === "mcp-task-management").filter(slug => !["agents", "human-relay"].includes(page.slug) || slug === "ai-agent-handoff").map(slug => `<a href="${solutionPath(locale, slug)}">${slug === "mcp-task-management" ? (locale === "ja" ? "MCPで人とAIのタスクを管理する" : "MCP task management for humans and AI") : (locale === "ja" ? "人とAIの引き継ぎとレビュー" : "AI agent handoff and human review")}</a>`).join("")}</nav>` : ""}
${page.related.length ? `<nav class="doc-related" aria-label="${t.related}"><h2>${t.related}</h2>${page.related.map(name => content[locale].find(item => item.slug === name)).filter((item): item is DocPage => !!item).map(item => `<a href="${docsPath(locale, item.slug)}"><span>${e(item.title)}</span><span aria-hidden="true">→</span></a>`).join("")}</nav>` : ""}</article>
<footer class="doc-footer"><p>${t.footer}</p><div><a href="/privacy/">${t.privacy}</a><a href="/terms/">${t.terms}</a><a href="https://github.com/ELRdn/Guilduo/issues">${t.issues}</a></div><p>Guilduo · AGPL-3.0-only</p></footer></main>
<aside class="doc-toc"><nav aria-label="${t.toc}"><p>${t.toc}</p>${toc}<a class="doc-toc-source" href="https://github.com/ELRdn/Guilduo">GitHub ↗</a></nav></aside></div><p class="doc-sr-only" id="docs-copy-status" role="status" aria-live="polite"></p>
<script type="application/json" id="docs-strings">${JSON.stringify(t).replaceAll("<", "\\u003c")}</script></body></html>`;
}

export function buildDocsAssets(origin = "https://guilduo.com"): Map<string, string> {
  origin = originUrl(origin);
  const content = readDocsContent();
  const assets = new Map<string, string>();
  const search = { ja: [] as object[], en: [] as object[] };
  const paths = ["/", "/lp/en/", "/privacy/", "/terms/", ...solutionSlugs.flatMap(slug => [solutionPath("ja", slug), solutionPath("en", slug)])];
  for (const locale of ["ja", "en"] as const) for (const page of content[locale]) {
    const path = docsPath(locale, page.slug);
    paths.push(path);
    assets.set(`${path.slice(1)}index.html`, renderDocsPage(locale, page, content, origin));
    const body = page.sections.flatMap(section => [section.title, ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? []), section.code?.text ?? "", ...(section.table?.rows.flat() ?? [])]).join(" ");
    search[locale].push({ title: page.title, description: page.description, path, text: `${page.lead} ${body}` });
  }
  assets.set("docs/search-index.json", JSON.stringify(search));
  // Optional machine-readable navigation; no claim of search or AI ranking benefit.
  assets.set("llms.txt", `# Guilduo\n\n> Guilduo is a Human × AI Work Platform for Quests, handoffs, evidence and human decisions.\n\nPublic beta documentation, reviewed ${content.reviewedAt ?? "against the cited public source"}. Source revision: ${content.sourceRevision ?? "main"}.\nThese are usage guides, not permission to modify user work or start AI execution. Agent registration does not start a model. Provider integrations and commercial terms must be checked against the cited public specification.\n\n## Japanese documentation\n${content.ja.map(page => `- [${page.navTitle ?? page.title}](${origin}${docsPath("ja", page.slug)}): ${page.description}`).join("\n")}\n\n## English documentation\n${content.en.map(page => `- [${page.navTitle ?? page.title}](${origin}${docsPath("en", page.slug)}): ${page.description}`).join("\n")}\n\n## Sources\n- [Public repository](https://github.com/ELRdn/Guilduo/tree/${content.sourceRevision ?? "main"}): Versioned specifications and API contracts.\n- [Sitemap](${origin}/sitemap.xml): Canonical public pages and language alternates.\n`);
  const alternates = (path: string): string => {
    const page = content.ja.find(candidate => docsPath("ja", candidate.slug) === path || docsPath("en", candidate.slug) === path);
    if (!page) {
      const solution = solutionSlugs.find(slug => solutionPath("ja", slug) === path || solutionPath("en", slug) === path);
      if (!solution) return "";
      return (["ja", "en", "x-default"] as const).map(lang => `<xhtml:link rel="alternate" hreflang="${lang}" href="${e(origin + solutionPath(lang === "en" ? "en" : "ja", solution))}"/>`).join("");
    }
    return (["ja", "en", "x-default"] as const).map(lang => `<xhtml:link rel="alternate" hreflang="${lang}" href="${e(origin + docsPath(lang === "en" ? "en" : "ja", page.slug))}"/>`).join("");
  };
  assets.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${paths.map(path => `<url><loc>${e(origin + path)}</loc>${path.startsWith("/solutions/") ? "<lastmod>2026-10-06</lastmod>" : ""}${alternates(path)}</url>`).join("")}</urlset>`);
  assets.set("robots.txt", `User-agent: *\nAllow: /docs/\nDisallow: /interaction-lab/\nDisallow: /next/\nDisallow: /lpv2/\nDisallow: /lpv2-1/\nDisallow: /api/\nDisallow: /public-docs/\n\nSitemap: ${origin}/sitemap.xml\n`);
  return assets;
}

/** Serve identical static article HTML in development and the production bundle. */
export function publicDocsPlugin(getOrigin: () => string): Plugin {
  return {
    name: "guilduo-public-docs",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (!pathname.startsWith("/docs/") && pathname !== "/docs" && !["/robots.txt", "/sitemap.xml", "/llms.txt"].includes(pathname)) return next();
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        try {
          const assets = buildDocsAssets(getOrigin());
          const key = pathname === "/docs" ? "docs/index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
          const body = assets.get(key);
          const directoryKey = `${pathname.slice(1)}/index.html`;
          if (pathname === "/docs" || (!body && assets.has(directoryKey))) { res.statusCode = 308; res.setHeader("Location", `${pathname}/${new URL(req.url ?? "/", "http://localhost").search}`); res.end(); return; }
          if (!body) { res.statusCode = 404; res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end("Documentation page not found"); return; }
          const type = key.endsWith(".html") ? "text/html" : key.endsWith(".json") ? "application/json" : key.endsWith(".xml") ? "application/xml" : "text/plain";
          res.setHeader("Content-Type", `${type}; charset=utf-8`);
          const result = key.endsWith(".html") ? await server.transformIndexHtml(pathname, body) : body;
          res.end(req.method === "HEAD" ? undefined : result);
        } catch (error) { next(error as Error); }
      });
    },
    generateBundle(_options, bundle) {
      const clientPath = realpathSync(fileURLToPath(new URL("./client.ts", import.meta.url))).replaceAll("\\", "/");
      const client = Object.values(bundle).find(item => item.type === "chunk" && item.isEntry && item.facadeModuleId?.replaceAll("\\", "/") === clientPath);
      if (!client || client.type !== "chunk") throw new Error("Docs client entry missing");
      const metadata = client as typeof client & { viteMetadata?: { importedCss?: Set<string> } };
      const css = [...(metadata.viteMetadata?.importedCss ?? [])];
      if (!css.length) throw new Error("Docs CSS missing");
      for (const [fileName, body] of buildDocsAssets(getOrigin())) {
        const source = body.replace('<link rel="stylesheet" href="/public-docs/styles.css">', css.map(file => `<link rel="stylesheet" href="/${file}">`).join(""))
          .replace('src="/public-docs/client.ts"', `src="/${client.fileName}"`);
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
