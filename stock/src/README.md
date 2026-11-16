# Delardi Stock — source (`stock/src/`)

Stock shows every piece the boutique holds or expects (in stock, reserved, booked
out, in transit, damaged, not received, sold) with its state, how long it has
been in that state and its retail price, and lets a manager change a piece's
state and answer the review queue. Spec: `docs/specs/2026-11-16-stock-tool-v1-design.md`.

`stock/index.html` is one self-contained file: the page, its styles, its script
and the brand marks, with no network request except to `stock-api`. That file
is **built**, not edited by hand. The page holds no database key: everything
goes through `stock-api`, whose contract is **`stock/src/api/README.md`**
(actions, filters, statuses and the exact error sentences).

## Building and testing

```
cd stock/src
python3 build.py        # writes ../index.html
node qa/test.js         # Playwright (Chromium) against qa/mock.js
SHOTS=/tmp/shots node qa/test.js    # the same, saving screenshots
```

From the repository root, `node qa/kit.cjs` checks the page against the kit's
palette rules and `python3 qa/check-builds.py` checks that the committed page
matches its source.

`qa/mock.js` is an in-memory `stock-api` that follows the contract: 60 invented
pieces (`ZZ.00.xxxxx`, brands "Zz Atelier", "Zz Jeweller", "Zz Watchmaker")
across all seven states, two without a price, one with a 60-character model
name, five open review items and a history per piece. Passcodes: `demo` (view,
manage, crm), `look` (view only), `nocrm` (view and manage, no crm), `none` (no
view: 403). The suite serves the built page at the GitHub Pages URL
(`…/delardi-board/stock/`), sends `stock-api` calls to the mock and fails any
other request.

## Files

`build.py` puts `ui/kit.css` where `template.html` has the `/*__KIT_CSS__*/`
marker, inlines the brand marks as data URIs (the vector wordmark
`brand/wordmark_white.svg`, the favicon) and drops these modules, in this
order, just before the `/* ---- init */` marker in `app.js` (a module that is
not there yet is skipped):

| File | What is in it |
|---|---|
| `app.js` | the shell: state `S`, `api()`, the dictionary (`tr`, `RU`, `pl`), `el()`, `toast()`, `modal()`, `confirmBox()`, `fmtDate` / `fmtUZS` / `fmtMoney`, `STATE_WORDS` and `stateTag(state)`, routes and `go()`, the header and tabs, the passcode card, the lock and the idle lock (touch devices, 15 minutes), `openPiece(id)`, and the init block |
| `../../ui/tools.js` | the kit's Tools switcher |
| `list.js` | `#/pieces`: filters, totals by state, the table, the pager (`renderList(main)`) |
| `piece.js` | the piece panel and state changes (Task 4): defines `showPiece(id)`, called by `openPiece`, and `closePiece()`, called on lock |
| `review.js` | the review queue (Task 5): defines `renderReview(main)`; until then `#/review` shows a placeholder |
| `../../ui/xlsx.js` | the kit's workbook writer, `kitXlsx` (see `ui/README.md`) |
| `export.js` | the "Download .xlsx" button: asks `stock-api` for every piece matching the filters and saves `Delardi_stock_<date>.xlsx` |

## Routes

- `#/pieces` (the default; any unknown hash shows it): the list.
- `#/review`: the open review items (answering one needs the manage right).
- A piece opens in a right-hand panel over either screen (`openPiece(id)`); it has no route of its own.

## Rights

The passcode gives a Stock session that opens nothing else. Every call re-reads the
login's rights (contract: `api/README.md`):

| Right | Opens |
|---|---|
| `view` (`can_view_stock`) | the list, the piece panel, the review queue (read), the export. Without it: 403 at unlock. |
| `manage` (`can_manage_stock`) | Reserve, Book out, Damaged, Back in stock, and answering review items |
| `crm` (`can_view_crm`) | a held piece's client **name**; without it the client reference |

Book out and Damaged need a note; Reserve and Back in stock take an optional one.
A request that takes longer than 20 seconds is cut and the page says "The server
did not answer. Try again."; the busy panel is released.

## The list

- Filters (search, debounced 300 ms; state; brand; category; price from / to in
  whole so'm) live in `S.filters` and `S.page` and nowhere else — not in the
  URL, not in storage. A change goes back to page 1.
- The totals strip has one card per state present in the answer's `totals`
  (order: in stock, reserved, booked out, in transit, damaged, not received,
  sold) with pieces, value in so'm and "N without price". Clicking a card sets
  the state filter; clicking it again clears it.
- Columns: Serial · Brand · Reference / Model · Size · State · Since · Price.
  A row click or Enter calls `openPiece(piece_id)`.
- 50 rows a page; "Page N of M" with Previous / Next.

Every string has its Russian in `RU`; dates are `16 Nov 2026` / `16 ноя 2026`
in Tashkent time; money is `31 500 000 so'm` / `сум`.

## Going live

Not done yet; each step waits for Alex's yes. Nothing here touches production
until then.

1. Apply migration `stk_1` (the read functions, `can_view_stock`,
   `editor_sessions.can_use_stock`, `ops_has_right` learning `'view_stock'`).
2. Deploy `stock-api` with `verify_jwt` off, like `sales-api`; the repository
   copy `stock/src/api/index.ts` and the deployed one must be identical.
3. Merge the pull request (the page, `stock/index.html`).
4. Alex opens Stock, checks the counts against the ones he sees in Colibri,
   and does one Reserve, then Back in stock, on a piece.

## Screenshots

`SHOTS=/tmp/shots node qa/test.js` writes `s01-list`, `s02-piece`, `s03-change`
(a filled Reserve form), `s04-review`, `s05-lock` at 1024×768 and
`s06-list-portrait`, `s07-piece-portrait` at 768×1024. The "no sideways scroll"
check on each screen runs with or without `SHOTS`.
