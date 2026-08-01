# QuestForge Gateway setup

Firebase Hosting serves the web app. REST, OAuth, MCP, webhooks, plugins, and external adapters run on Cloudflare Workers.

## 1. Create Cloudflare resources

```bash
npx wrangler login
npx wrangler kv namespace create QUESTFORGE_KV
```

Add the returned namespace to `wrangler.jsonc`:

```json
"kv_namespaces": [{ "binding": "QUESTFORGE_KV", "id": "returned-id" }]
```

The KV binding is required for persistent OAuth clients, access tokens, webhooks, plugin installs, and retry records.

## 2. Add Firebase service credentials

In Firebase Console, open Project settings > Service accounts and generate a private key. Do not add the downloaded JSON to this project.

```bash
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
```

Use the `client_email` and `private_key` values from the downloaded JSON.

In Firebase Console > Authentication > Settings > Authorized domains, add the deployed `workers.dev` hostname. Otherwise the OAuth approval page cannot open Google sign-in.

## 3. Optional integration credentials

```bash
npx wrangler secret put GOOGLE_ACCESS_TOKEN
npx wrangler secret put TOGGL_API_TOKEN
npx wrangler secret put TODOIST_ACCESS_TOKEN
npx wrangler secret put NOTION_ACCESS_TOKEN
npx wrangler secret put NOTION_DATABASE_ID
npx wrangler secret put CHAT_WEBHOOK_URL
```

Google access tokens expire. Calendar and Tasks can call the real APIs now, while provider-specific refresh-token OAuth remains the next integration milestone.

## 4. Deploy

```bash
npm run worker:deploy
```

Set `PUBLIC_BASE_URL` to the exact `workers.dev` origin and redeploy. Verify `/health`, then register the `/mcp` URL in an AI client.

```bash
npx wrangler secret put PUBLIC_BASE_URL
```

## Local development

Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill local values.

```bash
npm run worker:dev
```

Use a Firebase ID token as a bearer token, or set `DEV_BEARER_TOKEN` and `DEV_USER_ID` for local testing.
