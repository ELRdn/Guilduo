# Guilduo 公開βロードマップ

最終更新: 2026-10-03

## 2026-10-03: 本番反映完了・公開版確認

- [x] D1 migration `0011_shared_mcp_agents.sql`とWorker version `3bbeadd9-5eaa-4e88-bc62-09165442e30d`を反映。既存設定・配置・D1/KV/R2を保持し、health／OAuth／未認証401／CORS／実MCPのAgentコンテキストを確認
- [x] GitHubの`production`環境に保存済みの`APPWRITE_DEPLOY_KEY`を使い、[Site配備Actions 37024673402](https://github.com/ELRdn/Guilduo/actions/runs/37024673402)が成功。配備ソース`dbdb1124353629763abd1719987c3a76a8345878`、Appwrite deployment `6abfc9479192501efbe7`
- [x] 静かな更新・引いて更新・共有AgentのSettings・`admin`表示を本番へ反映。公式App／互換path／LP／Privacy／TermsはHTTP 200、公開画面を実Chromeの1440／412pxで確認。現行bundleに固定個人名なし、新旧85 assetのサイズ・SHA-256一致と旧画面起動を確認
- [x] 最新mainの修正を保持した統合版で453テスト・型・デザイン・ブランド・API契約再生成・ビルド、同期15／静かな更新7／Human Relay34／公開用起動40／アクセシビリティ343成功。Actionsでも配備前検査が成功
- [x] Guilduo内の親計画・LP-R07へ配備結果と次の受入を反映。再取得でnotes／nextAction／updatedAtだけの変更とactive／done=falseを確認
- [ ] 実Chat／Codex／Dotsの共有接続、物理Pixel 9の同期・ナビ・TalkBack、Human往復、本番性能・運用の受入を完了する

キャッシュ設定は変更せず無効を維持。専用ブランチ`codex/refresh-shared-agents-release`から配備し、mainと元の作業ツリーの未コミット変更は保持した。詳細は[配備記録](docs/launch-readiness.md)。以下の検証件数・未配備記録は各作業時点の履歴であり、配備状態は本節が最新。

## 2026-10-02: 静かな更新・共有MCP・スマホ更新

- [x] 自動再取得で一覧のスクロールが450pxから先頭へ戻る問題を実Chromeで再現・修正。ページ・内部一覧・補足の開閉を保持し、通信待ちの間に動かした位置も維持
- [x] スマホの最上部から下へ引いて離す読取更新を追加。短い引き・横方向・取消・複数指・入力・モーダル・Networkのパンを除外し、Moreにキーボード操作可能な更新ボタンを追加
- [x] 1つのMCP接続へ複数Agentを許可し、各呼び出しの`actingAgentId`で担当を選択。並行呼び出しで共有設定を書き換えず、Agent権限とOAuth権限の積集合を維持。単独Agentの従来呼び出しは互換
- [x] Settingsの複数選択・保存・再読込、1人の無効化による他Agentへの影響、未指定・未許可・失効済みの拒否を確認。9言語×320／412／1440pxと実Chromeタッチで検証
- [x] 全450テスト、型検査、同期15、新規ブラウザ7、公開用起動40／入口12／アクセシビリティ343条件成功。API契約の再生成一致を確認。Guilduo内の親計画・LP-R07も進捗だけを更新・再取得で照合
- [x] D1 migration `0011_shared_mcp_agents.sql` → Worker → Siteの順で配備完了（2026-10-03）。Chat／Codex／Dotsの実接続・物理Pixel 9受入は上の残存ゲートで継続

本追加修正は2026-10-03に配備・公開確認済み。送信元製品の自動判別ではなく、許可したAgent IDを毎回指定する方式。[使い方](docs/shared-mcp-agents.md)と[確認記録](docs/launch-readiness.md)に境界と配備手順を記録。公開用ビルドは成功したがRelay Forgeのchunkが503.29 kBとなり、500 kB超の警告が残る。本番性能・実機・実Human往復の受入は継続する。

## 2026-10-02: 保存競合・応答喪失の追加修正

- [x] Chromeの二端末編集で古い入力が新しい保存を上書きする問題を再現。REST/MCPのQuest更新・完了に任意の`expectedUpdatedAt`を追加し、共有ドメインのトランザクション内で照合。古い完了操作が完了済みQuestを再開する問題も防止
- [x] 保存競合時はdraftを保持し再送を停止。編集を閉じて読取で回復する。タイトル80文字と見積100000分の既存API境界へ入力を揃え、2000分の見積を編集で切り詰めない
- [x] サーバー保存後に応答だけ失われる条件を再現。Quest作成・編集は結果不明のまま再送せず、入力保持と一覧再取得を案内。9言語×320／412／1440pxで競合・結果不明の表示を確認
- [x] Human回答後の遅い一覧応答で未対応へ戻る不具合を再現・修正。dry-run中の画面破棄後も回答書込みへ進めないことを実Workerで確認し、Human Relay検査をCIへ追加
- [x] 全448テスト、型検査、デザイン検査、ビルド、API再生成の安定性、同期15シナリオ、実入口の公開用12シナリオを確認。詳細と再現ログは[追加確認記録](docs/launch-readiness.md)
- [x] 公開Privacy／Termsの本文・運営者・窓口・canonicalを実Chromeの320／1440px、JavaScript無効で再確認。古い「未配信」の記録を更新
- [x] Guilduo内の親計画・LP-R07へ追加修正と残る受入を反映。再取得でnotes・nextAction・updatedAtだけの変更を確認し、担当・依存関係・完了条件・未完了状態を保持
- [x] 本追加修正をレビューし、D1 migration → Worker → Siteの順で配備・公開URLを再検証（2026-10-03）。WorkerとSiteを両方更新し、保存競合対策を反映

追加修正はローカル候補で検証済み。本番にある以前の改善と区別し、LP-R07の実Google認証／物理Pixel 9同期／Codex・OpenClaw往復／読み上げ／性能、公開運用の残存ゲートは維持する。

## 2026-10-02: ローンチ候補の磨き込み

- [x] Settingsの実効権限を接続ごとのQuest操作可否に整理し、技術スコープ・接続IDを折りたたみ。無効MCPの再接続なし削除を既存APIへ接続。1440px/390px・9言語・キーボード・取消・旧リンク削除・再取得失敗・Agent/Quest保持・再読込を隔離Workerと実Chromeで確認。検査をCIへ追加。085f747を本番Siteへ配備（run 36990716820成功）、配信されたコードの操作と新旧画面の起動・旧asset74件の保持を確認。キャッシュルール復帰確認は待機中。
- [x] 別GoogleアカウントのWorkspace初回読込が409になる不具合を再現・修正。Appwrite認証済みの本人に空の状態を保存し、再読込・同時作成競合・既存/移行データ保持・保存失敗・MCP拒否を隔離APIで確認。402f4e3を本番Workerへ配備（version 2c686f88-61b6-4a24-a0bf-0798f5ed1843）。全441テスト・型検査・ビルド・契約差分なし、CI/Worker配備成功。別Googleアカウントで本番Workspaceが開けたとのユーザー確認を受領。端末間同期とHuman/Agent往復は別途未受入。

実画面の確認→修正→再検証を実行した。今回の改善は**統合版を検証し、2026-10-03に本番反映・公開確認済み**。詳細と再実行手順は[ローンチ確認記録](docs/launch-readiness.md)。

- [x] 上部検索とCtrl／⌘KをQuest検索へ接続。連続入力、カーソル位置、日本語IME変換中の入力を保持
- [x] Quest編集で予定日・計画状態・担当者の作業状態・見積0分を保持
- [x] Quest完了を既存score APIへ接続し、報酬とBattle MPを反映。遅い初期応答による上書きを防止
- [x] Quest／Agent保存中の二重送信と閉じる操作を防止。本人／Agent画像をキーボードで選択可能にする
- [x] 初回認証・接続失敗・再試行を9言語化。初期Lensの遮蔽を解消し、PC／スマホのデモからサインインへ戻れるようにする
- [x] Privacy／Termsを正本文書から静的ページへ出力し、LPとサインイン画面から案内。Appwrite・同意制計測・本人Avatarの現行仕様へ同期
- [x] Service Workerから認証API・Bearer付きリクエストを除外。情報ページによるオフラインアプリの置換も防止
- [x] LP-R07のローカルHTTP Worker/MCP・本体UI結合受入を再実行。外部確認の明示チェックと独立したQuest完了を維持
- [x] Guilduo内の親計画・LP-R07の本文と次の行動を更新し、再取得で照合。担当・期限・依存関係・受入条件・未完了状態を保持
- [x] Quest画面の固定文・詳細・空状態・ARIAと共通状態通知を9言語化し、Intl日時・ICU件数へ接続
- [x] フィルター／並び順の矢印・Home／Endと再描画後のフォーカスを修正。Quest一覧は1つのTab入口に統一
- [x] アーカイブ非表示時の停止・期限超過集計を修正し、長い翻訳状態ラベルの欠けを解消
- [x] Coreの不要なCommonJS代入を除き、ESM・従来requireテスト・ブラウザglobalを確認。ビルド警告を解消
- [x] 9言語・3幅の操作検査を`accessibility:verify`へまとめ、公開用成果物の検査をCIに追加
- [x] Settingsの固定UI・案内・主要保存通知を9言語化。テーマ／言語変更後のフォーカスを保持し、プロフィールと画像の同時保存を防止
- [x] Agent画像処理中の保存・再選択・閉じる競合を防止。Linked Agentの選択・取消・保存後のフォーカスと重複HTTP送信防止を実Chrome／Workerで確認
- [x] Quest作成／編集の固定文を9言語化し、言語切替で入力・見積0分・フォーカスを保持
- [x] Agent作成／編集を9言語化し、ID重複と更新競合の案内を分離。初期状態を既存APIのActive契約へ揃え、言語切替で権限・指示・フォーカスを保持
- [x] スマホCommandの判断バーによるMoreメニュー遮蔽を修正。本人／Agent画像のHTTP保存・再読み込み・失敗後の再試行をテスト用保存先で確認
- [x] Partyを9言語化し、矢印／Home／Endの選択・スマホ詳細復帰・Agent登録編集のフォーカスを確認。保管済み負荷、完了後の受け渡し履歴、AstraをAgentへ含める集計、長いチップと中間幅の名前欠けを修正
- [x] Commandの判断・修正依頼・既知エラーを9言語化。送信中の入力／取消／重複操作を止め、失敗後のdraft、IME・カーソル位置、別Questへの遅延応答と選択フォーカスを実Workerで検証。完了／保管済みの編集・承認を除き、回答履歴は保持
- [x] スマホCommandの固定UIを9言語化。成果物なしの確認操作を止め、開閉・矢印／Home／End・選択後のフォーカスと棚のスクロールを保持。未取得の実行継続を断定する案内、無動作のその他ボタンと作成矢印、最後の担当者の列ずれを修正。ソース112／公開用78、既存画面70成功（この時点の記録。PC側の結果は次項）
- [x] Networkの固定UI・関係理由・ARIAを9言語化。保管済みと完了済みの停止関係を除き、重複した待機数を修正。グラフ／一覧／スマホのフォーカス、戻る際の共有Quest選択、Actor／Connectionの正確な遷移先を実Chrome／Workerで確認
- [x] Skillsの分類・固定UI・状態・ARIAを9言語化。検索語の余白・途中挿入・IME・言語変更の入力とフォーカスを保持し、検索で分類の開閉状態を消さない。44pxの開閉操作、長文、MCP技術名の保持を実Chrome／Workerで確認
- [x] Connectionsを9言語化。接続切替中の結果混入・二重操作・再接続URL破棄を修正し、実Worker形式の件数と同期方向を検証。同期／共有Google解除後の全Quest再取得、200件超のページング、失敗後の読取再試行、Human返信を含む書込み保留とPC／スマホのフォーカスを確認
- [x] Battleを9言語化。通信中の取消・二重実行、古いプレビューの実行、不完全な成功応答を拒否。応答喪失後は読取回復まで書込みを保留し、勝敗・スマホMP導線・操作フォーカスを実Chrome／Workerで確認
- [x] CI・手動Site配備・タグ付きリリースに既存ローンチ検査を接続。ローカル公開用previewで40条件成功、HTTP 200のポリシーfallbackで失敗することを実ブラウザで確認。公開前検査の失敗を配備へ進めない（リモートworkflow未実行）
- [ ] 本候補をレビュー・配備し、公開URLで追加修正を再確認する（Privacy／Terms本文の公開は上記の再確認で成功）
- [ ] 実GoogleアカウントのPC⇄Pixel 9同期、実Codex／OpenClawの依頼→確認→FB→再開を受け入れる
- [x] Command PC・キャッシュ済みモデル・Shell通知の9言語追従を確認。保存結果の不可視、棚の位置復元競合、IME確定後の検索フォーカス、長い棚見出しを修正。Command131／公開用96、ローンチ55／公開用40、画面70成功
- [x] 通常Questも30秒間隔・画面復帰・オンライン復帰・手動操作で再取得。全ページ読込、同期／失敗／オフライン中の共有書込み保留、選択・draft・カーソル・既存プロフィール／Agentの保持を実WorkerとChrome2クライアントで確認。同期12シナリオ、9言語×2スマホ幅、200件超の初回表示と再取得を検証。`sync:verify`とCIへ追加（リモートCI・実機は未確認）
- [x] 実アプリ入口をAppwrite SDK＋合成セッション＋隔離HTTP Workerで検証。アカウント確認前の表示、所有者不一致、401／503、コールバック資格情報除去、再読込・二端末同期・遅延取得中のログアウトを開発版／公開用各11シナリオで確認。空・空白・数値のaccount IDを認証成功にしない
- [x] 本人／Human担当のCommandは実担当者一人を表示。「自分→自分」の架空の受け渡しと別Humanを本人として表示する問題を修正し、保存名・状態・本人画像の分離を確認。実入口検査をCIへ追加（リモートCI未実行）
- [x] スマホQuestシートをnativeモーダルへ変更し、背面の読み上げ対象とフォーカスを遮断。両方向Tab・閉じる／Escape／scrim・選択・desktop resize、9言語×2幅のAX名を確認。Command154／公開用119、実入口12／公開用12成功。見た目を目視比較。PCとPixel 9は利用可能との回答を受領し、ローカル候補の実機FBを依頼済み（結果未受領）
- [ ] 実アカウントで全画面の表示・通知、スクリーンリーダー、実利用性能を受け入れる
- [x] 公式運営者Radon、バグ報告GitHub Issues、個別問い合わせ・削除依頼`el2radon2official@gmail.com`をユーザー指定で確定し、Privacy／Terms正本と静的ページへ反映
- [ ] ポリシーの運用・削除依頼の受付処理・法的確認を済ませ、配備後の公開ページと窓口を受け入れる

全444テスト、型検査、デザイン検査、ビルド、契約ファイル差分なしを確認。実アプリ入口は開発版／公開用各12シナリオ、最新のCommand157／公開用122が成功。Workspace同期12、Human Relay32、画面70の直前の成功記録も保持。ローンチ55／公開用40、操作404／公開用343の成功記録も保持。実入口の認証応答は合成データで、実Google OAuth・本番Appwrite保存の受入とは扱わない。Battle画面36条件＋隔離HTTP6シナリオ／公開用36条件、Human Relay32、Connections42／公開用36、遅延/競合10、日英LP118チェックの記録も保持。Provider応答と許可画面は隔離テストで差し替えた。実OAuthや物理Pixel 9の受入は未完了。遅延検証は状態の正しさを確かめるもので、本番GUIの安定1秒を証明するものではない。

公開環境の最新の未認証確認では、LP・Web App・OAuth metadataへ到達し、MCP healthは2.7.0／Schema 7／56ツールを返した。`www`はDNS未解決。Privacy／Termsは同日後半の再確認で本文・運営者・窓口・canonicalを配布していることを確認した。過去のfallbackや「新機能は全部未配備」という記録を現在の全機能へ適用せず、本追加修正と実クライアント受入の未完了を管理する。

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
- 現在のソース: REST/MCP 2.7.0、Schema 7、MCP 56ツール、OpenAPI 60パス。本番healthも56ツールを報告（2026-10-02）。本候補のUI変更と実アカウントによる全機能受入は未完了
- /mcp の安定レーンと /mcp-next の検証レーン
- Guilduo Workflow Skill（legacy technical ID: questforge-workflows）、ローカルCLI、Codex Plugin/MCP App登録準備パッケージ
- 2026-10-02: Skill入りのGuilduo Workflowsローカルプラグインを配布・有効化し、Codexの`skills/list`で読込と正本一致を確認。旧QuestForge接続は保持。ユーザーの読取確認報告に続き、この接続でも56ツールと`request_human_review`の公開スキーマ、`list_human_requests(status=all)`の正常応答（0件）を確認。2ツールの未検出は解消。依頼作成の実行権限・Web回答・FB取得・Agent再開の実往復受入はLP-R07に残す。[導入・更新手順](docs/guilduo-plugin-setup.md)
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
- [ ] 配備版と本候補の差分を確認し、LP-R07の実Codex/OpenClaw・Pixel 9受入を完了
- [x] LP-R08の短い反応とReduced Motion/設定OFFを実装・ローカル検証

既存タスク「MCPでAgentリンクできるように修正」「SkillsでMCPツールを分かりやすく整理」は関連として照合済み。2026-09-07の一括依頼で、リンク修正のソース統合と56ツール/9カテゴリの整理も実装・検証した。GitHub公開・X告知タスクは文案を準備し、公開と投稿は未実施。LPの成功を本体改善の完了へ読み替えない。同期・認証・公開受入の残存ゲートも維持する。

**LP-B01 / P0 — 保存容量の障害は復旧済み（2026-09-06）:** Appwriteの`stateJson`は既に`longtext`だったが、Workerと移行ツールに残る60,000文字制限が保存を拒否していた。旧制限を除去し、gzip・旧JSON読み込み・revision競合検知・トランザクションを維持して本番Workerへ反映。子8件の作成と親の案内更新に成功し、既存67件のQuest・162件の履歴・移行スナップショットなどの保持を照合した。データの削除やテーブル・権限の変更による回避は行っていない。[原因・修正・検証記録](docs/storage-capacity-fix.md)

### Design System強化

- MP／Reward／BattleをOrange・Gold、Agent／MCPをBlue、Human／成功をGreenへ統一する
- Lucide vanillaの機能アイコンへ統一し、アイコンライブラリの混在をなくす
- Golden Referenceを固定デモFixtureから再生成し、個人データを含めない
- Design token、Component、Screen、Asset Manifestの整合検査をCIへ追加する

スクショと実装確認で見つかった改善項目:

1. Relay Forgeの初回認証、検索、主な保存通知、Human確認に加え、Quest画面の固定文・詳細・空状態と共通状態通知は9言語化済み（2026-10-02に追加検証）。Command・主要7画面の固定UI、キャッシュ済みモデル、Shell保存通知の言語追従もローカル検証済み。実認証済み画面と読み上げの受入はP1として継続する。ユーザー作成のQuest本文・Agent説明を自動翻訳しない。
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


- [x] Pixel 9で報告されたCommand下部ナビのスクロール追従をローカル修正。固定nav・自然な本文高さ・実測末尾余白とタッチChrome3サイズを検証。実機再確認は回答待ち。
