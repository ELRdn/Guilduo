# QuestForge Golden References

> **English summary:** Golden References are sanitized screenshots used to verify layout rhythm, information density, hierarchy, component proportions, and responsive behavior. They are not a fixture for user data.

## Purpose

Golden References are normative for:

- information density
- visual hierarchy
- component proportions
- spacing and visual rhythm
- scroll ownership
- image scale and placement

They are not normative for:

- Quest titles, notes, dates, or counts
- user names, UID, email, or OAuth state
- exact Agent names or generated content
- theme-specific color values outside the captured theme

## Capture contract

- Use a fixed local demo fixture, never a real Firebase account.
- Crop to the application viewport; browser chrome is excluded.
- Use Soft Ops Light as the baseline, then capture one Dark mode spot check.
- Keep the same fixture IDs and image assets between captures.
- Do not commit screenshots containing personal data, tokens, or external service content.
- Record viewport, theme, language, fixture version, and capture date in the filename or release note.

## Required references

| File | Surface | Baseline viewport |
| --- | --- | --- |
| `today-desktop.png` | Today | 1440×900 |
| `today-mobile.png` | Today | 390×844 |
| `quest-tree-desktop.png` | Quest Tree | 1440×900 |
| `battle-desktop.png` | Battle | 1440×900 |
| `party-desktop.png` | Party | 1440×900 |
| `integrations-desktop.png` | Integrations | 1440×900 |
| `profile-desktop.png` | Profile | 1440×900 |
| `settings-desktop.png` | Settings | 1440×900 |

Responsive checks additionally cover 1280×720, 1024×900, 901×900, 412×915, and 360px. A reference update must include the reason, changed Surface, viewport, and whether the change is structural or fixture-only.

## Review checklist

- No Quest number, diamond marker, checkbox, or title overlaps.
- Only the intended region scrolls on desktop.
- Battle characters and boss remain visible on light and dark stages.
- Human, Astra, and Agent identity labels remain distinct.
- Long German, Russian, Chinese, Korean, and Japanese labels do not overflow.
- Empty, loading, stale, error, and reconnect states have a clear next action.

## 再生成

ローカルViteとChrome DevTools Protocolを起動した状態で、次を実行する。実アカウントではなくInteraction Labのデモ状態を使う。

```bash
QF_LAB_DEBUG_URL=http://127.0.0.1:9222 \
QF_LAB_URL=http://127.0.0.1:5191/interaction-lab/ \
QF_DESIGN_REFERENCE_DIR=design/reference \
npm run design:capture
```
