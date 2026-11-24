/* ===========================================================================
   The selection (24 Nov 2026)
   A short list of pieces put together for one client: tick them on the cards
   or on a model page, then open the selection to show them side by side, hand
   them over as a sheet (print, or "Save as PDF"), copy them as a message, or
   pass the list to a colleague as a link.

   What it shows is what a client may see: the piece, its material, stones,
   size and price. No stock counts, no serial numbers, no TBC marks.

   On the device it keeps model and colour references only, like "opened
   recently": never a name, a price or anything about the client. The "prepared
   for" line on the sheet is typed at the moment of printing and kept nowhere.
   ========================================================================= */
Object.assign(RU, {
  "Selection": "Подборка",
  "Your selection": "Ваша подборка",
  "{n} pieces": "Изделий: {n}",
  "Nothing chosen yet": "Пока ничего не выбрано",
  "Add to selection": "Добавить в подборку",
  "In the selection": "В подборке",
  "Remove from selection": "Убрать из подборки",
  "Added to the selection.": "Добавлено в подборку.",
  "Removed from the selection.": "Убрано из подборки.",
  "The selection is full ({n} pieces). Take one out first.": "Подборка заполнена ({n}). Сначала уберите одно изделие.",
  "The selection is empty.": "Подборка пуста.",
  "Tick pieces on the cards or on a model page, and they gather here: to show side by side, to print or save as a PDF, or to send as a message.":
    "Отмечайте изделия на карточках или на странице модели — они соберутся здесь: показать рядом, распечатать или сохранить в PDF, отправить сообщением.",
  "Browse the catalogue": "Открыть каталог",
  "Total": "Итого",
  "Total, from": "Итого, от",
  "Remove": "Убрать",
  "Clear the selection": "Очистить подборку",
  "Selection cleared.": "Подборка очищена.",
  "PDF or print": "PDF или печать",
  "Copy as a message": "Скопировать сообщением",
  "Copy the link": "Скопировать ссылку",
  "Copied. Paste it into Telegram or WhatsApp.": "Скопировано. Вставьте в Telegram или WhatsApp.",
  "Link copied. It opens for anyone with a catalogue passcode.": "Ссылка скопирована. Она откроется у всех, у кого есть код доступа к каталогу.",
  "Could not copy. Select the text and copy it by hand.": "Не удалось скопировать. Выделите текст и скопируйте вручную.",
  "A colleague's selection": "Подборка коллеги",
  "This list came by link. Yours is untouched.": "Этот список открыт по ссылке. Ваша подборка не изменилась.",
  "Keep as my selection": "Сделать моей подборкой",
  "Back to my selection": "К моей подборке",
  "The sheet": "Лист для клиента",
  "Prepared for": "Для кого",
  "Client's name (optional, not kept)": "Имя клиента (необязательно, не сохраняется)",
  "Delardi client": "Клиент Delardi",
  "Left empty, the sheet says “{d}”.": "Если оставить пустым, на листе будет «{d}».",
  "Show prices": "Показывать цены",
  "Print or save as PDF": "Печать или сохранить в PDF",
  "In the print window choose “Save as PDF”. On an iPad: Print, then spread two fingers on the preview and share it.":
    "В окне печати выберите «Сохранить как PDF». На iPad: «Напечатать», затем раздвиньте предпросмотр двумя пальцами и отправьте.",
  "A selection for you": "Подборка для вас",
  "Prepared by {who}": "Подготовил(а): {who}",
  "Prices in UZS, VAT included, as on {date}. Pieces are single items and may be sold in the meantime.":
    "Цены в сумах, с НДС, на {date}. Изделия в единственном экземпляре и могут быть проданы.",
  "Size": "Размер",
  "Sizes": "Размеры",
  "Price on request": "Цена по запросу",
  "This piece is no longer in the catalogue.": "Этого изделия больше нет в каталоге.",
  "Watches & jewellery, Tashkent": "Часы и украшения, Ташкент",
  "{n} mm": "{n} мм",
});
const CART_KEY = "cat_cart";            // [{ m: model reference, v: colour reference or null }], nothing else
const CART_MAX = 24;
const BOUTIQUE = { name: "Delardi Boutique", address: ["Bukhara 26, Tashkent", "ул. Бухара, 26, Ташкент"], web: "delardi.uz", telegram: "@Delardi_Boutique" };
const WORDMARK_NAVY = "__WORDMARK_NAVY__";
const BAG = ["M5.5 8.5h13l1 11.5h-15z", "M9 8.5V7a3 3 0 0 1 6 0v1.5"];

const cleanItem = (x) => (x && typeof x.m === "string" && x.m.length <= 80 ? { m: x.m, v: typeof x.v === "string" && x.v.length <= 80 ? x.v : null } : null);
function cartLoad() {
  try { const a = JSON.parse(store(CART_KEY) || "[]"); return Array.isArray(a) ? a.map(cleanItem).filter(Boolean).slice(0, CART_MAX) : []; }
  catch (e) { return []; }
}
function cartSave() { store(CART_KEY, S.cart.length ? JSON.stringify(S.cart) : null); }
const cartIndex = (m, v) => S.cart.findIndex((x) => x.m === m && (x.v || null) === (v || null));
// A card stands for the whole model; a model page for the colour on screen.
const cartHasModel = (m) => S.cart.some((x) => x.m === m);
function cartToggle(m, v) {
  const i = cartIndex(m, v);
  if (i >= 0) { S.cart.splice(i, 1); cartSave(); toast(tr("Removed from the selection.")); return false; }
  if (S.cart.length >= CART_MAX) { toast(tr("The selection is full ({n} pieces). Take one out first.", { n: CART_MAX })); return false; }
  S.cart.push({ m, v: v || null }); cartSave(); toast(tr("Added to the selection."));
  return true;
}

/* ------------------------------------------------------------ the buttons */
// On a card: ticks the model in or out. A model already in with a chosen colour counts as in.
function cartCardButton(m) {
  const on = cartHasModel(m.model_id);
  return el("button", {
    class: "pick" + (on ? " on" : ""), type: "button", "aria-pressed": on ? "true" : "false",
    title: tr(on ? "Remove from selection" : "Add to selection"), "aria-label": tr(on ? "Remove from selection" : "Add to selection") + ": " + modelTitle(m),
    onclick: () => {
      if (on) { S.cart = S.cart.filter((x) => x.m !== m.model_id); cartSave(); toast(tr("Removed from the selection.")); }
      else cartToggle(m.model_id, null);
      const y = window.scrollY; render(); window.scrollTo(0, y);
    },
  }, [svg(on ? ["M5 12.5l4.5 4.5L19 7.5"] : ["M12 5v14", "M5 12h14"])]);
}
// On a model page: the colour on screen.
function cartPageButton(m, v) {
  const on = cartIndex(m.model_id, v.variant_id) >= 0;
  return el("button", { class: "btn pick-page" + (on ? " on" : ""), type: "button", "aria-pressed": on ? "true" : "false",
    onclick: () => { cartToggle(m.model_id, v.variant_id); render(); } },
    [svg(on ? ["M5 12.5l4.5 4.5L19 7.5"] : BAG), tr(on ? "In the selection" : "Add to selection")]);
}
function selectionHeaderButton() {
  const n = S.cart.length;
  return el("a", { class: "hbtn sel-btn", id: "sel-btn", href: "#/selection", title: tr("Selection"), "aria-label": tr("Selection") + (n ? ": " + tr("{n} pieces", { n }) : "") },
    [svg(BAG), el("span", { class: "lbl-wide", text: tr("Selection") }), n ? el("span", { class: "badge", text: String(n) }) : null]);
}
function selectionEntry() {
  const n = S.cart.length;
  return el("a", { href: "#/selection", class: "entry-sel" }, [el("div", { class: "k", text: tr("Selection") }),
    el("div", { class: "n", text: n ? tr("{n} pieces", { n }) : tr("Nothing chosen yet") }),
    el("div", { class: "c", text: tr("PDF or print") + " · " + tr("Copy as a message") })]);
}

/* ---------------------------------------------------------------- the data */
// The items on screen: a list that came by link, or this device's own.
function linkItems(params) {
  return params.getAll("p").map((s) => { const i = String(s).indexOf("~"); return cleanItem(i < 0 ? { m: s } : { m: s.slice(0, i), v: s.slice(i + 1) || null }); }).filter(Boolean).slice(0, CART_MAX);
}
function selectionHash(items) {
  const p = new URLSearchParams();
  for (const x of items) p.append("p", x.v ? x.m + "~" + x.v : x.m);
  const s = p.toString();
  return "#/selection" + (s ? "?" + s : "");
}
S.cartData = {};       // model reference → the `model` answer, or { error }
async function loadSelection(items) {
  const need = [...new Set(items.map((x) => x.m))].filter((id) => !S.cartData[id]);
  if (!need.length) return;
  for (const id of need) S.cartData[id] = { loading: true };
  await Promise.all(need.map(async (id) => {
    try { S.cartData[id] = { data: await call("model", { model_id: id }) }; }
    // a piece that is gone stays gone; anything else (no Wi-Fi, a server hiccup) may be tried again
    catch (e) { S.cartData[id] = e.status === 404 ? { error: tr("This piece is no longer in the catalogue.") } : { error: e.message || tr("Could not load this piece."), again: true }; }
  }));
  if (parseHash().view === "selection") render();
}
function selRetry() {
  for (const [id, d] of Object.entries(S.cartData)) if (d && d.again) delete S.cartData[id];
  if (parseHash().view === "selection" && !S.locked) render();
}
window.addEventListener("online", selRetry);
// Everything a line of the selection says, worked out once for the page, the sheet and the message.
function selLine(it) {
  const D = S.cartData[it.m];
  if (!D || D.loading) return { it, loading: true };
  if (D.error || !D.data || !D.data.variants || !D.data.variants.length) return { it, error: (D && D.error) || tr("This piece is no longer in the catalogue."), again: !!D.again };
  const { model: m, variants, photos } = D.data;
  const v = variants.find((x) => x.variant_id === it.v) || variants.find((x) => x.in_stock) || variants.find((x) => x.qty_transit > 0) || variants[0];
  const A = attrsFor(variants, v, m);
  const code = (v.colour_code || "").toUpperCase();
  const pieces = v.pieces || [];
  const amounts = (it.v ? pieces : variants.flatMap((x) => (x.in_stock ? x.pieces || [] : []))).map((p) => p.price_uzs).filter(Boolean);
  if (!amounts.length && v.price_uzs) amounts.push(v.price_uzs);
  const lo = amounts.length ? Math.min(...amounts) : null, hi = amounts.length ? Math.max(...amounts) : null;
  const gold = COLOUR_OF_CODE[code];
  const stones = m.category === "jewellery" ? ((m.stone_keys || []).length ? m.stone_keys.map((k) => nm(STONE_NAMES, k)).join(", ") : tr("No stones")) : null;
  const carat = A.total_stone_carat && (m.stone_keys || []).length ? withUnit("total_stone_carat", A.total_stone_carat.value) : null;
  const sizes = [...new Set(pieces.map((p) => p.size).filter(Boolean))];
  const shown = (photos || []).filter((p) => p.variant_id === v.variant_id || !p.variant_id);
  const photo = shown[0] || (photos || [])[0] || null;
  return {
    it, m, v,
    brand: m.brand,
    title: (A.model_name && A.model_name.value) || modelTitle(m),
    kind: [m.collection, typeName(m.retail_category)].filter(Boolean).join(" · "),
    ref: it.v ? v.variant_id : m.article,
    material: gold && it.v ? nm(METAL_NAMES, gold + "_gold") : cardMaterial(m),
    stones: [stones, carat].filter(Boolean).join(", ") || null,
    size: m.category === "watch" ? (A.case_diameter_mm ? tr("{n} mm", { n: A.case_diameter_mm.value }) : null) : (sizes.length ? sizes.join(", ") : null),
    sizeLabel: m.category === "watch" ? tr("Case diameter") : tr(sizes.length > 1 ? "Sizes" : "Size"),
    lo, hi,
    state: v.in_stock ? "in" : v.qty_transit > 0 ? "transit" : "out",
    photo: photo ? photoUrl(photo.path_thumb || photo.path_full) : null,
    photoBig: photo ? photoUrl(photo.path_full || photo.path_thumb) : null,
    href: "#/model/" + encodeURIComponent(m.model_id) + (it.v ? "?v=" + encodeURIComponent(it.v) : ""),
  };
}
const selPrice = (L, show) => (!show ? null : L.lo == null ? tr("Price on request") : L.lo === L.hi ? fmtAmt(L.lo) : tr("from {p}", { p: fmtAmt(L.lo) }));
function selTotal(lines) {
  const priced = lines.filter((L) => L.lo != null);
  return { sum: priced.reduce((a, L) => a + L.lo, 0), from: priced.some((L) => L.lo !== L.hi) || priced.length < lines.filter((L) => !L.error && !L.loading).length, n: priced.length };
}
const STATE_WORD = { in: "In stock", transit: "In transit", out: "Sold out" };
const today = () => new Date().toLocaleDateString(LOC(), { day: "numeric", month: "long", year: "numeric" });

/* ---------------------------------------------------------------- the page */
function renderSelection() {
  const r = parseHash();
  const fromLink = linkItems(r.params);
  const shared = fromLink.length > 0;
  const items = shared ? fromLink : S.cart;
  const head = [crumbs([{ text: tr("Home"), href: "#/" }, { text: tr("Selection") }]),
    el("h1", { class: "page", text: shared ? tr("A colleague's selection") : tr("Your selection") })];
  if (!items.length) {
    return [...head, el("div", { class: "empty sel-empty" }, [el("div", { class: "serif", text: tr("The selection is empty.") }),
      el("div", { text: tr("Tick pieces on the cards or on a model page, and they gather here: to show side by side, to print or save as a PDF, or to send as a message.") }),
      el("p", {}, [el("a", { class: "btn primary", href: listHash({ stock: "in" }), text: tr("Browse the catalogue") })])])];
  }
  loadSelection(items);
  const lines = items.map(selLine);
  const ready = lines.every((L) => !L.loading);
  const showPrices = !S.hide;
  const tot = selTotal(lines);
  const row = (L, i) => {
    if (L.loading) return el("div", { class: "sel-row" }, [el("div", { class: "skel" })]);
    const remove = shared ? null : el("button", { class: "btn sm sel-remove", type: "button", "aria-label": tr("Remove") + (L.title ? ": " + L.title : ""),
      onclick: () => { S.cart.splice(i, 1); cartSave(); toast(tr("Removed from the selection.")); render(); } }, [tr("Remove")]);
    if (L.error) return el("div", { class: "sel-row gone" }, [el("div", { class: "sel-ph" }, [el("img", { src: mono(), alt: "" })]),
      el("div", { class: "sel-main" }, [el("div", { class: "ref", text: tr("Ref.") + " " + (L.it.v || L.it.m) }), el("div", { class: "sel-note", text: L.error })]),
      el("div", { class: "sel-side" }, [L.again ? el("button", { class: "btn sm sel-again", type: "button", onclick: selRetry }, [tr("Try again")]) : null, remove])]);
    const spec = (label, value) => (value ? el("div", { class: "sel-spec" }, [el("dt", { text: label }), el("dd", { text: value })]) : null);
    return el("div", { class: "sel-row" + (L.state === "out" ? " out" : "") }, [
      el("a", { class: "sel-ph" + (L.photo ? " photo" : ""), href: L.href, "aria-label": L.title }, [el("img", { src: L.photo || mono(), alt: L.photo ? L.title : "", loading: "lazy" })]),
      el("div", { class: "sel-main" }, [
        el("div", { class: "brandname", text: L.brand }),
        el("a", { class: "nm", href: L.href, text: L.title }),
        el("div", { class: "mat", text: L.kind }),
        el("div", { class: "ref", text: tr("Ref.") + " " + L.ref }),
        el("dl", { class: "sel-specs" }, [spec(tr("Material"), L.material), spec(tr("Stones"), L.stones), spec(L.sizeLabel, L.size)]),
      ]),
      el("div", { class: "sel-side" }, [
        showPrices ? el("div", { class: "price", text: selPrice(L, true) }) : el("div", { class: "price", text: "•••" }),
        el("span", { class: "stock " + L.state, text: tr(STATE_WORD[L.state]) }),
        remove,
      ]),
    ]);
  };
  const total = el("div", { class: "sel-total" }, [
    el("span", { class: "count-line", style: "margin:0", text: tr("{n} pieces", { n: items.length }) }),
    el("span", { class: "spacer" }),
    tot.n ? el("span", { class: "lbl", text: tr(tot.from ? "Total, from" : "Total") }) : null,
    tot.n ? el("span", { class: "sum", id: "sel-sum", text: showPrices ? fmtAmt(tot.sum) : "•••" }) : null,
  ]);
  const act = (label, icon, onclick, cls) => el("button", { class: "btn " + (cls || ""), type: "button", disabled: ready ? null : "disabled", onclick }, [icon ? svg(icon) : null, label]);
  const actions = el("div", { class: "sel-actions" }, [
    act(tr("PDF or print"), ["M7 8V4h10v4", "M7 17H5v-7h14v7h-2", "M8 14h8v6H8z"], () => openSheetOptions(lines), "primary"),
    act(tr("Copy as a message"), ["M4 5h16v11H9l-5 4z"], () => copyText(selMessage(lines, showPrices), tr("Copied. Paste it into Telegram or WhatsApp."))),
    act(tr("Copy the link"), ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
      () => copyText(location.href.split("#")[0] + selectionHash(items), tr("Link copied. It opens for anyone with a catalogue passcode."))),
    S.client ? null : el("button", { class: "btn", type: "button", onclick: () => setClient(true) }, [svg(["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"]), tr("Show to a client")]),
    el("span", { class: "spacer" }),
    shared ? el("button", { class: "btn", type: "button", onclick: () => { S.cart = items.slice(); cartSave(); go("#/selection"); } }, [tr("Keep as my selection")])
      : el("button", { class: "linkbtn", type: "button", onclick: () => { S.cart = []; cartSave(); toast(tr("Selection cleared.")); render(); } }, [tr("Clear the selection")]),
  ]);
  const note = shared ? el("p", { class: "page-sub" }, [tr("This list came by link. Yours is untouched."), " ", el("a", { href: "#/selection", text: tr("Back to my selection") })]) : null;
  return [...head, note, actions, el("div", { class: "sel-list", id: "sel-list" }, lines.map(row)), total];
}

/* ----------------------------------------------------------- the message */
function selMessage(lines, showPrices) {
  const good = lines.filter((L) => !L.error && !L.loading);
  const out = ["Delardi · " + tr("A selection for you") + " · " + today(), ""];
  good.forEach((L, i) => {
    out.push((i + 1) + ". " + L.brand + " · " + L.title);
    out.push("   " + [L.kind, L.material, L.stones, L.size ? L.sizeLabel + " " + L.size : null].filter(Boolean).join(" · "));
    out.push("   " + tr("Ref.") + " " + L.ref + (showPrices ? " · " + selPrice(L, true) : ""));
  });
  const tot = selTotal(good);
  if (showPrices && tot.n > 1) out.push("", tr(tot.from ? "Total, from" : "Total") + ": " + fmtAmt(tot.sum));
  out.push("", BOUTIQUE.name + " · " + BOUTIQUE.address[LANG === "ru" ? 1 : 0], BOUTIQUE.web + " · Telegram " + BOUTIQUE.telegram);
  if (S.session && S.session.name) out.push(S.session.name);
  return out.join("\n");
}
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); return; } catch (e) { /* older Safari, or no permission: the old way */ }
  const ta = el("textarea", { class: "sr-only", readonly: "readonly" }); ta.value = text; document.body.appendChild(ta);
  ta.select();
  let okay = false; try { okay = document.execCommand("copy"); } catch (e) { okay = false; }
  ta.remove();
  toast(okay ? done : tr("Could not copy. Select the text and copy it by hand."));
}

/* -------------------------------------------------------------- the sheet */
// A small panel first: who it is for and whether prices show. Nothing typed here is kept.
function openSheetOptions(lines) {
  S.selSheet = { who: "", prices: !S.hide, lines };
  layerOpened();
  renderSheetOptions();
}
// The sheet is emptied when the panel closes, not on "afterprint": an iPad reports the print as over before it has drawn the preview.
function closeSheetOptions() { S.selSheet = null; $("#layer").innerHTML = ""; $("#print").innerHTML = ""; layerClosed(); }
function renderSheetOptions() {
  const o = S.selSheet; const layer = $("#layer");
  layer.innerHTML = "";
  if (!o) return;
  const who = el("input", { type: "text", id: "sheet-who", maxlength: "80", autocomplete: "off", value: o.who, placeholder: tr("Client's name (optional, not kept)"), oninput: (e) => { o.who = e.target.value; } });
  const panel = el("div", { class: "sheet sel-sheet", role: "dialog", "aria-modal": "true", "aria-label": tr("The sheet") }, [
    el("header", {}, [el("h2", { text: tr("The sheet") }), el("button", { class: "btn", type: "button", onclick: closeSheetOptions, text: tr("Close") })]),
    el("div", { class: "scroll" }, [
      el("div", { class: "grp" }, [el("label", { class: "lbl", for: "sheet-who", text: tr("Prepared for") }), who,
        el("p", { class: "sel-hint", id: "sheet-who-hint", text: tr("Left empty, the sheet says “{d}”.", { d: tr("Delardi client") }) })]),
      el("div", { class: "grp" }, [el("label", { class: "check" }, [el("input", { type: "checkbox", id: "sheet-prices", checked: o.prices ? "checked" : null, onchange: (e) => { o.prices = e.target.checked; } }), tr("Show prices")])]),
      el("p", { class: "sel-hint", text: tr("In the print window choose “Save as PDF”. On an iPad: Print, then spread two fingers on the preview and share it.") }),
    ]),
    el("footer", {}, [
      el("button", { class: "btn", type: "button", onclick: closeSheetOptions, text: tr("Cancel") }),
      el("button", { class: "btn primary", id: "sheet-go", type: "button", onclick: () => { buildPrintSheet(o.lines, { who: o.who.trim(), prices: o.prices }); window.print(); }, text: tr("Print or save as PDF") }),
    ]),
  ]);
  layer.append(el("div", { class: "sheet-scrim", onclick: closeSheetOptions }), panel);
  setTimeout(() => who.focus(), 60);
}
// The sheet itself sits in #print: hidden on screen, the only thing on paper.
function buildPrintSheet(lines, opts) {
  const host = $("#print");
  host.innerHTML = "";
  const good = lines.filter((L) => !L.error && !L.loading);
  const brands = [...new Set(good.map((L) => L.brand))];
  const logos = brands.map((b) => (brandLogo(b) ? el("img", { src: brandLogo(b), alt: b }) : el("span", { text: b })));
  const tot = selTotal(good);
  host.append(
    el("header", { class: "ps-head" }, [
      el("img", { class: "ps-mark", src: WORDMARK_NAVY, alt: "Delardi" }),
      el("div", { class: "ps-where" }, [el("div", { text: BOUTIQUE.name }), el("div", { text: BOUTIQUE.address[LANG === "ru" ? 1 : 0] }), el("div", { text: BOUTIQUE.web + " · Telegram " + BOUTIQUE.telegram })]),
    ]),
    el("div", { class: "ps-title" }, [
      el("h1", { text: tr("A selection for you") }),
      // with no name typed the line still reads, with a default
      el("div", { class: "ps-meta" }, [el("span", { class: "ps-who", text: tr("Prepared for") + ": " + (opts.who || tr("Delardi client")) }), el("span", { text: today() })]),
    ]),
    el("div", { class: "ps-items" }, good.map((L, i) => el("div", { class: "ps-item" }, [
      el("div", { class: "ps-ph" }, [L.photoBig || L.photo ? el("img", { src: L.photoBig || L.photo, alt: "" }) : el("img", { class: "mono", src: MONO_NAVY, alt: "" })]),
      el("div", { class: "ps-main" }, [
        el("div", { class: "ps-brand", text: L.brand }),
        el("div", { class: "ps-name", text: L.title }),
        el("div", { class: "ps-kind", text: L.kind }),
        el("div", { class: "ps-specs", text: [L.material, L.stones, L.size ? L.sizeLabel + " " + L.size : null].filter(Boolean).join(" · ") }),
        el("div", { class: "ps-ref", text: tr("Ref.") + " " + L.ref }),
      ]),
      el("div", { class: "ps-side" }, [el("div", { class: "ps-no", text: String(i + 1) }), opts.prices ? el("div", { class: "ps-price", text: selPrice(L, true) }) : null]),
    ]))),
    opts.prices && tot.n > 1 ? el("div", { class: "ps-total" }, [el("span", { text: tr(tot.from ? "Total, from" : "Total") }), el("b", { text: fmtAmt(tot.sum) })]) : null,
    el("footer", { class: "ps-foot" }, [
      logos.length ? el("div", { class: "ps-logos" }, logos) : null,
      el("div", { class: "ps-small" }, [
        S.session && S.session.name ? el("span", { class: "ps-by", text: tr("Prepared by {who}", { who: S.session.name }) }) : null,
        opts.prices ? el("span", { text: tr("Prices in UZS, VAT included, as on {date}. Pieces are single items and may be sold in the meantime.", { date: today() }) }) : null,
      ]),
    ]),
  );
}
S.cart = cartLoad();
