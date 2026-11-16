// A stand-in for stock-api (stock/src/api/README.md is the contract), held in
// memory. Everything in it is invented: serials ZZ.00.xxxxx, barcodes 200…,
// brands "Zz …", client references DLD-9xxx. Nothing is a real piece or person.
//
// handle(body) -> [status, json], with exactly the statuses and sentences the
// README lists: 400 malformed, 401 no/unknown/expired token or wrong passcode,
// 403 not a Stock session or no right, 404 unknown piece, 409 the database
// refused (message verbatim, as ops_set_state / ops_resolve_review raise it).

const PASSCODES = {
  demo: { name: "Stock Manager", rights: { view: true, manage: true, crm: true } },
  look: { name: "Stock Viewer", rights: { view: true, manage: false, crm: false } },
  nocrm: { name: "Floor Manager", rights: { view: true, manage: true, crm: false } },
  none: { name: "Nobody", rights: { view: false, manage: false, crm: false } },
};
const DEFAULT_RIGHTS = JSON.stringify(Object.fromEntries(Object.entries(PASSCODES).map(([k, v]) => [k, v.rights])));
const STATES = ["in_transit", "in_stock", "reserved", "booked_out", "damaged", "sold", "not_received"];
const SETTABLE = ["in_stock", "reserved", "booked_out", "damaged"];
const RESOLUTIONS = ["sold", "damaged", "booked_out", "still_in_stock"];
const NO_ACCESS = "This account does not have access to Stock.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENTS = { "DLD-9001": "Соколова Мария Андреевна", "DLD-9002": "Invented Client Two" };

const BRANDS = ["Zz Atelier", "Zz Jeweller", "Zz Watchmaker"];
const CATS = ["ring", "watch", "necklace", "earrings", "bracelet", "strap", "clasp", "bracelet_element", "cufflinks"];
// How many of the 60 pieces are in each state.
const SPREAD = [["in_stock", 30], ["reserved", 5], ["booked_out", 4], ["in_transit", 6], ["damaged", 3], ["not_received", 4], ["sold", 8]];
const LONG_NAME = "Grand Heritage Perpetual Calendar Skeleton Tourbillon Pieces";   // 60 characters

let pieces, events, reviews, sessions, calls, nextReview;

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
  const kinds = ["missing_from_export", "serial_reused", "ticket_conflict", "missing_from_export", "missing_from_export"];
  reviews = [0, 5, 12, 31, 40].map((pi, k) => ({ review_id: k + 1, piece_id: pieces[pi].piece_id, kind: kinds[k],
    raised_at: iso(30 + k, 9), status: "open", resolution: null, resolved_by: null, resolved_at: null, note: k === 1 ? "Seen twice in the export" : null }));
  nextReview = 6;
  sessions = {};
  calls = [];
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
  return { name: u.name, rights: Object.assign({}, u.rights) };
}

function filtersIn(v) {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) fail(400, "filters must be an object.");
  const out = {};
  for (const [k, max] of [["q", 80], ["brand", 80], ["category", 80]]) {
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
function base(f) {
  const words = f.q ? f.q.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()) : null;
  return pieces.filter((p) => {
    if (words && !words.every((w) => ["serial", "barcode", "article", "brand", "collection", "model_name"]
      .some((k) => p[k] && String(p[k]).toLowerCase().includes(w)))) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.price_min !== undefined && !(p.price_uzs !== null && p.price_uzs >= f.price_min)) return false;
    if (f.price_max !== undefined && !(p.price_uzs !== null && p.price_uzs <= f.price_max)) return false;
    return true;
  }).sort((a, b) => cmp(a.brand, b.brand) || cmp(a.article, b.article) || cmp(a.serial, b.serial));
}
function list(f) {
  const all = base(f);
  const hit = f.states ? all.filter((p) => f.states.includes(p.state)) : all;
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
function detail(sess, id) {
  const p = pieces.find((x) => x.piece_id === id);
  if (!p) fail(404, "No piece with that reference.");
  const out = {
    piece: Object.assign(row(p), { hold_client_id: p.hold_client_id, hold_until: p.hold_until, state_note: p.state_note,
      shipped_on: p.shipped_on, first_seen_at: p.first_seen_at }),
    model: Object.assign({}, p.model),
    events: events[id].map((e) => Object.assign({}, e)),
    reviews: reviews.filter((r) => r.piece_id === id).sort((a, b) => cmp(b.raised_at, a.raised_at))
      .map(({ piece_id, ...r }) => r),
    sales: p.state === "sold" ? [
      { ticket_id: ticketId(p), ticket_no: "D-0000" + p.serial.slice(-2), source: "delardi", sold_at: p.state_since.slice(0, 10), kind: "sale", net: p.price_uzs, status: "posted" },
      { ticket_id: "30000000-0000-4000-8000-1000000000" + p.serial.slice(-2), ticket_no: "T-0000" + p.serial.slice(-2), source: "training", sold_at: p.state_since.slice(0, 10), kind: "sale", net: p.price_uzs, status: "void" },
    ] : [],
  };
  if (sess.rights.crm) out.client_name = p.hold_client_id ? (CLIENTS[p.hold_client_id] || null) : null;
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
  if (holds && client && !CLIENTS[client]) fail(409, `client ${client} not found`);
  const at = new Date().toISOString();
  Object.assign(p, { state, state_since: at, hold_client_id: holds ? client : null, hold_until: holds ? until : null,
    state_note: state === "in_stock" ? null : note });
  const r = reason || (state !== "in_stock" ? state : from === "reserved" ? "released" : from === "booked_out" ? "returned_from_loan" : "repaired");
  events[p.piece_id].unshift({ at, from_state: from, to_state: state, reason: r, ref_kind: refKind, ref_id: refId,
    actor, note, ticket_id: null, ticket_no: null });
}

function handle(body) {
  calls.push(body);
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Body must be a JSON object.");
    const action = str(body.action, 40);
    if (action === "health") return [200, { ok: true }];
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
    if (action === "piece") {
      const s = session(body.token, "view");
      const id = str(body.piece_id, 40) || "";
      if (!UUID_RE.test(id)) fail(400, "That is not a valid piece reference.");
      return [200, detail(s, id.toLowerCase())];
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
      const all = base(f).filter((p) => !f.states || f.states.includes(p.state));
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
      move(p, state, s.name, note, holds ? str(rawClient, 20) : null, until, null, "manual", null);
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
      if (!RESOLUTIONS.includes(resolution)) fail(409, `resolution ${resolution} is not allowed`);
      const r = reviews.find((x) => x.review_id === n && x.status === "open");
      if (!r) fail(409, `review ${n} is not open`);
      const p = pieces.find((x) => x.piece_id === r.piece_id);
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
  handle, reset, PASSCODES, LONG_NAME,
  get pieces() { return pieces; },
  get reviews() { return reviews; },
  get calls() { return calls; },
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
