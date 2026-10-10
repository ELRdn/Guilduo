# Guilduo OpenAI Plugin / MCP App package

This beta.12 directory is the repository-side template for Guilduo plugin generation. The existing directory name and template name `questforge` are retained as compatibility-sensitive legacy identifiers.
It is a registration template, not an installable connection by itself. It does not contain a real
OpenAI technical app ID, provider secret, Appwrite token, or deployment credential.

For a working local package, follow [Guilduo plugin setup](../../docs/guilduo-plugin-setup.md).
`tools/prepare-guilduo-plugin.mts` bundles the current Skill with either an existing registered App
or the official OAuth MCP endpoint. It removes the unused connection and registration placeholder.
The generated companion is named `guilduo-workflows`; existing `questforge` plugin, MCP and Skill IDs
remain unchanged. A legacy QuestForge connection is not the current Guilduo App.

## What is already linked

- `.codex-plugin/plugin.json` uses the remote MCP connection by default and keeps the template ID `questforge`.
- `.mcp.json` points to the stable `/mcp` endpoint and uses OAuth.
- `.app.json` and `.app.json.example` remain optional local registration examples; the template manifest does not load them alongside MCP.
- `openai-submission.json` is a review checklist payload, not an approval.
- `skills/questforge-workflows/` retains historical compatibility assets. The generator copies the complete current canonical `skills/guilduo-workflows/` and all references unchanged.

Install the canonical Codex source from `plugins/guilduo-workflows` through the
`guilduo-local` marketplace (`guilduo-workflows@guilduo-local`). Its compatibility
manifest loads remote OAuth MCP and explicitly reviewed/trusted hooks. Native
Codex packages omit root `plugin.json`: Codex 0.159.2 does not load bundled hooks
from the portable manifest path. The separate OpenAI public ZIP keeps portable
metadata and excludes hooks and App references. A registered App companion is
local only and replaces the remote MCP connection under the same plugin identity.
Do not activate both companion and standard copies. See the generated hooks README
for Codex beta.12 receipt gates; Claude/Muse optional hooks retain their legacy mode.

## Registration handoff

1. Deploy and smoke-test the Worker and Appwrite beta first.
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
