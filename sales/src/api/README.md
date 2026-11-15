# sales-api — the contract

The Sales page (`/sales/`) talks to the database only through this edge
function. It has the same shape as crm-api (`crm/src/api/index.ts`): the page
holds no database key, every action but `health` and `unlock` needs a session
token, and the function calls the `pos_*` database functions over PostgREST with
the service key.

The repository copy is `sales/src/api/index.ts`. It reaches Supabase only by a
deploy (`verify_jwt false`, like crm-api), and the two are kept identical.

## Request and response

- `POST` with a JSON object body: `{ action, token?, … }`. `OPTIONS` answers the
  CORS preflight; any other method is `405`.
- Success is `200` with the JSON shown for each action below.
- Failure is `{ error: "<sentence>" }` with one of these statuses:

| Status | When |
|---|---|
| `400` | The request is malformed: unknown action, a missing or wrongly typed field, a bad date, a seller label that is no rep's label in a ticket filter. |
| `401` | No token, an unknown token, an expired session, or a wrong passcode at `unlock`. |
| `403` | The session is not a Sales session, the login is no longer active, or it lacks the right the action needs. |
| `404` | `ticket` / `ticket_by_line` with an id that matches nothing. |
| `405` | Not `POST`. |
| `409` | The database refused the request: every `raise exception` from a `pos_*` function comes back here with its message **verbatim** (the messages are written for the screen, e.g. `piece ZZ.00.30001 is not in stock`, `payments 29925000 do not match total 29925001`, `another sale is suspended`, `already void`). Also: a suspended sale that is not in the current mode, and asking for test tickets while the till is Live. |
| `429` | Ten failed unlocks from one address within an hour. |
| `500` | Anything else. The body is `{ error: "Something went wrong on the server." }`; the detail goes to the function log only. |

## Sessions and rights

- `unlock` exchanges a passcode for a token valid **8 hours**. The token is an
  `editor_sessions` row with `can_use_sales = true` and every other area's flag
  false, so it opens nothing but Sales (and a CRM or board token does not open Sales).
- Every call re-reads the login's rights from `board_users` (active logins
  only), so a right taken away applies at once:

| Right in the response | `board_users` column | Opens |
|---|---|---|
| `view` | `can_view_sales` | `tickets`, `ticket`, `ticket_by_line` |
| `post` | `can_post_sales` | `search`, `post`, `suspend`, `drafts`, `cancel_draft` |
| `void` | `can_void_sales` | `void` |
| `manage` | `can_manage_till` | `set_mode`, `clear_training` |

- A Sales session needs at least `view` or `post`; `ping` and `reference` need only a valid Sales session.
- `rights` is always `{ view, post, void, manage }`, all booleans.
- The actor recorded on posts, suspends, voids, cancels and mode changes is the
  login's name (`board_users.name`). The page never sends it.

## Seller names

- Sellers go **in** as `crm_sales_reps.label` and come **out** as a label. Colibri
  source names never reach the page, and neither does `seller_raw`.
- `post` / `suspend` pass labels straight to the database, which maps them (a
  label must match exactly one current rep, or the refusal is a `409`).
- In a ticket filter, the label is mapped here to the rep it names; a label
  that is no rep's is a `400`.
- Every outgoing seller is a label; a seller that is no rep is `"Unassigned"`;
  an empty seller stays `null`.
- `entered_by`, `voided_by` and `created_by` show a rep's label when that
  login name is a rep, and the login name otherwise.

## Never returned

Cost, invoice, landed-price or margin columns are never selected. Ticket detail
never carries `seller_raw`, `card_no`, `source_file` or a line's raw `extra`.

## Actions

### `health` — no token
→ `{ ok: true }`

### `unlock {passcode}` — no token
Rate limited as crm-api: every attempt writes `auth_attempts`; 10 failures
from one IP in an hour → `429`. Wrong passcode → `401`; a login with neither
`view` nor `post` → `403`.
→ `{ token, name, expires_at, rights: {view, post, void, manage} }`

### `ping {token}` — any Sales session
→ `{ ok: true, name, rights, mode }` — `mode` is `"training"` or `"live"`.

### `reference {token}` — any Sales session
→ `{ mode, go_live_date, vat_pct, cash_notice_uzs, shop_address, sellers, rights }`
- `go_live_date`: `"YYYY-MM-DD"` or `null` (set the first time the till goes Live).
- `vat_pct`: number (0); `cash_notice_uzs`: number (170000000).
- `sellers`: the labels of the current reps, sorted, each once.

### `search {token, q}` — post
Looks the text up in the current mode (`pos_search_pieces(q, mode)`): an exact
barcode, else an exact serial, else every word literally in serial, article,
brand, collection or model name. At most 20, sellable first. Empty `q` → no pieces.
→ `{ mode, pieces: [ { piece_id, serial, barcode, brand, article, collection,
model_name, colour, size, metal_keys: [], stone_keys: [], price_uzs, state,
held: null | {draft_id}, sellable } ] }`

### `post {token, sale}` — post
`sale`:
```
{ client_id?: "DLD-…"|"PRS-…", walk_in?: bool,     // exactly one of the two
  seller: "<label>", fiscal_ref?: "<Era receipt no.>", draft_id?: int,
  lines: [ { piece_id: uuid, price_uzs: int, discount_pct?: number, seller?: "<label>" } ],   // 1–50
  payments: [ { method: "cash"|"card"|"transfer", card_type?: "uzcard"|"humo"|"visa", amount: int } ] }  // ≤ 10
```
Posted in the till's current mode, all or nothing. `draft_id` (resuming a
suspended sale) must be a suspended sale of the current mode, or `409`.
→ `{ ticket_id, ticket_no, mode, total, cash_notice }` — `ticket_no` is
`D-000001…` (live) or `T-000001…` (training); `cash_notice` is true when the
cash paid is above `cash_notice_uzs`. The receipt is read with `ticket`.

### `suspend {token, sale}` — post
Same `sale` as `post` without `payments`; client, walk-in, seller and prices may
still be empty. With `draft_id` it replaces that suspended sale's lines.
→ `{ draft_id }`

### `drafts {token}` — post
The suspended sales of the current mode, newest first.
→ `{ mode, drafts: [ { draft_id, created_by, created_at, client_id, walk_in,
seller, lines: [ { piece_id, serial, brand, model_name, price_uzs, discount_pct, seller } ] } ] }`

### `cancel_draft {token, draft_id}` — post
Only a suspended sale of the current mode; otherwise `409`.
→ `{ ok: true }`

### `tickets {token, filters}` — view
`filters` (all optional):
```
{ q, from: "YYYY-MM-DD", to: "YYYY-MM-DD", seller: "<label>",
  source: "colibri"|"delardi", status: "posted"|"void", training: bool, page: int ≥ 1 }
```
No `from` and no `to` → the last 30 days (Tashkent). `training: true` lists only
test tickets and is accepted only while the till is in training (`409` when Live).
→ `{ count, void_count, net_total, page, page_size: 50, rows: [ { ticket_id,
ticket_no, source, sold_at, status, seller, client_id, client_name, walk_in,
items, lines, net } ] }`
- `count`: every filtered ticket; `void_count`: the void ones among them;
  `net_total`: posted tickets only, refunds negative.

### `ticket {token, ticket_id}` — view
→ `{ ticket: {…}, lines: [ … ], payments: [ … ], client_name }`
- `ticket`: `ticket_id, store_id, source, ticket_no, sold_at, seller (label),
  client_id, client_raw, walk_in, entered_by, note, fiscal_ref, status,
  receipt_text, void_reason, voided_by, voided_at, loaded_at, updated_at`.
- `lines[]`: `line_id, line_no, kind, article, colour, item_name, brand_raw, size,
  model_id, variant_id, piece_id, serial_raw, qty, price_list, price_current,
  discount_pct, discount_amt, net, seller` — `seller` is the line's own seller
  label, `null` when it is the ticket's seller.
- `payments[]`: `payment_id, method, amount, raw, card_type`.
- Unknown id → `404`.

### `ticket_by_line {token, line_id}` — view
The ticket a sale line belongs to (the client panel's purchase rows).
→ `{ ticket_id }`; unknown line → `404`.

### `void {token, ticket_id, reason}` — void
Only a posted sale from this tool (`delardi` or `training`); `reason` is required.
Live: its pieces go back in stock and its CRM purchase rows are removed.
→ `{ ticket_no, pieces_returned }`

### `set_mode {token, mode}` — manage
`mode`: `"training"` or `"live"`. Logged with who and when.
→ `{ mode, go_live_date }`

### `clear_training {token}` — manage
Deletes every test ticket and every training suspended sale. Logged.
→ `{ tickets, drafts }` (how many of each were removed)
