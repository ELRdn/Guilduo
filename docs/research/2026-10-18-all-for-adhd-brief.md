# All for ADHD — research and design brief (2026-10-18)

Parallel UI for Guilduo that keeps the Human ⇄ Agent product model, API, MCP and palette, and only rebuilds the UI/UX for clarity. Relay Forge stays as-is for comparison and for full Agent decisions.

Labels: **[Evidence]** observed in this repository, measurement, or the owner's account. **[Known]** public standard/product, not re-read for this brief. **[Inference]** design judgement, not yet validated.

## 1. Owner decisions

- UI only. Keep the AI/Agent policy (assignment, Handoff, human decisions).
- Build in parallel as "All for ADHD"; Relay Forge remains.
- Game elements (XP/MP) on by default, can be turned off.
- References: Structured, Tiimo.
- Testers are recruited after beta launch.
- Real account data may be aggregated read-only.
- Prototype is Japanese only; 9 languages at release.
- Desktop and mobile are both first-class.

## 2. Findings

### Real usage (owner account, read-only, 2026-10-18) [Evidence]

| Metric | Value |
|---|---|
| Quests total / active / completed / archived without completion | 110 / 31 / 72 / 9 |
| Active without due or scheduled date | 23 of 31 |
| Active overdue | 8 |
| Active with an estimate | 4 of 31 |
| Quests with recorded actual time | 1 of 110 |
| Active with a next action | 24 of 31 |
| Active sub-quests | 13 |
| Active assigned to an Agent | 4 |
| Median completion lead time | 0.9 days |
| Median age of active Quests | 15 days |

[Inference] Work is either finished within a day or it lingers undated. Time fields are almost never filled because they cost effort at capture. "Next action" is used, so a single next step is a natural focus unit.

### Current UI load (tools/measure-ui-load.mts, demo, commit 145b278) [Evidence]

| Viewport / screen | Controls above fold | Primary actions | Jargon hits | Fixed chrome |
|---|---|---|---|---|
| Desktop Home | 40 | 6 | 7 | 0% |
| Desktop Quests | 44 | 2 | 12 | 2% |
| Mobile Home | 15 | 1 | 1 | 37% |
| Mobile Quests | 23 | 1 | 7 | 14% |
| Create dialog | 8 fields, 1 required | — | — | — |

Raw data: `2026-10-18-relay-forge-baseline.json`.

### Reference products [Known, from their public pages]

- Structured: one visual day timeline mixing tasks and events; fast capture; start on phone, finish on desktop.
- Tiimo: visual timeline with colors/icons; countdown with a progress ring; steps shown beside the timer; a to-do area that holds everything, then one tap places an item on today; next task visible at a glance; reduce pressure and noise.
- W3C COGA (Making Content Usable for People with Cognitive and Learning Disabilities) and WCAG 2.2 (e.g. 3.3.7 Redundant Entry, 2.2 timing) are the accessibility references.

## 3. Principles and budgets

| # | Principle | Budget (checked by measurement) |
|---|---|---|
| P1 | One primary action per screen | primaryActions ≤ 1 |
| P2 | Little to scan before acting | Now screen controls above fold ≤ 15 desktop, ≤ 12 mobile |
| P3 | Capture anywhere in one field | type + Enter (2 steps), 1 field, no required choices |
| P4 | Time is visible, not typed | estimate chips (5/15/30/60), ring timer, today's total |
| P5 | Forgiving | undo window instead of confirm dialogs; overdue shown as "見直す", not red piles |
| P6 | Plain words | jargon hits ≤ 1 per screen ("Agent" allowed) |
| P7 | Content over chrome | mobile fixed chrome ≤ 25% |
| P8 | Interruption recovery | the in-progress task is always first on Now |
| P9 | Rewards without noise | XP/MP toast on completion, toggle off, no motion under reduced motion |
| P10 | AI policy kept | Agent owner visible; human decisions counted and opened in Relay Forge |

## 4. Prototype result (same script, demo data) [Evidence]

Surface: `/interaction-lab/all-for-adhd/` (build: `/next/all-for-adhd/`). Screens: 今 (one focus task), 予定 (week strip and day timeline, inbox beside it), やること (all, grouped), 設定. A detail sheet edits date, time, estimate, due date, notes and sub-steps; a dock keeps the running task visible.

| Metric | Relay Forge | All for ADHD | Budget | Met |
|---|---|---|---|---|
| Desktop home: controls above fold | 40 | 17 (16 without the demo banner) | ≤ 15 | No, +1 |
| Mobile home: controls above fold | 15 | 17 (16 without the demo banner) | ≤ 12 | No, +4 |
| Home primary actions (desktop) | 6 | 1 | ≤ 1 | Yes |
| Jargon hits on home | 7 | 0 | ≤ 1 | Yes |
| Jargon hits on list screen | 12 | 4 (all from demo Quest titles) | ≤ 1 UI copy | Yes for UI copy |
| Mobile home fixed chrome | 37% | 14% | ≤ 25% | Yes |
| Create: fields / steps | 8 / 3 | 1 / 2 (type + Enter), on every screen | 1 / 2 | Yes |
| Calendar/plan screen: controls above fold, desktop / mobile | 22 / 55 (カレンダー) | 32 / 24 (予定) | none set | — |

Raw data: `2026-10-18-all-for-adhd-measure.json`, `2026-10-18-relay-forge-baseline.json`. The control budgets were set by judgement [Inference]; the remaining controls are the four tabs, capture (field, 今日やる, 追加), the decision notice, and the focus card actions (始める, 別のにする, 明日にする, two edit links, このあと).

Added after owner review (2026-10-18): the first cut dropped the calendar and most editing. 予定 restores a calendar in the Structured/Tiimo shape (week strip + one-day timeline + inbox beside it), and the detail sheet restores date, time, due date, notes and sub-steps. Still only in Relay Forge: month view, Board/List/Gantt, Notes, time-entry records, Quest Tree depth beyond one level, assignee change, Battle/Party/Connections. The desktop 予定 screen has more controls than the Relay Forge calendar because the inbox and week strip are always visible [Evidence]; whether that helps or hurts is for dogfooding to decide [Inference].

## 5. Validation beyond AI judgement

1. Automated: the same measurement script against both surfaces; budgets above must pass. Typecheck, unit tests, design check, Relay Forge verifiers unchanged.
2. Owner dogfooding for 1–2 weeks: completions per day, Quests with an estimate, "stuck moments" noted.
3. After beta: ADHD tester sessions with fixed tasks (capture, decide what to do now, start, recover from interruption, complete), SEQ and NASA-TLX, compared with Relay Forge.
