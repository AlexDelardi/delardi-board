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
  "Piece": "Изделие",
  "Status": "Статус",
  "Price, so'm": "Цена, сум",
  "To pay": "К оплате",
  "Tap a piece to add it. Pieces that cannot be sold show why.": "Нажмите на изделие, чтобы добавить его. У изделий, которые нельзя продать, указана причина.",
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
  "Set total": "Задать итог",
  "Set the total": "Задать итоговую сумму",
  "Prices add up to {p} so'm.": "Сумма цен: {p} сум.",
  "Total to pay, so'm": "Итого к оплате, сум",
  "Every line gets the same discount. The last line takes the rounding, so the total is exactly what you type.": "Все строки получают одинаковую скидку. Округление уходит в последнюю строку, поэтому итог точно совпадает с введённым.",
  "Apply": "Применить",
  "Type the total.": "Введите итоговую сумму.",
  "The total cannot be above the prices ({p}).": "Итог не может быть больше суммы цен ({p}).",
  "That total is too low for these prices.": "Этот итог слишком мал для таких цен.",
  "Every piece needs a price first.": "Сначала укажите цену каждого изделия.",
  "No photo": "Нет фото",
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
  // suspended sales
  "Suspended ({n})": "Отложенные ({n})",
  "Suspend": "Отложить",
  "Sets this sale aside; its pieces are held for it until it is resumed or cancelled.":
    "Откладывает продажу; изделия держатся за ней, пока её не продолжат или не отменят.",
  "Suspended sales": "Отложенные продажи",
  "No sale is suspended.": "Отложенных продаж нет.",
  "Resume": "Продолжить",
  "Cancel it": "Отменить её",
  "Sale suspended as #{n}.": "Продажа отложена под №{n}.",
  "Suspended sale #{n}": "Отложенная продажа №{n}",
  "{who}, {when}": "{who}, {when}",
  "no seller yet": "продавец не выбран",
  "no client yet": "клиент не выбран",
  "Resume suspended sale #{n}?": "Продолжить отложенную продажу №{n}?",
  "The sale on screen will be cleared.": "Продажа на экране будет очищена.",
  "Cancel suspended sale #{n}?": "Отменить отложенную продажу №{n}?",
  "Its pieces are released and nothing of it is kept.": "Её изделия освобождаются, от неё ничего не остаётся.",
  "Cancel the suspended sale": "Отменить отложенную продажу",
  "Keep it": "Оставить",
  "Suspended sale #{n} cancelled.": "Отложенная продажа №{n} отменена.",
  "Suspended sale #{n} resumed.": "Отложенная продажа №{n} продолжена.",
  "Another sale is suspended": "Уже есть отложенная продажа",
  "The till keeps one suspended sale at a time, and nothing else can be suspended or posted until it is resumed or cancelled.":
    "Касса держит только одну отложенную продажу: пока её не продолжат или не отменят, ничего другого нельзя ни отложить, ни провести.",
  "Resume it (the sale on screen is cleared), or cancel it and carry on with this one.":
    "Продолжите её (продажа на экране будет очищена) или отмените её и продолжайте эту.",
  "Resume it": "Продолжить её",
  "Resumed suspended sale #{n}. Post it, or suspend it again.": "Продолжена отложенная продажа №{n}. Проведите её или снова отложите.",
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
// The small photo of a design, or an empty frame when it has none (or the picture does not load).
function thumb(image) {
  const box = el("span", { class: "thumb" + (image ? "" : " none"), "aria-hidden": "true" });
  if (image) box.append(el("img", { src: PHOTO_BASE + image, alt: "", loading: "lazy", decoding: "async",
    onerror: (ev) => { ev.target.remove(); box.classList.add("none"); } }));
  return box;
}
/* "Set total": bring the sale to a typed total with the same discount on every line.
   The discount is the share to four decimals; each line is its price less that, rounded; what is left
   (a few so'm of rounding) goes to the last line, or to the lines before it when the last cannot take it.
   A line that took rounding carries its exact total (net_uzs) and the discount closest to it.
   Returns [{discount_pct, net_uzs}] in line order, or {error}. */
function spreadTotal(prices, total) {
  if (!prices.length || prices.some((x) => !(x > 0))) return { error: "price" };
  if (!(total > 0)) return { error: "empty" };
  const sum = prices.reduce((a, b) => a + b, 0);
  if (total > sum) return { error: "high", sum };
  const share = (num, den) => { const n = BigInt(num) * 2000000n + BigInt(den); return Number(n / (BigInt(den) * 2n)); };   // rounded millionths
  const m = share(sum - total, sum);
  if (m > 999999) return { error: "low" };
  const out = prices.map((price) => ({ price, discount_pct: m / 10000, net_uzs: null, net: lineNet({ price_uzs: price, discount_pct: m / 10000 }) }));
  let left = total - out.reduce((a, l) => a + l.net, 0);
  for (let i = out.length - 1; i >= 0 && left !== 0; i--) {
    const l = out[i], net = Math.min(l.price, Math.max(1, l.net + left));
    left -= net - l.net;
    if (net !== l.net) {
      const lm = share(l.price - net, l.price);
      if (lm > 999999) return { error: "low" };
      Object.assign(l, { net, net_uzs: net, discount_pct: lm / 10000 });
    }
  }
  if (left !== 0) return { error: "low" };
  return out.map((l) => ({ discount_pct: l.discount_pct, net_uzs: l.net_uzs }));
}
function openSetTotal() {
  const s = S.sale;
  if (s.lines.some((l) => !(l.price_uzs > 0) || l.priceBad)) { toast(tr("Every piece needs a price first.")); return; }
  const sum = s.lines.reduce((a, l) => a + l.price_uzs, 0);
  const input = el("input", { type: "text", id: "set-total-in", inputmode: "numeric", autocomplete: "off", "aria-label": tr("Total to pay, so'm"),
    value: fmtUZS(saleTotal()), onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); apply(); } } });
  const msg = el("p", { class: "field-err", id: "set-total-err", role: "alert", hidden: true });
  const fail = (t) => { msg.textContent = t; msg.hidden = false; markInvalid(input, true); };
  const apply = () => {
    const r = readAmount(input.value);
    if (r.invalid || r.value === null) { fail(tr("Type the total.")); return; }
    const res = spreadTotal(s.lines.map((l) => l.price_uzs), r.value);
    if (res.error) {
      fail(res.error === "high" ? tr("The total cannot be above the prices ({p}).", { p: fmtUZS(sum) })
        : res.error === "low" ? tr("That total is too low for these prices.") : tr("Type the total."));
      return;
    }
    s.lines.forEach((l, i) => { l.discount_pct = res[i].discount_pct; l.net_uzs = res[i].net_uzs; l.discBad = null; });
    S.lastPct = res[0].discount_pct;
    m.close();
    renderAll();
  };
  const m = modal("set-total", tr("Set the total"), [
    el("p", { text: tr("Prices add up to {p} so'm.", { p: fmtUZS(sum) }) }),
    el("label", { class: "field" }, el("span", { text: tr("Total to pay, so'm") }), input),
    msg,
    el("p", { class: "hint", text: tr("Every line gets the same discount. The last line takes the rounding, so the total is exactly what you type.") }),
  ], [
    el("button", { type: "button", class: "btn primary", id: "set-total-ok", onclick: apply }, tr("Apply")),
    el("button", { type: "button", class: "btn", onclick: () => m.close() }, tr("Cancel")),
  ], "confirm");
  setTimeout(() => { input.focus(); input.select(); }, 30);
}
function pctText(n) {
  if (!n) return "";
  return String(Number(Number(n).toFixed(4)));
}
// Typed text → a discount the database can hold: 0 … 99.9999, at most four decimals,
// one decimal separator (dot or comma). Anything else is invalid and not taken.
function parsePct(s) {
  const t = String(s === null || s === undefined ? "" : s).trim();
  if (!t) return { pct: 0, capped: false, invalid: false };
  if (!/^(\d+([.,]\d{0,4})?|[.,]\d{1,4})$/.test(t)) return { pct: null, capped: false, invalid: true };
  const n = parseFloat(t.replace(",", "."));
  if (!isFinite(n) || n <= 0) return { pct: 0, capped: false, invalid: false };
  if (n > MAX_DISCOUNT) return { pct: MAX_DISCOUNT, capped: true, invalid: false };
  return { pct: Math.round(n * 10000) / 10000, capped: false, invalid: false };
}
const inSale = (p) => S.sale.lines.some((l) => l.piece_id === p.piece_id);
const stateWords = (p) => inSale(p) ? tr("Already in this sale")
  : p.held ? tr("in suspended sale #{n}", { n: p.held.draft_id })
  : tr(STATE_WORDS[p.state] || p.state);

// The state as a kit tag: In stock navy, Suspended sale card, Sold alert, anything else mist.
function stateTag(p) {
  if (inSale(p)) return el("span", { class: "tag done", text: stateWords(p) });
  if (p.held) return el("span", { class: "tag info", text: stateWords(p) });
  if (p.state === "in_stock") return el("span", { class: "tag act", text: tr("In stock") });
  if (p.state === "sold") return el("span", { class: "tag alert", text: tr("Sold") });
  return el("span", { class: "tag done", text: stateWords(p) });
}

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
    list_price: p.price_uzs, price_uzs: p.price_uzs, discount_pct: 0, net_uzs: null, image: p.image || null, seller: null, sellerOpen: false,
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
  box.append(el("div", { class: "sg-head", "aria-hidden": "true" },
    el("span", { text: tr("Piece") }), el("span", { text: tr("Status") }), el("span", { class: "r", text: tr("Price, so'm") })));
  for (const p of s.pieces) {
    const ok = p.sellable && !inSale(p);
    const kids = [
      el("span", { class: "sg-n" }, thumb(p.image), el("span", { class: "sg-tx" },
        el("span", { class: "sg-t" }, p.brand || "", el("span", { class: "dot", "aria-hidden": "true", text: " · " }), pieceName(p)),
        el("span", { class: "sg-s" }, [pieceSpec(p), p.serial].filter(Boolean).join(" · ")))),
      el("span", { class: "sg-st" }, stateTag(p)),
      el("span", { class: "sg-p money", text: p.price_uzs === null || p.price_uzs === undefined ? (ok ? tr("no price") : "") : fmtUZS(p.price_uzs) }),
    ];
    box.append(ok
      ? el("button", { type: "button", class: "sg", onclick: () => addPiece(p, false) }, kids)
      : el("div", { class: "sg off", "aria-disabled": "true" }, kids));
  }
  box.append(el("div", { class: "sg-note", text: tr("Tap a piece to add it. Pieces that cannot be sold show why.") }));
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
  return el("label", { class: "field-stack" }, el("span", { class: "lbl", text: tr("Seller") }), sel);
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
const saleReady = () => S.sale.lines.length > 0 && S.sale.lines.every((l) => l.price_uzs > 0 && !l.priceBad && !l.discBad);
function renderLine(l, i) {
  // a text that is not accepted stays on screen, marked, and holds the sale back (l.priceBad / l.discBad)
  const takePrice = (input) => {
    const r = readAmount(input.value);
    l.priceBad = r.invalid ? input.value : null;
    l.price_uzs = r.invalid ? null : r.value;
    l.net_uzs = null;
    markInvalid(input, r.invalid);
    return r;
  };
  const price = el("input", { type: "text", class: "l-price", inputmode: "numeric", autocomplete: "off",
    value: l.priceBad ? l.priceBad : l.price_uzs === null || l.price_uzs === undefined ? "" : fmtUZS(l.price_uzs),
    "aria-label": tr("Price") + " " + l.serial, "aria-invalid": l.priceBad ? "true" : null,
    oninput: (ev) => { takePrice(ev.target); refreshNumbers(); },
    onchange: (ev) => { if (!takePrice(ev.target).invalid) ev.target.value = l.price_uzs === null ? "" : fmtUZS(l.price_uzs); refreshNumbers(); } });
  const takePct = (input) => {
    const r = parsePct(input.value);
    l.discBad = r.invalid ? input.value : null;
    l.net_uzs = null;
    markInvalid(input, r.invalid);
    if (!r.invalid) { l.discount_pct = r.pct; S.lastPct = r.pct; }
    return r;
  };
  const disc = el("input", { type: "text", class: "l-disc", inputmode: "decimal", autocomplete: "off", placeholder: "0",
    value: l.discBad ? l.discBad : pctText(l.discount_pct), "aria-label": tr("Discount") + " " + l.serial,
    "aria-invalid": l.discBad ? "true" : null,
    oninput: (ev) => { takePct(ev.target); refreshNumbers(); },
    onchange: (ev) => {
      const r = takePct(ev.target);
      if (r.capped) toast(tr("A discount can be at most 99.9999%."));
      if (!r.invalid) ev.target.value = pctText(r.pct);
      refreshNumbers();
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
    el("div", { class: "l-info" }, thumb(l.image), el("div", { class: "l-tx" },
      el("div", { class: "l-title" }, l.brand || "", el("span", { class: "dot", "aria-hidden": "true", text: "·" }), pieceName(l)),
      el("div", { class: "l-spec", text: pieceSpec(l) }),
      el("div", { class: "l-meta" }, el("span", { class: "l-serial", text: l.serial }), sellerBox))),
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
    main.append(el("div", { class: "notice", text: tr("Your account cannot make sales.") }));
    return;
  }
  const s = S.sale;
  const q = el("input", { type: "search", id: "q", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    enterkeyhint: "search", placeholder: tr("Scan or type: barcode, serial, article, name…"), "aria-label": tr("Find a piece"),
    oninput: onSearchInput, onkeydown: onSearchKey });
  const sugg = el("div", { class: "sugg", id: "sugg", hidden: true });
  const linesHead = s.lines.length ? el("div", { class: "lines-head", "aria-hidden": "true" },
    el("span", { text: tr("Piece") }), el("span", { class: "r", text: tr("Price, so'm") }), el("span", { class: "r", text: tr("Discount") }),
    el("span", { class: "r", text: tr("To pay") }), el("span")) : null;
  const lines = el("ol", { class: "lines", id: "lines" },
    s.lines.length ? s.lines.map(renderLine) : el("li", { class: "empty", text: tr("Scan or find the first piece.") }));
  const foot = el("div", { class: "foot" });
  renderClientSlot(foot);
  foot.append(
    el("div", { class: "total" },
      el("div", { class: "t-l", text: tr("Total") }),
      el("div", { class: "keynum", id: "total" }, fmtUZS(saleTotal()), el("small", { text: tr("so'm") }))),
    el("button", { type: "button", class: "btn primary big", id: "to-pay", disabled: saleReady() ? null : true,
      title: s.lines.some((l) => !(l.price_uzs > 0)) ? tr("Every piece needs a price.") : null,
      onclick: () => go("#/pay") }, tr("Payment →")));
  main.append(el("section", { class: "sheet", id: "screen-sale" },
    el("div", { class: "sale-head" }, el("h1", { class: "title", text: tr("New sale") }),
      el("div", { class: "aside" }, sellerSelect(), suspendTools())),
    s.draft_id ? el("p", { class: "resumed", text: tr("Resumed suspended sale #{n}. Post it, or suspend it again.", { n: s.draft_id }) }) : null,
    el("div", { class: "search" },
      el("span", { class: "glass", "aria-hidden": "true", html: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="7.5" cy="7.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M11.6 11.6 16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>' }),
      q, sugg),
    linesHead,
    lines,
    s.lines.length ? el("div", { class: "lines-tools" },
      s.lines.length > 1 ? el("button", { type: "button", class: "btn", id: "same-pct",
        title: S.lastPct ? tr("Gives every line {p}%", { p: pctText(S.lastPct) }) : tr("Type a discount on a line first."),
        onclick: () => {
          if (S.lastPct === null) { toast(tr("Type a discount on a line first.")); return; }
          s.lines.forEach((l) => { l.discount_pct = S.lastPct; l.net_uzs = null; l.discBad = null; });
          renderAll();
        } }, tr("Same % for all lines")) : null,
      el("button", { type: "button", class: "btn", id: "set-total", onclick: openSetTotal }, tr("Set total"))) : null,
    foot));
  renderSugg();
}

/* ========================================================= suspended sales
   One suspended sale per mode (the database refuses a second, and refuses
   any post while one is waiting, with "another sale is suspended"). Its
   pieces are held for it. Resume puts it back on the screen, keeping its
   draft_id, so posting it (or suspending it again) is that same sale. */
S.drafts = null;
async function loadDrafts() {
  if (!S.rights.post || !S.token) { S.drafts = []; refreshSuspended(); return S.drafts; }
  try {
    const r = await api("drafts");
    S.drafts = r.drafts || [];
  } catch (e) { if (S.drafts === null) S.drafts = []; }
  refreshSuspended();
  return S.drafts;
}
function refreshSuspended() {
  const b = $("#suspended");
  if (b) b.textContent = tr("Suspended ({n})", { n: (S.drafts || []).length });
}
function suspendTools() {
  return [
    el("button", { type: "button", class: "btn", id: "suspended", onclick: openDrafts }, tr("Suspended ({n})", { n: (S.drafts || []).length })),
    el("button", { type: "button", class: "btn", id: "suspend", disabled: S.sale.lines.length ? null : true,
      title: tr("Sets this sale aside; its pieces are held for it until it is resumed or cancelled."), onclick: suspendSale }, tr("Suspend")),
  ];
}
let suspending = false;
async function suspendSale() {
  const s = S.sale;
  if (suspending || !s.lines.length) return;
  const sale = {
    seller: s.seller || null, fiscal_ref: blank(s.fiscal_ref) ? null : s.fiscal_ref.trim(), draft_id: s.draft_id || null,
    lines: s.lines.map((l) => ({ piece_id: l.piece_id, price_uzs: l.price_uzs > 0 ? l.price_uzs : null, discount_pct: l.discount_pct || 0,
      net_uzs: l.price_uzs > 0 && l.net_uzs ? l.net_uzs : null, seller: l.seller || null })),
  };
  if (s.walk_in) sale.walk_in = true; else if (s.client_id) sale.client_id = s.client_id;
  suspending = true;
  try {
    const r = await api("suspend", { sale, expect_mode: S.mode });
    S.sale = newSale(); S.lastPct = null;
    toast(tr("Sale suspended as #{n}.", { n: r.draft_id }));
    await loadDrafts();
    go("#/sale");
  } catch (e) {
    if (/another sale is suspended/.test(e.raw || "")) openSuspendConflict();
    else if (e.status !== 401) toast(e.message);
  } finally { suspending = false; }
}
function draftSummary(d) {
  const total = d.lines.reduce((t, l) => t + (lineNet(l) || 0), 0);
  const when = new Date(d.created_at);
  const stamp = isNaN(when) ? "" : fmtDate(d.created_at) + " " + fmtTime(d.created_at);
  return [
    el("div", { class: "draft-t" }, el("b", { text: tr("Suspended sale #{n}", { n: d.draft_id }) }),
      el("span", { class: "small", text: " · " + tr("{who}, {when}", { who: who(d.created_by), when: stamp }) })),
    el("ul", { class: "draft-lines" }, d.lines.map((l) => el("li", {},
      el("span", {}, [l.brand, l.model_name].filter(Boolean).join(" · ") + " · " + l.serial),
      el("span", { class: "money", text: l.price_uzs ? fmtUZS(lineNet(l)) : tr("no price") })))),
    el("div", { class: "draft-m small" }, [
      d.walk_in ? walkInText() : d.client_id || tr("no client yet"),
      d.seller || tr("no seller yet"),
      tr("Total") + " " + fmtUZS(total),
    ].join(" · ")),
  ];
}
function draftToSale(d) {
  const s = newSale();
  Object.assign(s, { draft_id: d.draft_id, client_id: d.client_id || null, walk_in: !!d.walk_in, seller: d.seller || "" });
  s.lines = d.lines.map((l) => ({
    piece_id: l.piece_id, serial: l.serial, barcode: null, brand: l.brand, article: null, collection: null, model_name: l.model_name,
    colour: null, size: null, metal_keys: [], stone_keys: [], list_price: l.price_uzs, price_uzs: l.price_uzs,
    discount_pct: Number(l.discount_pct) || 0, net_uzs: l.price_uzs && l.net_uzs ? Number(l.net_uzs) : null, image: l.image || null,
    seller: l.seller || null, sellerOpen: false,
  }));
  return s;
}
async function resumeDraft(d, ask) {
  const s = S.sale;
  if (ask && s.lines.length && s.draft_id !== d.draft_id) {
    const yes = await confirmBox({ title: tr("Resume suspended sale #{n}?", { n: d.draft_id }), body: tr("The sale on screen will be cleared."), ok: tr("Resume") });
    if (!yes) return;
  }
  ["drafts-panel", "conflict"].forEach((id) => { const h = document.getElementById(id); if (h) h.remove(); });
  S.sale = draftToSale(d); S.lastPct = null;
  toast(tr("Suspended sale #{n} resumed.", { n: d.draft_id }));
  go("#/sale");
  if (S.sale.client_id && S.crm) {
    const id = S.sale.client_id;
    try { const c = await call("client", { id }); if (S.sale.client_id === id) { S.sale.client_name = cardName(c); renderAll(); } } catch (e) { /* the reference will do */ }
  }
}
async function cancelDraft(d) {
  const yes = await confirmBox({ title: tr("Cancel suspended sale #{n}?", { n: d.draft_id }), body: tr("Its pieces are released and nothing of it is kept."),
    ok: tr("Cancel the suspended sale"), danger: true });
  if (!yes) return false;
  try {
    await api("cancel_draft", { draft_id: d.draft_id });
    if (S.sale.draft_id === d.draft_id) S.sale.draft_id = null;
    toast(tr("Suspended sale #{n} cancelled.", { n: d.draft_id }));
  } catch (e) { if (e.status !== 401) toast(e.message); }
  await loadDrafts();
  return true;
}
async function openDrafts() {
  const render = () => {
    const list = S.drafts || [];
    modal("drafts-panel", tr("Suspended sales"), el("div", { id: "drafts" },
      list.length ? list.map((d) => el("div", { class: "draft" }, draftSummary(d),
        el("div", { class: "draft-act" },
          el("button", { type: "button", class: "btn primary draft-resume", onclick: () => resumeDraft(d, true) }, tr("Resume")),
          el("button", { type: "button", class: "btn draft-cancel", onclick: async () => { if (await cancelDraft(d)) render(); } }, tr("Cancel it")))))
        : el("p", { class: "small", text: tr("No sale is suspended.") })));
  };
  render();
  await loadDrafts();
  if ($("#drafts-panel")) render();
}
// "another sale is suspended", from Suspend or from Post: show that sale and
// offer to resume it or cancel it.
async function openSuspendConflict() {
  await loadDrafts();
  const d = (S.drafts || [])[0];
  if (!d) { toast(tr("Another sale is suspended")); return; }
  const m = modal("conflict", tr("Another sale is suspended"), [
    el("p", { text: tr("The till keeps one suspended sale at a time, and nothing else can be suspended or posted until it is resumed or cancelled.") }),
    el("div", { class: "draft" }, draftSummary(d)),
    el("p", { class: "small", text: tr("Resume it (the sale on screen is cleared), or cancel it and carry on with this one.") }),
  ], [
    el("button", { type: "button", class: "btn primary", id: "conflict-resume", onclick: () => resumeDraft(d, false) }, tr("Resume it")),
    el("button", { type: "button", class: "btn", id: "conflict-cancel", onclick: async () => { if (await cancelDraft(d)) m.close(); } }, tr("Cancel it")),
  ]);
}
