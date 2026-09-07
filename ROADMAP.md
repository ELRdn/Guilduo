# Guilduo 公開βロードマップ

最終更新: 2026-09-07

## 設計書の正本

- [`DESIGN.md`](DESIGN.md)：現行版`/`の視覚設計、UI操作、コンポーネント、レスポンシブ、アクセシビリティ
- [`PROJECT_SPEC.md`](PROJECT_SPEC.md)：共通アーキテクチャ、データ契約、ドメイン不変条件、認証、安全性、公開運用
- [`LPDESIGN.md`](LPDESIGN.md)：LPの合意済み体験・コピー・本体との境界
- [`docs/lp-product-followups.md`](docs/lp-product-followups.md)：LP制作で見つかった本体・Skillsの改善と完了条件
- [`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md)：`/next/`のUI実験、同期状態、レスポンシブ設計、昇格ゲート
- [`design/TOKENS.json`](design/TOKENS.json)：3テーマ×ライト／ダークの機械可読トークン
- [`design/COMPONENTS.md`](design/COMPONENTS.md)：共通部品の構造、状態、アクセシビリティ
- [`design/SCREENS.md`](design/SCREENS.md)：Today、Tree、Battle、Party、連携、Profile、SettingsのBlueprint
- [`design/ASSET_MANIFEST.md`](design/ASSET_MANIFEST.md)：画像・アイコン・役職素材の用途契約
- [`design/reference/README.md`](design/reference/README.md)：サニタイズ済みGolden Referenceの基準
- `DESIGN.md`が視覚設計、`PROJECT_SPEC.md`が技術仕様の正本であり、Next版は差分だけを管理する。現在の正式Web Appは`https://app.guilduo.com/`で、`/next/relay-forge/`はその内部デプロイ・互換pathである。昇格や正式リリースの判断は、実アカウント・PC・Pixel 9・9言語・MCP・アクセシビリティの明示受入を通す。
- DeepSeek Harness、OpenClaw、Hermesなどは外部Execution Planeとして扱い、GuilduoはRemote MCP、Skill、Agent Registry、Handoff、権限を提供する。Harnessの実接続コードやモデルAPIキーは公開βへ持ち込まない。

## 正式URLと現在の公開状態

新規ユーザーや接続手順へ載せるURLは、次の正式URLに統一する。内部path、generated domain、旧workers.dev URLは互換性・検証・rollback用であり、新規導線には使わない。

| 用途 | 正式URL | 状態 |
| --- | --- | --- |
| 公式サイト / LP | `https://guilduo.com/` | READY |
| 英語LP | `https://guilduo.com/lp/en/` | READY |
| Web App / Guilduo / Relay Forge | `https://app.guilduo.com/` | READY |
| MCP | `https://mcp.guilduo.com/mcp` | READY |
| Appwrite API | `https://api.guilduo.com/v1` | READY |
| `www` redirect | `https://www.guilduo.com/` → apex | WAITING FOR DNS |
| Documentation | `https://docs.guilduo.com/` | Reserved / Future |

URLの詳しい役割分担は[`docs/public-urls.md`](docs/public-urls.md)、host-based rewriteは[`docs/appwrite-site-routing.md`](docs/appwrite-site-routing.md)を参照する。

## TypeScript移行

- 公開β状態をローカルZIP、差分パッチ、GitHubの`backup/pre-typescript-20260815` branchと`backup-pre-typescript-20260815` tagへ退避済み
- 手書きアプリ、Worker、MCP、CLI、テストを`.ts`へ移行し、Vite・tsx・Wrangler型生成の基盤を追加
- `npm run typecheck`でWorker型生成、`wrangler types --check`、TypeScriptプロジェクト検査を実行
- TypeScript移行後の実運用ソースはstrict型チェック済み。共有型・境界検証・ブラウザ・Worker・CLI・テスト・バトル原型を`npm run typecheck`で継続検査する
- Firebase移行データを保全し、Schema 7、REST 2.7.0、MCP 51ツール、OpenAPI 52パスの互換を維持する

## 現在地

Guilduoは、**HumanとAI Agentが同じworkspaceで仕事をRelayするHuman × AI Work Platform**として公開βを運用する段階にある。

> AIを仲間に、最強のパーティーを。

人もAIも、依頼主。人もAIも、担当者。Guilduoは、その共同作戦を安全に進めるオープンな作戦盤である。

### 実装済み

- Human確認Quest、依頼主、外部確認とテキストFB、受信箱、Agent初回接続案内、成功時の反応を一括実装（2026-09-07、ローカル検証済み・本番未配備）。既存Agentリンク修正も統合し、Skillsを56ツール/9カテゴリに整理。[実装・受入記録](docs/human-relay-acceptance.md)

- LPv2.1のプチ体験とモーションを日英の公式LPへ反映（2026-09-06、`aa884c1`、PR #21）。LPv2/LPv2.1の比較ルートは維持。本体の協働機能の受入とは別に管理
- 公式サイト`guilduo.com/`、正式Web App`app.guilduo.com/`、英語LPを同じAppwrite Sites成果物へビルドし、rootをhost-based rewriteで分離
- Appwrite Authの復元、Worker経由のユーザー単位TablesDB同期、再接続、同期中スケルトン、書き込みロック
- TodayのPC・タブレット固定レイアウトと中央Quest欄の独立スクロール
- スマホのページスクロール、下部Quest詳細、ポップアップ詳細切替
- Questの完了・保管・復元、Shift範囲選択、Ctrl／⌘個別選択
- Agent Registry、MCPクライアント紐付け、Handoff、Astraと本人アカウントの分離
- 現在のソース: REST/MCP 2.7.0、Schema 7、MCP 56ツール、OpenAPI 60パス。新しいHuman確認API・UIは本番未配備
- /mcp の安定レーンと /mcp-next の検証レーン
- Guilduo Workflow Skill（legacy technical ID: questforge-workflows）、ローカルCLI、Codex Plugin/MCP App登録準備パッケージ
- 日本語、英語、スペイン語、ブラジルポルトガル語、フランス語、ドイツ語、韓国語、簡体字中国語、ロシア語
- Google Calendar、Google Tasks、Toggl、Notionの状態表示。Provider OAuthは公開βではEarly Accessとして停止
- 匿名計測の同意UI、許可イベント限定のクライアント送信、Worker `/telemetry` 受け口、D1保存、90日保持上限
- `0.6.0-beta.8`候補のリリース設定と、D1 → Appwrite Sites → Worker → Health Checkのタグ専用Workflow
- Unity Battle Labはペンディングのまま本体リリースから分離

## 検証結果

2026-09-07の本体改善は全344テストとブラウザ32シナリオが成功し、API生成・型・デザイン・ビルドも成功。HTTP Worker/MCPと本体UIの往復、9言語・3画面幅、エラーと再取得を確認した。関連12件へ反映し、実装9件を完了・保管。新機能の本番配備、実Codex/OpenClaw・物理Pixel 9受入、GitHub公開・X告知は未完了。[検証範囲](docs/human-relay-acceptance.md)

2026-09-06のLP公式化では、型・デザイン・ブランド・ビルドと全322テストが成功。公式URLでも日英切替、PC/スマホ、模擬体験完了、アニメーションの二周目以降と停止を確認した。この結果はLPの検証であり、実AgentによるAI→Human依頼・待機・再開の完了を意味しない。

2026-08-14時点のローカル検証（歴史的ベースライン）:

- npm run check: 成功
- npm test: 115/115 成功
- npm run build: 成功
- API契約生成: REST 2.7.0 / MCP 51ツールを確認
- Plugin validator: 成功
- 画面スクショ: 1440×900、1024×900、390×844、英語Battle／Party／Connections／Settingsを取得
- PC: 横スクロールなし。TodayのQuest欄は overflow-y: auto
- 中間幅: 右パネルは必要時だけ内部スクロール
- スマホ: ページ全体がスクロールし、Quest欄の独立スクロールは解除
- スマホ: 下部ナビとQuest詳細シートを確認
- 英語: 設定見出し、操作ボタン、同期状態、Agent接続導線を確認。Connectionsの固定日本語ラベルなし
- 操作回帰: Quest追加、Shift範囲選択、単発To Doの完了時保管、保管済み表示、復元を確認
- 翻訳回帰: 9言語で主要見出し・ボタン・保管ラベルと390pxの横スクロールなしを確認
- UI回帰: 翻訳適用時にナビゲーションのアイコンとラベルが消える問題を修正し、再撮影で確認
- 補助のPython Playwright検証スクリプトは環境にPython版Playwrightがないため未実行。代替として同じローカルサーバーをInteraction Labの実ブラウザで撮影・計測した

スクショはローカルの /screenshots/public-beta/ に保存している。スクショはGitへ含めない。

### 公開URLのデプロイ検証

2026-08-30時点で、URL正規化に関係するAppwrite Site、Cloudflare Worker、Appwrite API Custom Domainを確認済みである。

- `https://guilduo.com/`: LPとcanonical rootを確認
- `https://guilduo.com/lp/en/`: 英語LPを確認
- `https://app.guilduo.com/`: Relay Forgeとcanonical rootを確認
- `https://app.guilduo.com/next/relay-forge/`: compatibility pathとして維持
- `https://mcp.guilduo.com/mcp`: 未認証`401`とOAuth metadataを確認
- `https://api.guilduo.com/v1`: Appwrite APIへの到達を確認。認証なしでは`401`が正しい
- 旧workers.dev URL: OAuth metadata、未認証`401`、CORS互換を確認
- Googleログイン済みのAppwriteセッションを使う認証E2EとAgent再リンクは、実クライアントでの受入確認を残す

## 公開・リリースゲート

### P0: ユーザーによる実機受入

- PC ChromeでGoogleログイン後にページを更新し、Quest・キャラクター・Agent・MCP接続が復元されることを確認
- Pixel 9で同じアカウントへログインし、更新後に同じデータが表示されることを確認
- PCでQuestを編集・完了し、Pixel 9へ反映されることを確認
- Pixel 9で編集・完了し、PCへ反映されることを確認
- 接続失敗時に「再接続する」が表示され、前回データを保持することを確認
- 同期中に完了・編集・保管が無効になることを確認
- Agent登録、MCPクライアント紐付け、Quest割り当て、Handoffを実アカウントで確認

### 完了した公開基盤

- [x] Appwrite Siteの`app.guilduo.com/`、`guilduo.com/` routingを反映
- [x] `APPWRITE_ENDPOINT=https://api.guilduo.com/v1`へWorkerとWeb Appを移行
- [x] `APPWRITE_SITE_ENDPOINT`をSite管理API専用に分離
- [x] `mcp.guilduo.com/mcp`のOAuth metadata、未認証`401`、App Web AppからのCORSを確認
- [x] 旧workers.dev URLを互換・rollback面として維持
- [x] README、API/MCP手順、公開URLガイド、エージェント引き継ぎ文書を正式URLへ同期

### 残存ゲート

- [ ] `www.guilduo.com`のDNSとapex redirectを有効化する（WAITING FOR DNS）
- [ ] `docs.guilduo.com`をDocumentation公開時に構築する（Reserved / Future）
- [ ] OpenClaw等でGoogleログインからOAuth approve、localhost callback、Agent contextまで実地確認する
- [ ] OpenAI MCP Appの技術App ID、レビュー申請、公開導線を運用者が判断する
- [ ] GitHub Social Previewや外部表示の追加確認を行う
- [ ] 全受入完了後にのみ`v0.6.0-beta.8`タグとGitHub Releaseを作成する

## 次の改善

### LP制作から本体へ戻す改善（2026-09-06）

LPv2.1で合意した「人がAIへ任せ、AIが人へ確認を頼み、テキストFBで再開する」を次の本体改善の軸にする。既存の担当者選択・Agent Registry・Handoff・親子Questを土台とし、不足する依頼主の記録、独立したHuman確認Quest、受信・再開、Skillsの運用を補う。

Guilduoは依頼・進捗・FBをテキストでつなぐ。成果物の閲覧・実行・編集は外部環境で行う。Agentはユーザーが登録・接続した外部AIであり、割り当てだけで起動する機能や固定の公式人格を追加する計画ではない。公式コピー・パレット・アイコンは継承する。

| 計画ID | 優先度 | 実行単位 | 前提 |
| --- | --- | --- | --- |
| LP-R01 | P1 | 依頼主と担当者を区別し、確認Questとの関連を残す | なし |
| LP-R02 | P1 | AIから人への確認依頼とテキストFBの往復を本体で完結させる | LP-R01 |
| LP-R03 | P1 | 成果物確認を外部へ案内し、Guilduoには確認結果をテキストで戻す | LP-R02 |
| LP-R04 | P1 | AIから届いた人向けの依頼と確認待ちを見つけやすくする | LP-R02 |
| LP-R05 | P1 | AIが人へ頼む判断・待機・再開をWorkflow Skillに教える | LP-R01、LP-R02 |
| LP-R06 | P1 | 自分のAgentを登録・接続して最初の仕事を渡す導線を整える | なし |
| LP-R07 | P1 | 実際のMCPクライアントでHuman ⇄ Agentの往復を受け入れ検証する | LP-R03、LP-R04、LP-R05、LP-R06 |
| LP-R08 | P2 | 仕事の受け渡しと共同達成が伝わる本体の反応を加える | LP-R03、LP-R04 |

各項目の発見根拠、既存機能との差、完了条件、Guilduo登録IDは[本体改善計画](docs/lp-product-followups.md)で管理する。P1を次の本体改善、P2を操作体験の磨き込みとし、日付は未設定のバックログとする。LP-R01とLP-R06から着手し、LP-R07の実MCP受入まで完了した範囲だけを本体の標準動作と案内する。

- [x] LPの壁打ちと現行ソースから改善案を抽出し、依存関係・完了条件を定義
- [x] Guilduoへ親Questを登録: `quest-5e093615-e0ba-4713-b941-e24df707d618`
- [x] 子8件を依存関係つきで登録し、親子9件の本文・完了条件・登録IDを再取得して照合（2026-09-06、全件バックログ）
- [x] LP-R01〜LP-R06を本体・MCP・Skillsへ一括実装し、ローカルで検証
- [x] LP-R07のHTTP Worker/MCP・本体UI結合テストと実機受入手順を作成
- [ ] 新機能を配備し、LP-R07の実Codex/OpenClaw・Pixel 9受入を完了
- [x] LP-R08の短い反応とReduced Motion/設定OFFを実装・ローカル検証

既存タスク「MCPでAgentリンクできるように修正」「SkillsでMCPツールを分かりやすく整理」は関連として照合済み。2026-09-07の一括依頼で、リンク修正のソース統合と56ツール/9カテゴリの整理も実装・検証した。GitHub公開・X告知タスクは文案を準備し、公開と投稿は未実施。LPの成功を本体改善の完了へ読み替えない。同期・認証・公開受入の残存ゲートも維持する。

**LP-B01 / P0 — 保存容量の障害は復旧済み（2026-09-06）:** Appwriteの`stateJson`は既に`longtext`だったが、Workerと移行ツールに残る60,000文字制限が保存を拒否していた。旧制限を除去し、gzip・旧JSON読み込み・revision競合検知・トランザクションを維持して本番Workerへ反映。子8件の作成と親の案内更新に成功し、既存67件のQuest・162件の履歴・移行スナップショットなどの保持を照合した。データの削除やテーブル・権限の変更による回避は行っていない。[原因・修正・検証記録](docs/storage-capacity-fix.md)

### Design System強化

- MP／Reward／BattleをOrange・Gold、Agent／MCPをBlue、Human／成功をGreenへ統一する
- Lucide vanillaの機能アイコンへ統一し、アイコンライブラリの混在をなくす
- Golden Referenceを固定デモFixtureから再生成し、個人データを含めない
- Design token、Component、Screen、Asset Manifestの整合検査をCIへ追加する

スクショと実装確認で見つかった改善項目:

1. /next/には、ユーザー作成のQuest本文・Agent説明とは別に、一部の動的通知文が残っている。主要操作・状態・連携カードは9言語化済みだが、通知文までの完全翻訳は次のP1とする。
2. 1280×720では右サイドバーが内部スクロールするため、初見ユーザー向けにスクロール可能な視覚的サインを追加する。
3. 実アカウント受入では、認証復元中のスケルトンから同期済みへの遷移をPixel 9で確認する。
4. Agent台帳は接続済みクライアントがない場合の空状態を、接続手順付きの案内へさらに改善する。
   この項目はLP-R06の初回接続導線へ統合して進め、別の同内容タスクを増やさない。
5. 外部サービスはOAuthが再開されるまで、モックを実データと誤認しないEarly Access表示を維持する。
6. LCP、INP、CLSの匿名計測は同意制の実装済み。公開後に `TELEMETRY_ENDPOINT` と D1 migration 0006 を本番環境へ設定し、実測を開始する。
7. Unity、ネイティブAndroid/iOS、Agent自動実行、外部OAuth正式公開は公開βの範囲に戻さない。

## 公開後の順序

既存の運用・連携改善と並行し、プロダクト改善は上記LP-R01〜LP-R07の双方向Relayを優先する。外部OAuthの再開やAgent自動起動を、この流れの前提条件にはしない。

1. 同期エラー、MCP接続、初回Quest完了率を匿名同意制で監視
2. 9言語の長文・日付・複数形を実ユーザー環境で補正
3. Google Calendar読み取り、Google Tasks、Notion、Togglの順にEarly Accessを段階再開
4. OpenClaw、Hermes、Gemini CLI向けレシピを利用実績に合わせて更新
5. OpenAIレビュー後にMCP Appの登録IDと公開導線を確定
6. 90日間の利用者、初回Quest完了率、MCP接続数、Agent登録数、GitHub Star/Forkを成長指標として測定

「OpenClawの半分程度のバズ」は保証条件ではなく、90日間の成長目標として扱う。
