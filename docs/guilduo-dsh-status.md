# Guilduo DSH: release and acceptance status

[English How-to](guilduo-dsh-howto.md) · [日本語How-to](guilduo-dsh-howto.jp.md) · [Source](../plugins/guilduo-dsh/)

Updated October 10, 2026. Windows / DSH **0.2.0-rc.2**. **Beta.17 maintenance candidate** follows published beta.16; feature expansion remains paused. Before beta.17 publication, npm `latest` and `beta` both point to beta.16. Use the exact package version rather than assuming a tag promotion.

## Beta.17 maintenance

The user authorized necessary fixes after the independent review. Published beta.16 stays immutable; these changes are limited to the plugin and its tests/documentation.

| Finding | Change and fresh evidence |
| --- | --- |
| DSH-R1 / P2 | Legacy disconnect no longer reports erasure success when decoding, admission or native storage fails. The connection remains disabled; Settings returns a safe `guilduo/disconnect-incomplete` error. Retrying from the original conversation after recovery clears the grant, even after a global disconnected tombstone exists. Atomic clear preserves different-birth/replacement records. |
| DSH-R2 / P3 | Retaining close snapshots an already durable grant before clearing RAM. A restore timeout aborts the transport and rejects late provider saves; an earlier rotation can commit only through the original native writer lock and admission checks. Tests cover timeout → prior rotation retained, late save rejected, retry with new token, and timeout → disconnect → no resurrection. This does not establish the cause of historical beta.14 grant loss. |
| DSH-R3 / P3 | Skill and LICENSE share regular-file, symlink/hardlink and directory checks. Physical Windows hardlinks and a junction are rejected without overwriting the other file. Staging copies canonical Skill and LICENSE bytes. |

Fresh local results: **90 package tests, 2 root package-boundary tests, types and build passed**. Installed DSH 0.2.0-rc.2 native synthetic lifetime/shared authentication, actual 15-second restore deadline, native Settings carrier and Chrome shell renderer passed. Isolated CLI beta.16 → beta.17 update/add/readd/remove preserved unrelated configuration, dependency and bundle; Skill discovery/unload passed. These checks use synthetic grants and owned temporary directories, not the user's real profile, OAuth or inference.

Frozen candidate: **32 files**, SHA-256 `89414b1ec3d98fa5d1fa7aa3eb0180f1ed59c913b615942bb46844e5fed3c6d9`. All archive members match current source; Skill references/metadata and LICENSE match the canonical files. Publication, public download matching and final independent approval are recorded separately below after completion. See the [three-plugin completion assessment](guilduo-plugins-completion.md).

## Beta.16 historical acceptance

### Confirmed scope

| Item | Evidence and limits |
| --- | --- |
| npm publication | Public version and tags verified. All 32 archive files matched the frozen candidate. SHA-256: `260d257a96be09f970cf429b312915ffba1c28868a1b249614a328dc7524a513`. |
| Local tests | 80 package tests and 2 root tests passed. Type checks/build passed at release preparation. Native synthetic lifecycle/shared authentication, browser/Settings and isolated CLI checks passed against the final beta.16 hashes. |
| Public OAuth and MCP discovery | User-reported successful OAuth and real `get_agent_link` / `get_current_agent_context` responses. |
| Desktop restart and saved authentication | User reported restarting Desktop, waiting roughly 1–2 minutes, then opening Settings and observing Connected without reauthorization. Saved authentication reuse is accepted on that user's Desktop. This observation does not determine whether restoration finished before opening Settings or was triggered by its status request. |
| MCP reads and writes | User reports real MCP reads and writes working without a Registry Agent link. No exact operation, payload, readback or conflict evidence was supplied; this is basic read/write acceptance, not the full guarded-update workflow. |
| Independent review | A separate AI reviewer found no substantiated major implementation defect in its scoped review and reran 80 isolated tests successfully. It recommended pausing feature development while closing publication and real-environment acceptance gaps. This was not an external human audit. |

The assistant did not inspect real credentials, alter the user's profile or repeat public OAuth/Quest writes. User reports and synthetic tests remain separate evidence sources. No private IDs, tokens, callback URLs or Quest contents are recorded here.

## Remaining real-environment acceptance

- Settings-free MCP use in the first model input after restart, in a new ordinary conversation and in a top-level fork. The reported Connected display does not by itself establish these cases.
- Explicit legacy-grant sharing and Web/Desktop sharing across the participating profiles in the real environment.
- A permitted narrow Quest update with readback, duplicate no-op and conflict handling.
- Registry Agent link and Agent-specific Handoff workflow; the user has not linked an Agent yet. A link is not required for every ordinary MCP operation.
- Human request → saved Web answer → response retrieval → resumed work. The user explicitly reports this is still untested.
- Real OAuth refresh/revocation and global disconnect/reconnect/update/removal sequences. Existing synthetic coverage is retained.

## Interpretation

**Beta.17 addresses the three scoped review findings; full workflow acceptance remains open.** Beta.16 public OAuth, basic MCP read/write and Desktop saved authentication reuse have user acceptance. They are historical evidence rather than fresh beta.17 public acceptance. Full acceptance of settings-free use across all eligible conversations and the Human/Handoff workflows remains open; this is not a declaration of stable-release completion.

Beta.14's historical grant-loss cause is unproven. Beta.16 fixed unsafe lifecycle deletion and premature Connected state; beta.17 is the limited maintenance update above. Compatibility identifiers, permissions and the Free limit of **2 registered Agents** are unchanged. Windows DPAPI protects storage for the Windows user; it does not isolate credentials from code running with that same user's privileges.

## Documentation versus package history

The published beta.16 tarball remains immutable and is retained with its original SHA-256. The beta.17 package captures the maintenance README; later status-only updates do not rewrite its bytes. A `beta` publication does not request `latest` promotion.
