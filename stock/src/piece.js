/* ===========================================================================
   Stock — the piece panel (right-hand, as the till's client panel) and the
   four state changes (spec 2026-11-16, Screens → Piece panel).
   showPiece(id) opens it and asks stock-api `piece`; closePiece() removes it
   and anything in it. Changes (Reserve, Book out, Damaged, Back in stock) go
   through an inline form, a confirmBox and `set_state`; the panel then redraws
   from the answer and the list refreshes. Every late answer checks S.locked and
   whether this panel is still the one on screen before it draws anything.
   S.pc = { id, d (the detail), err, notice, form: { state, v: {…}, err, busy } }
   ========================================================================= */
Object.assign(RU, {
  "Piece": "Изделие",
  "since {d}": "с {d}",
  "Reference": "Артикул",
  "Barcode": "Штрихкод",
  "Collection": "Коллекция",
  "Colour": "Цвет",
  "Metal": "Металл",
  "Stones": "Камни",
  "First seen": "Впервые в базе",
  "Hold": "Резерв и выдача",
  "Damage": "Повреждение",
  "Client": "Клиент",
  "Until": "До",
  "Note": "Заметка",
  "Reserve": "Резервировать",
  "Book out": "Выдать",
  "Damaged": "Повреждено",
  "Back in stock": "Вернуть в наличие",
  "Client reference": "Номер клиента",
  "Optional": "необязательно",
  "Hold until": "Держать до",
  "Return date": "Дата возврата",
  "Who has it and why": "У кого и зачем",
  "What is wrong": "Что не так",
  "Save": "Сохранить",
  "History": "История",
  "Open reviews": "Открытые проверки",
  "Sales": "Продажи",
  "Raised {d}": "Поднято {d}",
  "Ticket {n}": "Чек {n}",
  "Void": "Аннулирован",
  "Colibri": "Colibri",
  "Till": "Касса",
  "Training": "Учебный",
  "Reserve {s}?": "Резервировать {s}?",
  "Book out {s}?": "Выдать {s}?",
  "Mark {s} as damaged?": "Отметить {s} как повреждённое?",
  "Return {s} to stock?": "Вернуть {s} в наличие?",
  "Reserved {s}.": "{s}: зарезервировано.",
  "Booked out {s}.": "{s}: выдано.",
  "Marked {s} as damaged.": "{s}: отмечено как повреждённое.",
  "{s} is back in stock.": "{s}: снова в наличии.",
  "Client: {c}": "Клиент: {c}",
  "Until: {d}": "До: {d}",
  "Could not open this piece.": "Не удалось открыть изделие.",
  "Missing from export": "Нет в выгрузке",
  "Serial reused": "Серийный номер повторно",
  "Ticket conflict": "Конфликт с чеком",
  "First load": "Первичная загрузка",
  "Arrived": "Поступило",
  "White gold": "Белое золото",
  "Yellow gold": "Жёлтое золото",
  "Rose gold": "Розовое золото",
  "Platinum": "Платина",
  "Silver": "Серебро",
  "Steel": "Сталь",
  "Titanium": "Титан",
  "Ceramic": "Керамика",
  "Diamond": "Бриллиант",
  "Ruby": "Рубин",
  "Sapphire": "Сапфир",
  "Emerald": "Изумруд",
  "Pearl": "Жемчуг",
});

// ops_piece_events.reason → words
const REASON_WORDS = {
  initial_load: ["First load", "Первичная загрузка"], arrived: ["Arrived", "Поступило"], sold: ["Sold", "Продано"],
  refunded: ["Refunded", "Возврат"], reserved: ["Reserved", "Резерв"], released: ["Released", "Снят резерв"],
  booked_out: ["Booked out", "Выдано"], returned_from_loan: ["Returned", "Возвращено"], damaged: ["Damaged", "Повреждено"],
  repaired: ["Repaired", "Отремонтировано"], review_resolved: ["Review resolved", "Проверка закрыта"],
  serial_reused: ["Serial reused", "Серийный номер повторно"],
};
const REVIEW_KIND = { missing_from_export: "Missing from export", serial_reused: "Serial reused", ticket_conflict: "Ticket conflict" };
const SOURCE_WORD = { colibri: "Colibri", delardi: "Till", training: "Training" };

function humanKey(key) {
  const s = String(key || "").replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function reasonWord(r) {
  const w = REASON_WORDS[r];
  return w ? w[LANG === "ru" ? 1 : 0] : (blank(r) ? "" : humanKey(r));
}
const keyWords = (keys) => (keys || []).map((k) => tr(humanKey(k))).join(", ");
const ticketHref = (id) => "../sales/#/ticket/" + encodeURIComponent(id);

/* ------------------------------------------------------------ open, close */
let pcSeq = 0;
function showPiece(id) {
  if (S.locked) return;
  S.pc = { id, d: null, err: null, notice: null, form: null };
  S.pieceId = id;
  renderPiece();
  loadPiece(id);
  const c = $("#piece-close");
  if (c && !touchDevice()) c.focus();
}
function closePiece() {
  pcSeq++;
  S.pc = null;
  S.pieceId = null;
  const h = $("#piece-panel");
  if (h) h.remove();
}
function stillHere(pc) { return !S.locked && S.pc === pc; }

// Ask for the piece (first open, or again after a refusal). A form stays on screen only while the
// new state still allows it.
async function loadPiece(id) {
  const pc = S.pc;
  const seq = ++pcSeq;
  try {
    const d = await api("piece", { piece_id: id });
    if (!stillHere(pc) || seq !== pcSeq) return;
    pc.d = d; pc.err = null;
    if (pc.form && !actionsFor(d.piece.state).includes(pc.form.state)) pc.form = null;   // it moved meanwhile: the notice says why
    else pc.notice = null;
  } catch (e) {
    if (!stillHere(pc) || seq !== pcSeq) return;
    pc.err = e.message;
  }
  renderPiece();
}
function refreshList() {
  if (typeof loadList === "function" && $("#rows")) loadList();
}

/* -------------------------------------------------------------- the draw */
const ACTIONS = { in_stock: ["reserved", "booked_out", "damaged"], reserved: ["in_stock"], booked_out: ["in_stock"], damaged: ["in_stock"] };
const actionsFor = (state) => ACTIONS[state] || [];
const ACTION_LABEL = { reserved: "Reserve", booked_out: "Book out", damaged: "Damaged", in_stock: "Back in stock" };

function fact(label, value) {
  return el("div", { class: "pc-fact" }, el("dt", { class: "lbl", text: tr(label) }), el("dd", { text: blank(value) ? "—" : value }));
}
function heldBy(d) {
  const p = d.piece;
  if (!blank(d.client_name)) return d.client_name;
  return blank(p.hold_client_id) ? null : p.hold_client_id;
}
function holdBlock(d) {
  const p = d.piece;
  if (p.state === "damaged") {
    return el("section", { class: "pc-sec", id: "pc-hold" }, el("h3", { class: "lbl", text: tr("Damage") }),
      el("dl", { class: "pc-facts one" }, fact("Note", p.state_note)));
  }
  if (p.state !== "reserved" && p.state !== "booked_out") return null;
  const who = heldBy(d);
  return el("section", { class: "pc-sec", id: "pc-hold" }, el("h3", { class: "lbl", text: tr("Hold") }),
    el("dl", { class: "pc-facts one" },
      fact("Client", who),
      blank(p.hold_until) ? null : fact("Until", fmtDate(p.hold_until)),
      blank(p.state_note) ? null : fact("Note", p.state_note)));
}

function historyItem(e) {
  const to = stateWord(e.to_state);
  const move = blank(e.from_state) ? to : stateWord(e.from_state) + " → " + to;
  return el("li", { class: "pc-ev" },
    el("span", { class: "ev-when num", text: fmtDate(e.at) + ", " + fmtTime(e.at) }),
    el("span", { class: "ev-move", text: move }),
    blank(e.reason) ? null : el("span", { class: "ev-reason small", text: reasonWord(e.reason) }),
    blank(e.actor) ? null : el("span", { class: "ev-actor small", text: e.actor }),
    blank(e.note) ? null : el("span", { class: "ev-note", text: e.note }),
    !blank(e.ticket_no) && !blank(e.ticket_id)
      ? el("a", { class: "ev-ticket", href: ticketHref(e.ticket_id), text: tr("Ticket {n}", { n: e.ticket_no }) }) : null);
}
function saleItem(s) {
  return el("li", { class: "pc-sale" },
    !blank(s.ticket_id) ? el("a", { class: "ev-ticket", href: ticketHref(s.ticket_id), text: blank(s.ticket_no) ? "—" : s.ticket_no })
      : el("span", { text: blank(s.ticket_no) ? "—" : s.ticket_no }),
    el("span", { class: "num", text: fmtDate(s.sold_at) }),
    el("span", { class: "num", text: fmtMoney(s.net) }),
    el("span", { class: "small", text: tr(SOURCE_WORD[s.source] || humanKey(s.source)) }),
    s.status === "void" ? el("span", { class: "tag done", text: tr("Void") }) : null);
}

function renderPiece() {
  const pc = S.pc;
  if (!pc || S.locked) return;
  let host = $("#piece-panel");
  const old = host && host.querySelector(".panel");
  const top = old ? old.scrollTop : 0;
  if (!host) { host = el("div", { id: "piece-panel", class: "panel-wrap" }); document.body.appendChild(host); }
  host.innerHTML = "";
  const d = pc.d;
  const p = d && d.piece;
  const body = [];
  if (pc.err) {
    body.push(el("p", { class: "notice", role: "alert", text: tr("Could not open this piece.") + " " + pc.err }));
  } else if (!d) {
    body.push(el("p", { class: "small", text: tr("Loading…") }));
  } else {
    const title = [p.brand, p.model_name].filter((x) => !blank(x)).join(" · ") || p.serial || "—";
    body.push(
      el("h2", { class: "h2", id: "pc-title", text: title }),
      el("div", { class: "pc-state" }, stateTag(p.state), el("span", { class: "since small", text: tr("since {d}", { d: fmtDate(p.state_since) }) })));
    if (pc.notice) body.push(el("p", { class: "notice", role: "alert", id: "pc-notice", text: pc.notice }));
    body.push(el("dl", { class: "pc-facts", id: "pc-facts" },
      fact("Serial", p.serial), fact("Barcode", p.barcode), fact("Reference", p.article), fact("Collection", p.collection),
      fact("Colour", p.colour), fact("Size", p.size), fact("Category", categoryWord(p.category)),
      fact("Metal", keyWords(d.model && d.model.metal_keys)), fact("Stones", keyWords(d.model && d.model.stone_keys)),
      fact("Price", fmtMoney(p.price_uzs)), fact("First seen", fmtDate(p.first_seen_at))));
    body.push(holdBlock(d));
    if (S.rights.manage && actionsFor(p.state).length) {
      if (pc.form) body.push(formBlock(pc, p));
      else body.push(el("div", { class: "pc-actions", id: "pc-actions", role: "group" },
        actionsFor(p.state).map((a) => el("button", { type: "button", class: "btn" + (a === "in_stock" ? "" : " act"), "data-act": a,
          onclick: () => openForm(a), text: tr(ACTION_LABEL[a]) }))));
    }
    body.push(el("section", { class: "pc-sec" }, el("h3", { class: "lbl", text: tr("History") }),
      el("ul", { class: "pc-list", id: "pc-history" }, (d.events || []).map(historyItem))));
    const open = (d.reviews || []).filter((r) => r.status === "open");
    if (open.length) {
      body.push(el("section", { class: "pc-sec" }, el("h3", { class: "lbl", text: tr("Open reviews") }),
        el("ul", { class: "pc-list", id: "pc-reviews" }, open.map((r) => el("li", { class: "pc-ev" },
          el("span", { text: tr(REVIEW_KIND[r.kind] || humanKey(r.kind)) }),
          el("span", { class: "small", text: tr("Raised {d}", { d: fmtDate(r.raised_at) }) }))))));
    }
    if ((d.sales || []).length) {
      body.push(el("section", { class: "pc-sec" }, el("h3", { class: "lbl", text: tr("Sales") }),
        el("ul", { class: "pc-list", id: "pc-sales" }, d.sales.map(saleItem))));
    }
  }
  host.append(el("div", { class: "panel-scrim", onclick: closePiece }),
    el("section", { class: "panel pcbox", role: "dialog", "aria-modal": "true", "aria-labelledby": d ? "pc-title" : "pc-label" },
      el("div", { class: "pc-head" },
        el("span", { id: "pc-label", class: "lbl", text: tr("Piece") + (p && p.serial ? " " + p.serial : "") }),
        el("button", { type: "button", class: "btn subtle close", id: "piece-close", "aria-label": tr("Close"), onclick: closePiece, text: "×" })),
      el("div", { class: "pc-body" }, body)));
  const nb = host.querySelector(".panel");
  if (nb && top) nb.scrollTop = top;
}

/* --------------------------------------------------------------- the form */
function openForm(state) {
  const pc = S.pc;
  if (!pc || !pc.d) return;
  pc.form = { state, v: { client: "", until: "", note: "" }, err: null, busy: false };
  renderPiece();
  const f = $("#pf-client") || $("#pf-note");
  if (f && !touchDevice()) f.focus();
}
function formBlock(pc, p) {
  const f = pc.form, st = f.state;
  const hold = st === "reserved" || st === "booked_out";
  const noteReq = st === "booked_out" || st === "damaged";
  const keep = (key) => (ev) => { f.v[key] = ev.target.value; if (key === "note") markInvalid(ev.target, false); };
  const field = (id, label, control, optional) => el("label", { class: "pf-field", for: id },
    el("span", { class: "lbl", text: tr(label) + (optional ? " · " + tr("Optional") : "") }), control);
  const noteLabel = st === "booked_out" ? "Who has it and why" : st === "damaged" ? "What is wrong" : "Note";
  const form = el("form", { class: "pc-form", id: "pc-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); submitForm(); } },
    el("h3", { class: "lbl", text: tr(ACTION_LABEL[st]) }),
    st === "reserved" ? field("pf-client", "Client reference",
      el("input", { type: "text", id: "pf-client", maxlength: "20", autocomplete: "off", spellcheck: "false", placeholder: "DLD-…", value: f.v.client, oninput: keep("client") }), true) : null,
    hold ? field("pf-until", st === "booked_out" ? "Return date" : "Hold until",
      el("input", { type: "date", id: "pf-until", value: f.v.until, oninput: keep("until"), onchange: keep("until") }), true) : null,
    field("pf-note", noteLabel,
      el("textarea", { id: "pf-note", maxlength: "500", value: f.v.note, oninput: keep("note"), "aria-required": noteReq ? "true" : null }), !noteReq),
    el("p", { class: "form-err", id: "pf-err", role: "alert", hidden: f.err ? null : true, text: f.err || "" }),
    el("div", { class: "pc-form-foot" },
      el("button", { type: "submit", class: "btn primary", id: "pf-submit", disabled: f.busy ? true : null, text: tr("Save") }),
      el("button", { type: "button", class: "btn", id: "pf-cancel", disabled: f.busy ? true : null, onclick: () => { pc.form = null; renderPiece(); }, text: tr("Cancel") })));
  if (f.err && noteReq && blank(f.v.note)) form.querySelector("#pf-note").setAttribute("aria-invalid", "true");
  return form;
}

const CONFIRM_TITLE = { reserved: "Reserve {s}?", booked_out: "Book out {s}?", damaged: "Mark {s} as damaged?", in_stock: "Return {s} to stock?" };
const DONE_TOAST = { reserved: "Reserved {s}.", booked_out: "Booked out {s}.", damaged: "Marked {s} as damaged.", in_stock: "{s} is back in stock." };

async function submitForm() {
  const pc = S.pc;
  if (!pc || !pc.form || pc.form.busy || S.locked) return;
  const f = pc.form, st = f.state, p = pc.d.piece;
  const note = f.v.note.trim();
  const hold = st === "reserved" || st === "booked_out";
  if (blank(note) && (st === "booked_out" || st === "damaged")) {
    f.err = tr(st === "booked_out" ? "Write who has it and why." : "Write what is wrong.");
    renderPiece();
    const n = $("#pf-note");
    if (n) n.focus();
    return;
  }
  f.err = null;
  const client = st === "reserved" ? f.v.client.trim() : "";
  const body = [];
  if (client) body.push(tr("Client: {c}", { c: client }));
  if (hold && f.v.until) body.push(tr("Until: {d}", { d: fmtDate(f.v.until) }));
  if (note) body.push(note);
  const ok = await confirmBox({ title: tr(CONFIRM_TITLE[st], { s: p.serial }), body, ok: tr(ACTION_LABEL[st]), cancel: tr("Cancel") });
  if (!ok || !stillHere(pc) || pc.form !== f) return;
  f.busy = true;
  renderPiece();
  const req = { piece_id: p.piece_id, state: st };
  if (note) req.note = note;
  if (client) req.client_id = client;
  if (hold && f.v.until) req.until = f.v.until;
  try {
    const d = await api("set_state", req);
    if (!stillHere(pc)) return;
    pc.d = d; pc.form = null; pc.notice = null; pc.err = null;
    renderPiece();
    toast(tr(DONE_TOAST[st], { s: p.serial }));
    refreshList();
  } catch (e) {
    if (!stillHere(pc)) return;
    f.busy = false; f.err = e.message;
    if (e.status === 409) { pc.notice = e.message; loadPiece(pc.id); refreshList(); }   // it may have moved meanwhile (sold, …)
    renderPiece();
    const er = $("#pf-err");
    if (er && !er.hidden) er.scrollIntoView({ block: "nearest" });
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.pc && !$("#confirm-dialog")) { e.preventDefault(); closePiece(); }
});
