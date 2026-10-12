/* ===========================================================================
   Telegram (API v10)
   The boutique's Telegram chats, from the summary of 14 Aug 2026:
   - On the card: whether the client is in Telegram, when they last wrote,
     what the chat shows (Overview); a chat that may be theirs, to link or
     reject (Clean-up); and what they asked for that the boutique could not
     offer at the time, in their own words, with a status (Purchases).
   - In the list: Telegram leads (people who wrote but are in neither Colibri
     nor the questionnaire) and records with an open missed request.
   - In Insights: the leads by when they last wrote, and the missed demand by
     kind, by brand we don't carry and by year.
   Telegram IDs never reach this page: the server sends a chat reference
   instead. Since v11 the chat's phone number does (see personal.js).
   ========================================================================= */
Object.assign(RU, {
  // list and filters
  "Telegram lead": "Лид из Telegram",
  "Telegram leads": "Лиды из Telegram",
  "telegram leads": "лиды из Telegram",
  "Missed requests": "Упущенные запросы",
  "missed requests": "упущенные запросы",
  "Colibri + questionnaire + Telegram": "Colibri + анкета + Telegram",
  "Colibri + Telegram": "Colibri + Telegram",
  "Questionnaire + Telegram": "Анкета + Telegram",
  "Telegram only": "Только Telegram",
  "{n} Telegram leads outside the clean-up": "лидов из Telegram вне проверки: {n}",
  // card: overview
  "Telegram": "Telegram",
  "In Telegram": "Есть в Telegram",
  "Client last wrote {d}": "Клиент писал {d}",
  "chat last active {d}": "последнее сообщение в чате {d}",
  "{n} open": "открытых: {n}",
  "Show": "Показать",
  "A lead from the boutique's Telegram: in neither Colibri nor the questionnaire yet.": "Лид из Telegram бутика: пока нет ни в Colibri, ни в анкете.",
  "The chat suggests they have bought before, but no purchase matches in Colibri.": "По переписке клиент уже покупал, но в Colibri покупка не найдена.",
  "summary of {d}": "сводка на {d}",
  "Segment in the chat summary": "Сегмент по переписке",
  "Language": "Язык",
  "First contact": "Первый контакт",
  "Client last wrote": "Клиент писал последний раз",
  "Last message in the chat": "Последнее сообщение в чате",
  "Messages": "Сообщения",
  "{c} from the client · {b} from the boutique": "от клиента: {c} · от бутика: {b}",
  "Questions asked": "Вопросов задано",
  "{n} answered after more than a day": "с ответом позже чем через сутки: {n}",
  "{n} never answered": "без ответа: {n}",
  "Mailings received": "Получено рассылок",
  "Brands mentioned": "Упомянутые бренды",
  "Largest discount offered": "Наибольшая предложенная скидка",
  "Noted in the chat": "Отмечено в переписке",
  "Last message from the client": "Последнее сообщение клиента",
  "Linked by the phone number.": "Связан по номеру телефона.",
  "Created from this chat.": "Создан из этого чата.",
  "Confirmed by {by}, {d}.": "Подтвердил(а) {by}, {d}.",
  "A Telegram chat may belong to this client. See Clean-up.": "Возможно, этому клиенту принадлежит чат в Telegram. См. «Проверка».",
  "Cold lead": "Холодный лид",
  "Warm lead": "Тёплый лид",
  "Hot lead": "Горячий лид",
  "Buyer": "Покупатель",
  "Buyer – dormant": "Покупатель — давно не писал",
  "VIP buyer": "VIP-покупатель",
  "VIP buyer – dormant": "VIP-покупатель — давно не писал",
  "Audience only": "Только рассылки",
  "Russian": "Русский",
  "English": "Английский",
  "Uzbek (Latin)": "Узбекский (латиница)",
  "Uzbek (Cyrillic)": "Узбекский (кириллица)",
  "Slow reply": "Медленный ответ",
  "Foreign/tourist": "Иностранец / турист",
  "Special order": "Спецзаказ",
  "Price objection": "Возражение по цене",
  "Service issue": "Вопрос по сервису",
  "Unanswered": "Без ответа",
  // card: clean-up
  "Telegram chat to confirm": "Чат Telegram на подтверждение",
  "A Telegram lead: no purchase on record in Colibri.": "Лид из Telegram: покупок в Colibri нет.",
  "Not in the questionnaire.": "Нет в анкете.",
  "Brand we don't carry": "Бренда нет в ассортименте",
  "Each lead is counted once: those who bought first, the rest by when they last wrote.": "Каждый лид учтён один раз: сначала покупавшие, остальные — по дате последнего сообщения.",
  "A Telegram lead, outside the identity review. If it is someone already in the file, merge it with their record; if it is not a client, delete it.": "Лид из Telegram, вне проверки данных. Если это клиент из базы — объедините с его записью; если не клиент — удалите.",
  "The boutique's Telegram has a chat that may be this client. Link it only if you are sure: the chat's details and requests then join this record.": "В Telegram бутика есть чат, который может принадлежать этому клиенту. Связывайте, только если уверены: данные чата и запросы перейдут в эту запись.",
  "Same phone number as this record.": "Тот же номер телефона, что у этой записи.",
  "Same phone number as this record and as {ids}.": "Тот же номер телефона, что у этой записи и у {ids}.",
  "Same name as a buyer at the till.": "То же имя, что у покупателя на кассе.",
  "A similar name in Telegram.": "Похожее имя в Telegram.",
  "Till: {n} items, last {d}": "Касса: изделий {n}, последняя покупка {d}",
  "{n} would move to this record.": "В эту запись перейдут: {n}.",
  "Same client — link": "Тот же клиент — связать",
  "Not this client": "Не этот клиент",
  "Link this chat to {id}?": "Связать этот чат с {id}?",
  "Yes, link": "Да, связать",
  "Cancel": "Отмена",
  "Telegram chat linked.": "Чат Telegram связан.",
  "Marked as not this client.": "Отмечено: не этот клиент.",
  "Unnamed chat": "Чат без имени",
  // card: purchases
  "What the client asked for that the boutique could not offer at the time, in the client's own words. From the Telegram summary of {d}.": "Что клиент просил, а бутик не смог предложить в тот момент, — словами клиента. По сводке Telegram на {d}.",
  "Asked for a brand we don't carry": "Бренд, которого у нас нет",
  "Not in stock": "Нет в наличии",
  "Waiting for a delivery": "Ждёт поступления",
  "Asked to order": "Просил заказать",
  "Reply took more than a day": "Ответ позже чем через сутки",
  "Not answered": "Без ответа",
  "first reply after {t}": "первый ответ через {t}",
  "{n} min": "{n} мин",
  "{n} h": "{n} ч",
  "{n} days": "{n} дн.",
  "Open": "Открыт",
  "Followed up": "Отработан",
  "Closed": "Закрыт",
  "Close": "Закрыть",
  "{status} by {by}, {d}": "{status}: {by}, {d}",
  "No missed requests.": "Упущенных запросов нет.",
  // history
  "Linked to a Telegram chat by phone number.": "Связан с чатом Telegram по номеру телефона.",
  "Telegram chat confirmed as this client.": "Чат Telegram подтверждён как этот клиент.",
  "Suggested Telegram chat: not this client.": "Предложенный чат Telegram: не этот клиент.",
  "Created from the Telegram chats": "Создан из чатов Telegram",
  "the chat suggests a purchase": "по переписке была покупка",
  "a lead": "лид",
  "Client last wrote {d}.": "Клиент писал {d}.",
  "Missed request: {a} → {b}": "Упущенный запрос: {a} → {b}",
  "from the Telegram chats": "из чатов Telegram",
  // insights
  "Telegram: leads and missed demand": "Telegram: лиды и упущенный спрос",
  "Chats in the summary": "Чатов в сводке",
  "{n} linked to a record": "связано с записями: {n}",
  "Chats to confirm": "Чаты на подтверждение",
  "may be a client in the file": "возможно, клиент из базы",
  "Open missed requests": "Открытые упущенные запросы",
  "{n} people · {f} in the file": "людей: {n} · в базе: {f}",
  "Leads from Telegram": "Лиды из Telegram",
  "{total} people wrote to the boutique on Telegram but are in neither Colibri nor the questionnaire. By the chat, {buyers} of them have bought before.": "{total} человек писали бутику в Telegram, но их нет ни в Colibri, ни в анкете. По переписке {buyers} из них уже покупали.",
  "Bought before, by the chat": "Уже покупали, по переписке",
  "Wrote in the last 30 days": "Писали за последние 30 дней",
  "Wrote 31–180 days ago": "Писали 31–180 дней назад",
  "Wrote more than 180 days ago": "Писали более 180 дней назад",
  "Open the {n} leads": "Открыть лиды ({n})",
  "What clients asked for and did not get": "Что клиенты просили и не получили",
  "{total} times between {a} and {b} a client asked for something the boutique could not offer, or waited more than a day for a reply: {clients} people, {in_file} of them in the client file.": "{total} раз с {a} по {b} клиент просил то, чего бутик не мог предложить, или ждал ответа больше суток: {clients} человек, из них в базе — {in_file}.",
  "{n} · {c} people": "{n} · людей: {c}",
  "Click a bar to open the records in the file.": "Нажмите на полосу, чтобы открыть записи из базы.",
  "Brands asked for that we don't carry": "Бренды, которых у нас нет, но их спрашивали",
  "Bvlgari watches are carried; the jewellery is not.": "Часы Bvlgari у нас есть, украшений — нет.",
  "Requests and slow replies by year": "Запросы и медленные ответы по годам",
  "Requests we could not meet": "Запросы, которые не смогли выполнить",
  "Replies after more than a day": "Ответы позже чем через сутки",
  "Kind": "Тип",
  "Requests": "Запросы",
  "People": "Люди",
  "In the file": "В базе",
  "Year": "Год",
  "Brand": "Бренд",
  "Telegram chats to confirm": "Чаты Telegram на подтверждение",
  "A chat in the boutique's Telegram may be this client. Link it, or say it is not.": "Чат в Telegram бутика может принадлежать этому клиенту. Свяжите его или отметьте, что это не он.",
  "Neither Colibri, the questionnaire nor Telegram has a number.": "Номера нет ни в Colibri, ни в анкете, ни в Telegram.",
  // server messages
  "This Telegram chat was not suggested for this record.": "Этот чат Telegram не предлагался для этой записи.",
  "This Telegram chat is already linked to a record.": "Этот чат Telegram уже связан с записью.",
  "No such Telegram chat.": "Такого чата Telegram нет.",
  "No such request on this record.": "У этой записи нет такого запроса.",
  "Choose open, followed up or closed.": "Выберите: открыт, отработан или закрыт.",
});

Object.assign(PL, {
  request: { en: ["missed request", "missed requests"], ru: ["упущенный запрос", "упущенных запроса", "упущенных запросов"] },
});

/* -------------------------------------------------------------- vocabulary */
const MISSED_KIND = {
  not_carried: "Asked for a brand we don't carry",
  not_in_stock: "Not in stock",
  awaiting: "Waiting for a delivery",
  order_request: "Asked to order",
  late_reply: "Reply took more than a day",
};
const MISSED_STATUS = {
  open: { label: "Open", glyph: "•", tone: "warning" },
  followed_up: { label: "Followed up", glyph: "✓", tone: "good" },
  closed: { label: "Closed", glyph: "–", tone: "" },
};
const MISSED_KIND_SHORT = { ...MISSED_KIND, not_carried: "Brand we don't carry" };
const missedKindLabel = (m) => m.kind === "late_reply" && m.answered === false ? tr("Not answered") : tr(MISSED_KIND[m.kind] || m.kind);

/* ------------------------------------------------------------------ helpers */
const tgData = (data) => (data && data.telegram) || { chats: [], suggested: [], missed: [] };
const tgChat = (data) => tgData(data).chats[0] || null;
const isTgLead = (data) => !!(data && data.queue && data.queue.review_status === "lead");
const openMissed = (data) => tgData(data).missed.filter((m) => m.status === "open");
function sourceLineTg(r) {
  if (!r.in_telegram) return null;
  if (r.in_colibri && r.in_marketing) return tr("Colibri + questionnaire + Telegram");
  if (r.in_colibri) return tr("Colibri + Telegram");
  if (r.in_marketing) return tr("Questionnaire + Telegram");
  return tr("Telegram only");
}
function replyTime(min) {
  const m = Number(min);
  if (!Number.isFinite(m)) return "";
  if (m < 60) return tr("{n} min", { n: Math.max(1, Math.round(m)) });
  if (m < 2880) return tr("{n} h", { n: Math.round(m / 60) });
  return tr("{n} days", { n: Math.round(m / 1440) });
}
const tgName = (ch) => blank(ch.display_name) || ch.display_name === "(no name)" ? tr("Unnamed chat") : ch.display_name;

/* ------------------------------------------------------ card: at a glance */
// Facts for the glance: in Telegram, when they last wrote, open missed requests.
function tgGlanceFacts(data) {
  const out = [];
  const ch = tgChat(data);
  if (ch) {
    const last = ch.last_client_message || ch.last_contact;
    out.push(fact(tr("Telegram"), "✓ " + (last ? tr("Client last wrote {d}", { d: fmtDate(last) }) : tr("In Telegram")),
      ch.last_contact ? tr("chat last active {d}", { d: fmtDate(ch.last_contact) }) : null));
  }
  const open = openMissed(data);
  if (open.length) {
    out.push(el("div", { class: "fact" }, [el("dt", { text: tr("Missed requests") }), el("dd", {}, [
      el("span", { text: tr("{n} open", { n: open.length }) + " " }),
      el("button", { type: "button", class: "linkish", onclick: () => setCardTab("purchases"), text: tr("Show") })])]));
  }
  return out;
}
function tgGlanceNote(data) {
  if (!isTgLead(data)) return null;
  const ch = tgChat(data);
  return el("p", { class: "muted glance-note", text: tr("A lead from the boutique's Telegram: in neither Colibri nor the questionnaire yet.") +
    (ch && ch.purchase_signal ? " " + tr("The chat suggests they have bought before, but no purchase matches in Colibri.") : "") });
}

/* ---------------------------------------------------- card: overview block */
function sectionTelegram(data) {
  const t = tgData(data), ch = t.chats[0], c = data.client;
  if (!ch) {
    if (t.suggested.length && !recordClosed(c)) {
      return el("section", { class: "drawer-section" }, [el("h3", { text: tr("Telegram") }),
        el("p", { class: "note" }, [tr("A Telegram chat may belong to this client. See Clean-up.") + " ",
          el("button", { type: "button", class: "linkish", onclick: () => setCardTab("cleanup"), text: tr("Clean-up") })])]);
    }
    return null;
  }
  const n = (v) => Number(v || 0);
  const how = ch.link_status === "phone" ? tr("Linked by the phone number.")
    : ch.link_status === "lead" ? tr("Created from this chat.")
    : ch.link_status === "confirmed" ? tr("Confirmed by {by}, {d}.", { by: who(ch.decided_by) || "—", d: fmtDate(ch.decided_at) }) : "";
  const msgs = tr("{c} from the client · {b} from the boutique", { c: n(ch.messages_from_client), b: n(ch.messages_from_boutique) });
  const q = [String(n(ch.inquiries)),
    n(ch.replies_over_24h) ? tr("{n} answered after more than a day", { n: n(ch.replies_over_24h) }) : null,
    n(ch.never_answered) ? tr("{n} never answered", { n: n(ch.never_answered) }) : null].filter(Boolean).join(" · ");
  const kids = [
    el("h3", {}, [tr("Telegram"), el("span", { class: "aside", text: tr("summary of {d}", { d: fmtDate(ch.as_of) }) })]),
    el("dl", { class: "kv" }, [
      kv(tr("Segment in the chat summary"), blank(ch.segment) ? null : tr(ch.segment)),
      kv(tr("Language"), blank(ch.language) ? null : tr(ch.language)),
      kv(tr("First contact"), ch.first_contact ? fmtDate(ch.first_contact) : null),
      kv(tr("Client last wrote"), ch.last_client_message ? fmtDate(ch.last_client_message) : null),
      kv(tr("Last message in the chat"), ch.last_contact ? fmtDate(ch.last_contact) : null),
      kv(tr("Messages"), msgs),
      kv(tr("Questions asked"), q),
      kv(tr("Mailings received"), String(n(ch.broadcasts_received))),
      (ch.interest_brands || []).length ? kv(tr("Brands mentioned"), ch.interest_brands.join(", ")) : null,
      ch.max_discount_pct ? kv(tr("Largest discount offered"), Math.round(Number(ch.max_discount_pct) * 10) / 10 + "%") : null,
      (ch.flags || []).length ? kv(tr("Noted in the chat"), ch.flags.map((f) => tr(f)).join(", ")) : null,
      ch.phone ? kv(tr("Phone in the chat"), fmtPhone(ch.phone)) : null,
    ]),
  ];
  if (!blank(ch.last_client_excerpt)) {
    kids.push(el("div", { class: "tg-quote" }, [el("span", { class: "muted", text: tr("Last message from the client") + ": " }),
      el("q", { text: ch.last_client_excerpt })]));
  }
  if (how) kids.push(el("p", { class: "note", text: how }));
  return el("section", { class: "drawer-section tg" }, kids);
}

/* ---------------------------------------------- card: clean-up suggestion */
function tgBasisText(s) {
  if (s.match_basis === "phone_shared") {
    return (s.also_suggested_for || []).length ? tr("Same phone number as this record and as {ids}.", { ids: s.also_suggested_for.join(", ") })
      : tr("Same phone number as this record.");
  }
  if (s.match_basis === "pos_name") return tr("Same name as a buyer at the till.");
  return tr("A similar name in Telegram.");
}
function sectionTgSuggest(data) {
  const c = data.client, sugg = tgData(data).suggested;
  if (!sugg.length || recordClosed(c)) return null;
  const hasPhone = c.phone_flag && c.phone_flag !== "none" || c.phone_in_telegram;
  const kids = [el("h3", { text: tr("Telegram chat to confirm") }),
    el("p", { class: "hint", text: tr("The boutique's Telegram has a chat that may be this client. Link it only if you are sure: the chat's details and requests then join this record.") })];
  for (const s of sugg) {
    const n = (v) => Number(v || 0);
    const lines = [
      [s.segment ? tr(s.segment) : null, s.last_client_message ? tr("Client last wrote {d}", { d: fmtDate(s.last_client_message) }) : null,
        tr("{c} from the client · {b} from the boutique", { c: n(s.messages_from_client), b: n(s.messages_from_boutique) })].filter(Boolean).join(" · "),
      s.pos_items ? tr("Till: {n} items, last {d}", { n: s.pos_items, d: fmtDate(s.last_pos_purchase) }) +
        ((s.pos_brands || []).length ? " · " + s.pos_brands.join(", ") : "") + (s.pos_revenue_uzs ? " · " + fmtUZS(s.pos_revenue_uzs) : "") : null,
      s.missed_requests ? tr("{n} would move to this record.", { n: pl(s.missed_requests, "request") }) : null,
      s.phone && !hasPhone ? tr("Brings a phone number: {p}.", { p: fmtPhone(s.phone) }) : s.phone ? tr("Phone number in the chat: {p}", { p: fmtPhone(s.phone) }) : null,
    ].filter(Boolean);
    const confirming = S.tgConfirm === s.ref;
    kids.push(el("div", { class: "dup", "data-chat": String(s.ref) }, [
      el("p", { class: "hint", text: tgBasisText(s) }),
      el("div", { class: "dup-card" }, [
        el("div", {}, [el("b", { text: tgName(s) }), " · Telegram"]),
        ...lines.map((l) => el("div", { class: "muted", text: l })),
        !blank(s.last_client_excerpt) ? el("div", { class: "tg-quote" }, [el("q", { text: s.last_client_excerpt })]) : null,
      ]),
      !editable(c) ? null : confirming
        ? el("div", { class: "actions confirm-row" }, [
            el("span", { text: tr("Link this chat to {id}?", { id: c.client_id }) }),
            el("button", { class: "btn sm", type: "button", disabled: S.busy ? true : null, "data-act": "tg-yes",
              onclick: () => { S.tgConfirm = null; act("telegram_link", { chat: s.ref }, tr("Telegram chat linked.")); }, text: tr("Yes, link") }),
            el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null,
              onclick: () => { S.tgConfirm = null; renderDrawer(); }, text: tr("Cancel") }),
          ])
        : el("div", { class: "actions" }, [
            el("button", { class: "btn sm", type: "button", disabled: S.busy ? true : null, "data-act": "tg-link",
              onclick: () => { S.tgConfirm = s.ref; renderDrawer(); const y = $('#drawer [data-act="tg-yes"]'); if (y) y.focus(); }, text: tr("Same client — link") }),
            el("button", { class: "btn sm subtle", type: "button", disabled: S.busy ? true : null, "data-act": "tg-reject",
              onclick: () => act("telegram_reject", { chat: s.ref }, tr("Marked as not this client.")), text: tr("Not this client") }),
          ]),
    ]));
  }
  return el("section", { class: "drawer-section dups flagged tg-sugg" }, kids);
}

/* ---------------------------------------------- card: missed requests */
function sectionMissed(data) {
  const c = data.client, list = tgData(data).missed;
  if (!list.length) return null;
  const open = list.filter((m) => m.status === "open").length;
  const asOf = (tgChat(data) || {}).as_of || "2026-08-14";
  const can = editable(c);
  const setBtn = (m, status, label, subtle) => el("button", { class: "btn sm" + (subtle ? " subtle" : ""), type: "button",
    disabled: S.busy ? true : null, "data-status": status,
    onclick: () => act("missed_status", { missed: m.id, status }, tr("Saved.")), text: tr(label) });
  return el("section", { class: "drawer-section missed" }, [
    el("h3", {}, [tr("Missed requests"), el("span", { class: "aside", text: tr("{n} open", { n: open }) })]),
    el("p", { class: "note", text: tr("What the client asked for that the boutique could not offer at the time, in the client's own words. From the Telegram summary of {d}.", { d: fmtDate(asOf) }) }),
    el("ul", { class: "lines missed-list" }, list.map((m) => {
      const st = MISSED_STATUS[m.status] || MISSED_STATUS.open;
      const reply = m.late && m.answered !== false && m.first_reply_minutes != null ? tr("first reply after {t}", { t: replyTime(m.first_reply_minutes) }) : "";
      return el("li", { "data-missed": String(m.id), class: m.status === "open" ? null : "done" }, [
        el("div", { class: "l1" }, [fmtDate(m.asked_at), " · ", el("b", { text: missedKindLabel(m) }), m.brand ? " · " + m.brand : "",
          reply ? " · " + reply : ""]),
        el("div", { class: "amt" }, [chip(st, tr(st.label))]),
        !blank(m.excerpt) ? el("div", { class: "item tg-quote" }, [el("q", { text: m.excerpt })]) : null,
        m.status !== "open" && m.status_by ? el("div", { class: "mmeta muted", text: tr("{status} by {by}, {d}", { status: tr(st.label), by: who(m.status_by), d: fmtDate(m.status_at) }) }) : null,
        can ? el("div", { class: "actions mact" }, m.status === "open"
          ? [setBtn(m, "followed_up", "Followed up"), setBtn(m, "closed", "Close", true)]
          : [setBtn(m, "open", "Reopen", true)]) : null,
      ]);
    })),
  ]);
}

/* ------------------------------------------------------------ history text */
function tgEventText(e) {
  switch (e.action) {
    case "telegram_linked":
      if (e.new_value === "confirmed") {
        return [el("b", { text: tr("Telegram chat confirmed as this client.") + " " }),
          e.note === "phone_added" ? tr("A phone number from the chat is now on file.") : ""];
      }
      return [el("b", { text: tr("Linked to a Telegram chat by phone number.") })];
    case "telegram_rejected": return [el("b", { text: tr("Suggested Telegram chat: not this client.") })];
    case "created_from_telegram":
      return [el("b", { text: tr("Created from the Telegram chats") + " — " + tr(e.new_value === "chat_buyer" ? "the chat suggests a purchase" : "a lead") + ". " }),
        /^\d{4}-\d\d-\d\d$/.test(String(e.note || "")) ? tr("Client last wrote {d}.", { d: fmtDate(e.note) }) : ""];
    case "missed_demand_set": {
      const [kind, brand] = String(e.note || "").split(":");
      const lab = (s) => tr((MISSED_STATUS[s] || { label: s || "—" }).label);
      return [el("b", { text: tr("Missed request: {a} → {b}", { a: lab(e.old_value), b: lab(e.new_value) }) + ". " }),
        tr(MISSED_KIND[kind] || kind || "") + (brand ? " · " + brand : "")];
    }
    default: return null;
  }
}
const TG_SYSTEM_ACTIONS = ["telegram_linked", "created_from_telegram"];

/* ---------------------------------------------------------------- insights */
function telegramInsights(t) {
  if (!t || !t.chats) return [];
  const L = t.leads || {}, M = t.missed || {};
  const leadDrill = () => drill({ status: "lead" }, "", "");
  const scoreboard = el("div", { class: "scoreboard tg-kpis" }, [
    tile({ label: tr("Chats in the summary"), val: String(num(t.chats)), sub: tr("{n} linked to a record", { n: num(t.linked) }) }),
    tile({ label: tr("Telegram leads"), val: String(num(L.total)), sub: tr("Bought before, by the chat") + ": " + num(L.buyers), onclick: leadDrill }),
    tile({ label: tr("Chats to confirm"), tone: num(t.to_confirm) ? "warning" : null, val: String(num(t.to_confirm)), sub: tr("may be a client in the file"),
      onclick: () => drill({ attention: "telegram_to_confirm" }, tr("Telegram chats to confirm"), "") }),
    tile({ label: tr("Open missed requests"), tone: num(M.open) ? "serious" : null, val: String(num(M.open)),
      sub: tr("{n} people · {f} in the file", { n: num(M.clients), f: num(M.in_file) }),
      onclick: () => drill({ missed: "any" }, tr("Missed requests"), "") }),
  ]);
  const leadItems = [
    ["buyers", "Bought before, by the chat"], ["hot", "Wrote in the last 30 days"],
    ["warm", "Wrote 31–180 days ago"], ["cold", "Wrote more than 180 days ago"],
  ].map(([k, l]) => ({ label: tr(l), value: num(L[k]), valueText: String(num(L[k])), tip: String(num(L[k])), tipLabel: tr(l), aria: tr(l) + ": " + num(L[k]) }));
  const leads = card(tr("Leads from Telegram"), null, [
    lede(tr("{total} people wrote to the boutique on Telegram but are in neither Colibri nor the questionnaire. By the chat, {buyers} of them have bought before.",
      { total: num(L.total), buyers: num(L.buyers) })),
    barList(leadItems),
    el("p", { class: "note", text: tr("Each lead is counted once: those who bought first, the rest by when they last wrote.") + " " +
      tr("{n} have a phone number. Days are counted to today; the summary is as of {d}.", { n: num(L.with_phone), d: fmtDate(t.as_of) }) }),
    el("div", { class: "actions" }, [el("button", { class: "btn sm", type: "button", onclick: leadDrill, text: tr("Open the {n} leads", { n: num(L.total) }) })]),
  ]);
  const kinds = (t.by_kind || []).slice();
  const missed = card(tr("What clients asked for and did not get"), tr("Click a bar to open the records in the file."), [
    lede(tr("{total} times between {a} and {b} a client asked for something the boutique could not offer, or waited more than a day for a reply: {clients} people, {in_file} of them in the client file.",
      { total: num(M.total), a: fmtDate(M.first), b: fmtDate(M.last), clients: num(M.clients), in_file: num(M.in_file) })),
    barList(kinds.map((k) => ({ label: tr(MISSED_KIND_SHORT[k.kind] || k.kind), value: num(k.requests),
      valueText: tr("{n} · {c} people", { n: num(k.requests), c: num(k.clients) }), tip: String(num(k.requests)), tipLabel: tr(MISSED_KIND[k.kind] || k.kind),
      aria: tr(MISSED_KIND[k.kind] || k.kind) + ": " + num(k.requests),
      onclick: num(k.in_file) ? () => drill({ missed: k.kind }, tr(MISSED_KIND[k.kind] || k.kind), "") : null }))),
    numbers([tr("Kind"), tr("Requests"), tr("People"), tr("In the file")], kinds.map((k) => [tr(MISSED_KIND_SHORT[k.kind] || k.kind), String(num(k.requests)), String(num(k.clients)), String(num(k.in_file))])),
  ]);
  const nc = t.not_carried || [];
  const brands = card(tr("Brands asked for that we don't carry"), null, [
    barList(nc.map((b) => ({ label: b.brand, value: num(b.requests), valueText: tr("{n} · {c} people", { n: num(b.requests), c: num(b.clients) }),
      tip: String(num(b.requests)), tipLabel: b.brand, aria: b.brand + ": " + num(b.requests),
      onclick: num(b.in_file) ? () => drill({ missed: "not_carried", missed_brand: b.brand }, b.brand, "") : null }))),
    nc.some((b) => /Bvlgari/.test(b.brand)) ? el("p", { class: "note", text: tr("Bvlgari watches are carried; the jewellery is not.") }) : null,
    numbers([tr("Brand"), tr("Requests"), tr("People"), tr("In the file")], nc.map((b) => [b.brand, String(num(b.requests)), String(num(b.clients)), String(num(b.in_file))])),
  ]);
  const years = t.by_year || [];
  const byYear = card(tr("Requests and slow replies by year"), null, [
    stackedColumns(years.map((y) => ({ label: String(y.year), parts: [num(y.requests), num(y.late)], cap: String(num(y.requests) + num(y.late)),
      tip: num(y.requests) + " · " + num(y.late), tipLabel: String(y.year), aria: y.year + ": " + num(y.requests) + ", " + num(y.late) })),
      [tr("Requests we could not meet"), tr("Replies after more than a day")]),
    numbers([tr("Year"), tr("Requests we could not meet"), tr("Replies after more than a day")], years.map((y) => [String(y.year), String(num(y.requests)), String(num(y.late))])),
  ]);
  return [scoreboard, el("div", { class: "ins-grid" }, [leads, missed, brands, byYear])];
}
