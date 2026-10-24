#!/usr/bin/env python3
"""Compute or verify the exact offline snapshot; no network access."""
from pathlib import Path
import sys,json,re,hashlib
root=Path(__file__).resolve().parents[1];site=root/'site'
paths=['index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png']
if sys.argv[1:] == ['--verify']:
 data=json.loads((site/'release.json').read_text());assert data['format']==1
 assert {f['path'] for f in data['files']}==set(paths)
 for f in data['files']:
  content=(site/f['path']).read_bytes()
  assert len(content)==f['bytes'] and hashlib.sha256(content).hexdigest()==f['sha256'],f['path']
 assert ('content="'+data['version']+'"') in (site/'index.html').read_text()
 print('Release verified:',data['version'])
else:
 if len(sys.argv)!=2 or not re.fullmatch(r'[a-zA-Z0-9._-]{1,80}',sys.argv[1]):raise SystemExit('Usage: update-release.py VERSION | --verify')
 version=sys.argv[1];html=(site/'index.html').read_text()
 html=re.sub(r'(<meta name="offline-app-version" content=")[^"]+(">)',lambda m:m[1]+version+m[2],html)
 for name in ['index.html','learning.html','install.html']:(site/name).write_text(html)
 files=[]
 for name in paths:
  data=(site/name).read_bytes();files.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 (site/'release.json').write_text(json.dumps({'format':1,'version':version,'files':files},indent=2)+'\n')
 print('Release generated:',version)
