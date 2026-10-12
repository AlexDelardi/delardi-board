/* ===========================================================================
   Data (Phase 4)
   Two things on one page. First, how clean the client file is: where the
   review stands, a line that grows one point a night, how settled each
   identity field is, and a short list of what needs a person — every item
   opens the records behind it. Second, for whoever holds the refresh right,
   the monthly Colibri refresh: what the new exports would add and change,
   the few lines only a person can place, and apply, discard or undo.
   The refresh is staged by Claude from the CRM source-files folder; nothing
   here uploads a file. Phone numbers never reach this page: a changed phone
   shows as changed, without either number.
   ========================================================================= */
Object.assign(RU, {
  "Data": "Данные",
  "Loading the data health…": "Загружаем состояние данных…",
  "Could not load the data health.": "Не удалось загрузить состояние данных.",
  "As of {d} · a point is added to the trend every night": "На {d} · точка на графике добавляется каждую ночь",
  "Records to decide": "Нужно решение",
  "sources disagree on a field": "источники расходятся",
  "Records to confirm": "Нужно подтвердить",
  "held by one source only": "есть только в одном источнике",
  "Done": "Готово",
  "{pct} of {n} records": "{pct} из {n} записей",
  "Set aside": "Отложено",
  "parked for later": "отложены на потом",
  "Colibri refresh": "Обновление из Colibri",
  "waiting for your review": "ждёт вашей проверки",
  "Waiting": "Ждёт",
  "last applied {d}": "последнее применено {d}",
  "None yet": "Пока нет",
  "monthly, from the Colibri exports": "ежемесячно, из выгрузок Colibri",
  "Review progress": "Ход проверки",
  "Where the review stands": "Где сейчас проверка",
  "Every record in the file, by what it still needs. Click a part to open those records.": "Все записи в базе по тому, что ещё нужно сделать. Нажмите на часть, чтобы открыть эти записи.",
  "To decide": "Решить",
  "To confirm": "Подтвердить",
  "Progress over time": "Прогресс по дням",
  "Share of records done, one point a night.": "Доля готовых записей, одна точка за ночь.",
  "The line starts on {d}. A point is added every night, so the trend shows from tomorrow.": "Линия начинается с {d} — точка добавляется каждую ночь, так что динамика появится с завтрашнего дня.",
  // the card history (app.js eventText)
  "Created by the Colibri refresh": "Создан обновлением из Colibri",
  "Purchase lines added by the Colibri refresh: {n}": "Строк покупок добавлено обновлением из Colibri: {n}",
  "First purchase in Colibri: now a client": "Первая покупка в Colibri: теперь клиент",
  "Phone number changed in Colibri": "Номер телефона изменился в Colibri",
  "{field} changed in Colibri": "{field}: изменено в Colibri",
  "A Colibri refresh was undone; this record is back as it was": "Обновление из Colibri откачено; запись вернулась к прежнему виду",
  "Exports for {a} – {b}.": "Выгрузки за период {a} – {b}",
  "{pct} done": "{pct} готово",
  "{done} of {n} records done · {togo} to go": "Готово {done} из {n} · осталось {togo}",
  "Review work per day": "Проверка по дням",
  "Records worked on each day, last 30 days.": "Записи, с которыми работали, по дням за 30 дней.",
  "No review work recorded in the last 30 days yet.": "За последние 30 дней работы с записями пока нет.",
  "{n} worked on": "{n} в работе",
  "Field status": "Состояние полей",
  "How settled each field is": "Насколько заполнено каждое поле",
  "Across all {n} records. “Settled” means both sources agree or a person has confirmed the value.": "По всем {n} записям. «Готово» — источники совпадают или значение подтвердил сотрудник.",
  "Settled": "Готово",
  "One source only": "Один источник",
  "Sources disagree": "Расходятся",
  "Not on file": "Нет данных",
  "Needs attention": "Требует внимания",
  "What needs a person": "Что требует человека",
  "Click an item to open the records behind it.": "Нажмите на пункт, чтобы открыть эти записи.",
  "Nothing": "Нет",
  "Possible duplicates": "Возможные дубликаты",
  "Flagged as maybe the same person. Merge them, or mark them as different people.": "Возможно, один и тот же человек. Объедините записи или отметьте, что это разные люди.",
  "Colibri changed after a check": "Colibri изменился после проверки",
  "A value someone confirmed has since changed in Colibri. Look again.": "Подтверждённое значение с тех пор изменилось в Colibri. Проверьте ещё раз.",
  "New from the last refresh": "Новые из последнего обновления",
  "Clients the last Colibri refresh created, still to review.": "Клиенты, созданные последним обновлением из Colibri, ещё не проверены.",
  "Active clients with no owner": "Активные клиенты без владельца",
  "Active or at-risk retail clients on the shared list or with a rep who has left.": "Активные или под угрозой розничные клиенты в общем списке или у ушедшего продавца.",
  "No phone number anywhere": "Нет телефона ни в одном источнике",
  "Neither Colibri nor the questionnaire has a number.": "Номера нет ни в Colibri, ни в анкете.",
  "No date of birth anywhere": "Нет даты рождения ни в одном источнике",
  "No birthday on file in either source, so no birthday contact.": "Дня рождения нет ни в одном источнике, поздравить не получится.",
  "Name is initials only": "Вместо имени инициалы",
  "The record carries initials, not a name.": "В записи инициалы, а не имя.",
  "Purchases with no brand": "Покупки без бренда",
  "Clients with at least one purchase line whose brand is not identified.": "Клиенты, у которых хотя бы в одной строке покупки бренд не определён.",
  "{n} lines, {spend}": "{n} строк, {spend}",
  "Purchase lines with no seller: {n} of {total}. Mostly older sales; each refresh fills what the daily sales report knows.": "Строк покупок без продавца: {n} из {total}. В основном старые продажи; каждое обновление заполняет то, что знает дневной отчёт.",
  "Questionnaire answers with no translation: {n}.": "Ответов анкеты без перевода: {n}.",
  "The monthly Colibri refresh": "Ежемесячное обновление из Colibri",
  "No refresh is waiting for review.": "Нет обновлений, ожидающих проверки.",
  "Each month, export the three Colibri reports (client purchases, daily sales, client cards) into the “12. CRM / Source files” folder and ask Claude to run the refresh. It will appear here for you to review before anything changes.": "Каждый месяц выгрузите три отчёта Colibri (покупки клиентов, дневной отчёт по продажам, карточки клиентов) в папку «12. CRM / Source files» и попросите Claude запустить обновление. Оно появится здесь, и вы проверите его до того, как что-то изменится.",
  "Refresh waiting for review": "Обновление ждёт проверки",
  "Colibri exports of {d} · purchases {a} – {b}": "Выгрузки Colibri от {d} · покупки {a} – {b}",
  "Client purchases": "Покупки клиентов",
  "Daily sales report": "Дневной отчёт по продажам",
  "Client cards": "Карточки клиентов",
  "What this refresh would do": "Что сделает это обновление",
  "Purchase lines in the export": "Строк покупок в выгрузке",
  "already in the file: {n}": "уже в базе: {n}",
  "Added to existing clients": "Добавится существующим клиентам",
  "{lines} · {spend} · {clients}": "{lines} · {spend} · {clients}",
  "New clients": "Новые клиенты",
  "Names to decide": "Имена на решение",
  "Changes from the client cards": "Изменения из карточек клиентов",
  "none": "нет",
  "Filled on earlier lines": "Дополнено в прежних строках",
  "brand on {n}": "бренд в {n}",
  "seller on {n}": "продавец в {n}",
  "In the file but not in this export": "В базе, но нет в выгрузке",
  "New lines with no brand identified": "Новые строки без бренда",
  "New sellers": "Новые продавцы",
  "{n} — each is added as “Sales rep N” until someone gives the name, and can be given clients once activated": "{n} — каждый добавлен как «Продавец N», пока ему не дадут имя; вести клиентов сможет после активации",
  "Apply the refresh": "Применить обновление",
  "Discard": "Отменить",
  "Decide the names below first.": "Сначала решите по именам ниже.",
  "Apply this refresh? It adds {lines} and {clients}. You can undo it until the next refresh is applied.": "Применить обновление? Будет добавлено: {lines}, новых клиентов: {clients}. Его можно отменить, пока не применено следующее.",
  "Yes, apply": "Да, применить",
  "Discard this refresh? Nothing in the client file changes; Claude can stage it again from the same exports.": "Отменить это обновление? В базе ничего не изменится; Claude может загрузить его снова из тех же выгрузок.",
  "Yes, discard": "Да, отменить",
  "Refresh applied.": "Обновление применено.",
  "Refresh discarded.": "Обновление отменено.",
  "Refresh undone.": "Обновление откачено.",
  "Decision saved.": "Решение сохранено.",
  "Decide who these purchases belong to": "Решите, чьи это покупки",
  "The export name matches one record and the phone another, or the name matches several. Choose one.": "Имя из выгрузки совпадает с одной записью, а телефон — с другой, или имя совпадает с несколькими. Выберите одну.",
  "same name": "то же имя",
  "same phone": "тот же телефон",
  "last purchase {d}": "последняя покупка {d}",
  "A new client": "Новый клиент",
  "Leave out of this refresh": "Не включать в это обновление",
  "Change the decision": "Изменить решение",
  "Chosen": "Выбрано",
  "Clients this refresh would create": "Клиенты, которых создаст обновление",
  "Name": "Имя",
  "Lines": "Строки",
  "Spend": "Сумма",
  "First purchase": "Первая покупка",
  "Seller": "Продавец",
  "From the card": "Из карточки",
  "new seller": "новый продавец",
  "birthday": "день рождения",
  "phone": "телефон",
  "no card": "нет карточки",
  "Found by phone, under another name": "Найдены по телефону, под другим именем",
  "Client": "Клиент",
  "In the file": "В базе",
  "In the export": "В выгрузке",
  "Purchases added to existing clients": "Покупки, добавленные существующим клиентам",
  "Last purchase": "Последняя покупка",
  "Show all {n}": "Показать все ({n})",
  "Field": "Поле",
  "Now": "Сейчас",
  "Becomes": "Станет",
  "Number changed (not shown)": "Номер изменился (не показывается)",
  "The refresh deletes nothing. Check in Colibri whether these were returned or corrected.": "Обновление ничего не удаляет. Проверьте в Colibri, не было ли это возвратом или исправлением.",
  "Date": "Дата",
  "Item": "Изделие",
  "Brand": "Бренд",
  "Net": "Сумма",
  "Refreshes": "Обновления",
  "History": "История",
  "Staged": "Ждёт проверки",
  "Applied": "Применено",
  "Discarded": "Отменено",
  "Undone": "Откачено",
  "{lines} added · {clients} new": "добавлено {lines} · новых {clients}",
  "View": "Открыть",
  "Viewing": "Открыто",
  "Undo": "Откатить",
  "Undo this refresh? Its purchase lines and the clients it created are removed, and the values it changed go back — unless someone has changed them since.": "Откатить это обновление? Его строки покупок и созданные клиенты будут удалены, изменённые значения вернутся — если их с тех пор никто не менял.",
  "Yes, undo": "Да, откатить",
  "Refresh #{id}": "Обновление №{id}",
  "applied {d} by {who}": "применено {d}, {who}",
  "undone {d} by {who}": "откачено {d}, {who}",
  "discarded {d} by {who}": "отменено {d}, {who}",
  "Clients it created": "Созданные клиенты",
  "Purchases it added": "Добавленные покупки",
  "Values it changed": "Изменённые значения",
  "Earlier lines it completed: {n}": "Дополнено прежних строк: {n}",
  "Values kept on undo because someone had changed them since: {n}": "Значений оставлено при откате, потому что их с тех пор изменили: {n}",
  "Record type": "Тип записи",
  "In Colibri": "В Colibri",
  "Open the card": "Открыть карточку",
  "Nothing is waiting. The last refresh is below.": "Ничего не ожидает. Последнее обновление ниже.",
});
Object.assign(PL, {
  client: { en: ["client", "clients"], ru: ["клиент", "клиента", "клиентов"] },
  name:   { en: ["name", "names"], ru: ["имя", "имени", "имён"] },
});

const ATTENTION = [
  ["duplicates", "Possible duplicates", "Flagged as maybe the same person. Merge them, or mark them as different people.", "serious"],
  ["changed_after_check", "Colibri changed after a check", "A value someone confirmed has since changed in Colibri. Look again.", "serious"],
  ["new_from_refresh", "New from the last refresh", "Clients the last Colibri refresh created, still to review.", "warning"],
  ["shared_active", "Active clients with no owner", "Active or at-risk retail clients on the shared list or with a rep who has left.", "serious"],
  ["telegram_to_confirm", "Telegram chats to confirm", "A chat in the boutique's Telegram may be this client. Link it, or say it is not.", "warning"],
  ["no_phone", "No phone number anywhere", "Neither Colibri, the questionnaire nor Telegram has a number.", null],
  ["no_dob", "No date of birth anywhere", "No birthday on file in either source, so no birthday contact.", null],
  ["initials_only", "Name is initials only", "The record carries initials, not a name.", null],
  ["brand_unassigned", "Purchases with no brand", "Clients with at least one purchase line whose brand is not identified.", null],
];
const FIELD_BUCKETS = [["settled", "Settled"], ["gap", "One source only"], ["conflict", "Sources disagree"], ["none", "Not on file"]];
const FILE_KIND = { purchases: "Client purchases", sales: "Daily sales report", cards: "Client cards" };
const BATCH_STATUS = { staged: ["Staged", "warning"], applied: ["Applied", "good"], discarded: ["Discarded", null], undone: ["Undone", null] };
const FIELD_NAME = { phone: "Phone", phone_colibri: "Phone", dob: "Date of birth", dob_colibri: "Date of birth", gender: "Gender",
  gender_colibri: "Gender", name: "Name", name_colibri: "Name", patronymic: "Patronymic", record_type: "Record type", in_colibri: "In Colibri" };

/* ------------------------------------------------------------------ loading */
let dataSeq = 0;
async function loadData() {
  const seq = ++dataSeq;
  S.dhLoading = true;
  renderData();
  try {
    const d = await call("data_health");
    if (seq !== dataSeq) return;
    S.dh = d; S.dhError = null;
    if (d.can_import) {
      const list = await call("imports");
      if (seq !== dataSeq) return;
      S.imports = list.rows || [];
      const staged = S.imports.find((b) => b.status === "staged");
      const keep = S.impId && S.imports.some((b) => b.id === S.impId);
      S.impId = staged ? staged.id : keep ? S.impId : null;
      S.imp = S.impId ? await call("import", { id: S.impId }) : null;
      if (seq !== dataSeq) return;
    } else {
      S.imports = null; S.imp = null; S.impId = null;
    }
  } catch (e) {
    if (seq !== dataSeq) return;
    S.dhError = e.message;
  }
  S.dhLoading = false;
  renderData();
}
async function viewBatch(id) {
  if (S.busy) return;
  S.impId = id; S.confirm = null; S.impError = null;
  S.busy = true; renderData();
  try { S.imp = await call("import", { id }); }
  catch (e) { S.impError = e.message; }
  S.busy = false; renderData();
  const h = $("#dat-batch"); if (h) h.focus({ preventScroll: false });
}
// Every refresh write returns the refresh as it now stands. Applying, discarding
// or undoing also moves the counts, the list and the insights behind it.
async function impAct(action, payload, done) {
  if (S.busy) return;
  S.busy = true; S.impError = null; renderData();
  try {
    S.imp = await call(action, { id: S.impId, ...payload });
    S.confirm = null;
    // The counts, the list, the insights and this page all move after these.
    if (action !== "import_decide") refreshBehind();
    toast(done);
  } catch (e) {
    S.impError = e.message;
  }
  S.busy = false;
  renderData();
}

/* ------------------------------------------------------------------ pieces */
const dPct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const cref = (id) => blank(id) ? "—" : el("a", { href: "#" + id, class: "ref", title: tr("Open the card"), text: id });
function dataDrill(patch, label) { drill(patch, label, ""); }
function table(headers, rows, numericFrom) {
  return el("div", { class: "tbl-scroll" }, [el("table", { class: "mini" }, [
    el("thead", {}, [el("tr", {}, headers.map((h, i) => el("th", { scope: "col", class: i >= numericFrom ? "num" : null, text: h })))]),
    el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c, i) => el("td", { class: i >= numericFrom ? "num" : null },
      [c === null || c === undefined || c === "" ? "—" : c]))))),
  ])]);
}
// Long tables fold: the first rows show, the rest behind a "Show all".
function foldTable(headers, rows, numericFrom, keep = 8) {
  if (rows.length <= keep + 2) return table(headers, rows, numericFrom);
  return el("div", {}, [
    table(headers, rows.slice(0, keep), numericFrom),
    el("details", { class: "numbers" }, [el("summary", { text: tr("Show all {n}", { n: rows.length }) }),
      table(headers, rows.slice(keep), numericFrom)]),
  ]);
}
function batchChip(st) {
  const [label, tone] = BATCH_STATUS[st] || [st, null];
  return el("span", { class: "chip", "data-tone": tone }, [tr(label)]);
}

/* ---------------------------------------------------------------- headline */
function dataKpis(d) {
  const s = d.status || {}, rf = d.refresh || {};
  const refreshTile = rf.staged
    ? tile({ label: tr("Colibri refresh"), tone: "warning", val: tr("Waiting"), sub: tr("waiting for your review"),
      onclick: d.can_import ? () => { const h = $("#dat-refresh"); if (h) { h.scrollIntoView({ behavior: "smooth", block: "start" }); h.focus({ preventScroll: true }); } } : null })
    : tile({ label: tr("Colibri refresh"), val: rf.last ? fmtDate(rf.last.report_date || rf.last.decided_at) : tr("None yet"),
      sub: rf.last ? tr("last applied {d}", { d: fmtDate(rf.last.decided_at) }) : tr("monthly, from the Colibri exports") });
  return el("div", { class: "scoreboard ins-kpis" }, [
    tile({ label: tr("Records to decide"), tone: "serious", val: String(num(s.decision)), sub: tr("sources disagree on a field"),
      onclick: () => dataDrill({ status: "decision" }) }),
    tile({ label: tr("Records to confirm"), tone: "warning", val: String(num(s.confirm)), sub: tr("held by one source only"),
      onclick: () => dataDrill({ status: "confirm" }) }),
    tile({ label: tr("Done"), tone: "good", val: String(num(s.done)),
      sub: tr("{pct} of {n} records", { pct: dPct(num(s.done), num(s.records)) + "%", n: num(s.records) }),
      onclick: () => dataDrill({ status: "done" }) }),
    tile({ label: tr("Set aside"), val: String(num(s.set_aside)), sub: tr("parked for later"),
      onclick: () => dataDrill({ status: "set_aside" }) }),
    refreshTile,
  ]);
}

/* ---------------------------------------------------------------- progress */
function standCard(d) {
  const s = d.status || {};
  const parts = [["decision", "To decide", num(s.decision), "o4"], ["confirm", "To confirm", num(s.confirm), "o3"],
    ["set_aside", "Set aside", num(s.set_aside), "o2"], ["done", "Done", num(s.done), "o1"]];
  const total = parts.reduce((a, p) => a + p[2], 0) || 1;
  return card(tr("Where the review stands"), tr("Every record in the file, by what it still needs. Click a part to open those records."), [
    el("div", { class: "sbar big" }, parts.map(([k, l, v, o]) => v ? el("button", { type: "button", class: "seg " + o,
      style: "flex-grow:" + v, "aria-label": tr(l) + ": " + v,
      ...tipAttrs(v + " · " + Math.round((v / total) * 100) + "%", tr(l)),
      onclick: () => dataDrill({ status: k }) }, [v / total >= 0.07 ? el("span", { text: String(v) }) : null]) : null)),
    el("div", { class: "legend" }, parts.map(([k, l, v, o]) => el("span", {}, [el("i", { class: "sw " + o, "aria-hidden": "true" }), tr(l) + " · " + v]))),
  ]);
}
// A line in SVG: share of records done, one point a night, 0–100%.
function trendCard(d) {
  const pts = (d.trend || []).filter((p) => num(p.records));
  const s = d.status || {};
  const kids = [el("p", { class: "lede", text: tr("{done} of {n} records done · {togo} to go",
    { done: num(s.done), n: num(s.records), togo: num(s.decision) + num(s.confirm) }) })];
  if (pts.length < 2) {
    kids.push(el("p", { class: "note", text: tr("The line starts on {d}. A point is added every night, so the trend shows from tomorrow.",
      { d: fmtDate(pts.length ? pts[0].day : d.as_of) }) }));
  } else {
    // The line is drawn in SVG stretched to the box; the dots and every label
    // are HTML, so their size is the same on a phone as on a desktop.
    const n = pts.length;
    const vals = pts.map((p) => num(p.done) / num(p.records));
    const xp = (i) => (i * 100) / (n - 1), yp = (v) => (1 - v) * 100;
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    const svg = mk("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", class: "trend", "aria-hidden": "true" });
    for (const g of [0, 0.5, 1]) svg.appendChild(mk("line", { x1: 0, x2: 100, y1: yp(g), y2: yp(g), class: "gl" }));
    svg.appendChild(mk("polyline", { points: vals.map((v, i) => xp(i) + "," + yp(v)).join(" "), class: "ln" }));
    const plot = el("div", { class: "trend-plot", role: "img", "aria-label": tr("Share of records done, one point a night.") }, [
      svg,
      ...[0, 0.5, 1].map((g) => el("span", { class: "ax y", style: "top:" + yp(g) + "%", text: Math.round(g * 100) + "%" })),
      ...vals.map((v, i) => { const p = pts[i]; return el("span", { class: "dot" + (n > 40 ? " sm" : ""), tabindex: "0",
        style: "left:" + xp(i) + "%;top:" + yp(v) + "%",
        "data-tip-v": tr("{pct} done", { pct: dPct(num(p.done), num(p.records)) + "%" }) + "\n" +
          tr("{done} of {n} records done · {togo} to go", { done: num(p.done), n: num(p.records), togo: num(p.decision) + num(p.confirm) }),
        "data-tip-l": fmtDate(p.day) }); }),
      el("span", { class: "ax x first", text: fmtDate(pts[0].day) }),
      el("span", { class: "ax x last", text: fmtDate(pts[n - 1].day) }),
    ]);
    kids.push(el("div", { class: "trend-wrap" }, [plot]));
    kids.push(numbers([tr("Date"), tr("Done"), tr("To decide"), tr("To confirm")],
      pts.slice().reverse().map((p) => [fmtDate(p.day), num(p.done) + " (" + dPct(num(p.done), num(p.records)) + "%)",
        String(num(p.decision)), String(num(p.confirm))])));
  }
  return card(tr("Progress over time"), tr("Share of records done, one point a night."), kids);
}
function activityCard(d) {
  const by = {};
  for (const a of d.activity || []) by[String(a.day).slice(0, 10)] = num(a.records);
  const end = new Date(String(d.as_of || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  const days = [];
  for (let i = 29; i >= 0; i--) { const t = new Date(end.getTime() - i * 86400e3); days.push(t.toISOString().slice(0, 10)); }
  const total = days.reduce((a, k) => a + (by[k] || 0), 0);
  const kids = [];
  if (!total) kids.push(el("p", { class: "empty-line", text: tr("No review work recorded in the last 30 days yet.") }));
  else {
    kids.push(columnChart(days.map((k, i) => {
      const v = by[k] || 0;
      return { value: v, cap: v ? String(v) : "", label: "",
        tip: tr("{n} worked on", { n: pl(v, "record") }), tipLabel: fmtDate(k), aria: fmtDate(k) + ": " + v };
    })));
    // Thirty columns leave no room for a label under each: the two ends carry the dates.
    kids.push(el("div", { class: "axis-ends" }, [el("span", { text: fmtDate(days[0]) }), el("span", { text: fmtDate(days[days.length - 1]) })]));
  }
  return card(tr("Review work per day"), tr("Records worked on each day, last 30 days."), kids, "wide");
}

/* ------------------------------------------------------------------ fields */
function fieldsCard(d) {
  const f = d.fields || {}, n = num((d.status || {}).records);
  const order = [["name", "Name"], ["phone", "Phone"], ["gender", "Gender"], ["dob", "Date of birth"]];
  const ramp = ["o4", "o3", "o2", "o1"];
  return card(tr("How settled each field is"), tr("Across all {n} records. “Settled” means both sources agree or a person has confirmed the value.", { n }), [
    el("div", { class: "shares" }, [
      ...order.map(([k, label]) => {
        const row = f[k] || {};
        const vals = FIELD_BUCKETS.map(([b]) => num(row[b]));
        const tot = vals.reduce((a, b) => a + b, 0) || 1;
        return el("div", { class: "share-row" }, [
          el("span", { class: "sl", text: tr(label) }),
          el("span", { class: "sbar" }, vals.map((v, i) => v ? el("span", { class: "seg " + ramp[i], tabindex: "0", role: "img",
            style: "flex-grow:" + v, "aria-label": tr(FIELD_BUCKETS[i][1]) + ": " + v + " — " + tr(label),
            ...tipAttrs(v + " · " + Math.round((v / tot) * 100) + "%", tr(FIELD_BUCKETS[i][1]) + " — " + tr(label)) },
            [v / tot >= 0.09 ? el("span", { text: Math.round((v / tot) * 100) + "%" }) : null]) : null)),
        ]);
      }),
      el("div", { class: "legend" }, FIELD_BUCKETS.map(([, l], i) => el("span", {}, [el("i", { class: "sw " + ramp[i], "aria-hidden": "true" }), tr(l)]))),
    ]),
    numbers([tr("Field"), ...FIELD_BUCKETS.map(([, l]) => tr(l))],
      order.map(([k, label]) => [tr(label), ...FIELD_BUCKETS.map(([b]) => String(num((f[k] || {})[b])))])),
  ], "wide");
}

/* --------------------------------------------------------------- attention */
function attentionCard(d) {
  const by = {};
  for (const a of d.attention || []) by[a.key] = a;
  const ln = d.lines || {};
  const rows = ATTENTION.map(([key, label, help, tone]) => {
    const a = by[key] || { count: 0, spend: 0 };
    const n = num(a.count);
    const kids = [
      el("span", { class: "tone" + (n && tone ? "" : " blank"), "aria-hidden": "true", style: n && tone ? "background: var(--" + tone + ")" : null }),
      el("span", { class: "at-main" }, [el("b", { text: tr(label) }), el("span", { class: "at-help", text: tr(help) })]),
      el("span", { class: "at-n" }, [n ? pl(n, "record") : tr("Nothing"),
        n && num(a.spend) ? el("span", { class: "at-spend", title: fullUZS(a.spend), text: fmtUZS(a.spend) }) : null]),
    ];
    return n ? el("button", { type: "button", class: "at-row", "data-key": key, onclick: () => dataDrill({ attention: key }, tr(label)) }, kids)
      : el("div", { class: "at-row none", "data-key": key }, kids);
  });
  const notes = [];
  if (num(ln.no_seller)) notes.push(el("p", { class: "note", text: tr("Purchase lines with no seller: {n} of {total}. Mostly older sales; each refresh fills what the daily sales report knows.",
    { n: num(ln.no_seller), total: num(ln.total) }) }));
  if (num(d.unmapped)) notes.push(el("p", { class: "note", text: tr("Questionnaire answers with no translation: {n}.", { n: num(d.unmapped) }) }));
  return card(tr("What needs a person"), tr("Click an item to open the records behind it."), [el("div", { class: "at-list" }, rows), ...notes], "wide");
}

/* ----------------------------------------------------------------- refresh */
function confirmRow(key, text, yes, onyes, danger) {
  if (S.confirm !== key) return null;
  return el("div", { class: "confirm-row", role: "group" }, [
    el("p", { text }),
    el("div", { class: "actions" }, [
      el("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button", disabled: S.busy ? true : null, onclick: onyes, text: yes }),
      el("button", { class: "btn subtle", type: "button", disabled: S.busy ? true : null, onclick: () => { S.confirm = null; renderData(); }, text: tr("Cancel") }),
    ]),
  ]);
}
function askConfirm(key) { S.confirm = key; S.impError = null; renderData(); const b = $(".confirm-row .btn"); if (b) b.focus(); }
function fileList(b) {
  return el("ul", { class: "files" }, (b.files || []).map((f) => el("li", {}, [el("b", { text: tr(FILE_KIND[f.kind] || f.kind) }), " · ", f.name])));
}
function batchHead(b) {
  return tr("Colibri exports of {d} · purchases {a} – {b}", { d: fmtDate(b.report_date), a: fmtDate(b.period_from), b: fmtDate(b.period_to) });
}
function summaryList(d) {
  const s = d.batch.summary || {};
  const ch = s.changes || {};
  const chText = Object.keys(ch).length
    ? Object.entries(ch).map(([k, v]) => tr(FIELD_NAME[k] || k).toLowerCase() + " " + v).join(", ") : tr("none");
  const fills = s.fills || {};
  const fillText = [num(fills.brand) ? tr("brand on {n}", { n: pl(num(fills.brand), "line") }) : null,
    num(fills.seller) ? tr("seller on {n}", { n: pl(num(fills.seller), "line") }) : null].filter(Boolean).join(" · ") || tr("none");
  const added = s.added || {}, nc = s.new_clients || {}, td = s.to_decide || {}, miss = s.missing_from_export || {};
  const li = (label, value, tone) => el("li", { class: tone ? "t-" + tone : null }, [el("span", { text: label }), el("b", { text: value })]);
  return el("ol", { class: "pairs" }, [
    li(tr("Purchase lines in the export"), num(s.lines) + " · " + tr("already in the file: {n}", { n: num(s.known_lines) })),
    li(tr("Added to existing clients"), tr("{lines} · {spend} · {clients}", { lines: pl(num(added.lines), "line"), spend: fmtUZS(added.spend), clients: pl(num(added.clients), "client") })),
    li(tr("New clients"), num(nc.clients) + " · " + pl(num(nc.lines), "line") + " · " + fmtUZS(nc.spend)),
    li(tr("Names to decide"), num(td.names) ? pl(num(td.names), "name") + " · " + pl(num(td.lines), "line") : tr("none"), num(td.names) ? "serious" : null),
    li(tr("Changes from the client cards"), chText),
    li(tr("Filled on earlier lines"), fillText),
    li(tr("In the file but not in this export"), num(miss.lines) ? pl(num(miss.lines), "line") + " · " + fmtUZS(miss.spend) : tr("none"), num(miss.lines) ? "warning" : null),
    li(tr("New lines with no brand identified"), num(s.no_brand) ? pl(num(s.no_brand), "line") : tr("none")),
    num(s.unknown_sellers) ? li(tr("New sellers"), tr("{n} — each is added as “Sales rep N” until someone gives the name, and can be given clients once activated", { n: num(s.unknown_sellers) })) : null,
  ]);
}
function decideCard(d) {
  const items = d.to_decide || [];
  if (!items.length) return null;
  return card(tr("Decide who these purchases belong to"), tr("The export name matches one record and the phone another, or the name matches several. Choose one."),
    items.map((it) => {
      const opt = (value, kids, extra) => el("button", { type: "button", class: "dopt" + (extra ? " " + extra : ""),
        "aria-pressed": it.decision === value ? "true" : "false", disabled: S.busy ? true : null,
        onclick: () => impAct("import_decide", { name_key: it.name_key, decision: it.decision === value ? "clear" : value }, tr("Decision saved.")) }, kids);
      return el("div", { class: "decide", "data-name": it.name_key }, [
        el("div", { class: "d-head" }, [el("b", { text: it.name }), el("span", { class: "muted",
          text: " · " + pl(num(it.lines), "line") + " · " + fmtUZS(it.spend) + " · " + fmtDate(it.first) + (it.last !== it.first ? " – " + fmtDate(it.last) : "") })]),
        el("div", { class: "opts", role: "group", "aria-label": it.name }, [
          ...(it.candidates || []).map((c) => opt(c.client_id, [
            el("span", { class: "o-ref", text: c.client_id }),
            el("span", { class: "o-name", text: c.name || "—" }),
            el("span", { class: "o-meta", text: [c.by === "phone" ? tr("same phone") : tr("same name"),
              c.spend ? fmtUZS(c.spend) : null, c.last ? tr("last purchase {d}", { d: fmtDate(c.last) }) : null, who(c.owner)].filter(Boolean).join(" · ") }),
          ])),
          opt("new", [el("span", { class: "o-name", text: tr("A new client") })], "alt"),
          opt("skip", [el("span", { class: "o-name", text: tr("Leave out of this refresh") })], "alt"),
        ]),
      ]);
    }), "wide");
}
function impActions(blocked, lines, nc, pinned) {
  return el("div", { class: "imp-actions" }, [
    confirmRow("apply", tr("Apply this refresh? It adds {lines} and {clients}. You can undo it until the next refresh is applied.",
      { lines: pl(lines, "line"), clients: pl(num(nc.clients), "client") }), tr("Yes, apply"),
      () => impAct("import_apply", {}, tr("Refresh applied."))),
    confirmRow("discard", tr("Discard this refresh? Nothing in the client file changes; Claude can stage it again from the same exports."), tr("Yes, discard"),
      () => impAct("import_discard", {}, tr("Refresh discarded.")), true),
    S.confirm ? null : el("div", { class: "actions" }, [
      el("button", { class: "btn primary", type: "button", id: "imp-apply", disabled: blocked || S.busy ? true : null,
        onclick: () => askConfirm("apply"), text: tr("Apply the refresh") }),
      el("button", { class: "btn subtle", type: "button", disabled: S.busy ? true : null, onclick: () => askConfirm("discard"), text: tr("Discard") }),
      blocked ? el("span", { class: "form-err", text: tr(pinned ? "Decide the names above first." : "Decide the names below first.") }) : null,
    ]),
  ]);
}
function sellerText(s) { return s === "+" ? tr("new seller") : blank(s) ? "—" : who(s); }
function stagedPanel(d) {
  const b = d.batch, s = b.summary || {};
  const blocked = num((s.to_decide || {}).lines) > 0;
  const nc = s.new_clients || {}, added = s.added || {};
  const lines = num(added.lines) + num(nc.lines);
  const out = [];
  out.push(card(tr("Refresh waiting for review"), batchHead(b), [
    fileList(b),
    el("h4", { class: "ih4", text: tr("What this refresh would do") }),
    summaryList(d),
    S.impError ? el("div", { class: "banner critical", role: "alert", text: S.impError }) : null,
    // On a phone Apply and Discard leave the card for a bar pinned at the
    // bottom of the review (below), so they stay in reach while reading it.
    isPhone() ? null : impActions(blocked, lines, nc),
  ], "wide batch-card"));
  out.push(decideCard(d));
  if ((d.new_clients || []).length) {
    out.push(card(tr("Clients this refresh would create"), null, [foldTable(
      [tr("Name"), tr("First purchase"), tr("Seller"), tr("From the card"), tr("Lines"), tr("Spend")],
      d.new_clients.map((c) => [c.name, fmtDate(c.first), sellerText(c.seller),
        c.card ? [c.card.gender ? fmtGender(c.card.gender) : null, c.card.dob ? tr("birthday") : null, c.card.phone ? tr("phone") : null].filter(Boolean).join(" · ") || "—" : tr("no card"),
        String(num(c.lines)), fmtUZS(c.spend)]), 4)], "wide"));
  }
  if ((d.by_phone || []).length) {
    out.push(card(tr("Found by phone, under another name"), null, [table([tr("Client"), tr("In the file"), tr("In the export"), tr("Lines"), tr("Spend")],
      d.by_phone.map((c) => [cref(c.client_id), c.name, c.export_name, String(num(c.lines)), fmtUZS(c.spend)]), 3)]));
  }
  if ((d.changes || []).length) {
    out.push(card(tr("Changes from the client cards"), null, [foldTable([tr("Client"), tr("Name"), tr("Field"), tr("Now"), tr("Becomes")],
      d.changes.map((c) => {
        const v = (x) => c.field === "gender" ? fmtGender(x) : c.field === "dob" ? fmtDate(x) : x;
        return c.field === "phone" ? [cref(c.client_id), c.name, tr("Phone"), tr("Number changed (not shown)"), ""]
          : [cref(c.client_id), c.name, tr(FIELD_NAME[c.field] || c.field), v(c.old), v(c.new)];
      }), 9)]));
  }
  if ((d.added || []).length) {
    out.push(card(tr("Purchases added to existing clients"), null, [foldTable([tr("Client"), tr("Name"), tr("Last purchase"), tr("Lines"), tr("Spend")],
      d.added.map((c) => [cref(c.client_id), c.name, fmtDate(c.last), String(num(c.lines)), fmtUZS(c.spend)]), 3)]));
  }
  if ((d.missing || []).length) {
    out.push(card(tr("In the file but not in this export"), tr("The refresh deletes nothing. Check in Colibri whether these were returned or corrected."),
      [foldTable([tr("Client"), tr("Name"), tr("Date"), tr("Item"), tr("Brand"), tr("Net")],
        d.missing.map((m) => [cref(m.client_id), m.name, fmtDate(m.sold_at), m.item, m.brand, fmtUZS(m.net)]), 5)], "wide"));
  }
  if ((d.no_brand || []).length) {
    out.push(card(tr("New lines with no brand identified"), null, [foldTable([tr("Date"), tr("Client"), tr("Item"), tr("Net")],
      d.no_brand.map((m) => [fmtDate(m.sold_at), m.name, m.item, fmtUZS(m.net)]), 3)]));
  }
  if (isPhone()) out.push(el("div", { class: "imp-bar", role: "region", "aria-label": tr("Apply the refresh") }, [impActions(blocked, lines, nc, true)]));
  return out.filter(Boolean);
}
function donePanel(d) {
  const b = d.batch, done = d.done || {}, ap = (b.summary || {}).applied || {};
  const latest = (S.imports || []).some((x) => x.id === b.id && x.latest_applied);
  const when = b.status === "applied" ? tr("applied {d} by {who}", { d: fmtDateTime(b.decided_at), who: who(b.decided_by) })
    : b.status === "undone" ? tr("undone {d} by {who}", { d: fmtDateTime(b.undone_at), who: who(b.undone_by) })
    : tr("discarded {d} by {who}", { d: fmtDateTime(b.decided_at), who: who(b.decided_by) });
  const kept = num(((b.summary || {}).undo || {}).values_kept);
  const out = [card(tr("Refresh #{id}", { id: b.id }), batchHead(b) + " · " + when, [
    fileList(b),
    b.status !== "discarded" ? el("p", { class: "lede", text: tr("{lines} added · {clients} new", { lines: pl(num(ap.lines_added), "line"), clients: pl(num(ap.new_clients), "client") }) }) : null,
    num(done.line_fields) ? el("p", { class: "note", text: tr("Earlier lines it completed: {n}", { n: num(done.line_fields) }) }) : null,
    kept ? el("p", { class: "note", text: tr("Values kept on undo because someone had changed them since: {n}", { n: kept }) }) : null,
    S.impError ? el("div", { class: "banner critical", role: "alert", text: S.impError }) : null,
    latest ? confirmRow("undo", tr("Undo this refresh? Its purchase lines and the clients it created are removed, and the values it changed go back — unless someone has changed them since."),
      tr("Yes, undo"), () => impAct("import_undo", {}, tr("Refresh undone.")), true) : null,
    latest && !S.confirm ? el("div", { class: "actions" }, [el("button", { class: "btn subtle danger-text", type: "button", disabled: S.busy ? true : null,
      onclick: () => askConfirm("undo"), text: tr("Undo") })]) : null,
  ], "wide batch-card")];
  if (b.status === "discarded") return out;
  if ((done.created || []).length) out.push(card(tr("Clients it created"), null, [foldTable([tr("Client"), tr("Name")],
    done.created.map((c) => [b.status === "undone" ? c.client_id : cref(c.client_id), c.name]), 2)]));
  if ((done.added || []).length) out.push(card(tr("Purchases it added"), null, [foldTable([tr("Client"), tr("Name"), tr("Lines"), tr("Spend")],
    done.added.map((c) => [b.status === "undone" && !c.name ? c.client_id : cref(c.client_id), c.name, String(num(c.lines)), c.spend ? fmtUZS(c.spend) : "—"]), 2)]));
  if ((done.fields || []).length) out.push(card(tr("Values it changed"), null, [foldTable([tr("Client"), tr("Name"), tr("Field"), tr("Now"), tr("Becomes")],
    done.fields.map((c) => /^phone/.test(c.field) ? [cref(c.client_id), c.name, tr("Phone"), tr("Number changed (not shown)"), ""]
      : [cref(c.client_id), c.name, tr(FIELD_NAME[c.field] || c.field), c.old, c.new]), 9)], "wide"));
  return out;
}
function historyCard() {
  const rows = S.imports || [];
  if (!rows.length) return null;
  return card(tr("History"), null, [el("ul", { class: "batches" }, rows.map((b) => {
    const ap = (b.summary || {}).applied || {};
    const cur = S.imp && S.imp.batch && S.imp.batch.id === b.id;
    return el("li", { class: cur ? "cur" : null }, [
      el("span", { class: "b-id", text: "#" + b.id }),
      el("span", { class: "b-main" }, [
        el("span", { text: fmtDate(b.report_date) + " · " + fmtDate(b.period_from) + " – " + fmtDate(b.period_to) }),
        el("span", { class: "muted", text: (b.status === "applied" || b.status === "undone")
          ? tr("{lines} added · {clients} new", { lines: pl(num(ap.lines_added), "line"), clients: pl(num(ap.new_clients), "client") }) : "" }),
      ]),
      batchChip(b.status),
      cur ? el("span", { class: "muted", text: tr("Viewing") })
        : el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null, onclick: () => viewBatch(b.id), text: tr("View") }),
    ]);
  }))]);
}
function refreshSection(d) {
  const kids = [];
  const staged = S.imp && S.imp.batch && S.imp.batch.status === "staged" ? S.imp : null;
  if (!staged) {
    kids.push(card(tr("No refresh is waiting for review."), null, [el("p", { class: "lede", text:
      tr("Each month, export the three Colibri reports (client purchases, daily sales, client cards) into the “12. CRM / Source files” folder and ask Claude to run the refresh. It will appear here for you to review before anything changes.") })], "wide"));
  }
  if (S.imp && S.imp.batch) kids.push(...(staged ? stagedPanel(S.imp) : donePanel(S.imp)));
  kids.push(historyCard());
  return [sectionHead("dat-refresh", tr("The monthly Colibri refresh")), el("div", { class: "ins-grid", id: "dat-batch", tabindex: "-1" }, kids.filter(Boolean))];
}

/* ------------------------------------------------------------------ render */
function renderData() {
  const host = $("#data-host");
  if (!host) return;
  const d = S.dh;
  host.innerHTML = "";
  host.setAttribute("aria-busy", S.dhLoading || S.busy ? "true" : "false");
  if (!d) {
    host.appendChild(S.dhError
      ? el("div", { class: "panel err-box" }, [el("p", { text: S.dhError || tr("Could not load the data health.") }),
        el("button", { class: "btn", type: "button", onclick: loadData, text: tr("Try again") })])
      : el("div", { class: "loading", text: tr("Loading the data health…") }));
    return;
  }
  const body = el("div", { class: "ins-body" + (S.dhLoading ? " refreshing" : "") }, [
    el("div", { class: "ins-bar" }, [el("span", { class: "ins-meta", text: tr("As of {d} · a point is added to the trend every night", { d: fmtDate(d.as_of) }) })]),
    dataKpis(d),
    sectionHead("dat-progress", tr("Review progress")),
    el("div", { class: "ins-grid" }, [standCard(d), trendCard(d), activityCard(d)]),
    sectionHead("dat-fields", tr("Field status")),
    el("div", { class: "ins-grid" }, [fieldsCard(d)]),
    sectionHead("dat-attention", tr("Needs attention")),
    el("div", { class: "ins-grid" }, [attentionCard(d)]),
    ...(d.can_import ? refreshSection(d) : []),
  ]);
  if (S.dhError) body.prepend(el("div", { class: "banner critical", role: "alert", text: S.dhError }));
  host.appendChild(body);
  stackTables(body);
}
