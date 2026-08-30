# QuestForge MCP client setup

QuestForge app version `0.5.0-beta.1` uses REST/MCP contract `2.7.0` with Schema `7` and 51 tools.

Set `QUESTFORGE_MCP_URL` to the deployed Worker `/mcp` URL and `QUESTFORGE_TOKEN` to a development token. Production remote clients should use OAuth instead of a static token.

## Codex / ChatGPT desktop

```toml
[mcp_servers.questforge]
command = "npx"
args = ["tsx", "<absolute-path-to-questforge>/mcp-local/questforge-mcp.ts"]
env_vars = ["QUESTFORGE_MCP_URL", "QUESTFORGE_TOKEN"]
default_tools_approval_mode = "writes"
```

Remote configuration（正規MCP URL）:

```toml
[mcp_servers.questforge]
url = "https://mcp.guilduo.com/mcp"
auth = "oauth"
default_tools_approval_mode = "writes"
```

## Claude Desktop

```json
{
  "mcpServers": {
    "questforge": {
      "command": "npx",
      "args": ["tsx", "<absolute-path-to-questforge>/mcp-local/questforge-mcp.ts"],
      "env": {
        "QUESTFORGE_MCP_URL": "https://mcp.guilduo.com/mcp",
        "QUESTFORGE_TOKEN": "development-token-only"
      }
    }
  }
}
```

Claude web/mobile uses the deployed `/mcp` URL from Settings > Connectors with OAuth.

## Gemini CLI

```bash
gemini mcp add --transport http questforge https://mcp.guilduo.com/mcp
```

## GitHub Copilot CLI

```bash
copilot mcp add --transport http questforge https://mcp.guilduo.com/mcp
```

## QuestForge CLI

The REST CLI is separate from the stdio MCP bridge. Use it for human or CI workflows:

```bash
QUESTFORGE_API_URL=https://mcp.guilduo.com \
  QUESTFORGE_TOKEN=development-token-only \
  npm run cli -- quests list --view today --json
```

For writes, add `--execute`. For a safer token handoff, use `--token-stdin` instead of putting the token in shell history.
The current Worker exposes REST `/v1` and MCP `/mcp` on the same `mcp.guilduo.com` origin. Do not use `api.guilduo.com` for these routes; that hostname is reserved for the Appwrite API.

## OpenClaw / Hermes handoff

Both clients should use the same OAuth Remote HTTP endpoint and the same least-privilege scopes. Register:

```text
https://mcp.guilduo.com/mcp
```

Recommended first tools: `get_daily_brief`, `list_quests`, `get_quest_tree`, `list_registered_agents`, `get_current_agent_context`, `list_agent_handoffs`. Keep batch writes, scoring, archives, and Agent assignments behind dry-run and explicit confirmation. Dedicated recipes are kept on the public roadmap until the external OAuth release gate is complete.

## OpenAI Plugin / MCP App handoff

The repository package at `plugins/questforge/` contains the bundled Skill, `.mcp.json`, `.app.json.example`, and submission checklist. Fill the technical App ID only in the dashboard handoff file after creating the remote MCP App. Never commit OAuth client secrets or user tokens.
