# Guilduo ローンチ確認記録

更新: 2026-10-02。対象: 現在の作業ツリー、`0.6.0-beta.8`候補。**ローカル検証済み・本候補未配備・実機受入未完了**。

## 修正と実確認

| 問題 | 修正・確認 |
| --- | --- |
| Battle通信中に取消・別の手・重複実行が進む | 共通ガードで拒否。プレビュー時のTurnを実行へ渡し、独立UI間でCommand IDが重複しないことを確認 |
| 古い／不完全なBattleプレビューを成功扱い、応答喪失後に再実行 | Turn／MP／両HPを照合し、成功応答・読取状態を検証。応答喪失後は共有書込みを止め、実Workerの読取で実行済みの1ターンだけを回復・再読込でも保持 |
| Battleの固定文・勝敗・スマホMP導線・操作位置 | 9言語×4幅でプレビュー→実行、フォーカス、meter、履歴開閉、MP獲得Questを確認。勝利と敗北を区別し、長い操作文の高さと作戦領域の到達性を修正 |
| 検索ボタンが無動作、連続入力でフォーカス消失 | 既存Quest検索へ接続。Ctrl／⌘K、連続入力、途中挿入、IME変換中のDOM保持、スマホ入力を確認 |
| 編集で予定や担当の作業状態、0分見積が変化 | 変更しないフィールドを保持。実WorkerのHTTP保存結果を照合。Human担当・無効化済みAgent担当も明示して保持 |
| 完了が報酬を付与せずBattle MPが古い | 既存score APIを使用し、報酬と保管状態を確認。再読み込みで保持し、遅い初期Battleが新MPを上書きしないことを確認 |
| 未取得の実Battleにデモが混入 | nullを保持し、空状態を確認。完了後の再取得失敗は明示し再試行を提供 |
| 初回の中間幅をLensが遮蔽、デモから戻れない | 1600px未満の初期Lensを閉じる。PC／スマホでデモ→サインインを確認 |
| 認証・接続失敗文が日本語固定 | 初回画面と主な通知を9言語化。320／412／1440pxで見出し・操作・言語メタデータ・横はみ出しを確認 |
| Questの固定文・共通状態・日時・件数が日本語固定 | Questのフィルター・詳細・空状態・ARIAを9言語化。日時はIntl、件数はICUへ接続。59.8分／1439.8分の丸めとロシア語複数形を検証。期限はUTC日付として明示解析し、東京／ロサンゼルスで前日へずれないことを確認 |
| フィルターの矢印操作なし、一覧のTabが各行に止まる | 共通radio groupへ矢印・Home／End・循環・フォーカス復帰を追加。表は単一Tab入口で矢印選択し、9言語・3幅で検証 |
| 保管済みが非表示でも停止・期限超過集計へ混入、長い状態が欠ける | 集計を表示対象へ揃えて非表示／表示を照合。状態チップと保持時間の折り返しを実Chromeで確認 |
| 保存中の閉じる／二重submit、画像選択のキーボード操作不足 | Quest／Agentに保存ガード。実HTTP Agent登録を遅延させ、二重submit・Escapeで重複せず一度保存されることを確認。本人／Agent画像はEnterで選択 |
| Settings固定文、テーマ／言語変更時のフォーカス消失 | 固定UI・案内・主要保存通知を9言語化し、native radio／selectの変更後にフォーカスを保持。画面見出しへの明示移動と通常再描画を区別 |
| Quest編集の固定文と保存中の入力取りこぼし | 固定UI・案内を9言語化し、言語切替で入力DOM・タイトル・次の一手・見積0分・フォーカスを保持。Quest／Agent保存中は入力欄も止め、HTTP保存結果を後からの入力で覆わない |
| プロフィールと画像の同時保存、Handle制限が英語表示 | 両保存を排他し、遅延HTTPで二重submitは1回・画像PUTは0回を確認。文字列「あなた」を本人データとして保持。30日制限を案内し、実Workerの409で日本語通知・draft保持・既存データ不変を確認 |
| Agent画像処理中の保存で画像を取りこぼす | decodeを意図的に止め、保存・再選択・Escapeが進まず、処理後に再開できることを確認。ダイアログ再開で保留画像を消去。破棄済みShellへ処理結果を反映しない |
| Linked Agentの疑似listboxと再描画でフォーカス消失 | native button／aria-pressedへ揃え、開く・選択・取消・保存のフォーカス保持を確認。実WorkerのPUTを遅延させ、保存中の選択・取消・重複PUTを防止 |
| Agent編集の固定文、ID重複を更新競合と誤表示 | 固定UI・状態・既知エラーを9言語化。実Workerの409 agent_existsをID重複として案内し、言語切替で名前・指示・スコープ・チェック状態・フォーカスを保持 |
| 新規AgentのDisabled選択が保存時に無視される | 新規は既存APIのActive固定契約へ揃えて状態選択を止め、登録後に無効化できることを案内。既存Agentの編集では状態選択を有効にする |
| スマホCommandの判断バーがMoreのSettingsを覆う | メニューだけでなくnavの親stacking contextを既存popoverトークンへ上げる。通常タップと全項目中央のelementFromPointで遮蔽解消を確認 |
| 画像保存のUI結合検証が選択操作までだった | 実WorkerのHTTP＋既存FakeR2Bucketで本人画像の保存・Blob表示・再読み込み・削除を確認。Agent画像は503を挟み、metadataと入力保持・再試行・Blob再表示を確認。壊れた画像への再選択もエラーを保持。本番R2の受入とは別 |
| Partyの固定文とActor選択時のフォーカス消失 | 固定UI・状態・権限・ARIAを9言語化。一覧は1つのTab入口と矢印／Home／Endを使い、クリック・再描画・スマホ詳細復帰で選択Actorへフォーカス。Settingsの言語変更後もActor選択を保持。PartyからAgent登録／編集へ進み、Escapeで元のボタンへ戻る導線を実Workerで確認 |
| Partyの現在負荷とActor種別・レビュー設定の混同 | 保管済みQuestは負荷から除外。完了後も受け渡し履歴を保持し、最新の確認日時を表示。「レビュー必須」の設定を現在の「要判断」状態と区別。Astra等のCompanionをAgent件数・フィルターに混ぜない。全件表示では別identityを保持 |
| Partyの長い翻訳と中間幅で名前・チップが欠ける | 件数用と保持時間用の訳を分離。Partyのチップを折り返し、901〜1300pxは既存の担当情報を2列へ配置。9言語で320／412／1024／1280／1440px、行内部の幅と名前の可読幅を確認。ドイツ語スマホ・ロシア語中間幅を目視 |
| Commandの修正依頼中に取消・編集・別の修正開始が可能 | 共通の実行ガードとdisabledを揃え、PC中央からの再開始も拒否。実Workerのexecuteを遅延させてHTTP実行1回、409後のdraft保持、再試行の実保存を確認 |
| 別Questへ判断結果・入力が混ざり、遅延応答でフォーカス消失 | 結果を操作元Questへ紐付け、応答は対象データだけ更新。新しい選択・確認チェック・入力を上書きせず、選択カードへフォーカスを保持。Quest切替の修正draftは独立 |
| 判断文とエラーが固定、言語変更で修正入力のカーソル消失 | 操作・判断・既知エラーを9言語化し、保存済み判断結果も言語変更に追従。9言語×320／412／1440pxでdraft・選択範囲・フォーカス、IME変換中のDOM保持を確認。ドイツ語PC／320pxを目視。Command全体の翻訳は未完了 |
| 完了済みAgent Questに編集・承認が残り、不完全な応答を成功表示 | lifecycleを先に判定し、完了／保管済みの変更操作を除く。回答済みHuman依頼の履歴入口は維持。Handoff応答の欠落・別ID・異なる状態は成功扱いせず、受け渡し承認とQuest完了の違いを案内 |
| Networkに保管・完了済みの停止が混入し、共通の待機Questを二重計上 | 保管済みを除外し、完了済みの関係履歴は停止扱いしない。停止中の依存だけを辿り、完了した中継点を越えない。待機IDを一意化し、実Workerの2原因・1待機を確認。未記録の停止理由は未記録として案内 |
| Networkの操作と戻る先、Actor／Connectionの遷移先が不一致 | グラフは単一Tab入口・矢印・Enter、一覧は独立スクロールを使う。移動／戻る／スマホ開閉のフォーカスを保持し、戻る際の共有Quest選択を同期。実Actor／Connectionを対応するParty／Connections詳細へ開く |
| Networkの固定文と長い関係理由、言語変更でカメラとフォーカス消失 | 固定UI・関係理由・状態・ARIAを9言語化。名前・タイトル・保存済み理由は保持。長文と件数は折り返し、map操作は44px。9言語×320／412／1440pxを検証し、実Workerで言語切替後のmap-controlフォーカスとカメラを確認。ドイツ語PC／320pxを目視 |
| Skillsの固定文と分類が未翻訳、検索でカーソルが末尾へ移る | 分類・案内・状態・ARIAを9言語化。既存searchFieldへ揃え、余白を含む入力・途中挿入・選択範囲とIME中のDOMを保持。実Workerのツール一覧で言語切替を確認。MCP技術名と接続先提供のタイトル・説明は保持 |
| Skills検索で開閉状態が消え、開閉後のフォーカスが抜ける | 分類の開閉を検索から独立させ、操作ボタンへフォーカス復帰。aria-controlsの参照先をhiddenで保持し、44pxの標的を確保。スマホにも状態ラベルを表示し、長文を折り返す。二重フォーカス枠を目視後に修正・再撮影 |
| Connectionsで遅い応答が別接続の結果になり、実行中に解除できる | 操作・結果・確認を接続IDへ結び、選択やfilterの変更でプレビューを破棄。処理中の再描画・言語変更でも選択とフォーカスを保持し、疑似clickの重複も拒否。portの例外を表示し保留を解除 |
| 再接続URLを捨て、実APIの認証ラベルで再接続ボタンが消える | 対応サービスIDで判定。応答サービス・HTTPS Provider path・stateを検証し許可画面へ移動。URLや秘密を結果表示へ出さない。実HTTP Workerの共有Google解除→再接続を確認（許可画面はテスト応答） |
| 同期件数を誤読し、同期・解除後の接続とQuestが古い | created／updated／skipped／conflictsとサービス・方向・dryRunを検証。Tasksの双方向、Calendarの取り込み、Notionの書き出しを明示。完了後に接続と全Questを再取得し、実Workerで200件超のページングを確認。失敗後は接続切替でも読取再試行を保持し、同じ同期を繰り返さない。Human返信も保留 |
| 権限の充足・自動同期を断定し、長い翻訳と移動が欠ける | 必要スコープを中立表示し、付与済みスコープは取得不能と明示。Toggl専用APIを汎用同期へ出さない。保管済みリンクと重複影響数を除外。9言語×320／412／1024／1440px、矢印／Home／End・詳細復帰を確認。ロシア語ボタンの縦はみ出しも目視修正し、文字矩形で再検証 |
| 公開ポリシーが旧Firebase仕様、本番URLはfallback | 現行Appwrite・Avatar・同意制計測へ同期。正本Markdownから静的出力し、JavaScript無効でも本文を確認 |
| Service Workerが認証データをキャッシュ可能 | API/OAuth/MCP/telemetryとBearer付きrequestを除外。情報ページがアプリのオフラインshellを置換しないことも実fetch handlerで検証 |

Human確認とHandoffの外部確認チェックを維持する。プレビューを開いただけでは承認できず、Handoff承認・Human回答を元Questの完了にしない。既存Command検証の古いfixture URL・確認ゲート・固定件数の期待値も現行契約へ更新した。

## 成功した検証

| 検証 | 結果／ローカル証拠 |
| --- | --- |
| `npm test` | 最新444成功、失敗・スキップ0。`.qa-artifacts/sheet-modal-tests.log`。以前のConnections／Skills／Network／Battleログも保持 |
| `npm run check` | strict型・Worker型・TypeScript policy・Battle型成功。`nav-typecheck-final.log` |
| `npm run design:check` / `npm run build` | 成功。`nav-design-final.log` / `nav-build-final.log` |
| `npm run api:generate` | REST/MCP 2.7.0、Schema 7、56ツール・60パスを維持。契約ファイル変更なし |
| `npm run launch:verify -- http://127.0.0.1:5183` | 最新55成功。`command-desktop-launch.log` / `.qa-artifacts/launch/results.json` |
| `npm run launch:verify -- http://127.0.0.1:5184 --built` | 公開用成果物で40成功。.qa-artifacts/nav-launch-built.log / `.qa-artifacts/launch/built/results.json` |
| `tsx tools/verify-relay-forge-screens.mts http://127.0.0.1:5183` | 70成功。Connectionsの件数・プレビュー後の実行・解除影響、Networkの共有選択、Skillsの操作も確認。`relay-entry-screens.log` |
| `tsx tools/verify-relay-connections.mts http://127.0.0.1:5183` | 42成功。9言語×4幅と隔離HTTP Workerで例外・遅い応答・選択／言語変更・二重click・同期・再取得失敗・Human返信保留・200件超のページング・共有解除・再接続。`connections-browser.log` / `relay-connections/results.json` |
| `tsx tools/verify-relay-connections.mts http://127.0.0.1:5184 --built` | 公開用成果物で36成功。9言語×320／412／1024／1440pxの操作、横はみ出し、ボタン文字矩形、権限表示を確認。6件のHTTP Worker操作はsource専用。`connections-browser-built.log` / `relay-connections/results-built.json` |
| `tsx tools/verify-relay-forge-command.mts http://127.0.0.1:5183` | 最新157成功。nativeシートの背面隔離、両方向Tab・閉じる・scrim・resize、9言語のAX名も確認。PC追加18条件と実Workerの作業通知・安全な失敗・再試行を含む。9言語×320／412／1024／1440px、キャッシュ済みモデルの言語追従、開閉・焦点・選択・スクロールを確認。`nav-command-source-final.log` |
| `tsx tools/verify-relay-forge-command.mts http://127.0.0.1:5184 --built` | 最新122成功。nativeシートの背面隔離と同じ操作・9言語AX名を公開用で確認。9言語×4幅の追加条件を公開用成果物でも確認。HTTP Worker操作はsource専用。`nav-command-built-final.log` |
| `npm run relay:verify -- http://127.0.0.1:5183` | HTTP Worker/MCP・Human Relay32成功。認証・Human担当者修正後にも再実行。`relay-entry-human-relay-final.log` |
| npm run sync:verify -- http://127.0.0.1:5183 | 最新12シナリオ成功。認証・Human担当者修正後の実Worker／Chrome2クライアント、draft・再取得失敗・200件超を再確認。relay-entry-sync-final.log |
| npm run entry:verify -- http://127.0.0.1:5183 | 実アプリ入口で12シナリオ成功。nativeモーダルの背面フォーカス拒否を含む。実Appwrite SDK＋合成account／JWT／sessionと隔離HTTP Worker。実Google OAuth・本番保存先は未検証。nav-entry.log / relay-entry/results.json |
| npm run entry:verify -- http://127.0.0.1:5184 --built | 公開用の実アプリ入口も12成功。nativeモーダルの背面フォーカス拒否を含む。認証拒否・所有者不一致・再読込・二端末同期・ログアウト後の遅延応答拒否とHuman担当を確認。nav-entry-built.log / relay-entry-built/results.json |
| `npm run latency:verify -- http://127.0.0.1:5183` | 10成功。`.qa-artifacts/latency-investigation/browser/results.json` |
| `npm run lp:verify -- http://127.0.0.1:5183` | 日英LP118チェック成功。`launch-lp.log` |
| `npm run accessibility:verify -- http://127.0.0.1:5183` | 404成功。9言語×320／412／1440px、Quest／Party／Settings／Network／Skills／両editorの実キーボード・言語切替・draft保持・ラベル欠け・集計・実行中ガード。Moreのhit test、画像通知、実WorkerのAgent登録編集、Network待機重複・カメラ／フォーカスとActor遷移、Skillsの検索・開閉・カーソル・IMEも確認。Partyは1024／1280pxも追加確認。`skills-accessibility.log` / `relay-accessibility/results.json` |
| `npm run accessibility:verify -- http://127.0.0.1:5184 --built` | 公開用成果物で343成功。Quest／Party／Settings／Network／Skills／Quest editor／More。実Worker編集・Networkデータ操作・Skillsの実言語変更・共通部品の直接検査61シナリオはsource route専用。`skills-accessibility-built.log` / `relay-accessibility/results-built.json`。CIのpreview検査へ追加（リモートCIは未実行） |
| `git diff --check` | 成功 |

ログ名だけのものは`.qa-artifacts/`配下。スクリーンショットはローカル専用。サインイン（日英スマホ）、報酬反映後Battle、320pxのポリシー全文を目視確認した。ブラウザは隔離したChromeプロファイル、合成アカウント／メモリ保存先を使用。実ユーザーのQuestを検証用に変更していない。

`questforge-core.ts`の不要なCommonJS代入を除き、ESMのnamed exportとブラウザglobalを維持。従来requireのcoreテストも成功し、ビルド警告を解消した。既存prepared transactionの未コミット変更は保持し、設定有効化・本番計測はしていない。翻訳操作検査のデータは合成fixtureを使う。ドイツ語PC／英語320pxを目視し、欠けの修正後も再撮影した。

## 公開URLの読み取り確認

`.qa-artifacts/launch/public-check.json`（2026-10-02 JST）: 公式日英LP／Web App／OAuth metadataは200。MCP healthは2.7.0・Schema 7・56ツール。未認証MCPとAppwrite accountは401。GitHub公開URLは200。`www`はENOTFOUND。Privacy／Termsは200でもtitle/h1が既存Guilduoのfallbackで、ポリシー本文は未公開。

## 公開前に残る受入

1. 本候補の差分レビューと配備。既存HTML edge cacheの停止・旧shell期限・再有効化手順は[配備規則](appwrite-site-routing.md)に従う。配備後、Privacy／Terms本文と今回の挙動を公式URLで確認する。
2. ポリシー運用・削除依頼の受付処理・法的確認を済ませる。運営者Radon、バグ報告GitHub Issues、個別問い合わせ／削除依頼メールはユーザー指定で確定し、正本文書へ反映済み。文書生成を法的審査済みや公開済みとは扱わない。
3. 実GoogleアカウントでPC⇄物理Pixel 9の認証復元・双方向同期・再接続・画像表示を受け入れる。
4. [LP-R07手順](human-relay-acceptance.md)で実Codex／OpenClawの依頼→確認→FB→再開を記録する。今回のローカルMCP往復は外部クライアントの受入ではない。
5. 実アカウントで全画面の固定文・通知表示、スクリーンリーダーと実利用性能を受け入れる。Quest／Party／Settings／Network／Skills／Connections／Battle／両編集の固定UIと共通状態はローカル確認済み。CommandのPC部品・キャッシュ済みモデル・Shell保存通知の言語追従と、未知APIエラーの安全な案内もローカル確認済み。実アカウントでの全画面表示受入は残る。Agent editorの公開用成果物上の実Google認証済み受入も残る。GUI遅延テストは正しさの回帰確認であり、本番の安定1秒やLCP/INP/CLS達成を証明しない。

`www`のDNS、Documentation、Provider OAuth再開、MCP Appレビューは[ロードマップ](../ROADMAP.md)で別ゲートとして保持。commit／push／deploy／タグ／X投稿は実行していない。

## Guilduo内の計画更新

登録済み親計画`quest-5e093615-e0ba-4713-b941-e24df707d618`とLP-R07`quest-980e7b96-f175-451f-b55c-cb56c581549b`の進捗本文・次の行動をMCPでdry-run後に更新し、再取得して照合。担当・期限・依存関係・完了条件・未完了状態を保持し、対象外Questは変更していない。これはロードマップの更新確認であり、実Human⇄Agent往復の最終受入とは扱わない。

Command追加検証の結果はGuilduo側のMCPから親計画の本文・次の行動へ反映し、再取得で一致を確認。差分はnotes・nextAction・updatedAtのみで、active／done=falseを保持。QuestForge側とは別の接続として扱う。本文の180文字制限に合わせて要点と記録への参照を保存した。LP-R07の実Google認証・外部クライアント・実機の未完了条件を維持する。

Network／Skillsの追加検証もGuilduo側MCPで親計画へ反映・再取得。430テスト、画面70、操作404／ビルド343を本文へ記録し、次の行動はCommand／Shell／Battle／Connectionsの残存表示へ更新した。今回も変更はnotes・nextAction・updatedAtのみで、active／done=falseと受入条件を保持した。

Connectionsの追加検証もGuilduo側MCPで親計画へ反映・再取得。433テスト、Connections42／公開用36、画面70、操作404／公開用343を180文字以内の本文へ記録した。変更はnotes・nextAction・updatedAtのみで、active／done=falseを保持。次はCommand／Shell／Battleの残存表示と、配備後の実OAuth・外部クライアント・実機受入へ進む。今回の接続検査は隔離HTTP Workerと差し替えProvider応答によるもので、実Google認証の受入ではない。


## Battle追加確認（2026-10-02）

- 実装と操作の回帰テストは全439件成功。実Chromeでは9言語×320／412／1024／1440pxの36条件、隔離HTTP Workerで通信中の重複操作・別クライアントの古いTurn・不完全応答・実行後の応答喪失・回復／永続性・勝利／敗北・読取失敗時の再試行・初期取得の不完全応答の6シナリオが成功。
- `tools/verify-relay-battle.mts`で画面とHTTPを再検証できる。記録は`.qa-artifacts/battle-matrix.log`／`battle-http.log`と`relay-battle/results.json`／`results-http.json`。検査中に起動タイムアウトが1回発生し、再実行した画面36条件は成功。HTTP用の状態包絡の参照ミスを修正して6シナリオ成功を確認した。
- 実Guilduo MCPでBattle状態取得→attackのdryRun→再取得を実行し、プレビューが成功して保存Turnは4のままと確認。実戦闘への書込みはしていない。これは配備済みMCPの読み取りとpreviewの確認であり、本候補GUIの配備・実OAuth／外部クライアント往復・実機受入は引き続き未完了。

- 最終型検査・デザイン検査・ビルド成功。公開用Chrome36条件、既存画面70、Human Relay32も成功。画像の目視で担当欄に別用途の説明文が入ることを見つけ、既存の担当ラベルへ修正して再確認。初期Battleの不完全応答も日本語・英語・ロシア語で明示エラーとなり、架空の数値・操作を出さない。実行結果が不明な間のHuman返信はsynthetic clickでも送信されず、再読取失敗時の操作排他とフォーカス回復を確認した。
- 最終記録は`battle-{tests,typecheck,design,build,matrix,http,browser-built,screens,human-relay}.log`と`relay-battle/results{,-http,-built}.json`。保存された画面条件は36／36、HTTPは6。全439テストの成功記録を保持し、API／MCP契約ファイルに差分はない。
- Guilduo MCPで親計画へBattle42／公開用36、画面70、Relay32を記録し、再取得でnotes／nextAction／updatedAtだけの変更とactive／done=falseを確認した。次はCommand／Shellの残存固定文・通知、配備後の実OAuth／外部クライアント／実機受入へ進む。

## Commandスマホと共通操作の追加確認（2026-10-02）

- スマホの見出し・確認・証拠・履歴・空状態・ARIAを9言語化し、件数・保持時間は既存ICU／Intlへ接続。同期表示を実際のsyncStateへ揃え、操作中の書込み保留を古いデータと混同しない。成果物のないQuestでは確認を無効化し、未検証のプレビューは理由を確認できる。
- 棚は単一Tab入口と矢印／Home／Endを使い、端の前後操作を無効化。選択後に隠れたPC要素へフォーカスが移る原因を共有選択処理で修正。開閉はaria-controls／hiddenを使い、フォーカスと棚の手動スクロールを再描画後も保持する。
- 無動作のその他操作と、選択肢のない作成矢印を除去。作成ボタン・アカウントメニューのラベルを翻訳。空状態の「Agent実行は継続」を中立のQuests案内へ変更。
- 実Chromeで英語320pxの見出しはみ出しと、最後の担当者だけ列がずれる原因を発見・修正。長い操作は既存トークンで折り返す。ドイツ語320px・ロシア語412pxは修正後の公開用画像も目視し、列位置・ボタン文字・開閉を再確認。
- ソース112／公開用ビルド78、既存画面70、全439テスト成功。最終型検査・デザイン検査・ビルドと差分検査も成功。証拠は`command-mobile-{tests,typecheck,design,build,browser,browser-built,screens}.log`、画像`command/chrome-{de,ru}-{320,412}-built.png`。失敗を検出した中間ログと画像は成功証拠に数えない。
- CommandのPC部品、productionモデルの言語変更追従、Shell通知の残存固定文は未完了。今回の結果を全画面翻訳・本候補配備・実OAuth／実機・外部クライアント受入とは扱わない。
- Guilduo MCPで親計画へ最新結果と次の行動を反映し、再取得でnotes／nextAction／updatedAtだけの変更とactive／done=falseを確認。担当・期限・依存関係・完了条件を保持した。

## Command PC・モデル・Shell通知の追加確認（2026-10-02）

- PCの固定UI・ARIA、状態・日付・保持時間・件数を9言語化。モデルのgetterをスプレッドで固定していた箇所を修正し、同じQuest・Actor・Blob参照のまま言語変更へ追従する。本人名「あなた」、Agent名、Quest本文・外部確認条件は保存データとして保持する。名前未設定時の本人表示だけを翻訳する。
- 完了済みのworking Handoffを実行中と表示しない。次の担当者を現在の担当と区別し、修正依頼の影響先を実Agentへ案内する。
- PCの成果物プレビュー・履歴・Loom開閉に安定した参照先とフォーカス復帰を置く。成果物行から閉じる場合も元の行へ戻し、コンパクトなLoom行にもQuest名・状態を残す。長い状態ラベルで棚見出しがはみ出す問題を折り返しで解消した。
- 棚の手動スクロール復元と自動整列の競合を除いた。初回表示・明示的な選択だけ整列し、再描画では同じ選択の手動位置を保持する。存在しないG thenショートカットのヒントを除去した。
- 保存中・成功・失敗通知を表示時に翻訳する。未知APIメッセージの生出力をやめ、既知のHandle制限・画像検証・応答未確認を保持する。実Workerに遅延・秘密を含む失敗応答を挟み、9言語とPC／スマホで操作保留・失敗表示・再試行による実保存を確認。PCのLensを閉じても中央で作業結果を読める。
- プロフィール保存成功・Handle制限・画像読込エラーが言語変更に追従し、入力と保存済みデータを保持することを実HTTPで確認。IME確定後の遅延再描画でQuest検索フォーカスが外れる問題は、既存の検索フォーカス復元を共通化して修正した。
- 全441テスト、Commandソース131／公開用ビルド96、既存画面70、ローンチ55／公開用40、操作アクセシビリティ404／公開用343成功。型・デザイン・ビルド成功。証拠は`command-desktop-{tests,typecheck,design,build,browser,browser-built,screens,launch,launch-built,accessibility}.log`。ドイツ語1024px／ロシア語1440pxのビルド画像を目視確認。失敗した中間ログや画像は成功証拠に数えない。
- 本候補は未配備。実Google認証、Codex／OpenClaw、物理Pixel 9、R2実環境、読み上げ、本番性能、公開ポリシー本文と運営窓口の受入は未完了。既存fixtureの保存本文・履歴は翻訳対象の固定UIとして数えない。
Guilduo MCPで本追加結果と次の受入を親計画へ保存し、再取得でnotes・nextAction・updatedAtだけの変更を確認。active／done=falseと受入条件を保持した。次の行動は候補レビュー・配備後の公式ポリシー、実認証／実機／外部クライアント・画像・読み上げ・性能・運営窓口の受入へ進めた。

## Workspace同期の追加確認（2026-10-02）

- 通常Questは初回表示後に再取得されず、他端末やMCPからの変更を再読込なしで取り込めなかった。表示中の30秒間隔、画面復帰、オンライン復帰、手動再取得へ接続した。編集ダイアログ・保存・IME変換中は自動再取得を延期する。同期中・初期再取得失敗・オフラインでは共通ガードで変更を止め、データは保持する。復旧は読取だけで行い、結果不明の書込みを繰り返さない。
- 初回取得も200件で止まっていた。既存cursorを最後まで読み、全ページが成功してから表示へ適用する。不正な配列・ID・重複Quest／cursorを明示エラーとし、途中の一覧を完全なデータとして適用しない。全207件のbootstrap／旧Worker fallbackと、不正応答をテストした。
- 再取得後も選択・検索・修正draft・プロフィールdraft・カーソル・画像Blob参照を保持する。選択Questのバージョンが変わった場合は以前の明示確認と操作結果を破棄し、修正draftは残す。同期／失敗中の作成・SettingsのAgent編集も無効化し、前回のAgent一覧をサインイン案内に置き換えない。再試行の成功後は同期操作または画面見出しへフォーカスを戻し、別の操作へ移った利用者のフォーカスを奪わない。
- 部分取得失敗では前回のプロフィール／Agentなどを残し、状態通知で再試行を案内する。Commandの同期表示も全取得済みと表示しない。破棄したShellではタイマーとイベントを解除し、遅い応答を適用しない。
- `npm run sync:verify -- http://127.0.0.1:5183`で隔離Chrome2クライアント＋実HTTP Workerの12シナリオ成功。双方向反映、編集延期、重複読取／書込拒否、offline／503回復、修正draftのカーソルと確認無効化、プロフィールdraft、部分取得失敗、破棄後の応答を検証。9言語×320／412pxの復旧表示と44px操作、200件を超える実QuestのPC再取得・スマホ初回取得と選択も確認した。Chrome2クライアントは物理Pixel 9や実Google認証の受入とは扱わない。
- 全442テスト、型検査、デザイン検査、ビルド成功。Command131／公開用96、既存画面70、ローンチ55／公開用40、操作アクセシビリティ404／公開用343成功。実HTTPの同期12はsource専用の検証用ページを使用する。`sync:verify`をCIの隔離Worker検査へ追加したが、リモートCIは未実行。
- 証拠は`.qa-artifacts/workspace-sync-{tests,typecheck,design,build,browser,command,command-built,screens,launch,launch-built,accessibility,accessibility-built}.log`と`workspace-sync/results.json`。ドイツ語320px／ロシア語412pxのoffline画面を目視確認。失敗した中間ログを成功証拠に数えない。API／MCP契約に差分はなく、本候補は未配備。公開前の受入と運営窓口は継続する。
- Guilduo MCPへ同期結果を反映し、再取得でnotes・nextAction・updatedAtだけの変更とactive／done=falseを確認した。

## 公式運営者と問い合わせ窓口（2026-10-02）

- ユーザー指定により運営者名をRadon、公開バグ報告を`https://github.com/ELRdn/Guilduo/issues`、個別問い合わせ・アカウント／データ削除依頼を`el2radon2official@gmail.com`へ確定。正本`PRIVACY.md`／`TERMS.md`と公開URLガイドへ反映した。Issuesは匿名読み取りでHTTP 200と公式リポジトリの見出しを確認した。メール送信やIssue投稿はしていない。
- ポリシーの既存静的生成へHTTPS／mailtoリンクの対応を追加し、引用符を含むHTMLのエスケープを保持した。運営者・連絡先の表示と実hrefはローンチ検査のJavaScript無効・320／1440px条件で確認した。本文リンクに下線を付け、個別窓口が本文に紛れないようにした。自己ホスト版の運営者は別の窓口を提供する。
- 全442テスト、型・デザイン・ビルド、ローンチ55／公開用40成功。記録は`operator-contact-{tests,typecheck,design,build,launch,launch-built}.log`と`launch/built/{privacy,terms}-contact-nojs.png`。320pxの公開用Privacyを目視確認。
- 公開配備、メール受付・本人確認・削除処理の運用と法的確認は未受入。掲載先の確定をこれらの完了に読み替えない。
- 最終公開用ビルドの下線付きリンクと本文を320pxで再撮影・目視し、ローンチ40条件成功を確認。Guilduo MCPの親計画へ窓口反映と次の受入を保存・再取得し、notes・nextAction・updatedAt以外の変更がないこととactive／done=falseを照合した。

## 実アプリ入口・認証・Human担当の追加確認（2026-10-02）

- 検証用Shell入口だけでは実Appwrite SDKから認証・同期・Shell破棄への接続を確認できなかった。entry:verifyを追加し、開発版と公開用の実アプリ入口で各11シナリオ成功。合成account／JWT／session応答以外のデータ読取・変更は隔離HTTP Workerへ渡し、想定外の外部通信は拒否する。二つの所有者を分離した。
- 共通アカウント正規化が欠落・空・空白・数値のIDを受け入れていた。非空文字列を必須とし、古い実装で失敗する検査を追加して修正を確認。アカウント確認前の先行データ表示を拒否し、JWTとaccountの所有者不一致では先行データ／tokenを捨て、確認済み本人のデータだけ表示する。401、503→再試行、合成OAuth callbackの単一session作成とURLからの資格情報除去、取得中のログアウト後の遅延応答・polling拒否も確認。
- 公開用の目視で本人担当が「自分→自分」の架空Relayとなり、両方を次の担当者と表示する問題を発見。同じ共通処理が別Human担当を本人に置き換えていた。非Agentは実担当者の一段だけとし、未着手／実行中／停止／確認／完了の状態を保持。別Humanの保存名を表示し、本人画像を流用しない。Agentの既存Relayは維持した。修正後の公開用412px画像を再撮影・目視確認。
- 二つの隔離Workerが共通のAgent検証tokenを使う衝突も、既存fixtureで所有者別tokenにして解消。両方のMCP読取成功と別所有者Questの読取拒否を検証した。検証fixtureの修正を本番認証の変更とは扱わない。
- 最終全444テスト、型・デザイン・ビルド成功。Command131／公開用96、画面70、修正後の同期12・Human Relay32も成功。証拠は上表のrelay-entry-*ログとrelay-entry{,-built}/results.json。ローンチ55／公開用40と操作404／公開用343は直前の成功記録を保持する。実入口検査をCIへ追加したが、リモートCIは未実行。
- 実SDKを通る検証でもaccount／JWT／sessionは合成応答であり、実Google OAuth・本番Appwrite／R2・物理Pixel 9・Codex／OpenClaw往復の受入は未完了。本候補の配備、ポリシー公開・受付運用・法的確認と本番性能のゲートを維持する。
- Guilduo MCPの親計画へ実入口・認証・担当者の修正と最新結果を171文字で保存し、再取得で照合。差分はnotes・updatedAtのみ。nextAction・担当・期限・依存関係・完了条件とactive／done=falseを保持した。

## 配備前ローンチ検査の追加確認（2026-10-02）

- CIの公開用preview、手動Site配備、タグ付きリリースへ既存launch:verifyを接続した。手動／タグ付きは本候補のビルド直後に隔離localhost previewを起動し、40条件が成功した後にだけ後続の本番操作へ進む。リモートmigration・upload・activationより前に置き、条件付き実行とcontinue-on-errorによる回避を設けない。既存のキャッシュ停止・旧asset保持・archive検査・Workerフラグ設定は維持する。
- WorkflowのYAMLを実parseし、ビルド後／公開処理前の位置・失敗保留なしを3ファイルで照合。localhostのHTTP 200アプリfallbackへ既存検査を実行し、Privacy本文の不一致で非0終了することを確認。成功statusだけで公開準備済みにしない。ローカル4条件成功、証拠はlaunch-gate-failure.logとlaunch-gate-results.json。
- Workflowと同じ4175番・strictPortの公開用previewで実ブラウザ40条件成功。Privacy／Termsの本文・canonical・Radon窓口リンク、JavaScript無効と320／1440px、9言語のサインイン・デモ復帰を確認。公開routing／release設定の既存16テストも成功。証拠はlaunch-gate-browser.log、launch-gate-contract-tests.log。起動した検証用previewは自分のsession handleで終了した。
- リモートCI・workflow dispatch・タグ作成・本番配備は実行していない。配備後の公式本文と窓口運用、実Google OAuth・物理Pixel 9・外部Agent往復・読み上げ・本番性能の受入は継続する。
- Guilduo MCPの親計画へ配備前検査の結果を178文字で追記・再取得。変更はnotes・updatedAtのみで、次の受入・完了条件・active／done=falseを保持した。デザイン整合・差分検査も成功。

## Questシートのモーダル隔離とAX確認（2026-10-02）

- 実Chromeのアクセシビリティツリーを日英×320／1440px×8画面の32条件で調査し、無名の操作・見出しやARIA参照切れはなかった。一方、スマホQuest Flowのaria-modalだけでは背面のQuests／Network／Partyが読み上げ対象に残り、背面button.focus()も成功していた。証拠はbrowser-ax/survey.json、sheet-before.json／sheet-after.json。
- 共通bottomSheetをnative dialogのshowModalへ変更し、背面を読み上げ・フォーカスから除いた。手製のdocument Escapeハンドラーをnative cancelへ置き換えた。ブラウザchromeへTabが出る動作は既存仕様に合わせてdialog内で両方向に循環させ、閉じる・Escape・scrim・選択・desktop resizeでnativeモーダルを解除する。破棄後のmicrotaskは開かない。
- 既存panel・scrim・tokens・motionは維持し、native dialogのUA余白とbackdropだけを既存表示に合わせて解除。320pxの修正前後画像を目視し、配置・色・内容を保持。修正後のAX treeでは背面3操作がなく、背面focus()も拒否される。DOMのaria-modal値だけでは成功にしない。
- 全444テスト、最終型・デザイン・ビルド成功。Commandソース154／公開用119、実アプリ入口ソース12／公開用12成功。既存検査へnativeモーダルの背面隔離・終了・resizeと9言語×320／412pxの実AX名を追加した。証拠はsheet-modal-{tests,typecheck-final,design,build,command-final,command-built,entry,entry-built}.logとbrowser-ax/sheet-{before,after}.png。大文字表示によるAX名の差とresizeの描画待ちは検査側で修正。開発版の修正入力で横はみ出しassertが1回失敗し、失敗時画像・要素寸法を加えた最終再実行は154成功。原因は未特定で、今回は再現せず、画像は生成されなかった。失敗した中間結果を成功に数えない。
- ひろなおからPCとPixel 9が使用可能との回答を受領。到達を確認したLAN上のローカル候補を案内し、実機のQuest Flowタップ／スクロール・TalkBackの背面隔離・閉じた後の復帰を依頼した。実機FBを受領し、Questの流れは「全然問題なし」との回答。一方、Commandだけ下部ナビがスクロールに追従しない不具合を報告（タップと画面切り替えは可能）。TalkBackを個別に実施したかは未確認。これはdemo fixtureの候補確認であり、実Google OAuth・本番データ同期・本番R2・Codex／OpenClawの往復の受入は別に残す。

## Pixel 9で報告されたCommand下部ナビ（2026-10-02）

- ひろなおの実機FB: 下部ナビはタップと切り替えができるが、Commandだけスクロールに追従しない。Questの流れは問題なし。実TalkBackの個別実施は未確認。
- Chromeのタッチ対応viewportで同じ文書スクロールを再現。915pxの画面で252pxスクロールするとnav下端が915pxから663pxへ移動した。高さ100%のShellからCommand本文がはみ出し、sticky navの追従範囲が切れていた。
- 共通スマホnavをfixedへ変更し、Command本文は自然な高さへ修正。判断バーとnavの実測高さに末尾余白を合わせ、言語・判断状態・画面回転でも最後の履歴を隠さない。ResizeObserverはShell破棄時に解除する。
- Commandソース157／公開用122成功。320×640・412×915・844×390のタッチ対応Chromeで実文書スクロール、nav位置と判断バー非重複、末尾履歴、タッチジェスチャーによるスクロール、Quests→Command往復、More→Settingsを検証。既存25 Commandテスト、実入口12／公開用12、公開用launch40、型・デザイン・ビルドも成功。全444テストの直前結果はsheet-modal-tests.logを保持し、今回のShell変更後に全体を再実行したとは扱わない。
- 証拠: nav-command-{source,built}-final.log、nav-command-tests.log、nav-entry{,-built}.log、nav-launch-built.log、nav-{typecheck,design,build}-final.log。nav-before.jsonとnav-after.json／pngで位置と表示を照合。ブラウザだけで元CSSへ戻したnav-regression.jsonでは252pxのずれが再発する。
- LANの同じ候補URLで再読込後のPixel 9確認を依頼済み。物理端末での修正受入は回答待ち。実認証・本番同期・外部Agent・読み上げ・本番性能と本候補配備は引き続き未完了。
- 共通navの影響は公開用の主要画面70条件でも成功（nav-screens-built.log）。検査の初回は公開用パスに未対応で開発URLのHTTPエラーになったため、既存の--built指定で正しいpathを選ぶ1行を追加して再実行した。最終型と差分検査も成功。Guilduo MCPの親計画・LP-R07はnotesとnextActionを更新し、再取得で変更がnotes／nextAction／updatedAtのみ、active・done=false・完了条件等の保持を確認した。


## commit・push・配備の依頼と統合候補（2026-10-02）

- ひろなおからcommit・push・本番反映の依頼を受領。最新main 0729f43070ce06bc0eeb803401af0df78b2aeca4のモバイル・実データ・配備chunk retry修正を独立worktreeへ統合。未公開のprepared transactionコード・テスト・設定は元の作業ツリーへ保持し、公開対象から除外。
- 全439テスト・型・デザイン・ビルド成功。従来の444結果は元の作業ツリーの記録で、transaction関連を除外し最新mainの追加テストを含む今回の公開候補とは件数が異なる。
- 公式rootとcompatibility pathのHTMLキャッシュはEXPIRED／HITで有効。既存Cloudflare API tokenはzoneの参照が可能だがrulesetsの読み取りはHTTP403。文書どおり両HTMLルール停止とDYNAMIC／BYPASS確認が配備前に必要。retention manifestはHTTP200 application/jsonを確認。


- PR #46をmain 5df20a938133e3cd034fa0e0465c792db56c87abへ統合。PR CI36967142686・main CI36967432960成功、Site配備36967433844成功。両HTMLキャッシュルールはひろなおが停止し、DYNAMICを確認。公開候補のCommand122・画面70・入口12・launch40・accessibility343成功。
- 配備後の実URL検査で、Cloudflare email obfuscationが公開メールをdata-cfemailとemail-protectionへ変換し、JavaScriptなしのmailtoが失われることを確認。静的policy本文へCloudflare標準のemail_offコメントを加え、built launch検査でも除外コメントが保たれることを検査する。本番の窓口再確認と新旧GUI起動、キャッシュ復帰は再配備後に続行する。


## Settings権限表示と無効MCP削除の本番配備（2026-10-02）

- `0936966`でSettingsの権限を接続ごとのQuest閲覧・更新可否へ整理。技術スコープと接続IDはnative detailsへ折りたたみ、無効MCPの削除を既存の接続解除・履歴削除APIへ接続した。AgentとQuestを保持し、不確定な失敗後は一覧の読取再試行を案内する。
- 全441テスト・型検査・デザイン検査・ビルド・launch40成功。1440px/390px・9言語・キーボード開閉・取消・旧リンク削除・再取得失敗・保存保持を実Chromeと隔離Workerで確認。Linuxの検査期待値だけがOS言語へ依存する問題を`085f747`で修正し、CI run `36988262174`は成功。
- ひろなおのGOとキャッシュ停止確認後、公開HTMLのDYNAMICを確認。Site配備run `36990716820`は`085f7479b6f18b94104bfe9ce65c6e914cae96dd`で成功。正式rootと互換pathは新`relayForge-BY0c1eq4.js`を配信している。
- 配備前のHTMLと旧画面検証用HTMLのSHA-256を照合。旧asset74件のMIME・サイズ・SHA-256一致、新旧画面の起動とナビ、正式rootのサインイン画面、4つのPrivacy/Terms公開URLを確認。証拠: `.qa-artifacts/settings-live-release-results.json`、`settings-live-release.log`、`settings-deploy.log`。
- 実際に配信されたHTML/JSを使った1440px/390pxのSettings検査も成功。合成Appwrite認証と隔離ローカルWorkerだけを使い、再接続なし削除・Agent/Quest保持・再読込を確認した。本番個人データの削除や実Google認証の追加受入ではない。証拠: 元checkoutの`.qa-artifacts/published-settings/results.json`と`1440.png`、`390.png`。
- キャッシュ停止確認から240秒以上経過し、新旧起動と旧asset保持を確認したため、両キャッシュルールを設定値を変えず復帰する操作を依頼済み。復帰と最終配信確認は回答待ち。
