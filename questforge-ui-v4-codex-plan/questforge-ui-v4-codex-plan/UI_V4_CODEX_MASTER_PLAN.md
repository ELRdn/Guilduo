# QuestForge UI v4 — Codex Implementation Master Plan

最終更新: 2026-08-18
対象: QuestForge Current `/` Guild OS / Next `/next/` Agent Command Center
目的: ImageGenで確定したGolden Screensを、実際のQuestForge repoへTypeScript + React + SVG +実Asset + Motionで製品品質まで実装する。

---

## 0. Executive Summary

QuestForge UI v4は、一発全面改修を禁止する。

現在のReact v3は、情報構造とコンセプトの検証用プロトタイプとして約60〜70%の再現度に到達しているが、以下がGolden Screenとの差として残る。

- Graph / Connections / Handoffの線がCSS座標依存で、Nodeへ正確に追従しない
- Party FormationがSceneではなくCard配置に見える
- 実Assetではなく仮Sprite / placeholderが多い
- 大画面ImageGenの構図を通常DOMへ直接縮約しており、モニター幅で空白や密度が崩れる
- Secondary tabsの一部はSignature UIよりGeneric dashboardへ寄る
- Motion、loading、empty、error、keyboard、reduced-motionなど製品状態が未完成

v4では以下の順で品質をロックする。

```text
60–70%  Current prototype
   ↓
Phase 0  Baseline / Repo Audit
   ↓
Phase 1  UI Foundation                  ~80%
   ↓
Phase 2  Golden: Current Party          90%+
   ↓
Phase 3  Golden: Next Integrations      90%+
   ↓
Phase 4  Golden: Next Quest Tree        90%+
   ↓
GATE A   Visual Architecture Proven
   ↓
Phase 5  Remaining Current Screens      88–92%
   ↓
Phase 6  Remaining Next Screens         88–92%
   ↓
Phase 7  Motion Layer                   92–94%
   ↓
Phase 8  Responsive / A11y / i18n       94%+
   ↓
Phase 9  Product Polish / Visual QA      95% target
```

最重要ルール:

> **Golden Screenshotを背景画像として貼らない。GoldenはComposition / density / hierarchy / proportionsの視覚正本として使い、UIは実React componentとして再構築する。**

---

# 1. Source of Truth Order

CodexはUI作業開始前に、必ず次の優先順位で読む。

1. `AGENTS.md`
2. root `DESIGN.md`
3. `/next/`の場合 `interaction-lab/DESIGN.md`
4. `PROJECT_SPEC.md`
5. Golden Screenshot
6. 現在の実装

競合した場合は上位を優先する。

Golden Screenshotは以下について規範的である。

- Composition
- visual hierarchy
- panel proportions
- information density
- alignment
- spacing rhythm
- Signature UIの存在感
- Assetの大きさ・使い方

Golden Screenshotは以下について規範的ではない。

- ダミーのQuest本文
- サンプル数値
- サンプルAgent名
- API / Schema / domain behavior
- 実データ契約

ドメイン挙動は`PROJECT_SPEC.md`と既存テストを優先する。

---

# 2. Canonical Golden Screens

最低限、以下をrepoの`docs/reference/ui-v4/`へ置く。

## Current / Guild OS

- `current-light.png` — Today / Mission Line
- `current-dark.png` — Today dark
- `current-quest-tree.png` — Campaign Map
- `current-party.png` — Party Formation **Golden A**
- `current-battle.png` — RPG Battle
- `current-integrations.png` — Connections Map
- `current-profile.png` — Commander Profile

## Next / Agent Command Center

- `next-light.png` — Today / Dense Handoff Table
- `next-dark.png` — Today dark
- `next-quest-tree.png` — Dependency Graph **Golden C**
- `next-agents.png` — Agent Operations Grid
- `next-battle.png` — Productivity Impact Board
- `next-integrations.png` — Integration Control Plane **Golden B**
- `next-profile-latest.png` — Human Operator Dashboard

初回SprintではGolden A/B/Cだけを90%以上へ持っていく。

---

# 3. UI v4 Definition of Done

UI v4完成は「見た目が近い」だけではない。以下をすべて満たす。

## Visual

- Golden 3 ScreensはVisual Fidelity Score >= 90/100
- その他主要Desktop screens >= 88/100
- 最終polish後、主要screen平均95を目標
- Light / Darkで同じInformation Architectureを維持
- Generic AI SaaS / card-wallへ退化しない

## Functional

- 既存Quest / Agent / Handoff / Battle / auth / MCP契約を破壊しない
- 既存操作の回帰テストに合格
- Graph node selection、Inspector、filters、HandoffなどSignature UIが実際に操作可能
- Placeholder screenshotをUIとして使用しない

## Responsive

- Full: >= 1440px
- Compact: 1100–1439px
- Focused: 901–1099px
- Mobile: <= 900px
- Desktopを単純縮小してMobile化しない

## Quality

- `npm run typecheck`
- `npm test`
- `npm run build`
- visual screenshot suite
- keyboard navigation
- reduced motion
- long Japanese / English / German / Russian labels
- no horizontal overflow at required widths

---

# 4. Responsibility Split — Web Chat vs Codex

## Web Chat owns

- Screen concept
- DESIGN.md
- Golden Screenshot
- Acceptance Criteria
- visual review
- comparison feedback
- design decisions when implementation reveals ambiguity

## Codex owns

- repo audit
- component architecture
- React / TypeScript
- SVG / graph layout
- actual asset integration
- state / interactions
- motion implementation
- responsive implementation
- tests / typecheck / build
- screenshot generation
- fixing differences from Web Chat review

## Handoff Loop

```text
Web Chat: spec / Golden / acceptance
        ↓
Codex: plan → implement → validate → screenshot
        ↓
Web Chat: visual review / discrepancy list
        ↓
Codex: targeted corrections
        ↓
repeat until gate passes
```

---

# 5. Technical Architecture Target

UI v4は「全部DOM + CSS」で作らない。

```text
React + TypeScript
│
├─ DOM / CSS Grid
│  ├─ App Shell
│  ├─ Tables
│  ├─ Inspector
│  ├─ Status Grid
│  ├─ Settings
│  └─ Profile data
│
├─ SVG Visualization Layer
│  ├─ Handoff connectors
│  ├─ Party Formation links
│  ├─ Campaign Map
│  ├─ Dependency Graph
│  ├─ Integration Network
│  └─ Agent handoff network
│
├─ Layout Engine
│  ├─ graph node coordinates
│  ├─ edge routing
│  └─ collision / spacing
│
├─ Asset Layer
│  ├─ actual character sprites
│  ├─ bosses
│  ├─ equipment
│  └─ QuestForge project assets
│
└─ Motion Layer
   ├─ micro interaction
   ├─ state transition
   └─ reward feedback
```

## Use SVG when

- connection line must attach to moving/responsive nodes
- node graph exists
- zoom/pan is required
- path status needs visual encoding

## Use normal React DOM when

- forms
- tables
- inspector
- card/list information
- status panels
- settings
- text-heavy content

---

# 6. Phase 0 — Repo Audit & Baseline

## Goal

変更前に現行QuestForgeのUI / asset / state / tests / API boundaryを把握し、v3 prototypeを本番実装へ雑にコピーしない。

## Codex tasks

1. Read all source-of-truth docs.
2. Map current UI architecture.
3. Identify reusable components.
4. Locate actual project assets.
5. Identify current route structure for `/` and `/next/`.
6. Identify tests covering Quest / Agent / Handoff / Battle / responsive behavior.
7. Run baseline commands.
8. Capture baseline screenshots at required widths.
9. Produce implementation plan only. Do not perform visual rewrite yet.

## Deliverable

`docs/ui-v4/BASELINE_AUDIT.md`

Must include:

- relevant file map
- reusable components
- risky coupling
- current asset paths
- current CSS/token architecture
- test commands
- screenshot routes
- migrations that are unnecessary
- recommended v4 component structure

## Gate 0

No implementation begins until baseline tests are green or existing failures are documented.

---

# 7. Phase 1 — UI Foundation

## Goal

Golden screen実装の前に共通基盤を固定する。

## Build / refactor

- semantic design tokens
- Current / Next surface theme mappings
- Light / Dark token mapping
- `AppShell`
- `Sidebar`
- `TopStatusStrip`
- `Workspace`
- `InspectorRail`
- `Panel`
- `Button`
- `IconButton`
- `StatusBadge`
- `ProgressBar`
- `Gauge`
- `HumanAvatar`
- `AgentAvatar`
- `CharacterSprite`
- `QuestCode`
- `HandoffStep`
- `Tooltip`
- `Toast`
- common loading / empty / error states

## Foundation constraints

- no new arbitrary color
- panel radius <= DESIGN.md rules
- no glassmorphism / glow
- no mixed icon libraries
- no per-screen duplicate Button implementation
- no hard-coded character placeholders when a project asset exists

## Gate 1

Before Golden screens:

- tokens used by all new components
- Light/Dark parity
- focus-visible
- reduced-motion hook available
- components render at 100% / 125% browser scale
- no visual regressions in untouched screens

---

# 8. Phase 2 — Golden A: Current Party Formation

Reference: `docs/reference/ui-v4/current-party.png`

## Goal

Current `/`の「RPG Menu × Productivity」をReactで本当に成立させる。

## Signature UI

**Party Formation Scene**

Not acceptable:

- generic member card grid
- huge blank canvas with cards floating in it
- placeholder rectangles as main character art

## Required visual structure

- Commander is visually central / primary
- Astra is clearly companion but separate from user
- 3 core AI members form a visible formation
- guild banner / formation center visually binds the party
- character pedestal / sprite presence is strong
- HP / MP / Quest Load / Sync level visible near members
- Party Summary and Synergy stay in right panel
- Bench row is visually distinct and compact
- Formation scene consumes the main viewport, not a tiny block

## Required implementation

- real QuestForge assets where available
- formation coordinates driven by data/config
- SVG links between party positions
- selected member state
- leader assignment
- bench swap / member selection interaction
- layout adapts to Compact mode

## Motion later

Do not implement reward motion in this phase, but architecture must allow:

- member swap transition
- leader badge transition
- link highlight

## Golden A Gate

Visual Fidelity >= 90.

Mandatory reviewer questions:

1. Does it look like a Party Formation screen before reading text?
2. Is the central character/flag composition obvious?
3. Are pixel assets dominant enough to create RPG identity?
4. Does information remain operational, not decorative only?
5. Is blank space intentional rather than accidental?

---

# 9. Phase 3 — Golden B: Next Integration Control Plane

Reference: `docs/reference/ui-v4/next-integrations.png`

## Goal

CSS line hacksを廃止し、実用的なControl Plane networkを作る。

## Signature UI

**QuestForge Core Orchestrator + Integration Network**

## Required visual structure

- QuestForge core is visually central
- integration nodes arranged around core with balanced radial/structured layout
- lines terminate exactly at node anchor points
- no line may continue through/outside the canvas unintentionally
- selected node updates right Inspector
- lower connection table aligns with network data
- fixed Agent Status Rail remains visible on Next

## Required implementation

### SVG Network

Each node exposes anchor points.

```text
node rect
  ├─ top
  ├─ right
  ├─ bottom
  └─ left
```

Edges route between computed anchors.

Do not draw edges with arbitrary CSS transforms.

### Interaction

- node hover → highlight connected edge
- node click → selected state + Inspector
- connection status affects edge treatment
- filter by status / type
- optional pan only if needed; default layout must fit Full mode

### Data / Table sync

Selecting a network node must also select/scroll/highlight the matching connection table row.

## Golden B Gate

Visual Fidelity >= 90.

Must pass:

- no orphan edge
- no edge crossing label text where avoidable
- no overflow at 1440px Full target
- 125% browser scaling still usable
- selected Inspector visible without replacing Agent Status Grid

---

# 10. Phase 4 — Golden C: Next Quest Dependency Graph

Reference: `docs/reference/ui-v4/next-quest-tree.png`

## Goal

静的な手配置ではなく、Quest dataから自動配置されるDependency / Work Graphを実装する。

## Signature UI

**Quest Line → Workstream → Task dependency graph**

## Required visual structure

- root / campaign node at left or primary origin
- category/workstream nodes as second hierarchy
- task leaves compact and dense
- status visible by semantic token + text/icon
- selected node obvious
- right Agent Status Rail remains fixed
- graph is denser than Current Campaign Map and looks operational

## Required implementation

- data-driven graph nodes/edges
- deterministic layout
- zoom
- pan
- reset view
- node selection
- collapse / expand
- hide completed
- status filter
- keyboard reachable nodes or equivalent accessible list fallback
- Inspector link to selected Quest

Do not manually hardcode each node coordinate in JSX.

## Golden C Gate

Visual Fidelity >= 90.

Performance target:

- 50–100 nodes remain responsive on target desktop
- interactions do not trigger unnecessary whole-app rerenders

---

# 11. GATE A — Visual Architecture Proven

Only after Golden A/B/C all pass >=90 may Codex continue to all screens.

At this point Web Chat reviews:

- Golden screenshot
- implementation screenshot
- difference list
- component architecture

If one Golden screen <90, do not compensate by starting more screens.

---

# 12. Phase 5 — Current / Guild OS Rollout

Apply proven components to:

1. Today — Vertical Mission Line
2. Explore — Campaign Map
3. Party — already Golden
4. Battle — RPG Battle Scene
5. Connections — Connections Map
6. Profile — Commander Character Sheet
7. Settings — Guild Settings

## Current-specific rule

Current must feel like:

> **RPG Menu × Productivity / Guild OS**

Pixel characters and RPG state may have stronger visual presence than Next, but task decision remains primary.

## Per-screen Signature UI

- Today: Mission Line
- Explore: Campaign Map
- Party: Party Formation
- Battle: Battle Scene
- Connections: Guild Connections Map
- Profile: Commander Character Sheet
- Settings: ordinary but polished Guild Settings

---

# 13. Phase 6 — Next / Agent Command Center Rollout

Apply proven components to:

1. Today / Quest — Dense Quest + Handoff Table
2. Quest Tree — already Golden
3. Agents — Agent Operations Grid
4. Review — Human Intervention Queue
5. Battle — Productivity Impact Board
6. Party — Workforce / Human+AI matrix
7. Integrations — already Golden
8. Profile — Human Operator Dashboard
9. Settings — Control Plane Settings

## Next-specific rule

Next must feel like:

> **AI Agent Command Center**

The user must understand in seconds:

- what work exists
- who currently holds it
- which agents are busy
- where Human review is required
- what is blocked / risky

Handoff remains structural, not a badge-only status.

---

# 14. Phase 7 — Motion Layer

Motion is added only after layout and interactions are stable.

## Tier 1 — Micro / 100–180ms

- hover
- button press
- selection
- tooltip
- small status transition

## Tier 2 — State / 180–350ms

- Inspector change
- graph node expand
- Handoff current step change
- Agent working → review
- party member swap

## Tier 3 — Reward / 350–800ms

Current only / RPG-heavy contexts:

- Quest Complete
- +MP
- +XP
- Boss Pressure change
- Battle result
- Level up

## Motion restrictions

- no bounce-heavy SaaS motion
- no decorative endless animation
- no layout animation that moves the user’s target unexpectedly
- `prefers-reduced-motion` disables movement/particle/reward animation
- meaning must survive without animation

---

# 15. Phase 8 — Responsive Composition

Do not create responsiveness by continuously shrinking Full layout.

## Full — >=1440

- Golden composition
- left Sidebar + main Workspace + right Rail where applicable
- all important columns visible

## Compact — 1100–1439

- reduce summary text
- compress auxiliary metrics
- preserve Handoff / Holder / Risk
- Inspector may narrow

## Focused — 901–1099

- prioritize main workflow
- secondary Inspector may become drawer
- Agent review summary stays visible
- graphs remain usable with pan/zoom

## Mobile — <=900

Separate composition:

- header
- main content
- bottom nav
- selected detail → bottom sheet
- Agent / party overview moves below primary flow
- Handoff must remain visible as steps, not collapse into a single badge

---

# 16. Phase 9 — Product Polish

Final 10% work:

- 1–2px alignment
- line-height
- icon optical alignment
- divider contrast
- loading states
- skeleton states
- empty states
- error / stale / reconnect states
- disabled reason
- keyboard behavior
- focus order
- long labels
- 9-language regression
- Light/Dark contrast
- browser 100% / 125% scaling
- 1920×1080
- 1440×900
- 1280×720
- 1024×900
- 412×915
- 390×844

---

# 17. Visual Fidelity Scoring Rubric

Score every Golden screen out of 100.

| Category | Points |
|---|---:|
| Composition / major regions | 25 |
| Information hierarchy | 15 |
| Geometry / spacing / alignment | 15 |
| Typography / tokens / contrast | 10 |
| Asset fidelity / pixel identity | 10 |
| Signature UI accuracy | 10 |
| Interaction/state fidelity | 5 |
| Responsive behavior | 5 |
| Accessibility / reduced motion readiness | 5 |
| **Total** | **100** |

## Gate thresholds

- Golden Screen: >= 90
- no Composition score below 22/25
- no Signature UI score below 9/10
- no accessibility-critical failure

Do not inflate score because the implementation is technically sophisticated.

---

# 18. Screenshot Validation Matrix

Codex must capture screenshots after each major task.

## Desktop

- 1920×1080
- 1440×900
- 1280×720

## Responsive breakpoints

- 1180px
- 1024px
- 901px

## Mobile

- 412×915
- 390×844
- 360×800

## Theme

At least:

- Light desktop
- Dark desktop
- Light mobile
- Dark mobile for high-risk screens

Golden review primarily uses 1440×900 or the aspect ratio closest to the reference.

---

# 19. Codex Validation Commands

Codex must discover actual repo commands during Phase 0. At minimum expect equivalents of:

```bash
npm run check
npm run typecheck
npm test
npm run build
```

For screenshot/browser validation, reuse existing Playwright/browser harness if present. Do not add a second redundant testing stack unless necessary.

Before declaring a task complete, report:

- commands run
- pass/fail
- files changed
- screenshots produced
- known visual differences
- known technical debt

---

# 20. Change Safety Rules

Do not change without explicit scope:

- REST contract
- MCP tools
- Schema
- Firebase data structure
- auth flow
- Handoff domain state semantics
- Quest completion semantics

UI v4 is primarily a presentation / interaction architecture project.

If visual implementation requires domain change, stop and report the requirement instead of silently changing behavior.

---

# 21. Commit / Task Strategy

Prefer small reviewable commits.

Suggested sequence:

```text
ui-v4: audit current UI and assets
ui-v4: establish design tokens and shell
ui-v4: add shared avatar and handoff primitives
ui-v4: implement current party formation
ui-v4: implement next integration SVG network
ui-v4: implement next quest dependency graph
ui-v4: rollout current signature screens
ui-v4: rollout next command center screens
ui-v4: add motion layer
ui-v4: finalize responsive compositions
ui-v4: visual QA and accessibility polish
```

Do not mix API refactors or unrelated feature work into UI v4 commits.

---

# 22. Stop / Rollback Conditions

Stop a task and report instead of continuing if:

- implementation requires breaking API/domain contracts
- actual assets have unclear redistribution/license status
- Golden and DESIGN.md conflict materially
- responsive fix requires removing a required Signature UI
- baseline tests begin failing for unrelated reasons
- graph solution causes major bundle/performance regression

Do not solve uncertainty by silently inventing a new UI concept.

---

# 23. Web Chat Review Template

After each Golden task, provide Web Chat with:

```text
Screen:
Reference:
Viewport:
Theme:

What changed:

Known differences from Golden:
1.
2.
3.

Implementation screenshot:

Questions / decisions needed:
```

Web Chat returns:

```text
KEEP
- ...

CHANGE P0
- ...

CHANGE P1
- ...

OPTIONAL
- ...
```

Codex then makes only targeted corrections.

---

# 24. First Sprint Recommendation

## Sprint name

**QuestForge UI v4 — Golden Architecture Sprint**

## Tasks

1. Phase 0 Repo Audit
2. Phase 1 UI Foundation
3. Golden A — Current Party Formation
4. Golden B — Next Integrations
5. Golden C — Next Quest Tree
6. Web Chat visual review
7. Codex correction pass
8. GATE A decision

## Do NOT include yet

- all remaining tabs
- fancy reward motion
- mobile perfection
- unrelated API features
- new provider integrations
- major data migration

Goal is not “finish UI v4”.

Goal is:

> **prove a repeatable ImageGen → React 90%+ implementation pipeline.**

Once proven, scale it to every screen.

---

# 25. Final Success State

QuestForge UI v4 is successful when:

### Current `/`

A user sees a **Guild OS** where Today, Party, Battle, Campaign and Rewards feel like one RPG/productivity system rather than a task app with game decoration.

### Next `/next/`

A user sees an **AI Agent Command Center** where Quest, Handoff, Agent load, Review and risk can be understood in seconds.

### Across both

The same QuestForge still exists:

- same data
- same Human / Astra / Agent semantics
- same Handoff domain
- same design constitution

but the two surfaces offer deliberately different interaction lenses.

