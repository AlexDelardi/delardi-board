// Delardi UI kit: tool switcher. No dependencies. Inlined ahead of each tool's own modules.
const KIT_TOOLS = [
  { id: 'sales', href: '../sales/', en: 'Sales', ru: 'Продажи' },
  { id: 'crm', href: '../crm/', en: 'Clients', ru: 'Клиенты' },
  { id: 'catalogue', href: '../catalogue/', en: 'Catalogue', ru: 'Каталог' },
  { id: 'board', href: '../board/', en: 'Board', ru: 'Доска' },
];

function kitToolsMenu(currentId, lang) {
  const ru = lang === 'ru';
  const wrap = document.createElement('span');
  wrap.className = 'kit-tool-wrap';
  wrap.setAttribute('data-kit-menu', '');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kit-hbtn';
  btn.textContent = ru ? 'Инструменты' : 'Tools';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  const list = document.createElement('ul');
  list.className = 'kit-menu';
  list.setAttribute('role', 'menu');
  list.hidden = true;
  for (const t of KIT_TOOLS) {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const label = ru ? t.ru : t.en;
    let item;
    if (t.id === currentId) {
      item = document.createElement('span');
      item.setAttribute('aria-current', 'page');
    } else {
      item = document.createElement('a');
      item.setAttribute('href', t.href);
    }
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    li.appendChild(item);
    list.appendChild(li);
  }
  function setOpen(open) {
    list.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      document.addEventListener('keydown', onKey);
      document.addEventListener('click', onDoc);
    } else {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDoc);
    }
  }
  function onKey(e) { if (e.key === 'Escape') { setOpen(false); btn.focus(); } }
  function onDoc(e) { if (!wrap.contains(e.target)) setOpen(false); }
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(list.hidden); });
  wrap.appendChild(btn);
  wrap.appendChild(list);
  return wrap;
}
