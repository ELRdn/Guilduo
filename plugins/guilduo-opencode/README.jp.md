# OpenCode向けGuilduo

beta.15でSkill名を `questforge-workflows` から `guilduo-workflows` へ移行します。プラグインを更新してホストを再起動し、独立導入した旧Skillは重複しないよう置き換えてください。OAuth・MCP・プラグインIDは維持します。[移行手順](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-workflows-migration.md)。beta.14の証拠は旧版の記録です。

[English](README.md)

`@guilduo/opencode-plugin@0.6.0-beta.16`はWindowsを優先する拡張です。公開・受入状況は[現行ステータス](https://github.com/ELRdn/Guilduo/blob/main/docs/guilduo-host-extensions-status.md)を確認してください。OpenCode標準のOAuth MCP、共通`guilduo-workflows` Skill、フェーズ同期の指示を提供します。認証はOpenCodeが管理し、独自OAuthブリッジは不要です。このSDKはplugin独自TUIをサポートしないため、標準設定・CLI・コマンド一覧を使います。

## 導入

ソースcheckoutで`npm --prefix plugins/guilduo-opencode run pack:plugin`を実行するか、リリース担当から候補tgzを受け取ります。生成先は`plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.16.tgz`です。利用先プロジェクトで、以下のplaceholderを実際のtgz絶対pathへ置き換えてください。専用`.opencode/guilduo`へ導入します。共有`.opencode`をnpm prefixにすると`--no-save`が他の未保存packageをpruneする可能性があるため、共有prefixでは実行しないでください。

```powershell
npm install --prefix .opencode/guilduo "<beta.16-tgzの実際の絶対path>" --ignore-scripts --no-package-lock --no-save
node --input-type=module -e "import {pathToFileURL} from 'node:url'; import {resolve} from 'node:path'; console.log(pathToFileURL(resolve('.opencode/guilduo/node_modules/@guilduo/opencode-plugin/lib/index.js')).href)"
```

2行目で生成した絶対file URLを既存`opencode.json`の`plugin`配列へ追加してください。他の項目は保持します。次はpathを置き換えて使う例です。

```json
{"plugin":["file:///D:/your-project/.opencode/guilduo/node_modules/@guilduo/opencode-plugin/lib/index.js"]}
```

再起動後、`opencode mcp list`で確認し、`opencode mcp auth guilduo`でブラウザー認証します。既に公式endpointの別名設定があれば、その名前を使ってください。無効設定や同名の別接続は上書きしません。Freeの登録Agent上限は2体のままで、この拡張はAgentを自動登録しません。

OAuth後、context・Questを読む前にAgentの紐付けを確認します。

1. 最初に標準MCPの`get_agent_link`を呼び、意図したAgentへ紐付け済みか確認します。既存の許可されたAgentを特定する必要があれば`list_registered_agents`を使います。表示名やクライアント名からAgent IDを推測しないでください。
2. 未紐付けの専用接続では、所有者の明示的な許可を得てから`link_agent({ agentId: "<所有者が許可した既存Agent-ID>" })`を呼びます。これは既存Agentの紐付けで、新規登録ではありません。既に正しい紐付けがあれば維持し、共有接続のAgent／クライアント切替には使わないでください。
3. `get_current_agent_context`と正確な`get_quest`を読み、返されたAgent ID・Quest IDが許可した組と一致することを確認します。contextが`requiresAgentSelection`を返す場合は、`allowedAgentIds`内で所有者が許可したIDを`actingAgentId`として読み取りを含む全実行callへ渡し、実contextと照合します。実際のtool schemaに従い、未紐付け時のvalidationエラーだけで引数非対応と判断しないでください。
4. 確認後、その組への継続更新を明示的に許可してください。OAuth・紐付け・導入はQuest更新の許可やphaseSync有効化を代行しません。

## バージョン確認・更新・ロールバック

利用先プロジェクトで、モデル実行を伴わないCLI確認を行います。

```powershell
opencode --version
node -p "require('./.opencode/guilduo/node_modules/@guilduo/opencode-plugin/package.json').version"
opencode mcp list
opencode mcp auth list
```

1行目はホスト、2行目はインストール済み拡張のversionです。読み込み中のversionへ反映するには再起動が必要です。標準`opencode debug skill`で`guilduo-workflows`を確認できます。見つからない場合はpluginのfile URLと再起動を確認してください。MCP/OAuthの無効設定や同名の別endpointは自分の設定を確認し、上書きしないでください。

更新は、そのインストールを使うOpenCodeをすべて終了し、現在の設定と旧tgzを保持してから、上記beta.16導入コマンドを同じ専用`.opencode/guilduo`へ再実行します。file URLと他の設定を維持し、再起動後にversion・MCP・Skillを確認してください。旧手順で共有`.opencode`へ導入済みの場合は専用directoryへ新たに導入し、このpluginのfile URLだけを変更してください。共有packageは触らず保持します。有効な標準OAuth認証は保持されます。失効・期限切れの場合は標準CLIで再認証します。認証だけではQuest更新を許可しません。

ロールバックはOpenCodeを終了し、保持している旧tgzを再導入します。

```powershell
npm install --prefix .opencode/guilduo "<保持しているbeta.11-tgzの実際の絶対path>" --ignore-scripts --no-package-lock --no-save
```

beta.11には今回のalias・コマンド修正がないため、戻す前に`phaseSync`を削除または`false`にしてください。再起動して`0.6.0-beta.11`を確認します。履歴・ホストデータ・OAuth認証の削除は不要です。registry版を使う前に現行ステータスを確認してください。

## 終了時の補助

標準では追加のモデル実行を開始せず、既存リクエスト内でSkillに従うよう指示します。自動更新の保証ではありません。

任意の`phaseSync`設定は、既存のbuildセッション・Quest・actingAgentId・canonical cwdを限定し、元の入力につき最大1回の追加モデル実行を許可します。設定例と条件は[英語版](README.md#optional-finite-phase-check)を参照してください。追加実行には利用料金が発生し得ます。補助は確認を促すだけで、MCP更新や権限付与は行いません。Plan、読み取り専用、エラー、fork、cwd変更、合成入力では継続しません。

`/guilduo-sync-off`はbindingがあり、同名のユーザーコマンドがない場合だけ標準一覧へ登録します。対象セッションのbindingだけを再読み込みまで解除します。別セッションからは解除できず、ユーザー所有コマンドは横取りしません。スラッシュコマンドはプロンプトを送信するため、モデル実行の停止や無料の停止を保証せず、この操作にも料金が発生し得ます。現在の推論は標準の中断操作で止めてください。プロンプトを送らず同期補助を止めるにはOpenCodeを終了し、`phaseSync`を削除または`false`にして再起動します。継続更新の許可は別に撤回してください。ホストの権限確認は維持し、書き込み拒否は標準形式へ正規化したMCP別名にも適用します。

## ログアウト・接続停止・削除

別名設定があれば`guilduo`をその名前へ置き換えます。

```powershell
opencode mcp logout guilduo
opencode mcp auth list
```

ログアウトはその別名のホスト保存認証だけを消し、サーバー側の認可やQuest更新許可は撤回しません。接続を恒久停止するには`phaseSync`も無効にし、公式MCPを`enabled: false`で明示設定してください。明示設定がなければ、plugin再読み込み時に既定接続を追加します。サーバー側の失効はGuilduoの接続管理で行います。

削除はOpenCodeを終了し、`opencode.json`の該当plugin文字列／tupleと別途配置したGuilduo loaderだけを除き、packageを削除します。

```powershell
npm uninstall --prefix .opencode/guilduo @guilduo/opencode-plugin --ignore-scripts --no-package-lock --no-save
```

再起動後、同梱Skillとplugin所有コマンドが消えたことを確認します。明示MCP設定とOAuth認証は残るため、必要なら別途ログアウトしてください。他のplugin・Skill・設定・履歴は保持します。旧共有prefix版はloader項目だけを解除して未使用packageを残し、共有`.opencode`へnpm uninstallを実行しないでください。確認済みホストには`opencode plugin uninstall`という標準コマンドはありません。

公開OAuth、Quest更新と読み戻し、Human往復は実利用での受入が必要です。隔離テストは実アカウントの認証やモデル実行を行いません。AGPL-3.0-only、Freeの2Agent制限を維持します。

実モデル受入はソースcheckoutの`tests/native-model.mjs`を明示実行します。[英語版の実行手順](README.md#development-and-validation)を参照してください。モデルはOpenCode Go DeepSeek V4.1 Flashに固定し、caseごと120秒で中断・所有ホスト終了、モデル代替や自動再試行は行いません。選択したnative provider keyだけをメモリとホスト標準環境変数で使い、設定・検査票・archiveへ保存しません。MCPは合成loopbackであり、公開OAuth・実Quest更新・Human往復の証拠にはなりません。新規プロジェクトは補助OFFでnative sessionを作り、完全停止してexact session／canonical cwdを設定し、再起動します。新会話やforkへ自動継承しません。
