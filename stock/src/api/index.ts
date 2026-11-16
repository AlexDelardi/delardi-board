// Delardi Stock tool — stock-api
//
// Same shape as sales-api: this function is the only route between the Stock
// page and the data, the page holds no database key, and every action but
// health and unlock needs a session token issued in exchange for a passcode.
//
//   1. Unlock checks board_users.can_view_stock, and the session it issues
//      carries can_use_stock and nothing else, so a Stock token opens no other
//      area and no other area's token opens Stock.
//   2. Rights (view, manage, cost, and the CRM view right) are re-read from
//      board_users on every call. Without the CRM view right a login sees a
//      held piece's client by reference only (no name).
//   3. Reads are the stk_* database functions. The only writes are
//      ops_set_state and ops_resolve_review, which check manage_stock
//      themselves; their refusals (raise exception, SQLSTATE P0001) come back
//      as 409 with the sentence verbatim, because they are written for the screen.
//
// Cost, purchase price, landed cost and margin leave through one action only,
// `cost`, which needs the separate view-cost right (board_users.can_view_cost).
// No other action reads them: the other stk_* functions return none.
//
// The source of this function lives in the repository at stock/src/api/index.ts
// and the contract the page relies on in stock/src/api/README.md. Deploying is
// the only way it reaches Supabase, so the two are kept identical.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_HOURS = 8;
const MAX_FAILS_PER_HOUR = 10;
const STATES = ["in_transit", "in_stock", "reserved", "booked_out", "damaged", "sold", "not_received"];
const SETTABLE = ["in_stock", "reserved", "booked_out", "damaged"];

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

// The stk_* and ops_* functions refuse bad requests with a plain `raise exception`
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

// A calendar date as YYYY-MM-DD that really exists (2026-02-31 does not).
function dateOrNull(v: unknown, field: string): string | null {
  const s = str(v, 10);
  if (s === null) return null;
  let ok = false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    // An impossible date (2026-13-45) is an Invalid Date, and toISOString would throw on it.
    ok = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
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

// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

interface Rights { view: boolean; manage: boolean; crm: boolean; cost: boolean }
type Need = "view" | "manage" | "cost";

interface Session {
  name: string;
  rights: Rights;
}

const RIGHT_COLUMNS = "can_view_stock,can_manage_stock,can_view_crm,can_view_cost";
const NO_ACCESS = "This account does not have access to Stock.";
const NEED_MESSAGES: Record<Need, string> = {
  view: "Your account cannot look up stock.",
  manage: "Your account cannot change stock.",
  cost: "Your account cannot see cost.",
};

function rightsOf(u: Record<string, unknown>): Rights {
  return { view: !!u.can_view_stock, manage: !!u.can_manage_stock, crm: !!u.can_view_crm, cost: !!u.can_view_cost };
}

async function requireStock(token: unknown, need?: Need): Promise<Session> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open Stock.");
  const rows = await select(
    `editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_use_stock`,
  );
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  // A CRM, board, catalogue or Sales session is not a Stock session.
  if (!rows[0].can_use_stock) throw new HttpErr(403, NO_ACCESS);
  // Rights as they stand now, not as they stood at unlock.
  const name = rows[0].display_name as string;
  const users = await select(
    `board_users?name=eq.${encodeURIComponent(name)}&active=is.true&select=${RIGHT_COLUMNS}`,
  );
  const user = users?.[0];
  if (!user) throw new HttpErr(403, NO_ACCESS);
  const rights = rightsOf(user);
  if (!rights.view) throw new HttpErr(403, NO_ACCESS);
  if (need && !rights[need]) throw new HttpErr(403, NEED_MESSAGES[need]);
  return { name, rights };
}

// The filters for stk_piece_list / stk_export, rebuilt with only the keys the
// database reads. Empty values are left out.
function filtersIn(v: unknown): Record<string, unknown> {
  const f = obj(v, "filters");
  const out: Record<string, unknown> = {};
  const text = (k: string, max: number) => {
    const raw = f[k];
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") throw new HttpErr(400, `${k} must be text.`);
    if (raw.trim().length > max) throw new HttpErr(400, `${k} can be at most ${max} characters.`);
    return str(raw, max);
  };
  const q = text("q", 80);
  if (q !== null) out.q = q;
  const brand = text("brand", 80);
  if (brand !== null) out.brand = brand;
  const category = text("category", 80);
  if (category !== null) out.category = category;
  if (f.states !== null && f.states !== undefined) {
    if (!Array.isArray(f.states) || f.states.some((s) => typeof s !== "string" || !STATES.includes(s))) {
      throw new HttpErr(400, `states must be a list of: ${STATES.join(", ")}.`);
    }
    if (f.states.length > 0) out.states = [...new Set(f.states as string[])];
  }
  for (const k of ["price_min", "price_max"]) {
    const raw = f[k];
    if (raw === null || raw === undefined || raw === "") continue;
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) {
      throw new HttpErr(400, `${k} must be a whole number, zero or more.`);
    }
    out[k] = raw;
  }
  if (f.page !== null && f.page !== undefined && f.page !== "") {
    out.page = Math.min(posInt(f.page, "page"), 100000);
  }
  return out;
}

// A piece's detail as the page gets it. Without the CRM view right the held
// client's name goes; hold_client_id (the reference) stays.
async function pieceDetail(sess: Session, id: string) {
  const doc = await rpc("stk_piece_detail", { p_piece: id });
  if (!doc) throw new HttpErr(404, "No piece with that reference.");
  if (!sess.rights.crm) delete doc.client_name;
  return doc;
}

// ------------------------------------------------------------------ actions
async function handle(req: Request, body: Record<string, unknown>) {
  const action = str(body.action, 40);

  if (action === "health") {
    await select("board_users?select=name&limit=1");
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
    if (!rights.view) throw new HttpErr(403, NO_ACCESS);

    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    // A Stock session opens Stock only: every other area's flag is false.
    await insert("editor_sessions", {
      token,
      display_name: user.name,
      expires_at: expires,
      can_use_stock: true,
      can_use_sales: false,
      can_view_crm: false, can_edit_crm: false, can_view_board: false, can_view_catalogue: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires, rights };
  }

  if (action === "ping") {
    const sess = await requireStock(body.token);
    return { ok: true, name: sess.name, rights: sess.rights };
  }

  // ------------------------------------------------------------- view right
  if (action === "facets") {
    await requireStock(body.token, "view");
    return await rpc("stk_facets", {});
  }

  if (action === "list") {
    await requireStock(body.token, "view");
    return await rpc("stk_piece_list", { p: filtersIn(body.filters) });
  }

  if (action === "piece") {
    const sess = await requireStock(body.token, "view");
    return await pieceDetail(sess, uuid(body.piece_id, "piece"));
  }

  // Where the piece came from, its codes and its Colibri record. No money.
  if (action === "origin") {
    await requireStock(body.token, "view");
    const doc = await rpc("stk_piece_origin", { p_piece: uuid(body.piece_id, "piece") });
    if (!doc) throw new HttpErr(404, "No piece with that reference.");
    return doc;
  }

  // ------------------------------------------------------------- cost right
  // The only action that returns cost or margin.
  if (action === "cost") {
    await requireStock(body.token, "cost");
    const doc = await rpc("stk_piece_cost", { p_piece: uuid(body.piece_id, "piece") });
    if (!doc) throw new HttpErr(404, "No piece with that reference.");
    return doc;
  }

  if (action === "reviews") {
    await requireStock(body.token, "view");
    return await rpc("stk_review_list", {});
  }

  if (action === "export") {
    await requireStock(body.token, "view");
    const rows = await rpc("stk_export", { p: filtersIn(body.filters) });
    return { rows: rows ?? [] };
  }

  // ----------------------------------------------------------- manage right
  if (action === "set_state") {
    const sess = await requireStock(body.token, "manage");
    const id = uuid(body.piece_id, "piece");
    const state = str(body.state, 40);
    if (!state || !SETTABLE.includes(state)) throw new HttpErr(400, `state must be one of ${SETTABLE.join(", ")}.`);
    const rawNote = body.note === null || body.note === undefined ? "" : String(body.note);
    if (rawNote.trim().length > 500) throw new HttpErr(400, "The note can be at most 500 characters.");
    const note = str(rawNote, 500);
    if (state === "booked_out" && !note) throw new HttpErr(400, "Write who has it and why.");
    if (state === "damaged" && !note) throw new HttpErr(400, "Write what is wrong.");
    const rawClient = body.client_id === null || body.client_id === undefined ? "" : String(body.client_id);
    if (rawClient.trim().length > 20) throw new HttpErr(400, "client_id can be at most 20 characters.");
    const holds = state === "reserved" || state === "booked_out";
    let client = holds ? str(rawClient, 20) : null;
    if (client) {
      // ops_move_state does not check the client and hold_client_id has a foreign key,
      // so an unknown reference would surface as a 23503 and a 500. Check it here.
      client = client.toUpperCase();
      const found = await select(`crm_clients?client_id=eq.${encodeURIComponent(client)}&select=client_id`);
      if (!Array.isArray(found) || found.length === 0) throw new HttpErr(409, "No client with that reference.");
    }
    const until = holds ? dateOrNull(body.until, "until") : null;
    await rpc("ops_set_state", {
      p_piece: id, p_state: state, p_actor: sess.name, p_note: note, p_client: client, p_until: until,
    });
    return await pieceDetail(sess, id);
  }

  if (action === "resolve") {
    const sess = await requireStock(body.token, "manage");
    const review = posInt(body.review_id, "review");
    const resolution = str(body.resolution, 40);
    if (!resolution) throw new HttpErr(400, "Say how the review is resolved.");
    const rawNote = body.note === null || body.note === undefined ? "" : String(body.note);
    if (rawNote.trim().length > 500) throw new HttpErr(400, "The note can be at most 500 characters.");
    await rpc("ops_resolve_review", {
      p_review: review, p_resolution: resolution, p_actor: sess.name, p_note: str(rawNote, 500),
    });
    return { ok: true };
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
    if (status >= 500) console.error("stock-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
