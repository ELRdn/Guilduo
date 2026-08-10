# QuestForge

QuestForge is an open task RPG where completing real work earns MP, then the player chooses when and how to use that MP in a deterministic command battle. It combines a browser/PWA task manager, REST API, remote MCP server, social profiles and parties, and opt-in external integrations.

Version: `0.3.0-social-beta` / Web release: `2026.08.10-i18n-beta`

> QuestForge is an independent project. It is not affiliated with, endorsed by, or a substitute for Habitica. Product names and trademarks belong to their respective owners.

## Current Features

- Habits, daily promises, one-time quests, and rewards
- Dates, deadlines, repeating schedules, sorting, editing, completion archive, and JSON backup
- Task assignees: self, friend/party member, or AI agent metadata
- MP command battle with six roles, five commands, dry-run previews, and idempotent turns
- Public profile with exact `@handle` search, friend requests, and one four-person party per user
- Firebase Google login, PC/mobile state sync, and installable PWA
- Cloudflare Worker REST API and Streamable HTTP MCP with OAuth scopes
- Google Calendar, Google Tasks, and Notion integration foundations; Toggl Track remains a later phase
- Japanese, English, Spanish, Brazilian Portuguese, French, German, Korean, Simplified Chinese, and Russian display modes
- Three visual themes with light, dark, and system appearance modes
- Sandboxed plugin slots and signed webhook foundations

The Unity Battle Lab is intentionally pending and excluded from this web release.

## Architecture

| Layer | Responsibility |
|---|---|
| Firebase Hosting | PWA frontend |
| Firebase Auth / Realtime Database | Sign-in and private per-user quest/character state |
| Cloudflare Worker | REST, OAuth, MCP, webhooks, integration orchestration |
| Cloudflare D1 | Public profiles, friends, parties, integration accounts and sync records |
| Cloudflare KV | OAuth state, MCP clients, and short-lived credentials |

Private tasks and character state are not stored in the public social graph. A public profile contains only display name, `@handle`, bio, avatar role/variant, and level.

## Local Setup

Requirements: Node.js 22+, Firebase CLI, and Wrangler.

```bash
npm install
cp firebase-config.example.js firebase-config.js
cp runtime-config.example.js runtime-config.js
cp .firebaserc.example .firebaserc
cp wrangler.example.jsonc wrangler.jsonc
npm run dev
```

On PowerShell, use `Copy-Item` instead of `cp` if needed. Fill the copied files with your own Firebase and Cloudflare project values.

Apply D1 migrations before using profiles, friends, parties, or integrations:

```bash
npx wrangler d1 migrations apply questforge-data --local
npx wrangler d1 migrations apply questforge-data --remote
```

Worker secrets and provider OAuth setup are documented in [API_MCP_SETUP.md](API_MCP_SETUP.md).

## Commands

```bash
npm run dev          # local PWA
npm test             # all Node tests
npm run check        # syntax checks
npm run build        # production frontend
npm run worker:dev   # local Worker on :8787
npm run api:generate # regenerate OpenAPI and MCP contracts
```

## MCP

The standard remote endpoint is:

```text
https://<your-worker>/mcp
```

Use OAuth for normal users. The local stdio bridge in `mcp-local/` is a development compatibility path. The bundled [QuestForge workflow skill](skills/questforge-workflows/SKILL.md) teaches an AI client to preview batch changes, use exact handles, archive instead of delete, and execute battle turns safely.

## Integration Status

- Google Calendar: read-only schedule slots and explicit quest conversion
- Google Tasks: deletion-free bidirectional contract and conflict handling
- Notion: one daily `QuestForge Logs` record
- Toggl Track: data contract only; token UI, timer controls, and production sync are pending

Provider OAuth requires operator-owned client IDs and secrets. A user only presses Connect after the operator configures them.

## License

QuestForge software is licensed under [GNU AGPL-3.0-only](LICENSE). If you run a modified version over a network, provide its corresponding source to users as required by the license. See [ASSETS.md](ASSETS.md) for visual asset notes.

Read [PRIVACY.md](PRIVACY.md), [TERMS.md](TERMS.md), [SECURITY.md](SECURITY.md), and [CONTRIBUTING.md](CONTRIBUTING.md) before operating a public instance.
