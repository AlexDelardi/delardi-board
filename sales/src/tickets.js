/* ===========================================================================
   Tickets (spec §5.5): the list, one ticket, its receipt, and void
   Colibri tickets are read-only here. A sale from this till (delardi, or
   training while the till is in training) can show its receipt, and can be
   voided by a login with the void right — with a reason, after a confirm.
   Voiding here does not touch the fiscal receipt: Era is separate, so the
   page says so.
   ========================================================================= */
Object.assign(RU, {
  "Search: ticket no., client, serial, article, brand": "Поиск: № чека, клиент, серийный номер, артикул, бренд",
  "Search tickets": "Поиск чеков",
  "From": "С",
  "To": "По",
  "All sellers": "Все продавцы",
  "All sources": "Все источники",
  "This till": "Эта касса",
  "Test sales (training)": "Тестовые продажи (обучение)",
  "Any status": "Любой статус",
  "Posted": "Проведён",
  "Void": "Аннулирован",
  "VOIDED": "АННУЛИРОВАН",
  "Source": "Источник",
  "Status": "Статус",
  "Loading tickets…": "Загружаем чеки…",
  "No ticket matches.": "Чеков не найдено.",
  "{n} void": "аннулировано: {n}",
  "net {x} so'm": "нетто {x} сум",
  "Date": "Дата",
  "Ticket": "Чек",
  "Items": "Изделия",
  "Net": "Нетто",
  "← Newer": "← Новее",
  "Older →": "Старше →",
  "Page {p} of {n}": "Стр. {p} из {n}",
  "Test sales are listed apart: nothing in them is real.": "Тестовые продажи показаны отдельно: в них нет ничего настоящего.",
  "← Tickets": "← Чеки",
  "Colibri": "Colibri",
  "Training": "Обучение",
  "From Colibri — read-only.": "Из Colibri — только просмотр.",
  "Entered by": "Провёл(а)",
  "Era receipt no.": "Номер чека Era",
  "Void reason": "Причина аннулирования",
  "Voided by": "Аннулировал(а)",
  "Refund": "Возврат",
  "Payments": "Оплата",
  "Receipt": "Чек",
  "Hide the receipt": "Скрыть чек",
  "Why is this sale being voided?": "Почему продажа аннулируется?",
  "Void this sale": "Аннулировать продажу",
  "Write the reason for the void.": "Напишите причину аннулирования.",
  "Void {no}?": "Аннулировать {no}?",
  "Its pieces go back in stock and the client's purchase is taken off the CRM record.":
    "Изделия вернутся в наличие, а покупка будет убрана из карточки клиента.",
  "A test sale: nothing real changes.": "Тестовая продажа: ничего настоящего не меняется.",
  "Reason: {r}": "Причина: {r}",
  "{no} voided.": "{no} аннулирован.",
  "Cancel the fiscal receipt in Era as well.": "Отмените также фискальный чек в Era.",
  "No ticket with that reference.": "Чека с таким номером нет.",
  "seller": "продавец",
});
PL.ticket = { en: ["ticket", "tickets"], ru: ["чек", "чека", "чеков"] };
const SOURCE_LABEL = { colibri: "Colibri", delardi: "This till", training: "Training" };
const ours = (t) => t.source === "delardi" || t.source === "training";
const tkToday = (back) => new Date(Date.now() + 5 * 3600e3 - (back || 0) * 86400e3).toISOString().slice(0, 10);   // Tashkent

/* -------------------------------------------------------------------- list */
S.tk = null;
function tkState() {
  if (!S.tk) S.tk = { f: { q: "", from: tkToday(29), to: tkToday(0), seller: "", source: "", status: "" }, page: 1, data: null, err: null, seq: 0 };
  // test sales are offered only while the till is in training
  if (S.tk.f.source === "training" && S.mode !== "training") { S.tk.f.source = ""; S.tk.page = 1; }
  return S.tk;
}
function tkFilters() {
  const f = S.tk.f, out = { page: S.tk.page };
  if (!blank(f.q)) out.q = f.q.trim();
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.seller) out.seller = f.seller;
  if (f.source === "training") out.training = true; else if (f.source) out.source = f.source;
  if (f.status) out.status = f.status;
  return out;
}
async function loadTickets() {
  const tk = S.tk, seq = ++tk.seq;
  tk.busy = true; renderTkList();
  try {
    const r = await api("tickets", { filters: tkFilters() });
    if (seq !== tk.seq) return;
    tk.data = r; tk.err = null;
  } catch (e) {
    if (seq !== tk.seq) return;
    tk.err = e.message;
  }
  tk.busy = false;
  renderTkList();
}
function tkSet(patch) { Object.assign(S.tk.f, patch); S.tk.page = 1; loadTickets(); }
let tkTimer = null;
function renderTickets(main) {
  if (!S.rights.view) { main.append(el("div", { class: "notice", text: tr("Your account cannot look up sales.") })); return; }
  const tk = tkState(), f = tk.f;
  const opt = (v, t, cur) => el("option", { value: v, text: t, selected: v === cur ? true : null });
  const sel = (id, label, cur, opts, key) => {
    const s = el("select", { id, "aria-label": label, onchange: (ev) => tkSet({ [key]: ev.target.value }) }, opts);
    s.value = cur;
    return s;
  };
  const q = el("input", { type: "search", id: "tk-q", value: f.q, autocomplete: "off", spellcheck: "false",
    placeholder: tr("Search: ticket no., client, serial, article, brand"), "aria-label": tr("Search tickets"),
    oninput: (ev) => { f.q = ev.target.value; clearTimeout(tkTimer); tkTimer = setTimeout(() => tkSet({}), 400); },
    onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); clearTimeout(tkTimer); tkSet({ q: ev.target.value }); } } });
  const date = (id, label, key) => el("label", { class: "tk-date-f" }, el("span", { text: tr(label) }),
    el("input", { type: "date", id, value: f[key], onchange: (ev) => tkSet({ [key]: ev.target.value }) }));
  main.append(el("section", { class: "sheet", id: "screen-tickets" },
    el("div", { class: "sheet-head" }, el("h1", { text: tr("Tickets") })),
    el("div", { class: "tk-filters" },
      el("div", { class: "tk-q" }, q),
      date("tk-from", "From", "from"), date("tk-to", "To", "to"),
      sel("tk-seller", tr("Seller"), f.seller, [opt("", tr("All sellers"), f.seller), ...((S.ref && S.ref.sellers) || []).map((x) => opt(x, x, f.seller))], "seller"),
      sel("tk-source", tr("Source"), f.source, [opt("", tr("All sources")), opt("colibri", tr("Colibri")), opt("delardi", tr("This till")),
        S.mode === "training" ? opt("training", tr("Test sales (training)")) : null].filter(Boolean), "source"),
      sel("tk-status", tr("Status"), f.status, [opt("", tr("Any status")), opt("posted", tr("Posted")), opt("void", tr("Void"))], "status")),
    f.source === "training" ? el("p", { class: "tk-train-note", text: tr("Test sales are listed apart: nothing in them is real.") }) : null,
    el("div", { id: "tk-body" })));
  renderTkList();
  loadTickets();
}
// Status tag: void alert, a test sale card-filled, otherwise navy (the till's "Posted" is the mockup's "Sold").
function tkStatus(status, source) {
  if (status === "void") return el("span", { class: "tag alert", text: tr("VOIDED") });
  if (source === "training") return el("span", { class: "tag info", text: tr("Training") });
  return el("span", { class: "tag act", text: tr("Posted") });
}
// Colibri tickets carry a date only (stored as midnight UTC), so their "time" would be a fake 05:00.
const tkWhen = (iso, source) => source === "colibri" ? fmtDate(iso) : fmtDate(iso) + " " + fmtTime(iso);
function renderTkList() {
  const box = $("#tk-body");
  if (!box || !S.tk) return;
  const tk = S.tk, d = tk.data;
  box.innerHTML = "";
  if (tk.err) { box.append(el("p", { class: "form-err tk-pad", role: "alert", text: tk.err })); return; }
  if (!d) { box.append(el("p", { class: "loading", text: tr("Loading tickets…") })); return; }
  const pages = Math.max(1, Math.ceil(d.count / (d.page_size || 50)));
  const sumParts = [el("b", { text: pl(d.count, "ticket") })];
  if (d.void_count) sumParts.push(" · ", el("span", { text: tr("{n} void", { n: d.void_count }) }));
  sumParts.push(" · ", el("span", { class: "money", text: tr("net {x} so'm", { x: fmtUZS(d.net_total) }) }));
  if (tk.busy) sumParts.push(" · ", el("span", { class: "small", text: tr("Searching…") }));
  box.append(el("div", { class: "tk-sum", id: "tk-sum", "aria-live": "polite" }, ...sumParts));
  if (!d.rows.length) { box.append(el("p", { class: "small tk-pad", text: tr("No ticket matches.") })); return; }
  const cols = [["Ticket", "tk-numcell"], ["Date", "tk-date"], ["Items", "tk-items"], ["Client", "tk-client"], ["Seller", "tk-seller"],
    ["Source", "tk-src"], ["Status", "tk-st"], ["Net", "tk-net r"]];
  box.append(el("div", { class: "tk-scroll" }, el("table", { class: "tbl tk-list", id: "tk-list", "aria-label": tr("Tickets") },
    el("thead", {}, el("tr", {}, cols.map(([h, c]) => el("th", { scope: "col", class: "tk-h " + c, text: tr(h) })))),
    el("tbody", {}, d.rows.map((r) => {
      const href = "#/ticket/" + encodeURIComponent(r.ticket_id);
      return el("tr", { class: "tk-row" + (r.status === "void" ? " is-void" : ""), onclick: (ev) => { if (!ev.target.closest("a")) location.hash = href; } },
        el("td", { class: "tk-numcell" }, el("a", { class: "tk-no", href, text: r.ticket_no })),
        el("td", { class: "tk-date", text: tkWhen(r.sold_at, r.source) }),
        el("td", { class: "tk-items", text: r.items || "—" }),
        el("td", { class: "tk-client", text: r.client_name || (r.walk_in ? walkInText() : r.client_id || "—") }),
        el("td", { class: "tk-seller", text: r.seller || "—" }),
        el("td", { class: "tk-src", text: tr(SOURCE_LABEL[r.source] || r.source) }),
        el("td", { class: "tk-st" }, tkStatus(r.status, r.source)),
        el("td", { class: "tk-net r money", text: fmtUZS(r.net) }));
    })))));
  if (pages > 1) {
    const pg = (p) => { tk.page = p; loadTickets(); };
    box.append(el("div", { class: "tk-pager" },
      el("button", { type: "button", class: "btn", disabled: tk.page <= 1 ? true : null, onclick: () => pg(tk.page - 1) }, tr("← Newer")),
      el("span", { class: "small", text: tr("Page {p} of {n}", { p: tk.page, n: pages }) }),
      el("button", { type: "button", class: "btn", disabled: tk.page >= pages ? true : null, onclick: () => pg(tk.page + 1) }, tr("Older →"))));
  }
}

/* ------------------------------------------------------------- one ticket */
async function renderTicket(main, id) {
  if (!S.rights.view) { main.append(el("div", { class: "notice", text: tr("Your account cannot look up sales.") })); return; }
  const wrap = el("section", { class: "sheet", id: "screen-ticket" }, el("p", { class: "loading", text: tr("Loading…") }));
  main.append(wrap);
  let doc;
  try { doc = await api("ticket", { ticket_id: id }); }
  catch (e) {
    if (!wrap.isConnected) return;
    wrap.innerHTML = "";
    wrap.append(el("div", { class: "sheet-head" }, el("h1", { text: tr("Ticket") }),
      el("div", { class: "aside" }, el("a", { class: "btn", href: "#/tickets", text: tr("← Tickets") }))),
      el("p", { class: "form-err tk-pad", role: "alert", text: e.status === 404 ? tr("No ticket with that reference.") : e.message }));
    return;
  }
  if (!wrap.isConnected) return;
  wrap.innerHTML = "";                            // the "Loading…" line goes
  drawTicket(wrap, doc, { receipt: false, voidOpen: false, reason: "", err: null });
}
function drawTicket(wrap, doc, ui) {
  const t = doc.ticket, lines = doc.lines || [], pays = doc.payments || [];
  const mine = ours(t), voided = t.status === "void";
  const canVoid = mine && !voided && S.rights.void;
  const total = docTotal(lines);
  const redraw = () => { wrap.innerHTML = ""; drawTicket(wrap, doc, ui); };
  const kv = (k, v) => blank(v) ? null : el("div", { class: "kv" }, el("dt", { text: tr(k) }), el("dd", {}, v));
  const client = doc.client_name ? doc.client_name + (t.client_id ? " · " + t.client_id : "") : t.walk_in ? walkInText() : (t.client_id || t.client_raw || null);
  const lineRow = (l) => {
    const refund = l.kind === "refund";
    const sign = (n) => (n === null || n === undefined || n === "") ? null : (refund ? -Math.abs(Number(n)) : Number(n));
    return el("li", { class: "tl-row" + (refund ? " refund" : "") },
      el("div", { class: "tl-info" },
        el("div", { class: "tl-title" }, [l.brand_raw, l.item_name].filter(Boolean).join(" · ") || l.article || "—",
          refund ? el("span", { class: "tag line", text: tr("Refund") }) : null),
        el("div", { class: "tl-meta" }, [l.serial_raw, l.article, l.size ? tr("size {s}", { s: l.size }) : null, l.seller ? tr("Seller: {s}", { s: l.seller }) : null]
          .filter(Boolean).join(" · "))),
      el("div", { class: "tl-price money" }, fmtUZS(sign(l.price_current)),
        Number(l.discount_pct) ? el("small", { text: " −" + pctText(l.discount_pct) + "%" }) : null),
      el("div", { class: "tl-net money", text: fmtUZS(sign(l.net)) }));
  };
  const payText = (p) => tr(METHOD_LABEL[p.method] || p.method || "") + (p.card_type ? " · " + (CARD_LABEL[p.card_type] || p.card_type) : "");
  const actions = [];
  if (mine && t.receipt_text) actions.push(el("button", { type: "button", class: "btn", id: "show-receipt", "aria-expanded": ui.receipt ? "true" : "false",
    onclick: () => { ui.receipt = !ui.receipt; redraw(); } }, tr(ui.receipt ? "Hide the receipt" : "Receipt")));
  if (canVoid && !ui.voidOpen) actions.push(el("button", { type: "button", class: "btn danger", id: "void",
    onclick: () => { ui.voidOpen = true; ui.err = null; redraw(); const r = $("#void-reason"); if (r) r.focus(); } }, tr("Void")));
  const submitVoid = async () => {
    const reason = ui.reason.trim();
    if (!reason) { ui.err = tr("Write the reason for the void."); redraw(); return; }
    const yes = await confirmBox({ title: tr("Void {no}?", { no: t.ticket_no }),
      body: [tr(t.source === "training" ? "A test sale: nothing real changes." : "Its pieces go back in stock and the client's purchase is taken off the CRM record."),
        tr("Reason: {r}", { r: reason })],
      ok: tr("Void this sale"), danger: true });
    if (!yes) return;
    try {
      await api("void", { ticket_id: t.ticket_id, reason });
      toast(tr("{no} voided.", { no: t.ticket_no }));
      const fresh = await api("ticket", { ticket_id: t.ticket_id });
      if (!wrap.isConnected) return;
      Object.assign(doc, fresh);
      ui.voidOpen = false; ui.err = null;
      redraw();
    } catch (e) {
      if (e.status === 401) return;
      ui.err = e.message; redraw();
    }
  };
  // Node.append would print a null as "null": the optional parts go through filter(Boolean)
  wrap.append(...[
    el("div", { class: "sheet-head" },
      el("h1", { text: t.ticket_no }),
      el("span", { class: "tk-status" }, tkStatus(t.status, t.source)),
      el("div", { class: "aside" }, el("a", { class: "btn", href: "#/tickets", text: tr("← Tickets") }))),
    t.source === "training" ? el("p", { class: "tk-train-note", text: tr("Test sales are listed apart: nothing in them is real.") }) : null,
    el("dl", { class: "tk-meta" },
      kv("Date", tkWhen(t.sold_at, t.source)),
      kv("Source", tr(SOURCE_LABEL[t.source] || t.source)),
      kv("Seller", t.seller),
      kv("Client", client),
      kv("Entered by", t.entered_by ? who(t.entered_by) : null),
      kv("Era receipt no.", t.fiscal_ref),
      voided ? kv("Void reason", t.void_reason) : null,
      voided ? kv("Voided by", [t.voided_by ? who(t.voided_by) : null, t.voided_at ? tkWhen(t.voided_at) : null].filter(Boolean).join(", ")) : null),
    !mine ? el("p", { class: "ro-note", text: tr("From Colibri — read-only.") }) : null,
    voided && mine ? el("p", { class: "notice era-reminder", id: "era-reminder", role: "note", text: tr("Cancel the fiscal receipt in Era as well.") }) : null,
    el("ol", { class: "tl-lines" }, lines.map(lineRow)),
    el("div", { class: "tl-foot" },
      el("div", { class: "tl-pays" }, el("h5", { text: tr("Payments") }),
        pays.length ? pays.map((p) => el("div", { class: "tl-pay" }, el("span", { text: payText(p) }), el("span", { class: "money", text: fmtUZS(p.amount) })))
          : el("p", { class: "small", text: "—" })),
      el("div", { class: "total" }, el("div", { class: "t-l", text: tr("Total") }),
        el("div", { class: "keynum" }, fmtUZS(total), el("small", { text: tr("so'm") })))),
    ui.voidOpen ? el("form", { class: "void-form", id: "void-form", onsubmit: (ev) => { ev.preventDefault(); submitVoid(); } },
      el("label", { for: "void-reason", class: "lbl", text: tr("Why is this sale being voided?") }),
      el("textarea", { id: "void-reason", rows: "3", maxlength: "500", value: ui.reason, oninput: (ev) => { ui.reason = ev.target.value; if (ui.err && ui.reason.trim()) { ui.err = null; const x = $("#void-form .form-err"); if (x) x.remove(); } } }),
      ui.err ? el("p", { class: "form-err", role: "alert", text: ui.err }) : null,
      el("p", { class: "small", text: tr("Cancel the fiscal receipt in Era as well.") }),
      el("div", { class: "form-actions" },
        el("button", { type: "submit", class: "btn danger", id: "void-go" }, tr("Void this sale")),
        el("button", { type: "button", class: "btn subtle", onclick: () => { ui.voidOpen = false; ui.err = null; redraw(); } }, tr("Cancel")))) : null,
    actions.length ? el("div", { class: "tk-actions" }, actions) : null,
    ui.receipt && t.receipt_text ? el("div", { class: "tk-receipt" },
      el("article", { class: "receipt", "aria-label": t.ticket_no },
        el("div", { class: "rc-mast" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi" })),
        el("div", { class: "rc-body" }, receiptLines(t.receipt_text), el("img", { class: "rc-mono", src: LOGO_MONO, alt: "" }))),
      el("div", { class: "receipt-actions" }, el("button", { type: "button", class: "btn", onclick: () => window.print() }, tr("Print")))) : null,
  ].filter(Boolean));
}
