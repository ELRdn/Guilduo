# Guilduo OpenCode / OpenClaw beta.16

Updated October 10, 2026. Windows is the accepted target platform. These independent packages use host-owned OAuth and the canonical `guilduo-workflows` Skill. Installation grants no Quest write permission and does not register another Agent.

| Gate | OpenCode | OpenClaw |
| --- | --- | --- |
| Candidate | `@guilduo/opencode-plugin@0.6.0-beta.16` | `@guilduo/openclaw-plugin@0.6.0-beta.16` |
| Host target | 1.18.32 / 1.18.35 | 2026.9.9, commit `bcfc88812a35243893585dbeca87ca41b48272ca` |
| Native install / beta.15 update / Skill / removal | Passed on both host versions | Passed on pinned host |
| Exact Go model / optional phaseSync | Four cases passed on each host; synthetic MCP | No plugin model execution |
| npm publication | Pending | Pending |
| Official listing | Ecosystem fork prepared; PR pending | Owner `guilduo` secured; submission pending |
| Public OAuth / native MCP | Native CLI sign-in and restarted host connection passed | Native CLI sign-in and 56-tool discovery passed |
| Guarded Quest update / readback | Single-field preview, version-guarded update and exact readback passed | Single-field preview, version-guarded update and exact readback passed |
| Human answer / native Agent resumption | Actual native request → user Web answer → same Go session read/resumption passed | Native SDK request → user Web answer → embedded Go Agent read/resumption passed |
| No-op / conflict reread | Native Go skipped unchanged writes; stale update rejected and unchanged state reread | Native Go skipped unchanged writes; native SDK stale update rejected and unchanged state reread |
| Public refresh / revocation / explicit reconnect | Pending | Pending |

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
- Public native profile and tool-history receipts remain ignored local QA data. The source PR and npm packages contain no OAuth/browser/provider profile, private fixture ID, saved answer record or cache.

## Guides and review

- [OpenCode English guide](../plugins/guilduo-opencode/README.md) / [日本語](../plugins/guilduo-opencode/README.jp.md) / [native evidence](guilduo-opencode-native-evidence.md).
- [OpenClaw English guide](../plugins/guilduo-openclaw/README.md) / [日本語](../plugins/guilduo-openclaw/README.jp.md) / [native evidence](guilduo-openclaw-native-evidence.md).
- [Workflow Skill migration](guilduo-workflows-migration.md).
- [Independent DSH feedback](guilduo-dsh-independent-review.md). This is an AI review, not an external human audit. DSH runtime code and published beta.16 remain unchanged.

## Release order

Review the exact source diff, validate the packages and final archives, then publish the source through a reviewed PR. Publish npm packages under `beta`, verify the public archive bytes and registry integrity, and submit the corresponding official listings. A submitted PR or pending ClawHub scan is not a completed listing. No promotion to `latest` or production Worker/Site deployment is included.
