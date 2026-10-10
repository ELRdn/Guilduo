# Guilduo next hosts beta.12 独立レビュー

確認日: 2026-10-10。レビュー担当: Cyan（AI）。人間の独立監査、外部監査、ホスト運営者の承認ではない。

対象は `codex/guilduo-next-hosts` のsource、generator/archive helper、native検査driver、導入説明と凍結ZIP。起点HEADは `5e8f66e9214bcf48277b1b46f802f189a90acf04`。引継ぎ後の確認HEADは `6afb483086aeff5cd67e8569259cfa210a6f4ebf`（Claude main統合済み）。今回の追確認は文書整合、現在App archiveの全member/hash、R6 helper/driver hashに限り、統合後source全体の再監査や最終PR CI成功を主張しない。親から初回PR64 CI SUCCESSの報告あり。レビュー担当はGit変更、公開、native起動、OAuth/model/API操作、credential/private profile読取りを行っていない。変更した文書は本書のみ。

## 現時点の判定

**レビュー対象の未解消P1/P2なし。R5/R6は独立再確認で解消。sourceと全4公開用ZIPは、未受入条件を明記した候補配布として可。** source review gateは閉じた。main統合済みで、統合後の最終commit/CI・実公開receiptは別gateとして残る。実OAuth/model/Human全面受入は候補配布の前提に追加しない。

通常Codex hookのtrusted native実行と、直接MCPによる実モデルの操作は別受入である。インストール済み・enabled・fixture PASSだけではhookによる自動継続を実機受入としない。公式Docsへの掲載、Git/ZIP公開、OpenAI提出、Cursor等の上流掲載も別の状態とする。

## 具体的指摘と解消状況

### R5 / P2（解消）: Codex凍結ZIPがGit正本のLF byteと不一致

- 当初の根拠: `.gitattributes:4` は `* text=auto eol=lf`。`plugins/guilduo-workflows/hooks/hooks.json:27` の末尾空行と `hooks/README.md:40` の末尾改行に各1個のCRLFが残っていた。template側の `plugins/questforge/hooks/{hooks.json,README.md}` も同じ。旧ZIPの2memberはworktree raw byteとは一致したが、**実際のGit index blobとは不一致**。LF置換後はindexと一致した。
- 当初の再現条件: 旧Codex ZIP（SHA256 `8955c15cfc8d07c210a025847d8c665d1f0f06f813ebaef888b518ef13209df0`）を、そのままGit source commitとbyte一致したarchiveとして公開する場合。実行時不具合やOAuth不具合を主張するものではなく、要求された正本一致gateの失敗。現在の最終ZIPは解消済み。
- 修正/最終確認: LF化後にCodex/OpenAIを再freeze。新Codex `b12e1c7772fe99e3d06303a117614dc3b83d26d36c89074b9f580e42b7f71fe8` の13全memberは独立に現在のGit index blob/生成stagingと一致した。新OpenAI `16221aa92f68173b572ce7d024de43725ddaf8e2680a4e19402c916c06891977` の11全memberもstaging/canonical/license/noApp/nohook確認PASS。Grok/Museはhash不変。これによりR5を解消。旧Codex hashは `8955c15cfc8d07c210a025847d8c665d1f0f06f813ebaef888b518ef13209df0`、旧OpenAI hashは `4121f2a0a1fc1f1f6d857009fbb6dabaaf546c22de88ef8f67f369111d3b9d1f`。旧hashの承認を新候補へ流用していない。
- 確度: 高。ZIP読取りと `git show :<path>` の比較で独立確認。catalog `.agents/plugins/marketplace.json` の末尾CRLFもindexへはLF正規化されるが、ZIP memberではない。

### R6 / P2（解消）: 新Muse OAuth driverが設定ファイル末端リンクを拒否しない

以下は修正前snapshotの再現記録。現在の修正・独立再確認は本書末尾「R6最終source gate」を参照。

- 根拠: `tools/guilduo-muse-public-oauth.mts:28–32` は `ready.json` の不存在だけを検査した後、既存QA profileの `config/muse/settings.json` へ通常の `writeFile` を行う。`tools/guilduo-muse-native-env.mts:16–32` はdirectory/ancestorを検査するが、この末端ファイルは検査しない。
- 再現条件: 固定名の `public-oauth-1.4.4-R5419.1` profileが既にあり、ready markerはなく、`settings.json` がsymlinkまたはnlink=2のhardlink。`prepare` がその設定の参照先byteを上書きする。既存のリンクが必要な条件であり、通常の新規空profileで必ず発生する不具合ではない。
- 独立再現: 実sourceをTypeScript除去後にVM評価し、実helperのdirectory検査を通した。FSをメモリ上へ差し替え、readyはENOENT、directoryは正規、settings末端をsymlink/hardlinkとしてモデル化。両方で `writeFile(settingsPath, ...)` へ到達、末端lstatは0回、synthetic sentinelが設定byteに変化した。nativeはstub、実FS書込み0、実native起動0。OS上でのリンク作成・本人profileへの再現は行っていない。
- 当初の修正要求（対応済み）: prepareの設定は排他的な新規作成（`flag: 'wx'`）で既存末端を拒否し、ready/receipt等の自作出力も末端リンクを拒否する。現在の実装と再確認結果は末尾に記録。
- 当初指摘の確度: 高（guard欠如と制御経路）。レビュー担当によるOS上のphysical再現は未実施。候補Muse ZIPの内容には影響しなかった。公開sourceのQA隔離保証を弱めていたdriverは修正済み。
- 検査時driver SHA256: `c7edea576947348c824a9b0d3d5d3f18d4df2c659487261ebfa4ed68a40a9fe6`。

## 先行4件P2の解消確認

| 指摘 | 現在の根拠と独立確認 | 判定 |
| --- | --- | --- |
| catalog/selector不一致 | `.agents/plugins/marketplace.json:2` は `guilduo-local`、native driver `tools/verify-guilduo-codex-host.mts:11` と一致。導入先は `plugins/guilduo-workflows`、MCP ID `questforge` を保持 | 解消 |
| Muse QA子directory経由の逸脱 | `tools/guilduo-muse-native-env.mts:16–32` は全子/祖先を最初のmkdir前とmkdir前後に確認。メモリ上の `.qa-artifacts` / `config/muse` / `workspace` / `logs` junctionがmkdir前に拒否された | 解消。別の末端ファイル問題R6も解消済み |
| generatorのsource hardlink | `tools/prepare-guilduo-plugin.mts:38–41` はlstat、regular、nonlink、nlink=1、realpathを検査。メモリ上のnlink=2 sourceがread前に拒否された | 解消 |
| archive metadata/target境界 | `tools/package-guilduo-plugins.mts:94–105` はmetadataリンク/nlinkとtarget/type/versionを検査、`:14–86` にmanifest/接続/closed whitelist検査、`:128` にpack前検査。メモリ上のtarget mismatchとnlink=2 metadataはpack/read前に拒否 | 解消 |

これらのメモリassertionはnativeホスト証拠ではない。generatorのtarget限定呼出し、version/host/connection別のarchive名、Grok/Muse用の明示sourceRootも現sourceで確認した。

## hook・接続方式の境界

`plugins/guilduo-workflows/hooks/lifecycle.mjs:66–75` のreceipt keyはsession_id＋turn_idのみ。bindingはkeyに含めず、`wx` 作成に成功してからblockを返す（`:145–154`）。再通知/競合の敗者は継続しない。欠落turn/recursion/storageはfail closed。`:87–89` と `:128–140` はPlan/readOnly/fork/revoke/Interruptを抑止する。receiptをunbindで削除しない。bindingの読取りは`:91–105` でリンク/nlink/サイズ/opened inodeを検査する。

standing permissionはhookが付与せず、明示bindとmodelが従うSkill上の条件である。会話本文からrevocationを機械的に検出する実装ではない。hostが実際に渡すpermission/turn/recursionの意味とtrusted hookの実行はnative gateが残る。共有Claude/MuseへのCodex receipt適用は `--codex` 条件に限られ、保護されたClaude sourceは変更されていない。

OpenAI提出ZIPは実memberからApp/hookを除外しており、manifest上の省略だけではない。ローカルApp companionの指定された13member ZIPは `.app.json` を含みMCP設定を含まない。別QA実験archiveをこのcompanionと取り違えない。private App IDやそのarchiveは公開releaseに含めない。Grok/Muse標準候補はhookなし。Museのsettings exampleはuserによる独立merge用であり、manifestの認証付きMCP capabilityではない。

## 凍結archiveの独立byte確認

ZIPをメモリ上で読み、全member whitelist、重複/ディレクトリ/traversal/backslash/symlinkの不存在、全memberのsource byte、正本Skill/agent/references、LICENSE、iconを照合した。正本Skillは起点Git blobとも一致。Grok/Museの全memberは現在のGit index blobとも一致。OpenAIのgenerated metadataはgenerator/validationとの照合対象であり、generated ZIP自体を既存tracked treeとは扱わない。credential形状検査は補助検査であり、完全なsecret不在証明ではない。

| 対象 | 全member | SHA256 | 判定 |
| --- | ---: | --- | --- |
| Codex | 13 | `b12e1c7772fe99e3d06303a117614dc3b83d26d36c89074b9f580e42b7f71fe8` | Git index全member一致、候補配布可 |
| OpenAI | 11 | `16221aa92f68173b572ce7d024de43725ddaf8e2680a4e19402c916c06891977` | 候補配布可、提出/承認は別 |
| Grok | 11 | `e686588f4d02ea299066a95ec3d1f7d2bf1bdcf57ebcaf1513937399b65d99f0` | 候補配布可 |
| Muse | 11 | `34cec2b38c577b30daa7b43037d3d3cb57e570027fb30dcc52f3fc3bdb11d009` | 候補配布可、R6 source driver修正済み |

検査pathはCodex `.qa-artifacts/guilduo-plugin-hooks/`、OpenAI `.qa-artifacts/guilduo-submission/`、Grok/Muse `.qa-artifacts/guilduo-next-hosts/grok-muse/frozen/{grok,muse}/` 内の `guilduo-workflows-<host>-0.6.0-beta.12.zip`。ローカル限定Appの正確な対象は `.qa-artifacts/guilduo-plugin-hooks-app-beta12-final/guilduo-workflows-codex-app-0.6.0-beta.12.zip`、現在SHA256は `7f5858c77480f05f724b2238c7086ad317e286aaa856e0cfa0a4046076d3543f`。現在ファイルを独立に再ハッシュし、37,078 bytes/13member、closed whitelist、staging/canonical/current hooks byte一致、MCPなしを再確認した。先行確認時の `7d05026f0afb584a5ac945c5dfec9d167856da7b8d0a1a0dc58f42b4e4107c5b` は過去snapshotのhashで、現行hashではない。**public assetではない。**

共通7memberはLICENSE、icon、Skill、agents/openai.yaml、referencesのlocal-hooks/phase-sync/tools。Codexはcompat manifest/MCP/README＋hook3、OpenAIはcompat/portable manifest＋MCP2、Grokはmanifest/MCP＋README日英、Museはnative manifest/settings example＋README日英。QA metadata/log/native binary/profile/browserをZIPに含めていない。確認時のGit indexにもQA artifact pathは含まれていなかった。

## 保護対象

`git diff HEAD --name-only` でcanonical Skill、Claude/`.claude-plugin`、DSH/OpenCode/OpenClaw、root package/lockfileへの差分は空。canonical 5ファイルとbundleコピーのbyte一致も確認。保護対象117trackedファイルの先行raw照合では112が完全一致、DSHの5testはCRLF/LFだけの差でGit差分なし・LF正規化後一致だった。この作業による変更とは帰属せず、117全てraw byte不変とは主張しない。

旧immutable archiveも実hashを再確認した。

| 保護archive | SHA256 |
| --- | --- |
| DSH beta.17 | `89414b1ec3d98fa5d1fa7aa3eb0180f1ed59c913b615942bb46844e5fed3c6d9` |
| OpenCode beta.16 | `6fe013ae72b80e47d8846b2c20b0e4d42a749ce03ea142ef3d9243410e870d2c` |
| OpenClaw beta.16 | `46c3fb454ac179807148c090f9730f8a2f77576f9fdbd8d20d4584508eaea678` |

## host別の受入境界

「親報告」は今回のlive実行を親から受領した結果であり、レビュー担当がprivate receiptを読んだ/再実行した意味ではない。

| 対象 | 実装 | 導入 | OAuth | model | Human | 配布 | 掲載 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI / ChatGPT | nohook/noApp提出候補のsource/ZIP確認 | public install未受入 | portal/native app経路未受入 | 未受入 | 未受入 | 候補Git/ZIP可、実公開待ち | 本人確認/提出/scan/demo/domain/review/Publish未完了 |
| Codex通常版 | source確認、trusted hook実行未受入 | CLI0.159.2隔離install/Skill discovery receipt確認 | direct public保存再利用/現行56tools PASS（親報告）。refresh/revoke/shared選択は未受入 | exact openai/gpt-6-astra、cached正本Skill＋process-only direct MCP、App/companion offで限定nextAction更新/readback PASS（親報告） | 本人Web保存回答→same-session再開/readback PASS（親報告） | source/最終ZIP候補配布可 | Git/catalog候補。public directory承認なし |
| Codex App companion | 指定13member、MCPなし確認。App schema staleは書込み受入へ流用しない | 本人install/cache/updater beta.12、unrelated plugin保持PASS（親報告） | 既存登録connection再利用。fresh direct schema受入とは別 | companion経由は未受入 | companion経由は未受入 | private local生成のみ | public提出対象外 |
| Grok Bot | portable schema/閉じたpackage確認、hookなし | true Grok host未受入 | 未受入 | 未受入、課金契約なし | 未受入 | 候補Git/ZIP可 | Cursor catalog確認はGrok受入ではない。tested-locally未達で提出保留 |
| Muse Code | native manifest/Skill/settings境界確認、hookなし | stable1.4.4-R5419.1 native lifecycle receiptと最終ZIP smoke receiptを確認 | 親のvisible loginはexit1/timedOutfalse。本人の最新回答は「認証ページ自体が開かない」。原因未確定、OAuth未受入 | 未受入、providerなし | 未受入 | 候補Git/ZIP可 | native custom-source経路。中央listingを確認していない |

Codexの親実モデル4turnではno-op write省略、stale expectedUpdatedAtのquest_conflict拒否後にmodelがread-only再読取/write0もPASSとの追加報告。これは通常plugin hook実行の証拠ではない。先行Human previewの `agent_assignee_required` / none→working拒否はfixtureを担当Codex/readyへ訂正後の限定再検査と区別する。API自体の自動idempotenceや別Agent共有選択も推認しない。

独立に読んだCodex bounded receiptはmodelCalls/accountWrites=0、OAuth開始なし、install/Skill discovery PASS、hook inventoryはenabled/**untrusted**、installedScriptFixturesはsyntheticと明記。Muse lifecycle receiptは最初のcontainer hashに対するinstall/update/disable/enable/remove。最終smoke receiptは上表のMuse hashでvalidate/install/inspect/Skill discovery/remove、modelCalls=0。beta.11 upgradeはsynthetic fixtureで、旧実機beta.11の受入ではない。unrelated設定は値を保持したがnative JSON再整形があり、設定byte保持を主張しない。

先行root515/515、R6修正後root518/518＋tsconfig.node strict PASSは親報告。レビュー担当はroot/native testsを再実行していない。初回PR64 CI SUCCESSをR6修正後/main統合後commitのCI成功とは扱わない。

## 新Muse診断の先行評価と残るgate

以下の診断/driver SHAと行番号はR6修正前の先行snapshot。現在のoutput helper修正は末尾に記録する。

`tools/diagnose-guilduo-muse-oauth.mts`（SHA256 `e0f26363185b3db5d99fc2fced35a32aa2c58f68af5afbad5a21166d4c732ea7`）はloopback synthetic限定。`:15` はTTY比較を要求、`:70–78` は4096文字RAMからallowlisted booleanへ分類、`:79–84` はEnterを送らずprompt/timeoutで停止、`:91–100` はauthorize/token到達なしのassertとcleanup。static reviewで追加P1/P2を確認しなかった。synthetic prompt diagnosisを公開OAuth PASSへ変換しない。

先行public OAuth driverの`:20–23` はlogin前にstdin/stdout/stderr TTYを要求、`:54–68` は本人visible terminalへnative入出力を渡し、driver自体はtoken/codeをserializeせずowned childへtimeout/cancelを行っていた。当時のTTY/timeout対策だけでは設定leaf問題は閉じなかったが、現在は末尾のsafe file helper/caller修正でR6解消済み。paid model契約の欠如だけを標準MCP OAuth不可の理由にしない。

main統合後の最終source commit/CIと実公開receiptは後段gate。R5の新hash・全member Git index一致とR6修正は独立確認済みで、今回も現在のR6 helper/driver hashが解消確認時と一致した。公開後は実GET/ダウンロードhash/タグ等を配布receiptで閉じる。公式Docsは親によるfresh public sourceRevision統合と実route/browser確認が別gate。OpenAIの本人確認・domain・reviewer/test cases/demo/scan/提出/承認、Grokのtrue host導入、Muse公開OAuthと両候補model/Human、Codex trusted hookの実root turn/flags/once-per-input、refresh/revoke/reconnect/shared identity選択は残る。新契約や追加課金を要求しない。

## R6最終source gate（2026-10-10）

再確認時のHEADは `6b7b3fba5599474c66aa5cee795237e89c5b17fd`、修正helper/caller/testsはworktree差分を含む。親から初回PR64 CI SUCCESSと、修正後root518/518＋tsconfig.node strict PASSの報告を受領。後続main統合/最終CIの承認を先取りしない。

現在の具体的根拠:

- `tools/guilduo-muse-safe-files.mts:6–20` はowned QA子path/全祖先を検査、`:23–31` はregular/nonlink/nlink=1を確認、`:35–37` はwx新規作成、`:41–55` は同一directoryのwx一時file→末端再検査→rename→cleanup。
- `tools/guilduo-muse-public-oauth.mts:33` / `:47` のsettings/readyは新規作成に固定。`:50–53` はnative起動前のready/settings/receipt検査、`:72` はreceipt安全置換。
- diagnostic/native/schema/archive/freezeの自作output callerも同helperを使用。diagnosticのsettings/receiptは `tools/diagnose-guilduo-muse-oauth.mts:66` / `:90`、nativeの設定/ログ/固定receiptは `tools/verify-guilduo-muse-native.mts:27` / `:36` / `:89` / `:174`、schemaは `tools/verify-guilduo-grok-schemas.mts:28` / `:35`、archive receiptは `tools/verify-guilduo-grok-muse-archives.mts:38`、freezeは `tools/freeze-guilduo-grok-muse.mts:108`。
- `tests/plugin-grok-muse.test.ts:116–151` は実symlink/nlink=2 hardlinkのsettings/ready/login/diagnostic receipt拒否、sentinel不変、既存regular保持、安全receipt更新/temp清掃を検査。B受入文書は14/14とstrict型検査PASSを記録。レビュー担当は実FS回帰を再実行していない。

独立再確認では修正後の実helper＋実public driver＋実環境helperをVM/メモリFSで評価した。prepareのsymlink/hardlink/既存regular settings/リンク祖先の4ケースはnative前に拒否されsentinel不変。receiptのsymlink/hardlinkはtemp作成前に拒否、regular receiptはwx temp/rename/cleanup成功。実FS書込み0・実native0。元の再現経路は閉じたため**R6を解消、source候補GO**とする。悪意ある別processによるdirectoryの同時交換まで防ぐrace-proof filesystem sandboxは主張しない。

検査済み現在SHA256: helper `b577101c4f995ce4d58456313bf76828152365d86ce140e42f2371174568946f`、public driver `8202e518d4e1c1195668b94a4587daca9965d873c25a1a90f405144203d8e505`、diagnostic `4c12eec3732893c69e307e70281f4e003c8841fca1f8d028f104ebeb917a66e4`、回帰test `dcf3566a71b969a74e77659a7928c02e5553e319ee6a2ea049c94d8a7de8f06e`。4公開ZIPの上表hashは修正後も独立に再確認して不変。保護対象Git差分は起点SHAからも空。

親の追加native結果: 最終App cache13memberはsource一致、default native skills/listはexactly one enabled canonical/errors[]。hook3は新byteによりmodified/untrustedでtrust迂回なし。導入・重複防止確認として記録し、trusted hook実行PASSにはしない。本人profile/private receiptはレビュー担当が読んでいない。
