# One piece register and the Colibri review: design

Date: 27 Nov 2026. Status: for approval.

## Why

Colibri is being phased out, and both systems run side by side until it is gone. From Colibri we rely on two
things only: the website push and barcodes. Everything else lives in our tools, which keep being refined.

Two things are wrong today:

1. **Two piece lists.** The Catalogue has its own list of pieces (`cat_pieces`), rebuilt by every Colibri load
   and then copied into the Stock register (`ops_pieces`). Nothing flows back, so a piece reserved, booked out
   or sold in our tools still shows as on hand in the Catalogue until the next load. Keeping two lists in step
   is an extra step that should not exist.
2. **Colibri overwrites our data.** Each load rewrites article, design, colour, size and barcode on every piece
   we hold, and the retail price exists only on the Catalogue side, so it is replaced wholesale too.

## Goals

- One list of pieces. Stock, Catalogue, Sales and Performance all read it live; there is no sync between tools.
- One upload/amend tool (the Stock upload) is the place where pieces are added and changed.
- A Colibri load never changes a piece we hold on its own. Differences become a review list that a person
  settles line by line or in bulk, as with the client merge review in the CRM.

## Not in this work

- The website push (Colibri to the site) is untouched.
- Design-level catalogue data (names, collections, photos, attributes) keeps its current route: Colibri load
  plus our corrections on top. Only pieces, sizes and prices move.
- Sales tickets keep arriving from Colibri loads while sales are booked there.
- No change in Colibri itself.

## What would make this a failure

- A Colibri load silently changing price, size, colour or state of a piece we hold.
- The Catalogue showing a piece as available that Stock shows reserved, booked out, damaged or sold.
- Any price shown differently in Catalogue, Stock and Sales for the same piece.
- Staff having to enter the same change twice inside our tools.

## Approaches considered

- **A. Keep two lists, sync both ways.** Least code moved, but it keeps the extra step and every new field needs
  sync rules. Rejected: it is the duplication we want gone.
- **B. One register, Colibri wins on price.** One list, but a Colibri load still rewrites prices. Rejected: a
  Colibri upload changing our tool is what we are stopping.
- **C. One register, our tools own the data, Colibri differences go to review.** Chosen. One list, one upload
  tool, and Colibri becomes a source of proposals that a person accepts or rejects.

## Design

### 1. The register

`ops_pieces` is the only piece list. It gains the retail price (`price_uzs`) and keeps article, design, colour
variant, size, barcode and state. On switch-over each piece's price is copied once from the Catalogue list.

`cat_pieces` stops being read by any tool. Every function that reads it today (catalogue counts and filters,
search, sales search and posting, stock list and cost, performance) reads `ops_pieces` instead. The table
stays only as the record of what the last Colibri load said, which the load compares against the register.

### 2. What the Catalogue shows

- "In stock" counts pieces in state `in_stock` only. Reserved, booked out and damaged pieces are not offered.
- Sizes and the price shown for a design come from those same pieces.
- "In transit" comes from pieces in state `in_transit`.
- Counts are recomputed whenever a piece is added or its state, size, design or price changes, so a reservation
  or sale shows in the Catalogue at once.

### 3. The upload/amend tool

The Stock upload keeps its file format and its preview-then-apply flow, and gains two abilities:

- **Create a piece.** A row whose brand and serial we do not hold creates the piece, in stock, when its design is
  already in the Catalogue and its colour is clear (the design has one colour, or the row's colour code or colour
  name picks one). Otherwise the row waits for the piece to arrive from Colibri, as it does today, and the preview
  says why: design not in the Catalogue yet, reference fits several designs, or colour not stated.
- **Set the price.** Decided 28 Nov 2026: we keep Colibri's logic and Colibri's rate for now. The file carries the
  selling price in dollars ("Цена продажи, долл"); the shelf price in UZS is that price times a fixed rate of
  **12 500**, the rate Colibri applies to every piece. The rate is one setting (`pos_settings.usd_shelf_rate`),
  not code. A blank price cell changes nothing. A piece that has left stock is not repriced.

A change of price on a piece is recorded in the piece's history (who, when, old and new), since Colibri keeps
no price history. How prices are calculated (rate, coefficients, landed cost) is a later stage: see the backlog.

### 4. What a Colibri load does

For a serial we do not hold: the piece is created from Colibri (the "initial load" case), as now.

For a serial we hold, the load changes nothing except one thing: it fills the barcode when ours is empty.
Every other difference becomes a review line:

| Difference | Review line offers |
|---|---|
| Price differs | Keep ours / Take Colibri's |
| Size differs | Keep ours / Take Colibri's |
| Article, design or colour differs | Keep ours / Take Colibri's |
| Barcode differs (both filled) | Keep ours / Take Colibri's |
| We hold it on the floor, Colibri no longer lists it | The existing "missing from export" review, unchanged |

"Keep ours" is remembered: the same Colibri value for the same piece and field is not raised again. A new
Colibri value raises a new line.

### 5. The review screen

A "Colibri differences" tab in Stock, for logins with the manage right.

```
Colibri differences                                   42 open
[ Brand v ] [ Field v ]            [Keep ours: all shown] [Take Colibri: all shown]
--------------------------------------------------------------------------------
[ ] Brand   Serial   Field   Ours          Colibri        Load
[ ] ...     ...      Price   12 500 000    13 000 000     27 Nov
[ ] ...     ...      Size    52            53             27 Nov
                                              [Keep ours] [Take Colibri's]
```

- Decide one line, the ticked lines, or everything the filters show.
- Every decision is logged with the person's name; "Take Colibri's" changes the piece and writes to its history.
- The Stock home shows the number of open lines.

### 6. Rights

Viewing and deciding differences needs the manage-stock right. Price values follow the existing rule: retail
price is visible to anyone with the view right; nothing here exposes cost.

## Order of work and going live

1. Database: price on the register, readers moved off `cat_pieces`, live Catalogue counts. No visible change.
2. Colibri load stops rewriting; differences table and review screen.
3. Upload tool creates pieces and sets prices.

Each step is its own release with tests on the local database, and each production step waits for Alex's go.

## Calls made here (Claude's, open to correction)

- Reserved, booked-out and damaged pieces are not counted as available in the Catalogue.
- Barcode is filled from Colibri without review only when ours is empty.
- "Keep ours" silences that exact Colibri value for that piece and field.
- `cat_pieces` is kept as the record of the last Colibri load; no tool reads it.
