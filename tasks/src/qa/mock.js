// A stand-in for tasks-api, for the page's checks. It keeps the same rules as the database functions
// (db/migrations/20261124_tsk_1_tasks.sql) closely enough for the page: ribbons, the manage right, sensitive,
// client names with the CRM right only. Everything here is invented.
class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (s, m) => { throw new Fail(s, m); };
const NO_ACCESS = "This account does not have access to the task tracker.";

const PASSCODES = {
  demo:  { name: "Tessa Boss", floor: true,  backoffice: true,  manage: true,  sensitive: true,  crm: true,  inbox: true },
  lead:  { name: "Lena Lead",  floor: true,  backoffice: false, manage: true,  sensitive: false, crm: true,  inbox: false },
  rep:   { name: "Rita Rep",   floor: true,  backoffice: false, manage: false, sensitive: false, crm: true,  inbox: false },
  fresh: { name: "Nina New",   floor: true,  backoffice: false, manage: false, sensitive: false, crm: false, inbox: false },
  back:  { name: "Boris Back", floor: false, backoffice: true,  manage: false, sensitive: false, crm: false, inbox: false },
  none:  { name: "Nobody",     floor: false, backoffice: false },
};
const SCOPES = [
  { scope_id: 1, ribbon: "floor", slug: "operations", name_en: "Operations", name_ru: "Операции" },
  { scope_id: 2, ribbon: "floor", slug: "crm", name_en: "CRM", name_ru: "CRM" },
  { scope_id: 3, ribbon: "floor", slug: "brand", name_en: "Brand", name_ru: "Бренды" },
  { scope_id: 4, ribbon: "floor", slug: "aftersales", name_en: "Aftersales", name_ru: "Сервис" },
  { scope_id: 5, ribbon: "floor", slug: "sales", name_en: "Sales", name_ru: "Продажи" },
  { scope_id: 11, ribbon: "backoffice", slug: "marketing", name_en: "Marketing", name_ru: "Маркетинг" },
  { scope_id: 12, ribbon: "backoffice", slug: "retail", name_en: "Retail", name_ru: "Ритейл" },
  { scope_id: 13, ribbon: "backoffice", slug: "operations", name_en: "Operations", name_ru: "Операции" },
  { scope_id: 14, ribbon: "backoffice", slug: "steering", name_en: "Company Steering", name_ru: "Управление компанией" },
];
const CLIENTS = [{ client_id: "ZZC-0001", name: "Amira Stone" }, { client_id: "ZZC-0002", name: "Boris Stone" }, { client_id: "ZZC-0003", name: "Clara Vale" }];
const ribbonOf = (scope) => (SCOPES.find((s) => s.scope_id === scope) || {}).ribbon;
// the boutique's day (Tashkent), as the page works it out
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
const day = (n) => { const d = new Date(today() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

let tasks, comments, logs, sessions, calls, failNext, expired, sugs, seq;
const delay = {};
function mk(o) {
  seq++;
  const id = "00000000-0000-4000-8000-" + String(seq).padStart(12, "0");
  const t = Object.assign({ task_id: id, title: "", notes: null, owner: null, helper: null, due_on: null, priority: "normal", status: "todo", sensitive: false, piece_ref: null,
    archived: false, from_board: false, created_by: "Tessa Boss", created_at: new Date(Date.now() - (1000 - seq) * 60000).toISOString(), updated_at: new Date().toISOString(), done_at: null,
    checklist: [], clients: [] }, o);
  t.checklist = t.checklist.map((c, i) => ({ item_id: seq * 100 + i + 1, body: c.body, done: !!c.done }));
  tasks.push(t);
  return t;
}
function reset() {
  tasks = []; comments = {}; logs = {}; sessions = new Map(); calls = []; failNext = null; expired = false; seq = 0;
  for (const k of Object.keys(delay)) delete delay[k];
  mk({ scope_id: 2, title: "Call back about the ring size", owner: "Rita Rep", due_on: day(-2), priority: "high", clients: ["ZZC-0001"], checklist: [{ body: "Find the size", done: true }, { body: "Call" }] });
  mk({ scope_id: 1, title: "Polish the window display", owner: "Rita Rep", due_on: day(0) });
  mk({ scope_id: 5, title: "Send the watch quote", owner: "Rita Rep", due_on: day(3), status: "in_progress", piece_ref: "ZZ-REF-9" });
  mk({ scope_id: 3, title: "Learn the new collection", owner: "Rita Rep", due_on: day(20) });
  mk({ scope_id: 4, title: "Check the strap order", owner: "Rita Rep" });
  mk({ scope_id: 4, title: "Collect the repaired bracelet", owner: "Lena Lead", helper: "Rita Rep", due_on: day(1), status: "waiting", clients: ["ZZC-0002", "ZZC-0003"] });
  mk({ scope_id: 1, title: "Count the showcase stock", owner: "Lena Lead", due_on: day(5) });
  mk({ scope_id: 5, title: "Prepare the VIP evening list", owner: "Tessa Boss", due_on: day(2), priority: "high" });
  mk({ scope_id: 3, title: "Old finished floor task", owner: "Rita Rep", status: "done", done_at: new Date(Date.now() - 3 * 86400000).toISOString() });
  mk({ scope_id: 12, title: "Review the incentive scheme", owner: "Tessa Boss", due_on: day(4), from_board: true });
  mk({ scope_id: 11, title: "Plan the gifting campaign", owner: "Boris Back", due_on: day(-1), status: "waiting" });
  mk({ scope_id: 14, title: "Owner salary review", owner: "Tessa Boss", sensitive: true });
  comments[tasks[0].task_id] = [{ comment_id: 1, body: "She prefers a call after six", author: "Lena Lead", at: new Date(Date.now() - 86400000).toISOString() }];
  sugs = [
    { id: "10000000-0000-4000-8000-000000000001", kind: "update", title: "Review the incentive scheme", note: "The brand replied with terms", next_step: "Answer by Friday", owner: null, channel: "email",
      source: "Incentive thread", source_date: day(-1), evidence: null, scope_id: 12, task_id: tasks[9].task_id, task_title: "Review the incentive scheme" },
    { id: "10000000-0000-4000-8000-000000000002", kind: "new", title: "Ask about a spring event", note: "Raised on the call", next_step: null, owner: null, channel: "zoom",
      source: "Weekly call", source_date: day(-3), evidence: null, scope_id: 11, task_id: null, task_title: null },
  ];
}
const userOf = (name) => Object.values(PASSCODES).find((u) => u.name === name);
function session(token) {
  if (expired) fail(401, "Your session has expired. Enter your passcode again.");
  const s = sessions.get(token);
  if (!s) fail(401, "That session is not valid. Enter your passcode again.");
  const u = userOf(s.name);
  if (!u || !(u.floor || u.backoffice)) fail(403, NO_ACCESS);
  return u;
}
const canSee = (u, t) => !!u[ribbonOf(t.scope_id)] && (!t.sensitive || u.sensitive);
function out(u, t) {
  return Object.assign({}, t, { ribbon: ribbonOf(t.scope_id),
    checklist: t.checklist.map((c) => Object.assign({}, c)),
    clients: t.clients.map((id) => (u.crm ? { client_id: id, name: (CLIENTS.find((c) => c.client_id === id) || {}).name || null } : { client_id: null, name: null })),
    comments: (comments[t.task_id] || []).length });
}
const detail = (u, t) => Object.assign(out(u, t), { comment_list: (comments[t.task_id] || []).slice(), history: (logs[t.task_id] || []).slice().reverse() });
const log = (t, action, actor, what) => { (logs[t.task_id] = logs[t.task_id] || []).push({ action, actor, at: new Date().toISOString(), what: what || null }); };
function find(u, id) {
  const t = tasks.find((x) => x.task_id === id);
  if (!t || !canSee(u, t)) fail(409, "That task was not found.");
  return t;
}
function save(u, p) {
  let t, changed = [];
  if (!p || typeof p !== "object") fail(400, "task must be an object.");
  if (!p.task_id) {
    const ribbon = ribbonOf(p.scope_id);
    if (!ribbon) fail(409, "Choose a scope for the task.");
    if (!u[ribbon]) fail(409, "This account cannot add tasks there.");
    if (!String(p.title || "").trim()) fail(409, "Give the task a title.");
    t = mk({ scope_id: p.scope_id, title: String(p.title).trim(), owner: u.name, created_by: u.name, created_at: new Date().toISOString() });
    changed.push("created");
  } else {
    t = find(u, p.task_id);
    if (t.archived) fail(409, "This task is archived. Restore it to change it.");
    if ("title" in p) { if (!String(p.title || "").trim()) fail(409, "Give the task a title."); t.title = String(p.title).trim(); changed.push("title"); }
    if ("scope_id" in p && p.scope_id !== t.scope_id) { if (ribbonOf(p.scope_id) !== ribbonOf(t.scope_id)) fail(409, "A task stays on its ribbon: choose one of its scopes."); t.scope_id = p.scope_id; changed.push("scope"); }
  }
  const ribbon = ribbonOf(t.scope_id);
  if ("owner" in p) {
    const o = String(p.owner || "").trim() || null;
    if (o !== t.owner) {
      if (o !== u.name && !u.manage) fail(409, "Only a manager can give a task to someone else.");
      if (o && !(userOf(o) || {})[ribbon]) fail(409, "That person does not use this part of the tracker.");
      t.owner = o; changed.push("owner");
    }
  }
  for (const [k, key] of [["helper", "helper"], ["notes", "notes"], ["piece_ref", "piece"]]) if (k in p) { const v = String(p[k] || "").trim() || null; if (v !== t[k]) { t[k] = v; changed.push(key); } }
  if ("due_on" in p) { const v = p.due_on || null; if (v !== t.due_on) { t.due_on = v; changed.push("due"); } }
  if ("priority" in p && p.priority !== t.priority) { if (!["normal", "high"].includes(p.priority)) fail(409, "Priority is normal or high."); t.priority = p.priority; changed.push("priority"); }
  if ("status" in p && p.status !== t.status) {
    if (!["todo", "in_progress", "waiting", "done"].includes(p.status)) fail(409, "That is not a status.");
    t.status = p.status; t.done_at = p.status === "done" ? new Date().toISOString() : null; changed.push("status:" + p.status);
  }
  if ("sensitive" in p && !!p.sensitive !== t.sensitive) { if (ribbon !== "backoffice" || !u.sensitive) fail(409, "This account cannot mark a task sensitive."); t.sensitive = !!p.sensitive; changed.push("sensitive"); }
  if ("clients" in p) {
    if (!u.crm) fail(409, "Tagging a client needs CRM access.");
    for (const id of p.clients) if (!CLIENTS.some((c) => c.client_id === id)) fail(409, "That client was not found.");
    t.clients = [...new Set(p.clients)]; changed.push("clients");
  }
  if ("checklist" in p) {
    t.checklist = p.checklist.filter((c) => String(c.body || "").trim()).map((c, i) => ({ item_id: c.item_id || Date.now() % 1e9 * 10 + i, body: String(c.body).trim(), done: !!c.done }));
    changed.push("checklist");
  }
  t.updated_at = new Date().toISOString();
  log(t, p.task_id ? "changed" : "created", u.name, { changed });
  return out(u, t);
}
function handle(body) {
  calls.push(JSON.parse(JSON.stringify(body)));
  try {
    const action = body.action;
    if (failNext && failNext === action) { failNext = null; return [500, { error: "Something went wrong on the server." }]; }
    if (action === "health") return [200, { ok: true }];
    if (action === "unlock") {
      const u = PASSCODES[body.passcode];
      if (!u) fail(401, "That passcode is not right.");
      if (!u.floor && !u.backoffice) fail(403, NO_ACCESS);
      const token = "tok-" + Math.random().toString(16).slice(2).padEnd(28, "0");
      sessions.set(token, { name: u.name });
      return [200, { token, name: u.name, expires_at: new Date(Date.now() + 8 * 3600000).toISOString() }];
    }
    const u = session(body.token);
    if (action === "snapshot") {
      return [200, { me: { name: u.name, floor: u.floor, backoffice: u.backoffice, manage: !!u.manage, sensitive: !!u.sensitive, crm: !!u.crm, inbox: !!u.inbox },
        scopes: SCOPES.filter((s) => u[s.ribbon]),
        people: Object.values(PASSCODES).filter((p) => p.floor || p.backoffice).map((p) => ({ name: p.name, floor: !!p.floor, backoffice: !!p.backoffice })).sort((a, b) => a.name.localeCompare(b.name)),
        tasks: tasks.filter((t) => !t.archived && canSee(u, t)).map((t) => out(u, t)),
        inbox: u.inbox ? sugs.length : 0 }];
    }
    if (action === "task") return [200, detail(u, find(u, body.task_id))];
    if (action === "save") return [200, save(u, body.task)];
    if (action === "tick") {
      const t = tasks.find((x) => x.checklist.some((c) => c.item_id === body.item_id));
      if (!t || !canSee(u, t)) fail(409, "That task was not found.");
      t.checklist.find((c) => c.item_id === body.item_id).done = body.done === true;
      return [200, out(u, t)];
    }
    if (action === "comment") {
      const t = find(u, body.task_id);
      if (!String(body.body || "").trim()) fail(409, "Write the comment first.");
      (comments[t.task_id] = comments[t.task_id] || []).push({ comment_id: Date.now(), body: String(body.body).trim(), author: u.name, at: new Date().toISOString() });
      return [200, detail(u, t)];
    }
    if (action === "archive") {
      const t = find(u, body.task_id);
      if (!u.manage) fail(409, "Only a manager can archive a task.");
      t.archived = body.on !== false; log(t, t.archived ? "archived" : "restored", u.name);
      return [200, out(u, t)];
    }
    if (action === "client_search") {
      if (!u.crm) fail(409, "Tagging a client needs CRM access.");
      const q = String(body.q || "").trim().toLowerCase();
      return [200, { clients: q.length < 2 ? [] : CLIENTS.filter((c) => c.name.toLowerCase().includes(q) || c.client_id.toLowerCase().startsWith(q)) }];
    }
    if (action === "inbox") { if (!u.inbox) fail(409, "This account has no suggestions inbox."); return [200, { suggestions: sugs.slice() }]; }
    if (action === "inbox_decide") {
      if (!u.inbox) fail(409, "This account has no suggestions inbox.");
      const g = sugs.find((x) => x.id === body.suggestion_id);
      if (!g) fail(409, "That suggestion was already decided.");
      let id = null;
      if (body.accept === true) {
        if (g.task_id) { id = g.task_id; (comments[id] = comments[id] || []).push({ comment_id: Date.now(), body: g.note, author: u.name, at: new Date().toISOString() }); }
        else id = mk({ scope_id: body.scope_id || g.scope_id, title: g.title, notes: g.note, owner: u.name, created_by: u.name, created_at: new Date().toISOString() }).task_id;
      }
      sugs = sugs.filter((x) => x.id !== g.id);
      return [200, { task_id: id, left: sugs.length }];
    }
    fail(400, `Unknown action: ${action}`);
  } catch (e) {
    if (e instanceof Fail) return [e.status, { error: e.message }];
    throw e;
  }
}
reset();
module.exports = { handle, reset, delay, day, PASSCODES, get calls() { return calls; }, get tasks() { return tasks; }, get failNext() { return failNext; }, set failNext(v) { failNext = v; },
  expire() { expired = true; }, revoke(pass) { PASSCODES[pass].floor = false; PASSCODES[pass].backoffice = false; }, restore(pass, floor, backoffice) { PASSCODES[pass].floor = floor; PASSCODES[pass].backoffice = backoffice; } };
