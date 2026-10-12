/* ===========================================================================
   Adding a client by hand (API v12)
   Alex, 12 Oct 2026: the team must be able to put a person on file at the
   counter. The form asks only for what someone can say in a few seconds —
   name, number, who owns them, how we met — and then opens the card, where
   sizes, preferences, the address and important dates already have their own
   editors.
   - The number is checked while it is typed: if it is already on file the form
     says whose record it is and offers to open it instead of making a second.
   - The server checks again, by number and by name, and refuses unless the
     page says plainly that this is a different person.
   - A record added here is a prospect with a PRS reference until Colibri
     brings a purchase, and it goes through the clean-up like any other, so a
     second person confirms what was typed.
   ========================================================================= */
Object.assign(RU, {
  "Add a client": "Добавить клиента",
  "Add client": "Добавить",
  "New client": "Новый клиент",
  "Added by the team": "Добавлен командой",
  "Added by the team: a prospect until Colibri brings a purchase.": "Добавлен командой: потенциальный клиент, пока Colibri не покажет покупку.",
  "added by the team": "добавлены командой",
  "Entered by the team": "Введено командой",
  "Identity — Colibri against what the team typed": "Личные данные — Colibri и то, что ввела команда",
  "typed in by the team": "введено командой",
  "Surname, name and patronymic as the client gives it": "Фамилия, имя и отчество — как говорит клиент",
  "Phone number": "Номер телефона",
  "Who they are": "Кто это",
  "How we met": "Как познакомились",
  "Walk-in": "Пришёл(ла) в бутик",
  "Referral": "По рекомендации",
  "Instagram": "Instagram",
  "Event": "Мероприятие",
  "E.g. came in with a friend, looking for a gift": "Например: зашла с подругой, ищет подарок",
  "Keep the name under 120 characters.": "Имя — не длиннее 120 символов.",
  "Gender must be M or F.": "Пол — М или Ж.",
  "Keep how you met under 80 characters.": "«Как познакомились» — не длиннее 80 символов.",
  "That is not a date.": "Это не дата.",
  "Give the date of birth as YYYY-MM-DD.": "Дата рождения — в формате ГГГГ-ММ-ДД.",
  "Already on file": "Уже есть в базе",
  "Open {id}": "Открыть {id}",
  "This is a different person — add anyway": "Это другой человек — всё равно добавить",
  "Client added. Fill in the rest on the card.": "Клиент добавлен. Остальное — в карточке.",
  "A new record is a prospect until Colibri brings a purchase. It goes through the clean-up, so someone confirms what you typed.":
    "Новая запись — потенциальный клиент, пока из Colibri не придёт покупка. Запись проходит проверку: кто-то подтвердит введённое.",
  "Added by the team, {d}": "Добавлено командой, {d}",
  "Added by {by}, {d}": "Добавил(а) {by}, {d}",
  "Not in the questionnaire. This record was added by the team at the counter.":
    "Анкеты нет. Эту запись команда добавила вручную.",
  "Added to the file by hand": "Запись добавлена вручную",
});

/* ------------------------------------------------------------- the choices */
const HOW_MET = [["Walk-in", "Walk-in"], ["Referral", "Referral"], ["Instagram", "Instagram"],
  ["Telegram", "Telegram"], ["Event", "Event"], ["Other", "Other"]];
Object.assign(S, { add: null, addBusy: false, addErr: null, addDup: null, addLook: 0 });
const canAdd = () => canEdit();

function openAddClient() {
  if (!canAdd() || S.add) return;
  const mine = S.ref && S.ref.my_rep;
  S.add = { name: "", phone: "", gender: "", dobText: "", dob: "", owner: mine || SHARED, how: "", note: "", force: false };
  S.addErr = null; S.addDup = null;
  pushOverlay("add");
  renderAddClient();
  const f = $("#add-name");
  if (f) f.focus();
}
function closeAddClient(fromHistory, then) {
  if (!S.add) { if (then) then(); return; }
  S.add = null; S.addErr = null; S.addDup = null; S.addBusy = false;
  const host = $("#addwrap");
  if (host) host.remove();
  if (!fromHistory) popOverlay("add", then); else if (then) then();
}
// The number is looked up while it is typed: four digits are enough.
async function addLookup() {
  const e = S.add;
  if (!e) return;
  const digits = String(e.phone || "").replace(/\D/g, "");
  const seq = ++S.addLook;
  if (digits.length < 7) { S.addDup = null; renderAddClient(); return; }
  S.addDup = { loading: true, rows: [] };
  renderAddClient();
  try {
    const r = await call("clients", { q: digits, status: "all", limit: 3 });
    if (seq !== S.addLook || !S.add) return;
    S.addDup = { loading: false, rows: r.rows || [] };
  } catch (x) {
    if (seq !== S.addLook) return;
    S.addDup = null;
  }
  renderAddClient();
}
let addTimer = null;
function addOwnerOptions() {
  const mine = S.ref && S.ref.my_rep;
  const reps = ((S.ref && S.ref.sales_reps) || []).filter((r) => r.active && !isShared(r.label));
  const out = [];
  if (mine) out.push([mine, tr("Me ({name})", { name: who(mine) })]);
  for (const r of reps) if (r.label !== mine) out.push([r.label, who(r.label)]);
  out.push([SHARED, tr(SHARED)]);
  return out;
}
async function addSubmit(force) {
  const e = S.add;
  if (!e || S.addBusy) return;
  if (blank(e.name) || e.name.trim().length < 3) { S.addErr = tr("Write the client's name."); renderAddClient(); return; }
  if (!blank(e.dobText) && !e.dob) { S.addErr = tr("Enter the date as dd.mm.yyyy, for example 14.03.1988."); renderAddClient(); return; }
  if (!blank(e.phone) && String(e.phone).replace(/\D/g, "").length < 7) {
    S.addErr = tr("Enter the phone number, for example +998 90 123 45 67."); renderAddClient(); return;
  }
  S.addBusy = true; S.addErr = null;
  renderAddClient();
  try {
    const data = await call("client_add", {
      name: e.name.trim(), phone: e.phone, gender: e.gender || null, dob: e.dob || null,
      owner: e.owner, how_met: e.how, note: e.note, force: force === true,
    });
    const id = data.client && data.client.client_id;
    S.addBusy = false;
    // The form is a history step of its own, so the card waits until the
    // address has moved back — otherwise the step back closes it again.
    closeAddClient(false, () => {
      // The record opens where the rest gets filled in, not on the clean-up.
      if (id) { S.cardTab = "overview"; openCard(id); }
      refreshBehind();
    });
    toast(tr("Client added. Fill in the rest on the card."));
  } catch (x) {
    S.addBusy = false;
    S.addErr = x.message;
    // The server says which records already hold this number or name.
    const refs = String(x.message || "").match(/\b(?:DLD|PRS)-\d{3,4}\b/g);
    S.add.onFile = refs && refs.length ? refs : null;
    renderAddClient();
  }
}
function renderAddClient() {
  if (!S.add) return;
  let host = $("#addwrap");
  if (!host) {
    host = el("div", { id: "addwrap", class: "addwrap" });
    document.body.appendChild(host);
  }
  const e = S.add;
  const keep = $("#add-name") === document.activeElement ? "add-name" : $("#add-phone") === document.activeElement ? "add-phone"
    : $("#add-note") === document.activeElement ? "add-note" : $("#add-dob") === document.activeElement ? "add-dob" : null;
  const pos = keep ? ($("#" + keep).selectionStart ?? null) : null;
  host.innerHTML = "";
  const owner = el("select", { id: "add-owner", onchange: (ev) => { e.owner = ev.target.value; } },
    addOwnerOptions().map(([v, t]) => el("option", { value: v, text: t })));
  owner.value = e.owner;
  const dup = [];
  if (S.addDup && S.addDup.loading) dup.push(el("p", { class: "hint", text: tr("Checking…") }));
  else if (S.addDup && S.addDup.rows.length) {
    dup.push(el("div", { class: "add-dup" }, [
      el("b", { text: tr("Already on file") + ": " }),
      ...S.addDup.rows.map((r) => el("button", { type: "button", class: "linkish", "data-open": r.client_id,
        onclick: () => { const id = r.client_id; closeAddClient(); openCard(id); },
        text: r.client_id + " · " + (blank(r.display_name) ? tr("Unnamed record") : r.display_name) })),
    ]));
  }
  const box = el("section", { class: "addbox", role: "dialog", "aria-modal": "true", "aria-labelledby": "add-title" }, [
    el("div", { class: "sheet-head" }, [
      el("h3", { id: "add-title", text: tr("Add a client") }),
      el("button", { class: "btn subtle close", type: "button", "aria-label": tr("Close"), disabled: S.addBusy ? true : null,
        onclick: () => closeAddClient(), text: "×" }),
    ]),
    el("form", { class: "editor add-form", onsubmit: (ev) => { ev.preventDefault(); addSubmit(false); } }, [
      el("label", { for: "add-name", class: "lbl", text: tr("Name") }),
      el("input", { type: "text", id: "add-name", maxlength: "120", value: e.name, autocomplete: "off",
        placeholder: tr("Surname, name and patronymic as the client gives it"),
        oninput: (ev) => { e.name = ev.target.value; } }),
      el("label", { for: "add-phone", class: "lbl", text: tr("Phone number") }),
      el("input", { type: "tel", id: "add-phone", inputmode: "tel", maxlength: "24", value: e.phone, autocomplete: "off",
        placeholder: "+998 90 123 45 67",
        oninput: (ev) => { e.phone = ev.target.value; clearTimeout(addTimer); addTimer = setTimeout(addLookup, 450); } }),
      ...dup,
      el("fieldset", { class: "opt-grid" }, [el("legend", { text: tr("Who they are") }),
        radio("add-g", "F", e.gender === "F", tr("Female"), (v) => { e.gender = v; }),
        radio("add-g", "M", e.gender === "M", tr("Male"), (v) => { e.gender = v; })]),
      el("label", { for: "add-dob", class: "lbl", text: tr("Date of birth") }),
      el("input", { type: "text", id: "add-dob", inputmode: "numeric", autocomplete: "off", maxlength: "10",
        placeholder: tr("dd.mm.yyyy"), value: e.dobText,
        oninput: (ev) => { const t = maskDmy(ev.target.value); if (t !== ev.target.value) ev.target.value = t;
          e.dobText = t; e.dob = dmyToIso(t) || ""; } }),
      el("label", { for: "add-owner", class: "lbl", text: tr("Owner") }), owner,
      el("fieldset", { class: "opt-grid" }, [el("legend", { text: tr("How we met") }),
        ...HOW_MET.map(([v, l]) => radio("add-how", v, e.how === v, tr(l), (x) => { e.how = x; }))]),
      el("label", { for: "add-note", class: "lbl", text: tr("Note (optional)") }),
      el("input", { type: "text", id: "add-note", maxlength: "500", value: e.note,
        placeholder: tr("E.g. came in with a friend, looking for a gift"),
        oninput: (ev) => { e.note = ev.target.value; } }),
      el("p", { class: "hint", text: tr("A new record is a prospect until Colibri brings a purchase. It goes through the clean-up, so someone confirms what you typed.") }),
      S.addErr ? el("p", { class: "form-err", role: "alert", text: S.addErr }) : null,
      e.onFile ? el("div", { class: "actions" }, [
        ...e.onFile.map((id) => el("button", { type: "button", class: "btn sm subtle", "data-open": id,
          onclick: () => { closeAddClient(); openCard(id); }, text: tr("Open {id}", { id }) })),
        el("button", { type: "button", class: "btn sm", "data-act": "add-force", disabled: S.addBusy ? true : null,
          onclick: () => addSubmit(true), text: tr("This is a different person — add anyway") }),
      ]) : null,
      el("div", { class: "form-actions" }, [
        el("button", { class: "btn primary", type: "submit", disabled: S.addBusy ? true : null,
          text: S.addBusy ? tr("Saving…") : tr("Add client") }),
        el("button", { class: "btn subtle", type: "button", disabled: S.addBusy ? true : null,
          onclick: () => closeAddClient(), text: tr("Cancel") }),
      ]),
    ]),
  ]);
  host.append(el("div", { class: "add-scrim", onclick: () => { if (!S.addBusy) closeAddClient(); } }), box);
  if (keep) { const n = $("#" + keep); if (n) { n.focus(); if (pos !== null) { try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } } }
}
// Escape closes the form before anything else on the page sees the key.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.add && !S.addBusy) { e.preventDefault(); e.stopImmediatePropagation(); closeAddClient(); }
}, true);

function addClientButton(compact) {
  if (!canAdd()) return null;
  return el("button", { class: "btn primary add-client" + (compact ? " icon-btn" : ""), type: "button", "data-act": "add-client",
    "aria-label": tr("Add a client"), title: tr("Add a client"), onclick: openAddClient },
    compact ? [el("span", { "aria-hidden": "true", text: "+" })] : [el("span", { "aria-hidden": "true", text: "+ " }), tr("Add a client")]);
}
