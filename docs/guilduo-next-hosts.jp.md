# Guilduo：OpenAI・Codex・Grok Bot・Muse Code

[English](guilduo-next-hosts.md) · 公開候補 **0.6.0-beta.12**

正本Skillは `skills/guilduo-workflows/`、OAuth MCPは
https://mcp.guilduo.com/mcp です。導入でモデル実行、Agent登録、書き込み許可は
始まりません。Freeの登録Agent上限2を維持し、既存の許可済みAgentを使います。

| 対象 | 構成 | 受入と配布の境界 |
| --- | --- | --- |
| OpenAI / ChatGPT | Skill＋OAuth MCP、App参照・hookなし | 専用ZIP。審査・承認・Publish・掲載を別に確認 |
| Codex通常版 | Skill＋OAuth MCP＋SessionStart／Stop補助 | `plugins/guilduo-workflows/` と標準marketplace |
| Codex既存App companion | Skill＋hook、既存の実App IDを参照 | ローカル生成のみ。MCPを二重登録しない |
| Grok Bot候補 | Agent Plugins＋Skill＋HTTPS MCP、hookなし | Git／ZIP候補。Cursor互換性はGrok実機受入ではない |
| Muse Code候補 | native manifest＋Skill、hookなし | MCP認証は標準利用者設定へ分離。Git／ZIP導入 |

## Codexの導入・更新

対象はCLI **0.159.2** と導入済みWindows Desktopです。

```powershell
codex plugin marketplace add ELRdn/Guilduo --ref main
codex plugin add guilduo-workflows@guilduo-local
codex plugin list --marketplace guilduo-local --json
```

既存 `guilduo-local` がApp companionなら、接続を維持して同じ方式を更新します。
直接MCP版への置換は不要です。実App IDはOAuth tokenではありません。

```powershell
npx tsx tools/prepare-guilduo-plugin.mts --app-id YOUR_REGISTERED_GUILDUO_APP_ID --hooks
codex plugin marketplace add ./.qa-artifacts/guilduo-plugin-hooks
codex plugin add guilduo-workflows@guilduo-local
```

生成フォルダーを保持し、Desktopを再起動して新しいチャットを開きます。
cacheのbeta.12、有効な `guilduo-workflows:guilduo-workflows` Skillが1つ、
接続が1つであることを確認します。Git marketplaceの更新は
`codex plugin marketplace upgrade guilduo-local` 後、同じpluginを再導入します。
現在進行中の会話だけでは新Skillの読込確認になりません。

## 補助・停止・切断・削除

hostで正確なhookを確認してtrustし、明示の継続許可を得た後に、exact session・
canonical cwd・Quest・許可済みAgentを検証してbindします。詳細は同梱
`hooks/README.md` に従います。session＋turnにつき追加確認は最大1回。
再bindでも実行済み記録は消えません。識別子・再帰フラグ欠落、不正binding、
保存失敗時は補助を出しません。Plan・read-only・fork・許可撤回・中断時に
書き込まないことを確認してから使います。hookは直接MCPを書き込まず、
認証情報や会話本文を保存しません。

unbindは補助停止です。hostの推論中断はhostの停止ボタンを使います。
plugin無効化はhost設定、削除は
`codex plugin remove guilduo-workflows@guilduo-local` です。
OAuth切断はhostの接続設定とGuilduo WebのSettings → MCP接続で別に操作します。
他のplugin、設定、接続は保持します。

## 認証と最初のQuest

標準OAuthで本人アカウントへ接続し、既存Agentのallowlistと実行スコープを読みます。
共有接続では全呼び出しに選択済み `actingAgentId` を付け、relinkで切り替えません。
新しいtool discoveryで `update_quest` の `expectedUpdatedAt` と
`actingAgentId` を確認します。対象QuestだけのnextAction／handoff.noteを
限定更新してreadbackします。同じ内容なら無更新、競合なら再読取。
`update_quest` にdryRunはありません。Human回答は本人がWebに保存したものを
取得してから再開し、回答を代筆しません。

## 提出と未受入の扱い

OpenAIはApp参照・hookを全entryから除いた専用ZIPで既存draftを更新します。
domain検証、実tool／Skill scan、正例5・負例3、専用reviewer環境と実demoを
揃えて提出し、承認後のPublishと表示を確認します。審査員の認証情報は
ポータルの安全な欄だけに入力します。個人アカウントでの受入は専用審査環境の
代わりにはなりません。

Grok／Museは新規課金なしの候補配布です。実モデル・Human往復は未受入。
Grokの任意ZIP直接importや未確認のMuse中央ストアは案内しません。
実機検査が必須で満たせないCursor提出は保留します。
[Grok／Muse検査票](acceptance/guilduo-next-hosts-grok-muse.md)と
[English guide](guilduo-next-hosts.md)に工程別の境界を記録します。
