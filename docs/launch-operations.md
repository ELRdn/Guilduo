# Guilduo launch operations and evidence

> Implementation update, 2026-10-04: the local guard requires schemaVersion 2 and planVersion `2026-10-04`, including all 21 gates from [the launch roadmap](launch-roadmap.md). Legacy manifests are rejected. AD-01/02 advertising requires separate approval. Local implementation does not establish actual gate acceptance.

Updated: 2026-10-06. **Runbook and local guard implementation; live operations are not verified.** Examples below are for an operator after the stated approval. Secrets stay in process environment/private storage; never paste them into evidence or public tickets.

Linked measurement setup and deletion: [measurement contract](launch-measurement.md). Remaining owner actions: [Go package](launch-go-package.md).

## Signed candidate and stages

Use `.qa-artifacts/launch-candidate.json` plus a detached **binary Ed25519** signature at `.qa-artifacts/launch-candidate.json.sig`. The trusted public PEM is the production Environment variable `LAUNCH_APPROVAL_PUBLIC_KEY`; keep its private key off the repository and CI. Required reviewers, protected tags and restricted Environment variable changes are independent controls. Do not trust a public key inside a manifest.

The checker validates records and file hashes. It cannot prove that a human actually performed an operation; the named operator must review the records before signing. Fabricated signed testimony is still false acceptance.

| Command | Required signed records | Meaning |
| --- | --- | --- |
| `node --import tsx tools/verify-launch-gates.mts deploy` | LA-01 plus source/product switches and a deploy-or-later approval | Candidate deployment permitted; not Release or launch completion |
| `node --import tsx tools/verify-launch-gates.mts release` | LA-01–08, LA-11–16 and BM-01–05; approved Live sale and Jev | Final pre-Release approval; LA-08 here means **Go**, not that Release already exists |
| `node --import tsx tools/verify-launch-gates.mts complete` | All 21 gates plus elapsed observation and final operator approval | Launch closure eligible only after actual publication and observation |

Normal CI runs local tests without a manifest. Every public workflow requires the signed artifact, even manual deployments. Missing/stale/failed acceptance refuses final Release. Manual workflows use the same `appwrite-site-production` lock as tagged Release. Nothing in this runbook commits, pushes, tags, deploys, posts, purchases or creates monitors by itself.

Minimal **incomplete template**, deliberately rejected until reviewed records replace the placeholders:

```json
{
  "schemaVersion": 2,
  "planVersion": "2026-10-04",
  "source": {
    "repository": "ELRdn/Guilduo",
    "targetSha": "FULL_40_CHARACTER_COMMIT_SHA",
    "treeSha": "FULL_40_CHARACTER_TREE_SHA",
    "baselineSha": "FULL_40_CHARACTER_CURRENT_PRODUCTION_SOURCE_SHA",
    "dirty": false,
    "apiVersion": "2.7.0",
    "schemaVersion": 7,
    "additiveMigrations": []
  },
  "approval": { "approvedBy": "", "approvedAt": "UTC_ISO_TIMESTAMP", "expiresAt": "UTC_ISO_TIMESTAMP", "scope": "deploy" },
  "unresolvedCritical": 0,
  "billing": { "enabled": false, "mode": "test", "approvedConfig": null },
  "jev": { "enabled": false, "approvedConfig": null },
  "analytics": { "enabled": false, "approvedConfig": null },
  "gates": {
    "LA-01": { "status": "pending", "kind": "source-review", "targetSha": "FULL_40_CHARACTER_COMMIT_SHA", "checkedAt": "UTC_ISO_TIMESTAMP", "verifiedBy": "", "evidence": [] }
  }
}
```

Source identity comes from `git rev-parse HEAD`, `git rev-parse 'HEAD^{tree}'` and the reviewed last-production SHA; a dirty tree cannot become a public candidate. Existing dirty modifications must be preserved and reviewed before later authorized integration. Do not claim today's local HEAD is the final candidate. Historical `dbdb112`/`100f86e` results are not fresh evidence.

Each record requires `status: "passed"`, the same target SHA, a named verifier, UTC `checkedAt` and at least one nonempty evidence file `{ "path": ".qa-artifacts/evidence/record.json", "sha256": "64_lowercase_hex_characters" }`. Paths are relative to repo root, cannot escape through traversal/symlinks, and hashes bind their exact bytes. Record environment, deployment IDs, steps, expected/actual outcomes, limitations and redacted logs/screenshots inside evidence. Evidence must be no older than seven days and precede the signed approval; approval expires within seven days. Fresh checks and a new signature are required after source/config changes or expiry.

| Gate | Required `kind` | Evidence contents |
| --- | --- | --- |
| LA-01 | `source-review` | Source/main/baseline reconciliation, CI URL, schema/contracts, additive migration hashes, canonical platform prerequisites, rollback IDs |
| LA-02 | `real-acceptance` | Real Google/new+existing users, physical PC/Pixel 9 persistence/R2/account isolation/TalkBack |
| LA-03 | `real-acceptance` | Real Chat/Codex/Dots tools and acting identities; unsupported clients remain open |
| LA-04 | `real-acceptance` | Codex/OpenClaw Human request/review/FB/restart/independent completion |
| LA-05 | `real-acceptance` | PC/Pixel 9 20+ samples per operation, p50/p95/failure rate, LCP/INP/CLS and explicit limits |
| LA-06 | `operations-drill` | Verified deletion scope, Appwrite/D1/R2 isolated restore, Site/Worker rollback drill |
| LA-07 | `real-acceptance` | First-use path, www redirect, OG/PWA/GitHub/Plugin, README Documentation gate |
| LA-08 | `release-approval` | Named Go, scope and target, approved sale configuration, no unresolved critical issue; add actual Release/deployment URLs after publication |
| LA-09 | `published-announcement` | Approved account/copy and actual post URL/time after Release |
| LA-10 | `elapsed-observation` | Actual observations, incident/reset record, backlog and final operator approval |
| LA-11 | `audience-and-activation-approval` | Approved target audience, first useful outcome and Activation predicate |
| LA-12 | `measurement-contract-approval` | Approved event dictionary, denominators, mature windows, expected fixture totals |
| LA-13 | `consent-attribution-acceptance` | Consent/refusal/withdrawal, owner isolation, cross-origin attribution, retention/deletion |
| LA-14 | `funnel-reconciliation-acceptance` | Official LP/App/MCP/Stripe ingestion, deduplication, outage reconciliation and reporting |
| LA-15 | `first-use-acceptance` | Actual invited first-use outcome, TTV, assistance/dropout evidence and retention observation start |
| LA-16 | `capacity-and-cost-acceptance` | Abuse/capacity/budget/monitoring/restore evidence and named operational responsibility |
| BM-01 | `product-approval` | Actual official Jev cost/data/model evidence and complete pricing/seller/benefits decision |
| BM-02 | `stripe-test` | Real Stripe Test lifecycle, signature/replay/inversion/parallel and Agent-limit acceptance |
| BM-03 | `jev-cost-and-credit-acceptance` | Real Jev and ledger reconciliation, failed/uncertain processing and <=USD 1 cumulative evaluation |
| BM-04 | `stripe-test` | Actual approved discount/referral tests including zero invoice/self/replay/refund |
| BM-05 | `live-sale-acceptance` | Approved small Live payment/refund, entitlement/ledger/UI and seller disclosures |

`billing.approvedConfig` references the **exact backend BILLING_CONFIG JSON**, hashed as evidence. `jev.approvedConfig` references a JSON object containing exactly the seven `JEV_MODEL`, `JEV_INPUT_USD_PER_MILLION`, `JEV_OUTPUT_USD_PER_MILLION`, `JEV_DATA_POLICY_APPROVED`, `JEV_EVALUATION_BUDGET_USD`, `JEV_BUDGET_SCOPE`, `JEV_COMMERCIAL_CONFIG` string values. Do not put credentials in either. Actual cost evidence and operator decision belong in BM-01/03 evidence. `source.additiveMigrations` contains `{path,sha256}` for every newly added migration between baseline and target. Existing migration modification/removal and destructive SQL require a separately reviewed rollout; this workflow refuses them.

Signing (requires an existing operator-owned Ed25519 key and OpenSSL; this does not generate trust):

```sh
openssl pkeyutl -sign -rawin -inkey "$LAUNCH_APPROVAL_PRIVATE_KEY_FILE" -in .qa-artifacts/launch-candidate.json -out .qa-artifacts/launch-candidate.json.sig
node --import tsx tools/verify-launch-gates.mts deploy
```

`GITHUB_REPOSITORY=ELRdn/Guilduo` and the trusted `LAUNCH_APPROVAL_PUBLIC_KEY` PEM must be present for local checks. Do not supply a fake manifest to make CI green. The authorized evidence-producing Actions run uploads artifact **`launch-candidate-<full SHA>`**, rooted at `.qa-artifacts/` (its extracted files include `launch-candidate.json`, `.sig`, and `evidence/`). Set `LAUNCH_EVIDENCE_RUN_ID` to that successful run ID. `actions/download-artifact` uses that run and exact SHA artifact name, then signature verification establishes operator approval; the uploader is not itself an approver. Ensure the uploaded bundle contains every referenced file and no private backup. This chunk does not create/run an external uploader or claim evidence exists.

## Public Go checklist — exact external prerequisites

**Latest human-assisted Stripe Test run9 passed all14 steps, including monthly/annual Hosted Checkout and confirmed Portal return, without fixture fallback (exit0). Candidate billing remains disabled; product policy and final production Go are unapproved: no Live switch or public sale.** Run9 used348 Test API calls and cleaned its own resources with no errors/warnings. Run1's first own default Test Portal remains active after HTTP400 refused deactivation; its cleanup failure stays open. See [exact evidence and history](launch-readiness.md). Test prices/benefits are not approved commercial terms. JP Test account access does not establish merchant/guardian/Live eligibility; the [official age requirement](https://support.stripe.com/questions/age-requirement-to-create-a-stripe-account) still applies.

Stripe and GitHub Webhooks are separate. Use `STRIPE_SECRET_KEY` for the confirmed `sk_test_…` server API secret. Existing `STRIPE_API_KEY` is a `pk_…` publishable key, unnecessary for this Hosted Checkout redirect; it cannot replace server authentication. `STRIPE_WEBHOOK_SECRET` is the local/endpoint `whsec_…` signature secret configured with verified CLI v1.53.0 in ignored `.dev.vars`. Setup evidence is `.qa-artifacts/stripe/cli/readiness.json`; setup alone does not establish production webhook registration or lifecycle acceptance, which is recorded separately for run9. Values stay out of documentation, browser config and logs. Use selected supported **`2026-08-26.dahlia`** consistently for API/CLI/Webhook evidence; an explicit-version HTTP200 is not proof of the newest release.

1. Review integrated clean target SHA/tree, CI/contracts, baseline and **new additive migrations**; keep rollback Site deployment ID, Worker version ID/config and storage manifest. Review all existing dirty changes before any separately authorized Git operation.
2. Configure required reviewers for `production`, trusted Ed25519 PEM, evidence run ID and protected tags. Restrict who can change trust/evidence/production variables. Confirm all LA-01–07/BM-01–05 actual records before signing scope `release`.
3. Configure `WEB_APP_URL=https://app.guilduo.com`, `PUBLIC_SITE_URL=https://guilduo.com`, `MCP_BASE_URL=https://mcp.guilduo.com`, `APPWRITE_ENDPOINT=https://api.guilduo.com/v1`, existing HTTPS `WORKER_BASE_URL` and regional `APPWRITE_SITE_ENDPOINT`. Appwrite Web Platforms must already contain **both** `app.guilduo.com` and `guilduo.com`; Google OAuth and provider callbacks must be verified before Worker publication. No generated Site URL is substituted for canonical origin.
4. Provision/verify Appwrite project/table/site IDs, D1 database/name, KV namespace, R2 bucket/binding and least-privilege Appwrite/Cloudflare deployment/read secrets. Cloudflare token needs Workers script read+edit and D1 edit for these workflows. Configure DNS/TLS/rewrite and www→apex redirect; keep old domains/routes/assets for rollback.
5. Obtain official TypeSafe Jev account/key, actual available pinned model, official pricing/data handling and cost evidence. Confirm <=USD 1 total evaluation budget. No Luna/OpenRouter key/model is required.
6. Complete merchant/seller/tax/refund decisions and bind reviewed Stripe Test evidence to the fixed candidate. Set approved mode/config, correct Stripe key and webhook signing secret for that mode, admin token and Checkout/Portal/webhook URLs matching the backend's API contract. Approval of Live switch and small actual charge/refund is explicit. Test success does not authorize Live. Before commercial Jev use, approve and implement the operating-budget policy in the [BM-01 decision packet](launch-product-decisions.md); the current shared evaluation ceiling does not establish commercial capacity.
7. Approve target, external action scope, Release text and announcement account/copy. Deploy candidate via **manual Worker then Site** for real acceptance, using deploy-scope signed evidence. After acceptance, sign release-scope evidence and authorize tag/Release; LA-08 is not closed until actual URL/IDs are recorded. No X/email delivery is implied.

## Stripe Test manual Hosted acceptance

Latest run9 evidence is `.qa-artifacts/stripe/acceptance/test-20261003062550961-782f7a58/evidence.json`: **14/14 PASS**, human monthly/annual Hosted payment, Portal `interactiveReturnConfirmed:true`, annual reverse delivery4 events, renewal/failure/cancel/expiry/refund and own-resource cleanup. `hostedAcceptance:true` replaces the earlier fixture-only limitation for this run. The prior run6/7/8 failures and run1 default residual remain in [readiness](launch-readiness.md). Do not infer formal BM closure or Live approval.

For any owner-assisted **Test-only** rerun, use a normal terminal on the owner's visible desktop, outside a sandbox that hides Chrome. Prerequisites are the existing installed Node/tsx, Chrome (or reviewed `QF_CHROME_PATH`), verified `.qa-artifacts/stripe/cli/stripe.exe`, recorded Test prices and server Test key in ignored `.dev.vars`. Never copy credentials into this command or evidence. From repository root:

```sh
node --env-file=.dev.vars --import tsx tools/verify-stripe-test.mts --execute --interactive
```

This starts a **new** isolated Test run; run9 resources were cleaned. Use a visible browser accessible to the owner: run7's sandbox browser was invisible, and run8's Portal DOMContentLoaded wait blocked despite a visible page. The corrected verifier waits for navigation commit, accepted HTTP response and visible body before awaiting human return. Each Hosted Checkout return waits up to ten minutes; use only Stripe Test cards. The helper rejects Live keys. **Do not add `--fixture-subscriptions`** for Hosted acceptance: fallback is opt-in and disabled by default. Without `--execute`, it writes a dry-run record with zero external requests. Interactive acceptance was actually completed in run9; any rerun still needs its own per-step/cleanup evidence. Sandbox-only Node preload, if needed, is not product behavior. This documentation update did not launch the helper. Commercial policy, formal BM gates and production Go remain unapproved.

## Human PC / physical Pixel 9 / real-client checklist

Record source, deployed versions, UTC time, device/browser/network and expected/actual outcomes for every row. Use separate consented test accounts. Never record raw UID/tokens/private task contents.

- New/existing Google login, refresh, logout/relogin on PC and physical Pixel 9; another account cannot see previous data.
- Create/edit/complete/archive on one device, reload and confirm persisted result on the other. Upload/retrieve profile+Agent images through real R2. Exercise conflicting edits, offline draft and reconnect. Check navigation/quiet refresh/pull refresh/Quest sheet with keyboard and physical TalkBack.
- Free: active+disabled registered count2; concurrent third registration rejected, archive frees a slot, reactivation cannot bypass. Pro: register21+, downgrade preserves records/select2, nonselected acting Agent blocked, other shared members work, upgrade resumes.
- Real Chat/Codex/Dots: refresh tools/list, explicit allowed `actingAgentId`, concurrent reads/writes with correct requester, missing/unallowed/disabled identity rejected. Keep an unsupported client unaccepted until product decision changes scope.
- Codex/OpenClaw: request→independent Human review→external inspection→text FB→resume/correct→recheck→independent completion. Verify deferred/no-change/reconnect/duplicate/stale/permission-denied cases.
- PC and Pixel9 cold/warm read/edit/complete/reload persistence **20+ each**: p50/p95, failures, LCP/INP/CLS. Initial budgets: operation+persistence p95 1s, LCP2.5s, INP200ms, CLS0.1. Explicitly accept measured limits; do not claim optimistic UI is durable save.
- Stripe Test and permitted Live small charge/refund, signed webhook, renewal/failure/cancel/expiry/refund/dispute, credit/referral idempotency and reconciliation. Screen widths/local fixture runs are separate evidence.

## Jev settlement recovery — operator only

Use the separate `BILLING_ADMIN_TOKEN` through private environment storage, never command-line arguments, browser settings, MCP or evidence. Set `BILLING_ADMIN_BASE_URL` to the reviewed Worker origin (HTTPS; localhost HTTP is allowed for isolated drills), confirm the intended database and Test/Live mode, and stay within the approved recovery scope. These examples are instructions, not executed recovery or provider acceptance.

1. Inspect `GET /v1/billing/admin/decisions` with operator Bearer authentication. The current-mode report contains at most **100** pending records, `total` and `truncated`; it excludes Quest text, prompts and secrets. UID/request IDs remain private. Save a private report before selecting the exact owner/request pair:

   ```sh
   node --env-file=.dev.vars --import tsx tools/billing-admin.mts --decisions --output .qa-artifacts/jev/decision-reconciliation-before.json
   ```

   `truncated:true` means the inventory is incomplete, not that only 100 requests are held. There is no pagination/filter option for this report; recover eligible records, re-read the report and retain unresolved cases for operator investigation. Do not clear unknown cases to expose later records.
2. For a request with a **persisted `credit_outcome` of `commit` or `return` and verified provider-cost evidence**, review the record and repair the failed local settlement. A commit also requires a persisted confirmed result. Cost evidence here means persisted cost/validated usage or a confirmed no-charge response, not a verified provider invoice. The 2026-10-06 candidate also recovers a verified **unsent** `created` / `reserved` row, or `pending` with `jev_reservation_unknown`: provider evidence/result/usage must be absent, and the same owner/mode/request must have a valid matching reserved/returned Credit record and amount. A compare-and-swap claims the row before returning Credits; a competing sender cannot proceed after the claim. For a `created` / reservation-unknown `pending` row with a held budget, a CAS may instead prove that both the reservation and reserve/commit/return ledger history are absent. It fences the reservation writer in the same D1 batch, records `jev_reservation_not_created`, and releases only the original budget without a Credit return. Missing evidence after reservation, mismatches and `sending` remain held. `POST /v1/billing/admin/decisions/reconcile` accepts only `{ "uid": "<owner-uid>", "requestId": "<request-id>" }`. CLI equivalent:

   ```sh
   node --env-file=.dev.vars --import tsx tools/billing-admin.mts --decisions --uid "<owner-uid>" --request-id "<request-id>" --execute --output .qa-artifacts/jev/decision-reconciliation-after.json
   ```

   Reconciliation completes the stored budget/Credit settlement and terminal status; **it never calls Jev**. Repeated/concurrent recovery of a confirmed settlement must not double-consume or return Credits. Compare the before/after record, reserved/available Credits and budget/ledger entries; retain sanitized evidence of the result. An HTTP/CLI failure is not settlement success.
3. **Unknown provider outcome or missing verified cost: HTTP409 `jev_provider_reconciliation_required`; keep Credit and worst-case budget reservations held.** Do not blindly retry Jev, create a replacement paid request, automatically return Credits or release the budget. Obtain provider confirmation tied to the original request ID and review the local record first. The recovery endpoint is not an arbitrary refund/adjustment facility. Any necessary manual SQL adjustment requires provider confirmation, separately reviewed exact rows/amounts, backup, audit reason and post-adjustment reconciliation; no generic SQL refund is provided here.

Evaluation retains the persistent `jev_budget` row and positive lifetime ceiling of at most USD1. The candidate adds mode-separated commercial periods via `JEV_BUDGET_SCOPE=commercial` and `JEV_COMMERCIAL_CONFIG` (approved, mode, periodStart, periodEnd, limitUsd; ISO UTC milliseconds, at most 32 days). Limits/end dates cannot be repriced, overlapping periods are refused, and unresolved settlement uses its original stored period. Live refuses evaluation scope. New requests must reserve their worst-case cost; exhaustion stops decisions while normal CRUD stays available. Hironao adopted total USD5 for October 6–November 5, 2026 inclusive in Asia/Tokyo: `2026-10-05T15:00:00.000Z` inclusive to `2026-11-05T15:00:00.000Z` exclusive. Assign once to the Live draft; no duplicate Test allocation, automatic renewal or production activation. Responsibility, customer disclosure and real commercial acceptance remain BM-01 decisions. Never raise/reset the evaluation limit or release unknown holds as a recovery workaround.

Existing local evidence: `.qa-artifacts/launch-implementation/jev-reconcile-test.log` reports **20/20 Jev tests PASS**, including database-trigger fault injection, concurrent settlement repair with one provider call, and unknown-outcome holds. The log was inspected for this documentation update; tests were not rerun and this is not real provider/production recovery acceptance.

2026-10-06 candidate verification adds real workerd D1 binding checks for interruption before send, reservation absence/failure, reservation-batch and sender/recovery CAS, repeated recovery and settlement interruption. Unsent recovery returns established Credits once, or proves no reservation/ledger was created and performs no Credit operation, then releases only the original commercial period; unknown sent outcomes remain reserved. These are isolated synthetic checks with zero external provider calls. The current aggregate evidence is in [launch readiness](launch-readiness.md), not the historical 20-test record.

## Account/deletion drill

Accept private requests at the published operator email. Registered-email contact is a hint, **not sufficient identity proof**. Verify current signed-in Appwrite account via an authenticated session and challenge under the operator's control; when access is lost, use documented Appwrite/provider recovery. Never ask for passwords, JWTs or identity documents in public Issues. If identity/scope remains uncertain, stop deletion and escalate privately.

In an isolated, consented fixture: enumerate Appwrite state+legacy ownership, D1 Agents/profiles/connections/social/integration tokens, R2 current+previous avatar keys, OAuth sessions/grants, browser caches and billing/credit records. Map table/column names from the current migrations; never run an unreviewed generic `DELETE WHERE uid` across production. Revoke access first; export requested user data if applicable; produce a signed target inventory and retention exceptions (including required financial records); execute only approved targets in the isolated instance. Verify owner rows/objects are gone, revoked tokens rejected, unrelated sentinel user unchanged, identity deleted last. Record backup expiry and how restore reapplies deletion tombstones. Do not promise immediate erasure of statutory financial records or retained backups. Production deletion requires a fresh scoped approval.

## Backup / isolated restore and rollback drills

`node --import tsx tools/verify-launch-operations.mts` runs a populated SQLite snapshot/restore (all schemas/records, integrity/foreign keys), private state file/local-adapter and R2 fixture byte/metadata round trips, plus optional deletion with a sentinel account and retained financial record. It saves synthetic evidence under `.qa-artifacts/launch-implementation/operations/`, loads no credentials and makes no provider calls. Actual Appwrite permissions, real R2 export, production identity deletion, encryption/custody, deletion tombstones and Site/Worker rollback remain real LA-06/16 gates.

The following commands are runnable **local rehearsals** with installed Node/Wrangler, not evidence that production was backed up or restored. No install, remote mutation or credentials are needed. Run in Bash with project root as cwd; Windows can use the same Node commands in PowerShell. `.qa-artifacts` is private/ignored; do not upload storage backups as Release evidence.

```sh
# Inventory/dry-run build: writes only ignored artifacts, makes no deployment.
set -euo pipefail
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .qa-artifacts/ops-drill/worker
node node_modules/wrangler/bin/wrangler.js d1 migrations list "$D1_DATABASE_NAME" --local
node node_modules/wrangler/bin/wrangler.js d1 export "$D1_DATABASE_NAME" --local --output .qa-artifacts/ops-drill/d1.sql
# Restore into a separate local persistence directory, never --remote.
node node_modules/wrangler/bin/wrangler.js d1 execute "$D1_DATABASE_NAME" --local --persist-to .qa-artifacts/ops-drill/restored-d1 --file .qa-artifacts/ops-drill/d1.sql
node node_modules/wrangler/bin/wrangler.js d1 execute "$D1_DATABASE_NAME" --local --persist-to .qa-artifacts/ops-drill/restored-d1 --command 'PRAGMA integrity_check;'
```

For a populated local D1 baseline, compare table counts/schema and selected fixture records before/after export; `integrity_check` alone does not establish a complete restore. If local D1 is empty, record an empty rehearsal, not success restoring production data. Stop on any command failure. The dry-run Worker build may require a valid generated local configuration and sandbox test preload on this host.

Appwrite/R2 **file restore rehearsal** from an operator-supplied sanitized snapshot (stdlib; reads real input only if explicitly provided):

```sh
node --input-type=module -e 'import fs from "node:fs";import path from "node:path";import crypto from "node:crypto";const base=".qa-artifacts/ops-drill";fs.mkdirSync(base,{recursive:true});const src=process.env.OPS_FIXTURE_DIR;if(!src)throw Error("Provide sanitized Appwrite/R2 snapshot directory");for(const name of ["appwrite.json","r2-manifest.json"]){const bytes=fs.readFileSync(path.join(src,name));JSON.parse(bytes);fs.mkdirSync(`${base}/restored-files`,{recursive:true});fs.writeFileSync(`${base}/restored-files/${name}`,bytes);if(!fs.readFileSync(`${base}/restored-files/${name}`).equals(bytes))throw Error("Restore mismatch");console.log(name,crypto.createHash("sha256").update(bytes).digest("hex"));}'
```

This checks artifact integrity only, **not Appwrite API or R2 object recovery**. Actual LA-06 requires an approved backup window/write quiescence or a documented consistent snapshot strategy:

1. Appwrite: export every TablesDB table schema/index/permissions and **all pages** of rows (`limit` + `cursorAfter`; preserve row IDs/data/permissions). Include account recovery/export policy and the temporarily retained legacy store. Encrypt the snapshot and checksum inventory. Restore into a separately named project/database with matching columns/indexes/row permissions; read back all pages, compare counts/content hashes and verify both owner access and another account's denial with isolated Google/platform config. Never restore production credentials into the test instance.
2. D1: approved read-only `node node_modules/wrangler/bin/wrangler.js d1 export "$D1_DATABASE_NAME" --remote --output "$PRIVATE_BACKUP_DIR/d1.sql"`. Restore **only** to an isolated named database using `d1 execute "$RESTORE_D1_DATABASE_NAME" --remote --file "$PRIVATE_BACKUP_DIR/d1.sql"` after independently checking its account/database ID differs from production. Apply no production migration/restore during a local check. Verify schema, row counts, identities, ledger totals and retention/tombstones.
3. R2: inventory **all paginated keys**, metadata/content-type and D1-referenced current/retained profile+Agent keys with an authorized S3-compatible client. For each approved inventory key, `node node_modules/wrangler/bin/wrangler.js r2 object get "$R2_BUCKET_NAME/$OBJECT_KEY" --remote --file "$PRIVATE_OBJECT_FILE"`; compute SHA256 (ETag is not universally a content hash). Restore via `r2 object put "$RESTORE_R2_BUCKET_NAME/$OBJECT_KEY" --remote --file "$PRIVATE_OBJECT_FILE" --content-type "$OBJECT_CONTENT_TYPE"` only after proving the bucket is isolated. Read objects back/hash and exercise authenticated D1-linked image delivery and denial. Key listing, metadata and relationship recovery are required; copying two JSON files is insufficient.
4. Keep encrypted Appwrite/D1/R2 and schema/config inventories together, retention/access/restore owner and verified timestamp. Reconcile referrals/credits against Stripe and reapply deletion tombstones before reopening a recovered instance. Storage backups contain sensitive data; evidence stores sanitized counts/hashes/results only.

Rollback command **dry-run previews**, printing reviewed targets without issuing a mutation:

```sh
node --input-type=module -e 'const id=process.env.ROLLBACK_WORKER_VERSION_ID;if(!/^[a-f0-9-]{36}$/.test(id||""))throw Error("Set reviewed Worker version ID");console.log("DRY RUN: node node_modules/wrangler/bin/wrangler.js rollback",id);'
node --input-type=module -e 'const {APPWRITE_SITE_ENDPOINT:e,APPWRITE_SITE_ID:s,ROLLBACK_SITE_DEPLOYMENT_ID:d}=process.env;if(!e||!s||!d)throw Error("Set reviewed Site rollback target");if(new URL(e).protocol!=="https:")throw Error("HTTPS required");console.log("DRY RUN: PATCH",`${e.replace(/\/$/,"")}/sites/${encodeURIComponent(s)}/deployment`,JSON.stringify({deploymentId:d}));'
```

For an actual isolated drill, activate the reviewed previous Site deployment with Appwrite `PATCH /sites/{siteId}/deployment` body `{deploymentId}` and run Wrangler `rollback <reviewed-version-id>` against the isolated script/config. First independently prove project/site/script IDs are the isolated targets. Preserve additive D1 migrations; do not reverse them or delete user data. Record old+new deployment IDs and configuration. Rollback Site first when it depends on new Worker behavior, then Worker; verify old/new tabs, auth/REST/MCP and persisted state. Keep current retained-asset archive checks and caching **disabled**; no cache-rule re-enable is part of the launch. A dry-run command being printed is not proof of rollback; production rollback remains separately authorized.

## Real 72-hour observation

After actual approved LA-09 post, record `observation.announcedAt`, `startedAt`, `latestCriticalFixAt` (null only when no critical fix/rollback occurred), `checks` and final operator approval. UTC timestamps use seconds and `Z`. Checks contain `{hour:0|24|48|72, checkedAt, targetSha, status:"passed", evidence:[{path,sha256}]}` in that order; each must occur at or after its real elapsed hour and within two hours of that scheduled checkpoint. This tolerance permits ordinary scheduling; late/missing checks require restarting the observation or an explicit reviewed plan change, not changing clock values.

At every checkpoint verify health, real authentication/persistence, MCP, support inbox and webhook/entitlement/credit consistency; attach actual sanitized records. Confirm no critical incident, assign backlog owners/next actions. `finalApprovedBy` and `finalApprovedAt` follow the 72h check and precede the overall signed approval. A new critical fix or rollback requires reacceptance on the corrected source and `startedAt >= latestCriticalFixAt`; renew all source-bound records. Do not infer 72h from four repeated tests or future timestamps.

Record real Release URL/tag/target SHA and Site/Worker IDs in LA-08 evidence, announcement URL/time in LA-09, incident log in LA-10. Run `complete` only after actual time and final review. Monitoring starts only after authorized publication; notify only meaningful changes/failures/action needed, remain quiet when unchanged. No automation was created by this chunk.


## Historical Stripe hold — superseded for Test work

**Stripe is explicitly pending at hironao's request. Stop additional Stripe implementation/real connection and account/Live setup until resumption after the outing and guardian/Stripe eligibility confirmation.** [Official age requirement](https://support.stripe.com/questions/age-requirement-to-create-a-stripe-account): age 13+, with a legal guardian as account owner when under 18, subject to regional/account conditions. Do not bypass age/identity checks. Keep existing isolated simulated tests; they do not establish real Test/Live acceptance. Stripe Webhooks are distinct from GitHub Webhooks: `sk_test_…` is a Test API key, `whsec_…` verifies Stripe notification signatures. No final production Go has been given.
