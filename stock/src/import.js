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
  "Loaded: {c} added, {u} updated, {p} waiting for their pieces.": "Загружено: добавлено {c}, обновлено {u}, ждут своих изделий {p}.",
  "New piece": "Новое изделие",
  "New pieces": "Новые изделия",
  "Will be added to Stock.": "Будет добавлено на Склад.",
  "Retail price {p}.": "Розничная цена {p}.",
  "No retail price in the file.": "В файле нет розничной цены.",
  "Retail price {a} → {b}.": "Розничная цена {a} → {b}.",
  "Selling price in dollars: not a number.": "Цена продажи в долларах: не число.",
  "The Catalogue does not have this design yet. The row is kept and applied when the piece arrives from Colibri.": "Этой модели ещё нет в Каталоге. Строка сохранится и применится, когда изделие придёт из Colibri.",
  "The reference fits more than one design. The row is kept and applied when the piece arrives from Colibri.": "Артикул подходит к нескольким моделям. Строка сохранится и применится, когда изделие придёт из Colibri.",
  "The design has several colours and the row does not say which (colour code or colour name). The row is kept and applied when the piece arrives from Colibri.": "У модели несколько цветов, а в строке не указано какой (код или название цвета). Строка сохранится и применится, когда изделие придёт из Colibri.",
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
  "Rows from earlier files waiting for their pieces: {n}": "Строк из прошлых файлов, которые ждут свои изделия: {n}",
  "A row waits until its piece is in Stock (it arrives from Colibri). Remove a row that was loaded by mistake.": "Строка ждёт, пока её изделие не появится на Складе (оно приходит из Colibri). Строку, загруженную по ошибке, можно удалить.",
  "Checked: none of the waiting pieces is in stock yet.": "Проверено: ни одного из ожидаемых изделий на складе пока нет.",
  "Applied to {n} pieces. Still waiting: {w}.": "Применено к изделиям: {n}. Ещё ждут: {w}.",
  "File": "Файл", "Loaded": "Загружено", "Remove": "Удалить",
  "Remove the waiting row for {s}?": "Удалить ожидающую строку для {s}?",
  "The row from {f} will not be applied when the piece arrives. Nothing in stock changes.": "Строка из файла {f} не будет применена, когда изделие появится. На складе ничего не меняется.",
  "Removed the waiting row for {s}.": "Ожидающая строка для {s} удалена.",
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
Object.assign(RU, {
  "How to fill the file": "Как заполнить файл",
  "Download the template and fill one row for each piece. Do not rename, move or delete the headings in row 1.": "Скачайте шаблон и заполните по одной строке на каждое изделие. Не переименовывайте, не переставляйте и не удаляйте заголовки в строке 1.",
  "Every row needs three cells: {h}. The serial number must be the one on the piece, and must not repeat within a brand.": "В каждой строке обязательны три ячейки: {h}. Серийный номер — тот, что на изделии; внутри одного бренда он не должен повторяться.",
  "Columns A–AK are Colibri's own: fill them exactly as you do for Colibri today. Columns {a}–{b} are ours: the table below says what goes in each.": "Столбцы A–AK — это шаблон Colibri: заполняйте их так же, как сейчас для Colibri. Столбцы {a}–{b} — наши: что в них писать, сказано в таблице ниже.",
  "Load the pieces into Colibri as usual. Here, a row for a new piece adds it to Stock when its design is already in the Catalogue; a piece of a new design appears once it is in Colibri, and its row waits for it until then. If Colibri refuses the file because of our columns, load a copy without columns {a}–{b} into Colibri.": "Загрузите изделия в Colibri как обычно. Здесь строка нового изделия добавит его на Склад, если его модель уже есть в Каталоге; изделие новой модели появится после загрузки в Colibri, а его строка до тех пор ждёт. Если Colibri не примет файл из-за наших столбцов, загрузите в Colibri копию без столбцов {a}–{b}.",
  "Choose the file here. You first see every row and what it will change; nothing is saved until you press Load.": "Выберите файл здесь. Сначала вы увидите каждую строку и что она изменит; ничего не сохраняется, пока вы не нажмёте «Загрузить».",
  "Unknown value: leave the cell empty or write TBD. An empty cell changes nothing.": "Значение неизвестно: оставьте ячейку пустой или напишите TBD. Пустая ячейка ничего не меняет.",
  "If any row has an error, nothing is loaded from the file. Correct the rows marked as errors and choose the file again.": "Если хотя бы в одной строке ошибка, из файла не загружается ничего. Исправьте строки, отмеченные как ошибки, и выберите файл снова.",
  "Supplier, contract, invoice, dates, customs declaration, HS code and ИКПУ never overwrite a value already on file: they fill empty fields only, and a different value is shown as a warning.": "Поставщик, договор, инвойс, даты, ГТД, код ТН ВЭД и ИКПУ не заменяют уже записанное значение: заполняются только пустые поля, а расхождение показывается как предупреждение.",
  "Pieces with the same supplier and invoice number go on one arrival document. HS code and ИКПУ are saved for the reference, so they apply to all its pieces.": "Изделия с одним поставщиком и номером инвойса попадают в один документ прихода. Код ТН ВЭД и ИКПУ сохраняются для артикула и действуют для всех его изделий.",
  "Column": "Столбец", "Heading in the file": "Заголовок в файле", "What to write": "Что писать", "Example": "Пример",
  "Customs commodity code (ТН ВЭД): 10 digits, no spaces or dots.": "Код ТН ВЭД: 10 цифр, без пробелов и точек.",
  "Tax catalogue code (ИКПУ): 17 digits.": "Код ИКПУ: 17 цифр.",
  "Legal name of the company that issued the invoice.": "Юридическое название компании, выставившей инвойс.",
  "Contract number and date, as written in the contract.": "Номер и дата договора, как в самом договоре.",
  "Number of the supplier's invoice.": "Номер инвойса поставщика.",
  "Invoice date: a date cell, or text as DD.MM.YYYY.": "Дата инвойса: ячейка с датой или текст в виде ДД.ММ.ГГГГ.",
  "Currency of the invoice, three letters.": "Валюта инвойса, три буквы.",
  "The date the pieces arrived at the boutique: a date cell, or text as DD.MM.YYYY.": "Дата прихода изделий в бутик: ячейка с датой или текст в виде ДД.ММ.ГГГГ.",
  "Customs declaration (ГТД) number.": "Номер таможенной декларации (ГТД).",
  "The barcode printed by the brand on its own tag, if there is one. Not the Colibri barcode: that one is column T.": "Штрихкод с бирки самого бренда, если он есть. Не штрихкод Colibri: тот в столбце T.",
  "Type of piece, in one or two words.": "Вид изделия, одним-двумя словами.",
  "Narrower type, if it helps.": "Более узкий вид, если это полезно.",
  "Metal and its colour.": "Металл и его цвет.",
  "Fineness of the metal.": "Проба металла.",
  "Metal weight in grams: a number.": "Вес металла в граммах: число.",
  "Stones, separated by commas.": "Камни, через запятую.",
  "Certificate number, if the piece has one.": "Номер сертификата, если он есть.",
  "Name of the piece in Uzbek.": "Наименование изделия на узбекском.",
  "The store that receives the piece.": "Магазин, который получает изделие.",
});

/* The guide: what to fill and how. Open until a file is previewed, then folded (a click opens it again).
   One row per column of ours, in file order: [what to write, an example]. Examples are invented. */
const GUIDE_COLS = {
  hs_code: ["Customs commodity code (ТН ВЭД): 10 digits, no spaces or dots.", "7113190000"],
  ikpu: ["Tax catalogue code (ИКПУ): 17 digits.", "07113001001000000"],
  supplier: ["Legal name of the company that issued the invoice.", "Example Gioielli S.p.A."],
  contract: ["Contract number and date, as written in the contract.", "№ 12 от 01.03.2026"],
  invoice_no: ["Number of the supplier's invoice.", "INV-2026-0456"],
  invoice_date: ["Invoice date: a date cell, or text as DD.MM.YYYY.", "14.10.2026"],
  currency: ["Currency of the invoice, three letters.", "EUR"],
  arrival_date: ["The date the pieces arrived at the boutique: a date cell, or text as DD.MM.YYYY.", "02.11.2026"],
  customs_decl: ["Customs declaration (ГТД) number.", "26001/02.11.2026/0001234"],
  brand_barcode: ["The barcode printed by the brand on its own tag, if there is one. Not the Colibri barcode: that one is column T.", "8050000123456"],
  category: ["Type of piece, in one or two words.", "Ring"],
  subcategory: ["Narrower type, if it helps.", "Engagement ring"],
  metal: ["Metal and its colour.", "White gold"],
  metal_purity: ["Fineness of the metal.", "750"],
  metal_weight_g: ["Metal weight in grams: a number.", "4.35"],
  stones: ["Stones, separated by commas.", "diamond, sapphire"],
  certificate_no: ["Certificate number, if the piece has one.", "GIA 1234567890"],
  name_uz: ["Name of the piece in Uzbek.", "Oq oltin uzuk"],
  store: ["The store that receives the piece.", "Tashkent"],
};
// 0 → A, 25 → Z, 26 → AA: the letter of a column of the file
function colLetter(i) { let s = ""; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }
function importGuide(im) {
  const open = typeof im.guide === "boolean" ? im.guide : !im.res;
  const first = colLetter(UPLOAD_COLIBRI.length), last = colLetter(UPLOAD_COLIBRI.length + UPLOAD_OURS.length - 1);
  const li = (text) => el("li", { text });
  return el("details", { class: "imp-guide", id: "imp-guide", open: open ? true : null,
      ontoggle: (e) => { if (e.target.open !== open) im.guide = e.target.open; } },
    el("summary", { text: tr("How to fill the file") }),
    el("ol", { id: "imp-guide-steps" },
      li(tr("Download the template and fill one row for each piece. Do not rename, move or delete the headings in row 1.")),
      li(tr("Every row needs three cells: {h}. The serial number must be the one on the piece, and must not repeat within a brand.", { h: UPLOAD_REQUIRED.join(", ") })),
      li(tr("Columns A–AK are Colibri's own: fill them exactly as you do for Colibri today. Columns {a}–{b} are ours: the table below says what goes in each.", { a: first, b: last })),
      li(tr("Load the pieces into Colibri as usual. Here, a row for a new piece adds it to Stock when its design is already in the Catalogue; a piece of a new design appears once it is in Colibri, and its row waits for it until then. If Colibri refuses the file because of our columns, load a copy without columns {a}–{b} into Colibri.", { a: first, b: last })),
      li(tr("Choose the file here. You first see every row and what it will change; nothing is saved until you press Load."))),
    el("ul", { id: "imp-guide-rules" },
      li(tr("Unknown value: leave the cell empty or write TBD. An empty cell changes nothing.")),
      li(tr("If any row has an error, nothing is loaded from the file. Correct the rows marked as errors and choose the file again.")),
      li(tr("Supplier, contract, invoice, dates, customs declaration, HS code and ИКПУ never overwrite a value already on file: they fill empty fields only, and a different value is shown as a warning.")),
      li(tr("Pieces with the same supplier and invoice number go on one arrival document. HS code and ИКПУ are saved for the reference, so they apply to all its pieces."))),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl", id: "imp-guide-cols" },
      el("thead", null, el("tr", null, el("th", { scope: "col", text: tr("Column") }), el("th", { scope: "col", text: tr("Heading in the file") }),
        el("th", { scope: "col", text: tr("What to write") }), el("th", { scope: "col", text: tr("Example") }))),
      el("tbody", null, UPLOAD_OURS.map(([h, key], i) => el("tr", null,
        el("td", { class: "mono", text: colLetter(UPLOAD_COLIBRI.length + i) }), el("td", { text: h }),
        el("td", { text: tr(GUIDE_COLS[key][0]) }), el("td", { class: "mono", text: GUIDE_COLS[key][1] })))))));
}

function renderImport(main) {
  const im = S.imp || (S.imp = { busy: null, err: null, file: null, rows: null, res: null, done: null, waiting: null });
  const sec = el("section", { class: "screen", id: "screen-import" },
    el("div", { class: "screen-head" }, el("h1", { class: "title", text: tr("Upload file for new arrivals") }),
      el("div", { class: "aside" },
        el("button", { type: "button", class: "btn", id: "imp-template", onclick: downloadTemplate, text: tr("Download the template") }),
        el("label", { class: "btn primary", id: "imp-pick-label", for: "imp-file", text: tr("Choose a file") }),
        el("input", { type: "file", id: "imp-file", class: "visually-hidden", accept: ".xlsx", onchange: (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); } }))),
    el("p", { class: "small", id: "imp-help", text: tr("The Colibri upload template (columns A–AK, unchanged) with our columns added from AL. Unknown values: leave empty or write TBD.") }),
    importGuide(im));
  if (im.waiting > 0 && !im.res) {
    const rows = im.waitingRows || [];
    sec.append(el("div", { class: "notice imp-waiting", id: "imp-waiting" },
      el("p", {}, el("strong", { text: tr("Rows from earlier files waiting for their pieces: {n}", { n: im.waiting }) }), " ",
        el("button", { type: "button", class: "btn", id: "imp-check", onclick: importCheckPending, text: tr("Check now") })),
      el("p", { class: "small", text: tr("A row waits until its piece is in Stock (it arrives from Colibri). Remove a row that was loaded by mistake.") }),
      rows.length ? el("div", { class: "table-wrap" }, el("table", { class: "tbl", id: "imp-waiting-rows" },
        el("thead", null, el("tr", null, ["Brand", "Serial", "Reference", "File", "Loaded"].map((h) => el("th", { scope: "col", text: tr(h) })), el("th", { scope: "col" }, el("span", { class: "sr-only", text: tr("Remove") })))),
        el("tbody", null, rows.map((r) => el("tr", null,
          el("td", { text: blank(r.brand) ? "—" : r.brand }), el("td", { class: "mono", text: blank(r.serial) ? "—" : r.serial }),
          el("td", { class: "mono", text: blank(r.article) ? "—" : r.article }), el("td", { text: blank(r.file_name) ? "—" : r.file_name }),
          el("td", { text: [fmtDate(r.created_at), r.actor].filter((x) => !blank(x)).join(" · ") }),
          el("td", { class: "r" }, el("button", { type: "button", class: "btn imp-remove", onclick: () => importRemoveWaiting(r), text: tr("Remove") }))))))) : null));
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
  Object.assign(im, { busy: "Reading the file…", err: null, res: null, rows: null, done: null, file: file.name, guide: null });
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
      done: res.summary.create ? tr("Loaded: {c} added, {u} updated, {p} waiting for their pieces.", { c: res.summary.create, u: res.summary.update, p: res.summary.pending })
        : tr("Loaded: {u} updated, {p} waiting for their pieces.", { u: res.summary.update, p: res.summary.pending }) });
    if (res.summary.create || res.summary.repriced) { if (typeof loadList === "function") loadList(); if (typeof loadFacets === "function") loadFacets(); }
    if (res.waiting > 0) importRefreshWaiting();   // which rows wait, for the list under the message
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
    if (S.imp !== im || S.locked) return;
    im.waiting = r.waiting; im.waitingRows = r.rows || []; im.err = null;
    im.done = !r.applied ? tr("Checked: none of the waiting pieces is in stock yet.")
      : r.waiting ? tr("Applied to {n} pieces. Still waiting: {w}.", { n: r.applied, w: r.waiting }) : tr("Applied to {n} pieces.", { n: r.applied });
  } catch (e) { if (S.imp !== im || S.locked) return; im.err = e.message; }
  importRedraw();
}
// A row loaded by mistake (a test row, a wrong serial) never finds its piece: it can be taken off the waiting list.
async function importRemoveWaiting(row) {
  const im = S.imp;
  const ok = await confirmBox({ title: tr("Remove the waiting row for {s}?", { s: [row.brand, row.serial].filter((x) => !blank(x)).join(" ") }),
    body: tr("The row from {f} will not be applied when the piece arrives. Nothing in stock changes.", { f: row.file_name || "—" }), ok: tr("Remove"), cancel: tr("Cancel") });
  if (!ok || S.imp !== im || S.locked) return;
  try {
    const r = await api("import_remove", { brand_key: row.brand_key, serial_key: row.serial_key });
    if (S.imp !== im || S.locked) return;
    im.waiting = r.waiting; im.waitingRows = r.rows || []; im.err = null;
    im.done = tr("Removed the waiting row for {s}.", { s: [row.brand, row.serial].filter((x) => !blank(x)).join(" ") });
  } catch (e) { if (S.imp !== im || S.locked) return; im.err = e.message; }
  importRedraw();
}
// After a load the list of waiting rows is asked again (the load answers with their number only).
async function importRefreshWaiting() {
  const im = S.imp;
  try { const r = await api("import_pending", { check_only: true }); if (S.imp !== im || S.locked) return; im.waiting = r.waiting; im.waitingRows = r.rows || []; importRedraw(); }
  catch (e) { /* the number is already shown */ }
}
// The count of waiting rows, asked once when the screen is first opened.
async function importLoadWaiting() {
  if (!S.rights.manage || (S.imp && S.imp.waiting !== null)) return;
  S.imp = S.imp || { busy: null, err: null, file: null, rows: null, res: null, done: null, waiting: null };
  S.imp.waiting = 0;
  const im = S.imp;
  try { const r = await api("import_pending", { check_only: true }); if (S.imp !== im || S.locked) return; im.waiting = r.waiting; im.waitingRows = r.rows || []; importRedraw(); } catch (e) { /* the screen works without it */ }
}

const IMPORT_ERR = {
  no_brand: () => tr("No brand."), no_serial: () => tr("No serial number."), no_article: () => tr("No reference."),
  bad_hs: () => tr("HS code must be 10 digits."), bad_ikpu: () => tr("ИКПУ must be 17 digits."),
  bad_price: () => tr("Selling price in dollars: not a number."),
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
  const nCreate = s.create || 0, toLoad = s.update + s.pending + nCreate;
  const PENDING_WHY = {
    no_design: "The Catalogue does not have this design yet. The row is kept and applied when the piece arrives from Colibri.",
    design_unclear: "The reference fits more than one design. The row is kept and applied when the piece arrives from Colibri.",
    colour_unclear: "The design has several colours and the row does not say which (colour code or colour name). The row is kept and applied when the piece arrives from Colibri.",
  };
  const rowText = (r) => {
    if (r.status === "error") return (r.errors || []).map((e) => (IMPORT_ERR[e.code] ? IMPORT_ERR[e.code](e) : e.code));
    const warn = (r.warnings || []).map((w) => (IMPORT_WARN[w.code] ? IMPORT_WARN[w.code](w) : w.code));
    if (r.status === "pending") return [tr(PENDING_WHY[r.reason] || "Not in stock yet. The row is kept and applied when the piece appears.")];
    if (r.status === "create") return [tr("Will be added to Stock."), blank(r.price_uzs) ? tr("No retail price in the file.") : tr("Retail price {p}.", { p: fmtUZS(r.price_uzs) })];
    const priced = r.price ? [tr("Retail price {a} → {b}.", { a: blank(r.price.old) ? "—" : fmtUZS(r.price.old), b: fmtUZS(r.price.new) })] : [];
    if (r.status === "same") return [tr("Already on file.")].concat(warn);
    return priced.concat([importChangeWords(r.changes)], warn);
  };
  const STATUS = { create: ["New piece", "info"], update: ["Will update", "info"], same: ["No change", "done"], pending: ["Waiting for the piece", "line"], error: ["Error", "alert"] };
  return [
    el("p", { class: "small", id: "imp-file-name", text: tr("File: {f}", { f: im.file }) }),
    el("div", { class: "totals", id: "imp-summary" }, nCreate ? card("create", "New pieces", nCreate) : null, card("update", "Will update", s.update), card("same", "No change", s.same),
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
