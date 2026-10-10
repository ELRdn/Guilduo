# Guilduo for DeepSeek Harness

[日本語How-to](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-dsh-howto.jp.md) · [English How-to](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-dsh-howto.md) · [npm](https://www.npmjs.com/package/@guilduo/dsh-oauth-poc)

**Published beta: 0.6.0-beta.16.** Both npm `latest` and `beta` resolve to this version as of October 10, 2026. This Windows plugin adds **Settings → Guilduo**, OAuth-backed MCP tools and the **guilduo-workflows** Skill. Target: DSH **0.2.0-rc.2**, Cordis **4.0.4**, MCP client **2.0.0**. License: **AGPL-3.0-only**.

## Install with the standard DSH command

Stop old Web/Desktop hosts sharing the same DSH storage before installing or updating. For an existing Web profile named `web`:

```powershell
dsh plugin --profile web add @guilduo/dsh-oauth-poc@0.6.0-beta.16 --ignore-scripts
```

Replace `web` with your profile name. Restart the host and reload the browser. **Desktop uses its native plugin manager** with the same package/version; the CLI refuses the reserved `desktop` profile. Update every participating profile. Use standard bundle activation without adding a second manual Cordis overlay. Consumer installation requires no build, tokens or source checkout.

## Connect from Settings (Web and Desktop)

1. Open an ordinary conversation → **Settings → Guilduo**.
2. Choose **接続 → ブラウザーで認証**, approve in the browser, and keep Settings open until **接続済み**.
3. For an older exact-session grant, use **全会話で使う** once in its original conversation. An erased grant requires explicit login again.

Use the browser on the same computer as the host via localhost/loopback. The plugin configures `https://mcp.guilduo.com/mcp`. New authentication is shared across eligible ordinary/new conversations and root forks for the same Windows user/`DSH_HOME`, including updated Web/Desktop profiles. Subagents, children and independent seeded sessions do not inherit it. Loading never initiates OAuth or inference.

Ask DSH to check `get_agent_link` and `get_current_agent_context` read-only before working on a Quest. OAuth sharing does not grant standing Quest-write permission. Link an existing Guilduo Registry Agent when the workflow requires one; Free remains **2 registered Agents**. No Stop hook or guaranteed phase-end update is installed.

## Disconnect, update or remove

Use **Settings → Guilduo → 切断** before removal. A shared Disconnect affects all eligible conversations and Web/Desktop profiles in that `DSH_HOME`. Server revocation is separate in [Guilduo / Relay Forge](https://app.guilduo.com/). Unloading/removing the plugin preserves completed authentication; it is not logout.

After stopping the host:

```powershell
dsh plugin --profile web remove @guilduo/dsh-oauth-poc
```

Desktop removal uses its native plugin manager. For updates, stop participating hosts, rerun the versioned add command, then restart/reload. See the linked How-to for troubleshooting.

## Release and acceptance

Public OAuth, real MCP reads/writes and Desktop saved authentication reuse after restart are **user-confirmed**. The user opened Settings roughly 1–2 minutes after restarting and observed Connected without reauthorization; this does not establish restoration before Settings opened. Settings-free first model input/new-session/fork use, guarded readback/conflicts, Registry Agent Handoff and Human answer → resume remain pending. Agent linking is not yet done.

Local release checks: 80 package tests, 2 root tests, build/type checks; native synthetic lifecycle/shared authentication, browser/Settings and isolated CLI checks. Independent AI review found no substantiated major implementation defect in its scope. **Additional feature development is paused at this beta stopping point.** See [current status and evidence limits](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-dsh-status.md).

The published beta.16 tarball is immutable. This source README is a postrelease documentation update and intentionally differs from the packaged prepublication README. Changing it does not update npm's displayed README; that needs a new version. Do not republish or overwrite beta.16. Historical beta.14 grant loss remains unproven.

## Build and inspect from the Guilduo source checkout

From this package directory:

```powershell
npm install --ignore-scripts --no-package-lock --no-audit --no-fund
npm test
npm run test:types
npm run build
```

Dependencies stay in this package; no root lockfile or provider/profile configuration change is needed. `stage.mjs` copies the canonical `skills/guilduo-workflows/` and root AGPL license. Any future repack/publication needs a new package version and new archive checks. Never run `pack:poc` to replace the frozen beta.16 archive.

## Explicit host integration

The entry exports `apply`, `inject = ['tools', 'skills', 'credentials', 'agents', 'sessions', 'sessionController']` and supplies **`ctx.guilduoDshOAuth`** to trusted same-process host UI code. Loading may restore an existing authorized grant within the 15-second network bound; it never initiates OAuth or inference. The canonical `guilduo-workflows` Skill is registered, with its packaged directory as `resourceBase`. OAuth controls are **not model-facing tools**.

After the user chooses login in a host UI, pass its exact live `agent.id`, a callback URI owned by that UI and an explicit URL-opening callback:

```ts
await ctx.guilduoDshOAuth.begin(
  agent.id,
  hostUi.callbackUrl, // HTTPS, or http://127.0.0.1:<explicit-port>/callback
  (url) => hostUi.openExternal(url.href),
);
// The host owns a callback listener and routes the callback to this SAME session.
await ctx.guilduoDshOAuth.finish(agent.id, hostUi.receivedCallbackUrl);
// On explicit logout/revocation:
await ctx.guilduoDshOAuth.logout(agent.id);
```

`hostUi` above is a low-level integration example. The Settings section provides the native human action and loopback callback; its deliberate browser link uses the host shell's normal external-link handling. The authenticated Settings `guilduo/share` RPC invokes `share` for the selected original conversation; it is not a model tool. Do not paste callback URLs into model conversations or persist/log their codes. Root forks are eligible for the shared connection; subagent, runtime-child and independently seeded Sessions are refused.

The SDK handles discovery, DCR, PKCE, resource binding and refresh. The provider additionally validates callback location, random state, unique code/state and exact `https://mcp.guilduo.com/mcp` resource. Only successfully admitted grants, minimal client registration fields and SDK discovery metadata become durable. Pending state, PKCE verifier, callback URI and login URLs remain in RAM. Native Credentials stores CurrentUser DPAPI ciphertext. The shared descriptor references the original Session ID and creation timestamp rather than cloning tokens; eligible callers are checked against native Session/Agent identity. Atomic refresh preserves rotated tokens even if a following MCP request fails. Interactive authorization and state creation require explicit `begin`; restoration or a tool call cannot silently authorize again. Global local disconnect deactivates the shared descriptor with a tombstone and prevents legacy fallback; deleting its source Session retains shared authentication. Native Session disposal releases RAM only, even when persistence cannot see that Session. The native contract has no confirmed-deletion signal: old unshared grants can remain protected in storage after their conversation is removed, but require the exact live owner to restore. Use Disconnect before removing an unshared conversation to clear its grant. Disconnect clears an exact legacy grant under the native file lock, leaving only an empty marker because native deletion has no compare-and-delete API. Shared grant removal and SDK credential invalidation keep their existing behavior; server revocation is separate. **DPAPI protects storage for the Windows user; it is not a model or same-process security boundary.**

The PoC admits one in-flight tool call per session; shared-grant refresh also uses native atomic serialization across sessions/profiles. Global disconnect cancels local requests and refuses late results, and another host rejects a tombstoned descriptor before admitting a call. Discovery must finish completely before calls are admitted. A late failure from an older login cannot delete its replacement connection. Final native synthetic checks cover cross-process refresh/disconnect, queued cancellation, reconnect races and timeout cleanup. This verifies native Credentials serialization, not concurrent safety for DSH conversation/history writers.

After authorization and discovery, the official DSH helper registers `mcp__guilduo__<raw-name>` definitions. Calls require an admitted native `execution.agent.id` and a discovered raw name; arguments including `actingAgentId` pass through unchanged. Shared authentication changes neither Agent/Quest scopes nor standing permission, read-only rules, narrow patches or Human approval. Free remains **2 registered Agents**; profiles/conversations do not require new Registry Agents. Login alone grants no task-level standing permission.

One stable tool catalog is admitted per plugin lifetime. A changed catalog is refused; restart the plugin and restore the authorized connection to rediscover tools. Definitions are not duplicated per conversation; discoverability does not admit a denied/unauthenticated caller. No Stop/Codex hook is installed; the inspected DSH bridge's false Stop flag is not reused. Session disposal is not phase synchronization and does not revoke an active shared connection.

## Support

Report version, Web/Desktop surface and reproduction steps at [GitHub Issues](https://github.com/ELRdn/Guilduo/issues). Exclude tokens, callback URLs, credential files and private Quest/conversation content. DPAPI protects storage for the Windows user; it does not isolate secrets from code running as that user. See [NOTICE](NOTICE) for inspected upstream provenance.
