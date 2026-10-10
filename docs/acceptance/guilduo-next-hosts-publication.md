# Guilduo next hosts beta.12 配布の独立確認

確認日: 2026-10-10。CyanによるAIレビュー。外部人間監査・ホスト運営者の承認ではない。編集は本書のみ。認証なしの公開GitHub GET、既存public-download ZIP、公開commitのGit blobを読取り、追加ZIP download・Git変更・native/test/model/OAuth/profile操作は行っていない。

**4hostの候補配布gateはPASS。配布対象と掲載・受入境界について未解消P1/P2なし。** 包括的なhost受入や安定版承認を意味しない。

## 公開source・CI・Release

- 最終実装source: [`53793f068546524305d3bc8634edf2918eef4c6b`](https://github.com/ELRdn/Guilduo/commit/53793f068546524305d3bc8634edf2918eef4c6b)。公開APIでPR64のmerged/merge SHAとRelease tagのcommit一致を確認した。本書のpackage照合はこの**最終公開source commit**を根拠とし、旧worktree/index承認の転用ではない。
- [source CI 38058236638](https://github.com/ELRdn/Guilduo/actions/runs/38058236638): completed/success、PR head `23a708cabb5be2306a73f947f43592df52640be8`。公開PR headと一致し、Git treeは上記merge commitと同一。
- Docs source: PR65 merged [`9f0ae2696f06441323d82eac22977f26ab5d9f8c`](https://github.com/ELRdn/Guilduo/commit/9f0ae2696f06441323d82eac22977f26ab5d9f8c)。[Docs CI 38058874316](https://github.com/ELRdn/Guilduo/actions/runs/38058874316)はcompleted/success、PR head `7220c1d7d50f00f56b04457688af01d6aeef8fda`、merge treeと同一。contentのsourceRevisionは実装source `53793f0…`、日英各18記事。
- [公開Release](https://github.com/ELRdn/Guilduo/releases/tag/guilduo-next-hosts-v0.6.0-beta.12): draft=false、prerelease=true、2026-10-10T14:13:26Z公開。tagは実装sourceのcommitへ直接解決。assetは以下の公開用4ZIPのみで、ローカルApp companionは含まれない。npm配布を追加していない。

CIは各PR headに対する成功であり、merge SHA上で別途再実行したとは表記しない。tree一致を確認して対応付けた。公開sourceの受入検査票に残る「配布pending」はRelease前の記録であり、本書で配布gateのみを閉じる。

## 公開assetとbyte照合

公開Release APIのasset名・uploaded state・サイズ・`asset.digest`と、親が取得済みの `.qa-artifacts/guilduo-next-hosts/public-release/` 内ZIPの実SHA256を独立に照合し、凍結hashとも一致した。レビュー担当自身による再download/転送経路の再検査はしていない。

| ZIP（各 `guilduo-workflows-<host>-0.6.0-beta.12.zip`） | bytes / members | SHA256 |
| --- | ---: | --- |
| codex | 37,111 / 13 | `b12e1c7772fe99e3d06303a117614dc3b83d26d36c89074b9f580e42b7f71fe8` |
| openai | 33,809 / 11 | `16221aa92f68173b572ce7d024de43725ddaf8e2680a4e19402c916c06891977` |
| grok | 32,063 / 11 | `e686588f4d02ea299066a95ec3d1f7d2bf1bdcf57ebcaf1513937399b65d99f0` |
| muse | 32,913 / 11 | `34cec2b38c577b30daa7b43037d3d3cb57e570027fb30dcc52f3fc3bdb11d009` |

全ZIPのclosed whitelist、重複・directory・traversal・backslash・symlink memberなしを確認。Codex/Grok/Museは**全member**を公開sourceの対応plugin directoryとbyte照合した。OpenAIは共通7memberを公開正本Skill/references/agents、LICENSE、iconへ照合し、生成4JSONは公開template/generatorの定義からメモリ上で構成した値・JSON byteとも一致した。generatorは実行していない。

OpenAI全entryにApp/hookなし、Codex通常版にはhookあり、Grok/Museにhookなし、Muse認証MCPはuser settingsへ分離。App companion・QA/profile/log/native binaryは公開assetに含まれない。これらの確認はsecret不在の完全な証明やnative実行証拠ではない。

## host別の評価

実機結果は公開sourceの受入記録と親報告を根拠とする。今回の独立実施はsource/配布照合であり、実機操作の再実行ではない。

| 対象 | 実装 | 導入 | OAuth | model | Human | 配布 | 掲載 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI / ChatGPT | 共通Skill＋remote MCP、noApp/nohook確認 | complete plugin install未受入 | installed package経路未受入 | 正例5/負例3・実demo等は未受入 | 未受入 | 専用提出候補ZIPの公開PASS | 本人確認・scan・reviewer/domain/demo・提出/審査/Publish未完了。directory未掲載 |
| Codex | 公開Git bundle＋hook、正本一致 | CLI0.159.2 install/discovery、本人App companion更新/cache一致を受入記録で確認。包括的Desktop lifecycleは未受入 | process-only direct OAuth保存再利用/new process/56tools discovery PASS。App schema staleをwrite受入へ流用しない | exact openai/gpt-6-astra＋明示正本Skillで限定更新/readback、no-op、stale guard拒否後read-only再読取PASS（親実機結果） | 本人Web保存回答→same-session再開PASS（親実機結果） | standard Git marketplace＋ZIP公開PASS。App companionはprivate localのみ | OpenAI public directory未掲載。trusted hook実行は未受入 |
| Grok Bot | portable Skill/HTTPS MCP候補、nohook確認 | true Grok native install未受入。任意ZIP importを保証しない | 未受入 | 未実施・未受入、新規課金なし | 未実施・未受入 | Git/ZIP候補公開PASS | Cursor tested-locally未達で提出保留。Cursor catalogはGrok受入ではない |
| Muse Code | native Skill manifest、MCP user settings分離、nohook確認 | stable1.4.4-R5419.1の隔離validate/install/discovery/update/disable/remove受入記録あり | 本人最新回答は**認証ページ自体が未表示、端末のエラーなし**。原因未確定、OAuth未受入 | 未実施・未受入、provider/model課金なし | 未実施・未受入 | Git/ZIP候補公開PASS | native custom source経路。中央store掲載経路/掲載は未確認 |

Codex trusted hookの実root turn/flag/once-per-input、refresh・失効・再接続、shared Agent選択は未受入。通常pluginのSkill自動読込やhook経由の実行をprocess-only direct MCPのmodel PASSから推認しない。Grok/Museの有料model契約欠如だけを標準MCP OAuth不可の根拠にしない。新契約・API課金を要求しない。

## 残る公開・受入gate

Docs PR/CI/source統合は直接確認済み。独立配布レビュー時点では本番deploy `38059302339` は進行中で、レビュー担当は本番HTTP・browser・検索・sitemap等を検証していない。後続の親実行結果は下記に分けて記録する。公式Docs掲載と上流directory掲載も別gateである。

実装上の先行R5/R6は[独立レビュー](guilduo-next-hosts-review.md)で解消済み。今回新しいP1/P2は確認されなかった。OpenAI/Grok/Muse等の未受入項目を保ったβ候補の公開として配布gateを閉じ、実利用全体の完了とはしない。

### Docs live gate追記（親実行、2026-10-10）

親から以下の完了報告を受領した。レビュー担当の直接確認・再実行ではない。

- 本番deploy `38059302339`: completed/success。deployed SHAは `9f0ae2696f06441323d82eac22977f26ab5d9f8c`。
- `2026-10-10T14:27:37.198Z`: 全36pageの実h1/lead/canonical/source SHA/全copy code、検索日英18＋18、sitemap/robots/llms/実404を含む計41 HTTP checks PASS。
- 追加の日英8記事は公開Browserでbeta.12/source `53793f0…`/h1、日英copy成功表示と言語切替PASS。

この親実行証拠により**Docs本番配備・live gateはPASS（親報告）**と記録する。独立配布照合の証拠範囲、各hostの未受入項目、上流directory掲載保留は変更しない。
