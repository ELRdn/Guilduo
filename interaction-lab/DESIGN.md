---
version: alpha
name: QuestForge Interaction Lab
description: Next surface overrides for QuestForge visual and interaction experiments.
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
    reason: "Inherited from the root QuestForge DESIGN.md."
  - section: rounded
    reason: "Inherited from the root QuestForge DESIGN.md."
  - section: spacing
    reason: "Inherited from the root QuestForge DESIGN.md."
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

# QuestForge Interaction Lab Design

> **English summary:** The Interaction Lab is QuestForge's `/next/` beta surface. It tests information architecture, responsive behavior, synchronization feedback, and detail interactions while reusing the current visual constitution and the same authenticated data contracts. It is not a second domain model and must not silently replace `/`.

最終更新: 2026-08-18  
対象: `/next/`（開発元は`/interaction-lab/`） / `0.5.0-beta.1` / REST・MCP `2.7.0` / Schema `7`  
親文書: [QuestForge Visual Constitution](../DESIGN.md)  
技術仕様: [PROJECT_SPEC.md](../PROJECT_SPEC.md)

## 1. 差分の扱い

この文書はroot [`DESIGN.md`](../DESIGN.md)を継承する。色、文字、Elevation、Shape、状態、アクセシビリティ、Do / Don'tを重複定義しない。ここに書かれていないルールはroot版を使う。Front Matterの`colors`とNext固有Componentだけが例外的な差分であり、`typography`、`rounded`、`spacing`は`omitted`でroot継承を示す。

Interaction Labの目的は、現行版へ昇格する前に新しいUI構造と操作を実データで検証すること。視覚比率はroot版と同じ**運用70%／RPG20%／レトロ10%**を維持する。

## 2. Nextの視覚差分

- 初期Surfaceは青を主要な操作・ナビゲーション・Agent／連携のアクセントにする。
- 完了、承認、Humanの状態はGreenを使い、Blueと混同させない。
- Next固有のBlueは装飾ではなく、AI・連携・選択状態を表す。
- Battle・MP・報酬はroot版と同じOrange／Goldの意味を使う。
- パネルは白い面、細い境界線、控えめな影を基本とし、空白だけが残らないよう概要・現在状態・次の操作を同じ視線内へ置く。

`/interaction-lab/`はローカル開発・キャプチャ用のソースルートで、Viteのビルド後に同じSurfaceが`/next/`へ出力される。データモデル、認証、API、MCPはrootの[`PROJECT_SPEC.md`](../PROJECT_SPEC.md)から差分を作らない。

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

### 詳細表示

- Desktopでは右パネルへ表示する。
- Mobileの標準は下部シートで、閉じた状態でも選択Quest名を確認できる。
- ポップアップモードでは背面を適切に遮光し、Esc・閉じる操作・フォーカス復帰を提供する。
- 詳細アクションは`完了`、`確認`、`編集`、`保管`、`戻す`の短いラベルを使う。

### Agent・プロフィール

- ユーザー本人はFirebaseアカウントの所有者として表示する。
- Astraはユーザーが選んだ相棒キャラクターであり、Agentではない。
- AgentはAI作業担当の台帳エントリとして表示する。
- MCPクライアントはAgentへ接続する手段として表示する。
- Partyは作戦上の所属、Profileはユーザー本人の情報として分離する。
- 固定デモAgentを実アカウントへ混入させず、登録済みAgentと実際の担当Questを表示する。

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
- Firebaseログイン済みPC・Pixel 9の更新、同期、再接続
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
