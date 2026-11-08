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
const source = read('catalogue/src/app.js');
const header = source.slice(source.indexOf('function renderHeader()'), source.indexOf('function langSwitch()'));
const context = vm.createContext({
  S:{hide:false,locked:false}, LOGO_WORDMARK:'synthetic-logo', ICON:{eye:'eye',lock:'lock'},
  tr:x=>x, svg:x=>x, clientButton:()=>null, langSwitch:()=>null,
  el:(tag, attrs, children)=>({tag,attrs,children})
});
vm.runInContext(header + ';globalThis.result = renderHeader();', context);
const nodes=[];
function walk(node) { if (!node || typeof node !== 'object') return; nodes.push(node); (node.children||[]).forEach(walk); }
walk(context.result);
ok(nodes.some(n=>n.attrs?.class==='brand' && n.attrs.href==='../'), 'Catalogue logo opens hub');
ok(nodes.some(n=>n.tag==='a' && n.attrs?.href==='#/' && n.attrs.text==='Catalogue home'), 'Separate Catalogue home action');
ok(nodes.some(n=>n.tag==='a' && n.attrs?.text==='All tools' && !n.attrs.class.includes('hide-phone')), 'Hub action remains visible on phone');
const catalogue = read('catalogue/index.html');
const gold = catalogue.match(/--gold:\s*#([0-9a-f]{6})/i)[1];
ok(ratio(gold,'FFFFFF')>=4.5, 'Gold label contrast');
ok(source.includes('closeSheet(true, h); }, text: tr("Apply filters")'), 'Staged filters have explicit apply label');
console.log(checks + ' UI foundation checks passed (syntax, contrast and header behaviour).');
