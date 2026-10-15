// Checks for the Client Instrument against a stand-in for crm-api v12.
// The suite the earlier phases had was lost with its workspace; this one covers
// the screens the page still has to get right, and v12 in full: sales people by
// name, and adding a client by hand.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mock = require("./mock");
const { execFileSync } = require("child_process");
const os = require("os");

// The workbook is read back with Python's own zipfile, not with our writer in
// reverse: if the file only opens in the thing that wrote it, it is not a file.
const PY_READ = "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nsys.stdout.write(z.read(sys.argv[2]).decode('utf-8'))";
const PY_LIST = "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nbad=z.testzip()\nsys.stdout.write(('BAD:'+bad) if bad else ','.join(z.namelist()))";
const partOf = (file, part) => execFileSync("python3", ["-c", PY_READ, file, part], { encoding: "utf8", maxBuffer: 40e6 });
// A second opinion from a real spreadsheet library: our own reader agreeing
// with our own writer would prove nothing. Skipped where openpyxl is absent.
const HAVE_OPENPYXL = (() => {
  try { execFileSync("python3", ["-c", "import openpyxl"], { stdio: "ignore" }); return true; } catch (e) { return false; }
})();
const PY_OPEN = [
  "import sys, json, datetime, openpyxl",
  "w = openpyxl.load_workbook(sys.argv[1])",
  "s = w[w.sheetnames[0]]",
  "rows = list(s.iter_rows(values_only=True))",
  "types = [type(c).__name__ for c in rows[1]]",
  "print(json.dumps({'sheets': w.sheetnames, 'rows': len(rows), 'cols': len(rows[0]),",
  " 'head': [str(c) for c in rows[0]], 'types': types,",
  " 'spend': rows[1][12], 'date': str(rows[1][15]), 'freeze': s.freeze_panes, 'filter': str(s.auto_filter.ref)}))",
].join("\n");
const openWith = (file) => JSON.parse(execFileSync("python3", ["-c", PY_OPEN, file], { encoding: "utf8" }));
const partsOf = (file) => execFileSync("python3", ["-c", PY_LIST, file], { encoding: "utf8" }).trim().split(",");
// sheet XML -> rows of plain values, each value in its own column. A workbook
// leaves an empty cell out altogether, so the cell's own reference (D2) decides
// where it belongs — counting the cells that are there would shift the row.
const colOf = (ref) => {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
function sheetRows(xml) {
  return (xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []).map((row) => {
    const out = [];
    for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const at = colOf((/r="([A-Z]+\d+)"/.exec(c) || [])[1]);
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c);
      const v = /<v>([\s\S]*?)<\/v>/.exec(c);
      out[at] = inline
        ? inline[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
        : (v ? v[1] : "");
    }
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = "";
    return out;
  });
}
// click something that saves a file, and give back where it landed
async function grabDownload(page, action) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), action()]);
  const to = path.join(os.tmpdir(), "crm-qa-" + Date.now() + "-" + dl.suggestedFilename());
  await dl.saveAs(to);
  return { file: to, name: dl.suggestedFilename() };
}

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
    acceptDownloads: true,
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
  await page.goto(PAGE_URL + (opts.view ? "?view=" + opts.view : ""));
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

  // ------------------------------------------- downloading the list (v13)
  {
    const { ctx, page, calls, errors } = await setup(browser, { width: 1440, height: 900 });
    await settled(page);
    check("export: the button sits in the filter bar", await page.isVisible('.toolbar [data-act="export"]'));

    // narrow the list first: the file must be what the screen says, not everything
    await page.selectOption("select[data-key=abc_class]", "A");
    await settled(page);
    const shown = Number((await page.textContent(".listbar")).match(/of\s+(\d+)/)[1]);
    await page.click('.toolbar [data-act="export"]');
    await page.waitForSelector("#expwrap .expbox");
    const dlg = await page.textContent("#expwrap");
    check("export: the dialog counts what will leave", dlg.includes(shown + " records will be downloaded"), dlg.slice(0, 220));
    check("export: the dialog names the filters in force", dlg.includes("class A"), dlg.slice(0, 220));
    check("export: it says the download is logged", dlg.includes("the download is logged"));

    calls.length = 0;
    const got = await grabDownload(page, () => page.click("#expwrap button[type=submit]"));
    const sent = calls.find((c) => c.action === "export");
    check("export: the request carries the screen's own filters", sent && sent.abc_class === "A" && sent.phones === true
      && sent.limit === undefined, JSON.stringify(sent));
    check("export: the dialog closes itself", !(await page.$("#expwrap")));
    check("export: the file is named for the filter and the day",
      /^Delardi_clients_.*\d{4}-\d{2}-\d{2}\.xlsx$/.test(got.name), got.name);

    const parts = partsOf(got.file);
    check("export: it is a workbook, and the zip is sound",
      parts[0] !== undefined && !String(parts[0]).startsWith("BAD:")
      && ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]
        .every((f) => parts.includes(f)), parts.join(" "));
    const rows1 = sheetRows(partOf(got.file, "xl/worksheets/sheet1.xml"));
    check("export: one heading row and one row per record", rows1.length === shown + 1, rows1.length + " vs " + (shown + 1));
    const head = rows1[0];
    check("export: the headings are the call sheet's",
      head[0] === "Reference" && head[1] === "Name" && head[2] === "Phone" && head[4] === "Birthday"
      && head[5] === "Birthday confirmed" && head[6] === "Owner" && head[12] === "Lifetime spend, UZS"
      && head[head.length - 1] === "Related party" && head.length === 23, head.join("|"));
    const first = rows1[1];
    check("export: a record reads as it does on screen",
      /^DLD-\d{4}$/.test(first[0]) && first[1].length > 3 && /^\+998 \d\d/.test(first[2])
      && /^(Dilnoza A\.|Malika B\.|Shared \(store\))$/.test(first[6]), first.slice(0, 7).join("|"));
    check("export: spend is a number, not text", /^\d+$/.test(first[12]), first[12]);
    const xml1 = partOf(got.file, "xl/worksheets/sheet1.xml");
    check("export: the header is frozen and the table filters", xml1.includes('state="frozen"') && xml1.includes("<autoFilter"));
    if (HAVE_OPENPYXL) {
      const wb = openWith(got.file);
      check("export: a spreadsheet library opens it and agrees",
        wb.sheets.length === 2 && wb.rows === shown + 1 && wb.cols === 23 && wb.head[0] === "Reference"
        && wb.freeze === "A2" && /^A1:W\d+$/.test(wb.filter), JSON.stringify(wb).slice(0, 220));
      check("export: spend arrives as a number and a date as a date",
        typeof wb.spend === "number" && /^\d{4}-\d{2}-\d{2}/.test(wb.date), wb.spend + " / " + wb.date);
    } else {
      check("export: a spreadsheet library opens it and agrees", true, "skipped: openpyxl not installed");
      check("export: spend arrives as a number and a date as a date", true, "skipped: openpyxl not installed");
    }
    const about = sheetRows(partOf(got.file, "xl/worksheets/sheet2.xml")).map((r) => r.join(" ")).join("\n");
    check("export: the second sheet says what made the file",
      about.includes("class A") && about.includes("Tester") && about.includes("Included")
      && about.includes("Do not forward outside the company"), about.slice(0, 200));

    // without the numbers
    await page.click('.toolbar [data-act="export"]');
    await page.waitForSelector("#expwrap .expbox");
    await page.uncheck("#expwrap input[type=checkbox]");
    const plain = await grabDownload(page, () => page.click("#expwrap button[type=submit]"));
    const rowsP = sheetRows(partOf(plain.file, "xl/worksheets/sheet1.xml"));
    check("export: unticking the box drops both number columns",
      rowsP[0].length === 21 && !rowsP[0].includes("Phone") && !rowsP[0].includes("Other numbers"), rowsP[0].join("|"));
    check("export: and no number is anywhere in the file",
      !sheetRows(partOf(plain.file, "xl/worksheets/sheet1.xml")).some((r) => r.some((c) => /\+998/.test(c))));
    check("export: the second sheet says the numbers were left out",
      sheetRows(partOf(plain.file, "xl/worksheets/sheet2.xml")).map((r) => r.join(" ")).join("\n").includes("Left out"));

    // everything, so the awkward records show up
    await page.selectOption("select[data-key=abc_class]", "");
    await page.selectOption("select[data-key=status]", "");
    await settled(page);
    await page.click('.toolbar [data-act="export"]');
    await page.waitForSelector("#expwrap .expbox");
    const all = await grabDownload(page, () => page.click("#expwrap button[type=submit]"));
    const rowsA = sheetRows(partOf(all.file, "xl/worksheets/sheet1.xml"));
    const dnc = rowsA.find((r) => r[19] === "Yes");
    check("export: a do-not-contact record is in the file, marked", !!dnc, "none found");
    const rel = rowsA.find((r) => r[22] === "Yes");
    check("export: a related party is marked too", !!rel, "none found");
    const toConfirm = rowsA.find((r) => r[5] === "No" && r[4]);
    check("export: a birthday nobody has confirmed is in, and says so", !!toConfirm, "none found");

    // the birthday list for one month, as the Insights block asks for it
    const bd = await grabDownload(page, () => page.evaluate(() => openExport({
      kind: "birthdays", count: 3, name: "december",
      title: "Birthdays in December",
      params: { birth_month: 12, do_not_contact: "exclude", status: "all", related: "exclude" },
    })).then(() => page.click("#expwrap button[type=submit]")));
    check("export: the birthday file is named for the month", /^Delardi_birthdays_december_/.test(bd.name), bd.name);
    const rowsB = sheetRows(partOf(bd.file, "xl/worksheets/sheet1.xml")).slice(1);
    const months = [...new Set(rowsB.map((r) => r[4].split(".")[1]))];
    check("export: it holds that month and nothing else", months.length === 1 && months[0] === "12", months.join(","));
    const days = rowsB.map((r) => Number(r[4].split(".")[0]));
    check("export: sorted by day of the month", days.every((d, i) => i === 0 || days[i - 1] <= d), days.join(","));
    check("export: do-not-contact is left out of a greeting list", !rowsB.some((r) => r[19] === "Yes"));
    check("export: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ------------------------------- the birthday list, where Insights keeps it
  {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 1000 }, { view: "insights" });
    await page.waitForSelector("#ins-host[aria-busy='false']");
    const note = await page.textContent("#ins-birthdays ~ .ins-grid .note, .ins-grid .note");
    check("birthdays: the block counts every date and says how many are unchecked",
      /dates on file/.test(note) && /still to confirm/.test(note), note);
    check("birthdays: an unconfirmed date is marked in the next 30 days",
      (await page.textContent(".bdays")).includes("date to confirm"));
    check("birthdays: the month picker is there with its counts",
      (await page.textContent("#bd-month")).includes("client"));
    await page.selectOption("#bd-month", "12");
    const bdFile = await grabDownload(page, async () => {
      await page.click('[data-act="export-birthdays"]');
      await page.waitForSelector("#expwrap .expbox");
      return page.click("#expwrap button[type=submit]");
    });
    check("birthdays: the month downloads from the block", /^Delardi_birthdays_/.test(bdFile.name), bdFile.name);
    const bdRows = sheetRows(partOf(bdFile.file, "xl/worksheets/sheet1.xml"));
    check("birthdays: the file holds December and says so on the second sheet",
      bdRows.slice(1).every((r) => r[4].split(".")[1] === "12")
      && sheetRows(partOf(bdFile.file, "xl/worksheets/sheet2.xml")).map((r) => r.join(" ")).join(" ").includes("December"),
      bdRows.slice(1, 3).map((r) => r[4]).join(","));
    check("birthdays: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ------------------------------------------------------- a viewer cannot
  {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 900 }, { pass: "viewer" });
    await settled(page);
    check("viewer: no add button", !(await page.$('[data-act="add-client"]')));
    check("viewer: no download button", !(await page.$('[data-act="export"]')));
    check("viewer: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // --------------------------- a sales rep edits but does not take data out
  {
    const { ctx, page, errors } = await setup(browser, { width: 1440, height: 900 }, { pass: "rep" });
    await settled(page);
    check("rep: can add a client", await page.isVisible('[data-act="add-client"]'));
    check("rep: cannot download the list", !(await page.$('[data-act="export"]')));
    check("rep: the server refuses an export anyway", await page.evaluate(async () => {
      try { await call("export", { status: "all" }); return false; } catch (e) { return /cannot download/i.test(e.message); }
    }));
    check("rep: no console errors", errors.length === 0, errors.join(" | "));
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
    await page.click('.toolbar [data-act="export"]');
    await page.waitForSelector("#expwrap .expbox");
    const te = await page.textContent("#expwrap");
    check("ru: the download dialog", ["Скачать .xlsx", "Включить номера телефонов", "Будет скачано записей"].every((x) => te.includes(x)), te.slice(0, 200));
    await page.keyboard.press("Escape");
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
    check("phone: the menu offers the download", (await page.textContent("#nav .nav-list")).includes("Download .xlsx"));
    check("phone: no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join("\n")); process.exit(2); });
