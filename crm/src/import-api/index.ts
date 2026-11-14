// crm-import — bulk loads into the CRM, guarded by a one-time key.
//
// crm-api is a session API: every action there belongs to a signed-in user. A
// bulk load has no user behind it — it is a file prepared outside and pushed in
// once — so it gets the treatment the catalogue already uses: a one-time key
// whose digest sits in crm_import_tokens (two hours, single use), claimed
// before the load runs. Nothing here reads or returns CRM data.
//
// POST { import_key, source, chats?: [...], missed?: [...], tickets?: {...} }
//   chats   -> crm_telegram_load(p, p_actor, p_source)  — skips chats already on file
//   missed  -> crm_missed_load(p, p_source)             — dedupes on telegram_id+asked_at+kind
//   tickets -> ops_load_tickets(p, p_actor)             — sales tickets; p is the whole payload
//              { source_files, tickets: [...], summary } made by tools/colibri_sales_parse.py
// All three loaders are idempotent, so retrying a half-finished request is safe.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_IMPORT_BYTES = 20_000_000;
const MAX_ROWS = 20_000;
const MAX_TICKETS = 5_000;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

class HttpErr extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function db(path: string, init: RequestInit, extra: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpErr(res.status === 404 ? 404 : 500, `Database said: ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

function rows(v: unknown, what: string): Record<string, unknown>[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) throw new HttpErr(400, `"${what}" must be a list of rows.`);
  if (v.length > MAX_ROWS) throw new HttpErr(413, `That is more than ${MAX_ROWS} ${what} rows.`);
  return v as Record<string, unknown>[];
}

function ticketPayload(v: unknown): Record<string, unknown> | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpErr(400, `"tickets" must be an object.`);
  const list = (v as Record<string, unknown>).tickets;
  if (!Array.isArray(list)) throw new HttpErr(400, `"tickets.tickets" must be a list of tickets.`);
  if (list.length > MAX_TICKETS) throw new HttpErr(413, `That is more than ${MAX_TICKETS} tickets.`);
  return v as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMPORT_BYTES) {
    return json({ error: "Too large." }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Body must be a JSON object." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  try {
    const key = typeof body.import_key === "string" ? body.import_key.trim() : "";
    if (key.length < 32 || key.length > 200) throw new HttpErr(401, "A load needs its one-time key.");

    const chats = rows(body.chats, "chats");
    const missed = rows(body.missed, "missed");
    const tickets = ticketPayload(body.tickets);
    if (!chats?.length && !missed?.length && !(tickets?.tickets as unknown[] | undefined)?.length) throw new HttpErr(400, "Nothing to load.");
    const source = typeof body.source === "string" ? body.source.slice(0, 300) : "unknown";
    const actor = typeof body.actor === "string" ? body.actor.slice(0, 80) : "Claude";

    // Claim the key first, so a second request with it fails even mid-load.
    const now = new Date().toISOString();
    const claimed = await db(
      `crm_import_tokens?token_hash=eq.${await sha256hex(key)}&purpose=eq.crm_load&used_at=is.null&expires_at=gt.${now}`,
      { method: "PATCH", body: JSON.stringify({ used_at: now }) },
      { Prefer: "return=representation" },
    ) as unknown[] | null;
    if (!claimed?.length) throw new HttpErr(401, "That key is not valid, has been used, or has expired.");

    const out: Record<string, unknown> = { ok: true, source };
    if (chats?.length) out.chats = await rpc("crm_telegram_load", { p: chats, p_actor: actor, p_source: source });
    if (missed?.length) out.missed = await rpc("crm_missed_load", { p: missed, p_source: source });
    if (tickets) out.tickets = await rpc("ops_load_tickets", { p: tickets, p_actor: "import:" + source });
    return json(out);
  } catch (e) {
    if (e instanceof HttpErr) return json({ error: e.message }, e.status);
    return json({ error: `Load failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
