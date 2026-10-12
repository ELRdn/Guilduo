# OpenCode native contract and acceptance evidence

2026-10-10 migration note: beta.14 and earlier archives and old-name `questforge-workflows`
native discovery records below are history. The next beta.15 candidate uses `guilduo-workflows`
and is unpublished; no result below verifies the rename or closes pending beta.14 acceptance.
See the [migration contract](guilduo-workflows-migration.md).

Contract checked on 2026-10-09. Historical unpublished candidate: `@guilduo/opencode-plugin@0.6.0-beta.14`. npm publication and release decisions belong to the parent. The beta.11 acceptance below is historical; its archive remains immutable.

## beta.14 UX fixes and fresh native evidence

Actual extension sources, installed SDK declarations and pinned official host sources were audited before editing. `PROJECT_SPEC.md`, `docs/public-urls.md` and `DESIGN.md` were read. No web UI, root dependencies/lockfile, shared Skill source, OAuth bridge or installer abstraction was added or changed.

- Official-endpoint MCP aliases now determine config/build permission fences, per-message `update_quest` disables and live session permission fences. Names follow native [McpCatalog sanitization](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/mcp/catalog.ts): non-ASCII-alphanumeric/underscore/hyphen characters become underscores. An unrelated endpoint occupying `guilduo` no longer supplies the official alias's fence. The host's full permission resolver remains authoritative; this plugin only checks the common deny fences before starting a reminder.
- `/guilduo-sync-off` and its command hook are registered only with an explicit binding. Interception requires the exact bound session and the plugin's own command object, including checking ownership after another config hook replaces the command/map. Existing user commands are preserved.
- English/Japanese command text and READMEs explain that sync-off clears the reminder binding, while the host still submits the custom command's prompt. It neither aborts inference nor guarantees a cost-free stop. Persistent opt-out uses config edit plus full restart; current inference uses native interrupt/abort.
- Both READMEs provide native config/CLI instructions for install, version check, update, rollback, uninstall and logout. `opencode --version` is the host version; the installed package manifest is the extension version. `opencode debug skill` is the supported CLI Skill listing ([pinned source](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/cli/cmd/debug/skill.ts)). No unsupported plugin TUI/settings panel or plugin-manager CLI is offered. Rollback to beta.11 requires disabling `phaseSync` because it predates these fixes.
- The install/update/rollback/uninstall prefix is dedicated `.opencode/guilduo`, with a generated absolute native file URL and an archive-path placeholder. No machine-specific checkout path is required. A reviewer reproduced npm Arborist pruning unrelated unsaved packages with the previous shared `.opencode` prefix. That shared-prefix recipe was removed in both languages. Legacy shared installs migrate by adding the dedicated install and changing the loader URL; uninstall removes the old loader but leaves the dormant shared package untouched. No npm operation targets shared `.opencode`.
- Build/package outputs and native test state now stay inside `plugins/guilduo-opencode/artifacts/`, respecting this task's ownership. Pack allowlisting excludes test fixtures and artifacts.

Fresh checks passed: plugin unit tests **11/11** (one alias regression test and one command ownership regression test added), package/canonical Skill tests **2/2**, plugin `test:types`, TypeScript build and local npm pack. Source changes were compared with the extracted immutable beta.11 source, and generated code/README/package content were inspected. No root application build or design check was needed for these extension-only changes.

Final beta.14 archive: `plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.14.tgz`.

SHA-256: `0017ea5d96a5737a743b914a71770e2da31becee444a04ece3a9bfc36eaafae4`.

| Actual native host | Evidence for these exact beta.14 bytes | Result |
| --- | --- | --- |
| `1.18.32` | `plugins/guilduo-opencode/artifacts/native-host-1.18.32-QY29Y6/evidence.json` | PASS |
| `1.18.35` | `plugins/guilduo-opencode/artifacts/native-host-1.18.35-FjMV9R/evidence.json` | PASS |

Each run performs these concrete operations:

1. Allowlisted environment, fresh home/config/data/cache/state/tmp/workspace/npm installation, no inherited provider keys or real profile. Project config/default plugins/external Skills/model downloads/autoupdate/snapshots are disabled. `GIT_DIR` is an asserted nonexistent path; system/global Git config is disabled. `debug paths` must stay inside isolation, and native session `projectID` must be `global`. An observer disables the public MCP before transport initialization, so no public OAuth or MCP call occurs.
2. Install the unchanged beta.11 tgz using native npm; load it through the actual host, inspect native MCP/config/Skill discovery and SDK session metadata. A baseline plan `noReply` message plus repeated native abort/idle creates no assistant or continuation.
3. Fully stop the host; npm-install beta.14 over the same dedicated isolated `workspace/.opencode/guilduo` installation; verify installed version, restart, inspect native config/Skill discovery and confirm no unbound sync-off command. A separate unrelated unsaved package under shared `workspace/.opencode/node_modules` keeps its manifest/module bytes and the shared manifest unchanged across install, upgrade and uninstall. Native config bytes and the public dummy grant remain unchanged; actual `opencode mcp auth list` recognizes the dummy alias.
4. Configure a separate loopback-only MCP alias with `enabled:false` and a disposable native callback port. Actual native auth-start API performs resource/authorization-server discovery and dynamic client registration. Visit the fixture's authorization URL (no browser or real account), assert returned state, resource and redirect URI, then use supported native `/mcp/loopback/auth/callback` for code exchange. The fixture verifies S256 PKCE, client/resource/redirect binding and one-time code use. Native empty-tool MCP connection succeeds. Stop the host, inject expiry into the actual exchanged synthetic grant and fixture, restart, assert that grant retention, reconnect and observe one actual refresh exchange with token rotation, a second native `tools/list` and zero advertised tools. Native auth removal clears this alias while preserving the original unrelated/dummy grants.
5. Dispose the actual native instance, wait for observer `dispose`, fully stop/restart with exact `phaseSync` tuple. The bilingual stop command appears in native `/command` discovery. Bound read-only/disabled-MCP build `noReply` messages and repeated abort/idle yield only user messages, with no model continuation.
6. Dispose/restart with an occupied user MCP setting; preserve it and exact config bytes. Remove the plugin entry, dispose/restart and verify bundled Skill and command withdrawal, preserving explicit MCP settings.
7. Fully stop; native npm-uninstall the package from the dedicated prefix; verify it is absent; restart without it and verify Skill absence, explicit MCP/config retention and unchanged dummy grants.
8. Actual `opencode mcp logout guilduo` removes the target dummy grant while retaining an unrelated dummy grant. Repeating logout is safe and does not edit native config. Each owned host process exits.

**Synthetic OAuth scope:** `syntheticOAuthLoginRefresh` and `syntheticOAuthReceipt` record actual native discovery/DCR, supported auth callback/code exchange, restart and refresh against the loopback HTTP fixture. The final receipt asserts state/resource/redirect binding and PKCE, one code exchange, one refresh and two empty native tool lists. Expiry is injected; initial OAuth credentials are actually exchanged, not seeded. This does not exercise browser callback listener validation or a real provider/account. `syntheticOAuthLifecycle` is a separate, older dummy-seed retention/list/logout check and must never be cited as OAuth login/refresh acceptance. Real public OAuth, live grant retention and server-side revocation remain unchecked. Positive reminder delivery is unit-tested with injected host responses, not actual model inference.

Full host restarts are intentional. An initial fixture attempted config replacement after `instance/dispose`; the host could reload the previous config before replacement. A subsequent fixture stopped before asynchronous observer disposal finished. The script now waits for actual disposal before stopping, and restarts after settings changes. Those earlier/intermediate runs are superseded by the two final evidence files above.

The intermediate `RyQYes` run timed out on native `GET /config` before the OAuth fixture was constructed. It had not attempted OAuth. The host was still bootstrapping its dependency/config load; no narrower cause was demonstrated. The bounded instance-request timeout was increased from 30 to 60 seconds, and the corrected rerun completed native startup and OAuth. No real config or credentials were used to work around the delay.

Protection rechecks: beta.11 SHA-256 remains `e09a4756d7130733fac0a4650fce091e2f055ea3b2692b44f9cf5d118de133fe`; root `package.json` remains `99944a305ce5417336c310ef8fe9731893f948fb77b052ce8bfc783f64cbe47a`; root `package-lock.json` remains `9ea4f0060560d1970cc539d08cb4c32c1f0c75a62b060fab6a89cfcdc66d6349`. The ancestor `.git/opencode` cache still has length 40 and the pre-existing mtime `2026-10-08T22:57:03Z`. No Git state-changing operation, real config/history/token access, npm publish or deployment was performed.

Changed files (within the authorized ownership):

- `plugins/guilduo-opencode/src/index.ts` and generated `lib/index.js`
- `plugins/guilduo-opencode/package.json`, `stage.mjs`
- `plugins/guilduo-opencode/README.md`, `README.jp.md`
- `plugins/guilduo-opencode/tests/plugin.test.ts`, `tests/native-host.mjs`, `tests/oauth-loopback.mjs`
- `tests/plugin-opencode.test.ts`
- `docs/guilduo-opencode-native-evidence.md`

Reproduce from the repository root: `node plugins/guilduo-opencode/tests/native-host.mjs plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.14.tgz <opencode.exe> <1.18.32-or-1.18.35> [immutable-beta.11.tgz]`. The default old archive is the historical `.qa-artifacts/guilduo-opencode/guilduo-opencode-plugin-0.6.0-beta.11.tgz`; outputs stay under the plugin. Native downgrade was documented but not separately exercised; beta.11 native installation itself passed. Real OAuth, public tool calls/progress readback, Human round-trip, paid inference and release acceptance remain unchecked.

Review status: the parent reported alias/command review PASS. The dedicated-prefix fix, preservation regression and loopback OAuth receipt are ready for the requested independent follow-up review; no final reviewer receipt is assumed here. Parent-owned root package tests are not redundantly rerun after documentation/native-fixture-only changes.

Handoff freeze: both packaged READMEs, source, tests and beta.14 tgz are frozen. Final local repack after the README/native-fixture edits retained SHA-256 `0017ea5d96a5737a743b914a71770e2da31becee444a04ece3a9bfc36eaafae4`; the two final native receipts above assert the same archive hash and all receipt/preservation checks. The parent owns archive verification, follow-up review and integration. No further tests or package reruns are needed absent a concrete failure.

Parent receipt: central final archive verification **PASS**, 14 files, SHA-256 `0017ea5d96a5737a743b914a71770e2da31becee444a04ece3a9bfc36eaafae4`; all current packaged bytes match, canonical Skill/all references and AGPL are preserved, and the old beta.11 archive remains unchanged. Parent-owned receipt: `.qa-artifacts/guilduo-extensions-beta14/validation.json` (reported by the parent; not modified here). Two P2 follow-up review items remain awaiting independent acceptance. Packaging/native checks do not close that review gate or authorize publication.

## Historical beta.11 evidence

## Versions and scope

- Public npm registry latest: `opencode-ai@1.18.35` and `@opencode-ai/plugin@1.18.35`.
- Installed public npm manifest: `opencode-ai@1.18.32`; candidate targets Plugin SDK `1.18.32`.
- A disposable `opencode-windows-x64@1.18.35` binary was installed under `.qa-artifacts/guilduo-opencode/native-runtime` using `--ignore-scripts --no-package-lock --no-save`. The OS package has no lifecycle scripts.
- Only public package metadata and official source were inspected. No real profile, credentials, OAuth authorization, or model inference was used.

## Hook contract verified against v1.18.32

The native `Plugin` receives context plus optional plugin options and returns `Hooks`. `config`, `event`, and `dispose` are supported. There is no generic `turn-complete` hook.

- `experimental.chat.system.transform(input, output)` receives `{ sessionID?, model }` and can append to `output.system` during an existing model request. It has no `agent` input. This is best effort guidance, not guaranteed MCP execution.
- `chat.message` receives `sessionID` and optional `agent`; `chat.params` receives an agent string. A plan gate must use a supported source of agent information, not assume an undocumented system-transform field.
- `experimental.text.complete` receives `{ sessionID, messageID, partID }` and edits `{ text }`. The processor calls it on **each text-end**, before persisting that text part. It does not signal final turn completion and cannot retroactively instruct the model.
- `event({ event })` receives `session.idle` after the native session status becomes idle. This event also occurs on cancellation/error, so idle alone cannot prove successful completion. The parent candidate explicitly opts in with exact `phaseSync` binding, consumes one budget only after a parent-matched completed `stop` assistant with `mode: build` and matching `path.cwd`, rechecks session metadata, then uses native `promptAsync`. That is a supported API and intentionally starts a continuation/model request. The sidecar acceptance does **not** execute that positive continuation because this task forbids inference; this is a test scope limit, not a host incompatibility.
- `dispose` is a supported native cleanup hook. Unload should be verified through native instance disposal and subsequent config/plugin removal, not a mocked registry.

## Native MCP, loading and Skill

Use standard `mcp.guilduo` configuration: `{ "type": "remote", "url": "https://mcp.guilduo.com/mcp", "oauth": {} }`. Omitting `oauth` also enables automatic OAuth/Dynamic Client Registration. `oauth: false` disables it. Optional OAuth fields are `clientId`, `clientSecret`, and `scope`.

Authenticate with `opencode mcp auth guilduo`; inspect with `opencode mcp list` / `opencode mcp auth list`; disconnect with `opencode mcp logout guilduo`. Native MCP OAuth tokens belong to the host; no plugin token bridge is needed.

Plugins load from `opencode.json` `plugin` entries (npm packages, pinned versions or native local module paths) or `.opencode/plugins/` / global plugin directories. Native SDK also supports `[specifier, options]`. Plugin exports must be plugin functions or the supported plugin module object; arbitrary exported helper values can fail legacy loading.

Canonical Skills can be discovered through `.opencode/skills/<name>/SKILL.md` or configured `skills.paths`. Required frontmatter is `name` and `description`; the canonical compatibility name at the time of this historical check was `questforge-workflows`.

## Authoritative sources

- [Plugin documentation](https://opencode.ai/docs/plugins/)
- [MCP and OAuth documentation](https://opencode.ai/docs/mcp-servers/)
- [Skills documentation](https://opencode.ai/docs/skills/)
- [Config documentation](https://opencode.ai/docs/config/)
- [Pinned v1.18.32 Hooks](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/plugin/src/index.ts)
- [Pinned text-end call site](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/session/processor.ts)
- [Pinned idle publication](https://github.com/anomalyco/opencode/blob/v1.18.32/packages/opencode/src/session/status.ts)

## Acceptance

The final parent-built archive passed against actual installed host `1.18.32` and isolated public pinned host `1.18.35`:

- Local npm archive installed with `--ignore-scripts --no-package-lock --no-save` into a fresh QA directory.
- `debug paths` confirmed all host home/config/data/cache/state/tmp directories are inside isolation. Provider/auth environment variables were not inherited. Existing project config and external Skills were disabled.
- Native config hook added default official remote MCP with automatic OAuth, retained existing Skills, and discovered the installed canonical `questforge-workflows` Skill. A test observer disabled the public MCP before transport initialization; no live OAuth flow was attempted.
- Packaged Skill bytes matched the repository canonical file; native parsed Skill body matched after frontmatter removal.
- Native `noReply` plan message followed by repeated native abort/idle dispatch produced no continuation. Explicit `phaseSync` options tuple also loaded successfully; bound disabled-MCP/read-only build messages produced no continuation.
- The native `PluginInput.client.session.get` call returned matching `id` and `directory` without an SDK error on both hosts. Plan user-message metadata remained `agent: plan`.
- Native instance disposal and removing the plugin withdrew bundled Skill discovery while retaining existing user MCP configuration and exact config file bytes.
- Owned host process exited. No assistant/model output was generated.

Isolation correction: initial native runs discovered the ancestor repository despite project config being disabled. OpenCode's own `Project.commit` rewrote the already-existing project-ID cache at `D:/VibeCoding/questforge-prototype/.git/opencode` (mtime observed 2026-10-09 07:57:03 JST; original bytes were not captured, so no restoration was attempted). No Git branch/commit/index mutation was requested or performed by the sidecar. The acceptance script now overrides `GIT_DIR` to an isolated nonexistent directory, disables system/global Git config, and requires `session.projectID === "global"`. Both final reruns passed that stronger boundary; the shared cache mtime/length stayed unchanged across them.

Final archive: `.qa-artifacts/guilduo-opencode/guilduo-opencode-plugin-0.6.0-beta.11.tgz`.

SHA-256: `e09a4756d7130733fac0a4650fce091e2f055ea3b2692b44f9cf5d118de133fe`.

Both runs installed and verified those exact archive bytes:

| Actual host | Final evidence | Result |
| --- | --- | --- |
| Installed `1.18.32` | `.qa-artifacts/guilduo-opencode/native-host-1.18.32-xZGeSw/evidence.json` | PASS |
| Public pinned `1.18.35` | `.qa-artifacts/guilduo-opencode/native-host-1.18.35-8a7PRh/evidence.json` | PASS |

Each directory also contains native event observations, isolated host logs and installed candidate files. Earlier `ma5BLi` / `KnuhGm` runs used an intermediate archive; `RSD6d0` / `jMgnCh` used the final archive before the Git-isolation correction. All are superseded by the two final runs above.

Reproduction: `node plugins/guilduo-opencode/tests/native-host.mjs <candidate.tgz> <opencode executable> [pinned version]` (default `1.18.32`). All npm/host state stays beneath `.qa-artifacts/guilduo-opencode/native-host-<version>-*`.

The actual host's `/doc` runtime OpenAPI reports AssistantMessage `parentID`, `finish`, `time.completed`, `mode`, `agent` and `path: { cwd, root }`; Session reports `agent` as a string, `directory` and optional `parentID`, `path` and permissions. Native source persists final assistant completion before the runner's idle callback. `session.idle` remains emitted in both pinned official `1.18.32` and `1.18.35` source. No concrete lifecycle/API incompatibility has been found.

Not checked: live OAuth login/token retention, MCP tool calls, positive assistant completion through actual model inference, and successful opt-in continuation. Parent unit tests cover injected completion cases separately; those are not native model acceptance.
