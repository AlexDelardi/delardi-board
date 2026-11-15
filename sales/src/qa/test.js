// Checks for the Sales page (the till) against qa/mock.js, a stand-in for
// sales-api. Run from sales/src after a build:  python3 build.py && node qa/test.js
// Chromium through Playwright, as crm/src/qa/test.js does.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");

const HTML_FILE = path.join(__dirname, "..", "..", "index.html");   // sales/index.html, written by build.py
const ROOT = "https://alexdelardi.github.io/delardi-board/";
const PAGE_URL = ROOT + "sales/";
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/sales-api";
const CRM_API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/crm-api";
const LANDING = path.join(__dirname, "..", "..", "..", "index.html");   // the root landing page
const SHOTS = process.env.SHOTS || "";   // a folder to save screenshots in, if set

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  results.push((ok ? "PASS " : "FAIL ") + name + (detail !== undefined && !ok ? "  → " + detail : ""));
}
const norm = (s) => String(s || "").replace(/[\s  ]+/g, " ").trim();

async function setup(browser, viewport, opts = {}) {
  mock.reset();
  const ctx = await browser.newContext({ viewport, locale: "en-GB",
    ...(opts.touch ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const html = fs.readFileSync(HTML_FILE, "utf8");
  // Nothing but the page and the API: anything else the page asks for fails the run.
  const foreign = [];
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("data:")) return r.continue();
    if (u.startsWith(PAGE_URL)) return r.fulfill({ status: 200, contentType: "text/html", body: html });
    if (u === API) {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "ok" });
      const [status, data] = mock.handle(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    }
    if (u === CRM_API) {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "ok" });
      const [status, data] = mock.crmHandle(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    }
    foreign.push(u);
    return r.fulfill({ status: 404, body: "" });
  });
  if (opts.clock) await page.clock.install();
  await page.goto(PAGE_URL + (opts.hash || ""));
  if (opts.login !== false) await login(page);
  return { ctx, page, errors, foreign };
}
async function login(page, pass = "demo") {
  await page.waitForSelector("#gate-pass");
  await page.fill("#gate-pass", pass);
  await page.click(".gate-card button[type=submit]");
  if (!["wrong", "none"].includes(pass)) await page.waitForSelector("#gate", { state: "detached" });
}
async function scan(page, code) {
  await page.fill("#q", code);
  await page.press("#q", "Enter");
}
async function addLine(page, code) {
  const n = (await page.$$("#lines .line")).length;
  await scan(page, code);
  await page.waitForFunction((n) => document.querySelectorAll("#lines .line").length === n + 1, n);
}
const lineText = (page, i, sel) => page.$eval(`#lines .line:nth-child(${i}) ${sel}`, (n) => n.textContent);
const valOf = (page, sel) => page.$eval(sel, (n) => n.value);
async function toPay(page, { seller = "Dilnoza A.", walkIn = true } = {}) {
  if (seller) await page.selectOption("#seller", seller);
  if (walkIn) await page.click("#walk-in");
  await page.click("#to-pay");
  await page.waitForSelector("#screen-pay");
}
async function addPay(page, kind, amount) {
  const n = (await page.$$(".pay-row")).length;
  if (kind === "cash") await page.click("#add-cash");
  else if (kind === "transfer") await page.click("#add-transfer");
  else { await page.click("#add-card"); await page.click(`[data-card=${kind}]`); }
  await page.waitForFunction((n) => document.querySelectorAll(".pay-row").length === n + 1, n);
  const input = `.pay-row:nth-child(${n + 1}) input.amt`;
  await page.fill(input, amount);
  await page.dispatchEvent(input, "change");
}
const postEnabled = (page) => page.$eval("#post", (b) => !b.disabled);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const smallButtons = (page) => page.evaluate(() => {
  const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  return [...document.querySelectorAll("button, [role=button], a.btn, select")].filter(vis)
    .filter((n) => { const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; })
    .map((n) => (n.id || n.className || n.tagName) + " " + Math.round(n.getBoundingClientRect().width) + "x" + Math.round(n.getBoundingClientRect().height));
});
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true });
}

(async () => {
  const browser = await chromium.launch();
  const run = async (name, fn) => {
    try { await fn(); } catch (e) { check(name + " (ran to the end)", false, e.message.split("\n")[0]); }
  };

  // ----------------------------------------------------------------- login
  await run("login", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 }, { login: false });
    await login(page, "wrong");
    await page.waitForSelector(".gate-card .err:not([hidden])");
    const e = norm(await page.textContent(".gate-card .err"));
    check("login: a wrong passcode shows an error", /passcode is not right/.test(e), e);
    await login(page, "demo");
    await page.waitForSelector("#screen-sale");
    const band = norm(await page.textContent(".training-band").catch(() => ""));
    check("login: the right one opens the sale screen with the TRAINING banner", /TRAINING/.test(band), band);
    check("login: the token is kept in sessionStorage", await page.evaluate(() => !!sessionStorage.getItem("sales_session")));
    check("login: no request leaves for anything but the API", foreign.length === 0, foreign.join(" "));
    check("login: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------ the sale
  await run("sale", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    // scan adds one
    await addLine(page, "2000000000031");
    check("scan adds one: one line", (await page.$$("#lines .line")).length === 1);
    const title = norm(await lineText(page, 1, ".l-title"));
    const spec = norm(await lineText(page, 1, ".l-spec"));
    check("scan adds one: brand and name", /Messika/.test(title) && /Move Uno/.test(title), title);
    check("scan adds one: the spec line (metal, size, stones)", spec === "White gold, size 52, Diamonds", spec);
    check("scan adds one: serial", /ZZ\.00\.30001/.test(await lineText(page, 1, ".l-serial")));
    check("scan adds one: price 31 500 000", norm(await valOf(page, "#lines .line:nth-child(1) input.l-price")) === "31 500 000");
    check("scan adds one: the box is cleared for the next scan", (await valOf(page, "#q")) === "");
    // the same piece again is refused
    await scan(page, "2000000000031");
    await page.waitForFunction(() => /already in this sale/i.test(document.querySelector("#toast").textContent)).catch(() => {});
    check("scan adds one: the same piece twice is refused", (await page.$$("#lines .line")).length === 1 &&
      /already in this sale/i.test(await page.textContent("#toast")));
    // (b) a single-match barcode scanned twice more (scanner double-fire): still one line
    await scan(page, "2000000000031");
    await scan(page, "2000000000031");
    await page.waitForTimeout(300);
    check("scan adds one: a double-fired scan still leaves one line", (await page.$$("#lines .line")).length === 1);

    // barcode many
    await scan(page, "2000000000024");
    await page.waitForFunction(() => document.querySelectorAll("#sugg .sg").length === 3);
    const offs = await page.$$eval("#sugg .sg.off", (ns) => ns.map((n) => n.textContent));
    check("barcode many: three pieces listed", (await page.$$("#sugg .sg")).length === 3);
    check("barcode many: one greyed 'Sold'", offs.length === 1 && /Sold/.test(offs[0]), offs.join("|"));
    check("barcode many: Enter did not add any of them", (await page.$$("#lines .line")).length === 1);
    await page.click("#sugg button.sg >> nth=1");
    await page.waitForFunction(() => document.querySelectorAll("#lines .line").length === 2);
    check("barcode many: clicking a sellable one adds it", /ZZ\.00\.2000[12]/.test(await lineText(page, 2, ".l-serial")));
    check("barcode many: the list closes", !(await page.isVisible("#sugg .sg")));
    // (a) the same shared barcode scanned again: the list opens again, nothing is added
    await scan(page, "2000000000024");
    await page.waitForFunction(() => document.querySelectorAll("#sugg .sg").length === 3);
    await page.waitForTimeout(300);
    check("barcode many: a re-scan opens the list again, nothing added", (await page.$$("#lines .line")).length === 2);
    const left = await page.$$eval("#sugg button.sg", (ns) => ns.length);
    check("barcode many: the picked piece is greyed 'Already in this sale', the other still tappable",
      left === 1 && /Already in this sale/.test(await page.textContent("#sugg")), String(left));
    await page.press("#q", "Enter");
    await page.waitForTimeout(300);
    check("barcode many: Enter again still adds nothing", (await page.$$("#lines .line")).length === 2);
    await page.fill("#q", "");
    await page.waitForSelector("#sugg .sg", { state: "detached" });

    // a held piece and a piece in transit are greyed with their state in words
    await page.fill("#q", "Messika");
    await page.waitForFunction(() => document.querySelectorAll("#sugg .sg").length >= 3);
    const states = norm(await page.$$eval("#sugg .sg.off", (ns) => ns.map((n) => n.textContent).join(" | ")));
    check("search: suggestions as you type (debounced)", (await page.$$("#sugg .sg")).length === 3);
    check("search: a held piece says which suspended sale", /in suspended sale #7/.test(states), states);
    check("search: a piece in transit says so", /In transit/.test(states), states);
    await page.fill("#q", "");
    await page.waitForSelector("#sugg .sg", { state: "detached" });

    // discount
    await page.fill("#lines .line:nth-child(1) input.l-disc", "5");
    const net1 = norm(await lineText(page, 1, ".l-net"));
    check("discount: 5% on 31 500 000 gives 29 925 000", /29 925 000/.test(net1), net1);
    await page.click("#same-pct");
    check("discount: 'Same % for all lines' gives the second line 5%",
      (await valOf(page, "#lines .line:nth-child(2) input.l-disc")) === "5" && /17 480 000/.test(norm(await lineText(page, 2, ".l-net"))),
      await valOf(page, "#lines .line:nth-child(2) input.l-disc"));
    check("discount: the total is the sum of nets", /47 405 000/.test(norm(await page.textContent("#total"))), norm(await page.textContent("#total")));
    // rounding as the database does: half away from zero, whole so'm
    await page.fill("#lines .line:nth-child(2) input.l-price", "1 000 001");
    await page.fill("#lines .line:nth-child(2) input.l-disc", "12.5");
    const want = mock.netOf(1000001, "12.5");           // 875000.875 -> 875 001
    check("discount: rounding matches the server (half away from zero)", norm(await lineText(page, 2, ".l-net")).includes("875 001") && want === 875001,
      norm(await lineText(page, 2, ".l-net")));
    await page.fill("#lines .line:nth-child(2) input.l-disc", "150");
    await page.dispatchEvent("#lines .line:nth-child(2) input.l-disc", "change");
    check("discount: capped at 99.9999", (await valOf(page, "#lines .line:nth-child(2) input.l-disc")) === "99.9999",
      await valOf(page, "#lines .line:nth-child(2) input.l-disc"));
    // per-line seller
    await page.click("#lines .line:nth-child(2) .l-seller");
    await page.selectOption("#lines .line:nth-child(2) select.l-seller-pick", "Malika B.");
    check("lines: a line can carry its own seller", /Malika B\./.test(await lineText(page, 2, ".l-seller-box")));
    // remove
    await page.click("#lines .line:nth-child(2) .l-x");
    await page.waitForFunction(() => document.querySelectorAll("#lines .line").length === 1);
    check("lines: ✕ removes a line", /29 925 000/.test(norm(await page.textContent("#total"))));
    check("seller: the select starts empty and offers the reps",
      (await valOf(page, "#seller")) === "" && (await page.$$eval("#seller option", (os) => os.map((o) => o.value))).includes("Malika B."));
    await shot(page, "sale-1024x768");

    // post guard
    await page.click("#to-pay");
    await page.waitForSelector("#screen-pay");
    check("post guard: no seller → Post disabled", !(await postEnabled(page)));
    await page.selectOption("#seller", "Dilnoza A.");
    check("post guard: a seller but no client or walk-in → disabled", !(await postEnabled(page)));
    await page.click("#walk-in");
    await addPay(page, "cash", "29 924 999");
    check("post guard: Walk-in and payments short by 1 → disabled", !(await postEnabled(page)));
    check("post guard: Remaining 1", /Remaining 1$/.test(norm(await page.textContent("#pay-sum"))), norm(await page.textContent("#pay-sum")));
    await page.fill(".pay-row:nth-child(1) input.amt", "29925000");
    await page.dispatchEvent(".pay-row:nth-child(1) input.amt", "change");
    check("post guard: exact → enabled", await postEnabled(page));
    check("payment: amounts accept and show grouped digits", norm(await valOf(page, ".pay-row:nth-child(1) input.amt")) === "29 925 000");
    await page.fill(".pay-row:nth-child(1) input.amt", "29925001");
    await page.dispatchEvent(".pay-row:nth-child(1) input.amt", "change");
    check("post guard: overpaid by 1 → disabled", !(await postEnabled(page)));

    // split payment
    await page.click(".pay-row:nth-child(1) .p-x");
    await addPay(page, "cash", "20 000 000");
    await addPay(page, "uzcard", "9 925 000");
    const sum = norm(await page.textContent("#pay-sum"));
    check("split payment: Cash 20 000 000 + Uzcard 9 925 000 → Remaining 0", /Paid 29 925 000/.test(sum) && /Remaining 0\b/.test(sum), sum);
    check("split payment: the card row says Uzcard", /Uzcard/.test(await page.textContent(".pay-row:nth-child(2)")));
    check("split payment: Post enabled", await postEnabled(page));
    await page.fill("#fiscal", "ERA-0042");
    await shot(page, "pay-1024x768");

    // post
    mock.state.calls.length = 0;
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    const sent = mock.state.calls.find((c) => c.action === "post");
    const rc = norm(await page.textContent("#screen-receipt"));
    check("post: the receipt shows T-000001", /T-000001/.test(rc), rc);
    check("post: the receipt says TRAINING", /TRAINING/.test(rc), rc);
    check("post: the URL is #/receipt/<id>", /#\/receipt\/10000000-/.test(page.url()), page.url());
    check("post: what was sent — walk-in, seller label, lines, payments, Era number",
      !!sent && sent.sale.walk_in === true && !sent.sale.client_id && sent.sale.seller === "Dilnoza A." &&
      sent.sale.lines.length === 1 && sent.sale.lines[0].price_uzs === 31500000 && sent.sale.lines[0].discount_pct === 5 &&
      sent.sale.payments.length === 2 && sent.sale.payments[1].method === "card" && sent.sale.payments[1].card_type === "uzcard" &&
      sent.sale.fiscal_ref === "ERA-0042", JSON.stringify(sent && sent.sale));
    check("post: the logo is on the receipt", await page.$$eval("#screen-receipt img", (is) => is.some((i) => i.src.startsWith("data:image/png"))));
    await shot(page, "receipt-1024x768");
    await page.click("#new-sale");
    await page.waitForSelector("#screen-sale");
    check("post: New sale clears the sale", (await page.$$("#lines .line")).length === 0 && (await valOf(page, "#seller")) === "" &&
      (await page.getAttribute("#walk-in", "aria-pressed")) === "false");
    check("sale: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------- 409 and the cash notice
  await run("409", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await toPay(page);
    await addPay(page, "cash", "31 500 000");
    mock.sellBehind("ZZ.00.30001");
    await page.click("#post");
    await page.waitForFunction(() => /not in stock/.test(document.querySelector("#toast").textContent) &&
      document.querySelector("#toast").classList.contains("show"));
    const t = norm(await page.textContent("#toast"));
    check("409 shown: the toast names the piece", t === "piece ZZ.00.30001 is not in stock", t);
    check("409 shown: still on the payment screen", !!(await page.$("#screen-pay")) && /#\/pay/.test(page.url()));
    check("409 shown: the sale is kept", (await page.$$(".pay-row")).length === 1);
    check("409: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });
  await run("cash notice", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await addLine(page, "2000000000048");
    await toPay(page);
    await addPay(page, "cash", "170 000 000");
    check("cash notice: not at exactly 170 000 000", !(await page.isVisible(".cash-notice")));
    await page.fill(".pay-row:nth-child(1) input.amt", "170 000 001");
    await page.dispatchEvent(".pay-row:nth-child(1) input.amt", "change");
    check("cash notice: shown above 170 000 000", await page.isVisible(".cash-notice"));
    const n = norm(await page.textContent(".cash-notice").catch(() => ""));
    check("cash notice: says it should go by card", /card/i.test(n), n);
    await addPay(page, "humo", "106 499 999");
    check("cash notice: Post still enabled when balanced", await postEnabled(page));
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    check("cash notice: posts", /T-000001/.test(await page.textContent("#screen-receipt")));
    check("cash notice: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------ idle lock
  await run("idle lock", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { touch: true, clock: true });
    await addLine(page, "2000000000031");
    await page.clock.fastForward("14:00");
    check("idle lock: not before 15 minutes", !(await page.$("#gate")));
    await page.clock.fastForward("01:30");
    await page.waitForSelector("#gate-pass", { timeout: 5000 });
    check("idle lock: the passcode card shows after 15 minutes", !!(await page.$("#gate-pass")));
    check("idle lock: the token is dropped", await page.evaluate(() => !sessionStorage.getItem("sales_session")));
    await login(page);
    check("idle lock: after unlock the lines are still there", (await page.$$("#lines .line")).length === 1);
    check("idle lock: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await run("idle desktop", async () => {
    const { ctx, page } = await setup(browser, { width: 1280, height: 800 }, { clock: true });
    await addLine(page, "2000000000031");
    await page.clock.fastForward("20:00");
    await page.waitForTimeout(200);
    check("idle lock: a desktop with a mouse does not lock", !(await page.$("#gate")));
    await ctx.close();
  });

  // -------------------------------------------------------------- russian
  await run("russian", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await page.click(".lang button[lang=ru]");
    await page.waitForSelector("#screen-sale");
    const txt = await page.textContent("#screen-sale");
    check("russian: Новая продажа on the sale screen", /Новая продажа/.test(txt));
    check("russian: the line keeps its piece", (await page.$$("#lines .line")).length === 1 && /Белое золото/.test(await lineText(page, 1, ".l-spec")));
    check("russian: the banner is in Russian", /ОБУЧЕНИЕ/.test(await page.textContent(".training-band")));
    check("russian: Walk-in reads as the till's word, not the CRM's 'how we met'", norm(await page.textContent("#walk-in")) === "Без карты клиента",
      norm(await page.textContent("#walk-in")));
    check("russian: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ----------------------------------------------------------------- ipad
  for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
    const tag = vp.width + "x" + vp.height;
    await run("ipad " + tag, async () => {
      const { ctx, page, errors } = await setup(browser, vp, { touch: true });
      await addLine(page, "2000000000031");
      await addLine(page, "2000000000048");
      await page.click("#lines .line:nth-child(2) .l-seller");
      await page.fill("#q", "Messika");
      await page.waitForFunction(() => document.querySelectorAll("#sugg .sg").length >= 3);
      check(`ipad ${tag}: sale screen — no sideways scroll`, await noHScroll(page));
      let small = await smallButtons(page);
      check(`ipad ${tag}: sale screen — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-sale-" + tag);
      await page.fill("#q", "");
      await toPay(page);
      await addPay(page, "cash", "100 000 000");
      await page.click("#add-card");
      check(`ipad ${tag}: payment screen — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: payment screen — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-pay-" + tag);
      await page.click("[data-card=visa]");
      await page.fill(".pay-row:nth-child(2) input.amt", "176 500 000");
      await page.dispatchEvent(".pay-row:nth-child(2) input.amt", "change");
      await page.click("#post");
      await page.waitForSelector("#screen-receipt .receipt");
      check(`ipad ${tag}: receipt — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: receipt — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-receipt-" + tag);
      check(`ipad ${tag}: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }
  // the gate on an iPad
  await run("ipad gate", async () => {
    const { ctx, page } = await setup(browser, { width: 768, height: 1024 }, { touch: true, login: false });
    await page.waitForSelector("#gate-pass");
    check("ipad gate: no sideways scroll", await noHScroll(page));
    const small = await smallButtons(page);
    check("ipad gate: buttons ≥ 44 px", small.length === 0, small.join(", "));
    await shot(page, "ipad-gate-768x1024");
    await ctx.close();
  });

  /* ======================================================== Task 8 checks */
  const openClientPanel = async (page, q) => {
    await page.click("#find-client");
    await page.waitForSelector("#client-q");
    if (q) {
      await page.fill("#client-q", q);
      await page.waitForSelector("#client-results .cl-row");
    }
  };
  const openSokolova = async (page) => {
    await openClientPanel(page, "Соколова");
    await page.click("#client-results .cl-row >> nth=0");
    await page.waitForSelector("#client-card .cc-name");
  };

  // --------------------------------------------------- client search and use
  await run("client search and use", async () => {
    const { ctx, page, errors, foreign } = await setup(browser, { width: 1024, height: 768 });
    check("client: the login also opened a CRM session", mock.crm.calls.some((c) => c.action === "unlock" && c.passcode === "demo"));
    await addLine(page, "2000000000031");
    await openClientPanel(page, "Соколова");
    const rows = await page.$$eval("#client-results .cl-row", (ns) => ns.map((n) => n.textContent));
    check("client search: Соколова finds DLD-9001", rows.length === 1 && /Соколова Мария Андреевна/.test(rows[0]) && /DLD-9001/.test(rows[0]), rows.join("|"));
    check("client search: the search went to crm-api with the CRM token",
      mock.crm.calls.some((c) => c.action === "clients" && c.q === "Соколова" && mock.crm.sessions.has(c.token)));
    await page.click("#client-results .cl-row >> nth=0");
    await page.waitForSelector("#client-card .cc-name");
    const card = norm(await page.textContent("#client-card"));
    check("client panel: the display name", /Соколова Мария Андреевна/.test(card), card);
    check("client panel: the owner label", /Dilnoza A\./.test(norm(await page.textContent("#client-card .cc-owner"))), card);
    const href = await page.getAttribute("#client-card a.cc-crm", "href");
    check("client panel: 'View in CRM ↗' links to the CRM card (../crm/#DLD-9001, the CRM's deep link)", /^\.\.\/crm\/#DLD-9001$/.test(href || "") &&
      /View in CRM ↗/.test(await page.textContent("#client-card a.cc-crm")), href);
    check("client panel: purchase count and total from the rollup", /2 purchases/.test(card) && /54 700 000/.test(card), card);
    check("client panel: the last purchase date", card.includes(mock.tkDate(2).split("-").reverse().join(".")), card);
    check("client panel: notes as the card shows them", /Looking for a gift for her sister/.test(card) && /Prefers an appointment after 18:00/.test(card), card);
    check("client panel: important dates", /Wedding anniversary/.test(card) && /Child's birthday/.test(card), card);
    const all = await page.evaluate(() => document.body.innerText);
    check("client panel: no ABC class anywhere", !/\bABC\b/.test(all) && !/Class A\b/.test(all), "");
    check("client panel: no lifecycle / segment tag anywhere", !/Champion/.test(all) && !/\bActive\b/.test(all), "");
    check("client panel: + New offered (CRM editor)", await page.isVisible("#new-client"));
    await shot(page, "client-panel-1024x768");
    await page.click("#use-client");
    await page.waitForSelector("#client-panel", { state: "detached" });
    const slot = norm(await page.textContent("#screen-sale .client-slot"));
    check("client use: the sale shows the client", /Соколова Мария Андреевна/.test(slot) && /DLD-9001/.test(slot), slot);
    check("client use: Walk-in is off", (await page.getAttribute("#walk-in", "aria-pressed")) === "false");
    await toPay(page, { walkIn: false });
    await addPay(page, "cash", "31 500 000");
    check("client use: Post enabled with a client and no Walk-in", await postEnabled(page));
    mock.state.calls.length = 0;
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    const sent = mock.state.calls.find((c) => c.action === "post");
    check("client use: the post carries client_id DLD-9001 and no walk_in", sent && sent.sale.client_id === "DLD-9001" && !sent.sale.walk_in,
      JSON.stringify(sent && sent.sale));
    check("client: only the two APIs are asked", foreign.length === 0, foreign.join(" "));
    check("client: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // --------------------------------------------------- purchase opens ticket
  await run("purchase opens ticket", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await openSokolova(page);
    const n = (await page.$$("#client-card .purchase")).length;
    const links = await page.$$("#client-card .purchase.link");
    const plain = await page.$$eval("#client-card .purchase:not(.link)", (ns) => ns.map((x) => x.tagName + ":" + x.querySelectorAll("a,button").length));
    check("purchase: two rows from the card's transactions", n === 2, String(n));
    check("purchase: the row with a ticket line is a link", links.length === 1);
    check("purchase: the row without one is not a link", plain.length === 1 && /^(LI|DIV):0$/.test(plain[0]), plain.join(","));
    await links[0].click();
    await page.waitForSelector("#screen-ticket");
    check("purchase: opens #/ticket/<id> of D-000002", /#\/ticket\/30000000-0000-4000-8000-000000000004$/.test(page.url()) &&
      /D-000002/.test(await page.textContent("#screen-ticket")), page.url());
    check("purchase: looked up with ticket_by_line", mock.state.calls.some((c) => c.action === "ticket_by_line" && c.line_id === "20000000-0000-4000-8000-000000000202"));
    check("purchase: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------ add client
  await run("add client", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await openClientPanel(page);
    await page.click("#new-client");
    await page.waitForSelector("#addwrap #add-name");
    check("add client: the CRM add-client form opens", /Add a client/.test(await page.textContent("#addwrap")));
    const owners = await page.$$eval("#add-owner option", (os) => os.map((o) => o.value));
    check("add client: the owner choice lists the CRM reps", owners.includes("Dilnoza A.") && owners.includes("Shared (store)") && !owners.includes("Nodira T."), owners.join(","));
    await page.fill("#add-name", "Новикова Елена Петровна");
    await page.click("#addwrap form button[type=submit]");
    await page.waitForSelector("#addwrap", { state: "detached" });
    await page.waitForFunction(() => /PRS-9001/.test(document.querySelector("#screen-sale .client-slot").textContent));
    const slot = norm(await page.textContent("#screen-sale .client-slot"));
    check("add client: the new PRS- client is on the sale", /PRS-9001/.test(slot) && /Новикова Елена Петровна/.test(slot), slot);
    check("add client: the panel is closed", !(await page.$("#client-panel")));
    const add = mock.crm.calls.find((c) => c.action === "client_add");
    check("add client: sent to crm-api with the CRM token", !!add && mock.crm.sessions.has(add.token) && add.name === "Новикова Елена Петровна");
    check("add client: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // --------------------------------------------------------- no crm access
  await run("no crm access", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { login: false });
    await login(page, "nocrm");
    await page.waitForSelector("#screen-sale");
    const slot = norm(await page.textContent("#screen-sale .client-slot"));
    check("no crm access: the line is shown", /No CRM access — Walk-in only/.test(slot), slot);
    check("no crm access: only Walk-in is offered", !!(await page.$("#walk-in")) && !(await page.$("#find-client")) && !(await page.$("#new-client")));
    await addLine(page, "2000000000031");
    await toPay(page);
    const pay = norm(await page.textContent("#screen-pay .client-slot"));
    check("no crm access: the payment screen says so too", /No CRM access — Walk-in only/.test(pay) && !(await page.$("#find-client")), pay);
    check("no crm access: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------ suspend and block
  await run("suspend and block", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    check("suspend: 'Suspended (0)' at first", /Suspended \(0\)/.test(await page.textContent("#suspended")));
    await addLine(page, "2000000000031");
    await page.selectOption("#seller", "Dilnoza A.");
    await page.click("#suspend");
    await page.waitForFunction(() => /Suspended \(1\)/.test(document.querySelector("#suspended")?.textContent));
    check("suspend: 'Suspended (1)'", true);
    check("suspend: the screen is cleared", (await page.$$("#lines .line")).length === 0 && (await valOf(page, "#seller")) === "");
    const sus = mock.state.calls.find((c) => c.action === "suspend");
    check("suspend: sent the lines and the seller", sus && sus.sale.lines.length === 1 && sus.sale.seller === "Dilnoza A." && !sus.sale.payments,
      JSON.stringify(sus && sus.sale));
    // the list
    await page.click("#suspended");
    await page.waitForSelector("#drafts .draft");
    const d = norm(await page.textContent("#drafts"));
    check("suspended list: the draft with its piece and seller", /ZZ\.00\.30001/.test(d) && /Dilnoza A\./.test(d) && /#8/.test(d), d);
    await shot(page, "suspended-1024x768");
    await page.click("#drafts-panel-close");
    // a second suspend is refused → the pop-up
    await addLine(page, "2000000000048");
    await page.click("#suspend");
    await page.waitForSelector("#conflict");
    check("suspend: a second suspend opens the pop-up", /another sale is suspended/i.test(await page.textContent("#conflict")));
    check("suspend: the pop-up names the suspended sale", /ZZ\.00\.30001/.test(await page.textContent("#conflict")));
    await page.click("#conflict-close");
    check("suspend: the sale on screen is kept", (await page.$$("#lines .line")).length === 1);
    // post is refused → the pop-up, Resume restores the lines
    await toPay(page);
    await addPay(page, "cash", "245 000 000");
    await page.click("#post");
    await page.waitForSelector("#conflict");
    check("post blocked: the pop-up offers Resume and Cancel", !!(await page.$("#conflict-resume")) && !!(await page.$("#conflict-cancel")));
    await shot(page, "conflict-1024x768");
    await page.click("#conflict-resume");
    await page.waitForSelector("#screen-sale");
    await page.waitForFunction(() => document.querySelectorAll("#lines .line").length === 1);
    check("resume: the suspended lines are back", /ZZ\.00\.30001/.test(await lineText(page, 1, ".l-serial")));
    check("resume: the seller is back", (await valOf(page, "#seller")) === "Dilnoza A.");
    check("resume: draft_id is kept", await page.evaluate(() => S.sale.draft_id === 8));
    // post the resumed sale: the draft goes
    await toPay(page);
    await addPay(page, "cash", "31 500 000");
    mock.state.calls.length = 0;
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    const sent = mock.state.calls.find((c) => c.action === "post");
    check("resume: the post carries draft_id 8", sent && sent.sale.draft_id === 8, JSON.stringify(sent && sent.sale));
    await page.click("#new-sale");
    await page.waitForFunction(() => /Suspended \(0\)/.test(document.querySelector("#suspended")?.textContent));
    check("resume: after posting, 'Suspended (0)'", true);
    // cancel asks first
    await addLine(page, "2000000000048");
    await page.click("#suspend");
    await page.waitForFunction(() => /Suspended \(1\)/.test(document.querySelector("#suspended")?.textContent));
    await page.click("#suspended");
    await page.waitForSelector("#drafts .draft");
    await page.click("#drafts .draft-cancel");
    await page.waitForSelector("#confirm-dialog");
    await page.click("#confirm-cancel");
    check("cancel: saying no keeps it", !mock.state.calls.some((c) => c.action === "cancel_draft") && mock.state.drafts.length === 1);
    await page.click("#drafts .draft-cancel");
    await page.click("#confirm-ok");
    await page.waitForFunction(() => /Suspended \(0\)/.test(document.querySelector("#suspended")?.textContent));
    check("cancel: confirmed → cancel_draft, 'Suspended (0)'", mock.state.drafts.length === 0);
    check("suspend: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------ tickets list
  await run("tickets list", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await page.click("a.view-tab[href='#/tickets']");
    await page.waitForSelector("#screen-tickets a.tk-row");
    const nos = () => page.$$eval("#screen-tickets a.tk-row .tk-no", (ns) => ns.map((n) => n.textContent.trim()));
    let list = await nos();
    check("tickets: the last 30 days by default (no T-, not the 45-day-old one)", list.length === 4 && !list.includes("C-103900") && !list.some((x) => /^T-/.test(x)), list.join(","));
    check("tickets: the From box says 30 days back", (await valOf(page, "#tk-from")) === mock.tkDate(29) && (await valOf(page, "#tk-to")) === mock.tkDate(0),
      await valOf(page, "#tk-from"));
    const sum = norm(await page.textContent("#tk-sum"));
    check("tickets: the count and total line", /4 tickets/.test(sum) && /69 500 000/.test(sum), sum);
    const refund = norm(await page.textContent("#screen-tickets a.tk-row:has(.tk-no:text-is('C-104230')) .tk-net"));
    check("tickets: a refund shows negative", refund === "-9 800 000", refund);
    check("tickets: test sales offered only while training", (await page.$$eval("#tk-source option", (os) => os.map((o) => o.value))).includes("training"));
    await shot(page, "tickets-1024x768");
    await page.selectOption("#tk-source", "delardi");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets a.tk-row").length === 2);
    list = await nos();
    check("tickets: source 'ours' shows only D-/T-", list.length === 2 && list.every((x) => /^[DT]-/.test(x)), list.join(","));
    await page.selectOption("#tk-source", "");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets a.tk-row").length === 4);
    await page.fill("#tk-q", "ZZ.00.11001");
    await page.press("#tk-q", "Enter");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets a.tk-row").length === 1);
    list = await nos();
    check("tickets: search by serial finds the Colibri ticket", list.length === 1 && list[0] === "C-104233", list.join(","));
    await page.fill("#tk-q", "");
    await page.press("#tk-q", "Enter");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets a.tk-row").length === 4);
    await page.click("#screen-tickets a.tk-row:has(.tk-no:text-is('C-104230'))");
    await page.waitForSelector("#screen-ticket .tl-row");
    const det = norm(await page.textContent("#screen-ticket"));
    check("ticket detail: the refund line shows negative", /-9 800 000/.test(norm(await page.textContent("#screen-ticket .tl-row .tl-net"))), det);
    check("ticket detail: Colibri is read-only (no Void, no Receipt)", !(await page.$("#void")) && !(await page.$("#show-receipt")) && /read-only/i.test(det), det);
    await page.goBack();
    await page.waitForSelector("#screen-tickets a.tk-row");
    check("tickets: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------------- void
  await run("void", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { hash: "#/ticket/30000000-0000-4000-8000-000000000003" });
    await page.waitForSelector("#screen-ticket .tl-row");
    check("void: our posted ticket offers Receipt and Void", !!(await page.$("#show-receipt")) && !!(await page.$("#void")));
    await page.click("#show-receipt");
    await page.waitForSelector("#screen-ticket .receipt");
    check("void: the receipt shows", /D-000001/.test(await page.textContent("#screen-ticket .receipt")));
    await page.click("#void");
    await page.waitForSelector("#void-reason");
    mock.state.calls.length = 0;
    await page.click("#void-go");
    await page.waitForSelector("#void-form .form-err");
    check("void: no reason → blocked, nothing sent", !mock.state.calls.some((c) => c.action === "void") && !(await page.$("#confirm-dialog")));
    await page.fill("#void-reason", "The client changed her mind at the counter.");
    await page.click("#void-go");
    await page.waitForSelector("#confirm-dialog");
    await shot(page, "void-confirm-1024x768");
    await page.click("#confirm-ok");
    await page.waitForSelector("#era-reminder");
    const det = norm(await page.textContent("#screen-ticket"));
    check("void: status VOIDED", /VOIDED/.test(norm(await page.textContent("#screen-ticket .tk-status"))), det);
    check("void: the Era reminder", norm(await page.textContent("#era-reminder")) === "Cancel the fiscal receipt in Era as well.");
    check("void: the reason was sent", mock.state.calls.some((c) => c.action === "void" && c.reason === "The client changed her mind at the counter."));
    check("void: the reason is shown", /changed her mind/.test(det), det);
    check("void: no stray 'null' on the ticket", !/\bnull\b/.test(await page.evaluate(() => document.querySelector("#screen-ticket").innerText)));
    check("void: no Void button on a void ticket", !(await page.$("#void")));
    await shot(page, "ticket-1024x768");
    check("void: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // without the void right there is no Void button
    const b = await setup(browser, { width: 1024, height: 768 }, { login: false, hash: "#/ticket/30000000-0000-4000-8000-000000000004" });
    await login(b.page, "rep");
    await b.page.waitForSelector("#screen-ticket .tl-row");
    check("void: no button without the void right", !(await b.page.$("#void")) && !!(await b.page.$("#show-receipt")));
    await b.ctx.close();
  });

  // ------------------------------------------------------------------ admin
  await run("admin", async () => {
    const a = await setup(browser, { width: 1024, height: 768 }, { login: false });
    await login(a.page, "rep");
    await a.page.waitForSelector("#screen-sale");
    check("admin: no tab without manage", !(await a.page.$("a.view-tab[href='#/admin']")));
    await a.page.evaluate(() => { location.hash = "#/admin"; });
    await a.page.waitForTimeout(200);
    check("admin: the screen holds no switch without manage", !(await a.page.$("#mode-live")) && !(await a.page.$("#clear-training")));
    await a.ctx.close();

    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await page.click("a.view-tab[href='#/admin']");
    await page.waitForSelector("#screen-admin #mode-live");
    check("admin: training now", (await page.getAttribute("#mode-training", "aria-pressed")) === "true");
    check("admin: no go-live date yet", /not yet/i.test(await page.textContent("#go-live")));
    // a test sale and a suspended test sale, to clear
    const tok = await page.evaluate(() => JSON.parse(sessionStorage.getItem("sales_session")).token);
    const p = mock.state.pieces.find((x) => x.serial === "ZZ.00.30001");
    mock.handle({ action: "post", token: tok, sale: { walk_in: true, seller: "Dilnoza A.", lines: [{ piece_id: p.piece_id, price_uzs: 31500000 }],
      payments: [{ method: "cash", amount: 31500000 }] } });
    const w = mock.state.pieces.find((x) => x.serial === "ZZ.00.40001");
    mock.handle({ action: "suspend", token: tok, sale: { lines: [{ piece_id: w.piece_id, price_uzs: 245000000 }] } });
    await page.click("#clear-training");
    await page.waitForSelector("#confirm-dialog");
    await page.click("#confirm-ok");
    await page.waitForSelector("#clear-result");
    const cr = norm(await page.textContent("#clear-result"));
    check("admin: clear test sales shows what was cleared", /1 test ticket\b/.test(cr) && /1 suspended test sale\b/.test(cr), cr);
    await shot(page, "admin-1024x768");
    await page.click("#mode-live");
    await page.waitForSelector("#confirm-dialog");
    const txt = norm(await page.textContent("#confirm-dialog"));
    check("admin: Live asks to confirm and says what Live means", /real/i.test(txt) && /sold/i.test(txt) && /CRM/.test(txt), txt);
    await page.click("#confirm-cancel");
    check("admin: saying no keeps training", !!(await page.$(".training-band")) && mock.state.mode === "training");
    await page.click("#mode-live");
    await page.click("#confirm-ok");
    await page.waitForSelector(".training-band", { state: "detached" });
    check("admin: Live removes the TRAINING banner", mock.state.mode === "live" && !(await page.$(".training-band")));
    check("admin: the go-live date is shown", (await page.textContent("#go-live")).includes(mock.tkDate(0).split("-").reverse().join(".")),
      await page.textContent("#go-live"));
    await page.click("a.view-tab[href='#/tickets']");
    await page.waitForSelector("#screen-tickets a.tk-row");
    check("admin: Live → no test-sales option in the ticket list", !(await page.$$eval("#tk-source option", (os) => os.map((o) => o.value))).includes("training"));
    check("admin: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------------------ landing tile
  await run("landing tile", async () => {
    const html = fs.readFileSync(LANDING, "utf8");
    const tile = /<a class="tool" href="sales\/" data-tool="sales">([\s\S]*?)<\/a>/.exec(html);
    check("landing tile: a fourth tile links to sales/", (html.match(/<a class="tool" /g) || []).length === 4 && !!tile);
    check("landing tile: named Sales / Продажи", !!tile && /data-i18n="sales_name">Sales</.test(tile[1]) && /sales_name: "Продажи"/.test(html));
    check("landing tile: reads the unlock state only", !!tile && /data-session="sales_session"/.test(tile[1]));
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { login: false });
    await page.route(ROOT, (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(ROOT);
    check("landing tile: the landing page shows it", /Sales/.test(await page.textContent("a.tool[data-tool=sales]")));
    check("landing tile: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------------- the new screens on iPad
  for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
    const tag = vp.width + "x" + vp.height;
    await run("ipad screens " + tag, async () => {
      const { ctx, page, errors } = await setup(browser, vp, { touch: true });
      await openSokolova(page);
      check(`ipad ${tag}: client panel — no sideways scroll`, await noHScroll(page));
      let small = await smallButtons(page);
      check(`ipad ${tag}: client panel — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-client-" + tag);
      await page.click("#client-close");
      await page.click("a.view-tab[href='#/tickets']");
      await page.waitForSelector("#screen-tickets a.tk-row");
      check(`ipad ${tag}: tickets — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: tickets — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-tickets-" + tag);
      await page.click("#screen-tickets a.tk-row >> nth=0");
      await page.waitForSelector("#screen-ticket .tl-row");
      check(`ipad ${tag}: ticket — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: ticket — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-ticket-" + tag);
      await page.click("a.view-tab[href='#/admin']");
      await page.waitForSelector("#screen-admin #mode-live");
      check(`ipad ${tag}: admin — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: admin — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-admin-" + tag);
      check(`ipad ${tag} screens: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }

  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
