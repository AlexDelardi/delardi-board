/* Delardi Performance — usage.js
   Who opens which tool, and how often. A login is one passcode entered in one tool (usage_logins, written by the
   database whenever a tool issues a session); someone who stays signed in all day counts once. One document per
   window (perf_usage): the last 30 or 90 days, always with the last 7 beside it. Test logins are not counted. */
Object.assign(RU, {
  "Usage": "Использование", "Usage of the tools": "Использование инструментов", "Loading usage…": "Загружаем использование…",
  "Last 30 days": "30 дней", "Last 90 days": "90 дней", "Window": "Период",
  "People active, last 7 days": "Активны за 7 дней", "of {n} with access": "из {n} с доступом",
  "Logins, last 7 days": "Входов за 7 дней", "{n} in the last {d} days": "за {d} дн.: {n}",
  "Most used tool": "Самый используемый инструмент", "{n} logins in {d} days": "входов за {d} дн.: {n}", "No logins yet.": "Входов пока нет.",
  "People": "Сотрудники", "Person": "Сотрудник", "Last seen": "Последний вход", "Days active, 7": "Дней с входом, 7", "Days active, {d}": "Дней с входом, {d}",
  "Logins, {d} days": "Входов за {d} дн.", "never": "никогда", "not used": "не открывал", "no access": "нет доступа", "left": "нет доступа сейчас",
  "Tools": "Инструменты", "Tool": "Инструмент", "With access": "С доступом", "Used by": "Пользовались", "Logins, 7 days": "Входов за 7 дн.", "Last login": "Последний вход",
  "Logins by day": "Входы по дням", "Logins": "Входы", "people": "чел.",
  "Latest logins": "Последние входы", "When": "Когда",
  "In each tool cell: logins in the window, then the days on which they happened. Grey: has access but has not opened it in the window.":
    "В ячейке инструмента: входы за период и число дней с входом. Серым — доступ есть, но за период не открывал.",
  "A login is a passcode entered in one tool. Someone who stays signed in counts once; the iPads ask again after 15 minutes idle, so each return to the tool counts.":
    "Вход — это введённый в инструменте код. Кто не выходит, считается один раз; на iPad код спрашивается снова после 15 минут простоя, так что каждое возвращение считается.",
  "Logged since {d}.": "Учёт ведётся с {d}.",
  "CRM": "CRM", "Catalogue": "Каталог", "Sales": "Продажи", "Stock": "Склад", "Board": "Доска", "Performance": "Показатели",
});
const USAGE_DAYS_KEY = "perf_usage_days";   // sessionStorage: the window on the Usage screen
const TOOL_NAMES = { crm: "CRM", catalogue: "Catalogue", sales: "Sales", stock: "Stock", board: "Board", perf: "Performance" };
const toolName = (t) => tr(TOOL_NAMES[t] || t);
function usageDays() { return Number(sstore(USAGE_DAYS_KEY)) === 90 ? 90 : 30; }
function usageDaysSwitch() {
  const cur = usageDays();
  return el("div", { class: "cur-switch", id: "usage-days", role: "group", "aria-label": tr("Window") }, [[30, "Last 30 days"], [90, "Last 90 days"]].map(([n, label]) =>
    el("button", { type: "button", class: "btn", "data-days": n, "aria-pressed": cur === n ? "true" : "false",
      onclick: () => { if (usageDays() !== n) { sstore(USAGE_DAYS_KEY, String(n)); renderAll(); } }, text: tr(label) })));
}
// "24 Nov 2026, 13:10" in Tashkent time; "—" when there is none.
function fmtWhen(iso) { return iso ? fmtDate(iso) + ", " + fmtTime(iso) : "—"; }
function renderUsage(main) {
  const days = usageDays();
  const sec = el("section", { class: "screen", id: "screen-usage" }, el("h1", { class: "title", text: tr("Usage of the tools") }));
  main.append(sec);
  const st = need("usageDoc", "usage", { days }, String(days));
  if (pending(sec, st, "Loading usage…")) return;
  const d = st.doc, tools = d.tools || [], people = d.people || [], byTool = d.by_tool || [];
  sec.append(el("p", { class: "small", id: "usage-note" },
    tr("A login is a passcode entered in one tool. Someone who stays signed in counts once; the iPads ask again after 15 minutes idle, so each return to the tool counts.") +
    (d.since ? " " + tr("Logged since {d}.", { d: fmtDate(d.since) }) : "")));

  // the three headline cards
  const card = (id, lab, big, lines) => el("div", { class: "hl", id }, el("span", { class: "lbl", text: tr(lab) }), el("strong", { class: "hl-big num", text: big }),
    lines.map((x) => el("span", { class: "small", text: x })));
  const withAccess = people.filter((p) => p.active && tools.some((t) => p.tools && p.tools[t] && p.tools[t].allowed));
  const active7 = withAccess.filter((p) => num(p.logins_7) > 0).length;
  const logins7 = byTool.reduce((s, t) => s + (num(t.logins_7) || 0), 0), loginsN = byTool.reduce((s, t) => s + (num(t.logins) || 0), 0);
  const top = byTool.slice().sort((a, b) => (num(b.logins) || 0) - (num(a.logins) || 0))[0];
  sec.append(el("div", { class: "hl-row" },
    card("us-people", "People active, last 7 days", fmtNum(active7), [tr("of {n} with access", { n: fmtNum(withAccess.length) })]),
    card("us-logins", "Logins, last 7 days", fmtNum(logins7), [tr("{n} in the last {d} days", { n: fmtNum(loginsN), d: days })]),
    card("us-top", "Most used tool", top && num(top.logins) ? toolName(top.tool) : "—",
      [top && num(top.logins) ? tr("{n} logins in {d} days", { n: fmtNum(top.logins), d: days }) : tr("No logins yet.")])));

  // people × tools
  sec.append(el("h2", { class: "section", text: tr("People") }));
  const th = (t, cls) => el("th", { scope: "col", class: cls || null, text: t });
  const toolCell = (p, t) => {
    const x = (p.tools || {})[t] || {};
    if (num(x.logins) > 0) return el("td", { class: "r", "data-tool": t, title: tr("Last login") + ": " + fmtWhen(x.last_at), text: fmtNum(x.logins) + " · " + fmtNum(x.days) });
    if (x.allowed) return el("td", { class: "r unused", "data-tool": t, title: x.last_at ? tr("Last login") + ": " + fmtWhen(x.last_at) : null, text: tr("not used") });
    return el("td", { class: "r none", "data-tool": t, "aria-label": tr("no access"), text: "·" });
  };
  sec.append(el("div", { class: "table-wrap" }, el("table", { class: "tbl usage", id: "us-people-table" },
    el("thead", {}, el("tr", {}, th(tr("Person")), th(tr("Last seen")), th(tr("Days active, 7"), "r"), th(tr("Days active, {d}", { d: days }), "r"),
      tools.map((t) => th(toolName(t), "r")))),
    el("tbody", {}, people.map((p) => el("tr", { "data-person": p.name, class: !p.active ? "off" : num(p.logins_7) ? null : "quiet" },
      el("th", { scope: "row" }, p.name, p.active ? null : el("span", { class: "tag", text: tr("left") })),
      el("td", { text: p.last_at ? fmtWhen(p.last_at) + " · " + toolName(p.last_tool) : tr("never") }),
      el("td", { class: "r", text: fmtNum(p.days_7) }), el("td", { class: "r", text: fmtNum(p.days_n) }),
      tools.map((t) => toolCell(p, t))))))));
  sec.append(el("p", { class: "small", text: tr("In each tool cell: logins in the window, then the days on which they happened. Grey: has access but has not opened it in the window.") }));

  // per tool
  sec.append(el("h2", { class: "section", text: tr("Tools") }));
  sec.append(el("div", { class: "table-wrap" }, el("table", { class: "tbl usage", id: "us-tools-table" },
    el("thead", {}, el("tr", {}, th(tr("Tool")), th(tr("With access"), "r"), th(tr("Used by"), "r"), th(tr("Logins, 7 days"), "r"), th(tr("Logins, {d} days", { d: days }), "r"), th(tr("Last login")))),
    el("tbody", {}, byTool.map((t) => el("tr", { "data-tool": t.tool, class: num(t.logins) ? null : "quiet" },
      el("th", { scope: "row", text: toolName(t.tool) }), el("td", { class: "r", text: fmtNum(t.allowed) }), el("td", { class: "r", text: fmtNum(t.users) }),
      el("td", { class: "r", text: fmtNum(t.logins_7) }), el("td", { class: "r", text: fmtNum(t.logins) }), el("td", { text: fmtWhen(t.last_at) })))))));

  // by day
  sec.append(el("h2", { class: "section", text: tr("Logins by day") }));
  const daily = d.daily || [], few = isPhone();
  const shown = few ? daily.slice(-14) : daily;
  // a label every week at most, counted back from today, so the days stay readable at 90
  const every = Math.max(1, Math.ceil(shown.length / (few ? 7 : 15)));
  sec.append(barChart({ id: "us-daily", title: tr("Logins by day"),
    rows: shown.map((x, i) => ({ key: x.day, label: (shown.length - 1 - i) % every === 0 ? x.day.slice(8, 10) + "." + x.day.slice(5, 7) : "", v: num(x.logins) || 0,
      tip: [fmtDate(x.day), tr("Logins") + ": " + fmtNum(x.logins), fmtNum(x.people) + " " + tr("people")] })) }));

  // the latest logins
  sec.append(el("h2", { class: "section", text: tr("Latest logins") }));
  const recent = d.recent || [];
  if (!recent.length) sec.append(el("p", { class: "small", text: tr("No logins yet.") }));
  else sec.append(el("div", { class: "table-wrap" }, el("table", { class: "tbl usage", id: "us-recent" },
    el("thead", {}, el("tr", {}, th(tr("When")), th(tr("Person")), th(tr("Tool")))),
    el("tbody", {}, recent.map((x) => el("tr", {}, el("td", { text: fmtWhen(x.at) }), el("th", { scope: "row", text: x.who }), el("td", { text: toolName(x.tool) })))))));
}
