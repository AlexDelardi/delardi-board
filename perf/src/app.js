/* ===========================================================================
   Delardi Performance — the page shell: language, passcode gate, header, month
   picker and routes. The screens are month.js, incentive.js and inputs.js,
   inlined by build.py ahead of the init marker. The page talks to perf-api only.
   Nothing is kept behind the passcode card: the month's document is dropped on lock.
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/perf-api";
const LOGO_WORDMARK = "__WORDMARK__";
// Seasonal decoration (ui/season.js): a fir sprig on the month, a snowflake pair on the year, the brands and the
// incentive, nothing on Inputs; on a phone the sprig steps aside for the snowflakes.
function seasonMark(routeName) {
  if (routeName === "inputs") return null;
  return seasonMarkEl(routeName === "month" && !window.matchMedia("(max-width: 599px)").matches ? "sprig" : "flake");
}
const SESSION_KEY = "perf_session";       // sessionStorage: gone when the tab closes
const ACTIVE_KEY = "perf_last_active";    // sessionStorage: last touch, for the idle lock
const LANG_KEY = "delardi_lang";          // shared with the landing page
const CUR_KEY = "perf_currency";          // localStorage: amounts shown in so'm or in US dollars
const USD_RATE = 12000;                   // the internal rate; the dollar view always uses it
const MONTH_KEY = "perf_month";           // sessionStorage: the month on screen
const YEAR_KEY = "perf_year";             // sessionStorage: the year on the Year screen
const BRAND_MODE_KEY = "perf_brand_mode"; // sessionStorage: Brands shows the month or the year
const IDLE_MIN = 15;                      // touch devices only

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing from the table simply shows in English. */
const RU = {
  "Performance": "Показатели",
  "All tools": "Все инструменты",
  "Language": "Язык", "Currency": "Валюта",
  "Lock": "Заблокировать", "Menu": "Меню",
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
  "Previous month": "Предыдущий месяц", "Next month": "Следующий месяц", "Previous year": "Предыдущий год", "Next year": "Следующий год",
  "Loading the month…": "Загружаю месяц…",
  "Try again": "Повторить",
};
const PL = {
  ticket: { en: ["ticket", "tickets"], ru: ["чек", "чека", "чеков"] },
};
function initialCur() {
  try { if (localStorage.getItem(CUR_KEY) === "usd") return "usd"; } catch (e) { /* storage blocked */ }
  return "uzs";
}
let CUR = initialCur();
function setCur(c) {
  CUR = c === "usd" ? "usd" : "uzs";
  try { localStorage.setItem(CUR_KEY, CUR); } catch (e) { /* ignore */ }
  renderAll();
}
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
  locked: true, gateMessage: null, menuOpen: false,
  span: null,                        // { first, last }: months that have tickets
  month: null,                       // "YYYY-MM" on screen
  doc: null, busy: false, err: null, // the month's document (perf_month)
  form: null,                        // inputs.js: the form being edited
  year: null,                        // the year on the Year screen
  brandMode: "month",                // Brands: "month" or "year"
  inMonth: null,                     // Inputs has its own month: it opens on the month ahead
  yearDoc: null, brandDoc: null, inDoc: null,   // { key, doc, err }: one document per screen, see need()
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
// An amount held in so'm, as a whole number in the currency on screen.
function inCur(n) { return CUR === "usd" ? Math.round(Number(n) / USD_RATE) : Math.round(Number(n)); }
// The bare figure for a table cell: "31 500 000" in so'm, "2 625" in dollars.
function fmtAmt(n) {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
  return fmtUZS(inCur(n));
}
const curUnit = () => (CUR === "usd" ? "USD" : tr("so'm"));
// "31 500 000 so'm" / "31 500 000 сум" / "$2 625"
function fmtMoney(n) {
  const s = fmtAmt(n);
  if (s === "—") return s;
  return CUR === "usd" ? (s.startsWith("-") ? "-$" + s.slice(1) : "$" + s) : s + " " + tr("so'm");
}
// The same amount in the other currency, for the small line under a headline.
function fmtOther(n) {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
  return CUR === "usd" ? fmtUZS(n) + " " + tr("so'm") : fmtUSD(n);
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
// "$79 252" at the internal rate
function fmtUSD(uzs) {
  const n = num(uzs);
  return n === null ? "—" : (n < 0 ? "-" : "") + "$" + fmtUZS(Math.abs(n) / USD_RATE);
}
// "+12.4%" / "−8.0%" against a reference; "—" when the reference is zero or missing
function fmtChange(cur, ref) {
  const a = num(cur), b = num(ref);
  if (a === null || b === null || b === 0) return "—";
  const d = (a - b) / Math.abs(b);
  return (d > 0 ? "+" : d < 0 ? "−" : "") + fmtPct(Math.abs(d));
}
// A signed whole number as it stands, and a signed amount in the currency on screen.
const signedRaw = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtUZS(Math.abs(n));
const signed = (n) => signedRaw(inCur(n));

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
   #/month (default)  #/year  #/brands  #/incentive  #/inputs */
const ROUTES = {
  month: (main) => renderMonth(main),              // month.js
  incentive: (main) => renderIncentive(main),      // incentive.js
  inputs: (main) => renderInputs(main),            // inputs.js
  year: (main) => renderYear(main),                // year.js
  brands: (main) => renderBrands(main),            // brands.js
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
  S.month = m; S.doc = null;
  sstore(MONTH_KEY, m);
  loadMonth();
}
// After a save or a correction the server answers with the month recomputed. The year and the brands were
// computed from the same tickets and plans, so they are asked for again when next shown.
function takeDoc(d) { monthSeq++; S.doc = d; S.busy = false; S.err = null; S.yearDoc = null; S.brandDoc = null; }

/* ------------------------------------------------- one document per screen
   need(slot, action, params, key) → { key, doc, err }. The Year, Brands and Inputs screens each hold one document;
   when the key on screen changes, the document is asked for again and an answer for an old key is dropped. */
function need(slot, action, params, key) {
  const cur = S[slot];
  if (cur && cur.key === key) return cur;
  const st = S[slot] = { key, doc: null, err: null };
  api(action, params).then((d) => { if (S[slot] === st && !S.locked) { st.doc = d; renderAll(); } },
    (e) => { if (S[slot] === st && !S.locked) { st.err = e.message; renderAll(); } });
  return st;
}
// What such a screen shows while its document is loading or could not be loaded. → true when it should stop there.
function pending(sec, st, loadingText) {
  if (st.err) {
    sec.append(el("p", { class: "notice", role: "alert", id: "doc-err" }, st.err + " ",
      el("button", { type: "button", class: "btn", onclick: () => { for (const k of ["yearDoc", "brandDoc", "inDoc"]) if (S[k] === st) S[k] = null; renderAll(); }, text: tr("Try again") })));
    return true;
  }
  if (!st.doc) { sec.append(el("p", { class: "small", role: "status", id: "doc-loading", text: tr(loadingText) })); return true; }
  return false;
}
// Inputs run one month ahead of the sales: the month after the last one with tickets, or next calendar month if later.
function inputsLast() {
  const t = tashkentDay(new Date().toISOString());
  const nextCal = addMonths(t.y + "-" + String(t.m).padStart(2, "0"), 1), afterSales = addMonths(S.span.last, 1);
  return nextCal > afterSales ? nextCal : afterSales;
}
function setInMonth(m) {
  if (!S.span || S.locked || m === S.inMonth || m < S.span.first || m > inputsLast()) return;
  S.inMonth = m; S.form = null; renderAll();
}
function inMonthPicker() {
  if (!S.span || !S.inMonth) return null;
  const months = [], last = inputsLast();
  for (let m = last; m >= S.span.first; m = addMonths(m, -1)) months.push(m);
  const sel = el("select", { id: "in-month-select", "aria-label": tr("Month"), onchange: () => setInMonth(sel.value) },
    months.map((m) => el("option", { value: m, selected: m === S.inMonth ? true : null, text: monthName(m) })));
  return el("div", { class: "month-picker" },
    el("button", { type: "button", class: "btn", id: "in-month-prev", "aria-label": tr("Previous month"), disabled: S.inMonth <= S.span.first ? true : null, onclick: () => setInMonth(addMonths(S.inMonth, -1)), text: "‹" }),
    sel,
    el("button", { type: "button", class: "btn", id: "in-month-next", "aria-label": tr("Next month"), disabled: S.inMonth >= last ? true : null, onclick: () => setInMonth(addMonths(S.inMonth, 1)), text: "›" }));
}

/* ------------------------------------------------------------------ header */
function langSwitch() {
  return el("div", { class: "kit-lang", role: "group", "aria-label": tr("Language") }, ["en", "ru"].map((l) =>
    el("button", { type: "button", class: "kit-hbtn", lang: l, "aria-pressed": LANG === l ? "true" : "false",
      onclick: () => { if (LANG !== l) setLang(l); }, text: l.toUpperCase() })));
}
function curSwitch() {
  if (!S.token) return null;
  return el("div", { class: "cur-switch", id: "cur-switch", role: "group", "aria-label": tr("Currency") }, [["uzs", "UZS"], ["usd", "USD"]].map(([c, label]) =>
    el("button", { type: "button", class: "btn", "data-cur": c, "aria-pressed": CUR === c ? "true" : "false", onclick: () => { if (CUR !== c) setCur(c); }, text: label })));
}
function monthPicker() {
  if (!S.span || !S.month) return null;
  const months = [];
  for (let m = S.span.last; m >= S.span.first; m = addMonths(m, -1)) months.push(m);
  const sel = el("select", { id: "month-select", "aria-label": tr("Month"), onchange: () => setMonth(sel.value) },
    months.map((m) => el("option", { value: m, selected: m === S.month ? true : null, text: monthName(m, isPhone() && route().name === "brands") })));   // beside the period switch a phone has room for the short name
  return el("div", { class: "month-picker" },
    el("button", { type: "button", class: "btn", id: "month-prev", "aria-label": tr("Previous month"), disabled: S.month <= S.span.first ? true : null,
      onclick: () => setMonth(addMonths(S.month, -1)), text: "‹" }),
    sel,
    el("button", { type: "button", class: "btn", id: "month-next", "aria-label": tr("Next month"), disabled: S.month >= S.span.last ? true : null,
      onclick: () => setMonth(addMonths(S.month, 1)), text: "›" }));
}
// A phone gets a slim header: the navy bar keeps the wordmark, the tool name and a menu button; tools, language,
// currency and lock sit behind that button; the tabs stay on one row; the period picker moves under them, outside the
// pinned part. From 600 px up the header is the full one.
const PHONE_MQ = window.matchMedia("(max-width: 599px)");
const isPhone = () => PHONE_MQ.matches;
PHONE_MQ.addEventListener("change", () => { S.menuOpen = false; if (!S.locked) renderAll(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && S.menuOpen) { S.menuOpen = false; renderAll(); const b = $("#menu-btn"); if (b) b.focus(); } });
// The drawing width of a chart: a phone's own width, so labels keep their size instead of shrinking with the picture.
const chartW = (wide) => (isPhone() ? 340 : wide);
function renderHeader() {
  const r = route().name, phone = isPhone();
  const tab = (name, label) => el("a", { class: "kit-tab", href: "#/" + name, id: "tab-" + name, "aria-current": r === name ? "page" : null, text: tr(label) });
  const staff = S.token ? el("span", { class: "kit-staff" + (phone ? "" : " hide-sm"), title: S.name, text: S.name }) : null;
  const lock = S.token ? el("button", { class: "kit-hbtn", type: "button", onclick: lockNow, text: tr("Lock") }) : null;
  const cur = r === "inputs" ? null : curSwitch();
  // each screen shows the picker for the period it is about
  const period = [r === "brands" && S.token && S.span ? brandModeSwitch() : null,
    r === "year" || (r === "brands" && S.brandMode === "year") ? yearPicker() : r === "inputs" ? inMonthPicker() : monthPicker()];
  const open = phone && S.menuOpen;
  const menuBtn = phone ? el("button", { class: "kit-hbtn menu-btn", id: "menu-btn", type: "button", "aria-label": tr("Menu"), "aria-expanded": open ? "true" : "false", "aria-controls": "head-menu",
    onclick: () => { S.menuOpen = !S.menuOpen; renderAll(); const b = $("#menu-btn"); if (b && !S.menuOpen) b.focus(); } }, el("span", { class: "menu-bars", "aria-hidden": "true" })) : null;
  const menu = open ? kitPhoneMenu([staff, kitToolsMenu("perf", LANG), langSwitch(), cur, lock], LANG, () => { S.menuOpen = false; renderAll(); const b = $("#menu-btn"); if (b) b.focus(); }) : null;
  // a choice made in the menu closes it; the tools list opens in place
  if (menu) menu.addEventListener("click", (ev) => { if (ev.target.closest("button, a") && !ev.target.closest(".kit-tool-wrap > button")) S.menuOpen = false; }, true);
  const nav = el("nav", { class: "kit-tabs", "aria-label": tr("Performance") },
    tab("month", "Month"), tab("year", "Year"), tab("brands", "Brands"), tab("incentive", "Incentive"), tab("inputs", "Inputs"),
    phone ? null : [el("span", { class: "kit-spacer" }), cur, period]);
  const top = el("header", { class: "top" + (phone ? " phone" : "") + (open ? " open" : "") },
    el("div", { class: "kit-head" },
      el("a", { class: "kit-brand", href: "../" }, el("img", { src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })),
      el("span", { class: "kit-rule", "aria-hidden": "true" }),
      el("span", { class: "kit-tool", text: tr("Performance") }),
      el("span", { class: "kit-spacer" }),
      phone ? menuBtn : [kitToolsMenu("perf", LANG), langSwitch(), staff, lock]),
    menu, nav);
  const bar = phone && period.some(Boolean) ? el("div", { class: "period-bar", id: "period-bar" }, period) : null;
  // on a phone the tab in use is brought into view in its row
  if (phone) requestAnimationFrame(() => { const a = nav.querySelector('[aria-current="page"]'); if (a) nav.scrollLeft = Math.max(0, a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2); });
  return [top, bar].filter(Boolean);
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
  if (S.span) {
    const y0 = Number(S.span.first.slice(0, 4)), y1 = Number(S.span.last.slice(0, 4)), sy = Number(sstore(YEAR_KEY));
    S.year = sy >= y0 && sy <= y1 ? sy : y1;
    S.brandMode = sstore(BRAND_MODE_KEY) === "year" ? "year" : "month";
    S.inMonth = inputsLast();
  }
  S.yearDoc = null; S.brandDoc = null; S.inDoc = null;
  if (S.month) loadMonth(); else renderAll();
}
function renderGate() {
  const old = $("#gate");
  if (old) old.remove();
  if (!S.locked) return;
  if (kitHubGate("perf")) return;                // signing in is the home page's job (ui/hub.js)
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
  S.yearDoc = null; S.brandDoc = null; S.inDoc = null;
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
  app.append(...renderHeader(), main);
  ROUTES[r.name](main);
  const sec = main.querySelector(".screen"), mark = sec && seasonMark(r.name);
  if (mark) { sec.classList.add("in-season"); sec.prepend(mark); }
}
function restoreSession() {
  kitHubAdopt("perf", SESSION_KEY, { idleKey: ACTIVE_KEY, active: activeNow });          // the home page's sign-in, taken as this tool's own (ui/hub.js)
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
