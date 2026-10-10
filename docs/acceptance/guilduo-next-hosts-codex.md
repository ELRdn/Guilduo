# Guilduo OpenAI / Codex beta.12 acceptance

Candidate only. No public submission, publication, real OAuth or Human roundtrip
is implied by local checks. Existing ChatGPT subscription only; no billed API or
provider fallback. Parent owns real account authorization and persisted writes.

Public source base: `5e8f66e9214bcf48277b1b46f802f189a90acf04` (`questforge` beta.8).
Selective imported template: beta.11. New candidate: `guilduo-workflows` beta.12.
Keep `plugins/questforge`, template `questforge`, MCP `questforge`, and registered
App IDs. The approved Skill migration uses only `guilduo-workflows` in candidates.
All canonical Skill/reference bytes remain unchanged; Claude is not repackaged.

Codex canonical distribution is a Git marketplace at `.agents/plugins/marketplace.json`
with installable source `plugins/guilduo-workflows`, remote OAuth MCP and hooks.
Marketplace name and compatibility selector remain `guilduo-local` and
`guilduo-workflows@guilduo-local`. Replace the existing local/App companion under
that identity; do not enable a second marketplace copy alongside it.
The registry is OpenAI's shared public ChatGPT/Codex directory, submitted separately
with the generated hooks-free, App-free ZIP. npm is not required.
Existing registered-App companions are local only and bundle no second MCP.
Do not enable the Git package and local/App companion together.

Generator API: `prepareGuilduoPlugin(appId?, root?, {target?, hooks?, submission?})`.
Return value is the output root; installable files are under `plugin/`.
OpenAI public: `{target:'openai', submission:true}`; Codex: `{target:'openai', hooks:true}`.
`appId` is a technical ID, never a token. Public submission rejects it and hooks.
`archiveGuilduoPlugin(outputRoot, target, sourceRoot?)` verifies unchanged staging
before packing; canonical source defaults to this repository, with an explicit
root for fixtures. It supports nested target freeze outputs. Inputs and metadata
must be single-link regular files. Target/connection/submission, actual manifest
and a closed member whitelist must agree. ZIP member names use `/` on Windows.
The package runner builds OpenAI/Codex only, without an all-host loop. Release
assets use target-specific versioned ZIP names for `guilduo-next-hosts-v0.6.0-beta.12`.

Native driver: `tools/verify-guilduo-codex-host.mts`. Default creates an isolated
CODEX_HOME under `.qa-artifacts`, installs/discovers the actual package and tests
fixtures. No auth-store read, credential copy, model request or OAuth initiation.
Parent can prepare an isolated profile through standard native ChatGPT login and
Guilduo OAuth, then use `--profile <absolute-worktree-.qa-artifacts-profile> --live
--acting-agent-id <verified-ID>`. Live mode requires native ChatGPT login status,
fresh native MCP schemas with expectedUpdatedAt/actingAgentId, and performs reads only.
Missing schemas, login, scope or Agent identity fail closed. Cached connectors are
not a substitute. Parent owns write/no-op/conflict and real Human feedback cases.

Receipt contract is documented in the Codex bundle's `hooks/README.md`: native
trust plus explicit bind, exclusive wx keyed only session_id+turn_id, no receipt
deletion on unbind, conservative suppression on unsafe or interrupted events.

Local verification on 2026-10-10: 40 focused tests passed across package, archive,
hooks, review, native-schema guards and beta-release boundaries. Strict node
TypeScript checking (`tsc -p tsconfig.node.json --noEmit`), Vite build,
design check and `git diff --check` passed. Canonical Skill/reference files,
root package/version/lockfile and protected Claude sources are unchanged by this
work. Canonical Codex source is compared byte-for-byte with fresh generation.
Explicit standalone `--strict` checking also passed for all four owned tools and
six related test files, including beta-release, with `types/globals.d.ts` supplied
for the repository's existing global declarations. No unrelated source fix was needed.

Native Codex 0.159.2 evidence:
`.qa-artifacts/guilduo-codex-235c44f7-9c8e-4ff0-9442-a156a74b91b0/evidence.json`.
Isolated native marketplace installation, namespaced Skill discovery
(`guilduo-workflows:guilduo-workflows`), and exactly three native hook definitions
(`sessionStart`, `stop`, `interrupt`) passed. All three are enabled but untrusted,
as required before user review. Installed-script fixtures passed, including
exclusive receipt, duplicate/rebinding and interruption checks. They are synthetic
fixtures, not native trusted execution. Model calls, account writes and initiated
OAuth flows are all zero in this evidence.

The initial native package had both root portable and compatibility manifests;
native hook inventory was empty. Codex's plugin loader skips bundled hooks for
the portable AgentPlugin format. Removing root portable metadata only from local
Codex/App bundles fixed actual discovery. OpenAI public submission retains it.
The isolated `/hooks` TUI attempt reached native ChatGPT sign-in and was stopped
without starting login. Real trusted SessionStart/Stop/Interrupt execution and
actual SessionStart permission_mode remain parent-owned native acceptance gates.
Official hooks documentation defines permission_mode on SessionStart; synthetic
fixtures do not prove a given host supplies it. Missing/unknown mode emits {} and
revokes the applicable binding. User read-only/revocation instructions also remain
authorization constraints; never infer them from transcripts or hook installation.

Current artifacts: `.qa-artifacts/guilduo-plugin-packages.json` records the
OpenAI public ZIP (11 members) and standard Codex ZIP (13 members).
The review bundle is `.qa-artifacts/guilduo-next-hosts-review-beta12-ready/review.json`;
all external review gates remain unverified. Parent's App companion snapshot is
`.qa-artifacts/guilduo-plugin-hooks-app-beta12-final/plugin`, with 13-member ZIP
`guilduo-workflows-codex-app-0.6.0-beta.12.zip` in the snapshot's parent directory.
This technical-ID package contains no credentials and no duplicate MCP.

P2 regressions reject hardlinked generator input, linked validation metadata,
target/version/connection/submission contradictions and extra hash-consistent
members before replacing an archive. A wrong MCP endpoint is now rejected before
repacking. The approved Grok/Muse freeze was rerun after backing up its prior ZIPs
and report to `.qa-artifacts/guilduo-archive-boundary-backup`; both final SHA-256
values remained exactly unchanged. B runtime packages/drivers were not edited.

Live mode requires the chosen Agent in fresh native schemas and verifies returned
`agent.id` matches the requested actingAgentId. It explicitly selects OpenAI
`gpt-6-astra` and asserts the returned provider/model match before using the thread;
the unsupported `allowProviderModelFallback` ThreadStart argument was removed.
It never starts a model turn. Parent's
default-profile native App discovery still returned stale schemas (parent report),
so cached/App discovery is not write acceptance. Parent owns standard remote OAuth,
actual narrow write/readback, no-op/conflict and Human feedback/resume results.
Earlier parent report: two user-approved Codex standard OAuth attempts returned
to a refused 127.0.0.1 loopback connection; Muse standard login exited 1 without
opening its login page. Latest parent report: Codex public OAuth returned
`success: true`; a new native thread discovered 56 direct remote tools with
expectedUpdatedAt/actingAgentId. These are parent-reported results, separate from
this driver's bounded evidence; model/write/Human acceptance remains parent-owned.

Native trust follow-up on 2026-10-10: driver evidence is
`.qa-artifacts/guilduo-codex-a0030e6c-8f42-4ec9-8d5e-41592c947445/evidence.json`.
It reused an existing isolated QA marketplace registration, compared every
installed package member/byte against the frozen Codex source, and passed install,
Skill/three-hook discovery, synthetic fixtures and returned OpenAI/gpt-6-astra
configuration assertions. All three hooks remained enabled/untrusted.
The requested trust UI correctly stopped with
`isolated-ChatGPT-login-required-before-trust-ui`; the dedicated profile was not
logged in. Explicit standalone strict checking and the native-schema guard test
passed after the driver changes. No frozen generator/package source was changed.
The first fresh install attempt returned a native plugin/add failure; a direct
standard-CLI retry in that QA profile succeeded. Its blocked evidence is retained
under `guilduo-codex-c8232a13-6f74-4090-a081-6320029e6dbc`. Reusing a registered QA
profile initially hit duplicate marketplace registration; the driver now reuses
the existing QA catalog and verifies installed bytes instead of replacing it.
No automatic retry or default-profile marketplace change was added.

The real 0.159.2 TUI was inspected separately with the same isolated CODEX_HOME,
`--no-daemon`, hooks/plugins enabled, MCP disabled and no initial prompt. It reached
the ChatGPT/device-code/API-key sign-in selection. It was exited with Ctrl-C before
selecting a login method. No login, OAuth, model turn or persisted hook trust was
initiated. The real `/hooks` browser could not be reached without isolated login.
See `ui-inspection.json` beside the follow-up evidence.

The minimum documented persisted-trust path is: prepare the dedicated QA profile
through standard ChatGPT login, open CLI `/hooks`, review and trust the exact three
plugin definitions, then use a fresh native process to verify `hooks/list`
trustStatus/currentHash. `--trust-ui --profile <prepared-QA-profile>` only opens a
bounded manual UI after the login/byte checks; it never writes trust through RPC
and does not assert any manual UI actions. Keep this separate from binding a real
Quest/Agent. For a suppression check, keep the QA session unbound and MCP disabled.
Do not use the documented one-off `--dangerously-bypass-hook-trust` flag as evidence
of persisted trust acceptance. The user's default profile is never used here.

Official input contracts include permission_mode on SessionStart, and add turn_id
and stop_hook_active on Stop; Interrupt carries turn_id/permission_mode. The actual
0.159.2 `hook/started` and `hook/completed` notification schemas expose run summaries,
not command stdin or those authorization/recursion fields. The driver saves only
bounded notification metadata, never hook output text/transcripts. The model-free
thread/start produced no hook notifications, so actual stdin fields and native
suppression are unverified; absence of notifications is not proof of suppression.
Stop needs a completed real turn, and Interrupt needs an active main-thread turn.
Without an isolated ChatGPT login, these events and trusted SessionStart execution
remain unrun. Synthetic missing-field/recursion fixtures remain separate evidence.

Parent
reports portal login works but only Default project/no drafts are visible, and
`/.well-known/openai-apps-challenge` returns 401. No submission or pending review
is claimed. Reviewer account, domain verification, demo and publication remain
separate parent-owned gates. Source PR precedes a separate Docs PR pinned to its
merged public SHA; no commit, push or publication is performed by this work.

Official sources: https://developers.openai.com/plugins/build/plugins,
https://developers.openai.com/plugins/deploy/submission,
https://learn.chatgpt.com/docs/hooks.

Files created or changed by this bounded OpenAI/Codex work (excludes parent/B work and ignored QA artifacts):

- `.agents/plugins/marketplace.json`
- `docs/acceptance/guilduo-next-hosts-codex.md`
- `plugins/guilduo-workflows/.codex-plugin/plugin.json`
- `plugins/guilduo-workflows/.mcp.json`
- `plugins/guilduo-workflows/assets/guilduo-icon.png`
- `plugins/guilduo-workflows/hooks/hooks.json`
- `plugins/guilduo-workflows/hooks/lifecycle.mjs`
- `plugins/guilduo-workflows/hooks/README.md`
- `plugins/guilduo-workflows/LICENSE`
- `plugins/guilduo-workflows/README.md`
- `plugins/guilduo-workflows/skills/guilduo-workflows/agents/openai.yaml`
- `plugins/guilduo-workflows/skills/guilduo-workflows/references/local-hooks.md`
- `plugins/guilduo-workflows/skills/guilduo-workflows/references/phase-sync.md`
- `plugins/guilduo-workflows/skills/guilduo-workflows/references/tools.md`
- `plugins/guilduo-workflows/skills/guilduo-workflows/SKILL.md`
- `plugins/questforge/.codex-plugin/plugin.json`
- `plugins/questforge/assets/guilduo-icon.png`
- `plugins/questforge/hooks/hooks.json`
- `plugins/questforge/hooks/legacy-README.md`
- `plugins/questforge/hooks/lifecycle.mjs`
- `plugins/questforge/hooks/README.md`
- `plugins/questforge/LICENSE`
- `plugins/questforge/openai-submission.json`
- `plugins/questforge/README.md`
- `tests/beta-release.test.ts`
- `tests/guilduo-codex-host.test.ts`
- `tests/plugin-archives.test.ts`
- `tests/plugin-hooks.test.ts`
- `tests/plugin-package.test.ts`
- `tests/plugin-review.test.ts`
- `tools/package-guilduo-plugins.mts`
- `tools/prepare-guilduo-plugin.mts`
- `tools/prepare-guilduo-review.mts`
- `tools/verify-guilduo-codex-host.mts`

The repository ignores .agents/ by default; publishing the approved catalog requires the parent to include .agents/plugins/marketplace.json explicitly. This work does not stage or change Git state.
