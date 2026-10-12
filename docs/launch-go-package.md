# Guilduo 公開判断用パッケージ

更新: 2026-10-06。**独立レビューのP1 3件・P2 1件を修正したローカル実装候補。630テスト・型・buildと公開用入口の検証成功。ローンチ未完了。商用金額／期間は採用済み。商用実受入・販売運営条件・実環境受入・公開Go・Live販売は残る。**

## 対象候補

2026-10-06にブランチ`codex/prepare-empty-transactions`、HEAD `3753c5ff22b52cf38d3c6737dbe63ce42ef772c9`を読取確認。10月4日のremote main `100f86e0b5a40d217cf60e7dbc0513ffec887283`は履歴で、今回remoteを再確認していない。既存の大きな未commit差分を保持しているため、HEAD単体を候補のSHAにしない。最終Git統合・commitは未実施。private `.qa-artifacts/launch-20261006/candidate-snapshot.json`へ今回の作業ツリーと証拠のhashを記録する。照合用であり、署名済み公開manifestの代わりではない。

今回の読取確認で公開中のAppは`relayForge-BY0c1eq4.js`、今回ローカルbuildは`relayForge-DwBGDoHY.js`。LP／App／DocsはHTTP200・DYNAMIC、不存在Docsは404、Worker healthはHTTP200・API2.7.0／schema7／56ツール。今回候補は未配備。`www.guilduo.com`はこの端末でDNS未解決（ENOTFOUND）で、redirectと外部再確認をLA-07に残す。Documentationは公式`https://guilduo.com/docs/`と既存README／公開GitHub資料を使う。

## 実装候補

- Free2登録／Pro登録無制限、超過Agent保持・選択、決済／台帳／紹介／Jev／9言語画面の既存候補を維持。
- 全21工程の署名付きガード。配備Goと正式Releaseの条件を分け、旧manifestを拒否。
- 別同意のLP→登録／Activation／継続／支払の採取・成熟集計、削除とprivate snapshotの再試行キュー、仮名化adminレポート。[測定契約](launch-measurement.md)参照。
- 評価最大USD1を維持し、商用JevをTest/Live別の承認期間・費用上限へ分離。未知結果を再呼出し・無条件返却しない。
- CLS／INP／LCP集計、実payload上限・collector quota、ローカルD1／snapshot／画像の復元リハーサル。
- 独立レビューのP1を修正: Jev未送信予約の台帳照合／CAS回復、同意撤回後の遅延保存の再清掃、Test／Live支払投影の分離。追加P2のCredit予約未成立も、予約batchのCASと台帳履歴の不存在確認で元予算だけ解放する。
- native dynamic importで未認証入口のShell／production取得を0にし、入口JSを564.05→215.43kBへ分離。認証世代と読込世代を分け、後続の失効／sign-outも受け入れる。500kB警告は解消。
- CIへ課金／同意計測／復旧／Battle／Connections検査を接続し、失敗時の後続停止を検証。Worker／Releaseの基準SHA比較に必要なGit履歴を取得。

最終独立再レビューで当該P1／P2と並行回帰不足はclosed。Jev回復・analytics・入口認証の対象範囲に追加P1／P2なし。独立側SQL SELECT24条件と実関数＋モック、担当実D1／全体テストの証拠を区別して保存。

最新件数・証拠は[readiness](launch-readiness.md)。旧Stripe run9とJev6例は履歴で、現候補のLive・実原価・実機性能の証拠へ流用しない。ひろなおが準備後に参加する物理Pixel9／実PCの各操作20回・p50/p95・失敗率・Web Vitalsは未受入。遅延chunkへの分離を総転送量／本番体感速度の受入へ置き換えない。

## ひろなおの判断・操作

| 順序 | 判断／操作 | 次の実行 |
| --- | --- | --- |
| 商品 | [商品判断票](launch-product-decisions.md)の月USD10／年USD96、Jev1件1Credit、月1000・30日、紹介100等の数値・基本周期／期限・割引なしは採用済み。商用金額／期間は10月6日〜11月5日総額USD5を採用済み。低confidence・返金取消・使用済み特典・商用運営条件を確定 | 承認範囲で仕様・設定・LP・台帳・Stripe Testを整合。Test100／紹介25を商品1000／100の証拠にしない |
| 計測 | Activation定義は承認済み。7日／30日／D1・D7・D30、目的・同意・保持／削除も承認済み。実開始時刻・除外ID・campaign・運営担当を整合 | 承認configを固定し、プライバシー／運用を照合 |
| 販売資格 | 販売者、必要な保護者／後見人・Stripe本人確認／Live資格、販売地域・税・法定表示・返金・保持を確定 | 購入前表示・窓口・Live設定を準備。秘密値はprivate local／GitHub Secrets／Worker Secrets |
| 実受入 | 実Google、PC⇄物理Pixel9／画像・通信断・TalkBack、実Chat／Codex／Dots、Human往復、初見試行、隔離復元／rollback | [運用表](launch-operations.md)へ版・日時・実結果・証拠・担当を記録 |
| 公開Go | 固定SHA／差分／CI／migration／設定／価格／条件／実受入／rollback先／Release・告知案を確認 | 承認範囲でGit統合・本番配備・Live切替・少額決済。Release／告知は実受入・Live成功後 |
| 観察 | 告知から開始／24h／48h／72h、重大修正後再開始、最終運営判断 | 実時間と確認が揃って親Questを完了。広告AD-01／02は別判断 |

商品・計測の選択を公開Goと扱わない。必要な承認の根拠は、ひろなおの採用済み計画の「BM-01商品判断」「公開Go」「ひろなおの操作」「実72時間確認」。承認済み対象／Activation定義は再確認しない。

## 配備・復旧

追加migrationは0012課金、0013Jev、0014計測、0015商用予算。0011共有Agentは公開版に既存。固定候補で基準SHAとの差と追加migration hashを照合する。既存SQL改変・破壊的migration・D1巻戻しは含めない。

検査→追加D1→Worker→health／MCP／旧Site互換→Site→公開確認。途中失敗で後続を止める。rollback先はSite Actions `37024673402`／`dbdb112`、Worker `3bbeadd9-5eaa-4e88-bc62-09165442e30d`を候補として再確認し、実際に復旧できることをLA-06で確認する。新規購入・Jev・計測を停止し、利用権・金融台帳を保持して決済照合。未知の外部結果を再実行しない。旧Workerと追加D1の互換を検査する。キャッシュ再有効化は含めない。

[既存告知ドラフト](release-announcement-draft.md)を固定候補の機能／価格／制限へ書き直して確定する。未承認価格や未受入性能を確定コピーにしない。
