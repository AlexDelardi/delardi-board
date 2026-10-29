// Checks for the Delardi Catalogue page, offline, in Chromium through
// Playwright. catalogue-api is replaced by qa/mock.js (invented data).
//   cd catalogue/src && python3 build.py && node qa/test.js
const path = require("path");
const { chromium } = require("playwright");
const { handle, MODELS } = require("./mock");

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
    ok(await count(page, ".entry a") === 4, "four ways in on the start screen");
    await page.waitForSelector(".cards .card");
    ok(await count(page, ".cards .card") === 8, "eight new arrivals");
    ok((await page.textContent(".hero p")).includes(String(inStock)), "the start screen counts the pieces in stock");
    ok((await page.textContent(".foot-note")).includes("2026"), "the date of the data is shown");

    // -------------------------------------------------------------- brands
    await page.click(".entry a[href='#/brands']"); await settle(page);
    ok(await count(page, ".tile") === 5, "one tile per brand");
    await page.click(".tile:has-text('Aurelle')"); await page.waitForSelector(".cards .card");
    ok((await page.textContent("h1.page")) === "Aurelle", "a brand tile opens that brand's list");
    ok((await page.textContent(".count-line")).includes(String(MODELS.filter((m) => m.brand === "Aurelle").length)), "the count matches the brand");
    ok(await count(page, ".pills .chip") === 1, "the brand shows as a pill");

    // ---------------------------------------------------- categories, types
    await page.goto(PAGE + "#/categories"); await settle(page);
    ok(await count(page, ".tile") === 3, "three categories");
    await page.goto(PAGE + "#/types"); await settle(page);
    ok(await count(page, "h2.group-h") === 3, "retail categories are grouped by category");
    await page.click(".tile:has-text('Watches')"); await page.waitForSelector(".cards .card");
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
    await page.click(".tile .name:text-is('Jewellery')"); await settle(page);
    ok((await page.evaluate(() => location.hash)) === "#/cat/jewellery", "a category with several kinds opens a sub-page", await page.evaluate(() => location.hash));
    ok(await count(page, ".tiles .tile") === 4, "the jewellery sub-page shows its kinds of piece", await count(page, ".tiles .tile"));
    await page.click(".tile .name:text-is('Rings')"); await page.waitForSelector(".cards .card");
    const dd = log.at(-1);
    ok(dd.category === "jewellery" && (dd.retail_categories || [])[0] === "ring", "a kind tile opens that list inside the category", dd);
    await page.goto(PAGE + "#/categories"); await settle(page);
    await page.click(".tile .name:text-is('Watches')"); await page.waitForSelector(".cards .card");
    ok(log.at(-1).category === "watch" && !(await page.evaluate(() => location.hash)).includes("/cat/"), "a category with one kind goes straight to the list", log.at(-1));

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
    await page.click(".cards .card >> nth=5"); await page.waitForSelector(".mp-top");
    await page.click(".mp-back"); await page.waitForSelector(".cards .card");
    ok(await page.evaluate(() => window.scrollY) > 200, "Back restores the scroll position", await page.evaluate(() => window.scrollY));

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
    await page.goto(PAGE + "#/types"); await settle(page);
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

    // client view
    await page.click("header .hbtn[aria-label='Show to a client']");
    ok(await page.isVisible(".client-band"), "client view says it is on");
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
    ok(await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark", "the theme is shared with the other tools");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg === "rgb(0, 13, 34)", "dark page background", bg);
    await ctx.close();
  }

  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
