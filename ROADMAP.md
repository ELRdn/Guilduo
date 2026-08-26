# Guilduo 公開βロードマップ

最終更新: 2026-08-26

## 設計書の正本

- [`DESIGN.md`](DESIGN.md)：現行版`/`の視覚設計、UI操作、コンポーネント、レスポンシブ、アクセシビリティ
- [`PROJECT_SPEC.md`](PROJECT_SPEC.md)：共通アーキテクチャ、データ契約、ドメイン不変条件、認証、安全性、公開運用
- [`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md)：`/next/`のUI実験、同期状態、レスポンシブ設計、昇格ゲート
- [`design/TOKENS.json`](design/TOKENS.json)：3テーマ×ライト／ダークの機械可読トークン
- [`design/COMPONENTS.md`](design/COMPONENTS.md)：共通部品の構造、状態、アクセシビリティ
- [`design/SCREENS.md`](design/SCREENS.md)：Today、Tree、Battle、Party、連携、Profile、SettingsのBlueprint
- [`design/ASSET_MANIFEST.md`](design/ASSET_MANIFEST.md)：画像・アイコン・役職素材の用途契約
- [`design/reference/README.md`](design/reference/README.md)：サニタイズ済みGolden Referenceの基準
- `DESIGN.md`が視覚設計、`PROJECT_SPEC.md`が技術仕様の正本であり、Next版は差分だけを管理する。Next版から`/`への昇格は自動化せず、実アカウント・PC・Pixel 9・9言語・MCP・アクセシビリティの明示受入を通す。
- DeepSeek Harness、OpenClaw、Hermesなどは外部Execution Planeとして扱い、GuilduoはRemote MCP、Skill、Agent Registry、Handoff、権限を提供する。Harnessの実接続コードやモデルAPIキーは公開βへ持ち込まない。

## TypeScript移行

- 公開β状態をローカルZIP、差分パッチ、GitHubの`backup/pre-typescript-20260815` branchと`backup-pre-typescript-20260815` tagへ退避済み
- 手書きアプリ、Worker、MCP、CLI、テストを`.ts`へ移行し、Vite・tsx・Wrangler型生成の基盤を追加
- `npm run typecheck`でWorker型生成、`wrangler types --check`、TypeScriptプロジェクト検査を実行
- TypeScript移行後の実運用ソースはstrict型チェック済み。共有型・境界検証・ブラウザ・Worker・CLI・テスト・バトル原型を`npm run typecheck`で継続検査する
- Firebase移行データを保全し、Schema 7、REST 2.7.0、MCP 51ツール、OpenAPI 52パスの互換を維持する

## 現在地

Guilduoは、**HumanとAI Agentが同じworkspaceで仕事をRelayするHuman × AI Work Platform**として公開βの直前まで進んでいる。

> AIを仲間に、最強のパーティーを。

人もAIも、依頼主。人もAIも、担当者。Guilduoは、その共同作戦を安全に進めるオープンな作戦盤である。

### 実装済み

- / の現行UI、/next/ の公開βUI、/lp/ を同じAppwrite Sites成果物へビルド
- Appwrite Authの復元、Worker経由のユーザー単位TablesDB同期、再接続、同期中スケルトン、書き込みロック
- TodayのPC・タブレット固定レイアウトと中央Quest欄の独立スクロール
- スマホのページスクロール、下部Quest詳細、ポップアップ詳細切替
- Questの完了・保管・復元、Shift範囲選択、Ctrl／⌘個別選択
- Agent Registry、MCPクライアント紐付け、Handoff、Astraと本人アカウントの分離
- REST 2.7.0、Schema 7、MCP 51ツール、OpenAPI 52パス
- /mcp の安定レーンと /mcp-next の検証レーン
- Guilduo Workflow Skill（legacy technical ID: questforge-workflows）、ローカルCLI、Codex Plugin/MCP App登録準備パッケージ
- 日本語、英語、スペイン語、ブラジルポルトガル語、フランス語、ドイツ語、韓国語、簡体字中国語、ロシア語
- Google Calendar、Google Tasks、Toggl、Notionの状態表示。Provider OAuthは公開βではEarly Accessとして停止
- 匿名計測の同意UI、許可イベント限定のクライアント送信、Worker `/telemetry` 受け口、D1保存、90日保持上限
- v0.6.0-beta.1のリリース設定と、D1 → Worker → Health Check → Appwrite Sitesのタグ専用Workflow
- Unity Battle Labはペンディングのまま本体リリースから分離

## 検証結果

2026-08-14時点のローカル検証:

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

## 公開前ゲート

### P0: ユーザーによる実機受入

- PC ChromeでGoogleログイン後にページを更新し、Quest・キャラクター・Agent・MCP接続が復元されることを確認
- Pixel 9で同じアカウントへログインし、更新後に同じデータが表示されることを確認
- PCでQuestを編集・完了し、Pixel 9へ反映されることを確認
- Pixel 9で編集・完了し、PCへ反映されることを確認
- 接続失敗時に「再接続する」が表示され、前回データを保持することを確認
- 同期中に完了・編集・保管が無効になることを確認
- Agent登録、MCPクライアント紐付け、Quest割り当て、Handoffを実アカウントで確認

### P0: Appwrite移行とデプロイ確認

- Appwrite Web Platform、Google OAuth、Sites生成ドメインを確認
- Firebase AuthユーザーとRealtime Databaseをエクスポートし、`legacy_states`の件数・checksumを照合
- GitHub Environment productionのCloudflare/Appwrite Secretを確認
- Workerを先にデプロイし、/healthでVersion、Schema、D1接続を確認
- Appwrite JWTで`/v1/state`の作成・更新・競合検知・再読込を確認
- Appwrite Sitesをデプロイ
- /、/next/、/mcp、OAuth metadata、未認証401をスモークテスト
- CI成功後にだけv0.6.0-beta.1タグとGitHub Releaseを作成

### P1: 手動登録が必要な外部手続き

- OpenAI MCP Appの技術App IDをDashboardで発行し、plugins/questforge/.app.jsonへ反映
- plugins/questforge/openai-submission.jsonの空欄を実際の技術App IDで更新
- OpenAIのレビュー申請。レビュー通過は公開βの必須条件ではない
- Privacy、Terms、アカウント削除手順の公開URLを確認
- Google OAuthを再開する場合だけProvider Secret、Authorized Domain、審査を設定

## 次の改善

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
5. 外部サービスはOAuthが再開されるまで、モックを実データと誤認しないEarly Access表示を維持する。
6. LCP、INP、CLSの匿名計測は同意制の実装済み。公開前に `TELEMETRY_ENDPOINT` と D1 migration 0006 を本番環境へ設定し、実測を開始する。
7. Unity、ネイティブAndroid/iOS、Agent自動実行、外部OAuth正式公開は公開βの範囲に戻さない。

## 公開後の順序

1. 同期エラー、MCP接続、初回Quest完了率を匿名同意制で監視
2. 9言語の長文・日付・複数形を実ユーザー環境で補正
3. Google Calendar読み取り、Google Tasks、Notion、Togglの順にEarly Accessを段階再開
4. OpenClaw、Hermes、Gemini CLI向けレシピを利用実績に合わせて更新
5. OpenAIレビュー後にMCP Appの登録IDと公開導線を確定
6. 90日間の利用者、初回Quest完了率、MCP接続数、Agent登録数、GitHub Star/Forkを成長指標として測定

「OpenClawの半分程度のバズ」は保証条件ではなく、90日間の成長目標として扱う。
