# Guilduo practical workspace v1

Owner decisions on 2026-10-30: finish practical product use through production acceptance; PC authoring with Pixel 9 review; bidirectional static images with originals/previews; reference/result/request/response context; six sequential Agent stages with required Human checks; existing recurrence UI and Web Push. Billing, Credits, advertising and formal paid-launch sign-off stay outside this change.

## Source and existing Quest correspondence

- Base: `3077340` (latest fetched main). Implementation is isolated in `.qa-artifacts/practical-v1`; the original checkout and the prototype's untracked handoff remain untouched.
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
- Local full suite: 829 tests, 828 passed, 0 failed, 1 skipped. After the final snapshot/completion guard, 25 relevant tests passed. Typecheck, generated contracts, design check, production build and diff whitespace checks passed.
- Local HTTP browser: 12 checks passed at 390/1440px, Japanese/English and light/dark, covering retained failed uploads, explicit thumbnail retry, preview/original separation, modal focus, saved image feedback and actual AFA recurrence editing. CI runs this verifier. A browser viewport is not a physical Pixel 9 or TalkBack result.

## Deployment and remaining acceptance

Deploy only the verified source: D1 0018 → Worker with IMAGES/private R2 → Web. Reconcile Site archive and old tabs using existing guards. Record commit, CI run, Worker/Site deployment IDs and UTC/JST timestamps. Roll back Web while retaining the new server's data protections.

Production checklist: original/image read from real R2; new tools after client refresh; actual Codex image reading and return upload; a two-Agent relay with an actual Human answer; PC ↔ Pixel 9 persistence; Push delivery and exact-request navigation; permission denial; reload after correction. Keep each unexecuted check pending. Do not close launch gates or claim phone acceptance from fixtures.

For backup, include `quest_images` in the consistent D1 snapshot and inventory/read-back/hash both R2 object keys returned by every page of `/v1/quest-images/export`. Restore into isolated D1/R2 and test authorized image reads. For approved account deletion, first revoke MCP connections and stop writes, then call `DELETE /v1/quest-images` with `confirm: delete-quest-images` as the human owner until remaining=0; a 409 means an upload must settle before retrying. Continue existing account/financial-retention procedures. No production deletion or restore is part of automated verification.
