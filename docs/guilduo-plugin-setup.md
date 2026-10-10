# Guilduo Skill and MCP setup

## Published host plugins

DSH, OpenCode and OpenClaw plugins are published and entering the polish phase. Normal npm installation uses `latest`; pinned versions remain available for reproducible installation. All three retain their prerelease version numbers. Installing a plugin does not start a model, authorize Quest writes or register an Agent.

| Host | Recommended package (`latest`) | Official guide |
| --- | --- | --- |
| DSH 0.2.0-rc.2 / Windows | `@guilduo/dsh-oauth-poc@0.6.0-beta.17` | [English](https://guilduo.com/docs/en/dsh/) / [日本語](https://guilduo.com/docs/dsh/) |
| OpenCode 1.18.32 / 1.18.35 / Windows | `@guilduo/opencode-plugin@0.6.0-beta.16` | [English](https://guilduo.com/docs/en/opencode/) / [日本語](https://guilduo.com/docs/opencode/) |
| OpenClaw 2026.9.9 / Windows | `@guilduo/openclaw-plugin@0.6.0-beta.16` | [English](https://guilduo.com/docs/en/openclaw/) / [日本語](https://guilduo.com/docs/openclaw/) |

Use these guides for native installation, OAuth, updates, disconnection and removal. [Completion assessments](guilduo-plugins-completion.md) distinguish accepted workflows from remaining checks and upstream directory review. The Codex companion/direct MCP instructions and historical package-preparation records below are separate installation paths, not prerequisites for these three hosts.

## Available approaches

| Approach | Use | Remaining user action |
| --- | --- | --- |
| Desktop companion plugin | Bundle the Workflow Skill with an already registered Guilduo App; reuse its OAuth connection | Refresh the App metadata, restart the desktop app, and test in a new chat |
| Direct MCP plugin | Bundle the same Skill with `https://mcp.guilduo.com/mcp` for Codex CLI or another local host | Complete OAuth in the intended account |
| Standalone Skill | Install `skills/questforge-workflows/` in a host that already has the MCP connection | Configure that host's Skill discovery; MCP alone does not load the Skill |
| Public plugin | Submit the combined package to the universal directory | Complete real-account acceptance and operator submission/review |

The desktop companion is the recommended local path. It adds instructions to the current Guilduo
connection without replacing the old QuestForge App. Do not install both connection modes at once
or use an old QuestForge App ID just because the repository still has legacy technical names.

## Prepare and install locally

Run from this repository. App IDs are identifiers, not credentials; never paste an OAuth token.
Copy the ID from your registered **Guilduo** connection. Supported installed metadata may use
`asdk_app_...` or `plugin_asdk_app_...`.

```powershell
npx tsx tools/prepare-guilduo-plugin.mts --app-id YOUR_REGISTERED_GUILDUO_APP_ID
codex plugin marketplace add .qa-artifacts/guilduo-plugin
codex plugin add guilduo-workflows@guilduo-local
codex plugin list --marketplace guilduo-local --json
```

The generator creates a local marketplace and package under `.qa-artifacts/guilduo-plugin/`.
Its manifest references **only** the registered App, while bundling the current Skill, references,
and `agents/openai.yaml`. The source template and its placeholder App ID are never installed.
The generated files and your App ID are ignored by Git. Re-run these commands after a Skill update;
keep the generated directory available while the local marketplace is registered.

For direct MCP instead of a registered desktop App, omit `--app-id`. The generated manifest then
references only `.mcp.json`; complete OAuth separately in that host. This is an alternative, not an
extra connection required for the desktop App.

## Refresh the two Human relay tools

1. Open **ChatGPT Plugins** and the existing developer-mode **Guilduo** connection.
2. Select **Refresh** on the connection. In versions that show Apps, open the corresponding App
   connection settings. This operation refreshes MCP metadata; it does not require widening Agent scopes.
3. Confirm `request_human_review` and `list_human_requests` appear in the discovered tool list.
4. Restart the desktop app after installing/updating the local companion, and start a **new chat**.
5. Enable **Guilduo Workflows** and ask:

   > Use $guilduo-workflows:questforge-workflows. Read my Guilduo connection and Agent context without writing.
   > Confirm the Skill is loaded and request_human_review and list_human_requests are available.

6. Confirm the host's loaded Skill list includes `guilduo-workflows:questforge-workflows` and the read uses the current
   Guilduo account. Then perform a separately authorized Human review round: request → web answer →
   read saved feedback → resume. Reading tool names alone does not accept that full workflow.

If Refresh is absent or errors, record the error and the discovered tools. Do not delete the working
connection or create a duplicate until the endpoint and metadata can be checked. A published plugin
uses continuous review for tool changes; imported Skill changes still require a new version/review.

## Diagnosis recorded on 2026-10-02

- Initially, production `/health` reported 56 tools while this chat exposed 54, missing the two Human
  relay tools. The server's `tools/list` returns the complete `MCP_TOOLS` array without filtering by
  Agent scopes. A stale imported tool catalogue was the leading explanation; the exact cause was not
  established. Health alone is not an authenticated tool-list check.
- Follow-up: the user reported a successful read-only `list_human_requests` call (0 requests) and
  discovery of the `request_human_review` schema. This connection now also exposes all 56 tools,
  including both Human tools, and `list_human_requests(status=all)` returned 0 requests successfully.
  The missing-tool issue is resolved. Request creation permissions, web answers, feedback retrieval,
  and Agent resumption remain untested; neither check created a Human confirmation Quest.
- The installed App-only Guilduo package has no Skill declaration or Skill directory.
- An older personal `questforge` package points at a different App. It is left intact.
- Canonical and bundled Workflow Skills contain the Human review recipe. The companion preparation
  adds a valid local marketplace and exactly one connection, and rejects malformed App IDs.
- Package tests and host discovery verify packaging/installation. A running conversation cannot gain
  newly installed tools or skills just because files were copied; confirm loading in a new chat.
- Local install is enabled at `guilduo-workflows@guilduo-local`. Codex host `skills/list` discovers
  `guilduo-workflows:questforge-workflows` with `enabled: true`, its installed Skill path, and no errors.
  The installed Skill hash matches the canonical file. This is host discovery, not a Human relay
  acceptance result or proof that an already running chat loaded the new Skill.

## Official OpenAI documentation

- [Build and install local plugins](https://developers.openai.com/plugins/build/plugins)
- [Refresh metadata and test the complete plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Use plugins in Codex](https://developers.openai.com/codex/plugins/)

Local installation is not public-directory publication or approval. Keep LP-R07 open until the actual
client, OAuth account, Human answer and resume flow have been accepted.
