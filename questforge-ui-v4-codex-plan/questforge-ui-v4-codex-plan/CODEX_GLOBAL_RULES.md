# QuestForge UI v4 — Codex Global Rules

Use these rules at the top of every UI v4 Codex task.

## Read first

1. `AGENTS.md`
2. `DESIGN.md`
3. `interaction-lab/DESIGN.md` when working on `/next/`
4. `PROJECT_SPEC.md`
5. task-specific Golden Screenshot

## Non-negotiable

- Do not use Golden screenshots as background images or baked UI.
- Reconstruct the UI from React components, SVG, CSS and actual project assets.
- Do not silently change Quest / Agent / Handoff / auth / MCP / REST / schema behavior.
- Do not invent colors, gradients, glow, large radii or generic SaaS card patterns that conflict with DESIGN.md.
- Prefer real QuestForge assets over placeholder sprites when rights are clear.
- Preserve Human / Astra / Agent semantic separation.
- Handoff must remain a connected visual structure where required; do not collapse it to a badge for convenience.
- Do not declare completion before running relevant checks and taking screenshots.

## Implementation standard

- TypeScript strict.
- Reuse shared primitives; do not fork visual components per screen without reason.
- SVG for responsive connection/graph geometry.
- DOM for data-heavy content and forms.
- Prefer deterministic data-driven layout over hardcoded JSX coordinates.
- Keep layout composition responsive by mode, not just proportional shrinking.
- Add aria labels / keyboard behavior for custom visualization controls.

## Completion report

Always report:

1. files changed
2. architectural decisions
3. commands run
4. test/build results
5. screenshot paths
6. known differences from Golden
7. anything blocked or intentionally deferred
