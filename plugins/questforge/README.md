# Guilduo OpenAI Plugin / MCP App package

This directory is the repository-side handoff package for a Guilduo remote MCP App. The existing directory name is retained as a compatibility-sensitive legacy identifier.
It is intentionally prepared for registration, but it does not contain an OpenAI technical
app ID, provider secret, Firebase token, or deployment credential.

## What is already linked

 - `plugin.json` declares the bundled Guilduo workflow Skill.
- `.mcp.json` points to the stable `/mcp` endpoint and uses OAuth.
- `.app.json` is a local registration placeholder.
- `openai-submission.json` is a review checklist payload, not an approval.
- `skills/questforge-workflows/` contains the same safety-first Skill shipped in the main repo.

## Registration handoff

1. Deploy and smoke-test the Worker and Firebase beta first.
2. In the OpenAI developer dashboard, create a remote MCP App and copy the technical ID.
3. Copy `.app.json.example` to `.app.json` and fill the technical ID and approved public URLs.
4. Confirm the OAuth metadata endpoint, privacy policy, terms, account deletion path, and support contact.
5. Submit the app for review from the dashboard. Guilduo contributors perform this human step.

The official review is separate from local Plugin validation. A successful local validation means
the package shape is valid; it is not an OpenAI approval.

## Safety contract

The Skill reads state before writing, previews batch changes, requires confirmation for execution,
never deletes quests, and keeps Agent creation and permission expansion in the authenticated web UI.
External Google Calendar, Google Tasks, Notion, and Toggl provider OAuth is marked as Early Access /
preparation in the public beta until operator credentials and review gates are complete.
