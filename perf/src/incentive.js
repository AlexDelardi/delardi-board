/* ===========================================================================
   The incentive estimate: the scheme in force applied to each seller's retail
   sales of the month (perf_incentive). An estimate for checking the payout
   sheet, not the payout itself: programme counts are worked out from tickets
   where the rule allows and can be typed over in Inputs.
   ========================================================================= */
Object.assign(RU, {
  "Incentive estimate": "Оценка мотивации",
  "No incentive scheme is on file for this month.": "Для этого месяца схема мотивации не заведена.",
  "Scheme": "Схема", "in force from {m}": "действует с {m}",
  "Store": "Магазин", "Attainment": "Выполнение", "Guardrail factor": "Коэффициент магазина",
  "Sales": "Продажи", "Rate": "Ставка", "Commission": "Комиссия", "Programmes": "Программы", "Total": "Итого", "Paid": "Выплачено", "Difference": "Разница",
  "no plan": "нет плана", "no commission": "без комиссии",
  "Programme": "Программа", "Counted": "Засчитано", "From tickets": "По чекам", "Cap": "Лимит", "Pays": "Выплата", "Amount": "Сумма",
  "typed in": "введено вручную",
  "Programmes are capped at {v} per person.": "Программы ограничены суммой {v} на человека.",
  "Cost of the scheme: {p} of retail sales.": "Стоимость схемы: {p} от розничных продаж.",
  "An estimate from the tickets. Check each programme count before paying.": "Оценка по чекам. Перед выплатой проверьте количество по каждой программе.",
  "All sellers": "Все продавцы",
});

function renderIncentive(main) {
  const sec = el("section", { class: "screen", id: "screen-incentive" }, el("h1", { class: "title", text: tr("Incentive estimate") + (S.month ? " · " + monthName(S.month) : "") }));
  main.append(sec);
  if (monthPending(sec)) return;
  const inc = S.doc.incentive;
  if (!inc) { sec.append(el("p", { class: "notice", id: "inc-none", text: tr("No incentive scheme is on file for this month.") })); return; }
  const ru = LANG === "ru";
  sec.append(el("p", { class: "small", id: "inc-scheme", text: tr("Scheme") + ": " + inc.scheme.name + ", " + tr("in force from {m}", { m: monthName(inc.scheme.valid_from) }) + ". "
    + tr("An estimate from the tickets. Check each programme count before paying.") }));
  const fact = (label, value) => el("div", { class: "fact" }, el("span", { class: "lbl", text: tr(label) }), el("span", { class: "num", text: value }));
  sec.append(el("div", { class: "facts", id: "inc-store" },
    fact("Store", fmtMoney(inc.store.net)), fact("Plan", num(inc.store.plan) !== null ? fmtMoney(inc.store.plan) : "—"),
    fact("Attainment", fmtPct(inc.store.attainment, 0)), fact("Guardrail factor", "×" + fmtNum(inc.store.guardrail, 2))));

  /* one line per seller, then the detail of each */
  const diff = (s) => (num(s.paid) === null ? "—" : signed(num(s.paid) - num(s.total)));
  sec.append(el("div", { class: "table-wrap" }, el("table", { class: "tbl inc", id: "inc-sellers" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("Seller") }),
      ["Sales", "Plan", "Attainment", "Rate", "Commission", "Programmes", "Total", "Paid", "Difference"].map((h) => el("th", { scope: "col", class: "r", text: tr(h) })))),
    el("tbody", {}, inc.sellers.map((s) => el("tr", { "data-seller": s.seller },
      el("th", { scope: "row", text: s.seller }), el("td", { class: "r", text: fmtAmt(s.net) }),
      el("td", { class: "r", text: num(s.plan) === null ? tr("no plan") : fmtAmt(s.plan) }), el("td", { class: "r", text: fmtPct(s.attainment, 0) }),
      el("td", { class: "r", text: s.commission_applies ? fmtPct(s.rate, 2) : tr("no commission") }), el("td", { class: "r", text: fmtAmt(s.commission) }),
      el("td", { class: "r", text: fmtAmt(s.programmes_total) }), el("td", { class: "r", text: fmtAmt(s.total) }),
      el("td", { class: "r", text: fmtAmt(s.paid) }), el("td", { class: "r", text: diff(s) })))),
    el("tfoot", {}, el("tr", { id: "inc-total" }, el("th", { scope: "row", text: tr("All sellers") }), el("td", { class: "r", text: fmtAmt(inc.store.net) }),
      el("td", {}), el("td", {}), el("td", {}), el("td", { class: "r", text: fmtAmt(inc.total.commission) }), el("td", { class: "r", text: fmtAmt(inc.total.programmes) }),
      el("td", { class: "r", text: fmtAmt(inc.total.total) }), el("td", { class: "r", text: fmtAmt(inc.total.paid) }),
      el("td", { class: "r", text: num(inc.total.paid) === null ? "—" : signed(num(inc.total.paid) - num(inc.total.total)) }))))),
    el("p", { class: "small", text: tr("Cost of the scheme: {p} of retail sales.", { p: fmtPct(inc.total.pct_of_sales, 2) })
      + (num(inc.scheme.rules.person_cap) !== null ? " " + tr("Programmes are capped at {v} per person.", { v: fmtMoney(inc.scheme.rules.person_cap) }) : "") }));

  // each cell carries its column's name, so in portrait a seller's line can be shown as a list of named figures
  const heads = [...sec.querySelectorAll("#inc-sellers thead th")].map((h) => h.textContent);
  sec.querySelectorAll("#inc-sellers tbody tr, #inc-sellers tfoot tr").forEach((r) => [...r.children].forEach((c, k) => { if (k) c.setAttribute("data-label", heads[k]); }));

  for (const s of inc.sellers) {
    if (!s.programmes.length) continue;
    sec.append(el("h2", { class: "sec-title", text: s.seller + " · " + tr("Programmes") }),
      el("div", { class: "table-wrap" }, el("table", { class: "tbl inc-prog", "data-seller": s.seller },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("Programme") }),
          ["From tickets", "Counted", "Cap", "Pays", "Amount"].map((h) => el("th", { scope: "col", class: "r", text: tr(h) })))),
        el("tbody", {}, s.programmes.map((p) => el("tr", { "data-key": p.key },
          el("th", { scope: "row", text: (ru && p.label_ru) || p.label || p.key }), el("td", { class: "r", text: fmtNum(p.auto) }),
          el("td", { class: "r" }, fmtNum(p.count), p.overridden ? el("span", { class: "small", text: " (" + tr("typed in") + ")" }) : null),
          el("td", { class: "r", text: fmtNum(p.max) }), el("td", { class: "r", text: fmtAmt(p.pays) }), el("td", { class: "r", text: fmtAmt(p.amount) })))),
        el("tfoot", {}, el("tr", {}, el("th", { scope: "row", text: tr("Total") }), el("td", {}), el("td", {}), el("td", {}), el("td", {}),
          el("td", { class: "r", text: fmtAmt(s.programmes_total) + (num(s.programmes_before_cap) > num(s.programmes_total) ? " (" + fmtAmt(s.programmes_before_cap) + ")" : "") }))))));
  }
}
