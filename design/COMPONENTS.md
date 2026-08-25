# QuestForge Component Specification

> **English summary:** This document describes the reusable QuestForge components below the visual constitution. Each component has a stable information order, responsive rule, accessible name, and forbidden decoration. Shared color and motion values come from `../DESIGN.md` and `TOKENS.json`.

最終更新: 2026-08-18  
親文書: [`../DESIGN.md`](../DESIGN.md)  
技術仕様: [`../PROJECT_SPEC.md`](../PROJECT_SPEC.md)

## 共通ルール

- DOMの順序は、視覚順序と読み上げ順序を一致させる。
- 主要操作はテキスト、またはLucideアイコン＋説明的ラベルで示す。
- 4px〜8pxの角丸、1px境界線、控えめな面色を基本にする。
- 状態は色だけでなく、ラベル、形、`aria-*`属性で示す。
- 長文はタイトル・概要領域だけで折り返し、隣の列を押し出さない。
- Mobileでは補助列を下段へ移し、横スクロールを発生させない。
- Loading、Error、Disabled、Selectedを必ず設計する。
- 装飾的なglow、過度なscale、ランダムなgradient、入れ子カードは禁止する。

## コンポーネント一覧

| Component | 役割・情報優先順位 | 構造・最小サイズ | 折り返し・Mobile | アクセシビリティ・禁止事項 |
| --- | --- | --- | --- | --- |
| `quest-row` | Questコード、タイトル、進捗、担当、Handoff、期限 | `row > marker > selection > code > content > progress > assignee > state > due`。Desktop 80px以上 | タイトルだけ2行まで。補助列は下段 | `role="listitem"`、選択は`aria-selected`。番号とタイトルを重ねない |
| `quest-row-selected` | 選択範囲の視認 | `quest-row`と同じ構造、Blue境界線 | モバイルでも選択状態を維持 | チェック状態を色だけに依存しない。光る枠は禁止 |
| `quest-tree-node` | 親子関係と進捗 | `node > toggle > marker > code > title > summary` | 最大8階層。インデントは幅を制限 | 開閉ボタンに子件数を含むラベル。インデントと番号を重ねない |
| `agent-badge` | AI担当、Provider、状態 | `badge > icon > name > state`。pill可 | Providerは省略表示可 | Blue系。Astraや本人の表示に使わない |
| `human-badge` | Firebaseユーザー本人 | `badge > avatar > name > role` | 名前を優先し、説明は省略可 | Green系。アカウント所有者であることをラベル化 |
| `astra-card` | 相棒キャラクターの見た目・役職 | `card > avatar > name > role > customization` | 画像は固定比率、説明は下段 | `img`に用途を含むalt。プロフィール本人と混ぜない |
| `party-member` | 作戦上の所属と担当Quest | `member > avatar > identity > assignment > state` | Activityを折りたたみ可能 | 人間・Astra・Agentの種類をテキスト表示。単なる画像一覧は禁止 |
| `handoff-badge` | `ready`、`working`、`blocked`、`review_required`、`accepted` | `badge > state > optional reason` | ブロック理由は詳細へ移動 | 状態名を読み上げる。点滅だけでレビュー待ちを表さない |
| `mp-gauge` | 現在MP、上限、Battle資源 | `label > value > track > fill` | 数値を常に表示 | Orange／Gold。`aria-valuenow`、`aria-valuemax`を付ける |
| `xp-bar` | 成長率と実値 | `label > percent > track > value` | Mobileは数値を優先 | Green系。割合と実値を別々に読み上げない |
| `reward-chip` | XP、MP、Gemなどの報酬 | `chip > icon > label > value` | 長い説明はTooltipへ | Orange／Gold。主要CTAや危険状態に流用しない |
| `battle-command` | 攻撃、スキル、防御、回復、Burst | `button > name > cost > hint` | 390pxでは2列または縦積み | MP不足時はdisabled理由を表示。巨大なゲームボタン禁止 |
| `sync-indicator` | 認証・同期・再接続 | `indicator > icon > state > time` | Mobileは短い状態名 | `checking`、`syncing`、`synced`、`stale`、`error`を明示 |
| `status-badge` | 完了、作業中、保管済みなど | `badge > label` | 翻訳後の最長幅を基準 | 色＋文字で表現。危険色を通常状態に使わない |
| `sidebar-item` | Surface移動 | `button > icon > label > optional count` | 1060px以下はアイコン中心 | `aria-current="page"`。アイコンだけで意味を隠さない |
| `bottom-sheet` | MobileのQuest詳細 | `dialog > handle > heading > content > actions` | 画面下から出し、一覧末尾に余白 | Escape・閉じる・フォーカス復帰。画面全体を覆い続けない |
| `dialog` | 編集・確認・接続プレビュー | `dialog > heading > body > primary > cancel` | 390pxで左右16px以内 | `role="dialog"`、`aria-labelledby`、明確なCancel |
| `input` | Quest・プロフィール入力 | `label > input > helper/error` | ラベルを先に置く | placeholderだけをラベルにしない。エラーを色だけにしない |
| `select` | テーマ、Agent、親Quest選択 | `label > select > helper/error` | 最長選択肢が収まる幅 | キーボード選択可能。選択状態を視覚だけで表さない |
| `checkbox` | Shift複数選択、一括操作 | `input[type=checkbox] + label` | タップ領域44px以上 | `aria-label`を具体化。選択件数を通知 |
| `tooltip` | 不明なアイコンの補足 | `trigger + tooltip` | Mobileは長押しまたは詳細へ | 主要操作をTooltipだけにしない。Escapeで閉じる |
| `toast` | 成功、警告、失敗の短い通知 | `status > icon > message > optional action` | 画面端からはみ出さない | `role="status"`または`alert`。自動消去前に読み上げ可能 |

## 状態マトリクス

すべての操作部品は次を持つ。

```text
default -> hover -> active -> focus-visible
                   |             |
                disabled       selected
                   |
                loading -> error
```

- `focus-visible`: 3px程度の明確なアウトライン。
- `disabled`: 操作不可の理由を表示し、色だけで無効化しない。
- `loading`: スケルトンまたは進行表示。既存データを不用意に消さない。
- `error`: 再試行・再接続など、次の操作を提示する。
- `selected`: 背景、境界線、ARIA状態を同時に更新する。

## 実装前チェック

1. 対象Surfaceの[`SCREENS.md`](SCREENS.md)で情報順序を確認する。
2. [`TOKENS.json`](TOKENS.json)から色・サイズ・モーションを取得する。
3. Assetを使う場合は[`ASSET_MANIFEST.md`](ASSET_MANIFEST.md)の許可Surfaceを確認する。
4. 9言語の最長ラベルと390px幅でレイアウトを確認する。
5. `prefers-reduced-motion`とキーボード操作を確認する。
