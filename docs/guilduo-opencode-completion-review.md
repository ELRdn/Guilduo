# OpenCode beta.16 完了評価

後続方針: 本人依頼でnpm `latest`採用へ変更され、beta-onlyは現在の残件ではない。3プラグインはブラッシュアップ段階へ移行した。以下は評価時点の記録で、上流掲載の判定は維持する。[現行評価](guilduo-plugins-completion.md)を参照。

評価日: 2026-10-10。対象: `@guilduo/opencode-plugin@0.6.0-beta.16`、Windows、OpenCode 1.18.32 / 1.18.35。

**判定: 限定範囲の実装・受入とnpm公開は成立。ただし、選択済みのbeta-only配布と公式Ecosystem掲載が未達のため、要求全体の完了とは判定しない。** この読み取り評価で、対象範囲の利用を阻む新たなruntime修正事項は確認できなかった。v2や全環境への互換性保証ではない。

これは親担当のDSH改修と作業範囲を分けたAI完了評価であり、第三者による人間監査ではない。本人がOAuth・Web回答を操作した受入も、人間による包括的なコード／セキュリティ監査とは区別する。DSH・OpenClawの完了判定はこの文書の対象外。

## 根拠と検査範囲

現在のsource、日英README、公開test driver、[現行status](guilduo-host-extensions-status.md)、[native evidence](guilduo-opencode-native-evidence.md)を参照した。private receipt、OAuth/browser/provider profile、資格情報、実Quest内容は読んでいない。モデル・OAuth・インストール・build/pack・既存test suiteは再実行せず、Git／registry変更も行っていない。書込みはこの文書だけ。

今回独立に確認した事実:

- 固定archive `plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.16.tgz` の14ファイルを `tar -tzf` / `tar -xOf` で展開せず検査し、全14ファイルが現在sourceとbyte一致。同梱Skillとreferencesの4ファイルもroot正本とbyte一致。
- 全14ファイルが公開済みGit commit `8dfee40372f83c3f3f23ae21863e23c7d950011c` のblobとbyte一致。[source PR #55](https://github.com/ELRdn/Guilduo/pull/55) のpublic APIもmergedと同じmerge commitを返した。CI成功はstatus記録を参照し、CI自体は再評価していない。
- 07:58 UTCの未認証HTTP GETでpublic npm metadataとtgzを取得。公開tgzは固定archiveとraw byte一致、registry SHA-512 integrityも一致。SHA-256は **`6fe013ae72b80e47d8846b2c20b0e4d42a749ce03ea142ef3d9243410e870d2c`**。
- 同時点のpublic tagは `beta=0.6.0-beta.16` と `latest=0.6.0-beta.16`。manifestの `publishConfig.tag` は `beta` でも、実際のbeta-only状態は成立していない。latest削除のHTTP 400は親担当のstatus／本人報告であり、今回削除操作はしていない。
- [Ecosystem PR #54271](https://github.com/anomalyco/opencode/pull/54271) のpublic APIは `closed`、`merged:false`、base `dev`。upstreamの[閉鎖コメント](https://github.com/anomalyco/opencode/pull/54271#issuecomment-6095140451) はv1がcritical fixesのみを受け付けると説明する。掲載済みでも審査待ちでもない。

14ファイルのallowlistにtest／QA成果物／profile／`.gitignore`は含まれない。runtime依存とconsumer install/postinstall scriptもない。旧native受入のarchive hashは `835a02cd35b1f70700dabd9dfd0cbaaa3ab4ea594a9cde178bde2d5470e99da1`。最終版との差はREADME 2件とmanifest/configのCRLF→LF 2件で、残り10ファイルのbyte一致は既存evidenceの検査記録。旧archiveと最終archiveそのものを同一とは扱わない。

## 実装・受入・配布・掲載の個別判定

| 項目 | 判定 | 根拠／条件 | 確信度 |
| --- | --- | --- | --- |
| 最小runtime実装 | 対象範囲で成立 | source／公開blob／固定archiveを直接照合。既存設定保存、Skill、native OAuth、有限phaseSyncを確認 | 高 |
| local test・native lifecycle | 既存受入を支持 | evidenceに16 tests、types/build/pack、root 2 checks、両hostのbeta.15→16・Skill・解除・他package保存を記録。今回再実行なし | 中～高 |
| 実GoモデルのphaseSync | loopback範囲で受入 | 両hostのOFF／ON一回・再帰なし／sync-off／停止後を記録。公開MCPへの一連の自動更新とは別 | 中～高 |
| 公開OAuth・限定workflow・Human | 親担当の実受入記録を支持 | statusにAgent紐付け、限定update/readback、同一Go sessionの回答読取／再開、no-op／競合再読、refresh／revocation／再認証を記録。private履歴は未閲覧 | 中 |
| source・npm配布 | 公開成立 | source PR merged、public tgzとGit/source/archiveのbyte照合、integrityを今回確認。fresh native registry installはstatus記録 | 高 |
| npm beta-only状態 | 未達 | live metadataでlatestも存在。削除HTTP 400の未解決例外 | 高 |
| 公式Ecosystem掲載 | 未達 | PR closed・未mergeとupstream理由を今回確認。別の掲載成功は記録なし | 高 |

## runtimeと受入の境界

[runtime](../plugins/guilduo-opencode/src/index.ts) の26–36行はphaseSyncのdefault OFFとexact session／Quest／Agent／canonical cwdを要求する。54–74行は既存公式alias・occupied設定・Skill path・commandを保存し、common deny fenceを確認する。76–131行は非合成入力、親入力に対応するcompleted stop、build/cwd、native idle、fork／session permissionを確認してから1回分を消費する。失敗・曖昧な送信は再試行せず、synthetic inputは再帰を再armしない。dispose・削除・error・compaction・新入力による世代変更はpendingを無効にする。

runtimeに資格情報読取／保存や直接MCP write clientはなく、更新はAgentとnative権限解決に委ねる。実装はhostの完全なpermission resolverを代替しない。意味あるフェーズの判断や会話中の普通の言葉による許可撤回はSkill／Agentの責任であり、pluginが会話を解析して強制停止する保証はない。`/guilduo-sync-off` はbinding停止で、実行中推論のabort、OAuth失効、永続設定変更を兼ねない。

[README](../plugins/guilduo-opencode/README.md) の48–51行は `get_agent_link` → 未紐付けの専用接続だけ所有者が許可した既存Agentへ `link_agent` → context／exact Quest照合を明示する。導入によるAgent自動登録・Quest write許可はない。新sessionはOFFで作成し、完全停止後にexact bindingを設定して再起動する。forkや新sessionへ自動追従しない。

[実モデルdriver](../plugins/guilduo-opencode/tests/native-model.mjs) は固定 `opencode-go/deepseek-v4.1-flash`、provider retry 0、caseごとの120秒abort／owned cleanupを持つ。初回のモデル実行なしbootstrapは別枠180秒。contextとQuestの個別read、入力／返却Quest ID、native成功tool stateを要求し、no-change writeは0を確認する。再帰なしの実測は約5秒の静穏観測と後続caseであり、無期限の観測ではない。最終config hookがOAuth-free loopbackへ接続を置換するため、これをpublic OAuth／public opt-in write受入と数えない。

公開受入は[statusのworkflow記録](guilduo-host-extensions-status.md#public-workflow-acceptance)を根拠とする。Human回答後の再開は同一Go sessionでの実workflowだが、公開opt-in phaseSyncが自動的にそのwriteを開始した証拠とは別。専用接続の許可Agentは1体であり、shared connectionのcross-Agent選択は未受入。最初の未紐付けclientのschema errorを `actingAgentId` 非対応と判断しない。

公開refreshは固定の無効BearerによるQA 401 carrierからnative SDKが実public grantをrefreshし、設定復元後に通常接続を確認した親担当の記録。expiry-only注入でまだ有効なaccessを再利用した先の試行はrefresh PASSではない。自然期限切れ、refresh競合、refresh-token rotation保証は未受入。Webでのrevocation拒否確認とnative logout後のfresh OAuth／再紐付けはstatusに追記済みで、古い「reconnect待ち」の記述から現在も未実施とは判断しない。

## 残gateと最小必要作業

1. **beta-only配布:** registry側のlatest削除／修正方法を公式経路で解決し、public dist-tagsを再確認する。公開そのものは取り消されていないが、明示version pinを使う現状をbeta-only完了に置き換えない。解決待ちにするか例外を受け入れるかは本人の方針決定で、追加コードだけでは閉じない。
2. **公式掲載:** upstreamから既存v1の受入可能な公式経路の回答を得て、掲載を実確認する。提示されたcommunity `awesome-opencode`は公式Ecosystem掲載の代替受入ではない。community補助掲載への方針変更やv2対応は本人の選択で、v2への未検証移植をこのbetaの必須修正として始めない。
3. **宣言範囲:** 現時点はWindows／1.18.32・1.18.35／専用Agentでの限定betaとして記載する。public opt-in continuation→実writeの結合受入、shared cross-Agent、Linux/macOS、自然expiry／refresh concurrencyは追加保証を選ぶ場合の別gate。既存受入を再実行する必要性や新runtime修正は、このレビューでは確認できなかった。

beta.14以前とbeta.15 baselineは履歴。現在の配布・tag・listing判断はlive確認と最新statusを優先する。古いevidence中の「publication gate未実施」やfreeze前のhashを、今回の公開状態に流用しない。要求全体の完了判定を閉じるために残る具体的な必須事項は、beta-only状態と公式掲載の2件。
