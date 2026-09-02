# Guilduo Gateway / MCP setup

Guilduoは、Appwrite SitesのWeb/PWA、Cloudflare WorkerのREST/MCP、Appwrite Auth/TablesDBのユーザー状態を分離して運用します。

公開URLの役割を一覧で確認する場合は[`docs/public-urls.md`](docs/public-urls.md)を参照してください。新規ユーザー向けのWeb Appは [Guilduo / Relay Forge](https://app.guilduo.com/) です。

## 正式URLの役割

| 役割 | URL | 用途 |
|---|---|---|
| 公式サイト / LP | `https://guilduo.com` | 公開サイトとcanonical root |
| Web App | `https://app.guilduo.com` | Guilduo / Relay Forgeの正式入口 |
| MCP | `https://mcp.guilduo.com/mcp` | Remote HTTP MCPの正式endpoint。originは`https://mcp.guilduo.com` |
| Appwrite API | `https://api.guilduo.com/v1` | Appwrite API endpoint（originは`https://api.guilduo.com`） |
| Documentation | `https://docs.guilduo.com` | Reserved / Future |

`api.guilduo.com`はAppwrite API専用です。Appwrite SDKとWorkerの`APPWRITE_ENDPOINT`は`https://api.guilduo.com/v1`を使います。Worker自身のREST `/v1`とMCP `/mcp`は、引き続きWorkerの公開origin（新規接続は`https://mcp.guilduo.com`）を使い、Appwrite API originへ置き換えません。

したがって、ブラウザで使う入口は`https://app.guilduo.com/`、AIクライアントの接続先は`https://mcp.guilduo.com/mcp`、Appwrite SDKのAPI endpointは`https://api.guilduo.com/v1`である。3つを同じURLとして扱わない。

## 現在の公開β境界

- Appwrite Googleログイン：利用可能
- Remote MCP `/mcp`：利用可能。OAuthを使用
- `/mcp-next`：SDK検証用。ResourcesとPromptsを含む
- CLI：REST/JSON操作。書き込みは`--execute`が必要
- Google Calendar、Google Tasks、Notion、Toggl：**Provider OAuth準備中**。UIでは接続・自動同期を停止して契約とロードマップだけを表示
- Unity Battle Lab、外部サービスの本番同期、自動Agent実行：後続工程

Provider連携コードは削除していません。`externalOAuthEnabled`を`true`にする前に、OAuth審査、プライバシー文面、アカウント削除、同期競合テストを完了してください。

## 1. Cloudflareリソース

```bash
npx wrangler login
npx wrangler kv namespace create QUESTFORGE_KV
npx wrangler d1 create questforge-data
npx wrangler d1 migrations apply questforge-data --remote
```

`wrangler.jsonc`へKV namespaceとD1 database IDを設定します。D1にはAgent Registry、MCPクライアント、公開プロフィール、連携メタデータを保存します。Quest本文とキャラクター本体はAppwrite TablesDBのユーザー領域です。

## 2. Appwrite Worker認証

Appwrite ConsoleでWorker専用API Keyを作成し、必要最小限のTablesDB read/write scopeだけを付与します。API Keyはリポジトリや公開Variablesへ置かず、Cloudflare Worker SecretとGitHub Actions Secretへ登録します。

```bash
npx wrangler secret put APPWRITE_API_KEY
```

Google OAuth providerにはAppwriteが示すcallback URLを登録し、AppwriteのWeb platformには`app.guilduo.com`を登録します。Appwrite Siteのgenerated domainは検証・rollback用に残します。未接続のhostnameをOAuth success URLや新規ユーザー向けリンクへ設定しないでください。

## 3. デプロイ前の外部OAuthフラグ

公開βでは次を`false`にします。デフォルトも`false`です。

```js
globalThis.QuestForgeConfig = {
  gatewayUrl: "https://mcp.guilduo.com",
  externalOAuthEnabled: false,
};
```

この状態でもAppwriteログインとMCP OAuthは動作します。Calendar、Tasks、Notion、Togglの接続ボタンは「公開βで準備中」となり、外部データを書き換えません。

## 4. Remote MCP

安定エンドポイント：

```text
https://mcp.guilduo.com/mcp
```

旧workers.devの`/mcp`は移行期間中の互換接続として残ります。新規クライアントは新しいURLへ接続してください。

検証レーン：

```text
https://mcp.guilduo.com/mcp-next
```

Workerの`/health`は次を返します。

```json
{
  "version": "2.7.0",
  "schemaVersion": 7,
  "mcp": { "stable": "/mcp", "preview": "/mcp-next", "tools": 51 },
  "agentStorage": "d1"
}
```

### 接続例

```toml
[mcp_servers.questforge]
url = "https://mcp.guilduo.com/mcp"
auth = "oauth"
default_tools_approval_mode = "writes"
```

Gemini CLI：

```bash
gemini mcp add --transport http questforge https://mcp.guilduo.com/mcp
```

GitHub Copilot CLI：

```bash
copilot mcp add --transport http questforge https://mcp.guilduo.com/mcp
```

Claude、OpenClaw、Hermesは、同じRemote HTTP MCPとOAuth metadataを使います。OpenClaw/Hermes向けの専用レシピは外部サービス公開後のロードマップに残しています。

## 5. Agent RegistryとSkill

1. GuilduoへAppwrite Googleログインする
2. Web Appの`https://app.guilduo.com/` > Partyを開き、「Agentを登録」からAgentを作成する
3. Agent ID、表示名、Provider、役割、作業指示を登録する
4. ChatGPT、Codex、ClaudeなどをRemote MCPへ接続する
5. 認可済みMCPクライアントをAgentへ紐付ける
6. Quest担当へ割り当て、`ready → working → review_required → accepted`を確認する

Agent作成、編集、権限変更、MCPクライアント紐付けはAppwriteログインしたWeb UIだけが行います。AgentはPartyで管理し、接続済みClientはConnectionsでリンクします。Agent一覧取得と現在のAgent contextには`agents:read`、Agentのlink/unlink/relinkには`agents:write`が必要です。既存OAuth grantは自動昇格しないため、`agents:read`だけの接続はクライアントを再接続して、認可画面で`agents:write`を許可してください。MCPクライアントは自分の権限を拡張できません。Skillの正規版は[`skills/questforge-workflows/SKILL.md`](skills/questforge-workflows/SKILL.md)、OpenAI Plugin/MCP App準備パッケージは[`plugins/questforge/`](plugins/questforge/)です。これらのtechnical IDは互換性のため維持します。

## 6. CLI

```bash
npm run cli -- doctor --json
npm run cli -- quests list --view today --json
npm run cli -- quests add --title "Quest名" --json
npm run cli -- quests add --title "Quest名" --execute --json
npm run cli -- quests complete quest-id --execute --json
npm run cli -- agents list --json
npm run cli -- handoff quest-id review_required --expected-state working --execute --json
npm run cli -- mcp-config --json
```

認証は`QUESTFORGE_TOKEN`または`--token-stdin`です。固定APIキーをユーザー向けの本番認証として配布しないでください。CLIは人間/CI向けRESTクライアントであり、AIのツール発見・確認はMCPが担当します。

## 7. 外部サービスを再開する条件

以下を満たしてから、運用者が環境変数`EXTERNAL_OAUTH_ENABLED=true`で公開環境を再ビルドします。

- Google Cloud OAuth consent、Authorized domains、必要な審査が完了
- Notion Public Connectionの審査と親ページ選択を確認
- Provider SecretをWorker Secretへ登録し、ブラウザやGitHubへ置かない
- 初回同期がdry-run/プレビューで止まる
- 外部削除がGuilduoから自動削除されない
- 401、429、5xx、競合、接続解除、再接続の実機テストが完了
- PCとPixel 9でOAuth復帰・同期・失敗表示を確認

将来のProvider対応は次の順です。

1. Google Calendar読み取り専用予定枠
2. Google Tasks削除なし双方向同期
3. Toggl Track時間記録とMP/XP変換
4. Notion日次ログ
5. Todoist、Discord/Slack通知

## 8. ローカルWorker

```powershell
Copy-Item worker/.dev.vars.example worker/.dev.vars
npm run worker:dev
```

ローカル検証では`DEV_BEARER_TOKEN`と`DEV_USER_ID`を使えます。Provider OAuth Secretや実ユーザーのトークンを`.dev.vars`へ入れたまま共有しないでください。

## 9. タグ付きリリース

GitHub Actionsは`v*`タグだけで公開処理を開始します。

1. `npm run api:generate`、`npm run check`、`npm test`、`npm run build`
2. D1の追加migration
3. Worker deploy
4. `/health`でWorker版数、Schema、D1を確認
5. 成功時だけAppwrite Sitesをデプロイ
6. `guilduo.com/`（LP）、`app.guilduo.com/`（Web App）、互換path、MCP metadata、未認証401をSmoke test
7. GitHub Release作成

Worker確認に失敗した場合はAppwrite Sitesを更新しません。公開βのタグはpackage versionと一致させます。
