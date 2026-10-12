# Guilduo tagged release setup

`main`へのpushではCIだけが動きます。本番公開は承認済みの手動workflow、正式Releaseは`v*`タグworkflowで実行します。どちらも署名付き候補証拠とproduction承認が必要です。次のブランド導入候補は`v0.6.0-beta.8`ですが、[`docs/brand-rollout.md`](docs/brand-rollout.md)の権利・外部表示ゲート完了後に限ります。

公開URLの役割は[`docs/public-urls.md`](docs/public-urls.md)を正本の案内として参照します。正式Web Appは`https://app.guilduo.com/`、正式MCP endpointは`https://mcp.guilduo.com/mcp`、Appwrite API endpointは`https://api.guilduo.com/v1`です。

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
- `APPWRITE_ENDPOINT`: `https://api.guilduo.com/v1`（Appwrite API Custom Domain。WorkerとWeb Appの実行時endpoint。generated endpointはrollback用に保持）
- `APPWRITE_SITE_ENDPOINT`: Appwrite Sitesのdeployment・Web Platform管理API用のリージョナルendpoint。`APPWRITE_ENDPOINT`とは分け、Site管理APIがCustom Domainでリージョン解決できない構成でも公開を継続できるようにする。これはユーザー向けURLではない
- `APPWRITE_PROJECT_ID`、`APPWRITE_DATABASE_ID`、`APPWRITE_STATE_TABLE_ID`、`APPWRITE_LEGACY_TABLE_ID`、`APPWRITE_SITE_ID`
- `D1_DATABASE_NAME`、`D1_DATABASE_ID`、`KV_NAMESPACE_ID`
- `R2_BUCKET_NAME`: Agent Avatar画像用R2バケット名。事前に`wrangler r2 bucket create <name>`で作成しておくこと。未設定の場合、Release設定生成は`AGENT_AVATARS` bindingを欠いたまま成功させず失敗する
- `EXTERNAL_OAUTH_ENABLED`: 公開βでは`false`
- `AGENT_AVATAR_CLEANUP_EXECUTE`（任意、Workerの`vars`へ手動追加）: 孤立したAgent Avatar R2オブジェクトの自動削除を有効にする。未設定または`"true"`以外は常にレポートのみ（15分ごとのscheduled実行でログ出力）。Release生成には含まれないため、明示的に設定しない限り本番は常にdry-run
- `SOURCE_URL`: リポジトリURL

公開識別子はVariablesへ置き、Appwrite API KeyとCloudflare API TokenはSecretsへ保存します。ブラウザ向け設定へAPI Keyを混ぜてはいけません。

## Release order

1. production reviewer、署名付き候補、対象SHA/tree、canonical origins、API契約、型、テスト、build、built launch検査を確認する。
2. 署名されたbaseline→targetの追加migration一覧とhashを照合し、D1へ追加migrationだけを適用する。既存migrationの変更/削除、破壊的SQLは拒否する。
3. 必要な承認済みWorker Secretを設定し、`wrangler deploy --tag <target SHA>`でWorkerを公開する。
4. active Workerが100%同一版で対象SHAのtagを持ち、承認済み変数、expected API/schema/storage、health、OAuth/MCP metadataと未認証拒否が一致することを確認する。
5. Site activation直前に同じWorker検査を行い、既存cache/archive/旧asset保持検査を通してからSiteを公開する。キャッシュルールは再有効化しない。
6. 正式App/LP/compatibility pathとMCPのsmokeを行う。旧タブ起動・実Google認証/実機受入は別の証拠として残す。
7. 全先行LA/BMの署名付き実受入記録を再検査した後だけGitHub Releaseを作成する。LA-08のGo記録と実Release URL/配備IDを区別する。

手動Worker/Siteとタグworkflowは同じ`appwrite-site-production`公開ロックを使い、失敗した後続工程を実行しない。候補受入はdeploy-scope証拠でWorker→Siteへ配備し、実受入後にrelease-scope証拠を用意する。正式Release前にLA-09/10は要求しない（告知/72時間はRelease後）；親Questの完了には全15ゲートが必要。

canonical Web PlatformはSite配備前の前提：Appwriteへ`app.guilduo.com`/`guilduo.com`を登録し、Google OAuth callback、DNS/TLSを確認する。generated URLによるWorker再生成/正式origin置換は行わない。詳細は[運用・証拠形式](docs/launch-operations.md)。

## Custom Domainの現在状態

- [x] Cloudflareで`guilduo.com`と`app.guilduo.com`を同じAppwrite Siteのactive deploymentへ接続し、host-based URL Rewriteを反映した
- [x] `mcp.guilduo.com`をWorkerのCustom Domainとして使用し、OAuth metadataと未認証`401`を確認した
- [x] Appwrite ConsoleのSite/Web Platformへ`guilduo.com`と`app.guilduo.com`を登録し、Google OAuthの戻り先を正式Web Appへ揃えた
- [x] Appwrite API Custom Domainを`api.guilduo.com`で有効化し、productionの`APPWRITE_ENDPOINT`を`https://api.guilduo.com/v1`へ移行した
- [ ] `www.guilduo.com`のDNSとapex redirectを有効化する（WAITING FOR DNS）
- [ ] `docs.guilduo.com`はDocumentation公開時まで予約扱いにする

host-based routingの詳細と、生成物・assetsを壊さない制約は[`docs/appwrite-site-routing.md`](docs/appwrite-site-routing.md)を参照する。

どのゲートでも失敗した場合はタグ公開を進めません。詳細は[`APPWRITE_MIGRATION.md`](APPWRITE_MIGRATION.md)を参照してください。

## Signed evidence and disabled billing default

production Variables:

- `LAUNCH_APPROVAL_PUBLIC_KEY`: trusted Ed25519 public PEM; private signing key stays with the operator outside CI/Git.
- `LAUNCH_EVIDENCE_RUN_ID`: approved evidence-upload Actions run; artifact `launch-candidate-<full target SHA>` contains manifest/signature and all hash-bound evidence, extracted into `.qa-artifacts`.
- `BILLING_ENABLED=false`, `BILLING_MODE=test`, `BILLING_CONFIG`: approved backend product JSON; public sale stays unavailable until product/Live approval. Test configurations are synthetic.
- `JEV_ENABLED=false`, `JEV_MODEL`, `JEV_INPUT_USD_PER_MILLION`, `JEV_OUTPUT_USD_PER_MILLION`, `JEV_DATA_POLICY_APPROVED=false`, `JEV_EVALUATION_BUDGET_USD=1`: official TypeSafe Jev only; no Luna/OpenRouter. These settings are Worker vars, never browser runtime. Pin the officially available model and retain price/data evidence before enabling.

Optional runtime Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TYPESAFE_API_KEY`, `BILLING_ADMIN_TOKEN`. Workflows require nonempty values and publish through Wrangler only when the corresponding signed/approved switch is enabled; Test/Live Stripe key prefixes must match mode. Missing flags are disabled/test. Secret values are never printed.

**現在：ひろなおのキー配置続行指示でStripe保留解除。Testキー設定・実Test受入は親担当で再開。Live切替・本番Goは未承認、公開販売不可。** 親の実Test APIはHTTP 200、JP accountは`charges_enabled=false`（details未提出）。Test接続成功と、保護者/Stripe条件・加盟店有効化の完了を分ける。[公式年齢要件](https://support.stripe.com/questions/age-requirement-to-create-a-stripe-account)は引き続き確認し、年齢・本人確認を回避しない。親が確認した既存Test価格は月USD10/年USD96で、商品承認ではない。BM-01の価格/Credit量/税/返金/紹介/運営方針は未承認。

APIはStripeスキル記載の固定`2026-08-26.dahlia`を選択し、親がこの版でHTTP 200を確認。APIの`Stripe-Version`とCLI/Webhookのevent版を揃えて受入する（latestの新規調査やbackend変更はこの文書担当では行わない）。親が検証済みStripe CLI v1.53.0でTest認証し、`whsec_…`を取得してignored `.dev.vars`へ設定済み（値は表示しない）。証拠は`.qa-artifacts/stripe/cli/readiness.json`。候補billingはdisabled。最新run9はfixture fallbackなしで本人Hosted月払/年払・Portal戻り・backend lifecycle/cleanupの14/14 PASS/exit0、348 Test API calls、cleanup errors/warnings0。Pro100/周期・紹介25はTest設定で商品承認ではない。run1のactive default残件/cleanup失敗とrun6/7/8の履歴を保持。[実行記録](docs/launch-readiness.md)参照。再受入は[手動Testコマンド](docs/launch-operations.md#stripe-test-manual-hosted-acceptance)を使い、`--fixture-subscriptions`は指定しない。正式BMゲート/固定候補・Live/公開Goは未完了。

Stripe WebhooksはGitHub Webhooksとは別。`STRIPE_SECRET_KEY=sk_test_…`はStripe TestサーバーAPI鍵、`STRIPE_WEBHOOK_SECRET=whsec_…`はこの通知先の署名検証用。既存`STRIPE_API_KEY`は`pk_…`公開鍵で、Hosted Checkoutへのredirectには不要；サーバーAPI認証へ代用しない。鍵は相互に代用せず、GitHub Webhookへ貼らない。値をログ/文書/ブラウザへ出さない。

商品/税/返金/紹介/Credit決定、実受入、最後の本番Goは未完了。[BILLING_SPEC](BILLING_SPEC.md)と[public Go/実機/復旧チェックリスト](docs/launch-operations.md)を使う。通常CIはmanifest不要で、正式Releaseは証拠なしでは拒否する。


## Stripe保留時の記録（Test再開前・現在の停止指示ではない）

**Stripeはひろなおの明示指示でペンディング。追加Stripe実装・実接続・取得/Live切替を停止し、外出後の再開指示と保護者/Stripe条件確認を待つ。** [公式年齢要件](https://support.stripe.com/questions/age-requirement-to-create-a-stripe-account)は13歳以上、18歳未満では法定後見人の所有者対応が必要（地域/アカウント条件も確認）。年齢・本人確認を回避しない。アカウントなしで既存の模擬Checkout/Webhook/台帳検証を続けられるが、実Stripe Test/Live合格とは区別する。
