// Checks for the task tracker's page against qa/mock.js, a stand-in for tasks-api.
// Run from tasks/src after a build:  python3 build.py && node qa/test.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");

const HTML_FILE = path.join(__dirname, "..", "..", "index.html");
const PAGE_URL = "https://alexdelardi.github.io/delardi-board/tasks/";
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/tasks-api";
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
  const html = fs.readFileSync(HTML_FILE, "utf8");
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
const titles = (page, sel) => page.$$eval(sel + " .task-title", (ns) => ns.map((n) => n.textContent));
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
    try { await fn(); } catch (e) { check(name + " (ran to the end)", false, e.message.split("\n")[0]); }
  };

  await run("gate", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 }, { login: false });
    check("gate: nothing behind the passcode card", (await page.$eval("#app", (a) => a.children.length)) === 0);
    await login(page, "wrong", false);
    await page.waitForSelector(".gate-card .err:not([hidden])");
    check("gate: a wrong passcode is refused in words", (await page.textContent(".gate-card .err")) === "That passcode is not right.");
    await login(page, "none", false);
    await page.waitForFunction(() => document.querySelector(".gate-card .err").textContent.includes("does not have access"));
    check("gate: a login with no ribbon is told so", true);
    await login(page, "demo"); await loaded(page);
    check("gate: the tracker opens on My tasks", (await page.textContent("h1.title")) === "My tasks" && (await page.getAttribute("#tab-my", "aria-current")) === "page");
    check("gate: the header names the tool and the person", (await page.textContent(".kit-tool")) === "Tasks" && (await page.textContent(".kit-staff")) === "Tessa Boss");
    check("gate: the tool switcher lists Tasks as the current tool", await page.evaluate(() => { document.querySelector(".kit-tool-wrap > button").click(); const c = document.querySelector(".kit-menu [aria-current=page]"); return !!c && c.textContent === "Tasks"; }));
    check("gate: no requests leave for anywhere but the API", foreign.length === 0, foreign);
    check("gate: no script errors", errors.length === 0, errors);
    await shot(page, "t01-my-desktop");
    await ctx.close();
  });

  await run("my tasks", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "rep" });
    const groups = await page.$$eval("ul.tasks[data-group]", (us) => us.map((u) => [u.getAttribute("data-group"), u.children.length]));
    check("my: tasks fall into overdue, today, this week, later and no date", JSON.stringify(groups) === JSON.stringify([["overdue", 1], ["today", 1], ["week", 2], ["later", 1], ["none", 1]]), groups);
    check("my: a task I help with is mine too, and names its owner", (await titles(page, "ul[data-group=week]")).includes("Collect the repaired bracelet")
      && (await page.textContent("ul[data-group=week] .task:has-text('Collect the repaired') .who")) === "Lena Lead + Rita Rep");
    check("my: done tasks and other people's are not listed", !(await titles(page, "#screen-my")).some((t) => /Old finished|Count the showcase|VIP evening/.test(t)));
    check("my: the tab counts my open tasks", (await page.textContent("#tab-my .count")) === "6");
    const row = "ul[data-group=overdue] .task";
    const meta = await page.textContent(row + " .task-meta");
    check("my: an overdue task shows its scope, priority, due day, checklist progress, comments and client", /CRM/.test(meta) && /High/.test(meta) && /due/.test(meta) && /1 of 2/.test(meta) && /1 comment/.test(meta) && /Amira Stone/.test(meta), meta);
    check("my: an overdue date is marked late", await page.$eval(row + " .due", (n) => n.classList.contains("late")));
    check("my: today's task reads 'due today'", /due today/.test(await page.textContent("ul[data-group=today] .task-meta")));
    check("my: a floor-only login has no ribbon switch and no inbox", !(await page.$("#ribbon-switch")) && !(await page.$("#tab-inbox")));
    // done from the row
    await page.click(row + " .quick");
    await page.waitForFunction(() => !document.querySelector("ul[data-group=overdue]"));
    check("my: Mark done takes the task off the list and says so", (await toastText(page)) === "Done." && (await page.textContent("#tab-my .count")) === "5");
    check("my: one request, the status alone", JSON.stringify(callsOf("save")[0].task) === JSON.stringify({ task_id: mock.tasks[0].task_id, status: "done" }), callsOf("save")[0]);
    await go(page, "#/done");
    check("done: the finished task is there, newest first, struck through", (await titles(page, "#screen-done"))[0] === "Call back about the ring size" && await page.$eval("#screen-done .task", (n) => n.classList.contains("is-done")));
    await page.click("#screen-done .task .quick");
    await page.waitForFunction(() => document.querySelectorAll("#screen-done .task").length === 1);
    check("done: Reopen puts it back", (await toastText(page)) === "Reopened." && mock.tasks[0].status === "todo");
    check("my tasks: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("new task", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "rep" });
    await page.click("#new-task");
    await page.waitForSelector("#task-form");
    check("new: the panel opens on an empty form, mine by default", (await page.inputValue("#t-title")) === "" && (await page.inputValue("#t-owner")) === "Rita Rep");
    check("new: the scopes are the floor's five", JSON.stringify(await page.$$eval("#t-scope option", (os) => os.map((o) => o.textContent))) === JSON.stringify(["Operations", "CRM", "Brand", "Aftersales", "Sales"]));
    check("new: without the manage right the owner list is me alone", JSON.stringify(await page.$$eval("#t-owner option", (os) => os.map((o) => o.value))) === JSON.stringify(["Rita Rep"]));
    check("new: no sensitive box and no archive on the floor", !(await page.$("#t-sensitive")) && !(await page.$("#panel-archive")));
    await page.click("#panel-save");
    check("new: a task needs a title", (await page.textContent("#panel-err")) === "Give the task a title." && callsOf("save").length === 0);
    await page.fill("#t-title", "Wrap the anniversary gift");
    await page.selectOption("#t-scope", "5");
    await page.fill("#t-due", mock.day(1));
    await page.click("#t-priority [data-v=high]");
    await page.fill("#t-notes", "Gold ribbon");
    await page.fill("#t-step", "Find the box"); await page.keyboard.press("Enter");
    await page.fill("#t-step", "Write the card"); await page.click("#t-step-add");
    check("new: steps are added by Enter or the button, and the title typed so far is kept", (await page.$$eval(".steps .step", (s) => s.length)) === 2 && (await page.inputValue("#t-title")) === "Wrap the anniversary gift");
    await page.fill("#t-client-q", "stone");
    await page.waitForSelector("#t-found .found-pick");
    check("new: client search offers the matches", (await page.$$eval("#t-found .found-pick", (b) => b.length)) === 2);
    await page.click("#t-found .found-pick >> nth=0");
    check("new: a picked client becomes a chip linking to the CRM card", (await page.getAttribute(".chips .chip a", "href")) === "../crm/#ZZC-0001" && (await page.textContent(".chips .chip a")) === "Amira Stone");
    await page.fill("#t-piece", "ZZ-REF-1");
    await page.click("#panel-save");
    await page.waitForSelector("#task-panel", { state: "detached" });
    const sent = callsOf("save")[0].task;
    check("new: one save carries the whole task", sent.title === "Wrap the anniversary gift" && sent.scope_id === 5 && sent.owner === "Rita Rep" && sent.due_on === mock.day(1) && sent.priority === "high" && sent.status === "todo"
      && sent.notes === "Gold ribbon" && sent.piece_ref === "ZZ-REF-1" && JSON.stringify(sent.clients) === '["ZZC-0001"]' && sent.checklist.length === 2 && !("task_id" in sent) && !("sensitive" in sent), sent);
    check("new: the task is in my list, under this week", (await toastText(page)) === "Task added." && (await titles(page, "ul[data-group=week]")).includes("Wrap the anniversary gift"));
    // leaving a changed form asks first
    await page.click("#new-task"); await page.waitForSelector("#task-form");
    await page.fill("#t-title", "Half written");
    await page.click("#panel-close");
    await page.waitForSelector("#confirm-dialog");
    await page.click("#confirm-cancel");
    check("new: closing a changed form asks, and 'Keep editing' keeps it", !!(await page.$("#task-form")) && (await page.inputValue("#t-title")) === "Half written");
    await page.keyboard.press("Escape"); await page.waitForSelector("#confirm-dialog"); await page.click("#confirm-ok");
    await page.waitForSelector("#task-panel", { state: "detached" });
    check("new: 'Leave' closes it without saving", callsOf("save").length === 1);
    check("new task: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("edit", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "rep" });
    await page.click("ul[data-group=overdue] .task-open");
    await page.waitForSelector("#task-form");
    check("edit: the panel shows the task as it is", (await page.inputValue("#t-title")) === "Call back about the ring size" && (await page.inputValue("#t-scope")) === "2"
      && (await page.getAttribute("#t-priority [data-v=high]", "aria-pressed")) === "true" && (await page.getAttribute("#t-status [data-v=todo]", "aria-pressed")) === "true");
    check("edit: Save waits for a change", await page.isDisabled("#panel-save"));
    check("edit: comments and history are there", (await page.textContent(".comment-list .comment p")) === "She prefers a call after six" && !!(await page.$("#t-history")));
    // a tick goes at once
    await page.check(".steps .step >> nth=1 >> input");
    await page.waitForFunction(() => document.querySelectorAll(".steps .step.ticked").length === 2);
    check("edit: ticking a step is saved at once, by itself", callsOf("tick").length === 1 && callsOf("tick")[0].done === true && callsOf("save").length === 0 && await page.isDisabled("#panel-save"));
    // a comment goes at once
    await page.fill("#t-comment", "Called, no answer");
    await page.click("#t-comment-send");
    await page.waitForFunction(() => document.querySelectorAll(".comment-list .comment").length === 2);
    check("edit: a comment is added with its author", /Rita Rep/.test(await page.textContent(".comment-list .comment >> nth=1")) && (await page.inputValue("#t-comment")) === "");
    // a change through Save
    await page.click("#t-status [data-v=waiting]");
    await page.fill("#t-helper", "Nina New");
    check("edit: Save wakes on a change", !(await page.isDisabled("#panel-save")));
    await page.click("#panel-save");
    await page.waitForSelector("#task-panel", { state: "detached" });
    const sent = callsOf("save")[0].task;
    check("edit: the save names the task and carries the form", sent.task_id === mock.tasks[0].task_id && sent.status === "waiting" && sent.helper === "Nina New" && (await toastText(page)) === "Saved.");
    check("edit: the row shows the new status, the tick and both comments", /Waiting/.test(await page.textContent("ul[data-group=overdue] .task-meta")) && /2 of 2/.test(await page.textContent("ul[data-group=overdue] .task-meta"))
      && /2 comments/.test(await page.textContent("ul[data-group=overdue] .task-meta")));
    // a refusal from the server is shown as said, and the form stays
    await go(page, "#/team");
    await page.click(".col[data-scope=operations] .task:has-text('Count the showcase') .task-open");
    await page.waitForSelector("#task-form");
    check("edit: someone else's task opens with its owner shown and me as the only other choice", JSON.stringify(await page.$$eval("#t-owner option", (os) => os.map((o) => o.value))) === JSON.stringify(["Lena Lead", "Rita Rep"]));
    await page.selectOption("#t-owner", "Rita Rep"); await page.click("#panel-save");
    await page.waitForSelector("#task-panel", { state: "detached" });
    check("edit: anyone may take a task for themselves", mock.tasks.find((t) => t.title === "Count the showcase stock").owner === "Rita Rep");
    // piece link
    await go(page, "#/my");
    await page.click(".task:has-text('Send the watch quote') .task-open"); await page.waitForSelector("#task-form");
    check("edit: a piece reference links to the Catalogue", (await page.getAttribute("#t-piece-link", "href")) === "../catalogue/#/list?q=ZZ-REF-9");
    mock.failNext = "save";
    await page.fill("#t-notes", "x"); await page.click("#panel-save");
    await page.waitForFunction(() => { const e = document.querySelector("#panel-err"); return e && !e.hidden; });
    check("edit: a failed save says so and keeps the form", (await page.textContent("#panel-err")) === "Something went wrong on the server." && (await page.inputValue("#t-notes")) === "x" && !(await page.isDisabled("#panel-save")));
    check("edit: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("manager", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 }, { pass: "lead" });
    await go(page, "#/team");
    check("team: one column per scope, in order, with counts", JSON.stringify(await page.$$eval(".col", (cs) => cs.map((c) => [c.getAttribute("data-scope"), c.querySelectorAll(".task").length])))
      === JSON.stringify([["operations", 2], ["crm", 1], ["brand", 1], ["aftersales", 2], ["sales", 2]]));
    check("team: the columns sit side by side on a desktop", await page.evaluate(() => { const c = [...document.querySelectorAll(".col")].map((x) => x.getBoundingClientRect()); return c.every((r, i) => i === 0 || (Math.abs(r.top - c[0].top) < 2 && r.left > c[i - 1].left)); }));
    check("team: done tasks are not on the board", !(await titles(page, "#cols")).includes("Old finished floor task"));
    await page.selectOption("#f-owner", "Rita Rep");
    check("team: the owner filter includes tasks she helps with", (await titles(page, "#cols")).length === 6 && (await titles(page, "#cols")).includes("Collect the repaired bracelet"));
    await page.selectOption("#f-status", "waiting");
    check("team: the status filter narrows it", JSON.stringify(await titles(page, "#cols")) === JSON.stringify(["Collect the repaired bracelet"]));
    await page.selectOption("#f-status", "open"); await page.selectOption("#f-owner", ""); await page.selectOption("#f-pri", "high");
    check("team: the priority filter", (await titles(page, "#cols")).length === 2);
    await page.selectOption("#f-pri", "");
    await page.fill("#f-q", "showcase");
    check("team: search narrows as you type and keeps the cursor", JSON.stringify(await titles(page, "#cols")) === JSON.stringify(["Count the showcase stock"]) && await page.evaluate(() => document.activeElement.id === "f-q"));
    await page.fill("#f-q", "zzzz");
    check("team: nothing found is said in words", (await page.textContent("#team-empty")) === "Nothing matches these filters.");
    await page.fill("#f-q", "");
    // a manager gives a task to someone else, and archives
    await page.click("#new-task"); await page.waitForSelector("#task-form");
    check("manager: the owner list is everyone on the floor, and nobody", JSON.stringify(await page.$$eval("#t-owner option", (os) => os.map((o) => o.value))) === JSON.stringify(["", "Lena Lead", "Nina New", "Rita Rep", "Tessa Boss"]));
    await page.fill("#t-title", "Unpack the delivery"); await page.selectOption("#t-owner", "Nina New"); await page.click("#panel-save");
    await page.waitForSelector("#task-panel", { state: "detached" });
    check("manager: a task given to someone else lands on the team board, not in my list", mock.tasks.some((t) => t.title === "Unpack the delivery" && t.owner === "Nina New") && (await titles(page, "#cols")).includes("Unpack the delivery"));
    await page.click(".task:has-text('Unpack the delivery') .task-open"); await page.waitForSelector("#panel-archive");
    await page.click("#panel-archive"); await page.waitForSelector("#confirm-dialog"); await page.click("#confirm-ok");
    await page.waitForSelector("#task-panel", { state: "detached" });
    check("manager: archiving asks first, then the task leaves every list", (await toastText(page)) === "Archived." && !(await titles(page, "#cols")).includes("Unpack the delivery") && mock.tasks.find((t) => t.title === "Unpack the delivery").archived);
    check("manager: no script errors", errors.length === 0, errors);
    await shot(page, "t02-team-desktop");
    await ctx.close();
  });

  await run("crm right", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "fresh" });
    await go(page, "#/team");
    const meta = await page.textContent(".task:has-text('Call back about the ring') .task-meta");
    check("no CRM access: a tag says a client is attached, without the name", /Client attached/.test(meta) && !/Amira/.test(meta), meta);
    check("no CRM access: two clients are counted, not named", /2 clients attached/.test(await page.textContent(".task:has-text('Collect the repaired') .task-meta")));
    await page.click(".task:has-text('Call back about the ring') .task-open"); await page.waitForSelector("#task-form");
    check("no CRM access: the panel has no client search and explains why", !(await page.$("#t-client-q")) && /CRM access/.test(await page.textContent("#t-clients")));
    await page.fill("#t-notes", "seen"); await page.click("#panel-save");
    await page.waitForSelector("#task-panel", { state: "detached" });
    check("no CRM access: a save leaves the tags alone", !("clients" in callsOf("save")[0].task) && mock.tasks[0].clients.length === 1);
    check("crm right: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  await run("ribbons", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    check("ribbons: a login with both gets the switch, on Shop floor first", (await page.getAttribute("#ribbon-switch [data-ribbon=floor]", "aria-pressed")) === "true" && !(await page.$("#tab-inbox")));
    await page.click("#ribbon-switch [data-ribbon=backoffice]");
    check("ribbons: Backoffice shows its own tasks and the Inbox tab with its count", (await titles(page, "#screen-my")).includes("Review the incentive scheme") && !(await titles(page, "#screen-my")).includes("Prepare the VIP evening list")
      && (await page.textContent("#tab-inbox .count")) === "2");
    await go(page, "#/team");
    check("ribbons: Backoffice has its four scopes", JSON.stringify(await page.$$eval(".col-title", (hs) => hs.map((h) => h.firstChild.textContent))) === JSON.stringify(["Marketing", "Retail", "Operations", "Company Steering"]));
    check("ribbons: a sensitive task is marked for those who may see it", /Sensitive/.test(await page.textContent(".task:has-text('Owner salary review') .task-meta")));
    await page.click("#new-task"); await page.waitForSelector("#task-form");
    check("ribbons: a new Backoffice task offers the sensitive box and Backoffice people", !!(await page.$("#t-sensitive")) && JSON.stringify(await page.$$eval("#t-owner option", (os) => os.map((o) => o.value))) === JSON.stringify(["", "Boris Back", "Tessa Boss"]));
    await page.fill("#t-title", "Private thing"); await page.check("#t-sensitive"); await page.click("#panel-save");
    await page.waitForSelector("#task-panel", { state: "detached" });
    check("ribbons: sensitive goes with the save", callsOf("save")[0].task.sensitive === true && callsOf("save")[0].task.scope_id === 11);
    await page.click(".task:has-text('Review the incentive') .task-open"); await page.waitForSelector("#task-form");
    check("ribbons: a task carried from the Board says so and links back", /Weekly Board/.test(await page.textContent(".from-board")) && (await page.getAttribute(".from-board a", "href")) === "../board/");
    await page.click("#panel-close");
    await page.reload(); await loaded(page);
    check("ribbons: the ribbon is remembered for the session", (await page.getAttribute("#ribbon-switch [data-ribbon=backoffice]", "aria-pressed")) === "true");
    check("ribbons: no script errors", errors.length === 0, errors);
    await shot(page, "t03-backoffice-team");
    await ctx.close();
    // backoffice without the sensitive right
    const b = await setup(browser, { width: 1024, height: 768 }, { pass: "back" });
    await go(b.page, "#/team");
    check("ribbons: a Backoffice-only login sees no floor tasks, no switch, no sensitive task, no inbox", !(await b.page.$("#ribbon-switch")) && !(await b.page.$("#tab-inbox"))
      && JSON.stringify((await titles(b.page, "#cols")).sort()) === JSON.stringify(["Plan the gifting campaign", "Review the incentive scheme"]));
    await b.ctx.close();
  });

  await run("inbox", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await page.click("#ribbon-switch [data-ribbon=backoffice]");
    await page.click("#tab-inbox");
    await page.waitForSelector(".sug");
    check("inbox: the waiting suggestions are listed with where they came from", (await page.$$eval(".sug", (s) => s.length)) === 2 && /email · Incentive thread/.test(await page.textContent(".sug >> nth=0")) && /call · Weekly call/.test(await page.textContent(".sug >> nth=1")));
    check("inbox: one about a task already here says it adds a comment", (await page.textContent(".sug >> nth=0 >> .sug-target")) === "Adds a comment to: Review the incentive scheme" && (await page.textContent(".sug >> nth=0 >> .accept")) === "Add as a comment");
    await page.click(".sug >> nth=0 >> .accept");
    await page.waitForFunction(() => document.querySelectorAll(".sug").length === 1);
    check("inbox: accepted as a comment, and the count drops", (await toastText(page)) === "Added as a comment." && (await page.textContent("#tab-inbox .count")) === "1" && callsOf("inbox_decide")[0].scope_id === null);
    await page.selectOption(".sug select", "13");
    await page.click(".sug .accept");
    await page.waitForSelector("#inbox-empty");
    check("inbox: a new one becomes a task in the scope chosen", callsOf("inbox_decide")[1].scope_id === 13 && mock.tasks.some((t) => t.title === "Ask about a spring event" && t.scope_id === 13) && (await toastText(page)) === "Added as a task.");
    check("inbox: an empty inbox says so, and the tab loses its count", (await page.textContent("#inbox-empty")) === "The inbox is empty." && !(await page.$("#tab-inbox .count")));
    await go(page, "#/my");
    check("inbox: the new task is in my list", (await titles(page, "#screen-my")).includes("Ask about a spring event"));
    await page.click("#ribbon-switch [data-ribbon=floor]"); await go(page, "#/inbox");
    await page.waitForFunction(() => location.hash === "#/my" || !document.querySelector("#tab-inbox"));
    check("inbox: it belongs to Backoffice only", !(await page.$("#tab-inbox")));
    check("inbox: no script errors", errors.length === 0, errors);
    await ctx.close();
    const d = await setup(browser, { width: 1024, height: 768 }, { hash: "#/inbox" });
    await d.page.click("#ribbon-switch [data-ribbon=backoffice]"); await go(d.page, "#/inbox"); await d.page.waitForSelector(".sug");
    await d.page.click(".sug >> nth=1 >> .dismiss");
    await d.page.waitForFunction(() => document.querySelectorAll(".sug").length === 1);
    check("inbox: dismiss removes it without making a task", (await toastText(d.page)) === "Dismissed." && callsOf("inbox_decide")[0].accept === false && !mock.tasks.some((t) => t.title === "Ask about a spring event"));
    await d.ctx.close();
  });

  await run("russian", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "rep", lang: "ru" });
    check("ru: the screen, tabs and groups are in Russian", (await page.textContent("h1.title")) === "Мои задачи" && /Команда/.test(await page.textContent("#tab-team")) && /Просрочено/.test(await page.textContent("h2[data-group=overdue]")));
    const meta = await page.textContent("ul[data-group=overdue] .task-meta");
    check("ru: a row reads in Russian, with Russian plurals", /Высокий/.test(meta) && /1 из 2/.test(meta) && /1 комментарий/.test(meta), meta);
    await page.click("#new-task"); await page.waitForSelector("#task-form");
    check("ru: the form and its scopes are in Russian", JSON.stringify(await page.$$eval("#t-scope option", (os) => os.map((o) => o.textContent))) === JSON.stringify(["Операции", "CRM", "Бренды", "Сервис", "Продажи"])
      && (await page.textContent("#panel-save")) === "Добавить задачу");
    await page.click("#panel-save");
    check("ru: its refusals too", (await page.textContent("#panel-err")) === "Укажите название задачи.");
    await page.click("#panel-close");
    await page.click(".kit-lang button[lang=en]");
    check("ru: switching back to English redraws the screen", (await page.textContent("h1.title")) === "My tasks");
    check("russian: no script errors", errors.length === 0, errors);
    await ctx.close();
  });

  for (const [w, h, label] of [[390, 780, "phone 390"], [360, 720, "phone 360"], [820, 1180, "iPad portrait"], [1024, 768, "iPad landscape"]]) {
    await run("layout " + label, async () => {
      const phone = w < 600;
      const { ctx, page, errors } = await setup(browser, { width: w, height: h }, { touch: true });
      const small = (sel) => page.$$eval(sel, (xs) => xs.filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).map((x) => (x.textContent || x.id || x.className).trim().slice(0, 24)));
      const tiny = () => page.$$eval("#app *, #task-panel *", (ns) => ns.filter((n) => n.children.length === 0 && n.textContent.trim() && n.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(n).fontSize) < 11).map((n) => n.textContent.trim().slice(0, 20)));
      check(label + ": My tasks does not scroll sideways", await noHScroll(page));
      check(label + ": everything to tap on My tasks is 44 px", (await small("#app button, #app a.kit-tab, #app .task-open")).length === 0, await small("#app button, #app a.kit-tab, #app .task-open"));
      check(label + ": no text under 11 px", (await tiny()).length === 0, await tiny());
      if (phone) {
        check(label + ": the header is one slim row with a menu button", !!(await page.$("#menu-btn")) && !(await page.$(".kit-head .kit-lang")) && (await page.$eval(".kit-head", (n) => n.getBoundingClientRect().height)) <= 60);
        check(label + ": the ribbon switch sits under the tabs, across the width", await page.$eval("#ribbon-bar .ribbon-switch", (n) => n.getBoundingClientRect().width > window.innerWidth * 0.8));
        await page.click("#menu-btn");
        check(label + ": the menu holds the person, the tools, the language and the lock", !!(await page.$("#head-menu .kit-tool-wrap")) && !!(await page.$("#head-menu .kit-lang")) && /Tessa Boss/.test(await page.textContent("#head-menu")) && /Lock/.test(await page.textContent("#head-menu")));
        await page.click("#menu-btn");
      } else {
        check(label + ": the header keeps its controls in the bar", !(await page.$("#menu-btn")) && !!(await page.$(".kit-head .kit-lang")));
      }
      await go(page, "#/team");
      check(label + ": Team does not scroll sideways", await noHScroll(page));
      check(label + ": Team stacks the scopes as lists", await page.evaluate(() => { const c = [...document.querySelectorAll(".col")].map((x) => x.getBoundingClientRect()); return c.every((r, i) => i === 0 || r.top > c[i - 1].top); }));
      check(label + ": Team's filters and buttons are 44 px", (await small("#screen-team select, #screen-team input, #screen-team button")).length === 0, await small("#screen-team select, #screen-team input, #screen-team button"));
      await shot(page, "t10-team-" + w);
      await page.click(".task:has-text('Call back about the ring') .task-open"); await page.waitForSelector("#task-form");
      check(label + ": the task panel fits the screen", await page.$eval("#task-panel .panel", (n) => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && n.scrollWidth <= n.clientWidth + 1; }));
      check(label + ": everything to tap in the panel is 44 px", (await small("#task-panel button, #task-panel input:not([type=checkbox]), #task-panel select, #task-panel textarea, #task-panel .step-l")).length === 0,
        await small("#task-panel button, #task-panel input:not([type=checkbox]), #task-panel select, #task-panel textarea, #task-panel .step-l"));
      check(label + ": no text under 11 px in the panel", (await tiny()).length === 0, await tiny());
      await shot(page, "t11-panel-" + w);
      await page.click("#panel-close");
      await go(page, "#/my");
      await shot(page, "t12-my-" + w);
      check(label + ": no script errors", errors.length === 0, errors);
      await ctx.close();
    });
  }

  await run("session", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "rep" });
    await page.click("ul[data-group=overdue] .task-open"); await page.waitForSelector("#task-form");
    await page.evaluate(() => lockNow());            // the idle lock, or a lock from another tab: the panel is open at that moment
    await page.waitForSelector("#gate");
    check("lock: nothing of the tasks stays on screen or in memory", (await page.$eval("#app", (a) => a.children.length)) === 0 && !(await page.$("#task-panel")) && await page.evaluate(() => S.doc === null && S.panel === null && S.token === null));
    await login(page, "rep"); await loaded(page);
    mock.expire();
    await page.click("ul[data-group=today] .quick");
    await page.waitForSelector("#gate");
    check("session: an expired session returns to the passcode card with the reason", /expired/.test(await page.textContent(".gate-card .err")));
    check("session: no script errors", errors.length === 0, errors);
    await ctx.close();
    // a right taken away mid-session
    const r = await setup(browser, { width: 1024, height: 768 }, { pass: "fresh" });
    mock.revoke("fresh");
    await r.page.reload();
    await r.page.waitForSelector("#gate");
    check("session: a login that lost its ribbons is locked out with the reason", /does not have access/.test(await r.page.textContent(".gate-card .err")));
    mock.restore("fresh", true, false);
    await r.ctx.close();
    // …and the same when it happens between two taps, with a task open
    for (const act of ["quick", "comment", "save"]) {
      mock.reset();
      const q = await setup(browser, { width: 1024, height: 768 }, { pass: "rep", keep: true });
      if (act !== "quick") { await q.page.click("ul[data-group=overdue] .task-open"); await q.page.waitForSelector("#task-form"); }
      mock.revoke("rep");
      if (act === "quick") await q.page.click("ul[data-group=today] .quick");
      if (act === "comment") { await q.page.fill("#t-comment", "x"); await q.page.click("#t-comment-send"); }
      if (act === "save") { await q.page.fill("#t-notes", "x"); await q.page.click("#panel-save"); }
      await q.page.waitForSelector("#gate");
      check("session: access taken away mid-session locks the page on the next " + act + ", with nothing left behind",
        /does not have access/.test(await q.page.textContent(".gate-card .err")) && (await q.page.$eval("#app", (a) => a.children.length)) === 0 && !(await q.page.$("#task-panel")) && await q.page.evaluate(() => S.doc === null && S.panel === null));
      mock.restore("rep", true, false);
      await q.ctx.close();
    }
    // a failed load can be tried again
    mock.reset();
    const f = await setup(browser, { width: 1024, height: 768 }, { login: false });
    mock.failNext = "snapshot";
    await login(f.page, "rep");
    await f.page.waitForSelector("#doc-err");
    check("load: a failed load says so and offers Try again", /Something went wrong/.test(await f.page.textContent("#doc-err")));
    await f.page.click("#doc-err .btn"); await loaded(f.page);
    check("load: trying again loads the tasks", (await titles(f.page, "#screen-my")).length === 6);
    await f.ctx.close();
  });

  await run("season", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { query: "", now: "2031-12-10T08:00:00Z" });
    check("season: in December the tracker wears the band and a mark", await page.evaluate(() => document.documentElement.classList.contains("season-christmas")) && !!(await page.$(".season-mark")));
    check("season: the mark does not cover the New task button", await page.evaluate(() => { const m = document.querySelector(".season-mark").getBoundingClientRect(), b = document.querySelector("#new-task").getBoundingClientRect(); return m.right <= b.left || m.left >= b.right || m.bottom <= b.top || m.top >= b.bottom; }));
    check("season: no script errors", errors.length === 0, errors);
    await shot(page, "t20-season");
    await ctx.close();
    const off = await setup(browser, { width: 1024, height: 768 }, { query: "", now: "2031-06-10T08:00:00Z" });
    check("season: out of season there is none", !(await off.page.$(".season-mark")) && !(await off.page.evaluate(() => document.documentElement.classList.contains("season-christmas"))));
    await off.ctx.close();
  });

  await browser.close();
  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
