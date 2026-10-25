---
version: alpha
name: Guilduo Interaction Lab
description: Next surface overrides for Guilduo visual and interaction experiments.
colors:
  primary: "#2E78C7"
  secondary: "#243B3B"
  tertiary: "#B98535"
  neutral: "#F1F0EC"
  surface: "#FFFFFF"
  on-surface: "#20262B"
  on-warm: "#000000"
  line: "#D9DFDA"
  success: "#4F8A6D"
  warning: "#B98535"
  danger: "#BA442F"
  accent: "#4F8A6D"
omitted:
  - section: typography
    reason: "Inherited from the root Guilduo DESIGN.md."
  - section: rounded
    reason: "Inherited from the root Guilduo DESIGN.md."
  - section: spacing
    reason: "Inherited from the root Guilduo DESIGN.md."
components:
  next-page-shell:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "0px"
    padding: "16px"
  next-primary-action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "4px"
    padding: "8px"
  next-completion-action:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-warm}"
    rounded: "4px"
    padding: "8px"
  next-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "4px"
    padding: "16px"
  next-status:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-warm}"
    rounded: "9999px"
    padding: "4px"
  next-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warm}"
    rounded: "4px"
    padding: "4px"
  next-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "4px"
    padding: "4px"
  next-divider:
    backgroundColor: "{colors.line}"
    textColor: "{colors.on-surface}"
    rounded: "0px"
  next-quest-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "4px"
    padding: "16px"
  next-detail-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "8px"
    padding: "16px"
---

# Guilduo Interaction Lab Design

> **English summary:** The Interaction Lab is the local source for the Guilduo Relay Forge beta surface. It tests information architecture, responsive behavior, synchronization feedback, and detail interactions while reusing the current visual constitution and the same authenticated data contracts. The official Web App is `https://app.guilduo.com/`; `/next/relay-forge/` is its deployment and compatibility path. It is not a second domain model and must not silently replace `/`.

最終更新: 2026-08-30
対象: `/next/relay-forge/`（開発元は`/interaction-lab/`、正式入口は`https://app.guilduo.com/`） / `0.6.0-beta.8`候補 / REST・MCP `2.7.0` / Schema `7`
親文書: [Guilduo Visual Constitution](../DESIGN.md)
技術仕様: [PROJECT_SPEC.md](../PROJECT_SPEC.md)

## Human ⇄ Agent Relay（2026-09-07）

- Commandに「自分への依頼」を設ける。未対応・保留・回答済みを文字と件数で分け、既読と完了を別状態として表示する。更新失敗時は一覧と入力を保持する。
- 確認依頼には実際の依頼元、元Quest、理由、確認対象、完了条件を示す。旧Questの不明な依頼主は推測しない。
- 成果物は外部の作業画面で確認する。HTTPSリンクは別タブで開く。リンクを開いたことやEvidenceのプレビューを承認条件にせず、「依頼された内容を確認した」の明示チェックを使う。
- 人は「修正あり」「修正なし」「あとで確認」を選ぶ。修正ありにはテキストFBを必須にし、保留は再開できる。回答済みの履歴は書き換えず、再確認は新しい依頼として表示する。
- 人への確認Quest完了、Handoff承認、元Quest完了を別々に表示する。受け渡し線も承認だけで完了表示にしない。
- 設定のMCP接続は、自分のAgent登録、OAuth接続、Agentリンクと実効権限、最初のタスク受け渡しの順に案内する。ユーザーのAgentを自動起動しない。
- 同じMCP接続で使うAgentは複数選択できる。選択状態を押下状態と文字で示し、0件では保存を止める。複数時は全員の名前を折り返して表示し、権限は呼び出しで指定したAgentごとに適用することを案内する。Agentの自動判別や接続全体の毎回切替を前提にしない。
- 実効権限は各接続内でQuestの閲覧・更新可否を短く示す。スコープ技術名と接続ID、初回操作のMCP手順はnative detailsへ折りたたむ。無効な接続は再接続せず削除でき、確認後に既存の接続解除・履歴削除APIを順に使う。Agent本体とQuestは保持し、取得失敗後は書込みを繰り返さず一覧再取得を案内する。
- 確定済みの受け渡し・回答に限り180ms程度の短い境界線/不透明度変化と読み上げ通知を使う。失敗・保留・再試行を成功演出にしない。既存色と正式アイコンを維持し、reduced motionではアニメーションを止める。
- 新しい操作は9言語、キーボード、390px幅に対応する。Pixel 9実機とデスクトップブラウザの検証記録を混同しない。

## 1. 差分の扱い

この文書はroot [`DESIGN.md`](../DESIGN.md)を継承する。色、文字、Elevation、Shape、状態、アクセシビリティ、Do / Don'tを重複定義しない。ここに書かれていないルールはroot版を使う。Front Matterの`colors`とNext固有Componentだけが例外的な差分であり、`typography`、`rounded`、`spacing`は`omitted`でroot継承を示す。

Interaction Labの目的は、現行版へ昇格する前に新しいUI構造と操作を実データで検証すること。視覚比率はroot版と同じ**運用70%／RPG20%／レトロ10%**を維持する。

## 2. Nextの視覚差分

- 初期Surfaceは青を主要な操作・ナビゲーション・Agent／連携のアクセントにする。
- 完了、承認、Humanの状態はGreenを使い、Blueと混同させない。
- Next固有のBlueは装飾ではなく、AI・連携・選択状態を表す。
- Battle・MP・報酬はroot版と同じOrange／Goldの意味を使う。
- パネルは白い面、細い境界線、控えめな影を基本とし、空白だけが残らないよう概要・現在状態・次の操作を同じ視線内へ置く。

### 2.1 Relay Forgeのブランド例外

`/next/relay-forge/`（開発元は`interaction-lab/relay-forge/`、正式入口は`https://app.guilduo.com/`）だけは、Guilduo E2のForge系パレットを使う。対象はNight Surface `#0F1418`、Forge Teal `#13352F`、Antique Gold `#B89A5E`、Ivory Text `#E7E3DA`と、それらから導く面・境界の補助色である。実装の正本は同ディレクトリの`tokens.css`とする。

- Human、Agent、RPG、Dangerの意味色は維持し、ブランド色で上書きしない。
- root `/`、旧`/next/`、`/interaction-lab/`のGolden Reference、LP、Battle/Unity関連Surfaceへこの例外を波及させない。
- RelayのRailには背景なしAntique Gold単色マークを使い、通常のPWA・共有画像とは役割を分ける。
- AI生成画像を起点にした暫定トレース版だが、権利・第三者類似性確認とひろなおの公開β採用承認を2026-08-29に記録済みである。公開Web Appへの反映後も、正式リリースタグや外部表示の追加判断は別ゲートで行う。承認は商標登録や法務意見を意味しない。

`/interaction-lab/`はローカル開発・キャプチャ用のソースルートで、Viteのビルド後に同じSurfaceが`/next/relay-forge/`へ出力される。データモデル、認証、API、MCPはrootの[`PROJECT_SPEC.md`](../PROJECT_SPEC.md)から差分を作らない。正式URL・互換pathの対応は[`docs/public-urls.md`](../docs/public-urls.md)を参照する。

## Productivity workspace (2026-10-12)

- Desktop rail: Home (`command`), Quests, Calendar, Notes, Party, Connections, More, Settings. Mobile: Home/Quests/Calendar/Notes + More. Existing auxiliary destinations stay reachable through More.
- Quests preserves filter, selection and detail state across Board/List/Gantt. List is the initial view. Gantt scroll is contained inside its labelled region; mobile does not acquire page-wide horizontal overflow.
- Calendar starts in month mode, offers week mode, independent filters, date navigation and common Quest detail. Notes uses list/editor on desktop and list-to-editor navigation on mobile, with explicit save/discard/cancel for dirty navigation.
- A shell-owned native timer is visible across destinations. Mobile reserves space for the timer, existing sticky actions and bottom navigation. Drafts and focus survive timer ticks; ticks update elapsed text only.
- Settings includes private work-time source, export/restore and confirmed deletion. Loading/error/stale data stays explicit; a missing backend never pretends to save a demo.
- Calendar additionally offers Day view. Day/Week time axes support mouse press-and-drag and touch long-press selection on empty space, snapping to 15 minutes and showing a range preview. Ordinary touch swipes scroll. Escape/pointer cancellation cancels selection; arrows/Shift+arrows and Enter provide a keyboard path. Selection opens an explicit choice between recording work and scheduling a Quest, never saving automatically. Existing event dragging/resizing remains outside this change.

## UX consolidation (2026-10-13)

- Quest作成の入口はDesktopの上部操作バーに1つだけ置く。Quests画面見出しの重複ボタンは置かない。Mobileはホームヘッダーと Quests の下部操作から作成できる。
- 作業タイマーは保存先（productivity port）がない場合は描画せず、固定領域も確保しない。稼働していない間は経過時間を隠し、ノートへの移動は既存ナビに任せる。保存先がない状態の通知に効果のない再読込を付けない。
- Quest詳細の次の操作に「担当を変更」を置き、共通Quest編集を担当欄へフォーカスして開く。完了・保管済み・Human依頼には出さない。
- カレンダー月表示で期間内の項目が0件の場合は、空であることと週表示への切替を示す。

## All for ADHD（2026-10-18、試作）

- `interaction-lab/all-for-adhd/`（ビルド先 `/next/all-for-adhd/`）は、Relay Forge と同じ認証・Repository・Quest・Agent を使う並行UIである。API、MCP、スキーマ、Agent/Handoff の方針は変えない。パレットとトークンは Relay Forge の `tokens.css` をそのまま使う。
- 画面は「今」「予定」「やること」「設定」の4つに絞る。「予定」は週ストリップと1日のタイムライン（いつでも／時刻つき、現在時刻、30分以上の空き）で、Desktopでは左に受け箱を並べ＋で選んだ日に入れる。「日／週」で切り替え、週は Tiimo 型のグリッド（曜日見出し、いつでも行、1時間刻みの軸、所要時間に比例したカード、重なりは2レーンまで並べ、それ以上は「+N件」にまとめて押すとその日の日表示を開く、現在時刻線）にする。作業中のタスクは、時間軸の帯と週のカードが経過時間に合わせて上から塗られていく（1秒ごと、Reduced Motion では補間なし）。週表示では受け箱をグリッドの下へ移す。Questの詳細はシートで、タイトル・次の一歩・日付・時刻・目安・締め切り・メモ・小さなステップ（子Quest）を編集する。作業中のQuestは他の画面でも下部のドックに残る。「今」は自分のQuestを1件だけ大きく示し、主操作は「始める」または「完了」の1つにする。「今」には今日のタイムラインも並べる（2026-10-25 オーナー決定、[取り込み計画](../docs/research/2026-10-25-rea-adoption-plan.md)）。1100px以上は左に今のカード（最大440px）、右にタイムライン、それ未満は縦に積む。上に日付を 48px・weight 300・字間 -0.02em（スマホ 40px）で置き、曜日を小さく添える。タイムラインは白いパネルの中に Structured 型の等間隔の行（時刻・ピル・カード）を並べ、所要時間は行の高さではなくピルの高さ（40〜96px）で示す。カードはタスク色を薄く塗り（ライト16%、ダーク20%）、左に3pxの色帯、作業中は色の枠で囲む。これから先の15分以上の空きは破線の円と「{時間} 空いています」で示し、次の空きにだけ提案（受け箱から目安が収まる1件、「休む」）を出す。それ以降の空きは「提案を見る」で開く。受け箱の1件を選ぶとその時刻に入れ、「休む」はこの画面だけの休憩表示にする。どちらも確認を出さず「元に戻す」を出す。1時間以上前に終わったものは「それより前」にたたむ。完了した行はピルと時刻を薄く（0.55）し、タイトルに取り消し線を引く。「予定」の日表示は所要時間に比例した行のまま。
- 書き出しは全画面共通の1入力欄で、Enter で受け箱へ、「今日やる」を押した状態なら今日へ入れる。
- 時間は入力させず、5/15/30/60分のチップと経過リングで見せる。今日の合計目安を表示する。
- 完了・日付変更は確認ダイアログを出さず、5秒の「元に戻す」を出す。完了の送信は取り消し猶予の後に行い、画面を離れる時は保留中の完了を送る。
- 期限切れは赤で積み上げず「日付を見直す」として示す。毎日のタスクは開始日・期限に関係なく毎日「今日」に出し、その日に終えたかどうかでチェックを付ける。完了したタスクは担当状態が作業中のままでも作業中として扱わない。子タスクは親の行に折りたたみ、開くと順番どおりに並べる。着手できる最初の1件に「次はこれ」、先にやるタスクが残るものに「待ち（LA-01 のあと）」を付ける。「今」は親ではなく着手できる子タスクを1件ずつ出し、待ちのものは出さない。子タスクの詳細シートは上部に親へ戻るリンク、完了の条件、先にやることを出し、親のシートのステップからも子のシートを開ける。タイトルと次の一歩は折り返して全文を見せ、入力上限はサーバーと揃える（次の一歩・メモ180字、完了の条件300字）。Agent担当と判断待ちは別グループにし、判断は Relay Forge で行う。
- 配色は Spine（2026-10-25 オーナー決定で Bloom から置き換え。出典は REA 競合リサーチの合成案、[取り込み計画](../docs/research/2026-10-25-rea-adoption-plan.md) §4.7）を初期値にする。地は平坦で、グラデーションとすりガラスは使わない。ライトは温かい紙色の地（#FBFAF7）、文字 #17161A、主ボタンは深い緑（#2F5D50）、現在時刻はコーラル（#E2725B）。補助文字は Spine の #8E8B95 ではコントラストが足りないため #6F6C76 にする。ダークは Guilduo のブランド色を土台にする（オーナーがダークの緑の主ボタンを望まなかったため）：地 Night Surface #0F1418、選択 Forge Teal #13352F、文字 Ivory #E7E3DA、主ボタンと完了は Antique Gold #B89A5E（文字は Night Surface）。自分のタスクは id から決まる5色（Spine の低彩度のカテゴリ色：clay・mustard・plum・sage・slate）でピルとカードと週の点を色分けし、Agent担当は indigo、判断待ち・完了は意味色のままにする。未完了のチェック円はタスク色で描く。紙吹雪も同じ色相の明るい版を使う。設定でオフにすると Relay Forge のトークンへ戻る。
- 「ギルド」タブ（2026-10-18）は AI 連携の入口。判断待ち（Agent からの確認依頼と、Agent の「終わった」報告）を「今」と同じく1件ずつ大きく出し、「中身を確認しました」に印を付けてから「OK」「直してほしい（コメント）」「あとで」で答える。送信は Relay Forge と同じく dry run の後に本書き込みをする。その下に「人と Agent」（自分・仲間・Agent ごとに、いまやっていることを状態つきで最大3件）と「最近の活動」（`/v1/events` の直近10件を「だれが・何を・どのタスク」の1文で。MCP 経由は Agent、それ以外はあなた）を並べる。Agent の登録と「外す」（Relay Forge の削除と同じく archived にする。担当中の件数を添えて確認してから）もギルドで行い、名前・役割・ID・「見るだけ／タスクを進める」・確認待ちの有無だけを聞く（スコープの細かい設定は Relay Forge）。判断待ちの件数はタブに出す。判断カードは「確認すること」の1行だけを大きく出し、理由・完了の条件・報告は「詳しく」にたたむ。強調は色枠ではなく左の色帯で示す。詳細シートはタイトルを見出しとして置き、日付・時刻・目安・締め切り・メモはチップにして、押したものだけ入力を開く。時刻は始まりと終わりで入れ、終わりは目安（分）に換算して保存する。目安は 5分〜2時間のチップに加え、時間と分で24時間まで自由に入れられる。入力欄は塗らない。「担当」は縦に流れるリレー（自分 → Agent（頼みごとの一言つき）→ 最後に自分が確認）で、つなぎ目ごとに「確認を挟む／そのまま次へ」を選べる。Agent はタップかドラッグで足し、ドラッグ（タッチは長押し、キーボードは Alt+↑↓）で並べ替える。渡し済みの区間は動かせない。保存前に渡す相手と流れを文章で示す。複数 Agent のリレーは保存先が決まるまでデモだけで動かし（2026-10-18 オーナー決定）、実アカウントでは Agent 1人まで。設定に「MCP 接続」を置き、接続URL（Gateway から導出）のコピーと、接続済みクライアントごとの Agent 紐付け（複数可、最初の Agent が既定）を行う。
- 起動画面（確認中・読み込み・サインイン・エラー）は、背景の上に中央寄せの1列で、ワードマーク・見出し・1行の説明を並べる。読み込み中は「今」のカードの輪郭を薄く出し、Reduced Motion でなければゆっくり明滅させる。サインイン画面は約束を3つだけ添え、主ボタンは横幅いっぱいにする。日本語の見出しは文節で折り返す。
- 完了時は紙吹雪で祝う（2026-10-18 オーナー決定、BRAND.md の「装飾的な粒子を避ける」に対する All for ADHD だけの例外）。完了の直後だけ、タップ位置から約1秒、繰り返さない。その日の最後の1件を終えたときは大きめにし「今日の分、ぜんぶ終わりました！」と出す。色はタスク色。Reduced Motion では出さず、設定でオフにできる。
- ゲーム要素（レベル・XP）は初期表示し、設定で隠せる。Reduced Motion では動きを止める。
- Relay Forge の全機能を段階的に移す（2026-10-22 オーナー決定）。第1段：「やること」に検索（完了・しまったものも対象）と「戻す」、詳細シートに「しまう」（トーストと検索から戻せるので確認なし）。第3段（オーナーFB 2026-10-22）：重なる機能はタブへ統合する。予定に「月」（週と同じ書き方の月グリッド：日付の見出し、1日3件までのピル、「+N件」でその日を開く。スマホは点だけで、タップでその日を開く。2026-10-22 オーナーFBで Relay Forge のカレンダー埋め込みから置き換え）、今の「始める／一時停止／完了」は時間の記録も開始・停止し、記録と履歴は今の折りたたみに、時間の設定は設定に置く。やることは「まとめ／表・ボード・ガント／メモ」、ギルドは切り替えずに1画面：「人と Agent」の各行に負荷バー（未完了の担当を状態別に積み、いちばん多い人を基準に長さをそろえる。赤は使わない）を置き、Relay Forge のパーティ画面は使わない。埋め込みでは Relay Forge の見出しを隠し、タブの見出しを使う。設定に残すのはプロフィール、つながり、バトル、連携、スキル、プラン。以前の第2段：設定の「ほかの機能」から、プロフィール（自前フォーム）と、Relay Forge のカレンダー・メモ・時間の記録・プラン（`productivityWorkspace` / `createBillingUi` / `createAnalyticsUi`）、一覧・ボード・ガント、つながり、パーティ、バトル、連携、スキル（`forge.ts` が Relay Forge の model・renderer・port をそのまま組む）を開く。5つのタブは増やさない。Relay Forge 部分は `forge-skin.css`（`.a4-extra` 限定）で AFA の書き方に揃える：書体は sans 1つ、ラベルは大文字化しない、角丸カード、切替はピル、44px のターゲット、状態は淡い塗りのピルで赤を使わない（停止・失敗は amber）、MP は紫を使わない、固定高の内側スクロールをやめてページでスクロールする（つながりの図だけは高さを持つ）。見出しは各画面の日本語名に差し替える。Relay Forge の foundation.css は読み込まず、必要なリセットは詳細度0で同じファイルに置く。MCP 接続は設定で切断できる（確認を1段挟む）。
- 文言は Guilduo の9言語（ja, en, es, pt-BR, fr, de, ko, zh-Hans, ru）で出す。日本語の原文をキーにした `copy.ts` の `tx()` を通し、`tests/all-for-adhd-copy.test.ts` が全キーの8訳とプレースホルダの一致を確かめる。言語は Relay Forge と共有（`questforge-locale`）し、設定で切り替えると再読み込みする。日付・時刻は `Intl` で言語に合わせる。デモの中身は Relay Forge の共有フィクスチャなので日本語のまま。調査と計測は [docs/research/2026-10-18-all-for-adhd-brief.md](../docs/research/2026-10-18-all-for-adhd-brief.md)。

## 3. 画面マップ

| View | Nextで検証する差分 |
| --- | --- |
| Today | 中央Quest一覧だけのスクロール、Shift範囲選択、詳細表示 |
| Quest Tree | インデント、進捗集計、保管表示の切り替え |
| Battle | 大きなステージ、キャラクター・ボス・MPの視認性 |
| Party | ユーザー本人、Astra、Agentの関係と担当情報 |
| Integrations | 接続状態、対象サービス、プレビュー、再接続導線 |
| Profile | 本人のプロフィールとAstraの相棒設定の分離 |
| Settings | 表示密度、文字サイズ、詳細モード、Agent Registry |

共通のQuest、Battle、Agent、Handoff、認証、API契約は[`PROJECT_SPEC.md`](../PROJECT_SPEC.md)を正本にする。

## 4. 起動・同期状態

Nextはページ更新時にFirebase Authを復元し、ログイン済みユーザーの本体データをWorkerから取得する。ローカル状態はゲスト利用、表示設定、前回スナップショットに限定する。

```mermaid
stateDiagram-v2
  [*] --> local
  local --> auth-checking: Firebase Auth復元開始
  auth-checking --> syncing: 認証済み・本体取得
  auth-checking --> local: 未ログイン
  syncing --> synced: 全体取得成功
  syncing --> stale: 前回スナップショットで表示
  syncing --> error: 取得失敗
  stale --> synced: 再接続成功
  error --> reconnect: 再接続する
  reconnect --> syncing: 再試行
  synced --> stale: 接続断・更新遅延
```

- 認証復元中は状態を`auth-checking`として表示する。
- 同期中はQuest一覧を消さず、読み取り専用スケルトンまたは前回データを表示する。
- 同期中の完了、編集、保管、Agent変更はロックする。
- 失敗したパネルだけにエラーと再試行を表示し、正常なQuest一覧を捨てない。
- UIDが変わった場合は前ユーザーのスナップショットを再利用しない。
- Relay ForgeのQuest編集・開始・停止・保管・完了は表示時の更新日時で競合を検知する。競合時は入力を保持し、編集を閉じて最新状態を取得する案内を9言語で表示する。完了済みQuestを古い画面から再完了して再開させない。
- Quest作成・編集で応答が失われた場合も、入力をコピーできる状態で再送を止める。編集を閉じて一覧を読み直し、実際の保存状態を確認する。保存失敗と断定して重複作成を促さない。

## 5. Todayのレイアウト差分

### Desktop / Tablet

- 左レールは216〜232px、上部ステータスは96〜110pxを基準にする。
- 右サイドバーは280〜320px、中央Quest一覧が残り幅を使う。
- 901px以上では左ナビ、上部ステータス、右サイドバーを固定する。
- 中央のQuest一覧だけを縦スクロールする。
- 右サイドバーは内容が溢れたときだけ内部スクロールする。
- 1180px以下では列を段階的に縮小し、Quest番号、ひし形、タイトルを重ねない。
- 長文タイトルはタイトル領域だけで折り返し、進捗・担当・期限の列を押し出さない。

### Mobile

- 900px以下ではページ全体をスクロールする。
- Quest一覧の独立スクロールを解除する。
- 詳細は下部シートを標準とし、ポップアップ表示へ切り替えられる。
- 下部ナビと詳細シートに隠れないよう、一覧末尾へ余白を確保する。
- 390px、412px、Pixel 9相当幅で長い日本語・英語・ドイツ語・ロシア語を確認する。

## 6. Next固有の操作

### Quest選択

- 通常クリックはQuest詳細を開く。
- Shiftクリックは表示中のQuest行をアンカーから範囲選択する。
- Ctrl／⌘クリックは個別追加・解除する。
- 選択行はBlueの背景または境界線、件数表示、`aria-selected`で示す。
- 最大100件。非表示の保管済みQuestや折りたたみ中の子Questは対象外にする。

### Relay Forgeの選択安定性とNetwork Canvas

- CommandのQuest Loomは選択によって行順を組み替えない。選択、上流、下流の関係だけを更新し、クリックした行の画面内位置とスクロール位置を維持する。
- Quests Portfolioも選択だけでは一覧スクロールを動かさない。フィルター、ソート、画面遷移は新しい一覧条件として先頭から表示する。
- Networkの関係図は固定Viewportへノードを圧縮せず、最大4列の固定間隔World Gridへ配置する。選択対象を読みやすい倍率で中央表示し、パン、ホイール／ピンチズーム、中心復帰、全体表示を提供する。
- Networkのカメラ操作はWorldレイヤーのtransformだけを更新し、画面全体の再描画やページスクロールを発生させない。
- Mobileは関係図を縮小せず、同じ関係データを上流・中心・下流のOutlineとして表示する。

### 詳細表示

- Desktopでは右パネルへ表示する。
- Mobileの標準は下部シートで、閉じた状態でも選択Quest名を確認できる。
- ポップアップモードでは背面を適切に遮光し、Esc・閉じる操作・フォーカス復帰を提供する。
- 詳細アクションは`完了`、`確認`、`編集`、`保管`、`戻す`の短いラベルを使う。

### Agent・プロフィール

- ユーザー本人はAppwriteアカウントの所有者として表示する。
- Astraはユーザーが選んだ相棒キャラクターであり、Agentではない。
- AgentはAI作業担当の台帳エントリとして表示する。
- MCPクライアントはAgentへ接続する手段として表示する。
- Partyは作戦上の所属、Profileはユーザー本人の情報として分離する。
- SettingsのAccountはprofile=nullを初回empty stateとしてフォーム表示し、保存時に既存のprofile upsertを呼ぶ。読み込み通信エラーとの表示を混同しない。
- 本人AvatarはAgent Avatarと同じ認証済みBlob fetch、MIME/サイズ検証、version付きstale invalidationの境界を使う。公開`img src`やdata URLの永続保存は行わない。
- 固定デモAgentを実アカウントへ混入させず、登録済みAgentと実際の担当Questを表示する。
- Partyが未作成でもサインイン中の本人をHumanとして表示し、空のAgent台帳から登録を開始できる。
- Agentの作成・編集は公開済みAgent Registry APIへ接続し、保存成功後はPartyとQuestの担当候補へ即時反映する。

## 7. Next固有コンポーネント

root版のコンポーネントを継承し、次だけを実験対象にする。

| Component | 実験内容 |
| --- | --- |
| `next-page-shell` | 固定Top StatusとSurface切り替え |
| `next-status-strip` | Level、Focus、Quest Line、MP、Boss Pressureの密度 |
| `next-quest-row` | 番号、選択、階層、長文、進捗、担当のグリッド |
| `next-detail-sheet` | Mobileの下部シートとポップアップ比較 |
| `next-sync-banner` | 認証・同期・再接続の可視化 |
| `next-agent-panel` | Agent RegistryとMCPクライアントの実データ表示 |

新しいコンポーネントを追加する場合は、root版の意味トークン、状態、アクセシビリティ、Do / Don'tに従う。Nextだけの新色、角丸、影、モーションは作らない。

画面Blueprint、共通部品の詳細、アセット用途はそれぞれ[`design/SCREENS.md`](../design/SCREENS.md)、[`design/COMPONENTS.md`](../design/COMPONENTS.md)、[`design/ASSET_MANIFEST.md`](../design/ASSET_MANIFEST.md)を参照する。

## 8. 検証と昇格ゲート

### Browser validation

- 1920×1080、1440×900、1280×720
- 1180px、1024px、901px
- 412×915、390×844、360px
- 長文Quest、日本語、英語、ドイツ語、ロシア語、中国語、韓国語
- Appwriteログイン済みPC・Pixel 9の更新、同期、再接続
- Quest追加、編集、完了、保管、復元、Shift複数選択
- Agent登録、MCPクライアント紐付け、Quest割り当て、Handoff
- 下部詳細シート、ポップアップ詳細、キーボード操作、ARIAラベル

### Promotion gate

Next版は、次の条件をすべて満たした場合だけ人間の承認で`/`へ昇格する。

1. 既存ユーザーのQuest、キャラクター、Agent、Handoffを壊さず表示できる。
2. PCとPixel 9で更新後の認証復元と同期が成功する。
3. 同期失敗、古いデータ、再接続、書き込みロックが確認できる。
4. 9言語で主要操作の未翻訳、重なり、横スクロールがない。
5. MCP読み取り、dry-run、確認後書き込み、Agent割り当て、レビュー返却が動作する。
6. キーボード、スクリーンリーダー、Reduced Motionの検証に合格する。
7. LCP、INP、CLSの目標と既知のエラー基準を満たす。
8. `npm run check`、`npm test`、`npm run build`、契約差分確認が成功する。

昇格は自動化しない。Nextの実験変更はこの文書へ記録し、共通データ・API・認証の変更は[`PROJECT_SPEC.md`](../PROJECT_SPEC.md)を先に更新する。

### 2026-09-07: 初期表示と保存の待機状態

- Command/QuestsはQuest・プロフィール・Agentの読込後に表示し、補助情報の完了を待たない。
- 補助画面は既存トークンで見出しと読込状態を表示し、失敗時に説明と「再試行」を置く。未取得のデータを空・成功・fixtureとして表示しない。
- 補助情報の到着時にQuestや編集中のフォームを置換しない。サインアウト済みの画面へ遅れて応答を反映しない。
- 編集は「変更を保存しています…」、完了は「完了を保存しています…」と表示し、確定はサーバー応答後に行う。

### 2026-10-02: ローンチ導線と操作の保持

- 上部検索は実装済みのQuest検索だけを案内する。Ctrl／⌘Kで開き、モーダル操作へ割り込まない。再描画後も入力フォーカスとカーソル位置を保持し、IME変換中には入力欄を交換しない。
- 初回Lensは1600px以上で開く。中間幅の作業開始をscrimで遮らず、明示した選択・判断操作で必要時に開く。
- デモはPCの上部とスマホMoreの説明で区別し、どちらにも正規サインインへ戻る導線を置く。スマホのログアウトもMoreから実行できる。
- 初回認証・接続失敗・再試行に9言語の文面とnative言語選択を使う。Privacy／Termsリンクは既存トークンと明示フォーカスを継承する。全画面の完全翻訳は未受入。
- Quest／Agent保存中は重複送信とダイアログを閉じる操作を止め、成功後に閉じる。本人／Agent画像選択はnative buttonとfile inputを使い、Enterで実行可能にする。
- 完了後のBattleはサーバーの報酬・MPを再取得し、再取得失敗には説明と再試行を置く。実アカウントの未取得Battleへデモを混入させない。
- [検証記録](../docs/launch-readiness.md)。Golden Reference、パレット、アセット、API／Schemaの互換識別子は維持する。

### 2026-10-02: 共通操作とQuest多言語表示

- フィルター／並び順は1つのTab入口、矢印の循環、Home／Endで選択し、再描画後も同じ項目へフォーカスを戻す。Quest portfolioは表をTab入口にし、矢印で選択を移す。
- Quest画面のUI文・空状態・詳細・ARIAを9言語化する。ユーザー本文は保持。期限は日付のみとしてUTCでIntl表示し、更新日時は端末時刻、経過時間はduration、件数はICU複数形を使う。
- 状態チップは狭い列で折り返し、役割・状態語を欠けさせない。詳細の保持時間も折り返す。既存トークン・glyph・配色を継承する。
- 共通状態通知の見出しと確認操作を翻訳し、実行中は確定・取消の両方を止める。Shell／他画面の全訳、実機・読み上げ受入は継続中。

### 2026-10-02: Settingsと画像保存の操作保持

- Settingsの固定UI・案内・主要通知を9言語化する。テーマのnative radioと言語のnative selectは、再描画後も操作した項目へフォーカスを戻す。通常の再描画で見出しへフォーカスを奪わない。
- プロフィールと本人画像は同時に保存しない。Handleの30日制限をフォームに示し、既知エラーは選択言語で表示してdraftを保持する。
- Linked Agentはnative button／aria-pressedで選び、開く・取消・保存後のフォーカスを保持する。保存中の選択・取消・重複送信を防止する。
- Agent画像の処理中は保存・再選択・閉じる操作を止め、処理結果を確認できる状態で再開する。新しいダイアログへ保留画像を持ち越さず、破棄したShellへ結果を反映しない。共通画像検証の形式／サイズ／decodeエラーも9言語で伝える。
- Quest作成／編集は固定の入力DOMを保持し、ラベル・案内・見出しだけを言語変更に追従させる。タイトル・次の一手・見積0分とフォーカスを保持し、保存中は保存状態を表示する。
- Quest／Agent保存中は入力欄も止める。送信後に編集した内容を保存成功で閉じて取りこぼさず、失敗後は保持した入力から再試行できる。
- Agent編集の固定文・状態・既知エラーは言語変更に追従する。権限と指示の入力DOMを保持し、Agent ID重複は更新競合と区別する。新規Agentの状態は既存APIどおりActiveへ固定し、登録後に無効化できることを説明する。
- スマホMoreを開いている間はnavの親stacking contextも既存popoverトークンへ上げ、Commandの判断バーに項目を覆わせない。通常タップと画面中央のhit testで確認する。

### 2026-10-02: Partyの操作と多言語表示

- Partyの固定UI・状態・プロフィール・権限ラベル・ARIAは9言語で表示し、ユーザー名やQuest本文を翻訳しない。件数と保持時間の文言を区別する。
- Desktop一覧は選択ActorだけをTab入口にし、矢印とHome／Endで選択・フォーカスを移す。Mobile詳細は戻るボタンへフォーカスし、戻ったら元Actorへ復帰する。Agent編集から閉じる操作も元のボタンへ戻す。
- 保管済みQuestを現在負荷へ混ぜず、完了したQuestの受け渡し履歴は保持する。CompanionとAgent、レビュー必須の設定と現在のレビュー待ちを区別する。
- 901〜1300pxの一覧は既存の4情報を2列へ配置し、名前を読める幅で折り返す。状態チップも折り返し、長い翻訳を列からはみ出させない。既存トークン・色・glyphを継承する。

### 2026-10-02: Command判断の入力と結果保持

- 判断・修正依頼・既知エラーは9言語で表示し、受け渡し承認とQuest完了の違いを案内する。修正入力は言語変更でdraft・フォーカス・選択範囲を保持し、IME変換中はDOMを置換しない。
- 送信中は判断・入力・取消・中央からの再開始を止め、失敗後はdraftから再試行する。完了／保管済みQuestへ変更操作を出さず、回答済みHuman依頼は履歴を開ける。
- 判断結果は操作元Questに表示する。別Questへ移った後の応答が新しい入力・確認チェック・選択フォーカスを上書きせず、対象Questの実データだけ更新する。

### 2026-10-02: Networkの関係表示と移動

- 固定UI・関係理由・ARIAは9言語で表示する。ユーザーのタイトル・Actor名・記録済み停止理由は保持する。保管済みQuestを除外し、完了済みの関係履歴は停止扱いしない。共通の待機Questを重複計上しない。
- グラフは選択ノードだけをTab入口にし、矢印で移動、Enterで中央へ寄せる。移動・戻る・言語変更後のフォーカスとカメラを保持する。map操作は44pxの標的を確保し、長いラベルは折り返す。
- 一覧は独立したスクロール領域を使う。スマホのlane開閉は操作ボタンへフォーカスを戻す。戻る操作は共有Quest選択も更新し、Actor／Connectionを開く操作は対応する詳細を選ぶ。パレット・glyph・トークンを継承する。

### 2026-10-02: Skillsの検索と分類

- 固定UI・分類・状態・ARIAを9言語で表示する。MCP技術名と接続先が提供するタイトル・説明は保持する。件数は共通のICU表示を使い、長い分類・技術名を折り返す。
- 検索は既存searchFieldを使い、余白・カーソル・選択範囲・フォーカスを保持する。IME変換中は再描画を止め、確定後に言語変更も反映する。検索条件の変更で分類の開閉状態を消さない。
- 分類の開閉はnative button、44px、aria-expanded／aria-controlsを使う。参照先はhiddenで保持し、再描画後も元のボタンへフォーカスを戻す。スマホでも利用状態のテキストを表示する。検索枠は外側だけに明示フォーカスを表示する。

### 2026-10-02: Connectionsの操作と実接続表示

- 固定UI・状態・結果・確認・ARIAを9言語化し、必要スコープは中立で表示する。付与済み権限の取得不能と、接続操作を手動で開始することを明示する。Providerのアカウント名とエラー、Quest本文は保持する。
- プレビュー・実行・確認は接続IDへ結び、選択やfilterの変更でプレビューを消す。処理中は選択変更でも保留を維持し、古い結果を新しい接続へ出さない。例外を表示して操作ガードを解除する。
- Google解除はCalendar／Tasksの両方へ及ぶこととQuest保持を確認に示す。Togglは専用操作と区別する。Tasks双方向、Calendar取り込み、Notion書き出しを実処理に合わせて表示する。
- 同期／解除後は接続と全Questを再取得する。取得失敗は接続を切り替えても読取再試行を残し、同じ変更を繰り返さない。状態の再取得までHuman返信を含む共有UIの書込みを保留する。
- Desktop一覧は選択行だけをTab入口にし、矢印／Home／Endで選択とフォーカスを移す。Mobile詳細は戻るボタンへ入り、戻ったら元カードへ復帰する。言語変更や再描画でも操作位置を保持する。
- 901〜1300pxでは一覧情報を2列へ配置し、状態と同期履歴を折り返す。操作ボタンは文字の高さへ伸び、320pxの長い翻訳も縦横に欠けさせない。既存の色・glyph・トークンを継承する。


### 2026-10-02: Battleのプレビューと状態回復

- 固定UI・状態・エラー・人の判断記録・ARIAは9言語で表示する。保存済みの戦闘ログとスキル固有名、Quest本文は保持する。勝利・敗北はラベルと意味色を区別する。
- 通信中は取消・別コマンド・重複実行を止め、プレビューのTurn／MP／両HPを現在状態と照合する。実行にはプレビュー時のTurnと一意Command IDを使う。古いプレビューには再確認の説明を置く。
- 実行の応答が失われた場合は、読み取りで最新状態を回復するまで共有書込みを保留する。再読み込みは一度だけ進め、成功時に古いプレビューを消す。初期取得・読み取りの遅延応答が新しい状態を覆わない。
- 再描画で操作位置を保持する。通信中のフォーカスは状態表示へ、プレビュー完成後は実行ボタンへ移す。Mobile履歴はnative buttonのaria-expanded／aria-controlsとhiddenを使い、MP獲得Questへの導線も置く。
- 901〜1180pxでは作戦領域を縦積みにする。Desktopの履歴領域は内部スクロールを使い、長い翻訳やプレビューで画面高を超える場合は画面もスクロールして全操作へ到達できる。Mobileボタンは文字に合わせて高さを伸ばす。既存パレット・トークン・アセットを継承する。

### 2026-10-02: Commandスマホの選択と開閉

- スマホ固定UI・ARIAは9言語、件数と保持時間は既存ICU／Intlを使う。同期状態を書込み保留から推測せず、未取得のAgent実行を空状態で断定しない。成果物がなければ確認を無効化する。
- 棚は選択項目だけをTab入口とし、矢印／Home／Endで選択とフォーカスを移す。前後操作は端で無効化し、明示的な選択変更以外は手動スクロールを保持する。スマホのフォーカスを隠れたPC部品へ戻さない。
- 証拠・補足・履歴の開閉はnative buttonのaria-expanded／aria-controlsとhiddenを使い、再描画後も操作元へ戻す。最後の担当者も同じ列へ並べ、長い見出し・ボタンは既存トークンの範囲で折り返す。
- 無動作のその他ボタンと、実際の選択肢がない作成矢印は表示しない。作成は1つの翻訳済みボタンから開く。PC部品とproductionモデルの全訳受入は継続する。

### 2026-10-02: Command PCと通知の言語追従

- PC固定UI、状態、日付、件数、保持時間も選択言語へ追従する。保存済みQuest本文・Actor名・履歴とBlob参照を保持し、本人名未設定時の表示だけを翻訳する。完了済みHandoffの作業状態と次の担当者を区別する。
- プレビューと履歴の参照先をhiddenで保持し、閉じる際は元の成果物行／操作へ戻る。コンパクトなLoomでもQuest名と状態を読み上げ可能にする。長い棚見出しを既存トークンで折り返す。
- 作業保存の保留・成功・失敗はPC中央とスマホで読める。言語切替で通知を更新し、未知APIメッセージは表示しない。Handle制限・画像検証・未確認応答の具体的な案内は維持する。
- 棚は初回と明示的な選択で整列し、再描画では手動位置を保つ。検索のIME確定後の再描画でも入力・選択範囲・フォーカスを保持する。
### 2026-10-02: Workspaceの再取得と復旧

- 別端末・MCPの変更を、表示中30秒間隔と画面復帰・接続復旧・明示的な再取得で取り込む。同期中も表示を残し、変更操作を止める。入力中の編集は保留して守る。
- 再取得前後でページと画面内一覧のスクロール、開いた補足説明を保持する。通信待ちの間にユーザーが動かした位置を古い位置へ戻さない。
- スマホは最上部から1本指で下へ引き、離すとデータだけを再取得する。短い引き・横スワイプ・複数指・取消・入力・モーダルを除外し、連続取得はまとめる。既存の更新ボタンを残し、既存色の短い状態表示を使う。ページ再読込と書込みの再送は行わない。
- Moreにもキーボードで操作できる更新ボタンを置き、実行後はMoreへフォーカスを戻す。タッチ操作を必須にしない。
- Commandは既存の同期表示と再取得操作、他画面は既存の状態通知と再試行を使う。初期データの取得時刻と同期状態を区別し、エラーに内部応答を表示しない。
- 選択・検索・修正draft・フォーカス・画像参照を保持する。取得失敗は前回データと再試行を残し、途中の成功や未取得パネルを同期済みと見せない。
- 設定のAgent一覧は通信中も保持し、登録・編集だけを無効化する。再試行後は元の同期操作または画面見出しへフォーカスを戻す。選択Questが外部更新された場合、以前の明示確認を破棄して修正draftとカーソルを保持する。
- ローカル実Chrome2クライアント＋HTTP Workerで同期12シナリオ、9言語×320／412px、200件超の初回取得と再取得を検証。全442テスト、主要画面70、Command131／公開用96、操作404／公開用343、ローンチ55／公開用40成功。物理Pixel 9・実Google認証・読み上げ・本番性能の受入は継続する。

- 本人／Human担当のCommandは実際の担当者を1段で示し、存在しないAgentへの受け渡しを作らない。別のHumanの名前と本人画像を混同せず、未着手・現在担当・完了を区別する。

### Quest Flowのモーダル隔離（2026-10-02）

- スマホのQuest Flowはnative dialogのshowModalで開き、背面の操作をフォーカス・読み上げ対象から除く。aria-modalの指定だけで隔離済みと判断しない。既存のパネル・scrim・動き・翻訳見出しを保持し、二重dialogを作らない。
- 閉じる・Escape・scrim・選択後の閉じるとトリガーへのフォーカス復帰を維持する。破棄／resize後の遅延openを拒否し、top layerにシートを残さない。実Chromeのアクセシビリティツリーでdialog名と背面非公開を確認し、実機の読み上げ受入とは区別する。

### スマホ下部ナビのスクロール追従（2026-10-02）

- 下部ナビはviewport下端へfixedで配置し、Commandの長い本文をスクロールしても判断バーの直下に保持する。高さ100%のShellを超える本文にstickyの追従範囲を制限されない。既存の末尾余白・safe area・Moreの重なり順を継承する。
- Command本文は自然な高さで表示し、判断バーとナビの実測高さに既存余白を加えて末尾を空ける。翻訳・判断状態・画面回転で高さが変わっても最後の履歴を操作バーで隠さない。
- タッチ対応Chromeで実スクロール後の位置とナビ切り替えを確認する。物理Pixel 9の再確認と実TalkBackの受入は別に記録する。


### 最新mainとの公開候補統合（2026-10-02）

- 画面切り替え時だけスクロールを先頭へ戻し、同一画面のdraft・フォーカス保持を継承する。未確認の判断は確認とチェックを案内し、承認済みAgentの成果物も9言語で区別する。
- スマホヘッダーの2行構成と受信箱の配置、44px標的、短いタスク判断バーを保持する。長い翻訳は折り返して横はみ出しを防ぎ、バーの高さは実測末尾余白へ反映する。
