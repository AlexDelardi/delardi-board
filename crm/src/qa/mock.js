// A stand-in for crm-api v12, with invented clients only — nothing here is a
// real person, and the sales people's names are invented too. It serves the
// screens the tests drive: the list, the card, the checklists, and adding a
// client by hand (with the duplicate guard).
const TOKEN = "d".repeat(64), TOKEN_VIEW = "v".repeat(64), TOKEN_REP = "r".repeat(64);
// v12: sales people are shown by name, former ones kept and marked as left.
const reps = [
  { label: "Nodira T.", active: false }, { label: "Sevara U.", active: false },
  { label: "Feruza V.", active: false }, { label: "Shahnoza X.", active: false },
  { label: "Bekzod Y.", active: false }, { label: "Oydin Z.", active: false },
  { label: "Dilnoza A.", active: true }, { label: "Malika B.", active: true },
  { label: "Shared (store)", active: true },
];
const REP_A = "Dilnoza A.", REP_B = "Malika B.";
const NAMES = [
  ["Соколова Мария Андреевна", "Соколова Мария", "F", "1986-04-12"],
  ["Иванова Екатерина Сергеевна", "Иванова Екатерина", "F", "1979-10-02"],
  ["Рахимов Тимур Бахтиёрович", "Рахимов Тимур", "M", "1974-06-25"],
  ["Юсупова Нигора Акбаровна", "Юсупова Нигора", "F", "1990-11-08"],
  ["Ким Ольга Викторовна", "Ким Ольга", "F", "1983-02-19"],
  ["Каримов Азиз Рустамович", "Каримов Азиз", "M", "1981-09-30"],
  ["Петрова Анна Игоревна", "Петрова Анна", "F", "1992-03-14"],
  ["Назарова Дильноза Шухратовна", "Назарова Дильноза", "F", "1988-07-21"],
  ["Волкова Светлана Павловна", "Волкова Светлана", "F", "1976-12-05"],
  ["Усманов Шерзод Акмалович", "Усманов Шерзод", "M", "1985-05-17"],
  ["Ли Виктория Дмитриевна", "Ли Виктория", "F", "1993-08-09"],
  ["Хамидова Зарина Фарходовна", "Хамидова Зарина", "F", "1987-01-28"],
  ["Орлова Татьяна Николаевна", "Орлова Татьяна", "F", "1972-04-03"],
  ["Садыкова Малика Улугбековна", "Садыкова Малика", "F", "1991-06-11"],
  ["Белова Ирина Олеговна", "Белова Ирина", "F", "1984-09-22"],
  ["Турсунов Жахонгир Алишерович", "Турсунов Жахонгир", "M", "1978-02-07"],
];
const SEG = ["Champion", "Loyal", "Cannot lose", "At risk - high value", "Needs attention", "New high-value", "Hibernating", "At risk"];
const LIFE = ["Active", "Active", "At risk", "Lapsed", "Active", "At risk", "Dormant", "Lapsed"];
const SPEND = [412000000, 318500000, 276900000, 241000000, 198400000, 173200000, 151800000, 134600000,
  118300000, 97500000, 86200000, 74900000, 63100000, 52400000, 41800000, 28600000];
const phone = (i) => "+99890" + String(1230000 + i * 48271).slice(-7);
const CH = ["visit", "call", "telegram", "whatsapp"];

function build(i) {
  const [col, mkt, g, dob] = NAMES[i];
  const kind = i % 4;                 // 0 decision, 1 confirm, 2 clean, 3 checked
  const owner = i % 3 === 2 ? "Shared (store)" : i % 2 ? REP_B : REP_A;
  const c = {
    client_id: "DLD-" + String(1 + i).padStart(4, "0"), record_type: "client", record_state: kind === 3 ? "confirmed" : "open",
    in_colibri: true, in_marketing: kind !== 2, in_telegram: i % 3 === 0, name_telegram: i % 3 === 0 ? mkt : null,
    merged_into: null, state_reason: null, state_by: null, state_at: null,
    name_colibri: col, name_marketing: kind === 0 ? mkt.split(" ")[0] + " " + mkt.split(" ")[1] : kind === 2 ? null : mkt,
    name_confirmed: kind >= 2 ? col : null, name_flag: kind === 0 ? "conflict" : kind === 1 ? "gap" : kind === 2 ? "none" : "client",
    phone_colibri: phone(i), phone_marketing: kind === 2 ? null : phone(i), phone_confirmed: kind === 3 ? phone(i) : null,
    phone_telegram: i % 3 === 0 ? phone(i) : null, phone_flag: kind === 2 ? "gap" : kind === 3 ? "client" : "agreed",
    gender_colibri: g, gender_marketing: kind === 2 ? null : g, gender_confirmed: kind >= 2 ? g : null,
    gender_flag: kind === 2 ? "gap" : "agreed",
    dob_colibri: dob, dob_marketing: kind === 1 ? null : kind === 0 ? dob.slice(0, 8) + String(Number(dob.slice(8)) + 1).padStart(2, "0") : dob,
    dob_confirmed: kind >= 2 ? dob : null, dob_flag: kind === 0 ? "conflict" : kind === 1 ? "gap" : kind === 2 ? "none" : "client",
    patronymic: col.split(" ")[2] || null, email: null,
    channel_raw: "Telegram", marketing_consent: null, purchase_for_raw: "Себе", awareness_source_raw: "Рекомендация знакомых",
    online_interest_raw: "Нет, предпочитаю покупать в бутике", brand_preference_raw: ["Messika", "Bulgari", "Hublot", null][i % 4],
    form_submitted_at: kind === 2 ? null : "2024-11-0" + (1 + (i % 8)) + "T10:" + (10 + i) + ":00+00:00", form_duplicate: false,
    first_purchase_at: "202" + (2 + (i % 3)) + "-0" + (1 + (i % 8)) + "-1" + (i % 9),
    last_purchase_at: "2026-0" + (1 + (i % 9)) + "-" + String(2 + (i % 26)).padStart(2, "0"),
    purchase_occasions: 1 + (i % 6), items_bought: 1 + (i % 9), lifetime_spend_uzs: SPEND[i],
    abc_class: i < 5 ? "A" : i < 11 ? "B" : "C", rfm_segment: SEG[i % SEG.length], lifecycle_status: LIFE[i % LIFE.length],
    related_party: i === 7, advisors_seen: 1 + (i % 3), do_not_contact: i === 5, contact_note: i === 5 ? "Asked us not to call." : null, referred_by: null,
    reviewed_by: kind === 3 ? "Dilnoza A." : null, reviewed_at: kind === 3 ? "2026-09-28T11:20:00Z" : null,
    created_at: "2026-09-18T13:00:00Z", updated_at: "2026-09-3" + (i % 2) + "T09:0" + (i % 9) + ":00Z",
    client_owner: owner, historic_owner: owner, assigned_owner: owner, assigned_by: "Alex", assigned_at: "2026-09-21T08:19:41Z",
    assignment_reason: owner === "Shared (store)" ? "rule: lapsed or dormant — shared win-back list" : "rule: balanced by spend",
    owner_active: true,
  };
  c.phone_in_colibri = !!c.phone_colibri; c.phone_in_marketing = !!c.phone_marketing; c.phone_in_telegram = !!c.phone_telegram;
  c.added_by_hand = false; c.how_met = null;
  return c;
}
const SUR = ["Абдуллаева", "Миронова", "Исмаилова", "Громова", "Турсунова", "Левина", "Юлдашева", "Корнилова", "Насырова", "Третьякова",
  "Шарипова", "Данилова", "Хакимова", "Егорова", "Мухаммадиева", "Савельева"];
const FIRST = ["Дилноза", "Алина", "Камила", "Юлия", "Севара", "Наталья", "Мадина", "Полина", "Зухра", "Евгения",
  "Нодира", "Алёна", "Лола", "Ксения", "Гульнора", "Арина"];
const PATR = ["Рустамовна", "Сергеевна", "Фарходовна", "Андреевна", "Шухратовна", "Николаевна", "Акмаловна", "Дмитриевна"];
for (let k = 0; k < 32; k++) {
  const sur = SUR[k % SUR.length], first = FIRST[(k * 5 + 3) % FIRST.length], patr = PATR[k % PATR.length];
  NAMES.push([sur + " " + first + " " + patr, sur + " " + first, "F", "19" + (70 + (k % 25)) + "-" + String(1 + (k % 12)).padStart(2, "0") + "-" + String(2 + (k % 26)).padStart(2, "0")]);
  SPEND.push(Math.round(26000000 / (1 + k * 0.12)));
}
const DB = NAMES.map((_, i) => build(i));
const find = (id) => DB.find((c) => c.client_id === id);

// contacts, personal data and important dates for the cards we photograph
const CONTACTS = [
  { id: 1, client_id: "DLD-0001", contacted_on: "2026-09-29", by: REP_A, channel: "call", note: "Invited to the Messika evening on 10 October — will confirm this week.", logged_by: REP_A, can_remove: false },
  { id: 2, client_id: "DLD-0001", contacted_on: "2026-08-14", by: REP_B, channel: "visit", note: "Tried the Move Uno bracelet, left her ring size.", logged_by: REP_B, can_remove: false },
  { id: 3, client_id: "DLD-0001", contacted_on: "2026-06-02", by: REP_A, channel: "telegram", note: null, logged_by: REP_A, can_remove: false },
  { id: 4, client_id: "DLD-0003", contacted_on: "2026-09-18", by: REP_B, channel: "whatsapp", note: "Asked about a watch for his wife's anniversary.", logged_by: REP_B, can_remove: false },
];
const PERSONAL = {
  "DLD-0001": { ring_sizes: [16.5, 17], wrist_cm: 16, necklace_cm: 45, sizes_note: "Wears rings on the index finger",
    sizes_by: REP_A, sizes_at: "2026-09-20T09:00:00Z", metals: ["white_gold", "rose_gold"], stones: ["diamonds"], styles: ["classic"],
    fav_brands: "Messika Move, Bulgari Serpenti", dislikes: "Nothing too large", prefs_note: "Buys for herself, usually before a trip",
    prefs_by: REP_A, prefs_at: "2026-09-20T09:00:00Z", address: "Tashkent, Yunusabad 4, building 12, flat 30",
    address_by: REP_B, address_at: "2026-09-15T12:00:00Z",
    about: "Comes with her sister. Prefers an appointment after 18:00. Collects bracelets — three Messika pieces so far.",
    about_by: REP_A, about_at: "2026-09-20T09:05:00Z" },
};
const DATES = [
  { id: 1, client_id: "DLD-0001", kind: "anniversary", label: null, month: 10, day: 11, year: 2014, added_by: REP_A },
  { id: 2, client_id: "DLD-0001", kind: "child_birthday", label: "daughter Laylo", month: 12, day: 3, year: 2016, added_by: REP_A },
];
const EVENTS = Object.assign(Object.create(null), {
  "DLD-0001": [
    { id: 9, client_id: "DLD-0001", at: "2026-09-29T15:10:00Z", actor: REP_A, action: "contact_logged", field: null, old_value: null, new_value: "call", note: "2026-09-29" },
    { id: 8, client_id: "DLD-0001", at: "2026-09-20T09:05:00Z", actor: REP_A, action: "personal_set", field: "about", old_value: null, new_value: null, note: "about" },
    { id: 7, client_id: "DLD-0001", at: "2026-09-20T09:00:00Z", actor: REP_A, action: "personal_set", field: "sizes", old_value: null, new_value: null, note: "ring_sizes,wrist_cm" },
    { id: 6, client_id: "DLD-0001", at: "2026-09-19T14:02:00Z", actor: "Dilnoza A.", action: "note", field: null, old_value: null, new_value: null, note: "Looking for a gift for her sister in December." },
    { id: 5, client_id: "DLD-0001", at: "2026-09-18T10:40:00Z", actor: "Dilnoza A.", action: "field_resolved", field: "name", old_value: null, new_value: "Соколова Мария Андреевна", note: "client:colibri" },
  ],
});
const transactions = (id) => {
  const i = DB.findIndex((c) => c.client_id === id);
  const base = [
    { id: 3, client_id: id, sold_at: "2026-07-09", brand: "Messika", category: "Bracelet", item: "Браслет MOVE UNO из белого золота с бриллиантами", qty: 1, gross_uzs: 59250000, discount_pct: 0.07, net_uzs: 55103000, advisor: REP_A },
    { id: 2, client_id: id, sold_at: "2025-03-21", brand: "Bulgari", category: "Watch", item: "Часы SERPENTI TUBOGAS", qty: 1, gross_uzs: 87500000, discount_pct: 0, net_uzs: 87500000, advisor: REP_B },
    { id: 1, client_id: id, sold_at: "2023-12-14", brand: "Messika", category: "Earrings", item: "Серьги MOVE CLASSIQUE", qty: 1, gross_uzs: 31200000, discount_pct: 0.05, net_uzs: 29640000, advisor: REP_A },
  ];
  const c = DB[i];
  // A record the team typed in has no Colibri history until the refresh brings one.
  if (!c || c.added_by_hand || !c.in_colibri) return [];
  return base.slice(0, 1 + ((i + 2) % 3));
};
function queueRow(c) {
  const flags = [c.name_flag, c.phone_flag, c.gender_flag, c.dob_flag];
  const conflict_fields = flags.filter((f) => f === "conflict").length;
  const gap_fields = flags.filter((f) => f === "gap").length;
  const review_status = c.record_state === "confirmed" ? "checked" : conflict_fields ? "decision" : gap_fields ? "confirm" : "clean";
  const last = CONTACTS.filter((x) => x.client_id === c.client_id).sort((a, b) => (a.contacted_on < b.contacted_on ? 1 : -1))[0];
  return {
    client_id: c.client_id, record_type: c.record_type, record_state: c.record_state, in_colibri: c.in_colibri, in_marketing: c.in_marketing,
    abc_class: c.abc_class, rfm_segment: c.rfm_segment, lifecycle_status: c.lifecycle_status, client_owner: c.client_owner, owner_active: true,
    lifetime_spend_uzs: c.lifetime_spend_uzs, last_purchase_at: c.last_purchase_at, conflict_fields, gap_fields,
    settled_fields: 4 - conflict_fields - gap_fields, queue_class: conflict_fields ? "conflict" : gap_fields ? "gap" : "clean",
    reviewed_by: c.reviewed_by, reviewed_at: c.reviewed_at, updated_at: c.updated_at, related_party: false, historic_owner: c.historic_owner,
    review_status, display_name: c.name_confirmed || c.name_colibri || c.name_marketing, merged_into: null, state_reason: null,
    in_telegram: !!c.in_telegram, last_contact_on: last ? last.contacted_on : null, last_contact_by: last ? last.by : null,
    last_contact_channel: last ? last.channel : null,
    added_by_hand: !!c.added_by_hand, how_met: c.how_met || null,
    do_not_contact: !!c.do_not_contact, related_party: !!c.related_party,
  };
}
function totals() {
  const rows = DB.map(queueRow);
  const b = (s) => rows.filter((r) => r.review_status === s).length;
  return { records: rows.length, clients: rows.length, prospects: 0, leads: 12,
    decision: b("decision"), confirm: b("confirm"), clean: b("clean"), checked: b("checked"),
    set_aside: 0, done: b("clean") + b("checked"), deleted: 0, merged: 0, conflict: b("decision"), gap: b("confirm"),
    conflict_fields: rows.reduce((a, r) => a + r.conflict_fields, 0), gap_fields: rows.reduce((a, r) => a + r.gap_fields, 0) };
}
function card(id) {
  const c = find(id);
  const q = queueRow(c);
  const lines = transactions(id);
  const by_brand = {}, by_category = {};
  for (const l of lines) {
    (by_brand[l.brand] ??= { lines: 0, net: 0 }); by_brand[l.brand].lines++; by_brand[l.brand].net += l.net_uzs;
    (by_category[l.category] ??= { lines: 0, net: 0 }); by_category[l.category].lines++; by_category[l.category].net += l.net_uzs;
  }
  return {
    client: { ...c }, queue: q, transactions: lines,
    contacts: CONTACTS.filter((x) => x.client_id === id).sort((a, b) => (a.contacted_on < b.contacted_on ? 1 : -1)),
    personal: PERSONAL[id] || null,
    important_dates: DATES.filter((d) => d.client_id === id),
    telegram: { chats: [], suggested: [], missed: [] },
    events: EVENTS[id] || [],
    field_meta: (EVENTS[id] || []).filter((e) => e.action === "field_resolved")
      .reduce((a, e) => { a[e.field] = { by: e.actor, at: e.at, basis: "client", source: "colibri" }; return a; }, {}),
    duplicates: [],
    rollup: { lines: lines.length, net: lines.reduce((a, l) => a + l.net_uzs, 0), by_brand, by_category },
  };
}
function listRows(body, except) {
  let rows = DB.map(queueRow);
  if (Array.isArray(body.statuses) && body.statuses.length && except !== "status") rows = rows.filter((r) => body.statuses.includes(r.review_status));
  else if (body.status && body.status !== "active" && body.status !== "all" && except !== "status") {
    if (body.status === "done") rows = rows.filter((r) => r.review_status === "clean" || r.review_status === "checked");
    else rows = rows.filter((r) => r.review_status === body.status);
  }
  if (body.abc_class && except !== "abc") rows = rows.filter((r) => r.abc_class === body.abc_class);
  if (Array.isArray(body.abc_classes) && body.abc_classes.length && except !== "abc") rows = rows.filter((r) => body.abc_classes.includes(r.abc_class));
  if (body.lifecycle_status && except !== "lifecycle") rows = rows.filter((r) => r.lifecycle_status === body.lifecycle_status);
  if (Array.isArray(body.lifecycles) && body.lifecycles.length && except !== "lifecycle") rows = rows.filter((r) => body.lifecycles.includes(r.lifecycle_status));
  if (body.rfm_segment && except !== "segment") rows = rows.filter((r) => r.rfm_segment === body.rfm_segment);
  if (Array.isArray(body.segments) && body.segments.length && except !== "segment") rows = rows.filter((r) => body.segments.includes(r.rfm_segment));
  if (body.client_owner && except !== "owner") rows = rows.filter((r) => r.client_owner === body.client_owner);
  if (Array.isArray(body.owners) && body.owners.length && except !== "owner") rows = rows.filter((r) => body.owners.includes(r.client_owner));
  if (body.owner_status === "unassigned") rows = rows.filter((r) => r.client_owner === "Shared (store)");
  if (body.not_contacted) rows = rows.filter((r) => !r.last_contact_on);
  if (body.added === "only") rows = rows.filter((r) => r.added_by_hand);
  if (body.added === "exclude") rows = rows.filter((r) => !r.added_by_hand);
  if (body.do_not_contact === "exclude") rows = rows.filter((r) => !find(r.client_id).do_not_contact);
  if (body.related === "exclude") rows = rows.filter((r) => !find(r.client_id).related_party);
  if (body.birth_month) {
    // v13: the best date on file, like the view
    rows = rows.filter((r) => {
      const c = find(r.client_id);
      const d = c.dob_confirmed || c.dob_colibri || c.dob_marketing;
      return d && Number(d.slice(5, 7)) === Number(body.birth_month);
    });
  }
  if (body.q) {
    const raw = String(body.q).trim();
    const d = raw.replace(/\D/g, "");
    if (/^[\d\s+\-]+$/.test(raw) && d.length >= 4) {
      // v12: the real API searches the four phone columns by digits alone.
      const byPhone = new Set(DB.filter((c) => [c.phone_colibri, c.phone_marketing, c.phone_confirmed, c.phone_telegram]
        .some((x) => digitsOf(x).includes(d))).map((c) => c.client_id));
      rows = rows.filter((r) => byPhone.has(r.client_id) || r.client_id.toLowerCase().includes(d));
    } else {
      const w = raw.toLowerCase();
      rows = rows.filter((r) => r.client_id.toLowerCase().includes(w) || String(r.display_name || "").toLowerCase().includes(w));
    }
  }
  if (Array.isArray(body.ids)) rows = rows.filter((r) => body.ids.includes(r.client_id));
  return rows;
}
const digitsOf = (x) => String(x || "").replace(/\D/g, "");
const nameKey = (x) => String(x || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я ]/g, "").split(/\s+/).filter(Boolean).sort().join(" ");
let nextPrs = 1;
// The server's own guard, in miniature: a number or a name already on file.
function clientAdd(body, actor) {
  const name = String(body.name || "").trim();
  if (name.length < 3) return [409, { error: "Write the client's name." }];
  const d = digitsOf(body.phone);
  if (body.phone && (d.length < 7 || d.length > 15)) return [409, { error: "That is not a phone number." }];
  if (body.dob && body.dob > "2008-12-31") return [409, { error: "That date of birth is outside the plausible range." }];
  const owner = String(body.owner || "Shared (store)");
  if (!reps.find((r) => r.label === owner && r.active)) return [409, { error: "Choose a current sales rep or the shared list." }];
  if (!body.force) {
    const hits = DB.filter((c) => (d && d.length >= 4 && [c.phone_colibri, c.phone_marketing, c.phone_confirmed, c.phone_telegram]
        .some((x) => digitsOf(x).includes(d))) || nameKey(c.name_colibri || c.name_marketing) === nameKey(name))
      .map((c) => c.client_id).slice(0, 5);
    if (hits.length) return [409, { error: "Already on file: " + hits.join(", ") + ". Open that record, or say it is a different person." }];
  }
  const id = "PRS-" + String(nextPrs++).padStart(3, "0");
  const c = {
    client_id: id, record_type: "prospect", record_state: "open", in_colibri: false, in_marketing: true, in_telegram: false,
    name_colibri: null, name_marketing: name, name_confirmed: null, name_flag: "gap",
    phone_colibri: null, phone_marketing: body.phone || null, phone_confirmed: null, phone_telegram: null,
    phone_flag: body.phone ? "gap" : "none",
    gender_colibri: null, gender_marketing: body.gender || null, gender_confirmed: null, gender_flag: body.gender ? "gap" : "none",
    dob_colibri: null, dob_marketing: body.dob || null, dob_confirmed: null, dob_flag: body.dob ? "gap" : "none",
    patronymic: null, email: null, channel_raw: null, purchase_for_raw: null, awareness_source_raw: null,
    online_interest_raw: null, brand_preference_raw: null, form_submitted_at: null, form_duplicate: false,
    first_purchase_at: null, last_purchase_at: null, purchase_occasions: null, items_bought: null, lifetime_spend_uzs: null,
    abc_class: null, rfm_segment: null, lifecycle_status: null, related_party: false, advisors_seen: null,
    do_not_contact: false, contact_note: null, referred_by: null, reviewed_by: null, reviewed_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    client_owner: owner, historic_owner: owner, assigned_owner: owner, assigned_by: actor, assigned_at: new Date().toISOString(),
    assignment_reason: "manual: added by hand", owner_active: true,
    added_by_hand: true, how_met: body.how_met || null, name_telegram: null,
  };
  c.phone_in_colibri = false; c.phone_in_marketing = !!c.phone_marketing; c.phone_in_telegram = false;
  DB.push(c);
  EVENTS[id] = [{ id: 900 + DB.length, client_id: id, at: new Date().toISOString(), actor, action: "created_by_hand",
    field: null, old_value: null, new_value: owner, note: body.how_met || null }];
  if (body.note) EVENTS[id].unshift({ id: 901 + DB.length, client_id: id, at: new Date().toISOString(), actor,
    action: "note", field: null, old_value: null, new_value: null, note: body.note });
  return [200, card(id)];
}

const bdOf = (id) => {
  const c = find(id);
  const d = c.dob_confirmed || c.dob_colibri || c.dob_marketing;
  return d ? { day: Number(d.slice(8, 10)), month: Number(d.slice(5, 7)), year: Number(d.slice(0, 4)), conf: !!c.dob_confirmed }
           : { day: 99, month: null, year: null, conf: false };
};
// The shape crm_export_rows returns, with the owner already a label.
function exportRow(c, withPhones, ord) {
  const q = queueRow(c);
  const all = [c.phone_confirmed, ...String(c.phone_colibri || "").split(";"), c.phone_marketing, c.phone_telegram]
    .map((x) => String(x || "").trim()).filter((x) => digitsOf(x).length >= 7);
  const seen = new Set(), uniq = [];
  for (const n of all) { const d = digitsOf(n); if (!seen.has(d)) { seen.add(d); uniq.push(n); } }
  const b = bdOf(c.client_id);
  return {
    sort_ord: ord, client_id: c.client_id, display_name: q.display_name,
    phone_main: withPhones ? (uniq[0] || null) : null,
    phones_other: withPhones ? uniq.slice(1) : null,
    birth_day: b.month ? b.day : null, birth_month: b.month, birth_year: b.month ? b.year : null, birth_confirmed: b.conf,
    client_owner: q.client_owner, owner_active: true, record_type: c.record_type, review_status: q.review_status,
    abc_class: c.abc_class, rfm_segment: c.rfm_segment, lifecycle_status: c.lifecycle_status,
    lifetime_spend_uzs: c.lifetime_spend_uzs, purchase_occasions: c.purchase_occasions,
    first_purchase_at: c.first_purchase_at, last_purchase_at: c.last_purchase_at,
    last_contact_on: q.last_contact_on, last_contact_by: q.last_contact_by, last_contact_channel: q.last_contact_channel,
    do_not_contact: !!c.do_not_contact, in_telegram: !!c.in_telegram,
    added_by_hand: !!c.added_by_hand, how_met: c.how_met || null, related_party: !!c.related_party,
  };
}

function handle(body) {
  const a = body.action;
  if (a === "unlock") {
    if (body.passcode === "viewer") return [200, { token: TOKEN_VIEW, name: "Viewer", expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), can_edit: false }];
    if (body.passcode === "rep") return [200, { token: TOKEN_REP, name: "Dilnoza A.", expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), can_edit: true }];
    return [200, { token: TOKEN, name: "Tester", expires_at: new Date(Date.now() + 8 * 3600e3).toISOString(), can_edit: true }];
  }
  if (![TOKEN, TOKEN_VIEW, TOKEN_REP].includes(body.token)) return [401, { error: "That session is not valid. Enter your passcode again." }];
  const editor = body.token !== TOKEN_VIEW;
  const actor = body.token === TOKEN_REP ? "Dilnoza A." : body.token === TOKEN_VIEW ? "Viewer" : "Tester";
  if (a === "client_add") {
    if (!editor) return [403, { error: "Your account can view client records but not change them." }];
    return clientAdd(body, actor);
  }
  if (a === "set_state" || a === "assign_owner") {
    if (!editor) return [403, { error: "Your account can view client records but not change them." }];
    const c = find(body.id);
    if (a === "set_state") c.record_state = body.state;
    else { c.client_owner = c.assigned_owner = body.owner; c.assigned_by = actor; }
    return [200, card(body.id)];
  }
  // v13: the export right is its own. The tester holds it; the rep who can edit
  // does not, which is how Karina and Ellona stand on the real system.
  const canExport = body.token === TOKEN;
  if (a === "reference") return [200, { name: actor, can_edit: editor, can_import: false, can_export: canExport,
    my_rep: body.token === TOKEN_REP ? REP_A : null, sales_reps: reps,
    value_mappings: [], totals: totals(), activity: { week: 23, today: 6 } }];
  if (a === "export") {
    if (!canExport) return [403, { error: "Your account cannot download client lists." }];
    const rows = listRows(body);
    if (body.kind === "birthdays") {
      rows.sort((x, y) => {
        const dx = bdOf(x.client_id), dy = bdOf(y.client_id);
        return (dx.day - dy.day) || String(x.display_name).localeCompare(String(y.display_name));
      });
    } else rows.sort((x, y) => y.lifetime_spend_uzs - x.lifetime_spend_uzs);
    if (!rows.length) return [400, { error: "Nothing to download: no record matches these filters." }];
    const withPhones = body.phones !== false;
    return [200, {
      rows: rows.map((r, i) => exportRow(find(r.client_id), withPhones, i + 1)),
      total: rows.length, kind: body.kind === "birthdays" ? "birthdays" : "list", with_phones: withPhones,
      exported_by: actor, exported_at: new Date().toISOString(), truncated: false,
    }];
  }
  if (a === "stats") {
    const rows = DB.map(queueRow);
    const sum = (rs) => rs.reduce((x, r) => x + r.lifetime_spend_uzs, 0);
    const own = (o) => rows.filter((r) => r.client_owner === o);
    return [200, { basis: "retail — related parties excluded", clients: rows.length, total_spend: sum(rows),
      median_spend: 74900000, top_decile_share: 0.41, repeat_clients: rows.filter((r) => r.lifetime_spend_uzs > 90000000).length,
      related_party: { clients: 0, spend: 0 }, orphaned: { clients: 0, spend: 0, by_lifecycle: {}, by_abc: {} },
      by_abc: {}, by_segment: {}, by_lifecycle: {},
      by_owner: { REP_A: { clients: own(REP_A).length, spend: sum(own(REP_A)) },
        REP_B: { clients: own(REP_B).length, spend: sum(own(REP_B)) },
        "Shared (store)": { clients: own("Shared (store)").length, spend: sum(own("Shared (store)")) } } }];
  }
  // v13: enough of an Insights payload to render the page, so the birthdays
  // block (and the month download in it) can be checked like anything else.
  if (a === "insights") {
    const live = DB.filter((c) => !["merged", "deleted"].includes(queueRow(c).review_status));
    const dated = live.filter((c) => c.dob_confirmed || c.dob_colibri || c.dob_marketing);
    const greet = dated.filter((c) => !c.do_not_contact);
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1, rows = greet.filter((c) => bdOf(c.client_id).month === m);
      return { month: m, clients: rows.length, spend: rows.reduce((a, c) => a + c.lifetime_spend_uzs, 0),
        to_confirm: rows.filter((c) => !c.dob_confirmed).length };
    });
    const soon = greet.slice(0, 4).map((c, i) => ({
      client_id: c.client_id, display_name: queueRow(c).display_name, record_type: c.record_type,
      date: "2026-10-2" + (i + 1), days: i + 2, owner: c.client_owner, abc: c.abc_class,
      lifecycle: c.lifecycle_status, segment: c.rfm_segment, spend: c.lifetime_spend_uzs,
      confirmed: !!c.dob_confirmed,
    }));
    return [200, {
      as_of: "2026-10-15", basis: "retail",
      last_recalculated: { ran_at: "2026-10-15T00:05:00Z", as_of: "2026-10-15", trigger: "nightly" },
      headline: { clients: live.length, spend: live.reduce((a, c) => a + c.lifetime_spend_uzs, 0), active_12m: 9,
        repeat: 11, repeat_share: 0.37, priority: 8, priority_spend: 21040000000, birthdays_30: soon.length },
      grid: [], segments: [], owners: [], years: [], frequency: [], multi_brand: [],
      brands: [], categories: [], brand_years: [], brand_pairs: [],
      // multi_brand is a list of buckets, not an object

      birthdays: {
        on_file: greet.length, confirmed: greet.filter((c) => c.dob_confirmed).length,
        to_confirm: greet.filter((c) => !c.dob_confirmed).length,
        missing: live.length - dated.length, do_not_contact: dated.length - greet.length,
        by_month: byMonth, upcoming: soon,
      },
    }];
  }
  if (a === "clients") {
    const rows = listRows(body);
    const cols = { name: "display_name", status: "review_status", abc: "abc_class", segment: "rfm_segment", lifecycle: "lifecycle_status",
      owner: "client_owner", last: "last_purchase_at", spend: "lifetime_spend_uzs", contact: "last_contact_on", id: "client_id" };
    if (body.order_by && cols[body.order_by]) {
      const k = cols[body.order_by], s = body.dir === "asc" ? 1 : -1;
      rows.sort((x, y) => (x[k] == null ? 1 : y[k] == null ? -1 : (x[k] < y[k] ? -1 : x[k] > y[k] ? 1 : 0) * s));
    } else if (!body.sort || body.sort === "spend") rows.sort((x, y) => y.lifetime_spend_uzs - x.lifetime_spend_uzs);
    const off = body.offset || 0, lim = body.limit || 50;
    return [200, { rows: rows.slice(off, off + lim), total: rows.length, limit: lim, offset: off }];
  }
  if (a === "client") return [200, card(body.id)];
  if (a === "facets") {
    const col = { status: "review_status", abc: "abc_class", segment: "rfm_segment", lifecycle: "lifecycle_status", owner: "client_owner" }[body.column];
    const rows = listRows(body, body.column), counts = {};
    for (const r of rows) counts[r[col] == null ? "" : r[col]] = (counts[r[col] == null ? "" : r[col]] || 0) + 1;
    return [200, { column: body.column, values: Object.entries(counts).map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count) }];
  }
  if (a === "peek") return [200, { record: queueRow(find(body.id)) }];
  return [400, { error: "Unknown action: " + a }];
}
module.exports = { handle };
