# One Piece Register and Colibri Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ops_pieces` becomes the only piece list read by every tool, a Colibri load stops rewriting pieces we hold and raises reviewable differences instead, and the Stock upload can create pieces and set prices.

**Architecture:** Retail price moves onto `ops_pieces`; every reader of `cat_pieces` switches to `ops_pieces`; catalogue counts, prices, sizes and facets are derived from `ops_pieces` by a refresh function fired by statement triggers. `cat_pieces` stays only as the snapshot of what the last Colibri load said, read by the load's own sync. Differences between that snapshot and the register go to `ops_colibri_diffs`, decided in a new Stock tab.

**Tech Stack:** PostgreSQL 16 (plpgsql, migrations in `db/migrations`, SQL tests in `db/tests`), Supabase edge function `stock-api` (Deno/TypeScript), plain JS front end built by `stock/src/build.py`, Playwright tests in `stock/src/qa/test.js`.

**Spec:** `docs/specs/2026-11-27-one-register-design.md`

## Global Constraints

- Public repository: no real client names, staff names, serials, counts, figures or exports. Fixtures are invented (prefix `ZR-`).
- No production step from this plan: migrations are applied and functions deployed only by the controller after Alex's explicit go, in the order database, API, merge.
- A Colibri load never changes price, size, article, design, colour or state of a piece we hold. It may fill `barcode` only when ours is null.
- The Catalogue counts as available only pieces in state `in_stock`; in transit only `in_transit`.
- Cost never leaves through any new function or action. Retail price follows the view right; deciding differences needs the manage right.
- Functions that exist only in `db/schema.sql` are patched with `pg_get_functiondef` + `replace` + an assert-or-raise guard, as in `20261127_cat_overlay_flag.sql`; others with `create or replace`.
- Every new function: `security definer`, `set search_path = public, pg_temp`, execute revoked from `public, anon, authenticated`. Every new table: RLS enabled, all revoked from `public, anon, authenticated`.
- Three releases, three branches and PRs: `one-register-1` (Tasks 1-3), `one-register-2` (Tasks 4-5), `one-register-3` (Task 6). Each branches from main after the previous is merged.
- UI text in English with RU strings beside it, following `claude/Tools_Design_Guideline_v2.md` patterns already in `stock/src`.
- Run for every task: `db/dev/local_db.sh stop; db/dev/local_db.sh start`, then `db/dev/run_sql_tests.sh <prefix>` for each prefix (`acc_ cat_ crm_ hub_ perf_ pos_ reg_ s2_ s3_ stk_ tsk_`); all pass.

## Review Focus

1. A load whose Colibri price equals a value the user already rejected ("Keep ours"): no new line. Test in Task 4.
2. A piece sold in our Sales tool between two loads: the Catalogue count drops at once and the next load does not bring it back. Test in Task 3.
3. A Colibri load that lists a held piece under a different design: the Catalogue keeps counting it under our design. Test in Task 4.
4. Deciding "Take Colibri's" on a line whose piece has since been sold: refused with a plain sentence, line closed. Test in Task 4.
5. An upload row for a serial we already hold in state `sold`: not created again silently; error line. Test in Task 6.

---

## Release 1: one register, no visible change

### Task 1: Price on the register

**Files:**
- Create: `db/migrations/20261127_reg_1_price.sql`
- Test: `db/tests/reg_t1_price.sql`
- Modify: `db/tests/fixtures/s2_seed.sql` (only if a price is missing on a seeded piece)

**Interfaces:**
- Produces: column `ops_pieces.price_uzs bigint`; table `ops_piece_changes(change_id bigserial pk, piece_id uuid not null references ops_pieces, field text not null, old_value text, new_value text, source text not null check (source in ('colibri_first_load','upload','colibri_review','manual')), actor text not null, at timestamptz not null default now())`.

- [ ] **Step 1: Write `db/tests/reg_t1_price.sql`** (same shape as `cat_t2_arrival.sql`: `begin; \ir fixtures/s2_seed.sql ... rollback;`, `do $$ ... assert ... $$`). Assertions:
  - every `ops_pieces` row in a floor state whose brand+serial is in `cat_pieces` has `price_uzs` equal to the latest (`order by id desc`) `cat_pieces.price_uzs`;
  - after `cat_load` of a payload with one new serial `ZR-S900` priced 5000000, its `ops_pieces.price_uzs = 5000000` and one `ops_piece_changes` row with `source = 'colibri_first_load'`;
  - `anon` and `authenticated` have no privilege on `ops_piece_changes`.
- [ ] **Step 2: Run** `db/dev/run_sql_tests.sh reg_` — expected FAIL (column does not exist).
- [ ] **Step 3: Write the migration:** add the column and table; backfill `price_uzs` from `cat_pieces` by brand + `upper(btrim(serial))`; patch `ops_sync_pieces` so the step-4 insert of new pieces carries `price_uzs` from the load (add `p.price_uzs` to `ops_sync_load`, null for incoming) and writes the `ops_piece_changes` row. Step 2 of the sync is not touched in this task.
- [ ] **Step 4: Run all prefixes** — expected PASS.
- [ ] **Step 5: Commit** `Register: retail price on the piece, with a change history`.

### Task 2: Readers leave `cat_pieces`

**Files:**
- Create: `db/migrations/20261127_reg_2_readers.sql`
- Test: `db/tests/reg_t2_readers.sql`

**Interfaces:**
- Consumes: `ops_pieces.price_uzs`.
- Produces: `pos_search_pieces`, `pos_post_sale`, `stk_base`, `stk_piece_cost`, `perf_brands`, `ops_initial_fill` read price from `ops_pieces.price_uzs`; signatures and returned shapes unchanged.

- [ ] **Step 1: Write the test.** Assertions:
  - `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%cat_pieces%' and p.proname not in ('cat_load','ops_sync_pieces','cat_apply_incoming','cat_merge_sizes','cat_rebuild_facets','cat_rebuild_facets_v2','cat_rebuild_search')` is 0 (the last five leave in Task 3);
  - with a seeded piece's `ops_pieces.price_uzs` set to 7770000 and its `cat_pieces.price_uzs` left different, `stk_piece_list` and `pos_search_pieces` return 7770000 for it.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Write the migration:** in each listed function replace the `cat_pieces` price subquery with the piece's own `price_uzs`. `ops_initial_fill` reads only `ops_pieces`-independent sources already present after Task 1; if it only seeds `ops_pieces` from `cat_pieces` for an empty register, leave its body and add it to the allowed list in the test with a comment saying why.
- [ ] **Step 4: Run all prefixes** — expected PASS (the `pos_`, `stk_` and `perf_` suites prove shapes are unchanged).
- [ ] **Step 5: Commit** `Sales, Stock and Performance read the price from the register`.

### Task 3: Catalogue derived live from the register

**Files:**
- Create: `db/migrations/20261127_reg_3_catalogue_live.sql`
- Test: `db/tests/reg_t3_live.sql`

**Interfaces:**
- Consumes: `ops_pieces.price_uzs`.
- Produces: `cat_refresh_stock(p_models text[] default null) returns int` (designs touched; null = all). Sets `cat_variants.in_stock, qty_stock, qty_transit` and `cat_models.in_stock, qty_stock, price_min_uzs, price_max_uzs` from `ops_pieces` (`in_stock` state for stock and price, `in_transit` for transit), then refreshes sizes, facets and search for those designs by calling the existing rebuild functions. Statement triggers `ops_pieces_cat_stock_ins|upd|del` on `ops_pieces` (insert; delete; update of `state, model_id, variant_id, size, price_uzs`) call it with the affected `model_id`s through transition tables, as `cat_refresh_arrival_dates` does in `20261127_cat_arrival_3.sql`.

- [ ] **Step 1: Write the test.** Assertions, on the seed:
  - `cat_refresh_stock()` leaves every `cat_variants.qty_stock` equal to the count of its `in_stock` pieces;
  - `ops_set_state` of piece `ZS-S001` to `reserved`: its variant's `qty_stock` drops by 1 and, if it was the last, `in_stock` is false on variant and design; back to `in_stock` restores both;
  - marking it `sold` (direct update of `state` in the test) drops the count; a following `cat_load` whose payload still claims `qty_stock` including it leaves the count from the register (Review Focus 2);
  - `update ops_pieces set price_uzs = 1` on one in-stock piece sets its design's `price_min_uzs = 1`;
  - the size facet of the design no longer lists a size whose only piece is reserved;
  - no function other than `cat_load` and `ops_sync_pieces` references `cat_pieces`.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Write the migration:** switch `cat_merge_sizes`, `cat_rebuild_facets`, `cat_rebuild_facets_v2`, `cat_rebuild_search`, `cat_apply_incoming` from `cat_pieces` to `ops_pieces` filtered to `state = 'in_stock'` (join on `variant_id`); create `cat_refresh_stock` and the triggers; make `cat_load` call `cat_refresh_stock()` after `ops_sync_pieces(run_id)` and before its facet rebuilds, so payload counts never survive. If a full facet rebuild inside the trigger takes over 300 ms on the seed (`\timing`), have the trigger refresh counts and prices only and leave facets to a deferred call at the end of `cat_refresh_stock(null)`; record which in the migration header.
- [ ] **Step 4: Run all prefixes**, then `cd catalogue/src && python3 build.py && cp ../index.html dist/ 2>/dev/null; NODE_PATH=/opt/npm-tools/node_modules node qa/test.js`, the same for `stock/src`, and `node qa/kit.cjs && node qa/hub.cjs && node qa/home-tools.cjs && python3 qa/check-builds.py` — expected PASS.
- [ ] **Step 5: Write `db/checks/reg_parity.sql`:** one read-only query returning, per design, stored `qty_stock`/`in_stock`/`price_min_uzs`/`price_max_uzs` against the values `cat_refresh_stock` would compute, listing only rows that differ. The controller runs it on production before and after applying; expected: no rows before (nothing is held today), none after.
- [ ] **Step 6: Commit** `Catalogue counts, prices and sizes come live from the register`.

---

## Release 2: Colibri stops rewriting; differences are reviewed

### Task 4: Differences in the database

**Files:**
- Create: `db/migrations/20261128_reg_4_colibri_diffs.sql`
- Test: `db/tests/reg_t4_diffs.sql`

**Interfaces:**
- Produces:
  - `ops_colibri_diffs(diff_id bigserial pk, piece_id uuid not null references ops_pieces on delete cascade, field text not null check (field in ('price','size','article','design','colour','barcode')), ours text, colibri text, raised_run bigint, raised_at timestamptz default now(), status text not null default 'open' check (status in ('open','kept','taken','superseded')), decided_by text, decided_at timestamptz)`, unique index on `(piece_id, field) where status = 'open'`.
  - `stk_diff_list(p jsonb) returns jsonb`: `p = {brand?, field?, page?}`; returns `{total, open_by_field: {field: n}, page, per_page: 100, rows: [{diff_id, piece_id, brand, serial, article, field, ours, colibri, raised_at}]}`, open lines only, ordered by brand, serial, field.
  - `stk_diff_decide(p jsonb, p_actor text) returns jsonb`: `p = {take: boolean, ids?: bigint[], filters?: {brand?, field?}}` (exactly one of `ids`, `filters`); checks `manage_stock` for the actor as `ops_set_state` does; returns `{kept, taken, skipped}`.
- Consumes: `ops_piece_changes` (Task 1), `cat_refresh_stock` triggers (Task 3).

- [ ] **Step 1: Write the test.** Load the seed, then run `cat_load` with a payload in which held piece `ZS-S001` has a different price, size and variant, and held piece `ZS-S002` (barcode null) has barcode `ZR-BC1`. Assertions:
  - `ZS-S001`'s `price_uzs, size, variant_id, model_id, article` are unchanged; three open lines exist (`price`, `size`, `colour`); its design's catalogue count is unchanged (Review Focus 3);
  - `ZS-S002.barcode = 'ZR-BC1'` and no line for it;
  - the same load again raises no new line;
  - `stk_diff_decide('{"take":false,"ids":[<price line>]}', 'Alex')` → status `kept`; the same load again raises no `price` line (Review Focus 1); a load with a third price raises a new open one;
  - `stk_diff_decide` with `take:true` on the `size` line sets the piece's size, writes `ops_piece_changes` with `source = 'colibri_review'`, status `taken`;
  - a load in which Colibri now agrees with us marks the open line `superseded`;
  - with the piece set to `sold`, `take:true` on its open line returns `skipped: 1`, changes nothing and marks the line `superseded` (Review Focus 4);
  - an actor without `manage_stock` gets the P0001 refusal `Your account cannot change stock.`;
  - `filters: {field:'price'}` with `take:false` decides every open price line.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Write the migration:** table and functions; in `ops_sync_pieces` replace step 2 with: set only `last_seen_run`, `last_seen_at`, `shipped_on = coalesce(l.shipped_on, o.shipped_on)`, and `barcode` where ours is null; then raise differences for live pieces in the load, per field, comparing as text (`price` from `l.price_uzs`, `design` = `model_id`, `colour` = `variant_id`; in-transit rows from incoming have no price and raise no `price` line). A line is not raised when the latest decided line for that piece and field is `kept` with the same `colibri` value. An open line with a different `colibri` value becomes `superseded` and a new one is raised. The function's result gains `'differences', <new open lines>`.
- [ ] **Step 4: Run all prefixes** — expected PASS (`s2_t3`, `s2_t5`, `s3_t4` assert the old refresh; update only assertions that contradict the spec, and say which in the commit body).
- [ ] **Step 5: Commit** `Colibri load no longer rewrites held pieces; differences wait for review`.

### Task 5: "Colibri differences" in Stock

**Files:**
- Modify: `stock/src/api/index.ts`, `stock/src/api/README.md`, `stock/src/app.js`, `stock/src/template.html`, `stock/src/qa/mock.js`, `stock/src/qa/test.js`
- Create: `stock/src/diffs.js` (add to `stock/src/build.py`'s script list)

**Interfaces:**
- Consumes: `stk_diff_list`, `stk_diff_decide`.
- Produces: API actions `diffs` (`{token, filters?: {brand?, field?, page?}}`, manage right, returns `stk_diff_list` result) and `diff_decide` (`{token, take: boolean, ids?: number[] (1..2000 positive integers), filters?: {brand?, field?}}`, manage right; 400 `Say which differences to decide.` when neither or both are given; returns the decide result followed by a fresh first page as `{kept, taken, skipped, list}`).

- [ ] **Step 1: Write the page tests** in `stock/src/qa/test.js` against invented mock lines (brands `ZR Brand A/B`, serials `ZR-S9xx`):
  - a login with manage sees a "Colibri differences" tab with the open count; one without manage does not;
  - the table shows Brand, Serial, Field, Ours, Colibri, Load; price values are formatted like prices elsewhere in Stock;
  - "Keep ours" on a row removes it and lowers the count; "Take Colibri's" likewise and shows the toast `Updated from Colibri.`;
  - ticking two rows and "Keep ours" decides both in one call with `ids`;
  - with the Field filter on Price, "Keep ours: all shown" asks `Keep our value on all N shown?` and sends `filters`, not `ids`;
  - empty state: `No differences. Colibri and Stock agree.`;
  - phone width: rows stack, both buttons stay reachable.
- [ ] **Step 2: Run** `cd stock/src && python3 build.py && NODE_PATH=/opt/npm-tools/node_modules node qa/test.js` — expected FAIL on the new tests only.
- [ ] **Step 3: Implement** the two API actions, the mock, `diffs.js` (render, filters, select, decide), the tab and RU strings. Reuse the table, checklist and confirm components `review.js` and `listx.js` already use.
- [ ] **Step 4: Run** the Stock suite and `node qa/kit.cjs && node qa/home-tools.cjs && python3 qa/check-builds.py` — expected PASS.
- [ ] **Step 5: Commit** `Stock: review Colibri differences line by line or in bulk`.

---

## Release 3: the upload creates pieces and sets prices

### Task 6: Upload creates and prices

**Files:**
- Create: `db/migrations/20261129_reg_5_import_create.sql`
- Test: `db/tests/reg_t5_import_create.sql`
- Modify: `stock/src/import.js`, `stock/src/qa/mock.js`, `stock/src/qa/test.js`, `stock/src/api/README.md`

**Interfaces:**
- Consumes: `stk_import(p jsonb, p_actor text, p_apply boolean)` and its preview shape, `ops_piece_changes`.
- Produces: the same function and shape, with two new per-row outcomes in the preview: `creates: true` and `price: {old, new}`; summary counts `created` and `repriced`.

- [ ] **Step 1: Read `stk_import` and `stock/src/import.js`** and note in the migration header which template column carries the retail price in UZS. If the template has no UZS retail column, stop and report to the controller before writing anything.
- [ ] **Step 2: Write the test.** Assertions:
  - a row with brand + serial we do not hold and an `Артикул` matching exactly one `cat_models.article` of that brand, whose design has one variant: preview says `creates`; apply inserts an `in_stock` piece with that design, variant, size and price, an `ops_piece_events` row (`reason 'arrived'`, `ref_kind 'manual'`), and the Catalogue count rises by 1;
  - the same row when the design has several variants and the row's colour cell matches none: error line `Say which colour: <list>`; nothing applied for the whole file;
  - unknown `Артикул`: error line `No design with this reference for <brand>. Add the design first.`;
  - a serial we hold only in state `sold` or `not_received`: error line `This serial was sold or not received before. Check it.` (Review Focus 5);
  - a row for a held piece with a different retail price: preview `price {old, new}`; apply sets `price_uzs` and writes `ops_piece_changes` with `source = 'upload'` and the actor; a blank price cell changes nothing;
  - rows that used to wait in `ops_upload_pending` for an unknown serial now create the piece instead when the design is known.
- [ ] **Step 3: Run** — expected FAIL.
- [ ] **Step 4: Write the migration** and show the two outcomes in the preview table in `import.js` (a "New piece" tag and an old → new price cell), with page tests for both and RU strings.
- [ ] **Step 5: Run all prefixes and the Stock suite** — expected PASS.
- [ ] **Step 6: Commit** `Stock upload creates new pieces and sets retail prices`.

---

## Going live (controller only, each on Alex's go)

Per release: apply the release's migrations in order, run `db/checks/reg_parity.sql` (Release 1), deploy `stock-api` (Releases 2 and 3), check `{"action":"health"}`, check Codex on the PR, squash-merge. After Release 1 is merged, refresh `db/schema.sql` and `db/schema.version` in the next branch.
