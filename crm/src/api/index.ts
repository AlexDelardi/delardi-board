// Delardi CRM instrument — crm-api
//
// Same shape as board-api: this function is the only route to the data, the
// page holds no database key, and every action needs a session token issued in
// exchange for a passcode. Two differences worth knowing:
//
//   1. Unlock here checks board_users.can_view_crm, so a board passcode does
//      not open the CRM unless that person has been given CRM access.
//   2. Writing is a separate right (can_edit_crm). Reading the instrument and
//      changing a client record are not the same permission.
//
// v5 — read surface: the clients list, the client card, reference data and the
// dashboard figures. Writes arrived in v6 (see below).
//
// Sales people reach the page only as the label crm_sales_reps holds for them,
// applied here on the way out — never as the name Colibri writes. Until 12 Oct
// 2026 those labels were "Sales rep 1…8"; they are now the team's own names
// (Alex's decision), so changing a label is the only change needed to rename
// someone everywhere, and the Colibri source names still never leave the server.
//
// The source of this function lives in the repository at crm/src/api/index.ts.
// Deploying is the only way it reaches Supabase, so the two are kept identical
// and checked by md5 after every deploy.
//
// v12 — people by name, and a client added by hand. Sales people are shown by
// their own name instead of "Sales rep N" (the label in crm_sales_reps is the
// only thing that changed; source names are untouched). `client_add` creates a
// record from the counter: a prospect with a PRS reference, its values on the
// "entered by the team" side, refused when the number or the name is already on
// file unless the page says it is a different person. The list carries
// added_by_hand and how_met, and `added` (only / exclude) filters on them.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_HOURS = 8;
const MAX_FAILS_PER_HOUR = 10;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

const QUEUE_CLASSES = ["conflict", "gap", "clean"];
const RECORD_TYPES = ["client", "prospect"];
const RECORD_STATES = ["open", "confirmed", "parked", "merged", "to_delete", "deleted"];
const ABC_CLASSES = ["A", "B", "C"];
const OWNER_STATUSES = ["orphaned", "assignable", "unassigned"];
// Drill-down buckets the insights page links to.
const OCCASION_BUCKETS: Record<string, string[]> = {
  "1": ["purchase_occasions=eq.1"],
  "2": ["purchase_occasions=eq.2"],
  "3-4": ["purchase_occasions=gte.3", "purchase_occasions=lte.4"],
  "5+": ["purchase_occasions=gte.5"],
  "2+": ["purchase_occasions=gte.2"],
};
const BRAND_BUCKETS: Record<string, string[]> = {
  "0": ["brands_bought=eq.0"],
  "1": ["brands_bought=eq.1"],
  "2": ["brands_bought=eq.2"],
  "3+": ["brands_bought=gte.3"],
  "2+": ["brands_bought=gte.2"],
};
// review_status in crm_queue, plus two groupings the page offers.
const REVIEW_STATUSES = ["decision", "confirm", "clean", "checked", "set_aside", "deleted", "merged", "done", "active", "all", "lead"];
// Missed demand from the Telegram chats.
const MISSED_KINDS = ["not_carried", "not_in_stock", "awaiting", "order_request", "late_reply"];
const MISSED_STATUSES = ["open", "followed_up", "closed"];
const FIELDS = ["name", "gender", "dob", "phone"];
const SOURCES = ["colibri", "marketing", "value", "telegram"];
// v11: the contact log, personal data and sorting.
const CONTACT_CHANNELS = ["visit", "call", "telegram", "whatsapp", "email", "other"];
const PERSONAL_GROUPS = ["sizes", "prefs", "address", "about"];
const DATE_KINDS = ["anniversary", "partner_birthday", "child_birthday", "other"];
const ORDER_COLUMNS: Record<string, string> = {
  name: "display_name", status: "review_rank", abc: "abc_class", segment: "rfm_segment", lifecycle: "lifecycle_rank",
  owner: "owner_label", last: "last_purchase_at", spend: "lifetime_spend_uzs", contact: "last_contact_on",
  id: "client_id", touched: "updated_at",
};
// The columns a checklist filter can count, and the view column behind each.
const FACET_COLUMNS: Record<string, string> = {
  status: "review_status", abc: "abc_class", segment: "rfm_segment", lifecycle: "lifecycle_status", owner: "client_owner",
};
const FACET_STATUSES = ["decision", "confirm", "clean", "checked", "set_aside", "lead", "deleted", "merged"];
const BASES = ["client", "delardi"];
const STATES = ["open", "confirmed", "parked", "deleted"];
// The health page's attention list; each key is a set of records in crm_attention_ids().
const ATTENTION_KEYS = [
  "duplicates", "changed_after_check", "new_from_refresh", "shared_active", "no_phone", "no_dob", "initials_only",
  "brand_unassigned", "telegram_to_confirm",
];
// Actor columns on a refresh.
const BATCH_ACTORS = ["created_by", "decided_by", "undone_by"];
// Event actions that are a person working the review queue.
const REVIEW_ACTIONS = [
  "field_resolved", "field_reset", "single_source_accepted", "state_changed", "merged_from",
  "duplicate_cleared", "note", "do_not_contact_set", "contact_note_set", "referred_by_set",
  "telegram_linked", "telegram_rejected", "missed_demand_set",
];
// Columns of crm_queue the list sends; name_search stays on the server.
const LIST_COLUMNS = [
  "client_id", "record_type", "record_state", "in_colibri", "in_marketing", "abc_class", "rfm_segment",
  "lifecycle_status", "client_owner", "lifetime_spend_uzs", "last_purchase_at", "conflict_fields", "gap_fields",
  "settled_fields", "queue_class", "reviewed_by", "reviewed_at", "updated_at", "related_party", "historic_owner",
  "review_status", "display_name", "do_not_contact", "merged_into", "state_reason", "in_telegram",
  "last_contact_on", "last_contact_by", "last_contact_channel", "added_by_hand", "how_met",
].join(",");
// Columns that exist in crm_clients but are withheld from every response.
// v11: phone numbers are served; the matching key and the Telegram ID are not.
const WITHHELD = ["match_phone", "telegram_id"];
// Chat columns the card reads. telegram_id is read to link, then dropped
// before the response.
const CHAT_COLUMNS = [
  "id", "telegram_id", "client_id", "link_status", "match_basis", "suggested_ids", "display_name", "phone", "language",
  "segment", "dormant", "do_not_contact", "first_contact", "last_contact", "last_client_message", "messages_total",
  "messages_from_client", "messages_from_boutique", "inquiries", "replies_over_24h", "never_answered",
  "broadcasts_received", "interest_brands", "purchase_signal", "pos_revenue_uzs", "pos_items", "last_pos_purchase",
  "pos_brands", "max_discount_pct", "flags", "last_client_excerpt", "as_of", "decided_by", "decided_at",
].join(",");
const MISSED_COLUMNS = [
  "id", "telegram_id", "client_id", "asked_at", "kind", "brand", "excerpt", "late", "answered", "first_reply_minutes",
  "status", "status_by", "status_at",
].join(",");
const SORTS: Record<string, string> = {
  spend: "lifetime_spend_uzs.desc.nullslast",
  spend_asc: "lifetime_spend_uzs.asc.nullslast",
  recent: "last_purchase_at.desc.nullslast",
  oldest: "last_purchase_at.asc.nullslast",
  id: "client_id.asc",
  touched: "updated_at.desc",
};

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
    headers: { ...CORS, "Content-Type": "application/json" },
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

// The write functions refuse bad requests with SQLSTATE P0001 and a sentence
// meant for the person at the screen; those come back as 409 with that
// sentence. Anything else is a fault and stays a 500.
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

// Counts come back in the Content-Range header rather than the body, so this
// one cannot go through db().
async function selectWithCount(path: string): Promise<{ rows: unknown[]; total: number }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "count=exact",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpErr(500, `database rejected the request (${res.status}): ${text}`);
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return { rows: text ? JSON.parse(text) : [], total: Number.isFinite(total) ? total : 0 };
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

// Client ids are ours, not user-supplied text: DLD-0001 / PRS-001.
function clientId(v: unknown): string {
  const s = str(v, 16) ?? "";
  if (!/^(DLD|PRS)-\d{3,4}$/.test(s)) throw new HttpErr(400, "That is not a valid client reference.");
  return s;
}

function intIn(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

// PostgREST filter values are comma/parenthesis delimited, so anything that
// reaches one is stripped of the delimiters before it is encoded.
function searchTerm(v: unknown): string | null {
  const s = str(v, 60);
  if (!s) return null;
  const clean = s.replace(/[,()*\\]/g, " ").trim();
  return clean ? clean : null;
}

// ------------------------------------------------------------- sales rep names
// Colibri holds real staff names; the instrument speaks in labels. One lookup
// per request, both ways, so a filter can arrive as either and leave as a label.
interface RepMap {
  toLabel: Map<string, string>;
  toSource: Map<string, string>;
  active: Set<string>; // source names that can currently be assigned
}

async function repMap(): Promise<RepMap> {
  const rows = (await select("crm_sales_reps?select=source_name,label,active")) as
    Array<{ source_name: string; label: string; active: boolean }>;
  const toLabel = new Map<string, string>();
  const toSource = new Map<string, string>();
  const active = new Set<string>();
  for (const r of rows ?? []) {
    toLabel.set(r.source_name, r.label);
    toSource.set(r.label.toLowerCase(), r.source_name);
    if (r.active) active.add(r.source_name);
  }
  return { toLabel, toSource, active };
}

const asLabel = (m: RepMap, name: unknown): string | null => {
  const s = str(name, 80);
  return s === null ? null : (m.toLabel.get(s) ?? "Unassigned");
};

// Who made a change. The team signs in under their own names; where that name
// is also a sales rep in the Colibri data, it goes out as the rep's label.
const actorLabel = (m: RepMap, name: unknown): string | null => {
  const s = str(name, 80);
  return s === null ? null : (m.toLabel.get(s) ?? s);
};
const ACTOR_FIELDS = ["reviewed_by", "assigned_by", "state_by", "last_contact_by"];

// Any column that can hold a Colibri staff name.
const OWNER_FIELDS = ["client_owner", "assigned_owner", "historic_owner"];
function labelOwners(m: RepMap, row: Record<string, unknown>, effectiveSource: unknown) {
  const out: Record<string, unknown> = { ...row };
  for (const k of OWNER_FIELDS) if (k in out) out[k] = asLabel(m, out[k]);
  for (const k of ACTOR_FIELDS) if (k in out) out[k] = actorLabel(m, out[k]);
  out.owner_active = m.active.has(String(effectiveSource ?? ""));
  return out;
}

// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

interface Session {
  name: string;
  canView: boolean;
  canEdit: boolean;
  canImport: boolean;
  repLabel: string | null;   // the sales rep this login is, if any ("My clients")
}

async function requireSession(token: unknown): Promise<Session> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the instrument.");
  const rows = await select(
    `editor_sessions?token=eq.${encodeURIComponent(t)}` +
      `&select=display_name,expires_at,can_view_crm,can_edit_crm`,
  );
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  if (new Date(rows[0].expires_at).getTime() < Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  // A board session is not a CRM session. Tokens issued elsewhere carry the
  // flag false and are refused here rather than silently granted.
  if (!rows[0].can_view_crm) throw new HttpErr(403, "This account does not have access to the CRM.");
  // Rights as they stand now, not as they stood at unlock.
  const name = rows[0].display_name as string;
  const users = await select(
    `board_users?name=eq.${encodeURIComponent(name)}&active=is.true&select=can_view_crm,can_edit_crm,can_import_crm,crm_rep_label`,
  );
  const user = users?.[0];
  if (!user || !user.can_view_crm) throw new HttpErr(403, "This account does not have access to the CRM.");
  const canEdit = !!rows[0].can_edit_crm && !!user.can_edit_crm;
  return {
    name,
    canView: true,
    canEdit,
    // Applying a refresh changes records, so it needs the edit right as well.
    canImport: canEdit && !!user.can_import_crm,
    repLabel: str(user.crm_rep_label, 40),
  };
}

async function requireImporter(token: unknown): Promise<Session> {
  const sess = await requireSession(token);
  if (!sess.canImport) throw new HttpErr(403, "Your account cannot run the Colibri refresh.");
  return sess;
}

function batchId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1e9) throw new HttpErr(400, "That is not a valid refresh.");
  return n;
}

// The refresh document, with every actor shown the way the rest of the page shows them.
async function importDetail(id: number) {
  const [reps, doc] = await Promise.all([repMap(), rpc("crm_import_detail", { p_batch: id })]);
  if (!doc?.batch) throw new HttpErr(404, "No such refresh.");
  for (const k of BATCH_ACTORS) doc.batch[k] = actorLabel(reps, doc.batch[k]);
  return doc;
}

async function requireEditor(token: unknown): Promise<Session> {
  const sess = await requireSession(token);
  if (!sess.canEdit) throw new HttpErr(403, "Your account can view client records but not change them.");
  return sess;
}

// ------------------------------------------------------------------ the card
const DUP_RE = /\b(?:DLD|PRS)-\d{3,4}\b/g;

async function cardFor(id: string, sess?: Session) {
  const [reps, clients, queue, tx, events, chats, missed, contacts, personal, dates] = await Promise.all([
    repMap(),
    select(`crm_clients?client_id=eq.${id}&select=*`),
    select(`crm_queue?client_id=eq.${id}&select=${LIST_COLUMNS}`),
    select(`crm_transactions?client_id=eq.${id}&select=*&order=sold_at.desc,id.desc`),
    select(`crm_events?client_id=eq.${id}&select=*&order=at.desc,id.desc&limit=300`),
    select(`crm_telegram_chats?or=(client_id.eq.${id},suggested_ids.cs.%7B${id}%7D)&select=${CHAT_COLUMNS}&order=last_client_message.desc.nullslast,id`),
    select(`crm_missed_demand?client_id=eq.${id}&select=${MISSED_COLUMNS}&order=asked_at.desc,id.desc`),
    select(`crm_contacts?client_id=eq.${id}&select=*&order=contacted_on.desc,id.desc&limit=200`),
    select(`crm_personal?client_id=eq.${id}&select=*`),
    select(`crm_important_dates?client_id=eq.${id}&select=*&order=month,day,id`),
  ]);
  if (!clients?.length) throw new HttpErr(404, "No record with that reference.");

  const lines = ((tx ?? []) as Array<Record<string, unknown>>).map((l) => ({
    ...l,
    advisor: asLabel(reps, l.advisor),
  }));
  const byBrand: Record<string, { lines: number; net: number }> = {};
  const byCategory: Record<string, { lines: number; net: number }> = {};
  for (const l of lines) {
    const b = String(l.brand ?? "Unassigned");
    const c = String(l.category ?? "Unassigned");
    (byBrand[b] ??= { lines: 0, net: 0 });
    (byCategory[c] ??= { lines: 0, net: 0 });
    byBrand[b].lines += 1;
    byBrand[b].net += Number(l.net_uzs ?? 0);
    byCategory[c].lines += 1;
    byCategory[c].net += Number(l.net_uzs ?? 0);
  }

  const raw = clients[0] as Record<string, unknown>;
  const effective = raw.assigned_owner ?? raw.client_owner;
  const record = labelOwners(reps, { ...raw, historic_owner: raw.client_owner, client_owner: effective }, effective);
  // Which sources hold a number. Since v11 the numbers come with the record too.
  record.phone_in_colibri = !!str(raw.phone_colibri, 40);
  record.phone_in_marketing = !!str(raw.phone_marketing, 40);
  record.phone_in_telegram = !!str(raw.phone_telegram, 40);
  for (const k of WITHHELD) delete record[k];

  const evs = ((events ?? []) as Array<Record<string, unknown>>).map((e) => ({ ...e, actor: actorLabel(reps, e.actor) }));

  // Who settled each identity field, and how: the latest decision per field.
  const fieldMeta: Record<string, unknown> = {};
  for (const e of evs) {
    if (e.action === "field_resolved" && typeof e.field === "string" && !(e.field in fieldMeta)) {
      const [basis, source] = String(e.note ?? "").split(":");
      fieldMeta[e.field] = { by: e.actor, at: e.at, basis, source };
    }
    if (e.action === "single_source_accepted") {
      for (const f of String(e.new_value ?? "").split(",")) {
        if (f && !(f in fieldMeta)) fieldMeta[f] = { by: e.actor, at: e.at, basis: "rule", source: null };
      }
    }
  }

  // Suspected duplicates still to be looked at: named in a load-time note, not
  // cleared as different people, and not already merged away.
  const cleared = new Set(evs.filter((e) => e.action === "duplicate_cleared").map((e) => String(e.new_value)));
  const suspects = new Set<string>();
  for (const e of evs) {
    if (e.action !== "duplicate_suspect") continue;
    for (const m of String(e.note ?? "").match(DUP_RE) ?? []) if (m !== id && !cleared.has(m)) suspects.add(m);
  }
  let duplicates: unknown[] = [];
  if (suspects.size) {
    const list = [...suspects].map((x) => `"${x}"`).join(",");
    const rows = await select(`crm_queue?client_id=in.(${encodeURIComponent(list)})&select=${LIST_COLUMNS}`);
    duplicates = ((rows ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.review_status !== "merged" && r.review_status !== "deleted")
      .map((r) => labelOwners(reps, r, r.client_owner));
  }

  const telegram = await telegramFor(id, reps, (chats ?? []) as Array<Record<string, unknown>>,
    (missed ?? []) as Array<Record<string, unknown>>);

  // v11: every contact, newest first; who made it and who logged it as the
  // page shows people. The one who logged it can take it back for 15 minutes.
  const now = Date.now();
  const contactRows = ((contacts ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id, contacted_on: c.contacted_on, channel: c.channel, note: c.note,
    by: actorLabel(reps, c.by_name), logged_by: actorLabel(reps, c.created_by), logged_at: c.created_at,
    can_remove: !!sess && c.created_by === sess.name && now - new Date(String(c.created_at)).getTime() < 15 * 60_000,
  }));
  const p0 = ((personal ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const personalOut = p0 ? { ...p0 } : null;
  if (personalOut) for (const k of ["sizes_by", "prefs_by", "address_by", "about_by"]) personalOut[k] = actorLabel(reps, personalOut[k]);
  if (personalOut) delete personalOut.client_id;
  const dateRows = ((dates ?? []) as Array<Record<string, unknown>>).map((d) => ({
    id: d.id, kind: d.kind, label: d.label, month: d.month, day: d.day, year: d.year, added_by: actorLabel(reps, d.created_by),
  }));

  return {
    client: record,
    telegram,
    contacts: contactRows,
    personal: personalOut,
    important_dates: dateRows,
    queue: queue?.[0] ? labelOwners(reps, queue[0], queue[0].client_owner) : null,
    transactions: lines,
    events: evs,
    field_meta: fieldMeta,
    duplicates,
    rollup: {
      lines: lines.length,
      net: lines.reduce((a, l) => a + Number(l.net_uzs ?? 0), 0),
      by_brand: byBrand,
      by_category: byCategory,
    },
  };
}

// The Telegram block of a card: the linked chat, chats suggested for this
// record, and its missed requests. No Telegram ID leaves; since v11 the chat's
// phone number does.
async function telegramFor(
  id: string, reps: RepMap, chats: Array<Record<string, unknown>>, missed: Array<Record<string, unknown>>,
) {
  const linked = chats.filter((c) => c.client_id === id);
  const suggested = chats.filter((c) =>
    c.client_id == null && c.link_status === "suggested" && Array.isArray(c.suggested_ids) &&
    (c.suggested_ids as string[]).includes(id)
  );
  // How many requests would move to this record if a suggestion is confirmed.
  const waiting: Record<string, number> = {};
  if (suggested.length) {
    const tids = suggested.map((c) => `"${String(c.telegram_id).replace(/[^0-9]/g, "")}"`).join(",");
    const rows = (await select(
      `crm_missed_demand?client_id=is.null&telegram_id=in.(${encodeURIComponent(tids)})&select=telegram_id`,
    )) as Array<{ telegram_id: string }>;
    for (const r of rows ?? []) waiting[r.telegram_id] = (waiting[r.telegram_id] ?? 0) + 1;
  }
  const clean = (c: Record<string, unknown>, withPos: boolean) => {
    const out: Record<string, unknown> = { ...c, ref: c.id, has_phone: !!str(c.phone, 40) };
    out.decided_by = actorLabel(reps, c.decided_by);
    delete out.id;
    delete out.telegram_id;
    delete out.client_id;
    delete out.suggested_ids;
    if (!withPos) for (const k of ["pos_revenue_uzs", "pos_items", "last_pos_purchase", "pos_brands"]) delete out[k];
    return out;
  };
  return {
    chats: linked.map((c) => clean(c, false)),
    suggested: suggested.map((c) => ({
      ...clean(c, true),
      also_suggested_for: (c.suggested_ids as string[]).filter((x) => x !== id),
      missed_requests: waiting[String(c.telegram_id)] ?? 0,
    })),
    missed: missed.map((m) => {
      const out: Record<string, unknown> = { ...m, status_by: actorLabel(reps, m.status_by) };
      delete out.telegram_id;
      delete out.client_id;
      return out;
    }),
  };
}

// ---------------------------------------------------------------- the list
// Values arriving as a list: known ones only.
function listOf(v: unknown, allowed: string[], field: string): string[] {
  if (v === undefined || v === null || v === "") return [];
  if (!Array.isArray(v)) throw new HttpErr(400, `${field} must be a list`);
  const out = (v as unknown[]).map((x) => str(x, 40)).filter((x): x is string => !!x);
  for (const x of out) if (!allowed.includes(x)) throw new HttpErr(400, `${field} must be taken from ${allowed.join(", ")}`);
  return [...new Set(out)];
}
// Free values (segments, lifecycles): letters, spaces and dashes only.
function words(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set((v as unknown[]).map((x) => str(x, 40))
    .filter((x): x is string => !!x && /^[A-Za-z][A-Za-z \-]*$/.test(x)))].slice(0, 12);
}
const inList = (col: string, vals: string[]) =>
  `${col}=in.(${encodeURIComponent(vals.map((x) => `"${x.replace(/"/g, "")}"`).join(","))})`;

// Every list filter, as PostgREST conditions. `except` leaves one column's own
// filter out, so its checklist can count every value under the others.
async function listFilters(body: Record<string, unknown>, reps: RepMap, except?: string): Promise<string[]> {
    const filters: string[] = [];
    const qClass = enumOrNull(body.queue_class, QUEUE_CLASSES, "queue_class");
    if (qClass) filters.push(`queue_class=eq.${qClass}`);
    // Review status. Merged and deleted records stay out of every view unless
    // asked for by name, so the list is the working set by default.
    const statuses = listOf(body.statuses, FACET_STATUSES, "statuses");
    if (except !== "status") {
      if (statuses.length) filters.push(`review_status=in.(${statuses.join(",")})`);
      else {
        const status = enumOrNull(body.status, REVIEW_STATUSES, "status") ?? "active";
        if (status === "done") filters.push("review_status=in.(clean,checked)");
        else if (status === "active") filters.push("review_status=not.in.(merged,deleted)");
        else if (status !== "all") filters.push(`review_status=eq.${status}`);
      }
    } else if (!statuses.length) {
      // Counting statuses: merged and deleted stay out unless asked for.
      const status = enumOrNull(body.status, REVIEW_STATUSES, "status") ?? "active";
      if (status === "active" || status === "done" || FACET_STATUSES.includes(status)) filters.push("review_status=not.in.(merged,deleted)");
    }
    const rType = enumOrNull(body.record_type, RECORD_TYPES, "record_type");
    if (rType) filters.push(`record_type=eq.${rType}`);
    const rState = enumOrNull(body.record_state, RECORD_STATES, "record_state");
    if (rState) filters.push(`record_state=eq.${rState}`);
    const abc = enumOrNull(body.abc_class, ABC_CLASSES, "abc_class");
    const abcs = listOf(body.abc_classes, ABC_CLASSES, "abc_classes");
    if (except !== "abc") {
      if (abcs.length) filters.push(`abc_class=in.(${abcs.join(",")})`);
      else if (abc) filters.push(`abc_class=eq.${abc}`);
    }

    const lifecycle = str(body.lifecycle_status, 40);
    const lifecycles = words(body.lifecycles);
    if (except !== "lifecycle") {
      if (lifecycles.length) filters.push(inList("lifecycle_status", lifecycles));
      else if (lifecycle) filters.push(`lifecycle_status=eq.${encodeURIComponent(lifecycle)}`);
    }
    const segment = str(body.rfm_segment, 40);
    // Several segments at once (the priority win-back list is two).
    const segs = words(body.segments);
    if (except !== "segment") {
      if (segs.length) filters.push(inList("rfm_segment", segs));
      else if (segment) filters.push(`rfm_segment=eq.${encodeURIComponent(segment)}`);
    }
    // The page only ever knows labels, but accept either so a link or a saved
    // view built from a source name still resolves.
    const owner = str(body.client_owner, 80);
    const ownerLabels = Array.isArray(body.owners)
      ? (body.owners as unknown[]).map((x) => str(x, 80)).filter((x): x is string => !!x).slice(0, 20) : [];
    if (except !== "owner") {
      if (ownerLabels.length) {
        const sources = ownerLabels.map((l) => reps.toSource.get(l.toLowerCase())).filter((x): x is string => !!x);
        filters.push(sources.length ? inList("client_owner", sources) : "client_owner=eq.__none__");
      } else if (owner) {
        const source = reps.toSource.get(owner.toLowerCase()) ?? owner;
        filters.push(`client_owner=eq.${encodeURIComponent(source)}`);
      }
    }

    // v12: records the team typed in at the counter.
    const hand = enumOrNull(body.added, ["only", "exclude"], "added");
    if (hand === "only") filters.push("added_by_hand=is.true");
    if (hand === "exclude") filters.push("added_by_hand=is.false");

    // Founders' and related accounts, which every retail figure leaves out.
    const related = enumOrNull(body.related, ["exclude", "only"], "related");
    if (related === "exclude") filters.push("related_party=is.false");
    if (related === "only") filters.push("related_party=is.true");

    // Owner status is resolved against crm_sales_reps at request time, so it
    // follows the roster rather than a list baked into the page.
    const ownerStatus = enumOrNull(body.owner_status, OWNER_STATUSES, "owner_status");
    if (ownerStatus) {
      const activeNamed = [...reps.active].filter((n) => n !== "Unassigned");
      const quoted = activeNamed.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
      if (ownerStatus === "unassigned") {
        filters.push("client_owner=eq.Unassigned");
      } else if (ownerStatus === "assignable") {
        filters.push(activeNamed.length
          ? `client_owner=in.(${encodeURIComponent(quoted)})`
          : "client_owner=eq.__none__");
      } else {
        filters.push("client_owner=neq.Unassigned");
        filters.push("client_owner=not.is.null");
        if (activeNamed.length) filters.push(`client_owner=not.in.(${encodeURIComponent(quoted)})`);
      }
    }

    // Drill-down from the insights page.
    if (body.first_year !== undefined && body.first_year !== null && body.first_year !== "") {
      const y = intIn(body.first_year, 2000, 2100, 0);
      if (!y) throw new HttpErr(400, "first_year must be a year");
      filters.push(`first_purchase_at=gte.${y}-01-01`, `first_purchase_at=lte.${y}-12-31`);
    }
    const occ = enumOrNull(body.occasions, Object.keys(OCCASION_BUCKETS), "occasions");
    if (occ) filters.push(...OCCASION_BUCKETS[occ]);
    const nb = enumOrNull(body.brands, Object.keys(BRAND_BUCKETS), "brands");
    if (nb) filters.push(...BRAND_BUCKETS[nb]);
    if (body.birth_month !== undefined && body.birth_month !== null && body.birth_month !== "") {
      const m = intIn(body.birth_month, 1, 12, 0);
      if (!m) throw new HttpErr(400, "birth_month must be 1 to 12");
      filters.push(`birth_month=eq.${m}`);
    }
    const dnc = enumOrNull(body.do_not_contact, ["exclude", "only"], "do_not_contact");
    if (dnc === "exclude") filters.push("do_not_contact=is.false");
    if (dnc === "only") filters.push("do_not_contact=is.true");
    // Everyone who bought a brand, or a category, at least once.
    for (const key of ["brand", "category"] as const) {
      const v = str(body[key], 60);
      if (!v) continue;
      const hits = (await select(
        `crm_transactions?${key}=eq.${encodeURIComponent(v)}&select=client_id`,
      )) as Array<{ client_id: string }>;
      const ids = [...new Set((hits ?? []).map((h) => h.client_id))].filter((id) => /^(DLD|PRS)-\d{3,4}$/.test(id));
      filters.push(ids.length ? `client_id=in.(${ids.join(",")})` : "client_id=eq.__none__");
    }

    // v9: named records (the page's recently opened row), and birthdays soon.
    if (Array.isArray(body.ids)) {
      const ids = (body.ids as unknown[]).map((x) => str(x, 16))
        .filter((x): x is string => !!x && /^(DLD|PRS)-\d{3,4}$/.test(x)).slice(0, 20);
      filters.push(ids.length ? `client_id=in.(${ids.join(",")})` : "client_id=eq.__none__");
    }
    if (body.birthday_within !== undefined && body.birthday_within !== null && body.birthday_within !== "") {
      const n = intIn(body.birthday_within, 0, 60, 7);
      const ids = ((await rpc("crm_birthday_ids", { p_days: n })) as string[] ?? [])
        .filter((id) => /^(DLD|PRS)-\d{3,4}$/.test(id));
      filters.push(ids.length ? `client_id=in.(${ids.join(",")})` : "client_id=eq.__none__");
    }

    // v10: records with an open missed request (a kind, or any; optionally one
    // brand), and records with or without a Telegram chat.
    const missedKind = enumOrNull(body.missed, [...MISSED_KINDS, "any"], "missed");
    const missedBrand = str(body.missed_brand, 60);
    if (missedKind || missedBrand) {
      const ids = ((await rpc("crm_missed_ids", {
        p_kind: missedKind && missedKind !== "any" ? missedKind : null, p_brand: missedBrand,
      })) as string[] ?? []).filter((id) => /^(DLD|PRS)-\d{3,4}$/.test(id));
      filters.push(ids.length ? `client_id=in.(${ids.join(",")})` : "client_id=eq.__none__");
    }
    const tg = enumOrNull(body.telegram, ["only", "exclude"], "telegram");
    if (tg === "only") filters.push("in_telegram=is.true");
    if (tg === "exclude") filters.push("in_telegram=is.false");

    // An item on the health page's attention list.
    const attention = enumOrNull(body.attention, ATTENTION_KEYS, "attention");
    if (attention) {
      const ids = ((await rpc("crm_attention_ids", { p_key: attention })) as string[] ?? [])
        .filter((id) => /^(DLD|PRS)-\d{3,4}$/.test(id));
      filters.push(ids.length ? `client_id=in.(${ids.join(",")})` : "client_id=eq.__none__");
    }

    // Search by reference or by name, for when a client is in the boutique.
    // Every word must match somewhere; ё and е are treated as one letter.
    // v11: a search of digits (four or more, nothing else but spaces, + and
    // dashes) also finds the number.
    const q = searchTerm(body.q);
    if (q && /^[\d\s+\-]+$/.test(q) && q.replace(/\D/g, "").length >= 4) {
      const digits = q.replace(/\D/g, "");
      const ids = ((await rpc("crm_phone_ids", { p_digits: digits })) as string[] ?? [])
        .filter((id) => /^(DLD|PRS)-\d{3,4}$/.test(id));
      const tree = [`client_id.ilike.*${digits}*`, ...(ids.length ? [`client_id.in.(${ids.join(",")})`] : [])].join(",");
      filters.push(`or=${encodeURIComponent("(" + tree + ")")}`);
    } else if (q) {
      const words = q.toLowerCase().replace(/ё/g, "е").replace(/["'.:]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4);
      if (words.length) {
        const tree = words.map((w) => `or(client_id.ilike.*${w}*,name_search.ilike.*${w}*)`).join(",");
        filters.push(`and=${encodeURIComponent("(" + tree + ")")}`);
      }
    }

    // v11: not contacted in N days (or never).
    if (body.not_contacted !== undefined && body.not_contacted !== null && body.not_contacted !== "") {
      const n = intIn(body.not_contacted, 1, 3650, 0);
      if (!n) throw new HttpErr(400, "not_contacted must be a number of days");
      const since = new Date(Date.now() + 5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
      filters.push(`or=${encodeURIComponent(`(last_contact_on.is.null,last_contact_on.lt.${since})`)}`);
    }

    return filters;
}

// ---------------------------------------------------------------- the actions
async function handle(req: Request, body: Record<string, unknown>) {
  const action = str(body.action, 40);

  if (action === "health") {
    await select("crm_clients?select=client_id&limit=1");
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
      `board_users?passcode_hash=eq.${hash}&active=is.true&select=name,can_view_crm,can_edit_crm`,
    );
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    if (!user.can_view_crm) throw new HttpErr(403, "This account does not have access to the CRM.");

    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    await insert("editor_sessions", {
      token,
      display_name: user.name,
      expires_at: expires,
      can_view_crm: true,
      can_edit_crm: !!user.can_edit_crm,
    }, "return=minimal");
    return { token, name: user.name, expires_at: expires, can_edit: !!user.can_edit_crm };
  }

  if (action === "ping") {
    const sess = await requireSession(body.token);
    return { ok: true, name: sess.name, can_edit: sess.canEdit, can_import: sess.canImport, my_rep: sess.repLabel };
  }

  // Everything the page needs once, at open: the rep labels, the value
  // mappings, the owner list and the headline counts.
  if (action === "reference") {
    const sess = await requireSession(body.token);
    const [reps, mappings, queue] = await Promise.all([
      select("crm_sales_reps?select=label,active&order=label"),
      select("crm_value_mappings?select=field,raw_value,db_value,extra&order=field,raw_value"),
      select("crm_queue?select=review_status,record_type,conflict_fields,gap_fields,lifetime_spend_uzs"),
    ]);
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    // Review work done this week and today, counted as records touched.
    const recent = await select(
      `crm_events?at=gte.${since}&action=in.(${REVIEW_ACTIONS.join(",")})&actor=neq.system&select=client_id,at`,
    );

    const all = (queue ?? []) as Array<Record<string, number | string | null>>;
    // Telegram leads sit outside the review and are counted apart.
    const live = all.filter((r) => r.review_status !== "merged" && r.review_status !== "deleted");
    const rows = live.filter((r) => r.review_status !== "lead");
    const bucket = (st: string) => rows.filter((r) => r.review_status === st);
    const sum = (rs: typeof rows, k: string) =>
      rs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const open = rows.filter((r) => r.review_status === "decision" || r.review_status === "confirm");
    const today = new Date().toISOString().slice(0, 10);

    return {
      name: sess.name,
      can_edit: sess.canEdit,
      can_import: sess.canImport,
      my_rep: sess.repLabel,
      sales_reps: reps,
      value_mappings: mappings,
      totals: {
        records: rows.length,
        clients: rows.filter((r) => r.record_type === "client").length,
        prospects: rows.filter((r) => r.record_type === "prospect").length,
        leads: live.length - rows.length,
        decision: bucket("decision").length,
        confirm: bucket("confirm").length,
        clean: bucket("clean").length,
        checked: bucket("checked").length,
        set_aside: bucket("set_aside").length,
        done: bucket("clean").length + bucket("checked").length,
        deleted: all.filter((r) => r.review_status === "deleted").length,
        merged: all.filter((r) => r.review_status === "merged").length,
        // v5 names, kept so an older page still reads sensibly
        conflict: bucket("decision").length,
        gap: bucket("confirm").length,
        conflict_fields: sum(open, "conflict_fields"),
        gap_fields: sum(open, "gap_fields"),
        spend_in_conflict: sum(bucket("decision"), "lifetime_spend_uzs"),
      },
      activity: {
        week: new Set(((recent ?? []) as Array<{ client_id: string }>).map((e) => e.client_id)).size,
        today: new Set(((recent ?? []) as Array<{ client_id: string; at: string }>)
          .filter((e) => String(e.at).slice(0, 10) === today).map((e) => e.client_id)).size,
      },
    };
  }

  // The list. Filters compose; anything left out is simply not applied.
  if (action === "clients") {
    await requireSession(body.token);
    const reps = await repMap();
    const filters = await listFilters(body, reps);

    // v11: sort on any column (order_by + dir); the older `sort` keys still work.
    const col = ORDER_COLUMNS[str(body.order_by, 20) ?? ""];
    const dir = str(body.dir, 4) === "asc" ? "asc" : "desc";
    const order = col
      ? `${col}.${dir}.nullslast,client_id.asc`
      : (SORTS[str(body.sort, 20) ?? "spend"] ?? SORTS.spend);
    const limit = intIn(body.limit, 1, PAGE_MAX, PAGE_DEFAULT);
    const offset = intIn(body.offset, 0, 100000, 0);

    const path = `crm_queue?select=${LIST_COLUMNS}&${filters.join("&")}${filters.length ? "&" : ""}` +
      `order=${order}&limit=${limit}&offset=${offset}`;
    const { rows, total } = await selectWithCount(path);
    const labelled = (rows as Array<Record<string, unknown>>).map((r) => labelOwners(reps, r, r.client_owner));
    return { rows: labelled, total, limit, offset };
  }

  // v11: a column checklist. Each value of one column with its count, under
  // every other filter in force.
  if (action === "facets") {
    await requireSession(body.token);
    const column = enumOrNull(body.column, Object.keys(FACET_COLUMNS), "column");
    if (!column) throw new HttpErr(400, "Say which column.");
    const reps = await repMap();
    const filters = await listFilters(body, reps, column);
    const field = FACET_COLUMNS[column];
    const rows = (await select(`crm_queue?select=${field}&${filters.join("&")}${filters.length ? "&" : ""}limit=5000`)) as
      Array<Record<string, unknown>>;
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      const raw = r[field];
      const v = column === "owner" ? (asLabel(reps, raw) ?? "") : (raw === null || raw === undefined ? "" : String(raw));
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return { column, values: [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count) };
  }

  // One card. The client row, every line they have bought, and the log.
  //
  // Names and dates of birth are returned here, to a session that has already
  // proved CRM rights — the same posture the board takes with topic text. Since
  // v11 phone numbers are too (see WITHHELD). Names and numbers can be searched
  // (see `clients`), but there is no bulk export of personal fields.
  if (action === "client") {
    const sess = await requireSession(body.token);
    return await cardFor(clientId(body.id), sess);
  }

  // A quick look at another record, for the merge dialog.
  if (action === "peek") {
    await requireSession(body.token);
    const id = clientId(body.id);
    const reps = await repMap();
    const rows = await select(`crm_queue?client_id=eq.${id}&select=${LIST_COLUMNS}`);
    if (!rows?.length) throw new HttpErr(404, "No record with that reference.");
    return { record: labelOwners(reps, rows[0], rows[0].client_owner) };
  }

  // ---------------------------------------------------------------- writes
  // Each returns the card as it now stands, so the page redraws from the truth.
  if (action === "resolve_field") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const field = enumOrNull(body.field, FIELDS, "field");
    const source = enumOrNull(body.source, SOURCES, "source");
    const basis = enumOrNull(body.basis, BASES, "basis");
    if (!field || !source || !basis) throw new HttpErr(400, "Say which field, which value and how it was confirmed.");
    await rpc("crm_resolve_field", {
      p_id: id, p_field: field, p_source: source, p_value: str(body.value, 120), p_basis: basis, p_actor: sess.name,
    });
    return await cardFor(id, sess);
  }

  if (action === "reset_field") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const field = enumOrNull(body.field, FIELDS, "field");
    if (!field) throw new HttpErr(400, "Say which field.");
    await rpc("crm_reset_field", { p_id: id, p_field: field, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "accept_single_source") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    await rpc("crm_accept_single_source", { p_id: id, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "set_state") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const state = enumOrNull(body.state, STATES, "state");
    if (!state) throw new HttpErr(400, "Say which state.");
    await rpc("crm_set_state", { p_id: id, p_state: state, p_reason: str(body.reason, 300), p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "assign_owner") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const reps = await repMap();
    const label = str(body.owner, 80);
    const source = label ? reps.toSource.get(label.toLowerCase()) : undefined;
    if (!source) throw new HttpErr(409, "Choose a current sales rep or the shared list.");
    await rpc("crm_assign_owner", { p_id: id, p_owner: source, p_reason: str(body.reason, 300), p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "set_contact") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const dnc = typeof body.do_not_contact === "boolean" ? body.do_not_contact : null;
    await rpc("crm_set_contact", {
      p_id: id, p_do_not_contact: dnc, p_contact_note: str(body.contact_note, 300),
      p_referred_by: str(body.referred_by, 120), p_actor: sess.name,
    });
    return await cardFor(id, sess);
  }

  if (action === "add_note") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    await rpc("crm_add_note", { p_id: id, p_note: str(body.note, 1000), p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "clear_duplicate") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const other = clientId(body.other);
    await rpc("crm_clear_duplicate", { p_id: id, p_other: other, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "merge") {
    const sess = await requireEditor(body.token);
    const keep = clientId(body.keep);
    const drop = clientId(body.drop);
    await rpc("crm_merge", { p_keep: keep, p_drop: drop, p_reason: str(body.reason, 300), p_actor: sess.name });
    return await cardFor(keep, sess);
  }

  // v11: the contact log. "By" is the person signed in (as their rep label if
  // they are one), or a current sales rep chosen by label.
  if (action === "contact_add") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const reps = await repMap();
    const on = str(body.on, 10);
    if (!on || !/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new HttpErr(400, "Say when the contact was, as YYYY-MM-DD.");
    const channel = enumOrNull(body.channel, CONTACT_CHANNELS, "channel");
    if (!channel) throw new HttpErr(400, "Say how the contact was made.");
    const byRaw = str(body.by, 80) ?? "me";
    let by: string;
    if (byRaw === "me") {
      by = (sess.repLabel && reps.toSource.get(sess.repLabel.toLowerCase())) || sess.name;
    } else {
      const source = reps.toSource.get(byRaw.toLowerCase());
      if (!source || !reps.active.has(source) || source === "Unassigned") throw new HttpErr(409, "Choose yourself or a current sales rep.");
      by = source;
    }
    await rpc("crm_contact_add", { p_id: id, p_on: on, p_by: by, p_channel: channel, p_note: str(body.note, 500), p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "contact_remove") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const c = intIn(body.contact, 1, 1_000_000_000, 0);
    if (!c) throw new HttpErr(400, "Say which contact.");
    await rpc("crm_contact_remove", { p_id: id, p_contact: c, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  // v11: personal data, one group at a time.
  if (action === "personal_set") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const group = enumOrNull(body.group, PERSONAL_GROUPS, "group");
    if (!group) throw new HttpErr(400, "Say which group.");
    const v = (body.values && typeof body.values === "object" && !Array.isArray(body.values)) ? body.values as Record<string, unknown> : {};
    const clean: Record<string, unknown> = {};
    if (group === "sizes") {
      clean.ring_sizes = Array.isArray(v.ring_sizes) ? (v.ring_sizes as unknown[]).slice(0, 6).map((x) => Number(x)) : [];
      clean.wrist_cm = v.wrist_cm === null || v.wrist_cm === undefined || v.wrist_cm === "" ? null : Number(v.wrist_cm);
      clean.necklace_cm = v.necklace_cm === null || v.necklace_cm === undefined || v.necklace_cm === "" ? null : Number(v.necklace_cm);
      clean.note = str(v.note, 200);
      if ((clean.ring_sizes as number[]).some((x) => !Number.isFinite(x)) ||
          (clean.wrist_cm !== null && !Number.isFinite(clean.wrist_cm)) ||
          (clean.necklace_cm !== null && !Number.isFinite(clean.necklace_cm))) throw new HttpErr(400, "Sizes must be numbers.");
    } else if (group === "prefs") {
      const arr = (x: unknown) => Array.isArray(x) ? (x as unknown[]).map((y) => str(y, 30)).filter((y): y is string => !!y).slice(0, 10) : [];
      Object.assign(clean, { metals: arr(v.metals), stones: arr(v.stones), styles: arr(v.styles),
        fav_brands: str(v.fav_brands, 300), dislikes: str(v.dislikes, 300), note: str(v.note, 300) });
    } else if (group === "address") {
      clean.address = str(v.address, 500);
    } else {
      clean.about = str(v.about, 2000);
    }
    await rpc("crm_set_personal", { p_id: id, p_group: group, p: clean, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "date_add") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const kind = enumOrNull(body.kind, DATE_KINDS, "kind");
    if (!kind) throw new HttpErr(400, "Say what the date is.");
    const month = intIn(body.month, 0, 12, 0), day = intIn(body.day, 0, 31, 0);
    const year = body.year === undefined || body.year === null || body.year === "" ? null : intIn(body.year, 0, 3000, 0);
    await rpc("crm_date_add", { p_id: id, p_kind: kind, p_label: str(body.label, 80), p_month: month || null, p_day: day || null,
      p_year: year || null, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  if (action === "date_remove") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const d = intIn(body.date, 1, 1_000_000_000, 0);
    if (!d) throw new HttpErr(400, "Say which date.");
    await rpc("crm_date_remove", { p_id: id, p_date: d, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  // v12: a client added by hand at the counter. The record is a prospect until
  // Colibri brings a purchase; everything typed sits on the "entered by the
  // team" side, so the clean-up still asks a second person to confirm it.
  if (action === "client_add") {
    const sess = await requireEditor(body.token);
    const dob = str(body.dob, 10);
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new HttpErr(400, "Give the date of birth as YYYY-MM-DD.");
    const payload = {
      name: str(body.name, 120),
      phone: str(body.phone, 40),
      gender: enumOrNull(body.gender, ["M", "F"], "gender"),
      dob,
      owner: str(body.owner, 80),
      how_met: str(body.how_met, 80),
      note: str(body.note, 500),
      force: body.force === true,
    };
    if (!payload.name) throw new HttpErr(400, "Write the client's name.");
    const id = await rpc("crm_client_add", { p: payload, p_actor: sess.name }) as string;
    return await cardFor(id, sess);
  }

  // v10: a suggested Telegram chat is this record's, or it is not.
  if (action === "telegram_link" || action === "telegram_reject") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const chat = intIn(body.chat, 1, 1_000_000_000, 0);
    if (!chat) throw new HttpErr(400, "Say which chat.");
    await rpc(action === "telegram_link" ? "crm_telegram_link" : "crm_telegram_reject",
      { p_id: id, p_chat: chat, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  // A missed request: followed up, closed, or open again.
  if (action === "missed_status") {
    const sess = await requireEditor(body.token);
    const id = clientId(body.id);
    const m = intIn(body.missed, 1, 1_000_000_000, 0);
    const status = enumOrNull(body.status, MISSED_STATUSES, "status");
    if (!m || !status) throw new HttpErr(400, "Say which request and which status.");
    await rpc("crm_missed_set", { p_id: id, p_missed: m, p_status: status, p_actor: sess.name });
    return await cardFor(id, sess);
  }

  // Phase 3. Everything on the Insights page in one document. Retail by
  // default; include_related adds the founders' circle back in.
  if (action === "insights") {
    await requireSession(body.token);
    const [data, telegram] = await Promise.all([
      rpc("crm_insights", { p_include_related: body.include_related === true }),
      rpc("crm_telegram_summary", {}),
    ]);
    return { ...(data ?? {}), telegram: telegram ?? null };
  }

  // Phase 4. How clean the file is and how the review is going.
  if (action === "data_health") {
    const sess = await requireSession(body.token);
    const data = await rpc("crm_health", {});
    return { ...(data ?? {}), can_import: sess.canImport };
  }

  // The Colibri refreshes, newest first.
  if (action === "imports") {
    await requireImporter(body.token);
    const reps = await repMap();
    const rows = ((await rpc("crm_import_list", {})) ?? []) as Array<Record<string, unknown>>;
    for (const r of rows) for (const k of BATCH_ACTORS) r[k] = actorLabel(reps, r[k]);
    return { rows };
  }

  if (action === "import") {
    await requireImporter(body.token);
    return await importDetail(batchId(body.id));
  }

  // Place the lines of one name the refresh could not: one of the suggested
  // clients, a new client, leave them out, or take the decision back.
  if (action === "import_decide") {
    const sess = await requireImporter(body.token);
    const id = batchId(body.id);
    const key = str(body.name_key, 200);
    if (!key) throw new HttpErr(400, "Say which name.");
    const raw = str(body.decision, 16) ?? "";
    const decision = ["new", "skip", "clear"].includes(raw) ? raw : clientId(raw);
    await rpc("crm_import_decide", { p_batch: id, p_name_key: key, p_decision: decision, p_actor: sess.name });
    return await importDetail(id);
  }

  if (action === "import_apply" || action === "import_discard" || action === "import_undo") {
    const sess = await requireImporter(body.token);
    const id = batchId(body.id);
    const fn = { import_apply: "crm_import_apply", import_discard: "crm_import_discard", import_undo: "crm_import_undo" }[action];
    await rpc(fn, { p_batch: id, p_actor: sess.name });
    return await importDetail(id);
  }

  // The store-facing numbers. Computed here rather than in the page so the
  // figures cannot drift between screens.
  if (action === "stats") {
    await requireSession(body.token);
    const includeRelated = body.include_related === true;
    const reps = await repMap();
    const all = (await select(
      "crm_clients?record_type=eq.client&record_state=not.in.(merged,deleted,to_delete)&select=abc_class,rfm_segment,lifecycle_status,related_party," +
        "client_owner,assigned_owner,lifetime_spend_uzs,purchase_occasions,items_bought,last_purchase_at,first_purchase_at",
    )) as Array<Record<string, string | number | boolean | null>>;
    // Tally on the effective owner: the store's decision where there is one.
    for (const r of all) r.client_owner = r.assigned_owner ?? r.client_owner;

    const related = all.filter((r) => r.related_party === true);
    const rows = includeRelated ? all : all.filter((r) => r.related_party !== true);

    const tally = (list: typeof rows, key: string, relabel = false) => {
      const out: Record<string, { clients: number; spend: number }> = {};
      for (const r of list) {
        const k = relabel
          ? (asLabel(reps, r[key]) ?? "Unassigned")
          : String(r[key] ?? "Unassigned");
        (out[k] ??= { clients: 0, spend: 0 });
        out[k].clients += 1;
        out[k].spend += Number(r.lifetime_spend_uzs ?? 0);
      }
      return out;
    };

    const spend = rows.map((r) => Number(r.lifetime_spend_uzs ?? 0)).sort((a, b) => b - a);
    const total = spend.reduce((a, b) => a + b, 0);
    const topTen = spend.slice(0, Math.ceil(spend.length * 0.1)).reduce((a, b) => a + b, 0);
    const occasions = rows.reduce((a, r) => a + Number(r.purchase_occasions ?? 0), 0);

    // Owned by someone who is no longer an assignable rep. "Unassigned" is
    // its own bucket, not an orphan: nobody lost it, nobody had it.
    const orphaned = rows.filter((r) => {
      const o = String(r.client_owner ?? "Unassigned");
      return o !== "Unassigned" && !reps.active.has(o);
    });

    return {
      basis: includeRelated ? "all clients" : "retail — related parties excluded",
      clients: rows.length,
      total_spend: total,
      average_spend: rows.length ? Math.round(total / rows.length) : 0,
      median_spend: spend.length ? spend[Math.floor(spend.length / 2)] : 0,
      top_decile_share: total ? topTen / total : 0,
      repeat_clients: rows.filter((r) => Number(r.purchase_occasions ?? 0) > 1).length,
      occasions,
      items: rows.reduce((a, r) => a + Number(r.items_bought ?? 0), 0),
      average_basket: occasions ? Math.round(total / occasions) : 0,
      related_party: {
        clients: related.length,
        spend: related.reduce((a, r) => a + Number(r.lifetime_spend_uzs ?? 0), 0),
      },
      orphaned: {
        clients: orphaned.length,
        spend: orphaned.reduce((a, r) => a + Number(r.lifetime_spend_uzs ?? 0), 0),
        by_lifecycle: tally(orphaned, "lifecycle_status"),
        by_abc: tally(orphaned, "abc_class"),
      },
      by_abc: tally(rows, "abc_class"),
      by_segment: tally(rows, "rfm_segment"),
      by_lifecycle: tally(rows, "lifecycle_status"),
      by_owner: tally(rows, "client_owner", true),
    };
  }

  throw new HttpErr(400, `Unknown action: ${action}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

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
    if (status >= 500) console.error("crm-api failure:", message);
    return json({ error: message }, status);
  }
});
