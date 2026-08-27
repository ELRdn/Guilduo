# Guilduo Project Specification

> **English summary:** Guilduo is a Human × AI Work Platform where humans and AI agents coordinate work in the same workspace. This document is the technical source of truth for product responsibilities, data contracts, authentication, synchronization, MCP boundaries, and release safety. Visual rules belong in [`DESIGN.md`](DESIGN.md); `/next/` visual differences belong in [`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md).

最終更新: 2026-08-17  
対象: `0.6.0-beta.7` / REST・MCP `2.7.0` / Schema `7`
文書の位置づけ: アーキテクチャ、ドメイン、API、認証、安全性、運用の正本

## 1. 目的と境界

Guilduoは、現実の作業をQuestへ変換し、HumanとAI Agentが同じworkspaceで依頼、担当、実行、Handoff、Reviewを行うためのオープンな作戦盤である。

この文書が定義するもの:

- プロダクトの思想、用語、責務境界
- `/`、`/next/`、REST、MCP、CLI、Skillの関係
- Quest、報酬、MP、Battle、Quest Tree、Handoffの不変条件
- 認証、同期、公開情報、秘密情報の扱い
- UI変更、AI連携、リリース時に守る互換性ルール

この文書が定義しないもの:

- 詳細な視覚設計、色、タイポグラフィ、コンポーネントの外観
- 外部Provider OAuthの実装詳細
- Unity Battle Labやネイティブアプリの実装
- Agentの自動起動、モデル呼び出し、Sandboxの実行
- API契約ファイルと同じ内容の重複定義

視覚設計は[`DESIGN.md`](DESIGN.md)、Next版の視覚差分は[`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md)を参照する。

視覚設計の成果物は、数値トークン[`design/TOKENS.json`](design/TOKENS.json)、部品[`design/COMPONENTS.md`](design/COMPONENTS.md)、画面[`design/SCREENS.md`](design/SCREENS.md)、アセット[`design/ASSET_MANIFEST.md`](design/ASSET_MANIFEST.md)を参照する。これらはQuestデータやAPI契約を変更しない。

## 2. プロダクトモデル

### 2.1 設計原則

1. **人間が目的と最終判断を持つ。** AIの提案、変更、レビューは確認可能にする。
2. **Questと報酬を分離する。** Quest完了でMPを得るが、Battleのコマンドとタイミングは人間が選ぶ。
3. **読む、プレビューする、実行する。** 書き込み、一括操作、Handoff、外部同期はdry-runを基本にする。
4. **削除より保管する。** 履歴、報酬、依存関係、外部リンクを保持する。
5. **人間とAIを同じパーティーに置く。** ユーザー、Astra、Agent、MCPクライアントを混同しない。
6. **データを閉じ込めない。** Web UI、REST、MCP、CLIは同じドメインルールを使う。

### 2.2 用語と責務

| 用語 | 意味 | 所有する責務 |
| --- | --- | --- |
| ユーザー | Appwriteで認証された本人 | 目的、最終判断、公開範囲、Agent設定 |
| Astra | ユーザーが選ぶ相棒キャラクター | 見た目、役職、MBTI、Battle上のキャラクター表現 |
| Agent | 作業を担当するAIの台帳エントリ | 表示名、Provider、許可スコープ、Handoff既定値 |
| MCPクライアント | ChatGPT、Codex、Claude等の接続元 | OAuth接続、利用スコープ、Agentへの紐付け |
| Party | 人間・Agentの作戦上の所属 | メンバー表示、担当Quest、レビュー関係 |
| Guilduo | データ・権限・作戦状態の管理面 | Quest、報酬、MP、Handoff、監査、同期 |
| Harness | モデルをツール付きAgentとして実行する外部面 | Model、Tool、Skill、Session、Sandbox、実行ループ |

## 3. システム構成

### 3.1 サーフェスの役割

| サーフェス | 役割 | 正式な位置づけ |
| --- | --- | --- |
| `/` | 現行UI、Appwrite同期、従来操作との互換 | 安定版の基準 |
| `/next/` | Interaction Lab、新UI、操作検証 | 公開β・検証レーン |
| `/lp/`・`/lp/en/` | Guilduoの説明、Product Proof、公開CTA | 日本語・英語の公式マーケティングSurface |
| Appwrite Auth | Googleログインとユーザー識別 | 認証の基準 |
| Appwrite TablesDB | Quest・キャラクター・Battle状態 | ユーザー状態の保存先 |
| Appwrite Sites | Web/PWAとLPの静的配信 | 公開Webの配信面 |
| Cloudflare Worker | REST、OAuth、MCP、Webhook、拡張機能境界 | APIの実行面 |
| Cloudflare D1/KV | Agent、接続、プロフィール、短期OAuth状態 | Worker側メタデータ保存 |
| CLI | 人間・CI向けのREST/JSON操作 | MCPとは別の操作面 |
| Skill | AIに安全な操作順序を教える手順書 | MCPの利用ガイド |

```mermaid
flowchart LR
  User[ユーザー] --> Root[現行UI /]
  User --> Next[Next UI /next/]
  Root --> Auth[Appwrite Auth]
  Root --> Worker[Cloudflare Worker]
  Next --> Auth
  Next --> Worker
  CLI[CLI] --> Worker
  MCP[MCPクライアント] --> Worker
    Skill[Guilduo Skill] -.操作手順.-> MCP
    Worker --> Domain[共有Guilduoドメイン]
  Domain --> TablesDB[Appwrite TablesDB]
  Worker --> D1[D1 / Agent・接続メタデータ]
  Harness[外部Harness] --> MCP
  Harness -.モデル・Tool・Session・Sandbox.-> HarnessRuntime[Harness実行面]
```

### 3.2 データの正本

- Quest、キャラクター、Battle、報酬、イベントの業務ルールは共有ドメインを正本にする。
- APIの入力・出力は`api/openapi.json`、MCPのツール契約は`api/mcp-tools.json`を正本にする。
- `/`と`/next/`はAppwrite Authで本人を識別し、Worker RESTから本体スナップショットを取得する。ブラウザへAppwrite API Keyを渡さない。
- Workerは短命なAppwrite JWTを検証し、サーバー専用API KeyでTablesDBを読み書きする。`user_states`の行IDはAppwrite UIDとし、直接クライアント権限を付けない。
- Firebase移行データは`legacy_states`へ暗号学的メールハッシュをキーとして一時格納し、同じメールでの初回Appwriteログイン時に`user_states`へ一度だけ移管する。移行元は検証期間中だけロールバック用に保持する。
- Next版のローカル保存はゲスト利用、表示設定、前回スナップショットのためだけに使う。ログイン済みユーザーの本体データを別ユーザーへ表示しない。
- API、MCP、外部連携から受け取るJSONは未検証の外部入力として扱い、ドメイン境界で正規化する。

## 4. ドメイン不変条件

### 4.1 Quest

- `planningState`と`lifecycleState`は別軸で管理する。
- 単発To Doの完了は`completed`を経由して`archived`へ正規化する。
- Habit、Daily、繰り返しTo Doは完了記録を残しつつ`active`へ戻る。
- 保管済みQuestは削除しない。復元は`active`へ戻し、履歴を保持する。
- 完了報酬、XP、Gem、MPは同一Questの同一回に一度だけ付与する。
- メモの有無はBattle対象判定に使わない。`habit`、`daily`、`todo`のみが対象である。

### 4.2 Quest Tree

- 親子関係へ参加できるのは`habit`、`daily`、`todo`である。
- Rewardは親子構造へ参加しない。
- 自己参照、存在しない親、循環、最大階層超過を拒否する。
- 子Quest完了で親Questを自動完了しない。
- 保管済み子Questは通常集計から除外する。

### 4.3 Handoff

- Handoff状態とQuestの完了状態は別管理する。
- 許可された状態遷移は`none → ready → working → review_required → accepted`を基本とし、`blocked`から復帰できる。
- 書き込みはdry-runを先に行い、実行時は`expectedState`または`expectedUpdatedAt`で競合を検知する。
- `review_required`はAgentから人間へ返却された状態であり、Quest完了を意味しない。

### 4.4 Battle

- Quest完了でMPを得て、Battleコマンドは別操作として実行する。
- Battle計算は共有のBattle Rulesを使い、Web UI、Worker、独立原型で結果を一致させる。
- MP不足、古いTurn、重複Command ID、終了済みBattleは拒否する。

## 5. 認証・同期・プライバシー

### 5.1 状態

認証と同期は、少なくとも次の状態を区別する。

```text
local
  -> auth-checking
  -> syncing
  -> synced
  -> stale
  -> error
  -> reconnect
```

- 同期中はQuest一覧を消さず、前回データがあれば読み取り専用で表示する。
- 同期中の完了、編集、保管、Agent変更は無効化する。
- 接続失敗時は原因を隠さず、「再接続する」とローカル利用の導線を表示する。
- ログアウト、別ユーザー切替、データ所有者変更時は前ユーザーのスナップショットを表示しない。

### 5.2 保存してはいけない情報

- Appwrite JWT、OAuthトークン、Appwrite API Key、Provider Secret
- モデルAPIキー、パスワード、外部実行URL
- Quest本文・メモ・UIDを匿名計測へ送信すること
- HarnessのSession履歴、Sandbox内部データ、モデル推論ログ

公開プロフィールは表示名、`@handle`、紹介文、アバター、レベルなどに限定する。Quest本文、メモ、認証情報は公開しない。

## 6. MCP、Skill、Harnessの境界

Guilduoは**作戦データ・権限・Handoffを管理するControl/Data Plane**、DeepSeek Harness、OpenClaw、Hermes等は**モデル・Tool・Skill・Session・Sandboxを実行するExecution Plane**として扱う。

### Guilduo側

- Remote MCP `/mcp`
- 検証用`/mcp-next`
- Guilduo Workflow Skill（technical IDは互換性のためquestforge-workflowsを維持）
- Agent RegistryとMCPクライアント紐付け
- Handoff状態、dry-run、競合検知
- OAuthスコープとユーザー分離

### Harness側

- モデル接続とモデルAPIキー
- Tool実行ループ、Skill読み込み、Session履歴
- Sandbox、承認ポリシー、サブエージェント実行

将来の接続は次の順序に固定する。

```text
Harness Client
  -> OAuth / Remote MCP
-> Guilduo Agent Context
  -> list quests / get brief
  -> dry-run assignment
  -> confirmed assignment
  -> working
  -> review_required
  -> accepted
```

DeepSeek Harnessは公式リポジトリでもDeveloper Previewとされ、互換性を壊す変更があり得る。したがって現段階では依存追加や実接続コードを作らず、上記のアダプター契約だけを設計対象とする。[DeepSeek Harness公式リポジトリ](https://github.com/deepseek-ai/deepseek-harness)

## 7. 開発・変更・リリースルール

- 共有ドメイン、API、MCP、Appwrite Schemaを変更する前に、この文書を更新する。
- API/MCPの契約変更は、互換性、dry-run、認証、ユーザー分離、既存クライアントへの影響を確認する。
- UIの見た目、コンポーネント、レイアウト、モーションを変更する場合は[`DESIGN.md`](DESIGN.md)を先に更新する。
- `/next/`のUI実験は[`interaction-lab/DESIGN.md`](interaction-lab/DESIGN.md)へ記録し、現行版へ自動昇格しない。
- 本番リリースは型チェック、テスト、ビルド、契約差分、Worker health、Appwrite Auth/TablesDB/Sites smoke testを通過してから行う。
- Unity、外部OAuth、Agent自動実行は、この文書の更新なしに公開βへ戻さない。

## 8. 参照先

- [視覚設計正本](DESIGN.md)
- [Next版の視覚差分](interaction-lab/DESIGN.md)
- [共有型](types/questforge.ts)
- [共有ドメイン](server/questforge-domain.ts)
- [Guilduo Workflow Skill](skills/questforge-workflows/SKILL.md)
- [API / MCP setup](API_MCP_SETUP.md)
- [公開βロードマップ](ROADMAP.md)

## 9. English glossary

| 日本語 | English |
| --- | --- |
| 現行版 | current surface |
| Next版 | experimental beta surface |
| 相棒 | companion character |
| 担当Agent | assigned agent |
| 保管 | archive |
| Handoff | work handoff and review state |
| 作戦盤 | operations board |
| 実行面 | execution plane |
| 正本 | source of truth |
