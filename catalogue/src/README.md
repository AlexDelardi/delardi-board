# Delardi Catalogue — source (`catalogue/src/`)

`catalogue/index.html` is one self-contained file: the page, its styles, its
script and the brand marks, with no network request except to the API. That
file is **built**, not edited by hand.

## Building the page

```
cd catalogue/src
python3 build.py        # writes ../index.html
```

| File | What is in it |
|---|---|
| `template.html` | the styles and the page shell |
| `app.js` | the session, the routes, the start screen, the four ways in, the reference list and its filters |
| `model.js` | the model page: photo gallery (v6), "In transit" with the pieces on their way (v8), colour switch, crucial facts, advisor block, specifications with TBC and marks, description, matching pieces, the owner's data block (part 3) |
| `floor.js` | client view, report an error, the owner's review of reports (`#/reports`), the 15-minute idle lock on iPads and phones, the no-connection screen, the back button closing panels (part 4) |

`../brands/` holds the brand logos on the brand tiles (v9): one-colour navy PNGs, made from each brand's own logo (Wikimedia Commons, the brand's website or delardi.uz, 26 Oct 2026), turned light in the dark theme. The list of brands with a logo is `BRAND_LOGOS` in `app.js`; a brand without one shows its name.

Russian values (v10): attribute values written in English (metals, stones, finishes, notes) carry their Russian from `cat_text_ru` (one translation per distinct English text, kept apart from the stock load so a reload never wipes it). The API (v5) adds `ru` to each attribute it can translate; the page shows it in the Russian version and falls back to the built-in word list.

Sub-categories, size filter, back button (v11, API v6 — 27 Oct 2026):
- **Sub-category pages:** a category tile with more than one kind of piece (Jewellery, Accessories) opens a sub-page of its kinds — Rings, Necklaces, Earrings, Bracelets — at `#/cat/<category>`; a category with one kind (Watches) goes straight to the list. Counts come from the reference, so no extra call.
- **Size filter:** once a category or a kind of piece is chosen, the filter sheet offers the sizes that kind has in stock, scoped per category (watches use case size instead). `cat_models.size_keys` holds each model's in-stock piece sizes (rebuilt in `cat_rebuild_facets`); the API (v6) filters on them; `cat_reference` carries the per-retail-category size facet.
- **Back button:** the model page has a Back button that returns to the list exactly as it was — the same filters and the scroll position. The position is saved on the list as it is left and restored on return, so the browser's own Back behaves the same.

Price filter in full UZS (v12 — 29 Oct 2026): the price range filter now takes **full UZS** (the same units shown on the cards), not millions, and the input is a text field so grouped entry like `46 000 000` is accepted; a reversed from/to is corrected. Previously the "million UZS" field plus a strict number input meant a normal full-UZS entry filtered everything out.

Watch movement split + spec tidy (v13 — 4 Nov 2026):
- **Watches split by movement.** The Watches category now opens a sub-page of movement tiles — **All watches** (first, so the ones with no movement on file stay reachable), then **Automatic / Quartz / Hand-wound** for those present — each opening the watch list filtered on that movement. Jewellery and Accessories are unchanged. Counts come from the reference's movement facet (movement is only set on watches, so it is the watch split); no extra API call, no data change.
- **Model page — rows that don't apply are dropped.** A spec row that belongs only to a kind of piece (ring size → rings, length/clasp → necklaces & bracelets, fastening → earrings) is no longer shown as "TBC" on pieces it can't apply to; it is dropped when empty, and still shown if it happens to carry a value. `SPEC_ONLY_FOR` in `model.js`.
- **Model page — stoneless pieces collapse.** A piece with no stones (empty `stone_keys`, the same signal as the "no stones" filter) reads a single **"No stones" / "Без камней"** line in place of the empty stone block, at the top fact and in the Specifications. Genuinely-unknown fields on pieces that do have stones still read "TBC".

`../app/` holds the home-screen manifest and icons (the brandbook monogram, white on navy). There is no service worker: nothing is kept for offline use.

## Checking it

```
cd catalogue/src
node qa/test.js
```

`qa/mock.js` stands in for `catalogue-api`: invented brands, references and
prices, no real stock. The checks run offline in Chromium through Playwright
and cover:
- the passcode gate
- the start screen and the four ways in
- search
- the list's sort, filters, pills and "show more"
- greyed sold-out models and the TBC mark
- the eye button
- opened recently
- Russian
- the lock and an expired session
- the iPad-portrait and phone layouts: tap targets, and nothing scrolling sideways
- the dark theme

190 checks as of 9 November 2026. Besides the list above, they cover:
- category tile illustrations (v14): the category and kind tiles render an image
- sub-category pages (v11): a category with several kinds opens its kinds; a single-kind category (Accessories) goes straight to the list
- the watch movement split (v13): Watches open an All watches / Automatic / Quartz / Hand-wound sub-page, each movement tile filtering the list
- the spec tidy (v13): a stoneless piece reads one "No stones" line, and a row that doesn't apply to the kind of piece (ring size on earrings) is dropped while applicable unknowns still read TBC
- the size filter (v11): offered on a category/kind, scoped to it, in-stock sizes only, kept out of watches; reaches the API and shows as a pill
- the Back button (v11): returns to the list with its filters and the scroll position restored
- in transit (v8): models whose pieces are shipped but not in Colibri yet say "In transit" rather than "Sold out", count as available in "In stock", have their own filter, and the model page shows how many are on their way and when they were shipped (staff only)
- the facts at the top of a model page opening their lists (collection, category, type, metal, each stone, movement, gender)
- photos: the first photo on list cards, the gallery per colour with thumbnails, a colour without photos borrowing another colour's (marked)
- the model page: colours, carried-over facts, marks, TBC, Russian
- the metal, stone and movement filters
- client view: what it hides, that it survives a reload, and that locking ends it
- reporting an error and the owner's review
- back closing panels
- the idle lock on an iPad, held across a closed page and not applied on a desk computer
- opening without a connection

Category tile illustrations (v14 — 9 Nov 2026): the menu tiles (category, kind of piece, watch movement) carry a generic navy-and-gold-on-cream illustration instead of the serif-word placeholder. The set lives in `catalogue/cat-tiles/` (one cohesive style, generic unbranded objects); `CAT_IMG` / `TYPE_IMG` / `MOVE_IMG` in `app.js` map each tile to its file, `tile()` renders it (square art, `object-fit: cover`), and a tile without a mapped image still falls back to the word. Brand tiles keep their logos; collection tiles keep the word.

## The API

`api/index.ts` is the deployed `catalogue-api` edge function, kept here so the
page and its API can be read side by side. It is deployed from Supabase, not
from this repository.

**No key and no catalogue data, ever, in this repository.**
