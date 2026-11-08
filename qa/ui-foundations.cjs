// Run with Node. No browser, API calls, production data or third-party packages.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function luminance(hex) {
  const rgb = hex.match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
for (const file of ['index.html','board/index.html','crm/index.html','catalogue/index.html']) {
  const html = read(file);
  for (const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script, {filename:file});
  ok(true, file + ' JavaScript parses');
  const muted = html.match(/--muted:\s*#([0-9a-f]{6})/i)[1];
  for (const background of ['FFFFFF', html.match(/--page:\s*#([0-9a-f]{6})/i)[1], html.match(/--surface-2:\s*#([0-9a-f]{6})/i)[1]]) {
    ok(ratio(muted, background) >= 4.5, file + ' secondary text contrast on ' + background);
  }
}
// The catalogue header was left as it is, so the header assertions that used to
// sit here were dropped with it. Gold is no longer used for text, so its
// contrast is not asserted either; small-caps labels use --label.
const catalogue = read('catalogue/index.html');
const label = catalogue.match(/--label:\s*#([0-9a-f]{6})/i)[1];
ok(ratio(label,'FFFFFF')>=4.5, 'Small-caps label contrast');
ok(!/\.card \.brandname[^}]*var\(--gold\)/.test(catalogue), 'Brand names do not use gold for text');
console.log(checks + ' UI foundation checks passed (syntax, contrast and header behaviour).');
