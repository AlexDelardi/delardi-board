// Checks for the Access page against qa/mock.js, a stand-in for access-api.
// Run from access/src after a build:  python3 build.py && node qa/test.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");

const HTML_FILE = path.join(__dirname, "..", "..", "index.html");
const PAGE_URL = "https://alexdelardi.github.io/delardi-board/access/";
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/access-api";
const SHOTS = process.env.SHOTS || "";

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  results.push((ok ? "PASS " : "FAIL ") + name + (detail !== undefined && !ok ? "  → " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""));
}
async function setup(browser, viewport, opts = {}) {
  if (opts.keep !== true) mock.reset();
  const ctx = await browser.newContext({ viewport, locale: "en-GB", hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [], foreign = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const html = fs.readFileSync(HTML_FILE, "utf8").replace("<head>", "<head><script>window.__HUB_OFF = true;</script>");   // the single sign-in (ui/hub.js) is off here: these tests use the tool's own passcode card
  await page.route("**/*", async (r) => {
    const u = r.request().url();
    if (u.startsWith("data:")) return r.continue();
    if (u.startsWith(PAGE_URL)) return r.fulfill({ status: 200, contentType: "text/html", body: html });
    if (u === API) {
      const body = JSON.parse(r.request().postData() || "{}");
      const [status, data] = mock.handle(body);
      if (mock.delay[body.action]) await new Promise((res) => setTimeout(res, mock.delay[body.action]));
      return r.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    }
    foreign.push(u);
    return r.fulfill({ status: 404, body: "" });
  });
  if (opts.lang) await page.addInitScript((l) => { try { localStorage.setItem("delardi_lang", l); } catch (e) { /* ignore */ } }, opts.lang);
  if (opts.now) await page.clock.setFixedTime(new Date(opts.now));
  await page.goto(PAGE_URL + (opts.query === undefined ? "?season=off" : opts.query) + (opts.hash || ""));
  if (opts.login !== false) { await login(page, opts.pass || "demo"); await loaded(page); }
  return { ctx, page, errors, foreign };
}
async function login(page, pass = "demo", ok = true) {
  await page.waitForSelector("#gate-pass");
  await page.fill("#gate-pass", pass);
  await page.click(".gate-card button[type=submit]");
  if (ok) await page.waitForSelector("#gate", { state: "detached" });
}
const loaded = (page) => page.waitForFunction(() => typeof S !== "undefined" && S.doc && document.querySelector("main .screen"));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const names = (page, sel) => page.$$eval(sel + " .person-name", (ns) => ns.map((n) => n.textContent));
const callsOf = (a) => mock.calls.filter((c) => c.action === a);
const toastText = (page) => page.textContent("#toast");
async function go(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(60); }
async function shot(page, name, full) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: !!full });
}

(async () => {
  const browser = await chromium.launch();
  const run = async (name, fn) => {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
    try { await fn(); } catch (e) { check(name + " (ran to the end)", false, e.message.split("\n")[0] + " @ " + ((e.stack || "").split("\n").find((l) => /qa\/test\.js/.test(l)) || "").trim().slice(-40)); }
  };
  const person = (n) => mock.people.find((p) => p.name === n);
  const openCard = async (page, n) => { await page.click(`.person:has(.person-name:text-is("${n}")) .person-open`); await page.waitForSelector("#person-panel"); };

  await run("gate", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1280, height: 800 }, { login: false });
    check("gate: nothing behind the passcode card", (await page.$eval("#app", (a) => a.children.length)) === 0);
    await login(page, "wrong", false);
    await page.waitForSelector(".gate-card .err:not([hidden])");
    check("gate: a wrong passcode is refused in words", (await page.textContent(".gate-card .err")) === "That passcode is not right.");
    await login(page, "rep", false);
    await page.waitForFunction(() => document.querySelector(".gate-card .err").textContent.includes("does not have access"));
    check("gate: a login without the access right is told so and sees nothing", (await page.$eval("#app", (a) => a.children.length)) === 0);
    await login(page, "demo"); await loaded(page);
    check("gate: the access manager comes in on People", (await page.textContent(".screen .title")) === "People" && (await page.getAttribute("#tab-people", "aria-current")) === "page");
    check("gate: three tabs for someone with the login log", JSON.stringify(await page.$$eval(".kit-tab", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["People", "Rights", "Logins"]));
    check("gate: the page talks to its own API only", foreign.length === 0, foreign);
    check("gate: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("people", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    check("people: the active people, in order, each a card", JSON.stringify(await names(page, "#people-on")) === JSON.stringify(["Tessa Boss", "Lena Lead", "Rita Rep", "Nina New", "Peter Peek"]));
    const lena = await page.textContent('.person:has(.person-name:text-is("Lena Lead"))');
    check("people: a card says the role, the rep name, the last sign-in and how many rights", /Head of Sales/.test(lena) && /Sales rep: Lena L\./.test(lena) && /Last sign-in 2 Mar 2031/.test(lena) && /9 of 24 rights/.test(lena), lena);
    check("people: it says whether the passcode can be looked up", /Passcode set earlier/.test(lena) && /Passcode can be looked up/.test(await page.textContent('.person:has(.person-name:text-is("Rita Rep"))')));
    check("people: my own card is marked", /This is you\./.test(await page.textContent('.person:has(.person-name:text-is("Tessa Boss"))')) && !/This is you/.test(lena));
    check("people: no sign-in is said, not left blank", /No sign-in on record/.test(await page.textContent('.person:has(.person-name:text-is("Nina New"))')));
    check("people: switched-off and test logins are folded away, counted", (await page.textContent("#people-off summary")) === "Switched off (2)" && !(await page.isVisible('#people-off .person')));
    await page.click("#people-off summary");
    check("people: opened, they are listed and marked", JSON.stringify(await names(page, "#people-off")) === JSON.stringify(["Gone Gary", "Claude QA"]) && /Test login/.test(await page.textContent('#people-off .person:has(.person-name:text-is("Claude QA"))')));
    check("people: no passcode is anywhere on the page", !(await page.content()).includes("opal4821"));

    // change the role and the rep name
    await openCard(page, "Nina New");
    check("panel: opens on the person, Save waits for a change", (await page.textContent("#panel-title")) === "Nina New" && await page.isDisabled("#panel-save") && (await page.inputValue("#p-role")) === "Sales Rep");
    await page.fill("#p-role", "Senior Sales Rep"); await page.fill("#p-rep", "Nina N.");
    await page.click("#panel-save");
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Saved.");
    const sent = callsOf("save_person").slice(-1)[0].person;
    check("panel: only the role and the rep name are sent", JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(["person_id", "rep", "role"]) && sent.role === "Senior Sales Rep");
    check("panel: saved, and the card behind follows", person("Nina New").rep === "Nina N." && /Senior Sales Rep/.test(await page.textContent('.person:has(.person-name:text-is("Nina New"))')) && await page.isDisabled("#panel-save"));
    check("panel: a link goes to this person's rights", /2 of 24 rights/.test(await page.textContent("#panel-rights")));
    // a refusal is shown in the panel
    mock.failNext = "save_person";
    await page.fill("#p-role", "Other"); await page.click("#panel-save");
    await page.waitForSelector("#panel-err:not([hidden])");
    check("panel: a failed save says so and keeps what was typed", (await page.textContent("#panel-err")) === "Something went wrong on the server." && (await page.inputValue("#p-role")) === "Other" && person("Nina New").role === "Senior Sales Rep");
    await page.keyboard.press("Escape");
    check("panel: Escape closes it", !(await page.$("#person-panel")));

    // switch off, with a question first
    await openCard(page, "Nina New");
    await page.click("#panel-switch"); await page.waitForSelector("#confirm-dialog");
    check("switch off: asks first, in plain words", /Switch Nina New off\?/.test(await page.textContent("#confirm-dialog")) && /signed out at once/.test(await page.textContent("#confirm-dialog")));
    await page.click("#confirm-cancel");
    check("switch off: No leaves her on", person("Nina New").active && !!(await page.$("#person-panel")));
    await page.click("#panel-switch"); await page.click("#confirm-ok");
    await page.waitForSelector("#person-panel", { state: "detached" });
    check("switch off: she leaves the active list and is counted below", !(await names(page, "#people-on")).includes("Nina New") && (await page.textContent("#people-off summary")) === "Switched off (3)" && !person("Nina New").active && (await toastText(page)) === "Nina New is switched off.");
    await page.click("#people-off summary"); await openCard(page, "Nina New");
    check("switch on: the same card offers to switch her back on", (await page.textContent("#panel-switch")) === "Switch on" && (await page.textContent("#p-state")) === "Switched off");
    await page.click("#panel-switch"); await page.click("#confirm-ok");
    await page.waitForSelector("#person-panel", { state: "detached" });
    check("switch on: back in the active list with her rights", (await names(page, "#people-on")).includes("Nina New") && person("Nina New").rights.can_view_catalogue);
    await openCard(page, "Tessa Boss");
    check("my own card: no way to switch myself off", !(await page.$("#panel-switch")) && /This is you\./.test(await page.textContent("#person-panel")));
    await page.click("#panel-close");
    check("people: no script errors", errors.length === 0, errors);
    await shot(page, "a01-people");
    await ctx.close();
  });

  await run("add", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await page.click("#add-person"); await page.waitForSelector("#person-form");
    check("add: name, role, rep name and whose rights to start from", !!(await page.$("#p-name")) && !!(await page.$("#p-role")) && !!(await page.$("#p-rep")) && JSON.stringify(await page.$$eval("#p-copy option", (os) => os.map((o) => o.textContent))) === JSON.stringify(["Nobody: no rights", "Tessa Boss", "Lena Lead", "Rita Rep", "Nina New", "Peter Peek"]));
    check("add: it says the name is for good and a passcode is made", /cannot be changed later/.test(await page.textContent("#person-form")) && /A passcode is generated/.test(await page.textContent("#person-form")));
    await page.click("#panel-save");
    check("add: no name, no call", (await page.textContent("#panel-err")) === "Give the person a name." && callsOf("save_person").length === 0 && (await page.getAttribute("#p-name", "aria-invalid")) === "true");
    await page.fill("#p-name", "lena lead"); await page.click("#panel-save");
    await page.waitForFunction(() => /already a person/.test(document.querySelector("#panel-err").textContent));
    check("add: a name already taken is refused by the server, in its words", !mock.people.some((p) => p.name === "lena lead"));
    await page.fill("#p-name", "Omar Fresh"); await page.fill("#p-role", "Sales Rep"); await page.selectOption("#p-copy", { label: "Rita Rep" });
    await page.click("#panel-save");
    await page.waitForSelector("#code-dialog");
    const code = await page.textContent("#code-out");
    check("add: the passcode is shown once, to hand over", /^[a-z]+\d{4}$/.test(code) && mock.codes[person("Omar Fresh").person_id] === code && /Passcode for Omar Fresh/.test(await page.textContent("#code-dialog")), code);
    check("add: the person is in the list with the copied rights", (await names(page, "#people-on")).includes("Omar Fresh") && /4 of 24 rights/.test(await page.textContent('.person:has(.person-name:text-is("Omar Fresh"))')) && person("Omar Fresh").rights.can_edit_crm && !person("Omar Fresh").rights.can_manage_access);
    check("add: the panel is closed behind the passcode", !(await page.$("#person-panel")));
    await page.click("#code-ok");
    check("add: closed, the passcode is nowhere on the page", !(await page.$("#code-dialog")) && !(await page.content()).includes(code) && !(await page.evaluate((c) => JSON.stringify(S).includes(c), code)));
    check("add: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("passcode", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openCard(page, "Lena Lead");
    check("passcode (set earlier): it says it cannot be shown, and offers only a new one", /set before this tool and cannot be shown/.test(await page.textContent("#pass-state")) && !(await page.$("#pass-show")) && !!(await page.$("#pass-new")));
    await page.click("#pass-new"); await page.waitForSelector("#confirm-dialog");
    check("new passcode: asks first and says what it does", /A new passcode for Lena Lead\?/.test(await page.textContent("#confirm-dialog")) && /stops working at once/.test(await page.textContent("#confirm-dialog")));
    await page.click("#confirm-cancel");
    check("new passcode: No changes nothing", callsOf("new_passcode").length === 0);
    await page.click("#pass-new"); await page.click("#confirm-ok");
    await page.waitForSelector("#code-dialog");
    const code = await page.textContent("#code-out");
    check("new passcode: shown to hand over", /^[a-z]+\d{4}$/.test(code) && mock.codes[person("Lena Lead").person_id] === code && /New passcode for Lena Lead/.test(await page.textContent("#code-dialog")), code);
    await page.click("#code-out-copy");
    check("new passcode: Copy puts it on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())) === code && (await toastText(page)) === "Copied.");
    await page.click("#code-ok");
    check("new passcode: the card now says it can be looked up", /It can be looked up here; each look is recorded/.test(await page.textContent("#pass-state")) && !!(await page.$("#pass-show")));
    const views = () => mock.history.filter((h) => h.action === "passcode_view").length;
    check("show: nothing is fetched until asked", callsOf("show_passcode").length === 0 && views() === 0);
    await page.click("#pass-show"); await page.waitForSelector("#pass-out");
    check("show: the passcode appears, and the look is recorded", (await page.textContent("#pass-out")) === code && views() === 1 && (await page.textContent("#pass-show")) === "Hide");
    await page.click("#pass-show");
    check("show: Hide takes it off the screen and out of the page", !(await page.$("#pass-out")) && !(await page.content()).includes(code) && !(await page.evaluate((c) => JSON.stringify(S).includes(c), code)));
    await page.click("#pass-show"); await page.waitForSelector("#pass-out");
    check("show: each look is asked for and recorded again", views() === 2);
    await page.click("#panel-close");
    check("show: closing the card drops it", !(await page.content()).includes(code));
    // a refusal
    await openCard(page, "Rita Rep");
    mock.failNext = "show_passcode";
    await page.click("#pass-show");
    await page.waitForFunction(() => document.querySelector("#toast").classList.contains("err"));
    check("show: a failure is said and nothing is shown", !(await page.$("#pass-out")) && (await page.isEnabled("#pass-show")));
    await page.click("#panel-close");
    // no key on the server
    mock.keyReady = false;
    await page.reload(); await loaded(page);
    check("no key: the page says passcodes cannot be issued yet", /passcode key is not set up/.test(await page.textContent("#no-key")));
    await openCard(page, "Peter Peek"); await page.click("#pass-new"); await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelector("#toast").classList.contains("err"));
    check("no key: asking for one says why, and shows none", /passcode key is not set up/.test(await toastText(page)) && !(await page.$("#code-dialog")));
    check("passcode: no script errors", errors.length === 0, errors);
    await shot(page, "a02-passcode");
    await ctx.close();
  });

  await run("passcode own and late", async () => {
    // one's own: the session ends with the old passcode, and the new one must still be readable
    let { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await openCard(page, "Tessa Boss");
    await page.click("#pass-new"); await page.click("#confirm-ok");
    await page.waitForSelector("#code-dialog");
    const snaps = callsOf("snapshot").length;
    await page.waitForTimeout(400);
    const own = await page.textContent("#code-out");
    check("own passcode: it stays on screen, and the page asks the server for nothing", /^[a-z]+\d{4}$/.test(own) && !!(await page.$("#code-dialog")) && !(await page.$("#gate")) && callsOf("snapshot").length === snaps, own);
    check("own passcode: it says they are signed out and must note it", /your own passcode/.test(await page.textContent("#code-note")));
    await page.click("#code-ok");
    await page.waitForSelector("#gate");
    check("own passcode: closing returns to the gate, saying what to do", /Sign in with your new passcode\./.test(await page.textContent("#gate")) && !(await page.content()).includes(own) && (await page.$eval("#app", (a) => a.children.length)) === 0);
    check("own passcode: no errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // closed by the scrim instead of the button
    ({ ctx, page } = await setup(browser, { width: 1280, height: 800 }));
    await openCard(page, "Tessa Boss");
    await page.click("#pass-new"); await page.click("#confirm-ok");
    await page.waitForSelector("#code-dialog");
    await page.click("#code-dialog-close");
    await page.waitForSelector("#gate");
    check("own passcode: the × returns to the gate too", /Sign in with your new passcode\./.test(await page.textContent("#gate")));
    await ctx.close();
    // an answer that arrives after the page was locked
    ({ ctx, page } = await setup(browser, { width: 1280, height: 800 }));
    await openCard(page, "Lena Lead");
    mock.delay.new_passcode = 500;
    await page.click("#pass-new"); await page.click("#confirm-ok");
    await page.waitForTimeout(100);
    await page.evaluate(() => lockNow());
    await page.waitForTimeout(800);
    delete mock.delay.new_passcode;
    const late = mock.codes[person("Lena Lead").person_id];
    check("late answer: a new passcode that arrives after Lock is not shown", !!late && !(await page.$("#code-dialog")) && !!(await page.$("#gate")) && !(await page.content()).includes(late));
    await ctx.close();
    ({ ctx, page } = await setup(browser, { width: 1280, height: 800 }));
    await page.click("#add-person"); await page.waitForSelector("#person-panel");
    await page.fill("#p-name", "Late Lara");
    mock.delay.save_person = 500;
    await page.click("#panel-save");
    await page.waitForTimeout(100);
    await page.evaluate(() => lockNow());
    await page.waitForTimeout(800);
    delete mock.delay.save_person;
    const lara = mock.people.find((x) => x.name === "Late Lara");
    check("late answer: a new person's passcode that arrives after Lock is not shown", !!lara && !(await page.$("#code-dialog")) && !(await page.content()).includes(mock.codes[lara.person_id]));
    await ctx.close();
  });

  await run("rights", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 900 });
    await go(page, "#/rights"); await page.waitForSelector("#matrix");
    check("rights: a column per active person, a row per right, grouped by tool", JSON.stringify(await page.$$eval("#matrix thead th.r-person", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["Tessa Boss", "Lena Lead", "Rita Rep", "Nina New", "Peter Peek"])
      && (await page.$$("#matrix tbody tr[data-right]")).length === 24 && JSON.stringify(await page.$$eval("#matrix tr.r-group", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["Clients", "Catalogue", "Sales", "Stock", "Performance", "Tasks", "Access"]));
    check("rights: each row says what the right allows", /Open the CRM: client list, client cards, phone numbers\./.test(await page.textContent('#matrix tr[data-right="can_view_crm"] th')));
    const cell = (n, k) => `.cell[data-person="${person(n).person_id}"][data-right="${k}"]`;
    check("rights: the cells show what each person has", (await page.getAttribute(cell("Lena Lead", "can_manage_stock"), "aria-pressed")) === "true" && (await page.getAttribute(cell("Rita Rep", "can_view_stock"), "aria-pressed")) === "false"
      && (await page.getAttribute(cell("Rita Rep", "can_view_stock"), "aria-label")) === "Rita Rep: See stock");
    check("rights: every cell is a 44 px target", await page.$$eval("#matrix .cell", (cs) => cs.length === 120 && cs.every((c) => { const r = c.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })));
    await page.click(cell("Rita Rep", "can_view_stock"));
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Rita Rep: See stock is on.");
    const sent = callsOf("set_right").slice(-1)[0];
    check("rights: a tap switches it on at once", sent.right === "can_view_stock" && sent.on === true && sent.person_id === person("Rita Rep").person_id && person("Rita Rep").rights.can_view_stock && (await page.getAttribute(cell("Rita Rep", "can_view_stock"), "aria-pressed")) === "true");
    await page.waitForFunction(() => { const h = document.querySelector("#history"); return !!h && /See stock: on/.test(h.textContent); });
    check("rights: the change is at the top of the history", /Tessa Boss/.test(await page.textContent("#history .h-line")) && /Rita Rep/.test(await page.textContent("#history .h-line")) && /See stock: on/.test(await page.textContent("#history .h-line")));
    await page.click(cell("Rita Rep", "can_view_stock"));
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Rita Rep: See stock is off.");
    check("rights: a second tap switches it off", !person("Rita Rep").rights.can_view_stock);
    check("rights: my own access to this tool cannot be tapped away", await page.isDisabled(cell("Tessa Boss", "can_manage_access")) && /cannot remove your own access/.test(await page.getAttribute(cell("Tessa Boss", "can_manage_access"), "title")) && await page.isEnabled(cell("Peter Peek", "can_manage_access")) && await page.isEnabled(cell("Tessa Boss", "can_view_logins")));
    mock.failNext = "set_right";
    await page.click(cell("Nina New", "can_view_crm"));
    await page.waitForFunction(() => document.querySelector("#toast").classList.contains("err"));
    check("rights: a failed switch says so and the cell stays as it was", (await page.getAttribute(cell("Nina New", "can_view_crm"), "aria-pressed")) === "false" && !person("Nina New").rights.can_view_crm && await page.isEnabled(cell("Nina New", "can_view_crm")));
    mock.delay.set_right = 400;
    await page.click(cell("Nina New", "can_view_crm"));
    check("rights: while one switch is being saved it cannot be tapped again", await page.isDisabled(cell("Nina New", "can_view_crm")) && await page.isEnabled(cell("Nina New", "can_edit_crm")));
    await page.waitForFunction(() => /is on\./.test(document.querySelector("#toast").textContent));
    delete mock.delay.set_right;
    check("rights: switched-off people have no column", !(await page.textContent("#matrix thead")).includes("Gone Gary"));
    const hist = await page.$$eval("#history .h-line", (ls) => ls.map((l) => l.textContent));
    check("rights: the history reads in words — rights, roles, passcodes", hist.some((t) => /Manage stock: on/.test(t)) && hist.some((t) => /Role: empty → Sales Rep/.test(t)) && hist.some((t) => /new passcode/.test(t)) && hist.every((t) => /\d{1,2} Mar 2031, \d\d:\d\d/.test(t)), hist.slice(0, 4));
    // from a person's card
    await go(page, "#/people"); await openCard(page, "Peter Peek"); await page.click("#panel-rights");
    await page.waitForSelector("#matrix");
    check("rights: the card's link lands on Rights", (await page.getAttribute("#tab-rights", "aria-current")) === "page" && !(await page.$("#person-panel")));
    check("rights: no script errors", errors.length === 0, errors);
    await shot(page, "a03-rights");
    await ctx.close();
  });

  await run("rights narrow", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 390, height: 844 }, { touch: true });
    await go(page, "#/rights"); await page.waitForSelector("#who");
    check("rights (phone): one person at a time, chosen from a list", !(await page.$("#matrix")) && JSON.stringify(await page.$$eval("#who option", (os) => os.map((o) => o.textContent))) === JSON.stringify(["Tessa Boss · Retail Director", "Lena Lead · Head of Sales", "Rita Rep · Sales Rep", "Nina New · Sales Rep", "Peter Peek · Managing Partner"]));
    await page.selectOption("#who", { label: "Rita Rep · Sales Rep" });
    check("rights (phone): every right is a row with its words and On or Off", (await page.$$("#rights-host .cell.row")).length === 24 && /See clients/.test(await page.textContent('.cell.row[data-right="can_view_crm"]')) && /On$/.test((await page.textContent('.cell.row[data-right="can_view_crm"]')).trim()) && /Off$/.test((await page.textContent('.cell.row[data-right="can_view_stock"]')).trim()));
    await page.click('.cell.row[data-right="can_view_stock"]');
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Rita Rep: See stock is on.");
    check("rights (phone): a tap switches it, and the person stays chosen", person("Rita Rep").rights.can_view_stock && (await page.$eval("#who", (s) => s.options[s.selectedIndex].textContent)) === "Rita Rep · Sales Rep" && /On$/.test((await page.textContent('.cell.row[data-right="can_view_stock"]')).trim()));
    await page.selectOption("#who", { label: "Tessa Boss · Retail Director" });
    check("rights (phone): my own access row cannot be tapped", await page.isDisabled('.cell.row[data-right="can_manage_access"]'));
    check("rights (phone): no script errors", errors.length === 0, errors);
    await shot(page, "a04-rights-phone");
    await ctx.close();
  });

  await run("logins", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    check("logins: nothing is asked for before the tab is opened", callsOf("logins").length === 0);
    await go(page, "#/logins"); await page.waitForSelector("#usage");
    check("logins: thirty days first", callsOf("logins").slice(-1)[0].days === 30 && (await page.inputValue("#l-days")) === "30");
    check("logins: a row per person, a column per tool", JSON.stringify(await page.$$eval("#usage thead th", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["Person", "Last sign-in", "Sales", "Stock", "Clients", "Catalogue", "Tasks", "Performance", "Total"])
      && JSON.stringify(await page.$$eval("#usage tbody th", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["Tessa Boss", "Lena Lead", "Rita Rep", "Nina New"]));
    const row = (n) => page.$$eval(`#usage tr[data-who="${n}"] td`, (ts) => ts.map((t) => t.textContent));
    check("logins: counts per tool, the last sign-in with its tool, the total", JSON.stringify(await row("Lena Lead")) === JSON.stringify(["2 Mar 2031 · Stock", "—", "3", "2", "—", "—", "—", "5"]), await row("Lena Lead"));
    check("logins: someone who never signed in is said so", (await row("Nina New"))[0] === "never" && (await row("Nina New")).slice(-1)[0] === "0");
    check("logins: a tool the person has no right to is greyed", await page.$eval('#usage tr[data-who="Lena Lead"] td[data-tool="perf"]', (t) => t.classList.contains("no-right")) && !(await page.$eval('#usage tr[data-who="Lena Lead"] td[data-tool="stock"]', (t) => t.classList.contains("no-right"))));
    check("logins: the latest sign-ins, newest first, with this tool's own", JSON.stringify(await page.$$eval("#recent tbody tr", (rs) => rs.slice(0, 2).map((r) => [...r.children].slice(1).map((c) => c.textContent).join("/")))) === JSON.stringify(["Tessa Boss/Performance", "Tessa Boss/Access"]) && /3 Mar 2031, 10:10/.test(await page.textContent("#recent tbody tr")));
    check("logins: it says since when and that test logins are left out", /The log starts on 20 Feb 2031\. Test logins are left out\./.test(await page.textContent("#screen-logins")));
    await page.selectOption("#l-days", "90"); await page.waitForFunction(() => S.logins && !S.logins.busy && S.logins.days === 90);
    check("logins: another period is asked for", callsOf("logins").slice(-1)[0].days === 90);
    mock.failNext = "logins";
    await page.selectOption("#l-days", "7"); await page.waitForSelector("#logins-err");
    check("logins: a failure is said, with a way to try again", /Something went wrong/.test(await page.textContent("#logins-err")));
    await page.click("#logins-err button"); await page.waitForSelector("#usage");
    check("logins: trying again works", callsOf("logins").slice(-1)[0].days === 7);
    check("logins: no script errors", errors.length === 0, errors);
    await shot(page, "a05-logins");
    await ctx.close();
    // without the right
    const b = await setup(browser, { width: 1280, height: 800 }, { pass: "nolog", hash: "#/logins" });
    await b.page.waitForFunction(() => location.hash === "#/people");
    check("logins: without its right there is no tab, and the address leads back to People", JSON.stringify(await b.page.$$eval(".kit-tab", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["People", "Rights"]) && callsOf("logins").length === 0);
    await b.ctx.close();
  });

  await run("russian", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 }, { lang: "ru" });
    check("russian: the tabs and the title", JSON.stringify(await page.$$eval(".kit-tab", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["Люди", "Права", "Входы"]) && (await page.textContent(".kit-tool")) === "Доступ");
    check("russian: a card", /Продавец: Lena L\./.test(await page.textContent('.person:has(.person-name:text-is("Lena Lead"))')) && /Последний вход 2 мар 2031/.test(await page.textContent('.person:has(.person-name:text-is("Lena Lead"))')));
    await go(page, "#/rights"); await page.waitForSelector("#matrix");
    const left = await page.$$eval("#matrix tbody th", (ts) => ts.flatMap((t) => [...t.querySelectorAll(".r-name, .r-what")].map((n) => n.textContent)).filter((x) => /^[A-Za-z]/.test(x) && !/^(Colibri|CRM|Excel)/.test(x)));
    check("russian: every right and what it allows is in Russian", left.length === 0, left);
    check("russian: the groups too", JSON.stringify(await page.$$eval("#matrix tr.r-group", (ts) => ts.map((t) => t.textContent))) === JSON.stringify(["Клиенты", "Каталог", "Продажи", "Склад", "Показатели", "Задачи", "Доступ"]));
    await page.click(`.cell[data-person="${person("Rita Rep").person_id}"][data-right="can_view_stock"]`);
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Rita Rep: «Видеть склад» включено.");
    await page.waitForFunction(() => { const h = document.querySelector("#history .h-line"); return !!h && /Видеть склад: вкл/.test(h.textContent); });
    check("russian: the history line", /Tessa Boss/.test(await page.textContent("#history .h-line")));
    check("russian: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  for (const [w, h, label] of [[390, 844, "phone 390"], [360, 720, "phone 360"], [820, 1180, "iPad portrait"], [1024, 768, "iPad landscape"]]) {
    await run("layout " + label, async () => {
      const phone = w < 600;
      const { ctx, page, errors } = await setup(browser, { width: w, height: h }, { touch: true, lang: w === 360 ? "ru" : "en" });
      const small = (sel) => page.$$eval(sel, (xs) => xs.filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); }).map((x) => (x.id || x.textContent || x.className).trim().slice(0, 24)));
      const tiny = () => page.$$eval("#app *, #person-panel *", (ns) => ns.filter((n) => n.children.length === 0 && n.textContent.trim() && n.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(n).fontSize) < 11).map((n) => n.textContent.trim().slice(0, 20)));
      const cut = () => page.$$eval("#main *", (ns) => ns.filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > window.innerWidth + 1 && !n.closest(".table-wrap"); }).map((n) => (n.className || n.tagName) + " " + n.textContent.trim().slice(0, 16)).slice(0, 4));
      const TAPS = "#app button, #app a.kit-tab, #app select, #app summary";
      for (const [hash, name, wait] of [["#/people", "People", "#people-on"], ["#/rights", "Rights", "#rights-host > *"], ["#/logins", "Logins", "#usage"]]) {
        await go(page, hash); await page.waitForSelector(wait);
        check(label + ": " + name + " does not scroll sideways, nothing cut off", await noHScroll(page) && (await cut()).length === 0, (await cut()).join(" | "));
        check(label + ": everything to tap on " + name + " is 44 px", (await small(TAPS)).length === 0, (await small(TAPS)).join());
        check(label + ": no text under 11 px on " + name, (await tiny()).length === 0, (await tiny()).join());
        await shot(page, "a10-" + name.toLowerCase() + "-" + w);
      }
      if (phone) {
        check(label + ": the header is one slim row with a menu button", !!(await page.$("#menu-btn")) && !(await page.$(".kit-head .kit-lang")) && (await page.$eval(".kit-head", (n) => Math.round(n.getBoundingClientRect().height))) === 56);
        await page.click("#menu-btn"); await page.waitForSelector("#head-menu .head-panel");
        check(label + ": the menu is the side panel with the person, the tools, the language and the lock", !!(await page.$("#head-menu .kit-tool-wrap")) && !!(await page.$("#head-menu .kit-lang")) && /Tessa Boss/.test(await page.textContent("#head-menu")));
        await page.click("#head-close");
        check(label + ": the usage table scrolls in its own box with the names in place", await page.evaluate(async () => { const w = document.querySelector("#usage").closest(".table-wrap"); const c = () => document.querySelector("#usage tbody th").getBoundingClientRect().left; const a = c(); w.scrollLeft = 150; await new Promise((r) => requestAnimationFrame(r)); const ok = w.scrollLeft > 50 && Math.abs(c() - a) < 1.5; w.scrollLeft = 0; return ok; }));
      } else {
        check(label + ": the header keeps its controls in the bar", !(await page.$("#menu-btn")) && !!(await page.$(".kit-head .kit-lang")));
      }
      if (w >= 900) {
        await go(page, "#/rights"); await page.waitForSelector("#matrix");
        check(label + ": the matrix scrolls inside its own box and the rights' names stay in place", await page.evaluate(async () => { const w = document.querySelector("#matrix-wrap"); const c = () => document.querySelector("#matrix tbody th.r-right").getBoundingClientRect().left; const a = c(); w.scrollLeft = 120; await new Promise((r) => requestAnimationFrame(r)); const moved = w.scrollLeft; const ok = moved === 0 || Math.abs(c() - a) < 1.5; w.scrollLeft = 0; return ok; }));
      }
      await go(page, "#/people");
      await page.click('.person:has(.person-name:text-is("Rita Rep")) .person-open'); await page.waitForSelector("#person-panel");
      check(label + ": the person panel fits the screen", await page.evaluate(() => { const n = document.querySelector("#person-panel .panel"); const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && n.scrollWidth <= n.clientWidth + 1; }));
      check(label + ": everything to tap in the panel is 44 px", (await small("#person-panel button, #person-panel input, #person-panel a.btn")).length === 0, (await small("#person-panel button, #person-panel input, #person-panel a.btn")).join());
      await shot(page, "a11-panel-" + w);
      check(label + ": no script errors", errors.length === 0, errors);
      await ctx.close();
    });
  }

  await run("session", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await openCard(page, "Rita Rep"); await page.click("#pass-show"); await page.waitForSelector("#pass-out");
    await page.evaluate(() => lockDown("Locked after 15 minutes without use."));   // the idle lock strikes with a card open and a passcode on show
    await page.waitForSelector("#gate");
    check("lock: nothing is left behind the card — no people, no panel, no passcode", (await page.$eval("#app", (a) => a.children.length)) === 0 && !(await page.$("#person-panel")) && !(await page.content()).includes("opal4821") && await page.evaluate(() => S.doc === null && S.panel === null && S.token === null));
    await login(page, "demo"); await loaded(page);
    await page.click(".kit-head .kit-hbtn:has-text('Lock')"); await page.waitForSelector("#gate");
    check("lock: the Lock button locks", (await page.$eval("#app", (a) => a.children.length)) === 0 && (await toastText(page)) === "Locked.");
    await login(page, "demo"); await loaded(page);
    await page.reload(); await loaded(page);
    check("session: a reload in the same tab stays signed in", !(await page.$("#gate")) && (await names(page, "#people-on")).length === 5);
    mock.expire();
    await go(page, "#/rights"); await page.reload();
    await page.waitForSelector("#gate");
    check("session: one that is no longer good goes back to the passcode card, saying why", /session is not valid/.test(await page.textContent(".gate-card .err")) && (await page.$eval("#app", (a) => a.children.length)) === 0);
    await login(page, "demo"); await loaded(page);
    // the right is taken away while the page is open
    mock.people.find((p) => p.name === "Tessa Boss").rights.can_manage_access = false;
    await go(page, "#/rights"); await page.waitForSelector("#matrix");
    await page.click(`.cell[data-right="can_view_stock"]:not([aria-pressed="true"])`);
    await page.waitForSelector("#gate");
    check("session: access taken away mid-session locks the page", /does not have access/.test(await page.textContent(".gate-card .err")) && (await page.$eval("#app", (a) => a.children.length)) === 0);
    check("session: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("idle", async () => {
    const { ctx, page } = await setup(browser, { width: 820, height: 1180 }, { touch: true, now: "2031-03-03T06:00:00Z" });
    await page.clock.setFixedTime(new Date("2031-03-03T06:16:00Z"));
    await page.evaluate(() => idleCheck());
    await page.waitForSelector("#gate");
    check("idle: an iPad left for 15 minutes asks for the passcode again", /Locked after 15 minutes/.test(await page.textContent(".gate-card .err")));
    await ctx.close();
  });

  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
