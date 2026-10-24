// Delardi Catalogue — catalogue-api
//
// Same shape as board-api and crm-api: this function is the only route to the
// catalogue, the page holds no database key, and every action needs a session
// token issued in exchange for a passcode.
//
//   * Unlock checks board_users.can_view_catalogue. A board or CRM passcode does
//     not open the catalogue unless that person has been given catalogue access
//     (alpha, Oct 2026: Alex only). A catalogue session carries can_view_crm and
//     can_view_board false, so it opens nothing else.
//   * The catalogue is read-only. The one write a viewer can make is reporting an
//     error on a model page (cat_reports). Seeing and closing the reports is a
//     right of its own, can_manage_catalogue.
//   * Loading the catalogue is not done with a session: `import_load` takes a
//     one-time key whose digest sits in cat_import_tokens (two hours, single use)
//     and hands the payload to cat_load(), which replaces the catalogue in one
//     transaction. Claude prepares the payload from the Colibri Data Hub.
//   * No cost data exists anywhere in these tables. Sale prices are returned;
//     the page hides them behind the eye button.
//
// v1 — 24 Oct 2026. Part 1 of the catalogue: reference, list, model, reports,
// import.
// v2 — 24 Oct 2026. Part 3: the list filters on metal, stone, movement and case
// size (metals, stones, no_stones, movements, case_min, case_max), from facets
// cat_rebuild_facets() reads off the attributes at every load. The reference
// carries their counts. The model page gains the receipt name and sources for
// the catalogue owner only.
//
// The source lives in the repository at catalogue/src/api/index.ts and is kept
// identical to the deployed function.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_HOURS = 8;
const MAX_FAILS_PER_HOUR = 10;
const PAGE_DEFAULT = 60;
const PAGE_MAX = 200;
const MAX_IMPORT_BYTES = 20_000_000;

const CATEGORIES = ["watch", "jewellery", "accessory"];
const RETAIL = ["ring", "necklace", "earrings", "bracelet", "cufflinks", "watch", "strap", "clasp", "bracelet_element"];
const GENDERS = ["women", "men", "unisex"];
const STOCK = ["in", "out", "all"];
const REPORT_STATUSES = ["open", "fixed", "rejected"];
const METALS = ["white_gold", "yellow_gold", "rose_gold", "gold", "platinum", "silver", "steel", "titanium", "ceramic", "carbon", "aluminium", "rubber", "leather"];
const STONES = ["diamond", "lab_diamond", "sapphire", "emerald", "ruby", "rubellite", "tsavorite", "tanzanite", "topaz", "amethyst", "pearl", "mother_of_pearl", "opal", "turquoise", "malachite", "lapis", "onyx", "agate", "crystal"];
const MOVEMENTS = ["automatic", "quartz", "manual"];
const SORTS: Record<string, string> = {
  newest: "in_stock.desc,latest_arrival_year.desc.nullslast,brand.asc,model_id.asc",
  brand: "brand.asc,collection.asc.nullslast,model_name.asc.nullslast,model_id.asc",
  price_asc: "price_min_uzs.asc.nullslast,model_id.asc",
  price_desc: "price_max_uzs.desc.nullslast,model_id.asc",
  reference: "model_id.asc",
  completeness: "completeness.asc,model_id.asc",
};
const LIST_COLUMNS = [
  "model_id", "article", "brand", "category", "retail_category", "subcategory", "collection", "model_name",
  "gender", "material", "name_en", "name_ru", "in_stock", "qty_stock", "price_min_uzs", "price_max_uzs",
  "latest_arrival_year", "variant_count", "completeness", "missing_crucial", "has_unconfirmed", "image_key",
  "metal_keys", "stone_keys", "movement", "case_mm",
].join(",");
const VARIANT_COLUMNS = [
  "variant_id", "colour_code", "colour_name_en", "colour_name_ru", "material", "in_stock", "qty_stock",
  "price_uzs", "arrival_years", "description_ru", "description_en", "found_online", "confidence", "sources",
  "conflicts", "notes", "sort_order",
].join(",");

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
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function sha256hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- db helpers
async function db(path: string, init: RequestInit = {}, extra: Record<string, string> = {}) {
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
  if (!res.ok) throw new HttpErr(500, `database rejected the request (${res.status}): ${text}`);
  return { body: text ? JSON.parse(text) : null, headers: res.headers };
}
const select = async (path: string) => (await db(path)).body;
const insert = async (table: string, row: unknown, prefer = "return=representation") =>
  (await db(table, { method: "POST", body: JSON.stringify(row) }, { Prefer: prefer })).body;
const patch = async (path: string, row: unknown) =>
  (await db(path, { method: "PATCH", body: JSON.stringify(row) }, { Prefer: "return=representation" })).body;
const rpc = async (fn: string, args: Record<string, unknown>) =>
  (await db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) })).body;

// ------------------------------------------------------------- sanitisation
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function enumOrNull(v: unknown, allowed: string[], field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !allowed.includes(v)) throw new HttpErr(400, `Unknown ${field}.`);
  return v;
}
function listOf(v: unknown, allowed: string[] | null, field: string, max = 30): string[] {
  if (v === undefined || v === null || v === "") return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const x of arr.slice(0, max)) {
    const s = str(x, 120);
    if (!s) continue;
    if (allowed && !allowed.includes(s)) throw new HttpErr(400, `Unknown ${field}.`);
    out.push(s);
  }
  return out;
}
function intIn(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}
// A value inside a PostgREST in.(...) list: quoted, with quotes and backslashes escaped.
const inList = (xs: string[]) => encodeURIComponent(`(${xs.map((x) => `"${x.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`);
// One search word, safe for an ilike pattern.
function words(v: unknown): string[] {
  const s = str(v, 200);
  if (!s) return [];
  return s.toLowerCase().replace(/[%_*(),"\\]/g, " ").split(/\s+/).filter((w) => w.length > 0).slice(0, 8);
}
function modelId(v: unknown): string {
  const s = str(v, 80);
  if (!s || !/^[^\s"'\\]+$/u.test(s)) throw new HttpErr(400, "Unknown model.");
  return s;
}

// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

interface Session { name: string; canManage: boolean }

async function requireSession(token: unknown): Promise<Session> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the catalogue.");
  const rows = await select(
    `editor_sessions?token=eq.${encodeURIComponent(t)}&select=display_name,expires_at,can_view_catalogue`,
  );
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  if (new Date(rows[0].expires_at).getTime() < Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  // A board or CRM session is not a catalogue session.
  if (!rows[0].can_view_catalogue) throw new HttpErr(403, "This account does not have access to the catalogue.");
  const name = rows[0].display_name as string;
  const users = await select(
    `board_users?name=eq.${encodeURIComponent(name)}&active=is.true&select=can_view_catalogue,can_manage_catalogue`,
  );
  const user = users?.[0];
  if (!user || !user.can_view_catalogue) throw new HttpErr(403, "This account does not have access to the catalogue.");
  return { name, canManage: !!user.can_manage_catalogue };
}

async function requireManager(token: unknown): Promise<Session> {
  const s = await requireSession(token);
  if (!s.canManage) throw new HttpErr(403, "Only the catalogue owner can see the reports.");
  return s;
}

// ------------------------------------------------------------------ the list
function listFilters(body: Record<string, unknown>): string[] {
  const f: string[] = [];
  const brands = listOf(body.brands ?? body.brand, null, "brand");
  if (brands.length) f.push(`brand=in.${inList(brands)}`);
  const cat = enumOrNull(body.category, CATEGORIES, "category");
  if (cat) f.push(`category=eq.${cat}`);
  const rc = listOf(body.retail_categories ?? body.retail_category, RETAIL, "retail category");
  if (rc.length) f.push(`retail_category=in.${inList(rc)}`);
  const colls = listOf(body.collections ?? body.collection, null, "collection");
  if (colls.length) f.push(`collection=in.${inList(colls)}`);
  const g = listOf(body.genders ?? body.gender, GENDERS, "gender");
  if (g.length) f.push(`gender=in.${inList(g)}`);
  const stock = enumOrNull(body.stock, STOCK, "stock") ?? "all";
  if (stock === "in") f.push("in_stock=is.true");
  if (stock === "out") f.push("in_stock=is.false");
  if (body.incomplete === true) f.push("missing_crucial=neq.{}");
  const pmin = Number(body.price_min), pmax = Number(body.price_max);
  if (Number.isFinite(pmin) && pmin > 0) f.push(`price_max_uzs=gte.${Math.trunc(pmin)}`);
  if (Number.isFinite(pmax) && pmax > 0) f.push(`price_min_uzs=lte.${Math.trunc(pmax)}`);
  // v2: facets read from the attributes at load time.
  const metals = listOf(body.metals, METALS, "metal");
  if (metals.length) f.push(`metal_keys=ov.${encodeURIComponent("{" + metals.join(",") + "}")}`);
  const stones = listOf(body.stones, STONES, "stone");
  if (stones.length) f.push(`stone_keys=ov.${encodeURIComponent("{" + stones.join(",") + "}")}`);
  if (body.no_stones === true) f.push("stone_keys=eq.{}");
  const mv = listOf(body.movements, MOVEMENTS, "movement");
  if (mv.length) f.push(`movement=in.${inList(mv)}`);
  const cmin = Number(body.case_min), cmax = Number(body.case_max);
  if (Number.isFinite(cmin) && cmin > 0) f.push(`case_mm=gte.${cmin}`);
  if (Number.isFinite(cmax) && cmax > 0) f.push(`case_mm=lte.${cmax}`);
  const ids = listOf(body.ids, null, "model", 40);
  if (ids.length) f.push(`model_id=in.${inList(ids.map(modelId))}`);
  for (const w of words(body.q)) f.push(`search_text=ilike.*${encodeURIComponent(w)}*`);
  return f;
}

// --------------------------------------------------------------------- handle
async function handle(req: Request, body: Record<string, unknown>) {
  const action = str(body.action, 40);

  if (action === "health") {
    await select("cat_import_runs?select=id&limit=1");
    return { ok: true };
  }

  if (action === "unlock") {
    const ip = clientIp(req);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const fails = await select(
      `auth_attempts?ip=eq.${encodeURIComponent(ip)}&ok=is.false&created_at=gte.${since}&select=id`,
    );
    if ((fails?.length ?? 0) >= MAX_FAILS_PER_HOUR) throw new HttpErr(429, "Too many failed attempts. Try again in an hour.");
    const hash = await sha256hex(str(body.passcode, 200) ?? "");
    const matches = await select(
      `board_users?passcode_hash=eq.${hash}&active=is.true&select=name,can_view_catalogue,can_manage_catalogue`,
    );
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    if (!user.can_view_catalogue) throw new HttpErr(403, "This account does not have access to the catalogue.");
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    await insert("editor_sessions", {
      token, display_name: user.name, expires_at: expires,
      can_view_catalogue: true, can_view_crm: false, can_edit_crm: false, can_view_board: false,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires, can_manage: !!user.can_manage_catalogue };
  }

  if (action === "ping") {
    const s = await requireSession(body.token);
    return { ok: true, name: s.name, can_manage: s.canManage };
  }

  // Everything the start screen needs once: brand, category and collection
  // tiles with counts, the expected attributes per category, the latest load.
  if (action === "reference") {
    const s = await requireSession(body.token);
    const ref = await rpc("cat_reference", {});
    let openReports: number | null = null;
    if (s.canManage) {
      const { headers } = await db("cat_reports?status=eq.open&select=id&limit=1", {}, { Prefer: "count=exact" });
      openReports = Number((headers.get("content-range") ?? "/0").split("/")[1]) || 0;
    }
    return { ...ref, can_manage: s.canManage, open_reports: openReports };
  }

  if (action === "list") {
    await requireSession(body.token);
    const limit = intIn(body.limit, 1, PAGE_MAX, PAGE_DEFAULT);
    const offset = intIn(body.offset, 0, 100_000, 0);
    const sort = SORTS[str(body.sort, 20) ?? "newest"] ?? SORTS.newest;
    const f = listFilters(body);
    const path = `cat_models?select=${LIST_COLUMNS}${f.length ? "&" + f.join("&") : ""}&order=${sort}` +
      `&limit=${limit}&offset=${offset}`;
    const { body: rows, headers } = await db(path, {}, { Prefer: "count=exact" });
    const total = Number((headers.get("content-range") ?? "/0").split("/")[1]) || 0;
    // The colour dots on each row.
    const ids = (rows as { model_id: string; variant_count: number }[]).filter((r) => r.variant_count > 1).map((r) => r.model_id);
    const colours: Record<string, unknown[]> = {};
    if (ids.length) {
      const vs = await select(
        `cat_variants?model_id=in.${inList(ids)}&select=model_id,variant_id,colour_code,in_stock&order=sort_order`,
      );
      for (const v of vs) (colours[v.model_id] ??= []).push({ variant_id: v.variant_id, colour_code: v.colour_code, in_stock: v.in_stock });
    }
    return { total, offset, limit, rows: (rows as Record<string, unknown>[]).map((r) => ({ ...r, colours: colours[r.model_id as string] ?? null })) };
  }

  // One model page: the model, its colours with their pieces and attributes,
  // the expected attributes for its category, and matching pieces.
  if (action === "model") {
    const s = await requireSession(body.token);
    const id = modelId(body.model_id);
    const models = await select(`cat_models?model_id=eq.${encodeURIComponent(id)}&select=${LIST_COLUMNS},arrival_years,brand_raw,updated_at`);
    const model = models?.[0];
    if (!model) throw new HttpErr(404, "That model is not in the catalogue.");
    const variants = await select(`cat_variants?model_id=eq.${encodeURIComponent(id)}&select=${VARIANT_COLUMNS}&order=sort_order`);
    const vids = variants.map((v: { variant_id: string }) => v.variant_id);
    const [pieces, attrs, expected, links] = await Promise.all([
      vids.length ? select(`cat_pieces?variant_id=in.${inList(vids)}&select=variant_id,serial,size,price_uzs&order=size.asc.nullslast,serial`) : [],
      vids.length ? select(`cat_attributes?variant_id=in.${inList(vids)}&select=variant_id,key,value,value_num,flag`) : [],
      select(`cat_expected_keys?category=eq.${model.category}&select=key,section,crucial&order=sort_order`),
      select(`cat_links?model_id=eq.${encodeURIComponent(id)}&select=linked_model_id,kind,rank&order=rank`),
    ]);
    let linked: unknown[] = [];
    if (links.length) {
      const lm = await select(`cat_models?model_id=in.${inList(links.map((l: { linked_model_id: string }) => l.linked_model_id))}&select=${LIST_COLUMNS}`);
      const byId = new Map(lm.map((m: { model_id: string }) => [m.model_id, m]));
      linked = links.map((l: { linked_model_id: string; kind: string }) => ({ kind: l.kind, ...(byId.get(l.linked_model_id) as object) }));
    }
    // deno-lint-ignore no-explicit-any
    const out: Record<string, any>[] = variants.map((v: { variant_id: string }) => ({
      ...v,
      pieces: pieces.filter((p: { variant_id: string }) => p.variant_id === v.variant_id)
        .map(({ variant_id: _v, ...p }: Record<string, unknown>) => p),
      attributes: Object.fromEntries(attrs.filter((a: { variant_id: string }) => a.variant_id === v.variant_id)
        .map((a: { key: string; value: string; value_num: number | null; flag: string }) => [a.key, { value: a.value, num: a.value_num, flag: a.flag }])),
    }));
    let reports: unknown[] | null = null;
    // What the data rests on, for the owner: the receipt name, the sources, the confidence.
    if (!s.canManage) {
      for (const v of out) {
        delete v.attributes.receipt_name;
        v.sources = []; v.confidence = null; v.notes = null; v.conflicts = null;
      }
    }
    if (s.canManage) {
      reports = await select(`cat_reports?model_id=eq.${encodeURIComponent(id)}&status=eq.open&select=id,variant_id,field_key,message,reported_by,created_at&order=created_at.desc`);
    }
    return { model, variants: out, expected, linked, reports };
  }

  // The only write a viewer makes: "something is wrong on this page".
  if (action === "report_create") {
    const s = await requireSession(body.token);
    const id = modelId(body.model_id);
    const message = str(body.message, 1000);
    if (!message) throw new HttpErr(400, "Say what is wrong.");
    const model = await select(`cat_models?model_id=eq.${encodeURIComponent(id)}&select=model_id`);
    if (!model?.length) throw new HttpErr(404, "That model is not in the catalogue.");
    let variant: string | null = str(body.variant_id, 80);
    if (variant) {
      const v = await select(`cat_variants?variant_id=eq.${encodeURIComponent(variant)}&model_id=eq.${encodeURIComponent(id)}&select=variant_id`);
      if (!v?.length) variant = null;
    }
    const field = str(body.field_key, 60);
    const rows = await insert("cat_reports", {
      model_id: id, variant_id: variant, field_key: field && /^[a-z_]+$/.test(field) ? field : null,
      message, reported_by: s.name,
    });
    return { ok: true, id: rows?.[0]?.id };
  }

  if (action === "reports_list") {
    await requireManager(body.token);
    const status = enumOrNull(body.status, REPORT_STATUSES, "status") ?? "open";
    const rows = await select(
      `cat_reports?status=eq.${status}&select=id,model_id,variant_id,field_key,message,reported_by,created_at,status,closed_by,closed_at&order=created_at.desc&limit=500`,
    );
    const ids = [...new Set(rows.map((r: { model_id: string }) => r.model_id))] as string[];
    const models = ids.length ? await select(`cat_models?model_id=in.${inList(ids)}&select=model_id,brand,collection,model_name,retail_category`) : [];
    const byId = new Map(models.map((m: { model_id: string }) => [m.model_id, m]));
    return { rows: rows.map((r: { model_id: string }) => ({ ...r, model: byId.get(r.model_id) ?? null })) };
  }

  if (action === "report_close") {
    const s = await requireManager(body.token);
    const id = intIn(body.id, 1, 1e12, 0);
    const status = enumOrNull(body.status, ["fixed", "rejected", "open"], "status");
    if (!id || !status) throw new HttpErr(400, "Say which report and what happened to it.");
    const rows = await patch(`cat_reports?id=eq.${id}`, status === "open"
      ? { status, closed_by: null, closed_at: null }
      : { status, closed_by: s.name, closed_at: new Date().toISOString() });
    if (!rows?.length) throw new HttpErr(404, "That report is not on file.");
    return { ok: true };
  }

  // A full load, prepared by Claude from the Colibri Data Hub. One-time key.
  if (action === "import_load") {
    const key = str(body.import_key, 200);
    if (!key || key.length < 32) throw new HttpErr(401, "A load needs its one-time key.");
    const h = await sha256hex(key);
    const now = new Date().toISOString();
    // Claim the key first, so a second request with it fails even mid-load.
    const claimed = await patch(
      `cat_import_tokens?token_hash=eq.${h}&used_at=is.null&expires_at=gt.${now}`, { used_at: now },
    );
    if (!claimed?.length) throw new HttpErr(401, "That key is not valid, has been used, or has expired.");
    const p = body.payload as Record<string, unknown> | undefined;
    if (!p || !Array.isArray(p.models) || !Array.isArray(p.variants)) throw new HttpErr(400, "The payload is not a catalogue.");
    const source = str(body.source, 300) ?? "unknown";
    return await rpc("cat_load", { p, p_source: source });
  }

  throw new HttpErr(400, `Unknown action: ${action}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_IMPORT_BYTES) return json({ error: "Too large." }, 413);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  try {
    return json(await handle(req, body));
  } catch (err) {
    const status = err instanceof HttpErr ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    if (status >= 500) console.error("catalogue-api failure:", message);
    return json({ error: status >= 500 ? "Something went wrong on the server." : message }, status);
  }
});
