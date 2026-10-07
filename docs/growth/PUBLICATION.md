# Solutions publication and verification

Published: 2026-10-06 02:16 JST (2026-10-05T17:16:05Z). The four solution pages and 32-URL sitemap are live.

## Published candidate

- Baseline: public `main` `42caab0fa1f396f15e4e1277f6e36dda1ac9bd04`.
- [Implementation PR #51](https://github.com/ELRdn/Guilduo/pull/51), merged.
- Deployed source SHA: `3c3af3add1f25da6ea58d5d61fc59955a1cdfa5d`.
- [PR CI](https://github.com/ELRdn/Guilduo/actions/runs/37345719100): success.
- [Merged-main CI](https://github.com/ELRdn/Guilduo/actions/runs/37346585283): success.
- [Site deployment](https://github.com/ELRdn/Guilduo/actions/runs/37346626622): success. Active deployment `6ac3db241c31a8c398ad`; retention bootstrap false.
- Public HTML cache guards passed. Archive verification retained 18 previous assets alongside 74 current assets. No claim is made about dashboard cache-rule state.
- Original dirty checkout changes are excluded. These records are a later documentation commit; the deployed source remains the SHA above.

## Live pages

| Topic | Japanese | English |
| --- | --- | --- |
| MCP task management | https://guilduo.com/solutions/mcp-task-management/ | https://guilduo.com/solutions/en/mcp-task-management/ |
| AI agent handoff and human review | https://guilduo.com/solutions/ai-agent-handoff/ | https://guilduo.com/solutions/en/ai-agent-handoff/ |

Root sitemap: 28 → 32 canonical URLs. New page dates reflect actual 2026-10-06 authored content, not build timestamps.

## Acceptance

- Strict TypeScript and design checks passed; 460 automated tests and production build passed locally and in CI.
- Local built solutions: 72/72 browser, language, sitemap and user-agent scenarios passed. Existing Docs: 111/111; LP: 43/43. Local evidence is preserved under `.qa-artifacts/solutions-local-20261006/` and `.qa-artifacts/public-docs-local-20261006/`.
- Production solutions: **74/74** passed, including 320 / 390 / 768 / 1440px, JavaScript disabled, keyboard skip, long URLs, language links, all 32 sitemap bodies and canonical URLs, five crawler user-agent probes, and real unknown-Docs / unknown-Solutions HTTP 404.
- Production solution SEO: **4/4** header and JSON-LD checks passed: HTML content type, no noindex header or Cloudflare challenge, substituted public URLs, self-canonical article entities, language, review dates, sourced citations and breadcrumbs.
- Existing production Docs Chrome regression: **111/111** passed. Production Docs/routing/robots/sitemap/search/LP HTTP checks: **39/39** passed.
- Official Japanese/English LP and Web App / compatibility entry: **8/8** Chrome checks passed at 390 / 1440px, including body, canonical, no overflow, loaded assets and no page errors. Web App account and JWT attempts received synthetic signed-out responses; no real login or API mutation was sent. The check fixture was corrected to stub the startup JWT request before rerunning.
- Host-injected Cloudflare RUM attempts were blocked before upload: solutions 4, Docs 38, entry checks 8. User-agent probes are not verified crawler-IP visits.
- Article JSON examples matched the published `request_human_review` schema, cited repository files exist, and Product Hunt description is 216/260 characters.

Production evidence: `.qa-artifacts/solutions/results.json`, `solutions-production-seo.json`, `solutions-docs-production-http.json`, `solutions-production-entry.json`, `solutions-docs-production-browser.log`, and `solutions-site-deployment.log`.

## SEO / AEO / GEO review

Each topic has original Japanese and English copy explaining the problem, workflow, illustrative example, fit, limits and start path. Static content and descriptive headings are readable without JavaScript. LP, related Docs and READMEs link to the use cases; setup details remain in Docs. Titles/descriptions are distinct, language alternates reciprocal, and canonical/OG/article URLs use the official site. Public code citations and dated review distinguish documented behavior from examples. Agent registration does not launch a model; human response, Handoff acceptance and original Quest completion remain separate. No customer success, automatic execution, ranking, AI citation or rich-result claim is invented.

## Search Console and external outcomes

No authenticated Search Console connection is available here. Existing property access was owner-confirmed, but permission, manual actions, security issues, index status, Search generative AI setting, performance baseline, sitemap submission and URL inspection / registration requests are **not performed or not verified**. `SEARCH_CONSOLE.md` and `search-console-record.json` retain 14 pending URL records; public HTTP results do not substitute for Google indexing evidence.

The intended baseline is 2026-09-08 through 2026-10-05 (28 complete days before publication); export it when those dates have finished processing. Planned follow-up dates are 2026-10-13 and 2026-11-03. No automatic monitoring was created. Search rankings, traffic and AI citations remain unmeasured outcomes.

Zenn, DEV, X, Show HN, Product Hunt and Reddit materials are prepared under `docs/growth/`, with current community-rule limitations recorded. No external post, reservation, account creation, real inference, MCP write, real-account acceptance or actual-phone test was performed. The owner can now open the live URLs on a phone.
