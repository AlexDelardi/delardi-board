# Shared UI kit + Sales till redesign — design

**Date:** 16 Nov 2026 · **Approved by:** Alex — guideline decisions G1–G6 ("All 6 are good to go!") and the seven Sales mockups ("All look great!", 16 Nov 2026 17:54), go-ahead to build 18:03.
**Sources:** `Tools_Design_Guideline_v1` (project doc), the canvas "Sales till — mockups (iPad)" (https://claude.ai/artifact/AhABMSx1hkupxkLp3hhFuT), design audit of 16 Nov (findings 1–10).

## Intent

The tools were built one by one and look like four different products: 13 corner radii, shadows, green/amber/orange status colours, a dark mode, beige and gold in the Catalogue, each tool copying its own stylesheet. Alex wants one look across every in-store tool, starting with the till staff use in front of clients. This job builds the **shared kit** once and rebuilds the **Sales till** on it, matching the approved screens. CRM, Catalogue, Board and the landing page follow later on the same kit.

## Goals

1. `ui/kit.css` — the guideline in one stylesheet: colour tokens, type, spacing, square shapes, no shadows, and the components (header with tool switcher, tabs, buttons, inputs, table, status tags, detail panel, confirm dialog, toast, banner, lock card).
2. `ui/tools.js` — the tool switcher list and one function that renders it, shared by every tool.
3. Every tool's `build.py` can inline both, so pages stay one self-contained file with no outside request. Sales is the first to do it.
4. The Sales till looks like the seven mockups: New sale, Search results, Payment, Receipt, Client panel, Tickets, Lock.
5. Checks that keep it that way: a Node check over the kit and every built page that uses it (palette only, radius 0, no shadows, no dark mode).

## Non-goals

- No change to what the till does: same routes, rights, API calls, posting, suspend, void, training/live. No database or edge-function change.
- No restyle of CRM, Catalogue, Board or landing in this job (they keep working unchanged; the CRM add-client form shown inside Sales takes the Sales look via the kit).
- No Evolventa font files: the agency has not sent them (G3 open). The kit names Evolventa first, then Century Gothic, then system sans; embedding is one later change in the kit.
- No one-login backend (G4 is W9.3 work). The switcher lists the tools; it does not sign into them.

## Anti-goals (a failure even if it "works")

- Any rounded corner, shadow, or colour outside the palette on a Sales screen.
- Any behaviour regression: the Sales QA suite (239 checks today) must stay green; checks may be re-pointed to new markup, never dropped.
- Sideways scrolling at iPad sizes 1024×768 and 768×1024.
- A second copy of the kit inside a tool's source (the build inlines the one file).

## Constraints

- Palette, exactly: navy `#082966`, navy-deep `#001A4A`, slate `#5B6478`, sky `#8FA8CC`, mist `#D3DCE9`, card `#EEF1F7`, white `#FFFFFF`, alert `#8C2F2F`. `rgba()` is allowed only with one of these colours' channels (e.g. the 40% navy-deep scrim `rgba(0,26,74,.4)`).
- Alert is used only for errors, voids, "Sold / cannot sell" and destructive actions (G1).
- Fonts: titles Palatino Linotype regular, never bold; text Evolventa Regular/Bold with fallbacks.
- Type, spacing, components: as the guideline tables (page title 28, section 21, item 17, key number 28–34, body 15, small 13, label 12 bold caps +0.1em; spacing 4/8/12/16/24/32/48; 44 px targets; focus 2 px navy outline, 2 px offset).
- Dates (G5): screens `16 Nov 2026` (RU `16 ноя 2026`), times `14:05`; receipts and exports `16.11.2026`.
- Money: whole so'm grouped with spaces, `274 925 000 so'm` (RU `сум`).
- Pages stay self-contained; the Sales QA forbids any request but the page and the two APIs.
- `qa/ui-foundations.cjs` reads `--muted`, `--page`, `--surface-2` as literal hex from built pages: the kit keeps those names as aliases with literal values.
- The repo is public: invented data only in tests and screenshots.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A (chosen)** | One `ui/kit.css` + `ui/tools.js` in the repo, inlined by each tool's `build.py` | Keeps the one-file, no-outside-request rule; a kit change reaches a tool when it is rebuilt |
| B | Host `kit.css` once and `<link>` it from every page | One download for all tools, but breaks the self-contained rule and the QA's no-foreign-request check; an offline iPad loses the look |
| C | Restyle each tool's own stylesheet in place | No new moving part, but it is exactly finding 10 again: four copies drifting apart |

A was picked because it fixes finding 10 without changing how pages are served.

## What was decided (from the approved mockups)

- **Header:** navy-deep 56 px; white wordmark (links to the landing `../`), 1 px sky rule, "Sales" in Palatino 19 white; right: **Tools** (switcher: Sales, Clients, Catalogue, Board), EN/RU pair, the person's label, **Lock**. The theme switch goes (G2).
- **Tabs:** New sale · Tickets · Admin (Admin only with the manage right) on white; active navy bold with a 2 px underline.
- **Training band:** full-width `card` fill, navy text, "TRAINING" label + one line.
- **New sale:** Palatino title, seller select and Suspended (n) / Suspend on the title row; full-width search; lines with price, discount, net; a bottom bar with the client slot (Walk-in / Find client), the total in Palatino and **Payment**.
- **Search results:** a list panel under the field; each piece shows a status tag — *In stock* (navy fill), *Suspended sale* (card fill), *Sold* (alert outline).
- **Payment:** two columns. Left: method buttons (Cash, Uzcard, Humo, Visa, Transfer), payment rows with amount and remove, the Era receipt number, the cash notice (`card` box, from 170 000 000 so'm — a real limit, already in the code as `cash_notice_uzs`). Right, on `card`: lines, client, seller, To pay (Palatino 34), Paid, Left to pay, **Post sale**, Back to the sale.
- **Receipt:** left, the receipt preview on a `card` ground (navy-deep masthead with the wordmark, address, ticket and time, seller, client, items with Ref./S/N lines, total, payments, TRAINING strip when in training, monogram); right, "Sale saved", the ticket and amount, the training note, **Print receipt**, **New sale**.
- **Client:** a **detail panel** from the right, 560 px, 2 px navy top rule over a 40% navy-deep scrim; search, results, the client in Palatino, owner (read-only), View in CRM, last purchases, **+ New client**, **Use this client**.
- **Tickets:** filters row (search, period, seller, status), "38 tickets · net … so'm", a table with a `card` header row, 48 px rows; numbers T-/C-/D-; status tags (Sold navy fill, Void alert outline with the amount struck through, Suspended/Return navy outline, Training card fill).
- **Lock:** a centred white card on `card`, navy-deep mast with the wordmark and "Boutique tools", one passcode field, **Unlock**.

## Left to the builder (my calls, marked)

- *Call:* class names. The kit uses short generic names (`.btn`, `.tag`, `.tbl`, `.panel`, `.modal`, `.band`, `.gate`); Sales markup moves to them; Sales-only layout classes stay in `sales/src/template.html`.
- *Call:* the Lock card's under-line. The mockup says "Opens every tool you have access to"; that is only true after one login (G4). Until then the card says "Opens the till" / "Открывает кассу".
- *Call:* the switcher links are relative (`../crm/` etc.) and open in the same tab; rights-based filtering comes with G4.
- *Call:* the receipt's own text comes from the database (`pos_receipt_text`); its date format is left as the database prints it in this job. If it is not `16.11.2026`, it is noted for a later database change.
- Anything else the mockups do not show (empty states, errors, Admin screen): follow the guideline component rules.
