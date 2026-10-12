/* ===========================================================================
   Phones, the contact log and personal data (API v11)
   - Phone numbers reach the page for everyone with CRM access (Alex, 22
     Sept): on the card with Call, Telegram and WhatsApp; in the clean-up
     table; when settling the phone field, typed or taken from a source; and
     in the search box. They are hidden with the amounts in discreet mode.
   - Step 9, the contact log: every contact is kept (date, how, by whom, a
     note); the latest shows on the card and in the list. "Log contact" sits
     in the card's foot. The one who logged a contact can take it back for 15
     minutes.
   - Step 8, personal data: sizes, preferences, important dates, address and
     a free "about the client", each group edited on its own, with who and
     when. Every change goes into the client's history.
   ========================================================================= */
Object.assign(RU, {
  // phones
  "Call": "Позвонить",
  "WhatsApp": "WhatsApp",
  "Call {p}": "Позвонить {p}",
  "Write to {p} in Telegram": "Написать {p} в Telegram",
  "Write to {p} in WhatsApp": "Написать {p} в WhatsApp",
  "confirmed": "подтверждён",
  "Colibri": "Colibri",
  "questionnaire": "анкета",
  "Telegram chat": "чат Telegram",
  "Check this number: it looks like several run together.": "Проверьте номер: похоже, несколько номеров слиты в один.",
  "From Telegram": "Из Telegram",
  "From Telegram: ": "Из Telegram: ",
  "from Telegram": "из Telegram",
  "The phone number, e.g. +998 90 123 45 67": "Номер, например +998 90 123 45 67",
  "Enter the phone number, for example +998 90 123 45 67.": "Введите номер, например +998 90 123 45 67.",
  "Phone in the chat": "Телефон в чате",
  "Brings a phone number: {p}.": "Добавит номер телефона: {p}.",
  "Phone number in the chat: {p}": "Номер в чате: {p}",
  "A phone number from the chat is now on file.": "Номер из чата теперь в записи.",
  "{n} have a phone number. Days are counted to today; the summary is as of {d}.": "У {n} есть номер телефона. Дни считаются до сегодня; сводка на {d}.",
  "Name, reference or phone": "Имя, номер карты или телефон",
  "Search by name, client reference or phone number": "Поиск по имени, номеру клиента или телефону",
  // contact log
  "Contact log": "Контакты с клиентом",
  "Last contact": "Последний контакт",
  "none logged yet": "пока не отмечен",
  "No contact logged yet.": "Контактов пока нет.",
  "Log a contact": "Отметить контакт",
  "Log contact": "Отметить контакт",
  "Visit": "Визит",
  "Phone call": "Звонок",
  "Email": "Эл. почта",
  "Other": "Другое",
  "When": "Когда",
  "How": "Как",
  "By": "Кто",
  "Me ({name})": "Я ({name})",
  "Today": "Сегодня",
  "Yesterday": "Вчера",
  "Note (optional)": "Заметка (необязательно)",
  "E.g. called about the new collection, will visit on Saturday": "Например: позвонили про новую коллекцию, придёт в субботу",
  "Say how the contact was made.": "Укажите, как был контакт.",
  "Enter the date as dd.mm.yyyy.": "Введите дату в формате дд.мм.гггг.",
  "A contact cannot be in the future.": "Контакт не может быть в будущем.",
  "Contact logged.": "Контакт отмечен.",
  "Contact removed.": "Контакт удалён.",
  "Remove": "Удалить",
  "Remove this contact?": "Удалить этот контакт?",
  "Yes, remove": "Да, удалить",
  "logged by {by}": "отметил(а) {by}",
  "Show all {n}": "Показать все ({n})",
  "Show fewer": "Свернуть",
  "{d} · {how} · {by}": "{d} · {how} · {by}",
  "Contact logged: {how}, {d}.": "Контакт: {how}, {d}.",
  "Contact removed: {how}, {d}.": "Контакт удалён: {how}, {d}.",
  "Contacted {d}": "Контакт {d}",
  // personal data
  "Personal data": "Личные данные",
  "Sizes": "Размеры",
  "Preferences": "Предпочтения",
  "Important dates": "Важные даты",
  "Address": "Адрес",
  "About the client": "О клиенте",
  "Not recorded yet.": "Пока не записано.",
  "No dates yet.": "Дат пока нет.",
  "Add a date": "Добавить дату",
  "Ring size": "Размер кольца",
  "Wrist": "Запястье",
  "Necklace": "Колье",
  "{n} cm": "{n} см",
  "Metal": "Металл",
  "Stones": "Камни",
  "Style": "Стиль",
  "Favourite brands and collections": "Любимые бренды и коллекции",
  "Dislikes": "Не нравится",
  "Yellow gold": "Жёлтое золото",
  "White gold": "Белое золото",
  "Rose gold": "Розовое золото",
  "Platinum": "Платина",
  "Steel": "Сталь",
  "Diamonds": "Бриллианты",
  "Coloured stones": "Цветные камни",
  "Pearls": "Жемчуг",
  "No stones": "Без камней",
  "Classic": "Классика",
  "Modern": "Современный",
  "Statement": "Яркий, заметный",
  "From the questionnaire": "Из анкеты",
  "Use the questionnaire's answer": "Взять ответ из анкеты",
  "{by}, {d}": "{by}, {d}",
  "Ring size — tap every size that fits": "Размер кольца — отметьте все подходящие",
  "Other sizes": "Другие размеры",
  "E.g. 12.5 or 23": "Например, 12,5 или 23",
  "Wrist, cm": "Запястье, см",
  "Necklace length": "Длина колье",
  "E.g. wears rings on the index finger": "Например, носит кольца на указательном пальце",
  "E.g. Messika Move, Bulgari Serpenti": "Например, Messika Move, Bulgari Serpenti",
  "E.g. no yellow gold, nothing too large": "Например, не любит жёлтое золото, ничего крупного",
  "E.g. prefers delicate pieces for every day": "Например, предпочитает тонкие изделия на каждый день",
  "For deliveries, gifts and invitations": "Для доставки, подарков и приглашений",
  "What the team should know: family, interests, how they like to be served…": "Что важно знать команде: семья, интересы, как предпочитает обслуживание…",
  "Wedding anniversary": "Годовщина свадьбы",
  "Partner's birthday": "День рождения партнёра",
  "Child's birthday": "День рождения ребёнка",
  "What is the date?": "Что за дата?",
  "Name or note (optional)": "Имя или пояснение (необязательно)",
  "Name the date": "Название даты",
  "E.g. husband Rustam": "Например, муж Рустам",
  "E.g. son Daniyar": "Например, сын Данияр",
  "E.g. first purchase together": "Например, первая совместная покупка",
  "Date": "Дата",
  "dd.mm or dd.mm.yyyy": "дд.мм или дд.мм.гггг",
  "Enter the date as dd.mm or dd.mm.yyyy.": "Введите дату как дд.мм или дд.мм.гггг.",
  "That is not a real date.": "Такой даты не существует.",
  "Name the date.": "Назовите дату.",
  "Choose what the date is.": "Выберите, что это за дата.",
  "Remove this date?": "Удалить эту дату?",
  "Date added.": "Дата добавлена.",
  "Date removed.": "Дата удалена.",
  "Choose up to six ring sizes.": "Не больше шести размеров кольца.",
  "Ring sizes run from 12 to 25, in halves.": "Размеры колец — от 12 до 25, с шагом 0,5.",
  "A wrist is 12 to 25 cm.": "Запястье — от 12 до 25 см.",
  "Coming up": "Скоро",
  "{what} · {when}": "{what} · {when}",
  "Personal data — {group} updated": "Личные данные — изменено: {group}",
  "sizes": "размеры",
  "preferences": "предпочтения",
  "address": "адрес",
  "about the client": "о клиенте",
  "ring size": "размер кольца",
  "wrist": "запястье",
  "necklace": "колье",
  "note": "заметка",
  "metal": "металл",
  "stones": "камни",
  "style": "стиль",
  "favourite brands": "любимые бренды",
  "dislikes": "не нравится",
  "Important date added: {what}": "Добавлена важная дата: {what}",
  "Important date removed: {what}": "Удалена важная дата: {what}",
  // server messages
  "Say when the contact was.": "Укажите, когда был контакт.",
  "Say when the contact was, as YYYY-MM-DD.": "Укажите дату контакта.",
  "That date is too far back.": "Слишком давняя дата.",
  "Say who made the contact.": "Укажите, кто связался с клиентом.",
  "Choose yourself or a current sales rep.": "Выберите себя или действующего продавца.",
  "Keep the note under 500 characters.": "Заметка — не длиннее 500 символов.",
  "No such contact on this record.": "У этой записи нет такого контакта.",
  "Only the person who logged a contact can remove it.": "Удалить контакт может только тот, кто его отметил.",
  "A contact can be removed only within 15 minutes of logging it.": "Контакт можно удалить только в течение 15 минут.",
  "Sizes must be numbers.": "Размеры должны быть числами.",
  "Keep it to six ring sizes.": "Не больше шести размеров кольца.",
  "A necklace length is 35 to 100 cm.": "Длина колье — от 35 до 100 см.",
  "Keep the note under 200 characters.": "Заметка — не длиннее 200 символов.",
  "Unknown metal.": "Неизвестный металл.",
  "Unknown stone choice.": "Неизвестный вариант камней.",
  "Unknown style.": "Неизвестный стиль.",
  "Keep each line under 300 characters.": "Каждая строка — не длиннее 300 символов.",
  "Keep the address under 500 characters.": "Адрес — не длиннее 500 символов.",
  "Keep it under 2,000 characters.": "Не длиннее 2000 символов.",
  "Say what the date is.": "Укажите, что это за дата.",
  "Keep the name under 80 characters.": "Название — не длиннее 80 символов.",
  "That year is out of range.": "Год вне допустимого диапазона.",
  "Keep it to twelve dates per client.": "Не больше двенадцати дат на клиента.",
  "No such date on this record.": "У этой записи нет такой даты.",
  "That is not a phone number.": "Это не номер телефона.",
  "Only a phone number can come from Telegram.": "Из Telegram можно взять только номер телефона.",
});
Object.assign(PL, {
  contact: { en: ["contact", "contacts"], ru: ["контакт", "контакта", "контактов"] },
});

/* ------------------------------------------------------------------- phones */
// Numbers arrive as +digits. Nine digits are a local Uzbek number.
function phoneParts(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length < 7) return null;
  const digits = d.length === 9 ? "998" + d : d;
  let text = "+" + digits;
  if (/^998\d{9}$/.test(digits)) text = `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  else if (/^7\d{10}$/.test(digits)) text = `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  return { digits, e164: "+" + digits, text, callable: digits.length <= 15 };
}
// Discreet mode hides the middle of a number the way it hides amounts.
function phoneShown(p) {
  if (!p) return "";
  if (!S.discreet) return p.text;
  const parts = p.text.split(" ");
  if (parts.length >= 4) return parts.map((x, i) => (i < 2 || i === parts.length - 1 ? x : x.replace(/\d/g, "•"))).join(" ");
  return p.text.slice(0, 4) + p.text.slice(4, -2).replace(/\d/g, "•") + p.text.slice(-2);
}
const fmtPhone = (raw) => { const p = phoneParts(raw); return p ? phoneShown(p) : (blank(raw) ? "" : String(raw)); };
const colibriPhones = (c) => String(c.phone_colibri || "").split(";").map((x) => x.trim()).filter(Boolean);
// Every number the record holds, once each, with where it came from.
function cardPhones(data) {
  const c = data.client, out = [];
  const add = (raw, src) => {
    const p = phoneParts(raw);
    if (!p) return;
    const had = out.find((x) => x.p.digits === p.digits);
    if (had) { if (!had.src.includes(src)) had.src.push(src); } else out.push({ p, src: [src] });
  };
  if (c.phone_confirmed) add(c.phone_confirmed, "confirmed");
  colibriPhones(c).forEach((x) => add(x, "colibri"));
  // v12: on a hand-added record the "questionnaire" side is what the team typed.
  if (c.phone_marketing) add(c.phone_marketing, c.added_by_hand ? "typed" : "marketing");
  if (c.phone_telegram) add(c.phone_telegram, "telegram");
  const ch = tgChat(data);
  if (ch && ch.phone) add(ch.phone, "chat");
  return out;
}
const PHONE_SRC = { confirmed: "confirmed", colibri: "Colibri", marketing: "questionnaire", typed: "typed in by the team", telegram: "Telegram", chat: "Telegram chat" };
function phoneActions(p) {
  if (!p.callable) return null;
  const shown = phoneShown(p);
  return el("div", { class: "ph-acts" }, [
    el("a", { class: "btn sm", href: "tel:" + p.e164, "aria-label": tr("Call {p}", { p: shown }) }, [tr("Call")]),
    el("a", { class: "btn sm subtle", href: "https://t.me/" + p.e164, target: "_blank", rel: "noopener",
      "aria-label": tr("Write to {p} in Telegram", { p: shown }) }, ["Telegram"]),
    el("a", { class: "btn sm subtle", href: "https://wa.me/" + p.digits, target: "_blank", rel: "noopener",
      "aria-label": tr("Write to {p} in WhatsApp", { p: shown }) }, ["WhatsApp"]),
  ]);
}
function phoneFact(data) {
  const list = cardPhones(data).slice(0, 4);
  if (!list.length) return fact(tr("Phone"), el("span", { class: "muted", text: tr("No number on file") }));
  return el("div", { class: "fact wide phones" }, [el("dt", { text: tr("Phone") }), el("dd", {}, list.map(({ p, src }, i) =>
    el("div", { class: "ph-row" + (i ? " more" : ""), "data-phone": p.digits }, [
      el("div", { class: "ph-line" }, [
        p.callable ? el("a", { class: "ph-num", href: "tel:" + p.e164, text: phoneShown(p) }) : el("span", { class: "ph-num", text: phoneShown(p) }),
        el("span", { class: "ph-src", text: src.map((s) => tr(PHONE_SRC[s] || s)).join(" · ") }),
      ]),
      p.callable ? null : el("span", { class: "fsub", text: tr("Check this number: it looks like several run together.") }),
      phoneActions(p),
    ])))]);
}
// The clean-up table: each source's number in its own column.
function phoneCells(c) {
  const col = colibriPhones(c).map(fmtPhone).filter(Boolean);
  const mkt = fmtPhone(c.phone_marketing);
  if (!col.length && !mkt) {
    const tg = fmtPhone(c.phone_telegram);
    return [el("td", { colspan: "2", class: tg ? null : "muted", text: tg ? tr("From Telegram: ") + tg : tr("No number on file") })];
  }
  return [el("td", { class: "ph-cell", text: col.length ? col.join(", ") : "—" }), el("td", { class: "ph-cell", text: mkt || "—" })];
}
// Which source a phone form starts on.
function phonePreset(c, flag) {
  if (flag === "conflict") return "";
  if (colibriPhones(c).length) return "colibri";
  if (c.phone_marketing) return "marketing";
  if (c.phone_telegram) return "telegram";
  return "value";
}
function phoneOptions(c, e, pick) {
  const opts = [];
  const col = colibriPhones(c)[0];
  if (col) opts.push(radio("fe-src", "colibri", e.source === "colibri", tr("From Colibri") + ": ", pick, el("b", { text: fmtPhone(col) })));
  if (c.phone_marketing) opts.push(radio("fe-src", "marketing", e.source === "marketing", tr("From the questionnaire") + ": ", pick, el("b", { text: fmtPhone(c.phone_marketing) })));
  if (c.phone_telegram) opts.push(radio("fe-src", "telegram", e.source === "telegram", tr("From Telegram: "), pick, el("b", { text: fmtPhone(c.phone_telegram) })));
  const other = el("input", { id: "fe-other", type: "tel", inputmode: "tel", autocomplete: "off", maxlength: "24",
    placeholder: "+998 90 123 45 67", "aria-label": tr("The phone number, e.g. +998 90 123 45 67"),
    value: e.value || "", disabled: e.source !== "value" ? true : null, oninput: (ev) => { e.value = ev.target.value; } });
  opts.push(el("div", { class: "opt other" }, [radio("fe-src", "value", e.source === "value", tr("Something else"), pick), other]));
  return opts;
}
function phoneTypedError(e) {
  if (e.source !== "value") return null;
  const d = String(e.value || "").replace(/\D/g, "");
  return d.length < 7 || d.length > 15 ? tr("Enter the phone number, for example +998 90 123 45 67.") : null;
}

/* -------------------------------------------------------------- contact log */
const CONTACT_CHANNELS = [["visit", "Visit"], ["call", "Phone call"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["other", "Other"]];
const channelLabel = (ch) => tr((CONTACT_CHANNELS.find((x) => x[0] === ch) || ["", ch || "—"])[1]);
const todayIso = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);     // Tashkent
const isoMinusDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") - n * 86400e3).toISOString().slice(0, 10);
const cardContacts = (data) => (data && data.contacts) || [];
Object.assign(S, { ctConfirm: null, ctAll: false, dtConfirm: null });

function contactLine(x) {
  return tr("{d} · {how} · {by}", { d: fmtDate(x.contacted_on), how: channelLabel(x.channel), by: who(x.by) || "—" });
}
function contactGlanceFact(data) {
  const x = cardContacts(data)[0];
  if (!x) return fact(tr("Last contact"), el("span", { class: "muted", text: tr("none logged yet") }));
  return fact(tr("Last contact"), fmtDate(x.contacted_on), channelLabel(x.channel) + " · " + (who(x.by) || "—"));
}
function startLogContact() {
  startEdit({ kind: "logcontact", text: isoToDmy(todayIso()), on: todayIso(), channel: "", by: "me", note: "" });
}
function logContactFromFoot() {
  if (S.cardTab !== "overview") S.cardTab = "overview";     // not remembered: only a tab the person picks is
  startLogContact();
  const f = $("#drawer .contact-log .editor");
  if (f && f.scrollIntoView) f.scrollIntoView({ block: "nearest" });
}
function sectionContactLog(data) {
  const c = data.client, list = cardContacts(data);
  const e = S.edit && S.edit.kind === "logcontact" ? S.edit : null;
  const kids = [el("h3", {}, [tr("Contact log"),
    list.length ? el("span", { class: "aside", text: pl(list.length, "contact") }) : null,
    editable(c) && !e ? el("button", { class: "btn sm subtle aside-btn", type: "button", "data-act": "log-contact", disabled: S.busy ? true : null,
      onclick: startLogContact, text: tr("Log a contact") }) : null])];
  if (e && !sheetMode()) kids.push(contactLogForm(c, e));
  if (!list.length) {
    kids.push(el("p", { class: "muted", text: tr("No contact logged yet.") }));
    return el("section", { class: "drawer-section contact-log" }, kids);
  }
  const shown = S.ctAll ? list : list.slice(0, 3);
  kids.push(el("ul", { class: "clog" }, shown.map((x) => {
    const confirming = S.ctConfirm === x.id;
    return el("li", { "data-contact": String(x.id) }, [
      el("div", { class: "cl1" }, [el("b", { text: fmtDate(x.contacted_on) }), " · " + channelLabel(x.channel) + " · " + (who(x.by) || "—")]),
      !blank(x.note) ? el("div", { class: "cnote", text: x.note }) : null,
      x.logged_by && x.logged_by !== x.by ? el("div", { class: "cmeta muted", text: tr("logged by {by}", { by: who(x.logged_by) }) }) : null,
      x.can_remove && editable(c) ? (confirming
        ? el("div", { class: "actions confirm-row" }, [
            el("span", { text: tr("Remove this contact?") }),
            el("button", { class: "btn sm danger", type: "button", "data-act": "ct-yes", disabled: S.busy ? true : null,
              onclick: () => { S.ctConfirm = null; act("contact_remove", { contact: x.id }, tr("Contact removed.")); }, text: tr("Yes, remove") }),
            el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null,
              onclick: () => { S.ctConfirm = null; renderDrawer(); }, text: tr("Cancel") })])
        : el("div", { class: "actions" }, [el("button", { class: "btn sm subtle", type: "button", "data-act": "ct-remove", disabled: S.busy ? true : null,
            onclick: () => { S.ctConfirm = x.id; renderDrawer(); const y = $('#drawer [data-act="ct-yes"]'); if (y) y.focus(); }, text: tr("Remove") })])) : null,
    ]);
  })));
  if (list.length > 3) {
    kids.push(el("button", { type: "button", class: "linkish show-all", onclick: () => { S.ctAll = !S.ctAll; renderDrawer(); },
      text: S.ctAll ? tr("Show fewer") : tr("Show all {n}", { n: list.length }) }));
  }
  return el("section", { class: "drawer-section contact-log" }, kids);
}
function contactByOptions() {
  const mine = S.ref && S.ref.my_rep;
  const me = mine ? who(mine) : (S.session ? S.session.name : "");
  const reps = ((S.ref && S.ref.sales_reps) || []).filter((r) => r.active && !isShared(r.label) && r.label !== mine);
  return [["me", tr("Me ({name})", { name: me })]].concat(reps.map((r) => [r.label, who(r.label)]));
}
function contactLogForm(c, e) {
  const setDate = (iso) => { e.on = iso; e.text = isoToDmy(iso); renderDrawer(); };
  const when = el("input", { type: "text", id: "ct-on", inputmode: "numeric", autocomplete: "off", maxlength: "10",
    placeholder: tr("dd.mm.yyyy"), value: e.text || "",
    oninput: (ev) => { const t = maskDmy(ev.target.value); if (t !== ev.target.value) ev.target.value = t; e.text = t; e.on = dmyToIso(t) || ""; } });
  const by = el("select", { id: "ct-by", onchange: (ev) => { e.by = ev.target.value; } },
    contactByOptions().map(([v, t]) => el("option", { value: v, text: t })));
  by.value = e.by || "me";
  const submit = (ev) => {
    ev.preventDefault();
    if (!e.on) { S.formError = tr("Enter the date as dd.mm.yyyy."); renderDrawer(); return; }
    if (e.on > todayIso()) { S.formError = tr("A contact cannot be in the future."); renderDrawer(); return; }
    if (!e.channel) { S.formError = tr("Say how the contact was made."); renderDrawer(); return; }
    act("contact_add", { on: e.on, channel: e.channel, by: e.by || "me", note: e.note }, tr("Contact logged."));
  };
  return el("form", { class: "editor ct-form", onsubmit: submit }, [
    el("label", { for: "ct-on", class: "lbl", text: tr("When") }),
    el("div", { class: "when-row" }, [when,
      el("button", { type: "button", class: "qchip", "aria-pressed": e.on === todayIso() ? "true" : "false", onclick: () => setDate(todayIso()), text: tr("Today") }),
      el("button", { type: "button", class: "qchip", "aria-pressed": e.on === isoMinusDays(todayIso(), 1) ? "true" : "false",
        onclick: () => setDate(isoMinusDays(todayIso(), 1)), text: tr("Yesterday") })]),
    el("fieldset", { class: "opt-grid" }, [el("legend", { text: tr("How") }),
      ...CONTACT_CHANNELS.map(([v, l]) => radio("ct-ch", v, e.channel === v, tr(l), (x) => { e.channel = x; }))]),
    el("label", { for: "ct-by", class: "lbl", text: tr("By") }), by,
    el("label", { for: "ct-note", class: "lbl", text: tr("Note (optional)") }),
    el("input", { type: "text", id: "ct-note", maxlength: "500", value: e.note || "",
      placeholder: tr("E.g. called about the new collection, will visit on Saturday"), oninput: (ev) => { e.note = ev.target.value; } }),
    formError(), formButtons(tr("Log contact")),
  ]);
}

/* ------------------------------------------------------------ personal data */
const METALS = [["yellow_gold", "Yellow gold"], ["white_gold", "White gold"], ["rose_gold", "Rose gold"], ["platinum", "Platinum"], ["steel", "Steel"]];
const STONES = [["diamonds", "Diamonds"], ["coloured_stones", "Coloured stones"], ["pearls", "Pearls"], ["no_stones", "No stones"]];
const STYLES = [["classic", "Classic"], ["modern", "Modern"], ["statement", "Statement"]];
const DATE_KINDS = [["anniversary", "Wedding anniversary"], ["partner_birthday", "Partner's birthday"], ["child_birthday", "Child's birthday"], ["other", "Other"]];
const RING_CHIPS = Array.from({ length: 17 }, (_, i) => 14 + i / 2);
const NECKLACES = [38, 40, 42, 45, 50, 55, 60, 70, 80, 90];
const PERSONAL_GROUPS = [["sizes", "Sizes"], ["prefs", "Preferences"], ["dates", "Important dates"], ["address", "Address"], ["about", "About the client"]];
const PERSONAL_KINDS = ["logcontact", "personal", "impdate"];
const pickLabels = (list, vals) => (vals || []).map((v) => tr((list.find((x) => x[0] === v) || ["", v])[1]));
const numText = (n) => Number(n).toLocaleString(LOC(), { maximumFractionDigits: 1 });
const personalOf = (data) => (data && data.personal) || {};
const datesOf = (data) => (data && data.important_dates) || [];
function dateText(d) {
  const x = new Date(Date.UTC(d.year || 2000, d.month - 1, d.day));
  const opts = { day: "numeric", month: "long", timeZone: "UTC" };
  if (d.year) opts.year = "numeric";
  return x.toLocaleDateString(LOC(), opts);
}
function dateWhat(d) {
  const k = tr((DATE_KINDS.find((x) => x[0] === d.kind) || ["", d.kind])[1]);
  return d.kind === "other" ? (d.label || k) : k + (blank(d.label) ? "" : " (" + d.label + ")");
}
function daysUntil(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return nextBirthday("2000-" + pad(d.month) + "-" + pad(d.day));
}
function soonText(n) {
  return n === 0 ? tr("today") : n === 1 ? tr("tomorrow") : n !== null && n <= 60 ? tr("in {n} days", { n }) : "";
}
// The glance: sizes if any, and an important date in the next 30 days.
function personalGlanceFacts(data) {
  const p = personalOf(data), out = [];
  const sizes = [];
  if ((p.ring_sizes || []).length) sizes.push(tr("Ring size") + " " + p.ring_sizes.map(numText).join(" · "));
  if (p.wrist_cm != null) sizes.push(tr("Wrist") + " " + tr("{n} cm", { n: numText(p.wrist_cm) }));
  if (p.necklace_cm != null) sizes.push(tr("Necklace") + " " + tr("{n} cm", { n: numText(p.necklace_cm) }));
  if (sizes.length) out.push(fact(tr("Sizes"), sizes.join(", ")));
  const soon = datesOf(data).map((d) => ({ d, n: daysUntil(d) })).filter((x) => x.n !== null && x.n <= 30).sort((a, b) => a.n - b.n)[0];
  if (soon) out.push(fact(tr("Coming up"), el("span", {}, [dateWhat(soon.d) + " ", el("b", { class: "soon", text: "· " + soonText(soon.n) })])));
  return out;
}
function metaBy(by, at) {
  return by ? el("p", { class: "pg-meta muted", text: tr("{by}, {d}", { by: who(by), d: fmtDate(at) }) }) : null;
}
function pgroup(key, title, c, body, btnLabel, onEdit) {
  const e = S.edit;
  const editing = e && ((e.kind === "personal" && e.group === key) || (e.kind === "impdate" && key === "dates"));
  return el("div", { class: "pgroup", "data-group": key }, [
    el("div", { class: "pg-head" }, [el("h4", { text: title }),
      editable(c) && !editing ? el("button", { class: "btn sm subtle", type: "button", "data-act": "edit-" + key, disabled: S.busy ? true : null,
        onclick: onEdit, text: btnLabel }) : null]),
    ...(editing && !sheetMode() ? [personalFormFor(c)] : []),
    ...(editing && !sheetMode() && key !== "dates" ? [] : body),
  ]);
}
function startPersonal(group, data) {
  const p = personalOf(data);
  if (group === "sizes") startEdit({ kind: "personal", group, rings: (p.ring_sizes || []).map(Number), other: "", wrist: p.wrist_cm != null ? numText(p.wrist_cm) : "",
    neck: p.necklace_cm != null ? String(p.necklace_cm) : "", note: p.sizes_note || "" });
  else if (group === "prefs") startEdit({ kind: "personal", group, metals: (p.metals || []).slice(), stones: (p.stones || []).slice(), styles: (p.styles || []).slice(),
    fav: p.fav_brands || "", dislikes: p.dislikes || "", note: p.prefs_note || "" });
  else if (group === "address") startEdit({ kind: "personal", group, text: p.address || "" });
  else startEdit({ kind: "personal", group, text: p.about || "" });
}
function sectionPersonal(data) {
  const c = data.client, p = personalOf(data);
  const empty = () => [el("p", { class: "muted", text: tr("Not recorded yet.") })];
  const kvs = (rows) => { const r = rows.filter((x) => x); return r.length ? [el("dl", { class: "kv" }, r)] : empty(); };
  const sizes = kvs([
    (p.ring_sizes || []).length ? kv(tr("Ring size"), p.ring_sizes.map(numText).join(" · ")) : null,
    p.wrist_cm != null ? kv(tr("Wrist"), tr("{n} cm", { n: numText(p.wrist_cm) })) : null,
    p.necklace_cm != null ? kv(tr("Necklace"), tr("{n} cm", { n: numText(p.necklace_cm) })) : null,
    !blank(p.sizes_note) ? kv(tr("Note"), p.sizes_note) : null,
  ]).concat([metaBy(p.sizes_by, p.sizes_at)]);
  const suggestion = blank(p.fav_brands) && !blank(c.brand_preference_raw) ? kv(tr("From the questionnaire"), c.brand_preference_raw) : null;
  const prefs = kvs([
    (p.metals || []).length ? kv(tr("Metal"), pickLabels(METALS, p.metals).join(", ")) : null,
    (p.stones || []).length ? kv(tr("Stones"), pickLabels(STONES, p.stones).join(", ")) : null,
    (p.styles || []).length ? kv(tr("Style"), pickLabels(STYLES, p.styles).join(", ")) : null,
    !blank(p.fav_brands) ? kv(tr("Favourite brands and collections"), p.fav_brands) : suggestion,
    !blank(p.dislikes) ? kv(tr("Dislikes"), p.dislikes) : null,
    !blank(p.prefs_note) ? kv(tr("Note"), p.prefs_note) : null,
  ]).concat([metaBy(p.prefs_by, p.prefs_at)]);
  const dl = datesOf(data);
  const dates = dl.length ? [el("ul", { class: "pdates" }, dl.map((d) => {
    const n = daysUntil(d), soon = n !== null && n <= 60 ? soonText(n) : "";
    const confirming = S.dtConfirm === d.id;
    return el("li", { "data-date": String(d.id) }, [
      el("div", { class: "pd1" }, [el("b", { text: dateWhat(d) }), " · " + dateText(d), soon ? el("span", { class: "soon", text: " · " + soon }) : null]),
      editable(c) ? (confirming
        ? el("div", { class: "actions confirm-row" }, [el("span", { text: tr("Remove this date?") }),
            el("button", { class: "btn sm danger", type: "button", "data-act": "dt-yes", disabled: S.busy ? true : null,
              onclick: () => { S.dtConfirm = null; act("date_remove", { date: d.id }, tr("Date removed.")); }, text: tr("Yes, remove") }),
            el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null, onclick: () => { S.dtConfirm = null; renderDrawer(); }, text: tr("Cancel") })])
        : el("button", { class: "btn sm subtle icon-btn dt-x", type: "button", "data-act": "dt-remove", "aria-label": tr("Remove") + ": " + dateWhat(d),
            title: tr("Remove"), disabled: S.busy ? true : null,
            onclick: () => { S.dtConfirm = d.id; renderDrawer(); const y = $('#drawer [data-act="dt-yes"]'); if (y) y.focus(); }, text: "×" })) : null,
    ]);
  }))] : [el("p", { class: "muted", text: tr("No dates yet.") })];
  const text = (v, by, at) => (blank(v) ? empty() : [el("p", { class: "ptext", text: v })]).concat([metaBy(by, at)]);
  return el("section", { class: "drawer-section personal" }, [
    el("h3", { text: tr("Personal data") }),
    pgroup("sizes", tr("Sizes"), c, sizes, tr("Edit"), () => startPersonal("sizes", data)),
    pgroup("prefs", tr("Preferences"), c, prefs, tr("Edit"), () => startPersonal("prefs", data)),
    pgroup("dates", tr("Important dates"), c, dates, tr("Add a date"), () => startEdit({ kind: "impdate", dkind: "", label: "", text: "" })),
    pgroup("address", tr("Address"), c, text(p.address, p.address_by, p.address_at), tr("Edit"), () => startPersonal("address", data)),
    pgroup("about", tr("About the client"), c, text(p.about, p.about_by, p.about_at), tr("Edit"), () => startPersonal("about", data)),
  ]);
}
function personalFormFor(c) {
  const e = S.edit;
  if (e.kind === "impdate") return dateForm(e);
  if (e.group === "sizes") return sizesForm(e);
  if (e.group === "prefs") return prefsForm(c, e);
  return textForm(e);
}
const checkOpt = (name, v, on, label, toggle) => el("label", { class: "opt check" }, [
  el("input", { type: "checkbox", name, value: v, checked: on ? true : null, onchange: (ev) => toggle(v, ev.target.checked) }), el("span", { text: label })]);
const toggleIn = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };
function sizesForm(e) {
  const chips = RING_CHIPS.concat(e.rings.filter((r) => !RING_CHIPS.includes(r))).sort((a, b) => a - b);
  const neckOpts = NECKLACES.concat(e.neck && !NECKLACES.includes(Number(e.neck)) ? [Number(e.neck)] : []).sort((a, b) => a - b);
  const neck = el("select", { id: "ps-neck", onchange: (ev) => { e.neck = ev.target.value; } },
    [el("option", { value: "", text: "—" })].concat(neckOpts.map((n) => el("option", { value: String(n), text: tr("{n} cm", { n }) }))));
  neck.value = e.neck || "";
  const submit = (ev) => {
    ev.preventDefault();
    // Typed sizes, with a point or a comma for the half: "12,5 23" or "12.5, 23".
    const typed = String(e.other || "").match(/\d+(?:[.,]\d)?/g) || [];
    const rings = [...new Set(e.rings.concat(typed.map((x) => Number(x.replace(",", ".")))))].sort((a, b) => a - b);
    if (rings.some((r) => !Number.isFinite(r) || r < 12 || r > 25 || r * 2 !== Math.round(r * 2))) { S.formError = tr("Ring sizes run from 12 to 25, in halves."); renderDrawer(); return; }
    if (rings.length > 6) { S.formError = tr("Choose up to six ring sizes."); renderDrawer(); return; }
    const wrist = blank(e.wrist) ? null : Number(String(e.wrist).replace(",", "."));
    if (wrist !== null && (!Number.isFinite(wrist) || wrist < 12 || wrist > 25)) { S.formError = tr("A wrist is 12 to 25 cm."); renderDrawer(); return; }
    act("personal_set", { group: "sizes", values: { ring_sizes: rings, wrist_cm: wrist, necklace_cm: blank(e.neck) ? null : Number(e.neck), note: e.note } }, tr("Saved."));
  };
  return el("form", { class: "editor p-form", "data-form": "sizes", onsubmit: submit }, [
    el("fieldset", {}, [el("legend", { text: tr("Ring size — tap every size that fits") }),
      el("div", { class: "ring-chips" }, chips.map((r) => el("button", { type: "button", class: "qchip ring", "aria-pressed": e.rings.includes(r) ? "true" : "false",
        onclick: (ev) => { toggleIn(e.rings, r, !e.rings.includes(r)); ev.currentTarget.setAttribute("aria-pressed", e.rings.includes(r) ? "true" : "false"); },
        text: numText(r) })))]),
    el("label", { for: "ps-other", class: "lbl", text: tr("Other sizes") }),
    el("input", { type: "text", id: "ps-other", inputmode: "decimal", maxlength: "30", value: e.other || "", placeholder: tr("E.g. 12.5 or 23"),
      oninput: (ev) => { e.other = ev.target.value; } }),
    el("div", { class: "two" }, [
      el("div", {}, [el("label", { for: "ps-wrist", class: "lbl", text: tr("Wrist, cm") }),
        el("input", { type: "text", id: "ps-wrist", inputmode: "decimal", maxlength: "5", value: e.wrist || "", placeholder: "16",
          oninput: (ev) => { e.wrist = ev.target.value; } })]),
      el("div", {}, [el("label", { for: "ps-neck", class: "lbl", text: tr("Necklace length") }), neck]),
    ]),
    el("label", { for: "ps-note", class: "lbl", text: tr("Note") }),
    el("input", { type: "text", id: "ps-note", maxlength: "200", value: e.note || "", placeholder: tr("E.g. wears rings on the index finger"),
      oninput: (ev) => { e.note = ev.target.value; } }),
    formError(), formButtons(tr("Save")),
  ]);
}
function prefsForm(c, e) {
  const group = (legend, name, list, arr) => el("fieldset", { class: "opt-grid" }, [el("legend", { text: legend }),
    ...list.map(([v, l]) => checkOpt(name, v, arr.includes(v), tr(l), (x, on) => toggleIn(arr, x, on)))]);
  const fav = el("input", { type: "text", id: "pp-fav", maxlength: "300", value: e.fav || "", placeholder: tr("E.g. Messika Move, Bulgari Serpenti"),
    oninput: (ev) => { e.fav = ev.target.value; } });
  const q = c.brand_preference_raw;
  return el("form", { class: "editor p-form", "data-form": "prefs", onsubmit: (ev) => { ev.preventDefault();
    act("personal_set", { group: "prefs", values: { metals: e.metals, stones: e.stones, styles: e.styles, fav_brands: e.fav, dislikes: e.dislikes, note: e.note } }, tr("Saved.")); } }, [
    group(tr("Metal"), "pp-metal", METALS, e.metals),
    group(tr("Stones"), "pp-stone", STONES, e.stones),
    group(tr("Style"), "pp-style", STYLES, e.styles),
    el("label", { for: "pp-fav", class: "lbl", text: tr("Favourite brands and collections") }), fav,
    !blank(q) && blank(e.fav) ? el("button", { type: "button", class: "btn sm subtle use-q", onclick: () => { e.fav = String(q).slice(0, 300); renderDrawer(); } },
      [tr("Use the questionnaire's answer") + ": ", el("b", { text: q })]) : null,
    el("label", { for: "pp-dis", class: "lbl", text: tr("Dislikes") }),
    el("input", { type: "text", id: "pp-dis", maxlength: "300", value: e.dislikes || "", placeholder: tr("E.g. no yellow gold, nothing too large"),
      oninput: (ev) => { e.dislikes = ev.target.value; } }),
    el("label", { for: "pp-note", class: "lbl", text: tr("Note") }),
    el("input", { type: "text", id: "pp-note", maxlength: "300", value: e.note || "", placeholder: tr("E.g. prefers delicate pieces for every day"),
      oninput: (ev) => { e.note = ev.target.value; } }),
    formError(), formButtons(tr("Save")),
  ]);
}
function textForm(e) {
  const addr = e.group === "address";
  return el("form", { class: "editor p-form", "data-form": e.group, onsubmit: (ev) => { ev.preventDefault();
    act("personal_set", { group: e.group, values: addr ? { address: e.text } : { about: e.text } }, tr("Saved.")); } }, [
    el("label", { for: "pt-text", class: "lbl", text: tr(addr ? "Address" : "About the client") }),
    el("textarea", { id: "pt-text", rows: addr ? "3" : "6", maxlength: addr ? "500" : "2000", value: e.text || "",
      placeholder: tr(addr ? "For deliveries, gifts and invitations" : "What the team should know: family, interests, how they like to be served…"),
      oninput: (ev) => { e.text = ev.target.value; } }, []),
    formError(), formButtons(tr("Save")),
  ]);
}
// dd.mm, or dd.mm.yyyy when the year is known.
function parseDm(t) {
  const m = /^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/.exec(String(t || ""));
  if (!m) return null;
  const day = +m[1], month = +m[2], year = m[3] ? +m[3] : null;
  const x = new Date(Date.UTC(year || 2000, month - 1, day));
  if (x.getUTCMonth() !== month - 1 || x.getUTCDate() !== day) return { bad: true };
  return { day, month, year };
}
function dateForm(e) {
  const ph = { partner_birthday: "E.g. husband Rustam", child_birthday: "E.g. son Daniyar", other: "E.g. first purchase together" };
  const submit = (ev) => {
    ev.preventDefault();
    if (!e.dkind) { S.formError = tr("Choose what the date is."); renderDrawer(); return; }
    if (e.dkind === "other" && blank(e.label)) { S.formError = tr("Name the date."); renderDrawer(); return; }
    const d = parseDm(e.text);
    if (!d) { S.formError = tr("Enter the date as dd.mm or dd.mm.yyyy."); renderDrawer(); return; }
    if (d.bad) { S.formError = tr("That is not a real date."); renderDrawer(); return; }
    act("date_add", { kind: e.dkind, label: e.label, month: d.month, day: d.day, year: d.year }, tr("Date added."));
  };
  return el("form", { class: "editor p-form", "data-form": "date", onsubmit: submit }, [
    el("fieldset", { class: "opt-grid" }, [el("legend", { text: tr("What is the date?") }),
      ...DATE_KINDS.map(([v, l]) => radio("pd-kind", v, e.dkind === v, tr(l), (x) => { e.dkind = x; renderDrawer(); }))]),
    el("label", { for: "pd-label", class: "lbl", text: tr(e.dkind === "other" ? "Name the date" : "Name or note (optional)") }),
    el("input", { type: "text", id: "pd-label", maxlength: "80", value: e.label || "", placeholder: ph[e.dkind] ? tr(ph[e.dkind]) : "",
      oninput: (ev) => { e.label = ev.target.value; } }),
    el("label", { for: "pd-date", class: "lbl", text: tr("Date") }),
    el("input", { type: "text", id: "pd-date", inputmode: "numeric", autocomplete: "off", maxlength: "10", placeholder: tr("dd.mm or dd.mm.yyyy"),
      value: e.text || "", oninput: (ev) => { const t = maskDmy(ev.target.value); if (t !== ev.target.value) ev.target.value = t; e.text = t; } }),
    formError(), formButtons(tr("Add")),
  ]);
}

/* -------------------------------------------------------- phone panels, tabs */
Object.assign(EDIT_TAB, { logcontact: "overview", personal: "overview", impdate: "overview" });
SHEET_KINDS.push(...PERSONAL_KINDS);
function personalSheetTitle() {
  const e = S.edit;
  if (e.kind === "logcontact") return tr("Log a contact");
  if (e.kind === "impdate") return tr("Add a date");
  if (e.kind === "personal") return tr((PERSONAL_GROUPS.find((g) => g[0] === e.group) || ["", "Personal data"])[1]);
  return null;
}
function personalSheetBody(data) {
  const c = data.client, e = S.edit;
  return [e.kind === "logcontact" ? contactLogForm(c, e) : personalFormFor(c)];
}

/* -------------------------------------------------------------- history text */
const PERSONAL_KEY = { ring_sizes: "ring size", wrist_cm: "wrist", necklace_cm: "necklace", sizes_note: "note", metals: "metal", stones: "stones",
  styles: "style", fav_brands: "favourite brands", dislikes: "dislikes", prefs_note: "note" };
const GROUP_WORD = { sizes: "sizes", prefs: "preferences", address: "address", about: "about the client" };
function personalEventText(e) {
  switch (e.action) {
    case "contact_logged":
      return [el("b", { text: tr("Contact logged: {how}, {d}.", { how: channelLabel(e.new_value), d: fmtDate(e.note) }) })];
    case "contact_removed":
      return [el("b", { text: tr("Contact removed: {how}, {d}.", { how: channelLabel(e.new_value), d: fmtDate(e.note) }) })];
    case "personal_set": {
      const keys = String(e.note || "").split(",").filter((k) => PERSONAL_KEY[k]).map((k) => tr(PERSONAL_KEY[k]));
      return [el("b", { text: tr("Personal data — {group} updated", { group: tr(GROUP_WORD[e.field] || e.field || "") }) + (keys.length ? ": " : ".") }),
        keys.length ? [...new Set(keys)].join(", ") + "." : ""];
    }
    case "date_added":
    case "date_removed": {
      const what = dateWhat({ kind: e.new_value, label: e.note });
      return [el("b", { text: tr(e.action === "date_added" ? "Important date added: {what}" : "Important date removed: {what}", { what }) + "." })];
    }
    default: return null;
  }
}
