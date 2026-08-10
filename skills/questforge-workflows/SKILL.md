---
name: questforge-workflows
description: Operate a connected QuestForge account through its MCP tools for quest capture, daily planning, reviews, assignees, friends, parties, integrations, rewards, and MP command battles. Use when a user asks to read, create, organize, complete, archive, delegate, or battle with QuestForge data.
---

# QuestForge Workflows

Use the QuestForge MCP server as the source of truth. Never invent quest IDs, user IDs, turns, integration state, or battle resources.

## Safety

- Read before writing.
- Treat `dryRun` as `true` unless the user explicitly confirms execution.
- Show affected quest titles before batch updates or archives.
- Do not delete quests. Archive them.
- Use exact `@handle` lookup before a friend request or human assignment.
- Do not claim an external integration is active until `list_integrations` reports it connected.
- For battle execution, refresh the session, use its current turn, and generate one unique `commandId` per intended command. Reuse that same ID only when retrying the same command.
- An `agent` assignee is metadata. `handoffState: ready` emits an event but does not prove that work was delivered to that agent.

## Quest Capture

1. Infer `kind`, planning state, deadline, estimate, difficulty, impact, and next action from the user's wording.
2. Ask only for missing information that changes scheduling or completion.
3. Use `create_quest`.
4. Return the created title, schedule/deadline, and assignee in one concise confirmation.

Use `planningState: backlog` for unscheduled one-off work. Use `scheduled` with `planningMode: on_date` for a specific execution date, or `until_due` when it should remain visible through its deadline.

## Daily Strategy

1. Call `list_quests` with `view: today`.
2. If needed, also inspect `week`, `backlog`, dependencies, blocking status, impact, and estimates.
3. Propose a small ordered plan; do not silently move tasks.
4. Preview changes with `batch_update_quests`.
5. Execute only after confirmation with `dryRun: false`.

## Daily Review

1. List today's active and completed quests.
2. Summarize completed work, remaining work, MP, and character state.
3. Offer to postpone or move unfinished work to backlog using a batch preview.
4. Keep completed one-off quests in `completed` until a weekly archive review.

## Weekly Review

1. Read `completed`, `archive`, `week`, and `backlog` views.
2. Present completed one-off quests proposed for archival.
3. Call `archive_quests` as a preview.
4. Execute only after confirmation.

## Assignees

- Self: `{ "type": "self", "id": "self", "label": "Me", "handoffState": "none" }`
- Human: resolve a friend or party member and use the stable `uid`.
- Agent: use a stable agent ID such as `chatgpt`, `codex`, `claude`, `gemini`, `openclaw`, `hermes`, or a user-defined ID.
- Set `handoffState: ready` only when the user says the task is ready for the agent.

## Friends And Parties

- Find profiles only with `find_profile_by_handle` and an exact handle.
- Ask before sending or accepting requests, removing friends, leaving parties, or removing members.
- One user can be in one party. Parties have at most four members.
- Invite tokens are sensitive one-time links. Do not print them in shared summaries.

## Command Battle

1. Call `get_battle_session`.
2. Explain available MP and command costs.
3. Preview `battle_command` first.
4. Ask for confirmation if the user did not name a specific command.
5. Execute with the current `expectedTurn`, a unique `commandId`, and `dryRun: false`.
6. Report player HP, boss HP, MP, effects, and whether the battle ended.

## Tool Reference

Read [references/tools.md](references/tools.md) when choosing between similar list, write, social, integration, or battle tools.
