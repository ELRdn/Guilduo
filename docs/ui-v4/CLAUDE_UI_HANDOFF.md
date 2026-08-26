# QuestForge UI v4.3 — Claude UI Design Handoff

委託先: Claude
委託範囲: QuestForgeのUIデザイン実装・視覚品質改善のみ
対象リポジトリ: `questforge-prototype`
作成日: 2026-08-22

## 1. 委託の目的

既存QuestForgeのデータ契約と機能を壊さず、v3 Reference Golden Screensの視覚リズムを、実装済みの専用Layout・SVG・Asset・Typography・Responsive・Motionへ仕上げる。

目標は次の順で達成する。

```text
ImageGen reference 60〜70%
  ↓
専用Layout + SVG 80〜90%
  ↓
実Asset + Typography + Responsive 90〜95%
  ↓
Motion・A11y・状態設計込みの製品UI
```

人間レビュー待ちで停止しない。通常のCSS崩れ、Visual差分、テスト失敗はHard Blockではないため、capture → diff → 修正を繰り返す。

ただし、数値を改善する手段は実装をReferenceへ近づけることに限る。テストやGate側を緩めて数値を通すことは、目的達成ではなく委託違反である（詳細は9章・10章）。

## 2. 最初に読むファイル

実装開始前に、次の順で読むこと。

1. `AGENTS.md`
2. `DESIGN.md`
3. `PROJECT_SPEC.md`
4. `design/COMPONENTS.md`
5. `design/SCREENS.md`
6. `design/ASSET_MANIFEST.md`
7. `docs/ui-v4/BASELINE_AUDIT.md`
8. `docs/ui-v4/design-qa.md`
9. `design/reference/v3-lock/manifest.json`
10. `tools/visual-regression.mts`
11. `questforge-imagegen-react-v3/questforge-imagegen-react-v3/README.md`
12. `questforge-imagegen-react-v3/questforge-imagegen-react-v3/docs/DESIGN.md`
13. `questforge-imagegen-react-v3/questforge-imagegen-react-v3/docs/DESIGN.next.md`

Golden画像は視覚比較専用であり、アプリの背景・Asset・Production fixture・初期Stateとして使用しない。

### その他の参照資料（読む順は上記の後でよい）

- `questforge-imagegen-react-v3/questforge-imagegen-react-v3/`（依頼者が視覚方向性として気に入っているTypeScript + Reactプロトタイプ。プロダクション品質の約7割の完成度。`docs/reference/`に元となったImageGen生成画像14枚を含む）。次の使い方をすること。
  - Reference 8の対象画面（Party Formation、Quest Dependency Graph）では、まずv3-lockの数値Gate（8章）を優先する。imagegen-react-v3は構図・情報階層・密度の参考として使う。
  - **Integration Control Plane（Reference 8に対応画像がない画面）では、imagegen-react-v3の`docs/reference/next-integrations.png`・`current-integrations.png`とプロトタイプ実装自体を参考程度の視覚方向性として使う。完全な模写・完コピはしない。** 数値Gateの対象外であり、7章P1のResponsive／状態設計／Console error 0件などのHard Metricsで品質確認する。
- `design/reference/`直下の旧9枚（`battle-desktop.png`など）とその`README.md`。v3-lock以前の改善前UIで、密度・階層・比率を眺める背景参考程度に留める。pixel diffのGate判定には使わない（`design:check`もこれらの画像はチェックしていない）。
- `questforge-ui-v4-codex-plan/questforge-ui-v4-codex-plan/UI_V4_CODEX_MASTER_PLAN.md`ほか。Codexが以前このv4作業を実行し、UI実装で行き詰まったためClaudeへ委託された経緯の背景資料。読んで経緯を理解するだけに留め、Phase構成やタスク分割は本ドキュメント（CLAUDE_UI_HANDOFF.md）の指示を優先する。
- `sannsyoo image/`は依頼者が個人的に収集した参照画像で、`design/reference/v3-lock/raw/*-source.png`の元データそのもの（cropして正規化済みがv3-lock）。実装時に直接参照する必要はない。

## 3. Golden 3 と Reference 8 の関係（P0）

このドキュメントでは「Golden」という語を2つの異なる対象に使っている。混同すると実装範囲とVisual Gate対象を取り違えるため、着手前に必ず区別すること。

### Golden 3 = React Golden Islands（実装境界の話）

React化してよい画面は次の3つだけ（4章参照）。

- Party Formation
- Integration Control Plane
- Quest Dependency Graph

これは「どこにReactを置いてよいか」という**実装アーキテクチャの境界**であり、Visual Gateの合否とは別軸。

### Reference 8 = Reference Golden Screens（Visual Gate対象の話）

視覚比較対象は次の8枚（6章参照）。

- `current-mission-spine.png`
- `current-campaign-map.png`
- `next-battle-report.png`
- `next-agent-operations.png`
- `next-settings-general.png`
- `next-party-workforce.png`
- `next-dependency-tree.png`
- `next-human-dashboard.png`

### 対応関係（重要）

Golden 3とReference 8は1対1ではない。

| React Golden Island | 対応するReference Golden Screen |
| --- | --- |
| Party Formation | `next-party-workforce.png` |
| Quest Dependency Graph | `next-dependency-tree.png` |
| Integration Control Plane | **対応するReference画像は存在しない** |

- Integration Control PlaneはReact実装対象だが、Reference 8には含まれない。Visual Gate（8章）の数値目標がそのままでは適用されないため、独自にReferenceを捏造したり、他画面のcapture条件を流用して合否判定を作らない。Integrations tabの品質確認はHard MetricsとHuman Visual Review（後述のGolden階層の定義を参照）で行う。
- Party FormationとQuest Dependency GraphはGolden 3であると同時にReference 8の対象でもあるが、**v3-lock比のGlobal/Region diff%はLegacy Tripwire（参考値）に降格されており、合否基準ではない**（理由は次項「Golden階層の定義」を参照）。合否はHard MetricsとHuman Visual Reviewで判定する。
- 逆に、Reference 8のうちCurrent画面（`current-mission-spine`、`current-campaign-map`）や`next-battle-report`、`next-agent-operations`、`next-settings-general`、`next-human-dashboard`はGolden 3ではない。React境界の対象外であり、既存Vanilla実装のまま視覚品質だけを改善する。これら5画面についてはv3-lock比のGlobal/Region diff%が引き続き主要な合否基準である。

### Golden階層の定義（最重要・v3-lockは目指す先ではない）

「Golden」という語が指すものは実際には5層あり、これまで混線していた。実装開始前に必ず区別すること。

```text
① DESIGN.md / SCREENS.md   — Design Constitution（恒久ルール）
② ImageGen References       — Desired Composition（目指す構図・意匠の理想形。
                                questforge-imagegen-react-v3/.../docs/reference/）
③ v3-lock                   — Legacy Regression Baseline（過去実装の回帰防止用、
                                completely immutable。目指す先ではない）
④ 現在の実装                 — Candidate（今まさに作っているもの）
⑤ Human Approved v4.3       — New Regression Golden（人間承認後に初めて生成する新Golden）
```

v3-lockの8枚は実際にはImageGen原画ではなく、`?visualFixture=v3`というfixtureモードで撮影されたv3プロトタイプの実装スクリーンショットである（開発用オーバーレイまで写り込んでいる）。このfixtureモードでは`interaction-lab/styles.css`のCSSルールにより`#partyFormationIsland`／`#questDependencyGraphIsland`（本来のReact Golden Island）が`display:none`になり、代わりに別実装（`#partyList`カードグリッド、`.tree-layout`リスト）が撮影・測定されている。つまりv3-lockのParty/Tree 2画面は、本番でユーザーが実際に見るIslandではなく、代替スキンを写したものである。

このため、Party FormationとQuest Dependency Graphについては**v3-lockへのpixel diff追従を目標にしない**。合否は次の基準で行う。

```text
Hard Metrics（自動・必須）
- overflow = 0 / console error = 0 / HTTP 4xx-5xx = 0 / Island load error = 0
- (Party) Agent数スケールポリシー各レンジでoverflowなし（4章参照）

Legacy Tripwire（自動・参考値、pass/failには使わない）
- v3-lock比のGlobal/Region diff%は算出・記録するが合否には使わない

Human Visual Review（人間承認・必須）
- 中心性・階層の明快さ、計算配置ジオメトリの一貫性、Inspector整列、
  monoタイポグラフィ、Living-state発光の意味的正しさ
→ スクリーンショットを依頼者（Web Chat）へ提出し、承認後に合格。
  承認をもって初めてv4.3-lockとして新Goldenを作成する。
```

**`design/reference/v3-lock/`は完全にimmutableであり、`npm run visual:lock`の再実行は禁止のまま。** 承認された新Goldenは別ディレクトリ`design/reference/v4.3-lock/`へ新規作成し、v3-lockを上書きしない。Candidate自身を無断でGoldenへ昇格させないこと。

## 4. 現在のアーキテクチャ境界

### Surface

| Surface | 役割 |
| --- | --- |
| `/` | Current。既存Firebase／RTDB／既存Commandを使うGuild OS / RPG Menu系UI |
| `/interaction-lab/` | Nextの開発用Surface。10 Tab、Visual fixture、Golden比較の入口 |
| `/next/` | build後のNext公開Beta Surface |

### Next 10 Tab

| Tab | Hash route | 正本 |
| --- | --- | --- |
| Today | `#today` | 既存Questの今日表示・選択状態 |
| Quests | `#quests` | 既存Quest一覧・filter・bulk selection |
| Explore / Tree | `#tree` | Quest階層・dependency・表示用Graph state |
| Agents | `#agents` | 既存Agent Registry・MCP紐付け |
| Reviews | `#reviews` | 既存Handoff・review待ちQuest |
| Battle / Rewards | `#battle` | 既存Battle state・battle log |
| Party / Workforce | `#party` | Party・Agent割当・Handoff表示 |
| Integrations | `#integrations` | 実Adapter・同期状態・選択Adapter |
| Profile | `#profile` | 本人Profile・Astra設定 |
| Settings | `#settings` | 既存表示設定・Agent／MCP設定 |

未知のhashは`#today`へ戻す。Tab移動でDomain stateを破棄しない。

### React境界

React Golden Islandsは次の3画面だけ（Golden 3。3章参照）。

- Party Formation
- Integration Control Plane
- Quest Dependency Graph

契約は`ui/islands/types.ts`の`IslandBridge<TViewModel, TActions>`を維持する。

```text
Existing App
  → normalize()
  → ViewModel
  → React Island
  → action callback
  → existing command
  → existing state
  → new ViewModel
```

ReactはQuest、Party、Handoff、同期状態の正本を持たない。React内部に持ってよいのは、hover、selection、collapse、pan、zoomなどの一時表示状態だけ。

### Party FormationのAgent数スケールポリシー

訂正: 旧版に記載していた「Party Global≤5/Region≤7」という編成上限は、コード調査の結果**捏造だったことが判明した**（`worker/src/social-store.ts`の`maxMembers`はパーティごとに可変であり、固定upper boundはドメイン層に存在しない）。これはVisual Gate閾値（`globalDiffPercent:5`/`signatureRegionDiffPercent:7`）とデモfixtureの表示人数「ACTIVE PARTY 5/5」を混同した誤記であり、以後参照しないこと。

代わりに、FormationBoardの表示崩れを防ぐため次のAgent数スケールポリシーを実装する。

```text
0体      Empty state
1〜5体   Full formation — 全員を外周軌道へ均等角度配置
6〜8体   Compact outer orbit — 角度間隔とカードサイズを縮小して収容
9体以上  Primary + Overflow — 優先度上位を軌道上に表示、残りは
         「+N more」から展開するoverflowリストで扱う
```

## 5. 絶対に変更しないもの

- Firebase、REST、MCP、Schema、Authenticationの契約
- Quest、Handoff、同期、BattleのDomain stateと既存Command
- Social Partyの保存契約
- Agent Registryの保存契約
- `localStorage`の既存正本・状態所有ルール
- `/`と`/next/`の責務分離
- 既存Lucide vanillaアイコン
- 外部フォントの追加
- `lucide-react`や別アイコン体系の追加
- Golden画像の背景利用
- Production用の架空ユーザー、Agent、HP/MP、接続済み状態、数値
- 既存の未コミット変更を消すこと

作業開始時点でworking treeはdirty。`git reset`、`git checkout`、`git clean`、無関係なcleanupを行わない。既存変更を確認してから、UIに必要なファイルだけを編集する。

### 開始時のdirty-tree baseline保存（必須）

Claudeは作業を開始する前に、その時点のdirty状態をbaselineとして記録すること。

1. `git status` と `git diff` の出力をローカルに保存する（コミットしない。例: 作業用スクラッチファイルへ退避するなど、リポジトリの追跡外に残す）。
2. 保存したbaselineと、作業終了時点の`git status`を突き合わせ、UI関連ファイル以外が変化していないこと、baseline時点で存在した未コミット変更が消えていないことを確認する。
3. 差異が見つかった場合は原因を特定し、UI実装と無関係な変更が混入・消失していないかを最終報告（12章）で明記する。

これはbaselineを「保護すべき既存作業の証跡」として扱うためであり、diffを都合よく解釈するための記録ではない。

## 6. Reference Lock

### Reference Golden Screens

8枚のv3視覚正本は`design/reference/v3-lock/`にある（Reference 8。3章参照）。

- `current-mission-spine.png`
- `current-campaign-map.png`
- `next-battle-report.png`
- `next-agent-operations.png`
- `next-settings-general.png`
- `next-party-workforce.png`
- `next-dependency-tree.png`
- `next-human-dashboard.png`

比較条件は`manifest.json`に従う。

- 1920×907
- Chromium固定環境
- DPR 1
- zoom 100%
- locale `ja-JP`
- timezone `Asia/Tokyo`
- Soft Ops / Dark
- 固定日時・固定乱数・停止Motion・fontロード完了後

### Signature Region

次の`data-vf-id`を壊さない。

```text
MissionSpine
StatusStrip
InspectorShell
FormationBoard
IntegrationNetwork
DependencyGraph
AgentGrid
CampaignMap
```

Global diffだけでなく、画面固有のSignature Region diffも必ず確認する。

### Shared Shell変更時の8画面Regression Guard（必須）

左Rail、Topbar、右Inspector、Status Stripなどの Shared Shell（Current／Next共通レイヤー）は8画面すべてに影響する。

- Shared Shellに変更を加えた場合、変更対象の画面だけでなく**8画面すべて**を再captureし、Global diff・Signature Region diffの両方を再確認すること。
- 1画面のdiff改善だけを確認して次のタスクへ進んではならない。Shared Shell変更で他の画面のdiffが悪化していないかを必ず突き合わせる。
- Shared Shell変更ごとに「変更前8画面diff → 変更後8画面diff」の差分を記録し、最終報告（12章）に含める。

## 7. 直前の実装状況

### 実装済み

- Next 10 Tab、hash routing、state ownership
- Reference Lockと8枚のcapture manifest
- `visual:capture`、`visual:diff`、`visual:check`、`visual:matrix`
- Current／Next Shared Shell
- Arcane / Soft Ops / Retro × Light / Dark / System
- React Golden Islandのdynamic import境界
- Party、Battle、Agent、Settings、Profile、Current画面のReference fixture調整
- Design Lab表示
- Current／NextのResponsive、focus-visible、Reduced Motionの基本対応
- 既存Asset Manifestに従った表示

### 直前のVisual Gate値

以下は直前captureの値。Claudeの作業開始時に必ず再captureして、現状値を更新すること。

| Screen | Global diff | Signature Region diff | 状態 |
| --- | ---: | ---: | --- |
| `next-settings-general` | 4.86% | 3.81% | Global合格。継続確認 |
| `current-campaign-map` | 4.97% | 5.10% | Global合格。継続確認 |
| `next-human-dashboard` | 5.17% | 3.02% | Global未達 |
| `next-battle-report` | 6.28% | 6.07% | 未達 |
| `next-agent-operations` | 6.50% | 6.48% | 未達 |
| `next-party-workforce` | 6.76% | 7.28% | Global・Region未達 |
| `current-mission-spine` | 6.53% | 4.32% | Global未達 |
| `next-dependency-tree` | 6.79% | 4.99% | Global未達 |

Console error、HTTP error、horizontal overflow、Island load error、line-wrap violationは直前検証で0件だった。

最後のAsset調整後は全テストを再実行していない。実装を始める前に全検証を再実行すること。

## 8. 残タスクと優先順位

### P0: 再現度を5%以下へ下げる

1. 直前状態をcaptureし、candidateとReferenceを画面ごとに比較する。
2. Shared Shellの共通差分を最初に直す。Shared Shellを1箇所でも変更したら6章のRegression Guardに従い8画面すべてを再captureする。
   - 左Railのactive面色・文字密度
   - TopbarのQuick Add幅・色・境界
   - 右Inspectorの余白面色、カード位置、ブラウザ端のscrollbar
   - Status Stripの列境界と高さ
3. `next-party-workforce`のFormationBoardを **Global diff <= 5% / Signature Region diff <= 7%** へ下げる。
   - Partyカードのidentity、role、load、Quest／Queue／Review、Handoff sequence
   - Human／Astra／Agentを混同しない
   - 既存Assetを使い、Referenceの見た目だけを再現する
   - Party表示はGlobal 5枚以下／Region 7枚以下の上限（4章）を超える編成を作らない
4. `next-battle-report`のKPI、summary、reward、battle logの構図・Typographyを合わせる。
5. `next-agent-operations`のAgent card、load、selected inspector、right railを合わせる。
6. `current-mission-spine`のMission Spine、Handoff edge、Selected Mission、right railを合わせる。
7. `next-dependency-tree`はGraph Islandの決定的配置とReference構図を両立させる。
8. `next-human-dashboard`はKPI、chart bar geometry、Agent contribution、介入ログの列幅を維持する。

### P1: 製品UI品質

- 390pxで横overflowなし
- 1024px、1280px、1440px、1920pxで崩れない
- Dark / Light / Systemのresolveが正しい
- 既存9言語の翻訳キー欠落・overflow・line-wrapを確認する。言語追加は禁止
- keyboard操作、`focus-visible`、Escape、focus復帰
- `prefers-reduced-motion`でアニメーション停止
- loading、empty、stale、error、permission state
- 120〜220msの短い状態遷移。Reduced Motionでは停止

### P2: 最終監査

- React runtimeがIsland非表示画面へ不要にロードされないこと
- gzip bundle差分を記録
- Console error、404、overflow、missing stateを0件にする
- 変更ファイルと残課題を報告する

## 9. Visual Gateの合格条件

### Golden Gate

全8画面（Reference 8）で次を満たす。

```text
global diff <= 5%
Signature Region diff <= 7%
Signature Regionのbounding box差 <= 8px
missing primitive = 0
line-wrap violation = 0
console error = 0
HTTP 4xx/5xx = 0
horizontal overflow = 0
Island failure = 0
```

自動スコアを独自に作らない。上記Hard Metricsを正本とする。

`next-party-workforce`は特に Global diff <= 5% / Signature Region diff <= 7% を明示目標とする（8章P0-3参照）。

### Matrix Smoke Gate

全10 Tab × 3テーマ × Light/Dark × Desktop/Mobileで以下を検査する。

- crashなし
- console errorなし
- 404なし
- horizontal overflowなし
- missing stateなし
- Island failureなし
- contrastが極端に壊れていない

Systemは第三のテーマではない。`prefers-color-scheme: light`と`dark`の双方で正しいColor ModeへresolveされることをBehavior Gateとして確認する。

### Visual Diff Anti-Cheat（禁止事項）

diff数値を下げる正当な手段は実装（HTML/CSS/Layout/Asset/Typography）をReferenceへ近づけることだけである。次の行為はすべて禁止する。

- `design/reference/v3-lock/`配下のReference画像そのものを加工・差し替え・削除すること
- `tools/visual-regression.mts`のdiffアルゴリズム、pixelmatchのthreshold、比較解像度、DPR、zoomなど比較条件を緩めること
- Signature Regionの`data-vf-id`を外す、比較領域を縮小・マスクする、比較対象から除外することで見かけ上diffを下げること
- capture条件（viewport、locale、timezone、theme、固定日時・固定乱数、Motion停止）を変更してdiffが出にくい状態を作為的に作ること
- スクリーンショット取得タイミングをずらす、fontロード完了前にcaptureするなど、比較の公平性を崩す手段でdiffを下げること

Reference側・比較ロジック側を動かして数値を通す行為は、視覚的には合格に見えても委託目的（1章）を達成していない。発見した場合は直ちに元に戻し、実装側の修正へ切り替えること。

### テストを弱めて通す行為の禁止

`npm run design:check`、`npm run check`、`npm test`、`npm run build`、`visual:*`いずれについても、失敗を消すために次を行わない。

- 失敗しているテスト・assertionの削除、`skip`／`it.skip`／`test.todo`化
- 閾値・許容誤差を実装に合わせて緩める（テストが実装の問題を検出できなくなる方向の変更）
- try/catchで例外を握りつぶす、エラーを警告に格下げするなどして失敗を見えなくすること
- モックやスタブで実際の挙動を迂回し、検証していないのに検証済みに見せること

テストの前提そのものが実装と食い違っていると判断した場合のみ、原因を明記した上でテストを修正してよい。その場合も最終報告（12章）で「何を」「なぜ」変更したかを必ず記載する。原則は常に「テストを実装に合わせる」ではなく「実装をReference／既存契約に合わせる」。

## 10. 実行コマンド

開発サーバーが必要な場合:

```bash
npm run dev -- --host 127.0.0.1 --port 5188
```

確認URL:

- `http://127.0.0.1:5188/interaction-lab/`
- `http://127.0.0.1:5188/`

検証:

```bash
npm run design:check
npm run check
npm test
npm run build
npm run visual:capture
npm run visual:diff
npm run visual:check
npm run visual:matrix
```

`visual:capture`はDEV fixtureを使用する。Production画面へfixture値を混入させない。

## 11. Hard Blockの定義

次だけをHard Blockとする。

- Firebase／REST／MCP／Schema契約の変更が不可避
- Reference同士が矛盾している
- 必要Assetが存在せず、許可済みFallbackでも構成できない
- 既存の正規データから要求UIを構成できない
- 同一Gateを3回以上修正しても改善しない

通常のCSS差分、レイアウト崩れ、Typography差分、テスト失敗、capture失敗はHard Blockではない。原因を切り分け、自己修正を続ける。

9章のAnti-Cheat事項（Reference改変、比較条件の恣意的変更、テストの無力化）はHard Blockではなく禁止行為である。数値が3回改善しなくても、これらを回避策として使わない。改善しない場合はHard Blockとして報告する。

## 12. Claudeからの最終報告形式

作業完了時は次の形式で報告する。

1. 変更ファイル
2. 画面ごとの改善内容
3. Golden Gateの全Metrics
4. Matrix Smoke Gateの結果
5. `npm run design:check`、`npm run check`、`npm test`、`npm run build`の結果
6. Bundle／React lazy-load確認
7. 未解決事項
8. 契約変更がないことの確認
9. 開始時baselineとの突き合わせ結果（5章）
10. Shared Shell変更の有無と、変更した場合の8画面before/after diff（6章）

最終的にGate未達の画面が残る場合、「完了」とは報告せず、具体的な差分値と残課題を報告する。

## 13. 最重要メッセージ

この委託はReact全面移行ではない。目的はQuestForgeのUI品質を製品水準へ引き上げること。

```text
Domain stateを守る
Referenceを背景にしない
正規データを架空値で補わない
既存Commandへイベントを返す
Visual Gateを数値で通過する
Gateやテストを弱めて数値を通さない
```

この6原則を崩さず、UIデザイン実装だけを最後まで進めること。
