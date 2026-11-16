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
  if (opts.mode === "live") mock.switchModeBehind("live");
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

    // the restyled New sale screen (Task 3)
    check("sale: title row has the Palatino title, seller select and Suspend", await page.evaluate(() => {
      const h = document.querySelector(".sale-head");
      const t = h && h.querySelector("h1.title");
      return !!t && t.textContent.trim() === "New sale" && /Palatino/.test(getComputedStyle(t).fontFamily) &&
        !!h.querySelector("select#seller") && !!h.querySelector("#suspend");
    }));
    check("sale: bottom bar holds client, total and Payment", await page.evaluate(() => {
      const f = document.querySelector(".foot");
      return !!f && !!f.querySelector(".client-slot") && !!f.querySelector(".total .keynum") && !!f.querySelector("#to-pay") &&
        getComputedStyle(f.querySelector(".total .keynum")).fontWeight !== "700";
    }));
    await page.fill("#q", "Armillas");
    await page.waitForFunction(() => document.querySelectorAll("#sugg .sg").length === 3);
    const tagInfo = await page.$$eval("#sugg .sg .tag", (ns) => ns.map((n) => n.className + ":" + n.textContent.trim()));
    check("search: results show status tags", tagInfo.some((x) => /\bact\b.*:In stock/.test(x)) && tagInfo.some((x) => /\balert\b.*:Sold/.test(x)), tagInfo.join(" | "));
    await page.fill("#q", "Messika");
    await page.waitForFunction(() => /Glam/.test(document.querySelector("#sugg").textContent));
    const tagInfo2 = await page.$$eval("#sugg .sg .tag", (ns) => ns.map((n) => n.className + ":" + n.textContent.trim()));
    check("search: suspended sale is an info tag, other states a done tag",
      tagInfo2.some((x) => /\binfo\b.*:in suspended sale #7/i.test(x)) && tagInfo2.some((x) => /\bdone\b.*:In transit/.test(x)), tagInfo2.join(" | "));
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
    check("post guard: Left to pay 1", /Left to pay 1$/.test(norm(await page.textContent("#pay-sum"))), norm(await page.textContent("#pay-sum")));
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
    check("split payment: Cash 20 000 000 + Uzcard 9 925 000 → Left to pay 0", /Paid 29 925 000/.test(sum) && /Left to pay 0\b/.test(sum), sum);
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
    check("post: each item shows its reference line and serial, in the detail style",
      await page.$$eval("#screen-receipt .rc-detail", (ds) => ds.some((d) => /^Ref\. /.test(d.textContent))
        && ds.some((d) => /^S\/N /.test(d.textContent))));
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

  await run("sale long name", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000086");
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const b = document.querySelector("#to-pay").getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: b.width, bh: b.height, right: b.right };
    });
    check("sale: a 60-character piece name wraps inside 1024 wide", r.sw <= r.iw + 1 && r.bw > 0 && r.bh > 0 && r.right <= r.iw, JSON.stringify(r));
    check("sale: long name page has no script errors", errors.length === 0, errors.join(" | "));
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
    await page.click(".kit-lang button[lang=ru]");
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

  // a held piece's status tag stays in its column, EN and RU, both iPad sizes
  for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
    for (const lang of ["en", "ru"]) {
      await run(`status tag fit ${lang} ${vp.width}`, async () => {
        const { ctx, page, errors } = await setup(browser, vp);
        if (lang === "ru") { await page.click(".kit-lang button[lang=ru]"); await page.waitForSelector("#screen-sale"); }
        await page.fill("#q", "Glam");
        await page.waitForFunction(() => /Glam/.test(document.querySelector("#sugg").textContent));
        const r = await page.evaluate(() => {
          const row = [...document.querySelectorAll("#sugg .sg")].find((n) => /Glam/.test(n.textContent));
          const t = row.querySelector(".tag").getBoundingClientRect(), p = row.querySelector(".sg-p").getBoundingClientRect(), w = row.getBoundingClientRect();
          return { tr: t.right, pl: p.left, tl: t.left, wl: w.left, wr: w.right, tb: t.bottom, wb: w.bottom, tt: t.top, wt: w.top, p: p.width };
        });
        check(`search: held tag stays clear of the price (${lang} ${vp.width})`, r.tr <= r.pl + 0.5 && r.tl >= r.wl && r.tr <= r.wr && r.tt >= r.wt && r.tb <= r.wb, JSON.stringify(r));
        check(`search: no script errors (${lang} ${vp.width})`, errors.length === 0, errors.join(" | "));
        await ctx.close();
      });
    }
  }

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

  /* ================================================== UI kit (shell) checks */
  await run("kit shell", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    const toolsBtn = page.locator(".kit-head [data-kit-menu] > button");
    check("kit: header has the Tools switcher with 4 tools (button)", (await toolsBtn.count()) === 1 && norm(await toolsBtn.textContent()) === "Tools");
    await toolsBtn.click();
    const items = await page.$$eval(".kit-head .kit-menu li", (ls) => ls.map((l) => l.textContent.trim()));
    const current = await page.$$eval(".kit-head .kit-menu [aria-current=page]", (ns) => ns.map((n) => n.textContent.trim()));
    check("kit: header has the Tools switcher with 4 tools", items.join() === "Sales,Clients,Catalogue,Board" && current.join() === "Sales",
      items.join() + " / " + current.join());
    check("kit: the Tools menu is open", await page.isVisible(".kit-head .kit-menu"));
    check("kit: no theme switch", await page.evaluate(() => ![...document.querySelectorAll("[title], [aria-label]")]
      .some((n) => /theme|тема/i.test((n.getAttribute("title") || "") + " " + (n.getAttribute("aria-label") || "")))));
    check("kit: no dark mode on the page", await page.evaluate(() => !document.documentElement.hasAttribute("data-theme") &&
      !document.documentElement.classList.contains("sysdark")));
    check("kit: header order — wordmark, rule, Sales, spacer, Tools, EN/RU, staff, Lock", await page.evaluate(() => {
      const h = document.querySelector(".kit-head");
      const kids = [...h.children].map((n) => n.matches("a.kit-brand") ? "brand" : n.matches(".kit-rule") ? "rule" : n.matches(".kit-tool") ? "tool"
        : n.matches(".kit-spacer") ? "spacer" : n.matches("[data-kit-menu]") ? "tools" : n.matches(".kit-lang") ? "lang"
        : n.matches(".kit-staff") ? "staff" : n.matches("button.kit-hbtn") ? "lock:" + n.textContent.trim() : "?");
      return kids.join() === "brand,rule,tool,spacer,tools,lang,staff,lock:Lock" &&
        h.querySelector("a.kit-brand").getAttribute("href") === "../" && h.querySelector(".kit-tool").textContent === "Sales" &&
        h.querySelector(".kit-staff").textContent === S.name && S.name === "Till Manager";
    }));
    check("kit: tabs are kit tabs, New sale current", norm(await page.textContent(".kit-tabs .kit-tab[aria-current=page]")) === "New sale");
    check("kit: the training band is a kit band", await page.evaluate(() => {
      const b = document.querySelector(".band.training-band");
      return !!b && b.querySelector(".lbl").textContent === "TRAINING";
    }));
    for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(50);
      check(`kit: no sideways scroll at ${vp.width}×${vp.height} on the sale screen (Tools open)`, await noHScroll(page));
    }
    check("dates: fmtDate gives 16 Nov 2026 and 16 ноя 2026, fmtDateNum gives 16.11.2026", await page.evaluate(() => {
      const iso = "2026-11-16T09:05:00Z";
      const en = fmtDate(iso); LANG = "ru"; const ru = fmtDate(iso); LANG = "en";
      return en === "16 Nov 2026" && ru === "16 ноя 2026" && fmtDateNum(iso) === "16.11.2026" &&
        fmtDate("2026-11-16T20:30:00Z") === "17 Nov 2026";      // Tashkent is UTC+5
    }));
    check("dates: fmtTime is pinned to Tashkent (20:30Z → 17 Nov 01:30)", await page.evaluate(() =>
      fmtDate("2026-11-16T20:30:00Z") === "17 Nov 2026" && fmtTime("2026-11-16T20:30:00Z") === "01:30"));
    await page.evaluate(() => lockDown());
    await page.waitForSelector("#gate-pass");
    check("kit: lock closes the Tools menu", await page.evaluate(() => kitOpenMenus.length === 0 &&
      ![...document.querySelectorAll(".kit-menu")].some((m) => !m.hidden)));
    check("kit: lock card has the mast and Unlock", await page.evaluate(() => !!document.querySelector("#gate .gate-mast img") &&
      document.querySelector("#gate .gate-card button[type=submit]").textContent === "Unlock" &&
      /Boutique tools/.test(document.querySelector("#gate .gate-mast").textContent) &&
      /Opens the till/.test(document.querySelector("#gate").textContent)));
    check("kit shell: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });
  await run("kit lock panel", async () => {
    const { ctx, page } = await setup(browser, { width: 1024, height: 768 });
    await page.evaluate(() => document.body.appendChild(Object.assign(document.createElement("div"), { className: "panel-wrap" })));
    await page.evaluate(() => lockDown());
    check("kit: lock removes any detail panel", !(await page.$(".panel-wrap")));
    await ctx.close();
  });
  await run("kit css", async () => {
    const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "..", "..", "..", "qa", "kit.cjs")], { encoding: "utf8" });
    check("kit: node qa/kit.cjs passes on the built page", r.status === 0, (r.stderr || r.stdout).trim().split("\n")[0]);
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
  const niceDay = (d) => { const [y, m, dd] = d.split("-"); return Number(dd) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] + " " + y; };
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
    check("client panel: the last purchase date reads like 14 Nov 2026", card.includes(niceDay(mock.tkDate(2))), card);
    check("client panel: notes as the card shows them", /Looking for a gift for her sister/.test(card) && /Prefers an appointment after 18:00/.test(card), card);
    check("client panel: important dates", /Wedding anniversary/.test(card) && /Child's birthday/.test(card), card);
    const all = await page.evaluate(() => document.body.innerText);
    check("client panel: no ABC class anywhere", !/\bABC\b/.test(all) && !/Class A\b/.test(all), "");
    check("client panel: no lifecycle / segment tag anywhere", !/Champion/.test(all) && !/\bActive\b/.test(all), "");
    check("client panel: + New offered (CRM editor)", await page.isVisible("#new-client"));
    check("client: Use this client is primary, + New client secondary", await page.evaluate(() =>
      document.querySelector("#use-client").classList.contains("primary") && document.querySelector("#new-client").classList.contains("btn") &&
      !document.querySelector("#new-client").classList.contains("primary")));
    const pb = await page.evaluate(() => { const r = document.querySelector("#client-panel .panel").getBoundingClientRect(); return { right: r.right, w: r.width, vw: innerWidth }; });
    check("client: opens as a right panel 560 wide at 1024", Math.abs(pb.right - pb.vw) <= 1 && Math.abs(pb.w - 560) <= 1, JSON.stringify(pb));
    await page.setViewportSize({ width: 560, height: 900 });
    await page.waitForTimeout(50);
    const pn = await page.evaluate(() => { const r = document.querySelector("#client-panel .panel").getBoundingClientRect(); return { w: r.width, vw: innerWidth }; });
    check("client: full width under 600 px", Math.abs(pn.w - pn.vw) <= 1, JSON.stringify(pn));
    await page.setViewportSize({ width: 1024, height: 768 });
    check("client: the scrim sits behind the panel and closes it", await page.evaluate(() => !!document.querySelector("#client-panel .panel-scrim") && !document.querySelector("#client-panel .modal")));
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

  // ------------------------------------------------------------ lock hides client data (Codex finding, PR #5)
  await run("lock hides client data", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { touch: true, clock: true });
    await addLine(page, "2000000000031");
    await openClientPanel(page);
    await page.click("#new-client");
    await page.waitForSelector("#addwrap #add-name");
    await page.fill("#add-name", "Zz Locktest");
    await page.clock.fastForward("15:30");
    await page.waitForSelector("#gate-pass", { timeout: 5000 });
    check("lock: the add-client form is gone", !(await page.$("#addwrap")));
    check("lock: the client panel is gone", !(await page.$("#client-panel .panel")) && !(await page.$("#client-panel")));
    check("lock: no typed client name left on the page", !/Zz Locktest/.test(await page.content()));
    check("lock: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------- lock vs. pending client lookups (fix round 1)
  await run("lock vs pending lookups", async () => {
    const gateOver = (page) => page.evaluate(() => { const g = document.querySelector("#gate"); return !!g && getComputedStyle(g).display !== "none"; });
    // (a) lock inside the 300 ms debounce window
    let t = await setup(browser, { width: 1024, height: 768 });
    await addLine(t.page, "2000000000031");
    await openClientPanel(t.page);
    await t.page.fill("#client-q", "Соколова");
    await t.page.evaluate(() => lockDown());
    await t.page.waitForTimeout(1000);
    check("lock: a typed search does not bring the client panel back", !(await t.page.$("#client-panel")) && await gateOver(t.page));
    await t.ctx.close();
    // (b) lock while a client lookup is in flight
    t = await setup(browser, { width: 1024, height: 768 });
    await addLine(t.page, "2000000000031");
    await openClientPanel(t.page);
    await t.page.evaluate(() => { const orig = call; call = async (...a) => { await new Promise((r) => setTimeout(r, 500)); return orig(...a); }; });
    await t.page.fill("#client-q", "Соколова");
    await t.page.waitForTimeout(350);
    await t.page.evaluate(() => lockDown());
    await t.page.waitForTimeout(1200);
    check("lock: an answer arriving after the lock draws no client panel", !(await t.page.$("#client-panel")) && await gateOver(t.page));
    // (c) the passcode card is above every overlay
    const z = await t.page.evaluate(() => {
      const probe = (cls) => { const n = document.createElement("div"); n.className = cls; n.style.display = "none"; document.body.appendChild(n); const v = parseInt(getComputedStyle(n).zIndex, 10); n.remove(); return v; };
      return { gate: parseInt(getComputedStyle(document.querySelector("#gate")).zIndex, 10), panel: probe("panel-wrap"), add: probe("addwrap") };
    });
    check("lock: the passcode card is above the panel and the add-client form", z.gate > z.panel && z.gate > z.add, JSON.stringify(z));
    await t.ctx.close();
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
    await page.click("a.kit-tab[href='#/tickets']");
    await page.waitForSelector("#screen-tickets tr.tk-row");
    const nos = () => page.$$eval("#screen-tickets tr.tk-row .tk-no", (ns) => ns.map((n) => n.textContent.trim()));
    let list = await nos();
    check("tickets: the last 30 days by default (no T-, not the 45-day-old one)", list.length === 4 && !list.includes("C-103900") && !list.some((x) => /^T-/.test(x)), list.join(","));
    check("tickets: the From box says 30 days back", (await valOf(page, "#tk-from")) === mock.tkDate(29) && (await valOf(page, "#tk-to")) === mock.tkDate(0),
      await valOf(page, "#tk-from"));
    const sum = norm(await page.textContent("#tk-sum"));
    check("tickets: the count and total line", /4 tickets/.test(sum) && /69 500 000/.test(sum), sum);
    const refund = norm(await page.textContent("#screen-tickets tr.tk-row:has(.tk-no:text-is('C-104230')) .tk-net"));
    check("tickets: a refund shows negative", refund === "-9 800 000", refund);
    check("tickets: table with card header and tags", await page.evaluate(() => {
      const t = document.querySelector("#screen-tickets table.tbl");
      const th = t && t.querySelector("thead th");
      const sold = t && t.querySelector("tr.tk-row .tag.act");
      return !!th && getComputedStyle(th).backgroundColor === "rgb(238, 241, 247)" && !!sold && /posted/i.test(sold.textContent);
    }));
    const d0 = norm(await page.textContent("#screen-tickets tr.tk-row >> nth=0 >> .tk-date"));
    check("tickets: dates read like 15 Nov 2026 14:05", /^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d\d:\d\d$/.test(d0) && !/\d\.\d\d\.\d{4}/.test(d0), d0);
    check("tickets: count line reads 'N tickets · net … so'm'", /^4 tickets · net 69 500 000 so'm$/.test(sum), sum);
    await page.evaluate(() => { LANG = "ru"; renderTkList(); LANG = "en"; });
    const sumRu = norm(await page.textContent("#tk-sum"));
    await page.evaluate(() => renderTkList());
    check("tickets: count line in Russian is pluralised", /^4 чека · нетто 69 500 000 сум$/.test(sumRu), sumRu);
    check("tickets: test sales offered only while training", (await page.$$eval("#tk-source option", (os) => os.map((o) => o.value))).includes("training"));
    await shot(page, "tickets-1024x768");
    await page.selectOption("#tk-source", "delardi");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets tr.tk-row").length === 2);
    list = await nos();
    check("tickets: source 'ours' shows only D-/T-", list.length === 2 && list.every((x) => /^[DT]-/.test(x)), list.join(","));
    await page.selectOption("#tk-source", "");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets tr.tk-row").length === 4);
    await page.fill("#tk-q", "ZZ.00.11001");
    await page.press("#tk-q", "Enter");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets tr.tk-row").length === 1);
    list = await nos();
    check("tickets: search by serial finds the Colibri ticket", list.length === 1 && list[0] === "C-104233", list.join(","));
    await page.fill("#tk-q", "");
    await page.press("#tk-q", "Enter");
    await page.waitForFunction(() => document.querySelectorAll("#screen-tickets tr.tk-row").length === 4);
    await page.click("#screen-tickets tr.tk-row:has(.tk-no:text-is('C-104230'))");
    await page.waitForSelector("#screen-ticket .tl-row");
    const det = norm(await page.textContent("#screen-ticket"));
    check("ticket detail: the refund line shows negative", /-9 800 000/.test(norm(await page.textContent("#screen-ticket .tl-row .tl-net"))), det);
    check("ticket detail: Colibri is read-only (no Void, no Receipt)", !(await page.$("#void")) && !(await page.$("#show-receipt")) && /read-only/i.test(det), det);
    await page.goBack();
    await page.waitForSelector("#screen-tickets tr.tk-row");
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
    check("void: the ticket's status is a Void tag in alert", await page.evaluate(() => !!document.querySelector("#screen-ticket .tk-status .tag.alert")));
    await page.click("#screen-ticket a[href='#/tickets']");
    await page.waitForSelector("#screen-tickets tr.tk-row");
    const vr = await page.evaluate(() => {
      const r = [...document.querySelectorAll("#screen-tickets tr.tk-row")].find((x) => /D-000001/.test(x.textContent));
      const amt = r.querySelector(".tk-net"), cs = getComputedStyle(amt);
      return { tag: !!r.querySelector(".tag.alert"), line: cs.textDecorationLine, colour: cs.color };
    });
    check("tickets: a voided ticket has a Void tag and its amount struck through", vr.tag && vr.line === "line-through" && vr.colour === "rgb(91, 100, 120)", JSON.stringify(vr));
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
    check("admin: no tab without manage", !(await a.page.$("a.kit-tab[href='#/admin']")));
    await a.page.evaluate(() => { location.hash = "#/admin"; });
    await a.page.waitForTimeout(200);
    check("admin: the screen holds no switch without manage", !(await a.page.$("#mode-live")) && !(await a.page.$("#clear-training")));
    await a.ctx.close();

    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await page.click("a.kit-tab[href='#/admin']");
    await page.waitForSelector("#screen-admin #mode-live");
    check("admin: training now", (await page.getAttribute("#mode-training", "aria-pressed")) === "true");
    check("admin: no go-live date yet", /not yet/i.test(await page.textContent("#go-live")));
    // a test sale and a suspended test sale, to clear
    const tok = await page.evaluate(() => JSON.parse(sessionStorage.getItem("sales_session")).token);
    const p = mock.state.pieces.find((x) => x.serial === "ZZ.00.30001");
    mock.handle({ action: "post", token: tok, expect_mode: "training", sale: { walk_in: true, seller: "Dilnoza A.", lines: [{ piece_id: p.piece_id, price_uzs: 31500000 }],
      payments: [{ method: "cash", amount: 31500000 }] } });
    const w = mock.state.pieces.find((x) => x.serial === "ZZ.00.40001");
    mock.handle({ action: "suspend", token: tok, expect_mode: "training", sale: { lines: [{ piece_id: w.piece_id, price_uzs: 245000000 }] } });
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
    await page.waitForFunction((d) => (document.querySelector("#go-live") || {}).textContent.includes(d), niceDay(mock.tkDate(0))).catch(() => {});
    check("admin: the go-live date is shown", (await page.textContent("#go-live")).includes(niceDay(mock.tkDate(0))),
      await page.textContent("#go-live"));
    await page.click("a.kit-tab[href='#/tickets']");
    await page.waitForSelector("#screen-tickets tr.tk-row");
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
      await page.click("a.kit-tab[href='#/tickets']");
      await page.waitForSelector("#screen-tickets tr.tk-row");
      check(`ipad ${tag}: tickets — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: tickets — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-tickets-" + tag);
      await page.click("#screen-tickets tr.tk-row >> nth=0");
      await page.waitForSelector("#screen-ticket .tl-row");
      check(`ipad ${tag}: ticket — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: ticket — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-ticket-" + tag);
      await page.click("a.kit-tab[href='#/admin']");
      await page.waitForSelector("#screen-admin #mode-live");
      check(`ipad ${tag}: admin — no sideways scroll`, await noHScroll(page));
      small = await smallButtons(page);
      check(`ipad ${tag}: admin — buttons ≥ 44 px`, small.length === 0, small.join(", "));
      await shot(page, "ipad-admin-" + tag);
      check(`ipad ${tag} screens: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }

  // ------------------------------------- every screen at both iPad sizes
  // No sideways scroll always; named screenshots (SHOTS) for a visual pass.
  for (const vp of [{ width: 1024, height: 768, land: true }, { width: 768, height: 1024, land: false }]) {
    const tag = vp.width + "x" + vp.height;
    await run("screens pass " + tag, async () => {
      const { ctx, page, errors } = await setup(browser, vp, { touch: true });
      const calm = () => page.waitForFunction(() => !document.querySelector('#toast.show')).catch(() => {});
      const out = (n1, n2) => (vp.land ? n1 : n2);
      await addLine(page, "2000000000031");
      await addLine(page, "2000000000048");
      check(`screens ${tag}: no watermark monogram`, !(await page.$(".watermark")));
      check(`screens ${tag}: sale — no sideways scroll`, await noHScroll(page));
      await calm(); await shot(page, out("01-sale", "08-sale-portrait"));
      await page.fill("#q", "Messika");
      await page.waitForFunction(() => document.querySelectorAll("#sugg .sg").length >= 3);
      check(`screens ${tag}: search — no sideways scroll`, await noHScroll(page));
      if (vp.land) { await calm(); await shot(page, "02-search"); }
      await page.fill("#q", "");
      await openSokolova(page);
      check(`screens ${tag}: client — no sideways scroll`, await noHScroll(page));
      await calm(); await shot(page, out("05-client", "10-client-portrait"));
      await page.evaluate(() => document.querySelector("#client-panel .panel-scrim").click());
      await page.waitForSelector("#client-panel .panel", { state: "detached" });
      await toPay(page);
      await addPay(page, "cash", "100 000 000");
      check(`screens ${tag}: payment — no sideways scroll`, await noHScroll(page));
      await calm(); await shot(page, out("03-payment", "09-payment-portrait"));
      await page.click("#add-card");
      await page.click("[data-card=visa]");
      await page.fill(".pay-row:nth-child(2) input.amt", "176 500 000");
      await page.dispatchEvent(".pay-row:nth-child(2) input.amt", "change");
      await page.click("#post");
      await page.waitForSelector("#screen-receipt .receipt");
      check(`screens ${tag}: receipt — no sideways scroll`, await noHScroll(page));
      if (vp.land) { await calm(); await shot(page, "04-receipt"); }
      await page.click("a.kit-tab[href='#/tickets']");
      await page.waitForSelector("#screen-tickets tr.tk-row");
      check(`screens ${tag}: tickets — no sideways scroll`, await noHScroll(page));
      if (vp.land) { await calm(); await shot(page, "06-tickets"); }
      await page.evaluate(() => lockDown());
      await page.waitForSelector("#gate-pass");
      check(`screens ${tag}: lock — no sideways scroll`, await noHScroll(page));
      if (vp.land) { await calm(); await shot(page, "07-lock"); }
      check(`screens ${tag}: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }

  /* ================================================== final-review fixes */
  // ---------------------------------------------- I2: the till switched elsewhere
  await run("stale mode", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await toPay(page);
    await addPay(page, "cash", "31 500 000");
    const n0 = mock.state.tickets.length;
    mock.switchModeBehind("live");                       // Alex goes Live on the PC
    mock.state.calls.length = 0;
    await page.click("#post");
    await page.waitForFunction(() => /switched to live/.test(document.querySelector("#toast").textContent) &&
      document.querySelector("#toast").classList.contains("show"));
    const first = mock.state.calls.find((c) => c.action === "post");
    check("stale mode: the post carries the mode the screen shows", first && first.expect_mode === "training", JSON.stringify(first));
    check("stale mode: refused, nothing posted", mock.state.tickets.length === n0);
    check("stale mode: the message is shown", norm(await page.textContent("#toast")) === "the till was switched to live — reload",
      norm(await page.textContent("#toast")));
    await page.waitForSelector(".training-band", { state: "detached" });
    check("stale mode: the TRAINING banner goes", !(await page.$(".training-band")));
    check("stale mode: the reference is reloaded", mock.state.calls.some((c) => c.action === "reference"));
    check("stale mode: still on the payment screen, sale kept", !!(await page.$("#screen-pay")) && (await page.$$(".pay-row")).length === 1);
    mock.state.calls.length = 0;
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    const again = mock.state.calls.find((c) => c.action === "post");
    check("stale mode: posting again (now knowingly Live) goes through as D-", /D-000003/.test(await page.textContent("#screen-receipt")) &&
      again && again.expect_mode === "live", JSON.stringify(again && again.expect_mode));
    check("stale mode: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });
  await run("mode from replies", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    check("mode from replies: TRAINING at first", !!(await page.$(".training-band")));
    mock.switchModeBehind("live");
    await page.fill("#q", "Messika");
    await page.waitForSelector(".training-band", { state: "detached", timeout: 5000 }).catch(() => {});
    check("mode from replies: a search answer in Live removes the banner", !(await page.$(".training-band")));
    mock.switchModeBehind("training");
    await page.evaluate(() => loadDrafts());
    await page.waitForSelector(".training-band", { timeout: 5000 }).catch(() => {});
    check("mode from replies: a drafts answer in training brings it back", !!(await page.$(".training-band")));
    mock.switchModeBehind("live");
    await page.evaluate(() => api("ping"));
    await page.waitForSelector(".training-band", { state: "detached", timeout: 5000 }).catch(() => {});
    check("mode from replies: a ping answer updates it too", !(await page.$(".training-band")) && await page.evaluate(() => S.mode === "live"));
    mock.switchModeBehind("training");
    await addLine(page, "2000000000031");
    await page.selectOption("#seller", "Dilnoza A.");
    mock.switchModeBehind("live");
    mock.state.calls.length = 0;
    await page.click("#suspend");
    await page.waitForFunction(() => /switched to live/.test(document.querySelector("#toast").textContent));
    const sus = mock.state.calls.find((c) => c.action === "suspend");
    check("mode from replies: suspend carries expect_mode and is refused after a switch", sus && sus.expect_mode === "training" &&
      mock.state.drafts.length === 0 && (await page.$$("#lines .line")).length === 1, JSON.stringify(sus && sus.expect_mode));
    check("mode from replies: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ------------------------------------------ I3: Sales rights, no CRM view right
  await run("sales only, no crm", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { login: false });
    await login(page, "nocrm");
    await page.waitForSelector("#screen-sale");
    check("sales only: rights.crm is false", await page.evaluate(() => S.rights.crm === false));
    await page.click("a.kit-tab[href='#/tickets']");
    await page.waitForSelector("#screen-tickets tr.tk-row");
    const list = norm(await page.textContent("#screen-tickets"));
    const row = norm(await page.textContent("#screen-tickets tr.tk-row:has(.tk-no:text-is('D-000002')) .tk-client"));
    check("sales only: the list shows the client reference, not the name", row === "DLD-9001" && !/Соколова/.test(list), row);
    const listCall = mock.state.calls.filter((c) => c.action === "tickets").pop();
    const [, listRes] = mock.handle(Object.assign({}, listCall));
    check("sales only: no client_name in the list answer", listRes.rows.every((r) => !("client_name" in r)), JSON.stringify(listRes.rows[0]));
    await page.click("#screen-tickets tr.tk-row:has(.tk-no:text-is('D-000002'))");
    await page.waitForSelector("#screen-ticket .tl-row");
    await page.click("#show-receipt");
    await page.waitForSelector("#screen-ticket .receipt");
    const det = norm(await page.evaluate(() => document.querySelector("#screen-ticket").innerText));
    check("sales only: the receipt says Client: DLD-9001, without the name", /Client: DLD-9001/.test(det) && !/Соколова/.test(det), det);
    await page.goBack();
    await page.waitForSelector("#screen-tickets tr.tk-row");
    await page.click("#screen-tickets tr.tk-row:has(.tk-no:text-is('C-104230'))");
    await page.waitForSelector("#screen-ticket .tl-row");
    const det2 = norm(await page.evaluate(() => document.querySelector("#screen-ticket").innerText));
    check("sales only: Colibri's raw client text is not shown", !/Invented Buyer/.test(det2), det2);
    // a walk-in receipt is unchanged
    const tok = await page.evaluate(() => JSON.parse(sessionStorage.getItem("sales_session")).token);
    const [, d1] = mock.handle({ action: "ticket", token: tok, ticket_id: "30000000-0000-4000-8000-000000000003" });
    check("sales only: a Walk-in receipt keeps 'Client: Walk-in'", /Client: Walk-in/.test(d1.ticket.receipt_text));
    const p = mock.state.pieces.find((x) => x.serial === "ZZ.00.30001");
    const [st403, b403] = mock.handle({ action: "post", token: tok, expect_mode: "training", sale: { client_id: "DLD-9001", seller: "Dilnoza A.",
      lines: [{ piece_id: p.piece_id, price_uzs: 31500000 }], payments: [{ method: "cash", amount: 31500000 }] } });
    check("sales only: (contract) a post naming a client is 403", st403 === 403 && b403.error === "Your account cannot attach clients — use Walk-in.", b403.error);
    // the page posts Walk-in, which goes through
    await page.click("a.kit-tab[href='#/sale']");
    await page.waitForSelector("#screen-sale");
    await addLine(page, "2000000000031");
    await toPay(page);
    await addPay(page, "cash", "31 500 000");
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    check("sales only: a Walk-in sale posts", /T-000001/.test(await page.textContent("#screen-receipt")));
    check("sales only: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------- amounts and discounts
  await run("amount input", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    const price = "#lines .line:nth-child(1) input.l-price";
    const priceIs = () => page.evaluate(() => S.sale.lines[0].price_uzs);
    const inv = (sel) => page.$eval(sel, (n) => n.getAttribute("aria-invalid") === "true");
    for (const [typed, want] of [["31500000.00", 31500000], ["31 500 000,00", 31500000], ["31.500.000", 31500000],
      ["31 500 000", 31500000], ["31\u00a0500\u00a0000", 31500000], ["31500000.5", 31500000]]) {
      await page.fill(price, typed);
      check(`amount: "${typed}" → ${want}`, (await priceIs()) === want && !(await inv(price)), String(await priceIs()));
    }
    await page.fill(price, "-5");
    check("amount: a minus sign is refused (invalid, no price)", (await priceIs()) === null && (await inv(price)) &&
      (await page.$eval("#to-pay", (b) => b.disabled)), String(await priceIs()));
    await page.fill(price, "31500000");
    check("amount: a good value clears the invalid mark", !(await inv(price)) && (await priceIs()) === 31500000);
    // discount
    const disc = "#lines .line:nth-child(1) input.l-disc";
    const pctIs = () => page.evaluate(() => S.sale.lines[0].discount_pct);
    await page.fill(disc, "12,5");
    check("discount: a comma works as the decimal separator", (await pctIs()) === 12.5 && !(await inv(disc)), String(await pctIs()));
    await page.fill(disc, "2.1234");
    check("discount: four decimals accepted", (await pctIs()) === 2.1234 && !(await inv(disc)), String(await pctIs()));
    for (const bad of ["2.12345", "1.2.3", "-5", "5%x"]) {
      await page.fill(disc, bad);
      check(`discount: "${bad}" is refused (invalid, To pay disabled)`, (await inv(disc)) && (await page.$eval("#to-pay", (b) => b.disabled)) &&
        (await pctIs()) === 2.1234, String(await pctIs()));
    }
    await page.fill(disc, "5");
    check("discount: a good value clears the invalid mark", !(await inv(disc)) && (await pctIs()) === 5 && !(await page.$eval("#to-pay", (b) => b.disabled)));
    // payment amount
    await toPay(page);
    await addPay(page, "cash", "29925000.00");
    check("payment: \"29925000.00\" is 29 925 000, not ×100", norm(await valOf(page, ".pay-row:nth-child(1) input.amt")) === "29 925 000" &&
      (await postEnabled(page)), await valOf(page, ".pay-row:nth-child(1) input.amt"));
    await page.fill(".pay-row:nth-child(1) input.amt", "-29925000");
    await page.dispatchEvent(".pay-row:nth-child(1) input.amt", "change");
    check("payment: a minus sign is refused", (await inv(".pay-row:nth-child(1) input.amt")) && !(await postEnabled(page)));
    check("amount input: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  // ----------------------------------------------------- payment and receipt on the kit
  const geo = (page, sel) => page.$eval(sel, (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, b: r.bottom, w: r.width }; });
  await run("pay on the kit", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await addLine(page, "2000000000048");
    await toPay(page);
    await addPay(page, "cash", "100 000 000");
    const m = await geo(page, ".pay-main"), sd = await geo(page, ".pay-side");
    check("pay: two columns at 1024 — methods left, summary right", sd.l > m.l + 100 && Math.abs(sd.t - m.t) <= 4, JSON.stringify([m, sd]));
    check("pay: the summary column is on the card ground", await page.$eval(".pay-side", (n) => getComputedStyle(n).backgroundColor) === "rgb(238, 241, 247)");
    const side = norm(await page.textContent(".pay-side"));
    check("pay: summary shows To pay, Paid, Left to pay and Post sale", /To pay/.test(side) && /Paid/.test(side) && /Left to pay/.test(side) && /Post sale/.test(side) &&
      await page.$eval("#post", (b) => b.matches(".btn.primary") && !!b.closest(".pay-side")), side);
    check("pay: the summary lists the lines and the To pay amount is a key number",
      (await page.$$(".pay-side .ps-line")).length === 2 && await page.$eval(".pay-side .keynum", (k) => { const n = (t) => Number(t.replace(/\D/g, "")); return n(k.textContent) === [...document.querySelectorAll(".ps-line .money")].reduce((x, m) => x + n(m.textContent), 0) && n(k.textContent) > 0; }));
    check("pay: Back to the sale sits in the summary", /Back to the sale/.test(norm(await page.textContent("#back"))) && await page.$eval("#back", (b) => !!b.closest(".pay-side")));
    await page.click("#add-card");
    check("pay: the Card menu still opens with Uzcard, Humo, Visa", (await page.$$eval("[data-card]", (bs) => bs.map((b) => b.dataset.card))).join() === "uzcard,humo,visa");
    await page.click("#add-card");
    check("pay: cash notice hidden below the limit", !(await page.isVisible(".cash-notice")));
    await page.fill(".pay-row:nth-child(1) input.amt", "170 000 001");
    await page.dispatchEvent(".pay-row:nth-child(1) input.amt", "change");
    check("pay: cash notice is a .notice box and appears above 170 000 000 cash",
      await page.isVisible(".notice.cash-notice") && /card/i.test(await page.textContent(".notice.cash-notice")));
    await page.setViewportSize({ width: 768, height: 1024 });
    const m2 = await geo(page, ".pay-main"), s2 = await geo(page, ".pay-side");
    check("pay: stacks at 768 wide", s2.t >= m2.b - 1 && s2.w > 600, JSON.stringify([m2, s2]));
    check("pay: no sideways scroll at 768", await noHScroll(page));
    check("pay: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });
  await run("pay in Russian", async () => {
    const { ctx, page } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await page.click(".kit-lang button[lang=ru]");
    await page.waitForSelector("#screen-sale");
    await toPay(page, { seller: "Dilnoza A." });
    const t = norm(await page.textContent(".pay-side"));
    check("pay (RU): Left to pay, Back to the sale and To pay are translated", /Осталось оплатить/.test(t) && /Вернуться к продаже/.test(t) && !/Left to pay|Back to the sale/.test(t), t);
    await ctx.close();
  });
  for (const mode of ["training", "live"]) {
    await run("receipt on the kit " + mode, async () => {
      const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 }, { mode });
      await addLine(page, "2000000000031");
      await toPay(page);
      await addPay(page, "cash", "31 500 000");
      await page.click("#post");
      await page.waitForSelector("#screen-receipt .receipt");
      const r = await geo(page, "#screen-receipt .receipt"), sv = await geo(page, ".saved-panel");
      check(`receipt ${mode}: preview on the left, Sale saved panel on the right`, sv.l > r.l + r.w - 1 && /Sale saved/.test(await page.textContent(".saved-panel")), JSON.stringify([r, sv]));
      check(`receipt ${mode}: preview sits on a card ground`, await page.$eval(".receipt-stage", (n) => getComputedStyle(n).backgroundColor) === "rgb(238, 241, 247)");
      const sp = norm(await page.textContent(".saved-panel"));
      check(`receipt ${mode}: panel has the ticket, the amount, Print receipt and New sale`, /(T|D)-\d{6}/.test(sp) && /31 500 000/.test(sp) && /Print receipt/.test(sp) && !!(await page.$(".saved-panel #new-sale")), sp);
      if (mode === "training") {
        check("receipt training: the note and the TRAINING strip show", /not appear in reports|cleared/i.test(sp) && !!(await page.$(".receipt .rc-train")), sp);
        await page.setViewportSize({ width: 768, height: 1024 });
        const r2 = await geo(page, "#screen-receipt .receipt"), s2 = await geo(page, ".saved-panel");
        check("receipt: stacks under 900 px", s2.t >= r2.b - 1, JSON.stringify([r2, s2]));
        check("receipt: no sideways scroll at 768", await noHScroll(page));
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.emulateMedia({ media: "print" });
        check("receipt print: the side panel and the page chrome do not print, the receipt does",
          !(await page.isVisible(".saved-panel")) && !(await page.isVisible(".top")) && await page.isVisible("#screen-receipt .receipt"));
        await page.emulateMedia({ media: "screen" });
      } else {
        check("receipt: Live shows no TRAINING strip and no empty gap", !(await page.$(".receipt .rc-train")) && !/training/i.test(sp) &&
          await page.$eval(".receipt .rc-body", (b) => { const f = [...b.children].find((c) => c.offsetHeight > 0); return !!f && f.getBoundingClientRect().top - b.getBoundingClientRect().top <= 24; }));
      }
      check(`receipt ${mode}: the date on the receipt is dd.mm.yyyy hh:mm`, /\d\d\.\d\d\.\d{4} \d\d:\d\d/.test(await page.textContent(".receipt .rc-ticket")));
      check(`receipt ${mode}: no script errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    });
  }

  await run("receipt reload", async () => {
    const { ctx, page, errors } = await setup(browser, { width: 1024, height: 768 });
    await addLine(page, "2000000000031");
    await addLine(page, "2000000000048");
    await toPay(page);
    const due = norm(await page.textContent("#total")).replace(/\s*so'm$/, "");
    await addPay(page, "cash", due);
    await page.click("#post");
    await page.waitForSelector("#screen-receipt .receipt");
    const tk = mock.state.tickets[mock.state.tickets.length - 1];
    tk.lines.forEach((l) => { l.net = String(l.net); });          // numerics arrive as strings from the API
    await page.reload();
    await page.waitForSelector("#screen-receipt .saved-panel");
    const sp = norm(await page.textContent(".saved-panel"));
    check("receipt reload: the amount is the grouped total even when net arrives as a string", sp.includes("· " + due + " so'm"), sp + " | due " + due);
    check("receipt reload: no script errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
