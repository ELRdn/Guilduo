# Human ⇄ Agent 改善の実装・受入記録

更新: 2026-09-07。対象: `codex/lp-product-roadmap`。LP-R01〜LP-R08と、既存のAgentリンク・Skills分類タスクを一括で実装した。コードの完了と本番配備・実機受入は別に記録する。

## 今回の変更

| 対象 | 実装と根拠 |
| --- | --- |
| LP-R01 | Questへサーバーが記録する`requester`と`humanRequest`を追加。安定ID、旧データの不明表示、元の仕事と独立した確認Questを保持。共有型・PROJECT_SPEC・REST/MCP契約を更新 |
| LP-R02 | `request_human_review`・`list_human_requests`、Web回答API、保留・再開・修正FB・変更不要・次の確認ラウンドを実装。人の回答だけが確認Questを完了し、元Quest/Handoff/報酬の重複を防ぐ |
| LP-R03 | 成果物はHTTPSリンクまたは実機など外部で確認。リンクを開いても承認しない明示チェック。実ユーザー・Agent・返却状態を表示。Handoff acceptedを元Quest完了として表示する誤りを修正 |
| LP-R04 | 自分宛ての未対応・保留・回答済み・既読を分ける受信画面。30秒間隔と画面復帰時の再取得。入力中は一覧を再構築せずフォーカスを保持。元Questは最新のRESTレコードを取得して開く |
| LP-R05 | 人に頼る基準、依頼テンプレート、回答待ち・再開・再確認、Vibeコーディング/OpenClawのレシピを両方のWorkflow Skillへ同期 |
| LP-R06 | Agent登録→OAuth→リンク→最初の取得/更新の4段階。OAuth接続とAgent許可の共通部分を表示し、読取専用の原因・設定先を案内。接続だけで起動済みとは表示しない |
| LP-R07 | WorkerのHTTP/MCPと本体UIを組み合わせた自動受入環境、9言語・スマホ幅・エラー経路の再現手順を追加。実Codex/OpenClawと物理Pixel 9での最終受入は未実施 |
| LP-R08 | 保存成功後に限る180msの短い反応。OSのReduced Motionと設定のOFFを尊重。失敗時は下書きを保持し、報酬や元Questを重複完了しない |
| Agentリンクの既存タスク | 既配備の厳格な出力スキーマ、OAuth grant永続化、接続管理権限と実行権限の分離をソースへ統合。既存Cyan-OAリンクを実MCPで再確認 |
| Skills分類の既存タスク | 56ツールを9カテゴリに整理。Human確認ツールの検索・表示、用途別ガイドを追加 |

## ローカル検証

最終結果: **全344テスト成功（失敗・スキップ0）、ブラウザ32シナリオ成功**。API生成、全型チェック、デザイン検査、公開ビルド、`git diff --check`も成功した。両方のSkillと参照ガイドはSHA-256で内容一致を確認。PC/スマホ幅・本体に組み込んだ受信画面と接続案内の画像を目視確認した。

通常の手順:

```sh
npm run typecheck
npm test
npm run api:generate
npm run design:check
npm run build
npm run dev -- --host 127.0.0.1 --port 5183
npm run relay:verify -- http://127.0.0.1:5183
```

`relay:verify`はユーザーのブラウザや認証情報を使わず、一時プロファイルでローカルにだけ接続する。`tests/browser/`は検証用ページで、公開ビルドの入口に含めない。保存先は`.qa-artifacts/relay-product/`。画面だけの検証には本物のドメイン処理を、結合検証には実WorkerのHTTP/MCP・本番用Repository/Runtime/Shellと隔離したメモリ保存先を使う。

確認した内容:

- 旧Questの依頼主不明、認証主体による依頼主の記録、通常の更新による偽装拒否。
- dry-runの隔離、requestKey再送・競合、並行する重複依頼、古いupdatedAt、権限不足。
- 修正あり・変更不要・既読・保留・再開・次ラウンド、回答の再取得と再読み込み。
- Agentによる人の回答・通常完了・全状態上書きを拒否。旧クライアントの同期から確認Quest・履歴・報酬を保護。
- 9言語×320/412/1440pxの受信画面、横はみ出し、明示チェック、Escapeとフォーカス復帰、Reduced Motion。
- 通信失敗と競合時の下書き保持、競合後の確認チェック解除、アニメーションOFF。
- HTTPのMCP依頼→実UIで回答→MCPで回答取得→画面再読み込み。元Questの完了は独立。
- 新着受信時の入力・操作ボタンのフォーカス、特定の依頼を開いた際の見出しへのフォーカス、元Questの実際の依頼主、接続権限の共通部分、Skills検索。

PR前レビューでは、新着の自動更新で操作ボタンのフォーカスが失われる問題をブラウザで再現して修正した。依頼一覧とフィルターの操作中はDOMの置換を保留し、新着件数は更新する。特定の依頼を開く場合はその見出しへフォーカスを移す。文書のYAML字下げも修正し、CIで使う`designmd lint`は両DESIGN.mdとも警告・エラー0で通過した。ブラウザ検証のChrome選択はWindows/Linuxと`QF_CHROME_PATH`に対応する。

このWindowsサンドボックスでは`os.userInfo()`に`uv_os_get_passwd`エラーが出たため、tsxのテスト用一時領域を選ぶ呼出しだけをローカルQA preloadで補った。認証・ドメイン・テスト本体は変更していない。Wranglerのログ先もQAディレクトリへ限定した。通常環境では上記コマンドをそのまま使う。

## 配備・実クライアント・実機

| 項目 | 状態 |
| --- | --- |
| このブランチの契約 | REST/MCP 2.7.0、Schema 7の任意フィールド追加、MCP 56ツール、OpenAPI 60パス |
| 既存の保存容量修正 | 本番配備済み。Worker `d6c519f8-b962-45b7-a3b6-315b68023231`。今回のコードにも保持 |
| 既存MCP接続 | `codex / Cyan-OA`へのリンクが有効、stale=falseを再取得。`agents:write`は接続側の管理権限に保持し、Agentの許可範囲を拡張していない |
| 新しいHuman確認API・UI | この作業では本番Worker/Appwrite Sitesへ未配備 |
| 実Codex/OpenClawで新しい往復 | 未実施。ローカルHTTP試験をクライアントの受入に読み替えない |
| OpenClawのローカルCLI | `2026.9.1 (ad6fe23)`を確認。実接続成功の証拠ではない |
| 物理Pixel 9 | 未実施。412pxのブラウザ検証は画面幅の検証であり実機受入ではない |
| GitHub公開・X告知 | リポジトリはPRIVATEを再確認。公開・投稿は未実施。[告知案](release-announcement-draft.md)を用意 |

## LP-R07の実機受入で行うこと

1. 検証対象のWorkerとWeb Appの配備ID、クライアントのバージョン、Agent IDを記録する。新しい`tools/list`を取得し、56ツールのうち確認依頼の2ツールが見えることを確認する。
2. Humanが専用のVibeコーディングQuestを作り、自分のAgentへ渡す。Agentは取得後に作業を開始し、自動検証を済ませる。
3. Agentが`request_human_review`をプレビューし、同じrequestKeyと最新updatedAtで実行する。人が外部の作業画面で確認し、GuilduoへテキストFBを保存する。
4. Agentが`list_human_requests`から回答を読み、元Questの修正・再確認を行う。人の確認完了、Handoff承認、元Quest完了を個別に確かめる。
5. 変更不要、保留後の再開、途中再接続、重複送信、古い状態、読取専用接続をPCとPixel 9で試す。日英と影響した言語の見切れ・フォーカス・読み上げも確認する。
6. OpenClawの普段の作業環境でも同じ手順を行い、Codexと別に結果を残す。人の操作・感想・最終判断は人が記入する。

配備前・未実施の条件を成功にせず、親計画とLP-R07を未完了で保持する。確認結果とQuest IDは[改善計画](lp-product-followups.md)に対応づける。

## Guilduoへの反映

関連12件のnotes/nextActionを更新し、実装・ローカル検証を完了したLP-R01〜R06・R08と既存2件の計9件を完了・保管した。親計画、LP-R07、GitHub公開・X告知は未完了を維持した。完了の意味は実装とローカル検証であり、本番提供開始ではない。

更新後に全75件を再取得し、9件の完了と3件の残存、元の完了条件・期限・担当・依存関係・親子関係の保持を照合した。対象外63件のQuest内容は変更していない。新規の重複Questは作っていない。
