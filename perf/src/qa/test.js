// Checks for the Performance page against qa/mock.js, a stand-in for perf-api.
// Run from perf/src after a build:  python3 build.py && node qa/test.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");

const HTML_FILE = path.join(__dirname, "..", "..", "index.html");
const PAGE_URL = "https://alexdelardi.github.io/delardi-board/perf/";
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/perf-api";
const SHOTS = process.env.SHOTS || "";

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  results.push((ok ? "PASS " : "FAIL ") + name + (detail !== undefined && !ok ? "  → " + detail : ""));
}
const norm = (s) => String(s || "").replace(/[\s  ]+/g, " ").trim();

async function setup(browser, viewport, opts = {}) {
  mock.reset();
  const ctx = await browser.newContext({ viewport, locale: "en-GB", acceptDownloads: false });
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
  // The seasonal decoration follows the calendar. Every test runs with it switched off by the address, so the suite
  // reads the same all year; the season's own tests set the browser's date (opts.now) and leave the address alone.
  if (opts.now) await page.clock.setFixedTime(new Date(opts.now));
  await page.goto(PAGE_URL + (opts.query === undefined ? "?season=off" : opts.query) + (opts.hash || ""));
  if (opts.login !== false) { await login(page, opts.pass || "demo"); await loaded(page); }
  return { ctx, page, errors, foreign };
}
async function login(page, pass = "demo") {
  await page.waitForSelector("#gate-pass");
  await page.fill("#gate-pass", pass);
  await page.click(".gate-card button[type=submit]");
  if (pass === "demo") await page.waitForSelector("#gate", { state: "detached" });
}
const loaded = (page) => page.waitForFunction(() => typeof S !== "undefined" && S.doc && !S.busy && document.querySelector("main .screen"));
// nothing scrolls sideways: neither the page nor a table inside its own box
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll(".table-wrap")].every((w) => w.scrollWidth <= w.clientWidth + 1));
const cells = (page, sel) => page.$$eval(sel, (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, " ").trim())));
const callsOf = (a) => mock.calls.filter((c) => c.action === a);
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
    check("page: translate=no and the notranslate meta", await page.evaluate(() => document.documentElement.getAttribute("translate") === "no" && !!document.querySelector('meta[name="google"][content="notranslate"]')));
    check("gate: nothing behind the card and no data asked for", await page.evaluate(() => document.querySelector("#app").children.length === 0) && mock.calls.length === 0);
    check("gate: says what it opens", norm(await page.textContent(".gate-card")).includes("Opens Performance"));
    await login(page, "wrong");
    await page.waitForFunction(() => !document.querySelector(".gate-card .err").hidden);
    check("gate: a wrong passcode is refused", (await page.textContent(".gate-card .err")).trim() === "That passcode is not right.");
    await login(page, "floor");
    await page.waitForFunction(() => /does not have access/.test(document.querySelector(".gate-card .err").textContent));
    check("gate: someone without the right is refused, and nothing is drawn", await page.evaluate(() => document.querySelector("#app").children.length === 0));
    await login(page, "demo");
    await loaded(page);
    check("gate: opens on the last month with tickets", (await page.textContent("#screen-month .title")).trim() === "October 2031" && callsOf("month").pop().month === "2031-10");
    check("gate: asks span then the month, nothing else", mock.calls.filter((c) => !["unlock"].includes(c.action)).map((c) => c.action).join() === "span,month");
    check("header: tool name, tabs, picker, who is in", norm(await page.textContent(".kit-head")).includes("Performance") && (await page.$$eval(".kit-tab", (ns) => ns.map((n) => n.textContent.trim()))).join("|") === "Month|Year|Brands|Incentive|Inputs"
      && norm(await page.textContent(".kit-staff")) === "Demo Director" && !!(await page.$("#month-select")));
    check("gate: no foreign request, no script errors", foreign.length === 0 && errors.length === 0, foreign.concat(errors).join(" | "));
    await ctx.close();
  });

  await run("month screen", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    const hl = async (id) => norm(await page.textContent(id));
    check("headline: net sales in so'm and USD with the ticket count", (await hl("#hl-net")) === "Net sales210 000 000 so'm$17 5004 tickets", await hl("#hl-net"));
    check("headline: against plan: attainment, plan and gap", (await hl("#hl-plan")) === "Against plan105%plan 200 000 000 so'mgap +10 000 000 so'm", await hl("#hl-plan"));
    check("headline: against last year", (await hl("#hl-ly")) === "Against last year+10.5%last year 190 000 000 so'm$15 833", await hl("#hl-ly"));
    const kpi = await cells(page, "#kpi tbody tr");
    const rowOf = (k) => kpi.find((r) => r[0] === k);
    check("kpi: 16 rows, five columns", kpi.length === 16 && kpi.every((r) => r.length === 6) && (await cells(page, "#kpi thead tr"))[0].join("|") === "|This month|Last year|Change|Year to date|Last year to date");
    check("kpi: net sales row", rowOf("Net sales").join("|") === "Net sales|210 000 000|190 000 000|+10.5%|230 000 000|200 000 000", rowOf("Net sales").join("|"));
    check("kpi: tickets, UPT, average ticket", rowOf("Tickets").slice(1, 4).join("|") === "4|2|+100.0%" && rowOf("Units per ticket (UPT)")[1] === "1.00" && rowOf("Average ticket (NSPT)")[1] === "52 500 000");
    check("kpi: discount and multi-item are percentages with no change column", rowOf("Discount").slice(1, 4).join("|") === "2.3%|0.0%|—" && rowOf("Tickets with 2+ items")[1] === "25.0%", rowOf("Discount").join("|"));
    check("kpi: large tickets and the base book", rowOf("Large tickets")[1] === "1" && rowOf("Large tickets, value")[1] === "130 000 000" && rowOf("Base book, tickets")[1] === "3" && rowOf("Base book, average")[1] === "26 666 667");
    check("kpi: visits and conversion for this month only", rowOf("Visits").slice(1).join("|") === "16|—|—|—|—" && rowOf("Conversion").slice(1).join("|") === "25.0%|—|—|—|—", rowOf("Conversion").join("|"));
    check("kpi: the large-ticket line and appointments are explained", /120 000 000 so'm or more \(USD 10,000 at 12 000\)/.test(norm(await page.textContent("#screen-month"))) && /by appointment 4/.test(norm(await page.textContent("#screen-month"))));
    const life = await cells(page, "#life tbody tr");
    check("clients: four lifecycle rows with tickets, value and share", life.map((r) => r.join("|")).join(" / ") === "New|1|24 000 000|11.4% / Returning|1|130 000 000|61.9% / Recaptured|1|50 000 000|23.8% / No record|1|16 000 000|7.6%", life.map((r) => r.join("|")).join(" / "));
    // trend: 13 bars, the current one marked, plan tick, a table of the same figures, a tooltip on hover and on focus
    check("trend: 13 bars, the last is this month, one plan tick", await page.evaluate(() => { const b = [...document.querySelectorAll("#trend-chart g.bar")];
      return b.length === 13 && b[12].classList.contains("cur") && b[12].dataset.month === "2031-10" && document.querySelectorAll("#trend-chart line.plan").length === 1 && b.filter((g) => g.querySelector(".mark")).length === 3; }));
    check("trend: the chart has a name and the plan key", (await page.getAttribute("#trend-chart svg", "aria-label")) === "Net sales by month, so'm" && /plan/.test(await page.textContent("#trend-chart .plan-key")));
    const tr0 = (await cells(page, "#trend tbody tr"))[0];
    check("trend: the table lists the same months, newest first", (await page.$$("#trend tbody tr")).length === 13 && tr0.join("|") === "Oct 2031|210 000 000|200 000 000|4|52 500 000|1.00|2.3%|25%", tr0.join("|"));
    await page.hover('#trend-chart g.bar[data-month="2031-10"]');
    check("trend: hovering a bar shows its month, sales, plan and tickets", norm(await page.textContent(".chart-tip")) === "October 2031Net sales: 210 000 000 so'mPlan: 200 000 000 so'mTickets: 4", norm(await page.textContent(".chart-tip")));
    await page.mouse.move(5, 5);
    check("trend: the tooltip goes when the pointer leaves", !(await page.$(".chart-tip")));
    await page.focus('#trend-chart g.bar[data-month="2030-10"]');
    check("trend: the keyboard reaches a bar too", /October 2030/.test(await page.textContent(".chart-tip")));
    await page.evaluate(() => document.activeElement.blur());
    // bridge
    const br = async (id) => (await cells(page, id + " .br-row")).map((r) => r[0] + ":" + r[2]).join("|");
    check("bridge from last year: three parts between the two totals", (await br("#bridge-ly")) === "Last year:190 000 000|More or fewer tickets:+190 000 000|Share of large tickets:−110 000 000|Ticket size:−60 000 000|Actual:210 000 000", await br("#bridge-ly"));
    check("bridge from plan", (await br("#bridge-plan")) === "Plan:200 000 000|More or fewer tickets:−40 000 000|Share of large tickets:+15 000 000|Ticket size:+35 000 000|Actual:210 000 000", await br("#bridge-plan"));
    check("bridge: a part that takes away is drawn to the left and outlined, one that adds to the right and filled", await page.evaluate(() => {
      const f = [...document.querySelectorAll("#bridge-ly .br-fill")]; return f.length === 3 && f[0].classList.contains("pos") && f[1].classList.contains("neg") && f[1].style.right === "50%" && f[0].style.left === "50%"; }));
    // left out and tickets
    check("left out: founder and staff with their amounts", (await cells(page, "#excluded tbody tr")).map((r) => r.join("|")).join(" / ") === "Founder|1|5 000 000 / Staff|1|8 000 000");
    const tk = await cells(page, "#tickets tbody tr");
    check("tickets: all seven, with seller, basis and lifecycle", tk.length === 7 && tk[0].slice(0, 7).join("|") === "2 Oct 2031|PF-A1|Zztest One|Zz Bee|Retail|Recaptured|50 000 000" && tk[3][4] === "Founder" && tk[3][5] === "—", tk[0].join("|"));
    check("tickets: the large one and the refund are tagged", /large/.test(tk[1][1]) && /refund/.test(tk[6][1]) && tk[6][6] === "-10 000 000", tk[1][1] + " / " + tk[6].join("|"));
    check("tickets: a ticket without a client shows a dash", tk[5][2] === "—" && tk[5][5] === "No record");
    check("month 1024: no sideways scroll", await noHScroll(page));
    await shot(page, "p01-month", true);
    check("month: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("month picker and empty month", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    check("picker: 13 months, newest first, next is off on the last month", (await page.$$("#month-select option")).length === 13 && (await page.$eval("#month-select option", (o) => o.textContent)) === "October 2031"
      && await page.$eval("#month-next", (b) => b.disabled) && !(await page.$eval("#month-prev", (b) => b.disabled)));
    await page.click("#month-prev");
    await page.waitForFunction(() => S.month === "2031-09" && S.doc && !S.busy);
    check("picker: previous month is asked and drawn", (await page.textContent("#screen-month .title")).trim() === "September 2031" && callsOf("month").pop().month === "2031-09");
    const t = norm(await page.textContent("#screen-month"));
    check("empty month: dashes, no plan, nothing left out, no tickets", /No plan typed in for this month\./.test(t) && /No sales in the same month last year\./.test(t) && /Nothing was left out this month\./.test(t) && /No tickets this month\./.test(t)
      && norm(await page.textContent("#hl-net")).startsWith("Net sales0 so'm"));
    check("empty month: the plan card links to Inputs", (await page.getAttribute("#hl-plan a", "href")) === "#/inputs");
    check("empty month: the bridge blocks say why they are empty", /No sales in the same month last year/.test(await page.textContent("#bridge-ly")) && /No plan typed in/.test(await page.textContent("#bridge-plan")));
    await page.click("#tab-incentive");
    await page.waitForSelector("#inc-none");
    check("empty month: no scheme on file", (await page.textContent("#inc-none")).trim() === "No incentive scheme is on file for this month.");
    // a reload keeps the month; the select jumps
    await page.reload();
    await loaded(page);
    check("picker: a reload stays on the month", await page.evaluate(() => S.month === "2031-09"));
    await page.selectOption("#month-select", "2030-10");
    await page.waitForFunction(() => S.month === "2030-10" && S.doc && !S.busy);
    check("picker: previous is off on the first month", await page.$eval("#month-prev", (b) => b.disabled));
    // a slow answer for a month that is no longer on screen is dropped
    mock.delay.month = 400;
    await page.selectOption("#month-select", "2031-08");
    delete mock.delay.month;
    await page.selectOption("#month-select", "2031-10");
    await page.waitForFunction(() => S.month === "2031-10" && S.doc && !S.busy);
    await page.waitForTimeout(600);
    check("picker: a late answer for another month is not drawn", await page.evaluate(() => S.doc.month === "2031-10-01" && document.querySelector("#screen-incentive .title").textContent.includes("October 2031")));
    // a failed load can be retried
    mock.failNext = "month";
    await page.click("#month-prev");
    await page.waitForSelector("#month-err");
    check("load failed: the reason and Try again", /Something went wrong on the server/.test(await page.textContent("#month-err")));
    await page.click("#month-err button");
    await page.waitForFunction(() => S.doc && !S.busy && !document.querySelector("#month-err"));
    check("load failed: Try again loads the month", await page.evaluate(() => S.doc.month === "2031-09-01"));
    check("picker: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("correct a ticket", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await page.click('#tickets tr[data-id="10000000-0000-4000-8000-000000000006"] .tk-correct');
    await page.waitForSelector("#tk-form");
    check("correct: the form names the ticket and starts on As the rules say", /PF-A6/.test(await page.textContent("#tk-dialog-title")) && (await page.$eval("#tk-basis", (s) => s.value)) === ""
      && (await page.$$eval("#tk-basis option", (ns) => ns.map((n) => n.textContent.trim()))).join("|") === "As the rules say|Retail|Founder|Trade|Staff|Cost-price transfer|Other");
    await page.selectOption("#tk-basis", "trade");
    await page.fill("#tk-note", "wholesale");
    await page.click("#tk-save");
    await page.waitForFunction(() => !document.querySelector("#tk-dialog") && S.doc.cur.net === 194000000);
    const c = callsOf("mark_ticket").pop();
    check("correct: sends the month, the ticket and the mark", c.month === "2031-10" && c.ticket_id.endsWith("06") && JSON.stringify(c.mark) === '{"basis":"trade","seller":null,"client_id":null,"note":"wholesale"}', JSON.stringify(c));
    check("correct: the month is redrawn from the answer, no second request", norm(await page.textContent("#hl-net")).startsWith("Net sales194 000 000 so'm") && callsOf("month").length === 1
      && (await cells(page, "#excluded tbody tr")).map((r) => r[0]).join() === "Founder,Staff,Trade");
    check("correct: the ticket shows Trade and the hand mark", await page.evaluate(() => { const r = document.querySelector('#tickets tr[data-id$="06"]');
      return r.classList.contains("off") && r.cells[4].textContent.includes("Trade") && !!r.querySelector(".mark-note"); }));
    // the form opens with the correction; a seller is added without losing the basis
    await page.click('#tickets tr[data-id$="06"] .tk-correct');
    await page.waitForSelector("#tk-form");
    check("correct: opens with what was corrected", (await page.$eval("#tk-basis", (s) => s.value)) === "trade" && (await page.$eval("#tk-note", (s) => s.value)) === "wholesale");
    await page.selectOption("#tk-basis", "retail");
    await page.fill("#tk-seller", "Zz Bee");
    await page.fill("#tk-client", "nope");
    await page.click("#tk-save");
    await page.waitForFunction(() => !document.querySelector("#tk-err").hidden);
    check("correct: a refusal is shown in the form and nothing changes", (await page.textContent("#tk-err")).trim() === "No client with that reference." && !!(await page.$("#tk-dialog")) && !(await page.$eval("#tk-save", (b) => b.disabled)));
    await page.fill("#tk-client", "dld-9104");
    await page.click("#tk-save");
    await page.waitForFunction(() => !document.querySelector("#tk-dialog"));
    check("correct: seller and client corrected", await page.evaluate(() => { const r = document.querySelector('#tickets tr[data-id$="06"]'); return r.cells[3].textContent === "Zz Bee" && S.doc.cur.net === 210000000; }));
    // taking it back
    await page.click('#tickets tr[data-id$="06"] .tk-correct');
    await page.waitForSelector("#tk-form");
    await page.selectOption("#tk-basis", "");
    await page.fill("#tk-seller", ""); await page.fill("#tk-client", ""); await page.fill("#tk-note", "");
    await page.click("#tk-save");
    await page.waitForFunction(() => !document.querySelector("#tk-dialog"));
    check("correct: all empty takes the correction back", Object.keys(mock.marks).length === 0 && await page.evaluate(() => !document.querySelector(".mark-note")));
    // Escape and Cancel close without a request
    const n = callsOf("mark_ticket").length;
    await page.click('#tickets tr[data-id$="01"] .tk-correct');
    await page.waitForSelector("#tk-form");
    await page.click("#tk-cancel");
    check("correct: Cancel closes and sends nothing", !(await page.$("#tk-dialog")) && callsOf("mark_ticket").length === n);
    check("correct: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("incentive", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { hash: "#/incentive" });
    check("incentive: opens straight from the address, no second month request", !!(await page.$("#screen-incentive")) && callsOf("month").length === 1);
    check("incentive: the scheme and the warning that it is an estimate", /Scheme: Zz scheme, in force from October 2031\./.test(norm(await page.textContent("#inc-scheme"))) && /An estimate from the tickets/.test(await page.textContent("#inc-scheme")));
    check("incentive: the store line", norm(await page.textContent("#inc-store")) === "Store210 000 000 so'mPlan200 000 000 so'mAttainment105%Guardrail factor×1.00", norm(await page.textContent("#inc-store")));
    const rows = await cells(page, "#inc-sellers tbody tr");
    check("incentive: first seller: sales, plan, attainment, rate, commission, programmes, total, paid, difference",
      rows[0].join("|") === "Zz Ann|160 000 000|150 000 000|107%|0.80%|1 280 000|200 000|1 480 000|1 400 000|−80 000", rows[0].join("|"));
    check("incentive: a seller without commission says so", rows[1].join("|") === "Zz Bee|50 000 000|50 000 000|100%|no commission|0|1 000 000|1 000 000|—|—", rows[1].join("|"));
    check("incentive: the total line", (await cells(page, "#inc-total"))[0].join("|") === "All sellers|210 000 000||||1 280 000|1 200 000|2 480 000|1 400 000|−1 080 000", (await cells(page, "#inc-total"))[0].join("|"));
    check("incentive: cost and the cap are stated", /Cost of the scheme: 1\.18% of retail sales\./.test(norm(await page.textContent("#screen-incentive"))) && /capped at 1 000 000 so'm per person/.test(norm(await page.textContent("#screen-incentive"))));
    const prog = await cells(page, '.inc-prog[data-seller="Zz Bee"] tbody tr');
    check("incentive: programme lines with the count from tickets, the cap and the amount", prog.map((r) => r.join("|")).join(" / ")
      === "Two-piece ticket|1|1|1|250 000|250 000 / Watch focus|1|1|2|600 000|600 000 / Client recaptured|1|1|1|400 000|400 000 / New client|0|0|1|200 000|0", prog.map((r) => r.join("|")).join(" / "));
    check("incentive: the capped total shows the uncapped sum beside it", norm(await page.textContent('.inc-prog[data-seller="Zz Bee"] tfoot')) === "Total1 000 000 (1 250 000)");
    check("incentive 1024: no sideways scroll", await noHScroll(page));
    await shot(page, "p02-incentive", true);
    check("incentive: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("inputs", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { hash: "#/inputs" });
    const val = (sel) => page.$eval(sel, (n) => n.value);
    await page.waitForSelector("#in-plan");
    check("inputs: opens on the month after the last month with sales, with its own picker", (await page.textContent("#screen-inputs .title")).trim() === "Inputs for November 2031"
      && (await page.$eval("#in-month-select", (n2) => n2.value)) === "2031-11" && await page.$eval("#in-month-next", (b) => b.disabled) && !(await page.$("#month-select")) && !(await page.$("#cur-switch"))
      && (await val("#in-plan")) === "" && callsOf("month").map((c) => c.month).sort().join() === "2031-10,2031-11");
    check("inputs: the month ahead already offers the scheme's programmes", (await page.$$("#in-sellers thead th")).length >= 4);
    await page.click("#in-month-prev");
    await page.waitForFunction(() => S.inMonth === "2031-10" && S.inDoc && S.inDoc.doc && document.querySelector("#in-plan") && document.querySelector("#in-plan").value !== "");
    const loads = () => callsOf("month").length, loads0 = loads();
    check("inputs: the form opens with what is on file", (await val("#in-plan")) === "200000000" && (await val("#in-plan-tickets")) === "5" && (await val("#in-visits")) === "16" && (await val("#in-fx")) === ""
      && (await val("#in-note")) === "first plan" && /Last saved by Demo Director/.test(await page.textContent("#inputs-saved")));
    check("inputs: a row per seller with plan, commission, programme counts and paid", (await page.$$("#in-sellers tbody tr")).length === 2
      && (await page.$$eval("#in-sellers .in-seller", (ns) => ns.map((n) => n.value))).join() === "Zz Ann,Zz Bee" && (await page.$$eval("#in-sellers .in-s-comm", (ns) => ns.map((n) => n.checked))).join() === "true,false"
      && (await page.$$("#in-sellers tbody tr:first-child .in-s-count")).length === 4 && (await page.$eval("#in-sellers tbody tr:first-child .in-s-paid", (n) => n.value)) === "1400000");
    // a bad figure is marked and nothing is sent
    await page.fill("#in-plan", "abc");
    await page.click("#in-save");
    check("inputs: letters in a figure are marked and nothing is sent", (await page.getAttribute("#in-plan", "aria-invalid")) === "true" && callsOf("save_month").length === 0 && (await page.textContent("#in-err")).trim() === "Check the figures marked.");
    // a save: grouped digits are read, an override is sent as a number, an empty one is left out
    await page.fill("#in-plan", "250 000 000");
    await page.fill("#in-fx", "12 500,5");
    await page.fill('#in-sellers tbody tr:nth-child(2) .in-s-count[data-key="focus"]', "0");
    await page.click("#in-add");
    check("inputs: Add a seller gives an empty row with the keyboard in it", (await page.$$("#in-sellers tbody tr")).length === 3 && await page.evaluate(() => document.activeElement.classList.contains("in-seller")));
    await page.keyboard.type("Zz Cee");
    await page.fill("#in-sellers tbody tr:nth-child(3) .in-s-plan", "30.000.000");
    await page.click("#in-save");
    await page.waitForFunction(() => S.doc.inputs.plan_uzs === 250000000 && !S.busy && document.querySelector("#in-save") && !document.querySelector("#in-save").disabled);
    const c = callsOf("save_month").pop();
    check("inputs: the whole month is sent", c.month === "2031-10" && c.inputs.plan_uzs === 250000000 && c.inputs.plan_tickets === 5 && c.inputs.fx === 12500.5 && c.inputs.note === "first plan"
      && c.inputs.sellers.length === 3 && JSON.stringify(c.inputs.sellers[1]) === '{"seller":"Zz Bee","plan_uzs":50000000,"commission":false,"programme_counts":{"focus":0},"paid_uzs":null}'
      && c.inputs.sellers[2].plan_uzs === 30000000, JSON.stringify(c.inputs));
    check("inputs: saved, and the form is rebuilt from the answer", (await val("#in-plan")) === "250000000" && (await val("#in-fx")) === "12500.5"
      && (await page.$eval('#in-sellers tbody tr:nth-child(2) .in-s-count[data-key="focus"]', (n) => n.value)) === "0" && loads() === loads0);
    // the other screens follow without another request
    await page.click("#tab-month");
    await page.waitForSelector("#hl-plan");
    check("inputs: the month screen shows the new plan", norm(await page.textContent("#hl-plan")).includes("plan 250 000 000 so'm") && loads() === loads0);
    await page.click("#tab-incentive");
    await page.waitForSelector("#inc-sellers");
    check("inputs: the typed count is marked on the incentive screen", /0 \(typed in\)/.test(norm(await page.textContent('.inc-prog[data-seller="Zz Bee"] tr[data-key="focus"]'))));
    // a refusal from the server stays on the form with what was typed
    await page.click("#tab-inputs");
    await page.waitForSelector("#in-plan-large");
    await page.fill("#in-plan-large", "9");
    await page.click("#in-save");
    await page.waitForFunction(() => !document.querySelector("#in-err").hidden && !document.querySelector("#in-save").disabled);
    check("inputs: a refusal is shown and the typed value is kept", (await page.textContent("#in-err")).trim() === "Planned large tickets cannot be more than planned tickets." && (await val("#in-plan-large")) === "9");
    // typed values survive a language switch; removing a seller
    await page.click('.kit-lang button[lang="ru"]');
    await page.waitForFunction(() => /Вводные за/.test(document.querySelector("#screen-inputs .title").textContent));
    check("inputs RU: what was typed is still there, labels in Russian", (await val("#in-plan-large")) === "9" && /План, сум/.test(await page.textContent("#screen-inputs")) && /Фокус на часы/.test(await page.textContent("#in-sellers thead")));
    await page.fill("#in-plan-large", "1");
    await page.click("#in-sellers tbody tr:nth-child(3) .in-s-remove");
    await page.click("#in-save");
    await page.waitForFunction(() => S.doc.inputs.sellers.length === 2 && !S.busy);
    check("inputs: a removed seller is not sent", callsOf("save_month").pop().inputs.sellers.map((s) => s.seller).join() === "Zz Ann,Zz Bee");
    check("inputs 1024: no sideways scroll", await noHScroll(page));
    await shot(page, "p03-inputs-ru", true);
    check("inputs: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("russian, portrait, lock", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 });
    await page.click('.kit-lang button[lang="ru"]');
    await page.waitForFunction(() => /Октябрь 2031/.test(document.querySelector("#screen-month .title").textContent));
    const t = norm(await page.textContent("#screen-month"));
    check("RU: the month screen is in Russian", /Чистые продажи/.test(t) && /К плану/.test(t) && /4 чека/.test(t) && /Разбор отклонения/.test(t) && /Не входит в розничную базу/.test(t) && /Учредитель/.test(t) && /Возвращённые/.test(t), t.slice(0, 200));
    check("RU: percentages use a comma", /\+10,5%/.test(await page.textContent("#hl-ly")));
    check("RU: tabs and picker", (await page.$$eval(".kit-tab", (ns) => ns.map((n) => n.textContent.trim()))).join("|") === "Месяц|Год|Бренды|Мотивация|Вводные" && (await page.$eval("#month-select option", (o) => o.textContent)) === "Октябрь 2031");
    check("RU 768 month: no sideways scroll", await noHScroll(page));
    // long real names and the longest Russian labels together must still fit
    await page.evaluate(() => { S.doc.tickets.forEach((x, i) => { x.client = ["Абдусаттаров Рустамбек", "Сайфутдинова Амина", "Мирджалалов Шахзод"][i % 3]; x.seller = "Sayfutdinova"; if (i % 2) { x.basis = "founder"; } }); renderAll(); });
    check("RU 768 month: long client names wrap instead of pushing the table wide", await noHScroll(page));
    check("portrait: every control is a 44 px target", await page.evaluate(() => [...document.querySelectorAll(".month-picker .btn, #month-select, .kit-tab, .kit-hbtn")].every((n) => n.getBoundingClientRect().height >= 44)));
    await shot(page, "p04-month-ru-portrait", true);
    await page.click("#tab-incentive");
    await page.waitForSelector("#inc-sellers");
    check("RU 768 incentive: Russian programme names, no sideways scroll", /Фокус на часы/.test(await page.textContent("#screen-incentive")) && (await noHScroll(page)));
    await page.click("#tab-inputs");
    await page.waitForSelector("#in-plan");
    check("RU 768 inputs: no sideways scroll", await noHScroll(page));
    // lock: nothing left behind, on screen or in memory; a lost session locks too
    await page.click("#tab-month");
    await page.waitForSelector("#tickets");
    await page.hover('#trend-chart g.bar[data-month="2031-10"]');
    await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());
    await page.waitForSelector("#gate-pass");
    check("lock: nothing behind the card, no tooltip, nothing in memory", await page.evaluate(() => document.querySelector("#app").children.length === 0 && !document.querySelector(".chart-tip") && S.doc === null && S.span === null && S.form === null));
    await login(page, "demo");
    await loaded(page);
    check("lock: unlocking comes back to the same month", await page.evaluate(() => S.month === "2031-10" && !!document.querySelector("#hl-net")));
    mock.expire();
    await page.click("#month-prev");
    await page.waitForSelector("#gate-pass");
    check("lost session: the page locks and says why", /Сеанс истёк/.test(await page.textContent(".gate-card .err")) && await page.evaluate(() => document.querySelector("#app").children.length === 0));
    check("RU and lock: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("currency", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    const pressed = () => page.$$eval("#cur-switch button", (bs) => bs.map((b) => b.textContent.trim() + ":" + b.getAttribute("aria-pressed")).join("|"));
    check("currency: the switch starts on so'm", (await pressed()) === "UZS:true|USD:false", await pressed());
    await page.click('#cur-switch button[data-cur="usd"]');
    await page.waitForFunction(() => /\$17 500/.test(document.querySelector("#hl-net").textContent));
    check("currency: USD pressed", (await pressed()) === "UZS:false|USD:true");
    check("currency: headline in dollars at 12 000, so'm underneath", norm(await page.textContent("#hl-net")) === "Net sales$17 500210 000 000 so'm4 tickets", norm(await page.textContent("#hl-net")));
    check("currency: plan and gap in dollars", norm(await page.textContent("#hl-plan")) === "Against plan105%plan $16 667gap +833 USD", norm(await page.textContent("#hl-plan")));
    const kpi = await cells(page, "#kpi tbody tr"); const rowOf = (k) => kpi.find((r) => r[0] === k);
    check("currency: money rows are converted, counts and ratios are not", rowOf("Net sales")[1] === "17 500" && rowOf("Average ticket (NSPT)")[1] === "4 375" && rowOf("Large tickets, value")[1] === "10 833"
      && rowOf("Tickets")[1] === "4" && rowOf("Units per ticket (UPT)")[1] === "1.00" && rowOf("Visits")[1] === "16" && rowOf("Net sales")[3] === "+10.5%", JSON.stringify([rowOf("Net sales"), rowOf("Tickets")]));
    check("currency: lifecycle, trend and ticket amounts in dollars", (await cells(page, "#life tbody tr"))[0].join("|") === "New|1|2 000|11.4%"
      && (await cells(page, "#trend tbody tr"))[0].slice(0, 5).join("|") === "Oct 2031|17 500|16 667|4|4 375" && (await cells(page, "#tickets tbody tr"))[0][6] === "4 167");
    const br = (await cells(page, "#bridge-ly .br-row")).map((r) => r[2]);
    const n = (s) => Number(s.replace(/\s/g, "").replace("−", "-").replace("+", ""));
    check("currency: the bridge still adds up exactly in dollars", br[0] === "15 833" && br[4] === "17 500" && n(br[0]) + n(br[1]) + n(br[2]) + n(br[3]) === n(br[4]), br.join("|"));
    check("currency: the chart says its unit", /Net sales by month, USD/.test(await page.textContent("#trend-chart")) && (await page.getAttribute("#trend-chart svg", "aria-label")) === "Net sales by month, USD");
    await page.hover('#trend-chart g.bar[data-month="2031-10"]');
    check("currency: the tooltip is in dollars", /Net sales: \$17 500/.test(await page.textContent(".chart-tip")), await page.textContent(".chart-tip"));
    await page.mouse.move(5, 5);
    await page.click("#tab-incentive"); await page.waitForSelector("#inc-sellers");
    check("currency: incentive in dollars", (await cells(page, "#inc-sellers tbody tr"))[0].join("|") === "Zz Ann|13 333|12 500|107%|0.80%|107|17|123|117|−7", (await cells(page, "#inc-sellers tbody tr"))[0].join("|"));
    check("currency: programme counts stay counts, pay is converted", (await cells(page, '.inc-prog[data-seller="Zz Bee"] tbody tr'))[1].join("|") === "Watch focus|1|1|2|50|50", (await cells(page, '.inc-prog[data-seller="Zz Bee"] tbody tr'))[1].join("|"));
    await page.click("#tab-inputs"); await page.waitForSelector("#in-plan");
    check("currency: inputs stay in so'm, say so, and carry no currency switch", /Inputs are always typed in so'm/.test(await page.textContent("#screen-inputs")) && !(await page.$("#cur-switch")));
    await page.click("#tab-year"); await page.waitForSelector("#yr-net");
    check("currency: the year in dollars", norm(await page.textContent("#yr-net")).startsWith("Net sales, year to date$19 167") && (await cells(page, "#yr-months tbody tr"))[9][1] === "17 500", norm(await page.textContent("#yr-net")));
    await page.click("#tab-brands"); await page.waitForSelector("#br-table");
    check("currency: brands in dollars, arrival values stay in USD as loaded", (await cells(page, "#br-table tbody tr"))[0].slice(0, 2).join("|") === "Zz Other|12 500" && (await cells(page, "#arr-table tbody tr"))[0][2] === "120 000");
    await page.reload(); await loaded(page);
    check("currency: the choice survives a reload", (await pressed()) === "UZS:false|USD:true");
    await page.click('.kit-lang button[lang="ru"]'); await page.click("#tab-month"); await page.waitForSelector("#hl-net");
    await page.click('#cur-switch button[data-cur="uzs"]');
    await page.waitForFunction(() => /210 000 000 сум/.test(document.querySelector("#hl-net").textContent));
    check("currency: back to so'm, dollars underneath", norm(await page.textContent("#hl-net")).startsWith("Чистые продажи210 000 000 сум$17 500") && (await noHScroll(page)), norm(await page.textContent("#hl-net")));
    check("currency: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("year", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { hash: "#/year" });
    await page.waitForSelector("#yr-net");
    check("year: opens on the latest year with its own picker", (await page.textContent("#screen-year .title")).trim() === "2031" && (await page.$$eval("#year-select option", (o) => o.map((x) => x.value))).join() === "2031,2030"
      && await page.$eval("#year-next", (b) => b.disabled) && !(await page.$("#month-select")) && callsOf("year").map((c) => c.year).join() === "2031");
    check("year: says which months are compared", (await page.textContent("#year-period")).trim() === "Year to date, January to October 2031");
    const hl = async (id) => norm(await page.textContent(id));
    check("year: net sales to date", (await hl("#yr-net")) === "Net sales, year to date230 000 000 so'm$19 1675 tickets", await hl("#yr-net"));
    check("year: against plan counts only the months that have a plan", (await hl("#yr-plan")) === "Against plan, planned months105%plan to date 200 000 000 so'msales of those months 210 000 000 so'm", await hl("#yr-plan"));
    check("year: against the same months last year", (await hl("#yr-ly")) === "Against the same months last year+21.1%same months last year 190 000 000 so'mlast year in full 190 000 000 so'm", await hl("#yr-ly"));
    check("year: four charts, twelve points each", await page.evaluate(() => ["yr-chart-net", "yr-chart-cum", "yr-chart-tickets", "yr-chart-atv"].every((id) => document.querySelectorAll("#" + id + " g.bar").length === 12)));
    check("year: this year filled, last year outlined, months not reached greyed, with a legend", await page.evaluate(() => { const g = (k) => document.querySelector('#yr-chart-net g.bar[data-key="' + k + '"]');
      return !!g("2031-10").querySelector(".mark") && !!g("2031-10").querySelector(".mark2") && !g("2031-03").querySelector(".mark") && g("2031-11").classList.contains("off") && !g("2031-10").classList.contains("off")
        && document.querySelector("#yr-chart-net .chart-legend").textContent.includes("This year") && document.querySelector("#yr-chart-net .chart-legend").textContent.includes("Last year"); }));
    check("year: the cumulative chart has this year, last year and plan, and this year stops at October", await page.evaluate(() => {
      const c = document.querySelector("#yr-chart-cum"); return c.querySelectorAll("polyline.line").length === 3 && c.querySelector("polyline.s-cur").getAttribute("points").split(" ").length === 10
        && c.querySelector("polyline.s-ly").getAttribute("points").split(" ").length === 12 && /Plan \(cumulative\)/.test(c.querySelector(".chart-legend").textContent); }));
    await page.hover('#yr-chart-net g.bar[data-key="2031-10"]');
    check("year: a bar's tooltip gives the month, this year, last year and plan", norm(await page.textContent(".chart-tip")) === "October 2031Net sales: 210 000 000 so'mLast year: 190 000 000 so'mPlan: 200 000 000 so'm", norm(await page.textContent(".chart-tip")));
    await page.mouse.move(5, 5);
    await page.focus('#yr-chart-cum g.bar[data-key="5"]');
    check("year: the cumulative tooltip, by keyboard", norm(await page.textContent(".chart-tip")) === "June 2031This year: 20 000 000 so'mLast year: 0 so'm", norm(await page.textContent(".chart-tip")));
    await page.evaluate(() => document.activeElement.blur());
    const rows = await cells(page, "#yr-months tbody tr");
    check("year: twelve months in the table with last year, plan and conversion", rows.length === 12 && rows[9].join("|") === "Oct 2031|210 000 000|190 000 000|+10.5%|200 000 000|4|52 500 000|1.00|2.3%|130 000 000|25%" && rows[5].slice(0, 4).join("|") === "Jun 2031|20 000 000|0|—", rows[9].join("|"));
    check("year: the total line and the bridge", (await cells(page, "#yr-total"))[0].slice(0, 6).join("|") === "Total to date|230 000 000|190 000 000|+21.1%|200 000 000|5"
      && (await cells(page, "#yr-bridge .br-row")).map((r) => r[2]).join("|") === "190 000 000|+285 000 000|0|−245 000 000|230 000 000", (await cells(page, "#yr-bridge .br-row")).map((r) => r[2]).join("|"));
    check("year 1024: no sideways scroll", await noHScroll(page));
    await shot(page, "p05-year", true);
    // another year, then a month from the table
    await page.click("#year-prev");
    await page.waitForFunction(() => S.year === 2030 && S.yearDoc && S.yearDoc.doc && S.yearDoc.key === "2030");
    check("year: the previous year is asked and drawn", (await page.textContent("#screen-year .title")).trim() === "2030" && callsOf("year").pop().year === 2030 && /No plan typed in for this year/.test(await page.textContent("#yr-plan")));
    await page.click('#yr-months tr[data-month="2030-10"] a');
    await page.waitForFunction(() => S.month === "2030-10" && S.doc && !S.busy && document.querySelector("#screen-month"));
    check("year: a month in the table opens that month", (await page.textContent("#screen-month .title")).trim() === "October 2030");
    // a failed load can be retried; a correction makes the year load again
    mock.failNext = "year";
    await page.evaluate(() => { S.yearDoc = null; });
    await page.click("#tab-year"); await page.waitForSelector("#doc-err");
    await page.click("#doc-err button"); await page.waitForSelector("#yr-net");
    check("year: Try again loads it", (await page.textContent("#screen-year .title")).trim() === "2030");
    check("year: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("brands", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { hash: "#/brands" });
    await page.waitForSelector("#br-table");
    const pressed = () => page.$$eval("#brand-mode button", (bs) => bs.map((b) => b.textContent.trim() + ":" + b.getAttribute("aria-pressed")).join("|"));
    check("brands: opens on the month, with the period switch and the month picker", (await page.textContent("#screen-brands .title")).trim() === "Brands, October 2031" && (await pressed()) === "Month:true|Year:false"
      && !!(await page.$("#month-select")) && callsOf("brands").pop().month === "2031-10");
    check("brands: headline: top brand, brands sold, on hand", norm(await page.textContent("#br-top")) === "Top brandZz Other150 000 000 so'm71% of sales" && norm(await page.textContent("#br-count")) === "Brands sold3of 4 on hand"
      && norm(await page.textContent("#br-stock")) === "On hand today21 piecesretail value 696 000 000 so'mand 2 on the way" && !(await page.$("#brand-period")), norm(await page.textContent("#br-stock")) + " / " + norm(await page.textContent("#br-top")) + " / " + norm(await page.textContent("#br-count")));
    const rows = await cells(page, "#br-table tbody tr");
    check("brands: every brand with sales, share, last year, units, discount and stock", rows.length === 4 && rows[0].join("|") === "Zz Other|150 000 000|71.4%|0|—|3|50 000 000|2.0%|4|96 000 000"
      && rows[1].slice(0, 5).join("|") === "Zz Brand|40 000 000|19.1%|190 000 000|−78.9%" && rows[3].slice(0, 3).join("|") === "Zz Sleeping House|0|0.0%", rows[0].join("|") + " // " + rows[1].join("|") + " // " + rows[3].join("|"));
    check("brands: the total line", (await cells(page, "#br-total"))[0].join("|") === "All brands|210 000 000|100.0%|190 000 000|+10.5%|5|—|—|21|696 000 000", (await cells(page, "#br-total"))[0].join("|"));
    check("brands: the chart shows brands that sold now or last year, largest first", (await page.$$eval("#br-chart g.bar", (gs) => gs.map((g) => g.dataset.key))).join() === "Zz Other,Zz Brand,Zz Focus");
    await page.hover('#br-chart g.bar[data-key="Zz Brand"]');
    check("brands: tooltip", norm(await page.textContent(".chart-tip")) === "Zz BrandNet sales: 40 000 000 so'mLast year: 190 000 000 so'mShare: 19.1%", norm(await page.textContent(".chart-tip")));
    await page.mouse.move(5, 5);
    check("arrivals: by month through the year and by year, with what sold from them", /by date of arrival/.test(await page.textContent("#arr-note")) && (await page.$$eval("#arr-chart g.bar", (gs) => gs.map((g) => g.dataset.key))).join() === "2030,2031"
      && (await page.$$("#arr-chart-months g.bar")).length === 12 && await page.evaluate(() => !!document.querySelector('#arr-chart-months g.bar[data-key="2031-10"] .mark') && !document.querySelector('#arr-chart-months g.bar[data-key="2031-09"] .mark')));
    await page.hover('#arr-chart-months g.bar[data-key="2031-10"]');
    check("arrivals: a month's tooltip", norm(await page.textContent(".chart-tip")) === "October 2031Arrived: 18Sold from them: 4Still on hand from them: 14Arrived, retail value, USD: $168 000", norm(await page.textContent(".chart-tip")));
    await page.mouse.move(5, 5);
    check("arrivals: by brand for the period on screen, largest value first", (await cells(page, "#arr-table thead tr"))[0][1] === "Arrived in October 2031, units"
      && (await cells(page, "#arr-table tbody tr")).map((r) => r.join("|")).join(" / ") === "Zz Brand|12|120 000|2|17%|10 / Zz Other|6|48 000|2|33%|4" && (await cells(page, "#arr-total"))[0].slice(0, 3).join("|") === "All brands|18|168 000",
      (await cells(page, "#arr-table tbody tr")).map((r) => r.join("|")).join(" / "));
    check("on hand by year of arrival, with the unknown ones named", (await cells(page, "#onhand-table tbody tr")).map((r) => r.join("|")).join(" / ") === "2030|4 / 2031|14 / Arrival date not known|3");
    check("brands 1024: no sideways scroll", await noHScroll(page));
    await shot(page, "p06-brands", true);
    // a month with no arrivals says so
    await page.click("#month-prev");
    await page.waitForFunction(() => S.brandDoc && S.brandDoc.doc && S.brandDoc.key === "m2031-09");
    check("arrivals: a month with none says so", /Nothing arrived in this period/.test(await page.textContent("#arr-table")) && /No sales in this period/.test(await page.textContent("#screen-brands")));
    await page.click("#month-next");
    await page.waitForFunction(() => S.brandDoc && S.brandDoc.doc && S.brandDoc.key === "m2031-10");
    // the year
    await page.click('#brand-mode button[data-mode="year"]');
    await page.waitForFunction(() => S.brandMode === "year" && S.brandDoc && S.brandDoc.doc && S.brandDoc.key === "y2031");
    check("brands: the year, with the year picker", (await page.textContent("#screen-brands .title")).trim() === "Brands, 2031" && !!(await page.$("#year-select")) && !(await page.$("#month-select")) && callsOf("brands").pop().year === 2031 && (await pressed()) === "Month:false|Year:true");
    check("brands: a year still running says last year is the same months", norm(await page.textContent("#brand-period")) === "January to October 2031; last year is the same months.", await page.textContent("#brand-period").catch(() => "none"));
    await page.click("#year-prev");
    await page.waitForFunction(() => S.brandDoc && S.brandDoc.doc && S.brandDoc.key === "y2030");
    check("brands: a whole year carries no such note", !(await page.$("#brand-period")));
    check("brands: a year with no sales says so and still shows stock and arrivals", /No sales in this period/.test(await page.textContent("#screen-brands")) && !(await page.$("#br-chart"))
      && (await cells(page, "#arr-table tbody tr")).map((r) => r.join("|")).join() === "Zz Brand|3|30 000|3|100%|0");
    await page.reload(); await loaded(page); await page.waitForSelector("#br-table");
    check("brands: the period choice survives a reload", (await pressed()) === "Month:false|Year:true");
    await page.click('.kit-lang button[lang="ru"]');
    await page.waitForFunction(() => /Бренды, 2030/.test(document.querySelector("#screen-brands .title").textContent));
    check("brands RU", /Поступления/.test(await page.textContent("#screen-brands")) && /по дате прихода/.test(await page.textContent("#arr-note")) && (await page.$$eval("#brand-mode button", (b) => b.map((x) => x.textContent.trim()))).join() === "Месяц,Год");
    check("brands: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("new screens portrait", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 }, { hash: "#/year" });
    await page.waitForSelector("#yr-net");
    await page.click('.kit-lang button[lang="ru"]');
    await page.waitForFunction(() => /С начала года/.test(document.querySelector("#year-period").textContent));
    check("RU 768 year: Russian, no sideways scroll, 44 px targets", /К тем же месяцам прошлого года/.test(await page.textContent("#yr-ly")) && (await noHScroll(page))
      && await page.evaluate(() => [...document.querySelectorAll(".month-picker .btn, #year-select, .kit-tab, .cur-switch .btn")].every((n) => n.getBoundingClientRect().height >= 44)));
    await shot(page, "p07-year-ru-portrait", true);
    await page.click("#tab-brands"); await page.waitForSelector("#br-table");
    check("RU 768 brands: no sideways scroll", await noHScroll(page));
    await shot(page, "p08-brands-ru-portrait", true);
    await page.click("#tab-inputs"); await page.waitForSelector("#in-plan");
    check("RU 768 inputs, a month ahead: no sideways scroll", /Вводные за Ноябрь 2031/.test(await page.textContent("#screen-inputs .title")) && (await noHScroll(page)));
    await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());
    await page.waitForSelector("#gate-pass");
    check("lock: the year, the brands and the inputs are gone from memory", await page.evaluate(() => S.yearDoc === null && S.brandDoc === null && S.inDoc === null && document.querySelector("#app").children.length === 0));
    check("new screens portrait: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("phone", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 390, height: 844 });
    const vis = (sel) => page.evaluate((q) => { const n = document.querySelector(q); if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
    const pageFits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const box = (sel) => page.$eval(sel, (n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; });
    check("phone: a slim header: wordmark, tool name and the menu button; language, lock and currency are behind it",
      (await vis("#menu-btn")) && (await page.getAttribute("#menu-btn", "aria-expanded")) === "false" && !(await vis(".kit-lang")) && !(await vis("#cur-switch")) && !(await vis("#head-menu"))
      && (await box(".kit-head")).h <= 57, JSON.stringify(await box(".kit-head")));
    const tabs = await page.$$eval(".kit-tab", (ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }));
    check("phone: five tabs on one row, each a 44 px target", tabs.length === 5 && new Set(tabs.map((t) => t[0])).size === 1 && tabs.every((t) => t[1] >= 44 && t[2] >= 44), JSON.stringify(tabs));
    check("phone: the period picker sits under the tabs, outside the pinned header", (await vis("#period-bar #month-select")) && !(await page.$(".top #month-select"))
      && (await box("#period-bar")).bottom <= 170, JSON.stringify(await box("#period-bar")));
    check("phone month: the page is no wider than the screen", await pageFits(), String(await page.evaluate(() => document.documentElement.scrollWidth)));
    check("phone: every control in view is a 44 px target", await page.evaluate(() => [...document.querySelectorAll("button, select, .kit-tab")].filter((n) => n.getBoundingClientRect().width > 0)
      .every((n) => n.getBoundingClientRect().height >= 44)), await page.evaluate(() => [...document.querySelectorAll("button, select, .kit-tab")].filter((n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height < 44).map((n) => n.id || n.className).join()));
    // a wide table scrolls in its own box and keeps its first column in place
    const first = async () => (await box("#kpi tbody tr th")).left;
    const l0 = await first();
    await page.$eval("#kpi", (t) => { t.closest(".table-wrap").scrollLeft = 120; });
    check("phone: a table scrolled sideways keeps its first column", (await page.$eval("#kpi", (t) => t.closest(".table-wrap").scrollLeft)) > 0 && Math.abs((await first()) - l0) < 1, l0 + " → " + (await first()));
    // scrolled down: the tabs stay, the navy bar and the picker go
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(100);
    const tb = await box(".kit-tabs");
    check("phone: scrolled down, only the tab row stays pinned", tb.top >= -1 && tb.top <= 1 && (await box(".kit-head")).bottom <= 1 && (await box("#period-bar")).bottom <= 0, JSON.stringify(tb));
    await page.evaluate(() => window.scrollTo(0, 0));
    // the menu
    await page.click("#menu-btn");
    check("phone: the menu opens with tools, language, currency and lock", (await page.getAttribute("#menu-btn", "aria-expanded")) === "true" && (await vis("#head-menu .kit-lang")) && (await vis("#head-menu #cur-switch"))
      && (await vis("#head-menu .kit-tool-wrap")) && /Lock/.test(await page.textContent("#head-menu")) && /Demo Director/.test(await page.textContent("#head-menu")));
    await page.click('#head-menu #cur-switch button[data-cur="usd"]');
    await page.waitForFunction(() => /\$17 500/.test(document.querySelector("#hl-net .hl-big").textContent));
    check("phone: choosing the currency applies it and closes the menu", !(await vis("#head-menu")) && (await page.getAttribute("#menu-btn", "aria-expanded")) === "false");
    await page.click("#menu-btn"); await page.keyboard.press("Escape");
    check("phone: Escape closes the menu", !(await vis("#head-menu")));
    await page.click("#menu-btn"); await page.click('#head-menu #cur-switch button[data-cur="uzs"]');
    // the year: charts drawn for the phone
    await page.click("#tab-year"); await page.waitForSelector("#yr-months");
    const ticks = await page.$$eval("#yr-chart-net text.tick", (ts) => ts.map((t) => t.getBoundingClientRect().height));
    check("phone year: chart labels are drawn at reading size", ticks.length === 12 && Math.min(...ticks) >= 10 && (await pageFits()) && !!(await page.$("#period-bar #year-select")), JSON.stringify(ticks.slice(0, 3)));
    check("phone year: the cumulative chart too", Math.min(...(await page.$$eval("#yr-chart-cum text.tick", (ts) => ts.map((t) => t.getBoundingClientRect().height)))) >= 10);
    await shot(page, "p09-year-phone", true);
    await page.click("#tab-brands"); await page.waitForSelector("#br-table");
    check("phone brands: fits, with the period switch and picker under the tabs", (await pageFits()) && (await vis("#period-bar #brand-mode")) && (await vis("#period-bar #month-select"))
      && Math.min(...(await page.$$eval("#br-chart text.tick", (ts) => ts.map((t) => t.getBoundingClientRect().height)))) >= 10);
    await page.click("#menu-btn"); await page.click('#head-menu .kit-lang button[lang="ru"]');
    await page.waitForFunction(() => /Бренды/.test(document.querySelector("#screen-brands .title").textContent));
    const act = await box("#tab-brands");
    check("phone RU: the tab in use is in view and the header stays slim", act.left >= 0 && act.right <= 391 && (await box(".kit-head")).h <= 57 && (await pageFits()) && (await box("#period-bar")).bottom <= 190, JSON.stringify(act));
    await shot(page, "p10-brands-ru-phone", true);
    for (const r of ["incentive", "inputs", "month"]) { await page.evaluate((x) => { location.hash = "#/" + x; }, r); await page.waitForTimeout(300); check("phone RU " + r + ": the page is no wider than the screen", await pageFits()); }
    await shot(page, "p11-month-ru-phone", true);
    // turned on its side or opened on a tablet: the full header comes back
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => !document.querySelector("#menu-btn"));
    check("wider than a phone: the full header returns", (await vis(".kit-head .kit-lang")) && (await vis(".kit-tabs #cur-switch")) && !(await page.$("#period-bar")));
    check("phone: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("season", async () => {
    // off unless it is the season or the preview is asked for
    let { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { query: "", now: "2026-11-10T09:00:00" });
    check("season: nothing is added outside the season", !(await page.$(".season-mark")));
    check("season: out of season the page carries no band", await page.evaluate(() => !document.documentElement.classList.contains("season-christmas") && !document.querySelector("style[data-season]") && Math.round(document.querySelector(".top").getBoundingClientRect().top) === 0),
      await page.evaluate(() => JSON.stringify([document.documentElement.className, !!document.querySelector("style[data-season]"), document.querySelector(".top").getBoundingClientRect().top, new Date().toString().slice(0, 15), location.search])));
    await ctx.close();
    ({ ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { query: "", now: "2026-12-10T09:00:00" }));
    check("season: in December it is on by itself", (await page.$$(".season-mark img")).length === 1 && errors.length === 0, errors.join(" | "));
    check("season: 20 November to 14 January", await page.evaluate(() => seasonFor(new Date(2026, 10, 20)) === "christmas" && seasonFor(new Date(2027, 0, 14)) === "christmas"
      && seasonFor(new Date(2027, 0, 15)) === null && seasonFor(new Date(2026, 10, 19)) === null && seasonFor(new Date(2026, 11, 31)) === "christmas"));
    await ctx.close();
    ({ ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { query: "?season=christmas" }));
    const marks = () => page.$$eval(".season-mark img", (is) => is.map((i) => { const r = i.getBoundingClientRect(); return { k: i.dataset.k, alt: i.getAttribute("alt"), w: Math.round(r.width), h: Math.round(r.height), pe: getComputedStyle(i).pointerEvents }; }));
    // the decoration touches no text, control or figure
    const clear = () => page.evaluate(() => { const m = document.querySelector(".season-mark"); if (!m) return true; const a = m.getBoundingClientRect();
      const hit = (b) => !(b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom);
      const rng = document.createRange(); rng.selectNodeContents(document.querySelector("main .title"));
      return !hit(rng.getBoundingClientRect()) && [...document.querySelectorAll("main button, main select, main input, main table, main .hl, main .chart, main p, .top")].every((n) => !hit(n.getBoundingClientRect())); });
    let m = await marks();
    check("season month: one fir sprig at its display size, decorative only", m.length === 1 && m[0].k === "sprig" && m[0].w === 128 && m[0].h === 56 && m[0].alt === "" && m[0].pe === "none"
      && (await page.getAttribute(".season-mark", "aria-hidden")) === "true", JSON.stringify(m));
    check("season month: clear of the title, controls and figures", await clear());
    const band = await page.evaluate(() => { const b = getComputedStyle(document.body, "::before"); return { h: b.height, img: /^url\("data:image\/png/.test(b.backgroundImage), pe: b.pointerEvents, top: document.querySelector(".top").getBoundingClientRect().top }; });
    check("season: a band of snowflakes across the top of the page, above the header", band.h === "36px" && band.img && band.pe === "none" && Math.round(band.top) === 37, JSON.stringify(band));
    await shot(page, "p12-month-season");
    for (const r of ["year", "brands", "incentive"]) {
      await page.click("#tab-" + r); await page.waitForSelector("#screen-" + r); await page.waitForTimeout(150);
      m = await marks();
      check("season " + r + ": one small snowflake accent, clear of everything", m.length === 2 && m[0].k === "flake" && m[0].w === 20 && m[1].k === "mini" && m[1].w === 14 && (await clear()), JSON.stringify(m));
    }
    await shot(page, "p13-brands-season");
    await page.click("#tab-inputs"); await page.waitForSelector("#screen-inputs");
    check("season inputs: a working form carries no decoration", !(await page.$(".season-mark")));
    // a phone: the sprig steps aside for the small accent
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForSelector("#menu-btn");
    await page.click("#tab-month"); await page.waitForSelector("#screen-month"); await page.waitForTimeout(150);
    m = await marks();
    check("season phone: the small accent only, and the page still fits", m.length === 2 && m[0].k === "flake" && (await clear()) && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(m));
    await shot(page, "p14-month-season-phone");
    await ctx.close();
    ({ ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { query: "?season=off" }));
    check("season: can be switched off by the address", !(await page.$(".season-mark")) && errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await browser.close();
  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
