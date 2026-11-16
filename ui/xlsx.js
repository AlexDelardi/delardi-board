/* ===========================================================================
   Delardi UI kit — kitXlsx(sheetName, columns, rows) → Blob

   A real .xlsx written by hand, so a tool page can hand a list to Excel without
   loading anything (a page that loads nothing from anywhere is the security
   model; a CSV has its own troubles with Cyrillic, ";" against "," and a
   leading "+" read as a formula). It is a stored (uncompressed) ZIP holding
   six small XML parts; at a few thousand rows that is well under a megabyte.

     columns  [{ title, key, type }]  type: "text" (default) | "number" | "date"
     rows     [{ [key]: value, … }]   plain objects
     returns  a Blob (MIME application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

   Cells: a number column holds numbers (null, "" or a non-finite value leaves
   the cell empty); a date column takes "YYYY-MM-DD" (anything after the tenth
   character is ignored; the caller decides which day that is) and writes a real
   date shown dd.mm.yyyy; text is written as is. The first row is the bold
   heading row, frozen, with a filter. The sheet name is cut to 31 characters
   and loses the characters Excel forbids.

   Generic by design: no words of any tool, no translation, no logging. Saving
   the file (a Blob URL and a temporary <a download>) is the caller's business.
   Everything lives inside the function, so inlining this file adds one global.
   ========================================================================= */
const kitXlsx = (() => {
  // ---- a zip, STORE only: no compression, so no deflate to write or to get wrong
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
  // files: [{ name, text }], in the order they go in.
  function zipStore(files) {
    const enc = new TextEncoder();
    const { t, dt } = dosTime(new Date());
    const parts = files.map((f) => {
      const name = enc.encode(f.name);
      const data = enc.encode(f.text);
      return { name, data, crc: crc32(data) };
    });
    let size = 22;
    for (const p of parts) size += 30 + p.name.length + p.data.length + 46 + p.name.length;
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
      view.setUint32(off + 42, offsets[i], true);
      out.set(p.name, off + 46);
      off += 46 + p.name.length;
    });
    view.setUint32(off, 0x06054b50, true);
    view.setUint16(off + 8, parts.length, true);
    view.setUint16(off + 10, parts.length, true);
    view.setUint32(off + 12, off - dirStart, true);
    view.setUint32(off + 16, dirStart, true);
    return out;
  }

  // ---- the workbook
  const xmlEsc = (v) => String(v == null ? "" : v)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - XL_EPOCH) / 86400000 : null;
  }
  const textCell = (ref, v, style) =>
    `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;

  function sheetXml(columns, rows) {
    const last = colRef(columns.length);
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      `<dimension ref="A1:${last}${rows.length + 1}"/>`,
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      '<sheetFormatPr defaultRowHeight="15"/>',
      "<cols>" + columns.map((c, i) => {
        const w = Math.max(12, Math.min(40, String(c.title).length + 4));
        return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
      }).join("") + "</cols>",
      "<sheetData>",
      '<row r="1">' + columns.map((c, i) => textCell(colRef(i + 1) + "1", c.title, 1)).join("") + "</row>"];
    rows.forEach((row, ri) => {
      const r = ri + 2;
      const cells = [];
      columns.forEach((c, ci) => {
        const v = row[c.key];
        if (v === null || v === undefined || v === "") return;
        const ref = colRef(ci + 1) + r;
        if (c.type === "number") {
          if (typeof v === "number" && isFinite(v)) cells.push(`<c r="${ref}" s="3"><v>${v}</v></c>`);
        } else if (c.type === "date") {
          const d = xlDate(v);
          cells.push(d === null ? textCell(ref, v) : `<c r="${ref}" s="2"><v>${d}</v></c>`);
        } else cells.push(textCell(ref, v));
      });
      out.push(`<row r="${r}">` + cells.join("") + "</row>");
    });
    out.push("</sheetData>");
    if (rows.length) out.push(`<autoFilter ref="A1:${last}${rows.length + 1}"/>`);
    out.push("</worksheet>");
    return out.join("");
  }
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const STYLES_XML = HEAD +
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
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  return function kitXlsx(sheetName, columns, rows) {
    const name = xmlEsc(String(sheetName || "Sheet1").replace(/[\\/?*\[\]:]/g, " ").slice(0, 31));
    const files = [
      { name: "[Content_Types].xml", text: HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>" },
      { name: "_rels/.rels", text: HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", text: HEAD +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", text: HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", text: STYLES_XML },
      { name: "xl/worksheets/sheet1.xml", text: sheetXml(columns, rows) },
    ];
    return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };
})();
