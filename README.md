# QuestForge

> **AIを仲間に、最強のパーティーを。**

QuestForgeは、現実の作業をQuestに変え、完了でMPをため、使うタイミングを自分で決めるオープンなタスクRPGです。人間が目的と最終判断を持ち、AIが整理・実行・レビューを支援します。QuestForgeは、**人間・AI・外部サービスが同じパーティーで動く作戦盤**を目指しています。

QuestForgeはHabiticaとは独立したプロジェクトです。提携・承認・代替サービスではありません。各製品名と商標はそれぞれの権利者に帰属します。

## 公開βの範囲

| 項目 | 状態 |
|---|---|
| Web / PWA | 公開βの中心機能 |
| Firebase Googleログイン・端末ゲスト保存 | 利用可能 |
| Quest CRUD、保管、Quest Tree、MPバトル | 利用可能 |
| Agent Registry、MCPクライアント紐付け、Handoff | 利用可能 |
| REST API 2.7.0 / MCP `/mcp` | 51 tools / OpenAPI 52 paths |
| `/next/` Interaction Lab | 新UIの公開β・検証レーン |
| 9言語 | ルートUIで利用可能。βUIも主要ナビを対応 |
| Google Calendar、Google Tasks、Notion、Toggl | **Early Access / OAuth準備中** |
| Unity Battle Lab、Android/iOSネイティブ、Agent自動実行 | ペンディング |

アプリ版は `0.5.0-beta.1`、REST/MCPは `2.7.0`、データSchemaは `7`です。外部Provider OAuthは、公開βの安全性と審査準備を優先して既定停止しています。FirebaseログインとMCP OAuthは利用できます。

## 設計原則

1. **人間が目的と最終判断を持つ**：AIの提案は確認可能にし、勝手に完了・公開しない。
2. **作業と報酬を分離する**：QuestでMPを得て、戦うタイミングとコマンドは自分で選ぶ。
3. **読む、プレビューする、実行する**：書き込み・一括更新・Handoffはdry-runを標準にする。
4. **削除より保管**：履歴・報酬・外部リンクを残し、不要Questは保管する。
5. **人間とAIを同じパーティーに置く**：Astraは相棒キャラクター、Agentは担当役割、ユーザーはアカウントとして分離する。
6. **データを閉じ込めない**：REST、MCP、CLI、Web UIが同じWorkerとドメイン処理を使う。

## 画面とデータ

- `/`：現行UI。ログイン前は端末保存、ログイン後はFirebaseへ同期します。
- `/next/`：公開βのInteraction Lab。PCではToday/Treeの中央リストだけをスクロールし、スマホではページ全体をスクロールします。
- 更新時はFirebase Auth状態を復元し、前回同期データがあれば読み取り専用で残します。再接続中はQuest一覧を消さず、スケルトン・再接続ボタン・書き込みロックを表示します。
- Questの完了状態とAgent Handoff状態は別管理です。単発To Doは完了時に保管、日課・習慣・繰り返しTo Doは次回へ復帰します。
- 公開プロフィールは表示名、`@handle`、紹介文、アバター、レベルだけです。Quest本文、メモ、UID、OAuth情報は公開しません。

## Firebase / Worker構成

| 層 | 役割 |
|---|---|
| Firebase Hosting | Web/PWA配信 |
| Firebase Auth / Realtime Database | Googleログイン、ユーザー単位のQuest・キャラクター状態 |
| Cloudflare Worker | REST、OAuth、MCP、Webhook、拡張機能境界 |
| Cloudflare D1 | Agent Registry、MCP接続、プロフィール、連携メタデータ |
| Cloudflare KV | OAuth state、短期状態、MCPクライアント |

トークン、APIキー、秘密情報はFirebaseやブラウザのLocal Storageに保存しません。Agent RegistryにもモデルAPIキー、パスワード、実行URLは保存しません。

## MCP

安定接続先は次です。

```text
https://<your-worker>/mcp
```

MCP `2.7.0` はQuest、保管、Quest Tree、Agent Handoff、Agent Registry、プロフィール、パーティー、バトル、Toggl Focus契約を含む51 toolsを公開します。`/mcp-next`は新SDK向けの検証レーンで、ResourcesとWorkflow Promptsを追加します。既存クライアントの互換性のため、通常利用は `/mcp` を維持します。

### AIクライアント

- ChatGPT / Codex：リモートMCP Appまたは開発者モードへ `/mcp` を登録
- Claude：Settings > ConnectorsからOAuth Remote MCPを追加
- Gemini CLI：`gemini mcp add --transport http questforge https://<your-worker>/mcp`
- GitHub Copilot CLI：`copilot mcp add --transport http questforge https://<your-worker>/mcp`
- OpenClaw / Hermes：後続の接続レシピで同じRemote HTTP MCPを使用

登録後はQuestForge設定の **AI Agent Registry** でAgentを作成し、認可済みMCPクライアントをAgentへ紐付けます。Agentから権限を増やすことはできません。

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

日本語、英語、スペイン語、ブラジルポルトガル語、フランス語、ドイツ語、韓国語、簡体字中国語、ロシア語に対応します。言語設定は端末単位で保存し、Firebase同期には含めません。日付・数値・比較順はIntl APIを使います。

## 外部サービスのロードマップ

現在は契約と安全な表示を先に実装し、Provider OAuthはEarly Accessとして保留しています。

1. Google Calendar：読み取り専用予定枠
2. Google Tasks：削除なし双方向同期
3. Toggl Track：時間記録と見積・MP変換
4. Notion：日次ログ出力
5. Todoist、Discord / Slack：同期・通知
6. OpenClaw、Hermes Agent：接続レシピとSkill再利用

初回同期はプレビュー必須、外部削除はQuestForgeから自動削除しません。Provider SecretはWorker Secretだけに置きます。

## パフォーマンスと計測

Pixel 9相当を基準に、LCP 2.5秒以下、INP 200ms以下、CLS 0.1以下、初期圧縮JavaScript 250KB以下を目標にします。匿名計測は明示同意したユーザーだけが対象で、Quest本文、メモ、メール、UID、トークン、外部本文は送信しません。実装済みの許可イベントはWeb Vitals、JavaScriptエラー、同期結果、初回Quest完了、MCP接続、Agent割り当てで、計測を拒否・撤回した場合は送信しません。公開前に管理者が `TELEMETRY_ENDPOINT` とD1 migration 0006を設定します。

## ローカル開発

要件はNode.js 22+、Firebase CLI、Wranglerです。

```bash
npm install
cp firebase-config.example.js firebase-config.js
cp runtime-config.example.js runtime-config.js
cp .firebaserc.example .firebaserc
cp wrangler.example.jsonc wrangler.jsonc
npm run dev
```

PowerShellでは `Copy-Item` を使ってください。主要コマンドは次です。

```bash
npm run check
npm test
npm run build
npm run api:generate
npm run worker:dev
```

公開デプロイは `v*` タグ専用GitHub Actionsです。WorkerのD1 migration・deploy・health確認が成功した場合だけFirebaseを更新します。今回の作業終了地点は、**実装・テスト・スクリーンショット検証済みのデプロイ直前**です。

## ドキュメント

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

QuestForgeはGNU AGPL-3.0-onlyです。ネットワーク越しに改変版を提供する場合は、同ライセンスのソース提供条件に従ってください。
