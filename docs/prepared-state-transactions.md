# 空の保存トランザクションの事前準備

状態: 実装・ローカル検証中。本番の性能改善はまだ未検証。

GUI編集ではtransaction開始に約200ms、状態取得に約40〜60msかかり、両者は既に並列化されている。空のtransactionだけを操作前に準備できれば、その差分を保存待ちから減らせる可能性がある。stage・commitの通信、全状態のgzip保存、revision照合は維持する。

## 境界

- 既定は無効。`APPWRITE_PREPARED_TRANSACTIONS=true` と `APPWRITE_REVISION_BATCH=true` の両方が必要。不正値・batch無効との組み合わせはrelease設定生成で拒否する。
- 成功した認証済みWeb bootstrap（quests:writeあり）、Web RESTのQuest作成・編集・scoreの後だけ `waitUntil` で準備する。OAuth、MCP、定期処理、外部同期、dry-runは対象外。
- 1つのWorker環境オブジェクトにつきready最大1件、作成中最大1件。同じ環境のリクエスト間で共有するのは空のtransaction IDと期限だけ。ユーザー・状態・revision・操作は含まない。環境が再生成された場合は利用率が下がるだけで、保存方式は変わらない。
- TTL60秒に対し、作成要求開始から30秒以内だけ利用する。残り30秒以上を保存に残す。古い空transactionはサービスのTTLで失効し、定期更新やタイマーは追加しない。
- `take()` はawait前にslotを空にする。同じIDを2回配布しない。作成中のPromiseは別リクエストへ渡さず、未準備ならその保存自身が新規作成する。
- 借用後は現行の本人状態read、ドメイン検証、batch stage、commitを実施。失敗時の破棄、既知の競合だけの再試行を維持する。期限切れや未知の保存失敗を成功・無条件再送へ変換しない。
- 準備失敗は準備slotに残さず、実際の保存は通常経路を使う。準備要求が不確実でもユーザー状態を変更していない。実際の保存の不確実なcommitは再送しない。
- 準備分のAppwrite要求は増える。1回だけ開いて保存しない場合、空transaction1件がTTLで失効する。アクセスしていない間の補充はない。

[Appwriteのtransaction仕様](https://appwrite.io/docs/products/databases/tablesdb/transactions)に従い、作成・stage・commitは分離したまま。これは保存操作の先行実行や認証キャッシュではない。

## 検証と採用条件

slotの同時claim、準備中の即時fallback、30秒境界、作成時間を含む期限、準備失敗、環境分離、ドメイン失敗後の非再利用、他者編集保持、競合retry、未知commitの非再送をテストする。Web bootstrapからPATCHまでの経路でも `tx_prepared` と永続化を確認する。

本番の採用はWorker配備後に判定する。計測対象のQuestに限り作成・複数編集・完了し、F5後の文面と完了を確認する。`Server-Timing` の `tx_prepared` は準備済み利用、`tx_begin` は通常作成を示す。`tx_prepare` は背景準備であり、レスポンス後に完了した分はそのレスポンスの時間に含まれない。GUI全体・Worker・stage/commitの時間を併記し、準備のヒット率が低い場合や全体が速くならない場合は採用しない。

Rollbackはproductionの `APPWRITE_PREPARED_TRANSACTIONS=false` とWorker再配備。データ・schema・公開API・Siteに変更はない。公開HTMLのキャッシュ設定を触る必要もない。
