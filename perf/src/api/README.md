# perf-api

POST JSON `{action, token?, …}` to the `perf-api` edge function (`verify_jwt` off; it checks its own session token).
Errors: `{error}` with 400 (bad request), 401 (no or lost session), 403 (no right), 409 (a refusal written for the screen), 429, 500.

| Action | Body | Answer |
|---|---|---|
| `health` | | `{ok}` |
| `unlock` | `passcode` | `{token, name, expires_at}`; needs the right **view performance** |
| `ping` | | `{ok, name}` |
| `span` | | `{first, last}`: the first and last month with tickets |
| `month` | `month` (`YYYY-MM`) | the month document, below |
| `save_month` | `month`, `inputs` | the month document, recomputed |
| `mark_ticket` | `month`, `ticket_id`, `mark: {basis?, seller?, client_id?, note?}` | the month document, recomputed |

`inputs`: `{plan_uzs, plan_tickets, plan_large_tickets, plan_large_uzs, visits, visits_appointment, fx, note,
sellers: [{seller, plan_uzs, commission, programme_counts: {key: n}, paid_uzs}]}`. What is sent replaces what was
there; an empty value clears it; a seller not sent is removed. Every change is logged (`perf_input_log`).

## The month document (`perf_month`)
`month`, `fx`, `large_from_uzs`, `inputs`, `cur`, `ly`, `ytd`, `ytd_ly` (each a period: `net, gross, net_usd, discount_pct,
tickets, units, upt, atv, asp, multi_item_share, large{tickets,net}, base{tickets,net,avg}, clients,
lifecycle{new,returning,recaptured,no_record → {tickets,net}}, excluded{tickets,net}`), `plan{plan,attainment,gap}|null`,
`funnel{visits,visits_appointment,conversion}`, `trend[13]{month,net,net_usd,tickets,atv,upt,discount_pct,plan,visits,conversion}`,
`bridge{ly,plan}` (each `{from,to,tickets,mix,size}` or null; the three parts add up to `to − from`),
`excluded[]{basis,tickets,net}`, `tickets[]` (every ticket of the month with `basis, basis_by, seller, client_id, lifecycle,
days_since, net, units, large, marked`), `incentive|null` (`scheme, store, sellers[], total`).

All money is whole so'm. No cost or margin.
