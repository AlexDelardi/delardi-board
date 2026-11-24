// Delardi task tracker — tasks-api
//
// The only route between the tracker's page and the data: the page holds no database key, and every action but
// health and unlock needs a session token issued in exchange for a passcode.
//
//   1. Unlock needs a ribbon: board_users.can_use_floor_tasks or can_use_backoffice_tasks. The session it issues
//      carries can_use_tasks and nothing else: a tracker token opens no other tool, and no other tool's token opens this.
//   2. The session gives a name, and nothing more is trusted from it: every tsk_* database function re-reads that
//      person's rights (ribbons, manage, sensitive, CRM, inbox) as they stand at that moment and decides.
//   3. The rules live in the database (db/migrations/20261124_tsk_1_tasks.sql). Their refusals (raise exception,
//      SQLSTATE P0001) come back as 409 with the sentence verbatim.
//
// A client's name leaves through this function only for a login with the CRM right; the functions see to that.
//
// The source lives in the repository at tasks/src/api/index.ts.

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

// The tsk_* functions refuse bad requests with a plain `raise exception`
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

const NO_ACCESS = "This account does not have access to the task tracker.";

async function requireTasks(token: unknown): Promise<string> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the task tracker.");
  const rows = await select(`editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_use_tasks`);
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  if (!rows[0].can_use_tasks) throw new HttpErr(403, NO_ACCESS);
  return rows[0].display_name as string;
}

// A database refusal that means "you are no longer let in" is a 403, so the page returns to the gate.
async function call(fn: string, args: Record<string, unknown>) {
  try {
    return await rpc(fn, args);
  } catch (e) {
    if (e instanceof HttpErr && e.status === 409 && e.message === NO_ACCESS) throw new HttpErr(403, NO_ACCESS);
    throw e;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Only the keys the page may set, each checked for shape. What they may be set to is the database's call.
function taskIn(v: unknown): Record<string, unknown> {
  const o = obj(v, "task");
  const out: Record<string, unknown> = {};
  if (o.task_id !== undefined && o.task_id !== null && o.task_id !== "") out.task_id = uuid(o.task_id, "task");
  for (const [k, max] of [["title", 400], ["notes", 9000], ["owner", 80], ["helper", 80], ["piece_ref", 80], ["priority", 20], ["status", 20]] as const) {
    if (k in o) out[k] = o[k] === null ? "" : String(o[k]).replace(NUL_RE, "").slice(0, max);
  }
  if ("scope_id" in o) {
    if (typeof o.scope_id !== "number" || !Number.isInteger(o.scope_id) || o.scope_id < 1 || o.scope_id > 999) throw new HttpErr(400, "Choose a scope for the task.");
    out.scope_id = o.scope_id;
  }
  if ("due_on" in o) {
    const d = o.due_on === null ? "" : String(o.due_on).trim();
    if (d !== "" && (!DATE_RE.test(d) || Number.isNaN(Date.parse(d + "T00:00:00Z")))) throw new HttpErr(400, "The due date must be a date.");
    out.due_on = d;
  }
  if ("sensitive" in o) out.sensitive = o.sensitive === true;
  if ("clients" in o) {
    if (!Array.isArray(o.clients) || o.clients.length > 30) throw new HttpErr(400, "A task takes up to 30 clients.");
    out.clients = o.clients.map((c) => str(c, 40)).filter((c) => c !== null);
  }
  if ("checklist" in o) {
    if (!Array.isArray(o.checklist) || o.checklist.length > 40) throw new HttpErr(400, "A checklist takes up to 40 steps.");
    out.checklist = o.checklist.map((x) => {
      const it = obj(x, "checklist step");
      const id = it.item_id;
      if (id !== undefined && id !== null && (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)) throw new HttpErr(400, "That is not a valid checklist step.");
      return { item_id: id ?? null, body: str(it.body, 300) ?? "", done: it.done === true };
    });
  }
  return out;
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
    const matches = await select(`board_users?passcode_hash=eq.${hash}&active=is.true&select=name,can_use_floor_tasks,can_use_backoffice_tasks`);
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    if (!user.can_use_floor_tasks && !user.can_use_backoffice_tasks) throw new HttpErr(403, NO_ACCESS);
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    // A tracker session opens the tracker only: every other area's flag is false.
    await insert("editor_sessions", {
      token, display_name: user.name, expires_at: expires, can_use_tasks: true,
      can_use_perf: false, can_use_stock: false, can_use_sales: false,
      can_view_crm: false, can_edit_crm: false, can_view_board: false, can_view_catalogue: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires };
  }

  const name = await requireTasks(body.token);

  // Who I am, my ribbons' scopes and people, the live tasks, how many suggestions wait.
  if (action === "snapshot") return await call("tsk_snapshot", { p_user: name });

  // One task with its comments and history.
  if (action === "task") return await call("tsk_task", { p_user: name, p_task_id: uuid(body.task_id, "task") });

  // Create (no task_id) or change a task. → the task.
  if (action === "save") return await call("tsk_save", { p_user: name, p_task: taskIn(body.task) });

  if (action === "tick") {
    if (typeof body.item_id !== "number" || !Number.isSafeInteger(body.item_id) || body.item_id < 1) throw new HttpErr(400, "That is not a valid checklist step.");
    return await call("tsk_tick", { p_user: name, p_item_id: body.item_id, p_done: body.done === true });
  }

  if (action === "comment") {
    const text = body.body === null || body.body === undefined ? "" : String(body.body).replace(NUL_RE, "");
    if (text.trim().length > 4000) throw new HttpErr(400, "A comment can be at most 4,000 characters.");
    return await call("tsk_comment", { p_user: name, p_task_id: uuid(body.task_id, "task"), p_body: text });
  }

  if (action === "archive") return await call("tsk_archive", { p_user: name, p_task_id: uuid(body.task_id, "task"), p_on: body.on !== false });

  // Find a client to tag (CRM right only).
  if (action === "client_search") return { clients: await call("tsk_client_search", { p_user: name, p_q: str(body.q, 80) ?? "" }) };

  // The suggestions inbox, and a decision on one of them.
  if (action === "inbox") return { suggestions: await call("tsk_inbox", { p_user: name }) };
  if (action === "inbox_decide") {
    const scope = body.scope_id;
    if (scope !== undefined && scope !== null && (typeof scope !== "number" || !Number.isInteger(scope) || scope < 1 || scope > 999)) throw new HttpErr(400, "Choose a backoffice scope for the task.");
    return await call("tsk_inbox_decide", { p_user: name, p_suggestion_id: uuid(body.suggestion_id, "suggestion"), p_accept: body.accept === true, p_scope_id: scope ?? null });
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
    if (status >= 500) console.error("tasks-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
