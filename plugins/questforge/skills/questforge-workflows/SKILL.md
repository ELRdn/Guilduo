---
name: questforge-workflows
description: Operate a connected Guilduo account through MCP for Quest capture, human-to-Agent delegation, Agent-to-human confirmation requests, text feedback, planning, reviews, parties, integrations, rewards, and battles. Use when a user asks to manage Guilduo (legacy QuestForge) work or continue a Human and Agent relay.
---

# Guilduo Workflows

Use the connected Guilduo MCP server as the source of truth. Never invent Quest IDs, user IDs, Agent identities, human answers, integration state, or battle resources. Guilduo passes tasks, status, HTTPS links, and text feedback; the user's own Agent works in its external environment. Guilduo does not launch an Agent or provide an internal artifact viewer.

## Safety

- Read before writing.
- Preview supported mutations with `dryRun: true`. Execute with `dryRun: false` within the user's existing authorization; do not ask for the same permission again. Ask only for a missing decision or an action outside that scope.
- Show affected quest titles before batch updates or archives.
- Do not delete quests. Archive them.
- Use exact `@handle` lookup before a friend request or human assignment.
- Do not claim an external integration is active until `list_integrations` reports it connected.
- For battle execution, refresh the session, use its current turn, and generate one unique `commandId` per intended command. Reuse that same ID only when retrying the same command.
- An `agent` assignee is metadata. `handoffState: ready` emits an event but does not prove that work was delivered to that agent.
- Handoff writes must include `dryRun: true` first. Use `expectedState` on execution so a stale agent update returns a conflict instead of overwriting newer work.
- Never use `delete`; archive quests and preserve their history.
- Never request, accept, echo, or store a Toggl Focus Personal API key through MCP. The user connects it only in the QuestForge web UI.
- Use `list_registered_agents` before assigning work. Do not invent Agent IDs or treat a free-form legacy assignee as registered.
- Use `get_current_agent_context` to understand the current MCP client's linked Agent and effective scopes. Never attempt to expand Agent permissions through MCP.
- Call `assign_quest_to_agent` with `dryRun: true` first. Execute with the Quest's current `expectedUpdatedAt` within the authorized scope.

## Start With Your Agent

1. The human registers their own Agent in the Appwrite-authenticated Guilduo web app. A display name is not an Agent ID.
2. Connect the client to `https://mcp.guilduo.com/mcp` through OAuth. No credentials go into task text or chat.
3. Read `get_agent_link`, `list_registered_agents`, and `get_current_agent_context`. When the user authorizes the identity to use, call `link_agent` with that exact immutable Agent ID. An intentional relink changes this connection's later identity; do not silently choose a different Agent.
4. Connection-management uses the OAuth connection grant. Execution permissions are the intersection of that grant and the Agent's allowed scopes. Missing `agents:write` in execution scopes does not mean the OAuth link permission disappeared. Do not expand execution scopes to fix a control-plane failure.
5. Prove the first read with `list_quests`/`get_quest`, then perform a user-authorized Quest update. Only a successful persisted operation proves writing works. Refresh the client's `tools/list` after a server update; do not assume a cached tool list includes new tools.

## Agent To Human: Request, Wait, Resume

Use a separate human confirmation Quest when the Agent needs something it cannot establish itself: real-device behavior, the user's subjective design feedback, a choice of tradeoffs, or a user-owned decision. Run available automated checks yourself first. Do not turn routine lint/build checks or every small implementation choice into a human task.

1. Read the original Quest and `get_current_agent_context`. You must be its assigned registered Agent. Read `list_human_requests` with `status: "all"` and `sourceQuestId` to avoid another open request.
2. If work is ready for review, preview then transition its Handoff to `review_required` with an honest text summary and an optional HTTPS link. This is not Quest completion.
3. Prepare `request_human_review`: `questId`, a stable `requestKey`, a short actionable `title`, `reason` (why human input is needed), `checkTarget` (the exact external screen/device/actions), `completionCriteria` (what answer is enough), and optional `artifactUrl`. Text limits are in the live tool schema. Do not put credentials in links.
4. Preview, inspect the intended recipient and source, then execute with `dryRun: false` and the original Quest's current `expectedUpdatedAt`. The server stamps the actual requester identity. Do not set `requester` or `humanRequest` with ordinary create/update tools.
5. Retry the same logical request with the SAME `requestKey` and content. The existing Quest is returned. Changed content under that key conflicts; a different key while a request is pending/deferred also conflicts. Resume the existing request instead of creating duplicates.
6. Tell the human where the request is, what to check externally, and that the reply belongs in Guilduo's Requests for you. Keep unrelated authorized work moving. Do not poll rapidly or invent an answer. Seen and deferred both mean the human has not answered yet.
7. When resuming, read `list_human_requests` again. `humanRequest.response` is the saved text; `outcome` is `approved` or `changes_requested`. For changes, return the original Handoff to `working`, implement and test, then create a NEW request key for the next review round. Never rewrite the earlier answer.
8. With a saved approval, the original Handoff can become `accepted`. Completing the human confirmation Quest, accepting the Handoff, and completing the original work are three separate operations. Only complete original/parent work after its own criteria are verified. A completed child never completes a parent automatically.

Only the intended authenticated human can answer through the web app. Agents cannot use `score_quest`, ordinary `update_quest`, or a full snapshot to fabricate that answer. A review request is linked by `humanRequest.sourceQuestId`; it is not a dependency or Quest Tree child.

### Example: Vibe Coding Feedback

- Title: Check the mobile navigation on your phone.
- Reason: Automated viewport checks passed; one-handed comfort needs your feedback.
- Target: Open the provided preview on your phone, open/close the menu, and try its links.
- Completion: Reply with no changes, or describe the element and what should change.
- After changes: test again and request another round under a new key.

### Example: OpenClaw Update

- Do first: read the requested update scope, check compatibility, apply the authorized update, and run available local checks.
- Ask a human only if a real channel/device or a user-specific workflow cannot be verified from the Agent environment. State exactly which check remains and why.
- Target: Run the named workflow in the user's actual client. Record the result as text in Guilduo; external logs/artifacts remain outside it.
- On a failed check: use the saved text to repair the issue. Never claim the update is accepted because a task was merely created or marked seen.

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
4. A completed one-off todo is returned in `archive` automatically; recurring todos, dailies, and habits remain active.

## Weekly Review

1. Call `get_review_summary` with `period: "week"`, then read `archive`, `week`, and `backlog` views as needed.
2. Present completed one-off quests already moved to the archive, plus any legacy `completed` records that still need review.
3. Use `archive_quests` as an idempotent preview for legacy records; use `batch_update_quests` with `lifecycleState: "active"` only when the user asks to restore a stored Quest.
4. Execute write operations only after confirmation.

## Assignees

- Self: `{ "type": "self", "id": "self", "label": "Me", "handoffState": "none" }`
- Human: resolve a friend or party member and use the stable `uid`.
- Agent: call `list_registered_agents` and use an active immutable `agentId`. Legacy free-form assignees remain readable but are not Registry entries.
- The user creates and edits Registry entries in the Appwrite-authenticated Guilduo web UI. MCP clients can read the Registry, link their authorized connection, and accept assignments, but cannot create Agents or expand their scopes.
- Effective Agent permissions are the intersection of the OAuth grant and the Agent's allowed scopes.
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

## Toggl Focus

1. Call `get_toggl_focus_status` before reading entries or changing a timer. Do not assume the user has connected Focus.
2. Use `sync_quest_to_toggl_focus` with its default dry-run first. Only active To Dos and Dailies are eligible.
3. Use `start_toggl_focus_tracking` and `stop_toggl_focus_tracking` as previews first. If another timer is running, show its exact entry ID and get confirmation before executing.
4. Call `preview_toggl_attribution` before importing time. A direct Focus task match may be proposed; an unlinked entry needs a user-selected Quest.
5. Run `apply_toggl_attribution` with `dryRun: false` only after confirmation. One Focus entry belongs to one Quest and must never be counted twice.
6. `get_toggl_estimate_insights` is suggestion-only. Never change estimates automatically.
7. Do not import activity timeline, app name, window title, or raw desktop activity data.

## Tool Reference

Read [references/tools.md](references/tools.md) when choosing between similar list, write, social, integration, or battle tools.
