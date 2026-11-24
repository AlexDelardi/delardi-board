// Run with Node. Checks ui/kit.css (and the <style> of kit pages) against the palette rules. No packages.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const KIT_PAGES = ['sales/index.html', 'stock/index.html'];
const PALETTE = ['082966', '001A4A', '5B6478', '8FA8CC', 'D3DCE9', 'EEF1F7', 'FFFFFF', '8C2F2F'];
const CHANNELS = ['0,26,74', '8,41,102', '91,100,120', '143,168,204', '211,220,233', '238,241,247', '255,255,255', '140,47,47'];
let checks = 0;
function ok(cond, label) {
  if (!cond) { console.error('FAIL: ' + label); process.exit(1); }
  checks++;
}
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));
function clean(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, 'url()');
}
function checkCss(css, name) {
  const c = clean(css);
  for (const [, h] of c.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    ok(PALETTE.includes(full.toUpperCase()), name + ' hex in palette: #' + h);
  }
  for (const [, args] of c.matchAll(/rgba?\(([^)]*)\)/g)) {
    const parts = args.split(',').map(s => s.trim());
    ok(CHANNELS.includes(parts.slice(0, 3).join(',')), name + ' rgb channels in palette: ' + args);
  }
  for (const [, v] of c.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g)) {
    ok(v.trim().split(/\s+/).every(x => /^0(px)?$/.test(x)), name + ' border-radius is 0: ' + v.trim());
  }
  for (const [, v] of c.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
    ok(/^none\b/.test(v.trim()), name + ' box-shadow none: ' + v.trim());
  }
  for (const bad of ['prefers-color-scheme', 'data-theme', 'sysdark']) ok(!c.includes(bad), name + ' has no ' + bad);
}
ok(exists('ui/kit.css'), 'ui/kit.css exists');
const kit = read('ui/kit.css');
checkCss(kit, 'ui/kit.css');
const kc = clean(kit);
for (const v of ['navy', 'navy-deep', 'slate', 'sky', 'mist', 'card', 'white', 'alert', 'sans', 'serif', 'tap', 'radius']) {
  ok(new RegExp('--' + v + '\\s*:').test(kc), 'custom property --' + v);
}
const sansStack = (kc.match(/--sans\s*:\s*([^;]+);/) || [])[1] || '';
ok(!/Century Gothic/i.test(sansStack), '--sans has no Century Gothic (renders wide on Windows PCs)');
ok(/^"Evolventa"/.test(sansStack.trim()) && /Segoe UI/.test(sansStack) && /-apple-system/.test(sansStack), '--sans: Evolventa, then Segoe UI / system fonts');
const literal = { page: 'FFFFFF', surface: 'FFFFFF', 'surface-2': 'EEF1F7', ink: '001A4A', 'ink-2': '5B6478', muted: '5B6478', line: 'D3DCE9', grid: 'D3DCE9', border: 'D3DCE9', focus: '082966', critical: '8C2F2F' };
for (const [k, hex] of Object.entries(literal)) {
  const m = kc.match(new RegExp('--' + k + '\\s*:\\s*#([0-9a-fA-F]{6})'));
  ok(m && m[1].toUpperCase() === hex, '--' + k + ' literal #' + hex);
}
ok(/--radius\s*:\s*0\s*[;}]/.test(kc), '--radius is 0');
ok(/:focus-visible\s*{[^}]*outline:\s*2px solid #082966[^}]*outline-offset:\s*2px/i.test(kc), ':focus-visible rule');
for (const [, rule] of kc.matchAll(/(?:^|[}\s,])body\s*{([^}]*)}/g)) {
  for (const [, v] of rule.matchAll(/background(?:-color)?\s*:\s*([^;]+)/g)) ok(/^(#FFFFFF|var\(--(white|page)\))$/i.test(v.trim()), 'body background is white only: ' + v.trim());
}
const classes = ['kit-head', 'kit-brand', 'kit-rule', 'kit-tool', 'kit-spacer', 'kit-hbtn', 'kit-lang', 'kit-menu', 'kit-tabs', 'kit-tab',
  'btn', 'primary', 'quiet', 'danger', 'big', 'lbl', 'title', 'h2', 'item', 'keynum', 'small', 'tbl', 'r',
  'tag', 'act', 'info', 'done', 'line', 'alert', 'band', 'panel-wrap', 'panel-scrim', 'panel',
  'modal-wrap', 'modal-scrim', 'modal', 'confirm', 'toast', 'err', 'gate', 'gate-card', 'gate-mast', 'notice', 'sr-only'];
for (const cl of classes) ok(new RegExp('\\.' + cl.replace('-', '\\-') + '(?![\\w-])').test(kc), 'class .' + cl);
const rule = sel => { const m = kc.match(new RegExp('(?:^|})\\s*' + sel.replace(/[.\\[\\]]/g, '\\$&') + '\\s*{([^}]*)}')); return m ? m[1] : ''; };
ok(/font:\s*normal 17px\/1\.35 var\(--serif\)/.test(rule('.item')), '.item is serif 17/1.35 normal weight');
ok(/height:\s*18px/.test(kc.match(/\.kit-brand img[^{]*{([^}]*)}/)[1]), 'header wordmark is 18px high (vector wordmark, no tagline)');
ok(/min-height:\s*48px/.test(rule('.kit-tab')) && /gap:\s*28px/.test(rule('.kit-tabs')), 'tabs 48px high, 28px gap');
ok(/color:\s*var\(--white\)/.test(rule('.kit-staff')) && /font:\s*14px/.test(rule('.kit-staff')), '.kit-staff white 14px');
ok(/font:\s*13px\/1\.45/.test(rule('.band')), '.band text is 13px');
ok(/height:\s*48px/.test(rule('.tbl tbody tr')), 'table rows are 48px high (.tbl tbody tr)');
ok(/text-overflow:\s*ellipsis/.test(rule('.kit-staff')) && /max-width/.test(rule('.kit-staff')), '.kit-staff truncates with an ellipsis');
const z = sel => Number((rule(sel).match(/z-index:\s*(\d+)/) || [])[1]);
ok(/position:\s*fixed/.test(rule('.gate')), '.gate is position: fixed, so its z-index applies');
ok(z('.gate') > z('.panel-wrap') && z('.gate') > z('.modal-wrap') && z('.gate') < z('.toast'), '.gate stacks above panels and modals, below the toast');
ok(/\[aria-current=["']?page["']?\]/.test(kc), 'aria-current page style');
ok(/\[aria-invalid=["']?true["']?\]/.test(kc), 'aria-invalid style');
ok(exists('ui/tools.js'), 'ui/tools.js exists');
// tools.js in a minimal sandbox
const sandbox = { document: { createElement: () => ({}), addEventListener() {}, removeEventListener() {} } };
vm.createContext(sandbox);
vm.runInContext(read('ui/tools.js') + '\n;this.__T = typeof KIT_TOOLS !== "undefined" ? KIT_TOOLS : null; this.__F = typeof kitToolsMenu; this.__C = typeof kitCloseMenus; this.__G = typeof kitGuardLink;', sandbox);
ok(Array.isArray(sandbox.__T) && sandbox.__T.length === 6, 'KIT_TOOLS has 6 entries');
ok(sandbox.__T.map(t => t.id).join() === 'sales,stock,crm,catalogue,tasks,perf', 'KIT_TOOLS ids: the retired Board is not offered');
ok(sandbox.__T.every(t => t.href && t.en && t.ru), 'KIT_TOOLS fields');
ok(sandbox.__F === 'function', 'kitToolsMenu is a function');
ok(sandbox.__C === 'function', 'kitCloseMenus is a function');
ok(sandbox.__G === 'function', 'kitGuardLink is a function');
if (!process.env.KIT_ONLY) {
  for (const page of KIT_PAGES) {
    ok(exists(page), page + ' exists');
    for (const [, css] of read(page).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) checkCss(css, page);
  }
}
console.log(checks + ' kit checks passed');
