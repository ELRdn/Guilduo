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
