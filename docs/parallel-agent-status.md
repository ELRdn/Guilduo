# Guilduo 並行エージェント向け現状報告

最終更新: 2026-08-29 21:45 JST
対象リポジトリ: `D:\VibeCoding\questforge-relay-forge`
現在ブランチ: `codex/fix-agent-registry-recovery`

この文書は、同じリポジトリで動く複数エージェント間の引き継ぎ用スナップショットである。作業開始時は、まずこの文書と`AGENTS.md`、`BRAND.md`、`docs/brand-rollout.md`を確認すること。

## 現在の結論

Guilduo E2アイコンのコード導入とローカル公開前検証は完了している。現在の状態は、ひろなお承認済みの**暫定トレース版**を`0.6.0-beta.8`候補として保持した`LOCAL_PREFLIGHT_PASS_EXTERNAL_RELEASE_BLOCKED`である。権利・類似性レビューとOG／GitHub無文字方針は承認済みとして記録した。外部表示更新、公開Origin確認、タグ公開はまだ実行しない。

正式な公開ワードマークは常に`Guilduo`。添付カラー探索シートの`GUILDUO E2 COLOR EXPLORATION`や`FORGE TEAL & ANTIQUE GOLD`はデザイン資料上の見出しであり、公開表記の指示ではない。

今回の更新では、SVG正本・ブランド設計書・資産台帳・ロールアウト記録の承認状態を同期した。無文字のOG／GitHub共有画像は実物確認済みで、ローカル検証用の一時スクリプトとNodeフォールバックは削除済み。既存の未コミットAgent Registry／Agent avatar／Settings関連変更は保持している。

## 実装済みの範囲

### ブランド資産

- `assets/brand/guilduo-mark-master.svg`: SVG正本。ユーザー提供のE2 SVG参考素材をもとにした暫定トレース。
- `assets/brand/guilduo-mark-gold.svg`: Antique Gold単色。
- `assets/brand/guilduo-mark-ink.svg`: Night Surface単色。
- `assets/brand/guilduo-mark-ivory.svg`: Ivory Text単色。
- `tools/generate-brand-assets.mts`: SVG派生物、favicon、Apple touch icon、PWA、maskable、OG、GitHub画像の再現可能な生成。
- `sharp@0.35.2`: 明示的な開発依存として固定。

正式色のアンカーは次の4色。

| 名称 | HEX | 主な役割 |
| --- | --- | --- |
| Night Surface | `#0F1418` | 深い背景、Ink、PWA chrome |
| Forge Teal | `#13352F` | フルカラーアイコン背景、Relay Forge面 |
| Antique Gold | `#B89A5E` | Gの前景、ブランドアクセント |
| Ivory Text | `#E7E3DA` | 明色背景、明色文字 |

### 適用済みSurface

- root UI、旧`/next/`、Relay Forge、LPのブランド表示を新マークへ変更。
- PWA、favicon、Apple touch icon、OG、GitHub Social PreviewはForge Teal＋Antique Goldのフルカラー版。
- Web UIとLPは背景なし単色版。
- Android `maskable`だけは角丸なしの全面背景＋中央安全領域版。
- Forge系カラーパレットを適用したのは`/next/relay-forge/`だけ。root、旧`/next/`、LP、Battle/Unityは既存配色を維持。
- Human／Agent／RPG／Dangerの意味色は維持。
- 旧キャラクター＋QFアイコンはブランド識別から退役。Astraなどの人格表現では引き続き利用可能。
- `interaction-lab/index.html`内の`reference-brand`はGolden Referenceの回帰用なので変更禁止。

### 互換性境界

API、MCP、schema、認証、storage key、CLI、既存の`QuestForge`系technical identifier、既存ルートはこのブランド導入で変更していない。`QF-184`のようなQuest運用IDはブランド表示ではなく、既存の技術・業務識別子として扱う。

## 直近の検証結果

以下は2026-08-29 21:45 JST時点で実行済み。

- `npm run brand:assets -- --check`: PASS
- `npm run design:check`: PASS
- `npm run check`: PASS（Wranglerのユーザー領域ログ書き込み`EPERM`警告は出たが、コマンド終了コードは0）
- `npm test`: PASS、223 tests / 223 pass / 0 fail
- `WEB_APP_URL=https://brand-check.example npm run build`: PASS
- ビルド後の`dist/assets/brand`、`dist/assets/icons`、主要HTMLのOG絶対URL: PASS
- `npm run lp:verify -- http://127.0.0.1:4192`: PASS（日本語6幅、英語、テーマ、Reduced Motion、キーボード、遅延画像、overflow）
- Relay Forge専用ブラウザ確認: PASS（1920/1440/1024/390px、light/dark、マーク読み込み、overflowなし）
- OG／GitHub共有画像確認: PASS（無文字、1200×630／1280×640、アイコン主体）
- API／Worker／server／migrations／CLIのブランド差分: PASS（ブランド導入による変更なし。既存Agent avatar差分は保持）
- `git diff --check`: PASS

### 検証時の既知の注意

既存の`npm run visual:matrix`は、未認証の通常起動でAppwrite `/account`が401を返すと、それをHTTPエラーとconsoleエラーの2件として`runtime 2`に数える。これはブランド資産のエラーではない。Golden Reference画像は上書きしていない。Relay Forgeは認証を使わないfixtureで専用ブラウザ確認済み。

Node 26のローカル環境では`uv_os_get_passwd returned ENOMEM`が発生することがある。検証時だけ一時的な`tools/.os-user-info-fallback.cjs`を使ったが、現在は削除済みであり、リポジトリへ追加してはいけない。検証用のローカルサーバーも停止済みである。

## 公開を止めているゲート

ローカル公開前検証は合格している。次の外部項目が未完了のため、`v0.6.0-beta.8`のタグ作成・正式公開・外部告知は行わない。

- GitHubリポジトリ／組織アバター、Social Preview、README・Docs・配布物の外部更新。
- 公開OriginからのOG画像、PWA、favicon、GitHub表示の一致確認。
- 外部更新後の公開サイト・Worker・認証境界のスモークテスト。

上記のチェックリストと公開条件は`docs/brand-rollout.md`が正本。OG/GitHub画像は無文字アイコン主体版で承認済みであり、公開ワードマークは`Guilduo`に固定する。

## 並行エージェントの作業ルール

### 必ず守ること

- 作業開始前に`git status --short`を確認する。
- 既存の未コミット変更をユーザー所有として扱う。
- `git reset --hard`、`git clean`、`git checkout`、`git stash`、広範囲の整形・削除を行わない。
- ブランド以外のAgent Registry、Agent avatar、Settings関連の変更を整理・巻き戻し・再設計しない。
- ブランド変更では、まず`BRAND.md`、`DESIGN.md`、`interaction-lab/DESIGN.md`、`design/ASSET_MANIFEST.md`を読む。
- 画像を変更した場合は`npm run brand:assets -- --check`と`npm run design:check`を再実行する。
- Golden Referenceを更新する必要がある場合は直接上書きせず、`.qa-artifacts/`に候補を出して人間承認を待つ。

### 変更の衝突を避けるための担当境界

- ブランド担当: `assets/brand/`、`assets/icons/`、`tools/generate-brand-assets.mts`、ブランド文書、HTML/manifest/service worker/Viteのブランド導線、Relay Forge配色。
- Agent担当: Agent Registry、Agent avatar、Party/Settingsの既存変更。ブランド担当はこれらを無関係な差分として保持する。
- 外部公開担当: GitHub、Appwrite Sites、OG検証、README・Docs・配布物。今回の作業では実行せず、明示的な公開指示後に扱う。

同じファイルを編集する場合は、この文書または作業コメントへ変更意図と対象行を追記してから作業すること。完了後は検証結果と未解決リスクをこの文書へ反映する。

## 次に行う作業

1. [完了] ローカルの最終技術検証と共有画像の表示確認。
2. [保留] 明示的な公開指示後に、公開OriginからOG画像、PWA、faviconの取得と表示を確認する。
3. [保留] 明示的な公開指示後に、外部GitHub表示、README・Docs、配布物を更新する。
4. [保留] 外部更新後の公開サイト・Worker・認証境界をスモークテストする。
5. [保留] `docs/brand-rollout.md`の全ゲートが完了した後だけ、`v0.6.0-beta.8`の公開判断を行う。
