// Delardi UI kit: tool switcher. No dependencies. Inlined ahead of each tool's own modules.
const KIT_TOOLS = [
  { id: 'sales', href: '../sales/', en: 'Sales', ru: 'Продажи' },
  { id: 'stock', href: '../stock/', en: 'Stock', ru: 'Склад' },
  { id: 'crm', href: '../crm/', en: 'Clients', ru: 'Клиенты' },
  { id: 'catalogue', href: '../catalogue/', en: 'Catalogue', ru: 'Каталог' },
  { id: 'tasks', href: '../tasks/', en: 'Tasks', ru: 'Задачи' },
  { id: 'perf', href: '../perf/', en: 'Performance', ru: 'Показатели' },
];

// Close functions of the menus that are open right now.
const kitOpenMenus = [];

// A tool calls this on lock: closes every open kit menu and detaches its listeners.
function kitCloseMenus() {
  for (const close of kitOpenMenus.slice()) close();
}

// A link that leaves the page can ask first. beforeLeave(href) returns a Promise:
// true follows the link, false stays. A modified click (new tab) is left alone.
function kitGuardLink(a, beforeLeave) {
  if (typeof beforeLeave !== 'function') return a;
  a.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const href = a.href;
    Promise.resolve(beforeLeave(href)).then(go => { if (go) window.location.assign(href); });
  });
  return a;
}

// opts.beforeLeave: see kitGuardLink; asked before any tool link is followed.
function kitToolsMenu(currentId, lang, opts) {
  const beforeLeave = opts && opts.beforeLeave;
  const ru = lang === 'ru';
  const wrap = document.createElement('span');
  wrap.className = 'kit-tool-wrap';
  wrap.setAttribute('data-kit-menu', '');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kit-hbtn';
  btn.textContent = ru ? 'Инструменты' : 'Tools';
  btn.setAttribute('aria-expanded', 'false');
  const list = document.createElement('ul');
  list.className = 'kit-menu';
  list.hidden = true;
  for (const t of KIT_TOOLS) {
    const li = document.createElement('li');
    let item;
    if (t.id === currentId) {
      item = document.createElement('span');
      item.setAttribute('aria-current', 'page');
    } else {
      item = document.createElement('a');
      item.setAttribute('href', t.href);
      kitGuardLink(item, beforeLeave);
    }
    item.textContent = ru ? t.ru : t.en;
    li.appendChild(item);
    list.appendChild(li);
  }
  function close(refocus) {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onDoc);
    const i = kitOpenMenus.indexOf(close);
    if (i >= 0) kitOpenMenus.splice(i, 1);
    if (refocus === true && btn.isConnected) btn.focus();
  }
  function open() {
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDoc);
    kitOpenMenus.push(close);
  }
  function onKey(e) { if (e.key === 'Escape') close(true); }
  function onDoc(e) { if (!wrap.contains(e.target)) close(); }
  btn.addEventListener('click', e => { e.stopPropagation(); if (list.hidden) open(); else close(); });
  list.addEventListener('click', e => { if (e.target.closest && e.target.closest('a')) close(); });
  wrap.addEventListener('focusout', e => {
    if (!list.hidden && e.relatedTarget && !wrap.contains(e.relatedTarget)) close();
  });
  wrap.appendChild(btn);
  wrap.appendChild(list);
  return wrap;
}
