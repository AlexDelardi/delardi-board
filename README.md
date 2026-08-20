# Delardi Weekly Board

A private page for the weekly leadership meeting: topics tracked across
**Marketing · Retail · Operations · Company Steering**, with a week-by-week
record of what was said about each one.

The address is deliberately not published here. Ask Alex for the link and the
team passcode.

## How it is put together

| Layer | What it is |
|---|---|
| Data | Supabase Postgres (project `hugduzqwyqwryicfzipu`, EU-West) |
| API | `board-api` edge function — the only route to the data, in either direction |
| Page | `index.html` — one self-contained file, no build step, no dependencies |
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

## Updating the page

Edit `index.html`, commit, push. GitHub Pages redeploys within a minute or two.

## If the board will not load

Free Supabase projects pause after about a week of low activity. The daily
keep-alive workflow in `.github/workflows/keepalive.yml` normally prevents it.
If it happens anyway: Supabase dashboard → the project → **Resume project**.
No data is lost, and you have up to a year to restore.

Note that GitHub disables scheduled workflows in a repository with no commits
for 60 days; a single commit re-enables them.
