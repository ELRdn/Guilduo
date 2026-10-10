# Guilduo Codex hooks, beta.12

Node 22+. No dependency, transcript access, credentials, network or direct MCP writes.
Install through the Codex marketplace, inspect /hooks, and review/trust each exact
hook definition. Installing/enabling does not trust hooks; do not bypass trust.

SessionStart supplies literal Node argument arrays. After explicit standing
permission and fresh MCP verification of the exact Quest/Agent, run from the
canonical session cwd:

```text
node <plugin-root>/hooks/lifecycle.mjs bind <session_id> <questId> <actingAgentId> <absolute-cwd> <verified-PLUGIN_DATA>
node <plugin-root>/hooks/lifecycle.mjs unbind <session_id> <absolute-cwd> <verified-PLUGIN_DATA>
```

No automatic binding. Binding is local context, not authorization. Normal exec
tools may use the verified final storage argument without inheriting plugin env.
Bindings contain only session_id, questId, actingAgentId and canonical cwd.

Stop requires a bound session/cwd, explicit non-plan permission_mode,
stop_hook_active exactly false and a valid turn_id. Before any reminder, it
creates PLUGIN_DATA/guilduo-receipts/<sha256(JSON.stringify([session_id,turn_id]))>.json
with exclusive wx. The key never includes Quest, Agent, cwd or binding revision.
Concurrent/duplicate stops and changing bindings cannot continue a turn twice.
Unbind removes only its binding; it never removes receipts. Receipts are local
deduplication records, not proof of an MCP operation.

Missing recursion/turn/storage/binding data, corrupt or linked storage and unknown
permission modes return {}. Plan/read-only, fork, revoked or interrupted events
remove the applicable binding and suppress reminders. Interrupt records the turn
as consumed where possible; returning from interruption requires a new explicit
bind and a new turn. A fork with a new session_id has no inherited binding.
Revocation must be conveyed by explicit unbind or the event's permission_revoked
flag; the hook cannot infer a user's intent from chat text or transcripts.

Only a meaningful phase under current standing permission may use the canonical
Skill to update progress, with fresh Agent identity, expectedUpdatedAt and readback.
No completion, Human acceptance, reward or permission expansion is implied.
Canonical Skill/reference bytes are unchanged. Historical beta.11 hooks and
archives in the original checkout have not been rewritten.
