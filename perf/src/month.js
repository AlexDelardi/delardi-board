/* ===========================================================================
   The month screen: headline, KPI table, clients, trend, bridge, what was left
   out, and every ticket of the month with how it was counted (and a way to
   correct it). Reads S.doc (perf_month). Charts are plain SVG in kit colours:
   one series, one axis, a table of the same figures under each.
   ========================================================================= */
Object.assign(RU, {
  "Net sales": "Чистые продажи",
  "Against plan": "К плану",
  "Against last year": "К прошлому году",
  "No plan typed in for this month.": "План на этот месяц не введён.",
  "Type it in": "Ввести",
  "plan {v}": "план {v}",
  "gap {v}": "отклонение {v}",
  "last year {v}": "прошлый год {v}",
  "No sales in the same month last year.": "В этом месяце прошлого года продаж не было.",
  "Key figures": "Основные показатели",
  "This month": "Этот месяц", "Last year": "Прошлый год", "Change": "Изменение", "Year to date": "С начала года", "Last year to date": "Прошлый год, с начала",
  "Gross sales": "Продажи до скидок", "Discount": "Скидка", "Tickets": "Чеки", "Units": "Изделия", "Units per ticket (UPT)": "Изделий в чеке (UPT)",
  "Average ticket (NSPT)": "Средний чек (NSPT)", "Average item": "Средняя цена изделия", "Tickets with 2+ items": "Чеки с 2+ изделиями",
  "Large tickets": "Крупные чеки", "Large tickets, value": "Крупные чеки, сумма", "Base book, tickets": "Базовые чеки", "Base book, average": "Базовые чеки, средний",
  "Clients": "Клиенты", "Visits": "Визиты", "of which by appointment": "из них по записи", "Conversion": "Конверсия",
  "A large ticket is {v} or more (USD 10,000 at {fx}).": "Крупный чек — от {v} (10 000 USD по курсу {fx}).",
  "Clients by lifecycle": "Клиенты по статусу",
  "New": "Новые", "Returning": "Постоянные", "Recaptured": "Возвращённые", "No record": "Без карточки",
  "Value": "Сумма", "Share": "Доля",
  "Returning: bought again within 250 days. Recaptured: after more than 250 days.": "Постоянные: повторная покупка в течение 250 дней. Возвращённые: спустя более 250 дней.",
  "13 months": "13 месяцев",
  "Net sales by month": "Чистые продажи по месяцам",
  "plan": "план",
  "Bridge": "Разбор отклонения",
  "From last year": "От прошлого года", "From plan": "От плана",
  "Plan": "План", "Actual": "Факт",
  "More or fewer tickets": "Количество чеков", "Share of large tickets": "Доля крупных чеков", "Ticket size": "Размер чека",
  "Type planned tickets in Inputs to see the bridge from plan.": "Введите плановое число чеков во «Вводных», чтобы увидеть разбор от плана.",
  "Left out of the retail basis": "Не входит в розничную базу",
  "Nothing was left out this month.": "В этом месяце ничего не исключено.",
  "Tickets of the month": "Чеки месяца",
  "Date": "Дата", "Ticket": "Чек", "Client": "Клиент", "Seller": "Продавец", "Counted as": "Учтён как", "Lifecycle": "Статус клиента", "Net": "Сумма",
  "Correct": "Исправить", "Corrected by hand": "Исправлено вручную",
  "Retail": "Розница", "Founder": "Учредитель", "Trade": "Опт", "Staff": "Сотрудник", "Cost-price transfer": "По себестоимости", "Other": "Другое",
  "No tickets this month.": "В этом месяце чеков нет.",
  "Correct ticket {n}": "Исправить чек {n}",
  "As the rules say": "По правилам",
  "Seller (leave empty for the ticket's own)": "Продавец (пусто — как в чеке)",
  "Client reference (leave empty for the ticket's own)": "Код клиента (пусто — как в чеке)",
  "Why": "Причина",
  "Save": "Сохранить",
  "Ticket {n} is corrected.": "Чек {n} исправлен.",
  "No ticket with that reference.": "Чека с таким кодом нет.",
  "No client with that reference.": "Клиента с таким кодом нет.",
  "{d} days since the last purchase": "{d} дн. с прошлой покупки",
  "large": "крупный",
  "refund": "возврат",
});

const BASIS_WORD = { retail: "Retail", founder: "Founder", trade: "Trade", staff: "Staff", cost_transfer: "Cost-price transfer", other: "Other" };
const LIFE_WORD = { new: "New", returning: "Returning", recaptured: "Recaptured", no_record: "No record" };
const basisWord = (b) => tr(BASIS_WORD[b] || b);

function renderMonth(main) {
  const sec = el("section", { class: "screen", id: "screen-month" }, el("h1", { class: "title", text: S.month ? monthName(S.month) : tr("Performance") }));
  main.append(sec);
  if (monthPending(sec)) return;
  const d = S.doc, c = d.cur, ly = d.ly, fx = d.fx;
  const money = (v) => fmtMoney(v);

  /* headline */
  const card = (id, label, big, lines) => el("div", { class: "hl", id }, el("span", { class: "lbl", text: tr(label) }), el("strong", { class: "hl-big num", text: big }),
    lines.map((t) => (typeof t === "string" ? el("span", { class: "small", text: t }) : t)));
  sec.append(el("div", { class: "hl-row" },
    card("hl-net", "Net sales", money(c.net), [fmtOther(c.net), pl(c.tickets, "ticket")]),
    d.plan ? card("hl-plan", "Against plan", fmtPct(d.plan.attainment, 0), [tr("plan {v}", { v: money(d.plan.plan) }), tr("gap {v}", { v: signed(num(d.plan.gap)) + " " + curUnit() })])
      : card("hl-plan", "Against plan", "—", [tr("No plan typed in for this month."), el("a", { class: "small", href: "#/inputs", text: tr("Type it in") })]),
    num(ly.net) ? card("hl-ly", "Against last year", fmtChange(c.net, ly.net), [tr("last year {v}", { v: money(ly.net) }), fmtOther(ly.net)])
      : card("hl-ly", "Against last year", "—", [tr("No sales in the same month last year.")])));

  /* key figures */
  const periods = [c, ly, null, d.ytd, d.ytd_ly];
  const row = (label, get, fmt, opts) => el("tr", { "data-k": label },
    el("th", { scope: "row", text: tr(label) }),
    periods.map((p, i) => {
      if (i === 2) return el("td", { class: "r", text: opts && opts.noChange ? "—" : fmtChange(get(c), get(ly)) });
      if (opts && opts.curOnly && i !== 0) return el("td", { class: "r", text: "—" });
      return el("td", { class: "r", text: fmt(get(p)) });
    }));
  const pct = (v) => fmtPct(v), n0 = (v) => fmtNum(v), n2 = (v) => fmtNum(v, 2), m0 = (v) => fmtAmt(v);
  sec.append(el("h2", { class: "sec-title", text: tr("Key figures") }),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl kpi", id: "kpi" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col" }), ["This month", "Last year", "Change", "Year to date", "Last year to date"].map((h) => el("th", { scope: "col", class: "r", text: tr(h) })))),
      el("tbody", {},
        row("Net sales", (p) => p.net, m0), row("Gross sales", (p) => p.gross, m0), row("Discount", (p) => p.discount_pct, pct, { noChange: true }),
        row("Tickets", (p) => p.tickets, n0), row("Units", (p) => p.units, n0), row("Units per ticket (UPT)", (p) => p.upt, n2),
        row("Average ticket (NSPT)", (p) => p.atv, m0), row("Average item", (p) => p.asp, m0), row("Tickets with 2+ items", (p) => p.multi_item_share, pct, { noChange: true }),
        row("Large tickets", (p) => p.large.tickets, n0), row("Large tickets, value", (p) => p.large.net, m0),
        row("Base book, tickets", (p) => p.base.tickets, n0), row("Base book, average", (p) => p.base.avg, m0),
        row("Clients", (p) => p.clients, n0),
        row("Visits", () => d.funnel.visits, n0, { curOnly: true, noChange: true }),
        row("Conversion", () => d.funnel.conversion, pct, { curOnly: true, noChange: true })))),
    el("p", { class: "small", text: tr("A large ticket is {v} or more (USD 10,000 at {fx}).", { v: money(d.large_from_uzs), fx: fmtUZS(fx) })
      + (num(d.funnel.visits_appointment) !== null ? " " + tr("Visits") + ": " + tr("of which by appointment") + " " + d.funnel.visits_appointment + "." : "") }));

  /* clients */
  sec.append(el("h2", { class: "sec-title", text: tr("Clients by lifecycle") }),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl", id: "life" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col" }), [tr("Tickets"), tr("Value"), tr("Share")].map((h) => el("th", { scope: "col", class: "r", text: h })))),
      el("tbody", {}, Object.keys(LIFE_WORD).map((k) => el("tr", { "data-k": k },
        el("th", { scope: "row", text: tr(LIFE_WORD[k]) }), el("td", { class: "r", text: fmtNum(c.lifecycle[k].tickets) }),
        el("td", { class: "r", text: fmtAmt(c.lifecycle[k].net) }),
        el("td", { class: "r", text: num(c.net) > 0 ? fmtPct(num(c.lifecycle[k].net) / num(c.net)) : "—" })))))),
    el("p", { class: "small", text: tr("Returning: bought again within 250 days. Recaptured: after more than 250 days.") }));

  /* trend */
  sec.append(el("h2", { class: "sec-title", text: tr("13 months") }), trendChart(d.trend),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl trend", id: "trend" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("Month") }),
        ["Net sales", "Plan", "Tickets", "NSPT", "UPT", "Discount", "Conversion"].map((h) => el("th", { scope: "col", class: "r", text: tr(h) })))),
      el("tbody", {}, d.trend.slice().reverse().map((t) => el("tr", {},
        el("th", { scope: "row", text: monthName(t.month, true) }), el("td", { class: "r", text: fmtAmt(t.net) }), el("td", { class: "r", text: fmtAmt(t.plan) }),
        el("td", { class: "r", text: fmtNum(t.tickets) }), el("td", { class: "r", text: fmtAmt(t.atv) }), el("td", { class: "r", text: fmtNum(t.upt, 2) }),
        el("td", { class: "r", text: fmtPct(t.discount_pct) }), el("td", { class: "r", text: fmtPct(t.conversion, 0) })))))));

  /* bridge */
  sec.append(el("h2", { class: "sec-title", text: tr("Bridge") }),
    el("div", { class: "bridges" },
      bridgeBlock("bridge-ly", "From last year", "Last year", d.bridge.ly, tr("No sales in the same month last year.")),
      bridgeBlock("bridge-plan", "From plan", "Plan", d.bridge.plan, d.plan ? tr("Type planned tickets in Inputs to see the bridge from plan.") : tr("No plan typed in for this month."))));

  /* left out */
  sec.append(el("h2", { class: "sec-title", text: tr("Left out of the retail basis") }),
    d.excluded.length ? el("div", { class: "table-wrap" }, el("table", { class: "tbl", id: "excluded" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col" }), el("th", { scope: "col", class: "r", text: tr("Tickets") }), el("th", { scope: "col", class: "r", text: tr("Value") }))),
      el("tbody", {}, d.excluded.map((x) => el("tr", {}, el("th", { scope: "row", text: basisWord(x.basis) }),
        el("td", { class: "r", text: fmtNum(x.tickets) }), el("td", { class: "r", text: fmtAmt(x.net) }))))))
      : el("p", { class: "small", id: "excluded-none", text: tr("Nothing was left out this month.") }));

  /* tickets */
  sec.append(el("h2", { class: "sec-title", text: tr("Tickets of the month") }),
    d.tickets.length ? el("div", { class: "table-wrap" }, el("table", { class: "tbl tickets", id: "tickets" },
      el("thead", {}, el("tr", {}, ["Date", "Ticket", "Client", "Seller", "Counted as", "Lifecycle"].map((h) => el("th", { scope: "col", text: tr(h) })),
        el("th", { scope: "col", class: "r", text: tr("Net") }), el("th", { scope: "col" }, el("span", { class: "sr-only", text: tr("Correct") })))),
      el("tbody", {}, d.tickets.map((t) => el("tr", { "data-id": t.ticket_id, class: t.basis === "retail" ? null : "off" },
        el("td", { class: "num", text: fmtDate(t.sold_at) }),
        el("td", {}, t.ticket_no, t.large ? el("span", { class: "tag info", text: tr("large") }) : null, num(t.net) < 0 ? el("span", { class: "tag line", text: tr("refund") }) : null),
        el("td", { text: blank(t.client) ? (blank(t.client_id) ? "—" : t.client_id) : t.client }),
        el("td", { text: blank(t.seller) ? "—" : t.seller }),
        el("td", {}, el("span", { class: "tag " + (t.basis === "retail" ? "act" : "done"), text: basisWord(t.basis) }),
          t.marked ? el("span", { class: "small mark-note", title: tr("Corrected by hand"), text: " ✎" }) : null),
        el("td", { title: num(t.days_since) !== null ? tr("{d} days since the last purchase", { d: t.days_since }) : null, text: t.lifecycle ? tr(LIFE_WORD[t.lifecycle]) : "—" }),
        el("td", { class: "r", text: fmtAmt(t.net) }),
        el("td", { class: "r" }, el("button", { type: "button", class: "btn tk-correct", onclick: () => correctTicket(t), text: tr("Correct") })))))))
      : el("p", { class: "small", id: "tickets-none", text: tr("No tickets this month.") }));
}

/* ------------------------------------------------------------------- trend
   One series (net sales), one axis from zero, the month's plan as a tick across its bar. */
function trendChart(trend) {
  const W = 960, H = 260, L = 8, R = 8, T = 16, B = 34;
  const max = Math.max(1, ...trend.map((t) => Math.max(num(t.net) || 0, num(t.plan) || 0)));
  const step = (W - L - R) / trend.length, bw = Math.min(40, step * 0.6);
  const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const svgEl = (tag, attrs, kids) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, v);
    (kids || []).forEach((k) => k && n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
    return n;
  };
  const wrap = el("div", { class: "chart", id: "trend-chart" });
  const tip = (ev, t) => {
    let n = $(".chart-tip");
    if (!n) { n = el("div", { class: "chart-tip", role: "status" }); document.body.appendChild(n); }
    n.innerHTML = "";
    n.append(el("strong", { text: monthName(t.month) }), el("span", { text: tr("Net sales") + ": " + fmtMoney(t.net) }),
      num(t.plan) !== null ? el("span", { text: tr("Plan") + ": " + fmtMoney(t.plan) }) : null,
      el("span", { text: tr("Tickets") + ": " + fmtNum(t.tickets) }));
    const r = ev.currentTarget.getBoundingClientRect();
    n.style.left = Math.max(8, Math.min(window.scrollX + r.left + r.width / 2 - 100, window.scrollX + document.documentElement.clientWidth - 208)) + "px";
    n.style.top = (window.scrollY + r.top - 8) + "px";
  };
  const hide = () => { const n = $(".chart-tip"); if (n) n.remove(); };
  const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": tr("Net sales by month") + ", " + curUnit(), preserveAspectRatio: "xMidYMid meet" },
    [svgEl("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "axis" })].concat(trend.map((t, i) => {
      const cx = L + step * i + step / 2, v = num(t.net) || 0, last = i === trend.length - 1;
      const g = svgEl("g", { class: "bar" + (last ? " cur" : ""), tabindex: "0", "data-month": String(t.month).slice(0, 7) }, [
        svgEl("rect", { x: cx - step / 2, y: T, width: step, height: H - T - B, class: "hit" }),
        v > 0 ? svgEl("rect", { x: cx - bw / 2, y: y(v), width: bw, height: Math.max(1, H - B - y(v)), class: "mark" }) : null,
        num(t.plan) > 0 ? svgEl("line", { x1: cx - bw / 2 - 5, x2: cx + bw / 2 + 5, y1: y(num(t.plan)), y2: y(num(t.plan)), class: "plan" }) : null,
        svgEl("text", { x: cx, y: H - 12, class: "tick", "text-anchor": "middle" }, [/-01/.test(String(t.month).slice(4, 7)) || i === 0 ? monthName(t.month, true) : monthName(t.month, true).split(" ")[0]]),
      ]);
      g.addEventListener("mouseenter", (ev) => tip(ev, t)); g.addEventListener("focus", (ev) => tip(ev, t));
      g.addEventListener("mouseleave", hide); g.addEventListener("blur", hide);
      return g;
    })));
  wrap.append(el("p", { class: "small chart-title" }, tr("Net sales by month") + ", " + curUnit(),
    trend.some((t) => num(t.plan) > 0) ? el("span", { class: "plan-key" }, el("span", { class: "plan-mark", "aria-hidden": "true" }), tr("plan")) : null), svg);
  return wrap;
}

/* ------------------------------------------------------------------ bridge
   From the reference to the actual in three parts. Each part is a bar from a shared zero line: to the right when it
   adds, to the left when it takes away; the sign is written too, so direction never rests on the fill alone. */
function bridgeBlock(id, title, fromLabel, b, emptyText) {
  const box = el("div", { class: "bridge", id }, el("h3", { class: "lbl", text: tr(title) }));
  if (!b) { box.append(el("p", { class: "small", text: emptyText })); return box; }
  const parts = [["tickets", "More or fewer tickets"], ["mix", "Share of large tickets"], ["size", "Ticket size"]];
  const max = Math.max(1, ...parts.map(([k]) => Math.abs(num(b[k]) || 0)));
  const line = (label, value, cls, bar) => el("div", { class: "br-row " + cls },
    el("span", { class: "br-l", text: label }),
    bar === null ? el("span", { class: "br-bar" }) : el("span", { class: "br-bar", "aria-hidden": "true" },
      el("span", { class: "br-fill " + (bar < 0 ? "neg" : "pos"), style: "width:" + (Math.abs(bar) / max * 50).toFixed(1) + "%;" + (bar < 0 ? "right:50%" : "left:50%") })),
    el("span", { class: "br-v num", text: value }));
  // in the currency on screen the last part is taken as the rest, so the lines still add up to the figure shown
  const shown = { from: inCur(b.from), to: inCur(b.to), tickets: inCur(num(b.tickets) || 0), mix: inCur(num(b.mix) || 0) };
  shown.size = shown.to - shown.from - shown.tickets - shown.mix;
  box.append(line(tr(fromLabel), fmtUZS(shown.from), "end", null),
    ...parts.map(([k, label]) => line(tr(label), signedRaw(shown[k]), "part", num(b[k]) || 0)),
    line(tr("Actual"), fmtUZS(shown.to), "end", null));
  return box;
}

/* ----------------------------------------------------------- one ticket */
function correctTicket(t) {
  // the form opens with the correction already on the ticket, so saving one field does not wipe the others
  const k = t.mark || {};
  const basis = el("select", { id: "tk-basis" }, el("option", { value: "", text: tr("As the rules say") }),
    Object.keys(BASIS_WORD).map((b) => el("option", { value: b, selected: k.basis === b ? true : null, text: basisWord(b) })));
  const seller = el("input", { type: "text", id: "tk-seller", maxlength: "80", autocomplete: "off", value: k.seller || "" });
  const client = el("input", { type: "text", id: "tk-client", maxlength: "20", autocomplete: "off", spellcheck: "false", placeholder: "DLD-…", value: k.client_id || "" });
  const note = el("input", { type: "text", id: "tk-note", maxlength: "300", autocomplete: "off", value: k.note || "" });
  const err = el("p", { class: "form-err", id: "tk-err", role: "alert", hidden: true });
  const save = el("button", { type: "submit", class: "btn primary", id: "tk-save", text: tr("Save") });
  const month = S.month;
  const field = (id, label, input) => el("label", { class: "field", for: id }, el("span", { class: "lbl", text: tr(label) }), input);
  const form = el("form", { id: "tk-form", onsubmit: async (ev) => {
    ev.preventDefault();
    if (save.disabled) return;
    save.disabled = true; err.hidden = true;
    try {
      const d = await api("mark_ticket", { month, ticket_id: t.ticket_id, mark: { basis: basis.value || null, seller: seller.value.trim() || null, client_id: client.value.trim() || null, note: note.value.trim() || null } });
      if (S.locked || S.month !== month) return;
      takeDoc(d);
      m.close();
      renderAll();
      toast(tr("Ticket {n} is corrected.", { n: t.ticket_no }));
    } catch (e) { if (S.locked) return; err.textContent = e.message; err.hidden = false; save.disabled = false; }
  } }, field("tk-basis", "Counted as", basis), field("tk-seller", "Seller (leave empty for the ticket's own)", seller),
    field("tk-client", "Client reference (leave empty for the ticket's own)", client), field("tk-note", "Why", note), err);
  const m = modal("tk-dialog", tr("Correct ticket {n}", { n: t.ticket_no }), form, [save,
    el("button", { type: "button", class: "btn", id: "tk-cancel", onclick: () => m.close(), text: tr("Cancel") })]);
  save.setAttribute("form", "tk-form");
}
