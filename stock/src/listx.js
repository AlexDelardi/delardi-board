/* ===========================================================================
   Table tools, as on the CRM list
   - Click a column heading to sort by it on the server; click again to reverse.
     An arrow and aria-sort show the current sort. Price and Since start with
     the largest; the others with A.
   - A ▾ beside Brand and State (and Store in Training) opens a checklist of
     that column's values with a count for each under the other filters, like
     Excel: search (long lists), Select all, Apply, Clear filter.
   - Several values at once live in S.filters.multi; the select in the filter
     bar for the same column then reads "Several (n)". One value is the select's
     own value; all of them is no filter.
   - "Clear filters" takes every filter and the sort off.
   The download carries the same filters and order (listFilters()).
   ========================================================================= */
Object.assign(RU, {
  "Sort by {col}": "Сортировать: {col}",
  "Filter {col}": "Фильтр: {col}",
  "Several ({n})": "Несколько ({n})",
  "Select all": "Выбрать все",
  "Apply": "Применить",
  "Clear filter": "Сбросить фильтр",
  "Clear filters": "Сбросить фильтры",
  "Search the values": "Поиск по значениям",
  "Loading the values…": "Загружаю значения…",
  "No values under these filters.": "При этих фильтрах значений нет.",
  "Nothing matches.": "Ничего не найдено.",
});

// [sort key, heading, th class, first direction, checklist column or null]
const LIST_COLS = [
  ["serial", "Serial", "", "asc", null],
  ["brand", "Brand", "", "asc", "brand"],
  ["article", "Reference / Model", "", "asc", null],
  [null, "Size", "", null, null],
  ["store", "Store", "", "asc", "store"],          // Training only
  ["state", "State", "", "asc", "state"],
  ["since", "Since", "", "desc", null],
  ["price", "Price", "r", "desc", null],
];
const listCols = () => LIST_COLS.filter((c) => S.training || c[0] !== "store");
const MULTI_KEYS = ["brand", "state", "store"];    // checklist column = the single filter's key in S.filters
const blankMulti = () => ({ brand: [], state: [], store: [] });
const blankFilters = () => ({ q: "", state: "", brand: "", category: "", store: "", price_min: null, price_max: null, sort: "", multi: blankMulti() });
S.filters = blankFilters();
S.facet = null;

function sortState() {
  const [col, dir] = String(S.filters.sort || "").split(".");
  return col ? { col, dir: dir === "desc" ? "desc" : "asc" } : { col: null, dir: null };
}
function sortBy(col) {
  const def = LIST_COLS.find((c) => c[0] === col), now = sortState();
  S.filters.sort = col + "." + (now.col === col ? (now.dir === "asc" ? "desc" : "asc") : def[3]);
  toolsChanged();
}
const anyFilterOn = () => {
  const f = S.filters;
  return !!(f.q || f.state || f.brand || f.category || f.store || f.price_min !== null || f.price_max !== null || f.sort
    || MULTI_KEYS.some((k) => f.multi[k].length));
};
function clearFilters() {
  clearTimeout(S.qTimer);
  S.filters = blankFilters();
  S.page = 1;
  closeFacet(true);
  renderAll();                                     // every control is redrawn from the blank filters; the list is asked again
}
// What the list asks the server for beyond the single values: the lists and the sort.
function listFiltersX(out) {
  const f = S.filters, m = f.multi;
  if (m.state.length) out.states = m.state.slice();
  if (m.brand.length) out.brands = m.brand.slice();
  if (S.training && m.store.length) out.stores = m.store.slice();
  if (f.sort) out.sort = f.sort;
  return out;
}
// The sort or a checklist changed: the heading row and the selects are redrawn, the keyboard stays on the heading.
function toolsChanged() {
  const a = document.activeElement;
  const key = a && a.closest && a.closest("table.pieces thead")
    ? (a.dataset.sort ? '.th-sort[data-sort="' + a.dataset.sort + '"]' : a.dataset.facet ? '.th-filter[data-facet="' + a.dataset.facet + '"]' : null) : null;
  S.page = 1;
  drawListHead();
  syncFilterControls();
  if (key) { const b = document.querySelector("table.pieces thead " + key); if (b) b.focus(); }
  loadList();
}
function drawListHead() {
  const row = $("#list-head");
  if (!row) return;
  const { col: sc, dir } = sortState();
  row.innerHTML = "";
  for (const [key, label, cls, , facet] of listCols()) {
    const on = key !== null && sc === key, text = tr(label);
    const filtered = !!(facet && (S.filters.multi[facet].length || S.filters[facet]));
    row.append(el("th", { scope: "col", class: [cls, on ? "sorted" : ""].join(" ").trim() || null, "aria-sort": on ? (dir === "asc" ? "ascending" : "descending") : null },
      key === null ? text : el("div", { class: "th-in" },
        el("button", { type: "button", class: "th-sort", "data-sort": key, title: tr("Sort by {col}", { col: text }), onclick: () => sortBy(key) },
          text, el("span", { class: "arr", "aria-hidden": "true", text: on ? (dir === "asc" ? "↑" : "↓") : "↕" })),
        facet ? el("button", { type: "button", class: "th-filter" + (filtered ? " on" : ""), "data-facet": facet, "aria-haspopup": "dialog",
          "aria-expanded": S.facet && S.facet.col === facet ? "true" : "false", "aria-label": tr("Filter {col}", { col: text }), title: tr("Filter {col}", { col: text }),
          onclick: (ev) => { ev.stopPropagation(); if (S.facet && S.facet.col === facet) closeFacet(); else openFacet(facet); } },
          el("span", { "aria-hidden": "true", text: "▾" })) : null)));
  }
  const clear = $("#f-clear-box");
  if (clear) {
    clear.innerHTML = "";
    if (anyFilterOn()) clear.append(el("button", { type: "button", class: "btn", id: "f-clear", onclick: clearFilters, text: tr("Clear filters") }));
  }
}
// A select whose column has several values chosen shows "Several (n)"; choosing a single value there drops the several.
function syncMultiSelects() {
  for (const k of MULTI_KEYS) {
    const s = $("#f-" + k);
    if (!s) continue;
    const n = S.filters.multi[k].length;
    let o = s.querySelector('option[value="__multi"]');
    if (n && !o) { o = el("option", { value: "__multi" }); s.append(o); }
    if (!n && o) { o.remove(); o = null; }
    if (o) o.textContent = tr("Several ({n})", { n });
    const want = n ? "__multi" : S.filters[k];
    if (s.value !== want) s.value = want;
  }
}
// A select or a totals card set one value: that column's several go.
function singleChosen(key, value) {
  if (value === "__multi") return false;           // the "Several (n)" line itself: nothing changes
  S.filters[key] = value;
  S.filters.multi[key] = [];
  return true;
}

/* ------------------------------------------------------------- checklists */
function facetLabel(col, x) { return col === "state" ? stateWord(x.value) : col === "store" ? (x.label || x.value) : x.value; }
function facetChosen(col, values) {
  const m = S.filters.multi[col], one = S.filters[col], all = values.map((x) => x.value);
  if (m.length) return new Set(m);
  return new Set(one ? all.filter((v) => v === one) : all);
}
let facetSeq = 0;
async function openFacet(col) {
  closeFacet(true);
  const f = { col, loading: true, error: null, values: [], chosen: new Set(), q: "", seq: ++facetSeq, training: S.training };
  S.facet = f;
  renderFacet();
  try {
    const filters = listFilters();
    delete filters.page; delete filters.sort;
    const r = await api(act("facet"), { filters, column: col });
    f.values = (r.values || []).filter((x) => !blank(x.value));
    f.chosen = facetChosen(col, f.values);
  } catch (e) { f.error = e.message; }
  if (S.facet !== f || S.locked || f.training !== S.training) return;   // closed, locked or switched meanwhile: nothing is drawn
  f.loading = false;
  renderFacet();
  const first = $("#facet-pop input[type=search], #facet-pop input[type=checkbox]");
  if (first) first.focus();
}
function closeFacet(quiet) {
  const f = S.facet;
  S.facet = null;
  const pop = $("#facet-pop");
  if (pop) pop.remove();
  document.querySelectorAll(".th-filter[aria-expanded=true]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  if (!quiet && f) { const b = document.querySelector('.th-filter[data-facet="' + f.col + '"]'); if (b) b.focus(); }
}
// One value goes to the filter bar's select; several stay a list; all of them is no filter at all.
function applyFacet(col, chosen, all) {
  const vals = all.filter((v) => chosen.has(v));
  S.filters[col] = ""; S.filters.multi[col] = [];
  if (vals.length && vals.length < all.length) {
    if (vals.length === 1) S.filters[col] = vals[0]; else S.filters.multi[col] = vals;
  }
  closeFacet();
  toolsChanged();
}
function renderFacet() {
  const f = S.facet;
  let pop = $("#facet-pop");
  if (!f) { if (pop) pop.remove(); return; }
  const def = LIST_COLS.find((c) => c[4] === f.col);
  if (!pop) { pop = el("div", { id: "facet-pop", class: "facet-pop", role: "dialog" }); document.body.appendChild(pop); }
  pop.setAttribute("aria-label", tr("Filter {col}", { col: tr(def[1]) }));
  // redraw in place, keeping the keyboard on the same box
  const redraw = () => {
    const a = document.activeElement, row = a && a.closest ? a.closest(".fp-row") : null;
    const key = !row ? null : row.classList.contains("fp-all") ? ".fp-all input" : '.fp-row[data-value="' + CSS.escape(row.dataset.value || "") + '"] input';
    renderFacet();
    if (key) { const n = document.querySelector("#facet-pop " + key); if (n) n.focus(); }
  };
  pop.innerHTML = "";
  if (f.loading) pop.append(el("p", { class: "small fp-msg", role: "status", text: tr("Loading the values…") }));
  else if (f.error) pop.append(el("p", { class: "notice fp-msg", role: "alert", text: f.error }));
  else if (!f.values.length) pop.append(el("p", { class: "small fp-msg", text: tr("No values under these filters.") }));
  else {
    const q = f.q.trim().toLowerCase();
    const shown = f.values.filter((x) => !q || facetLabel(f.col, x).toLowerCase().includes(q) || String(x.value).toLowerCase().includes(q));
    const allOn = shown.length > 0 && shown.every((x) => f.chosen.has(x.value));
    if (f.values.length > 7) {
      pop.append(el("input", { type: "search", class: "fp-q", placeholder: tr("Search the values"), "aria-label": tr("Search the values"), value: f.q,
        oninput: (e) => { f.q = e.target.value; const pos = e.target.selectionStart; renderFacet();
          const n = document.querySelector("#facet-pop .fp-q"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* not a text field */ } } } }));
    }
    pop.append(
      el("label", { class: "fp-row fp-all" },
        el("input", { type: "checkbox", checked: allOn ? true : null,
          onchange: (e) => { shown.forEach((x) => (e.target.checked ? f.chosen.add(x.value) : f.chosen.delete(x.value))); redraw(); } }),
        el("span", { text: tr("Select all") })),
      el("div", { class: "fp-list", role: "group", "aria-label": tr(def[1]) },
        shown.length ? shown.map((x) => el("label", { class: "fp-row", "data-value": x.value },
          el("input", { type: "checkbox", value: x.value, checked: f.chosen.has(x.value) ? true : null,
            onchange: (e) => { if (e.target.checked) f.chosen.add(x.value); else f.chosen.delete(x.value); redraw(); } }),
          el("span", { class: "fp-l", text: facetLabel(f.col, x) }),
          el("span", { class: "fp-n", text: String(x.count) })))
          : el("p", { class: "small fp-msg", text: tr("Nothing matches.") })),
      el("div", { class: "fp-actions" },
        el("button", { type: "button", class: "btn primary", "data-act": "fp-apply", disabled: f.chosen.size ? null : true,
          onclick: () => applyFacet(f.col, f.chosen, f.values.map((x) => x.value)), text: tr("Apply") }),
        el("button", { type: "button", class: "btn", "data-act": "fp-clear",
          onclick: () => applyFacet(f.col, new Set(), f.values.map((x) => x.value)), text: tr("Clear filter") })));
  }
  const btn = document.querySelector('.th-filter[data-facet="' + f.col + '"]');
  if (btn) {
    btn.setAttribute("aria-expanded", "true");
    const r = btn.getBoundingClientRect(), w = 280;
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + window.scrollY + 4) + "px";
  }
}
document.addEventListener("mousedown", (e) => {
  if (!S.facet) return;
  const pop = $("#facet-pop");
  if ((pop && pop.contains(e.target)) || (e.target.closest && e.target.closest(".th-filter"))) return;
  closeFacet(true);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.facet) { e.preventDefault(); e.stopImmediatePropagation(); closeFacet(); }
}, true);
window.addEventListener("resize", () => { if (S.facet) closeFacet(true); });
