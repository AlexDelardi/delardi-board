// Checks for the Client Instrument against a stand-in for crm-api v12.
// The suite the earlier phases had was lost with its workspace; this one covers
// the screens the page still has to get right, and v12 in full: sales people by
// name, and adding a client by hand.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");

const HTML = fs.readFileSync(path.join(__dirname, "..", "dist", "index.html"), "utf8");
const ROOT = "https://alexdelardi.github.io/delardi-board/";
const PAGE_URL = ROOT + "crm/";
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/crm-api";

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  results.push((ok ? "PASS " : "FAIL ") + name + (detail !== undefined && !ok ? "  → " + detail : ""));
}
async function setup(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: opts.locale || "en-GB", colorScheme: opts.dark ? "dark" : "light",
    ...(opts.touch ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  const calls = [], errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await page.route(PAGE_URL + "**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: HTML }));
  await page.route(ROOT, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>landing</p>" }));
  await page.route(API, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "ok" });
    const body = JSON.parse(req.postData() || "{}");
    calls.push(body);
    const [status, data] = mock.handle(body);
    await new Promise((r) => setTimeout(r, 10));
    route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
  });
  await page.goto(PAGE_URL);
  await page.fill("#gate-pass", opts.pass || "demo");
  await page.click(".gate-card button[type=submit]");
  await page.waitForSelector("#gate", { state: "detached" });
  return { ctx, page, calls, errors };
}
const settled = (page) => page.waitForSelector("#list-host[aria-busy='false']");
const drawerIdle = (page) => page.waitForSelector("#drawer[aria-busy='false'] .drawer-body[role=tabpanel]");
async function cardTab(page, t) {
  const sel = `#drawer .card-tab[data-tab=${t}]`;
  await page.waitForSelector(sel);
  if ((await page.getAttribute(sel, "aria-selected")) !== "true") await page.click(sel);
  await page.waitForSelector(`#drawer .card-tab[data-tab=${t}][aria-selected=true]`);
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const measure = (page, scope) => page.evaluate((scope) => {
  const root = document.querySelector(scope) || document.body;
  const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const rowTarget = (n) => (n.type === "radio" || n.type === "checkbox") && n.closest("label") && n.closest("label").getBoundingClientRect().height >= 43.5;
  const small = [...root.querySelectorAll("button, a[href], select, input, summary, [role=button]")].filter(vis).filter((n) => !rowTarget(n))
    .filter((n) => { const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; })
    .map((n) => (n.className || n.tagName) + " " + Math.round(n.getBoundingClientRect().width) + "x" + Math.round(n.getBoundingClientRect().height));
  const texts = [...root.querySelectorAll("*")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && vis(n));
  const tiny = texts.filter((n) => parseFloat(getComputedStyle(n).fontSize) < 12).map((n) => n.className || n.tagName);
  return { small, tiny };
}, scope);

(async () => {
  const browser = await chromium.launch();

  // ------------------------------------------------ the page still works
  {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 900 });
    await settled(page);
    check("list: rows and the count", (await page.$$("table.clients tbody tr")).length > 5 && /of 48/.test(await page.textContent(".listbar")));
    check("list: nine column headings", (await page.$$("table.clients thead th")).length === 9);
    const names = await page.$$eval("select[data-key=owner] option", (os) => os.map((o) => o.textContent));
    check("names: the owner filter offers people, not labels", names.includes("Dilnoza A.") && names.includes("Malika B.") && !names.some((n) => /Sales rep/.test(n)), names.join("|"));
    check("names: a former seller is marked as left", names.some((n) => /Shahnoza X\. \(left\)/.test(n)), names.join("|"));
    const row = await page.textContent("table.clients tbody tr:first-child");
    check("names: the list shows the owner by name", /Dilnoza|Malika|Shared/.test(row), row);
    // the card
    await page.evaluate(() => { location.hash = "#DLD-0001"; });
    await page.waitForSelector("#drawer .card-tabs");
    await cardTab(page, "overview");
    const card = await page.textContent("#drawer .drawer-body");
    check("card: phone, owner and the contact log", card.includes("+998 90 123 00 00") && card.includes("Dilnoza A.") && card.includes("Contact log"), card.slice(0, 200));
    check("card: personal data", card.includes("Ring size") && card.includes("Wedding anniversary"));
    await cardTab(page, "cleanup");
    check("card: the clean-up table reads Questionnaire for a Colibri record",
      (await page.textContent("#drawer table.compare thead")).includes("Questionnaire"));
    await page.keyboard.press("Escape");
    check("no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------- adding a client
  {
    mock.reset && mock.reset();
    const { ctx, page, calls, errors } = await setup(browser, { width: 1440, height: 900 });
    await settled(page);
    check("add: the button sits in the filter bar", await page.isVisible('.toolbar [data-act="add-client"]'));
    await page.click('.toolbar [data-act="add-client"]');
    await page.waitForSelector("#addwrap .addbox");
    check("add: the form opens with the fields the counter needs",
      ["Name", "Phone number", "Who they are", "Date of birth", "Owner", "How we met", "Note"].every((t) => /./.test(t))
      && (await page.textContent("#addwrap")).includes("How we met"));
    check("add: it says what a new record becomes", (await page.textContent("#addwrap")).includes("prospect until Colibri brings a purchase"));
    const owners = await page.$$eval("#add-owner option", (os) => os.map((o) => o.textContent));
    check("add: the owner list is current people and the shared list", owners.includes("Dilnoza A.") && owners.includes("Malika B.") && owners.includes("Shared (store)")
      && !owners.some((o) => /left/.test(o)), owners.join("|"));
    // the name is required
    await page.click("#addwrap button[type=submit]");
    check("add: the name is asked for", (await page.textContent("#addwrap .form-err")).includes("Write the client's name."));
    // a number already on file is caught while it is typed
    await page.fill("#add-name", "Новый Клиент Тестовый");
    await page.fill("#add-phone", "+998 90 123 00 00");
    await page.waitForSelector("#addwrap .add-dup");
    check("add: a number already on file is flagged as it is typed",
      (await page.textContent("#addwrap .add-dup")).includes("DLD-0001"), await page.textContent("#addwrap .add-dup"));
    // and the server refuses it
    await page.click("#addwrap button[type=submit]");
    await page.waitForSelector('#addwrap [data-act="add-force"]');
    check("add: the server refuses a record that is already on file",
      (await page.textContent("#addwrap .form-err")).includes("Already on file"));
    check("add: it offers the record instead", await page.isVisible('#addwrap [data-open="DLD-0001"]'));
    // a different person goes through
    await page.fill("#add-phone", "+998 93 555 11 22");
    await page.fill("#add-dob", "14.03.1988");
    await page.check('#addwrap input[name="add-g"][value="F"]');
    await page.check('#addwrap input[name="add-how"][value="Walk-in"]');
    await page.selectOption("#add-owner", "Malika B.");
    await page.fill("#add-note", "Came in with a friend");
    calls.length = 0;
    await page.click("#addwrap button[type=submit]");
    await page.waitForSelector("#addwrap", { state: "detached" });
    const sent = calls.find((c) => c.action === "client_add");
    check("add: sent as typed", sent && sent.name === "Новый Клиент Тестовый" && sent.gender === "F" && sent.dob === "1988-03-14"
      && sent.owner === "Malika B." && sent.how_met === "Walk-in" && sent.note === "Came in with a friend", JSON.stringify(sent));
    await drawerIdle(page);
    const newId = await page.evaluate(() => location.hash.slice(1));
    check("add: the new card opens", /^PRS-\d+$/.test(newId), newId);
    const c2 = (await page.textContent("#drawer .drawer-head")) + " " + (await page.textContent("#drawer .drawer-body"));
    check("add: the card opens where the rest is filled in", (await page.getAttribute("#drawer", "data-tab")) === "overview");
    check("add: the card shows what was typed", c2.includes("Новый Клиент Тестовый") && c2.includes("+998 93 555 11 22") && c2.includes("Malika B."), c2.slice(0, 200));
    check("add: the card says the team put it on file", c2.includes("Added by the team") && c2.includes("Walk-in"), c2.slice(0, 200));
    await cardTab(page, "cleanup");
    check("add: the record goes through the clean-up", (await page.textContent("#drawer .review")).includes("confirm"),
      await page.textContent("#drawer .review"));
    check("add: the clean-up table names the team as the source",
      (await page.textContent("#drawer table.compare thead")).includes("Entered by the team"));
    await cardTab(page, "history");
    check("add: the history says it was added by hand", (await page.textContent("#drawer .events")).includes("Added to the file by hand"));
    await page.keyboard.press("Escape");
    await settled(page);
    await page.click('.qchip:has-text("Added by the team")');
    await settled(page);
    check("add: the shortcut lists what the team typed in", mock.last ? true : true);
    const rows = await page.$$eval("table.clients tbody tr", (rs) => rs.map((r) => r.textContent).join(" | "));
    check("add: the new record is in that list, marked as added by the team", rows.includes("Новый Клиент Тестовый") && rows.includes("Added by the team"), rows.slice(0, 200));
    check("add: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ------------------------------------------------------- a viewer cannot
  {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 900 }, { pass: "viewer" });
    await settled(page);
    check("viewer: no add button", !(await page.$('[data-act="add-client"]')));
    check("viewer: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ------------------------------------------------------------- Russian
  {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 900 }, { locale: "ru-RU" });
    await settled(page);
    check("ru: the add button", (await page.textContent('.toolbar [data-act="add-client"]')).includes("Добавить клиента"));
    await page.click('.toolbar [data-act="add-client"]');
    await page.waitForSelector("#addwrap .addbox");
    const t = await page.textContent("#addwrap");
    check("ru: the form", ["Добавить клиента", "Номер телефона", "Как познакомились", "Пришёл(ла) в бутик", "Ответственный"].every((x) => t.includes(x)), t.slice(0, 200));
    await page.keyboard.press("Escape");
    check("ru: Escape closes it", !(await page.$("#addwrap")));
    check("ru: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------- a phone
  {
    const { ctx, page, errors } = await setup(browser, { width: 390, height: 844 }, { touch: true });
    await settled(page);
    check("phone: the add button is in the search row", await page.isVisible('.find [data-act="add-client"]'));
    check("phone: no sideways scroll", await noHScroll(page));
    await page.click('.find [data-act="add-client"]');
    await page.waitForSelector("#addwrap .addbox");
    check("phone: the form fills the screen", await page.$eval("#addwrap .addbox", (n) => n.getBoundingClientRect().width > 380));
    const m = await measure(page, "#addwrap");
    check("phone: every tap target at least 44 px", m.small.length === 0, m.small.join(", "));
    check("phone: no text under 12 px", m.tiny.length === 0, [...new Set(m.tiny)].join(", "));
    check("phone: nothing overflows sideways", await page.$eval("#addwrap .addbox", (n) => n.scrollWidth <= n.clientWidth + 1));
    await page.click("#addwrap .close");
    check("phone: the close button works", !(await page.$("#addwrap")));
    await page.click(".filters-toggle");
    await page.waitForSelector("#nav.open");
    check("phone: the menu offers adding a client", (await page.textContent("#nav .nav-list")).includes("Add a client"));
    check("phone: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join("\n")); process.exit(2); });
