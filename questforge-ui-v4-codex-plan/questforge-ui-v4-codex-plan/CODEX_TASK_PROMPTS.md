# QuestForge UI v4 — Codex Task Prompts

These prompts are intentionally scoped. Run them sequentially unless the Master Plan says a task is safe to parallelize.

---

## Task 00 — Repo Audit

Read `CODEX_GLOBAL_RULES.md` and `UI_V4_CODEX_MASTER_PLAN.md` first.

Audit the current QuestForge repository for UI v4 without making the visual rewrite yet.

Required output:

- `docs/ui-v4/BASELINE_AUDIT.md`
- map Current `/` and Next `/next/` entrypoints
- identify actual design tokens / CSS architecture
- locate real QuestForge character/boss/equipment assets and note license/source metadata available in repo
- identify reusable components for Sidebar, Status, Quest, Agent, Inspector, Dialog, Toast, Battle
- identify where Handoff state is modeled
- identify existing browser/screenshot tests
- run current check/typecheck/test/build commands
- capture baseline screenshots at 1440×900 for Current and Next
- propose the smallest component/file architecture for Phase 1

Do not change REST/MCP/schema/domain behavior.
Do not start Golden screen implementation in this task.

---

## Task 01 — UI Foundation

Read all global rules and the baseline audit.

Implement Phase 1 only: shared UI v4 foundation.

Build/refactor semantic tokens and reusable primitives required by both surfaces:

- AppShell
- Sidebar
- TopStatusStrip
- Workspace
- InspectorRail
- Panel
- Button/IconButton
- StatusBadge
- Progress/Gauge
- HumanAvatar/AgentAvatar/CharacterSprite
- QuestCode
- HandoffStep
- Tooltip/Toast
- loading/empty/error primitives

Requirements:

- Current and Next keep distinct semantic theme mappings
- Light/Dark parity
- focus-visible
- reduced-motion utility/hook
- no arbitrary new visual language
- no broad screen redesign yet

Run checks and capture screenshots of representative primitive states.

---

## Task 02 — Golden A: Current Party Formation

Reference: `docs/reference/ui-v4/current-party.png`

Implement the Current `/` Party screen to >=90 Visual Fidelity using the Master Plan rubric.

Key requirement: this must read immediately as an RPG Party Formation scene, not a generic member-card grid.

Use:

- actual project sprites where available
- data/config-driven formation positions
- SVG formation links
- strong central commander/banner composition
- HP/MP/Quest Load/Sync information
- right Party Summary/Synergy panel
- compact Bench row

Implement member selection and leader assignment. Preserve existing domain behavior.

Capture screenshots at 1920×1080, 1440×900, 1280×720, Light and Dark.
Self-score against the rubric and list every known mismatch.

Do not move to another screen in this task.

---

## Task 03 — Golden B: Next Integrations

Reference: `docs/reference/ui-v4/next-integrations.png`

Implement the `/next/` Integration Control Plane to >=90 Visual Fidelity.

Replace CSS line hacks with a real SVG edge layer whose paths terminate at node anchors and respond to layout changes.

Required:

- central QuestForge Core Orchestrator
- surrounding integration nodes
- semantic connection status
- node hover edge highlight
- node selection updates Inspector
- network selection synchronizes with lower table row
- fixed Next Agent Status Rail remains visible
- no orphan or viewport-crossing accidental lines

Capture required screenshots and self-score.

Do not redesign unrelated tabs.

---

## Task 04 — Golden C: Next Quest Tree

Reference: `docs/reference/ui-v4/next-quest-tree.png`

Implement the `/next/` Quest Dependency Graph to >=90 Visual Fidelity.

The graph must be data-driven and deterministic; do not hardcode every coordinate directly in JSX.

Required:

- root campaign node
- workstream/category hierarchy
- compact task leaves
- semantic statuses
- node selection
- collapse/expand
- hide completed
- filter
- zoom/pan/reset
- accessible alternative/list semantics
- fixed Agent Status Rail

Keep interactions responsive with 50–100 nodes.
Capture screenshots and self-score.

---

## Task 05 — Gate A Correction Pass

Do not add new screens.

Use Web Chat review feedback for Golden A/B/C.
Fix only the listed P0/P1 visual discrepancies.

After corrections:

- rerun checks
- recapture 1440×900 Light/Dark screenshots
- rescore all three Golden screens
- produce `docs/ui-v4/GATE_A_REPORT.md`

Gate A passes only when all three are >=90 and no critical accessibility or domain regression exists.

---

## Task 06 — Current Guild OS Rollout

Only run after Gate A passes.

Apply proven v4 patterns to remaining Current screens:

- Today Mission Line
- Campaign Map
- Battle Scene
- Connections Map
- Commander Profile
- Settings

Do not make every screen share the same layout. Preserve each Signature UI while reusing tokens/primitives/graph techniques.

Target >=88 per screen before motion.

---

## Task 07 — Next Command Center Rollout

Only run after Gate A passes.

Apply proven v4 patterns to:

- Today / Quest Handoff Table
- Agent Operations Grid
- Human Intervention Review Queue
- Productivity Impact Board
- Party / Workforce matrix
- Human Operator Dashboard
- Control Plane Settings

Keep Handoff, Agent load, review pressure and risk first-class.
Target >=88 per screen before motion.

---

## Task 08 — Motion Layer

Add motion only after static visual/composition gates pass.

Implement three tiers:

- Micro 100–180ms
- State 180–350ms
- Reward 350–800ms

Priority motion:

- Handoff current step change
- Inspector selection change
- graph expand/collapse
- party member swap
- Agent state change
- Current Quest complete / MP / XP / Boss response

Support `prefers-reduced-motion` and make all meaning available without animation.

---

## Task 09 — Responsive / A11y / i18n

Implement composition modes:

- Full >=1440
- Compact 1100–1439
- Focused 901–1099
- Mobile <=900

Do not simply shrink the Full layout.

Run required viewport matrix, keyboard navigation, focus-visible, reduced-motion, long label tests, and representative 9-language checks.

---

## Task 10 — Product Polish / Final Visual QA

Perform final polish only; no new product features.

Review:

- 1–2px alignment
- typography rhythm
- icon optical alignment
- divider contrast
- empty/loading/error/stale/reconnect states
- Light/Dark
- 100%/125% scaling
- screenshot matrix
- visual fidelity rubric

Produce `docs/ui-v4/FINAL_UI_V4_REPORT.md` with per-screen scores and remaining deviations.
