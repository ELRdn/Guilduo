# Guilduo OpenAI submission runbook

Candidate: **0.6.0-beta.12**. This runbook does not record a completed
submission. See [host guides](guilduo-next-hosts.md) and the final acceptance
record for actual gate results. Existing DSH, OpenCode, OpenClaw and Claude
packages are outside this release.

## Prepare the exact public package

Use the target-specific generator and archiver. Do not invoke the all-host
runner for this release; it would touch unrelated host candidates.

```powershell
npx tsx tools/prepare-guilduo-plugin.mts --submission
node --import tsx --input-type=module -e "const {archiveGuilduoPlugin}=await import('./tools/package-guilduo-plugins.mts');console.log(await archiveGuilduoPlugin('.qa-artifacts/guilduo-submission','openai'));"
```

Freeze the resulting ZIP under a versioned target-specific name. Record
SHA-256, the complete entry list, canonical Skill hashes and exact source Git
blob equality. The public OpenAI archive must have no App references or hook
files in **any member**. The Codex normal and locally generated App companion
archives are distinct even when their version matches. Never upload the
companion, private profiles, credentials, execution logs or reviewer secrets.

The public package references the official `https://mcp.guilduo.com/mcp` and
declares the shared `guilduo-workflows` Skill. Keep compatibility-sensitive
identifiers. Check icon paths, LICENSE, all referenced files, URLs, OAuth
discovery, MCP annotations and current input/output schemas. Reject links and
hardlinks, including package and validation metadata.

## Reuse the correct draft

1. Sign in to [OpenAI Plugins](https://platform.openai.com/plugins) using the
   owning organization/project. Confirm the actual existing draft identifier
   before uploading. An empty list in another organization is not permission
   to create a duplicate.
2. Verify the publisher identity through the standard individual/business
   verification flow. Identity documents remain in that secure flow.
3. Upload only the frozen public ZIP to the intended draft. Record its version,
   hash and real portal identifier separately from publication status.
4. Inspect metadata/Skill findings and connect the declared OAuth MCP. Complete
   the portal's actual domain-verification challenge; do not invent a challenge
   or infer completion from a health response. Resolve scans before submitting.

The current official portal rejects lifecycle hooks and App references in
submission ZIPs. Hosted MCP changes use a fresh scan; Skill or metadata changes
require a new ZIP. See the
[official workflow](https://developers.openai.com/plugins/deploy/submission).

On October 10, 2026, the selected unverified organization's Individual Start
screen required a valid default payment method before verification. Its Billing
screen directed the owner to Billing overview → Add payment details. The owner
is completing this separately; no card details, identity documents or API credits
are supplied by the packaging tools. A payment-method prerequisite is not proof
that a purchase has been authorized or completed. Platform publisher access and
ChatGPT user login are separate sessions; model tests use the existing ChatGPT
subscription, not the Platform billing account.

## Live acceptance and review materials

Run the five positive and three negative cases declared by the manifest in the
complete installed ChatGPT plugin, preserving actual prompts, calls, arguments,
results and confirmations in redacted evidence. Static case descriptions are
expectations, not execution results. Each model case is capped at 120 seconds;
abort failed/timed-out owned execution, without unconditional retry or provider
fallback. Use the existing subscription only.

Use dedicated test Quests and an authorized existing Agent. On shared
connections every call specifies `actingAgentId`. Check public OAuth,
credential reuse in a new host process, refresh, revocation/reconnect, guarded
limited updates/readback, no-op, conflict reread and actual saved Human feedback
before Agent resumption. `update_quest` has no `dryRun`; never use a cached
schema missing its concurrency/identity inputs.

Prepare an independent reviewer account with synthetic sample Quests and no
personal work. Reviewer access must be usable through the portal's required
sign-in method without asking the owner to approve each login. Do not bypass
the product's normal authentication or add an authentication bridge. Enter
reviewer credentials and instructions only into secure Review details. If a
suitable account is unavailable, record that gate as unmet.

Record an actual successful demonstration and provide its reachable URL. A
script, screenshot or invented recording URL does not fulfill the demo gate.
Review legal/privacy attestations with the owner where they require explicit
acceptance; package validation does not authorize fabricated attestations.

## Submit, approve, publish

Submit after all required gates pass. Record **submitted / review pending**
only after the portal confirms submission. Review approval and Publish are
separate actions. Verify the exact directory page and visible listing after
publication. A blocked upload, draft creation, successful scan or GitHub Release
must never be reported as an approved or listed OpenAI plugin.
