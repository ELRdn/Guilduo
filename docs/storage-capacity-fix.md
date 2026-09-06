# Appwrite保存容量エラーの修正記録

確認日: 2026-09-06 / 状態: 修正を本番Workerへ反映済み、保存・再取得・既存データ保持を確認済み

## 原因

LP由来の本体改善Questの登録中、親の作成は成功したが、最初の子QuestがHTTP 413 / `state_too_large`で拒否された。

- Workerの`encodeState`とFirebase移行ツールは、状態全体をgzip＋Base64にした文字列へ60,000文字の上限を適用していた。
- Appwriteの実設定は`user_states.stateJson`・`legacy_states.stateJson`ともに`type: longtext`、`required: true`、`status: available`。古いアプリ側制限が実際の保存列と一致していなかった。[Appwriteの文字列型](https://appwrite.io/docs/products/databases/tablesdb/tables)
- 更新前の行は圧縮後59,561文字、復号後277,528 bytes。実データのローカルコピーへLP-R01を追加すると60,469文字になることを再現した。
- 最大の項目は移行スナップショット132,953 bytes。保存されているバックアップや履歴を削って収める対応は行っていない。

## 修正範囲

- [Worker](../worker/src/appwrite-store.ts)と[移行ツール](../tools/migrate-firebase-to-appwrite.mts)から旧60,000文字ガードを除去した。
- [PROJECT_SPEC](../PROJECT_SPEC.md)と[移行手順](../APPWRITE_MIGRATION.md)に、両保存列が必須の`longtext`であることを明記した。旧string列の別環境では、データを保全して列の移行を完了してから利用する。
- gzip＋Base64、旧JSONの読み込み、revisionによる競合検知、トランザクションは維持した。
- Appwriteの列・権限・料金プラン、OAuth grant、Agent許可、Web/LPの配信には変更を加えていない。

## 検証

| 確認 | 結果 |
| --- | --- |
| 修正前の合成データ再現 | Appwriteへの通信0件で`state_too_large`。修正後は保存成功 |
| 実データコピーでLP-R01を作成・復号 | 59,561→60,469文字。既存67 Quest・162イベント・移行スナップショット等を保持 |
| [保存回帰テスト](../tests/appwrite-state.test.ts) | 大容量のJSON/gzipからの作成・編集、既存データ保持、Appwrite失敗時の保存状態保持、古いrevisionの拒否が成功 |
| [移行回帰テスト](../tests/appwrite-migration.test.ts) | 60,000文字を超える合成状態をdry-runで処理。本番移行は未実施 |
| 現作業ブランチ | 型検査・326テスト・design:checkが成功 |
| 本番候補ブランチ | 型検査・324テスト・API/MCP生成差分なし・Worker dry-runビルドが成功 |
| 本番疎通 | health・OAuthメタデータ200、MCP未認証401、Web AppのCORS成功。54ツールとCyan-OAのQuest更新権限を維持 |
| 実MCP保存 | 子8件の作成と親の案内更新に成功。タグ検索で親子9件の本文・完了条件・担当・依存関係・バックログ状態を照合 |
| 保存後のデータ比較 | revision 29→38、圧縮後66,101文字、Quest 67→75、イベント162→171。既存Questは許可された親のnotes/nextAction/updatedAt更新以外が一致。既存イベントとその他の状態項目はすべて保持 |

ブラウザによるUI操作は今回の検証には含めていない。MCP経由の実保存とAppwriteからの再取得で復旧を確認した。

## 配備と作業ツリー

- Worker: `questforge-gateway` / `https://mcp.guilduo.com`
- 修正前の配備版: `8859f669-98de-4401-a532-c879c921e34a`
- 修正後の配備版: `d6c519f8-b962-45b7-a3b6-315b68023231`
- 本番はmain未マージのAgent schema/scope修正を含んでいたため、そのソース`4f97b55`を基に`codex/fix-state-capacity`を作り、今回の保存修正だけを加えて配備した。
- 本番候補の作業ツリーは`.qa-artifacts/storage-capacity/worker-release`。Worker・移行ツール・回帰テストは、元の`codex/lp-product-roadmap`作業ツリーと内容一致を確認済み。両方に未コミットの変更を保持している。
- 次にmainからWorkerを配備する際は、既配備のAgent修正と今回の保存修正を統合する。この保存修正を確認した2026-09-06時点では本体改善8項目は登録のみ。2026-09-07の実装と残る受入は[改善計画](lp-product-followups.md)に記録した。

## 保全と切戻し

更新前後の実データ、再現結果、比較結果、配備ログはGit対象外の`.qa-artifacts/storage-capacity/`に保管した。公開するのは本記録と合成データのテストだけとし、個人のQuest本文やバックアップをGitへ追加しない。

本番の行を古いバックアップへ自動復元しない。旧Workerへ切り戻すと60,000文字制限が戻って保存が再度失敗するため、修正を維持した版を使う。gzipの保存形式と旧JSONの読み込み処理は変更していない。追加されたQuestや履歴を消して旧上限へ合わせる対応は行わない。

登録した改善内容と実IDは[LPからの本体改善計画](lp-product-followups.md)を参照する。
