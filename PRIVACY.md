# Privacy Notice

Effective date: 2026-08-09

QuestForge is self-hostable software. The operator of each deployed instance controls its Firebase and Cloudflare projects and is responsible for local legal requirements.

## Data Used

- Google sign-in identity: Firebase UID, display name, and email for authentication.
- Private QuestForge state: tasks, notes, dates, character progress, preferences, battle state, and event history in the user's Firebase path.
- Public social profile: display name, `@handle`, bio, avatar role/variant, and level in Cloudflare D1.
- Social graph: friend requests, friendships, party membership, and expiring invite metadata.
- Integrations: selected resources, sync cursor, encrypted provider tokens, and sync logs.
- Operational data: bounded error and delivery records needed to run integrations, webhooks, and MCP.

Email, private tasks, HP, streak, and task notes are not included in public profile responses.

## External Providers

Google Calendar, Google Tasks, Notion, Firebase, and Cloudflare process data under their own terms. QuestForge requests provider scopes only after the user chooses Connect. Calendar is read-only, Google Tasks does not automatically mirror deletions, and Notion receives the configured daily log.

## Retention And Control

Users can edit their profile, remove friends, leave a party, disconnect integrations, archive quests, and export a JSON backup. Archived quests are retained by default. Instance operators should provide a contact route for account or data deletion requests.

QuestForge does not sell personal data. This beta does not include advertising or paid analytics.
