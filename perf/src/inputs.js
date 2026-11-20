/* ===========================================================================
   The month's inputs: plan, visits, rate, and per seller the plan, whether
   commission applies, programme counts typed over the automatic ones, and
   what was paid. Saving replaces the month's inputs as a whole; the server
   logs every change and answers with the month recomputed.
   ========================================================================= */
Object.assign(RU, {
  "Inputs for {m}": "Вводные за {m}",
  "Plan, so'm": "План, сум", "Planned tickets": "Плановое число чеков", "of which large tickets": "из них крупных", "Planned value of large tickets, so'm": "Плановая сумма крупных чеков, сум",
  "Visits to the boutique": "Визиты в бутик", "USD rate for the month": "Курс USD на месяц", "Note": "Примечание",
  "empty = 12 000": "пусто = 12 000",
  "Planned tickets are needed for the bridge from plan.": "Плановое число чеков нужно для разбора отклонения от плана.",
  "Sellers": "Продавцы",
  "Seller": "Продавец", "Commission applies": "Комиссия начисляется", "Paid, so'm": "Выплачено, сум",
  "Add a seller": "Добавить продавца", "Remove": "Убрать",
  "Programme counts typed here replace the count from tickets. Leave empty to use the tickets.": "Количество, введённое здесь, заменяет подсчёт по чекам. Оставьте пустым, чтобы считать по чекам.",
  "Saved.": "Сохранено.",
  "Check the figures marked.": "Проверьте отмеченные значения.",
  "Last saved by {who}, {when}.": "Последнее сохранение: {who}, {when}.",
  "Nothing typed in for this month yet.": "За этот месяц пока ничего не введено.",
  "Saving…": "Сохраняю…",
  "A figure cannot be below zero.": "Значение не может быть меньше нуля.",
  "The rate must be above zero.": "Курс должен быть больше нуля.",
  "Planned large tickets cannot be more than planned tickets.": "Крупных чеков в плане не может быть больше, чем чеков всего.",
  "The planned value of large tickets cannot be more than the plan.": "Плановая сумма крупных чеков не может превышать план.",
  "Appointments cannot be more than visits.": "Визитов по записи не может быть больше, чем визитов всего.",
});

// The form is built once per month from the document and then lives in S.form, so a redraw (language) keeps what was typed.
function inputsForm() {
  const d = S.doc, i = d.inputs, txt = (v) => (num(v) === null ? "" : String(Math.round(num(v))));
  const progs = d.incentive ? d.incentive.scheme.rules.programmes || [] : [];
  // every seller with a plan row or with sales this month
  const names = new Set(i.sellers.map((s) => s.seller));
  if (d.incentive) d.incentive.sellers.forEach((s) => names.add(s.seller));
  d.tickets.forEach((t) => { if (t.basis === "retail" && !blank(t.seller)) names.add(t.seller); });
  return {
    month: S.month, busy: false, err: null,
    v: { plan_uzs: txt(i.plan_uzs), plan_tickets: txt(i.plan_tickets), plan_large_tickets: txt(i.plan_large_tickets), plan_large_uzs: txt(i.plan_large_uzs),
      visits: txt(i.visits), visits_appointment: txt(i.visits_appointment), fx: num(i.fx) === null ? "" : String(num(i.fx)), note: i.note || "" },
    sellers: [...names].sort().map((n) => {
      const s = i.sellers.find((x) => x.seller === n) || {};
      const counts = {};
      progs.forEach((p) => { const c = (s.programme_counts || {})[p.key]; counts[p.key] = c === undefined || c === null ? "" : String(c); });
      return { seller: n, plan_uzs: txt(s.plan_uzs), commission: s.commission !== false, paid_uzs: txt(s.paid_uzs), counts };
    }),
  };
}

function renderInputs(main) {
  const sec = el("section", { class: "screen", id: "screen-inputs" }, el("h1", { class: "title", text: S.month ? tr("Inputs for {m}", { m: monthName(S.month) }) : tr("Inputs") }));
  main.append(sec);
  if (monthPending(sec)) return;
  if (!S.form || S.form.month !== S.month) S.form = inputsForm();
  const f = S.form, d = S.doc;
  const progs = d.incentive ? d.incentive.scheme.rules.programmes || [] : [];
  const ru = LANG === "ru";
  const keep = (obj, key) => (e) => { obj[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value; };
  const input = (id, obj, key, attrs) => el("input", Object.assign({ type: "text", inputmode: "numeric", id, autocomplete: "off", value: obj[key], oninput: keep(obj, key) }, attrs || {}));
  const field = (id, label, node, hint) => el("label", { class: "field", for: id }, el("span", { class: "lbl", text: tr(label) }), node, hint ? el("span", { class: "small", text: tr(hint) }) : null);
  const form = el("form", { id: "inputs-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); saveInputs(); } },
    el("p", { class: "small", id: "inputs-saved", text: d.inputs.updated_by ? tr("Last saved by {who}, {when}.", { who: d.inputs.updated_by, when: fmtDate(d.inputs.updated_at) + " " + fmtTime(d.inputs.updated_at) })
      : tr("Nothing typed in for this month yet.") }),
    el("div", { class: "in-grid" },
      field("in-plan", "Plan, so'm", input("in-plan", f.v, "plan_uzs")),
      field("in-plan-tickets", "Planned tickets", input("in-plan-tickets", f.v, "plan_tickets"), "Planned tickets are needed for the bridge from plan."),
      field("in-plan-large", "of which large tickets", input("in-plan-large", f.v, "plan_large_tickets")),
      field("in-plan-large-uzs", "Planned value of large tickets, so'm", input("in-plan-large-uzs", f.v, "plan_large_uzs")),
      field("in-visits", "Visits to the boutique", input("in-visits", f.v, "visits")),
      field("in-appt", "of which by appointment", input("in-appt", f.v, "visits_appointment")),
      field("in-fx", "USD rate for the month", input("in-fx", f.v, "fx", { inputmode: "decimal", placeholder: tr("empty = 12 000") })),
      field("in-note", "Note", el("input", { type: "text", id: "in-note", maxlength: "500", autocomplete: "off", value: f.v.note, oninput: keep(f.v, "note") }))),
    el("h2", { class: "sec-title", text: tr("Sellers") }),
    progs.length ? el("p", { class: "small", text: tr("Programme counts typed here replace the count from tickets. Leave empty to use the tickets.") }) : null,
    el("div", { class: "table-wrap" }, el("table", { class: "tbl in-sellers", id: "in-sellers" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("Seller") }), el("th", { scope: "col", text: tr("Plan, so'm") }), el("th", { scope: "col", text: tr("Commission applies") }),
        progs.map((p) => el("th", { scope: "col", text: (ru && p.label_ru) || p.label || p.key })), el("th", { scope: "col", text: tr("Paid, so'm") }),
        el("th", { scope: "col" }, el("span", { class: "sr-only", text: tr("Remove") })))),
      el("tbody", {}, f.sellers.map((s, k) => el("tr", { "data-row": String(k) },
        el("td", { class: "c-seller", "data-label": tr("Seller") }, el("input", { type: "text", class: "in-seller", maxlength: "80", autocomplete: "off", "aria-label": tr("Seller"), value: s.seller, oninput: keep(s, "seller") })),
        el("td", { class: "c-money", "data-label": tr("Plan, so'm") }, input(null, s, "plan_uzs", { class: "in-s-plan", "aria-label": tr("Plan, so'm") })),
        el("td", { class: "c-comm", "data-label": tr("Commission applies") }, el("input", { type: "checkbox", class: "in-s-comm", "aria-label": tr("Commission applies"), checked: s.commission ? true : null, onchange: keep(s, "commission") })),
        progs.map((p) => el("td", { "data-label": (ru && p.label_ru) || p.label || p.key }, input(null, s.counts, p.key, { class: "in-s-count", "data-key": p.key, "aria-label": (ru && p.label_ru) || p.label || p.key, maxlength: "4" }))),
        el("td", { class: "c-money", "data-label": tr("Paid, so'm") }, input(null, s, "paid_uzs", { class: "in-s-paid", "aria-label": tr("Paid, so'm") })),
        el("td", { class: "r c-remove" }, el("button", { type: "button", class: "btn in-s-remove", onclick: () => { f.sellers.splice(k, 1); renderAll(); }, text: tr("Remove") }))))))),
    el("p", {}, el("button", { type: "button", class: "btn", id: "in-add", onclick: () => {
      const counts = {}; progs.forEach((p) => { counts[p.key] = ""; });
      f.sellers.push({ seller: "", plan_uzs: "", commission: true, paid_uzs: "", counts }); renderAll();
      const rows = document.querySelectorAll("#in-sellers .in-seller"); if (rows.length) rows[rows.length - 1].focus();
    }, text: tr("Add a seller") })),
    el("p", { class: "form-err", id: "in-err", role: "alert", hidden: f.err ? null : true, text: f.err || "" }),
    el("p", {}, el("button", { type: "submit", class: "btn primary", id: "in-save", disabled: f.busy ? true : null, text: f.busy ? tr("Saving…") : tr("Save") })));
  sec.append(form);
}

async function saveInputs() {
  const f = S.form;
  if (!f || f.busy || S.locked) return;
  // every figure is read the same way as in the other tools: spaces, dots and commas group; letters or a minus are refused
  let bad = false;
  const amount = (sel, raw) => { const r = readAmount(raw); markInvalid(typeof sel === "string" ? $(sel) : sel, r.invalid); if (r.invalid) bad = true; return r.value; };
  const v = f.v;
  const inputs = {
    plan_uzs: amount("#in-plan", v.plan_uzs), plan_tickets: amount("#in-plan-tickets", v.plan_tickets), plan_large_tickets: amount("#in-plan-large", v.plan_large_tickets),
    plan_large_uzs: amount("#in-plan-large-uzs", v.plan_large_uzs), visits: amount("#in-visits", v.visits), visits_appointment: amount("#in-appt", v.visits_appointment),
    note: v.note.trim() || null, fx: null, sellers: [],
  };
  const fxText = String(v.fx).trim().replace(/\s/g, "").replace(",", ".");
  if (fxText) {
    const n = Number(fxText);
    if (!/^\d+(\.\d{1,2})?$/.test(fxText) || !(n > 0)) { markInvalid($("#in-fx"), true); bad = true; } else { markInvalid($("#in-fx"), false); inputs.fx = n; }
  } else markInvalid($("#in-fx"), false);
  const rows = document.querySelectorAll("#in-sellers tbody tr");
  f.sellers.forEach((s, k) => {
    const row = rows[k];
    if (!s.seller.trim()) return;
    const counts = {};
    for (const [key, raw] of Object.entries(s.counts)) { const c = amount(row && row.querySelector('.in-s-count[data-key="' + key + '"]'), raw); if (c !== null) counts[key] = c; }
    inputs.sellers.push({ seller: s.seller.trim(), plan_uzs: amount(row && row.querySelector(".in-s-plan"), s.plan_uzs), commission: !!s.commission,
      programme_counts: counts, paid_uzs: amount(row && row.querySelector(".in-s-paid"), s.paid_uzs) });
  });
  if (bad) { f.err = tr("Check the figures marked."); const e = $("#in-err"); e.textContent = f.err; e.hidden = false; return; }
  const month = f.month;
  f.busy = true; f.err = null;
  renderAll();
  try {
    const d = await api("save_month", { month, inputs });
    if (S.locked || S.month !== month) return;
    takeDoc(d);
    S.form = null;                                 // rebuilt from what the server now holds
    renderAll();
    toast(tr("Saved."));
  } catch (e) {
    if (S.locked || S.form !== f) return;
    f.busy = false; f.err = e.message;
    renderAll();
  }
}
