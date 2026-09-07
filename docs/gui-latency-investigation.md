# Guilduo GUI 遅延調査 — 2026-09-07

## 結論

本番GUIの再読み込み・編集保存・完了で数秒から11秒台の待ちを再現した。読み込み時の本番Workerログでは、CPU時間に対して実行経過時間が大きく、通信・ストレージ等の待ちが支配的。単純な画面描画の最適化だけでは解消しない。

保存経路には、GUI認証のD1検索→KVフォールバック→Appwrite本人確認に加え、ユーザー全体の状態を保存する5段階のAppwrite通信がある。実際の関数を使ったローカル診断で8段階の直列処理を確認した。ただし、**編集11.31秒の各段階への秒数配分は未計測**。MCPも同じ保存処理を使うため、保存方式だけでGUIとMCPの差を断定できない。

1〜8節は修正前の調査記録。その時点ではアプリコード、DBスキーマ、認証設定、デプロイ設定を変更していない。9〜10節に、その後の修正とローカル検証の結果を記載する。

## 1. 本番での再現

対象: ログイン済みChromeの `https://app.guilduo.com/`。

| 操作 | 観測時間 | 回数・条件 |
| --- | ---: | --- |
| 再読み込み | 6,146 / 3,845 / 3,562 ms | 連続3回。操作可能な画面の出現まで |
| Quest作成 | 7,586 ms | 承認済みの計測専用Quest、1回 |
| 編集保存 | 11,308 ms | 同じQuestの「次の一手」を変更、1回 |
| 完了 | 9,781 ms | 同じQuest、1回 |
| ログ収集時の再読み込み | 11,151 ms | 追加1回。2026-09-07 12:04:47.778 UTC開始 |

ボタン操作直前から、アクセシビリティツリーに更新通知または操作可能な画面が現れるまでを同一スクリプト内で計測した。ブラウザ操作・観測のオーバーヘッドを含む概測であり、純粋なHTTP時間や描画完了時間ではない。ツール呼び出し全体の所要時間や、途中で失敗したPlaywrightの待機タイムアウトは測定値に含めていない。

専用Questの編集内容・完了状態は再読み込み後も確認できた。以後の調査では追加Questを作成せず、完了済みの専用Questも変更していない。公開UIでは完了済みQuestに編集操作が出ないため、本番PATCHの追加ログ測定は実施していない。

## 2. 本番Workerログ

`wrangler tail` を一時接続し、再読み込みに対応するリクエストを観測した。認証ヘッダー、本文、メールアドレスは調査用JSONに記録していない。Tail接続は終了済み。

| 要求 | status | wallTime | cpuTime |
| --- | ---: | ---: | ---: |
| GET /v1/quests | 200 | 2,217 ms | 37 ms |
| GET /v1/character | 200 | 1,280 ms | 22 ms |
| GET /v1/battle/session | 200 | 2,068 ms | 19 ms |
| GET /v1/integrations | 200 | 1,008 ms | 4 ms |
| GET /v1/profile | 200 | 1,825 ms | 3 ms |
| GET /v1/party | 200 | 476 ms | 3 ms |
| GET /v1/agents | 200 | 1,756 ms | 3 ms |
| GET /v1/agent-connections | 200 | 1,462 ms | 9 ms |
| POST /mcp（GUIからのtools/list） | 200 | 899 ms | 3 ms |

9件の本要求に加え、対応するOPTIONSが9件。OPTIONSは204、Worker内では0〜1msだった。実際のネットワーク往復時間がゼロという意味ではない。後続8件は並列実行なので、表のwallTimeを合算してロード時間にしてはいけない。wallTimeはWorker実行の経過時間で、ブラウザが応答を受信した時刻そのものではない。

この観測範囲では401、429、5xx、Worker例外はなかった。POST /mcpはGUI自身のメタデータ取得であり、OAuth接続のMCPクライアントとの比較測定ではない。

別途、認証不要の `/health` をNodeから3回取得すると、応答ヘッダーまで551 / 131 / 133ms、Worker側のwallTime/cpuTimeは0msだった。経路・接続再利用条件がGUIと異なるため、API時間から差し引く用途には使わない。

証跡: `../.qa-artifacts/latency-investigation/production-tail.json`（ローカル、Git管理外）。

## 3. 原因となる構造

### A. 初期表示は、不要なパネル情報まで全部待つ

- `interaction-lab/relay-forge/main.ts:101` は `createProductionRuntime` 完了まで画面をマウントしない。
- `interaction-lab/relay-forge/production.ts:224` は `repository.loadSnapshot()` を待つ。
- `interaction-lab/repository.ts:240` はQuest一覧を取得した**後**に8件を開始し、`Promise.allSettled` の全完了を待つ。
- Quest・Character・Battleはそれぞれ `stateFor` 経由で同じユーザー状態を読み込む。認証も各要求で繰り返す。
- `allSettled` は失敗の許容であり、遅い要求を待たずに表示する仕組みではない。要求の明示的なタイムアウトもない。

ローカル診断でPartyの応答だけを保留すると、他の要求が完了しても `loadSnapshot()` は完了しなかった。画面を操作するのに不要な情報が初期表示を止めることを再現した。

### B. GUI認証がOAuthストアを経由する

`worker/src/security.ts:92` はBearerを受け取ると、まずOAuthのaccessレコードを検索する。`worker/src/oauth-record-store.ts:28` はD1にない場合KVへフォールバックする。Appwrite JWTは通常そのレコードが存在しないため、D1→KVの不一致確認後、`security.ts:69` のAppwrite `/account` 検証へ進む。

初期表示9要求では、この経路が各要求で実行される。JWT発行自体はクライアントでキャッシュされるが、Worker側の本人確認は毎回行われる。F5ではクライアントのメモリ上のキャッシュも作り直しになる。

OAuthのMCP接続ではAppwrite `/account` 検証を省略する経路がある。一方、接続・Agent使用履歴等の処理はMCP側に別途存在する。したがって「MCPは認証待ちゼロ」とは言えない。

### C. 1件の更新でも、全状態を5回の通信で保存する

REST PATCHは `worker/src/index.ts:1262` 付近から `mutateAndNotify` → `mutateState` へ進む。

`worker/src/appwrite-store.ts:217` の通常成功経路:

1. ユーザー全体の状態を取得する。
2. メモリ上で対象Questを変更し、全状態をgzip圧縮する。
3. Appwriteのtransactionを作成する。
4. transaction内でも状態行を読み、revisionを確認する。
5. 全状態の更新をstageする。
6. transactionをcommitする。

このうちリモート通信は1・3・4・5・6の5回。GUIの認証を含めると、D1・KV・Appwriteへの最低8段階の直列処理になる。競合時は状態変更処理全体を最大4回試すため、待ちがさらに増える可能性がある。今回の本番で競合が発生した証拠はない。

作成・編集・完了で同じ構造を使用する。作成は、Toggl Focus自動連携が有効な場合、さらに連携処理を待つ分岐がある。今回その分岐が有効だったとは確認していない。

Webhook配信は `context.waitUntil` に渡されており、通常の保存応答がWebhook完了を直接待つ構造ではない。

MCPの `update_quest` も同じ `mutateAndNotify` を使用する。ストレージ方式は双方に共通する問題。

### D. 保存の完了まで画面が確定しない

`interaction-lab/relay-forge/shell.ts:708` と `:1384` はAPI応答後に状態を取り込み、再描画する。編集・完了後に初期Snapshot9件を再取得する構造ではない。今回の待ちを「保存のたびに画面全体のデータを取り直している」と説明するのは誤り。

処理中表示はあるが、画面の確定状態は保存が終わるまで変わらない。これは待ちを体感しやすくする要因。楽観的更新を導入する場合も、失敗時の復元や二重送信防止が必要。

### E. CORS事前確認の再利用を明示していない

本番OPTIONS応答に `Access-Control-Max-Age` がないことを直接確認した。`worker/src/index.ts:536` のCORSヘッダー設定にもない。観測したリロードでは本要求9件に対しOPTIONS9件が発生した。

適切な有効期間を設定する余地がある。ただし、OPTIONS自体のサーバー処理は軽く、これだけで保存11秒を説明する証拠はない。

## 4. 別途再現した認証の不具合

`interaction-lab/repository.ts:220` は401時に `getToken(true)` を呼ぶ。しかし `interaction-lab/relay-forge/main.ts:105` の `getToken: () => getIdToken()` が引数を捨てるため、`appwrite-auth.ts:125` のキャッシュ済みJWTが再利用される。

実際のAuthファサードとRepositoryを使った診断:

| 接続方法 | JWT発行回数 | 結果 |
| --- | ---: | --- |
| 現行と同じ、引数を捨てる接続 | 1 | 同じ拒否済みトークンで再送し401 |
| 比較用の診断内で引数を渡す接続 | 2 | 新しいトークンで200 |

本番コードは変更していない。今回の本番ログは全件成功なので、この不具合を今回の遅延原因としては断定しない。

## 5. ローカル診断と本番データ量

本番Appwrite状態行はschemaVersion 7、revision 58、gzip表現67,965文字だった。原文は調査ファイルに保存していない。

ローカル診断は合成Quest76件と合成履歴を使い、約252KBのJSON全体を変更・圧縮・保存する経路を実行した。

| 条件 | 編集 | 完了 | 作成 |
| --- | ---: | ---: | ---: |
| 偽リモート応答に待ちを入れない | 39ms | 18ms | 17ms |
| 各リモート処理に100msの待ちを入れる | 889ms | 884ms | 884ms |

これはWindowsのNode上の合成測定であり、本番Workerの性能値ではない。8段階の直列待ちが合算されることと、通信を除いた処理だけでは秒単位にならないケースを示す。実際の本番データを使ったCPUプロファイルではない。

診断ソース: `../.qa-artifacts/latency-investigation/probe.mts`

再実行（既存依存のみ、ネットワーク送信・本番書き込みなし）:

```powershell
node -e "require('esbuild').buildSync({entryPoints:['.qa-artifacts/latency-investigation/probe.mts'],bundle:true,platform:'node',format:'esm',outfile:'.qa-artifacts/latency-investigation/probe.mjs'})"
node .qa-artifacts/latency-investigation/probe.mjs
```

結果: `../.qa-artifacts/latency-investigation/synthetic-probe.json`。修正前の8段階の順序・保存revision・Party保留・401再送についてのassertionはすべて通過した。このprobeは旧実装の診断用であり、以下の修正後の受入には `npm test` と `npm run latency:verify` を使う。

## 6. 公開環境とマージ済みコードの差

- PR #22: 2026-09-07 08:17:56 UTCにマージ。merge commit `50b661c0928685c3bb4f0f216fba9a5f1177046c`。
- GitHub Actions: 当該マージ後はCI成功。直近のSite配備は前の `aa884c1`。
- Appwriteの有効Site deployment: `6a9d442b915a85cdc933`。Site更新は2026-09-06 10:45:51 UTC。
- Cloudflareの有効Worker version: `d6c519f8-b962-45b7-a3b6-315b68023231`。配備は2026-09-06 14:48:13 UTC、状態保存上限の修正。
- 本番 `/health` のMCP tool数は54。ローカルPR後の56とは異なる。
- Site/Workerの配備workflowは `workflow_dispatch`、releaseはtag起動。mainへのマージだけでは配備されない。

今回の遅延を「PR #22の配備によって発生した」とは扱えない。調査した認証・Snapshot取得・transaction保存の主要経路は、PR前後の差分でも維持されていた。

## 7. 改善の優先順位

1. **初期表示を分割する。** Quest表示に必要な情報で先に画面を出す。Party・Connections・Skills等は独立して取得・エラー表示する。Quest/Character/Battleの同じ状態の再読込もまとめる。
2. **認証の余分な経路を減らす。** JWTとOAuthの識別方法を互換性・検証を保って整理し、JWTのOAuth D1/KV検索を省く案を検証する。401のforceRefresh引数も正しく渡す。
3. **保存の直列通信を減らす。** 本番で各段階の時間を測定したうえで、transaction APIの使い方、ユーザー全状態保存とQuest単位保存の設計を比較する。revision確認・競合防止を削るだけの高速化は行わない。
4. **画面の即時反応を改善する。** 保存中・成功・失敗を明確にし、必要なら復元可能な楽観的更新を導入する。
5. **CORS・タイムアウト・計測を整える。** 適切なpreflightキャッシュ、読み込みの時間制限、本文や認証情報を含まない処理段階ごとの計測を追加する。書き込みtimeoutは保存結果不明と区別し、盲目的に再送しない。

## 8. 未確定の範囲

- 作成・編集・完了の本番操作時間は測定済みだが、その時点のPATCH/POST内部の段階別traceはない。今回のlive tailはGET群とGUIのtools/listを対象に取得した。
- Appwrite `/account`・状態読込・transaction開始・stage・commitそれぞれの本番時間、D1/KVの個別時間、競合再試行回数は未計測。
- 認証済みMCPクライアントとGUIで同一更新を同条件で比較していない。
- リロード11.15秒の全区間を、認証・静的ファイル・JWT発行・描画に分配できていない。ブラウザとWorkerの時計も異なるため、差引きで厳密な区間時間を作っていない。
- 合成診断は計測点と構造の検証であり、修正後の性能保証ではない。修正・配備・受入は別途必要。

## 9. 修正内容（2026-09-07、PR #22のマージ後を基点）

基点は `origin/main` の `50b661c`。作業ブランチは `codex/fix-gui-latency`。前のPRのHuman Inbox、外部確認、Agentへの依頼・人への確認依頼を保持した追加修正。

| 対象 | 修正後の動作 |
| --- | --- |
| F5後の初期表示 | Quests・Profile・Agentsの3件を並列取得してタスク画面を表示。残り6件は表示後に取得する。以前の「Questsの後に8件、全件待ち」を解消。総リクエスト数の削減ではなく、初期表示の待ち合わせ範囲の縮小。 |
| 補助画面 | 読み込み中・失敗・再試行を表示。遅れた結果は補助情報だけに反映し、編集済みQuest・Profile・Agentsを上書きしない。画面破棄後も再描画しない。 |
| JWT発行 | 同時に発生した要求は1回の発行を共有。401時の強制更新引数を渡し、サインアウト前に始まった発行結果をキャッシュへ戻さない。 |
| Worker認証 | compact JWT形式はAppwrite検証へ直接進め、opaque OAuth用D1/KVの余分な検索を省く。JWTの内容を未検証で信用せず、OAuthの既存失効検査も維持。 |
| 編集・完了保存 | 最初の状態取得とtransaction作成を並列化。保存用Appwrite通信は5件を維持し、直列の待ち合わせを5段から4段へ短縮。revision再確認・commit時の競合検出・再試行を維持。失敗時は未完了transactionを破棄。 |
| 保存状態 | 編集ボタンと中央・補助パネルで保存待ちを表示し、送信中の操作を無効化。成功応答を受け取ってから完了扱いにする。 |
| CORS・期限 | 許可Originのpreflightを600秒キャッシュ可能にする。GETとMCP tools/listに15秒の通信期限を付ける。更新要求はタイムアウトで自動中断・再送しない。 |

Appwriteの競合検出は操作をstageした時点からの変更に基づくため、transaction作成を前倒しするだけで読込時点の保護が強くなるとは扱わない。既存revision再確認を省かない。[Appwrite公式のtransaction仕様](https://appwrite.io/docs/products/databases/tablesdb/transactions)

補助6件は現在も1グループで完了を待つため、遅い補助通信は他の補助画面の表示を遅らせる場合がある。タスク編集はこの待ちから切り離した。ユーザー全状態のgzip保存、Appwriteのリージョン間通信、`/account`の実検証は残る。状態の分割保存や認証検証のキャッシュは今回導入していない。

## 10. 修正後の受入と公開境界（ローカル検証時点）

- `npm test`: 352件通過。JWTの検証・単一発行・失効後の遅延結果、任意パネル失敗、読込期限と更新非再送、保存の並列開始、同時更新時の保持、保存失敗後の後処理を含む。
- `npm run relay:verify`: 前のPRの32ブラウザケース。HTTP/MCP経由のHuman↔Agent連携も含む。
- `npm run latency:verify`: 7ブラウザケース。320/412/1440pxで補助読込中の編集、応答後の編集内容保持、失敗・再試行、編集中の入力保持、完了保存中の表示・二重操作防止、破棄後の応答を検証。
- 型検査、デザイン規約、API契約再生成、配信用ビルドを実行。OpenAPI・56 MCP toolsの契約変更なし。既存のCommonJS/ESM混在に関するビルド警告は残る。
- ブラウザ検証はローカルの合成データと一時プロファイルを使用。本番の追加Quest作成や既存Quest編集はしていない。
- 証跡は `.qa-artifacts/latency-investigation/` に保存（Git対象外）。ブラウザ結果は `browser/results.json`、画面幅別の待機表示は `browser/pending-*.png`。

**この節の検証時点では本番未配備。** SiteとWorkerの両方の配備後に、F5・計測用Questの編集・完了を同じ条件で再計測する必要がある。この時点で本番の短縮秒数・p95は未検証。上の直列段数や合成テストを実測改善率に換算しない。
