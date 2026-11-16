/* ===========================================================================
   Delardi Stock — every piece, its state and its history (spec 2026-11-16)
   There is deliberately NO database key in this file. Every read and every
   write goes through the stock-api edge function (stock/src/api/README.md),
   which needs a session token issued only in exchange for a personal passcode,
   and only to someone who has been given the view-stock right. Until a
   passcode is accepted the page holds nothing.

   Globals other modules build on: S, api(), tr() with RU, el(), toast(),
   go(), ROUTES, modal(), confirmBox(), fmtDate(), fmtUZS(), fmtMoney(),
   STATE_WORDS, stateTag(), openPiece(). Patterns copied from sales/src/app.js
   (no tool imports another's code).
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/stock-api";
const LOGO_WORDMARK = "__WORDMARK__";
const SESSION_KEY = "stock_session";      // sessionStorage: gone when the tab closes
const ACTIVE_KEY = "stock_last_active";   // sessionStorage: last touch, for the idle lock
const LANG_KEY = "delardi_lang";          // shared with the landing page
const IDLE_MIN = 15;                      // touch devices only, as the till

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  // shell, gate
  "Stock": "Склад",
  "All tools": "Все инструменты",
  "Language": "Язык",
  "Lock": "Заблокировать",
  "Locked.": "Заблокировано.",
  "Pieces": "Изделия",
  "Review": "Проверка",
  "Unlock": "Открыть",
  "Boutique tools": "Инструменты бутика",
  "Passcode": "Код доступа",
  "Opens Stock": "Открывает склад",
  "Checking…": "Проверяем…",
  "Enter your passcode.": "Введите код доступа.",
  "Locked after {n} minutes without use.": "Заблокировано после {n} минут без действий.",
  "Welcome, {name}": "Здравствуйте, {name}!",
  "Loading…": "Загружаем…",
  // server messages (stock/src/api/README.md)
  "That passcode is not right.": "Неверный код доступа.",
  "This account does not have access to Stock.": "У этой учётной записи нет доступа к складу.",
  "Your account cannot look up stock.": "Ваша учётная запись не может просматривать склад.",
  "Your account cannot change stock.": "Ваша учётная запись не может менять склад.",
  "Enter your passcode to open Stock.": "Введите код доступа, чтобы открыть склад.",
  "That session is not valid. Enter your passcode again.": "Сеанс недействителен. Введите код доступа ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сеанс истёк. Введите код доступа ещё раз.",
  "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "No piece with that reference.": "Изделия с таким номером нет.",
  "No client with that reference.": "Клиента с таким номером нет.",
  "Write who has it and why.": "Напишите, у кого изделие и зачем.",
  "Write what is wrong.": "Напишите, что не так.",
  "Something went wrong on the server.": "Ошибка на сервере.",
  "No connection. Check the Wi-Fi and try again.": "Нет связи. Проверьте Wi-Fi и попробуйте ещё раз.",
  "The server did not answer. Try again.": "Сервер не ответил. Попробуйте ещё раз.",
  "Request failed ({n})": "Ошибка запроса ({n})",
  // money
  "so'm": "сум",
  // dialogs
  "Yes": "Да",
  "Cancel": "Отмена",
  "Close": "Закрыть",
  // review placeholder (used only if review.js is not built in)
  "Open review items come here.": "Здесь будут открытые вопросы на проверку.",
};
// Counted nouns: English one/many; Russian one/few/many.
const PL = {
  piece: { en: ["piece", "pieces"], ru: ["изделие", "изделия", "изделий"] },
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

/* ------------------------------------------------------------------ states
   The seven piece states, their words and their tags (G1). */
const STATE_ORDER = ["in_stock", "reserved", "booked_out", "in_transit", "damaged", "not_received", "sold"];
const STATE_WORDS = {
  in_stock: { en: "In stock", ru: "В наличии" },
  reserved: { en: "Reserved", ru: "Резерв" },
  booked_out: { en: "Booked out", ru: "Выдано" },
  in_transit: { en: "In transit", ru: "В пути" },
  damaged: { en: "Damaged", ru: "Повреждено" },
  not_received: { en: "Not received", ru: "Не получено" },
  sold: { en: "Sold", ru: "Продано" },
};
const STATE_TAG = { in_stock: "act", reserved: "line", booked_out: "line", in_transit: "info", damaged: "alert", not_received: "alert", sold: "done" };
function stateWord(state) {
  const w = STATE_WORDS[state];
  return w ? w[LANG === "ru" ? "ru" : "en"] : String(state || "—");
}
function stateTag(state) {
  return el("span", { class: "tag " + (STATE_TAG[state] || "line"), text: stateWord(state) });
}

/* -------------------------------------------------------------------- state
   Filters live here and nowhere else (not in the URL, not in storage). */
const S = {
  token: null, name: null, expires_at: null, rights: { view: false, manage: false, crm: false },
  locked: true, gateMessage: null,
  facets: null,                      // { brands, categories }
  filters: { q: "", state: "", brand: "", category: "", price_min: null, price_max: null },
  page: 1,
  list: null, listBusy: false, listError: null,
  priceTimers: {},                   // pending price-input debounces, cleared by lockDown
  pc: null,                          // the open piece panel (piece.js)
  pieceId: null,                     // the piece last opened (openPiece)
  rv: null,                          // the review queue (review.js): { items, ans, errs, err }
  reviewCount: null,                 // open reviews, for the tab label
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
// Whole so'm, grouped by thousands with a plain space.
function fmtUZS(n) {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
  const x = Math.round(Number(n));
  return (x < 0 ? "-" : "") + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// "31 500 000 so'm" / "31 500 000 сум"
function fmtMoney(n) {
  const s = fmtUZS(n);
  return s === "—" ? s : s + " " + tr("so'm");
}
// Typed text → whole so'm. Grouping by spaces, dots or commas is fine; a trailing
// decimal part is dropped; a minus sign or letters make it invalid.
// → { value: number | null (empty), invalid: boolean }
function readAmount(s) {
  const t = String(s === null || s === undefined ? "" : s).trim();
  if (!t) return { value: null, invalid: false };
  if (/[-−–]/.test(t) || /[^\d\s.,  ]/.test(t)) return { value: null, invalid: true };
  const d = t.replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!d || d.length > 15) return { value: null, invalid: true };
  return { value: Number(d), invalid: false };
}
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
    // A lost session locks the page; the filters on screen are kept.
    if (res.status === 401 && action !== "unlock") lockDown(data.error);
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

/* ------------------------------------------------------------------ routes
   #/pieces (default)  #/review
   Each name maps to a function (main, arg) that fills <main>. */
const ROUTES = {
  pieces: (main) => renderList(main),                                      // list.js
  review: (main) => (typeof renderReview === "function" ? renderReview(main) : renderReviewPlaceholder(main)),   // review.js (Task 5)
};
function route() {
  const m = /^#\/([a-z]+)(?:\/([^/?#]+))?/.exec(location.hash || "");
  if (!m || !ROUTES[m[1]]) return { name: "pieces", arg: null };
  return { name: m[1], arg: m[2] ? decodeURIComponent(m[2]) : null };
}
function go(r) {
  const h = r.startsWith("#") ? r : "#" + (r.startsWith("/") ? r : "/" + r);
  if (location.hash === h) renderAll(); else location.hash = h;
}
window.addEventListener("hashchange", () => { if (!S.locked) renderAll(); });

function renderReviewPlaceholder(main) {
  main.append(el("section", { class: "screen", id: "screen-review" },
    el("div", { class: "screen-head" }, el("h1", { class: "title", text: tr("Review") })),
    el("p", { class: "notice", text: tr("Open review items come here.") })));
}

/* ------------------------------------------------------------- the piece
   openPiece(id) opens the piece panel. piece.js (Task 4) defines
   showPiece(id); until then this records which piece was asked for. */
function openPiece(id) {
  S.pieceId = id;
  if (typeof showPiece === "function") showPiece(id);
}

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "kit-lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", class: "kit-hbtn", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
// The kit header (ui/kit.css): wordmark to the landing page, rule, the tool's name, then
// the Tools switcher (ui/tools.js), EN/RU, who is signed in and Lock. Tabs sit under it.
function renderHeader() {
  const r = route().name;
  const tab = (name, label, n) => el("a", { class: "kit-tab", href: "#/" + name, id: "tab-" + name,
    "aria-current": r === name ? "page" : null, text: tr(label) + (n > 0 ? " (" + n + ")" : "") });
  return el("header", { class: "top" },
    el("div", { class: "kit-head" },
      kitGuardLink(el("a", { class: "kit-brand", href: "../" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") }))),
      el("span", { class: "kit-rule", "aria-hidden": "true" }),
      el("span", { class: "kit-tool", text: tr("Stock") }),
      el("span", { class: "kit-spacer" }),
      kitToolsMenu("stock", LANG),
      langSwitch(),
      S.token ? el("span", { class: "kit-staff hide-sm", title: S.name, text: S.name }) : null,
      S.token ? el("button", { class: "kit-hbtn", type: "button", onclick: lockNow, text: tr("Lock") }) : null),
    el("nav", { class: "kit-tabs", "aria-label": tr("Stock") },
      tab("pieces", "Pieces"),
      tab("review", "Review", S.reviewCount)));
}

/* -------------------------------------------------------------------- gate */
function renderGate() {
  const old = $("#gate");
  if (old) old.remove();
  if (!S.locked) return;
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
      S.token = r.token; S.name = r.name; S.expires_at = r.expires_at; S.rights = r.rights;
      sstore(SESSION_KEY, JSON.stringify({ token: r.token, name: r.name, expires_at: r.expires_at, rights: r.rights }));
      S.locked = false; S.gateMessage = null;
      activeNow();
      await loadFacets();
      loadReviews();                               // review.js: the count on the tab
      renderAll();
      renderGate();
      toast(tr("Welcome, {name}", { name: r.name }));
    } catch (e) {
      if (S.token && e.status !== 401) { S.locked = false; renderAll(); renderGate(); return; }
      err.textContent = e.message; err.hidden = false;
      btn.disabled = false; btn.textContent = tr("Unlock");
      pass.value = ""; pass.focus();
    }
  };
  const card = el("form", { class: "gate-card", onsubmit: submit },
    el("div", { class: "gate-mast" },
      el("div", { class: "gate-brand" },
        el("img", { src: LOGO_WORDMARK, alt: "Delardi" }),
        el("span", { text: tr("Boutique tools") })),
      langSwitch()),
    err,
    el("label", { for: "gate-pass" }, el("span", { class: "lbl", text: tr("Passcode") }), pass),
    btn,
    el("p", { class: "gate-foot small", text: tr("Opens Stock") }));
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, card));
  const app = $("#app");
  app.classList.add("gated");
  app.setAttribute("aria-hidden", "true");
  app.inert = true;                                // Tab cannot reach the header behind the card
  setTimeout(() => pass.focus(), 60);
}
// Drop the token and ask for the passcode again. The filters on screen stay.
function lockDown(message) {
  S.token = null;
  sstore(SESSION_KEY, null);
  sstore(ACTIVE_KEY, null);
  S.locked = true;
  S.gateMessage = message || null;
  clearTimeout(S.qTimer);
  for (const k of Object.keys(S.priceTimers)) clearTimeout(S.priceTimers[k]);
  S.priceTimers = {};
  // Nothing from the session stays in memory behind the card; the filters do.
  S.rv = null; S.reviewCount = null;
  { const h = $("#rv-host"); if (h) h.innerHTML = ""; if (typeof setReviewTab === "function") setReviewTab(); }   // review.js: no queue is left on screen behind the card
  S.list = null; S.listError = null; S.listBusy = false; S.facets = null;
  // The Tools menu (ui/tools.js) is closed and its listeners dropped before anything is redrawn.
  kitCloseMenus();
  // Panels and dialogs live on <body>, outside the gated #app: close them, so no piece
  // detail stays on screen above the passcode card.
  if (typeof closePiece === "function") closePiece();          // piece.js (Task 4)
  document.querySelectorAll(".modal-wrap, .panel-wrap").forEach((n) => n.remove());
  renderGate();
}
function lockNow() { lockDown(); toast(tr("Locked.")); }

/* --------------------------------------------------------------- idle lock
   Touch devices only: an iPad left on the counter for 15 minutes asks for the
   passcode again. The filters on screen are kept. */
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

// Brands and categories for the filter selects (once per unlock).
async function loadFacets() {
  try { S.facets = await api("facets"); }
  catch (e) { if (e.status === 401) throw e; S.facets = { brands: [], categories: [] }; toast(e.message, true); }
}

/* -------------------------------------------------------------------- init */
function renderAll() {
  const app = $("#app");
  document.documentElement.lang = LANG;
  document.title = "Delardi " + tr("Stock");
  if (S.locked && !S.facets) return;               // nothing behind the gate before a passcode
  const r = route();
  kitCloseMenus();                                 // the header is redrawn: no open menu is left listening
  app.innerHTML = "";
  if (!S.locked) { app.classList.remove("gated"); app.setAttribute("aria-hidden", "false"); app.inert = false; }
  const main = el("main", { id: "main" });
  app.append(renderHeader(), main);
  ROUTES[r.name](main, r.arg);
  if (typeof renderPiece === "function") renderPiece();      // an open piece panel follows the language
}
function restoreSession() {
  try {
    const s = JSON.parse(sstore(SESSION_KEY) || "null");
    if (!s || !s.token || new Date(s.expires_at).getTime() <= Date.now()) return false;
    const last = Number(sstore(ACTIVE_KEY) || 0);
    if (touchDevice() && last && Date.now() - last >= IDLE_MIN * 60000) { sstore(SESSION_KEY, null); return false; }
    S.token = s.token; S.name = s.name; S.expires_at = s.expires_at; S.rights = s.rights || S.rights;
    return true;
  } catch (e) { return false; }
}

(async function boot() {
  document.documentElement.lang = LANG;
  if (restoreSession()) {
    try {
      const p = await api("ping");
      S.name = p.name; S.rights = p.rights; S.locked = false; activeNow();
      await loadFacets();
      loadReviews();
    } catch (e) {
      S.locked = true;
      if (e.status !== 401) { S.token = null; sstore(SESSION_KEY, null); S.gateMessage = e.raw || null; }
    }
  }
  if (S.locked) $("#app").innerHTML = "";          // nothing behind the gate
  renderAll();
  renderGate();
})();
