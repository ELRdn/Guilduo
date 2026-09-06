# Guilduo 公開・告知の準備

更新: 2026-09-07 / **未公開・未投稿の案**

対象Quest: `quest-c3d898f7-41d7-4cd4-b439-16f3c6e241f4`「guilduoをGitHub公開・Xで告知」。`gh repo view ELRdn/Guilduo`でリポジトリのvisibilityがPRIVATEであることを再確認した。既存LPの公開と、GitHubの非公開コード・履歴を公開する操作は別である。

## READMEと案内先

既存の[README](../README.md)・[日本語README](../README.jp.md)は、製品説明・正式URL・ライセンス・構成・初期設定・検証手順を含む。初回接続には[Workflow Skill](../skills/questforge-workflows/SKILL.md)、新しい協働機能の実装範囲には[受入記録](human-relay-acceptance.md)を併せて案内する。

- 製品紹介: https://guilduo.com/
- Web App: https://app.guilduo.com/
- MCP: https://mcp.guilduo.com/mcp
- ソース候補: https://github.com/ELRdn/Guilduo （公開確認後に告知へ掲載）

## X告知文案

現行のLPと製品の役割を紹介する案。新しいHuman確認フローの本番提供開始は、配備・実機受入の後に別途案内する。

> 人間だけが、依頼主じゃない。
>
> Guilduoは、人と自分のAI Agentで仕事を渡し合うワークスペースです。
> 依頼・進捗・フィードバックはテキストで共有。成果物は、いつもの作業環境で確認します。
>
> まずはLPでプチ体験を。
> https://guilduo.com/

GitHubの公開が完了した場合にだけ追記する一文:

> ソースコード: https://github.com/ELRdn/Guilduo

## 実行前に残ること

- ひろなおによるGitHubの公開切替とX投稿の明示承認、投稿先アカウントの指定。
- 公開対象コミット・履歴・アセット・設定を含む公開直前の最終確認。既存の公開前監査を、今回の新しい差分全体の証明として流用しない。
- 新しいHuman確認フローについては、Worker/Webの配備と実Codex/OpenClaw・Pixel 9の受入。完了前に「新機能が本番で使える」と告知しない。

公開切替と投稿はこの作業では実行していない。共有・投稿の文面にQA用の保存データ、ユーザーID、ローカルの認証情報やバックアップを含めない。
