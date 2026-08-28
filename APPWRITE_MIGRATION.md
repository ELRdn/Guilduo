# Firebase to Appwrite migration

Guilduo `v0.6.0-beta.1`は、認証・ユーザー状態・Web配信をFirebaseからAppwriteへ移行します。切替前にFirebaseを削除せず、検証済みの単一カットオーバーを行います。

## Resource contract

- Project: `Guilduo`
- Database: `guilduo`
- `user_states`: Appwrite UIDを行IDにした現行状態。直接クライアント権限は付けず、Workerだけが読み書きする
- `legacy_states`: Firebase Authのメールアドレスを正規化してSHA-256化した行ID。初回Appwriteログイン時にWorkerが本人へ移管する
- Sites: `guilduo-web`

Appwrite API KeyはWorker Secretだけに保存します。Webへ公開するのはendpointとproject IDだけです。

## Export and dry run

Firebase ConsoleまたはAdmin SDKでAuthユーザーJSONとRealtime Database JSONを同じ時点で取得します。その後、まずdry-runします。

```bash
npm run migrate:appwrite -- --state-export ./private/firebase-rtdb.json --users-export ./private/firebase-auth.json
```

`ready + skipped`が対象ユーザー数と一致し、skippedの理由を解消してから実行します。

## Execute

```bash
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1 \
APPWRITE_PROJECT_ID=... \
APPWRITE_DATABASE_ID=guilduo \
APPWRITE_LEGACY_TABLE_ID=legacy_states \
APPWRITE_API_KEY=... \
npm run migrate:appwrite -- --state-export ./private/firebase-rtdb.json --users-export ./private/firebase-auth.json --execute
```

秘密ファイルとAPI KeyはGitへ追加しません。実行後は件数とchecksumを照合し、代表ユーザーでQuest数、完了・保管状態、担当、期日、Evidence、キャラクター状態を比較します。

## Cutover gates

- Appwrite Google OAuthが有効で、本番SiteとWorker callbackがPlatform/redirect先として登録済み
- 新規ユーザーのログイン、作成、更新、サインアウト、再ログインが成功
- 既存ユーザーの初回ログインで`legacy_states`から`user_states`へ一度だけ移管
- Desktop/MobileのCommand、Quests、作成・編集・保管・全件表示が成功
- Worker `/health`、`/v1/state`、MCP OAuthが成功
- 監視中にFirebaseへの新規書き込みがない

切替後24時間はFirebaseを読み取り可能なロールバック元として保持します。Appwrite側でデータ欠損が見つかった場合はWeb URLを旧版へ戻し、Firebaseを再度書き込み可能にして原因を修正します。

## Agent Registry owner recovery

`legacy_states`へ移したのはユーザー状態だけです。D1のAgent RegistryがFirebase UID所有のまま残った場合は、次の順序で復旧します。

1. D1をexportし、復元可能なバックアップを保管する。
2. Appwrite `legacy_states`由来の`firebaseUid`/`emailHash`と、Appwrite Users API由来の本人確認済みemail/UIDをidentity proof JSONにする。初回移管で`legacy_states`が削除済みの場合だけ、Firebase Auth exportのUID/emailを代替根拠にできる。
3. D1のAgent/Connection棚卸しをsnapshot JSONにし、dry-runする。

```bash
npm run migrate:agent-owners -- --identity-proof ./private/agent-owner-proof.json --d1-snapshot ./private/agent-registry-snapshot.json
```

`legacySource`が`firebase:auth-export`の場合、execute時にも同じAuth exportを再検証する。

```bash
npm run migrate:agent-owners -- --identity-proof ./private/agent-owner-proof.json --d1-snapshot ./private/agent-registry-snapshot.json --firebase-auth-export ./private/firebase-auth-users.json --backup ./backups/agent-registry.sql --execute
```

dry-runの`conflicts`が0で、件数とchecksumを確認し、本番実行の明示承認を得た後だけ`--execute`を追加します。実行時は空でない`--backup`とCloudflare D1用の環境変数が必須です。Agent本体だけをコピーし、旧UID行とConnectionは残します。

旧OAuth TokenはUIDを書き換えず、KV棚卸しとバックアップ後に別工程で失効します。

```bash
npm run revoke:legacy-mcp -- --identity-proof ./private/agent-owner-proof.json --inventory ./private/legacy-mcp-inventory.json
```

承認後の`--execute`はAccess/Refresh Tokenを削除し、旧Grantをrevokedにします。Client registrationは保持し、Appwrite認証で再接続した新ClientをGuilduoのConnectionsから復旧Agentへ再リンクします。
