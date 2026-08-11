# QuestForge Tool Map

## Quests

- Read: `list_today_quests`, `list_quests`, `get_quest`, `get_daily_brief`, `get_review_summary`, `list_activity_events`
- Create/edit: `create_quest`, `update_quest`
- Batch: `batch_update_quests`, `archive_quests`
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

## Agent Handoffs

- Read ready or pending work: `list_agent_handoffs`

Google Calendar is read-only schedule import. Google Tasks is deletion-free bidirectional sync. Notion exports daily logs. Provider connection and resource selection happen in the QuestForge web UI.
