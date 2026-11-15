# Delardi Sales (the till) — source (`sales/src/`)

`sales/index.html` is one self-contained file: the page, its styles, its script
and the brand marks, with no network request except to `sales-api` (and, from
Task 8, `crm-api`). That file is **built**, not edited by hand.

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
| `app.js` | the shell: state `S`, `api()`, the dictionary (`tr`, `RU`), `el()`, `toast()`, routes and `go()`, the passcode card, the idle lock, the header and the TRAINING band, the `renderClientSlot()` stub, and the init block at the end |
| `sale.js` | the sale screen: search and scan, the lines, discounts, sellers, the total |
| `pay.js` | the payment screen, posting, and the receipt |
| `crmshim.js`, `../../crm/src/addclient.js`, `client.js`, `tickets.js`, `admin.js` | Task 8 — skipped with a printed note while they are not there |

The brand marks (`brand/`) are substituted as data URIs.

## How it behaves

- **Passcode** → `unlock`; the token is kept in `sessionStorage`, so it is gone
  when the tab closes. A 401 on any call shows the passcode card again.
- **Idle lock:** on a touch device, 15 minutes without a touch shows the
  passcode card over the page. The sale on screen is kept; the token is dropped.
- **TRAINING** shows on every screen while the till is in training.
- **Routes:** `#/sale`, `#/pay`, `#/receipt/<ticket_id>`, `#/tickets`,
  `#/ticket/<ticket_id>`, `#/admin`. The last three are placeholders until
  Task 8 replaces their entries in `ROUTES`.
- **Search:** suggestions after two characters (250 ms pause). Enter adds the
  piece when exactly one piece found can still be added (so scanning a shared
  barcode twice adds the second identical piece); otherwise the list stays open
  to pick from. Pieces that cannot be sold are greyed with their state in
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
`api/README.md` (actions, shapes, 400/401/403/404/409 with `{error}`). Every
piece, rep and client in it is invented: serials `ZZ.00.xxxxx`, barcodes
`200…`. The checks run in Chromium through Playwright: login, scan, a shared
barcode, discounts and rounding, the Post guard, split payments, the cash
notice, posting and the receipt, a 409, the idle lock (with Playwright's
clock), Russian, and the iPad sizes (1024×768 and 768×1024: no sideways
scroll, buttons at least 44 px). The run also fails if the page asks for
anything but the API.

## The API

`api/index.ts` is the `sales-api` edge function and `api/README.md` its
contract.
