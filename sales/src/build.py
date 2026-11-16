# Builds sales/index.html: one self-contained file — the page, its script and the
# brand marks as data URIs. Run it from this folder: python3 build.py
# Same mechanism as crm/src/build.py.
import base64, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
CANDIDATES = [HERE.parent.parent / 'brand', pathlib.Path('/mnt/user-data/uploads/delardi-board/brand')]
B = next((p for p in CANDIDATES if (p / 'wordmark_white.png').exists()), None)
if B is None:
    sys.exit('brand marks not found — looked in: ' + ', '.join(str(p) for p in CANDIDATES))
uri = lambda f: 'data:image/png;base64,' + base64.b64encode((B / f).read_bytes()).decode()

t = (HERE / 'template.html').read_text(encoding='utf-8')
js = (HERE / 'app.js').read_text(encoding='utf-8')
# In this order, before the init marker. The later ones arrive with Task 8;
# whatever is not there yet is skipped, and the build says so.
MODULES = ['sale.js', 'pay.js', 'crmshim.js', '../../crm/src/addclient.js', 'client.js', 'tickets.js', 'admin.js']
parts = []
for m in MODULES:
    f = (HERE / m).resolve()
    if not f.exists():
        print('note: skipped', m, '(not there yet)')
        continue
    parts.append(f.read_text(encoding='utf-8'))
MARK = '/* -------------------------------------------------------------------- init */'
assert js.count(MARK) == 1, 'init marker must appear exactly once in app.js'
js = js.replace(MARK, '\n'.join(parts) + '\n' + MARK)

TOKENS = {
    '__WORDMARK__': uri('wordmark_white.png'),
    '__FAVICON__': uri('favicon.png'),
    '__MONO_NAVY__': uri('monogram_navy.png'),
    '__MONO_WHITE__': uri('monogram_white.png'),
}
for k, v in TOKENS.items():
    t = t.replace(k, v)
    js = js.replace(k, v)
assert t.count('__SCRIPT__') == 1
out = t.replace('__SCRIPT__', js)
for tok in list(TOKENS) + ['__SCRIPT__']:
    assert tok not in out, tok

# In the repository the page sits one level up (sales/index.html); in a loose
# workspace it goes to dist/, so nothing is written over by accident.
dest = HERE.parent / 'index.html' if (HERE.parent / 'index.html').exists() or HERE.name == 'src' else None
if dest is None:
    (HERE / 'dist').mkdir(exist_ok=True)
    dest = HERE / 'dist' / 'index.html'
dest.write_text(out, encoding='utf-8', newline='\n')
print('built', dest, len(out), 'bytes')
