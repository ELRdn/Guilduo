# Muse stable acceptance evidence — Guilduo beta.10

2026-10-10移行注記: 本票の `questforge-workflows` と `plugin:guilduo-workflows:questforge-workflows` は当時の旧Skill名・installed nameの履歴。旧配布物・hash・native票は保持し、新名 `guilduo-workflows` で検査した結果へ読み替えない。現行参照と更新方法は[最小移行契約](guilduo-workflows-migration.md)。

確認日: plugin受入2026-10-06、最新OAuth source照合2026-10-07（JST）。**公式Windows `Muse Code 1.4.3 (1.4.3-R5018.1)` で、最終pack済みの実生成base／hooksを無変更のまま受入検証した。** ZIPと全入力hashが一致し、両版のvalidate、install、inspect、Skill discovery、removeが成功。前回のbound Stop／各guard／disable・enable／cache更新の実runtime証拠も保存した。native headless OAuthは、**P0 Auth修正後の現在Workerでも実PTY・合成loopback人間認証によるtoken交換／logoutに成功**。pipe driverの入力timeoutは別記録として保持し、Museの不具合とは扱わない。

## 本体・入力・隔離

- [公式stable channel](https://api.meta.ai/muse-code/channels/muse-stable)と[release manifest](https://lookaside.facebook.com/lookaside/muse/download/?channel=muse&version=1.4.3-R5018.1&file=manifest.json)からWindows x86本体を1回取得。450,299,128 bytes、SHA-256 **`dd510f8144d9fbc518f0c86a3a29ce7142600dc4ee6ec967731aab913e32e26b`** をmanifestと照合してから実行した。取得証拠は `native/download.json`、本体は `native/muse-x86-windows.exe`。
- 取得前D:空き130,884,026,368 bytes、利用者承認上限550 MiB。今回追加binary取得なし。
- 直接渡した最終実生成物は `.qa-artifacts/guilduo-plugin-muse/plugin`（`0.6.0-beta.10`）と `.qa-artifacts/guilduo-plugin-muse-hooks/plugin`（`0.6.0-beta.10.hooks`）。**QAによるmanifest／wrapper／Skill／helperのpatchは0件**。`actual-inputs.json` に最終全ファイルhashを記録。前回のhash・合格summaryは `accepted-pre-final/`、実runtime logs 054–096は元のまま保存。
- 両者は `.muse-plugin/plugin.json` のみをmarkerとし、canonical `questforge-workflows` Skillを保持、MCP宣言なし。hooks版はnative argvと別々のSessionStart／Stop wrapperで、shared `lifecycle.mjs` のコピーもcanonical sourceと一致した。
- [公式CLI reference](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/)のXDG controlsと[設定仕様](https://dev.meta.ai/docs/muse-code/configuration)を確認。bare exeのchildへPATH／COMSPEC／PATHEXT／SystemRoot／WINDIRだけを引き継ぎ、HOME／USERPROFILE／APPDATA／LOCALAPPDATA／XDG data/config/cache／TEMP／TMPは所有QAの `native-profile/` に設定。空stdin、30秒timeout。
- 実storeは `native-profile/data/muse/plugins/`、settingsは `native-profile/config/muse/settings.json` の `{"schema_version":1}`。OAuthだけは別の空 `native-oauth-profile/`／`native-oauth-profile-pty/` を使用し、終了後にsettingsを同じ最小形へ戻した。installer／launcherは実行なし。利用者account／provider／credential／browser profileのimport、global install、Git変更なし。

## 最終packとの照合

親担当の `.qa-artifacts/guilduo-plugin-packages.json`（生成時刻 `2026-10-06T14:33:44.199Z`）に記載された両ZIPのsize／SHA-256、およびZIP内全ファイルと現在の実outputが一致。前回受入からの変更は両版の `README.md`／Skill `references/local-hooks.md`、hooks版の `hooks/README.md` のみ。**manifest・Skill本文・wrapper・lifecycleはbyte一致**。

| 最終版 | ZIP SHA-256（配布artifact） | native package digest（展開内容） |
| --- | --- | --- |
| base、28,930 bytes／9 files | `55f3b965aa6fe74d2b2973ea12fe787997c356f1d95f9d797199c86371baf2be` | `3c33def982f2545f4d5d2a4c4baabaf70727f0a75b30de2d9780699e059f24dd` |
| hooks、34,779 bytes／13 files | `d247574bb7f6fd6333f23ea0a9740c9ea96fc6793b09b09a045130c926f0cbc5` | `3096a062b2fdc230f80373fe37e2d4cd4937fa65071855a820895f69db5fe082` |

最終入力から両版をvalidate→install→list→inspect→Skill discovery→remove。hooks版ではSessionStart contextと未bind Stopも再確認し、最後のstoreは空。記録は `final-pack-reconciliation.json`、`final-native-validation.json`、logs 111–126。bound Stop／各guard／disable・enableとcache更新は、runtime byte一致を確認した前回入力の実測として区別して保持する。

## 実生成物のnative本体結果

| 項目 | 実測結果 |
| --- | --- |
| base／hooks validate | 両方exit 0、valid=true、manifest_family=native。marker競合なし |
| portable metadata | author／homepage／repository／licenseは各 `unsupported-field` **warning**（runtimeで未使用）。拒否やerrorではなく、install成功。公開metadataとlicenseを保持できる |
| base install／list／inspect | `0.6.0-beta.10` を実output pathからinstall、active=true、hook 0件 |
| base／hooks Skill discovery | `skills list --source plugin --json` とinspectで `plugin:guilduo-workflows:questforge-workflows` を確認、activation=on |
| hooks install／inspect | `0.6.0-beta.10.hooks` を実output pathからinstall。`session-start`／`stop` 各1件、timeout 3000／10000 ms、初期status=`review_needed` |
| SessionStart fixture | contextとinstalled helperのbinding／unbinding CLI引数を本体が取得、effects=`context` |
| 未bind Stop | should_block=false |
| bound Stop | 実installed helperでfixture bind後、should_block=true、status=`blocked`、effects=`blocked` |
| Stop抑止 | recursion=true、recursion flag欠落、Plan、read_only=true、別session、cwd不一致、unbind後はすべてshould_block=false |
| disable | record.enabled=false、active=false。Guilduo Skillがcatalogから消え、hook testは `plugin-hook-test-failed` で実行を拒否 |
| enable | bound Stopのblock効果が復帰。disable／enableでbindingを勝手に変更しないことを確認 |
| remove --delete-data | plugin／cache／fixture binding dataを除去。最終plugins listは空、Guilduo Skillも消失。本体bundled Three.js行は別物 |

hook testは[公式reference](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/)どおりapproveなしでも実行できた。通常sessionのhook trust承認は行っていない。fixture IDは `fixture-muse-native`／`fixture-quest`／`fixture-agent` で、実Quest／Agentではない。

## `.hooks` とnative CLI cache更新

1. **別sourceの切替:** baseをinstallした状態で別directoryの実hooks outputをinstallするとexit 1、`invalid-plugin-package`: **`plugin guilduo-workflows is already installed from a different source`**。`plugins update` は保存されたbase sourceを読み直すのでhooksへ切り替わらない。別outputへの切替はremove→installが必要で、この手順で実hooks版を受入した。
2. **同一sourceのbase→hooks:** 所有 `native-cache-update-source/` に実base出力をbyte一致コピーしてinstallし、同directoryを実hooks出力のbyte一致コピーで置換して `plugins update`。payloadのpatchなし。versionは `.hooks` に更新、package digestとcache pathが変わり、2件のhookが現れた。source provenanceは同じpath、hooksは `review_needed`。
3. **内容不変のupdate:** 実hooks outputの内容を変えずにupdateすると同じdigestを維持した。native CLIの更新経路は実測できたが、Claude hostのversion-only cache問題までMuseにもあるとは主張しない。

前回のcache更新検証時digest: base **`a74fa530c6a75a7948e536502dbfb2db38f8a6af669c2c69ad562685fa72ad1b`** → hooks **`af5ccb4c6c9b6996e7474b987acf76bd2063f9a00295703a2eb486c20ba92997`**。最終pack digestとは異なる。コピー元全file hashは `cache-update-input-base.json`／`cache-update-input-hooks.json`。cache更新テストもremove済み。

## 契約・過去の不具合・OAuthの境界

- [hook events／env契約](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/hook-events/)の `decision: block`＋reasonと再帰抑止を実hooks版で確認。今回モデルturnは起動せず、実モデルがその後継続・終了する挙動は未検証。
- 前段native診断hookで `MUSE_PLUGIN_ROOT`／`MUSE_PLUGIN_DATA_DIR` と `PLUGIN_*`／`CLAUDE_PLUGIN_*` のalias一致を観測した。保存先は `native-profile/environment-observed.json`。fixtureでは実sessionがないため `MUSE_SESSION_ID`／`MUSE_THREAD_ID` は欠落。実top-level／subagentの注入は未検証。
- 旧Claude互換生成物のskills型拒否と、Windowsのquoted `node -e` が空出力／exit 0になる再現は、親担当のnative manifest／argv wrapperへの変更後、**実生成物で解消を確認**。過去のQA修正候補は最新受入の根拠に使わない。旧記録は `native-prepatch-validation.json` とlogs 001–053、今回実生成物はlogs 054–096。
- native CLIは **`--headless`**（browserを開かずfinal redirect URLを入力）、`--oauth-client-id`、`--scope`、`--callback-port` を提供。help記録はlogs 097–098。[公式利用者ガイド](https://dev.meta.ai/docs/muse-code/extending)もheadless OAuthを記載。
- [plugin MCP制約](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/mcp-servers/)はDeveloper Preview。生成物にMCP／OAuth／Authorizationを追加しない境界を維持。モデル呼出し、実account login、実資格情報、公開・publishは0件。

## 任意のnative headless OAuth試行と設定上の注意

`native-oauth-fixture.mts` は親の `tools/verify-guilduo-mcp-candidate.mts` と同じloopback HTTP adapter／mock Appwrite account方式で、**現在のWorker OAuth実装**を無変更で使用した。Worker envは隔離memory storeとfixture endpointのみ。過去にpipe・実PTYを各1回、今回P0 Auth修正後に既存PTY profileで1回再実行した。**各30秒上限、累計login試行3回／token交換成功2回、今回のlogin試行1回／成功1回**。logoutのみのcleanupはlogin試行に数えない。scopeは `quests:read agents:read`。custom OAuth bridge／独自OAuth client／実資格情報／ブラウザは使用していない。今回plugin再install／全fixtureの再実行はなし。

各試行でnativeがresource／issuer metadataを取得し、DCR `POST /oauth/register` は201。生成URLはS256 PKCEと指定scopeを保持。Worker `GET /oauth/authorize`、mock account確認、`POST /oauth/approve` は各200で、stateを照合した合成redirect URLを得た。

- **pipe driver:** URLをpiped stdinへ送っても `Paste the final localhost redirect URL here:` のまま30秒待ち、SIGTERMで終了。`/oauth/token` は0件。記録は `native-oauth-validation.json`。このQA入力経路のtimeoutは、Muse Windowsの不具合やclientのtoken交換失敗を立証しない。
- **実PTY:** `exec_command tty:true` のstdinをnativeへ継承し、同じheadless手順のredirect URLをPTYへ入力。nativeは **`Logged in to MCP server`** と表示しexit 0、`POST /oauth/token` は200。grant=`authorization_code`、PKCE verifierあり、resource一致、token応答ありを確認。記録は `native-oauth-pty-validation.json`。callback HTTPやブラウザへ遷移せず、CLIが指定するheadless入力を使用した。
- **過去の後片付け:** 最初のPTY試行では同期logoutがfixture event loopを止めてtimeoutした。QA driverの問題で、後続の非同期cleanupでcredentials削除／未保存を確認した。旧source hash付きPTY結果とcleanupは **`accepted-before-p0-authfix/` に元のまま保存**。元fixture終了後の旧cleanupを、今回の同一storeでのlogout証拠として使わない。
- **今回の後片付け:** token交換と同じ生存中のWorker memory storeで **`POST /oauth/revoke` 200**。native logoutはexit 0でcredentials削除、再度logoutもexit 0で **`No OAuth credentials are stored`**。`native-oauth-pty-cleanup.json` は今回のsource hash付き結果から記録し、`originalFixtureMemoryEnded:false`。settings復元・一時redirect削除も完了。D1等での永続Disconnect／refresh guardの機能受入は、このmemory fixtureだけでは主張しない。

最新実行は `2026-10-06T15:14:06.125Z`–`15:14:25.974Z`（JST 2026-10-07）。`native-oauth-current-source-alignment.json` で実行前snapshot／本体結果のsource hash／現在ファイルの一致を確認した。P0修正のAccess latest-family matching／durable Disconnect marker／refresh guardを含むsourceへの照合であり、今回の検証動作はnative code交換／logoutに限定する。

| 現在Worker source | 最新PTY実行のSHA-256 |
| --- | --- |
| `worker/src/oauth.ts` | `9dde0fec030241c654f283fdb06ea88c4d38620fcb87ac12f7dd71ba3b0ab307` |
| `worker/src/security.ts` | `2fdd2c37c1453983052917cc8638068d8bcd4b6755e65d85c30145bf304a9a0f` |

`index.ts` と親HTTP verifierのhashは旧PTY実行から不変。変更された2sourceと過去のhashはalignment記録に保存。親担当のD1／SDKHTTP／全体テストの結果は別の受入証拠として扱い、このnative helperで再検証したとは記さない。

両profileのsettingsを `{"schema_version":1}` へ戻し、fixture server／native childを終了、一時redirect fileを削除。adapter失敗／Workerの非fixture outboundは0件。証拠にはnative出力、tokenを含まないwire記録、参照source hash、boundaryを保存。**nativeの合成OAuth code交換の受入**であり、公開OAuth、人間の実Google/Appwrite認証、authenticated MCP session／tools discovery／refreshは今回未検証。

最小推奨はnative pluginを `muse plugins install <展開済みplugin directory>` で導入し、settingsは変更しない構成。hooks実行にはNodeがPATHで必要で、通常sessionのtrust承認は別途必要。実manifestは `schemaVersion:1`、`.muse-plugin`、`capabilities.skills`／`capabilities.hooks` を使用。実wrapperは `command:["node","hooks/session-start.mjs"]`／`["node","hooks/stop.mjs"]`、wrapper内部でSessionStart／Stopをargvへ追加してshared helperをimportする。

実出力の参照: [native manifest](../.qa-artifacts/guilduo-plugin-muse-hooks/plugin/.muse-plugin/plugin.json)、[SessionStart wrapper](../.qa-artifacts/guilduo-plugin-muse-hooks/plugin/hooks/session-start.mjs)、[Stop wrapper](../.qa-artifacts/guilduo-plugin-muse-hooks/plugin/hooks/stop.mjs)、[shared lifecycle](../.qa-artifacts/guilduo-plugin-muse-hooks/plugin/hooks/lifecycle.mjs)。OAuth fixtureが呼ぶsourceは [Worker OAuth](../worker/src/oauth.ts) と [account verifier](../worker/src/security.ts)。

将来settingsのMCPを使う場合は **`schema_version:1`＋`mcpServers`（camelCase）** が今回nativeで読まれた形。公式Web guideの `mcp_servers` 表記と本体help／本体bundled `migrate` referenceに差がある。bundled referenceは両表記の併記でMCP member全体がdropされると明記するため、併記を勧めない。このalias競合自体は今回実測していない。

## 証拠・検証・残るゲート

[所有QA記録](../.qa-artifacts/guilduo-muse-host/)の `native-validation.json` が最終統合結果、`actual-inputs.json` が最終実入力hash、`accepted-pre-final/` が前回plugin実入力の合格証拠、`accepted-before-p0-authfix/` が旧sourceのPTY／cleanup証拠、`native-profile/logs/*.json` が引数・exit・stdout・stderr。`python .qa-artifacts/guilduo-muse-host/check-native-evidence.py` は最終ZIP／入力hash、native metadata／discovery／fixture効果、過去のdisable・enable／cache更新、pipe timeout、最新PTY OAuth成功／current source照合／同一fixture logoutをassertして成功。helper 17項目成功は前回最終入力のNode検証として保持し、今回は再実行していない。

最終pack済み入力の無モデルplugin受入とnative合成OAuth code交換にblockerはなし。残るゲートは**実人間のaccount認証、native authenticated MCP session／tools discovery／refresh、実モデルsession／subagent、実Quest更新**。文書更新のみの最終再生成と、過去に実fixtureで確認したruntime挙動の根拠を分けて保存した。
