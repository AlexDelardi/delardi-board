# Shared UI kit + Sales till redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared stylesheet and tool switcher (`ui/`), inlined into the Sales till, with every Sales screen restyled to the seven approved mockups and no behaviour change.

**Architecture:** `ui/kit.css` holds tokens and components; `ui/tools.js` renders the tool switcher. `sales/src/build.py` inlines both into the single-file page (CSS at a marker in `template.html`, JS ahead of the modules). Sales markup moves to kit class names; Sales-only layout stays in `template.html`. A Node check (`qa/kit.cjs`) enforces palette, square corners, no shadows and no dark mode over the kit and every built page that uses it.

**Tech Stack:** plain CSS and browser JS, Python 3 build, Node 22 checks, Playwright (Chromium) for `sales/src/qa/test.js`.

**Spec:** `docs/specs/2026-11-16-ui-kit-sales-redesign-design.md` (mockups: https://claude.ai/artifact/AhABMSx1hkupxkLp3hhFuT; guideline: project doc `Tools_Design_Guideline_v1`).

## Global Constraints

- Palette only: `#082966` navy, `#001A4A` navy-deep, `#5B6478` slate, `#8FA8CC` sky, `#D3DCE9` mist, `#EEF1F7` card, `#FFFFFF` white, `#8C2F2F` alert. `rgba()` only with those colours' channels (`0,26,74`, `8,41,102`, `91,100,120`, `143,168,204`, `211,220,233`, `238,241,247`, `255,255,255`, `140,47,47`).
- `border-radius` is `0` everywhere (any other value fails); no `box-shadow` except `none`; no `prefers-color-scheme`, no `data-theme`, no `sysdark`.
- Alert only for errors, voids, Sold / cannot sell, destructive buttons.
- Fonts: `--serif: "Palatino Linotype","Book Antiqua",Palatino,serif` (weight normal, never bold); `--sans: "Evolventa","Century Gothic","Segoe UI",sans-serif`.
- Type px: page title 28/1.25, section 21/1.3, item name 17/1.35, key number 28–34/1.1, body 15/1.5, small 13/1.45, label 12 bold uppercase letter-spacing .1em. Spacing 4/8/12/16/24/32/48. Targets ≥ 44 px. Focus `2px solid #082966`, offset 2px.
- Dates on screens `16 Nov 2026` / RU `16 ноя 2026`, times `14:05`; receipts and exports `16.11.2026`.
- Money `274 925 000 so'm` (RU `сум`), via the existing `fmtUZS`.
- Legacy variable names `--muted`, `--page`, `--surface-2` stay defined in the kit with **literal hex** values (`qa/ui-foundations.cjs` reads them).
- No behaviour change; Sales QA stays green; a check may be re-pointed to new markup, never deleted.
- Built page stays self-contained: no request but the page, `sales-api`, `crm-api`.
- Public repo: invented data only. Commits: `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, message ending with the two trailer lines `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T7Uo2rwXkRSCU6pgcooH5o`.
- Rebuild `sales/index.html` (`cd sales/src && python3 build.py`) and commit it with every Sales source change.
- Never touch production (no Supabase, no deploy, no push).

## Review Focus

1. **Russian:** every new label (Tools, Unlock, Opens the till, Sale saved, Left to pay, Back to the sale, Print receipt, Use this client, + New client, In stock, Suspended sale, Sold, tickets count line) has an `RU` entry; Russian strings are longer — no overflow at 768 wide.
2. **Portrait iPad 768×1024:** the two-column Payment and Receipt layouts stack to one column under 900 px wide; the 560 px client panel goes full width under 600 px; no sideways scroll.
3. **Locking mid-flow:** locking while the client panel, a confirm dialog, the card menu or the Tools menu is open removes them all (the PR #6 rule extends to the new panel and the Tools menu).
4. **Long names:** a 60-character piece or client name wraps, never pushes the total or the buttons off screen.
5. **Live mode:** with the till in Live there is no Training band and no TRAINING strip on the receipt, and the layout does not leave an empty gap.

---

### Task 1: The kit (`ui/kit.css`, `ui/tools.js`) and its check

**Files:**
- Create: `ui/kit.css`, `ui/tools.js`, `ui/README.md`
- Create: `qa/kit.cjs`

**Interfaces:**
- Produces: CSS custom properties `--navy --navy-deep --slate --sky --mist --card --white --alert --sans --serif --tap` plus aliases with literal hex `--page:#FFFFFF --surface:#FFFFFF --surface-2:#EEF1F7 --ink:#001A4A --ink-2:#5B6478 --muted:#5B6478 --line:#D3DCE9 --grid:#D3DCE9 --border:#D3DCE9 --focus:#082966 --critical:#8C2F2F`, `--radius:0`.
- Produces classes: `.kit-head` (header bar, with `.kit-brand`, `.kit-rule`, `.kit-tool`, `.kit-spacer`, `.kit-hbtn` header buttons, `.kit-lang`), `.kit-tabs` / `.kit-tab` (`[aria-current="page"]` active), `.btn` + `.primary` / `.quiet` / `.danger` / `.big`, inputs (`input`, `select`, `textarea` base + `[aria-invalid="true"]`), `.lbl`, `.title` (page title), `.h2`, `.item`, `.keynum`, `.small`, `.tbl` (with `thead`/`th`/`td`, `.r` right-aligned), `.tag` + `.act` (navy fill) / `.info` (card fill) / `.done` (mist border, slate) / `.line` (navy outline) / `.alert` (alert outline), `.band` (card fill, navy text), `.panel-wrap` / `.panel-scrim` / `.panel` (right, 560 px, 2 px navy top rule; full width under 600 px), `.modal-wrap` / `.modal-scrim` / `.modal` (centred, 480 px for `.confirm`), `.toast` (+ `.err`), `.gate` / `.gate-card` / `.gate-mast` (lock card), `.notice` (card box, navy text), `.sr-only`.
- Produces JS (in `ui/tools.js`, no dependencies): `const KIT_TOOLS = [{ id, href, en, ru }]` — `sales ../sales/ Sales Продажи`, `crm ../crm/ Clients Клиенты`, `catalogue ../catalogue/ Catalogue Каталог`, `board ../board/ Board Доска` — and `function kitToolsMenu(currentId, lang) → HTMLElement`: a `.kit-hbtn` button "Tools"/"Инструменты" (`aria-haspopup="menu"`, `aria-expanded`) that toggles a `.kit-menu` list of links (the current tool shown as `aria-current="page"`, not a link); Escape and an outside click close it; it carries `data-kit-menu` so a tool can remove it on lock.

- [ ] **Step 1: Write the failing check `qa/kit.cjs`** (Node, no packages). It reads `ui/kit.css`, and the `<style>` blocks of every page in `const KIT_PAGES = ['sales/index.html']`, and asserts for each: every `#rgb/#rrggbb` hex is in the palette (case-insensitive); every `rgba(`/`rgb(` uses palette channels; every `border-radius` value is `0`; every `box-shadow` is `none`; no `prefers-color-scheme`, `data-theme`, `sysdark`. For `ui/kit.css` also: each produced custom property and class above is present; `--muted`, `--page`, `--surface-2` have literal hex. It also loads `ui/tools.js` in `vm` with a minimal fake `document` and asserts `KIT_TOOLS.length === 4` and the four ids. Prints `N kit checks passed`; exits 1 on the first failure with its label.
- [ ] **Step 2: Run** `node qa/kit.cjs` — Expected: FAIL (`ui/kit.css` missing).
- [ ] **Step 3: Write `ui/kit.css` and `ui/tools.js`** to the Interfaces and Global Constraints. `ui/README.md`: what the kit is, the class list one line each, how a `build.py` inlines it (CSS at `/*__KIT_CSS__*/`, JS file prepended to the modules), and that Evolventa is not embedded yet.
- [ ] **Step 4: Run** `node qa/kit.cjs` — Expected: FAIL only on `sales/index.html` (old Sales CSS: radii, shadows, off-palette). Temporarily confirm the kit part passes by running with `KIT_PAGES` limited via env `KIT_ONLY=1` (the check skips pages when `process.env.KIT_ONLY` is set) — Expected: PASS.
- [ ] **Step 5: Commit** `ui/` and `qa/kit.cjs` ("UI kit: shared stylesheet, tool switcher and kit check").

### Task 2: Sales on the kit — build, shell, header, tabs, band, lock, dialogs, all CSS compliant

**Files:**
- Modify: `sales/src/build.py`, `sales/src/template.html`, `sales/src/app.js`
- Modify: `qa/check-builds.py` (add `'sales'` to the tools tuple)
- Modify: `sales/src/qa/test.js` (re-point selectors only; add checks below)
- Rebuild: `sales/index.html`

**Interfaces:**
- Consumes: Task 1 classes, `KIT_TOOLS`, `kitToolsMenu(currentId, lang)`.
- Produces: `fmtDate(iso) → "16 Nov 2026" | "16 ноя 2026"` (Tashkent time zone, `Asia/Tashkent`) and `fmtDateNum(iso) → "16.11.2026"` in `app.js`, for Tasks 3–5. `lockDown()` additionally removes `.panel-wrap` and `[data-kit-menu] .kit-menu` / closes the Tools menu.

- [ ] **Step 1: Add the failing checks to `sales/src/qa/test.js`:** "kit: header has the Tools switcher with 4 tools" (`.kit-head` contains a `Tools` button; opening it lists Sales/Clients/Catalogue/Board, Sales marked current); "kit: no theme switch" (no element with title/aria-label matching /theme|тема/i); "kit: lock card has the mast and Unlock" (`#gate .gate-mast img` present, button text `Unlock`); "kit: lock closes the Tools menu"; "kit: no sideways scroll at 1024×768 and 768×1024 on the sale screen" (`document.documentElement.scrollWidth <= innerWidth`); "dates: fmtDate gives 16 Nov 2026 and 16 ноя 2026, fmtDateNum gives 16.11.2026" (evaluate in page for `2026-11-16T09:05:00Z`). Also make `node qa/kit.cjs` (full, not `KIT_ONLY`) the failing check for CSS.
- [ ] **Step 2: Run** `cd sales/src && python3 build.py && node qa/test.js` and `node ../../qa/kit.cjs` — Expected: the new checks FAIL, the 239 old ones pass; kit check FAILS on `sales/index.html`.
- [ ] **Step 3: Implement.** `build.py`: read `../../ui/kit.css` and replace the single `/*__KIT_CSS__*/` marker at the top of the template's `<style>`; prepend `../../ui/tools.js` to `MODULES`; assert both found. `template.html`: drop `data-theme`, the dark block and every own colour/radius/shadow token; keep only Sales layout rules written with kit tokens (status colours `--good/--warning/--serious` removed; use navy/slate/alert per G1). `app.js`: remove `THEME_KEY`, `applyTheme`, `toggleTheme`, `THEME_ICON` and their calls; `renderHeader()` builds the mockup header with `.kit-head` (wordmark → `../`, rule, "Sales" `.kit-tool`, spacer, `kitToolsMenu("sales", LANG)`, EN/RU `.kit-lang`, the staff label, Lock `.kit-hbtn`); tabs as `.kit-tabs`/`.kit-tab`; the Training band as `.band.training-band` (keep the `training-band` class — the suite uses it); `renderGate()` as the lock card (`.gate` on card ground, `.gate-card`, `.gate-mast` navy-deep with the wordmark and "Boutique tools"/"Инструменты бутика", label Passcode, `#gate-pass`, primary **Unlock**/«Открыть», under-line "Opens the till"/«Открывает кассу»); `modal()`/`confirmBox()`/`toast()` on kit classes (destructive confirm uses `.btn.danger`). Add `fmtDate`, `fmtDateNum` and the RU strings.
- [ ] **Step 4: Run** the suite and `node ../../qa/kit.cjs` and `python3 ../../qa/check-builds.py` and `node ../../qa/ui-foundations.cjs` — Expected: all pass (≥ 245 Sales checks, 0 failed).
- [ ] **Step 5: Commit** ("Sales on the UI kit: header with tool switcher, tabs, training band, lock card, no dark mode").

### Task 3: New sale screen and search results

**Files:** Modify `sales/src/sale.js`, `sales/src/template.html`, `sales/src/qa/test.js`; rebuild.

**Interfaces:** Consumes Task 2 shell. `stateWords(p)` keeps its meaning; adds `stateTag(p) → HTMLElement` (`.tag.act` In stock / В наличии, `.tag.info` Suspended sale / В отложенной продаже, `.tag.alert` Sold / Продано, others `.tag.done` with `stateWords(p)`).

- [ ] **Step 1: Failing checks:** "sale: title row has the Palatino title, seller select and Suspend" (`h1.title` text New sale; seller `select` and the Suspend button inside the same `.sale-head`); "search: results show status tags" (searching the mock gives at least one `.tag.act` In stock and one `.tag.alert` Sold for a sold piece); "sale: bottom bar holds client, total and Payment" (`.foot` contains `.client-slot`, `.total .keynum`, the Payment button); "sale: a 60-character piece name wraps inside 1024 wide" (add a mock piece with a 60-char model, add it, `scrollWidth <= innerWidth` and the Payment button is visible).
- [ ] **Step 2: Run** — Expected: new checks FAIL.
- [ ] **Step 3: Implement** to the mockup (spec "New sale", "Search results").
- [ ] **Step 4: Run** suite + `qa/kit.cjs` — Expected: all pass.
- [ ] **Step 5: Commit** ("Sales: new sale screen and search results on the kit").

### Task 4: Payment and receipt screens

**Files:** Modify `sales/src/pay.js`, `sales/src/template.html`, `sales/src/qa/test.js`; rebuild.

**Interfaces:** Consumes `fmtDateNum` (Task 2). Keeps every existing id the suite uses (`#add-cash` etc.); the card menu keeps working.

- [ ] **Step 1: Failing checks:** "pay: two columns at 1024 — methods left, summary right" (`.pay-main` and `.pay-side` side by side: `pay-side` left edge > `pay-main` left edge, same top ±4 px); "pay: stacks at 768 wide" (`pay-side` top ≥ `pay-main` bottom); "pay: summary shows To pay, Paid, Left to pay and Post sale" (texts present in `.pay-side`, Post sale is `.btn.primary`); "pay: cash notice is a .notice box and appears above 170 000 000 cash" (existing logic, new class); "receipt: preview on the left, Sale saved panel with Print receipt and New sale on the right"; "receipt: Live shows no TRAINING strip and no empty gap" (Live mode, `.rc-train` absent).
- [ ] **Step 2: Run** — Expected: new checks FAIL.
- [ ] **Step 3: Implement** to the mockup (spec "Payment", "Receipt"). Method buttons Cash / Uzcard / Humo / Visa / Transfer: if the current code adds cards through a Card ▾ menu, keep the menu's behaviour and test ids; the visible row may show the card types directly only if the suite's card checks still pass unchanged in meaning. Under 900 px the two columns stack. The receipt text from the database is shown as it comes; if its date is not `dd.mm.yyyy`, leave it and note it in the report.
- [ ] **Step 4: Run** suite + `qa/kit.cjs` — Expected: all pass.
- [ ] **Step 5: Commit** ("Sales: payment and receipt screens on the kit").

### Task 5: Client panel and Tickets

**Files:** Modify `sales/src/client.js`, `sales/src/tickets.js`, `sales/src/admin.js` (kit classes only), `sales/src/template.html`, `sales/src/qa/test.js`; rebuild.

**Interfaces:** Consumes `fmtDate`, `.panel`, `.tbl`, `.tag`. `#client-panel` stays the panel's id; its inner box becomes `.panel` (re-point `#client-panel .modal` checks to `#client-panel .panel`). `lockDown()` removal of `.panel-wrap` from Task 2 covers it.

- [ ] **Step 1: Failing checks:** "client: opens as a right panel 560 wide at 1024" (`#client-panel .panel` bounding box right edge = viewport width, width 560 ±1); "client: full width under 600 px" (viewport 560×900: width = viewport); "client: Use this client is primary, + New client secondary"; "tickets: table with card header and tags" (`.tbl thead`, a voided mock ticket has `.tag.alert` Void and its amount struck through, a sold one `.tag.act`); "tickets: dates read like 15 Nov 2026"; "tickets: count line reads 'N tickets · net … so'm'" (RU pluralised via existing `pl`); "lock: client panel gone" (existing, re-pointed).
- [ ] **Step 2: Run** — Expected: new checks FAIL.
- [ ] **Step 3: Implement** to the mockup (spec "Client", "Tickets"); Admin screen restyled with kit classes only, no layout change.
- [ ] **Step 4: Run** suite + `qa/kit.cjs` + `qa/check-builds.py` — Expected: all pass.
- [ ] **Step 5: Commit** ("Sales: client panel and tickets on the kit").

### Task 6: Screens check and docs

**Files:** Modify `sales/src/README.md`, `sales/src/qa/test.js` (screenshot pass only), `ui/README.md`.

- [ ] **Step 1:** Add to the suite, when `SHOTS` is set, screenshots of the seven screens at 1024×768 and the sale, payment and client screens at 768×1024, named `01-sale.png` … ; and one check per screen "no sideways scroll" at both sizes (these run always).
- [ ] **Step 2: Run** `SHOTS=/tmp/kit-shots node qa/test.js` — Expected: all pass, PNGs written.
- [ ] **Step 3:** Update `sales/src/README.md` (build now inlines `ui/kit.css` and `ui/tools.js`; no theme; date helpers) and `ui/README.md` (Sales is the first user).
- [ ] **Step 4: Run** full suite, `node qa/kit.cjs`, `python3 qa/check-builds.py`, `node qa/ui-foundations.cjs` from the repo root — Expected: all pass.
- [ ] **Step 5: Commit** ("Sales: screen checks at iPad sizes; docs").
