# Guilduo for OpenClaw

beta.15でSkill名を `questforge-workflows` から `guilduo-workflows` へ移行します。プラグインを更新してホストを再起動し、独立導入した旧Skillは重複しないよう置き換えてください。OAuth・MCP・プラグインIDは維持します。[移行手順](../../docs/guilduo-workflows-migration.md)。beta.14の証拠は旧版の記録です。

[English](README.md) · [公式サイト](https://guilduo.com/) · [Guilduo / Relay Forge](https://app.guilduo.com/)

`@guilduo/openclaw-plugin@0.6.0-beta.15` は**未公開の候補**。OpenClaw **2026.9.9**（commit `bcfc88812a35243893585dbeca87ca41b48272ca`）専用で、Node条件はホストと同じ `>=24.16.0 <25 || >=26.1.0`。正本のWorkflow Skillと標準Streamable HTTP OAuth宣言を配布し、認証・資格情報・画面はOpenClawが担当する。導入だけでモデル実行やQuest書込み許可は発生しない。

## 導入と接続

レビュー済み候補tgzを受け取り、導入済みOpenClawで実行する。

```powershell
openclaw plugins install ./guilduo-openclaw-plugin-0.6.0-beta.15.tgz
openclaw mcp add guilduo --url https://mcp.guilduo.com/mcp --transport streamable-http --auth oauth --no-probe
```

既存のGuilduo接続がある場合は、先に **Settings → MCP** でalias・無効設定・filterを確認して保持する。`mcp add` は使用中の `guilduo` を上書きしないが、同じURLの別名は検出しない。自動でaliasを保持したい場合は、展開したpackageで2つ目のコマンドの代わりに `node setup.mjs` を実行する。PATHのOpenClawを使い、標準レジストリを確認し、未登録時だけ追加する。競合はSettingsで明示的に解決する。設定操作中はほかの設定書込みを止める。同名の作成競合はホストが拒否するが、別名の同時追加を含む検査は一つのトランザクションではない。

**manifestだけでは `mcp.servers` の保存設定は作られない。** Pluginの **Accounts** に表示するには、宣言と設定のname **`guilduo`**、URL **`https://mcp.guilduo.com/mcp`** が一致し、`transport: "streamable-http"`、共有の `auth: "oauth"` が必要。別aliasはSettings/CLIで使えるがAccountsには一致しない。無効設定、per-requester、auth-profile接続は専用の標準設定経路を使い、補助スクリプトは変更しない。

管理者接続済みControl UIで **Settings → MCP → Sign in**、または導入済みGuilduoの **Accounts → Connect** を選び、ブラウザで認可する。保存成功後は **Connected**、**Edit** でMCP設定へ戻る。

UIから接続できない場合は `openclaw mcp login guilduo`。ホストがブラウザURLとloopback callbackを扱う。callbackに届かない場合は表示された `openclaw mcp login guilduo --code ...` をローカルで使う。認可codeや資格情報をチャットへ貼らない。既存aliasがあればコマンドでもその名前を使う。CLI設定が実行中Gatewayへ反映されない場合は設定のPublishまたは再起動を行う。`mcp reload` は現在のCLI processだけに作用する。

この候補の範囲は、共有operator OAuthを使う個人／管理者管理のインスタンス。**Accounts** はその接続の保存状態を示し、別ユーザーやchannel requesterの検証を意味しない。channel権限はOpenClaw標準を正本とする。複数人channelの受入は未検証で、plugin独自のrequester権限は追加しない。

## 確認と作業開始

```powershell
openclaw plugins inspect guilduo --runtime --json
openclaw mcp status --verbose
openclaw mcp doctor guilduo --probe
```

認証保存状態、接続・tool discovery、plugin有効状態は別の証拠。追加認可が必要なら再度Sign in/loginを行う。

Web Appで既存Agentを選び、`get_current_agent_context` と対象Questを読む。共有接続では許可済み `actingAgentId` を全callへ送る。対象Quest/Agentへの継続更新を明示的に許可してから作業する。Freeの登録Agent上限は2。Skillはpreview・version照合付き限定更新・読み戻しを案内するが、自動起動や完了・採点・報酬を許可しない。

## 更新・切断・削除

ローカルtgzの更新と再導入は、レビュー済み新候補を `openclaw plugins install ./guilduo-openclaw-plugin-0.6.0-beta.15.tgz --force` で置換してGatewayを再起動する。MCP設定は保持される。rollbackは保管した旧tgzで同じ操作を行う。互換性・導入policyの失敗を強制回避しない。

別途npm公開が承認・実施された後に限り、`openclaw plugins install npm:@guilduo/openclaw-plugin@0.6.0-beta.15 --pin` を使える。npm導入の更新はレビュー済みversionを明示して `openclaw plugins update @guilduo/openclaw-plugin@<reviewed-version>`。ローカルtgz導入は自動でnpm更新へ切り替わらない。この候補は公開しない。

実際のaliasで切断・削除する。

```powershell
openclaw mcp logout guilduo
openclaw mcp unset guilduo
openclaw plugins uninstall guilduo
```

Logoutはホスト保存認証、unsetは接続設定、uninstallは拡張とSkillを削除する。拡張だけの削除では明示的なMCP設定が残り、再接続できる。Gatewayを再起動する。一時停止はSettings → MCPで無効化。サーバー側失効はGuilduo Web Settingsで別途行う。無関係のalias・plugin・データは保持する。

## 開発と検証

[英語READMEの検証コマンド](README.md#build-and-evidence) と [受入記録](../../docs/guilduo-openclaw-native-evidence.md) を参照。追加依存なしでNode標準のTypeScript変換・testを利用する。QAのホーム・SQLite・cache・fixtureはpackageの `.qa-artifacts/` に隔離し、実OpenClaw設定・資格情報・履歴へ触れない。公開OAuth・実Quest書込み・Human往復は別の実環境受入。AGPL-3.0-only、正式Skill名は `guilduo-workflows`。

標準 `plugins validate` はtool/feature authoring metadata用で、この `definePluginEntry` のSkill/MCP packageには非対応。`plugin entry does not expose tool or feature authoring metadata: ./lib/index.js` を記録し、合格や公開承認には数えない。package/manifest/実SDK・ネイティブ導入・runtime読込み・Skill探索・OAuthを別途検査する。[公式sourceと詳細](README.md#build-and-evidence)。Accounts検査はホスト実装の状態projectionまでで、ブラウザ描画は未検証。
