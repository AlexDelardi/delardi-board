# Delardi UI kit

One shared stylesheet (`kit.css`) and tool switcher (`tools.js`) that every in-store tool inlines. Palette only (navy, navy-deep, slate, sky, mist, card, white, alert), radius 0, no shadows, no dark mode. Check: `node qa/kit.cjs` (`KIT_ONLY=1` skips the tool pages).

## Classes

- `.kit-head` header bar; inside: `.kit-brand`, `.kit-rule`, `.kit-tool`, `.kit-spacer`, `.kit-hbtn` (header button), `.kit-lang` (EN/RU pair, active half `[aria-pressed="true"]` or `.on`), `.kit-menu` (Tools dropdown).
- `.kit-tabs` / `.kit-tab` tab row; active tab `[aria-current="page"]`.
- `.btn` with `.primary`, `.quiet`, `.danger`, `.big`.
- `input`, `select`, `textarea` styled by element; `[aria-invalid="true"]` for errors; `.lbl` field label.
- `.title` page title, `.h2` section title, `.item` item name, `.keynum` key number, `.small` small text.
- `.tbl` table (`thead`, `th`, `td`, `.r` right-aligned).
- `.tag` with `.act` (navy fill), `.info` (card fill), `.done` (mist border), `.line` (navy outline), `.alert` (alert outline).
- `.band` full-width card strip; `.notice` card box.
- `.panel-wrap` / `.panel-scrim` / `.panel` right detail panel (560 px, full width under 600 px).
- `.modal-wrap` / `.modal-scrim` / `.modal` centred dialog (`.confirm` is 480 px).
- `.toast` (`.err` for errors).
- `.gate` / `.gate-card` / `.gate-mast` lock card.
- `.sr-only` visually hidden text.

Legacy variables `--muted`, `--page`, `--surface-2` (and the other aliases) are kept with literal hex values; `qa/ui-foundations.cjs` reads them.

## JS

`KIT_TOOLS` lists the four tools. `kitToolsMenu(currentId, lang)` returns an element (`data-kit-menu`) holding a "Tools" / "Инструменты" button and a `.kit-menu` list; the current tool is shown as `aria-current="page"` and is not a link. Escape and an outside click close it. A tool removes the element on lock.

## Inlining from a `build.py`

Replace the `/*__KIT_CSS__*/` marker in the template's `<style>` with the contents of `ui/kit.css`, and prepend `ui/tools.js` to the tool's JS modules.

## Not yet

The Evolventa font is not embedded; the stack falls back to Century Gothic / Segoe UI.
