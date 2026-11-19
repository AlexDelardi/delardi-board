# Performance tool, first version — design

**Date:** 19 November 2026 · **Roadmap:** W12 · **Approved scope:** Alex, 19 Nov 23:30 (monthly view, bridge, incentive estimate; visible to Alex only; build to a PR, nothing on production without his yes).

## Why
The monthly KPI cheat-sheet and the October report are built by hand in Excel from Colibri exports. The tickets are already in the database, so the same figures can be read live, on one definition of a sale.

## What it shows (one month at a time, one store)
1. **Headline:** net sales against plan (attainment, gap) and against the same month last year, in so'm with USD alongside at the month's rate.
2. **KPIs**, this month · last year · year to date · last year to date: net and gross sales, discount %, tickets, units, UPT, average ticket (NSPT), average item, share of tickets with more than one item, large tickets (USD 10,000 or more) against the base book, clients by lifecycle (new · returning within 250 days · recaptured after more · no record), visits and conversion.
3. **Trend:** 13 months of net sales, tickets, average ticket, UPT, discount, conversion.
4. **Bridge:** last year → actual and plan → actual, split into tickets, mix (share of large tickets) and ticket size, so the three parts add up to the gap exactly.
5. **Incentive estimate:** per seller: sales, plan, attainment, rate, commission after the store guardrail, programme payouts with their caps, total, and what was actually paid where typed in. The rules are data, dated, so October runs on the rules as paid and November on scheme v8.
6. **Tickets of the month** with how each was counted (basis, seller, client lifecycle), and what was left out with its amount.

## One definition of a sale
- Posted tickets from Colibri and the till. Training sales are never counted. Refund lines subtract.
- **Retail basis:** founder, trade, staff and cost-price tickets are excluded and shown on their own line. They are recognised by rules held as data (a client reference, or words in the ticket note), and any single ticket can be corrected by hand.
- **Seller:** the ticket's seller, unless a note rule or a correction says otherwise (some sales are keyed under a colleague's login).
- **Large ticket:** USD 10,000 or more at the month's rate. The rest is the base book.

## Inputs (typed in, logged)
Per month: plan, planned tickets and planned large tickets (for the plan bridge), visits and appointments, FX rate, a note. Per seller and month: plan, whether commission applies, programme counts where the automatic count is wrong, amount paid.

## Rights
A new right "view performance", given to Alex only. It covers the inputs too in this version. No cost or margin anywhere in the tool.

## Not in this version
Splits by brand and category with drill-down; several stores side by side; sellers seeing their own figures; one login across tools.

## Calls made while building (Alex was away)
- An inputs screen is included: plan, visits and FX need a place to be corrected, and the repository is public, so real figures are loaded into the database, never committed.
- Programme counts are worked out from the tickets where the rule allows (two-piece ticket, brand, watch, new and recaptured client) and can be overridden per seller; "complete client record" cannot be checked from tickets, so New Client counts first purchases.
- The bridge's "mix" is the two-layer method of the November target: the share of large tickets.

## Checks before it is trusted
October 2026 must reproduce the monthly report to the so'm (ticket count, net sales, the tickets left out; the figures are in the project notes, not in this public repo). Then two more past months against the cheat-sheet; differences are listed, not hidden.
