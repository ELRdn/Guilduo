# Guilduo Grok Bot / Muse Code beta.12候補の受入記録

確認日: 2026-10-10。対象source: public main `5e8f66e` を起点とする `codex/guilduo-next-hosts`。これはAIによる実装・検査記録で、人間の独立auditやhost運営者の承認ではない。

## 判定

| 境界 | Grok Bot | Muse Code |
| --- | --- | --- |
| package | portable `plugin.json` + `mcp.json` + canonical Skill、0.6.0-beta.12 | native `.muse-plugin/plugin.json` + canonical Skill、0.6.0-beta.12 |
| lifecycle hooks | なし | なし |
| native install / discovery / update / disable / enable / remove | 未受入。実ホスト未導入、利用資格なし | Windows stable 1.4.4-R5419.1で現在の候補を実測PASS |
| native OAuth | 未受入 | 公開標準loginの今回試行は失敗・未受入。本人に認可ページ未表示、失敗段階未確定。headless手順のみ準備済み |
| 公開MCP read / narrow write / Human再開 / shared Agent選択 | 未受入 | 未受入 |
| source / ZIP distribution | 候補。公開操作は親担当 | 候補。公開操作は親担当 |
| upstream listing | Cursor catalogはstatic検査のみ。tested-locally条件未達で提出保留 | custom source配布の公式guideあり。中央公式listingの経路は確認できない |

**GOは候補packageと無料で行えるローカル検査まで。両ホストの接続・model・Human受入を完了扱いにしない。** 新しい有料契約、課金登録、API/model呼出しをこの検査の必要条件にしない。利用資格がない受入は明示保留する。候補の公開可否は親とユーザーが決める。

## 現在のsourceと再現コマンド

- [Grok source](../../plugins/guilduo-grok/README.md)、[日本語](../../plugins/guilduo-grok/README.jp.md)
- [Muse source](../../plugins/guilduo-muse/README.md)、[日本語](../../plugins/guilduo-muse/README.jp.md)、[設定merge例](../../plugins/guilduo-muse/settings.example.json)
- [Grok用monorepo catalog](../../.cursor-plugin/marketplace.json)
- [対象限定freeze](../../tools/freeze-guilduo-grok-muse.mts)、[native CLI検査](../../tools/verify-guilduo-muse-native.mts)、[隔離環境](../../tools/guilduo-muse-native-env.mts)
- [OAuth本人操作driver](../../tools/guilduo-muse-public-oauth.mts)、[対象tests](../../tests/plugin-grok-muse.test.ts)

共有prepare/archive interfaceを利用し、Grok/Museだけを生成・freezeした。全host runner、root依存関係変更、npm公開、Git変更、別repository作成は行っていない。source packageは各11ファイル。正本 `skills/guilduo-workflows/`、LICENSE、iconのbyte一致、閉じたwhitelist、symlink/junction/hardlink拒否を確認する。READMEのローカルpath逸脱とcredential形状も拒否する。Museのuser-settings例は導入されるMCP capabilityではなく、利用者が独立設定へmergeする資料である。

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/plugin-grok-muse.test.ts
node node_modules/tsx/dist/cli.mjs tools/freeze-guilduo-grok-muse.mts
node node_modules/tsx/dist/cli.mjs tools/verify-guilduo-grok-muse-archives.mts
node node_modules/tsx/dist/cli.mjs tools/verify-guilduo-muse-native.mts
# archive containerだけを再freezeした場合の最終payload smoke:
node node_modules/tsx/dist/cli.mjs tools/verify-guilduo-muse-native.mts --smoke
```

現在のtarget testsは11/11 PASS。対象tools/testsのstrict型検査もPASS（`tsc --noEmit --ignoreConfig --strict --target ES2022 --module ESNext --moduleResolution Bundler --types node --allowImportingTsExtensions --skipLibCheck` で対象を指定）。typesの全体検査では別担当の `tests/plugin-hooks.test.ts` と `tools/verify-guilduo-codex-host.mts` に型エラーを観測したため、この記録では全体PASSを主張しない。

公開前のP2修正: native環境helperはHOME等だけでなく `workspace` / `config/muse` / `logs` の全利用directoryと祖先を、最初のmkdir前にpreflightする。mkdir前後にも再検査する。これら3箇所の既存Windows junctionを拒否し、profile外のsentinel設定byte不変・未作成homeが未作成のままであることをregressionで確認した。既存profile内の子directoryを経由するsettings write escapeを防ぐ修正で、source plugin/凍結ZIPは変更しない。

[公式schema検査driver](../../tools/verify-guilduo-grok-schemas.mts)はAgent Plugins 1.0.0のplugin/MCP schemaを現在取得し、draft2020-12でGrokの両JSONを検査、未知propertyのnegativeも拒否した。receipt: `.qa-artifacts/guilduo-next-hosts/grok-muse/official-schemas/receipt.json`。schema SHA-256はplugin `0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883`、MCP `6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb`。これはGrok/Cursor native受入ではない。

## Muse最新版の取得・実測

[公式stable channel](https://api.meta.ai/muse-code/channels/muse-stable)が `1.4.4-R5419.1`、state `public` を返した。[そのversionの公式manifest](https://lookaside.facebook.com/lookaside/muse/download/?channel=muse&version=1.4.4-R5419.1&file=manifest.json)に基づいてWindows binaryを隔離QAへ取得した。installer/launcherは使わず、bare exeだけを起動した。

- Windows binary: `muse-x86-windows.exe`、463,368,952 bytes
- SHA-256: `5caacb02eea2734405786e50cb42aeea3eeb46b4fa9801cfa666cda225101749`。公式checksumと実bytesが一致。
- native `--version`: `Muse Code 1.4.4 (1.4.4-R5419.1)`
- manifest MSP fingerprint: `sha256:7c94f153c41659cb3f1bd3c3e04438be254644cb2a97d65d48edc7449b74858a`
- receipt: `.qa-artifacts/guilduo-next-hosts/grok-muse/native-1.4.4-R5419.1/download.json`
- lifecycle receipt: `.qa-artifacts/guilduo-next-hosts/grok-muse/native-lifecycle-receipt.json`
- 最終portable archive smoke: `.qa-artifacts/guilduo-next-hosts/grok-muse/final-native-smoke-receipt.json`

凍結ZIPを展開して全memberのhashを照合し、そのpayloadを `plugins validate/install` した。native family、Skill ID `plugin:guilduo-workflows:guilduo-workflows`、hooks/MCP capabilityが空、active stateを実測した。update fixtureは最終payloadのmanifest versionだけをbeta.11にして同じlocal sourceをbeta.12へ戻すもので、過去の公開beta.11や旧hostの受入証拠ではない。最終immutable展開payloadの再installも独立確認した。

別plugin `qa-unrelated` を先に導入し、Guilduoのdisable/remove後もそのSkillとinspection全体を保持した。別のdisabled MCP entryの設定値は全lifecycle command後にdeep equalityで確認した。**native remove等でsettings JSONが再整形されるため設定byte不変は未達、設定値保持がPASS**。最終検査profileのplugin storeは空。未完了driver調整のprofileはPASS receiptとして扱わない。

native validateはauthor/homepage/repository/licenseがruntimeで未使用というwarningを返すが、Skill capabilityはsupported、validationはvalid。これは無効manifest・認証成功・runtime機能追加を意味しない。

環境は所有QA配下のHOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG/config/data/cache/temp/CODEX_HOMEに固定し、system command lookupに必要なキーだけ引き継ぐ。provider/API keyや個人Skill/profileはimportしない。各native commandは25秒timeout、automatic retryなし、modelCalls 0。

### 実settingsの境界

[公式Web extending](https://dev.meta.ai/docs/muse-code/extending)は `mcp_servers`、native `mcp --help`は `mcpServers` と記載する。1.4.4本体の `mcp login qa_schema --headless` を閉じたloopback portに向け、認証tokenを発行せずに設定解決を検査した。

| fixture | 本体の現在の結果 |
| --- | --- |
| `schema_version:1` + `mcpServers` + `mode:optional` | entryを認識、OAuth HTTP送信段階の接続失敗まで進む |
| 同じentryの `mcp_servers` 単独 | 同じ認識結果 |
| 両alias併記 | MCP configuration faulted、login拒否 |
| `mode:all` | entryは利用されずlogin拒否 |

したがって導入例は `schema_version:1` + camelCase `mcpServers` + `transport:streamable_http` + `mode:optional` に固定し、alias併記を案内しない。enterprise defaultsの `config validate` はuser flat settingsのschemaではないため、そこでのエラーをuser設定の不支持と解釈しない。

### 公開OAuthの本人操作

profileは `.qa-artifacts/guilduo-next-hosts/grok-muse/public-oauth-1.4.4-R5419.1/`、settingsはその `config/muse/settings.json`、server名は `questforge`、endpointは `https://mcp.guilduo.com/mcp`。nativeは最新版で候補Skillを導入済み。親がこのprofileを使用し、実account consentを確認する。

```powershell
# 本人の見えるPowerShell/Windows Terminalで実行。prepareを再実行して上書きしない。
node node_modules/tsx/dist/cli.mjs tools/guilduo-muse-public-oauth.mts login
# 本人がheadless方式を選ぶ場合のみ、本人terminalで行うfallback。自動再試行しない:
node node_modules/tsx/dist/cli.mjs tools/guilduo-muse-public-oauth.mts login-headless
# 切断も同じnative profileで行う:
node node_modules/tsx/dist/cli.mjs tools/guilduo-muse-public-oauth.mts logout
```

通常の `login` は本人の見える対話terminalでnative `muse mcp login questforge` を起動する。nativeの `Press Enter to open it in your browser` に本人がEnterで応答し、ブラウザ認可後はephemeral loopbackの自動callbackを使う。通常経路では最終redirectのterminal入力は不要。native helpでは `--headless` がURL表示＋保護された最終redirect入力を選ぶoptionであることを確認済み。[公式guide](https://dev.meta.ai/docs/muse-code/extending)も標準browser loginを案内している。

修正後のdriverは `login` / `login-headless` のstdin/stdout/stderrがすべてTTYであることを、profile操作とnative起動より前に確認する。本人terminalへ入出力を継承し、driverはnative出力・code/token・最終redirectをbuffer/serializeしない。native内部が秘密を絶対にprintしないと未検証の保証はせず、本人terminalのtee/transcriptやtool出力への転送を禁止する。receiptは終了状態・timeout・version等の固定項目だけを保存する。browser起動ができない場合は、本人terminalで明示的に `login-headless` を実行し、最終redirectをnativeの保護されたinputへ入れる。URL/code/tokenをチャットへ入力するよう求めない。loginは180秒上限、owned childのみ終了、retryなし。provider loginや課金を伴う手順ではない。

親の初回headless launchは本人操作用terminalがUI表示されずCtrl+Cで停止した。続く旧driverの通常loginは、親の報告では2026-10-10T13:26:55Zに `exitCode:null` / `SIGTERM` / `timedOut:true` で終了し、本人にMuse認可ページは表示されなかった。安全な分類済みnativeログではsettings読込・設定解決まで確認したが、その先の公開OAuth段階は出力破棄のため確定できない。

現在の1.4.4本体を使った[synthetic診断](../../tools/diagnose-guilduo-muse-oauth.mts)で原因を切り分けた。非TTYは認可URL案内とauthorization待機へ進み、browser起動案内は出ない。stdinをTTYにした比較ではEnterによるbrowser起動promptが出た。旧driverの `stdio:ignore` は非TTY化に加えてURL案内も破棄していたため、本人が操作できる認可導線を失っていた。これは確認済みのdriver問題であり、前回公開loginの全停止原因やMuse/browser自体の欠陥を証明するものではない。

最終診断receiptはQA root配下の `oauth-prompt-diagnostic-1791639277534/receipt.json`（TTY）と `oauth-prompt-diagnostic-1791639313510/receipt.json`（非TTY）。いずれもloopback resource/metadata/registration到達、authorization/token endpoint呼出し0、Enter送信なし、browser起動なし、公開OAuth試行なし、modelCalls 0。native出力は限定したメモリー内で固定booleanへ分類し、raw出力・URL・code/tokenはreceiptへ記録していない。対象型検査と両login modeの非TTY拒否自己検証がPASS、拒否時の既存公開receiptはbyte不変、凍結Grok/Muse ZIPのhashも不変を確認した。

親は修正後driverを本人の見えるPowerShellで開始したが、本人は「認証ページ自体が開かない」と確認した。親が受信した2026-10-10T13:40:15Zのvisible login receiptは `exitCode:1` / `timedOut:false`。今回の公開標準loginは失敗・未受入であり、成功やtimeoutとは分類しない。browser opener、OAuth discovery、PKCE/client登録、authorization endpointのどこで失敗したかは未確定で、非TTY問題の修正だけで公開OAuth成功を推定しない。native出力・code・最終redirectは取得せず、同じlogin/承認依頼を繰り返さない。source/凍結ZIPは公開候補のまま保持する。

#### 本人terminalでの公式headless fallback（手順のみ・未実施）

この方式はCLIのbrowser openerを使わず、本人が端末の認可URLをブラウザーで開く。discovery/client登録やauthorization endpointの失敗まで回避できる保証はない。本人がこの方式を選ぶ場合に限り、次の順で行う。今回の更新で実行・追加の許可依頼はしない。

1. 前のnative loginが終了した状態で、本人が見えるPowerShell/Windows Terminalを使う。既存公開profileは上書きせず、tee/transcript/出力リダイレクトを使わない。
2. 下記driverを起動する。isolated envと同じ `questforge` 設定はdriverが適用し、native実コマンドは `muse mcp login questforge --headless`。180秒上限で、自動再試行はない。
3. nativeが本人terminalへ表示する認可URLを、本人がブラウザーで開く。URLが表示されない場合はそこで失敗・未受入とし、同じ承認依頼を繰り返さない。
4. ブラウザーで認可後、localhostへ到達できないページになることがある。アドレスバーの最終localhost redirect URLを、本人がnativeの `Paste the final localhost redirect URL here` の保護入力（echo off）へ直接貼り付ける。チャット・ログ・receipt・archiveには渡さない。native終了状態を確認し、成功後の認証付きread/refresh等は別の受入gateとして扱う。

```powershell
Set-Location 'C:\Users\hiron\.codex\worktrees\guilduo-host-extensions\questforge-relay-forge'
node node_modules/tsx/dist/cli.mjs tools/guilduo-muse-public-oauth.mts login-headless
```

このfallbackは現在の1.4.4 `mcp login --help`が説明するURL表示と保護redirect入力の方式であり、本人端末の操作は未受入。標準loginの失敗原因が未確定という制限も残る。

OAuth consent、native保存、refresh、revoke/reconnectはまだ現在の公開PASSではない。隔離loopbackでの設定解決も公開接続の代替証拠にならない。model/Human受入は利用資格と別の明示的許可を要し、現taskでは呼び出さない。

## Grok / Cursorのdistribution境界

[Cursor reference](https://cursor.com/docs/reference/plugins)に基づくroot `plugin.json` / `mcp.json` / Skillと、repository rootの `.cursor-plugin/marketplace.json` を用意した。catalogは `plugins/guilduo-grok` のみを指し、Claudeや他hostのcatalogを変更しない。[Agent Plugins compatible clients](https://agent-plugins.org/compatible-clients)はGrokのSkillとMCP transport対応を示すが、任意のZIP/local import受入を証明しない。

[Grok get-started](https://docs.x.ai/grok-bot/get-started)は対象Cursorまたは連携SuperGrok accessを要求する。[Team Bots](https://docs.x.ai/grok-bot/team-bots)のcustom remote HTTPS/OAuthは各利用者のaccountで接続する。[personal Bots](https://docs.x.ai/grok-bot/bots)もあり、今回Team Botは必須ではない。本人は現在Grok未使用・有料契約なしなので、実ホスト・OAuth・modelを実行せず保留する。

提出可能な公式経路は既存public Git repository → [Cursor Publish](https://cursor.com/marketplace/publish) → manual review。referenceのtested-locally条件が未達なので今回提出しない。Cursor validatorをGrok受入に流用しない。catalog作成とschema検査は掲載承認・Grok Marketplace表示を意味しない。

Museは[公式native plugin CLI](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/)のlocal directory経路を実測した。[custom marketplaces/updates guide](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/marketplaces-and-updates/)はDeveloper Previewで、stable1.4.4の全機能を保証する文書ではない。中央公開listingや追加mirror repositoryは今回作らない。[plugin MCP制限](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/mcp-servers/)に従い、OAuthはnative user settingsへ分離する。

## 権限と残るgates

導入・OAuthはAgent自動登録やQuest-write許可ではない。`get_agent_link` → `list_registered_agents` → 専用接続のowner-approved既存Agent `link_agent` → `get_current_agent_context` の順に確認する。Free 2 Agentsを守る。共有接続はallowedAgentIds/requiresAgentSelectionを確認し、humanが指定した `actingAgentId` をread/preview/writeすべてに保持し、共有接続をrelinkしない。

残る条件は、Grokのtrue host install/discovery、両hostの公開OAuth・native refresh/revoke/reconnect・認証付きread、許可されたnarrow write/readback、実保存Human回答からのsame-session再開、shared identity選択、source/ZIP公開判断、official listingである。新しい契約を要求せず、資格がないmodel依存の受入は明示保留する。packageはbeta版を維持し、通常利用全面受入や正式安定版とは案内しない。

過去のMuse stable1.4.3-R5018.1 synthetic OAuth/native検査は歴史的参考に限り、この1.4.4 PASSを代用しない。今回の証拠をOpenAI/Codex/Claudeや既存DSH/OpenCode/OpenClawの受入へ横展開しない。

## 最終archive

共有generatorの1.4.4 baseline変更後、Grok/Museだけを再prepareした。生成runtime manifest/MCP/Skillはpersistent sourceと一致し、候補READMEは日英のhost固有手順を用いる。共有archive helperは変更せず、対象限定freezeでvalidated whitelistを明示的な `/` member名へ再encodeした。ZIP timestampは2000-01-01固定で、Skill/runtime/source bytesは変更していない。archive receiptは `.qa-artifacts/guilduo-next-hosts/grok-muse/frozen/archives.json`、全memberとsource/canonical bytesの照合receiptは同じdirectoryの `byte-verification.json`。

| 対象 | 最終ZIP path（QA rootからの相対） | bytes / files | SHA-256 |
| --- | --- | --- | --- |
| Grok | `frozen/grok/guilduo-workflows-grok-0.6.0-beta.12.zip` | 32,063 / 11 | `e686588f4d02ea299066a95ec3d1f7d2bf1bdcf57ebcaf1513937399b65d99f0` |
| Muse | `frozen/muse/guilduo-workflows-muse-0.6.0-beta.12.zip` | 32,913 / 11 | `34cec2b38c577b30daa7b43037d3d3cb57e570027fb30dcc52f3fc3bdb11d009` |

QA rootは `.qa-artifacts/guilduo-next-hosts/grok-muse/`。最終Muse hashのZIPも1.4.4本体で展開、native validate/install/inspect/Skill discovery/removeがPASS、store空、設定値保持、modelCalls 0。全lifecycle PASSは初回Windows containerから展開した同じpayloadに対する検査で、最終containerのhashとの区別は両receiptに記録する。旧hashのreceiptを最終ZIPの直接検査と偽らない。

このfreezeは公開・提出ではない。親が配布を選ぶ場合は、上記immutable候補と受付前のgatesを明示する。native profile・browser・credential・binary・QA logsをpackageやsource公開へ混ぜない。
