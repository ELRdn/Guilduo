# Search Console 実行・記録手順

準備日: 2026-10-06。ひろなお確認ではGuilduoは登録済み。この環境には認証済みのSearch Console接続がないため、管理画面の状態・送信・URL登録申請は未実施。公開HTTP検査は所有者のSearch Console結果を代替しない。

## 既存プロパティと変更前の記録

1. [Search Console](https://search.google.com/search-console)で既存Guilduoプロパティを選ぶ。`guilduo.com`のドメインプロパティがあればそれを使う。既存が`https://guilduo.com/`ならそのまま使い、重複登録しない。プロパティ名、権限、手動による対策、セキュリティ問題、ページ登録レポートの主な理由を記録する。
2. 検索パフォーマンスのWebで公開前の完全な28日を固定し、検索クエリ「カスタム（正規表現）・一致しない」で`(?i)guilduo|ギルデュオ|questforge|quest.?forge|relay.?forge`を指定する。期間、表示、クリック、CTR、平均掲載順位、ページ別・クエリ別表をエクスポートする。匿名化や少量クエリ省略があるため非ブランド集計は全訪問や全検索を示さない。得られないデータはnullのまま。
3. 設定 → Search generative AIを確認。IncludeまたはIncludeを継承なら維持する。Excludeなら対象プロパティと継承元を記録し、今回の検索掲載目的に合わせIncludeにする。Google-Extendedなど学習用botの選択とは別。レポートが表示されない場合は未利用・データ不足の可能性を残し、0とは記録しない。

## sitemap送信

公開検証後、サイトマップで`https://guilduo.com/sitemap.xml`を使う。URL-prefix画面で末尾を求められる場合は`sitemap.xml`。送信済みなら最終読み込み・成功／処理中／エラー・検出URL数を読む。未送信なら1回送信して状態を記録する。今回の候補は32 canonical URLsで、検出数は処理後に反映し得る。所有者画面の実数を記録し、期待32を実測と取り違えない。

## 重要URLの検査と申請

下記14件を優先順に確認する。既存ページの索引データと新規ページを区別する。

| 順 | URL |
| --- | --- |
| 1 | https://guilduo.com/ |
| 2 | https://guilduo.com/lp/en/ |
| 3 | https://guilduo.com/docs/ |
| 4 | https://guilduo.com/docs/en/ |
| 5 | https://guilduo.com/docs/mcp-connection/ |
| 6 | https://guilduo.com/docs/en/mcp-connection/ |
| 7 | https://guilduo.com/docs/faq/ |
| 8 | https://guilduo.com/docs/en/faq/ |
| 9 | https://guilduo.com/docs/human-relay/ |
| 10 | https://guilduo.com/docs/en/human-relay/ |
| 11 | https://guilduo.com/solutions/mcp-task-management/ |
| 12 | https://guilduo.com/solutions/en/mcp-task-management/ |
| 13 | https://guilduo.com/solutions/ai-agent-handoff/ |
| 14 | https://guilduo.com/solutions/en/ai-agent-handoff/ |

各URLを上部の検査欄へ入力し、登録状況・最終クロール・Google選択canonicalを記録する。公開URLをテストし、アクセス可否と必要なら描画された本文を確認する。Google-selected canonicalは索引データからだけ読み、公開テストが自己canonicalを保証したとは書かない。未登録または更新後なら1回登録をリクエストする。既に現在の版が登録済みなら「不要」と記録する。上限に達したら「上限・未申請」として残りを後日に回し、同一URLを繰り返さない。

MCP endpoint `https://mcp.guilduo.com/mcp`やログインするWeb App、API、互換pathはこのリストへ追加しない。

[search-console-record.json](search-console-record.json)へ画面の結果と実行時刻を保存する。認証情報、token、email、ユーザーのQuest内容、実アカウントの個人情報は資料へ入れない。ローカル作成・公開・送信受理・Google登録・検索成果を別々に評価する。

## 公開後7日・28日の比較

本番公開日を起点に7日／28日経過後、直近の完全な日だけを同じ条件で比較する。表示・クリック・CTRと対象4ページ、上位の非ブランドクエリを見る。少量なら不足として保留し、CTR改善や順位変化だけで因果効果を断定しない。生成AIレポートが使える場合はページ別の表示を別に記録する。他のAIサービスの実引用は回答・URL・確認日で別記録し、Search Consoleから推定しない。今回は自動監視・有料SEOツール・新規GA連結は追加しない。

## 公式根拠

- [再クロール:少数URLは検査、多数URLはsitemap](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [sitemapの作成と送信](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [公開URLテストと登録申請](https://support.google.com/webmasters/answer/9012289)
- [URL Inspection API:索引状況照会のみ](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)
- [生成AI掲載設定](https://support.google.com/webmasters/answer/16908024?hl=en)
- [生成AIパフォーマンス](https://support.google.com/webmasters/answer/16984139)
- [SEOと生成AI検索](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
