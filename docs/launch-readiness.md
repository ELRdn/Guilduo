# Guilduo ローンチ確認記録

## 現在：独立レビューを伴う品質改善（2026-10-06）

追加P2修正と並行回帰まで統合した現候補は、全体**630/630 PASS、fail／skip 0**、標準型検査（259 source files）成功。private証拠は`.qa-artifacts/launch-20261006-{tests,typecheck}-integrated.log`。直前の625/625成功とbuild成功は`launch-20261006-{tests,typecheck,build}-final.log`へ保持。追加修正はWorker／テストだけで、Web bundleは変更していない。design:checkも成功（`launch-20261006-design-final.log`）。開始時点の604/604と256ファイルの成功は`launch-20261006-{tests,typecheck}.log`へ履歴として保持する。未コミット差分を保持し、Git統合・配備は未実施。以後の追加修正へPASSを自動継承しない。

- 本人判断: 10月6日〜11月5日（日本時間、両日含む31日間）の商用Jev総額USD5を採用。Live候補へ一度だけ割当、Test二重配分なし。既存parserで開始／終了境界・mode分離・停止設定を隔離検査し成功。`.qa-artifacts/launch-20261006/{approved-decisions,budget-draft-verification}.json`。本人は準備後の実機確認へ参加する。商用実受入・運営条件・Live／本番Goは残る。
- 実機準備: private `launch-20261006/device-acceptance.md`へPC／Pixel9／TalkBackの短い手順と未実施表を用意。候補Webをlocalhost:5173で起動し、公開Workerとの組合せで検査する範囲を明記。端末は現在USB未接続。検査用Chromeの既定DNSでは名前解決に失敗し、AsyncDns／DnsOverHttpsを無効にした隔離Chromeで実Appwriteの401とGoogleボタンを確認。OS経由の通信も401／localhost CORS成功。設定変更・本人認証は未実施。

- 公開ガード: shallow checkoutと未知ゲートの2条件が修正前に失敗。Worker／Releaseのfull history取得、`Object.hasOwn`で修正後10/10成功。`launch-20261006-gates{,-before}.log`。
- 最終公開用入口12、launch40、アクセシビリティ343、Battle／Connections各36成功。`launch-20261006-{entry,launch,accessibility,battle,connections}-final.log`。課金source／built・9言語×320／412／1440は`launch-20261006-billing-browser.log`で成功。認証／決済／Jevは合成／隔離環境であり実Google／Live／Provider受入ではない。
- 計測built検査はWindows aliasと実rootの不一致でbuild失敗を再現。`launch-20261006-analytics-built.log`を保持し、既存ビルドと同じroot正規化へ修正。source31、修正後built31、同意競合修正後built31成功。`launch-20261006-{analytics-source,analytics-built-fixed,analytics-final}.log`。
- 読取だけの公開確認: 正式LP／App／Docs／MCP health・metadataは200、不存在Docsは404。公開Appは`relayForge-BY0c1eq4.js`、healthはAPI2.7.0／schema7／56 MCPツール。wwwはこの端末で`ENOTFOUND`。`launch-20261006-public-readonly.json`。公開候補との一致・本番機能受入は未成立。
- サブエージェントを復旧実装、候補CI検査、初期JavaScript改善、Jev予約回復、独立課金・権限レビューへ分離。独立レビューでP1を3件・P2を1件発見し以下を修正。最終独立再レビューで当該指摘closed。Jev回復・計測競合・入口認証の対象範囲に未解決P1／P2なし。独立側はSQL SELECT 24条件と実関数＋モックを検査、実D148件／計測18件は担当実行として区別。private `launch-20261006/independent-review.json`へ報告を保存。

| 発見・修正 | 新規検証と限界 |
| --- | --- |
| 同意撤回・清掃後のQuest遅延保存で古い計測outboxが復活 | 各mutation試行で同意を読む。保存後と停止中bootstrapで失効outboxを永続再清掃し、古い並行清掃による再依頼消去も防ぐ。実state保存を使う回帰は修正前失敗／修正後17/17成功。`launch-20261006-privacy-{before,fixed}.log` |
| Test決済がLive計測へ混入 | 共通支払投影で既存billing modeとsubject environmentを一致させる。両方向の不一致拒否・一致時の投影を上記回帰で検査。実Stripe資源は変更していない |
| Jev予約後・送信前の中断が409で回復不能 | 台帳のowner／mode／ID／amount／statusを照合しCASで未送信を排他的に確定。Credit返却と元の予算期間だけの解放。実workerd D1 bindingの中断／競合／再中断を含む全体630テストで成功。送信済み・結果不明・証拠欠落は保持し、Provider呼出しはしない |
| Jev予算確保後・Credit予約未成立の失敗が回復不能 | 予約batchのaccount CASをdecision CASで保護。予約・台帳履歴の不存在を確定した場合はCredit処理せず元予算だけ解放。実D1で予約失敗・batch前後のsender競合・精算再中断を確認。Jev関連48件／統合630件成功、Provider呼出し0 |
| 古い計測清掃のDELETEが同時刻の新retryを消す競合 | 古いDELETEを止め、同clockの遅延保存と再queue／再削除中断を発生させ、古いDELETE後にもretryを保持。monotonic版本を外した旧条件で失敗、修正後18/18成功。`launch-20261006-privacy-race{,-before}.log` |
| 初回入口のJS量 | `relayForge`単一entryは564.05kB／gzip177.70→215.43kB／gzip78.98。Shell317.13kB／production33.45kBをnative dynamic importへ分離。総ダウンロード量や本番体感速度の改善率ではない。最終buildの500kB警告は0。`launch-20261006-build{,-final}.log` |
| 遅延読込中の認証失効 | auth observerと読込世代を分離。現在observerのsigned-out／connection-error／checking／oauth-failedがimport／runtime／mountの各時点で遅延結果を破棄し、mount後はunmountする。実入口12とunit回帰成功。未認証Chromeは9script取得、Shell／production取得0、pageerror0。`launch-20261006-entry-chunks.json` |
| 復旧・任意削除 | R2のmanifest key／content-type／SHA-256とbytesを保存して復元。合成の非空Credit台帳6／lot4／予約2／紹介2／Stripeイベント2／account2を保持し、破損・金融消失の失敗注入で拒否。`operations/latest.json`と全体625テスト。実ストア復元・全アカウント削除・rollbackは未受入 |
| 継続検証 | CIへ課金・計測source／built・復旧drill・Battle／Connectionsを接続。Bashの9検査へ失敗注入し後続停止を確認。sourceの自己起動fixtureをdev前に実行し、Viteキャッシュ競合を避ける。Ubuntu／Node22のリモートCIは未実行 |

同意修正後の隔離同期15／Human往復34成功（`launch-20261006-{sync,human}-fixed.log`）。先の並行fixture buildでVite依存キャッシュが失効し504になった失敗は元ログに保持し、自己起動fixture完了→`dev --force`再起動→順次検査で回復した。実API契約は再生成の前後SHA-256一致、MCP56ツール維持（`launch-20261006-api.log`）。最終公開用日本語サインイン412pxは目視確認し、既存表示を維持。

**公開前残件:** 630テストを実Google・PC⇄物理Pixel9／TalkBack・実MCP／Human・本番性能／復旧・販売資格／税・商用予算の受入へ代用しない。対象commit／remote CI／署名Goは未成立。公式www DNSは本端末で未解決。正式Release／告知／実72時間は未実行。今回の公開・Live・外部Quest登録・広告・監視・Git状態変更はない。

## 履歴：21工程のローカル実装・本人採用条件（2026-10-04）

**ローカル候補を拡張し検証。ローンチは未完了。** ひろなおは対象／Activation定義、月USD10／年USD96・Jev1件1Credit・月1000／30日・紹介100・金額割引なし、および測定契約（Activation7日・有料化30日・D1/D7/D30・別同意・90日終了／削除再試行）を直接回答で採用した。当時、商用Jev予算は別途指定、実機参加は連絡待ちだった。低confidence課金・税／販売資格／返金例外・運営条件・本番Goは残る。

実装は全21工程の署名ガード（schemaVersion2）、別同意LP帰属／本人連結／保存outbox／成熟集計／削除キュー、Test/Live商用Jev予算分離、正しいCLS/INP/LCP集計、body上限／quota、隔離復元リハーサル。既存未commit差分を保持しGit状態を変更していない。HEAD `3753c5f`、read-only確認main `100f86e`。対象コードはHEADだけでは表せず、private `candidate-snapshot.json`に作業ツリーhashと証拠を残す。最終対象SHA／CI／署名manifestはまだない。

| 最新検証 | 実結果・証拠（private `.qa-artifacts/launch-implementation/`） |
| --- | --- |
| 全体unit | **577/577 PASS、fail/skip0**。`all-tests-final.log`。その後追加した採用数値の実D1試験を含む課金11/11は別に`adopted-product-test.log`で成功。全体を578件として再実行したとは扱わない |
| 型 | 標準`npm run typecheck`成功、TSポリシー250ファイル、Battleを含む。`typecheck-final.log`。追加の採用数値テスト後も`adopted-product-typecheck.log`で確認 |
| Design・API | design:check成功。API再生成のバイト一致、MCP56ツール維持。`design-final.log`と`api.log`。新規決済／同意管理をMCPへ出していない |
| 通常ビルド | 成功、`relayForge-DnjQ2toc.js` 564.05kB／gzip177.70kB。`build-final.log`。500kB超chunk警告は残る |
| 計測ブラウザ | source／built各**31項目**、9言語×320/1440、LP同意・fragment除去、停止後も9言語で同意撤回可能。`analytics/{source,built}/result.json`。外部リクエスト／provider呼出し0 |
| 課金ブラウザ | source／built、9言語×320/412/1440。価格・割引／更新条件・付与周期・返品／紹介・安全なURL・重複Checkout・Free選択／Jev明示適用。`billing-browser-final.log`。合成応答でありLive受入ではない |
| 公開用App | 起動40、実構成入口12、アクセシビリティ343成功。`{launch,entry,accessibility}-browser-final.log`。署名SHAの本番配信検査ではない |
| 同期／Human | 隔離HTTP Workerの二端末同期15・Human往復34成功。`{sync,human}-browser-final.log`。物理端末／実クライアントではない |
| 復元・削除 | 合成データ入りSQLiteの全schema／全行／integrity／FK一致、snapshot local adapter、R2 fixture bytes／metadata、任意削除と別ユーザー／金融台帳保持の4群PASS。`operations/latest.json`。実Appwrite権限・R2・本番復旧／完全アカウント削除は未受入 |
| 公開read-only | LP／App HTTP200・DYNAMIC、Worker health200。公開Appは`relayForge-hz17VrHF.js`。`public-readonly.json`。wwwはこの端末でDNS未解決11001。今回候補は未配備 |

価格／Creditsと測定契約の採用記録・未実行config draftはprivate `approved-decisions.json`。未決定値はnull、実行不能draftとして明示し、環境変数・Stripe・Worker Secrets・本番フラグを変更していない。既存Stripe run9とJev6例は以下の履歴で、今回の修正版へPASSを自動継承しない。[測定契約](launch-measurement.md)と[公開判断用パッケージ](launch-go-package.md)を参照。

| 工程 | 現在と残件 |
| --- | --- |
| LA-01 | 21工程ガード／workflowはローカル検査。ソース統合・固定SHA・対象CI・署名Goは残る |
| LA-02 | 実Google・PC⇄物理Pixel9・画像／通信断・TalkBackは参加連絡待ち |
| LA-03 | 隔離MCP／Agent権限は検査済み。実Chat／Codex／Dotsは未受入 |
| LA-04 | 隔離Human往復34成功。実Codex／OpenClaw往復は未受入 |
| LA-05 | 計測実装あり。実端末各20回／p50/p95／失敗率／Web Vitalsは未受入 |
| LA-06 | 合成復元・任意削除の検証済み。実窓口・本人確認・全ストア／backup／rollbackは未受入 |
| LA-07 | 正式入口read-only確認。www DNS／redirectと旧タブ／公開資料の最終受入は残る |
| LA-08 | 公開判断パックを準備。正式Go・タグ／Releaseは未実施 |
| LA-09 | 既存ドラフトあり。告知未実施 |
| LA-10 | 告知後の実72時間／最終運営確認は未開始 |
| LA-11 | 対象とActivation本人承認。実初見価値・有料価値の試行は残る |
| LA-12 | 測定契約本人承認。実開始／campaign／除外ID／責任者の環境整合は残る |
| LA-13 | 別同意・帰属固定・仮名ID・撤回・削除キューを隔離検査。公式origin／実本人／運用受入は残る |
| LA-14 | 成熟集計・再送・支払投影を実装。Live・実費／税／手数料・広告費照合は残る |
| LA-15 | 少人数の初見Activation・実継続は未実施。D7/D30は成熟までpending |
| LA-16 | 商用予算・quota・復元・collector失敗／cleanup表示を実装。本番負荷・実原価・予算額・運営体制は残る |
| BM-01 | 価格／Credit基本条件採用。商用予算・法務／税／販売者・例外／実原価は残る |
| BM-02 | 課金／利用権のローカル検査。新しい商品設定でのStripe Test／Liveは残る |
| BM-03 | Jev／台帳／評価・商用予算分離を検査。実請求・低confidence方針・商用受入は残る |
| BM-04 | 紹介100の実D1重複防止成功。採用商品の実Stripe決済・取消受入は残る |
| BM-05 | 9言語source／builtの画面検査。税／販売者表示・実Portal／Live照合は残る |

公開・Live・正式Release・告知・広告・監視開始・親Quest完了は行っていない。必要な本人判断の根拠は元の採用済み計画であり、採用済み条件を再確認しない。価格決定をLive公開Goへ拡張しない。

## 履歴：本人操作によるStripe Test run9合格（2026-10-03）

**Stripe Test run9は本人操作のHosted月払/年払・Portal戻りを含む14/14 PASS。BM-01商品・運営条件未承認、本番Go未承認、販売OFF・Live不可。** 以下の過去保留/失敗記録は履歴として保持する。

| 項目 | 現在の確認/進行状態と証拠区分 |
| --- | --- |
| Test API/アカウント | 親報告：実API HTTP200、JP account、`charges_enabled=false`、details未提出。Test接続確認であり、加盟店/保護者条件やLive有効化の完了ではない |
| 既存Test価格 | 親確認：月USD10/年USD96。`.qa-artifacts/stripe/existing-prices.json`はTest資料で、BM-01の商品価格承認ではない |
| API鍵の区分 | 親が`sk_test_…`をserver secretとして確認。既存`STRIPE_API_KEY`は`pk_…`公開鍵でHosted Checkout redirectには不要。通知署名用`whsec_…`とは別 |
| Stripe API版 | インストール済みStripeスキルの固定`2026-08-26.dahlia`を選択、親がexplicit版でsupported HTTP200を確認。最新公開版の新規調査ではなく、選択版の対応確認 |
| Webhook/実Test受入 | 最新run9：fixture fallbackなし、本人Hosted月払/年払・Portal戻りを含む14/14 PASS/exit0、348 Test API calls、cleanup errors/warnings0。run1 default残件/cleanup失敗は保持 |
| 商品・運営判断 | BM-01：価格、Credit単位/付与量/期限、税、返金、紹介、運営方針未承認。既存Test Product/Priceを販売条件へ流用しない |
| 公開/法的境界 | 本番Go未承認、Live不可。charges_enabled=falseはTest観測なのでLive状態の検証結果へ読み替えない。年齢/後見人/本人確認の回避は行わず、必要な条件確認を維持 |

保存証拠と実行者の報告を記録した。この文書更新では資格情報を読まず、実API・公開操作・Git変更を実行していない。Stripe/GitHub Webhooksの署名鍵は別。本Testシナリオの合格からBM-02/04/05や親Questの完了、商品承認、公開Goを推定しない。固定候補への証拠紐付け・未実施の実機/運用/Live受入は別途必要。

変更は[商品仕様](../BILLING_SPEC.md)、[setup](../RELEASE_SETUP.md)、[roadmap](launch-roadmap.md)、[運用](launch-operations.md)と関連公開/仕様資料の状態整合のみ。下記の524/524等は前回実装時の検査履歴で、この文書更新で新しい全体検査を実施したという意味ではない。


### 最新run9：本人Hosted/Portal・ライフサイクル合格

証拠：`.qa-artifacts/stripe/acceptance/test-20261003062550961-782f7a58/evidence.json`、更新`2026-10-03T06:29:25.661Z`。ファイル再計算SHA256：`dfc5304ed0210deccec8cd632b5d688ef43082b4cef7833d8d37f2aa2524e4e5`。**全14項目PASS/exit0、Test API348 calls、cleanupErrors/cleanupWarnings空、CLI unexpectedExit:false。Liveなし、fixture fallbackなし。**

| 確認範囲 | 実結果 |
| --- | --- |
| setup / monthly_checkout / monthly_subscription / referral_once / webhook_signature_replay | 本人Hosted月払成功、Pro100、紹介25を一度だけ付与。原署名検証・無効署名400・再送200/重複付与0 |
| portal / annual_checkout / annual_checkout_reverse_order | `interactiveReturnConfirmed:true`、本人Hosted年払成功、実通知4件の逆順でもPro100/`hostedAcceptance:true` |
| renewal / payment_failure / cancel_at_period_end / expiry / refund / cleanup | 更新付与2回、支払失敗Free/付与なし、支払済み年払の期間末解約Pro保持、満了Free/canceled、年払返金Credits0/紹介50→25、自前resources cleanup成功 |

100 Credits/周期・紹介25・月USD10/年USD96は**Test設定**。商品判断票の候補/承認条件へ採用しない。run1のdefault Test Portal `bpc_1UMLofCeoWoHk82ZETNWH7yS`はactiveのまま残存、run9 cleanupで解消していない。run8で本人から受領した画像はTest Portal表示の補助的な視覚証拠として記録し、画像・Hosted URLは複製しない。画像から解約実行を推定せず、上表の解約受入はrunnerの別操作証拠による。

過去interactive：run7 `test-20261003061403302-2d29a2c9`はsandbox Chromeが本人に見えず月払blocked/残りpending、27 calls、setup/cleanup PASS。run8 `test-20261003062237656-5f1bd73d`は本人Hosted月払・Pro100・紹介/署名PASS、Portalは画像で表示確認したが戻り未受入/blocked、残りpending、57 calls、cleanup PASS/errors0。Portal読込待ちをDOMContentLoadedからcommit＋HTTP応答ok＋body表示へ修正し、documentResponseAccepted/interactiveReadyを記録して本人戻りを待つ方式でrun9を再受入した。これらの失敗はrun9合格で消去しない。

追加の保存検証：`interactive-verifier-tests.log` **12/12 PASS**、`interactive-tsc.log`の型検査PASS（実行者報告）。下の556/58・build/design/40/343は各時点の保存結果として保持し、最新12件と混同しない。文書更新では再実行していない。現在の作業候補inventoryは別途検証する資料で、run9実行時source hashの証明にはしない。固定source SHA/remote CI/正式BMゲートは未成立。物理Pixel9/Google/実MCP/Human/運用/Live・商品/商用Jev予算・公開Go・72時間は未完了。

### run6と保存全体検査（2026-10-03・run9前の履歴）

証拠：`.qa-artifacts/stripe/acceptance/test-20261003060559519-6e563a9c/evidence.json`。限定読取で`mode:test`、API呼出し351、**11項目PASS / 3項目blocked / 全体blocked**、cleanupErrors0を確認。親報告のexit1は本人操作の未受入を残す意図どおりの終了。Live呼出しなし。Credit100/25は隔離Test fixtureで、BM-01候補の月1,000/紹介100や承認済み商品条件ではない。

| run6項目 | 実結果と受入範囲 |
| --- | --- |
| setup | PASS：実Test API/CLIと隔離backend準備 |
| monthly_subscription | PASS：明示API fixture、Test `pm_card_visa`で有料Subscription、Pro/100 Credits。`hostedAcceptance:false`、Hosted決済成功ではない |
| referral_once | PASS：紹介25 Credits、付与1回 |
| webhook_signature_replay | PASS：原通知署名検証、無効署名400、重複200、重複付与0 |
| annual_checkout_reverse_order | PASS：明示API fixture、通知逆順でもPro/100 Credits。Hosted年払受入ではない |
| renewal | PASS：invoice付与2回、更新後Pro/利用可能100 Credits |
| payment_failure | PASS：親報告のattach可能なTest `pm_card_chargeCustomerFail`で実API失敗、Free/未払Credit付与なし |
| cancel_at_period_end | PASS：月払失敗状態に加え、支払済み年払の期間末解約/Pro保持を確認 |
| expiry | PASS：期間満了Free |
| refund | PASS：年払返金後Free/Credits0、紹介者50→25、無関係分を保持 |
| cleanup | PASS：run6自前resourcesをcleanup、errors0。run1のdefault残件まで消去した意味ではない |
| monthly_checkout / annual_checkout | **blocked**：`checkout_fields_requires_human`、Hosted本人決済は未受入 |
| portal | **blocked**：本人RESTで専用設定の実Session作成`serverSessionCreated:true`、`portal_navigation_requires_human`。Portal操作成功ではない |

手動再検証は[運用コマンド](launch-operations.md#stripe-test-manual-hosted-acceptance)参照。この時点でhelperの任意`--interactive`は実装済み、**当時interactive未実行**（後のrun9で実受入済み）。run6資源はcleanup済みなので新しいTest runを作る。BM-02/04/05・親Questは未完了、BM-01商品/商用予算と本番Goも未承認、販売OFF/Live不可を維持。

| 最新ローカル検査 | 証拠と範囲 |
| --- | --- |
| 全体unit | `final-tests.log`：**556/556 PASS**、fail/skip0を本担当が保存ログで確認 |
| 全体check | 親報告PASS、`final-check.log`のpolicy241 files/最終typecheck出力を確認。文書更新では再実行なし |
| build | `resume-build.log`：PASS、relayForge **561.98 kB / gzip177.04 kB**、500 kB超警告を保持。実機性能合格ではない |
| design | `resume-design.log`：`design system check: ok` |
| launch/browser | `resume-launch-browser.log`：40 scenarios PASS、page errors0 |
| accessibility/browser | `resume-accessibility-browser.log`：343 scenarios PASS、物理TalkBack受入とは別 |
| UI担当 | 親報告：本人担当6条件・source/built9言語PASS、Provider呼出し0。実Hosted/実機受入に置換しない |

追加の親報告：`final-affected-tests.log` **58/58 PASS**（interactive flag/新しいguard反映後）、`final-tsc.log` PASS。`source-review.json`はlocal HEAD `3753c5ff22b52cf38d3c6737dbe63ce42ef772c9`、`dirty:true`、`formalTargetSha:null`、Git inventory554 filesをhash化、設定済み3秘密値のexact-value露出0を記録した**現在の作業候補inventory**。run6実行時コードの遡及hash/正確なsource SHA証明ではない。固定された候補・remote CIは未成立、秘密値を文書へ記載しない。

検査ログは`.qa-artifacts/launch-implementation/`内。これらは親/担当が実施した最新の保存結果で、この文書担当が全体検査を再実行した結果ではない。この時点では本人のmanual Test今/後の都合を確認中だった（後に「今できる」と回答しrun9完了）。承認済みローカル作業は完了したという親報告を、未実施の実受入/商品判断/公開Goの完了へ読み替えない。過去の524/524等は以下の履歴として保持する。

### 実Stripe Test run1/run2・Jev復旧・UI報告（2026-10-03・run6前の履歴）

- **run1受入失敗・Test残件あり：** 実行前Portal configurationsは空。初めて作成した自前Test fixture `bpc_1UMLofCeoWoHk82ZETNWH7yS`がStripeにより`is_default=true`となり、`active:false`での無効化はHTTP400で拒否された。`.qa-artifacts/stripe/first-portal-cleanup.json`のdefault無効化拒否を確認。設定済みAPIでは消去できず残存し、run1 cleanupはfailのまま。既存のユーザー設定は変更していないが、default不変/all cleanupとは記録しない。BM受入成功ではない。
- **run2 Hosted本人操作待ち：** 親報告はTest setup/CLI/本人REST経由のHosted Checkout Session作成成功。証拠`.qa-artifacts/stripe/acceptance/test-20261003055108550-132b7571/evidence.json`を限定読取し、`mode:test`、`status:blocked`、`setup:pass`、`monthly_checkout:blocked`/`checkout_requires_human`、`cleanup:pass`/cleanupErrors0、残りlifecycleはpendingを確認。run2新規resourcesは親がcleanup済みと報告；run1のdefault残件を消したという意味ではない。決済/Pro化の成功は未確認。別の明示API fixtureによるlifecycle検証を担当が準備中で、Hosted本人決済の未受入と分けて記録する。BM-02/04/05をpassedにしない。
- **Jev既知結果の復旧：** `.qa-artifacts/launch-implementation/jev-reconcile-test.log`の20/20 PASSを確認。DB triggerによる台帳障害、並列復旧/外部再呼出しなし、結果不明409/予約保持を含む既存ローカルテスト証拠で、実Provider/本番復旧の受入ではない。[最小運用手順](launch-operations.md#jev-settlement-recovery--operator-only)を追加。共通最大USD1評価予算の商用運営方針は[商品判断票](launch-product-decisions.md)の未承認事項。
- **UI担当報告：** 55 tests、browser6、source/built9言語検査が完了、Provider呼出し0。実機/Hosted本人決済の受入には置換せず、親の新しい全体検査は待ち。この文書担当はUI検査を再実行していない。
- 商品条件・商用予算・最終本番Goは未承認。候補販売OFF/Live不可を維持。この追記では実API/CLI復旧・設定/Git/公開操作を実行していない。

### CLI設定完了と影響範囲検査の追記（2026-10-03・run1/run2前の履歴）

- 親報告：Stripe CLI **v1.53.0**をGitHub配布SHA256で照合し、ignored `.qa-artifacts/stripe/cli/stripe.exe`へ配置。CLIのTest認証成功。ローカル`STRIPE_WEBHOOK_SECRET`を取得しignored `.dev.vars`へ追記した。値は表示しない。この文書担当は`.dev.vars`を読まず、CLI setupや実APIを実行していない。
- 設定証拠：`.qa-artifacts/stripe/cli/readiness.json`、SHA256 `313db40f8c5bc9661a23532b95ef21d708cddd374fcdc949863968b8fc059bae`。本担当は`mode:test`/`localSigningSecretConfigured:true`とCLIファイル存在を確認；CLI認証とGitHub checksum照合は親の確認報告として区別する。ローカルCLI通知先の署名鍵設定は本番Webhook登録・Liveの承認ではない。
- **候補billingはdisabledを維持。実Stripe Test runnerはHuygens待ち、受入未完了。** 設定完了からBM-02/04/05をpassedへ変更せず、BM-01の価格/Credits/税/返金/紹介/運営方針未承認、最終本番Go未承認、Live不可も維持する。
- 親のJev `requestId` schema修正：100文字上限とpatternを適用し、API契約を再生成（本担当は変更していない）。影響するroutes/Agent/Jevの**42/42 PASS、fail/skip0**を`.qa-artifacts/launch-implementation/resume-routes-test.log`で確認。これは影響範囲のunit結果で、実Stripe Test受入や全体テストの新しい件数とは扱わない。


## Stripe保留時点のローカル実装候補（2026-10-03・再開前の履歴）

**本番Go未承認・今回候補未配備・ローンチ未完了。Stripeはひろなおの明示指示でペンディング：追加Stripe実装/実接続/取得/Live切替は停止、外出後の再開指示と保護者/Stripe条件確認待ち。** 年齢・本人確認を回避しない。既存模擬検証とローカル成果物は保持。金額/割引/紹介/Credit量の公開確定、実Stripe Test/Liveの完了とは扱わない。

担当範囲はworkflow/商品仕様/運用/証拠ガード/文書。既存dirty変更を保持し、backend/UI/生成API/package/env/typesの所有範囲を変更していない（既存beta-release順序テストだけ親依頼で更新）。Git操作・本番配備・Secret公開・Release・投稿・monitor作成は行っていない。

- 配備順：validate→署名対象の追加D1→Worker+health/MCP→expected Worker/source確認→Site+smoke→全先行LA/BM署名証拠再検査→Release。canonical originsを前提化し、手動/タグは同一production lock、途中失敗で停止、cache/旧asset保持を維持。
- `.qa-artifacts/launch-candidate.json`のEd25519署名、SHA/tree/repository、証拠hash/時刻/kind、承認scope/期限を検査。通常CIは証拠manifest不要。最終Releaseは全先行LA/BMを必要とし、完了は全15ゲート・実72h・重大修正後restart・最終承認を必要とする。[運用/実機/Goチェック表](launch-operations.md)。
- [BILLING_SPEC](../BILLING_SPEC.md)：Free登録2（active+disabled、archived除外）/Pro無制限、超過select2/記録保持、公式Jev限定提案、通常CRUD消費0、販売OFF。Stripe/GitHub Webhooksの違い、sk_test/whsecと保護者条件を整理。Documentationは既存README/公開GitHub資料、docs.guilduo.comはReserved。

### 親が実施した公式Jev合成評価の候補証拠

証拠：`.qa-artifacts/jev/evaluation.json`、更新UTC `2026-10-03T00:50:21.388Z`、SHA256 `042426aaaab2ce27b7967a4a6d1ce1f2f31a3132e62ade1ed40b9cebec74e28e`（更新後はhashも再採取）。固定モデル`jev-1.13.0`、入力USD 0.042/1M、出力USD 0/1Mという公式価格の親確認報告に基づく。親は実API評価完了と報告し、修正後の保存JSONも`mode: execute`を確認。使用量ベースの推計と実請求照合は引き続き区別する。

| 項目 | この証拠で確認できる値 |
| --- | --- |
| ケース/失敗 | 6件 / failureRate 0 |
| Agent/action正解・confidence | 各6/6、confident 6/6（6件の合成ケース限定） |
| latency p50 / p95 | 194.7624ms / 395.5611ms |
| input / output tokens | 3339 / 556 |
| 使用量からの推計 | USD 0.000140238（この6件の推計がUSD1以下、実請求は未照合） |
| 実請求照合 | invoiceVerified: false；実請求原価は未確認 |

6件の小標本は品質一般化・本番性能/PC/Pixel9のp95・有料商品成立を証明しない。BM-01の原価判断**候補**へ取り込み、実請求/販売条件/金額・付与量・期限・割引・紹介の承認は引き続き未完了。fixtureテストやmodel outputだけでBM-01/03をpassedへ変更しない。

### 最終ローカル検査（2026-10-03）

旧Site先行順assertと担当explicit-any/`.mts`構文エラーを修正後、以下を最終記録とする。全体ログの末尾を本担当でも読み取り確認した。sandboxの`os.userInfo()` ENOMEMはignored test-only preloadで、Wranglerユーザー領域ログEPERMは親のローカル`WRANGLER_LOG_PATH`設定で対応。製品ソースへ環境回避策を追加していない。

| 検査 | 結果 | 証拠（`.qa-artifacts/launch-implementation/`内） |
| --- | --- | --- |
| 全体 `npm run check` | PASS（親実行、最新ログ確認） | `check.log` |
| 全体 unit | **524/524 PASS、fail/skip0**（親実行、最新ログ確認） | `full-tests.log` |
| 全体 build | PASS、Relay Forge 545.12kB / gzip171.39kBのchunk警告あり | `build.log` |
| 全体 design | PASS | `design.log` |
| Generated API再生成安定 | PASS（親確認報告、生成契約は担当外） | 親の最終確認報告 |
| 担当workflow YAML/順序・失敗ガード＋既存beta release | **17/17 PASS**、missing/stale/failed/改ざん/署名/時間/critical reset/古い・混在Worker/設定不一致を拒否 | `launch-gates-final.log` |
| 担当を含む全体 `tsc -b` | PASS・型エラー0（本担当実行） | `launch-tsc-final.log` |
| TypeScript policy | PASS・238 source files（本担当実行） | `launch-policy-final.log` |
| design再確認/担当diff whitespace | PASS（本担当実行） | `launch-design-final.log`、`git diff --check` |

親のread-only `git -c http.sslBackend=openssl ls-remote`確認ではremote main `100f86e0b5a40d217cf60e7dbc0513ffec887283`。local HEADは本担当でも `3753c5ff22b52cf38d3c6737dbe63ce42ef772c9`を読み取り確認。既存dirtyを保持し、merge/commit/push/tag/reset/stashは実行していない。local HEAD＋未コミット差分は署名された最終source SHAではない。

変更した担当ファイル：`.github/workflows/{release,deploy-appwrite-site,deploy-appwrite-worker}.yml`、`RELEASE_SETUP.md`、新規`BILLING_SPEC.md`、`docs/{launch-roadmap,launch-readiness,brand-rollout,public-urls,release-announcement-draft}.md`、`PROJECT_SPEC.md`、`SECURITY.md`、`PRIVACY.md`、`TERMS.md`、新規`docs/launch-operations.md`、新規`tools/verify-launch-gates.mts`、新規`tests/launch-gates.test.ts`、親依頼の`tests/beta-release.test.ts`。

Stripe追加実装/実接続は停止、外出後の再開指示待ち。価格/販売条件/実請求/実Stripe Test・Live、Google/物理Pixel9/実MCP/Human往復、バックアップ隔離復元/rollback実操作、最終署名候補と本番Go、Release/告知/実経過72時間は未完了。チェック成功をこれらの受入に置換せず、全15Quest/親の完了状態は変更していない。

### 保留時点の統合後Agent/Jev画面確認と再開地点（履歴）

- Freeの超過選択は、有効な非archived Agentが2体揃うまで実行を禁止。選択Agentのarchive後も再選択を要求する。共通のQuest書込境界では担当Agentのactive状態も再検査し、snapshotによるdisabled Agentへの担当設定を拒否する。
- 共有MCPの1体をdisabledにしても、他の利用可能なAgentのOAuth grantは保持する。Agentの読取・作成・更新・画像更新・MCP contextへ利用可否を付加し、既存の識別子と契約を保持する。実SQLite/REST/MCPの証拠は`agent-boundary-final.log`、`final-boundary.log`。最終全体unitは524/524、fail/skip0。
- 画面は隔離Worker/合成応答のsource/built各320・412・1440px、9言語で確認。Free選択、保存失敗と再取得、Credit履歴、Jev見積→送信同意→単一実行→pending/manual→版付きの明示適用、横はみ出しを検証。証拠は`billing-ui/results.json`とスマホ`built-320-settings-top.png`/`built-320.png`。ブラウザ検査の実Provider呼出しは0件で、上記6件の公式Jev実評価とは分ける。物理Pixel 9/TalkBack受入は未完了。
- Jev適用で変更するのは担当AgentとreadyのHandoff。次の行動は提案として表示し、Human確認・Review・待機の確定は既存の本人操作で行う。Quest完了やAgent起動を自動実行しない。
- **Stripe再開地点：** API/台帳/模擬検証と途中の画面を保持。販売条件のbackend/UI描画契約の整合、商品金額と方針の承認、保護者/Stripe条件確認、Test鍵とWebhook設定、実Stripe Test/Live受入は保留。販売・本番の利用権/Jevスイッチは有効化していない。価格候補を承認済みと扱わず、完了ゲートは更新しない。

## 以下は過去候補の配備・検証履歴

今回の未配備候補と区別して保持する。過去PASSは将来候補へ自動継承しない。


更新: 2026-10-03。対象: `0.6.0-beta.8`候補。**D1・Worker・Site本番反映完了／公開版確認済み／実機・実Agent往復の受入は継続**。

## 本番反映と公開版の確認（2026-10-03）

GitHubの`production`環境に保存済みの`APPWRITE_DEPLOY_KEY`を確認し、ユーザー承認済みの本番反映を既存Actionsで完了した。ローカルキーでは`sites.write`不足の401となったが、キーの取り出しや再登録はせず、Actions内で既存Secretを利用した。公開HTMLのcache guardを通過し、キャッシュ設定は変更していない。

- 配備ソース: `dbdb1124353629763abd1719987c3a76a8345878`、専用ブランチ`codex/refresh-shared-agents-release`。最新main `100f86e`のQuest参照・依存関係表示・モバイル操作・公開メール保護・upload再試行を維持して統合。元の作業ツリーの未コミット変更とmainは保持した。
- D1: `0011_shared_mcp_agents.sql`適用済み、未適用migrationなし。既存接続・データを保持する追加列のみ。
- Worker: version `3bbeadd9-5eaa-4e88-bc62-09165442e30d`を100%配備。直前は`2c686f88-61b6-4a24-a0bf-0798f5ed1843`。本番変数・D1/KV/R2・配置の前後一致を照合。`APPWRITE_REVISION_BATCH=true`を維持し、任意の準備transactionは有効化していない。配備したbackendと統合版の27ファイルは改行正規化後に一致。
- Worker確認: health 200（2.7.0／Schema 7／Agent保存D1）、OAuth metadata 200、未認証REST/MCP 401、App originのCORS 204。実MCPの`get_current_agent_context`で`allowedAgentIds:["codex"]`・`requiresAgentSelection:false`を確認。
- Site: [Actions 37024673402](https://github.com/ELRdn/Guilduo/actions/runs/37024673402)成功。Appwrite deployment `6abfc9479192501efbe7`、ready／activation完了。現行64＋保持21の85 assetを配信。旧タブ向けasset保持検査と公開前起動40条件も成功。
- 公開確認: 正式App root・互換path・LP・Privacy・TermsはHTTP 200、cacheはすべてDYNAMIC。配信entryは`relayForge-hz17VrHF.js`（504348 bytes、SHA-256 `b992bd28400e86bc2883c85b4929180cd672c36a5971ad290af787ea94b22935`）。静かな更新／引いて更新／共有Agent設定／手動更新の実装を含む現行bundleを確認。
- 表示確認: 実Chromeの1440／412pxで`admin`と現行DOM・bundle内の固定個人名不在を確認。page errorなし、スクリーンショットも目視。manifest掲載85 assetのサイズ・SHA-256を公開URLから照合し、旧画面も起動。初回はChromeのDNSエラーで中断し、変更なしの再実行で全項目成功。旧assetの内容は互換保持しており、過去の配布物からの個人名完全消去を意味しない。
- 統合版検査: 453テスト・型・デザイン・ブランド・API契約再生成・ビルド、同期15／静かな更新7／Human Relay34／公開用起動40／アクセシビリティ343成功。Actions自身のcheck／ブランド／unit／build／launchも成功。Relay Forgeの504.34 kB（gzip 154.89 kB）chunk警告は残る。
- Guilduoロードマップ: 親計画とLP-R07のnotes／nextActionを更新し再取得で照合。変更はnotes／nextAction／updatedAtのみ、担当・期限・依存関係・完了条件・active／done=falseを保持。

配備証拠は元の作業ツリーの`.qa-artifacts/deploy-2026-10-02/`に保存。`migration.log`、`worker-deploy.log`、`worker-public-checks.json`、`actions-37024673402.log`、`public-verification.json`、`public-admin-{1440,412}.png`、`roadmap-final.json`を参照。統合版の検査ログは専用作業ツリーの`.qa-artifacts/release-check/`。公開キャッシュは無効のまま維持した。

実Chat／Codex／Dotsでの共有接続・明示`actingAgentId`指定、物理Pixel 9の同期／ナビ／TalkBack、実Google同期・R2・Human依頼→回答→FB→再開、本番性能・窓口／削除依頼運用・法的確認は未受入。これらを配備成功だけで完了扱いしない。以下は各作業時点の履歴で、未配備・未commit等の記述は本節より前の状態を示す。

## 静かな更新・共有MCP・スマホ更新の追加確認（2026-10-02）

実Chromeで30秒の自動再取得時にPCの一覧スクロールが450pxから0へ戻ることを再現した。共通描画処理でページ位置を保持し、再取得時は内部一覧と補足の開閉も保持する。通信開始時と完了時それぞれの現在位置を保存し、待機中に動かした位置を巻き戻さない。既存の再描画構造を維持しており、DOM差分更新への全面置換ではない。

スマホでは最上部から1本指で下へ72px引き、離すとデータだけを再取得する。短い引き・横方向・取消・複数指・入力・モーダル・Networkのパンを除外する。Moreの更新ボタンはキーボードでも操作可能。更新中の重複読取を止め、書込み保留と入力保護を既存の共通ガードで維持する。

共有MCPはSettingsで利用可能なAgentを複数登録し、各呼び出しの`actingAgentId`で担当を選ぶ。1つのAgentだけの既存接続は省略可能。共有接続では実行主体の省略・未許可・無効Agentを拒否し、権限を合算しない。Agentを1人無効にしても他メンバーの接続を失効させない。同じOAuth資格情報からChat／Codex／Dotsを自動認証する仕組みではなく、許可済みIDの明示指定である。[設定手順](shared-mcp-agents.md)を参照。

証拠は`.qa-artifacts/quiet-refresh-2026-10-02/`に保存。開始時の差分は`baseline.patch`、修正前の失敗は`reproduction.log`。ドイツ語320pxの共有カード、引いて更新の表示、更新後の一覧位置をスクリーンショットで目視確認した。

| 検証 | 結果・ログ |
| --- | --- |
| 全体テスト | 450成功、失敗・スキップ0。`unit-final.log` |
| 共有MCP | 実SQLiteの旧接続migrationとmembership保存、同時Actor、ID・所有者・Agent/OAuth権限、依頼元、共有link変更禁止、SDK経路・失効の拒否を確認。`shared-tests-final.log` |
| 型検査 | 成功。`typecheck-final.log` |
| デザイン契約・差分 | `design:check`と`git diff --check`成功。`design-final.log` |
| 静かな更新・Settings・タッチ | 7シナリオ成功。PC／スマホの遅延中の位置保持、3Agent保存・再読込、9言語×3幅、実Chrome CDPタッチ、Moreのキーボード更新を含む。`browser-final.log` |
| 二端末同期・競合保護 | 最終ガード変更後も15シナリオ成功。`sync-final.log` |
| 既存Settings操作 | 1440／390px・9言語、取消・保存・削除・回復成功。`settings.log` |
| 公開用起動・入口 | 起動40／実入口12成功。`launch-final.log`、`entry-final.log`。認証応答は合成、保存は隔離HTTP Worker |
| 公開用アクセシビリティ | 343条件成功。`accessibility-final.log` |
| API契約 | 56ツール・60パス・Schema 7を維持。両ファイルの再生成SHA-256一致。`contracts-final.log` |
| ビルド | 成功。`build.log`。`relayForge-Xb2KRM0z.js`は503.29 kB／gzip 154.49 kB。500 kB超のchunk警告あり。閾値を引き上げて隠していない |
| Guilduoロードマップ | 親計画・LP-R07のnotes／nextActionを更新し再取得で照合。変更はnotes／nextAction／updatedAtのみ、active／done=falseを保持。`roadmap-updates.json` |

配備順は**D1 migration `0011_shared_mcp_agents.sql` → Worker → Site**。新Workerは追加列を参照するため、下の過去記録のWorker → Site手順だけでは不十分。本変更のcommit・push・配備は行っていない。実Chat／Codex／Dotsで更新されたツール引数を渡せること、物理Pixel 9のタッチとTalkBack、実Google同期、Codex／OpenClawのHuman往復、本番性能・運用は未受入のまま管理する。

## 保存競合・応答喪失の追加確認（2026-10-02）

今回の追加修正は未配備。以前のSettings／Workspace修正の配備記録と、公開Privacy／Termsの最新確認は分けて扱う。開始時の未コミット変更を保持し、commit・push・タグ作成・配備は行っていない。

| 実際に再現した問題 | 修正と再確認 |
| --- | --- |
| 二端末で開いた編集から、先に保存された内容を古い入力で上書き | REST/MCPのQuest PATCHとscoreへ任意の`expectedUpdatedAt`を追加。共有ドメインの最新状態と照合し、競合は409。入力とエラーを保持し再送を止め、閉じた後に読取で回復 |
| 古い画面の「完了」が完了済みQuestを再開 | 表示時の更新日時をscoreへ渡す。実ChromeのPCで完了後、スマホの古い完了は409。報酬・完了を保持し、読取再試行のみで復帰 |
| 見積2000分が編集保存で1440分へ切り詰められる／UIのタイトル上限160とAPIの80が不一致 | API既存境界のタイトル80文字・見積100000分へ統一。2000分保持とnative入力検証を確認 |
| Human回答保存後に古い一覧通信が返り、未対応へ戻る | 回答開始前の読取を破棄。HTTP一覧を実際に遅延させて回答後に返し、回答と件数の保持を確認。dry-run中の画面破棄後は実書込みも開始しない |
| Quest作成は保存済みなのに応答だけ失われ、再送できる | 実WorkerへPOSTを通した後でブラウザ応答を破棄。結果不明時はdraftを残して再送を止める。閉じた後の再読取で保存済み1件を確認し、疑似submitでもPOSTは1回 |

証拠は`.qa-artifacts/launch-2026-10-02-cyan/`へ保存。`conflict-reproduction.log`、`inbox-reproduction.log`、`lost-response-reproduction.log`は修正前の失敗を記録する。競合・結果不明の案内は9言語×320／412／1440pxで確認し、スクリーンショットを目視した。Human Relay検査を既存のCI開発サーバー検査へ追加した。

| 検証 | 今回の結果・ログ |
| --- | --- |
| 全体テスト | 448成功、失敗・スキップ0。`unit-final.log` |
| strict型検査 | 成功。`typecheck-final.log` |
| デザイン・ビルド | 成功。`design.log`、`build-final.log` |
| API生成 | 56ツール・60パス・Schema 7を維持。更新・完了の任意入力と409を追加し、再生成のSHA-256一致を確認。`contracts-final.log` |
| 二端末同期・競合・応答喪失 | 15シナリオ成功。エラー2種類の9言語×3幅も含む。`sync-final.log` |
| Human Relay | 9言語×3幅を含む33条件成功後、破棄時ガードを加えた7結合条件も成功。`human-relay.log`、`human-relay-dispose.log` |
| 起動・保存・画像・LP規約 | source55／公開用40条件成功。`launch-source-final.log`、`launch-built.log` |
| 公開用アプリ入口 | 12シナリオ成功。`entry-built-final.log`。SDK認証応答は合成、データ処理は隔離HTTP Worker |
| 共通画面・Command | 画面70条件とCommand操作成功。`screens.log`、`command-source.log` |
| 公開用アクセシビリティ | 9言語で343条件成功。`accessibility-built.log`。新規エラー状態は`sync-final.log`で追加確認 |
| 公開Privacy／Terms | 実Chrome・JS無効・320／1440pxで本文、運営者、窓口、canonical、横はみ出しなしの4条件成功。`public-policy.json` |
| Guilduoロードマップ | 既存の親計画・LP-R07のnotes／nextActionを更新し、再取得で一致。変更はnotes／nextAction／updatedAtのみ、active／done=falseを保持。`roadmap-updates.json` |

公開LP／Web App／OAuth metadataは200、未認証MCPは401、healthは2.7.0／Schema 7／56ツール。`www`はENOTFOUND。`public-status.json`と`public-policy.json`が最新の証拠であり、下の以前のfallback記録を更新する。最初のChromeアクセスは一時的な名前解決失敗で、再実行した直接アクセスは成功した。

配備時は**Workerを先に更新し、その後Siteを更新**する。旧Workerは追加フィールドを無視するため、Siteだけ更新しても競合防止は成立しない。旧クライアント向けに更新日時未指定の従来動作を維持し、書込みの自動再送・自動マージ・作成のサーバー冪等化は追加していない。実Google OAuth、物理Pixel 9同期とTalkBack、Codex／OpenClawのHuman往復、本番性能・窓口運用の受入は未完了。

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

以前の`.qa-artifacts/launch/public-check.json`（2026-10-02 JST）ではPrivacy／Termsがfallbackだったが、同日後半の最新確認では公開本文を配布している。上記`public-status.json`／`public-policy.json`を現在の判断に使う。公式日英LP／Web App／OAuth metadataは200、MCP healthは2.7.0・Schema 7・56ツール、未認証MCPは401、`www`はENOTFOUND。

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


## Settings権限表示と無効MCP削除の本番配備（2026-10-02）

- `0936966`でSettingsの権限を接続ごとのQuest閲覧・更新可否へ整理。技術スコープと接続IDはnative detailsへ折りたたみ、無効MCPの削除を既存の接続解除・履歴削除APIへ接続した。AgentとQuestを保持し、不確定な失敗後は一覧の読取再試行を案内する。
- 全441テスト・型検査・デザイン検査・ビルド・launch40成功。1440px/390px・9言語・キーボード開閉・取消・旧リンク削除・再取得失敗・保存保持を実Chromeと隔離Workerで確認。Linuxの検査期待値だけがOS言語へ依存する問題を`085f747`で修正し、CI run `36988262174`は成功。
- ひろなおのGOとキャッシュ停止確認後、公開HTMLのDYNAMICを確認。Site配備run `36990716820`は`085f7479b6f18b94104bfe9ce65c6e914cae96dd`で成功。正式rootと互換pathは新`relayForge-BY0c1eq4.js`を配信している。
- 配備前のHTMLと旧画面検証用HTMLのSHA-256を照合。旧asset74件のMIME・サイズ・SHA-256一致、新旧画面の起動とナビ、正式rootのサインイン画面、4つのPrivacy/Terms公開URLを確認。証拠: `.qa-artifacts/settings-live-release-results.json`、`settings-live-release.log`、`settings-deploy.log`。
- 実際に配信されたHTML/JSを使った1440px/390pxのSettings検査も成功。合成Appwrite認証と隔離ローカルWorkerだけを使い、再接続なし削除・Agent/Quest保持・再読込を確認した。本番個人データの削除や実Google認証の追加受入ではない。証拠: 元checkoutの`.qa-artifacts/published-settings/results.json`と`1440.png`、`390.png`。
- キャッシュ停止確認から240秒以上経過し、新旧起動と旧asset保持を確認したため、両キャッシュルールを設定値を変えず復帰する操作を依頼済み。復帰と最終配信確認は回答待ち。
