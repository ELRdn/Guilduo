# Guilduo optional lifecycle hooks

Claude and Muse candidates keep the historical opt-in SessionStart/Stop behavior.
Node 22+ is required. Review and trust hooks through the host before use.
Claude uses command handlers; Muse uses native argv wrappers. Neither invokes
the Codex-only --codex mode or registers Interrupt. Codex beta.12 receipts and
strict turn/permission gates do not apply to these optional host variants.

SessionStart provides literal arguments for binding the exact session, Quest,
Agent and canonical cwd, with the verified host storage directory as the final
argument. Bind only after explicit standing permission and MCP identity checks:

```text
node <plugin-root>/hooks/lifecycle.mjs bind <session_id> <questId> <actingAgentId> <absolute-cwd> <verified-data-directory>
node <plugin-root>/hooks/lifecycle.mjs unbind <session_id> <absolute-cwd> <verified-data-directory>
```

Stop requires an exact binding and stop_hook_active exactly false. Plan/read-only
flags and Muse subagent mismatch suppress reminders. Missing host mode/turn fields
retain the historical behavior; the Agent must still enforce the canonical Skill's
permission rules. Unbind on revocation or scope change. No automatic bind, network,
transcript access, direct MCP writes or additional permission is provided.
