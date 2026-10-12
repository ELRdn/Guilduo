# Guilduo plugin β：受入と再開手順

2026-10-10 14:48 JST：DSHソースと最新ガイドを[PR #54](https://github.com/ELRdn/Guilduo/pull/54)でmainへ反映。CI成功・文書レビュー必須修正なし・公開7ページHTTP 200。[公開票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/github-publication.json)。GitHub未反映の残件は閉じた。npm README差し替えは別版が必要で、beta.16のarchive／タグは保持。

2026-10-10 本人追確認：DSH追加開発は停止。公開OAuth・MCP読み書きと、Desktop再起動→約1〜2分後に設定を開いて再認証なしの接続済み表示を本人確認済み。設定前に復元したかは観察だけでは不明。残件は設定なし初回／新規／fork、実Agent紐付け／Handoff、限定更新readback・競合、Human回答→再開、実refresh／失効／切断の一連の受入。[現行状況](guilduo-dsh-status.md)／[導入](guilduo-dsh-howto.jp.md)。公開済みarchiveは保持しsource文書を更新。npm README更新には別版が必要で、今回はlatest=beta.16を維持。以下の旧タグ・未受入記述は各時点の履歴。

2026-10-10 14:15 JST 現在：DSH beta.16を`latest`へ昇格し、`beta`もbeta.16を維持。公開tgzは凍結済みarchiveと全byte一致。[タグ変更票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/latest-promotion.json)。本人の読み取り専用報告を公開OAuth・tool discovery・context読取の受入として記録。認証はhost再起動後に行われたため、保存後の再起動復元、新規／forkで設定なし利用、別Desktop、Quest／Human往復は未受入。[受入範囲](guilduo-dsh-acceptance.md#2026-10-10-1409-jst-user-reported-public-oauth-acceptance)。以下の旧タグ／未受入表記はその時点の履歴。

2026-10-10追記: DSH beta.16をnpm公開・公開tgz照合済み（09:45 JST）。beta=beta.16、latest=beta.10を維持。[公開確認票](../.qa-artifacts/guilduo-dsh-lifetime-beta16/publication.json)。native離脱時のgrant誤削除、旧grantの明示切断残留、保存途中の接続済み誤判定を修正。beta.15改名archiveは保持、他ホストはbeta.15のまま。実profileを変更せず合成認証で検査し、実際のbeta.14消失原因と公開OAuthの受入は未確定。[受入記録](guilduo-dsh-acceptance.md#2026-10-10-beta16-grant-lifetime-fix)

2026-10-10 **Skill改名の実装・ローカル受入完了**。正式名・正本は `guilduo-workflows`／`skills/guilduo-workflows/`。基盤beta.11、DSH／OpenCode／OpenClaw beta.15を計13archiveで照合し、3実ホストでbeta.14からの更新・旧名なし・設定保持・削除を確認。[移行手順・検査票](guilduo-workflows-migration.md)。新版npm公開・実利用者の更新・公開OAuth／Human受入は未実施。以下beta.14等の票は旧名の履歴として維持する。

2026-10-09 OpenCode／OpenClaw beta.14：実装・配布物を凍結し、[共通アーカイブ照合](../.qa-artifacts/guilduo-extensions-beta14/validation.json)を通過。標準ホストで導入・更新・削除、合成OAuth・認証保存・refreshを確認した。OpenCodeの共有npm prefixによる他プラグイン削除、OpenClawの不正設定JSONによる秘密表示を修正し、独立レビューでも解消を再確認。新規packageは未公開。[OpenCode受入・導入](guilduo-opencode-native-evidence.md)／[OpenClaw受入・導入](guilduo-openclaw-native-evidence.md)を再開時の正本とする。公開OAuth・Human往復と、OpenClaw実ブラウザー／複数人channelは未受入。

2026-10-09 **DSH beta.14共有認証は実装済み・合成認証ローカル検証通過**。[最終ローカル票](../.qa-artifacts/guilduo-dsh-shared-beta14/validation.json)はPASS_LOCAL_RELEASE、75/75 package tests・2/2 root package tests・型／build／designが成功し、scoped reviewの残存P1/P2はない。[最終native票](../.qa-artifacts/guilduo-dsh-shared-beta14/native-DhY3W3/evidence.json)は7/7 PASS、現行compiled hash一致。[最終UI集約票](../.qa-artifacts/guilduo-dsh-shared-beta14/native-final-records-20261009-230829-212.json)はbrowser／carrier・Settings6並列PASS、現行hash一致。README永久凍結後の再pack・[CLI beta.13→beta.14 upgrade等18検査](../.qa-artifacts/guilduo-dsh-host/install-8gGvdY/evidence.json)はPASS、32ファイル全byte一致。最終tgz SHA-256は`43585b8d33ea5d2e4da8cde599d5302b60130834e9795f0f5f6eb1fe97b255ed`。2026-10-10 08:22 JSTにbeta.14をnpm公開・公開配布物を照合済み。beta tagはbeta.14、latestはbeta.10を維持し、公開tgzの全byte／SHA-256／registry integrityが検証済みarchiveと一致。[公開確認票](../.qa-artifacts/guilduo-dsh-shared-beta14/publication.json)。[beta.14受入表](guilduo-dsh-acceptance.md#2026-10-09-beta14-shared-plan-candidate)。実公開OAuth／WebDesktop／Human未受入。以下beta.13以前の公開・検査・導入コマンドは当時の履歴。

採用契約：Windows・同じWindows user／`DSH_HOME`のWeb／Desktopで初回認証を通常／新規通常／root forkへ共有し、subagent／runtime child／独立seededを拒否する。旧exact-session grantは元会話の「設定 → Guilduo → 全会話で使う」を1回明示実行する。認証済みSettings share RPCのdescriptorは元grantを参照し、token複製・暗黙移行なし。共有切断は全体tombstoneで旧grant fallbackを拒否し、共有元会話削除は共有を保持する。`agent/created`を初回モデル組立前にawaitし、選択でもstatusを自動取得する。復元通信15秒上限・暗黙OAuth／推論なし、catalogはplugin寿命中1つ。Agent scope／Free登録2Agentは不変。DPAPIは同じWindows userの保存保護であり、モデル・同一user／process内の境界ではない。native Credentialsのプロセス間検証はDSH会話／履歴writerの同時実行安全性を証明しない。

梱包引継ぎ：`plugins/guilduo-dsh/README.md`を先に確定・凍結した。最終版20,786 bytes、SHA-256は`9c40fd69f7c694c410b98f53512447388ed451636caa07cd128ece53400db3b2`。このREADMEは本リリース中永久凍結。この担当から以後の梱包対象文書変更はない。親担当は**凍結最終READMEから再pack → 隔離CLIのbeta.13からbeta.14へのupgrade／再導入／削除・全byte照合 → npm公開・registry exact version／tag／公開tgz照合**の順に進める。再pack／CLI照合は完了。2026-10-10 08:22 JSTにbeta.14をnpm公開・公開配布物を照合済み。beta tagはbeta.14、latestはbeta.10を維持し、公開tgzの全byte／SHA-256／registry integrityが検証済みarchiveと一致。[公開確認票](../.qa-artifacts/guilduo-dsh-shared-beta14/publication.json)。README変更後の再pack前archiveや旧hashを流用しない。

次のDSH操作は、親側の検査済み候補を受け取り、**旧Web／Desktop profileを先に停止** → 各profile更新 → 再起動／再読込 → 旧grantなら元会話で「全会話で使う」1回 → 共有／拒否・切断／削除／復元を新規検査する順。Desktopはnative plugin manager、Webは標準CLI。beta.14公開確認済みで、registryから導入できる。[導入・更新手順](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command)。公開OAuth／実profile再起動／Quest更新・Human往復は別の未受入ゲートとして親側が記録する。

2026-10-09 19:31 JST：DSH **beta.13公開済み**。beta tag／公開tgzの全byte・integrity一致を確認。[公開確認票](../.qa-artifacts/guilduo-dsh-settings-beta13/publication.json)。Desktopのプラグイン管理で`@guilduo/dsh-oauth-poc@0.6.0-beta.13`へ更新して再起動し、Settings → Guilduo → 接続 → ブラウザーで認証を実受入する。実アカウントOAuth／Human往復は未完了。

2026-10-09 Desktop不具合修正履歴：**DSH beta.13**。beta.12の親Contextの依存注入不足を再現し、export／bundleの`credentials, agents, sessions, sessionController`宣言を揃えた。兄弟サービスでの回帰・合成OAuth・再ロード・無効owner拒否を検査し、nativeブラウザー検証にも同じ境界を適用した。[beta.13受入履歴](guilduo-dsh-acceptance.md#2026-10-09-beta13-real-host-injection-fix)。以下beta.12の検査／公開も履歴であり、beta.14や実Desktop OAuthの成功を意味しない。

最新の追加対象は**DSH → OpenCode → Grok／ChatGPT／Claude**。OpenCode独立候補は[README](../plugins/guilduo-opencode/README.md)と[native記録](guilduo-opencode-native-evidence.md)を参照。共通Skill・標準OAuth MCP・既存設定保持・任意finite phase checkを実装済みで、公開OAuth／Human往復・npm公開は別ゲート。DSHの認証永続化はbeta.12へ進め、beta.10／beta.11の既存archive・検査票を上書きしない。以下のbeta.11記録はその時点の履歴。

2026-10-09 08:27 JST更新：DSH **beta.12をnpm公開済み**。本人認証後、公開metadata・beta tag・tgz全byte／integrity一致を確認した。[公開確認票](../.qa-artifacts/guilduo-dsh-settings-beta12/publication.json)。Web更新は`dsh plugin --profile web add @guilduo/dsh-oauth-poc@0.6.0-beta.12 --ignore-scripts`、Desktopはnative plugin manager。再起動・ブラウザー再読込後、同じ通常会話のSettings → Guilduoを開く。Windows DPAPI保存／復元・明示切断削除は隔離検証済み。次の実受入は公開OAuth・実profile再起動・Quest／Human往復であり、npm公開と混同しない。`latest`はbeta.10、他ホストの成果物は保持する。

2026-10-09 新候補：DSHだけ`0.6.0-beta.11`へ更新し、Web／Desktop共通Settings sectionと信頼できるGateway／会話選択／loopback callbackを実装した。[DSH新候補の記録](guilduo-dsh-acceptance.md)と[設定画面手順](../plugins/guilduo-dsh/README.md#connect-from-settings-web-and-desktop)を優先する。公開済みbeta.10は保持。他ホストはbeta.10のまま。次の工程はbeta.11を導入して実Web／Desktopの公開OAuthを受け入れ、その後Quest／Human往復。以前の全体検査票・審査用archiveへ新候補のhashを混ぜない。

2026-10-09 07:14 JST更新：本人のnpm公開後、`@guilduo/dsh-oauth-poc@0.6.0-beta.10`の公開metadata／tarballを確認。`beta`と`latest` tag、tgz全byte一致は[公開確認票](../.qa-artifacts/guilduo-dsh-publish-ready/publication.json)へ。標準導入は`dsh plugin --profile web add @guilduo/dsh-oauth-poc@beta --ignore-scripts`。同じversionへの再publishはせず、変更は新versionで配布する。本人login／callbackと実OAuth／Human受入は引き続き未完了。以下の公開未実施の記録は公開前の履歴。

2026-10-06夜間のローカル候補。公開／通常版は`0.6.0-beta.10`、Claude／Museの任意フック版は`0.6.0-beta.10.hooks`。ルートアプリは`0.6.0-beta.8`、API 2.7.0／Schema 7を維持する。

[環境別台帳](guilduo-plugin-roadmap.md)・[導入](guilduo-plugin-setup.md)・[提出](guilduo-plugin-submission.md)を正本とする。最新検査は[統合証拠](../.qa-artifacts/guilduo-multihost-validation.json)、11配布物の全ファイル／正本一致は[archive検査](../.qa-artifacts/guilduo-archive-validation.json)。この候補を本番配備・公開済みと扱わない。

2026-10-09の優先順位は**DSH → 他環境**。DSH標準CLI add／同tgz再add／list／remove、既存設定保持、19ファイル照合は[実CLI 16検査・関連10テスト](../.qa-artifacts/guilduo-dsh-cli/validation.json)で成功。導入コマンドは[DSH README](../plugins/guilduo-dsh/README.md#install-with-the-standard-dsh-command)。npm版CLIはDesktop profileを管理できない。同日の本人のpublishが`EPRIVATE`で停止したため、実験用`beta`公開候補から`private`を削除して再packし、公開dry-runは成功した。[公開準備の最新票](../.qa-artifacts/guilduo-dsh-publish-ready/validation.json)を参照。実公開は未実施で、scope権限はregistry側の公開操作で確認する。次の実受入は[本人login／callbackの不足契約](guilduo-dsh-acceptance.md)を満たして公開OAuth／更新／Human往復。private削除前の[審査用の束](../.qa-artifacts/guilduo-review-dsh-cli-final/review.json)は履歴として保持し、そのhashを新tgzへ流用しない。下記の他環境向け手順は後続工程として保持する。

## 再実行

Windowsでリポジトリrootから実行する。native検証には対象版の隔離runtimeとCLIが必要。実利用中のprofile、OAuth、Pi 0.85.1は使わず保持する。

```powershell
npx tsx tools/package-guilduo-plugins.mts
npm --prefix plugins/guilduo-dsh run pack:poc
npm test
npm run typecheck
npx tsx tools/verify-guilduo-mcp-candidate.mts
npx tsx tools/verify-guilduo-claude-host.mts
npx tsx tools/verify-guilduo-pi-host.mts
```

一括packは公開OpenAI、五環境の通常／任意版を生成する。登録済みApp参照のローカルOpenAI任意版だけ必要なら`--app-id <既存の登録ID>`を指定し、公開ZIPには混ぜない。DSHは独立package。再生成後のhashは新しい実行票へ記録する。元のZIP hashを再生成後にも流用しない。

## 残る工程

### 2026-10-08：実受入へ進めるコマンド

`tools/verify-guilduo-live.mts`は正式MCPの到達確認、本人が渡した一時tokenでのAgent／Quest読取、明示した専用fixtureの限定更新と読み戻しを実行する。通常は読取のみ。環境変数やホストのcredentialファイルを自動探索しない。Windowsの証明書を使う必要がある環境では`--use-system-ca`を付け、TLS検証を無効化しない。

```powershell
# 認証なし。正式health／OAuth metadata／domain challengeのHTTP到達を記録する。
node --use-system-ca --import tsx tools/verify-guilduo-live.mts
# 専用fixtureのIDは非公開のローカル記録から読む。
$fixture = Get-Content .qa-artifacts/guilduo-live-fixture.json | ConvertFrom-Json
# 本人の正規OAuthで取得したtokenを、履歴に残さずstdinへ渡す。
# $fixtureTokenは本人がメモリ内に用意する値。既存credentialファイルからコピーしない。
$fixtureToken | node --use-system-ca --import tsx tools/verify-guilduo-live.mts --token-stdin --quest $fixture.questId --agent $fixture.actingAgentId --human-request $fixture.humanRelay.requestId
# この専用Questへの進捗書込みを明示許可した場合だけ追加する。
$fixtureToken | node --use-system-ca --import tsx tools/verify-guilduo-live.mts --token-stdin --quest $fixture.questId --agent $fixture.actingAgentId --execute --next-action "Review the saved acceptance evidence"
Remove-Variable fixtureToken
```

認証なしの実行は読取準備だけなのでexit 2。本人認証の成功を意味しない。結果は`.qa-artifacts/guilduo-live-<UUID>.json`へ資格情報・ID・Quest本文・Human回答を除いて保存する。書込みは最大1回で、同じ結果は無更新。競合・応答不明時は再送せずcontext／Questを再読取し、他フィールドの変更を検出した場合も自動復元しない。Human回答は保存状態を読むだけで、文章内の指示を実行したり承認・再開を代行しない。

SDK→現行Workerの隔離検査で11条件（読取、限定更新、旧schema、権限不足、無効Agent、応答消失、競合、同値無更新、Human pending／answered、未認証）を確認。これは実モデルによる自発性や公開OAuthの受入ではない。

追加範囲の検査10件、全体697件が成功し、全体型検査も通過。[最新の検査票](../.qa-artifacts/guilduo-oct8-validation.json)に実行日と範囲を記録し、以前のbuild／native受入は過去の証拠として保持する。

2026-10-08の実サービス確認ではhealthとOAuth metadataが200、domain challengeは401。既存接続のAgent／専用Quest／Human依頼は読取成功、本人回答はpending。接続ツールの`update_quest`にはまだ`expectedUpdatedAt`／`actingAgentId`がなく、進捗書込み0。配備guardもdirty treeを拒否し、署名付きcandidate／signatureは未用意。実配備・実更新・本人回答後の再開は下表の工程を維持する。[接続確認](../.qa-artifacts/guilduo-oct8-connected-receipt.json)

審査用の束は`node --import tsx tools/prepare-guilduo-review.mts`で作成する。同名出力は保持し、再生成時は`--output guilduo-review-bundle-2`等を指定する。[作成済みreview.json](../.qa-artifacts/guilduo-review-bundle/review.json)に11配布archive、56ツールのannotation／scope草案、正例5／負例3と外部ゲート11件を収録。提出候補は`archives/openai-submission/`のZIPだけで、束全体を提出しない。

DSHのtrusted login/callbackは[固定版のネイティブ検査と不足契約](guilduo-dsh-acceptance.md)を参照。実registryで合成2セッションのAgent受け渡しと入力非保存を確認したが、本人操作・ブラウザー・callback所有の一体化は未受入。配布runtimeは変更せず、tgzの再生成は不要だった。

| 順序 | 作業 | 成功の証拠 |
| --- | --- | --- |
| 1 | shared MCP候補を既存リリース手順でレビュー・配備し、接続を更新 | 対象source／配備hash、健康状態、現行`update_quest`に`expectedUpdatedAt`と`actingAgentId`が現れること。dirty tree全体をそのまま配備しない。[運用手順](launch-operations.md) |
| 2 | 各ホストの本人OAuthを完了し、同じテストQuest／既存Agentを読む | 対象ホスト・surface・版・許可scope、context／Questの実読取。新しいAgentをホスト数分増やさずFreeの2Agentを維持 |
| 3 | 許可済み進捗の限定patch・読み戻し・無更新・競合を実測 | 保存結果、未指定メモ／履歴／完了／報酬の保持。cached schemaの不足を別operationやtokenコピーで迂回しない |
| 4 | 作成済み「Guilduoプラグイン：Human往復の実受入」へ本人がWebで回答 | [Guilduo / Relay Forge](https://app.guilduo.com/)で本人のtext feedback→保存済み回答取得→許可範囲で再開。pendingを承認済みにしない。実IDはローカルfixture記録のみ |
| 5 | 任意補助を利用者がreview／trustし、実モデルの区切りで動かす | 同期の自発性、1回継続、中断／再開／fork／cwd変更／撤回／MCP不通。native fixtureやPiの固定合成応答を実モデル受入へ転用しない |
| 6 | Grok Bot teamアクセスとDSHのtrustedログイン／callback UIを確保 | Grokで実import／OAuth。DSHはexact live-sessionの本人操作とcallback ownershipを実証。汎用webServer routeだけで認証UI完成としない |
| 7 | 専用審査account、正例5／負例3、動画、domain、scanを揃えて提出 | [提出手順](guilduo-plugin-submission.md)の実行票と運営者操作。OpenAI／Claude connector・bundleを区別。Submit→承認→Publish／掲載を別記録 |

既存OpenAI接続でfixtureとHuman依頼の保存は成功したが、新候補の進捗同期は未受入。公開OAuth・人の回答・公開承認が必要な工程は運営者／本人へ引き継ぐ。確認画面を消すために変更ツールのannotationを偽らない。

## 停止と保守

問題があれば元のsession／cwdでunbindし、任意hook／Extensionを無効化して基本MCP＋Skillへ戻す。Claude／Museの通常版と任意版はcacheを実確認し、Museの異なるsource pathへの切替はremove→installを使う。native user MCP設定とOAuthを削除しない。

資格情報、会話、Quest本文を新しい解析基盤へ集めない。ローカル証拠は発火・同期成功／保留・競合・重複・意図しない書込みの件数とaliasで記録する。審査員の認証情報は提出ポータルの専用欄にだけ入力する。
