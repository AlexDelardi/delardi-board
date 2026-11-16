# Stock enrichment — design (17 Nov 2026)

**Status:** draft for Alex's approval. Nothing built.
**Asked for (Alex, 17 Nov):** carry every Colibri data point per piece until Colibri is phased out; enrich pieces with arrival, supplier, barcodes and costing; a new upload format (Colibri template + our columns, incl. HS code); a Training mode in Stock to try reserves and transfers.

## Why
Stock v1 knows a piece's serial, reference, state and shelf price. Everything else Colibri holds (names, composition, invoice price, coefficients, barcode, receipt names) lives only in Colibri, and cost lives only in 1C files. Colibri cannot be switched off until our tools hold all of it.

## Goals
1. Every column of the Colibri item format is stored per piece and shown, marked as Colibri data.
2. Each piece shows where it came from: supplier, contract, invoice, arrival date.
3. Each piece shows its money: invoice price, RRP, sale price, shelf price, landed cost, estimated margin — to people with the cost right only.
4. A piece can carry several codes (Colibri barcode, Era barcode, brand barcode, later our QR).
5. One upload file format for new arrivals that Colibri still accepts.
6. A Training mode where reserves, book-outs and transfers can be tried without touching real stock.
7. Unknown values show **TBD**, never blank and never guessed silently.

## Non-goals
- Printing labels and our own QR (W2).
- Editing prices in the tool (W4.3).
- Producing files for 1C / Era (W4.4).
- Real transfers before a second store exists (the mechanism is built; only Training can use it).

## Anti-goals
- Cost or margin visible to anyone without the cost right, in any screen, export or API answer.
- A cost shown as exact when it was matched by guesswork.
- Training actions changing a real piece.

## What the files showed (facts the design rests on)
- **Two Colibri formats exist.** The *upload* file (37 columns, A–AK) and the *after-loading export* of the same receipt (35 columns). The export adds barcode, shelf price in so'm (ЦП, Тек. цена), VAT, "send to till" and unit; it lacks the website columns (stones, description, site path).
- **Barcodes are created by Colibri at loading**, one per reference + colour + size, not per piece. Upload files carry none. Whether Era uses the same codes is unknown (accountant to confirm).
- **VAT is not handled in Colibri** (0 on every piece). 1C books VAT on sales at 12% of net revenue; shelf prices appear VAT-inclusive (to confirm on a fiscal receipt).
- **1C batch cost files** ("Расчет себестоимости партии") give supplier, contract, and per line: name, invoice price (currency and so'm) and its share of customs VAT, clearance, assay and customs fee. Lines have **no serial or reference**.

## Approaches considered
1. **Widen `ops_pieces` with ~60 columns.** Simple to query; mixes our own truth with Colibri's copy, and every Colibri quirk becomes our schema. Rejected.
2. **Keep Colibri's data as one record per piece, beside our own tables** *(chosen)*. Our tables hold what we own (receipts, costs, codes); a separate "as Colibri has it" record holds the Colibri columns verbatim. At phase-out that record is frozen, not migrated.
3. **Store only the files and read them on demand.** No schema work, but nothing is searchable or exportable. Rejected.

## Design

### Data
| Table | One row per | Holds |
|---|---|---|
| `ops_piece_colibri` | piece | every Colibri column, verbatim, both formats merged; which file and when; never edited by hand |
| `ops_piece_codes` | code on a piece | code, type (colibri / era / brand / delardi), active or retired, dates |
| `ops_receipts` | arrival document | supplier, contract, supplier invoice no. and date, currency, arrival date, customs declaration, source file |
| `ops_piece_costs` | piece | invoice price and currency, FX, invoice value in so'm, each landed-cost part, landed cost; **match quality**: exact / estimated / TBD; source file |
| `cat_models` (+ columns) | model | HS code, ИКПУ |
| `ops_pieces` (+ columns) | piece | `receipt_id`, `is_training` |

- Prices: RRP (USD), sale price (USD) and shelf price (so'm) are kept with the piece's Colibri record now; dated price history comes with W4.
- Estimated margin = shelf price without VAT − landed cost. VAT rate is a setting (12%). Shown as "estimated" whenever cost is not exact.
- New right **view cost** (`can_view_cost`), Alex only. Cost tables are read by separate functions; the existing stock functions keep returning no cost.

### Stock tool
- **Piece panel** gains tabs: *Overview* (today's panel) · *Colibri format* (all Colibri columns, in Colibri's order and Russian headings, read-only) · *Origin & cost* (receipt, codes; the money block only with the cost right).
- **List:** optional columns Arrival, Supplier, Barcode; with the cost right also Landed cost and Margin. Filters: supplier, arrival period, "cost TBD".
- **Export:** a second sheet "Colibri format" with the 37 upload columns in order; cost columns only with the cost right.

### Backfill (one-off, from files)
1. Colibri after-loading exports and upload files → `ops_piece_colibri`, codes.
2. 1C batch cost files → `ops_receipts`, `ops_piece_costs`. Matching a cost line to a piece: same supplier and shipment, then invoice price, then name. One candidate = exact; several identical candidates = exact for the group; otherwise estimated from the shipment's average uplift, or TBD.
3. Arrival date from the Colibri user-actions log (Alex's rule); otherwise TBD.
4. A coverage report per brand: how many pieces have each block filled, what is TBD and which file would fill it.

### Upload format v1 (new arrivals)
- Columns **A–AK exactly as the Colibri template** (order, headings, meaning), so the same file loads into Colibri.
- Our columns from **AL**: HS code · ИКПУ · Supplier · Contract · Supplier invoice no. · Invoice date · Invoice currency · Arrival date · Customs declaration no. · Brand barcode · Category · Subcategory · Metal · Metal purity · Metal weight (g) · Stones (keys) · Certificate no. · Name (UZ) · Store.
- TBD is accepted in any of our columns. Missing HS codes are listed for the logistics team.
- Loading through the Stock tool with a preview of what will be created or changed (W3.4).

### Training mode
- A **Training** switch in Stock, like the till's. It shows a fixed set of made-up pieces in two made-up stores, marked `is_training`.
- Every action works for real on them: reserve, book out, damaged, back in stock, **transfer** (send from store A → "in transfer" → receive in store B), with history.
- Training pieces never appear in real lists, totals, exports, the till or the catalogue. A "Reset training data" button restores the set.

## Slices (each its own PR and go-live)
1. Data model, cost right, piece-panel tabs.
2. Backfill and coverage report.
3. Upload format v1 and import with preview.
4. Training mode and transfers.

## Open (not blocking slice 1)
- Era barcodes: the file the accountant loads them from.
- VAT on the fiscal receipt (Alex checks a receipt).
- Why customs VAT in the cost files is about 2% of invoice value.
- Which Colibri report gives the after-loading format for pieces already in stock.
