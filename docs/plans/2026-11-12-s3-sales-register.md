# Sprint 3 — Sales Register (data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (chosen by Alex) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load every Colibri sale since Jan 2023 into the ticket tables, link CRM purchase lines to ticket lines, let only fresh sales mark pieces Sold, and store "no owner" one way.

**Architecture:** A Python parser turns Colibri sales exports into one JSON payload. A Postgres function loads it idempotently into the Sprint 2 `ops_` ticket tables and applies fresh sales to pieces; a second function links CRM purchase lines. Bulk payloads reach production through the existing one-time-key import function (`crm-import`), small routine loads through SQL.

**Tech Stack:** Python 3 + openpyxl + pytest; PostgreSQL (plpgsql, local PG 16 for tests, production PG 17 on Supabase); Deno edge function (TypeScript).

**Spec:** `docs/specs/2026-11-12-s3-sales-register-design.md`

## Global Constraints

- **The repository is public.** Never commit real exports, payloads, client names, serials from real files, or keys. Test fixtures are synthetic. Real exports live in `/home/claude/s3data/` (outside the repo) and are read-only inputs.
- **Subagents never touch production.** No Supabase MCP tool, no `curl` to `supabase.co`. All database tests run on the local database from Task 1. Production steps (Task 7) are the controller's, each after Alex's yes.
- Migrations are plain SQL files `db/migrations/20261113_s3_*.sql`; functions are `security definer`, `set search_path = public, pg_temp`, and end with `revoke execute … from public, anon, authenticated`.
- New tables/columns: RLS stays on, no grants to `anon` / `authenticated`.
- SQL tests are self-contained: `begin; … rollback;`, create their own rows (prefix `S3T-`), end with `select '<name> ok' as result;`, and fail by `assert` / raised exception. They must not depend on existing data.
- Serial match: `upper(btrim(serial))`. Brand match: `ops_brand_key(text)` (Task 2).
- Commits: `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, message ending with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T7Uo2rwXkRSCU6pgcooH5o`. Branch `s3-sales-register`; no push (controller pushes).
- Money is UZS, stored as numeric; refund lines store positive `qty` and amounts with `kind = 'refund'`.

## Review Focus

1. **A historical sale whose serial is in stock today must not sell the piece** (Colibri prints the card's current serial on old sales) → Task 3 test "sale before last sighting".
2. **Reloading an overlapping or identical export must not duplicate tickets, lines or payments** → Task 3 tests "load twice", "changed ticket".
3. **A changed ticket must never un-sell a piece silently** → Task 3 test "serial removed from a selling line".
4. **Two identical purchase lines on one day (same article, same amount) must pair one to one, never both to the same ticket line** → Task 4 test "identical lines".
5. **Export quirks: trailing spaces in articles and serials, brand spelling variants, payment text like `кар(34320000)` / `vis(26077607.00)`, footer rows** → Task 2 parser tests, Task 3 test "brand spellings".

---

### Task 1: Local test database

**Files:**
- Create: `db/dev/local_db.sh`, `db/dev/run_sql_tests.sh`, `db/dev/README.md`

**Interfaces:**
- Produces: `db/dev/local_db.sh start` — (re)creates a throw-away PostgreSQL 16 cluster in `/tmp/delardi-pg` on port 5544 (socket dir `/tmp/delardi-pg`), run as OS user `pgdev` (create with `useradd -m pgdev` if missing; binaries in `/usr/lib/postgresql/16/bin`), superuser `postgres`, trust auth; creates roles `anon`, `authenticated`, `service_role`, `supabase_admin`; loads `db/schema.sql` with lines starting with `\` removed; then applies every `db/migrations/20261113_s3_*.sql` in name order with `ON_ERROR_STOP=1`. `stop` stops it. Prints `PSQL="psql -h /tmp/delardi-pg -p 5544 -U postgres"`.
- Produces: `db/dev/run_sql_tests.sh [pattern]` — runs each `db/tests/<pattern>*.sql` (default `s3_`) with `ON_ERROR_STOP=1`; prints `PASS <file>` when output contains ` ok`, else `FAIL <file>` plus the error; exit code 1 on any failure.

- [ ] **Step 1:** Write `local_db.sh`. Loading `schema.sql` reports three harmless errors (`transaction_timeout`, `schema "public" already exists`, `schema "extensions" does not exist`); the schema load therefore runs without `ON_ERROR_STOP`, and the script then asserts `select count(*) from pg_tables where schemaname='public'` ≥ 61 and `to_regprocedure('public.ops_apply_ticket_line(uuid,text)')` is not null, exiting 1 otherwise.
- [ ] **Step 2:** Run `db/dev/local_db.sh start`. Expected: ends with the `PSQL=` line, exit 0.
- [ ] **Step 3:** Write `run_sql_tests.sh`; write a throw-away `db/tests/s3_t0_smoke.sql` (`begin; select 's3_t0 ok' as result; rollback;`), run `db/dev/run_sql_tests.sh`. Expected: `PASS db/tests/s3_t0_smoke.sql`. Delete the smoke file.
- [ ] **Step 4:** `README.md`: what it is, the two commands, "never holds real data". Commit: `S3 task 1: local test database scripts`.

---

### Task 2: Sales export parser

**Files:**
- Create: `tools/colibri_sales_parse.py`, `tools/tests/test_colibri_sales_parse.py`

**Interfaces:**
- Produces: `parse_files(paths: list[str]) -> dict` returning the payload of spec §4.1, plus `"summary": {"tickets", "lines", "refunds", "first_date", "last_date", "net", "card", "visa"}`.
- Produces CLI: `python3 tools/colibri_sales_parse.py <file.xlsx>... -o payload.json` — prints the summary; exit 1 with a message when a file's card or VISA total differs from its footer.
- Payload line keys: `line_no, kind, article, colour, item_name, size, qty, price_list, price_current, discount_pct, discount_amt, net, brand_raw, serial_raw, sk, vip`. Ticket keys: `ticket_no (str), sold_at (YYYY-MM-DD), seller_raw, client_raw, note, source_file, lines, payments`. Payment keys: `method ('card'|'visa'), amount, raw`.

Sheet layout (sheet `Дневной отчет 2`): header row is the row whose first cell is `№`; columns in order `№, Дата, Наимен, Код товара, Шт, Разм, Продавец, Без скидки, Текущая, Скидка(%), Скидка(amount, header cell empty), Со скидкой, СК, Оплата, Карта, VIP, Нак, Примечание, Бренд, Код цвета, Серийный номер`. Item rows have `Код товара` or `Наимен`; the payment row has the same № and neither. The footer contains a row `['И', <n>, 'КАР', <card total>, 'VISA', <visa total>]` (cells may be repeated by merged ranges: read the number that follows the cell `КАР` and the one that follows `VISA`).

- [ ] **Step 1: Write failing tests** (fixtures built in the test with openpyxl into `tmp_path`, all values invented):
  - `test_ticket_with_two_lines_and_card_payment`: ticket 900, two item rows, payment row `кар` → 1 ticket, `line_no` 1 and 2, one payment `{"method":"card","amount": <sum of nets>,"raw":"кар"}`.
  - `test_split_payment_amount`: `vis(26077607.00)` on a 26 450 000 ticket → payment `visa`, amount `26077607.0`.
  - `test_blank_payment_gives_no_payment_row`.
  - `test_refund_row`: `Шт = -1`, net `-87500000` → `kind == "refund"`, `qty == 1`, `net == 87500000`.
  - `test_article_and_colour_split`: `'345512 WG '` with colour `WG` → article `345512`, colour `WG`; `'OR057#..4.3ORLU PG'` with colour `PG` → article `OR057#..4.3ORLU`; `'GC2.0-A-02 '` with colour `''` → article `GC2.0-A-02`, colour `None`; `'WR1013-B-WG-Inner, SBT WG'` with colour `WG` → article `WR1013-B-WG-Inner, SBT`.
  - `test_note_split`: `'Иванов  И.  Примечание: оплата VISA'` → `client_raw == 'Иванов  И.'`, `note == 'оплата VISA'`; `'   Примечание: тест'` → `client_raw is None`; `'Петров П.  '` → client `'Петров П.'`, note `None`.
  - `test_trailing_spaces_trimmed`: serial `'ZZ.00.12345 '` → `'ZZ.00.12345'`; empty strings → `None`.
  - `test_overlapping_files_latest_wins`: same ticket № in two files (file names ending `_01-Oct-26-09-Nov-26.xlsx` and `_01-Nov-26-12-Nov-26.xlsx`) with different net → the later end date's version; `source_file` is that file's base name.
  - `test_footer_mismatch_exits`: footer `КАР` total wrong → `SystemExit` from the CLI entry point.
  - `test_real_exports_summary` (skipped unless `/home/claude/s3data` has the four files): tickets 606, lines 746, refunds 3, first `2023-01-05`, last `2026-11-11`.
- [ ] **Step 2:** `python3 -m pytest tools/tests -q` → Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** File end date is parsed from the name suffix `_<DD-Mon-YY>-<DD-Mon-YY>.xlsx`. Numbers that are whole are emitted as ints.
- [ ] **Step 4:** `python3 -m pytest tools/tests -q` → Expected: all pass, real-export test included.
- [ ] **Step 5:** Commit: `S3 task 2: Colibri sales export parser`.

---

### Task 3: Ticket loader and piece rule

**Files:**
- Create: `db/migrations/20261113_s3_1_ticket_load.sql`, `db/tests/s3_t1_load.sql`

**Interfaces:**
- Consumes: payload of Task 2; Sprint 2 `ops_apply_ticket_line(p_line uuid, p_actor text)`, `ops_tickets (unique store_id, source, ticket_no)`, `ops_ticket_lines (unique ticket_id, line_no)`, `ops_ticket_payments`, `ops_pieces(last_seen_run)`, `cat_import_runs(id, run_at)`, `cat_match_article(text)` (returns a row with `model_id, variant_id`), `crm_rep_aliases(alias, source_name)`, `crm_sales_reps(source_name)`.
- Produces: columns `ops_tickets.client_raw text`; `ops_ticket_lines.brand_raw text`, `.colour text`, `.extra jsonb`.
- Produces: `ops_brand_key(p text) returns text` immutable — `lower(btrim(p))`, with `bvlgari → bulgari`, `gp → girard-perregaux`.
- Produces: `ops_load_tickets(p jsonb, p_actor text) returns jsonb` with keys `tickets_new, tickets_changed, tickets_same, lines, payments, pieces_sold, sellers_unmapped (array), mixed_sellers (array of ticket_no), changed (array of ticket_no)`.

Behaviour (spec §4.2–4.3):
- Store 1, source `colibri`. "Same content" = header (`sold_at, seller_raw, client_raw, note`), every line's payload fields, and payments (`method, amount`) all equal.
- Changed ticket: header updated; lines updated in place by `line_no`; new `line_no` inserted; payments replaced. A stored line with a `piece_id` whose `serial_raw` would change, or which is absent from the new payload, is left as it is and raises one open `ops_review` (`kind 'ticket_conflict'`) on that piece. A stored line without a piece that is absent from the payload is deleted.
- `seller` = alias match on `lower(btrim())` → `source_name`; else the raw value when it equals a `crm_sales_reps.source_name`; else null and the raw value is added to `sellers_unmapped` (distinct).
- `model_id, variant_id` from `cat_match_article(article)` when it returns a model.
- Piece rule, for each `sale` line with `serial_raw` and no `piece_id`: the piece with `ops_brand_key(brand) = ops_brand_key(brand_raw)`, same normalised serial, state not in (`sold`, `not_received`), `last_seen_run` not null, and `sold_at >= (run_at at time zone 'Asia/Tashkent')::date` of that run → set `piece_id`, `perform ops_apply_ticket_line(line_id, p_actor)`, count in `pieces_sold`. Otherwise leave `piece_id` null.
- Refund lines never set `piece_id`.

- [ ] **Step 1: Write `db/tests/s3_t1_load.sql`** — one `do $$ … $$` block building payloads with `jsonb_build_object`; fixtures: one `cat_import_runs` row with `run_at = now() - interval '5 days'`, one `ops_pieces` row brand `Bulgari` serial `S3T-SER-1` state `in_stock` `last_seen_run` = that run, one alias `S3T Продавец → S3T Rep` with its `crm_sales_reps` row. Cases, each with asserts:
  - **new load:** 2 tickets (`S3T-1` two sale lines + card payment; `S3T-2` one refund line, no payment) → `tickets_new = 2`, 3 lines, 1 payment; `seller = 'S3T Rep'`; unknown seller on `S3T-2` appears in `sellers_unmapped`; `client_raw`, `brand_raw`, `colour`, `extra->>'sk'` stored.
  - **load twice:** same payload → `tickets_same = 2`, `tickets_new = 0`, row counts unchanged, `updated_at` unchanged.
  - **changed ticket:** line 1 net and ticket seller changed, a third line added, payment changed to visa → `tickets_changed = 1`, `changed = ['S3T-1']`, values updated, 3 lines for the ticket, exactly 1 payment row (`visa`).
  - **sale after last sighting:** ticket `S3T-3`, `sold_at = current_date`, brand `BVLGARI`, serial `' s3t-ser-1 '` → piece `sold`, `sold_line_id` = the line, one `sold` event, `pieces_sold = 1` (also covers **brand spellings** and spaces).
  - **sale before last sighting:** second piece `S3T-SER-2`; ticket dated `current_date - 30` with that serial → piece still `in_stock`, line `piece_id` null, no `ops_review` row for the piece.
  - **in-transit piece with no sighting** (`last_seen_run` null) and a sale today → untouched.
  - **serial removed from a selling line:** reload `S3T-3` with the serial changed → piece stays `sold`, stored line keeps the old serial, one open `ticket_conflict` review; a further identical reload does not add a second review.
  - **mixed sellers:** ticket with two lines naming different sellers → ticket seller from line 1; ticket_no in `mixed_sellers`.
- [ ] **Step 2:** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh s3_t1` → Expected: `FAIL` with `function ops_load_tickets(jsonb, unknown) does not exist`.
- [ ] **Step 3: Write the migration** (columns, `ops_brand_key`, `ops_load_tickets`, revokes).
- [ ] **Step 4:** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh s3_t1` → Expected: `PASS db/tests/s3_t1_load.sql`.
- [ ] **Step 5:** Real-data dry run (local only): `python3 tools/colibri_sales_parse.py /home/claude/s3data/*.xlsx -o /tmp/s3_payload.json`, then in the local database inside `begin … rollback`: `select ops_load_tickets(pg_read_file('/tmp/s3_payload.json')::jsonb, 'test')` (file must be readable by `pgdev`). Expected: `tickets_new = 606`, `lines = 746`, `pieces_sold = 0` (the local database has no pieces); a second call in the same transaction: `tickets_same = 606`. Report the `sellers_unmapped` and `mixed_sellers` lists in the task report (names of staff are fine in the report, not in the repo).
- [ ] **Step 6:** Commit: `S3 task 3: ticket loader and piece rule`.

---

### Task 4: CRM link and monthly view

**Files:**
- Create: `db/migrations/20261113_s3_2_ticket_link.sql`, `db/tests/s3_t2_link.sql`

**Interfaces:**
- Consumes: `ops_load_tickets` (Task 3); `crm_transactions(id, client_id, sold_at, article, net_uzs, ticket_line_id)`; `crm_clients(client_id, …)`.
- Produces: `ops_link_crm_tickets(p_actor text) returns jsonb` with keys `linked, tickets_with_client, tickets_mixed_clients (array of ticket_no), crm_unlinked_2023plus, lines_unlinked`.
- Produces: view `ops_ticket_monthly(month date, tickets, sale_lines, refund_lines, net, card, visa, unrecorded)` — `net` = sale nets minus refund nets; `unrecorded = net - card - visa`; `security_invoker = true`, no grants to public roles.

Matching (spec §4.4): candidates are `crm_transactions` with `ticket_line_id is null` and `ops_ticket_lines` of `colibri` tickets not referenced by any `crm_transactions.ticket_line_id`; keys: `sold_at::date` equal; article equal after `upper(btrim())`, where the line's article is compared both alone and as `article || ' ' || colour`; amount: `net_uzs = net` for sale lines, `net_uzs = -net` for refund lines. Pair with `row_number()` over each key group (lines ordered by ticket_no, line_no; CRM rows by id) so each side is used once. Then set `ops_tickets.client_id` where all linked lines of a ticket share one client and `client_id` is null; tickets whose linked lines name several clients go to `tickets_mixed_clients`.

- [ ] **Step 1: Write `db/tests/s3_t2_link.sql`** with its own clients (`S3T-C1`, `S3T-C2`; look at `crm_clients` not-null columns in `db/schema.sql` and fill the minimum), CRM lines and tickets loaded through `ops_load_tickets`. Cases:
  - **simple link:** one CRM line ↔ one ticket line → `ticket_line_id` set, ticket `client_id = S3T-C1`.
  - **article with colour suffix:** CRM article `'345512 wg '`, line article `345512` colour `WG` → linked.
  - **refund:** CRM `net_uzs = -5000`, refund line net `5000` → linked.
  - **identical lines:** two CRM rows and two ticket lines with the same date, article and net → two distinct links.
  - **no match:** CRM line with a different amount → stays null and counts in `crm_unlinked_2023plus`; a CRM line dated 2022 without a match is not counted there.
  - **mixed clients:** one ticket, two lines linked to two clients → `client_id` null, ticket in `tickets_mixed_clients`.
  - **re-run:** second call → `linked = 0`, nothing changes.
  - **view:** for the fixture month: tickets, sale_lines, refund_lines, net, card, visa, unrecorded equal hand-computed values.
- [ ] **Step 2:** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh s3_t2` → Expected: FAIL, `function ops_link_crm_tickets(unknown) does not exist`.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4:** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh` → Expected: PASS for `s3_t1` and `s3_t2`.
- [ ] **Step 5:** Commit: `S3 task 4: CRM ticket link and monthly view`.

---

### Task 5: Ticket branch in the import function

**Files:**
- Modify: `crm/src/import-api/index.ts`
- Create: `crm/src/import-api/README.md`

**Interfaces:**
- Consumes: `ops_load_tickets(p jsonb, p_actor text)`; the file's existing key check (`crm_import_tokens`, single use, two hours) and `rpc()` helper.
- Produces: request body may carry `tickets: {...payload of Task 2...}`; when present, after the key is claimed the function calls `rpc("ops_load_tickets", { p: body.tickets, p_actor: "import:" + source })` and returns its result under `tickets` in the response, alongside the existing `chats` / `missed` results. Validation before the key is claimed: `tickets.tickets` is an array of at most 5 000 entries, else 400. Existing behaviour for `chats` and `missed` is unchanged; a body with none of the three is still rejected as today.

- [ ] **Step 1:** Read the whole file; note how `chats` and `missed` are validated, how the key is claimed, and the response shape.
- [ ] **Step 2:** Add the `tickets` branch following those patterns exactly; update the header comment (`POST { import_key, source, chats?, missed?, tickets? }`).
- [ ] **Step 3:** Verify: if `deno` is installed, `deno check crm/src/import-api/index.ts` → no errors; otherwise state in the report that it was not type-checked. `git diff --stat` shows only the two files.
- [ ] **Step 4:** `README.md`: the request shape for each of the three loads and that keys are created by the controller only. Commit: `S3 task 5: ticket load through the import function`.

---

### Task 6: Owner clean-up

**Files:**
- Create: `db/migrations/20261113_s3_3_owner_cleanup.sql`, `db/tests/s3_t3_owner.sql`

**Interfaces:**
- Produces: table `crm_owner_cleanup_20261112(client_id text primary key, client_owner text, assigned_owner text, saved_at timestamptz default now())` — RLS on, no public grants; holds the before-values of every changed row.
- Produces: after the migration no `crm_clients` row has `client_owner` or `assigned_owner` null or blank (`btrim = ''`); both are `'Unassigned'` instead.

The migration is one statement sequence: create table; insert before-values of rows where either field is null/blank; update those rows (each field only where it is null/blank). It must be safe to run twice (second run changes and saves nothing new: `on conflict do nothing`). If `crm_clients` has an "updated at" trigger, the update may fire it — leave that as is.

- [ ] **Step 1: Write `db/tests/s3_t3_owner.sql`:** the local runner applies migrations before tests, so the test inserts three clients (owner null/null; `''`/`'Karina'`; `'Karina'`/`'Ellona'`), then re-executes the migration's insert and update statements by calling a helper the migration defines for this purpose — `crm_owner_cleanup_apply() returns integer` (rows changed; `security definer`, revoked like the others) — and asserts: returns 2; first client `Unassigned`/`Unassigned`; second `Unassigned`/`Karina`; third untouched; saved table has exactly the two changed clients with their before-values; second call returns 0.
- [ ] **Step 2:** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh s3_t3` → Expected: FAIL, `function crm_owner_cleanup_apply() does not exist`.
- [ ] **Step 3: Write the migration:** table, function, then `select crm_owner_cleanup_apply();`.
- [ ] **Step 4:** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh` → Expected: PASS for all three `s3_` tests.
- [ ] **Step 5:** Commit: `S3 task 6: owner clean-up`.

---

### Task 7: Production roll-out (controller only — not dispatched)

Each numbered step needs Alex's explicit yes; before each, a dry run inside `begin … rollback` on production where possible.

- [ ] 0. Alex: backup (`pg_dump`, S1 report §7). Verify the new `.dump` on OneDrive.
- [ ] 1. `apply_migration s3_ticket_functions` = Task 3 + Task 4 migration files. Then re-run Sprint 2 tests `s2_t1`–`s2_t5` (rolled back).
- [ ] 2. Deploy `crm-import` v3 (Task 5). Check: a request with a wrong key is refused.
- [ ] 3. First load: create a one-time key, POST the payload of the four exports through `crm-import`. Expected: 606 new tickets, 746 lines, 4 pieces sold (tickets 758, 759). Check piece events and that no review was raised.
- [ ] 4. `select ops_link_crm_tickets('Alex')` — dry run first: all 188 lines of 2024 linked, nothing linked twice, 2022 untouched.
- [ ] 5. `apply_migration s3_owner_cleanup` (Task 6). Check counts against spec §3.
- [ ] 6. Repeated serials in the 12 Nov stock report: list by brand (spec §4.7).
- [ ] 7. Reconciliation report from `ops_ticket_monthly` vs CRM vs `Monthly_KPI_Cheat_Sheet_v1.md` → `claude/S3_Sales_Register_Reconciliation.md`.
- [ ] 8. Health checks, security advisor, schema snapshot (Alex's `pg_dump --schema-only`), PR, build report, roadmap and data map updates.
