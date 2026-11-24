# Task tracker

The tool that takes over from the Weekly Board: tasks with an owner, a due date, a priority, a status, a checklist, comments, and tags for CRM clients and one catalogue piece.

Two ribbons, each with its scopes:

| Ribbon | Scopes | Right on the login |
|---|---|---|
| Shop floor | Operations · CRM · Brand · Aftersales · Sales | `can_use_floor_tasks` |
| Backoffice | Marketing · Retail · Operations · Company Steering | `can_use_backoffice_tasks` |

`can_manage_tasks` gives a task to someone else and archives. Without it a person creates tasks for themselves, and updates and comments on any task they can see. A sensitive task (Backoffice only) is seen with `can_view_sensitive`; a client's name on a tag with `can_view_crm`; the suggestions inbox with `can_view_email_suggestions` on the Backoffice side.

## Files

| File | What |
|---|---|
| `app.js` | the page: language, lists (My tasks, Team, Done, Inbox), the task panel, header, gate |
| `template.html` | the stylesheet around the shared kit (`ui/kit.css`) |
| `build.py` | builds `../index.html`: `python3 build.py` |
| `api/index.ts` | `tasks-api`, the only route to the data; thin: a session gives a name, the database decides |
| `qa/mock.js`, `qa/test.js` | a stand-in for the API and the page's checks: `node qa/test.js` (`ONLY=`, `SHOTS=`) |

The rules live in the database: `db/migrations/20261124_tsk_1_tasks.sql`, checked by `db/tests/tsk_t1_tasks.sql` (`db/dev/run_sql_tests.sh tsk_`).

## Going live

In this order, each with the owner's yes: the migration → deploy `tasks-api` (`verify_jwt` off, as the other tools) → merge the page → switch the rights on → `select tsk_carry_over('<name>')` once, which copies the Board's live topics into Backoffice → the Board off the hub and the switcher, and read-only.

The Board's own tables are not altered. Decided, done and parked topics stay there.

## Left for later

Repeating tasks; tasks created by other tools; ticket tags; notifications; the client's open tasks on the CRM card.
