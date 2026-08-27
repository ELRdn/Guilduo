---
version: alpha
name: Guilduo Visual Constitution
description: Visual identity and interaction rules for the Guilduo web surfaces.
colors:
  primary: "#4F8A6D"
  secondary: "#243B3B"
  tertiary: "#B98535"
  neutral: "#F3F2EF"
  surface: "#FFFFFF"
  on-surface: "#1F272A"
  on-warm: "#000000"
  line: "#D9E0E8"
  success: "#4F8A6D"
  warning: "#B98535"
  danger: "#C45D5D"
  accent: "#4D7D8E"
typography:
  display:
    fontFamily: "Inter, 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Segoe UI', system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: 0em
  heading:
    fontFamily: "Inter, 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Segoe UI', system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0em
  body-md:
    fontFamily: "Inter, 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Segoe UI', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0em
  body-sm:
    fontFamily: "Inter, 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Segoe UI', system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  label:
    fontFamily: "Inter, 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Segoe UI', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0em
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Cascadia Mono, JetBrains Mono, Consolas, monospace"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0em
rounded:
  none: 0px
  sm: 4px
  md: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
components:
  page-shell:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-warm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  surface-neutral:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.gutter}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-warm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  status-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-warm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  action-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  rpg-emphasis:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  divider:
    backgroundColor: "{colors.line}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.none}"
  quest-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  quest-row-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  quest-tree-node:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  agent-badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  human-badge:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-warm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  astra-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  party-member:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  handoff-badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  mp-gauge:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  xp-bar:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-warm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  reward-chip:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  battle-command:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  sync-indicator:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  status-badge:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  sidebar-item:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  bottom-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  checkbox:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  tooltip:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  toast:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
---

# Guilduo Design

> **English summary:** Guilduo is a Human × AI Work Platform presented as a tactical operations board. The work interface is primary, RPG language adds motivation and identity, and Relay, Evidence, and Decision make human-agent coordination explicit. The root `/` surface is the visual baseline; `/next/` documents only its intentional visual and interaction differences.

最終更新: 2026-08-17  
対象: `0.6.0-beta.4` / REST・MCP `2.7.0` / Schema `7`
文書の位置づけ: 視覚設計とUI操作の正本

技術仕様、ドメイン不変条件、認証、MCP、リリースの正本は[`PROJECT_SPEC.md`](PROJECT_SPEC.md)である。UI変更前にはこの文書と対象Surfaceの設計書を読む。

## 1. Visual Identity

Guilduoは、**HumanとAI Agentの作戦盤に、節度あるRPGの手触りを重ねる**。

視覚比率は次で固定する。

```text
70%  serious productivity / operations board
20%  RPG state, reward, party and battle language
10%  restrained retro or pixel flavor
```

感じさせたい印象:

- 集中できる
- 実務的
- 冒険的
- 協力的
- 少し懐かしい

避ける印象:

- 子ども向けすぎる
- Generic AI SaaS
- サイバーパンク
- Fantasy MMO
- 過剰なゲーミフィケーション
- ガラスモーフィズム中心のUI

視覚上の優先順位:

1. 作業の判断、進捗、担当、期限
2. Handoff、Agent、Party、同期状態
3. MP、報酬、Battle、キャラクター
4. レトロな境界線、ピクセル感、短い演出

キャラクターとボス画像は装飾ではなく、担当者・相棒・敵・戦闘状態を理解するために使う。RPG要素を増やす場合も、作業判断の邪魔をしない。

### 1.1 Token precedence

数値トークンの機械的な正本は[`design/TOKENS.json`](design/TOKENS.json)である。Front Matterの共通値は`Soft Ops Light`を表すlint用スナップショットであり、実行時は選択されたテーマとライト／ダークモードの値を優先する。意味、優先順位、禁止事項はこの文書を正本とする。

```text
DESIGN.md prose            = visual meaning and constraints
design/TOKENS.json         = runtime numeric values
design/tokens.generated.css = generated CSS custom properties (`npm run tokens:generate`)
DESIGN.md frontmatter      = Soft Ops Light validation snapshot
interaction-lab/           = explicit Next-only overrides
```

`design/tokens.generated.css`は`design/TOKENS.json`から`npm run tokens:generate`（`tools/generate-tokens.mts`）で生成する。**このファイルを直接編集してはならない**。トークン値を変更する場合は`design/TOKENS.json`を編集してから再生成し、`npm run tokens:check`でドリフトがないことを確認する。

`/interaction-lab/`は開発用ルート、ビルド後に公開される`/next/`は公開βルートであり、別のデザインシステムではない。

## 2. Colors

### 2.1 Semantic roles

| 意味 | 基本色 | 使用箇所 |
| --- | --- | --- |
| Human / Primary | Green | 人間の操作、完了、承認、成功 |
| Agent / Integration | Blue | Agent、MCP、外部連携、機械処理 |
| RPG / MP / Reward | Orange・Gold | MP、報酬、Battle、期限注意 |
| Danger | Red | エラー、ブロック、危険な注意 |
| Neutral | Gray・Surface | 背景、境界線、補助情報 |

- Orangeを通常の主要CTAに使わない。
- Blueを装飾目的だけで使わない。
- 1つのパネルで強いアクセント色を複数同時に主役にしない。
- Danger色は危険、エラー、ブロック状態に限定する。
- 白文字を使う背景色はコントラスト比4.5:1以上を維持する。
- 新しいアクセント色を勝手に追加しない。

### 2.2 Existing theme mapping

以下は現在のCSSテーマ変数を意味トークンへ対応付けた実装基準である。値を変更する場合は、ライト／ダークの両方とコントラストを確認する。

| Theme | Mode | Surface / Canvas | Human | Agent | RPG | Danger |
| --- | --- | --- | --- | --- | --- | --- |
| Arcane | light | `#FFF9F0` / `#ECEAE3` | `#4F8069` | `#56757A` | `#A8792B` | `#A24F58` |
| Arcane | dark | `#20262B` / `#15191D` | `#78B998` | `#79AEB6` | `#D6AD5E` | `#EF858B` |
| Soft Ops | light | `#FFFFFF` / `#F3F2EF` | `#4F8A6D` | `#4D7D8E` | `#B98535` | `#C45D5D` |
| Soft Ops | dark | `#1E2830` / `#171F23` | `#78B493` | `#69A8EF` | `#D2A75F` | `#E98282` |
| Retro | light | `#FFF8E8` / `#EEE6D8` | `#4C8D42` | `#315C78` | `#B16F20` | `#C24732` |
| Retro | dark | `#1D2130` / `#11131A` | `#82C36F` | `#74A6C7` | `#E2B35E` | `#F0765E` |

Soft Opsは初期テーマ。Arcaneは魔法的な静けさ、Retroは高コントラストのゲーム画面として差別化する。テーマ差分は色、境界線、影、短いSE／モーションに限定し、情報構造を変えない。

> **2026-08-22改定注記**: Soft Ops darkの`Surface / Canvas`と`Agent`は、`design/TOKENS.json`が実装（`interaction-lab/styles.css`・`styles.css`）と食い違っていたため、UI v4.3 Foundation作業の一環として実装値へ整合した（Agent: `#78A8B8`→`#69A8EF`、Surface/Canvas: `#202624`/`#151918`→`#151D20`/`#151D20`）。ArcaneとRetroのdarkは元々実装と完全一致していたため無変更。この整合は、Foundation期間中のPixel変化を避けるため、現行の承認済み実装(Appearance)を一時的な互換ベースライン(temporary compatibility baseline)として採用したものである。
>
> **2026-08-23改定注記（恒久的なVisual Constitution変更）**: Soft Ops darkの黒白コントラストが強すぎるというフィードバックを受け、`Surface`と`Canvas`を分離した（従来は両方とも`#151D20`で同一値=面差ゼロ、境界線のみで階層を表現していた）。`Canvas #171F23` → `Surface #1E2830`という薄い持ち上げにより、線に頼らない面の階層を作る。あわせて本文の`ink`（`#EDF2F0`→`#E2E7E5`）・`line`（実効値`#28363b`→`#30414a`）・`sidebar rail`（`#11191C`→`#171F23`）も純白・強い境界線を避ける方向へ調整した。これは一時的な互換ベースラインではなく、意図した恒久的な色定義変更である。Human/Agent/RPG/Danger等のアクセント色とArcane/Retroの値は今回のスコープ外で無変更。

### 2.3 Semantic implementation rule

- `Human`、完了、承認、成功はGreen系を使う。
- `Agent`、MCP、外部連携、機械処理はBlue系を使う。
- `MP`、報酬、Battle、期限注意はOrange／Gold系を使う。
- `Danger`、エラー、ブロック、危険な注意はRed系に限定する。
- `mp-gauge`、`battle-command`、`reward-chip`はBlue系へ変更してはならない。
- Front Matterの`tertiary`はRPG／MP／Rewardの共通フォールバックである。

## 3. Typography

外部フォント取得を増やさず、システム優先で表示する。

```text
UI:
Inter, "Noto Sans JP", "Noto Sans KR", "Noto Sans SC",
"Noto Sans TC", "Segoe UI", system-ui, sans-serif

Data / Agent:
ui-monospace, "SFMono-Regular", "Cascadia Mono",
"JetBrains Mono", Consolas, monospace
```

- 日本語、韓国語、中国語、ロシア語、キリル文字で崩れないfallbackを明記する。
- Quest、Agent ID、MP、XP、時刻などのデータ表示はmono系を優先する。
- BattleやMP表示のRPG感は文字装飾より、色、境界線、モーション、画像で表現する。
- 外部のピクセルフォントは追加しない。
- letter-spacingを負値にしない。
- 日本語・韓国語では英語より行間を広くする。
- 小さなラベルを過度に縮小しない。

## 3.1 Iconography

機能アイコンはLucide vanillaへ統一する。React専用のアイコン実装や複数ライブラリの混在は行わない。

| 用途 | 基準サイズ | Stroke |
| --- | ---: | ---: |
| Navigation | 18px | 1.75px |
| Inline | 16px | 1.75px |
| Action | 18px | 1.75px |
| Empty state | 24px以下 | 1.75px |

アイコンは`aria-hidden="true"`または説明的なARIA名を持つ。Questの`◆`、`◇`などの階層マーカーは機能アイコンではなくデータ表現として扱う。機能ボタンへ絵文字や意味不明なUnicode記号を使わない。

## 4. Layout

寸法はSurfaceごとの基準レンジとして扱う。レンジ内の調整は翻訳、アクセシビリティ、実データを優先する。

### 4.1 Current `/`

- 左レール: 280〜304px
- workspace左右余白: 20〜28px
- Hero領域: 140〜156px
- 構造パネルの角丸: 最大8px
- タスク列: 4列を基本とし、狭幅で段階的に縮小

### 4.2 Next `/next/`

- 左レール: 216〜232px
- 上部ステータス: 96〜110px
- 右サイドバー: 280〜320px
- Quest行: 80〜96px
- モバイルQuest行: 104〜116px
- パネル間隔: 12〜18px
- workspace左右余白: 16〜24px

### 4.3 Responsive rules

- 1180px以下: 列幅と補助情報を段階的に縮小する。
- 1060px以下: Next版のナビをアイコン中心へ変更する。
- 901px以上: Todayの中央Quest一覧だけをスクロールする。
- 900px以下: ページ全体をスクロールする。
- スマホ詳細は下部シートを標準とし、ポップアップは設定で切り替える。
- 長いタイトル、ドイツ語、ロシア語で列を重ねない。
- 数字、階層マーカー、Quest本文は同じグリッド領域に重ねない。
- 固定領域とスクロール領域の境界を、面色・境界線・スクロール可能性で理解できるようにする。

## 5. Components

### 5.1 Quest row anatomy

Quest行は次の順序を守る。

```text
hierarchy marker
selection control
quest code
title / summary
progress
assignee
handoff state
due / focus
```

Quest番号、選択チェック、ひし形マーカー、タイトルは別グリッド領域へ置く。長文はタイトル領域だけで自然に折り返し、進捗・担当・期限を押し出さない。モバイルでは補助列を下段へ移し、横スクロールを発生させない。

### 5.2 Component rules

| Component | 役割 | 重要なルール |
| --- | --- | --- |
| `quest-row` | Questの比較と操作 | タイトル、進捗、担当、状態を一行に詰め込みすぎない |
| `quest-row-selected` | 選択状態 | 背景・境界線・`aria-selected`で示す |
| `quest-tree-node` | 親子構造 | インデントと番号を重ねない |
| `agent-badge` | AI担当 | Blue系、Providerと状態を分けて表示 |
| `human-badge` | 本人担当 | Green系、Astraと混同しない |
| `astra-card` | 相棒キャラクター | ユーザー本人のプロフィールと分離する |
| `party-member` | 作戦上の所属 | Human、Astra、Agentの関係を説明する |
| `handoff-badge` | Agent作業状態 | `working`、`blocked`、`review_required`を明示する |
| `mp-gauge` | Battle資源 | Orange・Gold系、現在値と上限を同時に示す |
| `xp-bar` | 成長進捗 | Green系、割合と実値を併記する |
| `reward-chip` | 報酬 | Orange・Gold系、通常CTAに使わない |
| `battle-command` | Battle操作 | コスト、実行可能性、結果を明示する |
| `sync-indicator` | 同期状態 | checking、syncing、synced、stale、errorを区別する |
| `status-badge` | 状態ラベル | 短い文言、pill形状は状態に限定する |
| `sidebar-item` | ナビゲーション | 選択中・フォーカス・無効を明確にする |
| `bottom-sheet` | モバイル詳細 | 一覧操作を覆い隠さず、閉じる操作を常に提供する |
| `dialog` | 編集・確認 | 主操作とキャンセルを分離する |
| `input` / `select` | 入力 | ラベル、エラー、フォーカスを明示する |
| `checkbox` | 複数選択 | Shift、Ctrl／⌘操作と同じ状態モデルを使う |
| `tooltip` | アイコン説明 | 不明なアイコンだけに使い、主要操作を隠さない |
| `toast` | 軽い結果通知 | 成功・警告・失敗を色とテキストで伝える |

### 5.3 Information priority

すべての画面で、主操作、現在状態、次の判断、補助情報の順に配置する。情報をカードで囲むこと自体を目的にしない。Battle、Party、連携は空白を残しすぎず、概要・現在状態・次の操作を同じ視線内に置く。

## 6. Component states

最低限、次の状態を定義する。

```text
default
hover
active
focus-visible
disabled
selected
loading
error
```

- `focus-visible`は3px程度の明確なアウトラインを表示する。
- hoverで大きく拡大しない。
- disabledは色だけでなく、操作不可と理由を示す。
- loadingはスケルトンまたは進行表示を使う。
- selectedは背景、境界線、ARIA状態で示す。
- 状態を点滅だけに依存しない。
- 同期中の書き込みボタンは無効化し、再接続ボタンを提示する。

## 7. Elevation & Depth

- 深さは主に境界線と面色で表現する。
- Quest行・通常カードは1px境界線を基本にする。
- Popoverは小さな影、Modalは中程度の影を使う。
- 固定サイドバーは位置と境界線で区別する。
- ガラスモーフィズム、neumorphism、色付きglowは禁止する。
- 構造パネルへ大きな影を常用しない。

## 8. Shapes

- Button: 4px前後
- Panel: 4〜8px
- Quest row: 4px前後
- Badge: pill可
- Modal: 8px以内
- 構造面で8pxを超える角丸は禁止する。
- pill形状はBadge・Status以外へ使わない。

## 9. Motion

- hover: 120ms
- パネル状態変更: 180ms
- Bottom Sheet: 220ms
- easingは短いease-outを基本にする。
- bounceや過度なscaleは使わない。
- Retroテーマだけ既存のsteps系演出を許可する。
- `prefers-reduced-motion`またはモーションOFF時は移動、点滅、拡縮を停止する。
- 音やモーションが使えない場合も、テキスト・色・状態変化だけで意味が伝わるようにする。

## 10. Accessibility and localization

- 9言語の最長主要ラベルを基準に幅を決める。
- Quest本文とユーザー入力は翻訳せず、UIラベル・状態・エラー・ARIA名を翻訳する。
- ロシア語・ドイツ語・中国語・韓国語で折り返しと行間を確認する。
- スクロール領域には`role="region"`と説明的な`aria-label`を付ける。
- キーボード操作、フォーカス表示、Reduced Motionを維持する。
- 色だけでHuman、Agent、成功、失敗を区別しない。

## 11. Do / Don't

### Do

- 作業状態を最優先にする。
- Human、Agent、Astraを視覚的に分離する。
- RPG表現を報酬、状態、Battleへ集中させる。
- 既存の3テーマとダークモードを尊重する。
- 長い翻訳後の幅を基準にする。
- 説明的なARIAラベルを付ける。
- 1つの画面に明確な主操作を置く。

### Don't

- グラデーションを勝手に追加しない。
- ガラスモーフィズムを使わない。
- すべてを浮遊カードにしない。
- 装飾的な光る境界線を作らない。
- UIアイコンへ絵文字を使わない。
- 新しいアクセント色を増やさない。
- RPG要素をファンタジー装飾へ変換しない。
- アプリ内にマーケティング用Heroレイアウトを持ち込まない。
- すべての情報をカードで囲まない。
- AI SaaSテンプレートへ戻さない。

## 12. Change rules and references

- 視覚、コンポーネント、レイアウト、モーションを変更する場合はこの文書を先に更新する。
- `/next/`固有の実験は[`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md)へ記録する。
- ドメイン、API、MCP、認証、リリースの変更は[`PROJECT_SPEC.md`](PROJECT_SPEC.md)を先に更新する。
- 現行版とNext版の昇格は自動化せず、実アカウント・PC・Pixel 9・9言語・MCP・アクセシビリティの明示受入を通す。

## 13. English glossary

| 日本語 | English |
| --- | --- |
| 現行版 | current surface |
| Next版 | experimental beta surface |
| 相棒 | companion character |
| 担当Agent | assigned agent |
| 保管 | archive |
| 作戦盤 | operations board |
| 視覚設計正本 | visual source of truth |

## 14. Marketing Landing Page `/lp/`

`/lp/`と`/lp/en/`はGuilduoの公開マーケティングSurfaceであり、現行UI `/`、公開β `/next/`とは責務を分離する。LP固有の情報設計と公式コピーは[`LPDESIGN.md`](LPDESIGN.md)、実Product UIの視覚正本は[`NEWDESIGNv2.md`](NEWDESIGNv2.md)とする。

- LPはWorkbench型とし、実在するCommand、Evidence、Party、BattleのキャプチャをProduct Proofとして使う。
- Heroの固有表現は`Quest Loom × Human/Agent Relay`とし、HTML、CSS、SVGで構成する。偽のProduct UI、ブラウザchrome、WebGL、常時動く装飾は使わない。
- Darkを初期presentationとし、LightとSystemを選択可能にする。HumanはGreen、AgentはBlue、ReviewはGoldの意味色を維持する。
- HeroからProduct Proofへの変化だけを主要motionとする。その他は短い状態遷移に留め、Reduced Motionでは静止した方向図へ置き換える。
- 日本語と英語を別HTMLとして提供し、情報階層を共有する。CTA、言語、テーマ、比較表は320px幅でも横overflowを作らない。
- LP用tokenとAssetはLPからだけ読み込み、既存の`/`、`/next/`、`/interaction-lab/`へ適用しない。
