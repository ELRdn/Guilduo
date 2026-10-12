# Guilduo 作業保存チェックポイント — 2026-10-12

ひろなおの「並行作業を一旦停止し、未pushの作業をすべて調査して安全にpushする」という指示によるソース保存記録。mainへの統合、本番配備、npm公開、タグ・Release作成とは別の作業である。

## 調査と保存対象

- 同じGitリポジトリに属する10個のworktreeと71個のローカルブランチを調査。初期状態で4か所に未コミットの作業、origin全体に未到達のコミットが4件あった。
- 本体checkout：Relay Forge、表示切替・カレンダー・ノート・時間記録、認証・保存・共有Agent、公開文書、課金・Jev・計測の候補実装、プラグインの候補ソース、関連検証と配備ゲートを保存。
- host-extensions worktree：本人からのDSH beta.17安定動作・New Chat再接続報告と未受入境界の文書追記。
- storage-capacity worktree：Appwrite longtext保存・Firebase移行の旧60,000文字制限撤去、保持データの回帰テスト。
- prototype worktree：公開面の配備記録と実アカウント・実機受入を分けたロードマップ更新。
- 過去のLP候補、Claude plugin mirror、MCP出力契約の未pushコミットもブランチとして保存する。既にoriginの別ブランチへ到達しているコミットと、初めてpushするコミットを区別する。

本体は`3753c5f`を基点とする作業中スナップショット。調査時のorigin/mainは`7b4c8a0`である。新しい`codex/work-checkpoint-20261012`へ保存し、古い本体checkoutからmainを上書きしない。他worktreeの差分はそれぞれの作業ブランチへ保存する。競合・履歴の書き換えを避けるため、force pushと一括タグpushは行わない。

## 公開から除外するもの

OpenCodeのnative-host検証キャッシュ・captureは初期状態で7,780ファイルあった。`/plugins/*/artifacts/`をignoreへ追加し、ローカルに保持する。既存の`.qa-artifacts/`、実設定、認証情報、private/backups、node_modules、生成Webビルドも公開しない。プラグインの配布に必要な`lib/`は候補ソースと併せて保存する。

変更ファイルと未到達コミットのtreeを秘密情報検査し、検出したテスト用認証値・拒否テストのURL・設定テンプレートを分類した。秘密情報の検査ログ、ローカルパス、作業前後のファイル指紋は公開せず、ignored `.qa-artifacts/push-audit/`に残す。

## 検証と残る境界

- 本体：715テスト、型検査、design:check、ビルド、API生成の再現性、diff検査。
- 保存容量の別worktree：関連6テストとdiff検査。
- 文書の別worktree：追加相対リンクとdiff検査。
- 直前の本体ブラウザー検証は[productivity記録](productivity-workspace.md)に記載。実機のタッチ・スクリーンリーダー・本番受入は未完了。

この保存は機能完成や配備承認を追加しない。候補ソースと公開済みplugin/mainには版の差があるため、本番や配布物へ適用する前に対象ブランチの統合・差分レビュー・通常の署名付き公開ゲートが必要である。push後はリモートの各refとローカルSHAを照合し、未到達コミットと未コミット作業の残りを再確認する。
