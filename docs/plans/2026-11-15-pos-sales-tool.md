# Sales tool (POS) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth Delardi tool, **Sales** (`/sales/`). On an iPad, a seller builds a sale from in-stock pieces, attaches a CRM client or marks it walk-in, takes split payments and posts it; any past ticket (Colibri's or ours) can be looked up. It runs in Training until Alex switches it to Live.

**Architecture:**
- **Database:** every rule lives in Postgres functions, prefixed `pos_`, in new migrations `20261115_pos_*.sql`, tested with rolled-back SQL on the local test DB.
- **`sales-api`:** a new edge function with the same shape as crm-api, and the only route to the data.
- **The page** is one self-contained file built from `sales/src/` by `build.py`.
- **The client panel talks to the existing `crm-api` directly with its own CRM session.** It inherits every CRM right, label and withheld field without copying them. `sales-api` only stores the chosen `client_id`.

**Tech Stack:** PostgreSQL 16 locally (Supabase PG 17 live), plpgsql; Deno/TypeScript edge function; plain JS/HTML/CSS page with no dependencies; Python `build.py`; Playwright (Chromium) QA against a mock API, as in `crm/src/qa/`.

**Spec:** `docs/specs/2026-11-15-pos-sales-tool-design.md` (approved by Alex, 15 Nov 2026). Section numbers below (§5.3 etc.) refer to it.

## Global Constraints

- **Repo is public.**
  - No keys, client data, real serials, real names or exports anywhere.
  - Fixtures are invented: clients `DLD-9xxx`/`PRS-9xxx` with invented names, serials `ZZ.00.xxxxx`, barcodes starting `200…`, rep labels as in `crm/src/qa/mock.js`.
- **Subagents never touch production.** Every production step is the controller's, in Task 9, each after Alex's explicit yes.
- **Shipped migrations are never edited.** New migrations are named `20261115_pos_<n>_<topic>.sql`.
- **Every new function:**
  - `security definer`;
  - `set search_path = public, pg_temp`;
  - `revoke execute … from public, anon, authenticated`.
- **Every new table:** RLS enabled, and `revoke all … from public, anon, authenticated` on the table and on any identity sequence.
- **SQL tests:**
  - files `db/tests/pos_t<n>_<topic>.sql`, wrapped in `begin; … rollback;`, ending with `select 'pos_t<n> ok' as result;`;
  - run on the local DB (`db/dev/local_db.sh start`, `db/dev/run_sql_tests.sh pos_`);
  - every task's gate is `run_sql_tests.sh pos_` + `s3_` + `s2_t1`.
- **Money:** whole so'm (`numeric(14,0)` / `bigint`).
  - Line net = `round(price × (1 − discount_pct/100))`, rounded half away from zero.
  - The ticket total is the sum of line nets.
  - Payments must equal the total exactly.
- **Dates:** `sold_at` is the Asia/Tashkent date of posting.
- **Seller names** leave `sales-api` only as `crm_sales_reps.label`. Colibri `source_name` values never reach the browser, and neither do the `seller` and `seller_raw` columns.
- **Cost and margin** fields (any invoice/landed/cost column) are never selected by `sales-api`.
- **Numbers and constants:**
  - real ticket numbers `D-000001`…, training `T-000001`… (6 digits, zero-padded);
  - cash notice threshold `170000000`; VAT rule `0`;
  - default list window: last 30 days; page size 50;
  - idle lock: 15 minutes on touch devices; session: 8 hours.
- **The page:**
  - English + Russian;
  - loads nothing except `sales-api` and `crm-api`;
  - brand marks are inlined as data URIs from `brand/`;
  - the same Delardi look as `crm/` and `catalogue/` (reuse their CSS variables and type);
  - iPad-first, usable on a PC and a phone.
- **Commits:** `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, with trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T7Uo2rwXkRSCU6pgcooH5o`. Add explicit paths only; `.superpowers/` is scratch.
- **Branch:** `pos-design` (cut from `main`, which now carries Sprint 3 and the polish).

## Review Focus

1. **Two posts for the same piece.** The second must fail cleanly with the piece named, and nothing of it may be saved. Pinned in Task 3: `pos_t3` "second sale of a sold piece".
2. **Payments off by one so'm, overpaid or underpaid.** The server must refuse; the page's disabled button is not the guard. Pinned in Task 3.
3. **Training never leaks into reality:**
   - a training post leaves the piece `in_stock`;
   - it writes no `crm_transactions` row and doesn't appear in `ops_ticket_monthly`;
   - a training suspended sale does not hold a piece against a Live sale.
   Pinned in Tasks 3 and 4.
4. **Search text with `%`, `_`, quotes or Cyrillic.** It must match literally and never error. Pinned in Task 3: `pos_t3` "search escapes".
5. **A barcode shared by a sold piece and an in-stock piece.** The search returns both; only the in-stock one can be added. Pinned in Task 3.

---

## File map

| Path | Responsibility | Task |
|---|---|---|
| `db/migrations/20261115_pos_1_foundation.sql` | rights, settings, barcode columns, ticket and payment columns, training source, drafts, number sequences, monthly view excludes training, `pos_set_mode` | 1 |
| `db/migrations/20261115_pos_2_feeds.sql` | `cat_load` + `ops_sync_pieces` (barcode, sold-by-us guard); go-live guards in `ops_load_tickets` and `crm_import_apply` | 2 |
| `db/migrations/20261115_pos_3_post.sql` | `pos_search_pieces`, `pos_post_sale`, `pos_receipt_text` | 3 |
| `db/migrations/20261115_pos_4_drafts_void.sql` | `pos_suspend`, `pos_cancel_draft`, `pos_void_ticket`, `pos_clear_training` | 4 |
| `db/migrations/20261115_pos_5_lookup.sql` | `pos_ticket_list`, `pos_ticket_detail` | 5 |
| `db/tests/pos_t1…t5_*.sql` | the SQL tests per task | 1–5 |
| `sales/src/api/index.ts` + `sales/src/api/README.md` | `sales-api` edge function (repo copy; deployed by the controller) | 6 |
| `sales/src/template.html`, `app.js`, `sale.js`, `pay.js`, `client.js`, `tickets.js`, `admin.js`, `crmshim.js`, `build.py`, `README.md` | the page | 7, 8 |
| `sales/index.html` | built page (output of `build.py`, committed like `crm/index.html`) | 7, 8 |
| `sales/src/qa/mock.js`, `sales/src/qa/test.js` | mock of `sales-api` + `crm-api`; Playwright checks | 7, 8 |
| `index.html` (landing) | fourth tile "Sales" | 8 |
| `README.md` (root) | the fourth page in the table | 8 |

---

### Task 1: Database foundation

**Files:**
- Create: `db/migrations/20261115_pos_1_foundation.sql`, `db/tests/pos_t1_foundation.sql`

**Interfaces:**
- **Produces, columns:**
  - `board_users`: `can_view_sales`, `can_post_sales`, `can_void_sales`, `can_manage_till` (all `boolean not null default false`);
  - `editor_sessions`: `can_use_sales boolean not null default false`;
  - `ops_pieces.barcode text`, `cat_pieces.barcode text`;
  - `ops_tickets`: `receipt_text text`, `walk_in boolean not null default false`, `void_reason text`, `voided_by text`, `voided_at timestamptz`;
  - `ops_ticket_payments.card_type text` (check `card_type in ('uzcard','humo','visa')` or null).
  - `ops_tickets.source` check becomes `('colibri','delardi','training')`.
- **Produces, tables:**
  - `pos_settings`: singleton, `id smallint primary key default 1 check (id = 1)`, with
    - `mode text not null default 'training' check (mode in ('training','live'))`,
    - `go_live_date date` (set the first time mode becomes `live`; never cleared),
    - `vat_pct numeric(5,2) not null default 0`,
    - `cash_notice_uzs bigint not null default 170000000`,
    - `shop_address text not null default ''` (Alex sets the real address at roll-out; not in the public repo),
    - `updated_at timestamptz`, `updated_by text`.
  - `pos_settings_log(id bigint identity pk, at timestamptz default now(), actor text not null, field text not null, old_value text, new_value text)`.
  - `pos_drafts`, suspended sales only:
    - `draft_id bigint identity pk`, `mode text not null check (mode in ('training','live'))`;
    - `client_id text references crm_clients`, `walk_in boolean not null default false`;
    - `seller text` (`crm_sales_reps.source_name`), `fiscal_ref text`;
    - `created_by text not null`, `created_at timestamptz default now()`, `updated_at timestamptz`.
  - `pos_draft_lines(draft_id bigint references pos_drafts on delete cascade, line_no int, piece_id uuid not null references ops_pieces, price_uzs bigint not null, discount_pct numeric(5,2) not null default 0, seller text, mode text not null, primary key (draft_id, line_no), unique (mode, piece_id))`. The unique index is the hold rule: one suspended sale per piece per mode.
- **Produces, sequences:** `pos_ticket_no_seq`, `pos_training_no_seq`.
- **Produces, view:** `ops_ticket_monthly` re-created with the same columns, filtered `where t.source <> 'training'`.
- **Produces, function:** `pos_set_mode(p_mode text, p_actor text) returns jsonb` (`{mode, go_live_date}`).
  - It sets the mode, logs one `pos_settings_log` row, and sets `go_live_date` to the Tashkent date when it first becomes `live`.
  - It raises `'mode must be training or live'` otherwise.
- **Data in the migration:**
  - insert the `pos_settings` row;
  - `update board_users set can_view_sales = true, can_post_sales = true, can_void_sales = true, can_manage_till = true where name = 'Alex';`.

- [ ] **Step 1: Write the failing test `db/tests/pos_t1_foundation.sql`.** It asserts:
  - the four rights exist and only `Alex` holds them;
  - `pos_settings` has exactly one row, `mode = 'training'`, `vat_pct = 0`, `cash_notice_uzs = 170000000`, `go_live_date is null`;
  - a second `pos_settings` insert fails;
  - `pos_set_mode('live','S3T tester')` returns `mode = live` and a `go_live_date` equal to today in Tashkent; then `pos_set_mode('training',…)` keeps the `go_live_date`; `pos_settings_log` has 2 rows;
  - `pos_set_mode('x',…)` raises;
  - inserting two `pos_draft_lines` with the same `(mode, piece_id)` fails;
  - the same piece in a `training` line and a `live` line succeeds;
  - an `ops_tickets` row with `source = 'training'` is accepted and does not appear in `ops_ticket_monthly`;
  - anon and authenticated have no privilege on any `pos_%` table or sequence, nor execute on `pos_set_mode`;
  - every `pos_%` table has RLS on.
- [ ] **Step 2: Run it.** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh pos_t1` → FAIL.
- [ ] **Step 3: Write the migration.** For the view, re-create `ops_ticket_monthly` from its current definition (`db/schema.sql`) and add only the training filter.
- [ ] **Step 4: Run** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh pos_ && db/dev/run_sql_tests.sh s3_ && db/dev/run_sql_tests.sh s2_t1` → all PASS. An existing s3 test that counts `ops_%` tables or view columns may need its expected value updated; say so in the report.
- [ ] **Step 5: Commit** — `POS 1: rights, settings, barcode and ticket columns, drafts, training source`.

### Task 2: Colibri feeds — barcode in, guards after go-live

**Files:**
- Create: `db/migrations/20261115_pos_2_feeds.sql`, `db/tests/pos_t2_feeds.sql`

**Interfaces:**
- **Consumes:** Task 1 columns and `pos_settings.go_live_date`.
- **Produces.** Each of the four functions below is re-created whole (`create or replace`, same signature), with only the stated change. Copy the current body from `db/schema.sql`, or from the latest migration that defines it (`ops_load_tickets` → `20261114_s3_5_loader_polish.sql`).
  - **`cat_load(p jsonb, p_source text)`:** the `pieces` recordset gains `barcode text`, written to `cat_pieces.barcode`.
  - **`ops_sync_pieces(p_run bigint)`:**
    - step 2 also sets `o.barcode = coalesce(p.barcode, o.barcode)` from the matching `cat_pieces` row, so a load without barcodes keeps them;
    - a new guard: a loaded serial whose brand and serial match a `sold` piece whose `sold_line_id` belongs to a `source = 'delardi'` ticket is **not** created as a new piece and does not re-open the sold one. Instead it raises (once, under the open-review guard) a `ticket_conflict` review on the sold piece, with note `format('serial %s is in the stock load but was sold on %s', serial, ticket_no)`;
    - the result gains `sold_by_us_in_load int`.
  - **`ops_load_tickets(p jsonb, p_actor text)`:** when `pos_settings.go_live_date` is not null, a payload ticket with `sold_at >= go_live_date` is skipped entirely (no insert or update) and its number goes into the new result key `refused_after_go_live` (jsonb array).
  - **`crm_import_apply(p_batch bigint, p_actor text)`:** when `go_live_date` is set, staged purchase rows dated `>= go_live_date` are not applied, and the result gains `refused_after_go_live` (count). Read the function first to find where purchase rows are inserted.
- **Existing result keys of all four keep their names and meaning.**

- [ ] **Step 1: Write the failing test `db/tests/pos_t2_feeds.sql`.**
  - **barcode in:** a `cat_load` payload with one piece carrying `barcode '2000000000017'` → `cat_pieces.barcode` and the synced `ops_pieces.barcode` hold it.
  - **barcode kept:** a second load of the same piece without `barcode` → `ops_pieces.barcode` unchanged.
  - **sold by us:**
    - make piece P `sold` with `sold_line_id` on a `delardi` ticket `D-000001` (insert the ticket and line directly);
    - load a stock payload containing P's serial;
    - then: no new `ops_pieces` row with that serial, P still `sold`, one open `ticket_conflict` review on P whose note contains `sold on D-000001`, and `sold_by_us_in_load = 1`.
  - **Colibri-sold not guarded:** the same with a `colibri` ticket behaves as today, i.e. the existing S2 behaviour. Assert whatever s2/s3 tests already pin; at minimum, no error.
  - **go-live tickets:**
    - set `go_live_date = '2030-06-01'` directly;
    - `ops_load_tickets` with tickets dated `2030-05-31` and `2030-06-01` → the first is loaded, and `refused_after_go_live = ["<second no>"]`;
    - with `go_live_date` null, both load.
  - **go-live CRM import:** stage one batch with purchase rows dated before and on `go_live_date`, in the shape `crm_import_apply` reads. Only the earlier row reaches `crm_transactions`, and `refused_after_go_live = 1`.
- [ ] **Step 2: Run** `run_sql_tests.sh pos_t2` → FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run the full gate** (pos_, s3_, s2_t1) → PASS.
- [ ] **Step 5: Commit** — `POS 2: barcode through the stock load; feeds refuse what our tool owns after go-live`.

### Task 3: Search and posting

**Files:**
- Create: `db/migrations/20261115_pos_3_post.sql`, `db/tests/pos_t3_post.sql`

**Interfaces:**
- **Consumes:** Task 1 tables, columns and sequences; existing `ops_apply_ticket_line(uuid, text)` and `crm_recompute_purchases(text[])`.
- **`pos_search_pieces(p_q text, p_mode text) returns jsonb`**, an array of at most 20 objects. Each has:
  - `piece_id`, `serial`, `barcode`, `brand`, `article`, `collection`, `model_name`, `colour`, `size`;
  - `metal_keys`, `stone_keys` (from `cat_models`), `price_uzs` (from `cat_pieces` by variant and serial);
  - `state` (`ops_pieces.state`), and `held` (`{draft_id}` when a `pos_draft_lines` row of the same mode holds it, else null);
  - `sellable` (`state = 'in_stock' and held is null`).

  **Matching:**
  1. the exact barcode returns all pieces with it;
  2. else an exact serial (case- and space-insensitive);
  3. else every whitespace-separated word must match (`ilike`, with `%` `_` `\` escaped) at least one of serial, article, brand, collection, model_name.

  Results are ordered sellable first, then brand, article, serial. An empty or blank `p_q` returns `[]`.
- **`pos_post_sale(p jsonb, p_actor text) returns jsonb`.**
  - **Input:** `{draft_id?, client_id?, walk_in, seller, fiscal_ref?, lines:[{piece_id, price_uzs, discount_pct, seller?}], payments:[{method:'cash'|'card'|'transfer', card_type?:'uzcard'|'humo'|'visa', amount}]}`.
    - `seller` and the line `seller` are `crm_sales_reps.label` values. Map them to `source_name` and refuse an unknown label.
    - The mode comes from `pos_settings` and is never taken from `p`.
  - **Refuses** with `raise exception`, nothing saved, and messages starting exactly as below:
    - `'no lines'`;
    - `'piece listed twice'`;
    - `'choose a client or walk-in'` when `client_id` is null and `walk_in` is false, or when both are given;
    - `'choose a seller'`;
    - `'piece %s is not in stock'` (serial) when the state is not `in_stock`;
    - `'piece %s is in suspended sale %s'` when another draft of the same mode holds it;
    - `'another sale is suspended'` when any draft of the same mode exists other than `draft_id`;
    - `'discount must be 0 to 100'`; `'price must be positive'`;
    - `'payments %s do not match total %s'`;
    - `'card payment needs a card type'`.

    Pieces are locked `for update` in `piece_id` order before checking.
  - **Writes:**
    - an `ops_tickets` row: `store_id 1`; `source` `'delardi'` (live) or `'training'`; `ticket_no` `'D-'||lpad(nextval('pos_ticket_no_seq'),6,'0')` or `'T-'||…pos_training_no_seq`; `sold_at` the Tashkent date; `seller`; `client_id`; `walk_in`; `entered_by = p_actor`; `fiscal_ref`; `status 'posted'`;
    - one `ops_ticket_lines` row per line:
      - `kind 'sale'`, `qty 1`, `line_no` from 1;
      - `article`, `colour`, `item_name` (model name), `size`, `model_id`, `variant_id`, `serial_raw`, `brand_raw` from the piece;
      - `price_list` = catalogue price, `price_current` = entered price, `discount_pct`, `discount_amt = price_current − net`, `net`;
      - `extra = {"seller": <source_name>}` when a line seller differs;
      - **`piece_id` only in live mode; null in training;**
    - payments: `cash`→`cash`; `card` with `uzcard`/`humo`→`method 'card'`; `card` with `visa`→`method 'visa'`; `transfer`→`transfer`. `card_type` is kept, and `raw` is the method label.
  - **Live only:**
    - `ops_apply_ticket_line` on each line;
    - for a client sale, one `crm_transactions` row per line: `client_id`, `sold_at`, `brand`, `category` (from `cat_models.category`), `item`, `qty 1`, `gross_uzs = price_current`, `discount_pct`, `net_uzs = net`, `advisor = line seller source_name`, `article`, `cat_model_id`, `cat_variant_id`, `ticket_line_id`; then `crm_recompute_purchases(array[client_id])`.
  - **Both modes:** set `receipt_text = pos_receipt_text(ticket_id)`, then delete the draft if `draft_id` was given.
  - **Returns** `{ticket_id, ticket_no, mode, total, cash_notice}`, where `cash_notice` is true when cash payments exceed `pos_settings.cash_notice_uzs`.
- **`pos_receipt_text(p_ticket uuid) returns text`**, plain text, one item per line, in this order:
  1. `DELARDI`
  2. the shop address
  3. `Ticket <no>` and `<dd.mm.yyyy HH:MI>` (Tashkent)
  4. `Seller: <label>`
  5. `Client: <crm_queue.display_name>` or `Client: Walk-in`
  6. per line: `<brand> <model_name> · <serial>`, then `<price> −<disc>% = <net>`
  7. `Total <total>`
  8. per payment: `<Cash|Uzcard|Humo|Visa|Transfer> <amount>`
  9. for training, a first line `TRAINING — NOT A SALE`.

  Amounts are grouped with spaces (`31 500 000`).

- [ ] **Step 1: Write the failing test `db/tests/pos_t3_post.sql`.** Fixtures:
  - three `in_stock` pieces `ZZ.00.30001/2/3` with `cat_models`/`cat_variants`/`cat_pieces` rows, prices `31500000`, `20000000`, `9990000`, and two of them sharing barcode `2000000000024`;
  - one `sold` piece `ZZ.00.30009`, also with barcode `2000000000024`;
  - a client `DLD-9001` (insert into `crm_clients` with the minimum required columns);
  - a rep with label `S3T Rep` / source_name `S3T Source`.

  Assertions:
  - **search by barcode:** `2000000000024` → 3 results, the sold one with `sellable false`.
  - **search escapes:** `p_q = '%'`, `'_'`, `''''` and `'ЗЗ'` → no error; `'%'` returns `[]` (no serial contains a literal `%`).
  - **search words:** `'zz.00.3000 S3T'` matches by serial prefix and brand words.
  - **training post:**
    - mode is training; post `ZZ.00.30001` at 31500000 with 5% for `DLD-9001`, seller `S3T Rep`, paid card/uzcard 29925000;
    - the ticket is `T-000001`, source `training`, line net `29925000`, `piece_id` null;
    - the piece is still `in_stock`; no `crm_transactions` row with that `ticket_line_id`; `ops_ticket_monthly` total unchanged.
  - **live post:**
    - after `pos_set_mode('live')`, post `ZZ.00.30001` (the same piece, still in stock) with cash 20000000 + card visa 9925000, walk-in;
    - the ticket is `D-000001`, `source 'delardi'`; the piece is `sold` with `sold_line_id` set; one `ops_piece_events` row; payment methods `cash` and `visa` with `card_type 'visa'`.
  - **live client post:** `ZZ.00.30002` for `DLD-9001` → one `crm_transactions` row linked to the line, and `crm_clients.lifetime_spend_uzs` includes it.
  - **second sale of a sold piece:** posting `ZZ.00.30001` again raises `piece ZZ.00.30001 is not in stock`, and no new ticket row exists.
  - **payments mismatch:** 1 so'm short, 1 so'm over and empty payments each raise `payments … do not match total …`.
  - **client rule:** neither client nor walk-in, and both, each raise.
  - **seller rule:** no seller, and an unknown label, each raise.
  - **rounding:** price `9990000` at `7.5%` → net `9240750`; a price giving a .5 rounds away from zero.
  - **receipt:** `receipt_text` contains `DELARDI`, `D-000001`, `Walk-in`, `29 925 000` (for the training one), and `TRAINING` only on the training ticket.
  - **cash notice:** a live post with cash `170000001` returns `cash_notice true`; exactly `170000000` returns false.
  - **hold:** a `pos_draft_lines` row (mode live) holding `ZZ.00.30003` makes posting it raise `in suspended sale`. The same hold in training mode does not block a live post.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run the full gate** → PASS.
- [ ] **Step 5: Commit** — `POS 3: piece search, posting in one step, receipt text`.

### Task 4: Suspend, cancel, void, clear training

**Files:**
- Create: `db/migrations/20261115_pos_4_drafts_void.sql`, `db/tests/pos_t4_drafts_void.sql`

**Interfaces:**
- **Consumes:** Tasks 1 and 3.
- **`pos_suspend(p jsonb, p_actor text) returns jsonb`** (`{draft_id}`).
  - `p` has the same shape as `pos_post_sale` without payments, plus optional `draft_id`. If `draft_id` is given, that draft's lines are replaced.
  - Lines may be empty-priced but not empty.
  - It refuses a piece that is not `in_stock`, or held by another draft of the same mode, with the same messages as Task 3.
  - The mode comes from settings.
- **`pos_drafts_list(p_mode text) returns jsonb`:** `[{draft_id, created_by, created_at, client_id, walk_in, seller, lines:[{piece_id, serial, brand, model_name, price_uzs, discount_pct, seller}]}]`, newest first.
- **`pos_cancel_draft(p_draft bigint, p_actor text) returns void`:** deletes the draft (its lines cascade) and writes one `pos_settings_log` row (`field 'draft_cancelled'`, `new_value` the draft id).
- **`pos_void_ticket(p_ticket uuid, p_reason text, p_actor text) returns jsonb`.**
  - Refuses with:
    - `'only sales from this tool can be voided'` for source `colibri`;
    - `'already void'`;
    - `'give a reason'` for a blank reason.
  - Sets `status 'void'`, `void_reason`, `voided_by`, `voided_at`.
  - For `delardi` tickets, for each line with a `piece_id` whose piece is `sold` with `sold_line_id` = that line:
    - set the piece to `in_stock`, clear `sold_line_id`;
    - insert an `ops_piece_events` row (`from 'sold'`, `to 'in_stock'`, reason `'void: '||p_reason`, `ref_kind 'ticket'`, `ref_id` ticket_no, actor);
    - then delete the `crm_transactions` rows whose `ticket_line_id` is in the ticket and recompute that client.
  - Training tickets only get the status change.
  - Returns `{ticket_no, pieces_returned}`.
- **`pos_clear_training(p_actor text) returns jsonb`:** deletes every `source 'training'` ticket (lines and payments cascade) and every training draft, logs one `pos_settings_log` row, and returns `{tickets, drafts}`.

- [ ] **Step 1: Write the failing test `db/tests/pos_t4_drafts_void.sql`.** It reuses the Task 3 fixture style.
  - **suspend:** suspend a live draft with `ZZ.00.30001` → `pos_drafts_list('live')` has it; posting another sale with `ZZ.00.30002` raises `another sale is suspended`; posting with `draft_id` = that draft succeeds and the draft is gone.
  - **hold:** while a draft holds `ZZ.00.30003`, suspending a second draft with it raises `in suspended sale`.
  - **cancel:** cancelling frees the piece (a new draft with it succeeds) and logs one row.
  - **void live:**
    - post live for `DLD-9001`, then void with reason `'S3T wrong piece'`;
    - status `void`; the piece is `in_stock` with `sold_line_id` null; the last `ops_piece_events.reason = 'void: S3T wrong piece'`;
    - no `crm_transactions` row for its lines; the client's `lifetime_spend_uzs` is back to its earlier value;
    - `ops_ticket_monthly` excludes it (status void counts zero; assert the net for the month is unchanged against before the post, since the existing view sums all tickets, check how it treats `void` and pin the observed rule in the test).
  - **void guards:** voiding a `colibri` ticket raises; voiding twice raises; a blank reason raises.
  - **void training:** status only, no piece change.
  - **clear:** after two training posts and one training draft, `pos_clear_training` returns `{tickets: 2, drafts: 1}` and no `training` ticket remains; live tickets are untouched.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write the migration.** If `ops_ticket_monthly` counts void tickets, add `and t.status = 'posted'` to the view. The view is re-created in this migration; Task 1's version is the base.
- [ ] **Step 4: Run the full gate** → PASS.
- [ ] **Step 5: Commit** — `POS 4: suspend, cancel, void, clear training`.

### Task 5: Ticket lookup

**Files:**
- Create: `db/migrations/20261115_pos_5_lookup.sql`, `db/tests/pos_t5_lookup.sql`

**Interfaces:**
- **`pos_ticket_list(p jsonb) returns jsonb`.**
  - **Input:** `{q?, from?, to?, seller?, source?: 'colibri'|'delardi', status?: 'posted'|'void', training?: boolean, page?: int}`.
    - The default window is the last 30 days (Tashkent) when neither `from` nor `to` is given.
    - `seller` is a `source_name`; the API maps labels.
    - `training true` lists only training tickets; otherwise training tickets are excluded.
  - **`q`** matches, with the same escaping as Task 3:
    - the ticket number exactly;
    - any line's serial, article or brand;
    - the client's `crm_queue.display_name`, or the ticket's `client_raw`.
  - **Returns** `{count, net_total, page, rows:[{ticket_id, ticket_no, source, sold_at, status, seller, client_id, client_name, walk_in, items, lines, net}]}`.
    - Rows are newest first, then `ticket_no` descending, 50 per page.
    - `items` is a short summary: the first line's `brand_raw` and `item_name`, plus `×n` when there is more than one line.
    - `net` counts refund lines negative.
    - `net_total` and `count` cover all filtered rows, not only the page.
    - `client_name` is `crm_queue.display_name`, falling back to `client_raw`.
- **`pos_ticket_detail(p_ticket uuid) returns jsonb`:**
  - `{ticket: {…all ops_tickets columns except seller_raw, card_no, source_file…}, lines:[…with piece_id, model_id, variant_id, extra->>'seller'…], payments:[…], client_name}`;
  - it returns null for an unknown id.
- **`pos_ticket_by_line(p_line uuid) returns uuid`** (for the client panel's purchase rows).

- [ ] **Step 1: Write the failing test `db/tests/pos_t5_lookup.sql`.**
  - Fixtures: two Colibri tickets (one with a refund line), one live and one training ticket from Task 3's functions, dated inside and outside 30 days by setting `sold_at` directly.
  - Assertions:
    - the default window excludes the old one;
    - `count` and `net_total` match by hand, with the refund negative;
    - `source 'delardi'` returns only `D-`;
    - `training true` returns only `T-`, and the default excludes `T-`;
    - search by serial, by article, by client display name, and by exact ticket number;
    - page 2 of a 51-row fixture (generate with `generate_series`) has 1 row;
    - `pos_ticket_detail` omits `seller_raw`;
    - `pos_ticket_by_line` round-trips.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run the full gate** → PASS.
- [ ] **Step 5: Commit** — `POS 5: ticket list and detail`.

### Task 6: `sales-api` edge function

**Files:**
- Create: `sales/src/api/index.ts`, `sales/src/api/README.md`

**Interfaces:**
- **Consumes:** all `pos_*` functions from Tasks 1–5, called over PostgREST RPC with the service key (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), the same helpers as `crm/src/api/index.ts` (`select`, `rpc`, `insert`, `HttpErr`, `str`, CORS, JSON).
- **Produces:** `POST { action, token?, … }` → JSON. CORS and errors work as in crm-api, with `401`/`403`/`400`/`409`.
  - A Postgres `raise exception` from a `pos_*` function becomes **409 `{error: <message>}`**, passed through verbatim (the messages are written for the screen).
  - **`health`**
  - **`unlock {passcode}`:**
    - the same rate limit and `auth_attempts` as crm-api;
    - the user needs at least one of `can_view_sales` / `can_post_sales`;
    - inserts `editor_sessions` with `can_use_sales true`, 8 hours;
    - returns `{token, name, expires_at, rights:{view, post, void, manage}}`.
  - **`ping`:** `{ok, name, rights, mode}`.
  - **`reference`:** `{mode, go_live_date, vat_pct, cash_notice_uzs, shop_address, sellers:[label,…active], rights}`.
  - **Requires post:**
    - `search {q}` → `pos_search_pieces(q, mode)`;
    - `post {sale}`; `suspend {sale}`; `drafts`; `cancel_draft {draft_id}`.
  - **Requires view:**
    - `tickets {filters}` (seller label in, label out);
    - `ticket {ticket_id}` (labels out for the ticket seller, line `extra.seller` and `entered_by` where it is a rep);
    - `ticket_by_line {line_id}`.
  - **`void {ticket_id, reason}`** requires void.
  - **`set_mode {mode}`, `clear_training`** require manage.
- **Session check, `requireSales(token, need)`:**
  - the token is in `editor_sessions`, not expired, and has `can_use_sales true`;
  - rights are re-read from `board_users` (`active`) on every call;
  - `need` ∈ `view|post|void|manage`;
  - failure is 401/403 with a plain sentence.
- **Labels:**
  - every seller or entered_by value going out passes `toLabel` (the same rule as crm-api: a rep's `source_name` → `label`; anyone else's login name is shown as is for `entered_by`; an unknown seller → `'Unassigned'`);
  - labels coming in map to `source_name`, and an unknown label is a 400.
- **Never selected:** any cost, invoice or landed-price column.

- [ ] **Step 1: Write `sales/src/api/README.md` first.** It lists every action with its required right, its input and its output shape, as above, plus the error contract.
- [ ] **Step 2: Implement `sales/src/api/index.ts`.**
- [ ] **Step 3: Verify:**
  - `npx -y -p typescript@5 tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck sales/src/api/index.ts` → only `Cannot find name 'Deno'` errors;
  - `grep -n "invoice\|landed\|cost" sales/src/api/index.ts` → nothing selected from such columns (comments are allowed; list each hit in the report);
  - `grep -n "seller_raw\|source_name" sales/src/api/index.ts` → used only inside label mapping, never returned.
- [ ] **Step 4: Commit** — `POS 6: sales-api edge function (repo copy)`.

### Task 7: The page — shell, sale screen, payment, receipt

**Files:**
- Create: `sales/src/template.html`, `sales/src/app.js`, `sales/src/sale.js`, `sales/src/pay.js`, `sales/src/build.py`, `sales/src/README.md`, `sales/src/qa/mock.js`, `sales/src/qa/test.js`, `sales/index.html` (built)

**Interfaces:**
- **Consumes:** the `sales-api` actions of Task 6, as documented in `sales/src/api/README.md`.
- **Produces, for Task 8:**
  - the global `S` state (`S.token`, `S.rights`, `S.mode`, `S.sale = {draft_id, client_id, client_name, walk_in, seller, lines:[…], payments:[…], fiscal_ref}`);
  - `api(action, body) → Promise<json>`;
  - `tr(text)` with the `RU` dictionary;
  - `el(tag, attrs, …children)`;
  - `toast(text)`; `go(route)`; and the routes `#/sale`, `#/pay`, `#/receipt/<ticket_id>`, `#/tickets`, `#/ticket/<ticket_id>`, `#/admin`;
  - `renderClientSlot(container)`, a stub that Task 8 replaces, showing "Client: Walk-in / Find client" buttons; the Walk-in button works in Task 7.
- **Behaviour (spec §5.1, §5.3):**
  - **Login screen:** passcode → `unlock`; the token is kept in `sessionStorage` (wrapped in try/catch).
  - **A "TRAINING" banner** is on every screen while `mode = 'training'`.
  - **Search box:**
    - suggestions after 2 characters, debounced 250 ms;
    - Enter with exactly one sellable result adds it;
    - several results list them to pick;
    - non-sellable rows are greyed out, with the state in words, or "in suspended sale #<draft_id>".
  - **Lines:**
    - brand · collection or model name;
    - a spec line of metal keys, size and stones, joined with `, `;
    - serial; an editable price; a discount %; net; a remove ✕;
    - "Same % for all lines" is a button that copies the typed % to every line;
    - an optional per-line seller via a small "seller" link.
  - **Seller select:** from `reference.sellers`, starting empty.
  - **Total:** the sum of nets, computed with the same rounding as the server.
  - **Payment screen:**
    - add-row buttons Cash / Card ▾ (Uzcard, Humo, Visa) / Transfer;
    - amount inputs accept grouped digits;
    - a Paid / Remaining line;
    - **Post** is enabled only when remaining is 0, a seller is set and a client or Walk-in is chosen;
    - the cash notice text is shown when cash exceeds `cash_notice_uzs`;
    - an optional Era receipt number field.
  - **Post:**
    - `post`; a 409 shows its message in a toast and stays on the screen;
    - success → `#/receipt/<id>`.
  - **Receipt screen:**
    - the logo (`__WORDMARK__`/`__MONO_NAVY__` as in crm), with `receipt_text` from `ticket` rendered in a styled block;
    - "New sale" clears `S.sale`.
  - **Idle lock:** 15 minutes on touch devices. It shows the passcode card over the page and keeps `S.sale`.
  - **Language toggle EN/RU** (all visible text through `tr`).
- **`build.py`:**
  - the same mechanism as `crm/src/build.py`: `template.html` + `app.js` with modules inserted before the `/* -------------------------------------------------------------------- init */` marker in this order: `sale.js`, `pay.js`, then (from Task 8) `crmshim.js`, `../../crm/src/addclient.js`, `client.js`, `tickets.js`, `admin.js`. Modules missing at the time of Task 7 are skipped with a printed note;
  - it writes `sales/index.html`.
- **QA:** `node sales/src/qa/test.js` serves the built page with `qa/mock.js` (an in-memory `sales-api`; invented pieces, reps and clients) and drives Chromium.

- [ ] **Step 1: Write the failing QA checks in `sales/src/qa/test.js`** (the page is not built yet). Names and assertions:
  - `login`: a wrong passcode shows an error; the right one shows the sale screen with the TRAINING banner.
  - `scan adds one`: typing barcode `2000000000031` (one sellable piece in the mock) + Enter adds one line with brand, spec and price `31 500 000`.
  - `barcode many`: barcode `2000000000024` lists 3 pieces, one greyed "Sold"; clicking a sellable one adds it.
  - `discount`: a 5% discount on 31 500 000 shows net `29 925 000`; "Same % for all lines" applies 5% to a second line.
  - `post guard`: with no seller → Post disabled; with a seller but no client or walk-in → disabled; with Walk-in and payments short by 1 → disabled; exact → enabled.
  - `split payment`: Cash 20 000 000 + Card Uzcard 9 925 000 → Remaining 0.
  - `cash notice`: Cash 170 000 001 shows the notice text, and Post is still enabled when balanced.
  - `post`: success shows the receipt with `T-000001` and `TRAINING`.
  - `409 shown`: the mock answers 409 `piece ZZ.00.30001 is not in stock` → a toast with that text; still on the payment screen.
  - `idle lock`: after a simulated 15-minute idle (the mock clock or an exported test hook), the passcode card shows; after unlock the lines are still there.
  - `russian`: switching to RU shows `Новая продажа` on the sale screen.
  - `ipad`: at a 1024×768 and 768×1024 viewport, no horizontal scroll, and tap targets ≥ 44 px for buttons.
- [ ] **Step 2: Run** `cd sales/src && python3 build.py; node qa/test.js` → FAIL (nothing to build, or checks failing).
- [ ] **Step 3: Implement** `template.html`, `app.js`, `sale.js`, `pay.js`, `build.py`, `qa/mock.js` and `README.md`. Reuse the crm/catalogue CSS variables and fonts for the Delardi look.
- [ ] **Step 4: Run** `python3 build.py && node qa/test.js` → all PASS. `grep -c "https\?://" ../index.html` shows only the API base URL(s).
- [ ] **Step 5: Commit** — `POS 7: sales page — sale screen, payment, receipt (QA against a mock)`.

### Task 8: The page — client panel, suspended sales, tickets, void, admin, landing tile

**Files:**
- Create: `sales/src/crmshim.js`, `sales/src/client.js`, `sales/src/tickets.js`, `sales/src/admin.js`
- Modify: `sales/src/build.py` (module list already set), `sales/src/qa/mock.js`, `sales/src/qa/test.js`, `sales/index.html` (rebuilt), `index.html` (landing), `README.md`

**Interfaces:**
- **Consumes:** Task 7's globals (`S`, `api`, `tr`, `RU`, `el`, `toast`, `go`, `renderClientSlot`), `sales-api` actions, and **`crm-api`** actions `unlock`, `ping`, `reference`, `clients {q}`, `client {id}`, `client_add {…}`. `crm/src/api/index.ts` is the contract.
- **CRM session:**
  - at login, the page also calls crm-api `unlock` with the same passcode;
  - on 403 or 401 it keeps `S.crm = null`, and the client panel offers only Walk-in, with the line "No CRM access — Walk-in only";
  - otherwise it keeps `S.crm = {token, can_edit}`.
- **`crmshim.js`** defines exactly the globals `crm/src/addclient.js` uses (`el`, `tr` and `RU` are already there from Task 7; `openCard`, `refreshBehind`, `canAdd`, `addOwnerOptions`, `pushOverlay`, `popOverlay`, `toast`, `who`, and any other free name it references). `crm/src/addclient.js` is included **unchanged**.
  - `openCard(id)` attaches the new client to `S.sale` and closes the form;
  - `canAdd()` returns `S.crm?.can_edit`;
  - the add-client request goes to crm-api with `S.crm.token`.
  - If `addclient.js` cannot run unchanged against a shim, stop and report `BLOCKED` with the exact blocking reference. Do not copy the file.
- **`client.js`** replaces `renderClientSlot`. It shows search (crm-api `clients {q}`, 300 ms debounce), a result list, and the panel.
  - **The panel shows** the display name, the CRM owner (`client_owner` label) read-only with a "View in CRM ↗" link to `/crm/#/client/<id>`, the purchase count and total (from the card's `rollup`), and the last purchase date.
  - **The purchase list** comes from the card's `transactions`. A row with `ticket_line_id` opens its ticket (`ticket_by_line` → `#/ticket/<id>`); others are not clickable.
  - Notes and important dates appear as the CRM card shows them.
  - **No ABC class, no lifecycle tag.**
  - Buttons: Use this client / Walk-in / + New (only when `canAdd()`).
- **Suspended sales:**
  - a toolbar "Suspended (n)" button lists `drafts`;
  - Resume loads the draft into `S.sale` (keeping `draft_id`);
  - Cancel asks for confirmation, then calls `cancel_draft`;
  - Suspend on the sale screen calls `suspend` and clears the screen;
  - when Post returns `another sale is suspended`, a pop-up offers Resume or Cancel for that draft.
- **`tickets.js` (spec §5.5):**
  - the list with search, a date range (default last 30 days), seller, source and status filters, and the count and total line;
  - rows and a detail view; Colibri tickets are read-only; refund lines show negative;
  - a "Receipt" button (ours only);
  - **Void** for `delardi`/`training` posted tickets when `rights.void`, with a reason textarea (required), a confirm, then `void`, and a reminder line: "Cancel the fiscal receipt in Era as well.";
  - training tickets are listed only when `mode = 'training'`, under the banner.
- **`admin.js` (`#/admin`, visible only with `rights.manage`):**
  - a Training/Live switch with a confirm dialog that states what Live means;
  - the go-live date;
  - a "Clear test sales" button (confirm), showing `{tickets, drafts}` cleared.
- **Landing `index.html`:** a fourth tile "Sales" / "Продажи" linking to `/sales/`, built the same way as the existing three tiles (it reads unlock state from the browser only and shows no data).
- **Root `README.md`:** a `/sales/` row in the pages table.

- [ ] **Step 1: Extend `sales/src/qa/test.js` with failing checks:**
  - `client search and use`: searching "Соколова" (a mock CRM client) → panel with the owner label; no "ABC" and no "Champion" anywhere; Use → the sale shows the client.
  - `purchase opens ticket`: a purchase row with `ticket_line_id` opens `#/ticket/…`; a row without it is not a link.
  - `add client`: + New opens the CRM add-client form; submitting attaches the new `PRS-` client to the sale.
  - `no crm access`: a passcode with sales rights but CRM 403 → only Walk-in offered, with the line shown.
  - `suspend and block`: Suspend → "Suspended (1)"; build a new sale and Post → the pop-up appears; Resume restores the lines.
  - `tickets list`: the default shows the last-30-day mock tickets with count and total; filter source "ours" shows only `D-`/`T-`; search by serial finds the Colibri ticket; a refund line shows negative.
  - `void`: void without a reason is blocked; with a reason → status VOIDED and the Era reminder shown.
  - `admin`: hidden without `manage`; switching to Live asks to confirm and removes the TRAINING banner.
  - `landing tile`: the root `index.html` has a link to `/sales/`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `python3 build.py && node qa/test.js` → all PASS (Task 7's checks too).
- [ ] **Step 5: Commit** — `POS 8: client panel via crm-api, suspended sales, tickets and void, admin, landing tile`.

### Task 9: Roll-out (controller only — each step needs Alex's yes)

- [ ] **Step 1: Final whole-branch review**, then the fix wave.
- [ ] **Step 2 (yes):** apply `pos_1` … `pos_5` in order. After each:
  - check that live function md5s equal the local ones;
  - check anon and authenticated have no access;
  - run the security advisor;
  - after `pos_2`, run a rolled-back reload of the real ticket history (as in S3 polish) to show `refused_after_go_live = []` and `tickets_same = 606`.
- [ ] **Step 3 (yes):** set `pos_settings.shop_address` to the address Alex gives. Then deploy `sales-api` (`verify_jwt false`, like crm-api). Check `unlock` with a wrong passcode → 401, and `ping` without a token → 401.
- [ ] **Step 4 (yes):**
  - a smoke test on production in Training: Alex logs in, builds and posts one training sale, and opens it in the ticket list;
  - check the piece is still `in_stock`, no `crm_transactions` row was written, and `ops_ticket_monthly` is unchanged;
  - then `clear_training`.
- [ ] **Step 5:**
  - Alex runs the schema-only dump; commit `db/schema.sql` and set `db/schema.version` to `20261115_pos_5_lookup.sql`;
  - scan the branch for real data, push and open the PR;
  - merging it publishes `/sales/` on GitHub Pages, which is Alex's merge.
  - Update the roadmap and write the build report in the project.
- [ ] **Step 6 (later, with the next stock upload):** include `barcode` (`Штрих Код`) in the `cat_load` payload Claude prepares.
