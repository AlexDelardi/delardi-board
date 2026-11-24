// Checks for access-api (access/src/api/index.ts) without Deno or a database: the function is compiled with esbuild
// and run in Node against a stand-in for PostgREST. What is checked here is the function's own work — sessions,
// passcode generation, the encrypted copy, input shapes, how refusals travel. The rules themselves are in the
// database and are tested there (db/tests/acc_t1_access.sql).
// Run from access/src:  node qa/api.test.cjs
const esbuild = require("esbuild");
const fs = require("fs"), path = require("path"), crypto = require("crypto"), vm = require("vm");

let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? "PASS " : "FAIL ") + name + (!ok && detail !== undefined ? "  → " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : "")); };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname, "..", "api", "index.ts"), "utf8").replace(/^import .*$/m, ""), { loader: "ts", format: "cjs" }).code;

// A stand-in database: users by passcode hash, sessions by token, and a scripted answer for each acc_* function.
function world(env) {
  const w = { env, users: [{ name: "Zz Boss", passcode_hash: sha("boss-code"), active: true, can_manage_access: true }, { name: "Zz Rep", passcode_hash: sha("rep-code"), active: true, can_manage_access: false }],
    sessions: [], attempts: [], rpc: [], script: {}, handler: null };
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
  w.fetch = async (url, init = {}) => {
    const u = new URL(url), p = u.pathname.replace("/rest/v1/", ""), q = u.searchParams, body = init.body ? JSON.parse(init.body) : null;
    if (init.headers.apikey !== "service-key") return res(401, { message: "no key" });
    if (p.startsWith("rpc/")) {
      const fn = p.slice(4); w.rpc.push({ fn, args: body });
      const s = w.script[fn];
      const out = typeof s === "function" ? s(body, w.rpc.filter((r) => r.fn === fn).length) : s;
      if (out && out.__refuse) return res(400, { code: out.code || "P0001", message: out.__refuse });
      return res(200, out === undefined ? null : out);
    }
    if (p === "board_users" && q.get("passcode_hash")) return res(200, w.users.filter((x) => "eq." + x.passcode_hash === q.get("passcode_hash") && x.active));
    if (p === "board_users") return res(200, [{ name: "x" }]);
    if (p === "auth_attempts" && init.method === "POST") { w.attempts.push(body); return res(201); }
    if (p === "auth_attempts") return res(200, w.attempts.filter((a) => !a.ok && "eq." + a.ip === q.get("ip")).map((_, i) => ({ id: i })));
    if (p === "editor_sessions" && init.method === "POST") { w.sessions.push(body); return res(201); }
    if (p === "editor_sessions") return res(200, w.sessions.filter((s) => "eq." + s.token === q.get("token")));
    return res(404, { message: "unknown path " + p });
  };
  const sandbox = { Deno: { env: { get: (k) => env[k] }, serve: (h) => { w.handler = h; } }, fetch: w.fetch, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, Response, Request, btoa, atob, console: { error() {} },
    Uint8Array, Uint32Array, module: { exports: {} }, exports: {} };
  vm.runInNewContext(js, sandbox);
  w.post = async (body, ip) => { const r = await w.handler(new Request("https://x/functions/v1/access-api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip || "10.0.0.7" }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
  w.login = async (code) => (await w.post({ action: "unlock", passcode: code || "boss-code" }))[1].token;
  return w;
}
const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service-key", ACCESS_PASSCODE_KEY: "a-long-enough-test-secret-0123456789" };
const UID = "11111111-2222-4333-8444-555555555555";

(async () => {
  // ---- sessions
  let w = world(ENV);
  let [st, d] = await w.post({ action: "health" });
  check("health: answers, and says the passcode key is set", st === 200 && d.ok === true && d.passcode_key === true, d);
  [st, d] = await w.post({ action: "unlock", passcode: "nope" });
  check("unlock: a wrong passcode is refused and counted", st === 401 && w.attempts.length === 1 && w.attempts[0].ok === false, d);
  [st, d] = await w.post({ action: "unlock", passcode: "rep-code" });
  check("unlock: a login without the access right is told so, and gets no session", st === 403 && /does not have access/.test(d.error) && w.sessions.length === 0, d);
  [st, d] = await w.post({ action: "unlock", passcode: "boss-code" }, "10.0.0.9");
  const s0 = w.sessions[0] || {};
  check("unlock: the access manager gets a session for this tool only, with the address on it", st === 200 && d.name === "Zz Boss" && /^[0-9a-f]{64}$/.test(d.token) && s0.can_use_access === true && s0.ip === "10.0.0.9"
    && ["can_use_tasks", "can_use_perf", "can_use_stock", "can_use_sales", "can_view_crm", "can_edit_crm", "can_view_board", "can_view_catalogue"].every((k) => s0[k] === false), s0);
  const token = d.token;
  [st, d] = await w.post({ action: "snapshot" });
  check("no token: 401", st === 401, d);
  w.sessions.push({ token: "t".repeat(64), display_name: "Zz Rep", expires_at: new Date(Date.now() + 3600e3).toISOString(), can_use_access: false, can_use_tasks: true });
  [st, d] = await w.post({ action: "snapshot", token: "t".repeat(64) });
  check("another tool's token does not open this one: 403", st === 403 && w.rpc.length === 0, d);
  w.sessions.push({ token: "e".repeat(64), display_name: "Zz Boss", expires_at: new Date(Date.now() - 1000).toISOString(), can_use_access: true });
  [st, d] = await w.post({ action: "snapshot", token: "e".repeat(64) });
  check("an expired session: 401", st === 401 && /expired/.test(d.error), d);
  for (let i = 0; i < 10; i++) await w.post({ action: "unlock", passcode: "nope" + i }, "10.0.0.66");
  [st, d] = await w.post({ action: "unlock", passcode: "boss-code" }, "10.0.0.66");
  check("ten wrong passcodes from one address: the eleventh try is refused for an hour, even a right one", st === 429, d);

  // ---- reading, and refusals from the database
  w.script.acc_snapshot = { me: { name: "Zz Boss" }, people: [] };
  [st, d] = await w.post({ action: "snapshot", token });
  check("snapshot: the database's answer, asked in the session's name, plus whether passcodes can be issued", st === 200 && d.me.name === "Zz Boss" && d.passcode_key === true && w.rpc.at(-1).args.p_actor === "Zz Boss", d);
  w.script.acc_snapshot = { __refuse: "This account does not have access to the Access tool." };
  [st, d] = await w.post({ action: "snapshot", token });
  check("a right taken away mid-session: the database's refusal becomes 403, so the page locks", st === 403, d);
  w.script.acc_set_right = { __refuse: "You cannot remove your own access to this tool. Ask for it to be done for you." };
  [st, d] = await w.post({ action: "set_right", token, person_id: UID, right: "can_manage_access", on: false });
  check("any other refusal comes back as 409 with the database's sentence", st === 409 && /your own access/.test(d.error), d);
  w.script.acc_set_right = { __refuse: "relation missing", code: "42P01" };
  [st, d] = await w.post({ action: "set_right", token, person_id: UID, right: "can_view_stock", on: true });
  check("a fault is a 500 with no detail", st === 500 && d.error === "Something went wrong on the server.", d);

  // ---- shapes
  const before = w.rpc.length;
  [st, d] = await w.post({ action: "set_right", token, person_id: "not-a-uuid", right: "can_view_stock", on: true });
  check("set_right: a bad person reference never reaches the database", st === 400 && w.rpc.length === before, d);
  w.script.acc_set_right = (a) => ({ person_id: a.p_person });
  [st, d] = await w.post({ action: "set_right", token, person_id: UID.toUpperCase(), right: "can_view_stock", on: "yes" });
  check("set_right: only a real true switches a right on", st === 200 && w.rpc.at(-1).args.p_on === false && w.rpc.at(-1).args.p_person === UID && w.rpc.at(-1).args.p_right === "can_view_stock", w.rpc.at(-1));
  w.script.acc_save_person = (a) => ({ person_id: a.p_person.person_id || UID, got: a });
  [st, d] = await w.post({ action: "save_person", token, person: { person_id: UID, role: "Sales Rep", rep: null, active: "false", passcode_hash: "x", can_manage_access: true, name: "Zz" } });
  const sent = w.rpc.at(-1).args;
  check("save_person (change): only the known keys go through, no passcode is made", st === 200 && d.passcode === undefined && JSON.stringify(Object.keys(sent.p_person).sort()) === JSON.stringify(["active", "name", "person_id", "rep", "role"])
    && sent.p_person.active === false && sent.p_person.rep === "" && sent.p_hash === undefined, sent);
  [st, d] = await w.post({ action: "save_person", token, person: [1, 2] });
  check("save_person: person must be an object", st === 400, d);

  // ---- passcodes
  [st, d] = await w.post({ action: "save_person", token, person: { name: "Zz New", role: "Trainee", copy_from: UID } });
  const add = w.rpc.at(-1).args;
  check("add: a passcode is generated — a word and four digits", st === 200 && /^[a-z]{4,8}\d{4}$/.test(d.passcode), d.passcode);
  check("add: the database gets its SHA-256 and an encrypted copy, never the passcode itself", add.p_hash === sha(d.passcode) && /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(add.p_enc) && !JSON.stringify(add).includes(d.passcode), add);
  const firstEnc = add.p_enc, firstCode = d.passcode;
  w.script.acc_passcode = firstEnc;
  [st, d] = await w.post({ action: "show_passcode", token, person_id: UID });
  check("show: the copy decrypts back to the passcode that was issued", st === 200 && d.passcode === firstCode && w.rpc.at(-1).fn === "acc_passcode", d);
  w.script.acc_set_passcode = (a, n) => (n <= 2 ? { __refuse: "That passcode is already in use. Generate another." } : { person_id: a.p_person });
  [st, d] = await w.post({ action: "new_passcode", token, person_id: UID });
  const tries = w.rpc.filter((r) => r.fn === "acc_set_passcode");
  check("new passcode: one already in use is replaced by another, until one is free", st === 200 && tries.length === 3 && new Set(tries.map((t) => t.args.p_hash)).size === 3 && tries[2].args.p_hash === sha(d.passcode), tries.length);
  check("new passcode: every copy is encrypted afresh", new Set(tries.map((t) => t.args.p_enc)).size === 3 && tries.every((t) => t.args.p_enc !== firstEnc));
  w.script.acc_set_passcode = { __refuse: "That person was not found." };
  [st, d] = await w.post({ action: "new_passcode", token, person_id: UID });
  check("new passcode: another refusal is passed on at once, no retry", st === 409 && /not found/.test(d.error) && w.rpc.filter((r) => r.fn === "acc_set_passcode").length === 4, d);
  const seen = new Set(); let shape = true;
  w.script.acc_set_passcode = (a) => ({ person_id: a.p_person });
  for (let i = 0; i < 40; i++) { const r = (await w.post({ action: "new_passcode", token, person_id: UID }))[1]; seen.add(r.passcode); shape = shape && /^[a-z]{4,8}\d{4}$/.test(r.passcode) && !/delardi|boss|zz/i.test(r.passcode); }
  check("generated passcodes differ and carry nothing of the person or the company", shape && seen.size >= 39, seen.size);
  w.script.acc_passcode = { __refuse: "This passcode was set earlier and cannot be shown. Issue a new one." };
  [st, d] = await w.post({ action: "show_passcode", token, person_id: UID });
  check("show: a passcode from before the tool is refused in the database's words", st === 409 && /set earlier/.test(d.error), d);

  // ---- the key
  const w2 = world({ ...ENV, ACCESS_PASSCODE_KEY: "another-long-enough-secret-9876543210" });
  const t2 = await w2.login();
  w2.script.acc_passcode = firstEnc;
  [st, d] = await w2.post({ action: "show_passcode", token: t2, person_id: UID });
  check("a copy made under another key cannot be read, and that is said plainly", st === 409 && /can no longer be shown/.test(d.error), d);
  for (const key of [undefined, "short"]) {
    const w3 = world({ ...ENV, ACCESS_PASSCODE_KEY: key });
    const t3 = await w3.login();
    [st, d] = await w3.post({ action: "health" });
    const noKey = st === 200 && d.passcode_key === false;
    w3.script.acc_snapshot = { me: {} };
    const snap = (await w3.post({ action: "snapshot", token: t3 }))[1];
    const n = w3.rpc.length;
    const a = await w3.post({ action: "new_passcode", token: t3, person_id: UID });
    const b = await w3.post({ action: "save_person", token: t3, person: { name: "Zz" } });
    const c = await w3.post({ action: "show_passcode", token: t3, person_id: UID });
    check("no key (" + (key || "unset") + "): nothing is issued or shown, nothing reaches the database, and the page is told", noKey && snap.passcode_key === false && [a, b, c].every(([s, x]) => s === 409 && /passcode key is not set up/.test(x.error)) && w3.rpc.length === n, [a, b, c]);
    w3.script.acc_save_person = (x) => ({ person_id: x.p_person.person_id });
    [st, d] = await w3.post({ action: "save_person", token: t3, person: { person_id: UID, role: "x" } });
    check("no key (" + (key || "unset") + "): everything else still works", st === 200, d);
  }

  // ---- logins
  w.script.acc_logins = (a) => ({ days: a.p_days });
  [st, d] = await w.post({ action: "logins", token, days: 90 });
  const d2 = (await w.post({ action: "logins", token, days: "all" }))[1];
  check("logins: the days asked for, 30 when it is not a whole number", st === 200 && d.days === 90 && d2.days === 30, [d, d2]);
  [st, d] = await w.post({ action: "drop_everything", token });
  check("an unknown action: 400", st === 400, d);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
