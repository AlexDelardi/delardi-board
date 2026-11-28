/* ===========================================================================
   Stock — "Download .xlsx": the filtered list as a real workbook. stock-api
   `export` takes the same filters as the screen (every page, at most 5 000
   rows; more is a 409 with a sentence written for the screen) and kitXlsx()
   (ui/xlsx.js) writes the file. No cost column: the rows carry none.
   ========================================================================= */
Object.assign(RU, {
  "Download .xlsx": "Скачать .xlsx",
  "Preparing the file…": "Готовим файл…",
  "Saved: {name}": "Сохранено: {name}",
  "Nothing to download: no piece matches these filters.": "Скачивать нечего: под фильтры не подходит ни одно изделие.",
  "Barcode": "Штрихкод",
  "Reference": "Артикул",
  "Model": "Модель",
  "Collection": "Коллекция",
  "Price, so'm": "Цена, сум",
});

function exportButton() {
  return el("button", { type: "button", class: "btn", id: "export-btn", onclick: exportList,
    disabled: S.exporting ? true : null, text: tr(S.exporting ? "Preparing the file…" : "Download .xlsx") });
}
function setExporting(on) {
  S.exporting = on;
  const b = $("#export-btn");
  if (!b) return;
  b.disabled = on;
  b.textContent = tr(on ? "Preparing the file…" : "Download .xlsx");
}

// "2026-11-16", the boutique's day.
function tashkentIsoDay(iso) {
  const t = blank(iso) ? null : tashkentDay(iso);
  return t ? t.y + "-" + String(t.m).padStart(2, "0") + "-" + String(t.d).padStart(2, "0") : "";
}
const exportColumns = () => [
  { title: tr("Serial"), key: "serial" },
  { title: tr("Barcode"), key: "barcode" },
  { title: tr("Brand"), key: "brand" },
  { title: tr("Reference"), key: "article" },
  { title: tr("Model"), key: "model_name" },
  { title: tr("Collection"), key: "collection" },
  { title: tr("Category"), key: "category_word" },
  { title: tr("Size"), key: "size" },
  { title: tr("State"), key: "state_word" },
  { title: tr("Arrived"), key: "since", type: "date" },
  { title: tr("Price, so'm"), key: "price_uzs", type: "number" },
];

async function exportList() {
  if (S.exporting) return;
  setExporting(true);
  try {
    const f = listFilters();
    delete f.page;
    const r = await api("export", { filters: f });
    if (S.locked) return;
    const rows = (r.rows || []).map((p) => Object.assign({}, p, {
      category_word: blank(p.category) ? "" : categoryWord(p.category),
      state_word: stateWord(p.state),
      since: p.arrived || null,        // the arrival date; empty when the piece has no arrival document
    }));
    if (!rows.length) { toast(tr("Nothing to download: no piece matches these filters.")); return; }
    const name = "Delardi_stock_" + tashkentIsoDay(new Date().toISOString()) + ".xlsx";
    const blob = kitXlsx(tr("Stock"), exportColumns(), rows);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    toast(tr("Saved: {name}", { name }));
  } catch (e) {
    if (!S.locked) toast(e.message, true);
  } finally {
    setExporting(false);
  }
}
