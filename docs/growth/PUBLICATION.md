# Solutions publication and verification

Prepared: 2026-10-06 (Asia/Tokyo). Publication is pending until the source-specific Site workflow and live checks complete.

## Candidate

- Baseline: public `main` `42caab0fa1f396f15e4e1277f6e36dda1ac9bd04`.
- Branch: `codex/seo-solutions-growth` in the attached public Docs worktree.
- Original dirty checkout changes are excluded from this publication.
- New articles: MCP task management and AI agent handoff, Japanese and English.
- Root sitemap: 28 → 32 canonical URLs. New page dates reflect the actual 2026-10-06 authored content, not build timestamps.

## Acceptance so far

- Strict TypeScript and design checks passed.
- 460 automated tests passed, including the new solution contract.
- Existing public Docs Chrome regression: 111/111 passed.
- Existing official LP Chrome regression: 43/43 passed.
- Final built solution candidate passed 72 browser, language, sitemap and crawler user-agent scenarios, including 320 / 390 / 768 / 1440px and JavaScript disabled. Evidence is recorded in `.qa-artifacts/solutions/`.
- Article JSON examples matched `request_human_review` input schema, cited repository files exist, and Product Hunt description is 216/260 characters.
- Public Web App cache guard passed before deployment preparation; the workflow must repeat it before upload and retain the previous deployment's assets.

## Publication and external outcomes

PR, final source SHA, CI URL, Site deployment URL and live results will be recorded after verification. No Search Console sitemap submission or URL Inspection has been performed from this environment: there is no authenticated Search Console browser/API connection. The owner confirmed an existing property and access; `SEARCH_CONSOLE.md` and `search-console-record.json` contain the prepared 14-URL procedure and pending evidence fields.

No external post, reservation, account creation, real inference, MCP write, real-account acceptance or actual-phone test was performed. Browser viewports and crawler user-agent probes are separate from phone acceptance and verified crawler IP visits. Rankings and AI citations remain measured outcomes after indexing.
