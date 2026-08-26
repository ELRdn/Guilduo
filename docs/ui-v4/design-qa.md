# QuestForge UI v4 Design QA

更新日: 2026-08-19

## 対象

- Root `/` のParty Formation Island（1440×900 Light）
- Next `/interaction-lab/` のIntegration Control Plane（1440×900 Light、およびfull-page）
- Next `/interaction-lab/` のQuest Dependency Graph（1440×900 Light）

## 視覚確認

- Root PartyはFormation／Members／Social & Invitationsの表示切替を既存Social Party管理と分離した。
- Formationは正規のHuman／Astraだけを表示し、Agent Registryが空のとき架空Agentを追加しない。AstraのHP・MP・Levelは既存Character／Battle stateから取得する。
- Integrationは実Adapter定義と`state.remoteIntegrations`からNetwork、Connection Table、Selected Adapter Inspectorを同じ選択Stateで描画する。公開βで未設定のProviderは準備中／Muted破線で表示する。
- Quest Graphは`parentQuestId`と`dependencyIds`から座標を再計算し、完了非表示、Status filter、collapse、zoom、pan、reset、一覧読み上げを持つ。
- Golden画像はアプリの背景、Asset、初期Stateとして参照していない。

## 実行した確認

| Check | 結果 |
| --- | --- |
| `npm run design:check` | passed |
| `npm run check` | passed |
| `npm test` | 115 passed |
| `npm run build` | passed |
| Playwright screenshot Root Party selector wait | passed |
| Playwright screenshot Next Integration selector wait | passed |
| Playwright screenshot Next Quest Tree selector wait | passed |
| 1440×900 Light capture | passed |
| Reduced motion CSS path | passed by static rule review; runtime strict matrix is Gate A後 |
| 9言語／Dark／125%／mobile strict fidelity | Gate A後 |

## P0確認

- React runtimeは対象Hostのdynamic importに分離され、初期HTMLはReact chunkを直接参照しない。
- `lucide-react`は導入していない。既存Lucide vanillaを維持した。
- Firebase、REST、MCP、Schema、既存Social Partyの保存契約は変更していない。
- Graph cycle warningは表示用に扱い、Domain dataを自動修正しない。
- build時の既存CommonJS warning（`questforge-core.ts`の`module`参照）は今回のIsland起因ではない。既存warningとしてGate報告へ残す。

## Gate Aの扱い

この文書のローカル実装QAは合格。Golden A／B／CそれぞれのWeb Chat Visual Reviewによる承認、90点スコア、Composition 22点、Signature UI 9点の判定は次のレビュー工程で実施する。

final result: passed
