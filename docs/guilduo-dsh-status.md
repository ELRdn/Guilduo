# Guilduo DSH beta.16: release and acceptance status

[English How-to](guilduo-dsh-howto.md) · [日本語How-to](guilduo-dsh-howto.jp.md) · [Source](../plugins/guilduo-dsh/)

Updated October 10, 2026. Package: **@guilduo/dsh-oauth-poc@0.6.0-beta.16**, Windows / DSH **0.2.0-rc.2**. Both npm `latest` and `beta` point to this version. Additional feature development is paused; the remaining work is publication documentation and acceptance.

## Confirmed scope

| Item | Evidence and limits |
| --- | --- |
| npm publication | Public version and tags verified. All 32 archive files matched the frozen candidate. SHA-256: `260d257a96be09f970cf429b312915ffba1c28868a1b249614a328dc7524a513`. |
| Local tests | 80 package tests and 2 root tests passed. Type checks/build passed at release preparation. Native synthetic lifecycle/shared authentication, browser/Settings and isolated CLI checks passed against the final beta.16 hashes. |
| Public OAuth and MCP discovery | User-reported successful OAuth and real `get_agent_link` / `get_current_agent_context` responses. |
| Desktop restart and saved authentication | User reported restarting Desktop, waiting roughly 1–2 minutes, then opening Settings and observing Connected without reauthorization. Saved authentication reuse is accepted on that user's Desktop. This observation does not determine whether restoration finished before opening Settings or was triggered by its status request. |
| MCP reads and writes | User reports real MCP reads and writes working without a Registry Agent link. No exact operation, payload, readback or conflict evidence was supplied; this is basic read/write acceptance, not the full guarded-update workflow. |
| Independent review | A separate AI reviewer found no substantiated major implementation defect in its scoped review and reran 80 isolated tests successfully. It recommended pausing feature development while closing publication and real-environment acceptance gaps. This was not an external human audit. |

The assistant did not inspect real credentials, alter the user's profile or repeat public OAuth/Quest writes. User reports and synthetic tests remain separate evidence sources. No private IDs, tokens, callback URLs or Quest contents are recorded here.

## Remaining acceptance

- Settings-free MCP use in the first model input after restart, in a new ordinary conversation and in a top-level fork. The reported Connected display does not by itself establish these cases.
- Explicit legacy-grant sharing and Web/Desktop sharing across the participating profiles in the real environment.
- A permitted narrow Quest update with readback, duplicate no-op and conflict handling.
- Registry Agent link and Agent-specific Handoff workflow; the user has not linked an Agent yet. A link is not required for every ordinary MCP operation.
- Human request → saved Web answer → response retrieval → resumed work. The user explicitly reports this is still untested.
- Real OAuth refresh/revocation and global disconnect/reconnect/update/removal sequences. Existing synthetic coverage is retained.

## Interpretation

**Beta implementation and npm distribution are a useful stopping point.** Public OAuth, basic MCP read/write and Desktop saved authentication reuse have user acceptance. Full acceptance of settings-free use across all eligible conversations and the Human/Handoff workflows remains open; this is not a declaration of stable-release completion.

Beta.14's historical grant-loss cause is unproven. Beta.16 fixed the reproduced unsafe lifecycle deletion and premature Connected state. Runtime code, identifiers, permissions and the Free limit of **2 registered Agents** are unchanged by this documentation update. Windows DPAPI protects storage for the Windows user; it does not isolate credentials from code running with that same user's privileges.

## Documentation versus package history

The GitHub source README and How-to are maintained after release. The already published beta.16 tarball and its prepublication README remain immutable. npm's displayed README may therefore still describe the old prepublication state: updating this source file does not update npm metadata; a new version would be required. This documentation pass does not publish that new version or change `latest`.
