# Delardi Weekly Board

A single public page for the weekly leadership meeting: topics tracked across
**Marketing · Retail · Operations · Company Steering**, with a week-by-week
record of what was said about each one.

**Live board:** https://alexdelardi.github.io/delardi-board/

## How it is put together

| Layer | What it is |
|---|---|
| Data | Supabase Postgres (project `hugduzqwyqwryicfzipu`, EU-West) |
| Reads | Supabase REST API, called straight from the page with the publishable key |
| Writes | `board-api` edge function, which is the only holder of the service role key |
| Page | `index.html` — one self-contained file, no build step, no dependencies |
| Hosting | GitHub Pages from `main` |

## The security model

Read is open; write is gated.

- The publishable key in `index.html` is **designed to be public**. It grants
  read-only access to five board tables and nothing else.
- Row-level security in Postgres gives the anonymous role `SELECT` on
  `pillars`, `weeks`, `topics`, `topic_updates` and `scoreboard`. All write
  grants are revoked from the public roles, so a write is refused before RLS is
  even consulted. `editor_sessions`, `auth_attempts` and `write_log` have RLS
  on with no policies at all — deny by default.
- Editing requires the team passcode. The page sends it to the edge function,
  which compares a SHA-256 digest against a server-side value and returns an
  opaque 8-hour session token. **The passcode is never stored in this repo.**
- Failed passcode attempts are rate-limited to 10 per IP per hour.
- Every write is attributed and appended to `write_log`. Weekly updates are
  append-only: an author can remove their own entry within 15 minutes, after
  which the record stands and corrections are added rather than edited.

Because the repository is public, it holds code only. No topic content, no
figures, no personal data.

## Changing the passcode

Supabase dashboard → Edge Functions → Secrets → set `BOARD_PASSCODE_SHA256` to
the SHA-256 hex digest of the new passcode. No redeploy needed.

```bash
printf '%s' 'your-new-passcode' | sha256sum
```

## Updating the page

Edit `index.html`, commit, push. GitHub Pages redeploys within a minute or two.

## If the board will not load

Free Supabase projects pause after about a week of low activity. The daily
keep-alive workflow in `.github/workflows/keepalive.yml` normally prevents it.
If it happens anyway: Supabase dashboard → the project → **Resume project**.
No data is lost, and you have up to a year to restore.

Note that GitHub disables scheduled workflows in a repository with no commits
for 60 days; a single commit re-enables them.
