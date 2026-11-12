# Sprint 3 — sales register (data): design

**Date:** 12 November 2026 · **Status:** design agreed in chat with Alex, 12 Nov 2026; this document awaits his review · **Roadmap:** `Delardi_Tech_Roadmap_v2.md`, Sprint 3
**Builds on:** Sprint 2 (`2026-11-11-s2-foundation-design.md`): `ops_tickets`, `ops_ticket_lines`, `ops_ticket_payments`, `ops_pieces`, `ops_apply_ticket_line`, `crm_transactions.ticket_line_id`.

## 1. Goal

Put every Colibri sale since January 2023 into the ticket tables, tie each CRM purchase line to its ticket line, and let new sales mark pieces Sold — without letting unreliable historical serials touch today's stock.

**Success means:**
- every ticket in the Colibri sales exports is in `ops_tickets` with its lines and recorded payments, and can be found by number or date;
- loading the same export again changes nothing; a changed ticket is updated and reported;
- CRM purchase lines from 2023 on carry their ticket line wherever one matches; nothing is forced;
- only sales newer than a piece's last stock sighting change that piece;
- monthly totals reconcile against the CRM and the KPI cheat-sheet, with every difference listed;
- "no owner" is stored one way in the CRM.

## 2. Decisions this design rests on

| # | Decision | Source |
|---|---|---|
| 1 | Data first; the register screen is its own sprint after this one | Alex, 12 Nov |
| 2 | Approach A: a parser in the repo plus one database function, run by Claude after each export (same pattern as the catalogue load) | Alex, 12 Nov |
| 3 | Payments: record only what Colibri recorded (card, VISA, with amounts). No row for the unrecorded remainder | Alex, 12 Nov |
| 4 | Historical serials are kept as text only and never create or change pieces | Alex, 12 Nov (after the 31 Dec 2024 stock report) |
| 5 | Owner clean-up: blank → `Unassigned` in both owner fields | Alex, 12 Nov |
| 6 | Subagents build and test; they never change the live database. Each live step is applied by Claude after Alex's yes | Alex, 12 Nov |

## 3. Facts checked (12 Nov)

**Sales exports** (`<Tenant>_Отчет по продажам_<from>-<to>.xlsx`, sheet `Дневной отчет 2`; header row starts with `№`):

| Column | Meaning | Notes |
|---|---|---|
| № | ticket number | 120–759; never reused across 2023–2026 |
| Дата | sale date | date only |
| Наимен, Код товара, Шт, Разм | item name, article (+ colour suffix), quantity, size | article has trailing spaces; quantity is 1 or −1 |
| Продавец | seller | 8 spellings |
| Без скидки, Текущая, Скидка (%), Скидка (amount), Со скидкой | list price, current price, discount %, discount amount, net | UZS |
| СК | discount-card letter (В, У, V, blank) | kept raw |
| Оплата | payment method | only on the payment row |
| VIP | VIP discount rate | kept raw |
| Примечание | `<client name>  Примечание: <note>` | client name is free text, no card number |
| Бренд, Код цвета, Серийный номер | brand, colour code, serial | brand spellings vary (`BULGARI`, `BVLGARI`, `dinh van`, `GP`) |

- A ticket is one or more item rows followed by **one payment row** (same №, no article): `Оплата` is blank, `кар`, `vis`, or `кар(<amount>)` / `vis(<amount>)` for a part payment. Card and VISA totals computed this way equal the file's own footer totals exactly.
- Files overlap and agree: 4 files → **606 tickets, 746 lines**, 5 Jan 2023 – 11 Nov 2026. Three lines are refunds (2023).
- Serial present on 421 lines (8 in 2023, 158 in 2024, all from 2025).
- **Serials on old sales are not reliable.** Colibri prints the serial the item card carries today. Evidence: 24 sale lines carry a serial that is in stock on 12 Nov 2026; 8 serials sold before 31 Dec 2024 were still in stock on that date; 9 serials appear on two sales.
- **CRM:** `crm_transactions` has 867 lines (2022: 154, no tickets exist for these). 2024 matches the export exactly (188 lines, same sum); other years differ by a few lines (clientless sales never reach the CRM; CRM stops at 2 Nov).
- `ops_ticket_payments.method` allows `cash, card, visa, qr, transfer, other` and is required.
- Rep spellings are mapped in `crm_rep_aliases(alias → source_name)`; reps are in `crm_sales_reps(source_name, label)`.
- Owner fields on `crm_clients`: `client_owner` (blank 341, `Unassigned` 32) and `assigned_owner` (blank ≈390, `Unassigned` 154).

## 4. Components

### 4.1 Parser — `tools/colibri_sales_parse.py`

Reads one or more sales exports and writes one JSON payload:

```json
{"source_files": ["…xlsx"], "tickets": [
  {"ticket_no": "900", "sold_at": "2026-11-01", "seller_raw": "Продавец", "client_raw": "Иванов  И.", "note": "оплата VISA",
   "lines": [{"line_no": 1, "kind": "sale", "article": "103575", "colour": "", "item_name": "…", "size": "", "qty": 1,
              "price_list": 67875000, "price_current": 67875000, "discount_pct": null, "discount_amt": null, "net": 67875000,
              "brand_raw": "Bulgari", "serial_raw": "AB1C2DE", "sk": "", "vip": null}],
   "payments": [{"method": "card", "amount": 67875000, "raw": "кар"}]}]}
```

Rules:
- Text is trimmed; empty strings become null. `ticket_no` is text.
- `line_no` is the item row's order within its ticket. `kind` is `refund` when quantity is negative, else `sale`; `qty` and money are stored as absolute values for refunds, with `kind` carrying the sign.
- Article and colour: `Код товара` is split on its last space only when the part after it equals `Код цвета`; otherwise the whole value is the article.
- Note: text before `Примечание:` → `client_raw`; text after → `note`.
- Payments: `кар` → `card`, `vis` → `visa`. A bare method gets the ticket's net total; `method(amount)` gets that amount. Blank → no payment row.
- When files overlap, the ticket from the file with the latest end date wins.
- Footer rows and rows without a numeric № are ignored.
- The parser prints a summary (tickets, lines, refunds, date range, net total, card and VISA totals) and checks card and VISA totals against each file's footer; a mismatch stops it.

### 4.2 Loader — `ops_load_tickets(p jsonb, p_actor text) returns jsonb`

New columns first (the Sprint 2 tables lack them): `ops_tickets.client_raw text` (client name as Colibri shows it); `ops_ticket_lines.brand_raw text`, `ops_ticket_lines.colour text`, `ops_ticket_lines.extra jsonb` (discount-card letter and VIP rate, kept raw).

A ticket's seller is the seller of its first line; a ticket whose lines name different sellers is listed in the result (`mixed_sellers`).

For each ticket in the payload (store 1, source `colibri`):
- **New ticket:** insert ticket, lines, payments.
- **Existing ticket, same content:** nothing.
- **Existing ticket, different content:** update the header, update lines in place by `line_no`, add new lines, replace payments. A line that has already sold a piece and now differs in serial, or has disappeared, is **not** undone: it raises a `ticket_conflict` review on that piece and the old line is kept.
- Seller: `seller_raw` as written; `seller` = the mapped `source_name` from `crm_rep_aliases` (case- and space-insensitive), or the raw value itself when it already is a rep's `source_name`, else null.
- Brand on a line is normalised for matching only (lower-case, and `bvlgari` → `bulgari`, `gp` → `girard-perregaux`); the raw value is not changed.
- Lines get `model_id` / `variant_id` through the existing `cat_match_article(article)` where it matches.
- `source_file` on the ticket = the file the ticket came from.

Returns `{tickets_new, tickets_changed, tickets_same, lines, payments, pieces_sold, sellers_unmapped: [...], mixed_sellers: [...], changed: [ticket numbers]}`. Function rules as in Sprint 2: security definer, pinned search path, no execute for public roles.

### 4.3 Pieces — inside the loader, after the lines are written

For each **sale** line with a serial, find the live piece (state not `sold` / `not_received`) with the same normalised brand and `upper(btrim(serial))`. Set `piece_id` and call `ops_apply_ticket_line` **only if** the ticket's `sold_at` is on or after the date (Asia/Tashkent) of the catalogue run in which the piece was last seen (`ops_pieces.last_seen_run` → `cat_import_runs.run_at`). In-transit pieces with no sighting are never matched.

All other lines keep `serial_raw` only; `piece_id` stays empty. Refund lines never change a piece in this sprint (the three that exist are from 2023).

Today this marks four pieces Sold (tickets 758 and 759, 11 Nov).

**Routine from now on:** sales export first, then the stock export. The stock sync already skips the "missing" flag for a piece that has a ticket line.

### 4.4 CRM link — `ops_link_crm_tickets(p_actor text) returns jsonb`

Pairs unlinked `crm_transactions` rows with unlinked ticket lines one to one on: same sale date, same article (trimmed, upper-case, with the colour suffix when the CRM article has one), same net amount (refund lines match negative CRM amounts). Several identical candidates are paired in order of `line_no` and CRM id. Sets `crm_transactions.ticket_line_id`.

A ticket gets `client_id` when every linked line of that ticket points to the same client; otherwise it stays empty and is listed.

Returns `{linked, tickets_with_client, tickets_mixed_clients: [...], crm_unlinked_2023plus, lines_unlinked}`. Re-running it only works on what is still unlinked.

### 4.5 Reconciliation — view `ops_ticket_monthly` and a report

View: per month — tickets, sale lines, refund lines, net (sales minus refunds), card, VISA, unrecorded (net minus recorded payments).

Report (`claude/S3_Sales_Register_Reconciliation.md` in the project): the view per month beside CRM net per month and the KPI cheat-sheet figures where they exist; every month that differs, with the lines that explain it (clientless sales, 2022, lines after 2 Nov).

### 4.6 Owner clean-up — migration `s3_owner_cleanup`

Saves `(client_id, client_owner, assigned_owner)` of every row it will change into `crm_owner_cleanup_20261112`, then sets blank or empty `client_owner` and `assigned_owner` to `Unassigned`. Deleted and merged records included, so the rule holds everywhere.

### 4.7 Repeated serials in stock

During the build: list serials that appear on more than one stock row in the 12 Nov report, by brand. Findings go in the build report. No rule changes in this sprint.

## 5. Production steps (each needs Alex's yes)

0. Backup (Alex).
1. Migration `s3_ticket_functions`: new columns (§4.2), loader, link function, view.
2. First load: `ops_load_tickets` with the four exports (606 tickets).
3. `ops_link_crm_tickets`.
4. Migration `s3_owner_cleanup`.

Then: schema snapshot refresh, pull request, build report, roadmap update, data map update.

## 6. Tests (rolled-back transactions; parser tests run locally)

| # | Test | Expected |
|---|---|---|
| T1 | Parser on the four real exports | 606 tickets, 746 lines, 3 refunds, 5 Jan 2023 – 11 Nov 2026; card and VISA totals equal each footer |
| T2 | Parser: split payment, blank payment, refund row, article with and without colour, note with and without `Примечание:` | as §4.1 |
| T3 | Load a payload twice | second run: all `tickets_same`, no row changes |
| T4 | Load, then load with one line's price and one ticket's seller changed | 1–2 `tickets_changed`; values updated; nothing duplicated |
| T5 | Sale dated after the piece's last sighting | piece Sold, one event, `piece_id` set |
| T6 | Sale dated before the last sighting, same serial in stock | piece untouched, `piece_id` empty, no review |
| T7 | Changed load removes the serial from a line that sold a piece | piece stays Sold; `ticket_conflict` review raised |
| T8 | Brand spelling `BVLGARI` / `dinh van` | matches pieces of `Bulgari` / `Dinh Van` |
| T9 | CRM link on real data | 2024: all 188 lines linked; nothing linked twice; 2022 untouched; re-run links 0 |
| T10 | Two identical lines on one date | paired one to one |
| T11 | Ticket whose lines point to two clients | no `client_id`; listed |
| T12 | Owner clean-up | no blank owner left; saved list has exactly the changed rows |
| T13 | Sprint 2 tests `s2_t1`–`s2_t5` | still pass |
| T14 | Health checks and security advisor | 200; no new warnings |

## 7. Out of scope

- Register screen (next sprint).
- Historical "sold piece" records.
- 2022 purchases (no tickets exist).
- Our own ticket numbers and the till (Sprint 5).
- An upload screen for exports.
