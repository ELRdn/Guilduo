# Guilduo ローンチ計測候補

更新: 2026-10-04。ローカル実装・隔離検査の仕様。2026-10-04にひろなおが本測定契約を承認。本番有効化・法的条件・販売条件・公開Goは別途残る。

ひろなお承認済みの対象は「外部AIを使う個人開発者」。Activationは、同じQuestとAgentについて「実Agent接続→保存されたQuest依頼→保存されたHuman回答→保存されたAgent再開」を確認した時点とする。提案表示・クリック・Checkoutへの復帰だけでは成功にしない。

| 段階 | 記録源 | 集計と制約 |
| --- | --- | --- |
| 広告 | 有限のcampaign登録。実広告費・表示・広告クリックは広告管理画面の別資料 | 広告管理画面の自動取得は未実装。費用／CACは未照合ならnull |
| LP | LP側で明示同意した訪問セッションとCTA | 人数ではなくセッション。拒否・未照合分を識別して補完しない |
| Sign up | 検証済みAppwriteアカウント作成日時とApp側の別同意 | 既存アカウントの初回workspaceを登録と扱わない。未知の作成日時は別区分 |
| Activation | 実Workerの認証と保存済みドメインイベント | 同じQuest／Agentの順序を照合。保存outboxから重複排除して再送 |
| Retention | 保存済みの有意味なQuest操作 | 登録日時基準。窓の終了前はpending、成熟分母0なら率null |
| Paid conversion | Stripe照会で検証した最初の正額invoice | 早期購入も数える。返金・紛争を別反映。初回購入のみで再購入を混ぜない |

Activation7日、登録からの有料化30日、LP帰属30日、継続D1=[24h,48h)、D7=[168h,192h)、D30=[720h,744h)は**本人採用値（2026-10-04）**。実開始時刻・campaign・除外IDを整合してから公開Goに含める。LP→登録率も窓が成熟した同意済みセッションだけを分母とし、全訪問・全利用者のCVRとは表示しない。広告別実原価、MRR、税・決済手数料、全登録に対する同意率は未照合ならnull。

LPのcapabilityはランダム、15分、1主体だけが取得可能。AppへURL fragmentで渡し、直ちにURLから除去してsession storageへ移す。LP同意はAppの本人紐付け同意を兼ねない。獲得元はAppの初回同意で固定し、不明も固定する。登録後のUTMや同意撤回後の再同意を新しい獲得にしない。任意URL、Quest本文、回答、email、JWT、raw IP、fingerprintは計測へ送らない。

別のランダムsubject IDとD1内の非公開対応表を用いるため、この機能は仮名化された本人連結計測であり匿名ではない。既存`/telemetry`は別の匿名契約を保つ。拒否しても認証・Quest・MCP・購入を使える。設定の撤回はD1の任意イベント／支払投影／取得済みLP連結を削除し、古いsubjectの保存outboxを再送不能にする。再同意では新しいsubjectを発行する。

90日経過でsubjectの採取・集計を停止する。15分cronでD1を削除し、private snapshotのoutboxを削除キューで処理する（1回25件、失敗は1時間後再試行）。新しい同意epochのoutboxは削除しない。障害／backlogで物理削除が遅れた場合、`collector.failures`と`cleanup.pending/oldestRequestedAt/retrying`を確認し、削除依頼を閉じない。D1停止中の失敗数は完全には残せない。snapshotのoverflowや同意lookup失敗を完全な観測へ読み替えない。拒否を跨端末で維持する最小設定はアカウント削除まで保持する。

Stripeで一つのchargeが複数invoiceへ割り当てられ、返金の所属を確定できない場合、正確な返金合計はnull、保守的上限と不明件数を表示する。benefit取消の保守的処理と現金集計の確度を区別する。金融台帳や法定保存は任意計測の削除対象に含めない。

## 設定・運営

- ローカルはGit管理外の`.dev.vars`、CIはGitHub Secrets、実行時はWorker Secretsへ秘密値を置く。秘密値をチャット・公開設定・manifest・Release証拠へ入れない。
- `ANALYTICS_ENABLED=false`と`ANALYTICS_DATA_POLICY_APPROVED=false`が既定。承認後にだけ`ANALYTICS_CONFIG`（版2026-10-04、環境、開始時刻、測定窓、有限campaign、運営者除外ID）を設定する。
- `ANALYTICS_TOKEN_KEY`と`ANALYTICS_ADMIN_TOKEN`は独立した32文字以上の秘密値にする。adminはbilling adminと分離する。広告collectorはadmin機能を持たない。鍵の更新は既存token／HMAC参照への影響を含めて運営判断する。
- `ANALYTICS_ALLOW_LOCAL`、`ANALYTICS_NOW`は隔離テスト専用。本番へ設定しない。個人IDは環境変数の公開用設定に含めずWorker専用にする。
- 管理レポートは`node --import tsx tools/analytics-admin.mts`でprivate JSON/CSVを保存。通常のHuman JWTやMCPから管理操作はできない。
- 本人確認と対象範囲の確定後にだけ`node --import tsx tools/analytics-admin.mts delete-account <exact-owner-id>`を使う。任意計測と同意設定だけを削除する。exit2はprivate snapshot未削除で、完了と扱わない。他ストア・identity・OAuth・バックアップ・法定保持は[運用手順](launch-operations.md)で別に確認する。

目的／窓／保持・削除条件は本人承認済み。正式公開には、公式originと実Google／MCP／Live決済の受入、成熟集計と原価照合、運営責任者と削除backlog監視が必要。[ロードマップ](launch-roadmap.md)のLA-12〜16をローカルPASSだけで完了しない。
