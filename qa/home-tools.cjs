// The home page lists every tool the shared menu (ui/tools.js KIT_TOOLS) lists, in both languages.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kit = fs.readFileSync(path.join(root, 'ui/tools.js'), 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ids = [...kit.matchAll(/\{ id: '([a-z]+)', href: '\.\.\/\1\/'/g)].map((m) => m[1]);
ok(ids.length === 7, 'read the tools from KIT_TOOLS: ' + ids.join(','));
for (const id of ids) ok(home.includes('href="' + id + '/" data-tool="' + id + '"'), 'Home page has a ' + id + ' tile');
ok(home.includes('data-session="stock_session"'), 'Home page shows the Stock session status');
ok((home.match(/stock_name:/g) || []).length === 2 && (home.match(/stock_desc:/g) || []).length === 2, 'Stock tile text in English and Russian');
ok(home.includes('data-session="perf_session"'), 'Home page shows the Performance session status');
ok((home.match(/perf_name:/g) || []).length === 2 && (home.match(/perf_desc:/g) || []).length === 2, 'Performance tile text in English and Russian');
ok(home.includes('data-session="tasks_session"'), 'Home page shows the task tracker session status');
ok((home.match(/tasks_name:/g) || []).length === 2 && (home.match(/tasks_desc:/g) || []).length === 2, 'Task tracker tile text in English and Russian');
// every tool carries the shared switcher, so any tool is one tap from any other
for (const id of ids) {
  const page = fs.readFileSync(path.join(root, id, 'index.html'), 'utf8');
  ok(page.includes('function kitToolsMenu(') && new RegExp('kitToolsMenu\\(["\']' + id + '["\']').test(page), id + ' has the tool switcher in its header');
  for (const other of ids) ok(page.includes("{ id: '" + other + "', href: '../" + other + "/'"), id + ' lists ' + other);
}
// the Board is one hand-kept file: its copy of ui/tools.js must be the file itself
const board = fs.readFileSync(path.join(root, 'board/index.html'), 'utf8');
ok(board.includes(kit.trimEnd()), 'the Board carries ui/tools.js unchanged');
// the Christmas season: every tool and the hub carry ui/season.js with its images in place
for (const id of ids.concat([''])) {
  const page = fs.readFileSync(path.join(root, id, 'index.html'), 'utf8');
  ok(page.includes('function seasonDress()') && page.includes('function seasonFor(d)') && !page.includes('__XMAS_'), (id || 'the hub') + ' carries the season with its images');
}
ok(home.includes('<body class="hub">'), 'the hub is marked for the tree');
console.log(n + ' home page checks passed.');
