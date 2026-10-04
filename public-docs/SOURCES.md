# Guilduo public Docs 編集根拠

確認日: 2026-10-05（Asia/Tokyo）
公開リポジトリ: https://github.com/ELRdn/Guilduo
公開default branch: `main`
対象commit SHA: `5125178d48e94be8d8a16d401fd992da5d8a2b5d`
対象commit: Merge pull request #48 from ELRdn/feat/lp-demo-v3
revision: https://github.com/ELRdn/Guilduo/commit/5125178d48e94be8d8a16d401fd992da5d8a2b5d

## 今回の確認方法と公開先

- originがELRdn/Guilduoを指すことを読み取りで確認した。
- `gh api repos/ELRdn/Guilduo`でdefault branchがmainであることを確認し、`commits/main`で上記SHAを取得した。
- リポジトリtreeと資料本文はGitHub APIから読み取った。本文取得はすべて`contents/<path>?ref=5125178d48e94be8d8a16d401fd992da5d8a2b5d`へ固定し、ローカルdirty実装を公開根拠にしていない。
- 編集対象の公開先は、今回決定された正式サイト配下の https://guilduo.com/docs/ 。親担当の実確認では現状HTTP 200でもアプリfallback HTMLでcanonicalはapp.guilduo.comを指し、Docsは未公開。今回の本文作成を配備・公開確認へ読み替えない。
- 上記公開revisionのdocs/public-urls.mdにあるdocs.guilduo.comはReserved / Futureの旧計画。このDocsの公開先として採用しない。Web AppとMCPの正式URLは公開資料どおり維持する。
- content.jsonのrootに`sourceRevision`を付与した。各記事のsources.pathは公開revisionに実在するrepo-relativeなファイルpathで、rendererは上記SHAを使ってGitHub blobリンクを固定できる。

## 採用した公開資料

以下のリンクは編集対象SHAに固定している。

| 公開資料 | 本文に採用した内容 |
| --- | --- |
| [README.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/README.md) | 製品の役割、正式入口、公開β範囲、OAuth接続順序、Agent context、Quest保管、CLI |
| [README.jp.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/README.jp.md) | 日本語の製品用語、接続手順、再接続と公開範囲 |
| [PROJECT_SPEC.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/PROJECT_SPEC.md) | Quest・予定・保管・親子・Handoffの分離、認証同期、Agentと実行環境の責務、Human回答の本人境界 |
| [docs/public-urls.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/docs/public-urls.md) | Web App・MCP・Appwrite APIの役割、内部pathと旧URLの扱い、公開バグ報告先 |
| [API_MCP_SETUP.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/API_MCP_SETUP.md) | Remote HTTP MCPとOAuth、Worker RESTとAppwrite APIの違い、Provider OAuth準備中、CLIの実行条件 |
| [api/mcp-tools.json](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/api/mcp-tools.json) | ツール名、必須入力、dryRun対応、contextフィールド、ページネーション、Agentリンク権限 |
| [api/openapi.json](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/api/openapi.json) | Worker origin、REST経路、OAuth/Appwrite JWT、Human回答のWeb専用境界 |
| [skills/questforge-workflows/SKILL.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/skills/questforge-workflows/SKILL.md) | 読む・プレビュー・許可範囲で実行・レビューの順序、Agent担当、Human依頼・回答読取・再開、requestKeyの使い分け |
| [skills/questforge-workflows/references/tools.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/skills/questforge-workflows/references/tools.md) | 用途別ツール、Quest Tree最大深さ、HandoffとHuman確認、Registry操作境界 |
| [docs/guilduo-plugin-setup.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/docs/guilduo-plugin-setup.md) | 既存App用companionと直接MCPの選択、新しいチャットでのSkill確認、メタデータRefresh、公開審査とローカル導入の区別 |
| [plugins/questforge/README.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/plugins/questforge/README.md) | 登録テンプレートと実際のローカルパッケージの違い、legacy identifierの保持、公式審査の別工程 |
| [server/human-requests.ts](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/server/human-requests.ts) | request_key_conflict・human_request_pending・quest_conflict・quest_assignee_mismatchの診断根拠 |
| [worker/src/security.ts](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/worker/src/security.ts) | OAuthとAppwrite JWTの認証境界、スコープ定義 |
| [docs/human-relay-acceptance.md](https://github.com/ELRdn/Guilduo/blob/5125178d48e94be8d8a16d401fd992da5d8a2b5d/docs/human-relay-acceptance.md) | 実装・ローカル検証・本番配備・実機受入が別である点。過去の件数や配備状態を現在の提供保証に使わない |

これらは編集根拠として読んだもので、Skillを実行して利用者のQuestや接続を操作したわけではない。

## content.jsonのスコープ

- `ja`と`en`に各12記事、合計24ページ。両言語でslug・group・section ID・relatedを対応させた。
- slug: 空文字のoverview、getting-started、mcp-connection、codex、claude、quests、agents、human-relay、permissions、troubleshooting、faq、api。
- groupはstart / workflows / integrations / reference。各記事は4〜5sectionsを持つ。
- 各記事に固有title、description、lead、実用手順、具体例、診断または注意点、関連記事、公開sourceを含めた。
- paragraphs / steps / bullets / tableはplain text。コード・プロンプト例はcodeに置き、HTML・Markdownで本文やリンクを埋め込まない。
- Agent ID・Quest IDは実際の読み取りで得る。JSONのプレースホルダーは利用者が置き換える例であり、架空の既存データではない。
- Codexのpluginコマンドは公開されたローカル任意手順のみを採用。ClaudeはRemote MCP Connectorsを案内し、Codex pluginの自動互換性を仮定しない。
- SEO用本文とメタ情報を用意した。canonical、hreflang、構造化データ、静的生成、サイトマップ、UI、配備、実ブラウザ確認は親担当の範囲。

## 公開資料の齟齬と編集判断

1. MCPツール数はAPI_MCP_SETUPに51、READMEに54、公開mcp-tools.jsonに56があり、OpenAPI経路数も資料間でずれる。記事本文では固定件数を合格基準にせず、現在のtools/list、必要なツール名、実際の読み取りで判定する。
2. API_MCP_SETUPにはMCPクライアントのリンクがWeb限定との古い記述があるが、公開契約とWorkflow Skillにはlink_agent / unlink_agentがある。Web Connectionsを基本手順とし、公開ツールのagents:writeはOAuth接続管理権限として説明。Agent作成・編集・許可範囲拡張はWeb限定を維持。
3. dry-run推奨という一般原則を、すべてのツールで利用可能という説明にしない。公開create_quest / update_questにはdryRunがない。担当割り当て、Handoff、Human確認など、対応した契約のみ具体的なプレビュー例を掲載。
4. /healthや過去のテスト成功は、現在の認証済みクライアント・Human回答・実機受入の証明ではない。Human確認を使う前に2ツールの発見と、本人回答・保存済みfeedback読取を別に確認する。
5. 端末ゲスト保存の記載は従来root UIの責務として扱い、公式Relay Forge / MCPのアカウント保存と同一視しない。
6. Human確認Quest、Handoff承認、元Quest完了は独立。requestKeyの再送保証を一般Quest作成に広げない。子Quest完了で親も自動完了するとは説明しない。

## 除外した未公開・未承認事項

- ローカルdirty実装だけを根拠にした共有MCPのactingAgentId / allowedAgentIds、課金・Credits・紹介・価格・税・返金、Jev推論、追加分析機能。
- 過去の計画や受入記録を現在の本番成功として言い切る記述、固定の配備ID・テスト件数・性能達成保証。
- Google Calendar / Google Tasks / Notion / Togglの本番OAuth・自動同期が利用可能という説明。
- Agent登録やready割り当てだけで自動起動・LLM実行・外部公開が行われるという説明。
- 公開pluginディレクトリ掲載済み・OpenAI審査済みという説明、未確定のネイティブアプリやUnity機能。
- 新規ユーザーを内部デプロイpath、旧workers.dev、生成ドメインへ誘導する接続例。

## 編集検証と担当範囲

編集者は指定のcontent.json / SOURCES.mdだけを書き込む。既存dirty変更を維持し、Git状態を変更する操作、配備、接続登録、Quest操作、モデル呼び出しは行わない。

本文データのJSON解析、両言語12記事、必須slug、group、section数、関連記事参照、source pathと対象SHA、JSON入力例と公開MCPスキーマを確認する。24ページの静的buildと実ブラウザ検証は親担当が実施するため、この文書をそれらのPASS記録とは扱わない。
