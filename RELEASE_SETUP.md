# Guilduo tagged release setup

`main`へのpushではCIだけが動きます。`v*`タグは、版番号・main上の履歴・版別ノートを照合して検証後にGitHubのソースReleaseを公開します。本番配備は既存の手動Site／Worker workflowへ分離しました。2026-10-12、ひろなおの依頼で本体`v0.6.0-beta.8`のRelease更新を進めます。公開βのままで、実機・外部連携の全受入完了を意味しません。

公開URLの役割は[`docs/public-urls.md`](docs/public-urls.md)を正本の案内として参照します。正式Web Appは`https://app.guilduo.com/`、正式MCP endpointは`https://mcp.guilduo.com/mcp`、Appwrite API endpointは`https://api.guilduo.com/v1`です。

## GitHub Environment

手動本番配備にはRepository Settingsの`production` Environmentを使用し、Required reviewersを設定します。タグ用workflowは隔離example設定で検証し、production Environmentや配備Secretsを使いません。

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
- `APPWRITE_ENDPOINT`: `https://api.guilduo.com/v1`（Appwrite API Custom Domain。WorkerとWeb Appの実行時endpoint。generated endpointはrollback用に保持）
- `APPWRITE_SITE_ENDPOINT`: Appwrite Sitesのdeployment・Web Platform管理API用のリージョナルendpoint。`APPWRITE_ENDPOINT`とは分け、Site管理APIがCustom Domainでリージョン解決できない構成でも公開を継続できるようにする。これはユーザー向けURLではない
- `APPWRITE_PROJECT_ID`、`APPWRITE_DATABASE_ID`、`APPWRITE_STATE_TABLE_ID`、`APPWRITE_LEGACY_TABLE_ID`、`APPWRITE_SITE_ID`
- `D1_DATABASE_NAME`、`D1_DATABASE_ID`、`KV_NAMESPACE_ID`
- `R2_BUCKET_NAME`: Agent Avatar画像用R2バケット名。事前に`wrangler r2 bucket create <name>`で作成しておくこと。未設定の場合、Release設定生成は`AGENT_AVATARS` bindingを欠いたまま成功させず失敗する
- `EXTERNAL_OAUTH_ENABLED`: 公開βでは`false`
- `AGENT_AVATAR_CLEANUP_EXECUTE`（任意、Workerの`vars`へ手動追加）: 孤立したAgent Avatar R2オブジェクトの自動削除を有効にする。未設定または`"true"`以外は常にレポートのみ（15分ごとのscheduled実行でログ出力）。Release生成には含まれないため、明示的に設定しない限り本番は常にdry-run
- `SOURCE_URL`: リポジトリURL
- `GA4_MEASUREMENT_ID`（任意、Site配備）: 同意後に公開LP／Docs／活用ページから送信するGA4測定ID

公開識別子はVariablesへ置き、Appwrite API KeyとCloudflare API TokenはSecretsへ保存します。ブラウザ向け設定へAPI Keyを混ぜてはいけません。

## Release order

1. 変更をPRで検証し、mainへ統合。`package.json`と`package-lock.json`の版番号を揃え、`docs/releases/v<version>.md`に実装・検証・限界を記載する
2. 同じmainコミットに`v<version>`タグを作成してpushする。workflowはmain履歴、版番号、ノートの照合失敗で公開を停止する
3. API契約差分、デザイン、型、テスト、ビルド、隔離preview上のLP／Docs／Solutions／launchを検証する
4. ノート付きGitHub Source ReleaseとGitHub生成のソースZIP／tar.gzを公開する。Latestは最新の本体β版を指し、正式GAの判定には使わない。host拡張の独立版番号は変更しない

タグ公開でD1 migration、Site／Worker配備、Secrets更新は行わない。本番配備は`.github/workflows/deploy-appwrite-site.yml`と`deploy-appwrite-worker.yml`の手動実行で管理し、既存のproduction保護・キャッシュ停止・旧asset保持・配備後の起動確認を維持する。実Google OAuth・外部クライアント・実機の受入は別に記録する。

**2026-10-12のWorker配備注意:** 本番にはmainへ未統合の既存runtime修正がある。今回のSEO計測は稼働moduleに限定patchして配備済みで、タグのソースが本番Workerと完全一致するとは主張しない。汎用Worker workflowを実行する前にこの差分を統合・検証すること。詳細は[`docs/growth/seo-aeo-2026-10-12.md`](docs/growth/seo-aeo-2026-10-12.md)。

## Custom Domainの現在状態

- [x] Cloudflareで`guilduo.com`と`app.guilduo.com`を同じAppwrite Siteのactive deploymentへ接続し、host-based URL Rewriteを反映した
- [x] `mcp.guilduo.com`をWorkerのCustom Domainとして使用し、OAuth metadataと未認証`401`を確認した
- [x] Appwrite ConsoleのSite/Web Platformへ`guilduo.com`と`app.guilduo.com`を登録し、Google OAuthの戻り先を正式Web Appへ揃えた
- [x] Appwrite API Custom Domainを`api.guilduo.com`で有効化し、productionの`APPWRITE_ENDPOINT`を`https://api.guilduo.com/v1`へ移行した
- [ ] `www.guilduo.com`のDNSとapex redirectを有効化する（WAITING FOR DNS）
- [ ] `docs.guilduo.com`はDocumentation公開時まで予約扱いにする

host-based routingの詳細と、生成物・assetsを壊さない制約は[`docs/appwrite-site-routing.md`](docs/appwrite-site-routing.md)を参照する。

ソースReleaseの検証に失敗した場合はGitHub公開を停止します。本番切替・migrationの検証失敗も個別の手動配備を停止します。詳細は[`APPWRITE_MIGRATION.md`](APPWRITE_MIGRATION.md)を参照してください。
