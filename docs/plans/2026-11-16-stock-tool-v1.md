# Stock tool v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new back-office tool `stock/`: list every piece with filters and totals, a piece panel with its full history, state changes through the existing rights-checked functions, the review queue, and an `.xlsx` export — on the shared kit.

**Architecture:** Same pattern as the Sales till:
- One self-contained page (`stock/index.html`, built by `stock/src/build.py`, with `ui/kit.css`, `ui/tools.js` and a new shared `ui/xlsx.js` inlined).
- One edge function, `stock-api` (`stock/src/api/index.ts`), with a passcode session that opens Stock only and rights re-read on every call.
- New read functions `stk_*`. Writes go through the existing `ops_set_state` and `ops_resolve_review`, which check the manage-stock right themselves.
- The page is tested against an in-memory mock of `stock-api` with Playwright.

**Tech Stack:** Postgres 16 (local test DB) / 17 (production), plpgsql; Deno edge function (TypeScript); plain browser JS + CSS; Python 3 build; Node 22 + Playwright checks.

**Spec:** `docs/specs/2026-11-16-stock-tool-v1-design.md`

## Global Constraints

- **Production:** never touch it. No migration applied, no deploy, no push to main. Local test DB only: `db/dev/local_db.sh start`, then `db/dev/run_sql_tests.sh <pattern>`.
- **Public repo:** invented data only — serials `ZZ.00.xxxxx`, client references `DLD-9xxx`, brands and models invented or generic.
- **Cost:**
  - no column named or meaning cost, purchase price, landed price or margin is ever selected by `stk_*` or `stock-api`;
  - the retail price is the latest `cat_pieces.price_uzs` for the piece's `variant_id` and serial (`upper(btrim(serial))`), exactly as `pos_search_pieces` does.
- **Database functions:**
  - `security definer set search_path = public, pg_temp`;
  - `revoke execute … from public, anon, authenticated` after each one;
  - `db/dev/snapshot_fixup.sql` also revokes `stk\_%` functions.
- **Writes:**
  - only `ops_set_state(p_piece, p_state, p_actor, p_note, p_client, p_until)` and `ops_resolve_review(p_review, p_resolution, p_actor, p_note)`, unchanged;
  - their exceptions (SQLSTATE P0001) go to the page as 409 with the message verbatim.
- **Rights:**
  - new `board_users.can_view_stock` (default false, true for `name = 'Alex'`);
  - existing `can_manage_stock`;
  - new `editor_sessions.can_use_stock`;
  - `ops_has_right` gains `'view_stock'`;
  - client names on held pieces only with `can_view_crm`, otherwise the client reference.
- **Page:**
  - only `ui/kit.css` tokens and classes, palette only, radius 0, no shadows;
  - `translate="no"` on `<html>` and the google notranslate meta;
  - EN/RU on every string (an `RU` table as in the till);
  - dates `16 Nov 2026` / `16 ноя 2026` on screen (Tashkent time zone);
  - money `31 500 000 so'm` (RU `сум`);
  - idle lock after 15 minutes as the till;
  - no request but `stock-api`.
- **State tags (G1):**

  | State | Tag |
  |---|---|
  | `in_stock` | `.tag.act` |
  | `reserved`, `booked_out` | `.tag.line` |
  | `in_transit` | `.tag.info` |
  | `damaged`, `not_received` | `.tag.alert` |
  | `sold` | `.tag.done` |

  State words EN/RU: In stock / В наличии · Reserved / Резерв · Booked out / Выдано · In transit / В пути · Damaged / Повреждено · Not received / Не получено · Sold / Продано.
- **Notes:**
  - Book out and Damaged require a note: the page refuses an empty one ("Write who has it and why." / "Write what is wrong."), and so does `stock-api` (400);
  - Reserve and Back in stock take an optional note.
- **Commits:** `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, message ending with the two lines `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T7Uo2rwXkRSCU6pgcooH5o`. Rebuild and commit `stock/index.html` (and `sales/index.html` when `ui/` changes) with the source.

## Review Focus

1. **Rights at every layer:** without manage stock, the page shows no change buttons, `stock-api` answers 403, and the database refuses too. A session from another tool (Sales/CRM) is 403 at `stock-api`.
2. **Concurrent change:** if the piece moved meanwhile (e.g. sold at the till), the change is refused with the database's sentence and the panel reloads to the true state; nothing is half-written.
3. **Russian and iPad portrait:** every new label has RU; the list table and the 560 px panel work at 768×1024 without sideways scroll; long model names wrap.
4. **Pieces without a price or catalogue model:** the list shows "—", totals count them as unpriced, and the panel still opens.
5. **Locking:** lock while the panel, a change form or the confirm dialog is open removes them all and the screen behind is inert (the till's rules).

---

### Task 1: Database — rights, read functions, local tests

**Files:**
- Create: `db/migrations/20261116_stk_1_stock_read.sql`, `db/tests/stk_t1_read.sql`
- Modify: `db/dev/snapshot_fixup.sql` (revoke `stk\_%`)

**Interfaces — Produces** (all `returns jsonb`, security definer, revoked):
- `stk_piece_list(p jsonb)`:
  - **Filters** (all optional): `q` (words, each matching serial, barcode, reference, brand, collection or model name, case-insensitive, literal — `%` and `_` escaped as in `pos_search_pieces`), `states` (text array), `brand`, `category` (`cat_models.retail_category`), `price_min`, `price_max`, `page` (1-based, 50 per page).
  - **Returns** `{count, page, page_size: 50, rows: [...], totals: [{state, pieces, value, unpriced}]}`.
  - **Each row:** `{piece_id, serial, barcode, brand, article, collection, model_name, colour, size, category, state, state_since, price_uzs}`.
  - **Order:** `brand, coalesce(o.article, m.article) nulls last, serial`.
  - **Totals:** over the whole filtered set ignoring `page` and ignoring `states`, so the cards show every state.
- `stk_piece_detail(p_piece uuid)` → `{piece:{…row fields…, hold_client_id, hold_until, state_note, shipped_on, first_seen_at}, model:{metal_keys, stone_keys, gender, subcategory}, client_name, events:[{at, from_state, to_state, reason, ref_kind, ref_id, actor, note, ticket_id, ticket_no}], reviews:[{review_id, kind, status, raised_at, resolution, resolved_by, resolved_at, note}], sales:[{ticket_id, ticket_no, source, sold_at, kind, net, status}]}`.
  - `client_name` comes from `crm_queue.display_name` (the API strips it without the CRM right).
  - Events are newest first. `ticket_id`/`ticket_no` are filled when `ref_kind = 'ticket_line'`.
  - Returns `null` for an unknown piece.
- `stk_review_list()` → open items, oldest first: `[{review_id, kind, raised_at, note, piece:{piece_id, serial, brand, article, model_name, state}}]`.
- `stk_facets()` → `{brands: [text], categories: [text]}`: distinct values present on pieces, sorted.
- `stk_export(p jsonb)` → the rows of `stk_piece_list` for the same filters, all pages, at most 5 000. Raises `too many rows to export (N); narrow the filters` above that.
- `ops_has_right(actor, 'view_stock')` → `can_view_stock`.

- [ ] **Step 1: Write `db/tests/stk_t1_read.sql`** (rolled back; invented fixtures via `cat_load` like `db/tests/pos_t7_search_receipt.sql`; ends with `select 'stk_t1 ok' as result;`). Asserts:
  - list count and order;
  - `q` across serial, reference and model name, and literal `%`;
  - `states` filter;
  - brand and category filters;
  - the price range;
  - paging (51 pieces → page 2 has 1);
  - totals by state ignore `states` and `page`;
  - an unpriced piece counts in `unpriced` and adds 0 to `value`;
  - detail has events newest first, a sold piece's sale with ticket_no, and an open review;
  - unknown piece → null;
  - review list oldest first;
  - facets;
  - export returns all filtered rows;
  - `ops_has_right('<alex>', 'view_stock')`;
  - `has_function_privilege('anon', …)` is false for each `stk_` function.
- [ ] **Step 2: Run** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh stk_` — Expected: FAIL (functions missing).
- [ ] **Step 3: Write the migration.** It holds the columns and the `ops_has_right` replacement (keep `'manage_stock'`, add `'view_stock'`), plus the five functions.
- [ ] **Step 4: Run** `db/dev/local_db.sh start && db/dev/run_sql_tests.sh stk_ && db/dev/run_sql_tests.sh pos_t && db/dev/run_sql_tests.sh s2_` — Expected: all PASS.
- [ ] **Step 5: Commit** ("Stock 1: view-stock right and stk_* read functions").

### Task 2: `stock-api` edge function and its contract

**Files:**
- Create: `stock/src/api/index.ts`, `stock/src/api/README.md`
- Modify: `db/README.md` (list `stock-api`)

**Interfaces:**
- **Consumes:** Task 1 functions; `ops_set_state`, `ops_resolve_review`.
- **Produces** (the contract the page and the mock follow). `POST {action, token?, …}`, with errors as in `sales/src/api/README.md` (400/401/403/404/405/409/429/500, 409 = database message verbatim):
  - `health` → `{ok}`.
  - `unlock {passcode}` → `{token, name, expires_at, rights:{view, manage, crm}}`. This needs `can_view_stock`, else 403 "This account does not have access to Stock." The session row has `can_use_stock = true` and every other area flag false; the same failed-attempt limit (10/hour/IP).
  - `ping` → `{ok, name, rights}`.
  - `facets` (view) → `stk_facets()`.
  - `list {filters}` (view) → `stk_piece_list`. Validate `states` ⊂ the 7 states, prices as non-negative integers, `page` a positive integer.
  - `piece {piece_id}` (view) → `stk_piece_detail`. 404 if null. Drop `client_name` without crm.
  - `set_state {piece_id, state, note?, client_id?, until?}` (manage) → calls `ops_set_state(..., p_actor := session name)`, then returns the fresh `stk_piece_detail`.
    - `state` must be one of `in_stock, reserved, booked_out, damaged`.
    - The note is required for `booked_out` and `damaged` (400 "Write who has it and why." / "Write what is wrong.").
    - `until` is a real YYYY-MM-DD date.
    - `client_id` is at most 20 characters.
  - `reviews` (view) → `stk_review_list()`.
  - `resolve {review_id, resolution, note?}` (manage) → `ops_resolve_review`, then `{ok}`.
  - `export {filters}` (view) → `{rows}` from `stk_export`.
- **Rights**, from `board_users`: view = `can_view_stock`, manage = `can_manage_stock`, crm = `can_view_crm`.

- [ ] **Step 1:** Write `stock/src/api/README.md` (the contract above, in the till's format).
- [ ] **Step 2:** Write `stock/src/api/index.ts` following `sales/src/api/index.ts`: the same helpers (`db`, `select`, `insert`, `rpc` with P0001 → 409, `str`, `uuid`, `posInt`, `dateOrNull`, `obj`, `pick`), session code, CORS and serve loop. No cost columns anywhere.
- [ ] **Step 3: Verify** with `npx -y esbuild stock/src/api/index.ts --format=esm --loader:.ts=ts > /dev/null` — Expected: parses. Also `grep -niE "cost|landed|margin|purchase" stock/src/api/index.ts` — Expected: no hits except comments saying cost is never read.
- [ ] **Step 4: Commit** ("Stock 2: stock-api edge function and contract").

### Task 3: Page shell, list and totals (+ Stock in the Tools switcher)

**Files:**
- Create:
  - `stock/src/build.py`, `stock/src/template.html`, `stock/src/app.js`, `stock/src/list.js`;
  - `stock/src/qa/mock.js` (in-memory `stock-api` following Task 2's contract, ~60 invented pieces across every state, 2 brands without price, 1 with a 60-char model name), `stock/src/qa/test.js`;
  - `stock/index.html` (built), `stock/src/README.md`.
- Modify:
  - `ui/tools.js`: add `{ id: "stock", href: "../stock/", en: "Stock", ru: "Склад" }` after sales;
  - `qa/kit.cjs`: 5 tools; `KIT_PAGES` adds `stock/index.html`;
  - `qa/check-builds.py`: add `'stock'`;
  - `sales/src/qa/test.js`: re-point the "4 tools" check to 5 including Stock;
  - rebuild `sales/index.html`.

**Interfaces:**
- **Consumes:** kit classes and `kitToolsMenu`, `kitCloseMenus`, `kitGuardLink` (see `ui/README.md`); the till's app.js patterns (copy what is needed, don't import across tools):
  - `el`, `tr`, `RU`, `LANG`;
  - `fmtDate`, `fmtUZS`, `api`, `toast`, `confirmBox`, `modal`;
  - the gate/lock (`renderGate`, `lockDown`, idle lock, `#app` inert);
  - `langSwitch`.
- **Produces:**
  - `S` state;
  - `renderList(main)`;
  - `stateTag(state) → HTMLElement`;
  - `STATE_WORDS`;
  - `openPiece(id)` (stub in this task, filled in Task 4);
  - the routes `#/pieces` (default) and `#/review` (Task 5).

- [ ] **Step 1: Failing checks in `stock/src/qa/test.js`** (same harness style as `sales/src/qa/test.js`):
  - the gate unlocks with the mock passcode;
  - the header has wordmark, "Stock", Tools (5 tools, Stock current), EN/RU, name, Lock;
  - tabs Pieces / Review;
  - the list shows 50 rows and page 2 the rest;
  - the totals cards show each state's pieces and value, and clicking a card filters by it;
  - search by serial finds one piece;
  - the brand / category / price filters;
  - unpriced shows "—";
  - a 60-char model wraps without sideways scroll at 1024×768 and 768×1024;
  - RU labels;
  - `node ../../qa/kit.cjs` passes on `stock/index.html`;
  - no requests but `stock-api`;
  - `translate="no"`;
  - no script errors.
- [ ] **Step 2: Run** `cd stock/src && python3 build.py && node qa/test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the shell, list and totals.
- [ ] **Step 4: Run** the stock suite, `cd ../../sales/src && python3 build.py && node qa/test.js`, `node qa/kit.cjs` and `python3 qa/check-builds.py` from the root — Expected: all pass.
- [ ] **Step 5: Commit** ("Stock 3: page shell, list and totals; Stock in the Tools switcher").

### Task 4: Piece panel and state changes

**Files:** Create `stock/src/piece.js`. Modify `stock/src/app.js` (lockDown removes the panel), `stock/src/template.html`, `stock/src/qa/mock.js`, `stock/src/qa/test.js`; rebuild.

**Interfaces:**
- **Consumes:** `piece` and `set_state` from Task 2; `stateTag`.
- **Produces:** `openPiece(id)`, `closePiece()`.

- [ ] **Step 1: Failing checks:**
  - **Panel layout:**
    - row click opens the 560 px right panel (full width under 600 px);
    - the title is "Brand · Model" in Palatino;
    - the facts include serial, barcode, reference and price;
    - the history shows events newest first with actor and reason words, and a sold piece links to `../sales/#/ticket/<id>`.
  - **Rights:**
    - without manage there are no change buttons;
    - with manage, an in-stock piece offers Reserve / Book out / Damaged;
    - a reserved piece offers Back in stock.
  - **Changes:**
    - Book out with an empty note is refused on the page;
    - a confirmed Reserve with client DLD-9001 and an until-date updates the panel, the row tag and the totals;
    - a 409 from the mock (the piece was sold meanwhile) shows the sentence and reloads the panel to Sold.
  - **Locking:** lock with the panel or form open → gone, and `#app` inert.
  - **Display:** client name shown with crm, the reference without; RU; no sideways scroll at 768×1024.
- [ ] **Step 2: Run** — Expected: new checks FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the stock suite and `qa/kit.cjs` — Expected: all pass.
- [ ] **Step 5: Commit** ("Stock 4: piece panel and state changes").

### Task 5: Review queue

**Files:** Create `stock/src/review.js`. Modify `stock/src/app.js` (tab count), `stock/src/qa/mock.js` (5 open items, one of each kind), `stock/src/qa/test.js`; rebuild.

**Interfaces:** Consumes `reviews` and `resolve`. The answers per kind are `ops_resolve_review`'s:
- `missing_from_export`, `serial_reused`, `ticket_conflict` → sold, damaged, booked_out, still_in_stock;
- `overdue_in_transit`, `dropped_from_incoming` → still_in_transit, not_delivered.

EN/RU words for each kind and answer.

- [ ] **Step 1: Failing checks:**
  - the Review tab shows the count of open items;
  - the table lists the kind, piece and raised date;
  - each row offers exactly its kind's answers (manage only);
  - resolving with a note removes the row and the count drops;
  - a 409 shows the sentence and keeps the row;
  - clicking the piece opens the panel;
  - RU;
  - 768×1024 without sideways scroll.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** ("Stock 5: review queue").

### Task 6: Export to .xlsx via a shared kit writer

**Files:**
- Create `ui/xlsx.js`: the generic workbook writer, taken from `crm/src/xlsx.js` (`crc32`, `zipStore`, xml escaping, `colRef`, date cells).
  - It exposes `kitXlsx(sheetName, columns, rows) → Blob`, where `columns = [{title, key, type: "text"|"number"|"date"}]`.
  - It has no CRM words and no dependency on a tool's `tr`.
- Modify `stock/src/build.py` (inline `ui/xlsx.js`), `stock/src/list.js` (Download .xlsx), `stock/src/qa/test.js`, `ui/README.md`. Leave `crm/src/xlsx.js` unchanged (the CRM moves later).

- [ ] **Step 1: Failing checks:**
  - "Download .xlsx" produces a file named `Delardi_stock_<YYYY-MM-DD>.xlsx`;
  - parsed in the test with Node's zlib-free reading (stored ZIP: find `xl/worksheets/sheet1.xml`), it holds a header row and one row per filtered piece;
  - prices are numeric cells;
  - there is no cost column;
  - RU headers when the screen is RU.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the stock suite, `qa/kit.cjs` and check-builds — Expected: pass.
- [ ] **Step 5: Commit** ("Stock 6: export to .xlsx through ui/xlsx.js").

### Task 7: Screens, docs, roadmap note

**Files:** Modify `stock/src/qa/test.js` (SHOTS), `stock/src/README.md`, `ui/README.md`, `README.md` (root: list the Stock tool if tools are listed there).

- [ ] **Step 1:** With `SHOTS` set, save these screenshots:
  - at 1024×768: `s01-list.png`, `s02-piece.png`, `s03-change.png`, `s04-review.png`, `s05-lock.png`;
  - at 768×1024: `s06-list-portrait.png`, `s07-piece-portrait.png`.

  The per-screen "no sideways scroll" checks always run.
- [ ] **Step 2: Run** `SHOTS=/tmp/stock-shots node qa/test.js` — Expected: all pass, PNGs written.
- [ ] **Step 3:** Update the docs, including the going-live steps from the spec.
- [ ] **Step 4: Run** every suite: stock, sales, `qa/kit.cjs`, `qa/check-builds.py`, and the DB tests `stk_`, `pos_t`, `s2_` — Expected: all pass.
- [ ] **Step 5: Commit** ("Stock 7: screen checks, docs").
