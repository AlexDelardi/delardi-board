/* ===========================================================================
   Stock — Import (#/import): the upload file for new arrivals.
   The file is Colibri's own upload template, columns A–AK untouched, with our
   columns added from AL (design 2026-11-17 stock enrichment, slice 3). The
   page reads the workbook in the browser (ui/xlsxread.js), sends the rows to
   stock-api `import` as a preview, shows what each row would do, and applies
   only on "Load". A file with any row in error cannot be loaded. Rows whose
   piece is not in stock yet wait and are applied when the piece appears.
   Only with the manage right.
   ========================================================================= */
Object.assign(RU, {
  "Import": "Импорт",
  "Upload file for new arrivals": "Файл загрузки для новых поступлений",
  "The Colibri upload template (columns A–AK, unchanged) with our columns added from AL. Unknown values: leave empty or write TBD.":
    "Шаблон загрузки Colibri (столбцы A–AK без изменений) с нашими столбцами начиная с AL. Неизвестные значения: оставьте пустыми или напишите TBD.",
  "Download the template": "Скачать шаблон",
  "Choose a file": "Выбрать файл",
  "Reading the file…": "Читаем файл…",
  "Checking…": "Проверяем…",
  "Could not read this file. It must be an .xlsx workbook.": "Не удалось прочитать файл. Нужна книга .xlsx.",
  "The file has no rows under the headings.": "В файле нет строк под заголовками.",
  "These Colibri headings are missing: {h}": "В файле нет заголовков Colibri: {h}",
  "File: {f}": "Файл: {f}",
  "Will update": "Будет обновлено",
  "No change": "Без изменений",
  "Waiting for the piece": "Ждут изделия",
  "Errors": "Ошибки",
  "Error": "Ошибка",
  "Row": "Строка",
  "Result": "Результат",
  "Load {n} rows": "Загрузить строк: {n}",
  "Loading…": "Загружаем…",
  "Fix the rows with errors and upload the file again. Nothing is loaded while a row is in error.":
    "Исправьте строки с ошибками и загрузите файл снова. Пока есть ошибки, ничего не загружается.",
  "Nothing to load: every row is already on file.": "Загружать нечего: все строки уже в базе.",
  "Loaded: {u} updated, {p} waiting for their pieces.": "Загружено: обновлено {u}, ждут своих изделий {p}.",
  "Not in stock yet. The row is kept and applied when the piece appears.": "Изделия ещё нет на складе. Строка сохранится и применится, когда изделие появится.",
  "Already on file.": "Уже в базе.",
  "{n} Colibri fields": "полей Colibri: {n}",
  "arrival document: new": "документ прихода: новый",
  "arrival document: filled in": "документ прихода: дополнен",
  "arrival document: linked": "документ прихода: привязан",
  "brand barcode": "штрихкод бренда",
  "item details": "данные изделия",
  "No brand.": "Нет бренда.",
  "No serial number.": "Нет серийного номера.",
  "No reference.": "Нет артикула.",
  "HS code must be 10 digits.": "Код ТН ВЭД должен состоять из 10 цифр.",
  "ИКПУ must be 17 digits.": "ИКПУ должен состоять из 17 цифр.",
  "{f}: not a date. Write it as 14.10.2026.": "{f}: это не дата. Пишите так: 14.10.2026.",
  "This serial number is in the file more than once.": "Этот серийный номер встречается в файле несколько раз.",
  "This serial number is on more than one piece in stock.": "Этот серийный номер есть у нескольких изделий на складе.",
  "This serial number is already on a piece with another reference ({r}).": "Этот серийный номер уже есть у изделия с другим артикулом ({r}).",
  "HS code differs from the one on file ({v}); kept.": "Код ТН ВЭД отличается от записанного ({v}); оставлен прежний.",
  "ИКПУ differs from the one on file ({v}); kept.": "ИКПУ отличается от записанного ({v}); оставлен прежний.",
  "{f} differs from the arrival document on file ({v}); kept.": "{f} отличается от записанного в документе прихода ({v}); оставлено прежнее.",
  "The piece has no catalogue model, so HS code and ИКПУ cannot be stored yet.": "У изделия нет модели в каталоге, поэтому код ТН ВЭД и ИКПУ пока не сохранить.",
  "{n} rows from earlier files are waiting for their pieces.": "Строк из прошлых файлов, которые ждут свои изделия: {n}.",
  "Check now": "Проверить",
  "Applied to {n} pieces.": "Применено к изделиям: {n}.",
  "Item details": "Данные изделия",
  "Subcategory": "Подкатегория", "Metal": "Металл", "Metal purity": "Проба", "Metal weight, g": "Вес металла, г",
  "Stones": "Камни", "Certificate": "Сертификат", "Name (Uzbek)": "Наименование (узб)", "Store": "Магазин",
});

// Colibri's upload template, A–AK, exactly as Colibri names and orders them.
const UPLOAD_COLIBRI = ["Бренд", "Линия продукции", "Артикул", "Серийный номер", "Наименование товара (рус)", "Наименование товара (англ)",
  "Состав", "Материал", "Наименование цвета", "Код цвета", "Размер", "Наименование коллекции", "Страна", "Цена оригинального инвойса",
  "Инв. цена, долл", "Коэф-т 1", "Рек. цена, долл", "Коэф-т 2", "Цена продажи, долл", "Штрих Код", "Кол-во (док)", "Пол", "НДС", "СФ номер",
  "СФ дата", "Бух-код", "ЧП", "Цена в СФ", "Отправлять в ККМ", "Полное наименование", "Наименование для чека", "Диаметр", "Механизм", "Камни",
  "Вес, каратность и качество камней", "Описание", "Путь для сайта"];
// Our columns, from AL: heading in the file → key the API takes. The file is a Russian document, so its headings are Russian.
const UPLOAD_OURS = [["Код ТН ВЭД", "hs_code"], ["ИКПУ", "ikpu"], ["Поставщик", "supplier"], ["Договор", "contract"],
  ["Инвойс поставщика №", "invoice_no"], ["Дата инвойса", "invoice_date"], ["Валюта инвойса", "currency"], ["Дата прихода", "arrival_date"],
  ["ГТД №", "customs_decl"], ["Штрихкод бренда", "brand_barcode"], ["Категория", "category"], ["Подкатегория", "subcategory"],
  ["Металл", "metal"], ["Проба", "metal_purity"], ["Вес металла, г", "metal_weight_g"], ["Камни (ключи)", "stones"],
  ["Сертификат №", "certificate_no"], ["Наименование (узб)", "name_uz"], ["Магазин", "store"]];
const UPLOAD_REQUIRED = ["Бренд", "Артикул", "Серийный номер"];
const DETAIL_LABEL = { category: "Category", subcategory: "Subcategory", metal: "Metal", metal_purity: "Metal purity", metal_weight_g: "Metal weight, g",
  stones: "Stones", certificate_no: "Certificate", name_uz: "Name (Uzbek)", store: "Store" };
const headKey = (h) => String(h === null || h === undefined ? "" : h).replace(/\s+/g, " ").trim().toLowerCase();

function downloadTemplate() {
  const cols = UPLOAD_COLIBRI.concat(UPLOAD_OURS.map((c) => c[0])).map((title, i) => ({ title, key: "c" + i }));
  const blob = kitXlsx("Лист1", cols, []);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "Delardi_upload_template_v1.xlsx"; a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

// "14.10.2026", "14/10/2026" or "2026-10-14" → "2026-10-14"; anything else goes through as typed, for the server to refuse.
function uploadDate(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : s;
}
// rows[][] of the sheet → { rows: [{row, colibri, extra}], missing: [required headings not found] }
function uploadRows(sheet) {
  const head = (sheet[0] || []).map(headKey);
  const at = (h) => head.indexOf(headKey(h));
  const missing = UPLOAD_REQUIRED.filter((h) => at(h) < 0);
  const cell = (r, i) => (i < 0 || r[i] === null || r[i] === undefined ? null : (typeof r[i] === "string" ? r[i].trim() : r[i]));
  const rows = [];
  for (let i = 1; i < sheet.length; i++) {
    const r = sheet[i] || [];
    if (!r.some((v) => v !== null && v !== undefined && String(v).trim() !== "")) continue;
    const colibri = {}, extra = {};
    for (const h of UPLOAD_COLIBRI) { const v = cell(r, at(h)); if (v !== null && v !== "") colibri[h] = v; }
    for (const [h, key] of UPLOAD_OURS) {
      let v = cell(r, at(h));
      if (v === null || v === "") continue;
      if (key === "invoice_date" || key === "arrival_date") v = uploadDate(v);
      extra[key] = String(v);
    }
    rows.push({ row: i + 1, colibri, extra });
  }
  return { rows, missing };
}

/* ------------------------------------------------------------------ screen */
function renderImport(main) {
  const im = S.imp || (S.imp = { busy: null, err: null, file: null, rows: null, res: null, done: null, waiting: null });
  const sec = el("section", { class: "screen", id: "screen-import" },
    el("div", { class: "screen-head" }, el("h1", { class: "title", text: tr("Upload file for new arrivals") }),
      el("div", { class: "aside" },
        el("button", { type: "button", class: "btn", id: "imp-template", onclick: downloadTemplate, text: tr("Download the template") }),
        el("label", { class: "btn primary", id: "imp-pick-label", for: "imp-file", text: tr("Choose a file") }),
        el("input", { type: "file", id: "imp-file", class: "visually-hidden", accept: ".xlsx", onchange: (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); } }))),
    el("p", { class: "small", id: "imp-help", text: tr("The Colibri upload template (columns A–AK, unchanged) with our columns added from AL. Unknown values: leave empty or write TBD.") }));
  if (im.waiting > 0 && !im.res) {
    sec.append(el("p", { class: "notice", id: "imp-waiting" }, tr("{n} rows from earlier files are waiting for their pieces.", { n: im.waiting }) + " ",
      el("button", { type: "button", class: "btn", id: "imp-check", onclick: importCheckPending, text: tr("Check now") })));
  }
  if (im.busy) sec.append(el("p", { class: "small", id: "imp-busy", role: "status", text: tr(im.busy) }));
  if (im.err) sec.append(el("p", { class: "notice", role: "alert", id: "imp-err", text: im.err }));
  if (im.done) sec.append(el("p", { class: "notice", role: "status", id: "imp-done", text: im.done }));
  if (im.res) sec.append(...importPreview(im));
  main.append(sec);
}
function importRedraw() { if (route().name === "import" && !S.locked) renderAll(); }

async function importFile(file) {
  const im = S.imp;
  // each selection gets a number: an answer for an earlier file is dropped, and so is one that arrives after a lock
  const seq = im.seq = (im.seq || 0) + 1;
  const current = () => S.imp === im && im.seq === seq && !S.locked;
  Object.assign(im, { busy: "Reading the file…", err: null, res: null, rows: null, done: null, file: file.name });
  importRedraw();
  try {
    let sheet;
    try { sheet = await kitXlsxRead(await file.arrayBuffer()); }
    catch (e) { throw new Error(tr("Could not read this file. It must be an .xlsx workbook.")); }
    if (!current()) return;
    const parsed = uploadRows(sheet);
    if (parsed.missing.length) throw new Error(tr("These Colibri headings are missing: {h}", { h: parsed.missing.join(", ") }));
    if (!parsed.rows.length) throw new Error(tr("The file has no rows under the headings."));
    im.busy = "Checking…"; importRedraw();
    const res = await api("import", { file_name: file.name, rows: parsed.rows, apply: false });
    if (!current()) return;
    Object.assign(im, { busy: null, rows: parsed.rows, res });
  } catch (e) {
    if (!current()) return;
    Object.assign(im, { busy: null, err: e.message, res: null, rows: null });
  }
  importRedraw();
}
async function importApply() {
  const im = S.imp;
  if (!im || !im.rows || im.busy) return;
  im.busy = "Loading…"; im.err = null; importRedraw();
  const seq = im.seq;
  try {
    const res = await api("import", { file_name: im.file, rows: im.rows, apply: true });
    if (S.imp !== im || im.seq !== seq) return;
    Object.assign(im, { busy: null, res: null, rows: null, waiting: res.waiting,
      done: tr("Loaded: {u} updated, {p} waiting for their pieces.", { u: res.summary.update, p: res.summary.pending }) });
  } catch (e) {
    if (S.imp !== im || im.seq !== seq) return;
    Object.assign(im, { busy: null, err: e.message });
  }
  importRedraw();
}
async function importCheckPending() {
  const im = S.imp;
  try {
    const r = await api("import_pending", {});
    im.waiting = r.waiting; im.done = tr("Applied to {n} pieces.", { n: r.applied });
  } catch (e) { im.err = e.message; }
  importRedraw();
}
// The count of waiting rows, asked once when the screen is first opened.
async function importLoadWaiting() {
  if (!S.rights.manage || (S.imp && S.imp.waiting !== null)) return;
  S.imp = S.imp || { busy: null, err: null, file: null, rows: null, res: null, done: null, waiting: null };
  S.imp.waiting = 0;
  try { const r = await api("import_pending", { check_only: true }); S.imp.waiting = r.waiting; importRedraw(); } catch (e) { /* the screen works without it */ }
}

const IMPORT_ERR = {
  no_brand: () => tr("No brand."), no_serial: () => tr("No serial number."), no_article: () => tr("No reference."),
  bad_hs: () => tr("HS code must be 10 digits."), bad_ikpu: () => tr("ИКПУ must be 17 digits."),
  bad_date: (e) => tr("{f}: not a date. Write it as 14.10.2026.", { f: tr(e.field === "invoice_date" ? "Invoice date" : "Arrival date") }),
  serial_repeated: () => tr("This serial number is in the file more than once."),
  serial_ambiguous: () => tr("This serial number is on more than one piece in stock."),
  serial_other_reference: (e) => tr("This serial number is already on a piece with another reference ({r}).", { r: e.on_file }),
};
const RECEIPT_FIELD = { supplier: "Supplier", contract: "Contract", invoice_no: "Supplier invoice", invoice_date: "Invoice date", currency: "Currency",
  arrival_date: "Arrival date", customs_decl: "Customs declaration" };
const IMPORT_WARN = {
  hs_differs: (w) => tr("HS code differs from the one on file ({v}); kept.", { v: w.on_file }),
  ikpu_differs: (w) => tr("ИКПУ differs from the one on file ({v}); kept.", { v: w.on_file }),
  receipt_differs: (w) => tr("{f} differs from the arrival document on file ({v}); kept.", { f: tr(RECEIPT_FIELD[w.field] || w.field), v: w.on_file }),
  no_model: () => tr("The piece has no catalogue model, so HS code and ИКПУ cannot be stored yet."),
};
function importChangeWords(c) {
  const out = [];
  if (c.colibri_new + c.colibri_changed > 0) out.push(tr("{n} Colibri fields", { n: c.colibri_new + c.colibri_changed }));
  if (c.receipt === "new") out.push(tr("arrival document: new"));
  if (c.receipt === "fill") out.push(tr("arrival document: filled in"));
  if (c.receipt === "link") out.push(tr("arrival document: linked"));
  if (c.brand_code) out.push(tr("brand barcode"));
  if (c.hs_code) out.push(tr("HS code"));
  if (c.ikpu) out.push("ИКПУ");
  if (c.details > 0) out.push(tr("item details"));
  return out.join(" · ");
}
function importPreview(im) {
  const s = im.res.summary;
  const card = (id, label, n, cls) => el("div", { class: "imp-card" + (cls ? " " + cls : ""), id: "imp-n-" + id },
    el("span", { class: "lbl", text: tr(label) }), el("span", { class: "tc-n num", text: String(n) }));
  const toLoad = s.update + s.pending;
  const rowText = (r) => {
    if (r.status === "error") return (r.errors || []).map((e) => (IMPORT_ERR[e.code] ? IMPORT_ERR[e.code](e) : e.code));
    const warn = (r.warnings || []).map((w) => (IMPORT_WARN[w.code] ? IMPORT_WARN[w.code](w) : w.code));
    if (r.status === "pending") return [tr("Not in stock yet. The row is kept and applied when the piece appears.")];
    if (r.status === "same") return [tr("Already on file.")].concat(warn);
    return [importChangeWords(r.changes)].concat(warn);
  };
  const STATUS = { update: ["Will update", "info"], same: ["No change", "done"], pending: ["Waiting for the piece", "line"], error: ["Error", "alert"] };
  return [
    el("p", { class: "small", id: "imp-file-name", text: tr("File: {f}", { f: im.file }) }),
    el("div", { class: "totals", id: "imp-summary" }, card("update", "Will update", s.update), card("same", "No change", s.same),
      card("pending", "Waiting for the piece", s.pending), card("error", "Errors", s.error, s.error ? "bad" : "")),
    s.error ? el("p", { class: "notice", role: "alert", id: "imp-blocked", text: tr("Fix the rows with errors and upload the file again. Nothing is loaded while a row is in error.") })
      : toLoad === 0 ? el("p", { class: "notice", id: "imp-nothing", text: tr("Nothing to load: every row is already on file.") })
      : el("div", { class: "imp-actions" }, el("button", { type: "button", class: "btn primary", id: "imp-apply", disabled: im.busy ? true : null, onclick: importApply,
          text: tr("Load {n} rows", { n: toLoad }) })),
    el("div", { class: "tbl-wrap" }, el("table", { class: "tbl imp", id: "imp-rows" },
      el("thead", {}, el("tr", {}, [tr("Row"), tr("Serial"), tr("Brand"), tr("Reference"), tr("Result")].map((h) => el("th", { scope: "col", text: h })))),
      el("tbody", {}, im.res.rows.map((r) => el("tr", { class: "imp-" + r.status, "data-row": r.row },
        el("td", { class: "num", text: String(r.row) }),
        el("td", { class: "serial" }, r.piece_id ? el("button", { type: "button", class: "linklike", onclick: () => openPiece(r.piece_id), text: r.serial || "—" }) : el("span", { text: r.serial || "—" })),
        el("td", { text: r.brand || "—" }), el("td", { text: r.article || "—" }),
        el("td", { class: "imp-res" }, el("span", { class: "tag " + STATUS[r.status][1], text: tr(STATUS[r.status][0]) }),
          rowText(r).filter(Boolean).map((t) => el("span", { class: "imp-msg", text: t }))))))))];
}
