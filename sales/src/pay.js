/* ===========================================================================
   Payment, posting and the receipt (spec §5.3)
   Cash, card (Uzcard, Humo, Visa) and bank transfer, in so'm, split across any
   number of rows. Post is offered only when the payments equal the total to
   the so'm, a seller is set and a client or Walk-in is chosen — the server
   checks all of it again; the button is a convenience, not the guard.
   ========================================================================= */
Object.assign(RU, {
  "Payment": "Оплата",
  "Cash": "Наличные",
  "Card": "Карта",
  "Transfer": "Перевод",
  "+ Cash": "+ Наличные",
  "+ Card ▾": "+ Карта ▾",
  "+ Transfer": "+ Перевод",
  "Card type": "Тип карты",
  "Amount": "Сумма",
  "Remove this payment": "Убрать этот платёж",
  "Paid": "Оплачено",
  "Remaining": "Осталось",
  "Overpaid by {x}": "Переплата {x}",
  "Balanced": "Сходится",
  "Era receipt no. (optional)": "Номер чека Era (необязательно)",
  "← Back": "← Назад",
  "Post sale": "Провести продажу",
  "Posting…": "Проводим…",
  "Choose the seller.": "Выберите продавца.",
  "Choose a client or Walk-in.": "Выберите клиента или «Без карты клиента».",
  "Add a payment.": "Добавьте оплату.",
  "Every payment needs an amount.": "У каждого платежа должна быть сумма.",
  "{x} still to pay.": "Осталось оплатить {x}.",
  "Overpaid by {x}.": "Переплата {x}.",
  "At most {n} payments.": "Не больше {n} платежей.",
  "Cash above {x} so'm:": "Наличными больше {x} сум:",
  "this payment should go by card.": "такую сумму лучше принять картой.",
  "Sale posted": "Продажа проведена",
  "Test sale posted": "Тестовая продажа проведена",
  "Loading the receipt…": "Загружаем чек…",
  "Could not load the receipt: {e}": "Не удалось загрузить чек: {e}",
  "Ticket {n} · total {t}": "Чек {n} · итого {t}",
  "Print": "Печать",
  "{n} on this sale": "{n} в продаже",
});
const METHOD_LABEL = { cash: "Cash", card: "Card", transfer: "Transfer" };
const CARD_LABEL = { uzcard: "Uzcard", humo: "Humo", visa: "Visa" };
let payMenuOpen = false, posting = false;

function cashPaid() { return S.sale.payments.filter((p) => p.method === "cash").reduce((t, p) => t + (p.amount || 0), 0); }
function cashNoticeAt() { return (S.ref && S.ref.cash_notice_uzs) || 170000000; }
// Why Post is not offered yet — the first reason only, said in words.
function postBlocker() {
  const s = S.sale, rem = saleTotal() - paidTotal();
  if (!s.lines.length) return tr("Add at least one piece.");
  if (!saleReady()) return tr("Every piece needs a price.");
  if (!s.seller) return tr("Choose the seller.");
  if (!s.walk_in && !s.client_id) return tr("Choose a client or Walk-in.");
  if (!s.payments.length) return tr("Add a payment.");
  if (s.payments.some((p) => !(p.amount > 0))) return tr("Every payment needs an amount.");
  if (s.payments.length > MAX_PAYMENTS) return tr("At most {n} payments.", { n: MAX_PAYMENTS });
  if (rem > 0) return tr("{x} still to pay.", { x: fmtUZS(rem) });
  if (rem < 0) return tr("Overpaid by {x}.", { x: fmtUZS(-rem) });
  return null;
}
function addPayment(method, card_type) {
  if (S.sale.payments.length >= MAX_PAYMENTS) { toast(tr("At most {n} payments.", { n: MAX_PAYMENTS })); return; }
  const rem = saleTotal() - paidTotal();
  S.sale.payments.push({ method, card_type: card_type || null, amount: rem > 0 ? rem : null });
  payMenuOpen = false;
  renderAll();
  const inputs = document.querySelectorAll(".pay-row input.amt");
  const last = inputs[inputs.length - 1];
  if (last && !touchDevice()) { last.focus(); last.select(); }
}
function refreshPay() {
  const total = saleTotal(), paid = paidTotal(), rem = total - paid;
  const sum = $("#pay-sum");
  if (sum) {
    sum.innerHTML = "";
    sum.append(...[
      el("span", {}, tr("Paid") + " ", el("b", { text: fmtUZS(paid) })),
      el("span", {}, tr("Remaining") + " ", el("b", { text: fmtUZS(Math.max(rem, 0)) })),
      rem === 0 && paid > 0 ? el("span", { class: "ok", text: "✓ " + tr("Balanced") })
        : rem < 0 ? el("span", { class: "short", text: tr("Overpaid by {x}", { x: fmtUZS(-rem) }) }) : null,
    ].filter(Boolean));
  }
  const notice = $(".cash-notice");
  if (notice) notice.hidden = !(cashPaid() > cashNoticeAt());
  const why = postBlocker();
  const b = $("#post");
  if (b) { b.disabled = !!why || posting; }
  const w = $("#why");
  if (w) w.textContent = why || "";
}
function renderPayRow(p, i) {
  const amt = el("input", { type: "text", class: "amt", inputmode: "numeric", autocomplete: "off",
    value: p.amount === null || p.amount === undefined ? "" : fmtUZS(p.amount), "aria-label": tr("Amount"),
    onfocus: (ev) => ev.target.select(),
    oninput: (ev) => { p.amount = parseAmount(ev.target.value); refreshPay(); },
    onchange: (ev) => { p.amount = parseAmount(ev.target.value); ev.target.value = p.amount === null ? "" : fmtUZS(p.amount); refreshPay(); } });
  return el("li", { class: "pay-row" },
    el("div", { class: "p-m" }, tr(METHOD_LABEL[p.method]), p.card_type ? el("small", { text: "· " + CARD_LABEL[p.card_type] }) : null),
    amt,
    el("button", { type: "button", class: "btn subtle p-x", "aria-label": tr("Remove this payment"), title: tr("Remove this payment"),
      onclick: () => { S.sale.payments.splice(i, 1); renderAll(); } }, "✕"));
}
async function postSale() {
  if (posting || postBlocker()) return;
  const s = S.sale;
  const sale = {
    seller: s.seller,
    fiscal_ref: blank(s.fiscal_ref) ? null : s.fiscal_ref.trim(),
    draft_id: s.draft_id || null,
    lines: s.lines.map((l) => ({ piece_id: l.piece_id, price_uzs: l.price_uzs, discount_pct: l.discount_pct || 0, seller: l.seller || null })),
    payments: s.payments.map((p) => ({ method: p.method, card_type: p.card_type || null, amount: p.amount })),
  };
  if (s.walk_in) sale.walk_in = true; else sale.client_id = s.client_id;
  posting = true;
  const b = $("#post");
  if (b) { b.disabled = true; b.textContent = tr("Posting…"); }
  try {
    const r = await api("post", { sale });
    posting = false;
    S.lastPosted = r;
    S.sale = newSale();                 // posted: nothing left to post twice
    S.lastPct = null;
    go("#/receipt/" + encodeURIComponent(r.ticket_id));
  } catch (e) {
    posting = false;
    if (b) b.textContent = tr("Post sale");
    if (e.status !== 401) toast(e.message);     // a 401 already shows the passcode card
    refreshPay();
  }
}
function renderPay(main) {
  const s = S.sale;
  if (!S.rights.post) { main.append(el("div", { class: "notice-box", text: tr("Your account cannot make sales.") })); return; }
  if (!s.lines.length) { go("#/sale"); return; }
  const who = el("div", { class: "pay-who" }, sellerSelect());
  renderClientSlot(who);
  const fiscal = el("input", { type: "text", id: "fiscal", maxlength: "60", autocomplete: "off", value: s.fiscal_ref || "",
    oninput: (ev) => { s.fiscal_ref = ev.target.value; } });
  const add = el("div", { class: "pay-add" },
    el("button", { type: "button", class: "btn", id: "add-cash", onclick: () => addPayment("cash") }, tr("+ Cash")),
    el("button", { type: "button", class: "btn", id: "add-card", "aria-expanded": payMenuOpen ? "true" : "false",
      onclick: () => { payMenuOpen = !payMenuOpen; renderAll(); } }, tr("+ Card ▾")),
    payMenuOpen ? el("div", { class: "card-menu", role: "group", "aria-label": tr("Card type") },
      ["uzcard", "humo", "visa"].map((c) => el("button", { type: "button", class: "btn", "data-card": c,
        onclick: () => addPayment("card", c) }, CARD_LABEL[c]))) : null,
    el("button", { type: "button", class: "btn", id: "add-transfer", onclick: () => addPayment("transfer") }, tr("+ Transfer")));
  main.append(el("section", { class: "sheet", id: "screen-pay" },
    el("div", { class: "sheet-head" },
      el("h1", { text: tr("Payment") }),
      el("div", { class: "aside" }, el("span", { class: "muted", text: tr("{n} on this sale", { n: pl(s.lines.length, "piece") }) }))),
    el("div", { class: "pay-body" },
      who,
      el("ul", { class: "pay-rows", id: "pay-rows" }, s.payments.map(renderPayRow)),
      add,
      el("div", { class: "pay-sum", id: "pay-sum", "aria-live": "polite" }),
      el("div", { class: "cash-notice", role: "note", hidden: true },
        el("b", { text: tr("Cash above {x} so'm:", { x: fmtUZS(cashNoticeAt()) }) }), tr("this payment should go by card.")),
      el("label", { class: "fiscal", for: "fiscal" }, el("span", { text: tr("Era receipt no. (optional)") }), fiscal)),
    el("div", { class: "foot" },
      el("button", { type: "button", class: "btn", id: "back", onclick: () => go("#/sale") }, tr("← Back")),
      el("span", { class: "why", id: "why" }),
      el("div", { class: "total" },
        el("div", { class: "t-l", text: tr("Total") }),
        el("div", { class: "t-v", id: "total" }, fmtUZS(saleTotal()), el("small", { text: tr("so'm") }))),
      el("button", { type: "button", class: "btn primary big", id: "post", disabled: true, onclick: postSale }, tr("Post sale")))));
  refreshPay();
}

/* ----------------------------------------------------------------- receipt
   receipt_text is what the database stored with the ticket (pos_receipt_text);
   it is shown as written, each kind of line given its own style. */
function receiptLines(text) {
  const rows = String(text || "").split("\n");
  const out = [];
  let stage = "head", afterBrand = false;
  rows.forEach((t, i) => {
    let cls = "rc-line", node = null;
    const amount = /^(.*?)\s+(-?\d{1,3}(?: \d{3})*)$/.exec(t);
    if (i === 0 && /^TRAINING/.test(t)) cls += " rc-train";
    else if (t === "DELARDI") { cls += " rc-brand"; afterBrand = true; }
    else if (afterBrand) { cls += " rc-addr"; afterBrand = false; }
    else if (/^Ticket /.test(t)) cls += " rc-ticket";
    else if (/^(Seller|Client): /.test(t)) { cls += " rc-who"; stage = "items"; }
    else if (/^Total /.test(t) && amount) { stage = "pays"; node = el("div", { class: "rc-total" }, el("span", { text: amount[1] }), el("span", { class: "money", text: amount[2] })); }
    else if (stage === "pays" && amount) node = el("div", { class: "rc-pay" }, el("span", { text: amount[1] }), el("span", { class: "money", text: amount[2] }));
    else if (stage === "items") cls += / = /.test(t) ? " rc-amt" : " rc-item";
    out.push(node || el("div", { class: cls, text: t }));
  });
  return out;
}
async function renderReceipt(main, id) {
  const wrap = el("div", { class: "receipt-wrap", id: "screen-receipt" }, el("p", { class: "loading", text: tr("Loading the receipt…") }));
  main.append(wrap);
  const actions = () => el("div", { class: "receipt-actions" },
    el("button", { type: "button", class: "btn", onclick: () => window.print() }, tr("Print")),
    el("button", { type: "button", class: "btn primary big", id: "new-sale",
      onclick: () => { S.sale = newSale(); S.lastPct = null; payMenuOpen = false; go("#/sale"); } }, tr("New sale")));
  let doc = null, failed = null;
  try { doc = await api("ticket", { ticket_id: id }); } catch (e) { failed = e; }
  if (!wrap.isConnected) return;                 // the screen changed meanwhile
  wrap.innerHTML = "";
  const t = doc && doc.ticket;
  const training = t ? t.source === "training" : (S.lastPosted && S.lastPosted.mode === "training");
  wrap.append(el("div", { class: "receipt-head" },
    el("h1", { text: tr(training ? "Test sale posted" : "Sale posted") }),
    el("span", { class: "ok", text: "✓ " + (t ? t.ticket_no : (S.lastPosted ? S.lastPosted.ticket_no : "")) })));
  if (t) {
    wrap.append(el("article", { class: "receipt", "aria-label": t.ticket_no },
      el("div", { class: "rc-mast" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi" })),
      el("div", { class: "rc-body" }, receiptLines(t.receipt_text),
        el("img", { class: "rc-mono", src: LOGO_MONO, alt: "" }))));
  } else {
    // Posted, but the receipt cannot be read (no right to look up sales, or no connection).
    const p = S.lastPosted && S.lastPosted.ticket_id === id ? S.lastPosted : null;
    wrap.append(el("article", { class: "receipt" },
      el("div", { class: "rc-mast" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi" })),
      el("div", { class: "rc-body" },
        training ? el("div", { class: "rc-line rc-train", text: "TRAINING — NOT A SALE" }) : null,
        p ? el("div", { class: "rc-line rc-ticket", text: tr("Ticket {n} · total {t}", { n: p.ticket_no, t: fmtUZS(p.total) }) }) : null,
        el("div", { class: "rc-line rc-who", text: tr("Could not load the receipt: {e}", { e: failed ? failed.message : "" }) }))));
  }
  wrap.append(actions());
}
