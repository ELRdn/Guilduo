# Guilduo Solutions

Two bilingual use-case articles explain the shipped public beta to individual developers using external AI tools. They complement Docs: these pages explain the problem, the workflow and the limitations; Docs maintain the detailed connection and operation instructions.

- Japanese: `/solutions/mcp-task-management/`, `/solutions/ai-agent-handoff/`
- English: `/solutions/en/mcp-task-management/`, `/solutions/en/ai-agent-handoff/`

The four ordinary HTML inputs use the existing Vite build and the official LP stylesheet through `styles.css`. There is no CMS, new dependency or executable page script. Language links, sources, task examples and calls to action work without JavaScript. Source claims are pinned to public revision `42caab0fa1f396f15e4e1277f6e36dda1ac9bd04`. The example is illustrative, not a customer or device-test result.

Update both languages together. Recheck the actual public product and source contracts before changing a claim. A significant content change must update the page's visible review date and JSON-LD `dateModified`, and its known update date in the root sitemap maintained by `public-docs/build.ts`. Do not replace dates on every build. Keep internal links relative and canonical/social/structured URLs on the official public origin. Do not add a link to a `/solutions/` directory index: no hub is published in this release.

Run `npm run check`, `npm run design:check`, the related tests and `npm run build`. Against a built preview, run `npm run solutions:verify -- http://127.0.0.1:5193`, then the existing LP and Docs checks. The solution verifier covers four viewport widths without JavaScript, language navigation with JavaScript, long source URLs, keyboard skip navigation, metadata, all sitemap entries and public crawler user-agent probes. These probes are not verified crawler-IP visits. It blocks any attempted Cloudflare RUM upload before sending it.

The same verifier can run against `https://guilduo.com`; production additionally must return real HTTP 404 for unknown solution and Docs paths. Local Vite preview serves the LP at `/lp/` while the public hostname rewrites `/` to that page; the verifier handles this local distinction.

Search Console and outward-facing article/post drafts are in [`docs/growth/`](../docs/growth/README.md). Deployment, Search Console submission, Google indexing and traffic are separate results.
