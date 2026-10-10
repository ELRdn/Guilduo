# Muse Code向けGuilduo Workflows

[English](README.md) · **0.6.0-beta.12** · AGPL-3.0-only

正本 `skills/guilduo-workflows/` を同梱するnative `.muse-plugin/plugin.json` bundleです。Windows対象はstable **1.4.4-R5419.1**。hooksとpackage内MCPは含めず、設定書換え・credentialコピーはしません。認証付きMCPは独立したnative user settingを使います。

## 導入・発見

[Guilduo repository](https://github.com/ELRdn/Guilduo)からdirectoryを検査・導入します。ZIPは先にdirectoryへ展開し、local-source更新用に保持します。

```powershell
muse --version
muse plugins validate ./plugins/guilduo-muse --json
muse plugins install ./plugins/guilduo-muse --json
muse plugins inspect guilduo-workflows --json
muse skills list --source plugin --json
```

Skill IDは `plugin:guilduo-workflows:guilduo-workflows`。導入・発見はprovider login・有料契約・model呼出しなしで検査できます。sourceを確認して対象だけを導入し、他のplugin・設定を保持します。

## MCP設定・認証

[settings.example.json](settings.example.json)の `mcpServers.questforge` だけをnative user `settings.json` へmergeし、他のentryと `schema_version:1` を保持します。隔離profileでは `$XDG_CONFIG_HOME/muse/settings.json`。最新版CLIは各表記の単独指定を認識しますが、例はnative OAuth helpに合わせてcamelCaseを使います。`mcp_servers` aliasと併記せず、`mode:"optional"` を使います。`all` は使用しません。

```powershell
muse mcp login questforge
# ブラウザが開かない環境:
muse mcp login questforge --headless
```

標準ブラウザ／PKCE consentで自分のGuilduo accountを認可します。headlessの最終redirect URLをログ・メッセージ・archiveへ残しません。保存・refreshはnative Museが担当し、env tokenや独自bridgeは使いません。OAuthと有料model利用は別で、導入検査に課金設定やmodel実行は不要です。接続MCP操作とmodel/Human動作は別の受入条件です。

導入・OAuthだけではAgent登録・Quest更新を許可しません。最初に `get_agent_link` と `list_registered_agents` を読み、専用接続ではownerが許可した既存Agentを `link_agent` して `get_current_agent_context` を確認します。Freeは登録Agent 2件まで。共有接続は `allowedAgentIds`／`requiresAgentSelection` を守り、人が指定したidentityの `actingAgentId` をread・preview・writeすべてに付けます。identity切替のために共有接続をrelinkしません。

## 更新・停止・切断・削除

```powershell
# 同じlocal source directoryの変更を確認した後:
muse plugins update guilduo-workflows --json
muse plugins disable guilduo-workflows --json
# 明示的に再開:
muse plugins enable guilduo-workflows --json
# OAuthはpluginと独立:
muse mcp logout questforge
muse plugins remove guilduo-workflows --delete-data --json
```

先に実行中の作業を止め、継続更新許可を撤回します。plugin変更は次回loadへ反映するためsessionを再開します。完全切断では、このMCP設定だけをdisable/removeして他の設定を保持し、必要ならserver認可も撤回します。plugin削除はMCP設定・Guilduo Agent／Questを削除しません。

SkillはPlan／read-only／停止指示を優先し、進捗・完了・Human承認を区別する手順で、lifecycle保証ではありません。host確認policyを守り、許可された狭いwriteをpreviewします。

## 配布・証拠

既存repositoryのdirectoryと展開ZIPをlocal-source候補にします。native Museはcustom marketplaceを扱いますが、[SDK guide](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/marketplaces-and-updates/)はDeveloper Previewで、中央公式listingではありません。新しいmirror repositoryは不要です。

[受入記録](https://github.com/ELRdn/Guilduo/blob/main/docs/acceptance/guilduo-next-hosts-grok-muse.md) · [公式拡張guide](https://dev.meta.ai/docs/muse-code/extending) · [native plugin CLI](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/) · [Guilduo Docs](https://guilduo.com/docs/)
