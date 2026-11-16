// The home page lists every tool the shared menu (ui/tools.js KIT_TOOLS) lists, in both languages.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kit = fs.readFileSync(path.join(root, 'ui/tools.js'), 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ids = [...kit.matchAll(/\{ id: '([a-z]+)', href: '\.\.\/\1\/'/g)].map((m) => m[1]);
ok(ids.length === 5, 'read the tools from KIT_TOOLS: ' + ids.join(','));
for (const id of ids) ok(home.includes('href="' + id + '/" data-tool="' + id + '"'), 'Home page has a ' + id + ' tile');
ok(home.includes('data-session="stock_session"'), 'Home page shows the Stock session status');
ok((home.match(/stock_name:/g) || []).length === 2 && (home.match(/stock_desc:/g) || []).length === 2, 'Stock tile text in English and Russian');
console.log(n + ' home page checks passed.');
