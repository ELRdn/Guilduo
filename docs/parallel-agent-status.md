# Guilduo 並行エージェント向け現状報告

最終更新: 2026-08-30 JST
対象リポジトリ: `D:\VibeCoding\questforge-relay-forge`
現在ブランチ: `codex/fix-agent-registry-recovery`

この文書は、同じリポジトリで動く複数エージェント間の引き継ぎ用スナップショットである。作業開始時は、まずこの文書と`AGENTS.md`、`BRAND.md`、`docs/brand-rollout.md`を確認すること。

## 現在の結論

Guilduo E2アイコンのコード導入、公開URL正規化、Appwrite Site、Cloudflare Worker、Appwrite API Custom Domainの反映とproduction smoke testは完了している。現在の状態は、ひろなお承認済みの**暫定トレース版**を`0.6.0-beta.8`候補として公開環境へ反映した状態である。正式なタグ付きリリース、`www` redirectのDNS、Documentation公開、認証を含む実クライアントE2Eは別ゲートとして残している。

正式な公開ワードマークは常に`Guilduo`。添付カラー探索シートの`GUILDUO E2 COLOR EXPLORATION`や`FORGE TEAL & ANTIQUE GOLD`はデザイン資料上の見出しであり、公開表記の指示ではない。

今回の更新では、SVG正本・ブランド設計書・資産台帳・公開URLガイド・README・Roadmap・引き継ぎ記録を同期した。無文字のOG／GitHub共有画像は実物確認済みで、ローカル検証用の一時スクリプトとNodeフォールバックは削除済み。既存の未コミットAgent Registry／Agent avatar／Settings関連変更は保持し、OAuth Grant・Access Token・Refresh TokenのUID移植や失効は行っていない。

## 正式URLの要点

- 公式サイト / LP: `https://guilduo.com/`
- 英語LP: `https://guilduo.com/lp/en/`
- 正式Web App: `https://app.guilduo.com/`（Guilduo / Relay Forge）
- 正式MCP: `https://mcp.guilduo.com/mcp`
- Appwrite API: `https://api.guilduo.com/v1`
- `/next/relay-forge/`は内部デプロイ・互換pathで、新規ユーザー向けに案内しない
- 旧workers.devとAppwrite generated domainは互換・rollback用に残す
- `www.guilduo.com`はapex redirect用だが、DNS反映待ち
- 詳細は[`docs/public-urls.md`](public-urls.md)と[`docs/appwrite-site-routing.md`](appwrite-site-routing.md)を参照する

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

## 直近の技術・本番検証結果

以下は2026-08-30時点で実行済み。

- `npm run brand:assets -- --check`: PASS
- `npm run design:check`: PASS
- `npm run check`: PASS（Wranglerのユーザー領域ログ書き込み`EPERM`警告は出たが、コマンド終了コードは0）
- `npm test`: PASS、283 tests / 283 pass / 0 fail
- `WEB_APP_URL=https://brand-check.example npm run build`: PASS
- ビルド後の`dist/assets/brand`、`dist/assets/icons`、主要HTMLのOG絶対URL: PASS
- `npm run lp:verify -- http://127.0.0.1:4192`: PASS（日本語6幅、英語、テーマ、Reduced Motion、キーボード、遅延画像、overflow）
- Relay Forge専用ブラウザ確認: PASS（1920/1440/1024/390px、light/dark、マーク読み込み、overflowなし）
- OG／GitHub共有画像確認: PASS（無文字、1200×630／1280×640、アイコン主体）
- API／Worker／server／migrations／CLIのブランド差分: PASS（ブランド導入による変更なし。既存Agent avatar差分は保持）
- `git diff --check`: PASS
- `https://guilduo.com/`: LPとcanonical root: PASS
- `https://guilduo.com/lp/en/`: 英語LP: PASS
- `https://app.guilduo.com/`: Relay Forgeとcanonical root: PASS
- `https://app.guilduo.com/next/relay-forge/`: compatibility path: PASS
- `https://mcp.guilduo.com/mcp`: 未認証`401`、OAuth metadata、CORS: PASS
- 旧workers.dev URL: metadata、未認証`401`、CORS互換: PASS
- `https://api.guilduo.com/v1`: Appwrite Custom Domainへの到達と未認証`401`: PASS
- Workerの`APPWRITE_ENDPOINT`: `https://api.guilduo.com/v1`を使用: PASS

### 検証時の既知の注意

既存の`npm run visual:matrix`は、未認証の通常起動でAppwrite `/account`が401を返すと、それをHTTPエラーとconsoleエラーの2件として`runtime 2`に数える。これはブランド資産のエラーではない。Golden Reference画像は上書きしていない。Relay Forgeは認証を使わないfixtureで専用ブラウザ確認済み。

Node 26のローカル環境では`uv_os_get_passwd returned ENOMEM`が発生することがある。検証時だけ一時的な`tools/.os-user-info-fallback.cjs`を使ったが、現在は削除済みであり、リポジトリへ追加してはいけない。検証用のローカルサーバーも停止済みである。

## 公開を止めているゲート

公開URLのデプロイと主要な未認証production smokeは合格している。次の項目が未完了のため、`v0.6.0-beta.8`のタグ作成・正式リリース判断は保留する。

- `www.guilduo.com`のDNSとapex redirect。
- `docs.guilduo.com`のDocumentation公開。
- OpenClaw等でGoogleログイン、MCP approve、localhost callback、Agent再リンク、`get_current_agent_context`まで行う認証E2E。
- GitHubリポジトリ／組織アバター、Social Preview、公開OriginのOG表示の追加確認。

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
- 外部公開担当: GitHub表示、Appwrite Sites、OG検証、README・Docs、配布物。公開環境の変更は明示的な承認とproduction smokeをセットで扱う。

同じファイルを編集する場合は、この文書または作業コメントへ変更意図と対象行を追記してから作業すること。完了後は検証結果と未解決リスクをこの文書へ反映する。

## 次に行う作業

1. [完了] ローカルの技術検証、共有画像の表示確認、公開URL文書の同期。
2. [完了] Appwrite Site、Worker、MCP、Appwrite API Custom Domainのproduction smoke。
3. [保留] `www` DNSとapex redirectを有効化して確認する。
4. [保留] 実クライアントでOAuthからAgent再リンクまで受入する。
5. [保留] `docs/brand-rollout.md`の残存ゲート完了後だけ、`v0.6.0-beta.8`のタグ付き正式リリースを判断する。
