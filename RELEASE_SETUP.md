# Guilduo tagged release setup

`main`へのpushではCIだけが動きます。公開デプロイは`v*`タグをpushした場合だけ実行されます。次のブランド導入候補は`v0.6.0-beta.8`ですが、[`docs/brand-rollout.md`](docs/brand-rollout.md)の権利・外部表示ゲート完了後に限ります。

## GitHub Environment

Repository Settingsで`production` Environmentを作成し、Required reviewersを設定します。

### Secrets

- `CLOUDFLARE_API_TOKEN`: Workers Scripts Editと対象D1の編集だけを許可したトークン
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID
- `APPWRITE_API_KEY`: `databases.read`、`tables.read`、`rows.read`、`rows.write`だけを許可したサーバーキー
- `APPWRITE_DEPLOY_KEY`: `sites.read`、`sites.write`、`log.read`、`platforms.read`、`platforms.write`だけを許可したデプロイキー

### Variables

- `WORKER_BASE_URL`: 例 `https://guilduo-gateway.example.workers.dev`
- `MCP_BASE_URL`（任意）: MCPの新しい公開origin。既定値は`https://mcp.guilduo.com`。接続先はこのoriginに`/mcp`を付けたURLです
- `MCP_ALLOWED_ORIGINS`（任意）: 新旧MCP originの明示allowlist。未設定時は`WORKER_BASE_URL`と`MCP_BASE_URL`から生成されます
- `PROVIDER_OAUTH_BASE_URL`（任意）: Google/Notion callback用origin。未設定時は`WORKER_BASE_URL`を使い、MCP URL変更でProvider callbackを変えません
- `WEB_APP_URL`: Web Appの正式origin。現在は`https://app.guilduo.com`を指定します。Appwrite Siteのgenerated domainは検証・rollback用に保持し、正式なユーザー導線には使いません
- `JOIN_GUILD_URL`（任意）: LPのCTA先。未設定時は`WEB_APP_URL/`を使い、`/next/`のcompatibility pathを新規導線にしません
- `PUBLIC_SITE_URL`（任意）: 公式サイト/LPのcanonical・OG・共有画像origin。既定値は`https://guilduo.com`です。`WEB_APP_URL`とは分離して指定します
- `APPWRITE_ENDPOINT`: `https://api.guilduo.com/v1`（Appwrite API Custom Domainの疎通確認済み。generated endpointはrollback用に保持）
- `APPWRITE_SITE_ENDPOINT`: Appwrite Sitesのdeployment・Web Platform管理API用のリージョナルendpoint。`APPWRITE_ENDPOINT`とは分け、Site管理APIがCustom Domainでリージョン解決できない構成でも公開を継続できるようにする
- `APPWRITE_PROJECT_ID`、`APPWRITE_DATABASE_ID`、`APPWRITE_STATE_TABLE_ID`、`APPWRITE_LEGACY_TABLE_ID`、`APPWRITE_SITE_ID`
- `D1_DATABASE_NAME`、`D1_DATABASE_ID`、`KV_NAMESPACE_ID`
- `R2_BUCKET_NAME`: Agent Avatar画像用R2バケット名。事前に`wrangler r2 bucket create <name>`で作成しておくこと。未設定の場合、Release設定生成は`AGENT_AVATARS` bindingを欠いたまま成功させず失敗する
- `EXTERNAL_OAUTH_ENABLED`: 公開βでは`false`
- `AGENT_AVATAR_CLEANUP_EXECUTE`（任意、Workerの`vars`へ手動追加）: 孤立したAgent Avatar R2オブジェクトの自動削除を有効にする。未設定または`"true"`以外は常にレポートのみ（15分ごとのscheduled実行でログ出力）。Release生成には含まれないため、明示的に設定しない限り本番は常にdry-run
- `SOURCE_URL`: リポジトリURL

公開識別子はVariablesへ置き、Appwrite API KeyとCloudflare API TokenはSecretsへ保存します。ブラウザ向け設定へAPI Keyを混ぜてはいけません。

## Release order

1. API契約差分、型、テスト、ビルド、LPを検証
2. D1の追加migrationを適用
3. `APPWRITE_SITE_ENDPOINT`でAppwrite Sitesを公開し、Deploymentの実URLをリクエストログから取得。`/lp/`、`/lp/en/`、`/next/relay-forge/`のcompatibility pathを確認
4. Appwrite Web Platformへ`app.guilduo.com`を登録し、Workerの`WEB_APP_URL`と`ALLOWED_ORIGINS`を正式originへ再生成。公式LPのoriginは`PUBLIC_SITE_URL`として許可する
5. Worker Secretを設定してWorkerを公開
6. `/health`、OAuth metadata、MCP認証拒否、公開ルートのGuilduo表記を確認
7. GitHub Releaseを作成

## Custom Domain切替の外部作業

- Cloudflareで`guilduo.com`と`app.guilduo.com`を同じAppwrite Siteのactive deploymentへ向け、[`docs/appwrite-site-routing.md`](docs/appwrite-site-routing.md)の2つのhost-based URL Rewriteを設定する。`www`はapex redirect、`mcp`はWorkerのCustom Domainへ向け、DNS反映を確認してから正式URLを有効化する
- Appwrite Consoleで`guilduo.com`を同じSiteのactive deployment domainとして追加し、既存の`app.guilduo.com`は維持する。両方をWeb Platformへ登録し、Google OAuthのsuccess/failure戻り先を`https://app.guilduo.com/`へ確認する
- Appwrite API Custom Domainは`api.guilduo.com`で有効化・疎通確認済み。productionの`APPWRITE_ENDPOINT`は`https://api.guilduo.com/v1`を正本にし、generated endpointはrollback用に保持する
- `docs.guilduo.com`はDocumentation公開時まで予約扱いにし、未構築のDNSやコード導線を追加しない

どのゲートでも失敗した場合はタグ公開を進めません。詳細は[`APPWRITE_MIGRATION.md`](APPWRITE_MIGRATION.md)を参照してください。
