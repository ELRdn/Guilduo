# Grok Bot向けGuilduo Workflows

[English](README.md) · **0.6.0-beta.12** · AGPL-3.0-only

`plugin.json`、`mcp.json`、正本 `skills/guilduo-workflows/` を同梱するAgent Plugins形式の候補です。許可済みQuestの進捗とHuman/Agent Handoffを案内し、hooks・provider key・native profile・credential bridgeは含みません。

## 導入・認証

[既存Guilduo repository](https://github.com/ELRdn/Guilduo)の `plugins/guilduo-grok` がsource、`.cursor-plugin/marketplace.json` がcatalogです。ZIPのrootはpackage内容です。source公開・Cursor審査・Grok Bot導入は別の段階で、GrokのZIP/local importコマンドや掲載を確認した候補ではありません。

利用可能なconnectorはGrok Botの標準Marketplace UIから選び、権限を確認して自分のGuilduo accountへブラウザOAuthします。接続先は `https://mcp.guilduo.com/mcp`、互換ID `questforge` を維持します。native import・表示・OAuth・Skill起動は実ホストの受入条件です。Cursor検査はGrok受入証拠になりません。

[公式の利用条件](https://docs.x.ai/grok-bot/get-started)を満たす既存Cursorまたは連携SuperGrok accessが必要です。個人Botで足り、Team Botは必須ではありません。新しい有料契約は要求しません。利用資格がなければpackage検査まで進め、接続・model・Human受入は保留します。

## Agentと権限

導入・OAuthだけでAgent登録やQuest更新を許可しません。最初に `get_agent_link` と `list_registered_agents` を読みます。専用接続ではownerが許可した既存Agentだけを `link_agent` し、`get_current_agent_context` を確認します。Freeは登録Agent 2件までで、余分なAgentを自動作成しません。

共有接続は `allowedAgentIds`／`requiresAgentSelection` を守り、人が指定した許可済みidentityの `actingAgentId` をread・preview・writeすべてに付けます。共有接続をrelinkしてidentityを切り替えません。Plan／read-only／停止指示とhost確認policyを優先し、狭いwriteをpreviewします。進捗・完了・Human承認は別で、Skillは自律実行を保証しません。

## 更新・停止・切断・削除

sourceと権限を確認してhostの標準plugin UIで更新します。作業を止め、継続更新許可を撤回した後、Marketplace → Your pluginsでこのconnectorをdisable/removeします。必要ならhost側OAuth切断とGuilduo側認可撤回を行います。正確なUIとsession反映はGrok native未受入項目です。他のplugin・設定・Agentを保持します。

## 配布・証拠

[Cursor公式reference](https://cursor.com/docs/reference/plugins)はroot manifestとmonorepo catalogを扱います。既存公開repositoryを[Publish](https://cursor.com/marketplace/publish)へ提出して手動審査を受ける経路です。tested-locally条件は実ホスト検証まで保留で、catalog作成は提出・掲載ではありません。

[受入記録](https://github.com/ELRdn/Guilduo/blob/main/docs/acceptance/guilduo-next-hosts-grok-muse.md) · [Guilduo Docs](https://guilduo.com/docs/)
