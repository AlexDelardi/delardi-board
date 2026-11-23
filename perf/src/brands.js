/* Delardi Performance — brands.js
   Brands for the month on screen or for the year: sales, share, last year, what is on hand, and what arrived.
   Arrivals come from Colibri's arrival report, by the date of arrival. One document per period (perf_brands). */
Object.assign(RU, {
  "Brands": "Бренды", "Brands, {p}": "Бренды, {p}", "Loading the brands…": "Загружаем бренды…", "Period": "Период",
  "Net sales by brand": "Чистые продажи по брендам", "Brand": "Бренд", "Share": "Доля", "Units": "Штук", "Average item": "Средняя цена изделия",
  "On hand, units": "В наличии, шт.", "On hand, retail value": "В наличии, по розничной цене", "No sales in this period.": "За этот период продаж нет.",
  "All brands": "Все бренды", "Arrivals": "Поступления", "Arrived in {p}, units": "Поступило за {p}, шт.", "Arrivals by month, {y}, units": "Поступления по месяцам, {y}, шт.", "Nothing arrived in this period.": "За этот период поступлений не было.", "Arrived, retail value, USD": "Поступило, по розничной цене, USD",
  "Sold from them": "Из них продано", "Still on hand from them": "Из них в наличии", "Sold from them, %": "Продано из них, %",
  "Arrivals by year, units": "Поступления по годам, шт.", "Arrived": "Поступило", "Sold from them, units": "Из них продано, шт.",
  "From Colibri's arrival report, by date of arrival. Values are retail prices in USD as Colibri holds them. Sold from them counts sales up to the day the report was taken.":
    "По отчёту Colibri о поступлениях, по дате прихода. Суммы — розничные цены в USD, как в Colibri. «Из них продано» — продажи на дату отчёта.",
  "No arrival figures are loaded yet.": "Данные о поступлениях ещё не загружены.",
  "What is on hand today, by year of arrival": "Что в наличии сегодня, по году поступления", "Arrival date not known": "Дата поступления неизвестна", "Year of arrival": "Год поступления",
  "Top brand": "Первый бренд", "{p} of sales": "{p} продаж", "Brands sold": "Брендов с продажами", "of {n} on hand": "из {n} в наличии", "retail value {v}": "по розничной цене: {v}",
  "On hand today": "В наличии сегодня", "and {n} on the way": "и ещё в пути: {n}",
  "January to {m}; last year is the same months.": "Январь – {m}; прошлый год — те же месяцы.", "{n} pieces": "изделий: {n}",
});
function brandPeriod() { return S.brandMode === "year" ? { year: S.year } : { month: S.month }; }
function brandModeSwitch() {
  return el("div", { class: "cur-switch", id: "brand-mode", role: "group", "aria-label": tr("Period") }, [["month", "Month"], ["year", "Year"]].map(([m, label]) =>
    el("button", { type: "button", class: "btn", "data-mode": m, "aria-pressed": S.brandMode === m ? "true" : "false",
      onclick: () => { if (S.brandMode !== m) { S.brandMode = m; sstore(BRAND_MODE_KEY, m); renderAll(); } }, text: tr(label) })));
}
function renderBrands(main) {
  const byYear = S.brandMode === "year", label = byYear ? String(S.year) : monthName(S.month);
  const sec = el("section", { class: "screen", id: "screen-brands" }, el("h1", { class: "title", text: tr("Brands, {p}", { p: label }) }));
  main.append(sec);
  const st = need("brandDoc", "brands", brandPeriod(), (byYear ? "y" : "m") + (byYear ? S.year : S.month));
  if (pending(sec, st, "Loading the brands…")) return;
  const d = st.doc, t = d.total, sold = d.brands.filter((b) => num(b.net) !== 0 || num(b.ly_net) !== 0), top = d.brands.find((b) => num(b.net) > 0);
  const year = Number(String(d.from).slice(0, 4));
  // a year still running is set against the same months of last year: say which
  if (byYear && d.through && String(d.through).slice(5, 7) !== "12") sec.append(el("p", { class: "small", id: "brand-period", text: tr("January to {m}; last year is the same months.", { m: monthName(d.through) }) }));
  const card = (id, lab, big, lines) => el("div", { class: "hl", id }, el("span", { class: "lbl", text: tr(lab) }), el("strong", { class: "hl-big num", text: big }),
    lines.map((x) => el("span", { class: "small", text: x })));
  sec.append(el("div", { class: "hl-row" },
    card("br-top", "Top brand", top ? top.brand : "—", top ? [fmtMoney(top.net), tr("{p} of sales", { p: fmtPct(top.share, 0) })] : [tr("No sales in this period.")]),
    card("br-count", "Brands sold", fmtNum(d.brands.filter((b) => num(b.net) > 0).length), [tr("of {n} on hand", { n: fmtNum(d.brands.filter((b) => num(b.stock_units) > 0).length) })]),
    card("br-stock", "On hand today", tr("{n} pieces", { n: fmtNum(t.stock_units) }), [tr("retail value {v}", { v: fmtMoney(t.stock_value) })].concat(num(t.incoming_units) > 0 ? [tr("and {n} on the way", { n: fmtNum(t.incoming_units) })] : []))));

  // sales by brand
  sec.append(el("h2", { class: "section", text: tr("Net sales by brand") }));
  if (!sold.length) sec.append(el("p", { class: "small", id: "br-none", text: tr("No sales in this period.") }));
  else {
    const short = (s) => (s.length > 11 ? s.slice(0, 10) + "…" : s);
    sec.append(barChart({ id: "br-chart", title: tr("Net sales by brand") + ", " + curUnit(), legend: [byYear ? tr("This year") : monthName(S.month), tr("Last year")],
      rows: sold.slice(0, 14).map((b) => ({ key: b.brand, label: short(b.brand), v: Math.max(0, num(b.net) || 0), v2: Math.max(0, num(b.ly_net) || 0),
        tip: [b.brand, tr("Net sales") + ": " + fmtMoney(b.net), tr("Last year") + ": " + fmtMoney(b.ly_net), tr("Share") + ": " + fmtPct(b.share)] })) }));
  }
  const cell = (x, cls) => el("td", { class: "r" + (cls ? " " + cls : ""), text: x });
  sec.append(el("div", { class: "table-wrap" }, el("table", { class: "tbl trend", id: "br-table" },
    el("thead", {}, el("tr", {}, [["Brand", ""], ["Net sales", "r"], ["Share", "r"], ["Last year", "r"], ["Change", "r"], ["Units", "r"], ["Average item", "r"], ["Discount", "r"], ["On hand, units", "r"], ["On hand, retail value", "r"]]
      .map(([h, c2]) => el("th", { scope: "col", class: c2 || null, text: tr(h) })))),
    el("tbody", {}, d.brands.map((b) => el("tr", { "data-brand": b.brand, class: num(b.net) ? null : "off" },
      el("th", { scope: "row", text: b.brand }), cell(fmtAmt(b.net)), cell(fmtPct(b.share)), cell(fmtAmt(b.ly_net)), cell(num(b.ly_net) ? fmtChange(b.net, b.ly_net) : "—"),
      cell(fmtNum(b.units)), cell(fmtAmt(b.asp)), cell(fmtPct(b.discount_pct)), cell(fmtNum(b.stock_units)), cell(fmtAmt(b.stock_value))))),
    el("tfoot", {}, el("tr", { id: "br-total" }, el("th", { scope: "row", text: tr("All brands") }), cell(fmtAmt(t.net)), cell(num(t.net) ? fmtPct(1) : "—"), cell(fmtAmt(t.ly_net)),
      cell(num(t.ly_net) ? fmtChange(t.net, t.ly_net) : "—"), cell(fmtNum(t.units)), cell("—"), cell("—"), cell(fmtNum(t.stock_units)), cell(fmtAmt(t.stock_value)))))));

  // arrivals
  sec.append(el("h2", { class: "section", text: tr("Arrivals") }));
  if (!d.arrival_years.length) { sec.append(el("p", { class: "small", id: "arr-none", text: tr("No arrival figures are loaded yet.") })); }
  else {
    const tipOf = (name, y) => [name, tr("Arrived") + ": " + fmtNum(y.units), tr("Sold from them") + ": " + fmtNum(y.sold_units), tr("Still on hand from them") + ": " + fmtNum(y.left_units),
      tr("Arrived, retail value, USD") + ": $" + fmtUZS(y.rrp_usd)];
    sec.append(el("p", { class: "small", id: "arr-note", text: tr("From Colibri's arrival report, by date of arrival. Values are retail prices in USD as Colibri holds them. Sold from them counts sales up to the day the report was taken.") }),
      el("div", { class: "chart-pair" },
        barChart({ id: "arr-chart-months", title: tr("Arrivals by month, {y}, units", { y: year }), legend: [tr("Arrived"), tr("Sold from them, units")], height: 220, width: 480,
          rows: (d.arrival_months || []).map((m) => ({ key: String(m.month).slice(0, 7), label: monthName(m.month, true).split(" ")[0], v: num(m.units) || 0, v2: num(m.sold_units) || 0, tip: tipOf(monthName(m.month), m) })) }),
        barChart({ id: "arr-chart", title: tr("Arrivals by year, units"), legend: [tr("Arrived"), tr("Sold from them, units")], height: 220, width: 480,
          rows: d.arrival_years.map((y) => ({ key: String(y.year), label: String(y.year), v: num(y.units) || 0, v2: num(y.sold_units) || 0, tip: tipOf(String(y.year), y) })) })));
    const arr = d.brands.filter((b) => num(b.arr_units) > 0).sort((a, b) => (num(b.arr_rrp_usd) || 0) - (num(a.arr_rrp_usd) || 0));
    sec.append(el("div", { class: "table-wrap" }, el("table", { class: "tbl trend", id: "arr-table" },
      el("thead", {}, el("tr", {}, [[tr("Brand"), ""], [tr("Arrived in {p}, units", { p: label }), "r"], [tr("Arrived, retail value, USD"), "r"], [tr("Sold from them"), "r"], [tr("Sold from them, %"), "r"], [tr("Still on hand from them"), "r"]]
        .map(([h, c2]) => el("th", { scope: "col", class: c2 || null, text: h })))),
      el("tbody", {}, !arr.length ? [el("tr", { id: "arr-empty" }, el("td", { colspan: "6", class: "small", text: tr("Nothing arrived in this period.") }))] : arr.map((b) => el("tr", { "data-brand": b.brand }, el("th", { scope: "row", text: b.brand }), cell(fmtNum(b.arr_units)), cell(fmtUZS(b.arr_rrp_usd)),
        cell(fmtNum(b.arr_sold_units)), cell(fmtPct(num(b.arr_units) ? num(b.arr_sold_units) / num(b.arr_units) : null, 0)), cell(fmtNum(b.arr_left_units))))),
      el("tfoot", {}, el("tr", { id: "arr-total" }, el("th", { scope: "row", text: tr("All brands") }), cell(fmtNum(t.arr_units)), cell(fmtUZS(t.arr_rrp_usd)), cell("—"), cell("—"), cell("—"))))));
  }
  const oh = d.on_hand_by_arrival;
  sec.append(el("h2", { class: "section", text: tr("What is on hand today, by year of arrival") }),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl trend", id: "onhand-table" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("Year of arrival") }), el("th", { scope: "col", class: "r", text: tr("Units") }))),
      el("tbody", {}, oh.years.map((y) => el("tr", {}, el("th", { scope: "row", text: String(y.year) }), cell(fmtNum(y.units)))),
        el("tr", { id: "onhand-unknown" }, el("th", { scope: "row", text: tr("Arrival date not known") }), cell(fmtNum(oh.unknown)))))));
}
