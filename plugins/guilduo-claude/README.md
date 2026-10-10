# Guilduo for Claude Code

[日本語](README.jp.md)

`guilduo@guilduo` `0.6.0-beta.1` is the Guilduo plugin for **Claude Code** (CLI, IDE extensions and the desktop app's Code tab). It is distributed through this repository's standard Claude Code plugin marketplace, not npm. It is separate from Claude Desktop Connectors and Desktop Extensions (`.mcpb`).

Its only components are:

- the official remote MCP server `https://mcp.guilduo.com/mcp`, registered as `guilduo` (shown as `plugin:guilduo:guilduo`), and
- the canonical `guilduo-workflows` Skill and its references.

It has no hooks, commands, subagents, automatic prompts or extra model requests. The Skill's optional local-hooks reference describes separate packages; it does not apply to this plugin, which has nothing to bind. Claude Code owns OAuth and token storage; the plugin has no credential store, token bridge or secret.

Installing the plugin, completing OAuth or loading the Skill grants **no** permission to change a Quest or run additional models. The Skill is selected by Claude when its description matches, or when you invoke it as `/guilduo:guilduo-workflows`; it is not guaranteed to run automatically at every phase. Free still allows two registered Agents, and this plugin never registers an Agent.

Supported host: Claude Code **2.1.286** or later (the version this release was verified on). Status: [release status](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-host-extensions-status.md).

## Install

In a Claude Code session:

```text
/plugin marketplace add ELRdn/Guilduo
/plugin install guilduo@guilduo
```

Or from your shell, where `--sparse` checks out only the marketplace and this plugin instead of the whole repository:

```powershell
claude plugin marketplace add ELRdn/Guilduo --sparse .claude-plugin plugins/guilduo-claude
claude plugin install guilduo@guilduo
```

Run `/reload-plugins` in an open session or start a new one. Your existing settings, other plugins, MCP servers, sign-ins and history are kept.

## Sign in (standard OAuth)

1. Run `/mcp`, select `plugin:guilduo:guilduo`, and follow the sign-in prompt. From a shell, `claude mcp login plugin:guilduo:guilduo` does the same.
2. Approve the connection in your browser with the Guilduo account you intend to use.

Never paste tokens, callback URLs or API keys into a chat or Quest.

If you already added `https://mcp.guilduo.com/mcp` yourself (for example with `claude mcp add`), Claude Code keeps using that connection and its sign-in, and does not start the plugin's copy. No action is needed: use your existing server name instead of `plugin:guilduo:guilduo` in the commands on this page.

## Check the connection (read-only)

```powershell
claude plugin details guilduo@guilduo
claude mcp get plugin:guilduo:guilduo
```

`details` should list the `guilduo-workflows` Skill and the `guilduo` MCP server. `mcp get` should report the server as connected after sign-in.

Then ask Claude, in a new session, to use the Skill for a **read-only** check, for example:

> Use /guilduo:guilduo-workflows. Without writing anything, call get_agent_link, list_registered_agents and get_current_agent_context, then list my Quests.

Agent identity rules:

- Use an existing Agent that you already registered and allowed in the [Guilduo Web App](https://app.guilduo.com/). A display name or client name is not an Agent ID.
- If `get_current_agent_context` reports `requiresAgentSelection`, pass your chosen ID from `allowedAgentIds` as `actingAgentId` on **every** call, including reads and previews. Never use `link_agent` to switch a shared connection between clients.
- Writes need your explicit authorization for an exact Quest and Agent. The Skill previews with `dryRun: true` where supported and uses `expectedUpdatedAt` for updates.

## Update

```powershell
claude plugin marketplace update guilduo
claude plugin update guilduo@guilduo
```

Or use the **Marketplaces** tab in `/plugin`. Auto-update is **off** by default for this marketplace, as for every third-party marketplace; you can turn it on in that tab. Run `/reload-plugins` or restart afterwards. Your OAuth sign-in is kept while it remains valid.

## Stop, disconnect and remove

| Goal | Action |
| --- | --- |
| Stop temporarily | `claude plugin disable guilduo@guilduo` (re-enable with `claude plugin enable guilduo@guilduo`) |
| Sign out in Claude Code | `/mcp` → `plugin:guilduo:guilduo` → **Clear authentication**, or `claude mcp logout plugin:guilduo:guilduo` |
| Revoke on the server | Remove the connection in the [Guilduo Web App](https://app.guilduo.com/) settings |
| Remove the plugin | `claude plugin uninstall guilduo@guilduo`, then optionally `claude plugin marketplace remove guilduo` |

Clear authentication before uninstalling if you also want the local sign-in removed. Signing out or uninstalling does not revoke the grant on the server, and none of these steps touch your Quests, other plugins or MCP servers.

## Development

The Skill is staged from the canonical `skills/guilduo-workflows/` (Codex-only `agents/openai.yaml` is excluded):

```powershell
node plugins/guilduo-claude/stage.mjs
node --test plugins/guilduo-claude/tests/package.test.mjs
claude plugin validate . --strict
claude plugin validate plugins/guilduo-claude --strict
node plugins/guilduo-claude/tests/native-host.mjs
node plugins/guilduo-claude/tests/native-host.mjs ELRdn/Guilduo#<branch>
```

`native-host.mjs` installs, inspects, updates, disables, re-enables and removes the plugin in a fresh isolated `CLAUDE_CONFIG_DIR` and checks that an unrelated MCP server and setting survive. Without an argument the plugin loads in place from a local copy; with a pushed `owner/repo#branch` it is sparse-cloned from GitHub into the plugin cache and compared byte for byte with this checkout. It performs no sign-in, MCP tool call or model request (`claude mcp list` health-checks the public endpoint without credentials).

Release: after changing the canonical Skill, run `stage.mjs` and raise `version` in `.claude-plugin/plugin.json`; installed copies only update when the version changes. CI runs `package.test.mjs`, which fails if the staged Skill drifts from the canonical one.

Docs: [guilduo.com/docs](https://guilduo.com/docs/) · Source: [github.com/ELRdn/Guilduo](https://github.com/ELRdn/Guilduo). AGPL-3.0-only.
