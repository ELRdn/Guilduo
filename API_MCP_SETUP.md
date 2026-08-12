# QuestForge Gateway setup

Firebase Hosting serves the web app. REST, OAuth, MCP, webhooks, plugins, and external adapters run on Cloudflare Workers.

## 1. Create Cloudflare resources

```bash
npx wrangler login
npx wrangler kv namespace create QUESTFORGE_KV
npx wrangler d1 create questforge-integrations
```

Add the returned namespace to `wrangler.jsonc`:

```json
"kv_namespaces": [{ "binding": "QUESTFORGE_KV", "id": "returned-id" }]
```

The KV binding is required for MCP OAuth clients, short-lived provider OAuth state, webhooks, plugin installs, and retry records. Add the returned D1 database ID as the `QUESTFORGE_DB` binding, then apply migrations:

```bash
npx wrangler d1 migrations apply questforge-integrations --remote
```

D1 stores per-user integration accounts, encrypted provider tokens, Calendar schedule blocks, sync cursors, locks, and logs.

## 2. Add Firebase service credentials

In Firebase Console, open Project settings > Service accounts and generate a private key. Do not add the downloaded JSON to this project.

```bash
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
```

Use the `client_email` and `private_key` values from the downloaded JSON.

In Firebase Console > Authentication > Settings > Authorized domains, add the deployed `workers.dev` hostname. Otherwise the OAuth approval page cannot open Google sign-in.

## 3. Configure the integration vault

Generate a 32-byte encryption key. Store the base64url output as a Worker Secret and never commit it.

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$key = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$key | npx wrangler secret put INTEGRATION_TOKEN_KEY
```

## 4. Register Google OAuth

In Google Cloud Console, enable Google Calendar API and Google Tasks API. Configure the OAuth consent screen in Testing mode and add the test-user email addresses. Create a Web application OAuth client with this exact redirect URI:

```text
https://your-questforge-worker.example.workers.dev/oauth/callback/google
```

Store the generated values:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

QuestForge requests Calendar event/list read-only scopes and the Google Tasks write scope. Firebase Google login does not grant these API permissions, so users complete this second consent once from the integration screen.

## 5. Register a Notion Public Connection

Create a Public Connection in the Notion developer dashboard and use this redirect URI:

```text
https://your-questforge-worker.example.workers.dev/oauth/callback/notion
```

Store its credentials:

```bash
npx wrangler secret put NOTION_CLIENT_ID
npx wrangler secret put NOTION_CLIENT_SECRET
```

After authorization, the user selects a parent page and QuestForge creates a `QuestForge Logs` database with the Notion `2026-03-11` API.

## 6. Deploy

```bash
npm run worker:deploy
```

`PUBLIC_BASE_URL` and `WEB_APP_URL` stay as non-secret Wrangler variables. Verify `/health` reports `integrationStorage: d1`, then connect Google and Notion from the app.

## MCP v2.4 connection check

The normal OAuth endpoint is `https://your-questforge-worker.example.workers.dev/mcp`. It provides all 38 QuestForge tools, including Quest Tree and Agent Handoff operations. After a Worker update, remove and reconnect a client only when it has cached an older tool list.

`https://your-questforge-worker.example.workers.dev/mcp-next` is the SDK v2 Streamable HTTP lane. It provides the same tools plus Quest Tree and Agent Handoff Resources and Prompts for `plan_today`, `review_day`, `review_week`, `capture_quest`, and `process_agent_handoffs`. Use `/mcp-next` first for clients that support modern MCP discovery, then keep `/mcp` as the normal compatibility endpoint.

Toggl Track remains phase 2. Do not add one global Toggl token to the Worker.

## Local development

Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill local values.

```bash
npm run worker:dev
```

Use a Firebase ID token as a bearer token, or set `DEV_BEARER_TOKEN` and `DEV_USER_ID` for local testing.

## Integration release status

### Phase 1: implemented

- Google Calendar: per-user OAuth, multi-calendar selection, read-only schedule cache, explicit event-to-Quest conversion.
- Google Tasks: per-user OAuth, one selected list, no-delete bidirectional sync, manual local export, conflict choice, and remote-missing recovery.
- Notion: per-user OAuth, parent-page selection, dedicated `QuestForge Logs` database, and one upserted daily row.
- Shared runtime: D1 encrypted token storage, 15-minute Cron, per-user locks, retry logs, dry-run preview, REST, and Remote MCP.

Provider connections stay disabled until the Google and Notion client credentials in sections 4 and 5 are stored as Worker Secrets. Scheduled Firebase writes also require the two service credentials in section 2.

### Phase 2: Toggl Track

1. Accept a personal API token in the QuestForge connection screen and encrypt it in D1.
2. Verify the token with `/me`, then select a Workspace and Project.
3. Import linked time entries into `togglActualMinutes` and `actualMinutes`.
4. Add start/stop timer commands with duplicate-timer and rate-limit handling.
5. Expose timer tools through the existing Remote MCP rather than creating a second Agent API.

### Phase 3: Agent recipes

- Publish an OpenClaw setup recipe using the existing OAuth Remote HTTP MCP endpoint.
- Publish a Hermes Agent setup recipe with recommended read, write, and batch tool filters.
- Reuse the QuestForge skill and the same permission scopes for both Agents.
- Keep batch writes dry-run by default and continue to avoid destructive Quest deletion.

## 7. Web UI connection flow

Open the QuestForge `AI・サービス連携` screen. The setup panel guides the user through the same four steps for Google Calendar, Google Tasks, and Notion:

1. Sign in to QuestForge with the `Googleでログイン` button.
2. Select a service and press `接続する` to complete the provider OAuth consent.
3. Select calendars, one Google Tasks list, or the Notion parent page, then press `設定を保存`.
4. Press `実データ確認`, review the preview, and only then press `確認して同期`.

Google Calendar and Google Tasks share one Google provider consent. Calendar is read-only schedule display, Google Tasks is bidirectional without deletion, and Notion writes one daily `QuestForge Logs` row. A `管理者設定待ち` status means the Worker Secrets in sections 2, 4, and 5 are not registered yet; it is not a user OAuth failure.

The current app keeps unauthenticated data on the current device. The first To Do is added from the empty state, while the sample habits, dailies, and rewards remain available. Existing saved data is never deleted by the guest onboarding change.

## 8. Battle prototype boundary

The Unity experiment lives in `unity-battle-prototype/` and loads an offline JSON fixture. The versioned data contract is `api/battle-contract.v1.json`. Unity does not connect to Firebase directly. Production battle endpoints remain a later phase:

- `GET /v1/battle/session`
- `POST /v1/battle/commands`
