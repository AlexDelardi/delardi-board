/* ===========================================================================
   Stock — the review queue (spec 2026-11-16, Goal 4 / Screens → Review).
   Open items raised by the database (a piece missing from the export, a serial
   used twice, a sale that contradicts the stock, a late or dropped arrival).
   Anyone with the view right sees the list; with the manage right each row
   offers the answers its kind allows, then a note and Confirm, and `resolve`
   closes it. The tab label carries the open count (loadReviews on login and
   after every resolve). Every late answer checks S.locked and that S.rv is
   still the object it started with, as piece.js does.
   S.rv = { items | null, err, ans: { id, resolution, note, err, busy, confirming } | null }
   ========================================================================= */
Object.assign(RU, {
  "Kind": "Вид",
  "Raised": "Поднято",
  "Answer": "Ответ",
  "Sold": "Продано",
  "Booked out": "Выдано",
  "Still in stock": "Есть в наличии",
  "Still in transit": "Всё ещё в пути",
  "Not delivered": "Не поставлено",
  "Close this review?": "Закрыть проверку?",
  "Confirm": "Подтвердить",
  "Review closed.": "Проверка закрыта.",
  "No open reviews.": "Открытых проверок нет.",
  "Could not load the reviews.": "Не удалось загрузить проверки.",
  "Answer: {a}": "Ответ: {a}",
});

// kind → the answers ops_resolve_review allows for it
const REVIEW_ANSWERS = {
  missing_from_export: ["sold", "damaged", "booked_out", "still_in_stock"],
  serial_reused: ["sold", "damaged", "booked_out", "still_in_stock"],
  ticket_conflict: ["sold", "damaged", "booked_out", "still_in_stock"],
  overdue_in_transit: ["still_in_transit", "not_delivered"],
  dropped_from_incoming: ["still_in_transit", "not_delivered"],
};
const ANSWER_WORD = { sold: "Sold", damaged: "Damaged", booked_out: "Booked out", still_in_stock: "Still in stock", still_in_transit: "Still in transit", not_delivered: "Not delivered" };
const kindWord = (k) => tr(REVIEW_KIND[k] || humanKey(k));          // REVIEW_KIND, humanKey: piece.js
const answerWord = (a) => tr(ANSWER_WORD[a] || humanKey(a));

let rvSeq = 0, rvDraws = 0;
function rvState() { return S.rv || (S.rv = { items: null, err: null, ans: null }); }
function setReviewTab() {
  const t = $("#tab-review");
  if (t) t.textContent = tr("Review") + (S.reviewCount > 0 ? " (" + S.reviewCount + ")" : "");
}

// Ask for the open items: on login, when the tab opens, after a resolve or a refusal.
async function loadReviews() {
  if (S.locked) return;
  const rv = rvState();
  const seq = ++rvSeq;
  try {
    const items = await api("reviews");
    if (S.locked || S.rv !== rv || seq !== rvSeq) return;
    rv.items = items; rv.err = null; S.reviewCount = items.length;
    const a = rv.ans;
    if (a && !items.some((r) => r.review_id === a.id)) {          // closed elsewhere meanwhile
      rv.ans = null;
      if (a.err) toast(a.err, true);
    }
  } catch (e) {
    if (S.locked || S.rv !== rv || seq !== rvSeq) return;
    if (!rv.items) rv.err = e.message;
  }
  setReviewTab();
  drawReviews();
}

function renderReview(main) {
  main.append(el("section", { class: "screen", id: "screen-review" },
    el("h1", { class: "sr-only", text: tr("Review") }),
    el("div", { id: "rv-host" })));
  drawReviews();
  loadReviews();
}

function drawReviews() {
  const host = $("#rv-host");
  if (!host || S.locked) return;
  const rv = rvState();
  const focus = focusMark(host);
  host.innerHTML = "";
  host.setAttribute("data-draws", ++rvDraws);                    // lets the tests wait for a redraw
  if (rv.err && !rv.items) {
    host.append(el("p", { class: "notice", role: "alert", text: tr("Could not load the reviews.") + " " + rv.err }),
      el("button", { type: "button", class: "btn", onclick: loadReviews, text: tr("Try again") }));
    return;
  }
  if (!rv.items) { host.append(el("p", { class: "loading-line", text: tr("Loading…") })); return; }
  if (!rv.items.length) { host.append(el("p", { class: "rv-empty", id: "rv-empty", text: tr("No open reviews.") })); return; }
  const manage = !!S.rights.manage;
  const body = el("tbody", { id: "rv-rows" });
  for (const r of rv.items) {
    body.append(reviewRow(r, manage, rv));
    if (manage && rv.ans && rv.ans.id === r.review_id) body.append(answerForm(r, rv.ans));
  }
  host.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl reviews", id: "rv-table" },
    el("thead", {}, el("tr", {},
      el("th", { scope: "col", text: tr("Kind") }), el("th", { scope: "col", text: tr("Piece") }),
      el("th", { scope: "col", text: tr("State") }), el("th", { scope: "col", text: tr("Raised") }),
      manage ? el("th", { scope: "col", text: tr("Answer") }) : null)),
    body)));
  restoreFocus(host, focus);
}

// A redraw (a reload of the queue, a refusal) rebuilds every node: whatever held keyboard focus
// inside the queue gets it back. Marked by row and answer, or by id (the form's own controls).
// Not on a touch device, and not while the piece panel is open (focus belongs to the panel then).
const keepsFocus = () => !touchDevice() && !$("#piece-panel");
function focusMark(host) {
  if (!keepsFocus()) return null;
  const a = document.activeElement;
  if (!a || !host.contains(a)) return null;
  const row = a.closest("tr.rrow");
  const m = { id: a.id || null, review: row ? row.getAttribute("data-review") : null, answer: a.getAttribute("data-answer"), piece: a.classList.contains("rv-piece") };
  if (a.id === "rv-note") m.pos = a.selectionStart;
  return m;
}
function restoreFocus(host, m) {
  if (!m || !keepsFocus()) return;
  let n = null;
  if (m.id) n = $("#" + m.id, host);
  else if (m.review) {
    const row = host.querySelector('tr.rrow[data-review="' + m.review + '"]');
    n = row && (m.answer ? row.querySelector('button[data-answer="' + m.answer + '"]') : m.piece ? row.querySelector(".rv-piece") : null);
  }
  if (!n) return;
  n.focus();
  if (m.pos !== undefined) { try { n.setSelectionRange(m.pos, m.pos); } catch (e) { /* ignore */ } }
}

function reviewRow(r, manage, rv) {
  const p = r.piece || {};
  const a = rv.ans && rv.ans.id === r.review_id ? rv.ans : null;
  const model = [p.brand, p.model_name].filter((x) => !blank(x)).join(" · ");
  return el("tr", { class: "rrow" + (a ? " open" : ""), "data-review": r.review_id },
    el("td", { class: "rk" }, el("span", { class: "rk-word", text: kindWord(r.kind) }),
      !blank(r.note) ? el("span", { class: "rv-note small", text: r.note }) : null),
    el("td", { class: "rp" }, el("button", { type: "button", class: "btn quiet rv-piece", onclick: () => openPiece(p.piece_id) },
      el("span", { class: "serial", text: p.serial || "—" }), model ? el("span", { class: "ref-m small", text: model }) : null)),
    el("td", { class: "st" }, stateTag(p.state)),
    el("td", { class: "since", text: fmtDate(r.raised_at) }),
    manage ? el("td", { class: "ra" }, el("div", { class: "rv-answers", role: "group" }, (REVIEW_ANSWERS[r.kind] || []).map((x) =>
      el("button", { type: "button", class: "btn rv-ans", "data-answer": x, "aria-pressed": a && a.resolution === x ? "true" : "false",
        disabled: a && a.busy ? true : null, onclick: () => pickAnswer(r.review_id, x), text: answerWord(x) })))) : null);
}

function answerForm(r, a) {
  const keep = (ev) => { a.note = ev.target.value; };
  return el("tr", { class: "rv-formrow" }, el("td", { colspan: "5" },
    el("form", { class: "rv-form", id: "rv-form", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); confirmAnswer(); } },
      el("label", { class: "rv-field", for: "rv-note" },
        el("span", { class: "lbl", text: tr("Answer: {a}", { a: answerWord(a.resolution) }) + " · " + tr("Note") + " · " + tr("Optional") }),
        el("textarea", { id: "rv-note", maxlength: "500", rows: "2", value: a.note, oninput: keep })),
      el("p", { class: "form-err rv-err", role: "alert", hidden: a.err ? null : true, text: a.err || "" }),
      el("div", { class: "pc-form-foot" },
        el("button", { type: "submit", class: "btn primary", id: "rv-confirm", disabled: a.busy ? true : null, text: tr("Confirm") }),
        el("button", { type: "button", class: "btn", id: "rv-cancel", disabled: a.busy ? true : null,
          onclick: () => { const x = rvState().ans; rvState().ans = null; drawReviews(); focusAfter(x.id, x.resolution); }, text: tr("Cancel") })))));
}

// Keyboard focus after a form closes or a row goes: that row's answer button, else the next
// row's first one, else the tab (never body).
function focusAfter(id, resolution, removed) {
  if (touchDevice()) return;
  const rows = [...document.querySelectorAll("#rv-rows tr.rrow")];
  let target = null;
  if (!removed) {
    const r = rows.find((n) => n.getAttribute("data-review") === String(id));
    target = r && (r.querySelector('button[data-answer="' + resolution + '"]') || r.querySelector("button[data-answer]"));
  } else if (rows.length) {
    const next = removed.next !== null && rows.find((n) => n.getAttribute("data-review") === String(removed.next));
    const r = next || rows[rows.length - 1];
    target = r.querySelector("button[data-answer]") || r.querySelector(".rv-piece");
  }
  (target || $("#tab-review")).focus();
}
function pickAnswer(id, resolution) {
  const rv = rvState();
  if (rv.ans && (rv.ans.busy || rv.ans.confirming)) return;
  const same = rv.ans && rv.ans.id === id;
  rv.ans = { id, resolution, note: same ? rv.ans.note : "", err: null, busy: false, confirming: false };
  drawReviews();
  const n = $("#rv-note");
  if (n && !touchDevice()) n.focus();
}

async function confirmAnswer() {
  const rv = S.rv;
  const a = rv && rv.ans;
  if (!a || a.busy || a.confirming || S.locked) return;
  const item = rv.items.find((r) => r.review_id === a.id);
  if (!item) return;
  const note = a.note.trim();
  const piece = item.piece || {};
  const body = [kindWord(item.kind) + " · " + (piece.serial || ""), tr("Answer: {a}", { a: answerWord(a.resolution) })];
  if (note) body.push(note);
  a.confirming = true;
  const ok = await confirmBox({ title: tr("Close this review?"), body, ok: tr("Confirm"), cancel: tr("Cancel") });
  a.confirming = false;
  if (!ok && !S.locked && S.rv === rv && rv.ans === a) { const n = $("#rv-note"); if (n && !touchDevice()) n.focus(); }   // back to the form
  if (!ok || S.locked || S.rv !== rv || rv.ans !== a) return;
  a.busy = true; a.err = null;
  drawReviews();
  const req = { review_id: a.id, resolution: a.resolution };
  if (note) req.note = note;
  try {
    await api("resolve", req);
    if (S.locked || S.rv !== rv) return;             // locked meanwhile: nothing is drawn
    const idx = rv.items.findIndex((r) => r.review_id === a.id);
    const nextItem = rv.items[idx + 1] || rv.items[idx - 1];
    rv.items = rv.items.filter((r) => r.review_id !== a.id);
    S.reviewCount = rv.items.length;
    rv.ans = null;
    setReviewTab(); drawReviews();
    if (!$("#piece-panel")) focusAfter(a.id, a.resolution, { next: nextItem ? nextItem.review_id : null });
    toast(tr("Review closed."));
    loadReviews();
    if (typeof loadList === "function") loadList();                      // an answer such as Damaged moves a piece
    if (S.pc && S.pc.id === piece.piece_id && typeof loadPiece === "function") loadPiece(S.pc.id);
  } catch (e) {
    if (S.locked || S.rv !== rv) return;
    a.busy = false; a.err = e.message;
    if (e.status === 409) loadReviews();             // it may have been closed elsewhere
    drawReviews();
  }
}
