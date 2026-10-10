# Guilduo OpenCode / OpenClaw beta.16

Updated October 10, 2026. Windows is the accepted target platform. These independent packages use host-owned OAuth and the canonical `guilduo-workflows` Skill. Installation grants no Quest write permission and does not register another Agent.

| Gate | OpenCode | OpenClaw |
| --- | --- | --- |
| Published npm version | `@guilduo/opencode-plugin@0.6.0-beta.16` | `@guilduo/openclaw-plugin@0.6.0-beta.16` |
| Host target | 1.18.32 / 1.18.35 | 2026.9.9, commit `bcfc88812a35243893585dbeca87ca41b48272ca` |
| Native install / beta.15 update / Skill / removal | Passed on both host versions | Passed on pinned host |
| Exact Go model / optional phaseSync | Four cases passed on each host; synthetic MCP | No plugin model execution |
| npm publication / public archive / isolated install | Passed; public version, beta tag, SHA-256/integrity and raw bytes verified | Passed; public version, beta tag, SHA-256/integrity and raw bytes verified |
| npm beta-only tag gate | Not met: registry automatically assigned `latest`; authenticated deletion returned HTTP 400 | Not met: registry automatically assigned `latest`; authenticated deletion returned HTTP 400 |
| Official listing | Ecosystem PR #54271 closed by upstream v1 freeze; official alternative requested | Published under `guilduo`; public page/download/native install passed; aggregate scan/search gate pending |
| Public OAuth / native MCP | Native CLI sign-in and restarted host connection passed | Native CLI sign-in and 56-tool discovery passed |
| Guarded Quest update / readback | Single-field preview, version-guarded update and exact readback passed | Single-field preview, version-guarded update and exact readback passed |
| Human answer / native Agent resumption | Actual native request → user Web answer → same Go session read/resumption passed | Native SDK request → user Web answer → embedded Go Agent read/resumption passed |
| No-op / conflict reread | Native Go skipped unchanged writes; stale update rejected and unchanged state reread | Native Go skipped unchanged writes; native SDK stale update rejected and unchanged state reread |
| Public refresh / revocation / explicit reconnect | Public native refresh via QA 401 carrier, Web revocation denial, native logout and fresh OAuth reconnect passed | Public native refresh after expiry-only QA injection, Web revocation denial, native logout and fresh OAuth/56-tool reconnect passed |

## Evidence boundaries

- The beta.15 archives and historical receipts remain unchanged in the original development checkout. Final beta.16 archive checks belong to the native evidence documents below.
- Unit tests, synthetic OAuth, native loading, public OAuth, model continuation, persisted workflow updates, npm publication and directory listing are separate gates.
- Model-based acceptance uses OpenCode Go `deepseek-v4.1-flash` only. No provider fallback or performance benchmark is part of this release.
- OpenCode's optional `phaseSync` is off by default; an explicit exact-session binding allows at most one additional reminder per original input. A reminder is not proof of a saved Quest update.
- OpenClaw uses personal/administrator shared operator OAuth. Multiple-person channel authorization is not accepted by these tests.
- Tokens, OAuth callback URLs, provider keys, account identifiers and private Quest content are excluded from public receipts. Native credentials remain owned by the host.
- The OpenCode public connection was explicitly linked to the existing authorized Registry Agent through the native `link_agent` tool. Exact Agent/Quest reads then passed with `actingAgentId`; installing or signing in alone does not establish that Agent association. An earlier unlinked read returned an output-schema error and is not counted as successful acceptance.

## Public workflow acceptance

The operator approved native OAuth for both isolated host profiles and answered each host's dedicated Human test through the public Web App. Existing authorized Registry Agents were reused; no Agent was registered and no Quest was completed or rewarded.

- OpenCode 1.18.35 used the exact Go model, explicitly linked its dedicated connection, verified the assigned Agent/Quest, previewed and executed the Human request, and resumed the same native session after reading the saved answer. It then previewed a `nextAction`-only patch, executed with fresh `expectedUpdatedAt`, and read the exact persisted field back.
- OpenClaw 2026.9.9 performed the request through its shipped native MCP harness SDK, including the native scheduler lifecycle and host-owned saved OAuth. A manually requested embedded Agent turn read the saved answer and performed the same limited preview/update/readback. Its native receipt identifies `opencode-go/deepseek-v4.1-flash`, one successful provider attempt, and `fallbackUsed: false`. Its isolated provider configuration references the standard environment key; the key is not stored in the configuration or public receipts.
- All execution calls supplied the intended `actingAgentId`, and the returned context and assigned Quest matched. Each dedicated connection currently allows one Registry Agent. Cross-Agent arbitration on a connection with multiple allowed Agents and multi-person channels are not inferred from these results.
- Both native Agents compared the existing field and skipped an unchanged write. Deliberately stale `expectedUpdatedAt` updates were rejected and reread preserved the saved value/version. Direct same-value API writes can advance the timestamp; automatic server idempotency is not claimed.
- Public refresh used native host storage and transport: OpenCode received a public 401 from a temporary synthetic invalid Bearer header and saved a replacement access token/future expiry; OpenClaw used an expiry-only local SQLite QA injection followed by ordinary native probe and saved a new future expiry. These are real public refresh exchanges under injected QA triggers, not natural-expiry or refresh-concurrency acceptance. Temporary OpenCode configuration was restored and normal native connection succeeded.
- After the operator disconnected both dedicated connections in Web Settings, OpenCode required authentication and OpenClaw discovery returned no servers with OAuth authorization required. Native logout cleared local authentication, and fresh operator OAuth approval restored OpenCode connection and OpenClaw 56-tool discovery. Each new dedicated connection was explicitly linked to the same existing permitted Agent; no Agent was registered. OpenCode's native Go Agent and OpenClaw's native MCP harness SDK both verified that association and the exact assigned Quest after reconnect.
- Public native profile and tool-history receipts remain ignored local QA data. The source PR and npm packages contain no OAuth/browser/provider profile, private fixture ID, saved answer record or cache.

## Guides and review

- [OpenCode English guide](../plugins/guilduo-opencode/README.md) / [日本語](../plugins/guilduo-opencode/README.jp.md) / [native evidence](guilduo-opencode-native-evidence.md).
- [OpenClaw English guide](../plugins/guilduo-openclaw/README.md) / [日本語](../plugins/guilduo-openclaw/README.jp.md) / [native evidence](guilduo-openclaw-native-evidence.md).
- [Workflow Skill migration](guilduo-workflows-migration.md).
- [Independent DSH feedback](guilduo-dsh-independent-review.md). This is an AI review, not an external human audit. DSH runtime code and published beta.16 remain unchanged.

## Release order

Review the exact source diff, validate the packages and final archives, then publish the source through a reviewed PR. Publish npm packages under `beta`, verify the public archive bytes and registry integrity, and submit the corresponding official listings. A submitted PR or pending ClawHub scan is not a completed listing. No promotion to `latest` or production Worker/Site deployment is included.

## Published installation

Use an explicit version while the tag exception below remains unresolved. Preserve other entries in your OpenCode `opencode.json`:

```json
{ "plugin": ["@guilduo/opencode-plugin@0.6.0-beta.16"] }
```

For the pinned OpenClaw host, install the published package and configure the native MCP connection if it is absent:

```powershell
openclaw plugins install npm:@guilduo/openclaw-plugin@0.6.0-beta.16 --pin
openclaw mcp add guilduo --url https://mcp.guilduo.com/mcp --transport streamable-http --auth oauth --no-probe
```

Inspect existing Settings/MCP aliases first; an existing alias should be retained. Restart the host, use its standard OAuth UI/CLI, and explicitly link an existing permitted Agent as described in the host guides. Installation/OAuth alone does not grant Quest write permission.

## Publication receipts and remaining external gates

- [Source PR #55](https://github.com/ELRdn/Guilduo/pull/55) merged after independent AI source/archive review and successful CI. Published source commit: `8dfee40372f83c3f3f23ae21863e23c7d950011c`. QA-root junction refusal was fixed and checked before merge; DSH runtime stayed frozen.
- npm [OpenCode](https://www.npmjs.com/package/@guilduo/opencode-plugin/v/0.6.0-beta.16) and [OpenClaw](https://www.npmjs.com/package/@guilduo/openclaw-plugin/v/0.6.0-beta.16) publication used explicit `--tag beta --access public --ignore-scripts`. Public tgz bytes exactly match the frozen archives: OpenCode SHA-256 `6fe013ae72b80e47d8846b2c20b0e4d42a749ce03ea142ef3d9243410e870d2c`; OpenClaw `46c3fb454ac179807148c090f9730f8a2f77576f9fdbd8d20d4584508eaea678`. SHA-512 registry integrity matched; fresh isolated registry installation found the correct manifests and canonical Skill in both packages.
- **Unresolved npm tag exception:** the first public versions also received `latest` despite the explicit beta tag. Both standard `npm dist-tag rm <package> latest` operations completed operator two-factor authentication but the registry rejected deletion with HTTP 400. Current public tags are `beta` and `latest`, both pointing to beta.16. No explicit latest-promotion command was executed, but the requested beta-only public state is **not achieved**. The same first-publication behavior is reported in [npm/cli #8490](https://github.com/npm/cli/issues/8490). No dummy stable version, destructive unpublish, credential workaround or altered artifact was introduced.
- [OpenCode Ecosystem PR #54271](https://github.com/anomalyco/opencode/pull/54271) added one row with all other document bytes preserved. Automated checks passed; the upstream bot closed it because the v1 `dev` branch accepts only critical fixes. The description was corrected to the required template and a supported official listing route was requested. This is **closed without merge**, not submitted-and-waiting or a completed listing. The accepted package targets 1.18.32/1.18.35; `@opencode/cli` v2 compatibility is untested and not claimed.
- [ClawHub package page](https://clawhub.ai/guilduo/plugins/openclaw-plugin) returned HTTP 200 with the Guilduo title and package identity. Owner is `guilduo`; publication receipt is `published` for beta.16, source-linked to the merged commit. Public CLI download verified the original SHA-256/integrity; fresh native installation, runtime import, Skill discovery and removal passed on the pinned host. This is a community package on the official registry, not an OpenClaw endorsement.
- **Unresolved ClawHub discovery gate:** selected beta.16 verification and LLM verdict are clean/benign, while package-level metadata still reports pending with no default latest release, and public `package explore guilduo --family code-plugin` returns no results. Static scanning flags the disclosed `child_process` native CLI call in `setup.mjs`; no hidden persistence was reported by the LLM scan. Version publication/download success does not establish aggregate scan, default search visibility or completed official listing. No latest tag was added to ClawHub to bypass this boundary.

Natural access-token expiry, refresh concurrency/rotation guarantees, cross-Agent arbitration on shared connections, multiple-person channels, Linux/macOS hardware and performance benchmarks are outside the accepted evidence. No production Worker/Site deployment or DSH repair/republication occurred.

## Claude Code plugin candidate

`guilduo@guilduo` `0.6.0-beta.1` ([README](../plugins/guilduo-claude/README.md)) is distributed through this repository's standard Claude Code marketplace (`.claude-plugin/marketplace.json`), not npm. It declares only the official OAuth MCP endpoint as `guilduo` and bundles the canonical `guilduo-workflows` Skill. It has no hooks, commands, subagents, automatic prompts or Agent registration.

| Gate | Claude Code |
| --- | --- |
| Host target | 2.1.286 |
| Manifest validation (`claude plugin validate --strict`) / package test | Passed |
| Isolated native install / Skill and MCP discovery / update command / disable / enable / uninstall / unrelated setting preservation | Passed from a local in-place marketplace (`tests/native-host.mjs`, no sign-in, MCP tool call or inference) |
| GitHub sparse clone of the PR branch into the plugin cache / content comparison | Passed (`tests/native-host.mjs ELRdn/Guilduo#codex/guilduo-claude-plugin`, 17 checks) |
| Version-changing update from GitHub | Not accepted (requires a published version change) |
| Public OAuth (dynamic client registration, loopback callback) / reuse in a new process | Passed in an isolated profile with operator browser approval |
| Read-only MCP tool calls through the Skill | Passed: `claude-haiku-5-5` loaded the Skill and called `get_agent_link`, `list_registered_agents` and `get_current_agent_context`; no write, link or permission denial. An unfiltered `list_quests` exceeded Claude Code's MCP output limit (README notes narrower views / `MAX_MCP_OUTPUT_TOKENS`) |
| Sign-out / reconnect | Passed: `claude mcp logout` returned the server to "Needs authentication"; fresh operator approval restored `Connected` in a new process |
| Agent association for writes | Not accepted: the test connection was left unlinked; no Agent was linked or registered |
| Guarded Quest update / readback / no-op / conflict reread | Not accepted |
| Human request → Web answer → saved answer → Agent resumption | Not accepted |
| Refresh / server-side revocation | Not accepted |
| Marketplace publication (merge to `main`) / Anthropic directory listing | Not published |

Observed during Claude Code OAuth: Claude Code warns that the stored credential has no issuer stamp (SEP-2352), meaning the authorization response does not round-trip the issuer. Sign-in still succeeds; this is a server-side follow-up, not changed by this plugin.
