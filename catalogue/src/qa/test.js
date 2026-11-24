// Checks for the Delardi Catalogue page, offline, in Chromium through
// Playwright. catalogue-api is replaced by qa/mock.js (invented data).
//   cd catalogue/src && python3 build.py && node qa/test.js
const path = require("path");
const { chromium } = require("playwright");
const { handle, MODELS, setV2 } = require("./mock");

const PAGE = "file://" + path.resolve(__dirname, "..", "..", "index.html");
const API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/catalogue-api";
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; } else { fail++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); } };

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, hasTouch: !!opts.touch, isMobile: !!opts.mobile, locale: opts.locale || "en-GB" });
  const page = await ctx.newPage();
  const log = [], errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // A refused request is part of the checks; the browser's own note about it is not a script error.
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text()); });
  await page.route(API, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const [status, json] = opts.expire && body.action === "list" ? [401, { error: "Your session has expired. Enter your passcode again." }] : handle(body, log);
    await route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(json) });
  });
  await page.goto(PAGE + (opts.hash || ""));
  return { ctx, page, log, errors };
}
async function unlock(page) {
  await page.fill("#gate-pass", "1234");
  await page.click("#gate button[type=submit]");
  await page.waitForSelector("#gate", { state: "detached" });
}
const count = (page, sel) => page.locator(sel).count();
const settle = (page) => page.waitForTimeout(150);

(async () => {
  const browser = await chromium.launch();
  const total = MODELS.length, inStock = MODELS.filter((m) => m.in_stock).length;
  const transitN = MODELS.filter((m) => !m.in_stock && m.qty_transit > 0).length;
  const shipped = MODELS.find((m) => !m.in_stock && m.qty_transit > 0);

  // ---------------------------------------------------------------- the gate
  {
    const { ctx, page, log, errors } = await open(browser);
    ok(await page.isVisible("#gate"), "gate shows before a passcode");
    ok(log.length === 0, "nothing is asked of the API before a passcode", log);
    await page.click("#gate button[type=submit]");
    ok((await page.textContent("#gate .err")).includes("Enter your passcode"), "empty passcode is refused on the page");
    await page.fill("#gate-pass", "9999"); await page.click("#gate button[type=submit]"); await settle(page);
    ok((await page.textContent("#gate .err")).includes("not right"), "wrong passcode is refused");
    await page.fill("#gate-pass", "0000"); await page.click("#gate button[type=submit]"); await settle(page);
    ok((await page.textContent("#gate .err")).includes("does not have access"), "a login without catalogue access is refused");
    await unlock(page);
    ok(!(await page.isVisible("#gate")), "the right passcode opens the catalogue");
    ok(await page.evaluate(() => !!localStorage.getItem("cat_session")), "the session is kept on the device");

    // --------------------------------------------------------------- start
    ok(await count(page, ".entry a") === 4 && await count(page, ".entry a[href='#/types']") === 0 && await count(page, ".entry a[href='#/selection']") === 1,
      "the start screen offers brands, category, collections and the selection; Retail category is gone");
    await page.waitForSelector(".cards .card");
    ok(await count(page, ".cards .card") === 8, "eight new arrivals");
    ok((await page.textContent(".hero p")).includes(String(inStock)), "the start screen counts the pieces in stock");
    ok((await page.textContent(".foot-note")).includes("2026"), "the date of the data is shown");

    // -------------------------------------------------------------- brands
    await page.click(".entry a[href='#/brands']"); await settle(page);
    ok(await count(page, ".tile") === new Set(MODELS.filter((m) => m.in_stock).map((m) => m.brand)).size, "one tile per brand with something in stock");
    ok(await count(page, ".tile.dim") === 0, "no dimmed tiles: a brand with nothing in stock has no tile");
    await page.click(".tile:has-text('Aurelle')"); await page.waitForSelector(".cards .card");
    ok((await page.textContent("h1.page")) === "Aurelle", "a brand tile opens that brand's list");
    ok((await page.textContent(".count-line")).includes(String(MODELS.filter((m) => m.brand === "Aurelle").length)), "the count matches the brand");
    ok(await count(page, ".pills .chip") === 1, "the brand shows as a pill");

    // ---------------------------------------------------- categories, types
    await page.goto(PAGE + "#/categories"); await settle(page);
    ok(await count(page, ".tile") === 3, "three categories");
    await page.goto(PAGE + "#/types"); await settle(page);
    ok(await count(page, "h2.group-h") === 0 && (await page.textContent("h1.page")) === "Category", "the old Retail category address opens Category");
    await page.goto(PAGE + "#/list?type=watch"); await page.waitForSelector(".cards .card");
    ok(log.at(-1).retail_categories && log.at(-1).retail_categories[0] === "watch", "a type tile filters on that type", log.at(-1));

    // --------------------------------------------------------- collections
    await page.goto(PAGE + "#/collections"); await settle(page);
    const allColl = await count(page, ".tile");
    await page.click(".chiprow a:has-text('Orsino')"); await settle(page);
    ok(await count(page, ".tile") === 1 && allColl > 1, "the brand chips narrow the collections", allColl);
    await page.click(".tile:has-text('Corsa')"); await page.waitForSelector(".cards .card");
    ok((await page.textContent("h1.page")) === "Corsa", "a collection tile opens that collection");
    const req = log.at(-1);
    ok(req.collections[0] === "Corsa" && req.brands[0] === "Orsino", "a collection is asked for with its brand", req);

    // ------------------------------------------------------------- search
    await page.goto(PAGE + "#/"); await settle(page);
    await page.fill("#q-start", "glacier"); await page.press("#q-start", "Enter"); await page.waitForSelector("h1.page:has-text('glacier')"); await page.waitForSelector(".cards .card");
    ok(log.at(-1).q === "glacier", "the start search goes to the list", log.at(-1));
    ok((await page.textContent("h1.page")).includes("glacier"), "the list says what was searched");
    await page.fill("#q-list", "glacier uno"); await page.waitForTimeout(700);
    ok(log.at(-1).q === "glacier uno", "the list search narrows in place", log.at(-1));
    ok((await page.evaluate(() => location.hash)).includes("q=glacier+uno"), "the address follows the search");
    await page.fill("#q-list", "nothing-like-this"); await page.waitForTimeout(700);
    ok(await page.isVisible(".empty"), "an empty result says so");

    // ----------------------------------------------------- the full list
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    ok(await count(page, ".cards .card") === 60, "the first 60 models");
    await page.click(".more .btn"); await page.waitForFunction((n) => document.querySelectorAll(".cards .card").length === n, total);
    ok(await count(page, ".cards .card") === total, "show more loads the rest");
    ok(!(await page.isVisible(".more")), "nothing more to show at the end");
    ok(await count(page, ".card.out") === total - inStock - transitN, "sold-out models are greyed");
    ok(transitN > 0 && await count(page, ".card .stock.transit") === transitN, "models on their way say In transit, not Sold out", transitN);
    ok(await count(page, ".card .dots") > 0, "models in several colours show their colours");
    ok(await count(page, ".card .ph.photo img") === MODELS.filter((m) => m.image_key).length, "models with a photo show it on the card", await count(page, ".card .ph.photo img"));
    ok(await count(page, ".card .ph:not(.photo)") === total - MODELS.filter((m) => m.image_key).length, "the rest keep the placeholder");
    ok(await count(page, ".card .flagmark") === MODELS.filter((m) => m.missing_crucial.length).length, "incomplete models carry the mark");
    const firstOut = await page.evaluate(() => [...document.querySelectorAll(".cards .card")].findIndex((c) => c.classList.contains("out")));
    ok(firstOut === inStock + transitN, "newest first puts the pieces in stock first, then those in transit", firstOut);

    await page.click(".seg button:has-text('In stock')"); await page.waitForFunction(() => location.hash.includes("stock=in"));
    await page.waitForFunction((n) => document.querySelectorAll(".cards .card").length === Math.min(60, n), inStock + transitN);
    ok(await count(page, ".card.out") === 0, "In stock leaves the sold-out models out");

    await page.selectOption("select.btn", "price_asc"); await page.waitForFunction(() => location.hash.includes("sort=price_asc"));
    await settle(page);
    const prices = await page.$$eval(".card .price", (ns) => ns.map((n) => Number(n.textContent.replace(/[^0-9]/g, ""))));
    ok(prices.every((p, i) => i === 0 || p >= prices[i - 1]), "price low to high is in order");

    // ----------------------------------------------------------- filters
    await page.click(".listbar .btn:has-text('Filters')");
    ok(await page.isVisible(".sheet"), "the filters open");
    await page.click(".sheet .chip:has-text('Watches')");
    await page.click(".sheet .chip:text-is('Men')");
    await page.fill(".sheet .grp:has-text('Price') .range input >> nth=0", "50 000 000");
    await page.click(".sheet footer .btn.primary");
    await page.waitForFunction(() => location.hash.includes("gender=men"));
    await page.waitForSelector(".cards .card, .empty");
    const fr = log.at(-1);
    ok(fr.category === "watch" && fr.genders[0] === "men" && fr.price_min === 50_000_000, "the filters reach the API (price in full UZS, grouped entry accepted)", fr);
    ok((await page.textContent(".listbar .badge")) === "3", "the filter button counts what is on");
    ok(await count(page, ".pills .chip") === 3, "each filter shows as a pill");
    await page.click(".pills .chip:has-text('Men'):not(:has-text('Women'))"); await page.waitForFunction(() => !location.hash.includes("gender") && document.querySelectorAll(".pills .chip").length === 2);
    ok(await count(page, ".pills .chip") === 2, "a pill takes its filter off");
    await page.click(".listbar .btn:has-text('Filters')");
    await page.keyboard.press("Escape");
    ok(!(await page.isVisible(".sheet")), "Escape closes the filters");

    // --------------------------------------------------- amounts, model
    await page.goto(PAGE + "#/list?brand=Montvert"); await page.waitForSelector(".cards .card");
    await page.click("header .hbtn[aria-label='Hide amounts']");
    ok((await page.textContent(".card .price")) === "•••", "the eye hides the prices");
    ok(await page.evaluate(() => localStorage.getItem("cat_hide_amounts") === "1"), "the device remembers hidden amounts");
    await page.click("header .hbtn[aria-label='Show amounts']");
    const firstId = await page.$eval(".cards .card", (a) => decodeURIComponent(a.getAttribute("href").split("/").pop()));
    await page.click(".cards .card >> nth=0"); await page.waitForSelector(".mp-top");
    ok(log.at(-1).action === "model" && log.at(-1).model_id === firstId, "a card opens its model", log.at(-1));
    ok(await page.isVisible(".crumbs a:has-text('Montvert')"), "the model page leads back to the brand");
    await page.goBack(); await page.waitForSelector(".cards .card");
    ok((await page.textContent("h1.page")) === "Montvert", "back returns to the list");

    // ---------------------------------------------------------- model page
    const ring = MODELS.find((m) => m.retail_category === "ring" && m.colours && m.in_stock);
    await page.goto(PAGE + "#/model/" + ring.model_id); await page.waitForSelector(".mp-top");
    ok((await page.textContent(".mp-title")) === ring.model_name, "the title is the model name", await page.textContent(".mp-title"));
    ok(await count(page, ".mp-colour") === 3, "one switch per colour");
    ok(await page.getAttribute(".mp-colour >> nth=0", "aria-pressed") === "true", "the first colour in stock is shown");
    ok((await page.textContent(".mp-price")).replace(/\D/g, "") === String(ring.price_min_uzs), "the price of that colour", await page.textContent(".mp-price"));
    ok((await page.textContent(".mp-stock")).includes(ring.size_keys[0]), "the sizes in stock", ring.size_keys);
    ok((await count(page, ".facts .fact")) === 7, "seven crucial facts at the top");
    ok((await page.textContent(".facts")).includes("White gold, 750 (18K)"), "material reads as metal and fineness", await page.textContent(".facts"));
    ok((await page.textContent(".facts")).includes("Diamonds, 0.55 ct"), "stones read with their weight");
    const links = await page.$$eval(".facts a.fact-link", (ns) => ns.map((n) => [n.textContent, n.getAttribute("href")]));
    const has = (re) => links.some(([, h]) => re.test(decodeURIComponent(h)));
    ok(has(/collection=/) && has(/brand=/), "the collection opens its list", links);
    ok(has(/category=jewellery$/) && has(/type=ring/), "category and type open their lists", links);
    ok(has(/metal=white_gold/), "the material opens the same metal", links);
    ok(has(/gender=/), "the gender opens its list", links);
    await page.click(".facts a.fact-link:has-text('White gold')");
    await page.waitForFunction(() => location.hash.includes("metal=white_gold")); await page.waitForSelector(".cards .card, .empty");
    for (let i = 0; i < 30 && !((log.filter((x) => x.action === "list").at(-1) || {}).metals || []).length; i++) await page.waitForTimeout(100);
    ok((log.filter((x) => x.action === "list").at(-1).metals || [])[0] === "white_gold", "the metal list asks for that metal", log.slice(-3));
    await page.goBack(); await page.waitForSelector(".mp-top");
    ok(await page.isVisible(".advisor .story"), "the advisor's story shows");
    ok((await page.textContent(".advisor")).includes("Signature line"), "a signature line is called out");
    ok((await page.textContent(".advisor")).includes("Polished by hand"), "in English the value stays English");
    ok(await count(page, ".spec .unv") === 2, "unconfirmed and conflicting values carry the mark", await count(page, ".spec .unv"));
    ok(await count(page, ".spec .unv.conflict") === 1, "a conflict has its own mark");
    ok(await count(page, ".spec .tbc") > 0, "missing details read TBC");
    ok(await page.isVisible("details.owner"), "the owner sees the data and sources block");
    ok(await count(page, ".mp-body ~ .cards .card, .cards .card") > 0, "matching pieces are listed");
    ok(!(await page.textContent("main")).includes("SN" + ring.model_id), "serial numbers are not on the page");
    ok(await count(page, ".mp-gallery .g-strip img") === 2, "the colour on screen shows its own photos", await count(page, ".mp-gallery .g-strip img"));
    ok(await count(page, ".g-thumb") === 2, "one thumbnail per photo");
    ok((await page.getAttribute(".g-strip img >> nth=0", "src")).startsWith("https://hugduzqwyqwryicfzipu.supabase.co/storage/v1/object/public/catalogue-photos/"), "photos come from the catalogue's storage");
    await page.click(".g-thumb >> nth=1"); await page.waitForTimeout(600);
    ok(await page.getAttribute(".g-thumb >> nth=1", "aria-current") === "true", "a thumbnail moves the gallery");
    // a sibling colour: its own metal colour, the rest carried over
    await page.click(".mp-colour >> nth=2"); await settle(page);
    ok((await page.evaluate(() => location.hash)).includes("?v="), "the colour is in the address");
    ok(await page.getAttribute(".mp-colour >> nth=2", "aria-pressed") === "true", "the switch moves");
    ok((await page.textContent(".facts")).includes("Rose gold"), "metal follows the colour", await page.textContent(".facts"));
    ok(await count(page, ".val.inh") > 0, "facts from another colour are marked as carried over");
    ok((await page.textContent(".mp-stock")).includes("Sold out"), "a sold-out colour says so");
    ok(await page.isVisible(".g-note"), "a colour without photos borrows another colour's, marked");
    await page.click(".top .lang button:has-text('RU')"); await settle(page);
    ok((await page.textContent(".advisor h2")) === "Для консультанта", "the advisor block in Russian");
    ok((await page.textContent(".advisor .story")).includes("Выдуманная"), "the Russian story in Russian");
    ok((await page.textContent(".advisor")).includes("Отполировано вручную") && !(await page.textContent(".advisor")).includes("Polished by hand"), "a value with its own Russian shows it in Russian");
    ok((await page.textContent(".desc")).includes("Colibri"), "the Russian description is Colibri's");
    await page.click(".top .lang button:has-text('EN')"); await settle(page);
    const watch = MODELS.find((m) => m.category === "watch" && m.in_stock);
    await page.goto(PAGE + "#/model/" + watch.model_id); await page.waitForSelector(".mp-top");
    ok((await page.textContent(".facts")).includes(watch.case_mm + " mm"), "a watch shows its case size", await page.textContent(".facts"));
    ok((await page.textContent(".spec-grid")).includes("Movement"), "a watch has its movement section");
    const stony = MODELS.find((m) => m.category === "jewellery" && m.stone_keys.length > 1 && m.in_stock);
    await page.goto(PAGE + "#/model/" + stony.model_id); await page.waitForSelector(".mp-top");
    const sl = await page.$$eval(".facts a.fact-link", (ns) => ns.map((n) => n.getAttribute("href")));
    ok(sl.some((h) => h.includes("stone=diamond")) && sl.some((h) => h.includes("stone=sapphire")), "each stone opens its own list", sl);
    // v13: a stoneless piece reads "No stones" instead of a wall of empty stone rows
    const plain = MODELS.find((m) => m.category === "jewellery" && m.stone_keys.length === 0 && m.in_stock);
    await page.goto(PAGE + "#/model/" + plain.model_id); await page.waitForSelector(".mp-top");
    ok((await page.textContent(".facts")).includes("No stones"), "a stoneless piece reads No stones at the top", await page.textContent(".facts"));
    const stoneRows = await page.evaluate(() => {
      const h = [...document.querySelectorAll(".spec-sec h3")].find((x) => x.textContent === "Stones");
      return h ? h.parentElement.querySelectorAll(".spec").length : -1;
    });
    ok(stoneRows === 1, "the stones block collapses to a single line", stoneRows);
    ok((await page.textContent(".spec-grid")).includes("No stones"), "the single line reads No stones");
    // v13: a spec row that does not apply to the kind of piece is dropped when empty
    const earr = MODELS.find((m) => m.retail_category === "earrings" && m.in_stock);
    await page.goto(PAGE + "#/model/" + earr.model_id); await page.waitForSelector(".mp-top");
    ok(!(await page.textContent(".spec-grid")).includes("Ring size"), "ring size is not shown on earrings");
    await page.goto(PAGE + "#/model/" + ring.model_id); await page.waitForSelector(".mp-top");
    ok((await page.textContent(".spec-grid")).includes("Ring size"), "ring size is shown on a ring");
    // v9: brand logos
    const logos = await page.evaluate(() => BRAND_LOGOS.map((b) => brandLogo(b)));
    const fs = require("fs");
    ok(logos.length === 14 && logos.every((l) => l && fs.existsSync(path.resolve(__dirname, "..", "..", l))), "every brand logo named in the page is in catalogue/brands", logos.filter((l) => !fs.existsSync(path.resolve(__dirname, "..", "..", l))));
    ok(await page.evaluate(() => brandLogo("Aurelle") === null && brandLogo("Fabio Collection") === "brands/fabio-collection.png"), "a brand without a logo keeps its name");
    // v8: in transit
    await page.goto(PAGE + "#/model/" + shipped.model_id); await page.waitForSelector(".mp-top");
    ok(await page.isVisible(".mp-stock .stock.transit"), "a model on its way says In transit");
    ok((await page.textContent(".mp-stock")).includes("2 in transit") && (await page.textContent(".mp-stock")).includes("Shipped 14.10.2026"), "the model page counts the pieces on their way and the shipping date", await page.textContent(".mp-stock"));
    ok(!(await page.textContent(".mp-stock")).includes("Sold out"), "in transit is not sold out");
    await page.click(".top .lang button:has-text('RU')"); await settle(page);
    ok((await page.textContent(".mp-stock")).includes("В пути"), "in transit in Russian");
    await page.click(".top .lang button:has-text('EN')"); await settle(page);
    await page.goto(PAGE + "#/list?stock=transit"); await page.waitForSelector(".cards .card");
    ok(log.at(-1).stock === "transit" && await count(page, ".cards .card") === transitN, "the In transit filter lists only them", log.at(-1));
    await page.goto(PAGE + "#/model/NOPE"); await page.waitForSelector(".empty");
    ok((await page.textContent(".empty")).includes("not in the catalogue"), "an unknown model says so");

    // ------------------------------------------------------- facet filters
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    await page.click(".sheet .chip:has-text('Rose gold')");
    await page.click(".sheet .chip:has-text('Sapphires')");
    await page.click(".sheet .chip:text-is('Automatic')");
    await page.click(".sheet footer .btn.primary");
    await page.waitForFunction(() => location.hash.includes("movement=automatic")); await page.waitForSelector(".cards .card, .empty");
    const ff = log.filter((x) => x.action === "list").at(-1);
    ok(ff.metals[0] === "rose_gold" && ff.stones[0] === "sapphire" && ff.movements[0] === "automatic", "metal, stone and movement reach the API", ff);
    ok(await count(page, ".pills .chip") === 3, "each shows as a pill");
    await page.goto(PAGE + "#/list?type=ring"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    ok(!(await page.isVisible(".sheet .grp:has-text('Movement')")), "watch filters stay out of a ring list");
    await page.keyboard.press("Escape");

    // ----------------------------------------- sub-category drill-down (1)
    await page.goto(PAGE + "#/categories"); await settle(page);
    ok(await count(page, ".tiles .tile .catimg") >= 3, "category tiles show an illustration", await count(page, ".tiles .tile .catimg"));
    await page.click(".tile .name:text-is('Jewellery')"); await settle(page);
    ok((await page.evaluate(() => location.hash)) === "#/cat/jewellery", "a category with several kinds opens a sub-page", await page.evaluate(() => location.hash));
    ok(await count(page, ".tiles .tile .catimg") >= 4, "kind tiles show an illustration", await count(page, ".tiles .tile .catimg"));
    ok(await count(page, ".tiles .tile") === 4, "the jewellery sub-page shows its kinds of piece", await count(page, ".tiles .tile"));
    await page.click(".tile .name:text-is('Rings')"); await page.waitForSelector(".cards .card");
    const dd = log.at(-1);
    ok(dd.category === "jewellery" && (dd.retail_categories || [])[0] === "ring", "a kind tile opens that list inside the category", dd);
    // v13: Watches split by movement (Automatic / Quartz / Hand-wound), not by kind.
    await page.goto(PAGE + "#/categories"); await settle(page);
    await page.click(".tile .name:text-is('Watches')"); await settle(page);
    ok((await page.evaluate(() => location.hash)) === "#/cat/watch", "Watches open a movement sub-page", await page.evaluate(() => location.hash));
    const wt = await page.$$eval(".tiles .tile", (ns) => ns.map((n) => [n.querySelector(".name").textContent, n.getAttribute("href")]));
    ok(wt[0][0] === "All watches" && wt[0][1] === "#/list?category=watch", "an All watches tile comes first", wt);
    ok(wt.some(([t, h]) => t === "Automatic" && /movement=automatic/.test(h))
       && wt.some(([t, h]) => t === "Quartz" && /movement=quartz/.test(h))
       && wt.some(([t, h]) => t === "Hand-wound" && /movement=manual/.test(h)), "a tile per movement, each filtering the watch list", wt);
    await page.click(".tile .name:text-is('Automatic')"); await page.waitForSelector(".cards .card");
    ok(log.at(-1).category === "watch" && (log.at(-1).movements || [])[0] === "automatic", "a movement tile opens that filtered watch list", log.at(-1));
    // Accessories are one kind, so they still go straight to the list.
    await page.goto(PAGE + "#/categories"); await settle(page);
    await page.click(".tile .name:text-is('Accessories')"); await page.waitForSelector(".cards .card");
    ok(log.at(-1).category === "accessory" && !(await page.evaluate(() => location.hash)).includes("/cat/"), "a one-kind category goes straight to the list", log.at(-1));

    // ------------------------------------------------ size filter (2)
    await page.goto(PAGE + "#/list?type=ring"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    ok(await count(page, ".sheet .grp .lbl:text-is('Size')") === 1, "a ring list offers a size filter");
    await page.click(".sheet .chip:text-is('54')");
    await page.click(".sheet footer .btn.primary");
    await page.waitForFunction(() => location.hash.includes("size=54")); await page.waitForSelector(".cards .card, .empty");
    const szf = log.filter((x) => x.action === "list").at(-1);
    ok((szf.sizes || [])[0] === "54", "the chosen size reaches the API", szf);
    const ring54 = MODELS.filter((m) => (m.size_keys || []).includes("54")).length;
    ok(await count(page, ".cards .card") === Math.min(60, ring54) && ring54 > 0, "the list narrows to that size", [ring54, await count(page, ".cards .card")]);
    ok(await count(page, ".pills .chip:has-text('54')") === 1, "the size shows as a pill");
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    ok(await count(page, ".sheet .grp .lbl:text-is('Size')") === 0, "no size filter until a category is chosen");
    await page.keyboard.press("Escape");
    await page.goto(PAGE + "#/list?category=watch"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    ok(await count(page, ".sheet .grp .lbl:text-is('Size')") === 0, "watches use case size, not the size filter");
    await page.keyboard.press("Escape");

    // ------------------------------------- back button + scroll (3)
    await page.goto(PAGE + "#/list?brand=Aurelle"); await page.waitForSelector(".cards .card");
    await page.click(".cards .card >> nth=0"); await page.waitForSelector(".mp-top");
    ok(await page.isVisible(".mp-back"), "the model page has a Back button");
    await page.click(".mp-back"); await page.waitForSelector(".cards .card");
    ok((await page.evaluate(() => location.hash)).includes("brand=Aurelle"), "Back keeps the list's filters", await page.evaluate(() => location.hash));
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    await page.evaluate(() => window.scrollTo(0, 600)); await settle(page);
    // a card in the third row: at 600 px it is clear of the pinned header, so the click itself does not scroll the page
    // (the second row sits half under the header, and Playwright then scrolls before it clicks)
    await page.click(".cards .card >> nth=10"); await page.waitForSelector(".mp-top");
    await page.click(".mp-back"); await page.waitForSelector(".cards .card");
    ok(await page.evaluate(() => window.scrollY) === 600, "Back restores the scroll position", await page.evaluate(() => window.scrollY));

    // --------------------------------------- price range (full UZS)
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    // reversed from/to, grouped digits — should still narrow correctly
    await page.fill(".sheet .grp:has-text('Price') .range input >> nth=0", "120 000 000");
    await page.fill(".sheet .grp:has-text('Price') .range input >> nth=1", "40000000");
    await page.click(".sheet footer .btn.primary");
    await page.waitForFunction(() => location.hash.includes("pmin") || location.hash.includes("pmax"));
    await page.waitForSelector(".cards .card, .empty");
    const pf = log.filter((x) => x.action === "list").at(-1);
    ok(pf.price_min === 40_000_000 && pf.price_max === 120_000_000, "price is full UZS and a reversed from/to is corrected", pf);
    const inBand = MODELS.filter((m) => m.price_max_uzs >= 40_000_000 && m.price_min_uzs <= 120_000_000).length;
    ok(await count(page, ".cards .card") === Math.min(60, inBand) && inBand < total, "the list narrows to the price band", [inBand, await count(page, ".cards .card")]);
    ok(await count(page, ".pills .chip") === 2, "price shows as from/to pills");

    await page.goto(PAGE + "#/"); await page.waitForSelector(".section-h h2:has-text('Opened recently')");
    const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("cat_recent")));
    ok(recent.includes(firstId) && recent.every((x) => typeof x === "string") && !recent.includes("NOPE"), "only references of models opened are kept", recent);
    ok(await page.isVisible(".section-h h2:has-text('Opened recently')"), "the start screen shows what was opened");

    // ------------------------------------------------------------ russian
    await page.click(".top .lang button:has-text('RU')"); await settle(page);
    ok((await page.textContent(".brand .title")) === "Каталог", "the page follows the language switch");
    ok((await page.textContent(".entry a >> nth=0")).includes("Бренды"), "the start screen is in Russian");
    await page.goto(PAGE + "#/cat/jewellery"); await settle(page);
    ok(await page.isVisible(".tile:has-text('Кольца')"), "types are named in Russian");
    await page.goto(PAGE + "#/list?type=ring"); await page.waitForSelector(".cards .card");
    ok((await page.textContent(".card .stock")).match(/наличии|Нет/), "stock badges are in Russian");
    await page.click(".top .lang button:has-text('EN')");

    // -------------------------------------------------------------- lock
    await page.click("header .hbtn[aria-label='Lock']");
    ok(await page.isVisible("#gate"), "the lock button asks for the passcode");
    ok(await page.evaluate(() => !localStorage.getItem("cat_session")), "locking forgets the session");
    ok(errors.length === 0, "no script errors", errors);
    await ctx.close();
  }

  // -------------------------------------------------- part 4: the floor
  {
    const { ctx, page, log, errors } = await open(browser);
    await unlock(page);
    const ring = MODELS.find((m) => m.retail_category === "ring" && m.colours && m.in_stock);

    // the tool switcher, as in every tool
    await page.click(".top .kit-tool-wrap > button");
    const toolItems = await page.$$eval(".top .kit-menu li", (ls) => ls.map((l) => l.textContent.trim()).join("|"));
    ok(toolItems === "Sales|Stock|Clients|Catalogue|Tasks|Performance" && (await page.textContent('.top .kit-menu [aria-current="page"]')).trim() === "Catalogue"
      && (await page.getAttribute('.top .kit-menu a[href="../crm/"]', "href")) === "../crm/", "the header lists every tool, this one marked: " + toolItems);
    const mb = await page.$eval(".top .kit-menu", (m) => { const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.height > 200; });
    ok(mb, "the tools list opens inside the screen");
    await page.keyboard.press("Escape");
    ok(!(await page.$(".top .kit-menu")) || !(await page.isVisible(".top .kit-menu")), "Escape closes the tools list");

    // client view
    await page.click("header .hbtn[aria-label='Show to a client']");
    ok(await page.isVisible(".client-band"), "client view says it is on");
    ok(!(await page.$(".top .kit-tool-wrap")), "client view: no way to the other tools");
    ok(!(await page.isVisible(".hero p:has-text('in stock')")), "client view hides the stock counts on the start screen");
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    ok(await count(page, ".card .flagmark") === 0, "client view hides the TBC tags");
    ok(!(await page.$$eval("select.btn option", (os) => os.map((o) => o.value))).includes("completeness"), "client view drops the completeness sort");
    await page.goto(PAGE + "#/model/" + ring.model_id); await page.waitForSelector(".mp-top");
    ok(await count(page, ".tbc") === 0, "client view: no TBC on the model page");
    ok(await count(page, ".unv") === 0, "client view: no quality marks");
    ok(!(await page.isVisible("details.owner")), "client view: no owner's block");
    ok(!(await page.isVisible(".report-btn")), "client view: no report button");
    ok(!(await page.textContent(".mp-stock")).match(/piece/), "client view: no piece count");
    await page.goto(PAGE + "#/model/" + shipped.model_id); await page.waitForSelector(".mp-top");
    ok(await page.isVisible(".mp-stock .stock.transit") && !(await page.isVisible(".mp-transit")), "client view: In transit shows, the shipment details do not");
    await page.goto(PAGE + "#/model/" + ring.model_id); await page.waitForSelector(".mp-top");
    ok(await page.isVisible(".advisor .story"), "client view keeps the story");
    await page.reload(); await page.waitForSelector(".mp-top");
    ok(await page.isVisible(".client-band"), "client view survives a reload");
    await page.click(".client-band .btn");
    ok(!(await page.isVisible(".client-band")), "leaving client view");
    ok(await count(page, ".tbc") > 0, "TBC is back after client view");

    // report an error
    await page.click(".report-btn");
    ok(await page.isVisible(".sheet.report"), "the report panel opens");
    await page.click(".sheet.report button[type=submit]");
    ok((await page.textContent(".sheet.report .err")).includes("Say what is wrong"), "an empty report is refused");
    await page.selectOption("#rep-field", "metal_colour");
    await page.fill("#rep-msg", "This one is rose gold.");
    await page.click(".sheet.report button[type=submit]");
    await page.waitForSelector(".sheet.report", { state: "detached" });
    const rep = log.filter((x) => x.action === "report_create").at(-1);
    ok(rep && rep.field_key === "metal_colour" && rep.message === "This one is rose gold." && rep.model_id === ring.model_id, "the report reaches the API", rep);
    ok((await page.textContent("#toast")).includes("report is in"), "the report is thanked");
    await page.click(".report-btn"); await page.goBack(); await settle(page);
    ok(!(await page.isVisible(".sheet.report")), "back closes the report panel");
    ok(await page.isVisible(".mp-top"), "and stays on the model page");

    // the owner's review
    await page.goto(PAGE + "#/"); await page.waitForSelector(".reports-link");
    ok((await page.textContent(".reports-link")).includes("1"), "the start screen counts the open reports");
    await page.click(".reports-link"); await page.waitForSelector(".rep");
    ok(await count(page, ".rep") === 1, "the report is listed");
    ok((await page.textContent(".rep")).includes("rose gold"), "with what was said");
    await page.click(".rep button:has-text('Fixed')"); await page.waitForSelector(".empty");
    ok(await count(page, ".rep") === 0, "a fixed report leaves the open list");
    await page.click(".seg a:has-text('Fixed')"); await page.waitForSelector(".rep");
    ok(await page.isVisible(".rep button:has-text('Reopen')"), "a fixed report can be reopened");
    await page.click(".rep .rep-model"); await page.waitForSelector(".mp-top");
    ok((await page.evaluate(() => location.hash)).includes(ring.model_id), "a report leads to its model");

    // back closes the filter panel
    await page.goto(PAGE + "#/list?brand=Aurelle"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')");
    await page.goBack(); await settle(page);
    ok(!(await page.isVisible(".sheet")), "back closes the filters");
    ok((await page.evaluate(() => location.hash)).includes("brand=Aurelle"), "and keeps the list");
    await page.click(".listbar .btn:has-text('Filters')");
    await page.click(".sheet .chip:text-is('Women')");
    await page.click(".sheet footer .btn.primary");
    await page.waitForFunction(() => location.hash.includes("gender=women"));
    await page.goBack(); await page.waitForFunction(() => !location.hash.includes("gender"));
    ok((await page.evaluate(() => location.hash)).includes("brand=Aurelle"), "back after the filters returns to the list before them");

    // manifest
    ok(await page.$eval("link[rel=manifest]", (l) => l.getAttribute("href")) === "app/manifest.webmanifest", "the page names its home-screen manifest");

    // locking ends client view
    await page.click("header .hbtn[aria-label='Show to a client']");
    await page.click("header .hbtn[aria-label='Lock']");
    await page.fill("#gate-pass", "1234"); await page.click("#gate button[type=submit]"); await page.waitForSelector("#gate", { state: "detached" });
    ok(!(await page.isVisible(".client-band")), "the next person does not inherit client view");
    ok(errors.length === 0, "part 4: no script errors", errors);
    await ctx.close();
  }

  // ------------------------------------------------------------ idle lock
  {
    const { ctx, page } = await open(browser, { viewport: { width: 810, height: 1080 }, touch: true, mobile: true });
    await unlock(page);
    await page.waitForSelector(".cards .card");
    await page.evaluate(() => { localStorage.setItem("cat_idle", String(Date.now() - 16 * 60000)); S.lastActive = 0; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForSelector("#gate");
    ok((await page.textContent("#gate .err")).includes("15 minutes"), "an idle iPad locks after 15 minutes");
    await unlock(page);
    await page.evaluate(() => localStorage.setItem("cat_idle", String(Date.now() - 16 * 60000)));
    await page.reload(); await page.waitForSelector("#gate");
    ok((await page.textContent("#gate .err")).includes("15 minutes"), "the idle lock holds across a closed page");
    await unlock(page);
    await page.evaluate(() => localStorage.setItem("cat_idle", String(Date.now() - 5 * 60000)));
    await page.reload(); await page.waitForTimeout(400);
    ok(!(await page.isVisible("#gate")), "five minutes is not idle");
    await ctx.close();
  }
  {
    // a desk computer does not lock on its own
    const { ctx, page } = await open(browser);
    await unlock(page);
    await page.evaluate(() => localStorage.setItem("cat_idle", String(Date.now() - 60 * 60000)));
    await page.reload(); await page.waitForTimeout(400);
    ok(!(await page.isVisible("#gate")), "a desk computer keeps its session");
    await ctx.close();
  }

  // -------------------------------------------------------- no connection
  {
    const { ctx, page } = await open(browser);
    await unlock(page);
    await page.unroute(API);
    await page.route(API, (route) => route.abort("internetdisconnected"));
    await page.reload(); await page.waitForSelector(".offline");
    ok(!(await page.isVisible("#gate")), "no connection does not ask for the passcode");
    ok(await page.isVisible(".netbar"), "no connection says so at the top");
    await page.unroute(API);
    await page.route(API, async (route) => { const [st, j] = handle(JSON.parse(route.request().postData() || "{}"), []); await route.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(j) }); });
    await page.click(".offline .btn"); await page.waitForSelector(".entry a");
    ok(await page.isVisible(".entry a"), "the catalogue opens when the connection is back");
    ok(!(await page.isVisible(".netbar")), "and the banner goes");
    await ctx.close();
  }

  // -------------------------------------------------------- session expiry
  {
    const { ctx, page } = await open(browser, { expire: true });
    await unlock(page);
    await page.goto(PAGE + "#/list"); await page.waitForSelector("#gate");
    ok((await page.textContent("#gate .err")).includes("expired"), "an expired session goes back to the passcode");
    await ctx.close();
  }

  // ---------------------------------------------- iPad portrait and phone
  for (const [name, vp] of [["iPad portrait", { width: 810, height: 1080 }], ["phone", { width: 390, height: 844 }]]) {
    const { ctx, page, errors } = await open(browser, { viewport: vp, touch: true, mobile: name === "phone" });
    await unlock(page);
    await page.waitForSelector(".cards .card");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + ": nothing scrolls sideways on the start screen");
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + ": nothing scrolls sideways on the list");
    const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".cards")).gridTemplateColumns.split(" ").length);
    ok(cols === (name === "phone" ? 2 : 3), name + ": cards per row", cols);
    const small = await page.$$eval("header button, header a, .listbar button, .listbar select, .listbar input", (ns) => ns.filter((n) => n.offsetParent).filter((n) => n.getBoundingClientRect().height < 36).map((n) => n.className + ":" + Math.round(n.getBoundingClientRect().height)));
    ok(small.length === 0, name + ": tap targets at least 36px high", small);
    await page.click(".listbar .btn:has-text('Filters')");
    const sheet = await page.$eval(".sheet", (s) => s.getBoundingClientRect());
    ok(name === "phone" ? sheet.width >= 389 : sheet.width <= 421, name + ": the filters sheet fits", sheet);
    ok(errors.length === 0, name + ": no script errors", errors);
    await ctx.close();
  }

  // ----------------------------------------------------------- dark theme
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => localStorage.setItem("board_theme", "dark"));
    await page.reload(); await unlock(page);
    ok(await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "light", "an old dark choice is ignored: the catalogue is light");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg === "rgb(243, 241, 236)", "light page background", bg);
    ok(await count(page, "header.top [aria-label='Switch between light and dark']") === 0, "no theme switch in the header");
    await ctx.close();
  }

  // ======================================================= v2 server filtering
  // The same page against catalogue-api filter_version 2: the reference reports
  // capability 2, so the list and the sheet switch to the facets/list contract.
  {
    setV2(true);
    const whiteGold = MODELS.filter((m) => m.metal_keys.includes("white_gold")).length;
    const { ctx, page, log, errors } = await open(browser);
    await unlock(page);
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    const firstList = log.filter((r) => r.action === "list").slice(-2);
    ok(log.some((r) => r.filter_version === 2 && r.action === "list"), "v2: the list asks the server with filter_version 2");
    ok(log.some((r) => r.action === "list" && r.ids && r.filter_version !== 2), "v2: display rows are hydrated through the v1 ids list");
    ok(await count(page, ".cards .card") === 60, "v2: the first 60 matches render as cards");

    // the filter sheet runs on live facets
    await page.click(".listbar .btn:has-text('Filters')");
    await page.waitForSelector(".sheet .grp:has-text('Brands') .chip");
    ok(log.some((r) => r.action === "facets"), "v2: opening the filters asks for facets");
    ok(await count(page, ".sheet .grp") >= 6, "v2: the sheet shows the facet groups");
    ok(await count(page, ".sheet .chip .cnt") > 0, "v2: facet options carry live counts");
    ok(await count(page, ".sheet .grp:has-text('Stock') .chip") === 4, "v2: availability offers all four states");

    // pick a metal, apply, and the list narrows through v2
    await page.click(".sheet .grp:has-text('Metal') .chip:has-text('White gold')");
    await page.waitForTimeout(450);
    await page.click(".sheet footer .btn.primary");
    await page.waitForFunction(() => location.hash.includes("metal=white_gold"));
    await page.waitForSelector(".cards .card");
    const mr = log.filter((r) => r.filter_version === 2 && r.action === "list").at(-1);
    ok(mr.filters.materials && mr.filters.materials[0] === "white_gold", "v2: a chosen metal reaches the server as filters.materials", mr.filters);
    ok(await count(page, ".cards .card") === Math.min(60, whiteGold), "v2: the list shows only the matching models", { shown: await count(page, ".cards .card"), whiteGold });
    ok(await count(page, ".pills .chip") === 1, "v2: the metal shows as a pill");
    await page.click(".pills .chip:has-text('White gold')");
    await page.waitForFunction(() => !location.hash.includes("metal=") && document.querySelectorAll(".pills .chip").length === 0);
    ok(await count(page, ".pills .chip") === 0, "v2: a pill takes its filter off");

    // the availability segment maps to the v2 availability
    await page.click(".listbar .seg button:has-text('In stock')");
    await page.waitForFunction(() => location.hash.includes("avail=boutique"));
    await page.waitForTimeout(400);
    const ar = log.filter((r) => r.filter_version === 2 && r.action === "list" && r.filters && r.filters.availability === "boutique").at(-1);
    ok(ar && ar.filters.availability === "boutique", "v2: In stock maps to availability=boutique", log.filter((r) => r.filter_version === 2 && r.action === "list").at(-1));

    // case size shows for watches, not for rings
    await page.goto(PAGE + "#/list?category=watch"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')"); await page.waitForSelector(".sheet .grp:has-text('Brands') .chip");
    ok(await count(page, ".sheet .grp:has-text('Case size')") === 1, "v2: watches get a case-size facet");
    await page.click(".sheet header .btn:has-text('Close')");
    await page.goto(PAGE + "#/list?type=ring"); await page.waitForSelector(".cards .card, .empty");
    await page.click(".listbar .btn:has-text('Filters')"); await page.waitForSelector(".sheet .grp:has-text('Brands') .chip");
    ok(await count(page, ".sheet .grp:has-text('Size') .chip") > 0 && await count(page, ".sheet .grp:has-text('Case size')") === 0, "v2: rings get a size facet and no case size");

    ok(errors.length === 0, "v2: no script errors through the flow", errors);
    await ctx.close();
    setV2(false);
  }

  // ------------------------------------------------- the phone header (guideline v2)
  for (const w of [390, 360]) {
    const { ctx, page, errors } = await open(browser, { viewport: { width: w, height: 740 }, touch: true, mobile: true });
    await unlock(page);
    const row = await page.$$eval(".top-row > *", (xs) => xs.filter((x) => x.getBoundingClientRect().width > 0).map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.height)]; }));
    ok(row.every((r, i) => r[1] <= w && (i === 0 || r[0] >= row[i - 1][1])), "phone " + w + ": the header is one row with nothing cut or overlapping", row);
    ok(await count(page, ".top-row .lang") === 0 && await count(page, "#menu-btn") === 1 && await count(page, ".top-row #sel-btn") === 1, "phone " + w + ": the row holds the mark, the selection and the menu button");
    ok(await page.isVisible(".brand .title"), "phone " + w + ": the tool's name stays in the header");
    ok(await count(page, "#head-menu") === 0, "phone " + w + ": the menu starts closed");
    await page.click("#menu-btn");
    ok(await page.getAttribute("#menu-btn", "aria-expanded") === "true" && await count(page, "#head-menu .lang") === 1 && await count(page, "#head-menu .kit-tool-wrap") === 1, "phone " + w + ": the menu holds the language and the other tools");
    const small = await page.$$eval("#head-menu button, #head-menu a, .top-row .hbtn", (xs) => xs.filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().height < 44).map((x) => x.textContent || x.className));
    ok(small.length === 0, "phone " + w + ": everything in the header is at least 44 px tall", small);
    // the menu is a panel from the right edge; the tools are listed in it straight away
    await page.waitForFunction(() => Math.round(document.querySelector("#head-menu .head-panel").getBoundingClientRect().right) === innerWidth);
    ok(await page.$eval("#head-menu .head-panel", (m) => { const r = m.getBoundingClientRect(); return r.left >= innerWidth * 0.1 && Math.round(r.right) === innerWidth && r.top === 0 && Math.round(r.bottom) === innerHeight; })
      && await page.$eval(".top-row", (n) => Math.round(n.getBoundingClientRect().height)) <= 60, "phone " + w + ": the menu is a side panel, the header row keeps its height");
    ok(await page.$$eval("#head-menu .kit-menu li", (ls) => ls.length === 6 && ls.every((l) => { const r = l.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1; }))
      && !(await page.isVisible("#head-menu .kit-tool-wrap > button")), "phone " + w + ": the tools are listed inside the screen, no second tap");
    await page.click("#head-close");
    ok(await count(page, "#head-menu") === 0 && await page.evaluate(() => document.activeElement.id === "menu-btn"), "phone " + w + ": the close button closes the menu");
    await page.click("#menu-btn"); await page.mouse.click(10, 400);
    ok(await count(page, "#head-menu") === 0, "phone " + w + ": a tap beside the panel closes it");
    await page.click("#menu-btn");
    await page.click("#head-menu .lang button:has-text('RU')"); await settle(page);
    ok(await count(page, "#head-menu") === 0 && (await page.textContent(".brand .title")) === "Каталог", "phone " + w + ": a choice in the menu applies and closes it");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone " + w + ": nothing scrolls sideways");
    ok(errors.length === 0, "phone " + w + ": no script errors", errors);
    await ctx.close();
  }

  // ------------------------------------------- owner-only tools, and tiles with nothing in stock
  {
    const { ctx, page } = await open(browser);
    await page.fill("#gate-pass", "5678"); await page.click("#gate button[type=submit]"); await page.waitForSelector("#gate", { state: "detached" });
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    ok(!(await page.$$eval("select.btn option", (os) => os.map((o) => o.value))).includes("completeness"), "a floor login has no 'least complete first' sort");
    await page.click(".listbar .btn:has-text('Filters')"); await page.waitForSelector(".sheet");
    ok(await count(page, ".sheet label.check") === 0, "a floor login has no 'details still TBC' filter");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser);
    await unlock(page);
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    ok((await page.$$eval("select.btn option", (os) => os.map((o) => o.value))).includes("completeness"), "the catalogue owner keeps the 'least complete first' sort");
    await page.click(".listbar .btn:has-text('Filters')"); await page.waitForSelector(".sheet");
    ok(await count(page, ".sheet label.check") === 1, "the catalogue owner keeps the 'details still TBC' filter");
    // a reference where one brand, one kind and one collection have nothing in stock
    await page.evaluate(() => {
      S.ref.brands[0].in_stock = 0;
      const ring = S.ref.categories.find((c) => c.retail_category === "ring"); ring.in_stock = 0;
      S.ref.collections[0].in_stock = 0;
      closeAllLayers();
    });
    const nb = await page.evaluate(() => S.ref.brands.length), gone = await page.evaluate(() => S.ref.brands[0].brand);
    await page.evaluate(() => { location.hash = "#/brands"; }); await settle(page);
    ok(await count(page, ".tile") === nb - 1 && await count(page, `.tile:has-text('${gone}')`) === 0, "a brand with nothing in stock has no tile");
    await page.evaluate(() => { location.hash = "#/cat/jewellery"; }); await settle(page);
    ok(await count(page, ".tile .name:text-is('Rings')") === 0 && await count(page, ".tile") > 0, "a kind of piece with nothing in stock has no tile");
    const nc = await page.evaluate(() => S.ref.collections.length);
    await page.evaluate(() => { location.hash = "#/collections"; }); await settle(page);
    ok(await count(page, ".tile") === nc - 1, "a collection with nothing in stock has no tile");
    await page.evaluate(() => { for (const b of S.ref.brands) b.in_stock = 0; location.hash = "#/"; }); await settle(page);
    await page.evaluate(() => { location.hash = "#/brands"; }); await settle(page);
    ok(await count(page, ".tile") === 0 && (await page.textContent(".empty")).includes("Nothing in stock"), "with nothing in stock the screen says so, and offers every model");
    await ctx.close();
  }

  // ----------------------------------------------- filter options with nothing behind them
  {
    setV2(true);
    const { ctx, page, errors } = await open(browser);
    await unlock(page);
    await page.goto(PAGE + "#/list?type=ring"); await page.waitForSelector(".cards .card");
    await page.click(".listbar .btn:has-text('Filters')"); await page.waitForSelector(".sheet .grp .chip .cnt");
    const zeros = await page.$$eval(".sheet .chip .cnt", (ns) => ns.filter((n) => n.textContent.trim() === "0").map((n) => n.parentElement.textContent));
    ok(zeros.length === 0, "no filter option is offered with 0 behind it", zeros);
    ok(await count(page, ".sheet .chip[aria-disabled='true']") === 0, "nothing greyed out in the sheet");
    // one option falls to 0, then its whole group
    const before = await page.evaluate(() => ({ chips: document.querySelectorAll(".sheet .grp:has(.lbl) .chip").length, brands: [...document.querySelectorAll(".sheet .grp")].filter((g) => g.querySelector(".lbl") && g.querySelector(".lbl").textContent === "Brands").length }));
    await page.evaluate(() => { const f = S.sheetF.facets.find((x) => x.key === "brands"); f.options[0].count = 0; f.options[0].disabled = true; renderSheetV2(); });
    const gone1 = await page.evaluate(() => S.sheetF.facets.find((x) => x.key === "brands").options[0].value);
    ok(before.brands === 1 && await count(page, `.sheet .chip:has-text('${gone1}')`) === 0, "an option that falls to 0 leaves the sheet");
    await page.evaluate(() => { const f = S.sheetF.facets.find((x) => x.key === "brands"); for (const o of f.options) { o.count = 0; o.disabled = true; } renderSheetV2(); });
    ok(await page.evaluate(() => [...document.querySelectorAll(".sheet .grp .lbl")].every((l) => l.textContent !== "Brands")), "a group left with no options is not shown");
    // a chosen option that falls to 0 stays, so it can be taken off
    await page.evaluate(() => {
      const f = S.sheetF.facets.find((x) => x.key === "materials"); const op = f.options.find((o) => o.count > 0);
      S.sheet.materials = [op.value]; op.count = 0; op.disabled = false; renderSheetV2();
    });
    const kept = await page.$$eval(".sheet .chip[aria-pressed='true'] .cnt", (ns) => ns.map((n) => n.textContent.trim()));
    ok(kept.includes("0"), "a chosen option stays on screen at 0 so it can be taken off", kept);
    ok(errors.length === 0, "zeros: no script errors", errors);
    await ctx.close();
    setV2(false);
  }

  // ------------------------------------------------------------ the selection
  {
    const { ctx, page, log, errors } = await open(browser);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await unlock(page);
    await page.goto(PAGE + "#/selection"); await settle(page);
    ok((await page.textContent(".sel-empty")).includes("empty") && await count(page, "#sel-btn .badge") === 0, "an empty selection says so, and the header shows no count");
    await page.goto(PAGE + "#/list?brand=Aurelle&stock=in"); await page.waitForSelector(".cards .card");
    ok(await count(page, ".cards .card-wrap > .pick") === await count(page, ".cards .card") && await count(page, ".cards a.card .pick") === 0, "every card has a pick button beside its link, not inside it");
    const ids = await page.$$eval(".cards a.card", (as) => as.slice(0, 3).map((a) => decodeURIComponent(a.getAttribute("href").split("/").pop())));
    await page.click(".cards .card-wrap >> nth=0 >> .pick"); await page.click(".cards .card-wrap >> nth=1 >> .pick");
    ok(page.url().includes("#/list"), "picking a piece stays on the list");
    ok((await page.textContent("#sel-btn .badge")) === "2" && await count(page, ".cards .pick[aria-pressed='true']") === 2, "the header counts the picks and the cards show them");
    const kept = await page.evaluate(() => localStorage.getItem("cat_cart"));
    ok(kept === JSON.stringify([{ m: ids[0], v: null }, { m: ids[1], v: null }]), "the device keeps references only", kept);
    await page.click(".cards .card-wrap >> nth=1 >> .pick");
    ok((await page.textContent("#sel-btn .badge")) === "1", "a second tap takes the piece out");
    // from a model page: the colour on screen
    const multi = MODELS.find((m) => m.in_stock && m.colours && m.colours.length > 1 && m.model_id !== ids[0]);
    await page.goto(PAGE + "#/model/" + encodeURIComponent(multi.model_id) + "?v=" + encodeURIComponent(multi.colours[1].variant_id)); await page.waitForSelector(".mp-top");
    await page.click(".mp-actions .pick-page");
    ok(await page.getAttribute(".mp-actions .pick-page", "aria-pressed") === "true" && (await page.textContent(".mp-actions .pick-page")).includes("In the selection"), "a model page adds the colour on screen");
    ok(JSON.parse(await page.evaluate(() => localStorage.getItem("cat_cart")))[1].v === multi.colours[1].variant_id, "the colour is kept with the model");
    // the page
    log.length = 0;
    await page.click("#sel-btn"); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, ".sel-row") === 2 && log.filter((r) => r.action === "model").length === 2, "the selection lists both pieces, with one request for each", log.filter((r) => r.action === "model").length);
    const first = MODELS.find((m) => m.model_id === ids[0]);
    const rowText = await page.textContent(".sel-row >> nth=0");
    ok(rowText.includes(first.brand) && rowText.includes("Ref. " + first.article) && rowText.includes("UZS"), "a line carries the brand, the reference and the price", rowText);
    ok((await page.textContent(".sel-row >> nth=1")).includes(multi.colours[1].variant_id), "a line added from a model page shows its colour's reference");
    ok(!(await page.textContent("#sel-list")).match(/SN[A-Z0-9-]+\d|TBC|\d+ pieces?\b/), "no serial numbers, TBC marks or stock counts on the selection", await page.textContent("#sel-list"));
    const sum = Number((await page.textContent("#sel-sum")).replace(/[^0-9]/g, ""));
    const lineSum = (await page.$$eval(".sel-row .price", (ns) => ns.map((n) => Number(n.textContent.replace(/[^0-9]/g, ""))))).reduce((a, b) => a + b, 0);
    ok(sum === lineSum && sum > 0, "the total is the sum of the lines", { sum, lineSum });
    // the eye
    await page.click("header.top .hbtn[aria-label='Hide amounts']"); await settle(page);
    ok((await page.textContent("#sel-sum")) === "•••" && (await page.$$eval(".sel-row .price", (ns) => ns.every((n) => n.textContent === "•••"))), "the eye hides the prices on the selection too");
    await page.click("header.top .hbtn[aria-label='Show amounts']"); await settle(page);
    // the message
    await page.click(".sel-actions .btn:has-text('Copy as a message')"); await settle(page);
    const msg = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (msg !== null) ok(msg.includes(first.brand) && msg.includes("Ref. " + first.article) && msg.includes("Bukhara 26") && msg.includes("Tester") && msg.includes("Total"), "the message carries the pieces, the total, the address and who prepared it", msg);
    // the link
    await page.click(".sel-actions .btn:has-text('Copy the link')"); await settle(page);
    const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (link !== null) ok(link.includes("#/selection?p=") && decodeURIComponent(link).includes(multi.model_id + "~" + multi.colours[1].variant_id), "the link carries the references", link);
    // the sheet
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; window.__sheet = document.querySelector("#print").textContent; window.__logo = !!document.querySelector("#print .ps-mark"); }; });
    await page.click(".sel-actions .btn:has-text('PDF or print')"); await page.waitForSelector(".sel-sheet");
    await page.fill("#sheet-who", "A client"); await page.click("#sheet-go"); await page.waitForFunction(() => window.__printed === 1);
    const printed = await page.evaluate(() => ({ n: window.__printed, text: window.__sheet, logo: window.__logo }));
    ok(printed.n === 1 && printed.logo, "the sheet goes to print once, with the Delardi mark", printed.n);
    ok(printed.text.includes("A client") && printed.text.includes("Prepared by Tester") && printed.text.includes("Bukhara 26") && printed.text.includes(first.brand) && printed.text.includes("UZS"),
      "the sheet names the client, who prepared it, the address, the pieces and the prices", printed.text);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector("#print")).visibility) === "hidden" && await page.evaluate(() => document.querySelector("#print").getBoundingClientRect().right < 0), "the sheet is not on screen");
    await page.emulateMedia({ media: "print" });
    ok(await page.evaluate(() => getComputedStyle(document.querySelector("#print")).visibility === "visible" && getComputedStyle(document.querySelector("#print")).position === "static" && getComputedStyle(document.querySelector("#app")).display === "none"), "on paper the sheet is the only thing");
    await page.emulateMedia({ media: "screen" });
    await page.uncheck("#sheet-prices"); await page.fill("#sheet-who", "   "); await page.click("#sheet-go"); await page.waitForFunction(() => window.__printed === 2);
    ok(!(await page.evaluate(() => window.__sheet)).includes("UZS"), "prices can be left off the sheet");
    ok((await page.evaluate(() => window.__sheet)).includes("Prepared for: Delardi client") && (await page.textContent("#sheet-who-hint")).includes("Delardi client"),
      "with no name typed the sheet says 'Prepared for: Delardi client', and the panel says so beforehand", await page.evaluate(() => window.__sheet));
    ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("A client"), "the client's name is not kept on the device");
    const sheetNow = () => page.evaluate(() => document.querySelector("#print").textContent);
    await page.check("#sheet-prices"); await page.click("#sheet-go"); await page.waitForFunction(() => window.__printed === 3);
    ok((await sheetNow()).includes("Prices are indicative only") && await count(page, "#print .ps-disc") === 0 && await count(page, "#sheet-discount") === 0,
      "a sheet with prices says they are indicative only; the panel has no discount box of its own");
    await page.click(".sel-sheet header .btn");
    // client view, remove, lock
    await page.click(".sel-actions .btn:has-text('Show to a client')"); await settle(page);
    ok(await count(page, ".client-band") === 1 && await count(page, ".sel-row") === 2, "the selection can be turned to the client");
    await page.click(".client-band .btn");
    await page.click(".sel-row >> nth=0 >> .sel-remove"); await settle(page);
    ok(await count(page, ".sel-row") === 1 && (await page.textContent("#sel-btn .badge")) === "1", "a piece can be taken out on the page");
    await page.click("header.top .hbtn[aria-label='Lock']"); await unlock(page);
    ok((await page.textContent("#sel-btn .badge")) === "1", "the selection outlives a lock, like 'opened recently'");
    ok(errors.length === 0, "selection: no script errors", errors);
    await ctx.close();
  }
  // a selection that comes by link, and a piece that is gone
  {
    const { ctx, page, errors } = await open(browser);
    await unlock(page);
    const a = MODELS.find((m) => m.in_stock), b2 = MODELS.filter((m) => m.in_stock)[3];
    await page.evaluate((id) => localStorage.setItem("cat_cart", JSON.stringify([{ m: id, v: null }])), b2.model_id);
    await page.goto(PAGE + "#/selection?p=" + encodeURIComponent(a.model_id) + "&p=NOPE-1"); await page.reload(); await page.waitForSelector(".sel-row .nm");
    ok((await page.textContent("h1.page")) === "A colleague's selection" && await count(page, ".sel-row") === 2, "a link opens the colleague's list");
    ok(await count(page, ".sel-row.gone") === 1 && await count(page, ".sel-remove") === 0, "a piece no longer in the catalogue is named as such, and the list is not edited here");
    ok(JSON.parse(await page.evaluate(() => localStorage.getItem("cat_cart"))).length === 1, "opening a link leaves my own selection alone");
    await page.click(".sel-actions .btn:has-text('Keep as my selection')"); await settle(page);
    ok((await page.textContent("h1.page")) === "Your selection" && JSON.parse(await page.evaluate(() => localStorage.getItem("cat_cart")))[0].m === a.model_id, "it can be kept as my own");
    await page.click(".sel-actions .linkbtn"); await settle(page);
    ok(await count(page, ".sel-empty") === 1 && await page.evaluate(() => localStorage.getItem("cat_cart")) === null, "clearing empties it on the device too");
    ok(errors.length === 0, "shared selection: no script errors", errors);
    await ctx.close();
  }
  // Codex on #39: a sheet left open at a lock, a failed model page, a request that fails for a moment
  {
    const { ctx, page, errors } = await open(browser);
    await unlock(page);
    const ring = MODELS.find((m) => m.in_stock && m.retail_category === "ring"), other = MODELS.find((m) => m.in_stock && m.retail_category !== "ring");
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), [{ m: ring.model_id, v: null }, { m: other.model_id, v: null }]);
    // a model page that failed leaves S.model without data; the selection must not lean on it
    await page.goto(PAGE + "#/model/NOPE-9"); await page.reload(); await page.waitForSelector(".empty");
    await page.evaluate(() => { location.hash = "#/selection"; }); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, ".sel-row .nm") === 2 && errors.length === 0, "the selection renders after a model page failed to load", errors);
    ok((await page.textContent(".sel-row >> nth=0")).includes("Size"), "a ring's size comes from the line's own model");
    // a sheet made, then the lock: nothing is left to print from the gate
    await page.evaluate(() => { window.print = () => {}; });
    await page.click(".sel-actions .btn:has-text('PDF or print')"); await page.fill("#sheet-who", "A client"); await page.click("#sheet-go");
    ok((await page.evaluate(() => document.querySelector("#print").textContent)).includes("A client"), "the sheet is built while its panel is open");
    await page.evaluate(() => lockDown());
    ok(await page.isVisible("#gate") && await page.evaluate(() => document.querySelector("#print").innerHTML) === "", "locking empties the sheet");
    await ctx.close();
  }
  {
    let failing = true;
    const { ctx, page, errors } = await open(browser);
    await unlock(page);
    const a = MODELS.find((m) => m.in_stock);
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), [{ m: a.model_id, v: null }]);
    await page.route(API, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.action === "model" && failing) return route.fulfill({ status: 500, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Something went wrong on the server." }) });
      return route.fallback();
    });
    await page.goto(PAGE + "#/selection"); await page.reload(); await page.waitForSelector(".sel-row.gone");
    ok(await count(page, ".sel-again") === 1, "a piece that failed to load offers 'Try again'");
    failing = false;
    await page.click(".sel-again"); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, ".sel-row.gone") === 0, "trying again loads it once the server answers");
    failing = true;
    await page.evaluate(() => { S.cartData = {}; render(); }); await page.waitForSelector(".sel-row.gone");
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, ".sel-row.gone") === 0, "coming back online loads it without a tap");
    await page.goto(PAGE + "#/selection?p=NOPE-1"); await page.reload(); await page.waitForSelector(".sel-row.gone");
    ok(await count(page, ".sel-again") === 0, "a piece that is gone from the catalogue offers no retry");
    await ctx.close();
  }
  // ------------------------------------------- a discount per piece, typed on the selection
  {
    const { ctx, page, errors } = await open(browser);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await unlock(page);
    const three = MODELS.filter((m) => m.in_stock && (!m.colours || m.colours.length === 1)).slice(0, 3);
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), three.map((m) => ({ m: m.model_id, v: null })));
    await page.goto(PAGE + "#/selection"); await page.reload(); await page.waitForSelector(".sel-row .nm");
    const digits = (t) => Number(String(t).replace(/[^0-9]/g, ""));
    const P = three.map((m) => m.price_min_uzs), gross = P[0] + P[1] + P[2];
    ok(await count(page, "#sel-list .sel-disc input") === 3 && await count(page, "#sel-disc-all") === 1, "every piece has a discount box, and there is one for all pieces");
    ok(digits(await page.textContent("#sel-sum")) === gross && await count(page, "#sel-off") === 0, "with no discount the total is the list total and no discount line shows");
    // one piece: typed with a comma, the cursor stays in the box
    await page.click("#sel-list .sel-row >> nth=1 >> .sel-disc input"); await page.keyboard.type("7,5");
    ok(await page.evaluate(() => document.activeElement && document.activeElement.closest(".sel-disc") !== null && document.activeElement.value === "7,5"), "typing a discount keeps the cursor in the box");
    const off1 = Math.round(P[1] * 0.075);
    ok(digits(await page.textContent("#sel-list .sel-row >> nth=1 >> .sel-price .price")) === P[1] - off1 && digits(await page.textContent("#sel-list .sel-row >> nth=1 >> .sel-price s")) === P[1]
      && (await page.textContent("#sel-list .sel-row >> nth=1 >> .pct")) === "−7.5%", "the line shows the list price struck through, the percentage and the price after it");
    ok(await count(page, "#sel-list .sel-row >> nth=0 >> .sel-price s") === 0, "the other lines are untouched");
    ok(digits(await page.textContent("#sel-gross")) === gross && digits(await page.textContent("#sel-off")) === off1 && digits(await page.textContent("#sel-sum")) === gross - off1,
      "the totals show the list total, the discount and what is left");
    // the message and the sheet carry it
    await page.click(".sel-actions .btn:has-text('Copy as a message')"); await settle(page);
    const msg = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (msg !== null) ok(msg.includes("− 7.5% = ") && msg.includes("With the discount") && msg.includes("Prices and the discount are indicative only"), "the message carries the discount and says the prices are indicative", msg);
    await page.evaluate(() => { window.__n = 0; window.print = () => { window.__n++; }; });
    await page.click(".sel-actions .btn:has-text('PDF or print')"); await page.waitForSelector(".sel-sheet"); await page.click("#sheet-go"); await page.waitForFunction(() => window.__n === 1);
    ok(digits(await page.textContent("#print .ps-item >> nth=1 >> .ps-price")) === P[1] - off1 && (await page.textContent("#print .ps-item >> nth=1 >> .ps-was")).includes("−7.5%")
      && await count(page, "#print .ps-item >> nth=0 >> .ps-was") === 0, "on the sheet the discounted line shows both prices, the others one");
    ok(digits(await page.textContent("#print .ps-total.before b")) === gross && digits(await page.textContent("#print .ps-off")) === off1 && digits(await page.textContent("#print .ps-net b")) === gross - off1
      && (await page.evaluate(() => document.querySelector("#print").textContent)).includes("Prices and the discount are indicative only"), "the sheet totals the discount and says prices and discount are indicative");
    await page.click(".sel-sheet header .btn");
    // all pieces at once
    await page.fill("#sel-disc-all", "10");
    const offAll = P.reduce((a, x) => a + Math.round(x * 0.10), 0);
    ok((await page.$$eval("#sel-list .sel-disc input", (xs) => xs.map((x) => x.value))).every((v) => v === "10") && digits(await page.textContent("#sel-off")) === offAll && digits(await page.textContent("#sel-sum")) === gross - offAll,
      "the box for all pieces sets every line and the totals follow");
    for (const bad of ["abc", "0", "100", "-5"]) {
      await page.fill("#sel-list .sel-row >> nth=0 >> .sel-disc input", bad);
      ok(await count(page, "#sel-list .sel-row >> nth=0 >> .sel-price s") === 0, "a discount of '" + bad + "' is no discount");
    }
    // not the client's to see or to change; not kept
    await page.click(".sel-actions .btn:has-text('Show to a client')"); await settle(page);
    ok(await count(page, ".sel-disc") === 0 && await count(page, "#sel-list .sel-price s") === 2 && await count(page, "#sel-off") === 1, "client view hides the boxes and keeps the discounted prices");
    await page.click(".client-band .btn");
    await page.click("header.top .hbtn[aria-label='Hide amounts']"); await settle(page);
    ok(await count(page, ".sel-disc") === 0 && (await page.textContent("#sel-sum")) === "•••" && await count(page, "#sel-off") === 0, "with the eye closed there are no boxes and no figures");
    await page.click("header.top .hbtn[aria-label='Show amounts']"); await settle(page);
    ok(!(await page.evaluate(() => JSON.stringify(localStorage))).match(/disc/i), "discounts are not kept on the device");
    await page.click("#sel-list .sel-row >> nth=1 >> .sel-remove"); await settle(page);
    ok(await count(page, "#sel-list .sel-price s") === 1, "taking a piece out takes its discount with it");
    await page.click("header.top .hbtn[aria-label='Lock']"); await unlock(page); await page.goto(PAGE + "#/selection"); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, "#sel-list .sel-price s") === 0 && await count(page, "#sel-off") === 0, "a lock clears the discounts; the pieces stay");
    ok(errors.length === 0, "discounts: no script errors", errors);
    await ctx.close();
  }
  // Codex on #41: a linked list's discounts are its own; a piece taken out by any button loses its discount
  {
    const { ctx, page, errors } = await open(browser);
    await unlock(page);
    const two = MODELS.filter((m) => m.in_stock && (!m.colours || m.colours.length === 1)).slice(0, 2);
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), two.map((m) => ({ m: m.model_id, v: null })));
    await page.goto(PAGE + "#/selection"); await page.reload(); await page.waitForSelector(".sel-row .nm");
    await page.fill("#sel-list .sel-row >> nth=0 >> .sel-disc input", "10");
    // the same piece arrives by link
    await page.evaluate((id) => { location.hash = "#/selection?p=" + encodeURIComponent(id); }, two[0].model_id); await page.waitForSelector("h1.page:has-text('colleague')"); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, "#sel-list .sel-price s") === 0 && (await page.inputValue("#sel-list .sel-disc input")) === "", "a linked list does not inherit my discount on the same piece");
    await page.fill("#sel-list .sel-disc input", "25");
    await page.evaluate(() => { location.hash = "#/selection"; }); await page.waitForSelector("h1.page:has-text('Your')");
    ok((await page.inputValue("#sel-list .sel-row >> nth=0 >> .sel-disc input")) === "10", "a discount typed on the linked list leaves mine as it was");
    ok(JSON.parse(await page.evaluate(() => localStorage.getItem("cat_cart"))).every((x) => Object.keys(x).join() === "m,v"), "the device still keeps references only");
    // taken out on a card, put back: at list price
    await page.evaluate(() => { location.hash = "#/list?stock=in"; }); await page.waitForSelector(".cards .card");
    const wrap = `.cards .card-wrap:has(a.card[href="#/model/${encodeURIComponent(two[0].model_id)}"])`;
    await page.click(wrap + " .pick"); await page.click(wrap + " .pick");
    await page.evaluate(() => { location.hash = "#/selection"; }); await page.waitForSelector(".sel-row .nm");
    ok(await count(page, ".sel-row") === 2 && await count(page, "#sel-list .sel-price s") === 0, "a piece taken out on its card and put back comes in at list price");
    // taken out on its model page, put back
    await page.fill("#sel-list .sel-row >> nth=0 >> .sel-disc input", "15");
    await page.evaluate((m) => { S.cart = []; S.cartDisc = {}; cartSave(); location.hash = "#/model/" + encodeURIComponent(m); }, two[1].model_id);
    await page.waitForSelector(".mp-actions .pick-page");
    await page.click(".mp-actions .pick-page"); await page.waitForSelector(".mp-actions .pick-page.on");
    await page.evaluate(() => { S.cartDisc[discKey(S.cart[0])] = 15; });
    await page.click(".mp-actions .pick-page"); await page.click(".mp-actions .pick-page"); await page.waitForSelector(".mp-actions .pick-page.on");
    ok(await page.evaluate(() => Object.keys(S.cartDisc).length) === 0 && await page.evaluate(() => S.cart.length) === 1, "the same on a model page: out and back in, no discount comes back");
    ok(errors.length === 0, "discount scope: no script errors", errors);
    await ctx.close();
  }
  // the discount boxes on a phone
  {
    const { ctx, page } = await open(browser, { viewport: { width: 390, height: 780 }, touch: true, mobile: true });
    await unlock(page);
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), MODELS.filter((m) => m.in_stock).slice(0, 2).map((m) => ({ m: m.model_id, v: null })));
    await page.goto(PAGE + "#/selection"); await page.reload(); await page.waitForSelector(".sel-row .nm");
    await page.fill("#sel-disc-all", "12.5");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone: the selection with discounts does not scroll sideways");
    const small = await page.$$eval(".sel-disc input", (xs) => xs.filter((x) => x.getBoundingClientRect().height < 44).length);
    ok(small === 0, "phone: the discount boxes are 44 px tall");
    await ctx.close();
  }

  // the sheet waits for its pictures: the print window takes the page as it is at that instant
  {
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const { ctx, page, errors } = await open(browser);
    const withPhoto = MODELS.filter((m) => m.in_stock && m.image_key).slice(0, 2), bare = MODELS.find((m) => m.in_stock && !m.image_key);
    let n = 0;
    await page.route("**/catalogue-photos/**", async (route) => {
      if (route.request().url().includes(encodeURIComponent(withPhoto[1].model_id) + "/")) return route.fulfill({ status: 404, body: "" });   // one photo is missing
      n++; await new Promise((r) => setTimeout(r, 700));                                                                                       // the other is slow
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });
    await unlock(page);
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), [withPhoto[0], withPhoto[1], bare].map((m) => ({ m: m.model_id, v: null })));
    await page.goto(PAGE + "#/selection"); await page.reload(); await page.waitForSelector(".sel-row .nm");
    await page.evaluate(() => { window.print = () => { window.__at = [...document.querySelectorAll("#print img")].map((i) => ({ cls: i.className, done: i.complete, w: i.naturalWidth })); }; });
    await page.click(".sel-actions .btn:has-text('PDF or print')"); await page.waitForSelector(".sel-sheet");
    await page.click("#sheet-go");
    ok((await page.textContent("#sheet-go")).includes("Preparing") && await page.evaluate(() => window.__at === undefined), "the sheet does not print before its pictures are in");
    ok(await page.$$eval(".sel-sheet input", (xs) => xs.length === 2 && xs.every((x) => x.disabled)), "while the sheet is prepared its options cannot be changed");
    await page.waitForFunction(() => window.__at);
    const at = await page.evaluate(() => window.__at);
    ok(at.length >= 4 && at.every((i) => i.done && i.w > 0), "at the moment of printing every picture on the sheet is loaded: the mark, the photos, the logos", at);
    ok(at.filter((i) => i.cls === "mono").length === 2, "a piece with no photo, and one whose photo will not load, show the monogram", at);
    ok(n > 0 && errors.length === 0, "the slow photo was waited for, without script errors", { n, errors });
    ok(await page.$$eval(".sel-sheet input", (xs) => xs.every((x) => !x.disabled)), "once it has gone to print the options open again");
    await ctx.close();
  }
  // the selection on a phone and an iPad
  for (const [w, h] of [[390, 780], [820, 1180]]) {
    const { ctx, page, errors } = await open(browser, { viewport: { width: w, height: h }, touch: true, mobile: true });
    await unlock(page);
    const some = MODELS.filter((m) => m.in_stock).slice(0, 3).map((m) => ({ m: m.model_id, v: null }));
    await page.evaluate((c) => localStorage.setItem("cat_cart", JSON.stringify(c)), some);
    await page.goto(PAGE + "#/selection"); await page.reload(); await page.waitForSelector(".sel-row .nm");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), w + ": the selection does not scroll sideways");
    const small = await page.$$eval(".sel-actions .btn, .sel-remove, .pick", (xs) => xs.filter((x) => x.getBoundingClientRect().height < 44).map((x) => x.textContent));
    ok(small.length === 0, w + ": the selection's buttons are at least 44 px tall", small);
    const tiny = await page.$$eval("main *", (ns) => ns.filter((n) => n.children.length === 0 && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 11).map((n) => n.textContent.trim().slice(0, 20)));
    ok(tiny.length === 0, w + ": no text under 11 px on the selection", tiny);
    await page.goto(PAGE + "#/list"); await page.waitForSelector(".cards .card");
    const pk = await page.$eval(".pick", (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
    ok(pk[0] >= 44 && pk[1] >= 44, w + ": the pick button on a card is 44 px", pk);
    const tiny2 = await page.$$eval("main *, header.top *", (ns) => ns.filter((n) => n.children.length === 0 && n.textContent.trim() && n.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(n).fontSize) < 11).map((n) => n.textContent.trim().slice(0, 20)));
    ok(tiny2.length === 0, w + ": no text under 11 px on the list", tiny2);
    ok(errors.length === 0, w + ": no script errors", errors);
    await ctx.close();
  }

  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
