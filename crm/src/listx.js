/* ===========================================================================
   The list, Step 1b (API v11)
   - Click a column header to sort by it on the server; click again to
     reverse. An arrow and aria-sort show the current sort.
   - A ▾ beside Status, ABC, Segment, Lifecycle and Owner opens a checklist
     of that column's values with a count for each under the other filters,
     like Excel: search, select all, Apply, Clear. Several values at once.
     The filter bar's selects stay in step ("Several (n)").
   - A "Last contact" column, and a filter for clients not contacted in 30,
     60 or 90 days (or never).
   - "My clients" for a login linked to a sales rep label: a shortcut, on by
     default once per session.
   - On a phone the same sorts and checklists sit in the ☰ menu under
     "Sort and filter".
   ========================================================================= */
Object.assign(RU, {
  "Sort and filter": "Сортировка и фильтры",
  "Sort by {col}": "Сортировать: {col}",
  "Filter {col}": "Фильтр: {col}",
  "Several ({n})": "Несколько ({n})",
  "Select all": "Выбрать все",
  "Apply": "Применить",
  "Clear filter": "Сбросить фильтр",
  "Search the values": "Поиск по значениям",
  "Loading the values…": "Загружаю значения…",
  "No values under these filters.": "При этих фильтрах значений нет.",
  "Nothing matches.": "Ничего не найдено.",
  "Filter by column": "Фильтр по столбцу",
  "{n} chosen": "выбрано: {n}",
  "Not contacted": "Без контакта",
  "Any time": "Неважно",
  "30+ days": "30+ дней",
  "60+ days": "60+ дней",
  "90+ days": "90+ дней",
  "not contacted in {n} days": "без контакта {n} дн.",
  "{col}: {vals}": "{col}: {vals}",
  "{n}+ days": "{n}+ дней",
  "Name A–Z": "По имени, А–Я",
  "Most recent contact": "Недавний контакт",
  "Longest since contact": "Давно без контакта",
  "By {col}, {dir}": "По столбцу «{col}», {dir}",
  "ascending": "по возрастанию",
  "descending": "по убыванию",
  "My clients": "Мои клиенты",
  "my clients": "мои клиенты",
});

/* -------------------------------------------------------------- the columns */
// key, heading, cell class, first direction, checklist column
const LIST_COLS = [
  ["name", "Client", "", "asc", null],
  ["status", "Status", "", "asc", "status"],
  ["abc", "ABC", "col-abc", "asc", "abc"],
  ["segment", "Segment", "col-seg", "asc", "segment"],
  ["lifecycle", "Lifecycle", "col-life", "asc", "lifecycle"],
  ["owner", "Owner", "col-owner", "asc", "owner"],
  ["last", "Last purchase", "col-last num", "desc", null],
  ["contact", "Last contact", "col-contact num", "desc", null],
  ["spend", "Lifetime spend", "col-sp num", "desc", null],
];
const FACETS = ["status", "abc", "segment", "lifecycle", "owner"];
// The select in the filter bar that each checklist stays in step with.
const FACET_SELECT = { status: "status", abc: "abc_class", lifecycle: "lifecycle_status", owner: "owner" };
const SELECT_FACET = { status: "status", abc_class: "abc", lifecycle_status: "lifecycle", owner: "owner" };
const LEGACY_SORT = { spend: "spend.desc", spend_asc: "spend.asc", recent: "last.desc", oldest: "last.asc", id: "id.asc" };
SORTS.push(["name.asc", "Name A–Z"], ["contact.desc", "Most recent contact"], ["contact.asc", "Longest since contact"]);
FILTER_KEYS.push("contact");
// Not contacted in N days, or never.
const CONTACT_FILTER = [["", "Any time"], ["30", "30+ days"], ["60", "60+ days"], ["90", "90+ days"]];
Object.assign(S, { facet: null, navFacet: null });

function sortState() {
  const s = LEGACY_SORT[S.f.sort] || S.f.sort || "spend.desc";
  const [col, dir] = String(s).split(".");
  return { col, dir: dir === "asc" ? "asc" : "desc" };
}
function sortKeyFor(col, dir) {
  const k = col + "." + dir;
  return Object.keys(LEGACY_SORT).find((x) => LEGACY_SORT[x] === k) || k;
}
function sortBy(col) {
  const def = LIST_COLS.find((c) => c[0] === col);
  const now = sortState();
  const dir = now.col === col ? (now.dir === "asc" ? "desc" : "asc") : (def ? def[3] : "desc");
  setFilter({ sort: sortKeyFor(col, dir) });
}
function sortOptions() {
  const list = SORTS.map(([v, t]) => [v, tr(t)]);
  if (!list.some((o) => o[0] === S.f.sort)) {
    const { col, dir } = sortState();
    const def = LIST_COLS.find((c) => c[0] === col);
    list.push([S.f.sort, tr("By {col}, {dir}", { col: def ? tr(def[1]) : col, dir: tr(dir === "asc" ? "ascending" : "descending") })]);
  }
  return list;
}
// A select that stands for a column with several values chosen shows "Several (n)".
function withMulti(key, options) {
  const col = SELECT_FACET[key];
  const n = col ? (S.f.multi[col] || []).length : 0;
  return n ? options.concat([["__multi", tr("Several ({n})", { n })]]) : options;
}
function selectValue(key) {
  const col = SELECT_FACET[key];
  return col && (S.f.multi[col] || []).length ? "__multi" : S.f[key];
}
// The selects are drawn once; their options follow the sort and the checklists.
function refreshSelects() {
  document.querySelectorAll("select[data-key]").forEach((s) => {
    const k = s.dataset.key;
    let opts = null;
    if (k === "sort") opts = sortOptions();
    else if (SELECT_FACET[k]) opts = withMulti(k, [...s.options].filter((o) => o.value !== "__multi").map((o) => [o.value, o.textContent]));
    if (opts) { s.innerHTML = ""; opts.forEach(([v, t]) => s.appendChild(el("option", { value: v, text: t }))); }
    s.value = selectValue(k);
  });
  document.querySelectorAll(".facet-btn .fb-l").forEach((n) => { n.textContent = segmentLabel(); });
}
// Picking one value in a select clears that column's checklist, and back.
function multiPatch(patch) {
  const out = { ...patch };
  for (const [k, col] of Object.entries(SELECT_FACET)) {
    if (!(k in out)) continue;
    if (out[k] === "__multi") { delete out[k]; continue; }
    if (!("multi" in patch) && (S.f.multi[col] || []).length) out.multi = { ...(out.multi || S.f.multi), [col]: [] };
  }
  return out;
}
function activeFilterCount() {
  const m = S.f.multi || {};
  const multiOnly = ["segment"].filter((c) => (m[c] || []).length).length;
  const multiSel = Object.keys(SELECT_FACET).filter((k) => !S.f[k] && (m[SELECT_FACET[k]] || []).length).length;
  return FILTER_KEYS.filter((k) => S.f[k]).length + multiOnly + multiSel + (S.f.drill ? 1 : 0);
}
// What the list asks the server for, beyond the single-value filters.
function listParamsX(f, p) {
  const m = f.multi || {};
  if ((m.status || []).length) { p.statuses = m.status.slice(); delete p.status; }
  if ((m.abc || []).length) { p.abc_classes = m.abc.slice(); delete p.abc_class; }
  if ((m.lifecycle || []).length) { p.lifecycles = m.lifecycle.slice(); delete p.lifecycle_status; }
  if ((m.segment || []).length) { p.segments = m.segment.slice(); delete p.rfm_segment; }
  if ((m.owner || []).length) { p.owners = m.owner.slice(); delete p.client_owner; }
  if (f.contact) p.not_contacted = Number(f.contact);
  if (/\./.test(f.sort || "")) {
    const [col, dir] = f.sort.split(".");
    p.order_by = col; p.dir = dir; delete p.sort;
  }
  return p;
}
// v14: what is switched on, as one list — the filter bar shows these as pills
// instead of nine selects standing by in case they are wanted. One entry per
// thing in force, each able to take itself off.
// Escape closes the filter panel, as it does every other layer here.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.filtersOpen && !S.cardId && !S.add && !S.exp) {
    const btn = document.querySelector(".filters-toggle");
    toggleFilters(false);
    if (btn) btn.focus();
  }
});

function activeFilterPills() {
  const f = S.f, m = f.multi || {}, out = [];
  const clearSel = (k) => () => setFilter({ [k]: "" });
  const clearMulti = (col) => () => setFilter({ multi: { ...S.f.multi, [col]: [] } });
  // the single-value selects
  if (f.status) out.push({ label: tr("Status"), value: tr((STATUS_OPTIONS.find((o) => o[0] === f.status) || ["", f.status])[1]), clear: clearSel("status") });
  if (f.owner) out.push({ label: tr("Owner"), value: (ownerOptions().find((o) => o[0] === f.owner) || ["", f.owner])[1], clear: clearSel("owner") });
  if (f.type) out.push({ label: tr("Records"), value: tr((TYPES.find((t) => t[0] === f.type) || ["", f.type])[1]), clear: clearSel("type") });
  if (f.abc_class) out.push({ label: "ABC", value: f.abc_class, clear: clearSel("abc_class") });
  if (f.lifecycle_status) out.push({ label: tr("Lifecycle"), value: tr(f.lifecycle_status), clear: clearSel("lifecycle_status") });
  // the column checklists, where more than one value is chosen
  for (const col of FACETS) {
    const v = m[col] || [];
    if (!v.length) continue;
    const def = LIST_COLS.find((c) => c[0] === col);
    out.push({ label: col === "abc" ? "ABC" : tr(def[1]), value: v.map((x) => facetLabel(col, x)).join(", "), clear: clearMulti(col) });
  }
  if (f.contact) out.push({ label: tr("Not contacted"), value: tr("{n}+ days", { n: f.contact }), clear: clearSel("contact") });
  if (f.drill && f.drill.label) {
    out.push({ label: tr("From insights"), value: f.drill.label,
      clear: () => { S.f.drill = null; S.f.offset = 0; renderToolbarValues(); loadList(); } });
  }
  return out;
}

function describeFiltersX() {
  const f = S.f, m = f.multi || {}, parts = [];
  for (const col of FACETS) {
    const v = m[col] || [];
    if (!v.length) continue;
    const def = LIST_COLS.find((c) => c[0] === col);
    parts.push(tr("{col}: {vals}", { col: tr(def[1]).toLowerCase(), vals: v.map((x) => facetLabel(col, x)).join(", ") }));
  }
  if (f.contact) parts.push(tr("not contacted in {n} days", { n: f.contact }));
  return parts;
}

/* ----------------------------------------------------------- the list table */
function listHeader() {
  const { col: sc, dir } = sortState();
  return el("tr", {}, LIST_COLS.map(([key, label, cls, , facet]) => {
    const on = sc === key;
    const text = key === "abc" ? "ABC" : tr(label);
    const m = facet ? (S.f.multi[facet] || []) : [];
    const selKey = facet && FACET_SELECT[facet];
    const filtered = !!(m.length || (selKey && S.f[selKey]) || (facet === "segment" && S.f.quick === "cannot"));
    return el("th", { scope: "col", class: [cls, on ? "sorted" : ""].join(" ").trim() || null, "aria-sort": on ? (dir === "asc" ? "ascending" : "descending") : null }, [
      el("div", { class: "th-in" }, [
        el("button", { type: "button", class: "th-sort", "data-sort": key, title: tr("Sort by {col}", { col: text }),
          onclick: () => sortBy(key) }, [text, el("span", { class: "arr", "aria-hidden": "true", text: on ? (dir === "asc" ? "↑" : "↓") : "↕" })]),
        facet ? el("button", { type: "button", class: "th-filter" + (filtered ? " on" : ""), "data-facet": facet, "aria-haspopup": "dialog",
          "aria-expanded": S.facet && S.facet.col === facet ? "true" : "false", "aria-label": tr("Filter {col}", { col: text }), title: tr("Filter {col}", { col: text }),
          onclick: (ev) => { ev.stopPropagation(); toggleFacet(facet, ev.currentTarget); } }, [el("span", { "aria-hidden": "true", text: "▾" })]) : null,
      ]),
    ]);
  }));
}
// Sorting or filtering from a header redraws the table; the keyboard stays on
// the same header button.
function headFocusKey() {
  const a = document.activeElement;
  if (!a || !a.closest || !a.closest("table.clients thead")) return null;
  return a.dataset.sort ? '[data-sort="' + a.dataset.sort + '"]' : a.dataset.facet ? '.th-filter[data-facet="' + a.dataset.facet + '"]' : null;
}
function restoreHeadFocus(sel) {
  if (!sel) return;
  const b = document.querySelector("table.clients thead " + sel);
  if (b) b.focus();
}
// Segment has no select in the filter bar; where its column is hidden
// (narrower screens, iPad) this button opens the same checklist.
function segmentLabel() {
  const n = (S.f.multi.segment || []).length;
  return n ? tr("{n} chosen", { n }) : S.f.quick === "cannot" ? trv("Cannot lose") : tr("All");
}
function segmentField() {
  return el("div", { class: "field seg-field" }, [el("span", { text: tr("Segment") }),
    el("button", { type: "button", class: "btn facet-btn", "data-facet-btn": "segment", "aria-haspopup": "dialog", "aria-label": tr("Filter {col}", { col: tr("Segment") }),
      onclick: (ev) => { ev.stopPropagation(); toggleFacet("segment", ev.currentTarget); } }, [el("span", { class: "fb-l", text: segmentLabel() }), el("span", { "aria-hidden": "true", text: "▾" })])]);
}
function contactCell(r) {
  return el("td", { class: "col-contact num", title: r.last_contact_on ? [channelLabel(r.last_contact_channel), who(r.last_contact_by)].filter(Boolean).join(" · ") : null,
    text: r.last_contact_on ? fmtDate(r.last_contact_on) : "—" });
}

/* ------------------------------------------------------------ the checklist */
function facetLabel(col, v) {
  if (col === "status") return tr((STATUS[v] || { label: v }).label);
  if (col === "owner") {
    const r = ((S.ref && S.ref.sales_reps) || []).find((x) => x.label === v);
    return r && !r.active ? tr("{label} (left)", { label: who(v) }) : who(v);
  }
  if (col === "abc") return v;
  return trv(v);
}
// What is chosen now, in the checklist's values.
function facetChosen(col, values) {
  const m = S.f.multi[col] || [];
  if (m.length) return new Set(m);
  const k = FACET_SELECT[col], v = k ? S.f[k] : "";
  const all = values.map((x) => x.value);
  if (col === "segment" && S.f.quick === "cannot") return new Set(all.filter((x) => x === "Cannot lose"));
  if (!v) return new Set(all);
  if (col === "status" && v === "done") return new Set(all.filter((x) => x === "clean" || x === "checked"));
  if (col === "owner") {
    const reps = (S.ref && S.ref.sales_reps) || [];
    if (v === "__unassigned") return new Set(all.filter(isShared));
    if (v === "__assignable") return new Set(all.filter((x) => reps.some((r) => r.label === x && r.active) && !isShared(x)));
    if (v === "__orphaned") return new Set(all.filter((x) => reps.some((r) => r.label === x && !r.active)));
  }
  return new Set(all.filter((x) => x === v));
}
async function loadFacet(col) {
  const p = listParams();
  for (const k of ["sort", "order_by", "dir", "limit", "offset"]) delete p[k];
  const r = await call("facets", { ...p, column: col });
  return (r.values || []).filter((x) => !blank(x.value));
}
function toggleFacet(col, anchor) {
  if (S.facet && S.facet.col === col) { closeFacet(); return; }
  openFacet(col, anchor);
}
async function openFacet(col, anchor) {
  closeFacet(true);
  const f = { col, anchor, loading: true, error: null, values: [], chosen: new Set(), q: "" };
  S.facet = f;
  renderFacet();
  try {
    f.values = await loadFacet(col);
    f.chosen = facetChosen(col, f.values);
  } catch (e) { f.error = e.message; }
  if (S.facet !== f) return;
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
  if (!quiet && f && f.anchor) {
    const again = shownAnchor(f);
    if (again) again.focus();
  }
}
// One value goes to the filter bar's select when it has one; several stay a
// checklist; all of them is no filter at all.
function applyFacet(col, chosen, all) {
  const vals = [...chosen];
  const selKey = FACET_SELECT[col];
  const multi = { ...S.f.multi, [col]: [] };
  const patch = {};
  if (selKey) patch[selKey] = "";
  if (col === "segment" && S.f.quick === "cannot") patch.quick = "";
  if (vals.length && vals.length < all.length) {
    const one = vals.length === 1 ? vals[0] : null;
    if (one && col === "owner" && isShared(one)) patch.owner = "__unassigned";
    else if (one && selKey && (col !== "lifecycle" || LIFECYCLES.includes(one))) patch[selKey] = one;
    else multi[col] = vals;
  }
  patch.multi = multi;
  setFilter(patch);
}
function facetBody(f, done) {
  const def = LIST_COLS.find((c) => c[0] === f.col);
  const title = f.col === "abc" ? "ABC" : tr(def[1]);
  if (f.loading) return [el("p", { class: "muted fp-msg", text: tr("Loading the values…") })];
  if (f.error) return [el("p", { class: "form-err", text: f.error })];
  if (!f.values.length) return [el("p", { class: "muted fp-msg", text: tr("No values under these filters.") })];
  const q = f.q.trim().toLowerCase();
  const shown = f.values.filter((x) => !q || facetLabel(f.col, x.value).toLowerCase().includes(q) || String(x.value).toLowerCase().includes(q));
  const allOn = shown.length > 0 && shown.every((x) => f.chosen.has(x.value));
  // Redraw the checklist in place, keeping the keyboard on the same box.
  const redraw = () => {
    const a = document.activeElement, row = a && a.closest ? a.closest(".fp-row") : null;
    const key = !row ? null : row.classList.contains("fp-all") ? ".fp-all input" : '.fp-row[data-value="' + CSS.escape(row.dataset.value || "") + '"] input';
    if (S.navFacet) { const old = document.querySelector(".nav-facet"); if (old) old.replaceWith(navFacetSection()); else renderNav(); }
    else renderFacet();
    if (key) { const n = document.querySelector((S.navFacet ? ".nav-facet " : "#facet-pop ") + key); if (n) n.focus(); }
  };
  const kids = [];
  if (f.values.length > 7) {
    kids.push(el("input", { type: "search", class: "fp-q", placeholder: tr("Search the values"), "aria-label": tr("Search the values"), value: f.q,
      oninput: (e) => { f.q = e.target.value; const pos = e.target.selectionStart; redraw();
        const n = document.querySelector(".fp-q"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } } }));
  }
  kids.push(el("label", { class: "fp-row fp-all" }, [
    el("input", { type: "checkbox", checked: allOn ? true : null, onchange: (e) => { shown.forEach((x) => (e.target.checked ? f.chosen.add(x.value) : f.chosen.delete(x.value))); redraw(); } }),
    el("span", { text: tr("Select all") })]));
  kids.push(el("div", { class: "fp-list", role: "group", "aria-label": title }, shown.length ? shown.map((x) => el("label", { class: "fp-row", "data-value": x.value }, [
    el("input", { type: "checkbox", value: x.value, checked: f.chosen.has(x.value) ? true : null,
      onchange: (e) => { if (e.target.checked) f.chosen.add(x.value); else f.chosen.delete(x.value); redraw(); } }),
    el("span", { class: "fp-l", text: facetLabel(f.col, x.value) }),
    el("span", { class: "fp-n", text: String(x.count) }),
  ])) : [el("p", { class: "muted fp-msg", text: tr("Nothing matches.") })]));
  kids.push(el("div", { class: "fp-actions" }, [
    el("button", { type: "button", class: "btn sm primary", "data-act": "fp-apply", disabled: f.chosen.size ? null : true,
      onclick: () => { applyFacet(f.col, f.chosen, f.values.map((x) => x.value)); done(); }, text: tr("Apply") }),
    el("button", { type: "button", class: "btn sm subtle", "data-act": "fp-clear",
      onclick: () => { applyFacet(f.col, new Set(f.values.map((x) => x.value)), f.values.map((x) => x.value)); done(); }, text: tr("Clear filter") }),
  ]));
  return kids;
}
// The button that opened the checklist, or its header's after the list redrew.
function shownAnchor(f) {
  if (f.anchor && f.anchor.isConnected && f.anchor.offsetParent !== null) return f.anchor;
  const th = document.querySelector('.th-filter[data-facet="' + f.col + '"]');
  return th && th.offsetParent !== null ? th : null;
}
function renderFacet() {
  const f = S.facet;
  let pop = $("#facet-pop");
  if (!f) { if (pop) pop.remove(); return; }
  if (!pop) { pop = el("div", { id: "facet-pop", class: "facet-pop", role: "dialog" }); document.body.appendChild(pop); }
  const def = LIST_COLS.find((c) => c[0] === f.col);
  pop.setAttribute("aria-label", tr("Filter {col}", { col: f.col === "abc" ? "ABC" : tr(def[1]) }));
  pop.innerHTML = "";
  pop.append(...facetBody(f, () => closeFacet()));
  const btn = shownAnchor(f);
  if (btn) btn.setAttribute("aria-expanded", "true");
  if (btn && btn.getBoundingClientRect) {
    const r = btn.getBoundingClientRect(), w = 270;
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + window.scrollY + 4) + "px";
  }
}
document.addEventListener("mousedown", (e) => {
  if (!S.facet) return;
  const pop = $("#facet-pop");
  if (pop && pop.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".th-filter, .facet-btn")) return;
  closeFacet(true);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.facet) { e.preventDefault(); e.stopImmediatePropagation(); closeFacet(); }
}, true);
window.addEventListener("resize", () => { if (S.facet) closeFacet(true); });

/* ------------------------------------------------------------ on a phone */
// The ☰ menu's "Sort and filter": the selects, then a row per checklist.
function navFacetRows() {
  return el("div", { class: "nav-list nav-facets" }, [el("h4", { class: "nav-sub", text: tr("Filter by column") })].concat(FACETS.map((col) => {
    const def = LIST_COLS.find((c) => c[0] === col);
    const m = S.f.multi[col] || [], k = FACET_SELECT[col], v = k ? S.f[k] : "";
    const named = (list) => (list.find((o) => o[0] === v) || [0, facetLabel(col, v)])[1];
    const val = m.length ? tr("{n} chosen", { n: m.length })
      : v ? (col === "owner" ? named(ownerOptions()) : col === "status" ? tr(named(STATUS_OPTIONS)) : facetLabel(col, v))
      : col === "segment" && S.f.quick === "cannot" ? trv("Cannot lose") : tr("All");
    return navRow(col === "abc" ? "ABC" : tr(def[1]), false, () => openNavFacet(col), el("span", { class: "nav-val", text: val }));
  })));
}
async function openNavFacet(col) {
  const f = { col, loading: true, error: null, values: [], chosen: new Set(), q: "" };
  S.navFacet = f;
  renderNav();
  try { f.values = await loadFacet(col); f.chosen = facetChosen(col, f.values); } catch (e) { f.error = e.message; }
  if (S.navFacet !== f) return;
  f.loading = false;
  renderNav();
}
function navFacetSection() {
  const f = S.navFacet;
  const def = LIST_COLS.find((c) => c[0] === f.col);
  const back = () => { S.navFacet = null; renderNav(); const t = document.querySelector('[data-section="filters"]'); if (t) t.scrollIntoView({ block: "start" }); };
  return el("div", { class: "nav-section nav-facet", "data-section": "facet" }, [
    el("div", { class: "nf-head" }, [
      el("button", { type: "button", class: "btn subtle", "data-act": "nf-back", onclick: back, text: "‹ " + tr("Back") }),
      el("h3", { text: f.col === "abc" ? "ABC" : tr(def[1]) })]),
    ...facetBody(f, back),
  ]);
}

/* -------------------------------------------------------------- my clients */
// A login linked to a sales rep label opens on its own clients, once per
// session; the shortcut stays for switching back.
function myClientsDefault() {
  const rep = S.ref && S.ref.my_rep;
  if (!rep || !S.session) return false;
  const tag = String(S.session.token || "").slice(0, 12);
  let seen = null;
  try { seen = sessionStorage.getItem("crm_mine_default"); } catch (e) { /* storage blocked */ }
  if (seen === tag) return false;
  try { sessionStorage.setItem("crm_mine_default", tag); } catch (e) { /* storage blocked */ }
  if (S.f.quick || S.f.q || S.f.drill || activeFilterCount()) return false;
  S.f.quick = "mine";
  return true;
}
