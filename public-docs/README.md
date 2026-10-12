# Guilduo public documentation

The public Docs are static, bilingual articles generated alongside the existing
Appwrite Site. Japanese: `https://guilduo.com/docs/`; English:
`https://guilduo.com/docs/en/`. The `docs.guilduo.com` subdomain remains reserved.
Both paths were published and verified on 2026-10-05 (Asia/Tokyo).
See [PUBLICATION.md](PUBLICATION.md) for deployment and live acceptance evidence.

## Content and sources

- `content.json` is the curated article source, in Japanese and English. Both
  languages must have the same slugs. Text fields are plain text; code blocks are
  escaped. HTML and Markdown in text fields are not interpreted.
  `navTitle` supplies a short navigation label while `title` stays descriptive
  for the article heading and search metadata.
- `SOURCES.md` records the public GitHub revision and editorial decisions.
  `sourceRevision` in the content pins each article's source links to that commit.
- Update an article by checking the public specification and the shipped feature
  first, editing both languages, and retaining the relevant source paths. Do not
  turn an internal roadmap, unapproved billing decision, or synthetic demo into a
  public feature claim. Do not publish private runbooks or credentials.
- The content validator rejects duplicate paths, unmatched translations,
  duplicate metadata and section IDs, invalid source paths, broken related
  articles, and tables with mismatched columns.

## Implementation

`build.ts` integrates with Vite: development middleware and the production build
render the same article HTML. The production bundle contains `docs/**/index.html`,
`docs/search-index.json`, `sitemap.xml`, `robots.txt`, and hashed client/CSS assets.
No generated HTML is checked into Git. Pages are served directly from the static
file tree; the existing host rules rewrite only `/`, so `/docs/` needs no new DNS
or catch-all rewrite. CSS uses the approved LP token aliases and stays scoped to
these documents. The application authentication, service worker and state are
not loaded.

Navigation, content, code, source links, related articles, metadata and language
switching work without JavaScript. `client.ts` progressively enables device-local
full-text search, code copying, responsive navigation, and a Docs-specific
Dark/Light/System preference. Search makes one same-origin index request after
typing; queries are never sent to an external search or analytics service. A
failed index request can be retried by typing again. Clipboard failure is
announced and manual selection remains available.

The sitemap covers the official Japanese and English LP, Privacy, Terms, and all
Docs articles. Each Docs article has reciprocal language alternates, a canonical,
social metadata, BreadcrumbList and TechArticle JSON-LD. No dates, ratings,
pricing or review counts are invented. The optional `PUBLIC_SITE_URL` must be an
HTTP(S) origin and applies to both the Docs and existing public metadata.

The seven visible FAQ questions also generate matching FAQPage metadata. Content
review date and source revision appear in the article and metadata. `llms.txt`
is an optional canonical guide index. See [SEO_AEO_REVIEW.md](SEO_AEO_REVIEW.md)
for the audit, official guidance and indexing/AI citation limits.

## Local verification

```powershell
npm run design:check
npm run check
npx tsx --test tests/public-docs.test.ts tests/public-url-docs.test.ts tests/site-routing.test.ts
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# In another terminal:
npm run docs:verify -- http://127.0.0.1:4173
```

The browser verifier uses the installed Chrome (override with `QF_CHROME_PATH`),
checks both languages at 320/768/1440px, navigation and search interactions,
JavaScript-disabled articles, overflow and runtime errors. Screenshots are saved
under `.qa-artifacts/public-docs/`. Open `/docs/` directly in development or preview.

## Publication acceptance

Deploy through the existing approved Site workflow. Check public `/docs/`, a deep
article, the English equivalent, `/docs/search-index.json`, `/sitemap.xml`,
`/robots.txt`, LP navigation and hashed assets at `guilduo.com`. A 200 response is
insufficient: verify the actual article heading, canonical and HTML body. Unknown
article paths should return a real 404 at the hosting layer rather than a soft
404 application fallback. Confirm directory/trailing-slash handling. Because the
Site's static tree is also served on compatibility hosts, canonical metadata
must continue pointing to `guilduo.com`; do not index alternate hosts as new sites.

After publication is verified, update the publication-pending status in the
public URL guide and READMEs. Submit the sitemap through the site's verified
Search Console property when available. Indexing, search ranking, product launch
acceptance and deployment approval remain separate from the local checks.

## Verified locally on 2026-10-05 (Asia/Tokyo)

- Public `main` source revision:
  `5125178d48e94be8d8a16d401fd992da5d8a2b5d` (live GitHub SHA rechecked).
- 12 Japanese and 12 English pages emitted in the production build; source links
  and publication status documented in `SOURCES.md`.
- `npm run check`, subsequent TypeScript check, `npm run design:check`, production
  build and scoped `git diff --check`: passed.
- Publication candidate automated tests: 457 passed, including 11 Docs tests.
  This candidate is based on deployed `main`; the original checkout's additional
  unpublished application tests and changes are excluded. Public URL and
  host-routing checks also passed after the documentation update.
- Real Chrome against the final production preview: 111/111 checks passed,
  including all 24 articles without JavaScript at 320/768/1440px, search, clipboard,
  language, theme, keyboard and expected-failure recovery. Desktop/mobile and
  Light/Dark screenshots were also inspected. Existing LP verification passed
  with the new Docs links.
- Local static discovery endpoints served the expected content types; a missing
  article returned 404. Production publication and live host checks subsequently
  passed; Search Console submission has not been performed.

Local evidence: `.qa-artifacts/docs-browser.log`, `docs-build.log`,
`docs-tests.log`, `docs-launch.log` and `.qa-artifacts/public-docs/` screenshots. These generated
artifacts remain ignored and are not published as documentation.

## Production verification

The final candidate passed 459 automated tests and GitHub CI. Published Docs
passed 111 Chrome scenarios and 39 HTTP/discovery/crawler user-agent checks.
All 24 pages are readable without JavaScript; missing Docs paths return a real
404. Existing LP, Web App and compatibility entries still boot and load assets.
The browser verifier blocks host-injected Cloudflare RUM uploads before sending
them and reports that separately from forbidden application writes. This does
not change the host's analytics policy. Real-phone usability and verified crawler
IP access remain separate from browser emulation and user-agent probes.
