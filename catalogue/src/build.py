# Builds catalogue/index.html: one self-contained file — the page, its script
# and the brand marks as data URIs. Run it from this folder: python3 build.py
import base64, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
CANDIDATES = [HERE.parent.parent / 'brand', pathlib.Path('/mnt/user-data/uploads/delardi-board/brand')]
B = next((p for p in CANDIDATES if (p / 'wordmark_white.png').exists()), None)
if B is None:
    sys.exit('brand marks not found — looked in: ' + ', '.join(str(p) for p in CANDIDATES))
uri = lambda f: 'data:image/png;base64,' + base64.b64encode((B / f).read_bytes()).decode()

t = (HERE / 'template.html').read_text(encoding='utf-8')
js = (HERE / 'app.js').read_text(encoding='utf-8')
MODULES = ['model.js', 'floor.js']
MARK = '/* -------------------------------------------------------------------- init */'
assert js.count(MARK) == 1
js = js.replace(MARK, '\n'.join((HERE / m).read_text(encoding='utf-8') for m in MODULES) + '\n' + MARK)
for tok, f in [('__WORDMARK__', 'wordmark_white.png'), ('__MONO_NAVY__', 'monogram_navy.png'), ('__MONO_WHITE__', 'monogram_white.png')]:
    js = js.replace(tok, uri(f))
t = t.replace('__FAVICON__', uri('favicon.png')).replace('__MONO_NAVY__', uri('monogram_navy.png')).replace('__MONO_WHITE__', uri('monogram_white.png'))
out = t.replace('__SCRIPT__', js)
for tok in ['__WORDMARK__', '__FAVICON__', '__MONO_NAVY__', '__MONO_WHITE__', '__SCRIPT__']:
    assert tok not in out, tok

dest = HERE.parent / 'index.html'
dest.write_text(out, encoding='utf-8', newline='\n')
print('built', dest, len(out), 'bytes')
