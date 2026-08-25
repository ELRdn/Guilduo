# QuestForge Agent Guidance

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

- Keep the root surface and `/next/` surface responsibilities separate.
- Treat `/interaction-lab/` as the local development route and `/next/` as the built public beta route.
- Run `npm run design:check` after changing design documents, tokens, components, screens, or asset references.
- Run the relevant type checks, tests, build, contract checks, and visual validation before declaring a change complete.
