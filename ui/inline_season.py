# Puts ui/season.js, images included, into the page that has no build of its own: the tools hub (index.html). Run it from anywhere after changing ui/season.js or an image: python3 ui/inline_season.py
import pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from season_art import season_js

ROOT = pathlib.Path(__file__).resolve().parent.parent
A, B = '/* ---- ui/season.js (built by ui/inline_season.py) ---- */', '/* ---- end ui/season.js ---- */'
block = A + '\n' + season_js().rstrip('\n') + '\n' + B
for rel in ['index.html']:
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    if A in s:
        s = s[:s.index(A)] + block + s[s.index(B) + len(B):]
    else:
        i = s.index('<script>') + len('<script>\n')
        s = s[:i] + block + '\n' + s[i:]
    p.write_text(s, encoding='utf-8', newline='\n')
    print('season.js written into', rel)
