# SEO and AEO/GEO review — 2026-10-05

Scope: the public Guilduo Docs, edited against public source commit
`5125178d48e94be8d8a16d401fd992da5d8a2b5d`. The publication candidate uses that
already deployed `main` baseline; experimental application, billing, analytics
and Worker changes from the original dirty checkout are excluded.

## Search discovery and indexing

- All 24 articles have real static HTML, one H1, distinct titles/descriptions,
  canonical URLs, reciprocal Japanese/English/x-default alternates, social
  metadata, named sections, source citations and related articles.
- The official LP links to the Docs in both languages. Category navigation and
  the sitemap cover every article. Public build outputs include robots.txt and
  sitemap.xml; application/internal routes are excluded from the sitemap.
- Primary content and links are available without JavaScript. The Docs load a
  small client for local search and copy; they do not require authentication or
  inference and do not publish user work.
- Unknown routes, trailing-slash handling, crawler access and actual response
  content must be checked on the production host, not inferred from a 200 status
  or the local preview. Search Console indexing and ranking are external outcomes.

## Answer extraction and provenance

- MCP, Codex and Claude introductions now state the endpoint and connection
  steps directly. A summary can be quoted without having to infer a connection
  recipe from the rest of the page.
- The FAQ has seven focused questions in each language. Provider availability,
  commercial terms, MCP/Skills/plugins and the legacy product name are separated.
  Responses state their subject explicitly, including that Human review does
  not automatically complete the source Quest.
- FAQPage questions and answers are generated from the visible article content;
  tests require exact correspondence. No hidden answers, reviews, ratings or
  sales claims are added. TechArticle metadata identifies the publisher and
  review date. The same review date and public revision are visible to readers.
- Source links are pinned to a public commit. The content does not claim that
  merely registering an Agent runs a model, or that unapproved integrations and
  paid terms are available. Updating the source revision requires another review.
- llms.txt is an optional index to the canonical documents. It is not an
  indexing prerequisite, a special AI optimization standard, or proof that an
  AI service will quote the site.

## Crawl policy and practical limits

Search retrieval and model training are separate policies. Verify Googlebot,
Bingbot, OAI-SearchBot and user-triggered retrieval access to public Docs; do not
infer that granting search access requires granting GPTBot training access.
Also check host-level Cloudflare/WAF controls because generated robots.txt alone
does not establish crawler access. A browser or spoofed user-agent probe is not
a visit from a verified crawler IP.

FAQ structured data is kept aligned with visible answers, but Google retired
FAQ rich results on May 7, 2026. It is not a rich-result objective. Similarly,
good structure and citations enable extraction but do not guarantee AI citations,
AI Overview visibility, traffic or ranking. This review does not substitute for
real-phone usability acceptance or product launch acceptance.

## Official sources checked via HTTP 200

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google: Search documentation updates](https://developers.google.com/search/updates)
- [Google: generative AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [OpenAI: crawler and retrieval bots](https://developers.openai.com/api/docs/bots)

Final candidate acceptance: 459 automated tests, 111 Chrome Docs scenarios,
43 official LP scenarios, 40 existing launch scenarios, type checks, design check,
production build and GitHub CI passed. Published Docs also passed 111 Chrome
scenarios and 39 HTTP/discovery/crawler user-agent checks. The SPA fallback was
removed before creating the final deployment, and missing Docs return HTTP 404.
See [PUBLICATION.md](PUBLICATION.md) for the live evidence and remaining limits.
