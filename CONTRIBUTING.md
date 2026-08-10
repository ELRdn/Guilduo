# Contributing

Thanks for helping QuestForge become a distinct, reliable task RPG.

## Before A Change

1. Open an issue for broad product, schema, security, or visual-direction changes.
2. Keep Unity work separate; the Unity Battle Lab is pending.
3. Preserve private Firebase state and D1 social boundaries.
4. Do not add a destructive quest delete API. Use archive behavior.

## Development

```bash
npm install
npm run api:generate
npm run check
npm test
npm run build
```

Add focused tests for behavior changes. REST and MCP operations must share the same domain logic. Batch, archive, integration, and battle writes should preview first when practical.

## Design And Copy

- Keep the interface quiet, practical, and readable on 360px mobile through desktop.
- Use natural Japanese and clear English rather than literal internal terminology.
- Respect reduced motion and keyboard navigation.
- Avoid recreating Habitica screens or assets. Build around QuestForge's MP planning, command battle, agent assignments, and social party model.

## Pull Requests

Describe the user problem, implementation, validation, data migration, and residual risk. Do not include credentials, personal project IDs, generated build folders, or local absolute paths.

By contributing, you agree that your contribution is licensed under `AGPL-3.0-only`.
