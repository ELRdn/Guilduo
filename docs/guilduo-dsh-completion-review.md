# Guilduo DSH beta.17 独立完了評価

後続方針: 本人依頼でDSHのnpm `latest`もbeta.17へ昇格し、3プラグインはブラッシュアップ段階へ移行した。以下は評価時点の記録。受入範囲は維持し、最新のタグ・公式Docsは[現行評価](guilduo-plugins-completion.md)を参照。

確認日: 2026-10-10。担当: Darwin（独立AIレビュー）。外部の人間による監査・公式認定ではない。対象は Windows / DSH 0.2.0-rc.2 の保守候補 `@guilduo/dsh-oauth-poc@0.6.0-beta.17`。実装・受入・配布を別々に評価する。

**判定: R1・R2・R3の保守修正と固定配布物を承認。今回の範囲で未解決のP1/P2公開阻害事項は認めない。公開ワークフロー全体の完成判定は保留。**

| ゲート | 判定・証拠の境界 |
| --- | --- |
| 保守実装 | PASS。source/libレビュー、90/90 package tests、型検査、rootの2テストを独立に実行。到達可能なcontrol競合も合成RAMで確認。 |
| 最終配布物 | PASS。最終tgzの32通常ファイル、全memberのworktree一致、canonical Skill・LICENSE一致を独立確認。 |
| native Windows受入 | 合成認証・限定ホスト受入はPASS。安全な既存receiptの確認と親の実行報告であり、reviewerがnative OAuth/モデルを再実行したものではない。 |
| 公開実環境受入 | 部分受入。beta.16本人報告を履歴として扱い、beta.17の直接公開OAuth、guarded更新、Human/Handoffの受入には流用しない。 |
| source PR / CI | 親の通知: commit `caa0dd4`、draft PR #57、archive 32/32 commit bytes一致。Git操作・commit blobの独立再取得はしていない。CIは別ゲート。 |
| npm公開・公開取得 | 未完了。親のdry-run PASSを確認済み通知として扱う。実公開receipt・公開取得物一致・registry tagsは公開後に記録する。 |

## 固定候補

- archive: `.qa-artifacts/guilduo-dsh/guilduo-dsh-oauth-poc-0.6.0-beta.17.tgz`
- SHA-256: `89414b1ec3d98fa5d1fa7aa3eb0180f1ed59c913b615942bb46844e5fed3c6d9`
- 最終確認でもhash不変。32ファイルすべて現worktreeとbyte一致。親が通知したsource commit: `caa0dd4`。
- tarの安全な相対名・重複なし・通常ファイルのみ・header checksum・manifest whitelistを検証。tests、QA、profiles、node_modules、認証設定は含まない。限定的な秘密鍵/API-key文字列・個人絶対pathの走査も問題なし。任意の秘密値を完全検出する保証ではない。
- canonical `skills/guilduo-workflows/` のSkill・references・metadata、root `LICENSE` と一致。AGPL-3.0-only、NOTICE同梱。ESM entry/types/exportsが存在し、install lifecycle scriptなし。Node >=22、DSH rc.2 / Cordis 4.0.4 / MCP client 2.0.0を固定。
- backend 5 moduleはTypeScript除去後のsource/lib比較で一致。browserは `buildClient(false)` のRAM出力が `lib/client.js` とbyte一致。宣言ファイルの再生成は行っていない。
- READMEのローカルNOTICEとrepo文書リンク先の存在、公式URL方針との整合を確認。remote HTTPの到達性・merge前のmain反映は未確認。
- `.gitignore:9,19` はnode_modulesとQAを除外。ignoreは既追跡ファイルを消さないため、Git staging/commitのprivacy全量保証は親のscope検査に依存する。reviewerはGitを操作していない。

## 修正所見の閉鎖

| 所見 | 現在の証拠・再現条件・判定 |
| --- | --- |
| DSH-R1 / P2: clear失敗の握り潰し | `plugins/guilduo-dsh/src/persistence.ts:105` は不存在またはexact discarded markerだけを冪等成功とし、decode/admission/write失敗をsafe errorで伝播、finallyでstoreを失効する。`src/settings.ts:81` は切断専用の「消去未確認・元会話から再試行」を返す。`src/index.ts:228` はtombstone後のlegacy再試行、`:240` はcompare-deactivate成功時だけclearを行う。wrong-birth、復号障害後の再試行、admission/write障害を `tests/persistence.test.ts:887,903,929` で独立PASS。**修正済み**。失敗時のciphertext残存を「削除成功」と主張しない。 |
| DSH-R2 / P3: restore timeout後の既受信rotation消失 | `src/adapter.ts:103` はretained snapshotを既存store.lockedのadmission内でcommit。`:215` のclose(true)はdurable grantをRAM破棄前に保存。`src/index.ts:148` のtimeoutは保持closeを使う。期限前save、期限後save拒否、rotationで再restore、timeout→disconnect→非復活を `tests/persistence.test.ts:944,971` で独立PASS。**限定修正済み**。未受信のserver responseや永久にsettleしないoperationまで救済する保証ではない。 |
| DSH-R3 / P3: stagingリンクの上書き | `stage.mjs:7` が各ancestor、`:24` がSkillとLICENSEを同じ規則で検査。`:31,37` が通常ファイル・非symlink・nlink=1を要求し、`:40` がartifact ancestorも検査。`tests/stage.test.mjs` の6case（通常、Skill/License hardlink、License directory、parent junction、source hardlink）は独立PASS。**修正済み**。悪意ある別processが検査とcopyの間に置換するTOCTOUの完全防御は主張しない。 |

上表の `src/`・`tests/`・`stage.mjs` はすべて `plugins/guilduo-dsh/` 配下。現在行番号を確認した。旧所見は[元の独立レビュー](guilduo-dsh-independent-review.md)に履歴として保持する。beta.14本人環境のgrant喪失原因を今回の合成再現だけで確定しない。

## 追加の独立競合確認

`src/index.ts:81` のshared store.deleteが遅れてreplacementを消す懸念について、**raw shared.publish等でdescriptorを人工改変する再現は採用しない**。現libと既存 `tests/persistence.test.ts` のMemoryStore/fixtureをRAMで利用し、以下の実control経路を確認した。

1. fresh login、または初期legacy fixtureをrestore→control.share。fresh ownerは `src/index.ts:69` のrandom connection-*。
2. tool内部でsynthetic token invalidationを発生させ、旧SDK cleanupの次のSHARED_KEY更新をnative queue取得前で待たせる。
3. control.logout→control.share拒否→通常begin/finishで再login。
4. replacement descriptorとRAM record全体を保存し、旧cleanupを再開する。

両caseで `assert.deepEqual(records, replacementSnapshot)`、descriptor一致、旧ownerと新ownerの不一致、connected=true、replacementのtool成功を確認した。tombstone後のlegacy share拒否は `src/index.ts:268`。**到達可能な試験条件では欠陥なし。未再現のstore.delete懸念をP2から除外する。** 本検証はfake Protection・fake SDKのみ、realProfileAccess=false、modelRequests=0。全interleavingの証明ではない。

再検証コマンド（repo root、既存依存のみ）:

```powershell
npm test --prefix plugins/guilduo-dsh
npm run test:types --prefix plugins/guilduo-dsh
node plugins/guilduo-dsh/node_modules/tsx/dist/cli.mjs --test tests/plugin-dsh.test.ts
```

90/90、型検査、2/2 PASS。公開サービス・モデル・実profileを使用していない。広いroot suiteは重複実行しなかった。親の先行472 PASS / 1 version failureは修正後の全suite PASSと数えず、修正後targeted 2 PASSと今後のCIを区別する。

## native receiptと本人報告の境界

安全フラグを確認してから以下のsanitized receiptを読んだ。private OAuth receipt・認証DB・会話履歴は読んでいない。

| 既存receipt | 独立に読んだ内容 |
| --- | --- |
| `.qa-artifacts/guilduo-dsh-lifetime-beta16/native-Iczyte/evidence.json` | directory名は旧版名だがcandidate結果はbeta.17。syntheticOnly=true、realCredentials/realProfiles/realHistory=false、modelCalls/networkCalls=0。unload/reload、exact-owner resume、legacy clear後ciphertextなし・restore拒否、shared-source保持/logout、現candidate snapshot一致をPASS記録。 |
| `.qa-artifacts/guilduo-dsh-shared-beta14/native-hf1KFN/evidence.json` | candidate=beta.17、realCredentials/realProfileAccess/realHistoryAccess/publicOAuth=false、modelCalls=0。全7case PASS。2process refresh直列化、queued abort、ABA/reconnect、旧disconnect競合、physical 15s timeout前rotation保持・late rejection。index/persistence/adapter hashが固定archiveと一致。旧failed runは成功証拠に数えない。 |
| `.qa-artifacts/guilduo-dsh-host/install-zCVM1D/evidence.json` | final archive hash一致、installedFileHashes全32件が最終配布物と一致。modelCalls=0、publicOAuth=not attempted、providerConfigurationRead/userProfileWrites=false、isolatedHome。genuine beta.16→17 upgrade、readd/remove、別bundle/dependency/config保持、Skill discovery/unloadをPASS記録。 |

native Settings合成OAuth・actual Chrome shell renderer PASS、publish dry-run PASSは親の実行報告。reviewer自身の再実行として記載しない。beta.16の本人公開OAuth・基本MCP読み書き・Desktop再起動後Connectedは[status](guilduo-dsh-status.md)の歴史的受入。Settingsを開く前のrestore完了やbeta.17の公開受入まで拡張しない。

## 未解決項目と公開後の観測

新しい修正必須P1/P2はなし。次は実装不具合の判定とは分けた受入・運用項目。

- **受入未完了:** beta.17で承認済み既存Agentにlinkし、exact context/assigned Questを確認。settings-free restart直後、新規通常会話、top-level fork、実Web/Desktop共有を確認する。公開source grepだけで配備APIのactingAgentId対応を推定しない。
- **受入未完了:** 限定Quest更新/readback、保存値同一ならwriteをskipするno-op、stale guard拒否→reread、Human保存回答→同一Agent再開、Agent Handoff。DSHはこれらを公開実行していない。API自体の同値write idempotenceは保証しない。
- **P3観測:** `src/adapter.ts:103,215` の保持snapshotはclose以前に受け取ったtokensが対象。永久未settleなら元writer lockを保持し得る。実発生時は秘密を含まないtimeout/transport settlement情報を収集し、強制unlockやlate save許容で回避しない。
- **P3運用:** unshared会話削除にはhostのconfirmed-deletion通知がない。README `:80` のとおり削除前にDisconnectする。DPAPIは同一Windows user権限のcodeからの隔離ではなく、local disconnectとserver revokeは別。clear障害なら元会話から復旧後再試行する。
- **配布ゲート:** PR CI、source merge、npm beta.17公開receipt、公開tarball hash/member一致、タグ確認。現在は固定artifact承認まで。npm latest昇格や安定版完成は承認していない。

OpenCode/OpenClawにも、消去失敗の明示・owner/epoch admission・cancel後非復活・既受信rotationの保存・リンク拒否・archive/commit一致の検査を共有する。ただしDSHの独自保持実装を別hostへそのまま導入する根拠にはしない。三者の実装・公式掲載・公開受入の状態は[三プラグイン評価](guilduo-plugins-completion.md)で分離する。

今回の信頼度は、固定bytes、実装・合成競合・unit/type/root確認は高、sanitized native結果は実行者receiptの範囲、公開beta.17受入と公開取得は未検証。変更は本書だけ。実装・既存レビュー・package・Gitを変更していない。

## 公開後の独立確認 — 2026-10-10

確認時刻: **2026-10-10 08:29:04 UTC / 17:29:04 JST**。以下はreviewer自身による資格情報なしの公開GET結果。上記の公開前評価・未完了表記は当時の履歴として保持し、この追記で配布ゲートの現在状態を更新する。

**最終判定: beta.17保守版のsource公開・npm配布ゲートは完了。安定版・DSH公開ワークフロー全体の完成とは判定しない。**

| 公開検証 | 今回の直接確認 |
| --- | --- |
| exact version | [npm registry exact beta.17](https://registry.npmjs.org/@guilduo%2Fdsh-oauth-poc/0.6.0-beta.17) がHTTP 200。`name=@guilduo/dsh-oauth-poc`、`version=0.6.0-beta.17`。 |
| 公開tgz | registryのdist.tarballを公開GETしHTTP 200、66,774 bytes。固定最終tgzとBuffer全体がbyte一致。既に独立確認済みの32member・source・canonical Skill・LICENSE一致を同じ配布物へ引き継げる。 |
| hash / integrity | SHA-256 `89414b1ec3d98fa5d1fa7aa3eb0180f1ed59c913b615942bb46844e5fed3c6d9`。registryのdist.shasumおよびdist.integrityも取得bytesから再計算して一致。 |
| 現在のtags | [dist-tags](https://registry.npmjs.org/-/package/@guilduo%2Fdsh-oauth-poc/dist-tags) がHTTP 200。`beta=0.6.0-beta.17`、`latest=0.6.0-beta.16`。期待どおりbetaのみ更新、latest昇格なし。tagsは確認時点の状態。 |
| source merge | [公開PR #57](https://github.com/ELRdn/Guilduo/pull/57) の公開APIがmerged=true、merge commit `8cfd0fd32daa6af69c40efdefcb411882de073e6` を返す。 |
| CI | [run 38037436398](https://github.com/ELRdn/Guilduo/actions/runs/38037436398) の公開APIがstatus=completed、conclusion=success。run headは `8d13b1943c0683c55b8a6641b4b6d1b9004bc42d`。merge commit自体で再実行されたCIとは主張しない。 |

親のnpm CLI exit 0・upload完了通知と、初回exact GET 404は伝播待ちの履歴であり、その時点を公開済みとは数えない。今回のexact GET成功と公開tgz一致をもって配布PENDINGを閉鎖する。再publishはしていない。

実環境受入の不足は残る。beta.16本人OAuth・基本MCP・Desktop再利用の履歴はbeta.17の直接公開OAuth、settings-free新規/fork、実Web/Desktop共有、guarded更新/readback/no-op/競合、Human回答再開、Agent Handoffの受入に置き換えない。先行P3観測・運用条件もそのまま。今回の公開配布確認で新しいP1/P2阻害事項はない。

今回の追加作業は公開GETと本書追記のみ。Git操作、native/tests/model/OAuth/profile作業、資格情報利用、package/source変更は行っていない。公開tgzはRAMで比較し、実profileへ導入していない。
