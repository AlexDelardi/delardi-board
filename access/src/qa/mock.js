// A stand-in for access-api, for the page's tests. Everything in it is invented.
// It keeps people, their rights, the change history and a login log in memory, and answers as the real function does.
const RIGHTS = ["can_view_crm", "can_edit_crm", "can_view_all_cockpits", "can_export_crm", "can_import_crm", "can_view_catalogue", "can_manage_catalogue",
  "can_view_sales", "can_post_sales", "can_void_sales", "can_refund_sales", "can_manage_till", "can_view_stock", "can_manage_stock", "can_view_cost", "can_view_performance",
  "can_use_floor_tasks", "can_use_backoffice_tasks", "can_manage_tasks", "can_view_sensitive", "can_view_email_suggestions", "can_manage_access", "can_view_logins", "can_view_board"];
const PASSCODES = { demo: "Tessa Boss", nolog: "Peter Peek", rep: "Rita Rep" };
const NO_ACCESS = "This account does not have access to the Access tool.";
const delay = {};
let people, history, sessions, calls, failNext, seq, hseq, keyReady, codes, codeSeq;
const uid = () => "00000000-0000-4000-8000-" + String(++seq).padStart(12, "0");
const fail = (status, error) => { const e = new Error(error); e.status = status; throw e; };
function mk(name, o = {}) {
  const p = { person_id: uid(), name, active: o.active !== false, role: o.role || null, rep: o.rep || null, test: /^Claude|^QA /.test(name), passcode: o.viewable ? "viewable" : "earlier",
    passcode_set_at: o.viewable ? "2031-03-02T09:00:00Z" : null, last_login: o.last || null, rights: Object.fromEntries(RIGHTS.map((k) => [k, (o.rights || []).includes(k)])) };
  if (o.viewable) codes[p.person_id] = o.viewable;
  people.push(p);
  return p;
}
const log = (actor, p, action, field, o, n) => history.unshift({ log_id: ++hseq, at: new Date(Date.UTC(2031, 2, 3, 8, 0, hseq)).toISOString(), actor, person_id: p.person_id, person: p.name, action, field: field || null, old_value: o === undefined ? null : o, new_value: n === undefined ? null : n });
function reset() {
  people = []; history = []; sessions = new Map(); calls = []; failNext = null; seq = 0; hseq = 0; keyReady = true; codes = {}; codeSeq = 0;
  for (const k of Object.keys(delay)) delete delay[k];
  mk("Tessa Boss", { role: "Retail Director", rights: RIGHTS.filter((k) => k !== "can_refund_sales"), last: "2031-03-03T05:10:00Z" });
  mk("Lena Lead", { role: "Head of Sales", rep: "Lena L.", rights: ["can_view_crm", "can_edit_crm", "can_view_all_cockpits", "can_view_catalogue", "can_view_sales", "can_view_stock", "can_manage_stock", "can_use_floor_tasks", "can_manage_tasks"], last: "2031-03-02T11:00:00Z" });
  mk("Rita Rep", { role: "Sales Rep", rep: "Rita R.", viewable: "opal4821", rights: ["can_view_crm", "can_edit_crm", "can_view_catalogue", "can_use_floor_tasks"], last: "2031-03-01T07:30:00Z" });
  mk("Nina New", { role: "Sales Rep", rights: ["can_view_catalogue", "can_use_floor_tasks"] });
  mk("Peter Peek", { role: "Managing Partner", rights: ["can_manage_access", "can_view_crm", "can_view_performance"] });
  mk("Gone Gary", { active: false, role: "Junior Consultant" });
  mk("Claude QA", { active: false });
  log("Tessa Boss", people[2], "passcode");
  log("Tessa Boss", people[1], "right", "can_manage_stock", "false", "true");
  log("Tessa Boss", people[3], "profile", "role", null, "Sales Rep");
}
const find = (id) => people.find((p) => p.person_id === id) || fail(409, "That person was not found.");
const clone = (p) => JSON.parse(JSON.stringify(p));
const nextCode = () => ["jade", "coral", "pearl", "amber"][codeSeq % 4] + String(1000 + 137 * ++codeSeq).slice(-4);
function me(token) {
  const name = sessions.get(token);
  if (!name) fail(401, "That session is not valid. Enter your passcode again.");
  const u = people.find((p) => p.name === name);
  if (!u || !u.active || !u.rights.can_manage_access) fail(403, NO_ACCESS);
  return u;
}
function usage(days) {
  const tools = ["sales", "stock", "crm", "catalogue", "tasks", "perf"];
  const row = (name, active, last_at, last_tool, per) => ({ name, active, last_at, last_tool, logins_7: Object.values(per).reduce((a, b) => a + b, 0), days_7: Object.keys(per).length, logins_n: Object.values(per).reduce((a, b) => a + b, 0), days_n: Object.keys(per).length,
    tools: Object.fromEntries(tools.map((t) => [t, { allowed: t in per || name === "Tessa Boss", logins: per[t] || 0, days: per[t] ? 1 : 0, last_at: per[t] ? last_at : null }])) });
  return { as_of: "2031-03-03T06:00:00Z", today: "2031-03-03", days, since: "2031-02-20T05:00:00Z", tools,
    people: [row("Tessa Boss", true, "2031-03-03T05:10:00Z", "perf", { perf: 4, sales: 1, tasks: 2 }), row("Lena Lead", true, "2031-03-02T11:00:00Z", "stock", { stock: 3, crm: 2 }), row("Rita Rep", true, "2031-03-01T07:30:00Z", "catalogue", { catalogue: 5 }), row("Nina New", true, null, null, {})],
    daily: [{ day: "2031-03-02", logins: 5, people: 2 }, { day: "2031-03-03", logins: 7, people: 1 }],
    recent: [{ at: "2031-03-03T05:10:00Z", who: "Tessa Boss", tool: "perf" }, { at: "2031-03-03T05:02:00Z", who: "Tessa Boss", tool: "access" }, { at: "2031-03-02T11:00:00Z", who: "Lena Lead", tool: "stock" }, { at: "2031-03-01T07:30:00Z", who: "Rita Rep", tool: "catalogue" }] };
}
function handle(body) {
  const action = body.action;
  calls.push(JSON.parse(JSON.stringify(body)));
  try {
    if (failNext && failNext === action) { failNext = null; return [500, { error: "Something went wrong on the server." }]; }
    if (action === "unlock") {
      const name = PASSCODES[body.passcode];
      if (!name) fail(401, "That passcode is not right.");
      const u = people.find((p) => p.name === name);
      if (!u.rights.can_manage_access) fail(403, NO_ACCESS);
      const token = "tok-" + name.replace(/\W/g, "") + "-" + "x".repeat(24) + sessions.size;
      sessions.set(token, name);
      return [200, { token, name, expires_at: new Date(Date.now() + 8 * 3600e3).toISOString() }];
    }
    const u = me(body.token);
    if (action === "snapshot") return [200, { me: { name: u.name, person_id: u.person_id, logins: u.rights.can_view_logins }, rights: RIGHTS, people: people.map(clone), history: history.slice(0, 200), passcode_key: keyReady }];
    if (action === "set_right") {
      const p = find(body.person_id), on = body.on === true;
      if (!RIGHTS.includes(body.right)) fail(409, "That is not a right this tool manages.");
      if (body.right === "can_manage_access" && !on && p === u) fail(409, "You cannot remove your own access to this tool. Ask for it to be done for you.");
      if (p.rights[body.right] !== on) { log(u.name, p, "right", body.right, String(p.rights[body.right]), String(on)); p.rights[body.right] = on; }
      return [200, clone(p)];
    }
    if (action === "save_person") {
      const o = body.person || {};
      let p, passcode;
      if (!o.person_id) {
        const name = String(o.name || "").trim();
        if (!name) fail(409, "Give the person a name.");
        if (people.some((x) => x.name.toLowerCase() === name.toLowerCase())) fail(409, "There is already a person with that name.");
        if (!keyReady) fail(409, "Passcodes cannot be issued or shown yet: the passcode key is not set up.");
        passcode = nextCode();
        p = mk(name, { viewable: passcode });
        p.passcode_set_at = new Date().toISOString();
        log(u.name, p, "add", "role", null, String(o.role || "").trim() || null);
        if (o.copy_from) for (const k of RIGHTS) if (k !== "can_manage_access" && find(o.copy_from).rights[k]) { p.rights[k] = true; log(u.name, p, "right", k, "false", "true"); }
      } else {
        p = find(o.person_id);
        if ("name" in o && String(o.name || "").trim() !== p.name) fail(409, "A name cannot be changed: it is on this person's tickets, tasks and notes. Switch the person off and add a new one.");
      }
      for (const [k, field] of [["role", "role"], ["rep", "rep"]]) if (k in o) {
        const v = String(o[k] || "").trim() || null;
        if (v !== p[field]) { if (o.person_id || k === "rep") log(u.name, p, "profile", k, p[field], v); p[field] = v; }
      }
      if ("active" in o) {
        const on = o.active === true;
        if (!on && p === u) fail(409, "You cannot switch yourself off.");
        if (on !== p.active) { log(u.name, p, "active", "active", String(p.active), String(on)); p.active = on; if (!on) for (const [t, n] of sessions) if (n === p.name) sessions.delete(t); }
      }
      return [200, passcode ? { person: clone(p), passcode } : { person: clone(p) }];
    }
    if (action === "new_passcode") {
      const p = find(body.person_id);
      if (!keyReady) fail(409, "Passcodes cannot be issued or shown yet: the passcode key is not set up.");
      const passcode = nextCode();
      codes[p.person_id] = passcode; p.passcode = "viewable"; p.passcode_set_at = new Date().toISOString();
      for (const [t, n] of sessions) if (n === p.name) sessions.delete(t);   // their own too, as the database does
      log(u.name, p, "passcode");
      return [200, { person: clone(p), passcode }];
    }
    if (action === "show_passcode") {
      const p = find(body.person_id);
      if (!codes[p.person_id]) fail(409, "This passcode was set earlier and cannot be shown. Issue a new one.");
      log(u.name, p, "passcode_view");
      return [200, { passcode: codes[p.person_id] }];
    }
    if (action === "logins") {
      if (!u.rights.can_view_logins) fail(409, "This account does not have access to the login log.");
      return [200, usage(typeof body.days === "number" ? body.days : 30)];
    }
    fail(400, "Unknown action: " + action);
  } catch (e) {
    if (e.status) return [e.status, { error: e.message }];
    throw e;
  }
}
reset();
module.exports = { handle, reset, delay, RIGHTS, PASSCODES, get calls() { return calls; }, get people() { return people; }, get history() { return history; }, get codes() { return codes; },
  get failNext() { return failNext; }, set failNext(v) { failNext = v; }, set keyReady(v) { keyReady = v; }, expire() { sessions.clear(); } };
