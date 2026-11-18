/* ===========================================================================
   Delardi UI kit — kitXlsxRead(arrayBuffer) → Promise<rows>
   Reads the first sheet of an .xlsx workbook into an array of rows, each an
   array of cell values (text, number, or "YYYY-MM-DD" for date cells; empty
   cells are null). Row and cell positions are kept, so rows[0][2] is C1.

   An .xlsx is a zip of XML parts. Parts are read through the browser's own
   DecompressionStream ("deflate-raw") and DOMParser: no library. Generic by
   design: no words of any tool, no translation. One global.
   ========================================================================= */
const kitXlsxRead = (() => {
  const dec = new TextDecoder("utf-8");
  // The zip's central directory: name → { method, compressed size, offset of the local header }.
  function entries(buf) {
    const v = new DataView(buf);
    let i = buf.byteLength - 22;
    while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error("not a zip");
    const n = v.getUint16(i + 10, true);
    let off = v.getUint32(i + 16, true);
    const out = {};
    for (let k = 0; k < n; k++) {
      if (v.getUint32(off, true) !== 0x02014b50) throw new Error("bad zip directory");
      const method = v.getUint16(off + 10, true), csize = v.getUint32(off + 20, true);
      const nl = v.getUint16(off + 28, true), el = v.getUint16(off + 30, true), cl = v.getUint16(off + 32, true);
      const name = dec.decode(new Uint8Array(buf, off + 46, nl));
      out[name] = { method, csize, local: v.getUint32(off + 42, true) };
      off += 46 + nl + el + cl;
    }
    return out;
  }
  async function part(buf, e) {
    const v = new DataView(buf);
    const start = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
    const raw = new Uint8Array(buf, start, e.csize);
    if (e.method === 0) return dec.decode(raw);
    if (e.method !== 8) throw new Error("unsupported compression");
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return dec.decode(await new Response(stream).arrayBuffer());
  }
  const xml = (text) => new DOMParser().parseFromString(text, "application/xml");
  const kids = (node, name) => [...node.getElementsByTagName(name)];
  // "BC12" → column index 54 (zero-based)
  function colIndex(ref) {
    let n = 0;
    for (const ch of ref) { if (ch < "A" || ch > "Z") break; n = n * 26 + (ch.charCodeAt(0) - 64); }
    return n - 1;
  }
  // Excel's day number → "YYYY-MM-DD" (the 1900 system, with its phantom 29 Feb 1900).
  function isoDay(serial) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // Which cell styles are dates: built-in date formats, or a custom format with day/month/year letters.
  function dateStyles(stylesText) {
    if (!stylesText) return new Set();
    const doc = xml(stylesText);
    const custom = {};
    for (const f of kids(doc, "numFmt")) custom[f.getAttribute("numFmtId")] = f.getAttribute("formatCode") || "";
    const builtin = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
    const out = new Set();
    const xfs = kids(doc, "cellXfs")[0];
    if (!xfs) return out;
    kids(xfs, "xf").forEach((xf, i) => {
      const id = Number(xf.getAttribute("numFmtId") || 0);
      const code = (custom[id] || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
      if (builtin.has(id) || /[dy]/i.test(code) || /m{3,}/i.test(code)) out.add(i);
    });
    return out;
  }
  return async function kitXlsxRead(buf) {
    const dir = entries(buf);
    const get = async (name) => (dir[name] ? part(buf, dir[name]) : null);
    const strings = [];
    const ss = await get("xl/sharedStrings.xml");
    if (ss) for (const si of kids(xml(ss), "si")) strings.push(kids(si, "t").map((t) => t.textContent).join(""));
    const dates = dateStyles(await get("xl/styles.xml"));
    // the first sheet as the workbook orders them
    let sheet = "xl/worksheets/sheet1.xml";
    const wb = await get("xl/workbook.xml"), rels = await get("xl/_rels/workbook.xml.rels");
    if (wb && rels) {
      const first = kids(xml(wb), "sheet")[0];
      const rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
      const rel = kids(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === rid);
      if (rel) sheet = "xl/" + rel.getAttribute("Target").replace(/^\/?(xl\/)?/, "");
    }
    const text = await get(sheet);
    if (!text) throw new Error("no sheet in the workbook");
    const rows = [];
    for (const r of kids(xml(text), "row")) {
      const ri = Number(r.getAttribute("r")) - 1;
      const row = [];
      for (const c of kids(r, "c")) {
        const ci = colIndex(c.getAttribute("r") || "");
        const t = c.getAttribute("t"), vEl = kids(c, "v")[0];
        let val = null;
        if (t === "inlineStr") val = kids(c, "t").map((x) => x.textContent).join("");
        else if (vEl) {
          const raw = vEl.textContent;
          if (t === "s") val = strings[Number(raw)] ?? null;
          else if (t === "str" || t === "e") val = raw;
          else if (t === "b") val = raw === "1";
          else { const n = Number(raw); val = dates.has(Number(c.getAttribute("s") || 0)) && !isNaN(n) ? isoDay(n) : (isNaN(n) ? raw : n); }
        }
        if (val === "") val = null;
        row[ci] = val;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
      rows[ri] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  };
})();
