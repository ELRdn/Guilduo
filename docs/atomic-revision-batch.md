# 保存往復の削減候補: commit時のrevision照合

状態: **実験・既定で無効・本番未検証**（2026-09-21 JST）。`APPWRITE_REVISION_BATCH=true` の場合だけ利用する。release設定生成にはまだ追加していない。

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

ローカル検証は全370テスト、型検査、buildが成功。追加7テストはfull state保持、stale/future拒否、途中rollback、readとstageの間の他者編集保持、同時更新で一方のみ成功、revision=0/不正値、未知のcommitエラー非再送を確認する。テストダブルはprovider契約を模擬しており、実サービスの原子性や性能を保証しない。

## 有効化前に必要な確認

- 実Appwriteの独立した一時テスト行で正常commit、stale拒否、future拒否時の途中増加rollback、同一revisionでの同時commitを確認し、行を削除する。
- 2026-09-21 JSTのprobeは行作成時にHTTP 401 `general_unauthorized_scope`。行は作成されず、transactionも開始していない。ローカルAPIキーの権限不足であり、アルゴリズムの失敗・成功のどちらとも扱わない。アプリ内ブラウザのAppwriteログインを依頼中。
- source上、3操作それぞれに最終行のupdateイベントを発行するため、外部webhook/realtime連携の重複処理とcommit時間の増加を確認する。ブラウザの既存state同期はWorker経由のpollだが、外部連携の不存在までは証明していない。
- 同じ計測対象・条件でGUIの編集・完了・F5・永続化を再測定する。transaction stage/commit増加が再読込削減を上回る場合は採用しない。

診断スクリプトと秘匿情報を含まない結果はGit対象外の `.qa-artifacts/latency-investigation/` に置く。現在の本番設定・本番ユーザーstate・計測Questはこの候補の検証では変更していない。
