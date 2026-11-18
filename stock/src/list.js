/* ===========================================================================
   Stock — the pieces list (#/pieces): filters, totals by state, the table and
   the pager. Filters live in S.filters (and S.page) and nowhere else.
   renderList(main) draws the screen once; a filter change asks stock-api
   `list` again and redraws only the totals, the rows and the pager, so the
   search box keeps its focus.
   ========================================================================= */
Object.assign(RU, {
  "Search": "Поиск",
  "Serial, reference, brand, model": "Серийный номер, артикул, бренд, модель",
  "State": "Статус",
  "All states": "Все статусы",
  "Brand": "Бренд",
  "All brands": "Все бренды",
  "Category": "Категория",
  "All categories": "Все категории",
  "Price from": "Цена от",
  "Price to": "Цена до",
  "Serial": "Серийный №",
  "Reference / Model": "Артикул / Модель",
  "Size": "Размер",
  "Since": "С даты",
  "Price": "Цена",
  "{n} without price": "{n} без цены",
  "Totals by state": "Итоги по статусам",
  "Page {n} of {m}": "Страница {n} из {m}",
  "Previous": "Назад",
  "Next": "Далее",
  "No pieces match these filters.": "Нет изделий под эти фильтры.",
  "Could not load the list.": "Не удалось загрузить список.",
  "Try again": "Повторить",
  "Store": "Магазин",
  "All stores": "Все магазины",
});

// Category keys from the catalogue; anything not listed is shown humanised.
const CATEGORY_RU = {
  ring: "Кольцо", watch: "Часы", necklace: "Колье", earrings: "Серьги", bracelet: "Браслет", strap: "Ремешок",
  clasp: "Застёжка", bracelet_element: "Элемент браслета", cufflinks: "Запонки",
};
function categoryWord(key) {
  if (blank(key)) return "—";
  if (LANG === "ru" && CATEGORY_RU[key]) return CATEGORY_RU[key];
  const s = String(key).replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const LIST_DEBOUNCE = 300;
let listSeq = 0;

// The filters as stock-api reads them (stock/src/api/README.md, "Filters").
function listFilters() {
  const f = S.filters, out = { page: S.page };
  if (!blank(f.q)) out.q = f.q.trim().slice(0, 80);
  if (f.state) out.states = [f.state];
  if (f.brand) out.brand = f.brand;
  if (f.category) out.category = f.category;
  if (S.training && f.store) out.store = f.store;
  if (f.price_min !== null) out.price_min = f.price_min;
  if (f.price_max !== null) out.price_max = f.price_max;
  return out;
}

// The mode changed: an answer still on its way belongs to the other mode and is not drawn.
function dropListAnswers() { listSeq++; }
async function loadList(clamped) {
  const seq = ++listSeq;
  S.listBusy = true;
  try {
    const r = await api(act("list"), { filters: listFilters() });
    if (seq !== listSeq) return;                   // a newer request is on its way
    if (S.locked) { S.listBusy = false; return; }  // locked meanwhile: nothing is kept or drawn
    // A change moved the last row of the last page away: the page is past the end.
    // Clamp to the last page and ask once more (never twice).
    const size = Number(r.page_size) || 50, count = Number(r.count);
    if (!clamped && S.page > 1 && count > 0 && !(r.rows && r.rows.length)) {
      S.page = Math.max(1, Math.ceil(count / size));
      return loadList(true);
    }
    S.list = r; S.listError = null;
  } catch (e) {
    if (seq !== listSeq) return;
    if (S.locked) { S.listBusy = false; return; }
    S.listError = e.message;
  }
  S.listBusy = false;
  drawResults();
}
// A filter changed: back to page 1 and ask again.
function filtersChanged() {
  S.page = 1;
  syncFilterControls();
  loadList();
}

function renderList(main) {
  const f = S.filters;
  const facets = S.facets || { brands: [], categories: [] };
  const T = S.training;
  const field = (cls, label, control) => el("label", { class: cls }, el("span", { class: "lbl", text: tr(label) }), control);

  const q = el("input", { type: "search", id: "f-q", value: f.q, maxlength: "80", autocomplete: "off", spellcheck: "false",
    placeholder: tr("Serial, reference, brand, model"),
    oninput: () => {
      clearTimeout(S.qTimer);
      S.qTimer = setTimeout(() => { if (q.value !== S.filters.q) { S.filters.q = q.value; filtersChanged(); } }, LIST_DEBOUNCE);
    } });
  const opt = (value, text, cur) => el("option", { value, selected: value === cur ? true : null, text });
  const state = el("select", { id: "f-state", onchange: () => { S.filters.state = state.value; filtersChanged(); } },
    opt("", tr("All states"), f.state), stateOrder().map((s) => opt(s, stateWord(s), f.state)));
  const store = T ? el("select", { id: "f-store", onchange: () => { S.filters.store = store.value; filtersChanged(); } },
    opt("", tr("All stores"), f.store), (facets.stores || []).map((x) => opt(x.code, x.name, f.store))) : null;
  const brand = el("select", { id: "f-brand", onchange: () => { S.filters.brand = brand.value; filtersChanged(); } },
    opt("", tr("All brands"), f.brand), facets.brands.map((b) => opt(b, b, f.brand)));
  const cat = el("select", { id: "f-cat", onchange: () => { S.filters.category = cat.value; filtersChanged(); } },
    opt("", tr("All categories"), f.category), facets.categories.map((c) => opt(c, categoryWord(c), f.category)));
  const price = (id, key) => {
    const input = el("input", { type: "text", inputmode: "numeric", id, class: "price", autocomplete: "off",
      value: f[key] === null ? "" : fmtUZS(f[key]) });
    const apply = () => {
      const r = readAmount(input.value);
      markInvalid(input, r.invalid);
      if (r.invalid || r.value === S.filters[key]) return;
      S.filters[key] = r.value;
      filtersChanged();
    };
    input.addEventListener("input", () => { clearTimeout(S.priceTimers[key]); S.priceTimers[key] = setTimeout(apply, LIST_DEBOUNCE); });
    input.addEventListener("change", () => { clearTimeout(S.priceTimers[key]); apply(); });
    return input;
  };

  main.append(el("section", { class: "screen" + (T ? " training" : ""), id: "screen-pieces" },
    el("div", { class: "screen-head" },
      el("h1", { class: "sr-only", text: tr("Pieces") }),
      T ? null : el("div", { class: "aside" }, exportButton())),      // training pieces are never exported
    el("div", { class: "filters" + (T ? " with-store" : ""), role: "search" },
      field("f-q", "Search", q),
      field("f-state", "State", state),
      field("f-brand", "Brand", brand),
      field("f-cat", "Category", cat),
      T ? field("f-store", "Store", store) : null,
      field("f-min", "Price from", price("f-min", "price_min")),
      field("f-max", "Price to", price("f-max", "price_max"))),
    el("div", { class: "totals", id: "totals", role: "group", "aria-label": tr("Totals by state") }),
    el("div", { class: "tbl-wrap" },
      el("table", { class: "tbl pieces" },
        el("thead", {}, el("tr", {},
          el("th", { scope: "col", text: tr("Serial") }),
          el("th", { scope: "col", text: tr("Brand") }),
          el("th", { scope: "col", text: tr("Reference / Model") }),
          el("th", { scope: "col", text: tr("Size") }),
          T ? el("th", { scope: "col", text: tr("Store") }) : null,
          el("th", { scope: "col", text: tr("State") }),
          el("th", { scope: "col", text: tr("Since") }),
          el("th", { scope: "col", class: "r", text: tr("Price") }))),
        el("tbody", { id: "rows" }))),
    el("div", { class: "pager", id: "pager" })));

  drawResults();
  loadList();
}

// The selects and the totals cards follow S.filters (a card click sets the state).
function syncFilterControls() {
  const s = $("#f-state");
  if (s && s.value !== S.filters.state) s.value = S.filters.state;
}

function drawResults() {
  const rows = $("#rows");
  if (!rows) return;                               // the list is not on screen
  const L = S.list;
  drawTotals(L ? L.totals : []);
  rows.innerHTML = "";
  if (S.listError) {
    rows.append(el("tr", { class: "empty" }, el("td", { colspan: S.training ? "8" : "7" },
      el("p", { class: "notice", role: "alert", text: tr("Could not load the list.") + " " + S.listError }),
      el("button", { type: "button", class: "btn", onclick: () => loadList(), text: tr("Try again") }))));
  } else if (!L) {
    rows.append(el("tr", { class: "empty" }, el("td", { colspan: S.training ? "8" : "7", text: tr("Loading…") })));
  } else if (!L.rows.length) {
    rows.append(el("tr", { class: "empty" }, el("td", { colspan: S.training ? "8" : "7", text: tr("No pieces match these filters.") })));
  } else {
    for (const p of L.rows) rows.append(pieceRow(p));
  }
  drawPager(L);
}

function pieceRow(p) {
  const open = () => openPiece(p.piece_id);
  return el("tr", { class: "prow", tabindex: "0", "data-id": p.piece_id,
    "aria-label": [p.serial, p.brand, p.article, p.model_name].filter((x) => !blank(x)).join(" · "),
    onclick: open,
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } } },
    el("td", { class: "serial", text: blank(p.serial) ? "—" : p.serial }),
    el("td", { class: "brand", text: blank(p.brand) ? "—" : p.brand }),
    el("td", { class: "ref" },
      el("span", { class: "ref-a", text: blank(p.article) ? "—" : p.article }),
      blank(p.model_name) ? null : el("span", { class: "ref-m small", text: p.model_name })),
    el("td", { class: "size", text: blank(p.size) ? "—" : p.size }),
    S.training ? el("td", { class: "store", text: (blank(p.store) ? "—" : p.store) + (blank(p.to_store) ? "" : " → " + p.to_store) }) : null,
    el("td", { class: "st" }, stateTag(p.state)),
    el("td", { class: "since", text: fmtDate(p.state_since) }),
    el("td", { class: "r", text: fmtUZS(p.price_uzs) }));
}

function drawTotals(totals) {
  const box = $("#totals");
  if (!box) return;
  box.innerHTML = "";
  const by = {};
  for (const t of totals || []) by[t.state] = t;
  for (const s of stateOrder()) {
    const t = by[s];
    if (!t) continue;
    const on = S.filters.state === s;
    box.append(el("button", { type: "button", class: "tot", "data-state": s, "aria-pressed": on ? "true" : "false",
      onclick: () => { S.filters.state = on ? "" : s; filtersChanged(); } },
      el("span", { class: "lbl", text: stateWord(s) }),
      el("span", { class: "t-n", text: pl(Number(t.pieces), "piece") }),
      el("span", { class: "t-v" }, el("span", { class: "t-amt", text: fmtUZS(t.value) }), " " + tr("so'm")),
      Number(t.unpriced) > 0 ? el("span", { class: "small", text: tr("{n} without price", { n: t.unpriced }) }) : null));
  }
}

function drawPager(L) {
  const box = $("#pager");
  if (!box) return;
  box.innerHTML = "";
  const count = L ? Number(L.count) : 0;
  const size = L ? Number(L.page_size) || 50 : 50;
  const pages = Math.max(1, Math.ceil(count / size));
  const page = Math.min(S.page, pages);
  const to = (n) => { S.page = n; loadList(); };
  box.append(
    el("span", { class: "pg-count", text: L ? pl(count, "piece") : "" }),
    el("button", { type: "button", class: "btn", id: "pg-prev", disabled: page <= 1 || !L ? true : null, onclick: () => to(page - 1), text: tr("Previous") }),
    el("span", { class: "pg-n", "aria-live": "polite", text: tr("Page {n} of {m}", { n: page, m: pages }) }),
    el("button", { type: "button", class: "btn", id: "pg-next", disabled: page >= pages || !L ? true : null, onclick: () => to(page + 1), text: tr("Next") }));
}
