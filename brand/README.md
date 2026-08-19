# Brand assets

Derived from `DELARDI brandbook (short).pdf` (05. Marketing / 01. Delardi Brand
Narrative). All four are keyed to transparency from the brandbook artwork, not
redrawn — the brandbook forbids altering, recolouring or rearranging the mark.

| File | Use |
|---|---|
| `wordmark_white.png` | Simplified wordmark, white. The masthead. The brandbook permits the version without the monogram where layout height rules out the primary lockup. |
| `monogram_white.png` | Monogram alone, white. Permitted as a standalone identity element. Used as the corner watermark. |
| `monogram_navy.png` | Monogram alone, brand navy, for light backgrounds. |
| `favicon.png` | Monogram on a navy field, 128px, browser tab. |

These are embedded in `index.html` as data URIs so the page stays a single
self-contained file with no external requests. The copies here are the source of
truth if the page ever needs rebuilding.

## Tokens used in the board

- **Navy (primary)** `#001A4A` · **Navy (secondary)** `#082966` — the brandbook's
  entire official palette.
- **Accent face** Palatino Linotype · **Text face** Evolventa. Same font stacks as
  the existing Sales and P&L dashboards, so the three match. No webfont is
  loaded: Evolventa falls back to Segoe UI and Palatino Linotype to Book Antiqua
  on machines that lack them.
- **Pillar tones** — the brand supplies one hue, so the four pillars use a
  single-hue tonal ramp (`#001A4A · #082966 · #2E5490 · #7C97C4`, re-stepped for
  dark mode) rather than four invented colours. Validated for monotone lightness
  and light-end contrast in both modes. Every pillar always carries its name and
  a Roman numeral, so tone is never the only cue.
- **Status colours** are reserved and taken from the existing dashboards
  (`#2F6F4F` good · `#B07A1E` warning · `#C2612F` serious · `#9B3B3B` critical),
  re-stepped for the dark surface. Nothing else in the interface uses them.
