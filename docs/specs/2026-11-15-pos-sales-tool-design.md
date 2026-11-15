# Sales tool (POS) — design

**Date:** 15 November 2026 · **Status:** agreed part by part in chat with Alex on 15 Nov 2026; this document awaits his review.
**Roadmap:** replaces the "register screen" left open in Sprint 3 and brings forward the sale-posting half of Sprint 5 (`Delardi_Tech_Roadmap_v2.md`).
**Inputs:** Alex's voice brief (15 Nov) and the POS research synthesis he shared (LJPOS-RESEARCH-001, used as a frame of reference only, not as requirements).
**Builds on:** Sprint 2 (`ops_pieces`, `ops_piece_events`, `ops_tickets`, `ops_ticket_lines`, `ops_ticket_payments`, `ops_apply_ticket_line`) and Sprint 3 (606 Colibri tickets loaded, `ops_load_tickets`, `ops_link_crm_tickets`, `ops_ticket_monthly`).

## 1. Why

Colibri does four jobs in the store today: posting sales, printing barcodes, creating client cards and feeding the website. This tool takes over the first job, and it adds a place to look up any past sale, from Colibri's history and our own.

It is being built ahead of use. **Nobody posts real sales in it until Colibri is phased out.** Until then sales go through Colibri (and Era for the fiscal receipt), Colibri's exports keep loading monthly, and this tool runs in training mode.

**Success:**
- On an iPad, a seller can build a sale from in-stock pieces, attach a client or mark it walk-in, take one or more payments and post it, all in one go.
- The pieces go to Sold, the purchase lands on the client's CRM history, and an on-screen receipt is stored with the sale.
- Anyone with the right can find any ticket (Colibri's or ours) by number, date, seller, client, serial, article or brand, and open it.
- While in training, nothing touches real stock, the CRM or any report.

## 2. Goals, non-goals, anti-goals

**Goals:** the sale screen, client panel, payment and posting, the receipt, suspend/resume/cancel, void, ticket lookup, the Training/Live switch and four new rights.

**Non-goals (backlog, in Alex's words where given):**
- returns, refunds and exchanges (not allowed under Uzbek law; the tool has no return flow);
- reserve and marketing book-out from the sale screen (the states exist since Sprint 2), and their reversal;
- store credit and gift cards; a currency switch (payments are so'm only);
- a printed or emailed Delardi receipt, complementary to the Era fiscal one;
- scanning with the iPad camera;
- repairs and after-sales;
- till, cash handling, store opening and day close;
- approval limits for discounts and price changes (one person holds every right for now);
- generating our own unique barcodes (comes with label printing, roadmap Sprint 4).

**Anti-goals (would make this a failure even if it works):**
- a test sale, or a training session, changes real stock, the CRM or a report;
- a sale reaches the database half-posted, or one piece is sold twice;
- a Colibri upload and a sale in this tool count the same sale twice;
- the till screen shows anything the person could not see in the CRM tool (client data) or anything about cost or margin (decision D8);
- a fault in the sales tool takes down the CRM or the catalogue.

## 3. Constraints

- **Repo is public.** No keys, client data, real serials or exports in it; fixtures are invented.
- **Same pattern as the CRM and catalogue:**
  - one self-contained page built from `src/` by `build.py`, loading nothing from anywhere except its API;
  - one edge function that is the only route to the data, holds no client-visible key, and answers nothing without a session;
  - the database logic is in Postgres functions (security definer, pinned `search_path`, execute revoked from `public`, `anon` and `authenticated`), written as migrations with rolled-back SQL tests on the local test database (`db/dev/`).
- **Login:** the existing passcode and 8-hour session against `board_users`. Rights are re-read on every request.
- **Seller names** reach the browser only as the `crm_sales_reps` label; Colibri staff names never do (the crm-api v5 rule).
- **Client data** in the tool is exactly what the CRM tool shows the same person under the same rights. Phone numbers stay off-screen for as long as the CRM keeps them off.
- **Every production step needs Alex's yes;** subagents never touch production.
- **Device:** iPad first, also usable on a PC and a phone. English and Russian. A 15-minute idle lock on iPads and phones, as in the catalogue.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A — chosen** | A fourth tool, "Sales", with its own page (`/sales/`) and its own edge function (`sales-api`). The CRM's add-client code is reused as a shared module; the posting rules live in Postgres. | Selling-first iPad layout, its own rights, isolated from the CRM and the catalogue. Cost: a fourth page and session to maintain. |
| B | A tab inside the CRM tool | Client search and forms are already there, but the CRM page (~9,500 lines) and crm-api (~40 actions) are already the largest; till layout fights the list-and-card layout; selling would sit behind CRM access and every till change would risk the CRM. |
| C | A cart inside the catalogue | One tap from browsing, but the catalogue holds no client data by design; adding clients, payments and history would raise what every catalogue user can reach. |

Alex chose **A** on 15 Nov 2026.

## 5. What was decided

### 5.1 Sale screen

```
┌ New sale ────────────────── Seller: [Karina ▾] ┐
│ [ Scan or type: barcode / serial / article…  ] │
│  ↳ suggestions                                 │
├────────────────────────────────────────────────┤
│ Messika · Move Uno · ring, WG, size 52         │
│ serial E25642     price [ 31 500 000 ] −[5]%   │
│                                 = 29 925 000 ✕ │
├────────────────────────────────────────────────┤
│ Client: [Find or add client]   Total …         │
│ [Suspend]  [Cancel]                [Payment →] │
└────────────────────────────────────────────────┘
```
- **One line is one physical piece**, so there is no quantity field and a piece can't be sold twice.
- **Search** matches barcode, serial, article and model name, with suggestions as you type.
  - Only pieces whose state is `in_stock` can be added. Others show greyed out with their state (in transit, reserved, booked out, damaged, sold, not received). A piece held by a suspended sale shows "in suspended sale D-…".
  - **A barcode can match several pieces** (in the 12 Nov stock report, 25 barcodes sit on more than one row, 22 across different serials). The screen then lists the matches and asks which one.
- **Scanning:** a USB or Bluetooth scanner types into the search box like a keyboard. The box accepts a scan followed by Enter and adds the single match straight away.
- **Each line** shows brand, collection or model name, a short spec (metal, size, stones) and the catalogue price, which can be changed. A discount % applies per line, with a "same % for all lines" option. Line net = price × (1 − discount %), rounded to whole so'm.
- **VAT** is a stored rule, set to **0% added** for now: shelf prices include VAT, so the price shown is the price paid. The rule stays in place so the rate can change later without code. Colibri's own VAT field is unreliable (0, 12%, "12", 15% and 6% all occur) and is not used.
- **Seller** is chosen once per sale and starts empty. A single line can carry a different seller (Colibri has tickets with two sellers).
- **Barcodes in our database:** each piece gets a barcode field.
  - For now it holds Colibri's barcode, saved by the stock load (`Штрих Код`, 13 digits). Today's stock load does not save it.
  - Later we generate our own unique codes (Sprint 4, with labels). From then on, a scan finds exactly one piece.

### 5.2 Client panel

```
┌ Client ──────────────────────────────────────┐
│ [ Search name / client ref…        ] [+ New] │
│ Aziza K.                                     │
│ CRM owner: Karina (view in CRM ↗)            │
│ Purchases: 6 · 412 000 000 · last 14 Oct 26  │
│  14 Oct 26  Messika ring         38 500 000  │
│  … (all; ticketed lines open their ticket)   │
│ Notes / important dates (as in the CRM card) │
│                     [Use this client] [Walk-in]│
└──────────────────────────────────────────────┘
```
- **Search** works like the CRM client list: name or client reference.
- **"+ New"** is the CRM's existing add-client form (crm-api `client_add` → `crm_client_add`), with its duplicate check. The new client is attached to the sale straight away.
- **What the panel shows:** exactly what the CRM card shows this person, under the same rights. No ABC class and no lifecycle tag.
- **Purchase history** lists every CRM purchase for the client; lines linked to a ticket open it (see 5.8.3).
- **The CRM owner is shown read-only** with a link to the client in the CRM. Nothing in the sale changes the CRM owner.
- **Three different people per sale:**
  - **CRM owner**: the client's assigned associate, untouched by the sale;
  - **seller**: who gets the credit, chosen on the sale;
  - **entered by**: the logged-in person who posts, recorded automatically and never shown as the seller.
- **Client rule:** before posting, the seller must either attach a client or press **Walk-in**. A sale with neither cannot be posted.

### 5.3 Payment, posting, receipt

```
┌ Payment ─────────────────── Total 61 425 000 ┐
│ Cash                       [ 20 000 000 ]  ✕ │
│ Card · Uzcard              [ 41 425 000 ]  ✕ │
│ [+ Cash] [+ Card ▾ Uzcard/Humo/Visa] [+ Transfer] │
│ Paid 61 425 000 · Remaining 0            ✓   │
│ Era receipt no. (optional) [        ]         │
│                    [← Back]   [Post sale]     │
└──────────────────────────────────────────────┘
```
- **Methods:** cash, card (Uzcard, Humo, Visa) and bank transfer, in so'm only. A sale can be split across any number of rows. **Post** is enabled only when the amount paid equals the total exactly.
- **Cash notice:** when the cash on a sale is over **170,000,000 so'm**, a notice says it should go by card. It warns but never blocks.
- **Era receipt number:** an optional free-text field, stored on the ticket (`fiscal_ref`), for matching against Era later.
- **Posting is one all-or-nothing database step:**
  - the ticket gets the next number in our own series, **`D-000001`, `D-000002`, …** (source `delardi`), never colliding with Colibri's numbers;
  - every line's piece must still be `in_stock` and not held by another sale; otherwise nothing is saved and the screen says which piece;
  - every piece moves to Sold with its history event (through `ops_apply_ticket_line`);
  - for a client sale, one CRM purchase row per line is written and linked to its ticket line, and the client's purchase figures are recomputed;
  - two people can't sell the same piece at the same moment;
  - if anything fails, nothing is saved.
- **The receipt** opens on screen after posting. It shows:
  - the Delardi logo and the shop address (as Colibri's printed ticket does);
  - the ticket number, date and time, seller label, and client display name or "Walk-in";
  - each line (brand, model, serial, price, discount, net), the total and the payments.

  It follows the Delardi house design (`Delardi_Deck_Design_Guide.md` and the brand marks the other tools already use). It is stored as text with the ticket, so printing or emailing can be added later.
- **The whole tool** uses the same Delardi look as the CRM and the catalogue.

### 5.4 Suspend, cancel, void

- **Suspend** is a button on the sale screen. It saves the unposted sale (lines, prices, discounts, client, seller) to a **Suspended** list on the toolbar.
- **A suspended sale holds its pieces** against other sales. Their stock state does not change.
- **While a suspended sale exists,** a new sale can be built but not posted. A pop-up asks to resume or cancel the suspended one first. This is shop-wide (one boutique, one till).
- **Cancel** discards an unposted sale (open or suspended) and frees its pieces. One log line is kept, nothing else.
- **Void** applies to a posted sale from this tool:
  - it needs the Void right and a written reason;
  - the ticket stays visible, status `void`, and is never deleted;
  - each piece returns to In stock with the reason in its history;
  - the CRM purchase rows for its lines are removed and the client's figures recomputed;
  - the screen reminds the user to cancel the fiscal receipt in Era separately.
  - There is no time limit. Colibri tickets cannot be voided here.

### 5.5 Ticket lookup

```
┌ Sales ───────────────────────────────────────────────────┐
│ [ Ticket no. / client / serial / article…  ]  [Filters ▾]│
│ Date [01.11.26–15.11.26]  Seller [All▾]  Source [All▾]   │
│ 5 tickets · 362 695 500                                  │
│ D-000012  15 Nov  Karina   Aziza K.   Messika ring  38.5M│
│ 759       11 Nov  Karina   …          SW ×2         86.0M│
│ D-000009  09 Nov  Ellona   Walk-in    …     VOIDED       │
└──────────────────────────────────────────────────────────┘
```
- **One list for both sources:** Colibri history and our sales, newest first, last 30 days by default.
- **Search:** ticket number, client name, serial, article, brand.
- **Filters:** date range, seller, source (Colibri / ours) and status (posted / void). The list shows the count and the net total of what is filtered; refunds count as negative.
- **Opening a ticket** shows:
  - its lines (brand, model, serial, price, discount, net), with a link to the piece in the catalogue where the piece is known;
  - payments, the Era receipt number, the client (link to the CRM card), the seller label and who entered it;
  - the stored receipt (ours only);
  - **Void** for our posted sales, for those with the right.
  - Colibri tickets are read-only; refund lines show as negative.
- **Training tickets** appear only while the tool is in Training, under a "TRAINING" banner, and never in the real list.

### 5.6 Training / Live switch

- **One setting, "Sales posting: Training / Live".** Only the Manage-the-till right can change it. Every change is logged with who and when, and going Live records the go-live date.
- **Training (the state at launch):**
  - sales post as test tickets, stored apart from real ones;
  - they never change a piece's state, never write to the CRM and never appear in `ops_ticket_monthly` or any report;
  - suspended training sales do not hold real pieces against anything outside training;
  - the screen shows a "TRAINING" banner throughout;
  - the Manage right can clear all test tickets at any time.
  - Colibri stays the source of sales; `ops_load_tickets` keeps working unchanged.
- **Live:**
  - sales post for real;
  - from then on, `ops_load_tickets` **refuses Colibri tickets dated on or after the go-live date** and lists them in its result, so a late Colibri export can't count a sale twice.
  - Going back from Live to Training is allowed (it is logged), but real tickets already posted stay real.

### 5.7 Rights and access

- **Four new rights on `board_users`:**
  - **see sales**: ticket list and tickets;
  - **post sales**: build, suspend, cancel and post;
  - **void sales**;
  - **manage the till**: the Training/Live switch and clearing test tickets.
- **At launch:** Alex holds all four; nobody else holds any.
- **The client panel follows CRM rights:** CRM view to see a client, CRM edit for "+ New". Someone with post-sales but no CRM view can only post Walk-in sales.
- **Cost and margin** appear nowhere in the tool.
- The landing page gets a fourth tile, "Sales".

### 5.8 Points settled after the builder check (Claude's calls, 15 Nov — Alex to confirm on review)

1. **Live presupposes Colibri is gone.** Per Alex, Live is switched on only once Colibri is phased out. By then its stock and sales exports have stopped, and stock comes from our own item master (roadmap Sprint 4). Two guards hold anyway, in case a Colibri export is loaded after go-live:
   - the stock sync (`ops_sync_pieces`) never recreates or re-opens a piece whose serial was sold by a `D-` ticket; it raises a review instead;
   - the CRM purchase import (`crm_import_apply`) refuses Colibri purchase rows dated on or after the go-live date and lists them, the same rule as `ops_load_tickets`.
2. **Barcode storage:**
   - the barcode lives on the durable piece (`ops_pieces`), so it survives catalogue reloads;
   - `cat_load` accepts an optional `barcode` per piece, and `ops_sync_pieces` copies it onto the piece on every load;
   - the stock-load payload is built by Claude from the Colibri stock report outside the repo, and that step adds the `Штрих Код` column;
   - a load without barcodes leaves the stored ones in place.
3. **Purchase history in the client panel** lists every CRM purchase row for the client, exactly as the CRM card does, so it adds up to the headline figures. Rows linked to a ticket open it; the rest, older and unlinked, are shown but not clickable.
4. **Card type:**
   - payments keep the existing method values: `cash`, `card` for Uzcard and Humo, `visa` for Visa, `transfer` for bank transfer;
   - a `card_type` field records Uzcard, Humo or Visa;
   - `ops_ticket_monthly`'s card/visa columns stay as they are.

### 5.9 Checked against the Colibri internals review (15 Nov)

`Colibri_Internals_Static_Review_11Nov2026.md` agrees with this design: barcodes are EAN-13 and print as plain Windows labels; a serial is a reused field on the item row, not a tracked piece; stock is held per delivery. Alex decided the three points it raised:
- **Client loyalty discounts:** Colibri cards carry a personal %, a VIP %, accumulated spend and cashback. **No automatic loyalty discount.** The seller enters the discount by hand.
- **Payment types:** Colibri also offers Click, Payme, Unired, Kaspi and more. **Not added.** Cash, Uzcard, Humo, Visa and bank transfer only.
- **Correcting a posted sale:** Colibri can reopen a posted sale and change its client, seller or payments. **Not added.** The only fix is Void and re-post.
- **Added:** the shop address and the Delardi house design on the receipt.

## 6. Left to the builder

- Table and column names for: unposted (open and suspended) sales and their lines, the till settings and their change log, test tickets, the barcode field, the receipt text, the per-line seller, the card type on a payment, and the void reason and actor. Within that, the choice between extending existing tables and adding new ones.
- How test tickets are kept apart (separate tables, or a flag excluded everywhere). The anti-goals must hold either way.
- How the ticket number series is generated without gaps from failed posts mattering (a gap in `D-` numbers is acceptable; a duplicate is not).
- Whether "same % for all lines" is a button or a sale-level field.
- The exact text of the short spec line, built from what `cat_models` / `cat_variants` hold.
- Search ranking and the suggestion count.
- How the add-client module is shared between the CRM build and the sales build.
- Rounding: whole so'm per line; how the total and payments compare (exact equality on whole so'm).
- Page structure, routes and the QA mock in the style of `crm/src/qa/`.

## 7. Open points for later (not blocking this build)

- **Colibri barcode data.** Alex is still deciding between cleaning barcodes in Colibri and starting clean with our own (Sprint 4).
- **VAT:** the rate stays at 0% added until Alex confirms how prices and VAT relate.
- **Approval limits** (for example, discounts over 10% needing a manager) come with more users and the full rights matrix.
