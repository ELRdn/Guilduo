# Claude Code向けGuilduo

[English](README.md)

`guilduo@guilduo` `0.6.0-beta.1`は、**Claude Code**（CLI、IDE拡張、デスクトップアプリのCodeタブ）向けのGuilduoプラグインです。npmではなく、このリポジトリのClaude Code標準plugin marketplaceで配布します。Claude DesktopのConnectorsやDesktop Extension（`.mcpb`）とは別物です。

構成要素は次の2つだけです。

- 公式リモートMCP `https://mcp.guilduo.com/mcp`（名前`guilduo`、表示は`plugin:guilduo:guilduo`）
- 共通`guilduo-workflows` Skillとそのreferences

hook、コマンド、サブエージェント、自動追加入力、追加のモデル呼び出しはありません。Skill内の任意local-hooks referenceは別パッケージ向けの説明で、このプラグインには紐付け対象がなく適用されません。OAuthとtokenの保存はClaude Codeが管理し、プラグインは認証情報の保存先、token bridge、秘密情報を持ちません。

プラグインの導入、OAuth完了、Skillの読み込みだけでは、Quest変更や追加モデル実行の許可には**なりません**。Skillは説明文が一致したときにClaudeが選ぶか、`/guilduo:guilduo-workflows`で明示的に呼び出したときに使われます。各フェーズで必ず自動実行されるものではありません。Freeの登録Agent上限は2体のままで、このプラグインはAgentを登録しません。

対応ホスト: Claude Code **2.1.286**以降（このリリースで検証した版）。公開・受入状況は[現行ステータス](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-host-extensions-status.md)を確認してください。

## 導入

Claude Codeのセッション内で:

```text
/plugin marketplace add ELRdn/Guilduo
/plugin install guilduo@guilduo
```

シェルからの場合（`--sparse`でリポジトリ全体ではなくmarketplaceとこのプラグインだけを取得します）:

```powershell
claude plugin marketplace add ELRdn/Guilduo --sparse .claude-plugin plugins/guilduo-claude
claude plugin install guilduo@guilduo
```

開いているセッションでは`/reload-plugins`を実行するか、新しいセッションを開始してください。既存の設定、他のプラグイン、MCP接続、認証、履歴は保持されます。

## 標準認証（OAuth）

1. `/mcp`で`plugin:guilduo:guilduo`を選び、サインインの案内に従います。シェルからは`claude mcp login plugin:guilduo:guilduo`でも同じです。
2. ブラウザーで、使用するGuilduoアカウントで接続を承認します。

token、callback URL、APIキーをチャットやQuestに貼り付けないでください。

`https://mcp.guilduo.com/mcp`を既に自分で登録している場合（`claude mcp add`など）、Claude Codeはその既存接続と認証を使い続け、プラグイン側の接続は起動しません。対応は不要です。このページのコマンドでは`plugin:guilduo:guilduo`の代わりに既存のサーバー名を使ってください。

## 接続確認（読み取りのみ）

```powershell
claude plugin details guilduo@guilduo
claude mcp get plugin:guilduo:guilduo
```

`details`に`guilduo-workflows` Skillと`guilduo` MCPが表示され、認証後の`mcp get`で接続済みと表示されることを確認します。

続けて新しいセッションで、**書き込みなし**の確認をClaudeに依頼します。例:

> /guilduo:guilduo-workflows を使って、何も書き込まずに get_agent_link、list_registered_agents、get_current_agent_context を呼び、私のQuest一覧を読んでください。

Agentの扱い:

- [Guilduo Web App](https://app.guilduo.com/)で登録・許可済みの既存Agentを使います。表示名やクライアント名はAgent IDではありません。
- `get_current_agent_context`が`requiresAgentSelection`を返す場合は、`allowedAgentIds`から選んだIDを`actingAgentId`として、読み取り・プレビューを含む**すべて**の呼び出しに渡します。共有接続のクライアント切替に`link_agent`を使わないでください。
- 書き込みには、対象Questと対象Agentを特定したご本人の明示的な許可が必要です。Skillは対応ツールで`dryRun: true`のプレビューを行い、更新には`expectedUpdatedAt`を使います。

## 更新

```powershell
claude plugin marketplace update guilduo
claude plugin update guilduo@guilduo
```

`/plugin`の**Marketplaces**タブからも更新できます。他のサードパーティmarketplaceと同じく自動更新は既定で**オフ**で、このタブでオンにできます。更新後は`/reload-plugins`か再起動をしてください。OAuth認証は有効な間そのまま使われます。

## 停止・切断・削除

| 目的 | 操作 |
| --- | --- |
| 一時停止 | `claude plugin disable guilduo@guilduo`（再開は`claude plugin enable guilduo@guilduo`） |
| Claude Code側でサインアウト | `/mcp` → `plugin:guilduo:guilduo` → **Clear authentication**、または`claude mcp logout plugin:guilduo:guilduo` |
| サーバー側で失効 | [Guilduo Web App](https://app.guilduo.com/)の設定で接続を削除 |
| プラグイン削除 | `claude plugin uninstall guilduo@guilduo`、必要なら続けて`claude plugin marketplace remove guilduo` |

ローカルの認証も消したい場合は、削除前にClear authenticationを行ってください。サインアウトや削除だけではサーバー側の許可は失効しません。いずれの操作もQuest、他のプラグイン、他のMCP接続には影響しません。

## 開発

Skillは正本`skills/guilduo-workflows/`からコピーします（Codex専用の`agents/openai.yaml`は含めません）。

```powershell
node plugins/guilduo-claude/stage.mjs
node --test plugins/guilduo-claude/tests/package.test.mjs
claude plugin validate . --strict
claude plugin validate plugins/guilduo-claude --strict
node plugins/guilduo-claude/tests/native-host.mjs
node plugins/guilduo-claude/tests/native-host.mjs ELRdn/Guilduo#<branch>
```

`native-host.mjs`は新しい隔離`CLAUDE_CONFIG_DIR`で導入・確認・更新・停止・再開・削除を行い、無関係なMCP接続と設定が残ることを確認します。引数なしではローカルコピーからその場で読み込み、push済みの`owner/repo#branch`を渡すとGitHubからsparse cloneしてplugin cacheへ入れ、このcheckoutと比較します（改行は正規化）。サインイン、MCPツール呼び出し、モデル実行は行いません（`claude mcp list`は認証なしで公開endpointのhealth checkを行います）。

リリース: 正本Skillを変更したら`stage.mjs`を実行し、`.claude-plugin/plugin.json`の`version`を上げてください。導入済みのコピーはversionが変わったときだけ更新されます。CIの`package.test.mjs`は、配布Skillが正本とずれると失敗します。

Docs: [guilduo.com/docs](https://guilduo.com/docs/) ・ Source: [github.com/ELRdn/Guilduo](https://github.com/ELRdn/Guilduo)。AGPL-3.0-only。
