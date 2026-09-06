# Guilduo LPv2

既存の `/lp/`・`/lp/en/` と並存する体験型LP。日本語は `/lpv2/`、英語は `/lpv2/en/`。

仕様は [LPDESIGN.md](../LPDESIGN.md)。公式コピーと共有パレットを継承し、既存LPの実装を変更しない。

## 起動と検証

```sh
npm run dev -- --host 127.0.0.1 --port 5182
npm run lpv2:verify -- http://127.0.0.1:5182
node --import tsx --test tests/lpv2-demo.test.ts tests/lp-release.test.ts
npm run build
```

ブラウザ検証はChromeを使用する。実行ファイルは環境変数 `QF_CHROME_PATH` で指定可能。検証画像は `.qa-artifacts/lpv2/` へ出力する。

## 体験

- 人からAIへ実装タスクを渡す。
- 外部AIから、人へ確認タスクが届く。
- 外部のメニューを操作し、GuilduoへテキストでFBを返す。
- 外部のボタンが大きくなり、人の確認・AIの完了報告を経て共同完了する。
- 変更不要、確認保留と再開、再体験も可能。

`demo.ts` は純粋な状態遷移、`main.ts` は表示と演出を担当する。操作はブラウザ内の合成データで完結し、実際のAgent・タスクを読み書きしない。

Guilduoの領域はテキストの受け渡し専用。サンプルWebページは「外部の作業画面」と明示した独立したデモであり、Guilduo内の成果物ビューアではない。

テーマ保存にはLPv2専用キーを使用。日英HTMLは別文書で提供する。CTAは実行時の公開設定を使用し、JavaScript無効時のリンクには作成時に確認した公開URLを保持する。公開URLを変更する際は静的HTMLのリンクも更新する。

ビルドで `dist/lpv2/` が生成される。既存LPへのリダイレクト変更や本番への公開は別作業。
