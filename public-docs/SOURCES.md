# Guilduo public Docs 編集根拠

## 2026-10-10：OpenAI・Codex・Grok Bot・Muse Code beta.12

- 公開sourceRevision: `53793f068546524305d3bc8634edf2918eef4c6b`（レビュー済みsource PR #64の公開main merge）。日英OpenAI／Grok／Muse記事を追加し、Codex記事を更新。各18記事・計36ページ。既存renderer／schema／デザインは変更しない。
- Claude担当が公開mainへ統合した記事は日英とも内容一致を検証して保持した。overviewとMCP接続の関連記事を追加した。既存DSH／OpenCode／OpenClawの記事と配布物を保持する。
- 新記事は公開sourceの`docs/guilduo-next-hosts.md`、日本語ガイド、host別受入文書、canonical Skill、manifest、READMEを根拠とする。全記事のsources.pathが固定したGit commitに存在することを確認する。
- OpenAI ZIPはhook／App参照なしの審査候補。本人確認・候補の実ChatGPT受入・domain・scan・reviewer環境・demo・提出／承認／Publishは未完了。既存App利用を候補plugin受入としない。
- CodexはCLI 0.159.2の導入／発見、既存App companionのbeta.12更新、専用プロセスの直接OAuth再利用・56tool発見・限定更新／readback・本人Human回答後の同セッション再開・no-op・競合再読取を確認。trusted hook実行、refresh／失効／再接続、Desktopの全導入工程は未受入。
- Grokはschema検査済みGit／ZIP候補。実ホスト検査が不足しCursor提出は保留。Muse stable1.4.4-R5419.1は公式checksumと無モデルの導入工程を確認。本人は認証ページが開かず端末エラーも残っていないと報告し、OAuthの根因は未特定・未受入。両候補の実モデル／Human往復は未実施。
- source／ZIPと新記事の独立AIレビューで未解消P1／P2なし。外部の人間による監査やホスト公式承認ではない。新規課金、npm配布、Claude側の実装変更は追加しない。
- ローカルでは36ページの静的本文・canonical・コマンド・検索／sitemap等40HTTP検査、Docs関連11テスト、build、追加／更新8記事の日英ブラウザー表示、コピー成功表示と言語切替を確認した。本番はdeploy38059302339成功後、全36ページと実404等41HTTP検査、同8記事の実ブラウザー・日英コピー成功表示・言語切替を確認した。公開4ZIPの再取得hash／asset digest／source tagも一致。[公開記録](PUBLICATION.md)に根拠を残す。

## 2026-10-10：3プラグインの公式導入ガイド

- 現在のroot sourceRevision: `60df808c2e4f39b287093240c33d1f7d1d7aedd5`（公開main、Record DSH beta.17 publication and final independent verification (#58)）。既存pageSchemaは記事単位revisionを持たないため、全記事の出典リンクをこの公開commitに固定した。renderer/schemaは変更していない。
- `content.json`のreviewedAtを2026-10-10へ更新。日英それぞれに`dsh`／`opencode`／`openclaw`を追加し、各15記事・計30ページとした。overviewとmcp-connectionには関連記事と短い導入案内だけを追加した。
- 既存記事の参照先14ファイルと追加した8ファイル、計22種のsources.pathがすべてこのSHAに存在することをローカルGit objectの読取りで確認した。新記事はその公開commitのREADME、status、native evidence、canonical Skill、PROJECT_SPECを根拠に編集した。非公開profile・資格情報・受入artifactは読んでいない。

| 記事（日英共通slug） | 導入版・検証host | 固定した公開資料 |
| --- | --- | --- |
| dsh | @guilduo/dsh-oauth-poc 0.6.0-beta.17 / Windows DSH 0.2.0-rc.2、Cordis 4.0.4、MCP client 2.0.0 | [README](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/plugins/guilduo-dsh/README.md)、[status](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/docs/guilduo-dsh-status.md) |
| opencode | @guilduo/opencode-plugin 0.6.0-beta.16 / Windows OpenCode 1.18.32・1.18.35 | [README](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/plugins/guilduo-opencode/README.md)、[status](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/docs/guilduo-host-extensions-status.md)、[native evidence](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/docs/guilduo-opencode-native-evidence.md) |
| openclaw | @guilduo/openclaw-plugin 0.6.0-beta.16 / Windows OpenClaw 2026.9.9 | [README](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/plugins/guilduo-openclaw/README.md)、[status](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/docs/guilduo-host-extensions-status.md)、[native evidence](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/docs/guilduo-openclaw-native-evidence.md) |

共通根拠は[canonical guilduo-workflows Skill](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/skills/guilduo-workflows/SKILL.md)と[PROJECT_SPEC](https://github.com/ELRdn/Guilduo/blob/60df808c2e4f39b287093240c33d1f7d1d7aedd5/PROJECT_SPEC.md)。旧記事に残るquestforge-workflowsの出典pathもこのcommitに実在する。新しい3プラグインのSkill名はguilduo-workflows。

### 今回の編集判断と受入境界

- 利用者の新しい方針に従い、通常導入はnpmのlatestを推奨し、再現用の固定beta版も併記した。latestはタグであって安定版宣言ではない。親担当はofficial npm registryでOpenCode／OpenClawのlatest=beta.16を確認し、2026-10-10 10:07 UTCにDSHのlatest=beta.17昇格と全3公開archiveのSHA-256／integrity一致を確認したと報告。これは本編集者による再取得ではなく、親の検証報告を根拠にする現在の配布案内である。
- 固定SHAのstatusにはDSH latest=beta.16やOC／Clawのbeta-only方針が残る。これらは昇格・方針変更前の履歴として扱い、現在のlatest推奨を妨げる未達gateとはしない。package README／tgzは一切書き換えていない。現行status／How-toの更新、タグ・公開作業は親担当。
- DSH Desktopの導入版は公開beta.17 READMEに従う。古いHow-toに混在するDesktop beta.16は今回の記事へ採用しない。DSHの公開OAuth・基本読み書き・再起動後の認証再利用はbeta.16の本人報告。beta.17の公開Human/Handoff、設定を開かない初回／新規／fork利用は未受入と明記した。
- OC／Clawの公開OAuth・限定更新readback・Human保存回答後のnative再開・refresh／失効／再接続は公開statusにある受入記録で、本編集中の再実行ではない。OpenCode refreshはQA 401 carrier、OpenClaw refreshはQA expiry操作が契機で、自然失効の実測とは書かない。OpenCode phaseSyncの実モデル検査は合成loopback MCPを使い、公開phaseSyncを受入済みとしない。
- OpenCode Ecosystem PR #54271はclosed・未mergeで公式一覧未掲載。v2互換性も未検証。ClawHubは公開page／取得／native導入が確認済みだが、集約scan・標準検索gateは未完了。community package公開をhost公式endorsementとは表現しない。
- Freeの上限2登録Agent、導入／OAuth／Agentリンクと作業権限の分離を保持。共有接続ではallowedAgentIdsから所有者が許可したactingAgentIdを読み取り・preview・書き込みで保持し、共有接続のrelinkによるAgent切替を案内しない。これは固定commitのcanonical Skillに公開済みであり、下記初回記録の「未公開として除外」から更新された部分である。
- 新記事の本文はplain text、コマンドとJSON例は既存code構造を使用。新URLは公式Site／Web App／MCPのみ。既存schemaによるJSON、両言語slug／section ID／related、コードJSON、全sourceのcommit存在とin-memory静的HTML生成を検査する。実ブラウザー・production build・PR／CI・公開確認は親担当で、この記録はそれらのPASSを意味しない。

## 2026-10-05：初回編集の履歴

以下は初回のSHA・API読取り・24ページの編集記録を保持したもの。現在の記事数、root sourceRevision、配布方針、公開済みshared-Agent対応は上記2026-10-10の追記を優先する。

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
- 編集対象の公開先は、今回決定された正式サイト配下の https://guilduo.com/docs/ 。資料収集時点ではHTTP 200でもアプリfallbackで、Docsは未公開だった。2026-10-05に静的Docsの本番配信と実HTTP 404を確認済み。[公開記録](PUBLICATION.md)を参照する。
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
