# Guilduo local lifecycle hooks

OpenAI and Claude use the command-handler shape in `hooks.json`. Its Node loader
resolves `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` inside JavaScript for the tested
PowerShell/POSIX shells. Muse stable 1.4.3 uses generated native manifest argv
and separate `session-start.mjs` / `stop.mjs` wrappers instead: its Windows
compatibility command runner does not execute the quoted `node -e` loader.
All variants share `lifecycle.mjs`. Node 22+ is required; no dependencies.
Hook review/trust remains the host's normal responsibility.

Run from the session's cwd using the verified storage path emitted by SessionStart:

```text
node <plugin-root>/hooks/lifecycle.mjs bind <session_id> <questId> <actingAgentId> <absolute-cwd> <dataDir>
node <plugin-root>/hooks/lifecycle.mjs unbind <session_id> <absolute-cwd> <dataDir>
```

Normal model exec tools need not inherit `PLUGIN_DATA` or `PLUGIN_ROOT`.
The final `dataDir` argument is optional only when `PLUGIN_DATA` is inherited.
Hooks use host-provided `PLUGIN_DATA`, `CLAUDE_PLUGIN_DATA`, or `MUSE_PLUGIN_DATA_DIR`. SessionStart checks the storage
path and existing ancestors without creating it and emits complete literal Node
argument arrays for bind and unbind.

Pass each value as a literal argument. IDs accept 1–200 ASCII letters, digits,
underscores or hyphens, starting with a letter or digit. Paths must be absolute,
local, existing directories (PLUGIN_DATA may be created on bind), without control
characters or `..` segments. Binding stores only the four exact fields in
`PLUGIN_DATA/guilduo-bindings/<sha256(session_id)>.json`, with canonical cwd.
Unbind is idempotent. To change cwd, unbind from the old cwd first.

`SessionStart` and `Stop` modes receive a JSON object on stdin with
`hook_event_name`, `session_id` and `cwd`. SessionStart emits model context and
literal CLI arguments; it does not bind automatically. Stop requires an exact
binding and `stop_hook_active: false`, then emits one `decision: "block"` reminder.
An active/missing/invalid recursion flag, unbound session, cwd mismatch or invalid
input emits `{}`. Plan/read-only event flags also suppress reminders; Muse thread/session mismatch suppresses subagent borrowing. Hosts that omit mode flags still require the model to enforce the Skill's permission rules. Hook input is capped at 1 MiB; binding files at 4 KiB. Errors
never print input or paths; CLI failure exits 1 with a fixed diagnostic.

Binding requires existing explicit standing permission; it does not grant it.
The model follows `guilduo-workflows` for authorized MCP updates, previews,
identity, concurrency guards and honest verification. Read-only/unrelated work,
revoked permission or no meaningful change produces no write. The hook never
opens transcripts, reads tokens or accesses the network, and cannot establish
user permission or task completion. Bindings persist for that session until
unbound; permission must still be checked after resume.
