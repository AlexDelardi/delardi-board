// Delardi Performance tool — perf-api
//
// The only route between the Performance page and the data: the page holds no database key, and every
// action but health and unlock needs a session token issued in exchange for a passcode.
//
//   1. Unlock checks board_users.can_view_performance, and the session it issues carries can_use_perf
//      and nothing else: a Performance token opens no other tool, and no other tool's token opens this one.
//   2. The right is re-read from board_users on every call.
//   3. Everything is computed by the perf_* database functions (db/migrations/20261120_perf_1_performance.sql).
//      Their refusals (raise exception, SQLSTATE P0001) come back as 409 with the sentence verbatim.
//
// No cost or margin leaves through this function: the perf_* functions do not read them.
//
// The source lives in the repository at perf/src/api/index.ts, the contract in perf/src/api/README.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_HOURS = 8;
const MAX_FAILS_PER_HOUR = 10;

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

// The perf_* functions refuse bad requests with a plain `raise exception`
// (SQLSTATE P0001) and a sentence meant for the person reading; PostgREST
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

function obj(v: unknown, field: string): Record<string, unknown> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpErr(400, `${field} must be an object.`);
  return v as Record<string, unknown>;
}

// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const NO_ACCESS = "This account does not have access to Performance.";

async function requirePerf(token: unknown): Promise<string> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open Performance.");
  const rows = await select(`editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_use_perf`);
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  if (!rows[0].can_use_perf) throw new HttpErr(403, NO_ACCESS);
  // The right as it stands now, not as it stood at unlock.
  const name = rows[0].display_name as string;
  const users = await select(`board_users?name=eq.${encodeURIComponent(name)}&active=is.true&select=can_view_performance`);
  if (!users?.[0]?.can_view_performance) throw new HttpErr(403, NO_ACCESS);
  return name;
}

// "2026-10" or "2026-10-01" → the first day of that month.
function monthIn(v: unknown): string {
  const s = str(v, 10) ?? "";
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(s);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[1]) < 2000 || Number(m[1]) > 2100) throw new HttpErr(400, "month must be YYYY-MM.");
  return `${m[1]}-${m[2]}-01`;
}

function yearIn(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 2000 || v > 2100) throw new HttpErr(400, "year must be a year, as a number.");
  return v;
}

// A whole number, zero or more, or null when left empty.
function countIn(v: unknown, field: string, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max) throw new HttpErr(400, `${field} must be a whole number, zero or more.`);
  return v;
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
    const fails = await select(`auth_attempts?ip=eq.${encodeURIComponent(ip)}&ok=is.false&created_at=gte.${since}&select=id`);
    if ((fails?.length ?? 0) >= MAX_FAILS_PER_HOUR) throw new HttpErr(429, "Too many failed attempts. Try again in an hour.");
    const hash = await sha256hex(str(body.passcode, 200) ?? "");
    const matches = await select(`board_users?passcode_hash=eq.${hash}&active=is.true&select=name,can_view_performance`);
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    if (!user.can_view_performance) throw new HttpErr(403, NO_ACCESS);
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    // A Performance session opens Performance only: every other area's flag is false.
    await insert("editor_sessions", {
      token, display_name: user.name, expires_at: expires, can_use_perf: true,
      can_use_stock: false, can_use_sales: false,
      can_view_crm: false, can_edit_crm: false, can_view_board: false, can_view_catalogue: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires };
  }

  if (action === "ping") {
    const name = await requirePerf(body.token);
    return { ok: true, name };
  }

  // The months that have tickets, for the month picker.
  if (action === "span") {
    await requirePerf(body.token);
    return await rpc("perf_span", {});
  }

  // Everything the month screen shows.
  if (action === "month") {
    await requirePerf(body.token);
    return await rpc("perf_month", { p_month: monthIn(body.month) });
  }

  // The year month by month, to date against last year and plan.
  if (action === "year") {
    await requirePerf(body.token);
    return await rpc("perf_year", { p_year: yearIn(body.year) });
  }

  // Sales, stock and arrivals by brand, for one month or one year.
  if (action === "brands") {
    await requirePerf(body.token);
    if (body.month !== undefined && body.month !== null) {
      const from = monthIn(body.month);
      const d = new Date(from + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + 1);
      return await rpc("perf_brands", { p_from: from, p_to: d.toISOString().slice(0, 10) });
    }
    const y = yearIn(body.year);
    return await rpc("perf_brands", { p_from: `${y}-01-01`, p_to: `${y + 1}-01-01` });
  }

  // The month's inputs: what is sent replaces what was there. → the month, recomputed.
  if (action === "save_month") {
    const name = await requirePerf(body.token);
    const inp = obj(body.inputs, "inputs");
    const fx = inp.fx === null || inp.fx === undefined || inp.fx === "" ? null : inp.fx;
    if (fx !== null && (typeof fx !== "number" || !Number.isFinite(fx) || fx <= 0 || fx > 1_000_000)) throw new HttpErr(400, "fx must be a number above zero.");
    if (inp.sellers !== undefined && inp.sellers !== null && (!Array.isArray(inp.sellers) || inp.sellers.length > 40)) throw new HttpErr(400, "sellers must be a list.");
    const sellers = ((inp.sellers as unknown[]) ?? []).map((x) => {
      const o = obj(x, "seller");
      const counts = obj(o.programme_counts, "programme_counts");
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(counts)) {
        if (v === null || v === undefined || v === "") continue;
        if (k.length > 40) throw new HttpErr(400, "A programme key is too long.");
        clean[k] = countIn(v, "A programme count", 9999) as number;
      }
      return {
        seller: str(o.seller, 80), plan_uzs: countIn(o.plan_uzs, "plan_uzs", 1e15), commission: o.commission !== false,
        programme_counts: clean, paid_uzs: countIn(o.paid_uzs, "paid_uzs", 1e15),
      };
    }).filter((x) => x.seller !== null);
    const rawNote = inp.note === null || inp.note === undefined ? "" : String(inp.note);
    if (rawNote.trim().length > 500) throw new HttpErr(400, "The note can be at most 500 characters.");
    return await rpc("perf_save_month", {
      p: {
        month: monthIn(body.month),
        plan_uzs: countIn(inp.plan_uzs, "plan_uzs", 1e15), plan_tickets: countIn(inp.plan_tickets, "plan_tickets", 100000),
        plan_large_tickets: countIn(inp.plan_large_tickets, "plan_large_tickets", 100000), plan_large_uzs: countIn(inp.plan_large_uzs, "plan_large_uzs", 1e15),
        visits: countIn(inp.visits, "visits", 1000000), visits_appointment: countIn(inp.visits_appointment, "visits_appointment", 1000000),
        fx, note: str(rawNote, 500), sellers,
      },
      p_actor: name,
    });
  }

  // Correct how one ticket is counted (basis, seller, client); all empty takes the correction back. → the month, recomputed.
  if (action === "mark_ticket") {
    const name = await requirePerf(body.token);
    const id = uuid(body.ticket_id, "ticket");
    const m = obj(body.mark, "mark");
    const rawNote = m.note === null || m.note === undefined ? "" : String(m.note);
    if (rawNote.trim().length > 300) throw new HttpErr(400, "The note can be at most 300 characters.");
    await rpc("perf_mark_ticket", {
      p_ticket: id, p: { basis: str(m.basis, 20), seller: str(m.seller, 80), client_id: str(m.client_id, 20), note: str(rawNote, 300) }, p_actor: name,
    });
    return await rpc("perf_month", { p_month: monthIn(body.month) });
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
    if (status >= 500) console.error("perf-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
