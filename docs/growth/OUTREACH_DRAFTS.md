# Guilduo 外部発信パック

準備日: 2026-10-06。**全て未投稿・未予約**。公開前に開発者本人が文面、現在の提供範囲、投稿アカウント、画像を確認する。Guilduoの公開βと公開コードを説明し、正式ローンチ・販売開始・実機受入済みとは表現しない。素材作成のための実LLM推論、MCP書き込み、顧客事例の作成は行っていない。

## 用意した技術記事

- [Zenn日本語原稿](zenn-human-ai-relay.md): MCPでAIに仕事を渡し、人のレビューを作業へ戻す設計。
- [DEV英語原稿](dev-human-ai-relay.md): Designing MCP task handoffs that bring human reviews back to an AI agent。

公開コードに固定リンクを付け、レビューQuestの分離、プレビュー、更新競合、権限、外部実行という固有の設計を説明している。スマホメニューのストーリーは説明用。記事のサンプルJSONはプレビューのみで、現行ツールの必須フィールドを満たす。作者が実際に検証した記録を加える場合は、対象版・環境・結果を明示する。文章と図は公開前に本人が編集する。

Zennは実体験・考察を重視し、単なる宣伝より技術的な知見を届ける。[コミュニティガイドライン](https://zenn.dev/guideline)。DEVは投稿時に公開状態・タグ・canonicalを確認する。[Writing and editing](https://dev.to/help/writing-editing)。今回の原稿は外部投稿せず、両方published:falseで保存する。同じ記事を後で公式サイトにも載せる場合は全文転載のcanonical方針を決めてから行う。

## X 日英案

### 日本語: 製品紹介

人と自分のAIで、仕事を渡し合う。
GuilduoはMCPで外部AIとタスクを共有し、人のレビューを作業へ戻すワークスペースです。
公開β・AGPL-3.0-only。使い方と例をまとめました。
https://guilduo.com/solutions/mcp-task-management/

### English: product introduction

I'm building Guilduo: shared tasks and human reviews for your external AI agents, connected through MCP.
Public beta, open source under AGPL-3.0-only.
https://guilduo.com/solutions/en/mcp-task-management/

### 日本語: 設計記事の紹介

AIへの依頼と、人への確認依頼を別のタスクにする。
Guilduoの公開コードから、レビュー回答・引き継ぎ受理・元タスク完了を分ける設計を解説しました。

記事公開後に記事URLを付ける。この記事紹介案は記事が公開されるまで使わない。

### English: article introduction

An AI task, a human review answer and final task completion are different events.
I wrote about the MCP workflow behind Guilduo, with public source and a small illustrative example.

Append the actual DEV article URL after publication. Recheck X's character count after the final URL and edits; no multi-account duplicate promotion.

### 画像案

- 公開βのCommand画面例: https://guilduo.com/assets/lp/command-dark.webp
- 共有用ブランド画像: https://guilduo.com/assets/brand/og-guilduo.png
- Command画像は説明用fixtureによる画面例と説明する。実顧客・実スマホ結果・性能証拠として使わない。画像altは「GuilduoのCommand画面例。タスク担当と人への確認依頼を表示」。既存画像を再利用し、架空UIや生成した顧客の声は追加しない。

## Show HN 素材

**Title**: Show HN: Guilduo – shared tasks and human reviews for external AI agents

**Primary URL**: https://github.com/ELRdn/Guilduo

**Maker comment draft**:

Hi HN, I'm building Guilduo, a public-beta workspace for people working with their own coding agents.

The part I want feedback on is the work handoff: an agent reads a Quest through MCP, performs the work in its existing environment, and can create a separate human review request. The human saves text feedback, and the agent explicitly reads it before resuming. Answering the review, accepting the handoff and completing the original task are distinct operations.

The source is AGPL-3.0-only. You can inspect the tool contracts and run the UI using the repository's Local Development instructions. The hosted Web App and Remote MCP workflow require sign-in/OAuth; registering an Agent does not launch a model. Provider integrations and commercial terms should be checked against the published scope.

I'd like feedback on whether the task/review boundary is understandable, and what context you would need to resume work after a session change.

Web App: https://app.guilduo.com/
MCP task-management guide: https://guilduo.com/solutions/en/mcp-task-management/
Handoff guide: https://guilduo.com/solutions/en/ai-agent-handoff/

### 試し方と回答準備

1. リポジトリのツール契約とDocsで提供範囲を読む。READMEのLocal Development手順はUI起動の入口で、完全な自己ホストや実MCP受入を済ませた保証とはしない。
2. Hosted Web Appを使う場合はログインし、最初のQuestを作る。AI連携には対応クライアントのOAuthとAgentリンクが必要。
3. 実連携デモを投稿に添える場合は、投稿前にその環境で実際の往復を確認する。未検証のデモを「試せる」と約束しない。

| 想定質問 | 回答案 |
| --- | --- |
| Is this an agent runtime? | No. The external client runs the model and tools. Guilduo shares task and handoff state through MCP and the Web App. |
| Is this an SDK execution handoff? | The handoff here records task responsibility and review state. It does not transfer a running model session. |
| Can a human answer finish the task? | The saved response, handoff acceptance and original Quest completion are separate. |
| Can I inspect the source? | Yes. The repository is public and licensed AGPL-3.0-only; review the actual license for deployment changes. |
| Do I need an account? | Hosted Web/MCP operations need authentication. Reading public Docs and source does not. |
| How is this different from a chat? | It keeps the goal, completion criteria, assignee and saved review feedback connected to work records. |

[Show HN規則](https://news.ycombinator.com/showhn.html): 実際に触れる成果物が必要。LPだけ、待機リストだけ、単なる記事はShow HNにしない。投稿時の実際の利用条件を説明し、投票やコメントを依頼しない。今回の準備は投稿可能性の保証ではない。

## Product Hunt 素材

- Name: Guilduo
- Tagline: Shared tasks and human reviews for your AI agents
- Description: Guilduo connects your external AI agents through MCP to shared tasks and human reviews. Define ownership, return work for review, and read saved feedback before resuming. Public beta, open source under AGPL-3.0-only.
- Product URL: https://guilduo.com/
- Web App: https://app.guilduo.com/
- Suggested topics: Developer Tools, Productivity, Open Source
- Gallery: 上記Command画面例、既存Party画面例 https://guilduo.com/assets/lp/party-dark.webp 。各画像は説明用fixtureによる画面例と明記する。
- Availability / pricing: 投稿時の実際の公開βと利用条件を選ぶ。未販売のPro価格、Credits、ユーザー数、成果率は掲載しない。

**First Maker comment draft**:

I'm building Guilduo for developers who already work with their own AI tools and want a clearer way to pass work back and forth.

MCP connects the external agent to a shared Quest. When the work needs a person's decision, the agent can create a separate review request. The human's saved answer becomes context for the next explicit step. The model and coding environment stay outside Guilduo.

This is a public beta. I'd appreciate feedback on the clarity of the handoff and review flow. The source and practical guides are linked from the product page.

[Product Hunt投稿手順](https://help.producthunt.com/en/articles/479557-how-to-post-a-product): 投稿可能な個人アカウントとonboardingが必要。外部Hunterは必須ではない。Descriptionは260文字以内。送信前にpreview、Maker本人、gallery、利用条件を確認する。今回はPHアカウント作成・投稿・公開予約を行わない。

## Reddit 候補と現在の規則

規則確認: 2026-10-06。アカウント条件・flair・固定スレッド・モデレーター判断は投稿時にも再確認する。規則JSONが空でも投稿許可を保証しない。

| 候補 | 公式規則と扱い | 選択 |
| --- | --- | --- |
| r/SideProject | [規則JSON](https://www.reddit.com/r/SideProject/about/rules.json)は個別rulesが空。全体のspam規則が適用。開発者の制作物として紹介し、作者であると明示する。 | 一次候補。投稿時にsidebar・固定投稿・account条件を再確認する。 |
| r/mcp | [規則JSON](https://www.reddit.com/r/mcp/about/rules.json): 作者の明示、Showcase、待機リスト・未完成サービス禁止、AI生成slop禁止。 | 公開βがfully launchedの条件を満たすか未確認。今は投稿対象に確定せず、本人が書く技術紹介の要点だけ準備する。 |
| r/opensource | [規則JSON](https://www.reddit.com/r/opensource/about/rules.json): AI生成contentを禁止。過度の自己宣伝やdrive-by投稿も禁止。 | このAI補助原稿の投稿先から除外する。 |

### r/SideProject向け原稿案

**Title**: I’m building Guilduo: shared tasks and human reviews for external AI agents

I'm the maker of Guilduo, an open-source public-beta workspace for people working with their own coding agents.

One workflow it supports is keeping an implementation task separate from a human review request. An external agent reads the task through MCP, works in its existing environment, and asks a concrete review question. The person saves text feedback; the agent explicitly reads it before continuing. The original task is not automatically completed by the answer.

The practical example in the guide is fixing a mobile menu and asking a person to check how it feels on a phone. It is an illustrative example, not a customer result.

I'd appreciate feedback on whether the work and review boundaries are clear:
https://guilduo.com/solutions/en/ai-agent-handoff/

Source: https://github.com/ELRdn/Guilduo

### r/mcpで本人が書く場合の要点

- 自分がGuilduo開発者であると冒頭で明示し、Showcaseにする。
- 自分の実使用・設計上の具体的な判断を書き、一般的なMCP紹介や煽るsecurity記事にしない。
- 読む→作業する→人へ確認する→保存回答を読むという共有タスク契約を説明する。
- OAuthとAgent policy、プレビュー、元Quest完了を別扱いにする理由と公開ソースを示す。
- 投稿前に「fully launched」要件と公開βの扱いを本人が確認する。ここにはコピー投稿用の完成文を用意しない。

[Reddit全体のspam説明](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)。同じ文章を多数subredditへ投下したり、第三者のふりをして推薦したりしない。返信を含め、そのコミュニティで技術的に意味のある会話をする。

## 提出前に確認すること

現在の公開版、本人の文面と投稿アカウント、利用可能な試し方、規則・flair、画像がfixtureであることを確認する。正式ローンチに結び付ける場合は既存ローンチ計画の実受入・Release条件を別途満たす。今回の完了は素材の準備で、外部への実投稿ではない。
