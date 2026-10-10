# Guilduo: OpenAI, Codex, Grok Bot and Muse Code

[日本語](guilduo-next-hosts.jp.md) · Candidate version: **0.6.0-beta.12**

These packages reuse the canonical `skills/guilduo-workflows/` Skill and the
official OAuth MCP endpoint, `https://mcp.guilduo.com/mcp`. Installation does not
register an Agent, run a model, authorize writes or widen permissions. Free
accounts retain the limit of two registered Agents. Reuse an authorized Agent.

## Choose one connection mode

| Package | Included capabilities | Distribution / acceptance boundary |
| --- | --- | --- |
| OpenAI / ChatGPT | Skill and remote OAuth MCP; no hooks or App references | Separate submission ZIP. Portal review, approval and Publish are separate gates. |
| Codex normal | Skill, remote OAuth MCP, SessionStart and Stop assistance | `plugins/guilduo-workflows/` through `.agents/plugins/marketplace.json`. |
| Codex App companion | Skill and hooks, referencing your existing registered App | Locally generated; adds no duplicate MCP connection. Never upload this package for OpenAI review. |
| Grok Bot candidate | Agent Plugins manifest, Skill, HTTPS MCP; no hooks | Git and ZIP candidate. Cursor compatibility is not Grok native acceptance. |
| Muse Code candidate | Native manifest and Skill; no hooks | Git and ZIP. Configure authenticated MCP separately in Muse's standard user settings. |

Use the connection already authorized for the intended account. In a shared
connection, obtain the permitted Agent IDs and supply the selected
`actingAgentId` on every read, preview and write. Do not relink a shared
connection to switch identities. Verify freshly discovered tool schemas before
writing: `update_quest` must expose `expectedUpdatedAt` and `actingAgentId`.

## Codex Windows Desktop / CLI

The acceptance target is CLI **0.159.2** and the installed Windows Desktop.
From a checkout of the published source:

```powershell
codex plugin marketplace add ELRdn/Guilduo --ref main
codex plugin add guilduo-workflows@guilduo-local
codex plugin list --marketplace guilduo-local --json
```

If `guilduo-local` already points at a local companion, update that companion
instead. Inspect its actual App ID, connection mode, version and cache before
changing sources. Do not install the direct MCP package over a working App
companion just to obtain the Skill.

```powershell
# Existing App companion; use an actual registered App ID, never an OAuth token.
npx tsx tools/prepare-guilduo-plugin.mts --app-id YOUR_REGISTERED_GUILDUO_APP_ID --hooks
codex plugin marketplace add ./.qa-artifacts/guilduo-plugin-hooks
codex plugin add guilduo-workflows@guilduo-local
```

Keep this generated directory while the local marketplace is registered.
Restart Desktop and begin a new chat. Check exactly one enabled
`guilduo-workflows:guilduo-workflows` Skill and one intended connection. The
current running chat does not prove that a newly installed Skill was loaded.
For a Git marketplace update, run `codex plugin marketplace upgrade guilduo-local`
and reinstall the same plugin; recheck the installed version and cache.

Review and trust the exact hooks in the host before enabling assistance. After
explicit continuation permission, verify the exact session, canonical cwd,
Quest and permitted Agent, then follow the packaged `hooks/README.md` to bind.
Each original `session_id` + `turn_id` can produce at most one additional check;
rebinding does not clear its consumed receipt. Missing identifiers, recursion
state, invalid binding or storage failure suppress assistance. Plan, read-only,
fork, revoked permission and interruption must not trigger writes.

Unbind to stop assistance. This does not abort the host's current inference;
use the host's Stop / interrupt control for that. Hooks do not call MCP directly
or save credentials or conversation text. Disable the plugin in host settings
to suspend it. For removal, run
`codex plugin remove guilduo-workflows@guilduo-local`; remove only this
marketplace if it is no longer needed. OAuth disconnection is a separate action:
use the intended host connection settings and Guilduo Web Settings → MCP
connections. Preserve unrelated plugins, settings and connections.

## OpenAI submission

Only the frozen OpenAI submission ZIP may be uploaded. Its entire entry list
must exclude hooks and App references, even when the version equals the Codex
package version. Use the existing draft identity; do not create a duplicate
because the package has a new version. Complete domain verification, live MCP
and Skill scans, five positive and three negative actual cases, dedicated
reviewer access and a real demonstration before submitting.

Reviewer credentials belong only in the secure portal, never in Git, ZIP,
public evidence or chat. A user's personal OAuth or Human answer test does not
provide an independent reviewer account. After approval, Publish and verify the
directory listing separately. See the
[official submission process](https://developers.openai.com/plugins/deploy/submission).

## Grok / Muse candidate boundary

No new paid contract or API usage is authorized for these hosts. Their candidate
validation, installation evidence and limits are recorded in the
[Grok / Muse acceptance report](acceptance/guilduo-next-hosts-grok-muse.md).
Do not describe a portable ZIP as a verified Grok import mechanism, or a Cursor
listing as Grok model acceptance. A submission requiring an unmet real-host
test remains on hold. Muse publishes native Git / ZIP instructions without a
promised central store listing. Neither candidate's real-model / Human roundtrip
is accepted by static packaging checks.

## First authorized workflow

Read Agent context and an exact test Quest first. Confirm account, allowlist,
effective scopes and fresh schemas. Make only the delegated `nextAction` /
`handoff.note` change with the current `expectedUpdatedAt`, then read it back.
`update_quest` has no `dryRun`: identical content needs no write; a conflict
requires rereading instead of blindly replaying the write. Human feedback must
come from the owner's saved Web answer before the Agent resumes. Completion,
rewards, scope expansion and Handoff acceptance remain separate authorizations.

Source, native installation, OAuth, model, Human, artifact publication and
directory listing are reported separately in the final acceptance record.
