# QuestForge tagged release setup

`main`へのpushではCIだけが動きます。公開デプロイは`v*`タグをpushした場合だけ実行されます。

## GitHub Environment

Repository Settingsで`production` Environmentを作成し、必要ならRequired reviewersを設定します。

### Secrets

- `CLOUDFLARE_API_TOKEN`: Workers Scripts Editと対象D1の編集だけを許可したトークン
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID
- `FIREBASE_SERVICE_ACCOUNT`: Firebase HostingとRealtime Database Rulesを公開できるサービスアカウントJSON全文

### Variables

- `WORKER_BASE_URL`: 例 `https://questforge-gateway.example.workers.dev`
- `WEB_APP_URL`: 例 `https://questforge-cb6ba.web.app`
- `FIREBASE_PROJECT_ID`、`FIREBASE_DATABASE_URL`、`FIREBASE_API_KEY`、`FIREBASE_AUTH_DOMAIN`
- `FIREBASE_STORAGE_BUCKET`、`FIREBASE_MESSAGING_SENDER_ID`、`FIREBASE_APP_ID`
- `D1_DATABASE_NAME`、`D1_DATABASE_ID`、`KV_NAMESPACE_ID`
- `SOURCE_URL`: privateリポジトリのURL。空でも可

Firebase Web設定、Worker URL、D1/KV IDは公開識別子なのでVariablesへ置きます。サービスアカウントJSONとCloudflare API TokenだけをSecretsへ保存します。Workflowはこれらからgitignore対象の設定ファイルを一時生成します。

## Release order

1. API契約差分、構文、テスト、ビルドを検証
2. D1の追加migrationを適用
3. Workerを公開
4. `/health`が`2.6.0`、Schema 6、D1 Agent Storageを返すことを確認
5. 成功した場合だけFirebase Database RulesとHostingを公開
6. `/`、`/next/`、OAuth metadata、MCP認証拒否を確認
7. GitHub Releaseを作成

Workerの確認に失敗した場合、Firebaseの公開処理には進みません。今回の実装ではタグを作成しません。
