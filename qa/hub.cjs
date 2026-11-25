// The single sign-in: the home page (index.html), the shared script (ui/hub.js) and each tool's handover to it.
// Everything is served from the repository under a made-up address; hub-api and the tools' APIs are stand-ins.
// Run from the repository root:  node qa/hub.cjs   (ONLY="text" runs the groups whose name contains it)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const BASE = "https://tools.test/delardi-board/";
const HUB = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/hub-api";
const ONLY = process.env.ONLY || "";
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? "PASS " : "FAIL ") + name + (!ok && detail !== undefined ? "  → " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : "")); };
const ALL = { sales: true, stock: true, crm: true, catalogue: true, tasks: true, perf: true, access: true, crm_edit: true, catalogue_manage: true };
const REP = Object.assign({}, ALL, { stock: false, perf: false, access: false, crm_edit: false, catalogue_manage: false });
const TYPES = { ".html": "text/html", ".webp": "image/webp", ".svg": "image/svg+xml", ".js": "text/javascript", ".css": "text/css" };

function world() {
  return { codes: { boss: "Tessa Boss", rep: "Rita Rep" }, tools: { "Tessa Boss": Object.assign({}, ALL), "Rita Rep": Object.assign({}, REP) }, sessions: {}, calls: [], toolCalls: [],
    hubDown: false, toolStatus: 401, toolDelay: 0, n: 0 };
}
function hub(w, body) {
  w.calls.push(body);
  const s = body.token ? w.sessions[body.token] : null;
  if (body.action === "unlock") {
    const name = w.codes[body.passcode];
    if (body.passcode === "flood") return [429, { error: "Too many failed attempts. Try again in an hour." }];
    if (!name) return [401, { error: "That passcode is not right." }];
    const token = "tok" + (++w.n) + "-" + "x".repeat(40);
    w.sessions[token] = name;
    return [200, { token, name, expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), tools: w.tools[name] }];
  }
  if (body.action === "lock") { delete w.sessions[body.token]; return [200, { ok: true }]; }
  if (!s || !w.tools[s]) return [401, { error: "Sign in to continue." }];
  if (body.action === "me") return [200, { name: s, expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), tools: w.tools[s] }];
  if (body.action === "open") return [200, { ok: true, allowed: !!w.tools[s][body.tool] }];
  return [400, { error: "Unknown action" }];
}
async function open(browser, w, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, locale: opts.locale || "en-GB", hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await ctx.route("**/*", async (r) => {
    const u = r.request().url();
    if (u.startsWith("data:")) return r.continue();
    if (u === HUB) {
      if (w.hubDown) return r.abort();
      const [status, data] = hub(w, JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    }
    if (u.includes("/functions/v1/")) {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }, body: "ok" });
      let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch (e) { /* not JSON */ }
      w.toolCalls.push({ url: u, body });
      if (w.toolDelay) await new Promise((res) => setTimeout(res, w.toolDelay));
      const err = w.toolStatus === 403 ? "This account does not have access to this tool." : "That session is not valid. Enter your passcode again.";
      return r.fulfill({ status: w.toolStatus, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: err }) }).catch(() => {});
    }
    if (u.startsWith(BASE)) {
      let rel = decodeURIComponent(new URL(u).pathname.replace("/delardi-board/", ""));
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      if (rel.endsWith("blank.html")) return r.fulfill({ status: 200, contentType: "text/html", body: "<!DOCTYPE html><html><body><div id='app'></div></body></html>" });
      const f = path.join(ROOT, rel);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    }
    return r.fulfill({ status: 404, body: "" });
  });
  if (opts.lang) await ctx.addInitScript((l) => { try { localStorage.setItem("delardi_lang", l); } catch (e) { /* ignore */ } }, opts.lang);
  if (opts.tab) await ctx.addInitScript((seed) => { try { if (!sessionStorage.getItem("__tabbed")) { sessionStorage.setItem("__tabbed", "1"); for (const k in seed) sessionStorage.setItem(k, seed[k]); } } catch (e) { /* ignore */ } }, opts.tab);
  if (opts.seed) await ctx.addInitScript((seed) => { try { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); for (const k in seed) localStorage.setItem(k, seed[k]); } } catch (e) { /* ignore */ } }, opts.seed);
  await page.goto(BASE + (url || "") + (url && url.includes("?") ? "&" : "?") + "season=off");
  return { ctx, page, errors };
}
// A session as the home page stores it, already known to the stand-in server.
function seed(w, code, extra) {
  const [, d] = hub(w, { action: "unlock", passcode: code });
  w.calls.length = 0;
  return Object.assign({ delardi_session: JSON.stringify({ token: d.token, name: d.name, expires_at: d.expires_at, tools: d.tools }) }, extra || {});
}
const signIn = async (page, code) => { await page.fill("#pass", code); await page.click("#signin-btn"); };
const vis = (page, sel) => page.isVisible(sel);
const stored = (page) => page.evaluate(() => localStorage.getItem("delardi_session"));
const shown = (page) => page.$$eval(".tool", (as) => as.filter((a) => !a.hidden).map((a) => a.getAttribute("data-tool") + (a.classList.contains("off") ? ":off" : "")).join(" "));
const atHome = (page) => page.waitForFunction((b) => location.href.split("?")[0] === b && !!document.getElementById("signin"), BASE);
const TOOLS = ["sales", "stock", "crm", "catalogue", "tasks", "perf", "access"];

(async () => {
  const browser = await chromium.launch();
  const run = async (name, fn) => {
    if (ONLY && !name.includes(ONLY)) return;
    try { await fn(); } catch (e) { check(name + " (ran to the end)", false, String(e.message).split("\n")[0]); }
  };

  await run("home signed out", async () => {
    const w = world();
    const { ctx, page, errors } = await open(browser, w);
    await page.waitForSelector("#signin:not([hidden])");
    check("signed out: only the sign-in card", await vis(page, "#pass") && !(await vis(page, "#tools")) && !(await vis(page, "#who")) && !(await vis(page, "#lock")) && !(await vis(page, ".tool")));
    check("signed out: the server is asked nothing", w.calls.length === 0, w.calls);
    check("signed out: it says to sign in", /Sign in to open your tools/.test(await page.textContent("#lede")));
    await page.click("#signin-btn");
    check("empty passcode: asked for, nothing sent", (await page.textContent("#signin-err")) === "Enter your passcode." && w.calls.length === 0);
    await signIn(page, "nope");
    await page.waitForFunction(() => /not right/.test(document.getElementById("signin-err").textContent));
    check("wrong passcode: said, field emptied, nothing kept", (await page.inputValue("#pass")) === "" && (await stored(page)) === null && !(await vis(page, "#tools")));
    await signIn(page, "flood");
    await page.waitForFunction(() => /Too many/.test(document.getElementById("signin-err").textContent));
    check("too many tries: said", true);
    w.hubDown = true;
    await signIn(page, "rep");
    await page.waitForFunction(() => /No connection/.test(document.getElementById("signin-err").textContent));
    check("no connection: said, still signed out", (await stored(page)) === null);
    w.hubDown = false;
    await signIn(page, "rep");
    await page.waitForSelector("#tools:not([hidden])");
    check("signed in: the cards, greyed where there is no access, and no Access card", (await shown(page)) === "sales stock:off crm catalogue tasks perf:off", await shown(page));
    check("signed in: name and Lock in the header, the sign-in card gone", (await page.textContent("#who")) === "Rita Rep" && await vis(page, "#lock") && !(await vis(page, "#signin")));
    check("signed in: each card says whether it opens", (await page.textContent('.tool[data-tool="sales"] .status-text')) === "You have access" && (await page.textContent('.tool[data-tool="stock"] .status-text')) === "No access"
      && (await page.getAttribute('.tool[data-tool="stock"]', "aria-disabled")) === "true" && (await page.getAttribute('.tool[data-tool="sales"]', "aria-disabled")) === null);
    const st = JSON.parse(await stored(page));
    check("signed in: the session is kept for every tab, and the passcode nowhere", /^tok/.test(st.token) && st.name === "Rita Rep" && st.tools.sales === true
      && !(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + document.documentElement.outerHTML)).includes('"rep"') && (await page.inputValue("#pass")) === "");
    await page.click('.tool[data-tool="stock"]', { force: true });
    check("greyed card: says why and goes nowhere", (await page.textContent("#notice")) === "You do not have access to this tool. Ask Alex." && page.url().startsWith(BASE + "?") || page.url() === BASE, page.url());
    check("greyed card: still on the home page", new URL(page.url()).pathname === "/delardi-board/");
    await page.click("#lock");
    await page.waitForSelector("#signin:not([hidden])");
    check("Lock: back to the sign-in card, the session ended here and on the server", (await stored(page)) === null && !(await vis(page, "#tools")) && w.calls.some((c) => c.action === "lock" && c.token === st.token) && !w.sessions[st.token]);
    await signIn(page, "boss");
    await page.waitForSelector("#tools:not([hidden])");
    check("access manager: seven cards, none greyed", (await shown(page)) === "sales stock crm catalogue tasks perf access", await shown(page));
    await Promise.all([page.waitForURL(BASE + "sales/"), page.click('.tool[data-tool="sales"]')]);
    check("an open card goes to its tool", true);
    check("no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("home signed in", async () => {
    const w = world();
    let { ctx, page } = await open(browser, w, "", { seed: seed(w, "rep") });
    await page.waitForSelector("#tools:not([hidden])");
    await page.waitForFunction(() => true);
    check("coming back signed in: the cards at once, and the server is asked who and what", (await shown(page)).startsWith("sales stock:off") && !(await vis(page, "#signin")));
    await page.waitForTimeout(150);
    check("coming back: one question to the server", w.calls.filter((c) => c.action === "me").length === 1, w.calls);
    w.tools["Rita Rep"].crm = false;
    await page.reload(); await page.waitForSelector("#tools:not([hidden])");
    await page.waitForFunction(() => document.querySelector('.tool[data-tool="crm"]').classList.contains("off"));
    check("a right taken away greys its card on the next visit", JSON.parse(await stored(page)).tools.crm === false);
    delete w.tools["Rita Rep"];
    await page.reload(); await page.waitForSelector("#signin:not([hidden])");
    check("switched off meanwhile: signed out and told", (await stored(page)) === null && /session has ended/.test(await page.textContent("#notice")));
    await ctx.close();
    // the server cannot be reached
    const w2 = world(); const s2 = seed(w2, "rep"); w2.hubDown = true;
    ({ ctx, page } = await open(browser, w2, "?next=sales", { seed: s2 }));
    await page.waitForFunction(() => /No connection/.test(document.getElementById("notice").textContent));
    check("no connection: the cards stay, it says so, and nobody is sent on", await vis(page, "#tools") && new URL(page.url()).pathname === "/delardi-board/" && (await stored(page)) !== null);
    await ctx.close();
    // denied
    const w3 = world();
    ({ ctx, page } = await open(browser, w3, "?denied=stock", { seed: seed(w3, "rep") }));
    await page.waitForSelector("#tools:not([hidden])");
    check("sent back from a tool without access: told, still signed in, address tidied", (await page.textContent("#notice")) === "You do not have access to this tool. Ask Alex." && (await stored(page)) !== null && !page.url().includes("denied"), page.url());
    await ctx.close();
  });

  await run("home next", async () => {
    const w = world();
    let { ctx, page } = await open(browser, w, "?next=sales");
    await page.waitForSelector("#signin:not([hidden])");
    check("asked to sign in by a tool: the address is tidied", !page.url().includes("next="), page.url());
    await Promise.all([page.waitForURL(BASE + "sales/"), signIn(page, "rep")]);
    check("after signing in the person is back in the tool that asked", true);
    await ctx.close();
    ({ ctx, page } = await open(browser, w, "?next=stock"));
    await signIn(page, "rep");
    await page.waitForSelector("#tools:not([hidden])");
    check("a tool they cannot open: they stay on the home page and are told", new URL(page.url()).pathname === "/delardi-board/" && /do not have access/.test(await page.textContent("#notice")));
    await ctx.close();
    ({ ctx, page } = await open(browser, w, "?next=https://evil.test/"));
    await signIn(page, "rep");
    await page.waitForSelector("#tools:not([hidden])");
    await page.waitForTimeout(200);
    check("only a tool's name is followed, never an address", new URL(page.url()).pathname === "/delardi-board/" && new URL(page.url()).host === "tools.test");
    await ctx.close();
    const w2 = world();
    ({ ctx, page } = await open(browser, w2, "?next=crm", { seed: seed(w2, "rep") }));
    await page.waitForURL(BASE + "crm/");
    check("already signed in: straight on, once the server has confirmed", w2.calls.some((c) => c.action === "me"));
    await ctx.close();
  });

  await run("home idle and tabs", async () => {
    const w = world();
    const old = String(Date.now() - 16 * 60000);
    let { ctx, page } = await open(browser, w, "", { seed: seed(w, "rep", { delardi_last_active: old }), touch: true, viewport: { width: 390, height: 780 } });
    await page.waitForSelector("#signin:not([hidden])");
    check("iPad or phone left 15 minutes: signed out, told why, ended on the server", /15 minutes without use/.test(await page.textContent("#notice")) && (await stored(page)) === null && w.calls.some((c) => c.action === "lock") && Object.keys(w.sessions).length === 0);
    check("phone: nothing wider than the screen", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await signIn(page, "rep"); await page.waitForSelector("#tools:not([hidden])");
    check("phone signed in: nothing wider than the screen", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    const hdr = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); const lang = r(".lang"), lock = r("#lock"), th = r("#theme"); return { fits: th.right <= window.innerWidth && lang.left >= lock.right && lock.width >= 44 && lock.height >= 44, who: getComputedStyle(document.getElementById("who")).display, signed: document.getElementById("signed").textContent, signedShown: getComputedStyle(document.getElementById("signed")).display !== "none" }; });
    check("phone signed in: the header fits (Lock as a 44 px padlock), and the name is in the page", hdr.fits && hdr.who === "none" && hdr.signed === "Rita Rep" && hdr.signedShown, hdr);
    await ctx.close();
    const w2 = world();
    ({ ctx, page } = await open(browser, w2, "", { seed: seed(w2, "rep", { delardi_last_active: old }) }));
    await page.waitForSelector("#tools:not([hidden])");
    check("a desk computer is not locked for being idle", (await stored(page)) !== null);
    // a second tab
    const page2 = await ctx.newPage();
    await page2.goto(BASE + "?season=off"); await page2.waitForSelector("#tools:not([hidden])");
    await page2.click("#lock");
    await page.waitForSelector("#signin:not([hidden])");
    check("Lock in one tab locks the other", !(await vis(page, "#tools")));
    await signIn(page2, "boss"); await page2.waitForSelector("#tools:not([hidden])");
    await page.waitForSelector("#tools:not([hidden])");
    check("signing in in one tab signs in the other", (await page.textContent("#who")) === "Tessa Boss");
    await ctx.close();
  });

  await run("home russian", async () => {
    const w = world();
    const { ctx, page } = await open(browser, w, "", { lang: "ru" });
    await page.waitForSelector("#signin:not([hidden])");
    check("RU: the sign-in card", (await page.textContent("#signin-btn")) === "Войти" && /Войдите/.test(await page.textContent("#lede")) && (await page.textContent('label[for="pass"]')) === "Код доступа");
    await signIn(page, "nope");
    await page.waitForFunction(() => document.getElementById("signin-err").textContent === "Код доступа неверный.");
    await signIn(page, "rep"); await page.waitForSelector("#tools:not([hidden])");
    await page.click('.tool[data-tool="perf"]', { force: true });
    check("RU: cards and the no-access message", (await page.textContent('.tool[data-tool="perf"] .status-text')) === "Нет доступа" && /нет доступа к этому инструменту/.test(await page.textContent("#notice")) && (await page.textContent("#lock")).trim() === "Заблокировать" && (await page.getAttribute("#lock", "aria-label")) === "Заблокировать");
    await ctx.close();
  });

  for (const id of TOOLS) {
    await run("tool " + id, async () => {
      // signed out: to the home page, and back after signing in
      let w = world();
      let { ctx, page, errors } = await open(browser, w, id + "/");
      await atHome(page);
      await page.waitForSelector("#signin:not([hidden])");
      check(id + ": opened signed out, the person lands on the sign-in, and the tool asked its API nothing", w.toolCalls.length === 0 && !(await page.$("#gate-pass")), w.toolCalls.length);
      w.toolDelay = 1500;
      await Promise.all([page.waitForURL((u) => u.pathname === "/delardi-board/" + id + "/"), signIn(page, "boss")]);
      check(id + ": after signing in they are back in the tool", true);
      await page.waitForFunction(() => document.readyState === "complete");
      const tok = JSON.parse(await stored(page)).token;
      await page.waitForTimeout(500);
      check(id + ": the tool uses the shared session with its own API", w.toolCalls.length > 0 && w.toolCalls.every((c) => c.body.token === tok), w.toolCalls.slice(0, 2));
      check(id + ": it draws no passcode card of its own", !(await page.$("#gate-pass")) && !(await page.$("#gate")));
      check(id + ": the visit is logged once", w.calls.filter((c) => c.action === "open" && c.tool === id && c.token === tok).length === 1, w.calls);
      if (id === "sales") check("sales: the client panel's CRM session is the shared one", (await page.evaluate(() => (JSON.parse(sessionStorage.getItem("sales_crm_session") || "{}")).token)) === tok);
      // the tool's API refuses the session (it ended): signed out everywhere, sign in again
      await atHome(page);
      await page.waitForSelector("#signin:not([hidden])");
      check(id + ": a session the tool's API refuses ends at the sign-in, signed out here and on the server", (await stored(page)) === null && !w.sessions[tok] && w.calls.some((c) => c.action === "lock" && c.token === tok));
      check(id + ": no script errors on the way", errors.length === 0, errors.join(" | "));
      await ctx.close();
      // no access to this tool: back to the home page, told, still signed in
      w = world(); w.toolStatus = 403;
      const sd = seed(w, "boss"); w.tools["Tessa Boss"][id] = false;
      ({ ctx, page } = await open(browser, w, id + "/", { seed: sd }));
      await atHome(page);
      await page.waitForSelector("#tools:not([hidden])");
      check(id + ": without access the person is sent back, told, and stays signed in", /do not have access/.test(await page.textContent("#notice")) && (await stored(page)) !== null && !w.calls.some((c) => c.action === "lock")
        && (id === "access" ? !(await vis(page, '.tool[data-tool="access"]')) : await page.$eval('.tool[data-tool="' + id + '"]', (a) => a.classList.contains("off"))));
      await ctx.close();
    });
  }

  // An old last-touch time left behind by the tool must not lock a session signed in a moment ago (it used to send
  // the person round and round: sign in, locked for being idle, sign in).
  await run("stale idle", async () => {
    const old = String(Date.now() - 40 * 60000);
    for (const [id, key, local] of [["sales", "sales_last_active"], ["stock", "stock_last_active"], ["tasks", "tasks_last_active"], ["perf", "perf_last_active"], ["access", "access_last_active"],
      ["crm", "crm_last_active", true], ["catalogue", "cat_idle", true]]) {
      const w = world(); w.toolDelay = 2500;
      const sd = seed(w, "boss", Object.assign({ delardi_last_active: String(Date.now()) }, local ? { [key]: old } : {}));
      const { ctx, page } = await open(browser, w, id + "/", { seed: sd, tab: local ? null : { [key]: old }, touch: true, viewport: { width: 820, height: 1180 } });
      await page.waitForTimeout(900);
      const now = await page.evaluate(([k, l]) => Number((l ? localStorage : sessionStorage).getItem(k) || 0), [key, !!local]);
      check(id + ": an old idle time in the tab does not lock a fresh sign-in", new URL(page.url()).pathname === "/delardi-board/" + id + "/" && !w.calls.some((c) => c.action === "lock" || c.action === "me")
        && (await stored(page)) !== null && Date.now() - now < 60000 && w.toolCalls.length > 0, { url: page.url(), calls: w.calls.map((c) => c.action), now });
      await ctx.close();
    }
    // and the shared session left idle still locks
    const w = world();
    const { ctx, page } = await open(browser, w, "sales/", { seed: seed(w, "boss", { delardi_last_active: old }), touch: true, viewport: { width: 820, height: 1180 } });
    await atHome(page);
    await page.waitForSelector("#signin:not([hidden])");
    check("a shared session left idle on a touch device still ends at the sign-in", (await stored(page)) === null && w.toolCalls.length === 0);
    await ctx.close();
  });

  await run("other tabs", async () => {
    const w = world();
    const { ctx, page } = await open(browser, w, "sales/blank.html", { seed: seed(w, "rep") });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "ui/hub.js"), "utf8") + "\nwindow.__n = 0; window.__ok = kitHubAdopt('sales', 'sales_session', { active: () => { window.__n++; }, leaving: () => { sessionStorage.setItem('__left', 'kept'); } });" });
    check("adopt: the tool starts on the shared session", await page.evaluate(() => window.__ok === true && JSON.parse(sessionStorage.getItem("sales_session")).name === "Rita Rep"));
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "delardi_last_active", newValue: String(Date.now()) })));
    check("someone using another tab counts as activity here, so this tab does not lock everyone for being idle", (await page.evaluate(() => window.__n)) === 1);
    await Promise.all([page.waitForURL((u) => u.pathname === "/delardi-board/"), page.evaluate(() => { localStorage.removeItem("delardi_session"); window.dispatchEvent(new StorageEvent("storage", { key: "delardi_session" })); })]);
    check("locked in another tab: the tool is told before the page leaves (the till sets its sale aside), then goes to the sign-in", (await page.evaluate(() => sessionStorage.getItem("__left"))) === "kept");
    await ctx.close();
  });

  await run("menu", async () => {
    const w = world();
    const { ctx, page } = await open(browser, w, "blank.html", { seed: seed(w, "rep") });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "ui/hub.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "ui/tools.js"), "utf8") + "\nwindow.__menu = (id, lang) => { const m = kitToolsMenu(id, lang); return [...m.querySelectorAll('li > *')].map((n) => n.tagName + ':' + n.textContent + (n.getAttribute('aria-disabled') ? ':off' : '') + (n.getAttribute('aria-current') ? ':here' : '')).join('|'); };" });
    const m = await page.evaluate(() => window.__menu("sales", "en"));
    check("Tools menu: tools without access are listed, greyed, and are not links", m === "SPAN:Sales:here|SPAN:Stock:off|A:Clients|A:Catalogue|A:Tasks|SPAN:Performance:off", m);
    await page.evaluate(() => localStorage.removeItem("delardi_session"));
    const m2 = await page.evaluate(() => window.__menu("sales", "en"));
    check("Tools menu: with no shared session every tool is a link, as before", m2 === "SPAN:Sales:here|A:Stock|A:Clients|A:Catalogue|A:Tasks|A:Performance", m2);
    await ctx.close();
  });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
