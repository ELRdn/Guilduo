# QuestForge UI v4 Baseline Audit

更新日: 2026-08-19

## 目的

UI v4 のGolden A/B/Cを既存のQuestForgeへ安全に導入するため、現行の描画責務、正規データ源、Asset、コマンド境界、検証入口を記録する。この文書は実装中に確認した事実の記録であり、Golden画像の固定デモ値を製品仕様へ移植するための仕様書ではない。

## Surfaceと描画責務

| Surface | Entry | 現行責務 | v4での扱い |
| --- | --- | --- | --- |
| Current | `/` (`index.html` → `main.ts` → `app.ts`) | Firebase RTDBを正本とする既存画面群。PartyはSocial Party管理、Integrationsは既存Adapter一覧、Quest Treeは既存リスト | Party FormationだけReact Islandを追加。Social Party管理・既存Commandは保持 |
| Next | `/next/` (`interaction-lab/index.html` → `interaction-lab/app.ts`) | Firebase Auth/Worker RESTを利用する公開Beta系画面。Party、Integrations、Quest Treeの実験UI | Golden B/CをReact Island化。既存のデータ取得・選択状態・Commandを維持 |
| Interaction Lab | `/interaction-lab/` | 開発用Next入力 | build後は`/next/`へ配置される既存構成を維持 |

## Golden入力と現行キャプチャの対応

Golden画像は視覚比較専用であり、アプリ内背景、実データ、初期State、接続済み状態として使用しない。

| Golden | 参照入力 | 現行検証キャプチャ | 実装対象 |
| --- | --- | --- | --- |
| A | `questforge-imagegen-react-v3/questforge-imagegen-react-v3/docs/reference/current-party.png` | `design/reference/party-desktop.png` | Current Party Formation Island |
| B | `questforge-imagegen-react-v3/questforge-imagegen-react-v3/docs/reference/next-integrations.png` | `design/reference/integrations-desktop.png` | Next Integration Control Plane Island |
| C | `questforge-imagegen-react-v3/questforge-imagegen-react-v3/docs/reference/next-quest-tree.png` | `design/reference/quest-tree-desktop.png` | Next Quest Dependency Graph Island |

## 正本と境界

### Current

- `app.ts`の`renderParty()`は`gatewayRuntime.profile`と`gatewayRuntime.party`を読み、プロフィール、友達、既存Social Partyの作成・招待・退出・削除を描画する。
- Social Partyの保存形は`worker/src/social-store.ts`のParty契約であり、Leader変更、Formation、Benchを表す新しい永続フィールドは存在しない。
- `app.ts`の`renderIntegrationHub()`は既存のIntegration Adapterと同期状態を使う。Providerの接続状態をGolden画像から補完しない。
- `app.ts`の`renderQuestTree()`は既存Questデータと既存の選択・Command経路を使う。

### Next

- `interaction-lab/app.ts`の`activePartyMembers()`、`renderParty()`が、Playerと登録済みAgentを表示用に集約する。
- `state.remoteIntegrations`と`state.integration`がIntegration Control Planeの接続状態と選択状態の入力になる。公開BetaでOAuthが停止中のProviderはConnectedとして描画しない。
- `state.quests`の`raw.parentQuestId`と`raw.dependencyIds`をGraph ViewModelへ正規化する。座標は保存せず、表示時に決定的に算出する。

## React Island契約

実装する共有契約は`ui/islands/types.ts`の`IslandBridge<TViewModel, TActions>`。Reactは正規化済みViewModelを受け取り、イベントは既存Commandへ返す。React内部にQuest、Party、Handoff、同期状態の正本を持たせない。

```text
Existing App
  -> normalize()
  -> ViewModel
  -> React Island
  -> action callback
  -> Existing command/state
  -> new ViewModel
```

## Assetとアイコン

- 許可Assetは`design/ASSET_MANIFEST.md`を正本とする。
- Lucideの既存vanilla描画を維持し、`lucide-react`や別アイコン体系は追加しない。
- Golden画像自体はAssetとして参照せず、画面の背景にも利用しない。

## 検証入口

- Design契約: `npm run design:check`
- TypeScriptと契約: `npm run check`
- テスト: `npm test`
- Production bundle: `npm run build`
- ブラウザ検証: `scripts/with_server.py`経由のPlaywright検証。対象は1440×900 LightをStrict、その他のサイズ・Dark・125%をGate A前のSmokeとする。

## Bundle監査

React runtimeは対象Hostのdynamic importからのみ読み込む。導入前後のgzipサイズと、非対象のCurrent画面でReact chunkが読まれていないことを下表へ記録する。

| 状態 | gzip JS | React chunk | 確認 |
| --- | ---: | --- | --- |
| 導入前 | 未取得 | なし | React導入前の本番build gzip値はこの作業開始時に保存されていなかった |
| Golden Island導入後 | Current entry `app-VO9P908k.js`: 47.58 kB gzip / Next entry `next-BuB8eGJ0.js`: 38.00 kB gzip | `PartyFormation`: 1.96 kB、`IntegrationControlPlane`: 2.19 kB、`QuestDependencyGraph`: 2.82 kB gzip。共有React runtimeはdynamic import先の`jsx-runtime-guNVWUkq.js`: 59.73 kB gzip | `dist/index.html`と`dist/next/index.html`にReact chunkの直接参照なし。各Host表示時にdynamic importする構成を実キャプチャで確認 |

初期entryの導入前値がないため、増加量は断定しない。Gate Aではこの導入後値をBaselineとして採用し、Performance Budgetと比較する。React runtimeのサイズは初期画面へ直列化せず、対象Hostの表示時だけ読み込む。

## 未確定・実装時に要確認

- Current側のAgent Registryは既存Gateway Runtimeに正規データ源がないため、登録済みAgentが存在しない場合は空状態を表示する。Golden画像のAgent名・HP/MP・接続状態は輸入しない。
- HumanのHP/MP/Levelは正規データが取得できる項目だけを表示する。存在しない場合はメトリクスを省略する。
- Quest依存循環はドメインを自動修正せず、表示用に警告線として扱う。
