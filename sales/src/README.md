# Delardi Sales (the till) — source (`sales/src/`)

`sales/index.html` is one self-contained file: the page, its styles, its script
and the brand marks, with no network request except to `sales-api` and
`crm-api`. That file is **built**, not edited by hand.

## Building the page

```
cd sales/src
python3 build.py        # writes ../index.html
```

`build.py` works as `crm/src/build.py` does: it takes `template.html` and
`app.js`, and drops the modules in, in this order, just before the
`/* ---- init */` marker in `app.js`:

| File | What is in it |
|---|---|
| `app.js` | the shell: state `S`, `api()`, the dictionary (`tr`, `RU`), `el()`, `toast()`, `modal()` and `confirmBox()`, routes and `go()`, the passcode card, the idle lock, the header and the TRAINING band, and the init block at the end |
| `sale.js` | the sale screen: search and scan, the lines, discounts, sellers, the total; suspended sales (Suspend, the "Suspended (n)" list, Resume, Cancel, the "another sale is suspended" pop-up) |
| `pay.js` | the payment screen, posting, and the receipt |
| `crmshim.js` | the CRM session (crm-api `unlock` with the same passcode) and the free names `crm/src/addclient.js` needs |
| `../../crm/src/addclient.js` | the CRM's own add-client form, **unchanged** |
| `client.js` | the client on a sale: the slot, the search and the client panel |
| `tickets.js` | the ticket list, one ticket, its receipt, and void |
| `admin.js` | `#/admin`: Training / Live, the go-live date, clearing test sales |

The shared UI kit is inlined too: `build.py` puts `ui/kit.css` where
`template.html` has the `/*__KIT_CSS__*/` marker (the template keeps only the
till's own layout rules) and puts `ui/tools.js` first in the script. There is
no theme: one light look, no dark mode, no `data-theme`. Dates on screen come
from `fmtDate` (`16 Nov 2026`, RU `16 ноя 2026`) and `fmtTime` (`14:05`),
both in Tashkent time; receipts and exports use `fmtDateNum` (`16.11.2026`).

The brand marks (`brand/`) are substituted as data URIs.

## How it behaves

- **Passcode** → `unlock`; the token is kept in `sessionStorage`, so it is gone
  when the tab closes. A 401 on any call shows the passcode card again.
- **Idle lock:** on a touch device, 15 minutes without a touch shows the
  passcode card over the page. The sale on screen is kept; the token is dropped.
- **TRAINING** shows on every screen while the till is in training.
- **Routes:** `#/sale`, `#/pay`, `#/receipt/<ticket_id>`, `#/tickets`,
  `#/ticket/<ticket_id>`, `#/admin` (shown only with the manage right).
- **The client:** at login the page sends the same passcode to crm-api
  `unlock` and keeps that CRM session for the tab. If crm-api answers 401 or
  403, the till offers Walk-in only and says "No CRM access — Walk-in only".
  Otherwise Find client searches crm-api `clients` (300 ms pause) and opens
  the panel from `client`: name, the CRM owner (read-only) with
  "View in CRM ↗" (`../crm/#<id>`, the CRM's deep link), purchase count and
  total from the card's `rollup`, the last purchase, the purchases (a row with
  `ticket_line_id` opens its ticket through `ticket_by_line`), notes and
  important dates. **No ABC class and no lifecycle tag.** "+ New" (CRM
  editors only) opens the CRM's own add-client form; the record it makes goes
  on the sale.
- **Suspended sales:** one per mode. Suspend sets the sale aside (its pieces
  are held) and clears the screen; "Suspended (n)" lists it with Resume and
  Cancel (Cancel asks first). Resume puts it back, keeping its `draft_id`.
  When Suspend or Post is refused with "another sale is suspended", a pop-up
  offers to resume or cancel that sale.
- **Tickets:** search, a date range (last 30 days, Tashkent, by default),
  seller, source and status, with the count and net total. Colibri tickets are
  read-only; refund lines show negative. Sales from this till show their
  receipt, and a login with the void right can void a posted one, with a
  reason and a confirm; the page then reminds you to cancel the fiscal receipt
  in Era as well. Test sales are offered only while the till is in training.
- **Admin:** Training / Live with a confirm that says what Live means, the
  go-live date, and "Clear test sales" (confirm), which says how many test
  tickets and suspended test sales it removed.
- **Search:** suggestions after two characters (250 ms pause). Enter adds the
  piece only when exactly one sellable piece matches (as the API reports it,
  whatever is already on the sale); if that piece is already on the sale it
  says so and adds nothing. Several sellable pieces on one barcode always open
  the list, so the seller taps the serial — a re-scan never picks the other copy. Pieces that cannot be sold are greyed with their state in
  words, or "in suspended sale #n".
- **Money:** whole so'm. Line net = round(price × (1 − discount/100)), half away
  from zero, computed in integers (BigInt) exactly as the database rounds; the
  total is the sum of the nets. A discount is 0–99.9999 % with at most four
  decimals (`numeric(6,4)`); more is capped, with a message.
- **Post** is offered only when the payments equal the total to the so'm, a
  seller is set and a client or Walk-in is chosen; the line beside it says
  what is missing. The server checks it all again. A refusal (409) is shown
  as sent, and the screen stays as it was.
- Sellers are the labels from `reference.sellers`, sent as they are.

## Checking it

```
cd sales/src
python3 build.py && node qa/test.js
SHOTS=/some/folder node qa/test.js     # also saves screenshots there
```

`qa/mock.js` is an in-memory stand-in for `sales-api` that follows
`api/README.md` (actions, shapes, 400/401/403/404/409 with `{error}`), and a
second one for `crm-api` (`crmHandle`: unlock, ping, reference, clients,
client, client_add, in `crm/src/api/index.ts`'s shapes). Every piece, rep,
ticket and client in it is invented: serials `ZZ.00.xxxxx`, barcodes `200…`,
clients `DLD-9xxx` / `PRS-9xxx`. The checks run in Chromium through Playwright: login, scan, a shared
barcode, discounts and rounding, the Post guard, split payments, the cash
notice, posting and the receipt, a 409, the idle lock (with Playwright's
clock), Russian, the client panel, adding a client, no CRM access, suspended
sales, the ticket list, void, admin, the landing tile, and the iPad sizes
(1024×768 and 768×1024: no sideways scroll on every screen — sale, search,
client, payment, receipt, tickets, lock — and buttons at least 44 px). The run
also fails if the page asks for anything but the two APIs.

With `SHOTS` set the run saves `01-sale.png`, `02-search.png`,
`03-payment.png`, `04-receipt.png`, `05-client.png`, `06-tickets.png`,
`07-lock.png` (1024×768) and `08-sale-portrait.png`, `09-payment-portrait.png`,
`10-client-portrait.png` (768×1024), plus a few per-screen extras.

## The API

`api/index.ts` is the `sales-api` edge function and `api/README.md` its
contract.
