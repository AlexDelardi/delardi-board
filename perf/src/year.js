/* Delardi Performance — year.js
   The year: to date against the same months last year and against the plans typed in, four charts, and the months
   in a table. One document per year (perf_year). */
Object.assign(RU, {
  "Year": "Год", "Loading the year…": "Загружаем год…", "Year to date, January to {m}": "С начала года, январь – {m}", "The whole year": "Год целиком",
  "Net sales, year to date": "Чистые продажи с начала года", "Net sales, the year": "Чистые продажи за год", "{n} tickets": "чеков: {n}",
  "Against the same months last year": "К тем же месяцам прошлого года", "Against last year, whole": "К прошлому году целиком",
  "same months last year {v}": "те же месяцы прошлого года: {v}", "last year in full {v}": "прошлый год целиком: {v}",
  "Against plan, planned months": "К плану, месяцы с планом", "plan to date {v}": "план на сегодня: {v}", "sales of those months {v}": "продажи этих месяцев: {v}",
  "No plan typed in for this year.": "На этот год план не введён.", "No sales in the same months last year.": "В те же месяцы прошлого года продаж не было.",
  "Net sales by month, this year and last": "Чистые продажи по месяцам, этот год и прошлый", "Cumulative net sales": "Чистые продажи накопительно",
  "Tickets by month": "Чеки по месяцам", "Average ticket by month": "Средний чек по месяцам",
  "Month by month": "По месяцам", "Bridge from last year": "Разбор отклонения к прошлому году",
  "Large tickets, value": "Крупные чеки, сумма", "Base book": "Базовый поток", "vs last year": "к прошлому году", "Total to date": "Итого с начала года",
});
function yearPicker() {
  if (!S.span) return null;
  const first = Number(S.span.first.slice(0, 4)), last = Number(S.span.last.slice(0, 4)), ys = [];
  for (let y = last; y >= first; y--) ys.push(y);
  const sel = el("select", { id: "year-select", "aria-label": tr("Year"), onchange: () => setYear(Number(sel.value)) },
    ys.map((y) => el("option", { value: y, selected: y === S.year ? true : null, text: String(y) })));
  return el("div", { class: "month-picker" },
    el("button", { type: "button", class: "btn", id: "year-prev", "aria-label": tr("Previous year"), disabled: S.year <= first ? true : null, onclick: () => setYear(S.year - 1), text: "‹" }),
    sel,
    el("button", { type: "button", class: "btn", id: "year-next", "aria-label": tr("Next year"), disabled: S.year >= last ? true : null, onclick: () => setYear(S.year + 1), text: "›" }));
}
function setYear(y) {
  if (!S.span || S.locked || y === S.year) return;
  if (y < Number(S.span.first.slice(0, 4)) || y > Number(S.span.last.slice(0, 4))) return;
  S.year = y; sstore(YEAR_KEY, String(y)); renderAll();
}
function renderYear(main) {
  const sec = el("section", { class: "screen", id: "screen-year" }, el("h1", { class: "title", text: S.year ? String(S.year) : tr("Year") }));
  main.append(sec);
  const st = need("yearDoc", "year", { year: S.year }, String(S.year));
  if (pending(sec, st, "Loading the year…")) return;
  const d = st.doc, c = d.cur, ly = d.ly, ms = d.months, mlab = (m) => monthName(m.month, true).split(" ")[0];
  sec.append(el("p", { class: "small", id: "year-period", text: d.complete ? tr("The whole year") : tr("Year to date, January to {m}", { m: monthName(d.through) }) }));
  const card = (id, label, big, lines) => el("div", { class: "hl", id }, el("span", { class: "lbl", text: tr(label) }), el("strong", { class: "hl-big num", text: big }),
    lines.map((t) => el("span", { class: "small", text: t })));
  sec.append(el("div", { class: "hl-row" },
    card("yr-net", d.complete ? "Net sales, the year" : "Net sales, year to date", fmtMoney(c.net), [fmtOther(c.net), tr("{n} tickets", { n: fmtNum(c.tickets) })]),
    num(d.plan.to_date) ? card("yr-plan", "Against plan, planned months", fmtPct(d.plan.attainment, 0),
        [tr("plan to date {v}", { v: fmtMoney(d.plan.to_date) }), tr("sales of those months {v}", { v: fmtMoney(d.plan.net_planned_months) })])
      : card("yr-plan", "Against plan, planned months", "—", [tr("No plan typed in for this year.")]),
    num(ly.net) ? card("yr-ly", "Against the same months last year", fmtChange(c.net, ly.net),
        [tr("same months last year {v}", { v: fmtMoney(ly.net) }), tr("last year in full {v}", { v: fmtMoney(d.ly_full.net) })])
      : card("yr-ly", "Against the same months last year", "—", [tr("No sales in the same months last year.")])));

  // charts: sales against last year, cumulative, tickets, average ticket
  let cum = 0, cumLy = 0, cumPlan = 0, anyPlan = false;
  const cumRows = ms.map((m) => {
    cumLy += num(m.ly_net) || 0;
    if (m.in_period) cum += num(m.net) || 0;
    if (num(m.plan) !== null) { cumPlan += num(m.plan); anyPlan = true; }
    return { cur: m.in_period ? cum : null, ly: cumLy, plan: anyPlan ? cumPlan : null };
  });
  const unit = ", " + curUnit();
  sec.append(el("h2", { class: "section", text: tr("Net sales by month, this year and last") }),
    barChart({ id: "yr-chart-net", title: tr("Net sales by month, this year and last") + unit, legend: [tr("This year"), tr("Last year")],
      rows: ms.map((m) => ({ key: String(m.month).slice(0, 7), label: mlab(m), v: num(m.net) || 0, v2: num(m.ly_net) || 0, off: !m.in_period,
        tip: [monthName(m.month), tr("Net sales") + ": " + fmtMoney(m.net), tr("Last year") + ": " + fmtMoney(m.ly_net), num(m.plan) !== null ? tr("Plan") + ": " + fmtMoney(m.plan) : null].filter(Boolean) })) }),
    el("h2", { class: "section", text: tr("Cumulative net sales") }),
    lineChart({ id: "yr-chart-cum", title: tr("Cumulative net sales") + unit, labels: ms.map(mlab),
      series: [{ cls: "s-ly", name: tr("Last year"), values: cumRows.map((r) => r.ly) }].concat(anyPlan ? [{ cls: "s-plan", name: tr("Plan (cumulative)"), values: cumRows.map((r) => r.plan) }] : [],
        [{ cls: "s-cur", name: tr("This year"), values: cumRows.map((r) => r.cur) }]),
      tip: (i) => [monthName(ms[i].month), tr("This year") + ": " + (cumRows[i].cur === null ? "—" : fmtMoney(cumRows[i].cur)), tr("Last year") + ": " + fmtMoney(cumRows[i].ly),
        cumRows[i].plan === null ? null : tr("Plan (cumulative)") + ": " + fmtMoney(cumRows[i].plan)].filter(Boolean) }),
    el("div", { class: "chart-pair" },
      barChart({ id: "yr-chart-tickets", title: tr("Tickets by month"), legend: [tr("This year"), tr("Last year")], height: 220, width: 480,
        rows: ms.map((m) => ({ key: String(m.month).slice(0, 7), label: mlab(m), v: num(m.tickets) || 0, v2: num(m.ly_tickets) || 0, off: !m.in_period,
          tip: [monthName(m.month), tr("Tickets") + ": " + fmtNum(m.tickets), tr("Last year") + ": " + fmtNum(m.ly_tickets)] })) }),
      barChart({ id: "yr-chart-atv", title: tr("Average ticket by month") + unit, legend: [tr("This year"), tr("Last year")], height: 220, width: 480,
        rows: ms.map((m) => ({ key: String(m.month).slice(0, 7), label: mlab(m), v: num(m.atv) || 0, v2: num(m.ly_atv) || 0, off: !m.in_period,
          tip: [monthName(m.month), tr("Average ticket (NSPT)") + ": " + fmtMoney(m.atv), tr("Last year") + ": " + fmtMoney(m.ly_atv)] })) })));

  // the bridge and the months
  sec.append(el("h2", { class: "section", text: tr("Bridge from last year") }),
    el("div", { class: "bridges" }, bridgeBlock("yr-bridge", "From last year", "Last year", d.bridge.ly, tr("No sales in the same months last year."))));
  const cell = (t) => el("td", { class: "r", text: t });
  sec.append(el("h2", { class: "section", text: tr("Month by month") }),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl trend", id: "yr-months" },
      el("thead", {}, el("tr", {}, [["Month", ""], ["Net sales", "r"], ["Last year", "r"], ["Change", "r"], ["Plan", "r"], ["Tickets", "r"], ["NSPT", "r"], ["UPT", "r"], ["Discount", "r"], ["Large tickets, value", "r"], ["Conversion", "r"]]
        .map(([h, c2]) => el("th", { scope: "col", class: c2 || null, text: tr(h) })))),
      el("tbody", {}, ms.map((m) => el("tr", { class: m.in_period ? null : "off", "data-month": String(m.month).slice(0, 7) },
        el("th", { scope: "row" }, el("a", { href: "#/month", onclick: () => { setMonth(String(m.month).slice(0, 7)); }, text: monthName(m.month, true) })),
        cell(fmtAmt(m.net)), cell(fmtAmt(m.ly_net)), cell(num(m.ly_net) ? fmtChange(m.net, m.ly_net) : "—"), cell(fmtAmt(m.plan)), cell(fmtNum(m.tickets)),
        cell(fmtAmt(m.atv)), cell(fmtNum(m.upt, 2)), cell(fmtPct(m.discount_pct)), cell(fmtAmt(m.large_net)), cell(fmtPct(m.conversion, 0))))),
      el("tfoot", {}, el("tr", { id: "yr-total" }, el("th", { scope: "row", text: tr("Total to date") }), cell(fmtAmt(c.net)), cell(fmtAmt(ly.net)), cell(num(ly.net) ? fmtChange(c.net, ly.net) : "—"),
        cell(fmtAmt(d.plan.to_date)), cell(fmtNum(c.tickets)), cell(fmtAmt(c.atv)), cell(fmtNum(c.upt, 2)), cell(fmtPct(c.discount_pct)), cell(fmtAmt(c.large.net)), cell("—"))))));
}
