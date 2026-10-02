# 1つのMCP接続で複数のAgentを使う

Chat・Codex・Dotsが同じOpenAI接続を共有する場合、接続全体のAgentを切り替えると別の呼び出し元まで変わってしまう。Guilduoでは接続に利用可能なAgentを登録し、各呼び出しで担当を指定する。

1. Partyで用途別のAgentを登録する。表示名とAgent IDは別なので、IDを控える。
2. SettingsのMCP接続で「Agentを変更」を開き、同じ接続で使うAgentを複数選んで保存する。
3. 各クライアントの指示に自分のAgent IDを指定し、ツール一覧を再取得する。Guilduo Workflowsも更新する。
4. `get_current_agent_context`で`allowedAgentIds`と`requiresAgentSelection`を確認する。以降の呼び出しは毎回`actingAgentId`を含める。

たとえばCodex用の登録IDが`codex`なら、呼び出し引数は次のようになる。

```json
{"actingAgentId":"codex","view":"all"}
```

`list_quests`で読み取り、`get_current_agent_context({"actingAgentId":"codex"})`で実行主体と権限を確認する。プレビュー、実行、回答取得にも同じIDを渡す。会話や呼び出し順からAgentを推定せず、毎回の`link_agent`による共有設定の書換えは行わない。

- 複数Agentの接続でIDを省略した実行、未許可・無効・別ユーザーのAgentは拒否される。
- 各Agentの許可とOAuth接続の許可の両方を満たす操作だけ実行できる。共有しても権限を合算しない。
- 各リクエストのAgentは他の呼び出しに残らず、Quest依頼元とHuman確認依頼にも反映される。
- これは同じ認証情報の中での担当識別であり、Chat・Codex・Dotsの送信元を暗号的に証明するものではない。クライアント間の認証分離が必要ならOAuth接続自体を分ける。
- 1つのAgentだけを許可した既存接続は、新しい引数なしで従来どおり使える。共有接続全体の解除は、その接続に許可した全Agentへ影響する。

配備順はD1 migration `0011_shared_mcp_agents.sql` → Worker → Site。新Workerは追加列を使うため、先にmigrationを適用する。ローカル実装・自動検証と、本番配備・各OpenAIクライアントでの受入を区別する。
