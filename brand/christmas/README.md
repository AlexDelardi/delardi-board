# Delardi Christmas UI decorations

Ten static, decorative PNGs for Delardi's in-store tools: the tools hub, Performance, CRM, Sales, Stock, the weekly board and the Catalogue. The artwork is drawn for white and light surfaces.

**The idea:** a quiet seasonal note, the way a boutique puts one sprig on the counter. One decoration per screen, in one fixed place, never competing with a figure, a control or the logo.

Revised 24 November 2026: the season starts on 20 November, the CRM carries its mark, and the code is shared (`ui/season.js`). What changed from the first version is listed at the end.

## Season

- **On from 20 November to 14 January**, both days included. Off the rest of the year, with no leftover spacing.
- Every tool switches on the same dates, by itself. Nobody turns it on by hand.
- Preview on any date by adding `?season=christmas` to a tool's address; `?season=off` hides it.

## The assets

| File | Display (CSS px) | Export (px) | Role |
|---|---:|---:|---|
| christmas-tree.png | 120 × 160 | 360 × 480 | **Hero.** Tools hub only |
| round-bauble.png | 28 × 36 | 84 × 108 | Beside the tree |
| teardrop-bauble.png | 28 × 40 | 84 × 120 | Beside the tree |
| star-ornament.png | 32 × 36 | 96 × 108 | Beside the tree |
| stocking.png | 38 × 52 | 114 × 156 | Tools hub welcome area, instead of the tree on a phone |
| candle.png | 36 × 56 | 108 × 168 | Lock screen, beside the passcode card |
| fir-sprig.png | **128 × 56** (96 × 42 where the line is short) | 288 × 126 | **Screen mark** for dashboards and the Catalogue |
| geometric-snowflake.png | 20 × 20 | 60 × 60 | **Screen mark** for working screens |
| mini-snowflake.png | 14 × 14 | 42 × 42 | Only as a companion to the geometric snowflake |
| branching-snowflake.png | 24 × 24 | 72 × 72 | Alternative screen mark; never together with the geometric one |

Display sizes are fixed. Do not scale an asset to fill a gap; choose a different asset or leave the gap.

## Three tiers

1. **Hero: the tree arrangement.** One place only, the tools hub. The tree with at most two ornaments beside it, never hung on it. Tablet and desktop only.
2. **Screen mark: fir sprig.** Dashboards and reading screens, one per screen: the Performance month, the weekly board, the Catalogue's landing view.
3. **Accent: snowflake pair.** Every other screen that carries a mark: the geometric snowflake with the mini snowflake to its lower right. On a phone this pair replaces the sprig too.

A screen carries one tier, never two.

## Where it goes

**One position for every screen mark: the top right corner of the content area, on the page title's line.** The title keeps clear space to its right so the two never touch. The same corner on every screen means the eye learns it once and stops looking.

| Screen | Desktop and tablet | Phone |
|---|---|---|
| Tools hub | Tree arrangement beside the welcome line | Stocking, or nothing |
| Performance: Month | Fir sprig | Snowflake pair |
| Performance: Year, Brands, Incentive | Snowflake pair | Snowflake pair |
| CRM: every view | Snowflake pair at the far end of the tab row | Nothing (its phone header has no tab row yet) |
| Sales, Stock: list screens | Snowflake pair | Snowflake pair |
| Catalogue (clients see it) | Fir sprig, landing view only | Nothing |
| Lock screen | Candle beside the passcode card | Nothing |
| Any form, till, sale in progress, dialog, panel | **Nothing** | **Nothing** |

## Never

- On the navy header, a button, a table, a chart or a headline card.
- Within one D height of the logo.
- On a screen where someone is typing, selling or correcting data.
- More than one decoration per screen (the snowflake pair counts as one; so does the tree arrangement).
- Animated: no falling snow, no twinkle, no hover effect.
- Recoloured, tinted, rotated, cropped or given a shadow.
- In exports, receipts or anything printed.
- As a status or a signal. A decoration never means anything.

## Building it in

- Empty alt text, hidden from screen readers, `pointer-events: none`, not selectable.
- Positioned out of the layout's flow, so switching the season on or off moves nothing but the title's right-hand clear space.
- Inlined into the page like the logo; no request at run time.
- **Weight budget: 25 KB per asset, 40 KB per screen.** The fir sprig and both small snowflakes are within it. The tree is 81 KB and needs a lighter export (or an SVG) before it goes on the tools hub.
- Each tool's tests check, with the preview switched on: one mark per screen, at its display size, touching no text, control or figure, and none on forms.

## Artwork brief

Flat shapes and crisp silhouettes that read at the display size. Delardi Blue (#082966), white (#FFFFFF) and deep navy (#001A4A), used sparingly. Alpha-transparent background with a small margin. No shadows, gradients, glow, text or logos. Pattern inks stay with the agency's existing patterns.

- **Christmas tree** — portrait 3:4. Slender fir, three stepped tiers, three small white baubles and a simple four-point topper.
- **Round bauble** — portrait 7:9. Round blue ornament, short navy hanging loop and one white horizontal stripe.
- **Teardrop bauble** — portrait 7:10. Elongated white drop, navy outer edge, small navy cap and loop, two simple blue flutes.
- **Star ornament** — portrait 8:9. Five-point hanging ornament with alternating blue and white flat facets and a short navy loop.
- **Stocking** — portrait 19:26. Navy stocking with a broad white cuff outlined in navy and one simple blue stitched seam.
- **Candle** — portrait 9:14. White pillar candle with a blue edge, low square navy holder, single blue-edged teardrop flame.
- **Branching snowflake** — square. Symmetrical six-arm crystal, one pair of branches per arm and an open centre, blue with restrained white details.
- **Geometric snowflake** — square. Compact six-arm blue crystal with a navy hexagonal centre and white diamond tips edged in blue.
- **Mini snowflake** — square. Six short, solid, evenly spaced blue radial spokes, legible at 14 CSS pixels.
- **Fir sprig** — wide landscape 16:7. Two diagonal blue fir tips with simplified needles and a small folded white ribbon outlined in navy.

### For the next round of artwork
- **Vector masters (SVG)** for all ten. They are flat shapes; SVG stays sharp at any size and weighs a fraction of the PNG.
- **White-ink versions** for the navy header and the lock screen's mast. Until they exist, nothing goes on navy.
- **Thicker needles on the fir sprig**, so it holds at 96 × 42.
- **A lighter tree**: under 25 KB as PNG, or SVG.

## What changed from the first version

- A season with fixed dates and a preview switch.
- Three tiers and a placement table per tool and device, in place of "suggested placement".
- One fixed position for every screen mark: top right, on the title's line.
- The fir sprig shown at 128 × 56 on tablet and desktop; at 96 × 42 its needles read thin.
- The mini snowflake is only ever the geometric snowflake's companion; the two large snowflakes are never used together.
- The candle moves to the lock screen; the stocking is the phone stand-in for the tree.
- A "Never" list, a weight budget and the checks every tool runs.
- Requests for the next round of artwork.

## Status

- **Built:** Performance: fir sprig on Month, snowflake pair on Year, Brands and Incentive, nothing on Inputs. CRM: snowflake pair on the tab row of every view, nothing on the card or on a phone.
- **Shared code:** `ui/season.js` holds the dates, the preview switch and the mark; each tool's build puts the images in.
- **Not built yet:** the tools hub, Sales, Stock, Catalogue, the lock screen.
