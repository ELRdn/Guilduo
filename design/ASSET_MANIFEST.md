# Guilduo Asset Manifest

> **English summary:** This manifest maps repository assets to their product role, allowed surfaces, display constraints, and fallback behavior. `ASSETS.md` remains the licensing and contribution policy; this file is the usage contract for humans and AI agents.

最終更新: 2026-08-29
ライセンス方針: [`../ASSETS.md`](../ASSETS.md)

## 共通ルール

- 実行時の配信は原則`.webp`、透過やPWAアイコンで必要な場合だけ`.png`を使う。
- キャラクター・ボスは`object-fit: contain`、背景画像の上に置き、暗部が埋もれないステージ色を使う。
- 画像の縦横比をCSSで歪めない。`width`と`height`または`aspect-ratio`を指定する。
- 画像生成素材は公開前に由来、ライセンス、第三者類似性を確認する。
- Assetは装飾として増やさず、担当者、相棒、敵、Battle状態の理解に使う。
- 装備画像は現時点でレイヤー合成に使わない。ショップ・所持品のプレビュー用途に限定する。

## Guilduo E2 brand assets

| Path | 役割 | 許可Surface | 表示・生成条件 | 状態 |
| --- | --- | --- | --- | --- |
| `assets/brand/guilduo-mark-master.svg` | トレース済みのブランド正本 | 開発・レビュー、派生生成 | 透過、単一inline path、フォント依存なし | 暫定トレース・公開β承認済み |
| `assets/brand/guilduo-mark-gold.svg` | Antique Gold単色マーク | Relay Forge UI、LP、暗色面 | 透明背景、最小16px高・推奨24px以上 | 暫定派生・公開β承認済み |
| `assets/brand/guilduo-mark-ink.svg` | Night Surface単色マーク | 明色面のUI、資料 | 透明背景、背景とのコントラストを確認 | 暫定派生・公開β承認済み |
| `assets/brand/guilduo-mark-ivory.svg` | Ivory Text単色マーク | 暗色面、資料 | 透明背景、背景とのコントラストを確認 | 暫定派生・公開β承認済み |
| `assets/brand/og-guilduo.png` | OG共有画像 | `/`、`/lp/`、SNS | 1200×630、Forge Teal＋Gold、無文字アイコン主体 | 公開β承認済み |
| `assets/brand/github-social-preview.png` | GitHub Social Preview | GitHub | 1280×640、Forge Teal＋Gold、無文字アイコン主体 | 公開β承認済み |

ブランド色のアンカーはNight Surface `#0F1418`、Forge Teal `#13352F`、Antique Gold `#B89A5E`、Ivory Text `#E7E3DA`。生成手順は[`../tools/generate-brand-assets.mts`](../tools/generate-brand-assets.mts)で再現する。

### Surface rules

- PWA、favicon、Apple touch icon、OG、GitHubは角丸を焼き込んだフルカラー版を使う。Android `maskable`だけはOSマスク用に背景を端まで敷き、中央66%安全領域へ前景を縮小する。
- Web UIとLPは背景なし単色版を使う。LPの既存カラーパレットとGolden Referenceはブランドマーク差し替え以外に変更しない。
- 旧キャラクターアイコンはブランド識別へ戻さず、Astra等の人格表現に限定する。
- AI生成画像を起点にしたトレース、使用フォントなし、第三者素材なし、第三者類似性レビュー済みという由来を記録する。元画像の生成サービス・生成日・プロンプトは提供資料に含まれないため、不明として扱い推測しない。2026-08-29のひろなお承認は公開βの採用判断であり、商標登録や法的保証ではない。

## キャラクター・役職スキン

| Path pattern | 役割 | 許可Surface | 推奨表示 | 透過 | Fallback | 禁止 |
| --- | --- | --- | --- | --- | --- | --- |
| `assets/avatar-role-*.webp` | 男性役職スキン | Today、Party、Battle、Profile | 48px〜224px | あり | `avatar-base-48.webp` | User本人の公開プロフィールへ無断流用 |
| `assets/avatar-role-femme-*.webp` | 女性役職スキン | Today、Party、Battle、Profile | 48px〜224px | あり | `avatar-femme-48.webp` | 装備レイヤーの前提にすること |
| `assets/avatar-masc-48.webp` | 男性ベース | Character、Profile | 48px | あり | `avatar-base-48.webp` | Battleの大型表示で低解像度を引き伸ばす |
| `assets/avatar-femme-48.webp` | 女性ベース | Character、Profile | 48px | あり | `avatar-base-48.webp` | Agentアイコンと同一identityとして表示 |
| `assets/class-lineup-*.webp` | 役職選択一覧 | Character、Settings | 48px〜96px | あり | 役職スキン | 個別ユーザーのプロフィール画像として保存 |

利用時は、本人、Astra、Agentのidentityをラベルで併記する。Astraは相棒キャラクター、User avatarはアカウント本人であり、同じ画像を使っても説明を省略しない。

## ボス・Battle素材

| Path pattern | 役割 | 許可Surface | 推奨表示 | 透過 | Fallback |
| --- | --- | --- | --- | --- | --- |
| `assets/boss-d-transparent.webp` | Dark Quest Knight | Battle、Boss gallery | 160px〜280px | あり | `boss-h3-transparent.webp` |
| `assets/boss-e-transparent.webp` | Deadline Wraith | Battle、Boss gallery | 160px〜280px | あり | `boss-h3-transparent.webp` |
| `assets/boss-g3-transparent.webp` | Shadow Knight | Battle、Boss gallery | 160px〜280px | あり | `boss-e-transparent.webp` |
| `assets/boss-h-transparent.webp` | Deadline Wraith variant | Battle、Boss gallery | 160px〜280px | あり | `boss-e-transparent.webp` |
| `assets/boss-h3-transparent.webp` | 初期Boss | Battle、Boss gallery | 180px〜320px | あり | `boss-e-transparent.webp` |
| `assets/boss-*-chroma-source.png` | 生成・調整用原本 | 開発・検証のみ | 非表示 | 不定 | なし |
| `assets/boss-*-cutout.png` | 背景除去検証素材 | 開発・検証のみ | 非表示 | あり | なし |

`chroma-source`と`cutout`は本番UIへ直接参照しない。黒い部分が背景除去で消える問題を避けるため、透過済みの完成版だけを使用する。

## PWA・アプリ識別

| Path | 役割 | 許可Surface | 推奨表示 |
| --- | --- | --- | --- |
| `assets/icons/icon-192.png` | PWA標準アイコン | Manifest、Install UI | 192×192 |
| `assets/icons/icon-512.png` | PWA大型アイコン | Manifest、Store preview | 512×512 |
| `assets/icons/icon-maskable-512.png` | Maskable icon | Android PWA | 512×512 |
| `assets/icons/favicon-32.png` | Browser favicon | root、Next、Relay Forge、LP | 32×32 |
| `assets/icons/favicon-48.png` | Browser favicon | root、Next、Relay Forge、LP | 48×48 |
| `assets/icons/apple-touch-icon-180.png` | Apple touch icon | iOS/iPadOS install UI | 180×180 |

PWAアイコンはLucide機能アイコンと混同しない。アプリブランド用のbitmapとして管理する。

## 装備・ショップ素材

| Path pattern | 役割 | 許可Surface | 状態 |
| --- | --- | --- | --- |
| `assets/equipment/equipment-*.webp` | Gem、Journal、Cloak等のプレビュー | Gem Shop、Inventory、Character preview | レイヤー合成は保留 |
| `assets/equipment/equipment-*.png` | 装備調整・原本 | 開発画面のみ | 本番合成に使わない |

装備はキャラクターごとの座標が未確定であるため、全員へ重ねて表示しない。タスク報酬やGemの意味は`PROJECT_SPEC.md`のドメインルールに従う。

## Landing Page Product Proof

| Path pattern | 役割 | 許可Surface | Source | 表示規則 |
| --- | --- | --- | --- | --- |
| `assets/lp/command-*.webp` | Command、Relay、EvidenceのProduct Proof | `/lp/`、`/lp/en/` | `.qa-artifacts/relay-forge/`の検証済みcapture | 縦横比を維持し、最大3点の注釈だけを重ねる |
| `assets/lp/party-*.webp` | Human、Astra、AgentのParty表現 | `/lp/`、`/lp/en/` | `.qa-artifacts/relay-forge-screens/`の検証済みcapture | identity labelが判読できるサイズを保つ |
| `assets/lp/battle-*.webp` | Quest報酬とBattleの体験層 | `/lp/`、`/lp/en/` | `.qa-artifacts/relay-forge-screens/`の検証済みcapture | RPGをProductの主identityとして誇張しない |

LP用captureは決定的fixtureだけを使い、個人情報、認証情報、秘密情報を含めない。Product UIをLP専用HTMLで描き直さず、公開用WebPは元captureを変形・合成せず圧縮する。

## 追加Assetの受入条件

1. ファイルが存在し、用途と許可Surfaceがこのmanifestに登録されている。
2. 由来とライセンスが`ASSETS.md`に記録されている。
3. 透過、縦横比、暗部の視認性を確認する。
4. 9言語UI、Dark mode、Reduced Motionで表示を確認する。
5. Golden Referenceに影響する場合は変更理由を記録する。
