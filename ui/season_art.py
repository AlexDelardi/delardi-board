# The Christmas images for ui/season.js, as data URIs. Every tool's build calls season_inline() on its script, and
# ui/inline_season.py does the same for the two pages kept by hand (the tools hub and the Board).
import base64, pathlib

ART = pathlib.Path(__file__).resolve().parent.parent / 'brand' / 'christmas'
TOKENS = {
    '__XMAS_SPRIG__': 'fir-sprig.png',
    '__XMAS_FLAKE__': 'geometric-snowflake.png',
    '__XMAS_MINI__': 'mini-snowflake.png',
    '__XMAS_BAND__': 'snowflake-band.png',
    '__XMAS_TREE__': 'christmas-tree.png',
}

def season_inline(js: str) -> str:
    for tok, f in TOKENS.items():
        js = js.replace(tok, 'data:image/png;base64,' + base64.b64encode((ART / f).read_bytes()).decode())
    return js

def season_js() -> str:
    return season_inline((pathlib.Path(__file__).resolve().parent / 'season.js').read_text(encoding='utf-8'))
