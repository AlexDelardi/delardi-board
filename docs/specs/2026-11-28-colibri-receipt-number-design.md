# The till beside Colibri: Colibri receipt number and main ticket numbers

Approved by Alex, 28 Nov 2026.

## Why
The till can now be used for real sales while Colibri is still running: a Live sale reaches Stock, Catalogue,
the sales register, Performance and the CRM. Each sale is then keyed twice, once in the till and once in Colibri.
The two records need to be tied together, and the boutique needs to choose which number a sale goes by.

## What
1. **Colibri receipt no.** on the payment screen, saved on the ticket (`ops_tickets.colibri_no`). One posted till
   sale per number; a voided sale frees its number. A number the register already holds from a Colibri export is
   refused.
2. **Main ticket numbers: Till / Colibri**, an Admin setting (`pos_settings.main_ticket_no`, logged).
   - Colibri: the number is needed to post; the sale is shown, searched and printed under it
     (`ops_tickets.display_no`), with the till's D-number beside it.
   - Till: the D-number is the main one; the Colibri number is optional and kept beside it.
   - A sale keeps the number it was posted under when the setting changes later.
3. **The Colibri sales export becomes a cross-check.** The go-live rule stays: from the go-live date the export
   may not write tickets, so a sale is never counted twice. A Colibri receipt whose number is on a till sale is
   compared with it (serials sold, total); the result is kept on the till sale (`colibri_check`, `colibri_note`) and
   shown in the ticket list and on the ticket. Receipts with no till sale are refused and listed, as before: they
   are the sales missing from the till.

## Approaches considered
- **Load unpaired Colibri receipts automatically** after go-live. Fills gaps without retyping, but a mistyped
  number would count a sale twice. Not taken.
- **Keep refusing and list them** (taken). The till stays the only writer of sales; the list says what to key in.

## Not in this change
- Performance and the CRM card still show a till sale under its D-number.
- The Colibri number is not kept on a suspended sale; it is typed at payment.
