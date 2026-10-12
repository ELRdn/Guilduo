# Guilduo workflow plugin sources

This directory is the repository-side handoff package for a Guilduo remote MCP App. The existing directory name is retained as a compatibility-sensitive legacy identifier.
It is a registration template, not an installable connection by itself. It does not contain a real
OpenAI technical app ID, provider secret, Appwrite token, or deployment credential.

For a working local package, follow [Guilduo plugin setup](../../docs/guilduo-plugin-setup.md).
The [multihost roadmap](../../docs/guilduo-plugin-roadmap.md) tracks OpenAI, Claude,
Grok Bot, Muse Code, Pi and the isolated DSH PoC. The base manifest candidate is
`0.6.0-beta.11`; the next DSH/OpenCode/OpenClaw candidates are unpublished `0.6.0-beta.15`.
Installed OpenAI `0.6.0-beta.9` and normal/hook `0.6.0-beta.10` / `0.6.0-beta.10.hooks`
outputs remain historical evidence of the old Skill name. `tools/package-guilduo-plugins.mts` rebuilds the five host targets
and their Windows ZIP/Pi tgz archives with source-hash checks; DSH keeps its isolated build.
`tools/prepare-guilduo-plugin.mts` bundles the current Skill with either an existing registered App
or the official OAuth MCP endpoint. It removes the unused connection and registration placeholder.
The generated companion and Skill are named `guilduo-workflows`; invoke the Codex companion Skill
as `$guilduo-workflows:guilduo-workflows`. The Skill rename was explicitly approved on 2026-10-10;
OAuth, MCP, package, plugin and storage IDs remain unchanged. New distributions contain only the
new Skill name. After a new release, update the plugin and restart the host; users must remove or
replace an old standalone Skill to avoid duplicate installation. User settings are not changed
automatically. See the [migration contract](../../docs/guilduo-workflows-migration.md).
A legacy QuestForge connection is not the current Guilduo App.

## What is already linked

- `plugin.json` declares the bundled Guilduo workflow Skill and supported listing/review metadata.
- `.mcp.json` points to the stable `/mcp` endpoint and uses OAuth.
- `.app.json` is a local registration placeholder.
- `openai-submission.json` is an operator checklist, not a dashboard import schema or an approval.
- `skills/guilduo-workflows/` contains the same safety-first Skill shipped in the main repo.
- `hooks/` contains opt-in local SessionStart / Stop hooks, excluded from the public package.
- `assets/guilduo-icon.png` reuses the approved 48×48 Guilduo favicon.
- `LICENSE` includes the repository's AGPL-3.0 license text for distribution.

## Registration handoff

Generate the public staging package with `npx tsx tools/prepare-guilduo-plugin.mts --submission`.
It includes the direct HTTPS MCP endpoint, canonical Skill, icon, listing URLs, five positive and
three negative review cases. It excludes `.app.json` and lifecycle hooks, which the current public
submission flow does not accept. Keep reviewer credentials and demo acceptance outside the ZIP.

Follow [the submission guide](../../docs/guilduo-plugin-submission.md) for ZIP creation, domain
verification, OAuth, real-account review cases, scans, submission, and the separate Publish step.
Update the existing Guilduo draft when available rather than creating another listing.

The official review is separate from local Plugin validation. A successful local validation means
the package shape is valid; it is not an OpenAI approval.

## Safety contract

The Skill reads state before writing, previews supported changes, executes within existing authorization,
never deletes quests, and keeps Agent creation and permission expansion in the authenticated web UI.
External Google Calendar, Google Tasks, Notion, and Toggl provider OAuth is marked as Early Access /
preparation in the public beta until operator credentials and review gates are complete.

Standing phase-update permission applies only to the identified work. Installing the plugin is not
permission to capture unrelated conversations. Progress never implies completion, rewards, or Human
approval. Skill activation is best effort; local Stop hooks provide a bounded reminder, not a direct
authenticated MCP writer.
