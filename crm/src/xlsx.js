/* ===========================================================================
   Downloading a list as a workbook (API v13)
   Alex, 15 Oct 2026: the three people who hold the export right must be able
   to take the list they are looking at into Excel — a call sheet, a brand
   meeting, a birthday list for December.

   It is written here, in the page, by hand. The page loads nothing from
   anywhere (that is the whole security model), so there is no SheetJS to
   reach for; and a CSV is worse than it looks — Cyrillic encoding, the ";"
   against "," quarrel in a Russian Excel, and +998… read as a formula. What
   follows is the smallest real .xlsx: a stored (uncompressed) ZIP holding six
   small XML parts. At ~500 records the file is a few hundred KB, so not
   compressing costs nothing and saves a deflate implementation.

   Numbers stay numbers and dates stay dates, so the sheet sums and pivots.
   ========================================================================= */
Object.assign(RU, {
  "Download .xlsx": "Скачать .xlsx",
  "Download": "Скачать",
  "Download the list": "Скачать список",
  "Download the month": "Скачать месяц",
  "{n} records will be downloaded": "Будет скачано записей: {n}",
  "Include phone numbers": "Включить номера телефонов",
  "Leave the numbers out when the file is going to a brand, an agency or a meeting.":
    "Снимите галочку, если файл уходит бренду, агентству или на встречу.",
  "The file carries your name and today's date, and the download is logged.":
    "В файле будут ваше имя и дата, а сама выгрузка записывается в журнал.",
  "Preparing the file…": "Готовим файл…",
  "Saved: {name}": "Сохранено: {name}",
  "Nothing to download: no record matches these filters.": "Скачивать нечего: под фильтры не подходит ни одна запись.",
  "Your account cannot download client lists.": "Вашей учётной записи недоступна выгрузка списков клиентов.",
  "The file could not be made.": "Не удалось собрать файл.",
  // the sheets and their headings
  "Clients": "Клиенты",
  "About this export": "Об этой выгрузке",
  "Reference": "Код",
  "Name": "Имя",
  "Phone": "Телефон",
  "Other numbers": "Другие номера",
  "Birthday": "День рождения",
  "Birthday confirmed": "Дата подтверждена",
  "Owner": "Ответственный",
  "Record": "Запись",
  "Clean-up status": "Статус проверки",
  "Segment": "Сегмент",
  "Lifecycle": "Жизненный цикл",
  "Lifetime spend, UZS": "Сумма покупок, сум",
  "Purchases": "Покупки",
  "First purchase": "Первая покупка",
  "Last purchase": "Последняя покупка",
  "Last contact": "Последний контакт",
  "Last contact by": "Контакт вёл",
  "How": "Как",
  "Do not contact": "Не беспокоить",
  "In Telegram": "Есть в Telegram",
  "Added by the team": "Добавлен командой",
  "Related party": "Связанное лицо",
  "Yes": "Да",
  "No": "Нет",
  "Filters": "Фильтры",
  "Sort": "Сортировка",
  "Records": "Записей",
  "Phone numbers": "Номера телефонов",
  "Included": "Включены",
  "Left out": "Не включены",
  "Exported by": "Выгрузил(а)",
  "Exported at": "Дата и время",
  "Delardi client data — internal. Do not forward outside the company.":
    "Клиентские данные Delardi — для внутреннего пользования. Не пересылайте за пределы компании.",
  "Everything on file": "Все записи",
  "Birthdays in {month}": "Дни рождения, {month}",
});

/* ------------------------------------------------------------------- a zip */
// STORE only: no compression, so no deflate to write or to get wrong.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  const t = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const dt = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { t, dt };
}
// files: [{ name, text }] — the parts of the workbook, in the order they go in.
function zipStore(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const { t, dt } = dosTime(now);
  const parts = files.map((f) => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    return { name, data, crc: crc32(data) };
  });
  let size = 0;
  for (const p of parts) size += 30 + p.name.length + p.data.length + 46 + p.name.length;
  size += 22;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let off = 0;
  const offsets = [];
  for (const p of parts) {
    offsets.push(off);
    view.setUint32(off, 0x04034b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 0x0800, true);       // names are UTF-8
    view.setUint16(off + 8, 0, true);            // stored
    view.setUint16(off + 10, t, true);
    view.setUint16(off + 12, dt, true);
    view.setUint32(off + 14, p.crc, true);
    view.setUint32(off + 18, p.data.length, true);
    view.setUint32(off + 22, p.data.length, true);
    view.setUint16(off + 26, p.name.length, true);
    view.setUint16(off + 28, 0, true);
    out.set(p.name, off + 30);
    out.set(p.data, off + 30 + p.name.length);
    off += 30 + p.name.length + p.data.length;
  }
  const dirStart = off;
  parts.forEach((p, i) => {
    view.setUint32(off, 0x02014b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 20, true);
    view.setUint16(off + 8, 0x0800, true);
    view.setUint16(off + 10, 0, true);
    view.setUint16(off + 12, t, true);
    view.setUint16(off + 14, dt, true);
    view.setUint32(off + 16, p.crc, true);
    view.setUint32(off + 20, p.data.length, true);
    view.setUint32(off + 24, p.data.length, true);
    view.setUint16(off + 28, p.name.length, true);
    view.setUint16(off + 30, 0, true);
    view.setUint16(off + 32, 0, true);
    view.setUint16(off + 34, 0, true);
    view.setUint16(off + 36, 0, true);
    view.setUint32(off + 38, 0, true);
    view.setUint32(off + 42, offsets[i], true);
    out.set(p.name, off + 46);
    off += 46 + p.name.length;
  });
  view.setUint32(off, 0x06054b50, true);
  view.setUint16(off + 4, 0, true);
  view.setUint16(off + 6, 0, true);
  view.setUint16(off + 8, parts.length, true);
  view.setUint16(off + 10, parts.length, true);
  view.setUint32(off + 12, dirStart ? off - dirStart : 0, true);
  view.setUint32(off + 16, dirStart, true);
  view.setUint16(off + 20, 0, true);
  return out;
}

/* -------------------------------------------------------------- a workbook */
const xmlEsc = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/\u0000-\u0008|\u000b|\u000c|\u000e-\u001f/g, "");
// 1 → A, 27 → AA
function colRef(n) {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}
// Excel counts days from 30 December 1899.
const XL_EPOCH = Date.UTC(1899, 11, 30);
function xlDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - XL_EPOCH) / 86400000;
}
// A column: { label, width, type } where type is text (default), num or date.
function sheetXml(cols, rows, opts) {
  const o = opts || {};
  const last = colRef(cols.length);
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  lines.push(`<dimension ref="A1:${last}${Math.max(rows.length + 1, 1)}"/>`);
  lines.push('<sheetViews><sheetView workbookViewId="0">' +
    (o.freeze === false ? "" : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>') +
    "</sheetView></sheetViews>");
  lines.push('<sheetFormatPr defaultRowHeight="15"/>');
  lines.push("<cols>" + cols.map((c, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join("") + "</cols>");
  lines.push("<sheetData>");
  // the heading row
  lines.push('<row r="1">' + cols.map((c, i) =>
    `<c r="${colRef(i + 1)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlEsc(c.label)}</t></is></c>`).join("") + "</row>");
  rows.forEach((row, ri) => {
    const r = ri + 2;
    const cells = [];
    row.forEach((v, ci) => {
      if (v === null || v === undefined || v === "") return;
      const ref = colRef(ci + 1) + r;
      const type = cols[ci] ? cols[ci].type : "text";
      if (type === "num" && typeof v === "number" && isFinite(v)) cells.push(`<c r="${ref}" s="3"><v>${v}</v></c>`);
      else if (type === "date") {
        const d = xlDate(v);
        if (d === null) cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
        else cells.push(`<c r="${ref}" s="2"><v>${d}</v></c>`);
      } else cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
    });
    lines.push(`<row r="${r}">` + cells.join("") + "</row>");
  });
  lines.push("</sheetData>");
  if (o.filter !== false && rows.length) lines.push(`<autoFilter ref="A1:${last}${rows.length + 1}"/>`);
  lines.push("</worksheet>");
  return lines.join("");
}
const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";
// sheets: [{ name, cols, rows, freeze, filter }]
function workbookBytes(sheets) {
  const files = [
    { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>" },
    { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>" },
    { name: "xl/workbook.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${xmlEsc(String(s.name).slice(0, 31).replace(/[\\/?*\[\]:]/g, " "))}" ` +
        `sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      "</sheets></workbook>" },
    { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" ` +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
        `Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" ` +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>" },
    { name: "xl/styles.xml", text: STYLES_XML },
  ];
  sheets.forEach((s, i) => files.push({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    text: sheetXml(s.cols, s.rows, { freeze: s.freeze, filter: s.filter }),
  }));
  return zipStore(files);
}
// Hand the file to the browser. Safari on an iPhone opens it in its own viewer
// rather than saving it quietly; that is the browser's business, not ours.
function saveWorkbook(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
