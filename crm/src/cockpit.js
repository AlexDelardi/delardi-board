/* ===========================================================================
   The cockpit (24 Nov 2026)
   A sales rep's own cabinet beside the list of all clients: the dates coming up
   for her clients, who to contact (never approached, or not for 230 days),
   purchases still to follow up, what clients asked for and did not get, and her
   clients by value. One document from crm-api `cockpit`, computed in the
   database. A login that is a rep sees its own; a login that is not a rep
   chooses whose to look at. Every row opens the client's card.
   ========================================================================= */
Object.assign(RU, {
  "All clients": "Все клиенты", "My clients": "Мои клиенты", "Cockpit": "Кабинет",
  "{rep} · my clients": "{rep} · мои клиенты", "{rep} · clients": "{rep} · клиенты",
  "Choose a sales rep": "Выберите продавца", "Sales rep": "Продавец",
  "Choose a sales rep to see their dates, who to contact and follow-ups.": "Выберите продавца, чтобы увидеть даты, кому написать и что довести до конца.",
  "Loading the cockpit…": "Загружаем кабинет…", "Could not load the cockpit.": "Не удалось загрузить кабинет.",
  "To contact": "Связаться", "{a} never approached · {b} not for {d} days": "{a} без контакта · {b} более {d} дн.",
  "Dates, next 30 days": "Даты, ближайшие 30 дней", "birthdays and important dates": "дни рождения и важные даты",
  "Contacted, last 30 days": "Контакты за 30 дней", "{pct} of my clients": "{pct} моих клиентов", "{pct} of the clients": "{pct} клиентов",
  "{spend} lifetime spend": "{spend} покупок за всё время",
  "Dates coming up": "Ближайшие даты", "From a week back to 30 days ahead. A date already past is still worth a message.": "От недели назад до 30 дней вперёд. Прошедшую дату ещё не поздно поздравить.",
  "No dates in the next 30 days.": "В ближайшие 30 дней дат нет.",
  "When": "Когда", "Client": "Клиент", "What": "Событие",
  "Birthday": "День рождения", "Birthday · turns {n}": "День рождения · исполняется {n}", "Anniversary": "Годовщина", "Partner's birthday": "День рождения партнёра",
  "Child's birthday": "День рождения ребёнка", "Date": "Дата", "{what} · {n}": "{what} · {n}",
  "do not contact": "не беспокоить", "date to confirm": "дату нужно подтвердить",
  "today": "сегодня", "tomorrow": "завтра", "yesterday": "вчера", "in {n}": "через {n}", "{n} ago": "{n} назад",
  "Who to contact": "Кому написать или позвонить", "Never approached, or not for {d} days or more. Highest lifetime spend first; do-not-contact left out.": "Ни разу не связывались или не связывались {d} дней и больше. Сначала самые ценные; «не беспокоить» не показаны.",
  "Showing the first {n} of {total}.": "Показаны первые {n} из {total}.",
  "Everyone has been approached in the last {d} days.": "Со всеми связывались за последние {d} дней.",
  "Why": "Почему", "Last purchase": "Последняя покупка", "Lifetime spend": "Покупки за всё время",
  "never approached": "ни разу не связывались", "not approached for {n}": "не связывались {n}", "Prospect": "Потенциальный клиент",
  "Purchases to follow up": "Покупки: довести до конца", "Bought in the last 75 days and not approached since. Two days: a thank-you. Two weeks: a check-in. Two months: the next idea.": "Купили за последние 75 дней, и с тех пор с ними не связывались. Через два дня — благодарность. Через две недели — узнать, всё ли нравится. Через два месяца — новая идея.",
  "No purchases waiting for a follow-up.": "Покупок, ожидающих контакта, нет.",
  "Step": "Шаг", "Bought": "Покупка", "Thank-you": "Благодарность", "Check-in": "Узнать впечатления", "Next idea": "Новая идея",
  "What clients asked for": "О чём спрашивали клиенты", "Open requests from the chats: asked for something that was not there.": "Открытые запросы из чатов: спрашивали то, чего не было.",
  "Asked": "Спросили", "Request": "Запрос",
  "My clients by value": "Мои клиенты по ценности", "Clients by value": "Клиенты по ценности", "The first {n}, highest lifetime spend first.": "Первые {n}, сначала самые ценные.",
  "Open all {n} in the list": "Открыть все {n} в списке", "Last contact": "Последний контакт", "No clients are attached yet.": "Клиенты пока не закреплены.",
  "Unnamed record": "Запись без имени", "Amount": "Сумма", "Clients": "Клиенты",
});
PL.year = PL.year || { en: ["year", "years"], ru: ["год", "года", "лет"] };

const CK_KINDS = { birthday: "Birthday", anniversary: "Anniversary", partner_birthday: "Partner's birthday", child_birthday: "Child's birthday", other: "Date" };
const CK_STAGES = { two_days: "Thank-you", two_weeks: "Check-in", two_months: "Next idea" };
let ckSeq = 0;
function ckIsOwn() { return !!(S.ref && S.ref.my_rep); }
async function loadCockpit(rep) {
  const seq = ++ckSeq;
  S.ck = { loading: true, rep: rep || (S.ck && S.ck.rep) || null, doc: S.ck && S.ck.doc && !rep ? S.ck.doc : null };
  renderCockpit();
  try {
    const d = await call("cockpit", S.ck.rep ? { rep: S.ck.rep } : {});
    if (seq !== ckSeq) return;
    let mine = null;
    if (d.rep) mine = await call("clients", { type: "client", client_owner: d.rep, order_by: "spend", dir: "desc", limit: 25, offset: 0 });
    if (seq !== ckSeq) return;
    S.ck = { loading: false, rep: d.rep, doc: d, mine, error: null };
  } catch (e) {
    if (seq !== ckSeq) return;
    S.ck = { loading: false, rep: S.ck.rep, doc: null, error: e.message };
  }
  renderCockpit();
}
function ckRel(n) {
  return n === 0 ? tr("today") : n === 1 ? tr("tomorrow") : n === -1 ? tr("yesterday") : n > 0 ? tr("in {n}", { n: pl(n, "day") }) : tr("{n} ago", { n: pl(-n, "day") });
}
function ckDay(iso) {
  return new Date(String(iso).slice(0, 10) + "T00:00:00Z").toLocaleDateString(LOC(), { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
}
const ckName = (r) => blank(r.name || r.display_name) ? tr("Unnamed record") : (r.name || r.display_name);
// One table whose rows open the client's card, on click, Enter or Space.
function ckTable(id, caption, headers, rows, cells, numericFrom) {
  return el("div", { class: "tbl-scroll" }, [el("table", { class: "bdays ck-table", id }, [
    el("caption", { class: "sr-only", text: caption }),
    el("thead", {}, [el("tr", {}, headers.map((h, i) => el("th", { scope: "col", class: i >= numericFrom ? "num" : null, text: h })))]),
    el("tbody", {}, rows.map((r) => {
      const open = () => openCard(r.client_id);
      return el("tr", { tabindex: "0", "data-id": r.client_id, onclick: open, class: r.in_days !== undefined && r.in_days <= 7 ? "soon" : null,
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } },
        "aria-label": tr("Open {id}", { id: r.client_id }) + " — " + ckName(r) }, cells(r).map((c, i) => el("td", { class: i >= numericFrom ? "num" : i === 0 ? "w" : null }, Array.isArray(c) ? c : [c])));
    })),
  ])]);
}
const ckWho = (r, extra) => [el("div", { class: "nm", text: ckName(r) }), el("div", { class: "muted id" }, [r.client_id].concat(extra || []))];
function ckDates(d) {
  const what = (r) => {
    if (r.kind === "birthday") return r.years ? tr("Birthday · turns {n}", { n: r.years }) : tr("Birthday");
    const base = blank(r.label) ? tr(CK_KINDS[r.kind] || "Date") : r.label;
    return r.years ? tr("{what} · {n}", { what: base, n: pl(r.years, "year") }) : base;
  };
  const rows = d.dates || [];
  return card(tr("Dates coming up"), tr("From a week back to 30 days ahead. A date already past is still worth a message."), [
    rows.length ? ckTable("ck-dates", tr("Dates coming up"), [tr("When"), tr("Client"), tr("What")], rows, (r) => [
      [el("div", { class: "bd", text: ckDay(r.on) }), el("div", { class: "muted", text: ckRel(r.in_days) })],
      ckWho(r, [r.do_not_contact ? el("span", { class: "to-confirm", text: " · " + tr("do not contact") }) : null,
        r.confirmed === false ? el("span", { class: "to-confirm", text: " · " + tr("date to confirm") }) : null]),
      what(r)], 9)
      : el("p", { class: "empty-line", id: "ck-dates", text: tr("No dates in the next 30 days.") }),
  ], "ck-card");
}
function ckContact(d) {
  const rows = d.to_contact || [], total = num(d.to_contact_total);
  return card(tr("Who to contact"), tr("Never approached, or not for {d} days or more. Highest lifetime spend first; do-not-contact left out.", { d: d.days }), [
    rows.length ? ckTable("ck-contact", tr("Who to contact"), [tr("Client"), tr("Why"), tr("Last purchase"), tr("Lifetime spend")], rows, (r) => [
      ckWho(r, r.record_type === "prospect" ? [el("span", { text: " · " + tr("Prospect") })] : null),
      r.reason === "never" ? tr("never approached") : tr("not approached for {n}", { n: pl(num(r.days_since), "day") }),
      r.last_purchase_at ? fmtDate(r.last_purchase_at) : "—",
      el("span", { title: fullUZS(r.spend), text: num(r.spend) ? fmtUZS(r.spend) : "—" })], 2)
      : el("p", { class: "empty-line", id: "ck-contact", text: tr("Everyone has been approached in the last {d} days.", { d: d.days }) }),
    total > rows.length ? el("p", { class: "muted ck-more", text: tr("Showing the first {n} of {total}.", { n: rows.length, total }) }) : null,
  ], "ck-card");
}
function ckFollow(d) {
  const rows = d.follow_ups || [];
  return card(tr("Purchases to follow up"), tr("Bought in the last 75 days and not approached since. Two days: a thank-you. Two weeks: a check-in. Two months: the next idea."), [
    rows.length ? ckTable("ck-follow", tr("Purchases to follow up"), [tr("Step"), tr("Client"), tr("Bought"), tr("Amount")], rows, (r) => [
      [el("div", { class: "bd", text: tr(CK_STAGES[r.stage] || "Check-in") }), el("div", { class: "muted", text: ckRel(-num(r.days_since)) })],
      ckWho(r), fmtDate(r.sold_at), el("span", { title: fullUZS(r.net), text: fmtUZS(r.net) })], 3)
      : el("p", { class: "empty-line", id: "ck-follow", text: tr("No purchases waiting for a follow-up.") }),
  ], "ck-card");
}
function ckMissed(d) {
  const rows = d.missed || [];
  if (!rows.length) return null;
  return card(tr("What clients asked for"), tr("Open requests from the chats: asked for something that was not there."), [
    ckTable("ck-missed", tr("What clients asked for"), [tr("Asked"), tr("Client"), tr("Request")], rows, (r) => [
      fmtDate(r.asked_at), ckWho(r), [blank(r.brand) ? null : el("div", { class: "nm", text: r.brand }), el("div", { class: "muted", text: blank(r.excerpt) ? "—" : r.excerpt })]], 9),
  ], "ck-card");
}
function ckClients(d, own) {
  const m = S.ck.mine || { rows: [], total: 0 };
  const all = () => drill({ owner: d.rep }, "", "client");
  return card(tr(own ? "My clients by value" : "Clients by value"), m.rows.length ? tr("The first {n}, highest lifetime spend first.", { n: m.rows.length }) : null, [
    m.rows.length ? ckTable("ck-clients", tr("Clients by value"), [tr("Client"), tr("Last purchase"), tr("Last contact"), tr("Lifetime spend")], m.rows, (r) => [
      ckWho(r), r.last_purchase_at ? fmtDate(r.last_purchase_at) : "—", r.last_contact_on ? fmtDate(r.last_contact_on) : "—",
      el("span", { title: fullUZS(r.lifetime_spend_uzs), text: fmtUZS(r.lifetime_spend_uzs) })], 3)
      : el("p", { class: "empty-line", id: "ck-clients", text: tr("No clients are attached yet.") }),
    el("button", { class: "btn", type: "button", id: "ck-clients-all", onclick: all, text: tr("Open all {n} in the list", { n: num(m.total) }) }),
  ], "ck-card ck-wide");
}
function ckKpis(d, own) {
  const s = d.summary || {}, n = num(s.clients);
  const jump = (id) => () => { const t = $("#" + id); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); } };
  const wrap = (id, t) => { t.id = id; return t; };
  return el("div", { class: "scoreboard ins-kpis ck-kpis", id: "ck-kpis" }, [
    wrap("ck-kpi-clients", tile({ label: tr(own ? "My clients" : "Clients"), val: String(n), sub: tr("{spend} lifetime spend", { spend: fmtUZS(s.spend) }), subTitle: fullUZS(s.spend), onclick: jump("ck-clients") })),
    wrap("ck-kpi-contact", tile({ label: tr("To contact"), tone: "serious", val: String(num(s.never_contacted) + num(s.overdue)),
      sub: tr("{a} never approached · {b} not for {d} days", { a: num(s.never_contacted), b: num(s.overdue), d: d.days }), onclick: jump("ck-contact") })),
    wrap("ck-kpi-dates", tile({ label: tr("Dates, next 30 days"), val: String(num(s.dates_next_30)), sub: tr("birthdays and important dates"), onclick: jump("ck-dates") })),
    wrap("ck-kpi-touched", tile({ label: tr("Contacted, last 30 days"), tone: "good", val: String(num(s.contacted_30d)),
      sub: tr(own ? "{pct} of my clients" : "{pct} of the clients", { pct: pctOf(num(s.contacted_30d), n) }) })),
  ]);
}
function ckPicker(d) {
  const reps = (d && d.reps) || [];
  return el("label", { class: "ck-pick" }, [el("span", { class: "muted", text: tr("Sales rep") }),
    el("select", { id: "ck-rep", "aria-label": tr("Sales rep"), onchange: (e) => { if (e.target.value) loadCockpit(e.target.value); } },
      [el("option", { value: "", text: tr("Choose a sales rep") })].concat(reps.map((r) => el("option", { value: r, selected: S.ck && S.ck.rep === r ? true : null, text: who(r) })))) ]);
}
function renderCockpit() {
  const host = $("#cockpit-host");
  if (!host) return;
  host.innerHTML = "";
  const k = S.ck || {}, d = k.doc, own = ckIsOwn();
  if (k.error) {
    host.append(el("div", { class: "empty" }, [el("h3", { text: tr("Could not load the cockpit.") }), el("p", { text: k.error }),
      el("button", { class: "btn", type: "button", onclick: () => loadCockpit(), text: tr("Try again") })]));
    return;
  }
  if (!d) { host.append(el("p", { class: "empty-line", text: tr("Loading the cockpit…") })); return; }
  const head = el("div", { class: "ck-head" }, [
    el("h2", { class: "ins-h2", id: "ck-title", text: d.rep ? tr(own && d.rep === d.own ? "{rep} · my clients" : "{rep} · clients", { rep: who(d.rep) }) : tr("Cockpit") }),
    own ? null : ckPicker(d)]);
  if (!d.rep) {
    host.append(head, el("p", { class: "lede", text: tr("Choose a sales rep to see their dates, who to contact and follow-ups.") }));
    return;
  }
  host.setAttribute("aria-busy", k.loading ? "true" : "false");
  host.append(head, ckKpis(d, own), el("div", { class: "ck-grid" }, [ckDates(d), ckContact(d), ckFollow(d), ckMissed(d), ckClients(d, own)]));
}
