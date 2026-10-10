# Guilduo next-hosts beta.12 release gates

Candidate version: **0.6.0-beta.12**. Checked on 2026-10-10. This is an AI
implementation and review record, not an external human audit or host endorsement.

| Gate | OpenAI / ChatGPT | Codex Windows | Grok Bot | Muse Code |
| --- | --- | --- | --- | --- |
| Source | Shared Skill and OAuth MCP, no hooks/App references | Shared Skill, OAuth MCP and opt-in hooks; separate local App companion | Agent Plugins Skill/MCP candidate, no hooks | Native Skill-only manifest, separate user MCP settings |
| Native install/discovery/update/remove | Complete ZIP installation awaiting portal access | CLI 0.159.2 isolated install/discovery accepted; owner's App companion updated to beta.12, cache verified | Not accepted; eligible host unavailable | Stable 1.4.4-R5419.1 accepted; settings values and unrelated plugin preserved |
| Public OAuth/tool discovery | Pending installed package acceptance | Native OAuth success notification, process restart/auth reuse and fresh 56-tool direct discovery accepted; existing App schemas remain stale | Not accepted | Native visible-terminal login exited 1; owner reports authorization page does not open; unaccepted |
| Model / Human | Five positive/three negative cases pending; no executed pass claimed | OpenAI gpt-6-astra, canonical Skill supplied explicitly: limited update/readback, actual owner Web answer retrieval, same-session resume and no-op accepted | Not run; excluded from this candidate's acceptance | Not run; excluded from this candidate's acceptance |
| Distribution | Target-specific submission ZIP published | Git marketplace and separate ZIP published | Git/ZIP candidate published | Git/ZIP candidate published |
| Listing | Not submitted; developer identity verification pending | Public OpenAI directory submission shares this gate | Cursor submission held: tested-locally requirement unmet | No verified central-store submission route |

The OpenAI Platform account is signed in. Individual verification currently
requires a valid default payment method. The owner chose to complete payment
conditions and verification personally and will report back. No ZIP has been
uploaded, no draft identifier has been confirmed, and domain challenge, scans,
reviewer environment and real demo remain pending. These states are not
"submitted" or "review pending".

Fresh native discovery of the existing registered Guilduo App still omits
`actingAgentId` and `expectedUpdatedAt` in required write schemas. That path is
not used for write acceptance. No account mutation is justified by an older
connector schema. Direct native OAuth uses a temporary test-process configuration,
with the companion disabled in that process and unrelated installed settings kept.

The original dirty checkout, canonical Skill/reference bytes, Claude package and
published DSH/OpenCode/OpenClaw distributions remain outside the changes. Free
retains two registered Agents. No credential bridge, new API, automatic Agent
registration, root dependency or npm distribution is added.

Current source checks: full suite **518/518**, focused package/archive/hooks/review
checks **40/40**, Grok/Muse target checks **14/14**, root type checks, design check
and build passed. The old beta-release template assertion was corrected.
Final Git/member byte verification passed for all four frozen ZIPs. Independent
AI review resolved all six P2 findings; no P1/P2 remains. Final source CI passed
on PR #64; source was merged to public main at
`53793f068546524305d3bc8634edf2918eef4c6b`. All four published ZIPs were
downloaded again and matched their frozen SHA-256 and GitHub asset digests.
The prerelease tag points to the same source commit.

[Download beta.12](https://github.com/ELRdn/Guilduo/releases/tag/guilduo-next-hosts-v0.6.0-beta.12).
No npm package or public Codex App companion is included.

Codex account tests use a process-only direct server, with the App companion and
App tools disabled in that test process. The explicitly supplied Skill is the
installed beta.12 canonical file; this is not proof of trusted plugin hook execution.
The native model provider/model returned exactly `openai` / `gpt-6-astra`, with
API-key environment overrides removed. Four model cases completed within 120 seconds. A stale expectedUpdatedAt was rejected with quest_conflict; the Agent reread the current Quest in read-only mode and did not retry the write.
The first Human preview correctly rejected an unassigned test fixture. Only the
fixture's assignee was repaired using the existing `codex` Agent, then only the
failed Human case was rerun. An invalid direct handoff transition was rejected.
No new Agent, original-Quest completion or reward mutation was performed.
The owner saved the Human response in Web; the Agent read persisted `answered`,
`respondedAt` and the exact response before resuming. Raw account results, OAuth
material, profiles and private identifiers are excluded from public evidence.
After the final LF-only package normalization, the owner companion was reinstalled
through the standard CLI and all 13 cache members matched. Fresh default-profile
native discovery returned exactly one enabled namespaced Guilduo Skill with no
discovery errors, plus the three hook definitions. They are not trusted for these
new bytes (`modified` or `untrusted`); no trust bypass or automatic binding was used.

Native refresh, explicit revocation/reconnection and trusted-hook execution
remain unaccepted. A synthetic receipt/trust suppression test does not establish
real trusted host execution. Muse's synthetic TTY diagnosis established that
non-TTY login prints a URL without opening a browser, while TTY prompts for Enter;
the owner-terminal-only driver fixes that handoff but does not establish OAuth success.
The owner additionally reports no terminal error remained. No opener root cause
or successful authorization is inferred, and no automatic retry was performed.

See [OpenAI/Codex details](guilduo-next-hosts-codex.md), [Grok/Muse details](guilduo-next-hosts-grok-muse.md),
[independent review](guilduo-next-hosts-review.md), [installation guide](../guilduo-next-hosts.md)
and [submission runbook](../guilduo-plugin-submission.md).
