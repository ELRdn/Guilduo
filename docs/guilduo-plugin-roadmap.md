# Guilduo マルチ環境プラグイン・ロードマップ

2026-10-10 14:48 JST：DSHのGitHub公開導線を[PR #54](https://github.com/ELRdn/Guilduo/pull/54)で解消。mainのsource／README／英日How-to／statusとroot READMEがHTTP 200、CI全項目成功。npm README差し替えは別版公開が必要だが、今回latest=beta.16は保持。[公開票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/github-publication.json)。以下のGitHub未反映・別工程という記録はこの公開前の状態。

2026-10-10 本人追確認：**DSH beta.16はβ実装・npm配布を一区切りとして追加開発停止**。公開OAuth・MCP読み書き・Desktop保存認証再利用は本人確認済み。再起動約1〜2分後に設定を開いて接続済みだったという観察を、設定前の復元や設定なし新規／fork初回入力の証明にはしない。Registry Agent未紐付け、Human回答→再開は未確認。残件は公開ガイド反映と実受入であり、Stop hookや新機能は完了条件に含めない。[現行台帳](guilduo-dsh-status.md)／[How-to](guilduo-dsh-howto.jp.md)。以下の旧版記録は履歴。

2026-10-10 14:15 JST 現在：DSH **beta.16をlatestへ昇格**。beta／latestの両タグと公開tgzの凍結byte一致を確認。[昇格票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/latest-promotion.json)。本人報告で公開OAuth・MCP発見・context読取を受入。保存後の再起動復元・設定なし新規／fork・別Desktop・Quest／Human往復は継続ゲート。[受入範囲](guilduo-dsh-acceptance.md#2026-10-10-1409-jst-user-reported-public-oauth-acceptance)。以下のbeta.14等のタグと未受入表記は当時の履歴。OpenCode／OpenClaw beta.15は未公開。

2026-10-10追記: DSH beta.16をnpm公開・公開tgz照合済み（09:45 JST）。beta=beta.16、latest=beta.10を維持。[公開確認票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/publication.json)。認証消失の再現経路と認証保存途中の接続済み誤判定を修正し、Skill改名を同梱する。OpenCode／OpenClawはbeta.15を維持。beta.14／beta.15固定archiveを保持し、実際の消失原因・実OAuth・公開は別判定。[現行受入](guilduo-dsh-acceptance.md#2026-10-10-beta16-grant-lifetime-fix)

2026-10-10: Skill名の改名を明示承認。現行正本は `skills/guilduo-workflows/`、基盤manifest候補はbeta.11、次のDSH／OpenCode／OpenClaw beta.15は未公開。新Skill名のみ配布する。以下の旧配布物・旧installed name・beta.14等のnative票は当時の旧Skill名の履歴で、新名の受入証拠へ読み替えない。beta.14のpending受入を保持する。新版plugin更新→再起動、旧standaloneの本人による削除／置換、実設定自動変更なし、OAuth／MCP／package／plugin／storage ID維持は[最小移行契約](guilduo-workflows-migration.md)に従う。

2026-10-09 **DSH beta.14共有認証は実装済み・合成認証ローカル検証通過**。[最終ローカル票](../.qa-artifacts/guilduo-dsh-shared-beta14/validation.json)はPASS_LOCAL_RELEASE、75/75 package tests・2/2 root package tests・型／build／design成功、scoped review残存P1/P2なし。[最終native票](../.qa-artifacts/guilduo-dsh-shared-beta14/native-DhY3W3/evidence.json)は7/7 PASS、現行compiled hash一致。[最終UI集約票](../.qa-artifacts/guilduo-dsh-shared-beta14/native-final-records-20261009-230829-212.json)はbrowser／carrier・Settings6並列PASS、現行hash一致。README永久凍結後の再pack・[隔離CLI beta.13→beta.14 upgrade等18検査](../.qa-artifacts/guilduo-dsh-host/install-8gGvdY/evidence.json)はPASS、32ファイル全byte一致（tgz SHA-256 `43585b8d33ea5d2e4da8cde599d5302b60130834e9795f0f5f6eb1fe97b255ed`）。2026-10-10 08:22 JSTにbeta.14をnpm公開・公開配布物を照合済み。beta tagはbeta.14、latestはbeta.10を維持し、公開tgzの全byte／SHA-256／registry integrityが検証済みarchiveと一致。[公開確認票](../.qa-artifacts/guilduo-dsh-shared-beta14/publication.json)。Windows・同じWindows user／`DSH_HOME`のWeb／Desktopで、新規初回認証を通常会話・新規通常会話・root forkへ共有する。subagent・runtime child・独立seededは拒否。旧exact-session grantは元会話のSettings「全会話で使う」を1回明示実行し、認証済みshare RPCで元grantを参照するdescriptorへ移行する。token複製・暗黙移行はしない。[受入表](guilduo-dsh-acceptance.md#2026-10-09-beta14-shared-plan-candidate)

共有切断は同じhome全体へtombstoneを残し、旧grant fallbackを禁止する。共有元会話の削除は共有を保持。`agent/created`を初回モデル組立前にawaitし、選択時statusも自動取得する。復元の通信は15秒上限で、暗黙OAuth・推論を起動しない。catalogはplugin寿命中1つ、Agent scope／Free登録2Agentは不変。DPAPIは同じWindows userの保存保護であり、モデル・同一user／process内の信頼境界ではない。native Credentialsのプロセス間検証はDSH会話／履歴writerの同時実行安全性を証明しない。更新は旧Web／Desktop profileを先に停止し、各profileを更新して再起動する。元会話での旧grant移行と[導入手順](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command)を確認する。2026-10-10 08:22 JSTにbeta.14をnpm公開・公開配布物を照合済み。beta tagはbeta.14、latestはbeta.10を維持し、公開tgzの全byte／SHA-256／registry integrityが検証済みarchiveと一致。[公開確認票](../.qa-artifacts/guilduo-dsh-shared-beta14/publication.json)。実Web／Desktop公開OAuth・Quest／Human往復は未受入、以下beta.13以前の記録・導入コマンドは当時の履歴。

beta.13公開履歴（2026-10-09 19:31 JST）：**修正版beta.13をnpm公開・公開配布物を検証済み**。[公開確認票](../.qa-artifacts/guilduo-dsh-settings-beta13/publication.json)。この版の実Desktop OAuthは本人受入待ち。旧tagの記録はbeta.14の導入／公開確認に流用しない。

DSH **beta.13修正履歴**：実DesktopでOAuth前に止まる依存注入不足を再現し、親pluginの宣言と両bundleを修正した。兄弟サービスを使う回帰・native Settings／Chrome合成OAuthを追加確認。実Desktop公開OAuth・Quest／Human往復は継続ゲート。[修正版の記録](guilduo-dsh-acceptance.md#2026-10-09-beta13-real-host-injection-fix)。以下beta.12等の検査票もその版の履歴。

更新日: 2026-10-09。共通MCP＋共通Skillを土台に、環境別の配布物と任意の終了時補助を追加する。まず複数環境で使えるβを受け入れ、公式掲載準備を並行する。**生成・ローカル検査、実アカウント受入、提出、承認、公開は別工程**である。

前版DSH候補は**beta.12**。Windows DPAPI＋native Credentialsで成功済み認証を保護し、同じ通常会話の設定画面を再度開くと復元する。43テスト・型／build・実DPAPI／native合成保存ファイルの再起動・SDK refresh・明示切断削除を確認。会話ID／createdAt／native objectで照合し、fork等へ認証を渡さない。通常unloadは保存grantを保持し、明示切断・確認済み削除は消す。非Windowsはlogin開始前に拒否する。[新候補票](../.qa-artifacts/guilduo-dsh-settings-beta12/validation.json)・[受入](guilduo-dsh-acceptance.md#2026-10-09-beta12-protected-authentication)。npm公開と実アカウント受入はこの票で別管理する。下記beta.11のメモリ認証制限は履歴。

2026-10-09 08:27 JST：**beta.12のnpm公開を確認**。本人認証とregistry反映後、公開version／beta tag／tgzを照合し、検証済みarchiveとの全byte一致・integrity一致が成功。[公開確認票](../.qa-artifacts/guilduo-dsh-settings-beta12/publication.json)。`latest`はbeta.10を維持するため、新版は`@0.6.0-beta.12`または`@beta`で導入する。実Web／Desktop OAuth・Human往復は引き続き別ゲート。

2026-10-09 設定UI追加：**DSHだけbeta.11候補**へ更新。「設定 → Guilduo」の接続・状態・切断を標準Settings slot／Connection／Typert Gatewayへ実装し、本人操作から会話の実Agentをresolveする。loopback callback、タイムアウト、取消・dispose・fork／再接続の境界を隔離検証する。他環境はbeta.10を維持。[新候補の受入](guilduo-dsh-acceptance.md)・[利用手順](../plugins/guilduo-dsh/README.md#connect-from-settings-web-and-desktop)。公開済みbeta.10と新候補は別物で、beta.11公開・実Web／Desktop公開OAuth・Human往復は未完了。以下のlogin UI未実装という記録はbeta.10時点の履歴。

2026-10-09 07:14 JST：本人がnpm公開を実行し、処理中の一時404の後、公開registryのpackage／version／tarballすべて200を確認した。`@guilduo/dsh-oauth-poc@0.6.0-beta.10`の`beta`と`latest` tagが存在し、配布tgzは手元候補とbyte単位で一致。[公開確認票](../.qa-artifacts/guilduo-dsh-publish-ready/publication.json)。導入は`dsh plugin --profile web add @guilduo/dsh-oauth-poc@beta --ignore-scripts`。実験用PoCのnpm公開のみ完了し、本人login／callbackと公開OAuth／更新／Human往復は未受入。以下の「公開未実施」記録はこの公開前の履歴。

2026-10-09 優先順位変更：ひろなおの指示で、**DSHの標準CLI導入とnpm配布準備を最優先**にする。既存PoCを再利用し、`dsh plugin --profile <name> add <tgz>` → bundle／Skill発見 → 再導入 → 削除を先に検査する。npm公開と、本人login／callback・実OAuth・Human往復は後続の別ゲート。詳しいコマンドは[DSH README](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command)。他環境の既存成果物は保持する。

同日追加：本人のnpm公開操作は`EPRIVATE`で停止した。実験用PoCの`beta`公開候補としてpackageの`private` fieldを削除し、READMEへ未完成のlogin／callbackと実受入の制限を明記して再packした。[公開準備の最新検査票](../.qa-artifacts/guilduo-dsh-publish-ready/validation.json)と旧private archiveを保持。公開dry-runは成功したが、npm公開自体は未実施。下記CLI検査票と審査用の束はprivate削除前の履歴であり、新しいtgzのhashとして流用しない。

[DSH今回の検査票](../.qa-artifacts/guilduo-dsh-cli/validation.json)：実CLI 16検査、関連10テスト、19梱包ファイルの正本／インストール内容照合が成功。add→同じtgzの再add→list→removeで無関係bundle／依存／設定を保持し、再add後のbundle重複なし。npm向けmetadataを追加したが`private: true`を保持し、公開endpointは404。npm版CLIの`desktop`管理は禁止のためWeb profileを案内する。SDK/runtimeは無変更。別versionへのupgradeと公開OAuthは未受入。[新しい審査用の束](../.qa-artifacts/guilduo-review-dsh-cli-final/review.json)も11archiveを再照合する。旧束と旧DSH archive／検査票は履歴として保持。

[導入手順](guilduo-plugin-setup.md)・[運営者向け提出手順](guilduo-plugin-submission.md)・[全体ロードマップ](../ROADMAP.md)。公開URLは[公開URLガイド](public-urls.md)、APIと認証の仕様は[PROJECT_SPEC.md](../PROJECT_SPEC.md)を正本とする。

夜間候補の再検査と、本人／運営者が必要な残件は[受入引継ぎ](guilduo-plugin-acceptance-handoff.md)にまとめる。

2026-10-08追加：既存11archiveを検査して審査用の束を作る`prepare-guilduo-review.mts`と、資格情報を保存せず専用fixtureの読取・限定更新・読み戻しを行う`verify-guilduo-live.mts`を実装。[審査用の束](../.qa-artifacts/guilduo-review-bundle/review.json)は全外部ゲート未確認、[接続再確認](../.qa-artifacts/guilduo-oct8-connected-receipt.json)は進捗書込み0／Human pending。DSHの不足する本人login／callback契約は[固定版の検査記録](guilduo-dsh-acceptance.md)へ分離した。配備guardはdirty treeを拒否し、実配備・公開OAuth・Submitは進めていない。

[2026-10-08の検査票](../.qa-artifacts/guilduo-oct8-validation.json)：全体 **697/697**、失敗／skip／TODO 0、全体型検査成功（279 source files）。追加範囲10テストでは実SDK→現行Workerの11条件、審査用の束のhash／正本／公開endpoint／上書き拒否を確認。以前のbuild／nativeホスト受入の実行日を更新せず保持する。

## 共通構成と対応範囲

### OpenCode／OpenClaw追加と優先順位

2026-10-09の追加指示で順序を **DSH → OpenCode／OpenClaw → Grok／ChatGPT／Claude** とする。既存のMuse／Pi成果物は保持する。独立package `@guilduo/opencode-plugin@0.6.0-beta.14`と`@guilduo/openclaw-plugin@0.6.0-beta.14`を実装・検証した。どちらも標準OAuth Remote MCPと共通Skillを使い、新API・独自認証bridge・ルート依存は追加しない。新規packageのnpm公開は未実施。

OpenCodeの基本導入は追加モデル実行なし。任意`phaseSync`は継続更新を許可済みのexact session／canonical cwd／Quest／actingAgentIdを指定し、元入力につき最大1回だけ確認を送る。直接更新は行わず、Plan／read-only／fork／error／compaction／撤回を抑止する。追加確認と停止コマンドのモデル料金を導入手順に明記する。11件のhookテスト・型／build、2件の正本／manifest検査、14梱包ファイル一致に加え、実1.18.32／1.18.35で導入・更新・削除、合成OAuth・保存・refreshを確認。専用prefixを使い、MCP別名・ユーザーコマンド・他プラグインを保持する。[導入](../plugins/guilduo-opencode/README.md)・[native記録](guilduo-opencode-native-evidence.md)。beta.11以下の記録は履歴。

OpenClawは2026.9.9に固定し、標準Settings MCP／Accountsの認証導線を利用する。manifestだけでは保存MCP設定は作られないため、標準CLIと設定保持の補助手順を提供する。7件のpackage検査、16梱包ファイル一致、実導入・更新・削除、合成OAuth callback／PKCE／SQLite保存／refresh・rotationとnative Accounts projectionを確認。[導入](../plugins/guilduo-openclaw/README.md)・[native記録](guilduo-openclaw-native-evidence.md)。実ブラウザー／複数人channel・公開OAuth／Human往復は未受入。両配布物の[最終照合](../.qa-artifacts/guilduo-extensions-beta14/validation.json)は別に記録する。

- 正式MCPは `https://mcp.guilduo.com/mcp`。既存ツールを共用し、新しい進捗更新APIは追加しない。`/mcp-next`への全面切替を前提にしない。
- Workflow Skillの正本は `skills/guilduo-workflows/`。`references/tools.md` と `references/phase-sync.md` を含め、生成物へコピーする。OpenAI固有の終了補助説明は [references/local-hooks.md](../skills/guilduo-workflows/references/local-hooks.md) に分離し、共通同期手順へ混ぜない。
- 既存OpenAI生成コマンド・登録・互換識別子を維持する。公開名はGuilduo、新規packageはGuilduo Workflows。QuestForgeのMCP ID・既存path等は互換性のため保持する。
- 配布物はAGPL-3.0-only。ルートアプリの公開設定・依存・lockfileを巻き込まない。秘密情報・OAuth token・会話履歴・審査アカウント情報を同梱しない。
- Freeの上限は登録Agent 2人。対応ホストごとにAgentを増やす設計にせず、既存共有接続の許可リストと呼び出しごとの `actingAgentId` を使う。

| 環境 | 最小配布物・接続 | 終了時補助 | β配布と掲載 |
| --- | --- | --- | --- |
| OpenAI | 共通Skill＋OAuth Remote MCP。既存登録Appを参照するローカル版は別出力 | Codex／Workの任意 `SessionStart`／`Stop`。通常Chatでの実行は前提にしない | 公開ZIPはMCP＋Skill。現行審査ではhooks・App参照を除外 |
| Claude | `.claude-plugin/plugin.json`、共通Skill、`.mcp.json` | Codeで `SessionStart`／`Stop` を適応。通常ChatはSkillによる判断 | 自前marketplaceでβ配布。connectorとplugin bundleを別提出し関連付ける |
| xAI Grok Bot | Agent Plugins形式の `plugin.json`／`mcp.json`、共通Skill、OAuth MCP | 初期βはSkillのみ。Bot固有の実行契約は未確認 | 限定配布・実受入を先行。Cursor側の掲載経路とBotへの反映を確認 |
| Meta Muse Code | native `.muse-plugin/plugin.json`と共通Skill。OAuth MCPは利用者設定 | stable版のnative argvで共通SessionStart／Stopを呼ぶ任意版 | 認証付きMCP宣言を同梱しない。Git／ローカル配布を先行 |
| Pi | Pi packageのSkill＋標準MCP／OAuthを利用者設定 | 任意Extensionの `agent_before_settle` で有限リマインダー | Git／ローカルpackageでβ配布。実受入後にnpm配布 |
| DeepSeek Harness（DSH） | beta.16公開済み、guilduo-workflows＋OAuth MCP＋Windows共有認証 | 終了hookなし。auto restoreは暗黙OAuth／推論を起動しない | 80 package＋2 root、最終native／browser／CLI合成PASS。本人の公開OAuth・MCP読み書き・Desktop保存認証再利用成功。設定なし新規／fork・Agent Handoff・Human往復は残件 |

Grok BotはGrokのモデルAPIとは別の製品、MuseはMeta Muse Code CLIを指す。Claude Chat／Code／Cowork、OpenAI Chat／Codex／Workは同一欄の中でも別の実行環境として受入記録を残す。

## 固定版と資料の限界

| 環境 | 調査・対象版 | 今回のローカルCLI確認 | 更新時に再確認する契約 |
| --- | --- | --- | --- |
| OpenAI | 公開／通常版 `0.6.0-beta.10`。実利用中beta.9は保持 | Codex `0.159.2`の隔離導入・更新・無効化・削除 | portable manifestとCodex互換overlay、hooks trust、公開ZIP制約 |
| Claude | 実受入surface別に固定・記録 | Claude Code `2.1.286`の隔離native lifecycle 59検査 | plugin manifest、OAuth、Stop再帰flag、Chat／Code／Cowork対応差 |
| Grok Bot | 公開調査基準 `0.66.0`（2026-10-02） | ローカルには未導入／利用不可 | Agent Pluginsの取り込み、クラウドOAuth、掲載経路 |
| Muse Code | stable `1.4.3-R5018.1`。公開changelogは `1.4.2`、`/next/` docsはPreview | 正式Windows binaryをSHA256検証して隔離導入。実native形式へ修正 | native manifest／argv、利用者MCP login、Stop、plugin storage環境変数 |
| Pi | `@earendil-works/pi-coding-agent` `1.0.4`、Node ≥22.19、Git `7c10bd4337495ee613f2224843ecdf349b80d1df` | 隔離1.0.4を使用。既存 `0.85.1`／設定／shim保持 | 標準MCP／OAuth、package discovery、`agent_before_settle`／input／session treeイベント |
| DSH | 固定SHAの公開コード、CLI／Desktop `0.2.0-rc.2`、package beta.16 | npm beta／latest=beta.16、32公開ファイル一致。80 package＋2 root・最終native／browser／CLI PASS。本人の公開OAuth・MCP読み書き・Desktop保存認証再利用報告あり | 設定なし初回／新規／fork、Agent Handoff・Human往復は別受入。共有契約・15秒上限・catalog／scope不変 |
| OpenCode | Plugin SDK `1.18.32`、実ホスト `1.18.32`／`1.18.35` | beta.14 tgz導入／更新／削除、Skill・設定保持、合成OAuth／再起動／refresh | Plugin hooks、MCP別名、コマンド所有、SDK session metadata、任意finite continuation |
| OpenClaw | 固定実ホスト `2026.9.9` | beta.14導入／更新／削除、合成OAuth／保存／refresh・rotation、Accounts projection | pluginApi／manifest、native MCP OAuth、Accountsのname／URL一致、設定保持 |

このCLI確認では公開OAuth・モデル呼び出しを行っていない。Piは隔離1.0.4で検査し、既存CLI・設定を上書きしていない。Museは正式stable binaryの隔離導入まで進んだが、Grok Botのteamアクセスは未確保。native導入・合成イベント・公開OAuth・実モデル継続を混同しない。

MuseのPreview仕様ではplugin内HTTP MCPにOAuth／Authorizationヘッダーがないため、認証MCP宣言を同梱しない。stable実検査ではClaude互換の単一文字列skillsとWindowsのquoted `node -e`が機能しなかった。共通Skillをnative manifestに宣言し、イベント別argv wrapperへ限定修正した。利用者設定のOAuthとplugin importを混同しない。[実検査](guilduo-muse-stable-evidence.md)

Pi 1.0.4はMCP／OAuthに標準対応するため独自bridgeは不要。低レベル `agent_end` は継続途中にも発火し得るため、終了補助には最終継続境界 `agent_before_settle` を使う。

DSH初期PoCの履歴：調査版は標準transportへOAuth providerを渡しておらず、セッション内メモリ認証の固定版アダプターとtgzを構築した。beta.11でSettings／callback、beta.12でWindows永続保存、beta.13で依存注入を更新し、beta.14の共有認証は実装・合成認証によるローカル検証を通過した。各版のhash・公開・検査票はその版だけの履歴として保持する。Codex互換hookの `stop_hook_active` は常にfalseで、そのまま移植しない。終了hook・追加モデル実行は含めず、実OAuth／Human往復は未受入。

## 対応状況台帳

段階を飛ばして「対応済み」にしない。各セルは証拠のある範囲だけ更新する。`未受入` は失敗と同義ではなく、対応ホスト・対象版で未測定を意味する。

| 環境 | 調査 | 配布物構築・ローカル検査 | 実OAuth・発見・読取 | 更新・Human往復 | 自発的同期・終了補助 | 配布・掲載 |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | 調査済み | beta.10生成・公式共通schema通過。Codex 0.159.2の隔離install／更新／disable／remove成功 | 既存配備接続で56ツールとcontext読取成功。単独codexでfixture作成・割当・読み戻し成功 | guarded進捗同期は未受入。実Human確認Questをpreview／実行／読み戻し、回答pending | scoped binding／新chat／実更新は未受入 | 実利用beta.9保持。新候補は隔離導入確認、未提出・未公開 |
| Claude | 調査済み、Code CLI 2.1.286 | beta.10／beta.10.hooksのnative 59検査通過。実cache更新・設定保持を確認 | 公開OAuthは未受入 | 未受入 | 合成shellイベント確認。Code／Chat／Cowork実モデル継続は未受入 | 自前β・connector・bundleとも未掲載 |
| Grok Bot | 調査済み | beta.10生成・正本一致／参照・archive hash検査通過 | 未受入 | 未受入 | Skillの自発判断は未受入。hookは対象外 | 限定β・掲載とも未完了 |
| Muse Code | stable 1.4.3本体と実manifest／argv契約を確認 | beta.10／beta.10.hooksのnative validate／install／Skill／update／disable／remove通過 | 実PTY＋合成loopbackでnative OAuth code交換成功。公開OAuth／認証後tool発見は未受入 | 未受入 | 本体hook fixtureでbound Stop・抑止条件成功。実モデル継続は未受入 | 隔離native導入確認、Git／中央掲載は未実施 |
| Pi | 隔離1.0.4、既存0.85.1保持 | 現行tgzを無改変でnative導入。mock 6件・型互換、CLI／RPC／設定保持通過 | loopback MCP／OAuth metadata発見通過。公開OAuth未受入 | 未受入 | native AgentSessionで7条件成功、固定合成provider応答。人のTUI／実モデル同期は未受入 | native package lifecycle確認、npm未公開 |
| DSH | 固定SHAの公開コード、CLI／Desktop 0.2.0-rc.2 | beta.16実装・公開済み。80/80 package＋2/2 root・型／build成功。最終native／browser／CLI証拠hash一致、32公開ファイル一致 | 本人確認：公開OAuth・発見/context・MCP読み書き・Desktop保存認証再利用。設定前の復元／設定なし新規・forkは未受入 | 基本読み書きは本人確認済み。限定patchのreadback・競合、Agent Handoff、Human回答→再開は未受入 | Stop対象外。auto restoreは推論／進捗同期を開始しない | npm beta／latest=beta.16。GitHubガイド反映は別工程。追加開発停止 |
| OpenCode | SDK 1.18.32、実1.18.32／1.18.35 | beta.14、11 hook＋2 root検査、14ファイル一致。native導入／更新／削除・他プラグイン保持 | loopback OAuth交換／保存／refreshと空tool catalog発見。公開OAuth／browser callback未受入 | 未受入 | 任意finite checkを検査。実モデルcontinuation未受入 | 凍結ローカル候補。npm未公開 |
| OpenClaw | 固定実2026.9.9 | beta.14、7 package検査、16ファイル一致。native導入／更新／削除・設定保持 | loopback callback／PKCE／保存／probe／refresh・rotationとAccounts projection。公開OAuth／実browser UI未受入 | 未受入 | 共通Skillのみ。終了hookなし | 凍結ローカル候補。npm／ClawHub未公開、複数人channel未受入 |

過去のOpenAIローカル12テスト成功、Skill discovery、ZIP作成は各時点の記録であり、新候補や他ホストの実OAuth受入を証明しない。今回の実行結果を付記するまで、上表の保留項目を成功に変更しない。

OpenCode beta.11の履歴：実ホスト1.18.32／1.18.35の両方で、隔離tgz導入・正本Skill発見・SDK session metadata・options tuple・中断／Plan／read-only抑止・設定保持・unloadが成功。最終2回はGit探索も隔離した。初回のホスト検証で共有`.git/opencode` cacheが更新されたため、詳細を[native記録](guilduo-opencode-native-evidence.md#acceptance)へ残す。公開OAuthと正のモデルcontinuationは未実施。今回のbeta.14検査ではGit探索も最初から隔離している。

### 今回のローカル統合記録

2026-10-06〜07候補 `0.6.0-beta.10`（Claude／Muse任意版は `.hooks`）。夜間の全体検査 **687/687**、DSH隔離runtime **12/12**、型検査・アプリbuild・Worker dry-runが成功。OpenAI／Grokの公式Agent Plugins schema **6検査**、Claude native lifecycle **59検査**、Muse stableの実生成物とfixture hooks、Pi native engine **7条件**／mock **6件**を確認した。追加検証器の型ポリシー不適合は構造型に修正し、全体型検査を再実行して成功した。P0のAgent失効・HTTP／JSON-RPC／schema・OAuth resource／client／refresh／失効に加え、同時code消費・認可系列失効・再認可競合、Unicode進捗メモ、metadata hardlink破壊を修正・隔離再検証した。最後のhardlink指摘は独立再現器でもclosed。変更tool 29件の確認annotationとcatalogは同期済み。配備・公開OAuth・実モデルβ受入・公開は別ゲートである。

候補Workerには実SDK 2.0.0からloopback HTTPでinitialize／56ツール発見／Agent・Quest読取／限定更新・読み戻し／schema拒否・競合・無変更を実行した。別laneではSDK自身のDCR／S256 PKCE／issuer・resource／scoped token／refresh・失効が通過。AppwriteのHuman identityは合成応答であり、本番OAuth・人のWeb回答の証拠ではない。

既存OpenAI接続では56ツールとcontextを確認し、利用者のfixture準備許可により専用Questを作成・単独codexへ割当・読み戻した。実Human確認Questもsourceの版を確認してpreview→実行→読み戻し、14:29 UTC時点でpendingを再確認。本人のWeb回答・保存回答読取・再開は未完了。cached `update_quest`には `expectedUpdatedAt`／`actingAgentId` が見えないため、継続進捗更新とhook bindingは保留する。fixtureの実IDは公開文書に載せない。

[guilduo-archive-validation.json](../.qa-artifacts/guilduo-archive-validation.json) は現行11配布archiveを展開せず検査し、生成source・canonical Skill・全ファイルのSHA256一致を確認する。[統合証拠](../.qa-artifacts/guilduo-multihost-validation.json)へ最終検査と外部ゲートを集約する。公開OpenAI ZIPは **11ファイル・33,857 bytes**、SHA256 `b0c2812d14180e8f3b5851a33cc3aa88278be679554e2b2a918ea4416129f45e`。各 `validation.json` の `liveAcceptance: pending` は公開OAuth等の保留を示す。ルート依存・lockfile・実利用の接続設定は変更せず、DSH依存は独立package内に隔離した。

### 証拠の記録票

追加の失効工程は実workerd＋D1で **3/3、TODO 0** を確認した。再認可前の古いaccessはrefreshと同じく最新family照合で拒否する。本人のDisconnect／履歴削除はowner/clientの一方向hashによる失効境界を保持し、旧refreshによるindex再作成・再認可後の旧credential復活を拒否する。新しい明示認可、別owner/client、未登録・未失効の旧clientはそれぞれ検査した。[閉鎖証拠](../.qa-artifacts/guilduo-oauth-workerd/disconnect-regression-evidence.json)。単独tokenのfamily失効は後の認可を失効させない。今回の実害再現は隔離テストであり、本番での悪用や配備完了は主張しない。

各ホスト・実行surfaceごとにこの票をコピーし、空欄を成功と解釈しない。資格情報なしの証拠をリポジトリまたは承認済み保管先へ残す。

```text
host / surface / hostVersion / OS / NodeVersion:
pluginVersion / sourceRevision-or-diffHash / packageSHA256:
dateUTC / operator / evidencePath:
stage: constructed | local-tested | connected | write-human-accepted | proactive-accepted | distributed | submitted | approved | published
OAuth: not-run | pass | fail; discovery/context/read:
authorized fixture aliases / selected Agent alias / granted scopes:
write + readback / no-op / 409 / ambiguous-write:
Human request -> web answer -> saved answer -> resume:
reminder count / read-only / revocation / resume / fork / cwd change:
install / update / disable / uninstall / existing-config-preserved:
remaining gate / owner / next action:
```

実IDが必要な再現対応表は非公開の専用fixture管理に置く。公開証拠にはaliasを使い、token、client secret、完全なUID、Cookie、Authorization header、会話全文、Quest本文、審査ログイン情報を記録しない。画面・動画・HTTP記録も同じ基準で検査する。

## P0: 配布前の共通MCPゲート

以下はコードレビュー上の経路を隔離テストで検証する配布前ゲートであり、本番悪用を再現した報告ではない。修正済みの判断には失敗再現→修正→成功の記録が必要。

| ゲート | 最小の隔離検査と受入条件 |
| --- | --- |
| Agentリンク境界 | 単独Agentを無効化／接続を失効後、`actingAgentId`省略でも元のOAuth権限へ戻らずexecutionを拒否。未リンク旧クライアント・discovery・明示的復旧操作とは区別。billing無効でも拒否 |
| HTTP／JSON-RPC | SSEを提供しないGETは405。対応しないmethod、malformed JSON／envelope／ID／protocolはmutation前に拒否。IDなし `tools/call` は書込み0。正しい通知は応答本文なし。POST JSON、initialize、ping、tools/list、既存client互換を確認 |
| 入力schema | 宣言済みschemaをtool実行前に検証。未対応 `update_quest.dryRun`、不正型・必須欠落・余分なfieldを拒否し、業務データを変更しない |
| OAuth境界 | resource／audience、client binding、refresh、失効を個別に検査。誤resource・別client・失効tokenが実行権限を得ない。旧token互換と既存の並行refresh／再試行安全性を検査 |
| 生成物 | canonical Skill／参照ファイル一致、参照manifestと画像・LICENSEの存在、秘密情報除外、公開OpenAIのhooks／App除外、Museの認証MCP除外。ルートアプリの依存・公開設定を保持 |

共通契約変更は親担当が統合する。OAuth設計の追加変更が必要な場合は独立工程にし、未解決のままβを合格させない。Claude審査の変更tool annotationも実動作と照合し、確認を消すために `readOnlyHint`／`destructiveHint` を偽らない。

## 許可済みの自発的同期

手順の正本は[phase-sync](../skills/guilduo-workflows/references/phase-sync.md)。プラグインの導入、OAuth grant、実装依頼だけでは特定Questへの継続書込み権限を得ない。

1. 利用者が正確なQuest・Agentへの継続進捗更新を許可した後、検証完了、障害確定、次の行動変更など意味ある区切りで同期する。
2. 毎回 `get_current_agent_context` と `get_quest` を読む。共有接続では許可済み `actingAgentId` をすべての呼び出しへ渡す。
3. 変更した `nextAction`（180文字以内）と必要な `handoff.note`（全体500文字以内）だけをpatchし、最新の `expectedUpdatedAt` を使う。既存本文・履歴・リンクを保持する。`update_quest` に `dryRun` は渡さない。
4. 保存後に読み戻す。同じ結果は無更新。409・応答不明は再読込してから判断し、他者の更新を消したり条件を外して再送したりしない。
5. Plan Mode、read-only、未binding、許可撤回では進捗書込み0。終了補助は確認を促すだけで、token・会話履歴・ネットワーク更新を担当しない。元の利用者入力につき継続リマインダー最大1回。

完了、Human承認、採点、報酬、Handoff transitionは進捗同期と別の許可・操作である。自発的にtoolを選ぶこととホストの確認画面が出ないことは別。Skillによる選択はbest effortで、通常Chatの強制実行やホスト休止中の同期を保証しない。

## 実装順序と見積り

経験者1名＋サブエージェント、既存MCP／Skill再利用、テストアカウント確保を前提とする設計見積り。実際の完了日・実績工数ではなく、審査・アカウント操作待ちは含まない。

| 段階 | 作業と完了条件 | 目安 |
| --- | --- | --- |
| P0: 共通基盤 | 上記MCP／Agent／OAuth境界の隔離再現と限定修正、生成物検査、台帳 | 4〜7人日 |
| 最優先: DSH導入 | 既存tgzの標準CLI add／再導入／remove、既存設定保持、npm用metadataと公開残件の整理 | 既存PoCを再利用。下記DSH OAuth工程と分離 |
| P1: 最初のβ | OpenAI実同期、Claude・Piの実Skill／OAuth／更新／Human往復受入 | 5〜8人日 |
| P2: 対象拡大 | Grok BotとMuseを追加。Muse stableで認証・importを確認 | 4〜7人日 |
| P3: 終了時補助 | Claude・Muse Stop、Pi Extensionの再帰／再開／fork受入 | 6〜10人日 |
| 並行: 掲載準備 | OpenAI審査資料、Claude connector＋bundle、Grok掲載経路・資料 | 4〜8人日 |
| 次工程: DSH OAuth | 本人login／callback所有を接続し、固定版＋SDK OAuth、更新・Human往復 | 3〜6人日（以前の設計見積り） |

五環境のβ＋終了時補助は合計19〜32人日、1名で約4〜7週間。掲載準備とDSHは別枠。DSHの永続認証・refresh／失効・Windows保存境界まで含む配布版は初回PoCを含め7〜12人日程度を別途見込む。

現在の並列担当はDSH仕様調査、導入検証、親担当の配布metadata／文書に分ける。まずDSHの導入を進め、OAuth受入は共通MCPの未解決ゲートを確認してから行う。生成できても、依存先の未受入を飛ばしてβ完了にしない。

## βの実受入チェックリスト

- [ ] 対象ホスト・surface・固定版・package hashを記録。実OAuth、tool discovery、Agent context、Quest読取が成功
- [ ] 正確な対象と継続許可の下で更新・読み戻し。同一結果では更新0、409・応答不明で既存履歴と他者更新を保持
- [ ] 無効Agent、別owner、未許可ID、read-only、Plan Mode、許可撤回で進捗書込み0
- [ ] 自発同期は利用者が毎回「保存して」と言わずに実測。実装結果と保存済み結果を区別
- [ ] 終了補助の継続は入力ごとに最大1回。中断／再開／fork／cwd変更／MCP不通で誤同期0。補助なしも別に動作
- [ ] `request_human_review` → [Web App](https://app.guilduo.com/)の人の回答 → 保存回答取得 → 作業再開を実測。回答済みfixtureの読取だけでは往復を合格にしない
- [ ] 新規環境のinstall／update／disable／uninstallを実測し、既存MCP設定・OAuth接続を保持
- [ ] Freeの登録Agent 2人制限を保持。通常MCP CRUD／Quest／HandoffのCredit消費0を保持
- [ ] P0の重大未解決0件。配布候補と検査対象hashが一致

## 配布・公式掲載・保守

OpenAIは専用審査アカウント、domain所有確認、正例5／負例3の実行、動画、Skill／MCP scan、annotation justificationを揃える。Submit、承認、Publishを別記録にする。[提出ガイド](guilduo-plugin-submission.md)にケース票と運営者手順を集約する。

Claudeはremote connectorを先に提出し、同じ組織・正式endpointのplugin bundleと関連付ける。全公開toolを実検査する。GrokはCursor側の提出経路と実際のBot掲載を確認する。Muse・Pi・DSHは確認できたGit／package配布を先行し、未確認の中央ストア掲載を予定として約束しない。

対応ホスト更新時は共通MCP契約と終了イベントの再帰・resume／forkを再検査する。不具合時は任意hook／Extensionだけを無効化して基本MCP＋Skillへ戻す。既存OAuth設定を削除して復旧しない。

観測対象は発火回数、同期成功／保留、409、重複更新、意図しない書込み。各ホストの既存診断・資格情報を除いた手動記録で始める。Quest本文・会話履歴を新しい解析基盤へ収集しない。実利用の観察と公開直後72時間の運用ゲートは[全体ローンチ](launch-roadmap.md)で別管理する。

## 一次資料

| 対象 | 根拠 |
| --- | --- |
| OpenAI | [package仕様](https://developers.openai.com/plugins/build/plugins)・[提出条件](https://developers.openai.com/plugins/deploy/submission)・[hooks trust](https://learn.chatgpt.com/docs/hooks) |
| Claude | [platform対応表](https://claude.com/docs/plugins/platform-support)・[Code plugins](https://code.claude.com/docs/en/plugins)・[hooks](https://code.claude.com/docs/en/hooks)・[marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)・[掲載手順](https://claude.com/docs/directory/publish)・[connector審査](https://claude.com/docs/connectors/building/review-criteria) |
| Grok Bot | [team bots](https://docs.x.ai/grok-bot/team-bots)・[対応形式](https://agent-plugins.org/compatible-clients)・[Cursor plugin仕様](https://cursor.com/docs/reference/plugins) |
| Muse | [stable metadata](https://api.meta.ai/muse-code/channels/muse-stable)・[extending](https://dev.meta.ai/docs/muse-code/extending)・[changelog](https://dev.meta.ai/docs/muse-code/changelog)・[Preview MCP制約](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/mcp-servers/)・[互換](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/compatibility/) |
| Pi | [v1.0.4 MCP](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/docs/mcp.md)・[packages](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/docs/packages.md)・[イベント型](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/src/core/extensions/types.ts) |
| DSH | [固定SHA transport](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/mcp/mcp-client/src/transport.ts)・[Codex hooks](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/hooks/hooks-codex/src/index.ts) |
| MCP | [2025-06-18 Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) |

これらは今回の調査基準。Previewの記述や公開コードの読解だけで、stableホストの接続・書込み・掲載を受入済みにはしない。
