# Guilduo Interaction Lab

Relay Forgeの操作設計をPCとスマホで試すためのInteraction Labです。見た目だけのモックではなく、ローカル保存とGuilduo REST Gatewayへの任意接続を同じUIで検証できます。正式なWeb Appは [Guilduo / Relay Forge](https://app.guilduo.com/) です。

設計の差分・状態遷移・レスポンシブ境界・現行版への昇格条件は[`DESIGN.md`](DESIGN.md)を正本とします。開発ルートは`/interaction-lab/`、Appwrite Sitesへ出力されるRelay Forgeの実装pathは`/next/relay-forge/`、新規ユーザー向けの正式入口は`https://app.guilduo.com/`です。共通の視覚ルールはプロジェクトルートの[`DESIGN.md`](../DESIGN.md)、部品と画面Blueprintは[`design/COMPONENTS.md`](../design/COMPONENTS.md)と[`design/SCREENS.md`](../design/SCREENS.md)、Quest・MCP・認証・安全性の技術ルールは[`PROJECT_SPEC.md`](../PROJECT_SPEC.md)を参照してください。公開URLの対応は[`docs/public-urls.md`](../docs/public-urls.md)を参照してください。

- 初期状態はローカルモードです。追加、完了、レビュー、親子展開、バトル、設定は`localStorage`へ保存され、再読み込み後も維持されます。
- 設定画面でGoogleログインし、Gateway URLを確認して「本体データを読み込む」と、Quest一覧・キャラクター・バトル・連携状態を認証付きRESTから読み込みます。公開環境のGateway originは`https://mcp.guilduo.com`です。
- リモートモードではQuest追加、完了、レビュー更新、バトルコマンド、外部連携のプレビュー／同期が本体APIへ送られます。同期はdry-runを先に行い、未ログイン時や接続失敗時はローカル状態を維持します。
- 本体データを読み込む直前のローカル状態は、`questforge-interaction-lab-local-backup`へ自動バックアップされます。
- 今日の作戦は広いPCでは運用テーブル、中間幅では読みやすい再配置、スマホでは選択バーと詳細シートへ自動で切り替わります。
- バトルのリセットはリモート状態を勝手に上書きしないため、ローカルモードでのみ実行できます。

プロジェクトルートでViteを起動し、`/interaction-lab/` を開いてください。

## 本体データへ接続する

1. 設定を開き、Gateway URLを確認します。通常は`https://mcp.guilduo.com`が初期入力されます。
2. 「Googleでログイン」を押し、Guilduoに使っているアカウントで認証します。
3. 「本体データを読み込む」を押します。失敗してもローカルデータは置き換えません。
4. 連携画面のプレビューを確認してから同期します。

FirebaseのAuthorized domainやWorker側のFirebase認証設定が未完了の場合は、ローカルモードで利用できます。認証情報やOAuth秘密情報をInteraction Labへ直接書き込まないでください。
