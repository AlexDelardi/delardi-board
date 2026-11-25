# Puts ui/hub.js (the single sign-in) into the home page (index.html), which has no build of its own. The tools get it
# through their own builds. Run it from anywhere after changing ui/hub.js:  python3 ui/inline_hub.py
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
A, B = '/* ---- ui/hub.js (built by ui/inline_hub.py) ---- */', '/* ---- end ui/hub.js ---- */'
block = A + '\n' + (ROOT / 'ui' / 'hub.js').read_text(encoding='utf-8').rstrip('\n') + '\n' + B
p = ROOT / 'index.html'
s = p.read_text(encoding='utf-8')
if A in s:
    s = s[:s.index(A)] + block + s[s.index(B) + len(B):]
else:
    i = s.index('<script>') + len('<script>\n')
    s = s[:i] + block + '\n' + s[i:]
p.write_text(s, encoding='utf-8', newline='\n')
print('hub.js written into index.html')
