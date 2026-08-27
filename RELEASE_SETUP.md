# Guilduo tagged release setup

`main`へのpushではCIだけが動きます。公開デプロイは`v*`タグをpushした場合だけ実行されます。現在のAppwrite版候補は`v0.6.0-beta.3`です。

## GitHub Environment

Repository Settingsで`production` Environmentを作成し、Required reviewersを設定します。

### Secrets

- `CLOUDFLARE_API_TOKEN`: Workers Scripts Editと対象D1の編集だけを許可したトークン
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID
- `APPWRITE_API_KEY`: `databases.read`、`tables.read`、`rows.read`、`rows.write`だけを許可したサーバーキー
- `APPWRITE_DEPLOY_KEY`: `sites.read`、`sites.write`、`log.read`、`platforms.read`、`platforms.write`だけを許可したデプロイキー

### Variables

- `WORKER_BASE_URL`: 例 `https://guilduo-gateway.example.workers.dev`
- `WEB_APP_URL`: 初回生成用の既知のAppwrite Sites URL。リリース中は新Deploymentの実URLで上書きされます
- `APPWRITE_ENDPOINT`: 例 `https://sgp.cloud.appwrite.io/v1`
- `APPWRITE_PROJECT_ID`、`APPWRITE_DATABASE_ID`、`APPWRITE_STATE_TABLE_ID`、`APPWRITE_LEGACY_TABLE_ID`、`APPWRITE_SITE_ID`、`APPWRITE_WEB_PLATFORM_ID`
- `D1_DATABASE_NAME`、`D1_DATABASE_ID`、`KV_NAMESPACE_ID`
- `EXTERNAL_OAUTH_ENABLED`: 公開βでは`false`
- `SOURCE_URL`: リポジトリURL

公開識別子はVariablesへ置き、Appwrite API KeyとCloudflare API TokenはSecretsへ保存します。ブラウザ向け設定へAPI Keyを混ぜてはいけません。

## Release order

1. API契約差分、型、テスト、ビルド、LPを検証
2. D1の追加migrationを適用
3. Appwrite Sitesを公開し、Deploymentの実URLをリクエストログから取得
4. 実URLをAppwrite Web Platformへ登録し、Workerの`WEB_APP_URL`と`ALLOWED_ORIGINS`を再生成
5. Worker Secretを設定してWorkerを公開
6. `/health`、OAuth metadata、MCP認証拒否、公開ルートのGuilduo表記を確認
7. GitHub Releaseを作成

どのゲートでも失敗した場合はタグ公開を進めません。詳細は[`APPWRITE_MIGRATION.md`](APPWRITE_MIGRATION.md)を参照してください。
