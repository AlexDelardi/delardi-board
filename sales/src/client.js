/* ===========================================================================
   The client on a sale (spec §5.2) — read from the CRM through crm-api
   The till never shows a client's ABC class or lifecycle tag: the panel holds
   what a seller needs at the counter — who the client is, who looks after
   them in the CRM, what they bought here, notes and important dates.
   Without CRM access (no CRM rights for this passcode) only Walk-in is offered.
   "View in CRM ↗" opens ../crm/#<id>: the form the CRM page reads to open a
   card (crm/src/floor.js), relative so it works under the site's sub-path.
   ========================================================================= */
Object.assign(RU, {
  "Find client": "Найти клиента",
  "Change": "Изменить",
  "Find a client": "Найти клиента",
  "Name, phone or DLD-…": "Имя, телефон или DLD-…",
  "Type at least two characters.": "Введите хотя бы два символа.",
  "No client found for “{q}”.": "По запросу «{q}» клиентов нет.",
  "Loading the client…": "Загружаем клиента…",
  "Could not open this client: {e}": "Не удалось открыть клиента: {e}",
  "Owner": "Ответственный",
  "View in CRM ↗": "Открыть в базе ↗",
  "Opens the client's card in the Client Instrument": "Открывает карточку клиента в клиентской базе",
  "Last purchase {d}": "Последняя покупка {d}",
  "No purchases on file.": "Покупок нет.",
  "Purchases": "Покупки",
  "Opens the ticket": "Открывает чек",
  "Notes": "Заметки",
  "About the client": "О клиенте",
  "Important dates": "Важные даты",
  "Wedding anniversary": "Годовщина свадьбы",
  "Partner's birthday": "День рождения партнёра",
  "Child's birthday": "День рождения ребёнка",
  "Use this client": "Выбрать этого клиента",
  "+ New": "+ Новый",
  "Client on this sale: {n}": "Клиент продажи: {n}",
  "The ticket for this purchase is not in the till.": "Чека этой покупки в кассе нет.",
});
PL.purchase = { en: ["purchase", "purchases"], ru: ["покупка", "покупки", "покупок"] };
// addclient.js gives RU "Walk-in" its own CRM meaning ("how we met"), so the
// till's Walk-in button keeps its own wording here.
const walkInText = () => (LANG === "ru" ? "Без карты клиента" : "Walk-in");
// "2026-11-14" → "14.11.2026"
function fmtDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}
// A timestamp → its local day (the till's own clock: Tashkent), "15.11.2026".
function fmtStampDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return fmtDay(iso);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
}
const CLIENT_DATE_KINDS = { anniversary: "Wedding anniversary", partner_birthday: "Partner's birthday", child_birthday: "Child's birthday", other: "Other" };

/* -------------------------------------------------------- the slot on a sale */
function renderClientSlot(container) {
  const s = S.sale;
  const walk = el("button", { class: "btn", type: "button", id: "walk-in", "aria-pressed": s.walk_in ? "true" : "false",
    onclick: () => setWalkIn(!s.walk_in) }, walkInText());
  container.append(el("div", { class: "client-slot" },
    el("span", { class: "lbl", text: tr("Client") + ":" }),
    s.client_id ? el("span", { class: "client-chip", id: "client-chip" },
      el("b", { text: s.client_name || s.client_id }), s.client_name ? el("span", { class: "cid", text: " · " + s.client_id }) : null) : null,
    walk,
    S.crm ? el("button", { class: "btn", type: "button", id: "find-client", onclick: openClientPanel }, tr(s.client_id ? "Change" : "Find client"))
      : el("span", { class: "no-crm", text: tr("No CRM access — Walk-in only") })));
}
function setWalkIn(on) {
  const s = S.sale;
  s.walk_in = on;
  if (on) { s.client_id = null; s.client_name = null; }
  renderAll();
}
function useClient(id, name) {
  const s = S.sale;
  s.client_id = id; s.client_name = name || null; s.walk_in = false;
  closeClientPanel();
  renderAll();
  toast(tr("Client on this sale: {n}", { n: name || id }));
}

/* ------------------------------------------------------------- the panel */
let cpTimer = null;
function openClientPanel() {
  if (!S.crm) return;
  S.cp = { q: "", rows: null, busy: false, seq: 0, id: null, card: null, err: null, loading: false };
  renderClientPanel();
  const q = $("#client-q");
  if (q && !touchDevice()) q.focus();
}
function closeClientPanel() {
  clearTimeout(cpTimer);
  S.cp = null;
  const h = $("#client-panel");
  if (h) h.remove();
}
async function cpSearch(q) {
  const cp = S.cp;
  if (!cp) return;
  const seq = ++cp.seq;
  cp.busy = true;
  try {
    const r = await call("clients", { q, limit: 8 });
    if (!S.cp || seq !== S.cp.seq) return;
    cp.rows = r.rows || []; cp.err = null;
  } catch (e) {
    if (!S.cp || seq !== S.cp.seq) return;
    cp.rows = null; cp.err = e.message;
  }
  cp.busy = false;
  renderClientPanel();
}
async function cpOpen(id) {
  const cp = S.cp;
  if (!cp) return;
  cp.id = id; cp.card = null; cp.loading = true; cp.err = null;
  renderClientPanel();
  try {
    const card = await call("client", { id });
    if (!S.cp || S.cp.id !== id) return;
    cp.card = card;
  } catch (e) {
    if (!S.cp || S.cp.id !== id) return;
    cp.err = tr("Could not open this client: {e}", { e: e.message });
  }
  cp.loading = false;
  renderClientPanel();
}
async function openPurchaseTicket(line_id) {
  try {
    const r = await api("ticket_by_line", { line_id });
    closeClientPanel();
    go("#/ticket/" + encodeURIComponent(r.ticket_id));
  } catch (e) {
    if (e.status === 404) toast(tr("The ticket for this purchase is not in the till."));
    else if (e.status !== 401) toast(e.message);
  }
}
function clientCard(card) {
  const c = card.client || {}, roll = card.rollup || { lines: 0, net: 0 };
  const id = c.client_id, name = cardName(card) || tr("Unnamed record");
  const tx = card.transactions || [];
  const last = c.last_purchase_at || (tx[0] && tx[0].sold_at) || null;
  const canOpen = !!S.rights.view;
  const purchase = (t) => {
    const kids = [
      el("span", { class: "pu-date", text: fmtDay(t.sold_at) }),
      el("span", { class: "pu-item" }, [t.brand, (LANG === "ru" ? t.cat_name_ru : t.cat_name_en) || t.item].filter(Boolean).join(" · ")),
      el("span", { class: "pu-net money", text: fmtUZS(t.net_uzs) }),
    ];
    return t.ticket_line_id && canOpen
      ? el("button", { type: "button", class: "purchase link", title: tr("Opens the ticket"), onclick: () => openPurchaseTicket(t.ticket_line_id) }, kids)
      : el("div", { class: "purchase" }, kids);
  };
  const notes = (card.events || []).filter((e) => e.action === "note" && !blank(e.note));
  const about = card.personal && !blank(card.personal.about) ? card.personal.about : null;
  const dates = card.important_dates || [];
  return el("div", { class: "client-card", id: "client-card" },
    el("div", { class: "cc-head" },
      el("h4", { class: "cc-name" }, name, el("span", { class: "cid", text: " · " + id })),
      el("a", { class: "btn subtle cc-crm", href: "../crm/#" + encodeURIComponent(id), target: "_blank", rel: "noopener",
        title: tr("Opens the client's card in the Client Instrument"), text: tr("View in CRM ↗") })),
    el("div", { class: "cc-owner" }, el("span", { class: "k", text: tr("Owner") + ": " }), el("b", { text: blank(c.client_owner) ? "—" : who(c.client_owner) })),
    el("div", { class: "cc-facts" },
      el("span", {}, pl(roll.lines || 0, "purchase")),
      el("span", { class: "money" }, fmtUZS(roll.net || 0) + " " + tr("so'm")),
      last ? el("span", { text: tr("Last purchase {d}", { d: fmtDay(last) }) }) : null),
    el("div", { class: "cc-sec" }, el("h5", { text: tr("Purchases") }),
      tx.length ? el("div", { class: "purchases" }, tx.map(purchase)) : el("p", { class: "muted", text: tr("No purchases on file.") })),
    notes.length || about ? el("div", { class: "cc-sec" }, el("h5", { text: tr("Notes") }),
      about ? el("p", { class: "cc-note" }, el("b", { text: tr("About the client") + ". " }), about) : null,
      notes.map((e) => el("p", { class: "cc-note" }, el("span", { class: "when", text: fmtStampDay(e.at) + " · " + who(e.actor) + " — " }), e.note))) : null,
    dates.length ? el("div", { class: "cc-sec" }, el("h5", { text: tr("Important dates") }),
      el("ul", { class: "cc-dates" }, dates.map((d) => {
        const k = tr(CLIENT_DATE_KINDS[d.kind] || d.kind);
        const what = d.kind === "other" ? (d.label || k) : k + (blank(d.label) ? "" : " (" + d.label + ")");
        const when = String(d.day).padStart(2, "0") + "." + String(d.month).padStart(2, "0") + (d.year ? "." + d.year : "");
        return el("li", {}, el("span", { text: what }), el("span", { class: "money", text: when }));
      }))) : null);
}
function renderClientPanel() {
  const cp = S.cp;
  if (!cp) return;
  let host = $("#client-panel");
  const focused = $("#client-q") === document.activeElement;
  const pos = focused ? $("#client-q").selectionStart : null;
  if (!host) { host = el("div", { id: "client-panel", class: "modal-wrap" }); document.body.appendChild(host); }
  host.innerHTML = "";
  const q = el("input", { type: "search", id: "client-q", autocomplete: "off", spellcheck: "false", value: cp.q,
    placeholder: tr("Name, phone or DLD-…"), "aria-label": tr("Find a client"),
    oninput: (ev) => {
      cp.q = ev.target.value;
      clearTimeout(cpTimer);
      const t = cp.q.trim();
      if (t.length < 2) { cp.seq++; cp.rows = null; cp.busy = false; renderClientPanel(); return; }
      cpTimer = setTimeout(() => cpSearch(t), 300);
    } });
  let results = null;
  if (cp.rows) {
    results = cp.rows.length
      ? cp.rows.map((r) => el("button", { type: "button", class: "cl-row" + (r.client_id === cp.id ? " on" : ""), onclick: () => cpOpen(r.client_id) },
          el("span", { class: "cl-name", text: blank(r.display_name) ? tr("Unnamed record") : r.display_name }),
          el("span", { class: "cl-meta" }, [r.client_id, blank(r.client_owner) ? null : who(r.client_owner),
            r.last_purchase_at ? tr("Last purchase {d}", { d: fmtDay(r.last_purchase_at) }) : null].filter(Boolean).join(" · "))))
      : el("p", { class: "muted", text: tr("No client found for “{q}”.", { q: cp.q.trim() }) });
  } else if (cp.busy) results = el("p", { class: "muted", text: tr("Searching…") });
  const body = [];
  if (cp.err) body.push(el("p", { class: "form-err", role: "alert", text: cp.err }));
  if (cp.loading) body.push(el("p", { class: "muted", text: tr("Loading the client…") }));
  if (cp.card) body.push(clientCard(cp.card));
  const box = el("section", { class: "modal cpbox", role: "dialog", "aria-modal": "true", "aria-labelledby": "cp-title" },
    el("div", { class: "modal-head" },
      el("h3", { id: "cp-title", text: tr("Find a client") }),
      el("button", { class: "btn subtle close", type: "button", id: "client-close", "aria-label": tr("Close"), onclick: closeClientPanel, text: "×" })),
    el("div", { class: "modal-body" },
      el("div", { class: "cp-search" }, q),
      el("div", { id: "client-results", class: "cl-list" }, results),
      body),
    el("div", { class: "modal-foot" },
      cp.card ? el("button", { type: "button", class: "btn primary", id: "use-client",
        onclick: () => useClient(cp.card.client.client_id, cardName(cp.card)) }, tr("Use this client")) : null,
      el("button", { type: "button", class: "btn", id: "panel-walk-in", onclick: () => { closeClientPanel(); setWalkIn(true); } }, walkInText()),
      canAdd() ? el("button", { type: "button", class: "btn", id: "new-client", onclick: openAddClient }, tr("+ New")) : null));
  host.append(el("div", { class: "modal-scrim", onclick: closeClientPanel }), box);
  if (focused) { const n = $("#client-q"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.cp && !S.add && !$("#confirm-dialog")) { e.preventDefault(); closeClientPanel(); }
});
