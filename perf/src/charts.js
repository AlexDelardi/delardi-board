/* Delardi Performance — charts.js
   Two small chart builders used by the Year and Brands screens. Same rules as the month's trend chart: one axis
   from zero, marks in the house navy, last year as an outline beside it, text in ink colours, a tooltip on hover and
   on keyboard focus, and the same figures in a table under every chart. */
Object.assign(RU, {
  "This year": "Этот год", "Last year": "Прошлый год", "Plan (cumulative)": "План (накопительно)",
});
function svgNode(tag, attrs, kids) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, v);
  (kids || []).forEach((k) => k && n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
  return n;
}
function chartTip(ev, lines) {
  let n = $(".chart-tip");
  if (!n) { n = el("div", { class: "chart-tip", role: "status" }); document.body.appendChild(n); }
  n.innerHTML = "";
  lines.forEach((t, i) => n.append(el(i ? "span" : "strong", { text: t })));
  const r = ev.currentTarget.getBoundingClientRect();
  n.style.left = Math.max(8, Math.min(window.scrollX + r.left + r.width / 2 - 100, window.scrollX + document.documentElement.clientWidth - 208)) + "px";
  n.style.top = (window.scrollY + r.top - 8) + "px";
}
function chartTipHide() { const n = $(".chart-tip"); if (n) n.remove(); }
function chartLegend(items) {
  return el("p", { class: "chart-legend small" }, items.map(([cls, label]) => el("span", { class: "lg" }, el("span", { class: "lg-key " + cls, "aria-hidden": "true" }), label)));
}
/* barChart({ id, title, rows: [{ key, label, v, v2, off, tip: [lines] }], legend: [this, other] })
   v is the filled bar; v2, when given, is the outlined bar beside it (last year). off greys a bar out (a month not
   yet in the period). */
function barChart(o) {
  const W = chartW(o.width || 960), H = isPhone() ? 200 : o.height || 240, L = 8, R = 8, T = 14, B = 30, two = o.rows.some((r) => r.v2 !== undefined && r.v2 !== null);
  const max = Math.max(1, ...o.rows.map((r) => Math.max(Number(r.v) || 0, Number(r.v2) || 0)));
  const step = (W - L - R) / Math.max(1, o.rows.length), bw = Math.min(two ? 22 : 40, step * (two ? 0.34 : 0.6));   // a half-width chart is drawn on a half-width canvas, so its labels keep their size
  const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const wrap = el("div", { class: "chart", id: o.id });
  const svg = svgNode("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": o.title, preserveAspectRatio: "xMidYMid meet" },
    [svgNode("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "axis" })].concat(o.rows.map((r, i) => {
      const cx = L + step * i + step / 2, v = Number(r.v) || 0, v2 = Number(r.v2) || 0;
      const x1 = two ? cx - bw - 1 : cx - bw / 2;
      const g = svgNode("g", { class: "bar" + (r.off ? " off" : ""), tabindex: "0", "data-key": r.key }, [
        svgNode("rect", { x: cx - step / 2, y: T, width: step, height: H - T - B, class: "hit" }),
        two && v2 > 0 ? svgNode("rect", { x: cx + 1, y: y(v2), width: bw, height: Math.max(1, H - B - y(v2)), class: "mark2" }) : null,
        v > 0 ? svgNode("rect", { x: x1, y: y(v), width: bw, height: Math.max(1, H - B - y(v)), class: "mark" }) : null,
        svgNode("text", { x: cx, y: H - 10, class: "tick", "text-anchor": "middle" }, [r.label]),
      ]);
      g.addEventListener("mouseenter", (ev) => chartTip(ev, r.tip)); g.addEventListener("focus", (ev) => chartTip(ev, r.tip));
      g.addEventListener("mouseleave", chartTipHide); g.addEventListener("blur", chartTipHide);
      return g;
    })));
  wrap.append(...[el("p", { class: "chart-title small", text: o.title }), svg, two && o.legend ? chartLegend([["k-mark", o.legend[0]], ["k-mark2", o.legend[1]]]) : null].filter(Boolean));   // a one-series chart has no key
  return wrap;
}
/* lineChart({ id, title, labels: [..], series: [{ cls, name, values: [number|null] }], tip: (i) => [lines] })
   Up to three lines over the same points; a null ends a line (months not reached yet). */
function lineChart(o) {
  const W = chartW(960), H = isPhone() ? 200 : 260, L = 8, R = 8, T = 14, B = 30, n = o.labels.length;
  const max = Math.max(1, ...o.series.flatMap((s) => s.values.map((v) => Number(v) || 0)));
  const step = (W - L - R) / Math.max(1, n), x = (i) => L + step * i + step / 2, y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const wrap = el("div", { class: "chart", id: o.id });
  const kids = [svgNode("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "axis" })];
  for (const s of o.series) {
    const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [x(i), y(Number(v))])).filter(Boolean);
    if (pts.length > 1) kids.push(svgNode("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "line " + s.cls, fill: "none" }));
    if (pts.length) { const p = pts[pts.length - 1]; kids.push(svgNode("circle", { cx: p[0], cy: p[1], r: 4, class: "dot " + s.cls })); }
  }
  o.labels.forEach((lab, i) => {
    const g = svgNode("g", { class: "bar", tabindex: "0", "data-key": String(i) }, [
      svgNode("rect", { x: x(i) - step / 2, y: T, width: step, height: H - T - B, class: "hit" }),
      svgNode("text", { x: x(i), y: H - 10, class: "tick", "text-anchor": "middle" }, [lab]),
    ]);
    g.addEventListener("mouseenter", (ev) => chartTip(ev, o.tip(i))); g.addEventListener("focus", (ev) => chartTip(ev, o.tip(i)));
    g.addEventListener("mouseleave", chartTipHide); g.addEventListener("blur", chartTipHide);
    kids.push(g);
  });
  wrap.append(el("p", { class: "chart-title small", text: o.title }), svgNode("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": o.title, preserveAspectRatio: "xMidYMid meet" }, kids),
    chartLegend(o.series.map((s) => ["k-line " + s.cls, s.name])));
  return wrap;
}
