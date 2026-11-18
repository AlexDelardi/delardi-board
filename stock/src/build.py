# Builds stock/index.html: one self-contained file — the page, its script and the
# brand marks as data URIs. Run it from this folder: python3 build.py
# Same mechanism as sales/src/build.py.
import base64, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
CANDIDATES = [HERE.parent.parent / 'brand', pathlib.Path('/mnt/user-data/uploads/delardi-board/brand')]
B = next((p for p in CANDIDATES if (p / 'wordmark_white.svg').exists()), None)
if B is None:
    sys.exit('brand marks not found — looked in: ' + ', '.join(str(p) for p in CANDIDATES))
uri = lambda f: ('data:image/svg+xml;base64,' if f.endswith('.svg') else 'data:image/png;base64,') + base64.b64encode((B / f).read_bytes()).decode()

t = (HERE / 'template.html').read_text(encoding='utf-8')
js = (HERE / 'app.js').read_text(encoding='utf-8')
# The shared UI kit (ui/kit.css, ui/tools.js, ui/xlsx.js) is inlined, never copied into this folder.
KIT = HERE.parent.parent / 'ui'
assert (KIT / 'kit.css').exists() and (KIT / 'tools.js').exists() and (KIT / 'xlsx.js').exists(), 'ui/kit.css, ui/tools.js and ui/xlsx.js must exist'
assert t.count('/*__KIT_CSS__*/') == 1, 'the kit marker must appear exactly once in template.html'
t = t.replace('/*__KIT_CSS__*/', (KIT / 'kit.css').read_text(encoding='utf-8'))
# In this order, before the init marker. piece.js (Task 4), review.js (Task 5)
# and export.js (Task 6) arrive later; whatever is not there yet is skipped.
# ui/xlsx.js (the kit's workbook writer) goes in just before export.js.
MODULES = ['../../ui/tools.js', 'list.js', 'piece.js', 'more.js', 'review.js', '../../ui/xlsx.js', 'export.js', '../../ui/xlsxread.js', 'import.js']
parts = []
for m in MODULES:
    f = (HERE / m).resolve()
    if not f.exists():
        assert 'ui/' not in m and m not in ('list.js', 'export.js'), m + ' is required'
        print('note: skipped', m, '(not there yet)')
        continue
    parts.append(f.read_text(encoding='utf-8'))
MARK = '/* -------------------------------------------------------------------- init */'
assert js.count(MARK) == 1, 'init marker must appear exactly once in app.js'
js = js.replace(MARK, '\n'.join(parts) + '\n' + MARK)

TOKENS = {
    '__WORDMARK__': uri('wordmark_white.svg'),   # vector master, DELARDI alone (crisp at header size)
    '__FAVICON__': uri('favicon.png'),
}
for k, v in TOKENS.items():
    t = t.replace(k, v)
    js = js.replace(k, v)
assert t.count('__SCRIPT__') == 1
out = t.replace('__SCRIPT__', js)
for tok in list(TOKENS) + ['__SCRIPT__']:
    assert tok not in out, tok

# In the repository the page sits one level up (stock/index.html); in a loose
# workspace it goes to dist/, so nothing is written over by accident.
dest = HERE.parent / 'index.html' if (HERE.parent / 'index.html').exists() or HERE.name == 'src' else None
if dest is None:
    (HERE / 'dist').mkdir(exist_ok=True)
    dest = HERE / 'dist' / 'index.html'
dest.write_text(out, encoding='utf-8', newline='\n')
print('built', dest, len(out), 'bytes')
