# Guilduo 公開・告知の準備

更新: 2026-10-03 / **GitHubはPUBLIC確認済み・X告知は未投稿の案**

対象Quest: `quest-c3d898f7-41d7-4cd4-b439-16f3c6e241f4`「guilduoをGitHub公開・Xで告知」。2026-10-03に`gh repo view ELRdn/Guilduo`でvisibilityがPUBLICであることを確認した。9月7日のPRIVATE記録は過去の状態。既存Questを[ローンチ計画](launch-roadmap.md#la-09)のLA-09として再利用し、LA-08の正式Release後に告知する。今回の計画登録では投稿していない。

## READMEと案内先

既存の[README](../README.md)・[日本語README](../README.jp.md)は、製品説明・正式URL・ライセンス・構成・初期設定・検証手順を含む。初回接続には[Workflow Skill](../skills/guilduo-workflows/SKILL.md)、新しい協働機能の実装範囲には[受入記録](human-relay-acceptance.md)を併せて案内する。

- 製品紹介: https://guilduo.com/
- Web App: https://app.guilduo.com/
- MCP: https://mcp.guilduo.com/mcp
- 公開ソース: https://github.com/ELRdn/Guilduo （2026-10-03 PUBLIC確認）

## X告知文案

現行のLPと製品の役割を紹介する案。新しいHuman確認フローの本番提供開始は、配備・実機受入の後に別途案内する。

> 人間だけが、依頼主じゃない。
>
> Guilduoは、人と自分のAI Agentで仕事を渡し合うワークスペースです。
> 依頼・進捗・フィードバックはテキストで共有。成果物は、いつもの作業環境で確認します。
>
> まずはLPでプチ体験を。
> https://guilduo.com/

PUBLIC確認済みのソース案内として追記できる一文:

> ソースコード: https://github.com/ELRdn/Guilduo

## 実行前に残ること

- LA-08の正式Release・公開ゲート完了と、ひろなおによるX投稿の文案・投稿先アカウントの承認。GitHubの公開切替は不要。
- 公開対象コミット・履歴・アセット・設定を含む公開直前の最終確認。既存の公開前監査を、今回の新しい差分全体の証明として流用しない。
- 新しいHuman確認フローについては、Worker/Webの配備と実Codex/OpenClaw・Pixel 9の受入。完了前に「新機能が本番で使える」と告知しない。

公開切替と投稿はこの作業では実行していない。共有・投稿の文面にQA用の保存データ、ユーザーID、ローカルの認証情報やバックアップを含めない。

## Candidate Release and public Go (2026-10-03)

Draft Release summary (operator approval after source-specific acceptance required):

> Guilduo / Relay Forge coordinates Quests, registered Agents and Human feedback. Free supports two registered Agents; Pro can expand registration when paid service is approved. Official TypeSafe Jev can suggest an eligible Agent and next action; applying the suggestion remains a human decision.

価格/付与量/割引/紹介量は未確定なので掲載しない。「販売開始」「実機受入済み」「72時間安定」とは先行証拠なしに書かない。Stripe Testキー設定/実接続・受入は再開（親担当）。保護者/Stripe資格・販売条件の確認を続け、BM-01の価格/Credits/税/返金/紹介/運営方針は未承認。本番Go未承認、Live不可。既存Testの月USD10/年USD96を公開販売価格へ掲載しない。

公開Goパックにはtarget SHA/tree、候補差分/CI、全先行LA/BMの署名付き証拠、実機/MCP/Live結果、商品/販売者条件、Site/Worker/D1版、rollback先、最終Release文とX文案/アカウントを含める。[具体的前提とチェック表](launch-operations.md)。正式Release URLと配備IDsをLA-08へ、承認済み実投稿URL/UTC時刻をLA-09へ保存してから72時間を開始する。今回は投稿/Release/配備/monitorを実行していない。
