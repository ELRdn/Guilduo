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

### Web Appの公開HTMLキャッシュ（2026-09-20）

Cloudflare Cache Rule `Guilduo public app shell` を有効化した。静的HTMLを毎回Appwriteまで取得する待ちを減らすため、次の条件だけを対象にする。

```text
(http.host eq "app.guilduo.com" and http.request.uri.path in {"/" "/next/relay-forge/"} and http.request.uri.query eq "" and http.request.method in {"GET" "HEAD"} and not any(http.request.headers.names[*] eq "authorization"))
```

- Cache eligibility: **Eligible for cache**。
- Edge TTL: **Ignore cache-control header and use this TTL / 120 seconds**。
- Browser TTL: **Respect origin TTL** を明示設定する。設定を省略するとzoneの4時間設定が適用されたため、省略しない。応答の `Cache-Control: public, max-age=0, must-revalidate` を確認済み。
- Cache keyは既定値。host/path/queryをまとめる設定は追加しない。
- 対象は利用者によらず同じ静的アプリHTMLのみ。OAuth callbackを含むquery付きURL、Authorization付き要求、Appwrite API、Worker REST/MCP、LPは対象外。HTMLに個人情報を埋め込む方式へ変更する前にこのルールを無効化・再設計する。

反映確認では通常URLで `CF-Cache-Status: HIT` と `Age`、query付き検証URLで `DYNAMIC` を確認した。CDNが空の場合は配信元を待つ。キャッシュヒットだけを初回表示や保存時間の改善として報告しない。

#### 公開HTMLのバックグラウンド更新（2026-09-21）

Cache Response Rule `Guilduo public app shell background refresh` は、上記の要求条件に加えて、応答が200・Content-Typeがtext/html・Set-Cookieなし・Cache-Controlにpublicあり、private/no-store/no-cacheなしの場合だけに限定する。各directiveで **Cloudflare only** を有効にし、`max-age=120`、`stale-while-revalidate=120` を設定し、`must-revalidate` を除去する。ブラウザへ渡す元の `public, max-age=0, must-revalidate` は維持する。応答ヘッダーやCookie自体を削除しない。

これはキャッシュ評価前の応答ルールであり、通常のResponse Header Transformとは異なる。[公式設定仕様](https://developers.cloudflare.com/cache/how-to/cache-response-rules/settings/)を参照。公開HTMLを限定purgeしてから、SEA拠点で `UPDATING`・Age 192秒・取得355msを確認し、元のブラウザ向けCache-Controlも維持した。これは公開HTMLのHTTP計測で、GUI全体の完了時間ではない。CDNが空、猶予外、または再検証必須の別directiveがある場合は配信元を待ち得る。

Siteは古いhashed assetを保持しない。旧JSのURLがHTTP 200でもHTML fallbackを返すことがあるため、200だけでは可用性を証明できない。キャッシュを有効なまま配備すると最大240秒（TTL120秒＋更新猶予120秒）、古いHTMLが削除済みJSを参照する危険がある。次の順序を必須とする。

1. Dashboardで上記のCache RuleとCache Response Ruleを**両方**一時的に無効化し、反映を待つ。応答ルールだけ残さない。
2. 通常URLとcompatibility pathの応答が `DYNAMIC` または `BYPASS` になったことを確認して配備する。`tools/deploy-appwrite-site.sh` は公開origin指定時に両入口を検査し、`HIT` だけでなく `MISS`・`EXPIRED` 等でも**upload前に停止する**。通信失敗でも配備しない。queryやリクエストのno-cacheで検査を回避しない。
3. 新しいHTMLの参照先JS/CSSが正しいContent-Typeで返ることとアプリの起動を確認する。
4. 両ルールの無効化が反映してから旧HTMLの保持期限240秒が過ぎたことを確認し、両ルールを再度有効にする。新しいbundleと `HIT`、ブラウザ側の元のCache-Controlを確認する。

現行CLIトークンではcache purgeが拒否されるため、自動purge済みと扱わない。管理画面のCustom Purge / URLで公開入口2件だけを指定したpurgeは実施し、MISSを確認済み。ただし自動配備は引き続き両ルール停止・検証・240秒期限の手順を使う。緊急時は両ルールを無効化したまま既知のdeploymentへrollbackする。zone全体のpurgeや他ルールの置換は不要。CLIで公開originを省略する古いgenerated-domain向け経路にはこの検査がないため、公式Web Appの配備では `APPWRITE_SITE_URL` を必ず指定する。

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

## 2026-09-06 LPv2.1 adoption

公式入口`/lp/`・`/lp/en/`の内容をLPv2.1へ変更。Cloudflareのrewrite先、Appwrite Site、Web Appの入口は従来どおり。`/lpv2/`・`/lpv2-1/`はnoindexの比較用URLとして残す。共有する体験コードは`lpv2/`、追加モーションは`lpv2-1/`で管理する。
