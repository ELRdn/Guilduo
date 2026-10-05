# Guilduo 検索・発信の実施パック

更新: 2026-10-06。2テーマ×日英の静的用途ページ、既存LP/Docs/READMEの導線、sitemapの4 URL追加を実装。外部サービスへの投稿・予約投稿は行っていない。

| 資料 | 内容・現在の状態 |
| --- | --- |
| [Search Console手順](SEARCH_CONSOLE.md) | 既存プロパティ、公開前28日、sitemap、14重要URL、生成AI設定の確認手順 |
| [Search Console記録](search-console-record.json) | ログイン画面での実測は未確認。値をnullにし、HTTP検査と取り違えない |
| [Zenn原稿](zenn-human-ai-relay.md) | 日本語の設計記事。published:false、本人レビュー前 |
| [DEV原稿](dev-human-ai-relay.md) | 英語の設計記事。published:false、本人レビュー前 |
| [媒体別素材](OUTREACH_DRAFTS.md) | X日英・記事紹介、Show HN、Product Hunt、Reddit候補と確認済み規則 |
| [公開・検証記録](PUBLICATION.md) | ソース版、CI、配備、本番HTTP/Chrome検証、残るSearch Console作業 |

## 提供範囲

対象は外部AIを使う個人開発者。MCPタスク管理と人↔AIの引き継ぎ・レビューを説明する。Agent登録や状態変更はモデル起動を意味せず、Human回答・Handoff受理・元Quest完了も分ける。価格、未公開の同期、架空の生産性改善、実機や実アカウントの受入済みという表現は追加しない。

原稿は公開コードを材料にした説明で、実験・顧客事例として扱わない。ツール引数のJSONはプレビュー用に現行schemaと照合し、参照するリポジトリ内ファイルの存在とProduct Hunt descriptionの文字数を確認した。

## 計測と次の作業

Search Consoleはひろなお確認では登録済み。認証済み操作接続がないため、管理画面の実際の送信・索引状況は本人操作を待つ。手順と記録欄は準備済み。公開前28日と公開後7日・28日の非ブランド表示・クリック・CTR・ページ別状況を同じ条件で比較する。生成AIレポートが使える場合は別に確認する。今回は自動監視や新しい本人連結計測を追加しない。

実投稿は別の作業。r/mcpの公開βの扱いは未確認なので今は候補保留、r/opensourceはAI生成投稿禁止のためこの原稿の投稿先から除外した。r/SideProjectは一次候補だが投稿時のsidebar、固定投稿、account条件も本人が確認する。
