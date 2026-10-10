# Guilduo for OpenClaw

Beta.16 retains the minimal native entry and hardens package staging. Beta.15 renamed the Skill from `questforge-workflows` to `guilduo-workflows`. Update the plugin and restart the host; replace any separately installed legacy Skill to avoid duplicate discovery. OAuth, MCP and plugin IDs stay unchanged. [Documentation](https://guilduo.com/docs/en/).

[Release and acceptance status](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-host-extensions-status.md) · [日本語](README.jp.md) · [Guilduo](https://guilduo.com/) · [Web App](https://app.guilduo.com/)

`@guilduo/openclaw-plugin@0.6.0-beta.16` targets OpenClaw **2026.9.9**, commit `bcfc88812a35243893585dbeca87ca41b48272ca`. Use Node `>=24.16.0 <25 || >=26.1.0`, matching that host. This package supplies the canonical Guilduo workflow Skill and a native Streamable HTTP OAuth declaration. OpenClaw owns sign-in, credentials and connection UI. Installation starts no model request and grants no Quest write permission.

## Install and connect

Obtain the reviewed archive from its builder. With OpenClaw already installed, run these two native commands:

```powershell
openclaw plugins install ./guilduo-openclaw-plugin-0.6.0-beta.16.tgz
openclaw mcp add guilduo --url https://mcp.guilduo.com/mcp --transport streamable-http --auth oauth --no-probe
```

If you already configured Guilduo, inspect **Settings → MCP** first and keep your existing alias, enablement and filters. Native `mcp add` refuses an occupied `guilduo` name. It does not check for another alias using the same URL. For automatic alias preservation, run `node setup.mjs` from the unpacked package instead of the second command; it uses OpenClaw on PATH, inspects the native registry, adds only an absent entry and leaves existing settings intact. Resolve conflicts explicitly in Settings. Stop other config writers while setting up; native create-only insertion guards the target name, but cross-name alias changes are not one transaction.

The root manifest alone does **not** create a saved `mcp.servers` entry. For the plugin **Accounts** section, the active declaration and saved config must have the same **name `guilduo` and URL `https://mcp.guilduo.com/mcp`**, with `transport: "streamable-http"` and shared `auth: "oauth"`. Alternate aliases remain usable through Settings and CLI; Accounts does not match them. Disabled entries, per-requester OAuth and auth-profile bindings require their own native setup and are preserved by the helper.

In the connected administrator Control UI:

1. Open **Settings → MCP**, find `guilduo`, and select **Sign in**. Approve Guilduo in the browser.
2. Alternatively, open the installed Guilduo plugin and choose **Accounts → Connect**. After saved authorization, it shows **Connected**; **Edit** returns to MCP settings.
3. If the UI cannot sign in, run `openclaw mcp login guilduo`. OpenClaw prints the browser URL and handles the loopback callback. For an unreachable callback, use its printed `openclaw mcp login guilduo --code ...` fallback locally. Never paste codes or credentials into agent chat.

Use your existing alias in commands when applicable. Restart or publish the Gateway configuration if the running Gateway has not picked up CLI changes. Native `openclaw mcp reload` affects its current CLI process only.

This package covers a personal or administrator-managed instance using shared operator OAuth. **Accounts** confirms that operator connection; it does not validate separate users or channel requesters. OpenClaw's native channel permissions remain authoritative. Multi-person channel acceptance is untested; this plugin adds no requester permission policy.

## Check status and start work

```powershell
openclaw plugins inspect guilduo --runtime --json
openclaw mcp status --verbose
openclaw mcp doctor guilduo --probe
```

Saved authorization proves credential presence; the live probe proves connection and tool discovery. If authorization is required again, repeat Sign in or `mcp login`. Plugin enabled status alone proves neither.

Select an existing permitted Registry Agent in [Guilduo / Relay Forge](https://app.guilduo.com/). Check the OAuth connection with `get_agent_link` first. If unlinked or intentionally changing its Agent, obtain the owner's explicit authorization and call `link_agent` with that existing Agent's `agentId`; this requires the `agents:write` OAuth grant. Re-authorize an insufficient grant through native sign-in instead of broadening the Agent's permissions. This package does not register an Agent automatically.

After linking, read `get_current_agent_context` and the relevant Quest, sending the authorized `actingAgentId` on every applicable call. Explicitly authorize updates for the exact Quest/Agent before continuing work. Free allows two registered Agents; installing another host does not add an Agent allowance. The Skill guides previews, narrow version-checked updates and read-back verification; it does not guarantee automatic invocation or grant completion/review/reward permission.

## Update, disconnect and uninstall

For a newly reviewed local archive:

```powershell
openclaw plugins install ./guilduo-openclaw-plugin-0.6.0-beta.16.tgz --force
```

This native replacement preserves your saved MCP settings. Restart the Gateway to load the new generation. Keep the previous reviewed archive for rollback; replace with it using the same command. Do not force past a compatibility or install-policy failure.

When the release status confirms npm availability, install with `openclaw plugins install npm:@guilduo/openclaw-plugin@0.6.0-beta.16 --pin`. Future registry updates use an explicitly reviewed version: `openclaw plugins update @guilduo/openclaw-plugin@<reviewed-version>`. Local archive records do not become npm update records automatically. Check the release status before choosing a distribution source.

To disconnect and remove, use your actual alias:

```powershell
openclaw mcp logout guilduo
openclaw mcp unset guilduo
openclaw plugins uninstall guilduo
```

Logout clears host-saved credentials; unset removes the saved server; plugin uninstall removes the extension and its Skill. Plugin removal alone leaves explicit MCP config in place, so it can still reconnect. Restart the Gateway afterward. For a temporary pause, disable the server in Settings → MCP. Revoke the connection in Guilduo Web Settings separately when server-side revocation is needed. Keep unrelated aliases, plugins and data.

## Build and evidence

From the repository root, without installing dependencies:

```powershell
npm --prefix plugins/guilduo-openclaw run pack:plugin
npm --prefix plugins/guilduo-openclaw test
node plugins/guilduo-openclaw/tests/native-host.mjs plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.16.tgz <installed-openclaw.mjs>
```

Build uses Node's TypeScript stripping API; no consumer build or install hook runs. Unit tests use Node's native TypeScript support, with no root `tsx` dependency. Native tests require an already installed pinned OpenClaw and use its existing tar/semver dependencies for artifact checks. The Accounts carrier test exercises the installed native status projection; browser and public-service acceptance are recorded separately. All test homes, SQLite, npm cache and synthetic fixtures stay beneath this package's `.qa-artifacts/`. Tests never inspect the real OpenClaw profile, credentials or conversation history.

`openclaw plugins validate` is the tool/feature authoring validator: it requires metadata supplied by `defineToolPlugin`/feature helpers. It reports `plugin entry does not expose tool or feature authoring metadata: ./lib/index.js` for this `definePluginEntry` Skill/MCP package. This is recorded as an unsupported validation path, not a passing validator or publication approval. Package/manifest/SDK, native install, runtime loading, Skill discovery and OAuth gates are checked separately. Source: [OpenClaw authoring command at the audited commit](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/src/cli/plugins-authoring-command.ts), [authoring workflow](https://github.com/openclaw/openclaw/blob/bcfc88812a35243893585dbeca87ca41b48272ca/docs/cli/plugins/authoring.md).

Public [documentation](https://guilduo.com/docs/en/) covers Guilduo workflows. Builders retain exact native commands and limits in the repository file `docs/guilduo-openclaw-native-evidence.md`. Public OAuth, real Quest mutation and Human request → Web answer → Agent resumption have separate acceptance gates. AGPL-3.0-only; the canonical Skill is named `guilduo-workflows`.
