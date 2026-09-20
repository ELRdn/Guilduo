# Appwrite保存方式の実サービス診断

`Probe Appwrite storage latency` は手動実行専用のGitHub Actions。既存production環境の `APPWRITE_API_KEY` を同じ公式Appwrite endpointに対して使う。キーを取り出したり公開したりしない。アプリ・Workerのdeploy、設定変更、新しいQuestの作成は行わない。

## 対象と後片付け

- 対象は固定のGuilduo project / database `guilduo` / table `user_states`。
- 実行ごとにランダムな `latency-probe-` IDの行を1つ作る。ownerIdも同じ合成ID、permissionsは空。既存ユーザーの行は取得しない。
- payloadは約44KiBの乱数から作る合成JSON。個人のstateはコピーしない。
- 操作対象のURLやrow IDを入力で変更する機能は設けない。
- 作成したtransactionのみ追跡し、正常・異常終了とも削除する。削除に失敗しても行の後片付けは試みる。
- 行のownerIdと合成payload、空permissionsを確認してから削除し、GET=404まで確認する。作成時409なら既存行を削除しない。作成応答が不明でも自分の行が存在するか確認する。
- API要求は15秒、transactionは120秒で期限切れ。CI強制終了などでfinallyが動かない場合は、ログのprobe row IDだけを管理画面で確認して片付ける。失敗時に `cleaned: true` を成功判定の代わりに使わない。

## 検証と計測

1. 一致するrevisionをcommitし、保存内容を読み戻す。
2. 古いrevisionの拒否と、未来のrevisionが2操作目で失敗した際のrollbackを確認する。
3. 同じrevisionへの2つのcommitを応答待ちせず開始する。クライアント側で時間区間が重なり、成功は1件だけで、成功側の内容が保存されたことを確認する。
4. 既存方式（read+begin並列→transaction read→stage→commit）と候補方式（read+begin並列→3操作batch→commit）を交互に各3回実行する。全試行で読み戻す。

ログのtotalMsはread/begin開始からcommit応答本文の受信完了まで。後続の検証readと掃除は含めない。RunnerからAppwriteへの値なので、Workerのregion配置、認証、GUI描画、F5の待ちを含まない。これだけで約1秒のGUI目標達成とは判定しない。候補方式の有効化も自動で行わない。

ローカルでは `npx tsx tools/probe-storage-latency.mts` は説明表示だけ。実行は `--execute` が必要。通常はGitHubの本ワークフローを使い、ローカルのread-only keyの権限を増やさない。
