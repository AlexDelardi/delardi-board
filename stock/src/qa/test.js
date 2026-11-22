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
// tags (in the given scope) whose text breaks onto a second line
const wrappedTags = (page, scope) => page.evaluate((sc) => [...document.querySelectorAll(sc + " .tag")].filter((t) => {
  const r = document.createRange(); r.selectNodeContents(t);
  return r.getClientRects().length > 1 || t.getBoundingClientRect().height > 30;
}).map((t) => t.textContent.trim() + ":" + Math.round(t.getBoundingClientRect().height) + "/" + (() => { const r = document.createRange(); r.selectNodeContents(t); return r.getClientRects().length; })()), scope);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const listCalls = () => mock.calls.filter((c) => c.action === "list");
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false });
}
const categoryOf = (k) => { const t = String(k).replace(/_/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
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
    check("header: Tools lists 6 tools, Stock current (not a link)", items.join() === "Sales,Stock,Clients,Catalogue,Board,Performance" &&
      current.join() === "Stock" && !(await page.$(".kit-menu a[href='../stock/']")), items.join() + " / " + current.join());
    check("header: EN/RU pair, EN pressed", await page.evaluate(() =>
      [...document.querySelectorAll(".kit-head .kit-lang .kit-hbtn")].map((b) => b.textContent + ":" + b.getAttribute("aria-pressed")).join() === "EN:true,RU:false"));
    // tabs
    const tabs = await page.$$eval(".kit-tabs .kit-tab", (ns) => ns.map((n) => n.textContent.trim() + (n.getAttribute("aria-current") === "page" ? "*" : "")));
    check("tabs: Pieces (current), Review with its count, and Import for a login that can change stock", tabs.join() === "Pieces*,Review (5),Import", tabs.join());
    check("routes: the default is #/pieces", await page.evaluate(() => route().name === "pieces"));
    await page.click(".kit-tabs .kit-tab >> text=Review");
    await page.waitForSelector("#screen-review");
    check("routes: #/review shows the review screen, Review current", /#\/review$/.test(page.url()) &&
      /^Review/.test(norm(await page.textContent(".kit-tabs .kit-tab[aria-current=page]"))));
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
    const heads = await page.$$eval(".tbl thead th", (ns) => ns.map((n) => n.textContent.replace(/[↕↑↓▾]/g, "").trim()));   // without the sort arrow and the checklist ▾
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

  await run("totals: money never breaks inside the number", async () => {
    for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
      const { ctx, page, errors } = await setup(browser, vp);
      await settled(page);
      const m = await page.$$eval("#totals .tot", (ns) => ns.map((n) => {
        const a = n.querySelector(".t-amt"), r = n.getBoundingClientRect(), l = n.querySelector(".lbl").getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(a).lineHeight) || 0;
        return { state: n.dataset.state, oneLine: !!a && a.getBoundingClientRect().height <= lh + 1, top: Math.round(l.top - r.top), h: Math.round(r.height), rowTop: Math.round(r.top),
          noWrapCss: getComputedStyle(a).whiteSpace, text: n.querySelector(".t-v").textContent };
      }));
      check(`totals ${vp.width}: every amount sits on one line`, m.length > 0 && m.every((c) => c.oneLine), JSON.stringify(m.filter((c) => !c.oneLine)));
      check(`totals ${vp.width}: the number never wraps (white-space: nowrap)`, m.every((c) => c.noWrapCss === "nowrap"));
      check(`totals ${vp.width}: the amount reads "<number> so'm"`, m.every((c) => /^\d{1,3}( \d{3})* so'm$/.test(c.text.replace(/\s+/g, " ").trim())), m.map((c) => c.text).join("|"));
      const rows = {};
      for (const c of m) (rows[c.rowTop] = rows[c.rowTop] || []).push(c);
      check(`totals ${vp.width}: cards in a row have equal height and contents start at the top`, Object.values(rows).every((r) => r.every((c) => c.h === r[0].h && c.top === r[0].top)), JSON.stringify(rows));
      check(`totals ${vp.width}: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
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

  await run("pager: the last row of the last page leaves", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    mock.pieces.splice(51);                           // 51 pieces: page 2 holds one
    await settled(page);
    await page.evaluate(() => loadList());
    await page.waitForFunction(() => !S.listBusy && /51 pieces/.test(document.querySelector("#pager").textContent));
    await page.click("#pg-next");
    await page.waitForFunction(() => S.page === 2 && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 1);
    mock.pieces.pop();                                // a change moves it out: 50 pieces, one page
    const calls0 = listCalls().length;
    await page.evaluate(() => loadList());
    await page.waitForFunction(() => S.page === 1 && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50, null, { timeout: 4000 }).catch(() => {});
    const asked = listCalls().slice(calls0).map((c) => c.filters.page).join();
    check("pager: an empty page past the end falls back to the last page, rows shown", (await rowCount(page)) === 50 && await page.evaluate(() => S.page === 1), asked);
    check("pager: it asked page 2, then page 1, once", asked === "2,1", asked);
    check("pager: Page 1 of 1, no empty-state text", norm(await page.textContent("#pager .pg-n")) === "Page 1 of 1" && !/No pieces match/.test(await page.textContent("#rows")));
    check("pager: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("pieces without a catalogue model", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    const bare = (n, brand) => ({ piece_id: "00000000-0000-4000-8000-00000000099" + n, serial: "ZZ.00.9900" + n, barcode: null, brand,
      article: null, collection: null, model_name: null, colour: null, size: null, category: null, state: "in_stock",
      state_since: new Date(Date.now() - 86400000).toISOString(), price_uzs: null, hold_client_id: null, hold_until: null,
      state_note: null, shipped_on: null, first_seen_at: new Date().toISOString(), model: null });
    const withBrand = bare("1", "Zz Watchmaker"), nothing = bare("2", null);
    mock.pieces.push(withBrand, nothing);
    await settled(page);
    await page.fill("#f-q", "ZZ.00.9900");
    await page.waitForFunction(() => document.querySelectorAll("#rows tr.prow").length === 2 && !S.listBusy);
    const cellsOf = (id) => page.$$eval(`#rows tr[data-id="${id}"] td`, (ns) => ns.map((n) => n.textContent.replace(/\s+/g, " ").trim()));
    const a = await cellsOf(withBrand.piece_id), b = await cellsOf(nothing.piece_id);
    check("no model: the row shows — for reference, size, price; the serial and the state stay", a[0] === withBrand.serial && a[1] === "Zz Watchmaker" && a[2] === "—" && a[3] === "—" && a[4] === "In stock" && a[6] === "—", a.join("|"));
    check("no model, no brand: the brand cell shows —", b[0] === nothing.serial && b[1] === "—" && b[2] === "—", b.join("|"));
    await page.click(`#rows tr[data-id="${withBrand.piece_id}"]`);
    await page.waitForSelector("#pc-title");
    check("no model: the panel opens, the title is the brand", norm(await page.textContent("#pc-title")) === "Zz Watchmaker" && (await page.textContent("#pc-facts")).includes(withBrand.serial));
    await page.click("#piece-close");
    await page.waitForFunction(() => !document.querySelector("#piece-panel"));
    await page.click(`#rows tr[data-id="${nothing.piece_id}"]`);
    await page.waitForSelector("#pc-title");
    check("no model, no brand: the panel title falls back to the serial", norm(await page.textContent("#pc-title")) === nothing.serial, norm(await page.textContent("#pc-title")));
    const facts = norm(await page.textContent("#pc-facts"));
    check("no model: the empty facts show —, no 'null' or 'undefined' on screen", !/null|undefined/.test(await page.textContent("#piece-panel")) && /Reference—/.test(facts) && /Price—/.test(facts), facts);
    check("no model: no script errors", errors.length === 0, errors.join(" | "));
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
      const tagsEvery = async (lang) => {
        const bad = [];
        for (const st of ["", "in_stock", "reserved", "booked_out", "in_transit", "damaged", "not_received", "sold"]) {
          await page.selectOption("#f-state", st);
          await page.waitForFunction((x) => S.filters.state === x && !S.listBusy, st);
          bad.push(...(await wrappedTags(page, "#rows td.st")));
        }
        check(`widths ${vp.width}×${vp.height} ${lang}: state tags in the list stay on one line`, bad.length === 0, bad.join());
        check(`widths ${vp.width}×${vp.height} ${lang}: still no sideways scroll`, await noHScroll(page));
        await page.selectOption("#f-state", "");
        await page.waitForFunction(() => S.filters.state === "" && !S.listBusy);
      };
      await tagsEvery("EN");
      await page.click(".kit-head [data-kit-menu] > button");
      check(`widths ${vp.width}×${vp.height}: no sideways scroll with Tools open`, await noHScroll(page));
      await page.click(".kit-head [data-kit-menu] > button");
      await page.click(".kit-lang .kit-hbtn[lang=ru]");
      await settled(page);
      check(`widths ${vp.width}×${vp.height}: no sideways scroll in RU`, await noHScroll(page));
      await tagsEvery("RU");
      const small = await page.evaluate(() => [...document.querySelectorAll("#main button, #main select, #main input")]
        .filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.height < 43.5); }).map((n) => n.id || n.className));
      check(`widths ${vp.width}×${vp.height}: controls are 44 px targets`, small.length === 0, small.join());
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
    check("RU: tabs Изделия / Проверка / Импорт", tabs.join() === "Изделия,Проверка (5),Импорт", tabs.join());
    const heads = await page.$$eval(".tbl thead th", (ns) => ns.map((n) => n.textContent.replace(/[↕↑↓▾]/g, "").trim()));   // without the sort arrow and the checklist ▾
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
    check("hooks: STATE_WORDS has the seven states and training's In transfer", tags.length === 8 && tags[7] === "in_transfer:tag info:In transfer", tags.join());
    tags.pop();
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
    // Codex (PR #11): a refund line is labelled and shown negative, never as another sale
    const rfp = mock.pieces[3];
    await openId(page, rfp.piece_id);
    const fs2 = await page.$$eval("#pc-sales li", (ns) => ns.map((n) => ({ t: n.textContent.replace(/[\s\u00a0\u202f]+/g, " ").trim(), tags: [...n.querySelectorAll(".tag")].map((x) => x.textContent.trim()) })));
    check("sales: a refund line carries a Refund tag and a negative amount", fs2.length === 2 && fs2[1].tags.includes("Refund") && /[−-]12 000 000 so'm/.test(fs2[1].t)
      && !fs2[0].tags.includes("Refund") && /(^|[^−-])12 000 000 so'm/.test(fs2[0].t), JSON.stringify(fs2));
    await openId(page, mock.pieces[12].piece_id);
    check("reviews: an open review shows the import's note", norm(await page.textContent("#pc-reviews")).includes("Ticket D-000777 line 1"), norm(await page.textContent("#pc-reviews")));
    // open reviews
    const rp = mock.pieces[0];
    await openId(page, rp.piece_id);
    const rv = norm(await page.textContent("#pc-reviews"));
    check("reviews: open review kind word and raised date", /Missing from the stock export/.test(rv) && /\d{1,2} [A-Z][a-z]{2} 2026/.test(rv), rv);
    // closing
    await page.click("#piece-close");
    check("close: the × closes the panel", !(await page.$("#piece-panel")));
    await openId(page, rp.piece_id);
    await page.keyboard.press("Escape");
    check("close: Escape closes the panel", !(await page.$("#piece-panel")));
    await openId(page, rp.piece_id);
    await page.mouse.click(100, 400);
    check("close: the scrim closes the panel", !(await page.$("#piece-panel")));
    check("panel: no request leaves for anything but stock-api", foreign.length === 0, foreign.join(" "));
    check("panel: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("piece panel: Colibri format, origin and cost", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const full = mock.pieces[0], part = mock.pieces[1], bare = mock.pieces[2];
    const tabs = () => page.$$eval("#pc-tabs [role=tab]", (ns) => ns.map((n) => n.textContent.trim() + (n.getAttribute("aria-selected") === "true" ? "*" : "")));
    const facts = (sel) => page.$$eval(sel + " .pc-fact", (ns) => Object.fromEntries(ns.map((n) => [n.querySelector("dt").textContent.trim(), n.querySelector("dd").textContent.replace(/[\s  ]+/g, " ").trim()])));
    const calls = (a) => mock.calls.filter((c) => c.action === a).length;
    await openId(page, full.piece_id);
    check("tabs: Overview is selected; Colibri format and Origin & cost follow", (await tabs()).join() === "Overview*,Colibri format,Origin & cost", (await tabs()).join());
    check("tabs: nothing extra is asked for until a tab is opened", calls("origin") === 0 && calls("cost") === 0);
    await page.click("#pc-tab-colibri");
    await page.waitForSelector("#pc-colibri .pc-fact");
    let f = await facts("#pc-colibri");
    const keys = Object.keys(f);
    check("colibri: Colibri's own headings, in Colibri's order", keys[0] === "Бренд" && keys[1] === "Линия продукции" && keys[2] === "Артикул" && keys[3] === "Серийный номер"
      && keys.indexOf("Штрих Код") > keys.indexOf("Цена продажи, долл") && keys.includes("Путь для сайта"), keys.slice(0, 6).join());
    check("colibri: values as Colibri has them, zero included", f["Штрих Код"] === "6000000000017" && f["НДС"] === "0" && f["Коэф-т 1"] === "2.31" && f["Отправлять в ККМ"] === "Нет", JSON.stringify(f).slice(0, 300));
    check("colibri: a column Colibri left empty reads TBD", f["СФ номер"] === "TBD" && f["Бух-код"] === "TBD");
    check("colibri: a column we do not know yet is still shown, at the end", keys[keys.length - 1] === "Склад (старое поле)" && f["Склад (старое поле)"] === "A1", keys.slice(-2).join());
    check("colibri: says it is Colibri's data and which file", /Colibri/.test(norm(await page.textContent("#pc-colibri-note"))) && /T2 receipt export\.xlsx/.test(await page.textContent("#pc-colibri-note")));
    check("colibri: the overview blocks are not on this tab", !(await page.$("#pc-history")) && !(await page.$("#pc-actions")));
    await page.click("#pc-tab-origin");
    await page.waitForSelector("#pc-origin .pc-fact");
    f = await facts("#pc-origin");
    check("origin: supplier, contract, invoice, arrival", f["Supplier"] === "T2 Supplier SpA" && f["Contract"] === "No. T2-01" && f["Supplier invoice"] === "INV-77"
      && /1 Oct 2026/.test(f["Invoice date"]) && /14 Oct 2026/.test(f["Arrival date"]) && f["Currency"] === "EUR", JSON.stringify(f));
    check("origin: unknown values read TBD", f["Customs declaration"] === "TBD" && f["ИКПУ"] === "TBD" && f["HS code"] === "7113190000", JSON.stringify(f));
    const codes = await page.$$eval("#pc-codes li", (ns) => ns.map((n) => n.textContent.replace(/\s+/g, " ").trim()));
    check("origin: codes with their kind; a retired one is marked", codes.length === 2 && /6000000000017/.test(codes[0]) && /Colibri barcode/.test(codes[0]) && !/Retired/.test(codes[0])
      && /ERA-OLD-1/.test(codes[1]) && /Era barcode/.test(codes[1]) && /Retired/.test(codes[1]), codes.join(" | "));
    f = await facts("#pc-cost");
    const net = Math.round(full.price_uzs / 1.12);
    check("cost: invoice price with its currency, the landed-cost parts and landed cost", f["Invoice price"] === "743.11 EUR" && f["Invoice value"] === "6 500 000 so'm"
      && f["VAT paid at customs"] === "130 000 so'm" && f["Landed cost"] === "6 665 000 so'm", JSON.stringify(f));
    check("cost: shelf price, price without VAT and the estimated margin", f["Shelf price"] === money(full.price_uzs) + " so'm" && f["Price without VAT (12%)"] === money(net) + " so'm"
      && f["Estimated margin"].startsWith(money(net - 6665000) + " so'm") && /%/.test(f["Estimated margin"]), JSON.stringify(f));
    check("cost: says the cost is estimated", (await page.$eval("#pc-cost-quality", (n) => n.textContent.trim())) === "Estimated");
    check("tabs: each block is asked for once", calls("origin") === 1 && calls("cost") === 1, calls("origin") + "/" + calls("cost"));
    await page.click("#pc-tab-overview");
    check("tabs: back on Overview the history is there again", !!(await page.$("#pc-history")) && !(await page.$("#pc-origin")));
    // a piece with a Colibri record only
    await openId(page, part.piece_id);
    check("tabs: another piece opens on Overview", (await tabs())[0] === "Overview*");
    await page.click("#pc-tab-origin");
    await page.waitForSelector("#pc-origin .pc-fact");
    f = await facts("#pc-origin");
    check("origin: nothing recorded reads TBD throughout", Object.values(f).every((v) => v === "TBD") && Object.keys(f).length >= 9, JSON.stringify(f));
    check("origin: no codes reads TBD", norm(await page.textContent("#pc-codes")) === "TBD");
    f = await facts("#pc-cost");
    check("cost: unknown cost is TBD, margin too; the shelf price is still shown", f["Landed cost"] === "TBD" && f["Estimated margin"] === "TBD" && f["Invoice price"] === "TBD"
      && (await page.$eval("#pc-cost-quality", (n) => n.textContent.trim())) === "TBD", JSON.stringify(f));
    // a piece with no Colibri record
    await openId(page, bare.piece_id);
    await page.click("#pc-tab-colibri");
    await page.waitForSelector("#pc-colibri-none");
    check("colibri: no record says so and shows no columns", /No Colibri record/.test(await page.textContent("#pc-colibri-none")) && !(await page.$("#pc-colibri .pc-fact")));
    // Russian
    await page.evaluate(() => setLang("ru"));
    check("ru: tab names", (await tabs()).join() === "Обзор,Формат Colibri*,Происхождение и себестоимость", (await tabs()).join());
    await page.click("#pc-tab-origin");
    await page.waitForSelector("#pc-cost .pc-fact");
    f = await facts("#pc-origin");
    check("ru: origin labels and TBD", "Поставщик" in f && "Дата прихода" in f && "Код ТН ВЭД" in f && f["Поставщик"] === "TBD", Object.keys(f).join());
    f = await facts("#pc-cost");
    check("ru: cost labels", "Себестоимость с расходами" in f && "Оценочная маржа" in f && "Цена на полке" in f, Object.keys(f).join());
    await page.evaluate(() => setLang("en"));
    check("enrichment: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // without the cost right: no cost block, and cost is never asked for
    for (const pass of ["look", "nocrm"]) {
      const t = await setup(browser, { width: 1024, height: 768 }, { pass });
      await settled(t.page);
      await openId(t.page, full.piece_id);
      await t.page.click("#pc-tab-origin");
      await t.page.waitForSelector("#pc-origin .pc-fact");
      check("cost: hidden without the cost right (" + pass + ")", !(await t.page.$("#pc-cost")) && !/Landed|margin|6 665 000/i.test(await t.page.textContent("#piece-panel"))
        && (await t.page.$eval("#pc-tab-origin", (n) => n.textContent.trim())) === "Origin");
      await t.page.click("#pc-tab-colibri");
      await t.page.waitForSelector("#pc-colibri .pc-fact");
      const ck = await t.page.$$eval("#pc-colibri .pc-fact dt", (ns) => ns.map((n) => n.textContent.trim()));
      check("colibri: purchase-price columns are not shown without the cost right (" + pass + ")", !ck.some((k) => /инвойса|Инв\. цена|Коэф|Цена в СФ/.test(k)) && ck.includes("Рек. цена, долл") && ck.includes("Штрих Код")
        && !/983\.15|875|2\.31/.test(await t.page.textContent("#pc-colibri")), ck.join());
      check("cost: never requested without the cost right (" + pass + ")", calls("cost") === 0 && calls("origin") === 1);
      const og = mock.handle({ action: "origin", token: mock.handle({ action: "unlock", passcode: pass })[1].token, piece_id: full.piece_id })[1];
      check("colibri: nor sent by the API (" + pass + ")", !("Инв. цена, долл" in og.colibri.data) && !("Коэф-т 1" in og.colibri.data) && "Цена продажи, долл" in og.colibri.data);
      await t.ctx.close();
    }
    // the mock refuses cost to a login without the right, as the API does
    const tk = mock.handle({ action: "unlock", passcode: "look" })[1].token;
    const refused = mock.handle({ action: "cost", token: tk, piece_id: full.piece_id });
    check("cost: the API refuses cost without the right", refused[0] === 403 && /cannot see cost/.test(refused[1].error), JSON.stringify(refused));
    // a failed load shows a notice with a way to try again
    const t = await setup(browser, { width: 1024, height: 768 });
    await settled(t.page);
    await openId(t.page, full.piece_id);
    mock.failNext = "origin";
    await t.page.click("#pc-tab-colibri");
    await t.page.waitForSelector("#pc-more-err");
    check("load failure: a notice, no columns", !(await t.page.$("#pc-colibri .pc-fact")) && /Could not load/.test(await t.page.textContent("#pc-more-err")));
    await t.page.click("#pc-more-retry");
    await t.page.waitForSelector("#pc-colibri .pc-fact");
    check("load failure: Try again loads it", !(await t.page.$("#pc-more-err")));
    await t.ctx.close();
  });

  await run("import guide: what to fill and how", async () => {
    const FX = (n) => path.join(__dirname, "fixtures", n);
    const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 });
    await settled(page);
    await page.click("#tab-import");
    await page.waitForSelector("#imp-guide");
    check("guide: open before any file is chosen", await page.$eval("#imp-guide", (d) => d.open === true));
    const steps = await page.$$eval("#imp-guide-steps > li", (ns) => ns.map((n) => n.textContent.replace(/\s+/g, " ").trim()));
    check("guide: five numbered steps", steps.length === 5, String(steps.length));
    check("guide: the three required cells are named by their headings", /Бренд/.test(steps[1]) && /Артикул/.test(steps[1]) && /Серийный номер/.test(steps[1]), steps[1]);
    check("guide: says the file does not add pieces, Colibri does", /Colibri/.test(steps[3]) && /does not add/i.test(steps[3]), steps[3]);
    const cols = await page.$$eval("#imp-guide-cols tbody tr", (rs) => rs.map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, " ").trim())));
    const ours = await page.evaluate(() => UPLOAD_OURS.map((c) => c[0]));
    check("guide: one row for each of our 19 columns, in file order, with its letter", cols.length === 19 && cols.map((c) => c[1]).join("|") === ours.join("|")
      && cols[0][0] === "AL" && cols[18][0] === "BD", cols.map((c) => c[0] + " " + c[1]).join("|"));
    check("guide: every column says what to write and gives an example", cols.every((c) => c.length === 4 && c[2].length > 8 && c[3].length > 0), JSON.stringify(cols.find((c) => !(c.length === 4 && c[2].length > 8 && c[3].length > 0))));
    check("guide: the formats the server checks are stated", /10 digits/.test(cols[0][2]) && /17 digits/.test(cols[1][2]) && /date/i.test(cols[5][2]) && /date/i.test(cols[7][2]));
    const rules = norm(await page.textContent("#imp-guide-rules"));
    check("guide: the rules: TBD, never overwrites, one error stops the file", /TBD/.test(rules) && /never overwrit/i.test(rules) && /nothing is loaded/i.test(rules), rules);
    check("guide 768: no sideways scroll", await noHScroll(page));
    await shot(page, "g01-import-guide");
    await page.setInputFiles("#imp-file", FX("upload_ok.xlsx"));
    await page.waitForSelector("#imp-rows");
    check("guide: folded away once a file is previewed, still there to open", await page.$eval("#imp-guide", (d) => d.open === false));
    await page.click("#imp-guide > summary");
    check("guide: opens again on a click, and the preview stays", await page.evaluate(() => document.querySelector("#imp-guide").open && !!document.querySelector("#imp-rows")));
    await page.click('.kit-lang button[lang="ru"]');
    await page.waitForFunction(() => /Как заполнить/.test(document.querySelector("#imp-guide > summary").textContent));
    const ru = await page.$$eval("#imp-guide-cols tbody tr", (rs) => rs.map((r) => r.cells[2].textContent.trim()));
    check("guide RU: the steps and every column note are in Russian", ru.length === 19 && ru.every((t) => /[а-яё]/i.test(t)) && /Скачайте/.test(await page.textContent("#imp-guide-steps")), ru.find((t) => !/[а-яё]/i.test(t)));
    check("guide: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("import: upload file with preview", async () => {
    const FX = (n) => path.join(__dirname, "fixtures", n);
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 900 });
    await settled(page);
    const tabs = () => page.$$eval(".kit-tabs .kit-tab", (ns) => ns.map((n) => n.textContent.trim()));
    check("import: a tab for a login that can change stock", (await tabs()).join() === "Pieces,Review (5),Import", (await tabs()).join());
    await page.click("#tab-import");
    await page.waitForSelector("#screen-import");
    check("import: says what the file is; nothing previewed yet", /A–AK/.test(await page.textContent("#imp-help")) && !(await page.$("#imp-rows")) && !(await page.$("#imp-apply")));
    // the template: Colibri's 37 headings in order, then ours; and the page reads its own file back
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#imp-template")]);
    const tpl = path.join(require("os").tmpdir(), "stock-template-" + process.pid + ".xlsx");
    await dl.saveAs(tpl);
    check("template: file name", dl.suggestedFilename() === "Delardi_upload_template_v1.xlsx", dl.suggestedFilename());
    const head = await page.evaluate(async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return (await kitXlsxRead(u.buffer))[0]; }, fs.readFileSync(tpl).toString("base64"));
    check("template: 37 Colibri headings then 19 of ours", head.length === 56 && head[0] === "Бренд" && head[3] === "Серийный номер" && head[19] === "Штрих Код" && head[36] === "Путь для сайта"
      && head[37] === "Код ТН ВЭД" && head[38] === "ИКПУ" && head[44] === "Дата прихода" && head[55] === "Магазин", head.length + " " + head.slice(35, 40).join("|"));
    const z = require("child_process").spawnSync("python3", ["-m", "zipfile", "-t", tpl], { encoding: "utf8" });
    check("template: a valid workbook archive", z.status === 0, (z.stderr || z.stdout || "").trim());
    // a good file
    await page.setInputFiles("#imp-file", FX("upload_ok.xlsx"));
    await page.waitForSelector("#imp-rows");
    const sent = mock.calls.filter((c) => c.action === "import").pop();
    check("preview: asked as a preview, with the file name", sent.apply === false && sent.file_name === "upload_ok.xlsx" && sent.rows.length === 3, JSON.stringify({ a: sent.apply, n: sent.rows.length }));
    const r0 = sent.rows[0];
    check("read: row numbers are the sheet's; the empty row is skipped", sent.rows.map((r) => r.row).join() === "2,4,5");
    check("read: Colibri cells by heading, numbers as numbers, zero kept, blanks left out", r0.colibri["Бренд"] === "Zz Atelier" && r0.colibri["Цена оригинального инвойса"] === 875.5
      && r0.colibri["Коэф-т 1"] === 2.31 && r0.colibri["НДС"] === 0 && !("Состав" in r0.colibri) && Object.keys(r0.colibri).length === 9, JSON.stringify(r0.colibri));
    check("read: our columns by key; a date cell and a typed 14.10.2026 both become 2026-10-14; TBD passes through", r0.extra.hs_code === "7113190000" && r0.extra.ikpu === "TBD"
      && r0.extra.invoice_date === "2026-10-01" && r0.extra.arrival_date === "2026-10-14" && r0.extra.metal_purity === "750" && r0.extra.name_uz === "Uzuk"
      && sent.rows[2].extra.arrival_date === "2026-10-14" && !("store" in r0.extra), JSON.stringify(r0.extra));
    const cards = () => page.$$eval("#imp-summary .imp-card", (ns) => ns.map((n) => n.querySelector(".lbl").textContent.trim() + "=" + n.querySelector(".tc-n").textContent.trim()).join());
    check("preview: the four counts", (await cards()) === "Will update=2,No change=0,Waiting for the piece=1,Errors=0", await cards());
    const rows = () => page.$$eval("#imp-rows tbody tr", (ns) => ns.map((n) => ({ cls: n.className, cells: [...n.children].slice(0, 4).map((c) => c.textContent.trim()), tag: n.querySelector(".tag").textContent.trim(),
      msgs: [...n.querySelectorAll(".imp-msg")].map((m) => m.textContent.trim()) })));
    let rs = await rows();
    check("preview: one line per row with its sheet row, serial, brand and reference", rs.length === 3 && rs[0].cells.join("|") === "2|ZZ.00.10001|Zz Atelier|ZZ-AT-0100" && rs[2].cells[0] === "5", JSON.stringify(rs[0].cells));
    check("preview: what an update changes, in words", rs[0].tag === "Will update" && rs[0].msgs[0] === "9 Colibri fields · arrival document: new · brand barcode · HS code · item details", rs[0].msgs.join(" / "));
    check("preview: a value that differs from the one on file is reported, not overwritten", rs[1].msgs.some((m) => m === "Supplier differs from the arrival document on file (Older Supplier); kept."), rs[1].msgs.join(" / "));
    check("preview: a serial not in stock waits", rs[2].tag === "Waiting for the piece" && /kept and applied when the piece appears/.test(rs[2].msgs[0]));
    check("preview: the button says how many rows load", (await page.textContent("#imp-apply")).trim() === "Load 3 rows");
    // a row's serial opens the piece
    await page.click("#imp-rows tbody tr:first-child .linklike");
    await page.waitForSelector("#pc-title");
    check("preview: the serial opens the piece", /ZZ\.00\.10001/.test(await page.textContent("#piece-panel")));
    await page.keyboard.press("Escape");
    // Russian
    await page.evaluate(() => setLang("ru"));
    await page.waitForSelector("#imp-rows");
    rs = await rows();
    check("ru: tab, counts, result words", (await tabs())[2] === "Импорт" && /Будет обновлено=2/.test(await cards()) && rs[0].tag === "Будет обновлено" && /полей Colibri: 9/.test(rs[0].msgs[0])
      && (await page.textContent("#imp-apply")).trim() === "Загрузить строк: 3", rs[0].msgs[0]);
    await page.evaluate(() => setLang("en"));
    // load
    await page.click("#imp-apply");
    await page.waitForSelector("#imp-done");
    const ap = mock.calls.filter((c) => c.action === "import").pop();
    check("load: the same rows are sent with apply", ap.apply === true && ap.rows.length === 3 && ap.file_name === "upload_ok.xlsx");
    check("load: says what happened; the preview is gone", (await page.textContent("#imp-done")).trim() === "Loaded: 2 updated, 1 waiting for their pieces." && !(await page.$("#imp-rows")) && !(await page.$("#imp-apply")));
    await page.waitForSelector("#imp-waiting-rows tbody tr");
    check("load: the waiting rows are announced with a way to check", /Rows from earlier files waiting for their pieces: 1/.test(await page.textContent("#imp-waiting")) && !!(await page.$("#imp-check")));
    // the waiting rows are listed: which piece, from which file, loaded by whom
    const wait = await page.$$eval("#imp-waiting-rows tbody tr", (rs) => rs.map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, " ").trim())));
    const pend = ap.rows.find((r) => !mock.pieces.some((q) => q.serial.toUpperCase() === String(r.colibri["Серийный номер"]).toUpperCase()));
    check("waiting: one row with brand, serial, reference, file and who loaded it", wait.length === 1 && wait[0][0] === pend.colibri["Бренд"] && wait[0][1] === pend.colibri["Серийный номер"]
      && wait[0][2] === pend.colibri["Артикул"] && wait[0][3] === "upload_ok.xlsx" && /Stock Manager/.test(wait[0][4]) && wait[0][5] === "Remove", JSON.stringify(wait));
    // Check now when nothing has arrived says so, instead of "applied to 0"
    await page.click("#imp-check");
    await page.waitForFunction(() => /Checked/.test((document.querySelector("#imp-done") || {}).textContent || ""));
    check("waiting: Check now with nothing arrived says none is in stock yet", (await page.textContent("#imp-done")).trim() === "Checked: none of the waiting pieces is in stock yet." && (await page.$$("#imp-waiting-rows tbody tr")).length === 1);
    // a row loaded by mistake can be removed
    await page.click("#imp-waiting-rows .imp-remove");
    await page.waitForSelector("#confirm-ok");
    check("waiting: Remove asks first and names the piece", (await page.textContent("#confirm-dialog")).includes(String(pend.colibri["Серийный номер"])));
    await page.click("#confirm-cancel");
    check("waiting: Cancel removes nothing", mock.calls.filter((c) => c.action === "import_remove").length === 0 && (await page.$$("#imp-waiting-rows tbody tr")).length === 1);
    await page.click("#imp-waiting-rows .imp-remove");
    await page.waitForSelector("#confirm-ok");
    await page.click("#confirm-ok");
    await page.waitForFunction(() => !document.querySelector("#imp-waiting"));
    const rm = mock.calls.filter((c) => c.action === "import_remove").pop();
    check("waiting: Remove sends the row's keys and the block goes", rm && typeof rm.brand_key === "string" && rm.serial_key === String(pend.colibri["Серийный номер"]).toUpperCase()
      && /Removed/.test(await page.textContent("#imp-done")), JSON.stringify(rm));
    // put it back for the checks below
    await page.setInputFiles("#imp-file", FX("upload_ok.xlsx"));
    await page.waitForSelector("#imp-apply");
    await page.click("#imp-apply");
    await page.waitForSelector("#imp-waiting-rows tbody tr");
    // the same file again: nothing to load
    await page.setInputFiles("#imp-file", FX("upload_ok.xlsx"));
    await page.waitForSelector("#imp-rows");
    check("again: already on file, and no Load button", (await cards()) === "Will update=0,No change=2,Waiting for the piece=1,Errors=0" && (await page.textContent("#imp-apply")).trim() === "Load 1 rows");
    // a file with errors cannot be loaded
    await page.setInputFiles("#imp-file", FX("upload_errors.xlsx"));
    await page.waitForSelector("#imp-blocked");
    rs = await rows();
    check("errors: counted, and no Load button", /Errors=5/.test(await cards()) && !(await page.$("#imp-apply")) && /Nothing is loaded while a row is in error/.test(await page.textContent("#imp-blocked")), await cards());
    check("errors: a serial twice in the file (case and brand spelling ignored)", rs[0].msgs.join() === "This serial number is in the file more than once." && rs[1].msgs.join() === rs[0].msgs.join());
    check("errors: a serial that is already on another reference", rs[2].msgs.join() === "This serial number is already on a piece with another reference (ZZ-AT-0100).", rs[2].msgs.join());
    check("errors: HS code and date formats", rs[3].msgs.join("|") === "HS code must be 10 digits.|Arrival date: not a date. Write it as 14.10.2026.", rs[3].msgs.join("|"));
    check("errors: a row without brand, serial or reference", rs[4].msgs.join("|") === "No brand.|No serial number.|No reference." && rs[4].cells.slice(1).join() === "—,—,—", rs[4].msgs.join("|"));
    check("errors: the rows are marked", rs.every((r) => r.tag === "Error" && /imp-error/.test(r.cls)));
    // wrong files
    await page.setInputFiles("#imp-file", FX("upload_wrong_headings.xlsx"));
    await page.waitForSelector("#imp-err");
    check("wrong headings: names the missing Colibri headings, asks the server nothing", (await page.textContent("#imp-err")).trim() === "These Colibri headings are missing: Артикул, Серийный номер" && !(await page.$("#imp-rows")));
    const before = mock.calls.filter((c) => c.action === "import").length;
    await page.setInputFiles("#imp-file", FX("not_a_workbook.xlsx"));
    await page.waitForFunction(() => /must be an \.xlsx/.test((document.querySelector("#imp-err") || {}).textContent || ""));
    check("not a workbook: says so", mock.calls.filter((c) => c.action === "import").length === before);
    // a server failure on load keeps the preview
    await page.setInputFiles("#imp-file", FX("upload_ok.xlsx"));
    await page.waitForSelector("#imp-apply");
    mock.failNext = "import";
    await page.click("#imp-apply");
    await page.waitForSelector("#imp-err");
    check("load failure: the error shows and the preview stays for another try", !!(await page.$("#imp-rows")) && !!(await page.$("#imp-apply")) && !(await page.$("#imp-done")));
    // Codex on #18: an answer for an earlier file never replaces the current one
    mock.delay.import = 900;
    await page.setInputFiles("#imp-file", FX("upload_errors.xlsx"));
    await page.waitForFunction(() => /Checking/.test((document.querySelector("#imp-busy") || {}).textContent || ""));
    await page.waitForTimeout(150);                 // the first file's request is out and held
    mock.delay.import = 0;
    await page.setInputFiles("#imp-file", FX("upload_ok.xlsx"));
    await page.waitForSelector("#imp-apply");
    await page.waitForTimeout(1200);
    check("stale answer: the later file's preview stays", (await page.textContent("#imp-file-name")).trim() === "File: upload_ok.xlsx" && !(await page.$("#imp-blocked")) && /Errors=0/.test(await cards()), await cards());
    delete mock.delay.import;
    // Codex on #18: a lock clears the file and its preview
    await page.click("header.top .kit-hbtn:has-text('Lock')");
    await page.waitForSelector("#gate-pass");
    check("lock: nothing of the file is left behind the card", !(await page.$("#imp-rows")) && !(await page.$("#imp-apply")));
    await page.fill("#gate-pass", "demo");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#gate-pass", { state: "detached" });
    await page.waitForSelector("#imp-template");
    check("lock: the next person finds no file, no preview and no Load", !(await page.$("#imp-rows")) && !(await page.$("#imp-apply")) && !(await page.$("#imp-file-name")));
    // the piece panel shows what the file said about the item
    await openId(page, mock.pieces[0].piece_id);
    await page.click("#pc-tab-origin");
    await page.waitForSelector("#pc-details .pc-fact");
    const det = await page.$$eval("#pc-details .pc-fact", (ns) => ns.map((n) => n.querySelector("dt").textContent.trim() + "=" + n.querySelector("dd").textContent.trim()).join());
    check("piece: item details from the upload file", det === "Category=Ring,Metal=White gold,Metal purity=750,Name (Uzbek)=Uzuk", det);
    check("import: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // without the manage right: no tab, no screen, and the API refuses
    const t = await setup(browser, { width: 1024, height: 768 }, { pass: "look" });
    await settled(t.page);
    check("rights: no Import tab without the manage right", !(await t.page.$("#tab-import")));
    await t.page.evaluate(() => { location.hash = "#/import"; });
    await t.page.waitForTimeout(300);
    check("rights: the address alone opens the list, not the import", !(await t.page.$("#screen-import")) && !!(await t.page.$("#rows")));
    const tk = mock.handle({ action: "unlock", passcode: "look" })[1].token;
    const refused = mock.handle({ action: "import", token: tk, rows: [{ row: 2, colibri: {}, extra: {} }], apply: true });
    check("rights: the API refuses an import without the manage right", refused[0] === 403, JSON.stringify(refused));
    await t.ctx.close();
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
    check("409: the database sentence is shown in the form, verbatim", norm(await page.textContent("#pf-err")) === "No client with that reference.", norm(await page.textContent("#pf-err")));
    check("409 RU: «Клиента с таким номером нет.»", await page.evaluate(() => RU["No client with that reference."] === "Клиента с таким номером нет."));
    check("409: the piece stays In stock after the refusal", mock.pieces.find((p) => p.piece_id === piece.piece_id).state === "in_stock");
    // a lower-case reference that exists is accepted and stored upper-case
    await page.fill("#pf-client", "dld-9001");
    await page.click("#pf-submit"); await page.click("#confirm-ok");
    await page.waitForFunction(() => /Reserved/.test(document.querySelector("#piece-panel .pc-state .tag").textContent) && !document.querySelector("#pc-form"));
    check("lower-case client: accepted, stored upper-case", mock.pieces.find((p) => p.piece_id === piece.piece_id).hold_client_id === "DLD-9001", String(mock.pieces.find((p) => p.piece_id === piece.piece_id).hold_client_id));
    await page.click('#pc-actions button[data-act="in_stock"]');
    await page.click("#pf-submit"); await page.click("#confirm-ok");
    await page.waitForFunction(() => /In stock/.test(document.querySelector("#piece-panel .pc-state .tag").textContent) && !document.querySelector("#pc-form"));
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

  await run("api timeout", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const lim = (v) => page.evaluate((x) => { window.__API_TIMEOUT_MS = x; return apiLimit(); }, v);
    check("timeout clamp: the override can only shorten the 20 s limit",
      (await lim(400)) === 400 && (await lim(999999)) === 20000 && (await lim(0)) === 20000 && (await lim(-5)) === 20000 && (await lim("abc")) === 20000 && (await lim(undefined)) === 20000 && (await lim(19999)) === 19999);
    await page.evaluate(() => { window.__API_TIMEOUT_MS = 400; });
    mock.delay.facets = 1500;
    let t0 = Date.now();
    let m = await page.evaluate(async () => { try { await api("facets"); return "no error"; } catch (e) { return e.message + "|" + e.status; } });
    check("timeout: a hung request throws the sentence after the limit, not after the answer", m.startsWith("The server did not answer. Try again.") && Date.now() - t0 < 1400, m + " " + (Date.now() - t0));
    await page.click(".kit-lang .kit-hbtn[lang=ru]");
    m = await page.evaluate(async () => { try { await api("facets"); return "no error"; } catch (e) { return e.message; } });
    check("timeout RU: «Сервер не ответил. Попробуйте ещё раз.»", m === "Сервер не ответил. Попробуйте ещё раз.", m);
    await page.click(".kit-lang .kit-hbtn[lang=en]");
    mock.delay.facets = 0;
    // a busy panel is released: the error shows, the panel can be closed
    const piece = mock.pieces.find((q) => q.state === "in_stock" && q.price_uzs !== null);
    await page.fill("#f-q", piece.serial);
    await page.waitForFunction((id) => document.querySelector(`#rows tr[data-id="${id}"]`), piece.piece_id);
    await page.click(`#rows tr[data-id="${piece.piece_id}"]`);
    await page.waitForSelector("#piece-panel");
    await page.click('#pc-actions button[data-act="reserved"]');
    mock.delay.set_state = 1500;
    await page.click("#pf-submit");
    await page.waitForSelector("#confirm-dialog");
    await page.click("#confirm-ok");
    await page.waitForFunction(() => /The server did not answer/.test((document.querySelector("#pf-err") || {}).textContent || ""), null, { timeout: 1200 });
    const busyErr = norm(await page.textContent("#pf-err"));
    const submitFree = await page.$eval("#pf-submit", (n) => !n.disabled);
    await page.click("#piece-close");
    await page.waitForFunction(() => !document.querySelector("#piece-panel"), null, { timeout: 1500 });
    check("timeout: the panel shows the sentence, the form is free again, and the panel closes", busyErr === "The server did not answer. Try again." && submitFree && !(await page.$("#piece-panel")), busyErr + " " + submitFree);
    mock.delay.set_state = 0;
    check("timeout: no script errors", errors.length === 0, errors.join(" | "));
    await page.waitForTimeout(1300);
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

  // ------------------------------------------------------- the review queue
  const KIND_EN = { missing_from_export: "Missing from the stock export", serial_reused: "Serial number reused", ticket_conflict: "Sale conflicts with stock",
    overdue_in_transit: "Overdue in transit", dropped_from_incoming: "Dropped from incoming" };
  const KIND_RU = { missing_from_export: "Нет в выгрузке остатков", serial_reused: "Серийный номер повторно", ticket_conflict: "Продажа противоречит остаткам",
    overdue_in_transit: "Задерживается в пути", dropped_from_incoming: "Выпало из поступлений" };
  const ANS_EN = { sold: "Sold", damaged: "Damaged", booked_out: "Booked out", still_in_stock: "Still in stock", still_in_transit: "Still in transit", not_delivered: "Not delivered" };
  const ANS_RU = { sold: "Продано", damaged: "Повреждено", booked_out: "Выдано", still_in_stock: "Есть в наличии", still_in_transit: "Всё ещё в пути", not_delivered: "Не поставлено" };
  const KIND_ANS = { missing_from_export: ["sold", "damaged", "booked_out", "still_in_stock"], serial_reused: ["sold", "damaged", "booked_out", "still_in_stock"],
    ticket_conflict: ["sold", "damaged", "booked_out", "still_in_stock"], overdue_in_transit: ["still_in_transit", "not_delivered"], dropped_from_incoming: ["still_in_transit", "not_delivered"] };
  const resolveCalls = () => mock.calls.filter((c) => c.action === "resolve");
  const rvRows = (page) => page.$$eval("#rv-rows tr.rrow", (ns) => ns.map((n) => ({ id: n.getAttribute("data-review"), cells: [...n.children].map((c) => (c.querySelector(".rk-word") || c).textContent.replace(/[\s  ]+/g, " ").trim()),
    note: n.querySelector(".rv-note") ? n.querySelector(".rv-note").textContent.trim() : null,
    answers: [...n.querySelectorAll("button[data-answer]")].map((b) => b.getAttribute("data-answer") + ":" + b.textContent.trim()) })));
  const rvTab = (page) => page.$eval("#tab-review", (n) => n.textContent.trim());
  const openReview = async (page) => { await page.click("#tab-review"); await page.waitForSelector("#rv-rows tr.rrow, #rv-empty"); };

  await run("review queue", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1280, height: 800 });
    await settled(page);
    check("review: the tab shows the count of open items right after login", (await rvTab(page)) === "Review (5)", await rvTab(page));
    await openReview(page);
    const rows = await rvRows(page);
    check("review: five rows, oldest first, one of each kind", rows.length === 5 && rows.map((r) => r.cells[0]).join("|") === Object.values(KIND_EN).join("|"), rows.map((r) => r.cells[0]).join("|"));
    const r1 = rows[0];
    const p0 = mock.pieces[0];
    check("review: a row lists the serial, Brand · Model, the state tag and the raised date",
      r1.cells[1].includes(p0.serial) && r1.cells[1].includes(p0.brand + " · " + p0.model_name) && r1.cells[2] === "In stock" && /^\d{1,2} [A-Z][a-z]{2} 2026$/.test(r1.cells[3]), JSON.stringify(r1.cells));
    // Codex (PR #11): the diagnostic note the import wrote is shown with the review, before anyone closes it
    check("review: the import's note is shown under the kind; none where there is none",
      rows[2].note === mock.reviews[2].note && rows[1].note === "Seen twice in the export" && rows[0].note === null, JSON.stringify(rows.map((r) => r.note)));
    check("review: the headings are Kind, Piece, State, Raised, Answer", (await page.$$eval("#rv-table thead th", (ns) => ns.map((n) => n.textContent.trim()))).join() === "Kind,Piece,State,Raised,Answer");
    const kinds = Object.keys(KIND_EN);
    check("review: each row offers exactly its kind's answers, in words", rows.every((r, i) => r.answers.join() === KIND_ANS[kinds[i]].map((a) => a + ":" + ANS_EN[a]).join()), JSON.stringify(rows.map((r) => r.answers)));
    check("review: the answer buttons are 44 px targets", await page.$$eval("#rv-rows button", (ns) => ns.every((n) => n.getBoundingClientRect().height >= 43.5)));
    // the piece opens the panel
    await page.click(`#rv-rows tr.rrow[data-review="1"] .rv-piece`);
    await page.waitForSelector("#piece-panel .panel #pc-title");
    check("review: clicking the piece opens the piece panel", (await page.textContent("#pc-label")).includes(p0.serial));
    await page.click("#piece-close");
    // an answer opens the note field; Cancel closes it
    await page.click('#rv-rows tr.rrow[data-review="1"] button[data-answer="still_in_stock"]');
    await page.waitForSelector("#rv-form");
    check("review: an answer opens a note field and Confirm under the row", !!(await page.$("#rv-note")) && /Confirm/.test(await page.textContent("#rv-confirm")));
    await page.click("#rv-cancel");
    check("review: Cancel closes it without a request", !(await page.$("#rv-form")) && resolveCalls().length === 0);
    // resolve with a note
    await page.click('#rv-rows tr.rrow[data-review="2"] button[data-answer="damaged"]');
    await page.fill("#rv-note", "Clasp found bent");
    await page.click("#rv-confirm");
    await page.waitForSelector("#confirm-dialog");
    check("review: Confirm asks \"Close this review?\"", /Close this review\?/.test(await page.textContent("#confirm-dialog")));
    await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelectorAll("#rv-rows tr.rrow").length === 4);
    const c = resolveCalls();
    check("review: resolve is sent with the review, the answer and the note", c.length === 1 && c[0].review_id === 2 && c[0].resolution === "damaged" && c[0].note === "Clasp found bent", JSON.stringify(c));
    check("review: the row is gone and the count drops", !(await page.$('tr.rrow[data-review="2"]')) && (await rvTab(page)) === "Review (4)", await rvTab(page));
    check("review: toast \"Review closed.\"", /Review closed\./.test(await page.textContent("#toast")));
    check("review: the resolution changed the piece (damaged) in the mock", mock.pieces[5].state === "damaged");
    // the list shows it too
    const before = listCalls().length;
    await page.click("#tab-pieces");
    await settled(page);
    check("review: the list is refreshed after a resolve", listCalls().length > before && /Damaged/.test(await page.textContent("#totals")));
    // 409 keeps the row
    await openReview(page);
    await page.click('#rv-rows tr.rrow[data-review="1"] button[data-answer="sold"]');
    await page.click("#rv-confirm");
    await page.click("#confirm-ok");
    await page.waitForSelector(".rv-err:not([hidden])");
    check("review: a 409 shows the database sentence verbatim under the row", norm(await page.textContent(".rv-err")) === "state in_stock → sold is not allowed", await page.textContent(".rv-err"));
    check("review: and keeps the row and the count", (await rvRows(page)).length === 4 && (await rvTab(page)) === "Review (4)");
    check("review: and reloads the reviews", mock.calls.filter((x) => x.action === "reviews").length >= 4);
    // in-transit kinds
    await page.click('#rv-rows tr.rrow[data-review="4"] button[data-answer="not_delivered"]');
    await page.fill("#rv-note", "Supplier confirms it did not ship");
    await page.click("#rv-confirm");
    await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelectorAll("#rv-rows tr.rrow").length === 3);
    check("review: Not delivered closes an overdue-in-transit item", mock.pieces[40].state === "not_received" && (await rvTab(page)) === "Review (3)");
    // resolving from a piece that is open in the panel reloads it
    await page.click('#rv-rows tr.rrow[data-review="3"] .rv-piece');
    await page.waitForSelector("#pc-title");
    check("review: the open piece panel lists the review", /Sale conflicts with stock/.test(await page.textContent("#pc-reviews")));
    await page.$eval('#rv-rows tr.rrow[data-review="3"] button[data-answer="still_in_stock"]', (n) => n.click());   // the panel's scrim is over the table
    await page.$eval("#rv-confirm", (n) => n.click());
    await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelectorAll("#rv-rows tr.rrow").length === 2);
    const pieceCallsBefore = mock.calls.filter((x) => x.action === "piece").length;
    await page.waitForFunction(() => !document.querySelector("#pc-reviews"));
    check("review: the open piece panel reloads after a resolve (no open review left)", !(await page.$("#pc-reviews")) && !!(await page.$("#pc-title")) && mock.calls.filter((x) => x.action === "piece").length >= pieceCallsBefore, String(pieceCallsBefore));
    check("review: no script errors, no foreign requests", errors.length === 0 && foreign.length === 0, errors.concat(foreign).join(" | "));
    await ctx.close();
  });

  await run("review queue mock mirrors the database", async () => {
    mock.reset();
    const tok = mock.handle({ action: "unlock", passcode: "demo" })[1].token;
    const call = (b) => mock.handle(Object.assign({ action: "resolve", token: tok }, b));
    mock.reviews[0].status = "resolved";
    const closed = call({ review_id: 1, resolution: "nonsense" });
    check("mock: a closed review with a bad answer says \"is not open\" first", closed[0] === 409 && closed[1].error === "review 1 is not open", JSON.stringify(closed));
    const bad = call({ review_id: 4, resolution: "sold" });
    check("mock: an answer not allowed for the kind names the kind", bad[0] === 409 && bad[1].error === "resolution sold is not allowed for overdue_in_transit", JSON.stringify(bad));
    const unk = call({ review_id: 4, resolution: "nonsense" });
    check("mock: an unknown word falls out of the per-kind check", unk[1].error === "resolution nonsense is not allowed for overdue_in_transit", JSON.stringify(unk));
  });

  await run("review queue focus and double submit", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await settled(page);
    await openReview(page);
    const active = () => page.evaluate(() => { const a = document.activeElement; return a === document.body ? "body" : (a.closest("tr.rrow") ? a.closest("tr.rrow").getAttribute("data-review") : "") + ":" + (a.getAttribute("data-answer") || a.id); });
    await page.click('#rv-rows tr.rrow[data-review="1"] button[data-answer="sold"]');
    await page.click("#rv-cancel");
    check("review focus: Cancel returns to that row's answer button", (await active()) === "1:sold", await active());
    await page.click('#rv-rows tr.rrow[data-review="1"] button[data-answer="sold"]');
    await page.click("#rv-confirm");
    await page.click("#confirm-cancel");
    check("review focus: a declined confirmation returns to the note field", (await active()) === ":rv-note", await active());
    await page.click("#rv-cancel");
    // double click on Confirm while the request is held
    mock.delay.resolve = 500;
    await page.click('#rv-rows tr.rrow[data-review="5"] button[data-answer="still_in_transit"]');
    const rcount = () => mock.calls.filter((x) => x.action === "reviews").length;
    const rc0 = rcount();
    const draws = () => page.$eval("#rv-host", (n) => Number(n.getAttribute("data-draws")));
    const d0 = await draws();
    await page.click("#rv-confirm");
    await page.click("#confirm-ok");
    await page.$eval("#rv-confirm", (n) => { n.click(); n.click(); }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll("#rv-rows tr.rrow").length === 4);
    // the reload after the resolve has been asked for (calls rise) and its answer drawn (busy, success, reload = 3 draws)
    await page.waitForFunction((n) => Number(document.querySelector("#rv-host").getAttribute("data-draws")) >= n, d0 + 3);
    check("review: the reviews are reloaded after a resolve", rcount() > rc0);
    check("review: a double click on Confirm sends one resolve", resolveCalls().length === 1, String(resolveCalls().length));
    const a = await active();
    check("review focus: after a resolve it lands on the next row's first answer", a === "4:still_in_transit", a);
    delete mock.delay.resolve;
    for (const id of [4, 3, 2, 1]) {
      const first = await page.$eval(`#rv-rows tr.rrow[data-review="${id}"]`, (r) => { const b = r.querySelectorAll("button[data-answer]"); return b[b.length - (b.length > 2 ? 1 : 2)].getAttribute("data-answer"); });
      await page.click(`#rv-rows tr.rrow[data-review="${id}"] button[data-answer="${first}"]`);
      await page.click("#rv-confirm");
      await page.click("#confirm-ok");
      await page.waitForFunction((n) => document.querySelectorAll("#rv-rows tr.rrow").length === n, id - 1).catch(() => {});
      if (id === 1) await page.waitForSelector("#rv-empty");
    }
    check("review focus: with the list empty it lands on the tab", await page.evaluate(() => document.activeElement.id === "tab-review"));
    check("review focus: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("review queue focus with the piece panel open", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await settled(page);
    await openReview(page);
    await page.click('#rv-rows tr.rrow[data-review="1"] .rv-piece');
    await page.waitForSelector("#piece-panel #pc-title");
    // a touch device: the tapped button keeps focus behind the panel
    await page.$eval('#rv-rows tr.rrow[data-review="1"] .rv-piece', (n) => n.focus());
    const d0 = Number(await page.$eval("#rv-host", (n) => n.getAttribute("data-draws")));
    await page.evaluate(() => loadReviews());
    await page.waitForFunction((n) => Number(document.querySelector("#rv-host").getAttribute("data-draws")) > n, d0);
    check("review focus: a reload with the piece panel open does not pull focus out of it", await page.evaluate(() => !document.querySelector("#rv-host").contains(document.activeElement)));
    await page.click("#piece-close");
    check("review focus (panel): no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("review queue empty and without manage", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 }, { pass: "look" });
    await settled(page);
    check("review (view only): the count is there", (await rvTab(page)) === "Review (5)");
    await openReview(page);
    const rows = await rvRows(page);
    check("review (view only): the list, no Answer column and no buttons", rows.length === 5 && !(await page.$("#rv-rows button[data-answer]")) &&
      (await page.$$eval("#rv-table thead th", (ns) => ns.map((n) => n.textContent.trim()))).join() === "Kind,Piece,State,Raised");
    check("review (view only): the piece still opens the panel", await (async () => { await page.click("#rv-rows tr.rrow .rv-piece"); await page.waitForSelector("#pc-title"); return true; })());
    await page.click("#piece-close");
    await ctx.close();
    // empty
    const t = await setup(browser, { width: 1280, height: 800 });
    mock.reviews.forEach((r) => { r.status = "resolved"; });
    await t.page.reload();
    await t.page.waitForSelector("#rows");
    check("review (empty): the tab shows just Review", (await rvTab(t.page)) === "Review");
    await openReview(t.page);
    check("review (empty): \"No open reviews.\" in the serif line", await t.page.$eval("#rv-empty", (n) => /No open reviews\./.test(n.textContent) && /Palatino/.test(getComputedStyle(n).fontFamily)));
    await t.ctx.close();
    check("review (empty): no script errors", errors.length === 0 && t.errors.length === 0, errors.concat(t.errors).join(" | "));
  });

  await run("review queue RU, lock, widths", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 });
    await settled(page);
    await page.click(".kit-lang .kit-hbtn[lang=ru]");
    await openReview(page);
    check("review RU: the tab", (await rvTab(page)) === "Проверка (5)", await rvTab(page));
    const rows = await rvRows(page);
    const kinds = Object.keys(KIND_RU);
    check("review RU: kind words and answer words", rows.every((r, i) => r.cells[0] === KIND_RU[kinds[i]] && r.answers.join() === KIND_ANS[kinds[i]].map((a) => a + ":" + ANS_RU[a]).join()), JSON.stringify(rows.map((r) => [r.cells[0], r.answers])));
    check("review RU: the date and state in Russian", /^\d{1,2} (янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек) 2026$/.test(rows[0].cells[3]) && rows[0].cells[2] === "В наличии", JSON.stringify(rows[0].cells));
    check("review RU: headings", (await page.$$eval("#rv-table thead th", (ns) => ns.map((n) => n.textContent.trim()))).join() === "Вид,Изделие,Статус,Поднято,Ответ");
    check("review 768 RU: state tags stay on one line", (await wrappedTags(page, "#rv-rows")).length === 0, (await wrappedTags(page, "#rv-rows")).join());
    check("review 768: no sideways scroll", await noHScroll(page) && await page.$eval(".tbl-wrap", (n) => n.scrollWidth <= n.clientWidth + 1));
    check("review 768: controls are 44 px targets", await page.$$eval("#rv-rows button", (ns) => ns.every((n) => n.getBoundingClientRect().height >= 43.5)));
    await page.click('#rv-rows tr.rrow[data-review="1"] button[data-answer="booked_out"]');
    await page.fill("#rv-note", "x");
    await page.click("#rv-confirm");
    await page.waitForSelector("#confirm-dialog");
    check("review RU: the confirmation asks «Закрыть проверку?»", /Закрыть проверку\?/.test(await page.textContent("#confirm-dialog")));
    check("review 768 RU: no sideways scroll with the form open", await noHScroll(page));
    // a late answer after the lock draws nothing
    mock.delay.resolve = 600;
    await page.click("#confirm-ok");
    await page.waitForTimeout(150);
    await page.click(".kit-head .kit-hbtn >> text=Заблокировать");
    await page.waitForSelector("#gate");
    await page.waitForTimeout(900);
    check("review lock: a late answer draws nothing and keeps nothing", await page.evaluate(() => S.locked && S.rv === null && S.reviewCount === null && !document.querySelector("#rv-rows") && !document.querySelector("#confirm-dialog")));
    check("review 768: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------ export to .xlsx
  // A stored ZIP: walk the local file headers (no inflate needed) and return { name: text }.
  const unzip = (buf) => {
    const out = {};
    for (let o = 0; buf.readUInt32LE(o) === 0x04034b50;) {
      const method = buf.readUInt16LE(o + 8), size = buf.readUInt32LE(o + 22);
      const nl = buf.readUInt16LE(o + 26), xl = buf.readUInt16LE(o + 28);
      const name = buf.toString("utf8", o + 30, o + 30 + nl);
      if (method !== 0) throw new Error("not stored: " + name);
      out[name] = buf.toString("utf8", o + 30 + nl + xl, o + 30 + nl + xl + size);
      o += 30 + nl + xl + size;
    }
    return out;
  };
  const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  // → [ { A: {t, s, v, text}, B: … } ] one object per row, keyed by column letter
  const sheetRows = (xml) => [...xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)].map((m) => {
    const cells = {};
    for (const c of m[2].matchAll(/<c r="([A-Z]+)\d+"((?: [a-z]+="[^"]*")*)>([\s\S]*?)<\/c>/g)) {
      const attr = (n) => (new RegExp(" " + n + '="([^"]*)"').exec(c[2]) || [])[1];
      const v = /<v>(.*?)<\/v>/.exec(c[3]), t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3]);
      cells[c[1]] = { t: attr("t"), s: attr("s"), v: v ? v[1] : null, text: t ? unxml(t[1]) : null };
    }
    return cells;
  });
  const tashkentToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const download = async (page) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#export-btn")]);
    const file = await dl.path();
    const z = require("child_process").spawnSync("python3", ["-m", "zipfile", "-t", file], { encoding: "utf8" });
    check("export: python3 -m zipfile -t accepts the downloaded file", z.status === 0, (z.stderr || z.stdout || "").trim());
    return { name: dl.suggestedFilename(), parts: unzip(fs.readFileSync(file)) };
  };
  const EXPORT_EN = ["Serial", "Barcode", "Brand", "Reference", "Model", "Collection", "Category", "Size", "State", "Since", "Price, so'm"];
  const EXPORT_RU = ["Серийный №", "Штрихкод", "Бренд", "Артикул", "Модель", "Коллекция", "Категория", "Размер", "Статус", "С даты", "Цена, сум"];

  await run("kitXlsx unit", async () => {
    const vm = require("vm");
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "..", "ui", "xlsx.js"), "utf8");
    const ctx = vm.createContext({ Blob, TextEncoder, Uint8Array, Uint32Array, DataView, Date, Math, String, isFinite });
    const kitXlsx = vm.runInContext(src + "\n;kitXlsx", ctx);
    const blob = kitXlsx("A/B:" + "x".repeat(40), [{ title: "Name", key: "n" }, { title: "Qty", key: "q", type: "number" }, { title: "Day", key: "d", type: "date" }],
      [{ n: "a & <b>", q: 5, d: "2026-11-16" }, { n: "c", q: null, d: "" }]);
    const buf = Buffer.from(await blob.arrayBuffer());
    check("kitXlsx: a Blob with the xlsx MIME type", blob.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    check("kitXlsx: the bytes start with PK\\x03\\x04", buf.readUInt32LE(0) === 0x04034b50);
    const parts = unzip(buf);
    check("kitXlsx: [Content_Types].xml and xl/workbook.xml are in it", !!parts["[Content_Types].xml"] && !!parts["xl/workbook.xml"] && !!parts["xl/worksheets/sheet1.xml"]);
    check("kitXlsx: the sheet name loses forbidden characters and is cut to 31", /<sheet name="A B x{27}" /.test(parts["xl/workbook.xml"]), parts["xl/workbook.xml"]);
    const rows = sheetRows(parts["xl/worksheets/sheet1.xml"]);
    check("kitXlsx: heading row, then the data rows", rows.length === 3 && rows[0].A.text === "Name" && rows[1].A.text === "a & <b>");
    check("kitXlsx: number cell numeric, date cell a serial, empties left out", rows[1].B.v === "5" && !rows[1].B.t && rows[1].C.v === "46342" && !rows[2].B && !rows[2].C, JSON.stringify(rows[1]));
    // numeric strings in a number column, control characters, and tabs / newlines
    const b2 = kitXlsx("N", [{ title: "T", key: "t" }, { title: "Q", key: "q", type: "number" }],
      [{ t: "x\u0001y\u0008z\u001f", q: "31500000" }, { t: "a\nb\tc", q: "12.5" }, { t: "n", q: "abc" }, { t: "m", q: " 7 " }, { t: "k", q: "1e3" }, { t: "j", q: "-4" }]);
    const x2 = unzip(Buffer.from(await b2.arrayBuffer()))["xl/worksheets/sheet1.xml"];
    const r2 = sheetRows(x2);
    check("kitXlsx: a numeric string in a number column is a number cell", r2[1].B && !r2[1].B.t && r2[1].B.v === "31500000" && r2[2].B.v === "12.5" && r2[6].B.v === "-4", JSON.stringify(r2[1]));
    check("kitXlsx: a non-numeric or odd string in a number column leaves the cell empty", !r2[3].B && !r2[4].B && !r2[5].B, JSON.stringify([r2[3], r2[4], r2[5]]));
    check("kitXlsx: control characters never reach the sheet XML", !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x2) && r2[1].A.text === "xyz", JSON.stringify(r2[1].A));
    check("kitXlsx: newline and tab survive", r2[2].A.text === "a\nb\tc", JSON.stringify(r2[2].A));
    check("kitXlsx: no tool words in the writer", !/crm|client|colibri|\btr\(|console\./i.test(src));
  });

  await run("export", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1280, height: 800 });
    await settled(page);
    check("export: the button sits in the header row, top right, reading Download .xlsx", await page.evaluate(() => {
      const b = document.querySelector("#export-btn"), f = document.querySelector(".filters");
      return !!b && b.textContent.trim() === "Download .xlsx" && b.getBoundingClientRect().bottom <= f.getBoundingClientRect().top + 1
        && b.getBoundingClientRect().right > window.innerWidth / 2;
    }));
    // whole list, nothing filtered
    let r = await download(page);
    check("export: the file is Delardi_stock_<Tashkent date>.xlsx", r.name === `Delardi_stock_${tashkentToday()}.xlsx`, r.name);
    check("export: it holds [Content_Types].xml, xl/workbook.xml and sheet1.xml", !!r.parts["[Content_Types].xml"] && !!r.parts["xl/workbook.xml"] && !!r.parts["xl/worksheets/sheet1.xml"]);
    check("export: the sheet is called Stock", /<sheet name="Stock" /.test(r.parts["xl/workbook.xml"]));
    let rows = sheetRows(r.parts["xl/worksheets/sheet1.xml"]);
    const cols = "ABCDEFGHIJK".split("");
    check("export: the header row (EN)", cols.map((c) => rows[0][c] && rows[0][c].text).join("|") === EXPORT_EN.join("|"), JSON.stringify(rows[0]));
    check("export: no header says cost, margin or себестоимость", !rows[0].L && !/cost|margin|себестоим|purchase|landed/i.test(Object.values(rows[0]).map((c) => c.text).join(" ")));
    check("export: no cost key in the sheet at all", !/cost|margin|себестоим/i.test(r.parts["xl/worksheets/sheet1.xml"]));
    check("export: every page of the list is in it", rows.length - 1 === mock.pieces.length, rows.length - 1 + " vs " + mock.pieces.length);
    const first = mock.pieces.find((p) => p.price_uzs !== null);
    const idx = rows.findIndex((x) => x.A && x.A.text === first.serial);
    check("export: a priced piece has a numeric price cell", rows[idx].K && !rows[idx].K.t && rows[idx].K.v === String(first.price_uzs), JSON.stringify(rows[idx].K));
    const unpSerial = mock.pieces.find((p) => p.price_uzs === null).serial;
    const unp = rows.findIndex((x) => x.A && x.A.text === unpSerial);
    check("export: an unpriced piece has an empty price cell", unp > 0 && !!rows[unp].A && !rows[unp].K, JSON.stringify(rows[unp]));
    check("export: Since is a date cell, State and Category are words", rows[idx].J && !rows[idx].J.t && /^\d{5}$/.test(rows[idx].J.v) && rows[idx].I.text === WORDS[first.state] && rows[idx].G.text === categoryOf(first.category), JSON.stringify(rows[idx]));
    check("export: the button is enabled again and a toast says Saved", await page.$eval("#export-btn", (b) => !b.disabled && b.textContent.trim() === "Download .xlsx")
      && (await page.textContent("#toast")).trim() === `Saved: ${r.name}`);

    // filtered to a state: one row per filtered piece, same filters as the screen
    await page.selectOption("#f-state", "reserved");
    await settled(page);
    await page.waitForFunction(() => S.list.rows.every((x) => x.state === "reserved"));
    const want = mock.pieces.filter((p) => p.state === "reserved");
    r = await download(page);
    rows = sheetRows(r.parts["xl/worksheets/sheet1.xml"]);
    check("export: filtered to Reserved gives one row per reserved piece", rows.length - 1 === want.length && want.length > 0 && rows.slice(1).every((x) => x.I.text === "Reserved"), rows.length - 1 + " vs " + want.length);
    const ex = mock.calls.filter((c) => c.action === "export").pop();
    check("export: it asked stock-api for the same filters", ex && JSON.stringify(ex.filters.states) === '["reserved"]', JSON.stringify(ex && ex.filters));

    // preparing: disabled and worded
    mock.delay.export = 700;
    await page.click("#export-btn");
    check("export: while preparing the button is disabled and says Preparing the file…", await page.$eval("#export-btn", (b) => b.disabled && /Preparing the file…/.test(b.textContent)));
    await page.waitForEvent("download");
    mock.delay.export = 0;
    await page.waitForFunction(() => !document.querySelector("#export-btn").disabled);

    // nothing to export
    await page.selectOption("#f-state", "");
    await page.fill("#f-q", "zzzznomatch");
    await page.waitForFunction(() => S.list && !S.listBusy && S.list.rows.length === 0);
    await page.click("#export-btn");
    await page.waitForFunction(() => /Nothing to download/.test(document.querySelector("#toast").textContent));
    check("export: nothing to export says so", (await page.textContent("#toast")).trim() === "Nothing to download: no piece matches these filters." && await page.$eval("#toast", (t) => !t.classList.contains("err")));
    check("export: nothing to export leaves the button enabled", await page.$eval("#export-btn", (b) => !b.disabled));
    await page.fill("#f-q", "");
    await page.waitForFunction(() => S.list && !S.listBusy && S.list.rows.length > 0);

    // 409
    const extra = mock.pieces.slice(0, 1)[0];
    for (let i = 0; i < 5001; i++) mock.pieces.push({ ...extra, piece_id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0") });
    await page.click("#export-btn");
    await page.waitForFunction(() => /too many rows/.test(document.querySelector("#toast").textContent));
    const sentence = await page.textContent("#toast");
    check("export: 409 shows the server sentence in an error toast", /^too many rows to export \(\d+\); narrow the filters$/.test(sentence.trim()) && await page.$eval("#toast", (t) => t.classList.contains("err")), sentence);
    check("export: 409 keeps the button enabled", await page.$eval("#export-btn", (b) => !b.disabled && b.textContent.trim() === "Download .xlsx"));
    mock.pieces.length -= 5001;

    check("export: no foreign request (blob: is local), no script errors", foreign.length === 0 && errors.length === 0, foreign.concat(errors).join(" | "));
    await ctx.close();
  });

  await run("export RU", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1280, height: 800 });
    await settled(page);
    await page.click(".kit-lang .kit-hbtn[lang=ru]");
    check("export RU: the button reads Скачать .xlsx", (await page.textContent("#export-btn")).trim() === "Скачать .xlsx");
    await page.selectOption("#f-state", "sold");
    await settled(page);
    await page.waitForFunction(() => S.list.rows.every((x) => x.state === "sold"));
    const r = await download(page);
    const rows = sheetRows(r.parts["xl/worksheets/sheet1.xml"]);
    check("export RU: headers in Russian", "ABCDEFGHIJK".split("").map((c) => rows[0][c] && rows[0][c].text).join("|") === EXPORT_RU.join("|"), JSON.stringify(rows[0]));
    check("export RU: sheet «Склад», state in Russian", /<sheet name="Склад" /.test(r.parts["xl/workbook.xml"]) && rows[1].I.text === "Продано");
    check("export RU: no cost header", !/себестоим|cost|margin/i.test(Object.values(rows[0]).map((c) => c.text).join(" ")));
    check("export RU: toast Сохранено", (await page.textContent("#toast")).trim() === `Сохранено: ${r.name}`);
    await page.selectOption("#f-state", "");
    await page.fill("#f-q", "zzzznomatch");
    await page.waitForFunction(() => S.list && !S.listBusy && S.list.rows.length === 0);
    await page.click("#export-btn");
    await page.waitForFunction(() => /Скачивать нечего/.test(document.querySelector("#toast").textContent));
    check("export RU: nothing-to-download toast", (await page.textContent("#toast")).trim() === "Скачивать нечего: под фильтры не подходит ни одно изделие.");
    check("export RU: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------ screens (SHOTS)
  // Seven screenshots when SHOTS is set; the no-sideways-scroll check on every screen always runs.
  await run("screens", async () => {
    const quiet = (page) => page.waitForFunction(() => { const t = document.querySelector("#toast"); return !t || !t.classList.contains("show"); }, null, { timeout: 10000 });
    const snap = async (page, name, label) => {
      await quiet(page);
      await page.waitForTimeout(500);   // the toast fades out
      check(`screens: ${label} has no sideways scroll`, await noHScroll(page));
      await shot(page, name);
    };
    const pc = mock.pieces.find((q) => q.state === "in_stock" && q.price_uzs !== null);
    {
      const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 });
      await settled(page);
      await snap(page, "s01-list", "list 1024");
      await page.fill("#f-q", pc.serial);
      await page.waitForFunction((id) => document.querySelector(`#rows tr[data-id="${id}"]`) && !S.listBusy, pc.piece_id);
      await openId(page, pc.piece_id);
      await snap(page, "s02-piece", "piece 1024");
      await page.click('#pc-actions button[data-act="reserved"]');
      await page.fill("#pf-client", "DLD-9001");
      await page.fill("#pf-until", "2026-11-23");
      await page.fill("#pf-note", "Invented client, asked to hold until Monday.");
      await snap(page, "s03-change", "Reserve form 1024");
      await page.click("#pf-cancel");
      await page.click("#piece-close");
      await page.waitForFunction(() => !document.querySelector("#piece-panel"));
      await page.evaluate(() => { location.hash = "#/review"; });
      await page.waitForSelector("#review-list, .review, #rv-list, main", { timeout: 5000 });
      await page.waitForFunction(() => /#\/review$/.test(location.href) && !document.querySelector("#rows"));
      await page.waitForTimeout(300);
      await snap(page, "s04-review", "review 1024");
      await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());
      await page.waitForSelector("#gate-pass");
      await snap(page, "s05-lock", "lock 1024");
      check("screens: no foreign request, no script errors", foreign.length === 0 && errors.length === 0, foreign.concat(errors).join(" | "));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 });
      await settled(page);
      await snap(page, "s06-list-portrait", "list 768");
      await openId(page, pc.piece_id);
      await snap(page, "s07-piece-portrait", "piece 768");
      check("screens: portrait no script errors", errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  });

  // ------------------------------------------------------------ training mode
  const trainOn = async (page) => {
    await page.click("#train-toggle");
    await page.waitForFunction(() => S.training && S.list && !S.listBusy && document.querySelector("#train-band") && document.querySelectorAll("#rows tr.prow").length > 0);
  };
  const trainId = (n) => "00000000-0000-4000-9000-" + String(n).padStart(12, "0");
  const callsOf = (name) => mock.calls.filter((c) => c.action === name);
  const confirmYes = async (page) => { await page.waitForSelector("#confirm-ok"); await page.click("#confirm-ok"); };

  await run("training: switch, list, stores", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    check("training: the header has a Training switch, off", await page.$eval("#train-toggle", (b) => b.textContent.trim() === "Training" && b.getAttribute("aria-pressed") === "false"));
    check("training: no band and no store filter in real stock", await page.evaluate(() => !document.querySelector("#train-band") && !document.querySelector("#f-store")));
    check("training: real stock never offers the state In transfer", !(await page.$$eval("#f-state option", (ns) => ns.map((n) => n.value))).includes("in_transfer"));
    await page.selectOption("#f-brand", "Zz Atelier");
    await settled(page);
    const before = mock.calls.length;
    await trainOn(page);
    const after = mock.calls.slice(before).map((c) => c.action);
    check("training: switching on asks train_facets and train_list, nothing real", after.includes("train_facets") && after.includes("train_list") && after.every((a) => /^train_/.test(a)), after.join(","));
    check("training: the switch is pressed and the band says what this is", await page.evaluate(() =>
      document.querySelector("#train-toggle").getAttribute("aria-pressed") === "true" && /TRAINING/.test(document.querySelector("#train-band").textContent)
      && /made-up pieces/i.test(document.querySelector("#train-band").textContent)));
    check("training: the twelve made-up pieces, filters cleared", (await rowCount(page)) === 12 && (await page.$eval("#f-brand", (n) => n.value)) === "");
    check("training: every row shows its store", (await page.$$eval("#rows td.store", (ns) => ns.map((n) => n.textContent.trim()))).filter((t) => /^Training store [AB]$/.test(t)).length === 12);
    check("training: brands are the training brands", (await page.$$eval("#f-brand option", (ns) => ns.map((n) => n.value))).join("|") === "|Training Jeweller|Training Watchmaker");
    const states = await page.$$eval("#f-state option", (ns) => ns.map((n) => n.value));
    check("training: states are the five training states", states.join("|") === "|in_stock|reserved|booked_out|damaged|in_transfer", states.join("|"));
    check("training: only the Pieces tab, no export", await page.evaluate(() => !!document.querySelector("#tab-pieces") && !document.querySelector("#tab-review") && !document.querySelector("#tab-import") && !document.querySelector("#export-btn")));
    check("training: Reset button for a manager", !!(await page.$("#train-reset")));
    check("training: one totals card, 12 pieces", norm(await page.textContent("#totals")).includes("12 pieces") && (await page.$$("#totals .tot")).length === 1);
    await page.selectOption("#f-store", "TRN-B");
    await page.waitForFunction(() => !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 4);
    const last = callsOf("train_list").pop();
    check("training: the store filter is sent as the store's code", last.filters.store === "TRN-B" && (await rowCount(page)) === 4, JSON.stringify(last.filters));
    await page.evaluate(() => { location.hash = "#/review"; });
    await page.waitForTimeout(150);
    check("training: #/review shows the training pieces, not the review queue", await page.evaluate(() => !!document.querySelector("#rows") && !document.querySelector("#rv-host")));
    check("training: fits 1024 without sideways scroll", await noHScroll(page));
    await shot(page, "t01-training-list");
    // off again: back to real stock
    const b2 = mock.calls.length;
    await page.click("#train-toggle");
    await page.waitForFunction(() => !S.training && S.list && !S.listBusy && !document.querySelector("#train-band") && document.querySelectorAll("#rows tr.prow").length === 50);
    const off = mock.calls.slice(b2).map((c) => c.action);
    check("training: switching off asks the real facets and list", off.includes("facets") && off.includes("list") && !off.some((a) => /^train_/.test(a)), off.join(","));
    check("training: off → tabs and export are back, store filter gone", await page.evaluate(() => !!document.querySelector("#tab-review") && !!document.querySelector("#tab-import") && !!document.querySelector("#export-btn") && !document.querySelector("#f-store")));
    check("training: no real piece was asked to change", callsOf("set_state").length === 0 && callsOf("resolve").length === 0 && callsOf("import").length === 0);
    check("training: no foreign request, no script errors", foreign.length === 0 && errors.length === 0, foreign.concat(errors).join(" | "));
    await ctx.close();
  });

  await run("training: transfer, receive, cancel, reserve", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    await trainOn(page);
    const b0 = mock.calls.length;
    await openId(page, trainId(1));
    check("training piece: asked through train_piece, no tabs, no origin or cost", callsOf("train_piece").length === 1 && !(await page.$("#pc-tabs"))
      && mock.calls.slice(b0).every((c) => c.action === "train_piece"));
    check("training piece: the Store fact", /Store\s*Training store A/.test(norm(await page.textContent("#pc-facts"))), norm(await page.textContent("#pc-facts")));
    check("training piece: actions are Reserve, Book out, Damaged, Transfer", (await actionLabels(page)).join("|") === "Reserve|Book out|Damaged|Transfer", (await actionLabels(page)).join("|"));
    await page.click('#pc-actions button[data-act="transfer"]');
    const opts = await page.$$eval("#pf-store option", (ns) => ns.map((n) => n.value + ":" + n.textContent.trim()));
    check("transfer: only the other store can be chosen", opts.join("|") === "TRN-B:Training store B", opts.join("|"));
    await page.fill("#pf-note", "For the weekend event");
    await page.click("#pf-submit");
    await page.waitForSelector("#confirm-ok");
    check("transfer: the confirmation names the piece and the store", /TRN-0001/.test(await page.textContent("#confirm-dialog")) && /Training store B/.test(await page.textContent("#confirm-dialog")));
    await page.click("#confirm-ok");
    await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "In transfer");
    const send = callsOf("train_send").pop();
    check("transfer: train_send with the piece, the store code and the note", send && send.piece_id === trainId(1) && send.to_store === "TRN-B" && send.note === "For the weekend event", JSON.stringify(send));
    const hold = norm(await page.textContent("#pc-hold"));
    check("transfer: the panel shows from, to and the note", /From\s*Training store A/.test(hold) && /To\s*Training store B/.test(hold) && /For the weekend event/.test(hold), hold);
    check("transfer: in transfer → Receive and Cancel transfer", (await actionLabels(page)).join("|") === "Receive|Cancel transfer", (await actionLabels(page)).join("|"));
    await page.waitForFunction(() => !S.listBusy && [...document.querySelectorAll("#rows tr.prow")].some((r) => /→/.test(r.querySelector("td.store").textContent)));
    check("transfer: the list row shows where it is going", norm(await page.$eval('#rows tr[data-id="' + trainId(1) + '"] td.store', (n) => n.textContent)) === "Training store A → Training store B");
    check("transfer: a totals card for In transfer", norm(await page.textContent('#totals .tot[data-state="in_transfer"]')).includes("1 piece"));
    check("transfer: history says Sent with the stores", /Sent to another store/.test(norm(await page.textContent("#pc-history li"))) && /Training store A → Training store B/.test(norm(await page.textContent("#pc-history li"))), norm(await page.textContent("#pc-history li")));
    await shot(page, "t02-training-transfer");
    // receive
    await page.click('#pc-actions button[data-act="receive"]');
    await page.click("#pf-submit");
    await confirmYes(page);
    await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "In stock");
    check("receive: train_receive, and the piece is in the other store", callsOf("train_receive").length === 1 && /Store\s*Training store B/.test(norm(await page.textContent("#pc-facts"))) && !(await page.$("#pc-hold")));
    check("receive: history says Received", /Received/.test(norm(await page.textContent("#pc-history li"))));
    // send it back and call it back
    await page.click('#pc-actions button[data-act="transfer"]');
    check("transfer back: now only store A can be chosen", (await page.$$eval("#pf-store option", (ns) => ns.map((n) => n.value))).join("|") === "TRN-A");
    await page.click("#pf-submit");
    await confirmYes(page);
    await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "In transfer");
    await page.click('#pc-actions button[data-act="cancel_transfer"]');
    await page.fill("#pf-note", "Sent by mistake");
    await page.click("#pf-submit");
    await confirmYes(page);
    await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "In stock");
    const cancel = callsOf("train_cancel").pop();
    check("cancel: train_cancel with the note, the piece stays where it was", cancel && cancel.note === "Sent by mistake" && /Store\s*Training store B/.test(norm(await page.textContent("#pc-facts"))));
    // received by the other store behind the page's back: the refusal is shown and the panel catches up
    await page.click('#pc-actions button[data-act="transfer"]');
    await page.click("#pf-submit");
    await confirmYes(page);
    await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "In transfer");
    mock.trainReceiveNow(trainId(1));
    await page.click('#pc-actions button[data-act="receive"]');
    await page.click("#pf-submit");
    await confirmYes(page);
    await page.waitForFunction(() => document.querySelector("#pc-notice") && document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "In stock");
    check("receive refused: the notice says why and the panel shows the piece as it is", /not in transfer/.test(await page.textContent("#pc-notice")) && !(await page.$("#pc-form")));
    // the ordinary changes go to the training actions
    await page.click("#piece-close");
    await openId(page, trainId(2));
    await page.click('#pc-actions button[data-act="reserved"]');
    await page.fill("#pf-client", "DLD-9001");
    await page.click("#pf-submit");
    await confirmYes(page);
    await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "Reserved");
    check("training reserve: train_set_state, never set_state", callsOf("train_set_state").length === 1 && callsOf("set_state").length === 0 && callsOf("piece").length === 0);
    check("training reserve: a reserved piece cannot be transferred", (await actionLabels(page)).join("|") === "Back in stock");
    check("training: the real pieces are as they were", mock.pieces.filter((x) => x.state === "in_stock").length === 30 && mock.pieces.filter((x) => x.state === "reserved").length === 5);
    // reset
    await page.$eval("#train-reset", (b) => b.click());      // the panel's scrim covers it for a pointer; a keyboard still reaches it
    await page.waitForSelector("#confirm-ok");
    check("reset: asks first, and says it only touches training", /training/i.test(await page.textContent("#confirm-dialog")));
    await page.click("#confirm-ok");
    await page.waitForFunction(() => !document.querySelector("#piece-panel") && !S.listBusy && document.querySelectorAll('#totals .tot').length === 1);
    check("reset: train_reset, panel closed, twelve pieces in stock again", callsOf("train_reset").length === 1 && norm(await page.textContent("#totals")).includes("12 pieces")
      && mock.trainPieces.every((x) => x.state === "in_stock"));
    check("training actions: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("training: viewer, reload, lock, RU, stale answers", async () => {
    {
      const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { pass: "look" });
      await settled(page);
      await trainOn(page);
      check("training viewer: sees the pieces, no Reset", (await rowCount(page)) === 12 && !(await page.$("#train-reset")));
      await openId(page, trainId(3));
      check("training viewer: no actions", !(await page.$("#pc-actions")));
      await page.click("#piece-close");
      // a reload keeps the mode
      await page.reload();
      await page.waitForFunction(() => typeof S !== "undefined" && S.training && S.list && !S.listBusy && document.querySelector("#train-band"));
      check("training: a reload stays in training", (await rowCount(page)) === 12);
      // the lock leaves nothing behind, and unlocking comes back to training
      await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());
      await page.waitForSelector("#gate-pass");
      check("training lock: nothing kept behind the card", await page.evaluate(() => S.list === null && S.facets === null));
      await login(page, "look");
      await page.waitForFunction(() => S.training && S.list && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 12);
      check("training: after unlocking it is still training", !!(await page.$("#train-band")) && !!(await page.$("#f-store")));
      // locked, then reloaded before unlocking: the mode is still Training after the passcode
      await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());
      await page.waitForSelector("#gate-pass");
      await page.reload();
      await login(page, "look");
      await page.waitForFunction(() => typeof S !== "undefined" && S.list && !S.listBusy && document.querySelectorAll("#rows tr.prow").length > 0);
      check("training: lock, reload, unlock stays in training", await page.evaluate(() => S.training && !!document.querySelector("#train-band") && document.querySelectorAll("#rows tr.prow").length === 12));
      check("training viewer: no script errors", errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 });
      await settled(page);
      await page.click('.kit-lang button[lang="ru"]');
      await settled(page);
      await trainOn(page);
      const band = norm(await page.textContent("#train-band"));
      check("training RU: the band and the switch are in Russian", /ОБУЧЕНИЕ/.test(band) && /вымышленные/i.test(band) && (await page.$eval("#train-toggle", (b) => b.textContent.trim())) === "Обучение", band);
      await openId(page, trainId(1));
      await page.click('#pc-actions button[data-act="transfer"]');
      await page.click("#pf-submit");
      await confirmYes(page);
      await page.waitForFunction(() => document.querySelector("#piece-panel .pc-state .tag").textContent.trim() === "В перемещении");
      check("training RU: actions in Russian", (await actionLabels(page)).join("|") === "Принять|Отменить перемещение", (await actionLabels(page)).join("|"));
      check("training RU: no tag wraps in the panel", (await wrappedTags(page, "#piece-panel")).length === 0);
      await page.click("#piece-close");
      check("training RU 768: no sideways scroll, no tag wraps in the list", (await noHScroll(page)) && (await wrappedTags(page, "#rows")).length === 0);
      await shot(page, "t03-training-ru-portrait");
      check("training RU: no script errors", errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
    {
      // a training list answer that arrives after the switch back must not be drawn over real stock
      const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
      await settled(page);
      await trainOn(page);
      mock.delay.train_list = 500;
      await page.selectOption("#f-store", "TRN-B");
      await page.click("#train-toggle");
      await page.waitForFunction(() => !S.training && S.list && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
      await page.waitForTimeout(700);
      check("training stale: a late training answer is not drawn over real stock", (await rowCount(page)) === 50 && !(await colText(page, 0)).some((t) => /^TRN-/.test(t)));
      // and a piece panel opened in training closes with the switch
      delete mock.delay.train_list;
      await trainOn(page);
      await openId(page, trainId(4));
      await page.$eval("#train-toggle", (b) => b.click());
      await page.waitForFunction(() => !S.training && !document.querySelector("#piece-panel"));
      check("training: the open piece closes when the mode changes", !(await page.$("#piece-panel")));
      check("training stale: no script errors", errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  });

  // ------------------------------------------- table tools: sort and column checklists
  await run("table tools: sort by a column", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const lastList = () => mock.calls.filter((c) => c.action === "list").pop();
    const sorts = await page.$$eval("table.pieces thead .th-sort", (ns) => ns.map((n) => n.dataset.sort));
    check("sort: every column but Size can be sorted", sorts.join() === "serial,brand,article,state,since,price", sorts.join());
    check("sort: nothing sorted at first, and nothing sent", !(await page.$("table.pieces thead th[aria-sort]")) && !("sort" in lastList().filters) && !(await page.$("#f-clear")));
    await page.click("#pg-next");
    await settled(page);
    await page.click('.th-sort[data-sort="serial"]');
    await page.waitForFunction(() => !S.listBusy && document.querySelector('th[aria-sort="ascending"] .th-sort[data-sort="serial"]'));
    check("sort: a click sorts ascending, on the server, from page 1", lastList().filters.sort === "serial.asc" && lastList().filters.page === 1 && (await colText(page, 0))[0] === "ZZ.00.10001", JSON.stringify(lastList().filters));
    check("sort: the arrow shows the direction", (await page.$eval('.th-sort[data-sort="serial"] .arr', (n) => n.textContent)) === "↑");
    await page.click('.th-sort[data-sort="serial"]');
    await page.waitForFunction(() => !S.listBusy && document.querySelector('th[aria-sort="descending"]'));
    check("sort: a second click reverses", lastList().filters.sort === "serial.desc" && (await colText(page, 0))[0] === "ZZ.00.10060");
    check("sort: the keyboard stays on the header after the redraw", await page.evaluate(() => document.activeElement && document.activeElement.dataset.sort === "serial"));
    await page.click('.th-sort[data-sort="price"]');
    await page.waitForFunction(() => !S.listBusy && document.querySelector('th[aria-sort] .th-sort[data-sort="price"]'));
    check("sort: Price and Since start with the largest", lastList().filters.sort === "price.desc" && (await colText(page, 0))[0] === "ZZ.00.10002" && (await page.$$("th[aria-sort]")).length === 1);
    check("sort: Clear filters appears", !!(await page.$("#f-clear")));
    // the download follows the sort
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#export-btn")]);
    await dl.path();
    check("sort: the download asks for the same order", mock.calls.filter((c) => c.action === "export").pop().filters.sort === "price.desc");
    await page.click("#f-clear");
    await page.waitForFunction(() => !S.listBusy && !document.querySelector("th[aria-sort]") && !document.querySelector("#f-clear"));
    check("sort: Clear filters goes back to the usual order", !("sort" in lastList().filters) && (await colText(page, 0))[0] === "ZZ.00.10001");
    check("sort: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("table tools: column checklists", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await settled(page);
    const lastList = () => mock.calls.filter((c) => c.action === "list").pop();
    const lastFacet = () => mock.calls.filter((c) => c.action === "facet").pop();
    const popRows = () => page.$$eval("#facet-pop .fp-list .fp-row", (ns) => ns.map((n) => n.querySelector(".fp-l").textContent.trim() + ":" + n.querySelector(".fp-n").textContent.trim() + ":" + (n.querySelector("input").checked ? "1" : "0")));
    const waitPop = () => page.waitForFunction(() => document.querySelector("#facet-pop [data-act=fp-apply]"));
    check("checklist: ▾ on Brand and State only", (await page.$$eval("table.pieces thead .th-filter", (ns) => ns.map((n) => n.dataset.facet))).join() === "brand,state");
    await page.selectOption("#f-state", "in_stock");
    await settled(page);
    await page.click('.th-filter[data-facet="brand"]');
    await waitPop();
    check("checklist: asks for the brand values under the other filters", lastFacet().column === "brand" && lastFacet().filters.states.join() === "in_stock" && !("page" in lastFacet().filters), JSON.stringify(lastFacet()));
    check("checklist: each value with its count, all ticked when there is no filter", (await popRows()).join("|") === "Zz Atelier:10:1|Zz Jeweller:10:1|Zz Watchmaker:10:1", (await popRows()).join("|"));
    check("checklist: a dialog named after the column, opened by its button", await page.evaluate(() => document.querySelector("#facet-pop").getAttribute("role") === "dialog"
      && /Brand/.test(document.querySelector("#facet-pop").getAttribute("aria-label")) && document.querySelector('.th-filter[data-facet="brand"]').getAttribute("aria-expanded") === "true"));
    await page.click("#facet-pop .fp-all input");
    check("checklist: Select all unticks everything, and Apply needs at least one", (await popRows()).every((r) => r.endsWith(":0")) && await page.$eval("#facet-pop [data-act=fp-apply]", (b) => b.disabled));
    await page.click('#facet-pop .fp-row[data-value="Zz Atelier"] input');
    await page.click('#facet-pop .fp-row[data-value="Zz Watchmaker"] input');
    await page.click("#facet-pop [data-act=fp-apply]");
    await page.waitForFunction(() => !document.querySelector("#facet-pop") && !S.listBusy && document.querySelector('.th-filter[data-facet="brand"].on'));
    check("checklist: two brands are sent as a list, with the state still on", (lastList().filters.brands || []).join() === "Zz Atelier,Zz Watchmaker" && !("brand" in lastList().filters) && lastList().filters.states.join() === "in_stock", JSON.stringify(lastList().filters));
    check("checklist: only those brands are listed", [...new Set(await colText(page, 1))].join() === "Zz Atelier,Zz Watchmaker" && (await rowCount(page)) === 20);
    check("checklist: the Brand select says Several (2)", (await page.$eval("#f-brand", (n) => n.value + ":" + n.selectedOptions[0].textContent.trim())) === "__multi:Several (2)");
    check("checklist: the totals follow the brands", norm(await page.textContent('#totals .tot[data-state="in_stock"]')).includes("20 pieces"));
    // open again: the two are ticked; the state checklist counts under the brands
    await page.click('.th-filter[data-facet="brand"]');
    await waitPop();
    check("checklist: opens with what is chosen", (await popRows()).map((r) => r.slice(-1)).join("") === "101");
    await page.keyboard.press("Escape");
    check("checklist: Escape closes it and focus goes back to its button", await page.evaluate(() => !document.querySelector("#facet-pop") && document.activeElement.dataset.facet === "brand"));
    await page.click('.th-filter[data-facet="state"]');
    await waitPop();
    check("checklist: State counts are under the brands, not under the state filter", (await popRows()).slice(0, 2).join("|") === "In stock:20:1|Reserved:3:0" && lastFacet().filters.brands.length === 2, (await popRows()).join("|"));
    await page.click('#facet-pop .fp-row[data-value="reserved"] input');
    await shot(page, "f02-checklist-state", { fullPage: false });
    await page.click("#facet-pop [data-act=fp-apply]");
    await page.waitForFunction(() => !document.querySelector("#facet-pop") && !S.listBusy && document.querySelector("#f-state").value === "__multi");
    check("checklist: two states → Several (2), sent as states", lastList().filters.states.join() === "in_stock,reserved" && (await rowCount(page)) === 23, JSON.stringify(lastList().filters));
    check("checklist: no totals card is pressed while several states are chosen", (await page.$$('#totals .tot[aria-pressed="true"]')).length === 0);
    // a totals card is one state: it replaces the several
    await page.click('#totals .tot[data-state="reserved"]');
    await page.waitForFunction(() => !S.listBusy && document.querySelector("#f-state").value === "reserved");
    check("checklist: a totals card replaces the several states with its one", lastList().filters.states.join() === "reserved" && !(await page.$('#f-state option[value="__multi"]')));
    // one value from a checklist is the select's own value
    await page.click('.th-filter[data-facet="brand"]');
    await waitPop();
    await page.click('#facet-pop .fp-row[data-value="Zz Atelier"] input');
    await page.click("#facet-pop [data-act=fp-apply]");
    await page.waitForFunction(() => !S.listBusy && document.querySelector("#f-brand").value === "Zz Watchmaker");
    check("checklist: one value left is the single filter", lastList().filters.brand === "Zz Watchmaker" && !("brands" in lastList().filters) && !(await page.$('#f-brand option[value="__multi"]')));
    // the select clears a checklist; Clear filter in the checklist clears the select
    await page.click('.th-filter[data-facet="brand"]');
    await waitPop();
    await page.click("#facet-pop [data-act=fp-clear]");
    await page.waitForFunction(() => !S.listBusy && document.querySelector("#f-brand").value === "" && !document.querySelector('.th-filter[data-facet="brand"].on'));
    check("checklist: Clear filter takes the brand filter off", !("brand" in lastList().filters) && !("brands" in lastList().filters));
    await page.click('.th-filter[data-facet="brand"]');
    await waitPop();
    await page.click('#facet-pop .fp-row[data-value="Zz Jeweller"] input');
    await page.click("#facet-pop [data-act=fp-apply]");
    await page.waitForFunction(() => !S.listBusy && document.querySelector("#f-brand").value === "__multi");
    await page.selectOption("#f-brand", "Zz Jeweller");
    await page.waitForFunction(() => !S.listBusy && !document.querySelector('#f-brand option[value="__multi"]'));
    check("checklist: choosing one brand in the select drops the several", lastList().filters.brand === "Zz Jeweller" && !("brands" in lastList().filters));
    // a click elsewhere closes; the download carries the lists
    await page.selectOption("#f-brand", "");
    await settled(page);
    await page.click('.th-filter[data-facet="brand"]');
    await waitPop();
    await page.click('#facet-pop .fp-row[data-value="Zz Jeweller"] input');
    await page.click("#facet-pop [data-act=fp-apply]");
    await page.waitForFunction(() => !S.listBusy && document.querySelector("#f-brand").value === "__multi");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#export-btn")]);
    await dl.path();
    check("checklist: the download asks for the same brands", (mock.calls.filter((c) => c.action === "export").pop().filters.brands || []).join() === "Zz Atelier,Zz Watchmaker");
    await page.click('.th-filter[data-facet="state"]');
    await waitPop();
    await page.mouse.click(5, 300);
    check("checklist: a click elsewhere closes it", !(await page.$("#facet-pop")));
    await page.click("#f-clear");
    await page.waitForFunction(() => !S.listBusy && document.querySelector("#f-brand").value === "" && document.querySelector("#f-state").value === "" && !document.querySelector(".th-filter.on"));
    check("checklist: Clear filters takes everything off", (await rowCount(page)) === 50 && Object.keys(lastList().filters).join() === "page");
    // an answer that arrives after the lock is not drawn
    mock.delay.facet = 400;
    await page.click('.th-filter[data-facet="brand"]');
    await page.$eval(".kit-head > button.kit-hbtn", (b) => b.click());
    await page.waitForSelector("#gate-pass");
    await page.waitForTimeout(600);
    check("checklist: the lock takes it away, and a late answer does not bring it back", !(await page.$("#facet-pop")) && await page.evaluate(() => S.facet === null));
    delete mock.delay.facet;
    check("checklist: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("table tools: training, RU, portrait", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 768, height: 1024 });
    await settled(page);
    await page.click('.kit-lang button[lang="ru"]');
    await settled(page);
    await page.click("#train-toggle");
    await page.waitForFunction(() => S.training && S.list && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 12);
    check("training tools: Store can be sorted and has a checklist", (await page.$$eval("table.pieces thead .th-filter", (ns) => ns.map((n) => n.dataset.facet))).join() === "brand,store,state"
      && !!(await page.$('.th-sort[data-sort="store"]')));
    await page.click('.th-filter[data-facet="store"]');
    await page.waitForFunction(() => document.querySelector("#facet-pop [data-act=fp-apply]"));
    const f = mock.calls.filter((c) => c.action === "train_facet").pop();
    check("training tools: the values come from train_facet", f && f.column === "store" && mock.calls.filter((c) => c.action === "facet").length === 0);
    const rows = await page.$$eval("#facet-pop .fp-list .fp-row", (ns) => ns.map((n) => n.dataset.value + ":" + n.querySelector(".fp-l").textContent.trim() + ":" + n.querySelector(".fp-n").textContent.trim()));
    check("training tools: stores by name with counts", rows.join("|") === "TRN-A:Training store A:8|TRN-B:Training store B:4", rows.join("|"));
    check("tools RU: the checklist is in Russian and inside the screen", await page.evaluate(() => { const p = document.querySelector("#facet-pop"), r = p.getBoundingClientRect();
      return /Выбрать все/.test(p.textContent) && /Применить/.test(p.textContent) && r.left >= 0 && r.right <= window.innerWidth; }));
    await page.click('#facet-pop .fp-row[data-value="TRN-A"] input');
    await page.click("#facet-pop [data-act=fp-apply]");
    await page.waitForFunction(() => !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 4);
    check("training tools: one store left is the Store select's value", (await page.$eval("#f-store", (n) => n.value)) === "TRN-B" && mock.calls.filter((c) => c.action === "train_list").pop().filters.store === "TRN-B");
    await page.click('.th-sort[data-sort="price"]');
    await page.waitForFunction(() => !S.listBusy && document.querySelector('th[aria-sort="descending"]'));
    check("training tools: sorted through train_list", mock.calls.filter((c) => c.action === "train_list").pop().filters.sort === "price.desc" && (await colText(page, 0))[0] === "TRN-0011");
    check("tools RU 768: no sideways scroll, no tag wraps", (await noHScroll(page)) && (await wrappedTags(page, "#rows")).length === 0);
    await shot(page, "f01-table-tools-ru-portrait");
    // leaving training takes the sort and the checklists with it
    await page.click("#train-toggle");
    await page.waitForFunction(() => !S.training && S.list && !S.listBusy && document.querySelectorAll("#rows tr.prow").length === 50);
    check("training tools: the mode switch clears sort and filters", !(await page.$("th[aria-sort]")) && !(await page.$("#f-clear")) && Object.keys(mock.calls.filter((c) => c.action === "list").pop().filters).join() === "page");
    check("training tools: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("kit css", async () => {
    const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "..", "..", "..", "qa", "kit.cjs")], { encoding: "utf8" });
    check("kit: node qa/kit.cjs exits 0", r.status === 0, (r.stderr || r.stdout).trim().split("\n")[0]);
  });

  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
