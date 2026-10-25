/* ===========================================================================
   Part 3 — the model page (24 Oct 2026)
   One page per model (article) with a colour switch. The top answers the
   floor's first questions without scrolling on an iPad: name, price, stock and
   sizes, and the crucial facts. Below: the advisor's notes, the specifications
   section by section, the description, matching pieces, and — for the
   catalogue owner — what the data rests on.

   Missing values read "TBC". A value that is not yet confirmed, or where the
   brand's own page and Colibri disagree, is shown with one small mark.
   Facts that do not depend on the colour (stones, setting, case, story…) are
   carried over from a sibling colour when this colour has none of its own —
   the research was usually done on one colour of a model.
   ========================================================================= */
Object.assign(RU, {
  "Collection": "Коллекция",
  "Style": "Вид",
  "Gender": "Пол",
  "Metal": "Металл",
  "Metal colour": "Цвет металла",
  "Fineness": "Проба",
  "Metal weight": "Вес металла",
  "Total weight": "Общий вес",
  "Finish": "Отделка",
  "Stones": "Камни",
  "Centre stone": "Центральный камень",
  "Cut": "Огранка",
  "Centre stone weight": "Вес центрального камня",
  "Colour / clarity": "Цвет / чистота",
  "Number of stones": "Количество камней",
  "Total carat weight": "Общий вес камней",
  "Natural or lab-grown": "Природные или выращенные",
  "Certificate": "Сертификат",
  "Setting": "Закрепка",
  "Ring size": "Размер кольца",
  "Resizable": "Можно изменить размер",
  "Length": "Длина",
  "Adjustable length": "Регулируемая длина",
  "Dimensions": "Размеры",
  "Fastening": "Замок серёг",
  "Clasp": "Застёжка",
  "Case": "Корпус",
  "Bezel": "Безель",
  "Gem-set": "Камни на корпусе",
  "Case diameter": "Диаметр корпуса",
  "Thickness": "Толщина",
  "Lug width": "Ширина между ушками",
  "Case shape": "Форма корпуса",
  "Crystal": "Стекло",
  "Case back": "Задняя крышка",
  "Water resistance": "Водонепроницаемость",
  "Movement": "Механизм",
  "Calibre": "Калибр",
  "Power reserve": "Запас хода",
  "Complications": "Функции",
  "Dial": "Циферблат",
  "Luminous": "Люминесценция",
  "Strap / bracelet": "Ремешок / браслет",
  "Quick-change strap": "Быстрая смена ремешка",
  "Extra strap included": "Дополнительный ремешок",
  "Model": "Модель",
  "Size and fit": "Размер и посадка",
  "Dial and strap": "Циферблат и ремешок",
  "Specifications": "Характеристики",
  "For the advisor": "Для консультанта",
  "The story": "История",
  "Signature line of the brand": "Знаковая линия бренда",
  "Wear as a set": "Носить в комплекте",
  "Can be stacked with other pieces": "Можно сочетать с другими изделиями",
  "Pairs with": "Сочетается с",
  "Occasion": "Повод",
  "Good to know": "Полезно знать",
  "Description": "Описание",
  "Matching pieces": "Парные изделия",
  "Same collection": "Из той же коллекции",
  "Not yet confirmed": "Ещё не подтверждено",
  "The brand's page and Colibri differ — check the piece": "Данные бренда и Colibri расходятся — проверьте изделие",
  "Taken from another colour of this model": "Взято из другого цвета этой модели",
  "{a} of {b} details on file": "Заполнено: {a} из {b}",
  "Data and sources": "Данные и источники",
  "Only you see this block.": "Этот блок видите только вы.",
  "Confidence": "Достоверность",
  "Checked against": "Сверено с",
  "Name on the receipt": "Наименование в чеке",
  "Notes": "Заметки",
  "Colibri and the source differ": "Colibri и источник расходятся",
  "Colibri only": "Только Colibri",
  "high": "высокая", "medium": "средняя", "low": "низкая",
  "Not found online": "В интернете не найдено",
  "{n} piece": "{n} шт.", "{n} pieces": "{n} шт.",
  "size {s}": "размер {s}",
  "Sizes": "Размеры",
  "No stones": "Без камней",
  "Case size, mm": "Размер корпуса, мм",
  "Arrived": "Поступление",
  "Open reports": "Открытые замечания",
  "Photos": "Фото",
  "Photo {n}": "Фото {n}",
  "Photo of another colour": "Фото другого цвета",
});

// Attribute keys: label, unit, and whether the value depends on the colour.
const ATTR = {
  subcategory: { l: "Style" }, gender: { l: "Gender" }, collection: { l: "Collection" }, model_name: { l: "Model" },
  metal: { l: "Metal" }, metal_colour: { l: "Metal colour", colour: true }, fineness: { l: "Fineness" },
  metal_weight_g: { l: "Metal weight", u: "g", colour: true }, total_weight_g: { l: "Total weight", u: "g", colour: true },
  finish: { l: "Finish" }, stones: { l: "Stones" }, centre_stone_type: { l: "Centre stone" }, centre_stone_cut: { l: "Cut" },
  centre_stone_carat: { l: "Centre stone weight", u: "ct" }, centre_stone_colour_clarity: { l: "Colour / clarity" },
  stone_count: { l: "Number of stones" }, total_stone_carat: { l: "Total carat weight", u: "ct" },
  natural_or_lab: { l: "Natural or lab-grown" }, certificate: { l: "Certificate" }, setting: { l: "Setting" },
  ring_size: { l: "Ring size", colour: true }, resizable: { l: "Resizable" }, chain_or_bracelet_length_cm: { l: "Length", u: "cm" },
  adjustable_length: { l: "Adjustable length" }, dimensions: { l: "Dimensions" }, earring_fastening: { l: "Fastening" },
  clasp_type: { l: "Clasp" },
  case_material: { l: "Case" }, bezel_material: { l: "Bezel" }, gem_set: { l: "Gem-set" }, case_diameter_mm: { l: "Case diameter", u: "mm" },
  case_thickness_mm: { l: "Thickness", u: "mm" }, lug_width_mm: { l: "Lug width", u: "mm" }, case_shape: { l: "Case shape" },
  crystal: { l: "Crystal" }, case_back: { l: "Case back" }, water_resistance_m: { l: "Water resistance", u: "m" },
  movement_type: { l: "Movement" }, calibre: { l: "Calibre" }, power_reserve_h: { l: "Power reserve", u: "h" },
  complications: { l: "Complications" }, dial_colour_finish: { l: "Dial" }, luminous: { l: "Luminous" },
  strap_material_colour: { l: "Strap / bracelet" }, clasp: { l: "Clasp" }, quick_change_strap: { l: "Quick-change strap" },
  extra_strap_included: { l: "Extra strap included" },
  // never inherited: written for one colour
  name_en: { colour: true }, name_ru: { colour: true }, receipt_name: { colour: true }, description_en: { colour: true },
};
const UNITS = { g: ["g", "г"], ct: ["ct", "кт"], cm: ["cm", "см"], mm: ["mm", "мм"], m: ["m", "м"], h: ["h", "ч"] };
const SECTIONS = [["identity", "Model"], ["metal", "Metal"], ["stones", "Stones"], ["size", "Size and fit"],
  ["watch_case", "Case"], ["movement", "Movement"], ["dial_strap", "Dial and strap"]];
const SPEC_SKIP = new Set(["name_en", "name_ru", "receipt_name", "extra", "motif_story_en", "motif_story_ru", "brand_icon", "stackable", "matching_pieces", "occasion"]);
// Short enumerated values read in Russian; free text stays as written (the RU pass comes later).
const VALUE_RU = {
  yes: "да", no: "нет", women: "женское", men: "мужское", unisex: "унисекс", automatic: "автоматический", quartz: "кварцевый",
  manual: "механический с ручным заводом", white: "белый", yellow: "жёлтый", rose: "розовый", "two-tone": "двухцветный", black: "чёрный",
  gold: "золото", silver: "серебро", steel: "сталь", "stainless steel": "нержавеющая сталь", titanium: "титан", platinum: "платина",
  natural: "природные", "lab-grown": "выращенные", polished: "полированная", satin: "сатинированная", diamonds: "бриллианты", diamond: "бриллиант",
  brilliant: "круглая бриллиантовая", round: "круглая", tonneau: "тонно", cushion: "подушка", square: "квадратная", rectangular: "прямоугольная",
  sapphire: "сапфировое", "sapphire display": "прозрачная (сапфир)", solid: "глухая", date: "дата", chronograph: "хронограф",
  "small seconds": "малая секундная стрелка", skeleton: "скелетон", gmt: "GMT", "moon phase": "фаза Луны", retrograde: "ретроградная индикация",
  everyday: "на каждый день", evening: "вечер", gift: "подарок", engagement: "помолвка", wedding: "свадьба", statement: "акцент",
  solitaire: "солитер", band: "кольцо-бэнд (дорожка)", eternity: "дорожка по кругу", cocktail: "коктейльное", signet: "печатка", stackable: "наборное",
  pendant: "подвеска", choker: "чокер", chain: "цепь", tennis: "теннисный", collier: "колье", studs: "пусеты", hoops: "кольца", drops: "подвесные",
  "ear cuff": "каффа", climbers: "клаймберы", bangle: "жёсткий", cuff: "кафф", cord: "на шнурке", dress: "классические", sport: "спортивные",
  complication: "с усложнениями", post: "штифт", "lever-back": "английский замок", "clip-on": "клипсы", hook: "крючок", "hinged hoop": "конго",
  lobster: "карабин", "spring ring": "пружинное кольцо", box: "коробочка", slider: "слайдер", toggle: "тогл", hidden: "скрытый",
  "pin buckle": "пряжка", folding: "раскладывающаяся", deployant: "раскладывающаяся", butterfly: "бабочка", prong: "крапан", bezel: "глухая",
  "pavé": "паве", channel: "рельсовая", invisible: "невидимая", bead: "корнеровая", gypsy: "цыганская",
};
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
const MOVEMENT_NAMES = { automatic: ["Automatic", "Автоматический"], quartz: ["Quartz", "Кварцевый"], manual: ["Hand-wound", "Ручной завод"] };
const nm = (dict, k) => (dict[k] ? dict[k][LANG === "ru" ? 1 : 0] : k);
const COLOUR_OF_CODE = { WG: "white", YG: "yellow", PG: "rose", RG: "rose" };

function ruValue(v) {
  if (LANG !== "ru" || !v) return v;
  const whole = VALUE_RU[String(v).toLowerCase().trim()];
  if (whole) return whole;
  // A list of short words ("date, chronograph") reads item by item; anything else stays as written.
  const parts = String(v).split(/\s*,\s*/);
  if (parts.length > 1 && parts.every((p) => VALUE_RU[p.toLowerCase()])) return parts.map((p) => VALUE_RU[p.toLowerCase()]).join(", ");
  return v;
}
function withUnit(key, v) {
  const u = ATTR[key] && ATTR[key].u;
  if (!u || !/^[\d.,\s×x]+$/.test(String(v))) return v;
  return v + " " + UNITS[u][LANG === "ru" ? 1 : 0];
}

/* The attribute set for one colour: its own values, then the colour-free values
   of its sibling colours, then what follows from the colour code itself. */
function attrsFor(variants, v) {
  const out = {};
  for (const [k, a] of Object.entries(v.attributes || {})) out[k] = { ...a };
  const others = variants.filter((x) => x !== v).sort((a, b) => Object.keys(b.attributes || {}).length - Object.keys(a.attributes || {}).length);
  for (const o of others) {
    for (const [k, a] of Object.entries(o.attributes || {})) {
      if (out[k] || (ATTR[k] && ATTR[k].colour)) continue;
      out[k] = { ...a, inherited: true };
    }
  }
  const c = COLOUR_OF_CODE[(v.colour_code || "").toUpperCase()];
  if (c && (!out.metal_colour || out.metal_colour.inherited)) out.metal_colour = { value: c, flag: "colibri_only" };
  const sizes = [...new Set((v.pieces || []).map((p) => p.size).filter(Boolean))];
  if (sizes.length && !out.ring_size && variants[0] && S.model && S.model.data.model.retail_category === "ring") out.ring_size = { value: sizes.join(", "), flag: "colibri_only" };
  return out;
}
function mark(a) {
  if (!a || S.client) return null;
  if (a.flag === "conflict") return el("span", { class: "unv conflict", title: tr("The brand's page and Colibri differ — check the piece"), "aria-label": tr("The brand's page and Colibri differ — check the piece"), text: "!" });
  if (a.flag === "unconfirmed") return el("span", { class: "unv", title: tr("Not yet confirmed"), "aria-label": tr("Not yet confirmed"), text: "?" });
  return null;
}
function valueNode(key, a) {
  if (!a || a.value === null || a.value === undefined || a.value === "") return S.client ? null : el("span", { class: "tbc", text: tr("TBC") });
  return el("span", { class: "val" + (a.inherited ? " inh" : ""), title: a.inherited ? tr("Taken from another colour of this model") : null }, [withUnit(key, cap(ruValue(a.value))), mark(a)]);
}

/* ---------------------------------------------------------------- the page */
function renderModel() {
  const M = S.model;
  if (!M || (!M.data && !M.error)) return [el("div", { class: "mp-skel" }, [el("div", { class: "skel" }), el("div", { class: "skel" })])];
  if (M.error) return [crumbs([{ text: tr("Home"), href: "#/" }]), el("div", { class: "empty" }, [el("div", { class: "serif", text: M.error }), S.offline ? retryButton() : null])];
  const { model: m, variants, expected, linked, reports } = M.data;
  if (!variants.length) return [el("div", { class: "empty", text: tr("TBC") })];
  // The colour on screen: the one asked for in the address, else the first in stock, else the first.
  const want = parseHash().params.get("v");
  const v = variants.find((x) => x.variant_id === want) || variants.find((x) => x.in_stock) || variants[0];
  const A = attrsFor(variants, v);
  const val = (k) => (A[k] && A[k].value) || null;

  const title = val("model_name") || m.model_name || m.collection || typeName(m.retail_category);
  const sub = [m.collection && !String(title).toLowerCase().includes(String(m.collection).toLowerCase()) ? m.collection : null, typeName(m.retail_category)].filter(Boolean).join(" · ");
  const pieces = v.pieces || [];
  const sizes = [...new Set(pieces.map((p) => p.size).filter(Boolean))];
  const prices = pieces.map((p) => p.price_uzs).filter(Boolean);
  const price = prices.length ? (Math.min(...prices) === Math.max(...prices) ? fmtUZS(prices[0]) : fmtUZS(Math.min(...prices)) + " – " + fmtUZS(Math.max(...prices))) : fmtUZS(v.price_uzs);

  // ---- colour switch
  const colourName = (x) => {
    const code = (x.colour_code || "").toUpperCase();
    if (COLOUR_NAMES[code]) return COLOUR_NAMES[code][LANG === "ru" ? 1 : 0];
    return (LANG === "ru" && x.colour_name_ru) || x.colour_name_en || x.colour_code || x.variant_id;
  };
  const switcher = variants.length > 1 ? el("div", { class: "mp-colours", role: "group", "aria-label": tr("Colours") }, variants.map((x) => {
    const code = (x.colour_code || "").toUpperCase();
    return el("a", {
      class: "chip mp-colour" + (x.in_stock ? "" : " out"), href: "#/model/" + encodeURIComponent(m.model_id) + "?v=" + encodeURIComponent(x.variant_id),
      "aria-pressed": x === v ? "true" : "false", "aria-current": x === v ? "true" : null,
      onclick: (e) => { e.preventDefault(); try { history.replaceState(null, "", e.currentTarget.getAttribute("href")); } catch (err) { /* ignore */ } render(); },
    }, [el("span", { class: "dot " + (COLOUR_NAMES[code] ? code : "other") }), colourName(x), x.in_stock ? null : el("span", { class: "cnt", text: tr("Sold out").toLowerCase() })]);
  })) : null;

  // ---- the crucial facts
  const material = (() => {
    if (m.category === "jewellery") {
      const colour = val("metal_colour"), metal = val("metal"), fine = val("fineness");
      if (!metal && !colour) return m.material ? { value: m.material, flag: "colibri_only" } : null;
      const metalWord = metal && colour && /gold|золот/i.test(metal) ? nm(METAL_NAMES, colour + "_gold") : [colour ? ruValue(colour) : null, metal ? ruValue(metal) : null].filter(Boolean).join(" ");
      return { value: [metalWord, fine].filter(Boolean).join(", "), flag: worst([A.metal, A.metal_colour, A.fineness]) };
    }
    return A.case_material || A.strap_material_colour || (m.material ? { value: m.material, flag: "colibri_only" } : null);
  })();
  const stones = (() => {
    const s = A.stones; const ct = A.total_stone_carat;
    if (!s && !ct) return null;
    const words = s ? ruValue(s.value) : null;
    return { value: [words, ct ? withUnit("total_stone_carat", ct.value) : null].filter(Boolean).join(", "), flag: worst([s, ct]), inherited: (s && s.inherited) || (ct && ct.inherited) };
  })();
  const sizeFact = (() => {
    if (m.retail_category === "ring") return sizes.length ? { value: sizes.join(", "), flag: "colibri_only" } : A.ring_size;
    if (m.category === "watch") return A.case_diameter_mm ? { ...A.case_diameter_mm, value: withUnit("case_diameter_mm", A.case_diameter_mm.value) } : null;
    if (A.chain_or_bracelet_length_cm) return { ...A.chain_or_bracelet_length_cm, value: withUnit("chain_or_bracelet_length_cm", A.chain_or_bracelet_length_cm.value) };
    return A.dimensions || null;
  })();
  const sizeLabel = m.retail_category === "ring" ? tr("Ring size") : m.category === "watch" ? tr("Case diameter") : A.chain_or_bracelet_length_cm ? tr("Length") : tr("Dimensions");
  const fact = (label, a, links) => el("div", { class: "fact" }, [el("dt", { text: label }), el("dd", {},
    links && links.length ? factLinks(links, a) :
    [a && typeof a === "object" && "value" in a ? valueNode("", a) : (a ? el("span", { class: "val", text: a }) : (S.client ? el("span", { text: "—" }) : el("span", { class: "tbc", text: tr("TBC") })))])]);
  // v7 (25 Oct 2026): the facts open the list of everything that shares them.
  const colourMetal = COLOUR_OF_CODE[(v.colour_code || "").toUpperCase()];
  const metalKeys = colourMetal ? [colourMetal + "_gold"]
    : (m.metal_keys || []).filter((k) => m.category === "accessory" || !["rubber", "leather"].includes(k));
  const gKey = A.gender && GENDERS[String(A.gender.value).toLowerCase()] ? String(A.gender.value).toLowerCase() : m.gender;
  const collectionVal = A.collection || (m.collection ? { value: m.collection, flag: "colibri_only" } : null);
  const facts = el("dl", { class: "facts" }, [
    fact(tr("Collection"), collectionVal, m.collection ? [{ text: collectionVal ? collectionVal.value : m.collection, href: listHash({ brands: [m.brand], collections: [m.collection] }) }] : null),
    fact(tr("Category"), null, [{ text: catName(m.category), href: listHash({ category: m.category }) }, { text: typeName(m.retail_category), href: listHash({ types: [m.retail_category] }) }]),
    fact(tr("Model name and number"), [val("model_name") || m.model_name, v.variant_id].filter(Boolean).join(" · ")),
    fact(tr("Material"), material, material && metalKeys.length ? [{ text: material.value, href: listHash({ category: m.category, metals: metalKeys }) }] : null),
    m.category === "watch"
      ? fact(tr("Movement"), A.movement_type ? { ...A.movement_type, value: ruValue(A.movement_type.value) } : null,
          m.movement ? [{ text: ruValue(A.movement_type ? A.movement_type.value : m.movement), href: listHash({ category: "watch", movements: [m.movement] }) }] : null)
      : m.category !== "accessory"
        ? fact(tr("Stones"), stones, stones && (m.stone_keys || []).length
            ? [...m.stone_keys.map((k) => ({ text: nm(STONE_NAMES, k), href: listHash({ category: m.category, stones: [k] }) })),
               ...(A.total_stone_carat ? [{ text: withUnit("total_stone_carat", A.total_stone_carat.value) }] : [])] : null)
        : null,
    m.category !== "accessory" ? fact(sizeLabel, sizeFact) : null,
    fact(tr("Gender"), A.gender ? { ...A.gender, value: ruValue(A.gender.value) } : null,
      gKey ? [{ text: cap(ruValue(A.gender ? A.gender.value : gKey)), href: listHash({ category: m.category, genders: [gKey] }) }] : null),
  ]);

  const stock = v.in_stock
    ? el("div", { class: "mp-stock" }, [el("span", { class: "stock in", text: tr("In stock") }),
        S.client ? null : el("span", { text: tr(pieces.length === 1 ? "{n} piece" : "{n} pieces", { n: pieces.length || v.qty_stock }) }),
        sizes.length ? el("span", { text: tr("Sizes") + ": " + sizes.join(", ") }) : null])
    : el("div", { class: "mp-stock" }, [el("span", { class: "stock out", text: tr("Sold out") }),
        v.arrival_years && v.arrival_years.length && !S.client ? el("span", { text: tr("Arrived") + ": " + v.arrival_years.join(", ") }) : null]);

  const top = el("section", { class: "mp-top" }, [
    gallery(M.data.photos || [], v, title),
    el("div", { class: "mp-info" }, [
      el("div", { class: "brandname", text: m.brand }),
      el("h1", { class: "mp-title", text: title }),
      el("div", { class: "mp-sub" }, [sub, el("span", { class: "ref", text: " · " + tr("Ref.") + " " + v.variant_id })]),
      switcher,
      el("div", { class: "mp-price" + (v.in_stock ? "" : " out"), text: price || "" }),
      stock,
      facts,
      el("div", { class: "mp-actions" }, [reportButton()]),
    ]),
  ]);

  // ---- for the advisor
  const story = LANG === "ru" ? (A.motif_story_ru || A.motif_story_en) : (A.motif_story_en || A.motif_story_ru);
  const advisorRows = [];
  if (story) advisorRows.push(el("p", { class: "story" }, [story.value, mark(story)]));
  const yes = (a) => a && String(a.value).toLowerCase().startsWith("yes");
  const tags = [];
  if (yes(A.brand_icon)) tags.push(tr("Signature line of the brand"));
  if (yes(A.stackable)) tags.push(tr("Can be stacked with other pieces"));
  if (tags.length) advisorRows.push(el("div", { class: "chiprow" }, tags.map((t) => el("span", { class: "chip static", text: t }))));
  const adv = (label, a) => (a ? el("div", { class: "adv" }, [el("div", { class: "lbl", text: label }), el("div", {}, [ruValue(a.value), mark(a)])]) : null);
  advisorRows.push(adv(tr("Occasion"), A.occasion), adv(tr("Pairs with"), A.matching_pieces), adv(tr("Good to know"), A.extra));
  const advisor = advisorRows.filter(Boolean).length ? el("section", { class: "panel advisor" }, [el("h2", { text: tr(S.client ? "The story" : "For the advisor") }), ...advisorRows]) : null;

  // ---- specifications, section by section
  const exp = (expected || []).filter((e) => !SPEC_SKIP.has(e.key));
  const extraKeys = Object.keys(A).filter((k) => ATTR[k] && ATTR[k].l && !SPEC_SKIP.has(k) && !exp.some((e) => e.key === k));
  const specSections = SECTIONS.map(([sec, label]) => {
    const keys = exp.filter((e) => e.section === sec).map((e) => e.key);
    if (sec === "identity") keys.push(...extraKeys.filter((k) => ["subcategory", "gender", "collection", "model_name"].includes(k) && !keys.includes(k)));
    const rows = keys.map((k) => {
      const node = valueNode(k, A[k]);
      if (!node) return null;
      return el("div", { class: "spec" }, [el("dt", { text: tr(ATTR[k] ? ATTR[k].l : k) }), el("dd", {}, [node])]);
    }).filter(Boolean);
    return rows.length ? el("div", { class: "spec-sec" }, [el("h3", { text: tr(label) }), el("dl", {}, rows)]) : null;
  }).filter(Boolean);
  const have = exp.filter((e) => A[e.key] && A[e.key].value).length;
  const specs = el("section", { class: "panel specs" }, [
    el("div", { class: "panel-h" }, [el("h2", { text: tr("Specifications") }), S.client ? null : el("span", { class: "muted", text: tr("{a} of {b} details on file", { a: have, b: exp.length }) })]),
    el("div", { class: "spec-grid" }, specSections),
  ]);

  // ---- description: our own words in English, Colibri's text in Russian
  const descEn = A.description_en ? A.description_en.value : v.description_en;
  const desc = LANG === "ru" ? (v.description_ru || descEn) : (descEn || v.description_ru);
  const description = desc ? el("section", { class: "panel" }, [el("h2", { text: tr("Description") }), el("p", { class: "desc", text: desc })]) : null;

  // ---- matching pieces
  const match = linked && linked.length ? [el("div", { class: "section-h", style: "margin-top:8px" }, [el("h2", { text: tr("Matching pieces") }), el("span", { class: "muted", text: tr("Same collection") })]),
    el("div", { class: "cards" }, linked.slice(0, 8).map(card))] : [];

  // ---- the owner's block
  let owner = null;
  if (S.session && S.session.can_manage && !S.client) {
    const rows = [];
    const row = (k, node) => rows.push(el("div", { class: "spec" }, [el("dt", { text: k }), el("dd", {}, [node])]));
    row(tr("Confidence"), el("span", { text: v.found_online ? tr(v.confidence || "low") : tr("Not found online") }));
    if (v.sources && v.sources.length) row(tr("Checked against"), el("span", {}, v.sources.map((u, i) => el("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: (i ? ", " : "") + hostOf(u) }))));
    if (A.receipt_name) row(tr("Name on the receipt"), el("span", { text: A.receipt_name.value }));
    if (v.conflicts) row(tr("Colibri and the source differ"), el("span", { text: v.conflicts }));
    if (v.notes) row(tr("Notes"), el("span", { text: v.notes }));
    if (reports && reports.length) row(tr("Open reports"), el("span", { text: String(reports.length) }));
    owner = el("details", { class: "panel owner" }, [el("summary", {}, [el("h2", { text: tr("Data and sources") }), el("span", { class: "muted", text: tr("Only you see this block.") })]), el("dl", {}, rows)]);
  }

  const trail = [{ text: tr("Home"), href: "#/" }, { text: m.brand, href: listHash({ brands: [m.brand] }) }];
  if (m.collection) trail.push({ text: m.collection, href: listHash({ brands: [m.brand], collections: [m.collection] }) });
  trail.push({ text: m.article });
  return [crumbs(trail), top, el("div", { class: "mp-body" }, [el("div", { class: "col" }, [advisor, description].filter(Boolean)), el("div", { class: "col" }, [specs])]), ...match, owner].filter(Boolean);
}
/* v6 (25 Oct 2026): the gallery. The colour on screen shows its own photos and
   the model's general ones; a colour with none borrows another colour's, marked. */
function gallery(photos, v, title) {
  let shown = photos.filter((p) => p.variant_id === v.variant_id || !p.variant_id);
  let borrowed = false;
  if (!shown.length && photos.length) { shown = photos; borrowed = true; }
  if (!shown.length) return el("div", { class: "mp-photo" }, [el("img", { src: mono(), alt: "" }), el("span", { text: tr("Photo coming soon") })]);
  const strip = el("div", { class: "g-strip", tabindex: "0", "aria-label": tr("Photos") },
    shown.map((p, i) => el("img", { src: photoUrl(p.path_full), alt: title + (shown.length > 1 ? " — " + (i + 1) : ""), loading: i ? "lazy" : "eager", decoding: "async", width: p.width || null, height: p.height || null })));
  const dots = shown.length > 1 ? el("div", { class: "g-thumbs", role: "group", "aria-label": tr("Photos") }, shown.map((p, i) =>
    el("button", { type: "button", class: "g-thumb", "aria-label": tr("Photo {n}", { n: i + 1 }), "aria-current": i === 0 ? "true" : null,
      onclick: () => { strip.scrollTo({ left: strip.clientWidth * i, behavior: "smooth" }); } }, [el("img", { src: photoUrl(p.path_thumb), alt: "", loading: "lazy" })]))) : null;
  strip.addEventListener("scroll", () => {
    if (!dots) return;
    const i = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
    [...dots.children].forEach((b, j) => (j === i ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
  }, { passive: true });
  return el("div", { class: "mp-gallery" }, [strip, dots, borrowed && !S.client ? el("div", { class: "g-note", text: tr("Photo of another colour") }) : null]);
}
function factLinks(links, a) {
  const out = [];
  links.forEach((l, i) => {
    if (i) out.push(", ");
    out.push(l.href ? el("a", { class: "fact-link", href: l.href, text: cap(l.text) }) : el("span", { text: l.text }));
  });
  const mk = a && typeof a === "object" ? mark(a) : null;
  return [el("span", { class: "val" + (a && a.inherited ? " inh" : "") }, [...out, mk])];
}
function worst(list) {
  const fl = list.filter(Boolean).map((a) => a.flag);
  if (fl.includes("conflict")) return "conflict";
  if (fl.includes("unconfirmed")) return "unconfirmed";
  return fl.includes("confirmed") ? "confirmed" : "colibri_only";
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
