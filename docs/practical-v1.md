# Guilduo practical workspace v1

Owner decisions on 2026-10-30: finish practical product use through production acceptance; PC authoring with Pixel 9 review; bidirectional static images with originals/previews; reference/result/request/response context; six sequential Agent stages with required Human checks; existing recurrence UI and Web Push. Billing, Credits, advertising and formal paid-launch sign-off stay outside this change.

## Source and existing Quest correspondence

- Base: `3077340`; implementation: `257add3`. Work began in the isolated `.qa-artifacts/practical-v1` checkout and continued in the managed practical-v1 worktree. The original checkout and the prototype's untracked handoff remain untouched.
- [PR #83](https://github.com/ELRdn/Guilduo/pull/83) is open on `codex/practical-v1-release`. The owner explicitly deferred merge; production uses the verified branch through the existing manual workflows.
- G-01: actual task/Agent/review workflow and recorded friction.
- G-03: PC authoring; phone decisions and short corrections.
- LA-02/03/05: device sync, real MCP and performance acceptance. LP-R07 is archived in Guilduo while its saved text still names incomplete acceptance; this discrepancy is not proof of either success or failure. No Quest status or progress is changed by this implementation.

## Interfaces and storage

- MCP adds `prepare_quest_image_upload`, `list_quest_images`, `read_quest_image`, `remove_quest_image`, `set_quest_relay`, `advance_quest_relay`: catalog 57 → 63. Refresh client discovery. A successful image read must return actual image content, not just JSON metadata.
- Web uses `/v1/quests/:id/images`, scoped binary PUT `/v1/quest-images/uploads/:id`, private GET/DELETE `/v1/quest-images/:id`, and `/v1/quests/:id/relay[/advance]`. Review request/response accepts saved image IDs. Image export/deletion is Web-only.
- D1 migration 0018 and existing private R2; Cloudflare Images binding generates a 1600px WebP once (1024px retry only if over 1 MiB). Original ≤10 MiB, ten active images/source Quest, 500 MiB/owner including previews/reservations/deletion backlog. Images Free quota exhaustion fails the new upload without upgrading the plan or deleting existing data.
- Optional relay fields remain in Schema 7, protected against old snapshot writes. Reports, Human responses, acceptance and Quest scoring remain distinct. Registry review policy wins over a stage's unchecked box. Inactive current Agents block; unstarted future stages can be edited.
- Canonical Skill and source mirrors document the new tools. Published archives/npm versions are not overwritten or republished by this change; refreshed MCP discovery is sufficient for the transport tools.

## Validation ledger

- Added tests exercise actual image decode/resize, original SHA preservation, both MCP image transports, wrong owner, quota races, revoked uploads, response draft visibility, relay stages/required review/revisions, recurrence projections and reward deduplication.
- Browser verifier: `node --import tsx tools/verify-quest-images.mts http://127.0.0.1:4319`. Uses an actual local Worker HTTP bridge, SQLite D1 and private R2 fixtures with real Sharp image processing. No provider credentials or production data. Captures and results go to `.qa-artifacts/practical-v1/`.
- Final local full suite: 830 tests, 829 passed, 0 failed, 1 skipped; affected tests: 25 passed. Typecheck, generated contracts, design check, production build and diff whitespace checks passed.
- [CI on implementation commit](https://github.com/ELRdn/Guilduo/actions/runs/41001493167): all steps passed; 823 tests, 819 passed, 0 failed, 4 skipped. Skips concern platform-specific package checks and the separately installed DSH SDK fixture, not the new image/relay tests. The new HTTP image browser verifier passed all 12 checks.
- After deployment, the real local Worker HTTP test additionally covers MCP relay configuration/submission, Web Human approval, Registry/final review enforcement, rejection of the previous Agent and the unfinished completion patch, and final REST acceptance without Quest scoring. Both tests in `tests/practical-api.test.ts` passed. These are isolated fixtures, not production Human answers or external Agent execution; no runtime source was changed by this follow-up.
- Local HTTP browser: 12 checks passed at 390/1440px, Japanese/English and light/dark, covering retained failed uploads, explicit thumbnail retry, preview/original separation, modal focus, saved image feedback and actual AFA recurrence editing. CI runs this verifier. A browser viewport is not a physical Pixel 9 or TalkBack result.
- Inline decision-image follow-up: the central Guild decision card now shows the selected request images, or source references/results when no selection exists, directly below its title. The existing viewer opens in one tap on PC and mobile. Incoming images and response drafts stay separate; viewing never confirms or submits the review. Two focused selection tests and all 18 HTTP browser checks passed, including the actual AFA Human-request and ordinary Agent-result cards, refresh after deletion, returning during image loading, focus restoration and absence of implicit writes/original reads. Typecheck, design check and production build passed.

## Deployment and remaining acceptance

Deploy only the verified source: D1 0018 → Worker with IMAGES/private R2 → Web. Reconcile Site archive and old tabs using existing guards. Record commit, CI run, Worker/Site deployment IDs and UTC/JST timestamps. Roll back Web while retaining the new server's data protections.

Production checklist: original/image read from real R2; new tools after client refresh; actual Codex image reading and return upload; a two-Agent relay with an actual Human answer; PC ↔ Pixel 9 persistence; Push delivery and exact-request navigation; permission denial; reload after correction. Keep each unexecuted check pending. Do not close launch gates or claim phone acceptance from fixtures.

### Production record

- [Worker workflow](https://github.com/ELRdn/Guilduo/actions/runs/41002722954) succeeded on `257add3`: D1 `0018_quest_images.sql` applied, IMAGES bound, deployed 2026-10-30 04:25:45 UTC / 13:25:45 JST. Public health reports 63 tools, API 2.7.0, Schema 7; unauthenticated image listing/export return 401 and private/no-store.
- [Site workflow](https://github.com/ELRdn/Guilduo/actions/runs/41002944514) succeeded on the same commit and became ready at 2026-10-30 04:31:42 UTC / 13:31:42 JST. HTML cache guards, the actual upload archive retention check (107 current / 16 retained assets), published Docs and real missing-path 404 checks passed. The public entry serves `allForAdhd-BAlFN6_Y.js`. Exact deployment identifiers remain in local operation evidence rather than public documentation.
- Actual authenticated production Web: a synthetic reference PNG was saved, independently listed through the connected MCP `get_quest`, then reopened through Web. Its original was explicitly loaded at 1800×700, downloaded from the visible image and compared locally: 51,517 bytes and SHA-256 `6a4a99c8c67ae26c6627eb85f1ba79433633e629d4f7d907e6d84074e17e9b76` exactly match the input. The stored WebP preview is 12,012 bytes. This proves real Images processing and private D1/R2 persistence/read-back; it does not prove a refreshed client's MCP ImageContent handling or a physical phone result.
- The current Codex connection exposes 56 cached tools despite the server's 63-tool catalog. Real image-tool acceptance requires a client discovery refresh. No credentials are extracted, Agent relinked or scopes expanded to bypass that boundary.
- A separate synthetic QA Quest and Human confirmation request were created through the authorized connection. The owner reported successful Pixel 9 reply/image attachment. Connected MCP read-back confirmed an approved saved Human answer at 2026-10-30 11:13:53 UTC / 20:13:53 JST with three PNG response attachments (864×1939); the text response was empty. The original QA Quest stays active in review_required. This proves the saved answer and image references, not Push receipt, notification-tap navigation or TalkBack. The owner's next feedback requested direct image previews in the featured card; the earlier approval does not accept that later UI change.

| Requirement | Current evidence / remaining work |
| --- | --- |
| Images: storage, preview, original, limits and permissions | Local unit/HTTP/browser checks and production save/original hash match passed; live cross-owner denial is not claimed from fixtures. |
| MCP image read and return upload | Both transports passed isolated HTTP tests; live `get_quest` returns the saved image metadata. Actual new image-tool calls await client discovery refresh. |
| Six-stage relay and mandatory Human checks | Domain/HTTP protections and one saved production Human answer are confirmed. A real two-Agent relay remains unaccepted; assignment alone does not prove external execution. |
| Recurrence and reminders | Shared date/reward/reminder tests and actual AFA recurrence editing passed. Physical Push delivery remains pending. |
| PC ↔ Pixel 9 and Human image feedback | Production PC image workflow passed; the owner reported Pixel 9 reply/attachment success and MCP confirmed the approved answer with three images. TalkBack, Push receipt and its exact-request navigation remain pending. Inline previews passed local PC/mobile browser checks and still require published-UI verification. |
| Production and Git | D1 → Worker → Web succeeded from `257add3`; PR #83 remains open and unmerged as requested. |

### Conditions outside this practical release

Stripe Live is implemented but is not activated or financially accepted by this work. Seller/Live eligibility, approved products/prices/tax/refund settings, matching secrets/webhooks and a separately authorized real payment/refund check remain necessary. Credits and commercial Jev likewise retain their product, data-policy and budget gates; their code or fixture results do not establish commercial readiness. See [product decisions](launch-product-decisions.md) and [operations](launch-operations.md). No paid plan, real payment, advertising launch or formal paid-launch Go is performed here.

The unchanged dependency lockfile reports 20 audit advisories (4 moderate, 15 high, 1 critical), including MCP SDK/Zod and development dependencies. This release is not a dependency-security remediation or a security sign-off. The audit is retained with local validation evidence; dependency upgrades need their own compatibility validation.

For backup, include `quest_images` in the consistent D1 snapshot and inventory/read-back/hash both R2 object keys returned by every page of `/v1/quest-images/export`. Restore into isolated D1/R2 and test authorized image reads. For approved account deletion, first revoke MCP connections and stop writes, then call `DELETE /v1/quest-images` with `confirm: delete-quest-images` as the human owner until remaining=0; a 409 means an upload must settle before retrying. Continue existing account/financial-retention procedures. No production deletion or restore is part of automated verification.
