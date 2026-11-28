// Checks for hub-api (home/api/index.ts) without Deno or a database: compiled with esbuild and run in Node against a
// stand-in for PostgREST. The rules (which tools, the log line) are in the database and tested there
// (db/tests/hub_t1_single_login.sql).  Run from the repository root:  node home/qa/api.test.cjs
const esbuild = require("esbuild");
const fs = require("fs"), path = require("path"), crypto = require("crypto"), vm = require("vm");
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? "PASS " : "FAIL ") + name + (!ok && detail !== undefined ? "  → " + JSON.stringify(detail) : "")); };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname, "..", "api", "index.ts"), "utf8").replace(/^import .*$/m, ""), { loader: "ts", format: "cjs" }).code;
const ALL = { sales: true, stock: true, crm: true, catalogue: true, tasks: true, perf: true, access: true, crm_edit: true, catalogue_manage: true };
function world() {
  const w = { users: [{ name: "Zz Boss", hash: sha("boss-code"), active: true }, { name: "Zz Rep", hash: sha("rep-code"), active: true }, { name: "Zz Gone", hash: sha("gone-code"), active: false }],
    tools: { "Zz Boss": ALL, "Zz Rep": Object.assign({}, ALL, { stock: false, perf: false, access: false }) }, sessions: [], attempts: [], rpc: [], handler: null, col: "signin_hash", asked: [] };
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
  w.fetch = async (url, init = {}) => {
    const u = new URL(url), p = u.pathname.replace("/rest/v1/", ""), q = u.searchParams, body = init.body ? JSON.parse(init.body) : null;
    if (init.headers.apikey !== "service-key") return res(401, { message: "no key" });
    if (p === "rpc/hub_tools") { w.rpc.push({ fn: "hub_tools", args: body }); return res(200, w.tools[body.p_name] || null); }
    if (p === "rpc/hub_open") { w.rpc.push({ fn: "hub_open", args: body }); return res(200, !!(w.tools[body.p_name] || {})[body.p_tool]); }
    // the people table has one column for the passcode check (w.col); asking by any other name is an error, as in PostgREST
    if (p === "board_users" && (q.get("signin_hash") || q.get("passcode_hash"))) {
      w.asked.push(q.get("signin_hash") ? "signin_hash" : "passcode_hash");
      if (!q.get(w.col)) return res(400, { code: "42703", message: "column does not exist" });
      return res(200, w.users.filter((x) => "eq." + x.hash === q.get(w.col) && x.active));
    }
    if (p === "board_users") return res(200, [{ name: "x" }]);
    if (p === "auth_attempts" && init.method === "POST") { w.attempts.push(body); return res(201); }
    if (p === "auth_attempts") return res(200, w.attempts.filter((a) => !a.ok && "eq." + a.ip === q.get("ip")).map((_, i) => ({ id: i })));
    if (p === "editor_sessions" && init.method === "POST") { w.sessions.push(body); return res(201); }
    if (p === "editor_sessions" && init.method === "DELETE") { w.sessions = w.sessions.filter((s) => !("eq." + s.token === q.get("token") && q.get("shared") === "is.true" && s.shared)); return res(204); }
    if (p === "editor_sessions") return res(200, w.sessions.filter((s) => "eq." + s.token === q.get("token")));
    return res(404, { message: "unknown path " + p });
  };
  const env = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
  vm.runInNewContext(js, { Deno: { env: { get: (k) => env[k] }, serve: (h) => { w.handler = h; } }, fetch: w.fetch, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, Response, Request, console: { error() {} },
    Uint8Array, module: { exports: {} }, exports: {} });
  w.post = async (body, ip) => { const r = await w.handler(new Request("https://x/functions/v1/hub-api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip || "10.0.0.1" }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
  return w;
}
(async () => {
  let w = world();
  let [st, d] = await w.post({ action: "health" });
  check("health answers", st === 200 && d.ok === true, d);
  [st, d] = await w.post({ action: "unlock", passcode: "nope" });
  check("unlock: a wrong passcode is refused and counted", st === 401 && w.attempts.length === 1 && w.attempts[0].ok === false && w.sessions.length === 0, d);
  [st, d] = await w.post({ action: "unlock", passcode: "gone-code" });
  check("unlock: a switched-off login is refused like a wrong passcode", st === 401 && /not right/.test(d.error) && w.sessions.length === 0, d);
  [st, d] = await w.post({ action: "unlock", passcode: "rep-code" }, "10.0.0.9");
  const s0 = w.sessions[0] || {};
  check("unlock: any active login gets a session, with their tools", st === 200 && d.name === "Zz Rep" && /^[0-9a-f]{64}$/.test(d.token) && d.tools.sales === true && d.tools.stock === false, d);
  check("unlock: the session is shared, carries every tool's flag but the Board's, and the address", s0.shared === true && s0.ip === "10.0.0.9" && s0.can_view_board === false
    && ["can_use_sales", "can_use_stock", "can_use_perf", "can_use_tasks", "can_use_access", "can_view_crm", "can_edit_crm", "can_view_catalogue"].every((k) => s0[k] === true), s0);
  check("unlock: 8 hours", Math.abs(Date.parse(d.expires_at) - Date.now() - 8 * 3600e3) < 5000);
  const token = d.token;
  [st, d] = await w.post({ action: "me", token });
  check("me: name and tools as they stand now", st === 200 && d.name === "Zz Rep" && d.tools.crm === true && d.tools.access === false, d);
  w.tools["Zz Rep"].crm = false;
  [st, d] = await w.post({ action: "me", token });
  check("me: a right taken away shows at once", d.tools.crm === false, d);
  [st, d] = await w.post({ action: "open", token, tool: "sales" }, "10.0.0.7");
  const o = w.rpc.filter((r) => r.fn === "hub_open").pop();
  check("open: logged for the session's person with the address", st === 200 && d.allowed === true && o.args.p_name === "Zz Rep" && o.args.p_tool === "sales" && o.args.p_ip === "10.0.0.7", d);
  [st, d] = await w.post({ action: "open", token, tool: "stock" });
  check("open: a tool they may not open comes back not allowed", st === 200 && d.allowed === false, d);
  [st, d] = await w.post({ action: "open", token, tool: "board" });
  check("open: only tools", st === 400, d);
  for (const a of ["me", "open"]) {
    [st, d] = await w.post({ action: a, tool: "sales" });
    check(a + ": no token, no answer", st === 401, d);
    [st, d] = await w.post({ action: a, tool: "sales", token: "x".repeat(64) });
    check(a + ": an unknown token is refused", st === 401, d);
  }
  w.sessions.push({ token: "t".repeat(64), display_name: "Zz Boss", expires_at: new Date(Date.now() + 3600e3).toISOString(), shared: false, can_use_sales: true });
  [st, d] = await w.post({ action: "me", token: "t".repeat(64) });
  check("me: a tool's own session is not a home-page session", st === 401, d);
  [st, d] = await w.post({ action: "lock", token: "t".repeat(64) });
  check("lock: cannot end a tool's own session", st === 200 && w.sessions.some((s) => s.token === "t".repeat(64)));
  w.sessions.push({ token: "e".repeat(64), display_name: "Zz Boss", expires_at: new Date(Date.now() - 1000).toISOString(), shared: true });
  [st, d] = await w.post({ action: "me", token: "e".repeat(64) });
  check("me: an expired session is refused", st === 401 && /expired/.test(d.error), d);
  delete w.tools["Zz Rep"];
  [st, d] = await w.post({ action: "me", token });
  check("me: switched off since sign-in: the session is over", st === 401, d);
  [st, d] = await w.post({ action: "lock", token });
  check("lock: ends the session", st === 200 && !w.sessions.some((s) => s.token === token), d);
  [st, d] = await w.post({ action: "me", token });
  check("lock: the token no longer works", st === 401, d);
  [st, d] = await w.post({ action: "lock" });
  check("lock: nothing to end is not an error", st === 200, d);
  w = world();
  for (let i = 0; i < 10; i++) await w.post({ action: "unlock", passcode: "bad" + i }, "10.9.9.9");
  [st, d] = await w.post({ action: "unlock", passcode: "boss-code" }, "10.9.9.9");
  check("unlock: ten wrong tries from one address shut it for an hour, even for the right passcode", st === 429 && w.sessions.length === 0, d);
  [st, d] = await w.post({ action: "unlock", passcode: "boss-code" }, "10.9.9.8");
  check("unlock: another address is not affected", st === 200, d);
  [st, d] = await w.post({ action: "nonsense", token: d.token });
  check("an unknown action is refused", st === 400, d);
  // the passcode is looked up under the new column name; until the rename the old name still works
  w = world();
  [st, d] = await w.post({ action: "unlock", passcode: "boss-code" });
  check("unlock: looks the person up by signin_hash", st === 200 && w.asked.join() === "signin_hash", w.asked.join());
  w = world(); w.col = "passcode_hash";
  [st, d] = await w.post({ action: "unlock", passcode: "boss-code" });
  check("unlock: before the column is renamed, the old name still signs in", st === 200 && d.name === "Zz Boss" && w.asked.join() === "signin_hash,passcode_hash", w.asked.join());
  [st, d] = await w.post({ action: "unlock", passcode: "nope" }, "10.0.0.7");
  check("unlock: and a wrong passcode is still refused and counted", st === 401 && w.attempts.filter((a) => !a.ok).length === 1, d);
  const r = await w.handler(new Request("https://x/", { method: "GET" }));
  check("only POST", r.status === 405);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
