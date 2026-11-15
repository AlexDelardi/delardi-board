/* ===========================================================================
   The CRM, as the till sees it (Task 8)
   The till reads clients through crm-api, the CRM's own edge function, with a
   CRM session of its own: at login the page sends the same passcode to
   crm-api `unlock`. A login without CRM rights gets 403 there, and the till
   then offers Walk-in only. There is no database key here either.

   crm/src/addclient.js is built into this page UNCHANGED. It was written for
   the CRM page, so this file defines exactly the free names it uses and the
   till does not otherwise have:
     call, canEdit, SHARED, isShared, who, radio, maskDmy, dmyToIso,
     pushOverlay, popOverlay, openCard, refreshBehind.
   ($, el, blank, tr, RU, S and toast come from app.js.) addclient.js declares
   canAdd itself (canAdd = () => canEdit()), so it is not declared here.
   ========================================================================= */
const CRM_API = "https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/crm-api";
const CRM_KEY = "sales_crm_session";          // sessionStorage: gone when the tab closes
S.crm = null;                                 // { token, can_edit, name, expires_at, ref: {my_rep, sales_reps} } or null

Object.assign(RU, {
  "No CRM access — Walk-in only": "Нет доступа к клиентской базе — только «Без карты клиента»",
  "The CRM session has ended. Lock and unlock the till to search clients again.":
    "Сеанс клиентской базы закончился. Заблокируйте и снова откройте кассу, чтобы искать клиентов.",
  // what addclient.js says, as the CRM page translates it
  "Name": "Имя",
  "Female": "Женский",
  "Male": "Мужской",
  "Date of birth": "Дата рождения",
  "Owner": "Ответственный",
  "Note (optional)": "Заметка (необязательно)",
  "Saving…": "Сохраняем…",
  "Cancel": "Отмена",
  "Close": "Закрыть",
  "Unnamed record": "Без имени",
  "dd.mm.yyyy": "дд.мм.гггг",
  "Me ({name})": "Я ({name})",
  "Shared (store)": "Общий список (бутик)",
  "Telegram": "Telegram",
  "Other": "Другое",
  "Write the client's name.": "Напишите имя клиента.",
  "Enter the date as dd.mm.yyyy, for example 14.03.1988.": "Введите дату в формате дд.мм.гггг, например 14.03.1988.",
  "Enter the phone number, for example +998 90 123 45 67.": "Введите номер, например +998 90 123 45 67.",
  "Your account can view client records but not change them.": "Ваша учётная запись может просматривать данные клиентов, но не изменять их.",
  "This account does not have access to the CRM.": "У этой учётной записи нет доступа к клиентской базе.",
});

/* -------------------------------------------------------------- the session */
function crmStore(v) {
  try {
    if (v === undefined) return JSON.parse(sessionStorage.getItem(CRM_KEY) || "null");
    if (v === null) sessionStorage.removeItem(CRM_KEY);
    else sessionStorage.setItem(CRM_KEY, JSON.stringify({ token: v.token, can_edit: v.can_edit, name: v.name, expires_at: v.expires_at }));
  } catch (e) { /* storage blocked: the CRM session lives in memory only */ }
  return null;
}
// At login: the same passcode, to crm-api. 401 or 403 (or no answer) → no CRM.
async function crmUnlock(passcode) {
  S.crm = null;
  crmStore(null);
  try {
    const res = await fetch(CRM_API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock", passcode }) });
    if (!res.ok) return false;
    const r = await res.json();
    if (!r || !r.token) return false;
    S.crm = { token: r.token, can_edit: !!r.can_edit, name: r.name, expires_at: r.expires_at, ref: null };
    crmStore(S.crm);
    await crmLoadRef();
    return true;
  } catch (e) {
    S.crm = null;
    return false;
  }
}
// The owner choice of the add-client form reads S.ref.my_rep and S.ref.sales_reps.
async function crmLoadRef() {
  if (!S.crm) return;
  try {
    const r = await call("reference");
    if (S.crm) S.crm.ref = { my_rep: r.my_rep || null, sales_reps: r.sales_reps || [] };
    if (S.ref) Object.assign(S.ref, crmRefFields());
  } catch (e) { /* the form still offers the shared list */ }
}
const crmRefFields = () => (S.crm && S.crm.ref) ? { my_rep: S.crm.ref.my_rep, sales_reps: S.crm.ref.sales_reps } : { my_rep: null, sales_reps: [] };
function crmRestore() {
  const s = crmStore();
  if (s && s.token && new Date(s.expires_at).getTime() > Date.now()) { S.crm = Object.assign({ ref: null }, s); crmLoadRef(); }
  else S.crm = null;
}
function crmDrop() { S.crm = null; crmStore(null); }

/* ------------------------------------------------- what addclient.js needs */
// crm-api with the CRM token. A dead CRM session leaves the till as it is,
// Walk-in only, and says so once.
async function call(action, payload = {}) {
  if (!S.crm) throw new Error(tr("No CRM access — Walk-in only"));
  const body = Object.assign({ action }, payload, { token: S.crm.token });
  let res;
  try {
    res = await fetch(CRM_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(tr("No connection. Check the Wi-Fi and try again."));
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401) {
      crmDrop();
      toast(tr("The CRM session has ended. Lock and unlock the till to search clients again."));
      if (typeof closeClientPanel === "function") closeClientPanel();
      renderAll();
    }
    const err = new Error(data.error ? tr(data.error) : tr("Request failed ({n})", { n: res.status }));
    err.status = res.status;
    throw err;
  }
  return data;
}
function canEdit() { return !!(S.crm && S.crm.can_edit); }
const SHARED = "Shared (store)";
const isShared = (o) => o === SHARED || o === "Unassigned";
// Owners and reps: labels translate, names don't (as the CRM shows them).
function who(v) {
  if (blank(v)) return v;
  const m = /^Sales rep (\d+)$/.exec(String(v));
  if (m) return LANG === "ru" ? "Продавец " + m[1] : String(v);
  return tr(String(v));
}
function radio(name, value, checked, label, onpick, extra) {
  return el("label", { class: "opt" }, [
    el("input", { type: "radio", name, value, checked: checked ? true : null, onchange: () => onpick(value) }),
    el("span", {}, [label, extra || null]),
  ]);
}
// dd.mm.yyyy on screen, ISO to the server (as in crm/src/app.js).
function maskDmy(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 8);
  return d.slice(0, 2) + (d.length > 2 ? "." + d.slice(2, 4) : "") + (d.length > 4 ? "." + d.slice(4) : "");
}
function dmyToIso(t) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(t || ""));
  if (!m) return null;
  const [dd, mm, yy] = [+m[1], +m[2], +m[3]];
  const x = new Date(Date.UTC(yy, mm - 1, dd));
  if (x.getUTCFullYear() !== yy || x.getUTCMonth() !== mm - 1 || x.getUTCDate() !== dd) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
// The till routes by hash, so an overlay takes no history step here: the
// form simply opens and closes, and `then` runs at once.
function pushOverlay() { /* no history step on the till */ }
function popOverlay(name, then) { if (then) then(); return false; }
// "Open the card": on the till that means the client goes on the sale.
// Called after the form adds a client, or when the seller picks the record
// the form found already on file. The form is already closed by then.
async function openCard(id) {
  if (!id) return;
  const s = S.sale;
  s.client_id = id; s.client_name = null; s.walk_in = false;
  if (typeof closeClientPanel === "function") closeClientPanel();
  renderAll();
  try {
    const card = await call("client", { id });
    if (S.sale.client_id === id) { S.sale.client_name = cardName(card); renderAll(); }
  } catch (e) { /* the reference alone still identifies the client */ }
}
function refreshBehind() { /* nothing behind the form needs reloading on the till */ }
// The name the CRM shows for a record.
function cardName(card) {
  const c = (card && card.client) || {}, q = (card && card.queue) || {};
  return q.display_name || c.name_confirmed || c.name_colibri || c.name_marketing || null;
}
