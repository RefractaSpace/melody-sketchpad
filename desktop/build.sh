#!/bin/bash
# public/ 를 앱에 담고(피아노 녹음은 빼고 서버에서 받게), Windows 설치 프로그램(.exe)으로 묶어요.
set -e
cd "$(dirname "$0")"
rm -rf app && mkdir app
cp -r ../public/. app/ && rm -rf app/assets app/piano*.js app/og.png
python3 - <<'PY'
p='app/index.html'; h=open(p,encoding='utf-8').read()
h=h.replace('<script>window.PIANO_SRC = "piano.js";','<script>window.MSK_SERVER = "https://melody-sketchpad.vercel.app"; window.PIANO_SRC = "piano.js";',1)
open(p,'w',encoding='utf-8').write(h)
PY
grep -q 'MSK_SERVER' app/index.html
[ -d node_modules/electron-builder ] || npm install --no-audit --no-fund --loglevel=error
npx electron-builder --win nsis --x64 --publish never
ls -la dist/*.exe dist/latest.yml
