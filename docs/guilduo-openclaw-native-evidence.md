# Guilduo OpenClaw native evidence

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
