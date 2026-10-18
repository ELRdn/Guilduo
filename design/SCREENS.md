# Guilduo Screen Blueprints

## Public Documentation (2026-10-05)

`/docs/`と`/docs/en/`は公開静的Docs。Desktopは240px程度の分類ナビ、中央本文、ページ内目次。1280px未満では目次を本文前へ移し、900px以下ではナビをdetailsへ畳む。ヘッダーはブランド・言語切替・テーマ・正式Web Appへの導線を持つ。記事はパンくず、分類、タイトル、要旨、手順、出典、関連記事の順。Overviewは最初のQuest、MCP接続、人への依頼へ導く。検索結果は本文を隠さず表示し、無効・該当なし・失敗でも分類ナビから読める。

> **English summary:** These blueprints define screen composition, information order, scroll ownership, responsive behavior, and non-data-specific states. Golden References validate rhythm and proportions; this document defines the structure that must survive different content and languages.

最終更新: 2026-08-18  
親文書: [`../DESIGN.md`](../DESIGN.md)  
Next差分: [`../interaction-lab/DESIGN.md`](../interaction-lab/DESIGN.md)

## 共通Shell

Desktopでは左ナビ、上部ステータス、中央Workspace、必要な右サイドバーを使う。Mobileでは左ナビを下部ナビへ置き換え、ページ全体をスクロールする。

```text
Desktop
┌──────────────┬────────────────────────────────────────────┐
│ left rail    │ top status / page heading                 │
│              ├───────────────────────────┬────────────────┤
│              │ primary workspace          │ context rail   │
│              │                            │                │
└──────────────┴───────────────────────────┴────────────────┘

Mobile
┌───────────────────────────────────────────────────────────┐
│ top status / page heading                                 │
├───────────────────────────────────────────────────────────┤
│ primary workspace                                         │
│                                                           │
├───────────────────────────────────────────────────────────┤
│ bottom navigation                                         │
└───────────────────────────────────────────────────────────┘
```

## Productivity workspace (2026-10-12)

Quests: heading, Board/List/Gantt selector, common search/status filters, primary workspace and shared detail rail. Calendar: heading, month/week/day selector, period/today controls, independent search, calendar and undated list. Notes: heading, note list, title/body/Quest editor, save/archive/restore. Mobile recomposes calendar and notes without page-wide horizontal scrolling. The shell owns the shared timer and reserves its height above mobile navigation and screen actions. Unsaved Notes navigation opens a native modal save/discard/cancel guard.

Quest creation has one entry point per surface: the desktop operation bar, the mobile Home header, and the mobile Quests sticky action. The shared timer renders only when a storage port exists. Quest detail offers "Change assignee", opening the common editor on the assignee field. An empty month view states it is empty and offers week view.

All for ADHD (prototype, `/interaction-lab/all-for-adhd/`): sticky header with brand, one capture field (Enter to add, optional "今日やる"), and tabs 今/予定/やること/設定; on ≤760px the tabs move to a fixed bottom bar. One 720px reading column, except 予定 (1120px: inbox column left of the day on ≥1100px, below it on phones). 今 shows a single focus card (title, next step, estimate chips or elapsed ring, one primary action) and a collapsed "このあと". 予定 shows a Monday-first week strip with per-day dots, then the selected day: remaining count and time, "いつでも" items, and a timeline of timed items with the current time and free gaps; inbox and "日付を見直す" items have a ＋ to place them on that day. A 日/週 toggle switches to a week grid: weekday header, an "anytime" row, an hourly axis with cards sized by duration (overlaps use up to two lanes; the rest fold into a "+N件" button that opens that day) and the current-time line; the grid scrolls horizontally inside its own region on phones, and the inbox moves below it. Tapping a title opens the detail sheet (bottom sheet on phones). A running task's bar and week card fill top-down with elapsed time; it also shows a dock with ring, pause and complete on every screen except 今. ギルド shows one decision card at a time (review request or Agent "done" report: one line of what to check, reason/criteria/report folded under "詳しく", and a required "checked" box before answering), then Agent work grouped by handoff state, then members (self, people, Agents); the tab carries the pending count. The detail sheet leads with the title as a heading and the next step under it; date, time (start and end; the end is stored as the estimate), estimate (5 min–2 h chips plus free hours/minutes up to 24 h), due date and memo are chips that open one inline editor at a time. Its 担当 section is a vertical relay of nodes (you → Agents with a short ask each → your final check), with a "確認を挟む / そのまま次へ" toggle on each link; Agents are added from a palette by tap or drag, reordered by drag (long-press on touch, Alt+↑/↓ by keyboard), and a sentence states what saving will do. Multi-Agent relays run in the demo only; with a real account the chain holds one Agent. やること groups decisions, today, review, inbox, later and Agent work.

Calendar Day/Week presents a shared hourly axis, separate all-day items, today marker and quarter-hour range preview. Empty-axis mouse drag or touch long press opens a range form; record uses native TimeEntry save, schedule uses the common Quest editor prefilled with planned date/time and estimate. Keyboard selection is equivalent. Common Quest editing exposes planned date/time and on-date/until-due mode independently of deadline.

## Today / 今日の作戦

### Desktop

```text
┌──────────────┬───────────────────────────────────┬─────────────┐
│ left rail    │ status + heading + filters        │ party       │
│              ├───────────────────────────────────┤ boss        │
│              │ quest list (ONLY SCROLL REGION)   │ selected    │
│              │ marker selection code title       │ quest       │
│              │ progress assignee handoff due    │             │
└──────────────┴───────────────────────────────────┴─────────────┘
```

- 上部ステータス、左ナビ、右サイドバーは固定する。
- 中央Quest一覧だけ縦スクロールする。
- 右サイドバーは内容が溢れた場合だけ内部スクロールする。
- Quest番号、選択、階層マーカー、タイトルを別グリッド列へ置く。
- Shiftクリック、Ctrl／⌘クリック、チェックボックスを同じ選択状態へ接続する。

### Mobile

- ページ全体をスクロールする。
- Quest詳細は下部Sheetを標準、Popoverを設定で選択できる。
- 下部ナビに隠れない末尾余白を確保する。
- 補助列はタイトル下へ移し、横スクロールを作らない。

### 状態

`loading`はスケルトン、`stale`は前回データ＋警告、`error`はQuest一覧を保持したまま再接続を表示する。空状態では最初のQuest追加を主操作にする。

## Quest Tree

```text
┌──────────────┬───────────────────────────────────┬─────────────┐
│ left rail    │ title + archive/filter controls   │ tree summary │
│              ├───────────────────────────────────┤ handoff      │
│              │ root Quest                         │             │
│              │   ├ child Quest                    │             │
│              │   └ child Quest                    │             │
└──────────────┴───────────────────────────────────┴─────────────┘
```

- 親Quest、子Quest、完了数、全体数、進捗率を同じ視線で示す。
- 最大8階層。インデント幅はMobileで制限する。
- 親Quest完了で子Questを自動完了しない。
- 保管済みQuestは表示切り替えで明示的に含める。
- 開閉ボタンには子件数と状態を含むARIAラベルを付ける。

## Battle

```text
┌──────────────┬───────────────────────────────────┬─────────────┐
│ left rail    │ battle heading + boss status      │ tactical     │
│              ├───────────────────────────────────┤ readout      │
│              │ stage: boss       player          │ MP queue      │
│              │ HP / Rage         HP / MP         │ battle log    │
│              ├───────────────────────────────────┤             │
│              │ task queue + command window       │             │
└──────────────┴───────────────────────────────────┴─────────────┘
```

- Stage、敵、キャラクター、HP、MPを最優先で見せる。
- Task完了によるMP獲得とBattleコマンドを別操作として示す。
- コマンドには名称、MPコスト、実行可能性、結果を表示する。
- メモなしQuestもMP変換対象として表示する。
- MobileではStage、Task queue、Commandsの順に縦積みする。

## Party

```text
┌──────────────┬────────────────────────────────────────────┐
│ left rail    │ party heading + member count               │
│              ├──────────────────────┬─────────────────────┤
│              │ human / Astra        │ activity / review   │
│              │ agent members        │ current Quest       │
│              ├──────────────────────┴─────────────────────┤
│              │ assignment and handoff workspace            │
└──────────────┴────────────────────────────────────────────┘
```

- ユーザー本人、Astra、Agentを別のidentity labelで示す。
- Partyは作戦上の所属であり、Profileの公開情報とは別に扱う。
- メンバー、現在の担当Quest、Handoff状態、直近活動を表示する。
- 空白が残る場合はActivity、レビュー、担当操作を優先して配置する。
- サインイン中のユーザー本人は、Party未作成でもHumanとして表示する。
- Agentの新規登録はParty見出しとAgent空状態から開始でき、選択中のAgentは詳細レールから編集できる。
- Agent IDは登録後に変更せず、更新競合は`updatedAt`で検知する。

## Integrations / 連携

```text
┌──────────────┬───────────────────────────────────┬─────────────┐
│ left rail    │ connection heading + sync state    │ sync log     │
│              ├──────────────────┬────────────────┤ errors       │
│              │ provider list    │ selected       │ reconnect    │
│              │ Calendar / Tasks │ resource       │             │
│              │ Notion / Toggl  │ preview + sync  │             │
└──────────────┴──────────────────┴────────────────┴─────────────┘
```

- 接続状態、対象サービス、対象リソース、最終同期、エラーを明示する。
- 初回同期はPreviewを経由し、削除を自動反映しない。
- OAuth未設定は「管理者設定待ち」と表示し、モックを実データと見せない。
- MobileではProvider、接続状態、主操作、ログの順に縦積みする。

## Profile

```text
┌──────────────┬────────────────────────────────────────────┐
│ left rail    │ profile heading + privacy state             │
│              ├──────────────────────┬─────────────────────┤
│              │ account identity     │ Astra companion     │
│              │ display name/handle  │ avatar/role/MBTI     │
│              ├──────────────────────┴─────────────────────┤
│              │ local settings and private visibility        │
└──────────────┴────────────────────────────────────────────┘
```

- アカウント名はユーザー本人、Astraは操作するキャラクターとして分ける。
- プロフィールの公開範囲は非公開を初期値にする。
- アバター画像の用途を本人用・Astra用で混同しない。

## Settings

```text
┌──────────────┬────────────────────────────────────────────┐
│ left rail    │ settings heading                           │
│              ├──────────────────┬─────────────────────────┤
│              │ appearance       │ theme / light-dark      │
│              │ accessibility    │ type scale / density    │
│              │ sound / motion   │ language / telemetry    │
│              ├──────────────────┴─────────────────────────┤
│              │ Agent Registry / MCP clients / account      │
└──────────────┴────────────────────────────────────────────┘
```

- テーマ、表示密度、文字サイズ、音、モーション、言語を分離する。
- Agent登録、MCPクライアント紐付け、権限、最終利用を表示する。
- Accountは本人のAvatar、表示名、`@handle`、Appwrite Auth由来のemail（読み取り専用）、bioを表示し、プロフィール未作成時は保存フォームを初期状態にする。
- AvatarはUpload / Change / Remove、保存中の進捗、成功・通信エラーを表示する。プロフィール画像はprivateな認証済み取得とversion付きcacheで扱う。
- 変更中は保存状態と同期状態を明示する。
- Reduced Motion、キーボード、9言語の最長ラベルを基準にする。

## 共通の失敗・空・読み込み状態

すべての画面で次を用意する。

| 状態 | 表示 | 主操作 |
| --- | --- | --- |
| Loading | スケルトン、既存データがあれば保持 | 待機、キャンセル |
| Empty | 何が空か、次に何をするか | 作成・接続・追加 |
| Stale | 前回データと古さ | 再接続 |
| Error | 失敗したパネルだけを明示 | 再試行・詳細 |
| Permission | 権限不足と必要な権限 | 設定・再認証 |

Golden Referenceはこの構造、情報密度、比率、視覚リズムを検証する。日付、Quest本文、ユーザー名、件数は固定しない。

## Public Documentation (2026-10-05)

`/docs/`と`/docs/en/`は公開静的Docs。Desktopは240px程度の分類ナビ、中央本文、ページ内目次。1280px未満では目次を本文前へ移し、900px以下ではナビをdetailsへ畳む。ヘッダーはブランド・言語切替・テーマ・正式Web Appへの導線を持つ。記事はパンくず、分類、タイトル、要旨、手順、出典、関連記事の順。Overviewは最初のQuest、MCP接続、人への依頼へ導く。検索結果は本文を隠さず表示し、無効・該当なし・失敗でも分類ナビから読める。

## Public Solutions (2026-10-06)

`/solutions/`配下の2テーマ×日英。headerは公式LP、Docs、相互言語への通常リンク。mainはH1・概要・開始CTA、課題、必要環境、fixture画面と日付付き検証記録、短い試用手順、制限、技術詳細、出典の順。footerで関連テーマ・法的文書・任意の匿名計測設定へ移動できる。Mobileは単一カラム、長いURLは折り返し、table/codeの横スクロールは領域内だけ。例やfixtureは実績と混同しない。
