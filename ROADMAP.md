# Guilduo 公開βロードマップ

- [x] 2026-10-10 14:48 JST：DSH beta.16ソースと現在の英日README／How-to／公開受入台帳を[PR #54](https://github.com/ELRdn/Guilduo/pull/54)でGitHub mainへ反映。CI成功、公開7ページHTTP 200。[公開票](.qa-artifacts/guilduo-dsh-lifetime-beta16/github-publication.json)。npm README差し替えには別版が必要で、今回はlatest=beta.16を維持。

- [x] 2026-10-10 本人追確認：DSH beta.16の公開OAuth・MCP読み書き・Desktop再起動後の保存認証再利用が成功。追加開発は停止し、README／How-to／現行受入台帳を更新。設定なし新規／fork・Agent紐付け／Handoff・限定更新readback／競合・Human回答→再開は残件。npm最新タグはbeta.16を維持し、GitHub反映は別記録。[現行状況](docs/guilduo-dsh-status.md)。

- [x] 2026-10-10 14:15 JST：DSH beta.16をnpm `latest`へ昇格（`beta`もbeta.16）。registry／公開tgzの凍結byte一致を再確認。[昇格票](.qa-artifacts/guilduo-dsh-lifetime-beta16/latest-promotion.json)。本人報告で公開OAuth・MCP発見・context読取が成功。保存後の再起動復元・設定なし新規／fork・別Desktop・Quest／Human往復は未受入。[記録](docs/guilduo-dsh-acceptance.md#2026-10-10-1409-jst-user-reported-public-oauth-acceptance)。以下のタグ記録は各時点の履歴。

- [x] 2026-10-10: DSH beta.16候補で認証消失経路と保存途中の接続済み誤判定を修正。native会話離脱は保存認証を消さず、旧grantの明示切断は正確なsourceを削除する。Skill改名も同梱。実際のbeta.14消失原因は未確定、beta.16は09:45 JSTにnpm公開・公開tgz照合済み（beta=beta.16、latest=beta.10）。実OAuthは別工程。[公開確認票](.qa-artifacts/guilduo-dsh-lifetime-beta16/publication.json)。[受入記録](docs/guilduo-dsh-acceptance.md#2026-10-10-beta16-grant-lifetime-fix)

- [x] 2026-10-10: Skill `questforge-workflows` → `guilduo-workflows` の改名を実装・ローカル検証。13配布archive一致とDSH／OpenCode／OpenClawのbeta.14→15実更新・新名だけの発見・設定保持・削除を確認。現行正本は `skills/guilduo-workflows/`、基盤manifest候補はbeta.11、次のDSH／OpenCode／OpenClaw beta.15は未公開。新Skill名のみ配布し、既存利用者は新版plugin更新→再起動、旧standaloneは本人が削除／置換する。OAuth／MCP／package／plugin／storage IDと旧配布物・検査証拠を保持し、実設定は自動変更しない。以下beta.14等の検査は当時の旧Skill名の履歴で、pending受入を閉じない。[最小移行契約](docs/guilduo-workflows-migration.md)

- [x] OpenCode beta.14拡張を実装・検証。標準OAuth／Skillと任意フェーズ補助を使い、MCP別名・利用者コマンド・他プラグインを保持する。専用フォルダーでの導入・更新・削除、1.18.32／1.18.35の合成OAuth・再起動・refreshを確認。[導入](plugins/guilduo-opencode/README.jp.md)・[受入記録](docs/guilduo-opencode-native-evidence.md)。npm／公開OAuth／Human往復は別工程。
- [x] OpenClaw beta.14拡張を実装・検証。標準MCP OAuth／SkillとSettings・Accountsの導線を使い、既存設定を保持する。固定版2026.9.9で導入・更新・削除、合成OAuth・保存・refresh／rotationを確認。[導入](plugins/guilduo-openclaw/README.jp.md)・[受入記録](docs/guilduo-openclaw-native-evidence.md)。公開／実ブラウザーUI／複数利用者channelの受入は別工程。

- [x] DSH beta.14共有認証を実装し、合成認証によるローカル検証を通過。[最終ローカル票](.qa-artifacts/guilduo-dsh-shared-beta14/validation.json)はPASS_LOCAL_RELEASE、75/75 package tests・2/2 root package tests・型／build／design成功、scoped review残存P1/P2なし。[最終native 7/7 PASS](.qa-artifacts/guilduo-dsh-shared-beta14/native-DhY3W3/evidence.json)は現行compiled hash一致。Windows・同じuser／`DSH_HOME`の通常／新規／root fork共有、subagent／runtime child／独立seeded拒否、元会話「全会話で使う」の参照移行、全体切断tombstone・旧grant fallback禁止、共有元削除保持、初回組立前awaited復元・選択status・15秒上限を実装。scope／Free2・catalog1つは不変、暗黙OAuth／推論なし。DPAPIは同じuserの保存保護、native Credentialsのプロセス間検証は履歴writerの安全性を証明しない。[最終UI集約票](.qa-artifacts/guilduo-dsh-shared-beta14/native-final-records-20261009-230829-212.json)はbrowser／carrier・Settings6並列PASS、現行hash一致。README永久凍結後の再pack・[隔離CLI beta.13→beta.14 upgrade等18検査](.qa-artifacts/guilduo-dsh-host/install-8gGvdY/evidence.json)はPASS、32ファイル全byte一致（tgz SHA-256 `43585b8d33ea5d2e4da8cde599d5302b60130834e9795f0f5f6eb1fe97b255ed`）。2026-10-10 08:22 JSTにbeta.14をnpm公開・公開配布物を照合済み。beta tagはbeta.14、latestはbeta.10を維持し、公開tgzの全byte／SHA-256／registry integrityが検証済みarchiveと一致。[公開確認票](.qa-artifacts/guilduo-dsh-shared-beta14/publication.json)。旧Web／Desktopを停止して更新し、registryからbeta.14を導入できる。実公開OAuth／WebDesktop／Human未受入、[受入](docs/guilduo-dsh-acceptance.md#2026-10-09-beta14-shared-plan-candidate)。以下beta.13以前の公開・検査・導入コマンドは当時の履歴。

- [x] 2026-10-09 19:31 JST: DSH接続修正版beta.13をnpm公開し、beta tagと公開tgzの全byte／integrity一致を確認。[公開票](.qa-artifacts/guilduo-dsh-settings-beta13/publication.json)。実Desktop OAuthは更新後の本人受入待ち。

- [x] DSH beta.13: 実DesktopのOAuth開始前エラーをCordis兄弟サービスで再現し、親plugin／両bundleの依存注入を修正。回帰テストとnative Settings／Chrome合成認証を検査。[記録](docs/guilduo-dsh-acceptance.md#2026-10-09-beta13-real-host-injection-fix)。実Desktop公開OAuth・Human往復は未受入。

最終更新: 2026-10-08

## 2026-10-08: 最初のHuman ⇄ Agent往復を市場へ届ける

「3プロジェクト徹底監査・統合ローンチ戦略」（調査基準日2026-10-08）からGuilduoの戦略・実行計画だけを反映した。重点は**複数AIと人間をまたぐ依頼・証拠・判断・引き継ぎ**。新機能より、初見の個人開発者が最初の往復を完走できることを優先する。[詳細・12週間の目安・市場検証基準](docs/launch-roadmap.md#strategy-20261008)を正本とする。

| 順序 | 優先する仕事 | 完了・判断の基準 |
| --- | --- | --- |
| 1 | 新機能を一時Freezeし、実Google／PC⇄Pixel 9／TalkBack・Codex往復を受け入れる | 既存LA-01〜06の対象版と実証拠。ローカルPASS・配備・実受入を分ける |
| 2 | Home／Quests／Party／Connections中心の初回導線 | 既存画面を再利用し、他機能はAdvanced／Moreへ。サンプル依頼→証拠→Human判断→再開→完了を実行できる |
| 3 | 導入Docs・45秒Demo・GitHub Homepage／Topics | 実受入済みクライアントと制限を案内。設定・外部公開の結果を記録 |
| 4 | Design Partner候補15人、最初の5人から計10人以上を個別導入 | TTV・離脱・支援・翌週再利用・支払意思を記録し、上位3件の詰まりを修正。募集送信は本人の指示後 |
| 5 | 市場検証と既存21工程の公開Goを別々に判定 | 10人以上の実E2E、Activation≥60%、TTV中央値≤15分、成熟したActivation起点D7≥30%、重大バグ0、課金意思3人以上を初期目標にする |
| 6 | 受入後に段階告知・実72時間・継続利用を観測 | X／GitHub→Product Hunt→Show HN→Reddit→YouTube。初週は接続失敗と導線の修正を優先 |
| 7 | 広告は需要確認後に有限試行 | Activation30人・翌週利用10人・課金意思3人・実課金2人を開始目標にし、AD-01の予算／停止条件／Goも必要 |

料金は承認済みのFree登録2Agent／Pro登録無制限、月USD10／年USD96、月1,000 Credits・30日、紹介100 Credits、金額割引なしを保持する。資料のFounding割引・Pro追加機能・無料β先行は現契約へ自動採用しない。商用Jev予算は日本時間10月6日〜11月5日の総額USD5で、広告予算とは別。

指標の中心候補は **Weekly Reviewed Human↔Agent Handoffs**。登録数・Agent数・Star数は補助指標にする。承認済みActivation「実接続→保存されたQuest依頼→Human回答→Agent再開」と最終Quest完了を分け、D7・12週間の目安・実72時間を今日の実装完了と混同しない。

- [x] Guilduo関連の監査を既存LA／BM／ADへ対応付け、戦略・市場検証・停止判断を追記
- [ ] 実Google／Pixel 9／TalkBack・実MCP往復と対象版の公開受入
- [ ] 初回4画面導線・Docs／Demo・Design Partner試行と需要確認
- [ ] 正式公開・段階告知・実72時間観測。今回の更新は計画で、実施結果は[確認記録](docs/launch-readiness.md)で管理する

## 2026-10-06: マルチ環境プラグインの実装・受入

共通MCP＋共通Workflow SkillからOpenAI、Claude、xAI Grok Bot、Meta Muse Code、Piの配布物を生成し、任意の終了時補助を環境別に追加する。**2026-10-09の指示でDSH標準CLI導入とnpm配布準備を最優先**へ変更。既存の固定版・セッション認証PoCを利用し、本人login／実OAuth受入は次工程に分ける。詳細・固定版・工数・環境別台帳は[プラグインロードマップ](docs/guilduo-plugin-roadmap.md)、導入は[setup](docs/guilduo-plugin-setup.md)、審査は[submission](docs/guilduo-plugin-submission.md)を正本とする。

- [x] 六環境の対応範囲、実受入台帳、正例5／負例3の実行票、資格情報を含めない証拠・提出手順を文書化
- [x] P0のHTTP／JSON-RPC／schema・単独Agent失効境界を統合し、親担当の隔離ローカル検査28件成功。変更tool 29件の確認用annotationとcatalogを同期（実OAuth・配備は別）
- [x] P0夜間追加: OAuth同時消費・失効／再認可の競合、Unicode進捗メモ、生成metadata hardlink破壊を修正。全体687件、DSH隔離12件、build・Worker dry-run、現行11archive／正本hash一致成功（未配備。最終型検査は統合証拠へ記録）
- [x] beta.10: 五環境の配布物、Claude／Muse任意Stop、Pi任意Extension、DSH固定版OAuth PoC tgz、公開OpenAI ZIPを生成
- [x] 既存OpenAI接続で受入fixture作成・codex割当・読み戻し。cached update_questにexpectedUpdatedAtがなく進捗受入は保留
- [x] 隔離native導入: Codex 0.159.2、Claude 2.1.286（59検査）、Muse stable 1.4.3、Pi 1.0.4、DSH 0.2.0-rc.2。更新・disable・remove等と実利用設定保持を確認。Muse native argv／Claude .hooks cacheを修正、Pi native engine 7条件通過（provider応答は合成）
- [x] 実SDK→候補Workerのloopback HTTP／OAuth／限定更新・読み戻しを検証。既存配備接続には実Human確認Questを作成・読み戻し、本人回答pendingを確認。公開OAuth／Human往復／実モデル同期とは区別
- [x] 2026-10-08: 審査用の束と実受入コマンドを実装。11archive／56ツール／正例5・負例3の草案を収録し、専用fixtureの安全な限定更新・不明応答・無更新・Human状態読取を隔離検証。実接続は旧schema／Human pending、配備guardはdirty tree拒否。次の操作とDSH不足契約は[受入引継ぎ](docs/guilduo-plugin-acceptance-handoff.md)へ集約
- [ ] P1: OpenAIの実同期、Claude・Piの実Skill／OAuth／更新／Human往復を受入
- [ ] P2: Grok Bot・Muse stableの実導入／OAuth／更新／Human往復を受入
- [ ] P3: Claude／Muse Stop、Pi終了Extensionの1回継続・再開／fork／cwd変更・撤回を実受入
- [ ] 並行: OpenAI実ケース／動画／domain／scan、Claude connector＋bundleの別提出、Grok掲載経路を確認
- [x] 最優先: DSH `0.2.0-rc.2`の標準`plugin --profile <name> add`／同tgz再導入／list／削除と既存設定保持を確認。実CLI 16検査・関連10テスト成功。本人のpublishで発生したEPRIVATEを修正し、実験用betaとしてprivate削除・再pack・公開dry-run成功。[最新票](.qa-artifacts/guilduo-dsh-publish-ready/validation.json)。npm実公開・別version upgradeは未確認
- [x] 2026-10-09 07:14 JST: 本人がnpmの実験用PoC `@guilduo/dsh-oauth-poc@0.6.0-beta.10`を公開。処理中404の後、公開package／version／tgzが200、beta／latest tagと手元archiveの全byte一致を確認。[公開確認票](.qa-artifacts/guilduo-dsh-publish-ready/publication.json)。実OAuth／Human受入とは別
- [x] 2026-10-09: DSHだけbeta.11候補へ更新し、Web／Desktop共通「設定 → Guilduo」の接続・状態・切断、会話ごとの認証、loopback callbackと終了処理を実装。32テスト・型／build・native認証carrier＋合成接続往復成功。[DSH受入](docs/guilduo-dsh-acceptance.md)。新version公開・実Web／Desktop公開OAuth・Human受入は未完了
- [x] 同候補の実CLI beta.10→beta.11 upgrade／再導入／削除、既存設定保持、29梱包ファイル一致、実ClientModuleRegistry／ModuleLoader発見成功。Desktop配布ASARのConnection／Gateway一致と外部リンク・cookie境界を合成検証、npm公開dry-run成功。[beta.11候補票](.qa-artifacts/guilduo-dsh-settings-beta11/validation.json)。実profile・実ブラウザー・npm公開は未操作
- [ ] 次工程: DSHの本人login／callbackを接続し、セッションOAuthと更新・Human往復を確認。実験用beta公開と一般配布の受入を分ける。初期Stop・資格情報永続保存・モデル実行なし
- [x] 追加対象OpenCode: 独立package beta.11候補に標準OAuth MCP・正本Skill・既存設定保持・任意の有限phase checkを実装。9件のhook隔離テストと型／build、2件の正本検査、14梱包ファイル一致成功。[導入](plugins/guilduo-opencode/README.md)・[native記録](docs/guilduo-opencode-native-evidence.md)。npm公開・実OAuth／Human往復は別
- [ ] 最新順序はDSH → OpenCode → Grok／ChatGPT／Claude。DSHのWindows保護付き認証永続化・npm公開は完了。次に各環境の実OAuth／Human受入を記録する
- [x] DSH beta.12: Windows CurrentUser DPAPI＋native Credentials、exact Session復元、atomic refresh、明示切断／削除、通常unload保持を実装。43隔離テスト・型／build・native合成ファイル再起動／SDK refresh検証成功。32梱包ファイル一致。[最新票](.qa-artifacts/guilduo-dsh-settings-beta12/validation.json)。実profile再起動・公開OAuth／Humanは未受入
- [x] 2026-10-09 08:27 JST: DSH `@guilduo/dsh-oauth-poc@0.6.0-beta.12`のnpm公開成功。公開version・beta tag・配布tgz全byte／integrity一致を確認。[公開確認票](.qa-artifacts/guilduo-dsh-settings-beta12/publication.json)。`latest`はbeta.10を維持。実OAuth／Human受入は別

OpenAI beta.9の以前のローカル導入・公開ZIP記録はあるが、新候補の実同期と公開審査は未完了。他環境の公開コード・仕様調査を実OAuth受入へ読み替えない。**構築／ローカル検査 → 接続 → 更新・Human往復 → 自発同期 → 配布・掲載**を別々に記録し、Submit・承認・Publishも分ける。Freeの登録2Agent制限と通常MCP CRUD／Quest／HandoffのCredit消費0を維持する。

## 2026-10-06: 実装・独立レビュー・再検証

今日の対象は、既存候補の公開阻害不具合を修正し、ローンチ判断に使える検証記録を揃えること。実装担当と独立レビュー担当を分離し、発見した欠陥を詳細計画へ追加して修正・再検証する。21工程の実受入条件は維持し、告知後72時間の観察は公開後に実時間で行う。

- [x] 現候補の604テスト・型検査を新規実行し成功を確認
- [x] LA-01: migration比較に必要なGit履歴をWorker／Release workflowへ取得し、不明な署名ゲートの拒否を修正。修正前の2条件失敗／修正後10条件成功
- [x] LA-06: R2 key／metadata／SHA-256の復元と破損拒否、計測削除時の業務／別owner／金融記録保持を強化
- [x] LA-01／13／16: 課金・計測・復旧・Battle／Connections検査をCIへ接続し、公開用計測検査のWindows path aliasを修正。リモートCIは未実行
- [x] LA-05候補: native dynamic importで入口564.05→215.43kB、未認証Shell／production取得0、入口12条件成功。本番性能の受入は別途残る
- [x] 独立レビューのP1 3件・P2 1件を修正、指摘closed。統合630件／型／design成功。候補資料を更新しhashを保存（実受入／公開Goは未完了）
- [x] LA-13／14: 同意撤回後の遅延保存の再清掃、Test／Live支払投影の分離を修正。回帰検査17/17成功、独立再レビューで当該指摘closed
- [x] BM-03候補: 予約済み・送信前中断を台帳照合＋CASで回復。実D1の競合／再中断を含む関連44件成功
- [x] BM-03追加レビュー: 予約batchをdecision CASで保護し、Credit予約未成立と台帳履歴の不存在を確定した場合は元予算だけ回復。実D1関連48件、統合630件／型検査成功
- [x] 商用予算: 日本時間10月6日〜11月5日の総額USD5をLive候補へ反映し、期間境界／mode分離を隔離検査。外部未適用

最新の対象・証拠・外部残件は[詳細計画](docs/launch-roadmap.md)と[確認記録](docs/launch-readiness.md)に残す。公開Appは今回確認した候補と別バンドルで、今回の変更は未配備。

## ローンチ・計測・広告開始の増設計画（2026-10-04）

目標は**実利用・商品・ファネル計測の受入 → 正式Release → 告知 → 実72時間確認**。既存LA-01〜10／BM-01〜05に、対象・測定定義・同意／帰属・採取／集計・初回体験／継続・公開耐性のLA-11〜16を加え、21工程へ拡張した。少額広告AD-01と拡大AD-02は公開後の別判定。[詳細計画・依存関係・完了条件](docs/launch-roadmap.md)を正本とする。2026-10-04に21工程ガード、別同意のファネル採取／集計、商用Jev予算分離を候補へ実装。実受入・新規Quest登録・配備・出稿は未実施。

| 順序 | 作業 | 完了の判断 |
| --- | --- | --- |
| 1 | LA-01 ソース／main／CI／配備順の整合、LA-06 プライバシー・受付・復旧運用 | リリース対象SHA、D1→Worker→Siteの経路、運用手順と証拠 |
| 2 | LA-02 実Google認証・PC⇄Pixel 9、LA-03 Chat／Codex／Dots共有MCP、LA-05 本番性能 | 実環境の記録、権限・保存・操作・速度の受入 |
| 3 | LA-04 既存LP-R07の実Human往復、LA-15 初見Activation／継続、LA-07 入口・README・公開ブランド | 人→Agent→人→FB→再開、実参加者の初回体験、公開資料と実装の一致 |
| 並行する商品工程 | BM-01 商品/料金/公式Jev検証 → BM-02 決済/利用権 → BM-03 有料機能/Credit台帳 → BM-04 採用した特典/紹介 → BM-05 請求画面/運営照合 | Free登録2Agent・Pro登録無制限、商品/商用予算・Test/Liveを受入。通常MCP CRUD消費0 |
| 追加する計測工程 | LA-11 対象・価値 → LA-12 測定契約 → LA-13 同意/帰属/識別 → LA-14 正式導線/集計 | 広告→LP→新規登録と、Activation／継続／初回支払を測る。既存匿名計測だけでは未達 |
| 並行する公開耐性 | LA-16 負荷・悪用対策・原価上限・運営能力 | 予算/停止/復旧と証拠。21工程ガードはローカル実装済み。署名付き対象候補と本番運営の受入は未完了 |
| 4 | LA-08 Go/No-Go・正式タグ／GitHub Release、LA-09 既存告知Quest | 先行条件の成功、重大未解決0件、Release／承認済み告知のURL |
| 5 | LA-10 告知後72時間の稼働確認・残件引継ぎ | 開始／24h／48h／72hの記録と運営者の最終確認 |
| 公開後 | AD-01 有限の少額広告 → AD-02 成熟コホートと実原価から拡大判断 | 予算/期間/停止条件/掲載内容の承認、実費・継続・純有料化・CAC。D7/D30を72時間で確定しない |

- [x] 親Quest「[LAUNCH] Guilduo公開βのローンチを完了する」と新規13件を登録し、既存LP-R07・告知Questの2件を再利用
- [x] 全工程の依存関係・完了条件・次の行動を定義。新規は期限未設定のbacklog、既存の担当・期限・親子関係・完了条件は保持
- [x] 21工程ガード・別同意計測・保存イベント・成熟集計・商用Jev予算分離をローカル実装
- [ ] LA-11〜16の外部Quest登録と実受入。AD-01/02は別の獲得マイルストーン
- [ ] LA-01〜16・BM-01〜05を実行し、実施結果を[ローンチ確認記録](docs/launch-readiness.md)へ残す
- [ ] 全条件の証拠が揃った後、親Questを完了する。登録だけでは作業完了にしない

親Quest: `quest-ba3ec85b-2a82-45c5-bef2-cb57c0bc5826`。まずLA-11/12の価値・測定定義と、LA-01・LA-06・BM-01を並行する。公式TypeSafe Jevへ直接接続しLuna/OpenRouterは今回対象外。Stripe Test run9は14/14 PASSだが、2026-10-04に月USD10/年USD96・月1000 Credits／30日・紹介100・割引なしを本人採用し、測定契約も承認済み。商用予算は2026-10-06に採用済み。税/返金例外・商用Jev実受入・販売資格・Live/本番Goは残る。[商品判断票](docs/launch-product-decisions.md)を使う。無料β先行は明示決定と改訂を必要とし、課金を完了扱いにしない。GitHubの再公開は不要。外部Provider拡張・Agent自動起動・ネイティブアプリは別計画とする。

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
- DeepSeek Harness、OpenClaw、Hermesなどは外部Execution Planeとして扱い、GuilduoはRemote MCP、Skill、Agent Registry、Handoff、権限を提供する。DSHの固定版OAuthアダプターは仕様更新後の隔離PoCに限定し、ルートアプリや公開βへHarness依存・モデルAPIキーを持ち込まない。[環境別の境界](docs/guilduo-plugin-roadmap.md)

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
- Guilduo Workflow Skill（Skill名: `guilduo-workflows`、旧名は移行前の履歴）、ローカルCLI、Codex Plugin/MCP App登録準備パッケージ
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

既存の運用・連携改善と並行し、プロダクト改善は上記LP-R01〜LP-R07の双方向Relayを優先する。2026-10-08の戦略更新では、初週の接続・初回往復・再利用の改善を先に行い、以下の追加連携は実需要を確認してから進める。外部OAuthの再開やAgent自動起動を、この流れの前提条件にはしない。

1. 同期エラー、MCP接続、初回Quest完了率を匿名同意制で監視
2. 9言語の長文・日付・複数形を実ユーザー環境で補正
3. Google Calendar読み取り、Google Tasks、Notion、Togglの順にEarly Accessを段階再開
4. OpenClaw、Hermes、Gemini CLI向けレシピを利用実績に合わせて更新
5. OpenAIレビュー後にMCP Appの登録IDと公開導線を確定
6. 90日間のReviewed Handoffs、Activation、TTV、成熟D7／D30、実支払／返金・原価を測定し、利用者数・MCP接続数・Agent登録数・GitHub Star/Forkは補助指標にする

「OpenClawの半分程度のバズ」は保証条件ではなく、90日間の成長目標として扱う。


- [x] Pixel 9で報告されたCommand下部ナビのスクロール追従をローカル修正。固定nav・自然な本文高さ・実測末尾余白とタッチChrome3サイズを検証。実機再確認は回答待ち。
