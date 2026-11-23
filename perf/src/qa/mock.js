// A stand-in for perf-api, for the page checks in qa/test.js. handle(body) -> [status, json] with the statuses and
// sentences of perf/src/api/README.md. Invented figures only (the scenario of db/tests/perf_t1_performance.sql).
// The arithmetic here is the least the page needs to redraw after a save or a correction; the real figures are the
// database's (perf_month) and are tested there.
const PASSCODES = { demo: { name: "Demo Director", perf: true }, floor: { name: "Floor Seller", perf: false } };
const delay = {};
let sessions, calls, failNext, inputs, marks, expired;

const PERIOD = (net, gross, tickets, units, large, largeNet, life) => ({
  net, gross, net_usd: Math.round(net / 12000 * 100) / 100, discount_pct: gross > 0 ? Math.round((gross - net) / gross * 10000) / 10000 : null,
  tickets, units, upt: tickets ? Math.round(units / tickets * 100) / 100 : null, atv: tickets ? Math.round(net / tickets) : null,
  asp: units ? Math.round(net / units) : null, multi_item_share: tickets ? 0.25 : null,
  large: { tickets: large, net: largeNet }, base: { tickets: tickets - large, net: net - largeNet, avg: tickets - large ? Math.round((net - largeNet) / (tickets - large)) : null },
  clients: Math.max(0, tickets - 1), lifecycle: life, excluded: { tickets: 0, net: 0 },
});
const LIFE0 = { new: { tickets: 0, net: 0 }, returning: { tickets: 0, net: 0 }, recaptured: { tickets: 0, net: 0 }, no_record: { tickets: 0, net: 0 } };
const TICKETS = [
  { ticket_id: "10000000-0000-4000-8000-000000000001", ticket_no: "PF-A1", sold_at: "2031-10-02", source: "colibri", seller: "Zz Bee", own_seller: "Zz Ann", client_id: "DLD-9101", client: "Zztest One", note: "card; zzsold bee", basis: "retail", net: 50000000, units: 2, large: false, lifecycle: "recaptured", days_since: 630 },
  { ticket_id: "10000000-0000-4000-8000-000000000002", ticket_no: "PF-A2", sold_at: "2031-10-10", source: "colibri", seller: "Zz Ann", own_seller: "Zz Ann", client_id: "DLD-9102", client: "Zztest Two", note: null, basis: "retail", net: 130000000, units: 1, large: true, lifecycle: "returning", days_since: 131 },
  { ticket_id: "10000000-0000-4000-8000-000000000003", ticket_no: "PF-A3", sold_at: "2031-10-12", source: "delardi", seller: "Zz Ann", own_seller: "Zz Ann", client_id: "DLD-9104", client: "Zztest Four", note: null, basis: "retail", net: 24000000, units: 1, large: false, lifecycle: "new", days_since: null },
  { ticket_id: "10000000-0000-4000-8000-000000000004", ticket_no: "PF-A4", sold_at: "2031-10-15", source: "colibri", seller: "Zz Ann", own_seller: "Zz Ann", client_id: "DLD-9103", client: "Zztest Founder", note: null, basis: "founder", net: 5000000, units: 1, large: false, lifecycle: null, days_since: null },
  { ticket_id: "10000000-0000-4000-8000-000000000005", ticket_no: "PF-A5", sold_at: "2031-10-16", source: "colibri", seller: "Zz Ann", own_seller: "Zz Ann", client_id: "DLD-9104", client: "Zztest Four", note: "zzstaff discount", basis: "staff", net: 8000000, units: 1, large: false, lifecycle: null, days_since: null },
  { ticket_id: "10000000-0000-4000-8000-000000000006", ticket_no: "PF-A6", sold_at: "2031-10-20", source: "colibri", seller: "Zz Ann", own_seller: "Zz Ann", client_id: null, client: null, note: null, basis: "retail", net: 16000000, units: 1, large: false, lifecycle: "no_record", days_since: null },
  { ticket_id: "10000000-0000-4000-8000-000000000007", ticket_no: "PF-A7", sold_at: "2031-10-25", source: "colibri", seller: "Zz Ann", own_seller: "Zz Ann", client_id: "DLD-9102", client: "Zztest Two", note: null, basis: "retail", net: -10000000, units: -1, large: false, lifecycle: null, days_since: null },
];
const RULES = { bands: [{ from: 0.8, rate: 0.005 }, { from: 1.0, rate: 0.008 }, { from: 1.2, rate: 0.01 }],
  guardrail: [{ from: 1.0, factor: 1 }, { from: 0.9, factor: 0.95 }, { from: 0.8, factor: 0.9 }, { from: 0, factor: 0.85 }], person_cap: 1000000,
  programmes: [{ key: "two_piece", label: "Two-piece ticket", label_ru: "Чек из двух изделий", pays: 250000, max: 1 }, { key: "focus", label: "Watch focus", label_ru: "Фокус на часы", pays: 600000, max: 2 },
    { key: "recaptured", label: "Client recaptured", label_ru: "Возвращённый клиент", pays: 400000, max: 1 }, { key: "newc", label: "New client", label_ru: "Новый клиент", pays: 200000, max: 1 }] };
const AUTO = { "Zz Ann": { two_piece: 0, focus: 0, recaptured: 0, newc: 1 }, "Zz Bee": { two_piece: 1, focus: 1, recaptured: 1, newc: 0 } };
const blankInputs = () => ({ plan_uzs: null, plan_tickets: null, plan_large_tickets: null, plan_large_uzs: null, visits: null, visits_appointment: null, fx: null, note: null,
  updated_by: null, updated_at: null, sellers: [] });

function reset() {
  sessions = new Map(); calls = []; failNext = null; marks = {}; expired = false;
  for (const k of Object.keys(delay)) delete delay[k];
  inputs = { "2031-10": Object.assign(blankInputs(), { plan_uzs: 200000000, plan_tickets: 5, plan_large_tickets: 1, plan_large_uzs: 100000000, visits: 16, visits_appointment: 4,
    note: "first plan", updated_by: "Demo Director", updated_at: "2031-11-01T06:00:00Z",
    sellers: [{ seller: "Zz Ann", plan_uzs: 150000000, commission: true, programme_counts: {}, paid_uzs: 1400000 }, { seller: "Zz Bee", plan_uzs: 50000000, commission: false, programme_counts: {}, paid_uzs: null }] }) };
}
class Fail { constructor(status, message) { this.status = status; this.message = message; } }
const fail = (s, m) => { throw new Fail(s, m); };
function session(token) {
  if (typeof token !== "string" || token.length < 20) fail(401, "Enter your passcode to open Performance.");
  const s = sessions.get(token);
  if (!s) fail(401, "That session is not valid. Enter your passcode again.");
  if (expired) fail(401, "Your session has expired. Enter your passcode again.");
  return s;
}
function monthIn(v) {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(v || ""));
  if (!m) fail(400, "month must be YYYY-MM.");
  return m[1] + "-" + m[2];
}
function monthDoc(ym) {
  const inp = inputs[ym] || blankInputs(), fx = inp.fx || 12000, isOct = ym === "2031-10";
  const tickets = isOct ? TICKETS.map((t) => {
    const k = marks[t.ticket_id];
    const basis = k && k.basis ? k.basis : t.basis;
    return Object.assign({}, t, { own_seller: undefined, basis, basis_by: k && k.basis ? "mark" : "rule", seller: k && k.seller ? k.seller : t.seller,
      client_id: k && k.client_id ? k.client_id : t.client_id, lifecycle: basis === "retail" ? (t.lifecycle || (t.net > 0 ? "no_record" : null)) : null,
      marked: !!k, mark: k ? { basis: k.basis || null, seller: k.seller || null, client_id: k.client_id || null, note: k.note || null } : null });
  }) : [];
  const retail = tickets.filter((t) => t.basis === "retail"), sale = retail.filter((t) => t.net > 0);
  const net = retail.reduce((a, t) => a + t.net, 0), large = sale.filter((t) => t.net >= 10000 * fx);
  const life = JSON.parse(JSON.stringify(LIFE0));
  sale.forEach((t) => { life[t.lifecycle || "no_record"].tickets++; life[t.lifecycle || "no_record"].net += t.net; });
  const cur = PERIOD(net, net + (isOct ? 5000000 : 0), sale.length, retail.reduce((a, t) => a + t.units, 0), large.length, large.reduce((a, t) => a + t.net, 0), life);
  cur.net_usd = Math.round(net / fx * 100) / 100;
  const off = tickets.filter((t) => t.basis !== "retail");
  cur.excluded = { tickets: off.length, net: off.reduce((a, t) => a + t.net, 0) };
  const ly = isOct ? PERIOD(190000000, 190000000, 2, 2, 1, 150000000, LIFE0) : PERIOD(0, 0, 0, 0, 0, 0, LIFE0);
  const bridge = (t0, net0, label) => (t0 > 0 ? { from: net0, to: net, tickets: Math.round((sale.length - t0) * net0 / t0), mix: label === "ly" ? -110000000 : 15000000,
    size: net - net0 - Math.round((sale.length - t0) * net0 / t0) - (label === "ly" ? -110000000 : 15000000) } : null);
  const trend = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 - i, 1)), m = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
    const n = m === ym ? net : m === "2030-10" ? 190000000 : m === "2031-06" ? 20000000 : m === "2031-10" ? 210000000 : 0;
    const tk = m === ym ? sale.length : m === "2030-10" ? 2 : m === "2031-06" ? 1 : m === "2031-10" ? 4 : 0, im = inputs[m] || {};
    trend.push({ month: m + "-01", net: n, net_usd: Math.round(n / 12000 * 100) / 100, tickets: tk, atv: tk ? Math.round(n / tk) : null, upt: tk ? 1 : null, discount_pct: n ? 0.0233 : null,
      plan: im.plan_uzs || null, visits: im.visits || null, conversion: im.visits ? Math.round(tk / im.visits * 10000) / 10000 : null });
  }
  let incentive = null;
  if (ym >= "2031-10") {
    const storeAtt = inp.plan_uzs ? net / inp.plan_uzs : null;
    const guard = storeAtt === null ? 1 : (RULES.guardrail.filter((g) => storeAtt >= g.from).sort((a, b) => b.from - a.from)[0] || { factor: 1 }).factor;
    const names = [...new Set(retail.map((t) => t.seller).concat(inp.sellers.map((s) => s.seller)))];
    const sellers = names.map((name) => {
      const sm = inp.sellers.find((s) => s.seller === name) || {}, sNet = retail.filter((t) => t.seller === name).reduce((a, t) => a + t.net, 0);
      const att = sm.plan_uzs ? sNet / sm.plan_uzs : null, applies = sm.commission !== false;
      const rate = applies && att !== null ? (RULES.bands.filter((b) => att >= b.from).sort((a, b) => b.from - a.from)[0] || { rate: 0 }).rate : 0;
      const programmes = RULES.programmes.map((p) => {
        const auto = (AUTO[name] || {})[p.key] || 0, over = (sm.programme_counts || {})[p.key], count = over === undefined ? auto : over;
        return { key: p.key, label: p.label, label_ru: p.label_ru, pays: p.pays, max: p.max, auto, count, overridden: over !== undefined, paid_count: Math.min(count, p.max), amount: Math.min(count, p.max) * p.pays };
      });
      const before = programmes.reduce((a, p) => a + p.amount, 0), commission = Math.round(Math.max(sNet, 0) * rate * guard);
      return { seller: name, net: sNet, tickets: retail.filter((t) => t.seller === name && t.net > 0).length, plan: sm.plan_uzs === undefined ? null : sm.plan_uzs,
        attainment: att === null ? null : Math.round(att * 10000) / 10000, commission_applies: applies, rate, guardrail: guard, commission, programmes,
        programmes_before_cap: before, programmes_total: Math.min(before, RULES.person_cap), total: commission + Math.min(before, RULES.person_cap), paid: sm.paid_uzs === undefined ? null : sm.paid_uzs };
    }).sort((a, b) => b.net - a.net);
    const tc = sellers.reduce((a, s) => a + s.commission, 0), tp = sellers.reduce((a, s) => a + s.programmes_total, 0);
    const paid = inp.sellers.some((s) => s.paid_uzs !== null && s.paid_uzs !== undefined) ? inp.sellers.reduce((a, s) => a + (s.paid_uzs || 0), 0) : null;
    incentive = { scheme: { name: "Zz scheme", valid_from: "2031-10-01", rules: RULES }, store: { net, plan: inp.plan_uzs, attainment: storeAtt === null ? null : Math.round(storeAtt * 10000) / 10000, guardrail: guard },
      sellers, total: { commission: tc, programmes: tp, total: tc + tp, pct_of_sales: net > 0 ? Math.round((tc + tp) / net * 10000) / 10000 : null, paid } };
  }
  const by = {};
  off.forEach((t) => { by[t.basis] = by[t.basis] || { basis: t.basis, tickets: 0, net: 0 }; by[t.basis].tickets++; by[t.basis].net += t.net; });
  return { month: ym + "-01", store_id: 1, fx, large_from_uzs: 10000 * fx, inputs: JSON.parse(JSON.stringify(inp)), cur, ly,
    ytd: PERIOD(net + (isOct ? 20000000 : 0), net + 25000000, sale.length + (isOct ? 1 : 0), 5, large.length, 130000000, LIFE0), ytd_ly: PERIOD(200000000, 200000000, 3, 3, 1, 150000000, LIFE0),
    plan: inp.plan_uzs ? { plan: inp.plan_uzs, attainment: Math.round(net / inp.plan_uzs * 10000) / 10000, gap: net - inp.plan_uzs } : null,
    funnel: { visits: inp.visits, visits_appointment: inp.visits_appointment, conversion: inp.visits ? Math.round(sale.length / inp.visits * 10000) / 10000 : null },
    trend, bridge: { ly: bridge(ly.tickets, ly.net, "ly"), plan: inp.plan_uzs && inp.plan_tickets ? bridge(inp.plan_tickets, inp.plan_uzs, "plan") : null },
    excluded: Object.values(by).sort((a, b) => (a.basis < b.basis ? -1 : 1)), tickets, incentive };
}
// The year: 2031 has June (20m) and October (the scenario); 2030 has October (190m).
function yearDoc(y) {
  const months = [];
  let net = 0, tickets = 0, lyNet = 0, lyTk = 0, planTd = 0, planNet = 0, anyPlan = false;
  const through = y === 2031 ? 10 : y === 2030 ? 10 : 12;
  for (let i = 1; i <= 12; i++) {
    const ym = y + "-" + String(i).padStart(2, "0"), d = monthDoc(ym), prev = (y - 1) + "-" + String(i).padStart(2, "0");
    const june = ym === "2031-06", n = june ? 20000000 : d.cur.net, tk = june ? 1 : d.cur.tickets;
    const ln = prev === "2030-10" ? 190000000 : prev === "2031-06" ? 20000000 : 0, lt = prev === "2030-10" ? 2 : prev === "2031-06" ? 1 : 0;
    const im = inputs[ym] || {}, inP = i <= through;
    months.push({ month: ym + "-01", in_period: inP, net: n, tickets: tk, units: tk, atv: tk ? Math.round(n / tk) : null, upt: tk ? 1 : null, discount_pct: n ? 0.0233 : null,
      large_net: june ? 0 : d.cur.large.net, large_tickets: june ? 0 : d.cur.large.tickets, base_net: june ? n : d.cur.base.net,
      ly_net: ln, ly_tickets: lt, ly_atv: lt ? Math.round(ln / lt) : null, plan: im.plan_uzs || null, visits: im.visits || null, conversion: im.visits ? Math.round(tk / im.visits * 10000) / 10000 : null });
    if (inP) { net += n; tickets += tk; lyNet += ln; lyTk += lt; if (im.plan_uzs) { planTd += im.plan_uzs; planNet += n; anyPlan = true; } }
  }
  const P = (n, t) => Object.assign(PERIOD(n, n, t, t, 0, 0, LIFE0), { large: { tickets: n >= 130000000 ? 1 : 0, net: n >= 130000000 ? 130000000 : 0 } });
  const tkPart = lyTk ? Math.round((tickets - lyTk) * lyNet / lyTk) : 0;
  return { year: y, store_id: 1, through: y + "-" + String(through).padStart(2, "0") + "-01", complete: through === 12, months, cur: P(net, tickets), ly: P(lyNet, lyTk), ly_full: P(lyNet, lyTk),
    plan: { to_date: anyPlan ? planTd : null, full: anyPlan ? planTd : null, net_planned_months: anyPlan ? planNet : null, attainment: anyPlan ? Math.round(planNet / planTd * 10000) / 10000 : null },
    bridge: { ly: lyTk ? { from: lyNet, to: net, tickets: tkPart, mix: 0, size: net - lyNet - tkPart } : null } };
}
// Brands: October 2031 (or the year 2031) has three brands sold; arrivals are loaded for 2030 and 2031.
function brandsDoc(body) {
  const isYear = typeof body.year === "number", ym = isYear ? null : monthIn(body.month), y = isYear ? body.year : Number(ym.slice(0, 4));
  const on = isYear ? y === 2031 : ym === "2031-10", net = on ? monthDoc("2031-10").cur.net : 0;
  const B = (brand, n, ly, units, stock, value, arr) => ({ brand, net: n, share: net ? Math.round(n / net * 10000) / 10000 : null, discount_pct: n ? 0.02 : null, units, tickets: units,
    asp: units ? Math.round(n / units) : null, ly_net: ly, ly_units: ly ? 1 : 0, stock_units: stock, stock_value: value,
    arr_units: arr ? arr[0] : null, arr_rrp_usd: arr ? arr[1] : null, arr_sold_units: arr ? arr[2] : null, arr_left_units: arr ? arr[3] : null });
  // arrivals fall in October 2031 (and in 2030 for the year view): a month other than those has none
  const a31 = isYear ? y === 2031 : ym === "2031-10", a30 = isYear && y === 2030;
  const brands = on ? [B("Zz Other", net - 60000000, 0, 3, 4, 96000000, a31 ? [6, 48000, 2, 4] : null), B("Zz Brand", 40000000, 190000000, 1, 10, 240000000, a31 ? [12, 120000, 2, 10] : null),
    B("Zz Focus", 20000000, 0, 1, 2, 60000000, null), B("Zz Sleeping House", 0, 0, 0, 5, 300000000, null)]
    : [B("Zz Brand", 0, 0, 0, 10, 240000000, a30 ? [3, 30000, 3, 0] : a31 ? [12, 120000, 2, 10] : null), B("Zz Other", 0, 0, 0, 4, 96000000, a31 ? [6, 48000, 2, 4] : null),
      B("Zz Focus", 0, 0, 0, 2, 60000000, null), B("Zz Sleeping House", 0, 0, 0, 5, 300000000, null)];
  const au = brands.reduce((s2, b) => s2 + (b.arr_units || 0), 0), av = brands.reduce((s2, b) => s2 + (b.arr_rrp_usd || 0), 0);
  return { from: isYear ? y + "-01-01" : ym + "-01", to: "x", through: isYear ? (y === 2031 ? "2031-10-01" : y + "-12-01") : ym + "-01",
    total: { net, units: on ? 5 : 0, ly_net: on ? 190000000 : 0, stock_units: 21, stock_value: 696000000, incoming_units: 2, arr_units: au, arr_rrp_usd: av },
    brands, arrival_years: [{ year: 2030, units: 3, rrp_usd: 30000, sold_units: 3, left_units: 0 }, { year: 2031, units: 18, rrp_usd: 168000, sold_units: 4, left_units: 14 }],
    arrival_months: Array.from({ length: 12 }, (_, i) => { const m = y + "-" + String(i + 1).padStart(2, "0"), hit = m === "2031-10" ? [18, 168000, 4, 14] : m === "2030-05" ? [3, 30000, 3, 0] : [0, 0, 0, 0];
      return { month: m + "-01", units: hit[0], rrp_usd: hit[1], sold_units: hit[2], left_units: hit[3] }; }),
    on_hand_by_arrival: { unknown: 3, years: [{ year: 2030, units: 4 }, { year: 2031, units: 14 }] } };
}
const count = (v, f, max) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max) fail(400, `${f} must be a whole number, zero or more.`);
  return v;
};
function handle(body) {
  calls.push(JSON.parse(JSON.stringify(body)));
  try {
    const action = body.action;
    if (failNext && failNext === action) { failNext = null; return [500, { error: "Something went wrong on the server." }]; }
    if (action === "health") return [200, { ok: true }];
    if (action === "unlock") {
      const u = PASSCODES[body.passcode];
      if (!u) fail(401, "That passcode is not right.");
      if (!u.perf) fail(403, "This account does not have access to Performance.");
      const token = "tok-" + Math.random().toString(16).slice(2).padEnd(28, "0");
      sessions.set(token, { name: u.name });
      return [200, { token, name: u.name, expires_at: new Date(Date.now() + 8 * 3600000).toISOString() }];
    }
    const s = session(body.token);
    if (action === "ping") return [200, { ok: true, name: s.name }];
    if (action === "span") return [200, { first: "2030-10-01", last: "2031-10-01" }];
    if (action === "month") return [200, monthDoc(monthIn(body.month))];
    if (action === "year") {
      if (typeof body.year !== "number") fail(400, "year must be a year, as a number.");
      return [200, yearDoc(body.year)];
    }
    if (action === "brands") return [200, brandsDoc(body)];
    if (action === "save_month") {
      const ym = monthIn(body.month), i = body.inputs;
      if (!i || typeof i !== "object" || Array.isArray(i)) fail(400, "inputs must be an object.");
      const n = { plan_uzs: count(i.plan_uzs, "plan_uzs", 1e15), plan_tickets: count(i.plan_tickets, "plan_tickets", 1e5), plan_large_tickets: count(i.plan_large_tickets, "plan_large_tickets", 1e5),
        plan_large_uzs: count(i.plan_large_uzs, "plan_large_uzs", 1e15), visits: count(i.visits, "visits", 1e6), visits_appointment: count(i.visits_appointment, "visits_appointment", 1e6) };
      if (i.fx !== null && i.fx !== undefined && (typeof i.fx !== "number" || !(i.fx > 0))) fail(400, "fx must be a number above zero.");
      if ((n.plan_large_tickets || 0) > (n.plan_tickets || 0)) fail(409, "Planned large tickets cannot be more than planned tickets.");
      if ((n.plan_large_uzs || 0) > (n.plan_uzs || 0)) fail(409, "The planned value of large tickets cannot be more than the plan.");
      if ((n.visits_appointment || 0) > (n.visits || 0)) fail(409, "Appointments cannot be more than visits.");
      inputs[ym] = Object.assign(n, { fx: i.fx || null, note: (i.note || "").trim() || null, updated_by: s.name, updated_at: new Date().toISOString(),
        sellers: (i.sellers || []).filter((x) => x && String(x.seller || "").trim()).map((x) => ({ seller: String(x.seller).trim(), plan_uzs: count(x.plan_uzs, "plan_uzs", 1e15),
          commission: x.commission !== false, programme_counts: Object.assign({}, x.programme_counts || {}), paid_uzs: count(x.paid_uzs, "paid_uzs", 1e15) })).sort((a, b) => (a.seller < b.seller ? -1 : 1)) });
      return [200, monthDoc(ym)];
    }
    if (action === "mark_ticket") {
      const ym = monthIn(body.month), t = TICKETS.find((x) => x.ticket_id === body.ticket_id), m = body.mark || {};
      if (!t) fail(409, "No ticket with that reference.");
      if (m.basis && !["retail", "founder", "trade", "staff", "cost_transfer", "other"].includes(m.basis)) fail(409, "That is not a basis.");
      if (m.client_id && !/^DLD-91\d\d$/i.test(m.client_id)) fail(409, "No client with that reference.");
      if (!m.basis && !m.seller && !m.client_id) delete marks[t.ticket_id];
      else marks[t.ticket_id] = { basis: m.basis || null, seller: m.seller || null, client_id: m.client_id ? m.client_id.toUpperCase() : null, note: m.note || null };
      return [200, monthDoc(ym)];
    }
    fail(400, `Unknown action: ${action}`);
  } catch (e) {
    if (e instanceof Fail) return [e.status, { error: e.message }];
    throw e;
  }
}
reset();
module.exports = { handle, reset, delay, get calls() { return calls; }, get failNext() { return failNext; }, set failNext(v) { failNext = v; },
  get inputs() { return inputs; }, get marks() { return marks; }, expire() { expired = true; } };
