# QuestForge MCP client setup

Set `QUESTFORGE_MCP_URL` to the deployed Worker `/mcp` URL and `QUESTFORGE_TOKEN` to a development token. Production remote clients should use OAuth instead of a static token.

## Codex / ChatGPT desktop

```toml
[mcp_servers.questforge]
command = "node"
args = ["C:/Users/hiron/Documents/codex-test/questforge-prototype/mcp-local/questforge-mcp.mjs"]
env_vars = ["QUESTFORGE_MCP_URL", "QUESTFORGE_TOKEN"]
default_tools_approval_mode = "writes"
```

Remote configuration:

```toml
[mcp_servers.questforge]
url = "https://questforge-gateway.YOUR-SUBDOMAIN.workers.dev/mcp"
auth = "oauth"
default_tools_approval_mode = "writes"
```

## Claude Desktop

```json
{
  "mcpServers": {
    "questforge": {
      "command": "node",
      "args": ["C:/Users/hiron/Documents/codex-test/questforge-prototype/mcp-local/questforge-mcp.mjs"],
      "env": {
        "QUESTFORGE_MCP_URL": "https://questforge-gateway.YOUR-SUBDOMAIN.workers.dev/mcp",
        "QUESTFORGE_TOKEN": "development-token-only"
      }
    }
  }
}
```

Claude web/mobile uses the deployed `/mcp` URL from Settings > Connectors with OAuth.

## Gemini CLI

```bash
gemini mcp add --transport http questforge https://questforge-gateway.YOUR-SUBDOMAIN.workers.dev/mcp
```

## GitHub Copilot CLI

```bash
copilot mcp add --transport http questforge https://questforge-gateway.YOUR-SUBDOMAIN.workers.dev/mcp
```

