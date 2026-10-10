# Guilduo Workflows for Muse Code

[日本語](README.jp.md) · **0.6.0-beta.12** · AGPL-3.0-only

Native `.muse-plugin/plugin.json` bundle with the canonical `skills/guilduo-workflows/` Skill. Windows baseline: stable **1.4.4-R5419.1**. No hooks or packaged MCP server; no native settings changes or credential copies. Authenticated MCP uses a separate native user setting.

## Install and discover

From the [Guilduo repository](https://github.com/ELRdn/Guilduo), validate and install the directory. Extract the ZIP first; retain that local source directory for updates.

```powershell
muse --version
muse plugins validate ./plugins/guilduo-muse --json
muse plugins install ./plugins/guilduo-muse --json
muse plugins inspect guilduo-workflows --json
muse skills list --source plugin --json
```

Discovery ID: `plugin:guilduo-workflows:guilduo-workflows`. Local installation/discovery needs no provider login, subscription or model call. Review source and preserve unrelated plugins/settings.

## Configure and authenticate MCP separately

Merge only `mcpServers.questforge` from [settings.example.json](settings.example.json) into native user `settings.json`, preserving other entries and `schema_version:1`. The controlled profile uses `$XDG_CONFIG_HOME/muse/settings.json`. Latest Windows CLI recognizes either spelling separately; this example follows native OAuth help with `mcpServers`. Do not combine it with the `mcp_servers` alias. Use `mode:"optional"`, not `all`.

```powershell
muse mcp login questforge
# If browser opening is unavailable:
muse mcp login questforge --headless
```

Authorize your own Guilduo account through native browser/PKCE consent. Headless input is the final redirect URL; keep it out of logs, messages and archives. Native Muse owns OAuth storage/refresh, with no environment token or custom bridge. This command is separate from paid model use; do not add billing or call a model to validate installation. Connected MCP operations and model/Human workflows require separate acceptance.

Installation/OAuth do not register an Agent or grant Quest-write permission. Read `get_agent_link` and `list_registered_agents` first. For a dedicated connection, use owner-approved `link_agent` with an existing permitted Agent, then verify `get_current_agent_context`. Free allows two registered Agents. On shared connections, honor `allowedAgentIds`/`requiresAgentSelection`, obtain the exact allowed identity and pass `actingAgentId` on every read, preview and write. Never relink a shared connection to switch identities.

## Update, stop, disconnect and remove

```powershell
# Review changes in the same local source directory before updating:
muse plugins update guilduo-workflows --json
muse plugins disable guilduo-workflows --json
# Explicitly enable again when wanted:
muse plugins enable guilduo-workflows --json
# Native OAuth is independent of the plugin:
muse mcp logout questforge
muse plugins remove guilduo-workflows --delete-data --json
```

Stop the task and revoke standing progress permission first. Plugin changes apply to future loads; restart a session to observe the new Skill state. To disconnect fully, disable/remove only this MCP user entry and preserve other settings. Revoke server authorization separately when needed. Plugin removal does not delete its independent MCP setting or Guilduo Agents/Quests.

Skill guidance respects Plan/read-only/stop instructions and separates progress, completion and Human acceptance. It is not a lifecycle guarantee. Preserve host confirmation policy and preview narrow authorized writes before saving.

## Distribution and evidence

The existing repository directory and extracted ZIP are local-source candidates. Native Muse supports custom marketplace sources; its [SDK marketplace guide](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/marketplaces-and-updates/) is Developer Preview, not a central official listing. No new mirror repository is needed.

See the [acceptance record](https://github.com/ELRdn/Guilduo/blob/main/docs/acceptance/guilduo-next-hosts-grok-muse.md), [official extending guidance](https://dev.meta.ai/docs/muse-code/extending), [native plugin CLI](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/) and [Guilduo Docs](https://guilduo.com/docs/en/).
