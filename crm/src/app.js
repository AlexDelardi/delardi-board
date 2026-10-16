
/* ===========================================================================
   Configuration
   There is deliberately NO database key in this file. Every read and every
   write goes through the crm-api edge function, which needs a session token
   issued only in exchange for a personal passcode — and only to someone who
   has been given CRM access, which is a separate right from the Weekly Board.
   Changing a record is a further right again. Until a passcode is accepted
   the page holds nothing but invented placeholder content.

   Phone numbers reach the page since v11 (22 Sept 2026) and are hidden with
   the amounts by the eye button. Sales people appear by name since v12
   (12 Oct 2026); a seller who has left is marked "(left)", and a seller the
   refresh has just met is "Sales rep N" until someone gives the name.
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/crm-api";
const LOGO_WORDMARK = "__WORDMARK__";
const SESSION_KEY = "crm_session";
const THEME_KEY = "board_theme";          // shared with the Weekly Board on purpose
const LANG_KEY = "delardi_lang";          // shared with the landing page
const PAGE = 50;

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  // header, gate, landing
  "Client Instrument": "Клиентская база",
  "CRM spring clean": "Генеральная уборка базы",
  "Weekly board": "Еженедельная доска",
  "All tools": "Все инструменты",
  "All Delardi tools": "Все инструменты Delardi",
  "Switch between light and dark": "Переключить светлую и тёмную тему",
  "Language": "Язык",
  "Lock": "Заблокировать",
  "Locked.": "Заблокировано.",
  "can edit": "может редактировать",
  "view only": "только просмотр",
  "Client records are private. Enter your personal passcode to open them.": "Данные клиентов конфиденциальны. Введите свой личный код доступа.",
  "Your passcode": "Ваш код доступа",
  "Open the instrument": "Открыть",
  "Checking…": "Проверяем…",
  "Enter your passcode.": "Введите код доступа.",
  "Nothing behind this card is real. The instrument loads no data until your passcode is accepted, and a Weekly Board passcode opens it only if you have been given client access.":
    "За этой карточкой нет настоящих данных. Они загружаются только после проверки кода, а код от еженедельной доски подходит, только если вам дан доступ к клиентской базе.",
  "Welcome, {name} — open until {time}": "Здравствуйте, {name}! Доступ открыт до {time}",
  "Unlock": "Вход",
  // server messages
  "That passcode is not right.": "Неверный код доступа.",
  "This account does not have access to the CRM.": "У этой учётной записи нет доступа к клиентской базе.",
  "That session is not valid. Enter your passcode again.": "Сеанс недействителен. Введите код доступа ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сеанс истёк. Введите код доступа ещё раз.",
  "Enter your passcode to open the instrument.": "Введите код доступа.",
  "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "Your account can view client records but not change them.": "Ваша учётная запись может просматривать данные клиентов, но не изменять их.",
  "No record with that reference.": "Записи с таким номером нет.",
  "That is not a valid client reference.": "Это не номер клиента.",
  "This record was merged into another one and cannot be changed.": "Эта запись объединена с другой, изменить её нельзя.",
  "This record is deleted. Restore it before changing it.": "Запись удалена. Сначала восстановите её.",
  "Say how the value was confirmed.": "Укажите, как подтверждено значение.",
  "Choose where the value comes from.": "Выберите, откуда взять значение.",
  "Phone numbers cannot be typed in here.": "Номер телефона здесь вводить нельзя.",
  "There is no value to confirm.": "Нечего подтверждать.",
  "A name must be 2 to 120 characters.": "Имя должно быть от 2 до 120 символов.",
  "Gender must be F or M.": "Пол: Ж или М.",
  "A date of birth must be a real date, written YYYY-MM-DD.": "Дата рождения должна быть настоящей датой.",
  "That date of birth is outside the plausible range.": "Такая дата рождения невозможна.",
  "There is no number on file from that source.": "В этом источнике нет номера.",
  "Nothing on this record is held by one source only.": "В этой записи нет полей только из одного источника.",
  "The record is already in that state.": "Запись уже в этом состоянии.",
  "Give a short reason.": "Коротко укажите причину.",
  "Keep the reason under 300 characters.": "Причина — не длиннее 300 символов.",
  "Settle every field where the sources differ before marking the record checked.": "Сначала решите все поля, где источники расходятся.",
  "Choose a current sales rep or the shared list.": "Выберите действующего продавца или общий список.",
  "That is already the owner.": "Это уже ответственный.",
  "Keep the contact note under 300 characters.": "Заметка о контакте — не длиннее 300 символов.",
  "Keep \"referred by\" under 120 characters.": "Поле «По рекомендации» — не длиннее 120 символов.",
  "Nothing has changed.": "Ничего не изменилось.",
  "Write the note first.": "Сначала напишите заметку.",
  "Keep a note under 1,000 characters.": "Заметка — не длиннее 1000 символов.",
  "Choose two different records.": "Выберите две разные записи.",
  "Request failed ({n})": "Ошибка запроса ({n})",
  // tiles, progress
  "Needs a decision": "Нужно решение",
  "Needs confirming": "Нужно подтвердить",
  "Set aside": "Отложено",
  "Done": "Готово",
  "Clean": "Совпадает",
  "Checked": "Проверено",
  "Deleted": "Удалено",
  "Merged": "Объединено",
  "Retail clients": "Розничные клиенты",
  "Owner has left": "Ответственный ушёл",
  "Shared (store)": "Общий список (бутик)",
  "fields where the sources differ": "полей, где источники расходятся",
  "{n} where the sources differ": "{n} — источники расходятся",
  "{n} from one source only": "{n} — только из одного источника",
  "waiting on the client or a check": "ждут клиента или проверки",
  "{checked} checked · {clean} matched": "{checked} проверено · {clean} совпало",
  "{spend} lifetime · {n} related excluded": "{spend} за всё время · без {n} связанных",
  "{spend} · lapsed and dormant": "{spend} · ушедшие и спящие",
  "{spend} of retail spend": "{spend} розничных продаж",
  "Retail clients on the shared win-back list, worked by the whole team": "Розничные клиенты в общем списке на возврат — с ними работает вся команда",
  "Retail clients whose owner is no longer an assignable sales rep": "Розничные клиенты, чей ответственный больше не работает",
  "Click to filter the list": "Нажмите, чтобы отфильтровать список",
  "Click to clear this filter": "Нажмите, чтобы снять фильтр",
  "Clean-up progress": "Прогресс уборки",
  "{done} of {total} records done": "Готово {done} из {total} записей",
  "{n} set aside": "{n} отложено",
  "{n} to go": "осталось {n}",
  "{n} worked on this week": "{n} за эту неделю",
  // toolbar
  "Search": "Поиск",
  "Name or reference": "Имя или номер",
  "Search by name or client reference": "Поиск по имени или номеру клиента",
  "Filters": "Фильтры",
  "Filters ({n})": "Фильтры ({n})",
  "Status": "Статус",
  "Any status": "Любой статус",
  "Owner": "Ответственный",
  "All owners": "Все ответственные",
  "Current sales reps": "Действующие продавцы",
  "{label} (left)": "{label} (ушёл)",
  "Records": "Записи",
  "All records": "Все записи",
  "All clients": "Все клиенты",
  "Prospects": "Потенциальные клиенты",
  "Related parties": "Связанные лица",
  "ABC": "ABC",
  "Any class": "Любой класс",
  "Lifecycle": "Жизненный цикл",
  "Any": "Любой",
  "Sort": "Сортировка",
  "Highest spend": "Больше всего покупок",
  "Lowest spend": "Меньше всего покупок",
  "Most recent purchase": "Последняя покупка — недавно",
  "Longest since purchase": "Последняя покупка — давно",
  "Reference": "Номер",
  "Recently changed": "Недавно изменённые",
  "Reset": "Сбросить",
  // list
  "Client": "Клиент",
  "Segment": "Сегмент",
  "Last purchase": "Последняя покупка",
  "Lifetime spend": "Сумма покупок",
  "Client records": "Записи клиентов",
  "Loading…": "Загрузка…",
  "Showing": "Показано",
  "of": "из",
  "No records match these filters.": "Нет записей по этим фильтрам.",
  "Clear filters": "Сбросить фильтры",
  "Clear all": "Сбросить всё",
  "3 more": "Ещё 3",
  "Fewer": "Свернуть",
  "Show the other figures": "Показать остальные показатели",
  "Show fewer figures": "Показать меньше показателей",
  "Filters in force": "Включённые фильтры",
  "Try again": "Повторить",
  "← Previous": "← Назад",
  "Next →": "Далее →",
  "Page {n} of {m}": "Страница {n} из {m}",
  "Colibri + questionnaire": "Colibri + анкета",
  "Colibri only": "Только Colibri",
  "Questionnaire only": "Только анкета",
  "Related": "Связанное лицо",
  "Prospect": "Потенциальный",
  "Do not contact": "Не беспокоить",
  "has left": "ушёл",
  "Class {c}": "Класс {c}",
  "Last {d}": "Последняя {d}",
  "Open {id}": "Открыть {id}",
  "Unnamed record": "Без имени",
  "{n} differ": "{n} расходится",
  "{n} to confirm": "{n} подтвердить",
  "into {id}": "в {id}",
  "owner: {o}": "ответственный: {o}",
  "class {c}": "класс {c}",
  // card
  "Close": "Закрыть",
  "Could not open this record": "Не удалось открыть запись",
  "Loading the record…": "Загружаем запись…",
  "Related party": "Связанное лицо",
  "Review": "Проверка",
  "Everything on file matches across both sources.": "Всё, что есть в обоих источниках, совпадает.",
  "Every field is settled.": "Все поля решены.",
  "Accept single-source values ({n})": "Принять значения из одного источника ({n})",
  "Takes each value held by only one source as it is. You can change any of them afterwards.":
    "Каждое значение, которое есть только в одном источнике, будет принято как есть. Потом любое можно изменить.",
  "Mark as checked": "Отметить как проверенную",
  "Settle the fields where the sources differ first.": "Сначала решите поля, где источники расходятся.",
  "Set aside…": "Отложить…",
  "Delete…": "Удалить…",
  "Reopen": "Вернуть в работу",
  "Restore": "Восстановить",
  "Checked by {by}, {d}": "Проверено: {by}, {d}",
  "Set aside by {by}, {d}": "Отложено: {by}, {d}",
  "Deleted by {by}, {d}": "Удалено: {by}, {d}",
  "Reason": "Причина",
  "Why is it set aside? E.g. client not reachable": "Почему откладываем? Например: не дозвонились",
  "Why delete it? E.g. test entry, not a client": "Почему удаляем? Например: тестовая запись",
  "Deleted records drop out of every list and figure. They can be restored.":
    "Удалённые записи пропадают из списков и цифр. Их можно восстановить.",
  "Cancel": "Отмена",
  "Save": "Сохранить",
  "Saving…": "Сохраняем…",
  "Saved.": "Сохранено.",
  "Confirm": "Подтвердить",
  "This record was merged into {id}.": "Эта запись объединена с {id}.",
  "Open {id}": "Открыть {id}",
  "View only. Ask Alex if you need to change records.": "Только просмотр. Если нужно менять записи, обратитесь к Алексу.",
  // identity
  "Identity — Colibri against the questionnaire": "Личные данные — Colibri и анкета",
  "Field": "Поле",
  "Questionnaire": "Анкета",
  "Name": "Имя",
  "Phone": "Телефон",
  "Gender": "Пол",
  "Date of birth": "Дата рождения",
  "Female": "Женский",
  "Male": "Мужской",
  "No number on file": "Номера нет",
  "Match": "Совпадает",
  "One source only": "Только один источник",
  "Sources differ": "Источники расходятся",
  "Not on file": "Нет данных",
  "Confirmed by client": "Подтвердил клиент",
  "Confirmed by Delardi": "Подтвердил Delardi",
  "Entered by hand": "Введено вручную",
  "Accepted from one source": "Принято из одного источника",
  "Decide": "Решить",
  "Add": "Добавить",
  "Change": "Изменить",
  "Which value is right?": "Какое значение верное?",
  "From Colibri": "Из Colibri",
  "From the questionnaire": "Из анкеты",
  "Something else": "Другое",
  "dd.mm.yyyy": "дд.мм.гггг",
  "Date of birth, dd.mm.yyyy": "Дата рождения, дд.мм.гггг",
  "Enter the date as dd.mm.yyyy, for example 14.03.1988.": "Введите дату как дд.мм.гггг, например 14.03.1988.",
  "How do you know?": "Откуда известно?",
  "The client confirmed it": "Подтвердил клиент",
  "From our own records": "По нашим данным",
  "Choose a value.": "Выберите значение.",
  "Say how you know.": "Укажите, откуда известно.",
  "Back to the automatic comparison": "Вернуть автоматическое сравнение",
  "{n} field needs a decision": "{n} поле требует решения",
  "{n} fields need a decision": "{n} полей требуют решения",
  "{n} field needs confirming": "{n} поле нужно подтвердить",
  "{n} fields need confirming": "{n} полей нужно подтвердить",
  "{by}, {d}": "{by}, {d}",
  // duplicates, merge
  "Possible duplicate": "Возможный дубликат",
  "Same phone number as this record. Check whether they are one person.": "Тот же номер телефона, что и у этой записи. Проверьте, один ли это человек.",
  "Same person — merge…": "Один человек — объединить…",
  "Different people": "Разные люди",
  "Merge with another record…": "Объединить с другой записью…",
  "Reference of the other record": "Номер другой записи",
  "Look up": "Найти",
  "Merge two records": "Объединение записей",
  "Which record should stay?": "Какую запись оставить?",
  "This one ({id})": "Эту ({id})",
  "The other one ({id})": "Другую ({id})",
  "The kept record takes the other's purchases and fills its blanks from it. The other record is closed and points to the kept one. This cannot be undone here — ask Alex if a merge was wrong.":
    "Оставшаяся запись получит покупки другой и заполнит свои пустые поля. Вторая запись закроется и будет ссылаться на оставшуюся. Отменить здесь нельзя — если ошиблись, обратитесь к Алексу.",
  "Merge": "Объединить",
  "Merged. {id} now holds both records.": "Объединено. Теперь всё в {id}.",
  "Note (optional)": "Заметка (необязательно)",
  // commercial
  "Commercial": "Покупки и ответственный",
  "Purchases": "Покупки",
  "A prospect: completed the questionnaire but has no purchase on record in Colibri.":
    "Потенциальный клиент: заполнил анкету, но покупок в Colibri нет.",
  "Purchase occasions": "Визитов с покупкой",
  "Items bought": "Куплено изделий",
  "First purchase": "Первая покупка",
  "ABC class": "Класс ABC",
  "How assigned": "Как назначен",
  "Previous owner": "Прежний ответственный",
  "Sales people seen": "Продавцов у клиента",
  "Yes — kept out of retail figures": "Да — не входит в розничные цифры",
  "No": "Нет",
  "Yes": "Да",
  "Assigned": "Назначен",
  "Change owner": "Сменить ответственного",
  "New owner": "Новый ответственный",
  "Why? (optional)": "Почему? (необязательно)",
  "Balanced by spend": "Распределено по сумме покупок",
  "Lapsed or dormant — shared win-back list": "Ушедший или спящий — общий список на возврат",
  "Continuity — this rep has served the client before": "Преемственность — продавец уже работал с клиентом",
  "Manual": "Вручную",
  // contact
  "Contact": "Контакт",
  "Contact note": "Заметка о контакте",
  "Referred by": "По рекомендации",
  "Edit": "Изменить",
  "The client has asked not to be contacted": "Клиент просил его не беспокоить",
  "E.g. calls only after 18:00, prefers Telegram": "Например: звонить после 18:00, удобнее Telegram",
  "A client reference or a name": "Номер клиента или имя",
  // questionnaire
  "Not in the questionnaire. Everything above comes from Colibri alone.": "В анкете нет. Всё выше — только из Colibri.",
  "submitted {d}": "заполнена {d}",
  "Patronymic": "Отчество",
  "Email or handle": "Email или ник",
  "Preferred channel": "Удобный канал",
  "Marketing consent": "Согласие на рассылки",
  "Buying for": "Для кого покупает",
  "How they heard of us": "Откуда узнал о нас",
  "Would buy online": "Купил бы онлайн",
  "Brand preference": "Любимые бренды",
  "Duplicate form": "Повторная анкета",
  "Yes — submitted more than once": "Да — заполнена больше одного раза",
  "Not stated": "Не указано",
  "→ not mapped yet": "→ пока без соответствия",
  // purchases
  "Brand": "Бренд",
  "Lines": "Строк",
  "Net": "Сумма",
  "Return": "Возврат",
  "Full price": "Полная цена",
  "No description in Colibri": "Нет описания в Colibri",
  // notes
  "Notes and history": "Заметки и история",
  "Add a note": "Добавить заметку",
  "Add note": "Добавить",
  "E.g. called, will visit on Saturday": "Например: позвонили, придёт в субботу",
  "flagged at load": "отмечено при загрузке",
  "Name field carries a note": "В поле имени — заметка",
  "Owner assigned": "Назначен ответственный",
  "Marked as related party": "Отмечен как связанное лицо",
  "{field} confirmed": "{field}: подтверждено",
  "{field} handed back to the automatic comparison": "{field}: возвращено к автоматическому сравнению",
  "Accepted as held by one source": "Принято из одного источника",
  "Marked as checked.": "Отмечено как проверенная.",
  "Set aside.": "Отложено.",
  "Deleted.": "Удалено.",
  "Reopened.": "Возвращено в работу.",
  "Restored.": "Восстановлено.",
  "Do not contact: on": "Не беспокоить: включено",
  "Do not contact: off": "Не беспокоить: выключено",
  "Contact note changed": "Изменена заметка о контакте",
  "Referred by changed": "Изменено поле «По рекомендации»",
  "Note": "Заметка",
  "Not the same person as {id}": "Не тот же человек, что {id}",
  "Merged into {id}": "Объединено с {id}",
  "Merged {id} into this record": "{id} объединена с этой записью",
  "the client confirmed it": "подтвердил клиент",
  "from our own records": "по нашим данным",
  "from Colibri": "из Colibri",
  "from the questionnaire": "из анкеты",
  "typed in": "введено вручную",
  // lifecycle, segments, categories
  "Active": "Активный",
  "At risk": "В зоне риска",
  "Lapsed": "Ушедший",
  "Dormant": "Спящий",
  "Champion": "Чемпион",
  "Champions": "Чемпионы",
  "Loyal": "Лояльный",
  "Hibernating": "В спячке",
  "Lost": "Потерянный",
  "New client": "Новый клиент",
  "New": "Новый",
  "Promising": "Перспективный",
  "Need attention": "Требует внимания",
  "Potential loyalist": "Потенциально лояльный",
  "Can't lose": "Нельзя потерять",
};
// Counted nouns: English one/many; Russian one/few/many.
const PL = {
  record: { en: ["record", "records"], ru: ["запись", "записи", "записей"] },
  line:   { en: ["line", "lines"], ru: ["строка", "строки", "строк"] },
  field:  { en: ["field", "fields"], ru: ["поле", "поля", "полей"] },
};
function initialLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "ru") return v;
  } catch (e) { /* storage blocked */ }
  return /^ru\b/i.test(navigator.language || "") ? "ru" : "en";
}
let LANG = initialLang();
const LOC = () => (LANG === "ru" ? "ru-RU" : "en-GB");
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
  if (S.cardId) renderDrawer();
}

/* --------------------------------------------------------------- vocabulary */
// How each identity field compares across Colibri and the questionnaire.
const FLAG = {
  agreed:   { label: "Match",                    glyph: "✓", tone: "good" },
  gap:      { label: "One source only",          shape: "half", tone: "warning" },
  conflict: { label: "Sources differ",           glyph: "◆", tone: "serious" },
  none:     { label: "Not on file",              glyph: "–", tone: "" },
  client:   { label: "Confirmed by client",      glyph: "✓", tone: "good" },
  delardi:  { label: "Confirmed by Delardi",     glyph: "✓", tone: "good" },
  manual:   { label: "Entered by hand",          glyph: "✎", tone: "good" },
  rule:     { label: "Accepted from one source", glyph: "≈", tone: "good" },
};
const HUMAN_FLAGS = ["client", "delardi", "manual", "rule"];
// One status per record, as the API reports it.
const STATUS = {
  decision:  { label: "Needs a decision", glyph: "◆", tone: "serious" },
  confirm:   { label: "Needs confirming", shape: "half", tone: "warning" },
  clean:     { label: "Clean",            glyph: "✓", tone: "good" },
  checked:   { label: "Checked",          glyph: "✓", tone: "good" },
  set_aside: { label: "Set aside",        glyph: "‖", tone: "" },
  deleted:   { label: "Deleted",          glyph: "×", tone: "critical" },
  merged:    { label: "Merged",           glyph: "→", tone: "" },
  lead:      { label: "Telegram lead",    glyph: "✈", tone: "" },
};
const FIELD_LABEL = { name: "Name", phone: "Phone", gender: "Gender", dob: "Date of birth" };
const LIFECYCLES = ["Active", "At risk", "Lapsed", "Dormant"];
const SORTS = [
  ["spend", "Highest spend"], ["spend_asc", "Lowest spend"],
  ["recent", "Most recent purchase"], ["oldest", "Longest since purchase"],
  ["touched", "Recently changed"], ["id", "Reference"],
];
const TYPES = [
  ["", "All records"], ["retail", "Retail clients"], ["client", "All clients"],
  ["prospect", "Prospects"], ["related", "Related parties"],
];
const STATUS_OPTIONS = [
  ["", "Any status"], ["decision", "Needs a decision"], ["confirm", "Needs confirming"],
  ["done", "Done"], ["checked", "Checked"], ["clean", "Clean"],
  ["set_aside", "Set aside"], ["deleted", "Deleted"], ["merged", "Merged"], ["lead", "Telegram leads"],
];
// The store's shared list. The API labels it "Shared (store)"; older responses
// said "Unassigned", so both are recognised.
const SHARED = "Shared (store)";
const isShared = (o) => o === SHARED || o === "Unassigned";
const ownerHasLeft = (o, active) => !blank(o) && !isShared(o) && !active;
// Questionnaire columns and the value-mapping field each one is translated by.
const MAPPED = {
  channel_raw: "contact_channel", purchase_for_raw: "purchase_for",
  awareness_source_raw: "awareness_source", online_interest_raw: "online_interest",
  brand_preference_raw: "brand_preference",
};
const READ_ACTIONS = ["reference", "stats", "clients", "client", "ping", "peek", "insights", "data_health", "facets"];

/* ------------------------------------------------------------------- state */
const blankFilters = () => ({
  q: "", status: "", owner: "", type: "", abc_class: "", lifecycle_status: "", sort: "spend", offset: 0,
  drill: null,         // { label, params } when the list was opened from Insights
  quick: "",           // a shortcut chip: "bday" | "cannot" | "shared"
  dnc_out: false,      // leave out do-not-contact clients
  multi: { status: [], abc: [], segment: [], lifecycle: [], owner: [] },   // column checklists (listx.js)
  contact: "",         // not contacted in 30 / 60 / 90 days
});
const S = {
  locked: true, session: null,
  ref: null, stats: null,
  rows: [], total: 0, loading: false, error: null,
  f: blankFilters(),
  filtersOpen: false,
  card: null, cardId: null, cardError: null, lastFocus: null,
  edit: null,          // the one inline form open on the card, if any
  busy: false,         // a write is in flight
  formError: null,
  view: "clients",     // "clients" | "insights" | "data"
  ins: null, insBasis: "retail", insLoading: false, insError: null,
  dh: null, dhLoading: false, dhError: null,          // data health
  imports: null, imp: null, impId: null, impError: null, confirm: null,   // Colibri refresh
};
const canEdit = () => !!(S.session && S.session.can_edit && S.ref && S.ref.can_edit);

/* ----------------------------------------------------------------- helpers */
const $ = (sel, root) => (root || document).querySelector(sel);
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") { if (v) n.className = v; }
    else if (k === "text") n.textContent = v;
    else if (k === "value") n.value = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of [].concat(kids)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}
const blank = (v) => v === null || v === undefined || String(v).trim() === "";
const sentence = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

function fmtUZS(n) {
  if (n === null || n === undefined || n === "") return "—";
  if (S.discreet) return "•••";
  const x = Number(n), a = Math.abs(x);
  const num = (v, d) => v.toLocaleString(LOC(), { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return num(x / 1e9, 2) + (LANG === "ru" ? " млрд" : "bn");
  if (a >= 1e6) return num(x / 1e6, 1) + (LANG === "ru" ? " млн" : "m");
  return x.toLocaleString(LOC());
}
const fullUZS = (n) => (n === null || n === undefined || S.discreet) ? "" : Number(n).toLocaleString(LOC()) + " UZS";
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).length === 10 ? iso + "T00:00:00Z" : iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString(LOC(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString(LOC(), { day: "numeric", month: "short", year: "numeric" }) + ", " +
    d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });
}
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });
const fmtGender = (g) => g === "M" ? tr("Male") : g === "F" ? tr("Female") : (blank(g) ? "—" : g);
const trv = (v) => blank(v) ? "—" : tr(String(v));   // data values that may have a translation
// Owners, sales reps and whoever made a change: labels translate, names don't.
const who = (v) => {
  if (blank(v)) return v;
  const m = /^Sales rep (\d+)$/.exec(String(v));
  if (m) return LANG === "ru" ? "Продавец " + m[1] : String(v);
  return tr(String(v));
};

function chip(def, text, extraClass) {
  const mark = def.shape
    ? el("span", { class: "shape " + def.shape, "aria-hidden": "true" })
    : el("span", { class: "glyph", "aria-hidden": "true", text: def.glyph });
  return el("span", { class: "chip" + (extraClass ? " " + extraClass : ""), "data-tone": def.tone || null }, [
    mark, text || tr(def.label),
  ]);
}
// Same half-disc icon the Weekly Board uses for its theme switch.
function themeIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "15"); svg.setAttribute("height", "15");
  svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true");
  const c = document.createElementNS(ns, "circle");
  c.setAttribute("cx", "8"); c.setAttribute("cy", "8"); c.setAttribute("r", "6.5");
  c.setAttribute("fill", "none"); c.setAttribute("stroke", "currentColor"); c.setAttribute("stroke-width", "1.4");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M8 1.5a6.5 6.5 0 0 0 0 13z"); p.setAttribute("fill", "currentColor");
  svg.append(c, p);
  return svg;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
function store(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); }
  catch (e) { return null; }
}

/* --------------------------------------------------------------------- api */
async function call(action, payload = {}) {
  const body = { action, ...payload };
  if (S.session && action !== "unlock") body.token = S.session.token;
  let res;
  try {
    res = await fetch(API, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (e) {
    // No answer at all: the connection, not the request. Said once, on the banner.
    netDown();
    throw new Error(tr("No connection. Check the Wi-Fi or mobile data and try again."));
  }
  netUp();
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    // A failed session locks the page. A refused write does not: the person
    // is still signed in and can keep reading.
    const sessionGone = res.status === 401 || (res.status === 403 && READ_ACTIONS.includes(action));
    if (sessionGone && action !== "unlock") lockDown(data.error);
    const err = new Error(data.error ? tr(data.error) : tr("Request failed ({n})", { n: res.status }));
    err.status = res.status;
    throw err;
  }
  return data;
}

function listParams() {
  const f = S.f, p = { sort: f.sort, limit: PAGE, offset: f.offset };
  if (f.q) p.q = f.q;
  if (f.status) p.status = f.status;
  if (f.abc_class) p.abc_class = f.abc_class;
  if (f.lifecycle_status) p.lifecycle_status = f.lifecycle_status;
  if (f.owner === "__orphaned") p.owner_status = "orphaned";
  else if (f.owner === "__assignable") p.owner_status = "assignable";
  else if (f.owner === "__unassigned") p.owner_status = "unassigned";
  else if (f.owner) p.client_owner = f.owner;
  if (f.type === "retail") { p.record_type = "client"; p.related = "exclude"; }
  else if (f.type === "client") p.record_type = "client";
  else if (f.type === "prospect") p.record_type = "prospect";
  else if (f.type === "related") p.related = "only";
  quickParams(f, p);
  listParamsX(f, p);
  if (f.drill && f.drill.params) Object.assign(p, f.drill.params);
  return p;
}

async function loadAll() {
  const [ref, stats, list] = await Promise.all([
    call("reference"), call("stats"), call("clients", listParams()),
  ]);
  S.ref = ref; S.stats = stats;
  const rows = myClientsDefault() ? await call("clients", listParams()) : list;
  S.rows = rows.rows || []; S.total = rows.total || 0; S.error = null;
  loadRecent();
}

let listSeq = 0;
async function loadList() {
  const seq = ++listSeq;
  S.loading = true; renderListHost();
  try {
    const list = await call("clients", listParams());
    if (seq !== listSeq) return;          // a newer request has superseded this one
    S.rows = list.rows || []; S.total = list.total || 0; S.error = null;
  } catch (e) {
    if (seq !== listSeq) return;
    S.error = e.message;
  }
  S.loading = false;
  renderListHost();
  renderScoreboard();
  refreshWalk();
}
// After a write: the counts and the list move, quietly, behind the open card.
async function refreshBehind() {
  try {
    const [ref, stats] = await Promise.all([call("reference"), call("stats")]);
    S.ref = ref; S.stats = stats;
    renderScoreboard(); renderProgress();
  } catch (e) { /* the list reload below reports trouble */ }
  if (S.view === "insights") loadInsights(); else S.ins = null;
  if (S.view === "data") loadData(); else S.dh = null;
  loadList();
}
function setFilter(patch) {
  patch = multiPatch(patch);
  if (Object.keys(patch).some((k) => k !== "offset")) S.walkId = null;   // a different list: the card's place in it is unknown
  Object.assign(S.f, patch, { offset: "offset" in patch ? patch.offset : 0 });
  renderToolbarValues();
  loadList();
}

/* ------------------------------------------------------------ placeholder */
// The blurred layer behind the passcode card. Invented, not redacted: there is
// no real row in the DOM to un-blur, read from the network tab, or lift.
function skeleton() {
  const rows = [];
  const st = ["decision", "confirm", "clean", "confirm", "decision", "checked", "confirm", "clean"];
  for (let i = 0; i < 14; i++) {
    rows.push({
      client_id: "DLD-····", display_name: "—————— ————", record_type: "client", in_colibri: true, in_marketing: i % 3 !== 0,
      review_status: st[i % st.length], conflict_fields: i % 2, gap_fields: 1 + (i % 3),
      abc_class: ["A", "B", "C"][i % 3], rfm_segment: "———", lifecycle_status: "———",
      client_owner: "———", owner_active: true, last_purchase_at: null, lifetime_spend_uzs: null,
      related_party: false, do_not_contact: false,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
function renderHeader() {
  if (isPhone()) return renderHeaderPhone();
  const right = [];
  right.push(el("a", { class: "btn subtle hide-sm", href: "../board/", text: tr("Weekly board") }));
  right.push(langSwitch());
  if (S.session && !S.locked) right.push(discreetBtn());
  right.push(el("button", { class: "btn subtle", type: "button", "aria-label": tr("Switch between light and dark"),
    title: tr("Switch between light and dark"), onclick: toggleTheme }, [themeIcon()]));
  if (S.session && !S.locked) {
    right.push(el("span", { class: "lock-state" }, [
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("span", { class: "who", text: S.session.name }),
      el("span", { class: "role", text: "· " + (canEdit() ? tr("can edit") : tr("view only")) }),
      el("button", { class: "btn subtle sm", type: "button", onclick: lockNow, text: tr("Lock") }),
    ]));
  }
  return el("div", { class: "top-row" }, [
    el("div", { class: "brand" }, [
      el("a", { class: "home", href: "../", title: tr("All Delardi tools") }, [
        el("img", { class: "mark", src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })]),
      el("span", { class: "rule", "aria-hidden": "true" }),
      el("div", {}, [
        el("div", { class: "title", text: tr("Client Instrument") }),
        el("div", { class: "sub", text: tr("CRM spring clean") }),
      ]),
    ]),
    el("div", { class: "spacer" }),
    ...right,
  ]);
}

/* -------------------------------------------------------------- scoreboard */
function tile(opts) {
  const kids = [
    el("div", { class: "label" }, [
      opts.tone ? el("span", { class: "tone", "aria-hidden": "true",
        style: "background: var(--" + opts.tone + ")" }) : el("span", { class: "tone blank", "aria-hidden": "true" }),
      opts.label,
    ]),
    el("div", { class: "val", text: opts.val }),
    el("div", { class: "sub", text: opts.sub, title: opts.subTitle || opts.sub }),
  ];
  if (!opts.onclick) return el("div", { class: "stat" }, kids);
  return el("button", { class: "stat", type: "button", "aria-pressed": opts.pressed ? "true" : "false",
    title: opts.pressed ? tr("Click to clear this filter") : tr("Click to filter the list"), onclick: opts.onclick }, kids);
}
// Fifth tile. Normally the shared list (lapsed and dormant clients the whole
// team works). If a sales rep leaves and their clients have not been moved yet,
// it becomes "Owner has left" so the gap cannot sit unnoticed.
const OWNER_TILE_KEYS = ["__orphaned", "__unassigned"];
function ownerTile(st, f, locked) {
  const orphaned = !locked && st.orphaned && st.orphaned.clients > 0;
  const key = orphaned ? "__orphaned" : "__unassigned";
  const pressed = f.owner === key && f.type === "retail";
  const onclick = locked ? null : () => setFilter(pressed ? { owner: "", type: "" } : { owner: key, type: "retail" });
  if (orphaned) {
    return tile({ label: tr("Owner has left"), tone: "critical",
      val: String(st.orphaned.clients),
      sub: tr("{spend} of retail spend", { spend: fmtUZS(st.orphaned.spend) }),
      subTitle: fullUZS(st.orphaned.spend) + " — " + tr("Retail clients whose owner is no longer an assignable sales rep"),
      pressed, onclick });
  }
  const shared = (!locked && st.by_owner && (st.by_owner[SHARED] || st.by_owner.Unassigned)) || null;
  return tile({ label: tr(SHARED),
    val: locked ? "—" : String(shared ? shared.clients : 0),
    sub: locked ? "——" : tr("{spend} · lapsed and dormant", { spend: fmtUZS(shared ? shared.spend : 0) }),
    subTitle: locked ? "" : fullUZS(shared ? shared.spend : 0) + " — " + tr("Retail clients on the shared win-back list, worked by the whole team"),
    pressed, onclick });
}
// v14: three tiles do the day's work — what needs deciding, what needs
// confirming, what is done. The other three are reference, not a task, and
// fold away behind a toggle that each device remembers.
const MORE_TILES_KEY = "crm_tiles_more";
function moreTilesOpen() { return pref(MORE_TILES_KEY) === "1"; }
function renderScoreboard() {
  const host = $("#scoreboard");
  if (!host) return;
  host.innerHTML = "";
  const t = S.ref && S.ref.totals, st = S.stats;
  const locked = S.locked || !t || !st;
  const f = S.f;
  const more = moreTilesOpen();
  host.classList.toggle("more-open", more);
  const toggle = (status) => () => setFilter({ status: f.status === status ? "" : status });
  host.append(
    tile({ label: tr("Needs a decision"), tone: "serious",
      val: locked ? "—" : String(t.decision),
      sub: locked ? "——" : tr("{n} where the sources differ", { n: pl(t.conflict_fields, "field") }),
      pressed: f.status === "decision", onclick: locked ? null : toggle("decision") }),
    tile({ label: tr("Needs confirming"), tone: "warning",
      val: locked ? "—" : String(t.confirm),
      sub: locked ? "——" : tr("{n} from one source only", { n: pl(t.gap_fields, "field") }),
      pressed: f.status === "confirm", onclick: locked ? null : toggle("confirm") }),
    tile({ label: tr("Done"), tone: "good",
      val: locked ? "—" : String(t.done),
      sub: locked ? "——" : tr("{checked} checked · {clean} matched", { checked: t.checked, clean: t.clean }),
      pressed: f.status === "done", onclick: locked ? null : toggle("done") }),
  );
  if (more) {
    host.append(
      tile({ label: tr("Set aside"),
        val: locked ? "—" : String(t.set_aside),
        sub: locked ? "——" : tr("waiting on the client or a check"),
        pressed: f.status === "set_aside", onclick: locked ? null : toggle("set_aside") }),
      ownerTile(st, f, locked),
      tile({ label: tr("Retail clients"),
        val: locked ? "—" : String(st.clients),
        sub: locked ? "——" : tr("{spend} lifetime · {n} related excluded",
          { spend: fmtUZS(st.total_spend), n: st.related_party ? st.related_party.clients : 0 }),
        subTitle: locked ? "" : fullUZS(st.total_spend),
        pressed: f.type === "retail" && !OWNER_TILE_KEYS.includes(f.owner),
        onclick: locked ? null : () => setFilter({ type: f.type === "retail" && !OWNER_TILE_KEYS.includes(f.owner) ? "" : "retail",
          owner: OWNER_TILE_KEYS.includes(f.owner) ? "" : f.owner }) }),
    );
  }
  host.append(el("button", { class: "stat tiles-more", type: "button", "aria-expanded": more ? "true" : "false",
    onclick: () => { pref(MORE_TILES_KEY, more ? null : "1"); renderScoreboard(); syncSticky(); },
    title: more ? tr("Show fewer figures") : tr("Show the other figures") }, [
    el("span", { class: "tm-chev", "aria-hidden": "true", text: more ? "‹" : "›" }),
    el("span", { class: "tm-l", text: more ? tr("Fewer") : tr("3 more") }),
  ]));
}
// The clean-up at a glance: done, set aside, still to do.
function renderProgress() {
  const host = $("#progress");
  if (!host) return;
  host.innerHTML = "";
  const t = S.ref && S.ref.totals;
  if (S.locked || !t) { host.appendChild(el("div", { class: "progress-bar skel" })); return; }
  const total = t.records || 1, done = t.done, aside = t.set_aside, togo = t.decision + t.confirm;
  const pct = (n) => Math.round((n / total) * 1000) / 10 + "%";
  const week = S.ref.activity ? S.ref.activity.week : 0;
  host.append(
    el("div", { class: "progress-head" }, [
      el("span", { class: "progress-title", text: tr("Clean-up progress") }),
      // v14: two facts here, the rest on the bar itself. Five of them read as a
      // paragraph in a toolbar and nobody reads a paragraph in a toolbar.
      el("span", { class: "progress-text",
        title: tr("{n} set aside", { n: aside }) + " · " + tr("{n} worked on this week", { n: pl(week, "record") }) +
          (t.leads ? " · " + tr("{n} Telegram leads outside the clean-up", { n: t.leads }) : "") }, [
        el("b", { text: tr("{done} of {total} records done", { done, total: t.records }) }),
        " · " + tr("{n} to go", { n: togo }),
      ]),
    ]),
    el("div", { class: "progress-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(t.records),
      "aria-valuenow": String(done), "aria-label": tr("Clean-up progress") }, [
      el("span", { class: "seg done", style: "width:" + pct(done) }),
      el("span", { class: "seg aside", style: "width:" + pct(aside) }),
    ]),
  );
}

/* ---------------------------------------------------------------- toolbar */
function ownerOptions() {
  const opts = [["", tr("All owners")], ["__assignable", tr("Current sales reps")], ["__unassigned", tr(SHARED)], ["__orphaned", tr("Owner has left")]];
  const reps = (S.ref && S.ref.sales_reps) || [];
  const active = reps.filter((r) => r.active && !isShared(r.label));
  const former = reps.filter((r) => !r.active);
  for (const r of active) opts.push([r.label, who(r.label)]);
  for (const r of former) opts.push([r.label, tr("{label} (left)", { label: who(r.label) })]);
  return opts;
}
function selectField(label, key, options) {
  const s = el("select", { "data-key": key, "aria-label": label,
    onchange: (e) => setFilter({ [key]: e.target.value }) },
    options.map(([v, t]) => el("option", { value: v, text: t })));
  s.value = selectValue(key);
  return el("label", { class: "field" }, [el("span", { text: label }), s]);
}
const FILTER_KEYS = ["status", "owner", "type", "abc_class", "lifecycle_status"];
let searchTimer = null;
function renderToolbar() {
  if (isPhone()) return renderSearchPhone();
  const q = el("input", { type: "search", placeholder: tr("Name, reference or phone"), value: S.f.q,
    "aria-label": tr("Search by name, client reference or phone number"),
    onfocus: () => { S.searchOpen = true; renderRecentDrop(); },
    onblur: () => { setTimeout(() => { S.searchOpen = false; renderRecentDrop(); }, 120); },
    onkeydown: (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();                       // the panel's handler stays out of it
      if (S.searchOpen && $(".recent-drop")) { S.searchOpen = false; renderRecentDrop(); }
      else e.target.blur();
    },
    oninput: (e) => { clearTimeout(searchTimer); const v = e.target.value.trim(); searchTimer = setTimeout(() => setFilter({ q: v }), 280); } });
  const tx = (list) => list.map(([v, t]) => [v, tr(t)]);
  // v14: one row — search, what is switched on, and the two actions. Everything
  // else opens on request. ABC and Lifecycle have gone from here altogether:
  // their column headings already hold the same checklist, and the bar was
  // carrying nine controls on the chance one of them was wanted.
  return el("div", { class: "toolbar" + (S.filtersOpen ? " open" : ""), id: "toolbar" }, [
    el("label", { class: "field search" }, [el("span", { class: "sr-only", text: tr("Search") }), q]),
    el("button", { class: "btn filters-toggle", type: "button", "aria-expanded": S.filtersOpen ? "true" : "false",
      "aria-controls": "filters", onclick: () => toggleFilters(), text: filtersLabel() }),
    el("div", { class: "fpills", id: "fpills", role: "group", "aria-label": tr("Filters in force") }),
    canAdd() || canExport() ? el("div", { class: "add-field" }, [addClientButton(), exportButton()]) : null,
    el("div", { class: "filters", id: "filters" }, [
      selectField(tr("Status"), "status", withMulti("status", tx(STATUS_OPTIONS))),
      selectField(tr("Owner"), "owner", withMulti("owner", ownerOptions())),
      selectField(tr("Records"), "type", tx(TYPES)),
      segmentField(),
      selectField(tr("Not contacted"), "contact", tx(CONTACT_FILTER)),
      selectField(tr("Sort"), "sort", sortOptions()),
      el("div", { class: "field reset" }, [el("span", { "aria-hidden": "true", text: " " }),
        el("button", { class: "btn subtle", type: "button", onclick: resetFilters, text: tr("Reset") })]),
    ]),
  ]);
}
const filtersLabel = () => { const n = activeFilterCount(); return n ? tr("Filters ({n})", { n }) : tr("Filters"); };
function toggleFilters(open) {
  S.filtersOpen = typeof open === "boolean" ? open : !S.filtersOpen;
  const bar = $("#toolbar");
  if (bar) bar.classList.toggle("open", S.filtersOpen);
  const btn = $(".filters-toggle");
  if (btn) btn.setAttribute("aria-expanded", S.filtersOpen ? "true" : "false");
  if (S.filtersOpen) { const first = $("#filters select"); if (first) first.focus(); }
  syncSticky();
}
// Each filter in force, as a pill that can take itself off. That is the point
// of folding the bar: the screen says what is on, not what is available.
function renderPills() {
  const host = $("#fpills");
  if (!host) return;
  host.innerHTML = "";
  for (const p of activeFilterPills()) {
    host.appendChild(el("span", { class: "fpill" }, [
      el("b", { text: p.label }), el("span", { class: "fpv", text: p.value }),
      el("button", { type: "button", class: "x", title: tr("Remove this filter"),
        "aria-label": tr("Remove this filter") + ": " + p.label + " " + p.value,
        onclick: p.clear, text: "×" }),
    ]));
  }
  if (host.children.length > 1) {
    host.appendChild(el("button", { type: "button", class: "linkish clear-all", onclick: resetFilters, text: tr("Clear all") }));
  }
}
// The pinned header's height changes (the tiles fold, the language switches),
// so the sticky offsets are measured rather than guessed.
function syncSticky() {
  const r = document.documentElement.style;
  const top = $(".top"), bar = $("#toolbar");
  r.setProperty("--top-h", (top ? Math.round(top.getBoundingClientRect().height) : 0) + "px");
  r.setProperty("--bar-h", (bar && !isPhone() ? Math.round(bar.getBoundingClientRect().height) : 0) + "px");
}
window.addEventListener("resize", () => { clearTimeout(syncSticky.t); syncSticky.t = setTimeout(syncSticky, 120); });

function renderToolbarValues() {
  refreshSelects();
  const btn = $(".filters-toggle");
  if (btn) btn.textContent = filtersLabel();
  renderPills();
  renderScoreboard();
  renderQuick();
  syncSticky();
}
function resetFilters() {
  S.f = blankFilters(); S.walkId = null;
  const q = $("#toolbar input[type=search]");
  if (q) q.value = "";
  const fq = $("#find-q");
  if (fq) fq.value = "";
  renderToolbarValues();
  loadList();
}

/* ------------------------------------------------------------------- list */
function sourceLine(r) {
  if (r.added_by_hand) return tr("Added by the team") + (blank(r.how_met) ? "" : " · " + tr(r.how_met));
  const tg = sourceLineTg(r);
  if (tg) return tg;
  if (r.in_colibri && r.in_marketing) return tr("Colibri + questionnaire");
  if (r.in_colibri) return tr("Colibri only");
  if (r.in_marketing) return tr("Questionnaire only");
  return "—";
}
function statusChip(r) {
  const key = r.review_status || (r.queue_class === "conflict" ? "decision" : r.queue_class === "gap" ? "confirm" : "clean");
  const def = STATUS[key] || STATUS.clean;
  let text = tr(def.label);
  if (key === "decision") {
    text = tr("{n} differ", { n: r.conflict_fields }) + (r.gap_fields ? " · " + tr("{n} to confirm", { n: r.gap_fields }) : "");
  } else if (key === "confirm") text = tr("{n} to confirm", { n: r.gap_fields });
  else if (key === "merged" && r.merged_into) text = tr("Merged") + " " + tr("into {id}", { id: r.merged_into });
  return chip(def, text);
}
function ownerCell(r) {
  if (blank(r.client_owner)) return el("span", { class: "muted", text: "—" });
  const kids = [el("span", { text: who(r.client_owner) })];
  if (ownerHasLeft(r.client_owner, r.owner_active)) kids.push(el("span", { class: "left-mark", text: tr("has left") }));
  return el("span", {}, kids);
}
const dncChip = () => chip({ glyph: "⊘", tone: "critical" }, tr("Do not contact"), "dnc");
function renderRow(r) {
  const open = () => openCard(r.client_id);
  const name = blank(r.display_name) ? tr("Unnamed record") : r.display_name;
  return el("tr", { tabindex: S.locked ? null : "0", "data-id": r.client_id, "aria-label": tr("Open {id}", { id: r.client_id }) + " — " + name,
    class: [r.review_status === "deleted" || r.review_status === "merged" ? "closed" : "", r.client_id === S.cardId ? "sel" : ""].join(" ").trim() || null,
    onclick: open, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } } }, [
    // v14: the name leads; the reference, where the record came from and any
    // marks share one line under it instead of taking two.
    el("td", { class: "col-ref" }, [
      el("div", { class: "nm", text: name }),
      el("div", { class: "ref" }, [
        el("span", { class: "id", text: r.client_id }),
        el("span", { class: "src", text: sourceLine(r) }),
        r.related_party ? chip({ glyph: "◇", tone: "" }, tr("Related"), "dashed") : null,
        r.record_type === "prospect" ? chip({ glyph: "○", tone: "" }, tr("Prospect")) : null,
        r.do_not_contact ? dncChip() : null,
      ]),
    ]),
    el("td", { class: "col-review" }, [statusChip(r)]),
    el("td", { class: "col-abc" }, [r.abc_class ? el("span", { class: "abc", "data-c": r.abc_class, text: r.abc_class }) : el("span", { class: "muted", text: "—" })]),
    el("td", { class: "col-seg", text: trv(r.rfm_segment) }),
    el("td", { class: "col-life", text: trv(r.lifecycle_status) }),
    el("td", { class: "col-owner" }, [ownerCell(r)]),
    el("td", { class: "col-last num", text: fmtDate(r.last_purchase_at) }),
    contactCell(r),
    el("td", { class: "col-spend num", title: fullUZS(r.lifetime_spend_uzs), text: fmtUZS(r.lifetime_spend_uzs) }),
    el("td", { class: "col-meta" }, [
      r.abc_class ? el("span", { text: tr("Class {c}", { c: r.abc_class }) }) : null,
      r.lifecycle_status ? el("span", { text: tr(r.lifecycle_status) }) : null,
      !blank(r.client_owner) ? el("span", {}, [ownerCell(r)]) : null,
      r.last_purchase_at ? el("span", { text: tr("Last {d}", { d: fmtDate(r.last_purchase_at) }) }) : null,
      r.last_contact_on ? el("span", { class: "m-contact", text: tr("Contacted {d}", { d: fmtDate(r.last_contact_on) }) }) : null,
    ]),
  ]);
}
function renderListHost() {
  const host = $("#list-host");
  if (!host) return;
  const headFocus = headFocusKey();
  host.innerHTML = "";
  host.setAttribute("aria-busy", S.loading ? "true" : "false");

  const from = S.total ? S.f.offset + 1 : 0, to = Math.min(S.f.offset + PAGE, S.total);
  host.appendChild(el("div", { class: "listbar", role: "status", "aria-live": "polite" }, S.locked ? [] : [
    el("span", {}, [S.loading ? tr("Loading…") + " " : "", tr("Showing") + " ", el("b", { text: from + "–" + to }), " " + tr("of") + " ", el("b", { text: String(S.total) })]),
    // v14: on a desktop the filter bar's pills say all of this, so the line
    // here keeps to the count. The phone has no pills and still needs it.
    isPhone() ? el("span", { class: "scope", text: describeFilters() }) : null,
    isPhone() && S.f.drill && S.f.drill.label ? el("span", { class: "drill" }, [
      el("span", { class: "muted", text: tr("From insights") + ":" }), el("b", { text: S.f.drill.label }),
      el("button", { type: "button", class: "x", "aria-label": tr("Remove this filter") + ": " + S.f.drill.label, title: tr("Remove this filter"),
        onclick: () => { S.f.drill = null; S.f.offset = 0; renderToolbarValues(); loadList(); }, text: "×" }),
    ]) : null,
    $("#counts-host") ? countsToggle() : null,
  ]));

  const panel = el("div", { class: "panel" });
  if (S.error && !S.locked) {
    panel.appendChild(el("div", { class: "err-box" }, [
      el("p", { text: S.error }),
      el("button", { class: "btn", type: "button", onclick: loadList, text: tr("Try again") }),
    ]));
  } else if (!S.rows.length && !S.locked) {
    panel.appendChild(el("div", { class: "empty" }, [
      el("p", { text: tr("No records match these filters.") }),
      el("button", { class: "btn", type: "button", onclick: resetFilters, text: tr("Clear filters") }),
    ]));
  } else {
    const table = el("table", { class: "clients" + (S.loading ? " loading-list" : "") }, [
      el("caption", { class: "sr-only", text: tr("Client records") }),
      el("thead", {}, [listHeader()]),
      el("tbody", {}, S.rows.map(renderRow)),
    ]);
    panel.appendChild(table);
    if (!S.locked && S.total > PAGE) {
      panel.appendChild(el("div", { class: "pager" }, [
        el("button", { class: "btn sm", type: "button", disabled: S.f.offset === 0 ? true : null,
          onclick: () => setFilter({ offset: Math.max(0, S.f.offset - PAGE) }), text: tr("← Previous") }),
        el("span", { text: tr("Page {n} of {m}", { n: Math.floor(S.f.offset / PAGE) + 1, m: Math.ceil(S.total / PAGE) }) }),
        el("button", { class: "btn sm", type: "button", disabled: S.f.offset + PAGE >= S.total ? true : null,
          onclick: () => setFilter({ offset: S.f.offset + PAGE }), text: tr("Next →") }),
      ]));
    }
  }
  host.appendChild(panel);
  restoreHeadFocus(headFocus);
}
function describeFilters() {
  const f = S.f, parts = [];
  if (f.status) parts.push(tr((STATUS_OPTIONS.find((o) => o[0] === f.status) || ["", f.status])[1]).toLowerCase());
  if (f.type) parts.push(tr((TYPES.find((t) => t[0] === f.type) || ["", ""])[1]).toLowerCase());
  if (f.owner) parts.push(tr("owner: {o}", { o: ((ownerOptions().find((o) => o[0] === f.owner) || ["", f.owner])[1]).toLowerCase() }));
  if (f.abc_class) parts.push(tr("class {c}", { c: f.abc_class }));
  if (f.lifecycle_status) parts.push(tr(f.lifecycle_status).toLowerCase());
  parts.push(...describeFiltersX());
  if (f.quick && QUICK_SCOPE[f.quick]) parts.push(tr(QUICK_SCOPE[f.quick]));
  if (f.dnc_out) parts.push(tr("do-not-contact left out"));
  if (f.q) parts.push("“" + f.q + "”");
  return parts.length ? "· " + parts.join(" · ") : "";
}

/* ------------------------------------------------------------------ drawer */
// how: "push" adds a history step (back closes the card), "replace" swaps the
// card in the current step (another row while a card is open), "none" is the
// history itself moving.
async function openCard(id, how) {
  if (S.locked) return;
  const wasOpen = !!S.cardId;
  if (!wasOpen) S.lastFocus = document.activeElement;
  if (!S.cardTab) S.cardTab = defaultCardTab();
  const mode = how || (wasOpen ? "replace" : "push");
  const url = baseUrl() + "#" + id;
  if (mode === "push") pushOverlay("card", url);
  else if (mode === "replace" && location.hash !== "#" + id) { try { history.replaceState(history.state, "", url); } catch (e) { /* ignore */ } }
  S.cardId = id; S.card = null; S.cardError = null; S.edit = null; S.formError = null; S.purBrand = "";
  renderDrawer();
  try {
    const data = await call("client", { id });
    if (S.cardId !== id) return;
    S.card = data;
    addRecent(id);
  } catch (e) {
    if (S.cardId !== id) return;
    S.cardError = e.message;
  }
  renderDrawer();
}
function closeCard(fromHistory) {
  if (!S.cardId) return;
  const closedId = S.cardId;
  S.cardId = null; S.card = null; S.cardError = null; S.edit = null; S.formError = null;
  const d = $("#drawer");
  d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("open");
  if (!fromHistory && !popOverlay("card") && location.hash) {
    try { history.replaceState(history.state, "", baseUrl()); } catch (e) { /* ignore */ }
  }
  syncSplit();
  loadRecent();
  // The list may have been redrawn while the card was open (after a save), so
  // fall back to the row for this record, then to the list itself.
  let back = S.lastFocus && document.contains(S.lastFocus) ? S.lastFocus : null;
  if (!back && S.lastFocus && S.lastFocus.dataset && S.lastFocus.dataset.id) {
    back = document.querySelector('table.clients tr[data-id="' + S.lastFocus.dataset.id + '"]');
  }
  if (!back) back = document.querySelector('table.clients tr[data-id="' + closedId + '"]') || document.querySelector('[data-id="' + closedId + '"]');
  if (back) back.focus();
}
function bestName(c) {
  return c.name_confirmed || c.name_colibri || c.name_marketing || c.name_telegram || tr("Unnamed record");
}
function mappedValue(field, raw) {
  if (blank(raw)) return null;
  const m = ((S.ref && S.ref.value_mappings) || []).find((x) => x.field === field && x.raw_value === raw);
  return m || null;
}
const recordClosed = (c) => c.record_state === "merged" || c.record_state === "deleted" || c.record_state === "to_delete";
const editable = (c) => canEdit() && !recordClosed(c);

/* ---- writes: one at a time, the card redraws from the server's answer ---- */
async function act(action, payload, okMsg) {
  if (S.busy) return;
  S.busy = true; S.formError = null;
  renderDrawer();
  try {
    const data = await call(action, { id: S.cardId, ...payload });
    S.card = data;
    // After a merge the card is the kept record: its address changes once the
    // form's history step is gone.
    const newId = data.client && data.client.client_id !== S.cardId ? data.client.client_id : null;
    if (newId) S.cardId = newId;
    const fixUrl = () => { if (newId) { try { history.replaceState(history.state, "", baseUrl() + "#" + newId); } catch (e) { /* ignore */ } } };
    if (S.edit) popOverlay("edit", fixUrl); else fixUrl();
    S.edit = null;
    toast(okMsg || tr("Saved."));
    refreshBehind();
  } catch (e) {
    S.formError = e.message;
  }
  S.busy = false;
  renderDrawer();
  const h = $("#drawer-title");
  if (h && !S.edit) h.focus();
}
// Which card tab each form lives on.
const EDIT_TAB = { field: "cleanup", park: "cleanup", delete: "cleanup", merge: "cleanup", lookup: "cleanup",
  owner: "overview", contact: "overview", note: "history" };
function startEdit(edit) {
  if (!S.edit && S.cardId) pushOverlay("edit");
  S.edit = edit; S.formError = null;
  if (EDIT_TAB[edit.kind] && S.cardTab !== EDIT_TAB[edit.kind]) S.cardTab = EDIT_TAB[edit.kind];
  renderDrawer();
  const first = $("#drawer .editor input:not([type=radio]), #drawer .editor textarea, #drawer .editor select, #drawer .editor input[type=radio]");
  if (first) first.focus();
}
function cancelEdit() { S.edit = null; S.formError = null; popOverlay("edit"); renderDrawer(); }
function formError() {
  return S.formError ? el("p", { class: "form-err", role: "alert", text: S.formError }) : null;
}
function formButtons(saveLabel, onSave, danger) {
  return el("div", { class: "form-actions" }, [
    el("button", { class: "btn " + (danger ? "danger" : "primary"), type: "submit", disabled: S.busy ? true : null,
      text: S.busy ? tr("Saving…") : saveLabel }),
    el("button", { class: "btn subtle", type: "button", onclick: cancelEdit, disabled: S.busy ? true : null, text: tr("Cancel") }),
  ]);
}
function radio(name, value, checked, label, onpick, extra) {
  return el("label", { class: "opt" }, [
    el("input", { type: "radio", name, value, checked: checked ? true : null, onchange: () => onpick(value) }),
    el("span", {}, [label, extra || null]),
  ]);
}

/* ------------------------------------------------------------ card: status */
function sectionReview(data) {
  const c = data.client, q = data.queue || {};
  const status = q.review_status;
  const kids = [];
  const flags = [c.name_flag, c.phone_flag, c.gender_flag, c.dob_flag];
  const nConf = flags.filter((f) => f === "conflict").length;
  const nGap = flags.filter((f) => f === "gap").length;

  if (c.record_state === "merged") {
    kids.push(el("div", { class: "banner" }, [
      el("span", { text: tr("This record was merged into {id}.", { id: c.merged_into }) + " " }),
      el("a", { href: "#" + c.merged_into, text: tr("Open {id}", { id: c.merged_into }) }),
    ]));
    return el("section", { class: "drawer-section review" }, kids);
  }
  if (c.record_state === "deleted" || c.record_state === "to_delete") {
    kids.push(el("div", { class: "banner critical" }, [
      el("b", { text: tr("Deleted by {by}, {d}", { by: who(c.state_by) || "—", d: fmtDate(c.state_at) }) }),
      c.state_reason ? el("span", { text: " — " + c.state_reason }) : null,
    ]));
    if (canEdit()) kids.push(el("div", { class: "actions" }, [
      el("button", { class: "btn", type: "button", disabled: S.busy ? true : null,
        onclick: () => act("set_state", { state: "open" }, tr("Restored.")), text: tr("Restore") })]));
    kids.push(formError());
    return el("section", { class: "drawer-section review" }, kids);
  }

  const line = status === "lead"
    ? tr("A Telegram lead, outside the identity review. If it is someone already in the file, merge it with their record; if it is not a client, delete it.")
    : nConf || nGap
    ? [nConf ? tr(nConf === 1 ? "{n} field needs a decision" : "{n} fields need a decision", { n: nConf }) : "",
       nConf && nGap ? " · " : "",
       nGap ? tr(nGap === 1 ? "{n} field needs confirming" : "{n} fields need confirming", { n: nGap }) : ""].join("")
    : tr("Every field is settled.");
  kids.push(el("div", { class: "review-head" }, [
    el("h3", { text: tr("Review") }),
    status ? statusChip(q) : null,
  ]));
  kids.push(el("p", { class: "summary-line" + (nConf || nGap || status === "lead" ? "" : " ok"), text: line }));
  if (c.record_state === "confirmed") {
    kids.push(el("p", { class: "meta-line", text: tr("Checked by {by}, {d}", { by: who(c.reviewed_by || c.state_by) || "—", d: fmtDate(c.reviewed_at || c.state_at) }) }));
  }
  if (c.record_state === "parked") {
    kids.push(el("div", { class: "banner" }, [
      el("b", { text: tr("Set aside by {by}, {d}", { by: who(c.state_by) || "—", d: fmtDate(c.state_at) }) }),
      c.state_reason ? el("span", { text: " — " + c.state_reason }) : null,
    ]));
  }

  if (!canEdit()) {
    kids.push(el("p", { class: "readonly-note", text: tr("View only. Ask Alex if you need to change records.") }));
    return el("section", { class: "drawer-section review" }, kids);
  }

  const b = (label, onclick, opts = {}) => el("button", { class: "btn" + (opts.cls ? " " + opts.cls : ""), type: "button",
    disabled: S.busy || opts.disabled ? true : null, title: opts.title || null, onclick, text: label });
  const actions = [];
  if (nGap) actions.push(b(tr("Accept single-source values ({n})", { n: nGap }),
    () => act("accept_single_source", {}, tr("Saved.")),
    { title: tr("Takes each value held by only one source as it is. You can change any of them afterwards.") }));
  if (c.record_state === "open") {
    actions.push(b(tr("Mark as checked"), () => act("set_state", { state: "confirmed" }, tr("Marked as checked.")),
      { cls: "primary", disabled: nConf > 0, title: nConf ? tr("Settle the fields where the sources differ first.") : null }));
    actions.push(b(tr("Set aside…"), () => startEdit({ kind: "park", reason: "" }), { cls: "subtle" }));
  } else {
    actions.push(b(tr("Reopen"), () => act("set_state", { state: "open" }, tr("Reopened.")), { cls: "subtle" }));
  }
  actions.push(b(tr("Delete…"), () => startEdit({ kind: "delete", reason: "" }), { cls: "subtle danger-text" }));
  kids.push(el("div", { class: "actions" }, actions));

  if (S.edit && (S.edit.kind === "park" || S.edit.kind === "delete")) {
    if (!sheetMode()) kids.push(stateForm(c));      // on a phone it opens as a panel instead
  } else if (!S.edit) {
    kids.push(formError());
  }
  return el("section", { class: "drawer-section review" }, kids);
}
// Set aside or delete, with a reason.
function stateForm(c) {
  const del = S.edit.kind === "delete";
  const input = el("input", { type: "text", id: "state-reason", maxlength: "300", value: S.edit.reason,
    placeholder: tr(del ? "Why delete it? E.g. test entry, not a client" : "Why is it set aside? E.g. client not reachable"),
    oninput: (e) => { S.edit.reason = e.target.value; } });
  return el("form", { class: "editor", onsubmit: (e) => { e.preventDefault();
    act("set_state", { state: del ? "deleted" : "parked", reason: S.edit.reason }, tr(del ? "Deleted." : "Set aside.")); } }, [
    el("label", { for: "state-reason", class: "lbl", text: tr("Reason") }), input,
    del ? el("p", { class: "hint", text: tr("Deleted records drop out of every list and figure. They can be restored.") }) : null,
    formError(),
    formButtons(tr(del ? "Delete…" : "Set aside…").replace("…", ""), null, del),
  ]);
}

/* ---------------------------------------------------------- card: identity */
function flagChip(flag) { return chip(FLAG[flag] || FLAG.none); }
// On a phone the status column folds under the field name, so rows that span
// the table span three columns, not four.
const spanAll = () => (window.matchMedia("(max-width: 720px)").matches ? "3" : "4");
function fieldValues(c, field) {
  if (field === "name") return [c.name_colibri, c.name_marketing];
  if (field === "gender") return [c.gender_colibri ? fmtGender(c.gender_colibri) : "", c.gender_marketing ? fmtGender(c.gender_marketing) : ""];
  if (field === "dob") return [c.dob_colibri ? fmtDate(c.dob_colibri) : "", c.dob_marketing ? fmtDate(c.dob_marketing) : ""];
  return ["", ""];
}
function confirmedValue(c, field) {
  if (field === "name") return c.name_confirmed;
  if (field === "gender") return c.gender_confirmed ? fmtGender(c.gender_confirmed) : "";
  if (field === "dob") return c.dob_confirmed ? fmtDate(c.dob_confirmed) : "";
  if (field === "phone") return fmtPhone(c.phone_confirmed);
  return "";
}
function fieldAction(c, field, flag) {
  if (!editable(c)) return null;
  if (S.edit && S.edit.kind === "field" && S.edit.field === field) return null;
  const hasCol = !blank(fieldValues(c, field)[0]);
  const hasMkt = !blank(fieldValues(c, field)[1]);
  const label = flag === "conflict" ? tr("Decide") : flag === "gap" ? tr("Confirm") : flag === "none" ? tr("Add") : tr("Change");
  const preset = field === "phone" ? (flag === "gap" || flag === "none" ? phonePreset(c, flag) : "")
    : flag === "gap" ? (hasCol ? "colibri" : hasMkt ? "marketing" : "") : "";
  return el("button", { class: "btn sm" + (flag === "conflict" || flag === "gap" ? "" : " subtle"), type: "button",
    disabled: S.busy ? true : null, "data-field": field,
    onclick: () => startEdit({ kind: "field", field, source: flag === "none" && field !== "phone" ? "value" : preset, value: "", basis: "" }), text: label });
}
// dd.mm.yyyy on screen, ISO to the server.
function maskDmy(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 8);
  return d.slice(0, 2) + (d.length > 2 ? "." + d.slice(2, 4) : "") + (d.length > 4 ? "." + d.slice(4) : "");
}
function dmyToIso(t) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(t || ""));
  if (!m) return null;
  const [dd, mm, yy] = [+m[1], +m[2], +m[3]];
  const x = new Date(Date.UTC(yy, mm - 1, dd));
  if (x.getUTCFullYear() !== yy || x.getUTCMonth() !== mm - 1 || x.getUTCDate() !== dd) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
function fieldEditor(c, field, flag, meta) {
  return el("tr", { class: "editor-row" }, [el("td", { colspan: spanAll() }, [fieldForm(c, field, flag, meta)])]);
}
function fieldForm(c, field, flag, meta) {
  const e = S.edit;
  const [col, mkt] = fieldValues(c, field);
  const opts = [];
  const pick = (v) => { e.source = v; const other = $("#fe-other"); if (other) other.disabled = v !== "value"; };
  if (field === "phone") {
    opts.push(...phoneOptions(c, e, pick));
  } else {
    if (!blank(col)) opts.push(radio("fe-src", "colibri", e.source === "colibri", tr("From Colibri") + ": ", pick, el("b", { text: col })));
    if (!blank(mkt)) opts.push(radio("fe-src", "marketing", e.source === "marketing", tr("From the questionnaire") + ": ", pick, el("b", { text: mkt })));
    let other;
    if (field === "gender") {
      other = el("select", { id: "fe-other", disabled: e.source !== "value" ? true : null, onchange: (ev) => { e.value = ev.target.value; } }, [
        el("option", { value: "", text: "—" }), el("option", { value: "F", text: tr("Female") }), el("option", { value: "M", text: tr("Male") })]);
      other.value = e.value || "";
    } else if (field === "dob") {
      // Typed as dd.mm.yyyy whatever the browser's language: a native date box
      // shows mm/dd/yyyy on an English browser, and opens a year-by-year wheel.
      other = el("input", { id: "fe-other", type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "10",
        placeholder: tr("dd.mm.yyyy"), "aria-label": tr("Date of birth, dd.mm.yyyy"),
        value: e.text != null ? e.text : isoToDmy(e.value), disabled: e.source !== "value" ? true : null,
        oninput: (ev) => { const t = maskDmy(ev.target.value); if (t !== ev.target.value) ev.target.value = t;
          e.text = t; e.value = dmyToIso(t) || ""; } });
    } else {
      other = el("input", { id: "fe-other", type: "text", maxlength: "120", value: e.value || "", disabled: e.source !== "value" ? true : null,
        oninput: (ev) => { e.value = ev.target.value; } });
    }
    opts.push(el("div", { class: "opt other" }, [
      radio("fe-src", "value", e.source === "value", tr("Something else"), pick), other]));
  }
  const bases = [
    radio("fe-basis", "client", e.basis === "client", tr("The client confirmed it"), (v) => { e.basis = v; }),
    radio("fe-basis", "delardi", e.basis === "delardi", tr("From our own records"), (v) => { e.basis = v; }),
  ];
  const settled = HUMAN_FLAGS.includes(flag);
  const submit = (ev) => {
    ev.preventDefault();
    if (field === "dob" && e.source === "value" && !blank(e.text) && !e.value) { S.formError = tr("Enter the date as dd.mm.yyyy, for example 14.03.1988."); renderDrawer(); return; }
    if (!e.source || (e.source === "value" && blank(e.value))) { S.formError = tr("Choose a value."); renderDrawer(); return; }
    if (field === "phone" && phoneTypedError(e)) { S.formError = phoneTypedError(e); renderDrawer(); return; }
    if (!e.basis) { S.formError = tr("Say how you know."); renderDrawer(); return; }
    act("resolve_field", { field, source: e.source, value: e.source === "value" ? e.value : null, basis: e.basis }, tr("Saved."));
  };
  return el("form", { class: "editor", onsubmit: submit }, [
    el("fieldset", {}, [el("legend", { text: tr("Which value is right?") }), ...opts]),
    el("fieldset", {}, [el("legend", { text: tr("How do you know?") }), ...bases]),
    settled ? el("button", { class: "btn subtle sm reset-field", type: "button", disabled: S.busy ? true : null,
      onclick: () => act("reset_field", { field }, tr("Saved.")), text: tr("Back to the automatic comparison") }) : null,
    formError(),
    formButtons(tr("Save")),
  ]);
}
function metaLine(meta) {
  if (!meta) return null;
  return el("span", { class: "by", text: tr("{by}, {d}", { by: who(meta.by) || "—", d: fmtDate(meta.at) }) });
}
function sectionCompare(data) {
  const c = data.client, meta = data.field_meta || {};
  const fieldCell = (field, label, flag) => el("td", { class: "f" }, [
    el("span", { class: "fl", text: label }), el("span", { class: "st-inline" }, [
      flagChip(flag),
      HUMAN_FLAGS.includes(flag) ? metaLine(meta[field]) : null,
      fieldAction(c, field, flag),
    ])]);
  const statusCell = (field, flag) => el("td", { class: "st" }, [
    flagChip(flag),
    HUMAN_FLAGS.includes(flag) ? metaLine(meta[field]) : null,
    fieldAction(c, field, flag),
  ]);
  const rows = [];
  const add = (field) => {
    const flag = c[field + "_flag"] || "none";
    const settled = HUMAN_FLAGS.includes(flag);
    let cells;
    if (field === "phone") {
      cells = phoneCells(c);
    } else {
      const [a, b] = fieldValues(c, field);
      cells = [el("td", { text: blank(a) ? "—" : a }), el("td", { text: blank(b) ? "—" : b })];
    }
    rows.push(el("tr", { class: flag === "conflict" ? "diff" : null, "data-row": field }, [
      fieldCell(field, tr(FIELD_LABEL[field]), flag), ...cells, statusCell(field, flag)]));
    if (settled && !blank(confirmedValue(c, field))) {
      rows.push(el("tr", { class: "confirmed-row" }, [el("td", { colspan: spanAll() }, [
        el("span", { class: "muted", text: "→ " }), el("b", { text: confirmedValue(c, field) })])]));
    }
    if (S.edit && S.edit.kind === "field" && S.edit.field === field && !sheetMode()) rows.push(fieldEditor(c, field, flag, meta[field]));
  };
  ["name", "phone", "gender", "dob"].forEach(add);
  return el("section", { class: "drawer-section" }, [
    el("h3", {}, [tr(c.added_by_hand ? "Identity — Colibri against what the team typed" : "Identity — Colibri against the questionnaire")]),
    el("table", { class: "compare" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", { scope: "col", text: tr("Field") }), el("th", { scope: "col", text: "Colibri" }),
        el("th", { scope: "col", text: tr(c.added_by_hand ? "Entered by the team" : "Questionnaire") }),
        el("th", { scope: "col", class: "st", text: tr("Status") })])]),
      el("tbody", {}, rows),
    ]),
  ]);
}

/* -------------------------------------------------------- card: duplicates */
function mergeForm(c, other) {
  const e = S.edit;
  if (!e.keep) e.keep = Number(other.lifetime_spend_uzs || 0) > Number(c.lifetime_spend_uzs || 0) ? "other" : "this";
  const keepId = e.keep === "this" ? c.client_id : other.client_id;
  const dropId = e.keep === "this" ? other.client_id : c.client_id;
  const reason = el("input", { type: "text", id: "merge-reason", maxlength: "300", value: e.reason || "",
    oninput: (ev) => { e.reason = ev.target.value; } });
  const pick = (v) => { e.keep = v; e.confirming = false; renderDrawer(); };
  // A merge cannot be undone from the page, so it asks twice: the second time
  // in plain words, naming what closes and where the purchases go.
  const confirmBox = e.confirming ? el("div", { class: "confirm-box", role: "alert" }, [
    el("p", { text: tr("{drop} will be closed and its purchases moved to {keep}. This cannot be undone here.", { keep: keepId, drop: dropId }) }),
    el("div", { class: "form-actions" }, [
      el("button", { class: "btn danger", type: "submit", id: "merge-yes", disabled: S.busy ? true : null, text: S.busy ? tr("Saving…") : tr("Yes, merge") }),
      el("button", { class: "btn subtle", type: "button", disabled: S.busy ? true : null, onclick: () => { e.confirming = false; renderDrawer(); }, text: tr("Back") }),
    ]),
  ]) : null;
  return el("form", { class: "editor merge", onsubmit: (ev) => { ev.preventDefault();
    if (!e.confirming) { e.confirming = true; renderDrawer(); const y = $("#merge-yes"); if (y) y.focus(); return; }
    act("merge", { keep: keepId, drop: dropId, reason: e.reason }, tr("Merged. {id} now holds both records.", { id: keepId })); } }, [
    sheetMode() ? null : el("h4", { text: tr("Merge two records") }),
    el("fieldset", {}, [el("legend", { text: tr("Which record should stay?") }),
      radio("merge-keep", "this", e.keep === "this", tr("This one ({id})", { id: c.client_id }), pick,
        el("span", { class: "muted", text: " · " + fmtUZS(c.lifetime_spend_uzs) })),
      radio("merge-keep", "other", e.keep === "other", tr("The other one ({id})", { id: other.client_id }), pick,
        el("span", { class: "muted", text: " · " + (other.display_name || "") + " · " + fmtUZS(other.lifetime_spend_uzs) })),
    ]),
    el("label", { for: "merge-reason", class: "lbl", text: tr("Note (optional)") }), reason,
    el("p", { class: "hint", text: tr("The kept record takes the other's purchases and fills its blanks from it. The other record is closed and points to the kept one. This cannot be undone here — ask Alex if a merge was wrong.") }),
    formError(),
    confirmBox || formButtons(tr("Merge…"), null, true),
  ]);
}
function dupCard(d) {
  return el("div", { class: "dup-card" }, [
    el("div", {}, [el("a", { href: "#" + d.client_id, text: d.client_id }), " · ", el("b", { text: d.display_name || tr("Unnamed record") })]),
    el("div", { class: "muted", text: [fmtUZS(d.lifetime_spend_uzs), d.last_purchase_at ? tr("Last {d}", { d: fmtDate(d.last_purchase_at) }) : null,
      d.client_owner ? who(d.client_owner) : null].filter(Boolean).join(" · ") }),
  ]);
}
function sectionDuplicates(data) {
  const c = data.client, dups = data.duplicates || [];
  if (!editable(c) && !dups.length) return null;
  const kids = [el("h3", { text: tr("Possible duplicate") })];
  for (const d of dups) {
    kids.push(el("div", { class: "dup" }, [
      el("p", { class: "hint", text: tr("Same phone number as this record. Check whether they are one person.") }),
      dupCard(d),
      editable(c) && !(S.edit && S.edit.kind === "merge" && S.edit.other === d.client_id)
        ? el("div", { class: "actions" }, [
            el("button", { class: "btn sm", type: "button", disabled: S.busy ? true : null,
              onclick: () => startEdit({ kind: "merge", other: d.client_id, peek: d, keep: "", reason: "" }), text: tr("Same person — merge…") }),
            el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null,
              onclick: () => act("clear_duplicate", { other: d.client_id }, tr("Saved.")), text: tr("Different people") }),
          ]) : null,
      S.edit && S.edit.kind === "merge" && S.edit.other === d.client_id && !S.edit.looked && !sheetMode() ? mergeForm(c, d) : null,
    ]));
  }
  if (editable(c)) {
    const e = S.edit;
    if (e && e.kind === "lookup") {
      if (!sheetMode()) kids.push(lookupForm(c, e));
    } else if (e && e.kind === "merge" && e.looked) {
      if (!sheetMode()) kids.push(el("div", { class: "dup" }, [dupCard(e.peek), mergeForm(c, e.peek)]));
    } else if (!(e && e.kind === "merge")) {
      kids.push(el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null,
        onclick: () => startEdit({ kind: "lookup", ref: "" }), text: tr("Merge with another record…") }));
    }
  }
  if (kids.length === 1) return null;
  return el("section", { class: "drawer-section dups" + (dups.length ? " flagged" : "") }, kids);
}

function lookupForm(c, e) {
  const input = el("input", { type: "text", id: "lookup-ref", placeholder: "DLD-0000", value: e.ref || "", maxlength: "8",
    autocapitalize: "characters", autocomplete: "off",
    oninput: (ev) => { e.ref = ev.target.value.toUpperCase().trim(); } });
  return el("form", { class: "editor", onsubmit: async (ev) => {
    ev.preventDefault();
    S.formError = null;
    try {
      const r = await call("peek", { id: e.ref });
      if (r.record.client_id === c.client_id) throw new Error(tr("Choose two different records."));
      S.edit = { kind: "merge", other: r.record.client_id, peek: r.record, keep: "", reason: "", looked: true };
    } catch (err) { S.formError = err.message; }
    renderDrawer();
  } }, [
    el("label", { for: "lookup-ref", class: "lbl", text: tr("Reference of the other record") }), input,
    formError(), formButtons(tr("Look up")),
  ]);
}

/* -------------------------------------------------------- card: commercial */
function kv(label, value, extra) {
  return el("div", {}, [el("dt", { text: label }), el("dd", {}, [blank(value) ? "—" : String(value), extra || null])]);
}
function reasonText(r) {
  const s = String(r || "").replace(/^rule:\s*/, "").replace(/^manual:?\s*/, "");
  const known = { "balanced by spend": "Balanced by spend", "lapsed or dormant — shared win-back list": "Lapsed or dormant — shared win-back list",
    "continuity — this rep has served the client before": "Continuity — this rep has served the client before" };
  if (known[s.toLowerCase()]) return tr(known[s.toLowerCase()]);
  if (/^manual/.test(String(r || ""))) return tr("Manual") + (s ? ": " + s : "");
  return sentence(s);
}
function ownerEditor(c) {
  const e = S.edit;
  const reps = ((S.ref && S.ref.sales_reps) || []).filter((r) => r.active);
  const sel = el("select", { id: "owner-new", onchange: (ev) => { e.owner = ev.target.value; } },
    [el("option", { value: "", text: "—" })].concat(reps.map((r) => el("option", { value: r.label, text: who(r.label) }))));
  sel.value = e.owner || "";
  const reason = el("input", { type: "text", id: "owner-reason", maxlength: "300", value: e.reason || "",
    oninput: (ev) => { e.reason = ev.target.value; } });
  return el("form", { class: "editor", onsubmit: (ev) => { ev.preventDefault();
    if (!e.owner) { S.formError = tr("Choose a current sales rep or the shared list."); renderDrawer(); return; }
    act("assign_owner", { owner: e.owner, reason: e.reason }, tr("Saved.")); } }, [
    el("label", { for: "owner-new", class: "lbl", text: tr("New owner") }), sel,
    el("label", { for: "owner-reason", class: "lbl", text: tr("Why? (optional)") }), reason,
    formError(), formButtons(tr("Save")),
  ]);
}
function sectionCommercial(c) {
  const ownerKids = [];
  if (c.record_type === "prospect") {
    ownerKids.push(el("p", { class: "muted", text: c.in_telegram && !c.in_marketing && !c.in_colibri
      ? tr("A Telegram lead: no purchase on record in Colibri.")
      : tr("A prospect: completed the questionnaire but has no purchase on record in Colibri.") }));
  }
  const owner = blank(c.client_owner) ? "—" : who(c.client_owner) + (ownerHasLeft(c.client_owner, c.owner_active) ? " (" + tr("has left") + ")" : "");
  const repActive = (label) => ((S.ref && S.ref.sales_reps) || []).some((r) => r.label === label && r.active);
  const previous = !blank(c.historic_owner) && c.historic_owner !== c.client_owner
    ? who(c.historic_owner) + (ownerHasLeft(c.historic_owner, repActive(c.historic_owner)) ? " (" + tr("has left") + ")" : "") : "";
  const how = blank(c.assigned_owner) ? "" : [
    blank(c.assignment_reason) ? tr("Assigned") : reasonText(c.assignment_reason),
    [who(c.assigned_by), c.assigned_at ? fmtDate(c.assigned_at) : ""].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
  const editingOwner = S.edit && S.edit.kind === "owner";
  const changeBtn = editable(c) && !editingOwner
    ? el("button", { class: "btn sm subtle inline-btn", type: "button", disabled: S.busy ? true : null,
        onclick: () => startEdit({ kind: "owner", owner: "", reason: "" }), text: tr("Change owner") }) : null;
  const purchases = c.record_type === "prospect" ? [] : [
    el("div", {}, [el("dt", { text: tr("Lifetime spend") }), el("dd", { title: fullUZS(c.lifetime_spend_uzs), text: fmtUZS(c.lifetime_spend_uzs) + " UZS" })]),
    kv(tr("Purchase occasions"), c.purchase_occasions),
    kv(tr("Items bought"), c.items_bought),
    kv(tr("First purchase"), fmtDate(c.first_purchase_at)),
    kv(tr("Last purchase"), fmtDate(c.last_purchase_at)),
    kv(tr("ABC class"), c.abc_class),
    kv(tr("Segment"), trv(c.rfm_segment)),
    kv(tr("Lifecycle"), trv(c.lifecycle_status)),
  ];
  return el("section", { class: "drawer-section" }, [
    el("h3", { text: tr(c.record_type === "prospect" ? "Purchases" : "Commercial") }),
    ...ownerKids,
    el("dl", { class: "kv" }, [
      ...purchases,
      kv(tr("Owner"), owner, changeBtn),
      how ? kv(tr("How assigned"), how) : null,
      previous ? kv(tr("Previous owner"), previous) : null,
      c.record_type === "prospect" ? null : kv(tr("Sales people seen"), c.advisors_seen),
      kv(tr("Related party"), c.related_party ? tr("Yes — kept out of retail figures") : tr("No")),
    ]),
    editingOwner && !sheetMode() ? ownerEditor(c) : null,
  ]);
}

/* ----------------------------------------------------------- card: contact */
function sectionContact(c) {
  const e = S.edit && S.edit.kind === "contact" ? S.edit : null;
  const kids = [el("h3", {}, [tr("Contact"),
    editable(c) && !e ? el("button", { class: "btn sm subtle aside-btn", type: "button", disabled: S.busy ? true : null,
      onclick: () => startEdit({ kind: "contact", dnc: !!c.do_not_contact, note: c.contact_note || "", ref: c.referred_by || "" }), text: tr("Edit") }) : null])];
  if (!e || sheetMode()) {
    kids.push(el("dl", { class: "kv" }, [
      kv(tr("Do not contact"), c.do_not_contact ? tr("Yes") : tr("No"), c.do_not_contact ? dncChip() : null),
      kv(tr("Contact note"), c.contact_note),
      kv(tr("Referred by"), c.referred_by),
    ]));
    return el("section", { class: "drawer-section contact-sec" }, kids);
  }
  kids.push(contactForm(c, e));
  return el("section", { class: "drawer-section contact-sec" }, kids);
}
function contactForm(c, e) {
  return el("form", { class: "editor", onsubmit: (ev) => { ev.preventDefault();
    act("set_contact", { do_not_contact: e.dnc, contact_note: e.note, referred_by: e.ref }, tr("Saved.")); } }, [
    el("label", { class: "opt check" }, [
      el("input", { type: "checkbox", id: "dnc", checked: e.dnc ? true : null, onchange: (ev) => { e.dnc = ev.target.checked; } }),
      el("span", { text: tr("The client has asked not to be contacted") })]),
    el("label", { for: "contact-note", class: "lbl", text: tr("Contact note") }),
    el("input", { type: "text", id: "contact-note", maxlength: "300", value: e.note, placeholder: tr("E.g. calls only after 18:00, prefers Telegram"),
      oninput: (ev) => { e.note = ev.target.value; } }),
    el("label", { for: "referred-by", class: "lbl", text: tr("Referred by") }),
    el("input", { type: "text", id: "referred-by", maxlength: "120", value: e.ref, placeholder: tr("A client reference or a name"),
      oninput: (ev) => { e.ref = ev.target.value; } }),
    formError(), formButtons(tr("Save")),
  ]);
}

/* ----------------------------------------------------- card: questionnaire */
function sectionQuestionnaire(c) {
  if (c.added_by_hand) {
    return el("section", { class: "drawer-section" }, [
      el("h3", { text: tr("Added to the file by hand") }),
      el("dl", { class: "kv" }, [
        kv(tr("How we met"), blank(c.how_met) ? "" : tr(c.how_met)),
        kv(tr("Added"), c.assigned_by ? tr("Added by {by}, {d}", { by: who(c.assigned_by), d: fmtDate(c.created_at) })
          : tr("Added by the team, {d}", { d: fmtDate(c.created_at) })),
      ]),
      el("p", { class: "note", text: tr("Not in the questionnaire. This record was added by the team at the counter.") }),
    ]);
  }
  if (!c.in_marketing) {
    return el("section", { class: "drawer-section" }, [
      el("h3", { text: tr("Questionnaire") }),
      el("p", { class: "muted", text: tr(c.in_colibri ? "Not in the questionnaire. Everything above comes from Colibri alone." : "Not in the questionnaire.") }),
    ]);
  }
  const mappedKV = (label, col) => {
    const raw = c[col];
    if (blank(raw)) return kv(label, "");
    const m = mappedValue(MAPPED[col], raw);
    const tag = m ? "→ " + m.db_value : tr("→ not mapped yet");
    return kv(label, raw, el("span", { class: "mapped", text: tag }));
  };
  const channel = mappedValue("contact_channel", c.channel_raw);
  const consent = channel && !blank(channel.extra) ? tr(channel.extra) : (blank(c.channel_raw) ? "" : tr("Not stated"));
  return el("section", { class: "drawer-section" }, [
    el("h3", {}, [tr("Questionnaire"), el("span", { class: "aside", text: tr("submitted {d}", { d: fmtDateTime(c.form_submitted_at) }) })]),
    el("dl", { class: "kv" }, [
      kv(tr("Patronymic"), c.patronymic),
      kv(tr("Email or handle"), c.email),
      mappedKV(tr("Preferred channel"), "channel_raw"),
      kv(tr("Marketing consent"), consent),
      mappedKV(tr("Buying for"), "purchase_for_raw"),
      mappedKV(tr("How they heard of us"), "awareness_source_raw"),
      mappedKV(tr("Would buy online"), "online_interest_raw"),
      mappedKV(tr("Brand preference"), "brand_preference_raw"),
      kv(tr("Duplicate form"), c.form_duplicate ? tr("Yes — submitted more than once") : tr("No")),
    ]),
  ]);
}

/* --------------------------------------------------------- card: purchases */
// See sectionPurchasesFloor() in the floor module: brands and categories, and
// a brand filter on the lines.

/* ------------------------------------------------------------- card: notes */
function eventText(e) {
  const tg = tgEventText(e) || personalEventText(e);
  if (tg) return tg;
  const f = e.field && FIELD_LABEL[e.field] ? tr(FIELD_LABEL[e.field]) : e.field;
  switch (e.action) {
    case "field_resolved": {
      const [basis, source] = String(e.note || "").split(":");
      const how = [basis === "client" ? tr("the client confirmed it") : basis === "delardi" ? tr("from our own records") : "",
        source === "colibri" ? tr("from Colibri") : source === "marketing" ? tr("from the questionnaire") : source === "telegram" ? tr("from Telegram")
          : source === "value" ? tr("typed in") : ""]
        .filter(Boolean).join(", ");
      const val = e.field === "gender" ? fmtGender(e.new_value) : e.field === "dob" ? fmtDate(e.new_value)
        : e.field === "phone" ? (phoneParts(e.new_value) ? fmtPhone(e.new_value) : "") : e.new_value;
      return [el("b", { text: tr("{field} confirmed", { field: f }) + (val ? ": " : ". ") }), val ? "“" + val + "”. " : "", how ? sentence(how) + "." : ""];
    }
    case "field_reset": return [el("b", { text: tr("{field} handed back to the automatic comparison", { field: f }) + "." })];
    case "single_source_accepted":
      return [el("b", { text: tr("Accepted as held by one source") + ": " }),
        String(e.new_value || "").split(",").filter(Boolean).map((x) => tr(FIELD_LABEL[x] || x)).join(", ") + "."];
    case "state_changed": {
      const m = { confirmed: "Marked as checked.", parked: "Set aside.", deleted: "Deleted.",
        open: e.old_value === "deleted" ? "Restored." : "Reopened." };
      return [el("b", { text: tr(m[e.new_value] || e.new_value) + (e.note ? " " : "") }), e.note || ""];
    }
    case "owner_assigned":
      return [el("b", { text: tr("Owner assigned") + ". " }),
        (e.old_value || e.new_value) ? el("span", { class: "move", text: (who(e.old_value) || "—") + " → " + (who(e.new_value) || "—") + ". " }) : null,
        e.note || ""];
    case "do_not_contact_set":
      return [el("b", { text: tr(e.new_value === "true" ? "Do not contact: on" : "Do not contact: off") + (e.note ? ". " : ".") }), e.note || ""];
    case "contact_note_set": return [el("b", { text: tr("Contact note changed") + (e.new_value ? ": " : ".") }), e.new_value || ""];
    case "referred_by_set": return [el("b", { text: tr("Referred by changed") + (e.new_value ? ": " : ".") }), e.new_value || ""];
    case "note": return [el("b", { text: tr("Note") + ". " }), e.note || ""];
    case "created_by_hand":
      return [el("b", { text: tr("Added to the file by hand") + ". " }),
        e.note ? tr("How we met") + ": " + tr(e.note) + "." : ""];
    case "duplicate_cleared": return [el("b", { text: tr("Not the same person as {id}", { id: e.new_value }) + "." })];
    case "merged_into": return [el("b", { text: tr("Merged into {id}", { id: e.new_value }) + ". " }), e.note && !/^Same person as/.test(e.note) ? e.note : ""];
    case "merged_from": return [el("b", { text: tr("Merged {id} into this record", { id: e.new_value }) + ". " }), e.note || ""];
    case "duplicate_suspect": return [el("b", { text: tr("Possible duplicate") + ". " }), e.note || ""];
    case "name_carries_note": return [el("b", { text: tr("Name field carries a note") + ". " }), e.note || ""];
    case "related_party_set": return [el("b", { text: tr("Marked as related party") + ". " }), e.note || ""];
    case "class_changed": {
      const k = e.field === "abc_class" ? "ABC class {a} → {b}" : e.field === "lifecycle_status" ? "Lifecycle {a} → {b}" : "Segment {a} → {b}";
      return [el("b", { text: tr(k, { a: trv(e.old_value), b: trv(e.new_value) }) + ". " }),
        /^Retail re-cut/.test(e.note || "") ? tr("Retail re-cut: ABC is now calculated without the related parties.") : ""];
    }
    // Phase 4: the monthly Colibri refresh.
    case "created_by_import": return [el("b", { text: tr("Created by the Colibri refresh") + ". " }), refreshPeriod(e.note)];
    case "purchases_imported":
      return [el("b", { text: tr("Purchase lines added by the Colibri refresh: {n}", { n: e.new_value || "—" }) + ". " }), refreshPeriod(e.note)];
    case "became_client": return [el("b", { text: tr("First purchase in Colibri: now a client") + ". " }), refreshPeriod(e.note)];
    case "colibri_changed": {
      if (e.field === "phone") return [el("b", { text: tr("Phone number changed in Colibri") + ". " }),
        phoneParts(e.old_value) || phoneParts(e.new_value) ? el("span", { class: "move", text: (fmtPhone(e.old_value) || "—") + " → " + (fmtPhone(e.new_value) || "—") + ". " }) : null,
        refreshPeriod(e.note)];
      const v = (x) => e.field === "gender" ? fmtGender(x) : e.field === "dob" ? fmtDate(x) : (blank(x) ? "—" : x);
      return [el("b", { text: tr("{field} changed in Colibri", { field: e.field === "patronymic" ? tr("Patronymic") : f }) + ": " }),
        el("span", { class: "move", text: v(e.old_value) + " → " + v(e.new_value) + ". " }), refreshPeriod(e.note)];
    }
    case "import_undone": return [el("b", { text: tr("A Colibri refresh was undone; this record is back as it was") + "." })];
    default: return [el("b", { text: e.action + ". " }), e.note || ""];
  }
}
// "Colibri refresh, 01.01.2026–02.09.2026." → the period, in the page's language.
function refreshPeriod(note) {
  const m = /(\d\d)\.(\d\d)\.(\d{4})–(\d\d)\.(\d\d)\.(\d{4})/.exec(String(note || ""));
  if (!m) return "";
  return tr("Exports for {a} – {b}.", { a: fmtDate(m[3] + "-" + m[2] + "-" + m[1]), b: fmtDate(m[6] + "-" + m[5] + "-" + m[4]) });
}
function sectionEvents(data) {
  const c = data.client;
  const ev = (data.events || []).filter((e) => e.client_id);
  const e = S.edit && S.edit.kind === "note" ? S.edit : null;
  const kids = [el("h3", { text: tr("Notes and history") })];
  if (editable(c) || (canEdit() && c.record_state !== "merged")) {
    if (e && !sheetMode()) kids.push(noteForm(e));
  }
  if (ev.length) {
    kids.push(el("ul", { class: "events" }, ev.map((x) => el("li", {}, [
      el("span", { class: "when", text: fmtDateTime(x.at) + " · " + (x.actor === "system" ? tr(x.action === "class_changed" ? "automatic recalculation" : TG_SYSTEM_ACTIONS.includes(x.action) ? "from the Telegram chats" : "flagged at load") : who(x.actor)) }),
      ...eventText(x),
    ]))));
  }
  if (kids.length === 1) return null;
  return el("section", { class: "drawer-section" }, kids);
}

function noteForm(e) {
  return el("form", { class: "editor", onsubmit: (x) => { x.preventDefault(); act("add_note", { note: e.note }, tr("Saved.")); } }, [
    el("label", { for: "note-text", class: "lbl", text: tr("Add a note") }),
    el("textarea", { id: "note-text", rows: "4", maxlength: "1000", placeholder: tr("E.g. called, will visit on Saturday"), value: e.note || "",
      oninput: (x) => { e.note = x.target.value; } }, []),
    formError(), formButtons(tr("Add note")),
  ]);
}

function renderDrawer() {
  const d = $("#drawer");
  const scrim = $("#scrim");
  if (!S.cardId) return;
  if (!S.cardTab) S.cardTab = defaultCardTab();
  const old = d.querySelector(".drawer-body");
  const keepScroll = old && d.dataset.tab === S.cardTab && d.dataset.id === S.cardId ? old.scrollTop : 0;
  d.innerHTML = "";
  const close = el("button", { class: "btn subtle close", type: "button", "aria-label": tr("Close"), onclick: () => closeCard(), text: "×" });
  const data = S.card, c = data && data.client;
  const q = data && data.queue;
  const head = el("div", { class: "drawer-head" }, [
    el("div", { style: "flex:1;min-width:0" }, [
      el("div", { class: "eyebrow", text: eyebrowText(c) }),
      el("h2", { id: "drawer-title", tabindex: "-1", text: c ? bestName(c) : (S.cardError ? tr("Could not open this record") : tr("Loading…")) }),
      c ? el("div", { class: "chips" }, [
        q ? statusChip(q) : null,
        c.abc_class ? chip({ glyph: "▪", tone: "" }, tr("Class {c}", { c: c.abc_class })) : null,
        c.lifecycle_status ? chip({ glyph: "•", tone: "" }, tr(c.lifecycle_status)) : null,
        c.related_party ? chip({ glyph: "◇", tone: "" }, tr("Related party"), "dashed") : null,
        c.do_not_contact ? dncChip() : null,
      ]) : null,
    ]),
    el("div", { class: "head-btns" }, [discreetBtn("in-card"), close]),
  ]);
  const body = el("div", { class: "drawer-body" + (S.busy ? " busy" : ""), id: "card-panel", role: data ? "tabpanel" : null });
  let foot = null;
  if (S.cardError) body.appendChild(el("p", { class: "err-box", text: S.cardError }));
  else if (!data) body.appendChild(el("div", { class: "drawer-loading", text: tr("Loading the record…") }));
  else {
    const t = S.cardTab;
    if (t === "overview") {
      body.append(sectionGlance(data), sectionContactLog(data), sectionPersonal(data));
      const tgs = sectionTelegram(data); if (tgs) body.append(tgs);
      body.append(sectionCommercial(c), sectionContact(c), sectionQuestionnaire(c));
    } else if (t === "purchases") {
      body.append(sectionPurchasesFloor(data));
      const ms = sectionMissed(data); if (ms) body.append(ms);
    } else if (t === "cleanup") {
      body.append(sectionReview(data));
      const sg = sectionTgSuggest(data); if (sg) body.append(sg);
      body.append(sectionCompare(data));
      const dups = sectionDuplicates(data); if (dups) body.appendChild(dups);
    } else {
      const e = sectionEvents(data);
      body.appendChild(e || el("section", { class: "drawer-section" }, [el("h3", { text: tr("Notes and history") }),
        el("p", { class: "muted", text: tr("No notes yet.") })]));
    }
    foot = cardFoot(data);                          // Add note, or Previous / Next on the clean-up
  }
  d.append(head);
  if (data) d.append(cardTabs(data));
  d.append(body);
  if (foot) d.append(foot);
  if (data && sheetMode()) d.append(...renderSheet(data));   // a phone's forms open as a panel from the bottom
  body.scrollTop = keepScroll;
  d.dataset.tab = S.cardTab; d.dataset.id = S.cardId;
  d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  d.setAttribute("aria-busy", S.busy ? "true" : "false");
  scrim.classList.add("open");
  syncSplit();
  const sheet = d.querySelector(".sheet");
  if (sheet) { if (!sheet.contains(document.activeElement)) { const f = sheet.querySelector("input:not([type=radio]):not([disabled]), textarea, select, input[type=radio], .close"); if (f) f.focus(); } }
  else if (!d.contains(document.activeElement)) close.focus();
}
// Keep keyboard focus inside the open card.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.navOpen) { e.preventDefault(); closeNav(); return; }
  if (e.key === "Escape" && S.cardId) {
    e.preventDefault();
    if (S.edit && !S.busy) { cancelEdit(); return; }
    closeCard(); return;
  }
  if (e.key !== "Tab" || !S.cardId) return;
  const d = $("#drawer .sheet") || (document.body.classList.contains("split") ? null : $("#drawer"));
  if (!d) return;
  const focusables = [...d.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!d.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
});

/* -------------------------------------------------------------------- gate */
function renderGate(message) {
  const existing = $("#gate");
  if (!S.locked) { if (existing) existing.remove(); return; }
  if (existing) existing.remove();
  const pass = el("input", { type: "password", id: "gate-pass", autocomplete: "current-password" });
  const err = el("p", { class: "err", role: "alert", style: message ? null : "display:none", text: message ? tr(message) : "" });
  const btn = el("button", { class: "btn primary", type: "submit", text: tr("Open the instrument") });
  const go = async (ev) => {
    ev.preventDefault();
    err.style.display = "none";
    if (!pass.value.trim()) { err.textContent = tr("Enter your passcode."); err.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = tr("Checking…");
    try {
      const r = await call("unlock", { passcode: pass.value });
      S.session = { token: r.token, name: r.name, expires_at: r.expires_at, can_edit: !!r.can_edit };
      store(SESSION_KEY, JSON.stringify(S.session));
      await loadAll();
      S.locked = false;
      activeNow();
      renderAll();
      toast(tr("Welcome, {name} — open until {time}", { name: r.name, time: fmtTime(r.expires_at) }));
      openFromHash();
    } catch (e) {
      err.textContent = e.message; err.style.display = "block";
      btn.disabled = false; btn.textContent = tr("Open the instrument");
      pass.value = ""; pass.focus();
    }
  };
  const card = el("form", { class: "gate-card", onsubmit: go }, [
    el("div", { class: "gate-mast" }, [
      el("img", { src: LOGO_WORDMARK, alt: "Delardi" }),
      el("div", { class: "gate-tools" }, [langSwitch(), el("a", { class: "gate-home", href: "../", text: tr("All tools") })]),
    ]),
    el("h2", { text: tr("Client Instrument") }),
    el("p", { class: "lead", text: tr("Client records are private. Enter your personal passcode to open them.") }),
    err,
    el("label", { for: "gate-pass" }, [el("span", { text: tr("Your passcode") }), pass]),
    btn,
    el("p", { class: "gate-foot", text: tr("Nothing behind this card is real. The instrument loads no data until your passcode is accepted, and a Weekly Board passcode opens it only if you have been given client access.") }),
  ]);
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, [card]));
  setTimeout(() => pass.focus(), 80);
}
function lockDown(message) {
  if (S.add) closeAddClient(true);
  if (S.exp) closeExport(true);
  S.session = null;
  store(SESSION_KEY, "");
  pref(IDLE_KEY, null);
  S.locked = true;
  S.ref = null; S.stats = null; S.rows = skeleton(); S.total = 0;
  S.ins = null; S.insError = null;
  S.dh = null; S.dhError = null; S.imports = null; S.imp = null; S.impId = null; S.impError = null; S.confirm = null;
  S.recentRows = null;
  if (S.navOpen) closeNav(true);
  if (S.cardId) closeCard(true);
  S.ov = [];
  if (location.hash) { try { history.replaceState(null, "", baseUrl()); } catch (e) { /* ignore */ } }
  renderAll(message);
}
function lockNow() { lockDown(); toast(tr("Locked.")); }

/* ------------------------------------------------------------------- theme */
function applyTheme() {
  let mode;
  try { mode = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { mode = "auto"; }
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("sysdark",
    mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function toggleTheme() {
  let mode;
  try { mode = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { mode = "auto"; }
  const next = mode === "auto"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark")
    : mode === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme();
}

/* -------------------------------------------------------------------- init */
function renderAll(gateMessage) {
  if (S.add) renderAddClient();                    // the add form follows the language
  if (S.exp) renderExport();                       // and so does the download dialog
  const app = $("#app");
  document.documentElement.lang = LANG;
  document.title = "Delardi " + tr("Client Instrument");
  app.innerHTML = "";
  app.className = S.locked ? "gated" : "";
  app.setAttribute("aria-hidden", S.locked ? "true" : "false");
  const phone = isPhone();
  // On a phone the views live in the ☰ menu; elsewhere they are tabs.
  const header = (extra) => el("header", { class: "top" }, [renderHeader(), phone ? null : renderViews(), ...(extra || [])]);
  if (S.view === "insights" && !S.locked) {
    app.append(header(), el("main", {}, [el("div", { class: "ins", id: "ins-host" })]));
    renderInsights();
    if (!S.ins && !S.insLoading) loadInsights();
  } else if (S.view === "data" && !S.locked) {
    app.append(header(), el("main", {}, [el("div", { class: "ins dat", id: "data-host" })]));
    renderData();
    if (!S.dh && !S.dhLoading) loadData();
  } else if (phone) {
    app.append(
      header(),
      el("main", {}, [
        renderToolbar(),
        el("div", { class: "quick", id: "quick-host" }),
        el("div", { class: "counts", id: "counts-host" }),
        el("div", { class: "list-wrap", id: "list-host" }),
      ]),
    );
    renderQuick();
    renderCounts();
    renderListHost();
  } else if (isTouch()) {
    // iPad: the counts scroll with the page, so the pinned header stays small.
    app.append(
      header(),
      el("main", {}, [el("div", { class: "scoreboard in-main", id: "scoreboard" }), el("div", { class: "progress", id: "progress" }), renderToolbar(),
        el("div", { class: "quick", id: "quick-host" }), el("div", { class: "list-wrap", id: "list-host" })]),
    );
    renderScoreboard();
    renderProgress();
    renderQuick();
    renderPills();
    renderListHost();
    syncSticky();
  } else {
    app.append(
      header([el("div", { class: "scoreboard", id: "scoreboard" })]),
      el("main", {}, [el("div", { class: "progress", id: "progress" }), renderToolbar(),
        el("div", { class: "quick", id: "quick-host" }), el("div", { class: "list-wrap", id: "list-host" })]),
    );
    renderScoreboard();
    renderProgress();
    renderQuick();
    renderPills();
    renderListHost();
    syncSticky();
  }
  if (S.navOpen) renderNav();
  syncSplit();
  renderGate(gateMessage);
}
function restoreSession() {
  try {
    const raw = store(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && s.token && new Date(s.expires_at).getTime() > Date.now()) S.session = s;
  } catch (e) { /* ignore */ }
}
$("#scrim").addEventListener("click", () => { if (!S.busy) closeCard(); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

(async function boot() {
  applyTheme();
  document.documentElement.lang = LANG;
  S.view = viewFromUrl();
  restoreSession();
  // A phone or iPad left unused past the idle lock asks for the passcode again,
  // even if the page was closed in between.
  let gateMsg;
  if (S.session && idleExpiredOnOpen()) { S.session = null; store(SESSION_KEY, ""); pref(IDLE_KEY, null); gateMsg = tr("Locked after {n} minutes without use.", { n: IDLE_MIN }); }
  if (S.session) {
    S.booting = true;
    try { await loadAll(); S.locked = false; }
    catch (e) {
      // Refused: sign in again. No connection: keep the session and try again when it is back.
      if (e.status || !S.offline) { S.session = null; store(SESSION_KEY, ""); }
    }
    S.booting = false;
  }
  if (S.locked) S.rows = skeleton();
  renderAll(gateMsg);
  renderNet();
  if (!S.locked) activeNow();
  openFromHash();
})();

