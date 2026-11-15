/* ===========================================================================
   Delardi Sales — the till (POS, spec 2026-11-15)
   There is deliberately NO database key in this file. Every read and every
   write goes through the sales-api edge function, which needs a session token
   issued only in exchange for a personal passcode, and only to someone who has
   been given Sales rights. Until a passcode is accepted the page holds nothing.

   Globals other modules build on: S, api(), tr() with RU, el(), toast(),
   go(), ROUTES, modal(), confirmBox(), fmtUZS(), lineNet(), saleTotal().
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/sales-api";
const LOGO_WORDMARK = "__WORDMARK__";
const LOGO_MONO = "__MONO_NAVY__";
const SESSION_KEY = "sales_session";      // sessionStorage: gone when the tab closes
const ACTIVE_KEY = "sales_last_active";   // sessionStorage: last touch, for the idle lock
const THEME_KEY = "board_theme";          // shared with the other Delardi tools
const LANG_KEY = "delardi_lang";          // shared with the landing page
const IDLE_MIN = 15;                      // touch devices only (global constraints)
const MAX_DISCOUNT = 99.9999;             // ops_ticket_lines.discount_pct is numeric(6,4)
const MAX_LINES = 50;
const MAX_PAYMENTS = 10;

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  // shell, gate
  "Sales": "Продажи",
  "Delardi till": "Касса Delardi",
  "All tools": "Все инструменты",
  "All Delardi tools": "Все инструменты Delardi",
  "Language": "Язык",
  "Switch between light and dark": "Переключить светлую и тёмную тему",
  "Lock": "Заблокировать",
  "Locked.": "Заблокировано.",
  "New sale": "Новая продажа",
  "Tickets": "Чеки",
  "Admin": "Управление",
  "Unlock": "Вход",
  "Enter your personal passcode to open the till.": "Введите свой личный код доступа, чтобы открыть кассу.",
  "Your passcode": "Ваш код доступа",
  "Open the till": "Открыть кассу",
  "Checking…": "Проверяем…",
  "Enter your passcode.": "Введите код доступа.",
  "The sale in progress is kept: {n}.": "Текущая продажа сохранена: {n}.",
  "Nothing behind this card is real until your passcode is accepted. A CRM or board passcode opens the till only if you have been given Sales rights.":
    "За этой карточкой нет данных, пока код не принят. Код от CRM или доски открывает кассу, только если вам даны права на продажи.",
  "Locked after {n} minutes without use.": "Заблокировано после {n} минут без действий.",
  "Welcome, {name}": "Здравствуйте, {name}!",
  "TRAINING": "ОБУЧЕНИЕ",
  "practice mode: nothing posted here is a real sale": "тренировочный режим: продажи здесь не настоящие",
  "Loading the till…": "Загружаем кассу…",
  // server messages
  "That passcode is not right.": "Неверный код доступа.",
  "This account does not have access to Sales.": "У этой учётной записи нет доступа к продажам.",
  "Enter your passcode to open the till.": "Введите код доступа, чтобы открыть кассу.",
  "That session is not valid. Enter your passcode again.": "Сеанс недействителен. Введите код доступа ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сеанс истёк. Введите код доступа ещё раз.",
  "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "Your account cannot look up sales.": "Ваша учётная запись не может просматривать продажи.",
  "Your account cannot make sales.": "Ваша учётная запись не может проводить продажи.",
  "Your account cannot void sales.": "Ваша учётная запись не может аннулировать продажи.",
  "Your account cannot manage the till.": "Ваша учётная запись не может управлять кассой.",
  "Your account cannot attach clients — use Walk-in.": "Ваша учётная запись не может указывать клиента — выберите «Без карты клиента».",
  "the till was switched to live — reload": "Касса переключена в рабочий режим — страница обновлена, проверьте продажу.",
  "the till was switched to training — reload": "Касса переключена в режим обучения — страница обновлена, проверьте продажу.",
  "Reload the page: it did not say which mode it shows.": "Обновите страницу: она не сообщила, в каком режиме работает.",
  "No sale with that reference.": "Продажи с таким номером нет.",
  "Add at least one piece.": "Добавьте хотя бы одно изделие.",
  "Something went wrong on the server.": "Ошибка на сервере.",
  "No connection. Check the Wi-Fi and try again.": "Нет связи. Проверьте Wi-Fi и попробуйте ещё раз.",
  "Request failed ({n})": "Ошибка запроса ({n})",
  // client slot (client.js)
  "Client": "Клиент",
  "Walk-in": "Без карты клиента",
  // dialogs
  "Yes": "Да",
  "Cancel": "Отмена",
  "Close": "Закрыть",
};
// Counted nouns: English one/many; Russian one/few/many.
const PL = {
  piece: { en: ["piece", "pieces"], ru: ["изделие", "изделия", "изделий"] },
  line: { en: ["line", "lines"], ru: ["строка", "строки", "строк"] },
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
  if (S.locked) renderGate();
}

/* -------------------------------------------------------------------- state */
function newSale() {
  return { draft_id: null, client_id: null, client_name: null, walk_in: false, seller: "", lines: [], payments: [], fiscal_ref: "" };
}
const S = {
  token: null, name: null, expires_at: null, rights: { view: false, post: false, void: false, manage: false, crm: false },
  mode: null, ref: null,             // ref: the `reference` answer (sellers, cash notice, address)
  locked: true, gateMessage: null,
  sale: newSale(),
  lastPct: null,                     // the discount % last typed on any line
  lastPosted: null,                  // the `post` answer, for the receipt if the ticket cannot be read
  search: { q: "", pieces: null, open: false, busy: false },
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
// Whole so'm, grouped by thousands with a plain space — as the receipt prints them.
function fmtUZS(n) {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
  const x = Math.round(Number(n));
  return (x < 0 ? "-" : "") + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// Typed text → whole so'm. Grouping by spaces, no-break spaces, dots or commas is
// fine ("31 500 000", "31.500.000"); a trailing decimal part (".00", ",5") is
// dropped, since amounts are whole so'm; a minus sign makes it invalid.
// → { value: number | null (empty), invalid: boolean }
function readAmount(s) {
  const t = String(s === null || s === undefined ? "" : s).trim();
  if (!t) return { value: null, invalid: false };
  if (/[-−–]/.test(t)) return { value: null, invalid: true };
  const d = t.replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!d) return { value: null, invalid: true };
  return { value: Number(d.length > 14 ? d.slice(0, 14) : d), invalid: false };   // numeric(14,0)
}
// The amount, or null when empty or invalid.
function parseAmount(s) { const r = readAmount(s); return r.invalid ? null : r.value; }
// A field whose text was not accepted is marked (red border, aria-invalid).
function markInvalid(input, bad) {
  if (!input) return;
  if (bad) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(LANG === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
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

/* ------------------------------------------------------------------- money
   Line net = round(price × (1 − discount/100)), half away from zero, whole
   so'm — exactly as the database rounds numeric. Worked in integers: the
   discount has at most four decimals (numeric(6,4)), so it is a whole number
   of millionths of the price; BigInt keeps 14-digit prices exact. */
function pctMillionths(pct) {
  const p = Math.min(Math.max(Number(pct) || 0, 0), MAX_DISCOUNT);
  return BigInt(Math.round(p * 10000));                    // ten-thousandths of a percent
}
function lineNet(line) {
  if (line.price_uzs === null || line.price_uzs === undefined) return null;
  const num = BigInt(Math.round(line.price_uzs)) * (1000000n - pctMillionths(line.discount_pct));
  const neg = num < 0n, a = neg ? -num : num;
  let q = a / 1000000n;
  if ((a % 1000000n) * 2n >= 1000000n) q += 1n;           // half away from zero
  return Number(neg ? -q : q);
}
function saleTotal(sale) {
  return (sale || S.sale).lines.reduce((t, l) => t + (lineNet(l) || 0), 0);
}
function paidTotal(sale) {
  return (sale || S.sale).payments.reduce((t, p) => t + (p.amount || 0), 0);
}

/* --------------------------------------------------------------------- api */
async function api(action, body) {
  const payload = Object.assign({ action }, body || {});
  if (S.token && action !== "unlock") payload.token = S.token;
  let res;
  try {
    res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) {
    const err = new Error(tr("No connection. Check the Wi-Fi and try again."));
    err.status = 0;
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    // A lost session locks the page; the sale on screen is kept.
    if (res.status === 401 && action !== "unlock") lockDown(data.error);
    // The till was switched on another device: show the mode it is in now, and read the settings again.
    const sw = res.status === 409 && /^the till was switched to (training|live) — reload$/.exec(data.error || "");
    if (sw) {
      syncMode(sw[1]);
      try { await loadReference(); } catch (e) { /* the message still shows */ }
    }
    const err = new Error(data.error ? tr(data.error) : tr("Request failed ({n})", { n: res.status }));
    err.status = res.status;
    err.raw = data.error || "";            // the server's sentence as sent, before any translation
    throw err;
  }
  if (data && (data.mode === "training" || data.mode === "live")) syncMode(data.mode);
  return data;
}
// Every answer that says which mode the till is in keeps the page (and the TRAINING banner) in step.
function syncMode(mode) {
  if (S.mode === mode) return;
  S.mode = mode;
  if (S.locked) return;
  if (route().name === "admin") { renderAll(); return; }
  const h = document.querySelector("#app > header.top");
  if (h) h.replaceWith(renderHeader());
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
    el("section", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": id + "-title" },
      el("div", { class: "modal-head" },
        el("h3", { id: id + "-title", text: title }),
        el("button", { class: "btn subtle close", type: "button", id: id + "-close", "aria-label": tr("Close"), onclick: close, text: "×" })),
      el("div", { class: "modal-body" }, body),
      foot ? el("div", { class: "modal-foot" }, foot) : null));
  document.body.appendChild(host);
  return { host, close };
}
function confirmBox({ title, body, ok, danger }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const m = modal("confirm-dialog", title, [].concat(body).map((t) => typeof t === "string" ? el("p", { text: t }) : t), [
      el("button", { type: "button", class: "btn " + (danger ? "danger" : "primary"), id: "confirm-ok", onclick: () => finish(true) }, ok || tr("Yes")),
      el("button", { type: "button", class: "btn subtle", id: "confirm-cancel", onclick: () => finish(false) }, tr("Cancel")),
    ], "confirm");
    // closing it any other way (×, the scrim) is a no
    new MutationObserver((_, obs) => { if (!m.host.isConnected) { obs.disconnect(); finish(false); } })
      .observe(document.body, { childList: true });
    setTimeout(() => { const b = $("#confirm-cancel"); if (b && !touchDevice()) b.focus(); }, 30);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#confirm-dialog")) { e.preventDefault(); e.stopImmediatePropagation(); $("#confirm-cancel").click(); }
}, true);

/* ------------------------------------------------------------------ routes
   #/sale  #/pay  #/receipt/<ticket_id>  #/tickets  #/ticket/<ticket_id>  #/admin
   Each name maps to a function (main, arg) that fills <main>. */
const ROUTES = {
  sale: (main) => renderSale(main),
  pay: (main) => renderPay(main),
  receipt: (main, id) => renderReceipt(main, id),
  tickets: (main) => renderTickets(main),          // tickets.js
  ticket: (main, id) => renderTicket(main, id),     // tickets.js
  admin: (main) => renderAdmin(main),               // admin.js
};
function route() {
  const m = /^#\/([a-z]+)(?:\/([^/?#]+))?/.exec(location.hash || "");
  if (!m || !ROUTES[m[1]]) return { name: "sale", arg: null };
  return { name: m[1], arg: m[2] ? decodeURIComponent(m[2]) : null };
}
function go(r) {
  const h = r.startsWith("#") ? r : "#" + (r.startsWith("/") ? r : "/" + r);
  if (location.hash === h) renderAll(); else location.hash = h;
}
window.addEventListener("hashchange", () => { if (!S.locked) renderAll(); });

/* ------------------------------------------------------------- the client
   renderClientSlot(container) — the client on a sale — is client.js's. */

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
// The half-disc theme icon the other tools use (markup, no namespace URL).
const THEME_ICON = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M8 1.5a6.5 6.5 0 0 0 0 13z" fill="currentColor"></path></svg>';
function renderHeader() {
  const r = route().name;
  const tab = (name, href, label, show) => show ? el("a", { class: "view-tab", href,
    "aria-current": (r === name || (name === "sale" && (r === "pay" || r === "receipt")) || (name === "tickets" && r === "ticket")) ? "page" : null,
    text: tr(label) }) : null;
  return el("header", { class: "top" },
    el("div", { class: "top-row" },
      el("div", { class: "brand" },
        el("a", { class: "home", href: "../", title: tr("All Delardi tools") },
          el("img", { class: "mark", src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })),
        el("span", { class: "rule", "aria-hidden": "true" }),
        el("div", {}, el("div", { class: "title", text: tr("Sales") }), el("div", { class: "sub", text: tr("Delardi till") }))),
      el("div", { class: "spacer" }),
      langSwitch(),
      el("button", { class: "btn subtle", type: "button", "aria-label": tr("Switch between light and dark"),
        title: tr("Switch between light and dark"), onclick: toggleTheme, html: THEME_ICON }),
      S.token ? el("span", { class: "lock-state" },
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("span", { class: "who hide-sm", text: S.name }),
        el("button", { class: "btn subtle", type: "button", onclick: lockNow, text: tr("Lock") })) : null),
    el("nav", { class: "views", "aria-label": tr("Sales") },
      tab("sale", "#/sale", "New sale", S.rights.post),
      tab("tickets", "#/tickets", "Tickets", S.rights.view),
      tab("admin", "#/admin", "Admin", S.rights.manage)),
    S.mode === "training" ? el("div", { class: "training-band", role: "note" },
      el("b", { text: tr("TRAINING") }), el("span", { text: "— " + tr("practice mode: nothing posted here is a real sale") })) : null);
}

/* -------------------------------------------------------------------- gate */
function renderGate() {
  const old = $("#gate");
  if (old) old.remove();
  if (!S.locked) return;
  const pass = el("input", { type: "password", id: "gate-pass", autocomplete: "current-password" });
  const msg = S.gateMessage;
  const err = el("p", { class: "err", role: "alert", hidden: msg ? null : true, text: msg ? tr(msg) : "" });
  const btn = el("button", { class: "btn primary", type: "submit", text: tr("Open the till") });
  const n = S.sale.lines.length;
  const submit = async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    if (!pass.value.trim()) { err.textContent = tr("Enter your passcode."); err.hidden = false; return; }
    btn.disabled = true; btn.textContent = tr("Checking…");
    try {
      const r = await api("unlock", { passcode: pass.value });
      S.token = r.token; S.name = r.name; S.expires_at = r.expires_at; S.rights = r.rights;
      sstore(SESSION_KEY, JSON.stringify({ token: r.token, name: r.name, expires_at: r.expires_at, rights: r.rights }));
      // The client panel reads the CRM with a CRM session of its own: the same
      // passcode, sent to crm-api. Without CRM rights the till is Walk-in only.
      await crmUnlock(pass.value);
      await loadReference();
      loadDrafts();
      S.locked = false; S.gateMessage = null;
      activeNow();
      renderAll();
      renderGate();
      toast(tr("Welcome, {name}", { name: r.name }));
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      btn.disabled = false; btn.textContent = tr("Open the till");
      pass.value = ""; pass.focus();
    }
  };
  const card = el("form", { class: "gate-card", onsubmit: submit },
    el("div", { class: "gate-mast" },
      el("img", { src: LOGO_WORDMARK, alt: "Delardi" }),
      el("div", { class: "gate-tools" }, langSwitch())),
    el("h2", { text: tr("Sales") }),
    el("p", { class: "lead", text: tr("Enter your personal passcode to open the till.") }),
    n ? el("p", { class: "kept", text: tr("The sale in progress is kept: {n}.", { n: pl(n, "piece") }) }) : null,
    err,
    el("label", { for: "gate-pass" }, el("span", { text: tr("Your passcode") }), pass),
    btn,
    el("p", { class: "gate-foot", text: tr("Nothing behind this card is real until your passcode is accepted. A CRM or board passcode opens the till only if you have been given Sales rights.") }));
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, card));
  const app = $("#app");
  app.classList.add("gated");
  app.setAttribute("aria-hidden", "true");
  setTimeout(() => pass.focus(), 60);
}
// Drop the token and ask for the passcode again. The sale on screen stays.
function lockDown(message) {
  S.token = null;
  crmDrop();
  sstore(SESSION_KEY, null);
  sstore(ACTIVE_KEY, null);
  S.locked = true;
  S.gateMessage = message || null;
  S.search.open = false;
  renderGate();
}
function lockNow() { lockDown(); toast(tr("Locked.")); }

/* --------------------------------------------------------------- idle lock
   Touch devices only: an iPad left on the counter for 15 minutes asks for the
   passcode again. The sale on screen is kept. */
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

/* ------------------------------------------------------------------- theme */
function applyTheme() {
  let mode;
  try { mode = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { mode = "auto"; }
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("sysdark", mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function toggleTheme() {
  let mode;
  try { mode = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { mode = "auto"; }
  const next = mode === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark")
    : mode === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  applyTheme();
}

async function loadReference() {
  const r = await api("reference");
  // the owner list for the add-client form comes from crm-api's reference
  S.ref = Object.assign(r, crmRefFields()); S.rights = r.rights || S.rights; syncMode(r.mode);
}

/* -------------------------------------------------------------------- init */
function renderAll() {
  const app = $("#app");
  document.documentElement.lang = LANG;
  document.title = "Delardi " + tr("Sales");
  if (S.locked && !S.ref) return;                  // nothing behind the gate before a passcode
  const r = route();
  app.innerHTML = "";
  if (!S.locked) { app.classList.remove("gated"); app.setAttribute("aria-hidden", "false"); }
  const main = el("main", { id: "main" });
  app.append(renderHeader(), main);
  ROUTES[r.name](main, r.arg);
}
function restoreSession() {
  try {
    const s = JSON.parse(sstore(SESSION_KEY) || "null");
    if (!s || !s.token || new Date(s.expires_at).getTime() <= Date.now()) return false;
    const last = Number(sstore(ACTIVE_KEY) || 0);
    if (touchDevice() && last && Date.now() - last >= IDLE_MIN * 60000) { sstore(SESSION_KEY, null); return false; }
    S.token = s.token; S.name = s.name; S.expires_at = s.expires_at; S.rights = s.rights || S.rights;
    crmRestore();
    return true;
  } catch (e) { return false; }
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

(async function boot() {
  applyTheme();
  document.documentElement.lang = LANG;
  if (restoreSession()) {
    try { await loadReference(); S.locked = false; activeNow(); loadDrafts(); }
    catch (e) { if (e.status !== 401) { S.token = null; sstore(SESSION_KEY, null); } }
  }
  if (S.locked) $("#app").innerHTML = "";          // nothing behind the gate
  renderAll();
  renderGate();
})();
