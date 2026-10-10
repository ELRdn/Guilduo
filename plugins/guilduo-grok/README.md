# Guilduo Workflows for Grok Bot

[日本語](README.jp.md) · **0.6.0-beta.12** · AGPL-3.0-only

Portable Agent Plugins candidate: `plugin.json`, `mcp.json` and the canonical `skills/guilduo-workflows/` Skill. It guides authorized Quest progress and Human/Agent handoffs, with no hooks, provider keys, native profile or credential bridge.

## Installation and authentication

The existing [Guilduo repository](https://github.com/ELRdn/Guilduo) contains `plugins/guilduo-grok`; `.cursor-plugin/marketplace.json` is its monorepo catalog. The ZIP contains the plugin directory's contents at its root. Source publication, Cursor review and Grok Bot installation are separate gates. This candidate does not establish a Grok ZIP/local import command or marketplace listing.

For an available connector, use Grok Bot's supported Marketplace UI, review permissions and complete browser OAuth to your own Guilduo account. The bundled MCP endpoint is `https://mcp.guilduo.com/mcp`, with compatibility ID `questforge`. Native import, connector visibility, OAuth and Skill activation require Grok Bot acceptance. Cursor parsing or validation cannot establish Grok acceptance.

Grok Bot requires existing eligible Cursor or linked SuperGrok access under its [current requirements](https://docs.x.ai/grok-bot/get-started). A personal Bot is sufficient; Team Bot is optional. No new subscription is required by this candidate. Without eligible access, package inspection is feasible and connected/model/Human acceptance remains pending.

## Agent and permissions

Installation and OAuth do not register an Agent or authorize Quest writes. Read `get_agent_link` and `list_registered_agents` first. For a dedicated connection, use owner-approved `link_agent` with an existing permitted Agent, then verify `get_current_agent_context`. Free permits two registered Agents; do not create an extra one automatically.

For shared connections, honor `allowedAgentIds`/`requiresAgentSelection`, obtain the user's exact allowed identity and pass `actingAgentId` on every read, preview and write. Never relink a shared connection to switch identities. Respect Plan/read-only/stop instructions, host approval policy and narrow previews. Progress, completion and Human acceptance are separate; Skill guidance does not guarantee autonomous execution.

## Update, stop, disconnect and remove

Review source and permissions before updating through the host's supported plugin UI. Stop the active task and revoke standing progress permission first. Disable/remove this connector under Marketplace → Your plugins; disconnect host OAuth and revoke Guilduo authorization when needed. The exact UI and effective-session behavior remain Grok native acceptance gates. Preserve other plugins, settings and Agents.

## Distribution and evidence

[Cursor's reference](https://cursor.com/docs/reference/plugins) supports root Agent Plugins manifests and monorepo catalogs. Submit the existing public repository through [Cursor Publish](https://cursor.com/marketplace/publish) for manual review. Its tested-locally requirement remains on hold until true host testing; this catalog is not a submission or listing.

See the [Grok/Muse acceptance record](https://github.com/ELRdn/Guilduo/blob/main/docs/acceptance/guilduo-next-hosts-grok-muse.md) for current validation/publication gates and [Guilduo Docs](https://guilduo.com/docs/en/) for account/Quest workflows.
