// A stand-in for sales-api (sales/src/api/README.md is the contract), held in
// memory. Everything in it is invented: serials ZZ.00.xxxxx, barcodes 200…,
// rep labels as in crm/src/qa/mock.js, client references DLD-9xxx. Nothing is
// a real piece, a real sale or a real person.
//
// handle(body) -> [status, json], exactly the statuses the README lists:
// 400 malformed, 401 no/unknown token or wrong passcode, 403 no right,
// 404 unknown ticket, 409 the database refused (message verbatim).

const PASSCODES = {
  demo: { name: "Till Manager", rights: { view: true, post: true, void: true, manage: true, crm: true } },
  rep: { name: "Dilnoza A.", rights: { view: true, post: true, void: false, manage: false, crm: true } },
  look: { name: "Viewer", rights: { view: true, post: false, void: false, manage: false, crm: false } },
  none: { name: "Nobody", rights: { view: false, post: false, void: false, manage: false, crm: false } },
  // Sales rights but no CRM view right: crm-api answers 403, the till offers Walk-in only,
  // and sales-api shows clients by reference only (no name, no raw client text)
  nocrm: { name: "Counter Seller", rights: { view: true, post: true, void: false, manage: false, crm: false } },
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
    // sold on the seeded live ticket D-000001 (voiding it puts it back)
    p({ serial: "ZZ.00.12001", barcode: "2000000000123", brand: "Pomellato", article: "ZZ-PO-1201", collection: "Nudo",
      model_name: "Nudo Ring", size: "53", metal_keys: ["rose_gold"], stone_keys: [], price_uzs: 24600000, state: "sold" }),
    // no catalogue price: the seller types one
    p({ serial: "ZZ.00.70001", barcode: "2000000000079", brand: "Chimento", article: "ZZ-CH-0701", collection: "Stretch",
      model_name: "Stretch Ring", size: "54", metal_keys: ["rose_gold"], stone_keys: [], price_uzs: null }),
  ];
}

// Tashkent date, `back` days ago — the seeded tickets sit inside / outside the 30-day window whatever the day.
const tkDate = (back) => new Date(Date.now() + 5 * 3600e3 - (back || 0) * 86400e3).toISOString().slice(0, 10);
const LINE_D2 = "20000000-0000-4000-8000-000000000202";       // the CRM purchase row of DLD-9001 points here

function seedTickets(pieces) {
  const t = (o, lines, pays) => ({
    ticket: Object.assign({ store_id: 1, client_id: null, client_raw: null, walk_in: false, entered_by: null, note: null,
      fiscal_ref: null, status: "posted", receipt_text: null, void_reason: null, voided_by: null, voided_at: null,
      loaded_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }, o),
    lines: lines.map((l, i) => Object.assign({ line_no: i + 1, kind: "sale", colour: null, size: null, model_id: null, variant_id: null,
      piece_id: null, qty: 1, discount_pct: 0, discount_amt: 0, seller: null }, l)),
    payments: pays || [],
    client_name: o.client_id === "DLD-9001" ? "Соколова Мария Андреевна" : o.client_raw || null,
  });
  const pz = pieces.find((x) => x.serial === "ZZ.00.12001");
  return [
    t({ ticket_id: "30000000-0000-4000-8000-000000000001", source: "colibri", ticket_no: "C-104233", sold_at: tkDate(3),
      seller: "Malika B.", client_id: "DLD-9001" },
      [{ line_id: "20000000-0000-4000-8000-000000000101", article: "ZZ-MS-1101", item_name: "Move Classique Ring", brand_raw: "Messika",
        serial_raw: "ZZ.00.11001", price_list: 41200000, price_current: 41200000, net: 41200000 }],
      [{ payment_id: 1, method: "card", amount: 41200000, raw: null, card_type: "visa" }]),
    t({ ticket_id: "30000000-0000-4000-8000-000000000002", source: "colibri", ticket_no: "C-104230", sold_at: tkDate(5),
      seller: "Dilnoza A.", client_raw: "Invented Buyer" },
      [{ line_id: "20000000-0000-4000-8000-000000000102", kind: "refund", article: "ZZ-CH-1102", item_name: "Stretch Bracelet",
        brand_raw: "Chimento", serial_raw: "ZZ.00.11002", price_list: 9800000, price_current: 9800000, net: 9800000 }],
      [{ payment_id: 2, method: "cash", amount: -9800000, raw: null, card_type: null }]),
    t({ ticket_id: "30000000-0000-4000-8000-000000000003", source: "delardi", ticket_no: "D-000001", sold_at: tkDate(1),
      seller: "Dilnoza A.", walk_in: true, entered_by: "Dilnoza A.", fiscal_ref: "ERA-0007",
      receipt_text: "DELARDI\nTashkent, 1 Example Street\nTicket D-000001\nSeller: Dilnoza A.\nClient: Walk-in\nPomellato Nudo Ring · ZZ.00.12001\n24 600 000 −0% = 24 600 000\nTotal 24 600 000\nCash 24 600 000" },
      [{ line_id: "20000000-0000-4000-8000-000000000201", article: "ZZ-PO-1201", item_name: "Nudo Ring", brand_raw: "Pomellato",
        serial_raw: "ZZ.00.12001", piece_id: pz.piece_id, price_list: 24600000, price_current: 24600000, net: 24600000 }],
      [{ payment_id: 3, method: "cash", amount: 24600000, raw: null, card_type: null }]),
    t({ ticket_id: "30000000-0000-4000-8000-000000000004", source: "delardi", ticket_no: "D-000002", sold_at: tkDate(2),
      seller: "Malika B.", client_id: "DLD-9001", entered_by: "Malika B.",
      receipt_text: "DELARDI\nTashkent, 1 Example Street\nTicket D-000002\nSeller: Malika B.\nClient: Соколова Мария Андреевна\nChimento Armillas Ring · ZZ.00.12002\n15 000 000 −10% = 13 500 000\nTotal 13 500 000\nHumo 13 500 000" },
      [{ line_id: LINE_D2, article: "ZZ-CH-1202", item_name: "Armillas Ring", brand_raw: "Chimento",
        serial_raw: "ZZ.00.12002", price_list: 15000000, price_current: 15000000, discount_pct: 10, discount_amt: 1500000, net: 13500000 }],
      [{ payment_id: 4, method: "card", amount: 13500000, raw: null, card_type: "humo" }]),
    // outside the 30-day window
    t({ ticket_id: "30000000-0000-4000-8000-000000000005", source: "colibri", ticket_no: "C-103900", sold_at: tkDate(45),
      seller: "Malika B.", client_raw: "Invented Buyer" },
      [{ line_id: "20000000-0000-4000-8000-000000000103", article: "ZZ-MS-1103", item_name: "Joy Pendant", brand_raw: "Messika",
        serial_raw: "ZZ.00.11003", price_list: 18000000, price_current: 18000000, net: 18000000 }]),
  ];
}

let st;
function reset() {
  const pieces = freshPieces();
  st = {
    mode: "training", go_live_date: null, pieces, sessions: new Map(), tickets: seedTickets(pieces), seq: { training: 0, live: 2 },
    calls: [], nextTicket: 1, drafts: [], nextDraft: 8,
  };
  crmReset();
}

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
  if (need === "void" && !s.rights.void) return err(403, "Your account cannot void sales.");
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
  return hit.map((p) => { const held = p.held || heldBy(p.piece_id); return { ...p, held, sellable: p.state === "in_stock" && !held }; })
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
    const held = p.held || heldBy(p.piece_id, sale.draft_id);
    if (held) return err(409, "piece " + p.serial + " is in suspended sale " + held.draft_id);
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
  if (sale.draft_id) {
    const d = st.drafts.find((x) => x.draft_id === sale.draft_id);
    if (!d) return err(409, "suspended sale " + sale.draft_id + " no longer exists");
    if (d.mode !== st.mode) return err(409, "suspended sale " + sale.draft_id + " belongs to the other mode");
  }
  if (st.drafts.some((d) => d.mode === st.mode && d.draft_id !== sale.draft_id)) return err(409, "another sale is suspended");
  if (paid !== total) return err(409, "payments " + paid + " do not match total " + total);
  if (sale.draft_id) st.drafts = st.drafts.filter((d) => d.draft_id !== sale.draft_id);

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
    // same layout as pos_receipt_text (pos_6): name, reference line, serial, price
    text.push([l.p.brand, l.p.model_name].filter(Boolean).join(" · "));
    text.push(["Ref. " + (l.p.article || "—"), "Ring", "White gold", l.p.size ? "Size " + l.p.size : null].filter(Boolean).join(" · "));
    text.push("S/N " + l.p.serial);
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
      ticket_id, store_id: 1, source: mode === "training" ? "training" : "delardi", ticket_no, sold_at: tkDate(0),
      seller: sale.seller, client_id: client, client_raw: null, walk_in: walk, entered_by: actor, note: null,
      fiscal_ref: sale.fiscal_ref || null, status: "posted", receipt_text: text.join("\n"), void_reason: null,
      voided_by: null, voided_at: null, loaded_at: now.toISOString(), updated_at: now.toISOString(),
    },
    lines: lines.map((l, i) => ({
      line_id: "21000000-0000-4000-8000-" + String(st.nextTicket * 100 + i).padStart(12, "0"), line_no: i + 1, kind: "sale", article: l.p.article, colour: l.p.colour, item_name: l.p.model_name,
      brand_raw: l.p.brand, size: l.p.size, model_id: null, variant_id: null, piece_id: l.p.piece_id, serial_raw: l.p.serial,
      qty: 1, price_list: l.p.price_uzs, price_current: l.price, discount_pct: l.d, discount_amt: l.price - l.net, net: l.net,
      seller: l.seller,
    })),
    payments: pays.map((x, i) => ({ payment_id: 500 + i, method: x.method, amount: x.amount, raw: null, card_type: x.card_type || null })),
    client_name: walk ? null : (crmName(client) || "Invented Client"),
  });
  return [200, { ticket_id, ticket_no, mode, total, cash_notice: cash > CASH_NOTICE }];
}

// The suspended sale (of the current mode) holding a piece, other than `except`.
function heldBy(piece_id, except) {
  const d = st.drafts.find((x) => x.mode === st.mode && x.draft_id !== except && x.lines.some((l) => l.piece_id === piece_id));
  return d ? { draft_id: d.draft_id } : null;
}
function suspend(sale, actor) {
  if (!sale || typeof sale !== "object" || Array.isArray(sale)) return err(400, "sale must be an object.");
  if (!Array.isArray(sale.lines) || !sale.lines.length) return err(400, "Add at least one piece.");
  if (sale.draft_id && !st.drafts.some((d) => d.draft_id === sale.draft_id && d.mode === st.mode))
    return err(409, "suspended sale " + sale.draft_id + " not found");
  for (const l of sale.lines) {
    const p = st.pieces.find((x) => x.piece_id === l.piece_id);
    if (!p) return err(409, "piece not found");
    if (p.state !== "in_stock") return err(409, "piece " + p.serial + " is not in stock");
    const held = p.held || heldBy(p.piece_id, sale.draft_id);
    if (held) return err(409, "piece " + p.serial + " is in suspended sale " + held.draft_id);
  }
  if (!sale.draft_id && st.drafts.some((d) => d.mode === st.mode)) return err(409, "another sale is suspended");
  const lines = sale.lines.map((l) => ({ piece_id: l.piece_id, price_uzs: l.price_uzs === undefined ? null : l.price_uzs,
    discount_pct: l.discount_pct || 0, seller: l.seller || null }));
  let d = sale.draft_id ? st.drafts.find((x) => x.draft_id === sale.draft_id) : null;
  if (!d) { d = { draft_id: st.nextDraft++, mode: st.mode, created_by: actor, created_at: new Date().toISOString() }; st.drafts.push(d); }
  Object.assign(d, { client_id: sale.client_id || null, walk_in: !!sale.walk_in, seller: sale.seller || null, lines });
  return [200, { draft_id: d.draft_id }];
}
function ticketRow(x) {
  const t = x.ticket, ls = x.lines;
  const first = ls[0] ? [ls[0].brand_raw, ls[0].item_name].filter(Boolean).join(" ") : null;
  return { ticket_id: t.ticket_id, ticket_no: t.ticket_no, source: t.source, sold_at: t.sold_at, status: t.status, seller: t.seller,
    client_id: t.client_id, client_name: x.client_name, walk_in: t.walk_in,
    items: first ? first + (ls.length > 1 ? " ×" + ls.length : "") : null, lines: ls.length,
    net: ls.reduce((a, l) => a + (l.kind === "refund" ? -l.net : l.net), 0) };
}
function tickets(f) {
  if (f.source && !["colibri", "delardi"].includes(f.source)) return err(400, "source must be colibri or delardi.");
  if (f.status && !["posted", "void"].includes(f.status)) return err(400, "status must be posted or void.");
  if (f.seller && !SELLERS.includes(f.seller)) return err(400, "No sales rep has that label.");
  if (f.training && st.mode !== "training") return err(409, "test tickets are listed only while the till is in training");
  let from = f.from || null, to = f.to || null;
  if (!from && !to) from = tkDate(29);
  const q = String(f.q || "").trim().toLowerCase();
  let rows = st.tickets.filter((x) => (f.training ? x.ticket.source === "training" : x.ticket.source !== "training"))
    .filter((x) => (!from || x.ticket.sold_at >= from) && (!to || x.ticket.sold_at <= to))
    .filter((x) => !f.seller || x.ticket.seller === f.seller)
    .filter((x) => !f.source || x.ticket.source === f.source)
    .filter((x) => !f.status || x.ticket.status === f.status)
    .filter((x) => !q || x.ticket.ticket_no.toLowerCase() === q || String(x.client_name || "").toLowerCase().includes(q)
      || x.lines.some((l) => [l.serial_raw, l.article, l.brand_raw].some((v) => v && v.toLowerCase().includes(q))))
    .map(ticketRow)
    .sort((a, b) => (a.sold_at < b.sold_at ? 1 : a.sold_at > b.sold_at ? -1 : a.ticket_no < b.ticket_no ? 1 : -1));
  const page = Math.max(1, f.page || 1);
  return [200, { count: rows.length, void_count: rows.filter((r) => r.status === "void").length,
    net_total: rows.filter((r) => r.status === "posted").reduce((a, r) => a + r.net, 0), page, page_size: 50,
    rows: rows.slice((page - 1) * 50, page * 50) }];
}

// post and suspend: the page says which mode it shows (expect_mode, required), and a
// client may be named only with the CRM view right — as sales-api and pos_post_sale do.
function saleGuard(body, u) {
  if (!["training", "live"].includes(body.expect_mode)) return err(400, "Reload the page: it did not say which mode it shows.");
  if (!u.rights.crm && body.sale && body.sale.client_id) return err(403, "Your account cannot attach clients — use Walk-in.");
  if (body.expect_mode !== st.mode) return err(409, "the till was switched to " + st.mode + " — reload");
  return null;
}
// Without the CRM view right: clients by reference only.
function withoutClientData(x) {
  const t = { ...x.ticket };
  delete t.client_raw;
  if (t.receipt_text && t.client_id) t.receipt_text = t.receipt_text.replace(/^Client: .*$/m, "Client: " + t.client_id);
  return { ticket: t, lines: x.lines, payments: x.payments };
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
    case "reference": return [200, { mode: st.mode, go_live_date: st.go_live_date, vat_pct: 0, cash_notice_uzs: CASH_NOTICE,
      shop_address: "Tashkent, 1 Example Street", sellers: SELLERS, rights: u.rights }];
    case "search":
      if (body.q !== undefined && typeof body.q !== "string") return err(400, "q must be text.");
      return [200, { mode: st.mode, pieces: search(body.q) }];
    case "post": return saleGuard(body, u) || post(body.sale, u.name);
    case "drafts": return [200, { mode: st.mode, drafts: st.drafts.filter((d) => d.mode === st.mode).sort((a, b) => b.draft_id - a.draft_id)
      .map((d) => ({ draft_id: d.draft_id, created_by: d.created_by, created_at: d.created_at, client_id: d.client_id, walk_in: d.walk_in,
        seller: d.seller, lines: d.lines.map((l) => { const p = st.pieces.find((x) => x.piece_id === l.piece_id);
          return { piece_id: l.piece_id, serial: p.serial, brand: p.brand, model_name: p.model_name, price_uzs: l.price_uzs,
            discount_pct: l.discount_pct, seller: l.seller }; }) })) }];
    case "suspend": return saleGuard(body, u) || suspend(body.sale, u.name);
    case "cancel_draft": {
      const d = st.drafts.find((x) => x.draft_id === body.draft_id && x.mode === st.mode);
      if (!d) return err(409, "suspended sale " + body.draft_id + " not found");
      st.drafts = st.drafts.filter((x) => x !== d);
      return [200, { ok: true }];
    }
    case "ticket": {
      const t = st.tickets.find((x) => x.ticket.ticket_id === body.ticket_id);
      if (!t) return err(404, "No sale with that reference.");
      return [200, u.rights.crm ? t : withoutClientData(t)];
    }
    case "ticket_by_line": {
      const t = st.tickets.find((x) => x.lines.some((l) => l.line_id === body.line_id));
      if (!t) return err(404, "No sale with that reference.");
      return [200, { ticket_id: t.ticket.ticket_id }];
    }
    case "tickets": {
      const r = tickets(body.filters || {});
      if (r[0] === 200 && !u.rights.crm) r[1].rows = r[1].rows.map((x) => { const o = { ...x }; delete o.client_name; return o; });
      return r;
    }
    case "void": {
      const t = st.tickets.find((x) => x.ticket.ticket_id === body.ticket_id);
      if (!t) return err(404, "No sale with that reference.");
      if (typeof body.reason !== "string" || !body.reason.trim()) return err(400, "reason is required.");
      if (!["delardi", "training"].includes(t.ticket.source)) return err(409, "only a sale from this till can be voided");
      if (t.ticket.status === "void") return err(409, "already void");
      let n = 0;
      if (t.ticket.source === "delardi") for (const l of t.lines) {
        const p = st.pieces.find((x) => x.piece_id === l.piece_id);
        if (p && p.state === "sold") { p.state = "in_stock"; n++; }
      }
      Object.assign(t.ticket, { status: "void", void_reason: body.reason.trim(), voided_by: u.name, voided_at: new Date().toISOString() });
      return [200, { ticket_no: t.ticket.ticket_no, pieces_returned: n }];
    }
    case "set_mode": {
      if (!["training", "live"].includes(body.mode)) return err(400, "mode must be training or live.");
      st.mode = body.mode;
      if (st.mode === "live" && !st.go_live_date) st.go_live_date = tkDate(0);
      return [200, { mode: st.mode, go_live_date: st.go_live_date }];
    }
    case "clear_training": {
      const tickets = st.tickets.filter((x) => x.ticket.source === "training").length;
      const drafts = st.drafts.filter((d) => d.mode === "training").length;
      st.tickets = st.tickets.filter((x) => x.ticket.source !== "training");
      st.drafts = st.drafts.filter((d) => d.mode !== "training");
      return [200, { tickets, drafts }];
    }
    default: return err(400, "Not in this stand-in yet.");
  }
}

/* ===========================================================================
   A stand-in for crm-api (crm/src/api/index.ts is the contract), for the client
   panel: unlock, ping, reference, clients {q}, client {id}, client_add. Shapes as
   crm-api returns them; every person is invented (DLD-9xxx / PRS-9xxx), the
   rep labels are crm/src/qa/mock.js's.
   ========================================================================= */
const CRM_REPS = [
  { label: "Nodira T.", active: false }, { label: "Dilnoza A.", active: true }, { label: "Malika B.", active: true },
  { label: "Shared (store)", active: true },
];
const CRM_USERS = { demo: { name: "Till Manager", can_edit: true, rep: null }, rep: { name: "Dilnoza A.", can_edit: true, rep: "Dilnoza A." } };
let crm;
function crmClient(o) {
  return Object.assign({
    record_type: "client", record_state: "open", in_colibri: true, in_marketing: true, name_colibri: null, name_marketing: null,
    name_confirmed: null, abc_class: "B", rfm_segment: "Loyal", lifecycle_status: "Active", client_owner: "Shared (store)",
    assigned_owner: null, historic_owner: null, lifetime_spend_uzs: 0, last_purchase_at: null, added_by_hand: false, how_met: null,
    phone_marketing: null,
  }, o);
}
function crmReset() {
  crm = {
    sessions: new Map(), calls: [], nextPrs: 9001,
    clients: [
      crmClient({ client_id: "DLD-9001", name_colibri: "Соколова Мария Андреевна", abc_class: "A", rfm_segment: "Champion",
        client_owner: "Dilnoza A.", lifetime_spend_uzs: 54700000, last_purchase_at: tkDate(2), phone_marketing: "+998901110001" }),
      crmClient({ client_id: "DLD-9002", name_colibri: "Соколов Игорь Петрович", client_owner: "Malika B.",
        lifetime_spend_uzs: 18000000, last_purchase_at: "2026-05-11" }),
      crmClient({ client_id: "DLD-9003", name_colibri: "Каримова Лола Азизовна", rfm_segment: "At risk", lifecycle_status: "Lapsed",
        lifetime_spend_uzs: 9900000, last_purchase_at: "2025-02-03" }),
    ],
    tx: {
      "DLD-9001": [
        { id: 2, client_id: "DLD-9001", sold_at: tkDate(2), brand: "Chimento", category: "Ring", item: "Кольцо ARMILLAS", qty: 1,
          gross_uzs: 15000000, discount_pct: 0.1, net_uzs: 13500000, advisor: "Malika B.", article: "ZZ-CH-1202", ticket_line_id: LINE_D2 },
        { id: 1, client_id: "DLD-9001", sold_at: "2025-12-03", brand: "Messika", category: "Ring", item: "Кольцо MOVE CLASSIQUE", qty: 1,
          gross_uzs: 41200000, discount_pct: 0, net_uzs: 41200000, advisor: "Dilnoza A.", article: "ZZ-MS-1101", ticket_line_id: null },
      ],
    },
    events: {
      "DLD-9001": [
        { id: 3, client_id: "DLD-9001", at: "2026-10-02T11:00:00Z", actor: "Dilnoza A.", action: "note", field: null, old_value: null,
          new_value: null, note: "Looking for a gift for her sister in December." },
        { id: 1, client_id: "DLD-9001", at: "2026-09-18T10:40:00Z", actor: "Dilnoza A.", action: "field_resolved", field: "name",
          old_value: null, new_value: null, note: "client:colibri" },
      ],
    },
    personal: { "DLD-9001": { ring_sizes: [16.5], about: "Prefers an appointment after 18:00.", about_by: "Dilnoza A.", about_at: "2026-09-20T09:05:00Z" } },
    dates: { "DLD-9001": [{ id: 1, kind: "anniversary", label: null, month: 10, day: 11, year: 2014, added_by: "Dilnoza A." },
      { id: 2, kind: "child_birthday", label: "daughter", month: 12, day: 3, year: 2016, added_by: "Dilnoza A." }] },
  };
}
const crmDisplay = (c) => c.name_confirmed || c.name_colibri || c.name_marketing;
function crmName(id) { const c = crm && crm.clients.find((x) => x.client_id === id); return c ? crmDisplay(c) : null; }
function crmQueue(c) {
  return { client_id: c.client_id, display_name: crmDisplay(c), record_type: c.record_type, review_status: "clean",
    abc_class: c.abc_class, rfm_segment: c.rfm_segment, lifecycle_status: c.lifecycle_status, client_owner: c.client_owner,
    owner_active: true, lifetime_spend_uzs: c.lifetime_spend_uzs, last_purchase_at: c.last_purchase_at,
    added_by_hand: c.added_by_hand, how_met: c.how_met };
}
function crmCard(id) {
  const c = crm.clients.find((x) => x.client_id === id);
  const lines = crm.tx[id] || [];
  const by_brand = {}, by_category = {};
  for (const l of lines) {
    (by_brand[l.brand] = by_brand[l.brand] || { lines: 0, net: 0 }); by_brand[l.brand].lines++; by_brand[l.brand].net += l.net_uzs;
    (by_category[l.category] = by_category[l.category] || { lines: 0, net: 0 }); by_category[l.category].lines++; by_category[l.category].net += l.net_uzs;
  }
  return {
    client: { ...c, historic_owner: c.client_owner }, telegram: { chats: [], suggested: [], missed: [] }, contacts: [],
    personal: crm.personal[id] || null, important_dates: crm.dates[id] || [], queue: crmQueue(c), transactions: lines,
    events: crm.events[id] || [], field_meta: {}, duplicates: [],
    rollup: { lines: lines.length, net: lines.reduce((a, l) => a + l.net_uzs, 0), by_brand, by_category },
  };
}
function crmHandle(body) {
  crm.calls.push(body);
  const a = body.action;
  if (a === "unlock") {
    const s = PASSCODES[body.passcode];
    if (!s) return err(401, "That passcode is not right.");
    const u = CRM_USERS[body.passcode];
    if (!u) return err(403, "This account does not have access to the CRM.");
    const token = (Math.random().toString(16).slice(2) + "c".repeat(64)).slice(0, 64);
    crm.sessions.set(token, u);
    return [200, { token, name: u.name, expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), can_edit: u.can_edit }];
  }
  const u = crm.sessions.get(body.token);
  if (!u) return err(401, "That session is not valid. Enter your passcode again.");
  if (a === "ping") return [200, { ok: true, name: u.name, can_edit: u.can_edit, can_import: false, can_export: false, my_rep: u.rep }];
  if (a === "reference") return [200, { name: u.name, can_edit: u.can_edit, can_import: false, can_export: false, my_rep: u.rep,
    sales_reps: CRM_REPS, value_mappings: [], totals: {}, activity: { week: 0, today: 0 } }];
  if (a === "clients") {
    const q = String(body.q || "").trim().toLowerCase(), d = q.replace(/\D/g, "");
    const rows = crm.clients.filter((c) => !q || c.client_id.toLowerCase().includes(q) || String(crmDisplay(c)).toLowerCase().includes(q)
      || (d.length >= 4 && String(c.phone_marketing || "").replace(/\D/g, "").includes(d))).map(crmQueue);
    const lim = body.limit || 50;
    return [200, { rows: rows.slice(0, lim), total: rows.length, limit: lim, offset: 0 }];
  }
  if (a === "client") {
    if (!crm.clients.some((c) => c.client_id === body.id)) return err(404, "No record with that reference.");
    return [200, crmCard(body.id)];
  }
  if (a === "client_add") {
    if (!u.can_edit) return err(403, "Your account can view client records but not change them.");
    const name = String(body.name || "").trim();
    if (name.length < 3) return err(400, "Write the client's name.");
    if (!body.force) {
      const key = (x) => String(x || "").toLowerCase().split(/\s+/).sort().join(" ");
      const hits = crm.clients.filter((c) => key(crmDisplay(c)) === key(name)).map((c) => c.client_id);
      if (hits.length) return err(409, "Already on file: " + hits.join(", ") + ". Open that record, or say it is a different person.");
    }
    const id = "PRS-" + crm.nextPrs++;
    crm.clients.push(crmClient({ client_id: id, record_type: "prospect", in_colibri: false, name_marketing: name,
      abc_class: null, rfm_segment: null, lifecycle_status: null, client_owner: body.owner || "Shared (store)",
      lifetime_spend_uzs: null, added_by_hand: true, how_met: body.how_met || null, phone_marketing: body.phone || null }));
    return [200, crmCard(id)];
  }
  return err(400, "Not in this stand-in yet.");
}

reset();

module.exports = {
  handle, reset, netOf, crmHandle, tkDate,
  get crm() { return crm; },
  get state() { return st; },
  // another till sells the piece behind the page's back
  sellBehind(serial) { const p = st.pieces.find((x) => x.serial === serial); p.state = "sold"; },
  // the manager switches the till on another device
  switchModeBehind(mode) { st.mode = mode; if (mode === "live" && !st.go_live_date) st.go_live_date = tkDate(0); },
};
