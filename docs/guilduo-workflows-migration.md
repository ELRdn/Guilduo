# Guilduo Workflow Skill 最小移行契約

2026-10-10 現行追記：DSH beta.16は新Skill名を含めnpm beta／latestとして公開済み。本人の公開OAuth・MCP読み書き・Desktop保存認証再利用も確認済み。設定なし新規／fork、Agent紐付け／Handoff、Human回答→再開は未受入。[現行状況](guilduo-dsh-status.md)。OpenCode／OpenClaw beta.15は引き続き未公開。以下の改名時点の未公開・未受入記録は履歴。

承認日: **2026-10-10**。利用者がSkill `questforge-workflows` → `guilduo-workflows` の改名を明示承認した。旧ID維持契約の例外は、このSkill名と対応するSkillディレクトリ・呼び出し名に限る。

## 現行参照と次の配布

- 正本: [`skills/guilduo-workflows/SKILL.md`](../skills/guilduo-workflows/SKILL.md)。Plugin同梱先: `plugins/questforge/skills/guilduo-workflows/`。
- Skill名は `guilduo-workflows`。Codex companionの呼び出しは `$guilduo-workflows:guilduo-workflows`。standaloneは `$guilduo-workflows`（ホストの呼び出し規則に従う）。
- 基盤manifest候補は **`0.6.0-beta.11`**。DSHは認証保持修正を加える **`0.6.0-beta.16`（2026-10-10 09:45 JSTにnpm公開・公開tgz照合済み）**、OpenCode／OpenClawは **`0.6.0-beta.15`、未公開**。DSH beta.15改名archiveは履歴として保持する。新しい配布物には新Skill名のみを含め、旧名aliasや旧Skillの同梱で二重導入を作らない。文書更新はpack・公開・native受入完了を意味しない。
- OAuth／MCP／package／plugin／storage ID、接続先、既存の `questforge` 識別子は維持する。Skill以外のID・保存データを今回の改名で移行しない。

## 既存利用者の更新

1. ホストの標準plugin更新を実行してアプリ／ホストを再起動し、新しい会話で `guilduo-workflows` の読込を確認する。DSHは旧Web／Desktop profileを停止してから、公開済みbeta.16へ各profileを更新する。beta.14だけでは旧名のまま。OpenCode／OpenClawのbeta.15は公開前なので別工程。
2. 旧standalone `questforge-workflows` がある場合、利用者自身が削除または新Skillへ置換する。plugin同梱版とstandalone版を二重導入しない。
3. 利用者の実設定・installed Skill・OAuth grantを自動変更しない。既存の接続、無関係なplugin、権限を保持する。

## 履歴と受入

旧配布物、固定beta.14 archive／README、旧installed name、hash、native検査票は当時の証拠として保持する。`questforge-workflows` で検査した結果を `guilduo-workflows` で検査した結果へ書き換えない。文書の現行参照は新名を使い、過去の旧名記録は履歴と明記する。

beta.14でpendingの実公開OAuth／Web／Desktop／Human往復、OpenClaw実ブラウザーUI／複数利用者channelなどの受入は閉じない。beta.15のpack・導入・新名発見・更新・公開は新しい証拠で別々に判定する。既存受入: [DSH](guilduo-dsh-acceptance.md)、[OpenCode](guilduo-opencode-native-evidence.md)、[OpenClaw](guilduo-openclaw-native-evidence.md)。

## 今回の検証結果（2026-10-10）

[統合検査票](../.qa-artifacts/guilduo-workflows-rename/validation.json)は **PASS_LOCAL_MIGRATION**。コード上の改名とローカル配布・更新を完了した。npm公開・サイト配備・実利用者の更新は未実施。

| 対象 | 新版で確認した内容 |
| --- | --- |
| 共通配布 | OpenAI／Grok／Claude／Muse／Piの通常・任意補助・提出用、計10archiveを隔離コピーから生成。全ファイルをstaging・正本と照合、新Skillのみ同梱。基盤beta.11、Claude／Museの補助版はbeta.11.hooks。 |
| DSH beta.15 | 75 package tests、型・build、root配布検査。実DSH 0.2.0-rc.2でbeta.14→15更新・再導入・新Skill1件の登録・旧名なし・unload・削除・設定保持、18チェック。 |
| OpenCode beta.15 | 11 package tests、型・build、root配布検査。実1.18.32で旧Skillのbeta.14→15更新・新名だけの発見・unload・削除・無関係なplugin保持・合成OAuth保存／再起動／refresh。 |
| OpenClaw beta.15 | 7 tests・build。実2026.9.9でbeta.14→15更新・新名だけの発見・再導入・削除・設定保持、合成OAuth／callback／PKCE／保存／probe／logout。 |
| 境界・文書 | 生成名／frontmatter／directory／manifest一致、旧名混入時のarchive・review拒否、フック・Pi補助・公開Docsリンクと描画を検査。固定公開revisionの根拠リンクは旧pathを保持。 |

[共通10archive照合](../.qa-artifacts/guilduo-workflows-rename/common-archives.json)と[独立npm候補3archive照合](../.qa-artifacts/guilduo-workflows-rename/npm-archives.json)はPASS。計13配布物で旧Skillを含まず、合計62ファイルの独立npm候補を現在source／build／README／正本とbyte照合した。DSH beta.13／beta.14、OpenCode beta.14、OpenClaw beta.14の固定archiveはSHA-256不変。

実ホスト票: [DSH](../.qa-artifacts/guilduo-dsh-host/install-u3jxcT/evidence.json)、[OpenCode](../plugins/guilduo-opencode/artifacts/native-host-1.18.32-SyH2EK/evidence.json)、[OpenClaw](../plugins/guilduo-openclaw/.qa-artifacts/native-UtHG52/evidence.json)。認証・権限・UIのproduction runtimeは旧beta.14と照合し、Skill名とclient version metadata以外の変更なし。実アカウントOAuth・Human往復・物理Desktop／実ブラウザーUIなどの未受入は維持する。
