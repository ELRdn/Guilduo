# Guilduo Docs publication — 2026-10-05 (Asia/Tokyo)

## Next-hosts beta.12 update — published 2026-10-10

The OpenAI, Grok Bot and Muse Code guides are added in Japanese and English;
Codex is updated. There are 18 articles per language (36 pages). Concurrent
Claude guide content is preserved. Public source revision:
`53793f068546524305d3bc8634edf2918eef4c6b`, merged [PR #64](https://github.com/ELRdn/Guilduo/pull/64).
[Final source CI](https://github.com/ELRdn/Guilduo/actions/runs/38058236638) passed.
[The four host ZIPs](https://github.com/ELRdn/Guilduo/releases/tag/guilduo-next-hosts-v0.6.0-beta.12)
were published as a prerelease. Tag/source, all four downloaded SHA-256 values and
GitHub asset digests matched the frozen candidates.

[Docs PR #65](https://github.com/ELRdn/Guilduo/pull/65) and
[final Docs CI](https://github.com/ELRdn/Guilduo/actions/runs/38058874316) completed.
[Site deployment 38059302339](https://github.com/ELRdn/Guilduo/actions/runs/38059302339)
succeeded for `9f0ae2696f06441323d82eac22977f26ab5d9f8c`, with the existing
cache safety, previous-asset retention and missing-static-path guards enabled.

Live acceptance at 2026-10-10T14:27:37.198Z: **41/41 HTTP checks** passed,
covering all 36 actual article headings, leads, canonicals, pinned source SHA and
exact command blocks; search index (18 per language), sitemap, robots, llms and a
genuine missing-path 404. The eight changed guides also passed live browser
heading/version/source checks, Japanese/English copy success announcements and
language switching. Both Claude guides remained byte-identical as content data
to the concurrent main version used for this integration.

[Independent publication evaluation](../docs/acceptance/guilduo-next-hosts-publication.md)
records public Git/ZIP and per-host acceptance boundaries. No P1/P2 remains in
the reviewed distribution scope. Official Guilduo Docs publication does not mean
OpenAI, Cursor or another host's directory approval.

Local validation: 11 Docs tests, build, 40 HTTP checks including every article's
actual heading/lead/canonical/command, search index, sitemap, robots and llms.
Browser checks cover the eight changed articles, Japanese/English copy success
announcements and language switching. Independent AI content review found no
P1/P2. Clipboard contents and physical mobile hardware were not inspected.

OpenAI verification/submission, Grok native acceptance, Muse OAuth and both
candidates' model/Human acceptance, and trusted Codex hook execution remain
outside this documentation publication. Current per-host gates are recorded in
[the acceptance report](../docs/acceptance/guilduo-next-hosts.md).

Published Japanese Docs: https://guilduo.com/docs/

Published English Docs: https://guilduo.com/docs/en/

## Release evidence

- [Docs implementation PR #49](https://github.com/ELRdn/Guilduo/pull/49)
- [Static routing and read-only verification PR #50](https://github.com/ELRdn/Guilduo/pull/50)
- Final deployed source: `cb82a1e15b80567bf84427263ac988f67755c89d`;
  merged implementation: `d631cc8163941d840103425208a709901fcac183`.
- [Final candidate CI: success](https://github.com/ELRdn/Guilduo/actions/runs/37227369953)
- [Final Site deployment: success](https://github.com/ELRdn/Guilduo/actions/runs/37227367141)
- 459 automated tests passed. Type checks, design checks, build, launch,
  accessibility, app-entry and isolated-Worker CI checks passed. Cache safety,
  previous-asset retention and archive validation remained enabled.

## Live acceptance

- 111/111 Chrome Docs scenarios passed against `https://guilduo.com`, including
  every Japanese/English article without JavaScript at 320/768/1440px, local
  search, language switching, keyboard navigation, theme persistence, clipboard
  and recovery from expected search/clipboard failures. Physical phone hardware
  was not used. The final deployment retains the same Docs HTML/client/CSS.
- 39/39 HTTP checks passed after the final deployment at 2026-10-05 04:16 JST:
  24 actual article bodies/canonicals, robots.txt, sitemap.xml, llms.txt,
  search index, three directory redirects, a genuine missing-path 404,
  five crawler user-agent probes, and Japanese/English LP Docs links.
- Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User and PerplexityBot probes returned
  the actual FAQ HTML without a challenge or X-Robots-Tag restriction. This is
  user-agent testing, not proof of access from verified crawler IPs.
- Existing Web App root and `/next/relay-forge/` booted at 390px with the signed-out
  screen and no page errors. LP, `/next/`, Privacy and Terms returned their static
  entries; referenced JS/CSS assets returned correct content types. No login,
  model inference, MCP write or private workspace acceptance was performed.
- The edge injects Cloudflare RUM independently of Docs. The read-only Chrome
  verifier blocked 38 telemetry upload attempts before sending them, and detected
  no application write requests. This does not disable production host telemetry.

Generated logs/screenshots remain in ignored `.qa-artifacts/`. No credentials,
private account information or private runbooks are included in this report.

## Remaining external outcomes

Search Console sitemap submission has not been performed. Crawling, indexing,
ranking, Google AI feature visibility and citations by AI services remain external
outcomes. FAQPage and llms.txt are not guarantees of rich results or AI citations.
The owner's physical-phone review and real-account product launch acceptance
remain separate from this public documentation deployment.
