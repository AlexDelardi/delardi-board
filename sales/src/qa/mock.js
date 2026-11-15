// A stand-in for sales-api (sales/src/api/README.md is the contract), held in
// memory. Everything in it is invented: serials ZZ.00.xxxxx, barcodes 200…,
// rep labels as in crm/src/qa/mock.js, client references DLD-9xxx. Nothing is
// a real piece, a real sale or a real person.
//
// handle(body) -> [status, json], exactly the statuses the README lists:
// 400 malformed, 401 no/unknown token or wrong passcode, 403 no right,
// 404 unknown ticket, 409 the database refused (message verbatim).

const PASSCODES = {
  demo: { name: "Till Manager", rights: { view: true, post: true, void: true, manage: true } },
  rep: { name: "Dilnoza A.", rights: { view: true, post: true, void: false, manage: false } },
  look: { name: "Viewer", rights: { view: true, post: false, void: false, manage: false } },
  none: { name: "Nobody", rights: { view: false, post: false, void: false, manage: false } },
};
const SELLERS = ["Dilnoza A.", "Malika B.", "Shared (store)"];
const CASH_NOTICE = 170000000;

function freshPieces() {
  let n = 0;
  const id = () => "00000000-0000-4000-8000-" + String(++n).padStart(12, "0");
  const p = (o) => Object.assign({
    piece_id: id(), serial: null, barcode: null, brand: null, article: null, collection: null, model_name: null,
    colour: null, size: null, metal_keys: [], stone_keys: [], price_uzs: null, state: "in_stock", held: null,
  }, o);
  return [
    // one sellable piece on this barcode
    p({ serial: "ZZ.00.30001", barcode: "2000000000031", brand: "Messika", article: "ZZ-MS-0301", collection: "Move Uno",
      model_name: "Move Uno Pavé Ring", colour: "WG", size: "52", metal_keys: ["white_gold"], stone_keys: ["diamond"], price_uzs: 31500000 }),
    // a barcode shared by three pieces, one of them sold
    p({ serial: "ZZ.00.20001", barcode: "2000000000024", brand: "Chimento", article: "ZZ-CH-0201", collection: "Armillas",
      model_name: "Armillas Bangle", colour: "YG", size: "17", metal_keys: ["yellow_gold"], stone_keys: [], price_uzs: 18400000 }),
    p({ serial: "ZZ.00.20002", barcode: "2000000000024", brand: "Chimento", article: "ZZ-CH-0201", collection: "Armillas",
      model_name: "Armillas Bangle", colour: "YG", size: "18", metal_keys: ["yellow_gold"], stone_keys: [], price_uzs: 18400000 }),
    p({ serial: "ZZ.00.20003", barcode: "2000000000024", brand: "Chimento", article: "ZZ-CH-0201", collection: "Armillas",
      model_name: "Armillas Bangle", colour: "YG", size: "16", metal_keys: ["yellow_gold"], stone_keys: [], price_uzs: 18400000, state: "sold" }),
    // a watch dear enough to pass the cash notice
    p({ serial: "ZZ.00.40001", barcode: "2000000000048", brand: "Franck Muller", article: "ZZ-FM-0401", collection: "Vanguard",
      model_name: "Vanguard Chronograph", size: "44", metal_keys: ["steel"], stone_keys: [], price_uzs: 245000000 }),
    // held by a suspended sale
    p({ serial: "ZZ.00.50001", barcode: "2000000000055", brand: "Messika", article: "ZZ-MS-0501", collection: "Glam'Azone",
      model_name: "Glam'Azone Bracelet", metal_keys: ["rose_gold"], stone_keys: ["diamond"], price_uzs: 52300000, held: { draft_id: 7 } }),
    // still on its way
    p({ serial: "ZZ.00.60001", barcode: "2000000000062", brand: "Messika", article: "ZZ-MS-0601", collection: "Move Titanium",
      model_name: "Move Titanium Earrings", metal_keys: ["titanium", "white_gold"], stone_keys: ["diamond"], price_uzs: 27900000, state: "in_transit" }),
    // no catalogue price: the seller types one
    p({ serial: "ZZ.00.70001", barcode: "2000000000079", brand: "Chimento", article: "ZZ-CH-0701", collection: "Stretch",
      model_name: "Stretch Ring", size: "54", metal_keys: ["rose_gold"], stone_keys: [], price_uzs: null }),
  ];
}

let st;
function reset() {
  st = {
    mode: "training", pieces: freshPieces(), sessions: new Map(), tickets: [], seq: { training: 0, live: 0 },
    calls: [], nextTicket: 1,
  };
}
reset();

const err = (status, error) => [status, { error }];
const fmt = (n) => (n < 0 ? "-" : "") + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Line net = round(price × (1 − d/100)), half away from zero, whole so'm —
// worked out here with decimal strings, independently of the page's own code.
function netOf(price, pct) {
  const [ip, fp = ""] = String(pct || 0).split(".");
  const bp = BigInt(ip) * 10000n + BigInt((fp + "0000").slice(0, 4));   // ten-thousandths of a percent
  const num = BigInt(price) * (1000000n - bp);
  const q = num / 1000000n, r = num % 1000000n;
  return Number(r * 2n >= 1000000n ? q + 1n : q);
}

function session(body, need) {
  const t = body.token;
  if (!t || typeof t !== "string" || t.length < 20) return err(401, "Enter your passcode to open the till.");
  const s = st.sessions.get(t);
  if (!s) return err(401, "That session is not valid. Enter your passcode again.");
  if (need === "post" && !s.rights.post) return err(403, "Your account cannot make sales.");
  if (need === "view" && !s.rights.view) return err(403, "Your account cannot look up sales.");
  if (need === "manage" && !s.rights.manage) return err(403, "Your account cannot manage the till.");
  return null;
}

function search(q) {
  q = String(q || "").trim();
  if (!q) return [];
  let hit = st.pieces.filter((p) => p.barcode === q);
  if (!hit.length) hit = st.pieces.filter((p) => p.serial.replace(/\s/g, "").toUpperCase() === q.replace(/\s/g, "").toUpperCase());
  if (!hit.length) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    hit = st.pieces.filter((p) => words.every((w) => [p.serial, p.article, p.brand, p.collection, p.model_name]
      .some((f) => f && f.toLowerCase().includes(w))));
  }
  return hit.map((p) => ({ ...p, sellable: p.state === "in_stock" && !p.held }))
    .sort((a, b) => (b.sellable - a.sellable) || a.brand.localeCompare(b.brand) || a.serial.localeCompare(b.serial))
    .slice(0, 20);
}

function post(sale, actor) {
  if (!sale || typeof sale !== "object" || Array.isArray(sale)) return err(400, "sale must be an object.");
  if (!Array.isArray(sale.lines) || !sale.lines.length) return err(400, "Add at least one piece.");
  const walk = !!sale.walk_in, client = sale.client_id || null;
  if (walk === !!client) return err(409, "choose a client or walk-in");
  if (!SELLERS.includes(sale.seller)) return err(409, "seller " + (sale.seller || "") + " is not a current sales rep");
  let total = 0;
  const lines = [];
  const seen = new Set();
  for (const l of sale.lines) {
    const p = st.pieces.find((x) => x.piece_id === l.piece_id);
    if (!p) return err(409, "piece not found");
    if (seen.has(p.piece_id)) return err(409, "piece " + p.serial + " is twice in the sale");
    seen.add(p.piece_id);
    if (p.state !== "in_stock") return err(409, "piece " + p.serial + " is not in stock");
    if (p.held) return err(409, "piece " + p.serial + " is held by suspended sale #" + p.held.draft_id);
    if (!Number.isInteger(l.price_uzs) || l.price_uzs <= 0) return err(409, "price of " + p.serial + " must be a whole positive number");
    const d = l.discount_pct === undefined || l.discount_pct === null ? 0 : l.discount_pct;
    if (typeof d !== "number" || d < 0 || d > 99.9999) return err(409, "discount of " + p.serial + " must be between 0 and 99.9999");
    if (l.seller && !SELLERS.includes(l.seller)) return err(409, "seller " + l.seller + " is not a current sales rep");
    const net = netOf(l.price_uzs, d);
    total += net;
    lines.push({ p, price: l.price_uzs, d, net, seller: l.seller || null });
  }
  const pays = Array.isArray(sale.payments) ? sale.payments : [];
  let paid = 0, cash = 0;
  for (const x of pays) {
    if (!["cash", "card", "transfer"].includes(x.method)) return err(409, "unknown payment method " + x.method);
    if (x.method === "card" && !["uzcard", "humo", "visa"].includes(x.card_type)) return err(409, "card payments need a card type");
    if (!Number.isInteger(x.amount) || x.amount <= 0) return err(409, "a payment must be a whole positive amount");
    paid += x.amount;
    if (x.method === "cash") cash += x.amount;
  }
  if (paid !== total) return err(409, "payments " + paid + " do not match total " + total);

  const mode = st.mode;
  st.seq[mode] += 1;
  const ticket_no = (mode === "training" ? "T-" : "D-") + String(st.seq[mode]).padStart(6, "0");
  const ticket_id = "10000000-0000-4000-8000-" + String(st.nextTicket++).padStart(12, "0");
  if (mode === "live") for (const l of lines) l.p.state = "sold";   // training leaves pieces in stock
  const now = new Date("2026-11-15T10:42:00Z");
  const text = [];
  if (mode === "training") text.push("TRAINING — NOT A SALE");
  text.push("DELARDI", "Tashkent, 1 Example Street", "Ticket " + ticket_no + " · 15.11.2026 15:42",
    "Seller: " + sale.seller, "Client: " + (walk ? "Walk-in" : client));
  for (const l of lines) {
    text.push([l.p.brand, l.p.model_name].filter(Boolean).join(" ") + " · " + l.p.serial);
    text.push(fmt(l.price) + " −" + l.d + "% = " + fmt(l.net));
  }
  text.push("Total " + fmt(total));
  for (const x of pays) {
    const label = x.method === "cash" ? "Cash" : x.method === "transfer" ? "Transfer"
      : { uzcard: "Uzcard", humo: "Humo", visa: "Visa" }[x.card_type];
    text.push(label + " " + fmt(x.amount));
  }
  st.tickets.push({
    ticket: {
      ticket_id, store_id: 1, source: mode === "training" ? "training" : "delardi", ticket_no, sold_at: "2026-11-15",
      seller: sale.seller, client_id: client, client_raw: null, walk_in: walk, entered_by: actor, note: null,
      fiscal_ref: sale.fiscal_ref || null, status: "posted", receipt_text: text.join("\n"), void_reason: null,
      voided_by: null, voided_at: null, loaded_at: now.toISOString(), updated_at: now.toISOString(),
    },
    lines: lines.map((l, i) => ({
      line_id: 1000 + i, line_no: i + 1, kind: "sale", article: l.p.article, colour: l.p.colour, item_name: l.p.model_name,
      brand_raw: l.p.brand, size: l.p.size, model_id: null, variant_id: null, piece_id: l.p.piece_id, serial_raw: l.p.serial,
      qty: 1, price_list: l.p.price_uzs, price_current: l.price, discount_pct: l.d, discount_amt: l.price - l.net, net: l.net,
      seller: l.seller,
    })),
    payments: pays.map((x, i) => ({ payment_id: 500 + i, method: x.method, amount: x.amount, raw: null, card_type: x.card_type || null })),
    client_name: walk ? null : "Invented Client",
  });
  return [200, { ticket_id, ticket_no, mode, total, cash_notice: cash > CASH_NOTICE }];
}

function handle(body) {
  st.calls.push(body);
  if (!body || typeof body !== "object") return err(400, "Body must be a JSON object.");
  const a = body.action;
  if (a === "health") return [200, { ok: true }];
  if (a === "unlock") {
    const u = PASSCODES[body.passcode];
    if (!u) return err(401, "That passcode is not right.");
    if (!u.rights.view && !u.rights.post) return err(403, "This account does not have access to Sales.");
    const token = (Math.random().toString(16).slice(2) + "a".repeat(64)).slice(0, 64);
    st.sessions.set(token, u);
    return [200, { token, name: u.name, expires_at: new Date(Date.now() + 8 * 3600000).toISOString(), rights: u.rights }];
  }
  const need = { search: "post", post: "post", suspend: "post", drafts: "post", cancel_draft: "post",
    tickets: "view", ticket: "view", ticket_by_line: "view", void: "void", set_mode: "manage", clear_training: "manage",
    ping: null, reference: null }[a];
  if (need === undefined) return err(400, "Unknown action.");
  const bad = session(body, need);
  if (bad) return bad;
  const u = st.sessions.get(body.token);
  switch (a) {
    case "ping": return [200, { ok: true, name: u.name, rights: u.rights, mode: st.mode }];
    case "reference": return [200, { mode: st.mode, go_live_date: null, vat_pct: 0, cash_notice_uzs: CASH_NOTICE,
      shop_address: "Tashkent, 1 Example Street", sellers: SELLERS, rights: u.rights }];
    case "search":
      if (body.q !== undefined && typeof body.q !== "string") return err(400, "q must be text.");
      return [200, { mode: st.mode, pieces: search(body.q) }];
    case "post": return post(body.sale, u.name);
    case "drafts": return [200, { mode: st.mode, drafts: [] }];
    case "ticket": {
      const t = st.tickets.find((x) => x.ticket.ticket_id === body.ticket_id);
      if (!t) return err(404, "No sale with that reference.");
      return [200, t];
    }
    default: return err(400, "Not in this stand-in yet.");
  }
}

module.exports = {
  handle, reset, netOf,
  get state() { return st; },
  // another till sells the piece behind the page's back
  sellBehind(serial) { const p = st.pieces.find((x) => x.serial === serial); p.state = "sold"; },
};
