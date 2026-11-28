/* ===========================================================================
   Admin (#/admin) — only for a login with the manage right
   Training or Live, the go-live date, and clearing the test sales. Every
   change is logged by the server with who and when.
   ========================================================================= */
Object.assign(RU, {
  "Loading…": "Загрузка…",
  "Till mode": "Режим кассы",
  "Training": "Обучение",
  "Live": "Боевой режим",
  "The till is in training: sales posted now are test sales (T-…). Pieces stay in stock and nothing reaches the CRM or the monthly figures.":
    "Касса в режиме обучения: проведённые сейчас продажи — тестовые (T-…). Изделия остаются в наличии, в клиентскую базу и месячные цифры ничего не попадает.",
  "The till is Live: every sale posted here is real (D-…).": "Касса в боевом режиме: каждая проведённая продажа настоящая (D-…).",
  "Switch the till to Live?": "Перевести кассу в боевой режим?",
  "Live means every sale posted here is real: its pieces are marked sold, the purchase goes on the client's CRM record, and the ticket counts in the monthly figures.":
    "Боевой режим — каждая проведённая здесь продажа настоящая: изделия отмечаются проданными, покупка попадает в карточку клиента в базе, а чек входит в месячные цифры.",
  "Test sales stay apart and are never counted. Do this once the team has practised.":
    "Тестовые продажи остаются отдельно и никогда не учитываются. Делайте это, когда команда потренировалась.",
  "Go Live": "Включить боевой режим",
  "Switch the till back to Training?": "Вернуть кассу в режим обучения?",
  "From now on, sales posted here are test sales: pieces stay in stock and nothing reaches the CRM or the figures. Real sales already posted stay as they are.":
    "С этого момента продажи здесь тестовые: изделия остаются в наличии, в базу и цифры ничего не попадает. Уже проведённые настоящие продажи не меняются.",
  "Switch to Training": "Включить обучение",
  "The till is Live.": "Касса в боевом режиме.",
  "The till is in training.": "Касса в режиме обучения.",
  "Go-live date": "Дата запуска",
  "Not yet — the till has not been Live.": "Ещё нет — касса не работала в боевом режиме.",
  "Test sales": "Тестовые продажи",
  "Deletes every test ticket and every suspended test sale. Real (Live) sales are never touched.":
    "Удаляет все тестовые чеки и все отложенные тестовые продажи. Настоящие продажи не затрагиваются.",
  "Clear test sales": "Очистить тестовые продажи",
  "Main ticket numbers": "Основная нумерация чеков",
  "Till": "Касса",
  "Colibri": "Colibri",
  "Colibri numbers are the main ones: a sale cannot be posted without its Colibri receipt number, and that number is shown and printed. The till's own number (D-…) is kept beside it.":
    "Основные номера — Colibri: продажу нельзя провести без номера чека Colibri, этот номер показывается и печатается. Собственный номер кассы (D-…) хранится рядом.",
  "The till's own numbers (D-…) are the main ones. The Colibri receipt number can still be typed on a sale, and is kept beside it.":
    "Основные номера — собственные номера кассы (D-…). Номер чека Colibri по-прежнему можно указать в продаже, он хранится рядом.",
  "Make Colibri numbers the main ones?": "Сделать номера Colibri основными?",
  "Use Colibri numbers": "Использовать номера Colibri",
  "From now on a sale cannot be posted without its Colibri receipt number, and new sales are shown and printed under that number. Sales already posted keep the number they have.":
    "С этого момента продажу нельзя провести без номера чека Colibri, новые продажи показываются и печатаются под этим номером. Уже проведённые продажи сохраняют свой номер.",
  "Make the till's numbers the main ones?": "Сделать номера кассы основными?",
  "Use till numbers": "Использовать номера кассы",
  "From now on new sales are shown and printed under the till's own number (D-…). The Colibri receipt number becomes optional. Sales already posted keep the number they have.":
    "С этого момента новые продажи показываются и печатаются под собственным номером кассы (D-…). Номер чека Colibri становится необязательным. Уже проведённые продажи сохраняют свой номер.",
  "Colibri numbers are now the main ones.": "Номера Colibri теперь основные.",
  "The till's numbers are now the main ones.": "Номера кассы теперь основные.",
  "Clear every test sale?": "Очистить все тестовые продажи?",
  "This cannot be undone.": "Это нельзя отменить.",
  "Clear them": "Очистить",
  "Cleared: {t} and {d}.": "Очищено: {t} и {d}.",
});
PL.testTicket = { en: ["test ticket", "test tickets"], ru: ["тестовый чек", "тестовых чека", "тестовых чеков"] };
PL.testDraft = { en: ["suspended test sale", "suspended test sales"], ru: ["отложенная тестовая продажа", "отложенные тестовые продажи", "отложенных тестовых продаж"] };
S.adminCleared = null;

function renderAdmin(main) {
  if (!S.rights.manage) { main.append(el("div", { class: "notice", text: tr("Your account cannot manage the till.") })); return; }
  const live = S.mode === "live";
  const goLive = S.ref && S.ref.go_live_date;
  main.append(el("section", { class: "sheet", id: "screen-admin" },
    el("div", { class: "sheet-head" }, el("h1", { text: tr("Admin") })),
    el("div", { class: "admin-body" },
      el("div", { class: "admin-sec" },
        el("h2", { class: "h2", text: tr("Till mode") }),
        el("div", { class: "seg", role: "group", "aria-label": tr("Till mode") },
          el("button", { type: "button", class: "btn", id: "mode-training", "aria-pressed": live ? "false" : "true", onclick: () => switchMode("training") }, tr("Training")),
          el("button", { type: "button", class: "btn", id: "mode-live", "aria-pressed": live ? "true" : "false", onclick: () => switchMode("live") }, tr("Live"))),
        el("p", { class: "small", text: tr(live ? "The till is Live: every sale posted here is real (D-…)."
          : "The till is in training: sales posted now are test sales (T-…). Pieces stay in stock and nothing reaches the CRM or the monthly figures.") })),
      el("div", { class: "admin-sec" },
        el("h2", { class: "h2", text: tr("Main ticket numbers") }),
        el("div", { class: "seg", role: "group", "aria-label": tr("Main ticket numbers") },
          el("button", { type: "button", class: "btn", id: "main-till", "aria-pressed": colibriMain() ? "false" : "true", onclick: () => switchMainNo("till") }, tr("Till")),
          el("button", { type: "button", class: "btn", id: "main-colibri", "aria-pressed": colibriMain() ? "true" : "false", onclick: () => switchMainNo("colibri") }, tr("Colibri"))),
        el("p", { class: "small", id: "main-no-note", text: tr(colibriMain()
          ? "Colibri numbers are the main ones: a sale cannot be posted without its Colibri receipt number, and that number is shown and printed. The till's own number (D-…) is kept beside it."
          : "The till's own numbers (D-…) are the main ones. The Colibri receipt number can still be typed on a sale, and is kept beside it.") })),
      el("div", { class: "admin-sec" },
        el("h2", { class: "h2", text: tr("Go-live date") }),
        el("p", { id: "go-live", class: goLive ? "h2" : "small", text: goLive ? fmtDate(goLive) : tr("Not yet — the till has not been Live.") })),
      el("div", { class: "admin-sec" },
        el("h2", { class: "h2", text: tr("Test sales") }),
        el("p", { class: "small", text: tr("Deletes every test ticket and every suspended test sale. Real (Live) sales are never touched.") }),
        el("button", { type: "button", class: "btn", id: "clear-training", onclick: clearTraining }, tr("Clear test sales")),
        S.adminCleared ? el("p", { class: "ok-line", id: "clear-result", role: "status", text: tr("Cleared: {t} and {d}.",
          { t: pl(S.adminCleared.tickets, "testTicket"), d: pl(S.adminCleared.drafts, "testDraft") }) }) : null))));
}
async function switchMode(mode) {
  if (mode === S.mode) return;
  const toLive = mode === "live";
  const yes = await confirmBox(toLive
    ? { title: tr("Switch the till to Live?"), ok: tr("Go Live"), danger: true,
        body: [tr("Live means every sale posted here is real: its pieces are marked sold, the purchase goes on the client's CRM record, and the ticket counts in the monthly figures."),
          tr("Test sales stay apart and are never counted. Do this once the team has practised.")] }
    : { title: tr("Switch the till back to Training?"), ok: tr("Switch to Training"),
        body: tr("From now on, sales posted here are test sales: pieces stay in stock and nothing reaches the CRM or the figures. Real sales already posted stay as they are.") });
  if (!yes) return;
  try {
    await api("set_mode", { mode });
    await loadReference();
    S.adminCleared = null;
    S.tk = null;                       // the ticket filters belong to the old mode
    await loadDrafts();                // suspended sales are per mode
    renderAll();
    toast(tr(toLive ? "The till is Live." : "The till is in training."));
  } catch (e) { if (e.status !== 401) toast(e.message); }
}
async function switchMainNo(main) {
  if ((main === "colibri") === colibriMain()) return;
  const yes = await confirmBox(main === "colibri"
    ? { title: tr("Make Colibri numbers the main ones?"), ok: tr("Use Colibri numbers"),
        body: tr("From now on a sale cannot be posted without its Colibri receipt number, and new sales are shown and printed under that number. Sales already posted keep the number they have.") }
    : { title: tr("Make the till's numbers the main ones?"), ok: tr("Use till numbers"),
        body: tr("From now on new sales are shown and printed under the till's own number (D-…). The Colibri receipt number becomes optional. Sales already posted keep the number they have.") });
  if (!yes) return;
  try {
    await api("set_main_no", { main });
    await loadReference();
    renderAll();
    toast(tr(main === "colibri" ? "Colibri numbers are now the main ones." : "The till's numbers are now the main ones."));
  } catch (e) { if (e.status !== 401) toast(e.message); }
}
async function clearTraining() {
  const yes = await confirmBox({ title: tr("Clear every test sale?"), ok: tr("Clear them"), danger: true,
    body: [tr("Deletes every test ticket and every suspended test sale. Real (Live) sales are never touched."), tr("This cannot be undone.")] });
  if (!yes) return;
  try {
    S.adminCleared = await api("clear_training");
    await loadDrafts();
    renderAll();
  } catch (e) { if (e.status !== 401) toast(e.message); }
}
