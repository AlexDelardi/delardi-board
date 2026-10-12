/* ===========================================================================
   Floor and tablet (Phase 5, steps 1–3)
   The same page, shaped for a phone on the shop floor and for an iPad:
   - Back behaves: an open card, form or menu is a step in the browser's
     history, so Android's back button and iPhone's swipe-back close it
     instead of leaving the tool.
   - On a phone the header is one compact row with a ☰ menu holding the
     views, the filters and the settings (the Weekly Board's pattern); the
     counts fold away until asked for.
   - The client card opens on an "at a glance" overview on touch screens,
     with Overview · Purchases · Clean-up · History tabs and "Add note"
     pinned at the bottom. Amounts can be hidden with one tap.
   - Finding a client: search first, shortcuts (birthdays this week, cannot
     lose, shared list, do-not-contact left out) and the clients recently
     opened on this device (kept as references only; names are fetched).
   - iPad: client cards in two columns in portrait; in landscape the list and
     the open card sit side by side.
   Nothing here changes the data rules: sellers as labels. (Phone numbers
   reach the page since v11, for everyone with CRM access: see personal.js.)
   ========================================================================= */
Object.assign(RU, {
  "Menu": "Меню",
  "Close the menu": "Закрыть меню",
  "Filters": "Фильтры",
  "Settings": "Настройки",
  "Language": "Язык",
  "Theme": "Тема",
  "Light": "Светлая",
  "Dark": "Тёмная",
  "Hide amounts": "Скрыть суммы",
  "Show amounts": "Показать суммы",
  "Amounts hidden on this device.": "Суммы скрыты на этом устройстве.",
  "Amounts shown.": "Суммы показаны.",
  "Signed in as {name}": "Вход: {name}",
  "All tools": "Все инструменты",
  "Show counts": "Показать сводку",
  "Hide counts": "Скрыть сводку",
  "Shortcuts": "Быстрый выбор",
  "Birthdays this week": "Дни рождения на неделе",
  "Cannot lose": "Нельзя потерять",
  "Shared list": "Общий список",
  "Do-not-contact left out": "Без «не беспокоить»",
  "Recently opened": "Недавно открытые",
  "birthdays in the next 7 days": "дни рождения в ближайшие 7 дней",
  "cannot lose": "нельзя потерять",
  "shared list": "общий список",
  "do-not-contact left out": "без «не беспокоить»",
  "Overview": "Обзор",
  "Clean-up": "Проверка",
  "History": "История",
  "Card sections": "Разделы карточки",
  "At a glance": "Коротко",
  "Last visit": "Последний визит",
  "+{n} more": "ещё {n}",
  "{n} visits": "визитов: {n}",
  "Brands bought": "Купленные бренды",
  "Birthday": "День рождения",
  "today": "сегодня",
  "tomorrow": "завтра",
  "in {n} days": "через {n} дн.",
  "not confirmed": "не подтверждён",
  "not on file": "нет данных",
  "Latest notes": "Последние заметки",
  "No notes yet.": "Заметок пока нет.",
  "No purchases on record.": "Покупок нет.",
  "A prospect: filled in the questionnaire, no purchase in Colibri yet.": "Потенциальный клиент: заполнил анкету, покупок в Colibri пока нет.",
  "By brand": "По брендам",
  "By category": "По категориям",
  "Category": "Категория",
  "All": "Все",
  "Show purchases of": "Показать покупки",
  "Add note": "Добавить заметку",
  "What the client said, asked for or was offered…": "Что клиент сказал, спросил или что ему предложили…",
  "Search a client": "Найти клиента",
});
Object.assign(PL, {
  visit: { en: ["visit", "visits"], ru: ["визит", "визита", "визитов"] },
});

/* --------------------------------------------------------- device settings */
const MQ_PHONE = window.matchMedia("(max-width: 720px)");
const MQ_TOUCH = window.matchMedia("(pointer: coarse)");
const MQ_SPLIT = window.matchMedia("(min-width: 1000px) and (pointer: coarse)");
const isPhone = () => MQ_PHONE.matches;
const isTouch = () => MQ_TOUCH.matches;
const isSplit = () => MQ_SPLIT.matches;
// Per-device conveniences only; the page works the same if storage is blocked.
function pref(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, String(val));
  } catch (e) { /* storage blocked: keep the in-memory value */ }
  return null;
}
const REF_RE = /^(DLD|PRS)-\d{3,4}$/;
Object.assign(S, {
  navOpen: false,
  ov: [],                 // overlays that own a step in the browser history, oldest first
  afterPop: null,         // run once the history has caught up with a close
  discreet: pref("crm_discreet") === "1",
  countsOpen: pref("crm_counts") === "1",
  cardTab: null, purBrand: "", purView: "brand",
  recent: (() => {
    try { const r = JSON.parse(pref("crm_recent") || "[]"); return Array.isArray(r) ? r.filter((x) => REF_RE.test(x)).slice(0, 8) : []; }
    catch (e) { return []; }
  })(),
  recentRows: null,
});

/* ------------------------------------------------------------------ history */
// Each overlay (card, edit form, menu) pushes one history step. Closing it
// from the page steps back; the back button steps back and the page follows.
const baseUrl = () => location.pathname + location.search;
function pushOverlay(name, url) {
  S.ov.push(name);
  try { history.pushState({ crm: name, depth: S.ov.length }, "", url || location.href); } catch (e) { /* ignore */ }
}
// Close `name` and everything opened after it. `then` runs once the history
// has moved (or at once if there was nothing to step back over).
function popOverlay(name, then) {
  const i = S.ov.indexOf(name);
  if (i < 0) { if (then) then(); return false; }
  const n = S.ov.length - i;
  S.ov.length = i;
  S.afterPop = then || null;
  history.go(-n);
  return true;
}
function syncFromHistory() {
  if (S.locked) { S.ov = []; return; }
  const depth = (history.state && history.state.depth) || 0;
  const closing = S.ov.slice(depth);
  if (S.ov.length > depth) S.ov.length = depth;
  if (closing.includes("add") && S.add) closeAddClient(true);
  if (closing.includes("edit") && S.edit) { S.edit = null; S.formError = null; if (S.cardId) renderDrawer(); }
  if (closing.includes("menu") && S.navOpen) closeNav(true);
  // A close the page asked for may have more to do once history has moved
  // (switch view, rename the card's address after a merge) — before the
  // address is read below.
  if (S.afterPop) { const f = S.afterPop; S.afterPop = null; f(); }
  const m = /^#((?:DLD|PRS)-\d{3,4})$/.exec(location.hash);
  if (m && m[1] !== S.cardId) openCard(m[1], "none");
  else if (!m && S.cardId) closeCard(true);
}
window.addEventListener("popstate", syncFromHistory);
window.addEventListener("hashchange", () => { if (!S.locked) syncFromHistory(); });
// Links to another card (duplicates, merges, the refresh review) open it as a
// new step, so back returns to the card before.
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#DLD-"], a[href^="#PRS-"]');
  if (!a || S.locked || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = a.getAttribute("href").slice(1);
  if (!REF_RE.test(id)) return;
  e.preventDefault();
  if (id !== S.cardId) openCard(id, "push");
});
// Deep link (…/crm/#DLD-0003): the card opens on top of the list, so back
// closes it rather than leaving the page.
function openFromHash() {
  const m = /^#((?:DLD|PRS)-\d{3,4})$/.exec(location.hash);
  if (!m || S.locked || m[1] === S.cardId) return;
  try { history.replaceState(null, "", baseUrl()); } catch (e) { /* ignore */ }
  openCard(m[1], "push");
}

/* ------------------------------------------------------------------ amounts */
function toggleDiscreet() {
  S.discreet = !S.discreet;
  pref("crm_discreet", S.discreet ? "1" : null);
  renderAll();
  if (S.cardId) renderDrawer();
  if (S.navOpen) renderNav();
  toast(tr(S.discreet ? "Amounts hidden on this device." : "Amounts shown."));
}
function eyeIcon(off) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "18"); svg.setAttribute("height", "18"); svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8"); svg.setAttribute("stroke-linecap", "round");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z");
  const c = document.createElementNS(ns, "circle");
  c.setAttribute("cx", "12"); c.setAttribute("cy", "12"); c.setAttribute("r", "3");
  svg.append(p, c);
  if (off) { const l = document.createElementNS(ns, "path"); l.setAttribute("d", "M4 4l16 16"); svg.append(l); }
  return svg;
}
function discreetBtn(extraClass) {
  return el("button", { class: "btn subtle icon-btn discreet" + (extraClass ? " " + extraClass : ""), type: "button",
    "aria-pressed": S.discreet ? "true" : "false", "aria-label": tr(S.discreet ? "Show amounts" : "Hide amounts"),
    title: tr(S.discreet ? "Show amounts" : "Hide amounts"), onclick: toggleDiscreet }, [eyeIcon(S.discreet)]);
}
function lockIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "18"); svg.setAttribute("height", "18"); svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8"); svg.setAttribute("stroke-linecap", "round");
  const r = document.createElementNS(ns, "rect");
  r.setAttribute("x", "5"); r.setAttribute("y", "11"); r.setAttribute("width", "14"); r.setAttribute("height", "10"); r.setAttribute("rx", "2");
  const p = document.createElementNS(ns, "path"); p.setAttribute("d", "M8 11V8a4 4 0 0 1 8 0v3");
  svg.append(r, p);
  return svg;
}
function menuIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "20"); svg.setAttribute("height", "20"); svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2"); svg.setAttribute("stroke-linecap", "round");
  for (const y of [6, 12, 18]) {
    const l = document.createElementNS(ns, "path"); l.setAttribute("d", "M4 " + y + "h16"); svg.append(l);
  }
  return svg;
}

/* ------------------------------------------------------- header on a phone */
const VIEW_TITLES = { clients: "Clients", insights: "Insights", data: "Data" };
function renderHeaderPhone() {
  const unlocked = S.session && !S.locked;
  return el("div", { class: "top-row m" }, [
    unlocked ? el("button", { class: "btn subtle icon-btn nav-btn", type: "button", "aria-label": tr("Menu"),
      "aria-expanded": S.navOpen ? "true" : "false", "aria-controls": "nav", onclick: () => openNav() }, [menuIcon()]) : null,
    el("a", { class: "home", href: "../", title: tr("All Delardi tools") }, [
      el("img", { class: "mark", src: LOGO_WORDMARK, alt: "Delardi — " + tr("All tools") })]),
    el("div", { class: "title-m", text: unlocked ? tr(VIEW_TITLES[S.view] || "Clients") : tr("Client Instrument") }),
    el("div", { class: "spacer" }),
    unlocked ? discreetBtn() : langSwitch(),
    unlocked ? el("button", { class: "btn subtle icon-btn lock-m", type: "button", onclick: lockNow, "aria-label": tr("Lock"), title: tr("Lock") }, [
      el("span", { class: "dot", "aria-hidden": "true" }), lockIcon()]) : null,
  ]);
}

/* -------------------------------------------------------------- the ☰ menu */
function openNav(section) {
  if (S.locked || S.navOpen) return;
  S.navOpen = true;
  S.navFocus = document.activeElement;
  pushOverlay("menu");
  renderNav();
  const d = $("#nav");
  d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  $("#nav-scrim").classList.add("open");
  const target = section && d.querySelector('[data-section="' + section + '"]');
  if (target) { target.scrollIntoView({ block: "start" }); const f = target.querySelector("select, button"); if (f) f.focus(); }
  else { const c = d.querySelector(".nav-close"); if (c) c.focus(); }
  const btn = $(".nav-btn"); if (btn) btn.setAttribute("aria-expanded", "true");
}
function closeNav(fromHistory, then) {
  if (!S.navOpen) { if (then) then(); return; }
  S.navOpen = false; S.navFacet = null;
  const d = $("#nav");
  d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
  $("#nav-scrim").classList.remove("open");
  const btn = $(".nav-btn"); if (btn) btn.setAttribute("aria-expanded", "false");
  if (!fromHistory) popOverlay("menu", then); else if (then) then();
  const back = S.navFocus && document.contains(S.navFocus) ? S.navFocus : $(".nav-btn");
  if (back && !S.cardId) back.focus();
}
function navRow(label, current, onclick, extra) {
  return el("button", { type: "button", class: "nav-row", "aria-current": current ? "page" : null, onclick },
    [el("span", { text: label }), extra || null]);
}
function renderNav() {
  const d = $("#nav");
  if (!d) return;
  d.innerHTML = "";
  if (!S.navOpen) return;
  const go = (v) => closeNav(false, () => setView(v));
  const tx = (list) => list.map(([v, t]) => [v, tr(t)]);
  const sections = [
    el("div", { class: "nav-section", "data-section": "views" }, [
      el("h3", { text: tr("Views") }),
      el("div", { class: "nav-list" }, ["clients", "insights", "data"].map((v) =>
        navRow(tr(VIEW_TITLES[v]), S.view === v, () => go(v)))
        .concat(canAdd() ? [navRow("+ " + tr("Add a client"), false, () => closeNav(false, openAddClient))] : [])),
    ]),
  ];
  if (S.view === "clients" && S.navFacet) {
    sections.length = 0;                                  // a checklist takes the menu until Back
    sections.push(navFacetSection());
  } else if (S.view === "clients") {
    sections.push(el("div", { class: "nav-section", "data-section": "filters" }, [
      el("h3", { text: tr("Sort and filter") }),
      el("div", { class: "nav-filters" }, [
        selectField(tr("Sort"), "sort", sortOptions()),
        selectField(tr("Status"), "status", withMulti("status", tx(STATUS_OPTIONS))),
        selectField(tr("Owner"), "owner", withMulti("owner", ownerOptions())),
        selectField(tr("Records"), "type", tx(TYPES)),
        selectField(tr("ABC"), "abc_class", withMulti("abc_class", [["", tr("Any class")], ["A", "A"], ["B", "B"], ["C", "C"]])),
        selectField(tr("Lifecycle"), "lifecycle_status", withMulti("lifecycle_status", [["", tr("Any")]].concat(LIFECYCLES.map((l) => [l, tr(l)])))),
        selectField(tr("Not contacted"), "contact", tx(CONTACT_FILTER)),
        navFacetRows(),
        el("button", { class: "btn", type: "button", onclick: () => { resetFilters(); renderNav(); }, text: tr("Reset") }),
      ]),
    ]));
  }
  let themeNow = "auto";
  try { themeNow = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { /* ignore */ }
  const dark = themeNow === "dark" || (themeNow === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (!S.navFacet) sections.push(el("div", { class: "nav-section", "data-section": "settings" }, [
    el("h3", { text: tr("Settings") }),
    el("div", { class: "nav-list" }, [
      el("div", { class: "nav-row static" }, [el("span", { text: tr("Language") }), langSwitch()]),
      navRow(tr("Theme"), false, () => { toggleTheme(); renderNav(); }, el("span", { class: "nav-val", text: tr(dark ? "Dark" : "Light") })),
      navRow(tr(S.discreet ? "Show amounts" : "Hide amounts"), false, toggleDiscreet, eyeIcon(S.discreet)),
      el("a", { class: "nav-row", href: "../board/" }, [el("span", { text: tr("Weekly board") })]),
      el("a", { class: "nav-row", href: "../" }, [el("span", { text: tr("All tools") })]),
    ]),
  ]));
  d.append(
    el("div", { class: "nav-head" }, [
      el("h2", { text: tr("Menu") }),
      el("button", { class: "btn subtle icon-btn nav-close", type: "button", "aria-label": tr("Close the menu"),
        onclick: () => closeNav(), text: "×" }),
    ]),
    el("div", { class: "nav-body" }, sections),
    el("div", { class: "nav-foot" }, [
      el("span", { class: "muted", text: tr("Signed in as {name}", { name: S.session ? S.session.name : "" }) +
        " · " + (canEdit() ? tr("can edit") : tr("view only")) }),
      el("button", { class: "btn", type: "button", onclick: () => closeNav(false, lockNow), text: tr("Lock") }),
    ]),
  );
}
// A swipe in from the left edge opens the menu, a swipe left closes it. The
// ☰ button is always there too: a gesture is never the only way in.
(function edgeSwipe() {
  const EDGE = 24, MIN = 60, DRIFT = 60;
  let x0 = null, y0 = null, mode = null;
  document.addEventListener("touchstart", (e) => {
    if (!isPhone() || S.locked || S.cardId || e.touches.length !== 1) { mode = null; return; }
    const t = e.touches[0];
    if (S.navOpen) { x0 = t.clientX; y0 = t.clientY; mode = "close"; }
    else if (t.clientX <= EDGE) { x0 = t.clientX; y0 = t.clientY; mode = "open"; }
    else mode = null;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!mode || x0 === null) { mode = null; return; }
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
    if (dy < DRIFT) {
      if (mode === "open" && dx > MIN) openNav();
      if (mode === "close" && dx < -MIN) closeNav();
    }
    mode = null; x0 = null;
  }, { passive: true });
})();

/* --------------------------------------------------------- finding a client */
const QUICK = [["bday", "Birthdays this week"], ["cannot", "Cannot lose"], ["shared", "Shared list"],
  ["missed", "Missed requests"], ["leads", "Telegram leads"], ["hand", "Added by the team"]];
const QUICK_SCOPE = { mine: "my clients", hand: "added by the team", bday: "birthdays in the next 7 days", cannot: "cannot lose", shared: "shared list",
  missed: "missed requests", leads: "telegram leads" };
function quickParams(f, p) {
  if (f.quick === "hand") p.added = "only";
  else if (f.quick === "mine" && S.ref && S.ref.my_rep) { p.client_owner = S.ref.my_rep; delete p.owner_status; }
  else if (f.quick === "bday") p.birthday_within = 7;
  else if (f.quick === "missed") p.missed = "any";
  else if (f.quick === "leads") p.status = "lead";
  else if (f.quick === "cannot") p.rfm_segment = "Cannot lose";
  else if (f.quick === "shared") { p.owner_status = "unassigned"; delete p.client_owner; }
  if (f.dnc_out) p.do_not_contact = "exclude";
  return p;
}
function renderSearchPhone() {
  const q = el("input", { type: "search", id: "find-q", placeholder: tr("Name, reference or phone"), value: S.f.q, enterkeyhint: "search",
    autocomplete: "off", "aria-label": tr("Search by name, client reference or phone number"),
    oninput: (e) => { clearTimeout(searchTimer); const v = e.target.value.trim(); searchTimer = setTimeout(() => setFilter({ q: v }), 280); } });
  const n = activeFilterCount();
  return el("div", { class: "find", id: "toolbar" }, [
    el("label", { class: "find-q" }, [el("span", { class: "sr-only", text: tr("Search a client") }), q]),
    addClientButton(true),
    el("button", { class: "btn filters-toggle m", type: "button", onclick: () => openNav("filters"),
      text: n ? tr("Filters ({n})", { n }) : tr("Filters") }),
  ]);
}
function renderQuick() {
  const host = $("#quick-host");
  if (!host) return;
  host.innerHTML = "";
  if (S.locked) return;
  const qchip = (label, pressed, onclick) => el("button", { type: "button", class: "qchip", "aria-pressed": pressed ? "true" : "false", onclick, text: label });
  host.append(el("div", { class: "qchips", role: "group", "aria-label": tr("Shortcuts") }, [
    ...(S.ref && S.ref.my_rep ? [["mine", "My clients"]] : []).concat(QUICK)
      .map(([k, label]) => qchip(tr(label), S.f.quick === k, () => setFilter({ quick: S.f.quick === k ? "" : k }))),
    qchip(tr("Do-not-contact left out"), S.f.dnc_out, () => setFilter({ dnc_out: !S.f.dnc_out })),
  ]));
  const rows = S.recentRows || [];
  if (!S.f.q && rows.length) {
    host.append(el("div", { class: "recent" }, [
      el("span", { class: "recent-l", text: tr("Recently opened") }),
      el("div", { class: "recent-list" }, rows.map((r) => el("button", { type: "button", class: "rchip" + (r.client_id === S.cardId ? " sel" : ""),
        onclick: () => openCard(r.client_id) }, [
        el("span", { class: "rn", text: blank(r.display_name) ? tr("Unnamed record") : r.display_name }),
        el("span", { class: "ri", text: r.client_id })]))),
    ]));
  }
}
// The recently opened clients are kept on this device as references only;
// their names come from the server each time.
async function loadRecent() {
  if (!S.session || !S.recent.length) { S.recentRows = []; renderQuick(); return; }
  try {
    const r = await call("clients", { ids: S.recent, status: "all", limit: 8, sort: "id" });
    const by = {};
    for (const x of r.rows || []) by[x.client_id] = x;
    S.recentRows = S.recent.map((id) => by[id]).filter(Boolean);
  } catch (e) { S.recentRows = []; }
  renderQuick();
}
function addRecent(id) {
  S.recent = [id].concat(S.recent.filter((x) => x !== id)).slice(0, 8);
  pref("crm_recent", JSON.stringify(S.recent));
}
// On a phone the counts fold away; the switch sits at the end of the list bar.
function countsToggle() {
  return el("button", { type: "button", class: "btn subtle counts-toggle", "aria-expanded": S.countsOpen ? "true" : "false",
    "aria-controls": "counts-host",
    onclick: () => { S.countsOpen = !S.countsOpen; pref("crm_counts", S.countsOpen ? "1" : null); renderCounts(); renderListHost(); },
    text: tr(S.countsOpen ? "Hide counts" : "Show counts") + (S.countsOpen ? " ▴" : " ▾") });
}
function renderCounts() {
  const host = $("#counts-host");
  if (!host) return;
  host.innerHTML = "";
  if (S.locked) return;
  if (S.countsOpen) {
    host.append(el("div", { class: "scoreboard", id: "scoreboard" }), el("div", { class: "progress", id: "progress" }));
    renderScoreboard(); renderProgress();
  }
}

/* ----------------------------------------------------------- the card tabs */
const CARD_TABS = [["overview", "Overview"], ["purchases", "Purchases"], ["cleanup", "Clean-up"], ["history", "History"]];
function defaultCardTab() {
  const t = pref("crm_card_tab");
  if (CARD_TABS.some((x) => x[0] === t)) return t;
  return isPhone() || isTouch() ? "overview" : "cleanup";
}
function setCardTab(t, focus) {
  if (S.cardTab === t) return;
  if (S.edit && S.edit.kind !== "note") { S.edit = null; S.formError = null; popOverlay("edit"); }
  S.cardTab = t; S.purBrand = "";
  pref("crm_card_tab", t);
  renderDrawer();
  const b = $("#drawer .drawer-body"); if (b) b.scrollTop = 0;
  if (focus !== false) { const tab = $('#drawer .card-tab[data-tab="' + t + '"]'); if (tab) tab.focus(); }
}
function cardTabs(data) {
  const c = data && data.client;
  const flags = c ? [c.name_flag, c.phone_flag, c.gender_flag, c.dob_flag] : [];
  const open = c && !recordClosed(c) && c.record_state === "open";
  const todo = open ? flags.filter((f) => f === "conflict" || f === "gap").length : 0;
  const lines = data ? (data.transactions || []).length : 0;
  return el("div", { class: "card-tabs", role: "tablist", "aria-label": tr("Card sections") }, CARD_TABS.map(([k, label]) => {
    const on = S.cardTab === k;
    const badge = k === "cleanup" && todo ? todo : k === "purchases" && lines ? lines : null;
    return el("button", { type: "button", role: "tab", class: "card-tab", "data-tab": k, "aria-selected": on ? "true" : "false",
      tabindex: on ? "0" : "-1", "aria-controls": "card-panel",
      onclick: () => setCardTab(k),
      onkeydown: (e) => {
        const i = CARD_TABS.findIndex((x) => x[0] === k);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const n = CARD_TABS[(i + (e.key === "ArrowRight" ? 1 : CARD_TABS.length - 1)) % CARD_TABS.length][0];
          setCardTab(n);
        }
      } }, [tr(label), badge ? el("span", { class: "badge" + (k === "cleanup" ? " todo" : ""), text: String(badge) }) : null]);
  }));
}
function addNoteFromFoot() {
  if (S.cardTab !== "history") S.cardTab = "history";     // not remembered: only a tab the person picks is
  startEdit({ kind: "note", note: "" });
  const b = $("#drawer .drawer-body"); if (b) b.scrollTop = 0;
  const t = $("#note-text"); if (t) t.focus();
}

/* ------------------------------------------------------------- at a glance */
function nextBirthday(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!m || !d) return null;
  const now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let yr = now.getFullYear();
  const at = (yy) => { const leap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0; return Date.UTC(yy, m - 1, m === 2 && d === 29 && !leap ? 28 : d); };
  let t = at(yr);
  if (t < today) t = at(++yr);
  return Math.round((t - today) / 86400000);
}
function birthdayLine(c) {
  const conf = c.dob_confirmed;
  const val = conf || c.dob_colibri || c.dob_marketing;
  if (!val) return el("span", { class: "muted", text: tr("not on file") });
  const d = new Date(String(val).slice(0, 10) + "T00:00:00Z");
  const day = d.toLocaleDateString(LOC(), { day: "numeric", month: "long", timeZone: "UTC" });
  const n = nextBirthday(val);
  const when = n === 0 ? tr("today") : n === 1 ? tr("tomorrow") : n !== null && n <= 60 ? tr("in {n} days", { n }) : "";
  return el("span", {}, [day, when ? el("b", { class: "soon", text: " · " + when }) : null,
    conf ? null : el("span", { class: "muted", text: " · " + tr("not confirmed") })]);
}
function fact(label, value, sub) {
  return el("div", { class: "fact" }, [el("dt", { text: label }), el("dd", {}, [
    typeof value === "string" ? el("span", { text: blank(value) ? "—" : value }) : value,
    sub ? el("span", { class: "fsub", text: sub }) : null])]);
}
function sectionGlance(data) {
  const c = data.client, lines = data.transactions || [];
  const kids = [];
  if (c.do_not_contact) {
    kids.push(el("div", { class: "banner critical dnc-banner", role: "note" }, [
      el("b", { text: tr("Do not contact") }), c.contact_note ? el("span", { text: " — " + c.contact_note }) : null]));
  }
  const facts = [phoneFact(data)];
  const owner = blank(c.client_owner) ? "—" : who(c.client_owner) + (ownerHasLeft(c.client_owner, c.owner_active) ? " (" + tr("has left") + ")" : "");
  facts.push(fact(tr("Owner"), owner));
  facts.push(fact(tr("Birthday"), birthdayLine(c)));
  facts.push(contactGlanceFact(data));
  const tgNote = tgGlanceNote(data);
  if (tgNote) {
    kids.push(tgNote);
  } else if (c.added_by_hand && !lines.length) {
    // v12: not a questionnaire — somebody at the counter put this person on file.
    kids.push(el("p", { class: "muted glance-note",
      text: tr("Added by the team: a prospect until Colibri brings a purchase.") + (c.how_met ? " " + tr("How we met") + ": " + tr(c.how_met) + "." : "") }));
  } else if (c.record_type === "prospect" || !lines.length) {
    kids.push(el("p", { class: "muted glance-note", text: tr("A prospect: filled in the questionnaire, no purchase in Colibri yet.") }));
  } else {
    const lastDate = lines[0].sold_at;
    const same = lines.filter((l) => l.sold_at === lastDate && Number(l.qty) >= 0);
    const top = same.slice().sort((a, b) => Number(b.net_uzs || 0) - Number(a.net_uzs || 0))[0] || lines[0];
    const what = [brandLabel(top.brand || "Unassigned"), catLabel(top.category || "Unassigned")].join(" · ") +
      (same.length > 1 ? " · " + tr("+{n} more", { n: same.length - 1 }) : "");
    facts.push(fact(tr("Last visit"), fmtDate(lastDate), what));
    facts.push(fact(tr("Lifetime spend"), fmtUZS(c.lifetime_spend_uzs) + (S.discreet ? "" : " UZS"),
      pl(Number(c.purchase_occasions || 0), "visit") + (c.rfm_segment ? " · " + trv(c.rfm_segment) : "")));
    const brands = Object.entries((data.rollup && data.rollup.by_brand) || {})
      .filter(([b]) => b !== "Unassigned").sort((a, b) => b[1].net - a[1].net);
    if (brands.length) {
      facts.push(el("div", { class: "fact wide" }, [el("dt", { text: tr("Brands bought") }), el("dd", { class: "bchips" },
        brands.slice(0, 6).map(([b, v]) => el("span", { class: "bchip" }, [b, el("span", { class: "n", text: " ×" + v.lines })])))]));
    }
  }
  if (!blank(c.brand_preference_raw)) facts.push(fact(tr("Brand preference"), c.brand_preference_raw));
  facts.push(...tgGlanceFacts(data), ...personalGlanceFacts(data));
  kids.push(el("dl", { class: "glance-facts" }, facts));
  const notes = (data.events || []).filter((e) => e.action === "note" && !blank(e.note)).slice(0, 2);
  kids.push(el("div", { class: "glance-notes" }, [
    el("h4", { text: tr("Latest notes") }),
    notes.length ? el("ul", {}, notes.map((n) => el("li", {}, [
      el("span", { class: "nt", text: n.note }),
      el("span", { class: "when", text: who(n.actor) + " · " + fmtDate(n.at) })]))) : el("p", { class: "muted", text: tr("No notes yet.") }),
  ]));
  return el("section", { class: "drawer-section glance", "aria-label": tr("At a glance") }, kids);
}

/* --------------------------------------------------------------- purchases */
function sectionPurchasesFloor(data) {
  const lines = data.transactions || [];
  if (!lines.length) {
    return el("section", { class: "drawer-section" }, [el("h3", { text: tr("Purchases") }),
      el("p", { class: "muted", text: tr("No purchases on record.") })]);
  }
  const r = data.rollup || { by_brand: {}, by_category: {}, net: 0 };
  const brands = Object.entries(r.by_brand || {}).sort((a, b) => b[1].net - a[1].net);
  const cats = Object.entries(r.by_category || {}).sort((a, b) => b[1].net - a[1].net);
  const table = (rows, head, name) => el("table", { class: "mini" }, [
    el("thead", {}, [el("tr", {}, [el("th", { text: head }), el("th", { class: "num", text: tr("Lines") }), el("th", { class: "num", text: tr("Net") })])]),
    el("tbody", {}, rows.map(([k, v]) => el("tr", {}, [
      el("td", { text: name(k) }), el("td", { class: "num", text: String(v.lines) }),
      el("td", { class: "num", title: fullUZS(v.net), text: fmtUZS(v.net) })]))),
  ]);
  const view = S.purView === "category" ? "category" : "brand";
  const switcher = el("div", { class: "seg-ctl rollup-switch", role: "group", "aria-label": tr("Purchases") }, [
    ["brand", "By brand"], ["category", "By category"]].map(([k, l]) => el("button", { type: "button",
      "aria-pressed": view === k ? "true" : "false", onclick: () => { S.purView = k; renderDrawer(); }, text: tr(l) })));
  const shown = S.purBrand ? lines.filter((l) => (l.brand || "Unassigned") === S.purBrand) : lines;
  const pchip = (key, label) => el("button", { type: "button", class: "qchip", "aria-pressed": S.purBrand === key ? "true" : "false",
    onclick: () => { S.purBrand = key; renderDrawer(); }, text: label });
  return el("section", { class: "drawer-section" }, [
    el("h3", {}, [tr("Purchases"), el("span", { class: "aside", text: pl(lines.length, "line") + " · " + fmtUZS(r.net) + (S.discreet ? "" : " UZS") })]),
    switcher,
    el("div", { class: "rollups show-" + view }, [
      el("div", { class: "rb" }, [table(brands, tr("Brand"), brandLabel)]),
      el("div", { class: "rc" }, [table(cats, tr("Category"), catLabel)]),
    ]),
    brands.length > 1 ? el("div", { class: "qchips pchips", role: "group", "aria-label": tr("Show purchases of") }, [
      pchip("", tr("All") + " · " + lines.length),
      ...brands.map(([b, v]) => pchip(b, brandLabel(b) + " · " + v.lines))]) : null,
    el("ul", { class: "lines" }, shown.map((l) => {
      const ret = Number(l.qty) < 0;
      const disc = Number(l.discount_pct || 0);
      return el("li", {}, [
        el("div", { class: "l1" }, [fmtDate(l.sold_at), " · ", el("b", { text: brandLabel(l.brand || "Unassigned") }), " · ", catLabel(l.category || "Unassigned"),
          l.advisor ? " · " + who(l.advisor) : ""]),
        el("div", { class: "amt" + (ret ? " ret" : ""), title: fullUZS(l.net_uzs) }, [
          fmtUZS(l.net_uzs),
          el("span", { class: "d", text: ret ? tr("Return") : disc > 0 ? "−" + Math.round(disc * 1000) / 10 + "%" : tr("Full price") }),
        ]),
        el("div", { class: "item", text: blank(l.item) ? tr("No description in Colibri") : l.item }),
      ]);
    })),
  ]);
}

/* ------------------------------------------------------ split view on iPad */
function syncSplit() {
  const on = !!S.cardId && isSplit();
  document.body.classList.toggle("split", on);
  const d = $("#drawer");
  if (d) d.setAttribute("aria-modal", on ? "false" : "true");
  document.querySelectorAll("table.clients tr.sel").forEach((r) => r.classList.remove("sel"));
  if (S.cardId) {
    const r = document.querySelector('table.clients tr[data-id="' + S.cardId + '"]');
    if (r) r.classList.add("sel");
  }
}
MQ_SPLIT.addEventListener("change", syncSplit);
MQ_PHONE.addEventListener("change", () => { if (S.navOpen) closeNav(); renderAll(); if (S.cardId) renderDrawer(); });
$("#nav-scrim").addEventListener("click", () => closeNav());
