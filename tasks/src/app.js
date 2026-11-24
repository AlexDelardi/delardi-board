/* ===========================================================================
   Delardi task tracker — the page. Two ribbons (Shop floor, Backoffice), each
   with its scopes; My tasks, Team, Done, and for whoever has it the Inbox.
   The page talks to tasks-api only; who may do what is decided there and in
   the database, and what it refuses is shown as it is said.
   Nothing is kept behind the passcode card: tasks are dropped on lock.
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/tasks-api";
const LOGO_WORDMARK = "__WORDMARK__";
const SESSION_KEY = "tasks_session";      // sessionStorage: gone when the tab closes
const ACTIVE_KEY = "tasks_last_active";   // sessionStorage: last touch, for the idle lock
const LANG_KEY = "delardi_lang";          // shared with the landing page
const RIBBON_KEY = "tasks_ribbon";        // sessionStorage: the ribbon on screen
const IDLE_MIN = 15;                      // touch devices only

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  "Tasks": "Задачи", "Task tracker": "Задачи",
  "All tools": "Все инструменты", "Language": "Язык", "Lock": "Заблокировать", "Menu": "Меню", "Locked.": "Заблокировано.",
  "Boutique tools": "Инструменты бутика", "Unlock": "Открыть", "Checking…": "Проверяю…", "Passcode": "Код доступа",
  "Opens the task tracker": "Открывает задачи",
  "Welcome, {name}": "Здравствуйте, {name}",
  "Enter your passcode.": "Введите код доступа.",
  "Locked after {n} minutes without use.": "Заблокировано после {n} минут без действий.",
  "That passcode is not right.": "Неверный код доступа.",
  "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "This account does not have access to the task tracker.": "У этой учётной записи нет доступа к задачам.",
  "Enter your passcode to open the task tracker.": "Введите код доступа, чтобы открыть задачи.",
  "That session is not valid. Enter your passcode again.": "Сеанс недействителен. Введите код доступа ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сеанс истёк. Введите код доступа ещё раз.",
  "Something went wrong on the server.": "Ошибка на сервере.",
  "No connection. Check the Wi-Fi and try again.": "Нет связи. Проверьте Wi-Fi и попробуйте ещё раз.",
  "The server did not answer. Try again.": "Сервер не ответил. Попробуйте ещё раз.",
  "Request failed ({n})": "Ошибка запроса ({n})",
  "Yes": "Да", "Cancel": "Отмена", "Close": "Закрыть", "Try again": "Повторить", "Save": "Сохранить", "Saving…": "Сохраняю…",
  "Loading the tasks…": "Загружаю задачи…",
  // ribbons, tabs
  "Shop floor": "Бутик", "Backoffice": "Бэк-офис", "Ribbon": "Раздел",
  "My tasks": "Мои задачи", "Team": "Команда", "Done": "Готово", "Inbox": "Входящие",
  "New task": "Новая задача",
  // groups
  "Overdue": "Просрочено", "Today": "Сегодня", "This week": "На этой неделе", "Later": "Позже", "No date": "Без срока",
  "Nothing here. Enjoy it, or add a task.": "Здесь пусто. Можно добавить задачу.",
  "Nothing matches these filters.": "По этим фильтрам ничего нет.",
  "No finished tasks in the last 60 days.": "За последние 60 дней завершённых задач нет.",
  "Finished tasks stay here for 60 days.": "Завершённые задачи остаются здесь 60 дней.",
  // task fields
  "Title": "Название", "Scope": "Направление", "Owner": "Ответственный", "With": "Вместе с", "Due": "Срок", "Priority": "Приоритет",
  "Status": "Статус", "Notes": "Заметки", "Checklist": "Чек-лист", "Comments": "Комментарии", "History": "История", "Clients": "Клиенты", "Piece": "Изделие",
  "Normal": "Обычный", "High": "Высокий", "High priority": "Высокий приоритет",
  "To do": "К выполнению", "In progress": "В работе", "Waiting": "Ожидание",
  "Nobody": "Никто", "Anyone helping (optional)": "Кто помогает (необязательно)",
  "Catalogue reference (optional)": "Артикул из каталога (необязательно)",
  "Open in the Catalogue": "Открыть в каталоге",
  "Sensitive: seen only by those with that right": "Конфиденциально: видно только тем, у кого есть это право",
  "Sensitive": "Конфиденциально",
  "What needs doing?": "Что нужно сделать?",
  "Add a step": "Добавить шаг", "Add": "Добавить", "Remove": "Убрать", "Remove the step": "Убрать шаг",
  "Add a comment": "Добавить комментарий", "Write a comment…": "Напишите комментарий…", "Send": "Отправить",
  "No comments yet.": "Комментариев пока нет.",
  "Find a client by name or reference": "Найти клиента по имени или номеру",
  "Client attached": "Клиент прикреплён", "{n} clients attached": "Клиентов прикреплено: {n}",
  "Client names are shown to people with CRM access.": "Имена клиентов видны тем, у кого есть доступ к CRM.",
  "No client found.": "Клиент не найден.",
  "Remove the client": "Убрать клиента", "Open the client's card": "Открыть карточку клиента",
  "Add the task": "Добавить задачу", "Save changes": "Сохранить изменения", "Saved.": "Сохранено.", "Task added.": "Задача добавлена.",
  "Mark done": "Готово", "Reopen": "Вернуть в работу", "Done.": "Готово.", "Reopened.": "Возвращено в работу.",
  "Archive": "В архив", "Archive this task?": "Убрать задачу в архив?",
  "It leaves every list. It is kept, and a manager can restore it.": "Она исчезнет из всех списков, но сохранится: руководитель может её вернуть.",
  "Archived.": "Убрано в архив.",
  "Leave without saving?": "Закрыть без сохранения?", "Your changes to this task are not saved.": "Изменения в задаче не сохранены.",
  "Leave": "Закрыть", "Keep editing": "Продолжить",
  "Give the task a title.": "Укажите название задачи.",
  "From the Weekly Board. Its earlier history is there.": "Перенесено с еженедельной доски. Прежняя история осталась там.",
  "Open the Weekly Board": "Открыть доску",
  "Added by {who}, {when}": "Добавил(а) {who}, {when}",
  "Only a manager can give a task to someone else.": "Передать задачу другому может только руководитель.",
  "Only a manager can archive a task.": "Убрать задачу в архив может только руководитель.",
  "That task was not found.": "Задача не найдена.",
  "This task is archived. Restore it to change it.": "Задача в архиве. Верните её, чтобы изменить.",
  "Tagging a client needs CRM access.": "Чтобы прикрепить клиента, нужен доступ к CRM.",
  "That person does not use this part of the tracker.": "Этот человек не работает с этим разделом.",
  "Write the comment first.": "Сначала напишите комментарий.",
  "This account cannot add tasks there.": "Эта учётная запись не может добавлять сюда задачи.",
  "A task stays on its ribbon: choose one of its scopes.": "Задача остаётся в своём разделе: выберите одно из его направлений.",
  // filters
  "Everyone": "Все", "Open": "Открытые", "Any priority": "Любой приоритет", "Search tasks": "Поиск по задачам", "Filters": "Фильтры",
  "{done} of {all}": "{done} из {all}",
  "due {d}": "срок {d}", "today": "сегодня", "tomorrow": "завтра", "yesterday": "вчера",
  "done {d}": "готово {d}",
  // inbox
  "Suggestions drafted from emails and calls. Accept one to make it a task, or dismiss it.": "Предложения из писем и звонков. Примите, чтобы сделать задачей, или отклоните.",
  "The inbox is empty.": "Входящие пусты.",
  "Loading the inbox…": "Загружаю входящие…",
  "Adds a comment to: {t}": "Добавит комментарий к задаче: {t}",
  "Next step": "Следующий шаг", "From": "Источник",
  "Make it a task": "Сделать задачей", "Add as a comment": "Добавить комментарием", "Dismiss": "Отклонить",
  "Added as a task.": "Добавлено задачей.", "Added as a comment.": "Добавлено комментарием.", "Dismissed.": "Отклонено.",
  "email": "письмо", "call": "звонок",
  // history words
  "created": "создано", "changed": "изменено", "archived": "в архив", "restored": "возвращено", "carried_over": "перенесено с доски", "suggestion_accepted": "принято предложение",
};
const PL = {
  task: { en: ["task", "tasks"], ru: ["задача", "задачи", "задач"] },
  comment: { en: ["comment", "comments"], ru: ["комментарий", "комментария", "комментариев"] },
};
function initialLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "ru") return v;
  } catch (e) { /* storage blocked */ }
  return /^ru\b/i.test(navigator.language || "") ? "ru" : "en";
}
let LANG = initialLang();
function tr(s, vars) {
  let out = (LANG === "ru" && Object.prototype.hasOwnProperty.call(RU, s)) ? RU[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}
function pl(n, key) {
  const f = PL[key][LANG];
  if (LANG === "ru") {
    const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    const i = a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 1 : 2;
    return n + " " + f[i];
  }
  return n + " " + (n === 1 ? f[0] : f[1]);
}
function setLang(l) {
  LANG = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* ignore */ }
  document.documentElement.lang = l;
  renderAll();
  if (S.panel) renderPanel();
  if (S.locked) renderGate();
}

/* -------------------------------------------------------------------- state */
const S = {
  token: null, name: null, expires_at: null,
  locked: true, gateMessage: null, menuOpen: false,
  doc: null, err: null,              // the snapshot: me, scopes, people, tasks, inbox
  ribbon: null,                      // "floor" or "backoffice"
  filters: { owner: "", status: "open", high: false, q: "" },   // the Team screen's
  panel: null,                       // { task (as loaded, or null for a new one), form, busy, err, dirty, found, searching }
  inbox: null,                       // { list, err } once asked for
};

/* ----------------------------------------------------------------- helpers */
function $(sel, root) { return (root || document).querySelector(sel); }
// el(tag, attrs, ...children): children may be strings, nodes or arrays of them.
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") { if (v) n.className = v; }
    else if (k === "text") n.textContent = v;
    else if (k === "value") n.value = v;
    else if (k === "html") n.innerHTML = v;        // fixed markup from this file only, never data
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  const add = (kid) => {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(add); return; }
    n.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  };
  kids.forEach(add);
  return n;
}
function blank(v) { return v === null || v === undefined || String(v).trim() === ""; }
function markInvalid(input, bad) {
  if (!input) return;
  if (bad) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
}
// Dates on screens: "16 Nov 2026" / "16 ноя 2026", always the boutique's day (Tashkent).
// Month names come from fixed lists, not from Intl, whose Russian short months carry a dot.
const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
};
const TZ = "Asia/Tashkent";
function tashkentDay(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}
function fmtDate(iso) {
  if (blank(iso)) return "—";
  const t = tashkentDay(iso);
  if (!t) return "—";
  return t.d + " " + MONTHS[LANG === "ru" ? "ru" : "en"][t.m - 1] + " " + t.y;
}
function fmtDateNum(iso) {
  const t = blank(iso) ? null : tashkentDay(iso);
  if (!t) return "—";
  return String(t.d).padStart(2, "0") + "." + String(t.m).padStart(2, "0") + "." + t.y;
}
// "14:05" in Tashkent time, so it agrees with fmtDate around midnight
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function toast(msg, isErr) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 4200);
}
function sstore(key, val) {
  try {
    if (val === undefined) return sessionStorage.getItem(key);
    if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, String(val));
  } catch (e) { /* storage blocked: the session lives in memory only */ }
  return null;
}
const touchDevice = () => window.matchMedia("(pointer: coarse)").matches;

/* --------------------------------------------------------------------- api */
// 20 s; window.__API_TIMEOUT_MS is a test-only override that can only shorten it.
function apiLimit() {
  const ms = Number(window.__API_TIMEOUT_MS);
  return ms > 0 && ms < 20000 ? ms : 20000;
}

async function api(action, body) {
  const payload = Object.assign({ action }, body || {});
  if (S.token && action !== "unlock") payload.token = S.token;
  // A request that hangs is cut after 20 s (window.__API_TIMEOUT_MS: test-only override),
  // so a busy panel can always be released.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), apiLimit());
  let res, data = {};
  try {
    res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
    // the timer stays on while the body is read
    try { data = await res.json(); } catch (e) { if (ctl.signal.aborted) throw e; /* empty body */ }
  } catch (e) {
    const err = new Error(ctl.signal.aborted ? tr("The server did not answer. Try again.") : tr("No connection. Check the Wi-Fi and try again."));
    err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // A lost session locks the page; the filters on screen are kept.
    if (res.status === 401 && action !== "unlock") lockDown(data.error);
    const err = new Error(data.error ? tr(data.error) : tr("Request failed ({n})", { n: res.status }));
    err.status = res.status;
    err.raw = data.error || "";            // the server's sentence as sent, before any translation
    throw err;
  }
  return data;
}

/* ----------------------------------------------------------------- dialogs
   modal(id, title, body, foot): a sheet over the page (not inside #app, so a
   redraw of the page leaves it open). confirmBox() asks yes / no and resolves
   to true or false. */
function modal(id, title, body, foot, cls) {
  const old = document.getElementById(id);
  if (old) old.remove();
  const close = () => { const h = document.getElementById(id); if (h) h.remove(); };
  const host = el("div", { id, class: "modal-wrap" + (cls ? " " + cls : "") },
    el("div", { class: "modal-scrim", onclick: close }),
    el("section", { class: "modal" + (cls ? " " + cls : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": id + "-title" },
      el("div", { class: "modal-head" },
        el("h3", { id: id + "-title", text: title }),
        el("button", { class: "btn subtle close", type: "button", id: id + "-close", "aria-label": tr("Close"), onclick: close, text: "×" })),
      el("div", { class: "modal-body" }, body),
      foot ? el("div", { class: "modal-foot" }, foot) : null));
  document.body.appendChild(host);
  return { host, close };
}
function confirmBox({ title, body, ok, cancel, danger }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const m = modal("confirm-dialog", title, [].concat(body).map((t) => typeof t === "string" ? el("p", { text: t }) : t), [
      el("button", { type: "button", class: "btn " + (danger ? "danger" : "primary"), id: "confirm-ok", onclick: () => finish(true) }, ok || tr("Yes")),
      el("button", { type: "button", class: "btn", id: "confirm-cancel", onclick: () => finish(false) }, cancel || tr("Cancel")),
    ], "confirm");
    // closing it any other way (×, the scrim, the lock) is a no
    new MutationObserver((_, obs) => { if (!m.host.isConnected) { obs.disconnect(); finish(false); } })
      .observe(document.body, { childList: true });
    setTimeout(() => { const b = $("#confirm-cancel"); if (b && !touchDevice()) b.focus(); }, 30);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#confirm-dialog")) { e.preventDefault(); e.stopImmediatePropagation(); $("#confirm-cancel").click(); }
}, true);

/* --------------------------------------------------------------- the tasks
   One snapshot holds everything the lists show. A change answers with the task as it now stands, which is put
   back into the snapshot; the lists are then redrawn from it. */
const me = () => (S.doc && S.doc.me) || {};
const scopesOf = (ribbon) => ((S.doc && S.doc.scopes) || []).filter((s) => s.ribbon === ribbon);
const scopeName = (id) => { const s = ((S.doc && S.doc.scopes) || []).find((x) => x.scope_id === id); return s ? (LANG === "ru" ? s.name_ru : s.name_en) : ""; };
const peopleOf = (ribbon) => ((S.doc && S.doc.people) || []).filter((p) => p[ribbon]).map((p) => p.name);
const ribbons = () => ["floor", "backoffice"].filter((r) => me()[r]);
const RIBBON_NAME = { floor: "Shop floor", backoffice: "Backoffice" };
const STATUSES = [["todo", "To do"], ["in_progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"]];
const statusName = (s) => tr((STATUSES.find((x) => x[0] === s) || ["", s])[1]);
const tasksHere = () => ((S.doc && S.doc.tasks) || []).filter((t) => t.ribbon === S.ribbon);

let loadSeq = 0;
async function loadTasks() {
  const seq = ++loadSeq;
  S.err = null;
  renderAll();
  try {
    const d = await api("snapshot");
    if (seq !== loadSeq || S.locked) return;
    S.doc = d;
    const saved = sstore(RIBBON_KEY);
    S.ribbon = ribbons().includes(saved) ? saved : ribbons()[0] || null;
  } catch (e) {
    if (seq !== loadSeq || S.locked) return;
    if (e.status === 403) { lockDown(e.raw); return; }
    S.err = e.message;
  }
  renderAll();
}
function setRibbon(r) {
  if (!ribbons().includes(r) || r === S.ribbon) return;
  S.ribbon = r; sstore(RIBBON_KEY, r);
  S.filters.owner = "";
  if (route().name === "inbox" && r !== "backoffice") location.hash = "#/my";
  renderAll();
}
// A task as the server now has it goes back into the snapshot (or leaves it, when archived).
function putTask(t) {
  if (!S.doc || !t) return;
  const list = S.doc.tasks, i = list.findIndex((x) => x.task_id === t.task_id);
  const lean = Object.assign({}, t); delete lean.comment_list; delete lean.history;
  if (t.archived) { if (i >= 0) list.splice(i, 1); }
  else if (i >= 0) list[i] = lean; else list.push(lean);
}

/* ------------------------------------------------------------------- dates */
// The boutique's day, as "YYYY-MM-DD".
function todayStr() { const t = tashkentDay(new Date().toISOString()); return t.y + "-" + String(t.m).padStart(2, "0") + "-" + String(t.d).padStart(2, "0"); }
function addDays(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// "24 Nov" for a date this year, "24 Nov 2027" otherwise; today, tomorrow and yesterday by name.
function dayLabel(s) {
  if (blank(s)) return "";
  const t = todayStr();
  if (s === t) return tr("today");
  if (s === addDays(t, 1)) return tr("tomorrow");
  if (s === addDays(t, -1)) return tr("yesterday");
  const m = MONTHS[LANG === "ru" ? "ru" : "en"][Number(s.slice(5, 7)) - 1];
  return Number(s.slice(8, 10)) + " " + m + (s.slice(0, 4) === t.slice(0, 4) ? "" : " " + s.slice(0, 4));
}
// Which group of "My tasks" a due date falls in.
function dueGroup(s) {
  if (blank(s)) return "none";
  const t = todayStr();
  return s < t ? "overdue" : s === t ? "today" : s <= addDays(t, 7) ? "week" : "later";
}

/* --------------------------------------------------------------- task rows */
function clientChips(t) {
  const cs = t.clients || [];
  if (!cs.length) return null;
  if (!me().crm || cs.every((c) => !c.name)) return el("span", { class: "tag info client-tag", text: cs.length === 1 ? tr("Client attached") : tr("{n} clients attached", { n: cs.length }) });
  return cs.map((c) => el("span", { class: "tag info client-tag", text: c.name || c.client_id }));
}
function taskRow(t, opts) {
  const o = opts || {};
  const done = t.status === "done";
  const g = done ? null : dueGroup(t.due_on);
  const steps = t.checklist || [], ticked = steps.filter((c) => c.done).length;
  const meta = [
    o.scope === false ? null : el("span", { class: "tag line", text: scopeName(t.scope_id) }),
    t.priority === "high" && !done ? el("span", { class: "tag act", text: tr("High") }) : null,
    done ? null : t.status !== "todo" ? el("span", { class: "tag info", text: statusName(t.status) }) : null,
    t.sensitive ? el("span", { class: "tag alert", text: tr("Sensitive") }) : null,
    done ? el("span", { class: "meta-bit", text: tr("done {d}", { d: fmtDate(t.done_at) }) })
      : t.due_on ? el("span", { class: "meta-bit due" + (g === "overdue" ? " late" : ""), text: tr("due {d}", { d: dayLabel(t.due_on) }) }) : null,
    o.owner === false ? null : el("span", { class: "meta-bit who", text: (t.owner || tr("Nobody")) + (t.helper ? " + " + t.helper : "") }),
    steps.length ? el("span", { class: "meta-bit", text: tr("{done} of {all}", { done: ticked, all: steps.length }) + " ✓" }) : null,
    t.comments ? el("span", { class: "meta-bit", text: pl(t.comments, "comment") }) : null,
    clientChips(t),
  ];
  const quick = el("button", { type: "button", class: "btn quick", "data-id": t.task_id,
    onclick: (ev) => { ev.stopPropagation(); quickStatus(t, done ? "todo" : "done"); }, text: tr(done ? "Reopen" : "Mark done") });
  const open = el("button", { type: "button", class: "task-open", "aria-label": t.title, onclick: () => openTask(t.task_id) },
    el("span", { class: "item task-title", text: t.title }),
    el("span", { class: "task-meta" }, meta));
  return el("li", { class: "task" + (done ? " is-done" : "") + (g === "overdue" ? " is-late" : ""), "data-id": t.task_id }, open, quick);
}
async function quickStatus(t, status) {
  try {
    putTask(await api("save", { task: { task_id: t.task_id, status } }));
    toast(tr(status === "done" ? "Done." : "Reopened."));
  } catch (e) { toast(e.message, true); }
  if (!S.locked) renderAll();
}
const byDue = (a, b) => (a.due_on || "9999").localeCompare(b.due_on || "9999") || (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) || a.created_at.localeCompare(b.created_at);
function newTaskButton() {
  return el("button", { type: "button", class: "btn primary", id: "new-task", onclick: () => openTask(null), text: "+ " + tr("New task") });
}
function screenHead(title, aside) {
  return el("div", { class: "screen-head" }, el("h1", { class: "title", text: title }), el("div", { class: "aside" }, aside));
}

/* ----------------------------------------------------------------- screens */
function renderMy(main) {
  const sec = el("section", { class: "screen", id: "screen-my" }, screenHead(tr("My tasks"), newTaskButton()));
  main.append(sec);
  if (pending(sec)) return;
  const mine = tasksHere().filter((t) => t.status !== "done" && (t.owner === S.name || t.helper === S.name)).sort(byDue);
  if (!mine.length) { sec.append(el("p", { class: "notice", id: "my-empty", text: tr("Nothing here. Enjoy it, or add a task.") })); return; }
  for (const [key, label] of [["overdue", "Overdue"], ["today", "Today"], ["week", "This week"], ["later", "Later"], ["none", "No date"]]) {
    const list = mine.filter((t) => dueGroup(t.due_on) === key);
    if (!list.length) continue;
    sec.append(el("h2", { class: "sec-title" + (key === "overdue" ? " late" : ""), "data-group": key }, tr(label), el("span", { class: "count", text: String(list.length) })),
      el("ul", { class: "tasks", "data-group": key }, list.map((t) => taskRow(t, { owner: t.owner !== S.name }))));
  }
}
function renderTeam(main) {
  const f = S.filters;
  const sec = el("section", { class: "screen wide", id: "screen-team" }, screenHead(tr("Team"), newTaskButton()));
  main.append(sec);
  if (pending(sec)) return;
  const sel = (id, label, value, options, on) => el("label", { class: "filter" }, el("span", { class: "lbl", text: label }),
    el("select", { id, onchange: (e) => { on(e.target.value); renderAll(); const n = $("#" + id); if (n) n.focus(); } }, options.map(([v, text]) => el("option", { value: v, selected: v === value ? true : null, text }))));
  const q = el("input", { type: "search", id: "f-q", value: f.q, placeholder: tr("Search tasks"), "aria-label": tr("Search tasks"),
    oninput: (e) => { f.q = e.target.value; drawColumns(); } });
  sec.append(el("div", { class: "filters", role: "group", "aria-label": tr("Filters") },
    sel("f-owner", tr("Owner"), f.owner, [["", tr("Everyone")]].concat(peopleOf(S.ribbon).map((n) => [n, n])), (v) => { f.owner = v; }),
    sel("f-status", tr("Status"), f.status, [["open", tr("Open")]].concat(STATUSES.slice(0, 3).map(([v, l]) => [v, tr(l)])), (v) => { f.status = v; }),
    sel("f-pri", tr("Priority"), f.high ? "high" : "", [["", tr("Any priority")], ["high", tr("High")]], (v) => { f.high = v === "high"; }),
    el("label", { class: "filter grow" }, el("span", { class: "lbl", text: tr("Search tasks") }), q)));
  const cols = el("div", { class: "cols", id: "cols", style: "--n:" + scopesOf(S.ribbon).length });
  sec.append(cols);
  function drawColumns() {
    const needle = f.q.trim().toLowerCase();
    const list = tasksHere().filter((t) => t.status !== "done" && (f.status === "open" || t.status === f.status) && (!f.owner || t.owner === f.owner || t.helper === f.owner)
      && (!f.high || t.priority === "high") && (!needle || (t.title + " " + (t.notes || "") + " " + (t.owner || "")).toLowerCase().includes(needle))).sort(byDue);
    cols.innerHTML = "";
    for (const s of scopesOf(S.ribbon)) {
      const mine = list.filter((t) => t.scope_id === s.scope_id);
      cols.append(el("div", { class: "col", "data-scope": s.slug },
        el("h2", { class: "col-title" }, LANG === "ru" ? s.name_ru : s.name_en, el("span", { class: "count", text: String(mine.length) })),
        mine.length ? el("ul", { class: "tasks" }, mine.map((t) => taskRow(t, { scope: false }))) : el("p", { class: "small empty", text: "—" })));
    }
    const none = $("#team-empty"); if (none) none.remove();
    if (!list.length) cols.before(el("p", { class: "notice", id: "team-empty", text: tr(tasksHere().some((t) => t.status !== "done") ? "Nothing matches these filters." : "Nothing here. Enjoy it, or add a task.") }));
  }
  drawColumns();
}
function renderDone(main) {
  const sec = el("section", { class: "screen", id: "screen-done" }, screenHead(tr("Done"), null));
  main.append(sec);
  if (pending(sec)) return;
  const list = tasksHere().filter((t) => t.status === "done").sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  sec.append(el("p", { class: "small", text: tr("Finished tasks stay here for 60 days.") }));
  if (!list.length) { sec.append(el("p", { class: "notice", id: "done-empty", text: tr("No finished tasks in the last 60 days.") })); return; }
  sec.append(el("ul", { class: "tasks" }, list.map((t) => taskRow(t))));
}
// What a screen shows while the tasks are loading or could not be loaded. → true when it should stop there.
function pending(sec) {
  if (S.err) {
    sec.append(el("p", { class: "notice", role: "alert", id: "doc-err" }, S.err + " ", el("button", { type: "button", class: "btn", onclick: loadTasks, text: tr("Try again") })));
    return true;
  }
  if (!S.doc) { sec.append(el("p", { class: "small", role: "status", id: "doc-loading", text: tr("Loading the tasks…") })); return true; }
  return false;
}

/* ------------------------------------------------------------------- inbox */
async function loadInbox() {
  S.inbox = { list: null, err: null };
  const st = S.inbox;
  try { const r = await api("inbox"); if (S.inbox === st) st.list = r.suggestions || []; }
  catch (e) { if (S.inbox === st) st.err = e.message; }
  if (!S.locked && route().name === "inbox") renderAll();
}
function renderInbox(main) {
  const sec = el("section", { class: "screen", id: "screen-inbox" }, screenHead(tr("Inbox"), null));
  main.append(sec);
  if (pending(sec)) return;
  if (!me().inbox) { location.hash = "#/my"; return; }
  sec.append(el("p", { class: "small", text: tr("Suggestions drafted from emails and calls. Accept one to make it a task, or dismiss it.") }));
  if (!S.inbox) { loadInbox(); }
  const st = S.inbox;
  if (st.err) { sec.append(el("p", { class: "notice", role: "alert" }, st.err + " ", el("button", { type: "button", class: "btn", onclick: () => { S.inbox = null; renderAll(); }, text: tr("Try again") }))); return; }
  if (!st.list) { sec.append(el("p", { class: "small", role: "status", text: tr("Loading the inbox…") })); return; }
  if (!st.list.length) { sec.append(el("p", { class: "notice", id: "inbox-empty", text: tr("The inbox is empty.") })); return; }
  const back = scopesOf("backoffice");
  sec.append(el("ul", { class: "sugs" }, st.list.map((g) => {
    const scope = el("select", { "aria-label": tr("Scope") }, back.map((s) => el("option", { value: String(s.scope_id), selected: s.scope_id === g.scope_id ? true : null, text: LANG === "ru" ? s.name_ru : s.name_en })));
    const decide = async (accept, btn) => {
      btn.disabled = true;
      try {
        const r = await api("inbox_decide", { suggestion_id: g.id, accept, scope_id: accept && !g.task_id ? Number(scope.value) : null });
        st.list = st.list.filter((x) => x.id !== g.id);
        if (S.doc) S.doc.inbox = r.left;
        toast(tr(!accept ? "Dismissed." : g.task_id ? "Added as a comment." : "Added as a task."));
        if (accept) { loadSeq++; try { S.doc = Object.assign(await api("snapshot"), {}); } catch (e) { /* the list is refreshed on the next load */ } }
      } catch (e) { toast(e.message, true); btn.disabled = false; }
      if (!S.locked) renderAll();
    };
    return el("li", { class: "sug", "data-id": g.id },
      el("div", { class: "item", text: g.title || "" }),
      g.note ? el("p", { class: "sug-note", text: g.note }) : null,
      g.next_step ? el("p", { class: "small" }, el("b", { text: tr("Next step") + ": " }), g.next_step) : null,
      el("p", { class: "small" }, tr("From") + ": " + [g.channel === "zoom" ? tr("call") : tr("email"), g.source, g.source_date ? fmtDate(g.source_date) : null].filter(Boolean).join(" · ")),
      g.task_id ? el("p", { class: "small sug-target", text: tr("Adds a comment to: {t}", { t: g.task_title }) }) : null,
      el("div", { class: "sug-act" },
        g.task_id ? null : el("label", { class: "filter" }, el("span", { class: "lbl", text: tr("Scope") }), scope),
        el("button", { type: "button", class: "btn primary accept", onclick: (e) => decide(true, e.currentTarget), text: tr(g.task_id ? "Add as a comment" : "Make it a task") }),
        el("button", { type: "button", class: "btn dismiss", onclick: (e) => decide(false, e.currentTarget), text: tr("Dismiss") })));
  })));
}

/* -------------------------------------------------------------- task panel
   One panel to add a task and to change one. The fields are a form with a Save button; a tick on a saved step and a
   comment go at once. Leaving with unsaved changes asks first. */
function blankForm() {
  return { title: "", scope_id: (scopesOf(S.ribbon)[0] || {}).scope_id, owner: S.name, helper: "", due_on: "", priority: "normal", status: "todo", notes: "", piece_ref: "",
    sensitive: false, clients: [], checklist: [] };
}
function formOf(t) {
  return { title: t.title, scope_id: t.scope_id, owner: t.owner || "", helper: t.helper || "", due_on: t.due_on || "", priority: t.priority, status: t.status, notes: t.notes || "",
    piece_ref: t.piece_ref || "", sensitive: !!t.sensitive, clients: (t.clients || []).map((c) => ({ client_id: c.client_id, name: c.name })),
    checklist: (t.checklist || []).map((c) => ({ item_id: c.item_id, body: c.body, done: c.done })) };
}
async function openTask(id) {
  if (S.panel && S.panel.dirty && !(await confirmLeave())) return;
  if (!id) { S.panel = { task: null, form: blankForm(), busy: false, err: null, dirty: false, found: null }; renderPanel(); return; }
  S.panel = { task: null, form: null, busy: true, err: null, dirty: false, found: null, id };
  renderPanel();
  const p = S.panel;
  try { const t = await api("task", { task_id: id }); if (S.panel !== p) return; p.task = t; p.form = formOf(t); }
  catch (e) { if (S.panel !== p) return; p.err = e.message; }
  p.busy = false;
  renderPanel();
}
function confirmLeave() {
  return confirmBox({ title: tr("Leave without saving?"), body: tr("Your changes to this task are not saved."), ok: tr("Leave"), cancel: tr("Keep editing") });
}
async function closePanel(force) {
  if (!S.panel) return;
  if (!force && S.panel.dirty && !(await confirmLeave())) return;
  S.panel = null;
  const w = $("#task-panel"); if (w) w.remove();
  if (!S.locked) renderAll();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.panel && !$("#confirm-dialog")) { e.preventDefault(); closePanel(); } });
function renderPanel() {
  const old = $("#task-panel");
  const scroll = old ? (old.querySelector(".panel") || {}).scrollTop || 0 : 0;
  if (old) old.remove();
  const p = S.panel;
  if (!p || S.locked) return;
  const t = p.task, f = p.form, isNew = !t && !p.id;
  const ribbon = t ? t.ribbon : S.ribbon;
  const body = el("section", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": isNew ? tr("New task") : (t ? t.title : tr("Tasks")) });
  const wrap = el("div", { class: "panel-wrap", id: "task-panel" }, el("div", { class: "panel-scrim", onclick: () => closePanel() }), body);
  const head = el("div", { class: "panel-head" }, el("h2", { class: "h2", text: isNew ? tr("New task") : tr(RIBBON_NAME[ribbon] || "Tasks") }),
    el("button", { type: "button", class: "btn subtle close", id: "panel-close", "aria-label": tr("Close"), onclick: () => closePanel(), text: "×" }));
  body.append(head);
  document.body.appendChild(wrap);
  if (p.busy && !f) { body.append(el("p", { class: "small", role: "status", text: tr("Loading the tasks…") })); return; }
  if (!f) { body.append(el("p", { class: "notice", role: "alert", id: "panel-err", text: p.err || "" })); return; }
  const touch = () => { p.dirty = true; const b = $("#panel-save"); if (b) b.disabled = false; };
  const field = (label, control, cls) => el("label", { class: "field" + (cls ? " " + cls : "") }, el("span", { class: "lbl", text: label }), control);
  const title = el("input", { type: "text", id: "t-title", maxlength: "200", value: f.title, placeholder: tr("What needs doing?"), oninput: (e) => { f.title = e.target.value; touch(); } });
  const scope = el("select", { id: "t-scope", onchange: (e) => { f.scope_id = Number(e.target.value); touch(); } },
    scopesOf(ribbon).map((s) => el("option", { value: String(s.scope_id), selected: s.scope_id === f.scope_id ? true : null, text: LANG === "ru" ? s.name_ru : s.name_en })));
  // Without the manage right a person may hold the task or hand it to nobody else: the list is the owner as it is, and themselves.
  const names = peopleOf(ribbon);
  const ownerOptions = me().manage ? names.slice() : [S.name];
  if (f.owner && !ownerOptions.includes(f.owner)) ownerOptions.unshift(f.owner);
  const owner = el("select", { id: "t-owner", onchange: (e) => { f.owner = e.target.value; touch(); } },
    (me().manage ? [el("option", { value: "", selected: !f.owner ? true : null, text: tr("Nobody") })] : []).concat(
      ownerOptions.map((n) => el("option", { value: n, selected: n === f.owner ? true : null, text: n }))));
  const helper = el("input", { type: "text", id: "t-helper", maxlength: "80", value: f.helper, placeholder: tr("Anyone helping (optional)"), oninput: (e) => { f.helper = e.target.value; touch(); } });
  const due = el("input", { type: "date", id: "t-due", value: f.due_on, oninput: (e) => { f.due_on = e.target.value; touch(); } });
  const seg = (id, label, value, options, on) => el("div", { class: "field" }, el("span", { class: "lbl", id: id + "-l", text: label }),
    el("div", { class: "seg", id, role: "group", "aria-labelledby": id + "-l" }, options.map(([v, text]) =>
      el("button", { type: "button", class: "btn", "data-v": v, "aria-pressed": v === value ? "true" : "false", onclick: () => { on(v); touch(); renderPanel(); }, text }))));
  const notes = el("textarea", { id: "t-notes", rows: "4", maxlength: "8000", oninput: (e) => { f.notes = e.target.value; touch(); } }); notes.value = f.notes;
  const piece = el("input", { type: "text", id: "t-piece", maxlength: "80", value: f.piece_ref, placeholder: tr("Catalogue reference (optional)"), oninput: (e) => { f.piece_ref = e.target.value; touch(); } });
  const pieceLink = t && t.piece_ref ? el("a", { class: "small link", id: "t-piece-link", href: "../catalogue/#/list?q=" + encodeURIComponent(t.piece_ref), text: tr("Open in the Catalogue") }) : null;

  // checklist: a saved step ticks at once; steps added or removed here go with Save
  const stepRow = (c, i) => {
    const box = el("input", { type: "checkbox", checked: c.done ? true : null, "aria-label": c.body,
      onchange: async (e) => {
        c.done = e.target.checked;
        if (c.item_id && t) {
          try { const r = await api("tick", { item_id: c.item_id, done: c.done }); putTask(r); t.checklist = r.checklist; }
          catch (err) { c.done = !c.done; toast(err.message, true); }
          if (S.panel === p) renderPanel();
        } else touch();
      } });
    return el("li", { class: "step" + (c.done ? " ticked" : "") }, el("label", { class: "step-l" }, box, el("span", { text: c.body })),
      el("button", { type: "button", class: "btn subtle step-x", "aria-label": tr("Remove the step") + ": " + c.body, onclick: () => { f.checklist.splice(i, 1); touch(); renderPanel(); }, text: "×" }));
  };
  const stepIn = el("input", { type: "text", id: "t-step", maxlength: "300", placeholder: tr("Add a step"), "aria-label": tr("Add a step") });
  const addStep = () => { const v = stepIn.value.trim(); if (!v) return; f.checklist.push({ item_id: null, body: v, done: false }); touch(); renderPanel(); const n = $("#t-step"); if (n) n.focus(); };
  stepIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } });
  const checklist = el("div", { class: "field", id: "t-checklist" }, el("span", { class: "lbl", text: tr("Checklist") }),
    f.checklist.length ? el("ul", { class: "steps" }, f.checklist.map(stepRow)) : null,
    el("div", { class: "add-row" }, stepIn, el("button", { type: "button", class: "btn", id: "t-step-add", onclick: addStep, text: tr("Add") })));

  // clients: names and the search only with CRM access
  let clients;
  if (me().crm) {
    const res = el("ul", { class: "found", id: "t-found" });
    const drawFound = () => {
      res.innerHTML = "";
      if (!p.found) return;
      if (!p.found.length) { res.append(el("li", { class: "small", text: tr("No client found.") })); return; }
      for (const c of p.found.filter((x) => !f.clients.some((y) => y.client_id === x.client_id))) {
        res.append(el("li", {}, el("button", { type: "button", class: "btn found-pick", onclick: () => { f.clients.push({ client_id: c.client_id, name: c.name }); p.found = null; touch(); renderPanel(); } },
          el("span", { text: c.name || c.client_id }), el("span", { class: "small", text: c.client_id }))));
      }
    };
    let seq = 0;
    const find = el("input", { type: "search", id: "t-client-q", placeholder: tr("Find a client by name or reference"), "aria-label": tr("Find a client by name or reference"), autocomplete: "off",
      oninput: (e) => {
        const q = e.target.value.trim(), mine = ++seq;
        if (q.length < 2) { p.found = null; drawFound(); return; }
        setTimeout(async () => {
          if (mine !== seq || S.panel !== p) return;
          try { const r = await api("client_search", { q }); if (mine === seq && S.panel === p) { p.found = r.clients || []; drawFound(); } }
          catch (err) { if (mine === seq) toast(err.message, true); }
        }, 250);
      } });
    clients = el("div", { class: "field", id: "t-clients" }, el("span", { class: "lbl", text: tr("Clients") }),
      f.clients.length ? el("ul", { class: "chips" }, f.clients.map((c, i) => el("li", { class: "chip" },
        c.client_id ? el("a", { href: "../crm/#" + encodeURIComponent(c.client_id), title: tr("Open the client's card"), text: c.name || c.client_id }) : el("span", { text: tr("Client attached") }),
        el("button", { type: "button", class: "btn subtle chip-x", "aria-label": tr("Remove the client") + ": " + (c.name || c.client_id), onclick: () => { f.clients.splice(i, 1); touch(); renderPanel(); }, text: "×" })))) : null,
      find, res);
    drawFound();
  } else {
    const n = f.clients.length;
    clients = n ? el("div", { class: "field", id: "t-clients" }, el("span", { class: "lbl", text: tr("Clients") }),
      el("p", { class: "small" }, el("span", { class: "tag info client-tag", text: n === 1 ? tr("Client attached") : tr("{n} clients attached", { n }) }), " ", tr("Client names are shown to people with CRM access."))) : null;
  }
  const sensitive = ribbon === "backoffice" && me().sensitive ? el("label", { class: "check" },
    el("input", { type: "checkbox", id: "t-sensitive", checked: f.sensitive ? true : null, onchange: (e) => { f.sensitive = e.target.checked; touch(); } }), el("span", { text: tr("Sensitive: seen only by those with that right") })) : null;

  const err = el("p", { class: "form-err", role: "alert", id: "panel-err", hidden: p.err ? null : true, text: p.err || "" });
  const save = el("button", { type: "submit", class: "btn primary", id: "panel-save", disabled: p.busy || (!isNew && !p.dirty) ? true : null, text: p.busy ? tr("Saving…") : tr(isNew ? "Add the task" : "Save changes") });
  const archive = t && me().manage ? el("button", { type: "button", class: "btn quiet", id: "panel-archive", onclick: archiveTask, text: tr("Archive") }) : null;
  const form = el("form", { class: "task-form", id: "task-form", novalidate: true, onsubmit: (e) => { e.preventDefault(); saveTask(); } },
    field(tr("Title"), title),
    el("div", { class: "two" }, field(tr("Scope"), scope), field(tr("Owner"), owner)),
    el("div", { class: "two" }, field(tr("Due"), due), field(tr("With"), helper)),
    seg("t-status", tr("Status"), f.status, STATUSES.map(([v, l]) => [v, tr(l)]), (v) => { f.status = v; }),
    seg("t-priority", tr("Priority"), f.priority, [["normal", tr("Normal")], ["high", tr("High")]], (v) => { f.priority = v; }),
    field(tr("Notes"), notes),
    checklist,
    clients,
    el("div", { class: "field" }, el("label", { class: "lbl", for: "t-piece", text: tr("Piece") }), piece, pieceLink),
    sensitive,
    err,
    el("div", { class: "form-foot" }, save, archive));
  body.append(form);

  if (t) {
    if (t.from_board) body.append(el("p", { class: "small from-board" }, tr("From the Weekly Board. Its earlier history is there.") + " ", el("a", { class: "link", href: "../board/", text: tr("Open the Weekly Board") })));
    const cIn = el("textarea", { id: "t-comment", rows: "2", maxlength: "4000", placeholder: tr("Write a comment…"), "aria-label": tr("Add a comment") });
    const send = el("button", { type: "button", class: "btn", id: "t-comment-send", text: tr("Send"),
      onclick: async () => {
        if (!cIn.value.trim()) { cIn.focus(); return; }
        send.disabled = true;
        try { const r = await api("comment", { task_id: t.task_id, body: cIn.value }); if (S.panel !== p) return; p.task = r; putTask(r); renderPanel(); }
        catch (e2) { toast(e2.message, true); send.disabled = false; }
      } });
    body.append(el("div", { class: "comments", id: "t-comments" }, el("h3", { class: "lbl", text: tr("Comments") }),
      (t.comment_list || []).length ? el("ul", { class: "comment-list" }, t.comment_list.map((c) => el("li", { class: "comment" },
        el("div", { class: "small" }, el("b", { text: c.author }), " · " + fmtDate(c.at) + ", " + fmtTime(c.at)), el("p", { text: c.body })))) : el("p", { class: "small", text: tr("No comments yet.") }),
      el("div", { class: "add-row top" }, cIn, send)));
    body.append(el("details", { class: "history", id: "t-history" }, el("summary", { text: tr("History") }),
      el("p", { class: "small", text: tr("Added by {who}, {when}", { who: t.created_by, when: fmtDate(t.created_at) }) }),
      el("ul", {}, (t.history || []).map((h) => el("li", { class: "small", text: fmtDate(h.at) + ", " + fmtTime(h.at) + " · " + h.actor + " · " + tr(h.action)
        + (h.what && h.what.changed ? ": " + h.what.changed.filter((x) => x !== "created").join(", ") : "") })))));
  }
  body.scrollTop = scroll;
  if (isNew && !p.dirty && !touchDevice()) setTimeout(() => { const n = $("#t-title"); if (n) n.focus(); }, 30);
}
async function saveTask() {
  const p = S.panel;
  if (!p || p.busy) return;
  const f = p.form, t = p.task;
  if (!f.title.trim()) { p.err = tr("Give the task a title."); renderPanel(); const n = $("#t-title"); if (n) { markInvalid(n, true); n.focus(); } return; }
  const out = { title: f.title, scope_id: f.scope_id, owner: f.owner, helper: f.helper, due_on: f.due_on, priority: f.priority, status: f.status, notes: f.notes, piece_ref: f.piece_ref,
    checklist: f.checklist.map((c) => ({ item_id: c.item_id, body: c.body, done: c.done })) };
  if (t) out.task_id = t.task_id;
  if (me().crm) out.clients = f.clients.map((c) => c.client_id).filter(Boolean);
  if ((t ? t.ribbon : S.ribbon) === "backoffice" && me().sensitive) out.sensitive = f.sensitive;
  p.busy = true; p.err = null;
  renderPanel();
  try {
    const r = await api("save", { task: out });
    if (S.panel !== p) return;
    putTask(r);
    toast(tr(t ? "Saved." : "Task added."));
    S.panel = null;
    const w = $("#task-panel"); if (w) w.remove();
    renderAll();
  } catch (e) {
    if (S.panel !== p) return;
    p.busy = false; p.err = e.message;
    renderPanel();
  }
}
async function archiveTask() {
  const p = S.panel;
  if (!p || !p.task) return;
  if (!(await confirmBox({ title: tr("Archive this task?"), body: tr("It leaves every list. It is kept, and a manager can restore it."), ok: tr("Archive") }))) return;
  try { putTask(await api("archive", { task_id: p.task.task_id, on: true })); toast(tr("Archived.")); closePanel(true); }
  catch (e) { toast(e.message, true); }
}

/* ------------------------------------------------------------------ routes
   #/my (default)  #/team  #/done  #/inbox */
const ROUTES = { my: renderMy, team: renderTeam, done: renderDone, inbox: renderInbox };
function route() {
  const m = /^#\/([a-z]+)/.exec(location.hash || "");
  return { name: m && ROUTES[m[1]] ? m[1] : "my" };
}
window.addEventListener("hashchange", () => { if (!S.locked) renderAll(); });

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "kit-lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", class: "kit-hbtn", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
// A phone gets a slim header: the navy bar keeps the wordmark, the tool name and a menu button; tools, language and
// lock sit behind that button; the tabs stay on one row that swipes; the ribbon switch moves under them.
const PHONE_MQ = window.matchMedia("(max-width: 599px)");
const isPhone = () => PHONE_MQ.matches;
PHONE_MQ.addEventListener("change", () => { S.menuOpen = false; if (!S.locked) renderAll(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && S.menuOpen) { S.menuOpen = false; renderAll(); const b = $("#menu-btn"); if (b) b.focus(); } });
function ribbonSwitch() {
  const rs = ribbons();
  if (rs.length < 2) return null;
  return el("div", { class: "seg ribbon-switch", id: "ribbon-switch", role: "group", "aria-label": tr("Ribbon") }, rs.map((r) =>
    el("button", { type: "button", class: "btn", "data-ribbon": r, "aria-pressed": S.ribbon === r ? "true" : "false", onclick: () => setRibbon(r), text: tr(RIBBON_NAME[r]) })));
}
function renderHeader() {
  const r = route().name, phone = isPhone();
  const tab = (name, label, n) => el("a", { class: "kit-tab", href: "#/" + name, id: "tab-" + name, "aria-current": r === name ? "page" : null }, tr(label), n ? el("span", { class: "count", text: String(n) }) : null);
  const staff = S.token ? el("span", { class: "kit-staff" + (phone ? "" : " hide-sm"), title: S.name, text: S.name }) : null;
  const lock = S.token ? el("button", { class: "kit-hbtn", type: "button", onclick: lockNow, text: tr("Lock") }) : null;
  const open = phone && S.menuOpen;
  const menuBtn = phone ? el("button", { class: "kit-hbtn menu-btn", id: "menu-btn", type: "button", "aria-label": tr("Menu"), "aria-expanded": open ? "true" : "false", "aria-controls": "head-menu",
    onclick: () => { S.menuOpen = !S.menuOpen; renderAll(); const b = $("#menu-btn"); if (b) b.focus(); } }, el("span", { class: "menu-bars", "aria-hidden": "true" })) : null;
  const menu = open ? el("div", { class: "head-menu", id: "head-menu" }, staff, kitToolsMenu("tasks", LANG), langSwitch(), lock) : null;
  if (menu) menu.addEventListener("click", (ev) => { if (ev.target.closest("button, a") && !ev.target.closest(".kit-tool-wrap > button")) S.menuOpen = false; }, true);
  const mineOpen = S.doc ? tasksHere().filter((t) => t.status !== "done" && (t.owner === S.name || t.helper === S.name)).length : 0;
  const sw = ribbonSwitch();
  const nav = el("nav", { class: "kit-tabs", "aria-label": tr("Tasks") },
    tab("my", "My tasks", mineOpen), tab("team", "Team"), tab("done", "Done"),
    me().inbox && S.ribbon === "backoffice" ? tab("inbox", "Inbox", S.doc ? S.doc.inbox : 0) : null,
    phone ? null : [el("span", { class: "kit-spacer" }), sw]);
  const top = el("header", { class: "top" + (phone ? " phone" : "") + (open ? " open" : "") },
    el("div", { class: "kit-head" },
      el("a", { class: "kit-brand", href: "../" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })),
      el("span", { class: "kit-rule", "aria-hidden": "true" }),
      el("span", { class: "kit-tool", text: tr("Tasks") }),
      el("span", { class: "kit-spacer" }),
      phone ? menuBtn : [kitToolsMenu("tasks", LANG), langSwitch(), staff, lock]),
    menu, nav);
  const bar = phone && sw ? el("div", { class: "period-bar", id: "ribbon-bar" }, sw) : null;
  if (phone) requestAnimationFrame(() => { const a = nav.querySelector('[aria-current="page"]'); if (a) nav.scrollLeft = Math.max(0, a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2); });
  return [top, bar].filter(Boolean);
}

/* -------------------------------------------------------------------- gate */
function renderGate() {
  const old = $("#gate");
  if (old) old.remove();
  if (!S.locked) return;
  const pass = el("input", { type: "password", id: "gate-pass", autocomplete: "current-password" });
  const msg = S.gateMessage;
  const err = el("p", { class: "err", role: "alert", hidden: msg ? null : true, text: msg ? tr(msg) : "" });
  const btn = el("button", { class: "btn primary", type: "submit", text: tr("Unlock") });
  const submit = async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    if (!pass.value.trim()) { err.textContent = tr("Enter your passcode."); err.hidden = false; return; }
    btn.disabled = true; btn.textContent = tr("Checking…");
    try {
      const r = await api("unlock", { passcode: pass.value });
      S.token = r.token; S.name = r.name; S.expires_at = r.expires_at;
      sstore(SESSION_KEY, JSON.stringify({ token: r.token, name: r.name, expires_at: r.expires_at }));
      S.locked = false; S.gateMessage = null;
      activeNow();
      renderGate();
      toast(tr("Welcome, {name}", { name: r.name }));
      await loadTasks();
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      btn.disabled = false; btn.textContent = tr("Unlock");
      pass.value = ""; pass.focus();
    }
  };
  const card = el("form", { class: "gate-card", onsubmit: submit },
    el("div", { class: "gate-mast" },
      el("div", { class: "gate-brand" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi" }), el("span", { text: tr("Boutique tools") })),
      langSwitch()),
    err,
    el("label", { for: "gate-pass" }, el("span", { class: "lbl", text: tr("Passcode") }), pass),
    btn,
    el("p", { class: "gate-foot small", text: tr("Opens the task tracker") }));
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, card));
  const app = $("#app");
  app.classList.add("gated");
  app.setAttribute("aria-hidden", "true");
  app.inert = true;
  setTimeout(() => pass.focus(), 60);
}
// Drop the token and ask for the passcode again. No task stays in memory or on screen behind the card.
function lockDown(message) {
  S.token = null;
  sstore(SESSION_KEY, null);
  sstore(ACTIVE_KEY, null);
  S.locked = true;
  S.gateMessage = message || null;
  loadSeq++;
  S.doc = null; S.err = null; S.panel = null; S.inbox = null; S.menuOpen = false;
  S.filters = { owner: "", status: "open", high: false, q: "" };
  kitCloseMenus();
  document.querySelectorAll(".modal-wrap, .panel-wrap").forEach((n) => n.remove());
  $("#app").innerHTML = "";
  renderGate();
}
function lockNow() { lockDown(); toast(tr("Locked.")); }

/* --------------------------------------------------------------- idle lock
   Touch devices only: an iPad left on the counter for 15 minutes asks for the
   passcode again. The filters on screen are kept. */
let lastActive = Date.now(), lastSaved = 0;
function markActive() {
  lastActive = Date.now();
  if (!S.locked && lastActive - lastSaved > 20000) { lastSaved = lastActive; sstore(ACTIVE_KEY, lastActive); }
}
function activeNow() { lastActive = lastSaved = Date.now(); sstore(ACTIVE_KEY, lastActive); }
["pointerdown", "keydown", "touchstart", "wheel", "input"].forEach((ev) =>
  window.addEventListener(ev, markActive, { passive: true, capture: true }));
function idleCheck() {
  if (S.locked || !S.token || !touchDevice()) return;
  if (Date.now() - lastActive >= IDLE_MIN * 60000) lockDown(tr("Locked after {n} minutes without use.", { n: IDLE_MIN }));
}
setInterval(idleCheck, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { if (!S.locked) sstore(ACTIVE_KEY, lastActive); return; }
  idleCheck();
});
window.addEventListener("pageshow", (e) => { if (e.persisted) idleCheck(); });

/* -------------------------------------------------------------------- init */
function renderAll() {
  const app = $("#app");
  document.documentElement.lang = LANG;
  document.title = "Delardi " + tr("Tasks");
  if (S.locked) return;                            // nothing behind the gate
  const r = route();
  kitCloseMenus();
  const y = window.scrollY;
  app.innerHTML = "";
  app.classList.remove("gated"); app.setAttribute("aria-hidden", "false"); app.inert = false;
  const main = el("main", { id: "main" });
  app.append(...renderHeader(), main);
  ROUTES[r.name](main);
  const sec = main.querySelector(".screen"), mark = sec && typeof seasonMarkEl === "function" ? seasonMarkEl("flake") : null;
  if (mark) { sec.classList.add("in-season"); sec.prepend(mark); }
  window.scrollTo(0, y);
}
function restoreSession() {
  try {
    const s = JSON.parse(sstore(SESSION_KEY) || "null");
    if (!s || !s.token || new Date(s.expires_at).getTime() <= Date.now()) return false;
    const last = Number(sstore(ACTIVE_KEY) || 0);
    if (touchDevice() && last && Date.now() - last >= IDLE_MIN * 60000) { sstore(SESSION_KEY, null); return false; }
    S.token = s.token; S.name = s.name; S.expires_at = s.expires_at;
    return true;
  } catch (e) { return false; }
}

(async function boot() {
  document.documentElement.lang = LANG;
  if (restoreSession()) {
    S.locked = false; activeNow();
    await loadTasks();                             // a session that is no longer good locks the page from inside api()
    if (!S.locked && S.doc && S.doc.me) S.name = S.doc.me.name;
  }
  if (S.locked) $("#app").innerHTML = "";
  renderAll();
  renderGate();
})();
