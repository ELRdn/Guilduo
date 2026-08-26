# Guilduo — LPDESIGN.md

> Status: Brand Landing Page Design Direction
> Product: **Guilduo（ギルデュオ）**
> Category: **Human × AI Work Platform.**
> Primary implementation owner: Codex Sol
> Relationship to Product UI: `NEWDESIGNv2.md` is the visual and interaction DNA for the real product. This document defines how that DNA is translated into the public landing page.

---

## 0. Purpose

This document defines the design, information architecture, narrative, motion, visual system, and implementation constraints for the official Guilduo landing page.

The landing page is not a miniature version of the Guilduo application.

Its purpose is to make a new product category understandable within seconds:

> Humans and AI agents can both originate work, receive work, execute work, hand work off, and review results.

The landing page must move the visitor through four stages:

1. **Stop** — create immediate recognition and curiosity.
2. **Understand** — explain Human ⇄ Agent work coordination.
3. **Believe** — prove that Guilduo is a real working product.
4. **Act** — send the visitor to Guilduo or GitHub.

The landing page should feel like:

**Apple-like clarity + Linear-like product credibility + a small amount of Guilduo playfulness.**

It must not look like a generic AI startup template.

---

# 1. Official Brand

## Brand Name

**Guilduo**

Japanese pronunciation:

**ギルデュオ**

Logo casing:

**Guilduo**

Large typographic / campaign treatment may use:

**GUILDUO**

Do not use `GUILDUO` as the default wordmark.

---

# 2. Brand Architecture

Guilduo uses four core concepts.

## Guild

**Brand concept**

Humans, AI agents, teammates, and services operate inside the same shared working environment.

## Duo

**Relationship**

Human × AI.

Neither side is defined only as requester or worker.

## Relay

**Movement of work**

Work passes between actors.

Examples:

* Human → Human
* Human → Agent
* Agent → Human
* Agent → Agent

## Quest

**Unit of work**

A task or piece of work inside Guilduo is represented as a Quest.

---

# 3. Official Japanese Copy

Do not casually rewrite these lines.

## Hero

# 人間だけが、依頼主じゃない。

## Philosophy

### 人もAIも、依頼主。人もAIも、担当者。

## Supporting Copy

人からAIへ。AIから人へ。

Codex、AI Agent、チームメンバー、自分自身。

仕事を任せ、進捗を共有し、レビューするための

**Human × AI Work Platform.**

## Motto

### **2者。1チーム。仕事は、どちらからでも。**

---

# 4. Official English Copy

## Hero

# Humans aren’t the only ones who delegate.

## Philosophy

### Humans and AI can both delegate. Humans and AI can both take ownership.

## Supporting Copy

From humans to AI. From AI to humans.

Codex, AI agents, teammates, or yourself.

A platform for delegating work, sharing progress, and reviewing results.

**Human × AI Work Platform.**

## Motto

### **2 Sides. 1 Team. Work Goes Both Ways.**

---

# 5. Localization

The official landing page launches with:

* Japanese
* English

Both are first-class versions.

Do not treat Japanese as a literal translation of the English page or English as a literal translation of Japanese.

The information architecture and visual hierarchy should remain consistent, but copy may be adapted where necessary to preserve impact.

Language switching must not cause layout breakage.

Long English strings and Japanese line breaking must both be considered during implementation.

---

# 6. Primary Audience

Audience priority:

1. **AI power users / developers**
2. **Small Human + Agent teams**
3. **General productivity users**
4. **Enterprise teams**

Examples of primary users include people already using:

* Codex
* Claude
* Gemini
* OpenClaw
* Hermes
* MCP-compatible agents

The landing page should therefore be understandable to general users while still containing enough technical proof for developers.

Do not turn the Hero into developer documentation.

Developer credibility appears later in the page.

---

# 7. Core Landing Page Narrative

The page follows this story:

```text
Human and AI are introduced as two actors
        ↓
A Quest can move between them
        ↓
Either side can originate work
        ↓
Guilduo coordinates the Relay
        ↓
Real product UI proves this exists
        ↓
Human review / Evidence proves control
        ↓
MCP proves external agents can participate
        ↓
Quest / Guild / Party add identity and fun
        ↓
Open Source proves ownership and extensibility
        ↓
Join the Guild
```

---

# 8. Global Visual Direction

Primary visual direction:

**Modern SaaS + Slightly Futuristic**

Default theme:

**Dark**

Theme behavior:

* Dark
* Light
* System

System theme should follow user preference.

Dark is the default presentation for screenshots, campaign visuals, and the first impression unless product requirements dictate otherwise.

---

# 9. Product Visual DNA

The landing page inherits its visual DNA from Guilduo's real product UI.

Important traits:

* high information density without visual clutter
* clear hierarchy
* restrained semantic colors
* fine dividers
* structured surfaces
* Human / Agent distinction
* Relay and dependency visualization
* evidence-based decision surfaces
* compact geometry
* intentional typography
* subtle state-driven motion

The landing page may simplify these patterns, but must not replace them with generic AI visual tropes.

---

# 10. Prohibited Visual Language

Do not use:

* generic purple-blue AI gradients
* glassmorphism as the dominant style
* neon glow
* ambient particles
* giant floating 3D AI spheres
* meaningless network diagrams
* excessive rounded cards
* nested cards
* giant KPI tiles
* crypto-style visual language
* sci-fi HUD imitation
* monitoring-console imitation
* permanent glowing borders
* infinite connector animations
* text smaller than necessary to create artificial density

The page may feel futuristic.

It must not feel like fictional software.

---

# 11. Hero Section

## Objective

The Hero exists to create recognition before explaining features.

The first impression must communicate:

**Human ⇄ Agent**

before:

MCP / Quest / Party / Battle / API / integrations.

---

## Hero Composition

Primary content:

**Guilduo**

# 人間だけが、依頼主じゃない。

### 人もAIも、依頼主。人もAIも、担当者。

**Human × AI Work Platform.**

### 2者。1チーム。仕事は、どちらからでも。

Primary CTA:

**Join the Guild**

Secondary CTA:

**View on GitHub**

---

# 12. Hero Brand Visual

The Hero visual is not a screenshot.

It must be implemented using HTML/CSS/SVG or equivalent web-native elements.

Concept:

**Quest Loom × Human/Agent Nodes**

Use a simplified visual language derived from the real product.

Elements:

* Human node
* Agent node
* Quest
* Relay path
* dependency / timeline hints
* restrained grid
* subtle Guild / tactical-map motif

The Hero must not look like a generic node graph.

---

## Hero Motion

A Quest should visibly Relay between Human and Agent.

The Motion communicates meaning.

Example sequence:

```text
Human
  │
  ├──── Quest ───→ Agent
  │                 │
  │                 │ work
  │                 ↓
  ←──── Review ─────┘
```

The visual may later demonstrate the opposite direction:

```text
Agent ─── Quest ───→ Human
```

Do not animate continuously for decoration.

Motion must pause or settle.

Respect:

`prefers-reduced-motion`.

---

# 13. Background Language

Base:

* dark/light product surfaces
* subtle grid
* fine dividers
* restrained depth
* product-like spacing

Secondary Guild motif may include extremely subtle references to:

* tactical maps
* guild emblems
* mission routing
* connected territories
* relay paths

These must remain abstract.

Do not turn the landing page into fantasy artwork.

---

# 14. Scroll Experience

Most sections use restrained motion.

Allowed:

* fade
* short translate
* reveal
* line drawing
* state transition

Special scroll-linked animation is reserved primarily for:

**Hero → Relay Concept → Product Proof**

This transition should feel like:

```text
abstract Guilduo concept
        ↓
same visual grammar becomes real software
```

The visitor should feel that the abstract Human ⇄ Agent model transforms into the real Guilduo Command UI.

---

# 15. Section 01 — Hero

Purpose:

Recognition.

Primary message:

# 人間だけが、依頼主じゃない。

Show Human ⇄ Agent.

Do not explain every feature.

CTA:

**Join the Guild**

**View on GitHub**

---

# 16. Section 02 — The New Work Relationship

Primary message:

# 人もAIも、依頼主。

# 人もAIも、担当者。

Show the four supported relationship directions as a conceptual model:

```text
Human → Human
Human → Agent
Agent → Human
Agent → Agent
```

The section should visually emphasize:

**ANY ACTOR → ANY ACTOR**

without necessarily using that exact phrase publicly.

---

## Human Agency

Agent → Human does not mean automatic control over the human.

When a Quest is relayed from an Agent to a Human, the Human may:

* accept
* decline
* review
* request changes where applicable

Preferred framing:

> **AIから人へQuestをRelayできる。**

Do not claim that Guilduo automatically allows AI systems to employ, command, or legally hire humans.

---

# 17. Section 03 — Product Proof / Command

This is the first major real product screenshot section.

Use the real Guilduo Command UI as the visual source of truth.

Preferred presentation:

* very large screenshot
* high-resolution
* minimal decorative frame
* no fake browser chrome unless useful
* no perspective distortion that harms readability

Screenshot / recording is the source of truth.

Do not redraw the full production UI as fake LP-only HTML unless there is a specific need.

---

## Product Narrative

Suggested headline:

# 判断すべき仕事だけ、あなたへ。

Possible English:

# Know what needs you.

Show how the user can understand:

* which Quest needs attention
* where the Relay stopped
* who owns the work
* what Evidence exists
* why Human judgment is required
* what action comes next

Explain product concepts such as:

* Attention Shelf
* Quest Loom
* Responsibility Relay
* Evidence
* Intervention Lens
* Decision

Do not turn the section into a feature checklist.

Show the workflow.

---

# 18. Section 04 — Relay

Primary message:

# 仕事は、どちらからでも。

Visualize the movement of work.

Human → Agent is not special-cased as the only valid direction.

Show:

* Human → Agent
* Agent → Human
* Agent → Agent
* Human → Human

Use actor identity and Relay lines.

Prefer a continuous visual explanation over four disconnected cards.

---

# 19. Section 05 — Developer / MCP-native

This section targets developers without making the entire landing page developer-first.

Primary headline direction:

# MCP-native.

Supporting direction:

# Bring your agents.

Show that existing AI environments can participate in the Guild.

Examples may include supported or documented integrations such as:

* Codex
* Claude
* Gemini
* OpenClaw
* Hermes

Only show integrations that are actually supported or documented at publication time.

---

## Numbers

Numbers may be used only when they represent real, currently verified product facts.

Examples:

**51 MCP tools**

Other numerical claims must be verified before publication.

Do not invent impressive numbers.

Do not hardcode a number into the design in a way that makes future updates difficult.

Numbers should come from a configurable content source where practical.

---

## Developer Proof

Possible elements:

* MCP
* REST / OpenAPI
* CLI
* Agent Registry
* Remote MCP
* Open Source

This section may become visually denser than the Hero.

It should still remain readable.

---

# 20. Section 06 — Evidence & Human Control

Primary direction:

# AIに任せる。

# 判断まで任せない。

This section explains that Agent collaboration does not require blind autonomy.

Show concepts such as:

* Evidence
* Review
* Handoff
* Dry-run
* Permission
* Conflict detection
* Human decision

This section is important for trust.

Avoid fear-driven safety messaging.

The tone should be:

**capable, transparent, controllable.**

---

# 21. Section 07 — Guild / Quest / Party

This section introduces the RPG / motivation layer.

Primary direction:

# Work together. Level up together.

Show real product UI for:

* Quest
* Guild
* Party
* Battle
* MP / rewards where applicable

This section may be more playful.

However:

RPG is not positioned as the core technical identity of Guilduo.

It is the layer that makes coordination more human, motivating, and memorable.

---

# 22. Official Character / Mascot

Status:

**TBD**

Do not design the Hero around a mascot that has not been formally selected.

The landing page architecture should leave room for:

* official Guilduo Agent
* official mascot
* user-created Agent
* character-driven reminder experiences

Character personality may later affect reminder / notification tone.

The current LP must remain valid even without an official character.

---

# 23. Section 08 — Open Source

Primary direction:

# Your Guild. Your agents. Your stack.

Show:

* GitHub
* Open Source
* MCP
* API
* extensibility
* self-controlled workflows where applicable

Do not imply deployment options that the current project does not yet support.

License and current technical status should come from the repository source of truth.

---

# 24. Section 09 — Competitor Comparison

A competitor comparison section is required.

Its purpose is not to insult competitors.

Its purpose is to explain Guilduo's category.

Recommended structure:

| Capability                  | Traditional Task Manager | AI Chat / Copilot | Guilduo    |
| --------------------------- | ------------------------ | ----------------- | ---------- |
| Humans as actors            | ✓                        | limited           | ✓          |
| AI Agents as actors         | limited                  | ✓                 | ✓          |
| Human → Agent work          | limited                  | ✓                 | ✓          |
| Agent → Human work          | — / varies               | — / varies        | ✓          |
| Human review                | varies                   | varies            | ✓          |
| Relay / handoff model       | varies                   | limited           | ✓          |
| External Agent connectivity | varies                   | varies            | MCP-native |
| Quest / Party layer         | —                        | —                 | ✓          |

This table is a design placeholder.

Before publication, every factual comparison must be verified against current competitor behavior.

Named competitor comparisons require fresh research immediately before launch.

Do not publish stale or unverified claims.

If a factual named comparison cannot be maintained safely, use category-based comparison instead.

---

# 25. Competitor Comparison Tone

Do not use:

* "Everyone else is broken"
* "The only AI platform"
* "First ever"
* "No competitor can..."
* unsupported superiority claims

Prefer:

> Traditional task tools were designed primarily around human teams.

> AI assistants were designed primarily around user → AI interaction.

> Guilduo is designed around work moving between both.

The comparison should clarify architecture, not manufacture drama.

---

# 26. Section 10 — Final CTA

Return to a quieter visual environment.

Reuse the Hero concept.

Primary:

# 人間だけが、依頼主じゃない。

Supporting:

### 2者。1チーム。

### 仕事は、どちらからでも。

CTA:

# **Join the Guild**

Secondary:

**View on GitHub**

The page should end where the idea began.

---

# 27. CTA Rules

Primary CTA:

**Join the Guild**

Use consistently.

Do not alternate between:

* Start Now
* Try Free
* Get Started
* Join
* Launch App

without a specific reason.

Secondary CTA:

**View on GitHub**

CTA URLs must be configurable.

---

# 28. Screenshot / Recording Rules

Real UI Screenshot / Recording is the product proof source of truth.

Requirements:

* use production-quality fixture data
* no personal data
* no credentials
* no secrets
* no broken states unless demonstrating those states
* consistent viewport
* high resolution
* Dark default
* Light variant where relevant

Do not fake product capabilities for marketing visuals.

LP recordings may use deterministic demo data.

---

# 29. Theme Behavior

Supported:

* Dark
* Light
* System

Default brand presentation:

**Dark**

If no persisted or system preference is available, Dark may be used as the Guilduo marketing default.

Theme transitions must be subtle.

Do not animate the entire page aggressively when changing theme.

---

# 30. Typography

Typography should feel:

* modern
* confident
* technical
* readable
* slightly distinctive

Hero type may be significantly larger than Product UI typography.

Body copy must remain comfortable in both Japanese and English.

Avoid extremely condensed display fonts for Japanese.

Do not add external fonts casually if repository policy disallows them.

---

# 31. Motion Principles

Motion exists to explain:

* Relay
* ownership
* transition
* handoff
* selection
* transformation from concept → product

Motion does not exist merely to make the page feel expensive.

Preferred durations:

* micro interaction: ~100–180ms
* small reveal: ~180–300ms
* major section transition: ~300–700ms where appropriate
* Hero scroll-linked sequence may be longer because it follows user scroll

Avoid:

* continuous floating
* infinite pulsing
* random parallax
* constant decorative motion
* motion necessary to understand static content

Respect reduced motion.

---

# 32. Creative Freedom for Codex Sol

Target balance:

**70% fixed direction / 30% creative freedom**

## Fixed

Sol must preserve:

* section narrative
* official copy
* brand hierarchy
* Human ⇄ Agent concept
* Guild / Duo / Relay / Quest language
* CTA
* real Product UI
* Product Visual DNA
* theme requirements
* comparison section
* prohibited styles

## Sol may decide

* exact Hero composition
* typography scale
* spacing rhythm
* exact animation timing
* section pacing
* abstract Guild motif
* visual transitions
* Product screenshot framing
* local responsive composition

Sol should improve the execution, not redefine the brand.

---

# 33. Responsive Design

The landing page must work at minimum across:

* desktop
* laptop
* tablet
* mobile

Do not create a desktop-only cinematic experience.

On mobile:

* Human ⇄ Agent concept must remain understandable
* Hero copy remains dominant
* Relay animation may simplify
* Product screenshot may become horizontally contained or selectively cropped
* comparison tables may transform into structured rows/cards
* CTA remains visible and accessible
* no horizontal page overflow

Do not simply scale desktop artwork down.

---

# 34. Accessibility

Required:

* semantic HTML
* keyboard navigation
* visible focus states
* sufficient contrast
* reduced motion
* alt text for meaningful product imagery
* accessible language switcher
* accessible theme control
* buttons and links have clear names
* decorative graphics hidden appropriately from screen readers

Animation must never be the only way to communicate Relay direction.

---

# 35. Performance

Avoid turning the Guilduo marketing page into a heavy showcase.

Prefer:

* HTML
* CSS
* SVG
* lightweight JavaScript

Use heavier rendering only when it provides meaningful value.

Hero abstract visual should not require a large WebGL scene.

Real product videos should use optimized loading and poster images.

Above-the-fold content should remain fast.

---

# 36. SEO / Metadata

Use Guilduo consistently.

Primary category language:

**Human × AI Work Platform**

Japanese metadata should communicate Human / AI Agent collaboration without relying only on RPG terminology.

English metadata should include relevant concepts such as:

* AI agents
* human-AI collaboration
* work coordination
* MCP
* task management

Do not keyword-stuff.

---

# 37. Brand Do / Don't

## Do

* show Human and Agent as actors
* show work moving between them
* use real product proof
* use Quest / Guild / Party intentionally
* make technical credibility visible
* use actual numbers
* emphasize Human agency
* keep UI and LP visually related

## Don't

* reduce Guilduo to "AI Todo"
* reduce Guilduo to "Habitica with AI"
* imply AI automatically controls humans
* make RPG the entire brand
* make the Hero a feature grid
* invent integration support
* invent metrics
* use fake UI
* use generic AI gradients
* turn every section into cards

---

# 38. Final Landing Page Order

```text
01 Hero
   ↓
02 Human ⇄ Agent / New Work Relationship
   ↓
03 Command Product Proof
   ↓
04 Relay
   ↓
05 MCP-native / Developer
   ↓
06 Evidence & Human Control
   ↓
07 Guild / Quest / Party / Battle
   ↓
08 Open Source
   ↓
09 Competitor Comparison
   ↓
10 Final CTA
```

The exact placement of Open Source and Comparison may be swapped by Sol if the narrative improves, but Hero → Relationship → Product Proof must remain intact.

---

# 39. Relationship to Product Design

`NEWDESIGNv2.md` remains the source of truth for the real Guilduo Web UI.

This document does not authorize Sol to redesign the product itself.

Landing-page abstractions may borrow from:

* Quest Loom
* Relay
* Actor identity
* Evidence
* Intervention
* dependency lines
* tactical spatial organization

But they must remain abstractions.

Real Product UI shown on the LP must come from the real application.

---

# 40. Success Criteria

A visitor who has never heard of Guilduo should understand within approximately five seconds that:

1. Guilduo involves Humans and AI Agents.
2. Work can move between them.
3. Guilduo is not merely an AI chat interface.

After scrolling through Product Proof, they should understand that:

4. Guilduo manages real Quest ownership and Relay.
5. Humans retain review and decision control.
6. External agents can connect through technologies such as MCP.
7. Quest / Guild / Party add a distinctive experience layer.
8. Guilduo is a real product, not only a concept.

The final desired reaction is:

> **「AI付きTodoじゃなくて、人とAIが同じ仕事の流れに入るためのプラットフォームなんだ。」**

If that is not clear, the LP has failed regardless of visual polish.

---

# 41. Final Creative Principle

The landing page should not explain the future with science-fiction imagery.

It should show that the future already works.

**Human ⇄ Agent**

becomes:

**Guild → Relay → Quest → Review**

and ends with:

# **Join the Guild.**
