// Delardi home page — hub-api: the single sign-in.
//
// One passcode, entered once on the home page, gives one session that every tool accepts.
//
//   1. Unlock takes any active login. The session it issues is marked shared and carries every tool's flag, so each
//      tool's API will hear it out. The flags give nothing by themselves: each API reads the person's rights in
//      board_users on every request and decides, exactly as it does for its own sessions. A right taken away, or a
//      person switched off, takes effect at once.
//   2. "me" says which tools the person may open now (hub_tools in the database, the same rule as each API's door), so
//      the home page can grey out the rest.
//   3. "open" records that a tool was opened with the shared session (hub_open): the login log's line.
//   4. "lock" ends the session everywhere.
//
// The database side is db/migrations/20261125_hub_1_single_login.sql. The source lives in the repository at
// home/api/index.ts.

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

// The hub_* functions refuse bad requests with a plain `raise exception`
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


// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}


const del = (path: string) => db(path, { method: "DELETE", headers: { Prefer: "return=minimal" } });

const SIGN_IN = "Sign in to continue.";
const TOOLS = ["sales", "stock", "crm", "catalogue", "tasks", "perf", "access"];

interface Shared { token: string; name: string; expires_at: string }

async function requireShared(token: unknown): Promise<Shared> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, SIGN_IN);
  const rows = await select(`editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,shared`);
  // A tool's own session is not a home-page session.
  if (!rows?.length || !rows[0].shared) throw new HttpErr(401, SIGN_IN);
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new HttpErr(401, "Your session has expired. Sign in again.");
  return { token: t, name: rows[0].display_name as string, expires_at: rows[0].expires_at as string };
}

// Which tools the person may open now. Switched off since sign-in: the session is over.
async function toolsOf(name: string): Promise<Record<string, boolean>> {
  const t = await rpc("hub_tools", { p_name: name });
  if (!t || typeof t !== "object") throw new HttpErr(401, SIGN_IN);
  return t as Record<string, boolean>;
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
    // The person is found by board_users.signin_hash, a name only this function knows: the tools' own passcode
    // entrances still ask for the old name (passcode_hash) and find no one. The old name is tried here only until
    // the column is renamed (db/migrations/20261203_signin_hash.sql); after that the second try fails and is not reached.
    let matches;
    try {
      matches = await select(`board_users?signin_hash=eq.${hash}&active=is.true&select=name`);
    } catch (_e) {
      matches = await select(`board_users?passcode_hash=eq.${hash}&active=is.true&select=name`);
    }
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    const tools = await toolsOf(user.name);
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    // Every tool's flag, so every tool's API hears the session out; each then reads the person's rights and decides.
    // The retired Weekly Board is not among them.
    await insert("editor_sessions", {
      token, display_name: user.name, expires_at: expires, shared: true, ip,
      can_use_sales: true, can_use_stock: true, can_use_perf: true, can_use_tasks: true, can_use_access: true,
      can_view_crm: true, can_edit_crm: true, can_view_catalogue: true, can_view_board: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires, tools };
  }

  // End the session everywhere. Only a home-page session can be ended here, and only by the one who holds it.
  if (action === "lock") {
    const t = str(body.token, 100);
    if (t && t.length >= 20) await del(`editor_sessions?token=eq.${encodeURIComponent(t)}&shared=is.true`);
    return { ok: true };
  }

  const s = await requireShared(body.token);

  // Who I am and what I may open, as it stands now.
  if (action === "me") return { name: s.name, expires_at: s.expires_at, tools: await toolsOf(s.name) };

  // A tool was opened with this session: the login log's line. → whether the person may open it.
  if (action === "open") {
    const tool = str(body.tool, 20) ?? "";
    if (!TOOLS.includes(tool)) throw new HttpErr(400, "That is not a tool.");
    return { ok: true, allowed: (await rpc("hub_open", { p_name: s.name, p_tool: tool, p_ip: clientIp(req) })) === true };
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
    if (status >= 500) console.error("hub-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
