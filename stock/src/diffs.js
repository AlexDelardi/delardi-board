/* ===========================================================================
   Stock — Colibri differences (spec 2026-11-27, one register).
   A Colibri load never changes a piece we hold. What it says differently about
   price, size, barcode or design waits here as open lines. With the manage right
   each line offers "Keep ours" (the same Colibri value is not raised again) or
   "Take Colibri's" (the piece changes and its history says so): one line, the
   ticked lines, or everything the filters show. The tab carries the open count.
   S.df = { data | null, err, filters: { brand, field }, sel: Set<diff_id>, busy }
   ========================================================================= */
Object.assign(RU, {
  "Colibri differences": "Расхождения с Colibri",
  "Field": "Поле",
  "Ours": "У нас",
  "Colibri": "Colibri",
  "Load": "Загрузка",
  "Design": "Модель",
  "Barcode": "Штрихкод",
  "All fields": "Все поля",
  "Keep ours": "Оставить наше",
  "Take Colibri's": "Взять из Colibri",
  "Keep ours: all shown": "Оставить наше: все показанные",
  "Take Colibri's: all shown": "Взять из Colibri: все показанные",
  "Keep our value on all {n} shown?": "Оставить наше значение во всех {n} показанных?",
  "Take Colibri's value on all {n} shown?": "Взять значение Colibri во всех {n} показанных?",
  "Take Colibri's value on {n} lines?": "Взять значение Colibri в {n} строках?",
  "The pieces change at once. Their history keeps the old values.": "Изделия изменятся сразу. Прежние значения останутся в истории.",
  "Colibri will not raise these values again.": "Colibri больше не поднимет эти значения.",
  "Kept ours.": "Оставили наше.",
  "Updated from Colibri.": "Обновлено из Colibri.",
  "{n} skipped: the piece has left stock.": "Пропущено: {n} (изделие уже не на складе).",
  "No differences. Colibri and Stock agree.": "Расхождений нет. Colibri и Склад совпадают.",
  "Could not load the differences.": "Не удалось загрузить расхождения.",
  "{n} selected": "Выбрано: {n}",
  "Select line": "Выбрать строку",
  "Select all shown": "Выбрать все показанные",
  "{n} open": "Открыто: {n}",
});

const DIFF_FIELD = { price: "Price", size: "Size", barcode: "Barcode", design: "Design" };
const diffFieldWord = (f) => tr(DIFF_FIELD[f] || humanKey(f));
const diffValue = (d, v) => (blank(v) ? "—" : d.field === "price" && /^\d+$/.test(String(v)) ? fmtUZS(Number(v)) : String(v));

let dfSeq = 0, dfDraws = 0;
function dfState() { return S.df || (S.df = { data: null, err: null, filters: { brand: "", field: "" }, sel: new Set(), busy: false }); }
function dfFilters(df) { const f = {}; if (df.filters.brand) f.brand = df.filters.brand; if (df.filters.field) f.field = df.filters.field; return f; }
function setDiffTab() {
  const t = $("#tab-colibri");
  if (t) t.textContent = tr("Colibri") + (S.diffCount > 0 ? " (" + S.diffCount + ")" : "");
}
function dfTake(df, data) {
  df.data = data; df.err = null; S.diffCount = data.open_all;
  const shown = new Set(data.rows.map((r) => r.diff_id));
  df.sel = new Set([...df.sel].filter((id) => shown.has(id)));
  // a filter whose last line went: back to everything rather than an empty table behind a stale filter
  let reset = false;
  if (df.filters.brand && !data.brands.includes(df.filters.brand)) { df.filters.brand = ""; reset = true; }
  if (df.filters.field && !data.open_by_field[df.filters.field]) { df.filters.field = ""; reset = true; }
  return reset && data.open_all > 0;                              // true: the caller asks again with the filters as they now are
}

async function loadDiffs() {
  if (S.locked || !S.rights.manage || S.training) return;
  const df = dfState();
  const seq = ++dfSeq;
  try {
    const data = await api("diffs", { filters: dfFilters(df) });
    if (S.locked || S.df !== df || seq !== dfSeq) return;
    if (dfTake(df, data)) return loadDiffs();
  } catch (e) {
    if (S.locked || S.df !== df || seq !== dfSeq) return;
    if (!df.data) df.err = e.message;
  }
  setDiffTab();
  drawDiffs();
}

function renderDiffs(main) {
  main.append(el("section", { class: "screen", id: "screen-colibri" },
    el("h1", { class: "sr-only", text: tr("Colibri differences") }),
    el("div", { id: "df-host" })));
  drawDiffs();
  loadDiffs();
}

function drawDiffs() {
  const host = $("#df-host");
  if (!host || S.locked) return;
  const df = dfState();
  host.innerHTML = "";
  host.setAttribute("data-draws", ++dfDraws);                    // lets the tests wait for a redraw
  if (df.err && !df.data) {
    host.append(el("p", { class: "notice", role: "alert", text: tr("Could not load the differences.") + " " + df.err }),
      el("button", { type: "button", class: "btn", onclick: loadDiffs, text: tr("Try again") }));
    return;
  }
  if (!df.data) { host.append(el("p", { class: "loading-line", text: tr("Loading…") })); return; }
  const d = df.data;
  if (!d.open_all) { host.append(el("p", { class: "rv-empty", id: "df-empty", text: tr("No differences. Colibri and Stock agree.") })); return; }

  const pickFilter = (key) => (ev) => { df.filters[key] = ev.target.value; df.sel = new Set(); loadDiffs(); };
  const nSel = df.sel.size, off = df.busy ? true : null;
  host.append(el("div", { class: "df-bar" },
    el("label", { class: "df-f" }, el("span", { class: "lbl", text: tr("Brand") }),
      el("select", { id: "df-brand", onchange: pickFilter("brand"), disabled: off },
        el("option", { value: "", text: tr("All brands") }),
        d.brands.map((b) => el("option", { value: b, selected: df.filters.brand === b ? true : null, text: b })))),
    el("label", { class: "df-f" }, el("span", { class: "lbl", text: tr("Field") }),
      el("select", { id: "df-field", onchange: pickFilter("field"), disabled: off },
        el("option", { value: "", text: tr("All fields") }),
        Object.keys(DIFF_FIELD).filter((f) => d.open_by_field[f]).map((f) =>
          el("option", { value: f, selected: df.filters.field === f ? true : null, text: diffFieldWord(f) + " (" + d.open_by_field[f] + ")" })))),
    el("span", { class: "df-count", id: "df-count", text: nSel ? tr("{n} selected", { n: nSel }) : tr("{n} open", { n: d.total }) }),
    el("span", { class: "kit-spacer" }),
    nSel
      ? [el("button", { type: "button", class: "btn", id: "df-keep-sel", disabled: off, onclick: () => decideDiffs(false, { ids: [...df.sel] }), text: tr("Keep ours") }),
         el("button", { type: "button", class: "btn", id: "df-take-sel", disabled: off, onclick: () => decideDiffs(true, { ids: [...df.sel] }), text: tr("Take Colibri's") })]
      : [el("button", { type: "button", class: "btn", id: "df-keep-all", disabled: off || !d.total, onclick: () => decideDiffs(false, { all: true }), text: tr("Keep ours: all shown") }),
         el("button", { type: "button", class: "btn", id: "df-take-all", disabled: off || !d.total, onclick: () => decideDiffs(true, { all: true }), text: tr("Take Colibri's: all shown") })]));

  const allTicked = d.rows.length > 0 && d.rows.every((r) => df.sel.has(r.diff_id));
  const body = el("tbody", { id: "df-rows" });
  for (const r of d.rows) {
    const tick = (ev) => { if (ev.target.checked) df.sel.add(r.diff_id); else df.sel.delete(r.diff_id); drawDiffs(); const n = $('#df-rows input[data-diff="' + r.diff_id + '"]'); if (n && !touchDevice()) n.focus(); };
    body.append(el("tr", { class: "drow", "data-diff": r.diff_id },
      el("td", { class: "dc" }, el("input", { type: "checkbox", "data-diff": r.diff_id, checked: df.sel.has(r.diff_id) ? true : null, disabled: off,
        "aria-label": tr("Select line") + ": " + r.serial + " · " + diffFieldWord(r.field), onchange: tick })),
      el("td", { class: "dp" }, el("button", { type: "button", class: "btn quiet rv-piece", onclick: () => openPiece(r.piece_id) },
        el("span", { class: "serial", text: r.serial || "—" }),
        el("span", { class: "ref-m small", text: [r.brand, r.article].filter((x) => !blank(x)).join(" · ") }))),
      el("td", { class: "df-fld", text: diffFieldWord(r.field) }),
      el("td", { class: "dv ours" }, el("span", { class: "lbl dv-lbl", text: tr("Ours") }), el("span", { class: "dv-val", text: diffValue(r, r.ours) })),
      el("td", { class: "dv col" }, el("span", { class: "lbl dv-lbl", text: tr("Colibri") }), el("span", { class: "dv-val", text: diffValue(r, r.colibri) })),
      el("td", { class: "since", text: fmtDate(r.raised_at) }),
      el("td", { class: "da" }, el("div", { class: "rv-answers", role: "group" },
        el("button", { type: "button", class: "btn df-keep", disabled: off, onclick: () => decideDiffs(false, { ids: [r.diff_id] }), text: tr("Keep ours") }),
        el("button", { type: "button", class: "btn df-take", disabled: off, onclick: () => decideDiffs(true, { ids: [r.diff_id] }), text: tr("Take Colibri's") })))));
  }
  host.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl reviews diffs", id: "df-table" },
    el("thead", {}, el("tr", {},
      el("th", { scope: "col", class: "dc" }, el("input", { type: "checkbox", id: "df-all", checked: allTicked ? true : null, disabled: off, "aria-label": tr("Select all shown"),
        onchange: (ev) => { df.sel = ev.target.checked ? new Set(d.rows.map((r) => r.diff_id)) : new Set(); drawDiffs(); const n = $("#df-all"); if (n && !touchDevice()) n.focus(); } })),
      el("th", { scope: "col", text: tr("Piece") }), el("th", { scope: "col", text: tr("Field") }),
      el("th", { scope: "col", text: tr("Ours") }), el("th", { scope: "col", text: tr("Colibri") }),
      el("th", { scope: "col", text: tr("Load") }), el("th", { scope: "col", text: tr("Answer") }))),
    body)));
}

// Keep ours or take Colibri's: for the lines named ({ids}) or for everything the filters show ({all}).
// One line of "keep" needs no question; taking several, or anything "all shown", asks first.
async function decideDiffs(take, what) {
  const df = S.df;
  if (!df || !df.data || df.busy || S.locked) return;
  const n = what.all ? df.data.total : what.ids.length;
  if (!n) return;
  if (what.all || (take && n > 1)) {
    const title = what.all ? tr(take ? "Take Colibri's value on all {n} shown?" : "Keep our value on all {n} shown?", { n })
      : tr("Take Colibri's value on {n} lines?", { n });
    const body = [take ? tr("The pieces change at once. Their history keeps the old values.") : tr("Colibri will not raise these values again.")];
    const ok = await confirmBox({ title, body, ok: tr(take ? "Take Colibri's" : "Keep ours"), cancel: tr("Cancel") });
    if (!ok || S.locked || S.df !== df) return;
  }
  df.busy = true; drawDiffs();
  const req = what.all ? { take, filters: dfFilters(df) } : { take, ids: what.ids, shown: dfFilters(df) };
  try {
    const r = await api("diff_decide", req);
    if (S.locked || S.df !== df) return;
    df.busy = false;
    const again = dfTake(df, r.list);
    setDiffTab(); drawDiffs();
    if (again) loadDiffs();
    toast(tr(take && r.taken ? "Updated from Colibri." : "Kept ours.") + (r.skipped ? " " + tr("{n} skipped: the piece has left stock.", { n: r.skipped }) : ""));
    if (!touchDevice() && !$("#piece-panel")) { const next = $("#df-rows .df-keep") || $("#tab-colibri"); if (next) next.focus(); }
    if (take && r.taken) {                                               // a price, size or design moved
      if (typeof loadList === "function") loadList();
      if (S.pc && typeof loadPiece === "function") loadPiece(S.pc.id);
    }
  } catch (e) {
    if (S.locked || S.df !== df) return;
    df.busy = false;
    toast(e.message, true);
    loadDiffs();
  }
}
