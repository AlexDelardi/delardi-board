// Delardi CRM — crm-cockpit
//
// One read-only action for the CRM page: a sales rep's cockpit (dates coming up,
// who to contact, purchases to follow up, open requests). It sits beside crm-api
// rather than inside it so that adding it did not mean redeploying the function
// the whole CRM runs on. The session rules are crm-api's own, to the letter: the
// same token, the same expiry, the same rights as they stand now.
//
// The source lives in the repository at crm/src/api-cockpit/index.ts.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (!res.ok) {
    let err: { code?: string; message?: string } = {};
    try { err = JSON.parse(text); } catch { /* not JSON */ }
    if (err.code === "P0001" && err.message) throw new HttpErr(409, err.message);
    throw new HttpErr(500, `database rejected the request (${res.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const NUL_RE = new RegExp(String.fromCharCode(0), "g");
function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(NUL_RE, "").trim();
  return s ? s.slice(0, max) : null;
}

// The same checks as crm-api's requireSession.
async function requireSession(token: unknown): Promise<{ name: string; repLabel: string | null; canPick: boolean }> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the instrument.");
  const rows = await db(`editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_view_crm`);
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  const expiresAt = Date.parse(rows[0].expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  if (!rows[0].can_view_crm) throw new HttpErr(403, "This account does not have access to the CRM.");
  const name = rows[0].display_name as string;
  const users = await db(`board_users?name=eq.${encodeURIComponent(name)}&active=is.true&select=can_view_crm,crm_rep_label,can_view_all_cockpits`);
  const user = users?.[0];
  if (!user || !user.can_view_crm) throw new HttpErr(403, "This account does not have access to the CRM.");
  // canPick: may choose whose cockpit to look at (board_users.can_view_all_cockpits)
  return { name, repLabel: str(user.crm_rep_label, 40), canPick: !!user.can_view_all_cockpits };
}

async function handle(body: Record<string, unknown>) {
  const action = str(body.action, 40);
  if (action === "health") return { ok: true };
  if (action !== "cockpit") throw new HttpErr(400, "Unknown action.");

  // A sales rep opens her own cockpit. A login with the right to choose (the director, the store manager, marketing)
  // may name any rep, and starts on its own if it is a rep too. A login with neither has no cockpit.
  const sess = await requireSession(body.token);
  const reps = (await db("crm_sales_reps?select=label,active&active=is.true&order=label")) as Array<{ label: string }>;
  const active = sess.canPick ? (reps ?? []).map((r) => r.label).filter((x) => !!x) : [];
  const asked = str(body.rep, 40);
  const mine = sess.repLabel;
  if (asked && !sess.canPick && asked.toLowerCase() !== (mine ?? "").toLowerCase()) {
    throw new HttpErr(409, "Your account opens its own cockpit only.");
  }
  const rep = sess.canPick ? (asked ?? mine) : mine;
  if (!rep) return { rep: null, own: mine, reps: active, can_pick: sess.canPick };
  if (sess.canPick && !active.some((l) => l.toLowerCase() === rep.toLowerCase()) && rep !== mine) {
    throw new HttpErr(404, "No sales rep with that name.");
  }
  // "today" is the shop's day, not the server's: Tashkent is five hours ahead of UTC
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  const doc = await db("rpc/crm_cockpit", { method: "POST", body: JSON.stringify({ p_rep: rep, p_today: today }) });
  return { ...doc, own: mine, reps: active, can_pick: sess.canPick };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) return json({ error: "Body must be a JSON object." }, 400);
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  try {
    return json(await handle(body));
  } catch (err) {
    const status = err instanceof HttpErr ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    if (status >= 500) console.error("crm-cockpit failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
