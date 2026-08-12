---
name: questforge-workflows
description: Operate a connected QuestForge account through its MCP tools for quest capture, Quest Trees, daily planning, reviews, agent handoffs, friends, parties, integrations, rewards, and MP command battles. Use when a user asks to read, create, organize, complete, archive, delegate, review, or battle with QuestForge data.
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
- Handoff writes must include `dryRun: true` first. Use `expectedState` on execution so a stale agent update returns a conflict instead of overwriting newer work.
- Never use `delete`; archive quests and preserve their history.

## Quest Capture

1. Infer `kind`, planning state, deadline, estimate, difficulty, impact, and next action from the user's wording.
2. Ask only for missing information that changes scheduling or completion.
3. Use `create_quest`.
4. Return the created title, schedule/deadline, and assignee in one concise confirmation.

Use `planningState: backlog` for unscheduled one-off work. Use `scheduled` with `planningMode: on_date` for a specific execution date, or `until_due` when it should remain visible through its deadline.

## Daily Strategy

1. Call `get_daily_brief` first. Set `includeCalendar: true` only when a Calendar schedule would help.
2. Call `get_quest_tree` when a task has a parent or when the user is planning a large goal.
3. If needed, inspect `week`, `backlog`, dependencies, blocking status, impact, estimates, and recent activity with `list_activity_events`.
4. Propose a small ordered plan; do not silently move tasks.
5. Preview changes with `batch_update_quests`.
6. Execute only after confirmation with `dryRun: false`.

## Daily Review

1. Call `get_review_summary` with `period: "day"` and use `list_activity_events` for any detail that needs checking.
2. Summarize completed work, remaining work, MP, and character state.
3. Offer to postpone or move unfinished work to backlog using a batch preview.
4. Keep completed one-off quests in `completed` until a weekly archive review.

## Weekly Review

1. Call `get_review_summary` with `period: "week"`, then read `completed`, `archive`, `week`, and `backlog` views as needed.
2. Present completed one-off quests proposed for archival.
3. Call `archive_quests` as a preview.
4. Execute only after confirmation.

## Assignees

- Self: `{ "type": "self", "id": "self", "label": "Me", "handoffState": "none" }`
- Human: resolve a friend or party member and use the stable `uid`.
- Agent: use a stable agent ID such as `chatgpt`, `codex`, `claude`, `gemini`, `openclaw`, `hermes`, or a user-defined ID.
- Set `handoffState: ready` only when the user says the task is ready for the agent.
- Use `list_agent_handoffs` before processing agent work, then read each task with `get_quest` and `get_quest_tree` when it has children.
- Allowed flow: `none -> ready -> working -> review_required -> accepted -> none`; use `blocked` when work cannot continue and return to `working` or `none` after resolution.
- When an agent returns work, transition to `review_required` with a concise note and an HTTPS artifact URL when available.
- A human reviewer moves `review_required` to `accepted`, or back to `working` with a reason. Handoff state is separate from Quest completion.

## Quest Trees

1. Call `get_quest_tree` before changing a parent or child relationship.
2. Only `habit`, `daily`, and `todo` quests can participate; rewards stay outside the tree.
3. Propose parent and child Quest titles to the user. Do not auto-decompose a Quest.
4. Create or update children one at a time with `parentQuestId` after confirmation.
5. Use the returned `summary` for progress. Completing a child never auto-completes its parent.
6. Archived children are omitted by default; pass `includeArchived: true` for review and archival decisions.

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
