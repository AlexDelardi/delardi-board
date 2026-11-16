/* ===========================================================================
   Stock — the piece panel's other tabs (design 2026-11-17 stock enrichment).
   "Colibri format": every Colibri column of the piece, under Colibri's own
   headings and in Colibri's order, read-only. "Origin & cost": the arrival
   document, the piece's codes, and — only with the cost right — its money.
   Both come from stock-api `origin` (and `cost`), asked for the first time a
   tab is opened and kept on S.pc.more for as long as the panel is open.
   Whatever is not recorded reads TBD.
   ========================================================================= */
Object.assign(RU, {
  "Overview": "Обзор",
  "Colibri format": "Формат Colibri",
  "Origin & cost": "Происхождение и себестоимость",
  "Origin": "Происхождение",
  "TBD": "TBD",
  "Colibri data, as Colibri holds it. Read-only.": "Данные Colibri в том виде, как они хранятся в Colibri. Только чтение.",
  "File: {f}": "Файл: {f}",
  "No Colibri record has been loaded for this piece yet.": "Запись Colibri для этого изделия ещё не загружена.",
  "Could not load this.": "Не удалось загрузить.",
  "Try again": "Повторить",
  "Arrival": "Приход",
  "Supplier": "Поставщик",
  "Contract": "Договор",
  "Supplier invoice": "Инвойс поставщика",
  "Invoice date": "Дата инвойса",
  "Currency": "Валюта",
  "Arrival date": "Дата прихода",
  "Customs declaration": "Таможенная декларация",
  "HS code": "Код ТН ВЭД",
  "ИКПУ": "ИКПУ",
  "Codes": "Коды",
  "Colibri barcode": "Штрихкод Colibri",
  "Era barcode": "Штрихкод Era",
  "Brand barcode": "Штрихкод бренда",
  "Delardi code": "Код Delardi",
  "Retired": "Не используется",
  "Cost": "Себестоимость",
  "Exact": "Точно",
  "Estimated": "Оценка",
  "Invoice price": "Цена по инвойсу",
  "Invoice value": "Стоимость по инвойсу",
  "VAT paid at customs": "НДС на таможне",
  "Customs clearance": "Таможенное оформление",
  "Assay": "Опробирование",
  "Customs fee": "Таможенный сбор",
  "Other costs": "Прочие расходы",
  "Landed cost": "Себестоимость с расходами",
  "Shelf price": "Цена на полке",
  "Price without VAT ({p}%)": "Цена без НДС ({p}%)",
  "Estimated margin": "Оценочная маржа",
});

// The Colibri item columns: the upload template (A–AK) in its order, with the columns only the
// after-loading export has placed where that export has them. Headings are Colibri's own and are not translated.
const COLIBRI_COLUMNS = ["Бренд", "Линия продукции", "Артикул", "Серийный номер", "Наименование товара (рус)",
  "Наименование товара (англ)", "Состав", "Материал", "Наименование цвета", "Код цвета", "Размер", "Наименование коллекции",
  "Примечание", "Страна", "Цена оригинального инвойса", "Инв. цена, долл", "Коэф-т 1", "Рек. цена, долл", "Коэф-т 2",
  "Цена продажи, долл", "Штрих Код", "Кол-во (док)", "Ед. изм.", "Пол", "ЦП", "Тек. цена", "НДС", "Вес", "СФ номер", "СФ дата",
  "Бух-код", "ЧП", "Цена в СФ", "Отправлять в ККМ", "Полное наименование", "Наименование для чека", "Диаметр", "Механизм",
  "Камни", "Вес, каратность и качество камней", "Описание", "Путь для сайта"];
const CODE_KIND = { colibri: "Colibri barcode", era: "Era barcode", brand: "Brand barcode", delardi: "Delardi code" };
const QUALITY_WORD = { exact: "Exact", estimated: "Estimated", tbd: "TBD" };

const tbd = (v) => (blank(v) ? tr("TBD") : String(v));
// A fact whose label is already in its final language (Colibri's headings) or goes through tr().
function moreFact(label, value, raw) {
  return el("div", { class: "pc-fact" }, el("dt", { class: "lbl", text: raw ? label : tr(label) }), el("dd", { text: tbd(value) }));
}
// A foreign-currency amount: grouped thousands, cents kept when there are any.
function fmtAmount(n) {
  const x = Number(n);
  if (isNaN(x)) return String(n);
  const [i, d] = (Math.round(x * 100) / 100).toString().split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (d ? "." + d.padEnd(2, "0") : "");
}
const moneyOrTbd = (n) => (n === null || n === undefined || n === "" ? null : fmtMoney(n));

/* ------------------------------------------------------------------- tabs */
function pieceTabs(pc) {
  const names = [["overview", "Overview"], ["colibri", "Colibri format"], ["origin", S.rights.cost ? "Origin & cost" : "Origin"]];
  return el("div", { class: "pc-tabs", id: "pc-tabs", role: "tablist" }, names.map(([id, label]) =>
    el("button", { type: "button", class: "pc-tab", id: "pc-tab-" + id, role: "tab", "aria-selected": (pc.tab || "overview") === id ? "true" : "false",
      onclick: () => setPieceTab(id), text: tr(label) })));
}
function setPieceTab(id) {
  const pc = S.pc;
  if (!pc || !pc.d || (pc.form && (pc.form.busy || pc.form.confirming))) return;
  pc.tab = id;
  if (id !== "overview") loadMore();
  renderPiece();
  const b = $("#pc-tab-" + id);
  if (b && !touchDevice()) b.focus();
}
// Origin (and cost, with the right) for the open piece: once per panel, again only after a failure.
async function loadMore() {
  const pc = S.pc;
  if (!pc || (pc.more && (pc.more.d || pc.more.busy))) return;
  pc.more = { busy: true, d: null, cost: null, err: null };
  try {
    const [origin, cost] = await Promise.all([api("origin", { piece_id: pc.id }),
      S.rights.cost ? api("cost", { piece_id: pc.id }) : Promise.resolve(null)]);
    if (!stillHere(pc)) return;
    pc.more = { busy: false, d: origin, cost, err: null };
  } catch (e) {
    if (!stillHere(pc)) return;
    pc.more = { busy: false, d: null, cost: null, err: e.message };
  }
  renderPiece();
}

/* ------------------------------------------------------------ tab content */
function moreBody(pc) {
  const m = pc.more;
  if (!m || m.busy) return [el("p", { class: "small", text: tr("Loading…") })];
  if (m.err) {
    return [el("p", { class: "notice", role: "alert", id: "pc-more-err", text: tr("Could not load this.") + " " + m.err }),
      el("div", {}, el("button", { type: "button", class: "btn", id: "pc-more-retry", onclick: () => { pc.more = null; loadMore(); renderPiece(); }, text: tr("Try again") }))];
  }
  return pc.tab === "colibri" ? colibriBody(m.d) : originBody(m.d, m.cost);
}
function colibriBody(o) {
  const c = o.colibri;
  if (!c || !c.data) return [el("p", { class: "small", id: "pc-colibri-none", text: tr("No Colibri record has been loaded for this piece yet.") })];
  const extra = Object.keys(c.data).filter((k) => !COLIBRI_COLUMNS.includes(k));
  return [
    el("p", { class: "small", id: "pc-colibri-note", text: tr("Colibri data, as Colibri holds it. Read-only.") + (blank(c.source_file) ? "" : " " + tr("File: {f}", { f: c.source_file })) }),
    el("dl", { class: "pc-facts", id: "pc-colibri" }, COLIBRI_COLUMNS.concat(extra).map((k) => moreFact(k, c.data[k], true)))];
}
function originBody(o, cost) {
  const r = o.receipt || {};
  const out = [el("section", { class: "pc-sec" }, el("h3", { class: "lbl", text: tr("Arrival") }),
    el("dl", { class: "pc-facts", id: "pc-origin" },
      moreFact("Supplier", r.supplier), moreFact("Contract", r.contract), moreFact("Supplier invoice", r.invoice_no),
      moreFact("Invoice date", blank(r.invoice_date) ? null : fmtDate(r.invoice_date)), moreFact("Currency", r.currency),
      moreFact("Arrival date", blank(r.arrival_date) ? null : fmtDate(r.arrival_date)), moreFact("Customs declaration", r.customs_decl),
      moreFact("HS code", o.hs_code), moreFact("ИКПУ", o.ikpu)))];
  const codes = o.codes || [];
  out.push(el("section", { class: "pc-sec" }, el("h3", { class: "lbl", text: tr("Codes") }),
    codes.length ? el("ul", { class: "pc-list", id: "pc-codes" }, codes.map((c) => el("li", { class: "pc-ev" },
      el("span", { class: "serial", text: c.code }), el("span", { class: "small", text: tr(CODE_KIND[c.kind] || humanKey(c.kind)) }),
      c.active ? null : el("span", { class: "tag done", text: tr("Retired") }))))
      : el("p", { class: "small", id: "pc-codes", text: tr("TBD") })));
  if (S.rights.cost && cost) {
    const q = QUALITY_WORD[cost.match_quality] || "TBD";
    const margin = moneyOrTbd(cost.margin_uzs);
    out.push(el("section", { class: "pc-sec" },
      el("h3", { class: "lbl" }, tr("Cost") + " ", el("span", { class: "tag " + (cost.match_quality === "exact" ? "info" : "done"), id: "pc-cost-quality", text: tr(q) })),
      el("dl", { class: "pc-facts", id: "pc-cost" },
        moreFact("Invoice price", blank(cost.invoice_price) ? null : fmtAmount(cost.invoice_price) + (blank(cost.currency) ? "" : " " + cost.currency)),
        moreFact("Invoice value", moneyOrTbd(cost.invoice_uzs)), moreFact("VAT paid at customs", moneyOrTbd(cost.customs_vat_uzs)),
        moreFact("Customs clearance", moneyOrTbd(cost.clearance_uzs)), moreFact("Assay", moneyOrTbd(cost.assay_uzs)),
        moreFact("Customs fee", moneyOrTbd(cost.customs_fee_uzs)), moreFact("Other costs", moneyOrTbd(cost.other_uzs)),
        moreFact("Landed cost", moneyOrTbd(cost.landed_uzs)), moreFact("Shelf price", moneyOrTbd(cost.shelf_price_uzs)),
        el("div", { class: "pc-fact" }, el("dt", { class: "lbl", text: tr("Price without VAT ({p}%)", { p: cost.vat_pct }) }), el("dd", { text: tbd(moneyOrTbd(cost.net_price_uzs)) })),
        moreFact("Estimated margin", margin === null ? null : margin + (blank(cost.margin_pct) ? "" : " · " + cost.margin_pct + "%")))));
  }
  return out;
}
