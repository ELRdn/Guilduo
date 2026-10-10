# Guilduo OpenClaw native evidence

## Beta.16 verification — 2026-10-10

Current candidate: `@guilduo/openclaw-plugin@0.6.0-beta.16`. Publication and public-service acceptance are maintained separately in [release status](guilduo-host-extensions-status.md). The beta.14 section below is historical and does not describe the current archive.

This candidate retains the minimal `definePluginEntry` registration, host-owned OAuth/MCP and canonical `guilduo-workflows` Skill. No new lifecycle hook, custom UI, Agent registration, token bridge or dummy runtime tool is added. The staged Skill, references, agents metadata and LICENSE come byte-for-byte from this shared worktree's canonical files; canonical line endings are not changed. Staging checks every existing destination ancestor before `mkdir` and rejects junctions/symlinks, non-directories and hard-linked output files.

The actual Windows host was verified as OpenClaw **2026.9.9**, commit **`bcfc88812a35243893585dbeca87ca41b48272ca`**, built `2026-10-08T06:26:41.967Z`, with Node `v26.5.1`. Exact `pluginApi`, build and optional peer metadata remain pinned to 2026.9.9. This is a tested compatibility pin, not a promise of compatibility with future versions. The parent separately reported live npm latest as 2026.9.9 and ClawHub latest as 0.23.3; that registry research is not repeated here.

### Artifact and executed checks

Final archive: `plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.16.tgz`.

Final SHA-256: `46c3fb454ac179807148c090f9730f8a2f77576f9fdbd8d20d4584508eaea678`.

The full suite used immutable `runtime-tested-beta16-9798f06b.tgz`, SHA-256 `9798f06b1c549b03a79c7de31bf09dd2a7d66878224382573a8ad4ad1b51fec1`. Final comparison separately records README content differences (explicit owner-authorized existing-Agent linking) and formatting-only `stage.mjs` differences (CRLF to LF and terminal newline cleanup). Raw helper bytes are not claimed identical to the full-suite archive. All other packaged files match that archive. All 16 final archive files match both current source bytes and staged Git blobs byte-for-byte. A fresh-home final smoke passed installation, SDK/runtime load, canonical Skill discovery and removal. The previous `2112722a...` archive and `final-w0I9wd` receipt are superseded historical checks before the parent's whitespace normalization.

The 16-file whitelist contains compiled/source entry, package/native manifests, README pair, LICENSE/NOTICE, setup/stage/build helpers and canonical Skill files. QA scripts, profiles, screenshots, credentials, caches and tests are excluded. Packaged READMEs describe version/features/requirements and link to release status, avoiding publication-state claims that could become stale after publication. Public workflow links use the canonical Guilduo Docs URLs.

```powershell
npm --prefix plugins/guilduo-openclaw run pack:plugin
npm --prefix plugins/guilduo-openclaw test
node plugins/guilduo-openclaw/tests/native-host.mjs plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.16.tgz C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.15.tgz
node plugins/guilduo-openclaw/tests/native-refresh.mjs C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs
node plugins/guilduo-openclaw/tests/final-archive.mjs plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.16.tgz C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs plugins/guilduo-openclaw/.qa-artifacts/native-fUFJ52/evidence.json plugins/guilduo-openclaw/.qa-artifacts/runtime-tested-beta16-9798f06b.tgz --git-index
```

| Current check | Verified result and limit |
| --- | --- |
| Package tests | **9/9 passed**, including destination-junction refusal before creating an external child and hardlink-owner preservation. |
| Build/pack/SDK | Build and pack passed; archive bytes match staged source and the actual installed SDK. Registration adds no tools/hooks/routes. |
| Native installation and discovery | Real archive installation, runtime load, `guilduo-workflows` discovery and absence of the legacy Skill passed in isolated Windows profiles. |
| Upgrade | Real immutable beta.15 archive → exact beta.16 archive, reinstallation and native removal passed; explicit MCP config and unrelated settings were preserved. This is a local tgz upgrade, not a public registry update. |
| Synthetic native OAuth | Real native CLI, dynamic registration, callback, wrong-state rejection, S256 PKCE, saved authorization, later-process probe, alias/conflict preservation and logout passed. Full suite records 31 subprocess checks, including expected rejection cases. |
| Refresh and rotation | Separate fresh profile, expired access tokens, refresh rotation and later-process reuse of the saved rotated refresh token passed. The receipt records eight distinct consumed refresh tokens and five CLI commands. No concurrent refresh or public-service rotation is inferred. |

Receipts excluded from publication:

- Native suite: `plugins/guilduo-openclaw/.qa-artifacts/native-fUFJ52/evidence.json`.
- Refresh: `plugins/guilduo-openclaw/.qa-artifacts/refresh-H1FmMV/receipt.json`.
- Final archive comparison, all 16 staged Git blobs and five-command native smoke: `plugins/guilduo-openclaw/.qa-artifacts/final-cRJ8ho/receipt.json`.

### ClawHub listing gate

ClawHub **0.23.3** was installed with `--ignore-scripts --no-package-lock --no-audit --no-fund` into this package's QA workspace. The global 0.8.0 installation was not upgraded. Verified CLI path: `plugins/guilduo-openclaw/.qa-artifacts/clawhub-0.23.3-aVZHpp/cli/node_modules/clawhub/bin/clawdhub.js`; `--cli-version` reports 0.23.3. Its real `package validate` static check passed with zero breakages and warnings against 2026.9.9. Native acceptance above uses the actual host, rather than counting a mocked SDK import as runtime acceptance.

```powershell
node <isolated-clawdhub.js> package validate <package-folder> --openclaw-version 2026.9.9 --json
node <isolated-clawdhub.js> package publish <beta.16.tgz> --family code-plugin --owner guilduo --dry-run
```

The publish dry-run exited **1**: `--source-repo and --source-commit required for code plugins`. It is pending actual reviewed candidate source attribution and scoped `guilduo` publisher authorization, owned by the parent. The old checkout/base or CLI build commit is not substituted for the uncommitted candidate's source commit. No publication occurred in this work. Isolated validator/dry-run receipt: `plugins/guilduo-openclaw/.qa-artifacts/clawhub-0.23.3-aVZHpp/receipt.json`; corrected CLI-version receipt: its `version.json`.

The exact final tgz was extracted into a fresh isolated folder and validated again with `--openclaw-version 2026.9.9`: **exit 0, zero breakages, warnings, deprecations and issues**. The receipt records the final archive hash: `plugins/guilduo-openclaw/.qa-artifacts/clawhub-final-9S1EMa/receipt.json`. Generated inspector reports remain QA artifacts and are excluded by the archive whitelist and package ignore rules.

### Public acceptance handoff and native execution

The parent owns the separate `public-beta16-ZHrY9J` QA profile and reported successful public `mcp login guilduo` credential save, followed by a CLI cleanup timeout. This worker has not inspected/exported credentials or independently verified public tool execution. The parent performs public probe, dedicated Quest/Human acceptance, provider credential setup and any publication. This worker must not logout or mutate that profile. Synthetic browser QA uses a separate profile and Gateway callback origin, avoiding the public CLI callback port 8989.

The pinned host documents [`POST /tools/invoke`](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/docs/gateway/tools-invoke-http-api.md) for individual tools without a model turn. Its existence alone does not verify configured external MCP projection: the HTTP resolver assembles core/registered-plugin tools, while configured MCP materialization belongs to the Agent runtime. `dryRun` on this endpoint is currently ignored. The exported `openclaw/plugin-sdk/codex-mcp-projection` helper `materializeStaticMcpToolsForHarnessRun` returns `{tools, dispose}` and uses host-saved OAuth; it is a Codex-harness SDK, not a generic operator `host-runtime` API. A standalone call initially failed because no session MCP scheduler was bound. QA adapter `tests/native-invoke.mjs` now binds the actual native `GatewayScheduler` through `setSessionMcpRuntimeScheduler`, then disposes all session MCP runtimes and stops the scheduler. Those two named exports come from shipped `dist/infra/gateway-scheduler.js` and `dist/agents/agent-bundle-mcp-manager-api.js`: **pinned internals, not stable package-exported APIs**. No custom token store, transport or scheduler is substituted. The adapter accepts only an isolated package QA profile and the exact caller-authorized `guilduo__...` tool/arguments on stdin and performs no inference. The parent reported successful public `get_agent_link` through this native projection after the fix; other public acceptance is recorded by the parent.

The bundled [OpenCode Go provider](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/docs/providers/opencode-go.md) documents shared `OPENCODE_API_KEY` / `OPENCODE_ZEN_API_KEY` infrastructure, matching the installed provider manifest and entry. The actual installed `@openclaw/ai` env-key resolver maps `opencode-go` to `OPENCODE_API_KEY`. `OPENCODE_GO_API_KEY` also appears in host source, but the inspected occurrences are Hermes import compatibility mappings, not this bundled provider's declared native env keys. The parent owns the selected Go key and ephemeral native env setup; no credential is inspected or exported by this worker. Native `models auth paste-api-key --provider opencode-go` or `models auth login --provider opencode-go --method api-key` without `--set-default` are CLI alternatives. `models list --refresh --provider opencode-go` checks discovery without applying another recommended default. Explicit manual resume uses the existing session with `agent --session-key <same-session> --model opencode-go/deepseek-v4.1-flash --message-file <authorized-resume-file> --thinking off --json`; the normal Agent entry's explicit model override disables configured fallbacks. Without a running Gateway, `--local` is available but requires exclusive profile-state ownership. SDK-only tool calls do not create an LLM conversation transcript; a first native Agent turn reading a saved Human answer must be distinguished from resuming an earlier model session. No automatic plugin inference is added. The fresh profile's offline catalog did not resolve that exact model. Catalog refresh/entitlement and real model acceptance remain separate parent gates; no substitute model is allowed.

Live official documentation pages were reachable on 2026-10-10: [Tools invoke API](https://docs.openclaw.ai/gateway/tools-invoke-http-api), [OpenCode Go](https://docs.openclaw.ai/providers/opencode-go) and [MCP Control UI](https://docs.openclaw.ai/cli/mcp/control-ui), all HTTP 200 with matching page titles. Receipt: `plugins/guilduo-openclaw/.qa-artifacts/docs-current-O3PRN0/receipt.json`. These mutable current pages are separate evidence from the fixed build/source contract above.

### Real browser Accounts/Settings acceptance

```powershell
node plugins/guilduo-openclaw/tests/native-ui.mjs C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs
```

**Passed** with real installed Chrome, Control UI and a fresh isolated Gateway: Accounts rendering, Connect click, native HTTPS browser OAuth callback and S256 PKCE, Connected status, Edit navigation to `/settings/mcp`, native CLI probe, stored-OAuth tool execution through the native harness SDK adapter, and logout. The direct HTTP `/tools/invoke` call for the configured synthetic external MCP tool returned **404**; it is recorded as an unavailable direct route, not successful MCP execution. Receipt: `plugins/guilduo-openclaw/.qa-artifacts/browser-77x7xL/receipt.json`; before/connected/Settings screenshots remain in that private QA folder.

Only the isolated installed manifest/config points to the synthetic fixture; the shipped manifest retains the official endpoint. The fixture's ephemeral TLS private key stays in memory; only its public certificate is written. Browser HTTP access is restricted to loopback. The native Ask sidebar reports that the credential-free offline profile cannot resolve the exact Go model; this does not prevent Accounts OAuth and is not counted as model acceptance. No inference completion, performance measurement or benchmark was run. Public OAuth/Quest/Human acceptance belongs to the parent, independently of this successful synthetic browser flow. No public OAuth credential, fixture identifier or private key enters this document or package.

The parent subsequently reported successful public linking of an existing permitted Registry Agent, Human request creation, saved Web answer retrieval, and an explicitly authorized native embedded Agent turn using only `opencode-go/deepseek-v4.1-flash`, with no fallback and a narrow update/readback. The parent supplied the selected key through an ephemeral env reference in native provider config. This is parent-reported public evidence, not an independent rerun by this worker; no model request was repeated. SDK-only calls preceding the saved answer do not establish an earlier model conversation session.

### Public refresh, revocation and reconnect handoff

Read-only inspection of the pinned installed host confirms no force-refresh CLI: `dist/mcp-cli-qf1WNGc9.mjs:419` exposes non-connecting `mcp status --json`, `:450` exposes `mcp probe [name] --json`, and `:670` exposes `mcp login <name> --code`. `dist/mcp-oauth-store-BdQs9xoR.mjs:12` projects the nonsecret `authStatus.expiresAt`. `dist/mcp-oauth-BxoraIn0.mjs:221,240,268` refreshes under the native SQLite lease when expiry is within 30 seconds or the current token is rejected. An already-fresh repeated login returns authorized (`:414`), so it is not a force-refresh test.

Supported natural-expiry route, run only by the parent through its existing isolated profile runner:

```powershell
node <public-profile>/invoke-openclaw.mjs mcp status --json
# At authStatus.expiresAt minus 30 seconds or later:
node <public-profile>/invoke-openclaw.mjs mcp probe guilduo --json
node <public-profile>/invoke-openclaw.mjs mcp status --json
```

A fresh authorized probe alone is not evidence of refresh. Preserve nonsecret before/after expiry and probe outcome, with server-side refresh success evidence if available. The synthetic one-second fixture receipt is separate from actual public-service refresh.

No native mutation for expiry alone was found. QA-only `tests/native-expiry-qa.mjs` provides an optional local expiry injection for the parent after stopping all Gateway/Agent/CLI processes using that profile. It uses the pinned native identity function for the exact official `guilduo` operator row and an SQL transaction setting only `json_set(store_json, '$.tokenExpiresAt', 1)`. It returns only the scalar expiry; tokens/client secrets never leave SQLite and no request is made. Only existing unlinked databases under this package's isolated QA directory are accepted. Unknown format, non-JSON/encrypted/opaque payload, absent row, missing refresh token or an outstanding authorization challenge fails closed. The pinned store source uses JSON (`dist/mcp-oauth-store.kernel-DW1prAMB.mjs:35,66`); public storage encryption was not independently verified and no decryption/export is attempted. This bypasses the native lease and is **QA-injected local expiry**, not a supported CLI or natural-expiry acceptance.

```powershell
# Self-test uses only a synthetic in-memory SQLite database; passed.
node plugins/guilduo-openclaw/tests/native-expiry-qa.mjs --self-test
# Optional parent-owned operation; NOT executed by this worker:
node plugins/guilduo-openclaw/tests/native-expiry-qa.mjs <public-profile> C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs --apply-only-expiry --profile-stopped
# Then invoke normal native probe/status with the same isolated profile runner.
```

Native `mcp logout guilduo` clears the local session only (`dist/mcp-cli-qf1WNGc9.mjs:720`, `dist/mcp-oauth-BxoraIn0.mjs:333`); it does not call public token revocation. Actual public revocation requires the parent/user to revoke the Guilduo connection server-side and verify that native use of the saved credentials is rejected. Reconnect then uses normal native `mcp logout guilduo`, `mcp login guilduo` with explicit browser consent, and `mcp probe guilduo --json`. This worker has performed no public-profile mutation, refresh, revocation or reconnect.

Still outside this worker's independently verified scope: public-service refresh/revocation/reconnect, manual-code OAuth fallback, concurrent refresh, public npm/ClawHub installation/update, Linux/macOS, multi-person channel authorization and public native model acceptance. The parent owns the public acceptance record and source attribution needed to complete listing.

## Historical beta.14 evidence — 2026-10-09

The following original record is preserved as history. Its publication state, legacy Skill name, receipts and unverified list refer to beta.14 at that time.

2026-10-10 migration note: this document preserves beta.14's historical old-name
`questforge-workflows` archive and native discovery evidence. The next beta.15 candidate
uses `guilduo-workflows` and is unpublished; the results below do not verify that rename
or close pending beta.14 acceptance. See the [migration contract](guilduo-workflows-migration.md).

Date: 2026-10-09. Candidate: `@guilduo/openclaw-plugin@0.6.0-beta.14`, AGPL-3.0-only. **Not published.** English installation guide: [README](../plugins/guilduo-openclaw/README.md); [日本語](../plugins/guilduo-openclaw/README.jp.md).

## Contract and scope

Installed public host: OpenClaw `2026.9.9`, `dist/build-info.json` commit **`bcfc88812a35243893585dbeca87ca41b48272ca`**, built `2026-10-08T06:26:41.967Z`. Node used: `v26.5.1`. Candidate engines exactly match the host: `>=24.16.0 <25 || >=26.1.0`.

Audited official files at that commit:

| Source | Applied contract |
| --- | --- |
| [plugin-entry.ts](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/plugin-sdk/plugin-entry.ts) and installed package exports | `definePluginEntry` from `openclaw/plugin-sdk/plugin-entry`; a no-op registration with host-owned MCP and Skill discovery. No tools, hooks, bridge, auth implementation or custom UI. |
| [plugin package contract](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/packages/plugin-package-contract/src/index.ts) | Required: `openclaw.compat.pluginApi`, `openclaw.build.openclawVersion`. The candidate pins both to `2026.9.9`, declares optional `compat.minGatewayVersion: "2026.9.9"`, and uses `openclaw.extensions: ["./lib/index.js"]`. `pluginSdkVersion` is optional; no separate SDK package is built into this candidate. |
| [manifest.ts](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/plugins/manifest.ts) and [normalizers](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/plugins/manifest-capability-normalizers.ts) | Root `openclaw.plugin.json` has id, configSchema, skills and named mcpServers. Compatibility ID `questforge-workflows` is retained. |
| [MCP schema](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/config/zod-schema.mcp-server.ts) and [CLI](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/cli/mcp-cli.ts) | `transport: "streamable-http"`, `auth: "oauth"`. Native `mcp add` uses create-only insertion. Helper does not replace config or request tokens; malformed JSON produces a fixed error with no native output echoed. |
| [Accounts auth projection](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/plugins/mcp-auth-status.ts), [MCP UI docs](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/docs/cli/mcp/control-ui.md), [UI sign-in controller](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/ui/src/pages/plugins/plugin-mcp-login-controller.ts) | Accounts requires a matching active declaration **name and URL** and configured shared operator OAuth. Settings → MCP → Sign in and installed plugin Accounts → Connect use native `mcp.authLogin`; saved status controls Connected/Edit. A manifest alone does not add saved `mcp.servers`. |

The helper preserves an existing official-endpoint alias, occupied `guilduo`, disabled entries, filters, timeouts, requester mode and auth-profile settings. An alternate alias uses Settings/CLI; Accounts requires the exact declaration name. The helper's cross-alias check and insertion are not one transaction; setup documentation asks operators to stop concurrent config writers. Native create-only insertion still rejects an occupied target name.

This candidate covers personal/administrator instances with **shared operator OAuth**. Accounts does not prove distinct-user/requester authorization. OpenClaw channel permissions remain authoritative; no plugin-specific requester policy is added. Multi-person channel acceptance is untested.

## Executed checks

```powershell
npm --prefix plugins/guilduo-openclaw run pack:plugin
npm --prefix plugins/guilduo-openclaw test
node plugins/guilduo-openclaw/tests/native-host.mjs plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.14.tgz C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs
```

The native runner allowlists environment variables, redirects all home/state/config/temp/npm/Git paths into `plugins/guilduo-openclaw/.qa-artifacts/native-*/`, and invokes the actual installed CLI. No real OpenClaw user configuration, credentials, history, provider setup or model request is accessed. Local archive trust is acknowledged with `--force` only for the audited QA artifact; this is not ClawHub trust/publication acceptance.

| Check | Evidence and boundary |
| --- | --- |
| Package unit suite | **7/7 passed** using native Node TypeScript tests; root `tsx` is unnecessary. Canonical Skill, references, agents metadata and root LICENSE match byte-for-byte. Alias/config preservation and malformed fake Authorization output are covered. |
| Package/SDK/archive | Exact whitelist; compiled JS, source, native manifest, README pair, LICENSE/NOTICE, helper and canonical Skill included. Tests, QA homes, SQLite, npm caches, node_modules and lockfiles excluded. Actual installed SDK import and no-op registration verified. Host/Node ranges checked; 2026.9.8 and 2026.9.10 are outside the pinned pluginApi window. |
| Native install/load/discovery | Actual archive install succeeds; `plugins inspect guilduo --runtime --json` reports `loaded`, `imported: true`, empty diagnostics, no added HTTP routes/tools/hooks. Native `skills list --json` discovers `questforge-workflows`. Manifest alone leaves the saved MCP config absent. |
| Native setup | Both explicit host-path and normal `node setup.mjs` PATH invocation work in isolated Windows homes. Unrelated disabled server preserved; repeated setup unchanged. |
| Reinstall and update | Unconfirmed local installation is refused; reviewed `plugins install <tgz> --force` reinstalls. An isolated synthetic prior archive version `0.6.0-beta.13.qa` is installed, then actually replaced with the exact beta.14 archive; full MCP config is preserved. This prior fixture is not a historical published Guilduo release. `plugins update guilduo --dry-run` records the local-source behavior; it is not a registry upgrade test. |
| Synthetic native OAuth | Loopback OAuth/MCP fixture, real native `mcp login`, dynamic registration, browser-URL callback, wrong-state 400 rejection, S256 PKCE verification, host SQLite persistence visible in later CLI processes, authorized `mcp status`, actual `mcp doctor --probe` initialization/tool discovery, logout and unauthenticated status. No public Guilduo credential or mutation. |
| Native refresh/rotation | Separate fresh QA home; fixture issues 1-second access tokens. Two real `mcp probe guilduo --json` calls from fresh CLI processes refresh expired credentials, use the new access tokens, and consume the previously stored rotated refresh token on the next refresh. Fixture refuses stale refresh tokens; no consumed refresh token is reused. Logout/status then confirms unauthenticated. No concurrency, provider outage or public-server rotation acceptance is inferred. |
| Native Accounts carrier | Installed `inspectManagedPlugin` status projection exercised with unauthenticated and authorized OAuth states. Only the isolated installed QA copy changes its manifest URL to the loopback fixture; the shipped manifest retains the official URL. Public fetch is blocked in this carrier process. Rendering, click handling and a deployed Gateway were not tested. |
| Preservation/removal | Existing alias remains untouched; occupied `guilduo` refuses setup. Real `plugins uninstall guilduo --force` removes extension files while preserving explicit MCP entries and unrelated config. Native logout/unset are separate, documented steps. |

### Authoring validator: unsupported for this entry shape

Actual command: `openclaw plugins validate --root plugins/guilduo-openclaw --json` exits **1** with:

```text
plugin entry does not expose tool or feature authoring metadata: ./lib/index.js
```

This result is **not counted as a passed validator**. [Official authoring source](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/cli/plugins-authoring-command.ts) calls `loadToolPlugin()` and requires `getToolPluginMetadata(entry)` before checking a manifest generated by `buildToolPluginManifest()` with `contracts.tools`. [The official authoring workflow](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/docs/cli/plugins/authoring.md) explains that tool/feature scaffolds use these metadata helpers. A `definePluginEntry` Skill/MCP declaration does not expose that authoring metadata. Provider scaffolds also use a different publication validator (`clawhub package validate`). No dummy tools or custom feature UI are added to satisfy an inapplicable authoring workflow.

Actual package/manifest admission, runtime SDK loading, Skill discovery, native CLI setup, synthetic OAuth and removal are the applicable local gates above. ClawHub/package publication validation and publication were not performed.

## Artifact and receipt

Candidate archive: `plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.14.tgz`. Final archive SHA-256 and exact file whitelist are recorded in the final isolated `receipt.json`; native suite command results are retained in `native-*/evidence.json` and its `logs/`.

Documentation-only changes after the full native suite are checked with:

```powershell
node plugins/guilduo-openclaw/tests/final-archive.mjs <final.tgz> <installed-openclaw.mjs> <native-evidence.json> <immutable-runtime-tested.tgz>
```

That check requires the immutable archive to match the completed native receipt, permits differences only in the README pair, checks all final tarball bytes against staged source and the installed SDK, and repeats real install/runtime/Skill/removal in a fresh QA home. **Passed.** The full suite ran 29 recorded subprocess checks; final archive verification ran 5; the separate refresh check ran 5.

Final archive SHA-256:

```text
8a351ffbada8bf7d31a3d28e62999754616dcf8b96802dd44670c437fd0c949c
```

Local QA receipts (excluded from publication):

- Full native suite: `plugins/guilduo-openclaw/.qa-artifacts/native-26NcX0/evidence.json`.
- Final 16-file archive and fresh-home native smoke: `plugins/guilduo-openclaw/.qa-artifacts/final-1be7n2/receipt.json`.
- Refresh/rotation: `plugins/guilduo-openclaw/.qa-artifacts/refresh-lB7sUk/receipt.json`.
- Immutable archive used by the full suite: `plugins/guilduo-openclaw/.qa-artifacts/runtime-tested-beta14.tgz`, SHA-256 `d784c1d3a5f0420515ed14a0ea926a0db803b099033f73ca0d8fdaf9b7712cd2`. Only the README pair differs from the final archive; runtime/manifest/helper/Skill/license bytes are identical.

Executed rotation command:

```powershell
node plugins/guilduo-openclaw/tests/native-refresh.mjs C:/Users/hiron/AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs
```

Changed files are confined to `plugins/guilduo-openclaw/**`, `tests/plugin-openclaw.test.ts` and this document. The package contains `package.json`, `openclaw.plugin.json`, `src/index.ts`, generated `lib/index.js`, `build.mjs`, `stage.mjs`, `setup.mjs`, `README.md`, `README.jp.md`, `LICENSE`, `NOTICE`, `skills/questforge-workflows/SKILL.md`, `agents/openai.yaml` and three canonical reference Markdown files. QA-only scripts reside in `plugins/guilduo-openclaw/tests/` and are excluded from the archive.

Unverified: real Settings/Accounts browser operation, public Guilduo OAuth/refresh, manual-code fallback, concurrent refresh/revocation, public npm/ClawHub installation or update, Linux/macOS execution, real Quest write/read-back, Human request → Web answer → Agent resumption, and multi-person channel authorization. No publish, deployment, root dependency/lockfile edit or Git state change was performed.
