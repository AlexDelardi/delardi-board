// Delardi Weekly Board — board API
//
// This function is the ONLY route to the data. The public page holds no database
// key at all: reads and writes both come through here and both require a session
// token, which is issued only in exchange for a passcode.
//
// v6: individual per-person logins (board_users) replaced the single shared
// passcode. Each session now carries two permission flags resolved at unlock —
// can_view_sensitive and can_view_email_suggestions — and snapshot filters what
// goes over the wire accordingly, rather than just tagging it in the UI.
//
// v7: the board is its own right. board_users.can_view_board must be true to
// unlock, sessions issued here are marked can_view_board, and every request
// checks both that mark and the person's row as it stands now. So a passcode
// given for the Client Instrument does not open the board, a CRM session token
// is refused here, and switching someone off takes effect on their next request
// rather than when their 8-hour session runs out.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_HOURS = 8;
const MAX_FAILS_PER_HOUR = 10;
const UNDO_WINDOW_MIN = 15;
const MAX_REORDER = 200;
const MAX_MEETING_ENTRIES = 100;

const STATUSES = ["not_started", "in_progress", "blocked", "needs_decision", "decided", "done", "parked"];
const PRIORITIES = ["high", "medium", "low"];
const SUGGESTION_CHANNELS = ["zoom", "email"];
const NO_BOARD = "This account does not have access to the Weekly Board.";

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

const patch = (path: string, row: unknown) =>
  db(path, { method: "PATCH", body: JSON.stringify(row), headers: { Prefer: "return=representation" } });

// ------------------------------------------------------------- sanitisation
const NUL_RE = new RegExp(String.fromCharCode(0), "g");
function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(NUL_RE, "").trim();
  return s ? s.slice(0, max) : null;
}

function reqStr(v: unknown, max: number, field: string): string {
  const s = str(v, max);
  if (!s) throw new HttpErr(400, `${field} is required`);
  return s;
}

function dateOrNull(v: unknown): string | null {
  const s = str(v, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function uuid(v: unknown, field: string): string {
  const s = str(v, 36) ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new HttpErr(400, `${field} is not a valid id`);
  }
  return s;
}

function enumOrNull(v: unknown, allowed: string[], field: string): string | null {
  const s = str(v, 32);
  if (s === null) return null;
  if (!allowed.includes(s)) throw new HttpErr(400, `${field} must be one of ${allowed.join(", ")}`);
  return s;
}

function pillarId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new HttpErr(400, "Pick a pillar.");
  return n;
}

// --------------------------------------------------------------- session mgmt
function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

interface Session {
  name: string;
  canViewSensitive: boolean;
  canViewEmailSuggestions: boolean;
}

async function requireSession(token: unknown): Promise<Session> {
  const t = str(token, 100);
  if (!t || t.length < 20) throw new HttpErr(401, "Enter your passcode to open the board.");
  const rows = await select(
    `editor_sessions?token=eq.${encodeURIComponent(t)}` +
      `&select=display_name,expires_at,can_view_board`,
  );
  if (!rows?.length) throw new HttpErr(401, "That session is not valid. Enter your passcode again.");
  if (new Date(rows[0].expires_at).getTime() < Date.now()) {
    throw new HttpErr(401, "Your session has expired. Enter your passcode again.");
  }
  // Only a session this function issued opens the board: a Client Instrument
  // session is refused, whoever holds it.
  if (!rows[0].can_view_board) throw new HttpErr(403, NO_BOARD);
  // Rights as they stand now, not as they stood at unlock.
  const name = rows[0].display_name as string;
  const users = await select(
    `board_users?name=eq.${encodeURIComponent(name)}&active=is.true` +
      `&select=can_view_board,can_view_sensitive,can_view_email_suggestions`,
  );
  const user = users?.[0];
  if (!user || !user.can_view_board) throw new HttpErr(403, NO_BOARD);
  return {
    name,
    canViewSensitive: !!user.can_view_sensitive,
    canViewEmailSuggestions: !!user.can_view_email_suggestions,
  };
}

async function logWrite(action: string, actor: string, targetId: string | null, payload: unknown) {
  try {
    await insert("write_log", { action, actor, target_id: targetId, payload }, "return=minimal");
  } catch {
    // Audit logging must never break a legitimate write.
  }
}

async function ensureWeek(weekStart: string) {
  await db("weeks?on_conflict=week_start", {
    method: "POST",
    body: JSON.stringify({ week_start: weekStart }),
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  });
}

// ---------------------------------------------------------------- the actions
async function handle(req: Request, body: Record<string, unknown>) {
  const action = str(body.action, 40);

  if (action === "health") {
    await select("pillars?select=id&limit=1");
    return { ok: true };
  }

  // One passcode per person now (board_users), not one shared secret typed
  // alongside a free-text name. Identity — and both permission flags — comes
  // from whichever row's passcode_hash the supplied passcode hashes to.
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
      `board_users?passcode_hash=eq.${hash}&active=is.true` +
        `&select=name,can_view_board,can_view_sensitive,can_view_email_suggestions`,
    );
    const user = matches?.[0];
    await insert("auth_attempts", { ip, ok: !!user }, "return=minimal");
    if (!user) throw new HttpErr(401, "That passcode is not right.");
    if (!user.can_view_board) throw new HttpErr(403, NO_BOARD);

    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    await insert("editor_sessions", {
      token,
      display_name: user.name,
      expires_at: expires,
      can_view_board: true,
      can_view_sensitive: !!user.can_view_sensitive,
      can_view_email_suggestions: !!user.can_view_email_suggestions,
    }, "return=minimal");
    return {
      token,
      name: user.name,
      expires_at: expires,
      can_view_sensitive: !!user.can_view_sensitive,
      can_view_email_suggestions: !!user.can_view_email_suggestions,
    };
  }

  if (action === "snapshot") {
    const sess = await requireSession(body.token);
    const [pillars, weeks, topics, updates, scoreboard, suggestions] = await Promise.all([
      select("pillars?select=*&order=sort_order"),
      select("weeks?select=*&order=week_start.desc"),
      select("topics?select=*&order=pillar_id,sort_order"),
      select("topic_updates?select=*&order=created_at.desc"),
      select("scoreboard?select=*&order=sort_order"),
      select("suggestions?state=eq.pending&select=*&order=sort_order"),
    ]);

    // Sensitive-flagged topics — and anything hung off them — never leave the
    // server for a session without read rights. Hidden, not just unstyled.
    let visTopics = topics ?? [];
    let visUpdates = updates ?? [];
    const hiddenTopicIds = new Set(
      (topics ?? []).filter((t: { sensitive?: boolean }) => t.sensitive).map((t: { id: string }) => t.id),
    );
    if (!sess.canViewSensitive) {
      visTopics = (topics ?? []).filter((t: { sensitive?: boolean }) => !t.sensitive);
      visUpdates = (updates ?? []).filter((u: { topic_id: string }) => !hiddenTopicIds.has(u.topic_id));
    }

    // Email-derived suggestions are Alex-only; everyone else's Suggested tab
    // only ever sees the Zoom-transcript channel.
    let visSuggestions = (suggestions ?? []).filter(
      (s: { channel?: string }) => sess.canViewEmailSuggestions || s.channel !== "email",
    );
    if (!sess.canViewSensitive) {
      visSuggestions = visSuggestions.filter(
        (s: { target_topic_id?: string | null }) =>
          !s.target_topic_id || !hiddenTopicIds.has(s.target_topic_id),
      );
    }

    return {
      name: sess.name,
      can_view_sensitive: sess.canViewSensitive,
      can_view_email_suggestions: sess.canViewEmailSuggestions,
      pillars, weeks, topics: visTopics, updates: visUpdates, scoreboard, suggestions: visSuggestions,
    };
  }

  if (action === "ping") {
    const sess = await requireSession(body.token);
    return {
      ok: true, name: sess.name,
      can_view_sensitive: sess.canViewSensitive, can_view_email_suggestions: sess.canViewEmailSuggestions,
    };
  }

  if (action === "add_topic") {
    const actor = (await requireSession(body.token)).name;
    const row = {
      pillar_id: pillarId(body.pillar_id),
      title: reqStr(body.title, 300, "Topic title"),
      detail: str(body.detail, 4000),
      owner: str(body.owner, 80),
      supporting: str(body.supporting, 80),
      sensitive: !!body.sensitive,
      status: enumOrNull(body.status, STATUSES, "status") ?? "not_started",
      priority: enumOrNull(body.priority, PRIORITIES, "priority") ?? "medium",
      next_step: str(body.next_step, 500),
      due_date: dateOrNull(body.due_date),
      first_raised_week: dateOrNull(body.week_start),
      status_week: dateOrNull(body.week_start),
      created_by: actor,
    };
    const created = await insert("topics", row);
    const id = created?.[0]?.id ?? null;
    await logWrite("add_topic", actor, id, { title: row.title, pillar_id: row.pillar_id });
    return { topic: created?.[0] ?? null };
  }

  if (action === "update_topic") {
    const actor = (await requireSession(body.token)).name;
    const id = uuid(body.id, "topic id");
    const p = (body.patch ?? {}) as Record<string, unknown>;
    const week = dateOrNull(body.week_start);
    const upd: Record<string, unknown> = {};
    if ("title" in p) upd.title = reqStr(p.title, 300, "Topic title");
    if ("detail" in p) upd.detail = str(p.detail, 4000);
    if ("owner" in p) upd.owner = str(p.owner, 80);
    if ("supporting" in p) upd.supporting = str(p.supporting, 80);
    if ("sensitive" in p) upd.sensitive = !!p.sensitive;
    if ("next_step" in p) upd.next_step = str(p.next_step, 500);
    if ("due_date" in p) upd.due_date = dateOrNull(p.due_date);
    if ("status" in p) {
      const s = enumOrNull(p.status, STATUSES, "status");
      if (s) {
        upd.status = s;
        // Which week this status took hold — lets "This week" drop a Done
        // topic once a later week starts, without an update row to key off.
        if (week) upd.status_week = week;
      }
    }
    if ("priority" in p) {
      const pr = enumOrNull(p.priority, PRIORITIES, "priority");
      if (pr) upd.priority = pr;
    }
    if ("pillar_id" in p) upd.pillar_id = pillarId(p.pillar_id);
    if ("archived" in p) upd.archived = !!p.archived;
    if (!Object.keys(upd).length) throw new HttpErr(400, "Nothing to change.");

    const updated = await patch(`topics?id=eq.${id}`, upd);
    await logWrite("update_topic", actor, id, upd);
    return { topic: updated?.[0] ?? null };
  }

  // Applied after a drag: the destination column's ids in their new order.
  // Handles both moving a card between pillars and reordering inside one.
  if (action === "reorder_topics") {
    const actor = (await requireSession(body.token)).name;
    const pid = pillarId(body.pillar_id);
    const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids : [];
    if (!ids.length) throw new HttpErr(400, "Nothing to reorder.");
    if (ids.length > MAX_REORDER) throw new HttpErr(400, "Too many topics in one reorder.");
    const clean = ids.map((v, i) => ({ id: uuid(v, `ordered_ids[${i}]`), sort_order: i + 1 }));

    for (const row of clean) {
      await patch(`topics?id=eq.${row.id}`, { pillar_id: pid, sort_order: row.sort_order });
    }
    await logWrite("reorder_topics", actor, null, { pillar_id: pid, count: clean.length });
    return { ok: true, count: clean.length };
  }

  if (action === "add_update") {
    const actor = (await requireSession(body.token)).name;
    const topicId = uuid(body.topic_id, "topic id");
    const week = dateOrNull(body.week_start);
    if (!week) throw new HttpErr(400, "A valid week is required.");
    const note = reqStr(body.note, 4000, "Update note");
    const statusAt = enumOrNull(body.status_at, STATUSES, "status");

    await ensureWeek(week);
    const created = await insert("topic_updates", {
      topic_id: topicId, week_start: week, note, status_at: statusAt, author: actor,
    });

    const topicPatch: Record<string, unknown> = { last_discussed_week: week };
    if (statusAt) { topicPatch.status = statusAt; topicPatch.status_week = week; }
    const nextStep = str(body.next_step, 500);
    if (nextStep !== null) topicPatch.next_step = nextStep;
    const owner = str(body.owner, 80);
    if (owner !== null) topicPatch.owner = owner;
    const supporting = str(body.supporting, 80);
    if (supporting !== null) topicPatch.supporting = supporting;
    const topic = await patch(`topics?id=eq.${topicId}`, topicPatch);

    await logWrite("add_update", actor, topicId, { week, status_at: statusAt });
    return { update: created?.[0] ?? null, topic: topic?.[0] ?? null };
  }

  // Applied once, in a batch, when a whole meeting is finalized: one
  // topic_updates row per finalized topic, plus the minutes text for the week.
  if (action === "finalize_meeting") {
    const actor = (await requireSession(body.token)).name;
    const week = dateOrNull(body.week_start);
    if (!week) throw new HttpErr(400, "A valid week is required.");
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) throw new HttpErr(400, "Nothing was finalized.");
    if (entries.length > MAX_MEETING_ENTRIES) throw new HttpErr(400, "Too many topics in one meeting.");
    const minutes = reqStr(body.minutes_md, 20000, "Minutes");

    await ensureWeek(week);

    const touched: string[] = [];
    for (const raw of entries) {
      const e = (raw ?? {}) as Record<string, unknown>;
      const topicId = uuid(e.topic_id, "topic id");
      const note = reqStr(e.note, 4000, "Update note");
      const statusAt = enumOrNull(e.status_at, STATUSES, "status");

      await insert("topic_updates", {
        topic_id: topicId, week_start: week, note, status_at: statusAt, author: actor,
      });
      const tp: Record<string, unknown> = { last_discussed_week: week };
      if (statusAt) { tp.status = statusAt; tp.status_week = week; }
      await patch(`topics?id=eq.${topicId}`, tp);
      touched.push(topicId);
    }

    await patch(`weeks?week_start=eq.${week}`, {
      minutes_md: minutes, finalized_by: actor, finalized_at: new Date().toISOString(),
    });

    await logWrite("finalize_meeting", actor, null, { week, count: touched.length });
    return { ok: true, count: touched.length };
  }

  // Accepting a suggestion applies the reviewer's edited values, not the drafted
  // ones. Accepting an update on an archived topic brings that topic back.
  if (action === "accept_suggestion") {
    const sess = await requireSession(body.token);
    const actor = sess.name;
    const id = uuid(body.id, "suggestion id");
    const rows = await select(`suggestions?id=eq.${id}&select=*`);
    if (!rows?.length) throw new HttpErr(404, "That suggestion no longer exists.");
    const s = rows[0];
    if (s.state !== "pending") throw new HttpErr(409, "That suggestion has already been dealt with.");
    if (s.channel === "email" && !sess.canViewEmailSuggestions) {
      throw new HttpErr(403, "Not available.");
    }

    const week = dateOrNull(body.week_start);
    if (!week) throw new HttpErr(400, "A valid week is required.");
    await ensureWeek(week);

    const note = reqStr(body.note ?? s.note, 4000, "Note");
    const status = enumOrNull(body.status ?? s.status, STATUSES, "status");
    const owner = str(body.owner ?? s.owner, 80);
    const supporting = str(body.supporting ?? s.supporting, 80);
    const nextStep = str(body.next_step ?? s.next_step, 500);
    const provenance = `\n\n— from ${s.source_meeting}${s.source_date ? ", " + s.source_date : ""}`;

    let topicId: string;
    if (s.kind === "new") {
      const created = await insert("topics", {
        pillar_id: pillarId(body.pillar_id ?? s.pillar_id),
        title: reqStr(body.title ?? s.title, 300, "Topic title"),
        detail: str(body.detail, 4000),
        owner,
        supporting,
        status: status ?? "not_started",
        priority: enumOrNull(body.priority, PRIORITIES, "priority") ?? "high",
        next_step: nextStep,
        first_raised_week: week,
        status_week: week,
        created_by: actor,
      });
      topicId = created?.[0]?.id;
    } else {
      topicId = uuid(s.target_topic_id, "target topic");
      // Bring it back onto the board: the meeting is the evidence it is live.
      await patch(`topics?id=eq.${topicId}`, { archived: false });
    }

    await insert("topic_updates", {
      topic_id: topicId, week_start: week, note: note + provenance,
      status_at: status, author: actor,
    });

    const tp: Record<string, unknown> = { last_discussed_week: week };
    if (status) { tp.status = status; tp.status_week = week; }
    if (owner !== null) tp.owner = owner;
    if (supporting !== null) tp.supporting = supporting;
    if (nextStep !== null) tp.next_step = nextStep;
    await patch(`topics?id=eq.${topicId}`, tp);

    await patch(`suggestions?id=eq.${id}`,
      { state: "accepted", decided_by: actor, decided_at: new Date().toISOString() });
    await logWrite("accept_suggestion", actor, topicId, { suggestion: id, kind: s.kind });
    return { ok: true, topic_id: topicId };
  }

  if (action === "dismiss_suggestion") {
    const sess = await requireSession(body.token);
    const actor = sess.name;
    const id = uuid(body.id, "suggestion id");
    const rows = await select(`suggestions?id=eq.${id}&select=channel`);
    if (rows?.length && rows[0].channel === "email" && !sess.canViewEmailSuggestions) {
      throw new HttpErr(403, "Not available.");
    }
    await patch(`suggestions?id=eq.${id}`,
      { state: "dismissed", decided_by: actor, decided_at: new Date().toISOString() });
    await logWrite("dismiss_suggestion", actor, null, { suggestion: id });
    return { ok: true };
  }

  if (action === "dismiss_all_suggestions") {
    const sess = await requireSession(body.token);
    const actor = sess.name;
    const requested = enumOrNull(body.channel, SUGGESTION_CHANNELS, "channel");
    if (requested === "email" && !sess.canViewEmailSuggestions) {
      throw new HttpErr(403, "Not available.");
    }
    // No channel specified and no email rights: never sweep up suggestions
    // this session cannot even see.
    const effectiveChannel = requested ?? (sess.canViewEmailSuggestions ? null : "zoom");

    const selectPath = effectiveChannel
      ? `suggestions?state=eq.pending&channel=eq.${effectiveChannel}&select=id`
      : `suggestions?state=eq.pending&select=id`;
    const pending = await select(selectPath);
    const ids: string[] = (pending ?? []).map((r: { id: string }) => r.id);
    if (ids.length) {
      const patchPath = effectiveChannel
        ? `suggestions?state=eq.pending&channel=eq.${effectiveChannel}`
        : `suggestions?state=eq.pending`;
      await patch(patchPath, { state: "dismissed", decided_by: actor, decided_at: new Date().toISOString() });
    }
    await logWrite("dismiss_all_suggestions", actor, null, { count: ids.length, channel: effectiveChannel });
    return { ok: true, count: ids.length };
  }

  if (action === "delete_update") {
    const actor = (await requireSession(body.token)).name;
    const id = uuid(body.id, "update id");
    const rows = await select(`topic_updates?id=eq.${id}&select=author,created_at`);
    if (!rows?.length) throw new HttpErr(404, "That update no longer exists.");
    const ageMin = (Date.now() - new Date(rows[0].created_at).getTime()) / 60000;
    if (rows[0].author !== actor) throw new HttpErr(403, "Only the author can remove an update.");
    if (ageMin > UNDO_WINDOW_MIN) {
      throw new HttpErr(403, `Updates can only be removed within ${UNDO_WINDOW_MIN} minutes. Add a correcting update instead.`);
    }
    await db(`topic_updates?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await logWrite("delete_update", actor, null, { update_id: id });
    return { ok: true };
  }

  if (action === "set_week") {
    const actor = (await requireSession(body.token)).name;
    const week = dateOrNull(body.week_start);
    if (!week) throw new HttpErr(400, "A valid week is required.");
    await ensureWeek(week);
    const upd: Record<string, unknown> = {};
    if ("note" in body) upd.note = str(body.note, 4000);
    if ("zoom_url" in body) {
      const u = str(body.zoom_url, 500);
      upd.zoom_url = u && /^https:\/\//i.test(u) ? u : null;
    }
    if ("label" in body) upd.label = str(body.label, 120);
    if (Object.keys(upd).length) await patch(`weeks?week_start=eq.${week}`, upd);
    await logWrite("set_week", actor, null, { week, ...upd });
    return { ok: true };
  }

  if (action === "set_scoreboard") {
    const actor = (await requireSession(body.token)).name;
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new HttpErr(400, "Bad scoreboard id.");
    const upd = { current_val: str(body.current_val, 60), updated_at: new Date().toISOString() };
    await patch(`scoreboard?id=eq.${id}`, upd);
    await logWrite("set_scoreboard", actor, null, { id, ...upd });
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
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  try {
    const result = await handle(req, body);
    return json(result);
  } catch (err) {
    const status = err instanceof HttpErr ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    if (status >= 500) console.error("board-api failure:", message);
    return json({ error: message }, status);
  }
});
