# Guilduo：三プラグインの完成度評価

確認日: 2026-10-10。各担当サブエージェントによるAI評価であり、外部の人間による監査・公式認定ではない。実装、実環境受入、配布、公式掲載を分けて判定する。将来のホスト版・全OSでの保証は含めない。

| プラグイン | 実装 | Windows受入 | 配布・掲載 | 全体判定 |
| --- | --- | --- | --- | --- |
| DSH / beta.17 | 必要な保守修正R1・R2・R3を実装。90 package tests・型・build、native合成認証／Settings／Chrome／CLI更新を検証。独立レビュー承認、未解決P1/P2なし | beta.16の本人OAuth・基本読み書き・Desktop再起動再利用は受入済み。beta.17の公開OAuth再確認、限定更新readback／競合、Human／Handoff、設定なし新規／forkは未完了 | PR #57をmainへ反映、CI成功。npm beta.17公開と公開tgzの32ファイル・正本・SHA-256／integrity一致を確認。beta=17／latest=16 | 保守βの実装・配布完了。全ワークフロー完成とは判定しない |
| OpenCode / beta.16 | 最小実装完了。phaseSync既定OFF、ON時は元入力につき追加確認最大1回 | 1.18.32／1.18.35のnative検証、指定Goモデル、公開OAuth、Human保存回答→同一Agent再開、限定更新／no-op／競合を記録上受入 | npm公開・14ファイル一致。beta-onlyタグは未達。公式掲載PR #54271はv1 freezeでclosed・未merge | 限定βは成立。公式掲載までの計画全体は未完了 |
| OpenClaw / beta.16 | native MCP/OAuthとSkillの最小実装完了。追加終了hookなし | 2026.9.9／build `bcfc88812a35243893585dbeca87ca41b48272ca`。Accounts／Settings、公開OAuth、Human保存回答→明示Agent再開、限定更新／no-op／競合を記録上受入 | npm・ClawHub指定版配布、16ファイル一致。beta-onlyタグ未達。ClawHub集約scan pending、通常検索掲載未完了 | 限定βは成立。通常の検索掲載までの全体は未完了 |

## 独立評価と証拠

- Faraday担当: [OpenCode完了評価](guilduo-opencode-completion-review.md)。公開tgz、固定archive、公開source commitの14ファイルを今回直接比較。新しいruntime修正必須事項はなし。
- Boyle担当: [OpenClaw完了評価](guilduo-openclaw-completion-review.md)。npm tgz・ClawHub公開ZIPの16ファイルと公開sourceを直接比較し、公開registryのscan／検索状態を確認。
- Darwin担当: [DSH完了評価](guilduo-dsh-completion-review.md)。親の保守実装に対する独立レビュー。beta.16の[元の所見・再現条件・優先度](guilduo-dsh-independent-review.md)は履歴として保持。

担当による直接再検証と、親の実行記録・本人報告の参照は各文書で区別する。[DSH status](guilduo-dsh-status.md)・[OpenCode／OpenClaw status](guilduo-host-extensions-status.md)が版・公開hash・受入範囲の台帳。

DSH beta.17公開tgzのSHA-256は `89414b1ec3d98fa5d1fa7aa3eb0180f1ed59c913b615942bb46844e5fed3c6d9`。公開済みbeta.16、OpenCode／OpenClawの最終配布物は変更していない。DSHは本人の実プロファイルを自動更新せず、停止後に標準CLI／Desktop plugin managerから固定beta.17を導入する。

## 未完了項目

DSHは上記の実ワークフロー受入が必要。OpenCodeの公式掲載PRは却下されて閉じており、掲載待ちとは表現しない。公式v1の代替掲載経路を照会済み。OpenClawは公開ページ／指定版取得は成立するが、選択版clean/benignだけでは集約scanや検索掲載を完了にしない。

OpenCode／OpenClawのnpm初回公開は指定したbetaとともにlatestを自動付与した。本人の2要素認証後もlatest削除はHTTP 400で、beta-onlyを達成できていない。固定版導入を案内し、ダミー安定版・公開済み版の改変で回避しない。

性能比較、Linux／macOS実機、自然expiry／すべてのrefresh競合、複数人channelは今回の検証対象外。指定モデル以外へのfallback・新Agent登録・独自認証bridge・Worker／Site配備は行っていない。
