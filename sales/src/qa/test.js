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
  if (pass === "demo") await page.waitForSelector("#gate", { state: "detached" });
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
    await page.waitForSelector("#toast.show");
    check("scan adds one: the same piece twice is refused", (await page.$$("#lines .line")).length === 1 &&
      /already in this sale/i.test(await page.textContent("#toast")));

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

  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
