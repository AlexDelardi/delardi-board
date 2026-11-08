"""Rebuild and compare generated pages, restoring originals if a build drifts."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
failed = False
for tool in ('crm', 'catalogue'):
    page = root / tool / 'index.html'
    before = page.read_bytes()
    try:
        subprocess.run([sys.executable, str(root / tool / 'src/build.py')], check=True)
        if page.read_bytes() != before:
            failed = True
            print(f'FAIL {tool}: generated page differs; rebuild and include it in the change.')
        else:
            print(f'PASS {tool}: generated page matches source.')
    finally:
        page.write_bytes(before)
sys.exit(1 if failed else 0)
