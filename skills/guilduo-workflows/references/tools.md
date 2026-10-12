# Guilduo Tool Map

Choose a category first, then inspect the current tool schema. Tool availability depends on the live server and this connection; this map does not grant permissions. Use the stable protocol names below across Codex and OpenClaw.

| Need | Start here | Write boundary |
| --- | --- | --- |
| Quest planning and tasks | `list_quests`, `get_quest`, `get_quest_tree` | Authorized create/update; preview batch operations |
| Character and rewards | `get_character_state` | `buy_reward` spends Gems |
| Agent identity and Human relay | `get_agent_link`, `get_current_agent_context`, `list_human_requests` | Link the intended Agent; preview assignment, Handoff and human requests |
| External integrations | `list_integrations`, `preview_external_sync` | Configure in the web app; preview sync |
| Battle | `get_battle_session` | Preview then exact turn + unique commandId |
| Party and people | `get_party`, `list_friends` | Requests/invites need explicit authorization |
| Toggl Focus | `get_toggl_focus_status`, `get_toggl_focus_tracking` | Exact current timer and preview before writes |

## Quests

- Read: `list_today_quests`, `list_quests`, `get_quest`, `get_daily_brief`, `get_review_summary`, `list_activity_events`
- Create/edit: `create_quest`, `update_quest`
- Batch: `batch_update_quests`, `batch_score_quests`, `archive_quests`
- Complete/reopen: `score_quest`
- External metadata: `link_external_record`
- Character/reward: `get_character_state`, `buy_reward`

## Profiles And Social

- Profiles: `get_my_profile`, `find_profile_by_handle`, `update_profile`
- Friends: `list_friends`, `list_friend_requests`, `send_friend_request`, `respond_friend_request`, `remove_friend`
- Party: `get_party`, `create_party`, `invite_party_member`, `accept_party_invite`, `leave_party`, `remove_party_member`

## Battle

- Read: `get_battle_session`
- Preview/execute: `battle_command`
- Commands: `attack`, `skill`, `guard`, `heal`, `burst`

## Integrations

- State: `list_integrations`
- Preview: `preview_external_sync`
- Execute: `sync_external_service`
- Calendar: `get_calendar_schedule`, `convert_calendar_event_to_quest`

## Toggl Focus

- Connection/state: `get_toggl_focus_status`, `get_toggl_focus_tracking`
- Task export: `sync_quest_to_toggl_focus` (preview by default)
- Timer: `start_toggl_focus_tracking`, `stop_toggl_focus_tracking` (confirm the exact current entry before execution)
- Time: `list_toggl_focus_entries`, `preview_toggl_attribution`, `apply_toggl_attribution`
- Insights: `get_toggl_estimate_insights` (suggestions only)

Never ask for a Personal API key through MCP. The user enters it exclusively in the QuestForge web connection dialog. A Focus time entry maps to one Quest only; an unlinked entry needs the user's selected Quest before attribution.

## Quest Trees

- Read hierarchy and progress: `get_quest_tree`
- Create or edit parent relation: `create_quest`, `update_quest` with `parentQuestId`
- Filter roots or children: `list_quests` with `parentQuestId` or `rootOnly`

Only habits, dailies, and To Dos can be in a tree. A reward cannot be a parent or child, cycles are rejected, and the maximum depth is eight levels.

## Agent Handoffs

- Read work: `list_agent_handoffs`
- Transition with preview first: `transition_quest_handoff`
- States: `none`, `ready`, `working`, `blocked`, `review_required`, `accepted`
- Include `expectedState` when executing a transition to protect against stale updates.

## Human Confirmation Requests

- Create/preview: `request_human_review`. Requires the original Agent-assigned Quest, a stable `requestKey`, reason, external check target, completion criteria, and `expectedUpdatedAt` when executing.
- Read/wait/resume: `list_human_requests`, optionally `sourceQuestId` and `status: pending | deferred | answered | all`.
- Answers are text in `Quest.humanRequest.response`; the outcome is `approved` or `changes_requested`.
- The Human web response is deliberately not an MCP write tool. Only the human can mark seen, defer, resume, approve, or request changes. Seen is not done. Approval is not original Quest completion.
- Same key + same content is a retry; a new completed review round gets a new key and keeps previous history.

## Agent Registry

- List active registered Agents: `list_registered_agents`
- Inspect the current OAuth client's linked Agent: `get_current_agent_context`
- Inspect/link/unlink this OAuth connection: `get_agent_link`, `link_agent`, `unlink_agent`
- Preview or assign a Quest: `assign_quest_to_agent`
- Always preview first. Execution requires `dryRun: false` and the Quest's current `expectedUpdatedAt`.
- Registry creation, permission changes, and archival are web-only operations. OAuth client linking/unlinking is also available through the three connection tools above with the connection grant. It does not expand Agent execution permissions. MCP must never request secrets or expand its own permissions.

Google Calendar is read-only schedule import. Google Tasks is deletion-free bidirectional sync. Notion exports daily logs. Provider connection and resource selection happen in the QuestForge web UI.
