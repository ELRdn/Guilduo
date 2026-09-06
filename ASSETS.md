# Asset Policy

QuestForge includes project-specific pixel characters, bosses, equipment images, icons, and interface graphics under `assets/`.

用途、許可Surface、表示サイズ、フォールバックは[`design/ASSET_MANIFEST.md`](design/ASSET_MANIFEST.md)を正本とする。この文書はライセンスとContribution Policyを扱う。

- Some character, boss, and equipment images were created or iterated with generative image tools.
- Generated imagery may contain visual similarities that were not intentionally requested. Review assets before commercial use or public promotion.
- Unless a file contains a separate notice, original QuestForge assets are distributed with the project under `AGPL-3.0-only`.
- Third-party trademarks, service names, and logos remain the property of their owners. Their names are used only to describe optional interoperability.
- Contributions must be original, properly licensed, or accompanied by a clear source and license notice.
- The Lucide icon dependency is third-party software and remains governed by its upstream license. Do not copy generated icon markup into the asset folders unless the source and license are recorded.

Do not add scraped game art, copyrighted character sprites, or an asset whose redistribution rights are unclear.

## Guilduo E2 mark used by LPv2

LPv2 reuses the existing product-owner-approved E2 master, Gold derivative, and full-color favicon from commit `4f97b55eb9e88261e2419af17a8c8ab6ea90e92a` on `codex/fix-agent-registry-recovery`, without changing their bytes. The original `assets/icons/favicon-48.png` is copied as `assets/brand/guilduo-favicon-48.png` to keep LPv2 independent of the existing application icons.

The source branch records a provisional trace from a user-provided AI-generated color exploration sheet and `Guilduo_E2_Official_Emblem.svg` / `Guilduo_E2_Official_AppIcon.svg` references, approved by ひろなお for public-beta preflight on 2026-08-29. The original generation service, date, and prompt are unavailable. The mark contains no external font or third-party logo dependency. This reuse adds no image generation and does not extend the recorded approval into a legal guarantee.
