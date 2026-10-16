# The Client Instrument — source (`crm/src/`)

`crm/index.html` is one self-contained file: the page, its styles, its script and
the two brand marks, with no network request except to the API. That file is
**built**, not edited by hand.

## Building the page

```
cd crm/src
python3 build.py        # writes ../index.html
```

`build.py` takes `template.html` and drops the modules into it in this order,
just before the `/* ---- init */` marker in `app.js`:

| File | What is in it |
|---|---|
| `app.js` | the shell: session, state, the client list, the card and its forms, the dictionary, and the init block at the end |
| `insights.js` | the Insights tab |
| `data.js` | the Data tab and the monthly Colibri refresh |
| `floor.js` | the phone and iPad layer: menu, overlays and the back button, the card at a glance |
| `mobile.js` | the forms that open as panels from the bottom |
| `telegram.js` | chats, leads and missed requests |
| `personal.js` | phone numbers, the contact log and personal data |
| `listx.js` | sorting and the column checklists |
| `addclient.js` | adding a client by hand (v12, 12 Oct 2026) |
| `xlsx.js` | the workbook writer: a stored zip and the sheet XML, written by hand so the page still loads nothing from anywhere (v13) |
| `export.js` | the download dialog, the sheet's columns and the file name (v13, 15 Oct 2026) |

The filter bar, the pills and the folded panel live in `app.js` and `listx.js`;
the sticky offsets are measured by `syncSticky()` into `--top-h` / `--bar-h`.

The brand marks are substituted as data URIs, so the built file has no image
request either. The build prints the size of what it wrote.

## Checking it

```
cd crm/src
node qa/test.js
```

`qa/mock.js` is a stand-in for `crm-api` — invented clients, invented numbers, no
real data — so the checks run offline, in Chromium through Playwright. They cover
the list, the card, adding a client (the duplicate guard, what is sent, where the
new record lands), downloading a list (the right, the count, the phone tick box,
do-not-contact kept and marked, the birthday month and its order), a viewer with
no edit right, a sales rep who edits but cannot download, the Russian page and
the phone layout, including tap targets and sideways scroll. The downloaded
workbook is opened back up with Python's own zipfile and, where it is installed,
with openpyxl — a file that only opens in the thing that wrote it is not a file.
122 checks as of 16 October 2026, covering the folded filter bar, the pills,
the panel, the tiles toggle, the sticky offsets and how many clients fit on a
screen. The suite the earlier phases had was lost with
its workspace in October 2026; this one replaces it.

## The API

`api/index.ts` is the deployed `crm-api` edge function, kept here so the page and
its API can be read side by side. It is deployed from Supabase, not from this
repository — editing this copy changes nothing on its own. `api/HISTORY.md` holds
the version history that used to sit in the file's header.

**No key, no client data, ever, in this repository.**
