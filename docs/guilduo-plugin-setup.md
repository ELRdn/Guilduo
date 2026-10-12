# Guilduo Skill and MCP setup

2026-10-10 14:48 JST 公開反映：DSHソース／README／英日How-to／公開受入状況を[PR #54](https://github.com/ELRdn/Guilduo/pull/54)でGitHub mainへ反映。CI全項目成功、公開7ページHTTP 200。[日本語How-to](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-dsh-howto.jp.md)。npm READMEは捕捉済み旧本文のままで、差し替えには別版公開が必要。今回はlatest=beta.16を維持。

2026-10-10 本人追確認：DSH beta.16の公開OAuth・MCP読み書き・Desktop再起動後の保存認証再利用が成功。起動約1〜2分後に設定を開いて接続済みを確認したため、設定前の復元完了や設定なし新規／fork初回入力までは断定しない。Registry Agentは未紐付け、Human回答→再開は未確認。DSH追加開発は停止し、[日本語How-to](guilduo-dsh-howto.jp.md)／[English](guilduo-dsh-howto.md)／[現行受入状況](guilduo-dsh-status.md)を最新の入口にする。npm latest／betaはbeta.16を維持。以下は各時点の履歴。

2026-10-10 14:15 JST 現在：DSHの`latest`／`beta`はともに **0.6.0-beta.16**。Webでは `dsh plugin --profile web add @guilduo/dsh-oauth-poc@latest --ignore-scripts` でもbeta.16を導入できる。Desktopはnative plugin managerから更新する。公開archiveのbyte一致を再確認した。[タグ変更票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/latest-promotion.json)。本人報告で公開OAuth・MCP発見・context読取が成功。保存後の再起動復元・別Desktop・Quest／Human往復は未受入。[実機報告と残件](guilduo-dsh-acceptance.md#2026-10-10-1409-jst-user-reported-public-oauth-acceptance)。以下の旧タグ記録は当時の履歴。

2026-10-10追記: DSHの認証保持修正版beta.16をnpm公開・公開tgz照合済み（09:45 JST）。beta tagはbeta.16、latestはbeta.10を維持。Web更新は `dsh plugin --profile web add @guilduo/dsh-oauth-poc@0.6.0-beta.16 --ignore-scripts`、Desktopはnative plugin manager。更新前に旧Web／Desktopを停止する。保存認証が既にない場合は新版導入後に明示接続を1回行う。旧版での認証消失原因は未確定。OpenCode／OpenClawはbeta.15候補を維持。[受入・更新条件](guilduo-dsh-acceptance.md#2026-10-10-beta16-grant-lifetime-fix)

## Skill rename approved on 2026-10-10

The current canonical Skill is `guilduo-workflows`, under `skills/guilduo-workflows/`.
Invoke the Codex companion as `$guilduo-workflows:guilduo-workflows`. The base manifest candidate
is beta.11; the next DSH/OpenCode/OpenClaw candidates are **beta.15, unpublished**, shipping
only the new Skill name. After release, update the plugin and restart the host. Users must
remove or replace any old standalone `questforge-workflows` Skill to avoid duplicate installation;
user settings and OAuth/MCP/package/plugin/storage IDs are not automatically changed.
See the [minimal migration contract](guilduo-workflows-migration.md).

The beta.14 archives/frozen READMEs and dated installed-name/native records below are evidence
for the old Skill name, not verification of the renamed Skill. Beta.14 updates alone do not
install the new name. All pending beta.14 acceptance remains open.

## OpenCode / OpenClaw beta.14

Both extensions are built and tested local candidates, not npm releases. [OpenCode installation](../plugins/guilduo-opencode/README.jp.md) uses a dedicated `.opencode/guilduo` installation, native OAuth and bundled Skills. [OpenClaw installation](../plugins/guilduo-openclaw/README.jp.md) uses its native plugin manager, saved MCP configuration and Settings / Accounts sign-in. Existing settings and unrelated plugins are preserved. OAuth grants no standing Quest-update permission.

Native install/update/removal and synthetic authentication/refresh passed on OpenCode 1.18.32/1.18.35 and OpenClaw 2026.9.9. [Archive verification](../.qa-artifacts/guilduo-extensions-beta14/validation.json), [OpenCode evidence](guilduo-opencode-native-evidence.md), and [OpenClaw evidence](guilduo-openclaw-native-evidence.md) record the exact scope. Public OAuth, real Human relay and OpenClaw browser/multi-person channel acceptance remain separate gates.

DSH **beta.14 shared authentication is implemented and locally tested with synthetic credentials**. The [final local validation receipt](../.qa-artifacts/guilduo-dsh-shared-beta14/validation.json) records PASS_LOCAL_RELEASE: 75/75 package tests, 2/2 root package tests and type/build/design checks passed; scoped review reports no remaining P1/P2 findings. Final [native shared-authentication evidence](../.qa-artifacts/guilduo-dsh-shared-beta14/native-DhY3W3/evidence.json) passed 7/7 with final compiled hashes matching. Final [UI/Settings/carrier evidence](../.qa-artifacts/guilduo-dsh-shared-beta14/native-final-records-20261009-230829-212.json) passed with matching compiled hashes, including six parallel Settings runs. The README is now permanently frozen. Repack and [isolated beta.13 → beta.14 CLI upgrade](../.qa-artifacts/guilduo-dsh-host/install-8gGvdY/evidence.json) passed 18 checks, with all 32 archive files matching source/build/README/Skill. Final tgz SHA-256: `43585b8d33ea5d2e4da8cde599d5302b60130834e9795f0f5f6eb1fe97b255ed`. Published and publicly verified on 2026-10-10 at 08:22 JST: beta points to beta.14, latest remains beta.10, and downloaded tgz bytes/SHA-256/registry integrity match the frozen archive. [Publication receipt](../.qa-artifacts/guilduo-dsh-shared-beta14/publication.json). See the [beta.14 acceptance record](guilduo-dsh-acceptance.md#2026-10-09-beta14-shared-plan-candidate). Beta.13's published injection fix remains [historical evidence](guilduo-dsh-acceptance.md#2026-10-09-beta13-real-host-injection-fix). Actual public OAuth/Web/Desktop/Human acceptance remains open.

For beta.14 installation/update, **stop old Web and Desktop profiles first**, update every participating profile to the publicly verified beta.14 release, then restart/reload. Desktop uses its native plugin manager. Web uses the [standard DSH command](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command); `dsh plugin --profile web add @guilduo/dsh-oauth-poc@0.6.0-beta.14 --ignore-scripts` installs the verified npm release. An old exact-session grant requires reopening its **original conversation → Settings → Guilduo → 全会話で使う** once through the authenticated share RPC. The descriptor references the original protected grant; tokens are not cloned.

Implemented shared behavior: a new initial login on Windows shares across Web/Desktop with the same Windows user/`DSH_HOME`, for ordinary/new ordinary/root-fork conversations. Subagents, runtime children and independently seeded sessions are denied. `agent/created` restoration is awaited before first model assembly, and selection automatically refreshes status. Restored discovery/refresh has a 15-second network bound, with no implicit OAuth or inference. Global Disconnect leaves a tombstone preventing legacy fallback; deleting the shared source conversation retains the connection. One stable catalog, Agent scopes, standing permission and Free's **2 registered Agents** remain unchanged. DPAPI protects storage for the same Windows user; it is not a model or same-user/process boundary. Native Credentials cross-process refresh/disconnect checks do not establish concurrent safety for DSH conversation/history writers. Actual OAuth/shared restart/Quest/Human acceptance remains pending. Pack and isolated CLI upgrade/file equality passed; beta.14 registry installation is available with the public verification receipt above.

The six-host scope, pinned versions, acceptance ledger and implementation gates are tracked in the
[multihost roadmap](guilduo-plugin-roadmap.md). This guide preserves the existing OpenAI commands;
host package generation does not establish OAuth, progress-sync or Human-relay acceptance.

## Available approaches

| Approach | Use | Remaining user action |
| --- | --- | --- |
| Desktop companion plugin | Bundle the Workflow Skill with an already registered Guilduo App; reuse its OAuth connection | Refresh the App metadata, restart the desktop app, and test in a new chat |
| Direct MCP plugin | Bundle the same Skill with `https://mcp.guilduo.com/mcp` for Codex CLI or another local host | Complete OAuth in the intended account |
| Standalone Skill | Install `skills/guilduo-workflows/` in a host that already has the MCP connection | Replace any old standalone Skill; configure host discovery; MCP alone does not load the Skill |
| Public plugin | Submit the combined package to the universal directory | Complete real-account acceptance and operator submission/review |

The desktop companion is the recommended local path. It adds instructions to the current Guilduo
connection without replacing the old QuestForge App. Do not install both connection modes at once
or use an old QuestForge App ID just because the repository still has legacy technical names.

## Prepare and install locally

Run from this repository. App IDs are identifiers, not credentials; never paste an OAuth token.
Copy the ID from your registered **Guilduo** connection. Supported installed metadata may use
`asdk_app_...` or `plugin_asdk_app_...`.

```powershell
npx tsx tools/prepare-guilduo-plugin.mts --app-id YOUR_REGISTERED_GUILDUO_APP_ID
codex plugin marketplace add (Resolve-Path -LiteralPath .qa-artifacts/guilduo-plugin).Path
codex plugin add guilduo-workflows@guilduo-local
codex plugin list --marketplace guilduo-local --json
```

The generator creates a local marketplace and package under `.qa-artifacts/guilduo-plugin/`.
Its manifest references **only** the registered App, while bundling the current Skill, references,
and `agents/openai.yaml`. The source template and its placeholder App ID are never installed.
The generated files and your App ID are ignored by Git. Re-run these commands after a Skill update;
keep the generated directory available while the local marketplace is registered.

For direct MCP instead of a registered desktop App, omit `--app-id`. The generated manifest then
references only `.mcp.json`; complete OAuth separately in that host. This is an alternative, not an
extra connection required for the desktop App.

## Phase progress and local hooks

The Workflow Skill can record verified results, blockers and the next action at meaningful phase
boundaries under one standing permission for an identified Quest. A new reminder from the user is
not needed for each phase. Plugin installation alone is not permission, and a read-only instruction
always takes precedence. The public Skill is selected by the host; it cannot force activation on
every conversation or run while the host is idle.

For a local execution host that supports lifecycle hooks, prepare the optional hook package:

```powershell
npx tsx tools/prepare-guilduo-plugin.mts --app-id YOUR_REGISTERED_GUILDUO_APP_ID --hooks
```

This writes `.qa-artifacts/guilduo-plugin-hooks/`. Install that local source using the same
marketplace/install sequence, then start a new chat and review the exact hooks in `/hooks`.
Use the resolved hook marketplace path:

```powershell
codex plugin marketplace add (Resolve-Path -LiteralPath .qa-artifacts/guilduo-plugin-hooks).Path
codex plugin add guilduo-workflows@guilduo-local
```

If `guilduo-local` is already registered from the other directory, remove that marketplace source
with `codex plugin marketplace remove guilduo-local`, then add the intended resolved path and
install again. This updates the local package source; the generator retains the supplied Guilduo
App ID. Do not install a second OAuth connection as a workaround.

The runtime skips untrusted hooks; do not bypass trust. Node must be available in the execution
environment. Web installation alone does not deploy hook scripts. SessionStart explains the
session binding procedure. Bind only after the user authorizes progress updates for the exact
Quest and Agent; unbind when that work ends or permission is withdrawn. An unbound chat does not
get a Stop continuation. The hook reads no transcript and holds no OAuth credentials.

The Stop hook can request one final progress pass for a bound session, with a recursion guard.
It does not detect every semantic phase or prove that an MCP write succeeded. The Skill handles
mid-turn phase updates and verifies saved results; no-op, unrelated and read-only turns make no
progress write. Completion, Handoff acceptance and rewards remain separate authorized operations.

For public review, use `--submission`, without `--app-id` or `--hooks`, and follow
[the publication guide](guilduo-plugin-submission.md). Public ZIPs currently cannot include
registered App references or lifecycle hooks.

### Earlier local update recorded on 2026-10-06

`guilduo-workflows@guilduo-local` is installed and enabled at version `0.6.0-beta.9`, using the
generated hook marketplace and the same existing Guilduo App reference. Installed Skill/reference
and hook hashes match the repository source. This verifies package installation only. The runtime
trust decision, new-chat activation, scoped binding and actual phase-update/Human relay behavior
remain separate acceptance steps.

## Refresh the two Human relay tools

On 2026-10-06, a fresh read-only `get_current_agent_context` succeeded through the existing deployed
OpenAI connection and 56 tools were discovered. Its cached `get_quest` and context schemas lack
`actingAgentId` selection. This verifies existing-connection discovery/read only; the new candidate's
acceptance remains false. After deploying the intended candidate, refresh its connector metadata
and start a new chat to verify per-call shared-Agent selection. No writes or session binding were
performed, and no personal IDs or Quest content were saved.

1. Open **ChatGPT Plugins** and the existing developer-mode **Guilduo** connection.
2. Select **Refresh** on the connection. In versions that show Apps, open the corresponding App
   connection settings. This operation refreshes MCP metadata; it does not require widening Agent scopes.
3. Confirm `request_human_review` and `list_human_requests` appear in the discovered tool list.
4. Restart the desktop app after installing/updating the local companion, and start a **new chat**.
5. Enable **Guilduo Workflows** and ask:

   > Use $guilduo-workflows:guilduo-workflows. Read my Guilduo connection and Agent context without writing.
   > Confirm the Skill is loaded and request_human_review and list_human_requests are available.

6. After updating to the renamed Skill, confirm the host's loaded Skill list includes `guilduo-workflows:guilduo-workflows` and the read uses the current
   Guilduo account. Then perform a separately authorized Human review round: request → web answer →
   read saved feedback → resume. Reading tool names alone does not accept that full workflow.

If Refresh is absent or errors, record the error and the discovered tools. Do not delete the working
connection or create a duplicate until the endpoint and metadata can be checked. A published plugin
uses continuous review for tool changes; imported Skill changes still require a new version/review.

## Diagnosis recorded on 2026-10-02

- Initially, production `/health` reported 56 tools while this chat exposed 54, missing the two Human
  relay tools. The server's `tools/list` returns the complete `MCP_TOOLS` array without filtering by
  Agent scopes. A stale imported tool catalogue was the leading explanation; the exact cause was not
  established. Health alone is not an authenticated tool-list check.
- Follow-up: the user reported a successful read-only `list_human_requests` call (0 requests) and
  discovery of the `request_human_review` schema. This connection now also exposes all 56 tools,
  including both Human tools, and `list_human_requests(status=all)` returned 0 requests successfully.
  The missing-tool issue is resolved. Request creation permissions, web answers, feedback retrieval,
  and Agent resumption remain untested; neither check created a Human confirmation Quest.
- The installed App-only Guilduo package has no Skill declaration or Skill directory.
- An older personal `questforge` package points at a different App. It is left intact.
- Canonical and bundled Workflow Skills contain the Human review recipe. The companion preparation
  adds a valid local marketplace and exactly one connection, and rejects malformed App IDs.
- Package tests and host discovery verify packaging/installation. A running conversation cannot gain
  newly installed tools or skills just because files were copied; confirm loading in a new chat.
- Historical local install was enabled at `guilduo-workflows@guilduo-local`. Codex host `skills/list` discovered
  `guilduo-workflows:questforge-workflows` with `enabled: true`, its installed Skill path, and no errors.
  The installed Skill hash matched the then-canonical file. This is historical host discovery, not renamed-Skill or Human relay
  acceptance result or proof that an already running chat loaded the new Skill.

## Official OpenAI documentation

- [Build and install local plugins](https://developers.openai.com/plugins/build/plugins)
- [Refresh metadata and test the complete plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Use plugins in Codex](https://developers.openai.com/codex/plugins/)

Local installation is not public-directory publication or approval. Keep LP-R07 open until the actual
client, OAuth account, Human answer and resume flow have been accepted.

## Generate packages for other hosts

Use the same generator with `--target <host>`. Keep the path printed by the generator and inspect
the generated host README before installing. Do not replace a working OAuth connection with a
second connection merely to load a Skill. The existing no-target OpenAI commands above remain valid.

```powershell
npx tsx tools/prepare-guilduo-plugin.mts --target claude
npx tsx tools/prepare-guilduo-plugin.mts --target grok
npx tsx tools/prepare-guilduo-plugin.mts --target muse
npx tsx tools/prepare-guilduo-plugin.mts --target pi
```

`--hooks` selects an optional local helper only where the target supports it; Grok's first package
has no hooks. `--app-id` is an OpenAI local companion option. `--submission` is the OpenAI public
package path and must exclude `--app-id` and `--hooks`. DSH is an isolated pinned PoC; use its
generated README/build instructions rather than adding dependencies to the root application.

All new generated Skill content comes from `skills/guilduo-workflows/`, including the tool map and
common phase-sync references. OpenAI's local-hook instructions are separated in
[`references/local-hooks.md`](../skills/guilduo-workflows/references/local-hooks.md). The Skill name and directory are
`guilduo-workflows` under the approved migration; package/plugin IDs are retained. Generation checks verify reference consistency,
LICENSE and manifest assets; inspect test output for the current candidate. A generated manifest
does not prove that a particular host version imports it.

On Windows, build and archive all five host targets, including optional helpers and the OpenAI
submission ZIP, with `npx tsx tools/package-guilduo-plugins.mts`. Optional `--app-id` applies only
to the OpenAI local hook package. Each archive is checked against the generator's file hashes;
unexpected or changed files stop packaging before the existing archive is replaced. The report
is `.qa-artifacts/guilduo-plugin-packages.json`. DSH remains a separate isolated package build.

Historical Claude and Muse hook variants used version `0.6.0-beta.10.hooks`; normal variants used
`0.6.0-beta.10`. These old-name outputs are retained as evidence, not new-name distributions.
Claude Code's same-version update keeps the old installed cache even when the
marketplace source changes. Update the registered source to the intended generated directory,
run marketplace/plugin update, and inspect the actual installed cache. Do not infer activation
from marketplace-only `plugin details`. To return to a lower normal version, disable the helper,
uninstall that plugin and install the normal source; retain native user MCP settings and OAuth.

Muse associates an installed plugin with its source path. Installing the hook directory over a
normal installation from another path returns `already installed from a different source`.
For a source switch, unbind and disable the helper, run `muse plugins remove guilduo-workflows`,
then install the intended generated directory and review/trust it. For a registered source that
is updated in place, use `muse plugins update guilduo-workflows`; verify the digest, cache and
capabilities. Keep the separately configured native user MCP settings and OAuth.

| Host | Package and install path | OAuth and acceptance boundary |
| --- | --- | --- |
| Claude | Claude manifest + Skill + Remote MCP. Use the generated local package with Code's `--plugin-dir <absolute-plugin-path>` for isolated testing; use a separately registered own marketplace for beta distribution | Complete OAuth in the intended account. Test Code, Chat and Cowork separately; ordinary Chat does not run Code hooks |
| Grok Bot | Portable Agent Plugins manifest + Skill + Remote MCP. Import through the target Bot/team's supported plugin controls | OAuth is per user in the cloud connector. Follow the team's access rules; cloud Bot cannot use a local-only endpoint. Bot-specific hooks and directory publication remain unverified |
| Muse Code | Native `.muse-plugin/plugin.json` + common Skill, without authenticated MCP declarations. Use `muse plugins validate <absolute-plugin-path>` then `muse plugins install <absolute-plugin-path>` | Configure the official MCP in user settings and run `muse mcp login <server-name>`. Do not put Authorization headers or tokens in the plugin. Stable `1.4.3-R5018.1` needs separate native argv wrappers for optional hooks; review/trust remains required |
| Pi | Pi package with Skill and, if selected, the optional Extension. Use `pi install <absolute-package-path>`; accept locally/Git before npm publication | Pi `1.0.4`, Node ≥22.19, has standard MCP/OAuth. Configure in `.pi/mcp.json` or `~/.pi/agent/mcp.json` using [the pinned MCP guide](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/docs/mcp.md), keeping existing servers |
| DSH | Fixed `0.2.0-rc.2`, Windows; beta.14 shared auth implemented. Final receipt records 75 package + 2 root tests and type/build/design passed; final native 7/7 synthetic PASS. Final browser/carrier and six parallel Settings runs passed; physical Desktop admission remains unverified. frozen README repack and 18 CLI checks passed, all 32 files equal. Npm public verification remains pending. Stop old Web/Desktop profiles before update. Web standard CLI; Desktop native plugin manager. See [installation](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command) | New initial login shares within the same user/home to ordinary/new/root-fork sessions; legacy grants need original-conversation **全会話で使う** once. Subagent/runtime-child/independently seeded deny. Awaited auto restore, selection status, 15-second network bound; no implicit OAuth/inference. Global Disconnect tombstone, no legacy fallback; shared source deletion retains authentication. Actual Web/Desktop OAuth and Human relay pending. No model login tool or Stop hook |

Pi owns its MCP credentials in its native authentication store; do not copy tokens from Codex or
other hosts. If a third-party `/mcp` extension replaces Pi's built-in command, diagnose that conflict
before testing. Muse plugin HTTP MCP restrictions do not mean that user-configured OAuth is
unsupported. DSH's Codex-compatible Stop bridge is not a safe substitute for the existing helper.

The isolated native acceptance uses Codex `0.159.2`, Claude Code `2.1.286`, Muse
`1.4.3-R5018.1`, Pi `1.0.4` and DSH `0.2.0-rc.2`. Existing Pi `0.85.1` and its
settings remain intact. Record native package lifecycle separately from public OAuth,
real model continuation and Human feedback. DSH's version string does not establish
matching source SHA or an OAuth connection. Grok Bot team access remains unavailable.

## Enable and remove optional phase reminders

Historical DSH beta.12/beta.13 authentication was exact-session only: reopening the original conversation's Settings restored its DPAPI grant, Disconnect/session deletion removed it, and forks/new conversations did not inherit it. Beta.14's accepted shared contract supersedes that behavior only after a new initial login or explicit original-conversation migration; shared source deletion retains authentication, and Disconnect is global with no legacy fallback. Non-Windows durable authentication remains unsupported, with no plaintext fallback. See [candidate acceptance](guilduo-dsh-acceptance.md#2026-10-09-beta14-shared-plan-candidate), [beta.12 history](guilduo-dsh-acceptance.md#2026-10-09-beta12-protected-authentication) and [beta.13 history](guilduo-dsh-acceptance.md#2026-10-09-beta13-real-host-injection-fix).

OpenCode is an additional independent candidate after DSH. Its [English / Japanese installation guide](../plugins/guilduo-opencode/README.md) uses native plugin loading, `skills.paths` and standard OAuth Remote MCP (`opencode mcp auth guilduo`). Existing MCP aliases and disabled settings are retained. The candidate tarball is built with `npm --prefix plugins/guilduo-opencode run pack:plugin`; npm publication has not been performed. Basic installation adds no model continuation. Optional exact-session `phaseSync` tuple options can add one model check per original input and incur provider cost; `/guilduo-sync-off` clears that binding. See [native acceptance evidence](guilduo-opencode-native-evidence.md) for the distinction between isolated loading and real OAuth/Human acceptance.

Generate the supported target with `--hooks`, review/trust its script in that execution host, and
start a new session. Hook availability and trust must be checked on the installed host version.
OpenAI public review packages and Grok's first package omit this helper. Muse uses native argv
hooks; fixture execution and real session continuation remain separate acceptance stages.
Pi uses an Extension event rather than a shell Stop hook.

Before binding, obtain existing standing permission for the exact Quest and Agent and read their
context through MCP. Use only the full literal bind arguments emitted by the installed helper or
the Pi package's documented bind command. The binding must identify the exact session, canonical
cwd, Quest and authorized Agent; it is data, not authority. Do not bind merely because installation
or an implementation task was authorized. Resume requires a fresh permission check; fork and cwd
changes do not inherit permission automatically.

The helper may remind the model once per genuine user input. It does not perform network writes,
read transcripts, hold tokens, or imply successful persistence. The Skill owns context reads,
limited patches, no-op checks, `expectedUpdatedAt` and readback. Plan Mode, read-only, unbound
sessions and permission revocation must produce no progress writes. On revocation, unbind and
disable reminders; do not rebind to obtain another continuation. Completion and Human approval
remain independent operations.

To roll back a helper, unbind in its original session/cwd and disable the optional hook or Extension.
Keep the basic MCP+Skill package and the working OAuth connection. For install/update/disable/remove
acceptance, first record existing server names and enabled packages without tokens; then verify
these settings and the underlying connection remain after each operation. Use the host's package
manager rather than deleting its credential store or overwriting its entire MCP settings file.

## Real-account acceptance and evidence

For every host/surface, record the version, generated package hash, date and redacted evidence in
the [status ledger](guilduo-plugin-roadmap.md#対応状況台帳). Do not upgrade a stage based on another
host's success. The required sequence is:

1. Fresh install, Skill discovery, real OAuth, complete tool discovery, active authorized Agent
   context and exact fixture Quest read.
2. Explicitly authorized progress patch and readback; unchanged phase causes no write. Exercise
   conflict/unknown-response handling without losing another actor's changes.
3. Human request preview and authorized execution → actual person answers in
   [Guilduo / Relay Forge](https://app.guilduo.com/) → saved answer read → authorized work resumes.
4. Another meaningful phase without a new “save progress” instruction. Measure Skill initiative
   separately from helper invocation and host confirmation prompts.
5. Invalid/unallowed Agent, wrong owner, read-only, Plan Mode, revocation, resume/fork/cwd change
   and MCP outage; no unintended writes and at most one reminder continuation per input.
6. Update, disable and uninstall in a fresh environment; retain unrelated servers, existing OAuth
   configuration and Free's registered-Agent limit.

A credentials-free evidence record contains fixture aliases, tool names, pass/fail, reminder count,
readback equality and preserved-field checks. Keep real-ID mappings privately. Exclude tokens,
cookies, Authorization headers, complete UIDs, conversation/Quest text and reviewer login details
from shared logs, ZIPs and videos. Account setup, live OAuth, host access/trust and Human web answers
remain concrete operator gates until executed; mock/local tests do not replace them.
