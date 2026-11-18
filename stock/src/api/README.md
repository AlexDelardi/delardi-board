# stock-api — the contract

The Stock page (`/stock/`) talks to the database only through this edge
function. It has the same shape as sales-api (`sales/src/api/index.ts`): the page
holds no database key, every action but `health` and `unlock` needs a session
token, and the function calls the `stk_*` read functions and two `ops_*` write
functions over PostgREST with the service key.

The repository copy is `stock/src/api/index.ts`. It reaches Supabase only by a
deploy (`verify_jwt false`, like sales-api), and the two are kept identical.

## Request and response

- `POST` with a JSON object body: `{ action, token?, … }`. `OPTIONS` answers the
  CORS preflight; any other method is `405`.
- Success is `200` with the JSON shown for each action below.
- Failure is `{ error: "<sentence>" }` with one of these statuses:

| Status | When |
|---|---|
| `400` | The request is malformed: unknown action, a missing or wrongly typed field, a `states` entry that is not one of the seven states, a price that is not a whole number of zero or more, a bad `page`, a bad date, a text over its length limit. For `set_state`: a `state` outside `in_stock, reserved, booked_out, damaged`, and a missing note for `booked_out` ("Write who has it and why.") or `damaged` ("Write what is wrong."). |
| `401` | No token, an unknown token, an expired session, or a wrong passcode at `unlock`. |
| `403` | The session is not a Stock session (a CRM, board, catalogue or Sales token), the login is no longer active, or it lacks the right the action needs. Text: "This account does not have access to Stock." (no `view`), "Your account cannot change stock." (no `manage`). |
| `404` | `piece` with an id that matches no piece: "No piece with that reference." |
| `405` | Not `POST`. |
| `409` | The database refused the request: every `raise exception` (SQLSTATE P0001) from `ops_set_state`, `ops_resolve_review` or `stk_export` comes back here with its message **verbatim** (the messages are written for the screen, e.g. `too many rows to export (5120); narrow the filters`). Includes a `resolution` the database does not allow. |
| `429` | Ten failed unlocks from one address within an hour. |
| `500` | Anything else. The body is `{ error: "Something went wrong on the server." }`; the detail goes to the function log only. |

## Sessions and rights

- `unlock` exchanges a passcode for a token valid **8 hours**. The token is an
  `editor_sessions` row with `can_use_stock = true` and every other area's flag
  false, so it opens nothing but Stock (and a CRM, board, catalogue or Sales
  token does not open Stock).
- Every call re-reads the login's rights from `board_users` (active logins
  only), so a right taken away applies at once:

| Right in the response | `board_users` column | Opens |
|---|---|---|
| `view` | `can_view_stock` | `facets`, `list`, `piece`, `reviews`, `export`. A login without it gets `403` at `unlock` and on every call. |
| `manage` | `can_manage_stock` | `set_state`, `resolve` (the database checks `manage_stock` again) |
| `crm` | `can_view_crm` | A held piece's client **name** (`client_name` in `piece` / `set_state`). Without it the page has `hold_client_id` only. |

- `rights` is always `{ view, manage, crm, cost }`, all booleans. `cost` is the separate view-cost right.
- `ping` needs a valid Stock session whose login still has `view`.
- The actor recorded on state changes and review resolutions is the login's name
  (`board_users.name`). The page never sends it.

## Never returned

Cost, purchase price, landed price and margin are never selected or returned.
`price_uzs` is the retail price only.

## Filters (`list`, `export`)

`filters` is an object; every key is optional and unknown keys are ignored.

| Key | Type | Rule |
|---|---|---|
| `q` | string | at most 80 characters; the database matches each word |
| `states` | array of strings | each one of `in_transit`, `in_stock`, `reserved`, `booked_out`, `damaged`, `sold`, `not_received`; empty or absent = all states |
| `brand` | string | at most 80 characters |
| `category` | string | at most 80 characters |
| `price_min`, `price_max` | integer or `null` | whole so'm, zero or more |
| `page` | integer | 1 or more, at most 100000 (`list` only; `export` ignores it) |

## Actions

### `health` — no token
→ `{ ok: true }`

### `unlock {passcode}` — no token
Rate limited as sales-api: every attempt writes `auth_attempts`; 10 failures
from one IP in an hour → `429`. Wrong passcode → `401`; a login without `view` → `403`.
→ `{ token, name, expires_at, rights: {view, manage, crm, cost} }`

### `ping {token}` — any Stock session (login must still have `view`)
→ `{ ok: true, name, rights }`

### `facets {token}` — view
→ `{ brands: [string], categories: [string] }`, each sorted.

### `list {token, filters?}` — view
50 rows a page, ordered brand, article, serial.
→
```
{ count,                       // pieces matching the filters (states included)
  page, page_size: 50,
  rows: [ { piece_id, serial, barcode, brand, article, collection, model_name, colour,
            size, category, state, state_since, price_uzs } ],   // price_uzs: integer or null (unpriced)
  totals: [ { state, pieces, value, unpriced } ] }   // by state over the filtered set, ignoring `states` and `page`; sorted by state
```

### `piece {token, piece_id}` — view
→
```
{ piece: { …the list row…, hold_client_id, hold_until, state_note, shipped_on, first_seen_at },
  model: { metal_keys: [], stone_keys: [], gender, subcategory },
  client_name,          // only with the crm right; absent otherwise
  events: [ { at, from_state, to_state, reason, ref_kind, ref_id, actor, note, ticket_id, ticket_no } ],   // newest first
  reviews: [ { review_id, kind, status, raised_at, resolution, resolved_by, resolved_at, note } ],
  sales: [ { ticket_id, ticket_no, source, sold_at, kind, net, status } ] }   // training tickets included, marked by source
```
Unknown piece → `404`. `client_name` may be `null` for a crm login when no client is held.

### `set_state {token, piece_id, state, note?, client_id?, until?}` — manage
- `state`: `in_stock`, `reserved`, `booked_out` or `damaged`, else `400`.
- `note`: at most 500 characters. **Required** for `booked_out` ("Write who has it and why.") and `damaged` ("Write what is wrong."), else `400`. Optional for `reserved` and `in_stock`.
- `client_id`: at most 20 characters (`DLD-…`); used only for `reserved` and `booked_out`, ignored (sent as null) otherwise. It is trimmed and upper-cased, then looked up in `crm_clients`; no such client → `409` "No client with that reference." (the database would otherwise fail on the foreign key). Stored upper-case.
- `until`: a real `YYYY-MM-DD` date or null; used only for `reserved` and `booked_out`.

Calls `ops_set_state(piece, state, <login name>, note, client_id, until)`. Its
refusals (a piece that cannot move to that state, …) → `409`
verbatim.
→ the fresh detail, exactly as `piece` returns it (same `client_name` rule).

### `origin {token, piece_id}` — view
Where the piece came from and how it is identified. Unknown piece → `404`. Without the `cost` right the
Colibri record comes without its purchase-price columns (`Цена оригинального инвойса`, `Инв. цена, долл`,
`Коэф-т 1`, `Коэф-т 2`, `Цена в СФ`).
→
```
{ colibri: { data: { "<Colibri heading>": value, … }, source_file, loaded_at } | null,   // the piece as Colibri has it
  receipt: { supplier, contract, invoice_no, invoice_date, currency, arrival_date, customs_decl, source_file } | null,
  codes: [ { code, kind, active, added_at, retired_at } ],   // kind: colibri | era | brand | delardi; active first
  details: { category, subcategory, metal, … } | null,       // our own columns of the upload file
  hs_code, ikpu }                                            // per model; null = not known yet
```

### `cost {token, piece_id}` — cost
The only action that returns cost or margin. Without the `cost` right → `403`
"Your account cannot see cost.". Unknown piece → `404`.
→
```
{ match_quality,              // exact | estimated | tbd (no cost recorded: the cost fields are null)
  source_file, invoice_price, currency, fx_rate, invoice_uzs,
  customs_vat_uzs, clearance_uzs, assay_uzs, customs_fee_uzs, other_uzs, landed_uzs,
  shelf_price_uzs, vat_pct, net_price_uzs,      // shelf price, the VAT share inside it, the price without VAT
  margin_uzs, margin_pct }                      // net price − landed cost; null while either is unknown
```

### `import {token, file_name, rows, apply}` — manage
The upload file for new arrivals. `rows`: `[{ row, colibri: { "<Colibri heading>": value }, extra: { hs_code, ikpu,
supplier, contract, invoice_no, invoice_date, currency, arrival_date, customs_decl, brand_barcode, category, subcategory,
metal, metal_purity, metal_weight_g, stones, certificate_no, name_uz, store } }]`, at most 2 000. Empty and `TBD` mean
"not known"; dates are `YYYY-MM-DD`. Without `apply: true` nothing is written (preview). With it, the rows are loaded —
unless any row is in error: then `409` and nothing is loaded.
→
```
{ applied, file_name, waiting,                       // waiting: rows on file whose piece is not in stock yet
  summary: { rows, update, same, pending, error },
  rows: [ { row, brand, serial, article, status,     // update | same | pending | error
            piece_id,                                // update, same
            changes: { colibri_new, colibri_changed, details, receipt: "new" | "fill" | "link" | null, brand_code, hs_code, ikpu },
            warnings: [ { code, field?, on_file? } ],  // hs_differs | ikpu_differs | receipt_differs | no_model: the value on file is kept
            errors:   [ { code, field?, on_file? } ] } ] }   // no_brand | no_serial | no_article | bad_hs | bad_ikpu | bad_date |
                                                             // serial_repeated | serial_ambiguous | serial_other_reference
```

### `import_pending {token, check_only?}` — manage
Applies waiting rows whose piece has arrived (not with `check_only: true`).
→ `{ applied, waiting, rows: [ { brand_key, serial_key, brand, serial, article, file_name, actor, created_at } ] }` (oldest first, at most 500)

### `import_remove {token, brand_key, serial_key}` — manage
Takes one waiting row off the list (a row loaded by mistake). Nothing in stock changes. → `{ removed, waiting, rows }`

### `reviews {token}` — view
Open review items, oldest first.
→ `[ { review_id, kind, raised_at, note, piece: { piece_id, serial, brand, article, model_name, state } } ]`

### `resolve {token, review_id, resolution, note?}` — manage
`review_id` a positive integer; `resolution` a string of at most 40 characters,
checked by the database against its allowed set (a bad one → `409`); `note` at
most 500 characters. Calls `ops_resolve_review(review, resolution, <login name>, note)`.
→ `{ ok: true }`

### `export {token, filters?}` — view
The rows `list` would return for the same filters, every page and every state
the filter allows, at most 5 000. More → `409` `too many rows to export (N); narrow the filters`.
→ `{ rows: [ …the list row shape… ] }`

## Training mode (`train_*`)

The same screens on a fixed set of made-up pieces in two made-up stores (`TRN-A`, `TRN-B`), kept in
tables of their own (`stk_train_*`, migration `20261118_stk_8_training.sql`). No `train_*` action reads or
writes a real piece, and no other action returns a training piece. Refusals from the database come back as
`409` with the sentence verbatim.

### `train_facets {token}` — view
→ `{ brands: [text], categories: [text], stores: [ { code, name } ] }`

### `train_list {token, filters?}` — view
Filters as `list`, plus `store` (a store code); `states` from `in_stock, reserved, booked_out, damaged,
in_transfer`. → the shape of `list`; each row also has `store`, `store_code` and `to_store` (set while in
transfer). A piece in transfer is listed under the store it left until it is received.

### `train_piece {token, piece_id}` — view
→ the shape of `piece`; `piece` also has `store`, `store_code`, `to_store`; events have `from_store` and
`to_store` on transfer steps; `reviews` and `sales` are always empty.

### `train_set_state {token, piece_id, state, note?, client_id?, until?}` — manage
The rules and checks of `set_state`, on a training piece. → the piece as `train_piece`.

### `train_send {token, piece_id, to_store, note?}` — manage
A piece in stock goes `in_transfer` to another store (`to_store` is its code). → the piece.
`409`: `Only a piece that is in stock can be sent to another store.` · `The piece is already in that store.` ·
`No store with that code.`

### `train_receive {token, piece_id, note?}` · `train_cancel {token, piece_id, note?}` — manage
Receive: the piece is in stock in the store it was sent to. Cancel: in stock again in the store it left.
→ the piece. `409`: `This piece is not in transfer.`

### `train_reset {token}` — manage
Every training piece back to how it started (same piece references), history cleared. → `{ pieces }`

## Table tools: sort and column checklists

`filters` (for `list`, `export`, `train_list`) also takes:
- `sort`: `"<column>.<asc|desc>"`, column one of `serial, brand, article, state, since, price` (`train_list` also `store`).
  Left out, the order is brand, reference, serial. Pieces without the sorted value come last either way. Bad value → `400`.
- `brands`: a list of brands (several at once; the single `brand` still works). `train_list` also `stores`, a list of store codes.

### `facet {token, filters?, column}` — view · `train_facet` likewise
`column` one of `brand`, `state` (`train_facet` also `store`). The values of that column among the pieces the other
filters leave (the column's own filter is left out), with a count each.
→ `{ column, values: [ { value, count, label? } ] }` (`label` for stores: the store's name)
