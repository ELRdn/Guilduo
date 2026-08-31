# Guilduo 公開URLガイド

最終更新: 2026-08-30

この文書は、Guilduoの公開URLを人間とエージェントが同じ理解で扱うための早見表である。新しいユーザー向けリンク、README、接続手順には、原則として以下の正式URLを使う。

## まず使うURL

| 用途 | 正式URL | 説明 | 状態 |
| --- | --- | --- | --- |
| 公式サイト / LP | https://guilduo.com/ | Guilduoの紹介、機能説明、公開入口 | READY |
| 英語LP | https://guilduo.com/lp/en/ | 英語の公式LP | READY |
| Web App | https://app.guilduo.com/ | **Guilduo / Relay Forge**の正式Web App | READY |
| MCP | https://mcp.guilduo.com/mcp | OAuth対応Remote HTTP MCP | READY |
| Appwrite API | https://api.guilduo.com/v1 | Appwrite SDKとWorkerが使うAPI endpoint | READY |
| Documentation | https://docs.guilduo.com/ | 将来のドキュメントサイト | Reserved / Future |

### 新規ユーザーへ案内する入口

1. Guilduoを知る人には [guilduo.com](https://guilduo.com/) を案内する。
2. 実際に作業を始める人には [Guilduo / Relay Forge](https://app.guilduo.com/) を案内する。
3. AIクライアントを接続する人には https://mcp.guilduo.com/mcp を案内する。

Relay ForgeはGuilduoの正式Web Appである。/next/relay-forge/ はAppwrite Site内のデプロイpathであり、新規ユーザー向けの正式入口ではない。

## 公開URLと内部pathの関係

| path / hostname | 役割 | 新規導線での扱い |
| --- | --- | --- |
| https://guilduo.com/ | LP内部path /lp/ へrewriteされる公式root | 使う |
| https://guilduo.com/lp/en/ | 英語LP | 使う |
| https://guilduo.com/lp/ | 日本語LPの互換path | 公式rootを優先する |
| https://app.guilduo.com/ | Relay Forge内部path /next/relay-forge/ へrewriteされる公式root | 使う |
| https://app.guilduo.com/next/relay-forge/ | Relay Forgeの内部デプロイ・互換path | 新規リンクに使わない |
| /interaction-lab/ | ローカル開発・キャプチャ用のソースroute | 本番URLとして案内しない |
| Appwrite generated domain | 検証・rollback用のSite URL | 新規ユーザーへ案内しない |
| questforge-gateway.guangchuannaito.workers.dev | 旧Workerの互換・rollback URL | 新規MCP登録に使わない |
| www.guilduo.com | apexへのredirect用hostname | DNS/redirect完成まで待機 |

rootのhost-based rewrite、compatibility path、assetの相対解決は [docs/appwrite-site-routing.md](appwrite-site-routing.md) と [site-routing.ts](../site-routing.ts)で管理する。catch-all rewriteで /assets/ や既存pathを置き換えてはいけない。

## サービスの境界

- https://app.guilduo.com/ はブラウザで使うWeb Appである。
- https://mcp.guilduo.com/mcp はAIクライアントがOAuthで接続するMCP endpointである。
- https://api.guilduo.com/v1 はAppwrite APIであり、ブラウザで開くWeb AppやMCP endpointではない。
- APPWRITE_ENDPOINTは通常 https://api.guilduo.com/v1 を指す。
- APPWRITE_SITE_ENDPOINTはAppwrite Sitesのdeployment・Web Platform管理APIに使うリージョナルendpointであり、ユーザー向けURLではない。

WorkerのRESTとMCP、Appwrite Auth/TablesDB、Agent Registryの保存先を混同しない。構成の詳細は [API_MCP_SETUP.md](../API_MCP_SETUP.md) と [PROJECT_SPEC.md](../PROJECT_SPEC.md)を参照する。

## エージェント向けリンク規則

- 新しいユーザー向け説明、接続レシピ、サンプル、画面内リンクには正式URLを使う。
- 旧URLを説明する場合は「互換」「rollback」と明記し、正式URLと同列の新規候補として見せない。
- QuestForgeという名前は、CLI、MCP ID、storage key、環境変数、既存route、schema、型、ファイル名などのtechnical identifierでは維持する。
- URLやrouteを変更するときは、先に site-routing.ts と tests/site-routing.test.ts を確認し、この文書と docs/appwrite-site-routing.md を同期する。
- Token、API Key、Client Secret、完全なUIDはURL、ログ、接続例へ書かない。
