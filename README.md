# Delardi internal tools

One repository, three pages:

| Path | Page |
|---|---|
| `/` — `index.html` | **Landing page.** Links to the two tools below. It holds no key, makes no network request and shows no data; it only reads, from the visitor's own browser, whether each tool is already unlocked there. English / Russian. |
| `/board/` — `board/index.html` | **Weekly Board.** A private page for the weekly leadership meeting: topics tracked across **Marketing · Retail · Operations · Company Steering**, with a week-by-week record of what was said about each one. |
| `/crm/` — `crm/index.html` | **Client Instrument.** The CRM spring clean — see below. |

The board lived at the root until 21 September 2026. The old address now opens
the landing page, one click from the board.

The address is deliberately not published here. Ask Alex for the link and a
passcode.

## How it is put together

| Layer | What it is |
|---|---|
| Data | Supabase Postgres (project `hugduzqwyqwryicfzipu`, EU-West) |
| API | `board-api` edge function — the only route to the data, in either direction |
| Page | `board/index.html` — one self-contained file, no build step, no dependencies |
| Hosting | GitHub Pages from `main` |

## The security model

**This repository is public, so it contains no key of any kind.** Earlier versions
of the page carried a read-only database key; they no longer do. Everything the
page needs comes from the API, and the API answers nothing without a session.

- Opening the board requires the team passcode. The page sends it to the edge
  function, which compares a SHA-256 digest against a server-side value and
  returns an opaque 8-hour session token. **The passcode is never stored in this
  repository, in the page, or in the database in plaintext.**
- Until that token exists the page fetches nothing at all. The blurred board
  behind the passcode card is invented placeholder content — there is no real row
  in the DOM to un-blur, read out of the network tab, or lift from the API.
- Anonymous read access is revoked in Postgres. `SELECT` on every board table is
  refused for the public roles, so a key would not help even if one leaked.
- Failed passcode attempts are rate-limited to 10 per IP per hour and recorded.
- Every write is attributed and appended to `write_log`. Weekly updates are
  append-only: an author can remove their own entry within 15 minutes, after
  which the record stands and corrections are added rather than edited.

## Changing the passcode

Supabase dashboard → Edge Functions → Secrets → set `BOARD_PASSCODE_SHA256` to
the SHA-256 hex digest of the new passcode. No redeploy needed.

```bash
printf '%s' 'your-new-passcode' | sha256sum
```

Pick something not derived from the company name — the passcode is the only
control on the whole board, and company-plus-year is the first thing a targeted
guesser tries.

## The Client Instrument (`crm/`)

A second page in the same repository, for the CRM spring clean: the client list,
each client's card, and what needs checking between Colibri and the marketing
questionnaire. People with edit rights settle each field (and say how they know),
mark records checked, set them aside or delete them, merge duplicates, change the
owner, record do-not-contact and referrals, and add notes. English or Russian.

It follows the same model as the board, with its own API and its own right:

- Its data comes only from the `crm-api` edge function. This page, like the
  board, holds no key of any kind.
- The board and the instrument are separate rights (`can_view_board`,
  `can_view_crm`); a passcode opens only what its owner has been given, and a
  session issued by one is refused by the other. Editing client records is a
  further right (`can_edit_crm`). Rights are re-checked on every request, so
  switching someone off takes effect at once.
- Every change is made by a database function that writes the change and its
  line in `crm_events` together, with who and when. Merges also keep a full
  before-image in `crm_merge_log` so they can be undone by hand.
- Phone numbers are shown to everyone with CRM access (since 22 Sept 2026): on
  the card with call, Telegram and WhatsApp links, in the clean-up, and in
  search. They are hidden with the amounts by the eye button, and never kept
  in this repository. Since 12 October 2026 sales people appear by name —
  first name and the initial of the surname — and anyone who has left the
  team is marked "(left)". A name is one field in `crm_sales_reps`; every
  screen reads it at request time, so renaming is a single change.
- Every retail client has one owner: a current sales rep, or "Shared (store)"
  for lapsed and dormant clients the whole team works. The card keeps the
  previous owner and says how the current one was assigned.
- The **Insights** tab (`crm/?view=insights`) shows where the value sits (ABC
  class by lifecycle), the priority lists in playbook order, each owner's book,
  acquisition and brand/category mix by year, and birthdays in the next 30 days.
  Every figure opens the client list filtered to the same people. The figures
  are computed in the database (`crm_insights()`); retail by default, with a
  switch to include related parties.
- ABC class, lifecycle and segment are recalculated every night at 00:05
  Tashkent (`crm_recompute_segments()`, scheduled with pg_cron), and after a
  merge or a delete. ABC is cut on retail clients only; related parties keep
  their own class. Each change is written to the client's history.
- The **Data** tab (`crm/?view=data`) shows how clean the file is: where the
  review stands, a progress line that gains a point every night (00:10
  Tashkent, `crm_health_snapshot()`), how settled each field is, and a short
  list of what needs a person. Every item opens the records behind it.
- The **monthly Colibri refresh** also lives on the Data tab, for whoever holds
  the refresh right (`can_import_crm`, Alex only). The month's three exports go
  into the CRM source-files folder and Claude stages them; nothing changes in
  the client file until the refresh is reviewed and applied here. The latest
  applied refresh can be undone. No client data is kept in this repository.
- **On a phone or iPad** the page works as a floor tool: a compact header with
  a menu (views, filters, language, theme, lock), search first, quick lists
  (birthdays this week, cannot lose, shared list, do-not-contact left out) and
  the clients opened recently (only their references are kept on the device;
  names are asked of the API each time). The card opens on an at-a-glance
  overview, with tabs for purchases (by brand and category), clean-up and
  history, and a pinned "Add note". The phone's back button closes whatever is
  open. The eye button hides amounts on that device. On an iPad in landscape
  the list and the card sit side by side.
- **Clean-up on a phone:** each form on the card opens as a panel from the
  bottom with Save pinned; merge and delete take the whole screen, and a merge
  asks twice. On the Clean-up tab the card's foot walks the list (Previous,
  Next, and Mark checked on touch screens; J and K on a keyboard).
- **Insights and Data on a phone:** wide tables become one small card per row;
  nothing scrolls sideways. The refresh review keeps Apply and Discard pinned.
- **Home screen:** `crm/app/` holds the web-app manifest and the icons (the
  brandbook monogram, white on navy), so the page can be added to a phone's
  home screen and opens full screen. On phones and iPads it locks after 15
  minutes without use (the passcode is asked again; sessions still last 8
  hours). There is no service worker: nothing is stored for offline use, and
  without a connection the page says so.
- **Telegram:** the boutique's Telegram chats (a summary as of 14 Aug 2026) are
  in the database. A card shows whether the client is in Telegram, when they
  last wrote and what the chat shows; the Clean-up tab offers chats that may be
  theirs, to link or reject; the Purchases tab lists what they asked for that
  the boutique could not offer, in their own words, with a status. People who
  wrote but are in neither Colibri nor the questionnaire are "Telegram leads",
  outside the clean-up. Insights has a Telegram section. Telegram IDs stay on
  the server. On a phone the shortcut chips sit on one row that swipes
  sideways.
- **Contacts and personal data:** every contact with a client is logged (when,
  how, by whom, a note); the latest shows on the card and in the list, which
  can be filtered to clients not contacted in 30, 60 or 90 days. The card has a
  Personal data block: sizes, preferences, important dates, address and a free
  "about the client". Each change goes into the client's history.
- **The list:** click a column header to sort on it; the ▾ beside Status, ABC,
  Segment, Lifecycle and Owner opens a checklist of that column's values with a
  count for each, to pick several at once. On a phone these are in the menu
  under "Sort and filter". A login linked to a sales rep opens on "My clients".
- **Adding a client by hand** (12 Oct 2026): anyone with edit rights can put a
  person on file from the list, the phone search row or the phone menu. The
  form asks only for what someone can say at the counter — name, number, who
  they are, date of birth, owner, how we met, a note — and then opens the card,
  where the rest already has its own editors. The number is checked while it is
  typed and again on the server, by number and by name: a record already on
  file is offered instead, and is only passed by saying plainly that this is a
  different person. What the team types goes in on the questionnaire side of
  the record, so the clean-up, the merge and the monthly refresh treat it like
  any other record: it is a prospect with a PRS reference until Colibri brings
  a purchase, and a second person confirms what was typed. The list has an
  "Added by the team" shortcut.
- **Downloading a list** (15 Oct 2026): a **Download .xlsx** button beside the
  filters, for a login holding the export right (`can_export_crm` — Alex, Olga
  and Eva; it is not implied by being able to edit). It saves exactly what the
  filters and the sort say, the whole set rather than the page on screen, as a
  real workbook: 23 columns including the phone numbers and the birthday that
  the list itself does not carry, numbers as numbers and dates as dates, a
  frozen header and a filter row. A tick box, on by default, decides whether
  the phone numbers go in; a second sheet records the filters, who exported it
  and when; and every download writes a line in `crm_export_log`. The file is
  written in the page itself — no library is fetched, in keeping with the rule
  that this page loads nothing from anywhere.
- **Birthdays** now count every date on file, not only confirmed ones, with the
  unconfirmed ones marked on screen and in the file (15 Oct 2026). Insights has
  a month picker that downloads that month’s greeting list, sorted by day, with
  do-not-contact clients left out.
- **The screen above the list** was taken apart on 16 Oct 2026. The filter bar is
  one row — search, a **Filters** button with a count, a pill for each filter in
  force (each able to take itself off), and the two actions on the right. The
  selects fold into a panel behind that button, and ABC and Lifecycle have gone
  from it altogether: their column headings already hold the same checklist. The
  clean-up tiles show three figures with the other three behind a toggle each
  device remembers; the clients opened recently moved into the search box (they
  keep their own row on a phone); the filter bar and the column headings stay in
  view while the list scrolls; and the rows are tighter — the name leads and the
  reference, the source and any marks share one line. **Four clients fitted on a
  1000px screen before; ten do now.**

## Updating a page

Edit the page's `index.html` — `board/` or the landing page at the root —
commit, push. GitHub Pages redeploys within a minute or two.

`crm/index.html` is the exception: it is **built** from `crm/src/`
(`python3 build.py`), so change the module there, rebuild, run the checks
(`node qa/test.js`), then commit both. See `crm/src/README.md`.

## If the board will not load

Free Supabase projects pause after about a week of low activity. The daily
keep-alive workflow in `.github/workflows/keepalive.yml` normally prevents it.
If it happens anyway: Supabase dashboard → the project → **Resume project**.
No data is lost, and you have up to a year to restore.

Note that GitHub disables scheduled workflows in a repository with no commits
for 60 days; a single commit re-enables them.
