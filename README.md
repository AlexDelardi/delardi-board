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
- Phone numbers are held in the database for matching but never sent to the
  page. Sales people appear only as "Sales rep N".
- Every retail client has one owner: a current sales rep, or "Shared (store)"
  for lapsed and dormant clients the whole team works. The card keeps the
  previous owner and says how the current one was assigned.

## Updating a page

Edit the page's `index.html` — `board/`, `crm/`, or the landing page at the
root — commit, push. GitHub Pages redeploys within a minute or two.

## If the board will not load

Free Supabase projects pause after about a week of low activity. The daily
keep-alive workflow in `.github/workflows/keepalive.yml` normally prevents it.
If it happens anyway: Supabase dashboard → the project → **Resume project**.
No data is lost, and you have up to a year to restore.

Note that GitHub disables scheduled workflows in a repository with no commits
for 60 days; a single commit re-enables them.
