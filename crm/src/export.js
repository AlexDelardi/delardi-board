/* ===========================================================================
   Taking the list away as a sheet (API v13)
   Alex, 15 Oct 2026. Three people hold the right: he, Olga and Eva.

   The rule the whole thing hangs on: the file is what the screen says. The
   server runs the list's own filter builder for the download, so a sheet can
   never quietly hold a different set of people from the one being looked at.
   What the page adds is the part a spreadsheet needs and a screen does not —
   the headings, the number formats, and a second sheet saying which filters
   made it, who made it and when.

   Numbers are formatted here, by the same phoneParts() the card uses, so a
   number reads the same in the file as on the screen. Discreet mode does not
   reach into the file: hiding amounts is for shoulders in the boutique, and a
   file of masked numbers would be no use to anyone.
   ========================================================================= */
const canExport = () => !!(S.session && S.ref && S.ref.can_export);

// The sheet's columns, in order. `get` turns one API row into one cell.
const EXPORT_COLS = () => [
  { label: tr("Reference"), width: 12, get: (r) => r.client_id },
  { label: tr("Name"), width: 32, get: (r) => blank(r.display_name) ? "" : r.display_name },
  { label: tr("Phone"), width: 20, phone: true, get: (r) => exportPhone(r.phone_main) },
  { label: tr("Other numbers"), width: 24, phone: true,
    get: (r) => (r.phones_other || []).map(exportPhone).filter(Boolean).join(", ") },
  { label: tr("Birthday"), width: 14, get: (r) => birthdayCell(r) },
  { label: tr("Birthday confirmed"), width: 10,
    get: (r) => (r.birth_month ? (r.birth_confirmed ? tr("Yes") : tr("No")) : "") },
  { label: tr("Owner"), width: 18,
    get: (r) => blank(r.client_owner) ? ""
      : who(r.client_owner) + (ownerHasLeft(r.client_owner, r.owner_active) ? " (" + tr("has left") + ")" : "") },
  { label: tr("Record"), width: 14, get: (r) => recordCell(r) },
  { label: tr("Clean-up status"), width: 16,
    get: (r) => tr((STATUS[r.review_status] || STATUS.clean).label) },
  { label: "ABC", width: 6, get: (r) => r.abc_class || "" },
  { label: tr("Segment"), width: 18, get: (r) => trv(r.rfm_segment) === "—" ? "" : trv(r.rfm_segment) },
  { label: tr("Lifecycle"), width: 12, get: (r) => trv(r.lifecycle_status) === "—" ? "" : trv(r.lifecycle_status) },
  { label: tr("Lifetime spend, UZS"), width: 18, type: "num",
    get: (r) => (r.lifetime_spend_uzs === null || r.lifetime_spend_uzs === undefined ? null : Number(r.lifetime_spend_uzs)) },
  { label: tr("Purchases"), width: 10, type: "num",
    get: (r) => (r.purchase_occasions === null || r.purchase_occasions === undefined ? null : Number(r.purchase_occasions)) },
  { label: tr("First purchase"), width: 14, type: "date", get: (r) => r.first_purchase_at },
  { label: tr("Last purchase"), width: 14, type: "date", get: (r) => r.last_purchase_at },
  { label: tr("Last contact"), width: 14, type: "date", get: (r) => r.last_contact_on },
  { label: tr("Last contact by"), width: 16, get: (r) => blank(r.last_contact_by) ? "" : who(r.last_contact_by) },
  { label: tr("How"), width: 12, get: (r) => (r.last_contact_channel ? channelLabel(r.last_contact_channel) : "") },
  { label: tr("Do not contact"), width: 12, get: (r) => (r.do_not_contact ? tr("Yes") : "") },
  { label: tr("In Telegram"), width: 12, get: (r) => (r.in_telegram ? tr("Yes") : "") },
  { label: tr("Added by the team"), width: 20,
    get: (r) => (r.added_by_hand ? tr("Yes") + (r.how_met ? " — " + tr(r.how_met) : "") : "") },
  { label: tr("Related party"), width: 12, get: (r) => (r.related_party ? tr("Yes") : "") },
];
function exportPhone(raw) {
  if (blank(raw)) return "";
  const p = phoneParts(raw);
  return p ? p.text : String(raw);
}
// A birthday is a day and a month; the year comes too when the record holds it.
function birthdayCell(r) {
  if (!r.birth_month || !r.birth_day) return "";
  const dd = String(r.birth_day).padStart(2, "0"), mm = String(r.birth_month).padStart(2, "0");
  return r.birth_year ? `${dd}.${mm}.${r.birth_year}` : `${dd}.${mm}`;
}
function recordCell(r) {
  if (r.review_status === "lead") return tr("Telegram lead");
  return r.record_type === "prospect" ? tr("Prospect") : tr("Client");
}

/* --------------------------------------------------------------- the dialog */
// opts: { kind, params, title, name } — the list passes nothing and the
// birthday block passes its month.
function openExport(opts) {
  if (!canExport() || S.exp) return;
  const o = opts || {};
  S.exp = {
    kind: o.kind === "birthdays" ? "birthdays" : "list",
    params: o.params || null,
    title: o.title || null,
    name: o.name || null,
    count: typeof o.count === "number" ? o.count : (o.params ? null : S.total),
    phones: true, busy: false, err: null,
  };
  pushOverlay("export");
  renderExport();
  const box = $("#expwrap .exp-first");
  if (box) box.focus();
}
function closeExport(fromHistory, then) {
  if (!S.exp) { if (then) then(); return; }
  if (S.exp.busy) return;
  S.exp = null;
  const host = $("#expwrap");
  if (host) host.remove();
  if (!fromHistory) popOverlay("export", then); else if (then) then();
}
// What the file is called. "Delardi_clients_cannot-lose_2026-10-15.xlsx"
function exportFilename(meta) {
  const today = (meta && meta.exported_at ? new Date(meta.exported_at) : new Date());
  const day = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")].join("-");
  const slug = String(S.exp && S.exp.name ? S.exp.name : describeFilters().replace(/^·\s*/, ""))
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const base = S.exp && S.exp.kind === "birthdays" ? "Delardi_birthdays" : "Delardi_clients";
  return [base, slug, day].filter(Boolean).join("_") + ".xlsx";
}
// The second sheet: what made this file, and the line that should make anyone
// think twice before forwarding it.
function aboutSheet(meta, scope) {
  const when = meta.exported_at ? new Date(meta.exported_at) : new Date();
  const rows = [
    [tr("Filters"), scope || tr("Everything on file")],
    [tr("Sort"), S.exp.kind === "birthdays" ? tr("Birthday") : tr((SORTS.find((s) => s[0] === S.f.sort) || ["", ""])[1])],
    [tr("Records"), String(meta.total)],
    [tr("Phone numbers"), meta.with_phones ? tr("Included") : tr("Left out")],
    [tr("Exported by"), meta.exported_by || ""],
    [tr("Exported at"), when.toLocaleString(LOC())],
    ["", ""],
    [tr("Delardi client data — internal. Do not forward outside the company."), ""],
  ];
  return { name: tr("About this export"), cols: [{ label: tr("About this export"), width: 28 }, { label: "", width: 70 }],
    rows, freeze: false, filter: false };
}
async function runExport() {
  if (!S.exp || S.exp.busy) return;
  S.exp.busy = true; S.exp.err = null; renderExport();
  try {
    const base = S.exp.params ? { ...S.exp.params } : listParams();
    delete base.limit; delete base.offset;
    const data = await call("export", { ...base, kind: S.exp.kind, phones: S.exp.phones });
    const cols = EXPORT_COLS().filter((c) => (S.exp.phones ? true : !c.phone));
    const rows = (data.rows || []).map((r) => cols.map((c) => c.get(r)));
    const scope = S.exp.title || describeFilters().replace(/^·\s*/, "");
    const bytes = workbookBytes([
      { name: tr("Clients"), cols, rows },
      aboutSheet(data, scope),
    ]);
    const filename = exportFilename(data);
    saveWorkbook(bytes, filename);
    S.exp.busy = false;
    closeExport(false, () => toast(tr("Saved: {name}", { name: filename })));
  } catch (e) {
    S.exp.busy = false;
    S.exp.err = e && e.message ? e.message : tr("The file could not be made.");
    renderExport();
  }
}
function renderExport() {
  if (!S.exp) return;
  let host = $("#expwrap");
  if (!host) {
    host = el("div", { id: "expwrap", class: "addwrap" });
    document.body.appendChild(host);
  }
  const e = S.exp;
  host.innerHTML = "";
  host.appendChild(el("div", { class: "add-scrim", onclick: () => closeExport() }));
  const scope = e.title || describeFilters().replace(/^·\s*/, "") || tr("Everything on file");
  host.appendChild(el("section", { class: "addbox expbox", role: "dialog", "aria-modal": "true", "aria-labelledby": "exp-title" }, [
    el("div", { class: "sheet-head" }, [
      el("h3", { id: "exp-title", text: tr("Download .xlsx") }),
      el("button", { class: "btn subtle close", type: "button", "aria-label": tr("Close"), disabled: e.busy ? true : null,
        onclick: () => closeExport(), text: "×" }),
    ]),
    el("form", { class: "editor exp-form", onsubmit: (ev) => { ev.preventDefault(); runExport(); } }, [
      el("p", { class: "exp-scope" }, [el("b", { text: scope })]),
      e.count === null ? null : el("p", { class: "exp-count", text: tr("{n} records will be downloaded", { n: e.count }) }),
      el("label", { class: "opt exp-phones" }, [
        el("input", { type: "checkbox", class: "exp-first", checked: e.phones ? true : null, disabled: e.busy ? true : null,
          onchange: (ev) => { e.phones = ev.target.checked; } }),
        el("span", { text: tr("Include phone numbers") }),
      ]),
      el("p", { class: "hint", text: tr("Leave the numbers out when the file is going to a brand, an agency or a meeting.") }),
      el("p", { class: "hint", text: tr("The file carries your name and today's date, and the download is logged.") }),
      e.err ? el("p", { class: "form-err", role: "alert", text: e.err }) : null,
      el("div", { class: "form-actions" }, [
        el("button", { class: "btn primary", type: "submit", disabled: e.busy ? true : null,
          text: e.busy ? tr("Preparing the file…") : tr("Download") }),
        el("button", { class: "btn subtle", type: "button", disabled: e.busy ? true : null,
          onclick: () => closeExport(), text: tr("Cancel") }),
      ]),
    ]),
  ]));
}
// Escape closes it, like every other overlay, unless a file is being made.
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && S.exp && !S.exp.busy) { ev.stopPropagation(); closeExport(); }
}, true);

function exportButton(compact) {
  if (!canExport()) return null;
  return el("button", {
    class: "btn export-btn" + (compact ? " sm" : ""), type: "button", "data-act": "export",
    title: tr("Download the list"), onclick: () => openExport(),
    text: compact ? "⤓" : tr("Download .xlsx"),
  });
}
