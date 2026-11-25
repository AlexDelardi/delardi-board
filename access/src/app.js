/* ===========================================================================
   Delardi Access — the page. People, their rights and their passcodes, and who
   signs in to what. For the holder of the "manage access" right only.
   The page talks to access-api only; who may do what is decided there and in
   the database, and what it refuses is shown as it is said.
   Nothing is kept behind the passcode card: everything is dropped on lock, and
   a passcode that was shown is never kept in the page's state.
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/access-api";
const LOGO_WORDMARK = "__WORDMARK__";
const SESSION_KEY = "access_session";     // sessionStorage: gone when the tab closes
const ACTIVE_KEY = "access_last_active";  // sessionStorage: last touch, for the idle lock
const LANG_KEY = "delardi_lang";          // shared with the landing page
const IDLE_MIN = 15;                      // touch devices only

/* ------------------------------------------------------------------ rights
   The switches, grouped by tool, in the order of the matrix. The keys are the database's; the words are the page's. */
const GROUPS = [
  ["Clients", [
    ["can_view_crm", "See clients", "Open the CRM: client list, client cards, phone numbers."],
    ["can_edit_crm", "Edit clients", "Add and change clients, notes, contact log, owners."],
    ["can_view_all_cockpits", "See every rep's cockpit", "Choose whose cockpit to look at. Without it a person sees only their own."],
    ["can_export_crm", "Export to Excel", "Download the client list and birthday lists."],
    ["can_import_crm", "Colibri import", "Load the Colibri client and purchase files."]]],
  ["Catalogue", [
    ["can_view_catalogue", "See the Catalogue", "Browse pieces and prices, build a selection."],
    ["can_manage_catalogue", "Manage the Catalogue", "Completeness sort, to-be-confirmed filter, error reports."]]],
  ["Sales", [
    ["can_view_sales", "See tickets", "Open the till and look up past tickets."],
    ["can_post_sales", "Sell", "Post a sale, suspend and resume."],
    ["can_void_sales", "Void a sale", "Cancel a posted ticket."],
    ["can_refund_sales", "Refund a sale", "Return against an earlier ticket. Not built yet."],
    ["can_manage_till", "Manage the till", "Switch Training and Live, clear test sales."]]],
  ["Stock", [
    ["can_view_stock", "See stock", "Pieces list, piece card, review queue."],
    ["can_manage_stock", "Manage stock", "Reserve, book out, corrections, reviews, import."],
    ["can_view_cost", "See cost and margin", "Invoice price, landed cost, margin. Never for the floor."]]],
  ["Performance", [
    ["can_view_performance", "See Performance", "Monthly figures, plan, incentive estimate."]]],
  ["Tasks", [
    ["can_use_floor_tasks", "Shop floor tasks", "See and work the Shop floor ribbon."],
    ["can_use_backoffice_tasks", "Backoffice tasks", "See and work the Backoffice ribbon."],
    ["can_manage_tasks", "Assign and archive", "Give a task to someone else, archive tasks."],
    ["can_view_sensitive", "See sensitive topics", "Backoffice tasks marked sensitive."],
    ["can_view_email_suggestions", "Suggestions inbox", "Task suggestions drafted from emails and calls."]]],
  ["Access", [
    ["can_manage_access", "Manage access", "This tool: people, rights and passcodes."],
    ["can_view_logins", "See the login log", "Who signed in to what, in this tool."],
    ["can_view_board", "Old Weekly Board", "The retired Board, kept for reference."]]],
];
const RIGHT_LABEL = Object.fromEntries(GROUPS.flatMap(([, rs]) => rs.map(([k, l]) => [k, l])));
const TOOL_NAME = { sales: "Sales", stock: "Stock", crm: "Clients", catalogue: "Catalogue", tasks: "Tasks", perf: "Performance", access: "Access", board: "Old Weekly Board", other: "Other" };

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  "Access": "Доступ", "People": "Люди", "Rights": "Права", "Logins": "Входы",
  "All tools": "Все инструменты", "Language": "Язык", "Lock": "Заблокировать", "Menu": "Меню", "Boutique tools": "Инструменты бутика",
  "Passcode": "Код доступа", "Unlock": "Открыть", "Checking…": "Проверяю…", "Enter your passcode.": "Введите код доступа.",
  "Opens the Access tool": "Открывает управление доступом", "Welcome, {name}": "Здравствуйте, {name}", "Locked.": "Заблокировано.",
  "Locked after {n} minutes without use.": "Заблокировано: {n} минут без действий.",
  "That passcode is not right.": "Код доступа неверный.", "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "This account does not have access to the Access tool.": "У этой учётной записи нет доступа к управлению доступом.",
  "This account does not have access to the login log.": "У этой учётной записи нет доступа к журналу входов.",
  "That session is not valid. Enter your passcode again.": "Сессия недействительна. Введите код доступа ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сессия истекла. Введите код доступа ещё раз.",
  "Something went wrong on the server.": "На сервере что-то пошло не так.",
  "The server did not answer. Try again.": "Сервер не ответил. Попробуйте ещё раз.", "No connection. Check the Wi-Fi and try again.": "Нет соединения. Проверьте Wi-Fi и попробуйте ещё раз.",
  "Request failed ({n})": "Запрос не выполнен ({n})", "Try again": "Повторить", "Loading…": "Загружаю…",
  "Yes": "Да", "Cancel": "Отмена", "Close": "Закрыть", "Save": "Сохранить", "Saving…": "Сохраняю…", "Saved.": "Сохранено.", "Copy": "Копировать", "Copied.": "Скопировано.",
  // people
  "+ Add a person": "+ Добавить человека", "Switched off": "Отключены", "Switched off ({n})": "Отключены ({n})", "Active": "Активен", "Test login": "Тестовый вход",
  "No role": "Роль не указана", "Sales rep: {r}": "Продавец: {r}", "Last sign-in {d}": "Последний вход {d}", "No sign-in on record": "Входов не записано",
  "Passcode can be looked up": "Код можно посмотреть", "Passcode set earlier": "Код задан ранее",
  "Name": "Имя", "Role": "Роль", "Sales rep name": "Имя продавца", "Sales rep name in the CRM": "Имя продавца в CRM",
  "The name this person has as a sales rep and client owner in the CRM. Leave empty if they are not a rep.": "Имя, под которым человек значится продавцом и ответственным за клиентов в CRM. Оставьте пустым, если он не продавец.",
  "Start with the rights of": "Взять права как у", "Nobody: no rights": "Ни у кого: без прав",
  "Add a person": "Добавить человека", "Add": "Добавить", "Adding…": "Добавляю…", "A passcode is generated for them.": "Код доступа будет создан автоматически.",
  "The name cannot be changed later: it goes on this person's tickets, tasks and notes.": "Имя нельзя будет изменить: оно остаётся на чеках, задачах и заметках этого человека.",
  "Give the person a name.": "Укажите имя.", "There is already a person with that name.": "Человек с таким именем уже есть.",
  "A name cannot be changed: it is on this person's tickets, tasks and notes. Switch the person off and add a new one.": "Имя изменить нельзя: оно стоит на чеках, задачах и заметках этого человека. Отключите его и добавьте нового.",
  "That person was not found.": "Человек не найден.",
  "Switch off": "Отключить", "Switch on": "Включить", "Switch {name} off?": "Отключить: {name}?", "Switch {name} on?": "Включить: {name}?",
  "They are signed out at once and cannot sign in. Their rights are kept, and their name stays on tickets, tasks and notes.": "Человек сразу выйдет из системы и не сможет войти. Права сохраняются, имя остаётся на чеках, задачах и заметках.",
  "They can sign in again with their passcode and the rights they had.": "Человек снова сможет входить со своим кодом и прежними правами.",
  "{name} is switched off.": "{name}: отключён.", "{name} is switched on.": "{name}: включён.", "You cannot switch yourself off.": "Себя отключить нельзя.",
  "This is you.": "Это вы.", "{n} of {m} rights": "Прав: {n} из {m}", "See rights": "Права",
  // passcodes
  "This passcode was set before this tool and cannot be shown. A new one can be issued.": "Этот код задан до появления инструмента, показать его нельзя. Можно выдать новый.",
  "Set {d}. It can be looked up here; each look is recorded.": "Задан {d}. Его можно посмотреть здесь; каждый просмотр записывается.",
  "Show passcode": "Показать код", "New passcode": "Новый код", "Hide": "Скрыть",
  "A new passcode for {name}?": "Новый код для: {name}?", "The current passcode stops working at once and they are signed out everywhere.": "Текущий код сразу перестанет работать, человек выйдет из системы везде.",
  "Issue it": "Выдать", "Passcode for {name}": "Код доступа: {name}", "New passcode for {name}": "Новый код доступа: {name}",
  "Give it to them now. You can look it up again on their card.": "Передайте его сейчас. Позже код можно посмотреть в карточке человека.",
  "This is your own passcode, and you are signed out now. Note it before you close this: you will need it to sign in again.": "Это ваш собственный код доступа, и вы уже вышли из системы. Запишите его до закрытия окна: он понадобится для входа.",
  "Sign in with your new passcode.": "Войдите с новым кодом доступа.",
  "{name} is added.": "{name}: добавлен.",
  "Passcodes cannot be issued or shown yet: the passcode key is not set up.": "Коды пока нельзя выдавать и показывать: ключ для кодов не настроен.",
  "This passcode was set earlier and cannot be shown. Issue a new one.": "Этот код задан ранее, показать его нельзя. Выдайте новый.",
  "This passcode can no longer be shown. Issue a new one.": "Этот код больше нельзя показать. Выдайте новый.",
  "That passcode is already in use. Generate another.": "Такой код уже используется. Создайте другой.",
  // rights
  "Person": "Человек", "Right": "Право", "Tool": "Инструмент", "On": "Вкл", "Off": "Выкл",
  "Tap a cell to switch a right on or off. It takes effect at once.": "Нажмите на ячейку, чтобы включить или выключить право. Изменение действует сразу.",
  "{name}: {right} is on.": "{name}: «{right}» включено.", "{name}: {right} is off.": "{name}: «{right}» выключено.",
  "You cannot remove your own access to this tool. Ask for it to be done for you.": "Нельзя убрать собственный доступ к этому инструменту. Попросите сделать это за вас.",
  "You cannot remove your own access to this tool.": "Собственный доступ к этому инструменту убрать нельзя.",
  "That is not a right this tool manages.": "Этим правом инструмент не управляет.",
  "History": "История", "No changes yet.": "Изменений пока нет.", "The latest {n} changes.": "Последние изменения: {n}.",
  "added": "добавлен", "switched on": "включён", "switched off": "отключён", "new passcode": "новый код", "passcode looked up": "просмотр кода", "empty": "пусто",
  // rights and tools
  "Clients": "Клиенты", "Catalogue": "Каталог", "Sales": "Продажи", "Stock": "Склад", "Performance": "Показатели", "Tasks": "Задачи", "Old Weekly Board": "Старая доска", "Other": "Другое",
  "See clients": "Видеть клиентов", "Edit clients": "Изменять клиентов", "See every rep's cockpit": "Видеть кабинеты всех продавцов", "Export to Excel": "Выгрузка в Excel", "Colibri import": "Импорт из Colibri",
  "See the Catalogue": "Видеть каталог", "Manage the Catalogue": "Управлять каталогом", "See tickets": "Видеть чеки", "Sell": "Продавать", "Void a sale": "Отменять продажу",
  "Refund a sale": "Оформлять возврат", "Manage the till": "Управлять кассой", "See stock": "Видеть склад", "Manage stock": "Управлять складом", "See cost and margin": "Видеть себестоимость и маржу",
  "See Performance": "Видеть показатели", "Shop floor tasks": "Задачи бутика", "Backoffice tasks": "Задачи бэк-офиса", "Assign and archive": "Назначать и архивировать",
  "See sensitive topics": "Видеть закрытые темы", "Suggestions inbox": "Входящие предложения", "Manage access": "Управлять доступом", "See the login log": "Видеть журнал входов",
  "Open the CRM: client list, client cards, phone numbers.": "CRM: список клиентов, карточки, телефоны.",
  "Add and change clients, notes, contact log, owners.": "Добавлять и изменять клиентов, заметки, контакты, ответственных.",
  "Choose whose cockpit to look at. Without it a person sees only their own.": "Выбирать, чей кабинет смотреть. Без этого права виден только свой.",
  "Download the client list and birthday lists.": "Скачивать список клиентов и списки дней рождения.",
  "Load the Colibri client and purchase files.": "Загружать файлы клиентов и покупок из Colibri.",
  "Browse pieces and prices, build a selection.": "Смотреть изделия и цены, собирать подборку.",
  "Completeness sort, to-be-confirmed filter, error reports.": "Сортировка по полноте, фильтр «уточняется», сообщения об ошибках.",
  "Open the till and look up past tickets.": "Открывать кассу и искать прошлые чеки.",
  "Post a sale, suspend and resume.": "Проводить продажу, откладывать и возобновлять.",
  "Cancel a posted ticket.": "Отменять проведённый чек.",
  "Return against an earlier ticket. Not built yet.": "Возврат по прошлому чеку. Пока не сделано.",
  "Switch Training and Live, clear test sales.": "Переключать обучение и боевой режим, очищать тестовые продажи.",
  "Pieces list, piece card, review queue.": "Список изделий, карточка изделия, очередь проверок.",
  "Reserve, book out, corrections, reviews, import.": "Резерв, выдача, исправления, проверки, импорт.",
  "Invoice price, landed cost, margin. Never for the floor.": "Цена по инвойсу, себестоимость, маржа. Не для торгового зала.",
  "Monthly figures, plan, incentive estimate.": "Месячные цифры, план, оценка мотивации.",
  "See and work the Shop floor ribbon.": "Видеть и вести задачи бутика.",
  "See and work the Backoffice ribbon.": "Видеть и вести задачи бэк-офиса.",
  "Give a task to someone else, archive tasks.": "Передавать задачу другому, убирать в архив.",
  "Backoffice tasks marked sensitive.": "Задачи бэк-офиса с отметкой «закрытая».",
  "Task suggestions drafted from emails and calls.": "Предложения задач из писем и звонков.",
  "This tool: people, rights and passcodes.": "Этот инструмент: люди, права и коды.",
  "Who signed in to what, in this tool.": "Кто и куда входил — в этом инструменте.",
  "The retired Board, kept for reference.": "Доска, выведенная из работы; оставлена для справки.",
  // logins
  "Last {n} days": "Последние {n} дней", "Period": "Период", "Sign-ins by person and tool": "Входы по людям и инструментам", "Last sign-in": "Последний вход", "Total": "Всего",
  "Latest sign-ins": "Последние входы", "When": "Когда", "No sign-ins in this period.": "За этот период входов нет.",
  "The log starts on {d}. Test logins are left out.": "Журнал ведётся с {d}. Тестовые входы не учитываются.",
  "A dash means no sign-in; a grey cell means the person has no right to that tool.": "Прочерк — входов не было; серая ячейка — у человека нет права на этот инструмент.",
  "never": "ни разу",
};
const PL = {
  right: { en: ["right", "rights"], ru: ["право", "права", "прав"] },
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
  doc: null, err: null,              // the snapshot: me, rights, people, history, passcode_key
  panel: null,                       // { person (null: adding), form, busy, err, dirty }
  who: null,                         // the Rights screen on a narrow screen: whose rights are listed
  busy: {},                          // "person|right" → true while that switch is being saved
  logins: null,                      // { days, data, err } once asked for
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
    // A lost session locks the page, and so does lost access (403): a right taken away mid-session must not leave the
    // people already loaded, or an open panel, readable behind an error message.
    if ((res.status === 401 || res.status === 403) && action !== "unlock") lockDown(data.error);
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

/* ---------------------------------------------------------------- the data
   One snapshot holds people, rights and history. A change answers with the person as they now stand, who is put back
   into the snapshot; the history is re-read after a change so the list under the matrix stays true. */
const me = () => (S.doc && S.doc.me) || {};
const allPeople = () => (S.doc && S.doc.people) || [];
const activePeople = () => allPeople().filter((p) => p.active && !p.test);
const offPeople = () => allPeople().filter((p) => !p.active || p.test);
const rightKeys = () => GROUPS.flatMap(([, rs]) => rs.map(([k]) => k)).filter((k) => !S.doc || S.doc.rights.includes(k));
const isMe = (p) => p && p.person_id === me().person_id;
const rightsOn = (p) => rightKeys().filter((k) => p.rights[k]).length;

let loadSeq = 0;
async function loadDoc(quiet) {
  const seq = ++loadSeq;
  if (!quiet) { S.err = null; renderAll(); }
  try {
    const d = await api("snapshot");
    if (seq !== loadSeq || S.locked) return;
    S.doc = d; S.err = null;
  } catch (e) {
    if (seq !== loadSeq || S.locked) return;
    if (!quiet) S.err = e.message;
  }
  // an open panel is not redrawn (a passcode may be on show in it); it only keeps its person current
  if (S.panel && S.panel.person) { const p = allPeople().find((x) => x.person_id === S.panel.person.person_id); if (p) S.panel.person = p; }
  renderAll();
}
function putPerson(p) {
  if (!S.doc || !p) return;
  const i = S.doc.people.findIndex((x) => x.person_id === p.person_id);
  if (i >= 0) S.doc.people[i] = p; else S.doc.people.push(p);
}
// parent.append() writes null and arrays as text; this skips the former and flattens the latter.
function put(parent, ...kids) {
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) parent.append(k);
  return parent;
}
function screenHead(title, aside) {
  return el("div", { class: "screen-head" }, el("h1", { class: "title", text: title }), aside ? el("div", { class: "aside" }, aside) : null);
}
// What a screen shows while the data is loading or could not be loaded. → true when it should stop there.
function pending(sec) {
  if (S.err) {
    sec.append(el("p", { class: "notice", role: "alert", id: "doc-err" }, S.err + " ", el("button", { type: "button", class: "btn", onclick: () => loadDoc(), text: tr("Try again") })));
    return true;
  }
  if (!S.doc) { sec.append(el("p", { class: "small", role: "status", id: "doc-loading", text: tr("Loading…") })); return true; }
  return false;
}
const noKeyNote = () => (S.doc && S.doc.passcode_key === false
  ? el("p", { class: "notice", id: "no-key", role: "note", text: tr("Passcodes cannot be issued or shown yet: the passcode key is not set up.") }) : null);

/* ------------------------------------------------------------------ people */
function personCard(p) {
  const meta = [
    el("span", { class: "meta-bit", text: p.role || tr("No role") }),
    p.rep ? el("span", { class: "meta-bit", text: tr("Sales rep: {r}", { r: p.rep }) }) : null,
    el("span", { class: "meta-bit", text: p.last_login ? tr("Last sign-in {d}", { d: fmtDate(p.last_login) }) : tr("No sign-in on record") }),
    el("span", { class: "meta-bit", text: tr("{n} of {m} rights", { n: rightsOn(p), m: rightKeys().length }) }),
  ];
  const tags = [
    isMe(p) ? el("span", { class: "tag info", text: tr("This is you.") }) : null,
    p.test ? el("span", { class: "tag line", text: tr("Test login") }) : null,
    !p.active ? el("span", { class: "tag line", text: tr("Switched off") }) : null,
    el("span", { class: "tag " + (p.passcode === "viewable" ? "info" : "line"), text: tr(p.passcode === "viewable" ? "Passcode can be looked up" : "Passcode set earlier") }),
  ];
  return el("li", { class: "person" + (p.active ? "" : " is-off"), "data-id": p.person_id },
    el("button", { type: "button", class: "person-open", "aria-label": p.name, onclick: () => openPerson(p.person_id) },
      el("span", { class: "item person-name", text: p.name }),
      el("span", { class: "person-meta" }, meta),
      el("span", { class: "person-meta" }, tags)));
}
function renderPeople(main) {
  const sec = el("section", { class: "screen", id: "screen-people" },
    screenHead(tr("People"), S.doc ? el("button", { type: "button", class: "btn primary", id: "add-person", onclick: () => openPerson(null), text: tr("+ Add a person") }) : null));
  main.append(sec);
  if (pending(sec)) return;
  put(sec, noKeyNote(), el("ul", { class: "people", id: "people-on" }, activePeople().map(personCard)));
  const off = offPeople();
  if (off.length) sec.append(el("details", { class: "off-box", id: "people-off" }, el("summary", { text: tr("Switched off ({n})", { n: off.length }) }), el("ul", { class: "people" }, off.map(personCard))));
}

/* ------------------------------------------------------------ person panel
   One panel to add a person and to change one. Role and sales rep name are a form with a Save button; switching off
   and passcodes act at once, each after a question. A passcode on screen lives in the panel's own nodes only. */
function openPerson(id) {
  if (id) {
    const p = allPeople().find((x) => x.person_id === id);
    if (!p) return;
    S.panel = { person: p, form: { role: p.role || "", rep: p.rep || "" }, busy: false, err: null, dirty: false };
  } else {
    S.panel = { person: null, form: { name: "", role: "", rep: "", copy_from: "" }, busy: false, err: null, dirty: false };
  }
  renderPanel();
}
function closePanel() {
  S.panel = null;
  const h = $("#person-panel"); if (h) h.remove();
}
function codeBox(code, id) {
  const out = el("output", { class: "code", id, text: code });
  return el("div", { class: "code-row" }, out,
    el("button", { type: "button", class: "btn", id: id + "-copy", text: tr("Copy"), onclick: async () => {
      try { await navigator.clipboard.writeText(code); toast(tr("Copied.")); }
      catch (e) { const r = document.createRange(); r.selectNodeContents(out); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    } }));
}
function renderPanel() {
  const old = $("#person-panel");
  if (old) old.remove();
  const P = S.panel;
  if (!P || S.locked) return;
  const p = P.person, f = P.form, adding = !p;
  const touch = () => { P.dirty = true; const b = $("#panel-save"); if (b) b.disabled = false; };
  const field = (label, input, hint) => el("label", { class: "field" }, el("span", { class: "lbl", text: label }), input, hint ? el("span", { class: "small hint", text: hint }) : null);
  const role = el("input", { type: "text", id: "p-role", maxlength: "80", value: f.role, autocomplete: "off", oninput: (e) => { f.role = e.target.value; touch(); } });
  const rep = el("input", { type: "text", id: "p-rep", maxlength: "40", value: f.rep, autocomplete: "off", oninput: (e) => { f.rep = e.target.value; touch(); } });
  const err = el("p", { class: "form-err", id: "panel-err", role: "alert", hidden: P.err ? null : true, text: P.err || "" });
  let body;
  if (adding) {
    const name = el("input", { type: "text", id: "p-name", maxlength: "60", value: f.name, autocomplete: "off", oninput: (e) => { f.name = e.target.value; touch(); markInvalid(e.target, false); } });
    const copy = el("select", { id: "p-copy", onchange: (e) => { f.copy_from = e.target.value; touch(); } },
      [el("option", { value: "", text: tr("Nobody: no rights") })].concat(activePeople().map((x) => el("option", { value: x.person_id, selected: f.copy_from === x.person_id ? true : null, text: x.name }))));
    body = el("form", { class: "person-form", id: "person-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); addPerson(); } },
      field(tr("Name"), name, tr("The name cannot be changed later: it goes on this person's tickets, tasks and notes.")),
      field(tr("Role"), role),
      field(tr("Sales rep name in the CRM"), rep, tr("The name this person has as a sales rep and client owner in the CRM. Leave empty if they are not a rep.")),
      field(tr("Start with the rights of"), copy),
      el("p", { class: "small", text: tr("A passcode is generated for them.") }),
      err,
      el("div", { class: "form-foot" }, el("button", { type: "submit", class: "btn primary", id: "panel-save", disabled: P.busy ? true : null, text: tr(P.busy ? "Adding…" : "Add") })));
  } else {
    const mine = isMe(p);
    const pass = el("div", { class: "pass-box", id: "pass-box" },
      el("span", { class: "lbl", text: tr("Passcode") }),
      el("p", { class: "small", id: "pass-state", text: p.passcode === "viewable" ? tr("Set {d}. It can be looked up here; each look is recorded.", { d: fmtDate(p.passcode_set_at) })
        : tr("This passcode was set before this tool and cannot be shown. A new one can be issued.") }),
      el("div", { id: "pass-shown" }),
      el("div", { class: "pass-act" },
        p.passcode === "viewable" ? el("button", { type: "button", class: "btn", id: "pass-show", onclick: showPasscode, text: tr("Show passcode") }) : null,
        el("button", { type: "button", class: "btn", id: "pass-new", onclick: newPasscode, text: tr("New passcode") })));
    body = [
      el("div", { class: "person-meta panel-tags" },
        el("span", { class: "tag " + (p.active ? "info" : "line"), id: "p-state", text: tr(p.active ? "Active" : "Switched off") }),
        mine ? el("span", { class: "tag info", text: tr("This is you.") }) : null,
        p.test ? el("span", { class: "tag line", text: tr("Test login") }) : null,
        el("span", { class: "meta-bit", text: p.last_login ? tr("Last sign-in {d}", { d: fmtDate(p.last_login) }) : tr("No sign-in on record") })),
      el("form", { class: "person-form", id: "person-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); savePerson(); } },
        field(tr("Role"), role),
        field(tr("Sales rep name in the CRM"), rep, tr("The name this person has as a sales rep and client owner in the CRM. Leave empty if they are not a rep.")),
        err,
        el("div", { class: "form-foot" },
          el("button", { type: "submit", class: "btn primary", id: "panel-save", disabled: P.busy || !P.dirty ? true : null, text: tr(P.busy ? "Saving…" : "Save") }),
          el("a", { class: "btn", id: "panel-rights", href: "#/rights", onclick: () => { S.who = p.person_id; closePanel(); }, text: tr("See rights") + " · " + tr("{n} of {m} rights", { n: rightsOn(p), m: rightKeys().length }) }))),
      pass,
      mine ? null : el("div", { class: "switch-box" },
        el("button", { type: "button", class: "btn" + (p.active ? " danger" : ""), id: "panel-switch", onclick: switchPerson, text: tr(p.active ? "Switch off" : "Switch on") })),
    ];
  }
  const host = el("div", { id: "person-panel", class: "panel-wrap" },
    el("div", { class: "panel-scrim", onclick: closePanel }),
    el("section", { class: "panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "panel-title" },
      el("div", { class: "panel-head" },
        el("h2", { class: "h2", id: "panel-title", text: adding ? tr("Add a person") : p.name }),
        el("button", { class: "btn subtle close", type: "button", id: "panel-close", "aria-label": tr("Close"), onclick: closePanel, text: "×" })),
      body));
  document.body.appendChild(host);
  if (adding && !touchDevice()) setTimeout(() => { const n = $("#p-name"); if (n && !n.value) n.focus(); }, 30);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.panel && !$("#confirm-dialog") && !$("#code-dialog")) closePanel(); });
function panelFail(P, e) { if (S.panel !== P) return; P.busy = false; P.err = e.message; renderPanel(); }
async function savePerson() {
  const P = S.panel;
  if (!P || !P.person || P.busy) return;
  P.busy = true; P.err = null; renderPanel();
  try {
    const r = await api("save_person", { person: { person_id: P.person.person_id, role: P.form.role, rep: P.form.rep } });
    putPerson(r.person);
    toast(tr("Saved."));
    if (S.panel === P) { P.busy = false; P.dirty = false; P.person = r.person; P.form = { role: r.person.role || "", rep: r.person.rep || "" }; renderPanel(); }
    loadDoc(true);
  } catch (e) { panelFail(P, e); }
}
async function addPerson() {
  const P = S.panel;
  if (!P || P.person || P.busy) return;
  if (blank(P.form.name)) { P.err = tr("Give the person a name."); renderPanel(); markInvalid($("#p-name"), true); const n = $("#p-name"); if (n) n.focus(); return; }
  P.busy = true; P.err = null; renderPanel();
  try {
    const person = { name: P.form.name, role: P.form.role, rep: P.form.rep };
    if (P.form.copy_from) person.copy_from = P.form.copy_from;
    const tok = S.token;
    const r = await api("save_person", { person });
    if (gone(tok)) return;                         // locked while the answer was on its way: the passcode is not shown
    putPerson(r.person);
    if (S.panel === P) closePanel();
    toast(tr("{name} is added.", { name: r.person.name }));
    renderAll();
    showCode(tr("Passcode for {name}", { name: r.person.name }), r.passcode);
    loadDoc(true);
  } catch (e) { panelFail(P, e); }
}
async function switchPerson() {
  const P = S.panel;
  if (!P || !P.person) return;
  const p = P.person, off = p.active;
  const yes = await confirmBox({ title: tr(off ? "Switch {name} off?" : "Switch {name} on?", { name: p.name }),
    body: tr(off ? "They are signed out at once and cannot sign in. Their rights are kept, and their name stays on tickets, tasks and notes." : "They can sign in again with their passcode and the rights they had."),
    ok: tr(off ? "Switch off" : "Switch on"), danger: off });
  if (!yes || S.panel !== P) return;
  try {
    const r = await api("save_person", { person: { person_id: p.person_id, active: !off } });
    putPerson(r.person);
    toast(tr(off ? "{name} is switched off." : "{name} is switched on.", { name: p.name }));
    if (S.panel === P) closePanel();
    renderAll();
    loadDoc(true);
  } catch (e) { toast(e.message, true); }
}
// A passcode on screen: in a dialog of its own, built from the value and dropped with the dialog.
// own: the passcode is the reader's own, and issuing it ended their session. The page stays as it is while they read
// it, asks the server for nothing, and returns to the gate when the dialog is closed, whichever way it is closed.
function showCode(title, code, own) {
  const note = own ? "This is your own passcode, and you are signed out now. Note it before you close this: you will need it to sign in again."
    : "Give it to them now. You can look it up again on their card.";
  modal("code-dialog", title, [codeBox(code, "code-out"), el("p", { class: "small", id: "code-note", text: tr(note) })],
    [el("button", { type: "button", class: "btn primary", id: "code-ok", onclick: () => { const h = $("#code-dialog"); if (h) h.remove(); }, text: tr("Close") })], "confirm");
  if (!own) return;
  const host = $("#code-dialog");
  const seen = new MutationObserver(() => {
    if (host.isConnected) return;
    seen.disconnect();
    if (!S.locked) lockDown(tr("Sign in with your new passcode."));
  });
  seen.observe(document.body, { childList: true });
}
// True when the page was locked, or signed in afresh, since the token was read: an answer to a request sent before that
// belongs to a session that is over.
const gone = (tok) => S.locked || S.token !== tok;
async function showPasscode() {
  const P = S.panel;
  if (!P || !P.person) return;
  const box = $("#pass-shown"), btn = $("#pass-show");
  if (box.firstChild) { box.innerHTML = ""; btn.textContent = tr("Show passcode"); return; }
  btn.disabled = true;
  try {
    const tok = S.token;
    const r = await api("show_passcode", { person_id: P.person.person_id });
    if (gone(tok) || S.panel !== P || !$("#pass-shown")) return;
    $("#pass-shown").append(codeBox(r.passcode, "pass-out"));
    $("#pass-show").textContent = tr("Hide");
    loadDoc(true);
  } catch (e) { toast(e.message, true); }
  const b = $("#pass-show"); if (b) b.disabled = false;
}
async function newPasscode() {
  const P = S.panel;
  if (!P || !P.person) return;
  const p = P.person;
  const yes = await confirmBox({ title: tr("A new passcode for {name}?", { name: p.name }), body: tr("The current passcode stops working at once and they are signed out everywhere."), ok: tr("Issue it") });
  if (!yes || S.panel !== P) return;
  try {
    const tok = S.token, own = isMe(p);
    const r = await api("new_passcode", { person_id: p.person_id });
    if (gone(tok)) return;                         // locked while the answer was on its way: the passcode is not shown
    putPerson(r.person);
    if (S.panel === P) { P.person = r.person; renderPanel(); }
    renderAll();
    showCode(tr("New passcode for {name}", { name: p.name }), r.passcode, own);
    if (!own) loadDoc(true);                       // their own session ended with the old passcode: nothing more to ask
  } catch (e) { toast(e.message, true); }
}

/* ------------------------------------------------------------------ rights
   Wide screens: the matrix, people across and rights down. Narrow ones: one person at a time, their rights as a list.
   A tap saves at once; a switch that is being saved cannot be tapped again. */
const NARROW_MQ = window.matchMedia("(max-width: 899px)");
NARROW_MQ.addEventListener("change", () => { if (!S.locked && route().name === "rights") renderAll(); });
async function setRight(p, key, on) {
  const id = p.person_id + "|" + key;
  if (S.busy[id]) return;
  S.busy[id] = true;
  drawRights();
  try {
    putPerson(await api("set_right", { person_id: p.person_id, right: key, on }));
    toast(tr(on ? "{name}: {right} is on." : "{name}: {right} is off.", { name: p.name, right: tr(RIGHT_LABEL[key]) }));
  } catch (e) { toast(e.message, true); }
  delete S.busy[id];
  if (S.locked) return;
  drawRights();
  loadDoc(true);
}
function rightCell(p, key, wide) {
  const on = !!p.rights[key], lockedOn = key === "can_manage_access" && isMe(p) && on;
  const label = p.name + ": " + tr(RIGHT_LABEL[key]);
  const b = el("button", { type: "button", class: "cell" + (wide ? "" : " row"), "aria-pressed": on ? "true" : "false", "aria-label": label, "data-person": p.person_id, "data-right": key,
    title: lockedOn ? tr("You cannot remove your own access to this tool.") : label,
    disabled: lockedOn || S.busy[p.person_id + "|" + key] ? true : null, onclick: () => setRight(p, key, !on) },
    wide ? el("span", { class: "tick", "aria-hidden": "true", text: on ? "✓" : "" })
      : [el("span", { class: "row-l" }, el("span", { class: "row-name", text: tr(RIGHT_LABEL[key]) }), el("span", { class: "small row-what", text: tr(GROUPS.flatMap(([, rs]) => rs).find((r) => r[0] === key)[2]) })),
         el("span", { class: "tag " + (on ? "act" : "line"), text: tr(on ? "On" : "Off") })]);
  return b;
}
function drawRights() {
  const host = $("#rights-host");
  if (!host || !S.doc) return;
  const keep = host.querySelector(".table-wrap") ? host.querySelector(".table-wrap").scrollLeft : 0;
  const focus = document.activeElement && document.activeElement.dataset ? [document.activeElement.dataset.person, document.activeElement.dataset.right] : null;
  host.innerHTML = "";
  const people = activePeople(), keys = rightKeys();
  if (!NARROW_MQ.matches) {
    const head = el("tr", {}, el("th", { scope: "col", class: "r-right", text: tr("Right") }), people.map((p) => el("th", { scope: "col", class: "r-person" }, el("span", { text: p.name }))));
    const rows = [];
    for (const [g, rs] of GROUPS) {
      const mine = rs.filter(([k]) => keys.includes(k));
      if (!mine.length) continue;
      rows.push(el("tr", { class: "r-group" }, el("th", { scope: "colgroup", colspan: String(people.length + 1), text: tr(g) })));
      for (const [k, l, what] of mine) rows.push(el("tr", { "data-right": k }, el("th", { scope: "row", class: "r-right" }, el("span", { class: "r-name", text: tr(l) }), el("span", { class: "small r-what", text: tr(what) })),
        people.map((p) => el("td", {}, rightCell(p, k, true)))));
    }
    const wrap = el("div", { class: "table-wrap", id: "matrix-wrap", tabindex: "0", role: "region", "aria-label": tr("Rights") }, el("table", { class: "tbl matrix", id: "matrix" }, el("thead", {}, head), el("tbody", {}, rows)));
    host.append(wrap);
    wrap.scrollLeft = keep;
  } else {
    if (!people.some((p) => p.person_id === S.who)) S.who = (people[0] || {}).person_id || null;
    const p = people.find((x) => x.person_id === S.who);
    host.append(el("label", { class: "field who" }, el("span", { class: "lbl", text: tr("Person") }),
      el("select", { id: "who", onchange: (e) => { S.who = e.target.value; drawRights(); const w = $("#who"); if (w) w.focus(); } }, people.map((x) => el("option", { value: x.person_id, selected: x.person_id === S.who ? true : null, text: x.name + (x.role ? " · " + x.role : "") })))));
    if (p) for (const [g, rs] of GROUPS) {
      const mine = rs.filter(([k]) => keys.includes(k));
      if (!mine.length) continue;
      host.append(el("h2", { class: "sec-title", text: tr(g) }), el("div", { class: "rows", "data-group": g }, mine.map(([k]) => rightCell(p, k, false))));
    }
  }
  if (focus && focus[0]) { const n = host.querySelector('[data-person="' + focus[0] + '"][data-right="' + focus[1] + '"]'); if (n && !n.disabled) n.focus({ preventScroll: true }); }
}
function historyLine(h) {
  const v = (x) => (blank(x) ? tr("empty") : x);
  let what;
  if (h.action === "right") what = tr(RIGHT_LABEL[h.field] || h.field) + ": " + tr(h.new_value === "true" ? "On" : "Off").toLowerCase();
  else if (h.action === "profile") what = tr(h.field === "rep" ? "Sales rep name" : "Role") + ": " + v(h.old_value) + " → " + v(h.new_value);
  else if (h.action === "active") what = tr(h.new_value === "true" ? "switched on" : "switched off");
  else if (h.action === "add") what = tr("added");
  else if (h.action === "passcode") what = tr("new passcode");
  else if (h.action === "passcode_view") what = tr("passcode looked up");
  else what = h.action;
  return el("li", { class: "h-line", "data-action": h.action },
    el("span", { class: "h-when num", text: fmtDate(h.at) + ", " + fmtTime(h.at) }), el("span", { class: "h-who", text: h.actor }), el("span", { class: "h-person", text: h.person }), el("span", { class: "h-what", text: what }));
}
function renderRights(main) {
  const sec = el("section", { class: "screen wide", id: "screen-rights" }, screenHead(tr("Rights")));
  main.append(sec);
  if (pending(sec)) return;
  const hist = S.doc.history || [];
  put(sec, el("p", { class: "small", id: "rights-hint", text: tr("Tap a cell to switch a right on or off. It takes effect at once.") }),
    el("div", { id: "rights-host" }),
    el("h2", { class: "sec-title", text: tr("History") }),
    hist.length ? [el("p", { class: "small", text: tr("The latest {n} changes.", { n: hist.length }) }), el("ul", { class: "history", id: "history" }, hist.map(historyLine))]
      : el("p", { class: "small", id: "history-empty", text: tr("No changes yet.") }));
  drawRights();
}

/* ------------------------------------------------------------------ logins */
async function loadLogins(days) {
  S.logins = { days, data: S.logins && S.logins.data ? S.logins.data : null, err: null, busy: true };
  const st = S.logins;
  if (route().name === "logins") renderAll();
  try { const d = await api("logins", { days }); if (S.logins !== st) return; st.data = d; }
  catch (e) { if (S.logins !== st) return; st.err = e.message; }
  st.busy = false;
  if (!S.locked && route().name === "logins") renderAll();
}
function renderLogins(main) {
  const sec = el("section", { class: "screen wide", id: "screen-logins" }, screenHead(tr("Logins")));
  main.append(sec);
  if (pending(sec)) return;
  if (!me().logins) { location.hash = "#/people"; return; }
  if (!S.logins) { loadLogins(30); return; }
  const st = S.logins;
  sec.append(el("div", { class: "filters" }, el("label", { class: "filter" }, el("span", { class: "lbl", text: tr("Period") }),
    el("select", { id: "l-days", onchange: (e) => loadLogins(Number(e.target.value)) }, [7, 30, 90].map((n) => el("option", { value: String(n), selected: n === st.days ? true : null, text: tr("Last {n} days", { n }) }))))));
  if (st.err) { sec.append(el("p", { class: "notice", role: "alert", id: "logins-err" }, st.err + " ", el("button", { type: "button", class: "btn", onclick: () => loadLogins(st.days), text: tr("Try again") }))); return; }
  if (!st.data) { sec.append(el("p", { class: "small", role: "status", text: tr("Loading…") })); return; }
  const d = st.data, tools = d.tools || [];
  const people = (d.people || []).filter((p) => p.active || p.logins_n > 0);
  put(sec, el("h2", { class: "sec-title", text: tr("Sign-ins by person and tool") }),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl usage", id: "usage" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("Person") }), el("th", { scope: "col", text: tr("Last sign-in") }), tools.map((t) => el("th", { scope: "col", class: "r", text: tr(TOOL_NAME[t] || t) })), el("th", { scope: "col", class: "r", text: tr("Total") }))),
      el("tbody", {}, people.map((p) => el("tr", { "data-who": p.name }, el("th", { scope: "row", text: p.name }),
        el("td", { class: "num" }, p.last_at ? fmtDate(p.last_at) + (p.last_tool ? " · " + tr(TOOL_NAME[p.last_tool] || p.last_tool) : "") : tr("never")),
        tools.map((t) => { const c = (p.tools || {})[t] || {}; return el("td", { class: "r num" + (c.allowed ? "" : " no-right"), "data-tool": t, text: c.logins ? String(c.logins) : "—" }); }),
        el("td", { class: "r num b", text: String(p.logins_n || 0) })))))),
    el("p", { class: "small", text: tr("A dash means no sign-in; a grey cell means the person has no right to that tool.") + " " + (d.since ? tr("The log starts on {d}. Test logins are left out.", { d: fmtDate(d.since) }) : "") }),
    el("h2", { class: "sec-title", text: tr("Latest sign-ins") }),
    (d.recent || []).length ? el("div", { class: "table-wrap" }, el("table", { class: "tbl", id: "recent" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("When") }), el("th", { scope: "col", text: tr("Person") }), el("th", { scope: "col", text: tr("Tool") }))),
      el("tbody", {}, d.recent.map((r) => el("tr", {}, el("td", { class: "num", text: fmtDate(r.at) + ", " + fmtTime(r.at) }), el("td", { text: r.who }), el("td", { text: tr(TOOL_NAME[r.tool] || r.tool) }))))))
      : el("p", { class: "small", id: "recent-empty", text: tr("No sign-ins in this period.") }));
}

/* ------------------------------------------------------------------ routes
   #/people (default)  #/rights  #/logins */
const ROUTES = { people: renderPeople, rights: renderRights, logins: renderLogins };
function route() {
  const m = /^#\/([a-z]+)/.exec(location.hash || "");
  return { name: m && ROUTES[m[1]] ? m[1] : "people" };
}
window.addEventListener("hashchange", () => { if (!S.locked) renderAll(); });

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "kit-lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", class: "kit-hbtn", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
const PHONE_MQ = window.matchMedia("(max-width: 599px)");
const isPhone = () => PHONE_MQ.matches;
PHONE_MQ.addEventListener("change", () => { S.menuOpen = false; if (!S.locked) renderAll(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && S.menuOpen) { S.menuOpen = false; renderAll(); const b = $("#menu-btn"); if (b) b.focus(); } });
function renderHeader() {
  const r = route().name, phone = isPhone();
  const tab = (name, label) => el("a", { class: "kit-tab", href: "#/" + name, id: "tab-" + name, "aria-current": r === name ? "page" : null, text: tr(label) });
  const staff = S.token ? el("span", { class: "kit-staff" + (phone ? "" : " hide-sm"), title: S.name, text: S.name }) : null;
  const lock = S.token ? el("button", { class: "kit-hbtn", type: "button", onclick: lockNow, text: tr("Lock") }) : null;
  const open = phone && S.menuOpen;
  const menuBtn = phone ? el("button", { class: "kit-hbtn menu-btn", id: "menu-btn", type: "button", "aria-label": tr("Menu"), "aria-expanded": open ? "true" : "false", "aria-controls": "head-menu",
    onclick: () => { S.menuOpen = !S.menuOpen; renderAll(); const b = $("#menu-btn"); if (b && !S.menuOpen) b.focus(); } }, el("span", { class: "menu-bars", "aria-hidden": "true" })) : null;
  const menu = open ? kitPhoneMenu([staff, kitToolsMenu("access", LANG), langSwitch(), lock], LANG, () => { S.menuOpen = false; renderAll(); const b = $("#menu-btn"); if (b) b.focus(); }) : null;
  if (menu) menu.addEventListener("click", (ev) => { if (ev.target.closest("button, a") && !ev.target.closest(".kit-tool-wrap > button")) S.menuOpen = false; }, true);
  const nav = el("nav", { class: "kit-tabs", "aria-label": tr("Access") }, tab("people", "People"), tab("rights", "Rights"), me().logins ? tab("logins", "Logins") : null);
  return el("header", { class: "top" + (phone ? " phone" : "") },
    el("div", { class: "kit-head" },
      el("a", { class: "kit-brand", href: "../" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })),
      el("span", { class: "kit-rule", "aria-hidden": "true" }),
      el("span", { class: "kit-tool", text: tr("Access") }),
      el("span", { class: "kit-spacer" }),
      phone ? menuBtn : [kitToolsMenu("access", LANG), langSwitch(), staff, lock]),
    menu, nav);
}

/* -------------------------------------------------------------------- gate */
function renderGate() {
  const old = $("#gate");
  if (old) old.remove();
  if (!S.locked) return;
  if (kitHubGate("access")) return;                // signing in is the home page's job (ui/hub.js)
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
      await loadDoc();
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
    el("p", { class: "gate-foot small", text: tr("Opens the Access tool") }));
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, card));
  const app = $("#app");
  app.classList.add("gated");
  app.setAttribute("aria-hidden", "true");
  app.inert = true;
  setTimeout(() => pass.focus(), 60);
}
// Drop the token and ask for the passcode again. Nobody's details, and no passcode, stay in memory or on screen.
function lockDown(message) {
  S.token = null;
  sstore(SESSION_KEY, null);
  sstore(ACTIVE_KEY, null);
  S.locked = true;
  S.gateMessage = message || null;
  loadSeq++;
  S.doc = null; S.err = null; S.panel = null; S.logins = null; S.menuOpen = false; S.who = null; S.busy = {};
  kitCloseMenus();
  document.querySelectorAll(".modal-wrap, .panel-wrap").forEach((n) => n.remove());
  $("#app").innerHTML = "";
  renderGate();
}
function lockNow() { lockDown(); toast(tr("Locked.")); }

/* --------------------------------------------------------------- idle lock
   Touch devices only: an iPad left on the counter for 15 minutes asks for the
   passcode again. */
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
  document.title = "Delardi " + tr("Access");
  if (S.locked) return;                            // nothing behind the gate
  const r = route();
  kitCloseMenus();
  const y = window.scrollY, mx = $("#matrix-wrap") ? $("#matrix-wrap").scrollLeft : 0;
  app.innerHTML = "";
  app.classList.remove("gated"); app.setAttribute("aria-hidden", "false"); app.inert = false;
  const main = el("main", { id: "main" });
  app.append(renderHeader(), main);
  ROUTES[r.name](main);
  const sec = main.querySelector(".screen"), mark = sec && typeof seasonMarkEl === "function" ? seasonMarkEl("flake") : null;
  if (mark) { sec.classList.add("in-season"); sec.prepend(mark); }
  window.scrollTo(0, y);
  if (mx && $("#matrix-wrap")) $("#matrix-wrap").scrollLeft = mx;
}
function restoreSession() {
  kitHubAdopt("access", SESSION_KEY, { idleKey: ACTIVE_KEY, active: activeNow });          // the home page's sign-in, taken as this tool's own (ui/hub.js)
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
    await loadDoc();                               // a session that is no longer good locks the page from inside api()
    if (!S.locked && S.doc && S.doc.me) S.name = S.doc.me.name;
  }
  if (S.locked) $("#app").innerHTML = "";
  renderAll();
  renderGate();
})();
