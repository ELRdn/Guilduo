# Privacy Notice

Effective date: 2026-10-02

Guilduo is self-hostable software. The operator of each deployed instance controls its Appwrite and Cloudflare projects and is responsible for local legal requirements. Firebase is used only as a legacy migration source; it is not the current sign-in or private-state store.

## Official Service Operator And Contact

The official Guilduo service is operated by Radon. For individual inquiries, account deletion or personal-data deletion requests, email [el2radon2official@gmail.com](mailto:el2radon2official@gmail.com). To help identify the account, contact us from its registered email address where possible. Never send passwords or access tokens.

Report bugs through [Guilduo GitHub Issues](https://github.com/ELRdn/Guilduo/issues). Keep private account information and deletion requests out of public issues. Operators of self-hosted instances provide their own contact and handle requests for their instance.

## Data Used

- Google sign-in identity: Appwrite account ID, display name, and email for authentication. Short-lived Appwrite JWTs authenticate Web API requests; delegated OAuth grants authenticate MCP clients.
- Private Guilduo state: Quests, notes, dates, requester and Human-review responses, character progress, preferences, battle state, and event history in a user-specific Appwrite TablesDB snapshot. Legacy Firebase snapshots may be retained temporarily for migration verification and rollback.
- Public social profile: display name, `@handle`, bio, avatar role/variant, and level in Cloudflare D1.
- Agent avatar images: PNG/JPEG/WebP images an Agent owner uploads (max 300 KB), stored as objects in Cloudflare R2 and served only to Bearer-authenticated requests. Metadata in Cloudflare D1 (`avatar_version`, whether one is set) decides which image is current; it is never a public or guessable URL.
- Account avatar images: PNG/JPEG/WebP images the account owner uploads (max 300 KB), stored separately from Agent images in Cloudflare R2. Only the authenticated owner can fetch the current version.
- Social graph: friend requests, friendships, party membership, and expiring invite metadata.
- Integrations: selected resources, sync cursor, encrypted provider tokens, and sync logs. For Toggl Focus, Guilduo stores only the user-confirmed task metadata, time-entry IDs, duration, and timestamps needed for attribution.
- Operational data: bounded error and delivery records needed to run integrations, webhooks, and MCP.
- Optional analytics: only after consent, allowlisted events about performance, synchronization and feature use may be sent to an operator-configured telemetry endpoint. They exclude Quest text, notes, email, user IDs and credentials. Telemetry records have a maximum retention of 90 days. Without consent or a configured endpoint, no analytics are sent.
- Device storage: theme, language, motion and analytics preferences. The current Relay Forge workspace is read through the authenticated API; demo data is separate from account data.

Email, private tasks, HP, streak, and task notes are not included in public profile responses.

## External Providers

Google, Appwrite, Cloudflare and any connected external provider process data under their own terms. Google Calendar, Google Tasks and Notion OAuth connections remain Early Access and are not enabled by assigning a Quest. Where configured, Guilduo requests provider scopes only after the user chooses Connect. Calendar is read-only, Google Tasks does not automatically mirror deletions, Notion receives the configured daily log, and Toggl Focus time is imported only after user confirmation. Guilduo does not collect Toggl desktop app names, window titles, Activity Timeline rules, or raw activity data.

## Retention And Control

Users can edit their profile, remove friends, leave a party, disconnect integrations, archive quests, and export a JSON backup. Archived quests are retained by default. Replacing an Agent's avatar image does not delete the previous one from storage; it only stops being served — an archived Agent's avatar is retained the same way. A scheduled inventory pass identifies avatar images no Agent references any more (older than a grace period, to avoid racing an upload still in flight) and reports them; it only deletes anything when an instance operator explicitly opts an environment into that (`AGENT_AVATAR_CLEANUP_EXECUTE=true`), which is not set by default. Instance operators should provide a contact route for account or data deletion requests.

Guilduo does not sell personal data. This beta does not include advertising or paid analytics.
