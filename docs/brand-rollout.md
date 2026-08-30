# Guilduo E2 brand rollout

最終更新: 2026-08-29 21:37 JST
対象: `0.6.0-beta.8`候補

## Status

Guilduo E2エンブレムは、ユーザー提供のAI生成カラー探索シートとE2 SVG参考素材をもとにした暫定トレース版である。2026-08-29、ひろなおがGuilduo公開βの正式アイコン v1候補として採用し、公開前検証へ進めることを承認した。SVG正本は`assets/brand/guilduo-mark-master.svg`、派生物とPNGの生成は`tools/generate-brand-assets.mts`が担当する。

コード側では、PWA、favicon、Apple touch icon、OG、GitHub Social Preview、root UI、旧`/next/`、Relay Forge、LPのブランド表示を同じマークへ揃える。新しいForge系カラーパレットは`/next/relay-forge/`だけに適用し、LPの既存配色とGolden Referenceは維持する。

OGとGitHub画像は、ひろなお承認済みの無文字・アイコン主体版である。公開ワードマークやコピーを実装担当者が独断で追加しない。

現在の判定は、コードとローカル公開前検証に合格した状態（`LOCAL_PREFLIGHT_PASS_EXTERNAL_RELEASE_BLOCKED`）である。GitHub、Appwrite、公開タグ、外部告知は今回の作業では実行しない。

## Approval and provenance record

| 項目 | 記録 |
| --- | --- |
| 承認日・承認者 | 2026-08-29、ひろなお |
| 承認範囲 | 暫定トレース版のGuilduo公開βアイコン v1採用、OG／GitHub無文字方針、公開前検証への進行 |
| 起点素材 | ユーザー提供のAI生成カラー探索シート、`Guilduo_E2_Official_Emblem.svg`、`Guilduo_E2_Official_AppIcon.svg` |
| トレース工程 | Codexが単一inline pathへ整理し、ブランド色・単色派生・PNG用途別書き出し・maskable安全領域を適用（2026-08-29） |
| フォント・第三者素材 | ブランドSVGに外部フォント、外部画像、第三者ロゴの依存なし。PNG生成の開発依存は`sharp@0.35.2` |
| 生成メタデータ | 元AI素材のサービス、生成日、入力プロンプトは提供資料・リポジトリに記載なし。不明のまま記録し、推測しない |
| 法的範囲 | プロダクトオーナーの公開β採用承認。商標登録・法務意見・第三者権利の保証ではない |

## Human approval checklist

### Rights and similarity gate

- [x] AI生成素材の起点を記録し、未提供のサービス・生成日・プロンプトは不明として明記した
- [x] トレース工程、担当、日付、変更点を記録した
- [x] フォント、第三者ロゴ、外部画像、学習素材由来のブランドSVG依存がないことを確認した
- [x] 第三者の商標・ロゴ・紋章との類似性について、ひろなおの公開前レビュー承認を記録した
- [x] 法務・権利者確認の要否を確認し、現段階は公開β採用承認で進める判断を記録した（法的意見ではない）
- [x] `BRAND.md`、`ASSETS.md`、`design/ASSET_MANIFEST.md`の状態を更新した

### Copy gate for external images

- [x] `og-guilduo.png`は日本語コピーを入れない無文字方針を承認した
- [x] `github-social-preview.png`は英語コピーを入れない無文字方針を承認した
- [x] 公開ワードマークを常に`Guilduo`とすることを確認した
- [x] 1200×630、1280×640でスマホ共有カードの切り抜きを確認した

## Local preflight validation record

2026-08-29、ローカル公開前検証を実行し、ブランド導入に関係する項目は合格した。

- `npm run brand:assets -- --check`: PASS
- `npm run design:check`: PASS
- `npm run check`: PASS（Wranglerのユーザー領域ログ書き込み`EPERM`警告はあるが、終了コードは0）
- `npm test`: PASS（223 tests / 223 pass / 0 fail）
- `WEB_APP_URL=https://brand-check.example npm run build`: PASS
- `npm run lp:verify -- http://127.0.0.1:4192`: PASS（日本語6幅、英語、テーマ、Reduced Motion、キーボード、遅延画像、overflow）
- ビルド後の主要HTML、`dist/assets/brand/`、`dist/assets/icons/`、OG絶対URL: PASS
- Relay Forgeのlight／dark、1920／1440／1024／390px、キーボード、ARIA、Reduced Motion: PASS
- 共有画像の無文字表示、1200×630／1280×640の寸法: PASS
- `git diff --check`: PASS

Node 26のローカル環境で`uv_os_get_passwd returned ENOMEM`が発生するため、Node検証コマンドの実行時だけ一時フォールバックを使用した。フォールバックはリポジトリに残していない。ビルドには既存のCommonJS警告が出るが、ビルド結果と終了コードは正常である。

### External surface updates

- [ ] GitHubリポジトリのアバターを更新した
- [ ] GitHub組織アバターを更新した（対象の場合）
- [ ] GitHub Social Previewを更新した
- [ ] README、Docs、スクリーンショット、配布資料のブランド表示を更新した
- [ ] OG画像を公開Originから取得できることを確認した
- [ ] プラグイン、CLI、配布アーカイブに含めるブランド素材を確認した
- [ ] 旧キャラクター＋QFアイコンがブランド識別として残っていないことを確認した

## Release gate

`0.6.0-beta.8`は、次の全条件を満たすまで正式公開しない。

1. [x] 権利・第三者類似性レビューと人間承認が完了している。
2. [ ] コード、PWA、公開サイト、OG、GitHub表示、README・Docsが同じ採用版で揃っている（外部更新待ち）。
3. [x] `npm run brand:assets -- --check`、`npm run design:check`、`npm run check`、`npm test`、`npm run build`、`npm run lp:verify`が成功している。
4. [x] Relay Forgeのlight／dark、1920／1440／1024／390px、キーボード、ARIA、Reduced Motionを確認している。
5. [x] マークを16／24／32／48／64／180／192／512pxで通常色、グレースケール、明暗背景に表示して確認している。
6. [x] 既存Golden captureを直接上書きせず、`.qa-artifacts/`へ候補を出力した。

外部更新が1つでも未完了の場合、公開タグを作成せず、今回の差分は公開前候補として保留する。既存の`QuestForge` technical identifier、API、MCP、schema、認証、storage key、CLIはこのロールアウトで変更しない。
