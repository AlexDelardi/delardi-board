# Delardi Catalogue — source (`catalogue/src/`)

`catalogue/index.html` is one self-contained file: the page, its styles, its
script and the brand marks, with no network request except to the API. That
file is **built**, not edited by hand.

## Building the page

```
cd catalogue/src
python3 build.py        # writes ../index.html
```

| File | What is in it |
|---|---|
| `template.html` | the styles and the page shell |
| `app.js` | the session, the routes, the start screen, the four ways in, the reference list and its filters |
| `model.js` | the model page: colour switch, crucial facts, advisor block, specifications with TBC and marks, description, matching pieces, the owner's data block (part 3) |
| `floor.js` | client view, report an error, the owner's review of reports (`#/reports`), the 15-minute idle lock on iPads and phones, the no-connection screen, the back button closing panels (part 4) |

`../app/` holds the home-screen manifest and icons (the brandbook monogram, white on navy). There is no service worker: nothing is kept for offline use.

## Checking it

```
cd catalogue/src
node qa/test.js
```

`qa/mock.js` stands in for `catalogue-api`: invented brands, references and
prices, no real stock. The checks run offline in Chromium through Playwright
and cover:
- the passcode gate
- the start screen and the four ways in
- search
- the list's sort, filters, pills and "show more"
- greyed sold-out models and the TBC mark
- the eye button
- opened recently
- Russian
- the lock and an expired session
- the iPad-portrait and phone layouts: tap targets, and nothing scrolling sideways
- the dark theme

139 checks as of 24 October 2026. Besides the list above, they cover:
- the model page: colours, carried-over facts, marks, TBC, Russian
- the metal, stone and movement filters
- client view: what it hides, that it survives a reload, and that locking ends it
- reporting an error and the owner's review
- back closing panels
- the idle lock on an iPad, held across a closed page and not applied on a desk computer
- opening without a connection

## The API

`api/index.ts` is the deployed `catalogue-api` edge function, kept here so the
page and its API can be read side by side. It is deployed from Supabase, not
from this repository.

**No key and no catalogue data, ever, in this repository.**
