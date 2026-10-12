# crm-api — what each version brought

The deployed function carries a short header; the full history lives here so
the file stays readable. Taken from the header as it stood at v11.

```
// Delardi CRM instrument — crm-api
//
// Same shape as board-api: this function is the only route to the data, the
// page holds no database key, and every action needs a session token issued in
// exchange for a passcode. Two differences worth knowing:
//
//   1. Unlock here checks board_users.can_view_crm, so a board passcode does
//      not open the CRM unless that person has been given CRM access.
//   2. Writing is a separate right (can_edit_crm). Reading the instrument and
//      changing a client record are not the same permission.
//
// v5 — read surface: the clients list, the client card, reference data and the
// dashboard figures. Writes arrived in v6 (see below).
//
// Sales people reach the page only as the label crm_sales_reps holds for them,
// applied here on the way out — never as the name Colibri writes. Until 12 Oct
// 2026 those labels were "Sales rep 1…8"; they are now the team's own names
// (Alex's decision), so changing a label is the only change needed to rename
// someone everywhere, and the Colibri source names still never leave the server.
//
// v3: stats are retail-only by default. Related parties (founders and their
// accounts) carry 22.8% of recorded revenue at founder discounts; left in, they
// inflate every concentration figure. Pass include_related: true to see all.
// Stats also report the orphaned book — clients whose owner is no longer an
// active sales rep.
//
// v4: phone numbers never leave the server. They are stored in crm_clients for
// matching and for the review pass, but Alex's instruction is that they are not
// shown on the instrument yet, so the card carries the phone *flag* (agreed,
// gap, conflict) and not the number. The list gains an owner_status filter:
// orphaned (owner has left), assignable (an active rep) or unassigned.
//
// v5: the owner from sales history and the owner the store has chosen are kept
// apart. crm_clients.client_owner is history (who actually sold); assigned_owner
// is the decision. Everywhere the page sees "client_owner" it now gets the
// effective owner (assignment first, history otherwise), and the history comes
// alongside as historic_owner. Every owner field is translated to its label on
// the way out, so no Colibri staff name reaches the browser by any column.
//
// v6 — the review queue writes. Every change is a Postgres function
// (crm_resolve_field, crm_set_state, crm_merge, …) that edits the record and
// appends to crm_events in one transaction; this function only validates input,
// checks the right and passes the actor's name. Rights are re-read from
// board_users on every request, so switching someone off takes effect at once
// rather than when their 8-hour session runs out. The list gains a single
// review status (decision, confirm, clean, checked, set aside, deleted,
// merged), the display name, and search by name as well as reference.
// Whoever made a change is shown by their generic label when they are also a
// sales rep in the data.
//
// v7 — insights. One read action, `insights`, returns the store's value and
// activity (ABC × lifecycle, segments, owner books), trends (acquisition by
// year, repeat buying, brand and category mix, multi-brand clients) and
// birthdays (confirmed dates only, do-not-contact left out). The figures are
// built by crm_insights() in the database, which joins the sales-rep labels
// itself, so no staff name enters this function's response. ABC, lifecycle and
// segment are recalculated nightly by crm_recompute_segments() (pg_cron,
// 00:05 Tashkent) on the retail basis. The list gains drill-down filters for
// every insight: first-purchase year, purchase occasions, brands bought, a
// brand or category, birth month and do-not-contact.
//
// v8 — data health and the monthly Colibri refresh. `data_health` returns the
// review progress (status now, a nightly snapshot trend, work per day), how
// settled each identity field is, and an attention list whose items open the
// matching records through the list's new `attention` filter. The refresh is
// staged in the database from the month's exports (by Claude, from the CRM
// source-files folder); here a third right, can_import_crm, lets its holder
// read what the refresh would do (`imports`, `import`), place the lines it
// could not (`import_decide`), and apply, discard or undo it. The review
// document carries client names, as the card does, and never a phone number:
// a changed phone is reported as changed, without either value. Seller names
// arrive already translated to their labels by the database.
//
// v9 — the floor. Two list filters for the phone and iPad page: `ids` (up to 20
// references, for the "recently opened" row: the page keeps only references on
// the device and asks here for the names each time) and `birthday_within`
// (days, 0–60: confirmed dates of birth whose next birthday falls within that
// many days in Tashkent, from crm_birthday_ids()). Neither returns anything a
// list call did not already return.
//
// v10 — Telegram. The boutique's Telegram chats (a summary of 14 Aug 2026) sit
// in crm_telegram_chats and the requests the boutique could not meet, in the
// client's own words, in crm_missed_demand. The card gains a `telegram` block:
// the chat linked to the record, chats suggested for it by name or a shared
// phone (to confirm or reject), and its missed requests with a status. Telegram
// IDs and phone numbers stay here, like every other phone: the page gets a flag
// (phone_in_telegram, has_phone) and a chat reference, never the ID or the
// number. Chats with no record become prospects with review status `lead`,
// outside the identity review; the headline totals leave them out and count
// them apart. The list gains `missed` (a kind, or any) with `missed_brand`, and
// `telegram` (only / exclude); insights carries the Telegram summary.
//
// v11 — the floor, with phone numbers. Alex's decision (22 Sept): phone numbers
// now go to every CRM session, on the card and in a Telegram chat, for tap to
// call or write; they can be searched, and a phone can be typed in or taken
// from Telegram when settling it. Telegram IDs stay on the server. New on the
// card: the contact log (every contact kept, the latest on the card and in the
// list; the one who logged it can take it back within 15 minutes), personal
// data (sizes, preferences, address, about, important dates). The list sorts
// on any column (`order_by` + `dir`), takes several values per column
// (`statuses`, `abc_classes`, `segments`, `lifecycles`, `owners`), filters on
// `not_contacted` (days), and `facets` counts each column's values under the
// other filters, for the column checklists. A login can be a sales rep
// (board_users.crm_rep_label), which the page uses for "My clients".
//
// v12 — people by name, and a client added by hand. Sales people are shown by
// their own name instead of "Sales rep N" (the label in crm_sales_reps is the
// only thing that changed; source names are untouched). `client_add` creates a
// record from the counter: a prospect with a PRS reference, its values on the
// "entered by the team" side, refused when the number or the name is already on
// file unless the page says it is a different person.
```
