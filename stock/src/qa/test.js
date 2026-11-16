// Checks for the Stock page against qa/mock.js, a stand-in for stock-api.
// Run from stock/src after a build:  python3 build.py && node qa/test.js
// Chromium through Playwright, as sales/src/qa/test.js does.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");

const HTML_FILE = path.join(__dirname, "..", "..", "index.html");   // stock/index.html, written by build.py
const ROOT = "https://alexdelardi.github.io/delardi-board/";
const PAGE_URL = ROOT + "stock/";
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/stock-api";
const SHOTS = process.env.SHOTS || "";   // a folder to save screenshots in, if set

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  results.push((ok ? "PASS " : "FAIL ") + name + (detail !== undefined && !ok ? "  → " + detail : ""));
}
const norm = (s) => String(s || "").replace(/[\s  ]+/g, " ").trim();
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function setup(browser, viewport, opts = {}) {
  mock.reset();
  const ctx = await browser.newContext({ viewport, locale: "en-GB",
    ...(opts.touch ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const html = fs.readFileSync(HTML_FILE, "utf8");
  // Nothing but the page and the API: anything else the page asks for fails the run.
  const foreign = [];
  await page.route("**/*", async (r) => {
    const u = r.request().url();
    if (u.startsWith("data:")) return r.continue();
    if (u.startsWith(PAGE_URL)) return r.fulfill({ status: 200, contentType: "text/html", body: html });
    if (u === API) {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "ok" });
      const [status, data] = mock.handle(JSON.parse(r.request().postData() || "{}"));
      const hold = mock.delay[JSON.parse(r.request().postData() || "{}").action];
      if (hold) await new Promise((res) => setTimeout(res, hold));
      return r.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    }
    foreign.push(u);
    return r.fulfill({ status: 404, body: "" });
  });
  if (opts.clock) await page.clock.install();
  await page.goto(PAGE_URL + (opts.hash || ""));
  if (opts.login !== false) await login(page, opts.pass || "demo");
  return { ctx, page, errors, foreign };
}
async function login(page, pass = "demo") {
  await page.waitForSelector("#gate-pass");
  await page.fill("#gate-pass", pass);
  await page.click(".gate-card button[type=submit]");
  if (!["wrong", "none"].includes(pass)) {
    await page.waitForSelector("#gate", { state: "detached" });
  }
}
// Wait until the list has drawn the answer to the latest request.
async function settled(page) {
  await page.waitForFunction(() => typeof S !== "undefined" && S.list && !S.listBusy && document.querySelector("#rows"));
}
const rowCount = (page) => page.$$eval("#rows tr.prow", (ns) => ns.length);
const colText = (page, i) => page.$$eval("#rows tr.prow", (ns, i) => ns.map((n) => n.children[i].textContent.trim()), i);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const listCalls = () => mock.calls.filter((c) => c.action === "list");
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true });
}
const ORDER = ["in_stock", "reserved", "booked_out", "in_transit", "damaged", "not_received", "sold"];
const WORDS = { in_stock: "In stock", reserved: "Reserved", booked_out: "Booked out", in_transit: "In transit",
  damaged: "Damaged", not_received: "Not received", sold: "Sold" };
const WORDS_RU = { in_stock: "В наличии", reserved: "Резерв", booked_out: "Выдано", in_transit: "В пути",
  damaged: "Повреждено", not_received: "Не получено", sold: "Продано" };

(async () => {
  const browser = await chromium.launch();
  const run = async (name, fn) => {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) return;   // ONLY=piece node qa/test.js runs the matching groups
    try { await fn(); } catch (e) { check(name + " (ran to the end)", false, e.message.split("\n")[0]); }
  };

  // ------------------------------------------------------------ the gate
  await run("gate", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 }, { login: false });
    check("page: translate=no on <html> and the google notranslate meta", await page.evaluate(() =>
      document.documentElement.getAttribute("translate") === "no" &&
      !!document.querySelector('meta[name="google"][content="notranslate"]')));
    check("page: viewport meta and a favicon", await page.evaluate(() =>
      !!document.querySelector('meta[name="viewport"]') && /^data:image\/png/.test(document.querySelector('link[rel="icon"]').href)));
    check("gate: nothing behind the card before a passcode", await page.evaluate(() =>
      document.querySelector("#app").textContent.trim() === "" && !document.querySelector("#rows")));
    check("gate: the card says it opens Stock", /Opens Stock/.test(await page.textContent("#gate")));
    await login(page, "wrong");
    await page.waitForSelector(".gate-card .err:not([hidden])");
    check("gate: a wrong passcode shows an error", /passcode is not right/.test(norm(await page.textContent(".gate-card .err"))));
    await login(page, "none");
    await page.waitForFunction(() => /does not have access to Stock/.test(document.querySelector(".gate-card .err").textContent));
    check("gate: a login without view gets the 403 sentence", /This account does not have access to Stock\./.test(norm(await page.textContent(".gate-card .err"))));
    await page.fill("#gate-pass", "");
    await page.click(".gate-card button[type=submit]");
    check("gate: an empty passcode asks for one", /Enter your passcode/.test(await page.textContent(".gate-card .err")));
    await login(page, "demo");
    await settled(page);
    check("gate: the right passcode opens the pieces list", (await rowCount(page)) === 50);
    check("gate: the token is kept in sessionStorage", await page.evaluate(() => !!sessionStorage.getItem("stock_session")));
    check("gate: #app is not inert once unlocked", await page.evaluate(() => document.querySelector("#app").inert === false));
    // a reload keeps the session (ping)
    await page.reload();
    await settled(page);
    check("gate: a reload keeps the session", !(await page.$("#gate")) && (await rowCount(page)) === 50);
    check("gate: no request leaves for anything but stock-api", foreign.length === 0, foreign.join(" "));
    check("gate: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------- the header
  await run("header", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    check("header: wordmark (vector) linking to the landing page", await page.evaluate(() => {
      const a = document.querySelector(".kit-head a.kit-brand");
      return !!a && a.getAttribute("href") === "../" && /^data:image\/svg\+xml/.test(a.querySelector("img").src);
    }));
    check("header: order — wordmark, rule, Stock, spacer, Tools, EN/RU, staff, Lock", await page.evaluate(() => {
      const h = document.querySelector(".kit-head");
      const kids = [...h.children].map((n) => n.matches("a.kit-brand") ? "brand" : n.matches(".kit-rule") ? "rule" : n.matches(".kit-tool") ? "tool"
        : n.matches(".kit-spacer") ? "spacer" : n.matches("[data-kit-menu]") ? "tools" : n.matches(".kit-lang") ? "lang"
        : n.matches(".kit-staff") ? "staff" : n.matches("button.kit-hbtn") ? "lock:" + n.textContent.trim() : "?");
      return kids.join() === "brand,rule,tool,spacer,tools,lang,staff,lock:Lock" &&
        h.querySelector(".kit-tool").textContent === "Stock" && h.querySelector(".kit-staff").textContent === "Stock Manager";
    }));
    await page.click(".kit-head [data-kit-menu] > button");
    const items = await page.$$eval(".kit-head .kit-menu li", (ls) => ls.map((l) => l.textContent.trim()));
    const current = await page.$$eval(".kit-head .kit-menu [aria-current=page]", (ns) => ns.map((n) => n.textContent.trim()));
    check("header: Tools lists 5 tools, Stock current (not a link)", items.join() === "Sales,Stock,Clients,Catalogue,Board" &&
      current.join() === "Stock" && !(await page.$(".kit-menu a[href='../stock/']")), items.join() + " / " + current.join());
    check("header: EN/RU pair, EN pressed", await page.evaluate(() =>
      [...document.querySelectorAll(".kit-head .kit-lang .kit-hbtn")].map((b) => b.textContent + ":" + b.getAttribute("aria-pressed")).join() === "EN:true,RU:false"));
    // tabs
    const tabs = await page.$$eval(".kit-tabs .kit-tab", (ns) => ns.map((n) => n.textContent.trim() + (n.getAttribute("aria-current") === "page" ? "*" : "")));
    check("tabs: Pieces (current) and Review", tabs.join() === "Pieces*,Review", tabs.join());
    check("routes: the default is #/pieces", await page.evaluate(() => route().name === "pieces"));
    await page.click(".kit-tabs .kit-tab >> text=Review");
    await page.waitForSelector("#screen-review");
    check("routes: #/review shows the review screen, Review current", /#\/review$/.test(page.url()) &&
      norm(await page.textContent(".kit-tabs .kit-tab[aria-current=page]")) === "Review");
    await page.click(".kit-tabs .kit-tab >> text=Pieces");
    await settled(page);
    check("routes: back to #/pieces shows the list", /#\/pieces$/.test(page.url()) && (await rowCount(page)) === 50);
    await page.evaluate(() => { location.hash = "#/nowhere"; });
    await page.waitForTimeout(100);
    await settled(page);
    check("routes: an unknown route shows the list", await page.evaluate(() => route().name === "pieces") && (await rowCount(page)) === 50);
    check("header: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------- the list, paging
  await run("list", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const exp = mock.expectList({});
    check("list: 50 rows on page 1", (await rowCount(page)) === 50);
    const heads = await page.$$eval(".tbl thead th", (ns) => ns.map((n) => n.textContent.trim()));
    check("list: the columns", heads.join("|") === "Serial|Brand|Reference / Model|Size|State|Since|Price", heads.join("|"));
    check("list: a kit table", await page.evaluate(() => !!document.querySelector("table.tbl #rows")));
    const serials = await colText(page, 0);
    check("list: rows in the API's order", serials.join() === exp.rows.map((r) => r.serial).join());
    const first = exp.rows[0];
    const cells = await page.$$eval("#rows tr.prow:first-child td", (ns) => ns.map((n) => n.textContent.trim()));
    check("list: reference on line 1, model on line 2 (small)", await page.evaluate(() => {
      const td = document.querySelector("#rows tr.prow td.ref");
      return !!td.querySelector(".ref-a") && !!td.querySelector(".ref-m.small");
    }) && cells[2].startsWith(first.article) && cells[2].endsWith(first.model_name), cells[2]);
    check("list: price right-aligned, grouped by spaces", cells[6] === money(first.price_uzs) &&
      await page.$eval("#rows tr.prow td:last-child", (n) => n.classList.contains("r")), cells[6]);
    check("list: since is fmtDate of state_since", await page.evaluate((iso) => fmtDate(iso), first.state_since) === cells[5] &&
      /^\d{1,2} [A-Z][a-z]{2} 2026$/.test(cells[5]), cells[5]);
    check("list: the state is a tag", await page.$eval("#rows tr.prow td.st .tag", (n) => n.textContent.trim()) === WORDS[first.state]);
    check("pager: Page 1 of 2, Previous disabled", norm(await page.textContent("#pager .pg-n")) === "Page 1 of 2" &&
      await page.$eval("#pg-prev", (b) => b.disabled) && !(await page.$eval("#pg-next", (b) => b.disabled)));
    check("pager: the count of pieces", /60 pieces/.test(await page.textContent("#pager")));
    await page.click("#pg-next");
    await page.waitForFunction(() => S.page === 2 && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 10);
    check("pager: page 2 has the other 10", (await rowCount(page)) === 10 &&
      (await colText(page, 0)).join() === mock.expectList({ page: 2 }).rows.map((r) => r.serial).join());
    check("pager: Page 2 of 2, Next disabled", norm(await page.textContent("#pager .pg-n")) === "Page 2 of 2" &&
      await page.$eval("#pg-next", (b) => b.disabled));
    check("pager: page 2 was asked of the API", listCalls().some((c) => c.filters && c.filters.page === 2));
    await page.click("#pg-prev");
    await page.waitForFunction(() => S.page === 1 && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    check("pager: Previous goes back to page 1", norm(await page.textContent("#pager .pg-n")) === "Page 1 of 2" &&
      await page.$eval("#pg-prev", (b) => b.disabled) && (await colText(page, 0)).join() === mock.expectList({ page: 1 }).rows.map((r) => r.serial).join());
    // unpriced
    const unpricedSerial = mock.pieces.find((p) => p.price_uzs === null && p.state === "in_stock").serial;
    const idx = (await colText(page, 0)).indexOf(unpricedSerial);
    check("list: an unpriced piece shows —", idx >= 0 && (await colText(page, 6))[idx] === "—", String(idx));
    // the row opens the piece
    await page.click("#rows tr.prow:nth-child(2)");
    check("row: a click calls openPiece(piece_id)", await page.evaluate((id) => S.pieceId === id, exp.rows[1].piece_id));
    await page.focus("#rows tr.prow:nth-child(3)");
    await page.keyboard.press("Enter");
    check("row: Enter on a focused row opens it too", await page.evaluate((id) => S.pieceId === id, exp.rows[2].piece_id));
    check("row: rows are focusable", await page.$eval("#rows tr.prow", (n) => n.tabIndex === 0));
    await shot(page, "list-1024");
    check("list: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // -------------------------------------------------------------- totals
  await run("totals", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const exp = mock.expectList({});
    const by = Object.fromEntries(exp.totals.map((t) => [t.state, t]));
    const cards = await page.$$eval("#totals .tot", (ns) => ns.map((n) => ({ state: n.dataset.state, text: n.textContent.replace(/\s+/g, " ").trim(),
      pressed: n.getAttribute("aria-pressed") })));
    check("totals: one card per state, in the set order", cards.map((c) => c.state).join() === ORDER.filter((s) => by[s]).join(),
      cards.map((c) => c.state).join());
    let allRight = true, bad = "";
    for (const c of cards) {
      const t = by[c.state];
      const want = [WORDS[c.state], t.pieces + (t.pieces === 1 ? " piece" : " pieces"), money(t.value) + " so'm"];
      if (!want.every((w) => c.text.includes(w))) { allRight = false; bad = c.text + " ≠ " + want.join(" / "); }
      if (t.unpriced > 0 !== c.text.includes(t.unpriced + " without price")) { allRight = false; bad = c.text; }
    }
    check("totals: each card has the state word, pieces and value in so'm, and N without price", allRight, bad);
    check("totals: the cards are buttons, none pressed", cards.every((c) => c.pressed === "false") &&
      await page.$$eval("#totals .tot", (ns) => ns.every((n) => n.tagName === "BUTTON")));
    // click a card → that state only
    await page.click("#totals .tot[data-state=reserved]");
    await page.waitForFunction(() => S.filters.state === "reserved" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 5);
    const st = await page.$$eval("#rows td.st .tag", (ns) => ns.map((n) => n.textContent.trim()));
    check("totals: clicking a card filters the list by its state", st.length === 5 && st.every((s) => s === "Reserved"), st.join());
    check("totals: the API was asked for that state", (listCalls().pop().filters || {}).states.join() === "reserved");
    check("totals: the state select follows the card", (await page.$eval("#f-state", (s) => s.value)) === "reserved");
    const act = await page.$eval("#totals .tot[data-state=reserved]", (n) => { const c = getComputedStyle(n);
      return { p: n.getAttribute("aria-pressed"), w: c.outlineWidth, s: c.outlineStyle, c: c.outlineColor }; });
    check("totals: the active card has a 2px navy outline", act.p === "true" && act.w === "2px" && act.s === "solid" && act.c === "rgb(8, 41, 102)", JSON.stringify(act));
    check("totals: every card stays (totals ignore the state filter)", (await page.$$("#totals .tot")).length === cards.length);
    check("pager: one page for the filtered set", norm(await page.textContent("#pager .pg-n")) === "Page 1 of 1");
    await page.click("#totals .tot[data-state=reserved]");
    await page.waitForFunction(() => S.filters.state === "" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    check("totals: clicking it again clears the filter", (await page.$eval("#f-state", (s) => s.value)) === "" &&
      (await page.$eval("#totals .tot[data-state=reserved]", (n) => n.getAttribute("aria-pressed"))) === "false");
    // the state select
    await page.selectOption("#f-state", "sold");
    await page.waitForFunction(() => S.filters.state === "sold" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 8);
    check("filters: the state select filters and presses its card",
      (await page.$eval("#totals .tot[data-state=sold]", (n) => n.getAttribute("aria-pressed"))) === "true");
    const opts = await page.$$eval("#f-state option", (ns) => ns.map((n) => n.textContent.trim()));
    check("filters: the state select has All and the seven states", opts.join() === ["All states"].concat(ORDER.map((s) => WORDS[s])).join(), opts.join());
    check("totals: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------- filters
  await run("filters", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    // search, debounced
    const before = listCalls().length;
    await page.type("#f-q", "ZZ.00.10007", { delay: 20 });
    await page.waitForFunction(() => S.filters.q === "ZZ.00.10007" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 1);
    check("search: by serial finds one piece", (await colText(page, 0)).join() === "ZZ.00.10007");
    check("search: debounced — one request for the whole word", listCalls().length - before === 1, String(listCalls().length - before));
    check("search: the focus stays in the box", await page.evaluate(() => document.activeElement && document.activeElement.id === "f-q"));
    check("search: totals follow the search", (await page.$$("#totals .tot")).length === 1);
    await page.fill("#f-q", "");
    await page.waitForFunction(() => S.filters.q === "" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    await page.fill("#f-q", "no such thing anywhere");
    await page.waitForFunction(() => !S.listBusy && S.list.count === 0 && !!document.querySelector("#rows .empty"));
    check("search: no match says so", /No pieces match/.test(await page.textContent("#rows")));
    check("search: no match leaves no cards and Page 1 of 1", (await page.$$("#totals .tot")).length === 0 &&
      norm(await page.textContent("#pager .pg-n")) === "Page 1 of 1");
    await page.fill("#f-q", "");
    await page.waitForFunction(() => S.filters.q === "" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    // brand
    const brands = await page.$$eval("#f-brand option", (ns) => ns.map((n) => n.textContent.trim()));
    check("filters: the brand select lists the facets", brands.join() === "All brands,Zz Atelier,Zz Jeweller,Zz Watchmaker", brands.join());
    await page.selectOption("#f-brand", "Zz Watchmaker");
    await page.waitForFunction(() => S.filters.brand === "Zz Watchmaker" && !S.listBusy);
    const bcol = await colText(page, 1);
    check("filters: brand filters the rows", bcol.length === mock.expectList({ brand: "Zz Watchmaker" }).count && bcol.every((b) => b === "Zz Watchmaker"), bcol.length);
    await page.selectOption("#f-brand", "");
    await page.waitForFunction(() => S.filters.brand === "" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    // category
    const cats = await page.$$eval("#f-cat option", (ns) => ns.map((n) => n.value + "=" + n.textContent.trim()));
    check("filters: categories humanised", cats.includes("bracelet_element=Bracelet element") && cats.includes("ring=Ring") && cats[0] === "=All categories", cats.join());
    await page.selectOption("#f-cat", "bracelet_element");
    await page.waitForFunction(() => S.filters.category === "bracelet_element" && !S.listBusy);
    check("filters: category filters the rows", (await rowCount(page)) === mock.expectList({ category: "bracelet_element" }).count &&
      (listCalls().pop().filters || {}).category === "bracelet_element");
    await page.selectOption("#f-cat", "");
    await page.waitForFunction(() => S.filters.category === "" && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    // price
    await page.fill("#f-min", "20 000 000");
    await page.fill("#f-max", "40000000");
    await page.waitForFunction(() => S.filters.price_min === 20000000 && S.filters.price_max === 40000000 && !S.listBusy);
    const exp = mock.expectList({ price_min: 20000000, price_max: 40000000 });
    const prices = (await colText(page, 6)).map((p) => Number(p.replace(/\D/g, "")));
    check("filters: price from/to filters the rows", prices.length === Math.min(50, exp.count) && prices.every((p) => p >= 20000000 && p <= 40000000),
      prices.length + " vs " + exp.count);
    const last = listCalls().pop().filters || {};
    check("filters: price bounds go to the API as whole numbers", last.price_min === 20000000 && last.price_max === 40000000, JSON.stringify(last));
    await page.fill("#f-min", "abc");
    await page.waitForTimeout(400);
    check("filters: a price that is not a number is marked, and nothing is asked", await page.$eval("#f-min", (n) => n.getAttribute("aria-invalid")) === "true" &&
      (listCalls().pop().filters || {}).price_min === 20000000);
    await page.fill("#f-min", "");
    await page.fill("#f-max", "");
    await page.waitForFunction(() => S.filters.price_min === null && S.filters.price_max === null && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    check("filters: clearing the prices clears the filter", await page.$eval("#f-min", (n) => !n.hasAttribute("aria-invalid")));
    // a filter change goes back to page 1
    await page.click("#pg-next");
    await page.waitForFunction(() => S.page === 2 && !S.listBusy);
    await page.selectOption("#f-brand", "Zz Jeweller");
    await page.waitForFunction(() => S.filters.brand === "Zz Jeweller" && !S.listBusy);
    check("filters: a change goes back to page 1", await page.evaluate(() => S.page === 1) && (listCalls().pop().filters || {}).page === 1);
    check("filters: kept in S only (not in the URL or storage)", /#\/pieces$|\/stock\/$/.test(page.url()) &&
      await page.evaluate(() => !/Jeweller/.test(JSON.stringify(Object.assign({}, sessionStorage, localStorage)))));
    check("filters: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------- long names, widths
  for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
    await run("widths " + vp.width, async () => {
      const { ctx, page, errors } = await setup(browser, vp);
      await settled(page);
      const ok = await page.evaluate((name) => {
        const td = [...document.querySelectorAll("#rows td.ref")].find((n) => n.textContent.includes(name));
        if (!td) return "missing";
        const m = td.querySelector(".ref-m");
        const lh = parseFloat(getComputedStyle(m).lineHeight) || 18;
        return m.getBoundingClientRect().height > lh * 1.5 ? "wraps" : "one line " + m.getBoundingClientRect().height;
      }, mock.LONG_NAME);
      check(`widths ${vp.width}×${vp.height}: the 60-character model name wraps`, ok === "wraps", ok);
      check(`widths ${vp.width}×${vp.height}: no sideways scroll`, await noHScroll(page));
      await page.click(".kit-head [data-kit-menu] > button");
      check(`widths ${vp.width}×${vp.height}: no sideways scroll with Tools open`, await noHScroll(page));
      await page.click(".kit-head [data-kit-menu] > button");
      await page.click(".kit-lang .kit-hbtn[lang=ru]");
      await settled(page);
      check(`widths ${vp.width}×${vp.height}: no sideways scroll in RU`, await noHScroll(page));
      const small = await page.evaluate(() => [...document.querySelectorAll("#main button, #main select, #main input")]
        .filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.height < 43.5); }).map((n) => n.id || n.className));
      check(`widths ${vp.width}×${vp.height}: controls are 44 px targets`, small.length === 0, small.join());
      await shot(page, "list-ru-" + vp.width);
      check(`widths ${vp.width}: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }

  // ------------------------------------------------------------------ RU
  await run("russian", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    await page.selectOption("#f-brand", "Zz Atelier");
    await page.waitForFunction(() => S.filters.brand === "Zz Atelier" && !S.listBusy);
    await page.click(".kit-lang .kit-hbtn[lang=ru]");
    await settled(page);
    check("RU: the html lang is ru", await page.evaluate(() => document.documentElement.lang === "ru"));
    check("RU: header Склад, Инструменты, Заблокировать", norm(await page.textContent(".kit-tool")) === "Склад" &&
      norm(await page.textContent(".kit-head [data-kit-menu] > button")) === "Инструменты" &&
      norm(await page.textContent(".kit-head > button.kit-hbtn")) === "Заблокировать");
    const tabs = await page.$$eval(".kit-tabs .kit-tab", (ns) => ns.map((n) => n.textContent.trim()));
    check("RU: tabs Изделия / Проверка", tabs.join() === "Изделия,Проверка", tabs.join());
    const heads = await page.$$eval(".tbl thead th", (ns) => ns.map((n) => n.textContent.trim()));
    check("RU: the column heads", heads.join("|") === "Серийный №|Бренд|Артикул / Модель|Размер|Статус|С даты|Цена", heads.join("|"));
    const opts = await page.$$eval("#f-state option", (ns) => ns.map((n) => n.textContent.trim()));
    check("RU: state words", opts.join() === ["Все статусы"].concat(ORDER.map((s) => WORDS_RU[s])).join(), opts.join());
    const cats = await page.$$eval("#f-cat option", (ns) => ns.map((n) => n.value + "=" + n.textContent.trim()));
    const RU_CATS = { ring: "Кольцо", watch: "Часы", necklace: "Колье", earrings: "Серьги", bracelet: "Браслет", strap: "Ремешок",
      clasp: "Застёжка", bracelet_element: "Элемент браслета", cufflinks: "Запонки" };
    check("RU: category words", cats[0] === "=Все категории" && cats.slice(1).every((c) => { const [k, w] = c.split("="); return RU_CATS[k] === w; }), cats.join());
    check("RU: the brand filter is kept across the switch", (await page.$eval("#f-brand", (s) => s.value)) === "Zz Atelier" &&
      (await page.$$eval("#f-brand option", (ns) => ns[0].textContent.trim())) === "Все бренды");
    const card = norm(await page.textContent("#totals .tot[data-state=in_stock]"));
    check("RU: a totals card in Russian (сум, изделий)", /В наличии/.test(card) && /сум/.test(card) && /издели/.test(card), card);
    check("RU: dates in Russian months", /^\d{1,2} (янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек) 2026$/.test((await colText(page, 5))[0]), (await colText(page, 5))[0]);
    check("RU: the pager", /^Страница 1 из 1$/.test(norm(await page.textContent("#pager .pg-n"))) &&
      norm(await page.textContent("#pg-prev")) === "Назад" && norm(await page.textContent("#pg-next")) === "Далее");
    check("RU: the filter labels", await page.evaluate(() => [...document.querySelectorAll(".filters .lbl")].map((n) => n.textContent.trim()).join()) ===
      "Поиск,Статус,Бренд,Категория,Цена от,Цена до");
    check("RU: the title", await page.evaluate(() => document.title === "Delardi Склад"));
    check("RU: fmtDate and money", await page.evaluate(() => fmtDate("2026-11-16T09:05:00Z") === "16 ноя 2026" &&
      fmtDate("2026-11-16T20:30:00Z") === "17 ноя 2026" && fmtMoney(31500000) === "31 500 000 сум"));
    await page.click(".kit-lang .kit-hbtn[lang=en]");
    await settled(page);
    check("EN: fmtDate and money", await page.evaluate(() => fmtDate("2026-11-16T09:05:00Z") === "16 Nov 2026" && fmtMoney(31500000) === "31 500 000 so'm"));
    check("lang: kept for the next visit (shared key)", await page.evaluate(() => localStorage.getItem("delardi_lang") === "en"));
    check("RU: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // --------------------------------------------------- hooks for Tasks 4–6
  await run("hooks", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const tags = await page.evaluate(() => Object.keys(STATE_WORDS).map((s) => { const t = stateTag(s); return s + ":" + t.className + ":" + t.textContent; }));
    check("hooks: STATE_WORDS has the seven states", tags.length === 7, tags.join());
    check("hooks: stateTag gives the G1 tags", tags.join() === [
      "in_stock:tag act:In stock", "reserved:tag line:Reserved", "booked_out:tag line:Booked out", "in_transit:tag info:In transit",
      "damaged:tag alert:Damaged", "not_received:tag alert:Not received", "sold:tag done:Sold"].join(), tags.join());
    check("hooks: openPiece, renderList, S are globals", await page.evaluate(() => typeof openPiece === "function" &&
      typeof renderList === "function" && typeof S === "object" && typeof api === "function" && typeof confirmBox === "function" && typeof modal === "function"));
    check("hooks: S.rights from the unlock", await page.evaluate(() => S.rights.view && S.rights.manage && S.rights.crm));
    check("hooks: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // -------------------------------------------------------------- the lock
  await run("lock", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    await page.selectOption("#f-brand", "Zz Jeweller");
    await page.waitForFunction(() => S.filters.brand === "Zz Jeweller" && !S.listBusy);
    await page.click(".kit-head [data-kit-menu] > button");
    await page.evaluate(() => {
      document.body.appendChild(Object.assign(document.createElement("div"), { className: "panel-wrap" }));
      modal("test-dialog", "A dialog", "Body");
    });
    await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());   // the dialog's scrim covers the header
    await page.waitForSelector("#gate-pass");
    check("lock: Lock shows the card", /Locked/.test(await page.textContent("#toast")));
    check("lock: the Tools menu is closed and its listeners dropped", await page.evaluate(() => kitOpenMenus.length === 0 &&
      ![...document.querySelectorAll(".kit-menu")].some((m) => !m.hidden)));
    check("lock: panels and dialogs are removed", !(await page.$(".panel-wrap")) && !(await page.$(".modal-wrap")));
    const foc = await page.evaluate(() => { const b = document.querySelector(".kit-head [data-kit-menu] > button"); if (b) b.focus();
      return { inert: document.querySelector("#app").inert === true, focused: !!b && document.activeElement === b }; });
    check("lock: #app is inert, Tab cannot reach the header", foc.inert && !foc.focused, JSON.stringify(foc));
    check("lock: the session is dropped", await page.evaluate(() => !sessionStorage.getItem("stock_session") && S.token === null));
    check("lock: the card has the mast, the wordmark and Unlock", await page.evaluate(() => !!document.querySelector("#gate .gate-mast img") &&
      document.querySelector("#gate .gate-card button[type=submit]").textContent === "Unlock" &&
      /Boutique tools/.test(document.querySelector("#gate .gate-mast").textContent)));
    await login(page);
    await settled(page);
    check("lock: unlocking again keeps the filters", (await page.$eval("#f-brand", (s) => s.value)) === "Zz Jeweller" &&
      await page.evaluate(() => document.querySelector("#app").inert === false));
    // a lost session (401) locks the page
    mock.expireAll();
    await page.selectOption("#f-brand", "");
    await page.waitForSelector("#gate-pass");
    check("lock: a 401 from the API locks the page with its sentence", /session has expired/.test(await page.textContent(".gate-card .err")));
    check("lock: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("idle lock", async () => {
    const { ctx, page } = await setup(browser, { width: 768, height: 1024 }, { touch: true, clock: true });
    await settled(page);
    await page.clock.fastForward(16 * 60 * 1000);
    await page.waitForSelector("#gate-pass", { timeout: 5000 });
    check("idle: a touch device locks after 15 minutes without use", /15 minutes/.test(await page.textContent(".gate-card .err")));
    await ctx.close();
  });

  await run("view only", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "look" });
    await settled(page);
    check("view only: the list opens for a view-only login", (await rowCount(page)) === 50 && await page.evaluate(() => !S.rights.manage));
    check("view only: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------ the piece panel
  const setCalls = () => mock.calls.filter((c) => c.action === "set_state");
  const pieceOf = (state, pred) => mock.pieces.find((p) => p.state === state && (!pred || pred(p)));
  const onPage1 = (p) => mock.expectList({}).rows.some((r) => r.piece_id === p.piece_id);
  const openId = async (page, id) => {
    await page.evaluate((i) => openPiece(i), id);
    await page.waitForSelector("#piece-panel .panel #pc-title");
  };
  const stateIn = (page) => page.$eval("#piece-panel .pc-state .tag", (n) => n.textContent.trim());
  const actionLabels = (page) => page.$$eval("#pc-actions button", (ns) => ns.map((n) => n.textContent.trim()));

  await run("piece panel: layout, history, links", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const first = await page.$eval("#rows tr.prow", (n) => n.getAttribute("data-id"));
    await page.click("#rows tr.prow");
    await page.waitForSelector("#piece-panel .panel #pc-title");
    const fp = mock.pieces.find((p) => p.piece_id === first);
    check("panel: a row click opens the right panel", await page.evaluate(() => !!document.querySelector("#piece-panel.panel-wrap .panel-scrim")));
    const w = await page.$eval("#piece-panel .panel", (n) => Math.round(n.getBoundingClientRect().width));
    check("panel: 560 px wide on a wide screen", w === 560, String(w));
    check("panel: the title is Brand · Model", norm(await page.textContent("#pc-title")) === fp.brand + " · " + fp.model_name, norm(await page.textContent("#pc-title")));
    check("panel: the title is Palatino at the .h2 size", await page.$eval("#pc-title", (n) => /Palatino/.test(getComputedStyle(n).fontFamily) && n.classList.contains("h2")));
    check("panel: state tag and since date", await stateIn(page) === WORDS[fp.state] &&
      /^since \d{1,2} [A-Z][a-z]{2} 2026$/.test(norm(await page.textContent("#piece-panel .pc-state .since"))), norm(await page.textContent("#piece-panel .pc-state")));
    const facts = norm(await page.textContent("#pc-facts"));
    check("panel: facts have serial, barcode, reference and price", facts.includes(fp.serial) && facts.includes(fp.barcode) &&
      facts.includes(fp.article) && facts.includes(money(fp.price_uzs) + " so'm"), facts);
    check("panel: facts have collection, category word, metal, stones, first seen", /Collection\s*\S/.test(facts) && /Category\s*(Ring|Watch|Necklace|Earrings|Bracelet|Strap|Clasp|Bracelet element|Cufflinks)/.test(facts) &&
      /Metal\s*White gold/.test(facts) && /Stones/.test(facts) && /First seen\s*\d{1,2} [A-Z][a-z]{2} 2026/.test(facts), facts);
    // unpriced piece shows a dash
    const un = pieceOf("in_stock", (p) => p.price_uzs === null);
    await openId(page, un.piece_id);
    check("panel: an unpriced piece shows — for the price", /Price\s*—/.test(norm(await page.textContent("#pc-facts"))));
    // a sold piece: history newest first, ticket links, sales
    const sp = pieceOf("sold");
    await openId(page, sp.piece_id);
    const hist = await page.$$eval("#pc-history li", (ns) => ns.map((n) => n.textContent.replace(/[\s\u00a0\u202f]+/g, " ").trim()));
    check("history: events newest first (Sold, then First load)", hist.length === 2 && /Sold/.test(hist[0]) && /First load/.test(hist[1]), hist.join(" || "));
    check("history: from → to, actor, date and time", /In stock → Sold/.test(hist[0]) && /Stock Manager/.test(hist[1]) && /\d{1,2} [A-Z][a-z]{2} 2026,? \d{2}:\d{2}/.test(hist[0]), hist[0]);
    const link = await page.$eval("#pc-history li a", (a) => ({ href: a.getAttribute("href"), text: a.textContent.trim() }));
    const tid = "30000000-0000-4000-8000-0000000000" + sp.serial.slice(-2);
    check("history: a sold piece links to ../sales/#/ticket/<id>", link.href === "../sales/#/ticket/" + tid && link.text === "Ticket D-0000" + sp.serial.slice(-2), JSON.stringify(link));
    const sales = await page.$$eval("#pc-sales li", (ns) => ns.map((n) => ({ t: n.textContent.replace(/[\s\u00a0\u202f]+/g, " ").trim(), href: n.querySelector("a") && n.querySelector("a").getAttribute("href"), tags: [...n.querySelectorAll(".tag")].map((x) => x.textContent.trim()) })));
    check("sales: ticket link, date, net so'm, source", sales.length === 2 && sales[0].href === "../sales/#/ticket/" + tid && /Till/.test(sales[0].t) &&
      sales[0].t.includes(money(sp.price_uzs) + " so'm") && /\d{1,2} [A-Z][a-z]{2} 2026/.test(sales[0].t), JSON.stringify(sales[0]));
    check("sales: a void ticket carries a Void tag, training source", sales[1].tags.includes("Void") && /Training/.test(sales[1].t) && !sales[0].tags.includes("Void"), JSON.stringify(sales[1]));
    // open reviews
    const rp = mock.pieces[0];
    await openId(page, rp.piece_id);
    const rv = norm(await page.textContent("#pc-reviews"));
    check("reviews: open review kind word and raised date", /Missing from export/.test(rv) && /\d{1,2} [A-Z][a-z]{2} 2026/.test(rv), rv);
    // closing
    await page.click("#piece-close");
    check("close: the × closes the panel", !(await page.$("#piece-panel")));
    await openId(page, rp.piece_id);
    await page.keyboard.press("Escape");
    check("close: Escape closes the panel", !(await page.$("#piece-panel")));
    await openId(page, rp.piece_id);
    await page.mouse.click(100, 400);
    check("close: the scrim closes the panel", !(await page.$("#piece-panel")));
    await shot(page, "piece-sold");
    check("panel: no request leaves for anything but stock-api", foreign.length === 0, foreign.join(" "));
    check("panel: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: rights and hold block", async () => {
    // view only: no buttons
    let t = await setup(browser, { width: 1024, height: 768 }, { pass: "look" });
    await settled(t.page);
    await openId(t.page, pieceOf("in_stock").piece_id);
    check("rights: without manage there are no change buttons", (await actionLabels(t.page)).length === 0);
    const rsv = pieceOf("reserved", (p) => p.hold_client_id === "DLD-9001");
    await openId(t.page, rsv.piece_id);
    const hold = norm(await t.page.textContent("#pc-hold"));
    check("hold: without crm the client reference is shown", hold.includes("DLD-9001") && !hold.includes("Соколова") && /1 Dec 2026/.test(hold), hold);
    await t.ctx.close();
    // manage, no crm: buttons yes, reference
    t = await setup(browser, { width: 1024, height: 768 }, { pass: "nocrm" });
    await settled(t.page);
    await openId(t.page, rsv.piece_id);
    check("hold: manage without crm still shows the reference", norm(await t.page.textContent("#pc-hold")).includes("DLD-9001") && (await actionLabels(t.page)).length === 1);
    await t.ctx.close();
    // manage + crm
    t = await setup(browser, { width: 1024, height: 768 });
    await settled(t.page);
    await openId(t.page, rsv.piece_id);
    const h2 = norm(await t.page.textContent("#pc-hold"));
    check("hold: with crm the client name is shown", h2.includes("Соколова Мария Андреевна") && /1 Dec 2026/.test(h2), h2);
    check("rights: a reserved piece offers Back in stock only", (await actionLabels(t.page)).join() === "Back in stock", (await actionLabels(t.page)).join());
    await openId(t.page, pieceOf("in_stock").piece_id);
    check("rights: an in-stock piece offers Reserve / Book out / Damaged", (await actionLabels(t.page)).join() === "Reserve,Book out,Damaged", (await actionLabels(t.page)).join());
    await openId(t.page, pieceOf("in_transit").piece_id);
    check("rights: an in-transit piece offers no change", (await actionLabels(t.page)).length === 0);
    await openId(t.page, pieceOf("damaged").piece_id);
    check("hold: a damaged piece shows its note", /Clasp bent/.test(norm(await t.page.textContent("#pc-hold"))) && (await actionLabels(t.page)).join() === "Back in stock");
    const bo = pieceOf("booked_out");
    await openId(t.page, bo.piece_id);
    check("hold: a booked-out piece shows client, note", /On approval at the client's home/.test(norm(await t.page.textContent("#pc-hold"))));
    await t.ctx.close();
  });

  await run("piece panel: state changes", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const piece = mock.pieces.filter((p) => p.state === "in_stock" && onPage1(p))[0];
    const cardN = async (s) => { const n = await page.$(`#totals .tot[data-state="${s}"] .t-n`); return n ? Number((await n.textContent()).match(/\d+/)[0]) : 0; };
    const before = { in_stock: await cardN("in_stock"), reserved: await cardN("reserved"), booked_out: await cardN("booked_out") };
    await openId(page, piece.piece_id);
    // Book out with an empty note is refused on the page
    await page.click('#pc-actions button[data-act="booked_out"]');
    await page.waitForSelector("#pc-form");
    const n0 = setCalls().length;
    await page.click("#pf-submit");
    check("book out: an empty note is refused on the page", /Write who has it and why\./.test(await page.textContent("#pf-err")) &&
      !(await page.$("#confirm-dialog")) && setCalls().length === n0);
    check("book out: the note field is marked invalid", await page.$eval("#pf-note", (n) => n.getAttribute("aria-invalid")) === "true");
    await page.click("#pf-cancel");
    check("form: Cancel closes the form, the panel stays", !(await page.$("#pc-form")) && !!(await page.$("#piece-panel")));
    // Damaged: empty note refused
    await page.click('#pc-actions button[data-act="damaged"]');
    await page.click("#pf-submit");
    check("damaged: an empty note is refused on the page", /Write what is wrong\./.test(await page.textContent("#pf-err")) && setCalls().length === n0);
    await page.click("#pf-cancel");
    // Reserve with a client and an until date
    await page.click('#pc-actions button[data-act="reserved"]');
    check("reserve: the form has client, until and note, all optional", (await page.$("#pf-client")) && (await page.$("#pf-until")) && (await page.$("#pf-note")) &&
      await page.$eval("#pf-client", (n) => n.maxLength === 20 && !n.required));
    await page.fill("#pf-client", "DLD-9001");
    await page.fill("#pf-until", "2026-12-24");
    await page.click("#pf-submit");
    await page.waitForSelector("#confirm-dialog");
    check("reserve: a confirm names the piece", norm(await page.textContent("#confirm-dialog h3")) === "Reserve " + piece.serial + "?", norm(await page.textContent("#confirm-dialog h3")));
    await page.click("#confirm-cancel");
    check("reserve: No in the confirm sends nothing and keeps the form", setCalls().length === n0 && !!(await page.$("#pc-form")));
    await page.click("#pf-submit");
    await page.waitForSelector("#confirm-dialog");
    await page.click("#confirm-ok");
    await page.waitForFunction(() => !document.querySelector("#pc-form") && /Reserved/.test(document.querySelector("#piece-panel .pc-state .tag").textContent));
    const sc = setCalls().pop();
    check("reserve: set_state carries state, client and until", sc.state === "reserved" && sc.client_id === "DLD-9001" && sc.until === "2026-12-24" && sc.piece_id === piece.piece_id, JSON.stringify(sc));
    check("reserve: the panel redraws from the answer (client name, until)", /Соколова Мария Андреевна/.test(norm(await page.textContent("#pc-hold"))) &&
      /24 Dec 2026/.test(norm(await page.textContent("#pc-hold"))) && (await actionLabels(page)).join() === "Back in stock");
    check("reserve: the history gained a Reserved event with the actor", /In stock → Reserved/.test(norm(await page.textContent("#pc-history li"))) &&
      /Stock Manager/.test(norm(await page.textContent("#pc-history li"))));
    check("reserve: a toast says so", /Reserved/.test(await page.textContent("#toast")) && await page.$eval("#toast", (t) => t.classList.contains("show")));
    await page.waitForFunction(() => !S.listBusy);
    check("reserve: the list row tag follows", await page.$eval(`#rows tr[data-id="${piece.piece_id}"] .tag`, (n) => n.textContent.trim()) === "Reserved");
    const after = { in_stock: await cardN("in_stock"), reserved: await cardN("reserved") };
    check("reserve: the totals follow (in stock −1, reserved +1)", after.in_stock === before.in_stock - 1 && after.reserved === before.reserved + 1, JSON.stringify([before, after]));
    // Back in stock
    await page.click('#pc-actions button[data-act="in_stock"]');
    check("back in stock: the form has an optional note only", !(await page.$("#pf-client")) && !!(await page.$("#pf-note")));
    await page.fill("#pf-note", "Client declined");
    await page.click("#pf-submit");
    await page.waitForSelector("#confirm-dialog");
    check("back in stock: confirm names the piece", /ZZ\.00\.\d+/.test(norm(await page.textContent("#confirm-dialog h3"))) && norm(await page.textContent("#confirm-dialog h3")).includes(piece.serial));
    await page.click("#confirm-ok");
    await page.waitForFunction(() => /In stock/.test(document.querySelector("#piece-panel .pc-state .tag").textContent) && !document.querySelector("#pc-form"));
    check("back in stock: the panel is In stock again, the note went along", setCalls().pop().note === "Client declined" && (await actionLabels(page)).join() === "Reserve,Book out,Damaged");
    // Book out with a note, no client, no date
    await page.click('#pc-actions button[data-act="booked_out"]');
    await page.fill("#pf-note", "Showing to Invented Client Two");
    await page.click("#pf-submit");
    await page.click("#confirm-ok");
    await page.waitForFunction(() => /Booked out/.test(document.querySelector("#piece-panel .pc-state .tag").textContent));
    const bc = setCalls().pop();
    check("book out: client and until are empty, the note is sent", bc.state === "booked_out" && !bc.client_id && !bc.until && bc.note === "Showing to Invented Client Two", JSON.stringify(bc));
    // 409: an unknown client from the database
    await page.click('#pc-actions button[data-act="in_stock"]');
    await page.click("#pf-submit"); await page.click("#confirm-ok");
    await page.waitForFunction(() => /In stock/.test(document.querySelector("#piece-panel .pc-state .tag").textContent));
    await page.click('#pc-actions button[data-act="reserved"]');
    await page.fill("#pf-client", "DLD-9999");
    await page.click("#pf-submit"); await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelector("#pf-err") && !document.querySelector("#pf-err").hidden && document.querySelector("#pf-err").textContent);
    check("409: the database sentence is shown in the form, verbatim", norm(await page.textContent("#pf-err")) === "client DLD-9999 not found", norm(await page.textContent("#pf-err")));
    await page.click("#pf-cancel");
    // 409: the piece was sold meanwhile
    const other = mock.pieces.filter((p) => p.state === "in_stock" && onPage1(p) && p.piece_id !== piece.piece_id)[0];
    await openId(page, other.piece_id);
    await page.click('#pc-actions button[data-act="damaged"]');
    await page.fill("#pf-note", "Scratch on the case");
    mock.sellNow(other.piece_id);
    await page.click("#pf-submit"); await page.click("#confirm-ok");
    await page.waitForFunction(() => /Sold/.test(document.querySelector("#piece-panel .pc-state .tag").textContent));
    check("409: the piece is reloaded and shows Sold, no change buttons", (await actionLabels(page)).length === 0 && !(await page.$("#pc-form")));
    check("409: the refusal sentence is on screen in the notice", norm(await page.textContent("#pc-notice")) === "state sold → damaged is not allowed", norm(await page.textContent("#pc-notice")));
    await page.waitForFunction(() => !S.listBusy);
    check("409: the list row follows to Sold", await page.$eval(`#rows tr[data-id="${other.piece_id}"] .tag`, (n) => n.textContent.trim()) === "Sold");
    check("changes: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: 403 on set_state", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const piece = pieceOf("in_stock");
    await openId(page, piece.piece_id);
    await page.click('#pc-actions button[data-act="reserved"]');
    mock.setRight("demo", "manage", false);               // the right is taken away meanwhile
    await page.click("#pf-submit"); await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelector("#pf-err") && document.querySelector("#pf-err").textContent);
    check("403: the sentence is shown in the form", /Your account cannot change stock\./.test(await page.textContent("#pf-err")));
    check("403: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: in flight", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const cardN = async (s) => { const n = await page.$(`#totals .tot[data-state="${s}"] .t-n`); return n ? Number((await n.textContent()).match(/\d+/)[0]) : 0; };
    const waitSent = async (n) => { for (let k = 0; k < 40 && setCalls().length === n; k++) await page.waitForTimeout(50); };
    const pcs = mock.pieces.filter((p) => p.state === "in_stock" && onPage1(p));
    const startReserve = async (piece) => {
      await openId(page, piece.piece_id);
      await page.click('#pc-actions button[data-act="reserved"]');
      mock.delay.set_state = 600;
      const n = setCalls().length;
      await page.click("#pf-submit");
      await page.waitForSelector("#confirm-dialog");
      return n;
    };
    // two quick submits: one confirm, one request
    await openId(page, pcs[0].piece_id);
    await page.click('#pc-actions button[data-act="reserved"]');
    mock.delay.set_state = 600;
    const n0 = setCalls().length;
    await page.evaluate(() => { const b = document.querySelector("#pf-submit"); b.click(); b.click(); });
    await page.waitForSelector("#confirm-dialog");
    check("submit: a second submit while the confirm is open opens no second confirm", (await page.$$("#confirm-dialog")).length === 1);
    const before = { in_stock: await cardN("in_stock"), reserved: await cardN("reserved") };
    await page.click("#confirm-ok");
    await waitSent(n0);
    check("submit: two quick submits send one set_state", setCalls().length === n0 + 1);
    // closing in flight is ignored
    await page.click("#piece-close");
    await page.keyboard.press("Escape");
    await page.mouse.click(100, 400);
    check("close: ×, Escape and the scrim are ignored while the request is in flight", !!(await page.$("#piece-panel")));
    await page.waitForFunction(() => /Reserved/.test(document.querySelector("#piece-panel .pc-state .tag").textContent));
    await page.waitForFunction(() => !S.listBusy);
    check("in flight: the answer redraws the panel and the toast shows", /Reserved/.test(await page.textContent("#toast")));
    check("in flight: row and totals follow", await page.$eval(`#rows tr[data-id="${pcs[0].piece_id}"] .tag`, (n) => n.textContent.trim()) === "Reserved" &&
      (await cardN("reserved")) === before.reserved + 1 && (await cardN("in_stock")) === before.in_stock - 1);
    // panel closed some other way (programmatically) while in flight: still toast and refresh
    await page.click("#piece-close");
    const b2 = { in_stock: await cardN("in_stock"), reserved: await cardN("reserved") };
    const n1 = await startReserve(pcs[1]);
    await page.click("#confirm-ok");
    await waitSent(n1);
    await page.evaluate(() => closePiece());
    await page.evaluate(() => { document.querySelector("#toast").textContent = ""; });
    await page.waitForFunction(() => /Reserved/.test(document.querySelector("#toast").textContent));
    await page.waitForFunction(() => !S.listBusy);
    check("closed in flight: the toast shows and the list refreshes", !(await page.$("#piece-panel")) &&
      await page.$eval(`#rows tr[data-id="${pcs[1].piece_id}"] .tag`, (n) => n.textContent.trim()) === "Reserved" &&
      (await cardN("reserved")) === b2.reserved + 1 && (await cardN("in_stock")) === b2.in_stock - 1);
    delete mock.delay.set_state;
    check("in flight: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: voided sale reason", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    await openId(page, mock.pieces[1].piece_id);
    const en = norm(await page.textContent("#pc-history li"));
    check("history: a void reason reads Sale voided — <text> in English", /Sold → In stock/.test(en) && /Sale voided — Wrong size entered/.test(en) && !/void:/i.test(en), en);
    await page.evaluate(() => setLang("ru"));
    const ru = norm(await page.textContent("#pc-history li"));
    check("history: and in Russian", /Продажа аннулирована — Wrong size entered/.test(ru) && !/void/i.test(ru), ru);
    check("void reason: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: lock", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    await openId(page, pieceOf("in_stock").piece_id);
    await page.click('#pc-actions button[data-act="reserved"]');
    await page.waitForSelector("#pc-form");
    await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click()).catch(() => page.evaluate(() => lockNow()));
    await page.waitForSelector("#gate-pass");
    check("lock: the panel and its form are gone", !(await page.$("#piece-panel")) && !(await page.$("#pc-form")) && !(await page.$(".panel-wrap")));
    check("lock: #app is inert", await page.evaluate(() => document.querySelector("#app").inert === true && !S.pieceId));
    // a late answer after lock draws nothing
    await login(page);
    await settled(page);
    await page.evaluate((id) => { openPiece(id); lockNow(); }, pieceOf("in_stock").piece_id);
    await page.waitForTimeout(400);
    check("lock: a late piece answer draws nothing", !(await page.$(".panel-wrap")) && await page.evaluate(() => S.locked && document.querySelector("#app").inert));
    // a late set_state answer after lock draws nothing: lock while the request is really in flight
    await login(page);
    await settled(page);
    const pc = pieceOf("in_stock");
    await openId(page, pc.piece_id);
    await page.click('#pc-actions button[data-act="reserved"]');
    mock.delay.set_state = 600;
    const sent = setCalls().length;
    await page.click("#pf-submit");
    await page.click("#confirm-ok");
    for (let k = 0; k < 40 && setCalls().length === sent; k++) await page.waitForTimeout(50);
    check("lock: the set_state request was sent", setCalls().length === sent + 1);
    await page.evaluate(() => lockNow());
    await page.waitForTimeout(900);
    check("lock: a late set_state answer draws nothing (no panel, no toast, no list)", !(await page.$(".panel-wrap")) && !(await page.$("#confirm-dialog")) &&
      !/Reserved/.test(await page.textContent("#toast")) && await page.evaluate(() => S.locked && S.list === null && S.pc === null && document.querySelector("#app").inert));
    delete mock.delay.set_state;
    check("lock: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("lock clears the list, facets and price timers", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const n = listCalls().length;
    // typed and locked in the same task, so the debounces are certainly still pending
    await page.evaluate(() => {
      for (const [id, v] of [["f-min", "20000000"], ["f-q", "ZZ"]]) {
        const i = document.getElementById(id); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true }));
      }
      lockNow();
    });
    await page.waitForSelector("#gate-pass");
    check("lock: S.list, S.listError and S.facets are cleared", await page.evaluate(() => S.list === null && S.listError === null && S.facets === null));
    await page.waitForTimeout(600);
    check("lock: a pending price or search debounce asks nothing", listCalls().length === n, listCalls().length + " vs " + n);
    check("lock: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: RU and widths", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    await page.click(".kit-lang .kit-hbtn[lang=ru]");
    await settled(page);
    const sp = pieceOf("sold");
    await openId(page, sp.piece_id);
    const facts = norm(await page.textContent("#pc-facts"));
    check("RU: fact labels and prices in сум", /Серийный №/.test(facts) && /Штрихкод/.test(facts) && /Артикул/.test(facts) && facts.includes(money(sp.price_uzs) + " сум"), facts);
    const hist = norm(await page.textContent("#pc-history"));
    check("RU: history in Russian (reason word, state words)", /Первичная загрузка/.test(hist) && /Продано/.test(hist) && /В наличии → Продано/.test(hist), hist);
    check("RU: ticket link and Void tag", /Чек D-0000/.test(norm(await page.textContent("#pc-history li a"))) && /Аннулирован/.test(norm(await page.textContent("#pc-sales"))) &&
      /Учебный/.test(norm(await page.textContent("#pc-sales"))));
    const ins = pieceOf("in_stock");
    await openId(page, ins.piece_id);
    check("RU: the action buttons", (await actionLabels(page)).join() === "Резервировать,Выдать,Повреждено", (await actionLabels(page)).join());
    await page.click('#pc-actions button[data-act="reserved"]');
    await page.fill("#pf-client", "DLD-9001");
    await page.click("#pf-submit");
    await page.waitForSelector("#confirm-dialog");
    check("RU: the confirm", norm(await page.textContent("#confirm-dialog h3")) === "Резервировать " + ins.serial + "?", norm(await page.textContent("#confirm-dialog h3")));
    await page.click("#confirm-cancel");
    await page.click("#pf-cancel");
    await page.click('#pc-actions button[data-act="booked_out"]');
    await page.click("#pf-submit");
    check("RU: the empty-note refusal", /Напишите, у кого изделие и зачем\./.test(await page.textContent("#pf-err")));
    await page.evaluate(() => setLang("en"));
    await page.waitForFunction(() => document.documentElement.lang === "en");
    check("lang: switching with the panel open redraws it in English", /Serial/.test(norm(await page.textContent("#pc-facts"))));
    await shot(page, "piece-ru");
    check("RU: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });
  for (const vp of [{ width: 768, height: 1024 }, { width: 500, height: 800 }]) {
    await run("piece panel widths " + vp.width, async () => {
      const { ctx, page, errors } = await setup(browser, vp);
      await settled(page);
      await page.click(".kit-lang .kit-hbtn[lang=ru]");
      await settled(page);
      const sp = pieceOf("sold");
      await openId(page, sp.piece_id);
      const w = await page.$eval("#piece-panel .panel", (n) => Math.round(n.getBoundingClientRect().width));
      check(`piece panel ${vp.width}: width ${vp.width < 600 ? "is the full width" : "is 560"}`, w === (vp.width < 600 ? vp.width : 560), String(w));
      // the list behind the panel is built for iPad widths; under 600 only the panel itself is held to it
      const pageOk = async () => vp.width < 600 || (await noHScroll(page));
      check(`piece panel ${vp.width}: no sideways scroll`, (await pageOk()) && await page.$eval("#piece-panel .panel", (n) => n.scrollWidth <= n.clientWidth + 1));
      const long = pieceOf("in_stock", (p) => p.model_name === mock.LONG_NAME);
      if (long) {
        await openId(page, long.piece_id);
        check(`piece panel ${vp.width}: the 60-character model name does not scroll sideways`, await page.$eval("#piece-panel .panel", (n) => n.scrollWidth <= n.clientWidth + 1));
      }
      await openId(page, pieceOf("in_stock").piece_id);
      await page.click('#pc-actions button[data-act="reserved"]');
      const small = await page.evaluate(() => [...document.querySelectorAll("#piece-panel button, #piece-panel input, #piece-panel textarea")]
        .filter((n) => { const r = n.getBoundingClientRect(); return r.width && r.height < 43.5; }).map((n) => n.id || n.className));
      check(`piece panel ${vp.width}: controls are 44 px targets`, small.length === 0, small.join());
      check(`piece panel ${vp.width}: no sideways scroll with the form open`, (await pageOk()) && await page.$eval("#piece-panel .panel", (n) => n.scrollWidth <= n.clientWidth + 1));
      check(`piece panel ${vp.width}: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }

  await run("kit css", async () => {
    const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "..", "..", "..", "qa", "kit.cjs")], { encoding: "utf8" });
    check("kit: node qa/kit.cjs exits 0", r.status === 0, (r.stderr || r.stdout).trim().split("\n")[0]);
  });

  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
