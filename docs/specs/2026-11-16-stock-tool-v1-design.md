# Stock tool v1 — design

**Date:** 16 Nov 2026 · **Roadmap:** W3 first slice (W3.1 list, W3.2 piece view, W3.3 adjust, W3.5 export) · **Status:** written by Claude while Alex was away (he asked for independent work on "the one that requires my attention the least", 16 Nov 22:08). **Every choice not stated by Alex is marked *Call*** for his review. Nothing goes to production before his yes.
**Sources:** roadmap v4 §W3; foundation design `2026-11-11-s2-foundation-design.md` (states, events, review queue); `Tools_Design_Guideline_v1` (look, G1–G6); the Sales tool as the pattern (one page + one edge function, passcode session, rights re-read on every call).

## Intent

Today the only way to see stock is Colibri's report exported to Excel, and the 7 inventory states and the review queue built in S2 have no screen at all. A piece can only be reserved, booked out or marked damaged by SQL. The Stock tool gives Alex (and later the store manager) one place to find any piece, see everything about it, change its state with a reason, work the review queue, and take a list into Excel. It replaces Colibri's stock screens; labels, import and codes follow in later slices (W2, W3.4, W3.6).

## Goals (this slice)

1. **List** of every piece, with:
   - search by serial, barcode, reference, brand, collection or model name;
   - filters: state, brand, category, price range;
   - totals of pieces and retail value by state for the filtered list;
   - 50 rows a page, sorted by brand then reference.
2. **Piece panel** (right-hand kit panel, as the till's client panel), showing:
   - the catalogue data (brand, collection, model, reference, colour, size, metal, stones, category) and its retail price;
   - its serial and barcode;
   - its state, since when, and the hold: client and until-date for reserved or booked out, plus the note;
   - its **history**: every event from `ops_piece_events`, with who, when, from → to, reason, note, and a link to the sale ticket where there is one;
   - any open review item;
   - its sales: the ticket line, which links to the till's ticket page.
3. **Adjust** (manage-stock right) through the existing rights-checked database functions:
   - from In stock: **Reserve** (client optional, until-date optional, note), **Book out** (note required: who has it and why; return date optional) or **Damaged** (note required);
   - from Reserved, Booked out or Damaged: **Back in stock** (note optional);
   - each change asks for confirmation;
   - the allowed moves are only those `ops_move_state` allows; sold, in transit and not received are never changed by hand.
4. **Review queue** tab: open items (missing from export, serial reused, ticket conflict, overdue in transit, dropped from incoming) with their piece. Each is resolved with one of the answers `ops_resolve_review` accepts, with a note.
5. **Export:** the filtered list (all pages) as a real `.xlsx`, with the same columns as the list plus barcode and state-since. Numbers stay numbers. **No cost.**
6. **Rights and session:** a new right, **view stock**. Only Alex has it at first, together with the existing **manage stock** (Alex only). The Stock passcode session opens Stock only, the same way Sales does it.
7. **On the shared kit**, with:
   - the header and Tools switcher (Stock is added to the switcher for every tool);
   - EN/RU;
   - idle lock;
   - no browser translation;
   - the iPad sizes and the PC.

## Non-goals (later slices)

- Import of the Colibri stock file and the incoming list (W3.4, with the next stock upload).
- Codes model, own QR, labels on the Godex (W2).
- Cost, HS/ИКПУ, arrival documents, price edits (W4). **Cost is never selected by this tool.**
- Stock-take (scan to count).
- One login across tools (G4, W9.3); the Stock tool has its own passcode session like the till.
- Changing any state the S2 rules don't allow by hand (sold comes only from a ticket; in_transit → in_stock only from a catalogue load).

## Anti-goals

- A piece changed without an event row, or by someone without manage stock.
- The floor seeing cost or margin.
- Any colour, radius or shadow outside the kit (the kit check runs on the built page).
- A second copy of the kit or of the Excel writer.

## Constraints

- **Rights:** the database functions check manage stock themselves (`ops_has_right`). The edge function also checks it before calling them, and re-reads rights on every call.
- **The existing write functions are not changed:** `ops_set_state(piece, state, actor, note, client, until)` and `ops_resolve_review(review, resolution, actor, note)`.
- **Retail price:** the latest `cat_pieces.price_uzs` for the piece's variant and serial, the same lookup the till uses. Pieces without a price show "—" and count 0 in the value totals, with a count of how many have no price.
- **Client names** on reserved and booked-out pieces show only with the CRM view right; otherwise the client reference.
- **Self-contained page:** no outside request but `stock-api`. The kit is inlined by `build.py`, and the build is checked byte for byte by `qa/check-builds.py`.
- **Public repo:** invented data in tests and screenshots only.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A (chosen)** | New tool `stock/` (page + `stock-api` edge function + read functions `stk_*`), writes through the existing `ops_*` functions | Same pattern as the till; separate rights and session; the tool switcher links them |
| B | Add a Stock tab to the Sales tool | One less login, but the till is a shop-floor tool and stock management is back office; mixes two rights models in one page |
| C | Stock screens inside the Catalogue | The Catalogue is a client-facing showroom tool; adding state changes there blurs who owns what (guideline: state changes only in Stock) |

## Data (migration `stk_1`)

- `board_users.can_view_stock boolean default false`; set true for Alex. `can_manage_stock` exists already.
- `editor_sessions.can_use_stock boolean default false`.
- `ops_has_right` learns `'view_stock'`.
- Read functions (security definer, revoked from public/anon/authenticated):
  - `stk_piece_list(p jsonb) → {count, page, rows, totals: [{state, pieces, value, unpriced}]}`. Filters `q`, `states[]`, `brand`, `category`, `price_min`, `price_max`, `page`; 50 a page.
  - `stk_piece_detail(p_piece uuid) → {piece, catalogue, price_uzs, events[], reviews[], sales[]}`.
  - `stk_review_list() → open review items with piece summary`.
  - `stk_facets() → brands and categories present` (for the filter lists).
  - `stk_export(p jsonb) → all rows for the filters` (cap 5 000).

## Screens (look from the guideline and the till)

- **Header:** wordmark, "Stock", Tools, EN/RU, name, Lock. Tabs: **Pieces** · **Review** (with the count of open items).
- **Pieces:**
  - a filter row: search, state, brand, category, price from/to;
  - a totals strip: one card per state, with pieces and value; clicking a card filters by that state;
  - a kit table with the columns serial, brand, reference / model, size, state (tag), since, price;
  - row click → the piece panel;
  - "Download .xlsx" at the top right.
- **State tags (G1):**
  - In stock: navy fill;
  - Reserved and Booked out: navy outline;
  - In transit: card fill;
  - Damaged and Not received: alert outline;
  - Sold: done (mist border, slate).
- **Piece panel:**
  - the title is "Brand · Model" in Palatino;
  - the facts sit in a grid;
  - the state block holds the action buttons, each opening a small form inside the panel and then the kit confirm dialog;
  - below them come the history list (newest first), the review, and the sales.
- **Review:** a kit table of open items: kind, piece, raised on, and the answer buttons with a note field.

## Calls made for Alex (to review)

1. *Call:* a **separate tool and a separate right** (view stock), only Alex at first. The store manager can be given view rights later.
2. *Call:* **Book out and Damaged need a note**; Reserve and Back in stock don't.
3. *Call:* **client on a reservation is optional** and picked by reference. A name search needs CRM rights, and with only Alex using the tool, typing the client reference (DLD-…) from the CRM is enough for v1. If Alex wants a name search, it comes with one login.
4. *Call:* **the review queue lives in the Stock tool**, not in CRM or the Board.
5. *Call:* **export = .xlsx with no cost**, using the CRM's hand-written workbook writer moved into the kit (`ui/xlsx.js`) so every tool can share it. The CRM keeps its own copy until the CRM moves onto the kit.
6. *Call:* Stock is added to the Tools switcher for every tool, between Sales and Clients. It is a link only; rights are checked when the page opens.
7. *Call:* the page and API names are `stock/` and `stock-api`; the database functions are prefixed `stk_`.

## Left to the builder

Layout details the guideline already covers (spacing, empty states, errors), the exact Russian wording (calm, short), the paging control, and the order of facts in the panel.

## Going live (later, each with Alex's yes)

1. Apply migration `stk_1`.
2. Deploy `stock-api` (verify_jwt off, like `sales-api`).
3. Merge the PR (the page).
4. Alex opens Stock, checks the counts against the ones he sees in Colibri, and tries one Reserve → Back in stock on a piece.
