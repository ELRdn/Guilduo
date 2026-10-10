# OpenClaw beta.16 完了評価

後続方針: 本人依頼でnpm `latest`採用へ変更され、beta-onlyは現在の残件ではない。3プラグインはブラッシュアップ段階へ移行した。以下は評価時点の記録で、ClawHub集約scan・検索掲載の判定は維持する。[現行評価](guilduo-plugins-completion.md)を参照。

評価日: 2026-10-10。公開APIの最終確認: **08:01:24 UTC / 17:01:24 JST**。対象は `@guilduo/openclaw-plugin@0.6.0-beta.16` のみ。本書は独立した **AIレビュー**であり、外部人間監査・公式認定ではない。DSH / OpenCode の完了判定は行わない。

**判定: Windows・固定ホスト向け最小実装と受入は完了。配布は成立。ただし npm beta-only と ClawHub の集約scan・通常検索掲載が未完了なので、要求全体の完全完了とは判定しない。**

| 項目 | 判定 | 根拠・確度 |
| --- | --- | --- |
| 最小実装 | 完了 | native MCP/OAuth宣言、canonical Skill、空の登録処理、設定保全、stage保護をソース確認。確度: 高。 |
| Windows受入 | 記録上完了 | native導入/更新/削除、Accounts/Settingsブラウザー、公開OAuth・限定更新・Human回答後のGo Agent処理・revoke/reconnectが記録済み。今回は再実行せず、確度: 中〜高。 |
| npm / ClawHub配布 | 成立 | npm公開tgzを今回直接取得して完全一致。ClawHub公開ZIP内の16ファイルもソースと一致。公開導入の成功は親の受入記録。確度: 高／導入部分は記録ベース。 |
| npm beta-only | 未完了 | 公開APIで `beta` と `latest` がともに beta.16。latest削除HTTP 400は親の実行記録。確度: 高。 |
| 公式registryへの公開 | 成立 | ClawHubの公開ページ・指定版取得・owner/source metadata確認。community packageで `isOfficial: false`。公式推薦は意味しない。 |
| 公式掲載の完了 | 未完了 | package-level `scanStatus: pending`、`latestVersion: null`、code-plugin検索0件を今回確認。選択版clean/benignだけでは閉じない。確度: 高。 |

## 証拠の範囲

読み取り対象は割当worktreeのソース、[公開状態](guilduo-host-extensions-status.md)、[native証跡](guilduo-openclaw-native-evidence.md)、既知の最終tgz、未認証の公開GETだけ。credential/profile/private受入ログは読んでいない。nativeプロセス、OAuth、モデル、build/test/install/publishは再実行していない。Git操作は読み取りのみで、本書以外を変更していない。

確認時のworktree HEAD: `8b70641bc8134f4703f2d86127cb0de7b6199a6c`。公開ソースcommit: **`8dfee40372f83c3f3f23ae21863e23c7d950011c`**（状態文書L72、ローカルGit objectを確認）。ソースとアーカイブの独立比較はこのcommitのblobを用い、indexや将来の親変更を根拠にしていない。

受入ホストは **OpenClaw 2026.9.9 / `bcfc88812a35243893585dbeca87ca41b48272ca`**。今回の公開npm `/openclaw/latest` も2026.9.9、`/clawhub/latest` は0.23.3だった。これは確認時点のregistry値であり、固定commitでの受入や将来互換とは別の事実。

## 実装と不変アーカイブ

- [src/index.ts](../plugins/guilduo-openclaw/src/index.ts) L4–9: `definePluginEntry` と空の `register()`。独自tool/UI/hook、token bridge、自律モデル実行を追加していない。
- [openclaw.plugin.json](../plugins/guilduo-openclaw/openclaw.plugin.json) L7–12: native Skillと `https://mcp.guilduo.com/mcp` のStreamable HTTP OAuth宣言。[package.json](../plugins/guilduo-openclaw/package.json) L14・22–28: 配布allowlistと2026.9.9固定互換条件。
- [setup.mjs](../plugins/guilduo-openclaw/setup.mjs) L7–32: 既存alias/設定を保全し、欠落時だけnative create-only add。manifest単独でsaved MCP設定を生成しない。cross-alias競合は一取引ではなく、同時config writer停止が必要。
- [stage.mjs](../plugins/guilduo-openclaw/stage.mjs) L7–15・30–34: 出力祖先のjunction/symlinkとhardlinkを拒否。[tests/plugin-openclaw.test.ts](../tests/plugin-openclaw.test.ts) L105・124が対応する。QA専用 [native-expiry-qa.mjs](../plugins/guilduo-openclaw/tests/native-expiry-qa.mjs) L9–29はlexical base/root検証をcontainment前に実施し、root junction逃避修正を含む。このhelperは公開アーカイブに入らない。
- [README](../plugins/guilduo-openclaw/README.md) L19・25・42: Accountsは保存設定の名前/URL一致が必要。既存の許可済みRegistry Agentへowner承認付き `link_agent` を行ってからcontext/Questへ進む。自動登録・権限拡大はしない。

最終tgz: `plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.16.tgz`。

```text
SHA-256: 46c3fb454ac179807148c090f9730f8a2f77576f9fdbd8d20d4584508eaea678
```

今回の読み取り専用比較で、**tgz内16ファイル＝現在ソース＝公開commit blob** を全件確認。Skill本文・3 references・agents metadata・LICENSEは現在canonicalと同一。QA script/profile/cache/reportは含まれない。npm公開tgzはローカル最終tgzとraw bytesまで一致し、registryのSHA-1・SHA-512 integrityも一致。

ClawHub指定版metadataのoriginal tgz SHA-256も上記と一致。一方、今回GETした `/download?version=0.6.0-beta.16` は **ZIP** で、SHA-256は `162f640abbd8daf1df188e4bf82f12b96f602af8a974c78a3b69cc91c9f81919`。ZIP hashは版metadataと一致し、展開内容16ファイルを現在ソースと比較して全件一致した。ZIPとnpm-pack tgzのhashを混同しない。ClawHubからoriginal tgzを取得してnative導入した事実は状態文書L76の親記録であり、今回の再導入ではない。

## 受入の評価

[native証跡](guilduo-openclaw-native-evidence.md) L17・31–36・67–77と[公開状態](guilduo-host-extensions-status.md) L29–40・76・79を突き合わせた。

- 9 unit tests、native suite 31 subprocess checks、実beta.15→16導入/更新、config保全、Skill discovery、削除、最終5-command smokeが記録済み。README内容差分と `stage.mjs` のEOL/末尾改行差分は別扱いで、full-suite archiveとのraw bytes全一致を誤って主張していない。
- Chrome/Gatewayで実Accounts→Connect→HTTPS synthetic OAuth→Connected→Settings→native probe/tool実行→logoutを検証済み。公開OAuthの受入は別に記録されている。外部MCPの `/tools/invoke` は404であり、成功経路として扱わない。
- 公開側はnative OAuthと56-tool discovery、既存Agentリンク、限定preview/update/readback、saved Human回答を読む手動embedded Go Agent処理、no-op、stale更新拒否と再読込が親記録にある。使用モデルは `opencode-go/deepseek-v4.1-flash`、fallbackなし。SDKの先行tool呼出しを以前のモデルconversation sessionと同一視しない。
- 公開refreshは **QAでlocal `tokenExpiresAt` のみ失効させた後、通常native probeによる実サーバーrefresh**。新expiry保存を確認した親記録がある。自然失効や公開refresh-token rotation保証ではない。
- Web側revokeでnativeアクセスが拒否され、native logoutと新たなユーザーOAuth承認で56-tool discoveryを回復。再接続後も同じ既存Agentリンクとassigned Quest読取が記録済み。既存fixture読取はrefreshそのものとは別の受入項目。

beta.14部分は歴史記録。beta.16証跡の初期dry-run attribution待ちや「worker未独自検証」は当時の実行主体/境界の記述であり、状態文書L72–77とnative証跡L81の後続publication/public acceptanceを取り消す意味ではない。本評価はprivate receiptsを独立再検証したと主張しない。

phase末尾の進捗記録はcanonical Skillのguidanceで実現する。[SKILL.md](../plugins/guilduo-openclaw/skills/guilduo-workflows/SKILL.md) L28–34と[phase-sync.md](../plugins/guilduo-openclaw/skills/guilduo-workflows/references/phase-sync.md) L7–10はexact Quest/Agentへの継続承認とread-only制限を要求する。**新しいOpenClaw lifecycle hookは選択された最小scopeに不要**。強制自動実行やhost end-event保証を追加の完了条件にしない。

## 現在の配布・scan・残ゲート

未認証GETで以下を確認した。応答は2026-10-10のsnapshotであり、将来の状態を保証しない。

| 公開endpoint | 今回の確認 |
| --- | --- |
| `https://registry.npmjs.org/@guilduo%2Fopenclaw-plugin` | HTTP 200、beta.16公開、`beta`/`latest`が両方beta.16、fileCount 16、公開tgz bytes/integrity一致。 |
| `https://clawhub.ai/guilduo/plugins/openclaw-plugin` | HTTP 200、title `Guilduo — ClawHub Plugins`。 |
| `https://clawhub.ai/api/v1/packages/@guilduo/openclaw-plugin` | owner `guilduo`、community、`isOfficial: false`、`scanStatus: pending`、`latestVersion: null`、beta tagあり。 |
| 同package `/versions/0.6.0-beta.16` | source-linked commit一致、verification clean、LLM benign。static scanはsuspicious、Skill scanもsuspicious/LOW/CAUTION・3件。 |
| 同package `/download?version=0.6.0-beta.16` | HTTP 200、ZIP hash/16ファイル一致。 |
| `https://clawhub.ai/api/v1/packages/search?q=guilduo&family=code-plugin` | HTTP 200、`results: []`。 |

**残ゲート1 — npm beta-only。** beta指定の公開は成立してもlatestが自動付与され、要求されたbeta-only状態は未達。HTTP 400の削除失敗は状態文書L74の親記録を採用し、認証操作は再実行しない。明示版の導入案内を維持し、registry側の正規の解決を親が進める。dummy stable版、unpublish、別artifactはこの課題の解決として提案しない。

**残ゲート2 — ClawHub集約scan/検索。** 選択版のclean/benignは全scanner合格やpackage-level完了ではない。static scanの `suspicious.dangerous_exec` は任意setup helperの公開済み `child_process` 呼出しを指す。Skill scannerは広いdescription/暗黙起動をCAUTIONとし、LLMはexact Quest/Agent承認・限定patch・readbackの制約を踏まえてbenignと評価している。これらの信号を消して「安全認定済み」と表現しない。親がregistryの処理状況とbeta版の検索/既定選択方針を確認し、aggregate metadataと通常導線を再確認する。検索を通すためのlatest昇格やdummy feature追加は不要。

自然失効、同時refresh、複数許可Agentのarbitration、multi-person channel、Linux/macOS、将来host版、manual-code OAuth fallbackは未受入。Windows・shared operator OAuth・単一許可Agent・固定版という今回のscopeを保てば、これらは追加対応候補であり最小実装の欠落とは判定しない。性能benchmarkもscope外。

**最終verdict: 利用可能なWindows betaとして実装・受入・指定版配布は完了。npm beta-onlyとClawHubの掲載完了は保留。現時点の証拠から追加runtime featureは不要で、未完了を外部gateとして明示する。**
