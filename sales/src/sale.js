/* ===========================================================================
   The sale screen (spec §5.1)
   One line is one physical piece: no quantity, and the same piece cannot be
   on a sale twice. A scanner types into the search box and ends with Enter;
   Enter with exactly one piece that can be sold adds it straight away.
   ========================================================================= */
Object.assign(RU, {
  "Scan or type: barcode, serial, article, name…": "Сканируйте или введите: штрихкод, серийный номер, артикул, название…",
  "Find a piece": "Найти изделие",
  "Scan a barcode, or type at least two characters.": "Отсканируйте штрихкод или введите хотя бы два символа.",
  "Searching…": "Ищем…",
  "Nothing found for “{q}”.": "По запросу «{q}» ничего не найдено.",
  "Already in this sale.": "Уже в этой продаже.",
  "Already in this sale": "Уже в этой продаже",
  "in suspended sale #{n}": "в отложенной продаже №{n}",
  "In stock": "В наличии",
  "In transit": "В пути",
  "Reserved": "Зарезервировано",
  "Booked out": "Выдано",
  "Damaged": "Повреждено",
  "Sold": "Продано",
  "Not received": "Не получено",
  "no price": "нет цены",
  "Seller": "Продавец",
  "Choose the seller…": "Выберите продавца…",
  "seller": "продавец",
  "Seller: {s}": "Продавец: {s}",
  "Same as the sale": "Как у продажи",
  "Seller for this piece": "Продавец этого изделия",
  "Price": "Цена",
  "Discount": "Скидка",
  "list {p}": "по прайсу {p}",
  "Remove {s}": "Убрать {s}",
  "Same % for all lines": "Одинаковый % для всех строк",
  "Gives every line {p}%": "Ставит {p}% во всех строках",
  "Type a discount on a line first.": "Сначала введите скидку в одной из строк.",
  "A discount can be at most 99.9999%.": "Скидка — не больше 99,9999%.",
  "Scan or find the first piece.": "Отсканируйте или найдите первое изделие.",
  "A sale can hold at most {n} pieces.": "В продаже может быть не больше {n} изделий.",
  "Total": "Итого",
  "Payment →": "К оплате →",
  "Every piece needs a price.": "У каждого изделия должна быть цена.",
  "size {s}": "размер {s}",
  "so'm": "сум",
});

// Material and stone words, as the catalogue shows them (catalogue/src/model.js).
const METAL_NAMES = {
  white_gold: ["White gold", "Белое золото"], yellow_gold: ["Yellow gold", "Жёлтое золото"], rose_gold: ["Rose gold", "Розовое золото"],
  gold: ["Gold", "Золото"], platinum: ["Platinum", "Платина"], silver: ["Silver", "Серебро"], steel: ["Steel", "Сталь"], titanium: ["Titanium", "Титан"],
  ceramic: ["Ceramic", "Керамика"], carbon: ["Carbon", "Карбон"], aluminium: ["Aluminium", "Алюминий"], rubber: ["Rubber", "Каучук"], leather: ["Leather", "Кожа"],
};
const STONE_NAMES = {
  diamond: ["Diamonds", "Бриллианты"], lab_diamond: ["Lab-grown diamonds", "Выращенные бриллианты"], sapphire: ["Sapphires", "Сапфиры"],
  emerald: ["Emeralds", "Изумруды"], ruby: ["Rubies", "Рубины"], rubellite: ["Rubellite", "Рубеллит"], tsavorite: ["Tsavorite", "Цаворит"],
  tanzanite: ["Tanzanite", "Танзанит"], topaz: ["Topaz", "Топаз"], amethyst: ["Amethyst", "Аметист"], pearl: ["Pearls", "Жемчуг"],
  mother_of_pearl: ["Mother-of-pearl", "Перламутр"], opal: ["Opals", "Опалы"], turquoise: ["Turquoise", "Бирюза"], malachite: ["Malachite", "Малахит"],
  lapis: ["Lapis lazuli", "Лазурит"], onyx: ["Onyx", "Оникс"], agate: ["Agate", "Агат"], crystal: ["Crystal", "Кристалл"],
};
const STATE_WORDS = { in_stock: "In stock", in_transit: "In transit", reserved: "Reserved", booked_out: "Booked out",
  damaged: "Damaged", sold: "Sold", not_received: "Not received" };
function keyName(dict, k) {
  if (dict[k]) return dict[k][LANG === "ru" ? 1 : 0];
  const w = String(k).replace(/_/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}
// "Move Uno Pavé Ring" rather than "Move Uno Move Uno Pavé Ring".
function pieceName(p) {
  const c = (p.collection || "").trim(), m = (p.model_name || "").trim();
  if (m && c && m.toLowerCase().includes(c.toLowerCase())) return m;
  return [c, m].filter(Boolean).join(" ") || p.article || "";
}
// The short spec line: metals, size, stones — joined with ", ".
function pieceSpec(p) {
  return [
    ...(p.metal_keys || []).map((k) => keyName(METAL_NAMES, k)),
    blank(p.size) ? null : tr("size {s}", { s: p.size }),
    ...(p.stone_keys || []).map((k) => keyName(STONE_NAMES, k)),
  ].filter(Boolean).join(", ");
}
function pctText(n) {
  if (!n) return "";
  return String(Number(Number(n).toFixed(4)));
}
// Typed text → a discount the database can hold: 0 … 99.9999, four decimals.
function parsePct(s) {
  const t = String(s || "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(t);
  if (!isFinite(n) || n <= 0) return { pct: 0, capped: false };
  if (n > MAX_DISCOUNT) return { pct: MAX_DISCOUNT, capped: true };
  return { pct: Math.round(n * 10000) / 10000, capped: false };
}
const inSale = (p) => S.sale.lines.some((l) => l.piece_id === p.piece_id);
const stateWords = (p) => inSale(p) ? tr("Already in this sale")
  : p.held ? tr("in suspended sale #{n}", { n: p.held.draft_id })
  : tr(STATE_WORDS[p.state] || p.state);

/* ------------------------------------------------------------------ search */
let searchTimer = null, searchSeq = 0;
async function runSearch(q) {
  const seq = ++searchSeq;
  S.search.busy = true;
  try {
    const r = await api("search", { q });
    if (seq !== searchSeq) return null;          // a newer search has started
    S.search = { q, pieces: r.pieces || [], open: true, busy: false };
    renderSugg();
    return S.search.pieces;
  } catch (e) {
    if (seq === searchSeq) { S.search.busy = false; if (e.status !== 401) toast(e.message); }
    return null;
  }
}
function onSearchInput(ev) {
  const q = ev.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 2) { searchSeq++; S.search = { q: "", pieces: null, open: false, busy: false }; renderSugg(); return; }
  searchTimer = setTimeout(() => runSearch(q), 250);
}
async function onSearchKey(ev) {
  if (ev.key === "Escape") { closeSugg(); return; }
  if (ev.key !== "Enter") return;
  ev.preventDefault();
  clearTimeout(searchTimer);
  const q = ev.target.value.trim();
  if (!q) return;
  const pieces = (S.search.q === q && S.search.pieces && !S.search.busy) ? S.search.pieces : await runSearch(q);
  if (!pieces) return;
  // Spec §5.1: Enter adds only when exactly one sellable piece matches (as the
  // API reports it, whatever is already on the sale). Several sellable pieces
  // on one barcode always open the list, so the seller taps the serial — a
  // second scan never silently picks the other copy.
  const sellable = pieces.filter((p) => p.sellable);
  if (sellable.length === 1) {
    if (!inSale(sellable[0])) { addPiece(sellable[0], true); return; }
    toast(tr("Already in this sale."));
    ev.target.select();
    closeSugg();
    return;
  }
  // otherwise the list stays open to pick from (or says nothing was found)
}
function closeSugg() {
  S.search.open = false;
  renderSugg();
}
function addPiece(p, fromScan) {
  if (inSale(p)) { toast(tr("Already in this sale.")); return; }
  if (S.sale.lines.length >= MAX_LINES) { toast(tr("A sale can hold at most {n} pieces.", { n: MAX_LINES })); return; }
  S.sale.lines.push({
    piece_id: p.piece_id, serial: p.serial, barcode: p.barcode, brand: p.brand, article: p.article,
    collection: p.collection, model_name: p.model_name, colour: p.colour, size: p.size,
    metal_keys: p.metal_keys || [], stone_keys: p.stone_keys || [],
    list_price: p.price_uzs, price_uzs: p.price_uzs, discount_pct: 0, seller: null, sellerOpen: false,
  });
  searchSeq++;
  S.search = { q: "", pieces: null, open: false, busy: false };
  renderAll();
  // After a scan the box is ready for the next one; after a tap, no keyboard pops up.
  if (fromScan) { const q = $("#q"); if (q) q.focus(); }
}
function renderSugg() {
  const box = $("#sugg");
  if (!box) return;
  box.innerHTML = "";
  const s = S.search;
  box.hidden = !(s.open && s.pieces);
  if (box.hidden) return;
  if (!s.pieces.length) { box.append(el("div", { class: "sg-note", text: tr("Nothing found for “{q}”.", { q: s.q }) })); return; }
  for (const p of s.pieces) {
    const ok = p.sellable && !inSale(p);
    const kids = [
      el("span", { class: "sg-t" }, p.brand || "", el("span", { class: "dot", "aria-hidden": "true", text: " · " }), pieceName(p)),
      el("span", { class: "sg-s" }, [pieceSpec(p), p.serial].filter(Boolean).join(" · ")),
      ok ? el("span", { class: "sg-p money", text: p.price_uzs === null || p.price_uzs === undefined ? tr("no price") : fmtUZS(p.price_uzs) })
        : el("span", { class: "sg-p" }, el("span", { class: "sg-state", text: stateWords(p) })),
    ];
    box.append(ok
      ? el("button", { type: "button", class: "sg", onclick: () => addPiece(p, false) }, kids)
      : el("div", { class: "sg off", "aria-disabled": "true" }, kids));
  }
}
document.addEventListener("pointerdown", (ev) => {
  if (S.search.open && !ev.target.closest(".search")) closeSugg();
}, true);

/* ------------------------------------------------------------------- lines */
function sellerOptions(current, emptyLabel) {
  const list = (S.ref && S.ref.sellers) || [];
  const opts = [el("option", { value: "", text: emptyLabel })];
  for (const s of list) opts.push(el("option", { value: s, text: s, selected: s === current ? true : null }));
  if (current && !list.includes(current)) opts.push(el("option", { value: current, text: current, selected: true }));
  return opts;
}
// The sale's seller: chosen once per sale, starts empty.
function sellerSelect() {
  const sel = el("select", { id: "seller", class: S.sale.seller ? "" : "unset",
    onchange: (ev) => { S.sale.seller = ev.target.value; renderAll(); } },
  sellerOptions(S.sale.seller, tr("Choose the seller…")));
  sel.value = S.sale.seller || "";
  return el("label", { class: "field-inline" }, el("span", { text: tr("Seller") }), sel);
}
function refreshNumbers() {
  S.sale.lines.forEach((l, i) => {
    const n = document.querySelector(`[data-net="${i}"]`);
    if (n) n.lastChild.textContent = fmtUZS(lineNet(l));
    const w = document.querySelector(`[data-was="${i}"]`);
    if (w) w.textContent = l.list_price !== null && l.list_price !== undefined && l.price_uzs !== l.list_price ? tr("list {p}", { p: fmtUZS(l.list_price) }) : "";
  });
  const t = $("#total");
  if (t) t.firstChild.textContent = fmtUZS(saleTotal());
  const b = $("#to-pay");
  if (b) b.disabled = !saleReady();
}
const saleReady = () => S.sale.lines.length > 0 && S.sale.lines.every((l) => l.price_uzs > 0);
function renderLine(l, i) {
  const price = el("input", { type: "text", class: "l-price", inputmode: "numeric", autocomplete: "off",
    value: l.price_uzs === null || l.price_uzs === undefined ? "" : fmtUZS(l.price_uzs), "aria-label": tr("Price") + " " + l.serial,
    oninput: (ev) => { l.price_uzs = parseAmount(ev.target.value); refreshNumbers(); },
    onchange: (ev) => { ev.target.value = l.price_uzs === null ? "" : fmtUZS(l.price_uzs); } });
  const disc = el("input", { type: "text", class: "l-disc", inputmode: "decimal", autocomplete: "off", placeholder: "0",
    value: pctText(l.discount_pct), "aria-label": tr("Discount") + " " + l.serial,
    oninput: (ev) => { const r = parsePct(ev.target.value); l.discount_pct = r.pct; S.lastPct = r.pct; refreshNumbers(); },
    onchange: (ev) => {
      const r = parsePct(ev.target.value);
      if (r.capped) toast(tr("A discount can be at most 99.9999%."));
      l.discount_pct = r.pct; S.lastPct = r.pct; ev.target.value = pctText(r.pct); refreshNumbers();
    } });
  const sellerBox = el("span", { class: "l-seller-box" });
  if (l.sellerOpen) {
    const pick = el("select", { class: "l-seller-pick", "aria-label": tr("Seller for this piece"),
      onchange: (ev) => { l.seller = ev.target.value || null; l.sellerOpen = false; renderAll(); } },
    sellerOptions(l.seller, tr("Same as the sale")));
    pick.value = l.seller || "";
    sellerBox.append(pick);
  } else {
    sellerBox.append(el("button", { type: "button", class: "linkish l-seller",
      onclick: () => { l.sellerOpen = true; renderAll(); } }, l.seller ? tr("Seller: {s}", { s: l.seller }) : tr("seller")));
  }
  const showWas = l.list_price !== null && l.list_price !== undefined && l.price_uzs !== l.list_price;
  return el("li", { class: "line" },
    el("div", { class: "l-info" },
      el("div", { class: "l-title" }, l.brand || "", el("span", { class: "dot", "aria-hidden": "true", text: "·" }), pieceName(l)),
      el("div", { class: "l-spec", text: pieceSpec(l) }),
      el("div", { class: "l-meta" }, el("span", { class: "l-serial", text: l.serial }), sellerBox)),
    el("label", { class: "l-cell l-price" }, el("span", { text: tr("Price") }), price,
      el("span", { class: "was", "data-was": i, text: showWas ? tr("list {p}", { p: fmtUZS(l.list_price) }) : "" })),
    el("label", { class: "l-cell l-disc pct" }, el("span", { text: tr("Discount") }), disc),
    el("div", { class: "l-net", "data-net": i }, el("span", { class: "eq", text: "=" }), fmtUZS(lineNet(l))),
    el("button", { type: "button", class: "btn subtle l-x", "aria-label": tr("Remove {s}", { s: l.serial }), title: tr("Remove {s}", { s: l.serial }),
      onclick: () => { S.sale.lines.splice(i, 1); renderAll(); } }, "✕"));
}

/* ------------------------------------------------------------------ screen */
function renderSale(main) {
  if (!S.rights.post) {
    main.append(el("div", { class: "notice-box", text: tr("Your account cannot make sales.") }));
    return;
  }
  const s = S.sale;
  const q = el("input", { type: "search", id: "q", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    enterkeyhint: "search", placeholder: tr("Scan or type: barcode, serial, article, name…"), "aria-label": tr("Find a piece"),
    oninput: onSearchInput, onkeydown: onSearchKey });
  const sugg = el("div", { class: "sugg", id: "sugg", hidden: true });
  const lines = el("ol", { class: "lines", id: "lines" },
    s.lines.length ? s.lines.map(renderLine) : el("li", { class: "empty", text: tr("Scan or find the first piece.") }));
  const foot = el("div", { class: "foot" });
  renderClientSlot(foot);
  foot.append(
    el("div", { class: "total" },
      el("div", { class: "t-l", text: tr("Total") }),
      el("div", { class: "t-v", id: "total" }, fmtUZS(saleTotal()), el("small", { text: tr("so'm") }))),
    el("button", { type: "button", class: "btn primary big", id: "to-pay", disabled: saleReady() ? null : true,
      title: s.lines.some((l) => !(l.price_uzs > 0)) ? tr("Every piece needs a price.") : null,
      onclick: () => go("#/pay") }, tr("Payment →")));
  main.append(el("section", { class: "sheet", id: "screen-sale" },
    el("div", { class: "sheet-head" }, el("h1", { text: tr("New sale") }), el("div", { class: "aside" }, sellerSelect())),
    el("div", { class: "search" },
      el("span", { class: "glass", "aria-hidden": "true", html: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="7.5" cy="7.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M11.6 11.6 16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>' }),
      q, sugg),
    lines,
    s.lines.length > 1 ? el("div", { class: "lines-tools" },
      el("button", { type: "button", class: "btn", id: "same-pct",
        title: S.lastPct ? tr("Gives every line {p}%", { p: pctText(S.lastPct) }) : tr("Type a discount on a line first."),
        onclick: () => {
          if (S.lastPct === null) { toast(tr("Type a discount on a line first.")); return; }
          s.lines.forEach((l) => { l.discount_pct = S.lastPct; });
          renderAll();
        } }, tr("Same % for all lines"))) : null,
    foot));
  renderSugg();
}
