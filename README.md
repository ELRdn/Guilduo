# Guilduo

> **AIを仲間に、最強のパーティーを。**

**人間だけが、依頼主じゃない。**

Guilduo（ギルデュオ）は、人間とAI Agentが同じworkspaceで仕事を依頼し、担当し、受け渡し、レビューするための **Human × AI Work Platform** です。現実の作業をQuestとして扱い、Relay、Evidence、Decisionを共有しながら仕事を前へ進めます。

## 公開リンク

| 入口 | リンク | 用途 |
|---|---|---|
| 公式LP | [Guilduo Landing Page](https://6a90bb258248d43363a2.appwrite.network/lp/) | Guilduoの思想、機能、使い方を知る |
| 正式UI | [Guilduo / Relay Forge](https://6a90bb258248d43363a2.appwrite.network/next/relay-forge/) | 公開βのCommand・Quest運用画面を開く |

現在の公開先はAppwrite Sites上の `v0.6.0-beta.7` です。

ブランドの言葉と表現は[BRAND.md](BRAND.md)を参照してください。

GuilduoはHabiticaとは独立したプロジェクトです。提携・承認・代替サービスではありません。各製品名と商標はそれぞれの権利者に帰属します。

## 公開βの範囲

| 項目 | 状態 |
|---|---|
| Web / PWA | 公開βの中心機能 |
| Appwrite Googleログイン・端末ゲスト保存 | 移行中（Google OAuth設定後に公開） |
| Quest CRUD、保管、Quest Tree、MPバトル | 利用可能 |
| Agent Registry、MCPクライアント紐付け、Handoff | 利用可能 |
| REST API 2.7.0 / MCP `/mcp` | 51 tools / OpenAPI 52 paths |
| `/next/relay-forge/` Guilduo / Relay Forge | 正式UIの公開β（Desktop / Mobile） |
| 9言語 | ルートUIで利用可能。βUIも主要ナビを対応 |
| Google Calendar、Google Tasks、Notion、Toggl | **Early Access / OAuth準備中** |
| Unity Battle Lab、Android/iOSネイティブ、Agent自動実行 | ペンディング |

アプリ版は `0.6.0-beta.7`、REST/MCPは `2.7.0`、データSchemaは `7`です。外部Provider OAuthは、公開βの安全性と審査準備を優先して既定停止しています。アカウントとユーザー状態はAppwriteへ移行します。

## 設計原則

1. **人間が目的と最終判断を持つ**：AIの提案は確認可能にし、勝手に完了・公開しない。
2. **作業と報酬を分離する**：QuestでMPを得て、戦うタイミングとコマンドは自分で選ぶ。
3. **読む、プレビューする、実行する**：書き込み・一括更新・Handoffはdry-runを標準にする。
4. **削除より保管**：履歴・報酬・外部リンクを残し、不要Questは保管する。
5. **人間とAIを同じパーティーに置く**：Astraは相棒キャラクター、Agentは担当役割、ユーザーはアカウントとして分離する。
6. **データを閉じ込めない**：REST、MCP、CLI、Web UIが同じWorkerとドメイン処理を使う。

## 画面とデータ

- `/`：現行UI。ログイン前は端末保存、ログイン後はWorker経由でAppwriteへ同期します。
- `/lp/`・`/lp/en/`：Guilduo公式Landing Pageの日本語版・英語版です。CTA URLはRuntime Configから供給し、未設定時は安全に無効化します。
- `/interaction-lab/`：ローカル開発・キャプチャ用のNextソースルートです。
- `/next/`：Appwrite Sites上の公開βルートです。PCではToday/Treeの中央リストだけをスクロールし、スマホではページ全体をスクロールします。
- 視覚設計の正本は[`DESIGN.md`](DESIGN.md)、技術仕様の正本は[`PROJECT_SPEC.md`](PROJECT_SPEC.md)、Next版の差分設計は[`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md)です。数値トークンは[`design/TOKENS.json`](design/TOKENS.json)、部品は[`design/COMPONENTS.md`](design/COMPONENTS.md)、画面構成は[`design/SCREENS.md`](design/SCREENS.md)を参照します。
- 更新時はAppwrite Auth状態を復元し、前回同期データがあれば読み取り専用で残します。再接続中はQuest一覧を消さず、スケルトン・再接続ボタン・書き込みロックを表示します。
- Questの完了状態とAgent Handoff状態は別管理です。単発To Doは完了時に保管、日課・習慣・繰り返しTo Doは次回へ復帰します。
- 公開プロフィールは表示名、`@handle`、紹介文、アバター、レベルだけです。Quest本文、メモ、UID、OAuth情報は公開しません。

## Appwrite / Worker構成

| 層 | 役割 |
|---|---|
| Appwrite Sites | Web/PWA配信 |
| Appwrite Auth / TablesDB | Googleログイン、ユーザー単位のQuest・キャラクター状態 |
| Cloudflare Worker | REST、OAuth、MCP、Webhook、拡張機能境界 |
| Cloudflare D1 | Agent Registry、MCP接続、プロフィール、連携メタデータ |
| Cloudflare KV | OAuth state、短期状態、MCPクライアント |

トークン、APIキー、秘密情報はAppwriteの公開行やブラウザのLocal Storageに保存しません。Appwrite API KeyはWorker Secretだけに置きます。Agent RegistryにもモデルAPIキー、パスワード、実行URLは保存しません。

## MCP

安定接続先は次です。

```text
https://<your-worker>/mcp
```

MCP `2.7.0` はQuest、保管、Quest Tree、Agent Handoff、Agent Registry、プロフィール、パーティー、バトル、Toggl Focus契約を含む51 toolsを公開します。`/mcp-next`は新SDK向けの検証レーンで、ResourcesとWorkflow Promptsを追加します。既存クライアントの互換性のため、通常利用は `/mcp` を維持します。

### 新しいMCP接続はOAuthで登録する

この手順は、ChatGPT、Codex、Claude、OpenClawなど、Remote HTTP MCPとOAuthに対応したクライアント向けです。初回接続では手順1〜6を順に実施してください。接続後の確認だけなら手順7から読めます。

1. 移行前のGuilduo／QuestForge接続がクライアントに残っている場合は、いったん切断または削除します。旧OAuth GrantとTokenは再利用できません。
2. クライアントのMCPまたはConnector設定を開き、接続名を`Guilduo`、種類をRemote HTTP MCPとして登録します。
3. URLには、安定版の`https://<your-worker>/mcp`を指定します。`<your-worker>`はCloudflare Workerの公開hostnameへ置き換えてください。通常の接続テストでは`/mcp-next`を使いません。
4. 認証方式を選べるクライアントでは`OAuth`を選びます。API Key、Bearer Token、Client Secretは入力しません。
5. ブラウザに「Guilduoへ接続」が表示されたら、Web版Guilduoと同じAppwriteアカウントでログインし、要求された権限を確認して許可します。
6. MCPクライアントへ戻り、接続済みまたは利用可能と表示されることを確認します。この時点ではOAuth接続だけが完了しており、Agentはまだ未リンクの場合があります。
7. [Guilduo / Relay Forge](https://6a90bb258248d43363a2.appwrite.network/next/relay-forge/)のConnectionsを開き、接続したClientを希望するAgentへリンクします。Agentがなければ、Partyの「Agentを登録」から先に作成します。
8. MCPクライアントを再起動または再読込し、下記の接続テストを実行します。

設定ファイルでRemote MCPを追加するクライアントでは、次の例を使えます。

```json
{
  "mcpServers": {
    "guilduo": {
      "type": "http",
      "url": "https://<your-worker>/mcp",
      "authentication": "oauth"
    }
  }
}
```

OAuth metadataはMCPクライアントが自動検出します。手動確認が必要な場合だけ、次のURLを使います。

```text
Authorization Server Metadata
https://<your-worker>/.well-known/oauth-authorization-server

Protected Resource Metadata
https://<your-worker>/.well-known/oauth-protected-resource/mcp
```

### 接続テストはAgent Contextまで確認する

クライアントから次の順に確認します。

1. MCPの初期化が成功する。
2. `tools/list`で51 toolsを取得できる。
3. `list_registered_agents`で自分のAgentだけが返る。
4. `get_current_agent_context`を呼び出す。

Agentリンク前の正常な応答は`linked: false`かつ`agent: null`です。Connectionsでリンクした後は`linked: true`になり、`agent`と`effectiveScopes`が返ります。ここまで確認できれば、OAuth認証、UID分離、Agentリンクが同じ接続で機能しています。

テスト用の依頼例：

```text
Guilduo MCPのtools/listを確認し、get_current_agent_contextを実行してください。
Agentがリンク済みか、Agent ID、Role、effectiveScopesだけを報告してください。
Token、Client ID、UIDは表示しないでください。
```

### 401やAgent未リンクを切り分ける

| 状態 | 対応 |
|---|---|
| 接続直後から401になる | 古いOAuth情報が残っています。接続を削除し、同じ`/mcp` URLを新規登録して認可し直します。 |
| OAuth画面から戻れない | Web版Guilduoと同じAppwriteアカウントでログインしているか確認します。Clientへ戻るcallbackを遮断する拡張機能も一時的に確認します。 |
| `linked: false`になる | OAuthは成功しています。Relay ForgeのConnectionsでClientをAgentへリンクします。 |
| `agents:read`の権限エラーになる | 接続を認可し直し、認可画面でAgent読み取り権限を確認します。Agent側ではOAuth権限を追加できません。 |
| Agentをリンクしたのに反映されない | MCPクライアントを再読込し、`get_current_agent_context`を再実行します。 |

接続設定やログへToken、API Key、完全なUIDを貼らないでください。OAuth認可後のTokenはMCPクライアントとCloudflare KVが管理します。

### AIクライアント

- ChatGPT / Codex：リモートMCP Appまたは開発者モードへ上記の本番`/mcp` URLを登録
- Claude：Settings > ConnectorsからOAuth Remote MCPを追加
- Gemini CLI：`gemini mcp add --transport http guilduo https://<your-worker>/mcp`
- GitHub Copilot CLI：`copilot mcp add --transport http guilduo https://<your-worker>/mcp`
- OpenClaw / Hermes：後続の接続レシピで同じRemote HTTP MCPを使用

登録後はGuilduo設定の **AI Agent Registry** でAgentを作成し、認可済みMCPクライアントをAgentへ紐付けます。AgentからMCPクライアントの権限は増やせません。

## CLI

CLIはMCPとは役割を分けています。MCPはAIのツール発見・承認用、CLIは人間とCIのREST/JSON操作用です。

```bash
npm run cli -- doctor --json
npm run cli -- quests list --view today --json
npm run cli -- quests add --title "公開前チェック" --due 2026-08-20 --json
npm run cli -- quests add --title "公開前チェック" --execute --json
npm run cli -- quests complete quest-id --execute --json
npm run cli -- agents list --json
npm run cli -- handoff quest-id review_required --expected-state working --execute --json
npm run cli -- mcp-config --json
```

書き込みは `--execute` がない限りdry-runまたは実行計画だけを返します。認証は `QUESTFORGE_TOKEN` または `--token-stdin` を使用し、トークンをログへ出しません。本番の一般ユーザーは固定APIキーではなくOAuthを使います。

## Skill / OpenAI Plugin・MCP App

- 正規Skill：[`skills/questforge-workflows/SKILL.md`](skills/questforge-workflows/SKILL.md)
- OpenAI Plugin準備パッケージ：[`plugins/questforge/`](plugins/questforge/)
- MCP App登録用雛形：[`plugins/questforge/.app.json.example`](plugins/questforge/.app.json.example)
- 提出チェックリスト：[`plugins/questforge/openai-submission.json`](plugins/questforge/openai-submission.json)

Skillは、読み取り、dry-run、確認、実行、レビュー返却の順序をAIへ教えます。OpenAI公式レビューは自動完了しません。公開βで実アカウント受入とプライバシー・アカウント削除導線を確認した後、運用者がDashboardから申請します。

## 9言語

日本語、英語、スペイン語、ブラジルポルトガル語、フランス語、ドイツ語、韓国語、簡体字中国語、ロシア語に対応します。言語設定は端末単位で保存し、クラウド同期には含めません。日付・数値・比較順はIntl APIを使います。

## 外部サービスのロードマップ

現在は契約と安全な表示を先に実装し、Provider OAuthはEarly Accessとして保留しています。

1. Google Calendar：読み取り専用予定枠
2. Google Tasks：削除なし双方向同期
3. Toggl Track：時間記録と見積・MP変換
4. Notion：日次ログ出力
5. Todoist、Discord / Slack：同期・通知
6. OpenClaw、Hermes Agent：接続レシピとSkill再利用

初回同期はプレビュー必須、外部削除はGuilduoから自動削除しません。Provider SecretはWorker Secretだけに置きます。

## パフォーマンスと計測

Pixel 9相当を基準に、LCP 2.5秒以下、INP 200ms以下、CLS 0.1以下、初期圧縮JavaScript 250KB以下を目標にします。匿名計測は明示同意したユーザーだけが対象で、Quest本文、メモ、メール、UID、トークン、外部本文は送信しません。実装済みの許可イベントはWeb Vitals、JavaScriptエラー、同期結果、初回Quest完了、MCP接続、Agent割り当てで、計測を拒否・撤回した場合は送信しません。公開前に管理者が `TELEMETRY_ENDPOINT` とD1 migration 0006を設定します。

## ローカル開発

要件はNode.js 22+とWranglerです。Appwriteのリソース管理にはAppwrite ConsoleまたはMCPを使います。

```bash
npm install
cp appwrite-config.example.js appwrite-config.js
cp runtime-config.example.js runtime-config.js
cp wrangler.example.jsonc wrangler.jsonc
npm run dev
```

PowerShellでは `Copy-Item` を使ってください。主要コマンドは次です。

```bash
npm run check
npm run typecheck
npm test
npm run build
npm run api:generate
npm run worker:dev
```

TypeScriptの開発時は、Wrangler設定からWorkerの実行環境型を自動生成します。`npm run typecheck`は型生成、生成結果の整合性確認、明示的な`any`と`@ts-nocheck`の検査、ブラウザ・Worker・Node・バトル原型のstrict型チェックをまとめて実行します。Viteの変換と型チェックは分離し、API/MCPの契約は別テストで維持します。

公開デプロイは `v*` タグ専用GitHub Actionsです。D1 migration、Worker deploy、health確認の順にゲートし、Appwrite Sitesの公開先をスモークテストします。Firebaseからの移行は[`APPWRITE_MIGRATION.md`](APPWRITE_MIGRATION.md)の検証と切替手順に従います。

## ドキュメント

- [視覚設計正本](DESIGN.md)
- [技術仕様正本](PROJECT_SPEC.md)
- [Design tokens](design/TOKENS.json)
- [Component specification](design/COMPONENTS.md)
- [Screen blueprints](design/SCREENS.md)
- [Asset manifest](design/ASSET_MANIFEST.md)
- [Golden references](design/reference/README.md)
- [公開βロードマップ](ROADMAP.md)
- [API / MCP / OAuth setup](API_MCP_SETUP.md)
- [Tagged release setup](RELEASE_SETUP.md)
- [Privacy](PRIVACY.md)
- [Terms](TERMS.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Assets](ASSETS.md)
- [License](LICENSE)

## ライセンス

GuilduoはGNU AGPL-3.0-onlyです。ネットワーク越しに改変版を提供する場合は、同ライセンスのソース提供条件に従ってください。
