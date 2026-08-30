# Asset Policy

QuestForge includes project-specific pixel characters, bosses, equipment images, icons, and interface graphics under `assets/`.

用途、許可Surface、表示サイズ、フォールバックは[`design/ASSET_MANIFEST.md`](design/ASSET_MANIFEST.md)を正本とする。この文書はライセンスとContribution Policyを扱う。

## Guilduo E2 mark provenance

The Guilduo E2 mark currently tracked under `assets/brand/` is a provisional trace derived from a user-provided AI-generated color exploration sheet and accompanying E2 SVG reference files. On 2026-08-29, ひろなお approved this provisional trace for Guilduo public-beta preflight and approved the icon-only OG/GitHub policy. This is product-owner approval for the beta rollout, not trademark registration or a legal opinion.

The provenance record identifies the supplied exploration sheet and `Guilduo_E2_Official_Emblem.svg` / `Guilduo_E2_Official_AppIcon.svg` references. The original generation service, generation date, and prompt were not included in the supplied materials or repository; they are recorded as unavailable rather than inferred. No additional image generation was used during implementation. The trace is intentionally self-contained: it uses one inline path, no embedded image, no external font, and no third-party logo asset. `tools/generate-brand-assets.mts` creates the monochrome SVG derivatives and PNG delivery sizes from that master.

The `0.6.0-beta.8` public release remains gated by local validation and external-surface updates. Do not describe the mark as legally cleared beyond the recorded product-owner approval.

- Some character, boss, and equipment images were created or iterated with generative image tools.
- Generated imagery may contain visual similarities that were not intentionally requested. Review assets before commercial use or public promotion.
- Unless a file contains a separate notice, original QuestForge assets are distributed with the project under `AGPL-3.0-only`.
- Third-party trademarks, service names, and logos remain the property of their owners. Their names are used only to describe optional interoperability.
- Contributions must be original, properly licensed, or accompanied by a clear source and license notice.
- The Lucide icon dependency is third-party software and remains governed by its upstream license. Do not copy generated icon markup into the asset folders unless the source and license are recorded.
- The legacy character icon is retired from Guilduo brand identification but remains available for Astra/personality surfaces. Do not use it as the product favicon, PWA icon, OG image, or GitHub avatar.

Do not add scraped game art, copyrighted character sprites, or an asset whose redistribution rights are unclear.
