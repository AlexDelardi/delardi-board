/* ===========================================================================
   Delardi Performance — the page shell: language, passcode gate, header, month
   picker and routes. The screens are month.js, incentive.js and inputs.js,
   inlined by build.py ahead of the init marker. The page talks to perf-api only.
   Nothing is kept behind the passcode card: the month's document is dropped on lock.
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/perf-api";
const LOGO_WORDMARK = "__WORDMARK__";
const SESSION_KEY = "perf_session";       // sessionStorage: gone when the tab closes
const ACTIVE_KEY = "perf_last_active";    // sessionStorage: last touch, for the idle lock
const LANG_KEY = "delardi_lang";          // shared with the landing page
const MONTH_KEY = "perf_month";           // sessionStorage: the month on screen
const IDLE_MIN = 15;                      // touch devices only

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  "Performance": "Показатели",
  "All tools": "Все инструменты",
  "Language": "Язык",
  "Lock": "Заблокировать",
  "Locked.": "Заблокировано.",
  "Boutique tools": "Инструменты бутика",
  "Unlock": "Открыть",
  "Checking…": "Проверяю…",
  "Passcode": "Код доступа",
  "Opens Performance": "Открывает показатели",
  "Welcome, {name}": "Здравствуйте, {name}",
  "Enter your passcode.": "Введите код доступа.",
  "Locked after {n} minutes without use.": "Заблокировано после {n} минут без действий.",
  "That passcode is not right.": "Неверный код доступа.",
  "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "This account does not have access to Performance.": "У этой учётной записи нет доступа к показателям.",
  "Enter your passcode to open Performance.": "Введите код доступа, чтобы открыть показатели.",
  "That session is not valid. Enter your passcode again.": "Сеанс недействителен. Введите код доступа ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сеанс истёк. Введите код доступа ещё раз.",
  "Something went wrong on the server.": "Ошибка на сервере.",
  "No connection. Check the Wi-Fi and try again.": "Нет связи. Проверьте Wi-Fi и попробуйте ещё раз.",
  "The server did not answer. Try again.": "Сервер не ответил. Попробуйте ещё раз.",
  "Request failed ({n})": "Ошибка запроса ({n})",
  "so'm": "сум",
  "Yes": "Да", "Cancel": "Отмена", "Close": "Закрыть",
  "Month": "Месяц", "Incentive": "Мотивация", "Inputs": "Вводные",
  "Previous month": "Предыдущий месяц", "Next month": "Следующий месяц",
  "Loading the month…": "Загружаю месяц…",
  "Try again": "Повторить",
};
const PL = {
  ticket: { en: ["ticket", "tickets"], ru: ["чек", "чека", "чеков"] },
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
const S = {
  token: null, name: null, expires_at: null,
  locked: true, gateMessage: null,
  span: null,                        // { first, last }: months that have tickets
  month: null,                       // "YYYY-MM" on screen
  doc: null, busy: false, err: null, // the month's document (perf_month)
  form: null,                        // inputs.js: the form being edited
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

/* ----------------------------------------------------------------- numbers */
const MONTHS_LONG = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
};
// "2026-10" or "2026-10-01" → "October 2026" / "Oct 26"
function monthName(m, short) {
  const y = Number(String(m).slice(0, 4)), k = Number(String(m).slice(5, 7)) - 1;
  if (short) return MONTHS[LANG === "ru" ? "ru" : "en"][k].replace(/^мая$/, "май") + " " + y;
  return MONTHS_LONG[LANG === "ru" ? "ru" : "en"][k] + " " + y;
}
function addMonths(m, n) {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
// "5.6%" from 0.0555; "—" when there is nothing to show
function fmtPct(v, digits) {
  const n = num(v);
  return n === null ? "—" : (n * 100).toFixed(digits === undefined ? 1 : digits).replace(".", LANG === "ru" ? "," : ".") + "%";
}
function fmtNum(v, digits) {
  const n = num(v);
  if (n === null) return "—";
  return digits ? n.toFixed(digits).replace(".", LANG === "ru" ? "," : ".") : fmtUZS(n);
}
// "$79 252" at the month's rate
function fmtUSD(uzs, fx) {
  const n = num(uzs), r = num(fx);
  return n === null || !r ? "—" : (n < 0 ? "-" : "") + "$" + fmtUZS(Math.abs(n) / r);
}
// "+12.4%" / "−8.0%" against a reference; "—" when the reference is zero or missing
function fmtChange(cur, ref) {
  const a = num(cur), b = num(ref);
  if (a === null || b === null || b === 0) return "—";
  const d = (a - b) / Math.abs(b);
  return (d > 0 ? "+" : d < 0 ? "−" : "") + fmtPct(Math.abs(d));
}
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtUZS(Math.abs(n));

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
   #/month (default)  #/incentive  #/inputs */
const ROUTES = {
  month: (main) => renderMonth(main),              // month.js
  incentive: (main) => renderIncentive(main),      // incentive.js
  inputs: (main) => renderInputs(main),            // inputs.js
};
function route() {
  const m = /^#\/([a-z]+)/.exec(location.hash || "");
  return { name: m && ROUTES[m[1]] ? m[1] : "month" };
}
window.addEventListener("hashchange", () => { if (!S.locked) { S.form = null; renderAll(); } });

/* -------------------------------------------------------------- the month
   One document per month (perf_month). A newer request wins: an answer for a month
   that is no longer on screen is dropped. */
let monthSeq = 0;
async function loadMonth() {
  const seq = ++monthSeq, m = S.month;
  S.busy = true; S.err = null;
  renderAll();
  try {
    const d = await api("month", { month: m });
    if (seq !== monthSeq || S.locked) return;
    S.doc = d;
  } catch (e) {
    if (seq !== monthSeq || S.locked) return;
    S.err = e.message; S.doc = null;
  }
  S.busy = false;
  renderAll();
}
function setMonth(m) {
  if (!m || m === S.month || S.locked) return;
  if (S.span && (m < S.span.first || m > S.span.last)) return;
  S.month = m; S.doc = null; S.form = null;
  sstore(MONTH_KEY, m);
  loadMonth();
}
// After a save or a correction the server answers with the month recomputed.
function takeDoc(d) { monthSeq++; S.doc = d; S.busy = false; S.err = null; }

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "kit-lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", class: "kit-hbtn", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
function monthPicker() {
  if (!S.span || !S.month) return null;
  const months = [];
  for (let m = S.span.last; m >= S.span.first; m = addMonths(m, -1)) months.push(m);
  const sel = el("select", { id: "month-select", "aria-label": tr("Month"), onchange: () => setMonth(sel.value) },
    months.map((m) => el("option", { value: m, selected: m === S.month ? true : null, text: monthName(m) })));
  return el("div", { class: "month-picker" },
    el("button", { type: "button", class: "btn", id: "month-prev", "aria-label": tr("Previous month"), disabled: S.month <= S.span.first ? true : null,
      onclick: () => setMonth(addMonths(S.month, -1)), text: "‹" }),
    sel,
    el("button", { type: "button", class: "btn", id: "month-next", "aria-label": tr("Next month"), disabled: S.month >= S.span.last ? true : null,
      onclick: () => setMonth(addMonths(S.month, 1)), text: "›" }));
}
function renderHeader() {
  const r = route().name;
  const tab = (name, label) => el("a", { class: "kit-tab", href: "#/" + name, id: "tab-" + name, "aria-current": r === name ? "page" : null, text: tr(label) });
  return el("header", { class: "top" },
    el("div", { class: "kit-head" },
      el("a", { class: "kit-brand", href: "../" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })),
      el("span", { class: "kit-rule", "aria-hidden": "true" }),
      el("span", { class: "kit-tool", text: tr("Performance") }),
      el("span", { class: "kit-spacer" }),
      kitToolsMenu("perf", LANG),
      langSwitch(),
      S.token ? el("span", { class: "kit-staff hide-sm", title: S.name, text: S.name }) : null,
      S.token ? el("button", { class: "kit-hbtn", type: "button", onclick: lockNow, text: tr("Lock") }) : null),
    el("nav", { class: "kit-tabs", "aria-label": tr("Performance") },
      tab("month", "Month"), tab("incentive", "Incentive"), tab("inputs", "Inputs"),
      el("span", { class: "kit-spacer" }),
      monthPicker()));
}
// What every screen shows while the month is loading or could not be loaded. → true when the screen should stop there.
function monthPending(sec) {
  if (S.err) {
    sec.append(el("p", { class: "notice", role: "alert", id: "month-err" }, S.err + " ",
      el("button", { type: "button", class: "btn", onclick: loadMonth, text: tr("Try again") })));
    return true;
  }
  if (!S.doc) { sec.append(el("p", { class: "small", role: "status", id: "month-loading", text: tr("Loading the month…") })); return true; }
  return false;
}

/* -------------------------------------------------------------------- gate */
async function afterUnlock() {
  S.span = null;
  const sp = await api("span");
  const ym = (d) => String(d || "").slice(0, 7);
  S.span = sp && sp.first ? { first: ym(sp.first), last: ym(sp.last) } : null;
  const saved = sstore(MONTH_KEY);
  S.month = S.span ? (saved && saved >= S.span.first && saved <= S.span.last ? saved : S.span.last) : null;
  if (S.month) loadMonth(); else renderAll();
}
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
      S.token = r.token; S.name = r.name; S.expires_at = r.expires_at;
      sstore(SESSION_KEY, JSON.stringify({ token: r.token, name: r.name, expires_at: r.expires_at }));
      S.locked = false; S.gateMessage = null;
      activeNow();
      await afterUnlock();
      renderAll();
      renderGate();
      toast(tr("Welcome, {name}", { name: r.name }));
    } catch (e) {
      if (S.token && e.status !== 401) { S.locked = false; S.err = e.message; renderAll(); renderGate(); return; }
      err.textContent = e.message; err.hidden = false;
      btn.disabled = false; btn.textContent = tr("Unlock");
      pass.value = ""; pass.focus();
    }
  };
  const card = el("form", { class: "gate-card", onsubmit: submit },
    el("div", { class: "gate-mast" },
      el("div", { class: "gate-brand" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi" }), el("span", { text: tr("Boutique tools") })),
      langSwitch()),
    err,
    el("label", { for: "gate-pass" }, el("span", { class: "lbl", text: tr("Passcode") }), pass),
    btn,
    el("p", { class: "gate-foot small", text: tr("Opens Performance") }));
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, card));
  const app = $("#app");
  app.classList.add("gated");
  app.setAttribute("aria-hidden", "true");
  app.inert = true;
  setTimeout(() => pass.focus(), 60);
}
// Drop the token and ask for the passcode again. Nothing of the month stays in memory or on screen behind the card.
function lockDown(message) {
  S.token = null;
  sstore(SESSION_KEY, null);
  sstore(ACTIVE_KEY, null);
  S.locked = true;
  S.gateMessage = message || null;
  monthSeq++;
  S.doc = null; S.span = null; S.form = null; S.busy = false; S.err = null;
  kitCloseMenus();
  document.querySelectorAll(".modal-wrap, .chart-tip").forEach((n) => n.remove());
  $("#app").innerHTML = "";
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

/* -------------------------------------------------------------------- init */
function renderAll() {
  const app = $("#app");
  document.documentElement.lang = LANG;
  document.title = "Delardi " + tr("Performance");
  if (S.locked) return;                            // nothing behind the gate
  const r = route();
  kitCloseMenus();
  document.querySelectorAll(".chart-tip").forEach((n) => n.remove());
  app.innerHTML = "";
  app.classList.remove("gated"); app.setAttribute("aria-hidden", "false"); app.inert = false;
  const main = el("main", { id: "main" });
  app.append(renderHeader(), main);
  ROUTES[r.name](main);
}
function restoreSession() {
  try {
    const s = JSON.parse(sstore(SESSION_KEY) || "null");
    if (!s || !s.token || new Date(s.expires_at).getTime() <= Date.now()) return false;
    const last = Number(sstore(ACTIVE_KEY) || 0);
    if (touchDevice() && last && Date.now() - last >= IDLE_MIN * 60000) { sstore(SESSION_KEY, null); return false; }
    S.token = s.token; S.name = s.name; S.expires_at = s.expires_at;
    return true;
  } catch (e) { return false; }
}

(async function boot() {
  document.documentElement.lang = LANG;
  if (restoreSession()) {
    try {
      const p = await api("ping");
      S.name = p.name; S.locked = false; activeNow();
      await afterUnlock();
    } catch (e) {
      S.locked = true;
      if (e.status !== 401) { S.token = null; sstore(SESSION_KEY, null); S.gateMessage = e.raw || null; }
    }
  }
  if (S.locked) $("#app").innerHTML = "";
  renderAll();
  renderGate();
})();
