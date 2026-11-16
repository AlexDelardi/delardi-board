# Delardi UI kit

One shared stylesheet (`kit.css`) and tool switcher (`tools.js`) that every in-store tool inlines. Palette only (navy, navy-deep, slate, sky, mist, card, white, alert), radius 0, no shadows, no dark mode. Sales (`sales/`) is the first tool on the kit; the others follow. Check: `node qa/kit.cjs` (`KIT_ONLY=1` skips the tool pages).

## Classes

- `.kit-head` header bar (wordmark 26 px high); inside: `.kit-brand`, `.kit-staff` (signed-in name, white 14 px), `.kit-rule`, `.kit-tool`, `.kit-spacer`, `.kit-hbtn` (header button), `.kit-lang` (EN/RU pair, active half `[aria-pressed="true"]` or `.on`), `.kit-tool-wrap` (wrapper of the switcher), `.kit-menu` (Tools dropdown).
- `.kit-tabs` / `.kit-tab` tab row (tabs 48 px high, 28 px apart); active tab `[aria-current="page"]`.
- `.btn` with `.primary`, `.quiet`, `.danger`, `.big`.
- `input`, `select`, `textarea` styled by element; `[aria-invalid="true"]` for errors; `.lbl` field label.
- `.title` page title, `.h2` section title, `.item` item name (Palatino 17/1.35, normal weight, never bold), `.keynum` key number, `.small` small text.
- `.tbl` table (`thead`, `th`, `td`, `.r` right-aligned).
- `.tag` with `.act` (navy fill), `.info` (card fill), `.done` (mist border), `.line` (navy outline), `.alert` (alert outline).
- `.band` full-width card strip (13 px text); `.notice` card box.
- `.panel-wrap` / `.panel-scrim` / `.panel` right detail panel (560 px, full width under 600 px).
- `.modal-wrap` / `.modal-scrim` / `.modal` centred dialog (`.confirm` is 480 px).
- `.toast` (`.err` for errors).
- `.gate` / `.gate-card` / `.gate-mast` lock card.

## Stacking order

Lowest to highest: header `.kit-head` (50), its menu (60), `.panel-wrap` (100), `.modal-wrap` (110), `.gate` lock card (115), `.toast` (120). The kit sets these, so a new tool needs no z-index overrides: the lock card covers any open panel or dialog, and a toast shows above the lock card. A tool that adds its own layers keeps to this order.
- `.sr-only` visually hidden text.

Legacy variables `--muted`, `--page`, `--surface-2` (and the other aliases) are kept with literal hex values; `qa/ui-foundations.cjs` reads them.

## JS

`KIT_TOOLS` lists the four tools. `kitToolsMenu(currentId, lang)` returns an element (`data-kit-menu`) holding a "Tools" / "Инструменты" button and a `.kit-menu` list; the current tool is shown as `aria-current="page"` and is not a link. Escape and an outside click close it. A tool calls `kitCloseMenus()` on lock (closes every open kit menu and removes its document listeners) and then removes the element. The menu is a plain disclosure (`aria-expanded`, a list of links) and also closes when focus leaves it.

## Inlining from a `build.py`

Replace the `/*__KIT_CSS__*/` marker in the template's `<style>` with the contents of `ui/kit.css`, and prepend `ui/tools.js` to the tool's JS modules.

## Not yet

The Evolventa font is not embedded; the stack falls back to Century Gothic / Segoe UI.
