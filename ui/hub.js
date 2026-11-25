/* Delardi tools — the single sign-in, shared by the home page and every tool (ui/hub.js).
   One passcode on the home page gives one session (hub-api) that every tool's API accepts. It is kept in localStorage,
   so every tab on the device shares it; Lock, 8 hours, or 15 idle minutes on a touch device end it everywhere.
   A tool calls two things:
     kitHubAdopt(tool, key, opts)  at start: take the shared session as the tool's own, or go to the home page to sign in;
     kitHubGate(tool)              where it would draw its own passcode card: go to the home page instead.
   window.__HUB_OFF = true (tests only) switches both off, and the tool falls back to its own passcode card. */
const KIT_HUB_API = 'https://hugduzqwyqwryicfzipu.supabase.co/functions/v1/hub-api';
const KIT_HUB_KEY = 'delardi_session';        // localStorage: { token, name, expires_at, tools }
const KIT_HUB_ACTIVE = 'delardi_last_active'; // localStorage: last touch on any page, for the idle lock
const KIT_HUB_IDLE_MIN = 15;                  // touch devices only, as in every tool
let kitHubLeaving = false;

function kitHubOn() { return window.__HUB_OFF !== true; }
function kitHubTouch() { return window.matchMedia('(pointer: coarse)').matches; }
function kitHubGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function kitHubSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function kitHubClear() { kitHubSet(KIT_HUB_KEY, null); kitHubSet(KIT_HUB_ACTIVE, null); }
function kitHubWrite(s) {
  kitHubSet(KIT_HUB_KEY, JSON.stringify({ token: s.token, name: s.name, expires_at: s.expires_at, tools: s.tools || {} }));
}
function kitHubIdle() {
  const last = Number(kitHubGet(KIT_HUB_ACTIVE) || 0);
  return kitHubTouch() && last > 0 && Date.now() - last >= KIT_HUB_IDLE_MIN * 60000;
}
// The shared session, or null: none, past its 8 hours, or left idle on a touch device (then it is dropped here).
function kitHubRead() {
  let s = null;
  try { s = JSON.parse(kitHubGet(KIT_HUB_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !s.token || !(new Date(s.expires_at).getTime() > Date.now())) return null;
  if (kitHubIdle()) { kitHubCall('lock', { token: s.token }); kitHubClear(); return null; }
  return s;
}
// May the signed-in person open this tool? Unknown (no shared session) counts as yes: the tool's API decides anyway.
function kitHubAllowed(tool) {
  if (!kitHubOn()) return true;
  let s = null;
  try { s = JSON.parse(kitHubGet(KIT_HUB_KEY) || 'null'); } catch (e) { s = null; }
  return !s || !s.tools || s.tools[tool] !== false;
}
// → { status, data }; status 0 when there was no answer. Never throws.
async function kitHubCall(action, body) {
  try {
    const res = await fetch(KIT_HUB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify(Object.assign({ action: action }, body || {})) });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    return { status: res.status, data: data };
  } catch (e) { return { status: 0, data: {} }; }
}
let kitHubTick = 0;
function kitHubActive() {
  const now = Date.now();
  if (now - kitHubTick < 10000) return;
  kitHubTick = now;
  if (kitHubGet(KIT_HUB_KEY)) kitHubSet(KIT_HUB_ACTIVE, String(now));
}
// A tool sits one folder under the home page.
function kitHubHome(query) {
  if (kitHubLeaving) return;
  kitHubLeaving = true;
  location.replace('../' + (query ? '?' + query : ''));
}
// Nothing of the tool stays readable or usable while the page is on its way to the home page.
function kitHubCover() {
  if (document.getElementById('hub-cover')) return;
  const c = document.createElement('div');
  c.id = 'hub-cover';
  c.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:var(--bg,#EEF1F7);');
  (document.body || document.documentElement).appendChild(c);
  const app = document.getElementById('app');
  if (app) app.inert = true;
}
// Take the shared session as this tool's own. → true when the tool may start with it. With none, the page goes to
// the home page to sign in and comes back. opts.local: the tool keeps its session in localStorage, not sessionStorage.
// opts.crmKey: the tool also keeps a CRM session under this sessionStorage key (the till's client panel).
// opts.idleKey: where the tool keeps its own last-touch time for its idle lock (opts.local says which storage). The
//   shared session was just read as not idle, so arriving here is a touch: an old time left in the tab must not lock a
//   session signed in a moment ago.
// opts.active(): the tool's own "touched now". Called when another tab is being used, so a tool left open beside it
//   does not lock everyone out for being idle itself.
// opts.leaving(): called before this tab is sent to the home page because another tab locked or signed in afresh.
function kitHubAdopt(tool, key, opts) {
  if (!kitHubOn()) return false;
  const h = kitHubRead();
  if (!h) { kitHubCover(); kitHubHome('next=' + tool); return false; }
  const tools = h.tools || {};
  try {
    const st = opts && opts.local ? localStorage : sessionStorage;
    let cur = null;
    try { cur = JSON.parse(st.getItem(key) || 'null'); } catch (e) { cur = null; }
    if (!cur || cur.token !== h.token) {
      st.setItem(key, JSON.stringify({ token: h.token, name: h.name, expires_at: h.expires_at, can_edit: !!tools.crm_edit, can_manage: !!tools.catalogue_manage }));
    }
    if (opts && opts.idleKey) st.setItem(opts.idleKey, String(Date.now()));
    if (opts && opts.crmKey) {
      if (tools.crm) sessionStorage.setItem(opts.crmKey, JSON.stringify({ token: h.token, can_edit: !!tools.crm_edit, name: h.name, expires_at: h.expires_at }));
      else sessionStorage.removeItem(opts.crmKey);
    }
  } catch (e) { /* storage refused: the tool will ask the home page again */ }
  kitHubActive();
  kitHubCall('open', { token: h.token, tool: tool });            // the login log's line
  // Locked or signed in as someone else in another tab: this tab follows.
  window.addEventListener('storage', function (e) {
    if (e.key === KIT_HUB_ACTIVE) { if (e.newValue && opts && opts.active) { try { opts.active(); } catch (err) { /* the tool's own business */ } } return; }
    if (e.key !== KIT_HUB_KEY) return;
    const now = kitHubRead();
    if (!now || now.token !== h.token) {
      if (opts && opts.leaving) { try { opts.leaving(); } catch (err) { /* leave anyway */ } }
      kitHubCover(); kitHubHome(now ? '' : 'next=' + tool);
    }
  });
  return true;
}
// The tool has locked itself and would draw its passcode card. → true: the home page takes over (the tool draws
// nothing). The home page's API says which case it is: the person has no access to this tool (they stay signed in and
// are told so), or the session is over or was locked (signed out everywhere, sign in again and come back).
function kitHubGate(tool) {
  if (!kitHubOn()) return false;
  kitHubCover();
  if (kitHubLeaving) return true;
  const h = kitHubRead();
  if (!h) { kitHubClear(); kitHubHome('next=' + tool); return true; }
  kitHubCall('me', { token: h.token }).then(function (r) {
    if (r.status === 0) { kitHubHome(''); return; }              // no connection: the home page says so
    if (r.status === 200 && r.data.tools && !r.data.tools[tool]) {
      kitHubWrite({ token: h.token, name: r.data.name, expires_at: r.data.expires_at, tools: r.data.tools });
      kitHubHome('denied=' + tool);
      return;
    }
    const done = function () { kitHubClear(); kitHubHome('next=' + tool); };
    if (r.status === 200) kitHubCall('lock', { token: h.token }).then(done); else done();
  });
  return true;
}
if (kitHubOn()) {
  document.addEventListener('pointerdown', kitHubActive, true);
  document.addEventListener('keydown', kitHubActive, true);
}
