// Delardi Sales tool (till) — sales-api
//
// Same shape as crm-api: this function is the only route between the Sales
// page and the data, the page holds no database key, and every action but
// health and unlock needs a session token issued in exchange for a passcode.
//
//   1. Unlock checks board_users.can_view_sales / can_post_sales, and the
//      session it issues carries can_use_sales and nothing else, so a Sales
//      token opens no other area and no other area's token opens Sales.
//   2. Rights (view, post, void, manage the till, and the CRM view right) are
//      re-read from board_users on every call. Without the CRM view right a
//      login sees clients by reference only (no name, no raw Colibri client
//      text, no name on a receipt) and can post or suspend Walk-in sales only.
//   3. The work is done by the pos_* database functions; their refusals
//      (raise exception, SQLSTATE P0001) come back as 409 with the sentence
//      verbatim, because they are written for the screen.
//
// Sales people reach the page only as the label crm_sales_reps holds for them.
// The pos_* functions speak Colibri source names; the mapping happens here, on
// the way out (and, for the ticket list's seller filter, on the way in). Sellers
// on a sale go in as labels and the database maps them itself.
//
// No cost, invoice, landed-price or margin column is ever selected here.
//
// The source of this function lives in the repository at sales/src/api/index.ts
// and the contract the page relies on in sales/src/api/README.md. Deploying is
// the only way it reaches Supabase, so the two are kept identical.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_HOURS = 8;
const MAX_FAILS_PER_HOUR = 10;
const TICKET_PAGE_SIZE = 50; // fixed in pos_ticket_list
const MAX_LINES = 50;
const MAX_PAYMENTS = 10;
const MODES = ["training", "live"];
const TICKET_SOURCES = ["colibri", "delardi"];
const TICKET_STATUSES = ["posted", "void"];

// What a ticket, its lines and a list row may carry out of here. pos_ticket_detail already
// drops seller_raw, card_no, source_file and extra; this list is the second
// lock, so a column added to the tables later stays in until named here.
const TICKET_KEYS = [
  "ticket_id", "store_id", "source", "ticket_no", "sold_at", "seller", "client_id", "client_raw", "walk_in",
  "entered_by", "note", "fiscal_ref", "status", "receipt_text", "void_reason", "voided_by", "voided_at",
  "loaded_at", "updated_at",
];
const LINE_KEYS = [
  "line_id", "line_no", "kind", "article", "colour", "item_name", "brand_raw", "size", "model_id", "variant_id",
  "piece_id", "serial_raw", "qty", "price_list", "price_current", "discount_pct", "discount_amt", "net", "seller",
];
const PAYMENT_KEYS = ["payment_id", "method", "amount", "raw", "card_type"];
const LIST_ROW_KEYS = [
  "ticket_id", "ticket_no", "source", "sold_at", "status", "seller", "client_id", "client_name", "walk_in", "items",
  "lines", "net",
];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

class HttpErr extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- db helpers
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpErr(500, `database rejected the request (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

const select = (path: string) => db(path);

const insert = (table: string, row: unknown, prefer = "return=representation") =>
  db(table, { method: "POST", body: JSON.stringify(row), headers: { Prefer: prefer } });

// The pos_* functions refuse bad requests with a plain `raise exception`
// (SQLSTATE P0001) and a sentence meant for the person at the till; PostgREST
// returns it as {code, message, …}, and it goes to the page as 409 with that
// message verbatim. Anything else is a fault and stays a 500.
async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    let err: { code?: string; message?: string } = {};
    try { err = JSON.parse(text); } catch { /* not JSON */ }
    if (err.code === "P0001" && err.message) throw new HttpErr(409, err.message);
    throw new HttpErr(500, `database rejected the request (${res.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// ------------------------------------------------------------- sanitisation
const NUL_RE = new RegExp(String.fromCharCode(0), "g");
function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(NUL_RE, "").trim();
  return s ? s.slice(0, max) : null;
}

function enumOrNull(v: unknown, allowed: string[], field: string): string | null {
  const s = str(v, 40);
  if (s === null) return null;
  if (!allowed.includes(s)) throw new HttpErr(400, `${field} must be one of ${allowed.join(", ")}`);
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, what: string): string {
  const s = str(v, 40) ?? "";
  if (!UUID_RE.test(s)) throw new HttpErr(400, `That is not a valid ${what} reference.`);
  return s.toLowerCase();
}

function posInt(v: unknown, what: string): number {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) throw new HttpErr(400, `That is not a valid ${what}.`);
  return n;
}

// A number the database will cast: a JSON number, or a plain decimal string.
// Range and whole-so'm checks stay in the pos_* functions, which word them for
// the screen; this only stops text that would make the cast itself fail.
function num(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "number" ? v : (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN);
  if (typeof s !== "number" || !Number.isFinite(s)) throw new HttpErr(400, `${field} must be a number.`);
  return s;
}

function bool(v: unknown, field: string): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v !== "boolean") throw new HttpErr(400, `${field} must be true or false.`);
  return v;
}

// A calendar date as YYYY-MM-DD that really exists (2026-02-31 does not).
function dateOrNull(v: unknown, field: string): string | null {
  const s = str(v, 10);
  if (s === null) return null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!ok) throw new HttpErr(400, `${field} must be a date as YYYY-MM-DD.`);
  return s;
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpErr(400, `${field} must be an object.`);
  return v as Record<string, unknown>;
}

function pick(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in row) out[k] = row[k];
  return out;
}

// A sale as the page sends it, rebuilt with only the fields the pos_* functions
// read. Sellers stay labels: pos_post_sale and pos_suspend map them themselves.
function saleIn(v: unknown, withPayments: boolean): Record<string, unknown> {
  const s = obj(v, "sale");
  if (!Array.isArray(s.lines) || s.lines.length === 0) throw new HttpErr(400, "Add at least one piece.");
  if (s.lines.length > MAX_LINES) throw new HttpErr(400, `A sale can hold at most ${MAX_LINES} pieces.`);
  const lines = s.lines.map((x) => {
    const l = obj(x, "a line");
    return {
      piece_id: uuid(l.piece_id, "piece"),
      price_uzs: num(l.price_uzs, "price_uzs"),
      discount_pct: num(l.discount_pct, "discount_pct") ?? 0,
      seller: str(l.seller, 80),
    };
  });
  const out: Record<string, unknown> = {
    client_id: str(s.client_id, 20),
    walk_in: bool(s.walk_in, "walk_in"),
    seller: str(s.seller, 80),
    fiscal_ref: str(s.fiscal_ref, 60),
    draft_id: s.draft_id === null || s.draft_id === undefined || s.draft_id === "" ? null : posInt(s.draft_id, "suspended sale"),
    lines,
  };
  if (withPayments) {
    const pays = s.payments === undefined || s.payments === null ? [] : s.payments;
    if (!Array.isArray(pays)) throw new HttpErr(400, "payments must be a list.");
    if (pays.length > MAX_PAYMENTS) throw new HttpErr(400, `A sale can take at most ${MAX_PAYMENTS} payments.`);
    out.payments = pays.map((x) => {
      const p = obj(x, "a payment");
      return { method: str(p.method, 20), card_type: str(p.card_type, 20), amount: num(p.amount, "amount") };
    });
  }
  return out;
}

// ------------------------------------------------------------- sales rep names
// Colibri holds real staff names; the till speaks in labels. One lookup per
// request that needs it, both ways.
interface RepMap {
  toLabel: Map<string, string>;          // source_name → label
  sourcesByLabel: Map<string, string[]>;  // lower-cased label → source_names carrying it
}

async function repMap(): Promise<RepMap> {
  const rows = (await select("crm_sales_reps?select=source_name,label")) as
    Array<{ source_name: string; label: string }>;
  const toLabel = new Map<string, string>();
  const sourcesByLabel = new Map<string, string[]>();
  for (const r of rows ?? []) {
    toLabel.set(r.source_name, r.label);
    const k = r.label.trim().toLowerCase();
    sourcesByLabel.set(k, [...(sourcesByLabel.get(k) ?? []), r.source_name]);
  }
  return { toLabel, sourcesByLabel };
}

// A seller going out: a rep's label, "Unassigned" for a name that is no rep,
// null when there is no seller (a line whose seller is the ticket's).
const asLabel = (m: RepMap, name: unknown): string | null => {
  const s = str(name, 80);
  return s === null ? null : (m.toLabel.get(s) ?? "Unassigned");
};

// Who did something. The team signs in under their own names; where that name
// is also a sales rep in the Colibri data, it goes out as the rep's label.
const actorLabel = (m: RepMap, name: unknown): string | null => {
  const s = str(name, 80);
  return s === null ? null : (m.toLabel.get(s) ?? s);
};

// A seller label coming in (the ticket list filter) → the rep it names.
function labelToRep(m: RepMap, label: string): string {
  const reps = m.sourcesByLabel.get(label.trim().toLowerCase()) ?? [];
  if (reps.length !== 1) throw new HttpErr(400, `No single sales rep is called ${label}.`);
  return reps[0];
}

// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

interface Rights { view: boolean; post: boolean; void: boolean; manage: boolean; crm: boolean }
type Need = keyof Rights;

interface Session {
  name: string;
  rights: Rights;
}

const RIGHT_COLUMNS = "can_view_sales,can_post_sales,can_void_sales,can_manage_till,can_view_crm";
const NO_ACCESS = "This account does not have access to Sales.";
const NEED_MESSAGES: Record<Need, string> = {
  view: "Your account cannot look up sales.",
  post: "Your account cannot make sales.",
  void: "Your account cannot void sales.",
  manage: "Your account cannot manage the till.",
  crm: "Your account cannot attach clients — use Walk-in.",
};

function rightsOf(u: Record<string, unknown>): Rights {
  return {
    view: !!u.can_view_sales,
    post: !!u.can_post_sales,
    void: !!u.can_void_sales,
    manage: !!u.can_manage_till,
    crm: !!u.can_view_crm,
  };
}

async function requireSales(token: unknown, need?: Need): Promise<Session> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the till.");
  const rows = await select(
    `editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_use_sales`,
  );
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  // A CRM, board or catalogue session is not a Sales session.
  if (!rows[0].can_use_sales) throw new HttpErr(403, NO_ACCESS);
  // Rights as they stand now, not as they stood at unlock.
  const name = rows[0].display_name as string;
  const users = await select(
    `board_users?name=eq.${encodeURIComponent(name)}&active=is.true&select=${RIGHT_COLUMNS}`,
  );
  const user = users?.[0];
  if (!user) throw new HttpErr(403, NO_ACCESS);
  const rights = rightsOf(user);
  if (!rights.view && !rights.post) throw new HttpErr(403, NO_ACCESS);
  if (need && !rights[need]) throw new HttpErr(403, NEED_MESSAGES[need]);
  return { name, rights };
}

interface Settings {
  mode: string;
  go_live_date: string | null;
  vat_pct: number;
  cash_notice_uzs: number;
  shop_address: string;
}

async function settings(): Promise<Settings> {
  const rows = await select("pos_settings?id=eq.1&select=mode,go_live_date,vat_pct,cash_notice_uzs,shop_address");
  if (!rows?.length) throw new HttpErr(500, "pos_settings has no row");
  const r = rows[0];
  return {
    mode: r.mode,
    go_live_date: r.go_live_date ?? null,
    vat_pct: Number(r.vat_pct),
    cash_notice_uzs: Number(r.cash_notice_uzs),
    shop_address: r.shop_address ?? "",
  };
}

// A suspended sale the page cancels must be one of the current mode's. (Posting
// one is checked by pos_post_sale itself, under a lock.)
async function requireDraftInMode(draftId: number, mode: string) {
  const rows = await select(`pos_drafts?draft_id=eq.${draftId}&mode=eq.${mode}&select=draft_id`);
  if (!rows?.length) throw new HttpErr(409, `suspended sale ${draftId} not found`);
}

// The mode the page shows, sent with post and suspend; pos_post_sale and
// pos_suspend refuse it under their lock when the till has been switched since.
function expectMode(v: unknown): string {
  const m = enumOrNull(v, MODES, "expect_mode");
  if (!m) throw new HttpErr(400, "Reload the page: it did not say which mode it shows.");
  return m;
}

// Without the CRM view right a sale may not name a client.
function requireWalkInUnlessCrm(sess: Session, sale: Record<string, unknown>) {
  if (!sess.rights.crm && sale.client_id !== null) throw new HttpErr(403, NEED_MESSAGES.crm);
}

// Client data a login without the CRM view right may not see: the client's
// name and Colibri's raw client text go; the reference stays. The receipt's
// "Client: <name>" line (Russian receipts: "Клиент: <name>") becomes the client_id (Walk-in stays).
function receiptWithoutName(text: unknown, clientId: unknown): unknown {
  if (typeof text !== "string" || clientId === null || clientId === undefined || clientId === "") return text;
  return text.replace(/^(Client|Клиент): .*$/m, (_m, k) => `${k}: ${clientId}`);
}

// ------------------------------------------------------------------ actions
async function handle(req: Request, body: Record<string, unknown>) {
  const action = str(body.action, 40);

  if (action === "health") {
    await select("pos_settings?select=mode&limit=1");
    return { ok: true };
  }

  if (action === "unlock") {
    const ip = clientIp(req);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const fails = await select(
      `auth_attempts?ip=eq.${encodeURIComponent(ip)}&ok=is.false&created_at=gte.${since}&select=id`,
    );
    if ((fails?.length ?? 0) >= MAX_FAILS_PER_HOUR) {
      throw new HttpErr(429, "Too many failed attempts. Try again in an hour.");
    }

    const supplied = str(body.passcode, 200) ?? "";
    const hash = await sha256hex(supplied);
    const matches = await select(
      `board_users?passcode_hash=eq.${hash}&active=is.true&select=name,${RIGHT_COLUMNS}`,
    );
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    const rights = rightsOf(user);
    if (!rights.view && !rights.post) throw new HttpErr(403, NO_ACCESS);

    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    // A Sales session opens Sales only: every other area's flag is false.
    await insert("editor_sessions", {
      token,
      display_name: user.name,
      expires_at: expires,
      can_use_sales: true,
      can_view_crm: false, can_edit_crm: false, can_view_board: false, can_view_catalogue: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires, rights };
  }

  if (action === "ping") {
    const sess = await requireSales(body.token);
    const s = await settings();
    return { ok: true, name: sess.name, rights: sess.rights, mode: s.mode };
  }

  if (action === "reference") {
    const sess = await requireSales(body.token);
    const [s, reps] = await Promise.all([
      settings(),
      select("crm_sales_reps?active=is.true&select=label&order=label"),
    ]);
    const sellers = [...new Set(((reps ?? []) as Array<{ label: string }>).map((r) => r.label))];
    return {
      mode: s.mode, go_live_date: s.go_live_date, vat_pct: s.vat_pct, cash_notice_uzs: s.cash_notice_uzs,
      shop_address: s.shop_address, sellers, rights: sess.rights,
    };
  }

  // ------------------------------------------------------------- post right
  if (action === "search") {
    await requireSales(body.token, "post");
    const s = await settings();
    const q = str(body.q, 80);
    const pieces = q === null ? [] : await rpc("pos_search_pieces", { p_q: q, p_mode: s.mode });
    return { mode: s.mode, pieces: pieces ?? [] };
  }

  if (action === "post") {
    const sess = await requireSales(body.token, "post");
    const sale = saleIn(body.sale, true);
    sale.expect_mode = expectMode(body.expect_mode);
    requireWalkInUnlessCrm(sess, sale);
    return await rpc("pos_post_sale", { p: sale, p_actor: sess.name });
  }

  if (action === "suspend") {
    const sess = await requireSales(body.token, "post");
    const sale = saleIn(body.sale, false);
    sale.expect_mode = expectMode(body.expect_mode);
    requireWalkInUnlessCrm(sess, sale);
    return await rpc("pos_suspend", { p: sale, p_actor: sess.name });
  }

  if (action === "drafts") {
    await requireSales(body.token, "post");
    const [s, reps] = await Promise.all([settings(), repMap()]);
    const drafts = ((await rpc("pos_drafts_list", { p_mode: s.mode })) ?? []) as Array<Record<string, unknown>>;
    // Sellers already come out of pos_drafts_list as labels; who suspended it is a login name.
    return { mode: s.mode, drafts: drafts.map((d) => ({ ...d, created_by: actorLabel(reps, d.created_by) })) };
  }

  if (action === "cancel_draft") {
    const sess = await requireSales(body.token, "post");
    const draftId = posInt(body.draft_id, "suspended sale");
    const s = await settings();
    await requireDraftInMode(draftId, s.mode);
    await rpc("pos_cancel_draft", { p_draft: draftId, p_actor: sess.name });
    return { ok: true };
  }

  // ------------------------------------------------------------- view right
  if (action === "tickets") {
    const sess = await requireSales(body.token, "view");
    const f = obj(body.filters, "filters");
    const training = bool(f.training, "training");
    if (training) {
      const s = await settings();
      if (s.mode !== "training") throw new HttpErr(409, "Test sales are shown only while the till is in training.");
    }
    const reps = await repMap();
    const sellerLabel = str(f.seller, 80);
    const p = {
      q: str(f.q, 80),
      from: dateOrNull(f.from, "from"),
      to: dateOrNull(f.to, "to"),
      seller: sellerLabel === null ? null : labelToRep(reps, sellerLabel),
      source: enumOrNull(f.source, TICKET_SOURCES, "source"),
      status: enumOrNull(f.status, TICKET_STATUSES, "status"),
      training,
      page: f.page === null || f.page === undefined || f.page === "" ? 1 : Math.min(posInt(f.page, "page"), 100000),
    };
    const res = (await rpc("pos_ticket_list", { p })) ?? {};
    const rows = ((res.rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const out = pick(r, LIST_ROW_KEYS);
      out.seller = asLabel(reps, out.seller);
      if (!sess.rights.crm) delete out.client_name;
      return out;
    });
    return {
      count: res.count ?? 0, void_count: res.void_count ?? 0, net_total: res.net_total ?? 0,
      page: res.page ?? p.page, page_size: TICKET_PAGE_SIZE, rows,
    };
  }

  if (action === "ticket") {
    const sess = await requireSales(body.token, "view");
    const id = uuid(body.ticket_id, "sale");
    const [doc, reps] = await Promise.all([rpc("pos_ticket_detail", { p_ticket: id }), repMap()]);
    if (!doc?.ticket) throw new HttpErr(404, "No sale with that reference.");
    const t = pick(doc.ticket, TICKET_KEYS);
    // The stored receipt is the English copy made at posting; the till asks for the
    // language it shows ("ru" or "en"), printed fresh from the same ticket.
    if (body.lang === "ru" && typeof t.receipt_text === "string" && t.receipt_text) {
      t.receipt_text = await rpc("pos_receipt_text", { p_ticket: id, p_lang: "ru" });
    }
    t.seller = asLabel(reps, t.seller);
    t.entered_by = actorLabel(reps, t.entered_by);
    t.voided_by = actorLabel(reps, t.voided_by);
    const lines = ((doc.lines ?? []) as Array<Record<string, unknown>>).map((l) => {
      const out = pick(l, LINE_KEYS);
      out.seller = asLabel(reps, out.seller);
      return out;
    });
    const payments = ((doc.payments ?? []) as Array<Record<string, unknown>>).map((y) => pick(y, PAYMENT_KEYS));
    if (!sess.rights.crm) {
      delete t.client_raw;
      t.receipt_text = receiptWithoutName(t.receipt_text, t.client_id);
      return { ticket: t, lines, payments };
    }
    return { ticket: t, lines, payments, client_name: doc.client_name ?? null };
  }

  if (action === "ticket_by_line") {
    await requireSales(body.token, "view");
    const line = uuid(body.line_id, "sale line");
    const ticketId = await rpc("pos_ticket_by_line", { p_line: line });
    if (!ticketId) throw new HttpErr(404, "No sale with that line.");
    return { ticket_id: ticketId };
  }

  // ------------------------------------------------------------- void right
  if (action === "void") {
    const sess = await requireSales(body.token, "void");
    const id = uuid(body.ticket_id, "sale");
    const reason = str(body.reason, 500);
    if (!reason) throw new HttpErr(400, "Write the reason for the void.");
    return await rpc("pos_void_ticket", { p_ticket: id, p_reason: reason, p_actor: sess.name });
  }

  // ----------------------------------------------------------- manage right
  if (action === "set_mode") {
    const sess = await requireSales(body.token, "manage");
    const mode = enumOrNull(body.mode, MODES, "mode");
    if (!mode) throw new HttpErr(400, "Say which mode: training or live.");
    return await rpc("pos_set_mode", { p_mode: mode, p_actor: sess.name });
  }

  if (action === "clear_training") {
    const sess = await requireSales(body.token, "manage");
    return await rpc("pos_clear_training", { p_actor: sess.name });
  }

  throw new HttpErr(400, `Unknown action: ${action}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Body must be a JSON object." }, 400);
    }
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  try {
    return json(await handle(req, body));
  } catch (err) {
    const status = err instanceof HttpErr ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    if (status >= 500) console.error("sales-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
