/* ===========================================================================
   Part 4 — the floor (24 Oct 2026)
   * Client view: one tap turns the screen to the client. Stock counts, TBC,
     the quality marks, the owner's block and "report an error" go; photos,
     prices (unless the eye hides them), specifications and the story stay.
   * Report an error: from any model page, a field and a sentence. It lands in
     cat_reports; the catalogue owner reviews them at #/reports.
   * The idle lock: on an iPad or a phone the page asks for the passcode again
     after 15 minutes without use, even if it was closed in between.
   * No connection: the page says so, keeps the session, and catches up when
     the connection is back.
   * The back button closes whatever panel is open before it leaves the page.
   ========================================================================= */
Object.assign(RU, {
  "Show to a client": "Показать клиенту",
  "Leave client view": "Выйти из режима клиента",
  "Client view": "Режим клиента",
  "Stock counts, TBC and checks are hidden.": "Остатки, «уточняется» и пометки скрыты.",
  "Leave": "Выйти",
  "Report an error": "Сообщить об ошибке",
  "What is wrong?": "Что не так?",
  "Which detail": "Какое поле",
  "Something else": "Другое",
  "The photo": "Фото",
  "The price": "Цена",
  "Stock or sizes": "Наличие или размеры",
  "Say what you saw, e.g. “the ring is 52, not 54” or “this is rose gold”.": "Опишите, что вы увидели, например: «размер 52, а не 54» или «это розовое золото».",
  "Send": "Отправить",
  "Sending…": "Отправляем…",
  "Thank you — the report is in.": "Спасибо — замечание отправлено.",
  "Say what is wrong.": "Опишите, что не так.",
  "Cancel": "Отмена",
  "Error reports": "Замечания",
  "{n} open": "Открыто: {n}",
  "Open": "Открытые",
  "Fixed": "Исправлено",
  "Not an error": "Не ошибка",
  "Rejected": "Отклонённые",
  "Reopen": "Открыть снова",
  "No reports here.": "Замечаний нет.",
  "by {who}, {when}": "{who}, {when}",
  "closed by {who}": "закрыл(а): {who}",
  "Only the catalogue owner can see the reports.": "Замечания видит только владелец каталога.",
  "Locked after {n} minutes without use.": "Заблокировано после {n} минут бездействия.",
  "No connection": "Нет связи",
  "The catalogue needs the internet to show pieces. Your session is kept — it opens again as soon as the connection is back.":
    "Каталогу нужен интернет. Сеанс сохранён — каталог откроется, как только связь появится.",
  "Try again": "Повторить",
  "Model page": "Страница модели",
});
const IDLE_MIN = 15;
const IDLE_KEY = "cat_idle";
const CLIENT_KEY = "cat_client";

/* ---------------------------------------------------------- client view */
function clientButton() {
  return el("button", {
    class: "hbtn" + (S.client ? " on" : ""), type: "button", "aria-pressed": S.client ? "true" : "false",
    title: tr(S.client ? "Leave client view" : "Show to a client"), "aria-label": tr(S.client ? "Leave client view" : "Show to a client"),
    onclick: () => setClient(!S.client),
  }, [svg(["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"]), el("span", { class: "lbl-wide", text: tr(S.client ? "Client view" : "Show to a client") })]);
}
function setClient(on) {
  S.client = !!on;
  store(CLIENT_KEY, S.client ? "1" : null);
  closeAllLayers();
  render();
}
function clientBand() {
  if (!S.client || S.locked) return null;
  return el("div", { class: "client-band", role: "status" }, [
    el("span", {}, [el("b", { text: tr("Client view") }), " · ", tr("Stock counts, TBC and checks are hidden.")]),
    el("button", { class: "btn sm", type: "button", onclick: () => setClient(false), text: tr("Leave") }),
  ]);
}

/* ----------------------------------------------------- panels and history */
// Opening a panel adds one step to the history, so the iPad's back gesture
// closes the panel instead of leaving the page.
function layerOpened() {
  if (S.layerPushed) return;
  try { history.pushState({ catLayer: 1 }, "", location.href); S.layerPushed = true; } catch (e) { /* ignore */ }
}
function layerClosed(navHash) {
  if (S.layerPushed) {
    S.layerPushed = false;
    if (navHash) { try { history.replaceState(null, "", navHash); } catch (e) { /* ignore */ } route(); }
    else history.back();
  } else if (navHash) go(navHash);
}
function closeAllLayers() {
  S.sheet = null; S.report = null;
  const l = $("#layer"); if (l) l.innerHTML = "";
}
// The pinned header changes height (client band, phone, iPad); what sticks below it follows.
function syncSticky() {
  const h = document.querySelector("header.top");
  if (h) document.documentElement.style.setProperty("--top-h", h.offsetHeight + "px");
}
window.addEventListener("resize", syncSticky);
window.addEventListener("popstate", () => {
  if (!S.layerPushed) return;               // our own history.back(), or an ordinary step back
  S.layerPushed = false;
  closeAllLayers();
});

/* ------------------------------------------------------- report an error */
function reportButton() {
  if (S.client || !S.model || !S.model.data) return null;
  return el("button", { class: "btn report-btn", type: "button", onclick: openReport }, [svg(["M4 21V4h13l-2 4 2 4H4"]), tr("Report an error")]);
}
function openReport() {
  S.report = { field: "", message: "", sending: false, error: null };
  layerOpened();
  renderReport();
}
function closeReport() { S.report = null; $("#layer").innerHTML = ""; layerClosed(); }
function reportFields() {
  const { model: m, expected } = S.model.data;
  const keys = ["collection", "model_name", "gender"];
  for (const e of expected || []) if (ATTR[e.key] && ATTR[e.key].l && !keys.includes(e.key)) keys.push(e.key);
  const opts = keys.map((k) => [k, tr(ATTR[k].l)]);
  return [["", tr("Something else")], ["price", tr("The price")], ["stock", tr("Stock or sizes")], ["photo", tr("The photo")], ...opts,
    m.category === "jewellery" ? null : null].filter(Boolean);
}
function renderReport() {
  const R = S.report;
  const layer = $("#layer");
  layer.innerHTML = "";
  if (!R) return;
  const { model: m } = S.model.data;
  const v = S.model.data.variants.find((x) => x.variant_id === parseHash().params.get("v")) || S.model.data.variants.find((x) => x.in_stock) || S.model.data.variants[0];
  const select = el("select", { id: "rep-field", class: "field", onchange: (e) => { R.field = e.target.value; } },
    reportFields().map(([k, label]) => el("option", { value: k, selected: R.field === k ? "selected" : null, text: label })));
  const text = el("textarea", { id: "rep-msg", rows: "5", maxlength: "1000", placeholder: tr("Say what you saw, e.g. “the ring is 52, not 54” or “this is rose gold”."),
    oninput: (e) => { R.message = e.target.value; } });
  text.value = R.message;
  const err = el("div", { class: "err", role: "alert", style: R.error ? "" : "display:none", text: R.error || "" });
  const send = el("button", { class: "btn primary", type: "submit", disabled: R.sending ? "disabled" : null, text: tr(R.sending ? "Sending…" : "Send") });
  const form = el("form", { class: "sheet report", role: "dialog", "aria-modal": "true", "aria-label": tr("Report an error"), onsubmit: async (e) => {
    e.preventDefault();
    if (!R.message.trim()) { R.error = tr("Say what is wrong."); renderReport(); $("#rep-msg").focus(); return; }
    R.sending = true; R.error = null; renderReport();
    try {
      await call("report_create", { model_id: m.model_id, variant_id: v ? v.variant_id : null, field_key: R.field || null, message: R.message.trim() });
      closeReport();
      toast(tr("Thank you — the report is in."));
      if (S.ref && S.session && S.session.can_manage) S.ref.open_reports = (S.ref.open_reports || 0) + 1;
    } catch (ex) { if (S.report) { R.sending = false; R.error = ex.message; renderReport(); } }
  } }, [
    el("header", {}, [el("h2", { text: tr("Report an error") }), el("button", { class: "btn", type: "button", onclick: closeReport, text: tr("Close") })]),
    el("div", { class: "scroll" }, [
      el("p", { class: "page-sub", style: "margin:12px 0 4px", text: [m.brand, (S.model.data.variants.length > 1 ? v.variant_id : m.article)].join(" · ") }),
      el("label", { class: "grp", for: "rep-field" }, [el("div", { class: "lbl", text: tr("Which detail") }), select]),
      el("label", { class: "grp", for: "rep-msg" }, [el("div", { class: "lbl", text: tr("What is wrong?") }), text]),
      err,
    ]),
    el("footer", {}, [el("button", { class: "btn", type: "button", onclick: closeReport, text: tr("Cancel") }), send]),
  ]);
  layer.append(el("div", { class: "sheet-scrim", onclick: closeReport }), form);
  if (!R.sending && !R.error) setTimeout(() => { const t = $("#rep-msg"); if (t && document.activeElement !== t) t.focus(); }, 60);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.report && !S.report.sending) closeReport(); });

/* ----------------------------------------------------- the owner's review */
async function loadReports(status) {
  S.reports = { status, rows: null };
  render();
  try { const d = await call("reports_list", { status }); if (S.reports && S.reports.status === status) S.reports.rows = d.rows; }
  catch (e) { if (S.reports) S.reports.error = e.message; }
  render();
}
function renderReports() {
  const R = S.reports || { status: "open", rows: null };
  const tabs = el("div", { class: "seg", role: "group", "aria-label": tr("Error reports") }, [["open", "Open"], ["fixed", "Fixed"], ["rejected", "Rejected"]].map(([k, l]) =>
    el("a", { class: "segbtn", href: "#/reports?status=" + k, "aria-pressed": R.status === k ? "true" : "false", text: tr(l) })));
  const out = [...pageHead(tr("Error reports"), null), tabs];
  if (R.error) { out.push(el("div", { class: "empty" }, [el("div", { class: "serif", text: R.error })])); return out; }
  if (!R.rows) { out.push(el("div", { class: "skel", style: "height:160px;margin-top:16px" })); return out; }
  if (!R.rows.length) { out.push(el("div", { class: "empty" }, [el("div", { class: "serif", text: tr("No reports here.") })])); return out; }
  const act = async (id, status) => {
    try {
      await call("report_close", { id, status });
      if (S.ref) S.ref.open_reports = Math.max(0, (S.ref.open_reports || 0) + (status === "open" ? 1 : -1));
      loadReports(R.status);
    } catch (e) { toast(e.message); }
  };
  out.push(el("div", { class: "reports" }, R.rows.map((r) => {
    const m = r.model || {};
    const field = r.field_key ? (ATTR[r.field_key] && ATTR[r.field_key].l ? tr(ATTR[r.field_key].l) : { price: tr("The price"), stock: tr("Stock or sizes"), photo: tr("The photo") }[r.field_key] || r.field_key) : tr("Something else");
    const when = new Date(r.created_at).toLocaleString(LOC(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return el("article", { class: "panel rep" }, [
      el("div", { class: "rep-h" }, [
        el("a", { href: "#/model/" + encodeURIComponent(r.model_id) + (r.variant_id ? "?v=" + encodeURIComponent(r.variant_id) : ""), class: "rep-model" },
          [el("span", { class: "brandname", text: m.brand || "" }), " ", m.model_name || m.collection || r.model_id, el("span", { class: "ref", text: " · " + (r.variant_id || r.model_id) })]),
        el("span", { class: "chip static", text: field }),
      ]),
      el("p", { class: "rep-msg", text: r.message }),
      el("div", { class: "rep-f" }, [
        el("span", { class: "muted", text: tr("by {who}, {when}", { who: r.reported_by, when }) + (r.closed_by ? " · " + tr("closed by {who}", { who: r.closed_by }) : "") }),
        el("span", { class: "spacer" }),
        R.status === "open"
          ? el("span", { class: "rep-actions" }, [el("button", { class: "btn sm", type: "button", onclick: () => act(r.id, "rejected"), text: tr("Not an error") }),
              el("button", { class: "btn sm primary", type: "button", onclick: () => act(r.id, "fixed"), text: tr("Fixed") })])
          : el("button", { class: "btn sm", type: "button", onclick: () => act(r.id, "open"), text: tr("Reopen") }),
      ]),
    ]);
  })));
  return out;
}
function reportsLink() {
  const ref = S.ref;
  if (!ref || !ref.can_manage || S.client) return null;
  return el("a", { class: "chip reports-link", href: "#/reports" }, [tr("Error reports"), el("span", { class: "cnt", text: tr("{n} open", { n: ref.open_reports || 0 }) })]);
}

/* -------------------------------------------------------------- idle lock */
const idleApplies = () => window.matchMedia("(pointer: coarse)").matches;
let idleWritten = 0;
function activeNow() {
  if (S.locked || !idleApplies()) return;
  const now = Date.now();
  S.lastActive = now;
  if (now - idleWritten > 15000) { idleWritten = now; store(IDLE_KEY, String(now)); }
}
function idleExpired() {
  if (!idleApplies()) return false;
  const last = Math.max(S.lastActive || 0, Number(store(IDLE_KEY)) || 0);
  return last > 0 && Date.now() - last > IDLE_MIN * 60000;
}
function checkIdle() {
  if (S.locked || !idleApplies()) return;
  if (idleExpired()) { store(IDLE_KEY, null); lockDown(tr("Locked after {n} minutes without use.", { n: IDLE_MIN })); }
}
for (const ev of ["pointerdown", "keydown", "touchstart", "scroll"]) window.addEventListener(ev, activeNow, { passive: true });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkIdle(); });
setInterval(checkIdle, 20000);

/* ---------------------------------------------------------- no connection */
function renderOffline() {
  return [el("div", { class: "empty offline" }, [
    el("img", { class: "mono", src: mono(), alt: "", style: "width:42px;opacity:.6;margin-bottom:12px" }),
    el("div", { class: "serif", text: tr("No connection") }),
    el("p", { text: tr("The catalogue needs the internet to show pieces. Your session is kept — it opens again as soon as the connection is back.") }),
    el("button", { class: "btn primary", type: "button", onclick: retryBoot, text: tr("Try again") }),
  ])];
}
async function retryBoot() {
  if (!S.offlineBoot) return;
  try { await loadRef(); S.offlineBoot = false; S.locked = false; activeNow(); route(); }
  catch (e) { if (e.status) { S.offlineBoot = false; render(); } else toast(e.message); }
}
window.addEventListener("online", () => { if (S.offlineBoot) retryBoot(); });
function retryButton() {
  return el("button", { class: "btn", type: "button", onclick: () => { S.list = null; S.model = null; route(); }, text: tr("Try again") });
}
