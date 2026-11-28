// The home page lists every tool the shared menu (ui/tools.js KIT_TOOLS) lists, in both languages.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kit = fs.readFileSync(path.join(root, 'ui/tools.js'), 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ids = [...kit.matchAll(/\{ id: '([a-z]+)', href: '\.\.\/\1\/'/g)].map((m) => m[1]);
ok(ids.length === 6, 'read the tools from KIT_TOOLS: ' + ids.join(','));
for (const id of ids) ok(home.includes('href="' + id + '/" data-tool="' + id + '"'), 'Home page has a ' + id + ' tile');
ok((home.match(/stock_name:/g) || []).length === 2 && (home.match(/stock_desc:/g) || []).length === 2, 'Stock tile text in English and Russian');
ok((home.match(/perf_name:/g) || []).length === 2 && (home.match(/perf_desc:/g) || []).length === 2, 'Performance tile text in English and Russian');
ok((home.match(/tasks_name:/g) || []).length === 2 && (home.match(/tasks_desc:/g) || []).length === 2, 'Task tracker tile text in English and Russian');
// the cards: same order and same names as the Tools menu, one line each, and an illustration in place of the icon
const order = [...home.matchAll(/<a class="tool" href="([a-z]+)\/" data-tool="\1">/g)].map((m) => m[1]);
ok(order.join() === ids.join(), 'the cards are in the Tools menu order: ' + order.join());
const names = [...kit.matchAll(/\{ id: '([a-z]+)', href: '[^']+', en: '([^']+)', ru: '([^']+)' \}/g)].map((m) => ({ id: m[1], en: m[2], ru: m[3] }));
const key = { crm: 'crm', catalogue: 'cat', sales: 'sales', stock: 'stock', tasks: 'tasks', perf: 'perf' };
const DESC = {
  sales: 'Sell a piece, take payment, print the receipt, find any ticket.',
  stock: 'Every piece and where it is: in stock, reserved, out or in transit.',
  crm: 'Every client, who looks after them, and who to contact next.',
  catalogue: 'Find any piece, show it to the client, send a selection.',
  tasks: 'Who does what by when, for the boutique and the back office.',
  perf: 'The month against plan and last year, and what explains the gap.',
};
for (const t of names) {
  const k = key[t.id];
  ok(home.includes(k + '_name: "' + t.en + '"') && home.includes(k + '_name: "' + t.ru + '"'), t.id + ' card is named as in the Tools menu, in both languages');
  ok(home.includes('data-i18n="' + k + '_name">' + t.en + '<'), t.id + ' card shows that name before any script runs');
  ok(home.includes(k + '_desc: "' + DESC[t.id] + '"') && home.includes('data-i18n="' + k + '_desc">' + DESC[t.id] + '<') && (home.match(new RegExp(k + '_desc:', 'g')) || []).length === 2, t.id + ' card has its one-line description, in both languages');
  ok(home.includes('<img class="tool-art" src="ui/cards/' + t.id + '.webp" alt="" width="900" height="360"'), t.id + ' card has its illustration, sized so the page does not jump');
  ok(fs.existsSync(path.join(root, 'ui/cards', t.id + '.webp')) && fs.statSync(path.join(root, 'ui/cards', t.id + '.webp')).size < 40000, t.id + ' illustration file is there and light');
}
ok(!home.includes('class="tool-icon"'), 'the small icons are gone from the cards');
ok(home.includes("default-src 'none'; connect-src https://hugduzqwyqwryicfzipu.supabase.co; img-src data: 'self';"), 'the page may load pictures from its own site and ask the sign-in API, and nothing else');
ok(!home.includes('data-session='), 'the cards no longer read each tool\'s own session');
ok(/<nav class="tools" id="tools"[^>]* hidden>/.test(home) && /<form class="signin" id="signin"[^>]* hidden>/.test(home), 'nothing but the header shows before the script decides: the cards and the sign-in card start hidden');
ok(home.includes('<a class="tool" href="access/" data-tool="access" hidden>') && fs.existsSync(path.join(root, 'ui/cards/access.svg')), 'the Access card is there, hidden unless the person manages access');
// the single sign-in (ui/hub.js) is carried by the home page and by every tool, the same text everywhere
const hub = fs.readFileSync(path.join(root, 'ui/hub.js'), 'utf8').trim();
for (const id of ['', ...ids, 'access']) ok(fs.readFileSync(path.join(root, id, 'index.html'), 'utf8').includes(hub), (id || 'home page') + ' carries ui/hub.js as it is in the repository');
for (const id of [...ids, 'access']) ok(fs.readFileSync(path.join(root, id, 'index.html'), 'utf8').includes('kitHubGate("' + id + '")') && fs.readFileSync(path.join(root, id, 'index.html'), 'utf8').includes('kitHubAdopt("' + id + '"'), id + ' hands its sign-in to the home page');
// every tool carries the shared switcher, so any tool is one tap from any other
for (const id of ids) {
  const page = fs.readFileSync(path.join(root, id, 'index.html'), 'utf8');
  ok(page.includes('function kitToolsMenu(') && new RegExp('kitToolsMenu\\(["\']' + id + '["\']').test(page), id + ' has the tool switcher in its header');
  for (const other of ids) ok(page.includes("{ id: '" + other + "', href: '../" + other + "/'"), id + ' lists ' + other);
}
// the Weekly Board is retired: its address sends people to the home page's sign-in and on to Tasks; it has no passcode
// card and talks to no server of its own
const board = fs.readFileSync(path.join(root, 'board/index.html'), 'utf8');
ok(/location\.replace\("\.\.\/\?next=tasks"\)/.test(board) && /http-equiv="refresh" content="0; url=\.\.\/\?next=tasks"/.test(board), 'the Board address goes to the home page and on to Tasks');
ok(!/board-api|passcode|type="password"/i.test(board), 'the Board page has no passcode card and calls no server');
ok(!ids.includes('board'), 'the tool menu does not offer the Board');
ok(!/data-tool="board"|href="board\/"|board_name|board_desc|board_session/.test(home), 'the home page has no Weekly Board tile');
// the Christmas season: every tool and the hub carry ui/season.js with its images in place
for (const id of ids.concat([''])) {
  const page = fs.readFileSync(path.join(root, id, 'index.html'), 'utf8');
  ok(page.includes('function seasonDress()') && page.includes('function seasonFor(d)') && !page.includes('__XMAS_'), (id || 'the hub') + ' carries the season with its images');
}
ok(home.includes('<body class="hub">'), 'the hub is marked for the tree');
console.log(n + ' home page checks passed.');
