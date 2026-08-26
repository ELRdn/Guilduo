# Privacy Notice

Effective date: 2026-08-12

Guilduo is self-hostable software. The operator of each deployed instance controls its Firebase and Cloudflare projects and is responsible for local legal requirements.

## Data Used

- Google sign-in identity: Firebase UID, display name, and email for authentication.
- Private Guilduo state: tasks, notes, dates, character progress, preferences, battle state, and event history in the user's Firebase path.
- Public social profile: display name, `@handle`, bio, avatar role/variant, and level in Cloudflare D1.
- Social graph: friend requests, friendships, party membership, and expiring invite metadata.
- Integrations: selected resources, sync cursor, encrypted provider tokens, and sync logs. For Toggl Focus, Guilduo stores only the user-confirmed task metadata, time-entry IDs, duration, and timestamps needed for attribution.
- Operational data: bounded error and delivery records needed to run integrations, webhooks, and MCP.

Email, private tasks, HP, streak, and task notes are not included in public profile responses.

## External Providers

Google Calendar, Google Tasks, Notion, Toggl Focus, Firebase, and Cloudflare process data under their own terms. Guilduo requests provider scopes only after the user chooses Connect. Calendar is read-only, Google Tasks does not automatically mirror deletions, Notion receives the configured daily log, and Toggl Focus time is imported only after user confirmation. Guilduo does not collect Toggl desktop app names, window titles, Activity Timeline rules, or raw activity data.

## Retention And Control

Users can edit their profile, remove friends, leave a party, disconnect integrations, archive quests, and export a JSON backup. Archived quests are retained by default. Instance operators should provide a contact route for account or data deletion requests.

Guilduo does not sell personal data. This beta does not include advertising or paid analytics.
