# Guilduo Agent Guidance

## Brand naming

- Public product name: **Guilduo**
- Japanese pronunciation: **ギルデュオ**
- Relay Forge UI label: **Guilduo / Relay Forge**
- QuestForge is the legacy public name. Compatibility-sensitive identifiers such as package names, CLI commands, MCP IDs, environment variables, storage keys, routes, schemas, types, events, and existing file paths must not be renamed without an explicit migration plan.
- Brand source of truth: [BRAND.md](BRAND.md)

## Public URL policy

- Read [docs/public-urls.md](docs/public-urls.md) before adding or changing a user-facing link.
- Official site: https://guilduo.com/
- Official Web App: https://app.guilduo.com/ — the public **Guilduo / Relay Forge** entry.
- Official MCP endpoint: https://mcp.guilduo.com/mcp
- Appwrite API endpoint: https://api.guilduo.com/v1
- app.guilduo.com/next/relay-forge/ is an internal deployment and compatibility path, not a new-user entry point.
- Old workers.dev and Appwrite generated domains are compatibility or rollback surfaces only.
- Keep QuestForge in compatibility-sensitive technical identifiers, but use Guilduo and Guilduo / Relay Forge in new public copy and links.

## Before UI changes

- Read [`DESIGN.md`](DESIGN.md) before changing visual identity, layout, components, interaction states, motion, or accessibility.
- When changing `/next/`, also read [`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md) and follow its delta rules.
- For component changes, read [`design/COMPONENTS.md`](design/COMPONENTS.md); for a screen change, read [`design/SCREENS.md`](design/SCREENS.md).
- When adding or changing imagery, read [`design/ASSET_MANIFEST.md`](design/ASSET_MANIFEST.md) and confirm the allowed Surface before editing code.
- Do not invent colors, gradients, rounded-card patterns, icons, or motion that conflict with the design documents.

## Before product or API changes

- Read [`PROJECT_SPEC.md`](PROJECT_SPEC.md) before changing Quest behavior, Firebase data, REST, MCP, authentication, synchronization, Agent, Handoff, or release behavior.
- Treat `api/openapi.json`, `api/mcp-tools.json`, shared domain code, and schema definitions as compatibility boundaries.

## Validation

- Keep the root surface and `/next/` implementation surface responsibilities separate.
- Treat `/interaction-lab/` as the local development route, app.guilduo.com/ as the official Web App, and `/next/relay-forge/` as its compatibility/deployment path.
- Run `npm run design:check` after changing design documents, tokens, components, screens, or asset references.
- Run the relevant type checks, tests, build, contract checks, and visual validation before declaring a change complete.
