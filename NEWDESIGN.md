<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 -->

# QuestForge — Relay Forge Design Specification

> Status: Authoritative specification for the next QuestForge UI
>
> Version: 1.0.1
>
> Updated: 2026-08-25
>
> Owner: QuestForge Product Design
>
> Implementation target: the successor shell developed on `/next/`, then promoted to `/`
>
> Visual baseline: Dark and Light have equal product status; Dark is the expressive reference

## この文書が次期UIの判断を一つにする

`NEWDESIGN.md` は、次期QuestForgeの視覚・操作・レイアウト・状態表現を決める単一の正本である。実装担当者は最初に1〜6章を通読し、以降をコンポーネントと画面のリファレンスとして使う。ここに値がない場合、近い値をその場で作ってはならない。25章の変更手続きを使う。

QuestForgeは、人間とAI Agentが同じ仕事の流れに参加する、実務用のオペレーティング環境である。次期UIは「タスク管理にRPG装飾を足した画面」から離れ、仕事の所在、次の介入点、受け渡し、稼働余力を一目で読める**静かな戦術工房**になる。

### 文書の優先順位

競合が起きたときは、次の順で判断する。

1. `PROJECT_SPEC.md`: 機能、ドメイン、データ、API、認証、同期の正本
2. `NEWDESIGN.md`: 次期UIの視覚、操作、レイアウト、状態表現の正本
3. API schema、共有型、domain code: 実装上の互換境界
4. `DESIGN.md`、`interaction-lab/DESIGN.md`、`design/*`: 現行UIの研究資料と移行元

機能仕様と本書が衝突した場合は機能を保ち、表現を本書へ合わせる。旧デザイン文書と本書が衝突した場合は本書を採用する。

### English summary

QuestForge is an operating environment for human and AI work. Its new visual language, **Relay Forge**, makes ownership, handoff, intervention, capacity, and progression legible without falling back to generic SaaS cards or decorative game chrome. This document is the visual authority for the successor UI; product behavior remains governed by `PROJECT_SPEC.md` and existing contracts.

### v1.0.1 revision delta

- Replaced impossible WQHD/4K fixed-width sums with budgeted Grid arithmetic.
- Added the implementation blueprint and congestion rules for Quest Loom.
- Split Primary Action and Human identity into independent semantic color channels.
- Changed Capacity Band to four stable slots with domain-aware constraint content.
- Added the 1920×1080 Dark Command Golden Screen and a no-code audit/approval gate.

---

## 1. Design Thesis — 仕事が誰の手にあり、次に誰が動くかを描く

QuestForgeの中心はQuestそのものではない。Questが人間、Agent、Systemの間を移動し、判断と実行を重ねて完了へ向かう流れが中心にある。

画面は次の3問へ5秒以内に答えなければならない。

- いま動いている仕事は何か。
- どこで止まり、誰の介入を待っているか。
- 次の操作で何が前進するか。

この流れを視覚化する設計言語を **Relay Forge** と呼ぶ。Relayは受け渡し、Forgeは仕事を鍛えて完成へ近づける場所を表す。世界観は言葉と装飾で説明せず、状態遷移、Actorの形、接続線、稼働余力、履歴の積み重なりで伝える。

### 成功状態

次期UIが成功しているとき、ユーザーは一覧を眺めるだけで次の介入対象を選べる。Agentは人間の補助アイコンではなく実行主体として見え、人間は承認ボタンではなく判断主体として見える。RPG要素は進捗、能力、負荷、リスクを短く読む情報構造として働く。

### 非目標

- マーケティングサイトのような大見出しや余白を持ち込まない。
- ゲーム画面のHUD、羊皮紙、紋章、発光枠を模倣しない。
- AIらしさを紫青グラデーション、粒子、ノード壁紙で表現しない。
- 既存画面の配置を整えるだけの改修にしない。
- 機能、API、Firebase、MCP、schema、domain contractを再設計しない。

## 2. Product Character — 精密で生きている、しかし騒がない

| Character | UIでの意味 | 禁止される代用品 |
|---|---|---|
| Intelligent | 優先順位、依存、判断理由が読める | AI風グロー、抽象的な脳アイコン |
| Alive | 実行、待機、受け渡しが状態変化として見える | 常時点滅、意味のない波形 |
| High-agency | 次の操作と結果が近い | 深いメニュー、曖昧なCTA |
| Precise | 数値、時刻、Actor、状態を明記する | 雰囲気だけの色分け |
| Tactical | 介入点、負荷、依存を比較できる | 巨大KPIカード |
| Premium | 材質感より整列、密度、反応速度で示す | ガラス効果、過剰な影 |
| Mysterious | 余韻のある暗色、静かな動き、固有語彙 | 読めない低コントラスト |

プロダクトの人格は「静かな戦術工房」である。暗い作業台、精密な計器、手渡される作業片という比喩は使うが、画面上に物理的な工房の絵を置かない。

## 3. Design Principles — 5つの原則をすべての画面に通す

### 3.1 Intervention First

表示順位は「新しい」「人気」ではなく、ユーザーの判断が必要な順を優先する。Blocked、Review required、Conflict、Waiting timeoutは、装飾ではなく画面構造の上位へ上がる。

### 3.2 Density with Rhythm

高密度は文字を小さくすることではない。44〜52pxの行、8px基準の整列、固定列、段階的開示を使い、比較に必要な情報を同じ視線上へ置く。12px未満の本文は禁止する。

### 3.3 State Is Structure

状態はBadgeを増やして表さない。Actor node、connector、配置、ラベル、アイコン、必要最小限の色を組み合わせる。色を消しても、誰が何を待つか判別できなければ不合格である。

### 3.4 One Stable World

全画面は同じShell、surface hierarchy、type scale、actor grammarを使う。Battleだけゲーム、Settingsだけ一般SaaSという分裂を認めない。

### 3.5 Game Mechanics Earn Their Space

MP、Battle、Party、XP、difficulty、rewardは意思決定を助ける場合だけ表示する。行動に影響しない数値や演出は主画面から外す。

## 4. Current State Audit — 機能は豊かだが視覚言語が分裂している

現行QuestForgeには、Questの時間軸、依存Tree、Agent実行、Handoff、Review、Party、Battle、Integrationが存在する。機能の輪郭はQuestForge固有であり、次期UIでも維持する。

一方、現行UIの視覚は複数世代に分かれている。root surface、`/next/`、image generation experimentsは、同じ概念を異なるカード、色、radius、密度で表す。Agent Operations、Party、Battle ReportはKPIカードとタイルへ寄り、一般的な管理画面と見分けにくい。6〜8pxのラベル、重複media query、局所的なraw valueも、実装の一貫性を弱めている。

継承するのは次の3点である。

- Handoffを線とActorの関係として見せる発想
- Mission spineに見られる時間、依存、進行の同時表示
- Astra、role avatar、boss artが持つQuestForge固有の人格

継承しないものは、カードグリッド主体の情報設計、KPIの大型表示、画面ごとのテーマ差、過剰なpill、装飾目的のfantasy chromeである。

## 5. Information Architecture — 6領域へ再編し、介入は横断Lensにする

### 5.1 Primary domains

| Domain | 含む機能 | 主な問い |
|---|---|---|
| Command | Today、active work、reviews、blocked、waiting、agent activity | 今どこへ介入するか |
| Quests | Quest list、calendar horizon、archive、recurrence | 何を計画し、いつ実行するか |
| Network | Dependency Tree、handoff topology、Explore | 何が何を止めているか |
| Party | Humans、Agents、roles、availability、invites | 誰が参加し、何を担えるか |
| Battle | encounter、commands、MP、boss progress、battle log | どの能力をいつ使うか |
| Connections | Integrations、MCP clients、scopes、sync health | どこと接続し、何を許可するか |

### 5.2 既存destinationの扱い

| Existing | New placement | 理由 |
|---|---|---|
| Today | Commandのdefault view | 今日の一覧より介入判断が中心だから |
| Reviews | Command queue + Intervention Lens | 全画面にまたがる判断だから |
| Agents | PartyのAgent roster + Command activity | 名簿と稼働を分けて読むため |
| Explore / Tree | Network | 空間的な依存とRelayを扱うため |
| Profile | identity menu | 毎日使うprimary destinationではないため |
| Settings | identity menu | 構成画面としてShellから分離するため |
| Companion | identity menu + Party context | 常設の人格だが業務領域ではないため |
| Inventory / Rewards / Shop | BattleのRewards subview | RPG経済を作業navigationから外すため |
| Bestiary / Bosses | BattleのEncounter library | 戦闘文脈を保つため |

機能は削除しない。名称変更はnavigationとpage titleに限定し、route、API、deep linkの互換性はmigration layerで維持する。

### 5.3 Navigation model

Primary domainはForge Railに置く。各domain内のview切替はWorkspace Header直下のlocal tabsを使う。Actor、Quest、Reviewの詳細は新しいpageへ遷移せず、まずIntervention Lensへ開く。比較や長時間編集が必要な場合だけfull workspaceへ昇格する。

## 6. App Shell — 6つの固定領域が全画面を安定させる

```text
┌ Forge Rail ┬──────────────── Operation Bar ────────────────┬ Intervention Lens ┐
│ identity   │ Capacity Band                                 │ context / decision │
│ domains    ├───────────────────────────────────────────────┤                    │
│ utility    │ Workfield                    │ Auxiliary Lane │                    │
│            │ primary operational surface │ optional       │                    │
└────────────┴──────────────────────────────┴────────────────┴────────────────────┘
```

### 6.1 Forge Rail

- Width: 184px at 1440, 216px at 1920, 224px at 2560, 240px at 3840.
- Background: `--qf-color-canvas`; right separator `--qf-color-border-subtle`.
- Top: QuestForge mark and workspace switcher, 48px high.
- Middle: six primary domains, item height 40px, gap 2px.
- Bottom: sync state, command shortcut, identity menu.
- Selected item uses a 2px leading rail, `--qf-color-selected`, and weight 600. It does not use a filled pill.
- Collapsed width is 56px. Label hides; tooltip appears after 500ms. Icon position does not move.

### 6.2 Operation Bar

Operation Bar is 48px high and remains fixed. Left side contains page title and breadcrumb only when hierarchy exceeds one level. Center contains global search/command trigger. Right side contains create action, notifications, connection state, and active identity.

Global create is one 32px primary button. It opens a command surface with `Quest`, `Handoff`, `Party invite`, and context-valid actions. Separate colorful create buttons are prohibited.

### 6.3 Capacity Band

Capacity Bandは32px高の固定4-slot shellである。slotの位置と責務は変えず、第三slotの内容だけをdomain contextへ合わせる。これにより、画面を移動しても読み順を学び直さず、Settingsで無関係なMPを常時表示する矛盾も避ける。

| Slot | Stable meaning | Default content | Interaction |
|---|---|---|---|
| A — Human attention | 人間の判断負荷 | review required / waiting for human | 該当Interventionへfilter |
| B — Execution | Agentの実行負荷 | executing / queued / available capacity | Agent activityへfilter |
| C — Domain constraint | 現在domainの前進を制約する資源または障害 | domain mappingを参照 | 制約対象またはresource detailを開く |
| D — System health | データと接続の信頼性 | synced / syncing / stale / error | Connectionsまたはrecoveryを開く |

Slot C maps as follows:

| Domain | Slot C content |
|---|---|
| Command | Blocked Quest count and oldest age |
| Quests | Due-risk or scheduling conflict; `No constraint` when none |
| Network | Blocked dependency count / critical path status |
| Party | Unassigned work or overloaded member count |
| Battle | MP current / maximum and pending spend |
| Connections | Permission/OAuth constraint; System health remains in Slot D |
| Profile / Settings | Unsaved or restart-required change; `No constraint` when none |

Each slot is `minmax(144px, 1fr)` with a 1px separator, 12px horizontal padding, one label, and one value/state. Capacity Band is not a KPI card and never contains a sparkline without an actionable threshold. Below 1440px, A and B remain visible, C collapses into the highest-severity constraint, and D becomes a 32px status control. At ≤900px, the band becomes a two-row summary inside Command and is omitted from configuration pages unless a constraint exists.

### 6.4 Workfield

Workfield owns the primary task. It uses `--qf-color-field`, no outer card, and page gutters defined in section 12. Tables, timelines, graphs, and tactical surfaces sit directly on the field. Modules gain a boundary only when they need independent scrolling, selection, or grouping.

### 6.5 Auxiliary Lane

Auxiliary Lane carries a second synchronized view: Chronicle beside a Quest list, roster beside a battle, or minimap beside Network. It appears only when at least 1920px provides useful comparison width. It is not a dumping ground for secondary cards.

### 6.6 Intervention Lens

The right-side Lens is the signature decision surface. Width is 304px at 1440, 360px at 1920, 384px at 2560, and 416px at 3840. It shows selected object context, decision reason, Relay path, evidence, and actions in that order.

Lens states are `closed`, `peek`, `open`, and `pinned`. `peek` is an overlay preview on narrow layouts. `pinned` survives navigation inside the same domain. Escape closes `peek/open`; a pinned Lens requires its close control. Unsaved input triggers a confirmation dialog.

### 6.7 Shell modes

| Mode | Rail | Capacity Band | Auxiliary | Lens |
|---|---|---|---|---|
| Standard | expanded | visible | viewport-dependent | optional/pinned |
| Compact | 56px | summary | hidden | overlay |
| Focus | 56px | hidden except alerts | hidden | closed until invoked |
| Reconnect | unchanged | sync segment expanded | preserved | writes disabled |
| Empty workspace | expanded | setup state | hidden | onboarding guidance |

Shell geometry may not shift when loading data. Skeletons occupy the final regions.

### 6.8 Search, command, notification

- `Cmd/Ctrl+K`: command palette.
- `/`: focus search when no text field has focus.
- `G` then domain mnemonic: navigate when keyboard shortcuts are enabled.
- Notifications open as a 360px popover anchored to Operation Bar; unresolved review and blocked work also remain visible in Intervention Lens.
- Search results group `Quest`, `Actor`, `Connection`, and `Command`; each row includes type geometry, title, context, and keyboard hint.

### 6.9 Overlay rules

Tooltip uses no backdrop. Popover closes on outside click. Drawer is reserved for narrow viewports. Modal is reserved for irreversible, multi-object, permission, or credential decisions. A modal never opens another modal; the second step replaces modal content.

### 6.10 Global state precedence

複数状態が重なったときは、`permission/auth block → concurrency conflict → offline/stale → domain error → loading → empty → normal` の順でユーザーへ示す。ただし既読データは消さない。たとえば再接続中にReviewが残っている場合、Review内容を保持したまま書き込みをロックし、Capacity Bandと該当actionへ再接続状態を出す。全画面spinnerで覆う実装は禁止する。

Agentの実行状態とQuestの表示状態も上書きしない。`Agent working + Quest blocked` のように異なるstate machineが同時に成立する場合、Actor nodeはAgentを、connectorはBlockedを表す。

---

## 7. Color System — 低彩度の作業面に、意味のある色だけを置く

### 7.1 Authoritative sRGB tokens

The hexadecimal values below are authoritative. Implementations may add generated OKLCH equivalents only when the build verifies visual equivalence and preserves these values as fallbacks.

| Semantic token | Dark | Light | Usage |
|---|---:|---:|---|
| `canvas` | `#0B0F10` | `#E9ECE8` | app background, Rail |
| `field` | `#101617` | `#F1F3EF` | Workfield |
| `surface` | `#151D1F` | `#FAFBF8` | modules, controls |
| `raised` | `#1C2729` | `#FFFFFF` | overlays, selected editor |
| `inset` | `#0D1213` | `#E4E8E3` | code, wells, compact meters |
| `selected` | `#20302C` | `#DCE9E1` | selected row/module |
| `fg-strong` | `#EDF2EF` | `#17201E` | headings, primary text |
| `fg-default` | `#C4CECA` | `#40504B` | body text |
| `fg-muted` | `#8E9B97` | `#66756F` | metadata |
| `fg-disabled` | `#5E6966` | `#919B96` | disabled only |
| `border-subtle` | `#253032` | `#D3D9D4` | structural separator |
| `border-default` | `#344244` | `#B9C2BC` | control boundary |
| `border-strong` | `#536365` | `#7C8B84` | focus adjacency, graph axis |
| `accent` | `#D7E2DE` | `#23312D` | primary action only |
| `accent-hover` | `#EBF2EF` | `#17221F` | primary action hover |
| `fg-on-accent` | `#111816` | `#F7FAF8` | text/icon on primary action |
| `human` | `#67C194` | `#1D6D4D` | Human actor identity only |
| `agent` | `#75A7E8` | `#2D65A7` | AI actor, execution |
| `system` | `#9AA7A3` | `#596863` | automation/system |
| `review` | `#D9B36A` | `#76531B` | human decision required |
| `waiting` | `#D2A65A` | `#825B18` | waiting/queued |
| `success` | `#64BA86` | `#236B43` | accepted/completed |
| `warning` | `#E1A85A` | `#8B5B13` | risk/near limit |
| `danger` | `#E77068` | `#A33F3A` | blocked/error/destructive |
| `mp` | `#B59AE8` | `#684AA3` | MP only |
| `battle` | `#D8875F` | `#8B482D` | encounter/action only |
| `focus` | `#9BC8FF` | `#145FA8` | keyboard focus ring |
| `scrim` | `rgba(0,0,0,.62)` | `rgba(20,28,25,.36)` | modal/drawer backdrop |

`fg-muted` is the minimum token for informative text. `fg-disabled` is never used for active metadata. Core text and semantic colors meet WCAG-conscious contrast against their designated field/surface backgrounds; component combinations must be rechecked in both modes.

### 7.2 Quest state mapping

| State | Color | Required non-color signal |
|---|---|---|
| Planned / Backlog | `fg-muted` | hollow square + label |
| Ready | `accent` | open forward notch |
| Working | `agent` or actor color | active node + verb label |
| Review required | `review` | converging connector + review icon |
| Waiting | `waiting` | pause marker + wait reason |
| Blocked | `danger` | broken connector + blocker label |
| Completed / Accepted | `success` | filled endpoint + check |
| Archived | `fg-muted` | archive icon + reduced emphasis |

### 7.3 Color rules

- A module may contain at most one dominant semantic color plus neutral states.
- Primary Action and Human identity are separate semantic channels. `accent` styles action hierarchy; `human` styles Human nodes and identity edges. Neither token substitutes for the other.
- Actor identity color never replaces status. An Agent can be blocked: use Agent geometry with a danger broken connector.
- `mp` and `battle` are reserved; they never style general buttons or navigation.
- Gradients are forbidden in structural UI. A boss illustration may retain artwork-internal gradients.
- Tinted text on tinted backgrounds requires a contrast test; opacity alone is not a token.
- Theme parity means identical hierarchy and state legibility, not literal inverted colors.

## 8. Typography — 13pxの密度を下限に、数字と文章を分業させる

### 8.1 Families

- UI sans: self-hosted `IBM Plex Sans Variable`, weight 400–700.
- Operational mono: self-hosted `IBM Plex Mono`, weight 400–600.
- CJK fallback: `Noto Sans JP`, `Noto Sans KR`, `Noto Sans SC` followed by system sans.
- Generic fallback: `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.

Webfont failure must not change control height. Use metric-compatible fallback adjustments where supported. Italic headings are prohibited.

### 8.2 Roles

| Role/token | Size / line | Weight | Tracking | Use |
|---|---:|---:|---:|---|
| `display` | 32/38 | 600 | `-0.02em` | rare encounter title, empty onboarding only |
| `page-title` | 24/30 | 600 | `-0.015em` | workspace title |
| `section` | 18/24 | 600 | `-0.01em` | major region heading |
| `component` | 14/20 | 600 | `0` | row/module title |
| `body` | 14/20 | 400 | `0` | normal reading |
| `compact` | 13/18 | 400 | `0` | dense rows, inspector evidence |
| `label` | 11/16 | 600 | `0.06em` | uppercase category, max 18 chars |
| `metadata` | 12/16 | 400 | `0.01em` | time, source, secondary state |
| `micro` | 11/14 | 500 | `0.02em` | keyboard hint, chart annotation only |
| `kpi` | 24/28 | 600 | `-0.02em` | MP/current capacity, isolated use |
| `operational` | 12/16 | 500 mono | `0` | IDs, durations, timestamps, counts |

Uppercase is limited to Latin labels such as `AGENT`, `SYSTEM`, and shortcut hints. Japanese text is never mechanically uppercased or letter-spaced. Numeric columns use `font-variant-numeric: tabular-nums`.

## 9. Spacing & Density — 4pxの骨格に2pxの補助段階を持たせる

### 9.1 Spacing scale

`2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64px` only. The base rhythm is 4px; 2px and 6px solve optical or compact-control alignment.

### 9.2 Density constants

| Element | Compact | Default | Comfortable |
|---|---:|---:|---:|
| Data row | 44px | 52px | 60px |
| Relay/Handoff row | 56px | 64px | 72px |
| Input/Button | 28px | 32px | 40px |
| Tab | 32px | 36px | 40px |
| Module padding | 12px | 16px | 20px |
| Panel gap | 8px | 12px | 16px |

Default density is standard. Compact is user-selectable at 1440px and automatic only for wide datasets. Comfortable is reserved for touch-oriented or onboarding surfaces; it is not the default desktop style.

Page gutters are 20px at 1440, 24px at 1920, 32px at 2560, and 40px at 3840. Section spacing is 24px; related module spacing is 12px. A blank area wider than 64px needs a reason such as graph pan space, focus, or reading measure.

## 10. Geometry — 角丸ではなく境界の役割で階層を作る

### 10.1 Radius scale

| Token | Value | Use |
|---|---:|---|
| `r-none` | 0 | tables, structural joins, graph panels |
| `r-xs` | 2px | progress segments, tiny indicators |
| `r-sm` | 4px | buttons, inputs, modules |
| `r-md` | 6px | popovers, Lens floating mode |
| `r-lg` | 10px | modal only |
| `r-pill` | 999px | actor presence dot, status chip only |

Nested containers do not accumulate radius. If a module sits flush against another structural region, adjoining corners are zero.

### 10.2 Borders, selection, focus

- Structural separator: 1px `border-subtle`.
- Interactive boundary: 1px `border-default`.
- Selected row: 2px leading edge + `surface-selected`; no full glowing outline.
- Keyboard focus: 2px `focus`, 2px offset against the local surface.
- Error field: 1px `danger` plus inline error icon and text.
- Dashed borders represent system-generated or provisional structure only.

### 10.3 Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-none` | `none` | canvas, field, modules |
| `shadow-overlay` | `0 8px 24px rgba(0,0,0,.22)` | popover, floating Lens |
| `shadow-modal` | `0 20px 60px rgba(0,0,0,.32)` | modal |

Light mode uses the same alpha values unless contrast review proves a smaller value sufficient. Shadows do not communicate selection or status.

### 10.4 Container decision

| Treatment | Use when | Example |
|---|---|---|
| No container | content shares one scan axis | table sections, timeline labels |
| Separator | neighboring regions have equal hierarchy | table columns, Chronicle groups |
| Surface shift | region has independent behavior | toolbar, Capacity Band |
| Inset surface | editable/code/metric well | prompt, MP meter |
| Elevated surface | content interrupts current task | popover, modal |

## 11. Surface Hierarchy — 5層だけで空間を説明する

| Level | Token/background | Boundary/elevation | Purpose and examples |
|---|---|---|---|
| L0 Canvas | `canvas` | none | app perimeter, Forge Rail |
| L1 Field | `field` | structural separator | Workfield, full-page graph |
| L2 Module | `surface` | optional 1px border | table toolbar, Lens sections |
| L3 Active | `raised`/`selected` | leading edge or strong border | selected editor, active decision |
| L4 Overlay | `raised` | overlay shadow | popover, palette, floating Lens |
| L5 Modal | `raised` + scrim | modal shadow | destructive/permission flow |

No component may invent an L6. A nested card inside L2 should first be rewritten as rows, separators, or an inset region.

## 12. Layout System — 画面が広がるほど比較面を増やす

### 12.1 Desktop widths

RailとLensだけをviewport基準の固定幅にする。中央Workspaceは次式で必ず正の余白とgapを確保する。

```text
workspace-inline-size = viewport-inline-size - rail-inline-size - lens-inline-size
workspace-content = workspace-inline-size - (2 × page-gutter)
pane-budget = workspace-content - ((pane-count - 1) × pane-gap)
```

`page-gutter`はWorkspace内側に含み、Rail/Lensの外側へ重複加算しない。paneは固定合計値にせず、available budgetをGrid比率で分配する。

| Viewport | Rail | Lens | Gutter / gap | Workspace grid |
|---:|---:|---:|---:|---|
| 1440 | 184 | 304 | 20 / 12 | `minmax(0, 1fr)` |
| 1920 | 216 | 360 | 24 / 12 | `minmax(720px, 1.75fr) minmax(360px, 1fr)` when aux is useful |
| 2560 | 224 | 384 | 32 / 16 | `minmax(960px, 1.75fr) minmax(420px, 1fr)` |
| 3840 | 240 | 416 | 40 / 16 | `minmax(1180px, 1.8fr) minmax(520px, .85fr) minmax(600px, 1fr)` |

Reference arithmetic:

- 1440: Workspace `952px`; content `912px`; one pane `912px`.
- 1920: Workspace `1344px`; content `1296px`; after one 12px gap, two-pane budget `1284px`. Reference split is approximately `817 / 467px` and may move with content minimums.
- 2560: Workspace `1952px`; content `1888px`; after one 16px gap, two-pane budget `1872px`. Reference split is approximately `1191 / 681px`.
- 3840: Workspace `3184px`; content `3104px`; after two 16px gaps, three-pane budget `3072px`. Reference split is approximately `1515 / 716 / 841px`.

CSS Grid uses `min-width: 0` on every pane. If a minimum cannot fit, the lowest-value pane disappears in the order `Chronicle → Auxiliary`, rather than compressing the primary pane below its minimum. At WQHD and 4K, content never sits as a narrow centered island. Additional width enables synchronized panes, visible columns, graph context, or Chronicle. Text reading measure still caps at 760px inside its pane.

### 12.2 Column rules

- Quest datasets use fixed identity/status/action columns and a fluid title/context column.
- Tables may horizontally scroll only after low-priority columns collapse into row detail.
- A graph consumes available width; its inspector does not overlay at 1440 and above.
- Settings content caps at 960px, aligned to the Workfield start rather than centered in the viewport.
- Modal widths are 420, 560, or 720px. Full-screen modal is prohibited on desktop.

### 12.3 Narrow compatibility

Below 1200px, Rail collapses to 56px and Lens becomes overlay. At or below 900px, the shell becomes a page-scroll model, Lens becomes bottom sheet, and the bottom navigation shows `Command`, `Quests`, `Network`, `Party`, `Battle`; `Connections` and identity actions live under `More`. At 390px, tables become ordered operational rows, not horizontally shrunken desktop tables.

---

## 13. Human / Agent / System Grammar — Actorは色より形で区別する

### 13.1 Actor nodes

| Actor | Geometry | Label | Connector | Motion while active |
|---|---|---|---|---|
| Human | 24px circle | `HUMAN` or person role | solid 1.5px | one 120ms settle on assignment |
| Agent | 24×24 clipped-corner rectangle | `AGENT` | solid 1.5px | moving 2px tracer along active segment |
| System | 22×22 bracket/hollow node | `SYSTEM` | dashed 1px | no continuous motion |
| Companion/Astra | 28px crest silhouette | `COMPANION` | double-line entry only when participating | restrained 180ms crest reveal |

Actor portrait may appear next to the node but cannot replace node geometry. Avatar failure falls back to initials while preserving geometry and label.

### 13.2 State composition

- `Working`: current Actor node is filled; connector ahead remains neutral.
- `Waiting`: pause marker sits on the connector, followed by a plain-language reason.
- `Review required`: two lines converge on a Human node with review icon.
- `Blocked`: connector breaks into two 6px segments with a danger cross and blocker text.
- `Completed`: endpoint fills with `success` and a check; previous Actor identity remains visible in history.
- `Automated`: System node and dashed connector; text begins with the system verb.

Status must include a verb: `Astra is executing`, `Hironao is reviewing`, `Waiting for OAuth`, `Blocked by Quest QF-184`. Labels such as `Active` or `Pending` alone are insufficient.

### 13.3 Spatial placement

The current holder appears nearest the Quest title. Previous holders flow left or upward; next expected holder flows right or downward. Human review is never placed as a detached badge on the far edge of a row.

## 14. Component System — primitivesを組み合わせ、画面固有カードを作らない

### 14.1 Component contract template

Every new component specification or implementation records: `role`, `anatomy`, `dimensions`, `states`, `behavior`, `responsive behavior`, `accessibility`, and `anti-patterns`. Missing states are a design defect, not an implementation detail.

### 14.2 Shell and navigation

#### `AppShell`

- Role: maintain stable navigation, status, workspace, and intervention context.
- Anatomy: Forge Rail, Operation Bar, Capacity Band, Workfield, optional Auxiliary Lane, Intervention Lens.
- States: standard, compact, focus, reconnect, empty workspace.
- Anti-pattern: page-specific shell color, duplicated page header, dashboard cards replacing Workfield.

#### `NavigationItem`

- Height 40px; icon 18px; horizontal padding 10px; gap 8px.
- States: default, hover, selected, focus, disabled, attention.
- Attention uses a 6px marker and count in text, not a colored bubble unless count matters.
- Tooltip is mandatory in collapsed Rail.

#### `WorkspaceHeader`

- Height 48px after Operation Bar when local controls are needed; otherwise omitted.
- Contains title context, local tabs, view switch, filters, and one primary contextual action.
- Page description belongs in empty/onboarding states, not permanently under every title.

### 14.3 Quest primitives

#### `QuestRow`

- Default height 52px; Relay variant 64px; expanded detail uses content height.
- Anatomy: selection/control 32px, quest identity, schedule, owner/current holder, state, priority/difficulty, trailing actions.
- Title is one line by default; context is one 13px line. Expansion reveals dependencies, recurrence, and notes.
- States: default, hover, selected, focused, dragging, blocked, stale, archived, write-locked.
- Double-click does not own a critical action. Enter opens Lens; Space toggles selection.
- Anti-pattern: separate pill for every metadata field, state shown only by row tint.

#### `QuestTable`

- Header height 36px; sticky within Workfield; row density follows section 9.
- Sorting is explicit with direction and priority number for multi-sort.
- Bulk action bar replaces the table toolbar while selection exists; it does not float over rows.
- Virtualization is required when rendered rows exceed 200.

#### `QuestCard`

Use only in spatial campaign or choice contexts where position conveys meaning. Minimum width 240px, radius 4px, no shadow. It must not become the default representation of a Quest list.

#### `QuestLoom`

Quest Loom combines chronological spine, dependency threads, current holder, and intervention exit in one row system. Default row is 64px; compact is 56px; expanded evidence is 72px plus an inset detail region. Time sits on one stable axis, dependency lines use orthogonal routing, and the current holder is the only filled Actor node.

At an inline size of 900px or more, Loom uses this exact grid:

```text
32px       72px       96px             minmax(300px, 1fr)     184px        152px
control  | time     | dependency     | quest identity       | actor relay | state/action
```

- `control`: selection, disclosure, and drag handle. Only one control is visible until hover/focus.
- `time`: start/due marker in mono 12/16. The chronological spine runs at the column’s 20px inset from its right edge.
- `dependency`: left of Quest title. It owns six 12px routing tracks plus 12px edge padding. Lines never enter the title column.
- `quest identity`: title, one context line, recurrence/priority only when relevant. This is the sole fluid column.
- `actor relay`: previous/current/next Actor nodes. Current node aligns to row center; hidden history is `+N` after the previous node.
- `state/action`: verb-first state and one quiet action. Review/blocked items expose an outbound 2px intervention notch on the right boundary, visually aligning with Lens.

Header height is 36px. Column separators appear after `time`, `quest identity`, and `actor relay`; the dependency tracks themselves have no box. The row baseline is 32px from its top. Scheduled gaps are represented by the time spine, not empty rows.

#### Loom dependency routing

Edges enter from the chronological spine side, occupy one of six stable tracks, then turn 90° into the target row. Track assignment remains stable while filtering or selecting, so lines do not jump. Crossings use a 4px bridge gap on the lower-priority edge. Critical path owns the track nearest the Quest title.

- 1–6 visible edges: one edge per 12px track.
- 7–10 edges: non-critical edges sharing the same target or source merge into a labeled bus such as `+4 dependencies`.
- More than 10 edges: show critical, blocked, and selected-neighbor edges; aggregate the remainder. Lens lists the complete relation set.
- Selecting a bundled edge expands the dependency column from 96px to 160px and temporarily removes low-priority Quest metadata. It must not widen the whole Workfield.
- Cycles must never be created by UI. If inconsistent external data contains a cycle, render a danger loop marker and open recovery evidence in Lens.

#### Loom intervention and congestion

Blocked rows use a broken incoming edge and a plain-language blocker; the entire row is never tinted danger. Three or more consecutive blocked Quests with the same remediation gain one 24px shared blocker rail spanning the rows, while every Quest remains independently focusable. Different blockers remain separate.

Review-required rows converge their Agent Relay into the Human review node before the state/action boundary. Selecting the intervention notch highlights the corresponding Intervention Queue item and opens Lens. The highlight is reciprocal: selecting the queue item scrolls the Loom row into view without moving keyboard focus unexpectedly.

Below 900px inline size, `actor relay` collapses to current Actor plus next-state glyph, while full Relay moves to Lens. Below 720px, the dependency lane becomes a count and critical/blocker marker; the complete graph remains available in Network. Time, Quest title, current holder, and intervention state may never disappear together.

### 14.4 Actor and relay primitives

#### `ActorIdentity`

- 24px node + optional 24px avatar + name + actor-type label.
- Compact form may omit avatar, never geometry or accessible actor type.
- Presence is a 6px dot with text in details; green alone never means available.

#### `HumanIdentity`

- Uses the 24px Human circle, optional avatar, display name, role, and review availability.
- In assignment and review contexts, show decision authority before social profile data.
- States: available, focused, overloaded, away, offline. Each state has text and an icon or line treatment.
- Anti-pattern: presenting a Human as a generic avatar while Agent identities receive richer operational state.

#### `PartyMember`

- Default row height 60px; anatomy is Actor Identity, role/capability, current Relay, assigned load, availability, and actions.
- Human and Agent members share column alignment. Actor geometry and labels preserve identity type.
- Selecting a member opens profile, current work, capabilities, and assignment evidence in Lens.
- Empty capability or availability is written as `Not declared`; it is not inferred from recent activity.

#### `AgentStatus`

- Verb-first label plus task context and elapsed time.
- States: idle, queued, executing, waiting, review_required, blocked, offline.
- Executing may show a 2px tracer; no pulsing glow.

#### `HandoffPath`

- Minimum segment length 28px; line 1.5px; active tracer 2px; broken gap 6px.
- Nodes remain keyboard-focusable in chronological order.
- Compact mode shows current, previous, next; full history opens in Lens.

#### `AgentActivityStream` / `ExecutionChronicle`

- Event row minimum 40px; timestamp column 72px; Actor node 24px.
- Groups contiguous low-risk System events; never groups review, blocked, or failed events.
- New events append without stealing scroll. A `Jump to live` control appears when the user has scrolled away.

### 14.5 Decision components

#### `InterventionItem`

- Height 64px collapsed; reason, affected Quest, waiting duration, owner, and one next action are visible.
- Severity affects ordering and connector, not card size.
- Selecting opens evidence and alternative actions in Lens.

#### `ReviewQueueItem`

- Shows output summary, requested reviewer, Relay origin, changed evidence, and age.
- Primary action is `Review`; `Accept` is available only after required evidence has loaded.
- Revision requires a reason. Acceptance changes Handoff, not Quest completion unless domain rules do so separately.

#### `AssignmentControl`

- Opens Actor search grouped by Human, Agent, System capability.
- Selection preview shows the resulting Relay path and concurrency warning before commit.
- It is not a generic select when assignment changes execution ownership.

### 14.6 Status and data components

#### `StatusBadge`

- Height 20px; padding 2px 6px; radius pill; icon 12px; label 11px.
- Use for short terminal or categorical status only. Maximum two badges in one row.

#### `PriorityIndicator`

- 3px vertical mark plus text `P0–P3` in details. No flag-color-only encoding.

#### `DifficultyIndicator`

- One to five 4px notches plus localized label. Do not use stars; stars imply ratings.

#### `ProgressIndicator`

- Linear 4px track for deterministic progress; segmented track for stages; numeric label mandatory when precision exists.
- Indeterminate progress uses a single translating segment and respects reduced motion.

#### `MPIndicator`

- 8px segmented band, current/maximum in mono text, spend preview rendered as outlined future segments.
- Warning at domain-defined threshold; the UI does not invent a threshold.

#### `BattleStatus`

- Encounter phase, boss state, available commands, MP cost, and consequence are shown together.
- Damage/progress animation never delays the next valid command.

### 14.7 Graph and temporal components

#### `DependencyNode`

- Minimum 180×64px, maximum 280px width, radius 4px.
- Contains Quest identity, state verb, current Actor, and dependency count.
- Selected node gains leading edge and surface shift. Blocked node uses broken incoming edge.

#### `DependencyEdge`

- Default 1px neutral; critical path 2px; blocked path danger broken line; automated relation dashed.
- Arrowheads indicate requirement direction. Edge labels appear only for non-obvious relation types.

#### `TimelineEvent`

- Timestamp, Actor geometry, verb, object, optional evidence. The event itself has no card.
- Date separators are sticky and 24px high.

### 14.8 Controls

| Component | Default dimensions | Required states | Rules |
|---|---:|---|---|
| Primary button | 32px, pad 12px | hover, active, focus, loading, disabled | `accent` background + `fg-on-accent`; one per local region |
| Secondary button | 32px, pad 10px | same | neutral surface/border |
| Quiet button | 28/32px | same | no border until hover/focus |
| Danger button | 32px | same + confirmation | danger reserved for destructive action |
| Icon button | 28 or 32px square | same | tooltip + accessible name |
| Input | 32px, pad 8px | empty, filled, focus, error, disabled, read-only | label persists outside field |
| Select | 32px | open, selected, focus, error, disabled | native semantics or accessible listbox |
| Checkbox | 16px | unchecked, checked, mixed, focus, disabled | 32px effective target |
| Toggle | 32×18px | on, off, focus, disabled | immediate binary preference only |
| Tabs | 36px high | default, hover, selected, focus | underline/leading edge, no pill group |
| Segmented control | 32px high | same | 2–4 mutually exclusive views only |
| Filter chip | 28px high | applied, removable, focus | appears only when filter is active |

#### `SearchField`

- Default height 32px; icon 16px; clear control 28px; minimum width 200px, maximum width 480px.
- Search is incremental after 150ms debounce for local data. Remote search follows the repository/API contract and exposes loading separately from empty results.
- Escape clears the query first and releases focus on the second press. Results announce count without stealing focus.

#### `FilterBar`

- Contains filter trigger, applied Filter Chips, result count, and `Clear all` only when at least two filters are active.
- Collapses low-priority chips into `+N filters` below 1200px; the active-filter count remains visible.
- Saved views are named configurations, not a row of permanent pills.

#### `InspectorPanel`

`InspectorPanel` is the implementation primitive behind Intervention Lens. It uses the same width, states, focus, and responsive rules from section 6.6. A generic inspector may show read-only object details; when review, blocked, waiting, or conflict decisions exist, it becomes the Intervention Lens and follows the order `reason → Relay → evidence → action`.

Loading buttons keep their width. Destructive buttons are never the default focused action in a modal.

### 14.9 Overlays and feedback

#### `CommandPalette`

Width 640px, max height `min(70vh, 720px)`, row 44px. Query remains visible; results expose type, action, destination, and shortcut. Empty query shows recent and context-valid commands, not promotional content.

#### `Tooltip`

Max width 280px; 12/16 type; open delay 500ms, subsequent delay 100ms. It cannot contain required instructions or interactive controls.

#### `Popover`

Width 280, 360, or 440px; radius 6px. Focus returns to trigger on close.

#### `Modal`

Widths 420/560/720px; radius 10px; max height 80vh. Header and action footer remain visible while body scrolls.

#### `Drawer`

Desktop use is limited to temporary auxiliary content. At ≤900px it becomes the standard detail/bottom-sheet pattern.

#### `Toast`

Width 320–420px; max three visible; auto-dismiss only for success after 4 seconds. Error, offline, and action-required messages persist. Undo duration is 8 seconds.

### 14.10 Empty, loading, error, stale

- Empty state names the missing object, explains the consequence, and offers one primary next action. Illustration is optional and max 160px.
- Skeleton mirrors final geometry and uses no shimmer under reduced motion.
- Error state shows what failed, what remains safe, and retry or recovery action.
- Stale state preserves last data, timestamps it, marks writes locked when applicable, and never replaces the whole page with a spinner.
- Permission state names the required scope without exposing secrets.

---

## 15. Handoff System — 受け渡しをQuestForgeの主動詞にする

### 15.1 Canonical flows

```text
Human ○ ───────▶ ◩ Agent
Agent ◩ ───────▶ ◩ Agent
Agent ◩ ───────▶ ◇ Review ───────▶ ○ Human
○ Human Review ──revision──▶ ◩ Agent
○ Human Review ──accept────▶ ● Done
```

The symbols above are documentation shorthand. Production uses section 13 geometry and accessible labels.

### 15.2 Domain state mapping

| Handoff state | Visual state | Allowed primary action |
|---|---|---|
| `none` | no active Relay; neutral endpoint | Assign / Prepare |
| `ready` | open connector toward next Actor | Start / Delegate |
| `working` | current Actor filled, active tracer | Inspect / Pause if supported |
| `review_required` | connector converges on Human | Review |
| `accepted` | success endpoint, accepted event | Return to Quest context |
| blocked recovery | broken connector + blocker | Resolve / Retry when valid |

`review_required` must never render as Quest `completed`. Quest planning and lifecycle states remain distinct from Handoff state.

### 15.3 Handoff interaction

Selecting a Relay segment opens its event, actor, time, input, and output evidence in Lens. Before delegation, a preview shows target Actor, permissions, expected state, expected update time, and whether the operation is dry-run. A concurrency mismatch returns the new state in place and asks the user to review; it does not silently overwrite.

Revision keeps the accepted evidence and appends a new Relay leg. It never rewrites history. Agent-to-Agent delegation shows both capability reason and initiating authority.

### 15.4 Compact representations

When space is limited, show previous Actor, current Actor, next expected Actor, and total hidden legs such as `+3`. Do not collapse the entire path into `In progress`. Tooltips may explain a node but cannot be the only source of holder identity.

## 16. RPG Mechanics — 数値が仕事の判断へつながるときだけ見せる

### Quest

A Quest is a unit of intent with time, dependencies, owner, lifecycle, and potential handoff. Its visual identity is the Quest marker and Relay context, not a fantasy scroll.

### XP and progression

XP appears in Profile, Party development, and completion feedback. Use a 4px progress line and explicit `current / next` value. Do not place giant XP totals on Command. Level-up feedback lasts at most 520ms and never blocks navigation.

### MP

MP represents battle/action capacity. Show current, maximum, pending spend, and recovery source when available. A command preview reserves segments before confirmation; rejected commands release them immediately. MP color is exclusive to MP.

### Party

Party is an operational roster. Human and Agent members share row hierarchy while preserving Actor grammar. Capability, availability, assigned load, and current Relay matter more than decorative rarity.

### Battle

Battle is a tactical screen driven by explicit commands and deterministic domain behavior. Quest completion may grant MP according to current product rules; it does not auto-issue a battle command. The interface separates `MP gained`, `command chosen`, and `battle result` as distinct events.

### Rewards, inventory, bosses

Rewards explain provenance and usable effect. Inventory defaults to a compact dataset, not an item-card gallery. Boss art may occupy one contextual region up to 34% of Battle width; it may not become a background behind operational text. Bestiary is an encounter library with status and history.

### Difficulty and status effects

Difficulty uses notches and a label, never stars. Do not invent streaks, buffs, debuffs, rarity, or status effects unless the product domain adds them. If introduced later, they require domain definition and new semantic tokens through section 25 governance.

## 17. Motion — 状態の移動だけを、短く伝える

### 17.1 Tokens

| Token | Value | Use |
|---|---:|---|
| `instant` | 0ms | reduced motion, direct state swap |
| `fast` | 80ms | press, checkbox |
| `quick` | 120ms | hover, selection |
| `standard` | 180ms | popover, row expansion |
| `panel` | 240ms | Lens/drawer |
| `deliberate` | 320ms | graph reflow, handoff transfer |
| `ceremony` | 520ms | Quest completion, level-up maximum |

- Enter easing: `cubic-bezier(.16, 1, .3, 1)`.
- Move easing: `cubic-bezier(.65, 0, .35, 1)`.
- Exit easing: `cubic-bezier(.4, 0, 1, 1)`.

### 17.2 Event motion

| Event | Motion |
|---|---|
| Hover | surface/border transition 120ms |
| Selection | leading edge draws 120ms; no scale |
| Lens open | translate 12px + fade, 240ms |
| Drag | item lifts by shadow only; target line appears 120ms |
| Quest completion | endpoint fill + line settle, ≤520ms |
| Agent execution | 2px tracer travels only on active segment |
| Review handoff | connector converges once, 320ms |
| MP change | segment count interpolates 180ms; number updates immediately |
| Battle state | affected region crossfades 180ms; no full-screen shake |

Continuous ambient animation, bounce, elastic easing, parallax, animated gradients, and layout-shifting hover are prohibited. `prefers-reduced-motion: reduce` sets transitions to 0–80ms, removes tracers, and uses opacity/state swaps.

## 18. Iconography — 機能アイコンは一系統、Actorは独自形状

- Functional icon family: Lucide, already available in the stack.
- Standard size 18px; compact 16px; micro 12px; large empty-state 24px.
- Stroke width 1.75px at 16–20px. Do not mix filled icons except selected terminal state or brand mark.
- Human, Agent, System, Companion nodes are custom SVG/CSS primitives from section 13, not arbitrary Lucide icons.
- Status icons always pair with text in first occurrence and all error/review states.
- Icon-only buttons require accessible name and tooltip.
- Do not mix emoji, icon fonts, Heroicons, Material Icons, or raster symbols into functional controls.

## 19. Data Visualization — 判断へつながる比較だけを描く

### Dependency graphs

Left-to-right is the default requirement direction. Critical path is 2px, ordinary edge 1px, blocked edge broken, automated edge dashed. Zoom range is 50–160%; fit-to-selection and keyboard node traversal are required. A textual dependency outline must be available beside or below the graph.

### Timelines and Chronicle

Time runs top-to-bottom for live activity and left-to-right for bounded schedules. Actor geometry anchors every event. System noise may collapse, but handoff, review, failure, retry, and user action never collapse.

### Capacity and utilization

Use aligned bars or bands with explicit numerator/denominator. Do not use gauges. Thresholds must come from product rules or user configuration. A utilization visualization without a next action belongs in analytics detail, not Capacity Band.

### KPIs and distributions

KPI values use 24/28 at most and sit inline with context. Avoid four-card KPI rows. Distribution uses bars before donuts; pie/donut is allowed only for 2–5 mutually exclusive parts that sum to 100%.

### Battle and MP

Boss progress, MP, command cost, and projected consequence share a common aligned axis. Decorative damage numbers may appear for ≤520ms but the durable result remains in text and Chronicle.

### Chart palette

Default series use `fg-muted`, `agent`, `accent`, `review`, and `battle` in that order, only when meanings do not conflict. More than five series require direct labels, filtering, or small multiples. Legends cannot be color-only.

## 20. Responsive System — 4Kでは情報面を増やし、FHDでは優先度を絞る

### 20.1 Breakpoint behavior

| Range | Behavior |
|---|---|
| `<600` | mobile compatibility; bottom nav, bottom-sheet detail, operational rows |
| `600–900` | single Workfield, compact controls, no persistent Lens |
| `901–1199` | collapsed Rail, overlay Lens, one primary pane |
| `1200–1599` | expanded 184px Rail, 304px Lens, low-priority columns hidden |
| `1600–2239` | 216px Rail, 360px Lens, optional Auxiliary Lane |
| `2240–3199` | 224px Rail, 384px Lens, two synchronized panes |
| `≥3200` | 240px Rail, 416px Lens, up to three purposeful panes |

Breakpoints govern structure, not proportional scaling. Font sizes, row heights, icon sizes, and normal controls remain fixed across desktop sizes.

### 20.2 Target acceptance frames

- 1440×900: primary task and persistent Lens fit without horizontal page scroll.
- 1920×1080: primary plus one useful comparison surface.
- 2560×1440: the 1872px pane budget resolves to approximately 1191px primary and 681px auxiliary after gutters and gap.
- 3840×2160: primary, auxiliary, and Chronicle fill the workspace without a centered empty ocean.
- 390×844: critical Command, Quest, review, and navigation flows remain operable.

### 20.3 Localization resilience

All controls tolerate 35% text expansion. Navigation labels truncate after one line with tooltip; primary actions may wrap only in mobile bottom sheets. Japanese, English, Korean, Simplified Chinese, and the remaining supported locales must use locale-aware line breaking. Fixed pixel widths are forbidden for user-generated titles.

---

## 21. Screen Families — 6つの型で10画面以上を統制する

### Operational family

Command and active execution use Queue + Loom + Lens. They prioritize intervention, current holder, and age. The main axis is temporal.

### Dataset family

Quests, reviews, agents, inventory, and connections use toolbar + dense rows/table + Lens. Saved views, sort, filter, selection, and bulk actions share one implementation grammar.

### Spatial family

Network and campaign exploration use graph/canvas + minimap or outline + Lens. Pan/zoom never hides keyboard and textual alternatives.

### Tactical family

Battle uses encounter context + command lane + event Chronicle. It shares Shell and typography; only battle semantic color and identity art distinguish it.

### Social family

Party uses roster + role/load comparison + selected-member Lens. Presence, capability, and assignment are operational data, not social-media decoration.

### Configuration family

Connections, Profile, and Settings use anchored section navigation + single readable column + contextual status. Settings do not use dashboard cards or giant empty headers.

## 22. Signature QuestForge Patterns — 5つの構造が固有性を作る

### 22.1 Relay Spine

Every handoff is a path of typed Actor nodes and stateful connectors. It answers who acted, who holds the work, who is next, and where the transfer broke. It appears in Quest rows, Lens, Review, Chronicle, and Network at different levels of detail.

### 22.2 Intervention Lens

Review, blocked work, waiting, conflict, and stale state converge into one stable right-hand decision surface. Users keep spatial context while inspecting evidence and acting. The Lens replaces page-hopping and detached notification queues.

### 22.3 Quest Loom

The Loom weaves time as a stable spine, dependencies as cross-threads, and current ownership as Actor nodes. Unlike a Kanban board, it preserves chronology and causal relation simultaneously. It powers Command and can expand into Network.

### 22.4 Capacity Band

Human attention, Agent execution, the current domain constraint, and System health are shown in four stable slots. Battle expands the constraint slot into MP; other domains show their own limiting factor. The user reads available agency without carrying irrelevant RPG data across every screen. Each active segment leads to the constrained queue or resource detail; no segment exists only for decoration.

### 22.5 Execution Chronicle

Chronicle is an append-only, actor-coded account of execution, handoff, system action, review, revision, and result. It makes a living system legible without animated spectacle and supplies evidence for trust.

These patterns are mandatory where their underlying concept appears. A screen cannot replace Relay Spine with a status dropdown, Lens with an unrelated details card, or Capacity Band with KPI cards.

## 23. Accessibility — 状態の読み取りを色覚やマウス操作に依存させない

- Text contrast targets WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for ≥24px or ≥18.66px bold text and meaningful graphics.
- Minimum informative text is 12px; 11px is limited to labels and microcopy with adequate contrast.
- Effective pointer target is at least 32×32px on desktop and 44×44px at ≤900px.
- Keyboard order follows visual order: Rail → Operation Bar → Capacity Band → Workfield → Auxiliary → Lens.
- Every modal traps focus; every popover and Lens returns focus to its trigger.
- Focus is always visible with the 2px focus token. Hover cannot be the only indication.
- Actor and state always combine geometry, icon/line pattern, and text.
- Graphs provide keyboard traversal, a textual outline, selected-node announcement, and relation description.
- Live execution updates use polite ARIA live regions; high-frequency events are batched. Errors and completed destructive actions are assertive.
- Reduced motion follows section 17. Sound is off by default and never the sole status signal.
- Zoom to 200% must preserve actions and prevent text clipping. Browser text scaling must not hide Relay labels.
- Localization, RTL readiness for generic layout primitives, and CJK line breaking are tested even if current locales are LTR.

## 24. Do / Don’t — QuestForgeを一般的なAI SaaSへ戻さない

### Do

1. Do place intervention reason and next action before descriptive analytics.
2. Do show the current holder with Actor geometry and a verb.
3. Do preserve Quest lifecycle and Handoff as separate state systems.
4. Do use rows, lanes, timelines, graphs, and inspectors for dense operational work.
5. Do keep Forge Rail, Operation Bar, Capacity Band, and Lens stable across domains.
6. Do use Relay Spine anywhere work moves between actors.
7. Do show last-known data during sync failure and label its timestamp.
8. Do expose dry-run, permission, and concurrency consequences before delegation.
9. Do use one semantic color and neutral hierarchy per module.
10. Do retain Astra, role, and boss imagery as bounded identity media.
11. Do add responsive panes when width grows instead of scaling controls.
12. Do pair charts with a question, threshold, or action.
13. Do make keyboard focus as deliberate as pointer hover.
14. Do label sample data as `Example` or `fixture` in specs and tests.
15. Do review every screen in Dark and Light at all four desktop frames.
16. Do use direct, verb-first copy such as `Review output` or `Resolve OAuth`.

### Don’t

1. Don’t build the page from a grid of rounded cards.
2. Don’t use purple/blue gradients, glassmorphism, random neon, or glowing borders as AI shorthand.
3. Don’t create giant KPI tiles for count, MP, XP, or utilization.
4. Don’t make every metadata value a pill or badge.
5. Don’t use color as the only distinction between Human, Agent, System, or state.
6. Don’t hide dense information to produce decorative whitespace.
7. Don’t put fantasy ornaments, pixel art, parchment, or game HUD chrome around work controls.
8. Don’t make Battle, Settings, or Party a separate visual universe.
9. Don’t place operational text over character or boss artwork.
10. Don’t invent raw hex, spacing, radius, shadow, z-index, or duration values inside components.
11. Don’t show fake metrics, fake live activity, fake code, or unlabeled demonstration content.
12. Don’t animate continuously when no state is changing.
13. Don’t use a modal for routine object inspection.
14. Don’t reduce a Handoff to a generic status select.
15. Don’t equate `review_required` with Quest completion.
16. Don’t silently overwrite stale or concurrently changed work.
17. Don’t shrink body text below 13px to fit a desktop layout.
18. Don’t center a 1200px app island on 4K while leaving useful space empty.
19. Don’t mix icon libraries or use emoji as functional icons.
20. Don’t create a new component when an existing primitive composition expresses the same behavior.

---

## 25. Agent Implementation Contract — 実装Agentは値を発明しない

This contract is mandatory for Opus 5 and every later coding agent.

### 25.1 Authority and allowed values

1. Use only tokens defined in section 27 or values explicitly defined in a component section.
2. Raw color, spacing, radius, shadow, font size, line height, duration, layout width, and z-index values are forbidden in product components.
3. One-off pixel values are allowed only for mathematical SVG coordinates, 1px hairlines, or browser-required normalization. Add a comment explaining the exception.
4. Product behavior remains governed by `PROJECT_SPEC.md`, schema, API contracts, and shared domain code. Visual migration does not authorize behavior changes.
5. Dark and Light must ship together. A component is incomplete if either mode is unreviewed.

### 25.2 Component creation

Before creating a component, search the shared primitives and this document. Prefer composition. A new shared component requires:

- a named role and owner family;
- anatomy and state list;
- keyboard and screen-reader behavior;
- Dark/Light examples;
- responsive behavior;
- tests or stories for empty, loading, error, disabled, and long-content states as applicable.

Page-local components may not introduce visual primitives. If the same pattern appears twice, evaluate extraction; if it appears in three screen families, extract it unless behavior differs materially.

### 25.3 Token governance

A new token is allowed only when no existing semantic token expresses the need across at least two components or one foundational shell primitive. The change must update:

1. this document;
2. source token data;
3. generated CSS/theme outputs;
4. Dark and Light values;
5. token validation;
6. visual reference coverage.

Token aliases may specialize meaning, such as `--qf-color-handoff-review: var(--qf-color-review)`, but may not hide a new raw value.

### 25.4 Globally locked properties

The following are locked until this document is revised: font families, type scale, spacing scale, radius scale, actor geometry, surface levels, shell regions, primary IA, semantic color roles, motion durations/easing, icon family, and z-index hierarchy.

### 25.5 Deviation process

If implementation cannot follow the specification, stop before inventing a substitute. Record:

- affected screen/component;
- exact rule that cannot be met;
- functional or technical constraint;
- two alternatives with tradeoffs;
- screenshots or reduced reproduction when visual;
- proposed document amendment.

No deviation becomes precedent until `NEWDESIGN.md` is updated. Temporary experiments must be feature-gated or confined to the interaction lab and must not alter production defaults.

### 25.6 Screenshot review

Every migrated screen is captured at 1440×900, 1920×1080, 2560×1440, and 3840×2160 in both modes. Capture the default state plus the screen’s defining interaction: selected row and Lens, active Relay, graph selection, review decision, or battle command preview. Mobile compatibility is captured at 390×844 for Command, Quests, Network, and review flow.

Review screenshots against hierarchy and behavior, not only pixel similarity. A visual regression includes:

- Shell region shift or inconsistent dimensions;
- raw or off-token color/value;
- actor/state ambiguity;
- hidden or clipped primary action;
- typography role drift;
- density drift exceeding 4px in repeated rows;
- new card/pill/shadow pattern;
- excess empty width on WQHD/4K;
- Dark/Light mismatch;
- missing focus, loading, stale, or error state.

### 25.7 Content integrity

Do not invent product counts, people, Agent outputs, success rates, or activity. Fixtures must be deterministic and marked as fixtures in code. Screenshots may use realistic fixtures, but the source must identify them as non-production data. Never expose credentials, tokens, private prompts, or OAuth secrets.

## 26. Visual QA Contract — 主観レビューを客観的な合否へ落とす

### 26.1 Required frames

| Frame | Pass condition |
|---|---|
| 1440×900 | no page-level horizontal scroll; Lens 304px; primary action visible; ≥8 default rows where dataset permits |
| 1920×1080 | optional auxiliary adds comparison value; no stretched text column; Lens 360px |
| 2560×1440 | 1872px pane budget resolves without overflow; reference split ≈1191/681px; Lens 384px |
| 3840×2160 | up to three purposeful panes; density remains desktop-sized; Lens 416px |
| 390×844 | bottom navigation and sheet are operable; 44px targets; no desktop table shrink |

### 26.2 Checklist

- [ ] Page title, section, component, body, metadata, and operational type roles are visually distinct.
- [ ] Alignment resolves to the 4px rhythm except documented 2/6px optical cases.
- [ ] Rows use 44/52/60px or 56/64/72px Relay heights.
- [ ] Workfield is the dominant surface; modules do not become a card mosaic.
- [ ] Rail, Operation Bar, Capacity Band, and Lens remain consistent across screen families.
- [ ] Human, Agent, System, and Companion remain identifiable in grayscale.
- [ ] Working, waiting, review, blocked, and completed remain identifiable without color.
- [ ] Relay history, current holder, and next expected holder are legible.
- [ ] No text, tooltip, popover, graph label, or primary action clips at 100% and 200% zoom.
- [ ] No unexplained whitespace over 64px exists outside graph/focus/reading space.
- [ ] Dark and Light preserve equivalent hierarchy and contrast.
- [ ] Hover, active, selected, focus, disabled, loading, error, stale, and reconnect states are covered.
- [ ] Reduced motion removes tracers and ceremonial movement without losing state.
- [ ] Long Japanese and 35%-expanded English labels remain usable.
- [ ] Artwork stays bounded and never reduces operational text contrast.
- [ ] No raw style values or unauthorized visual primitives appear in the diff.

### 26.3 Differential thresholds

After the new shell is accepted and new goldens are locked, automated image comparison starts with global pixel-difference ≤5%, signature-region ≤7%, and repeated-geometry drift ≤4px. These thresholds are review triggers, not automatic acceptance: a 1% diff that breaks Actor grammar fails; an 8% diff caused by approved long localization may pass with documented review.

### 26.4 Self-critique gate

Before accepting a screen, its reviewer answers yes to all ten questions:

1. Does this avoid generic SaaS composition?
2. Would Linear, Notion, or Discord need substantial redesign to use this exact screen?
3. Do RPG mechanics improve a decision rather than decorate it?
4. Are Human and Agent actions immediately distinguishable?
5. Can the screen support real operational density?
6. Does it remain coherent with every other screen family?
7. Does it use FHD, WQHD, and 4K space intentionally?
8. Are coding agents prevented from inventing styles here?
9. Does at least one signature pattern perform useful work?
10. Is each important choice precise enough to implement without guessing?

Any `no` blocks acceptance and requires a design or specification revision.

## 27. Implementation Tokens — CSS variables are the executable contract

The future token generator should emit these variables. Values here are normative; naming adapters for Tailwind or TypeScript may reference them but not duplicate raw values.

```css
:root,
[data-theme="light"] {
  color-scheme: light;
  --qf-color-canvas: #e9ece8;
  --qf-color-field: #f1f3ef;
  --qf-color-surface: #fafbf8;
  --qf-color-raised: #ffffff;
  --qf-color-inset: #e4e8e3;
  --qf-color-selected: #dce9e1;
  --qf-color-fg-strong: #17201e;
  --qf-color-fg-default: #40504b;
  --qf-color-fg-muted: #66756f;
  --qf-color-fg-disabled: #919b96;
  --qf-color-border-subtle: #d3d9d4;
  --qf-color-border-default: #b9c2bc;
  --qf-color-border-strong: #7c8b84;
  --qf-color-accent: #23312d;
  --qf-color-accent-hover: #17221f;
  --qf-color-fg-on-accent: #f7faf8;
  --qf-color-human: #1d6d4d;
  --qf-color-agent: #2d65a7;
  --qf-color-system: #596863;
  --qf-color-review: #76531b;
  --qf-color-waiting: #825b18;
  --qf-color-success: #236b43;
  --qf-color-warning: #8b5b13;
  --qf-color-danger: #a33f3a;
  --qf-color-mp: #684aa3;
  --qf-color-battle: #8b482d;
  --qf-color-focus: #145fa8;
  --qf-color-scrim: rgba(20, 28, 25, 0.36);
}

[data-theme="dark"] {
  color-scheme: dark;
  --qf-color-canvas: #0b0f10;
  --qf-color-field: #101617;
  --qf-color-surface: #151d1f;
  --qf-color-raised: #1c2729;
  --qf-color-inset: #0d1213;
  --qf-color-selected: #20302c;
  --qf-color-fg-strong: #edf2ef;
  --qf-color-fg-default: #c4ceca;
  --qf-color-fg-muted: #8e9b97;
  --qf-color-fg-disabled: #5e6966;
  --qf-color-border-subtle: #253032;
  --qf-color-border-default: #344244;
  --qf-color-border-strong: #536365;
  --qf-color-accent: #d7e2de;
  --qf-color-accent-hover: #ebf2ef;
  --qf-color-fg-on-accent: #111816;
  --qf-color-human: #67c194;
  --qf-color-agent: #75a7e8;
  --qf-color-system: #9aa7a3;
  --qf-color-review: #d9b36a;
  --qf-color-waiting: #d2a65a;
  --qf-color-success: #64ba86;
  --qf-color-warning: #e1a85a;
  --qf-color-danger: #e77068;
  --qf-color-mp: #b59ae8;
  --qf-color-battle: #d8875f;
  --qf-color-focus: #9bc8ff;
  --qf-color-scrim: rgba(0, 0, 0, 0.62);
}

:root {
  --qf-font-sans: "IBM Plex Sans Variable", "Noto Sans JP", "Noto Sans KR", "Noto Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --qf-font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Consolas, monospace;

  --qf-text-display: 600 32px/38px var(--qf-font-sans);
  --qf-text-page: 600 24px/30px var(--qf-font-sans);
  --qf-text-section: 600 18px/24px var(--qf-font-sans);
  --qf-text-component: 600 14px/20px var(--qf-font-sans);
  --qf-text-body: 400 14px/20px var(--qf-font-sans);
  --qf-text-compact: 400 13px/18px var(--qf-font-sans);
  --qf-text-label: 600 11px/16px var(--qf-font-sans);
  --qf-text-metadata: 400 12px/16px var(--qf-font-sans);
  --qf-text-micro: 500 11px/14px var(--qf-font-sans);
  --qf-text-kpi: 600 24px/28px var(--qf-font-sans);
  --qf-text-operational: 500 12px/16px var(--qf-font-mono);

  --qf-space-0: 0;
  --qf-space-1: 2px;
  --qf-space-2: 4px;
  --qf-space-3: 6px;
  --qf-space-4: 8px;
  --qf-space-5: 12px;
  --qf-space-6: 16px;
  --qf-space-7: 20px;
  --qf-space-8: 24px;
  --qf-space-9: 32px;
  --qf-space-10: 40px;
  --qf-space-11: 48px;
  --qf-space-12: 64px;

  --qf-radius-none: 0;
  --qf-radius-xs: 2px;
  --qf-radius-sm: 4px;
  --qf-radius-md: 6px;
  --qf-radius-lg: 10px;
  --qf-radius-pill: 999px;

  --qf-border-width: 1px;
  --qf-selection-width: 2px;
  --qf-focus-width: 2px;
  --qf-focus-offset: 2px;
  --qf-shadow-none: none;
  --qf-shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.22);
  --qf-shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.32);

  --qf-motion-instant: 0ms;
  --qf-motion-fast: 80ms;
  --qf-motion-quick: 120ms;
  --qf-motion-standard: 180ms;
  --qf-motion-panel: 240ms;
  --qf-motion-deliberate: 320ms;
  --qf-motion-ceremony: 520ms;
  --qf-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --qf-ease-move: cubic-bezier(0.65, 0, 0.35, 1);
  --qf-ease-exit: cubic-bezier(0.4, 0, 1, 1);

  --qf-control-compact: 28px;
  --qf-control-default: 32px;
  --qf-control-comfortable: 40px;
  --qf-row-compact: 44px;
  --qf-row-default: 52px;
  --qf-row-comfortable: 60px;
  --qf-relay-compact: 56px;
  --qf-relay-default: 64px;
  --qf-relay-comfortable: 72px;
  --qf-operation-bar-height: 48px;
  --qf-capacity-band-height: 32px;
  --qf-rail-collapsed: 56px;
  --qf-pane-gap: 12px;

  --qf-z-base: 0;
  --qf-z-sticky: 100;
  --qf-z-lens: 200;
  --qf-z-popover: 300;
  --qf-z-toast: 400;
  --qf-z-modal-backdrop: 500;
  --qf-z-modal: 510;
  --qf-z-command: 600;
  --qf-z-tooltip: 700;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --qf-motion-quick: 0ms;
    --qf-motion-standard: 0ms;
    --qf-motion-panel: 80ms;
    --qf-motion-deliberate: 80ms;
    --qf-motion-ceremony: 80ms;
  }
}
```

### 27.1 Layout token adapters

```css
:root {
  --qf-rail-width: 184px;
  --qf-lens-width: 304px;
  --qf-page-gutter: 20px;
}

@media (min-width: 1600px) {
  :root { --qf-rail-width: 216px; --qf-lens-width: 360px; --qf-page-gutter: 24px; }
}
@media (min-width: 2240px) {
  :root { --qf-rail-width: 224px; --qf-lens-width: 384px; --qf-page-gutter: 32px; --qf-pane-gap: 16px; }
}
@media (min-width: 3200px) {
  :root { --qf-rail-width: 240px; --qf-lens-width: 416px; --qf-page-gutter: 40px; }
}
@media (max-width: 1199px) {
  :root { --qf-rail-width: 56px; --qf-lens-width: min(384px, 92vw); --qf-page-gutter: 16px; }
}
```

Theme initialization follows OS preference on first run. A saved user choice of `light`, `dark`, or `system` takes precedence. Do not flash the wrong theme before hydration.

## 28. Screen Specification Matrix — 各画面の実装判断を先に固定する

| Screen | Purpose / primary action | Primary / secondary information | Archetype and shell | Context / unique components | Empty / loading / error |
|---|---|---|---|---|---|
| Command | choose and resolve the next intervention; `Act on next` | intervention queue, active Loom / Capacity, Chronicle | Operational; full shell, persistent Lens | Quest Loom, Intervention Item, Relay Spine | setup guidance / geometry skeleton / preserve last data and recovery |
| Quests | plan and manage work; `Create Quest` | title, horizon, lifecycle, holder / recurrence, priority, dependencies | Dataset; table + Lens | Quest Table, bulk bar, schedule filter | create first Quest / row skeleton / retry with cached rows |
| Network | understand dependency and transfer risk; `Inspect critical path` | graph, blocked/critical edges / outline, minimap | Spatial; graph + Lens, aux outline | Dependency Node/Edge, Relay overlay | connect Quests / node skeleton or staged layout / textual outline remains usable |
| Agents | inspect capability and execution; `Assign work` | roster, current action, load / MCP client, scope, history | Dataset under Party; Lens | Agent Identity, status, capability, Chronicle | connect/register Agent / roster skeleton / show offline and safe retry |
| Reviews / Interventions | decide output; `Review` | evidence, Relay origin, age / revision history, affected Quest | Operational/Dataset inside Command; Lens is decision surface | Review Queue Item, evidence diff, Handoff Path | no decisions means calm live state / evidence skeleton / action locked, output preserved |
| Battle | issue a tactical command; `Preview command` | encounter phase, boss progress, MP, commands / battle log, reward context | Tactical; command lane + Chronicle + bounded art | MP Indicator, Battle Status, command preview | select encounter / meter and command skeleton / preserve deterministic last state |
| Party | manage human+Agent roster; `Invite or assign` | members, roles, availability, load / current Relays, invites | Social; roster + comparison + Lens | Party Member, Actor grammar, Assignment Control | create/join Party / roster skeleton / scoped retry and invite status |
| Connections | connect services safely; `Connect` | provider status, sync health, scope / last sync, capability | Configuration/Dataset; full shell, Lens for scopes | Connection Row, permission preview, sync Chronicle | explain benefits without hype / row skeleton / reconnect with data preservation |
| Profile | understand identity/progression; `Edit profile` | identity, XP, public fields / history, preferences | Configuration; identity menu entry | bounded avatar, XP line, privacy controls | default profile / field skeleton / local editing preserved |
| Settings | configure behavior; `Save changed setting` | section fields, current values / effects, shortcuts | Configuration; anchored nav, max 960px | Input primitives, theme/density controls | defaults always exist / control skeleton only when remote / inline error per section |
| Companion | inspect Astra relationship and role; `Configure companion` | companion state, role, participation / progression, history | Social/Profile subview | crest node, bounded identity art, Chronicle | introduce capability / identity skeleton / fallback crest and retained settings |
| Inventory / Rewards / Shop | inspect and use earned resources; contextual `Use` or `Acquire` | item effect, provenance, availability / history, constraints | Dataset under Battle | compact item rows, reward provenance | explain earning path / row skeleton / transaction-safe error |
| Bestiary / Bosses | choose or study encounters; `Open encounter` | boss state, requirements, history / rewards, artwork | Tactical library under Battle | encounter rows, bounded boss art | explain unlock condition / row/art skeleton / cached metadata and retry |

### 28.1 Command composition

Command is the Golden Screen because it contains QuestForge’s complete operational grammar. The first implementation target is exactly `1920×1080`, Dark mode, default density. It is reviewed before any other screen family is expanded.

#### Golden frame geometry — 1920×1080 Dark

```text
x=0                                                        x=1920
┌──────────216──────────┬──────────────1704────────────────────┐ y=0
│ Forge Rail           │ Operation Bar 48                     │
│                      ├────────────────1344─────────┬──360─────┤ y=48
│                      │ Capacity Band 32           │ Lens     │
│                      ├────────────────────────────┤          │ y=80
│                      │ Workspace Header 48        │          │
│                      ├─24─┬─296─┬12┬────988────┬24┤          │ y=128
│                      │    │     │  │ Quest Loom│  │          │
│                      │    │ Int.│  │ h=620     │  │          │
│                      │    │Queue│  ├───────────┤  │          │ y=772
│                      │    │h=904│  │ gap 12    │  │          │
│                      │    │     │  ├───────────┤  │          │ y=784
│                      │    │     │  │ Chronicle │  │          │
│                      │    │     │  │ h=272     │  │          │
│                      ├────┴─────┴──┴───────────┴──┤          │ y=1056
│                      │ bottom gutter 24           │          │
└──────────────────────┴────────────────────────────┴──────────┘ y=1080
```

Exact rectangles:

| Region | x | y | width | height |
|---|---:|---:|---:|---:|
| Forge Rail | 0 | 0 | 216 | 1080 |
| Operation Bar | 216 | 0 | 1704 | 48 |
| Capacity Band | 216 | 48 | 1344 | 32 |
| Workspace Header | 216 | 80 | 1344 | 48 |
| Intervention Queue | 240 | 152 | 296 | 904 |
| Quest Loom | 548 | 152 | 988 | 620 |
| Execution Chronicle | 548 | 784 | 988 | 272 |
| Intervention Lens | 1560 | 48 | 360 | 1032 |

The Loom’s 988px width resolves its exact column grid to `32 / 72 / 96 / 452 / 184 / 152px`. The 452px Quest identity column is the only flexible result. Lens begins below Operation Bar so global search and identity remain one uninterrupted shell layer.

#### Golden fixture composition

All content used for the golden is marked `fixture` in source. Names and counts are examples, never production claims.

- Capacity Slot A: at least one Human review intervention.
- Slot B: one executing Agent and one queued Agent.
- Slot C: at least one Blocked Quest; this is Command, so MP is absent.
- Slot D: `Synced` default, plus a separately captured `Stale` state.
- Intervention Queue: one selected `review_required`, one waiting item, and one grouped blocker affecting three consecutive Quests.
- Quest Loom: eight or nine visible 64px rows, including Human → Agent, Agent → Agent, Agent → Human Review, working, waiting, three same-cause blocked rows, and one completed endpoint.
- Intervention Lens: selected review reason, full Relay, evidence, one primary `Review output` action, and alternative revision path.
- Chronicle: at least one Human action, Agent execution, System event, Handoff, blocked event, and review request. Events retain Actor geometry.

The selected review is the same object in Queue, Loom, Lens, and Chronicle. Selection uses the leading edge and `surface-selected`; only the Relay state uses `review`. No region invents a different highlight color.

#### Golden interaction states

The Golden Screen capture set contains:

1. `command-1920x1080-dark-default`: selected review, Lens open.
2. `command-1920x1080-dark-relay-active`: Agent executing with active tracer.
3. `command-1920x1080-dark-blocked-group`: shared blocker rail and complete Lens evidence.
4. `command-1920x1080-dark-stale`: data preserved, writes locked, Slot D expanded.
5. `command-1920x1080-light-default`: hierarchy parity check.
6. `command-1440x900-dark-default`: Queue moves to Lens queue tab; Loom keeps at least 912px content width.
7. `command-2560x1440-dark-default`: Command applies content minimums to resolve the 1872px budget as 1200px primary + 672px Auxiliary. The primary contains a 288px Queue, 12px gap, and 900px Loom; Auxiliary holds Chronicle.
8. `command-3840x2160-dark-default`: Queue/Loom, Auxiliary context, and Chronicle use three panes without scaling type.

#### Golden authority

Before approval, this written blueprint is authoritative. After visual approval, the implementation source, approved screenshot, and component preview set form a three-part golden:

1. `NEWDESIGN.md` controls principles, behavior, tokens, and responsive rules.
2. The approved Command screenshot controls composition, rhythm, and visual weight at 1920×1080 Dark.
3. Golden component previews control component anatomy and state rendering.

Approved captures are stored under `design/reference/relay-forge/command/`; component-state captures live under `design/reference/relay-forge/components/`. `design/reference/relay-forge/manifest.json` records viewport, mode, fixture revision, source commit, capture date, and approval state. These paths are future migration outputs and are not created by this specification-only task.

Pixel matching may not violate accessibility, localization, runtime state, or this document. When the three sources conflict, fix the source conflict through section 25.5; do not silently choose one.

### 28.2 Quests composition

The default table columns are Quest, horizon, lifecycle, current holder, Relay state, and priority/difficulty. Dependencies, recurrence, source integration, and timestamps enter at wider widths or Lens. Archive is a saved view, not a separate visual system.

### 28.3 Network composition

The graph starts with critical and blocked relations emphasized. Selecting a node opens Relay and Quest evidence in Lens. Selecting an edge explains direction and blocker. The textual outline mirrors selection and remains available to assistive technology.

### 28.4 Battle composition

The command lane stays operational: command, MP cost, availability, and projected consequence align in rows. Boss art occupies the far context edge and fades behind no text. Chronicle separates MP gain, command issuance, and result.

## 29. Migration / Implementation Strategy — `/next/`で統合し、証拠を揃えてから`/`へ昇格する

This is a sequence, not authorization to implement in this task.

### Phase 0A — No-code implementation audit

- The target implementation agent, initially Opus 5 Medium, inspects repository architecture, current routes, state ownership, token generation, tests, and migration boundaries.
- It returns an implementation map, risk register, proposed file scope, and questions. It must not edit code, generate components, or alter dependencies.
- The parent/product owner resolves architecture and product decisions before implementation begins.

Exit: every planned write maps to an approved phase and existing functional contract.

### Phase 0B — Contract and token foundation

- Approve this document as the new visual authority.
- Add machine-readable token source matching section 27.
- Extend design validation so raw values and missing tokens fail CI.
- Record existing screens as historical references, not new goldens.

Exit: token generation and document checks pass without changing production behavior.

### Phase 1 — Shell and primitive foundation only

- Build Relay Forge Shell on `/next/` behind a route or feature boundary.
- Implement Actor nodes, Relay Spine, Lens, typography, surfaces, controls, empty/loading/error states.
- Preserve existing repository, auth, Worker REST, Firebase, MCP, and domain contracts.

Exit: Shell and primitives pass both modes, keyboard review, and four desktop frames.

### Golden Gate — Command only

- Implement the 1920×1080 Dark Command blueprint in section 28.1 with deterministic fixtures.
- Capture the eight required Golden interaction/responsive states.
- Review the result for hierarchy, QuestForge identity, Relay legibility, Loom congestion, density, and theme parity.
- Do not migrate another major destination until the user explicitly accepts the Golden Screen.
- After acceptance, lock the screenshot and component previews under a new Relay Forge reference namespace. Legacy v3 images remain historical references.

Exit: the user’s acceptance is the gate. Passing automated pixel checks alone is insufficient.

### Phase 2 — Operational expansion

- Migrate Quests, Reviews, and Agents from the accepted Command grammar. Command is already established by the Golden Gate.
- Add deterministic fixtures only for visual tests; mark them as fixtures.

Exit: a user can find blocked/review/waiting work and complete a valid handoff without legacy visual primitives.

### Phase 3 — Spatial and tactical systems

- Migrate Network, Battle, Party, and Chronicle.
- Validate graph accessibility, battle determinism, MP preview, artwork boundaries, and wide-screen panes.

Exit: all five signature patterns operate in real flows.

### Phase 4 — Configuration and secondary surfaces

- Migrate Connections, Profile, Settings, Companion, Inventory/Rewards/Shop, and Bestiary.
- Verify all nine locales, auth/sync/stale behavior, OAuth scope copy, and privacy states.

Exit: no major destination depends on legacy visual tokens.

### Phase 5 — Promotion

- Capture and approve new goldens at required frames and modes.
- Run product, accessibility, contract, visual, and build checks.
- Promote the successor shell from `/next/` to `/` while maintaining compatible deep links.
- Retire legacy visual code only after parity is demonstrated and rollback remains available.

Exit: `/` is Relay Forge and `/next/` no longer carries a separate visual identity.

### Theme preference migration

Legacy `Arcane`, `Soft Ops`, and `Retro` visual preferences map to the single Relay Forge identity. Preserve the user’s Light/Dark preference when known. Unknown or first-run preference maps to `system`. Do not simulate old themes with hidden token branches; migration is one-way after explicit release acceptance.

### Asset migration

Use existing Astra, role, and boss media only where the relevant identity appears. Follow `design/ASSET_MANIFEST.md` for provenance and allowed surfaces until its rules are formally migrated into the new asset manifest. Do not use identity art as generic panel background, texture, navigation decoration, or empty-state filler.

## 30. Final Self-Critique — Relay Forgeは装飾ではなく構造で固有になる

1. **Generic SaaSか:** No. Queue, Loom, Relay, Lens, Capacity, Chronicle replace card-dashboard composition.
2. **Linear / Notion / Discordでも使えるか:** Not without changing their core object and workflow model. Actor transfer and intervention structure are QuestForge-specific.
3. **RPGが装飾だけか:** No. MP previews capacity and cost; Battle separates command from work completion; Party represents operational capability.
4. **HumanとAgentを即座に区別できるか:** Yes. Geometry, labels, connectors, verbs, and motion differ without relying on color.
5. **高密度に耐えるか:** Yes. Fixed row scales, table rules, progressive detail, virtualization, and Lens preserve scanning.
6. **10画面以上で一貫するか:** Yes. Six screen families share one Shell, surface hierarchy, primitives, and actor grammar.
7. **FHD/WQHD/4Kで機能するか:** Yes. Fixed desktop scale and purposeful pane expansion are specified per frame.
8. **実装Agentのstyle driftを防げるか:** Yes. Values, governance, screenshot review, deviation process, and regression definitions are explicit.
9. **固有のinteraction patternが3つ以上あるか:** Yes. Relay Spine, Intervention Lens, Quest Loom, Capacity Band, and Execution Chronicle are functional patterns.
10. **主要判断を推測なしで実装できるか:** Yes for visual implementation. Functional ambiguity must defer to `PROJECT_SPEC.md` and existing contracts rather than be guessed here.

QuestForgeの見た目を固有にするのは、暗色、キャラクター、RPG用語ではない。人間とAgentの仕事がRelayとして流れ、介入点がLensへ集まり、時間と依存がLoomとして編まれる構造そのものが、QuestForgeの顔になる。

## Appendix A — 用語集

| Term | Definition |
|---|---|
| Actor | Questへ作用するHuman、Agent、System、Companionの総称 |
| Relay | Actor間で仕事、判断、証拠、権限が受け渡される流れ |
| Relay Spine | Relayをtyped nodeとconnectorで描く共通表現 |
| Intervention | Humanの判断または明示操作が必要なReview、Blocked、Waiting、Conflict |
| Intervention Lens | 選択対象の理由、Relay、証拠、actionを右側へ集約する決定面 |
| Quest Loom | 時間軸、依存、現在のholderを同じ作業面で編む表示 |
| Capacity Band | Human attention、Agent execution、domain constraint、System healthを固定slotで示す帯 |
| Execution Chronicle | ActorとSystemの実行、受け渡し、判断、結果を追記する履歴 |
| Workfield | 各screen familyの主作業を置くShell中央面 |
| Auxiliary Lane | 比較価値がある場合だけ追加される同期副画面 |
| identity media | Astra、role avatar、boss artなど、対象の人格を示す画像資産 |

仕様で解決しない視覚判断は、推測で実装せず25.5のDeviation processへ送る。機能判断は`PROJECT_SPEC.md`、契約判断はschema/API/shared domain codeへ戻る。
