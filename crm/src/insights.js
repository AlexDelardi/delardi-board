/* ===========================================================================
   Insights (Phase 3)
   One document from crm-api `insights`, computed in the database: where the
   value sits (ABC × lifecycle), the segment playbook, each owner's book, how
   acquisition and the brand mix have moved, and birthdays. Retail by default.
   Every figure clicks through to the client list, filtered to the same people.
   Charts are plain HTML: one hue for single series, a validated two-colour pair
   for new vs returning, a one-hue ordinal ramp for ordered buckets. Every chart
   has its numbers in a table underneath, and every mark has a tooltip that also
   shows on keyboard focus.
   ========================================================================= */
Object.assign(RU, {
  "Views": "Разделы",
  "Clients": "Клиенты",
  "Insights": "Аналитика",
  "Retail clients only": "Только розничные клиенты",
  "Including related parties": "Вместе со связанными лицами",
  "Basis": "База",
  "As of {d}": "На {d}",
  "Classes recalculated every night from purchase history · last run {t}": "Классы пересчитываются каждую ночь по истории покупок · последний пересчёт {t}",
  "Loading insights…": "Загружаем аналитику…",
  "Clients with purchases": "Клиенты с покупками",
  "{spend} lifetime spend": "{spend} за всё время",
  "Active in the last 12 months": "Активные за 12 месяцев",
  "{pct} of clients · {spend}": "{pct} клиентов · {spend}",
  "Bought more than once": "Покупали больше одного раза",
  "{pct} of clients": "{pct} клиентов",
  "Priority win-back": "Приоритетный возврат",
  "{spend} · cannot lose + at risk, high value": "{spend} · два приоритетных сегмента",
  "Birthdays, next 30 days": "Дни рождения, 30 дней",
  "confirmed dates · do-not-contact left out": "только подтверждённые даты",
  "Value and activity": "Ценность и активность",
  "Trends: acquisition and mix": "Динамика: привлечение и структура",
  "Birthdays": "Дни рождения",
  "Where the value sits": "Где сосредоточена ценность",
  "Clients and lifetime spend by ABC class and lifecycle. The shade of each cell follows the spend scale below.": "Клиенты и сумма покупок по классу ABC и жизненному циклу. Оттенок ячейки соответствует шкале суммы ниже.",
  "{pct} of class A spend sits with clients who have not bought for more than a year.": "{pct} суммы класса A приходится на клиентов, которые не покупали больше года.",
  "Class": "Класс",
  "Total": "Итого",
  "Lower spend": "Меньше",
  "Higher spend": "Больше",
  "Show the numbers": "Показать цифры",
  "Spend": "Сумма",
  "Class {c}, {l}": "Класс {c}, {l}",
  "Priority lists": "Приоритетные списки",
  "Segments in the order the playbook works them. Who calls, and how soon.": "Сегменты в порядке работы по плейбуку: кто звонит и в какой срок.",
  "{shared} of {n} “Cannot lose” clients ({spend}) sit on the shared list with no named owner. The playbook gives this list to the Store Manager.": "{shared} из {n} клиентов «Нельзя потерять» ({spend}) находятся в общем списке без закреплённого владельца. По плейбуку этот список ведёт управляющий магазином.",
  "Who · when": "Кто · когда",
  "{named} named · {shared} shared": "{named} закреплено · {shared} в общем",
  "Store Manager": "Управляющий",
  "Advisor": "Консультант",
  "Marketing": "Маркетинг",
  "Within 30 days": "В течение 30 дней",
  "Within 14 days": "В течение 14 дней",
  "Within 60 days": "В течение 60 дней",
  "Every 4–6 weeks": "Каждые 4–6 недель",
  "Every 6–8 weeks": "Каждые 6–8 недель",
  "30 / 90 days": "Через 30 / 90 дней",
  "Quarterly": "Раз в квартал",
  "Once a year": "Раз в год",
  "High lifetime value, silent for two years or more. Understand why they left before selling anything.": "Высокая сумма покупок, молчат два года и больше. Сначала понять, почему ушли, и только потом что-то предлагать.",
  "Big spender, silent for one to two years. A personal call; offer a private appointment, not a discount.": "Крупный покупатель, молчит один-два года. Личный звонок; предложить частную встречу, а не скидку.",
  "Recent, frequent, high value. Preview new arrivals before launch; invite to every event.": "Покупают недавно, часто и много. Показывать новинки до запуска, приглашать на все события.",
  "One large recent purchase. Thank-you within 72 hours, care follow-up at 30 days, a curated proposal at 90.": "Одна крупная недавняя покупка. Благодарность в течение 72 часов, звонок по уходу через 30 дней, подборка через 90.",
  "Bought several times, nothing for one to two years. A personal call about what they already own.": "Покупали несколько раз, но ничего не брали один-два года. Личный звонок с отсылкой к тому, что у них уже есть.",
  "Recent and repeat. Contact around new deliveries in their brand; suggest a new category.": "Покупают недавно и повторно. Связаться при поступлениях их бренда, предложить новую категорию.",
  "One recent entry-level purchase. Welcome, complete the client card, invite to the next event.": "Одна недавняя покупка начального уровня. Поприветствовать, заполнить карточку, пригласить на ближайшее событие.",
  "Silent for one to two years, moderate value. A warm re-contact tied to an occasion or a new collection.": "Молчат один-два года, средняя ценность. Тёплый повод: праздник или новая коллекция.",
  "Low to mid value, silent two to three years. One well-made reactivation contact a year.": "Низкая или средняя ценность, молчат два-три года. Один продуманный контакт в год.",
  "No purchase for three years, low value. Keep on file; include only in broad brand moments.": "Нет покупок три года, низкая ценность. Хранить в базе, включать только в общие рассылки бренда.",
  "Owner books": "Клиентские книги",
  "Each owner's clients by lifecycle. The shared list is the whole team's win-back list.": "Клиенты каждого владельца по жизненному циклу. Общий список — это список возврата для всей команды.",
  "Class A": "Класс A",
  "Priority": "Приоритет",
  "Birthdays 30 d": "ДР за 30 дн.",
  "New clients by year of first purchase": "Новые клиенты по году первой покупки",
  "New clients fell from {a} in {ya} to {b} in {yb}.": "Число новых клиентов упало с {a} в {ya} до {b} в {yb}.",
  "{y} to date": "{y}, по сегодня",
  "{n} new clients": "{n} новых клиентов",
  "First purchase in {y}": "Первая покупка в {y}",
  "Revenue by year: new and returning clients": "Выручка по годам: новые и вернувшиеся клиенты",
  "Returning clients brought {pct} of {y} revenue.": "Вернувшиеся клиенты принесли {pct} выручки {y} года.",
  "From returning clients": "От вернувшихся клиентов",
  "From new clients": "От новых клиентов",
  "Year": "Год",
  "Returning clients": "Вернувшиеся клиенты",
  "New clients": "Новые клиенты",
  "One purchase or more": "Одна покупка или больше",
  "{n} clients ({pct}) bought once, holding {spend}. The second purchase is the biggest lever in the book.": "{n} клиентов ({pct}) купили один раз — это {spend}. Вторая покупка — самый сильный рычаг в базе.",
  "Share of clients": "Доля клиентов",
  "Share of lifetime spend": "Доля суммы покупок",
  "1 purchase": "1 покупка",
  "2 purchases": "2 покупки",
  "3–4 purchases": "3–4 покупки",
  "5+ purchases": "5+ покупок",
  "Brand mix": "Структура по брендам",
  "Lifetime revenue by brand, with the number of clients who bought it.": "Выручка за всё время по брендам и число клиентов, купивших бренд.",
  "Other brands": "Другие бренды",
  "Brand not identified": "Бренд не определён",
  "{spend} · {n}": "{spend} · {n}",
  "Bought {b}": "Покупали {b}",
  "Brand by year": "Бренды по годам",
  "Lifetime revenue by year of purchase, top five brands.": "Выручка по году покупки, пять крупнейших брендов.",
  "Category mix": "Структура по категориям",
  "Bought: {c}": "Покупали: {c}",
  "Category": "Категория",
  "Watch": "Часы",
  "Bracelet": "Браслет",
  "Necklace / pendant": "Колье / подвеска",
  "Ring": "Кольцо",
  "Earrings": "Серьги",
  "Jewellery – other": "Украшения — другое",
  "Brooch / other": "Брошь / другое",
  "Category not identified": "Категория не определена",
  "Clients across brands": "Клиенты нескольких брендов",
  "{n} clients bought two or more brands and hold {pct} of lifetime spend.": "{n} клиентов покупали два бренда и больше, на них приходится {pct} суммы покупок.",
  "Only unidentified brands": "Только неопределённые бренды",
  "1 brand": "1 бренд",
  "2 brands": "2 бренда",
  "3+ brands": "3+ бренда",
  "Brands bought": "Куплено брендов",
  "Bought together most often": "Чаще всего покупают вместе",
  "{a} + {b}": "{a} + {b}",
  "Coming up in the next 30 days": "Ближайшие 30 дней",
  "No confirmed birthdays in the next 30 days.": "В ближайшие 30 дней подтверждённых дней рождения нет.",
  "today": "сегодня",
  "tomorrow": "завтра",
  "in {n}": "через {n}",
  "Birthdays by month": "Дни рождения по месяцам",
  "Confirmed dates of birth only; clients marked do-not-contact are left out.": "Только подтверждённые даты рождения; клиенты с отметкой «не беспокоить» не учитываются.",
  "this month": "этот месяц",
  "Birthday in {m}": "День рождения: {m}",
  "Month": "Месяц",
  "{a} confirmed · {b} still to confirm in the clean-up · {c} not on file": "{a} подтверждено · {b} ещё подтвердить при чистке · {c} нет в базе",
  "{n} marked do-not-contact are left out.": "{n} с отметкой «не беспокоить» не учитываются.",
  "When": "Когда",
  "From insights": "Из аналитики",
  "Remove this filter": "Убрать этот фильтр",
  "Could not load the insights.": "Не удалось загрузить аналитику.",
  "Open the list": "Открыть список",
  "Click to see these clients": "Нажмите, чтобы увидеть этих клиентов",
  "automatic recalculation": "автоматический пересчёт",
  "ABC class {a} → {b}": "Класс ABC {a} → {b}",
  "Lifecycle {a} → {b}": "Жизненный цикл: {a} → {b}",
  "Segment {a} → {b}": "Сегмент: {a} → {b}",
  "Recalculated": "Пересчитано",
  "Priority win-back list": "Приоритетный список возврата",
  "Retail re-cut: ABC is now calculated without the related parties.": "Пересчёт по рознице: ABC теперь считается без связанных лиц.",
  "Bought 2+ brands": "Покупали 2+ бренда",
  "Bought {n}": "Покупок: {n}",
  // segment names the workbook uses
  "New high-value": "Новый, высокая ценность",
  "Needs attention": "Требует внимания",
  "At risk - high value": "Под угрозой, высокая ценность",
  "Cannot lose": "Нельзя потерять",
});
PL.client = { en: ["client", "clients"], ru: ["клиент", "клиента", "клиентов"] };
PL.day = { en: ["day", "days"], ru: ["день", "дня", "дней"] };

// The workbook's clienteling playbook, in the order the lists are worked.
const PLAYBOOK = [
  { seg: "Cannot lose", who: "Store Manager", when: "Within 30 days",
    what: "High lifetime value, silent for two years or more. Understand why they left before selling anything." },
  { seg: "At risk - high value", who: "Store Manager", when: "Within 14 days",
    what: "Big spender, silent for one to two years. A personal call; offer a private appointment, not a discount." },
  { seg: "Champion", who: "Store Manager", when: "Every 4–6 weeks",
    what: "Recent, frequent, high value. Preview new arrivals before launch; invite to every event." },
  { seg: "New high-value", who: "Advisor", when: "30 / 90 days",
    what: "One large recent purchase. Thank-you within 72 hours, care follow-up at 30 days, a curated proposal at 90." },
  { seg: "Needs attention", who: "Advisor", when: "Within 30 days",
    what: "Bought several times, nothing for one to two years. A personal call about what they already own." },
  { seg: "Loyal", who: "Advisor", when: "Every 6–8 weeks",
    what: "Recent and repeat. Contact around new deliveries in their brand; suggest a new category." },
  { seg: "New client", who: "Advisor", when: "Quarterly",
    what: "One recent entry-level purchase. Welcome, complete the client card, invite to the next event." },
  { seg: "At risk", who: "Advisor", when: "Within 60 days",
    what: "Silent for one to two years, moderate value. A warm re-contact tied to an occasion or a new collection." },
  { seg: "Hibernating", who: "Advisor", when: "Once a year",
    what: "Low to mid value, silent two to three years. One well-made reactivation contact a year." },
  { seg: "Lost", who: "Marketing", when: "Once a year",
    what: "No purchase for three years, low value. Keep on file; include only in broad brand moments." },
];
const PRIORITY_SEGMENTS = ["Cannot lose", "At risk - high value"];
const FREQ = [["1", "1 purchase"], ["2", "2 purchases"], ["3-4", "3–4 purchases"], ["5+", "5+ purchases"]];
const BRAND_BUCKETS = [["0", "Only unidentified brands"], ["1", "1 brand"], ["2", "2 brands"], ["3+", "3+ brands"]];
const UNASSIGNED = "Unassigned";

/* ------------------------------------------------------------ view switch */
const VIEWS = ["clients", "insights", "data"];
function viewFromUrl() {
  try { const v = new URLSearchParams(location.search).get("view"); return VIEWS.includes(v) ? v : "clients"; }
  catch (e) { return "clients"; }
}
function syncViewUrl() {
  const q = S.view === "clients" ? "" : "?view=" + S.view;
  const url = location.pathname + q + location.hash;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
}
function setView(v) {
  if (S.view === v) return;
  S.view = v;
  syncViewUrl();
  hideTip();
  renderAll();
  window.scrollTo(0, 0);
  const tab = document.querySelector('.view-tab[data-view="' + v + '"]');
  if (tab) tab.focus();
}
function renderViews() {
  const tab = (v, label) => el("button", { class: "view-tab", type: "button", "data-view": v,
    "aria-current": S.view === v ? "page" : null, onclick: () => setView(v), text: label });
  return el("nav", { class: "views", "aria-label": tr("Views") },
    [tab("clients", tr("Clients")), tab("insights", tr("Insights")), tab("data", tr("Data"))]);
}

/* -------------------------------------------------------------- drill-down */
// Open the client list filtered to the people behind a figure. Filters the
// toolbar knows go into the toolbar; the rest ride along as a labelled chip.
function drill(patch, label, type) {
  const f = blankFilters();
  f.type = type !== undefined ? type : S.insBasis === "all" ? "client" : "retail";
  const params = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k in f && k !== "drill") f[k] = v; else params[k] = v;
  }
  f.drill = Object.keys(params).length || label ? { label: label || "", params } : null;
  S.f = f;
  S.view = "clients";
  syncViewUrl();
  hideTip();
  renderAll();
  window.scrollTo(0, 0);
  loadList();
  const host = $("#list-host");
  if (host) { host.setAttribute("tabindex", "-1"); host.focus({ preventScroll: true }); }
}
const ownerPatch = (o) => o.kind === "shared" ? { owner: "__unassigned" }
  : o.kind === "left" ? { owner: "__orphaned" } : { owner: o.owner };

/* ------------------------------------------------------------------ loading */
let insSeq = 0;
async function loadInsights() {
  const seq = ++insSeq;
  S.insLoading = true;
  renderInsights();
  try {
    const d = await call("insights", S.insBasis === "all" ? { include_related: true } : {});
    if (seq !== insSeq) return;
    S.ins = d; S.insError = null;
  } catch (e) {
    if (seq !== insSeq) return;
    S.insError = e.message;
  }
  S.insLoading = false;
  renderInsights();
}

/* ----------------------------------------------------------------- tooltip */
// One tooltip for every mark. Values lead, labels follow; the same readout
// appears on keyboard focus. Text only — never markup from the data.
function tipEl() {
  let t = $("#viztip");
  if (!t) { t = el("div", { id: "viztip", class: "viztip", role: "tooltip", "aria-hidden": "true" }); document.body.appendChild(t); }
  return t;
}
function showTip(target, x, y) {
  const t = tipEl();
  t.innerHTML = "";
  const lines = String(target.dataset.tipV || "").split("\n");
  t.append(el("b", { text: lines[0] }));
  for (const extra of lines.slice(1)) t.append(el("span", { class: "extra", text: extra }));
  if (target.dataset.tipL) t.append(el("span", { text: target.dataset.tipL }));
  t.classList.add("show");
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 12;
  if (left + r.width > window.innerWidth - 8) left = Math.max(8, x - r.width - 14);
  if (top < 8) top = y + 18;
  t.style.left = left + "px"; t.style.top = top + "px";
}
function hideTip() { const t = $("#viztip"); if (t) t.classList.remove("show"); }
document.addEventListener("pointermove", (e) => {
  const m = e.target.closest && e.target.closest("[data-tip-v]");
  if (m) showTip(m, e.clientX, e.clientY); else hideTip();
});
document.addEventListener("focusin", (e) => {
  const m = e.target.closest && e.target.closest("[data-tip-v]");
  if (m) { const r = m.getBoundingClientRect(); showTip(m, r.left + r.width / 2, r.top); } else hideTip();
});
document.addEventListener("focusout", hideTip);
// On a touch screen there is no hover: a tap on a mark that is not itself a
// link or button shows its readout.
document.addEventListener("click", (e) => {
  const m = e.target.closest && e.target.closest("[data-tip-v]");
  if (!m || m.matches("button, a")) return;
  const r = m.getBoundingClientRect();
  showTip(m, r.left + r.width / 2, r.top);
});
window.addEventListener("scroll", hideTip, { passive: true });

/* ----------------------------------------------------------------- helpers */
const num = (v) => Number(v || 0);
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0) + "%";
const tipAttrs = (v, l) => ({ "data-tip-v": v, "data-tip-l": l || null });
function monthName(m, style) {
  return new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString(LOC(), { month: style || "long", timeZone: "UTC" });
}
function card(title, sub, kids, extraClass) {
  return el("section", { class: "icard" + (extraClass ? " " + extraClass : "") }, [
    el("h3", { text: title }),
    sub ? el("p", { class: "isub", text: sub }) : null,
    ...kids,
  ]);
}
const lede = (text) => el("p", { class: "lede", text });
function numbers(headers, rows, numericFrom = 1) {
  return el("details", { class: "numbers" }, [
    el("summary", { text: tr("Show the numbers") }),
    el("div", { class: "tbl-scroll" }, [el("table", { class: "mini" }, [
      el("thead", {}, [el("tr", {}, headers.map((h, i) => el("th", { scope: "col", class: i >= numericFrom ? "num" : null, text: h })))]),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c, i) => el(i === 0 ? "th" : "td",
        { scope: i === 0 ? "row" : null, class: i >= numericFrom ? "num" : null, text: c }))))),
    ])]),
  ]);
}
const catLabel = (c) => c === UNASSIGNED ? tr("Category not identified") : tr(c);
const brandLabel = (b) => b === UNASSIGNED ? tr("Brand not identified") : b;

/* ------------------------------------------------------------------ charts */
// Vertical columns, one series. Value on the cap; the column is the hit target.
function columnChart(items, opts = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return el("div", { class: "cols", style: "--n:" + items.length }, [
    el("div", { class: "plot" }, items.map((it) => {
      const h = Math.max(it.value ? 2 : 0, (it.value / max) * 100);
      const props = { class: "col" + (it.em ? " em" : ""), style: "--h:" + h + "%", ...tipAttrs(it.tip, it.tipLabel),
        "aria-label": it.aria };
      const kids = [el("span", { class: "cap", text: it.cap }), el("span", { class: "bar" })];
      return it.onclick ? el("button", { type: "button", ...props, onclick: it.onclick }, kids)
        : el("span", { tabindex: "0", role: "img", ...props }, kids);
    })),
    el("div", { class: "xaxis" }, items.map((it) => el("span", { class: it.em ? "em" : null, text: it.label }))),
  ]);
}
// Stacked columns, two series. Total on the cap, a 2px surface gap between parts.
function stackedColumns(items, series) {
  const max = Math.max(1, ...items.map((i) => i.parts.reduce((a, b) => a + b, 0)));
  return el("div", { class: "cols stacked", style: "--n:" + items.length }, [
    el("div", { class: "plot" }, items.map((it) => {
      const total = it.parts.reduce((a, b) => a + b, 0);
      return el("span", { class: "col", style: "--h:" + (total / max) * 100 + "%", tabindex: "0", role: "img",
        "aria-label": it.aria, ...tipAttrs(it.tip, it.tipLabel) }, [
        el("span", { class: "cap", text: it.cap }),
        el("span", { class: "stack" }, it.parts.map((p, i) => p > 0
          ? el("span", { class: "part s" + (i + 1), style: "flex-grow:" + p }) : null).reverse()),
      ]);
    })),
    el("div", { class: "xaxis" }, items.map((it) => el("span", { text: it.label }))),
    el("div", { class: "legend" }, series.map((s, i) => el("span", {}, [el("i", { class: "sw s" + (i + 1), "aria-hidden": "true" }), s]))),
  ]);
}
// Horizontal bars, one series. Value at the tip, outside the bar.
function barList(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return el("div", { class: "hbars" }, items.map((it) => {
    const props = { class: "hbar" + (it.muted ? " muted-bar" : ""), ...tipAttrs(it.tip, it.tipLabel), "aria-label": it.aria };
    const kids = [
      el("span", { class: "hl", text: it.label }),
      el("span", { class: "track" }, [el("span", { class: "fill", style: "width:" + Math.max(0.6, (it.value / max) * 100) + "%" })]),
      el("span", { class: "hv", text: it.valueText }),
    ];
    return it.onclick ? el("button", { type: "button", ...props, onclick: it.onclick }, kids)
      : el("div", { tabindex: "0", role: "img", ...props }, kids);
  }));
}
// 100% bars over ordered buckets, one-hue ordinal ramp, label inside only when it fits.
function shareBars(rows, buckets, onpick) {
  return el("div", { class: "shares" }, [
    ...rows.map((row) => {
      const total = row.values.reduce((a, b) => a + b, 0) || 1;
      return el("div", { class: "share-row" }, [
        el("span", { class: "sl", text: row.label }),
        el("span", { class: "sbar" }, row.values.map((v, i) => {
          if (!v) return null;
          const p = v / total;
          return el("button", { type: "button", class: "seg o" + (i + 1), style: "flex-grow:" + v,
            "aria-label": buckets[i][1] + ": " + Math.round(p * 100) + "% — " + row.label,
            ...tipAttrs(Math.round(p * 100) + "% · " + row.fmt(v), buckets[i][1] + " — " + row.label),
            onclick: () => onpick(i) }, [p >= 0.09 ? el("span", { text: Math.round(p * 100) + "%" }) : null]);
        })),
      ]);
    }),
    el("div", { class: "legend" }, buckets.map((b, i) => el("span", {}, [el("i", { class: "sw o" + (i + 1), "aria-hidden": "true" }), b[1]]))),
  ]);
}

/* ------------------------------------------------------ value and activity */
function kpis(d) {
  const h = d.headline || {};
  const all = S.insBasis === "all";
  return el("div", { class: "scoreboard ins-kpis" }, [
    tile({ label: tr(all ? "Clients with purchases" : "Retail clients"), val: String(num(h.clients)),
      sub: tr("{spend} lifetime spend", { spend: fmtUZS(h.spend) }), subTitle: fullUZS(h.spend),
      onclick: () => drill({}, "") }),
    tile({ label: tr("Active in the last 12 months"), tone: "good", val: String(num(h.active)),
      sub: tr("{pct} of clients · {spend}", { pct: pctOf(num(h.active), num(h.clients)), spend: fmtUZS(h.active_spend) }),
      onclick: () => drill({ lifecycle_status: "Active" }) }),
    tile({ label: tr("Bought more than once"), val: String(num(h.repeat)),
      sub: tr("{pct} of clients", { pct: pctOf(num(h.repeat), num(h.clients)) }),
      onclick: () => drill({ occasions: "2+" }, tr("Bought more than once")) }),
    tile({ label: tr("Priority win-back"), tone: "serious", val: String(num(h.priority)),
      sub: tr("{spend} · cannot lose + at risk, high value", { spend: fmtUZS(h.priority_spend) }),
      subTitle: fullUZS(h.priority_spend),
      onclick: () => drill({ segments: PRIORITY_SEGMENTS }, tr("Priority win-back list")) }),
    tile({ label: tr("Birthdays, next 30 days"), val: String(num(h.birthdays_30)),
      sub: tr("confirmed dates · do-not-contact left out"),
      onclick: () => { const b = $("#ins-birthdays"); if (b) { b.scrollIntoView({ behavior: "smooth", block: "start" }); b.focus({ preventScroll: true }); } } }),
  ]);
}

function gridCard(d) {
  const cells = {};
  let max = 0;
  const rowT = {}, colT = {};
  for (const g of d.grid || []) {
    cells[g.abc + "|" + g.lifecycle] = g;
    max = Math.max(max, num(g.spend));
    (rowT[g.abc] ??= { clients: 0, spend: 0 }); rowT[g.abc].clients += num(g.clients); rowT[g.abc].spend += num(g.spend);
    (colT[g.lifecycle] ??= { clients: 0, spend: 0 }); colT[g.lifecycle].clients += num(g.clients); colT[g.lifecycle].spend += num(g.spend);
  }
  const all = Object.values(rowT).reduce((a, r) => ({ clients: a.clients + r.clients, spend: a.spend + r.spend }), { clients: 0, spend: 0 });
  // Square-root scale: spend is heavily concentrated, and a linear cut would put
  // almost every cell in the palest bin.
  const bin = (s) => (!s || !max) ? 0 : Math.min(4, Math.floor(Math.sqrt(s / max) * 5 - 1e-9));
  const cellBtn = (g, abc, life) => {
    if (!g || !num(g.clients)) return el("td", { class: "hc empty" }, [el("span", { class: "muted", text: "—" })]);
    return el("td", { class: "hc" }, [el("button", { type: "button", class: "heat", "data-bin": String(bin(num(g.spend))),
      "aria-label": tr("Class {c}, {l}", { c: abc, l: tr(life) }) + ": " + pl(num(g.clients), "client") + ", " + fmtUZS(g.spend),
      ...tipAttrs(fmtUZS(g.spend) + " · " + pl(num(g.clients), "client"), tr("Class {c}, {l}", { c: abc, l: tr(life) })),
      onclick: () => drill({ abc_class: abc, lifecycle_status: life }) }, [
      el("b", { text: String(num(g.clients)) }), el("span", { text: fmtUZS(g.spend) })])]);
  };
  const totalBtn = (t, patch, label) => el("button", { type: "button", class: "tot", onclick: () => drill(patch),
    "aria-label": label + ": " + pl(t.clients, "client") + ", " + fmtUZS(t.spend) }, [
    el("b", { text: String(t.clients) }), el("span", { text: fmtUZS(t.spend) })]);
  const aSilent = ["At risk", "Lapsed", "Dormant"].reduce((a, l) => a + num((cells["A|" + l] || {}).spend), 0);
  const table = el("table", { class: "heatgrid" }, [
    el("caption", { class: "sr-only", text: tr("Where the value sits") }),
    el("colgroup", {}, [el("col", { class: "c0" }), ...LIFECYCLES.map(() => el("col", {})), el("col", {})]),
    el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: tr("Class") }),
      ...LIFECYCLES.map((l) => el("th", { scope: "col", text: tr(l) })), el("th", { scope: "col", class: "tcol", text: tr("Total") })])]),
    el("tbody", {}, ["A", "B", "C"].map((abc) => el("tr", {}, [
      el("th", { scope: "row" }, [el("span", { class: "abc", "data-c": abc, text: abc })]),
      ...LIFECYCLES.map((l) => cellBtn(cells[abc + "|" + l], abc, l)),
      el("td", { class: "tcol" }, [totalBtn(rowT[abc] || { clients: 0, spend: 0 }, { abc_class: abc }, tr("Class {c}", { c: abc }))]),
    ]))),
    el("tfoot", {}, [el("tr", {}, [el("th", { scope: "row", text: tr("Total") }),
      ...LIFECYCLES.map((l) => el("td", {}, [totalBtn(colT[l] || { clients: 0, spend: 0 }, { lifecycle_status: l }, tr(l))])),
      el("td", { class: "tcol" }, [totalBtn(all, {}, tr("Total"))])])]),
  ]);
  return card(tr("Where the value sits"), tr("Clients and lifetime spend by ABC class and lifecycle. The shade of each cell follows the spend scale below."), [
    rowT.A && rowT.A.spend ? lede(tr("{pct} of class A spend sits with clients who have not bought for more than a year.", { pct: pctOf(aSilent, rowT.A.spend) })) : null,
    el("div", { class: "tbl-scroll" }, [table]),
    el("div", { class: "heat-scale", "aria-hidden": "true" }, [el("span", { text: tr("Lower spend") }),
      ...[0, 1, 2, 3, 4].map((b) => el("i", { "data-bin": String(b) })), el("span", { text: tr("Higher spend") })]),
  ], "wide");
}

function priorityCard(d) {
  const bySeg = {};
  for (const s of d.segments || []) bySeg[s.segment] = s;
  const max = Math.max(1, ...Object.values(bySeg).map((s) => num(s.spend)));
  const cl = bySeg["Cannot lose"];
  const rows = PLAYBOOK.filter((p) => bySeg[p.seg]).map((p, i) => {
    const s = bySeg[p.seg];
    const go = () => drill({ rfm_segment: p.seg }, tr(p.seg));
    return el("tr", { tabindex: "0", class: i < 2 ? "top" : null, onclick: go,
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } },
      "aria-label": tr(p.seg) + ": " + pl(num(s.clients), "client") + ", " + fmtUZS(s.spend) + ". " + tr("Click to see these clients") }, [
      el("td", { class: "rank", text: String(i + 1) }),
      el("td", { class: "seg" }, [el("div", { class: "sn", text: tr(p.seg) }), el("div", { class: "sw-what", text: tr(p.what) })]),
      el("td", { class: "num", text: String(num(s.clients)) }),
      el("td", { class: "spend" }, [
        el("span", { class: "sv", title: fullUZS(s.spend), text: fmtUZS(s.spend) }),
        el("span", { class: "mini-track", "aria-hidden": "true" }, [el("span", { class: "fill", style: "width:" + Math.max(1, (num(s.spend) / max) * 100) + "%" })]),
      ]),
      el("td", { class: "own", text: tr("{named} named · {shared} shared", { named: num(s.named), shared: num(s.shared) + num(s.left) }) }),
      el("td", { class: "when" }, [el("div", { text: tr(p.who) }), el("div", { class: "muted", text: tr(p.when) })]),
    ]);
  });
  return card(tr("Priority lists"), tr("Segments in the order the playbook works them. Who calls, and how soon."), [
    cl && num(cl.shared) > num(cl.clients) / 2 ? el("div", { class: "banner callout" }, [
      tr("{shared} of {n} “Cannot lose” clients ({spend}) sit on the shared list with no named owner. The playbook gives this list to the Store Manager.",
        { shared: num(cl.shared), n: num(cl.clients), spend: fmtUZS(cl.spend) })]) : null,
    el("div", { class: "tbl-scroll" }, [el("table", { class: "plays" }, [
      el("caption", { class: "sr-only", text: tr("Priority lists") }),
      el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: "#" }), el("th", { scope: "col", text: tr("Segment") }),
        el("th", { scope: "col", class: "num", text: tr("Clients") }), el("th", { scope: "col", text: tr("Lifetime spend") }),
        el("th", { scope: "col", text: tr("Owner") }), el("th", { scope: "col", text: tr("Who · when") })])]),
      el("tbody", {}, rows),
    ])]),
  ], "wide");
}

function ownersCard(d) {
  const owners = d.owners || [];
  const label = (o) => o.kind === "left" ? tr("Owner has left") : who(o.owner);
  const cell = (o, v, patch, extraLabel) => el("td", { class: "num" }, [num(v) ? el("button", { type: "button", class: "cell",
    "aria-label": label(o) + ", " + extraLabel + ": " + num(v), onclick: () => drill({ ...ownerPatch(o), ...patch },
      patch.segments ? tr("Priority win-back list") : "") , text: String(num(v)) }) : el("span", { class: "muted", text: "0" })]);
  return card(tr("Owner books"), tr("Each owner's clients by lifecycle. The shared list is the whole team's win-back list."), [
    el("div", { class: "tbl-scroll" }, [el("table", { class: "books" }, [
      el("caption", { class: "sr-only", text: tr("Owner books") }),
      el("thead", {}, [el("tr", {}, [tr("Owner"), tr("Clients"), tr("Lifetime spend"), tr("Class A"), tr("Active"), tr("At risk"),
        tr("Lapsed"), tr("Dormant"), tr("Priority"), tr("Birthdays 30 d")].map((h, i) => el("th", { scope: "col", class: i ? "num" : null, text: h })))]),
      el("tbody", {}, owners.map((o) => el("tr", { class: o.kind === "left" ? "left" : null }, [
        el("th", { scope: "row" }, [el("button", { type: "button", class: "cell name", onclick: () => drill(ownerPatch(o)), text: label(o) })]),
        cell(o, o.clients, {}, tr("Clients")),
        el("td", { class: "num", title: fullUZS(o.spend), text: fmtUZS(o.spend) }),
        cell(o, o.a_class, { abc_class: "A" }, tr("Class A")),
        cell(o, o.active, { lifecycle_status: "Active" }, tr("Active")),
        cell(o, o.at_risk, { lifecycle_status: "At risk" }, tr("At risk")),
        cell(o, o.lapsed, { lifecycle_status: "Lapsed" }, tr("Lapsed")),
        cell(o, o.dormant, { lifecycle_status: "Dormant" }, tr("Dormant")),
        cell(o, o.priority, { segments: PRIORITY_SEGMENTS }, tr("Priority")),
        el("td", { class: "num", text: String(num(o.birthdays_30)) }),
      ]))),
    ])]),
  ], "wide");
}

/* ------------------------------------------------------------------ trends */
function yearsCards(d) {
  const years = (d.years || []).slice().sort((a, b) => a.year - b.year);
  if (!years.length) return [];
  const thisYear = Number(String(d.as_of || "").slice(0, 4)) || new Date().getFullYear();
  const yl = (y) => y === thisYear ? tr("{y} to date", { y }) : String(y);
  const peak = years.reduce((a, b) => (num(b.new_clients) > num(a.new_clients) ? b : a), years[0]);
  const lastFull = years.filter((y) => y.year < thisYear).slice(-1)[0];
  const newChart = columnChart(years.map((y) => ({
    value: num(y.new_clients), cap: String(num(y.new_clients)), label: yl(y.year), partial: y.year === thisYear,
    tip: tr("{n} new clients", { n: num(y.new_clients) }), tipLabel: yl(y.year),
    aria: tr("First purchase in {y}", { y: y.year }) + ": " + num(y.new_clients),
    onclick: () => drill({ first_year: y.year }, tr("First purchase in {y}", { y: y.year })),
  })), { partial: true });
  const revChart = stackedColumns(years.map((y) => {
    const ret = num(y.returning_revenue), neu = num(y.new_revenue);
    return { parts: [ret, neu], cap: fmtUZS(num(y.revenue)), label: yl(y.year),
      tip: fmtUZS(num(y.revenue)) + "\n" + tr("From returning clients") + ": " + fmtUZS(ret) + "\n" + tr("From new clients") + ": " + fmtUZS(neu),
      tipLabel: yl(y.year),
      aria: yl(y.year) + ": " + fmtUZS(num(y.revenue)) + "; " + tr("From returning clients") + " " + fmtUZS(ret) + "; " + tr("From new clients") + " " + fmtUZS(neu) };
  }), [tr("From returning clients"), tr("From new clients")]);
  return [
    card(tr("New clients by year of first purchase"), null, [
      peak && lastFull && peak.year < lastFull.year ? lede(tr("New clients fell from {a} in {ya} to {b} in {yb}.",
        { a: num(peak.new_clients), ya: peak.year, b: num(lastFull.new_clients), yb: lastFull.year })) : null,
      newChart,
      numbers([tr("Year"), tr("Clients")], years.map((y) => [yl(y.year), String(num(y.new_clients))])),
    ]),
    card(tr("Revenue by year: new and returning clients"), null, [
      lastFull ? lede(tr("Returning clients brought {pct} of {y} revenue.", { pct: pctOf(num(lastFull.returning_revenue), num(lastFull.revenue)), y: lastFull.year })) : null,
      revChart,
      numbers([tr("Year"), tr("Total"), tr("Returning clients"), tr("New clients")], years.map((y) => [yl(y.year), fmtUZS(y.revenue), fmtUZS(y.returning_revenue), fmtUZS(y.new_revenue)])),
    ]),
  ];
}

function frequencyCard(d) {
  const by = {};
  for (const f of d.frequency || []) by[f.bucket] = f;
  const clients = FREQ.map(([k]) => num((by[k] || {}).clients));
  const spend = FREQ.map(([k]) => num((by[k] || {}).spend));
  const totC = clients.reduce((a, b) => a + b, 0), totS = spend.reduce((a, b) => a + b, 0);
  const buckets = FREQ.map(([k, l]) => [k, tr(l)]);
  return card(tr("One purchase or more"), null, [
    totC ? lede(tr("{n} clients ({pct}) bought once, holding {spend}. The second purchase is the biggest lever in the book.",
      { n: clients[0], pct: pctOf(clients[0], totC), spend: fmtUZS(spend[0]) })) : null,
    shareBars([
      { label: tr("Share of clients"), values: clients, fmt: (v) => pl(v, "client") },
      { label: tr("Share of lifetime spend"), values: spend, fmt: fmtUZS },
    ], buckets, (i) => drill({ occasions: FREQ[i][0] }, buckets[i][1])),
    numbers([tr("Purchases"), tr("Clients"), tr("Lifetime spend")], FREQ.map(([k, l], i) => [tr(l), String(clients[i]), fmtUZS(spend[i])])),
  ]);
}

function brandCards(d) {
  const brands = (d.brands || []).slice();
  const named = brands.filter((b) => b.brand !== UNASSIGNED).sort((a, b) => num(b.revenue) - num(a.revenue));
  const top = named.slice(0, 7), rest = named.slice(7);
  const unk = brands.find((b) => b.brand === UNASSIGNED);
  const items = top.map((b) => ({ label: b.brand, value: num(b.revenue), valueText: tr("{spend} · {n}", { spend: fmtUZS(b.revenue), n: pl(num(b.clients), "client") }),
    tip: fmtUZS(b.revenue) + " · " + pl(num(b.clients), "client"), tipLabel: b.brand,
    aria: b.brand + ": " + fmtUZS(b.revenue) + ", " + pl(num(b.clients), "client"),
    onclick: () => drill({ brand: b.brand }, tr("Bought {b}", { b: b.brand })) }));
  if (rest.length) {
    const rev = rest.reduce((a, b) => a + num(b.revenue), 0);
    items.push({ label: tr("Other brands"), value: rev, valueText: fmtUZS(rev), muted: true,
      tip: fmtUZS(rev), tipLabel: rest.map((b) => b.brand).join(", "), aria: tr("Other brands") + ": " + fmtUZS(rev) });
  }
  if (unk) items.push({ label: tr("Brand not identified"), value: num(unk.revenue), valueText: tr("{spend} · {n}", { spend: fmtUZS(unk.revenue), n: pl(num(unk.clients), "client") }), muted: true,
    tip: fmtUZS(unk.revenue), tipLabel: tr("Brand not identified"), aria: tr("Brand not identified") + ": " + fmtUZS(unk.revenue),
    onclick: () => drill({ brand: UNASSIGNED }, tr("Bought {b}", { b: tr("Brand not identified") })) });

  // Brand by year: the top five, the rest folded, as a table.
  const thisYear = Number(String(d.as_of || "").slice(0, 4)) || new Date().getFullYear();
  const yrs = [...new Set((d.brand_years || []).map((r) => r.year))].sort();
  const top5 = named.slice(0, 5).map((b) => b.brand);
  const cell = (brandSet, y) => (d.brand_years || []).filter((r) => r.year === y && brandSet(r.brand)).reduce((a, r) => a + num(r.revenue), 0);
  const byYearRows = top5.map((b) => [b, ...yrs.map((y) => fmtUZS(cell((x) => x === b, y)))]);
  byYearRows.push([tr("Other brands"), ...yrs.map((y) => fmtUZS(cell((x) => x !== UNASSIGNED && !top5.includes(x), y)))]);
  if (unk) byYearRows.push([tr("Brand not identified"), ...yrs.map((y) => fmtUZS(cell((x) => x === UNASSIGNED, y)))]);

  return [
    card(tr("Brand mix"), tr("Lifetime revenue by brand, with the number of clients who bought it."), [
      barList(items),
      numbers([tr("Brand"), tr("Lifetime spend"), tr("Clients"), tr("Lines")],
        brands.map((b) => [brandLabel(b.brand), fmtUZS(b.revenue), String(num(b.clients)), String(num(b.lines))])),
    ]),
    card(tr("Brand by year"), tr("Lifetime revenue by year of purchase, top five brands."), [
      el("div", { class: "tbl-scroll" }, [el("table", { class: "mini byyear" }, [
        el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: tr("Brand") }),
          ...yrs.map((y) => el("th", { scope: "col", class: "num", text: y === thisYear ? tr("{y} to date", { y }) : String(y) }))])]),
        el("tbody", {}, byYearRows.map((r) => el("tr", {}, r.map((c, i) => el(i ? "td" : "th", { scope: i ? null : "row", class: i ? "num" : null, text: c }))))),
      ])]),
    ]),
  ].map((c, i) => { if (i === 1) c.classList.add("wide"); return c; });
}

function categoryCard(d) {
  const cats = (d.categories || []).slice().sort((a, b) => num(b.revenue) - num(a.revenue));
  return card(tr("Category mix"), null, [
    barList(cats.map((c) => ({ label: catLabel(c.category), value: num(c.revenue), muted: c.category === UNASSIGNED,
      valueText: tr("{spend} · {n}", { spend: fmtUZS(c.revenue), n: pl(num(c.clients), "client") }),
      tip: fmtUZS(c.revenue) + " · " + pl(num(c.clients), "client"), tipLabel: catLabel(c.category),
      aria: catLabel(c.category) + ": " + fmtUZS(c.revenue),
      onclick: () => drill({ category: c.category }, tr("Bought: {c}", { c: catLabel(c.category) })) }))),
    numbers([tr("Category"), tr("Lifetime spend"), tr("Clients"), tr("Lines")],
      cats.map((c) => [catLabel(c.category), fmtUZS(c.revenue), String(num(c.clients)), String(num(c.lines))])),
  ]);
}

function multiBrandCard(d) {
  const by = {};
  for (const m of d.multi_brand || []) by[m.bucket] = m;
  const totS = (d.multi_brand || []).reduce((a, m) => a + num(m.spend), 0);
  const multi = ["2", "3+"].reduce((a, k) => ({ n: a.n + num((by[k] || {}).clients), s: a.s + num((by[k] || {}).spend) }), { n: 0, s: 0 });
  const buckets = BRAND_BUCKETS.filter(([k]) => by[k]);
  const pairs = d.brand_pairs || [];
  return card(tr("Clients across brands"), null, [
    lede(tr("{n} clients bought two or more brands and hold {pct} of lifetime spend.", { n: multi.n, pct: pctOf(multi.s, totS) })),
    barList(buckets.map(([k, l]) => ({ label: tr(l), value: num(by[k].clients), valueText: pl(num(by[k].clients), "client") + " · " + fmtUZS(by[k].spend),
      tip: pl(num(by[k].clients), "client") + " · " + fmtUZS(by[k].spend), tipLabel: tr(l), aria: tr(l) + ": " + pl(num(by[k].clients), "client"),
      muted: k === "0", onclick: () => drill({ brands: k }, tr("Brands bought") + ": " + tr(l)) }))),
    pairs.length ? el("h4", { class: "ih4", text: tr("Bought together most often") }) : null,
    pairs.length ? el("ol", { class: "pairs" }, pairs.map((p) => el("li", {}, [
      el("span", { text: tr("{a} + {b}", { a: p.a, b: p.b }) }), el("b", { text: pl(num(p.clients), "client") })]))) : null,
    numbers([tr("Brands bought"), tr("Clients"), tr("Lifetime spend")], buckets.map(([k, l]) => [tr(l), String(num(by[k].clients)), fmtUZS(by[k].spend)])),
  ]);
}

/* --------------------------------------------------------------- birthdays */
function birthdayCards(d) {
  const b = d.birthdays || {};
  const up = b.upcoming || [];
  const nowMonth = Number(String(d.as_of || "").slice(5, 7)) || (new Date().getMonth() + 1);
  const when = (u) => {
    const dt = new Date(u.date + "T00:00:00Z");
    const day = dt.toLocaleDateString(LOC(), { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
    const rel = u.days === 0 ? tr("today") : u.days === 1 ? tr("tomorrow") : tr("in {n}", { n: pl(u.days, "day") });
    return [el("div", { class: "bd", text: day }), el("div", { class: "muted", text: rel })];
  };
  const list = up.length ? el("div", { class: "tbl-scroll" }, [el("table", { class: "bdays" }, [
    el("caption", { class: "sr-only", text: tr("Coming up in the next 30 days") }),
    el("thead", {}, [el("tr", {}, [tr("When"), tr("Client"), tr("Owner"), "ABC", tr("Segment")].map((h) => el("th", { scope: "col", text: h })))]),
    el("tbody", {}, up.map((u) => {
      const open = () => openCard(u.client_id);
      const name = blank(u.display_name) ? tr("Unnamed record") : u.display_name;
      return el("tr", { tabindex: "0", "data-id": u.client_id, onclick: open, class: u.days <= 7 ? "soon" : null,
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } },
        "aria-label": tr("Open {id}", { id: u.client_id }) + " — " + name }, [
        el("td", { class: "w" }, when(u)),
        el("td", {}, [el("div", { class: "nm", text: name }), el("div", { class: "muted id", text: u.client_id })]),
        el("td", { text: blank(u.owner) ? "—" : who(u.owner) }),
        el("td", {}, [u.abc ? el("span", { class: "abc", "data-c": u.abc, text: u.abc }) : el("span", { class: "muted", text: "—" })]),
        el("td", { text: trv(u.segment) }),
      ]);
    })),
  ])]) : el("p", { class: "empty-line", text: tr("No confirmed birthdays in the next 30 days.") });

  const months = (b.by_month || []).map((m) => ({
    value: num(m.clients), cap: String(num(m.clients)), label: monthName(m.month, "short"), em: m.month === nowMonth,
    tip: pl(num(m.clients), "client") + " · " + fmtUZS(m.spend), tipLabel: sentence(monthName(m.month)) + (m.month === nowMonth ? " · " + tr("this month") : ""),
    aria: sentence(monthName(m.month)) + ": " + pl(num(m.clients), "client"),
    onclick: () => drill({ birth_month: m.month, do_not_contact: "exclude", ...(S.insBasis === "all" ? {} : { related: "exclude" }), type: "" },
      tr("Birthday in {m}", { m: monthName(m.month) })),
  }));
  return [
    card(tr("Coming up in the next 30 days"), null, [list], "bd-card"),
    card(tr("Birthdays by month"), tr("Confirmed dates of birth only; clients marked do-not-contact are left out."), [
      columnChart(months),
      el("p", { class: "note", text: tr("{a} confirmed · {b} still to confirm in the clean-up · {c} not on file",
        { a: num(b.confirmed), b: num(b.to_confirm), c: num(b.missing) }) + (num(b.do_not_contact) ? " " + tr("{n} marked do-not-contact are left out.", { n: num(b.do_not_contact) }) : "") }),
      numbers([tr("Month"), tr("Clients"), tr("Lifetime spend")], (b.by_month || []).map((m) => [sentence(monthName(m.month)), String(num(m.clients)), fmtUZS(m.spend)])),
    ]),
  ];
}

/* ------------------------------------------------------------------ render */
function insBar(d) {
  const basis = el("div", { class: "seg-ctl", role: "group", "aria-label": tr("Basis") }, [
    ["retail", tr("Retail clients only")], ["all", tr("Including related parties")],
  ].map(([k, l]) => el("button", { type: "button", "aria-pressed": S.insBasis === k ? "true" : "false",
    onclick: () => { if (S.insBasis !== k) { S.insBasis = k; loadInsights(); } }, text: l })));
  const run = d && d.last_recalculated;
  return el("div", { class: "ins-bar" }, [
    basis,
    d ? el("span", { class: "ins-meta", text: tr("As of {d}", { d: fmtDate(d.as_of) }) +
      (run ? " · " + tr("Classes recalculated every night from purchase history · last run {t}", { t: fmtDateTime(run.ran_at) }) : "") }) : null,
  ]);
}
function sectionHead(id, title) {
  return el("h2", { class: "ins-h2", id, tabindex: "-1", text: title });
}
function renderInsights() {
  const host = $("#ins-host");
  if (!host) return;
  const d = S.ins;
  host.innerHTML = "";
  host.setAttribute("aria-busy", S.insLoading ? "true" : "false");
  host.appendChild(insBar(d));
  if (!d) {
    host.appendChild(S.insError
      ? el("div", { class: "panel err-box" }, [el("p", { text: S.insError || tr("Could not load the insights.") }),
        el("button", { class: "btn", type: "button", onclick: loadInsights, text: tr("Try again") })])
      : el("div", { class: "loading", text: tr("Loading insights…") }));
    return;
  }
  const body = el("div", { class: "ins-body" + (S.insLoading ? " refreshing" : "") }, [
    kpis(d),
    sectionHead("ins-value", tr("Value and activity")),
    el("div", { class: "ins-grid" }, [gridCard(d), priorityCard(d), ownersCard(d)]),
    sectionHead("ins-trends", tr("Trends: acquisition and mix")),
    el("div", { class: "ins-grid" }, (() => { const [mix, byYear] = brandCards(d);
      return [...yearsCards(d), frequencyCard(d), multiBrandCard(d), mix, categoryCard(d), byYear]; })()),
    sectionHead("ins-birthdays", tr("Birthdays")),
    el("div", { class: "ins-grid" }, birthdayCards(d)),
    ...(d.telegram ? [sectionHead("ins-telegram", tr("Telegram: leads and missed demand")), ...telegramInsights(d.telegram)] : []),
  ]);
  if (S.insError) body.prepend(el("div", { class: "banner critical", role: "alert", text: S.insError }));
  host.appendChild(body);
  stackTables(body);
}
