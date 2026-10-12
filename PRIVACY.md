# Privacy Notice

Effective date: 2026-10-02

Local candidate addendum: 2026-10-04. Linked measurement described below is disabled until operator approval and acceptance; this edit does not activate collection on the official service.

Local candidate addendum: 2026-10-12. The native Notes and work-time workspace described below is a local implementation candidate; publication is tracked separately.

Guilduo is self-hostable software. The operator of each deployed instance controls its Appwrite and Cloudflare projects and is responsible for local legal requirements. Firebase is used only as a legacy migration source; it is not the current sign-in or private-state store.

## Official Service Operator And Contact

The official Guilduo service is operated by Radon. For individual inquiries, account deletion or personal-data deletion requests, email [el2radon2official@gmail.com](mailto:el2radon2official@gmail.com). To help identify the account, contact us from its registered email address where possible. Never send passwords or access tokens.

Report bugs through [Guilduo GitHub Issues](https://github.com/ELRdn/Guilduo/issues). Keep private account information and deletion requests out of public issues. Operators of self-hosted instances provide their own contact and handle requests for their instance.

## Data Used

- Google sign-in identity: Appwrite account ID, display name, and email for authentication. Short-lived Appwrite JWTs authenticate Web API requests; delegated OAuth grants authenticate MCP clients.
- Private Guilduo state: Quests, notes, dates, requester and Human-review responses, character progress, preferences, battle state, and event history in a user-specific Appwrite TablesDB snapshot. Legacy Firebase snapshots may be retained temporarily for migration verification and rollback.
- Native productivity workspace: independent note titles/text, optional Quest links, user-started timers, manually entered work records, timestamps, and private time-source/timezone preferences in owner-specific Cloudflare D1 storage. These records are independent of the Appwrite Quest snapshot and are not public profile data.
- Public social profile: display name, `@handle`, bio, avatar role/variant, and level in Cloudflare D1.
- Agent avatar images: PNG/JPEG/WebP images an Agent owner uploads (max 300 KB), stored as objects in Cloudflare R2 and served only to Bearer-authenticated requests. Metadata in Cloudflare D1 (`avatar_version`, whether one is set) decides which image is current; it is never a public or guessable URL.
- Account avatar images: PNG/JPEG/WebP images the account owner uploads (max 300 KB), stored separately from Agent images in Cloudflare R2. Only the authenticated owner can fetch the current version.
- Social graph: friend requests, friendships, party membership, and expiring invite metadata.
- Integrations: selected resources, sync cursor, encrypted provider tokens, and sync logs. For Toggl Focus, Guilduo stores only the user-confirmed task metadata, time-entry IDs, duration, and timestamps needed for attribution.
- Operational data: bounded error and delivery records needed to run integrations, webhooks, and MCP.
- Optional analytics: only after consent, allowlisted events about performance, synchronization and feature use may be sent to an operator-configured telemetry endpoint. Public pages also measure page-view and App-click counts with finite page, language and search/AI/campaign referral categories. No raw URLs, search terms or arbitrary UTM values are sent, and records are not linked to accounts. They exclude Quest text, notes, email, user IDs and credentials. Telemetry records have a maximum retention of 90 days. Consent can be declined or withdrawn in public-page footer settings; queued events and the tab's short-lived referral category are then discarded. Without consent or a configured endpoint, no analytics are sent.
- Google Analytics 4: public marketing, Docs and use-case pages load Google's tag only after the same analytics consent. GA4 uses pseudonymous browser cookie identifiers and standard device and approximate-location dimensions. It receives canonical public page addresses and finite referral categories, with URL queries and fragments removed; no account ID, Quest content or credentials are supplied. Advertising consent, Google Signals, ad personalization, enhanced automatic measurement and cross-domain account linkage are disabled. GA4 user/event data retention is set to two months; standard aggregated reports can be retained longer. Browser cookies expire within 90 days without automatic renewal and are expired on withdrawal. Google's processing is described in the [Google Privacy Policy](https://policies.google.com/privacy). Without consent, the Google tag is not loaded; withdrawal disables further GA4 collection on the page.
- Device storage: theme, language, motion and analytics preferences. The current Relay Forge workspace is read through the authenticated API; demo data is separate from account data.

Email, private tasks, HP, streak, and task notes are not included in public profile responses.

## External Providers

Google, Appwrite, Cloudflare and any connected external provider process data under their own terms. Google Calendar, Google Tasks and Notion OAuth connections remain Early Access and are not enabled by assigning a Quest. Where configured, Guilduo requests provider scopes only after the user chooses Connect. Calendar is read-only, Google Tasks does not automatically mirror deletions, Notion receives the configured daily log, and Toggl Focus time is imported only after user confirmation. Guilduo does not collect Toggl desktop app names, window titles, Activity Timeline rules, or raw activity data.

## Retention And Control

Users can edit their profile, remove friends, leave a party, disconnect integrations, archive quests, and export a JSON backup. Archived quests are retained by default. Replacing an Agent's avatar image does not delete the previous one from storage; it only stops being served — an archived Agent's avatar is retained the same way. A scheduled inventory pass identifies avatar images no Agent references any more (older than a grace period, to avoid racing an upload still in flight) and reports them; it only deletes anything when an instance operator explicitly opts an environment into that (`AGENT_AVATAR_CLEANUP_EXECUTE=true`), which is not set by default. Instance operators should provide a contact route for account or data deletion requests.

Guilduo does not sell personal data. This beta does not include advertising or paid analytics.

The native workspace provides its own export/restore and confirmed work-data deletion in Settings. Archiving retains records. Deletion removes note text, work records and saved preferences; minimal owner/revision and operation-ID tombstones prevent delayed requests from recreating deleted content. Tombstones contain no previous note or work-record contents and remain operational metadata until account deletion. Operators must include the owner's native D1 workspace in account-deletion handling and disclose platform backup-retention limits separately.

For the proposed linked measurement, refusing consent does not limit authentication, Quest, MCP or purchase features. Withdrawal in Settings deletes the linked optional events, payments and claimed attribution; it does not delete required operational or financial records. Unlinked LP visits can be removed using the current device's visit capability; they cannot be located by an account without a claimed link. Subject mappings expire for collection and reporting at 90 days. Scheduled deletion runs every 15 minutes; delivery records in private snapshots are removed through a persistent, bounded retry queue. Provider outages or a queue backlog can delay physical erasure; operators must track outstanding cleanup and must not close a deletion request while it remains pending. Minimal account consent preferences remain until account deletion so refusal can apply across devices. Saved delivery records use a consent-specific random ID; withdrawal invalidates old pending records, and they are not replayed after a later consent. Platform backup deletion and financial retention exceptions remain operator acceptance items.

## Conditional Payment And Decision Services

Paid service activation is pending approved configuration, provider eligibility and real acceptance. When enabled, Stripe processes payment/customer/subscription/invoice/refund data under its terms; Guilduo keeps minimum provider identifiers, entitlement state and Credit/referral audit records in D1 without card details. Test data is separate from Live data. Statutory financial retention and backup deletion windows must be disclosed before sale, not guessed from this beta notice.

When enabled after explicit data-policy approval, official TypeSafe Jev receives the user-requested text context and eligible finite Agent/action candidates for the limited decision feature. Do not submit credentials or unrelated private state. The first release excludes images and automatic Agent execution. Provider retention/processing terms must be reviewed before activation; this notice is not legal or provider-policy validation.

For private deletion requests, registered-email contact helps locate an account but does not replace verified account control. The operator scopes deletion across Appwrite/D1/R2, grants/tokens and retained backups, confirms retention exceptions, and reapplies deletion records after restore. See [launch operations](docs/launch-operations.md). A local rehearsal is not an actual deletion request's completion.
