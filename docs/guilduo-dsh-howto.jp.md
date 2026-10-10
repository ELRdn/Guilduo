# Guilduo DSHプラグイン：導入・使い方

[English](guilduo-dsh-howto.md) · [Guilduo README](../README.jp.md) · [npm](https://www.npmjs.com/package/@guilduo/dsh-oauth-poc)

DeepSeek Harnessの設定画面から[Guilduo](https://guilduo.com/)へ接続できます。OAuth対応MCPツールと `guilduo-workflows` Skillを追加します。トークンの貼り付けやソースからのビルドは不要です。

## 必要な環境

- Windows。検証対象は **DSH 0.2.0-rc.2**、Cordis **4.0.4**。他のOS・DSH版は未受入です。
- 導入済みのローカルDSH Webプロファイル、またはDesktopアプリのnative plugin manager。
- Guilduoアカウント。Webはホストと同じPCのブラウザーからlocalhost／数値loopbackで開いてください。OAuthの戻り先はローカルです。

## 1. 導入・更新する

同じDSH保存領域を使う旧Web／Desktopホストを停止してから更新します。既存のWebプロファイル名が `web` の場合：

```powershell
dsh plugin --profile web add @guilduo/dsh-oauth-poc@0.6.0-beta.16 --ignore-scripts
```

`web` は実際のWebプロファイル名に置き換えてください。2026-10-10時点では `@latest`／`@beta` もこの版ですが、版指定なら同じ配布物を再現できます。共有に参加する各プロファイルを更新し、ホストを再起動してブラウザーを再読込します。

**Desktop** はnative plugin managerで `@guilduo/dsh-oauth-poc` の `0.6.0-beta.16` を追加・更新します。npmのDSH CLIでは予約済みの `desktop` プロファイルを管理できません。Web／Desktopへのプラグイン導入は別々です。標準のbundle導入で有効になるため、手動Cordis overlayを重ねて登録しないでください。

## 2. 設定から接続する

1. DSHの通常会話を開き、**設定 → Guilduo** を開きます。
2. **接続 → ブラウザーで認証** を選びます。
3. GuilduoのOAuth画面でログイン・許可します。**接続済み** になるまで元の会話と設定画面を開いたままにしてください。
4. 旧版の有効な認証が **この会話のみ** と表示される場合、その**元の会話**で **全会話で使う** を一度押します。既に消失した認証は復元できないため、明示接続をやり直します。

新しい認証は、同じWindowsユーザー・`DSH_HOME` の通常会話とトップレベルforkで共有します。更新済みWeb／Desktopも対象です。subagent・子Agent・独立seeded会話には引き継ぎません。保存認証はWindows CurrentUser DPAPIで保護します。同じWindowsユーザー権限で動く別コードから秘密を隔離する機能ではありません。

接続先 `https://mcp.guilduo.com/mcp` はプラグインが設定します。インストールやロードだけでOAuth・モデル実行は始まりません。

## 3. 接続を確認して使う

DSHに **「Guilduo MCPを読み取り専用で確認して。get_agent_linkとget_current_agent_contextを使い、作成・更新・削除はしないで」** と依頼します。応答が返れば実接続を確認できます。OAuthのcallback URLや資格情報ファイルは会話・Issueに貼らないでください。

Questを扱うときは対象と許可する変更を指定します。認証共有だけではQuestの継続書き込みを許可しません。Agentが必要な運用ではGuilduoの接続設定で既存のRegistry Agentを紐付けます。DSH実行時のAgentとGuilduo Registry Agentは別のIDです。会話・ホストごとに登録Agentを増やす必要はなく、Freeの上限は **2登録Agent** です。

Skillは利用者の許可に沿ったフェーズ更新を案内します。このDSH版にはStopフックがなく、毎フェーズ終了時の更新を保証するものではありません。

## 4. 切断・削除する

先に **設定 → Guilduo → 切断** を選びます。共有中の切断は、**同じDSH_HOME内の対象会話・Web／Desktop全体**に効きます。サーバー側の認可失効は[Guilduo / Relay Forge](https://app.guilduo.com/)で別途行います。

ホストを停止してからWebプロファイルのプラグインを削除します。

```powershell
dsh plugin --profile web remove @guilduo/dsh-oauth-poc
```

Desktopはnative plugin managerで削除します。プラグインの削除だけではログアウトになりません。完了済み認証はunload時に保持します。旧版の未共有会話と認証を削除したい場合も、先にその会話で切断してください。

## 困ったとき

| 症状 | 対処 |
| --- | --- |
| Guilduo設定が出ない | 起動したプロファイルに導入されているか確認し、そのホストを再起動・ブラウザー再読込。 |
| ブラウザー認証から戻れない | ホストと同じPCのブラウザーでlocalhost／loopbackを使用。LAN・リモートブラウザーは非対応。期限切れなら明示的に再試行。 |
| 旧会話だけ接続できる | 元の会話で **全会話で使う** を実行。他の資格情報は自動探索しません。 |
| 接続済みなのにツールが使えない | 対象会話が共有対象か確認し、上記の読み取り専用テストを実行。発見失敗・カタログ変更時はホストを再起動して設定を確認。 |
| 旧版の更新後に再認証が必要 | 消失したgrantは復元不能。beta.16で一度明示接続。 |
| HandoffでAgentが見つからない | Guilduo Registry Agentの紐付け・許可scopeを確認。OAuth接続だけでは紐付きません。 |

[GitHub Issues](https://github.com/ELRdn/Guilduo/issues)には、DSH／プラグイン版、WebかDesktopか、再現手順を記載してください。トークン・callback URL・資格情報ファイル・非公開Quest本文や会話履歴は含めないでください。

## 公開・検証状況

**0.6.0-beta.16** はnpmの `latest`／`beta` として公開済みで、公開archiveのbyte一致を確認しています。ローカルpackage・native lifecycle・合成OAuth／Settings・隔離CLI検査が成功。2026-10-10の本人報告では実公開OAuth・ツール発見・MCP読み書きとDesktop再起動後の保存認証再利用が成功しています。起動から約1〜2分後に設定を開くと、再認証なしで接続済みでした。設定を開く前に復元が終わったかは、この観察だけでは断定できません。設定なし初回入力／新規／fork利用、限定更新のreadback・競合、Registry Agent紐付け／Handoff、Human回答→再開は未受入です。Registry Agentはまだ未紐付け。beta.14の過去の認証消失原因は未確定です。

このβを一区切りとして追加機能の開発は停止します。[現行の公開・受入状況](guilduo-dsh-status.md)を参照してください。GitHubのsource文書は更新し、公開済みnpm archiveと当時のREADMEは保持します。npmページのREADMEを差し替えるには新しい版の公開が必要で、今回の文書更新では版・latestを変更しません。ライセンス：[AGPL-3.0-only](../LICENSE)。
