// Delardi Access tool — access-api
//
// The only route between the Access page and the data: the page holds no database key, and every action but health and
// unlock needs a session token issued in exchange for a passcode.
//
//   1. Unlock needs board_users.can_manage_access. The session it issues carries can_use_access and nothing else: an
//      Access token opens no other tool, and no other tool's token opens this.
//   2. The session gives a name, and nothing more is trusted from it: every acc_* database function re-reads that
//      person's rights as they stand at that moment and decides.
//   3. The rules live in the database (db/migrations/20261125_acc_1_access.sql). Their refusals (raise exception,
//      SQLSTATE P0001) come back as 409 with the sentence verbatim.
//
// Passcodes. Sign-in everywhere checks a SHA-256 of the passcode (board_users.passcode_hash), as before. When this
// function issues a passcode it also stores a copy encrypted with AES-256-GCM (board_users.passcode_enc), so the access
// manager can look it up later. The key is derived from the secret ACCESS_PASSCODE_KEY, which lives with the function
// and never in the database: a copy of the database alone does not give the passcodes. Passcodes are generated here,
// never chosen by the page, and are returned only to the access manager who asked.
//
// The source lives in the repository at access/src/api/index.ts.

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

// The acc_* functions refuse bad requests with a plain `raise exception`
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

const NO_ACCESS = "This account does not have access to the Access tool.";

async function requireAccess(token: unknown): Promise<string> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the Access tool.");
  const rows = await select(`editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_use_access`);
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  if (!rows[0].can_use_access) throw new HttpErr(403, NO_ACCESS);
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

// ------------------------------------------------------------------ passcodes
const KEY_SECRET = Deno.env.get("ACCESS_PASSCODE_KEY") ?? "";
const KEY_READY = KEY_SECRET.length >= 32;
const NO_KEY = "Passcodes cannot be issued or shown yet: the passcode key is not set up.";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(): Promise<CryptoKey> {
  if (!KEY_READY) throw new HttpErr(409, NO_KEY);
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY_SECRET));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
// "v1.<iv>.<ciphertext>", both base64. A fresh 12-byte iv for every passcode.
async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}
async function decrypt(stored: string): Promise<string> {
  const [v, iv, ct] = String(stored).split(".");
  if (v !== "v1" || !iv || !ct) throw new HttpErr(500, "stored passcode copy is not readable");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch (e) {
    if (e instanceof HttpErr) throw e;
    // the key was changed since this copy was made
    throw new HttpErr(409, "This passcode can no longer be shown. Issue a new one.");
  }
}

// A word and four digits: easy to say over the phone, nothing of the person or the company in it.
const WORDS = ["amber", "topaz", "opal", "pearl", "coral", "jade", "onyx", "ruby", "garnet", "quartz", "agate", "ivory", "cedar", "maple", "willow", "birch",
  "lotus", "tulip", "orchid", "violet", "indigo", "silver", "copper", "bronze", "marble", "granite", "harbor", "meadow", "canyon", "summit", "river", "island",
  "comet", "orbit", "aurora", "breeze", "ember", "frost", "dune", "lagoon"];
function pick(n: number): number {
  // unbiased: reject the tail of the 32-bit range that does not divide evenly
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}
function newPasscode(): string {
  return WORDS[pick(WORDS.length)] + String(pick(10000)).padStart(4, "0");
}
const IN_USE = "That passcode is already in use. Generate another.";

// Generate, store through `save`, and try again if someone already has that passcode. → what save returned, and the passcode.
async function issue(save: (hash: string, enc: string) => Promise<unknown>): Promise<{ person: unknown; passcode: string }> {
  await aesKey();                                  // refuse before generating anything if the key is missing
  for (let i = 0; i < 6; i++) {
    const passcode = newPasscode();
    try {
      return { person: await save(await sha256hex(passcode), await encrypt(passcode)), passcode };
    } catch (e) {
      if (e instanceof HttpErr && e.status === 409 && e.message === IN_USE) continue;
      throw e;
    }
  }
  throw new HttpErr(500, "could not find a free passcode");
}

// Only the keys the page may set, each checked for shape. What they may be set to is the database's call.
function personIn(v: unknown): Record<string, unknown> {
  const o = obj(v, "person");
  const out: Record<string, unknown> = {};
  if (o.person_id !== undefined && o.person_id !== null && o.person_id !== "") out.person_id = uuid(o.person_id, "person");
  for (const [k, max] of [["name", 100], ["role", 120], ["rep", 80]] as const) {
    if (k in o) out[k] = o[k] === null ? "" : String(o[k]).replace(NUL_RE, "").slice(0, max);
  }
  if ("active" in o) out.active = o.active === true;
  if ("copy_from" in o && o.copy_from !== null && o.copy_from !== "") out.copy_from = uuid(o.copy_from, "person");
  return out;
}

// ------------------------------------------------------------------ actions
async function handle(req: Request, body: Record<string, unknown>) {
  const action = str(body.action, 40);

  if (action === "health") {
    await select("board_users?select=name&limit=1");
    return { ok: true, passcode_key: KEY_READY };
  }

  if (action === "unlock") {
    const ip = clientIp(req);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const fails = await select(`auth_attempts?ip=eq.${encodeURIComponent(ip)}&ok=is.false&created_at=gte.${since}&select=id`);
    if ((fails?.length ?? 0) >= MAX_FAILS_PER_HOUR) throw new HttpErr(429, "Too many failed attempts. Try again in an hour.");
    const hash = await sha256hex(str(body.passcode, 200) ?? "");
    const matches = await select(`board_users?passcode_hash=eq.${hash}&active=is.true&select=name,can_manage_access`);
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    if (!user.can_manage_access) throw new HttpErr(403, NO_ACCESS);
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    // An Access session opens the Access tool only: every other area's flag is false. The address goes with it, so the
    // login log does not have to guess it.
    await insert("editor_sessions", {
      token, display_name: user.name, expires_at: expires, can_use_access: true, ip,
      can_use_tasks: false, can_use_perf: false, can_use_stock: false, can_use_sales: false,
      can_view_crm: false, can_edit_crm: false, can_view_board: false, can_view_catalogue: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires };
  }

  const name = await requireAccess(body.token);

  // Who I am, the rights the tool manages, every person with their rights, the latest changes.
  if (action === "snapshot") return { ...(await call("acc_snapshot", { p_actor: name })), passcode_key: KEY_READY };

  // Switch one right of one person on or off. → the person.
  if (action === "set_right") {
    return await call("acc_set_right", { p_actor: name, p_person: uuid(body.person_id, "person"), p_right: str(body.right, 60) ?? "", p_on: body.on === true });
  }

  // Add a person (no person_id: a passcode is generated and returned once here) or change one. → { person, passcode? }.
  if (action === "save_person") {
    const p = personIn(body.person);
    if (p.person_id) return { person: await call("acc_save_person", { p_actor: name, p_person: p }) };
    return await issue((hash, enc) => call("acc_save_person", { p_actor: name, p_person: p, p_hash: hash, p_enc: enc }));
  }

  // A new passcode for a person: the old one stops working and their sessions end. → { person, passcode }.
  if (action === "new_passcode") {
    const id = uuid(body.person_id, "person");
    return await issue((hash, enc) => call("acc_set_passcode", { p_actor: name, p_person: id, p_hash: hash, p_enc: enc }));
  }

  // Look a passcode up. The database logs the look before the copy leaves it.
  if (action === "show_passcode") {
    await aesKey();
    const enc = await call("acc_passcode", { p_actor: name, p_person: uuid(body.person_id, "person") });
    return { passcode: await decrypt(String(enc)) };
  }

  // Who signed in to what (its own right).
  if (action === "logins") {
    const days = typeof body.days === "number" && Number.isInteger(body.days) ? body.days : 30;
    return await call("acc_logins", { p_actor: name, p_days: days });
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
    if (status >= 500) console.error("access-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
