# Guilduo for DSH: How-to

[日本語](guilduo-dsh-howto.jp.md) · [Guilduo README](../README.md) · [npm](https://www.npmjs.com/package/@guilduo/dsh-oauth-poc)

Connect DeepSeek Harness to [Guilduo](https://guilduo.com/) through its native Settings UI. The plugin supplies OAuth-backed MCP tools and the `guilduo-workflows` Skill; you do not need to paste a token or build from source.

## Requirements

- Windows; tested with **DSH 0.2.0-rc.2** and Cordis **4.0.4**. Other operating systems and DSH releases have not been accepted.
- An existing local DSH Web profile, or the Desktop app's native plugin manager.
- A Guilduo account. Use the Web client on the same computer as the DSH host, through localhost or a numeric loopback address; the browser OAuth callback is local.

## 1. Install or update

Stop old Web/Desktop hosts sharing the same DSH storage before updating. For an existing Web profile named `web`:

```powershell
dsh plugin --profile web add @guilduo/dsh-oauth-poc@0.6.0-beta.16 --ignore-scripts
```

Replace `web` with your actual Web profile name. On October 10, 2026, both `@latest` and `@beta` resolve to this version; the explicit version above makes the installation reproducible. Update each participating profile before restarting its host, then reload the browser.

For **Desktop**, add/update `@guilduo/dsh-oauth-poc` version `0.6.0-beta.16` in its native plugin manager. The npm DSH CLI refuses the reserved `desktop` profile. Web and Desktop have separate plugin installations. Standard bundle installation activates the plugin; do not also add a manual Cordis overlay.

## 2. Connect from Settings

1. Open an ordinary DSH conversation, then **Settings → Guilduo**.
2. Select **接続** (Connect), then **ブラウザーで認証** (Authorize in browser).
3. Sign in and approve access on the Guilduo OAuth page. Keep the original conversation and Settings open until it reports **接続済み** (Connected).
4. If an older valid connection is marked **この会話のみ** (this conversation only), open its **original conversation** and select **全会話で使う** once. An already erased grant needs an explicit login again.

New connections are shared by eligible ordinary conversations and top-level forks under the same Windows user and `DSH_HOME`, including updated Web/Desktop profiles. Subagents, runtime children and independently seeded sessions do not inherit the connection. Protected authentication uses Windows CurrentUser DPAPI; this protects stored credentials, not access by other code running as that Windows user.

The endpoint is `https://mcp.guilduo.com/mcp`; the plugin configures it. Installing or loading the plugin does not start OAuth or a model automatically.

## 3. Check the connection and start work

Ask DSH: **“Check the Guilduo MCP connection read-only with get_agent_link and get_current_agent_context. Do not create, update or delete anything.”** Successful responses confirm a live connection. Do not paste OAuth callbacks or credential files into a conversation or issue.

To work on a Quest, name the target and what changes you authorize. Sharing login does not grant standing Quest-write permission. Link an existing Registry Agent through Guilduo's connection settings when the workflow requires one; the DSH runtime Agent and Guilduo Registry Agent are different identities. Do not create an Agent per conversation or host; Free remains **2 registered Agents**.

The Skill guides phase updates under the user's permission. This DSH release does not install a Stop hook or guarantee an update at every phase ending.

## 4. Disconnect or remove

Select **切断** in Settings → Guilduo first. For a shared connection, this disconnects **all eligible conversations and Web/Desktop profiles in that DSH_HOME**. Server-side revocation is a separate action in [Guilduo / Relay Forge](https://app.guilduo.com/).

Stop the host, then remove the plugin from the Web profile:

```powershell
dsh plugin --profile web remove @guilduo/dsh-oauth-poc
```

Desktop removal uses its native plugin manager. Removing the plugin alone is not logout: completed authentication is deliberately retained on unload. Disconnect before deleting an old unshared source conversation if you want its protected grant cleared.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| No Guilduo Settings section | Confirm the package is installed in the profile you launched; restart that host and reload the browser. |
| Browser authorization cannot return | Use a browser on the host computer via localhost/loopback; a LAN or remote browser is unsupported. Retry explicitly if the flow expires. |
| Connected in one old conversation only | Use **全会話で使う** in that original conversation. No automatic migration searches other credentials. |
| OAuth works but no tools appear | Check the target conversation is eligible, and use the read-only check above. If discovery fails or the catalog changes, restart the host and check Settings. |
| Reauthorization required after an older upgrade | An erased grant cannot be recovered; connect explicitly once with beta.16. |
| Handoff reports a missing Agent | Check the Guilduo Registry Agent link and its allowed scopes; OAuth alone does not establish that link. |

Report problems at [GitHub Issues](https://github.com/ELRdn/Guilduo/issues) with the DSH/plugin version, Web or Desktop, and reproducible steps. Exclude tokens, callback URLs, credential files and private Quest/conversation contents.

## Release status

**0.6.0-beta.16** is published as both `latest` and `beta`, with public archive bytes verified. Local package, native lifecycle, synthetic OAuth/Settings and isolated CLI checks passed. On October 10, 2026, the user reported successful public OAuth, MCP discovery, real MCP reads/writes and Desktop saved authentication reuse after restart. After waiting roughly 1–2 minutes, opening Settings showed Connected without reauthorization. This does not establish whether restoration occurred before opening Settings. Settings-free first-input/new-session/fork use, guarded-update readback/conflicts, Registry Agent linking/Handoff and Human answer → resume remain pending. No Registry Agent is linked yet; beta.14's historical grant-loss cause is unproven.

Additional feature development is paused at this beta stopping point. See the [current release/acceptance status](guilduo-dsh-status.md). GitHub source documentation is maintained; the published npm archive and its captured README are unchanged. Updating npm's displayed README requires a new version; no new version is published by this documentation pass. License: [AGPL-3.0-only](../LICENSE).
