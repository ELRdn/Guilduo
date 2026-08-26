# Guilduo Brand

> Guilduo（ギルデュオ）は、人間とAI Agentが同じ場所で仕事を依頼し、担当し、受け渡し、レビューするための **Human × AI Work Platform** です。

この文書は、Guilduoの名称、思想、言葉、表現に関するHuman-readable Source of Truthです。機能・データ契約はPROJECT_SPEC.md、画面の視覚契約はNEWDESIGNv2.mdとDESIGN.mdを参照してください。

## Brand overview

- 正式名称: **Guilduo**
- 日本語読み: **ギルデュオ**
- 語源: **Guild + Duo**
- Category: **Human × AI Work Platform**
- UI system: **Guilduo / Relay Forge**

Guilduoは、AIを人間が一方的に操作する道具としてだけ扱いません。HumanとAI Agentのどちらも、仕事を依頼し、担当し、実行し、受け渡し、レビューできるCoordination Modelを目指します。

## Name origin

### Guild

Human、AI Agent、teammateが同じ目的のもとに集まる共同体です。

### Duo

Human × AIという関係性です。固定された主従関係ではなく、状況に応じて依頼主と担当者が入れ替わります。

## Mission

人間とAI Agentが、担当・進捗・証拠・判断を共有しながら、安全に仕事を前へ進められる場所をつくる。

## Vision

HumanとAIが別々のツールや会話へ分断されず、同じWork Surfaceで責任を持って協働できる状態を標準にする。

## Core brand idea

- **Guild** = ブランド概念
- **Duo** = Human × AIの関係性
- **Relay** = Actor間を移動する仕事
- **Quest** = 作業単位

## Product positioning

Guilduoは、AI Todo Appでも、RPG Task Managerでもありません。中心価値は、**Humans and AI Agents coordinating work in the same workspace.** です。

HumanとAI Agentは、どちらもdelegate、own、execute、handoff、reviewを担えます。

## Target audience

1. AI Agentを日常的に使うPower User / Developer
2. HumanとAI Agentで仕事を進める2〜10人程度の小規模チーム
3. AIを使い始めた一般Productivityユーザー
4. 将来のEnterprise Human-Agent Team

初期UI、README、OnboardingはPrimary Audienceを優先します。

## Official Japanese copy

### Hero

**人間だけが、依頼主じゃない。**

### Philosophy

**人もAIも、依頼主。人もAIも、担当者。**

### Supporting copy

人からAIへ。AIから人へ。

Codex、AI Agent、チームメンバー、自分自身。

仕事を任せ、進捗を共有し、レビューするための **Human × AI Work Platform.**

### Motto

**2者。1チーム。仕事は、どちらからでも。**

## Official English copy

### Hero

**Humans aren’t the only ones who delegate.**

### Philosophy

**Humans and AI can both delegate. Humans and AI can both take ownership.**

### Supporting copy

From humans to AI. From AI to humans.

Codex, AI agents, teammates, or yourself.

A platform for delegating work, sharing progress, and reviewing results.

**Human × AI Work Platform.**

### Motto

**2 Sides. 1 Team. Work Goes Both Ways.**

## Brand personality

- **Collaborative**: HumanとAI Agentを同じWork Surfaceへ置く
- **Tactical**: 担当、依存、Relay、Evidence、Decisionを明確にする
- **Playful**: Quest、Guild、Party、Reward、Battleで仕事に手触りを加える
- **Responsible**: Permission、Dry-run、Conflict detection、Evidence、Human decisionを重視する
- **Modern**: Modern SaaS + Slightly Futuristic。過剰なSci-Fiには寄せない

## Voice and tone

文章は簡潔で、自信があり、行動につながるものにします。少し遊び心を持たせても、幼稚、攻撃的、曖昧にはしません。安全性や技術的判断では、RPG表現よりProfessional Terminologyを優先します。

## Notification personality

通知のToneは、通知を担当するAgentのPersonalityを反映できます。Guilduo共通のfallback voiceは、concise、confident、slightly playful、never childish、never hostile、actionableを基準にします。

## RPG language

Quest、Guild、Party、Mission、Battle、MP、Rewardは積極的に使用できます。Evidence、Review、Handoff、Permission、Agent、Integration、MCP、APIは、明確なProfessional Terminologyを優先します。

RPGはCore Product Definitionではなく、motivation、identity、retention、delightのためのlayerです。

## Visual direction

視覚方向は、Human ApprovedのNEWDESIGNv2.mdを優先します。ブランド変更を理由にRelay Forgeを再設計しません。

維持する特徴:

- high information density
- strong information hierarchy
- restrained semantic colors
- clear Actor identity
- Relay / dependency visualization
- evidence-driven decision surfaces
- compact radius
- deliberate typography
- subtle motion
- professional but distinctive

避ける表現:

- generic AI SaaS
- purple / blue AI gradients
- glassmorphism
- neon glow
- excessive rounded cards
- nested cards
- huge KPI cards
- game HUD imitation
- monitoring console imitation
- decorative particles
- permanent animation
- 密度のためだけの小さすぎる文字

## Product naming rules

- Product brandは **Guilduo**
- 日本語では初出時に **Guilduo（ギルデュオ）** と表記できる
- Relay Forge画面では **Guilduo / Relay Forge**
- Quest、Guild、PartyなどのProduct Languageは維持する
- 旧名称QuestForgeを新しいPublic Brandとして使用しない
- 歴史的説明では **QuestForge（旧名称）** と明示できる

## Legacy QuestForge migration

QuestForgeは旧Public Brandです。ただし、既存ユーザーと外部連携を守るため、次のtechnical identifierは互換性を確認できるまで維持します。

- package name
- CLI command
- MCP server ID
- Skill / Plugin IDとパス
- environment variable
- localStorage key
- API namespaceとschema identifier
- Firebase / Cloudflare resource name
- route / deep link
- TypeScriptの既存型、global、event名

これらはGuilduoブランドへの移行漏れではありません。変更する場合は、依存関係、migration、backward compatibility、testを定義した別Phaseで扱います。

## Do / Don’t

### Do

- HumanとAI双方の責任と判断を見せる
- Relay、Evidence、Decisionを具体的に表現する
- 次の操作が分かる言葉を使う
- 既存データと外部連携を保護する

### Don’t

- AIを魔法や万能な自動化として描く
- Humanを常に依頼主、AIを常に実行者として固定する
- ブランド変更を理由にtechnical identifierを一括置換する
- 既存Goldenや歴史資料を書き換える

## Undecided

次の項目は正式決定までTBDです。

- Logo
- final brand colors
- mascot
- official Agent character
- custom typeface
- domain
- social handles
