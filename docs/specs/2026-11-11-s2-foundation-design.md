# Sprint 2 — operational foundation: design

**Date:** 11 November 2026 · **Status:** for Alex's sign-off · **Roadmap:** `Delardi_Tech_Roadmap_v2.md`, Sprint 2
**Approach chosen:** A — a new operational layer (`ops_`) next to the catalogue; the catalogue stays the floor's display.

## 1. Goal

Give every physical piece a permanent identity and state, give every sale a ticket, and stop routine loads from destroying links — without changing any screen the floor uses today.

**Success means:**
- a full catalogue reload keeps every piece ID, colour, photo and (from now on) error-report colour;
- each piece has exactly one current state and a full history of how it got there;
- a piece that leaves stock without a sale is flagged for a person, never silently dropped;
- sales can no longer be deleted with a client;
- the ticket structure is ready for Colibri history (Sprint 3) and for our own till numbers (Sprint 5).

## 2. Decisions this design rests on

| # | Decision | Source |
|---|---|---|
| 1 | Approach A: separate `ops_` tables; catalogue untouched for the floor | Alex, 11 Nov |
| 2 | Piece missing from a stock export without a ticket → **review queue**; stays In Stock until resolved | Alex, 11 Nov |
| 3 | Changing states is one right, **manage stock**, held by **Alex only** for now; assignable to a floor employee later | Alex, 11 Nov |
| 4 | Ticket numbering: source + number per store; own format reserved now, generator built with the till | Alex, 11 Nov |
| 5 | Reserved / Booked-Out keep showing as "in stock" on the floor until Sprint 5 (they physically are) | Alex, 11 Nov |
| 6 | States: In Transit, In Stock, Reserved, Booked-Out (Marketing), Damaged, Sold | Roadmap v2 §4.1 |
| 7 | Colibri's extra states (примерка, брак, склад 2…) are all zero → not modelled | S1 report §3 |

## 3. Facts checked in the live database (11 Nov)

- `cat_variants.variant_id` and `cat_models.model_id` are **built from article + colour** (e.g. `10093-YG`) and come back identical on every load. Only the delete-and-reinsert loses links.
- 681 pieces on hand across 14 brands, 19 in transit; **no brand + serial repeats**; every piece has a colour.
- The catalogue reads pieces by colour and serial, never by row number (`catalogue/src/api/index.ts:389`).
- `crm_import_undo` deletes a batch's purchase lines **before** the clients it created, so blocking client deletes does not break undo.
- Colibri's sales export carries ticket №, date, seller, card, serial, login and payment lines on every sale (S1 report §3).

## 4. New tables

All in schema `public`, row-level security on, no policies, no rights for public roles (same as every existing table).

### 4.1 `ops_stores`
| Column | Type | Notes |
|---|---|---|
| store_id | smallint PK | `1` = first boutique |
| code | text unique | `BKH26` |
| name | text | `Delardi Boutique` |
| address | text | `Bukhara 26, Tashkent` |
| active | boolean | |
| opened_on | date | nullable |

One row is inserted.

### 4.2 `ops_pieces` — one physical piece, forever
| Column | Type | Notes |
|---|---|---|
| piece_id | uuid PK | `gen_random_uuid()`; **never reused, never deleted** |
| store_id | smallint → ops_stores | |
| brand | text | from `cat_models.brand` |
| serial | text | as in Colibri |
| article | text | latest seen |
| model_id, variant_id | text | **latest** catalogue IDs, matched by text (not a declared link, so catalogue rebuilds never touch pieces) |
| size | text | |
| state | text | check: `in_transit, in_stock, reserved, booked_out, damaged, sold, returned_to_supplier` |
| state_since | timestamptz | |
| hold_client_id | text → crm_clients | Reserved: for whom (no cascade) |
| hold_until | date | Reserved / Booked-Out: expected end |
| state_note | text | e.g. "Vogue shoot" |
| first_seen_at | timestamptz | |
| last_seen_run | bigint | last catalogue load that contained it |
| last_seen_at | timestamptz | |
| sold_line_id | uuid → ops_ticket_lines | set when Sold through a ticket |
| created_at, updated_at | timestamptz | |

**Identity rule:** unique (brand, serial) **among pieces that are not Sold / Returned**. If Colibri later reuses a sold piece's serial for a new article, a **new** piece is created and a `serial_reused` review item is raised.

`returned_to_supplier` is added as a terminal state so the review queue can record "went back to the brand". It is not a floor state.

### 4.3 `ops_piece_events` — append-only history
| Column | Type | Notes |
|---|---|---|
| event_id | bigint identity PK | |
| piece_id | uuid → ops_pieces | |
| at | timestamptz | |
| from_state, to_state | text | `from_state` null on creation |
| reason | text | `initial_load, arrived, sold, refunded, reserved, released, booked_out, returned_from_loan, damaged, repaired, returned_to_supplier, review_resolved, serial_reused` |
| ref_kind, ref_id | text | `cat_run` / `ticket_line` / `review` / `manual` + id |
| actor | text | person or `system` |
| note | text | |

A trigger refuses UPDATE and DELETE on this table.

### 4.4 `ops_review` — needs a person
| Column | Type | Notes |
|---|---|---|
| review_id | bigint identity PK | |
| piece_id | uuid → ops_pieces | |
| kind | text | `missing_from_export`, `serial_reused`, `ticket_conflict` |
| raised_at, raised_run | | |
| status | text | `open` / `resolved` / `auto_closed` |
| resolution | text | `sold`, `returned_to_supplier`, `damaged`, `booked_out`, `still_in_stock` |
| resolved_by, resolved_at, note | | |

At most one **open** item per piece and kind.

### 4.5 `ops_tickets`
| Column | Type | Notes |
|---|---|---|
| ticket_id | uuid PK | |
| store_id | smallint → ops_stores | |
| source | text | `colibri` (history and until switch-off) or `delardi` (our till) |
| ticket_no | text | Colibri: `757`; ours: `BKH26-27-000001` |
| sold_at | date | |
| seller | text | rep label, from Colibri seller via `crm_rep_aliases` |
| seller_raw | text | as exported |
| client_id | text → crm_clients | nullable; **no cascade** |
| card_no | text | as exported |
| entered_by | text | Colibri login |
| note | text | |
| fiscal_ref | text | Era receipt number; empty until reconciliation exists |
| status | text | `posted` / `void` |
| source_file, loaded_at, updated_at | | |

Unique (store_id, source, ticket_no).

### 4.6 `ops_ticket_lines`
| Column | Type | Notes |
|---|---|---|
| line_id | uuid PK | |
| ticket_id | uuid → ops_tickets (cascade) | lines belong to their ticket |
| line_no | int | unique per ticket |
| kind | text | `sale` / `refund` |
| article, item_name, size | text | |
| model_id, variant_id | text | matched like CRM purchases |
| piece_id | uuid → ops_pieces | matched by brand + serial; nullable |
| serial_raw | text | |
| qty | int | |
| price_list, price_current, discount_pct, discount_amt, net | numeric | UZS |

### 4.7 `ops_ticket_payments`
`payment_id`, `ticket_id` (cascade), `method` (`cash`, `card`, `visa`, `qr`, `transfer`, `other`), `amount`, `raw`.

## 5. Changes to existing objects

| Object | Change |
|---|---|
| `board_users` | add `can_manage_stock boolean not null default false`; set **true for Alex** |
| `crm_transactions` | foreign key to `crm_clients`: `ON DELETE CASCADE` → **`ON DELETE RESTRICT`**; add `ticket_line_id uuid → ops_ticket_lines ON DELETE SET NULL` |
| `cat_load()` | **colours updated in place** (insert … on conflict update); colours absent from the file are deleted only if they also have no pieces, reports or overlay values; at the end calls `ops_sync_pieces(run_id)` |
| `cat_load()` counts | adds `models_removed`, `photos_unlinked` so a load that would drop models is visible in its report |

**Not changed:** catalogue, CRM and Board screens and APIs; the Colibri upload template; the CRM import.

## 6. Functions

All `SECURITY DEFINER`, fixed search path, executable by the server role only.

| Function | Does |
|---|---|
| `ops_has_right(actor, right)` | true if an active `board_users` row with that name has the right |
| `ops_sync_pieces(run_id)` → counts | see §7 |
| `ops_set_state(piece, state, actor, note, client, until)` | manual change; checks **manage stock**; allowed: In Stock ↔ Reserved / Booked-Out / Damaged, Damaged → Returned to supplier; never to or from Sold (tickets only); writes one event |
| `ops_resolve_review(review, resolution, actor, note)` | checks **manage stock**; applies the state, closes the item, writes the event |
| `ops_initial_fill(actor)` | one-off: today's pieces → In Stock, in-transit → In Transit, event `initial_load`; refuses to run twice |

The ticket loader (`ops_ticket_load`) is designed here and built in Sprint 3: it adds or updates tickets by (store, source, ticket №), marks pieces Sold from serials, handles refunds, links CRM purchase lines, and auto-closes matching review items.

## 7. Stock sync after every catalogue load

```
for each piece in this load (cat_pieces + cat_incoming), by brand + serial:
  no live ops_piece            → create; In Stock (or In Transit); event "arrived"/"initial_load"
  live piece, In Transit, now in stock → In Stock; event "arrived"
  live piece, any state        → refresh model/colour/size/article, last_seen_run
  an open missing_from_export review exists → auto-close it
for each live piece In Stock / Reserved / Booked-Out / Damaged not in this load:
  has a ticket line with its serial → (Sold already, nothing)
  otherwise → raise missing_from_export (once); state unchanged
```

Re-running the same load changes nothing (idempotent). Returns counts: arrived, still in transit, refreshed, review raised, review auto-closed.

## 8. Rights and audit

- **Manage stock:** Alex only. A floor employee is added by switching the flag; no rebuild.
- The rule is enforced **inside the database functions**, not only in a screen.
- Every state change is an event with actor, time and reason; events cannot be edited or deleted.
- No new screens this sprint: Alex asks Claude to reserve, book out, mark damaged or resolve review items; Claude runs the function in Alex's name and reports back. Screens come with the till (Sprint 5).

## 9. Rollout (each step approved separately)

0. **Backup** with the documented `pg_dump`; Claude checks it.
1. **Migration 1 — new tables and functions.** Nothing existing changes.
2. **Migration 2 — protect sales.** Check that no purchase line points to a missing client; switch the rule.
3. **Migration 3 — loader.** Colours updated in place; sync step; extra counts.
4. **Initial fill.** `ops_initial_fill('Alex')`; report counts.
5. **Refresh** `db/schema.sql`; pull request with the migrations; data map updated.

**Rollback:** a script that drops the `ops_` tables and functions, restores the previous `cat_load()` definition (kept in the migration as a comment) and the old foreign key. The backup from step 0 is the last resort.

## 10. Tests (run and reported before "done")

| # | Test | Expected |
|---|---|---|
| T1 | Reload the last catalogue file | same piece IDs, colours, photos; a test error report with a colour keeps it (the 9 existing reports lost theirs before this change and cannot be restored); 0 events, 0 review items |
| T2 | Load it again | nothing changes |
| T3 | Load with one serial removed (rolled back) | 1 `missing_from_export`; state unchanged |
| T4 | Put it back (rolled back) | review auto-closes |
| T5 | Test ticket line with a serial (rolled back) | piece Sold, event linked to the line; refund line → In Stock |
| T6 | Delete a client with purchases (rolled back) | refused |
| T7 | `ops_set_state` as a user without the right | refused; with it → done, one event |
| T8 | Update or delete an event | refused |
| T9 | Health checks: board-api, crm-api, catalogue-api | 200; catalogue counts as before the change |
| T10 | Security advisor | no new warnings |

## 11. Out of scope (later sprints)

- Ticket history load and CRM link (Sprint 3).
- Arrival documents, supplier, customs, landed cost, dated prices (designed in `Item_Master_Field_List_v1.md`; built with the item master, Sprint 4).
- State, review and till screens; our ticket number generator (Sprint 5).
- Models that disappear from a load are still removed (see §12.1).

## 12. Points for Alex

1. **Models are not "marked inactive" this sprint.** Earlier I said they would be. Keeping retired models would make them show up in the catalogue unless its API also learns to hide them, which is a catalogue code change. Models only drop out when Colibri stops listing them (the load already includes sold-out models), so the loss is rare. This sprint makes it **visible** in every load report; the real fix comes with the item master in Sprint 4, when the catalogue starts reading from our own data.
2. **One extra terminal state, "Returned to supplier"**, so the review queue can record pieces that went back to the brand. It never shows on the floor.
