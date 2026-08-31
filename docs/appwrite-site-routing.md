# Appwrite Siteの公開host routing

このリポジトリは、LPとRelay Forgeを1つのAppwrite Siteの同じactive deploymentへ梱包します。hostごとに異なるHTMLを返す処理はAppwrite Siteの静的ファイルツリーへ埋め込まず、CloudflareのURL Rewriteで入口だけを切り替えます。正式URLの利用ルールは[`public-urls.md`](public-urls.md)を参照してください。

この方式は本番へ反映済みです。`https://guilduo.com/`は公式LP、`https://app.guilduo.com/`はGuilduo / Relay Forgeの正式Web Appとして案内します。

## 採用方式

| 公開URL | Cloudflare edge | Appwrite Siteの内部path | canonical |
| --- | --- | --- | --- |
| `https://guilduo.com/` | `/`を`/lp/`へrewrite | `/lp/` | `https://guilduo.com/` |
| `https://guilduo.com/lp/en/` | 変更なし | `/lp/en/` | `https://guilduo.com/lp/en/` |
| `https://app.guilduo.com/` | `/`を`/next/relay-forge/`へrewrite | `/next/relay-forge/` | `https://app.guilduo.com/` |
| `https://app.guilduo.com/next/relay-forge/` | 変更なし | `/next/relay-forge/` | `https://app.guilduo.com/` |
| Appwrite generated domain | 変更なし | 全deployment tree | 検証・rollback用 |

正本のroute契約は[`site-routing.ts`](../site-routing.ts)です。2つのrewriteはroot pathにだけ適用し、`/assets/`、`/lp/`、`/next/`へcatch-all rewriteを適用しません。これにより、ブラウザに表示されるURLとquery stringを保ったまま、既存pathとassetの相対解決を維持できます。

Appwrite Sitesのdomain-level redirectはpath/queryを保持しないため、rootのLP・Web App切替には使いません。`www`のapex redirectだけは、Cloudflare Redirect Ruleでpath/queryを保持する構成にします。

## Appwrite Siteの設定状態

- [x] 既存のAppwrite Siteで、`app.guilduo.com`を**Active deployment**のCustom Domainとして維持する。
- [x] 同じSiteへ`guilduo.com`を追加し、**Active deployment**を使用する。Redirect設定にはしない。
- [x] Appwriteが提示するapex向けのDNS設定をCloudflareへ反映する。
- [x] generated domainは削除せず、deployment確認とrollbackの入口として残す。

`app.guilduo.com`と`guilduo.com`は別hostnameとしてverificationが必要です。どちらも確認済みで、apexのrewriteを有効化しています。

## CloudflareのRule契約

URL Rewrite Ruleを2つ、記載順を変えずに作成します。Dashboardでは「Rewrite to > Static」で設定し、query stringはPreserveにします。ホスト条件でrewriteを評価するため、対象hostnameのDNSレコードはCloudflareでプロキシ（orange cloud）を有効にしてください。DNS onlyのままではCloudflare Ruleは実行されません。

### 1. Official Site root

条件:

```text
(http.host eq "guilduo.com" and http.request.uri.path eq "/")
```

rewrite path:

```text
/lp/
```

### 2. Web App root

条件:

```text
(http.host eq "app.guilduo.com" and http.request.uri.path eq "/")
```

rewrite path:

```text
/next/relay-forge/
```

### 3. `www` redirect

別のRedirect Ruleで、`www.guilduo.com`の全pathを`https://guilduo.com`へ301または308 redirectします。pathとqueryは保持してください。`www`をAppwrite Siteのactive deployment domainとして追加する必要はありません。

Cloudflare URL Rewriteはhostnameを変更できないため、DNSの向き先は各hostnameとも同じAppwrite Siteのactive deploymentに揃えます。hostを変える必要がある構成へ変更する場合は、Origin Ruleを別途設計し、今回の2つのpath rewriteへ混ぜません。

## BuildとGitHub Actions

Buildは従来どおり`dist/`全体をAppwrite Siteへuploadします。`dist/lp/`、`dist/lp/en/`、`dist/next/`、`dist/next/relay-forge/`を削除したり、生成HTMLを手で編集したりしません。

productionのGitHub Environmentでは次を指定します。

```text
PUBLIC_SITE_URL=https://guilduo.com
WEB_APP_URL=https://app.guilduo.com
JOIN_GUILD_URL=https://app.guilduo.com/
```

`WEB_APP_URL`はAppwrite API endpointではありません。Appwrite API Custom Domainの`api.guilduo.com`は有効化・疎通確認済みのため、productionの`APPWRITE_ENDPOINT`は`https://api.guilduo.com/v1`を使います。generated endpointはrollback用に保持します。MCPは別hostの`https://mcp.guilduo.com/mcp`です。

## ローカル検証

```powershell
npm run site:routing:check
npm run build
npm test
```

ローカルのVite originではhost-based rewriteは発生しないため、`/lp/`と`/next/relay-forge/`を直接確認します。Cloudflare反映後は、次の4つをブラウザまたはcurlで確認します。

- `guilduo.com/`がLP本文と`https://guilduo.com/`のcanonicalを返す
- `guilduo.com/lp/en/`が英語LPを返す
- `app.guilduo.com/`がRelay Forgeを返し、アドレスバーが`/next/relay-forge/`へ変わらない
- `app.guilduo.com/next/relay-forge/`がcompatibility pathとして引き続き開ける

上記のroutingとactive deploymentは本番で確認済みです。今後Siteを更新するときも、同じactive deploymentへdist全体を公開し、host ruleを変更せずに`guilduo.com/`、`app.guilduo.com/`、英語LP、compatibility path、assetsの相対解決を確認します。`www`のapex redirectは別Ruleであり、DNSが有効になるまで`WAITING FOR DNS`として扱います。
