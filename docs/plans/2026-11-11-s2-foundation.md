# Sprint 2 — operational foundation: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanent pieces with states and history, a review queue, ticket tables, a manage-stock right, and a catalogue load that no longer destroys links — in the live Supabase database, without changing any screen.

**Architecture:** New `ops_` tables and `SECURITY DEFINER` functions in schema `public`, applied as three Supabase migrations. `cat_load()` is replaced so colours are upserted and `ops_sync_pieces(run)` runs at the end. Every test is a SQL script that runs inside `begin … rollback`, so nothing it creates survives.

**Tech Stack:** PostgreSQL 17 on Supabase (project `hugduzqwyqwryicfzipu`), Supabase MCP `apply_migration` / `execute_sql`, git repo `AlexDelardi/delardi-board` branch `s2-foundation`.

**Spec:** `docs/specs/2026-11-11-s2-foundation-design.md` (approved 11 Nov 2026).

## Global Constraints

- **Every production change is a separate step that Alex approves first** (backup, each migration, the initial fill). Ask, wait for "yes", then apply.
- Tests run with `execute_sql` and must start with `begin;` and end with `rollback;`. A test never commits.
- New tables: RLS enabled, **no policies**, no grants to `anon` / `authenticated` (revoke after create, as the default privileges grant them).
- New functions: `security definer`, `set search_path = public, pg_temp`, `revoke execute … from public, anon, authenticated`.
- States (exact strings): `in_transit, in_stock, reserved, booked_out, damaged, sold`. No `returned_to_supplier`.
- Store row: `store_id = 1`, `code = 'BKH26'`, `name = 'Delardi Boutique'`, `address = 'Bukhara 26, Tashkent'`.
- Ticket source values: `colibri`, `delardi`. Ticket unique key: `(store_id, source, ticket_no)`.
- Manage-stock holder: `board_users.name = 'Alex'` only.
- Serial matching: compare `upper(btrim(serial))`; store the trimmed original.
- Migration files live in `db/migrations/`, tests in `db/tests/`, rollback in `db/rollback/`. Each migration file is applied with `apply_migration` using its file name without date and extension as `name`.
- Commits end with the two attribution lines used on this repo; push to `s2-foundation`.

## Review Focus

1. **Serials with spaces or different case** (Colibri exports `GIGR36SSD ` with a trailing space) must match the same piece → test `t3_sync` case "trailing space".
2. **A piece Alex set to Reserved / Booked-Out / Damaged must keep that state on the next load** (sync refreshes model/colour only) → test `t3_sync` case "manual state survives reload".
3. **The same serial in stock and in the in-transit list in one load** must end up In Stock, once → test `t3_sync` case "stock beats transit".
4. **An actor who is unknown, inactive, or lacks the right** must be refused with a clear message → test `t2_rights` cases.
5. **Colibri reusing a sold piece's serial for a new article** must create a new piece and a `serial_reused` review, not resurrect the sold one → test `t4_tickets` case "serial reused after sale".

---

### Task 0: Backup before any change

**Files:** none (Alex's PC).

- [ ] **Step 1:** Ask Alex to run the backup command from `S1_Map_Reality_Report_11Nov2026.md` §7. Wait.
- [ ] **Step 2:** Verify with `device_bash`: `ls -la "…/Supabase backups"` shows a new `delardi_<today>.dump` larger than 1.5 MB, header `PGDMP`.
- [ ] **Step 3:** Ask Alex for the go-ahead on Task 1's migration.

---

### Task 1: Tables, store, right (migration 1, part A)

**Files:**
- Create: `db/migrations/20261112_s2_ops_tables.sql`
- Test: `db/tests/s2_t1_tables.sql`

**Interfaces:**
- Produces tables exactly as spec §4.1–4.7: `ops_stores`, `ops_pieces`, `ops_piece_events`, `ops_review`, `ops_tickets`, `ops_ticket_lines`, `ops_ticket_payments`; column `board_users.can_manage_stock`.
- `ops_pieces.sold_line_id` → `ops_ticket_lines(line_id)` (create lines table before adding this FK).
- Partial unique index `ops_pieces_live_serial` on `(brand, upper(btrim(serial)))` where `state <> 'sold'`.
- Partial unique index `ops_review_open` on `(piece_id, kind)` where `status = 'open'`.
- Trigger `ops_piece_events_immutable` (before update or delete, for each row) raising `'ops_piece_events is append-only'`.

- [ ] **Step 1: Write the failing test `s2_t1_tables.sql`**

```sql
begin;
do $$ begin
  assert (select count(*) from ops_stores where code='BKH26' and store_id=1)=1, 'store row';
  assert (select can_manage_stock from board_users where name='Alex'), 'Alex has right';
  assert (select count(*) from board_users where can_manage_stock)=1, 'only Alex';
  assert (select count(*) from information_schema.role_table_grants
          where table_name like 'ops\_%' and grantee in ('anon','authenticated'))=0, 'no public grants';
  assert (select bool_and(relrowsecurity) from pg_class where relname like 'ops\_%' and relkind='r'), 'RLS on';
end $$;
-- states are constrained
do $$ begin
  begin insert into ops_pieces(store_id,brand,serial,state) values (1,'X','S1','returned_to_supplier');
        raise exception 'state check missing';
  exception when check_violation then null; end;
end $$;
-- events are append-only (T8)
insert into ops_pieces(store_id,brand,serial,state) values (1,'TEST','T-1','in_stock');
insert into ops_piece_events(piece_id,to_state,reason,actor) select piece_id,'in_stock','initial_load','test' from ops_pieces where serial='T-1';
do $$ begin
  begin update ops_piece_events set note='x'; raise exception 'update allowed';
  exception when others then if sqlerrm not like '%append-only%' then raise; end if; end;
  begin delete from ops_piece_events; raise exception 'delete allowed';
  exception when others then if sqlerrm not like '%append-only%' then raise; end if; end;
end $$;
-- one live piece per brand+serial, sold one may repeat
do $$ begin
  begin insert into ops_pieces(store_id,brand,serial,state) values (1,'TEST',' t-1 ','in_stock');
        raise exception 'duplicate live serial allowed';
  exception when unique_violation then null; end;
end $$;
rollback;
```

- [ ] **Step 2: Run it** with `execute_sql`. Expected: error `relation "ops_stores" does not exist`.
- [ ] **Step 3: Write the migration** with the tables, indexes, trigger, the store row, `alter table board_users add column can_manage_stock boolean not null default false; update board_users set can_manage_stock = true where name = 'Alex';`, RLS enable and revokes.
- [ ] **Step 4: Ask Alex**, then `apply_migration(name='s2_ops_tables', query=<file>)`.
- [ ] **Step 5: Run the test.** Expected: success, no error.
- [ ] **Step 6: Commit** migration and test.

---

### Task 2: Rights and manual state changes (migration 1, part B)

**Files:**
- Create: `db/migrations/20261112_s2_ops_functions.sql`
- Test: `db/tests/s2_t2_rights.sql`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces:
  - `ops_has_right(p_actor text, p_right text) returns boolean` — `p_right` must be `'manage_stock'`; true only for an **active** `board_users` row with that exact name and `can_manage_stock`.
  - `ops_set_state(p_piece uuid, p_state text, p_actor text, p_note text default null, p_client text default null, p_until date default null) returns void` — raises `'not allowed: % lacks manage stock'` without the right; allowed moves: `in_stock → reserved | booked_out | damaged` and back to `in_stock`; raises `'state % → % is not allowed'` otherwise (any move to/from `sold` or `in_transit`). Sets `state_since=now()`, hold fields (cleared on return to `in_stock`), writes one event with `reason` ∈ `reserved, released, booked_out, returned_from_loan, damaged, repaired`, `ref_kind='manual'`.
  - `ops_resolve_review(p_review bigint, p_resolution text, p_actor text, p_note text default null) returns void` — right required; resolution ∈ `damaged, booked_out, still_in_stock` applies the state via the same rules (`still_in_stock` = no state change), `sold` only allowed if the piece is already `sold`; sets `status='resolved'`, writes event `review_resolved` when the state changes.
  - `ops_initial_fill(p_actor text) returns jsonb` — right required; refuses with `'initial fill already done'` if `ops_pieces` has any row; creates pieces from `cat_pieces` (state `in_stock`) and `cat_incoming` serials not in `cat_pieces` (state `in_transit`), brand from `cat_models` via `cat_variants`, event `initial_load`, `ref_kind='cat_run'`, `ref_id` = latest `cat_import_runs.id`; returns `{"in_stock":n,"in_transit":n}`.

- [ ] **Step 1: Write the failing test `s2_t2_rights.sql`** — inside `begin … rollback`:
  - `ops_initial_fill('Alex')` returns `in_stock = (select count(*) from cat_pieces)` and `in_transit = 19` (or the live in-transit count without a stock twin); event count equals piece count.
  - Second `ops_initial_fill('Alex')` raises `'initial fill already done'`.
  - For one in-stock piece: `ops_set_state(p,'reserved','Karina')` raises `not allowed`; `ops_set_state(p,'reserved','Nobody')` raises `not allowed`; set `board_users.active=false` for Alex inside the transaction → raises `not allowed`; restore.
  - `ops_set_state(p,'reserved','Alex','test', <any client_id>, current_date+3)` → state `reserved`, `hold_client_id` set, exactly one new event `reason='reserved'`.
  - `ops_set_state(p,'sold','Alex')` raises `is not allowed`.
  - `ops_set_state(p,'in_stock','Alex')` → `hold_client_id` null, event `released`.
  - Insert an open review for the piece, `ops_resolve_review(id,'damaged','Alex')` → piece `damaged`, review `resolved`.
- [ ] **Step 2: Run it.** Expected: `function ops_initial_fill(unknown) does not exist`.
- [ ] **Step 3: Write the four functions** in the migration file, with revokes.
- [ ] **Step 4: Ask Alex**, then `apply_migration(name='s2_ops_functions', …)`.
- [ ] **Step 5: Run the test.** Expected: success.
- [ ] **Step 6: Commit.**

---

### Task 3: Stock sync

**Files:**
- Create: `db/migrations/20261112_s2_ops_sync.sql`
- Test: `db/tests/s2_t3_sync.sql`

**Interfaces:**
- Consumes: Task 1 tables, `ops_initial_fill`.
- Produces: `ops_sync_pieces(p_run bigint) returns jsonb` — algorithm exactly spec §7, keyed on `(brand, upper(btrim(serial)))`; returns `{"arrived":n,"in_transit":n,"refreshed":n,"review_raised":n,"review_closed":n}`. Never changes `reserved / booked_out / damaged / sold`; only `in_transit → in_stock`. Missing-piece check covers `in_stock, reserved, booked_out, damaged`. Raises review `missing_from_export` with `raised_run = p_run` (no duplicate while one is open); auto-closes open `missing_from_export` (`status='auto_closed'`) when the serial is back. A serial whose only `ops_pieces` row is `sold` → new piece + `serial_reused` review.

- [ ] **Step 1: Write the failing test `s2_t3_sync.sql`** — `begin`; `ops_initial_fill('Alex')`; then cases:
  - **idempotent:** `ops_sync_pieces(<latest run>)` twice → all counts 0 except `refreshed`; no new events; no reviews.
  - **missing:** `delete from cat_pieces where serial = <one serial>`; sync → `review_raised = 1`, piece state unchanged; sync again → still 1 open review (no duplicate).
  - **back:** re-insert that `cat_pieces` row; sync → `review_closed = 1`, review `auto_closed`.
  - **trailing space:** update that `cat_pieces.serial` to `serial || ' '` and lower-case it; sync → 0 arrived, 0 reviews.
  - **manual state survives reload:** `ops_set_state(p,'booked_out','Alex')`; sync → still `booked_out`.
  - **stock beats transit:** insert into `cat_incoming` a serial already in `cat_pieces`; sync → piece `in_stock`, exactly one piece row for it.
  - **arrival:** move one `in_transit` piece's serial into `cat_pieces` (insert a row with its variant); sync → `arrived = 1`, state `in_stock`, event `arrived`.
  - `rollback`.
- [ ] **Step 2: Run it.** Expected: `function ops_sync_pieces(bigint) does not exist`.
- [ ] **Step 3: Write `ops_sync_pieces`.**
- [ ] **Step 4: Ask Alex**, then `apply_migration(name='s2_ops_sync', …)`.
- [ ] **Step 5: Run the test.** Expected: success.
- [ ] **Step 6: Commit.**

---

### Task 4: Protect sales and link tickets (migration 2)

**Files:**
- Create: `db/migrations/20261112_s2_protect_sales.sql`
- Test: `db/tests/s2_t4_tickets.sql`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `crm_transactions_client_id_fkey` recreated `on delete restrict`.
  - `crm_transactions.ticket_line_id uuid references ops_ticket_lines(line_id) on delete set null`.
  - `ops_apply_ticket_line(p_line uuid, p_actor text) returns void` — for a `sale` line with a `piece_id`: piece → `sold`, `sold_line_id = p_line`, event `sold` (`ref_kind='ticket_line'`), auto-close any open review for the piece; for a `refund` line: piece `sold → in_stock`, event `refunded`. No right check (called by loaders and the till, never by a person directly). Idempotent: applying a sale line to a piece already sold by that line does nothing. *(Not in spec §6 by name; required by spec test T5 and by the Sprint 3 loader.)*

- [ ] **Step 0 (pre-check, before migrating):** `select count(*) from crm_transactions t left join crm_clients c using(client_id) where c.client_id is null` → must be `0`; stop and report if not.
- [ ] **Step 1: Write the failing test `s2_t4_tickets.sql`** — `begin`; `ops_initial_fill('Alex')`; cases:
  - **T6:** `delete from crm_clients where client_id = (select client_id from crm_transactions limit 1)` raises `foreign_key_violation`.
  - **T5:** insert a ticket (`source='colibri'`, `ticket_no='TEST-1'`) and a sale line with `piece_id` of one in-stock piece; `ops_apply_ticket_line(line,'system')` → piece `sold`, `sold_line_id` = line, one event `sold`; applying again adds no event; a refund line on a second ticket → piece `in_stock`, event `refunded`.
  - **duplicate ticket:** a second ticket with the same `(1,'colibri','TEST-1')` raises `unique_violation`; with `source='delardi'` it is accepted.
  - **serial reused after sale:** with the piece `sold`, put its serial on a different `variant_id` in `cat_pieces`; `ops_sync_pieces(<run>)` → a **new** `in_stock` piece and one open `serial_reused` review; the sold piece stays `sold`.
  - `rollback`.
- [ ] **Step 2: Run it.** Expected: T6 case fails (delete succeeds under cascade) → assertion error.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Ask Alex**, then `apply_migration(name='s2_protect_sales', …)`.
- [ ] **Step 5: Run the test**, then re-run `s2_t1`–`s2_t3`. Expected: all succeed.
- [ ] **Step 6: Commit.**

---

### Task 5: Catalogue load keeps colours and syncs pieces (migration 3)

**Files:**
- Create: `db/migrations/20261112_s2_cat_load_v2.sql` (top comment holds the current `cat_load` definition verbatim for rollback)
- Create: `db/rollback/s2_rollback.sql`
- Test: `db/tests/s2_t5_reload.sql`

**Interfaces:**
- Consumes: `ops_sync_pieces(bigint)`.
- Produces: `cat_load(p jsonb, p_source text) returns jsonb` — same signature and return keys as today plus `models_removed`, `photos_unlinked`, `ops` (the sync counts). Changes vs today: no `delete from cat_variants where true`; variants `insert … on conflict (variant_id) do update` of every column except `variant_id`; afterwards delete variants whose id is not in the payload **and** that have no `cat_pieces`, `cat_incoming`, `cat_reports` or `cat_overlay` rows; `models_removed` / `photos_unlinked` counted before the model delete; `perform ops_sync_pieces(run_id)` after `cat_link_transactions()`. Everything else unchanged.
- Rollback file: drops `ops_*` functions and tables, `crm_transactions.ticket_line_id`, `board_users.can_manage_stock`, restores the cascade FK and the old `cat_load` from the migration comment.

- [ ] **Step 1: Write the failing test `s2_t5_reload.sql`** — `begin`; `ops_initial_fill('Alex')`; snapshot `piece_id` per serial, photo count, variant ids into temp tables; insert a test `cat_reports` row with a `variant_id`; build a payload **from the current tables** (`jsonb_build_object('models', …, 'variants', …, 'pieces', …, 'attributes', …, 'links', …, 'expected', …)` from `cat_models`, `cat_variants`, `cat_pieces`, `cat_attributes`, `cat_links`, `cat_expected_keys`); call `cat_load(payload,'s2 test')` twice; assert:
  - **T1:** same set of `piece_id`s; same variant ids; same photo count; the test report still has its `variant_id`; 0 new events; 0 reviews; result has keys `ops`, `models_removed = 0`, `photos_unlinked = 0`.
  - **T2:** second load: `ops` counts all 0 except `refreshed`.
  - `rollback`.
- [ ] **Step 2: Run it.** Expected: fails on the report's `variant_id` (null after load) or missing key `ops`.
- [ ] **Step 3: Write the migration and the rollback file.**
- [ ] **Step 4: Ask Alex**, then `apply_migration(name='s2_cat_load_v2', …)`.
- [ ] **Step 5: Run `s2_t5`**, then all earlier tests. Expected: all succeed.
- [ ] **Step 6: Commit.**

---

### Task 6: Initial fill in production

**Files:** none.

- [ ] **Step 1: Ask Alex** for the go-ahead.
- [ ] **Step 2:** `select ops_initial_fill('Alex');` Expected: `in_stock` = current `cat_pieces` count, `in_transit` = in-transit serials without a stock twin.
- [ ] **Step 3:** Check `select state, count(*) from ops_pieces group by 1` and `select count(*) from ops_piece_events` = piece count.
- [ ] **Step 4:** Report the counts to Alex.

---

### Task 7: Verify, document, publish

**Files:**
- Modify: `db/schema.sql` (Alex re-runs the schema dump; Claude copies it in)
- Modify: data map page source `/home/claude/datamap/build.py` (add `ops_` tables and the review queue; republish the artifact `3d13b445-da96-40d6-b355-0ff0ac6ad662`)
- Modify: project doc `claude/S1_Map_Reality_Report_11Nov2026.md` → link to an S2 report `claude/S2_Foundation_Build_Report.md` (new)

- [ ] **Step 1 (T9):** `curl` health on board-api, crm-api, catalogue-api → 200 each; `select count(*) from cat_models, cat_variants, cat_pieces` unchanged from before Task 5.
- [ ] **Step 2 (T10):** `get_advisors(security)` → no warnings beyond the existing "RLS enabled no policy" infos.
- [ ] **Step 3:** Ask Alex to run the schema-only dump; copy to `db/schema.sql`; scan as in Sprint 1 (no emails, phones, client IDs).
- [ ] **Step 4:** Commit, push, open the pull request into `main` with all migrations, tests, rollback and spec; Alex merges.
- [ ] **Step 5:** Write the S2 build report (what was applied, test results, counts) to the project; update the data map page.
