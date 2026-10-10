# Guilduo for OpenCode

Beta.15 renames the Skill from `questforge-workflows` to `guilduo-workflows`. Update the plugin and restart the host; replace any separately installed legacy Skill to avoid duplicate discovery. OAuth, MCP and plugin IDs stay unchanged. [Migration](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-workflows-migration.md). Beta.14 evidence describes the previous version.

[日本語](README.jp.md)

Candidate `@guilduo/opencode-plugin@0.6.0-beta.16`, targeting OpenCode Plugin SDK `1.18.32`. Windows is the priority platform. Current publication and acceptance status: [release status](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-host-extensions-status.md).

The plugin adds the canonical `guilduo-workflows` Skill, the official OAuth Remote MCP, and phase-sync guidance during existing requests. Existing MCP aliases, disabled/conflicting settings, Skill paths and commands are preserved. OAuth and token storage belong to OpenCode; the plugin has no credential store or direct progress-update client.

## Install the candidate

Build the archive in your Guilduo source checkout, or obtain the candidate archive from the release owner:

```powershell
npm --prefix plugins/guilduo-opencode run pack:plugin
```

The archive is `plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.16.tgz`. In the consuming project, replace the archive placeholder below with its actual absolute path. Install into the dedicated `.opencode/guilduo` directory: npm `--no-save` can prune unrelated unsaved packages when pointed at a shared prefix, so do not use shared `.opencode` as the npm prefix.

```powershell
npm install --prefix .opencode/guilduo "<absolute-path-to-guilduo-opencode-plugin-0.6.0-beta.16.tgz>" --ignore-scripts --no-package-lock --no-save
node --input-type=module -e "import {pathToFileURL} from 'node:url'; import {resolve} from 'node:path'; console.log(pathToFileURL(resolve('.opencode/guilduo/node_modules/@guilduo/opencode-plugin/lib/index.js')).href)"
```

Copy the generated absolute file URL into your existing `opencode.json` `plugin` array, preserving other entries. For example (replace the project path):

```json
{
  "plugin": ["file:///D:/your-project/.opencode/guilduo/node_modules/@guilduo/opencode-plugin/lib/index.js"]
}
```

For a registry release, use the pinned entry: `"@guilduo/opencode-plugin@0.6.0-beta.16"`. Check the release status before choosing registry or local archive installation. Exit every OpenCode process using the installation, then restart after changing plugins. The package supplies compiled code and Skills, so consumer installation does not need a build script. Use native config, CLI and command discovery; this SDK does not support a plugin TUI/settings panel.

The config hook registers `mcp.guilduo` at `https://mcp.guilduo.com/mcp` unless an official-endpoint alias or an occupied `guilduo` key already exists. Authenticate through native OpenCode:

```powershell
opencode mcp list
opencode mcp auth guilduo
opencode mcp auth list
```

Use your existing alias instead of `guilduo` when applicable. A disabled or conflicting user entry is not overwritten. Installing/authenticating grants no permission to write to a Quest. Free still allows two registered Agents; this integration does not register another Agent automatically.

After OAuth, establish the Agent association before reading context or a Quest:

1. Call native MCP `get_agent_link` first. Confirm whether this connection is already linked to the intended Agent; use `list_registered_agents` if you need to identify an existing allowed Agent. Never infer the Agent ID from its display name or the client name.
2. For an unlinked dedicated connection, obtain the owner's explicit approval, then call `link_agent({ agentId: "<existing-owner-approved-Agent-ID>" })`. This associates an existing Agent; it does not register one. Preserve an already correct link. Do not use `link_agent` to switch a shared connection between Agents or clients.
3. Read `get_current_agent_context` and the exact `get_quest`. Verify the returned Agent ID and Quest ID match the approved pair. If context reports `requiresAgentSelection`, use the owner-approved ID from `allowedAgentIds` as `actingAgentId` on every execution call, including reads, and verify it against the live context. Follow the live tool schema; an unlinked-client validation error is not proof that an argument is unsupported.
4. Only after these checks, explicitly authorize continuing progress updates for that exact pair. OAuth, linking and installation do not grant that task permission or enable phaseSync.

## Check version, update and roll back

From your consuming project, inspect both versions without a model request:

```powershell
opencode --version
node -p "require('./.opencode/guilduo/node_modules/@guilduo/opencode-plugin/package.json').version"
opencode mcp list
opencode mcp auth list
```

`opencode --version` reports the host version, not the extension. A package check confirms installed bytes; restart before treating them as the loaded version. Native `opencode debug skill` lists the bundled Skill. If it is missing, check the plugin file URL and restart. If MCP is disabled, OAuth is disabled, or the `guilduo` name belongs to another endpoint, review your own MCP settings; this plugin preserves them.

To update, exit OpenCode, keep your current config and previous archive, and run the beta.16 install command above over the same dedicated `.opencode/guilduo` installation. Retain the file URL and other entries, restart, then repeat the checks. If previously installed into shared `.opencode`, install into the dedicated directory and change only this plugin's file URL; leave shared packages untouched. No new OAuth login is expected while the native grant remains valid; expired/revoked grants require native authentication. OAuth does not authorize Quest writes.

To roll back, exit OpenCode and install the retained previous archive:

```powershell
npm install --prefix .opencode/guilduo "<absolute-path-to-retained-guilduo-opencode-plugin-0.6.0-beta.11.tgz>" --ignore-scripts --no-package-lock --no-save
```

Restart and confirm `0.6.0-beta.11` with the package check. beta.11 predates these alias and command fixes: remove `phaseSync` or set it to `false` before rollback. These operations do not require removing host data, history or native OAuth grants.

## Optional finite phase check

Default installation starts no additional model request. It supplies Skill and system guidance during requests you already make; guidance does not guarantee a tool call.

For an already authorized exact Quest/Agent pair, native tuple options can opt one specific **existing build session** into at most one extra check per original user message:

```json
{
  "plugin": [["file:///D:/your-project/.opencode/guilduo/node_modules/@guilduo/opencode-plugin/lib/index.js", {
    "phaseSync": {
      "sessionId": "ses-your-existing-session",
      "questId": "your-quest-id",
      "actingAgentId": "your-registered-agent-id",
      "cwd": "D:\\your-project"
    }
  }]]
}
```

Use the exact session ID and canonical directory as resolved by the host, including casing. Do not copy a binding to another conversation or fork. This opt-in starts an additional model request after a matching completed `stop` assistant message and native idle event; it can incur provider cost. The reminder only asks the agent to recheck permission, fresh context and Quest, use a narrow `expectedUpdatedAt` patch if something changed, and verify by reading back. It never updates MCP directly. Host permission confirmations remain authoritative.

Plan/read-only, errors, compaction, mismatched cwd/identity, forks, disabled MCP and synthetic inputs do not trigger continuation. The write fence follows native sanitized official MCP aliases, including per-message tool disables. Failed or ambiguous delivery is not retried.

`/guilduo-sync-off` appears in native command discovery only with a binding and an unoccupied command name. It clears only that bound session's reminder binding until plugin reload. Existing user commands are preserved and never intercepted. A custom slash command submits a prompt: this hook does **not** abort a model request or guarantee a cost-free stop, and use from another session does not stop the bound session. To stop current inference, use the host's native interrupt/abort. To stop reminders without submitting a prompt, exit OpenCode, remove `phaseSync` or set it to `false`, and restart. Revoke standing task permission separately. Ordinary-language revocation must be respected by the agent; the plugin does not parse conversation history.

## Disconnect and remove

Use the configured alias in these native CLI commands:

```powershell
opencode mcp logout guilduo
opencode mcp auth list
```

Logout clears that alias's host-stored grant, not server-side authorization or task permission. For permanent disconnection, remove/disable `phaseSync` and keep an explicit official MCP entry with `enabled: false` (otherwise the plugin adds its default on reload). Use Guilduo's connection management for server-side revocation.

To uninstall, exit OpenCode, remove only this plugin's string/tuple from `opencode.json` and any separately installed Guilduo loader file, then remove the package:

```powershell
npm uninstall --prefix .opencode/guilduo @guilduo/opencode-plugin --ignore-scripts --no-package-lock --no-save
```

Restart: the bundled Skill and plugin-owned command should disappear. Explicit MCP entries and native grants survive removal; logout separately if desired. Keep other plugins, Skills, config, host data and history. If using the older shared-prefix installation, remove the loader entry and leave the dormant shared package in place; do not run npm uninstall against shared `.opencode`. There is no supported `opencode plugin uninstall` command in the checked hosts.

## Development and validation

Dependencies are isolated from the root application:

```powershell
npm --prefix plugins/guilduo-opencode install --ignore-scripts --no-package-lock --no-audit --no-fund
npm --prefix plugins/guilduo-opencode test
npm --prefix plugins/guilduo-opencode run test:types
npm --prefix plugins/guilduo-opencode run pack:plugin
```

Unit tests cover configuration preservation, exact binding, finite reminders, cancellation races, fork/read-only/error boundaries and no default continuation. Native loading/discovery evidence belongs in [the acceptance record](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-opencode-native-evidence.md). Public OAuth, actual progress updates and Human request → Web answer → resume remain separate live acceptance gates. The inference-free native suite uses synthetic credentials only. The explicit paid acceptance driver uses only OpenCode Go DeepSeek V4.1 Flash and a synthetic loopback MCP; it does not prove public OAuth, public Quest writes or Human relay.

AGPL-3.0-only. The canonical Skill is now named `guilduo-workflows`.

Explicit real-model acceptance from a source checkout (requires native host and prior authorization for provider cost):

```powershell
node plugins/guilduo-opencode/tests/native-model.mjs "<beta.16-tgz>" "<opencode.exe>" "<pinned-host-version>" "<native-auth.json>" --accept-model-cost
```

Each case has a 120-second deadline, abort and owned-host cleanup, with no model fallback or automatic case retries. Only the selected native `opencode-go` API entry is read into memory and passed through the host's native environment variable; no credential is copied into config or receipts. For a new project, first create its native session with phaseSync OFF; then fully stop the host, set the exact session/canonical cwd tuple and restart. Bindings never automatically follow new sessions or forks.
