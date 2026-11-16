# Delardi UI kit

One shared stylesheet (`kit.css`) and tool switcher (`tools.js`) that every in-store tool inlines. Palette only (navy, navy-deep, slate, sky, mist, card, white, alert), radius 0, no shadows, no dark mode. Sales (`sales/`) is the first tool on the kit; the others follow. Check: `node qa/kit.cjs` (`KIT_ONLY=1` skips the tool pages).

## Classes

- `.kit-head` header bar (wordmark 26 px high); inside: `.kit-brand`, `.kit-staff` (signed-in name, white 14 px, truncated with an ellipsis past 200 px), `.kit-rule`, `.kit-tool`, `.kit-spacer`, `.kit-hbtn` (header button), `.kit-lang` (EN/RU pair, active half `[aria-pressed="true"]` or `.on`), `.kit-tool-wrap` (wrapper of the switcher), `.kit-menu` (Tools dropdown).
- `.kit-tabs` / `.kit-tab` tab row (tabs 48 px high, 28 px apart); active tab `[aria-current="page"]`.
- `.btn` with `.primary`, `.quiet`, `.danger`, `.big`.
- `input`, `select`, `textarea` styled by element; `[aria-invalid="true"]` for errors; `.lbl` field label.
- `.title` page title, `.h2` section title, `.item` item name (Palatino 17/1.35, normal weight, never bold), `.keynum` key number, `.small` small text.
- `.tbl` table (`thead`, `th`, `td`, `.r` right-aligned); body rows are at least 48 px high (`.tbl tbody tr { height: 48px }`: a row height is a minimum in a table, `td` min-height does nothing).
- `.tag` with `.act` (navy fill), `.info` (card fill), `.done` (mist border), `.line` (navy outline), `.alert` (alert outline).
- `.band` full-width card strip (13 px text); `.notice` card box.
- `.panel-wrap` / `.panel-scrim` / `.panel` right detail panel (560 px, full width under 600 px).
- `.modal-wrap` / `.modal-scrim` / `.modal` centred dialog (`.confirm` is 480 px).
- `.toast` (`.err` for errors).
- `.gate` / `.gate-card` / `.gate-mast` lock card.
- `.sr-only` visually hidden text.

Legacy variables `--muted`, `--page`, `--surface-2` (and the other aliases) are kept with literal hex values; `qa/ui-foundations.cjs` reads them.

## Stacking order

Lowest to highest: header `.kit-head` (50), its menu (60), `.panel-wrap` (100), `.modal-wrap` (110), `.gate` lock card (115, fixed full-screen), `.toast` (120). The kit sets these, so a new tool needs no z-index overrides: the lock card covers any open panel or dialog, and a toast shows above the lock card. A tool that adds its own layers keeps to this order.

## JS

`KIT_TOOLS` lists the four tools. `kitToolsMenu(currentId, lang, opts)` returns an element (`data-kit-menu`) holding a "Tools" / "Инструменты" button and a `.kit-menu` list; the current tool is shown as `aria-current="page"` and is not a link. Escape and an outside click close it. A tool calls `kitCloseMenus()` on lock (closes every open kit menu and removes its document listeners) and then removes the element. The menu is a plain disclosure (`aria-expanded`, a list of links) and also closes when focus leaves it.

Leaving the page can ask first. `opts.beforeLeave(href)` (optional) returns a Promise: `true` follows the link, `false` stays. The menu calls it before any tool link is followed; `kitGuardLink(a, beforeLeave)` does the same for any other link (the `.kit-brand` wordmark). A modified click (Ctrl/Cmd, a new tab) is left alone. The kit does not know what a tool keeps on screen: the tool decides. Sales asks with its confirm dialog when the sale on screen has lines ("Leave the till?" / «Уйти из кассы?»).

## Adopting the kit in a second tool

- **Lock:** on lock the tool calls `kitCloseMenus()` and removes its own `.panel-wrap` and `.modal-wrap` elements (the kit does not know which are open), then shows the `.gate`. Make the page behind the card `inert` while locked so Tab cannot reach the header, and clear it on unlock.
- **Wordmark:** `.kit-brand` holds the white wordmark PNG from `brand/` (`brand/wordmark_white.png`, inlined as a data URI by the tool's `build.py`), 26 px high, linking to the landing page (`../`).
- **Global rules:** the kit styles elements, not only classes: `* { border-radius: 0 }`, `input, select, textarea { width: 100%; min-height: 44px }` and the `body` font. An existing form will change: inline fields and narrow selects need a `width` of their own, checkboxes and radios are reset to 20 px.
- **Order of scripts:** `tools.js` defines functions only; call them from the tool's own boot code, never from top-level code that runs before `tools.js` is in the script.

## Inlining from a `build.py`

Replace the `/*__KIT_CSS__*/` marker in the template's `<style>` with the contents of `ui/kit.css`, and prepend `ui/tools.js` to the tool's JS modules.

## Not yet

The Evolventa font is not embedded; the stack falls back to Century Gothic / Segoe UI.
