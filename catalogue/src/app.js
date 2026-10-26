
/* ===========================================================================
   Delardi Catalogue — the page
   There is deliberately NO database key in this file. Every read goes through
   the catalogue-api edge function, which needs a session token issued only in
   exchange for a personal passcode, and only to someone who has been given
   catalogue access (board_users.can_view_catalogue). The catalogue is
   read-only; the one write, reporting an error, arrives in part 4.

   Part 2 (24 Oct 2026): the start screen, the four ways in (brand, category,
   retail category, collection), the reference list with its search, filters
   and sort.
   Part 3 (24 Oct 2026): the model page (model.js) and the list filters on
   metal, stone, movement and case size.
   Part 4 (24 Oct 2026): client view, report an error and the owner's review,
   the idle lock, no-connection handling, back closing panels (floor.js).
   ========================================================================= */
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/catalogue-api";
const LOGO_WORDMARK = "__WORDMARK__";
const MONO_NAVY = "__MONO_NAVY__";
const MONO_WHITE = "__MONO_WHITE__";
const SESSION_KEY = "cat_session";
const RECENT_KEY = "cat_recent";          // model references only, never names or prices
const HIDE_KEY = "cat_hide_amounts";
const THEME_KEY = "board_theme";          // shared with the Weekly Board and the CRM
const LANG_KEY = "delardi_lang";          // shared with the landing page
const PAGE = 60;
const RECENT_MAX = 12;

/* ---------------------------------------------------------------- language
   English is written in the code; Russian comes from this table, keyed by the
   English. Anything missing simply shows in English. */
const RU = {
  "Catalogue": "Каталог",
  "Watches & jewellery": "Часы и украшения",
  "All tools": "Все инструменты",
  "Switch between light and dark": "Светлая или тёмная тема",
  "Hide amounts": "Скрыть цены",
  "Show amounts": "Показать цены",
  "Amounts hidden.": "Цены скрыты.",
  "Amounts shown.": "Цены показаны.",
  "Lock": "Заблокировать",
  "Locked.": "Заблокировано.",
  "Unlock": "Вход",
  "The catalogue is for the Delardi team. Enter your personal passcode to open it.": "Каталог — для команды Delardi. Введите свой личный код доступа.",
  "Your passcode": "Ваш код доступа",
  "Open the catalogue": "Открыть каталог",
  "Checking…": "Проверяем…",
  "Enter your passcode.": "Введите код доступа.",
  "Nothing loads until your passcode is accepted. A Board or CRM passcode opens the catalogue only if you have been given catalogue access.":
    "Данные загружаются только после проверки кода. Код от доски или CRM подходит, только если вам дан доступ к каталогу.",
  "That passcode is not right.": "Неверный код доступа.",
  "This account does not have access to the catalogue.": "У этой учётной записи нет доступа к каталогу.",
  "That session is not valid. Enter your passcode again.": "Сеанс недействителен. Введите код ещё раз.",
  "Your session has expired. Enter your passcode again.": "Сеанс истёк. Введите код ещё раз.",
  "Enter your passcode to open the catalogue.": "Введите код доступа.",
  "Too many failed attempts. Try again in an hour.": "Слишком много неудачных попыток. Попробуйте через час.",
  "That model is not in the catalogue.": "Такой модели нет в каталоге.",
  "No connection. Check the Wi-Fi and try again.": "Нет связи. Проверьте Wi-Fi и попробуйте ещё раз.",
  "No connection — the catalogue will catch up when it is back.": "Нет связи — каталог обновится, когда она появится.",
  "Request failed ({n})": "Запрос не выполнен ({n})",
  // start
  "Find a piece": "Найти изделие",
  "Search by reference, serial, name, collection, stone, metal…": "Поиск по артикулу, серийному номеру, названию, коллекции, камню, металлу…",
  "Search": "Найти",
  "Brands": "Бренды",
  "Category": "Категория",
  "Retail category": "Тип изделия",
  "Collections": "Коллекции",
  "Collection": "Коллекция",
  "{n} brands": "Брендов: {n}",
  "{n} collections": "Коллекций: {n}",
  "{n} categories": "Категорий: {n}",
  "{n} types": "Типов: {n}",
  "Rings, earrings, necklaces, watches…": "Кольца, серьги, колье, часы…",
  "Opened recently": "Недавно открытые",
  "Clear": "Очистить",
  "New arrivals": "Новые поступления",
  "See all": "Смотреть все",
  "Everything in stock": "Всё в наличии",
  "Data as of {date}": "Данные на {date}",
  // tiles and list
  "Home": "Главная",
  "{s} in stock · {t} models": "В наличии: {s} · моделей: {t}",
  "{s} in stock": "В наличии: {s}",
  "Photo coming soon": "Фото скоро",
  "In stock": "В наличии",
  "Sold out": "Нет в наличии",
  "In transit": "В пути",
  "{n} in transit": "{n} в пути",
  "Shipped {date}": "Отправлено {date}",
  "Price when it arrives": "Цена после поступления",
  "All": "Все",
  "Filters": "Фильтры",
  "Sort": "Сортировка",
  "Newest arrivals": "Сначала новые",
  "Brand A–Z": "Бренд А–Я",
  "Price: low to high": "Цена: по возрастанию",
  "Price: high to low": "Цена: по убыванию",
  "Reference": "Артикул",
  "Least complete first": "Сначала неполные",
  "Search in this list": "Поиск в этом списке",
  "{n} models": "Моделей: {n}",
  "Showing {a} of {n}": "Показано {a} из {n}",
  "Show more": "Показать ещё",
  "Nothing matches.": "Ничего не найдено.",
  "Try fewer words, or take a filter off.": "Попробуйте меньше слов или снимите фильтр.",
  "Clear all": "Сбросить всё",
  "Show {n}": "Показать: {n}",
  "Gender": "Пол",
  "Price, million UZS": "Цена, млн сум",
  "from": "от",
  "to": "до",
  "Only models with key details still TBC": "Только модели, где не хватает ключевых данных",
  "Key details TBC": "Ключевые данные уточняются",
  "Ref.": "Арт.",
  "from {p}": "от {p}",
  "All brands": "Все бренды",
  "Women": "Женское", "Men": "Мужское", "Unisex": "Унисекс",
  "Stock": "Наличие",
  "Done": "Готово",
  "Close": "Закрыть",
  "Search: “{q}”": "Поиск: «{q}»",
  "price from {p} mln": "цена от {p} млн",
  "price to {p} mln": "цена до {p} млн",
  "TBC": "Уточняется",
  // model placeholder
  "Model": "Модель",
  "Model name and number": "Модель и артикул",
  "Material": "Материал",
  "Price": "Цена",
  "Sizes in stock": "Размеры в наличии",
  "Colours": "Цвета",
  "The full model page — specifications, stones, the advisor's notes and matching pieces — comes in the next part.":
    "Полная страница модели — характеристики, камни, заметки для консультанта и парные изделия — появится в следующей части.",
  "Matching pieces": "Парные изделия",
  "pieces": "шт.",
  "Back": "Назад",
};
const CATS = {
  jewellery: { en: "Jewellery", ru: "Украшения" },
  watch: { en: "Watches", ru: "Часы" },
  accessory: { en: "Accessories", ru: "Аксессуары" },
};
const CAT_ORDER = ["jewellery", "watch", "accessory"];
const TYPES = {
  ring:             { en: ["Ring", "Rings"], ru: ["Кольцо", "Кольца"], cat: "jewellery" },
  earrings:         { en: ["Earrings", "Earrings"], ru: ["Серьги", "Серьги"], cat: "jewellery" },
  necklace:         { en: ["Necklace", "Necklaces"], ru: ["Колье", "Колье"], cat: "jewellery" },
  bracelet:         { en: ["Bracelet", "Bracelets"], ru: ["Браслет", "Браслеты"], cat: "jewellery" },
  cufflinks:        { en: ["Cufflinks", "Cufflinks"], ru: ["Запонки", "Запонки"], cat: "jewellery" },
  watch:            { en: ["Watch", "Watches"], ru: ["Часы", "Часы"], cat: "watch" },
  strap:            { en: ["Strap", "Straps"], ru: ["Ремешок", "Ремешки"], cat: "accessory" },
  clasp:            { en: ["Clasp", "Clasps"], ru: ["Застёжка", "Застёжки"], cat: "accessory" },
  bracelet_element: { en: ["Bracelet element", "Bracelet elements"], ru: ["Элемент браслета", "Элементы браслетов"], cat: "accessory" },
};
const TYPE_ORDER = Object.keys(TYPES);
const GENDERS = { women: "Women", men: "Men", unisex: "Unisex" };
const COLOUR_NAMES = { WG: ["White gold", "Белое золото"], YG: ["Yellow gold", "Жёлтое золото"], PG: ["Rose gold", "Розовое золото"], RG: ["Rose gold", "Розовое золото"] };
const SORTS = [["newest", "Newest arrivals"], ["brand", "Brand A–Z"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["reference", "Reference"], ["completeness", "Least complete first"]];

function initialLang() {
  try { const v = localStorage.getItem(LANG_KEY); if (v === "en" || v === "ru") return v; } catch (e) { /* blocked */ }
  return /^ru\b/i.test(navigator.language || "") ? "ru" : "en";
}
let LANG = initialLang();
const LOC = () => (LANG === "ru" ? "ru-RU" : "en-GB");
function tr(s, vars) {
  let out = (LANG === "ru" && Object.prototype.hasOwnProperty.call(RU, s)) ? RU[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}
const catName = (c) => (CATS[c] ? CATS[c][LANG] : c);
const typeName = (t, plural) => (TYPES[t] ? TYPES[t][LANG][plural ? 1 : 0] : t);
function setLang(l) {
  LANG = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* ignore */ }
  document.documentElement.lang = l;
  render();
}

/* ------------------------------------------------------------------ state */
const S = {
  session: null,
  locked: true,
  ref: null,               // reference: brands, categories, collections, last load
  list: null,              // { key, rows, total, loading, error }
  recent: null,            // rows for the start screen
  arrivals: null,
  model: null,             // { id, data, error }
  hide: false,
  offline: false,
  sheet: null,             // a copy of the filters being edited
};

/* ---------------------------------------------------------------- helpers */
const $ = (sel, root) => (root || document).querySelector(sel);
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") { if (v) n.className = v; }
    else if (k === "text") n.textContent = v;
    else if (k === "value") n.value = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of [].concat(kids)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}
function svg(path, extra) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  if (extra) s.setAttribute("class", extra);
  for (const d of [].concat(path)) { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.appendChild(p); }
  return s;
}
const ICON = {
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  eyeOff: ["M3 3l18 18", "M10.6 6.1A10.6 10.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9", "M6.6 6.6C3.7 8.4 2 12 2 12s3.6 6 10 6a9.7 9.7 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  filter: ["M4 6h16", "M7 12h10", "M10 18h4"],
};
function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
  } catch (e) { return null; }
  return null;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
function fmtUZS(n) {
  if (n === null || n === undefined || n === "") return null;
  if (S.hide) return "•••";
  return Number(n).toLocaleString(LOC(), { maximumFractionDigits: 0 }).replace(/,/g, " ") + (LANG === "ru" ? " сум" : " UZS");
}
function priceLine(m) {
  if (!m.price_min_uzs && !m.price_max_uzs) return "";
  if (S.hide) return "•••";
  if (m.price_min_uzs === m.price_max_uzs || !m.price_max_uzs) return fmtUZS(m.price_min_uzs || m.price_max_uzs);
  return tr("from {p}", { p: fmtUZS(m.price_min_uzs) });
}
const dark = () => document.documentElement.getAttribute("data-theme") === "dark" ||
  document.documentElement.classList.contains("sysdark");
const mono = () => (dark() ? MONO_WHITE : MONO_NAVY);
// The name a model is known by on the floor: its model name, else its collection, else its type.
function modelTitle(m) {
  return m.model_name || m.collection || typeName(m.retail_category) || m.article;
}
function modelSub(m) {
  const bits = [];
  if (m.collection && m.model_name && !String(m.model_name).toLowerCase().includes(String(m.collection).toLowerCase())) bits.push(m.collection);
  bits.push(typeName(m.retail_category));
  return bits.join(" · ");
}

/* --------------------------------------------------------------------- api */
async function call(action, payload = {}) {
  const body = { action, ...payload };
  if (S.session && action !== "unlock") body.token = S.session.token;
  let res;
  try {
    res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    setOffline(true);
    throw new Error(tr("No connection. Check the Wi-Fi and try again."));
  }
  setOffline(false);
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && action !== "unlock") lockDown(data.error);
    const err = new Error(data.error ? tr(data.error) : tr("Request failed ({n})", { n: res.status }));
    err.status = res.status;
    throw err;
  }
  return data;
}
function setOffline(v) {
  if (S.offline === v) return;
  S.offline = v;
  const host = $("#net");
  host.innerHTML = "";
  if (v) host.appendChild(el("div", { class: "netbar", role: "status", text: tr("No connection — the catalogue will catch up when it is back.") }));
}
window.addEventListener("online", () => { if (S.offline && !S.locked) route(); });

/* ------------------------------------------------------------------ routes
   Everything the screen shows is in the address, so the iPad's back button
   and a shared link both land on the same view:
     #/                          start
     #/brands  #/categories  #/types  #/collections[?brand=…]
     #/list?brand=…&type=…&q=…   the reference list
     #/model/<reference>         a model                                   */
function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
  const params = new URLSearchParams(qs || "");
  return { view: parts[0] || "start", arg: parts[1] || null, params };
}
function listHash(f) {
  const p = new URLSearchParams();
  for (const b of f.brands || []) p.append("brand", b);
  if (f.category) p.set("category", f.category);
  for (const t of f.types || []) p.append("type", t);
  for (const c of f.collections || []) p.append("collection", c);
  for (const g of f.genders || []) p.append("gender", g);
  if (f.stock && f.stock !== "all") p.set("stock", f.stock);
  if (f.q) p.set("q", f.q);
  if (f.pmin) p.set("pmin", f.pmin);
  if (f.pmax) p.set("pmax", f.pmax);
  if (f.incomplete) p.set("incomplete", "1");
  for (const x of f.metals || []) p.append("metal", x);
  for (const x of f.stones || []) p.append("stone", x);
  if (f.noStones) p.set("nostones", "1");
  for (const x of f.movements || []) p.append("movement", x);
  if (f.cmin) p.set("cmin", f.cmin);
  if (f.cmax) p.set("cmax", f.cmax);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  const s = p.toString();
  return "#/list" + (s ? "?" + s : "");
}
function filtersFrom(params) {
  const num = (v) => { const n = Number(String(v || "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
  return {
    brands: params.getAll("brand"),
    category: CATS[params.get("category")] ? params.get("category") : null,
    types: params.getAll("type").filter((t) => TYPES[t]),
    collections: params.getAll("collection"),
    genders: params.getAll("gender").filter((g) => GENDERS[g]),
    stock: ["in", "out", "transit"].includes(params.get("stock")) ? params.get("stock") : "all",
    q: params.get("q") || "",
    pmin: num(params.get("pmin")),
    pmax: num(params.get("pmax")),
    incomplete: params.get("incomplete") === "1",
    metals: params.getAll("metal").filter((x) => METAL_NAMES[x]),
    stones: params.getAll("stone").filter((x) => STONE_NAMES[x]),
    noStones: params.get("nostones") === "1",
    movements: params.getAll("movement").filter((x) => MOVEMENT_NAMES[x]),
    cmin: num(params.get("cmin")),
    cmax: num(params.get("cmax")),
    sort: SORTS.some(([k]) => k === params.get("sort")) ? params.get("sort") : "newest",
  };
}
function apiFilters(f) {
  return {
    brands: f.brands, category: f.category, retail_categories: f.types, collections: f.collections, genders: f.genders,
    stock: f.stock, q: f.q || undefined, sort: f.sort, incomplete: f.incomplete || undefined,
    price_min: f.pmin ? Math.round(f.pmin * 1e6) : undefined, price_max: f.pmax ? Math.round(f.pmax * 1e6) : undefined,
    metals: f.metals && f.metals.length ? f.metals : undefined, stones: f.stones && f.stones.length ? f.stones : undefined,
    no_stones: f.noStones || undefined, movements: f.movements && f.movements.length ? f.movements : undefined,
    case_min: f.cmin || undefined, case_max: f.cmax || undefined,
  };
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
window.addEventListener("hashchange", () => { S.layerPushed = false; closeAllLayers(); route(); });

async function route() {
  if (S.locked) return render();
  const r = parseHash();
  if (r.view === "list") {
    const f = filtersFrom(r.params);
    const key = JSON.stringify(apiFilters(f));
    if (!S.list || S.list.key !== key) {
      S.list = { key, f, rows: null, total: 0, loading: true };
      render();
      try {
        const d = await call("list", { ...apiFilters(f), limit: PAGE, offset: 0 });
        if (S.list.key !== key) return;
        S.list.rows = d.rows; S.list.total = d.total;
      } catch (e) { if (S.list.key === key) S.list.error = e.message; }
      if (S.list.key === key) S.list.loading = false;
    }
  } else if (r.view === "model" && r.arg) {
    if (!S.model || S.model.id !== r.arg) {
      S.model = { id: r.arg, data: null };
      render();
      try { S.model.data = await call("model", { model_id: r.arg }); rememberModel(r.arg); }
      catch (e) { S.model.error = e.message; }
    }
  } else if (r.view === "start") {
    loadStart();
  } else if (r.view === "reports") {
    const st = ["open", "fixed", "rejected"].includes(r.params.get("status")) ? r.params.get("status") : "open";
    if (!S.reports || S.reports.status !== st) { loadReports(st); return; }
  }
  render();
  if (r.view !== "list" || !S.list || !S.list.keepScroll) window.scrollTo(0, 0);
  if (S.list) S.list.keepScroll = false;
}

/* --------------------------------------------------------- recently opened */
function recentIds() {
  try { const a = JSON.parse(store(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : []; }
  catch (e) { return []; }
}
function rememberModel(id) {
  const ids = [id, ...recentIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  store(RECENT_KEY, JSON.stringify(ids));
  S.recent = null;
}
async function loadStart() {
  const ids = recentIds();
  if (ids.length && !S.recent) {
    S.recent = { rows: null };
    call("list", { ids, limit: RECENT_MAX, sort: "reference" }).then((d) => {
      const byId = new Map(d.rows.map((m) => [m.model_id, m]));
      S.recent = { rows: ids.map((i) => byId.get(i)).filter(Boolean) };
      if (parseHash().view === "start") render();
    }).catch(() => { S.recent = { rows: [] }; });
  }
  if (!S.arrivals) {
    S.arrivals = { rows: null };
    call("list", { stock: "in", sort: "newest", limit: 8 }).then((d) => {
      S.arrivals = { rows: d.rows };
      if (parseHash().view === "start") render();
    }).catch(() => { S.arrivals = { rows: [] }; });
  }
}

/* ------------------------------------------------------------------ render */
function render() {
  document.documentElement.lang = LANG;
  document.title = "Delardi " + tr("Catalogue");
  const app = $("#app");
  app.innerHTML = "";
  app.className = S.locked ? "gated" : "";
  app.setAttribute("aria-hidden", S.locked ? "true" : "false");
  const header = renderHeader();
  const band = clientBand();
  if (band) header.appendChild(band);
  app.appendChild(header);
  document.documentElement.classList.toggle("client", !!S.client && !S.locked);
  const main = el("main", { id: "main" });
  app.appendChild(main);
  if (S.offlineBoot) { removeGate(); app.className = ""; main.append(...renderOffline()); return; }
  if (S.locked) { main.appendChild(renderStartShell()); renderGate(S.gateMsg); return; }
  removeGate();
  const r = parseHash();
  const add = main.append.bind(main);
  main.append = (...kids) => add(...kids.filter(Boolean));
  if (r.view === "brands") main.append(...renderBrands());
  else if (r.view === "categories") main.append(...renderCategories());
  else if (r.view === "types") main.append(...renderTypes());
  else if (r.view === "collections") main.append(...renderCollections(r.params.get("brand")));
  else if (r.view === "list") main.append(...renderList());
  else if (r.view === "model") main.append(...renderModel());
  else if (r.view === "reports") main.append(...renderReports());
  else main.append(...renderStart());
  if (S.sheet) renderSheet();
  if (S.report) renderReport();
  syncSticky();
}

function renderHeader() {
  const hideBtn = el("button", {
    class: "hbtn", type: "button", "aria-pressed": S.hide ? "true" : "false",
    title: tr(S.hide ? "Show amounts" : "Hide amounts"), "aria-label": tr(S.hide ? "Show amounts" : "Hide amounts"),
    onclick: () => { S.hide = !S.hide; store(HIDE_KEY, S.hide ? "1" : null); toast(tr(S.hide ? "Amounts hidden." : "Amounts shown.")); render(); },
  }, [svg(S.hide ? ICON.eyeOff : ICON.eye)]);
  return el("header", { class: "top" }, [
    el("div", { class: "top-row" }, [
      el("a", { class: "brand", href: "#/", "aria-label": tr("Home") }, [
        el("img", { class: "mark", src: LOGO_WORDMARK, alt: "Delardi" }),
        el("span", { class: "rule" }),
        el("div", { class: "words" }, [el("div", { class: "title", text: tr("Catalogue") }), el("div", { class: "sub", text: tr("Watches & jewellery") })]),
      ]),
      el("span", { class: "spacer" }),
      S.locked ? null : clientButton(),
      S.locked ? null : hideBtn,
      langSwitch(),
      el("button", { class: "hbtn hide-phone", type: "button", title: tr("Switch between light and dark"), "aria-label": tr("Switch between light and dark"), onclick: () => { toggleTheme(); render(); } }, [svg(ICON.moon)]),
      S.locked ? null : el("button", { class: "hbtn", type: "button", title: tr("Lock"), "aria-label": tr("Lock"), onclick: () => { lockDown(); toast(tr("Locked.")); } }, [svg(ICON.lock)]),
      el("a", { class: "hbtn hide-phone", href: "../", text: tr("All tools") }),
    ]),
  ]);
}
function langSwitch() {
  return el("div", { class: "lang", role: "group", "aria-label": "Language" }, ["en", "ru"].map((l) =>
    el("button", { type: "button", "aria-pressed": LANG === l ? "true" : "false", onclick: () => setLang(l), text: l.toUpperCase() })));
}
function crumbs(items) {
  const kids = [];
  items.forEach((it, i) => {
    if (i) kids.push(el("span", { class: "sep", text: "›" }));
    kids.push(it.href ? el("a", { href: it.href, text: it.text }) : el("span", { text: it.text }));
  });
  return el("nav", { class: "crumbs", "aria-label": "Breadcrumbs" }, kids);
}

/* ------------------------------------------------------------------- start */
function searchBox(initial) {
  const input = el("input", { type: "search", id: "q-start", value: initial || "", placeholder: tr("Search by reference, serial, name, collection, stone, metal…"), "aria-label": tr("Find a piece"), autocomplete: "off", enterkeyhint: "search" });
  const form = el("form", { class: "bigsearch", role: "search", onsubmit: (e) => {
    e.preventDefault();
    const q = input.value.trim();
    go(listHash({ q }));
  } }, [svg(ICON.search, "ico"), input, el("button", { class: "go", type: "submit", text: tr("Search") })]);
  return form;
}
function renderStartShell() {
  return el("div", { class: "hero" }, [el("img", { class: "mono", src: mono(), alt: "" }), el("h1", { text: tr("Find a piece") })]);
}
function renderStart() {
  const ref = S.ref || {};
  const brands = ref.brands || [];
  const inStock = brands.reduce((a, b) => a + b.in_stock, 0);
  const collections = ref.collections || [];
  const entry = el("div", { class: "entry" }, [
    el("a", { href: "#/brands" }, [el("div", { class: "k", text: tr("Brands") }), el("div", { class: "n", text: tr("{n} brands", { n: brands.length }) }), el("div", { class: "c", text: brands.slice(0, 4).map((b) => b.brand).join(" · ") + (brands.length > 4 ? " …" : "") })]),
    el("a", { href: "#/categories" }, [el("div", { class: "k", text: tr("Category") }), el("div", { class: "n", text: tr("{n} categories", { n: Object.keys(catCounts()).length }) }), el("div", { class: "c", text: CAT_ORDER.map(catName).join(" · ") })]),
    el("a", { href: "#/types" }, [el("div", { class: "k", text: tr("Retail category") }), el("div", { class: "n", text: tr("{n} types", { n: new Set(((S.ref && S.ref.categories) || []).map((c) => c.retail_category)).size }) }), el("div", { class: "c", text: tr("Rings, earrings, necklaces, watches…") })]),
    el("a", { href: "#/collections" }, [el("div", { class: "k", text: tr("Collections") }), el("div", { class: "n", text: tr("{n} collections", { n: collections.length }) }), el("div", { class: "c", text: collections.filter((c) => c.in_stock).slice(0, 3).map((c) => c.collection).join(" · ") + " …" })]),
  ]);
  const out = [
    el("div", { class: "hero" }, [el("img", { class: "mono", src: mono(), alt: "" }), el("h1", { text: tr("Find a piece") }),
      S.client ? null : el("p", { text: tr("{s} in stock · {t} models", { s: inStock, t: brands.reduce((a, b) => a + b.models, 0) }) }),
      reportsLink() ? el("p", {}, [reportsLink()]) : null]),
    searchBox(""),
    entry,
  ];
  if (S.recent && S.recent.rows && S.recent.rows.length) {
    out.push(el("div", { class: "section-h" }, [el("h2", { text: tr("Opened recently") }),
      el("button", { class: "linkbtn", type: "button", onclick: () => { store(RECENT_KEY, null); S.recent = null; render(); }, text: tr("Clear") })]));
    out.push(el("div", { class: "cards", style: "margin-bottom:30px" }, S.recent.rows.slice(0, 8).map(card)));
  }
  out.push(el("div", { class: "section-h" }, [el("h2", { text: tr("New arrivals") }), el("a", { href: listHash({ stock: "in" }), text: tr("See all") })]));
  if (!S.arrivals || !S.arrivals.rows) out.push(el("div", { class: "cards" }, Array.from({ length: 4 }, () => el("div", { class: "skel" }))));
  else out.push(el("div", { class: "cards" }, S.arrivals.rows.map(card)));
  if (ref.run) {
    const d = ref.run.source_built ? new Date(ref.run.source_built) : new Date(ref.run.run_at);
    out.push(el("p", { class: "foot-note", text: tr("Data as of {date}", { date: d.toLocaleDateString(LOC(), { day: "numeric", month: "long", year: "numeric" }) }) }));
  }
  return out;
}

/* ------------------------------------------------------------------- tiles */
// v9 (26 Oct 2026): brand logos, one-colour navy PNGs in catalogue/brands/ (light in the dark theme).
const BRAND_LOGOS = ["Bulgari", "Chimento", "Chronoswiss", "Cyrus", "Dinh Van", "Genius", "Gerald Charles", "Girard-Perregaux",
  "Hublot", "Leo Pizzo", "Messika", "Palmiero", "Stephen Webster"];
const logoSlug = (b) => b.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const brandLogo = (b) => (BRAND_LOGOS.includes(b) ? "brands/" + logoSlug(b) + ".png" : null);
function tile(href, name, meta, opts = {}) {
  const art = opts.logo
    ? [el("img", { class: "logo", src: opts.logo, alt: opts.word || name, loading: "lazy" })]
    : opts.word ? [el("div", { class: "word", text: opts.word })] : [el("img", { src: mono(), alt: "" })];
  return el("a", { class: "tile" + (opts.dim ? " dim" : "") + (opts.logo ? " has-logo" : ""), href }, [
    el("div", { class: "art" }, art),
    el("div", { class: "body" }, [el("div", { class: "name", text: name }), S.client ? null : el("div", { class: "meta", text: meta })]),
  ]);
}
const stockMeta = (s, t) => tr("{s} in stock · {t} models", { s, t });
function pageHead(title, sub, trail) {
  return [crumbs([{ text: tr("Home"), href: "#/" }, ...(trail || []), { text: title }]),
    el("h1", { class: "page", text: title }), sub ? el("p", { class: "page-sub", text: sub }) : null, el("hr", { class: "hair" })];
}
function renderBrands() {
  const brands = (S.ref && S.ref.brands) || [];
  return [...pageHead(tr("Brands"), null),
    el("div", { class: "tiles" }, brands.map((b) => tile(listHash({ brands: [b.brand] }), b.brand, stockMeta(b.in_stock, b.models), { word: b.brand, logo: brandLogo(b.brand), dim: !b.in_stock })))];
}
function catCounts() {
  const by = {};
  for (const c of (S.ref && S.ref.categories) || []) {
    const k = c.category; by[k] = by[k] || { models: 0, in_stock: 0 };
    by[k].models += c.models; by[k].in_stock += c.in_stock;
  }
  return by;
}
function renderCategories() {
  const by = catCounts();
  return [...pageHead(tr("Category"), null),
    el("div", { class: "tiles" }, CAT_ORDER.filter((c) => by[c]).map((c) => tile(listHash({ category: c }), catName(c), stockMeta(by[c].in_stock, by[c].models), { word: catName(c) })))];
}
function renderTypes() {
  const cats = (S.ref && S.ref.categories) || [];
  const out = [...pageHead(tr("Retail category"), null)];
  for (const c of CAT_ORDER) {
    const rows = TYPE_ORDER.map((t) => cats.find((x) => x.category === c && x.retail_category === t)).filter(Boolean);
    if (!rows.length) continue;
    out.push(el("h2", { class: "group-h" }, [catName(c)]));
    out.push(el("div", { class: "tiles" }, rows.map((x) => tile(listHash({ types: [x.retail_category] }), typeName(x.retail_category, true), stockMeta(x.in_stock, x.models), { word: typeName(x.retail_category, true), dim: !x.in_stock }))));
  }
  return out;
}
function renderCollections(brandSel) {
  const all = (S.ref && S.ref.collections) || [];
  const brands = [...new Set(all.map((c) => c.brand))];
  const chips = el("div", { class: "chiprow" }, [
    el("a", { class: "chip", href: "#/collections", "aria-pressed": brandSel ? "false" : "true", text: tr("All brands") }),
    ...brands.map((b) => el("a", { class: "chip", href: "#/collections?brand=" + encodeURIComponent(b), "aria-pressed": brandSel === b ? "true" : "false" },
      [b, el("span", { class: "cnt", text: String(all.filter((c) => c.brand === b).length) })])),
  ]);
  const out = [...pageHead(tr("Collections"), null), chips];
  for (const b of brands) {
    if (brandSel && b !== brandSel) continue;
    const rows = all.filter((c) => c.brand === b).sort((x, y) => (y.in_stock > 0) - (x.in_stock > 0) || x.collection.localeCompare(y.collection));
    out.push(el("h2", { class: "group-h" }, [b, el("span", { class: "c", text: tr("{n} collections", { n: rows.length }) })]));
    out.push(el("div", { class: "tiles" }, rows.map((c) => tile(listHash({ brands: [b], collections: [c.collection] }), c.collection, stockMeta(c.in_stock, c.models), { word: c.collection, dim: !c.in_stock }))));
  }
  return out;
}

/* -------------------------------------------------------------------- list */
function card(m) {
  // v8 (26 Oct 2026): a model shipped by the brand but not in Colibri yet is "in transit", not sold out.
  const transit = !m.in_stock && m.qty_transit > 0;
  const out = !m.in_stock && !transit;
  const dots = (m.colours && m.colours.length > 1) ? el("div", { class: "dots", "aria-label": tr("Colours") }, m.colours.map((c) => {
    const code = (c.colour_code || "").toUpperCase();
    const name = COLOUR_NAMES[code] ? COLOUR_NAMES[code][LANG === "ru" ? 1 : 0] : (c.colour_code || "");
    return el("span", { class: "dot " + (COLOUR_NAMES[code] ? code : "other") + (c.in_stock || c.qty_transit > 0 ? "" : " out"), title: name });
  })) : null;
  const tbc = m.missing_crucial && m.missing_crucial.length;
  return el("a", { class: "card" + (out ? " out" : ""), href: "#/model/" + encodeURIComponent(m.model_id) }, [
    photoBox(m),
    tbc && !S.client ? el("span", { class: "flagmark", title: tr("Key details TBC"), text: tr("TBC") }) : null,
    el("div", { class: "b" }, [
      el("div", { class: "brandname", text: m.brand }),
      el("div", { class: "nm", text: modelTitle(m) }),
      el("div", { class: "mat", text: [modelSub(m), cardMaterial(m)].filter(Boolean).join(" · ") }),
      el("div", { class: "ref", text: tr("Ref.") + " " + m.article }),
      dots,
      el("div", { class: "row" }, [
        el("span", { class: "price", text: priceLine(m) }),
        el("span", { class: "stock " + (out ? "out" : transit ? "transit" : "in"), text: out ? tr("Sold out") : transit ? tr("In transit") : tr("In stock") }),
      ]),
    ]),
  ]);
}
// One short material for a card: the metals found for the model, else what Colibri says.
function cardMaterial(m) {
  const keys = (m.metal_keys || []).filter((k) => m.category === "accessory" || !["rubber", "leather"].includes(k));
  if (keys.length) return keys.slice(0, 2).map((k, i) => (i ? nm(METAL_NAMES, k).toLowerCase() : nm(METAL_NAMES, k))).join(", ");
  return cap(m.material);
}
// v6 (25 Oct 2026): the first photo of the model, from the website, when there is one.
function photoUrl(path) {
  const base = (S.ref && S.ref.photo_base) || (S.model && S.model.data && S.model.data.photo_base) || "";
  return base && path ? base + path.split("/").map(encodeURIComponent).join("/") : null;
}
function photoBox(m) {
  const url = photoUrl(m.image_key);
  if (!url) return el("div", { class: "ph" }, [el("img", { src: mono(), alt: "" }), el("span", { text: tr("Photo coming soon") })]);
  return el("div", { class: "ph photo" }, [el("img", { src: url, alt: modelTitle(m), loading: "lazy", decoding: "async" })]);
}
function activeFilterCount(f) {
  return f.brands.length + (f.category ? 1 : 0) + f.types.length + f.collections.length + f.genders.length +
    (f.pmin ? 1 : 0) + (f.pmax ? 1 : 0) + (f.incomplete ? 1 : 0) + (f.metals || []).length + (f.stones || []).length +
    (f.noStones ? 1 : 0) + (f.movements || []).length + (f.cmin ? 1 : 0) + (f.cmax ? 1 : 0);
}
function listTitle(f) {
  if (f.collections.length === 1) return f.collections[0];
  if (f.brands.length === 1 && !f.types.length && !f.category) return f.brands[0];
  if (f.types.length === 1) return (f.brands.length === 1 ? f.brands[0] + " · " : "") + typeName(f.types[0], true);
  if (f.category) return (f.brands.length === 1 ? f.brands[0] + " · " : "") + catName(f.category);
  if (f.q) return tr("Search: “{q}”", { q: f.q });
  if (f.stock === "in") return tr("Everything in stock");
  if (f.stock === "transit") return tr("In transit");
  return tr("Catalogue");
}
function renderList() {
  const L = S.list || { f: filtersFrom(new URLSearchParams()), rows: null, total: 0 };
  const f = L.f;
  const set = (patch) => { S.list.keepScroll = true; go(listHash({ ...f, ...patch })); };
  // Search in place: the address follows without filling the history.
  const q = el("input", { type: "search", value: f.q, placeholder: tr("Search in this list"), "aria-label": tr("Search in this list"), autocomplete: "off", enterkeyhint: "search",
    oninput: (e) => {
      clearTimeout(renderList._t);
      const v = e.target.value;
      renderList._t = setTimeout(() => {
        const h = listHash({ ...f, q: v.trim() });
        try { history.replaceState(null, "", h); } catch (err) { /* ignore */ }
        const pos = e.target.selectionStart;
        route().then(() => { const n = $("#q-list"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } } });
      }, 380);
    } });
  q.id = "q-list";
  const n = activeFilterCount(f);
  const sort = el("select", { class: "btn hide-phone", "aria-label": tr("Sort"), onchange: (e) => set({ sort: e.target.value }) },
    SORTS.filter(([k]) => !S.client || k !== "completeness").map(([k, label]) => el("option", { value: k, selected: f.sort === k ? "selected" : null, text: tr(label) })));
  const bar = el("div", { class: "listbar" }, [
    el("div", { class: "search" }, [svg(ICON.search), q]),
    el("div", { class: "seg", role: "group", "aria-label": tr("Stock") }, [["all", "All"], ["in", "In stock"]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": f.stock === k ? "true" : "false", onclick: () => set({ stock: k }), text: tr(label) }))),
    el("button", { class: "btn", type: "button", onclick: () => openSheet(f) }, [svg(ICON.filter), tr("Filters"), n ? el("span", { class: "badge", text: String(n) }) : null]),
    sort,
  ]);
  const pills = el("div", { class: "pills" }, pillsFor(f, set));
  const out = [
    crumbs([{ text: tr("Home"), href: "#/" }, { text: listTitle(f) }]),
    el("h1", { class: "page", text: listTitle(f) }),
    bar,
  ];
  if (L.error) { out.push(el("div", { class: "empty" }, [el("div", { class: "serif", text: L.error }), S.offline ? retryButton() : null])); return out; }
  out.push(el("div", { class: "count-line" }, [L.rows ? el("span", { text: tr("{n} models", { n: L.total }) }) : el("span", { text: "…" }), pills]));
  if (!L.rows) { out.push(el("div", { class: "cards" }, Array.from({ length: 8 }, () => el("div", { class: "skel" })))); return out; }
  if (!L.rows.length) {
    out.push(el("div", { class: "empty" }, [el("div", { class: "serif", text: tr("Nothing matches.") }), el("div", { text: tr("Try fewer words, or take a filter off.") }),
      n || f.q ? el("p", {}, [el("a", { class: "btn", href: listHash({ stock: f.stock }), text: tr("Clear all") })]) : null]));
    return out;
  }
  out.push(el("div", { class: "cards" }, L.rows.map(card)));
  if (L.rows.length < L.total) {
    const more = el("button", { class: "btn", type: "button", onclick: async () => {
      more.disabled = true; more.textContent = "…";
      try {
        const d = await call("list", { ...apiFilters(f), limit: PAGE, offset: L.rows.length });
        L.rows = L.rows.concat(d.rows); L.total = d.total;
      } catch (e) { toast(e.message); }
      const y = window.scrollY; render(); window.scrollTo(0, y);
    } }, [tr("Show more")]);
    out.push(el("div", { class: "more" }, [el("span", { class: "count-line", style: "margin:0 14px 0 0", text: tr("Showing {a} of {n}", { a: L.rows.length, n: L.total }) }), more]));
  }
  return out;
}
function pillsFor(f, set) {
  const p = [];
  const pill = (label, patch) => p.push(el("button", { class: "chip", type: "button", "aria-pressed": "true", onclick: () => set(patch) }, [label, el("span", { class: "x", "aria-hidden": "true", text: "×" })]));
  f.brands.forEach((b) => pill(b, { brands: f.brands.filter((x) => x !== b), collections: [] }));
  if (f.category) pill(catName(f.category), { category: null });
  f.types.forEach((t) => pill(typeName(t, true), { types: f.types.filter((x) => x !== t) }));
  f.collections.forEach((c) => pill(c, { collections: f.collections.filter((x) => x !== c) }));
  f.genders.forEach((g) => pill(tr(GENDERS[g]), { genders: f.genders.filter((x) => x !== g) }));
  if (f.pmin) pill(tr("price from {p} mln", { p: f.pmin }), { pmin: null });
  if (f.pmax) pill(tr("price to {p} mln", { p: f.pmax }), { pmax: null });
  if (f.incomplete) pill(tr("Key details TBC"), { incomplete: false });
  (f.metals || []).forEach((x) => pill(nm(METAL_NAMES, x), { metals: f.metals.filter((y) => y !== x) }));
  (f.stones || []).forEach((x) => pill(nm(STONE_NAMES, x), { stones: f.stones.filter((y) => y !== x) }));
  if (f.noStones) pill(tr("No stones"), { noStones: false });
  (f.movements || []).forEach((x) => pill(nm(MOVEMENT_NAMES, x), { movements: f.movements.filter((y) => y !== x) }));
  if (f.cmin) pill("≥ " + f.cmin + " " + (LANG === "ru" ? "мм" : "mm"), { cmin: null });
  if (f.cmax) pill("≤ " + f.cmax + " " + (LANG === "ru" ? "мм" : "mm"), { cmax: null });
  if (f.q) pill("“" + f.q + "”", { q: "" });
  return p;
}

/* ------------------------------------------------------------ filter sheet */
function openSheet(f) { S.sheet = JSON.parse(JSON.stringify(f)); layerOpened(); renderSheet(); }
function closeSheet(silent, navHash) {
  S.sheet = null; $("#layer").innerHTML = "";
  layerClosed(navHash);
  if (!silent) { const b = $(".listbar .btn"); if (b) b.focus(); }
}
function renderSheet() {
  const f = S.sheet;
  const layer = $("#layer");
  layer.innerHTML = "";
  if (!f) return;
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chip = (label, on, onclick, cnt) => el("button", { class: "chip", type: "button", "aria-pressed": on ? "true" : "false", onclick }, [label, cnt !== undefined ? el("span", { class: "cnt", text: String(cnt) }) : null]);
  const ref = S.ref || {};
  const grp = (label, kids) => el("div", { class: "grp" }, [el("div", { class: "lbl", text: label }), kids]);
  const rerender = () => { const y = $(".sheet .scroll") ? $(".sheet .scroll").scrollTop : 0; renderSheet(); const s = $(".sheet .scroll"); if (s) s.scrollTop = y; };
  const cats = ref.categories || [];
  const typesAvail = TYPE_ORDER.filter((t) => cats.some((c) => c.retail_category === t && (!f.category || c.category === f.category)));
  const colls = (ref.collections || []).filter((c) => f.brands.length && f.brands.includes(c.brand));
  const by = catCounts();
  // Watch filters only where watches can be in the list.
  const showWatch = !f.category ? (!f.types.length || f.types.includes("watch")) : f.category === "watch";
  const cmin = el("input", { type: "number", inputmode: "decimal", min: "0", placeholder: tr("from"), value: f.cmin || "", "aria-label": tr("Case size, mm") + " " + tr("from"), oninput: (e) => { f.cmin = Number(e.target.value) || null; } });
  const cmax = el("input", { type: "number", inputmode: "decimal", min: "0", placeholder: tr("to"), value: f.cmax || "", "aria-label": tr("Case size, mm") + " " + tr("to"), oninput: (e) => { f.cmax = Number(e.target.value) || null; } });
  const pmin = el("input", { type: "number", inputmode: "decimal", min: "0", placeholder: tr("from"), value: f.pmin || "", "aria-label": tr("from"), oninput: (e) => { f.pmin = Number(e.target.value) || null; } });
  const pmax = el("input", { type: "number", inputmode: "decimal", min: "0", placeholder: tr("to"), value: f.pmax || "", "aria-label": tr("to"), oninput: (e) => { f.pmax = Number(e.target.value) || null; } });
  const sheet = el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": tr("Filters") }, [
    el("header", {}, [el("h2", { text: tr("Filters") }), el("button", { class: "btn", type: "button", onclick: () => closeSheet(), text: tr("Close") })]),
    el("div", { class: "scroll" }, [
      el("div", { class: "phone-only" }, [grp(tr("Sort"), el("div", { class: "chiprow" }, SORTS.map(([k, l]) => chip(tr(l), f.sort === k, () => { f.sort = k; rerender(); }))))]),
      grp(tr("Stock"), el("div", { class: "chiprow" }, [["all", "All"], ["in", "In stock"], ["transit", "In transit"], ["out", "Sold out"]].map(([k, l]) => chip(tr(l), f.stock === k, () => { f.stock = k; rerender(); })))),
      grp(tr("Category"), el("div", { class: "chiprow" }, CAT_ORDER.filter((c) => by[c]).map((c) => chip(catName(c), f.category === c, () => {
        f.category = f.category === c ? null : c;
        f.types = f.types.filter((t) => !f.category || TYPES[t].cat === f.category); rerender();
      }, by[c].in_stock)))),
      grp(tr("Retail category"), el("div", { class: "chiprow" }, typesAvail.map((t) => chip(typeName(t, true), f.types.includes(t), () => { f.types = toggle(f.types, t); rerender(); },
        cats.filter((c) => c.retail_category === t).reduce((a, c) => a + c.in_stock, 0))))),
      grp(tr("Brands"), el("div", { class: "chiprow" }, (ref.brands || []).map((b) => chip(b.brand, f.brands.includes(b.brand), () => {
        f.brands = toggle(f.brands, b.brand);
        f.collections = f.collections.filter((c) => (ref.collections || []).some((x) => x.collection === c && f.brands.includes(x.brand))); rerender();
      }, b.in_stock)))),
      colls.length ? grp(tr("Collection"), el("div", { class: "chiprow" }, colls.map((c) => chip(c.collection, f.collections.includes(c.collection), () => { f.collections = toggle(f.collections, c.collection); rerender(); }, c.in_stock)))) : null,
      (ref.metals || []).length ? grp(tr("Metal"), el("div", { class: "chiprow" }, ref.metals.filter((x) => METAL_NAMES[x.key] && x.in_stock).map((x) =>
        chip(nm(METAL_NAMES, x.key), f.metals.includes(x.key), () => { f.metals = toggle(f.metals, x.key); rerender(); }, x.in_stock)))) : null,
      (ref.stones || []).length ? grp(tr("Stones"), el("div", { class: "chiprow" }, [
        ...ref.stones.filter((x) => STONE_NAMES[x.key] && x.in_stock).map((x) => chip(nm(STONE_NAMES, x.key), f.stones.includes(x.key), () => { f.stones = toggle(f.stones, x.key); f.noStones = false; rerender(); }, x.in_stock)),
        chip(tr("No stones"), f.noStones, () => { f.noStones = !f.noStones; if (f.noStones) f.stones = []; rerender(); }),
      ])) : null,
      showWatch ? grp(tr("Movement"), el("div", { class: "chiprow" }, (ref.movements || []).map((x) =>
        chip(nm(MOVEMENT_NAMES, x.key), f.movements.includes(x.key), () => { f.movements = toggle(f.movements, x.key); rerender(); }, x.in_stock)))) : null,
      showWatch ? grp(tr("Case size, mm"), el("div", { class: "range" }, [cmin, el("span", { text: "–" }), cmax])) : null,
      grp(tr("Gender"), el("div", { class: "chiprow" }, Object.entries(GENDERS).map(([k, l]) => chip(tr(l), f.genders.includes(k), () => { f.genders = toggle(f.genders, k); rerender(); })))),
      grp(tr("Price, million UZS"), el("div", { class: "range" }, [pmin, el("span", { text: "–" }), pmax])),
      S.client ? null : el("div", { class: "grp" }, [el("label", { class: "check" }, [el("input", { type: "checkbox", checked: f.incomplete ? "checked" : null, onchange: (e) => { f.incomplete = e.target.checked; } }), tr("Only models with key details still TBC")])]),
    ]),
    el("footer", {}, [
      el("button", { class: "btn", type: "button", onclick: () => { S.sheet = { ...filtersFrom(new URLSearchParams()), q: f.q, sort: f.sort }; rerender(); }, text: tr("Clear all") }),
      el("button", { class: "btn primary", type: "button", onclick: () => { const h = listHash(S.sheet); closeSheet(true, h); }, text: tr("Done") }),
    ]),
  ]);
  layer.append(el("div", { class: "sheet-scrim", onclick: () => closeSheet() }), sheet);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) closeSheet(); });

/* -------------------------------------------------------------------- gate */
function removeGate() { const g = $("#gate"); if (g) g.remove(); }
function renderGate(message) {
  removeGate();
  const err = el("div", { class: "err", role: "alert", style: message ? "" : "display:none", text: message ? tr(message) : "" });
  const pass = el("input", { id: "gate-pass", type: "password", autocomplete: "current-password", inputmode: "text" });
  const btn = el("button", { class: "btn primary go", type: "submit", text: tr("Open the catalogue") });
  const submit = async (e) => {
    e.preventDefault();
    const code = pass.value;
    if (!code) { err.textContent = tr("Enter your passcode."); err.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = tr("Checking…");
    try {
      const s = await call("unlock", { passcode: code });
      S.session = s; store(SESSION_KEY, JSON.stringify(s)); S.gateMsg = null; S.lastActive = 0; store(IDLE_KEY, null);
      await loadRef();
      S.locked = false;
      activeNow();
      route();
    } catch (ex) {
      err.textContent = ex.message; err.style.display = "block";
      btn.disabled = false; btn.textContent = tr("Open the catalogue");
      pass.value = ""; pass.focus();
    }
  };
  const card = el("form", { class: "gate-card", onsubmit: submit }, [
    el("div", { class: "gate-mast" }, [el("img", { src: LOGO_WORDMARK, alt: "Delardi" }),
      el("div", { class: "gate-tools" }, [langSwitch(), el("a", { class: "gate-home", href: "../", text: tr("All tools") })])]),
    el("h2", { text: tr("Catalogue") }),
    el("p", { class: "lead", text: tr("The catalogue is for the Delardi team. Enter your personal passcode to open it.") }),
    err,
    el("label", { for: "gate-pass" }, [el("span", { text: tr("Your passcode") }), pass]),
    btn,
    el("p", { class: "gate-foot", text: tr("Nothing loads until your passcode is accepted. A Board or CRM passcode opens the catalogue only if you have been given catalogue access.") }),
  ]);
  document.body.appendChild(el("div", { class: "gate", id: "gate", role: "dialog", "aria-modal": "true", "aria-label": tr("Unlock") }, [card]));
  setTimeout(() => pass.focus(), 60);
}
function lockDown(message) {
  S.session = null; store(SESSION_KEY, null);
  S.locked = true; S.ref = null; S.list = null; S.model = null; S.recent = null; S.arrivals = null; S.sheet = null;
  S.report = null; S.reports = null; S.client = false; store(CLIENT_KEY, null);
  if (S.layerPushed) { S.layerPushed = false; try { history.back(); } catch (e) { /* ignore */ } }
  S.gateMsg = message || null;
  $("#layer").innerHTML = "";
  render();
}
async function loadRef() { S.ref = await call("reference"); }

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
  const next = mode === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark") : mode === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  applyTheme();
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { applyTheme(); render(); });

/* -------------------------------------------------------------------- init */
(async function boot() {
  applyTheme();
  document.documentElement.lang = LANG;
  S.hide = store(HIDE_KEY) === "1";
  S.client = store(CLIENT_KEY) === "1";
  try {
    const raw = store(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && s.token && new Date(s.expires_at).getTime() > Date.now()) S.session = s;
  } catch (e) { /* ignore */ }
  // An iPad or phone left unused past the idle lock asks again, even if the page was closed in between.
  if (S.session && idleExpired()) {
    S.session = null; store(SESSION_KEY, null); store(IDLE_KEY, null); store(CLIENT_KEY, null); S.client = false;
    S.gateMsg = tr("Locked after {n} minutes without use.", { n: IDLE_MIN });
  }
  if (S.session) {
    try { await loadRef(); S.locked = false; }
    catch (e) {
      // Refused: the passcode again. No answer at all: keep the session and wait for the connection.
      if (e.status) { S.session = null; store(SESSION_KEY, null); } else S.offlineBoot = true;
    }
  }
  if (S.locked) render(); else { activeNow(); route(); }
})();
