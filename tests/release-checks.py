#!/usr/bin/env python3
"""Exercise the actual release verifier against entrypoint/source drift."""
from pathlib import Path
import shutil,subprocess,sys,tempfile
root=Path(__file__).resolve().parents[1]

def verify(base):
 return subprocess.run([sys.executable,str(base/'scripts/update-release.py'),'--verify'],text=True,capture_output=True)

assert verify(root).returncode==0,'The original release must pass before negative checks'
for target,expected in [('site/install.html','install.html'),('site/learning.html','learning.html'),('src/service-worker.js','Service Worker')]:
 with tempfile.TemporaryDirectory(prefix='pwa-release-check-') as folder:
  base=Path(folder)
  shutil.copytree(root/'site',base/'site')
  (base/'scripts').mkdir();shutil.copy(root/'scripts/update-release.py',base/'scripts/update-release.py')
  (base/'src').mkdir();shutil.copy(root/'src/service-worker.js',base/'src/service-worker.js')
  with (base/target).open('ab') as file:file.write(b'\n<!-- intentional test drift -->\n')
  result=verify(base)
  assert result.returncode!=0,f'{target}: verifier incorrectly accepted drift'
  assert expected in result.stderr,f'{target}: verifier failed for an unrelated reason: {result.stderr}'
  print('Rejected expected drift:',target)
print('Release guard checks passed; published files were not modified.')
