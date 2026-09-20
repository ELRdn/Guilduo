# 保存往復の削減候補: commit時のrevision照合

状態: **実サービスの独立行検証済み・既定で無効・GUI計測待ち**（2026-09-21 JST）。`APPWRITE_REVISION_BATCH=true` の場合だけ利用する。release設定生成とWorker/release workflowに接続済み。未指定はfalse、不正値は設定生成を停止する。

## 解決したい待ち

本番GUIの直近編集は1,283〜1,580ms、完了は3,396ms。完了時はWorker内でも2,907msかかり、state read / transaction read / stage / commitの待ちが大きかった。現在は初回state readとtransaction beginを並行化済みだが、その後にrevision再読込、stage、commitを直列で待つ。

候補方式は初回readとbeginを維持し、その後をbatch stage→commitにする。HTTP要求は5件から4件、直列待ちは4段から3段になる。ただしDB内部の処理が増えるので、実測前に高速化とは判定しない。

## 一致確認を省略しない方法

期待revisionをNとして、次の3操作を同じtransactionに順番どおりstageする。

1. revisionを1増やす。上限N+1を超えたら失敗。
2. revisionを1減らす。下限Nを下回ったら失敗。
3. state全体とrevision=N+1を書き込む。

最初の2操作に成功するのは現在値=Nだけ。2番目で失敗しても最初の増加を含めてrollbackされなければならない。古いrevisionだけでなく新しすぎるrevisionも拒否する。commitに成功するまでは保存成功を返さない。既知の競合と `attribute_limit_exceeded` のみ再取得・再試行し、通信切断・未知の400・401・500/503を保存未実行と決めつけて再送しない。

既存のデータ形式、gzip、owner、schemaVersion、revisionの最終値は変えない。flag未指定時は既存方式を維持する。新規state行の作成方式も変えない。

## 根拠と検証境界

[Appwrite transaction仕様](https://appwrite.io/docs/products/databases/tablesdb/transactions)はoperationsのcommit内再生と競合時の失敗を説明している。加えて次のソースを確認した。

- [Appwrite 1.9.6 transaction commit](https://github.com/appwrite/appwrite/blob/9f8423e2f6fd7237609524a16541430e19f9ee0e/src/Appwrite/Platform/Modules/Databases/Http/Databases/Transactions/Update.php): operationsを一つのDB transaction内で順に適用し、numeric limit例外は `attribute_limit_exceeded` になる。
- [同版のoperations staging](https://github.com/appwrite/appwrite/blob/9f8423e2f6fd7237609524a16541430e19f9ee0e/src/Appwrite/Platform/Modules/Databases/Http/Databases/Transactions/Operations/Create.php): 複数操作を一括登録する。
- [同版依存のUtopia Database](https://github.com/utopia-php/database/blob/fff9f0effbd40359ff925741ff9424856d8b4fde/src/Database/Database.php): increment/decrementはrow lock下で現在値を読み、境界を超えた場合は丸めず例外にする。

これはソース契約の調査であり、現在のCloud環境で同じ動作を確認した証拠ではない。

初期ローカル検証は全370テスト、型検査、buildが成功。追加7テストはfull state保持、stale/future拒否、途中rollback、readとstageの間の他者編集保持、同時更新で一方のみ成功、revision=0/不正値、未知のcommitエラー非再送を確認する。テストダブル単体では実サービスの原子性や性能を保証しないため、後述のCI診断でも確認した。

## 有効化前に必要な確認

- 実Appwriteの独立した一時テスト行で正常commit、stale拒否、future拒否時の途中増加rollback、同一revisionでの同時commitを確認し、行を削除する。
- 2026-09-21 JSTのローカルprobeは行作成時にHTTP 401 `general_unauthorized_scope`。その試行では行もtransactionも作成されていない。その後Appwrite管理画面へのログインを確認し、下記の実サービス検証を実施した。
- source上、3操作それぞれに最終行のupdateイベントを発行するため、外部webhook/realtime連携の重複処理とcommit時間の増加を確認する。ブラウザの既存state同期はWorker経由のpollだが、外部連携の不存在までは証明していない。
- 同じ計測対象・条件でGUIの編集・完了・F5・永続化を再測定する。transaction stage/commit増加が再読込削減を上回る場合は採用しない。

診断スクリプトと秘匿情報を含まない結果はGit対象外の `.qa-artifacts/latency-investigation/` に置く。現在の本番設定・本番ユーザーstate・計測Questはこの候補の検証では変更していない。

## 実サービス検証: 2026-09-21 JST

Appwrite管理画面の公式組み込みCLIを、ログイン済みconsole sessionで利用した。APIキーの取得・表示・権限変更はしていない。対象は `guilduo/user_states` の独立した一時行 `latency-probe-20260921-cyan` のみ。ownerIdも同じ合成ID、permissionsは空、stateJsonは文字列 `null`。

| ケース | 実際の結果 |
| --- | --- |
| revision=4で期待値4 | 3操作commit成功。読み戻しでrevision=5、指定したdeviceIdを確認 |
| revision=5で期待値4 | 上限5のエラー。revision=5、deviceId、updatedAtが変化しないことを確認 |
| revision=5で期待値6 | 2操作目で下限6のエラー。先の増加を含めrollbackされ、revision=5、deviceId、updatedAtが変化しないことを確認 |
| 期待値5の2本を先にstageしてからcommit | 片方のみ成功。読み戻しでrevision=6、成功側deviceIdを確認。ただし下記理由で同時commitの証拠にはしない |
| 後片付け | 自分で作成した5 transactionのDELETEはいずれも204。一時行DELETE=204、その後GET=404 |

2つのterminalから連続実行したが、ネットワーク記録では2本目のcommitは1本目の応答後に開始していた。console CLIが直列化するため、**重なった要求での同時commit検証は未完了**。

正常commit 1件の応答ヘッダー待ちは3,066ms、後続の競合拒否は2,084msだった。console session・経路・小さな合成payloadでの値であり、Worker経由のGUI保存や既存方式との比較として扱わない。性能改善は引き続き未証明。既存の本番CI接続を使い、独立行で実際の同時commitと同条件の既存方式比較を行う診断が次の候補になる。

## CIからの独立行検証

[診断Run 35520367808](https://github.com/ELRdn/Guilduo/actions/runs/35520367808)は成功。正常保存、古いrevision拒否、未来のrevisionでのrollbackに加え、応答待ちせず開始した2件のcommit区間の重なりを確認し、200/400の一方だけが成功した。読み戻しで勝者のpayloadとrevisionを確認した。全transactionと一時行を削除し、行のGET=404、`cleaned: true` まで確認済み。

同じ約44KiBの合成payloadで、各3回を交互に計測した。値はCI runnerからのread/begin開始〜commit応答本文完了（後続の検証read・掃除を除く）。

| 方式 | 試行1 | 試行2 | 試行3 | 中央値 |
| --- | ---: | ---: | ---: | ---: |
| 既存 | 3349ms | 2815ms | 2820ms | 2820ms |
| batch | 1733ms | 1765ms | 1703ms | 1733ms |

約39%短縮。batchのcommit単体は672〜692ms、既存は581〜911msで、操作増加分を含めても削減効果があった。この経路の結果をGUIの約1秒達成と扱わず、本番Worker反映後の実測で判定する。

2026-09-21 JSTのAppwrite管理画面ではWebhooksは `No webhooks yet`、Functionsも `No functions yet`。既存GUIはWorker pollingで同期している。今後Appwrite updateイベントを購読する連携を追加する場合は、batchが同じ最終状態に対して複数イベントを発生させることを考慮する。

rollbackはproduction環境変数 `APPWRITE_REVISION_BATCH=false` にして `Deploy Appwrite Worker` を再実行する。データ形式は変わらないため、既存方式で読み書きを継続できる。Siteの再deployは不要。
