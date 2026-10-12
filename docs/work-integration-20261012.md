# Guilduo paused-work integration — 2026-10-12

## Scope

The owner authorized investigation, safe push, PR/main integration, production Worker/Site publication and a source release tag. `claude/ux-new` is active work and explicitly excluded: no checkout, push, merge or edits.

The original 10-worktree/71-branch audit and 12-ref push are recorded in `work-checkpoint-20261012.md`. Existing unpublished work remains preserved in those remote branches. Integration starts from main `7b4c8a014d6c819ef4995079e3af9d86add7b620` and merges the checkpoint while preserving main's newer public-site, SEO, host-package and source-release behavior. Storage-capacity changes are already represented in the integrated source; the stability and roadmap checkpoint commits are included. Historical LP candidates and the orphan Claude mirror are preserved remotely rather than replacing the newer published implementations.

## Production reconciliation

Before publication, Cloudflare returned active Worker version `ec2411b7-15c2-4cee-9340-71edb92da872`, module SHA-256 `cd06ed97283858b1384f4d58f2dcc89d445eb15765572169f2240428e8481c13`, exactly matching the saved SEO deployment. The module is retained privately for comparison and rollback.

Comparing the pre-SEO public bundle with the saved active module identifies the previously direct-deployed changes: monotonic Quest timestamps and version checks, prepared transactions, shared MCP Agent selection and authorization, token persistence, request timing, bootstrap/read coalescing and public telemetry validation. These behaviors are present in the integration and their existing regression suites. Module bytes will differ because this release adds productivity and disabled commercial implementation.

Production's migration ledger contains 0001–0011, including shared MCP Agents. The reviewed remaining 0012–0016 migrations add billing, Jev, linked-analytics, budget and private productivity tables/indexes; no existing applied migration is rewritten. Commercial runtime switches stay disabled. Quest storage remains Appwrite, productivity stays private D1; archiving a Quest does not delete its notes or entries.

## Validation and publication

TypeScript, design, generated contracts and the build are checked on this integrated checkout. Root/browser/CI results and publication receipts are recorded below only after execution. The Worker manual workflow must finish before the Site workflow. Site cache guards and 48-hour hashed-asset retention are preserved. `v0.6.0-beta.9` publishes source only; host extension versions are unchanged.

Physical touch/Pixel 9, cross-device Google authentication, real external Agent/Human round trips and extended observation remain separate acceptance. Paid-launch signing, Live billing and Jev are not activated by this task.

## Integration verification before merge

- Windows root suite: 780 passed, zero failed, one platform skip (781 discovered). TypeScript, design check, API idempotence and build passed.
- CI confirmed 45 LP, 147 Docs, 84 Solutions, 40 launch, 343 accessibility and 12 built-entry scenarios before exposing a missing optional LP measurement mount. The latest LPv3 entry now mounts that existing module only under its disabled-by-default runtime flag; the independent built measurement check passed 31 scenarios across nine languages and 320/1440 widths with zero provider calls.
- In the in-app browser against isolated Worker/SQLite D1: mouse selection 10:00–11:00 saved a 60-minute record; a note title/body saved; an active timer restored after reload and stopped from Quests. 390px showed no horizontal overflow, the five primary destinations and all More entries; board selection was retained. Physical touch was not checked.
- Actual production D1 export was downloaded into private ignored storage, SHA-256 `c7709f48eb95d24268efcbf89b68d6f4f9a51efaaba467c6bd4b22284646ee7e`. Local isolated restoration passed SQLite integrity and preserved all 11 migration records. This does not claim timed production disaster recovery or RPO/RTO acceptance.

The compact desktop Home grid retained a five-row breakpoint definition that lacked the timer area, creating implicit columns and clipping Quest actions. The integration now reserves the timer row in that breakpoint too; actual hit testing confirms the Start button receives input. Mobile timer targets use the existing comfortable-control token.

After this correction, local browser checks passed: 15 workspace-sync scenarios (two editors/conflicts, durable saves and recovery), seven quiet-refresh scenarios, 34 Human relay scenarios, Settings at PC/mobile widths across nine locales, and ten GUI-latency fixture scenarios. The isolated billing verifier passed both source and built surfaces across three widths and nine locales with no live provider requests; the published free-beta LP has no unactivated prices or checkout links. Historical selectors were updated to the shared More navigation and current localized controls without bypassing validation.
