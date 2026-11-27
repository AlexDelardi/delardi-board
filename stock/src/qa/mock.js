// A stand-in for stock-api (stock/src/api/README.md is the contract), held in
// memory. Everything in it is invented: serials ZZ.00.xxxxx, barcodes 200…,
// brands "Zz …", client references DLD-9xxx. Nothing is a real piece or person.
//
// handle(body) -> [status, json], with exactly the statuses and sentences the
// README lists: 400 malformed, 401 no/unknown/expired token or wrong passcode,
// 403 not a Stock session or no right, 404 unknown piece, 409 the database
// refused (message verbatim, as ops_set_state / ops_resolve_review raise it).

const PASSCODES = {
  demo: { name: "Stock Manager", rights: { view: true, manage: true, crm: true, cost: true } },
  look: { name: "Stock Viewer", rights: { view: true, manage: false, crm: false, cost: false } },
  nocrm: { name: "Floor Manager", rights: { view: true, manage: true, crm: false, cost: false } },
  none: { name: "Nobody", rights: { view: false, manage: false, crm: false, cost: false } },
};
const DEFAULT_RIGHTS = JSON.stringify(Object.fromEntries(Object.entries(PASSCODES).map(([k, v]) => [k, v.rights])));
const STATES = ["in_transit", "in_stock", "reserved", "booked_out", "damaged", "sold", "not_received"];
const REAL_STATES = STATES;
const SORT_COLS = ["serial", "brand", "article", "state", "since", "price"];
const STATE_RANK = ["in_stock", "reserved", "booked_out", "in_transit", "in_transfer", "damaged", "not_received", "sold"];
// stk_piece_list's order: the sorted column (pieces without the value last, either way), then brand, reference, serial.
function sortRows(rows, sort) {
  const usual = (a, b) => cmp(a.brand, b.brand) || cmp(a.article, b.article) || cmp(a.serial, b.serial);
  if (!sort) return rows.sort(usual);
  const [col, dir] = sort.split(".");
  const key = (p) => col === "state" ? STATE_RANK.indexOf(p.state) : col === "price" ? p.price_uzs : col === "since" ? Date.parse(p.state_since)
    : col === "store" ? p.store_code : p[col];
  return rows.sort((a, b) => {
    const x = key(a), y = key(b), nx = x === null || x === undefined, ny = y === null || y === undefined;
    if (nx || ny) return nx && ny ? usual(a, b) : nx ? 1 : -1;
    const c = typeof x === "number" ? x - y : cmp(x, y);
    return (dir === "desc" ? -c : c) || usual(a, b);
  });
}
// stk_facet_values: a column's values with counts among `rows` (already without that column's own filter)
function facetValues(rows, col) {
  const n = new Map();
  for (const p of rows) { const v = col === "store" ? p.store_code : p[col]; if (v !== null && v !== undefined) n.set(v, (n.get(v) || 0) + 1); }
  const out = [...n].map(([value, count]) => (col === "store" ? { value, label: storeName(value), count } : { value, count }));
  return out.sort((a, b) => (col === "state" ? STATE_RANK.indexOf(a.value) - STATE_RANK.indexOf(b.value) : cmp(a.value, b.value)));
}
const TRAIN_STATES = ["in_stock", "reserved", "booked_out", "damaged", "in_transfer"];
const SETTABLE = ["in_stock", "reserved", "booked_out", "damaged"];
// ops_resolve_review's answers per kind
const ANSWERS = { missing_from_export: ["sold", "damaged", "booked_out", "still_in_stock"], serial_reused: ["sold", "damaged", "booked_out", "still_in_stock"],
  ticket_conflict: ["sold", "damaged", "booked_out", "still_in_stock"], overdue_in_transit: ["still_in_transit", "not_delivered"],
  dropped_from_incoming: ["still_in_transit", "not_delivered"] };
const NO_ACCESS = "This account does not have access to Stock.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENTS = { "DLD-9001": "Соколова Мария Андреевна", "DLD-9002": "Invented Client Two" };

const BRANDS = ["Zz Atelier", "Zz Jeweller", "Zz Watchmaker"];
const CATS = ["ring", "watch", "necklace", "earrings", "bracelet", "strap", "clasp", "bracelet_element", "cufflinks"];
// How many of the 60 pieces are in each state.
const SPREAD = [["in_stock", 30], ["reserved", 5], ["booked_out", 4], ["in_transit", 6], ["damaged", 3], ["not_received", 4], ["sold", 8]];
const LONG_NAME = "Grand Heritage Perpetual Calendar Skeleton Tourbillon Pieces";   // 60 characters

let pieces, events, reviews, sessions, calls, nextReview;
let tPieces, tEvents;   // training (stk_train_*)
const TRAIN_STORES = [{ code: "TRN-A", name: "Training store A" }, { code: "TRN-B", name: "Training store B" }];
const storeName = (code) => (TRAIN_STORES.find((x) => x.code === code) || {}).name || null;
let failNext = null;
let imported, waitingRows;   // import: pieces already loaded from a file, rows waiting for their piece   // an action name: its next call answers 500 once
let refundSales = {};
const delay = {};   // test hook: delay.<action> = ms the answer is held back

function iso(day, hour) {   // a fixed day in 2026, UTC
  return new Date(Date.UTC(2026, 9, 1 + day, hour || 6, 0, 0)).toISOString();
}

const ticketId = (p) => "30000000-0000-4000-8000-0000000000" + p.serial.slice(-2);
function freshPieces() {
  const out = [];
  let i = 0;
  for (const [state, n] of SPREAD) {
    for (let k = 0; k < n; k++, i++) {
      const brand = BRANDS[i % 3];
      const category = brand === "Zz Watchmaker" ? (i % 2 ? "watch" : "strap") : CATS[Math.floor(i / 3) % CATS.length];
      out.push({
        piece_id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
        serial: "ZZ.00." + String(10001 + i),
        barcode: "2000000" + String(100001 + i),
        brand,
        article: "ZZ-" + brand.slice(3, 5).toUpperCase() + "-" + String(100 + (i % 17)).padStart(4, "0"),
        collection: ["Orbit", "Lumen", "Tide", "Facet"][i % 4],
        model_name: ["Orbit", "Lumen", "Tide", "Facet"][i % 4] + " " + category.replace(/_/g, " "),
        colour: ["WG", "YG", "RG", null][i % 4],
        size: category === "ring" ? String(50 + (i % 6)) : category === "watch" ? "40" : null,
        category,
        state,
        state_since: iso(i % 45, 4 + (i % 10)),
        price_uzs: 5000000 + ((i * 7919) % 60) * 1500000,
        hold_client_id: state === "reserved" || state === "booked_out" ? (i % 2 ? "DLD-9001" : "DLD-9002") : null,
        hold_until: state === "reserved" ? "2026-12-01" : null,
        state_note: state === "damaged" ? "Clasp bent" : state === "booked_out" ? "On approval at the client's home" : null,
        shipped_on: state === "in_transit" ? "2026-11-02" : null,
        first_seen_at: iso(0, 3),
        model: { metal_keys: ["white_gold"], stone_keys: i % 2 ? ["diamond"] : [], gender: "female", subcategory: null },
      });
    }
  }
  // two pieces without a retail price, one with a 60-character model name
  out[3].price_uzs = null;
  out[34].price_uzs = null;
  out[7].model_name = LONG_NAME;
  return out;
}

function reset() {
  for (const [k, r] of Object.entries(JSON.parse(DEFAULT_RIGHTS))) PASSCODES[k].rights = r;
  pieces = freshPieces();
  events = {};
  for (const p of pieces) {
    const list = [{ at: p.first_seen_at, from_state: null, to_state: "in_stock", reason: "initial_load", ref_kind: null, ref_id: null,
      actor: "Stock Manager", note: null, ticket_id: null, ticket_no: null }];
    if (p.state !== "in_stock") list.unshift({ at: p.state_since, from_state: "in_stock", to_state: p.state,
      reason: p.state === "sold" ? "sold" : p.state, ref_kind: p.state === "sold" ? "ticket_line" : "manual", ref_id: null,
      actor: "Stock Manager", note: p.state_note, ticket_id: p.state === "sold" ? ticketId(p) : null, ticket_no: p.state === "sold" ? "D-0000" + (p.serial.slice(-2)) : null });
    events[p.piece_id] = list;
  }
  // five open items, one of each kind (the last two on pieces that are in transit)
  const kinds = ["missing_from_export", "serial_reused", "ticket_conflict", "overdue_in_transit", "dropped_from_incoming"];
  reviews = [0, 5, 12, 40, 41].map((pi, k) => ({ review_id: k + 1, piece_id: pieces[pi].piece_id, kind: kinds[k],
    raised_at: iso(30 + k, 9), status: "open", resolution: null, resolved_by: null, resolved_at: null, note: k === 1 ? "Seen twice in the export" : k === 2 ? "Ticket D-000777 line 1: sold 03.11.2026, but the piece is still in the stock export" : null }));
  // a sale on pieces[1] was voided and the piece came back to stock (pos_void_ticket writes "void: <reason>")
  // pieces[3] was sold and then refunded: the refund line carries kind "refund" and a positive net, as in ops_ticket_lines
  refundSales = {};
  refundSales[pieces[3].piece_id] = [
    { ticket_id: "30000000-0000-4000-8000-200000000001", ticket_no: "C-104400", source: "colibri", sold_at: "2026-10-02", kind: "sale", net: 12000000, status: "posted" },
    { ticket_id: "30000000-0000-4000-8000-200000000002", ticket_no: "C-104420", source: "colibri", sold_at: "2026-10-09", kind: "refund", net: 12000000, status: "posted" },
  ];
  events[pieces[1].piece_id].unshift({ at: iso(20, 8), from_state: "sold", to_state: "in_stock", reason: "void: Wrong size entered", ref_kind: "ticket",
    ref_id: null, actor: "Stock Manager", note: null, ticket_id: null, ticket_no: null });
  for (const k of Object.keys(delay)) delete delay[k];
  nextReview = 6;
  sessions = {};
  calls = [];
  failNext = null;
  imported = new Set(); waitingRows = new Map();
  trainSeed();
}
reset();

const err = (status, message) => [status, { error: message }];
class Fail { constructor(status, message) { this.status = status; this.message = message; } }
const fail = (s, m) => { throw new Fail(s, m); };
const str = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

function session(token, need) {
  const t = str(token, 100);
  if (!t || t.length < 20) fail(401, "Enter your passcode to open Stock.");
  const s = sessions[t];
  if (!s) fail(401, "That session is not valid. Enter your passcode again.");
  if (Date.parse(s.expires_at) <= Date.now() || s.expired) fail(401, "Your session has expired. Enter your passcode again.");
  if (!s.stock) fail(403, NO_ACCESS);
  const u = Object.values(PASSCODES).find((p) => p.name === s.name);
  if (!u || !u.rights.view) fail(403, NO_ACCESS);
  if (need === "manage" && !u.rights.manage) fail(403, "Your account cannot change stock.");
  if (need === "cost" && !u.rights.cost) fail(403, "Your account cannot see cost.");
  return { name: u.name, rights: Object.assign({}, u.rights) };
}

function filtersIn(v, training) {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) fail(400, "filters must be an object.");
  const out = {};
  const STATES = training ? TRAIN_STATES : REAL_STATES;
  for (const [k, max] of [["q", 80], ["brand", 80], ["category", 80]].concat(training ? [["store", 20]] : [])) {
    const raw = v[k];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "string") fail(400, `${k} must be text.`);
    if (raw.trim().length > max) fail(400, `${k} can be at most ${max} characters.`);
    const s = str(raw, max);
    if (s !== null) out[k] = s;
  }
  if (v.states !== null && v.states !== undefined) {
    if (!Array.isArray(v.states) || v.states.some((s) => typeof s !== "string" || !STATES.includes(s))) {
      fail(400, `states must be a list of: ${STATES.join(", ")}.`);
    }
    if (v.states.length) out.states = [...new Set(v.states)];
  }
  for (const k of ["price_min", "price_max"]) {
    const raw = v[k];
    if (raw === null || raw === undefined || raw === "") continue;
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) fail(400, `${k} must be a whole number, zero or more.`);
    out[k] = raw;
  }
  for (const [k, max] of [["brands", 80]].concat(training ? [["stores", 20]] : [])) {
    const raw = v[k];
    if (raw === null || raw === undefined) continue;
    if (!Array.isArray(raw) || raw.length > 200 || raw.some((x) => typeof x !== "string" || x.trim().length > max)) fail(400, `${k} must be a list of texts.`);
    const vals = [...new Set(raw.map((x) => str(x, max)).filter((x) => x !== null))];
    if (vals.length) out[k] = vals;
  }
  if (v.sort !== null && v.sort !== undefined) {
    if (typeof v.sort !== "string") fail(400, "sort must be text.");
    const [col, dir] = v.sort.trim().split(".");
    if (!SORT_COLS.concat(training ? ["store"] : []).includes(col) || (dir !== "asc" && dir !== "desc")) fail(400, "sort must be a column and asc or desc.");
    out.sort = col + "." + dir;
  }
  if (v.page !== null && v.page !== undefined && v.page !== "") {
    const n = typeof v.page === "string" && /^\d+$/.test(v.page.trim()) ? Number(v.page.trim()) : v.page;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) fail(400, "That is not a valid page.");
    out.page = Math.min(n, 100000);
  }
  return out;
}

const ROW_KEYS = ["piece_id", "serial", "barcode", "brand", "article", "collection", "model_name", "colour", "size", "category", "state", "state_since", "price_uzs"];
const row = (p) => Object.fromEntries(ROW_KEYS.map((k) => [k, p[k]]));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// stk_base: every word matches somewhere (case-insensitive), brand and category exact, price bounds drop unpriced pieces.
function base(f, skip) {
  const words = f.q ? f.q.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()) : null;
  return pieces.filter((p) => {
    if (words && !words.every((w) => ["serial", "barcode", "article", "brand", "collection", "model_name"]
      .some((k) => p[k] && String(p[k]).toLowerCase().includes(w)))) return false;
    if (skip !== "brand" && f.brand && p.brand !== f.brand) return false;
    if (skip !== "brand" && f.brands && !f.brands.includes(p.brand)) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.price_min !== undefined && !(p.price_uzs !== null && p.price_uzs >= f.price_min)) return false;
    if (f.price_max !== undefined && !(p.price_uzs !== null && p.price_uzs <= f.price_max)) return false;
    return true;
  }).sort((a, b) => cmp(a.brand, b.brand) || cmp(a.article, b.article) || cmp(a.serial, b.serial));
}
function list(f) {
  const all = base(f);
  const hit = sortRows(f.states ? all.filter((p) => f.states.includes(p.state)) : all, f.sort);
  const page = f.page || 1;
  const totals = {};
  for (const p of all) {
    const t = totals[p.state] || (totals[p.state] = { state: p.state, pieces: 0, value: 0, unpriced: 0 });
    t.pieces++;
    if (p.price_uzs === null) t.unpriced++; else t.value += p.price_uzs;
  }
  return { count: hit.length, page, page_size: 50, rows: hit.slice((page - 1) * 50, page * 50).map(row),
    totals: Object.values(totals).sort((a, b) => cmp(a.state, b.state)) };
}
// Who bought it (invented): purchases of the first sold piece's design, newest first, as cat_model_buyers returns them.
function buyersFor(p) {
  const sold = pieces.find((x) => x.state === "sold");
  if (!sold || p.article !== sold.article) return [];
  return [
    { id: 9, sold_at: "2026-10-10", client_id: "CL-T-1", client_name: "Test Client One", related_party: false, seller: "Seller A.", size: "54", serial: sold.serial, qty: -1, net_uzs: -15000000, ticket_id: "40000000-0000-4000-8000-000000000002", ticket_no: "T-201", refund: true },
    { id: 8, sold_at: "2026-10-03", client_id: "CL-T-1", client_name: "Test Client One", related_party: false, seller: "Seller A.", size: "54", serial: sold.serial, qty: 1, net_uzs: 15000000, ticket_id: "40000000-0000-4000-8000-000000000001", ticket_no: "T-200", refund: false },
    { id: 7, sold_at: "2026-02-14", client_id: "CL-T-2", client_name: "Test Owner Family", related_party: true, seller: null, size: null, serial: null, qty: 2, net_uzs: 28000000, ticket_id: null, ticket_no: null, refund: false },
    ...[6, 5, 4, 3].map((k) => ({ id: k, sold_at: `2025-0${k}-01`, client_id: "CL-OLD-" + k, client_name: "Older Client " + k, related_party: false, seller: "Seller B.", size: null, serial: null, qty: 1, net_uzs: 14000000, ticket_id: null, ticket_no: null, refund: false })),
  ];
}
function detail(sess, id) {
  const p = pieces.find((x) => x.piece_id === id);
  if (!p) fail(404, "No piece with that reference.");
  const bought = buyersFor(p);
  const out = {
    piece: Object.assign(row(p), { hold_client_id: p.hold_client_id, hold_until: p.hold_until, state_note: p.state_note,
      shipped_on: p.shipped_on, first_seen_at: p.first_seen_at }),
    model: p.model ? Object.assign({}, p.model) : null,
    events: (events[id] || []).map((e) => Object.assign({}, e)),
    reviews: reviews.filter((r) => r.piece_id === id).sort((a, b) => cmp(b.raised_at, a.raised_at))
      .map(({ piece_id, ...r }) => r),
    sales: refundSales[id] ? refundSales[id].map((x) => Object.assign({}, x)) : p.state === "sold" ? [
      { ticket_id: ticketId(p), ticket_no: "D-0000" + p.serial.slice(-2), source: "delardi", sold_at: p.state_since.slice(0, 10), kind: "sale", net: p.price_uzs, status: "posted" },
      { ticket_id: "30000000-0000-4000-8000-1000000000" + p.serial.slice(-2), ticket_no: "T-0000" + p.serial.slice(-2), source: "training", sold_at: p.state_since.slice(0, 10), kind: "sale", net: p.price_uzs, status: "void" },
    ] : [],
  };
  if (sess.rights.crm) out.client_name = p.hold_client_id ? (CLIENTS[p.hold_client_id] || null) : null;
  if (sess.rights.crm) out.buyers = bought;
  else out.buyers_count = bought.filter((b) => !b.refund).reduce((n, b) => n + (Number(b.qty) || 1), 0);
  return out;
}
// ops_move_state: in_stock → reserved | booked_out | damaged, and each of those back to in_stock.
function move(p, state, actor, note, client, until, reason, refKind, refId) {
  const from = p.state;
  if (!((from === "in_stock" && ["reserved", "booked_out", "damaged"].includes(state)) ||
        (["reserved", "booked_out", "damaged"].includes(from) && state === "in_stock"))) {
    fail(409, `state ${from} → ${state} is not allowed`);
  }
  const holds = state === "reserved" || state === "booked_out";
  const at = new Date().toISOString();
  Object.assign(p, { state, state_since: at, hold_client_id: holds ? client : null, hold_until: holds ? until : null,
    state_note: state === "in_stock" ? null : note });
  const r = reason || (state !== "in_stock" ? state : from === "reserved" ? "released" : from === "booked_out" ? "returned_from_loan" : "repaired");
  events[p.piece_id].unshift({ at, from_state: from, to_state: state, reason: r, ref_kind: refKind, ref_id: refId,
    actor, note, ticket_id: null, ticket_no: null });
}

// ---------------------------------------------------------------- training
// stk_train_*: twelve made-up pieces in two made-up stores, in memory of their own. No train_* action
// touches `pieces`, and no real action returns one of these.
function trainSeed() {
  const rows = [
    ["Training Jeweller", "TJ-R-101", "Aurora", "Aurora ring", "WG", "52", "ring", 18500000],
    ["Training Jeweller", "TJ-R-101", "Aurora", "Aurora ring", "WG", "54", "ring", 18500000],
    ["Training Jeweller", "TJ-N-205", "Aurora", "Aurora necklace", "YG", null, "necklace", 42000000],
    ["Training Jeweller", "TJ-E-310", "Meridian", "Meridian earrings", "RG", null, "earrings", 27300000],
    ["Training Jeweller", "TJ-B-412", "Meridian", "Meridian bracelet", "WG", "17", "bracelet", 61000000],
    ["Training Watchmaker", "TW-4001", "Navigator", "Navigator 40 mm", null, "40", "watch", 96000000],
    ["Training Watchmaker", "TW-4001", "Navigator", "Navigator 40 mm", null, "40", "watch", 96000000],
    ["Training Watchmaker", "TW-3602", "Soirée", "Soirée 36 mm", "RG", "36", "watch", 248000000],
    ["Training Jeweller", "TJ-R-101", "Aurora", "Aurora ring", "WG", "56", "ring", 18500000],
    ["Training Jeweller", "TJ-N-205", "Aurora", "Aurora necklace", "YG", null, "necklace", 42000000],
    ["Training Watchmaker", "TW-4001", "Navigator", "Navigator 40 mm", null, "40", "watch", 96000000],
    ["Training Watchmaker", "TW-S-01", "Navigator", "Navigator strap", null, null, "strap", 3200000],
  ];
  tEvents = {};
  tPieces = rows.map(([brand, article, collection, model_name, colour, size, category, price_uzs], k) => {
    const i = k + 1, store = i <= 8 ? "TRN-A" : "TRN-B";
    const piece_id = "00000000-0000-4000-9000-" + String(i).padStart(12, "0");
    tEvents[piece_id] = [{ at: iso(0, 3), from_state: null, to_state: "in_stock", reason: "training_set", actor: "system", note: null,
      from_store: null, to_store: storeName(store) }];
    return { piece_id, serial: "TRN-" + String(i).padStart(4, "0"), barcode: "29000000" + String(i).padStart(5, "0"), brand, article, collection,
      model_name, colour, size, category, state: "in_stock", state_since: iso(0, 3), price_uzs, store_code: store, to_code: null,
      hold_client_id: null, hold_until: null, state_note: null, first_seen_at: iso(0, 3),
      model: { metal_keys: category === "watch" ? ["steel"] : ["white_gold"], stone_keys: [], gender: null, subcategory: null } };
  });
}
const tRow = (p) => Object.assign(row(p), { store: storeName(p.store_code), store_code: p.store_code, to_store: storeName(p.to_code) });
function trainBase(f, skip) {
  const words = f.q ? f.q.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()) : null;
  return tPieces.filter((p) => {
    if (words && !words.every((w) => ["serial", "barcode", "article", "brand", "collection", "model_name"]
      .some((k) => p[k] && String(p[k]).toLowerCase().includes(w)))) return false;
    if (skip !== "brand" && f.brand && p.brand !== f.brand) return false;
    if (skip !== "brand" && f.brands && !f.brands.includes(p.brand)) return false;
    if (f.category && p.category !== f.category) return false;
    if (skip !== "store" && f.store && p.store_code !== f.store.toUpperCase()) return false;
    if (skip !== "store" && f.stores && !f.stores.map((x) => x.toUpperCase()).includes(p.store_code)) return false;
    if (f.price_min !== undefined && !(p.price_uzs >= f.price_min)) return false;
    if (f.price_max !== undefined && !(p.price_uzs <= f.price_max)) return false;
    return true;
  });
}
function trainList(f) {
  const all = trainBase(f);
  const hit = sortRows(f.states ? all.filter((p) => f.states.includes(p.state)) : all, f.sort);
  const page = f.page || 1, totals = {};
  for (const p of all) {
    const t = totals[p.state] || (totals[p.state] = { state: p.state, pieces: 0, value: 0, unpriced: 0 });
    t.pieces++; t.value += p.price_uzs;
  }
  return { count: hit.length, page, page_size: 50, rows: hit.slice((page - 1) * 50, page * 50).map(tRow),
    totals: Object.values(totals).sort((a, b) => cmp(a.state, b.state)) };
}
function trainDetail(sess, id) {
  const p = tPieces.find((x) => x.piece_id === id);
  if (!p) fail(404, "No piece with that reference.");
  const out = { piece: Object.assign(tRow(p), { hold_client_id: p.hold_client_id, hold_until: p.hold_until, state_note: p.state_note, first_seen_at: p.first_seen_at }),
    model: Object.assign({}, p.model), events: tEvents[id].map((e) => Object.assign({}, e)), reviews: [], sales: [] };
  if (sess.rights.crm) out.client_name = p.hold_client_id ? (CLIENTS[p.hold_client_id] || null) : null;
  return out;
}
function trainPiece(body) {
  const id = str(body.piece_id, 40) || "";
  if (!UUID_RE.test(id)) fail(400, "That is not a valid piece reference.");
  const p = tPieces.find((x) => x.piece_id === id.toLowerCase());
  if (!p) fail(409, "No piece with that reference.");
  return p;
}
function trainNote(v) {
  const raw = v === null || v === undefined ? "" : String(v);
  if (raw.trim().length > 500) fail(400, "The note can be at most 500 characters.");
  return str(raw, 500);
}
function trainEvent(p, from, to, reason, actor, note, fromStore, toStore) {
  const at = new Date().toISOString();
  p.state = to; p.state_since = at;
  tEvents[p.piece_id].unshift({ at, from_state: from, to_state: to, reason, actor, note, from_store: storeName(fromStore), to_store: storeName(toStore) });
}
function trainHandle(action, body) {
  if (action === "train_facets") {
    session(body.token, "view");
    return { brands: [...new Set(tPieces.map((p) => p.brand))].sort(), categories: [...new Set(tPieces.map((p) => p.category))].sort(),
      stores: TRAIN_STORES.map((x) => Object.assign({}, x)) };
  }
  if (action === "train_list") { session(body.token, "view"); return trainList(filtersIn(body.filters, true)); }
  if (action === "train_facet") {
    session(body.token, "view");
    const column = str(body.column, 20) || "";
    if (!["brand", "state", "store"].includes(column)) fail(400, "That column has no checklist.");
    const f = filtersIn(body.filters, true);
    const rows = trainBase(f, column).filter((p) => column === "state" || !f.states || f.states.includes(p.state));
    return { column, values: facetValues(rows, column) };
  }
  if (action === "train_piece") {
    const s = session(body.token, "view");
    const id = str(body.piece_id, 40) || "";
    if (!UUID_RE.test(id)) fail(400, "That is not a valid piece reference.");
    return trainDetail(s, id.toLowerCase());
  }
  const s = session(body.token, "manage");
  if (action === "train_reset") { trainSeed(); return { pieces: tPieces.length }; }
  if (action === "train_set_state") {
    const state = str(body.state, 40);
    if (!state || !SETTABLE.includes(state)) fail(400, `state must be one of ${SETTABLE.join(", ")}.`);
    const note = trainNote(body.note);
    if (state === "booked_out" && !note) fail(400, "Write who has it and why.");
    if (state === "damaged" && !note) fail(400, "Write what is wrong.");
    const holds = state === "reserved" || state === "booked_out";
    let client = holds ? str(body.client_id, 20) : null;
    if (client) { client = client.toUpperCase(); if (!CLIENTS[client]) fail(409, "No client with that reference."); }
    const p = trainPiece(body), from = p.state;
    if (!((from === "in_stock" && ["reserved", "booked_out", "damaged"].includes(state)) ||
          (["reserved", "booked_out", "damaged"].includes(from) && state === "in_stock"))) {
      fail(409, "That change is not possible: the piece has moved meanwhile.");
    }
    Object.assign(p, { hold_client_id: holds ? client : null, hold_until: holds ? (str(body.until, 10) || null) : null, state_note: state === "in_stock" ? null : note });
    trainEvent(p, from, state, state !== "in_stock" ? state : from === "reserved" ? "released" : from === "booked_out" ? "returned_from_loan" : "repaired", s.name, note, null, null);
    return trainDetail(s, p.piece_id);
  }
  const note = trainNote(body.note);
  if (action === "train_send") {
    const to = (str(body.to_store, 20) || "").toUpperCase();
    if (!to) fail(400, "Choose the store to send it to.");
    const p = trainPiece(body);
    if (!storeName(to)) fail(409, "No store with that code.");
    if (p.state !== "in_stock") fail(409, "Only a piece that is in stock can be sent to another store.");
    if (to === p.store_code) fail(409, "The piece is already in that store.");
    Object.assign(p, { to_code: to, state_note: note, hold_client_id: null, hold_until: null });
    trainEvent(p, "in_stock", "in_transfer", "transfer_sent", s.name, note, p.store_code, to);
    return trainDetail(s, p.piece_id);
  }
  if (action === "train_receive" || action === "train_cancel") {
    const p = trainPiece(body);
    if (p.state !== "in_transfer") fail(409, "This piece is not in transfer.");
    const from = p.store_code, to = p.to_code;
    if (action === "train_receive") p.store_code = to;
    Object.assign(p, { to_code: null, state_note: null });
    trainEvent(p, "in_transfer", "in_stock", action === "train_receive" ? "transfer_received" : "transfer_cancelled", s.name, note, from, to);
    return trainDetail(s, p.piece_id);
  }
  fail(400, `Unknown action: ${action}`);
}

// ops_upload_pending as import_pending lists it
function waitingList() {
  return [...waitingRows].map(([k, r]) => ({ brand_key: r.brand.toLowerCase(), serial_key: k, brand: r.brand, serial: r.serial, article: r.article,
    file_name: r.file_name, actor: r.actor, created_at: r.created_at }));
}

function handle(body) {
  calls.push(body);
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Body must be a JSON object.");
    const action = str(body.action, 40);
    if (failNext && failNext === action) { failNext = null; return [500, { error: "Something went wrong on the server." }]; }
    if (action === "health") return [200, { ok: true }];
    if (/^train_/.test(action || "")) return [200, trainHandle(action, body)];
    if (action === "unlock") {
      const u = PASSCODES[str(body.passcode, 200) || ""];
      if (!u) fail(401, "That passcode is not right.");
      if (!u.rights.view) fail(403, NO_ACCESS);
      const token = require("crypto").randomBytes(32).toString("hex");
      const expires_at = new Date(Date.now() + 8 * 3600e3).toISOString();
      sessions[token] = { name: u.name, expires_at, stock: true };
      return [200, { token, name: u.name, expires_at, rights: Object.assign({}, u.rights) }];
    }
    if (action === "ping") { const s = session(body.token); return [200, { ok: true, name: s.name, rights: s.rights }]; }
    if (action === "facets") {
      session(body.token, "view");
      return [200, { brands: [...new Set(pieces.map((p) => p.brand))].sort(), categories: [...new Set(pieces.map((p) => p.category))].sort() }];
    }
    if (action === "list") { session(body.token, "view"); return [200, list(filtersIn(body.filters))]; }
    if (action === "facet") {
      session(body.token, "view");
      const column = str(body.column, 20) || "";
      if (!["brand", "state"].includes(column)) fail(400, "That column has no checklist.");
      const f = filtersIn(body.filters);
      const rows = base(f, column).filter((p) => column === "state" || !f.states || f.states.includes(p.state));
      return [200, { column, values: facetValues(rows, column) }];
    }
    if (action === "piece") {
      const s = session(body.token, "view");
      const id = str(body.piece_id, 40) || "";
      if (!UUID_RE.test(id)) fail(400, "That is not a valid piece reference.");
      return [200, detail(s, id.toLowerCase())];
    }
    // Enrichment: pieces[0] has everything recorded, pieces[1] a Colibri record only, the rest nothing (TBD).
    if (action === "origin" || action === "cost") {
      const sess = session(body.token, action === "cost" ? "cost" : "view");
      const id = (str(body.piece_id, 40) || "").toLowerCase();
      if (!UUID_RE.test(id)) fail(400, "That is not a valid piece reference.");
      const i = pieces.findIndex((x) => x.piece_id === id);
      if (i < 0) fail(404, "No piece with that reference.");
      const p = pieces[i];
      if (action === "origin") {
        const colibri = i > 1 ? null : { source_file: "T2 receipt export.xlsx", loaded_at: iso(3, 9),
          data: { "Бренд": p.brand, "Линия продукции": "Кольцо", "Артикул": p.article, "Серийный номер": p.serial,
            "Наименование товара (рус)": "Кольцо из жёлтого золота", "Код цвета": "YG", "Цена оригинального инвойса": 875,
            "Инв. цена, долл": 983.15, "Коэф-т 1": 2.31, "Рек. цена, долл": 2270, "Цена продажи, долл": 2270,
            "Штрих Код": "6000000000017", "НДС": 0, "ЦП": 28375000, "Отправлять в ККМ": "Нет", "Склад (старое поле)": "A1" } };
        // as stk_piece_origin: purchase-price columns only with the cost right
        if (colibri && !sess.rights.cost) for (const k of ["Цена оригинального инвойса", "Инв. цена, долл", "Коэф-т 1", "Коэф-т 2", "Цена в СФ"]) delete colibri.data[k];
        return [200, i > 0 ? { colibri, receipt: null, codes: [], hs_code: null, ikpu: null } : { colibri,
          receipt: { supplier: "T2 Supplier SpA", contract: "No. T2-01", invoice_no: "INV-77", invoice_date: "2026-10-01",
            currency: "EUR", arrival_date: "2026-10-14", customs_decl: null, source_file: "t2 cost.xlsx" },
          codes: [{ code: "6000000000017", kind: "colibri", active: true, added_at: iso(3, 9), retired_at: null },
                  { code: "ERA-OLD-1", kind: "era", active: false, added_at: iso(9, 9), retired_at: iso(2, 9) }],
          details: { category: "Ring", metal: "White gold", metal_purity: "750", name_uz: "Uzuk" },
          hs_code: "7113190000", ikpu: null }];
      }
      const shelf = p.price_uzs === null || p.price_uzs === undefined ? null : Number(p.price_uzs);
      const net = shelf === null ? null : Math.round(shelf / 1.12);
      if (i > 0) return [200, { match_quality: "tbd", landed_uzs: null, shelf_price_uzs: shelf, vat_pct: 12, net_price_uzs: net, margin_uzs: null, margin_pct: null }];
      const landed = 6665000;
      return [200, { match_quality: "estimated", source_file: "t2 cost.xlsx", invoice_price: 743.11, currency: "EUR", fx_rate: 13000,
        invoice_uzs: 6500000, customs_vat_uzs: 130000, clearance_uzs: 20000, assay_uzs: 10000, customs_fee_uzs: 5000, other_uzs: 0,
        landed_uzs: landed, shelf_price_uzs: shelf, vat_pct: 12, net_price_uzs: net,
        margin_uzs: net === null ? null : net - landed, margin_pct: net ? Math.round((net - landed) / net * 1000) / 10 : null }];
    }
    // The upload file. A reduced stk_import: the same statuses, error codes and all-or-nothing rule.
    if (action === "import") {
      const s = session(body.token, "manage");
      if (!Array.isArray(body.rows) || !body.rows.length) fail(400, "The file has no rows.");
      const cell = (v) => (v === null || v === undefined || String(v).trim() === "" || String(v).trim().toUpperCase() === "TBD" ? null : String(v).trim());
      const key = (r) => (cell(r.colibri["Бренд"]) || "").toLowerCase().replace(/[^a-z0-9]/g, "") + "|" + (cell(r.colibri["Серийный номер"]) || "").toUpperCase();
      const seen = {};
      for (const r of body.rows) seen[key(r)] = (seen[key(r)] || 0) + 1;
      const sum = { rows: body.rows.length, update: 0, same: 0, pending: 0, error: 0 };
      const out = body.rows.map((r) => {
        const x = r.extra || {}, brand = cell(r.colibri["Бренд"]), serial = cell(r.colibri["Серийный номер"]), article = cell(r.colibri["Артикул"]);
        const errors = [];
        if (!brand) errors.push({ code: "no_brand" });
        if (!serial) errors.push({ code: "no_serial" });
        if (!article) errors.push({ code: "no_article" });
        if (cell(x.hs_code) && !/^\d{10}$/.test(cell(x.hs_code))) errors.push({ code: "bad_hs" });
        if (cell(x.ikpu) && !/^\d{17}$/.test(cell(x.ikpu))) errors.push({ code: "bad_ikpu" });
        for (const k of ["invoice_date", "arrival_date"]) if (cell(x[k]) && !/^\d{4}-\d{2}-\d{2}$/.test(cell(x[k]))) errors.push({ code: "bad_date", field: k });
        const p = brand && serial ? pieces.find((q) => q.serial.toUpperCase() === serial.toUpperCase()) : null;
        if (brand && serial && seen[key(r)] > 1) errors.push({ code: "serial_repeated" });
        else if (p && article && p.article !== article) errors.push({ code: "serial_other_reference", on_file: p.article });
        const base = { row: r.row, brand, serial, article };
        if (errors.length) { sum.error++; return Object.assign(base, { status: "error", errors }); }
        if (!p) { sum.pending++; return Object.assign(base, { status: "pending" }); }
        if (imported.has(p.piece_id)) { sum.same++; return Object.assign(base, { status: "same", piece_id: p.piece_id, warnings: [] }); }
        sum.update++;
        const details = ["category", "subcategory", "metal", "metal_purity", "metal_weight_g", "stones", "certificate_no", "name_uz", "store"].filter((k) => cell(x[k])).length;
        return Object.assign(base, { status: "update", piece_id: p.piece_id, warnings: cell(x.contract) ? [] : [{ code: "receipt_differs", field: "supplier", on_file: "Older Supplier" }],
          changes: { colibri_new: Object.keys(r.colibri).filter((k) => cell(r.colibri[k])).length, colibri_changed: 0, details,
            receipt: cell(x.supplier) ? "new" : null, brand_code: !!cell(x.brand_barcode), hs_code: !!cell(x.hs_code), ikpu: !!cell(x.ikpu) } });
      });
      const apply = body.apply === true;
      if (apply && sum.error) fail(409, "The file has " + sum.error + " row(s) with errors. Nothing was loaded: fix them and upload again.");
      if (apply) for (const r of out) { if (r.status === "update") imported.add(r.piece_id); if (r.status === "pending") waitingRows.set(r.serial.toUpperCase(), Object.assign({}, r, { file_name: str(body.file_name, 200) || "upload.xlsx", actor: s.name, created_at: new Date().toISOString() })); }
      return [200, { applied: apply, file_name: str(body.file_name, 200) || "upload.xlsx", rows: out, summary: sum, waiting: waitingRows.size }];
    }
    if (action === "import_pending") {
      session(body.token, "manage");
      let applied = 0;
      if (body.check_only !== true) for (const [k] of [...waitingRows]) if (pieces.some((q) => q.serial.toUpperCase() === k)) { waitingRows.delete(k); applied++; }
      return [200, { applied, waiting: waitingRows.size, rows: waitingList() }];
    }
    if (action === "import_remove") {
      session(body.token, "manage");
      const bk = body.brand_key, sk = body.serial_key;
      if (typeof bk !== "string" || typeof sk !== "string" || !bk || !sk || bk.length > 4000 || sk.length > 4000) fail(400, "Say which waiting row to remove.");
      const hit = [...waitingRows].find(([k, r]) => k === sk && r.brand.toLowerCase() === bk);
      if (hit) waitingRows.delete(hit[0]);
      return [200, { removed: hit ? 1 : 0, waiting: waitingRows.size, rows: waitingList() }];
    }
    if (action === "reviews") {
      session(body.token, "view");
      return [200, reviews.filter((r) => r.status === "open").sort((a, b) => cmp(a.raised_at, b.raised_at) || a.review_id - b.review_id)
        .map((r) => { const p = pieces.find((x) => x.piece_id === r.piece_id);
          return { review_id: r.review_id, kind: r.kind, raised_at: r.raised_at, note: r.note,
            piece: { piece_id: p.piece_id, serial: p.serial, brand: p.brand, article: p.article, model_name: p.model_name, state: p.state } }; })];
    }
    if (action === "export") {
      session(body.token, "view");
      const f = filtersIn(body.filters);
      const all = sortRows(base(f).filter((p) => !f.states || f.states.includes(p.state)), f.sort);
      if (all.length > 5000) fail(409, `too many rows to export (${all.length}); narrow the filters`);
      return [200, { rows: all.map(row) }];
    }
    if (action === "set_state") {
      const s = session(body.token, "manage");
      const id = str(body.piece_id, 40) || "";
      if (!UUID_RE.test(id)) fail(400, "That is not a valid piece reference.");
      const state = str(body.state, 40);
      if (!state || !SETTABLE.includes(state)) fail(400, `state must be one of ${SETTABLE.join(", ")}.`);
      const rawNote = body.note === null || body.note === undefined ? "" : String(body.note);
      if (rawNote.trim().length > 500) fail(400, "The note can be at most 500 characters.");
      const note = str(rawNote, 500);
      if (state === "booked_out" && !note) fail(400, "Write who has it and why.");
      if (state === "damaged" && !note) fail(400, "Write what is wrong.");
      const rawClient = body.client_id === null || body.client_id === undefined ? "" : String(body.client_id);
      if (rawClient.trim().length > 20) fail(400, "client_id can be at most 20 characters.");
      const holds = state === "reserved" || state === "booked_out";
      let until = null;
      if (holds && str(body.until, 10) !== null) {
        until = str(body.until, 10);
        const d = new Date(until + "T00:00:00Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== until) fail(400, "until must be a date as YYYY-MM-DD.");
      }
      const p = pieces.find((x) => x.piece_id === id.toLowerCase());
      if (!p) fail(409, `piece ${id} not found`);
      let client = holds ? str(rawClient, 20) : null;
      if (client) {
        client = client.toUpperCase();
        if (!CLIENTS[client]) fail(409, "No client with that reference.");
      }
      move(p, state, s.name, note, client, until, null, "manual", null);
      return [200, detail(s, p.piece_id)];
    }
    if (action === "resolve") {
      const s = session(body.token, "manage");
      const n = typeof body.review_id === "string" && /^\d+$/.test(body.review_id.trim()) ? Number(body.review_id.trim()) : body.review_id;
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) fail(400, "That is not a valid review.");
      const resolution = str(body.resolution, 40);
      if (!resolution) fail(400, "Say how the review is resolved.");
      const rawNote = body.note === null || body.note === undefined ? "" : String(body.note);
      if (rawNote.trim().length > 500) fail(400, "The note can be at most 500 characters.");
      const note = str(rawNote, 500);
      // as ops_resolve_review: open first, then allowed for the kind
      const r = reviews.find((x) => x.review_id === n && x.status === "open");
      if (!r) fail(409, `review ${n} is not open`);
      if (!ANSWERS[r.kind].includes(resolution)) fail(409, `resolution ${resolution} is not allowed for ${r.kind}`);
      const p = pieces.find((x) => x.piece_id === r.piece_id);
      if (resolution === "not_delivered" && p.state === "in_transit") {
        const at = new Date().toISOString();
        events[p.piece_id].unshift({ at, from_state: "in_transit", to_state: "not_received", reason: "review_resolved", ref_kind: "review", ref_id: String(n),
          actor: s.name, note, ticket_id: null, ticket_no: null });
        Object.assign(p, { state: "not_received", state_since: at, state_note: note });
      }
      if (resolution === "sold" && p.state !== "sold") fail(409, `state ${p.state} → sold is not allowed`);
      if ((resolution === "damaged" || resolution === "booked_out") && p.state !== resolution) {
        move(p, resolution, s.name, note, null, null, "review_resolved", "review", String(n));
      }
      Object.assign(r, { status: "resolved", resolution, resolved_by: s.name, resolved_at: new Date().toISOString(), note: note || r.note });
      return [200, { ok: true }];
    }
    fail(400, `Unknown action: ${action}`);
  } catch (e) {
    if (e instanceof Fail) return err(e.status, e.message);
    return err(500, "Something went wrong on the server.");
  }
}

module.exports = {
  handle, reset, PASSCODES, LONG_NAME, delay,
  get pieces() { return pieces; },
  get trainPieces() { return tPieces; },
  // test helper: a training piece is received in the other store behind the page's back
  trainReceiveNow(id) { const p = tPieces.find((x) => x.piece_id === id); const from = p.store_code; p.store_code = p.to_code; p.to_code = null; trainEvent(p, "in_transfer", "in_stock", "transfer_received", "Other Store", null, from, p.store_code); },
  get reviews() { return reviews; },
  get calls() { return calls; },
  get failNext() { return failNext; }, set failNext(v) { failNext = v; },
  // test helper: the piece is sold behind the page's back (a till sale)
  sellNow(id) {
    const p = pieces.find((x) => x.piece_id === id);
    const at = new Date().toISOString();
    events[id].unshift({ at, from_state: p.state, to_state: "sold", reason: "sold", ref_kind: "ticket_line", ref_id: null, actor: "Till",
      note: null, ticket_id: ticketId(p), ticket_no: "D-0000" + p.serial.slice(-2) });
    Object.assign(p, { state: "sold", state_since: at, hold_client_id: null, hold_until: null, state_note: null });
  },
  // test helpers: end every session (the next call answers 401); take a right away
  expireAll() { for (const s of Object.values(sessions)) s.expired = true; },
  setRight(pass, right, value) { PASSCODES[pass].rights[right] = value; },
  // expected answers, worked out from the data rather than written by hand
  expectList: (f) => list(f || {}),
};
