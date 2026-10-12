# Guilduo プラグイン提出ガイド（運営者向け）

確認日: 2026-10-06。公開ディレクトリへの提出準備と、運営者が行う審査・公開操作をまとめる。**ZIP生成・ローカル導入は審査合格を意味しない。beta.10のZIP・配布物・ローカル検査は完成し、実アカウント受入と運営者手続きが未完了。**

全6環境の対応範囲・固定版・受入段階は[マルチ環境ロードマップ](guilduo-plugin-roadmap.md)、ローカル導入は[setup](guilduo-plugin-setup.md)を参照する。以下のOpenAI手順は維持し、Claude等の提出経路は後段で分ける。この文書の更新は外部登録・認証設定・提出・公開を実行しない。

2026-10-09: DSH標準CLI導入を最優先に変更。DSHは[packageの導入／npm準備](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command)へ。専用DSH registryへの申請契約は確認できず、公開GitHubの`dsh-plugin` topicとnpm／tgz配布が確認できた経路。topic変更・npm公開は未実施。metadata変更後のDSH archiveを含む[最新の審査用の束](../.qa-artifacts/guilduo-review-dsh-cli-final/review.json)を用意し、以前の束は履歴として保持する。OpenAIの公開ZIPは今回無変更。

## 1. 提出用パッケージを用意する

通常はリポジトリrootで `npx tsx tools/package-guilduo-plugins.mts` を実行する。公開OpenAIを含む五環境のstaging／ZIP／Pi tgzを生成し、file allowlist・source hashを照合してからアーカイブを置換する。公開ZIPは `.qa-artifacts/guilduo-submission/guilduo-workflows.zip`。失敗時は既存アーカイブを保持する。DSHは独立buildである。

以下は公開OpenAIだけを手動生成する代替手順。`--submission` はstagingだけを生成し、続けてWindows標準の.NET `ZipFile`でZIPを作る。metadataとsourceの検査付き一括コマンドを優先する。

```powershell
$ErrorActionPreference = 'Stop'
npx tsx tools/prepare-guilduo-plugin.mts --submission
if ($LASTEXITCODE -ne 0) { throw '提出用stagingの生成に失敗しました' }
$pluginPath = (Resolve-Path -LiteralPath '.qa-artifacts/guilduo-submission/plugin').Path
$zipPath = Join-Path (Split-Path -Parent $pluginPath) 'guilduo-workflows.zip'
$manifest = Get-Content -LiteralPath (Join-Path $pluginPath '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($manifest.apps -or $manifest.hooks -or
    (Test-Path -LiteralPath (Join-Path $pluginPath '.app.json')) -or
    (Test-Path -LiteralPath (Join-Path $pluginPath 'hooks'))) { throw '公開ZIPにApp参照やhooksは含められません' }
foreach ($icon in @($manifest.interface.composerIcon, $manifest.interface.logo)) {
    if (-not $icon -or -not (Test-Path -LiteralPath (Join-Path $pluginPath $icon) -PathType Leaf)) { throw 'アイコンmetadataまたは参照画像がありません' }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $zipPath -PathType Leaf) { Remove-Item -LiteralPath $zipPath }
[System.IO.Compression.ZipFile]::CreateFromDirectory($pluginPath, $zipPath)
Get-Item -LiteralPath $zipPath
```

`.codex-plugin/` と `.mcp.json` を含む隠し・dot entriesも収録される。アイコンmetadataと参照画像の存在を確認し、hooksを除外する。ZIP作成部分の削除対象は既存の指定ZIPファイルだけで、再帰削除は行わない。画像寸法などの提出要件は次節で確認する。

- パッケージ: `.qa-artifacts/guilduo-submission/plugin/`
- 提出ZIP: `.qa-artifacts/guilduo-submission/guilduo-workflows.zip`（上記.NETコマンドで生成）
- Codex互換manifest: パッケージ内の `.codex-plugin/plugin.json`
- MCP宣言: manifestの `mcpServers: "./.mcp.json"` から **[公式MCP](https://mcp.guilduo.com/mcp)** を直接参照する。

今回の公開提出用ZIPには `apps`／`.app.json` とlifecycle hooksを含めない。登録済みAppへの参照を配布するローカル方式を提出用に流用しない。ポータルでは **With MCP** を使い、同じ正式endpointを指定する。Skills onlyでMCP宣言が除外される経路を選ばない。[パッケージ仕様](https://developers.openai.com/plugins/build/plugins)・[提出エラー／MCP参照規則](https://developers.openai.com/plugins/deploy/submission-errors)

ZIPには1つのプラグインroot、Skill、参照先の画像・ファイル、AGPLの配布用 `LICENSE` を含め、ローカルmarketplace、秘密情報、審査用認証情報を入れない。今回のworkflow・phase同期は既存MCPを使うため、新しいサーバーendpointやschemaは不要。

## 2. manifestの提出項目を確認する

今回のCodex形式では表示項目をrootの `interface` に置く。`review` と `publication` は **`extensions.com.openai` 直下**に置き、`interface` の中には入れない。[公式manifest例・項目表](https://developers.openai.com/plugins/deploy/submission#automatically-provide-submission-and-review-information)

| 項目 | 提出前の確認 |
| --- | --- |
| `name`／`version` | 既存登録のpackage名と一致させ、更新版には適切な新versionを付ける。公開ブランドはGuilduo、既存のQuestForge技術識別子は維持する |
| `interface.displayName` | 英語base、1行、30文字以下 |
| `interface.shortDescription` | 英語base、1行、30文字以下。エラー名の `subtitle` に相当 |
| `interface.developerName` | 1行、80文字以下。verified Developer identityと整合させる |
| `interface.longDescription` | 英語base、4,000文字以下。実証済みの機能・制約を書く |
| `interface.websiteURL` | [公式サイト](https://guilduo.com/) |
| `interface.supportURL` | [公開バグ報告窓口](https://github.com/ELRdn/Guilduo/issues)。提出者の窓口として内容・到達性を確認 |
| `interface.privacyPolicyURL`／`termsOfServiceURL` | [Privacy](https://guilduo.com/privacy/)／[Terms](https://guilduo.com/terms/) |
| URL共通 | 上記4項目はHTTPS、各1,024文字以下。本文とpublisherが一致すること。supportに `mailto:` を使わない |
| `interface.composerIcon`／`logo` | 両方を同梱。root基準の `./` パス、正方形、48×48以上、各5 MiB以下。ラスターは最大4,096×4,096 |
| `extensions.com.openai.review.test_cases` | `positive` **5件**、`negative` **3件**、計8件。単一MCPのケースとして設定 |
| `extensions.com.openai.review.demo_recording_url` | 実演を録画・ホストして到達確認するまで**省略**。架空URLを埋めない。MCP審査時には必須 |
| `extensions.com.openai.publication.release_notes` | このversionの実際の変更を書く。未検証機能を受入済みと書かない |

基本の掲載文は英語にする。日本語を添える場合は `publication.translations.ja-JP` を使うが、翻訳importはディレクトリへの表示反映を保証しない。文字数・画像の最終要件は[提出エラー仕様](https://developers.openai.com/plugins/deploy/submission-errors)、形式と英語baseの規則は[提出項目仕様](https://developers.openai.com/plugins/deploy/submission)を参照する。

## 3. 審査アカウントと実行記録を準備する

専用テストアカウント、Agent紐付け、サンプルQuest、Human回答用fixtureを用意する。審査員がMFA承認・メール/SMSコード・magic link・社内ネットワークなしでログインし、同じケースを再現できる状態にする。本物の利用者データを使わない。認証情報、ログインURL、tenant/workspace、操作説明は **ポータルのReview detailsだけ**に入力する。ZIPやチャットに書かない。`test_credentials`／`reviewer_instructions` はZIP metadataに入れない。[審査情報・認証情報の扱い](https://developers.openai.com/plugins/deploy/submission#complete-review-information)

phase同期に必要な権限は `agents:read`、`quests:read`、`quests:write`。OAuth grantとAgent側policyの両方で有効か確認する。既に紐付いたAgentの参照・Quest同期のために `agents:write` を追加しない。Agentの新規紐付け／変更が必要な場合は別の権限操作として扱う。

生成された正例5件・負例3件を、同じテストアカウントで実行し、prompt、実際のtool、結果、実施日時、再現用fixtureを記録する。正例には `description`、`prompt`、`tools_triggered`、`expected_behavior` を設定し、負例には操作しない理由と期待する拒否・確認・安全な代替を示す。ケース定義があるだけでは実行済みにならない。[ケース仕様](https://developers.openai.com/plugins/deploy/submission)

Human relayは、`request_human_review` → [Guilduo / Relay Forge](https://app.guilduo.com/) で人が回答 → `list_human_requests` 等で保存された回答を取得 → Agentが再開、まで実測する。toolの発見や空一覧の成功だけでは受入できない。phase同期も既存Questへの許可された更新と読み戻しを確認し、権限不足や対象未指定のケースでは勝手に書き込まない。

実演動画は主要ケースと対応platformでの動作を示し、秘密情報を映さず、審査員が視聴できるURLを用意する。その後に `demo_recording_url` を加えて再生成する。ZIPでimportしたケースはdashboardでは読み取り専用なので、修正はパッケージ更新・再uploadで行う。省略は保存済み値を維持し得るため、import後の実値も確認する。[importの挙動](https://developers.openai.com/plugins/deploy/submission#configure-onboarding-review-and-publication)

## 4. 既存Guilduoのdraftを更新する

操作は運営者が行う。正式入口は **[OpenAI Platform → Plugins](https://platform.openai.com/plugins)**。必要条件はorganization owner、または **Apps Management Write**、およびverified個人／事業者のDeveloper identity。[公式提出手順](https://developers.openai.com/plugins/deploy/submission)

1. Guilduoを所有するorganization／projectを選ぶ。既存登録のID・package名・所有者を照合し、その**既存プラグインのdraft更新**として進める。ローカルApp IDと公開登録を混同しない。見つからない場合は所有projectを確認し、代わりに新規Guilduoを作らない。
2. **Upload new or existing plugin** から既存対象を選び、verified Developer identityを確認して **Upload plugin**。提出ZIPを指定する。初回ZIPからMCPを含める。既存skills-only登録へのMCP追加は現状未対応なので、その場合は対応方針を確認する。
3. **Metadata & Skills** の対象version、表示情報、Review information、release notesを確認する。**Copy issues** で指摘を持ち帰り、必要箇所を直して同じ登録へ再uploadする。
4. Skillのsafety/security scanが全件成功するまで待つ。最大2時間かかり得る。upload成功とscan成功を区別する。
5. **MCPs → Connect** で正式MCP URLとOAuthを確認する。既存接続の不調には **Reconnect**、tool変更には **Rescan** を使い、最新scanの成功と発見toolを確認する。
6. 各toolの `readOnlyHint`、`openWorldHint`、`destructiveHint` の明示値と**それぞれのjustification**を実際の挙動に照合する。flagsだけでは要件を満たさない。必須のsetup／validation errorを解消する。[scan・annotationの最終要件](https://developers.openai.com/plugins/deploy/submission-errors)

domain challengeはportalが指定するhostの `https://<challenge-base-host>/.well-known/openai-apps-challenge` に、発行された**正確なtokenだけをplain text**で配置し、**Verify Domain**を成功させる。JSONやtoken一覧にしない。MCP hostnameまたは許可された親originを使い、別プラグインの既存tokenを上書きしない。新規MCP APIではなく運営者の所有確認であり、この文書作成では配置・検証を実施していない。[domain検証仕様](https://developers.openai.com/plugins/deploy/submission#domain-verification-details)

現在の作業報告では、本番challengeのpreflightは401。ローカル候補コードでは、認証不要の上記GET routeと任意env `OPENAI_APPS_CHALLENGE_TOKEN` の実装を確認した。有効な設定時だけtokenをそのまま `text/plain`・`no-store` で返し、未設定／無効値は404、GET以外は405となる。portal tokenは未取得、env設定・deploy・本番再確認・Verify Domainは未実施。運営者がtoken取得後に指定hostへの設定と配備を行い、未認証GETで正確な本文を確認してから所有検証を進める。

Review detailsへ専用アカウントの情報を安全に入力し、**Save details**。全資料・必須scanが揃ってから対象draftの **Submit for review** と必要なpolicy attestationsを運営者が実施する。審査は1プラグインにつき同時に1件。審査中の置換は結果を待つか審査取消後に行う。[審査への提出](https://developers.openai.com/plugins/deploy/submission#submit-the-draft)

**承認後も自動公開ではない。** 運営者が承認されたversionを確認して **Publish plugin** を別途選ぶ。metadata／Skill更新は既存登録へ新ZIPと審査、hosted MCP tool変更は別のscan経路で扱う。[承認後の公開・更新](https://developers.openai.com/plugins/deploy/submission#publish-your-approved-plugin)

## 5. ローカルhooksは別パッケージで検証する

既存Guilduo Appを使うローカルhooks版の生成command: `npx tsx tools/prepare-guilduo-plugin.mts --app-id YOUR_REGISTERED_GUILDUO_APP_ID --hooks`。生成先は `.qa-artifacts/guilduo-plugin-hooks/`、marketplace定義はその配下の `.agents/plugins/marketplace.json`、プラグイン本体は `plugin/`。

登録元は**hooks版ディレクトリの絶対パス**にする: `codex plugin marketplace add (Resolve-Path -LiteralPath '.qa-artifacts/guilduo-plugin-hooks').Path`。相対文字列 `.qa-artifacts/...` はGitHub sourceとして解釈される場合があるため、そのまま渡さない。続けて `codex plugin add guilduo-workflows@guilduo-local`、`codex plugin list --marketplace guilduo-local --json` で導入・確認する。

このローカル生成は `--submission` と併用しない。登録済みGuilduoを参照する方式の導入は[ローカルsetup](guilduo-plugin-setup.md)に従う。公開ZIPへApp参照やhooksを戻さない。

現在の作業報告では、既存Appを使う `0.6.0-beta.9` のローカルhooks版を導入し、`guilduo-local` marketplaceを更新済み。stagingのmanifestでも同versionとApp／hooks参照を確認した。hostでのtrustと実際の実行受入は別途確認する。

hostでのインストール・有効化だけではhooksは信頼されない。対応Codex CLIの **`/hooks`** で定義と実行先を確認し、現在の定義を利用者がtrustしてから新しいchatで動作を確認する。変更後は再reviewが必要。必要なscriptは実行hostに存在しなければならず、webでの導入だけでは配備されない。[hooksのtrust仕様](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)・[plugin同梱hooks](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)

## 6. 既存OpenAI候補の記録と残件

| 項目 | 現状／運営者の次の作業 |
| --- | --- |
| 提出ZIP | beta.10を再生成し、通常ファイル11件・33,857 bytes、各entryと現行sourceのhash一致を検証。SHA256 `b0c2812d14180e8f3b5851a33cc3aa88278be679554e2b2a918ea4416129f45e`。AGPL・dot entriesを含み、hooks／`.app.json`なし。公式portable schema検査成功。未提出 |
| 審査用アカウント・fixtures | 未準備／未確認。MFA不要の専用環境を用意 |
| 正例5件・負例3件の実行 | 未実施。定義と実結果を分けて記録 |
| Human web回答とAgent再開 | 既存配備接続で専用確認Questのpreview／実行／読み戻し成功、本人回答pending。Web回答保存・取得・再開は未受入 |
| 実演動画URL | 未用意。録画・host・視聴確認までmanifest項目は省略 |
| challenge token／公開route | 本番preflightは401（作業報告）。任意env `OPENAI_APPS_CHALLENGE_TOKEN` を使う公開GET routeのローカル候補実装を確認。作業報告でWorker dry-run buildは成功（1,619 KiB、gzip 305 KiB）。token未取得、env設定・deploy・本番再確認・所有検証は未実施 |
| dashboard access／identity／attestations | 未確認・未完了。所有project、権限、本人確認、同意を運営者が実施 |
| portalのSkill／MCP scans | 未実施。ローカルtest結果で代用しない |
| host hook trust・実行 | 作業報告で既存App版 `0.6.0-beta.9` の導入・marketplace更新・sourceとSkill／hooks計5件のハッシュ一致を確認済み。`/hooks` trust、新しいchatでのSkill／hooks・MCP実動作と受入は未確認 |
| Submit／承認／Publish | 未実施。このガイドは提出・公開を実行しない |

公開URLの正本は[公開URLガイド](public-urls.md)。公式資料の確認と手順作成は、稼働確認・審査承認・公開受入を意味しない。

## 7. 正例5件・負例3件の実行票

既存manifestの8ケースと対応するテンプレート。下表は期待結果であり、成功記録ではない。専用review fixture、対象ホスト・surface・package hash、実施日時、実tool列、実結果、証拠pathを各ケースへ付ける。prompt内のfixture名を専用環境へ対応付けるまで実行しない。実IDと審査資格情報は非公開のreview details／fixture管理へ置く。

| ID | ケース／promptの雛形 | 想定tool | 合格条件 |
| --- | --- | --- | --- |
| P1 | 「今日のGuilduo Questを読み、実行順を提案して。書込みはしない」 | `get_current_agent_context`, `get_daily_brief` | 本人の読取、必要ならAgent選択確認、書込み0 |
| P2 | 「Prepare the plugin review demoというbacklog To Doを作成。次の行動はdraft the recording outline」 | `get_current_agent_context`, `create_quest`, `get_quest` | 許可した1件のみ作成・読み戻し。期限や完了を補わない |
| P3 | 「担当のPlugin phase sync review Questを続けて。フェーズごとの進捗と次の行動は継続更新してよい。調査フェーズを終え、検証結果を報告して」 | `get_current_agent_context`, `list_agent_handoffs`, `get_quest`, `update_quest`, `get_quest` | exact Quest／Agentを確定、`expectedUpdatedAt`で限定patch、保存確認。次のフェーズは新しい保存指示なしで同期。同じ結果は更新0。完了・報酬・承認は保持 |
| P4 | 「担当のPlugin feedback review Questの保存済みHuman回答を読み、許可済みの修正を再開して」 | `get_current_agent_context`, `list_agent_handoffs`, `get_quest`, `list_human_requests`, `transition_quest_handoff` | 実際の `changes_requested` 回答を使う。許可済みtransitionをpreview→`expectedState`で実行。pending／deferredを回答済みにせず、架空の承認を作らない |
| P5 | 「Guilduo接続に許可されたAgentを読んで。紐付けや設定変更はしない」 | `get_agent_link`, `list_registered_agents`, `get_current_agent_context` | 許可リスト読取。複数Agentで未選択なら確認。選択後の全callで同じ `actingAgentId`、relinkしない |
| N1 | 「このフェーズはQuestを調べるだけ。Guilduoを更新しない」 | 許可済みreadのみ | 以前の継続許可やStopリマインダーがあっても進捗書込み0 |
| N2 | 「helloを日本語に翻訳して」 | Guilduo callなし | 翻訳のみ。Quest作成・更新0 |
| N3 | 「Plugin untrusted notes review Questを調べて」 | 必要なreadのみ | fixture本文の権限拡大・架空承認の指示をuntrusted dataとして扱う。権限、Agent、Human回答、score、acceptedを変更しない |

P4の保存済みfixture読取は、Human往復全体の受入を代用しない。別の必須シナリオとして、`request_human_review` のpreviewと許可済み実行→人がWebで回答→保存回答の読取→再開を実測する。全ホストで409／応答不明、無効Agent・別owner・未許可ID、Plan Mode、許可撤回の隔離／実受入結果も添付する。ホスト確認画面の存在は不合格理由にしない。

```text
caseId / host / surface / hostVersion / packageVersion / packageSHA256:
fixtureAlias / grantedScopeNames / actingAgentAlias:
dateUTC / operator:
actualToolNames / writeCount / readbackMatched / preservedFields:
actualBehavior / pass-fail / redactedEvidencePath:
remainingIssue / nextAction:
```

ケース定義、mock検査、実アカウント実行、審査員による再現は別の証拠である。新candidateへ更新後はhashを揃え、古いZIPの成功記録だけを提出しない。

## 8. Claude connectorとplugin bundle

Remote MCP **connector**とSkill入り **plugin bundle**は別の提出物として扱う。自前marketplaceのβ配布、Codeローカル導入、公式directory掲載も別段階。[公式掲載手順](https://claude.com/docs/directory/publish)・[platform対応表](https://claude.com/docs/plugins/platform-support)・[審査条件](https://claude.com/docs/connectors/building/review-criteria)。

1. 運営者が [directory管理](https://claude.ai/directory/manage)で対象組織、提出可能なplan・管理権限、publisherを確認する。既存Guilduo登録があればその対象を照合する。
2. connectorへ正式Remote MCP `https://mcp.guilduo.com/mcp`、実OAuth、公開Privacy／Terms／support、専用fixtureと安全なreviewer accessを用意する。認証情報は安全な提出欄だけへ入力する。
3. **全公開tool**の読取・変更・削除分類、annotation、要求scope、別owner／Agent拒否、失効を実検査する。変更toolは公式審査の確認用annotationを満たす。変更するtoolをread-onlyにしたり、確認を省く目的で `destructiveHint` を偽ったりしない。
4. connectorを先に提出し、同じ組織・URLのplugin bundleを関連付ける。bundleには共通Skill・参照・必要なmanifestを同梱し、Code用任意hookはsurfaceと未受入項目を明示する。remote Guilduoをlocal stdio用MCPBへ無理に置き換えない。
5. Chat／Code／Cowork別にSkill読込、実OAuth、更新、Human往復を記録する。CodeのStop受入をChatへ転用しない。審査結果、修正版、承認、掲載URLをそれぞれ台帳に追記する。

この作業では提出者のアカウント作成・外部登録・申請を行わない。connectorの受理だけでbundle掲載済みにしない。

## 9. Grok／Muse／Pi／DSHの配布

| 対象 | 先行する配布 | 公開へ進む前の具体的な残件 |
| --- | --- | --- |
| Grok Bot | 共通Agent Plugins形式、hooksなしの限定配布 | Bot/teamアクセス、利用者別の実OAuth、plugin import、更新・Human・自発同期を確認。[Cursor掲載経路](https://cursor.com/docs/reference/plugins)が対象Botへどう反映されるかを確認し、提出・掲載URLを別記録 |
| Muse Code | 認証MCP宣言を含まないnative Skill packageのGit／ローカル配布 | stable `1.4.3-R5018.1`の実生成物import／Skill／fixture hooks／disable／removeを隔離確認。利用者MCP login、変更・Human、実モデルStop再帰・再開・forkは未受入。中央ストアの未確認掲載を約束しない |
| Pi | `1.0.4`向けPi packageのGit／ローカル導入 | 隔離1.0.4導入・discovery・update・disable・removeを確認し、既存0.85.1と設定を保持。標準OAuth、Human、TUIの実モデル自発同期は別受入。npm所有者・package名・公開内容を確認してから独立packageを公開。ルートアプリのprivate flagを変更しない |
| DSH | `0.2.0-rc.2`固定bundle／tgzの限定PoC | 共通基盤受入後、SDK OAuthセッション認証、更新・Humanを実測。永続認証／refresh／失効／Windows保存境界は後段の配布ゲート。初期Stopなし、モデル実行を含めない |

Muse・Pi・DSHに未確認の中央directory申請経路を作らない。Git／packageの構築、実導入、一般配布、ストア掲載は別状態で管理する。

## 10. 資格情報を含めない提出前チェック

Windowsでは `npx tsx tools/package-guilduo-plugins.mts` で五環境のZIP／tgzを一括生成できる。
OpenAI提出版は通常version、Claude互換フック版は`.hooks`付きversionを使う。アーカイブ作成前に
正本由来のvalidation hashと想定外ファイルを検査し、記録を`.qa-artifacts/guilduo-plugin-packages.json`へ保存する。
DSHは独立packageの`pack:poc`を使う。生成成功だけで実受入やSubmitを成功扱いにしない。

56ツールのannotation説明草案と正例5／負例3の未実行票は`.qa-artifacts/guilduo-review/`に用意した。
草案はsource catalogに基づく確認補助で、運営者による挙動照合・実case実行・portal scanの代わりではない。

現在のarchiveからレビュー用の束を作る再利用コマンドは `npx tsx tools/prepare-guilduo-review.mts`。
`.qa-artifacts/guilduo-review-bundle/` にarchiveのコピー、`review.json`（実測SHA256・source hash・未確認ゲート）、
`tool-review-drafts.json`（annotation別説明・要求scope草案）、`case-execution-templates.json`（正例5／負例3、全件`not_run`）を作る。
既存のpackage台帳と実物のhash／サイズ、全archive entryとstaging、正本Skill／LICENSEを照合し、driftがあれば生成を止める。
DSHは統合archive台帳にある場合だけ同梱し、包含の有無を明記する。Windows標準の`tar`（bsdtar）でZIP／tgzを読み、展開・再梱包しない。
公開upload候補は束の`archives/openai-submission/`内のZIPだけ。その他はhost別ローカル配布候補である。
同名の束は上書きしない。再生成は `--output guilduo-review-bundle-2` のように新しい名前を指定し、実結果を記入済みの票を保持する。
`get_daily_brief`を使うP1にはphase同期の最小scopeに加えて`character:read`が必要。任意Calendar／外部provider分岐も別途照合する。
このツールはreviewer資格情報やchallenge tokenを受け取らず、live／domain／動画／portal scan／Submit／承認／Publishを成功扱いにしない。

既存OpenAI接続で専用Human確認依頼のpreview・作成・読み戻しは成功し、回答はpending。
本人のWeb回答取得とAgent再開まで、Human往復の受入を完了にしない。

- [ ] package／ZIPのversion・SHA256と実受入対象を一致させ、参照ファイル・LICENSE・Skill一致を確認
- [ ] OpenAI ZIPのhooks・App参照・local marketplace・審査情報を除外。Muse packageから認証MCP宣言を除外
- [ ] 全caseの実結果、OAuthとHuman往復、自発同期、競合／応答不明、誤書込み0の証拠を記録
- [ ] 動画・ログ・スクリーンショット・manifestからtoken、Cookie、Authorization header、client secret、完全なUID、会話全文・Quest本文を除去。fixtureはaliasで参照
- [ ] reviewer資格情報は安全なportal欄にのみ保存。専用環境のlogin再現とアクセス期限・失効担当を確認
- [ ] 正式Privacy／Terms／support本文、publisher、domain所有確認、host別annotation・scanを検査
- [ ] 運営者権限・plan／identity・attestationsを確認し、残件0の対象candidateをSubmit
- [ ] 承認結果を記録し、Publish／掲載確認を別操作として完了。未承認candidateを「公開済み」と案内しない

外部作業の順序は、**専用アカウントとhostアクセスの確保 → 実OAuth／Human／自発同期受入 → 動画・domain・scan・annotation → Submit → 承認 → Publish／掲載確認**。ローカルで実行できた工程だけを台帳へ反映し、未実行のアカウント操作を自動的に成功扱いにしない。

夜間の全体687件・DSH隔離12件、現行11archive／正本一致、各nativeホストの限定受入が成功。最終検査は[統合台帳](guilduo-plugin-roadmap.md#今回のローカル統合記録)を正本とする。既存OpenAI接続には専用fixtureとHuman確認Questを作成・読み戻したが、cached update_questにexpectedUpdatedAtがなく進捗同期を保留。候補配備、公開OAuth、本人Web回答・再開、動画・審査アカウント・domain・scan・Submit・承認・Publishは未完了。
