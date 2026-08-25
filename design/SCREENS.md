# QuestForge Screen Blueprints

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
