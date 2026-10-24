// A stand-in for catalogue-api: invented models, invented references and
// invented prices, so the checks run offline. Nothing here is real stock.
const BRANDS = ["Aurelle", "Castellane", "Montvert", "Orsino", "Valmont & Fils"];
const COLLS = { Aurelle: ["Étoile", "Rivière"], Castellane: ["Nuit", "Soleil"], Montvert: ["Alpine", "Glacier"], Orsino: ["Corsa"], "Valmont & Fils": ["Héritage", "Atelier"] };
const TYPES = [["jewellery", "ring"], ["jewellery", "earrings"], ["jewellery", "necklace"], ["jewellery", "bracelet"], ["watch", "watch"], ["accessory", "strap"]];
const MATS = ["white gold 750 (18K)", "rose gold 750 (18K)", "yellow gold 750 (18K)", "stainless steel", "titanium"];

function build() {
  const models = [];
  let n = 0;
  for (const b of BRANDS) {
    for (let i = 0; i < 18; i++) {
      n++;
      const [category, rc] = TYPES[n % TYPES.length];
      const coll = i % 5 === 4 ? null : COLLS[b][i % COLLS[b].length];
      const inStock = n % 4 !== 0;
      const price = (5 + ((n * 37) % 190)) * 1_000_000;
      const multi = n % 6 === 0 || n % 6 === 2;
      models.push({
        model_id: `Q${String(n).padStart(4, "0")}`, article: `Q-${String(n).padStart(4, "0")}`, brand: b, category, retail_category: rc,
        subcategory: null, collection: coll, model_name: i % 4 === 3 ? null : `${coll || "Signature"} ${["Uno", "Duo", "Trio", "Grand"][i % 4]}`,
        gender: ["women", "men", "unisex"][n % 3], material: MATS[n % MATS.length], name_en: null, name_ru: null,
        in_stock: inStock, qty_stock: inStock ? 1 + (n % 3) : 0, price_min_uzs: price, price_max_uzs: multi ? price + 12_000_000 : price,
        latest_arrival_year: 2022 + (n % 5), variant_count: multi ? 3 : 1, completeness: 40 + (n % 60),
        missing_crucial: n % 7 === 0 ? ["collection"] : [], has_unconfirmed: n % 2 === 0, image_key: null,
        colours: multi ? [{ variant_id: `Q${n}-WG`, colour_code: "WG", in_stock: true }, { variant_id: `Q${n}-YG`, colour_code: "YG", in_stock: true }, { variant_id: `Q${n}-PG`, colour_code: "PG", in_stock: false }] : null,
        _search: "", arrival_years: [2022 + (n % 5)], brand_raw: [b],
        metal_keys: [["white_gold"], ["rose_gold"], ["yellow_gold"], ["steel"], ["titanium"]][n % 5],
        stone_keys: n % 3 === 0 ? [] : n % 3 === 1 ? ["diamond"] : ["diamond", "sapphire"],
        movement: category === "watch" ? (n % 2 ? "automatic" : "quartz") : null,
        case_mm: category === "watch" ? 36 + (n % 10) : null,
      });
    }
  }
  for (const m of models) m._search = [m.model_id, m.article, m.brand, m.collection, m.model_name, m.material, m.retail_category, m.category, `SN${m.model_id}`].join(" ").toLowerCase();
  return models;
}
const MODELS = build();
const REPORTS = [];
const PHOTO_BASE = "https://hugduzqwyqwryicfzipu.supabase.co/storage/v1/object/public/catalogue-photos/";
for (const m of MODELS) if (m.colours && m.retail_category === "ring") m.image_key = `${m.model_id}/${m.colours[0].variant_id}/1-400.webp`;

function reference() {
  const g = (keyf) => {
    const map = new Map();
    for (const m of MODELS) { const k = keyf(m); if (k === null) continue; const v = map.get(k) || { models: 0, in_stock: 0 }; v.models++; if (m.in_stock) v.in_stock++; map.set(k, v); }
    return map;
  };
  return {
    brands: [...g((m) => m.brand)].map(([brand, v]) => ({ brand, ...v })).sort((a, b) => a.brand.localeCompare(b.brand)),
    categories: [...g((m) => m.category + "|" + m.retail_category)].map(([k, v]) => ({ category: k.split("|")[0], retail_category: k.split("|")[1], ...v })),
    collections: [...g((m) => (m.collection ? m.brand + "|" + m.collection : null))].map(([k, v]) => ({ brand: k.split("|")[0], collection: k.split("|")[1], ...v })),
    metals: ["white_gold", "rose_gold", "yellow_gold", "steel", "titanium"].map((k) => ({ key: k, models: MODELS.filter((m) => m.metal_keys.includes(k)).length, in_stock: MODELS.filter((m) => m.in_stock && m.metal_keys.includes(k)).length })),
    stones: ["diamond", "sapphire"].map((k) => ({ key: k, models: MODELS.filter((m) => m.stone_keys.includes(k)).length, in_stock: MODELS.filter((m) => m.in_stock && m.stone_keys.includes(k)).length })),
    movements: ["automatic", "quartz"].map((k) => ({ key: k, models: MODELS.filter((m) => m.movement === k).length, in_stock: MODELS.filter((m) => m.in_stock && m.movement === k).length })),
    case_mm: { min: 36, max: 45, models: MODELS.filter((m) => m.case_mm).length },
    expected: [],
    run: { id: 1, run_at: "2026-10-24T06:27:59Z", source_built: "2026-10-23", counts: {} },
    photo_base: PHOTO_BASE, can_manage: true, open_reports: REPORTS.filter((r) => r.status === "open").length,
  };
}
const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const strip = ({ _search, arrival_years, brand_raw, ...m }) => m;
function list(b) {
  let r = MODELS.slice();
  const brands = arr(b.brands); if (brands.length) r = r.filter((m) => brands.includes(m.brand));
  if (b.category) r = r.filter((m) => m.category === b.category);
  const rc = arr(b.retail_categories); if (rc.length) r = r.filter((m) => rc.includes(m.retail_category));
  const cs = arr(b.collections); if (cs.length) r = r.filter((m) => cs.includes(m.collection));
  const gs = arr(b.genders); if (gs.length) r = r.filter((m) => gs.includes(m.gender));
  if (b.stock === "in") r = r.filter((m) => m.in_stock);
  if (b.stock === "out") r = r.filter((m) => !m.in_stock);
  if (b.incomplete) r = r.filter((m) => m.missing_crucial.length);
  if (b.price_min) r = r.filter((m) => m.price_max_uzs >= b.price_min);
  if (b.price_max) r = r.filter((m) => m.price_min_uzs <= b.price_max);
  const ms = arr(b.metals); if (ms.length) r = r.filter((m) => m.metal_keys.some((k) => ms.includes(k)));
  const ss = arr(b.stones); if (ss.length) r = r.filter((m) => m.stone_keys.some((k) => ss.includes(k)));
  if (b.no_stones) r = r.filter((m) => !m.stone_keys.length);
  const mv = arr(b.movements); if (mv.length) r = r.filter((m) => mv.includes(m.movement));
  if (b.case_min) r = r.filter((m) => m.case_mm && m.case_mm >= b.case_min);
  if (b.case_max) r = r.filter((m) => m.case_mm && m.case_mm <= b.case_max);
  const ids = arr(b.ids); if (ids.length) r = r.filter((m) => ids.includes(m.model_id));
  for (const w of String(b.q || "").toLowerCase().split(/\s+/).filter(Boolean)) r = r.filter((m) => m._search.includes(w));
  const s = b.sort || "newest";
  const cmp = {
    newest: (x, y) => (y.in_stock - x.in_stock) || (y.latest_arrival_year - x.latest_arrival_year) || x.brand.localeCompare(y.brand) || x.model_id.localeCompare(y.model_id),
    brand: (x, y) => x.brand.localeCompare(y.brand) || x.model_id.localeCompare(y.model_id),
    price_asc: (x, y) => x.price_min_uzs - y.price_min_uzs, price_desc: (x, y) => y.price_max_uzs - x.price_max_uzs,
    reference: (x, y) => x.model_id.localeCompare(y.model_id), completeness: (x, y) => x.completeness - y.completeness,
  }[s];
  r.sort(cmp);
  const limit = Math.min(200, b.limit || 60), offset = b.offset || 0;
  return { total: r.length, offset, limit, rows: r.slice(offset, offset + limit).map(strip) };
}
const EXPECTED = {
  jewellery: [["subcategory", "identity"], ["gender", "identity"], ["collection", "identity"], ["model_name", "identity"], ["name_en", "identity"], ["extra", "floor"],
    ["metal", "metal"], ["metal_colour", "metal"], ["fineness", "metal"], ["total_weight_g", "metal"], ["stones", "stones"], ["total_stone_carat", "stones"],
    ["setting", "stones"], ["ring_size", "size"], ["dimensions", "size"], ["motif_story_en", "story"], ["motif_story_ru", "story"], ["brand_icon", "story"], ["occasion", "story"]],
  watch: [["subcategory", "identity"], ["gender", "identity"], ["collection", "identity"], ["model_name", "identity"], ["case_material", "watch_case"],
    ["case_diameter_mm", "watch_case"], ["water_resistance_m", "watch_case"], ["movement_type", "movement"], ["calibre", "movement"], ["power_reserve_h", "movement"],
    ["dial_colour_finish", "dial_strap"], ["strap_material_colour", "dial_strap"]],
  accessory: [["subcategory", "identity"], ["case_material", "identity"], ["dimensions", "size"]],
};
function attrsOf(m, first) {
  const a = (v, flag = "confirmed") => ({ value: String(v), num: null, flag });
  if (!first) return { gender: a(m.gender, "colibri_only"), stones: a("Бриллианты", "colibri_only") };
  const out = { gender: a(m.gender), model_name: a(m.model_name || "Signature"), description_en: a("An invented piece used only by the checks."), receipt_name: a("Изделие " + m.article) };
  if (m.collection) out.collection = a(m.collection);
  if (m.category === "jewellery") {
    Object.assign(out, { metal: a("gold"), metal_colour: a("white"), fineness: a("750 (18K)"), stones: a("diamonds"), total_stone_carat: a("0.55"),
      setting: a("pavé", "unconfirmed"), motif_story_en: a("A made-up story about light."), motif_story_ru: a("Выдуманная история о свете."),
      brand_icon: a("yes"), occasion: a("everyday, gift"), total_weight_g: a("5.1", "conflict") });
  } else if (m.category === "watch") {
    Object.assign(out, { case_material: a("titanium"), case_diameter_mm: a(m.case_mm), movement_type: a(m.movement), water_resistance_m: a("100"), dial_colour_finish: a("blue sunburst") });
  } else {
    out.case_material = a("rubber");
  }
  return out;
}
function model(b) {
  const m = MODELS.find((x) => x.model_id === b.model_id);
  if (!m) return [404, { error: "That model is not in the catalogue." }];
  const vs = (m.colours || [{ variant_id: m.model_id, colour_code: null, in_stock: m.in_stock }]).map((c, i) => ({
    variant_id: c.variant_id, colour_code: c.colour_code, colour_name_en: c.colour_code ? { WG: "White gold", YG: "Yellow gold", PG: "Rose gold" }[c.colour_code] : null,
    colour_name_ru: null, material: m.material, in_stock: c.in_stock, qty_stock: c.in_stock ? 1 : 0, price_uzs: m.price_min_uzs + i * 1_000_000, arrival_years: m.arrival_years,
    description_ru: "Описание из Colibri.", description_en: null, found_online: i === 0, confidence: i === 0 ? "high" : null, sources: i === 0 ? ["https://www.example.com/piece"] : [],
    conflicts: null, notes: null, sort_order: i + 1,
    pieces: c.in_stock ? [{ serial: "SN" + m.model_id + i, size: m.retail_category === "ring" ? "54" : null, price_uzs: m.price_min_uzs + i * 1_000_000 }] : [],
    attributes: attrsOf(m, i === 0),
  }));
  const linked = MODELS.filter((x) => x.brand === m.brand && x.collection === m.collection && x.model_id !== m.model_id).slice(0, 4).map((x) => ({ kind: "same_collection", ...strip(x) }));
  const expected = EXPECTED[m.category].map(([key, section]) => ({ key, section, crucial: ["collection", "model_name", "metal", "case_material"].includes(key) }));
  const photos = m.image_key ? vs.slice(0, 2).flatMap((x, j) => [1, 2].map((o) => ({ variant_id: x.variant_id, ord: o, path_full: `${m.model_id}/${x.variant_id}/${o}-1200.webp`, path_thumb: `${m.model_id}/${x.variant_id}/${o}-400.webp`, width: 1200, height: 1200 }))) : [];
  return [200, { model: strip(m), variants: vs, expected, linked, reports: [], photos, photo_base: PHOTO_BASE }];
}

// passcode "1234" is the only one that opens; "0000" is a login without catalogue access.
function handle(b, log) {
  log.push(b);
  if (b.action === "unlock") {
    if (b.passcode === "1234") return [200, { token: "t".repeat(64), name: "Tester", expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), can_manage: true }];
    if (b.passcode === "0000") return [403, { error: "This account does not have access to the catalogue." }];
    return [401, { error: "That passcode is not right." }];
  }
  if (b.token !== "t".repeat(64)) return [401, { error: "That session is not valid. Enter your passcode again." }];
  if (b.action === "reference") return [200, reference()];
  if (b.action === "list") return [200, list(b)];
  if (b.action === "model") return model(b);
  if (b.action === "report_create") {
    if (!String(b.message || "").trim()) return [400, { error: "Say what is wrong." }];
    const r = { id: REPORTS.length + 1, model_id: b.model_id, variant_id: b.variant_id || null, field_key: b.field_key || null, message: b.message,
      reported_by: "Tester", created_at: new Date().toISOString(), status: "open", closed_by: null, closed_at: null };
    REPORTS.push(r); return [200, { ok: true, id: r.id }];
  }
  if (b.action === "reports_list") {
    const st = b.status || "open";
    return [200, { rows: REPORTS.filter((r) => r.status === st).map((r) => ({ ...r, model: strip(MODELS.find((m) => m.model_id === r.model_id)) })) }];
  }
  if (b.action === "report_close") {
    const r = REPORTS.find((x) => x.id === b.id); if (!r) return [404, { error: "That report is not on file." }];
    r.status = b.status; r.closed_by = b.status === "open" ? null : "Tester"; return [200, { ok: true }];
  }
  return [400, { error: "Unknown action: " + b.action }];
}
module.exports = { handle, MODELS };
