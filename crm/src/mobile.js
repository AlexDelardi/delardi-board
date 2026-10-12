/* ===========================================================================
   Floor and tablet, part two (Phase 5, steps 4–6)
   - Step 4, clean-up on a phone: every form on the card opens as a panel
     from the bottom with Save and Cancel pinned; merge, delete and "merge with
     another record" take the whole screen, and a merge asks twice. On the
     Clean-up tab the card's foot walks the list: Previous, Next, and on a
     touch screen "Mark checked" when nothing is left to decide.
   - Step 5, Insights and Data on a phone: tables of four columns or more
     become one small card per row (label beside value); nothing scrolls
     sideways; the refresh review keeps Apply and Discard in reach.
   - Step 6, on the home screen: an app icon and full-screen launch (the
     manifest lives next to the page), an idle lock on phones and iPads, and a
     plain "no connection" notice instead of old data. Nothing is kept on the
     device for offline use.
   ========================================================================= */
Object.assign(RU, {
  "{field} — {action}": "{field} — {action}",
  "decide": "решить",
  "confirm": "подтвердить",
  "add": "добавить",
  "change": "изменить",
  "Set {id} aside": "Отложить {id}",
  "Delete {id}?": "Удалить {id}?",
  "Merge with another record": "Объединить с другой записью",
  "Merge…": "Объединить…",
  "Yes, merge": "Да, объединить",
  "Back": "Назад",
  "{drop} will be closed and its purchases moved to {keep}. This cannot be undone here.":
    "{drop} будет закрыта, а её покупки перейдут в {keep}. Здесь это отменить нельзя.",
  "Previous record": "Предыдущая запись",
  "Next record": "Следующая запись",
  "Next": "Далее",
  "Mark checked": "Проверено",
  "{n} of {total}": "{n} из {total}",
  "Done · {n} left": "Готово · осталось {n}",
  "Last in this list": "Последняя в списке",
  // step 5
  "Decide the names above first.": "Сначала решите по именам выше.",
  // step 6
  "No connection — what you see may be out of date.": "Нет связи — данные могут быть устаревшими.",
  "No connection. Check the Wi-Fi or mobile data and try again.": "Нет связи. Проверьте Wi-Fi или мобильный интернет и попробуйте ещё раз.",
  "Connection is back.": "Связь восстановлена.",
  "Locked after {n} minutes without use.": "Заблокировано: {n} минут без действий.",
});

/* ===================================================== step 4: the clean-up */
// Forms that open as a bottom panel on a phone, and those that take the screen.
const SHEET_KINDS = ["field", "park", "delete", "merge", "lookup", "owner", "contact", "note"];
const FULL_KINDS = ["delete", "merge", "lookup"];
function sheetMode() { return !!(S.edit && SHEET_KINDS.includes(S.edit.kind) && isPhone()); }

function sheetTitle(c) {
  const e = S.edit;
  if (e.kind === "field") {
    const flag = c[e.field + "_flag"] || "none";
    const action = flag === "conflict" ? "decide" : flag === "gap" ? "confirm" : flag === "none" ? "add" : "change";
    return tr("{field} — {action}", { field: tr(FIELD_LABEL[e.field]), action: tr(action) });
  }
  if (e.kind === "park") return tr("Set {id} aside", { id: c.client_id });
  if (e.kind === "delete") return tr("Delete {id}?", { id: c.client_id });
  if (e.kind === "merge") return tr("Merge two records");
  if (e.kind === "lookup") return tr("Merge with another record");
  if (e.kind === "owner") return tr("Change owner");
  if (e.kind === "contact") return tr("Contact");
  if (PERSONAL_KINDS.includes(e.kind)) return personalSheetTitle();
  return tr("Add a note");
}
// The record the panel is about, in one line, for the full-screen steps.
function sheetContext(c) {
  return el("p", { class: "sheet-ctx" }, [el("b", { text: bestName(c) }), " · " + c.client_id + " · " + fmtUZS(c.lifetime_spend_uzs)]);
}
function renderSheet(data) {
  const c = data.client, e = S.edit;
  const full = FULL_KINDS.includes(e.kind);
  let body;
  if (e.kind === "field") body = [fieldForm(c, e.field, c[e.field + "_flag"] || "none", (data.field_meta || {})[e.field])];
  else if (e.kind === "park" || e.kind === "delete") body = [sheetContext(c), stateForm(c)];
  else if (e.kind === "merge") body = [sheetContext(c), el("div", { class: "dup" }, [dupCard(e.peek), mergeForm(c, e.peek)])];
  else if (e.kind === "lookup") body = [sheetContext(c), lookupForm(c, e)];
  else if (e.kind === "owner") body = [ownerEditor(c)];
  else if (e.kind === "contact") body = [contactForm(c, e)];
  else if (PERSONAL_KINDS.includes(e.kind)) body = personalSheetBody(data);
  else body = [noteForm(e)];
  return [
    el("div", { class: "sheet-scrim", onclick: () => { if (!S.busy) cancelEdit(); } }),
    el("section", { class: "sheet" + (full ? " full" : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-title",
      "data-kind": e.kind }, [
      el("div", { class: "sheet-head" }, [
        el("h3", { id: "sheet-title", text: sheetTitle(c) }),
        el("button", { class: "btn subtle close", type: "button", "aria-label": tr("Close"), disabled: S.busy ? true : null,
          onclick: cancelEdit, text: "×" }),
      ]),
      el("div", { class: "sheet-body" }, body),
    ]),
  ];
}

// Walking the list from the card. The position is the card's place in the
// list as it is filtered and sorted now; when a save takes the record out of
// the list (it no longer needs a decision), the next one has slid into its
// place, so Next opens that one.
Object.assign(S, { walkIdx: null, walkId: null });
function walkInfo() {
  if (!S.cardId || !S.rows || (!S.rows.length && !S.total)) return null;
  const i = S.rows.findIndex((r) => r.client_id === S.cardId);
  if (i >= 0) { S.walkIdx = S.f.offset + i; S.walkId = S.cardId; return { idx: S.walkIdx, here: true }; }
  if (S.walkId === S.cardId && S.walkIdx !== null) {
    // Not on the page shown: if its place is on another page it is still in
    // the list (the pager moved); if its place is on this page, it has left.
    const onPage = S.walkIdx >= S.f.offset && S.walkIdx < S.f.offset + S.rows.length;
    return { idx: S.walkIdx, here: !onPage };
  }
  return null;
}
function walkTargets(w) {
  return { prev: w.idx - 1, next: w.here ? w.idx + 1 : w.idx };
}
async function walkTo(dir) {
  if (S.busy || S.edit) return;
  const w = walkInfo(); if (!w) return;
  const t = dir < 0 ? walkTargets(w).prev : walkTargets(w).next;
  if (t < 0 || t >= S.total) return;
  if (t < S.f.offset || t >= S.f.offset + S.rows.length) {     // the next page of the list
    S.f.offset = Math.floor(t / PAGE) * PAGE;
    await loadList();
  }
  const r = S.rows[t - S.f.offset];
  if (!r) return;
  S.walkIdx = t; S.walkId = r.client_id;
  await openCard(r.client_id, "replace");
  // Keep the thumb (and keyboard focus) where it was: on Next, or on Previous.
  const same = $(dir > 0 ? "#drawer .walk-next" : "#drawer .walk-prev");
  const other = $(dir > 0 ? "#drawer .walk-prev" : "#drawer .walk-next");
  const f = same && !same.disabled ? same : other && !other.disabled ? other : null;
  if (f) f.focus();
}
function walkEyebrow() {
  if (S.cardTab !== "cleanup") return "";
  const w = walkInfo();
  return w && w.here ? " · " + tr("{n} of {total}", { n: w.idx + 1, total: S.total }) : "";
}
function eyebrowText(c) {
  return S.cardId + (c ? " · " + (c.record_type === "prospect" ? tr("Prospect") : tr("Client")) : "") + walkEyebrow();
}
// The list reloads behind the card after every save; the foot and the
// position follow it without redrawing the card.
function refreshWalk() {
  const d = $("#drawer");
  if (!d || !S.cardId || !S.card || S.edit) return;
  const old = d.querySelector(".drawer-foot");
  const focusCls = old && old.contains(document.activeElement) ? [...document.activeElement.classList].find((k) => k.startsWith("walk-") || k === "add-note") : null;
  const nf = cardFoot(S.card);
  if (old && nf) old.replaceWith(nf); else if (old) old.remove();
  else if (nf) { const body = d.querySelector(".drawer-body"); if (body) body.after(nf); }
  const eb = d.querySelector(".drawer-head .eyebrow"); if (eb) eb.textContent = eyebrowText(S.card.client);
  if (focusCls) { const f = d.querySelector(".drawer-foot ." + focusCls + ":not([disabled])") || d.querySelector(".drawer-foot .walk-next:not([disabled])"); if (f) f.focus(); }
}
const chev = (d) => el("span", { "aria-hidden": "true", class: "chev", text: d < 0 ? "‹" : "›" });
function cardFoot(data) {
  const c = data.client;
  if (S.edit) return null;                          // one action at a time: an open form hides the foot
  const w = S.cardTab === "cleanup" ? walkInfo() : null;
  if (w) {
    const t = walkTargets(w);
    const nConf = ["name", "phone", "gender", "dob"].filter((f) => c[f + "_flag"] === "conflict").length;
    const canCheck = isTouch() && editable(c) && c.record_state === "open" && nConf === 0;
    const pos = w.here ? tr("{n} of {total}", { n: w.idx + 1, total: S.total }) : tr("Done · {n} left", { n: S.total });
    const noNext = t.next >= S.total;
    return el("div", { class: "drawer-foot walk" }, [
      el("button", { class: "btn subtle walk-prev", type: "button", "aria-label": tr("Previous record"), title: tr("Previous record") + " (K)",
        disabled: S.busy || t.prev < 0 ? true : null, onclick: () => walkTo(-1) }, [chev(-1)]),
      canCheck
        ? el("button", { class: "btn primary walk-check", type: "button", disabled: S.busy ? true : null,
            onclick: () => act("set_state", { state: "confirmed" }, tr("Marked as checked.")) }, [el("span", { "aria-hidden": "true", text: "✓ " }), tr("Mark checked")])
        : el("span", { class: "walk-pos", "aria-live": "polite", text: noNext && w.here ? pos + " · " + tr("Last in this list") : pos }),
      el("button", { class: "btn walk-next" + (canCheck ? "" : " primary"), type: "button", "aria-label": tr("Next record"), title: tr("Next record") + " (J)",
        disabled: S.busy || noNext ? true : null, onclick: () => walkTo(1) }, [el("span", { class: "wl", text: tr("Next") }), chev(1)]),
    ]);
  }
  const canNote = editable(c) || (canEdit() && c.record_state !== "merged");
  if (!canNote) return null;
  return el("div", { class: "drawer-foot" }, [
    editable(c) ? el("button", { class: "btn log-contact", type: "button", disabled: S.busy ? true : null, onclick: logContactFromFoot }, [
      el("span", { "aria-hidden": "true", text: "+" }), tr("Log contact")]) : null,
    el("button", { class: "btn primary add-note", type: "button", disabled: S.busy ? true : null, onclick: addNoteFromFoot }, [
      el("span", { "aria-hidden": "true", text: "+" }), tr("Add note")]),
  ]);
}
// On a desktop the same walk is on the keyboard, as in a mail reader: J for
// the next record, K for the previous (not Alt+arrows: those are the browser's
// own back and forward).
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || !S.cardId || S.edit || S.cardTab !== "cleanup") return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === "j" || e.key === "J" || e.key === "о" || e.key === "О") { e.preventDefault(); walkTo(1); }
  else if (e.key === "k" || e.key === "K" || e.key === "л" || e.key === "Л") { e.preventDefault(); walkTo(-1); }
});

// iPhone keyboards cover a fixed panel rather than resizing the page, so the
// panel is lifted by the keyboard's height. (Android resizes the page itself:
// see interactive-widget in the viewport tag.)
(function keyboardLift() {
  const vv = window.visualViewport;
  if (!vv) return;
  const set = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty("--kb", kb + "px");
  };
  vv.addEventListener("resize", set); vv.addEventListener("scroll", set);
})();

/* ========================================= step 5: Insights and Data, phone */
// A table of four columns or more becomes, on a phone, one small card per row:
// the row's name on top, each figure labelled underneath. The page builds the
// same table for every screen; this only adds the labels and the roles (a
// table laid out as blocks loses its table semantics otherwise). Two- and
// three-column tables stay tables: they fit.
function stackTables(root) {
  if (!root) return;
  root.querySelectorAll(".tbl-scroll > table").forEach((t) => {
    // The heat grid is a matrix, and the priority lists have their own phone layout.
    if (t.classList.contains("heatgrid") || t.classList.contains("plays") || t.classList.contains("stack")) return;
    const head = t.tHead && t.tHead.rows[0];
    if (!head || head.cells.length < 4) return;
    const labels = [...head.cells].map((c) => c.textContent.trim());
    // The row's name: the client in the birthday list, the first column elsewhere.
    const titleCol = t.classList.contains("bdays") ? 1 : 0;
    t.classList.add("stack");
    t.parentElement.classList.add("stacked");
    t.setAttribute("role", "table");
    t.querySelectorAll("thead, tbody, tfoot").forEach((g) => g.setAttribute("role", "rowgroup"));
    [...t.rows].forEach((r) => {
      r.setAttribute("role", "row");
      const inHead = r.parentElement.tagName === "THEAD";
      [...r.cells].forEach((c, i) => {
        if (inHead) { c.setAttribute("role", "columnheader"); return; }
        c.setAttribute("role", c.tagName === "TH" ? "rowheader" : "cell");
        if (i === titleCol) c.classList.add("st-title");
        else c.dataset.label = labels[i] || "";
      });
    });
  });
}

/* =========================================== step 6: home screen, idle lock */
// Idle lock on phones and iPads (Alex, 22 Sept: 15 minutes, passcode again;
// the session itself stays at 8 hours). Time in the background counts as
// idle: a phone put down on the counter locks. The moment of last use is kept
// on the device so that an app closed and reopened later asks again too; it
// is a time, nothing about any client. The desktop is unchanged.
const IDLE_MIN = 15;
const IDLE_KEY = "crm_last_active";
const idleApplies = () => isTouch();
let lastActive = Date.now(), lastSaved = 0;
function markActive() {
  lastActive = Date.now();
  if (!S.locked && lastActive - lastSaved > 20000) { lastSaved = lastActive; pref(IDLE_KEY, String(lastActive)); }
}
function activeNow() { lastActive = lastSaved = Date.now(); pref(IDLE_KEY, String(lastActive)); }
["pointerdown", "keydown", "touchstart", "wheel", "input"].forEach((ev) =>
  window.addEventListener(ev, markActive, { passive: true, capture: true }));
function idleLock() {
  pref(IDLE_KEY, null);
  lockDown(tr("Locked after {n} minutes without use.", { n: IDLE_MIN }));
}
function idleCheck() {
  if (S.locked || !S.session || !idleApplies()) return;
  if (Date.now() - lastActive >= IDLE_MIN * 60000) idleLock();
}
setInterval(idleCheck, 30000);
// Called by boot before a stored session is used.
function idleExpiredOnOpen() {
  if (!idleApplies()) return false;
  const t = Number(pref(IDLE_KEY) || 0);
  return !!t && Date.now() - t >= IDLE_MIN * 60000;
}

// Back from the background: lock if it was long enough; otherwise, after five
// minutes away, refresh quietly so what is on screen is current.
let hiddenAt = null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); if (!S.locked) pref(IDLE_KEY, String(lastActive)); return; }
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  hiddenAt = null;
  idleCheck();
  if (!S.locked && away >= 5 * 60000) quietRefresh();
});
window.addEventListener("pageshow", (e) => { if (e.persisted) idleCheck(); });

// Everything the screen shows, fetched again; the open card too unless a form
// is open on it.
async function quietRefresh() {
  if (S.locked || !S.session) return;
  refreshBehind();
  if (S.cardId && !S.edit && !S.busy) {
    const id = S.cardId;
    try { const data = await call("client", { id }); if (S.cardId === id && !S.edit) { S.card = data; renderDrawer(); } } catch (e) { /* the banner says why */ }
  }
}

// No connection: the page says so, rather than passing old figures off as
// current. Nothing is cached for offline use; when the connection is back the
// screen reloads what it shows.
Object.assign(S, { offline: false });
function renderNet() {
  let n = $("#net");
  if (!n) { n = el("div", { id: "net", class: "net-banner", role: "status", "aria-live": "polite" }); document.body.prepend(n); }
  n.textContent = S.offline ? tr("No connection — what you see may be out of date.") : "";
  document.body.classList.toggle("offline", S.offline);
}
function netDown() { if (!S.offline) { S.offline = true; renderNet(); } }
function netUp() {
  if (!S.offline) return;
  S.offline = false; renderNet();
  toast(tr("Connection is back."));
  if (S.locked && S.session) { if (!S.booting) resumeSession(); return; }
  quietRefresh();
}
window.addEventListener("offline", netDown);
window.addEventListener("online", netUp);
// A session kept on the device while the connection was down at start.
async function resumeSession() {
  try { await loadAll(); S.locked = false; activeNow(); renderAll(); openFromHash(); }
  catch (e) { if (e.status) { S.session = null; store(SESSION_KEY, ""); renderAll(); } }
}
if (navigator.onLine === false) S.offline = true;

// Registered with the page for the home screen: the manifest and icons live in
// app/ next to this file (see README). No service worker: nothing is stored
// for offline use.
